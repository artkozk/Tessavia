package web

import (
	"bytes"
	"testing"
)

func TestSidebarStylesTargetTheActualScrollableList(t *testing.T) {
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range []string{
		".sidebar { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; }",
		".project-nav-items { min-height: 0; overflow-x: hidden; overflow-y: auto;",
		"scrollbar-width: thin; scrollbar-color: #52605a transparent;",
		".project-nav-items::-webkit-scrollbar { width: 6px; background: transparent; }",
		".project-nav-items::-webkit-scrollbar-track { background: transparent; }",
		".project-nav-items::-webkit-scrollbar-button { display: none; width: 0; height: 0; }",
		".project-nav-items { scrollbar-width: none; }",
		".project-nav-items::-webkit-scrollbar { display: none; width: 0; }",
	} {
		if !bytes.Contains(styles, []byte(marker)) {
			t.Fatalf("sidebar scroll styling missing: %s", marker)
		}
	}
}

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
		[]byte("function bindReorderList"),
		[]byte("menu.showPopover()"),
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
	if bytes.Count(index, []byte("20260903-collection-heading-1")) != 2 {
		t.Fatal("current release must bump embedded asset URLs so production browsers do not keep stale CSS/JS")
	}
}

func TestPersonalWritingExperienceAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function renderPersonalCreateMenu"),
		[]byte("function personalNoteSheet"),
		[]byte("function bindPersonalNoteSheet"),
		[]byte("history: true, ai: false, expand: false"),
		[]byte("function personalPlanDateFields"),
		[]byte("function renderCalendarPage"),
		[]byte("function openPersonalPlanDetails"),
		[]byte("Новая личная заметка"),
		[]byte("sameTypingGroup"),
		[]byte("personal:${state.me.id}:${kind}"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain personal writing marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{[]byte(".personal-editor-actions"), []byte("#new-record-button"), []byte("display-mode: browser")} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain personal mobile marker %q", marker)
		}
	}
}

func TestTeamAccessAndPersonalizationAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function openTeamSettings"),
		[]byte("function openJoinTeamDialog"),
		[]byte("function openInterfaceSettings"),
		[]byte("/api/auth/register/verify"),
		[]byte("data-configure-navigation"),
		[]byte("data-hide-definition"),
		[]byte("/api/workspace/pages"),
		[]byte("dashboardWidgets"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain team access marker %q", marker)
		}
	}
	index, err := Files.ReadFile("index.html")
	if err != nil {
		t.Fatalf("read index.html: %v", err)
	}
	for _, marker := range [][]byte{[]byte("viewport-fit=cover"), []byte("manifest.webmanifest"), []byte("interface-settings-button")} {
		if !bytes.Contains(index, marker) {
			t.Fatalf("index.html does not contain mobile personalization marker %q", marker)
		}
	}
	if _, err := Files.ReadFile("manifest.webmanifest"); err != nil {
		t.Fatalf("manifest is not embedded: %v", err)
	}
}

func TestProfileAvatarAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function avatarMarkup"),
		[]byte("function uploadProfileAvatar"),
		[]byte("profile-avatar-input"),
		[]byte("/api/me/avatar"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain profile avatar marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{[]byte(".avatar img"), []byte(".profile-photo-editor"), []byte(".profile-avatar-picker")} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain profile avatar marker %q", marker)
		}
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
		[]byte("localDateKey(addCalendarDays(cycle.reviewWeekStart, 7))"),
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

func TestPersonalWorkspaceAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("['personal', 'Личное'"),
		[]byte("function renderPersonal"),
		[]byte("function renderLifeMap"),
		[]byte("function openPersonalEditor"),
		[]byte("function openPersonalLinkDialog"),
		[]byte("/api/personal/overview"),
		[]byte("/api/me/password"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain personal workspace marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{[]byte(".personal-today-grid"), []byte(".habit-week"), []byte(".life-grid"), []byte(".profile-private-fields")} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain personal workspace marker %q", marker)
		}
	}
	index, err := Files.ReadFile("index.html")
	if err != nil {
		t.Fatalf("read index.html: %v", err)
	}
	if !bytes.Contains(index, []byte(`id="personal-dialog"`)) {
		t.Fatal("index.html does not contain the personal editor dialog")
	}
}

func TestWorkspaceKeepsBackdropProtectionButAllowsExplicitEscape(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("const dialog = topOpenDialog();"),
		[]byte("requestDialogClose(dialog);"),
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
		[]byte("function confirmDialogTransition"),
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

func TestMobileLayoutStabilityAssetsAreEmbedded(t *testing.T) {
	app, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("function recordTabItems"),
		[]byte("function recordTabSelect"),
		[]byte("record-tab-select"),
		[]byte("compactGraphViewport"),
		[]byte("cy.nodes().length <= 18"),
	} {
		if !bytes.Contains(app, marker) {
			t.Fatalf("app.js does not contain mobile layout stability marker %q", marker)
		}
	}
	styles, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatalf("read styles.css: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("Mobile layout stability"),
		[]byte("grid-template-columns: 34px minmax(0, 1fr)"),
		[]byte(".record-dialog-header > div:first-child { display: contents; }"),
		[]byte(".record-tabs { display: none; }"),
		[]byte(".outcome-filter, .personal-tabs { scrollbar-width: none; }"),
	} {
		if !bytes.Contains(styles, marker) {
			t.Fatalf("styles.css does not contain mobile layout stability marker %q", marker)
		}
	}
}
