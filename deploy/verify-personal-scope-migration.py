"""Independently derive allowed additions; never print private preferences or rows."""
import copy, json, sqlite3, sys
before,after=[sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
before.row_factory=after.row_factory=sqlite3.Row
tables=lambda db:{r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(before)==tables(after)
def rows(db,table):
    return [dict(r) for r in db.execute('SELECT * FROM "'+table.replace('"','""')+'"')]
def stable(values):return sorted(json.dumps(r,sort_keys=True,ensure_ascii=False) for r in values)
for table in tables(before)-{'schema_migrations','user_interface_preferences'}:
    assert stable(rows(before,table))==stable(rows(after,table)), 'Unexpected table change: '+table
previous=rows(before,'schema_migrations');current=rows(after,'schema_migrations')
assert set(stable(previous)).issubset(set(stable(current)))
assert {r['version'] for r in current}-{r['version'] for r in previous}=={'044_personal_page_scope.sql'}

workspaces={r['id']:r for r in rows(before,'workspaces')}
members={(r['workspace_id'],r['user_id']):r['status'] for r in rows(before,'workspace_members')}
teams={r['id']:r for r in rows(before,'teams')}
team_members={(r['team_id'],r['user_id']):r['status'] for r in rows(before,'team_members')}
def accessible(w,user):
    if w['archived_at'] is not None or members.get((w['id'],user))!='active':return False
    team=w['team_id']
    return team is None or team in teams and teams[team]['deleted_at'] is None and team_members.get((team,user))=='active'
owners={}
for w in sorted(workspaces.values(),key=lambda w:(w['created_at'],w['id'])):
    if w['kind']=='personal' and accessible(w,w['owner_id']):owners.setdefault(w['owner_id'],w['id'])
old={(r['user_id'],r['workspace_id']):r for r in rows(before,'user_interface_preferences')}
new={(r['user_id'],r['workspace_id']):r for r in rows(after,'user_interface_preferences')}
sources={}
for (user,workspace),row in old.items():
    w=workspaces[workspace]
    if user not in owners or w['kind']!='team' or not accessible(w,user):continue
    for device in ['desktop','mobile']:
        profile=json.loads(row['mobile_preferences_json'] or '{}') if device=='mobile' else {'layout':json.loads(row['layout_json'])}
        stamp=profile.get('updatedAt') or row['updated_at']
        for key,value in (profile.get('layout',{}).get('pages') or {}).items():
            if key not in ['personal','calendar:personal','day:personal'] or not isinstance(value,dict):continue
            identity=(user,device,key)
            candidate=(stamp,workspace,value)
            if identity not in sources or candidate[:2]>sources[identity][:2]:sources[identity]=candidate
expected=copy.deepcopy(old);changed=set();mobile_changed=set()
defaults={r['name']:before.execute('SELECT '+r['dflt_value']).fetchone()[0] if r['dflt_value'] is not None else None for r in before.execute('PRAGMA table_info(user_interface_preferences)')}
for (user,device,key),(_,_,page) in sources.items():
    identity=(user,owners[user]);row=expected.get(identity)
    if row is None:row=dict(defaults,user_id=user,workspace_id=owners[user]);expected[identity]=row
    field='layout_json' if device=='desktop' else 'mobile_preferences_json'
    profile=json.loads(row[field] or '{}');layout=profile if device=='desktop' else profile.setdefault('layout',{})
    if layout.get('pages') is None:layout['pages']={}
    if key in layout['pages']:continue
    layout['pages'][key]=page;row[field]=json.dumps(profile);changed.add(identity)
    if device=='mobile':mobile_changed.add(identity)
assert new.keys()==expected.keys(), 'Unexpected preference row created or removed'
for identity,wanted in expected.items():
    actual=copy.deepcopy(new[identity]);wanted=copy.deepcopy(wanted)
    if identity not in changed:
        assert actual==wanted,'Unrelated preference changed';continue
    assert actual['updated_at'] and actual['updated_at']!=old.get(identity,{}).get('updated_at')
    actual.pop('updated_at');wanted.pop('updated_at')
    for field in ['layout_json','mobile_preferences_json']:
        a=json.loads(actual.pop(field) or '{}');b=json.loads(wanted.pop(field) or '{}')
        if field=='mobile_preferences_json' and identity in mobile_changed:
            assert a.get('updatedAt');a.pop('updatedAt',None);b.pop('updatedAt',None)
        assert a==b,'Unexpected page/profile change'
    assert actual==wanted,'Unexpected navigation preference change'
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('EXISTING_TABLES_VERIFIED='+str(len(tables(before))))
print('PERSONAL_PROFILES_IMPORTED='+str(len(changed)))
print('MIGRATION_044=ok')
