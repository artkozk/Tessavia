"""Verify additive group settings migration against an isolated same-server backup."""
import json
import sqlite3
import sys
before, after = [sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
before.row_factory=after.row_factory=sqlite3.Row
def tables(db):
    return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(after)==tables(before)|{'chat_group_settings','chat_group_roles'}
def rows(db,table,columns):
    selection=','.join('"'+column.replace('"','""')+'"' for column in columns)
    return sorted(json.dumps(dict(row),sort_keys=True,ensure_ascii=False) for row in db.execute('SELECT '+selection+' FROM "'+table.replace('"','""')+'"'))
for table in tables(before):
    columns=[row['name'] for row in before.execute('PRAGMA table_info("'+table+'")')]
    if table=='schema_migrations':
        old={row[0] for row in before.execute('SELECT version FROM schema_migrations')}
        new={row[0] for row in after.execute('SELECT version FROM schema_migrations')}
        assert new==old|{'058_chat_group_lifecycle.sql'}
        continue
    assert rows(before,table,columns)==rows(after,table,columns),'Changed existing data in '+table
expected_settings=sorted((row[0],1) for row in before.execute("SELECT id FROM chat_threads WHERE conversation_kind='group'"))
assert expected_settings==sorted(tuple(row) for row in after.execute('SELECT thread_id,version FROM chat_group_settings'))
expected_roles=sorted(tuple(row) for row in before.execute("SELECT t.id,t.created_by,'owner' FROM chat_threads t JOIN chat_members m ON m.thread_id=t.id AND m.user_id=t.created_by WHERE t.conversation_kind='group'"))
assert expected_roles==sorted(tuple(row) for row in after.execute('SELECT thread_id,user_id,role FROM chat_group_roles'))
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('PRESERVED_TABLES='+str(len(tables(before))))
print('GROUP_MIGRATION=ok; seeded groups='+str(len(expected_settings)))
