"""Verify migration 052 without printing or modifying private production rows."""
import json, sqlite3, sys

before, after = [sqlite3.connect('file:' + path + '?mode=ro', uri=True) for path in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row
tables = lambda db: {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
new_tables = {'personal_review_choices','personal_review_choice_events'}
assert tables(after) - tables(before) == new_tables
assert not tables(before) - tables(after)

def rows(db, table, columns=None):
    quote = lambda value: '"' + value.replace('"', '""') + '"'
    select = ','.join(map(quote, columns)) if columns else '*'
    return sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False) for row in db.execute('SELECT ' + select + ' FROM ' + quote(table)))

for table in tables(before) - {'schema_migrations'}:
    columns = [row['name'] for row in before.execute('PRAGMA table_info("' + table + '")')]
    assert rows(before, table, columns) == rows(after, table, columns), 'Unexpected data change: ' + table
for table in new_tables:
    assert after.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] == 0

previous = {row['version'] for row in before.execute('SELECT * FROM schema_migrations')}
current = {row['version'] for row in after.execute('SELECT * FROM schema_migrations')}
assert set(rows(before, 'schema_migrations')).issubset(set(rows(after, 'schema_migrations')))
assert current - previous == {'052_personal_weekly_review.sql'} and not previous - current
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('EXISTING_TABLES_PRESERVED=' + str(len(tables(before))))
print('MIGRATION_052=ok')
