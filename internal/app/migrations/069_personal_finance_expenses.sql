-- Spending is distinct from allocation/transfer annotations. Never infer old
-- expenses from paidMinor: a transfer between one's own accounts is not spending.
CREATE TABLE personal_finance_expenses (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
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
 FOREIGN KEY(owner_id,bucket_id) REFERENCES personal_finance_buckets(owner_id,id),
 UNIQUE(owner_id,id)
);
CREATE INDEX personal_finance_expenses_owner_date ON personal_finance_expenses(owner_id,date,id);
CREATE TABLE personal_finance_expense_requests (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 expense_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id),
 FOREIGN KEY(owner_id,expense_id) REFERENCES personal_finance_expenses(owner_id,id)
);
