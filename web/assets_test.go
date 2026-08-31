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

func TestContinuityAndLiveCollaborationAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function bindWorkingDraft"),
		[]byte("function refreshLiveData"),
		[]byte("data-target-tab"),
		[]byte("state.activeRecordTab = 'overview'"),
		[]byte("sidebar.setPointerCapture"),
		[]byte("workspace.inert"),
		[]byte("graphDragBranch"),
		[]byte("markdownPlain(result.context"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain continuity marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{[]byte(".working-draft-note"), []byte(".sidebar.dragging")} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain continuity marker %q", marker)
		}
	}
}

func TestKnowledgeNavigationGraphBranchesAndChatIdempotencyAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("['research', 'Исследования'"),
		[]byte("['outcomes', 'Решения и выводы'"),
		[]byte("function renderOutcomes"),
		[]byte("function changeRecordParent"),
		[]byte("graph-branch-filter"),
		[]byte("Ветка целиком"),
		[]byte("function arrangeSelectedGraphBranch"),
		[]byte("data-close-chat-threads"),
		[]byte("chatClientNonce"),
		[]byte("chatEmojiCatalog"),
		[]byte("data-chat-video"),
		[]byte("chat-drop-overlay"),
		[]byte("data-chat-audio"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain knowledge refinement marker %q", marker)
		}
	}
	if bytes.Contains(app, []byte("recordStatusLabel(record)")) {
		t.Fatal("record lists must use the existing statusLabel helper; the obsolete helper breaks sidebar navigation")
	}
	index, err := Files.ReadFile("index.html")
	if err != nil {
		t.Fatalf("read index.html: %v", err)
	}
	if !bytes.Contains(index, []byte("20260831-twelve-week-calendar-1")) {
		t.Fatal("12-week calendar release must bump embedded asset URLs so production browsers do not keep stale CSS/JS")
	}
}

func TestTwelveWeekPlanningCalendarAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function renderTwelveWeekCalendar"),
		[]byte("function renderYearCalendar"),
		[]byte("function bindCalendarDnD"),
		[]byte("/api/planning/cycles"),
		[]byte("цель 80%"),
		[]byte("Прошедшие дни зачёркнуты"),
		[]byte("addCalendarDays(cycle.reviewWeekStart, 7)"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain 12-week planning marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{[]byte(".twelve-week-grid"), []byte(".year-calendar"), []byte(".quarter-4"), []byte(".calendar-day.drop-target")} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain planning visual marker %q", marker)
		}
	}
}

func TestProtectedWorkspaceCannotCloseThroughIncidentalNavigation(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("Рабочее окно не закрыто. Используйте кнопку ×"),
		[]byte("protectedWorkspaceDialogs.has(dialog.id)"),
		[]byte("Рабочее окно осталось открытым. Закройте его явной кнопкой ×."),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("protected workspace close guard marker %q is missing", marker)
		}
	}
}

func TestWorkspaceDialogsProtectDraftsAndScrollbars(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function pointerIsOutsideDialog"),
		[]byte("function bindDialogBackdrop"),
		[]byte("function flushDialogDrafts"),
		[]byte("function dialogHasUnsavedChanges"),
		[]byte("function confirmUnsavedDialog"),
		[]byte("function requestDialogClose"),
		[]byte("function preventImplicitWorkspaceSubmit"),
		[]byte("window.addEventListener('beforeunload'"),
		[]byte("event.stopPropagation();\n      closeCustomSelects();"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain dialog stability marker %q", marker)
		}
	}
	for _, unsafe := range [][]byte{
		[]byte("event.target === $('#record-dialog')"),
		[]byte("event.target === $('#create-dialog')"),
		[]byte("event.target === $('#notebook-dialog')"),
	} {
		if bytes.Contains(app, unsafe) {
			t.Fatalf("working dialogs must not close from ambiguous dialog-surface clicks: %q", unsafe)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{[]byte(".dialog-close-guard"), []byte("dialog.dismiss-attention")} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain dialog protection marker %q", marker)
		}
	}
}

func TestQualityCapacityAndSyncAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("['quality', 'Качество базы'"),
		[]byte("function syncProjectChanges"),
		[]byte("/api/sync?"),
		[]byte("function renderQuality"),
		[]byte("Недельная загрузка"),
		[]byte("id=\"capacity-form\""),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain productivity marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte(".quality-summary"),
		[]byte(".quality-row"),
		[]byte(".weekly-capacity"),
		[]byte(".person-load.capacity-overload"),
	} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain productivity marker %q", marker)
		}
	}
}

func TestBlockersAndKnowledgeProvenanceAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function activeBlockers"),
		[]byte("function renderBlockersPanel"),
		[]byte("function knowledgeReviewState"),
		[]byte("businessSourceExcerpt"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain blockers and provenance marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte(".active-blockers-panel"),
		[]byte(".kanban-blocker"),
		[]byte(".principle-item.review-overdue"),
	} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain blockers and provenance marker %q", marker)
		}
	}
}

func TestBusinessMemoryAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function renderValidation"),
		[]byte("function renderBusinessDetailsRead"),
		[]byte("function activityIsSafelyUndoable"),
		[]byte("data-triage-inbox"),
		[]byte("decision-lifecycle"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain business memory marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte(".validation-summary"),
		[]byte(".business-read"),
		[]byte(".undo-note"),
	} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain business memory marker %q", marker)
		}
	}
}

func TestMobileReliabilityAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function closeGlobalSearch"),
		[]byte("sidebar.inert = mobile"),
		[]byte("calendar-agenda"),
		[]byte("chat-composer-more"),
		[]byte("function setGraphPanelOpen"),
		[]byte("graphMobileInitialized"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain mobile reliability marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte(".global-search.search-open"),
		[]byte(".calendar-agenda-item"),
		[]byte(".hierarchy-panel > header"),
		[]byte(".chat-composer-actions"),
	} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain mobile reliability marker %q", marker)
		}
	}
}
