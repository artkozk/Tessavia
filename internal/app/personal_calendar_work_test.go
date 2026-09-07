package app

import (
	"net/http"
	"testing"
	"time"
)

func TestCalendarPairsBoundariesAndStableConsent(t *testing.T) {
	instant := func(value string) time.Time {
		x, e := time.Parse(time.RFC3339, value)
		if e != nil {
			t.Fatal(e)
		}
		return x
	}
	a := calendarBusyItem{ID: "a", Kind: "personal", Start: instant("2026-09-09T09:00:00Z"), End: instant("2026-09-09T10:00:00Z")}
	b := calendarBusyItem{ID: "b", Kind: "work", Start: a.End, End: instant("2026-09-09T11:00:00Z")}
	start, end := a.Start.Add(-time.Hour), b.End.Add(time.Hour)
	if len(calendarConflictPairs([]calendarBusyItem{a, b}, start, end)) != 0 {
		t.Fatal("touching intervals conflict")
	}
	b.Start = a.End.Add(-30 * time.Minute)
	pairs := calendarConflictPairs([]calendarBusyItem{a, b}, start, end)
	if len(pairs) != 1 || pairs[0].End.Sub(pairs[0].Start) != 30*time.Minute {
		t.Fatal(pairs)
	}
	b.Title = "Renamed"
	a.Title = "Another title"
	again := calendarConflictPairs([]calendarBusyItem{b, a}, start.Add(-24*time.Hour), end.Add(24*time.Hour))
	if pairs[0].ID != again[0].ID {
		t.Fatal("label, order or viewport invalidated consent")
	}
	b.End = b.End.Add(time.Minute)
	if pairs[0].ID == calendarConflictPairs([]calendarBusyItem{a, b}, start, end)[0].ID {
		t.Fatal("changed interval retained consent")
	}
}

