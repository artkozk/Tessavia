"""No-network tests of exact card scope, proof collisions, retries and evidence."""
import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('media_variants_recorder', Path(__file__).with_name('record-media-variants-results-20260915.py'))
REC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REC)


class MediaVariantsRecorderChecks(unittest.TestCase):
    def setUp(self):
        self.cards = {task['id']: {'record': {
            'id': task['id'], 'workspaceId': REC.WORKSPACE, 'type': 'task',
            'title': task['title'], 'description': task['request'] + '\nOriginal detailed criteria.',
            'ownerId': 1, 'authorId': 1, 'parentId': REC.PARENT_ID, 'status': 'in_progress',
            'updatedAt': 'v0', 'result': 'Earlier result', 'proofCount': 0,
            'priority': 'high', 'customFields': {'keep': 3}}, 'proofs': [],
            'comments': [{'id': 'existing', 'body': 'Сохранить обсуждение'}]} for task in REC.TASKS}
        self.writes = []
        self.reads = []
        self.evidence = {task['id']: task['result'] + '\nVerified synthetic evidence.' for task in REC.TASKS}
        self.acceptance = {'goTests': True, 'goVet': True, 'migrationPreserved': True, 'rollbackTrial': True,
            'goTestCount': 442, 'nodeTests': 670, 'buildInputs': 540, 'verifierTests': 21,
            'viewports': [320, 390, 1280], 'browserSummary': 'Synthetic example of actual browser evidence with dimensions.',
            'scenarios': {key: True for key in REC.SCENARIOS},
            'physicalPhoneVerified': False}
        self.identity = ('/opt/business-control/releases/20260915-media-variants-aaaaaaa', 'a' * 40,
                         'b' * 64, '/var/lib/business-control/backups/pre-media-variants-20260915T100000Z')

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
            self.assertEqual(detail['comments'], before[task_id]['comments'])
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
        for key, value in (('goTests', False), ('goTestCount', True), ('goTestCount', 441),
                           ('nodeTests', 669), ('verifierTests', 20), ('rollbackTrial', False),
                           ('viewports', [1280]), ('viewports', [390, 390]), ('viewports', [320, 390, 1280, True]),
                           ('scenarios', {}), ('physicalPhoneVerified', True)):
            invalid = copy.deepcopy(self.acceptance)
            invalid[key] = value
            with self.assertRaises(RuntimeError):
                REC.validate_acceptance(invalid)
        for name in REC.SCENARIOS:
            invalid = copy.deepcopy(self.acceptance)
            invalid['scenarios'][name] = False
            with self.assertRaises(RuntimeError):
                REC.validate_acceptance(invalid)

    def test_exact_release_commit_and_backup_prefix_are_bound(self):
        REC.validate_identity(*self.identity)
        for index, value in ((0, '/opt/business-control/releases/20260915-smart-select-aaaaaaa'),
                             (0, '/opt/business-control/releases/20260915-media-variants-aaaaaaa/../other'),
                             (1, 'c' * 40), (1, REC.PREVIOUS_COMMIT), (2, 'not-a-hash'),
                             (3, '/var/lib/business-control/backups/pre-smart-select-20260915T100000Z')):
            invalid = list(self.identity)
            invalid[index] = value
            with self.assertRaises(RuntimeError):
                REC.validate_identity(*invalid)

    def test_generated_evidence_uses_actual_widths_counts_and_exactly_the_two_ids(self):
        evidence = REC.evidence_for(*self.identity, self.acceptance)
        self.assertEqual(set(evidence), REC.TASK_IDS)
        for text in evidence.values():
            self.assertIn('442 Go-тестовых событий', text)
            self.assertIn('670 Node-тестов', text)
            self.assertIn('Браузерные ширины 320,390,1280 px', text)
            self.assertIn('076/148 таблиц', text)
            self.assertIn(REC.PREVIOUS_COMMIT, text)
            self.assertNotIn('Миграции 073/074', text)
            self.assertNotIn('320/390/1280', text)
            self.assertIn('Физический телефон не проверялся', text)
        evidence['another-task'] = 'unexpected'
        with self.assertRaises(RuntimeError):
            REC.record_results(self.api, evidence, True)
        self.assertEqual(self.writes, [])

    def test_stale_record_after_joint_preflight_aborts_before_patch(self):
        first = REC.TASKS[0]['id']
        reads = 0
        def changed(path, method='GET', body=None):
            nonlocal reads
            if method == 'GET' and path == '/records/' + first:
                reads += 1
                if reads == 2:
                    self.cards[first]['record']['description'] += '\nConcurrent edit'
                    self.cards[first]['record']['updatedAt'] = 'changed'
            return self.api(path, method, body)
        with self.assertRaisesRegex(RuntimeError, 'changed after review'):
            REC.record_results(changed, self.evidence, True)
        self.assertEqual(self.writes, [])

    def test_lost_completion_response_can_resume_without_duplicate_proof_or_text(self):
        lost = False
        def interrupted(path, method='GET', body=None):
            nonlocal lost
            result = self.api(path, method, body)
            if method == 'POST' and path.endswith('/complete') and not lost:
                lost = True
                raise RuntimeError('Synthetic response lost')
            return result
        with self.assertRaisesRegex(RuntimeError, 'response lost'):
            REC.record_results(interrupted, self.evidence, True)
        REC.record_results(self.api, self.evidence, True)
        self.assertEqual(len(self.writes), 6)
        self.assertTrue(all(len(detail['proofs']) == 1 for detail in self.cards.values()))

    def test_prior_release_tasks_cannot_be_read_or_written(self):
        for task_id in ('ad787975b390e40313472673274982d4', '16fbc52ae06d4d296dff09e93f3319ba'):
            for suffix, method in (('', 'GET'), ('', 'PATCH'), ('/proofs', 'POST'), ('/complete', 'POST')):
                self.assertFalse(REC.allowed_request('/records/' + task_id + suffix, method, True))


