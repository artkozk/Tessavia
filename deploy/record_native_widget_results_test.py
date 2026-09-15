"""Synthetic release-recorder checks. No network or production database access."""
import copy
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('native_recorder', Path(__file__).with_name('record-native-widget-results-20260915.py'))
REC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REC)


class NativeRecorderTests(unittest.TestCase):
    def setUp(self):
        self.rows = {}
        self.writes = []
        self.counter = 0
        for record_id, kind, parent, marker in (
            (REC.ANDROID_ID, 'task', REC.PARENT_ID, REC.ANDROID_REQUEST),
            (REC.PARENT_ID, 'task', REC.GOAL_ID, 'Historical widget direction'),
            (REC.GOAL_ID, 'goal', None, 'Historical mobile goal'),
        ):
            self.rows[record_id] = {'record': {
                'id': record_id, 'workspaceId': REC.WORKSPACE, 'type': kind,
                'parentId': parent, 'ownerId': 1, 'authorId': 1, 'title': 'Original title',
                'description': marker + '\nOld detailed acceptance.', 'priority': 'normal',
                'status': 'in_progress' if record_id == REC.ANDROID_ID else 'planned',
                'result': 'Existing result', 'updatedAt': 'v0', 'progress': 12,
                'proofCount': 0, 'reviewPending': False, 'customFields': {'keep': 'value'},
                'dueAt': None, 'estimateMinutes': 0, 'actualMinutes': 0,
            }, 'proofs': []}

    def full_tasks(self):
        rows = [copy.deepcopy(value['record']) for value in self.rows.values() if value['record']['type'] == 'task']
        return rows, len(rows)

    def api(self, path, method='GET', body=None, key=None):
        if path == '/records' and method == 'POST':
            self.assertEqual(key, 'ios-builder-widget-20260914')
            self.writes.append((path, method, copy.deepcopy(body)))
            record = copy.deepcopy(self.rows[REC.ANDROID_ID]['record'])
            record.update(copy.deepcopy(body))
            record.update(id='ios-child', authorId=1, workspaceId=REC.WORKSPACE,
                          result='', updatedAt='created', progress=0, proofCount=0)
            self.rows['ios-child'] = {'record': record, 'proofs': []}
            return {'id': 'ios-child'}
        parts = path.strip('/').split('/')
        detail = self.rows[parts[1]]
        if method == 'GET':
            return copy.deepcopy(detail)
        self.writes.append((path, method, copy.deepcopy(body)))
        record = detail['record']
        if method == 'PATCH':
            self.assertEqual(body['expectedUpdatedAt'], record['updatedAt'])
            record.update({key: value for key, value in body.items() if key not in ('expectedUpdatedAt', 'reason')})
            self.counter += 1
            record['updatedAt'] = 'v' + str(self.counter)
        elif parts[-1] == 'proofs':
            detail['proofs'].append(copy.deepcopy(body))
            record['proofCount'] += 1
        elif parts[-1] == 'complete':
            self.assertFalse(body['notifyPartners'])
            self.assertIn(record['id'], (REC.ANDROID_ID, 'ios-child'))
            record.update(status='completed', result=body['result'], progress=100, completedAt='done')
            self.counter += 1
            record['updatedAt'] = 'v' + str(self.counter)
        else:
            self.fail('Unexpected write')
        return copy.deepcopy(record)

    def test_android_only_completed_parents_resumed_history_preserved_retry_no_writes(self):
        before = copy.deepcopy(self.rows)
        receipt = REC.record_results(self.api, self.full_tasks, True)
        self.assertEqual(receipt['iosTaskId'], 'ios-child')
        self.assertEqual(self.rows['ios-child']['record']['status'], 'in_progress')
        self.assertEqual(self.rows[REC.ANDROID_ID]['record']['status'], 'completed')
        for record_id in (REC.ANDROID_ID, REC.PARENT_ID, REC.GOAL_ID):
            after = self.rows[record_id]['record']
            self.assertTrue(after['description'].startswith(before[record_id]['record']['description']))
            for key in ('title', 'ownerId', 'authorId', 'priority', 'customFields', 'dueAt'):
                self.assertEqual(after[key], before[record_id]['record'][key])
        for record_id in (REC.PARENT_ID, REC.GOAL_ID):
            self.assertEqual(self.rows[record_id]['record']['status'], 'in_progress')
        self.assertTrue(self.rows[REC.ANDROID_ID]['record']['result'].startswith('Existing result'))
        writes = len(self.writes)
        REC.record_results(self.api, self.full_tasks, True)
        self.assertEqual(len(self.writes), writes)

    def test_dry_run_never_writes(self):
        before = copy.deepcopy(self.rows)
        result = REC.record_results(self.api, self.full_tasks)
        self.assertFalse(result['apply'])
        self.assertEqual(self.rows, before)
        self.assertEqual(self.writes, [])

    def test_parent_completed_or_wrong_child_scope_aborts_before_writes(self):
        original = copy.deepcopy(self.rows)
        for record_id, field, value in ((REC.GOAL_ID, 'status', 'completed'),
                (REC.PARENT_ID, 'status', 'postponed'), (REC.ANDROID_ID, 'ownerId', 2),
                (REC.ANDROID_ID, 'workspaceId', 'other'), (REC.ANDROID_ID, 'description', 'changed')):
            self.rows = copy.deepcopy(original)
            self.rows[record_id]['record'][field] = value
            with self.assertRaises(RuntimeError):
                REC.record_results(self.api, self.full_tasks, True)
            self.assertEqual(self.writes, [])

    def test_optional_ci_closes_only_bounded_ios_task(self):
        ci = {'runId': 123, 'url': 'https://github.com/artkozk/Tessavia/actions/runs/123', 'sourceCommit': 'a' * 40}
        REC.record_results(self.api, self.full_tasks, True, ci)
        self.assertEqual(self.rows['ios-child']['record']['status'], 'completed')
        for parent in (REC.PARENT_ID, REC.GOAL_ID):
            self.assertEqual(self.rows[parent]['record']['status'], 'in_progress')
        writes = len(self.writes)
        REC.record_results(self.api, self.full_tasks, True, ci)
        self.assertEqual(len(self.writes), writes)

    def test_patch_refuses_stale_snapshot(self):
        old = copy.deepcopy(self.rows[REC.PARENT_ID]['record'])
        self.rows[REC.PARENT_ID]['record']['updatedAt'] = 'v-other'
        with self.assertRaises(RuntimeError):
            REC.patch_record(self.api, old, REC.PARENT_MARKER, REC.PARENT_EVIDENCE, 'in_progress', True)
        self.assertEqual(self.writes, [])

    def test_ci_url_rejects_other_repositories_and_query_before_network(self):
        for url in ('https://github.com/other/Tessavia/actions/runs/12',
                    'https://github.com/artkozk/Tessavia/actions/runs/12?token=secret', 'http://github.com/artkozk/Tessavia/actions/runs/12'):
            with self.assertRaises(RuntimeError):
                REC.verify_ci(url, None)


if __name__ == '__main__':
    unittest.main()
