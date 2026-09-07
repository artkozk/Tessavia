package app

import (
	"os"
	"strings"
	"testing"
)

func TestCompletionPreservesChosenColumnAndIndependentReview(t *testing.T) {
	f := newLifecycleFixture(t)
	var board WorkspaceCollection
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/collections", f.project.ID, map[string]any{"name": "Shipping", "cardLabel": "Task", "defaultRecordType": "task"}, 201, &board)
	// Add a second done destination to catch choosing the first column on review.
	id, _ := newID()
	now := nowText()
	_, err := f.store.db.Exec(`INSERT INTO collection_stages(id,collection_id,name,category,color_key,sort_order,created_at,updated_at) VALUES(?,?,'Delivered','done','green',99,?,?)`, id, board.ID, now, now)
	if err != nil {
		t.Fatal(err)
	}
	var task Record
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/records", f.project.ID, map[string]any{"type": "task", "title": "Ship result", "ownerId": f.users["member"].ID, "collectionId": board.ID, "stageId": board.Stages[0].ID}, 201, &task)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api/records/"+task.ID+path, f.project.ID, body, status, out)
	}
	call("member", "POST", "/proofs", map[string]any{"kind": "text", "content": "Delivered"}, 201, nil)
	call("owner", "PUT", "/recurrence", map[string]any{"active": true, "cadence": "weekly", "interval": 1}, 200, nil)
	var done Record
	call("member", "PUT", "/stage", map[string]any{"stageId": id}, 200, &done)
	if done.Status != "completed" || done.StageID != id || !done.ReviewPending || done.CompletedAt == nil {
		t.Fatal("completion moved or lost review", done)
	}
	var notifications, repeats int
	count := func() {
		f.store.db.QueryRow(`SELECT count(*) FROM notifications WHERE entity_id=? AND type='task_review' AND user_id=?`, task.ID, f.users["owner"].ID).Scan(&notifications)
		f.store.db.QueryRow(`SELECT count(*) FROM record_links WHERE source_id=? AND relation_type='leads_to'`, task.ID).Scan(&repeats)
	}
	count()
	if notifications != 1 || repeats != 1 {
		t.Fatal("completion effects", notifications, repeats)
	}
	call("member", "POST", "/complete", map[string]any{"result": "Delivered"}, 200, nil)
	count()
	if notifications != 1 || repeats != 1 {
		t.Fatal("duplicate completion", notifications, repeats)
	}
	call("member", "POST", "/review", map[string]any{"decision": "accept"}, 403, nil)
	var accepted Record
	call("admin", "POST", "/review", map[string]any{"decision": "accept"}, 200, &accepted)
	if accepted.StageID != id || accepted.ReviewPending || *accepted.CompletedAt != *done.CompletedAt {
		t.Fatal("review changed completion", accepted)
	}
	call("admin", "POST", "/review", map[string]any{"decision": "accept"}, 200, nil)
	count()
	if repeats != 1 {
		t.Fatal("review duplicated recurrence")
	}
	call("admin", "POST", "/review", map[string]any{"decision": "rework"}, 400, nil)
	var reopened Record
	call("admin", "POST", "/review", map[string]any{"decision": "rework", "reason": "Fix a detail"}, 200, &reopened)
	if reopened.Status != "in_progress" || reopened.ReviewPending || reopened.Progress >= 100 || reopened.CompletedAt != nil || reopened.ProofCount != 1 {
		t.Fatal("bad rework", reopened)
	}
}

func TestCompletionRestoresOnlySubmittedLegacyTasks(t *testing.T) {
	f := newLifecycleFixture(t)
	var task, manual Record
	for i, target := range []*Record{&task, &manual} {
		requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/records", f.project.ID, map[string]any{"type": "task", "title": "Legacy", "ownerId": f.users["member"].ID}, 201, target)
		_, err := f.store.db.Exec(`UPDATE records SET status='review',progress=100,result='Retained',updated_at='2026-09-01T10:00:00Z' WHERE id=?`, target.ID)
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			_, err = f.store.db.Exec(`INSERT INTO task_review_events(id,record_id,actor_id,action,created_at) VALUES('legacy-submitted',?,?,'submitted','2026-09-01T10:00:00Z')`, target.ID, f.users["member"].ID)
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	data, err := os.ReadFile("migrations/063_task_completion_review.sql")
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.store.db.Exec(string(data)[strings.Index(string(data), "UPDATE records"):])
	if err != nil {
		t.Fatal(err)
	}
	var status, result string
	var pending int
	f.store.db.QueryRow(`SELECT status,result,review_pending FROM records WHERE id=?`, task.ID).Scan(&status, &result, &pending)
	if status != "completed" || result != "Retained" || pending != 1 {
		t.Fatal(status, result, pending)
	}
	f.store.db.QueryRow(`SELECT status,review_pending FROM records WHERE id=?`, manual.ID).Scan(&status, &pending)
	if status != "review" || pending != 0 {
		t.Fatal("manual review changed", status, pending)
	}
}
