"""Verify this release preserves every existing schema and row during the production-host dry run."""
import json,sqlite3,sys
before,after=[sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
before.row_factory=after.row_factory=sqlite3.Row
def tables(db):return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert len(tables(before))==117 and tables(before)==tables(after)
for table in tables(before):
 assert list(before.execute('PRAGMA table_info("'+table+'")'))==list(after.execute('PRAGMA table_info("'+table+'")')),table
 def rows(db):return sorted(json.dumps(dict(r),sort_keys=True,ensure_ascii=False) for r in db.execute('SELECT * FROM "'+table+'"'))
 assert rows(before)==rows(after),'Unexpected data change: '+table
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('VERIFIED_TABLES=117\nOLD_DATA_UNCHANGED=ok')
