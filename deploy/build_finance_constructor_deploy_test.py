"""Check rollout pins, inherited acceptance checks and complete upload closure."""
import importlib.util
from pathlib import Path
import re
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('constructor_deploy_test', ROOT / 'deploy/build-finance-constructor-deploy-20260915.py')
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)


class FinanceConstructorDeployChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = D.generate()

    def test_pins_previous_binary_and_distinct_current_cache(self):
        self.assertIn('test "$EXPECTED_PREVIOUS" = ' + D.PREVIOUS, self.script)
        self.assertIn(D.PREVIOUS_SHA, self.script)
        self.assertIn("grep -qF 'app.js?v=20260915-team-finance-media-1' \"$dry/rollback-index.html\"", self.script)
        self.assertIn("grep -qF 'app.js?v=20260915-finance-constructor-1' \"$dry/index.html\"", self.script)
        self.assertNotIn('app.js?v=20260915-smart-select-1', self.script)

    def test_inherited_http_asset_and_auth_checks_are_not_dropped(self):
        normalize = lambda script: re.sub(r'v=20260915-(?:team-finance-media|finance-constructor)-1', 'v=VERSION', script)
        old_checks = {line for line in normalize(D.previous.generate()).splitlines() if line.startswith('  curl ') or line.startswith('  test "$(curl')}
        new_checks = set(normalize(self.script).splitlines())
        self.assertTrue(old_checks <= new_checks, old_checks - new_checks)
        for path in ('/api/personal/finance/link-targets', '/api/workspace/finance/link-targets', '/api/personal/finance/categories', '/api/workspace/finance/categories'):
            self.assertTrue(any(path in line and '= 401' in line for line in self.script.splitlines()))
        for resource in ('page-finance.js', 'page-finance.css'):
            self.assertIn(f'$base/{resource}?v={D.VERSION}', self.script)
            self.assertIn(f'"{resource}?v={D.VERSION}" "$dry/sw.js"', self.script)

    def test_validator_modes_and_latest_data_trial_are_preserved(self):
        verifier = 'python3 /tmp/verify-finance-constructor-database.py'
        for suffix in (' --baseline "$backup/business-control.db"', ' "$backup/business-control.db" "$dry/check.db"', ' --rollback-safe "$dry/check.db"', ' "$dry/rollback-before.db" "$dry/check.db"', ' --baseline "$backup/cutover.db"', ' --validate-only "$db"'):
            self.assertIn(verifier + suffix, self.script)
        self.assertIn("version='075_finance_organization.sql'", self.script)
        self.assertIn('= 143', self.script)
        self.assertIn('finance_constructor_groups_and_links_unavailable_latest_data_retained', self.script)
        self.assertNotIn('/tmp/verify-team-finance-media-database.py', self.script)

    def test_uploaded_verifier_dependencies_cover_transitive_imports(self):
        dependencies = set(D.VERIFIER_DEPENDENCIES)
        self.assertEqual(len(dependencies), 4)
        pending = ['verify-finance-constructor-database.py']
        visited = set()
        while pending:
            name = pending.pop()
            if name in visited:
                continue
            visited.add(name)
            source = (ROOT / 'deploy' / name).read_text(encoding='utf-8-sig')
            for dependency in re.findall(r"with_name\('([^']+\.py)'\)", source):
                self.assertIn(dependency, dependencies)
                pending.append(dependency)
        self.assertEqual(visited, dependencies)

    def test_changed_migration_is_rejected_before_script_is_generated(self):
        read = Path.read_text
        def changed(path, *args, **kwargs):
            text = read(path, *args, **kwargs)
            return text + '\n-- changed without review\n' if path.name == D.verifier.MIGRATION else text
        with patch.object(Path, 'read_text', changed):
            with self.assertRaisesRegex(ValueError, 'Reviewed migration changed: 075_finance_organization.sql'):
                D.generate()


if __name__ == '__main__':
    unittest.main()
