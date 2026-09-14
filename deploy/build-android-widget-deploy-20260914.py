"""Generate a guarded additive widget rollout from the existing audited checks."""
import importlib.util
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('swipe_deploy', ROOT / 'deploy/build-swipe-tabs-deploy-20260914.py')
swipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(swipe)
VERSION = '20260914-android-widget-1'
PREVIOUS = '/opt/business-control/releases/20260914-swipe-tabs-b570546'
PREVIOUS_SHA = '27e26d1339d692135ee56e1fabf196a127fb4a0749d8c14122d618d55485d24d'


def generate():
    script = swipe.generate((ROOT / swipe.TEMPLATE).read_text(encoding='utf-8'),
                            (ROOT / swipe.VERIFIER).read_text(encoding='utf-8'))
    replace = swipe.checked_replace
    # This is a new artifact: historical rollout files are never overwritten.
    script = replace(script, swipe.CACHE_VERSION, VERSION, script.count(swipe.CACHE_VERSION))
    script = replace(script, '20260914-swipe-tabs-', '20260914-android-widget-', script.count('20260914-swipe-tabs-'))
    script = replace(script, 'business-control-swipe-tabs', 'business-control-android-widget', 1)
    script = replace(script, 'pre-swipe-tabs-', 'pre-android-widget-', 1)
    script = replace(script, 'tessavie-swipe-tabs-check.', 'tessavie-android-widget-check.', 2)
    script = replace(script, swipe.PREVIOUS_RELEASE, PREVIOUS)
    script = replace(script, swipe.PREVIOUS_SHA256, PREVIOUS_SHA)
    script = replace(script, 'app.js?v=20260914-mobile-gestures-today-1', 'app.js?v=20260914-swipe-tabs-1')
    script = replace(script, 'previous_ui_without_swipe_tabs_restored', 'widgets_unavailable_previous_web_ui_restored_data_retained', 2)
    script = replace(script, '/tmp/verify-mobile-gestures-today-database.py', '/tmp/verify-android-widget-database.py', script.count('/tmp/verify-mobile-gestures-today-database.py'))
    script = replace(script, '--validate-only "$backup/business-control.db"', '--baseline "$backup/business-control.db"')
    script = replace(script, '--rollback-safe "$backup/cutover.db"', '--baseline "$backup/cutover.db"')
    script = replace(script, '= 129', '= 130', 1)
    marker = "  grep -qF 'createMobileAccessUI' \"$dry/mobile-access.js\"\n"
    checks = '''  curl --max-time 15 -fsS "$base/mobile-widgets.js?v=20260914-android-widget-1" > "$dry/mobile-widgets.js"
  grep -qF '/api/me/widgets' "$dry/mobile-widgets.js"
  if grep -qF 'data-personal-menu-add' "$dry/app.js"; then return 1; fi
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/me/widgets")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/me/widgets/sources")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/mobile/widget")" = 401
'''
    script = replace(script, marker, marker + checks)
    # Update explanatory comments in the generated artifact to match its new scope.
    script = script.replace('This UI-only release keeps the exact 071 schema and all current rows.',
                            'This additive release retains the latest 071/072 schema and all current rows.')
    script = script.replace('f1aa726', 'b570546').replace('11e7614', 'b570546')
    script = script.replace('UI-only release: exact schema 071, all 129 table values and migration\n# receipts must match. Neither 070 nor a new migration is an allowed baseline.',
                            'Only the reviewed additive 072 migration is allowed. All 129 existing\n# table values and prior migration receipts must match the baseline.')
    script = script.replace('candidate-checked 071 data', 'candidate-checked 072 data')
    script = script.replace('all 129 tables and every', 'all 130 tables and every')
    marker = "printf 'RELEASE=%s\\nCOMMIT=%s\\nSHA256=%s\\nDEPLOY=ok\\n'"
    script = replace(script, marker,
                     'test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version=\'072_widget_devices.sql\';")" = 1\n' + marker)
    return script


def main():
    text = generate()
    target = ROOT / '.artifacts/android-widget-20260914'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'deploy.sh').write_text(text, encoding='utf-8', newline='\n')
    manifest = {'kind': 'prepared_not_deployed', 'cacheVersion': VERSION,
                'expectedPrevious': PREVIOUS, 'expectedPreviousSha256': PREVIOUS_SHA,
                'scriptSha256': hashlib.sha256(text.encode()).hexdigest(),
                'schema': '072_widget_devices.sql', 'tables': 130,
                'rollback': 'Previous binary with latest 072 DB; no historical data restore'}
    (target / 'deploy-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
