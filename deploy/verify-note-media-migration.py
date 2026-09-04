"""Verify migration 040 on a server-local copy without disclosing personal facts."""
import json, sqlite3, sys
before,after=[sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
tables=lambda db:{r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(after)-tables(before)=={'personal_note_versions','personal_note_attachments'}
assert not tables(before)-tables(after)
quote=lambda value:'"'+value.replace('"','""')+'"'
def projection(db,table,columns):
    return sorted(json.dumps(list(row),ensure_ascii=False,default=lambda b: b.hex()) for row in db.execute('SELECT '+','.join(map(quote,columns))+' FROM '+quote(table)))
for table in tables(before):
    columns=[r[1] for r in before.execute('PRAGMA table_info('+quote(table)+')')]
    old,new=projection(before,table,columns),projection(after,table,columns)
    if table=='schema_migrations':
        assert set(old).issubset(set(new)) and len(new)==len(old)+1
        assert after.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='040_note_media_history.sql'").fetchone()[0]==1
    else: assert old==new,'Existing data changed in '+table
assert after.execute('SELECT COUNT(*) FROM personal_note_attachments').fetchone()[0]==0
fields=['title','body','pinned','scheduled_date','in_inbox','title_generated','folder_id','tags_json','daily_date','archived_at']
old=sorted(json.dumps(list(row),ensure_ascii=False) for row in before.execute('SELECT id,updated_at,'+','.join(fields)+' FROM personal_notes'))
new=sorted(json.dumps(list(row),ensure_ascii=False) for row in after.execute('SELECT note_id,saved_at,'+','.join(fields)+' FROM personal_note_versions'))
assert old==new,'Baseline history must exactly match each existing note'
assert after.execute("SELECT COUNT(*) FROM personal_note_versions WHERE action<>'baseline'").fetchone()[0]==0
assert {r[0] for r in after.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'personal_note_history_%'")}=={'personal_note_history_insert','personal_note_history_update'}
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('PRESERVED_EXISTING_TABLES='+str(len(tables(before))))
print('NOTE_MEDIA_MIGRATION=ok')
