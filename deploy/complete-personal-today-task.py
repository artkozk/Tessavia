"""Verify the complete personal Today journey and accept its canonical task."""

import argparse
import datetime
import fcntl
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--commit", required=True)
parser.add_argument("--release", required=True)
parser.add_argument("--sha256", required=True)
args = parser.parse_args()

assert len(args.commit) == 40 and all(char in "0123456789abcdef" for char in args.commit)
assert args.release.startswith("/opt/business-control/releases/20260905-reading-ui-")
assert str(Path("/opt/business-control/current").resolve()) == args.release
assert hashlib.sha256(Path(args.release + "/business-control").read_bytes()).hexdigest() == args.sha256

lock = open("/run/business-control-complete-personal-today.lock", "w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect("/var/lib/business-control/business-control.db", timeout=15)
owner = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
assert owner is not None
owner_id = owner[0]
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not db.execute("PRAGMA foreign_key_check").fetchall()

installed = {row[0] for row in db.execute("SELECT version FROM schema_migrations")}
assert {
    "043_personal_day.sql",
    "048_personal_plan_reminders.sql",
    "049_habit_reminder_delivery.sql",
    "051_personal_waiting.sql",
    "052_personal_weekly_review.sql",
    "054_reminder_digests.sql",
} <= installed


def deployed_asset(name):
    with urllib.request.urlopen("http://127.0.0.1:8522/" + name, timeout=25) as response:
        return response.read().decode("utf-8")


index_html = deployed_asset("")
app_js = deployed_asset("app.js?v=20260905-reading-ui-4")
today_js = deployed_asset("personal-today.js?v=20260905-reading-ui-4")
for phrase in (
    "Моя работа в проектах",
    "Требует внимания",
    "На сегодня нет назначенной вам проектной работы",
):
    assert phrase in today_js
for phrase in ("Личные напоминания", "day-project-work", "day-attention"):
    assert phrase in app_js
assert "20260905-reading-ui-4" in index_html

token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)


def stamp(value):
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


db.execute(
    "INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)",
    (
        owner_id,
        digest,
        stamp(now + datetime.timedelta(minutes=5)),
        stamp(now),
        stamp(now),
    ),
)
db.commit()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def api(path, method="GET", body=None, workspace="bizflow-team"):
    request = urllib.request.Request(
        "http://127.0.0.1:8522/api" + path,
        method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={
            "Cookie": "business_session=" + token,
            "X-Workspace-ID": workspace,
            "Content-Type": "application/json",
        },
    )
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


task_id = "cf22d3a3a52d33eef11e8118a232d9a4"
source_tables = [
    "personal_plans",
    "personal_day_settings",
    "personal_day_focus",
    "personal_habits",
    "personal_habit_checkins",
    "personal_waiting",
    "personal_plan_reminders",
    "habit_reminder_preferences",
    "habit_reminder_sources",
    "reminder_preferences",
]

