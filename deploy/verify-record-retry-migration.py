"""Run only on the production host: linked records must preserve every existing schema and row."""
import json, sqlite3, sys
before, after = [sqlite3.connect('file:'+path+'?mode=ro', uri=True) for path in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row
def tables(db):
    return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert len(tables(before)) == 116
assert tables(after) == tables(before) | {'record_create_requests'}
assert after.execute('SELECT count(*) FROM record_create_requests').fetchone()[0] == 0
assert after.execute("SELECT count(*) FROM schema_migrations WHERE version='065_record_create_requests.sql'").fetchone()[0] == 1
for table in tables(before):
    assert list(before.execute('PRAGMA table_info("'+table+'")')) == list(after.execute('PRAGMA table_info("'+table+'")')), table
    def rows(db):
        return sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False) for row in db.execute('SELECT * FROM "'+table+'"') if not (table=='schema_migrations' and row['version']=='065_record_create_requests.sql'))
    assert rows(before) == rows(after), 'Unexpected data change: '+table
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('VERIFIED_TABLES=116\nOLD_DATA_UNCHANGED=ok\nNEW_RECEIPTS_EMPTY=ok')
