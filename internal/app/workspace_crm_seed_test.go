package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestFirstClientCRMSeedIsIdempotent(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "crm-seed.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	if _, err = store.db.Exec(`INSERT INTO users(email, username, password_hash, created_at, updated_at) VALUES
		('owner@example.test', 'artkozk', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
		('partner@example.test', 'sweetybboy', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`); err != nil {
		t.Fatalf("seed users: %v", err)
	}
	seed, err := os.ReadFile(filepath.Join("..", "..", "deploy", "seed-first-client-crm-20260901.sql"))
	if err != nil {
		t.Fatalf("read CRM seed: %v", err)
	}
	for attempt := 0; attempt < 2; attempt++ {
		if _, err = store.db.Exec(string(seed)); err != nil {
			t.Fatalf("execute CRM seed attempt %d: %v", attempt+1, err)
		}
	}
	var workspaces, members, collections, stages, fields, records, completed int
	queries := []struct {
		query  string
		target *int
	}{
		{`SELECT COUNT(*) FROM workspaces WHERE id = 'crm-first-client'`, &workspaces},
		{`SELECT COUNT(*) FROM workspace_members WHERE workspace_id = 'crm-first-client'`, &members},
		{`SELECT COUNT(*) FROM workspace_collections WHERE id = 'crm-first-board'`, &collections},
		{`SELECT COUNT(*) FROM collection_stages WHERE collection_id = 'crm-first-board'`, &stages},
		{`SELECT COUNT(*) FROM collection_fields WHERE collection_id = 'crm-first-board'`, &fields},
		{`SELECT COUNT(*) FROM records WHERE workspace_id = 'crm-first-client'`, &records},
		{`SELECT COUNT(*) FROM records WHERE workspace_id = 'crm-first-client' AND status = 'completed' AND progress = 100`, &completed},
	}
	for _, item := range queries {
		if err = store.db.QueryRow(item.query).Scan(item.target); err != nil {
			t.Fatalf("verify CRM seed: %v", err)
		}
	}
	if workspaces != 1 || members != 1 || collections != 1 || stages != 4 || fields != 2 || records != 10 || completed != 2 {
		t.Fatalf("seed counts workspaces=%d members=%d collections=%d stages=%d fields=%d records=%d completed=%d", workspaces, members, collections, stages, fields, records, completed)
	}
	rows, err := store.db.Query(`SELECT value_json FROM record_field_values WHERE field_id = 'crm-field-source-number'`)
	if err != nil {
		t.Fatalf("read seeded field values: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		if err = rows.Scan(&raw); err != nil || !json.Valid([]byte(raw)) {
			t.Fatalf("invalid seeded field JSON %q: %v", raw, err)
		}
	}
}
