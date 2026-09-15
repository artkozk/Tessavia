-- Optional finance grouping and relationships; no existing rows or amounts change.

CREATE TABLE personal_finance_categories (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(owner_id,id)
);
CREATE INDEX personal_finance_categories_name ON personal_finance_categories(owner_id,name,id);
CREATE TABLE personal_finance_organization (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 operation_kind TEXT NOT NULL CHECK(operation_kind IN ('income','expense')),
 operation_id TEXT NOT NULL,
 category_id TEXT,
 links_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(links_json) AND json_type(links_json)='array' AND json_array_length(links_json)<=10),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,operation_kind,operation_id),
 FOREIGN KEY(owner_id,category_id) REFERENCES personal_finance_categories(owner_id,id)
);
CREATE INDEX personal_finance_organization_category ON personal_finance_organization(owner_id,category_id,operation_kind,operation_id);

CREATE TRIGGER personal_finance_organization_operation_insert
BEFORE INSERT ON personal_finance_organization
WHEN (NEW.operation_kind='income' AND NOT EXISTS(SELECT 1 FROM personal_finance_entries WHERE owner_id=NEW.owner_id AND id=NEW.operation_id))
 OR (NEW.operation_kind='expense' AND NOT EXISTS(SELECT 1 FROM personal_finance_expenses WHERE owner_id=NEW.owner_id AND id=NEW.operation_id))
BEGIN
 SELECT RAISE(ABORT,'finance organization operation scope mismatch');
END;

CREATE TRIGGER personal_finance_organization_operation_update
BEFORE UPDATE ON personal_finance_organization
WHEN (NEW.operation_kind='income' AND NOT EXISTS(SELECT 1 FROM personal_finance_entries WHERE owner_id=NEW.owner_id AND id=NEW.operation_id))
 OR (NEW.operation_kind='expense' AND NOT EXISTS(SELECT 1 FROM personal_finance_expenses WHERE owner_id=NEW.owner_id AND id=NEW.operation_id))
BEGIN
 SELECT RAISE(ABORT,'finance organization operation scope mismatch');
END;

CREATE TABLE workspace_finance_categories (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,id)
);
CREATE INDEX workspace_finance_categories_name ON workspace_finance_categories(workspace_id,name,id);
CREATE TABLE workspace_finance_organization (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 operation_kind TEXT NOT NULL CHECK(operation_kind IN ('income','expense')),
 operation_id TEXT NOT NULL,
 category_id TEXT,
 links_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(links_json) AND json_type(links_json)='array' AND json_array_length(links_json)<=10),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,operation_kind,operation_id),
 FOREIGN KEY(workspace_id,category_id) REFERENCES workspace_finance_categories(workspace_id,id)
);
CREATE INDEX workspace_finance_organization_category ON workspace_finance_organization(workspace_id,category_id,operation_kind,operation_id);

CREATE TRIGGER workspace_finance_organization_operation_insert
BEFORE INSERT ON workspace_finance_organization
WHEN (NEW.operation_kind='income' AND NOT EXISTS(SELECT 1 FROM workspace_finance_entries WHERE workspace_id=NEW.workspace_id AND id=NEW.operation_id))
 OR (NEW.operation_kind='expense' AND NOT EXISTS(SELECT 1 FROM workspace_finance_expenses WHERE workspace_id=NEW.workspace_id AND id=NEW.operation_id))
BEGIN
 SELECT RAISE(ABORT,'finance organization operation scope mismatch');
END;

CREATE TRIGGER workspace_finance_organization_operation_update
BEFORE UPDATE ON workspace_finance_organization
WHEN (NEW.operation_kind='income' AND NOT EXISTS(SELECT 1 FROM workspace_finance_entries WHERE workspace_id=NEW.workspace_id AND id=NEW.operation_id))
 OR (NEW.operation_kind='expense' AND NOT EXISTS(SELECT 1 FROM workspace_finance_expenses WHERE workspace_id=NEW.workspace_id AND id=NEW.operation_id))
BEGIN
 SELECT RAISE(ABORT,'finance organization operation scope mismatch');
END;
