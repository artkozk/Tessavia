"""Check rollout pins, inherited acceptance checks and complete upload closure."""
import importlib.util
from pathlib import Path
import re
import shlex
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('media_variants_deploy_test', ROOT / 'deploy/build-media-variants-deploy-20260915.py')
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)


class MediaVariantsDeployChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = D.generate()

    def test_pins_previous_binary_and_distinct_current_cache(self):
        self.assertIn('test "$EXPECTED_PREVIOUS" = ' + D.PREVIOUS, self.script)
        self.assertIn(D.PREVIOUS_SHA, self.script)
        self.assertIn("grep -qF 'app.js?v=20260915-finance-constructor-1' \"$dry/rollback-index.html\"", self.script)
        self.assertIn("grep -qF 'app.js?v=20260915-media-variants-1' \"$dry/index.html\"", self.script)
        self.assertNotIn('app.js?v=20260915-smart-select-1', self.script)

    def test_inherited_http_asset_and_auth_checks_are_not_dropped(self):
        normalize = lambda script: re.sub(r'v=20260915-(?:finance-constructor|media-variants)-1', 'v=VERSION', script)
        old_checks = {line for line in normalize(D.previous.generate()).splitlines() if line.startswith('  curl ') or line.startswith('  test "$(curl')}
        new_checks = set(normalize(self.script).splitlines())
        self.assertTrue(old_checks <= new_checks, old_checks - new_checks)
        for path in ('/api/records/unknown/media-variants', '/api/personal/notes/unknown/media-variants', '/api/workspace/pages/unknown/app/media/unknown/variants'):
            self.assertTrue(any(path in line and '= 401' in line for line in self.script.splitlines()))
        for resource in ('media-variants.js', 'media-variants.css'):
            self.assertIn(f'$base/{resource}?v={D.VERSION}', self.script)
            self.assertIn(f'"{resource}?v={D.VERSION}" "$dry/sw.js"', self.script)

    def test_validator_modes_and_latest_data_trial_are_preserved(self):
        verifier = 'python3 /tmp/verify-media-variants-database.py'
        for suffix in (' --baseline "$backup/business-control.db"', ' "$backup/business-control.db" "$dry/check.db"', ' --rollback-safe "$dry/check.db"', ' "$dry/rollback-before.db" "$dry/check.db"', ' --baseline "$backup/cutover.db"', ' --validate-only "$db"'):
            self.assertIn(verifier + suffix, self.script)
        self.assertIn("version='076_media_variants.sql'", self.script)
        self.assertIn('= 148', self.script)
        self.assertIn('media_version_history_and_selection_unavailable_latest_data_retained', self.script)
        self.assertNotIn('/tmp/verify-finance-constructor-database.py', self.script)

    def test_uploaded_verifier_dependencies_cover_transitive_imports(self):
        dependencies = set(D.VERIFIER_DEPENDENCIES)
        self.assertEqual(len(dependencies), 5)
        pending = ['verify-media-variants-database.py']
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
            with self.assertRaisesRegex(ValueError, 'Reviewed migration changed: 076_media_variants.sql'):
                D.generate()

    def test_http_literal_checks_match_current_source_assets(self):
        # A strict inherited import marker must be updated when the same module
        # gains another export. Catch this before a correct binary reaches VPS.
        files = {'$dry/index.html': ROOT / 'web/index.html', '$dry/sw.js': ROOT / 'web/sw.js'}
        checked = 0
        for line in self.script.splitlines():
            match = re.match(r'  curl .*"\$base/([^?"/]+)(?:\?[^\"]*)?" > "(\$dry/[^\"]+)"$', line)
            if match:
                files[match.group(2)] = ROOT / 'web' / match.group(1)
            if not line.startswith('  grep -qF '):
                continue
            parts = shlex.split(line)
            if len(parts) != 4 or parts[3] not in files or not files[parts[3]].is_file():
                continue
            self.assertTrue(parts[2] in files[parts[3]].read_text(encoding='utf-8-sig'), str(files[parts[3]]) + ': ' + parts[2])
            checked += 1
        self.assertGreater(checked, 100)


if __name__ == '__main__':
    unittest.main()
