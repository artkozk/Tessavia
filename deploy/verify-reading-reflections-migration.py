"""Verify that migration 055 only adds the reading-reflection schema."""

import sqlite3
import sys


assert len(sys.argv) == 3, "usage: verifier OLD_DB NEW_DB"
old = sqlite3.connect(sys.argv[1])
new = sqlite3.connect(sys.argv[2])
assert new.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not new.execute("PRAGMA foreign_key_check").fetchall()

preserved = 0
for (table,) in old.execute(
    "SELECT name FROM sqlite_master WHERE type='table' "
    "AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations' ORDER BY name"
):
    quoted = '"' + table.replace('"', '""') + '"'
    assert old.execute("SELECT * FROM " + quoted + " ORDER BY rowid").fetchall() == new.execute(
        "SELECT * FROM " + quoted + " ORDER BY rowid"
    ).fetchall(), table
    preserved += 1

assert new.execute(
    "SELECT 1 FROM schema_migrations WHERE version='055_reading_reflections.sql'"
).fetchone()
for table in ("reading_reflections", "reading_reflection_events"):
    assert new.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] == 0

print("EXISTING_TABLES_PRESERVED=" + str(preserved))
print("MIGRATION_055=ok")
