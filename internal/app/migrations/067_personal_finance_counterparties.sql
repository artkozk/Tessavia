-- User-created private counterparties. Historical payer text stays untouched;
-- matching names are never linked automatically or merged across accounts.
CREATE TABLE personal_finance_counterparties (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(owner_id,id)
);
CREATE INDEX personal_finance_counterparties_owner_name ON personal_finance_counterparties(owner_id,name,id);
ALTER TABLE personal_finance_entries ADD COLUMN payer_id TEXT REFERENCES personal_finance_counterparties(id);
-- SQLite cannot add a composite foreign key with ALTER TABLE. Keep the added
-- column nullable for old rows and enforce owner membership without a rebuild.
CREATE TRIGGER personal_finance_payer_owner_insert
BEFORE INSERT ON personal_finance_entries
WHEN NEW.payer_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM personal_finance_counterparties WHERE id=NEW.payer_id AND owner_id=NEW.owner_id
)
BEGIN
 SELECT RAISE(ABORT, 'personal finance payer owner mismatch');
END;
CREATE TRIGGER personal_finance_payer_owner_update
BEFORE UPDATE OF payer_id,owner_id ON personal_finance_entries
WHEN NEW.payer_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM personal_finance_counterparties WHERE id=NEW.payer_id AND owner_id=NEW.owner_id
)
BEGIN
 SELECT RAISE(ABORT, 'personal finance payer owner mismatch');
END;
