"""Prepare a pinned 075 -> 076 rollout with media and shell-update acceptance."""
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


previous = load('finance_constructor_deploy_for_media', 'build-finance-constructor-deploy-20260915.py')
verifier = load('media_variants_verifier_for_deploy', 'verify-media-variants-database.py')
VERSION = '20260915-media-variants-1'
PREVIOUS = '/opt/business-control/releases/20260915-finance-constructor-e5ecd4b'
PREVIOUS_SHA = '1790be5b27e3702e945a762f859545bfb2d5232576e14b3852f009e88506160d'
VERIFIER_DEPENDENCIES = ('verify-media-variants-database.py',) + previous.VERIFIER_DEPENDENCIES
RECORDER_DEPENDENCIES = ('record-media-variants-results-20260915.py', 'record-native-widget-results-20260915.py') + VERIFIER_DEPENDENCIES


def generate():
    for name, expected in verifier.MIGRATION_SHA256.items():
        content = (ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
        if hashlib.sha256(content.encode()).hexdigest() != expected:
            raise ValueError('Reviewed migration changed: ' + name)
    script = previous.generate()
    replace = previous.previous.smart.android.swipe.checked_replace
    script = replace(script, previous.VERSION, VERSION, script.count(previous.VERSION))
    script = replace(script, '20260915-finance-constructor-', '20260915-media-variants-', script.count('20260915-finance-constructor-'))
    script = replace(script, 'business-control-finance-constructor', 'business-control-media-variants', 1)
    script = replace(script, 'pre-finance-constructor-', 'pre-media-variants-', 1)
    script = replace(script, 'tessavie-finance-constructor-check.', 'tessavie-media-variants-check.', 2)
    script = replace(script, previous.PREVIOUS, PREVIOUS)
    script = replace(script, previous.PREVIOUS_SHA, PREVIOUS_SHA)
    script = replace(script, 'app.js?v=20260915-team-finance-media-1', 'app.js?v=' + previous.VERSION)
    script = replace(script, '/tmp/verify-finance-constructor-database.py', '/tmp/verify-media-variants-database.py', script.count('/tmp/verify-finance-constructor-database.py'))
    script = replace(script, '= 143', '= 148', 1)
    script = replace(script, 'finance_constructor_groups_and_links_unavailable_latest_data_retained', 'media_version_history_and_selection_unavailable_latest_data_retained', 2)
    script = replace(script, 'This additive release retains latest schema 074/075 and all current rows.', 'This additive release retains latest schema 075/076 and all current rows.')
    script = replace(script, '0a7a6eb supports team finance, media, smart selects, widgets and personal history.', 'e5ecd4b supports financial groups, the finance constructor, media and widgets.')
    script = replace(script, 'Only reviewed migration 075 is allowed; four added tables must be empty.\n# All prior 139 tables, financial amounts and migration receipts remain unchanged.', 'Only reviewed migration 076 is allowed; five added tables must be empty.\n# All prior 143 tables, attachments and migration receipts remain unchanged.')
    script = replace(script, 'The baseline already understands all 074 rows, team ledgers, media and widget grants.', 'The baseline already understands all 075 rows, financial groups, media and widget grants.')
    script = replace(script, 'Snapshot candidate-checked 075 data before trialing 0a7a6eb on that copy.', 'Snapshot candidate-checked 076 data before trialing e5ecd4b on that copy.')
    script = replace(script, 'require all 143 tables and every', 'require all 148 tables and every')
    index_marker = f"  grep -qF 'page-media.css?v={VERSION}' \"$dry/index.html\"\n"
    script = replace(script, index_marker, index_marker + f"  grep -qF 'media-variants.css?v={VERSION}' \"$dry/index.html\"\n")
    app_marker = f'  curl --max-time 15 -fsS "$base/app.js?v={VERSION}" > "$dry/app.js"\n'
    script = replace(script, app_marker, app_marker + '''  grep -qF 'createMediaVariantsUI' "$dry/app.js"
  grep -qF 'reloadUpdatedInterface' "$dry/app.js"
  grep -qF 'shellUpdatePending' "$dry/app.js"
''')
    script = replace(script, 'import { selectMenuPosition, selectOptionScrollTop }', 'import { selectMenuPosition, selectOptionScrollTop, trackSelectAnchor }')
    script = replace(script, 'grep -qF "recordMediaMarkup" "$dry/app.js"', 'grep -qF "data-record-media-variants" "$dry/app.js"')
    select_marker = f'  curl --max-time 15 -fsS "$base/select-positioning.js?v={VERSION}" > "$dry/select-positioning.js"\n'
    script = replace(script, select_marker, select_marker + '  grep -qF "function trackSelectAnchor" "$dry/select-positioning.js"\n')
    page_marker = f'  curl --max-time 15 -fsS "$base/page-media.js?v={VERSION}" > "$dry/page-media.js"\n'
    script = replace(script, page_marker, page_marker + f'''  grep -qF 'createMediaVariantsUI' "$dry/page-media.js"
  grep -qF 'mountLegacy' "$dry/page-media.js"
  curl --max-time 15 -fsS "$base/media-variants.js?v={VERSION}" > "$dry/media-variants.js"
  grep -qF 'createMediaVariantsUI' "$dry/media-variants.js"
  grep -qF 'mediaComparisonMarkup' "$dry/media-variants.js"
  grep -qF 'requireVariantUploadReceipt' "$dry/media-variants.js"
  grep -qF 'mediaVariantMetadataBody' "$dry/media-variants.js"
  curl --max-time 15 -fsS "$base/media-variants.css?v={VERSION}" > "$dry/media-variants.css"
  grep -qF '.media-variants-grid' "$dry/media-variants.css"
''')
    note_marker = f'  curl --max-time 15 -fsS "$base/note-media.js?v={VERSION}" > "$dry/note-media.js"\n'
    script = replace(script, note_marker, note_marker + '''  grep -qF 'bindSavedEditor' "$dry/note-media.js"
  grep -qF 'data-note-file-legacy-pending' "$dry/note-media.js"
''')
    settings_marker = f'  curl --max-time 15 -fsS "$base/settings-hub.js?v={VERSION}" > "$dry/settings-hub.js"\n'
    script = replace(script, settings_marker, settings_marker + f'''  grep -qF 'shell-update' "$dry/settings-hub.js"
  curl --max-time 15 -fsS "$base/outbox-ui.js?v={VERSION}" > "$dry/outbox-ui.js"
  grep -qF 'watchShellUpdates' "$dry/outbox-ui.js"
  grep -qF 'onPendingChange(pending)' "$dry/outbox-ui.js"
''')
    worker_marker = '  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"\n'
    script = replace(script, worker_marker, worker_marker + f'  grep -qF "media-variants.js?v={VERSION}" "$dry/sw.js"\n  grep -qF "media-variants.css?v={VERSION}" "$dry/sw.js"\n')
    auth = ''.join(f'  test "$(curl --max-time 10 -s -X {method} -o /dev/null -w \'%{{http_code}}\' "$base{path}")" = 401\n' for path, method in (
        ('/api/records/unknown/media-variants', 'GET'), ('/api/records/unknown/media-variants', 'POST'),
        ('/api/records/unknown/media-variants/unknown', 'PATCH'), ('/api/records/unknown/media-variants/unknown/versions', 'POST'),
        ('/api/personal/notes/unknown/media-variants', 'GET'), ('/api/personal/notes/unknown/media-variants', 'POST'),
        ('/api/workspace/pages/unknown/app/media/unknown/variants', 'GET'), ('/api/workspace/pages/unknown/app/media/unknown/variants', 'POST'),
        ('/api/records/unknown/media-variants/unknown/versions/unknown/file', 'GET'),
        ('/api/personal/notes/unknown/media-variants/unknown/versions/unknown/file', 'GET'),
        ('/api/workspace/pages/unknown/app/media/unknown/variants/unknown/versions/unknown/file', 'GET'),
    ))
    script = replace(script, worker_marker, worker_marker + auth)
    end_marker = "printf 'RELEASE=%s\\nCOMMIT=%s\\nSHA256=%s\\nDEPLOY=ok\\n'"
    script = replace(script, end_marker, f'test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version=\'{verifier.MIGRATION}\';")" = 1\n' + end_marker)
    return script


def main():
    script = generate()
    target = ROOT / '.artifacts/media-variants-20260915'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'deploy.sh').write_text(script, encoding='utf-8', newline='\n')
    manifest = {
        'kind': 'prepared_not_deployed', 'cacheVersion': VERSION,
        'expectedPrevious': PREVIOUS, 'expectedPreviousSha256': PREVIOUS_SHA,
        'scriptSha256': hashlib.sha256(script.encode()).hexdigest(),
        'baseline': '075_finance_organization.sql', 'schema': verifier.MIGRATION,
        'tablesBefore': 143, 'tablesAfter': 148, 'newTables': sorted(verifier.NEW_TABLES),
        'baselineSchemaSha256': verifier.BASELINE_SCHEMA_SHA256,
        'migrationHashesUtf8Lf': verifier.MIGRATION_SHA256,
        'verifierUploads': [{'local': 'deploy/' + name, 'remote': '/tmp/' + name, 'sha256': hashlib.sha256((ROOT / 'deploy' / name).read_bytes()).hexdigest()} for name in VERIFIER_DEPENDENCIES],
        'recorderUploads': [{'local': 'deploy/' + name, 'remote': '/tmp/' + name, 'sha256': hashlib.sha256((ROOT / 'deploy' / name).read_bytes()).hexdigest()} for name in RECORDER_DEPENDENCIES],
        'rollback': 'Previous binary with latest 076 database and uploads retained only if no archived page media variants exist; otherwise keep candidate to protect archive privacy. Media version history and selection unavailable, no old database restore',
    }
    (target / 'deploy-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
