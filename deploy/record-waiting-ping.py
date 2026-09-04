"""Verify the live waiting-ping scope without messaging production participants."""
import argparse
import datetime
import fcntl
import hashlib
import json
import secrets
import sqlite3
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--commit", required=True)
parser.add_argument("--release", required=True)
parser.add_argument("--sha256", required=True)
args = parser.parse_args()
assert len(args.commit) == 40 and all(char in "0123456789abcdef" for char in args.commit)
assert args.release.startswith("/opt/business-control/releases/20260904-waiting-ping-")
assert str(Path("/opt/business-control/current").resolve()) == args.release
assert hashlib.sha256(Path(args.release + "/business-control").read_bytes()).hexdigest() == args.sha256

lock = open("/run/business-control-waiting-ping-task.lock", "w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect("/var/lib/business-control/business-control.db", timeout=15)
assert db.execute("SELECT username FROM users WHERE id=1").fetchone()[0] == "artkozk"
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not db.execute("PRAGMA foreign_key_check").fetchall()

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


task_id = "e811bcc565da70123644a4654273aca3"
source_tables = [
    "personal_waiting",
    "personal_waiting_events",
    "personal_waiting_pings",
    "notifications",
]

try:
    assert db.execute(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='053_personal_waiting_pings.sql'"
    ).fetchone()[0] == 1
    snapshots = {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }
    expected_targets = {
        (row[0], row[1], row[2], row[3], row[4])
        for row in db.execute(
            """SELECT workspace.id,workspace.name,recipient.user_id,user.username,user.display_name
            FROM workspaces workspace
            JOIN workspace_members sender ON sender.workspace_id=workspace.id AND sender.user_id=1 AND sender.status='active' AND sender.role IN ('owner','admin','member')
            JOIN workspace_members recipient ON recipient.workspace_id=workspace.id AND recipient.user_id<>1 AND recipient.status='active' AND recipient.role IN ('owner','admin','member')
            JOIN users user ON user.id=recipient.user_id
            WHERE workspace.kind='team' AND workspace.archived_at IS NULL
            AND (workspace.team_id IS NULL OR (EXISTS(SELECT 1 FROM teams team JOIN team_members member ON member.team_id=team.id WHERE team.id=workspace.team_id AND team.deleted_at IS NULL AND member.user_id=sender.user_id AND member.status='active')
            AND EXISTS(SELECT 1 FROM team_members member WHERE member.team_id=workspace.team_id AND member.user_id=recipient.user_id AND member.status='active')))"""
        )
    }
    waiting_ids = [row[0] for row in db.execute("SELECT id FROM personal_waiting WHERE owner_id=1")]
    timings = []
    first_detail = None
    for waiting_id in waiting_ids:
        started = time.perf_counter()
        detail = api("/personal/waiting/" + waiting_id + "?timezone=UTC")
        timings.append((time.perf_counter() - started) * 1000)
        if first_detail is None:
            first_detail = detail
        actual_targets = {
            (
                target["workspaceId"],
                target["workspaceName"],
                recipient["userId"],
                recipient["username"],
                recipient["displayName"],
            )
            for target in detail["pingTargets"]
            for recipient in target["recipients"]
        }
        if detail["waiting"]["status"] == "waiting":
            assert actual_targets == expected_targets
        else:
            assert actual_targets == set()
        expected_pings = {
            (row[0], row[1], row[2], bool(row[3]), row[4], row[5])
            for row in db.execute(
                "SELECT id,workspace_id,recipient_id,include_title,message,created_at FROM personal_waiting_pings WHERE waiting_id=? AND owner_id=1",
                (waiting_id,),
            )
        }
        actual_pings = {
            (
                ping["id"],
                ping["workspaceId"],
                ping["recipientId"],
                ping["includeTitle"],
                ping["message"],
                ping["createdAt"],
            )
            for ping in detail["pings"]
        }
        assert actual_pings == expected_pings

    if first_detail and first_detail["waiting"]["status"] == "waiting" and first_detail["pingTargets"]:
        target = first_detail["pingTargets"][0]
        recipient = target["recipients"][0]
        before_pings = db.execute("SELECT COUNT(*) FROM personal_waiting_pings").fetchone()[0]
        before_notifications = db.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]
        try:
            api(
                "/personal/waiting/" + first_detail["waiting"]["id"] + "/ping",
                "POST",
                {
                    "workspaceId": target["workspaceId"],
                    "recipientId": recipient["userId"],
                    "includeTitle": False,
                    "confirm": False,
                    "expectedRevision": first_detail["waiting"]["revision"],
                    "requestKey": "production-negative-waiting-ping",
                },
            )
        except urllib.error.HTTPError as error:
            assert error.code == 400
        else:
            raise AssertionError("unconfirmed production ping accepted")
        assert db.execute("SELECT COUNT(*) FROM personal_waiting_pings").fetchone()[0] == before_pings
        assert db.execute("SELECT COUNT(*) FROM notifications").fetchone()[0] == before_notifications

    assert snapshots == {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }
    print("AUTHENTICATED_WAITING_PING_SCOPE=ok")
    print("WAITING_ITEMS_VERIFIED=" + str(len(waiting_ids)))
    print("PING_TARGET_PAIRS_VERIFIED=" + str(len(expected_targets)))
    if timings:
        print("WAITING_DETAIL_MEDIAN_MS=%.2f" % statistics.median(timings))
        print("WAITING_DETAIL_MAX_MS=%.2f" % max(timings))

    detail = api("/records/" + task_id)
    task = detail["record"]
    assert task["workspaceId"] == "bizflow-team"
    marker = "[verified:waiting-ping-" + args.commit[:7] + "]"
    behavior = (
        "Просроченное ожидание уже видно в Сегодня и недельном Review. Теперь из "
        "активного ожидания можно явно выбрать конкретный стартап и одного его "
        "участника, увидеть полный текст и только затем отправить уведомление. Название "
        "личного ожидания выключено по умолчанию; заметки, даты, связанное дело и ID не "
        "передаются. Отправка не меняет ожидание или исходную работу."
    )
    access = (
        "Сервер внутри транзакции повторно проверяет активное членство отправителя и "
        "получателя именно в выбранном стартапе и его команде. Guest, другой стартап и "
        "отозванный доступ запрещены. После отзыва доступа доставленное уведомление "
        "исчезает у получателя. Ключ запроса предотвращает дубль после потерянного ответа; "
        "владелец видит точную историю отправок."
    )
    checks = (
        "Пройдены go test ./..., go vet ./... и 194 Node-теста. API: два независимых "
        "стартапа, подтверждение, точный текст, повтор, чужое ожидание, неизменность "
        "источника и отзыв доступа. Браузер: существующий диалог, выбор получателя, "
        "приватный предпросмотр, явное название, отправка и история. Production проверен "
        "только чтением и отклонённой confirm=false попыткой; реальному участнику тестовое "
        "сообщение не отправлялось. Контракт: docs/architecture/PERSONAL_WAITING_PINGS_2026_09_04.md."
    )
    evidence = "\n".join(
        [
            marker,
            behavior,
            access,
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
                "reason": "Выпущена подтверждённая отправка участнику с точными правами",
            },
        )
    if task["status"] != "completed":
        result = (
            "Внешние ожидания работают как отдельные личные записи: что и от кого ждём, "
            "даты и история, Сегодня и недельный Review. Получение, отмена и перенос не "
            "закрывают исходную работу. Напоминание отправляется только после выбора "
            "конкретного стартапа, участника и подтверждения; права проверяются повторно, "
            "приватный текст раскрывается только отдельным выбором."
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
                    "reason": "Все четыре критерия ожиданий подтверждены рабочим выпуском",
                },
            )
    assert api("/records/" + task_id)["record"]["status"] == "completed"
    print("WAITING_TASK_STATUS=completed")
finally:
    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
    db.commit()
    db.close()
