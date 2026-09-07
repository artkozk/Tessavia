"""Compare migration against the same-server backup, allowing only the precisely specified legacy completion recovery."""
import json,sqlite3,sys,datetime
before,after=[sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
before.row_factory=after.row_factory=sqlite3.Row
def tables(db):return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(before)==tables(after)
assert after.execute("SELECT count(*) FROM schema_migrations WHERE version='063_task_completion_review.sql'").fetchone()[0]==1
changed={r['id']:dict(r) for r in before.execute("SELECT * FROM records r WHERE r.type='task' AND r.status='review' AND r.progress=100 AND (SELECT action FROM task_review_events WHERE record_id=r.id ORDER BY created_at DESC,rowid DESC LIMIT 1)='submitted'")}
for table in tables(before):
 columns=[r['name'] for r in before.execute('PRAGMA table_info("'+table+'")')]
 if table=='records':
  original={r['id']:dict(r) for r in before.execute('SELECT * FROM records')}
  updated={r['id']:dict(r) for r in after.execute('SELECT * FROM records')}
  assert original.keys()==updated.keys()
  for key,row in original.items():
   target=updated[key]
   assert target.pop('review_pending')==int(key in changed)
   if key in changed:
    submitted=before.execute('SELECT created_at FROM task_review_events WHERE record_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',(key,)).fetchone()[0]
    row['status']='completed';row['completed_at']=row['completed_at'] or submitted
    done=before.execute("SELECT id FROM collection_stages WHERE collection_id=? AND category='done' AND archived_at IS NULL ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,sort_order,id LIMIT 1",(row['collection_id'],row['stage_id'])).fetchone()
    if done:row['stage_id']=done[0]
    assert datetime.datetime.fromisoformat(target['updated_at'].replace('Z','+00:00'))>=datetime.datetime.fromisoformat(row['updated_at'].replace('Z','+00:00'))
    row['updated_at']=target['updated_at']
   assert row==target,'Unexpected record change '+key
 else:
  selection=','.join('"'+c.replace('"','""')+'"' for c in columns)
  def rows(db):return sorted(json.dumps(dict(r),sort_keys=True,ensure_ascii=False) for r in db.execute('SELECT '+selection+' FROM "'+table+'"') if table!='schema_migrations' or r['version']!='063_task_completion_review.sql')
  assert rows(before)==rows(after),'Unexpected data change '+table
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('VERIFIED_TABLES='+str(len(tables(before))))
print('RECOVERED_LEGACY_TASKS='+str(len(changed)))
print('OTHER_DATA_UNCHANGED=ok')