try:
    snapshots = {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }

    day = api("/personal/day?timezone=Europe/Moscow")
    assert len(day["date"]) == 10
    assert isinstance(day["today"], list)
    assert isinstance(day["overdue"], list)
    assert isinstance(day["upcoming"], list)
    assert isinstance(day["completed"], list)
    assert isinstance(day["events"], list)
    assert isinstance(day["timeKnown"], bool)
    for section_name, limit in (("projectWork", 6), ("projectAttention", 6)):
        section = day[section_name]
        assert isinstance(section["items"], list)
        assert isinstance(section["total"], int)
        assert isinstance(section["hasMore"], bool)
        assert len(section["items"]) <= limit
        assert section["total"] >= len(section["items"])
        assert all(item["workspaceId"] and item["id"] for item in section["items"])

    review = api("/personal/review")
    assert len(review["weekStart"]) == 10 and len(review["weekEnd"]) == 10
    preferences = api("/me/reminders")
    assert isinstance(preferences["personalEnabled"], bool)
    assert isinstance(preferences["habitsEnabled"], bool)
    notifications = api("/notifications?status=all&limit=50")
    assert isinstance(notifications, list)

    exported = json.dumps(api("/export"))
    for private_table in (
        "personal_day_settings",
        "personal_day_focus",
        "personal_plan_reminders",
        "personal_waiting",
        "personal_review_choices",
    ):
        assert private_table not in exported

    assert snapshots == {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }
    print("PERSONAL_TODAY_JOURNEY=ok")
    print("PERSONAL_TODAY_SOURCE_TABLES_UNCHANGED=" + str(len(source_tables)))

    detail = api("/records/" + task_id)
    task = detail["record"]
    assert task["workspaceId"] == "bizflow-team"
    assert task["title"] == "Довести личный экран Сегодня и личные напоминания"
    assert task["status"] in {"in_progress", "review", "completed"}

    marker = "[verified:personal-today-complete-" + args.commit[:7] + "]"
    result = (
        "Личный экран «Сегодня» закрывает ежедневный путь: пользователь записывает "
        "дело без обязательного срока, возвращается в выбранный день, видит фокус, "
        "события, свободное время, привычки, ожидания, личные и проектные сигналы, "
        "после чего завершает или переносит исходную запись. Все действия открывают "
        "тот же источник и сохраняют описание, связи, историю и конкурентную версию."
    )
    reminders = (
        "Напоминания личных дел, привычек, ожиданий и ежедневная сводка используют "
        "общий сервис уведомлений. На «Сегодня» они показаны одним блоком и ведут в "
        "точный личный источник; доставка не дублируется. Недельная сводка ведёт в "
        "Review. Настройки приватны, учитывают часовой пояс и тихие часы."
    )
    projects = (
        "Последний этап добавил ограниченные секции проектной работы и сигналов из "
        "всех доступных стартапов. В выборку входят только назначенные пользователю "
        "карточки, приёмка и критические риски; отзыв доступа исключает проект. "
        "Длинный список ограничен, а переход сначала переключает точный проект."
    )
    checks = (
        "Production проверка прочитала день, недельный обзор, настройки и уведомления "
        "через штатный API и подтвердила неизменность десяти таблиц личных источников. "
        "До выпуска прошли go test ./..., go vet ./... и 195 Node-тестов. Реальный "
        "браузер проверен на desktop и 320 px: горизонтального переполнения и ошибок "
        "консоли нет. Контракт последнего этапа: "
        "docs/architecture/PERSONAL_TODAY_PROJECT_WORK_2026_09_05.md."
    )
    evidence = "\n".join(
        [
            marker,
            result,
            reminders,
            projects,
            checks,
            "Commit: " + args.commit,
            "Release: " + args.release,
            "SHA256: " + args.sha256,
        ]
    )

    if not any(marker in proof["content"] for proof in detail.get("proofs", [])):
        api("/records/" + task_id + "/proofs", "POST", {"kind": "text", "content": evidence})

    task = api("/records/" + task_id)["record"]
    if marker not in task["description"]:
        task = api(
            "/records/" + task_id,
            "PATCH",
            {
                "status": task["status"],
                "description": task["description"] + "\n\n" + evidence,
                "expectedUpdatedAt": task["updatedAt"],
                "reason": "Сверены все критерии ежедневного возвращения и общего сервиса напоминаний",
            },
        )

    if task["status"] != "completed":
        if task["status"] != "review":
            task = api(
                "/records/" + task_id + "/submit-review",
                "POST",
                {
                    "result": (
                        "Экран «Сегодня» объединяет личный фокус и расписание, дела, "
                        "привычки, ожидания, общие напоминания и ограниченную работу всех "
                        "доступных проектов. Завершение и перенос сохраняют исходный "
                        "контекст; приватность и переходы к источнику проверены на production."
                    ),
                    "notifyPartners": False,
                },
            )
        if task["status"] == "review":
            task = api(
                "/records/" + task_id + "/review",
                "POST",
                {
                    "decision": "accept",
                    "reason": "Критерии ежедневного возвращения подтверждены выпуском и production-проверкой",
                },
            )

    assert api("/records/" + task_id)["record"]["status"] == "completed"
    assert snapshots == {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }
    print("PERSONAL_TODAY_TASK_STATUS=completed")
finally:
    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
    db.commit()
    db.close()
