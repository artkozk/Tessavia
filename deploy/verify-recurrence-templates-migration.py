"""Verify recurrence template migration against an isolated same-server backup."""
import json
import sqlite3
import sys
before,after=[sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
before.row_factory=after.row_factory=sqlite3.Row
def tables(db):return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(after)==tables(before)|{'personal_recurrence_templates','personal_recurrence_instances'}
def rows(db,table,columns):
    selection=','.join('"'+column.replace('"','""')+'"' for column in columns)
    return sorted(json.dumps(dict(row),sort_keys=True,ensure_ascii=False) for row in db.execute('SELECT '+selection+' FROM "'+table.replace('"','""')+'"'))
for table in tables(before):
    columns=[row['name'] for row in before.execute('PRAGMA table_info("'+table+'")')]
    if table=='schema_migrations':
        old={row[0] for row in before.execute('SELECT version FROM schema_migrations')};new={row[0] for row in after.execute('SELECT version FROM schema_migrations')}
        assert new==old|{'059_personal_recurrence_templates.sql'}
        continue
    assert rows(before,table,columns)==rows(after,table,columns),'Changed existing data in '+table
expected=sorted(tuple(row) for row in before.execute("SELECT p.id,p.series_id,p.owner_id,p.occurrence_date FROM personal_plans p JOIN personal_recurrence_rules r ON r.series_id=p.series_id AND r.owner_id=p.owner_id WHERE p.series_id<>'' AND p.occurrence_date<>''"))
actual=sorted(tuple(row) for row in after.execute('SELECT plan_id,series_id,owner_id,scheduled_date FROM personal_recurrence_instances'))
assert actual==expected
count=0
mapping={'title':'title','notes':'notes','dueAt':'due_at','startDate':'start_date','endDate':'end_date','colorKey':'color_key','itemKind':'item_kind','projectId':'project_id','goalId':'goal_id','parentId':'parent_id','plannedMinutes':'planned_minutes','startsAt':'starts_at','endsAt':'ends_at'}
for rule in before.execute('SELECT * FROM personal_recurrence_rules'):
    source=before.execute("SELECT * FROM personal_plans WHERE owner_id=? AND series_id=? ORDER BY CASE WHEN id=series_id THEN 0 ELSE 1 END,created_at,id LIMIT 1",(rule['owner_id'],rule['series_id'])).fetchone()
    if source is None:continue
    stored=after.execute('SELECT * FROM personal_recurrence_templates WHERE series_id=?',(rule['series_id'],)).fetchone()
    assert stored and stored['owner_id']==rule['owner_id'] and stored['needs_review']==1 and stored['updated_at']==rule['updated_at']
    body=json.loads(stored['plan_json'])
    for key,column in mapping.items():
        value=source[column]
        if key in ['projectId','goalId','parentId']:value=value or ''
        assert body[key]==value
    assert body['titleGenerated']==bool(source['title_generated'])
    assert body['occurrenceDate']==(source['occurrence_date'] or rule['start_date'])
    count+=1
assert after.execute('SELECT COUNT(*) FROM personal_recurrence_templates').fetchone()[0]==count
index=after.execute("SELECT \"unique\" FROM pragma_index_list('personal_plans') WHERE name='personal_plans_series_occurrence_idx'").fetchone()
assert index and index[0]==0
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('PRESERVED_TABLES='+str(len(tables(before))))
print('RECURRENCE_TEMPLATE_MIGRATION=ok; templates='+str(count)+'; instances='+str(len(actual)))
