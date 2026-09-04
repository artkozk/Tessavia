#!/usr/bin/env bash
set -Eeuo pipefail
: "${RELEASE_NAME:?Set release name}"
: "${CANDIDATE_COMMIT:?Set source commit}"
: "${EXPECTED_SHA256:?Set binary hash}"
: "${EXPECTED_PREVIOUS:?Set verified previous release}"
[[ "$RELEASE_NAME" =~ ^20260904-personal-review-[a-f0-9]+$ ]]
[[ "$CANDIDATE_COMMIT" =~ ^[a-f0-9]{7,40}$ ]]
[[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]
exec 9>/run/business-control-deploy.lock
flock -n 9
root=/opt/business-control
release="$root/releases/$RELEASE_NAME"
staged=/tmp/business-control-personal-review
db=/var/lib/business-control/business-control.db
previous=$(readlink -f "$root/current")
test "$previous" = "$EXPECTED_PREVIOUS"
backup="/var/lib/business-control/backups/pre-personal-review-$(date -u +%Y%m%dT%H%M%SZ)"
dry=''; dry_pid=''; switch_started=0; release_created=0
nginx_config=/etc/nginx/sites-enabled/business-control
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$dry_pid" ]]; then kill "$dry_pid" 2>/dev/null || true; wait "$dry_pid" 2>/dev/null || true; fi
  if [[ -n "$dry" && "$dry" == /tmp/tessavie-personal-review-check.* ]]; then rm -rf -- "$dry"; fi
  if [[ "$result" -ne 0 && "$switch_started" -eq 1 ]]; then
    systemctl stop business-control || true
    ln -sfn "$previous" "$root/current.next"
    mv -Tf "$root/current.next" "$root/current"
    systemctl start business-control
    printf 'ROLLED_BACK=%s\n' "$previous" >&2
  fi
  if [[ "$result" -ne 0 && "$switch_started" -eq 0 && "$release_created" -eq 1 ]]; then
    [[ "$release" == "$root/releases/$RELEASE_NAME" ]]
    rm -rf -- "$release"
  fi
  exit "$result"
}
trap cleanup EXIT
test -f "$staged"; test -f "$db"; test -x "$previous/business-control"; test ! -e "$release"
printf '%s  %s\n' "$EXPECTED_SHA256" "$staged" | sha256sum -c -
python3 - <<'PY'
import socket
with socket.socket() as s: s.bind(('127.0.0.1', 18627))
PY
install -d -m 0700 "$backup"
sqlite3 "$db" '.timeout 5000' ".backup '$backup/business-control.db'"
tar -C /var/lib/business-control -czf "$backup/uploads.tar.gz" uploads
install -m 0600 /etc/business-control.env "$backup/business-control.env"
cp -L -- "$nginx_config" "$backup/business-control.nginx.conf"
chmod 0600 "$backup/business-control.nginx.conf"
printf '%s\n' "$previous" > "$backup/previous-release.txt"
printf '%s\n' "$CANDIDATE_COMMIT" > "$backup/candidate-commit.txt"
(cd "$backup" && sha256sum business-control.db uploads.tar.gz business-control.env business-control.nginx.conf > SHA256SUMS)
test "$(sqlite3 "$backup/business-control.db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$backup/business-control.db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
printf 'BACKUP=%s\n' "$backup"
install -d -m 0755 "$release"
release_created=1
install -m 0755 "$staged" "$release/business-control"
cmp -- "$staged" "$release/business-control"
rm -f -- "$staged"
dry=$(mktemp -d /tmp/tessavie-personal-review-check.XXXXXX)
cp "$backup/business-control.db" "$dry/check.db"
mkdir "$dry/uploads"
chown -R business-control:business-control "$dry"
runuser -u business-control -- env BUSINESS_REMINDERS_ENABLED=false BUSINESS_ADDRESS=127.0.0.1:18627 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$release/business-control" > "$dry/server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:18627/api/health > "$dry/health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30; sleep 1
done
python3 /tmp/verify-personal-review-migration.py "$backup/business-control.db" "$dry/check.db"

