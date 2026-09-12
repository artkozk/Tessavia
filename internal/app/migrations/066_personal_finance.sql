-- Private finance never uses workspace records, shared activity or notifications.
-- Existing accounts remain empty; distribution rules are configured by each owner.
CREATE TABLE personal_finance_buckets (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 destination TEXT NOT NULL DEFAULT '',
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(owner_id,id)
);
CREATE TABLE personal_finance_sources (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 deduct_workers INTEGER NOT NULL DEFAULT 0 CHECK(deduct_workers IN (0,1)),
 allocations_json TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(owner_id,id)
);
CREATE TABLE personal_finance_entries (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 source_id TEXT NOT NULL,
 source_name TEXT NOT NULL,
 deduct_workers INTEGER NOT NULL CHECK(deduct_workers IN (0,1)),
 date TEXT NOT NULL,
 payer TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 gross_minor INTEGER NOT NULL CHECK(gross_minor > 0 AND gross_minor <= 1000000000000),
 worker_minor INTEGER NOT NULL CHECK(worker_minor >= 0 AND worker_minor <= gross_minor),
 base_minor INTEGER NOT NULL CHECK(base_minor = gross_minor-worker_minor),
 allocations_json TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 voided INTEGER NOT NULL DEFAULT 0 CHECK(voided IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(owner_id,source_id) REFERENCES personal_finance_sources(owner_id,id),
 UNIQUE(owner_id,id)
);
CREATE INDEX personal_finance_entries_owner_date ON personal_finance_entries(owner_id,date,id);
CREATE TABLE personal_finance_requests (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 entry_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id),
 FOREIGN KEY(owner_id,entry_id) REFERENCES personal_finance_entries(owner_id,id)
);
