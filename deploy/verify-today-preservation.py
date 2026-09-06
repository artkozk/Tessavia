"""Verify an unchanged schema and all rows for a frontend-only release."""
import json
import sqlite3
import sys

before, after = [sqlite3.connect('file:' + path + '?mode=ro', uri=True) for path in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row
def tables(db):
    return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(after) == tables(before)

def rows(db, table, columns):
    selection=','.join('"'+column.replace('"','""')+'"' for column in columns)
    data=db.execute('SELECT '+selection+' FROM "'+table.replace('"','""')+'"')
    return sorted(json.dumps(dict(row),sort_keys=True,ensure_ascii=False) for row in data)
for table in tables(before):
    columns=[row['name'] for row in before.execute('PRAGMA table_info("'+table+'")')]
    assert rows(before,table,columns)==rows(after,table,columns),'Changed existing data in '+table
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('PRESERVED_TABLES='+str(len(tables(before))))
print('DATA_PRESERVATION=ok')
