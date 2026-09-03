"""Verify migration 037 on a server-local copy without disclosing personal facts."""
import json, sqlite3, sys
before,after=[sqlite3.connect('file:'+path+'?mode=ro',uri=True) for path in sys.argv[1:]]
tables=lambda db:{r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert tables(after)-tables(before)=={'personal_habit_rules','personal_habit_pauses','personal_habit_moves'}
assert not tables(before)-tables(after)
quote=lambda value:'"'+value.replace('"','""')+'"'
def projection(db,table,columns):
    return sorted(json.dumps(list(row),ensure_ascii=False,default=lambda b: b.hex()) for row in db.execute('SELECT '+','.join(map(quote,columns))+' FROM '+quote(table)))
for table in tables(before):
    columns=[r[1] for r in before.execute('PRAGMA table_info('+quote(table)+')')]
    old,new=projection(before,table,columns),projection(after,table,columns)
    if table=='schema_migrations':
        assert set(old).issubset(set(new)) and len(new)==len(old)+1
        assert after.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='037_habit_tracker.sql'").fetchone()[0]==1
    else: assert old==new,'Existing data changed in '+table
assert after.execute('SELECT COUNT(*) FROM personal_habit_rules').fetchone()[0]==before.execute('SELECT COUNT(*) FROM personal_habits').fetchone()[0]
assert not after.execute("SELECT id FROM personal_habit_checkins WHERE amount IS NULL OR amount<>value OR result_state<>'measured'").fetchall()
assert not after.execute('SELECT * FROM personal_habit_moves').fetchall()
assert after.execute('SELECT COUNT(*) FROM personal_habit_pauses').fetchone()[0]==before.execute('SELECT COUNT(*) FROM personal_habits WHERE archived_at IS NOT NULL').fetchone()[0]
assert after.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('PRESERVED_EXISTING_TABLES='+str(len(tables(before))))
print('HABIT_MIGRATION=ok')
