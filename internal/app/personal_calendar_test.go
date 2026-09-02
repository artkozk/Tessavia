package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"
)

func TestPersonalCalendarDates(t *testing.T) {
	ptr := func(s string) *string { return &s }
	for _, value := range []personalPlanInput{
		{StartDate: ptr("2026-02-30")},
		{EndDate: ptr("2026-09-02")},
		{StartDate: ptr("2026-09-05"), EndDate: ptr("2026-09-04")},
		{StartDate: ptr("2026-09-05"), DueAt: ptr("2026-09-05T10:00:00Z")},
		{ColorKey: ptr("unknown")},
	} {
		if _, err := value.calendarFields(PersonalPlan{ColorKey: "green"}); err == nil {
			t.Fatalf("invalid calendar accepted: %#v", value)
		}
	}
	plan, err := (personalPlanInput{StartDate: ptr("2028-02-29")}).calendarFields(PersonalPlan{ColorKey: "green"})
	if err != nil || plan.EndDate != "2028-02-29" {
		t.Fatalf("all-day date: %#v %v", plan, err)
	}
	preserved, err := (personalPlanInput{}).calendarFields(plan)
	if err != nil || preserved.StartDate != plan.StartDate {
		t.Fatalf("legacy update lost date: %#v %v", preserved, err)
	}
}

func TestCalendarNotesAreAtomicAndRespectProjectAccess(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "calendar.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, otherClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "calendar@example.test", "calendar_owner")
	register(t, otherClient, server.URL, "calendar-other@example.test", "calendar_other")
	var plan PersonalPlan
	requestJSON(t, ownerClient, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Weekend", "startDate": "2026-09-05", "endDate": "2026-09-06", "colorKey": "blue"}, 201, &plan)
	if plan.DueAt != nil || plan.EndDate != "2026-09-06" {
		t.Fatalf("range: %#v", plan)
	}
	requestJSON(t, otherClient, "POST", server.URL+"/api/personal/notes", map[string]any{"title": "Foreign note", "body": "Not allowed", "linkPlanId": plan.ID}, 404, nil)
	var otherOverview PersonalOverview
	requestJSON(t, otherClient, "GET", server.URL+"/api/personal/overview", nil, 200, &otherOverview)
	if len(otherOverview.Notes) != 0 {
		t.Fatal("failed link left an orphan note")
	}
	var note PersonalNote
	requestJSON(t, ownerClient, "POST", server.URL+"/api/personal/notes", map[string]any{"title": "Shopping", "body": "- Coal\n- Food", "linkPlanId": plan.ID}, 201, &note)
	var overview PersonalOverview
	requestJSON(t, ownerClient, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	if len(overview.Links) != 1 || overview.Links[0].SourceTitle != "Shopping" || overview.Links[0].TargetTitle != "Weekend" {
		t.Fatalf("note link: %#v", overview.Links)
	}
	var repeated PersonalLink
	requestJSON(t, ownerClient, "POST", server.URL+"/api/personal/links", map[string]any{"sourceType": "plan", "sourceId": plan.ID, "targetType": "note", "targetId": note.ID}, 200, &repeated)
	if repeated.ID != overview.Links[0].ID {
		t.Fatal("reverse link duplicated")
	}
	oldVersion := plan.UpdatedAt
	requestJSON(t, ownerClient, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "notes": "Details", "status": "done", "expectedUpdatedAt": oldVersion}, 200, &plan)
	if plan.StartDate != "2026-09-05" || plan.ColorKey != "blue" {
		t.Fatalf("status update lost dates/color: %#v", plan)
	}
	requestJSON(t, ownerClient, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "status": "planned", "expectedUpdatedAt": oldVersion}, 409, nil)

	var workspace Workspace
	requestJSON(t, otherClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Hidden project"}, 201, &workspace)
	var record Record
	requestWorkspaceJSON(t, otherClient, "POST", server.URL+"/api/records", workspace.ID, map[string]any{"type": "task", "title": "SecretCalendarWork"}, 201, &record)
	var suggestions []PersonalSuggestion
	requestJSON(t, ownerClient, "GET", server.URL+"/api/personal/suggestions?q="+url.QueryEscape("SecretCalendarWork"), nil, 200, &suggestions)
	if len(suggestions) != 0 {
		t.Fatal("suggestions leaked inaccessible project")
	}
	linkPayload := map[string]any{"sourceType": "note", "sourceId": note.ID, "targetType": "record", "targetId": record.ID}
	requestJSON(t, ownerClient, "POST", server.URL+"/api/personal/links", linkPayload, 404, nil)
	_, err = store.db.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,status,joined_at) VALUES(?,?,'member','active',?)`, workspace.ID, owner.ID, nowText())
	if err != nil {
		t.Fatal(err)
	}
	requestJSON(t, ownerClient, "POST", server.URL+"/api/personal/links", linkPayload, 201, nil)
	requestJSON(t, ownerClient, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	if len(overview.Links) != 2 {
		t.Fatal("authorized link missing")
	}
	foundProject := false
	for _, link := range overview.Links {
		if link.TargetWorkspaceID == workspace.ID {
			foundProject = true
		}
	}
	if !foundProject {
		t.Fatal("cross-project navigation metadata missing")
	}
	_, err = store.db.Exec(`DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspace.ID, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	requestJSON(t, ownerClient, "GET", server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	if len(overview.Links) != 1 {
		t.Fatal("revoked project still exposed by personal links")
	}
	requestJSON(t, ownerClient, "DELETE", server.URL+"/api/personal/plans/"+plan.ID, nil, 204, nil)
	requestJSON(t, ownerClient, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	if len(overview.Links) != 0 || len(overview.Notes) != 1 {
		t.Fatal("archiving a plan must preserve its note and hide its links")
	}
}
