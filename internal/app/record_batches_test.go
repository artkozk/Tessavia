package app

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestRecordBatchOwnerUndoAndAtomicFailure(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "atomic.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	defer server.Close()
	client, partnerClient := testClient(t), testClient(t)
	owner := register(t, client, server.URL, "atomicbulk@example.test", "atomicbulk")
	partner := register(t, partnerClient, server.URL, "assigneebulk@example.test", "assigneebulk")
	first := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "First"})
	second := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Second"})
	input := recordBatchRequest{ID: "test-atomic-owner-01", Reason: "Assign", Patch: batchPatch{OwnerID: &partner.ID}, Items: []batchSelection{{first.ID, first.UpdatedAt}, {second.ID, second.UpdatedAt}}}
	// Force a storage error after the first record was updated. The transaction
	// must also roll back its activity and notification, with no durable receipt.
	_, err = store.db.Exec(`CREATE TRIGGER fail_second_bulk BEFORE INSERT ON activity WHEN NEW.action='bulk_updated' AND NEW.entity_id='` + second.ID + `' BEGIN SELECT RAISE(ABORT,'test failure'); END`)
	if err != nil {
		t.Fatal(err)
	}
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/apply", input, 500, nil)
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM record_batches`).Scan(&count)
	if count != 0 {
		t.Fatal("failed receipt committed")
	}
	store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE action='bulk_updated'`).Scan(&count)
	if count != 0 {
		t.Fatal("partial history committed")
	}
	var detail struct {
		Record Record `json:"record"`
	}
	requestJSON(t, client, "GET", server.URL+"/api/records/"+first.ID, nil, 200, &detail)
	if detail.Record.OwnerID != owner.ID || detail.Record.UpdatedAt != first.UpdatedAt {
		t.Fatal("partial record committed")
	}
	store.db.Exec(`DROP TRIGGER fail_second_bulk`)
	var receipt recordBatchReceipt
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/apply", input, 200, &receipt)
	if receipt.Items[0].State != "applied" || receipt.Items[1].State != "applied" {
		t.Fatalf("assignment failed %+v", receipt)
	}
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/"+input.ID+"/undo", map[string]any{}, 200, &receipt)
	requestJSON(t, client, "GET", server.URL+"/api/records/"+first.ID, nil, 200, &detail)
	if detail.Record.OwnerID != owner.ID || receipt.Items[0].State != "undone" {
		t.Fatal("owner undo failed")
	}
}

func TestRecordBatchPreviewPartialApplyRetryAndUndo(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "batches.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "bulk@example.test", "bulk")
	task := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Selected"})
	untouched := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Not selected"})
	idea := createRecord(t, client, server.URL, map[string]any{"type": "idea", "title": "Incompatible"})
	priority, status, stream := "high", "in_progress", "platform"
	input := recordBatchRequest{ID: "test-batch-retry-0001", Reason: "Weekly planning", Patch: batchPatch{Priority: &priority, Status: &status, Workstream: &stream}, Items: []batchSelection{{task.ID, task.UpdatedAt}, {idea.ID, idea.UpdatedAt}, {"foreign-id", "old"}}}
	var preview, applied, replayed, undone recordBatchReceipt
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/preview", input, 200, &preview)
	if preview.Items[0].State != "ready" || preview.Items[1].State != "rejected" || preview.Items[2].Title != "" {
		t.Fatalf("bad preview: %+v", preview)
	}
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM record_batches`).Scan(&count)
	if count != 0 {
		t.Fatal("preview persisted")
	}
	var detail struct {
		Record Record `json:"record"`
	}
	requestJSON(t, client, "GET", server.URL+"/api/records/"+task.ID, nil, 200, &detail)
	if detail.Record.UpdatedAt != task.UpdatedAt {
		t.Fatal("preview changed record")
	}
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/apply", input, 200, &applied)
	if applied.Items[0].State != "applied" || applied.Items[1].State != "rejected" {
		t.Fatalf("bad result %+v", applied)
	}
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/apply", input, 200, &replayed)
	if replayed.Items[0].Version != applied.Items[0].Version {
		t.Fatal("retry wrote twice")
	}
	store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE action='bulk_updated'`).Scan(&count)
	if count != 1 {
		t.Fatal("duplicate or missing history")
	}
	requestJSON(t, client, "GET", server.URL+"/api/records/"+untouched.ID, nil, 200, &detail)
	if detail.Record.Priority != untouched.Priority || detail.Record.UpdatedAt != untouched.UpdatedAt {
		t.Fatal("unselected record changed")
	}
	input.Reason = "Changed request"
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/apply", input, 409, nil)
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/"+applied.ID+"/undo", map[string]any{}, 200, &undone)
	if !undone.Undone || undone.Items[0].State != "undone" {
		t.Fatalf("undo failed: %+v", undone)
	}
	requestJSON(t, client, "GET", server.URL+"/api/records/"+task.ID, nil, 200, &detail)
	if batchSnapshot(detail.Record) != batchSnapshot(task) {
		t.Fatal("undo did not restore all fields")
	}
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/"+applied.ID+"/undo", map[string]any{}, 200, &replayed)
	if replayed.Items[0].Version != undone.Items[0].Version {
		t.Fatal("undo repeated")
	}
	requestJSON(t, client, "GET", server.URL+"/api/record-batches/latest", nil, 200, &replayed)
	if replayed.ID != applied.ID || !replayed.Undone {
		t.Fatal("lost durable receipt")
	}
}