check_http() {
  local base="$1"
  curl --max-time 15 -fsS "$base/personal-review.js?v=20260904-personal-review-3" > "$dry/personal-review.js"
  grep -qF 'createPersonalReviewUI' "$dry/personal-review.js"
  grep -qF 'reviewHabitResultText' "$dry/personal-review.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/review")" = 401
  test "$(curl --max-time 10 -s -X PUT -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/review/2026-08-31/plan/not-owned")" = 401
  curl --max-time 15 -fsS "$base/personal-waiting.js?v=20260904-personal-waiting-4" > "$dry/personal-waiting.js"
  grep -qF 'createPersonalWaitingUI' "$dry/personal-waiting.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/waiting")" = 401
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/waiting/not-owned/receive")" = 401
  curl --max-time 15 -fsS "$base/habit-reminders.js?v=20260904-habit-reminders-1" > "$dry/habit-reminders.js"
  grep -qF 'createHabitReminderUI' "$dry/habit-reminders.js"
  for method in GET PUT; do
    test "$(curl --max-time 10 -s -X "$method" -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/habits/not-owned/reminder")" = 401
  done

  curl --max-time 15 -fsS "$base/reminder-settings.js?v=20260904-habit-reminders-1" > "$dry/reminder-settings.js"
  grep -qF 'habitsEnabled' "$dry/reminder-settings.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/reminders")" = 401
  for method in GET PUT; do
    test "$(curl --max-time 10 -s -X "$method" -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/plans/not-owned/reminder")" = 401
  done
  curl --max-time 15 -fsS "$base/reading.js?v=20260904-reading-1" > "$dry/reading.js"
  grep -qF 'createReadingUI' "$dry/reading.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/reading")" = 401
  curl --max-time 15 -fsS "$base/personal-reminders.js?v=20260904-habit-reminders-1" > "$dry/personal-reminders.js"
  grep -qF 'createPersonalRemindersUI' "$dry/personal-reminders.js"
  for method in GET PUT; do
    test "$(curl --max-time 10 -s -X "$method" -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/me/reminders")" = 401
  done
  curl --max-time 15 -fsS "$base/personal-navigation.js?v=20260904-personal-scope-1" > "$dry/personal-navigation.js"
  grep -qF 'export function personalRoute' "$dry/personal-navigation.js"
  curl --max-time 15 -fsS "$base/personal-today.js?v=20260904-personal-day-3" > "$dry/personal-today.js"
  grep -qF 'createPersonalTodayUI' "$dry/personal-today.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/day")" = 401
  for path in settings 2026-09-04/focus; do
    test "$(curl --max-time 10 -s -X PUT -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/day/$path")" = 401
  done
  for module in personal-inbox first-use; do
    curl --max-time 15 -fsS "$base/$module.js?v=20260904-first-use-4" > "$dry/$module.js"
  done
  grep -qF 'createPersonalInboxUI' "$dry/personal-inbox.js"
  grep -qF 'createFirstUseUI' "$dry/first-use.js"
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/notes/not-owned/plan")" = 401
  for method in GET PATCH; do
    test "$(curl --max-time 10 -s -X "$method" -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/me/journey")" = 401
  done
  for module in life-map personal-publish; do
    curl --max-time 15 -fsS "$base/$module.js?v=20260904-personal-batch-3" > "$dry/$module.js"
  done
  grep -qF 'createPersonalPublishUI' "$dry/personal-publish.js"
  grep -qF 'createLifeMapUI' "$dry/life-map.js"
  for path in publications/preview publications/not-owned/apply; do
    test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/$path")" = 401
  done
  test "$(curl --max-time 10 -s -X PUT -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/life/settings")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/publications/not-owned")" = 401
  curl --max-time 15 -fsS "$base/emoji-picker.js?v=20260904-chat-emoji-3" > "$dry/emoji-picker.js"
  grep -qF 'createEmojiPickerUI' "$dry/emoji-picker.js"
  curl --max-time 15 -fsS "$base/vendor/emoji-17.0-cldr48.2.json" > "$dry/emoji.json"
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert len(d["items"])==3944 and len(d["groups"])==9' "$dry/emoji.json"
  for method in PUT POST; do
    test "$(curl --max-time 10 -s -X "$method" -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/chat/messages/not-owned/reaction")" = 401
  done
  curl --max-time 15 -fsS "$base/note-media.js?v=20260904-note-media-3" > "$dry/note-media.js"
  grep -qF 'createNoteMediaUI' "$dry/note-media.js"
  grep -qF 'createNoteFileDraftStore' "$dry/note-media.js"
  for path in notes/archive notes/not-owned/versions notes/not-owned/attachments note-attachments/not-owned/file; do
    test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/$path")" = 401
  done
  for path in notes/not-owned/restore notes/not-owned/versions/1/restore note-attachments; do
    test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/$path")" = 401
  done
  curl --max-time 15 -fsS "$base/note-library.js?v=20260904-note-media-3" > "$dry/note-library.js"
  grep -qF 'createNoteLibraryUI' "$dry/note-library.js"
  grep -qF 'createNoteShortcutKeys' "$dry/note-library.js"
  for path in note-folders note-templates notes/daily; do
    test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/$path")" = 401
  done
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/note-templates/not-owned")" = 401
  curl --max-time 15 -fsS "$base/bulk-work.js?v=20260904-bulk-actions-3" > "$dry/bulk-work.js"
  grep -qF 'createBulkWorkUI' "$dry/bulk-work.js"
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/record-batches/preview")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/record-batches/latest")" = 401
  curl --max-time 15 -fsS "$base/habit-tracker.js?v=20260904-personal-waiting-4" > "$dry/habit-tracker.js"
  grep -qF 'export function createHabitUI(' "$dry/habit-tracker.js"
  grep -qF 'habitSnoozeLabel' "$dry/habit-tracker.js"
  grep -qF 'habit-entry-week' "$dry/habit-tracker.js"
  grep -qF 'saveMeasurement' "$dry/habit-tracker.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/habits/not-owned/tracker")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/habits/not-owned/export")" = 401

  curl --max-time 15 -fsS "$base/" > "$dry/index.html"
  grep -q '<title>Tessavie</title>' "$dry/index.html"
  grep -q '20260904-personal-review-3' "$dry/index.html"
  ! grep -qi 'bizflow' "$dry/index.html"
  ! grep -q 'tessavie.css\|auth-weave' "$dry/index.html"
  ! grep -q 'brand-symbol' "$dry/index.html"
  grep -qF 'tessavie-logo-light.svg?v=linked-1' "$dry/index.html"
  grep -qF 'tessavie-logo.svg?v=linked-1' "$dry/index.html"
  curl --max-time 15 -fsS "$base/styles.css" > "$dry/styles.css"
  grep -q -- '--accent: #126a55;' "$dry/styles.css"
  grep -q -- '--nav: #202824;' "$dry/styles.css"
  grep -qF '.personal-create-menu { position: relative; align-self: auto; }' "$dry/styles.css"
  grep -qF 'width: max(22px, 82%); height: auto;' "$dry/styles.css"
  grep -qF 'right: 0; top: -8px;' "$dry/styles.css"
  grep -qF 'width: 128px;' "$dry/styles.css"
  grep -qF '.inbox-note-sheet' "$dry/styles.css"
  curl --max-time 15 -fsS "$base/app.js" > "$dry/app.js"
  grep -qF 'graph-layout-state.js?v=20260903-graph-layouts-1' "$dry/app.js"
  curl --max-time 15 -fsS "$base/graph-layout-state.js?v=20260903-graph-layouts-1" > "$dry/graph-layout-state.js"
  grep -qF 'export function createGraphLayoutStore(' "$dry/graph-layout-state.js"
  grep -qF 'async function keepLocal(' "$dry/graph-layout-state.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/graph/layout?view=project")" = 401
  grep -qF 'function captureProjectContext(' "$dry/app.js"
  grep -qF 'function defaultWorkBoardLayout(' "$dry/app.js"
  grep -qF 'scrollbar-width: none;' "$dry/styles.css"
  grep -qF 'function currentWorkWindow(' "$dry/app.js"
  grep -qF 'data-schema-delete=' "$dry/app.js"
  grep -qF 'data-work-page-jump' "$dry/app.js"
  grep -qF 'data-board-more=' "$dry/app.js"
  grep -qF 'board-column-scroll' "$dry/styles.css"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/collections/verify/schema")" = 401
  test "$(curl --max-time 10 -s -X DELETE -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/collections/verify/fields/verify")" = 401

  grep -qF 'function closeTopTransientPanel(' "$dry/app.js"
  grep -qF 'NETWORK_UNAVAILABLE' "$dry/app.js"
  grep -qF 'class="collection-page-actions"' "$dry/app.js"
  ! grep -qF '.collection-page-heading > div:last-child' "$dry/styles.css"
  grep -qF '.collection-page-heading > .collection-page-actions' "$dry/styles.css"
  grep -qF 'data-switch-personal=' "$dry/app.js"
  grep -qF "'/api/personal/search'" "$dry/app.js"
  grep -qF 'data-directory-leave=' "$dry/app.js"
  grep -qF 'Рабочее пространство команды' "$dry/app.js"
  grep -qF 'function personalPlanContextFields(' "$dry/app.js"
  grep -qF 'data-personal-create="project"' "$dry/app.js"
  grep -qF '/api/personal/plans/${id}/skip' "$dry/app.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/search?q=test")" = 401
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/projects")" = 401
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/goals")" = 401
  grep -qF "from './outbox-ui.js?v=20260904-first-use-4'" "$dry/app.js"
  curl --max-time 15 -fsS "$base/offline-outbox.js?v=20260903-offline-outbox-3" > "$dry/offline-outbox.js"
  curl --max-time 15 -fsS "$base/outbox-ui.js?v=20260904-first-use-4" > "$dry/outbox-ui.js"
  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"
  grep -qF "20260904-personal-review-3" "$dry/sw.js"
  grep -qF 'createIndexedOutbox' "$dry/offline-outbox.js"
  grep -qF 'id="work-owner-select"' "$dry/app.js"
  grep -qF "function hasOtherProjectParticipants()" "$dry/app.js"
  grep -qF "function workScopeOptions()" "$dry/app.js"
  grep -qF 'aria-label="Поиск в очереди работы"' "$dry/app.js"
  grep -qF 'input:where(:not([type="checkbox"]):not([type="radio"]))' "$dry/styles.css"
  grep -qF 'pointer-events: none;' "$dry/styles.css"
  grep -qF 'async function readProjectPages(' "$dry/app.js"
  grep -qF 'data-cancel-project-load' "$dry/app.js"
  grep -qF 'function notebookContent(title, body)' "$dry/app.js"
  grep -qF 'data-team-panel="settings"' "$dry/app.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/records?pageSize=200")" = 401
  grep -qF "calendar.style.setProperty('--calendar-scale',widgetScale(block,settings)/100);" "$dry/app.js"
  ! grep -qF 'data-calendar-scalable style="--calendar-scale:' "$dry/app.js"
  grep -qF "function personalNoteSheet(item, { bodyName = 'body', pin = true } = {})" "$dry/app.js"
  grep -qF "bindPersonalNoteSheet(createForm, 'Текст входящего')" "$dry/app.js"
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/records")" = 401
  grep -qF 'escapeHTML(projectName)' "$dry/app.js"
  grep -qF 'aria-current=' "$dry/app.js"
  grep -qF "/api/personal/capture" "$dry/outbox-ui.js"
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/capture")" = 401
  test "$(curl --max-time 10 -s -X PATCH -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/notes/not-owned/inbox")" = 401
  curl --max-time 15 -fsS "$base/manifest.webmanifest" > "$dry/manifest.json"
  python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); assert m["name"]=="Tessavie" and m["background_color"]=="#faf9f5" and m["theme_color"]=="#14725e" and all("linked-1" in i["src"] for i in m["icons"])' "$dry/manifest.json"
  for asset in tessavie-logo.svg tessavie-logo-light.svg tessavie-mark.svg tessavie-32.png tessavie-180.png tessavie-192.png tessavie-512.png tessavie-maskable-512.png; do
    curl --max-time 15 -fsS "$base/brand/$asset" > /dev/null
  done
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/overview")" = 401
}
check_http http://127.0.0.1:18627
kill "$dry_pid"; wait "$dry_pid" 2>/dev/null || true; dry_pid=''
printf 'DRY_RUN=ok\n'
test "$(readlink -f "$root/current")" = "$previous"
switch_started=1
systemctl stop business-control
sqlite3 "$db" '.timeout 5000' ".backup '$backup/cutover.db'"
test "$(sqlite3 "$backup/cutover.db" 'PRAGMA integrity_check;')" = ok
tar -C /var/lib/business-control -czf "$backup/cutover-uploads.tar.gz" uploads
(cd "$backup" && sha256sum cutover.db cutover-uploads.tar.gz >> SHA256SUMS)
ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
systemctl start business-control
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:8522/api/health > "$backup/local-health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30; sleep 1
done
grep -qF 'client_max_body_size 16m;' "$nginx_config"
nginx -t
check_http http://127.0.0.1:8522
check_http https://control.e-rd.ru
python3 - <<'PY'
import urllib.request,urllib.error
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
request=urllib.request.Request('https://control.e-rd.ru/api/personal/note-attachments',data=b'x'*(2*1024*1024),headers={'Content-Type':'application/octet-stream'})
try: opener.open(request,timeout=20);raise AssertionError('Private upload accepted without auth')
except urllib.error.HTTPError as e: assert e.code==401,e.code
print('PUBLIC_UPLOAD_ABOVE_1M=owner-auth-required')
PY
curl --max-time 15 -fsS https://control.e-rd.ru/api/health > "$backup/public-health.json"
test "$(systemctl is-active business-control)" = active
test "$(sqlite3 "$db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='029_tessavie_brand.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='030_personal_inbox.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='033_graph_layouts.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='034_offline_create_receipts.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='035_personal_planning.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='036_one_team_per_workspace.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='037_habit_tracker.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='038_record_batches.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='039_note_organization.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='040_note_media_history.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='041_personal_publications.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='042_journey_preferences.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='043_personal_day.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='044_personal_page_scope.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='045_deadline_delivery_sources.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='048_personal_plan_reminders.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='049_habit_reminder_delivery.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='050_habit_snooze_metadata.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='051_personal_waiting.sql';")" = 1

test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='052_personal_weekly_review.sql';")" = 1
printf 'RELEASE=%s\nCOMMIT=%s\nSHA256=%s\nDEPLOY=ok\n' "$release" "$CANDIDATE_COMMIT" "$EXPECTED_SHA256"
