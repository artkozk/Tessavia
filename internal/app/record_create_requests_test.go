package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func TestRecordCreateIntentConcurrentReplayAndIsolation(t *testing.T) {
	f := newLifecycleFixture(t)
	type response struct {
		status int
		record Record
		err    error
		raw    string
	}
	call := func(role, workspace, key string, body any) response {
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", f.url+"/api/records", bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Workspace-ID", workspace)
		req.Header.Set("Idempotency-Key", key)
		res, err := f.clients[role].Do(req)
		if err != nil {
			return response{err: err}
		}
		defer res.Body.Close()
		data, err := io.ReadAll(res.Body)
		var record Record
		json.Unmarshal(data, &record)
		return response{status: res.StatusCode, record: record, err: err, raw: string(data)}
	}
	body := map[string]any{"type": "task", "title": "One intent", "description": "Preserve once"}
	results := make(chan response, 2)
	for i := 0; i < 2; i++ {
		go func() { results <- call("owner", f.project.ID, "concurrent-intent-0001", body) }()
	}
	a, b := <-results, <-results
	if a.err != nil || b.err != nil || !((a.status == 201 && b.status == 200) || (a.status == 200 && b.status == 201)) || a.record.ID == "" || a.record.ID != b.record.ID {
		t.Fatalf("concurrent: %+v %+v", a, b)
	}
	// Simulate a lost successful response: resubmitting returns the same object, without another activity.
	again := call("owner", f.project.ID, "concurrent-intent-0001", body)
	if again.status != 200 || again.record.ID != a.record.ID {
		t.Fatal(again)
	}
	var count int
	if err := f.store.db.QueryRow("SELECT count(*) FROM records WHERE workspace_id=? AND title='One intent'", f.project.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("duplicate record", count)
	}
	if err := f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='created'", a.record.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("duplicate creation activity", count)
	}
	changed := map[string]any{"type": "task", "title": "Changed intent"}
	if got := call("owner", f.project.ID, "concurrent-intent-0001", changed); got.status != 409 {
		t.Fatal(got)
	}
	member := call("member", f.project.ID, "concurrent-intent-0001", body)
	if member.status != 201 || member.record.ID == a.record.ID {
		t.Fatal("another user received original", member)
	}
	var other Workspace
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Separate intent scope"}, 201, &other)
	isolated := call("owner", other.ID, "concurrent-intent-0001", body)
	if isolated.status != 201 || isolated.record.ID == a.record.ID {
		t.Fatal("workspace key leaked", isolated)
	}
	if got := call("member", other.ID, "concurrent-intent-0001", body); got.status != 403 {
		t.Fatal(got)
	}
	// A failure after the receipt claim rolls back the claim as well as the record.
	invalid := map[string]any{"type": "task", "title": "Fix after validation", "kind": "invalid-kind"}
	if got := call("owner", f.project.ID, "rollback-intent-0001", invalid); got.status != 400 {
		t.Fatal(got)
	}
	if got := call("owner", f.project.ID, "rollback-intent-0001", body); got.status != 201 {
		t.Fatal("failed claim survived", got)
	}
	if got := call("owner", f.project.ID, "bad", body); got.status != 400 {
		t.Fatal(got)
	}
}
