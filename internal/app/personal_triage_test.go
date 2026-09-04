package app

import (
	"testing"
)

func TestPersonalTriagePreservesOriginalLinksAndRetry(t *testing.T) {
	store, server, owner, other := newPersonalPlanningFixture(t)
	base := server.URL + "/api/personal"
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/capture", map[string]any{"body": "Собрать материалы к поездке\nhttps://example.test/route", "requestKey": "a1234567890123456789012345678901"}, 201, &note)
	originalID, originalBody, originalTitle := note.ID, note.Body, note.Title
	var countBefore int
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM records`).Scan(&countBefore)
	input := map[string]any{"requestKey": "triage-retry-key-000001", "expectedUpdatedAt": note.UpdatedAt, "title": "Выбрать маршрут", "notes": "Уточнить пересадки", "date": "2026-09-10"}
	endpoint := base + "/notes/" + note.ID + "/plan"
	requestJSON(t, other, "POST", endpoint, input, 404, nil)
	var plan PersonalPlan
	requestJSON(t, owner, "POST", endpoint, input, 201, &plan)
	if plan.StartDate != "2026-09-10" || plan.EndDate != plan.StartDate || plan.DueAt != nil || plan.Status != "planned" || plan.Title != "Выбрать маршрут" {
		t.Fatalf("triaged plan %#v", plan)
	}
	id := plan.ID
	requestJSON(t, owner, "POST", endpoint, input, 200, &plan)
	if plan.ID != id {
		t.Fatal("duplicate after lost reply")
	}
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID, nil, 200, &note)
	if note.ID != originalID || note.Body != originalBody || note.Title != originalTitle || note.InInbox {
		t.Fatal("triage destroyed original or left inbox")
	}
	var count int
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM personal_links WHERE source_id=? AND target_id=? AND active=1`, note.ID, plan.ID).Scan(&count)
	if count != 1 {
		t.Fatal("missing or repeated provenance link")
	}
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM personal_note_versions WHERE note_id=?`, note.ID).Scan(&count)
	if count < 2 {
		t.Fatal("triage history missing")
	}
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM records`).Scan(&count)
	if count != countBefore {
		t.Fatal("private triage created team data")
	}
	var overview PersonalOverview
	requestJSON(t, other, "GET", base+"/overview", nil, 200, &overview)
	for _, p := range overview.Plans {
		if p.ID == plan.ID {
			t.Fatal("plan leaked")
		}
	}
	for _, link := range overview.Links {
		if link.SourceID == note.ID || link.TargetID == plan.ID {
			t.Fatal("link leaked")
		}
	}
	input["title"] = "Другое действие"
	requestJSON(t, owner, "POST", endpoint, input, 409, nil)
	input["title"] = "Выбрать маршрут"
	requestJSON(t, owner, "DELETE", base+"/notes/"+note.ID, nil, 204, nil)
	requestJSON(t, owner, "POST", endpoint, input, 200, &plan)
}

func TestPersonalTriageRejectsChangedAndArchivedSource(t *testing.T) {
	store, server, owner, _ := newPersonalPlanningFixture(t)
	base := server.URL + "/api/personal"
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/notes", map[string]any{"title": "Исходное", "body": "Текст"}, 201, &note)
	input := map[string]any{"requestKey": "triage-conflict-000001", "expectedUpdatedAt": note.UpdatedAt, "title": "Новое дело"}
	endpoint := base + "/notes/" + note.ID + "/plan"
	requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": "Новая версия", "body": "Исправлено", "expectedUpdatedAt": note.UpdatedAt}, 200, &note)
	requestJSON(t, owner, "POST", endpoint, input, 409, nil)
	input["expectedUpdatedAt"] = note.UpdatedAt
	input["date"] = "2026-02-30"
	requestJSON(t, owner, "POST", endpoint, input, 400, nil)
	input["date"] = ""
	requestJSON(t, owner, "DELETE", base+"/notes/"+note.ID, nil, 204, nil)
	requestJSON(t, owner, "POST", endpoint, input, 404, nil)
	var count int
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM personal_plans WHERE title='Новое дело'`).Scan(&count)
	if count != 0 {
		t.Fatal("failed triage partially created a plan")
	}
}
