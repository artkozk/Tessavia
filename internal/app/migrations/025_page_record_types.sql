ALTER TABLE workspace_pages ADD COLUMN record_types_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(record_types_json) AND json_type(record_types_json) = 'array');

UPDATE workspace_pages SET record_types_json = json_array(record_type) WHERE record_type <> '';
