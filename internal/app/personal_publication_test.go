package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func publicationFixture(t *testing.T) (*Store, *httptest.Server, *http.Client, *http.Client, string) {
	t.Helper()
	root := t.TempDir()
	store, err := OpenStore(filepath.Join(root, "publish.db"))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: filepath.Join(root, "uploads")}))
	owner, other := testClient(t), testClient(t)
	register(t, owner, server.URL, "publish-owner@example.test", "publish_owner")
	register(t, other, server.URL, "publish-other@example.test", "publish_other")
	t.Cleanup(func() { server.Close(); store.Close() })
	return store, server, owner, other, filepath.Join(root, "uploads")
}

func TestPublicationPrivatePreviewIndependentCopyAndLostReply(t *testing.T) {
	store, server, owner, other, root := publicationFixture(t)
	base := server.URL + "/api/personal"
	projectID := collaborativeProjectID(server.URL)
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/notes", map[string]any{"title": "Секретное название", "body": "Секретный текст", "tags": []string{"секретный-тег"}}, 201, &note)
	file := uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "publish-file-000001", "", "selected.txt", []byte("selected bytes"), 201)
	uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "publish-file-000002", "", "secret.txt", []byte("private bytes"), 201)
	input := publicationInput{SourceType: "note", SourceID: note.ID, ExpectedUpdatedAt: note.UpdatedAt, WorkspaceID: projectID, Type: "document", Title: "Общий документ", Body: "Только этот текст", AttachmentIDs: []string{file.ID}, RequestKey: "publish-request-000001"}
	var preview publicationPreview
	requestJSON(t, owner, "POST", base+"/publications/preview", input, 201, &preview)
	var count int
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM records WHERE title='Общий документ'`).Scan(&count)
	if count != 0 {
		t.Fatal("preview wrote a project card")
	}
	requestJSON(t, other, "GET", base+"/publications/source/note/"+note.ID, nil, 404, nil)
	requestJSON(t, other, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": true}, 404, nil)
	requestJSON(t, owner, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": false}, 400, nil)
	var result map[string]string
	requestJSON(t, owner, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": true}, 201, &result)
	id := result["recordId"]
	requestJSON(t, owner, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": true}, 200, &result)
	if result["recordId"] != id {
		t.Fatal("retry created duplicate")
	}
	requestJSON(t, owner, "POST", base+"/publications/preview", input, 200, &preview)
	if preview.RecordID != id {
		t.Fatal("lost confirmation cannot recover via same preview key")
	}
	var record map[string]any
	requestJSON(t, other, "GET", server.URL+"/api/records/"+id+"?workspaceId="+projectID, nil, 200, &record)
	raw, _ := json.Marshal(record)
	for _, secret := range []string{note.ID, "Секретный текст", "секретный-тег", "secret.txt", file.ID} {
		if bytes.Contains(raw, []byte(secret)) {
			t.Fatalf("private source leaked: %s", secret)
		}
	}
	var fileID, stored, original string
	err := store.db.QueryRow(`SELECT id,stored_name,original_name FROM record_attachments WHERE record_id=?`, id).Scan(&fileID, &stored, &original)
	if err != nil {
		t.Fatal(err)
	}
	var privateStored string
	_ = store.db.QueryRow(`SELECT stored_name FROM personal_note_attachments WHERE id=?`, file.ID).Scan(&privateStored)
	if stored == privateStored || original != "selected.txt" {
		t.Fatal("not an independent selected file")
	}
	copied, err := os.ReadFile(filepath.Join(root, stored))
	if err != nil || string(copied) != "selected bytes" {
		t.Fatal("file copy contents")
	}
	requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": "Изменено только личное", "body": "Другой текст", "expectedUpdatedAt": note.UpdatedAt}, 200, &note)
	requestJSON(t, owner, "DELETE", base+"/notes/"+note.ID, nil, 204, nil)
	if err = os.Remove(filepath.Join(root, "personal-notes", privateStored)); err != nil {
		t.Fatal(err)
	}
	response, err := other.Get(server.URL + "/api/attachments/" + fileID + "/download?workspaceId=" + projectID)
	if err != nil {
		t.Fatal(err)
	}
	downloaded, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 200 || string(downloaded) != "selected bytes" {
		t.Fatalf("independent download %d %s", response.StatusCode, downloaded)
	}
	requestJSON(t, owner, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": true}, 200, &result)
	var title, body string
	_ = store.db.QueryRow(`SELECT title,description FROM records WHERE id=?`, id).Scan(&title, &body)
	if title != input.Title || body != input.Body {
		t.Fatal("original edits synced to copy")
	}
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM record_attachments WHERE record_id=?`, id).Scan(&count)
	if count != 1 {
		t.Fatal("extra or duplicate attachments")
	}
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_id=? AND workspace_id=?`, id, projectID).Scan(&count)
	if count != 1 {
		t.Fatal("duplicate or wrongly scoped activity")
	}
	requestJSON(t, other, "GET", server.URL+"/api/export?workspaceId="+projectID, nil, 200, &record)
	raw, _ = json.Marshal(record)
	if bytes.Contains(raw, []byte(note.ID)) || bytes.Contains(raw, []byte("publish-request-000001")) {
		t.Fatal("export leaked private publication receipt")
	}
}

func TestPublicationRevalidatesSourceFilesAndProjectRights(t *testing.T) {
	store, server, owner, other, _ := publicationFixture(t)
	base := server.URL + "/api/personal"
	projectID := collaborativeProjectID(server.URL)
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/notes", map[string]any{"title": "Private", "body": "original"}, 201, &note)
	input := publicationInput{SourceType: "note", SourceID: note.ID, ExpectedUpdatedAt: note.UpdatedAt, WorkspaceID: projectID, Type: "idea", Title: "Idea", RequestKey: "publish-access-000001"}
	requestJSON(t, other, "POST", base+"/publications/preview", input, 404, nil)
	var preview publicationPreview
	requestJSON(t, owner, "POST", base+"/publications/preview", input, 201, &preview)
	input.Body = "changed selection"
	requestJSON(t, owner, "POST", base+"/publications/preview", input, 409, nil)
	input.Body = ""
	apply := base + "/publications/" + preview.ID + "/apply"
	_, err := store.db.Exec(`UPDATE workspace_members SET role='guest' WHERE workspace_id=? AND user_id=(SELECT id FROM users WHERE username='publish_owner')`, projectID)
	if err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "POST", apply, map[string]any{"confirm": true}, 403, nil)
	_, _ = store.db.Exec(`UPDATE workspace_members SET role='owner' WHERE workspace_id=? AND user_id=(SELECT id FROM users WHERE username='publish_owner')`, projectID)
	requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": "changed", "body": "changed", "expectedUpdatedAt": note.UpdatedAt}, 200, &note)
	requestJSON(t, owner, "POST", apply, map[string]any{"confirm": true}, 409, nil)
	input.RequestKey = "publish-access-000002"
	input.ExpectedUpdatedAt = note.UpdatedAt
	file := uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "publish-access-file1", "", "example.txt", []byte("text"), 201)
	input.AttachmentIDs = []string{file.ID}
	requestJSON(t, owner, "POST", base+"/publications/preview", input, 201, &preview)
	requestJSON(t, owner, "PATCH", base+"/note-attachments/"+file.ID, map[string]any{"removed": true, "expectedUpdatedAt": file.UpdatedAt}, 200, &file)
	requestJSON(t, owner, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": true}, 409, nil)
	input.RequestKey = "publish-access-000003"
	input.AttachmentIDs = nil
	requestJSON(t, owner, "POST", base+"/publications/preview", input, 201, &preview)
	// Expiry is stored in the immutable payload too.
	_, _ = store.db.Exec(`UPDATE personal_publications SET payload_json=json_set(payload_json,'$.expiresAt','2000-01-01T00:00:00Z') WHERE id=?`, preview.ID)
	requestJSON(t, owner, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": true}, 409, nil)
	input.RequestKey = "publish-access-000004"
	input.Body = "[private](/api/personal/note-attachments/test/file)"
	requestJSON(t, owner, "POST", base+"/publications/preview", input, 400, nil)
	var count int
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM records WHERE title='Idea'`).Scan(&count)
	if count != 0 {
		t.Fatal("failed publication created data")
	}
}

