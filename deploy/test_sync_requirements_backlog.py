import copy
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("backlog", ROOT / "deploy/sync-requirements-backlog.py")
backlog = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backlog)


def manifest():
    return {
        "version": 1, "auditDate": "2026-09-02", "workspaceId": "bizflow-team",
        "ownerUsername": "artkozk", "umbrellaId": "root", "sources": {"test": "User request"},
        "groups": [{"key": "quality", "title": "Quality", "source": "test"}],
        "tasks": [{"key": "mobile", "group": "quality", "title": "Mobile layout",
                   "source": "test", "basis": "Request", "current": "Needs verification",
                   "acceptance": ["No overflow"], "priority": "high",
                   "dependencies": [], "status": "planned"}]}


def record(record_id="root", title="Product", **fields):
    return {"id": record_id, "title": title, "description": "Original text\n",
            "ownerId": 1, "workspaceId": "bizflow-team", "status": "in_progress",
            "updatedAt": "2026-09-02T00:00:00Z", "type": "task", "parentId": None, **fields}


class FakeAPI:
    def __init__(self, records):
        self.records = {r["id"]: copy.deepcopy(r) for r in records}
        self.writes = []
        self.fail_after_post = False

    def call(self, method, path, payload=None):
        if method == "GET":
            return {"record": copy.deepcopy(self.records[path.split("/")[-1]])}
        self.writes.append((method, path, copy.deepcopy(payload)))
        if method == "POST":
            record_id = "new-" + str(len(self.records))
            self.records[record_id] = record(record_id, **payload)
            if self.fail_after_post:
                raise TimeoutError("Response lost after commit")
        else:
            record_id = path.split("/")[-1]
            target = self.records[record_id]
            if target["updatedAt"] != payload["expectedUpdatedAt"]:
                raise ValueError("Conflict")
            target["description"] = payload["description"]
            target["updatedAt"] = "2026-09-02T01:00:00Z"
        return copy.deepcopy(self.records[record_id])


