-- Independent team ledgers start empty. Personal tables and rows are untouched.
-- The shared calculation engine maps its fixed table names to this scope.
CREATE TABLE workspace_finance_buckets (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL,
 destination TEXT NOT NULL DEFAULT '',
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,id)
);
CREATE TABLE workspace_finance_sources (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL,
 deduct_workers INTEGER NOT NULL DEFAULT 0 CHECK(deduct_workers IN (0,1)),
 allocations_json TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,id)
);
CREATE TABLE workspace_finance_entries (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
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
 FOREIGN KEY(workspace_id,source_id) REFERENCES workspace_finance_sources(workspace_id,id),
 UNIQUE(workspace_id,id)
);
CREATE INDEX workspace_finance_entries_owner_date ON workspace_finance_entries(workspace_id,date,id);
CREATE TABLE workspace_finance_requests (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 request_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 entry_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,request_id),
 FOREIGN KEY(workspace_id,entry_id) REFERENCES workspace_finance_entries(workspace_id,id)
);

CREATE TABLE workspace_finance_counterparties (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,id)
);
CREATE INDEX workspace_finance_counterparties_owner_name ON workspace_finance_counterparties(workspace_id,name,id);
ALTER TABLE workspace_finance_entries ADD COLUMN payer_id TEXT REFERENCES workspace_finance_counterparties(id);
CREATE TRIGGER workspace_finance_payer_owner_insert
BEFORE INSERT ON workspace_finance_entries
WHEN NEW.payer_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM workspace_finance_counterparties WHERE id=NEW.payer_id AND workspace_id=NEW.workspace_id
)
BEGIN
 SELECT RAISE(ABORT, 'workspace finance payer scope mismatch');
END;
CREATE TRIGGER workspace_finance_payer_owner_update
BEFORE UPDATE OF payer_id,workspace_id ON workspace_finance_entries
WHEN NEW.payer_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM workspace_finance_counterparties WHERE id=NEW.payer_id AND workspace_id=NEW.workspace_id
)
BEGIN
 SELECT RAISE(ABORT, 'workspace finance payer scope mismatch');
END;

CREATE TABLE workspace_finance_expenses (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 bucket_id TEXT NOT NULL,
 bucket_name TEXT NOT NULL,
 date TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0 AND amount_minor <= 1000000000000),
 payee TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 voided INTEGER NOT NULL DEFAULT 0 CHECK(voided IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(workspace_id,bucket_id) REFERENCES workspace_finance_buckets(workspace_id,id),
 UNIQUE(workspace_id,id)
);
CREATE INDEX workspace_finance_expenses_owner_date ON workspace_finance_expenses(workspace_id,date,id);
CREATE TABLE workspace_finance_expense_requests (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 request_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 expense_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,request_id),
 FOREIGN KEY(workspace_id,expense_id) REFERENCES workspace_finance_expenses(workspace_id,id)
);

CREATE TABLE workspace_finance_settings (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
 source_workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 revision INTEGER NOT NULL CHECK(revision > 0),
 updated_by INTEGER NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL
);
