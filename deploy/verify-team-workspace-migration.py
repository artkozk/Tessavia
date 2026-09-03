"""Compare the dry migration with an independent projection of the old data."""
import collections
import json
import sqlite3
import sys

before, after = [sqlite3.connect('file:' + p + '?mode=ro', uri=True) for p in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row
tables = lambda db: {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(before) == tables(after)
read = lambda db, table: [dict(r) for r in db.execute('SELECT * FROM "' + table.replace('"', '""') + '"')]
canonical = lambda rows: sorted(json.dumps(row, sort_keys=True, ensure_ascii=False) for row in rows)
workspaces = read(before, 'workspaces')
teams = {r['id']: r for r in read(before, 'teams')}
groups = collections.defaultdict(list)
for workspace in workspaces:
    if workspace['kind'] == 'team' and workspace['team_id']:
        groups[workspace['team_id']].append(workspace)
splits = {}
for team_id, group in groups.items():
    ordered = sorted(group, key=lambda w: (team_id != 'team-' + w['id'], w['created_at'], w['id']))
    for workspace in ordered[1:]:
        splits[workspace['id']] = (team_id, 'team-space-' + workspace['id'])
sources = {source for source, target in splits.values()}
workspace_members = read(before, 'workspace_members')

for table in tables(before):
    expected, actual = read(before, table), read(after, table)
    if table == 'schema_migrations':
        assert not any(r['version'] == '036_one_team_per_workspace.sql' for r in expected)
        assert sum(r['version'] == '036_one_team_per_workspace.sql' for r in actual) == 1
        actual = [r for r in actual if r['version'] != '036_one_team_per_workspace.sql']
    elif table == 'workspaces':
        for row in expected:
            if row['id'] in splits:
                row['team_id'] = splits[row['id']][1]
    elif table == 'teams':
        for workspace in workspaces:
            if workspace['id'] not in splits:
                continue
            source, target = splits[workspace['id']]
            expected.append(dict(id=target, name=workspace['name'], slug='team-space-' + workspace['slug'],
                                 description=workspace['description'], owner_id=workspace['owner_id'],
                                 created_at=workspace['created_at'], updated_at=workspace['updated_at'],
                                 deleted_at=teams[source]['deleted_at']))
    elif table == 'team_members':
        for row in expected:
            if row['team_id'] not in sources or row['status'] != 'active':
                continue
            remaining = [w['id'] for w in workspaces if w['team_id'] == row['team_id'] and w['id'] not in splits and w['kind'] == 'team']
            access = [m for m in workspace_members if m['workspace_id'] in remaining and m['user_id'] == row['user_id'] and m['status'] == 'active']
            if not access:
                row['status'] = 'suspended'
            else:
                row['role'] = 'owner' if teams[row['team_id']]['owner_id'] == row['user_id'] else 'admin' if any(m['role'] == 'admin' for m in access) else 'member'
        for workspace in workspaces:
            if workspace['id'] not in splits:
                continue
            target = splits[workspace['id']][1]
            members = [m for m in workspace_members if m['workspace_id'] == workspace['id']]
            for member in members:
                expected.append(dict(team_id=target, user_id=member['user_id'],
                                     role='owner' if member['user_id'] == workspace['owner_id'] else 'admin' if member['role'] == 'admin' else 'member',
                                     status='active' if member['status'] == 'active' else 'suspended', joined_at=member['joined_at']))
            if not any(m['user_id'] == workspace['owner_id'] for m in members):
                expected.append(dict(team_id=target, user_id=workspace['owner_id'], role='owner', status='active', joined_at=workspace['created_at']))
    elif table == 'workspace_invitations':
        newly_revoked = {r['id'] for r in expected if r['team_id'] in sources and r['revoked_at'] is None}
        for rows in (expected, actual):
            for row in rows:
                if row['id'] in newly_revoked:
                    if rows is actual:
                        assert row['revoked_at'], 'invitation not revoked'
                    row['revoked_at'] = '<migration-time>'
    elif table == 'team_activity':
        new_events = [r for r in actual if r['id'] not in {old['id'] for old in expected}]
        assert {r['id'] for r in new_events} == {'workspace-team-split-' + workspace for workspace in splits}
        for event in new_events:
            workspace_id = event['id'].removeprefix('workspace-team-split-')
            source, target = splits[workspace_id]
            workspace = next(w for w in workspaces if w['id'] == workspace_id)
            assert event['team_id'] == target and event['actor_id'] == workspace['owner_id']
            assert event['action'] == 'team_split' and event['created_at']
            assert json.loads(event['details_json']) == {'sourceTeamId': source, 'workspaceId': workspace_id}
        actual = [r for r in actual if r not in new_events]
    assert canonical(expected) == canonical(actual), table + ': unexpected data changes'

assert not after.execute("SELECT team_id FROM workspaces WHERE kind='team' AND team_id IS NOT NULL GROUP BY team_id HAVING COUNT(*)>1").fetchall()
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
assert {r[0] for r in after.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'one_team_workspace_%'")} == {'one_team_workspace_insert', 'one_team_workspace_update'}
print('DATA_PRESERVATION=ok; independent teams created=' + str(len(splits)))
