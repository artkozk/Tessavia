"""Read-only validation of schema 070 and the server-backed block trash.

Startup must preserve every table value. The pinned rollback baseline e881e41
already understands archived trees and their reserved IDs, so valid active trash
is compatible. This verifier checks database compatibility, not binary identity;
the release script must separately pin the reviewed baseline executable. No
restore, history deletion, private values or paths are part of this verifier.
Historical archived personal references remain supported persisted data; rollback
can reintroduce an editing limitation without requiring their deletion.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys


EXPECTED_SCHEMA_SHA256 = '6db033c897760b40216219477e67db9c4d4f642e66dd84d17a05c6bf6309d094'
EXPECTED_TABLE_COUNT = 127
ROLLBACK_BASELINE_COMMIT = 'e881e41060e31a2b08c2d20cd783bcbf0e19051f'
# Filled from the reviewed migration filenames through 070, not the live server.
EXPECTED_MIGRATIONS = ('001_init.sql', '002_question_workflow.sql', '003_traceable_outputs_and_meetings.sql', '004_record_priority.sql', '005_collaboration_hierarchy_activity.sql', '006_research_comparison.sql', '007_workflow_comfort.sql', '008_decision_and_research_semantics.sql', '009_team_chat.sql', '010_chat_message_history.sql', '011_chat_message_idempotency.sql', '012_business_memory_and_safe_undo.sql', '013_blockers_and_knowledge_provenance.sql', '014_productivity_and_quality.sql', '015_planning_cycles.sql', '016_personal_workspace_foundation.sql', '017_profile_avatars.sql', '018_workspace_crm_constructor.sql', '019_team_projects_invites_preferences.sql', '020_interface_layout.sql', '021_project_composer.sql', '022_device_interface_preferences.sql', '023_interface_presets.sql', '024_personal_calendar.sql', '025_page_record_types.sql', '026_personal_note_schedule.sql', '027_team_lifecycle.sql', '028_team_activity.sql', '029_tessavie_brand.sql', '030_personal_inbox.sql', '031_notebook_title_origin.sql', '032_personal_criterion_scores.sql', '033_graph_layouts.sql', '034_offline_create_receipts.sql', '035_personal_planning.sql', '036_one_team_per_workspace.sql', '037_habit_tracker.sql', '038_record_batches.sql', '039_note_organization.sql', '040_note_media_history.sql', '041_personal_publications.sql', '042_journey_preferences.sql', '043_personal_day.sql', '044_personal_page_scope.sql', '045_deadline_delivery_sources.sql', '046_homegroup_reading.sql', '047_reminder_preferences.sql', '048_personal_plan_reminders.sql', '049_habit_reminder_delivery.sql', '050_habit_snooze_metadata.sql', '051_personal_waiting.sql', '052_personal_weekly_review.sql', '053_personal_waiting_pings.sql', '054_reminder_digests.sql', '055_reading_reflections.sql', '056_chat_conversations.sql', '057_personal_calendar_work.sql', '058_chat_group_lifecycle.sql', '059_personal_recurrence_templates.sql', '060_collection_field_defaults.sql', '061_chat_personal_pins.sql', '062_chat_personal_archives.sql', '063_task_completion_review.sql', '064_page_app_composition.sql', '065_record_create_requests.sql', '066_personal_finance.sql', '067_personal_finance_counterparties.sql', '068_page_app_sheet_values.sql', '069_personal_finance_expenses.sql', '070_page_app_components.sql')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def connect_readonly(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=20)
    db.execute('BEGIN')
    return db


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def table_names(db, include_internal=False):
    query = "SELECT name FROM sqlite_master WHERE type='table'"
    if not include_internal:
        query += " AND name NOT LIKE 'sqlite_%'"
    return {row[0] for row in db.execute(query)}


def schema_objects(db):
    return sorted((kind, name, table, sql.replace('\r\n', '\n')) for kind, name, table, sql in db.execute(
        "SELECT type,name,tbl_name,COALESCE(sql,'') FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"))


def schema_digest(objects):
    return hashlib.sha256(json.dumps(objects, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def table_rows(db, table):
    # Lists (rather than dicts/sets) preserve column order and duplicate rows.
    # Tagged values distinguish NULL, blobs, integers, reals and text exactly.
    def encode(row):
        return json.dumps([(type(value).__name__, value.hex() if isinstance(value, bytes) else value)
                           for value in row], ensure_ascii=False, separators=(',', ':'))
    return sorted(encode(row) for row in db.execute('SELECT * FROM ' + identifier(table)))


BLOCK_KEYS = set('sheet recordCard parentId groupLayout gap elementStyles recordBindings visibility data actions formFields defaultTitle successText collectionId fields allowCreate actionLabel id kind title text items source width height fontSize color background radius padding hidden format'.split())
BLOCK_KINDS = set('heading text tracker progress button records form data group sheet'.split())
TRASH_ACTIONS = {'app_blocks_removed', 'app_blocks_restored'}


def exact_json(raw):
    def pairs(values):
        result = {}
        for key, value in values:
            require(key not in result, 'Duplicate archive JSON key')
            result[key] = value
        return result
    def invalid_constant(unused):
        raise ValueError('Invalid archive JSON number')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid_constant)


def valid_id(value, minimum=1):
    return isinstance(value, str) and minimum <= len(value) <= 64 and re.fullmatch(r'[a-zA-Z0-9_-]+', value) is not None


def valid_int(value, minimum, maximum=None):
    return type(value) is int and value >= minimum and (maximum is None or value <= maximum)


def snapshot_ids(snapshot, details):
    require(isinstance(snapshot, dict) and set(snapshot) == {'version', 'rootBlockId', 'blocks', 'positions'}, 'Unknown archive snapshot')
    require(type(snapshot['version']) is int and snapshot['version'] == 1, 'Unknown snapshot version')
    root = snapshot['rootBlockId']
    require(root == details['rootBlockId'], 'Archive root mismatch')
    blocks, positions = snapshot['blocks'], snapshot['positions']
    require(isinstance(blocks, list) and len(blocks) == details['blockCount'], 'Archive block count mismatch')
    require(isinstance(positions, list) and len(positions) == len(blocks), 'Archive positions missing')
    require(all(valid_int(position, 0, 39) for position in positions)
            and positions == sorted(set(positions)), 'Invalid archive positions')
    by_id = {}
    for block in blocks:
        require(isinstance(block, dict) and set(block) <= BLOCK_KEYS, 'Unknown archive block fields')
        key = block.get('id')
        require(valid_id(key) and key not in by_id and block.get('kind') in BLOCK_KINDS, 'Invalid archived block identity')
        for field in ('title', 'text', 'source', 'parentId'):
            require(field not in block or isinstance(block[field], str), 'Invalid archived block text')
        parent = block.get('parentId', '')
        require(parent == '' or valid_id(parent), 'Invalid archived parent')
        require('hidden' not in block or type(block['hidden']) is bool, 'Invalid archived visibility')
        items = block.get('items', [])
        require(isinstance(items, list) and len(items) <= 500, 'Invalid archived items')
        item_ids = set()
        for item in items:
            require(isinstance(item, dict) and set(item) <= {'id', 'label', 'hidden'}, 'Unknown archived item fields')
            require(valid_id(item.get('id')) and item['id'] not in item_ids, 'Invalid archived item identity')
            require(isinstance(item.get('label'), str) and 1 <= len(item['label']) <= 160, 'Invalid archived item label')
            require('hidden' not in item or type(item['hidden']) is bool, 'Invalid archived item visibility')
            item_ids.add(item['id'])
        by_id[key] = block
    require(root in by_id, 'Missing archived root')
    require(by_id[root].get('parentId', '') not in by_id, 'Archive root is inside its subtree')
    for key in by_id:
        current, seen = key, set()
        while current != root:
            require(current not in seen and len(seen) < 4, 'Invalid archived hierarchy')
            seen.add(current)
            parent = by_id[current].get('parentId', '')
            require(parent in by_id and by_id[parent]['kind'] == 'group', 'Disconnected archived subtree')
            current = parent
    return set(by_id)


def validate_block_trash(db):
    events, requests = {}, set()
    for event_id, actor, entity_type, page, action, raw, workspace in db.execute(
            "SELECT id,actor_id,entity_type,entity_id,action,details_json,workspace_id FROM activity WHERE action GLOB 'app_blocks_*'"):
        require(action in TRASH_ACTIONS and entity_type == 'workspace_page', 'Unknown block trash event')
        require(valid_id(event_id) and valid_id(page) and isinstance(workspace, str) and workspace != '', 'Invalid trash event scope')
        require(db.execute('SELECT 1 FROM workspace_pages WHERE id=? AND workspace_id=?', (page, workspace)).fetchone(), 'Trash page scope missing')
        details = exact_json(raw)
        required = {'title', 'blockCount', 'revision', 'rootBlockId', 'clientRequestId', 'requestHash'}
        required.add('snapshot' if action == 'app_blocks_removed' else 'trashId')
        require(isinstance(details, dict) and set(details) == required, 'Unknown trash receipt fields')
        require(isinstance(details['title'], str) and 1 <= len(details['title']) <= 160, 'Invalid trash title')
        require(valid_int(details['blockCount'], 1, 40) and valid_int(details['revision'], 1), 'Invalid trash receipt counters')
        require(valid_id(details['rootBlockId']) and valid_id(details['clientRequestId'], 16), 'Invalid trash receipt identifiers')
        require(isinstance(details['requestHash'], str) and re.fullmatch(r'[a-f0-9]{64}', details['requestHash']), 'Invalid trash request hash')
        request_key = (workspace, page, actor, action, details['clientRequestId'])
        require(request_key not in requests, 'Duplicate trash receipt')
        requests.add(request_key)
        ids = snapshot_ids(details['snapshot'], details) if action == 'app_blocks_removed' else set()
        if action == 'app_blocks_restored':
            require(valid_id(details['trashId']), 'Invalid restored event target')
        events[event_id] = {'actor': actor, 'page': page, 'workspace': workspace, 'action': action, 'details': details, 'ids': ids}
    linked, restored = set(), set()
    for original_id, undo_actor, restored_id in db.execute('SELECT activity_id,undone_by,undo_activity_id FROM activity_undos'):
        if original_id not in events and restored_id not in events:
            continue
        original, restore = events.get(original_id), events.get(restored_id)
        require(original is not None and restore is not None, 'Trash undo event missing')
        require(original['action'] == 'app_blocks_removed' and restore['action'] == 'app_blocks_restored', 'Invalid trash undo actions')
        require(original['page'] == restore['page'] and original['workspace'] == restore['workspace'], 'Trash undo scope mismatch')
        require(restore['actor'] == undo_actor and restore['details']['trashId'] == original_id, 'Trash undo receipt mismatch')
        require(all(original['details'][field] == restore['details'][field] for field in ('rootBlockId', 'blockCount')), 'Restored tree mismatch')
        require(restore['details']['revision'] > original['details']['revision'], 'Invalid restore revision')
        require(restored_id not in restored, 'Restore event used more than once')
        linked.add(original_id)
        restored.add(restored_id)
    require(all(key in restored for key, event in events.items() if event['action'] == 'app_blocks_restored'), 'Unlinked trash restoration')
    pending, reserved = 0, {}
    for event_id, event in events.items():
        if event['action'] != 'app_blocks_removed' or event_id in linked:
            continue
        pending += 1
        scope = (event['workspace'], event['page'])
        require(not (reserved.get(scope, set()) & event['ids']), 'Overlapping archived identities')
        reserved.setdefault(scope, set()).update(event['ids'])
    for (_, page), ids in reserved.items():
        row = db.execute('SELECT definition_json FROM page_app_definitions WHERE page_id=?', (page,)).fetchone()
        require(row is not None, 'Archived page definition missing')
        definition = exact_json(row[0])
        require(isinstance(definition, dict) and definition.get('version') == 1 and isinstance(definition.get('blocks'), list), 'Invalid current archived page')
        blocks = definition['blocks']
        require(all(isinstance(block, dict) and valid_id(block.get('id')) for block in blocks), 'Invalid current block identity')
        require(not (ids & {block['id'] for block in blocks}), 'Reserved archived identity reused')
    return pending


def validate(db):
    require(len(table_names(db)) == EXPECTED_TABLE_COUNT, 'Unexpected table count')
    require(schema_digest(schema_objects(db)) == EXPECTED_SCHEMA_SHA256, 'Unknown schema')
    require(tuple(row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version'))
            == EXPECTED_MIGRATIONS, 'Unknown migration receipts')
    require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Database integrity failed')
    require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign key validation failed')
    return validate_block_trash(db)


def verify(before_path, after_path):
    with closing(connect_readonly(before_path)) as before, closing(connect_readonly(after_path)) as after:
        validate(before)
        validate(after)
        require(schema_objects(before) == schema_objects(after), 'Schema changed')
        tables = table_names(before, include_internal=True)
        require(tables == table_names(after, include_internal=True), 'Internal table set changed')
        for table in sorted(tables):
            require(table_rows(before, table) == table_rows(after, table), 'Persisted table changed')
    print('UNCHANGED_TABLES=127\nEXACT_SCHEMA_070=ok\nALL_DATA_UNCHANGED=ok\nNO_MIGRATIONS=ok')


def rollback_safe(path):
    with closing(connect_readonly(path)) as db:
        # e881e41 supports trash snapshots, receipts, restore and ID reservation.
        # Validation still rejects corrupt history and reused archived identities.
        validate(db)
    print('ROLLBACK_SAFE=schema_070_block_trash_supported_latest_data_retained')


def validate_only(path):
    with closing(connect_readonly(path)) as db:
        validate(db)
    print('EXACT_SCHEMA_070=ok\nBLOCK_TRASH_STATE=ok\nDATABASE_VALIDATION=ok')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--rollback-safe':
        try:
            rollback_safe(sys.argv[2])
        except Exception:
            print('ROLLBACK_BLOCKED=unknown_schema_or_unverifiable_state', file=sys.stderr)
            raise SystemExit(3)
    elif len(sys.argv) == 3 and sys.argv[1] == '--validate-only':
        try:
            validate_only(sys.argv[2])
        except Exception:
            print('DATABASE_VALIDATION_FAILED=unknown_schema_or_invalid_block_trash', file=sys.stderr)
            raise SystemExit(2)
    elif len(sys.argv) == 3:
        try:
            verify(*sys.argv[1:])
        except Exception:
            print('DATABASE_VERIFICATION_FAILED=changed_or_unverifiable_state', file=sys.stderr)
            raise SystemExit(2)
    else:
        raise SystemExit('Usage: verify-personal-references-database.py BEFORE AFTER | --validate-only DB | --rollback-safe DB')
