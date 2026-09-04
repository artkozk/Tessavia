"""Compare every existing table across migration 045 without printing private rows."""
import json, sqlite3, sys
before,after=[sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
before.row_factory=after.row_factory=sqlite3.Row
tables=lambda db:{row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(after)-tables(before)=={'deadline_delivery_sources'}
assert not tables(before)-tables(after)
def rows(db,table):
    return sorted(json.dumps(dict(row),sort_keys=True,ensure_ascii=False) for row in db.execute('SELECT * FROM "'+table.replace('"','""')+'"'))
for table in tables(before)-{'schema_migrations'}:
    assert rows(before,table)==rows(after,table),'Unexpected data change in '+table
for table in ['deadline_delivery_sources']:
    assert after.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]==0
previous={row['version'] for row in before.execute('SELECT * FROM schema_migrations')}
assert set(rows(before,'schema_migrations')).issubset(set(rows(after,'schema_migrations')))
current={row['version'] for row in after.execute('SELECT * FROM schema_migrations')}
assert current-previous=={'045_deadline_delivery_sources.sql'} and not previous-current
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('EXISTING_TABLES_PRESERVED='+str(len(tables(before))))
print('MIGRATION_045=ok')
