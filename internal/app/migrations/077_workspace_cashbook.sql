-- Simple team receipts extend the existing ledger without rewriting history.
-- Historical entries remain unclassified; names never determine their kind.
CREATE TABLE workspace_finance_receipts (
 workspace_id TEXT NOT NULL,
 entry_id TEXT NOT NULL,
 receipt_kind TEXT NOT NULL CHECK(receipt_kind IN ('contribution','revenue','other')),
 PRIMARY KEY(workspace_id,entry_id),
 FOREIGN KEY(workspace_id,entry_id) REFERENCES workspace_finance_entries(workspace_id,id)
);

-- Sources created for direct receipts are separate from user-defined rules.
CREATE TABLE workspace_finance_cashbook_sources (
 workspace_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 receipt_kind TEXT NOT NULL CHECK(receipt_kind IN ('contribution','revenue','other')),
 bucket_id TEXT NOT NULL,
 PRIMARY KEY(workspace_id,source_id),
 FOREIGN KEY(workspace_id,source_id) REFERENCES workspace_finance_sources(workspace_id,id),
 FOREIGN KEY(workspace_id,bucket_id) REFERENCES workspace_finance_buckets(workspace_id,id)
);
