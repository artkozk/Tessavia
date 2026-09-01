package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func requestWorkspaceJSON(t *testing.T, client *http.Client, method, url, workspaceID string, body any, wantStatus int, target any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		reader = bytes.NewReader(payload)
	}
	request, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	request.Header.Set("X-Workspace-ID", workspaceID)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("request %s %s: %v", method, url, err)
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode != wantStatus {
		t.Fatalf("%s %s status=%d want=%d body=%s", method, url, response.StatusCode, wantStatus, responseBody)
	}
	if target != nil && len(responseBody) > 0 {
		if err := json.Unmarshal(responseBody, target); err != nil {
			t.Fatalf("decode response %s: %v; body=%s", url, err, responseBody)
		}
	}
}

func TestWorkspaceCRMConstructorIsIsolatedAndConfigurable(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "crm.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()

	ownerClient := testClient(t)
	partnerClient := testClient(t)
	outsiderClient := testClient(t)
	owner := register(t, ownerClient, server.URL, "crm-owner@example.test", "crm_owner")
	partner := register(t, partnerClient, server.URL, "crm-partner@example.test", "crm_partner")
	outsider := register(t, outsiderClient, server.URL, "crm-outsider@example.test", "crm_outsider")

	mainRecord := createRecord(t, ownerClient, server.URL, map[string]any{"type": "task", "title": "Работа основной команды"})
	var crmWorkspace Workspace
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{
		"name": "CRM", "description": "Первая клиентская интеграция", "memberIds": []int64{partner.ID},
	}, http.StatusCreated, &crmWorkspace)
	if crmWorkspace.Kind != "team" || crmWorkspace.Role != "owner" || crmWorkspace.ID == "" {
		t.Fatalf("crm workspace = %#v", crmWorkspace)
	}

	requestWorkspaceJSON(t, outsiderClient, http.MethodGet, server.URL+"/api/records", crmWorkspace.ID, nil, http.StatusForbidden, nil)

	var collection WorkspaceCollection
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/collections", crmWorkspace.ID, map[string]any{
		"name": "Лиды и задачи", "description": "Настраиваемая CRM-доска", "cardLabel": "Задача", "defaultRecordType": "task",
	}, http.StatusCreated, &collection)
	if len(collection.Stages) != 4 || collection.Stages[0].Category != "backlog" || collection.Stages[3].Category != "done" {
		t.Fatalf("default stages = %#v", collection.Stages)
	}

	var field CollectionField
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/collections/"+collection.ID+"/fields", crmWorkspace.ID, map[string]any{
		"name": "Тип", "fieldType": "select", "required": true, "showOnCard": true, "options": []string{"BUG", "FEATURE"},
	}, http.StatusCreated, &field)
	if len(field.Options) != 2 || field.Key == "" {
		t.Fatalf("custom field = %#v", field)
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/collections/"+collection.ID, crmWorkspace.ID, map[string]any{
		"name": "CRM клиента", "description": collection.Description, "cardLabel": collection.CardLabel,
	}, http.StatusOK, &collection)
	requestWorkspaceJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/collections/"+collection.ID+"/stages/"+collection.Stages[1].ID, crmWorkspace.ID, map[string]any{
		"name": "Новая", "category": collection.Stages[1].Category, "colorKey": collection.Stages[1].ColorKey,
	}, http.StatusOK, &collection.Stages[1])
	requestWorkspaceJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/collections/"+collection.ID+"/fields/"+field.ID, crmWorkspace.ID, map[string]any{
		"name": "Категория", "required": field.Required, "showOnCard": field.ShowOnCard,
	}, http.StatusOK, &field)
	if collection.Name != "CRM клиента" || collection.Stages[1].Name != "Новая" || field.Name != "Категория" {
		t.Fatalf("renamed configuration collection=%q stage=%q field=%q", collection.Name, collection.Stages[1].Name, field.Name)
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/records", crmWorkspace.ID, map[string]any{
		"type": "task", "title": "Карточка с чужим полем", "collectionId": collection.ID,
		"customFields": map[string]any{"foreign-field": "не должно потеряться молча"},
	}, http.StatusBadRequest, nil)

	var crmRecord Record
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/records", crmWorkspace.ID, map[string]any{
		"type": "task", "title": "Исправить фильтр", "ownerId": partner.ID,
		"collectionId": collection.ID, "stageId": collection.Stages[1].ID,
		"customFields": map[string]any{field.ID: field.Options[1].ID},
	}, http.StatusCreated, &crmRecord)
	if crmRecord.WorkspaceID != crmWorkspace.ID || crmRecord.CollectionID != collection.ID || crmRecord.StageID != collection.Stages[1].ID || crmRecord.CustomFields[field.ID] != field.Options[1].ID {
		t.Fatalf("crm record = %#v", crmRecord)
	}
	var dateField CollectionField
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/collections/"+collection.ID+"/fields", crmWorkspace.ID, map[string]any{
		"name": "Дата контакта", "fieldType": "date", "showOnCard": false,
	}, http.StatusCreated, &dateField)
	requestWorkspaceJSON(t, ownerClient, http.MethodPut, server.URL+"/api/records/"+crmRecord.ID+"/custom-fields", crmWorkspace.ID, map[string]any{
		"values": map[string]any{field.ID: field.Options[1].ID, dateField.ID: "02.09.2026"},
	}, http.StatusBadRequest, nil)
	requestWorkspaceJSON(t, ownerClient, http.MethodPut, server.URL+"/api/records/"+crmRecord.ID+"/custom-fields", crmWorkspace.ID, map[string]any{
		"values": map[string]any{field.ID: field.Options[1].ID, dateField.ID: "2026-09-02"},
	}, http.StatusOK, &crmRecord)
	if crmRecord.CustomFields[dateField.ID] != "2026-09-02" {
		t.Fatalf("date field = %#v", crmRecord.CustomFields[dateField.ID])
	}
	var tagsField CollectionField
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/collections/"+collection.ID+"/fields", crmWorkspace.ID, map[string]any{
		"name": "Метки", "fieldType": "multi_select", "options": []string{"Срочно", "Клиент"},
	}, http.StatusCreated, &tagsField)
	requestWorkspaceJSON(t, ownerClient, http.MethodPut, server.URL+"/api/records/"+crmRecord.ID+"/custom-fields", crmWorkspace.ID, map[string]any{
		"values": map[string]any{tagsField.ID: []string{tagsField.Options[0].ID, tagsField.Options[0].ID}},
	}, http.StatusOK, &crmRecord)
	tags, ok := crmRecord.CustomFields[tagsField.ID].([]any)
	if !ok || len(tags) != 1 || tags[0] != tagsField.Options[0].ID {
		t.Fatalf("multi-select must be deduplicated: %#v", crmRecord.CustomFields[tagsField.ID])
	}
	var quality QualityReport
	requestWorkspaceJSON(t, ownerClient, http.MethodGet, server.URL+"/api/quality", crmWorkspace.ID, nil, http.StatusOK, &quality)
	if quality.Counts["orphan"] != 0 {
		t.Fatalf("collection cards must not be reported as orphans: %#v", quality.Issues)
	}

	var crmRecords []Record
	requestWorkspaceJSON(t, partnerClient, http.MethodGet, server.URL+"/api/records?includeArchived=true", crmWorkspace.ID, nil, http.StatusOK, &crmRecords)
	if len(crmRecords) != 1 || crmRecords[0].ID != crmRecord.ID {
		t.Fatalf("crm records = %#v", crmRecords)
	}
	var mainRecords []Record
	requestWorkspaceJSON(t, ownerClient, http.MethodGet, server.URL+"/api/records?includeArchived=true", mainRecord.WorkspaceID, nil, http.StatusOK, &mainRecords)
	if len(mainRecords) != 1 || mainRecords[0].ID != mainRecord.ID {
		t.Fatalf("main workspace leaked records: %#v", mainRecords)
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/records/"+crmRecord.ID, crmWorkspace.ID, map[string]any{
		"ownerId": outsider.ID,
	}, http.StatusBadRequest, nil)
	exportRequest, _ := http.NewRequest(http.MethodGet, server.URL+"/api/export", nil)
	exportRequest.Header.Set("X-Workspace-ID", crmWorkspace.ID)
	exportResponse, err := ownerClient.Do(exportRequest)
	if err != nil {
		t.Fatalf("export workspace: %v", err)
	}
	exportBody, _ := io.ReadAll(exportResponse.Body)
	exportResponse.Body.Close()
	if exportResponse.StatusCode != http.StatusOK || !strings.Contains(string(exportBody), "Исправить фильтр") || strings.Contains(string(exportBody), "Работа основной команды") {
		t.Fatalf("isolated export status=%d body=%s", exportResponse.StatusCode, exportBody)
	}

	var completed Record
	requestWorkspaceJSON(t, partnerClient, http.MethodPut, server.URL+"/api/records/"+crmRecord.ID+"/stage", crmWorkspace.ID, map[string]any{
		"stageId": collection.Stages[3].ID,
	}, http.StatusOK, &completed)
	if completed.StageID != collection.Stages[3].ID || completed.Status != "completed" || completed.Progress != 100 || completed.CompletedAt == nil {
		t.Fatalf("completed crm record = %#v", completed)
	}
	if owner.ID == partner.ID {
		t.Fatal("test users unexpectedly share an id")
	}
}