func TestPersonalWorkCalendarConsentPrivacyAndRevocation(t *testing.T) {
	store, server, ownerClient, otherClient := newPersonalPlanningFixture(t)
	var owner, other User
	requestJSON(t, ownerClient, "GET", server.URL+"/api/me", nil, 200, &owner)
	requestJSON(t, otherClient, "GET", server.URL+"/api/me", nil, 200, &other)
	var project Workspace
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Calendar project"}, 201, &project)
	var task Record
	requestWorkspaceJSON(t, ownerClient, "POST", server.URL+"/api/records", project.ID, map[string]any{"type": "task", "title": "Assigned work", "ownerId": owner.ID, "dueAt": "2026-09-09T18:00:00Z"}, 201, &task)
	var plan PersonalPlan
	requestJSON(t, ownerClient, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Private visit", "itemKind": "event", "startsAt": "2026-09-09T09:00:00Z", "endsAt": "2026-09-09T11:00:00Z"}, 201, &plan)
	url := server.URL + "/api/personal/calendar?from=2026-09-01&to=2026-10-01&timezone=UTC"
	block := server.URL + "/api/personal/calendar/work/" + task.ID
	save := map[string]any{"startsAt": "2026-09-09T10:00:00Z", "endsAt": "2026-09-09T12:00:00Z", "expectedUpdatedAt": ""}
	requestJSON(t, otherClient, "PUT", block, save, 404, nil)
	requestJSON(t, ownerClient, "PUT", block, save, 200, nil)
	var out calendarOverview
	requestJSON(t, ownerClient, "GET", url, nil, 200, &out)
	if len(out.Work) != 1 || len(out.Conflicts) != 1 || out.Work[0].DueAt != "2026-09-09T18:00:00Z" {
		t.Fatalf("wrong overview: %#v", out)
	}
	version, conflict := out.Work[0].UpdatedAt, out.Conflicts[0].ID
	confirm := server.URL + "/api/personal/calendar/confirmations?from=2026-09-01&to=2026-10-01&timezone=UTC"
	requestJSON(t, otherClient, "GET", url, nil, 200, &out)
	if len(out.Work) != 0 || len(out.Conflicts) != 0 {
		t.Fatal("private schedule leaked")
	}
	requestJSON(t, otherClient, "PUT", confirm, map[string]any{"id": conflict, "confirmed": true}, 409, nil)
	requestJSON(t, ownerClient, "PUT", confirm, map[string]any{"id": conflict, "confirmed": true}, 200, nil)
	requestJSON(t, ownerClient, "GET", url, nil, 200, &out)
	if !out.Conflicts[0].Confirmed {
		t.Fatal("confirmation lost")
	}
	requestJSON(t, ownerClient, "PUT", confirm, map[string]any{"id": conflict, "confirmed": false}, 200, nil)
	requestJSON(t, ownerClient, "GET", url, nil, 200, &out)
	if out.Conflicts[0].Confirmed {
		t.Fatal("confirmation not reversible")
	}
	requestJSON(t, ownerClient, "PUT", confirm, map[string]any{"id": conflict, "confirmed": true}, 200, nil)
	save["startsAt"] = "2026-09-09T10:30:00Z"
	requestJSON(t, ownerClient, "PUT", block, save, 409, nil)
	save["expectedUpdatedAt"] = version
	requestJSON(t, ownerClient, "PUT", block, save, 200, nil)
	requestJSON(t, ownerClient, "PUT", confirm, map[string]any{"id": conflict, "confirmed": true}, 409, nil)
	requestJSON(t, ownerClient, "GET", url, nil, 200, &out)
	if out.Conflicts[0].Confirmed || out.Conflicts[0].ID == conflict {
		t.Fatal("old consent applied to moved time")
	}
	if _, err := store.db.Exec(`UPDATE records SET progress=100 WHERE id=?`, task.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, ownerClient, "GET", url, nil, 200, &out)
	if len(out.Conflicts) != 0 || out.Work[0].Status != "completed" {
		t.Fatal("finished work still reserves time")
	}
	if _, err := store.db.Exec(`UPDATE records SET status='review' WHERE id=?`, task.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, ownerClient, "GET", url, nil, 200, &out)
	if len(out.Conflicts) != 1 {
		t.Fatal("work awaiting review lost its time")
	}
	if _, err := store.db.Exec(`UPDATE workspace_members SET status='suspended' WHERE workspace_id=? AND user_id=?`, project.ID, owner.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, ownerClient, "GET", url, nil, 200, &out)
	if len(out.Work) != 0 || len(out.Conflicts) != 0 {
		t.Fatal("revoked project leaked")
	}
	requestJSON(t, ownerClient, "PUT", block, save, 404, nil)
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/calendar?from=2026-02-30&to=2026-03-01", nil, 400, nil)
}

func TestCalendarAllDayDSTAndDeadlineDoesNotReserveTime(t *testing.T) {
	_, server, owner, _ := newPersonalPlanningFixture(t)
	var project Workspace
	requestJSON(t, owner, "POST", server.URL+"/api/workspaces", map[string]any{"name": "DST work"}, 201, &project)
	var task Record
	requestWorkspaceJSON(t, owner, "POST", server.URL+"/api/records", project.ID, map[string]any{"type": "task", "title": "Deadline only", "dueAt": "2026-03-29T12:00:00Z"}, 201, &task)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "All day", "itemKind": "event", "startDate": "2026-03-29", "endDate": "2026-03-29"}, 201, nil)
	url := server.URL + "/api/personal/calendar?from=2026-03-29&to=2026-03-30&timezone=Europe%2FBerlin"
	var out calendarOverview
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if len(out.Conflicts) != 0 {
		t.Fatal("deadline invented busy time")
	}
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/calendar/work/"+task.ID, map[string]any{"startsAt": "2026-03-29T21:30:00Z", "endsAt": "2026-03-29T22:30:00Z"}, 200, nil)
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if len(out.Conflicts) != 1 || out.Conflicts[0].End.Sub(out.Conflicts[0].Start) != 30*time.Minute {
		t.Fatalf("wrong DST overlap %#v", out)
	}
}
