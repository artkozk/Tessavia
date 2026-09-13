package app

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestPersonalAdaptiveLayoutNormalizationPreservesThreeStates(t *testing.T) {
	for _, raw := range []string{`{}`, `{"adaptiveToday":true}`, `{"adaptiveToday":false}`} {
		var input PageLayout
		if err := json.Unmarshal([]byte(raw), &input); err != nil {
			t.Fatal(err)
		}
		input.ShownBlocks = []string{"summary", "day-project-work", "summary", "invalid key", "<script>"}
		page := normalizePageLayouts(map[string]PageLayout{"personal": input})["personal"]
		encoded, err := json.Marshal(page)
		if err != nil {
			t.Fatal(err)
		}
		var restored PageLayout
		if err := json.Unmarshal(encoded, &restored); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(restored.AdaptiveToday, input.AdaptiveToday) {
			t.Fatalf("legacy/explicit adaptive flag changed: %s => %s", raw, encoded)
		}
		if input.AdaptiveToday == nil && strings.Contains(string(encoded), "adaptiveToday") {
			t.Fatal("legacy profile acquired a flag")
		}
		if !reflect.DeepEqual(restored.ShownBlocks, []string{"summary", "day-project-work"}) {
			t.Fatal("explicit show keys were lost or unsafe keys survived", restored.ShownBlocks)
		}
	}
	var large []string
	for i := 0; i < 110; i++ {
		large = append(large, fmt.Sprintf("block-%d", i))
	}
	page := normalizePageLayouts(map[string]PageLayout{"personal": {ShownBlocks: large}})["personal"]
	if len(page.ShownBlocks) != 100 || page.ShownBlocks[99] != "block-99" {
		t.Fatal("explicit show list must remain bounded and ordered")
	}
}

func TestPersonalAdaptiveLayoutPresetExcludesPrivateBlockKeys(t *testing.T) {
	for _, flag := range []*bool{nil, new(bool)} {
		input := InterfacePreferences{Layout: InterfaceLayout{Pages: map[string]PageLayout{
			"personal": {AdaptiveToday: flag, ShownBlocks: []string{"summary", "private-block-sentinel", "day-project-work", "summary"}, Texts: map[string]string{"heading": "Private heading"}},
		}}}
		page := portableInterfacePreferences(input, "desktop").Layout.Pages["personal"]
		if !reflect.DeepEqual(page.AdaptiveToday, flag) || !reflect.DeepEqual(page.ShownBlocks, []string{"summary", "day-project-work"}) {
			t.Fatal("preset changed adaptive mode or explicit block visibility", page)
		}
		encoded, _ := json.Marshal(page)
		if strings.Contains(string(encoded), "sentinel") || strings.Contains(string(encoded), "Private heading") {
			t.Fatal("preset copied personal wording or custom block keys")
		}
	}
}

func TestPersonalAdaptiveLayoutHTTPDevicesPresetsAndUndo(t *testing.T) {
	f := newPersonalConstructorFixture(t)
	call := func(actor int, method, path string, body, out any) {
		t.Helper()
		status := 200
		if method == "POST" && path == "/api/interface/presets" {
			status = 201
		}
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, f.workspaces[actor].ID, body, status, out)
	}
	adaptive, manual := true, false
	profile := func(flag *bool, shown ...string) InterfacePreferences {
		return InterfacePreferences{Layout: InterfaceLayout{Pages: map[string]PageLayout{
			"personal": {AdaptiveToday: flag, ShownBlocks: shown, HiddenBlocks: []string{"life"}, Order: []string{"heading", "notes"}},
		}}}
	}
	call(0, "PUT", "/api/interface/preferences?device=desktop", profile(&adaptive, "summary", "day-project-work"), nil)
	call(0, "PUT", "/api/interface/preferences?device=mobile", profile(&manual, "notes"), nil)
	for _, device := range []string{"desktop", "mobile"} {
		var saved InterfacePreferences
		call(0, "GET", "/api/interface/preferences?device="+device, nil, &saved)
		page := saved.Layout.Pages["personal"]
		wantShown := []string{"summary", "day-project-work"}
		if device == "mobile" {
			wantShown = []string{"notes"}
		}
		if page.AdaptiveToday == nil || *page.AdaptiveToday != (device == "desktop") || !reflect.DeepEqual(page.ShownBlocks, wantShown) || !reflect.DeepEqual(page.HiddenBlocks, []string{"life"}) {
			t.Fatalf("device %s lost adaptive mode or visibility: %#v", device, page)
		}
	}
	var untouched InterfacePreferences
	call(1, "GET", "/api/interface/preferences?device=desktop", nil, &untouched)
	if len(untouched.Layout.Pages) != 0 {
		t.Fatal("personal visibility settings leaked to another account")
	}
	// Recipient starts with a legacy manual profile. Applying and undoing a preset
	// must restore absence of the flag, not turn that old profile adaptive.
	call(1, "PUT", "/api/interface/preferences?device=desktop", profile(nil, "notes"), nil)
	var preset InterfacePreset
	call(0, "POST", "/api/interface/presets", map[string]any{"name": "Adaptive home", "visibility": "public"}, &preset)
	var applied interfacePresetApplicationResponse
	call(1, "POST", "/api/interface/presets/"+preset.ID+"/apply", map[string]any{"devices": []string{"desktop", "mobile"}}, &applied)
	for _, device := range []string{"desktop", "mobile"} {
		page := applied.Profiles[device].Layout.Pages["personal"]
		if page.AdaptiveToday == nil || *page.AdaptiveToday != (device == "desktop") || len(page.ShownBlocks) == 0 {
			t.Fatal("preset application lost mode or explicit visibility", device, page)
		}
	}
	call(1, "POST", "/api/interface/preset-applications/"+applied.ApplicationID+"/undo", map[string]any{}, &applied)
	restored := applied.Profiles["desktop"].Layout.Pages["personal"]
	if restored.AdaptiveToday != nil || !reflect.DeepEqual(restored.ShownBlocks, []string{"notes"}) {
		t.Fatal("undo did not restore legacy adaptive mode and explicit visibility", restored)
	}
	if len(applied.Profiles["mobile"].Layout.Pages) != 0 {
		t.Fatal("undo did not restore recipient's empty mobile profile")
	}
}
