#!/usr/bin/env python3
"""Apply a reviewed workbook plan through the application's scoped JSON API.

This is an operator-assisted, snapshot import, not an Excel synchronisation API.
Business data is never written with SQL. A same-host SQLite online backup and
short-lived authenticated sessions are the only direct database operations.
The exact reviewed plan SHA is mandatory. Batch state pins that SHA across
partial retries. Neither session tokens nor source descriptions enter receipts.
"""

import argparse
import collections
import contextlib
import datetime as dt
import hashlib
import json
import re
import secrets
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class ImportFailure(RuntimeError):
    """A fail-closed validation or API error, safe to print without source data."""


def require(condition, message):
    if not condition:
        raise ImportFailure(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def stamp(value):
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


def date_value(value):
    if value in (None, ""):
        return None
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(parsed.tzinfo is not None, "Deadline requires an explicit timezone")
    return parsed.astimezone(dt.timezone.utc)


def marker(plan, key):
    return "[import:" + plan["batchKey"] + ":" + key + "]"


def plan_people(plan):
    people = {}
    for name in ("operator", "author", "coordinator"):
        if name not in plan:
            continue
        person = plan[name]
        if person["id"] in people:
            require(people[person["id"]]["username"] == person["username"], "Conflicting actor identity in plan")
        people[person["id"]] = person
    return list(people.values())


def validate_plan(plan):
    require(plan.get("version") == 1, "Unsupported plan version")
    require(re.fullmatch(r"[A-Za-z0-9_-]{8,64}", plan.get("batchKey", "")), "Invalid batch key")
    for name in ("workspace", "board"):
        require(re.fullmatch(r"[A-Za-z0-9_-]{1,80}", plan[name]["id"]), "Invalid scope identifier")
        require(bool(plan[name]["name"].strip()), "Scope name is required")
    for person in plan_people(plan):
        require(type(person["id"]) is int and person["id"] > 0 and person["username"], "Invalid actor")
    require(len(plan["board"]["description"]) <= 800, "Board description exceeds limit")
    fields = {field["key"]: field for field in plan["fields"]}
    require(len(fields) == len(plan["fields"]), "Duplicate field key")
    for key, field in fields.items():
        require(re.fullmatch(r"[a-z][a-z0-9_]{0,63}", key), "Invalid field key")
        require(field["fieldType"] in {"text", "date", "select"}, "Unsupported import field type")
        require(not field.get("required"), "Import fields must remain optional")
        options = field.get("options", [])
        require(len(options) == len(set(options)) and len(options) <= 1000, "Invalid field options")
        require(all(isinstance(value, str) and value.strip() == value and 0 < len(value) <= 80 for value in options), "Invalid option label")
        if field["fieldType"] == "select":
            require(bool(options), "Select field requires at least one option")
            require(len({value.strip().lower() for value in options}) == len(options), "Select options must be unique ignoring case and surrounding whitespace")
    stages = {stage["id"]: stage for stage in plan["stages"]}
    require(len(stages) == len(plan["stages"]), "Duplicate stage id")
    for stage in stages.values():
        require(stage["category"] in {"backlog", "active", "review", "done"}, "Invalid stage category")
        # Opaque IDs remain usable in test/dev installations, but production
        # hexadecimal IDs must have the database's exact 128-bit width.
        if re.fullmatch(r"[0-9a-f]+", stage["id"]):
            require(len(stage["id"]) == 32, "Invalid hexadecimal stage identifier length")
    records = {row["key"]: row for row in plan["records"]}
    require(records and len(records) == len(plan["records"]), "Duplicate or empty record keys")
    allowed_payload = {"type", "title", "description", "status", "ownerId", "dueAt", "priority", "workstream", "editPolicy"}
    for key, row in records.items():
        require(re.fullmatch(r"[A-Za-z0-9_-]{1,50}", key), "Invalid row key")
        require(re.fullmatch(r"[A-Za-z0-9_-]{16,128}", plan["batchKey"] + "_" + key), "Invalid final record idempotency key")
        payload = row["payload"]
        require(set(payload) <= allowed_payload, "Unexpected record input property: " + key)
        require(0 < len(payload["title"].encode("utf-8")) <= 240, "Title exceeds UTF-8 byte limit: " + key)
        require(payload["description"].count(marker(plan, key)) == 1, "Missing or repeated source marker: " + key)
        require(payload["type"] in {"task", "document"}, "Unexpected record type")
        require(payload["status"] in {"planned", "blocked", "in_progress", "completed", "draft"}, "Unexpected status")
        require(type(payload.get("ownerId")) is int and payload["ownerId"] > 0, "Explicit valid native owner required: " + key)
        require(payload["ownerId"] in {person["id"] for person in plan_people(plan)}, "Native owner needs a named identity in the plan")
        require(payload["editPolicy"] == "shared", "Imported team records must use shared access")
        require(payload["priority"] in {"critical", "high", "normal", "low"}, "Invalid priority")
        if payload.get("dueAt"):
            date_value(payload["dueAt"])
        require(row["stageId"] in stages, "Unknown target stage")
        expected_status = {"backlog": "planned", "active": "in_progress", "review": "review", "done": "completed"}[stages[row["stageId"]]["category"]]
        require(row.get("createUnattached") or payload["status"] == expected_status, "Direct creation would overwrite source status: " + key)
        require(not (row.get("createUnattached") and payload["status"] == "completed"), "Completed records require creation in a collection")
        require(set(row["values"]) <= set(fields), "Unknown source field: " + key)
        for field_key, value in row["values"].items():
            field = fields[field_key]
            if field["fieldType"] == "select" and value not in (None, ""):
                require(value in field["options"], "Unknown source option: " + key)
            if field["fieldType"] == "date" and value not in (None, ""):
                dt.date.fromisoformat(value)
        dependencies = row["dependencies"]
        require(len(dependencies) == len(set(dependencies)), "Repeated dependency: " + key)
        require(all(target in records and target != key for target in dependencies), "Unknown or self dependency: " + key)
    visiting, visited = set(), set()

    def visit(key):
        require(key not in visiting, "Dependency cycle")
        if key in visited:
            return
        visiting.add(key)
        for target in records[key]["dependencies"]:
            visit(target)
        visiting.remove(key)
        visited.add(key)

    for key in records:
        visit(key)
    require(len({page["name"] for page in plan["pages"]}) == len(plan["pages"]), "Duplicate page name")
    for page in plan["pages"]:
        require(page["viewMode"] in {"list", "board"} and page["ownerFilter"] == "all" and page["statusFilter"] == "all", "Unexpected page filter")
        require(set(page["recordTypes"]) <= {"task", "document"}, "Unexpected page types")
        for key in page["fields"]:
            require(key in {"due", "description", "owner", "status"} or (key.startswith("field:") and key[6:] in fields), "Unknown page display field")
    return {"records": len(records), "tasks": sum(row["payload"]["type"] == "task" for row in records.values()), "dependencies": sum(len(row["dependencies"]) for row in records.values()), "pages": len(plan["pages"])}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


class API:
    def __init__(self, workspace, sessions):
        self.workspace = workspace
        self.sessions = sessions
        self.client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def __call__(self, path, method="GET", body=None, actor=None, request_key=None):
        require(path.startswith("/") and "://" not in path and ".." not in path, "Invalid API path")
        headers = {"Cookie": "business_session=" + self.sessions[actor], "X-Workspace-ID": self.workspace,
                   "X-Outbox-Owner": str(actor), "Content-Type": "application/json"}
        if request_key:
            headers["Idempotency-Key"] = request_key
        request = urllib.request.Request("http://127.0.0.1:8522/api" + path, method=method,
                                         data=None if body is None else canonical(body).encode(), headers=headers)
        try:
            with self.client.open(request, timeout=35) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raise ImportFailure("API returned HTTP " + str(error.code) + " for " + method + " " + path.split("?")[0]) from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            raise ImportFailure("API response unavailable; rerun the unchanged plan to reconcile " + method + " " + path.split("?")[0]) from None


class Importer:
    def __init__(self, plan, api, baseline=None):
        self.plan, self.api = plan, api
        self.operator, self.author = plan["operator"]["id"], plan["author"]["id"]
        self.workspace, self.board_id = plan["workspace"]["id"], plan["board"]["id"]
        self.fields, self.records = {}, {}
        self.changes = collections.Counter()
        self.baseline = baseline

    def call(self, path, method="GET", body=None, author=False, request_key=None):
        return self.api(path, method, body, actor=self.author if author else self.operator, request_key=request_key)

    def board(self):
        matches = [item for item in self.call("/collections") if item["id"] == self.board_id]
        require(len(matches) == 1, "Target board unavailable")
        result = matches[0]
        require(result["workspaceId"] == self.workspace and result["name"] == self.plan["board"]["name"], "Target board scope/name changed")
        return result

    def load_records(self):
        return self.call("/records?includeArchived=true")

    def index_records(self, rows):
        result = {}
        known = {row["key"] for row in self.plan["records"]}
        prefix = "[import:" + self.plan["batchKey"] + ":"
        pattern = re.compile(re.escape(prefix) + r"([A-Za-z0-9_-]+)\]")
        for record in rows:
            keys = pattern.findall(record.get("description", ""))
            require(not prefix in record.get("description", "") or bool(keys), "Malformed existing batch marker")
            if keys:
                require(len(keys) == 1 and keys[0] in known and keys[0] not in result, "Duplicate or unknown existing batch marker")
                require(record["workspaceId"] == self.workspace and record.get("collectionId", "") in ("", self.board_id), "Existing batch record is outside the target board")
                result[keys[0]] = record
            elif record.get("collectionId") == self.board_id:
                raise ImportFailure("Target board contains records outside this batch; refusing to change its schema")
        return result

    def field_map(self, board, complete=False):
        fields = {field["key"]: field for field in board["fields"]}
        require(len(fields) == len(board["fields"]), "Duplicate current field keys")
        desired = {field["key"]: field for field in self.plan["fields"]}
        require(set(fields) <= set(desired), "Unexpected fields on target board")
        for key, field in fields.items():
            expected = desired[key]
            require(not field.get("archivedAt"), "Imported field was archived")
            for attr in ("name", "fieldType", "required", "showOnCard"):
                require(field[attr] == expected[attr], "Existing field differs: " + key + " / " + attr)
            require([item["name"] for item in (field.get("options") or [])] == expected.get("options", []), "Existing field options differ: " + key)
        if complete:
            require(set(fields) == set(desired), "Import fields are incomplete")
        self.fields = fields
        return fields

    def values(self, row):
        result = {}
        for key, value in row["values"].items():
            if value in (None, ""):
                continue
            require(key in self.fields, "Required import field has not been created")
            field = self.fields[key]
            if field["fieldType"] == "select":
                found = [option["id"] for option in field["options"] if option["name"] == value]
                require(len(found) == 1, "Option mapping is ambiguous")
                value = found[0]
            result[field["id"]] = value
        return result

    def verify_record(self, row, record, attached=True):
        require(record["workspaceId"] == self.workspace, "Record workspace differs: " + row["key"])
        require(record["authorId"] == self.author, "Record author differs: " + row["key"])
        for key, expected in row["payload"].items():
            actual = record.get(key)
            if key == "dueAt":
                require(date_value(actual) == date_value(expected), "Record deadline differs: " + row["key"])
            else:
                require(actual == expected, "Record property differs: " + row["key"] + " / " + key)
        require(not record.get("parentId"), "Unexpected imported hierarchy")
        if attached:
            require(record.get("collectionId") == self.board_id and record.get("stageId") == row["stageId"], "Record board/stage differs: " + row["key"])
            actual_fields = {key: value for key, value in (record.get("customFields") or {}).items() if value not in (None, "")}
            require(actual_fields == self.values(row), "Record custom fields differ: " + row["key"])
        else:
            require(not record.get("collectionId") and row.get("createUnattached"), "Unexpected unattached record")
        if row["payload"]["status"] == "completed":
            require(record.get("progress") == 100, "Imported completed record lacks completion progress")

    def page_payload(self, page):
        payload = dict(page, collectionId=self.board_id)
        payload["fields"] = ["field:" + self.fields[key[6:]]["id"] if key.startswith("field:") else key for key in page["fields"]]
        return payload

    def verify_pages(self, complete=False):
        pages = self.call("/workspace/pages?includeArchived=true")
        found = {}
        for planned in self.plan["pages"]:
            matches = [page for page in pages if page["name"] == planned["name"]]
            require(len(matches) <= 1, "Ambiguous common page name")
            if not matches:
                require(not complete, "Common page missing")
                continue
            actual = matches[0]
            require(not actual.get("archived") and not actual.get("app"), "Matching common page is archived or a different page kind")
            for key, expected in self.page_payload(planned).items():
                require(actual.get(key) == expected, "Common page differs: " + key)
            found[planned["name"]] = actual["id"]
        return found

    def preflight(self):
        for person in plan_people(self.plan):
            actual = self.api("/me", actor=person["id"])
            require(actual["id"] == person["id"] and actual["username"] == person["username"], "Authenticated actor mismatch")
            scopes = self.api("/workspaces", actor=person["id"])
            matching = [scope for scope in scopes if scope["id"] == self.workspace]
            require(len(matching) == 1 and matching[0]["name"] == self.plan["workspace"]["name"], "Actor lacks expected workspace")
            if person["id"] == self.operator:
                require(matching[0]["role"] in ("owner", "admin"), "Schema operator is not workspace administrator")
        board = self.board()
        require(board["description"] in ("", self.plan["board"]["description"]), "Board description changed outside batch")
        self.field_map(board)
        current_stages = {stage["id"]: stage for stage in board["stages"]}
        require(set(current_stages) == {stage["id"] for stage in self.plan["stages"]}, "Target board stages changed")
        for desired in self.plan["stages"]:
            actual = current_stages[desired["id"]]
            require(actual["name"] in (desired["expectedName"], desired["name"]), "Stage name changed outside batch")
            require(actual["category"] == desired["category"] and actual["colorKey"] == desired["colorKey"], "Stage semantics changed")
        all_records = self.load_records()
        self.records = self.index_records(all_records)
        planned = {row["key"]: row for row in self.plan["records"]}
        for key, record in self.records.items():
            self.verify_record(planned[key], record, bool(record.get("collectionId")))
        imported_ids = {record["id"] for record in self.records.values()}
        self.untouched = {record["id"]: fingerprint(record) for record in all_records if record["id"] not in imported_ids}
        self.other_boards = {board["id"]: fingerprint(board) for board in self.call("/collections") if board["id"] != self.board_id}
        # Existing matching pages require the complete field map to compare IDs.
        if len(self.fields) == len(self.plan["fields"]):
            self.verify_pages()
        else:
            existing_names = {page["name"] for page in self.call("/workspace/pages?includeArchived=true")}
            require(not existing_names.intersection(page["name"] for page in self.plan["pages"]), "Matching page exists before its import schema")
        self.other_pages = {page["id"]: fingerprint(page) for page in self.call("/workspace/pages?includeArchived=true") if page["name"] not in {p["name"] for p in self.plan["pages"]}}
        current_baseline = {"records": self.untouched, "boards": self.other_boards, "pages": self.other_pages}
        if self.baseline:
            for category, originals in self.baseline.items():
                for object_id, digest in originals.items():
                    require(current_baseline[category].get(object_id) == digest, "Previously untouched " + category + " changed since the original import snapshot; inspect concurrent edits: " + object_id)
        else:
            self.baseline = current_baseline
        return {"existingRecords": len(self.records), "remainingRecords": len(planned) - len(self.records), "untouchedRecords": len(self.untouched)}

    def apply(self):
        self.preflight()
        board = self.board()
        if board["description"] != self.plan["board"]["description"]:
            self.call("/collections/" + self.board_id, "PATCH", {"name": board["name"], "description": self.plan["board"]["description"], "cardLabel": board["cardLabel"]})
            self.changes["boardDescriptions"] += 1
        for stage in self.plan["stages"]:
            current = next(value for value in self.board()["stages"] if value["id"] == stage["id"])
            if current["name"] != stage["name"]:
                require(current["name"] == stage["expectedName"] and current["updatedAt"], "Stage changed during import")
                self.call("/collections/" + self.board_id + "/stages/" + stage["id"], "PATCH", {"name": stage["name"], "category": stage["category"], "colorKey": stage["colorKey"], "expectedUpdatedAt": current["updatedAt"]})
                self.changes["stages"] += 1
        for field in self.plan["fields"]:
            self.field_map(self.board())
            if field["key"] not in self.fields:
                self.call("/collections/" + self.board_id + "/fields", "POST", field)
                self.changes["fields"] += 1
        self.field_map(self.board(), complete=True)
        self.records = self.index_records(self.load_records())
        for row in self.plan["records"]:
            key = row["key"]
            if key not in self.records:
                payload = dict(row["payload"])
                if not row.get("createUnattached"):
                    payload.update(collectionId=self.board_id, stageId=row["stageId"], customFields=self.values(row))
                request_key = self.plan["batchKey"] + "_" + key
                self.records[key] = self.call("/records", "POST", payload, author=True, request_key=request_key)
                self.changes["records"] += 1
            record = self.records[key]
            self.verify_record(row, record, bool(record.get("collectionId")))
            if not record.get("collectionId"):
                record = self.call("/records/" + record["id"] + "/collection", "PUT", {"collectionId": self.board_id, "stageId": row["stageId"], "expectedUpdatedAt": record["updatedAt"], "values": self.values(row)}, author=True)
                self.records[key] = record
                self.changes["attachments"] += 1
            self.verify_record(row, record)
        for row in self.plan["records"]:
            source = self.records[row["key"]]["id"]
            links = self.call("/records/" + source + "/relations")["links"] or []
            existing = {(link["sourceId"], link["targetId"], link["relationType"]) for link in links}
            for target_key in row["dependencies"]:
                target = self.records[target_key]["id"]
                if (source, target, "depends_on") not in existing:
                    self.call("/records/" + source + "/links", "POST", {"targetId": target, "relationType": "depends_on", "reason": "Зависимость из исходной таблицы: " + row["key"] + " зависит от " + target_key}, author=True)
                    self.changes["dependencies"] += 1
        pages = self.verify_pages()
        for page in self.plan["pages"]:
            if page["name"] not in pages:
                self.call("/workspace/pages", "POST", self.page_payload(page))
                self.changes["pages"] += 1
        return self.verify()

    def verify(self):
        board = self.board()
        require(board["description"] == self.plan["board"]["description"], "Imported board description differs")
        self.field_map(board, complete=True)
        stages = {stage["id"]: stage for stage in board["stages"]}
        for expected in self.plan["stages"]:
            for attr in ("name", "category", "colorKey"):
                require(stages[expected["id"]][attr] == expected[attr], "Imported stage differs")
        all_records = self.load_records()
        self.records = self.index_records(all_records)
        require(len(self.records) == len(self.plan["records"]), "Imported record count differs")
        desired_links, actual_links = set(), set()
        for row in self.plan["records"]:
            record = self.records[row["key"]]
            self.verify_record(row, record)
            desired_links.update((record["id"], self.records[target]["id"], "depends_on") for target in row["dependencies"])
            relations = self.call("/records/" + record["id"] + "/relations")["links"] or []
            for link in relations:
                actual_links.add((link["sourceId"], link["targetId"], link["relationType"]))
        require(actual_links == desired_links, "Imported dependencies differ, or extra relations exist")
        pages = self.verify_pages(complete=True)
        now_records = {record["id"]: fingerprint(record) for record in all_records}
        for record_id, digest in getattr(self, "untouched", {}).items():
            require(now_records.get(record_id) == digest, "Unrelated record changed during import: " + record_id)
        now_boards = {board["id"]: fingerprint(board) for board in self.call("/collections")}
        for board_id, digest in getattr(self, "other_boards", {}).items():
            require(now_boards.get(board_id) == digest, "Unrelated board changed during import")
        now_pages = {page["id"]: fingerprint(page) for page in self.call("/workspace/pages?includeArchived=true")}
        for page_id, digest in getattr(self, "other_pages", {}).items():
            require(now_pages.get(page_id) == digest, "Unrelated page changed during import")
        return {"batchKey": self.plan["batchKey"], "workspaceId": self.workspace, "boardId": self.board_id,
                "counts": validate_plan(self.plan), "createdThisRun": dict(self.changes),
                "recordIds": {key: value["id"] for key, value in self.records.items()}, "pageIds": list(pages.values()),
                "verified": True, "verifiedAt": stamp(dt.datetime.now(dt.timezone.utc))}


@contextlib.contextmanager
def sessions(db, people, workspace):
    tokens, digests = {}, []
    try:
        for person in people:
            if person["id"] in tokens:
                continue
            user = db.execute("SELECT username FROM users WHERE id=?", (person["id"],)).fetchone()
            require(user and user[0] == person["username"], "Server actor identity differs")
            membership = db.execute("SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'", (workspace, person["id"])).fetchone()
            require(membership, "Server actor lacks active workspace membership")
            token = secrets.token_urlsafe(32)
            digest = hashlib.sha256(token.encode()).hexdigest()
            now = dt.datetime.now(dt.timezone.utc)
            db.execute("INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)", (person["id"], digest, stamp(now + dt.timedelta(minutes=30)), stamp(now), stamp(now)))
            db.commit()
            tokens[person["id"]] = token
            digests.append(digest)
        yield tokens
    finally:
        for digest in digests:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
        db.commit()


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--plan-sha256", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true")
    parser.add_argument("--database", default="/var/lib/business-control/business-control.db")
    parser.add_argument("--state-dir", default="/var/lib/business-control/import-receipts")
    args = parser.parse_args()
    raw = Path(args.plan).read_bytes()
    require(re.fullmatch(r"[a-f0-9]{64}", args.plan_sha256), "Invalid plan SHA")
    require(hashlib.sha256(raw).hexdigest() == args.plan_sha256, "Plan file SHA does not match reviewed input")
    plan = json.loads(raw)
    counts = validate_plan(plan)
    require(str(Path("/opt/business-control/current").resolve()) == plan["expectedRelease"], "Production release differs from reviewed API version")
    require(Path(args.database).resolve() == Path("/var/lib/business-control/business-control.db"), "Unexpected production database path")
    import fcntl  # Server-only. Importable on Windows for isolated unit tests.
    with open("/run/business-control-import-plan.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state_dir = Path(args.state_dir).resolve()
        require(state_dir.is_relative_to(Path("/var/lib/business-control")), "Import state must remain on the production host data volume")
        state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        state_path = state_dir / (plan["batchKey"] + ".json")
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else None
        if state:
            require(state["planSha256"] == args.plan_sha256, "Batch already pinned to a different plan SHA")
        with sqlite3.connect(args.database, timeout=20) as db:
            require(db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "Database integrity check failed")
            require(not db.execute("PRAGMA foreign_key_check").fetchall(), "Database foreign key check failed")
            for owner_id in {row["payload"]["ownerId"] for row in plan["records"]}:
                require(db.execute("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'", (plan["workspace"]["id"], owner_id)).fetchone(), "Native owner lacks active workspace membership")
            if args.apply and not state:
                backup_dir = Path("/var/lib/business-control/backups") / ("pre-import-" + plan["batchKey"] + "-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
                backup_dir.mkdir(mode=0o700)
                backup_path = backup_dir / "business-control.db"
                with sqlite3.connect(backup_path) as destination:
                    db.backup(destination)
                    require(destination.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "Backup integrity check failed")
                backup_path.chmod(0o600)
                state = {"planSha256": args.plan_sha256, "batchKey": plan["batchKey"], "backupPath": str(backup_path), "createdAt": stamp(dt.datetime.now(dt.timezone.utc)), "verified": False}
                save_json(state_path, state)
            with sessions(db, plan_people(plan), plan["workspace"]["id"]) as tokens:
                importer = Importer(plan, API(plan["workspace"]["id"], tokens), baseline=state.get("untouchedBaseline") if state else None)
                if args.check:
                    result = {"mode": "check", "planSha256": args.plan_sha256, "counts": counts, **importer.preflight()}
                elif args.apply:
                    importer.preflight()
                    state["untouchedBaseline"] = importer.baseline
                    save_json(state_path, state)
                    result = importer.apply()
                else:
                    importer.preflight()
                    result = importer.verify()
                if not args.check:
                    result["planSha256"] = args.plan_sha256
                    if state:
                        state.update(result)
                        save_json(state_path, state)
                        result["receiptPath"] = str(state_path)
                        result["backupPath"] = state["backupPath"]
                print(json.dumps(result, ensure_ascii=False, sort_keys=True), flush=True)


if __name__ == "__main__":
    try:
        main()
    except ImportFailure as error:
        print("IMPORT_ABORTED: " + str(error), file=sys.stderr, flush=True)
        raise SystemExit(1)
