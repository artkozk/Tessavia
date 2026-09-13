"""Server-local migration 067+068 verification and fail-closed rollback guard.

Never prints financial values, schema contents or identity data. Expected SQL is
embedded from the reviewed migration files, so even changed trigger bodies or
extra schema objects fail verification. No production DB is modified here.
"""
import json
from pathlib import Path
import sqlite3
import sys
from contextlib import closing


MIGRATIONS = ('067_personal_finance_counterparties.sql', '068_page_app_sheet_values.sql')
NEW_TABLES = {'personal_finance_counterparties', 'page_app_sheet_values'}
MIGRATION_SQL = ("-- User-created private counterparties. Historical payer text stays untouched;\n-- matching names are never linked automatically or merged across accounts.\nCREATE TABLE personal_finance_counterparties (\n id TEXT PRIMARY KEY,\n owner_id INTEGER NOT NULL REFERENCES users(id),\n name TEXT NOT NULL,\n note TEXT NOT NULL DEFAULT '',\n archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),\n revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),\n created_at TEXT NOT NULL,\n updated_at TEXT NOT NULL,\n UNIQUE(owner_id,id)\n);\nCREATE INDEX personal_finance_counterparties_owner_name ON personal_finance_counterparties(owner_id,name,id);\nALTER TABLE personal_finance_entries ADD COLUMN payer_id TEXT REFERENCES personal_finance_counterparties(id);\n-- SQLite cannot add a composite foreign key with ALTER TABLE. Keep the added\n-- column nullable for old rows and enforce owner membership without a rebuild.\nCREATE TRIGGER personal_finance_payer_owner_insert\nBEFORE INSERT ON personal_finance_entries\nWHEN NEW.payer_id IS NOT NULL AND NOT EXISTS (\n SELECT 1 FROM personal_finance_counterparties WHERE id=NEW.payer_id AND owner_id=NEW.owner_id\n)\nBEGIN\n SELECT RAISE(ABORT, 'personal finance payer owner mismatch');\nEND;\nCREATE TRIGGER personal_finance_payer_owner_update\nBEFORE UPDATE OF payer_id,owner_id ON personal_finance_entries\nWHEN NEW.payer_id IS NOT NULL AND NOT EXISTS (\n SELECT 1 FROM personal_finance_counterparties WHERE id=NEW.payer_id AND owner_id=NEW.owner_id\n)\nBEGIN\n SELECT RAISE(ABORT, 'personal finance payer owner mismatch');\nEND;\n", '-- A kit contains the calculation schema only. Inputs belong to one user,\n-- page and block, and are created exclusively by an explicit write.\nCREATE TABLE page_app_sheet_values (\n page_id TEXT NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,\n block_id TEXT NOT NULL,\n user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n values_json TEXT NOT NULL,\n revision INTEGER NOT NULL CHECK(revision > 0),\n updated_at TEXT NOT NULL,\n PRIMARY KEY(page_id,block_id,user_id)\n);\n')


