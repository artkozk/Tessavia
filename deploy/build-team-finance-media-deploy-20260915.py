"""Prepare a pinned 072 -> 074 release; never deploy or read live databases."""
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


smart = load('smart_select_deploy', 'build-smart-select-deploy-20260915.py')
verifier = load('team_finance_media_verifier', 'verify-team-finance-media-database.py')
VERSION = '20260915-team-finance-media-1'
PREVIOUS = '/opt/business-control/releases/20260915-smart-select-f177677'
PREVIOUS_SHA = 'f09b1ccf19d525d6bd22636b03096b1cfb55bb17346fd83d6a9aaa034a94c5c8'
VERIFIER_DEPENDENCIES = (
    'verify-team-finance-media-database.py',
    'verify-android-widget-database.py',
    'verify-mobile-gestures-today-database.py',
)


def generate():
    for name, expected in verifier.MIGRATION_SHA256.items():
        content = (ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
        if hashlib.sha256(content.encode()).hexdigest() != expected:
            raise ValueError('Reviewed migration changed: ' + name)
    script = smart.generate()
    replace = smart.android.swipe.checked_replace
    script = replace(script, smart.VERSION, VERSION, script.count(smart.VERSION))
    script = replace(script, '20260915-smart-select-', '20260915-team-finance-media-', script.count('20260915-smart-select-'))
    script = replace(script, 'business-control-smart-select', 'business-control-team-finance-media', 1)
    script = replace(script, 'pre-smart-select-', 'pre-team-finance-media-', 1)
    script = replace(script, 'tessavie-smart-select-check.', 'tessavie-team-finance-media-check.', 2)
    script = replace(script, smart.PREVIOUS, PREVIOUS)
    script = replace(script, smart.PREVIOUS_SHA, PREVIOUS_SHA)
    script = replace(script, 'app.js?v=20260914-android-widget-1', 'app.js?v=20260915-smart-select-1')
    script = replace(script, '/tmp/verify-smart-select-database.py', '/tmp/verify-team-finance-media-database.py', script.count('/tmp/verify-smart-select-database.py'))
    script = replace(script, '= 130', '= 139', 1)
    script = replace(script, 'previous_mobile_bottom_sheet_restored_widgets_and_data_retained', 'team_finance_and_page_media_unavailable_latest_data_retained', 2)
    script = replace(script, 'This UI-only release retains exact schema 072 and all current rows.', 'This additive release retains latest schema 072/074 and all current rows.')
    script = replace(script, '8304391 already supports scoped widgets, Web Push and personal history.', 'f177677 supports smart selects, scoped widgets, Web Push and personal history.')
    script = replace(script, 'No migration is allowed. All 130 tables, widget grants and migration\n# receipts must match the exact 072 baseline.', 'Only reviewed migrations 073/074 are allowed; nine added tables must be empty.\n# All prior 130 tables, widget grants and migration receipts remain unchanged.')
    script = replace(script, 'Snapshot the candidate-checked 072 data before trialing 8304391 on that copy.', 'Snapshot candidate-checked 074 data before trialing f177677 on that copy.')
    script = replace(script, 'require all 130 tables and every', 'require all 139 tables and every')
    # All acceptance hooks extend exact inherited fetches. Missing anchors abort
    # generation rather than silently omitting an important release check.
    index_marker = f"  grep -qF 'personal-finance.css?v={VERSION}' \"$dry/index.html\"\n"
    script = replace(script, index_marker, index_marker + f"  grep -qF 'page-media.css?v={VERSION}' \"$dry/index.html\"\n")
    app_marker = f'  curl --max-time 15 -fsS "$base/app.js?v={VERSION}" > "$dry/app.js"\n'
    script = replace(script, app_marker, app_marker + '  grep -qF "const teamFinanceUI" "$dry/app.js"\n  grep -qF "renderTeamFinance" "$dry/app.js"\n  grep -qF "recordMediaMarkup" "$dry/app.js"\n')
    finance_marker = f'  curl --max-time 15 -fsS "$base/personal-finance.js?v={VERSION}" > "$dry/personal-finance.js"\n'
    script = replace(script, finance_marker, finance_marker + '''  grep -qF 'X-Finance-Source' "$dry/personal-finance.js"
  grep -qF 'X-Finance-Revision' "$dry/personal-finance.js"
  grep -qF 'teamSourceSettings' "$dry/personal-finance.js"
  grep -qF 'data-finance-open-source' "$dry/personal-finance.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/workspace/finance")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/settings")" = 401
  test "$(curl --max-time 10 -s -X PUT -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/settings")" = 401
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/entries")" = 401
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{http_code}' "$base/api/workspace/finance/expenses")" = 401
''')
    settings_marker = f'  curl --max-time 15 -fsS "$base/settings-hub.js?v={VERSION}" > "$dry/settings-hub.js"\n'
    script = replace(script, settings_marker, settings_marker + '  grep -qF "team-finance" "$dry/settings-hub.js"\n')
    page_marker = f'  curl --max-time 15 -fsS "$base/page-apps.js?v={VERSION}" > "$dry/page-apps.js"\n'
    media_checks = f'''  grep -qF 'createPageMediaUI' "$dry/page-apps.js"
  curl --max-time 15 -fsS "$base/page-media.js?v={VERSION}" > "$dry/page-media.js"
  grep -qF 'createPageMediaUI' "$dry/page-media.js"
  grep -qF 'recordMediaMarkup' "$dry/page-media.js"
  grep -qF 'requireMediaUploadReceipt' "$dry/page-media.js"
  curl --max-time 15 -fsS "$base/page-media.css?v={VERSION}" > "$dry/page-media.css"
  grep -qF '.page-media-grid' "$dry/page-media.css"
  curl --max-time 15 -fsS "$base/note-media.js?v={VERSION}" > "$dry/note-media.js"
  grep -qF 'note-file-thumbnail' "$dry/note-media.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{{http_code}}' "$base/api/workspace/pages/unknown/app/media/unknown")" = 401
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{{http_code}}' "$base/api/workspace/pages/unknown/app/media/unknown")" = 401
  test "$(curl --max-time 10 -s -X PATCH -o /dev/null -w '%{{http_code}}' "$base/api/workspace/pages/unknown/app/media/unknown/unknown")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{{http_code}}' "$base/api/workspace/pages/unknown/app/media/unknown/unknown/file?workspaceId=unknown")" = 401
'''
    script = replace(script, page_marker, page_marker + media_checks)
    worker_marker = '  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"\n'
    script = replace(script, worker_marker, worker_marker + f'  grep -qF "page-media.js?v={VERSION}" "$dry/sw.js"\n  grep -qF "page-media.css?v={VERSION}" "$dry/sw.js"\n')
    end_marker = "printf 'RELEASE=%s\\nCOMMIT=%s\\nSHA256=%s\\nDEPLOY=ok\\n'"
    script = replace(script, end_marker, ''.join(f'test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version=\'{name}\';")" = 1\n' for name in verifier.MIGRATIONS) + end_marker)
    return script


def main():
    script = generate()
    target = ROOT / '.artifacts/team-finance-media-20260915'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'deploy.sh').write_text(script, encoding='utf-8', newline='\n')
    manifest = {
        'kind': 'prepared_not_deployed', 'cacheVersion': VERSION,
        'expectedPrevious': PREVIOUS, 'expectedPreviousSha256': PREVIOUS_SHA,
        'scriptSha256': hashlib.sha256(script.encode()).hexdigest(),
        'baseline': '072_widget_devices.sql', 'schema': verifier.MIGRATIONS[-1],
        'tablesBefore': 130, 'tablesAfter': 139, 'newTables': sorted(verifier.NEW_TABLES),
        'migrationHashesUtf8Lf': verifier.MIGRATION_SHA256,
        'verifierUploads': [{'local': 'deploy/' + name, 'remote': '/tmp/' + name, 'sha256': hashlib.sha256((ROOT / 'deploy' / name).read_bytes()).hexdigest()} for name in VERIFIER_DEPENDENCIES],
        'rollback': 'Previous binary with latest 074 database and uploads retained; team finance and page media unavailable, no old database restore',
    }
    (target / 'deploy-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
