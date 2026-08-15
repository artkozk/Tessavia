package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestResearchComparisonWorkflow(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "research-comparison.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "founder@example.test", "founder")

	research := createRecord(t, client, server.URL, map[string]any{
		"type": "research", "title": "Выбор сервера", "description": "Сравнить варианты инфраструктуры",
	})

	var comparison ResearchComparison
	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+research.ID+"/research-fields", map[string]any{
		"name": "Цена в месяц", "fieldType": "number",
	}, http.StatusCreated, &comparison)
	if len(comparison.Fields) != 1 || comparison.Fields[0].Name != "Цена в месяц" {
		t.Fatalf("created fields = %#v", comparison.Fields)
	}
	fieldID := comparison.Fields[0].ID

	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+research.ID+"/research-options", map[string]any{
		"title": "Timeweb Cloud", "rating": 8.5,
		"summaryMd": "## Подходит для старта\n\nУправляемый облачный сервер.",
		"prosMd":    "- Понятная панель\n- Российские дата-центры",
		"consMd":    "- Дороже unmanaged VPS",
		"notesMd":   "> **Примечание:** проверить резервные копии",
		"values":    map[string]string{fieldID: "1890"},
	}, http.StatusCreated, &comparison)
	if len(comparison.Options) != 1 || comparison.Options[0].Rating != 8.5 || comparison.Options[0].Values[fieldID] != "1890" {
		t.Fatalf("created options = %#v", comparison.Options)
	}
	option := comparison.Options[0]

	var relations struct {
		Links           []RecordLink             `json:"links"`
		ResearchOptions []ResearchRelationOption `json:"researchOptions"`
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/records/"+research.ID+"/relations", nil, http.StatusOK, &relations)
	if len(relations.Links) != 0 || len(relations.ResearchOptions) != 1 || relations.ResearchOptions[0].ID != option.ID {
		t.Fatalf("research relations = %#v", relations)
	}

	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/"+research.ID+"/research-options/"+option.ID, map[string]any{
		"title": "Timeweb Cloud", "rating": 9,
		"summaryMd": option.SummaryMD, "prosMd": option.ProsMD, "consMd": option.ConsMD, "notesMd": option.NotesMD,
		"values": map[string]string{fieldID: "1690"}, "expectedUpdatedAt": option.UpdatedAt,
		"reason": "Нашли подходящий тариф",
	}, http.StatusOK, &comparison)
	if comparison.Options[0].Rating != 9 || comparison.Options[0].Values[fieldID] != "1690" {
		t.Fatalf("updated option = %#v", comparison.Options[0])
	}
	updatedOption := comparison.Options[0]
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/"+research.ID+"/research-options/"+option.ID, map[string]any{
		"title": updatedOption.Title, "rating": updatedOption.Rating,
		"summaryMd": updatedOption.SummaryMD, "prosMd": updatedOption.ProsMD, "consMd": updatedOption.ConsMD, "notesMd": updatedOption.NotesMD,
		"values": map[string]string{fieldID: "1690"}, "expectedUpdatedAt": updatedOption.UpdatedAt,
	}, http.StatusOK, &comparison)
	var updateEvents int
	var updateDetails string
	if err := store.db.QueryRow(`SELECT COUNT(*), COALESCE(MAX(details_json), '') FROM activity WHERE entity_id = ? AND action = 'research_option_updated'`, research.ID).Scan(&updateEvents, &updateDetails); err != nil {
		t.Fatalf("load option update history: %v", err)
	}
	if updateEvents != 1 {
		t.Fatalf("no-op update created history event: %d", updateEvents)
	}
	var details map[string]any
	if err := json.Unmarshal([]byte(updateDetails), &details); err != nil {
		t.Fatalf("decode option update history: %v", err)
	}
	if _, ok := details["rating"].(map[string]any); !ok {
		t.Fatalf("rating change is missing: %#v", details)
	}
	if _, ok := details["Параметр: Цена в месяц"].(map[string]any); !ok {
		t.Fatalf("custom field change is missing: %#v", details)
	}
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/"+research.ID+"/research-options/"+option.ID, map[string]any{
		"title": "Timeweb Cloud", "rating": 7,
		"summaryMd": option.SummaryMD, "prosMd": option.ProsMD, "consMd": option.ConsMD, "notesMd": option.NotesMD,
		"values": map[string]string{fieldID: "1690"}, "expectedUpdatedAt": option.UpdatedAt,
	}, http.StatusConflict, nil)

	var search []SearchResult
	requestJSON(t, client, http.MethodGet, server.URL+"/api/search?q=Timeweb", nil, http.StatusOK, &search)
	if len(search) == 0 || search[0].EntityKind != "research_option" || search[0].RecordID != research.ID || search[0].ResearchOptionID != option.ID {
		t.Fatalf("research option search = %#v", search)
	}

	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+research.ID+"/research-options/"+option.ID+"/archive", map[string]any{
		"reason": "Вариант больше не рассматривается",
	}, http.StatusOK, &comparison)
	if len(comparison.Options) != 0 {
		t.Fatalf("active options after archive = %#v", comparison.Options)
	}
	var archived, events int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM research_options WHERE id = ? AND status = 'archived'`, option.ID).Scan(&archived); err != nil {
		t.Fatalf("count archived option: %v", err)
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_id = ? AND action LIKE 'research_%'`, research.ID).Scan(&events); err != nil {
		t.Fatalf("count research activity: %v", err)
	}
	if archived != 1 || events != 4 {
		t.Fatalf("archive/history archived=%d events=%d", archived, events)
	}
}
