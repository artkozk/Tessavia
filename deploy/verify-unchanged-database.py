"""Verify an application-only dry run has not changed any persisted table."""
import json
import sqlite3
import sys

before, after = [sqlite3.connect('file:' + path + '?mode=ro', uri=True) for path in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row
tables = lambda db: {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(before) == tables(after)
def rows(db, table):
    return sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False) for row in db.execute('SELECT * FROM "' + table.replace('"', '""') + '"'))
for table in tables(before):
    assert rows(before, table) == rows(after, table), 'Unexpected data change in ' + table
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('UNCHANGED_TABLES=' + str(len(tables(before))))
