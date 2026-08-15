package app

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWorkflowReleaseSeedIsIdempotent(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "workflow-release-seed.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	client := testClient(t)
	register(t, client, server.URL, "artkozk@example.test", "artkozk")
	server.Close()

	seedPath := filepath.Join("..", "..", "deploy", "seed-workflow-comfort-release-20260814.sql")
	seed, err := os.ReadFile(seedPath)
	if err != nil {
		t.Fatalf("read release seed: %v", err)
	}
	for run := 1; run <= 2; run++ {
		if _, err := store.db.Exec(string(seed)); err != nil {
			t.Fatalf("apply release seed run %d: %v", run, err)
		}
	}
	var tasks, blocked, proofs, activities, foreignKeyViolations int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM records WHERE id LIKE 'f814%' AND status = 'completed'`).Scan(&tasks); err != nil {
		t.Fatalf("count tasks: %v", err)
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM task_proofs WHERE id LIKE 'f814%'`).Scan(&proofs); err != nil {
		t.Fatalf("count proofs: %v", err)
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM records WHERE id = 'f8140000000000000000000000000061' AND status = 'blocked'`).Scan(&blocked); err != nil {
		t.Fatalf("count blocked AI task: %v", err)
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE id LIKE 'f814%'`).Scan(&activities); err != nil {
		t.Fatalf("count activities: %v", err)
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM pragma_foreign_key_check`).Scan(&foreignKeyViolations); err != nil {
		t.Fatalf("foreign key check: %v", err)
	}
	var integrity string
	if err := store.db.QueryRow(`PRAGMA integrity_check`).Scan(&integrity); err != nil {
		t.Fatalf("integrity check: %v", err)
	}
	if tasks != 7 || blocked != 1 || proofs != 8 || activities != 8 || foreignKeyViolations != 0 || integrity != "ok" {
		t.Fatalf("seed result tasks=%d blocked=%d proofs=%d activities=%d fk=%d integrity=%q", tasks, blocked, proofs, activities, foreignKeyViolations, integrity)
	}
}

func TestCofounderWorkflowComfort(t *testing.T) {
	temp := t.TempDir()
	store, err := OpenStore(filepath.Join(temp, "workflow-comfort.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: filepath.Join(temp, "uploads")}))
	defer server.Close()
	artkozk := testClient(t)
	partnerClient := testClient(t)
	art := register(t, artkozk, server.URL, "artkozk@example.test", "artkozk")
	partner := register(t, partnerClient, server.URL, "partner@example.test", "sweetybboy")

	due := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339Nano)
	task := createRecord(t, artkozk, server.URL, map[string]any{
		"type": "task", "title": "Проверить сценарий приёмки", "description": "## Готовность\n\n- Есть отчёт\n- Есть файл",
		"ownerId": partner.ID, "dueAt": due, "priority": "high", "estimateMinutes": 45,
	})
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/records/"+task.ID+"/sections", map[string]any{
		"title": "Архитектурный контекст", "content": "Уникальный маркер сетевой топологии",
	}, http.StatusOK, nil)

	var comment RecordComment
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/records/"+task.ID+"/comments", map[string]any{
		"body": "@sweetybboy проверь **условия готовности**.",
	}, http.StatusCreated, &comment)
	if comment.AuthorID != art.ID || !strings.Contains(comment.Body, "**условия") {
		t.Fatalf("comment = %#v", comment)
	}

	var checklist []ChecklistItem
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/records/"+task.ID+"/checklist", map[string]any{
		"title": "Приложить проверяемый результат", "ownerId": partner.ID,
	}, http.StatusCreated, &checklist)
	if len(checklist) != 1 || checklist[0].OwnerID == nil || *checklist[0].OwnerID != partner.ID {
		t.Fatalf("checklist created = %#v", checklist)
	}
	var checklistUpdate struct {
		Checklist []ChecklistItem `json:"checklist"`
	}
	requestJSON(t, partnerClient, http.MethodPatch, server.URL+"/api/records/"+task.ID+"/checklist/"+checklist[0].ID, map[string]any{
		"status": "completed", "proofText": "Готово: [результат](https://example.test/result)",
	}, http.StatusOK, &checklistUpdate)
	checklist = checklistUpdate.Checklist
	if checklist[0].Status != "completed" || !strings.Contains(checklist[0].ProofText, "[результат]") {
		t.Fatalf("checklist completed = %#v", checklist)
	}

	uploadAttachment(t, partnerClient, server.URL+"/api/records/"+task.ID+"/attachments", "report.md", []byte("# Отчёт\n\nРезультат проверен."))
	requestJSON(t, artkozk, http.MethodPut, server.URL+"/api/records/"+task.ID+"/recurrence", map[string]any{
		"active": true, "cadence": "weekly", "interval": 2,
	}, http.StatusOK, nil)

	var workflow struct {
		Comments    []RecordComment    `json:"comments"`
		Checklist   []ChecklistItem    `json:"checklist"`
		Attachments []RecordAttachment `json:"attachments"`
		Recurrence  RecurrenceRule     `json:"recurrence"`
	}
	requestJSON(t, partnerClient, http.MethodGet, server.URL+"/api/records/"+task.ID+"/workflow", nil, http.StatusOK, &workflow)
	if len(workflow.Comments) != 1 || len(workflow.Checklist) != 1 || len(workflow.Attachments) != 1 || !workflow.Recurrence.Active || workflow.Recurrence.Cadence != "weekly" {
		t.Fatalf("workflow aggregate = %#v", workflow)
	}
	var notifications []Notification
	requestJSON(t, partnerClient, http.MethodGet, server.URL+"/api/notifications", nil, http.StatusOK, &notifications)
	hasComment, hasDeadline := false, false
	for _, notification := range notifications {
		hasComment = hasComment || notification.Type == "comment"
		hasDeadline = hasDeadline || notification.Type == "deadline"
	}
	if !hasComment || !hasDeadline {
		t.Fatalf("notifications comment=%v deadline=%v: %#v", hasComment, hasDeadline, notifications)
	}

	var proofs []Proof
	requestJSON(t, partnerClient, http.MethodPost, server.URL+"/api/records/"+task.ID+"/proofs", map[string]any{
		"kind": "text", "content": "## Итог\n\nРабота выполнена.",
	}, http.StatusCreated, &proofs)
	assertSearchKind := func(query, kind, targetTab string) {
		t.Helper()
		var results []SearchResult
		requestJSON(t, artkozk, http.MethodGet, server.URL+"/api/search?q="+url.QueryEscape(query), nil, http.StatusOK, &results)
		for _, result := range results {
			if result.RecordID == task.ID && result.EntityKind == kind && result.TargetTab == targetTab {
				return
			}
		}
		t.Fatalf("search %q missing kind=%s tab=%s: %#v", query, kind, targetTab, results)
	}
	assertSearchKind("сетевой топологии", "section", "content")
	assertSearchKind("условия готовности", "comment", "discussion")
	assertSearchKind("Приложить проверяемый", "checklist", "execution")
	assertSearchKind("Работа выполнена", "proof", "execution")
	assertSearchKind("report.md", "attachment", "files")
	var submitted Record
	requestJSON(t, partnerClient, http.MethodPost, server.URL+"/api/records/"+task.ID+"/complete", map[string]any{
		"result": "Работа готова к проверке", "notifyPartners": true,
	}, http.StatusOK, &submitted)
	if submitted.Status != "review" {
		t.Fatalf("submitted status = %q", submitted.Status)
	}
	var accepted Record
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/records/"+task.ID+"/review", map[string]any{
		"decision": "accept", "reason": "Проверено",
	}, http.StatusOK, &accepted)
	if accepted.Status != "completed" || accepted.CompletedAt == nil {
		t.Fatalf("accepted task = %#v", accepted)
	}
	var nextCount, linkCount, nextChecklist int
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM records WHERE id IN (SELECT target_id FROM record_links WHERE source_id = ? AND relation_type = 'leads_to') AND type = 'task' AND status = 'planned'`, task.ID).Scan(&nextCount)
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM record_links WHERE source_id = ? AND relation_type = 'leads_to'`, task.ID).Scan(&linkCount)
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM checklist_items WHERE record_id IN (SELECT target_id FROM record_links WHERE source_id = ? AND relation_type = 'leads_to')`, task.ID).Scan(&nextChecklist)
	if nextCount != 1 || linkCount != 1 || nextChecklist != 1 {
		t.Fatalf("recurrence result: tasks=%d links=%d checklist=%d", nextCount, linkCount, nextChecklist)
	}

	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/saved-views", map[string]any{
		"name": "Мои важные", "viewMode": "kanban", "filters": map[string]any{"scope": "mine", "status": "active", "priority": "high"},
	}, http.StatusCreated, nil)
	var views []SavedView
	requestJSON(t, artkozk, http.MethodGet, server.URL+"/api/saved-views", nil, http.StatusOK, &views)
	if len(views) != 1 || views[0].ViewMode != "kanban" || !json.Valid(views[0].Filters) {
		t.Fatalf("saved views = %#v", views)
	}

	assertDownload(t, artkozk, server.URL+"/api/export?format=csv", "text/csv", "Проверить сценарий приёмки")
	assertDownload(t, artkozk, server.URL+"/api/export", "application/json", `"schemaVersion":7`)

}

