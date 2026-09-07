CREATE TABLE personal_calendar_work_blocks (
    owner_id INTEGER NOT NULL REFERENCES users(id),
    record_id TEXT NOT NULL REFERENCES records(id),
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(owner_id, record_id)
);
CREATE TABLE personal_calendar_confirmations (
    owner_id INTEGER NOT NULL REFERENCES users(id),
    fingerprint TEXT NOT NULL,
    confirmed_at TEXT NOT NULL,
    PRIMARY KEY(owner_id, fingerprint)
);
