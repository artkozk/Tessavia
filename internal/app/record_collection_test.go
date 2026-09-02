package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestLifecycleCompletionReopenAndBoardAssignment(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "lifecycle.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	defer server.Close()
	ownerClient, partnerClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "lifecycle@example.test", "lifecycle")
	register(t, partnerClient, server.URL, "lifecycle2@example.test", "lifecycle2")
	var board WorkspaceCollection
	requestJSON(t, ownerClient, "POST", server.URL+"/api/collections", map[string]any{"name": "Process"}, 201, &board)
	var field CollectionField
	requestJSON(t, ownerClient, "POST", server.URL+"/api/collections/"+board.ID+"/fields", map[string]any{"name": "Client", "fieldType": "text", "required": true}, 201, &field)
	for _, kind := range []string{"risk", "goal", "meeting", "disagreement", "document"} {
		t.Run(kind, func(t *testing.T) {
			record := createRecord(t, ownerClient, server.URL, map[string]any{"type": kind, "title": "Lifecycle " + kind, "ownerId": owner.ID, "editPolicy": "owner_only", "dueAt": "2026-09-01T12:00:00Z"})
			path := server.URL + "/api/records/" + record.ID
			requestJSON(t, partnerClient, "PATCH", path, map[string]any{"status": "completed", "reason": "No access"}, 403, nil)
			var completed Record
			requestJSON(t, ownerClient, "PATCH", path, map[string]any{"status": "completed", "result": "Verified outcome", "reason": "Explicit completion", "expectedUpdatedAt": record.UpdatedAt}, 200, &completed)
			if completed.Status != "completed" || completed.CompletedAt == nil || completed.Progress != 100 {
				t.Fatalf("not completed: %#v", completed)
			}
			requestJSON(t, ownerClient, "PUT", path+"/collection", map[string]any{"collectionId": board.ID, "expectedUpdatedAt": completed.UpdatedAt}, 400, nil)
			var assigned Record
			payload := map[string]any{"collectionId": board.ID, "expectedUpdatedAt": completed.UpdatedAt, "values": map[string]any{field.ID: "Acme"}}
			requestJSON(t, partnerClient, "PUT", path+"/collection", payload, 403, nil)
			requestJSON(t, ownerClient, "PUT", path+"/collection", payload, 200, &assigned)
			if assigned.ID != record.ID || assigned.Status != "completed" || assigned.CollectionID != board.ID || assigned.OwnerID != owner.ID || assigned.EditPolicy != "owner_only" || *assigned.DueAt != *record.DueAt || *assigned.CompletedAt != *completed.CompletedAt {
				t.Fatalf("assignment changed lifecycle: %#v", assigned)
			}
			var category string
			if err := store.db.QueryRow("SELECT category FROM collection_stages WHERE id = ?", assigned.StageID).Scan(&category); err != nil || category != "done" {
				t.Fatalf("stage = %s: %v", category, err)
			}
			requestJSON(t, ownerClient, "PUT", path+"/collection", payload, 409, nil)
			var reopened Record
			requestJSON(t, ownerClient, "PATCH", path, map[string]any{"status": "in_progress", "reason": "New work", "expectedUpdatedAt": assigned.UpdatedAt}, 200, &reopened)
			if reopened.CompletedAt != nil || reopened.Progress != 0 || reopened.Result != "Verified outcome" || *reopened.DueAt != *record.DueAt {
				t.Fatalf("invalid reopen: %#v", reopened)
			}
			if err := store.db.QueryRow("SELECT category FROM collection_stages WHERE id = ?", reopened.StageID).Scan(&category); err != nil || category != "active" {
				t.Fatalf("reopened stage = %s: %v", category, err)
			}
		})
	}
	task := createRecord(t, ownerClient, server.URL, map[string]any{"type": "task", "title": "Requires result"})
	var doneStage string
	for _, stage := range board.Stages {
		if stage.Category == "done" {
			doneStage = stage.ID
		}
	}
	for _, kind := range []string{"research", "question_set", "hypothesis", "experiment"} {
		record := createRecord(t, ownerClient, server.URL, map[string]any{"type": kind, "title": "Requires outcome " + kind})
		path := server.URL + "/api/records/" + record.ID
		requestJSON(t, ownerClient, "PUT", path+"/collection", map[string]any{"collectionId": board.ID, "expectedUpdatedAt": record.UpdatedAt, "values": map[string]any{field.ID: "Acme"}}, 200, nil)
		requestJSON(t, ownerClient, "PUT", path+"/stage", map[string]any{"stageId": doneStage}, 400, nil)
	}
	requestJSON(t, ownerClient, "PATCH", server.URL+"/api/records/"+task.ID, map[string]any{"status": "completed", "reason": "No proof"}, 400, nil)
	var other Workspace
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Other project"}, 201, &other)
	var otherBoard WorkspaceCollection
	requestWorkspaceJSON(t, ownerClient, "POST", server.URL+"/api/collections", other.ID, map[string]any{"name": "Private board"}, 201, &otherBoard)
	requestJSON(t, ownerClient, "PUT", server.URL+"/api/records/"+task.ID+"/collection", map[string]any{"collectionId": otherBoard.ID, "expectedUpdatedAt": task.UpdatedAt}, 400, nil)
	var detail struct {
		Record Record `json:"record"`
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/records/"+task.ID, nil, 200, &detail)
	if detail.Record.CollectionID != "" || detail.Record.Status != task.Status {
		t.Fatal("failed operation changed record")
	}
	requestJSON(t, ownerClient, "PUT", server.URL+"/api/records/"+task.ID+"/collection", map[string]any{"collectionId": board.ID, "expectedUpdatedAt": task.UpdatedAt, "values": map[string]any{field.ID: "Acme"}}, 200, nil)
	requestJSON(t, ownerClient, "POST", server.URL+"/api/records/"+task.ID+"/proofs", map[string]any{"kind": "text", "content": "Test evidence"}, 201, nil)
	var finishedTask Record
	requestJSON(t, ownerClient, "POST", server.URL+"/api/records/"+task.ID+"/complete", map[string]any{"result": "Verified", "notifyPartners": false}, 200, &finishedTask)
	if finishedTask.StageID != doneStage || finishedTask.Status != "completed" {
		t.Fatalf("completion left task in active board stage: %#v", finishedTask)
	}
}
