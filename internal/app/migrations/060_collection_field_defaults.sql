CREATE TABLE collection_field_defaults (
    field_id TEXT PRIMARY KEY REFERENCES collection_fields(id) ON DELETE CASCADE,
    value_json TEXT NOT NULL CHECK(json_valid(value_json)),
    updated_at TEXT NOT NULL
);
