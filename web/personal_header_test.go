package web

import (
	"bytes"
	"testing"
)

func TestPersonalHeaderActionsShareAlignmentAndHeight(t *testing.T) {
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, rule := range []string{
		".personal-create-menu { position: relative; align-self: auto; }",
		".personal-create-menu > summary { min-height: 44px; display: flex;",
		".personal-heading > [data-personal-calendar] { min-height: 44px; white-space: nowrap; }",
		".workspace-page-grid .personal-heading > .personal-create-menu, .workspace-page-grid .personal-heading > [data-personal-calendar] { min-width: max-content; }",
	} {
		if !bytes.Contains(styles, []byte(rule)) {
			t.Fatalf("missing personal header alignment rule: %s", rule)
		}
	}
}
