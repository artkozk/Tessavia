"""Focused import recovery tests. All data and actors below are synthetic."""
import copy
import importlib.util
import sqlite3
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("workbook_import", Path(__file__).with_name("import-task-workbook-plan.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def sample_plan():
    plan = {
        "version": 1, "batchKey": "synthetic_batch_20260914",
        "workspace": {"id": "workspace", "name": "Synthetic workspace"},
        "board": {"id": "board", "name": "Synthetic board", "description": "Imported source snapshot"},
        "operator": {"id": 11, "username": "operator"}, "author": {"id": 22, "username": "author"},
        "fields": [{"key": "assignee", "name": "Source executor", "fieldType": "select", "required": False, "showOnCard": True, "options": ["Unassigned", "Person"]},
                   {"key": "due", "name": "Source date", "fieldType": "date", "required": False, "showOnCard": False}],
        "stages": [{"id": "backlog", "name": "Not started", "expectedName": "Backlog", "category": "backlog", "colorKey": "red"},
                   {"id": "waiting", "name": "Waiting", "expectedName": "Open", "category": "active", "colorKey": "amber"},
                   {"id": "done", "name": "Done", "expectedName": "Done", "category": "done", "colorKey": "green"}],
        "records": [],
        "pages": [{"name": "Tasks", "recordTypes": ["task"], "viewMode": "board", "statusFilter": "all", "ownerFilter": "all", "fields": ["due", "field:assignee"]},
                  {"name": "Materials", "recordTypes": ["document"], "viewMode": "list", "statusFilter": "all", "ownerFilter": "all", "fields": ["description"]}],
    }
    for key, kind, status, stage, deps in [("A", "task", "planned", "backlog", []), ("B", "task", "blocked", "waiting", ["A"]), ("C", "task", "completed", "done", ["B"]), ("M", "document", "draft", "backlog", [])]:
        plan["records"].append({"key": key, "payload": {"type": kind, "title": "Source " + key, "description": "Acceptance criteria. " + MODULE.marker(plan, key), "status": status,
                                                     "ownerId": 22, "priority": "normal", "workstream": "operations", "editPolicy": "shared", "dueAt": "2026-12-06T23:59:59+03:00"},
                                "stageId": stage, "createUnattached": status in {"blocked", "draft"}, "values": {"assignee": "Person" if key == "A" else "Unassigned", "due": "2026-12-06"}, "dependencies": deps})
    return plan


class FakeAPI:
    """Stateful API double models committed writes whose replies may be lost."""
    def __init__(self, plan):
        self.plan = plan
        self.boards = [{"id": "board", "workspaceId": "workspace", "name": "Synthetic board", "description": "", "cardLabel": "Task", "fields": [], "stages": []},
                       {"id": "other_board", "workspaceId": "workspace", "name": "Untouched", "description": "", "fields": [], "stages": []}]
        self.board = self.boards[0]
        for stage in plan["stages"]:
            self.board["stages"].append(dict(stage, name=stage["expectedName"], updatedAt="original"))
        self.records = [{"id": "foreign_record", "workspaceId": "workspace", "collectionId": "other_board", "title": "Existing", "description": "Existing content"}]
        self.pages = [{"id": "foreign_page", "name": "Existing page"}]
        self.links = []
        self.writes = []
        self.receipts = {}
        self.lose_next = None
        self.force_author = None
        self.change_on_final_read = False

    def __call__(self, path, method="GET", body=None, actor=None, request_key=None):
        if method != "GET":
            self.writes.append((path, method, actor))
        result = self.dispatch(path, method, copy.deepcopy(body), actor, request_key)
        if self.lose_next == (path, method):
            self.lose_next = None
            raise MODULE.ImportFailure("Simulated lost response after commit")
        return copy.deepcopy(result)

    def dispatch(self, path, method, body, actor, request_key):
        if path == "/me":
            return next(person for person in (self.plan["operator"], self.plan["author"]) if person["id"] == actor)
        if path == "/workspaces":
            return [dict(self.plan["workspace"], role="owner" if actor == 11 else "member")]
        if path == "/collections" and method == "GET":
            return self.boards
        if path == "/records?includeArchived=true":
            return self.records
        if path == "/workspace/pages?includeArchived=true":
            return self.pages
        if path == "/collections/board" and method == "PATCH":
            assert actor == 11
            self.board.update(body)
            return self.board
        if "/stages/" in path:
            assert actor == 11
            stage = next(stage for stage in self.board["stages"] if stage["id"] == path.split("/")[-1])
            assert body.pop("expectedUpdatedAt") == stage["updatedAt"]
            stage.update(body, updatedAt="updated")
            return stage
        if path == "/collections/board/fields":
            assert actor == 11
            field = dict(body, id="field_" + body["key"])
            field["options"] = [{"id": "option_" + str(index), "name": name} for index, name in enumerate(body.get("options", []))]
            self.board["fields"].append(field)
            return field
        if path == "/records" and method == "POST":
            assert actor == 22
            assert request_key
            if request_key in self.receipts:
                old_body, record = self.receipts[request_key]
                MODULE.require(old_body == body, "Request body changed")
                return record
            record = dict(body, id="record_" + str(len(self.records)), workspaceId="workspace", authorId=self.force_author or actor,
                          updatedAt="created", progress=100 if body["status"] == "completed" else 0)
            if record.get("dueAt"):
                record["dueAt"] = MODULE.stamp(MODULE.date_value(record["dueAt"]))
            self.records.append(record)
            self.receipts[request_key] = (copy.deepcopy(body), record)
            return record
        if path.endswith("/collection"):
            assert actor == 22
            record = next(record for record in self.records if record["id"] == path.split("/")[2])
            assert record["updatedAt"] == body["expectedUpdatedAt"]
            record.update(collectionId=body["collectionId"], stageId=body["stageId"], customFields=body["values"], updatedAt="attached")
            return record
        if path.endswith("/relations"):
            record_id = path.split("/")[2]
            return {"links": [link for link in self.links if record_id in (link["sourceId"], link["targetId"])]}
        if path.endswith("/links"):
            assert actor == 22
            source_id = path.split("/")[2]
            link = dict(body, id="link_" + str(len(self.links)), sourceId=source_id)
            assert not any((old["sourceId"], old["targetId"], old["relationType"]) == (source_id, body["targetId"], body["relationType"]) for old in self.links)
            self.links.append(link)
            return self.links
        if path == "/workspace/pages" and method == "POST":
            assert actor == 11
            page = dict(body, id="page_" + str(len(self.pages)), app=False, archived=False)
            self.pages.append(page)
            return page
        raise AssertionError("Unexpected fake API route: " + method + " " + path)


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.plan = sample_plan()
        self.api = FakeAPI(self.plan)

    def run_import(self):
        return MODULE.Importer(self.plan, self.api).apply()

    def test_full_import_distinct_author_statuses_dependencies_and_rerun(self):
        MODULE.validate_plan(self.plan)
        result = self.run_import()
        self.assertEqual(result["counts"], {"records": 4, "tasks": 3, "dependencies": 2, "pages": 2})
        self.assertTrue(result["verified"])
        records = {key: next(row for row in self.api.records if row["id"] == value) for key, value in result["recordIds"].items()}
        self.assertEqual(records["B"]["status"], "blocked")
        self.assertEqual(records["M"]["status"], "draft")
        self.assertEqual(records["C"]["status"], "completed")
        self.assertTrue(all(row["authorId"] == 22 for row in records.values()))
        self.assertEqual({(link["sourceId"], link["targetId"]) for link in self.api.links}, {(records["B"]["id"], records["A"]["id"]), (records["C"]["id"], records["B"]["id"])})
        before = len(self.api.writes)
        rerun = self.run_import()
        self.assertEqual(len(self.api.writes), before)
        self.assertEqual(rerun["recordIds"], result["recordIds"])
        self.assertEqual(rerun["createdThisRun"], {})

    def test_check_performs_no_business_writes(self):
        result = MODULE.Importer(self.plan, self.api).preflight()
        self.assertEqual(result["remainingRecords"], 4)
        self.assertEqual(self.api.writes, [])

    def test_partial_committed_response_recovery_every_write_class(self):
        points = [("/collections/board", "PATCH"), ("/collections/board/stages/backlog", "PATCH"), ("/collections/board/fields", "POST"),
                  ("/records", "POST"), ("/records/record_2/collection", "PUT"), ("/records/record_2/links", "POST"), ("/workspace/pages", "POST")]
        for point in points:
            with self.subTest(point=point):
                self.api = FakeAPI(self.plan)
                self.api.lose_next = point
                with self.assertRaisesRegex(MODULE.ImportFailure, "lost response"):
                    self.run_import()
                result = self.run_import()
                self.assertTrue(result["verified"])
                self.assertEqual(len(self.api.records), 5)
                self.assertEqual(len(self.api.links), 2)
                self.assertEqual(len(self.api.pages), 3)
                self.assertEqual(len(self.api.board["fields"]), 2)

    def test_changed_source_payload_fails_before_writes(self):
        self.run_import()
        self.plan["records"][0]["payload"]["description"] += " Changed source"
        before = len(self.api.writes)
        with self.assertRaisesRegex(MODULE.ImportFailure, "property differs"):
            self.run_import()
        self.assertEqual(len(self.api.writes), before)

    def test_source_marker_duplicate_rejected_before_writes(self):
        self.run_import()
        self.api.records.append(dict(self.api.records[1], id="duplicate"))
        before = len(self.api.writes)
        with self.assertRaisesRegex(MODULE.ImportFailure, "Duplicate"):
            self.run_import()
        self.assertEqual(len(self.api.writes), before)

    def test_unrelated_target_card_prevents_schema_mutation(self):
        self.api.records[0]["collectionId"] = "board"
        with self.assertRaisesRegex(MODULE.ImportFailure, "outside this batch"):
            self.run_import()
        self.assertEqual(self.api.writes, [])

    def test_wrong_author_detected_at_first_record(self):
        self.api.force_author = 11
        with self.assertRaisesRegex(MODULE.ImportFailure, "author differs"):
            self.run_import()
        self.assertEqual(len(self.api.records), 2)

    def test_existing_schema_option_mismatch_rejected_before_mutation(self):
        self.run_import()
        self.api.board["fields"][0]["options"][0]["name"] = "Changed by user"
        before = len(self.api.writes)
        with self.assertRaisesRegex(MODULE.ImportFailure, "options differ"):
            self.run_import()
        self.assertEqual(len(self.api.writes), before)

    def test_extra_dependency_rejected_in_verify(self):
        self.run_import()
        self.api.links.append({"sourceId": "record_1", "targetId": "foreign_record", "relationType": "depends_on"})
        with self.assertRaisesRegex(MODULE.ImportFailure, "dependencies differ"):
            MODULE.Importer(self.plan, self.api).verify()

    def test_unrelated_mutation_detected(self):
        self.run_import()
        importer = MODULE.Importer(self.plan, self.api)
        importer.preflight()
        self.api.records[0]["title"] = "Concurrent user edit"
        with self.assertRaisesRegex(MODULE.ImportFailure, "Unrelated record changed"):
            importer.verify()

    def test_resumed_run_preserves_original_unrelated_fingerprints(self):
        first = MODULE.Importer(self.plan, self.api)
        first.preflight()
        self.run_import()
        self.api.records[0]["title"] = "Another user's later change"
        resumed = MODULE.Importer(self.plan, self.api, baseline=first.baseline)
        before = len(self.api.writes)
        with self.assertRaisesRegex(MODULE.ImportFailure, "inspect concurrent edits"):
            resumed.apply()
        self.assertEqual(len(self.api.writes), before)

    def test_conflicting_coordinator_identity_and_malformed_hex_id_rejected(self):
        self.plan["coordinator"] = {"id": 22, "username": "somebody_else"}
        with self.assertRaisesRegex(MODULE.ImportFailure, "Conflicting actor"):
            MODULE.validate_plan(self.plan)
        self.plan = sample_plan()
        self.plan["stages"][0]["id"] = "2" * 33
        with self.assertRaisesRegex(MODULE.ImportFailure, "identifier length"):
            MODULE.validate_plan(self.plan)

    def test_select_requires_nonempty_case_insensitive_unique_options(self):
        for options in ([], ["Person", "person"], ["Егор", "егор"], ["Person", " Person "]):
            with self.subTest(options=options):
                plan = sample_plan()
                plan["fields"][0]["options"] = options
                with self.assertRaises(MODULE.ImportFailure):
                    MODULE.validate_plan(plan)

    def test_final_record_idempotency_key_must_meet_api_length(self):
        self.plan["batchKey"] = "shortkey"
        for row in self.plan["records"]:
            row["payload"]["description"] = MODULE.marker(self.plan, row["key"])
        with self.assertRaisesRegex(MODULE.ImportFailure, "final record idempotency key"):
            MODULE.validate_plan(self.plan)
        # Fourteen batch characters plus '_' and a one-character row is valid.
        self.plan["batchKey"] = "valid_batch_14"
        for row in self.plan["records"]:
            row["payload"]["description"] = MODULE.marker(self.plan, row["key"])
        self.assertEqual(MODULE.validate_plan(self.plan)["records"], 4)

    def test_completed_task_cannot_be_created_unattached(self):
        self.plan["records"][2]["createUnattached"] = True
        with self.assertRaisesRegex(MODULE.ImportFailure, "Completed records require"):
            MODULE.validate_plan(self.plan)

    def test_invalid_graph_scope_dates_and_utf8_are_rejected(self):
        for mutate in [lambda p: p["records"][0]["dependencies"].append("B"),
                       lambda p: p["records"][0]["dependencies"].append("missing"),
                       lambda p: p["records"][0]["payload"].update(ownerId=0),
                       lambda p: p["records"][0]["payload"].update(title="я" * 121),
                       lambda p: p["records"][0]["payload"].update(dueAt="2026-12-06T10:00:00"),
                       lambda p: p["records"][0]["payload"].update(collectionId="foreign"),
                       lambda p: p["records"][1].update(createUnattached=False)]:
            plan = sample_plan()
            mutate(plan)
            with self.assertRaises(MODULE.ImportFailure):
                MODULE.validate_plan(plan)

    def test_ephemeral_sessions_clean_up_on_failure_without_removing_others(self):
        with sqlite3.connect(":memory:") as db:
            db.executescript("CREATE TABLE users(id INTEGER, username TEXT); CREATE TABLE workspace_members(workspace_id TEXT,user_id INTEGER,status TEXT,role TEXT); CREATE TABLE sessions(user_id INTEGER,token_hash TEXT,expires_at TEXT,created_at TEXT,last_seen_at TEXT);")
            db.executemany("INSERT INTO users VALUES(?,?)", [(11, "operator"), (22, "author")])
            db.executemany("INSERT INTO workspace_members VALUES('workspace',?,'active','member')", [(11,), (22,)])
            db.execute("INSERT INTO sessions VALUES(11,'existing','later','earlier','earlier')")
            with self.assertRaisesRegex(RuntimeError, "failure"):
                with MODULE.sessions(db, [self.plan["operator"], self.plan["author"]], "workspace") as tokens:
                    self.assertEqual(set(tokens), {11, 22})
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0], 3)
                    raise RuntimeError("simulated failure")
            self.assertEqual(db.execute("SELECT token_hash FROM sessions").fetchall(), [("existing",)])


if __name__ == "__main__":
    unittest.main()
