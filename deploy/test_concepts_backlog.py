import copy
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("backlog", ROOT / "deploy/sync-requirements-backlog.py")
backlog = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backlog)


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


class ConceptCoverageTests(unittest.TestCase):
    def setUp(self):
        self.old = read("docs/product/BIZFLOW_REQUIREMENTS_BACKLOG_2026_09_02.json")
        self.receipt = read("docs/operations/BIZFLOW_REQUIREMENTS_BACKLOG_RECEIPT_2026_09_02.json")
        self.manifest = read("docs/product/BIZFLOW_CONCEPTS_BACKLOG_2026_09_02.json")
        self.coverage = read("docs/product/BIZFLOW_CONCEPTS_COVERAGE_2026_09_02.json")

    def test_manifest_and_existing_ids(self):
        self.assertEqual(backlog.validate(self.manifest)["tasks"], 66)
        self.assertEqual(len(self.manifest["groups"]), 13)
        new_items = {x["key"]: x for x in self.manifest["groups"] + self.manifest["tasks"]}
        for old in self.old["groups"] + self.old["tasks"]:
            self.assertEqual(new_items[old["key"]]["existingId"], self.receipt["ids"][old["key"]])
        self.assertEqual(self.manifest["umbrellaId"], self.old["umbrellaId"])

    def test_complete_coverage_and_sources(self):
        expected = {f"A{i:02d}" for i in range(1, 57)} | {f"B{i:02d}" for i in range(1, 27)}
        rows = self.coverage["rows"]
        self.assertEqual(len(rows), len(expected))
        self.assertEqual({x["id"] for x in rows}, expected)
        task_keys = {x["key"] for x in self.manifest["tasks"]}
        for row in rows:
            self.assertIn(row["status"], {"implemented", "partial", "missing", "guardrail"})
            self.assertTrue(set(row["taskKeys"]) <= task_keys)
            if row["status"] != "implemented":
                self.assertTrue(row["taskKeys"], row["id"])
        self.assertEqual(self.coverage["sources"], self.manifest["sourceFiles"])
        self.assertEqual(len(self.manifest["sourceFiles"]), 2)
        for paths in self.coverage["evidence"].values():
            if isinstance(paths, list):
                for path in paths:
                    self.assertTrue((ROOT / path.split(":")[0]).is_file(), path)

    def test_prior_criteria_and_unrelated_tasks_are_preserved(self):
        new_tasks = {x["key"]: x for x in self.manifest["tasks"]}
        changed = set(self.manifest["conceptAmendments"]["updatedTaskKeys"])
        new = set(self.manifest["conceptAmendments"]["newTaskKeys"])
        self.assertEqual(len(changed), 24)
        self.assertEqual(len(new), 3)
        self.assertFalse(changed & new)
        self.assertEqual(set(new_tasks) - {x["key"] for x in self.old["tasks"]}, new)
        for old in self.old["tasks"]:
            task = copy.deepcopy(new_tasks[old["key"]])
            task.pop("existingId")
            self.assertTrue(set(old["acceptance"]) <= set(task["acceptance"]))
            for field in ("title", "group", "status", "priority"):
                self.assertEqual(task[field], old[field])
            if old["key"] not in changed:
                self.assertEqual(task, {k: v for k, v in old.items() if k != "existingId"})
        for key in new:
            self.assertNotIn("existingId", new_tasks[key])
            self.assertEqual(new_tasks[key]["status"], "planned")

    def test_expected_append_plan_and_idempotence(self):
        me = {"id": 1, "username": "artkozk"}
        records = [{"id": self.manifest["umbrellaId"], "title": "Root",
                    "description": "", "status": "in_progress", "type": "goal",
                    "ownerId": 1, "workspaceId": "bizflow-team"}]
        for old in self.old["groups"] + self.old["tasks"]:
            records.append({
                "id": self.receipt["ids"][old["key"]], "title": old["title"],
                "description": "Preserved history\n" + backlog.description(self.old, old),
                "status": old.get("status", "in_progress"),
                "type": "task" if "group" in old else "goal", "ownerId": 1,
                "workspaceId": "bizflow-team", "updatedAt": "2026-09-02T20:00:00Z",
                "parentId": self.receipt["ids"].get(old.get("group"), self.manifest["umbrellaId"])})
        plan = backlog.make_plan(self.manifest, me, records)
        actions = {x["key"]: x["action"] for x in plan["operations"]}
        self.assertEqual({k for k, v in actions.items() if v == "create"},
                         set(self.manifest["conceptAmendments"]["newTaskKeys"]))
        self.assertEqual({k for k, v in actions.items() if v == "append"},
                         set(self.manifest["conceptAmendments"]["updatedTaskKeys"]) | {"personal", "profile"})
        ids = {x["key"]: x.get("recordId", "new-" + x["key"]) for x in plan["operations"]}
        ids["umbrella"] = self.manifest["umbrellaId"]
        by_id = {r["id"]: r for r in records}
        for op in plan["operations"]:
            if op["action"] == "append":
                before = by_id[op["recordId"]]["description"]
                self.assertTrue(op["payload"]["description"].startswith(before + "\n\n"))
                by_id[op["recordId"]]["description"] = op["payload"]["description"]
            elif op["action"] == "create":
                records.append({**op["payload"], "id": ids[op["key"]],
                                "parentId": ids[op["parentKey"]], "workspaceId": "bizflow-team"})
        repeated = backlog.make_plan(self.manifest, me, records)
        self.assertTrue(all(x["action"] == "unchanged" for x in repeated["operations"]))

    def test_delivery_receipt_matches_coverage(self):
        receipt = read("docs/operations/BIZFLOW_CONCEPTS_BACKLOG_RECEIPT_2026_09_02.json")
        self.assertEqual(receipt["status"], "synced")
        self.assertEqual(receipt["manifestHash"], backlog.digest(self.manifest))
        keys = {x["key"] for x in self.manifest["groups"] + self.manifest["tasks"]}
        self.assertEqual(set(receipt["ids"]), keys | {"umbrella"})
        self.assertEqual(len(set(receipt["ids"].values())), len(receipt["ids"]))
        for key, record_id in self.receipt["ids"].items():
            self.assertEqual(receipt["ids"][key], record_id)
        self.assertEqual(receipt["createdLeafTasks"], 3)
        self.assertEqual(receipt["updatedExistingLeafTasks"], 24)
        self.assertEqual(receipt["verification"]["repeatedPlan"], {"unchanged": 79})
        self.assertEqual(receipt["verification"]["unrelatedRecordsChanged"], 0)


if __name__ == "__main__":
    unittest.main()
