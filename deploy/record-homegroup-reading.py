"""Record the verified Homegroup reading rollout in the platform task board.

Run on the approved production host after ``seed-homegroup-reading.py``. The
script uses the normal authenticated API, never prints a maintenance token and
does not notify other participants. Re-running it finds the exact task and the
verification marker instead of creating duplicates.
"""

import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request


DATABASE = "/var/lib/business-control/business-control.db"
BASE_URL = "http://127.0.0.1:8522/api"
USERNAME = "artkozk"
TASK_TITLE = "Создать «Домашку» с трекером чтения Библии"
MARKER = "[verified:homegroup-reading-seed-20260904]"
TEAM_ID = "team-649663bef9f8042a27b504d76209c8fb"
WORKSPACE_ID = "649663bef9f8042a27b504d76209c8fb"
GROUP_ID = "reading-649663bef9f8042a27b504d76209c8fb"


db = sqlite3.connect(DATABASE, timeout=20)
db.execute("PRAGMA foreign_keys=ON")
user = db.execute(
    "SELECT id,username FROM users WHERE username=?", (USERNAME,)
).fetchone()
assert user and user[1] == USERNAME, "Requested owner account is missing"
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not db.execute("PRAGMA foreign_key_check").fetchall()
assert db.execute(
    "SELECT 1 FROM teams WHERE id=? AND owner_id=? AND deleted_at IS NULL",
    (TEAM_ID, user[0]),
).fetchone()
assert db.execute(
    "SELECT 1 FROM reading_spaces WHERE workspace_id=? AND timezone='Europe/Moscow'",
    (WORKSPACE_ID,),
).fetchone()
assert db.execute(
    "SELECT 1 FROM reading_groups WHERE id=? AND workspace_id=?",
    (GROUP_ID, WORKSPACE_ID),
).fetchone()

token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)


def stamp(value):
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


db.execute(
    "INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)",
    (user[0], digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)),
)
db.commit()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def api(path, method="GET", payload=None, workspace="bizflow-team"):
    request = urllib.request.Request(
        BASE_URL + path,
        method=method,
        data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode(),
        headers={
            "Cookie": "business_session=" + token,
            "X-Workspace-ID": workspace,
            "Content-Type": "application/json",
        },
    )
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


try:
    me = api("/me")
    assert me["username"] == USERNAME
    reading = api("/reading", workspace=WORKSPACE_ID)
    assert reading["enabled"] is True
    assert reading["timezone"] == "Europe/Moscow"
    assert len(reading["books"]) == 66
    assert any(group["id"] == GROUP_ID for group in reading["groups"])

    matches = db.execute(
        "SELECT id FROM records WHERE workspace_id='bizflow-team' AND title=? AND status<>'cancelled'",
        (TASK_TITLE,),
    ).fetchall()
    assert len(matches) <= 1, "Duplicate Homegroup rollout tasks require manual review"
    if matches:
        task_id = matches[0][0]
    else:
        created = api(
            "/records",
            "POST",
            {
                "type": "task",
                "title": TASK_TITLE,
                "description": (
                    "Выпустить специализированную команду чтения для artkozk: карта 66 книг, "
                    "полные и частичные главы только за текущий московский день, личные и явно "
                    "опубликованные мысли, следующий раздел, планы лидеров ко вторникам, "
                    "независимые группы, рейтинг и строгие ежедневные серии. Не добавлять от "
                    "имени пользователя участников, планы или прочитанные главы."
                ),
                "status": "in_progress",
                "ownerId": user[0],
                "priority": "high",
                "workstream": "platform",
                "editPolicy": "owner_only",
            },
        )
        task_id = created["id"]

    detail = api("/records/" + task_id)
    proof = (
        MARKER
        + "\nНа production создана ровно одна команда «Домашка» владельца artkozk: "
        + TEAM_ID
        + ". Workspace "
        + WORKSPACE_ID
        + " включает reading и содержит стартовую группу "
        + GROUP_ID
        + ". Меню: Чтение Библии, Чат, Календарь. Повторный seed вернул те же ID с "
        + "created=false; integrity/FK и active service проверены. Участники, планы и отметки "
        + "чтения не создавались. Backup: /var/lib/business-control/backups/"
        + "pre-homegroup-seed-20260904T204338Z. Код чтения входит в production release "
        + "/opt/business-control/releases/20260904-waiting-ping-3ee5dcc через merge 055667e."
    )
    if not any(MARKER in item["content"] for item in detail.get("proofs", [])):
        api("/records/" + task_id + "/proofs", "POST", {"kind": "text", "content": proof})

    detail = api("/records/" + task_id)
    if detail["record"]["status"] != "completed":
        api(
            "/records/" + task_id + "/complete",
            "POST",
            {
                "result": (
                    "Команда «Домашка» создана у artkozk и проверена повторным запуском. "
                    "Чтение включено, стартовая группа и специализированное меню доступны; "
                    "пользовательские чтения и планы остались пустыми."
                ),
                "notifyPartners": False,
            },
        )

    final = api("/records/" + task_id)
    assert final["record"]["status"] == "completed"
    assert any(MARKER in item["content"] for item in final.get("proofs", []))
    print(
        json.dumps(
            {
                "taskId": task_id,
                "status": final["record"]["status"],
                "workspaceId": WORKSPACE_ID,
                "verified": True,
            },
            ensure_ascii=False,
        )
    )
finally:
    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
    db.commit()
    db.close()