func TestPublicationSupportsPlansProjectsAndGoalsWithoutPrivateRelations(t *testing.T) {
	_, server, owner, other, _ := publicationFixture(t)
	base := server.URL + "/api/personal"
	projectID := collaborativeProjectID(server.URL)
	sources := []struct {
		kind, path string
		body       map[string]any
	}{
		{"project", "projects", map[string]any{"title": "Private project", "notes": "Private details", "colorKey": "blue"}},
		{"plan", "plans", map[string]any{"title": "Private event", "notes": "Details", "plannedMinutes": 120}},
		{"goal", "goals", map[string]any{"title": "Private goal", "notes": "Goal details", "horizon": "month", "startDate": "2026-09-01"}},
	}
	for _, source := range sources {
		var item map[string]any
		requestJSON(t, owner, "POST", base+"/"+source.path, source.body, 201, &item)
		id := item["id"].(string)
		var detail publicationSource
		requestJSON(t, owner, "GET", base+"/publications/source/"+source.kind+"/"+id, nil, 200, &detail)
		requestJSON(t, other, "GET", base+"/publications/source/"+source.kind+"/"+id, nil, 404, nil)
		input := publicationInput{SourceType: source.kind, SourceID: id, ExpectedUpdatedAt: detail.UpdatedAt, WorkspaceID: projectID, Type: "task", Title: "Published " + source.kind, Body: detail.Body, RequestKey: "publish-kind-" + source.kind + strings.Repeat("0", 8)}
		var preview publicationPreview
		requestJSON(t, owner, "POST", base+"/publications/preview", input, 201, &preview)
		requestJSON(t, owner, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": true}, 201, nil)
	}
}

func collaborativeProjectID(base string) string {
	value, _ := collaborativeTestTeams.Load(base)
	return value.(collaborativeTestTeam).projectID
}

func TestPublicationConcurrentRetriesUseSelectedProject(t *testing.T) {
	store, server, owner, other, root := publicationFixture(t)
	var destination Workspace
	requestJSON(t, owner, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Отдельный проект публикации"}, 201, &destination)
	base := server.URL + "/api/personal"
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/notes", map[string]any{"title": "Личный источник"}, 201, &note)
	file := uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "publish-concurrent-file", "", "copy.txt", []byte("one copy"), 201)
	var preview publicationPreview
	requestJSON(t, owner, "POST", base+"/publications/preview", publicationInput{SourceType: "note", SourceID: note.ID, ExpectedUpdatedAt: note.UpdatedAt, WorkspaceID: destination.ID, Type: "document", Title: "Конкурентная копия", AttachmentIDs: []string{file.ID}, RequestKey: "publish-concurrent-request"}, 201, &preview)
	type outcome struct {
		status int
		data   []byte
		err    error
	}
	results := make(chan outcome, 2)
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			response, err := owner.Post(base+"/publications/"+preview.ID+"/apply", "application/json", strings.NewReader(`{"confirm":true}`))
			if err != nil {
				results <- outcome{err: err}
				return
			}
			defer response.Body.Close()
			data, err := io.ReadAll(response.Body)
			results <- outcome{response.StatusCode, data, err}
		}()
	}
	workers.Wait()
	close(results)
	id := ""
	for result := range results {
		if result.err != nil || (result.status != 200 && result.status != 201) {
			t.Fatalf("concurrent publish: %#v %s", result, result.data)
		}
		var value map[string]string
		if json.Unmarshal(result.data, &value) != nil {
			t.Fatal("invalid result")
		}
		if id != "" && id != value["recordId"] {
			t.Fatal("concurrent duplicate")
		}
		id = value["recordId"]
	}
	var count int
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_id=? AND workspace_id=?`, id, destination.ID).Scan(&count)
	if count != 1 {
		t.Fatal("publication activity leaked into current project")
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	files := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			files++
		}
	}
	if files != 1 {
		t.Fatalf("concurrent copies left %d files", files)
	}
	requestJSON(t, other, "GET", server.URL+"/api/records/"+id, nil, 404, nil)
	requestJSON(t, other, "GET", base+"/publications/"+preview.ID, nil, 404, nil)
	_, err = store.db.Exec(`UPDATE teams SET deleted_at=? WHERE id=?`, nowText(), destination.TeamID)
	if err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "POST", base+"/publications/"+preview.ID+"/apply", map[string]any{"confirm": true}, 403, nil)
}