def connect_readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=20)


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def table_names(database):
    return {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def schema_objects(database):
    return {tuple(row) for row in database.execute("SELECT type,name,tbl_name,COALESCE(sql,'') FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}


def table_rows(database, table, columns, exclude_migrations=False):
    query = 'SELECT ' + ','.join(identifier(name) for name in columns) + ' FROM ' + identifier(table)
    params = ()
    if exclude_migrations:
        query += ' WHERE version NOT IN (?,?)'
        params = MIGRATIONS
    return sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False) for row in database.execute(query, params))


def verify(before_path, after_path):
    with closing(connect_readonly(before_path)) as before, closing(connect_readonly(after_path)) as after, closing(sqlite3.connect(':memory:')) as expected:
        before.row_factory = after.row_factory = sqlite3.Row
        tables = table_names(before)
        assert len(tables) == 121, 'Unexpected baseline table count'
        assert not tables & NEW_TABLES, 'New tables already present in baseline'
        assert table_names(after) == tables | NEW_TABLES, 'Unexpected table change'
        assert before.execute("SELECT count(*) FROM schema_migrations WHERE version='066_personal_finance.sql'").fetchone()[0] == 1
        for migration in MIGRATIONS:
            assert before.execute('SELECT count(*) FROM schema_migrations WHERE version=?', (migration,)).fetchone()[0] == 0
            assert after.execute('SELECT count(*) FROM schema_migrations WHERE version=?', (migration,)).fetchone()[0] == 1, 'Missing migration receipt'
        # All data stays in server memory. Replaying the exact reviewed SQL also
        # computes SQLite's ALTER TABLE serialization without loose SQL matching.
        before.backup(expected)
        expected.execute('PRAGMA foreign_keys=ON')
        for sql in MIGRATION_SQL:
            expected.executescript(sql)
        assert schema_objects(after) == schema_objects(expected), 'Unexpected schema change or trigger definition'
        for table in sorted(tables):
            columns = [row[1] for row in before.execute('PRAGMA table_info(' + identifier(table) + ')')]
            assert table_rows(before, table, columns) == table_rows(after, table, columns, table == 'schema_migrations'), 'Existing data changed: ' + table
        assert after.execute('SELECT count(*) FROM personal_finance_entries WHERE payer_id IS NOT NULL').fetchone()[0] == 0, 'Old income linked automatically'
        for table in NEW_TABLES:
            assert after.execute('SELECT count(*) FROM ' + identifier(table)).fetchone()[0] == 0, 'New data seeded'
        assert before.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not after.execute('PRAGMA foreign_key_check').fetchall()
    print('VERIFIED_OLD_TABLES=121\nTOTAL_TABLES=123\nOLD_DATA_UNCHANGED=ok\nEXACT_SCHEMA_067_068=ok\nMIGRATIONS_067_068=ok\nNEW_TABLES_EMPTY=ok\nOLD_PAYER_IDS_NULL=ok')


def rollback_safe(path):
    with closing(connect_readonly(path)) as db:
        tables = table_names(db)
        for table in NEW_TABLES:
            if table in tables and db.execute('SELECT count(*) FROM ' + identifier(table)).fetchone()[0]:
                raise ValueError('new feature data exists')
        columns = {row[1] for row in db.execute('PRAGMA table_info(personal_finance_entries)')}
        if 'payer_id' in columns and db.execute('SELECT count(*) FROM personal_finance_entries WHERE payer_id IS NOT NULL').fetchone()[0]:
            raise ValueError('linked payer data exists')
        for table in ('page_app_definitions', 'page_app_templates'):
            for (raw,) in db.execute('SELECT definition_json FROM ' + identifier(table)):
                definition = json.loads(raw)
                if not isinstance(definition, dict) or not isinstance(definition.get('blocks'), list):
                    raise ValueError('unrecognized definition')
                for block in definition['blocks']:
                    if not isinstance(block, dict) or 'sheet' in block or block.get('kind') == 'sheet':
                        raise ValueError('new sheet schema exists')
                    styles = block.get('elementStyles') or {}
                    if not isinstance(styles, dict) or any(key.split(':', 1)[0] in ('sheetLabel', 'sheetValue', 'sheetUnit') for key in styles):
                        raise ValueError('new sheet styles exist')
    print('ROLLBACK_SAFE=no_new_feature_usage')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--rollback-safe':
        try:
            rollback_safe(sys.argv[2])
        except Exception:
            # Do not print malformed schema or any personal contents on failure.
            print('ROLLBACK_BLOCKED=new_feature_usage_or_unverifiable_state', file=sys.stderr)
            raise SystemExit(3)
    elif len(sys.argv) == 3:
        verify(*sys.argv[1:])
    else:
        raise SystemExit('Usage: verify-finance-flexibility-migration.py BEFORE AFTER | --rollback-safe DB')
