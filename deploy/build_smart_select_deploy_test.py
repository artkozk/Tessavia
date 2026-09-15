"""Guard the new feature checks without weakening inherited rollout safeguards."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('smart_select_deploy', ROOT / 'deploy/build-smart-select-deploy-20260915.py')
GEN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GEN)


class SmartSelectRolloutTests(unittest.TestCase):
    def test_candidate_local_and_public_checks_include_new_module(self):
        script = GEN.generate()
        for marker in ('select-positioning.js?v=20260915-smart-select-1',
                       'export function selectMenuPosition(', 'export function selectOptionScrollTop(',
                       '.custom-select-menu[data-placement="viewport"] .custom-select-context', '--select-safe-top'):
            self.assertIn(marker, script)
        for target in ('http://127.0.0.1:18645', 'http://127.0.0.1:8522', 'https://control.e-rd.ru'):
            self.assertIn('check_http ' + target, script)
        self.assertEqual(script.count('"$base/select-positioning.js?v=20260915-smart-select-1"'), 1)
        self.assertIn('import { selectMenuPosition, selectOptionScrollTop }', script)
        self.assertIn('grep -qF "select-positioning.js?v=20260915-smart-select-1" "$dry/sw.js"', script)

    def test_previous_release_data_and_widget_checks_remain(self):
        script = GEN.generate()
        for marker in (GEN.PREVIOUS, GEN.PREVIOUS_SHA,
                       '/tmp/verify-smart-select-database.py --baseline "$backup/business-control.db"',
                       '/tmp/verify-smart-select-database.py "$backup/business-control.db" "$dry/check.db"',
                       '/tmp/verify-smart-select-database.py "$dry/rollback-before.db" "$dry/check.db"',
                       '/tmp/verify-smart-select-database.py --rollback-safe "$db"',
                       '/api/mobile/widget', '/api/me/widgets', 'data-chat-outbox', 'self.addEventListener',
                       'name NOT LIKE', ' = 130', 'flock -n 9'):
            self.assertIn(marker, script)
        self.assertNotIn('.restore', script)
        self.assertLess(script.index('--baseline "$backup/business-control.db"'), script.index('switch_started=1'))
        self.assertLess(script.index('ROLLBACK_COMPATIBILITY=ok'), script.index('switch_started=1'))

    def test_missing_or_duplicate_acceptance_anchor_rejects_generation(self):
        base = GEN.android.generate()
        anchor = f'  curl --max-time 15 -fsS "$base/app.js?v={GEN.android.VERSION}" > "$dry/app.js"\n'
        self.assertEqual(base.count(anchor), 1)
        for changed in (base.replace(anchor, ''), base.replace(anchor, anchor + anchor)):
            with patch.object(GEN.android, 'generate', return_value=changed):
                with self.assertRaises((RuntimeError, AssertionError, ValueError)):
                    GEN.generate()


if __name__ == '__main__':
    unittest.main()
