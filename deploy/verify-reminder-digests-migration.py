"""Verify migration 054 without printing or modifying private production rows."""
import json
import sqlite3
import sys


before, after = [sqlite3.connect("file:" + path + "?mode=ro", uri=True) for path in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row


def tables(db):
    return {
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def columns(db, table):
    return [row["name"] for row in db.execute('PRAGMA table_info("' + table + '")')]


def rows(db, table, selected=None):
    quote = lambda value: '"' + value.replace('"', '""') + '"'
    projection = ",".join(map(quote, selected)) if selected else "*"
    return sorted(
        json.dumps(dict(row), sort_keys=True, ensure_ascii=False)
        for row in db.execute("SELECT " + projection + " FROM " + quote(table))
    )


before_tables, after_tables = tables(before), tables(after)
assert after_tables - before_tables == {"reminder_digest_sources"}
assert not before_tables - after_tables

added_preferences = {
    "daily_digest_enabled",
    "daily_digest_time",
    "weekly_digest_enabled",
    "weekly_digest_weekday",
    "weekly_digest_time",
}
for table in before_tables - {"schema_migrations"}:
    old_columns = columns(before, table)
    new_columns = columns(after, table)
    if table == "reminder_preferences":
        assert set(new_columns) - set(old_columns) == added_preferences
        assert not set(old_columns) - set(new_columns)
    else:
        assert new_columns == old_columns, "Unexpected schema change: " + table
    assert rows(before, table, old_columns) == rows(after, table, old_columns), "Unexpected data change: " + table

assert after.execute("SELECT COUNT(*) FROM reminder_digest_sources").fetchone()[0] == 0
assert after.execute(
    """SELECT COUNT(*) FROM reminder_preferences
    WHERE daily_digest_enabled<>0 OR daily_digest_time<>'08:00'
       OR weekly_digest_enabled<>0 OR weekly_digest_weekday<>7 OR weekly_digest_time<>'18:00'"""
).fetchone()[0] == 0

previous = {row["version"] for row in before.execute("SELECT * FROM schema_migrations")}
current = {row["version"] for row in after.execute("SELECT * FROM schema_migrations")}
assert set(rows(before, "schema_migrations")).issubset(set(rows(after, "schema_migrations")))
assert current - previous == {"054_reminder_digests.sql"} and not previous - current
assert after.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not after.execute("PRAGMA foreign_key_check").fetchall()
print("EXISTING_TABLES_PRESERVED=" + str(len(before_tables)))
print("EXISTING_REMINDER_ROWS_DEFAULT_OFF=" + str(after.execute("SELECT COUNT(*) FROM reminder_preferences").fetchone()[0]))
print("MIGRATION_054=ok")
