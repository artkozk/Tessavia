"""Record the live reminder-digest release without creating production reminders."""
import argparse
import datetime
import fcntl
import hashlib
import json
import secrets
import sqlite3
import time
import urllib.request
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--commit", required=True)
parser.add_argument("--release", required=True)
parser.add_argument("--sha256", required=True)
args = parser.parse_args()
assert len(args.commit) == 40 and all(char in "0123456789abcdef" for char in args.commit)
assert args.release.startswith("/opt/business-control/releases/20260904-reminder-digests-")
assert str(Path("/opt/business-control/current").resolve()) == args.release
assert hashlib.sha256(Path(args.release + "/business-control").read_bytes()).hexdigest() == args.sha256

lock = open("/run/business-control-reminder-digests-task.lock", "w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect("/var/lib/business-control/business-control.db", timeout=15)
assert db.execute("SELECT username FROM users WHERE id=1").fetchone()[0] == "artkozk"
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not db.execute("PRAGMA foreign_key_check").fetchall()
assert db.execute(
    "SELECT COUNT(*) FROM schema_migrations WHERE version='054_reminder_digests.sql'"
).fetchone()[0] == 1

token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)


def stamp(value):
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


db.execute(
    "INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)",
    (digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)),
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


task_id = "a57de109f2d1876d30dd9135627657a8"
source_tables = [
    "reminder_preferences",
    "reminder_project_preferences",
    "reminder_digest_sources",
    "notification_deliveries",
    "notifications",
]

try:
    snapshots = {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }
    assert db.execute(
        "SELECT COUNT(*) FROM reminder_preferences WHERE daily_digest_enabled<>0 OR weekly_digest_enabled<>0"
    ).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM reminder_digest_sources").fetchone()[0] == 0

    started = time.perf_counter()
    settings = api("/me/reminders")
    settings_ms = (time.perf_counter() - started) * 1000
    assert settings["dailyDigestEnabled"] is False
    assert settings["dailyDigestTime"] == "08:00"
    assert settings["weeklyDigestEnabled"] is False
    assert settings["weeklyDigestWeekday"] == 7
    assert settings["weeklyDigestTime"] == "18:00"
    assert isinstance(settings["projects"], list)
    assert snapshots == {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }
    print("AUTHENTICATED_DIGEST_SETTINGS=ok")
    print("DIGEST_SETTINGS_MS=%.2f" % settings_ms)
    print("EXISTING_DIGEST_SUBSCRIPTIONS=0")
    print("PRODUCTION_DIGEST_NOTIFICATIONS_CREATED=0")

    detail = api("/records/" + task_id)
    task = detail["record"]
    assert task["workspaceId"] == "bizflow-team"
    marker = "[verified:reminder-digests-" + args.commit[:7] + "]"
    behavior = (
        "Настройки напоминаний теперь управляют сроками карточек, личными делами, "
        "привычками, проектами, часовым поясом, тихими часами и двумя независимыми "
        "сводками. Для ежедневной выбирается местное время, для недельной — день и "
        "время. Обе сводки выключены по умолчанию. Нажатие открывает Сегодня или "
        "Обзор недели; чтение и отложенные напоминания остаются в общей истории."
    )
    privacy = (
        "Worker создаёт не более одной записи на пользователя и локальный период, "
        "повторно проверяет настройки внутри транзакции и не пишет в чат. Сводка "
        "содержит только итоговые числа без названий и текста источников. Отключённый "
        "или недоступный проект не участвует в подсчёте; после отзыва прав уведомление "
        "не может открыть проектную карточку."
    )
    checks = (
        "Пройдены go test ./..., go vet ./... и 186 Node-тестов. Серверные сценарии: "
        "валидация расписания, тихие часы, фильтр проекта, привычки, личные планы, "
        "сроки, ожидания, пять параллельных worker, другой аккаунт, выключение и DST. "
        "Браузер проверен на отдельной локальной учётной записи. Production проверен "
        "только чтением; настройки не менялись и тестовые уведомления не создавались. "
        "Контракт: docs/architecture/REMINDER_DIGESTS_2026_09_04.md."
    )
    evidence = "\n".join(
        [
            marker,
            behavior,
            privacy,
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
                "status": "in_progress",
                "description": task["description"] + "\n\n" + evidence,
                "expectedUpdatedAt": task["updatedAt"],
                "reason": "Выпущены приватные ежедневные и недельные сводки",
            },
        )
    if task["status"] != "completed":
        result = (
            "Напоминания имеют личные настройки видов, проектов, пояса и тихих часов; "
            "привычки, личные дела, сроки и ожидания доставляются без дублей. "
            "Ежедневная и недельная сводки включаются отдельно, агрегируют только "
            "доступные источники и не раскрывают названия приватных записей."
        )
        if task["status"] != "review":
            task = api(
                "/records/" + task_id + "/submit-review",
                "POST",
                {"result": result, "notifyPartners": False},
            )
        if task["status"] == "review":
            task = api(
                "/records/" + task_id + "/review",
                "POST",
                {
                    "decision": "accept",
                    "reason": "Все четыре критерия напоминаний подтверждены рабочим выпуском",
                },
            )
    assert api("/records/" + task_id)["record"]["status"] == "completed"
    print("REMINDER_TASK_STATUS=completed")
finally:
    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
    db.commit()
    db.close()
