package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"strconv"
	"testing"
	"time"
)

type outboxHTTPResult struct {
	status int
	data   map[string]any
	err    error
}

func sendOutboxRequest(client *http.Client, method, url string, owner int64, body any) outboxHTTPResult {
	payload, err := json.Marshal(body)
	if err != nil {
		return outboxHTTPResult{err: err}
	}
	req, err := http.NewRequest(method, url, bytes.NewReader(payload))
	if err != nil {
		return outboxHTTPResult{err: err}
	}
	req.Header.Set("Content-Type", "application/json")
	if owner > 0 {
		req.Header.Set("X-Outbox-Owner", strconv.FormatInt(owner, 10))
	}
	response, err := client.Do(req)
	if err != nil {
		return outboxHTTPResult{err: err}
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	result := outboxHTTPResult{status: response.StatusCode, err: err}
	if len(data) > 0 {
		result.err = json.Unmarshal(data, &result.data)
	}
	return result
}

func requestOutboxJSON(t *testing.T, client *http.Client, method, url string, owner int64, body any, expected int) map[string]any {
	t.Helper()
	result := sendOutboxRequest(client, method, url, owner, body)
	if result.err != nil || result.status != expected {
		t.Fatalf("%s %s: got %d %#v %v; want %d", method, url, result.status, result.data, result.err, expected)
	}
	return result.data
}

func TestOfflinePersonalCreateReceipts(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "offline.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, partnerClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "owner@example.test", "offline_owner")
	partner := register(t, partnerClient, server.URL, "partner@example.test", "offline_partner")
	for _, kind := range []string{"note", "plan"} {
		t.Run(kind, func(t *testing.T) {
			field := "body"
			if kind == "plan" {
				field = "notes"
			}
			path := server.URL + "/api/personal/" + kind + "s"
			payload := map[string]any{"requestKey": "offline-request-" + kind, "title": "", field: "Original local text"}
			start, results := make(chan struct{}), make(chan outboxHTTPResult, 2)
			for range 2 {
				go func() { <-start; results <- sendOutboxRequest(ownerClient, "POST", path, owner.ID, payload) }()
			}
			close(start)
			first, second := <-results, <-results
			if first.err != nil || second.err != nil {
				t.Fatal(first.err, second.err)
			}
			statuses := []int{first.status, second.status}
			sort.Ints(statuses)
			if statuses[0] != 200 || statuses[1] != 201 || first.data["id"] != second.data["id"] {
				t.Fatalf("duplicate create: %#v %#v", first, second)
			}
			id := first.data["id"].(string)
			var count int
			if err := store.db.QueryRow(`SELECT COUNT(*) FROM personal_`+kind+`s WHERE owner_id=?`, owner.ID).Scan(&count); err != nil || count != 1 {
				t.Fatal("duplicate rows", count, err)
			}
			edit := map[string]any{"title": "Edited on another device", field: "Newer content", "expectedUpdatedAt": first.data["updatedAt"]}
			if kind == "plan" {
				edit["status"] = "done"
			}
			updated := requestOutboxJSON(t, ownerClient, "PATCH", path+"/"+id, owner.ID, edit, 200)
			replay := requestOutboxJSON(t, ownerClient, "POST", path, owner.ID, payload, 200)
			if replay["id"] != id || replay[field] != "Newer content" || replay["updatedAt"] != updated["updatedAt"] {
				t.Fatal("replay overwrote newer editing", replay)
			}
			if kind == "plan" && (replay["status"] != "done" || replay["completedAt"] == nil) {
				t.Fatal("replay lost completion", replay)
			}
			changed := map[string]any{"requestKey": payload["requestKey"], "title": "Different queued content", field: "Other"}
			requestOutboxJSON(t, ownerClient, "POST", path, owner.ID, changed, 409)
			wrongOwner := requestOutboxJSON(t, partnerClient, "POST", path, owner.ID, payload, 409)
			if wrongOwner["code"] != "outbox_owner_changed" {
				t.Fatal("missing account precondition", wrongOwner)
			}
			peer := requestOutboxJSON(t, partnerClient, "POST", path, partner.ID, payload, 201)
			if peer["id"] == id || peer[field] != "Original local text" {
				t.Fatal("receipt shared between accounts")
			}
			requestOutboxJSON(t, ownerClient, "DELETE", path+"/"+id, owner.ID, nil, 204)
			requestOutboxJSON(t, ownerClient, "POST", path, owner.ID, payload, 409)
		})
	}
	requestOutboxJSON(t, ownerClient, "POST", server.URL+"/api/personal/plans", owner.ID, map[string]any{"requestKey": "offline-request-note", "title": "Other entity kind"}, 409)
	requestOutboxJSON(t, ownerClient, "POST", server.URL+"/api/personal/notes", owner.ID, map[string]any{"title": "No key"}, 400)
	requestOutboxJSON(t, ownerClient, "POST", server.URL+"/api/personal/notes", owner.ID, map[string]any{"title": "Bad key", "requestKey": "short"}, 400)
	failed := map[string]any{"title": "Linked draft", "requestKey": "offline-failed-link", "linkPlanId": "missing"}
	requestOutboxJSON(t, ownerClient, "POST", server.URL+"/api/personal/notes", owner.ID, failed, 404)
	delete(failed, "linkPlanId")
	requestOutboxJSON(t, ownerClient, "POST", server.URL+"/api/personal/notes", owner.ID, failed, 201)
	var receipts int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_create_requests WHERE owner_id=?`, owner.ID).Scan(&receipts)
	if receipts != 3 {
		t.Fatal("failed request reserved a key or duplicated receipt", receipts)
	}
}
