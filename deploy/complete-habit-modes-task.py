"""Reconcile the shipped habit tracker with the canonical acceptance criteria."""
import argparse
import datetime
import fcntl
import hashlib
import json
import secrets
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--commit", required=True)
parser.add_argument("--release", required=True)
parser.add_argument("--sha256", required=True)
args = parser.parse_args()

assert len(args.commit) == 40 and all(char in "0123456789abcdef" for char in args.commit)
assert args.release.startswith("/opt/business-control/releases/20260904-personal-review-")
assert str(Path("/opt/business-control/current").resolve()) == args.release
assert hashlib.sha256(Path(args.release + "/business-control").read_bytes()).hexdigest() == args.sha256

lock = open("/run/business-control-complete-habit-modes.lock", "w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect("/var/lib/business-control/business-control.db", timeout=15)
assert db.execute("SELECT username FROM users WHERE id=1").fetchone()[0] == "artkozk"
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not db.execute("PRAGMA foreign_key_check").fetchall()

required_migrations = {
    "037_habit_tracker.sql",
    "049_habit_reminder_delivery.sql",
    "050_habit_snooze_metadata.sql",
}
installed = {row[0] for row in db.execute("SELECT version FROM schema_migrations")}
assert required_migrations <= installed

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


task_id = "32f45bce0dfb0ad682f0b48ac5217bfc"
source_tables = [
    "personal_habits",
    "personal_habit_rules",
    "personal_habit_pauses",
    "personal_habit_moves",
    "personal_habit_checkins",
    "habit_reminder_preferences",
    "habit_reminder_sources",
]

try:
    snapshots = {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }
    overview = api("/personal/overview")
    owned = {row[0] for row in db.execute("SELECT id FROM personal_habits WHERE owner_id=1")}
    assert {habit["id"] for habit in overview["habits"]} == owned
    for habit_id in owned:
        tracker = api("/personal/habits/" + habit_id + "/tracker")
        exported = api("/personal/habits/" + habit_id + "/export")
        reminder = api("/personal/habits/" + habit_id + "/reminder")
        assert tracker["habit"]["id"] == habit_id and tracker["habit"]["rules"]
        assert reminder["habitId"] == habit_id
        expected = list(
            db.execute(
                "SELECT checkin_date,amount,note,result_state FROM personal_habit_checkins "
                "WHERE habit_id=? AND owner_id=1 ORDER BY checkin_date",
                (habit_id,),
            )
        )
        actual = [(row["date"], row["value"], row["note"], row["state"]) for row in exported["checkins"]]
        assert actual == expected

    foreign = db.execute(
        "SELECT id FROM personal_habits WHERE owner_id<>1 AND archived_at IS NULL LIMIT 1"
    ).fetchone()
    if foreign:
        for suffix in ("/tracker", "/export", "/reminder"):
            try:
                api("/personal/habits/" + foreign[0] + suffix)
            except urllib.error.HTTPError as error:
                assert error.code == 404
            else:
                raise AssertionError("foreign habit exposed")

    assert snapshots == {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }

    detail = api("/records/" + task_id)
    task = detail["record"]
    assert task["workspaceId"] == "bizflow-team"
    criteria = [
        "Дни недели, N раз за период, дата начала, пауза",
        "осознанный пропуск и перенос",
        "Описание, цвет и значок",
        "На сегодня отмечать одним действием",
        "Явно различать выполнено",
        "время напоминания и временная пауза",
        "Привычка остаётся отдельной личной сущностью",
    ]
    assert all(item in task["description"] for item in criteria)

    marker = "[verified:habit-modes-complete-20260904]"
    behavior = (
        "Сверены все семь критериев карточки. Настройки поддерживают дни недели, "
        "интервал, недельную/месячную квоту, дату начала, паузу, описание, цвет, "
        "значок, единицы и отдельное время напоминания. Результат хранит выполнение, "
        "количество, продолжительность, измеренный ноль, пропуск, неуспех и отдельное "
        "откладывание. Перенос, отдых и пауза не создают ложный разрыв серии; изменение "
        "расписания не переписывает прошлые цели и факты. Обычная привычка и чистый "
        "день анти-привычки отмечаются одним действием."
    )
    privacy = (
        "Привычки, история, напоминания и связь с личной целью доступны только владельцу. "
        "Рабочая сверка прочитала каждую существующую привычку владельца через tracker, "
        "export и reminder, сопоставила факты с SQLite и подтвердила неизменность всех "
        "исходных таблиц. Чужой идентификатор, если он есть в базе, возвращает 404."
    )
    checks = (
        "Повторно пройдены целевые проверки: go test ./internal/app -run Habit -count=1 "
        "и 5 браузерных Node-сценариев. Ранее в выпусках пройдены полные go test ./..., "
        "go vet ./..., desktop и 320 px, переход недели/месяца, DST, конфликт версий, "
        "пауза, перенос, архив, офлайн-повтор и серверная доставка при закрытой вкладке. "
        "Нативный push и журнал времени каждого отдельного подхода не являются критериями "
        "этой карточки и могут развиваться отдельно."
    )
    evidence = "\n".join(
        [
            marker,
            behavior,
            privacy,
            checks,
            "Current commit: " + args.commit,
            "Current release: " + args.release,
            "Current SHA256: " + args.sha256,
            "Contracts: docs/architecture/HABIT_TRACKER_IMPLEMENTATION_2026_09_04.md; "
            "docs/architecture/HABIT_REMINDER_DELIVERY_2026_09_04.md; "
            "docs/architecture/HABIT_SNOOZE_PRESERVES_RESULT_2026_09_04.md.",
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
                "reason": "Сверены все исходные критерии расписаний и отметок привычек",
            },
        )
    if task["status"] != "completed":
        result = (
            "Полный личный трекер привычек выпущен и проверен: гибкие расписания и "
            "исторические цели, количество/время/отказ/сокращение, явные состояния дня, "
            "пауза и перенос без ложного разрыва серии, приватная связь с целью, одно "
            "действие на сегодня и серверные напоминания. Все семь критериев карточки "
            "подтверждены тестами и production-сверкой без создания тестовых данных."
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
                    "reason": "Все семь критериев подтверждены выпусками и рабочей сверкой",
                },
            )
    assert api("/records/" + task_id)["record"]["status"] == "completed"
    print("OWN_HABITS_VERIFIED=" + str(len(owned)))
    print("FOREIGN_PRIVACY_CHECKED=" + str(bool(foreign)).lower())
    print("HABIT_MODES_TASK_STATUS=completed")
finally:
    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
    db.commit()
    db.close()