func TestRecordBatchRightsVersionsAndProofGates(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "rights.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	defer server.Close()
	ownerClient, partnerClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "ownerbulk@example.test", "ownerbulk")
	partner := register(t, partnerClient, server.URL, "partnerbulk@example.test", "partnerbulk")
	task := createRecord(t, ownerClient, server.URL, map[string]any{"type": "task", "title": "Locked", "editPolicy": "owner_only"})
	open := createRecord(t, ownerClient, server.URL, map[string]any{"type": "task", "title": "Shared"})
	priority := "high"
	input := recordBatchRequest{ID: "test-batch-rights-01", Reason: "Batch", Patch: batchPatch{Priority: &priority}, Items: []batchSelection{{task.ID, task.UpdatedAt}, {open.ID, open.UpdatedAt}}}
	var receipt recordBatchReceipt
	requestJSON(t, partnerClient, "POST", server.URL+"/api/record-batches/apply", input, 200, &receipt)
	if receipt.Items[0].State != "rejected" || receipt.Items[1].State != "applied" {
		t.Fatalf("permissions bypassed %+v", receipt)
	}
	requestJSON(t, ownerClient, "POST", server.URL+"/api/record-batches/"+receipt.ID+"/undo", map[string]any{}, 404, nil)
	input.ID = "test-stale-version-01"
	requestJSON(t, ownerClient, "POST", server.URL+"/api/record-batches/preview", input, 200, &receipt)
	if receipt.Items[1].Error != "Карточка изменилась. Обновите выбор" {
		t.Fatal("stale version allowed")
	}
	input.Items = []batchSelection{{task.ID, task.UpdatedAt}}
	for _, status := range []string{"completed", "review", "archived"} {
		input.Patch = batchPatch{Status: &status}
		requestJSON(t, ownerClient, "POST", server.URL+"/api/record-batches/preview", input, 200, &receipt)
		if receipt.Items[0].State != "rejected" {
			t.Fatalf("proof gate bypass: %s", status)
		}
	}
	input.Patch = batchPatch{OwnerID: &partner.ID}
	requestJSON(t, partnerClient, "POST", server.URL+"/api/record-batches/preview", input, 200, &receipt)
	if receipt.Items[0].State != "rejected" {
		t.Fatal("partner assigned locked record")
	}
	missing := int64(99999)
	input.Patch = batchPatch{OwnerID: &missing}
	requestJSON(t, ownerClient, "POST", server.URL+"/api/record-batches/preview", input, 200, &receipt)
	if receipt.Items[0].State != "rejected" {
		t.Fatal("assigned nonmember")
	}
	var other Workspace
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Other bulk"}, 201, &other)
	input.Patch = batchPatch{OwnerID: &owner.ID}
	receipt = recordBatchReceipt{}
	requestWorkspaceJSON(t, ownerClient, "POST", server.URL+"/api/record-batches/preview", other.ID, input, 200, &receipt)
	if receipt.Items[0].State != "rejected" || receipt.Items[0].Title != "" || receipt.Items[0].Before != nil {
		t.Fatal("cross-project leak")
	}
	input.Items = append(input.Items, input.Items[0])
	requestJSON(t, ownerClient, "POST", server.URL+"/api/record-batches/preview", input, 400, nil)
}

func TestRecordBatchUndoPreservesConcurrentEditAndBoardStage(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "undo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "undobulk@example.test", "undobulk")
	var board WorkspaceCollection
	requestJSON(t, client, "POST", server.URL+"/api/collections", map[string]any{"name": "Bulk board"}, 201, &board)
	task := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "On board", "collectionId": board.ID})
	second := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Manual later"})
	status := "in_progress"
	input := recordBatchRequest{ID: "test-batch-board-0001", Reason: "Start", Patch: batchPatch{Status: &status}, Items: []batchSelection{{task.ID, task.UpdatedAt}, {second.ID, second.UpdatedAt}}}
	var receipt recordBatchReceipt
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/apply", input, 200, &receipt)
	if receipt.Items[0].State != "applied" || receipt.Items[0].Before.StageID == receipt.Items[0].After.StageID {
		t.Fatalf("no synchronized stage %+v", receipt.Items[0])
	}
	requestJSON(t, client, "PATCH", server.URL+"/api/records/"+second.ID, map[string]any{"title": "Later edit", "expectedUpdatedAt": receipt.Items[1].Version}, 200, nil)
	requestJSON(t, client, "POST", server.URL+"/api/record-batches/"+input.ID+"/undo", map[string]any{}, 200, &receipt)
	if receipt.Items[0].State != "undone" || receipt.Items[1].State != "undo_rejected" {
		t.Fatalf("unsafe undo %+v", receipt)
	}
	var detail struct {
		Record Record `json:"record"`
	}
	requestJSON(t, client, "GET", server.URL+"/api/records/"+task.ID, nil, 200, &detail)
	if detail.Record.StageID != task.StageID || detail.Record.Status != task.Status {
		t.Fatal("stage not restored")
	}
	requestJSON(t, client, "GET", server.URL+"/api/records/"+second.ID, nil, 200, &detail)
	if detail.Record.Title != "Later edit" || detail.Record.Status != "in_progress" {
		t.Fatal("later edit overwritten")
	}
}
