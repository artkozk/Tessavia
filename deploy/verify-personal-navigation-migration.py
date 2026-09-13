"""Read-only comparison for a release without migrations, plus rollback guard.

All 123 tables, their rows and schema objects must match on server-local
copies. Financial data and sheet values are supported by the previous release;
the rollback guard is limited to newly introduced navigation and home settings.
"""
import json
from pathlib import Path
import sqlite3
import sys
from contextlib import closing


def connect_readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=20)


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def table_names(database):
    return {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def schema_objects(database):
    return {tuple(row) for row in database.execute("SELECT type,name,tbl_name,COALESCE(sql,'') FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}


def table_rows(database, table):
    return sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False) for row in database.execute('SELECT * FROM ' + identifier(table)))


def verify(before_path, after_path):
    with closing(connect_readonly(before_path)) as before, closing(connect_readonly(after_path)) as after:
        before.row_factory = after.row_factory = sqlite3.Row
        tables = table_names(before)
        assert len(tables) == 123, 'Unexpected baseline table count'
        assert table_names(after) == tables, 'Unexpected table change'
        assert schema_objects(before) == schema_objects(after), 'Unexpected schema object change'
        for table in sorted(tables):
            assert table_rows(before, table) == table_rows(after, table), 'Unexpected data change: ' + table
        for db in (before, after):
            assert db.execute("SELECT count(*) FROM schema_migrations WHERE version='068_page_app_sheet_values.sql'").fetchone()[0] == 1
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
    print('VERIFIED_TABLES=123\nSCHEMA_UNCHANGED=ok\nALL_DATA_UNCHANGED=ok\nMIGRATIONS_UNCHANGED=ok')


def new_navigation_settings(value, standalone_keys=False):
    if standalone_keys:
        if not isinstance(value, list):
            raise ValueError('Unrecognized navigation list')
        return any(isinstance(key, str) and key.startswith('personal:') for key in value)
    if isinstance(value, list):
        return any(new_navigation_settings(item) for item in value)
    if not isinstance(value, dict):
        return False
    for key, item in value.items():
        if key in ('navOrder', 'hiddenNavItems') and new_navigation_settings(item, True):
            return True
        if key == 'pages':
            if not isinstance(item, dict):
                raise ValueError('Unrecognized page settings')
            if any(page.startswith('personal:') for page in item):
                return True
            for page in item.values():
                if not isinstance(page, dict):
                    raise ValueError('Unrecognized page layout')
                # An explicit false is meaningful too: the old binary does not
                # know this setting and would silently discard the choice.
                if 'adaptiveToday' in page:
                    if not isinstance(page['adaptiveToday'], bool):
                        raise ValueError('Unrecognized adaptive home setting')
                    return True
                if 'shownBlocks' in page:
                    if not isinstance(page['shownBlocks'], list):
                        raise ValueError('Unrecognized explicitly shown blocks')
                    if page['shownBlocks']:
                        return True
        if new_navigation_settings(item):
            return True
    return False


def rollback_safe(path):
    with closing(connect_readonly(path)) as db:
        for table, columns in (
            ('user_interface_preferences', ('hidden_nav_items_json', 'nav_order_json', 'layout_json', 'mobile_preferences_json')),
            ('interface_presets', ('payload_json',)),
            ('interface_preset_applications', ('previous_payload_json', 'applied_payload_json')),
        ):
            for row in db.execute('SELECT ' + ','.join(identifier(column) for column in columns) + ' FROM ' + identifier(table)):
                for column, raw in zip(columns, row):
                    if raw in (None, ''):
                        continue
                    value = json.loads(raw)
                    if new_navigation_settings(value, column in ('hidden_nav_items_json', 'nav_order_json')):
                        raise ValueError('New personal navigation or home settings exist')
    print('ROLLBACK_SAFE=no_new_personal_navigation_or_home_settings')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--rollback-safe':
        try:
            rollback_safe(sys.argv[2])
        except Exception:
            print('ROLLBACK_BLOCKED=personal_navigation_or_home_settings_or_unverifiable_state', file=sys.stderr)
            raise SystemExit(3)
    elif len(sys.argv) == 3:
        verify(*sys.argv[1:])
    else:
        raise SystemExit('Usage: verify-personal-navigation-migration.py BEFORE AFTER | --rollback-safe DB')
