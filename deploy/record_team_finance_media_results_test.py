"""No-network tests of exact card scope, proof collisions, retries and evidence."""
import copy
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('team_finance_media_recorder', Path(__file__).with_name('record-team-finance-media-results-20260915.py'))
REC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REC)


class TeamFinanceMediaRecorderChecks(unittest.TestCase):
    def setUp(self):
        self.cards = {task['id']: {'record': {
            'id': task['id'], 'workspaceId': REC.WORKSPACE, 'type': 'task',
            'title': task['title'], 'description': task['request'] + '\nOriginal detailed criteria.',
            'ownerId': 1, 'authorId': 1, 'parentId': REC.PARENT_ID, 'status': 'in_progress',
            'updatedAt': 'v0', 'result': 'Earlier result', 'proofCount': 0,
            'priority': 'high', 'customFields': {'keep': 3}}, 'proofs': []} for task in REC.TASKS}
        self.writes = []
        self.reads = []
        self.evidence = {task['id']: task['result'] + '\nVerified synthetic evidence.' for task in REC.TASKS}
        self.acceptance = {'goTests': True, 'goVet': True, 'migrationPreserved': True, 'rollbackTrial': True,
            'goTestCount': 435, 'nodeTests': 649, 'buildInputs': 540, 'verifierTests': 13,
            'viewports': [390], 'browserSummary': 'Synthetic example of actual browser evidence with dimensions.',
            'physicalPhoneVerified': False}
        self.identity = ('/opt/business-control/releases/20260915-team-finance-media-aaaaaaa', 'a' * 40,
                         'b' * 64, '/var/lib/business-control/backups/pre-team-finance-media-20260915T100000Z')

    def api(self, path, method='GET', body=None):
        self.assertTrue(REC.allowed_request(path, method, True), 'Actual recorder crossed API allowlist')
        task_id = path.split('/')[2]
        self.assertIn(task_id, REC.TASK_IDS)
        detail = self.cards[task_id]
        if method == 'GET':
            self.reads.append(task_id)
            return copy.deepcopy(detail)
        self.writes.append((path, method, copy.deepcopy(body)))
        record = detail['record']
        if method == 'PATCH':
            self.assertEqual(body['expectedUpdatedAt'], record['updatedAt'])
            self.assertEqual(set(body), {'expectedUpdatedAt', 'description'})
            record['description'] = body['description']
            record['updatedAt'] = 'patched'
        elif path.endswith('/proofs'):
            detail['proofs'].append(copy.deepcopy(body))
            record['proofCount'] += 1
        elif path.endswith('/complete'):
            self.assertFalse(body['notifyPartners'])
            record.update(status='completed', result=body['result'], updatedAt='completed', progress=100)
        else:
            self.fail('Unexpected mutation')

    def test_exactly_two_tasks_complete_and_retry_preserves_every_old_field(self):
        before = copy.deepcopy(self.cards)
        result = REC.record_results(self.api, self.evidence, True)
        self.assertEqual([row['status'] for row in result['tasks']], ['completed', 'completed'])
        self.assertEqual(len(self.writes), 6)
        self.assertEqual(set(path.split('/')[2] for path, _, _ in self.writes), REC.TASK_IDS)
        self.assertFalse(result['parentWritten'])
        self.assertNotIn(REC.PARENT_ID, self.reads)
        for task_id, detail in self.cards.items():
            self.assertTrue(detail['record']['description'].startswith(before[task_id]['record']['description']))
            self.assertTrue(detail['record']['result'].startswith(before[task_id]['record']['result']))
            for key in ('priority', 'customFields', 'parentId', 'ownerId', 'authorId', 'title'):
                self.assertEqual(detail['record'][key], before[task_id]['record'][key])
        REC.record_results(self.api, self.evidence, True)
        self.assertEqual(len(self.writes), 6)

    def test_dry_run_is_card_read_only(self):
        before = copy.deepcopy(self.cards)
        result = REC.record_results(self.api, self.evidence)
        self.assertFalse(result['apply'])
        self.assertEqual(self.writes, [])
        self.assertEqual(self.cards, before)

    def test_second_card_identity_change_aborts_before_first_write(self):
        second = REC.TASKS[1]['id']
        baseline = copy.deepcopy(self.cards)
        for key, value in (('ownerId', 2), ('parentId', 'other'), ('status', 'cancelled'),
                           ('title', 'Different accepted work'), ('workspaceId', 'customer-team'),
                           ('collectionId', 'workflow-board'), ('decisionMakerId', 3)):
            self.cards = copy.deepcopy(baseline)
            self.cards[second]['record'][key] = value
            with self.assertRaises(RuntimeError):
                REC.record_results(self.api, self.evidence, True)
            self.assertEqual(self.writes, [])

    def test_tampered_proof_and_result_marker_aborts_before_any_write(self):
        task = REC.TASKS[1]
        baseline = copy.deepcopy(self.cards)
        for proof in ({'kind': 'text', 'content': task['result'] + '\nOther release'},
                      {'kind': 'link', 'content': self.evidence[task['id']]}):
            self.cards = copy.deepcopy(baseline)
            self.cards[task['id']]['proofs'] = [proof]
            with self.assertRaises(RuntimeError):
                REC.record_results(self.api, self.evidence, True)
            self.assertEqual(self.writes, [])
        self.cards = copy.deepcopy(baseline)
        self.cards[task['id']]['record']['result'] += task['result'] + '\nChanged result'
        with self.assertRaises(RuntimeError):
            REC.record_results(self.api, self.evidence, True)
        self.assertEqual(self.writes, [])

    def test_previously_completed_cards_stay_closed_and_do_not_duplicate_proofs(self):
        for detail in self.cards.values():
            detail['record']['status'] = 'completed'
        REC.record_results(self.api, self.evidence, True)
        self.assertEqual(len(self.writes), 4)
        self.assertFalse(any(path.endswith('/complete') for path, _, _ in self.writes))
        REC.record_results(self.api, self.evidence, True)
        self.assertEqual(len(self.writes), 4)
        self.assertTrue(all(len(detail['proofs']) == 1 for detail in self.cards.values()))

    def test_allowlist_rejects_parent_new_task_query_suffix_and_prefix_lookalikes(self):
        child = next(iter(REC.TASK_IDS))
        for path in ('/records/' + REC.PARENT_ID, '/records/' + child + 'evil',
                     '/records/' + child + '?workspaceId=other', '/records',
                     '/records/' + child + '/comments', '/workspace/finance'):
            for method in ('GET', 'PATCH', 'POST', 'DELETE'):
                self.assertFalse(REC.allowed_request(path, method, True), (path, method))
        for task_id in REC.TASK_IDS:
            for suffix, method in (('', 'PATCH'), ('/proofs', 'POST'), ('/complete', 'POST')):
                self.assertTrue(REC.allowed_request('/records/' + task_id + suffix, method, True))
                self.assertFalse(REC.allowed_request('/records/' + task_id + suffix, method, False))

    def test_missing_checks_and_invented_physical_acceptance_are_rejected(self):
        REC.validate_acceptance(self.acceptance)
        for key, value in (('goTests', False), ('goTestCount', True), ('goTestCount', 434),
                           ('nodeTests', 648), ('verifierTests', 12), ('rollbackTrial', False),
                           ('viewports', [1280]), ('viewports', [390, 390]), ('physicalPhoneVerified', True)):
            invalid = copy.deepcopy(self.acceptance)
            invalid[key] = value
            with self.assertRaises(RuntimeError):
                REC.validate_acceptance(invalid)

    def test_exact_release_commit_and_backup_prefix_are_bound(self):
        REC.validate_identity(*self.identity)
        for index, value in ((0, '/opt/business-control/releases/20260915-smart-select-aaaaaaa'),
                             (0, '/opt/business-control/releases/20260915-team-finance-media-aaaaaaa/../other'),
                             (1, 'c' * 40), (2, 'not-a-hash'),
                             (3, '/var/lib/business-control/backups/pre-smart-select-20260915T100000Z')):
            invalid = list(self.identity)
            invalid[index] = value
            with self.assertRaises(RuntimeError):
                REC.validate_identity(*invalid)

    def test_generated_evidence_uses_actual_widths_counts_and_exactly_the_two_ids(self):
        evidence = REC.evidence_for(*self.identity, self.acceptance)
        self.assertEqual(set(evidence), REC.TASK_IDS)
        for text in evidence.values():
            self.assertIn('435 Go-тестовых событий', text)
            self.assertIn('649 Node-тестов', text)
            self.assertIn('Браузерные ширины 390 px', text)
            self.assertNotIn('320/390/1280', text)
            self.assertIn('Физический телефон не проверялся', text)
        evidence['another-task'] = 'unexpected'
        with self.assertRaises(RuntimeError):
            REC.record_results(self.api, evidence, True)
        self.assertEqual(self.writes, [])


if __name__ == '__main__':
    unittest.main()
