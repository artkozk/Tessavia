"""Verify the frontend-only unified settings release preserves all production schemas and rows.

Run on the production host with the server-local backup and dry-run copy. No
production data is exported; the only output is the aggregate verification.
"""
import json
import sqlite3
import sys
from contextlib import closing


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
    return sorted(
        tuple(row)
        for row in database.execute(
            "SELECT type,name,tbl_name,COALESCE(sql,'') FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
        )
    )


def table_rows(database, table):
    return sorted(
        json.dumps(dict(row), sort_keys=True, ensure_ascii=False)
        for row in database.execute("SELECT * FROM " + identifier(table))
    )


def verify(before_path, after_path):
    with closing(sqlite3.connect("file:" + before_path + "?mode=ro", uri=True)) as before:
        with closing(sqlite3.connect("file:" + after_path + "?mode=ro", uri=True)) as after:
            before.row_factory = after.row_factory = sqlite3.Row
            tables = table_names(before)
            assert len(tables) == 117, "Unexpected baseline table count"
            assert tables == table_names(after), "Unexpected table change"
            assert schema_objects(before) == schema_objects(after), "Unexpected schema object change"
            for table in sorted(tables):
                pragma = "PRAGMA table_info(" + identifier(table) + ")"
                assert list(before.execute(pragma)) == list(after.execute(pragma)), table
                assert table_rows(before, table) == table_rows(after, table), "Unexpected data change: " + table
            assert after.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert not after.execute("PRAGMA foreign_key_check").fetchall()
    print("VERIFIED_TABLES=117\nSCHEMA_UNCHANGED=ok\nOLD_DATA_UNCHANGED=ok")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: verify-settings-hub-migration.py BEFORE AFTER")
    verify(*sys.argv[1:])
