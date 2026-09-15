"""Prepare UI-only rollout with the deployed Android widget release as baseline."""
import importlib.util
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('android_widget_deploy', ROOT / 'deploy/build-android-widget-deploy-20260914.py')
android = importlib.util.module_from_spec(spec)
spec.loader.exec_module(android)
VERSION = '20260915-smart-select-1'
PREVIOUS = '/opt/business-control/releases/20260914-android-widget-8304391'
PREVIOUS_SHA = '91095afa8d8eb4e3ec4dd9e4702676a56099bd8a7230826d167fd153ce31a54c'


def generate():
    script = android.generate()
    replace = android.swipe.checked_replace
    # Rename the new release before inserting the exact current-release pin.
    script = replace(script, android.VERSION, VERSION, script.count(android.VERSION))
    script = replace(script, '20260914-android-widget-', '20260915-smart-select-', script.count('20260914-android-widget-'))
    script = replace(script, 'business-control-android-widget', 'business-control-smart-select', 1)
    script = replace(script, 'pre-android-widget-', 'pre-smart-select-', 1)
    script = replace(script, 'tessavie-android-widget-check.', 'tessavie-smart-select-check.', 2)
    script = replace(script, android.PREVIOUS, PREVIOUS)
    script = replace(script, android.PREVIOUS_SHA, PREVIOUS_SHA)
    script = replace(script, 'app.js?v=20260914-swipe-tabs-1', 'app.js?v=20260914-android-widget-1')
    script = replace(script, '/tmp/verify-android-widget-database.py', '/tmp/verify-smart-select-database.py', script.count('/tmp/verify-android-widget-database.py'))
    script = replace(script, 'widgets_unavailable_previous_web_ui_restored_data_retained', 'previous_mobile_bottom_sheet_restored_widgets_and_data_retained', 2)
    script = script.replace('This additive release retains the latest 071/072 schema and all current rows.', 'This UI-only release retains exact schema 072 and all current rows.')
    script = script.replace('b570546 already supports Web Push, active block trash and personal history.', '8304391 already supports scoped widgets, Web Push and personal history.')
    script = script.replace('Only the reviewed additive 072 migration is allowed. All 129 existing\n# table values and prior migration receipts must match the baseline.', 'No migration is allowed. All 130 tables, widget grants and migration\n# receipts must match the exact 072 baseline.')
    script = script.replace('baseline already understands all 071 rows and push delivery.', 'baseline already understands all 072 rows, widget grants and push delivery.')
    script = script.replace('before trialing b570546 on that copy.', 'before trialing 8304391 on that copy.')
    # Each new acceptance hook is attached to an exact inherited HTTP fetch.
    # Failure to find the fetch aborts generation instead of silently dropping checks.
    app_fetch = f'  curl --max-time 15 -fsS "$base/app.js?v={VERSION}" > "$dry/app.js"\n'
    script = replace(script, app_fetch, app_fetch +
                     f'  grep -qF "import {{ selectMenuPosition, selectOptionScrollTop }} from \'./select-positioning.js?v={VERSION}\';" "$dry/app.js"\n'
                     f'  curl --max-time 15 -fsS "$base/select-positioning.js?v={VERSION}" > "$dry/select-positioning.js"\n'
                     '  grep -qF "export function selectMenuPosition(" "$dry/select-positioning.js"\n'
                     '  grep -qF "export function selectOptionScrollTop(" "$dry/select-positioning.js"\n')
    styles_fetch = f'  curl --max-time 15 -fsS "$base/styles.css?v={VERSION}" > "$dry/styles.css"\n'
    script = replace(script, styles_fetch, styles_fetch +
                     '  grep -qF \'.custom-select-menu[data-placement="viewport"] .custom-select-context\' "$dry/styles.css"\n'
                     '  grep -qF -- "--select-safe-top" "$dry/styles.css"\n')
    worker_fetch = '  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"\n'
    script = replace(script, worker_fetch, worker_fetch +
                     f'  grep -qF "select-positioning.js?v={VERSION}" "$dry/sw.js"\n')
    return script


def main():
    script = generate()
    target = ROOT / '.artifacts/smart-select-20260915'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'deploy.sh').write_text(script, encoding='utf-8', newline='\n')
    manifest = {'kind': 'prepared_not_deployed', 'cacheVersion': VERSION, 'expectedPrevious': PREVIOUS,
                'expectedPreviousSha256': PREVIOUS_SHA, 'scriptSha256': hashlib.sha256(script.encode()).hexdigest(),
                'schema': '072_widget_devices.sql', 'tables': 130, 'migration': False,
                'rollback': 'Previous binary; retain latest database and widget grants'}
    (target / 'deploy-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
