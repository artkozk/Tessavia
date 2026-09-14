"""Synthetic safety checks; no server connections or production writes."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('gestures_recorder', ROOT / 'deploy/record-mobile-gestures-today-20260914.py')
RECORDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RECORDER)
COMMIT = 'a' * 40


class RecordReleaseTests(unittest.TestCase):
    def setUp(self):
        self.details = {}
        for spec in RECORDER.SPECS:
            self.details[spec['id']] = {'record': {
                'id': spec['id'], 'workspaceId': RECORDER.WORKSPACE, 'type': 'task',
                'ownerId': 1, 'authorId': 1, 'parentId': RECORDER.ROOT_ID,
                'title': spec['title'], 'description': spec['requestMarker'] + ' Accepted criteria.',
                'status': 'in_progress',
            }, 'proofs': []}
        self.details[RECORDER.ROOT_ID] = {'record': {
            'id': RECORDER.ROOT_ID, 'workspaceId': RECORDER.WORKSPACE,
            'type': 'task', 'status': 'in_progress', 'description': 'Broad unfinished scope.',
        }, 'proofs': []}
        self.writes = []

    def api(self, path, method='GET', body=None):
        pieces = path.strip('/').split('/')
        self.assertEqual(pieces[0], 'records')
        self.assertIn(pieces[1], self.details)
        detail = self.details[pieces[1]]
        if method == 'GET':
            return copy.deepcopy(detail)
        self.assertEqual(method, 'POST')
        self.writes.append((path, copy.deepcopy(body)))
        if pieces[-1] == 'proofs':
            detail['proofs'].append(copy.deepcopy(body))
        elif pieces[-1] == 'complete':
            self.assertNotEqual(pieces[1], RECORDER.ROOT_ID)
            self.assertIs(body['notifyPartners'], False)
            detail['record']['status'] = 'completed'
        else:
            self.fail('Unexpected mutation path')

    def record(self, api=None):
        receipt = {'tasks': []}
        RECORDER.record_results(api or self.api, RECORDER.MARKER + ' ' + COMMIT + ' ', COMMIT, receipt)
        return receipt

    def test_two_children_complete_parent_receives_only_proof_and_retry_is_idempotent(self):
        before = copy.deepcopy(self.details)
        receipt = self.record()
        self.assertEqual(len(self.writes), 5)
        self.assertEqual(len(receipt['tasks']), 3)
        self.assertEqual(self.details[RECORDER.ROOT_ID]['record'], before[RECORDER.ROOT_ID]['record'])
        for spec in RECORDER.SPECS:
            self.assertEqual(self.details[spec['id']]['record']['status'], 'completed')
            self.assertEqual(self.details[spec['id']]['record']['description'], before[spec['id']]['record']['description'])
        self.record()
        self.assertEqual(len(self.writes), 5, 'Retry duplicated proof or completion')

    def test_changed_child_or_parent_aborts_before_any_mutation(self):
        original = copy.deepcopy(self.details)
        spec = RECORDER.SPECS[-1]
        for target, field, value in (
            (spec['id'], 'title', 'Changed acceptance'),
            (spec['id'], 'description', 'Missing request marker'),
            (spec['id'], 'ownerId', 2),
            (spec['id'], 'parentId', 'different'),
            (spec['id'], 'status', 'planned'),
            (RECORDER.ROOT_ID, 'status', 'completed'),
        ):
            with self.subTest(field=field, target=target):
                self.details = copy.deepcopy(original)
                self.details[target]['record'][field] = value
                with self.assertRaises(AssertionError):
                    self.record()
                self.assertEqual(self.writes, [])

    def test_criteria_changed_after_initial_read_are_not_completed(self):
        target = RECORDER.SPECS[0]['id']
        seen = 0

        def api(path, method='GET', body=None):
            nonlocal seen
            if path == '/records/' + target and method == 'GET':
                seen += 1
                if seen == 2:
                    self.details[target]['record']['description'] += ' New criterion.'
            return self.api(path, method, body)

        with self.assertRaisesRegex(AssertionError, 'Criteria changed'):
            self.record(api)
        self.assertEqual(self.writes, [])

    def test_exact_creation_receipt_is_required(self):
        created = {
            'apply': True, 'workspace': RECORDER.WORKSPACE, 'release': RECORDER.EXPECTED_PREVIOUS,
            'parent': {'id': RECORDER.ROOT_ID, 'status': 'in_progress', 'action': 'append_scope'},
            'tasks': [{'id': spec['id'], 'title': spec['title'], 'status': 'in_progress', 'action': 'create'}
                      for spec in RECORDER.SPECS],
        }
        RECORDER.verify_task_receipt(created)
        for change in ('apply', 'release', 'task', 'parent'):
            bad = copy.deepcopy(created)
            if change == 'apply':
                bad['apply'] = False
            elif change == 'release':
                bad['release'] = '/opt/business-control/releases/unknown'
            elif change == 'task':
                bad['tasks'][0]['id'] = bad['tasks'][1]['id']
            else:
                bad['parent']['status'] = 'completed'
            with self.subTest(change=change), self.assertRaises(AssertionError):
                RECORDER.verify_task_receipt(bad)

    def test_qa_gates_fail_before_reading_or_writing_production(self):
        env = {
            'CANDIDATE_COMMIT': COMMIT,
            'VERIFIED_RELEASE': '/opt/business-control/releases/20260914-mobile-gestures-today-aaaaaaa',
            'EXPECTED_SHA256': 'b' * 64,
            'VERIFIED_BACKUP': '/var/lib/business-control/backups/pre-mobile-gestures-today-test',
            'NODE_TESTS': '560', 'BUILD_INPUTS_VERIFIED': '515', 'DEPLOY_VERIFIER_TESTS': '51',
            'BROWSER_QA_SUMMARY': 'Synthetic description only; physical devices were not checked.',
        }
        gates = ('GO_TESTS_VERIFIED', 'GO_VET_VERIFIED', 'BROWSER_QA_VERIFIED',
                 'SCHEMA_UNCHANGED_VERIFIED', 'ROLLBACK_TRIAL_VERIFIED',
                 'GESTURE_UNIT_TESTS_VERIFIED', 'TODAY_HABIT_QA_VERIFIED')
        env.update({gate: 'true' for gate in gates})
        for gate in gates:
            with self.subTest(gate=gate), patch.dict(os.environ, {**env, gate: 'false'}, clear=True), \
                 patch.object(RECORDER.Path, 'resolve', side_effect=AssertionError('Reached filesystem')):
                with self.assertRaisesRegex(AssertionError, 'Missing acceptance: ' + gate):
                    RECORDER.main()


if __name__ == '__main__':
    unittest.main()