class MediaVariantsReleaseChecks(unittest.TestCase):
    def backup(self, directory):
        backup = Path(directory).resolve()
        (backup / 'candidate-commit.txt').write_text('a' * 40)
        (backup / 'previous-release.txt').write_text(REC.PREVIOUS)
        for name in ('business-control.db', 'cutover.db'):
            connection = sqlite3.connect(backup / name)
            connection.execute('CREATE TABLE example(id INTEGER PRIMARY KEY)')
            connection.close()
        for name in ('uploads.tar.gz', 'cutover-uploads.tar.gz', 'business-control.env', 'business-control.nginx.conf'):
            (backup / name).write_bytes(b'Local synthetic backup material')
        for name in ('local-health.json', 'public-health.json'):
            (backup / name).write_text(json.dumps({'status': 'ok'}))
        self.checksums(backup)
        return backup

    def checksums(self, backup):
        names = ('business-control.db', 'cutover.db', 'uploads.tar.gz', 'cutover-uploads.tar.gz', 'business-control.env', 'business-control.nginx.conf')
        (backup / 'SHA256SUMS').write_text('\n'.join(REC.sha_file(backup / name) + '  ' + name for name in names))

    def test_backup_requires_all_payload_hashes_matching_source_and_previous_release(self):
        with tempfile.TemporaryDirectory() as temporary:
            backup = self.backup(temporary)
            REC.verify_backup(backup, 'a' * 40)
            (backup / 'candidate-commit.txt').write_text('c' * 40)
            with self.assertRaisesRegex(RuntimeError, 'source differs'):
                REC.verify_backup(backup, 'a' * 40)
            (backup / 'candidate-commit.txt').write_text('a' * 40)
            (backup / 'previous-release.txt').write_text('/opt/unreviewed')
            with self.assertRaisesRegex(RuntimeError, 'Previous release differs'):
                REC.verify_backup(backup, 'a' * 40)
            (backup / 'previous-release.txt').write_text(REC.PREVIOUS)
            (backup / 'uploads.tar.gz').write_bytes(b'Changed')
            with self.assertRaisesRegex(RuntimeError, 'checksum differs'):
                REC.verify_backup(backup, 'a' * 40)

    def test_backup_manifest_rejects_missing_duplicate_and_traversal_entries(self):
        with tempfile.TemporaryDirectory() as temporary:
            backup = self.backup(temporary)
            rows = (backup / 'SHA256SUMS').read_text().splitlines()
            for invalid in (rows[:-1], rows + [rows[0]], rows + ['a' * 64 + '  ../outside']):
                (backup / 'SHA256SUMS').write_text('\n'.join(invalid))
                with self.assertRaises(RuntimeError):
                    REC.verify_backup(backup, 'a' * 40)

    def test_matching_hash_does_not_override_backup_integrity_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            backup = self.backup(temporary)
            (backup / 'cutover.db').write_bytes(b'Not a SQLite database')
            self.checksums(backup)
            with self.assertRaises(sqlite3.DatabaseError):
                REC.verify_backup(backup, 'a' * 40)

    def test_running_binary_must_be_same_live_process_and_hash(self):
        with mock.patch.object(REC.subprocess, 'check_output', return_value='123\n'), mock.patch.object(REC, 'Path') as path, mock.patch.object(REC, 'sha_file', return_value='b' * 64):
            executable, target = mock.Mock(), mock.Mock()
            path.side_effect = lambda *parts: executable if parts[0] == '/proc' else target
            executable.resolve.return_value = target
            REC.verify_running_binary('/opt/release', 'b' * 64)
            executable.resolve.return_value = 'other'
            with self.assertRaisesRegex(RuntimeError, 'not this release'):
                REC.verify_running_binary('/opt/release', 'b' * 64)
            executable.resolve.return_value = target
            with self.assertRaisesRegex(RuntimeError, 'hash differs'):
                REC.verify_running_binary('/opt/release', 'c' * 64)
        with mock.patch.object(REC.subprocess, 'check_output', return_value='0\n'):
            with self.assertRaisesRegex(RuntimeError, 'no live process'):
                REC.verify_running_binary('/opt/release', 'b' * 64)


if __name__ == '__main__':
    unittest.main()
