package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNoteOrganizationPreservesLinksAndPrivacy(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, other := testClient(t), testClient(t)
	user := register(t, owner, server.URL, "owner@example.test", "notes_owner")
	register(t, other, server.URL, "other@example.test", "notes_other")
	base := server.URL + "/api/personal"
	var folder PersonalNoteFolder
	requestJSON(t, owner, "POST", base+"/note-folders", map[string]any{"name": "  Мысли  "}, 201, &folder)
	requestJSON(t, owner, "POST", base+"/note-folders", map[string]any{"name": "МЫСЛИ"}, 409, nil)
	requestJSON(t, other, "POST", base+"/note-folders", map[string]any{"name": "Мысли"}, 201, nil)
	requestJSON(t, other, "PATCH", base+"/note-folders/"+folder.ID, map[string]any{"name": "Взлом", "expectedUpdatedAt": folder.UpdatedAt}, 404, nil)
	requestJSON(t, other, "DELETE", base+"/note-folders/"+folder.ID, map[string]any{"expectedUpdatedAt": folder.UpdatedAt}, 404, nil)
	payload := map[string]any{"title": "Заметка", "body": "Содержимое с редким словом аквамарин", "folderId": folder.ID, "tags": []string{" #Тег ", "тег", "", "Архитектура"}, "pinned": true, "requestKey": "note-org-create-key-0001"}
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/notes", payload, 201, &note)
	if len(note.Tags) != 2 || note.Tags[0] != "Тег" || note.FolderID != folder.ID {
		t.Fatalf("metadata: %#v", note)
	}
	requestJSON(t, other, "POST", base+"/notes", map[string]any{"title": "Чужая папка", "folderId": folder.ID}, 404, nil)
	requestJSON(t, owner, "POST", base+"/notes", map[string]any{"title": "Неверная метка", "tags": []string{strings.Repeat("Я", 41)}}, 400, nil)
	var plan PersonalPlan
	requestJSON(t, owner, "POST", base+"/plans", map[string]any{"title": "План"}, 201, &plan)
	requestJSON(t, owner, "POST", base+"/links", map[string]any{"sourceType": "note", "sourceId": note.ID, "targetType": "plan", "targetId": plan.ID, "relationType": "related"}, 201, nil)
	var renamed PersonalNoteFolder
	requestJSON(t, owner, "PATCH", base+"/note-folders/"+folder.ID, map[string]any{"name": "Исследования", "expectedUpdatedAt": folder.UpdatedAt}, 200, &renamed)
	requestJSON(t, owner, "PATCH", base+"/note-folders/"+folder.ID, map[string]any{"name": "Старая правка", "expectedUpdatedAt": folder.UpdatedAt}, 409, nil)
	// A pre-migration editor omits all organization fields; it must retain them.
	var updated PersonalNote
	requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": "Новое имя", "body": note.Body, "pinned": true, "expectedUpdatedAt": note.UpdatedAt}, 200, &updated)
	if updated.FolderID != folder.ID || updated.FolderName != "Исследования" || len(updated.Tags) != 2 {
		t.Fatalf("legacy update lost metadata: %#v", updated)
	}
	for _, query := range []string{"АКВАМАРИН", "исследования", "АРХИТЕКТУРА", "Новое имя"} {
		var found []PersonalSearchResult
		requestJSON(t, owner, "GET", base+"/search?q="+url.QueryEscape(query), nil, 200, &found)
		if len(found) != 1 || found[0].ID != note.ID {
			t.Fatalf("search %q: %#v", query, found)
		}
		requestJSON(t, other, "GET", base+"/search?q="+url.QueryEscape(query), nil, 200, &found)
		if len(found) != 0 {
			t.Fatalf("private search leak: %#v", found)
		}
	}
	requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": "stale", "body": "", "expectedUpdatedAt": note.UpdatedAt, "tags": []string{}}, 409, nil)
	requestOutboxJSON(t, other, "POST", base+"/notes", user.ID, payload, 409)
	var template PersonalNoteTemplate
	requestJSON(t, owner, "POST", base+"/note-templates", map[string]any{"name": "С папкой", "title": "Название", "body": "Текст", "folderId": folder.ID}, 201, &template)
	requestJSON(t, owner, "DELETE", base+"/note-folders/"+folder.ID, map[string]any{"expectedUpdatedAt": folder.UpdatedAt}, 409, nil)
	requestJSON(t, owner, "DELETE", base+"/note-folders/"+folder.ID, map[string]any{"expectedUpdatedAt": renamed.UpdatedAt}, 200, nil)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", base+"/overview", nil, 200, &overview)
	if len(overview.NoteFolders) != 0 || len(overview.Links) != 1 || overview.Notes[0].ID != note.ID || overview.Notes[0].FolderID != "" || len(overview.Notes[0].Tags) != 2 {
		t.Fatalf("archive changed content or links: %#v", overview)
	}
	requestJSON(t, owner, "GET", base+"/note-templates/"+template.ID, nil, 200, &template)
	if template.FolderID != "" || template.Body != "Текст" {
		t.Fatalf("template unlink: %#v", template)
	}
	var replay PersonalNote
	requestJSON(t, owner, "POST", base+"/notes", payload, 200, &replay)
	if replay.ID != note.ID || replay.FolderID != "" || replay.Title != "Новое имя" {
		t.Fatalf("receipt overwrote edits: %#v", replay)
	}
	requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": replay.Title, "body": replay.Body, "folderId": "", "tags": []string{}, "expectedUpdatedAt": replay.UpdatedAt}, 200, &updated)
	if len(updated.Tags) != 0 {
		t.Fatal("explicit tag removal ignored")
	}
}

