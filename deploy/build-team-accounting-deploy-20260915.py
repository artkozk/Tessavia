"""Prepare a pinned 076 -> 077 team-accounting release. Does not deploy."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'deploy' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


previous = load('media_variants_deploy_for_accounting', 'build-media-variants-deploy-20260915.py')
verifier = load('team_accounting_verifier_for_deploy', 'verify-team-accounting-database.py')
VERSION = '20260915-team-accounting-1'
PREVIOUS = '/opt/business-control/releases/20260915-media-variants-712e53c'
PREVIOUS_SHA = '5a1e9fc1f2d12b2aa1f519d03b4227bd98b424ad3cc0cc152a37dd0de407af8b'
VERIFIER_DEPENDENCIES = ('verify-team-accounting-database.py',) + previous.VERIFIER_DEPENDENCIES
RECORDER_DEPENDENCIES = ('record-team-accounting-results-20260915.py', 'record-native-widget-results-20260915.py') + VERIFIER_DEPENDENCIES


def replace(source, old, new, count=1):
    if count < 1 or source.count(old) != count:
        raise ValueError('Reviewed deployment anchor changed: ' + old)
    return source.replace(old, new)


def generate():
    for name, expected in verifier.MIGRATION_SHA256.items():
        content = (ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
        if hashlib.sha256(content.encode()).hexdigest() != expected:
            raise ValueError('Reviewed migration changed: ' + name)
    script = previous.generate()
    script = replace(script, previous.VERSION, VERSION, script.count(previous.VERSION))
    script = replace(script, '20260915-media-variants-', '20260915-team-accounting-', script.count('20260915-media-variants-'))
    script = replace(script, 'business-control-media-variants', 'business-control-team-accounting')
    script = replace(script, 'pre-media-variants-', 'pre-team-accounting-')
    script = replace(script, 'tessavie-media-variants-check.', 'tessavie-team-accounting-check.', 2)
    script = replace(script, previous.PREVIOUS, PREVIOUS)
    script = replace(script, previous.PREVIOUS_SHA, PREVIOUS_SHA)
    script = replace(script, 'app.js?v=20260915-finance-constructor-1', 'app.js?v=' + previous.VERSION)
    script = replace(script, '/tmp/verify-media-variants-database.py', '/tmp/verify-team-accounting-database.py', script.count('/tmp/verify-media-variants-database.py'))
    script = replace(script, '= 148', '= 150')
    script = replace(script, 'media_version_history_and_selection_unavailable_latest_data_retained', 'simple_receipts_unavailable_latest_data_retained', 2)
    script = replace(script, 'This additive release retains latest schema 075/076 and all current rows.', 'This additive release retains latest schema 076/077 and all current rows.')
    script = replace(script, 'e5ecd4b supports financial groups, the finance constructor, media and widgets.', '712e53c supports media variants and archive privacy, financial groups, the constructor and widgets.')
    script = replace(script, 'Only reviewed migration 076 is allowed; five added tables must be empty.\n# All prior 143 tables, attachments and migration receipts remain unchanged.', 'Only reviewed migration 077 is allowed; two added tables must be empty.\n# All prior 148 tables, money, attachments and migration receipts remain unchanged.')
    script = replace(script, 'The baseline already understands all 075 rows, financial groups, media and widget grants.', 'The baseline understands all 076 rows and media archive privacy, but cannot edit new simple receipts.')
    script = replace(script, 'Snapshot candidate-checked 076 data before trialing e5ecd4b on that copy.', 'Snapshot candidate-checked 077 data before trialing 712e53c on that copy.')
    script = replace(script, 'require all 148 tables and every', 'require all 150 tables and every')
    app_marker = f'  curl --max-time 15 -fsS "$base/app.js?v={VERSION}" > "$dry/app.js"\n'
    script = replace(script, app_marker, app_marker + '  grep -qF "key === \'personal\' || key === \'finance\' || enabled.has(key)" "$dry/app.js"\n')
    finance_marker = f'  curl --max-time 15 -fsS "$base/personal-finance.js?v={VERSION}" > "$dry/personal-finance.js"\n'
    script = replace(script, finance_marker, finance_marker + '''  grep -qF 'financeReceiptPayload' "$dry/personal-finance.js"
  grep -qF 'financeReceiptKinds' "$dry/personal-finance.js"
  grep -qF 'data-finance-receipt-bucket' "$dry/personal-finance.js"
  grep -qF 'data-finance-team-overview' "$dry/personal-finance.js"
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/receipts")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/receipts/unknown")" = 401
  test "$(curl --max-time 10 -s -X PUT -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/receipts/unknown")" = 401
''')
    page_marker = f'  curl --max-time 15 -fsS "$base/page-finance.js?v={VERSION}" > "$dry/page-finance.js"\n'
    script = replace(script, page_marker, page_marker + '  grep -qF "page-finance-team-totals" "$dry/page-finance.js"\n')
    end_marker = "printf 'RELEASE=%s\\nCOMMIT=%s\\nSHA256=%s\\nDEPLOY=ok\\n'"
    script = replace(script, end_marker, f'test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version=\'{verifier.MIGRATION}\';")" = 1\n' + end_marker)
    return script


def main():
    script = generate()
    target = ROOT / '.artifacts/team-usability-20260915'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'deploy.sh').write_text(script, encoding='utf-8', newline='\n')
    manifest = {
        'kind': 'prepared_not_deployed', 'cacheVersion': VERSION,
        'expectedPrevious': PREVIOUS, 'expectedPreviousSha256': PREVIOUS_SHA,
        'scriptSha256': hashlib.sha256(script.encode()).hexdigest(),
        'baseline': '076_media_variants.sql', 'schema': verifier.MIGRATION,
        'tablesBefore': 148, 'tablesAfter': 150, 'newTables': sorted(verifier.NEW_TABLES),
        'baselineSchemaSha256': verifier.BASELINE_SCHEMA_SHA256,
        'migrationHashesUtf8Lf': verifier.MIGRATION_SHA256,
        'verifierUploads': [{'local': 'deploy/' + name, 'remote': '/tmp/' + name, 'sha256': hashlib.sha256((ROOT / 'deploy' / name).read_bytes()).hexdigest()} for name in VERIFIER_DEPENDENCIES],
        'recorderUploads': [{'local': 'deploy/' + name, 'remote': '/tmp/' + name, 'sha256': hashlib.sha256((ROOT / 'deploy' / name).read_bytes()).hexdigest()} for name in RECORDER_DEPENDENCIES],
        'rollback': 'Previous binary with latest schema/data/uploads only if both 077 tables remain empty; otherwise retain candidate because old runtime cannot safely edit simple receipts. No old database restore.',
    }
    (target / 'deploy-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
