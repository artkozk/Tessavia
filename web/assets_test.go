package web

import (
	"bytes"
	"testing"
)

func TestProgressIndicatorsDoNotRequireInlineStyles(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	if bytes.Contains(app, []byte(`style="width:`)) {
		t.Fatal("progress indicators must not use inline widths because the production CSP blocks inline styles")
	}
	if !bytes.Contains(app, []byte(`<progress`)) {
		t.Fatal("progress indicators must use native progress values")
	}
}

func TestObjectFirstWorkflowAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function navigateToView"),
		[]byte("Правила и критерии"),
		[]byte("data-create-output"),
		[]byte("Продолжить цепочку"),
		[]byte("function renderGraph"),
		[]byte("function renderWorkList"),
		[]byte("function runGlobalSearch"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain object-first workflow marker %q", marker)
		}
	}
	if _, err := Files.ReadFile("fonts/Inter-Regular.woff2"); err != nil {
		t.Fatalf("embedded Inter font missing: %v", err)
	}
	if _, err := Files.ReadFile("fonts/Onest-Variable.ttf"); err != nil {
		t.Fatalf("embedded Onest font missing: %v", err)
	}
	if library, err := Files.ReadFile("vendor/cytoscape-3.34.1.min.js"); err != nil || len(library) < 400_000 {
		t.Fatalf("embedded Cytoscape library missing or incomplete: bytes=%d err=%v", len(library), err)
	}
	if _, err := Files.ReadFile("vendor/CYTOSCAPE-LICENSE.txt"); err != nil {
		t.Fatalf("embedded Cytoscape license missing: %v", err)
	}
}

func TestRefinedInteractionAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function enhanceSelect"),
		[]byte("function renderRecordReadOverview"),
		[]byte("function renderAIAnalysis"),
		[]byte("function graphHierarchyDescendants"),
		[]byte("function saveGraphPositions"),
		[]byte("function bindTemplateDrag"),
		[]byte("pointerDrag"),
		[]byte("sidebar-close"),
		[]byte("/api/section-definitions/reorder"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain refined interaction marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{[]byte("Onest Local"), []byte(".record-dossier"), []byte(".template-trash"), []byte(".custom-select-menu")} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain refined visual marker %q", marker)
		}
	}
}

func TestAutonomousAuditNavigationAndWorkQueueStayUnified(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function sortWorkHierarchy"),
		[]byte("function renderHierarchyPanel"),
		[]byte("work-filter-popover"),
		[]byte("estimateInsight"),
		[]byte("historyScope"),
		[]byte("Срок и приоритет обсуждения"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain autonomous audit marker %q", marker)
		}
	}
	if bytes.Contains(app, []byte("['meeting', 'Встречи', 'calendar', 'Работа']")) {
		t.Fatal("meetings must be a work queue filter, not a duplicate sidebar workspace")
	}
	if bytes.Contains(app, []byte("renderWorkList(); });\n  $$('[data-work-scope]")) {
		t.Fatal("work search must be debounced instead of redrawing synchronously on every character")
	}
}

func TestResearchComparisonAndSafeMarkdownAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function renderMarkdown"),
		[]byte("function markdownShortcutAction"),
		[]byte("function renderResearchComparison"),
		[]byte("function renderResearchOptionCard"),
		[]byte("/research-options"),
		[]byte("DOMPurify.sanitize"),
		[]byte("KeyK: 'link'"),
		[]byte("event.code === 'Enter'"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain research/markdown marker %q", marker)
		}
	}
	for _, asset := range []string{
		"vendor/marked-18.0.9.umd.js",
		"vendor/MARKED-LICENSE.txt",
		"vendor/dompurify-3.4.13.min.js",
		"vendor/DOMPURIFY-LICENSE.txt",
	} {
		body, err := Files.ReadFile(asset)
		if err != nil || len(body) < 500 {
			t.Fatalf("embedded safe markdown asset %s missing or incomplete: bytes=%d err=%v", asset, len(body), err)
		}
	}
}
