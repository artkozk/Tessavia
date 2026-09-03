package app

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestWidgetLayoutNormalizationAndPortableSafety(t *testing.T) {
	input := InterfacePreferences{Layout: InterfaceLayout{Pages: map[string]PageLayout{
		"personal":           {Widgets: []string{"widget:calendar", "widget:calendar", "unknown"}, BlockSpans: map[string]int{"widget:calendar": 5, "notes": 99}, BlockSettings: map[string]PageBlockSettings{"widget:calendar": {Column: 99, Height: 5000, Scale: 180, Format: "circles"}, "private-record-id": {Limit: 8}}},
		"day:personal":       {Widgets: []string{"widget:notes"}},
		"calendar:personal":  {HiddenBlocks: []string{"undated"}},
		"collection:private": {Widgets: []string{"widget:calendar"}},
	}}}
	result := portableInterfacePreferences(input, "desktop")
	page := result.Layout.Pages["personal"]
	if len(page.Widgets) != 1 || page.BlockSpans["widget:calendar"] != 5 || len(page.BlockSpans) != 1 {
		t.Fatalf("widgets/spans: %#v", page)
	}
	settings := page.BlockSettings["widget:calendar"]
	if settings.Column != 12 || settings.Height != 1600 || settings.Scale != 100 || len(page.BlockSettings) != 1 {
		t.Fatalf("geometry: %#v", page.BlockSettings)
	}
	if _, ok := result.Layout.Pages["collection:private"]; ok {
		t.Fatal("private page leaked into a preset")
	}
	if len(result.Layout.Pages["day:personal"].Widgets) != 1 || len(result.Layout.Pages["calendar:personal"].HiddenBlocks) != 1 {
		t.Fatal("calendar/day settings were dropped")
	}
}

func TestNoteScheduleCreationLegacyPatchAndOwnership(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "note-schedule.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, other := testClient(t), testClient(t)
	register(t, owner, server.URL, "note-owner@example.test", "note_owner")
	register(t, other, server.URL, "note-other@example.test", "note_other")
	var note PersonalNote
	requestJSON(t, owner, "POST", server.URL+"/api/personal/notes", map[string]any{"title": "Created today", "body": "Text"}, 201, &note)
	if note.CreatedAt == "" || note.ScheduledDate != nil {
		t.Fatalf("creation default: %#v", note)
	}
	original := note.CreatedAt
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/notes/"+note.ID, map[string]any{"title": note.Title, "body": "Text", "scheduledDate": "2026-09-05"}, 200, &note)
	if note.ScheduledDate == nil || *note.ScheduledDate != "2026-09-05" || note.CreatedAt != original {
		t.Fatalf("reschedule: %#v", note)
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/notes/"+note.ID, map[string]any{"title": note.Title, "body": "Legacy edit"}, 200, &note)
	if note.ScheduledDate == nil || *note.ScheduledDate != "2026-09-05" {
		t.Fatal("old client cleared the date")
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/notes/"+note.ID, map[string]any{"title": note.Title, "scheduledDate": "2026-02-30"}, 400, nil)
	requestJSON(t, other, "PATCH", server.URL+"/api/personal/notes/"+note.ID, map[string]any{"title": "Foreign edit", "scheduledDate": "2026-09-06"}, 404, nil)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/notes", map[string]any{"title": "Invalid date", "scheduledDate": "tomorrow"}, 400, nil)
	var overview PersonalOverview
	requestJSON(t, other, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	if len(overview.Notes) != 0 {
		t.Fatal("private scheduled note leaked")
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/notes/"+note.ID, map[string]any{"title": note.Title, "scheduledDate": ""}, 200, &note)
	if note.ScheduledDate == nil || *note.ScheduledDate != "" || note.CreatedAt != original {
		t.Fatal("explicit unschedule failed or creation changed")
	}
}
