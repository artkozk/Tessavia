"""Verify additive migration 057 against an offline pre-migration snapshot."""
import json
import sqlite3
import sys

before, after = [sqlite3.connect('file:' + path + '?mode=ro', uri=True) for path in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row

def tables(db):
    return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

added = {'personal_calendar_work_blocks', 'personal_calendar_confirmations'}
assert tables(after) == tables(before) | added
assert not tables(before) & added, 'Expected an unmigrated backup'

def rows(db, table, columns):
    selection = ','.join('"' + column.replace('"', '""') + '"' for column in columns)
    data = db.execute('SELECT ' + selection + ' FROM "' + table.replace('"', '""') + '"')
    return sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False) for row in data)

for table in tables(before):
    old_schema = [tuple(row) for row in before.execute('PRAGMA table_info("' + table + '")')]
    new_schema = [tuple(row) for row in after.execute('PRAGMA table_info("' + table + '")')]
    assert old_schema == new_schema, 'Changed old schema: ' + table
    columns = [row[1] for row in old_schema]
    old_rows, new_rows = rows(before, table, columns), rows(after, table, columns)
    if table == 'schema_migrations':
        remaining = [row for row in new_rows if json.loads(row)['version'] != '057_personal_calendar_work.sql']
        assert remaining == old_rows and len(new_rows) == len(old_rows) + 1
    else:
        assert old_rows == new_rows, 'Changed existing data in ' + table
for table in added:
    assert after.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] == 0
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('PRESERVED_TABLES=' + str(len(tables(before))))
print('ADDED_TABLES=' + str(len(added)))
print('DATA_PRESERVATION=ok')