class AuditSyncTests(unittest.TestCase):
    def setUp(self):
        self.manifest = manifest()
        self.me = {"id": 1, "username": "artkozk"}
        self.records = [record()]

    def plan(self):
        return backlog.make_plan(self.manifest, self.me, self.records)

    def test_real_manifest(self):
        data = json.loads((ROOT / "docs/product/BIZFLOW_REQUIREMENTS_BACKLOG_2026_09_02.json").read_text(encoding="utf-8"))
        self.assertEqual(backlog.validate(data)["tasks"], 63)
        self.assertEqual(len(data["groups"]), 13)
        self.assertEqual(data["delivery"]["status"], "prepared_not_synced")

    def test_invalid_manifest_references(self):
        self.manifest["tasks"][0]["dependencies"] = ["missing"]
        with self.assertRaisesRegex(ValueError, "Unknown related task"):
            self.plan()

    def test_delivery_receipt_matches_manifest(self):
        data = json.loads((ROOT / "docs/product/BIZFLOW_REQUIREMENTS_BACKLOG_2026_09_02.json").read_text(encoding="utf-8"))
        receipt = json.loads((ROOT / "docs/operations/BIZFLOW_REQUIREMENTS_BACKLOG_RECEIPT_2026_09_02.json").read_text(encoding="utf-8"))
        self.assertEqual(receipt["status"], "synced")
        self.assertEqual(receipt["manifestHash"], backlog.digest(data))
        self.assertEqual(set(receipt["ids"]), {"umbrella"} | {item["key"] for item in data["groups"] + data["tasks"]})
        self.assertEqual(receipt["createdLeafTasks"] + receipt["updatedExistingLeafTasks"], len(data["tasks"]))
        self.assertEqual(len(set(receipt["ids"].values())), len(receipt["ids"]))

    def test_duplicate_titles(self):
        self.manifest["tasks"][0]["title"] = "  QUALITY "
        with self.assertRaisesRegex(ValueError, "Duplicate item title"):
            self.plan()

    def test_utf8_title_limit(self):
        self.manifest["tasks"][0]["title"] = "я" * 121
        with self.assertRaisesRegex(ValueError, "title length"):
            self.plan()

    def test_read_only_plan_and_hierarchy(self):
        original = copy.deepcopy(self.records)
        plan = self.plan()
        self.assertEqual([op["action"] for op in plan["operations"]], ["create", "create"])
        self.assertEqual([op["parentKey"] for op in plan["operations"]], ["umbrella", "quality"])
        self.assertEqual(self.records, original)
        self.assertNotIn("dueAt", plan["operations"][1]["payload"])
        self.assertNotIn("estimateMinutes", plan["operations"][1]["payload"])

    def test_wrong_identity_or_workspace(self):
        self.me["username"] = "other"
        with self.assertRaisesRegex(ValueError, "Wrong account"):
            self.plan()
        self.me["username"] = "artkozk"
        self.records[0]["workspaceId"] = "client-crm"
        with self.assertRaisesRegex(ValueError, "Wrong workspace"):
            self.plan()

    def test_truncated_snapshot(self):
        self.records += [record(str(i)) for i in range(499)]
        with self.assertRaisesRegex(ValueError, "truncated"):
            self.plan()

    def test_missing_known_id_and_ambiguous_titles(self):
        self.manifest["tasks"][0]["existingId"] = "missing"
        with self.assertRaisesRegex(ValueError, "Known record absent"):
            self.plan()
        del self.manifest["tasks"][0]["existingId"]
        self.records += [record("one", "Mobile layout"), record("two", " MOBILE  layout ")]
        with self.assertRaisesRegex(ValueError, "Ambiguous match"):
            self.plan()

    def test_id_and_other_title_match_is_ambiguous(self):
        self.manifest["tasks"][0]["existingId"] = "one"
        self.records += [record("one", "Renamed task"), record("two", "Mobile layout")]
        with self.assertRaisesRegex(ValueError, "Ambiguous match"):
            self.plan()

    def test_append_preserves_owner_status_parent_and_text(self):
        old = record("mobile", "Mobile layout", parentId="existing-parent")
        self.records.append(old)
        op = self.plan()["operations"][1]
        self.assertEqual(op["action"], "append")
        self.assertTrue(op["payload"]["description"].startswith(old["description"]))
        self.assertEqual(set(op["payload"]), {"description", "reason", "expectedUpdatedAt"})
        self.assertEqual(op["existingParentId"], "existing-parent")

    def test_closed_task_is_preserved_closed_parent_stops(self):
        self.records.append(record("mobile", "Mobile layout", status="completed"))
        self.assertEqual(self.plan()["operations"][1]["action"], "preserve_closed")
        self.records.append(record("quality", "Quality", status="archived"))
        with self.assertRaisesRegex(ValueError, "Closed parent"):
            self.plan()

    def test_other_owner_is_not_reassigned(self):
        self.records.append(record("mobile", "Mobile layout", ownerId=2))
        with self.assertRaisesRegex(ValueError, "another owner"):
            self.plan()

    def test_execute_is_verified_and_rerun_is_noop(self):
        api = FakeAPI(self.records)
        events = []
        ids = backlog.execute(api, self.plan(), events.append)
        self.assertEqual(api.records[ids["mobile"]]["parentId"], ids["quality"])
        self.assertEqual(len([event for event in events if event["phase"] == "verified"]), 2)
        again = backlog.make_plan(self.manifest, self.me, list(api.records.values()))
        self.assertTrue(all(op["action"] == "unchanged" for op in again["operations"]))

    def test_uncertain_post_stops_and_next_plan_finds_written_record(self):
        api = FakeAPI(self.records)
        api.fail_after_post = True
        with self.assertRaises(TimeoutError):
            backlog.execute(api, self.plan(), lambda _: None)
        self.assertEqual(len(api.writes), 1)
        again = backlog.make_plan(self.manifest, self.me, list(api.records.values()))
        self.assertEqual([op["action"] for op in again["operations"]], ["unchanged", "create"])

    def test_snapshot_detects_concurrent_change(self):
        before = self.plan()
        self.records[0]["updatedAt"] = "later"
        self.assertNotEqual(before["snapshotHash"], self.plan()["snapshotHash"])

    def test_append_conflict_stops(self):
        self.records.append(record("mobile", "Mobile layout"))
        plan = self.plan()
        api = FakeAPI(self.records)
        api.records["mobile"]["updatedAt"] = "concurrent-change"
        with self.assertRaisesRegex(ValueError, "Conflict"):
            backlog.execute(api, plan, lambda _: None)

    def test_redirect_refused(self):
        with self.assertRaisesRegex(ValueError, "redirect refused"):
            backlog.NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://other.example")


if __name__ == "__main__":
    unittest.main()
