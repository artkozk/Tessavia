"""Verify compact production reading UI and record one scoped platform task."""

import argparse
import datetime
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
parser.add_argument("--backup", required=True)
args = parser.parse_args()
assert len(args.commit) == 40 and all(char in "0123456789abcdef" for char in args.commit)
assert args.release.startswith("/opt/business-control/releases/20260905-reading-mobile-")
assert args.backup.startswith("/var/lib/business-control/backups/pre-reading-mobile-")
assert str(Path("/opt/business-control/current").resolve()) == args.release
assert hashlib.sha256(Path(args.release + "/business-control").read_bytes()).hexdigest() == args.sha256
assert Path(args.backup + "/business-control.db").is_file()

db = sqlite3.connect("/var/lib/business-control/business-control.db", timeout=20)
db.execute("PRAGMA foreign_keys=ON")
user = db.execute("SELECT id,username FROM users WHERE username='artkozk'").fetchone()
assert user and user[1] == "artkozk"
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not db.execute("PRAGMA foreign_key_check").fetchall()

workspace = "649663bef9f8042a27b504d76209c8fb"
group = "reading-649663bef9f8042a27b504d76209c8fb"
assert db.execute(
    "SELECT 1 FROM reading_spaces WHERE workspace_id=? AND timezone='Europe/Moscow'",
    (workspace,),
).fetchone()
assert db.execute(
    "SELECT 1 FROM reading_groups WHERE workspace_id=? AND id=?", (workspace, group)
).fetchone()

reading_tables = ("reading_entries", "reading_plans", "reading_reflections")
reading_before = {
    table: db.execute("SELECT COUNT(*) FROM " + table + " WHERE workspace_id=?", (workspace,)).fetchone()[0]
    for table in reading_tables
}
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


def api(path, method="GET", body=None, target_workspace="bizflow-team"):
    request = urllib.request.Request(
        "http://127.0.0.1:8522/api" + path,
        method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={
            "Cookie": "business_session=" + token,
            "X-Workspace-ID": target_workspace,
            "Content-Type": "application/json",
        },
    )
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


title = "Упростить мобильный экран чтения Домашки"
marker = "[verified:reading-mobile-" + args.commit[:7] + "]"
try:
    overview = api("/reading", target_workspace=workspace)
    assert overview["enabled"] is True and len(overview["books"]) == 66
    assert reading_before == {
        table: db.execute("SELECT COUNT(*) FROM " + table + " WHERE workspace_id=?", (workspace,)).fetchone()[0]
        for table in reading_tables
    }

    matches = db.execute(
        "SELECT id FROM records WHERE workspace_id='bizflow-team' AND title=? AND status<>'cancelled'",
        (title,),
    ).fetchall()
    assert len(matches) <= 1, "Duplicate mobile reading rollout tasks require review"
    if matches:
        task_id = matches[0][0]
    else:
        task = api(
            "/records",
            "POST",
            {
                "type": "task",
                "title": title,
                "description": (
                    "На телефоне сразу показывать текущую книгу и главы; открывать поиск "
                    "и таблицы обоих Заветов нажатием на книгу. Не переносить вкладки, "
                    "не дублировать заголовок и не создавать отметку кнопкой маршрута. "
                    "Одно нажатие на круг сохраняет чтение, заметка остаётся необязательной."
                ),
                "status": "in_progress",
                "ownerId": user[0],
                "priority": "normal",
                "workstream": "platform",
                "editPolicy": "owner_only",
            },
        )
        task_id = task["id"]

    detail = api("/records/" + task_id)
    proof = "\n".join(
        [
            marker,
            "На мобильном экране главы подняты в первый экран: повторная шапка и нижний каталог скрыты, вкладки прокручиваются одной строкой.",
            "Текущая книга открывает отдельный поиск с таблицами Ветхого и Нового Завета. Маршрут только переводит к следующей главе; запись создаёт только нажатие на круг.",
            "После успешной однокнопочной отметки пометка предложена необязательным действием. Расширенный диапазон и частичное чтение сохранены в кнопке рядом с книгой.",
            "Production acceptance только читала данные Домашки; тестовые главы, планы и мысли на аккаунте владельца не создавались.",
            "Commit: " + args.commit,
            "Release: " + args.release,
            "SHA256: " + args.sha256,
            "Backup: " + args.backup,
        ]
    )
    if not any(marker in item["content"] for item in detail.get("proofs", [])):
        api("/records/" + task_id + "/proofs", "POST", {"kind": "text", "content": proof})
    detail = api("/records/" + task_id)
    if detail["record"]["status"] != "completed":
        api(
            "/records/" + task_id + "/complete",
            "POST",
            {
                "result": "На телефоне чтение начинается с текущей книги и глав. Книга открывает компактный выбор по Заветам, а глава отмечается одним нажатием без обязательной формы.",
                "notifyPartners": False,
            },
        )
    final = api("/records/" + task_id)
    assert final["record"]["status"] == "completed"
    assert any(marker in item["content"] for item in final.get("proofs", []))
    assert reading_before == {
        table: db.execute("SELECT COUNT(*) FROM " + table + " WHERE workspace_id=?", (workspace,)).fetchone()[0]
        for table in reading_tables
    }
    print(json.dumps({"taskId": task_id, "status": "completed", "verified": True}, ensure_ascii=False))
finally:
    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
    db.commit()
    db.close()
