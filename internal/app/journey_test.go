package app

import "testing"

func TestJourneyPreferencesArePrivateAndMergeDismissals(t *testing.T) {
	_, server, owner, other := newPersonalPlanningFixture(t)
	path := server.URL + "/api/me/journey"
	var prefs journeyPreferences
	requestJSON(t, owner, "GET", path, nil, 200, &prefs)
	if !prefs.TipsEnabled || len(prefs.Dismissed) != 0 {
		t.Fatal(prefs)
	}
	requestJSON(t, owner, "PATCH", path, map[string]any{"tipsEnabled": false, "dismiss": "constructor"}, 200, &prefs)
	requestJSON(t, owner, "PATCH", path, map[string]any{"dismiss": "relationships"}, 200, &prefs)
	requestJSON(t, owner, "PATCH", path, map[string]any{"dismiss": "constructor"}, 200, &prefs)
	requestJSON(t, owner, "GET", path, nil, 200, &prefs)
	if prefs.TipsEnabled || len(prefs.Dismissed) != 2 {
		t.Fatal("settings or dismissals overwritten", prefs)
	}
	requestJSON(t, other, "GET", path, nil, 200, &prefs)
	if !prefs.TipsEnabled || len(prefs.Dismissed) != 0 {
		t.Fatal("preferences leaked", prefs)
	}
	requestJSON(t, owner, "PATCH", path, map[string]any{"dismiss": "arbitrary-private-text"}, 400, nil)
	requestJSON(t, owner, "PATCH", path, map[string]any{"tipsEnabled": true}, 200, &prefs)
	if !prefs.TipsEnabled || len(prefs.Dismissed) != 2 {
		t.Fatal("reenabling erased prior dismissals", prefs)
	}
}