func TestGeminiProviderContract(t *testing.T) {
	var parentID string
	gemini := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-goog-api-key") != "gemini-test-secret" {
			t.Errorf("gemini key header is missing")
		}
		if !strings.Contains(r.URL.Path, "/models/test-gemini:generateContent") {
			t.Errorf("gemini path = %s", r.URL.Path)
		}
		var payload struct {
			Contents []struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"contents"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode gemini payload: %v", err)
		}
		prompt := payload.Contents[0].Parts[0].Text
		content := `{"priority":"high","workstream":"platform","parentId":"` + parentID + `","estimateMinutes":80,"confidence":0.9,"reason":"Продолжает ветку платформы"}`
		if strings.Contains(prompt, "suggestedOutputs") {
			content = `{"summary":"Карточка требует следующего действия.","gaps":[],"risks":[],"nextAction":"Проверить результат.","priority":"high","estimateMinutes":80,"confidence":0.88,"suggestedLinks":[{"recordId":"` + parentID + `","relationType":"depends_on","reason":"Продолжает цель."}],"suggestedOutputs":[]}`
		}
		writeJSON(w, http.StatusOK, map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{map[string]any{"text": content}}}}}})
	}))
	defer gemini.Close()

	store, err := OpenStore(filepath.Join(t.TempDir(), "gemini-contract.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, GeminiAPIKey: "gemini-test-secret", GeminiModel: "test-gemini", GeminiBaseURL: gemini.URL}))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "artkozk@example.test", "artkozk")
	parent := createRecord(t, client, server.URL, map[string]any{"type": "goal", "title": "Развитие платформы", "isRoot": true, "workstream": "platform"})
	parentID = parent.ID

	var suggestion RecordSuggestion
	requestJSON(t, client, http.MethodPost, server.URL+"/api/ai/suggest-record", map[string]any{"type": "task", "title": "Доработать карточку"}, http.StatusOK, &suggestion)
	if suggestion.Source != "gemini" || suggestion.ParentID != parent.ID || suggestion.EstimateMinutes != 80 {
		t.Fatalf("gemini suggestion = %#v", suggestion)
	}
	task := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Проверить AI", "description": "Проверить структурированный ответ"})
	var analysis AIRecordAnalysis
	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+task.ID+"/ai-analysis", nil, http.StatusOK, &analysis)
	if analysis.Source != "gemini" || analysis.NextAction != "Проверить результат." || len(analysis.SuggestedLinks) != 1 || analysis.SuggestedLinks[0].Title != parent.Title {
		t.Fatalf("gemini analysis = %#v", analysis)
	}
	var health map[string]any
	requestJSON(t, client, http.MethodGet, server.URL+"/api/ai/health", nil, http.StatusOK, &health)
	if health["providerAvailable"] != true || health["source"] != "gemini" || health["model"] != "test-gemini" {
		t.Fatalf("gemini health = %#v", health)
	}
}

func uploadAttachment(t *testing.T, client *http.Client, url, name string, content []byte) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		t.Fatalf("create file part: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write file part: %v", err)
	}
	_ = writer.Close()
	request, _ := http.NewRequest(http.MethodPost, url, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("upload attachment: %v", err)
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("upload status=%d body=%s", response.StatusCode, responseBody)
	}
}

func assertDownload(t *testing.T, client *http.Client, url, contentType, contains string) {
	t.Helper()
	response, err := client.Get(url)
	if err != nil {
		t.Fatalf("download %s: %v", url, err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK || !strings.Contains(response.Header.Get("Content-Type"), contentType) || !strings.Contains(string(body), contains) {
		t.Fatalf("download %s status=%d type=%q body=%s", url, response.StatusCode, response.Header.Get("Content-Type"), body)
	}
}
