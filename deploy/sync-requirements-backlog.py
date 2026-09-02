"""Review and apply an append-only BizFlow audit via the existing local API.

Run on the production host. No credentials, database copies or account reset
logic belong in this script. A plan is read-only; apply requires that exact plan.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib import error, request


CLOSED = {"completed", "archived", "cancelled"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def normalized(value):
    return " ".join(value.casefold().replace("ё", "е").split())


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def validate(manifest):
    require(manifest["version"] == 1, "Unsupported manifest version")
    require(manifest["workspaceId"] == "bizflow-team", "Unexpected target workspace")
    require(manifest["ownerUsername"] == "artkozk", "Unexpected task owner")
    require(re.fullmatch(r"\d{4}-\d{2}-\d{2}", manifest["auditDate"]), "Invalid audit date")
    groups = {item["key"] for item in manifest["groups"]}
    tasks = {item["key"] for item in manifest["tasks"]}
    items = manifest["groups"] + manifest["tasks"]
    require(len(groups | tasks) == len(items), "Duplicate item key")
    require(len({normalized(item["title"]) for item in items}) == len(items), "Duplicate item title")
    ids = [item["existingId"] for item in items if item.get("existingId")]
    require(len(ids) == len(set(ids)), "Duplicate existing ID")
    for item in items:
        require(re.fullmatch(r"[a-z][a-z0-9-]*", item["key"]), "Invalid item key")
        require(0 < len(item["title"].encode("utf-8")) <= 240, "Invalid title length: " + item["key"])
        require(item["source"] in manifest["sources"], "Unknown source: " + item["key"])
        if "group" in item:
            require(item["group"] in groups, "Unknown group: " + item["key"])
            require(item["status"] in {"planned", "postponed"}, "Invalid requested status")
            require(item["priority"] in {"high", "normal", "low"}, "Invalid priority")
            require(item["acceptance"] and all(item["acceptance"]), "Missing acceptance criteria")
            require(set(item["dependencies"]) <= tasks, "Unknown related task")
            require(item["key"] not in item["dependencies"], "Self reference")
    return {"groups": len(groups), "tasks": len(tasks), "manifestHash": digest(manifest)}


def marker(manifest, item):
    return f"[audit:{manifest['auditDate']}:{item['key']}]"


def description(manifest, item):
    lines = [marker(manifest, item), "Аудит требований " + manifest["auditDate"],
             "Источник: " + manifest["sources"][item["source"]]]
    if "group" not in item:
        lines += ["Направление объединяет оставшиеся работы. Наличие выпущенных частей не означает готовность всего направления."]
        lines += ["- " + task["title"] for task in manifest["tasks"] if task["group"] == item["key"]]
    else:
        titles = {task["key"]: task["title"] for task in manifest["tasks"]}
        lines += ["Основание: " + item["basis"], "Состояние на момент аудита: " + item["current"],
                  "Критерии готовности:"]
        lines += [f"{index}. {text}" for index, text in enumerate(item["acceptance"], 1)]
        if item["dependencies"]:
            lines += ["Связанные работы (не автоматические блокировки):"]
            lines += ["- " + titles[key] for key in item["dependencies"]]
        if item["status"] == "postponed":
            lines += ["Отложено. Начинать только после выполнения условий и отдельного решения владельца."]
    lines += ["Даты и трудозатраты не назначены. Выполнение требует отдельной проверки, а не только наличия кнопки."]
    return "\n".join(lines)


def match_record(manifest, item, records):
    by_id = {record["id"]: record for record in records}
    existing_id = item.get("existingId")
    if existing_id:
        require(existing_id in by_id, "Known record absent; stop for manual review: " + item["key"])
    matches = [record for record in records
               if record["id"] == existing_id
               or marker(manifest, item) in record["description"]
               or normalized(record["title"]) == normalized(item["title"])]
    require(len(matches) <= 1, "Ambiguous match; stop for manual review: " + item["key"])
    return matches[0] if matches else None


def make_plan(manifest, me, records):
    summary = validate(manifest)
    require(me["username"] == manifest["ownerUsername"], "Wrong account")
    require(len(records) < 500, "Record API may be truncated at 500; deduplication is unsafe")
    require(all(record["workspaceId"] == manifest["workspaceId"] for record in records), "Wrong workspace in response")
    require(len({record["id"] for record in records}) == len(records), "Duplicate server record IDs")
    umbrella = next((record for record in records if record["id"] == manifest["umbrellaId"]), None)
    require(umbrella is not None and umbrella["status"] not in CLOSED, "Active umbrella record is missing")
    require(umbrella["ownerId"] == me["id"], "Umbrella belongs to another owner")
    operations = []
    used = set()
    for item in manifest["groups"] + manifest["tasks"]:
        record = match_record(manifest, item, records)
        is_task = "group" in item
        block = description(manifest, item)
        operation = {"key": item["key"], "title": item["title"],
                     "parentKey": item.get("group", "umbrella")}
        if record:
            require(record["id"] not in used, "One record matched multiple requirements")
            used.add(record["id"])
            require(record["ownerId"] == me["id"], "Matched record belongs to another owner: " + item["key"])
            if not is_task:
                require(record["status"] not in CLOSED, "Closed parent requires review: " + item["key"])
            require(not is_task or record["type"] == "task", "Task matched a non-task record")
            operation.update(recordId=record["id"], existingTitle=record["title"],
                             existingStatus=record["status"], existingParentId=record.get("parentId"))
            if record["status"] in CLOSED:
                operation["action"] = "preserve_closed"
            elif block in record["description"]:
                operation["action"] = "unchanged"
            else:
                operation.update(action="append", payload={
                    "description": record["description"] + ("\n\n" if record["description"] else "") + block,
                    "expectedUpdatedAt": record["updatedAt"],
                    "reason": "Дополнение по аудиту требований; старое описание и состояние сохранены."})
        else:
            operation.update(action="create", payload={
                "type": "task" if is_task else "goal", "title": item["title"],
                "description": block, "status": item.get("status", "planned"),
                "ownerId": me["id"], "priority": item.get("priority", "normal"),
                "workstream": "platform", "editPolicy": "owner_only", "isRoot": False})
        operations.append(operation)
    return {**summary, "workspaceId": manifest["workspaceId"], "ownerId": me["id"],
            "umbrellaId": manifest["umbrellaId"], "snapshotHash": digest(sorted(records, key=lambda r: r["id"])),
            "operations": operations}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("API redirect refused")


class API:
    def __init__(self, workspace):
        token = os.environ.get("BIZFLOW_SESSION", "")
        require(token and "\r" not in token and "\n" not in token, "BIZFLOW_SESSION is required")
        self.headers = {"Cookie": "business_session=" + token,
                        "X-Workspace-ID": workspace, "Content-Type": "application/json"}
        self.opener = request.build_opener(request.ProxyHandler({}), NoRedirect())

    def call(self, method, path, payload=None):
        data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request("http://127.0.0.1:8522/api" + path, data=data, headers=self.headers, method=method)
        try:
            with self.opener.open(req, timeout=25) as response:
                return json.load(response)
        except error.HTTPError as exc:
            raise ValueError(f"API {method} {path}: HTTP {exc.code}; no automatic retry") from None
        except (error.URLError, TimeoutError, OSError):
            raise ValueError(f"API {method} {path}: uncertain result; read state before retry") from None


def execute(api, plan, emit):
    ids = {"umbrella": plan["umbrellaId"]}
    for operation in plan["operations"]:
        key, action = operation["key"], operation["action"]
        emit({"key": key, "action": action, "phase": "started"})
        if action in {"unchanged", "preserve_closed"}:
            ids[key] = operation["recordId"]
            emit({"key": key, "action": action, "phase": "preserved", "recordId": ids[key]})
            continue
        payload = dict(operation["payload"])
        if action == "create":
            payload["parentId"] = ids[operation["parentKey"]]
            record = api.call("POST", "/records", payload)
        else:
            record = api.call("PATCH", "/records/" + operation["recordId"], payload)
        record_id = record["id"]
        emit({"key": key, "phase": "written", "recordId": record_id})
        verified = api.call("GET", "/records/" + record_id)["record"]
        require(verified["workspaceId"] == plan["workspaceId"], "Post-write workspace mismatch")
        require(verified["ownerId"] == plan["ownerId"], "Post-write owner mismatch")
        require(verified["description"] == payload["description"], "Post-write description mismatch")
        if action == "create":
            require(verified["parentId"] == payload["parentId"], "Post-write parent mismatch")
            require(verified["title"] == payload["title"] and verified["status"] == payload["status"], "Post-write fields mismatch")
        else:
            require(verified["status"] == operation["existingStatus"], "Existing status changed")
            require(verified.get("parentId") == operation["existingParentId"], "Existing parent changed")
        ids[key] = record_id
        emit({"key": key, "action": action, "phase": "verified", "recordId": record_id})
    return ids


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--plan", type=Path, help="New read-only plan file (default mode)")
    parser.add_argument("--apply", type=Path, help="Previously reviewed plan; refuses any changed snapshot")
    parser.add_argument("--receipt", type=Path, help="New append-only JSONL receipt, stored on this host")
    parser.add_argument("--backup", type=Path, help="Existing on-host pre-write SQLite backup")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8-sig"))
    summary = validate(manifest)
    if args.validate_only:
        print(json.dumps(summary))
        return
    require(bool(args.plan) != bool(args.apply), "Choose --plan or --apply")
    api = API(manifest["workspaceId"])
    plan = make_plan(manifest, api.call("GET", "/me"), api.call("GET", "/records?includeArchived=true"))
    if args.plan:
        with args.plan.open("x", encoding="utf-8") as stream:
            json.dump(plan, stream, ensure_ascii=False, indent=2)
        print(json.dumps({"mode": "read_only_plan", **summary}))
        return
    require(plan == json.loads(args.apply.read_text(encoding="utf-8")), "State or manifest changed; produce and review a new plan")
    require(args.backup and args.backup.is_file() and args.backup.stat().st_size > 0, "Verified pre-write backup path is required")
    require(args.receipt is not None, "--receipt is required")
    # Exclusive creation avoids erasing evidence from a previous partial run.
    with args.receipt.open("x", encoding="utf-8") as stream:
        def emit(event):
            stream.write(json.dumps(event, ensure_ascii=False) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        emit({"phase": "begin", "manifestHash": summary["manifestHash"], "snapshotHash": plan["snapshotHash"]})
        try:
            ids = execute(api, plan, emit)
            after = make_plan(manifest, api.call("GET", "/me"), api.call("GET", "/records?includeArchived=true"))
            require(all(op["action"] in {"unchanged", "preserve_closed"} for op in after["operations"]), "Final reconciliation incomplete")
            emit({"phase": "complete", "ids": ids})
        except Exception as exc:
            emit({"phase": "incomplete", "errorType": type(exc).__name__})
            raise
    print(json.dumps({"mode": "verified", "receipt": str(args.receipt), **summary}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        sys.exit(1)
