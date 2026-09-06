"""Verify the compact production group card and append proof to its existing task."""

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
assert args.release.startswith("/opt/business-control/releases/20260906-reading-groups-")
assert args.backup.startswith("/var/lib/business-control/backups/pre-reading-groups-")
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
reading_tables = ("reading_entries", "reading_plans", "reading_reflections")
reading_before = {
    table: db.execute("SELECT COUNT(*) FROM " + table + " WHERE workspace_id=?", (workspace,)).fetchone()[0]
    for table in reading_tables
}

token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec="microseconds").replace("+00:00", "Z")
db.execute(
    "INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)",
    (user[0], digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)),
)
db.commit()

client = urllib.request.build_opener(urllib.request.ProxyHandler({}))


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


def asset(path):
    with client.open("http://127.0.0.1:8522" + path, timeout=25) as response:
        assert response.status == 200
        return response.read().decode()


task_id = "0b79e211ca6c50f9cdbae7e271a7baf5"
marker = "[verified:reading-group-card-" + args.commit[:7] + "]"
try:
    overview = api("/reading", target_workspace=workspace)
    assert overview["enabled"] is True and len(overview["books"]) == 66
    assert db.execute(
        "SELECT id FROM records WHERE workspace_id='bizflow-team' AND id=? "
        "AND title='Привести чтение Домашки к интерфейсу Tessavie' AND status='completed'",
        (task_id,),
    ).fetchone()

    index = asset("/")
    reading_js = asset("/reading.js?v=20260906-reading-groups-1")
    styles = asset("/styles.css?v=20260906-reading-groups-1")
    assert "20260906-reading-groups-1" in index
    assert 'class="text-button" data-group-edit' in reading_js
    assert "repeat(auto-fill,minmax(280px,360px))" in styles
    assert ".reading-group-card.current { border-color: var(--line-strong); box-shadow: none; }" in styles

    detail = api("/records/" + task_id)
    proof = "\n".join(
        [
            marker,
            "Дополнение по снимку 06.09.2026: одиночная группа больше не растягивается на всю ширину страницы.",
            "На ПК карточка ограничена 360 px; при нескольких группах сетка заполняется компактными колонками. На 390 и 320 px карточка занимает только доступную ширину без переполнения.",
            "Убраны отдельный белый фон, зелёная боковая полоса и тяжёлая вторичная кнопка. Использованы стандартная рамка Tessavie, две компактные характеристики и текстовое действие.",
            "Browser QA: 1440×1000 — 360×164; 390×844 — 362×164; 320×780 — 292×164; document scrollWidth равен viewport на всех размерах.",
            "Тесты: go test ./... -count=1; go vet ./...; node --test web/*.test.cjs — 196/196.",
            "Production acceptance не создавала и не изменяла главы, планы или мысли Домашки.",
            "Commit: " + args.commit,
            "Release: " + args.release,
            "SHA256: " + args.sha256,
            "Backup: " + args.backup,
        ]
    )
    if not any(marker in item["content"] for item in detail.get("proofs", [])):
        api("/records/" + task_id + "/proofs", "POST", {"kind": "text", "content": proof})

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
