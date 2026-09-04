"""Verify migration 039 on a server-local copy without disclosing personal facts."""
import json, sqlite3, sys
before,after=[sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
tables=lambda db:{r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(after)-tables(before)=={'personal_note_folders','personal_note_templates'}
assert not tables(before)-tables(after)
quote=lambda value:'"'+value.replace('"','""')+'"'
def projection(db,table,columns):
    return sorted(json.dumps(list(row),ensure_ascii=False,default=lambda b: b.hex()) for row in db.execute('SELECT '+','.join(map(quote,columns))+' FROM '+quote(table)))
for table in tables(before):
    columns=[r[1] for r in before.execute('PRAGMA table_info('+quote(table)+')')]
    old,new=projection(before,table,columns),projection(after,table,columns)
    if table=='schema_migrations':
        assert set(old).issubset(set(new)) and len(new)==len(old)+1
        assert after.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='039_note_organization.sql'").fetchone()[0]==1
    else: assert old==new,'Existing data changed in '+table
for name in ['personal_note_folders','personal_note_templates']:
    assert after.execute('SELECT COUNT(*) FROM '+name).fetchone()[0]==0
assert after.execute("SELECT COUNT(*) FROM personal_notes WHERE folder_id IS NOT NULL OR tags_json<>'[]' OR daily_date<>''").fetchone()[0]==0
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('PRESERVED_EXISTING_TABLES='+str(len(tables(before))))
print('NOTE_ORGANIZATION_MIGRATION=ok')
