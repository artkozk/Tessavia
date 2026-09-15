"""Prepare the pinned 074 -> 075 financial constructor release; never deploy."""
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


previous = load('team_finance_media_deploy_for_constructor', 'build-team-finance-media-deploy-20260915.py')
verifier = load('finance_constructor_verifier_for_deploy', 'verify-finance-constructor-database.py')
VERSION = '20260915-finance-constructor-1'
PREVIOUS = '/opt/business-control/releases/20260915-team-finance-media-0a7a6eb'
PREVIOUS_SHA = '47d9015b40a1ed95615ace3c7e4bcd88a797d85d2623503770e92bd653774317'
VERIFIER_DEPENDENCIES = ('verify-finance-constructor-database.py',) + previous.VERIFIER_DEPENDENCIES


def generate():
    for name, expected in verifier.MIGRATION_SHA256.items():
        content = (ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
        if hashlib.sha256(content.encode()).hexdigest() != expected:
            raise ValueError('Reviewed migration changed: ' + name)
    script = previous.generate()
    replace = previous.smart.android.swipe.checked_replace
    script = replace(script, previous.VERSION, VERSION, script.count(previous.VERSION))
    script = replace(script, '20260915-team-finance-media-', '20260915-finance-constructor-', script.count('20260915-team-finance-media-'))
    script = replace(script, 'business-control-team-finance-media', 'business-control-finance-constructor', 1)
    script = replace(script, 'pre-team-finance-media-', 'pre-finance-constructor-', 1)
    script = replace(script, 'tessavie-team-finance-media-check.', 'tessavie-finance-constructor-check.', 2)
    script = replace(script, previous.PREVIOUS, PREVIOUS)
    script = replace(script, previous.PREVIOUS_SHA, PREVIOUS_SHA)
    script = replace(script, 'app.js?v=20260915-smart-select-1', 'app.js?v=' + previous.VERSION)
    script = replace(script, '/tmp/verify-team-finance-media-database.py', '/tmp/verify-finance-constructor-database.py', script.count('/tmp/verify-team-finance-media-database.py'))
    script = replace(script, '= 139', '= 143', 1)
    script = replace(script, 'team_finance_and_page_media_unavailable_latest_data_retained', 'finance_constructor_groups_and_links_unavailable_latest_data_retained', 2)
    script = replace(script, 'This additive release retains latest schema 072/074 and all current rows.', 'This additive release retains latest schema 074/075 and all current rows.')
    script = replace(script, 'f177677 supports smart selects, scoped widgets, Web Push and personal history.', '0a7a6eb supports team finance, media, smart selects, widgets and personal history.')
    script = replace(script, 'Only reviewed migrations 073/074 are allowed; nine added tables must be empty.\n# All prior 130 tables, widget grants and migration receipts remain unchanged.', 'Only reviewed migration 075 is allowed; four added tables must be empty.\n# All prior 139 tables, financial amounts and migration receipts remain unchanged.')
    script = replace(script, 'The baseline already understands all 072 rows, widget grants and push delivery.', 'The baseline already understands all 074 rows, team ledgers, media and widget grants.')
    script = replace(script, 'Snapshot candidate-checked 074 data before trialing f177677 on that copy.', 'Snapshot candidate-checked 075 data before trialing 0a7a6eb on that copy.')
    script = replace(script, 'require all 139 tables and every', 'require all 143 tables and every')
    # Preserve all earlier acceptance checks; missing exact anchors abort build.
    index_marker = f"  grep -qF 'personal-finance.css?v={VERSION}' \"$dry/index.html\"\n"
    script = replace(script, index_marker, index_marker + f"  grep -qF 'page-finance.css?v={VERSION}' \"$dry/index.html\"\n")
    finance_marker = f'  curl --max-time 15 -fsS "$base/personal-finance.js?v={VERSION}" > "$dry/personal-finance.js"\n'
    script = replace(script, finance_marker, finance_marker + '''  grep -qF 'financeOrganizationPayload' "$dry/personal-finance.js"
  grep -qF 'data-finance-history-category' "$dry/personal-finance.js"
  grep -qF 'data-finance-related' "$dry/personal-finance.js"
  grep -qF 'tessavie-finance-changed' "$dry/personal-finance.js"
  grep -qF 'expectedWorkspaceId' "$dry/personal-finance.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/finance/link-targets")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/link-targets")" = 401
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{http_code}' "$base/api/personal/finance/categories")" = 401
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/categories")" = 401
''')
    page_marker = f'  curl --max-time 15 -fsS "$base/page-apps.js?v={VERSION}" > "$dry/page-apps.js"\n'
    script = replace(script, page_marker, page_marker + f'''  grep -qF 'createPageFinanceUI' "$dry/page-apps.js"
  curl --max-time 15 -fsS "$base/page-finance.js?v={VERSION}" > "$dry/page-finance.js"
  grep -qF 'createPageFinanceUI' "$dry/page-finance.js"
  grep -qF 'validatePageFinanceOverview' "$dry/page-finance.js"
  grep -qF 'pageFinanceConfigMarkup' "$dry/page-finance.js"
  curl --max-time 15 -fsS "$base/page-finance.css?v={VERSION}" > "$dry/page-finance.css"
  grep -qF '.page-finance-block' "$dry/page-finance.css"
''')
    worker_marker = '  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"\n'
    script = replace(script, worker_marker, worker_marker + f'  grep -qF "page-finance.js?v={VERSION}" "$dry/sw.js"\n  grep -qF "page-finance.css?v={VERSION}" "$dry/sw.js"\n')
    end_marker = "printf 'RELEASE=%s\\nCOMMIT=%s\\nSHA256=%s\\nDEPLOY=ok\\n'"
    script = replace(script, end_marker, f'test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version=\'{verifier.MIGRATION}\';")" = 1\n' + end_marker)
    return script


def main():
    script = generate()
    target = ROOT / '.artifacts/finance-constructor-20260915'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'deploy.sh').write_text(script, encoding='utf-8', newline='\n')
    manifest = {
        'kind': 'prepared_not_deployed', 'cacheVersion': VERSION,
        'expectedPrevious': PREVIOUS, 'expectedPreviousSha256': PREVIOUS_SHA,
        'scriptSha256': hashlib.sha256(script.encode()).hexdigest(),
        'baseline': '074_page_media.sql', 'schema': verifier.MIGRATION,
        'tablesBefore': 139, 'tablesAfter': 143, 'newTables': sorted(verifier.NEW_TABLES),
        'baselineSchemaSha256': verifier.BASELINE_SCHEMA_SHA256,
        'migrationHashesUtf8Lf': verifier.MIGRATION_SHA256,
        'verifierUploads': [{'local': 'deploy/' + name, 'remote': '/tmp/' + name, 'sha256': hashlib.sha256((ROOT / 'deploy' / name).read_bytes()).hexdigest()} for name in VERIFIER_DEPENDENCIES],
        'rollback': 'Previous binary with latest 075 database and uploads retained; finance constructor, operation groups and links unavailable, no old database restore',
    }
    (target / 'deploy-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
