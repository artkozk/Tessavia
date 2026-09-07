package app

import (
	"strings"
	"testing"
)

func TestPersonalPageTitlesPersistButAreNotPublished(t *testing.T) {
	p := normalizePageLayouts(map[string]PageLayout{"reading": {Texts: map[string]string{"heading": "  Моя группа  ", "bad key": "invalid", "long": strings.Repeat("я", 200)}, HiddenFields: []string{"reading-tab:ranking"}}})
	if p["reading"].Texts["heading"] != "Моя группа" || len([]rune(p["reading"].Texts["long"])) != 160 || p["reading"].Texts["bad key"] != "" {
		t.Fatal(p)
	}
	current := InterfacePreferences{Layout: InterfaceLayout{Pages: p}}
	portable := portableInterfacePreferences(current, "desktop")
	for _, page := range portable.Layout.Pages {
		if len(page.Texts) != 0 {
			t.Fatal("personal text published")
		}
	}
	merged := mergePortableInterfacePreferences(current, portable, "desktop")
	if merged.Layout.Pages["reading"].Texts["heading"] != "Моя группа" {
		t.Fatal("preset erased personal heading")
	}
}
