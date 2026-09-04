package app

import "testing"

func TestLifeSettingsPrivateCompareAndSwapAndReplay(t *testing.T) {
	store, server, owner, other := newPersonalPlanningFixture(t)
	_, err := store.db.Exec(`UPDATE users SET bio='Биография не должна перезаписываться' WHERE username='personal_planning'`)
	if err != nil {
		t.Fatal(err)
	}
	input := map[string]any{"birthDate": "2000-02-29", "lifeExpectancyYears": 80, "expectedBirthDate": "", "expectedYears": 100}
	var settings PersonalSettings
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/life/settings", input, 200, &settings)
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/life/settings", input, 200, &settings)
	if settings.BirthDate == nil || *settings.BirthDate != "2000-02-29" || settings.LifeExpectancyYears != 80 {
		t.Fatalf("settings %#v", settings)
	}
	input["lifeExpectancyYears"] = 90
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/life/settings", input, 409, nil)
	var overview PersonalOverview
	requestJSON(t, other, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	if overview.Settings.BirthDate != nil || overview.Settings.LifeExpectancyYears != 100 {
		t.Fatal("other account settings changed")
	}
	var bio string
	if store.db.QueryRow(`SELECT bio FROM users WHERE username='personal_planning'`).Scan(&bio) != nil || bio != "Биография не должна перезаписываться" {
		t.Fatal("map overwrote public profile")
	}
	for _, date := range []string{"2001-02-29", "3000-01-01", "2026-13-01"} {
		input["birthDate"] = date
		requestJSON(t, owner, "PUT", server.URL+"/api/personal/life/settings", input, 400, nil)
	}
}
