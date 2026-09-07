"""Run only on the production host: additive app composition must preserve all old rows."""
import json, sqlite3, sys
before, after = [sqlite3.connect('file:'+path+'?mode=ro', uri=True) for path in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row
def tables(db):
    return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
added = {'page_app_definitions', 'page_app_marks', 'page_app_templates'}
assert len(tables(before)) == 113
assert tables(after) - tables(before) == added
assert tables(before) - tables(after) == set()
assert after.execute("SELECT count(*) FROM schema_migrations WHERE version='064_page_app_composition.sql'").fetchone()[0] == 1
for table in tables(before):
    assert list(before.execute('PRAGMA table_info("'+table+'")')) == list(after.execute('PRAGMA table_info("'+table+'")')), table
    def rows(db):
        return sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False) for row in db.execute('SELECT * FROM "'+table+'"') if table != 'schema_migrations' or row['version'] != '064_page_app_composition.sql')
    assert rows(before) == rows(after), 'Unexpected data change: '+table
for table in added:
    assert after.execute('SELECT count(*) FROM '+table).fetchone()[0] == 0
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('VERIFIED_OLD_TABLES=113\nNEW_EMPTY_TABLES=3\nEXISTING_DATA_UNCHANGED=ok')
