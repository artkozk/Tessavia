"""Isolated scope, idempotency, freshness and acceptance checks for the recorder."""
import copy
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('smart_select_recorder', Path(__file__).with_name('record-smart-select-results-20260915.py'))
REC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REC)


class SmartSelectRecorderChecks(unittest.TestCase):
    def setUp(self):
        self.detail = {'record': {'id': REC.TASK_ID, 'workspaceId': REC.WORKSPACE, 'type': 'task',
            'title': REC.TASK_TITLE, 'description': REC.REQUEST_MARKER + '\nOriginal detailed criteria.',
            'ownerId': 1, 'authorId': 1, 'parentId': REC.PARENT_ID, 'status': 'in_progress',
            'updatedAt': 'v0', 'result': 'Previous result', 'proofCount': 0,
            'priority': 'high', 'customFields': {'keep': 3}}, 'proofs': []}
        self.writes = []
        self.evidence = REC.RESULT_MARKER + '\nVerified synthetic evidence.'
        self.acceptance = {'goTests': True, 'goVet': True, 'schemaUnchanged': True, 'rollbackTrial': True,
            'selectUnitTests': True, 'nodeTests': 621, 'buildInputs': 522, 'verifierTests': 12,
            'viewports': [320, 390, 1280], 'browserSummary': 'Synthetic example of actual browser evidence with dimensions.',
            'physicalPhoneVerified': False}

    def api(self, path, method='GET', body=None):
        self.assertTrue(path.startswith('/records/' + REC.TASK_ID))
        if method == 'GET':
            return copy.deepcopy(self.detail)
        self.writes.append((path, method, copy.deepcopy(body)))
        record = self.detail['record']
        if method == 'PATCH':
            self.assertEqual(body['expectedUpdatedAt'], record['updatedAt'])
            record['description'] = body['description']
            record['updatedAt'] = 'patched'
        elif path.endswith('/proofs'):
            self.detail['proofs'].append(copy.deepcopy(body))
            record['proofCount'] += 1
        elif path.endswith('/complete'):
            self.assertFalse(body['notifyPartners'])
            record.update(status='completed', result=body['result'], updatedAt='completed', progress=100)
        else:
            self.fail('Unexpected mutation')

    def test_only_one_task_completed_and_retry_does_not_duplicate_history(self):
        before = copy.deepcopy(self.detail['record'])
        result = REC.record_result(self.api, self.evidence, True)
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(len(self.writes), 3)
        after = self.detail['record']
        self.assertTrue(after['description'].startswith(before['description']))
        self.assertTrue(after['result'].startswith(before['result']))
        for key in ('priority', 'customFields', 'parentId', 'ownerId', 'title'):
            self.assertEqual(after[key], before[key])
        REC.record_result(self.api, self.evidence, True)
        self.assertEqual(len(self.writes), 3)

    def test_dry_run_does_not_mutate(self):
        before = copy.deepcopy(self.detail)
        REC.record_result(self.api, self.evidence)
        self.assertEqual(self.writes, [])
        self.assertEqual(before, self.detail)

    def test_changed_task_scope_stops_before_any_write(self):
        original = copy.deepcopy(self.detail)
        for key, value in (('ownerId', 2), ('parentId', 'other'), ('status', 'cancelled'), ('title', 'New criteria')):
            self.detail = copy.deepcopy(original)
            self.detail['record'][key] = value
            with self.assertRaises(RuntimeError):
                REC.record_result(self.api, self.evidence, True)
            self.assertEqual(self.writes, [])

    def test_acceptance_requires_all_checks_and_does_not_certify_physical_phone(self):
        REC.validate_acceptance(self.acceptance)
        for key, value in (('goTests', False), ('verifierTests', 11), ('viewports', [320, 1280]), ('physicalPhoneVerified', True)):
            invalid = copy.deepcopy(self.acceptance)
            invalid[key] = value
            with self.assertRaises(RuntimeError):
                REC.validate_acceptance(invalid)

    def test_commit_release_and_backup_are_bound(self):
        args = ('/opt/business-control/releases/20260915-smart-select-aaaaaaa', 'a' * 40,
                'b' * 64, '/var/lib/business-control/backups/pre-smart-select-20260915T090000Z')
        REC.validate_identity(*args)
        for index, value in ((0, '/opt/business-control/releases/20260914-android-widget-8304391'),
                             (1, 'c' * 40), (2, 'short'), (3, '/tmp/backup')):
            invalid = list(args)
            invalid[index] = value
            with self.assertRaises(RuntimeError):
                REC.validate_identity(*invalid)


if __name__ == '__main__':
    unittest.main()
