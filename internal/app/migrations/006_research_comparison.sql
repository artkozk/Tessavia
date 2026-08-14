CREATE TABLE research_option_fields (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id),
    name TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text' CHECK(field_type IN ('text', 'number', 'url', 'rating')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_research_option_fields_record ON research_option_fields(record_id, active, sort_order);

CREATE TABLE research_options (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id),
    title TEXT NOT NULL,
    summary_md TEXT NOT NULL DEFAULT '',
    pros_md TEXT NOT NULL DEFAULT '',
    cons_md TEXT NOT NULL DEFAULT '',
    notes_md TEXT NOT NULL DEFAULT '',
    rating REAL NOT NULL DEFAULT 0 CHECK(rating >= 0 AND rating <= 10),
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
    created_by INTEGER NOT NULL REFERENCES users(id),
    updated_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_research_options_record ON research_options(record_id, status, sort_order);

CREATE TABLE research_option_values (
    option_id TEXT NOT NULL REFERENCES research_options(id),
    field_id TEXT NOT NULL REFERENCES research_option_fields(id),
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY(option_id, field_id)
);

CREATE INDEX idx_research_option_values_field ON research_option_values(field_id);