func TestNoteShortcutsAreIdempotentAndPrivate(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "shortcuts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, other := testClient(t), testClient(t)
	user := register(t, owner, server.URL, "owner@example.test", "shortcut_owner")
	register(t, other, server.URL, "other@example.test", "shortcut_other")
	base := server.URL + "/api/personal"
	results := make(chan outboxHTTPResult, 6)
	for i := 0; i < 6; i++ {
		go func() {
			results <- sendOutboxRequest(owner, http.MethodPost, base+"/notes/daily", user.ID, map[string]any{"date": "2026-09-04"})
		}()
	}
	id := ""
	created := 0
	for i := 0; i < 6; i++ {
		result := <-results
		if result.err != nil || (result.status != 200 && result.status != 201) {
			t.Fatalf("daily: %#v", result)
		}
		if result.status == 201 {
			created++
		}
		current := result.data["id"].(string)
		if id != "" && current != id {
			t.Fatal("duplicate daily note")
		}
		id = current
	}
	if created != 1 {
		t.Fatalf("created=%d", created)
	}
	var daily PersonalNote
	requestJSON(t, owner, "POST", base+"/notes/daily", map[string]any{"date": "2026-09-04"}, 200, &daily)
	requestJSON(t, owner, "PATCH", base+"/notes/"+id, map[string]any{"title": "Мой день", "body": "Сохранённый результат", "expectedUpdatedAt": daily.UpdatedAt}, 200, &daily)
	requestJSON(t, owner, "POST", base+"/notes/daily", map[string]any{"date": "2026-09-04"}, 200, &daily)
	if daily.Body != "Сохранённый результат" || daily.DailyDate != "2026-09-04" {
		t.Fatal("daily overwritten")
	}
	var otherDaily PersonalNote
	requestJSON(t, other, "POST", base+"/notes/daily", map[string]any{"date": "2026-09-04"}, 201, &otherDaily)
	if otherDaily.ID == id {
		t.Fatal("shared daily")
	}
	requestJSON(t, owner, "POST", base+"/notes/daily", map[string]any{"date": "2026-02-30"}, 400, nil)
	requestJSON(t, owner, "DELETE", base+"/notes/"+id, nil, 204, nil)
	requestJSON(t, owner, "POST", base+"/notes/daily", map[string]any{"date": "2026-09-04"}, 201, &daily)
	if daily.ID == id {
		t.Fatal("archived daily reopened")
	}
	var template PersonalNoteTemplate
	requestJSON(t, owner, "POST", base+"/note-templates", map[string]any{"name": "Встреча", "title": "Встреча {{date}}", "body": "## {{date}}\n- Итог", "tags": []string{"Встречи"}}, 201, &template)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", base+"/overview", nil, 200, &overview)
	if len(overview.NoteTemplates) != 1 || overview.NoteTemplates[0].Body != "" {
		t.Fatal("overview transfers template bodies")
	}
	requestJSON(t, other, "GET", base+"/overview", nil, 200, &overview)
	if len(overview.NoteTemplates) != 0 {
		t.Fatal("template list leak")
	}
	requestJSON(t, other, "GET", base+"/note-templates/"+template.ID, nil, 404, nil)
	requestJSON(t, other, "PATCH", base+"/note-templates/"+template.ID, map[string]any{"name": "Взлом", "title": "Взлом", "expectedUpdatedAt": template.UpdatedAt}, 404, nil)
	requestJSON(t, other, "DELETE", base+"/note-templates/"+template.ID, map[string]any{"expectedUpdatedAt": template.UpdatedAt}, 404, nil)
	copyPayload := map[string]any{"date": "2026-09-04", "requestKey": "template-copy-key-0001"}
	requestJSON(t, other, "POST", base+"/note-templates/"+template.ID+"/instantiate", copyPayload, 404, nil)
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/note-templates/"+template.ID+"/instantiate", copyPayload, 201, &note)
	if note.Title != "Встреча 2026-09-04" || note.Body != "## 2026-09-04\n- Итог" || note.DailyDate != "" || len(note.Tags) != 1 {
		t.Fatalf("copy: %#v", note)
	}
	requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": "Отредактированная копия", "body": "Самостоятельный текст", "expectedUpdatedAt": note.UpdatedAt}, 200, &note)
	oldVersion := template.UpdatedAt
	requestJSON(t, owner, "PATCH", base+"/note-templates/"+template.ID, map[string]any{"name": "Новая версия", "title": "Другая встреча", "body": "Новый шаблон", "expectedUpdatedAt": oldVersion}, 200, &template)
	requestJSON(t, owner, "PATCH", base+"/note-templates/"+template.ID, map[string]any{"name": "Старое", "title": "Старое", "expectedUpdatedAt": oldVersion}, 409, nil)
	requestJSON(t, owner, "DELETE", base+"/note-templates/"+template.ID, map[string]any{"expectedUpdatedAt": template.UpdatedAt}, 200, nil)
	var replay PersonalNote
	requestJSON(t, owner, "POST", base+"/note-templates/"+template.ID+"/instantiate", copyPayload, 200, &replay)
	if replay.ID != note.ID || replay.Body != note.Body {
		t.Fatal("retry duplicated or overwrote independent note")
	}
	copyPayload["date"] = "2026-09-05"
	requestJSON(t, owner, "POST", base+"/note-templates/"+template.ID+"/instantiate", copyPayload, 409, nil)
	copyPayload["requestKey"] = "template-copy-key-0002"
	requestJSON(t, owner, "POST", base+"/note-templates/"+template.ID+"/instantiate", copyPayload, 404, nil)
}
