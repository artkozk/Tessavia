"""Safety checks for adapting a reviewed rollout without duplicating its verifier."""
import importlib.util
from pathlib import Path
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('swipe_tabs_deploy', HERE / 'build-swipe-tabs-deploy-20260914.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RolloutAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = (HERE.parent / MODULE.TEMPLATE).read_text(encoding='utf-8')
        cls.verifier = (HERE.parent / MODULE.VERIFIER).read_text(encoding='utf-8')

    def test_baseline_identity_and_new_module_are_checked(self):
        script = MODULE.generate(self.template, self.verifier)
        self.assertIn('test "$EXPECTED_PREVIOUS" = ' + MODULE.PREVIOUS_RELEASE, script)
        self.assertIn(MODULE.PREVIOUS_SHA256, script)
        self.assertIn('app.js?v=20260914-mobile-gestures-today-1\' "$dry/rollback-index.html"', script)
        self.assertIn('export function installSwipeTabs', script)
        self.assertIn('export function revealSwipeTab', script)
        self.assertIn('swipe-tabs.js?v=20260914-swipe-tabs-1\' "$dry/sw.js"', script)
        self.assertNotIn('f1aa726', script)

    def test_changed_rollout_fails_closed(self):
        weakened = self.template.replace('flock -n 9', ': # lock removed')
        with self.assertRaises(ValueError):
            MODULE.generate(weakened, self.verifier)

    def test_changed_schema_verifier_fails_closed(self):
        weakened = self.verifier.replace('EXPECTED_TABLE_COUNT = 129', 'EXPECTED_TABLE_COUNT = 127')
        with self.assertRaises(ValueError):
            MODULE.generate(self.template, weakened)

    def test_duplicate_or_missing_anchor_fails_closed(self):
        for text in ('anchor\nanchor', 'no matching value'):
            with self.assertRaises(ValueError):
                MODULE.checked_replace(text, 'anchor', 'replacement')

    def test_latest_data_rollback_and_background_sender_guards_survive(self):
        script = MODULE.generate(self.template, self.verifier)
        self.assertEqual(script.count('BUSINESS_REMINDERS_ENABLED=false BUSINESS_PUSH_ENABLED=false'), 2)
        self.assertIn('python3 /tmp/verify-mobile-gestures-today-database.py "$dry/rollback-before.db" "$dry/check.db"', script)
        self.assertIn('python3 /tmp/verify-mobile-gestures-today-database.py --rollback-safe "$db"', script)
        self.assertIn('sqlite3 "$db" \'.timeout 5000\' ".backup \'$backup/cutover.db\'"', script)
        self.assertNotIn('.restore', script)
        self.assertNotIn('DROP TABLE', script)


if __name__ == '__main__':
    unittest.main()
