"""Verify the additive personal-finance migration on server-local DB copies.

All 117 existing tables, rows, columns and schema objects must remain unchanged,
apart from the single migration receipt. The four isolated new finance tables
must be empty. Only aggregate results are printed; user data never leaves the
production host. The same verification also follows the previous binary's
trial startup against the migrated copy to check rollback compatibility.
"""
import json
import sqlite3
import sys
from contextlib import closing


MIGRATION = '066_personal_finance.sql'
NEW_TABLES = {
    'personal_finance_buckets',
    'personal_finance_sources',
    'personal_finance_entries',
    'personal_finance_requests',
}
NEW_OBJECTS = {
    *(('table', name, name) for name in NEW_TABLES),
    ('index', 'personal_finance_entries_owner_date', 'personal_finance_entries'),
}


def table_names(database):
    return {
        row[0]
        for row in database.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def schema_objects(database):
    return {
        tuple(row)
        for row in database.execute(
            "SELECT type,name,tbl_name,COALESCE(sql,'') FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%'"
        )
    }


def table_rows(database, table, exclude_new_migration=False):
    query = 'SELECT * FROM ' + identifier(table)
    parameters = ()
    if exclude_new_migration:
        assert table == 'schema_migrations'
        query += ' WHERE version <> ?'
        parameters = (MIGRATION,)
    return sorted(
        json.dumps(dict(row), sort_keys=True, ensure_ascii=False)
        for row in database.execute(query, parameters)
    )


def verify(before_path, after_path):
    with closing(sqlite3.connect('file:' + before_path + '?mode=ro', uri=True)) as before:
        with closing(sqlite3.connect('file:' + after_path + '?mode=ro', uri=True)) as after:
            before.row_factory = after.row_factory = sqlite3.Row
            tables = table_names(before)
            assert len(tables) == 117, 'Unexpected baseline table count'
            assert not tables & NEW_TABLES, 'Finance tables already present in baseline'
            assert table_names(after) == tables | NEW_TABLES, 'Unexpected table change'
            old_schema = schema_objects(before)
            new_schema = schema_objects(after)
            assert old_schema <= new_schema, 'Existing schema object changed or removed'
            assert {row[:3] for row in new_schema - old_schema} == NEW_OBJECTS, 'Unexpected added schema object'
            assert before.execute(
                'SELECT COUNT(*) FROM schema_migrations WHERE version=?', (MIGRATION,)
            ).fetchone()[0] == 0, 'Migration already present in baseline'
            assert after.execute(
                'SELECT COUNT(*) FROM schema_migrations WHERE version=?', (MIGRATION,)
            ).fetchone()[0] == 1, 'Missing finance migration receipt'
            for table in sorted(tables):
                pragma = 'PRAGMA table_info(' + identifier(table) + ')'
                assert list(before.execute(pragma)) == list(after.execute(pragma)), 'Existing columns changed: ' + table
                assert table_rows(before, table) == table_rows(
                    after, table, exclude_new_migration=table == 'schema_migrations'
                ), 'Unexpected existing data change: ' + table
            for table in sorted(NEW_TABLES):
                assert after.execute(
                    'SELECT COUNT(*) FROM ' + identifier(table)
                ).fetchone()[0] == 0, 'Unexpected seeded financial data'
            assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not after.execute('PRAGMA foreign_key_check').fetchall()
    print(
        'VERIFIED_OLD_TABLES=117\n'
        'TOTAL_TABLES=121\n'
        'OLD_SCHEMA_UNCHANGED=ok\n'
        'OLD_DATA_UNCHANGED=ok\n'
        'MIGRATION_066=ok\n'
        'NEW_FINANCE_TABLES_EMPTY=ok'
    )


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: verify-personal-finance-migration.py BEFORE AFTER')
    verify(*sys.argv[1:])
