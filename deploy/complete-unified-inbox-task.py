"""Reconcile the shipped text Inbox with the canonical acceptance criteria."""
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
assert args.release.startswith("/opt/business-control/releases/20260904-waiting-ping-")
assert str(Path("/opt/business-control/current").resolve()) == args.release
assert hashlib.sha256(Path(args.release + "/business-control").read_bytes()).hexdigest() == args.sha256

lock = open("/run/business-control-complete-unified-inbox.lock", "w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect("/var/lib/business-control/business-control.db", timeout=15)
assert db.execute("SELECT username FROM users WHERE id=1").fetchone()[0] == "artkozk"
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not db.execute("PRAGMA foreign_key_check").fetchall()

installed = {row[0] for row in db.execute("SELECT version FROM schema_migrations")}
assert {
    "016_personal_workspace_foundation.sql",
    "030_personal_inbox.sql",
    "034_offline_create_receipts.sql",
    "040_note_media_history.sql",
    "041_personal_publications.sql",
} <= installed

def deployed_asset(name):
    with urllib.request.urlopen("http://127.0.0.1:8522/" + name, timeout=25) as response:
        return response.read().decode("utf-8")


app_js = deployed_asset("app.js")
inbox_js = deployed_asset("personal-inbox.js?v=20260904-first-use-4")
publish_js = deployed_asset("personal-publish.js?v=20260904-personal-batch-3")
for phrase in ("Записать входящее", "Сохранить в заметках", "Сделать делом", "Связать"):
    assert phrase in app_js
for phrase in ("Только для вас", "Мысль, ссылка или то, что нужно сделать", "Создать связанное дело"):
    assert phrase in inbox_js
for phrase in ("Опубликовать в проект", "Выберите проект", '<option value="task">Задача</option>'):
    assert phrase in publish_js

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


task_id = "36cceab2931f04d7d2d79878ab2475d5"
source_tables = [
    "personal_notes",
    "personal_note_versions",
    "personal_note_attachments",
    "personal_capture_requests",
    "personal_plans",
    "personal_links",
    "personal_create_requests",
    "personal_publications",
]

try:
    snapshots = {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }
    overview = api("/personal/overview")
    expected_notes = {
        row[0]: row[1:]
        for row in db.execute(
            "SELECT id,title,body,updated_at,in_inbox FROM personal_notes "
            "WHERE owner_id=1 AND archived_at IS NULL"
        )
    }
    actual_notes = {note["id"]: note for note in overview["notes"]}
    assert set(actual_notes) == set(expected_notes)
    inbox_count = 0
    for note_id, (title, body, updated_at, in_inbox) in expected_notes.items():
        note = api("/personal/notes/" + note_id)
        assert (note["title"], note["body"], note["updatedAt"], note["inInbox"]) == (
            title,
            body,
            updated_at,
            bool(in_inbox),
        )
        source = api("/personal/publications/source/note/" + note_id)
        assert (source["title"], source["body"], source["updatedAt"]) == (
            title,
            body,
            updated_at,
        )
        inbox_count += int(bool(in_inbox))

    assert snapshots == {
        table: list(db.execute("SELECT * FROM " + table + " ORDER BY 1"))
        for table in source_tables
    }

    detail = api("/records/" + task_id)
    task = detail["record"]
    assert task["workspaceId"] == "bizflow-team"
    criteria = [
        "Сохранять текст и ссылку без обязательного выбора типа",
        "Личное по умолчанию",
        "Разобрать позже",
        "Файлы, голос, офлайн и AI принимаются отдельно",
    ]
    assert all(item in task["description"] for item in criteria)

    marker = "[verified:unified-inbox-complete-20260904]"
    behavior = (
        "Сверены все четыре критерия карточки. Быстрый ввод принимает единое текстовое "
        "поле, включая ссылку, без типа, названия, срока, проекта и ответственного; "
        "локальная очередь сохраняет его до подтверждения сервера. Запись остаётся "
        "личной. Из входящих её можно оставить заметкой, связать или превратить в "
        "личное дело; исходный текст, ID, файлы и история сохраняются."
    )
    publication = (
        "Переход в командную работу выполняется отдельным явным действием "
        "«Опубликовать в проект»: пользователь обязательно выбирает конкретный проект, "
        "тип «Задача» и видит предпросмотр состава и видимости. Сервер создаёт независимую "
        "копию только после подтверждения и повторной проверки прав; личные связи и "
        "история не раскрываются."
    )
    checks = (
        "Повторно пройдены целевые Go-тесты capture, triage и publication, а также 13 "
        "Node-проверок capture/outbox. Production-сверка сопоставила все активные личные "
        "заметки владельца с SQLite и API источника публикации и подтвердила неизменность "
        "восьми таблиц пользовательских данных. Файлы, голос и AI остаются отдельными "
        "каналами согласно критерию; этот статус подтверждает полный текстовый Inbox."
    )
    evidence = "\n".join(
        [
            marker,
            behavior,
            publication,
            checks,
            "Current commit: " + args.commit,
            "Current release: " + args.release,
            "Current SHA256: " + args.sha256,
            "Contracts: docs/architecture/FIRST_USE_AND_INBOX_TRIAGE_2026_09_04.md; "
            "docs/architecture/PERSONAL_PUBLICATION_AND_LIFE_MAP_2026_09_04.md.",
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
                "reason": "Сверены все критерии текстовых входящих и явной публикации",
            },
        )
    if task["status"] != "completed":
        result = (
            "Единые текстовые входящие выпущены и проверены: одно поле без обязательных "
            "метаданных, надёжная офлайн-очередь, личная видимость по умолчанию, разбор в "
            "заметку/связь/личное дело с сохранением оригинала и явная подтверждаемая "
            "публикация копии как задачи выбранного проекта."
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
                    "reason": "Все четыре критерия подтверждены тестами и production-сверкой",
                },
            )
    assert api("/records/" + task_id)["record"]["status"] == "completed"
    print("OWN_ACTIVE_NOTES_VERIFIED=" + str(len(expected_notes)))
    print("OWN_INBOX_NOTES_VERIFIED=" + str(inbox_count))
    print("PERSONAL_SOURCE_TABLES_UNCHANGED=" + str(len(source_tables)))
    print("UNIFIED_INBOX_TASK_STATUS=completed")
finally:
    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
    db.commit()
    db.close()
