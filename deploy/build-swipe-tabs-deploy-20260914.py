"""Generate a pinned UI-only rollout, reusing the audited exact-071 checks.

No network, deployment, credentials, database reads or Git writes are performed.
Historical deploy/verifier files stay byte-for-byte unchanged.
"""
from pathlib import Path
import hashlib
import json


TEMPLATE = 'deploy/deploy-mobile-gestures-today-20260914.sh'
TEMPLATE_SHA256 = '72f81653bd879473725242f36e9b4381f59abb3e704871ed964e45fbe3048395'
VERIFIER = 'deploy/verify-mobile-gestures-today-database.py'
VERIFIER_SHA256 = 'aebeced7d0865e87c6611a74c310f34b2c63ef9343c0cda6c8391d8d94ddd167'
PREVIOUS_COMMIT = '11e761435f1b489c9bcf44aa3b60c51721ee8696'
PREVIOUS_RELEASE = '/opt/business-control/releases/20260914-mobile-gestures-today-11e7614'
PREVIOUS_SHA256 = '7fb8ccb3c2ada5e2811dfdfba956588f93b47824caf1f25bb6bff1fdbf887074'
CACHE_VERSION = '20260914-swipe-tabs-1'


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def checked_replace(text, old, new, count=1):
    if text.count(old) != count:
        raise ValueError('Historical deployment anchor changed: ' + old)
    return text.replace(old, new)


def generate(template, verifier):
    # read_text normalizes checkout CRLF. The normalized contents are pinned,
    # so a changed baseline or weakened verifier cannot be silently accepted.
    if digest(template) != TEMPLATE_SHA256 or digest(verifier) != VERIFIER_SHA256:
        raise ValueError('Historical deployment or exact-schema verifier changed; review required')
    script = template
    old_version = '20260914-mobile-gestures-today-1'
    script = checked_replace(script, old_version, CACHE_VERSION, template.count(old_version))
    replacements = (
        ('^20260914-mobile-gestures-today-', '^20260914-swipe-tabs-', 1),
        ('${RELEASE_NAME#20260914-mobile-gestures-today-}', '${RELEASE_NAME#20260914-swipe-tabs-}', 1),
        ('staged=/tmp/business-control-mobile-gestures-today', 'staged=/tmp/business-control-swipe-tabs', 1),
        ('backups/pre-mobile-gestures-today-', 'backups/pre-swipe-tabs-', 1),
        ('/tmp/tessavie-mobile-gestures-today-check.', '/tmp/tessavie-swipe-tabs-check.', 2),
        ('/opt/business-control/releases/20260914-mobile-access-f1aa726', PREVIOUS_RELEASE, 1),
        ('cb24563873df325f74c024e79b330e728ba0acb9433377508f6dd8dd5fe03609', PREVIOUS_SHA256, 1),
        ('f1aa726', '11e7614', 2),
        ('previous_mobile_gestures_and_habit_today_ui_restored', 'previous_ui_without_swipe_tabs_restored', 2),
        ('app.js?v=20260914-mobile-access-1', 'app.js?v=20260914-mobile-gestures-today-1', 1),
    )
    for old, new, count in replacements:
        script = checked_replace(script, old, new, count)
    # Keep existing smoke checks; add only the new dependency and its hooks.
    marker = "  grep -qF 'habit-entry-history' \"$dry/habit-tracker.js\"\n"
    additions = '''  grep -qF 'data-swipe-tabs="personal-habits"' "$dry/habit-tracker.js"
  grep -qF 'data-swipe-tablist' "$dry/habit-tracker.js"
  grep -qF 'data-swipe-panel' "$dry/habit-tracker.js"
  grep -qF 'swipe-tabs.js?v=20260914-swipe-tabs-1' "$dry/app.js"
  grep -qF 'installSwipeTabs' "$dry/app.js"
  grep -qF 'revealSwipeTab' "$dry/app.js"
  curl --max-time 15 -fsS "$base/swipe-tabs.js?v=20260914-swipe-tabs-1" > "$dry/swipe-tabs.js"
  grep -qF 'export function installSwipeTabs' "$dry/swipe-tabs.js"
  grep -qF 'export function revealSwipeTab' "$dry/swipe-tabs.js"
'''
    script = checked_replace(script, marker, marker + additions)
    marker = "  grep -qF 'tessavie-shell-20260914-swipe-tabs-1' \"$dry/sw.js\"\n"
    script = checked_replace(script, marker, marker +
                             "  grep -qF 'swipe-tabs.js?v=20260914-swipe-tabs-1' \"$dry/sw.js\"\n")
    # The shared verifier filename is deliberately historical. It checks schema
    # and rows only. Actual rollback binary identity is pinned in this script.
    forbidden = ('mobile-access-f1aa726', 'cb24563873df325f74c024e79b330e728ba0acb9433377508f6dd8dd5fe03609',
                 '20260914-mobile-access-1', 'f1aa726')
    if any(value in script for value in forbidden):
        raise ValueError('Obsolete runtime baseline survived generation')
    return script


def main():
    root = Path(__file__).resolve().parents[1]
    script = generate((root / TEMPLATE).read_text(encoding='utf-8'),
                      (root / VERIFIER).read_text(encoding='utf-8'))
    output = root / '.artifacts' / 'swipe-tabs-20260914'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'deploy.sh').write_text(script, encoding='utf-8', newline='\n')
    manifest = {
        'version': 1, 'kind': 'prepared_not_deployed',
        'template': TEMPLATE, 'templateNormalizedSha256': TEMPLATE_SHA256,
        'verifier': VERIFIER, 'verifierNormalizedSha256': VERIFIER_SHA256,
        'generatedScriptSha256': digest(script), 'cacheVersion': CACHE_VERSION,
        'expectedPreviousCommit': PREVIOUS_COMMIT, 'expectedPreviousRelease': PREVIOUS_RELEASE,
        'expectedPreviousSha256': PREVIOUS_SHA256, 'schema': '071_web_push.sql', 'tables': 129,
        'stagedBinary': '/tmp/business-control-swipe-tabs',
        'releaseNamePattern': '20260914-swipe-tabs-<candidate commit prefix>',
        'candidateCommit': None, 'candidateSha256': None,
        'rollback': 'Previous binary with latest verified 071 data; never restore old DB over live data',
    }
    (output / 'deploy-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
                                               encoding='utf-8', newline='\n')
    print(json.dumps({'prepared': str(output), 'scriptSha256': digest(script)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
