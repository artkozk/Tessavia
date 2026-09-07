package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"business-control/web"
	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "business_session"

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,32}$`)
var questionListPrefixPattern = regexp.MustCompile(`^\s*(?:[-*]\s+|[0-9]+[.)]\s+)`)

var recordTypes = map[string]struct{}{
	"goal": {}, "task": {}, "idea": {}, "criterion": {}, "research": {},
	"decision": {}, "disagreement": {}, "document": {}, "question_set": {},
	"meeting": {}, "risk": {}, "hypothesis": {}, "experiment": {}, "inbox": {},
}

var recordStatuses = map[string]struct{}{
	"draft": {}, "inbox": {}, "review": {}, "main": {}, "rejected": {},
	"planned": {}, "in_progress": {}, "blocked": {}, "completed": {},
	"postponed": {}, "cancelled": {}, "archived": {},
}

type Server struct {
	store       *Store
	config      Config
	mux         *http.ServeMux
	aiClient    *http.Client
	aiClients   []*http.Client
	aiCursor    atomic.Uint32
	aiClientErr error
	pageEpoch   string
}

type contextKey string

const userContextKey contextKey = "user"

func NewServer(store *Store, config Config) http.Handler {
	proxyURLs := config.AIProxyURLs
	if len(proxyURLs) == 0 && strings.TrimSpace(config.AIProxyURL) != "" {
		proxyURLs = []string{config.AIProxyURL}
	}
	aiClients, aiClientErr := newAIHTTPClients(proxyURLs)
	var aiClient *http.Client
	if len(aiClients) > 0 {
		aiClient = aiClients[0]
	}
	server := &Server{store: store, config: config, mux: http.NewServeMux(), aiClient: aiClient, aiClients: aiClients, aiClientErr: aiClientErr, pageEpoch: nowText()}
	server.routes()
	return server.securityHeaders(server.mux)
}

func (s *Server) routes() {
	s.mux.Handle("GET /api/personal/habits/{id}/reminder", s.requireAuth(http.HandlerFunc(s.handleHabitReminderPreference)))
	s.mux.Handle("PUT /api/personal/habits/{id}/reminder", s.requireAuth(http.HandlerFunc(s.handleHabitReminderPreference)))
	s.mux.Handle("GET /api/personal/reminders", s.requireAuth(http.HandlerFunc(s.handlePersonalReminders)))
	s.mux.Handle("GET /api/personal/plans/{id}/reminder", s.requireAuth(http.HandlerFunc(s.handlePersonalPlanReminder)))
	s.mux.Handle("PUT /api/personal/plans/{id}/reminder", s.requireAuth(http.HandlerFunc(s.handlePersonalPlanReminder)))
	s.mux.HandleFunc("GET /api/health", s.handleHealth)
	s.mux.Handle("GET /api/reading", s.requireAuth(http.HandlerFunc(s.handleReadingOverview)))
	s.mux.Handle("POST /api/reading/enable", s.requireAuth(http.HandlerFunc(s.handleReadingEnable)))
	s.mux.Handle("POST /api/reading/join", s.requireAuth(http.HandlerFunc(s.handleReadingJoin)))
	s.mux.Handle("POST /api/reading/groups", s.requireAuth(http.HandlerFunc(s.handleReadingGroup)))
	s.mux.Handle("PATCH /api/reading/groups/{id}", s.requireAuth(http.HandlerFunc(s.handleReadingGroup)))
	s.mux.Handle("POST /api/reading/entries", s.requireAuth(http.HandlerFunc(s.handleReadingEntry)))
	s.mux.Handle("PATCH /api/reading/entries/{id}", s.requireAuth(http.HandlerFunc(s.handleReadingEntryUpdate)))
	s.mux.Handle("POST /api/reading/reflections", s.requireAuth(http.HandlerFunc(s.handleReadingReflection)))
	s.mux.Handle("PATCH /api/reading/reflections/{id}", s.requireAuth(http.HandlerFunc(s.handleReadingReflection)))
	s.mux.Handle("POST /api/reading/plans", s.requireAuth(http.HandlerFunc(s.handleReadingPlan)))
	s.mux.Handle("POST /api/reading/plans/{id}/cancel", s.requireAuth(http.HandlerFunc(s.handleReadingPlanCancel)))
	s.mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	s.mux.HandleFunc("POST /api/auth/register/verify", s.handleVerifyRegistration)
	s.mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	s.mux.Handle("POST /api/auth/logout", s.requireAuth(http.HandlerFunc(s.handleLogout)))
	s.mux.Handle("GET /api/me", s.requireAuth(http.HandlerFunc(s.handleMe)))
	s.mux.Handle("GET /api/me/journey", s.requireAuth(http.HandlerFunc(s.handleJourneyPreferences)))
	s.mux.Handle("PATCH /api/me/journey", s.requireAuth(http.HandlerFunc(s.handleJourneyPreferences)))
	s.mux.Handle("PATCH /api/me", s.requireAuth(http.HandlerFunc(s.handleUpdateMe)))
	s.mux.Handle("PUT /api/me/password", s.requireAuth(http.HandlerFunc(s.handleUpdatePassword)))
	s.mux.Handle("POST /api/me/avatar", s.requireAuth(http.HandlerFunc(s.handleUploadAvatar)))
	s.mux.Handle("DELETE /api/me/avatar", s.requireAuth(http.HandlerFunc(s.handleDeleteAvatar)))
	s.mux.Handle("GET /api/users", s.requireAuth(http.HandlerFunc(s.handleUsers)))
	s.mux.Handle("GET /api/workspace/navigation", s.requireAuth(http.HandlerFunc(s.handleProjectNavigation)))
	s.mux.Handle("PUT /api/workspace/navigation", s.requireAuth(http.HandlerFunc(s.handleProjectNavigation)))
	s.mux.Handle("GET /api/workspace/pages", s.requireAuth(http.HandlerFunc(s.handleListWorkspacePages)))
	s.mux.Handle("POST /api/workspace/pages", s.requireAuth(http.HandlerFunc(s.handleSaveWorkspacePage)))
	s.mux.Handle("PATCH /api/workspace/pages/{id}", s.requireAuth(http.HandlerFunc(s.handleSaveWorkspacePage)))
	s.mux.Handle("GET /api/users/{id}/profile", s.requireAuth(http.HandlerFunc(s.handleUserProfile)))
	s.mux.Handle("GET /api/users/{id}/avatar", s.requireAuth(http.HandlerFunc(s.handleAvatar)))
	s.mux.Handle("GET /api/workspaces", s.requireAuth(http.HandlerFunc(s.handleListWorkspaces)))
	s.mux.Handle("POST /api/workspaces", s.requireAuth(http.HandlerFunc(s.handleCreateWorkspace)))
	s.mux.Handle("GET /api/teams", s.requireAuth(http.HandlerFunc(s.handleListTeams)))
	s.mux.Handle("POST /api/teams", s.requireAuth(http.HandlerFunc(s.handleCreateTeam)))
	s.mux.Handle("PATCH /api/teams/{id}", s.requireAuth(http.HandlerFunc(s.handleRenameTeam)))
	s.mux.Handle("DELETE /api/teams/{id}", s.requireAuth(http.HandlerFunc(s.handleDeleteTeam)))
	s.mux.Handle("POST /api/teams/{id}/restore", s.requireAuth(http.HandlerFunc(s.handleRestoreTeam)))
	s.mux.Handle("POST /api/teams/{id}/leave", s.requireAuth(http.HandlerFunc(s.handleLeaveTeam)))
	s.mux.Handle("POST /api/teams/{id}/ownership", s.requireAuth(http.HandlerFunc(s.handleTransferTeamOwnership)))
	s.mux.Handle("DELETE /api/teams/{id}/members/{userId}", s.requireAuth(http.HandlerFunc(s.handleRemoveTeamMember)))
	s.mux.Handle("GET /api/teams/{id}", s.requireAuth(http.HandlerFunc(s.handleGetTeam)))
	s.mux.Handle("POST /api/teams/{id}/projects", s.requireAuth(http.HandlerFunc(s.handleCreateTeamProject)))
	s.mux.Handle("POST /api/teams/{id}/members", s.requireAuth(http.HandlerFunc(s.handleAddTeamMember)))
	s.mux.Handle("PATCH /api/teams/{id}/members/{userId}", s.requireAuth(http.HandlerFunc(s.handleUpdateTeamMember)))
	s.mux.Handle("POST /api/teams/{id}/invitations", s.requireAuth(http.HandlerFunc(s.handleCreateTeamInvitation)))
	s.mux.Handle("DELETE /api/teams/{id}/invitations/{inviteId}", s.requireAuth(http.HandlerFunc(s.handleRevokeTeamInvitation)))
	s.mux.Handle("POST /api/invitations/accept", s.requireAuth(http.HandlerFunc(s.handleAcceptTeamInvitation)))
	s.mux.Handle("GET /api/interface/preferences", s.requireAuth(http.HandlerFunc(s.handleGetInterfacePreferences)))
	s.mux.Handle("PUT /api/interface/preferences", s.requireAuth(http.HandlerFunc(s.handleUpdateInterfacePreferences)))
	s.mux.Handle("GET /api/graph/layout", s.requireAuth(http.HandlerFunc(s.handleGetGraphLayout)))
	s.mux.Handle("PUT /api/graph/layout", s.requireAuth(http.HandlerFunc(s.handlePutGraphLayout)))
	s.mux.Handle("GET /api/interface/presets", s.requireAuth(http.HandlerFunc(s.handleListInterfacePresets)))
	s.mux.Handle("POST /api/interface/presets", s.requireAuth(http.HandlerFunc(s.handleCreateInterfacePreset)))
	s.mux.Handle("GET /api/interface/presets/{id}", s.requireAuth(http.HandlerFunc(s.handleGetInterfacePreset)))
	s.mux.Handle("PATCH /api/interface/presets/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdateInterfacePreset)))
	s.mux.Handle("DELETE /api/interface/presets/{id}", s.requireAuth(http.HandlerFunc(s.handleDeleteInterfacePreset)))
	s.mux.Handle("POST /api/interface/presets/{id}/apply", s.requireAuth(http.HandlerFunc(s.handleApplyInterfacePreset)))
	s.mux.Handle("GET /api/interface/preset-applications/latest", s.requireAuth(http.HandlerFunc(s.handleLatestInterfacePresetApplication)))
	s.mux.Handle("POST /api/interface/preset-applications/{id}/undo", s.requireAuth(http.HandlerFunc(s.handleUndoInterfacePresetApplication)))
	s.mux.Handle("GET /api/collections", s.requireAuth(http.HandlerFunc(s.handleListCollections)))
	s.mux.Handle("GET /api/collection-templates", s.requireAuth(http.HandlerFunc(s.handleCollectionTemplates)))
	s.mux.Handle("POST /api/collections", s.requireAuth(http.HandlerFunc(s.handleCreateCollection)))
	s.mux.Handle("PATCH /api/collections/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdateCollection)))
	s.mux.Handle("POST /api/collections/{id}/stages", s.requireAuth(http.HandlerFunc(s.handleCreateCollectionStage)))
	s.mux.Handle("PATCH /api/collections/{id}/stages/{stageId}", s.requireAuth(http.HandlerFunc(s.handleUpdateCollectionStage)))
	s.mux.Handle("PUT /api/records/{id}/collection", s.requireAuth(http.HandlerFunc(s.handleAssignRecordCollection)))
	s.mux.Handle("POST /api/collections/{id}/fields", s.requireAuth(http.HandlerFunc(s.handleCreateCollectionField)))
	s.mux.Handle("PATCH /api/collections/{id}/fields/{fieldId}", s.requireAuth(http.HandlerFunc(s.handleUpdateCollectionField)))
	s.mux.Handle("GET /api/collections/{id}/schema", s.requireAuth(http.HandlerFunc(s.handleCollectionSchema)))
	s.mux.Handle("DELETE /api/collections/{id}/fields/{fieldId}", s.requireAuth(http.HandlerFunc(s.handleArchiveCollectionElement)))
	s.mux.Handle("POST /api/collections/{id}/fields/{fieldId}/restore", s.requireAuth(http.HandlerFunc(s.handleRestoreCollectionElement)))
	s.mux.Handle("DELETE /api/collections/{id}/stages/{stageId}", s.requireAuth(http.HandlerFunc(s.handleArchiveCollectionElement)))
	s.mux.Handle("POST /api/collections/{id}/stages/{stageId}/restore", s.requireAuth(http.HandlerFunc(s.handleRestoreCollectionElement)))
	s.mux.Handle("PUT /api/collections/{id}/schema-order", s.requireAuth(http.HandlerFunc(s.handleCollectionSchemaOrder)))
	s.mux.Handle("PUT /api/personal/life/settings", s.requireAuth(http.HandlerFunc(s.handleLifeSettings)))
	s.mux.Handle("GET /api/personal/day", s.requireAuth(http.HandlerFunc(s.handlePersonalDay)))
	s.mux.Handle("GET /api/personal/calendar", s.requireAuth(http.HandlerFunc(s.handlePersonalCalendar)))
	s.mux.Handle("PUT /api/personal/calendar/work/{id}", s.requireAuth(http.HandlerFunc(s.handleCalendarWorkBlock)))
	s.mux.Handle("PUT /api/personal/calendar/confirmations", s.requireAuth(http.HandlerFunc(s.handleCalendarConfirmation)))
	s.mux.Handle("PUT /api/personal/day/settings", s.requireAuth(http.HandlerFunc(s.handlePersonalDaySettings)))
	s.mux.Handle("PUT /api/personal/day/{date}/focus", s.requireAuth(http.HandlerFunc(s.handlePersonalDayFocus)))
	s.mux.Handle("GET /api/personal/publications/source/{kind}/{id}", s.requireAuth(http.HandlerFunc(s.handlePublicationSource)))
	s.mux.Handle("POST /api/personal/publications/preview", s.requireAuth(http.HandlerFunc(s.handlePublicationPreview)))
	s.mux.Handle("GET /api/personal/publications/{id}", s.requireAuth(http.HandlerFunc(s.handleGetPublication)))
	s.mux.Handle("POST /api/personal/publications/{id}/apply", s.requireAuth(http.HandlerFunc(s.handlePublicationApply)))
	s.mux.Handle("GET /api/personal/overview", s.requireAuth(http.HandlerFunc(s.handlePersonalOverview)))
	s.mux.Handle("POST /api/personal/notes", s.requireAuth(http.HandlerFunc(s.handleCreatePersonalNote)))
	s.mux.Handle("GET /api/personal/notes/archive", s.requireAuth(http.HandlerFunc(s.handleArchivedNotes)))
	s.mux.Handle("GET /api/personal/notes/{id}", s.requireAuth(http.HandlerFunc(s.handleGetPersonalNote)))
	s.mux.Handle("POST /api/personal/notes/{id}/plan", s.requireAuth(http.HandlerFunc(s.handlePersonalNoteToPlan)))
	s.mux.Handle("POST /api/personal/notes/{id}/restore", s.requireAuth(http.HandlerFunc(s.handleRestoreArchivedNote)))
	s.mux.Handle("GET /api/personal/notes/{id}/versions", s.requireAuth(http.HandlerFunc(s.handleNoteVersions)))
	s.mux.Handle("GET /api/personal/notes/{id}/versions/{version}", s.requireAuth(http.HandlerFunc(s.handleGetNoteVersion)))
	s.mux.Handle("POST /api/personal/notes/{id}/versions/{version}/restore", s.requireAuth(http.HandlerFunc(s.handleRestoreNoteVersion)))
	s.mux.Handle("GET /api/personal/notes/{id}/attachments", s.requireAuth(http.HandlerFunc(s.handleNoteAttachments)))
	s.mux.Handle("POST /api/personal/notes/{id}/attachments", s.requireAuth(http.HandlerFunc(s.handleUploadNoteAttachment)))
	s.mux.Handle("POST /api/personal/note-attachments", s.requireAuth(http.HandlerFunc(s.handleUploadNoteAttachment)))
	s.mux.Handle("GET /api/personal/note-attachments/{attachment}/file", s.requireAuth(http.HandlerFunc(s.handleNoteAttachmentFile)))
	s.mux.Handle("PATCH /api/personal/note-attachments/{attachment}", s.requireAuth(http.HandlerFunc(s.handleNoteAttachmentState)))
	s.mux.Handle("POST /api/personal/note-folders", s.requireAuth(http.HandlerFunc(s.handleSaveNoteFolder)))
	s.mux.Handle("PATCH /api/personal/note-folders/{id}", s.requireAuth(http.HandlerFunc(s.handleSaveNoteFolder)))
	s.mux.Handle("DELETE /api/personal/note-folders/{id}", s.requireAuth(http.HandlerFunc(s.handleArchiveNoteFolder)))
	s.mux.Handle("POST /api/personal/note-templates", s.requireAuth(http.HandlerFunc(s.handleSaveNoteTemplate)))
	s.mux.Handle("GET /api/personal/note-templates/{id}", s.requireAuth(http.HandlerFunc(s.handleGetNoteTemplate)))
	s.mux.Handle("PATCH /api/personal/note-templates/{id}", s.requireAuth(http.HandlerFunc(s.handleSaveNoteTemplate)))
	s.mux.Handle("DELETE /api/personal/note-templates/{id}", s.requireAuth(http.HandlerFunc(s.handleArchiveNoteTemplate)))
	s.mux.Handle("POST /api/personal/note-templates/{id}/instantiate", s.requireAuth(http.HandlerFunc(s.handleCreateNoteShortcut)))
	s.mux.Handle("POST /api/personal/notes/daily", s.requireAuth(http.HandlerFunc(s.handleCreateNoteShortcut)))
	s.mux.Handle("POST /api/personal/capture", s.requireAuth(http.HandlerFunc(s.handlePersonalCapture)))
	s.mux.Handle("PATCH /api/personal/notes/{id}/inbox", s.requireAuth(http.HandlerFunc(s.handlePersonalInboxState)))
	s.mux.Handle("PATCH /api/personal/notes/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdatePersonalNote)))
	s.mux.Handle("DELETE /api/personal/notes/{id}", s.requireAuth(http.HandlerFunc(s.handleArchivePersonalNote)))
	s.mux.Handle("POST /api/personal/projects", s.requireAuth(http.HandlerFunc(s.handleCreatePersonalProject)))
	s.mux.Handle("PATCH /api/personal/projects/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdatePersonalProject)))
	s.mux.Handle("DELETE /api/personal/projects/{id}", s.requireAuth(http.HandlerFunc(s.handleArchivePersonalProject)))
	s.mux.Handle("POST /api/personal/goals", s.requireAuth(http.HandlerFunc(s.handleCreatePersonalGoal)))
	s.mux.Handle("PATCH /api/personal/goals/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdatePersonalGoal)))
	s.mux.Handle("DELETE /api/personal/goals/{id}", s.requireAuth(http.HandlerFunc(s.handleArchivePersonalGoal)))
	s.mux.Handle("POST /api/personal/plans", s.requireAuth(http.HandlerFunc(s.handleCreatePersonalPlan)))
	s.mux.Handle("PATCH /api/personal/plans/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdatePersonalPlan)))
	s.mux.Handle("DELETE /api/personal/plans/{id}", s.requireAuth(http.HandlerFunc(s.handleArchivePersonalPlan)))
	s.mux.Handle("POST /api/personal/plans/{id}/skip", s.requireAuth(http.HandlerFunc(s.handleSkipPersonalPlan)))
	s.mux.Handle("PUT /api/personal/plans/{id}/series", s.requireAuth(http.HandlerFunc(s.handleUpdatePersonalSeries)))
	s.mux.Handle("GET /api/personal/habits/{id}/tracker", s.requireAuth(http.HandlerFunc(s.handleHabitTracker)))
	s.mux.Handle("GET /api/personal/habits/{id}/export", s.requireAuth(http.HandlerFunc(s.handleHabitExport)))
	s.mux.Handle("POST /api/personal/habits/{id}/restore", s.requireAuth(http.HandlerFunc(s.handleHabitRestore)))
	s.mux.Handle("POST /api/personal/habits/{id}/pause", s.requireAuth(http.HandlerFunc(s.handleHabitPause)))
	s.mux.Handle("POST /api/personal/habits/{id}/resume", s.requireAuth(http.HandlerFunc(s.handleHabitResume)))
	s.mux.Handle("POST /api/personal/habits/{id}/moves", s.requireAuth(http.HandlerFunc(s.handleHabitMove)))
	s.mux.Handle("POST /api/personal/habits", s.requireAuth(http.HandlerFunc(s.handleCreatePersonalHabit)))
	s.mux.Handle("PATCH /api/personal/habits/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdatePersonalHabit)))
	s.mux.Handle("DELETE /api/personal/habits/{id}", s.requireAuth(http.HandlerFunc(s.handleArchivePersonalHabit)))
	s.mux.Handle("PUT /api/personal/habits/{id}/checkins/{date}", s.requireAuth(http.HandlerFunc(s.handleSetHabitCheckin)))
	s.mux.Handle("DELETE /api/personal/habits/{id}/checkins/{date}", s.requireAuth(http.HandlerFunc(s.handleDeleteHabitCheckin)))
	s.mux.Handle("GET /api/personal/waiting/today", s.requireAuth(http.HandlerFunc(s.handlePersonalWaitingToday)))
	s.mux.Handle("GET /api/personal/waiting", s.requireAuth(http.HandlerFunc(s.handlePersonalWaiting)))
	s.mux.Handle("POST /api/personal/waiting", s.requireAuth(http.HandlerFunc(s.handlePersonalWaiting)))
	s.mux.Handle("GET /api/personal/waiting/{id}", s.requireAuth(http.HandlerFunc(s.handlePersonalWaitingItem)))
	s.mux.Handle("PUT /api/personal/waiting/{id}", s.requireAuth(http.HandlerFunc(s.handlePersonalWaitingItem)))
	s.mux.Handle("POST /api/personal/waiting/{id}/ping", s.requireAuth(http.HandlerFunc(s.handlePersonalWaitingPing)))
	s.mux.Handle("POST /api/personal/waiting/{id}/{action}", s.requireAuth(http.HandlerFunc(s.handlePersonalWaitingAction)))
	s.mux.Handle("GET /api/personal/review", s.requireAuth(http.HandlerFunc(s.handlePersonalReview)))
	s.mux.Handle("PUT /api/personal/review/{week}/{kind}/{id}", s.requireAuth(http.HandlerFunc(s.handlePersonalReviewChoice)))
	s.mux.Handle("GET /api/personal/suggestions", s.requireAuth(http.HandlerFunc(s.handlePersonalSuggestions)))
	s.mux.Handle("GET /api/personal/search", s.requireAuth(http.HandlerFunc(s.handlePersonalSearch)))
	s.mux.Handle("POST /api/personal/links", s.requireAuth(http.HandlerFunc(s.handleCreatePersonalLink)))
	s.mux.Handle("DELETE /api/personal/links/{id}", s.requireAuth(http.HandlerFunc(s.handleRemovePersonalLink)))
	s.mux.Handle("PUT /api/users/{id}/capacity", s.requireAuth(http.HandlerFunc(s.handleUpdateUserCapacity)))
	s.mux.Handle("GET /api/team/capacity", s.requireAuth(http.HandlerFunc(s.handleTeamCapacity)))
	s.mux.Handle("GET /api/planning/cycles", s.requireAuth(http.HandlerFunc(s.handleListPlanningCycles)))
	s.mux.Handle("POST /api/planning/cycles", s.requireAuth(http.HandlerFunc(s.handleCreatePlanningCycle)))
	s.mux.Handle("PATCH /api/planning/cycles/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdatePlanningCycle)))
	s.mux.Handle("POST /api/presence", s.requireAuth(http.HandlerFunc(s.handlePresence)))
	s.mux.Handle("GET /api/sync", s.requireAuth(http.HandlerFunc(s.handleIncrementalSync)))
	s.mux.Handle("GET /api/quality", s.requireAuth(http.HandlerFunc(s.handleQualityReport)))
	s.mux.Handle("GET /api/graph", s.requireAuth(http.HandlerFunc(s.handleGraph)))
	s.mux.Handle("GET /api/search", s.requireAuth(http.HandlerFunc(s.handleSearch)))
	s.mux.Handle("POST /api/ai/suggest-record", s.requireAuth(http.HandlerFunc(s.handleSuggestRecord)))
	s.mux.Handle("POST /api/records/{id}/ai-analysis", s.requireAuth(http.HandlerFunc(s.handleAnalyzeRecord)))
	s.mux.Handle("POST /api/records/{id}/ai-draft-field", s.requireAuth(http.HandlerFunc(s.handleAIFieldDraft)))

	s.mux.Handle("GET /api/records", s.requireAuth(http.HandlerFunc(s.handleListRecords)))
	s.mux.Handle("POST /api/record-batches/preview", s.requireAuth(http.HandlerFunc(s.handlePreviewRecordBatch)))
	s.mux.Handle("POST /api/record-batches/apply", s.requireAuth(http.HandlerFunc(s.handleApplyRecordBatch)))
	s.mux.Handle("GET /api/record-batches/{id}", s.requireAuth(http.HandlerFunc(s.handleGetRecordBatch)))
	s.mux.Handle("POST /api/record-batches/{id}/undo", s.requireAuth(http.HandlerFunc(s.handleUndoRecordBatch)))
	s.mux.Handle("POST /api/records", s.requireAuth(http.HandlerFunc(s.handleCreateRecord)))
	s.mux.Handle("GET /api/records/{id}", s.requireAuth(http.HandlerFunc(s.handleGetRecord)))
	s.mux.Handle("GET /api/records/{id}/relations", s.requireAuth(http.HandlerFunc(s.handleGetRecordRelations)))
	s.mux.Handle("PATCH /api/records/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdateRecord)))
	s.mux.Handle("PUT /api/records/{id}/stage", s.requireAuth(http.HandlerFunc(s.handleMoveRecordStage)))
	s.mux.Handle("PUT /api/records/{id}/custom-fields", s.requireAuth(http.HandlerFunc(s.handleUpdateRecordFields)))
	s.mux.Handle("PUT /api/records/{id}/business-details", s.requireAuth(http.HandlerFunc(s.handleUpdateBusinessDetails)))
	s.mux.Handle("POST /api/records/{id}/triage", s.requireAuth(http.HandlerFunc(s.handleTriageInbox)))
	s.mux.Handle("POST /api/records/{id}/convert-to-questions", s.requireAuth(http.HandlerFunc(s.handleConvertToQuestions)))
	s.mux.Handle("POST /api/records/{id}/archive", s.requireAuth(http.HandlerFunc(s.handleArchiveRecord)))
	s.mux.Handle("GET /api/records/{id}/sections", s.requireAuth(http.HandlerFunc(s.handleSections)))
	s.mux.Handle("POST /api/records/{id}/sections", s.requireAuth(http.HandlerFunc(s.handleSaveSection)))
	s.mux.Handle("GET /api/records/{id}/research-comparison", s.requireAuth(http.HandlerFunc(s.handleGetResearchComparison)))
	s.mux.Handle("POST /api/records/{id}/research-options", s.requireAuth(http.HandlerFunc(s.handleCreateResearchOption)))
	s.mux.Handle("PATCH /api/records/{id}/research-options/{optionId}", s.requireAuth(http.HandlerFunc(s.handleUpdateResearchOption)))
	s.mux.Handle("POST /api/records/{id}/research-options/{optionId}/archive", s.requireAuth(http.HandlerFunc(s.handleArchiveResearchOption)))
	s.mux.Handle("POST /api/records/{id}/research-fields", s.requireAuth(http.HandlerFunc(s.handleCreateResearchField)))
	s.mux.Handle("POST /api/records/{id}/research-fields/{fieldId}/archive", s.requireAuth(http.HandlerFunc(s.handleArchiveResearchField)))
	s.mux.Handle("POST /api/records/{id}/complete-research", s.requireAuth(http.HandlerFunc(s.handleCompleteResearch)))
	s.mux.Handle("POST /api/records/{id}/links", s.requireAuth(http.HandlerFunc(s.handleCreateLink)))
	s.mux.Handle("POST /api/records/{id}/links/{linkId}/remove", s.requireAuth(http.HandlerFunc(s.handleRemoveLink)))
	s.mux.Handle("PUT /api/records/{id}/criteria/{criterionId}", s.requireAuth(http.HandlerFunc(s.handleScoreCriterion)))
	s.mux.Handle("DELETE /api/records/{id}/criteria/{criterionId}", s.requireAuth(http.HandlerFunc(s.handleWithdrawCriterionScore)))
	s.mux.Handle("PUT /api/records/{id}/criteria/{criterionId}/decision", s.requireAuth(http.HandlerFunc(s.handleCriterionDecision)))
	s.mux.Handle("POST /api/records/{id}/proofs", s.requireAuth(http.HandlerFunc(s.handleAddProof)))
	s.mux.Handle("POST /api/records/{id}/complete", s.requireAuth(http.HandlerFunc(s.handleCompleteTask)))
	s.mux.Handle("POST /api/records/{id}/notify", s.requireAuth(http.HandlerFunc(s.handleNotifyPartners)))
	s.mux.Handle("GET /api/records/{id}/workflow", s.requireAuth(http.HandlerFunc(s.handleGetRecordWorkflow)))
	s.mux.Handle("POST /api/records/{id}/comments", s.requireAuth(http.HandlerFunc(s.handleAddComment)))
	s.mux.Handle("POST /api/records/{id}/checklist", s.requireAuth(http.HandlerFunc(s.handleAddChecklistItem)))
	s.mux.Handle("PATCH /api/records/{id}/checklist/{itemId}", s.requireAuth(http.HandlerFunc(s.handleUpdateChecklistItem)))
	s.mux.Handle("POST /api/records/{id}/submit-review", s.requireAuth(http.HandlerFunc(s.handleSubmitTaskReview)))
	s.mux.Handle("POST /api/records/{id}/review", s.requireAuth(http.HandlerFunc(s.handleReviewTask)))
	s.mux.Handle("POST /api/records/{id}/attachments", s.requireAuth(http.HandlerFunc(s.handleUploadAttachment)))
	s.mux.Handle("GET /api/attachments/{id}/download", s.requireAuth(http.HandlerFunc(s.handleDownloadAttachment)))
	s.mux.Handle("PUT /api/records/{id}/recurrence", s.requireAuth(http.HandlerFunc(s.handleSaveRecurrence)))
	s.mux.Handle("POST /api/records/{id}/questions", s.requireAuth(http.HandlerFunc(s.handleAddQuestions)))
	s.mux.Handle("PUT /api/records/{id}/questions/{questionId}/answer", s.requireAuth(http.HandlerFunc(s.handleSaveQuestionAnswer)))
	s.mux.Handle("POST /api/records/{id}/questions/{questionId}/decision", s.requireAuth(http.HandlerFunc(s.handleSaveQuestionDecision)))
	s.mux.Handle("POST /api/records/{id}/questions/{questionId}/ai-draft", s.requireAuth(http.HandlerFunc(s.handleAIQuestionDraft)))
	s.mux.Handle("POST /api/records/{id}/questions/{questionId}/outputs", s.requireAuth(http.HandlerFunc(s.handleCreateQuestionOutput)))
	s.mux.Handle("POST /api/records/{id}/questions/{questionId}/archive", s.requireAuth(http.HandlerFunc(s.handleArchiveQuestion)))
	s.mux.Handle("GET /api/questions/pending", s.requireAuth(http.HandlerFunc(s.handlePendingQuestions)))

	s.mux.Handle("GET /api/section-definitions", s.requireAuth(http.HandlerFunc(s.handleListDefinitions)))
	s.mux.Handle("POST /api/section-definitions", s.requireAuth(http.HandlerFunc(s.handleCreateDefinition)))
	s.mux.Handle("POST /api/section-definitions/reorder", s.requireAuth(http.HandlerFunc(s.handleReorderDefinitions)))
	s.mux.Handle("PATCH /api/section-definitions/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdateDefinition)))
	s.mux.Handle("GET /api/notifications", s.requireAuth(http.HandlerFunc(s.handleNotifications)))
	s.mux.Handle("GET /api/me/reminders", s.requireAuth(http.HandlerFunc(s.handleReminderPreferences)))
	s.mux.Handle("PUT /api/me/reminders", s.requireAuth(http.HandlerFunc(s.handleReminderPreferences)))
	s.mux.Handle("GET /api/notifications/inbox", s.requireAuth(http.HandlerFunc(s.handleNotificationInbox)))
	s.mux.Handle("POST /api/notifications/{id}/unread", s.requireAuth(http.HandlerFunc(s.handleUnreadNotification)))
	s.mux.Handle("POST /api/notifications/read-all", s.requireAuth(http.HandlerFunc(s.handleReadAllNotifications)))
	s.mux.Handle("POST /api/notifications/{id}/read", s.requireAuth(http.HandlerFunc(s.handleReadNotification)))
	s.mux.Handle("GET /api/activity", s.requireAuth(http.HandlerFunc(s.handleActivity)))
	s.mux.Handle("POST /api/activity/{id}/undo", s.requireAuth(http.HandlerFunc(s.handleUndoActivity)))
	s.mux.Handle("GET /api/saved-views", s.requireAuth(http.HandlerFunc(s.handleListSavedViews)))
	s.mux.Handle("POST /api/saved-views", s.requireAuth(http.HandlerFunc(s.handleCreateSavedView)))
	s.mux.Handle("DELETE /api/saved-views/{id}", s.requireAuth(http.HandlerFunc(s.handleDeleteSavedView)))
	s.mux.Handle("GET /api/export", s.requireAuth(http.HandlerFunc(s.handleExportProject)))
	s.mux.Handle("GET /api/ai/health", s.requireAuth(http.HandlerFunc(s.handleAIHealth)))
	s.mux.Handle("GET /api/chat/threads", s.requireAuth(http.HandlerFunc(s.handleListChatThreads)))
	s.mux.Handle("POST /api/chat/threads", s.requireAuth(http.HandlerFunc(s.handleCreateChatThread)))
	s.mux.Handle("GET /api/chat/threads/{id}/messages", s.requireAuth(http.HandlerFunc(s.handleListChatMessages)))
	s.mux.Handle("GET /api/chat/threads/{id}/history", s.requireAuth(http.HandlerFunc(s.handleChatHistory)))
	s.mux.Handle("GET /api/chat/threads/{id}/group", s.requireAuth(http.HandlerFunc(s.handleChatGroup)))
	s.mux.Handle("PATCH /api/chat/threads/{id}/group", s.requireAuth(http.HandlerFunc(s.handleChatGroup)))
	s.mux.Handle("GET /api/chat/threads/{id}/pins", s.requireAuth(http.HandlerFunc(s.handleChatPins)))
	s.mux.Handle("PUT /api/chat/threads/{id}/pins", s.requireAuth(http.HandlerFunc(s.handleChatPins)))
	s.mux.Handle("POST /api/chat/threads/{id}/messages", s.requireAuth(http.HandlerFunc(s.handleCreateChatMessage)))
	s.mux.Handle("POST /api/chat/threads/{id}/read", s.requireAuth(http.HandlerFunc(s.handleReadChatThread)))
	s.mux.Handle("POST /api/chat/threads/{id}/attachments", s.requireAuth(http.HandlerFunc(s.handleUploadChatAttachment)))
	s.mux.Handle("POST /api/chat/threads/{id}/ai-digest", s.requireAuth(http.HandlerFunc(s.handleAIChatDigest)))
	s.mux.Handle("GET /api/chat/ice-config", s.requireAuth(http.HandlerFunc(s.handleChatICEConfig)))
	s.mux.Handle("POST /api/chat/messages/{messageId}/reaction", s.requireAuth(http.HandlerFunc(s.handleToggleChatReaction)))
	s.mux.Handle("PUT /api/chat/messages/{messageId}/reaction", s.requireAuth(http.HandlerFunc(s.handleToggleChatReaction)))
	s.mux.Handle("POST /api/chat/messages/{messageId}/favorite", s.requireAuth(http.HandlerFunc(s.handleToggleChatFavorite)))
	s.mux.Handle("PATCH /api/chat/messages/{messageId}", s.requireAuth(http.HandlerFunc(s.handleEditChatMessage)))
	s.mux.Handle("DELETE /api/chat/messages/{messageId}", s.requireAuth(http.HandlerFunc(s.handleArchiveChatMessage)))
	s.mux.Handle("GET /api/chat/attachments/{id}", s.requireAuth(http.HandlerFunc(s.handleDownloadChatAttachment)))
	s.mux.Handle("POST /api/chat/threads/{id}/calls", s.requireAuth(http.HandlerFunc(s.handleStartChatCall)))
	s.mux.Handle("GET /api/chat/threads/{id}/calls/active", s.requireAuth(http.HandlerFunc(s.handleActiveChatCall)))
	s.mux.Handle("POST /api/chat/calls/{callId}/answer", s.requireAuth(http.HandlerFunc(s.handleAnswerChatCall)))
	s.mux.Handle("POST /api/chat/calls/{callId}/candidates", s.requireAuth(http.HandlerFunc(s.handleAddChatCallCandidate)))
	s.mux.Handle("GET /api/chat/calls/{callId}/candidates", s.requireAuth(http.HandlerFunc(s.handleListChatCallCandidates)))
	s.mux.Handle("POST /api/chat/calls/{callId}/end", s.requireAuth(http.HandlerFunc(s.handleEndChatCall)))

	s.mux.Handle("GET /", cacheEmbeddedAssets(http.FileServer(http.FS(web.Files))))
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
		w.Header().Set("Permissions-Policy", "microphone=(self), camera=(self)")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || strings.TrimSpace(cookie.Value) == "" {
			writeError(w, http.StatusUnauthorized, "Нужен вход в аккаунт")
			return
		}
		var user User
		var lastSeenAt string
		var avatarStoredName, avatarUpdatedAt string
		err = s.store.db.QueryRowContext(r.Context(), `
			SELECT u.id, u.email, u.username, u.display_name, u.bio, u.created_at, u.avatar_stored_name, u.avatar_updated_at, s.last_seen_at
			FROM sessions s JOIN users u ON u.id = s.user_id
			WHERE s.token_hash = ? AND s.expires_at > ?`, hashToken(cookie.Value), nowText()).
			Scan(&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.Bio, &user.CreatedAt, &avatarStoredName, &avatarUpdatedAt, &lastSeenAt)
		if errors.Is(err, sql.ErrNoRows) {
			s.clearSessionCookie(w)
			writeError(w, http.StatusUnauthorized, "Сессия истекла")
			return
		}
		if err != nil {
			log.Printf("authenticate: %v", err)
			writeError(w, http.StatusInternalServerError, "Не удалось проверить сессию")
			return
		}
		if expected := r.Header.Get("X-Outbox-Owner"); expected != "" && expected != strconv.FormatInt(user.ID, 10) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "Аккаунт изменился. Очередь прежнего пользователя приостановлена", "code": "outbox_owner_changed"})
			return
		}
		lastSeen, parseErr := time.Parse(time.RFC3339Nano, lastSeenAt)
		if parseErr != nil || time.Since(lastSeen) >= 5*time.Minute {
			_, _ = s.store.db.ExecContext(r.Context(), `UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`, nowText(), hashToken(cookie.Value))
		}
		setUserAvatar(&user, avatarStoredName, avatarUpdatedAt)
		ctx := context.WithValue(r.Context(), userContextKey, user)
		requestedWorkspace := r.Header.Get("X-Workspace-ID")
		if accountScopedPath(r.URL.Path) {
			requestedWorkspace = ""
		}
		workspace, workspaceErr := s.resolveWorkspaceAccess(ctx, user.ID, requestedWorkspace)
		if errors.Is(workspaceErr, sql.ErrNoRows) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Рабочее пространство недоступно", "code": "workspace_unavailable"})
			return
		}
		if workspaceErr != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось определить рабочее пространство")
			return
		}
		ctx = context.WithValue(ctx, workspaceContextKey, workspace)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func currentUser(r *http.Request) User {
	return r.Context().Value(userContextKey).(User)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.store.db.PingContext(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

type registerRequest struct {
	Email       string `json:"email"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	InviteToken string `json:"inviteToken"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	s.startRegistration(w, r)
}

type loginRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var input loginRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	var user User
	var passwordHash string
	var avatarStoredName, avatarUpdatedAt string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT id, email, username, display_name, bio, created_at, avatar_stored_name, avatar_updated_at, password_hash FROM users WHERE email = ? OR username = ?`, strings.TrimSpace(input.Login), strings.TrimSpace(input.Login)).
		Scan(&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.Bio, &user.CreatedAt, &avatarStoredName, &avatarUpdatedAt, &passwordHash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "Неверный логин или пароль")
		return
	}
	if err := s.createSession(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать сессию")
		return
	}
	setUserAvatar(&user, avatarStoredName, avatarUpdatedAt)
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request, userID int64) error {
	token, tokenHash, err := newSessionToken()
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	expires := now.Add(s.config.SessionLifetime)
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO sessions(user_id, token_hash, expires_at, created_at, last_seen_at) VALUES(?, ?, ?, ?, ?)`, userID, tokenHash, expires.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: token, Path: "/", HttpOnly: true, Secure: s.config.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: int(s.config.SessionLifetime.Seconds())})
	return nil
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true, Secure: s.config.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(0, 0)})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_, _ = s.store.db.ExecContext(r.Context(), `DELETE FROM sessions WHERE token_hash = ?`, hashToken(cookie.Value))
	}
	s.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, currentUser(r))
}

func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Username            *string `json:"username"`
		DisplayName         *string `json:"displayName"`
		Bio                 *string `json:"bio"`
		BirthDate           *string `json:"birthDate"`
		LifeExpectancyYears *int    `json:"lifeExpectancyYears"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	user := currentUser(r)
	username := user.Username
	displayName := user.DisplayName
	bio := user.Bio
	var birthDate *string
	lifeExpectancyYears := 100
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT birth_date, life_expectancy_years FROM users WHERE id = ?`, user.ID).Scan(&birthDate, &lifeExpectancyYears); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить профиль")
		return
	}
	if input.Username != nil {
		username = strings.TrimSpace(*input.Username)
	}
	if input.DisplayName != nil {
		displayName = strings.TrimSpace(*input.DisplayName)
	}
	if input.Bio != nil {
		bio = strings.TrimSpace(*input.Bio)
	}
	if !usernamePattern.MatchString(username) {
		writeError(w, http.StatusBadRequest, "Логин: 3–32 символа, латинские буквы, цифры и _")
		return
	}
	if len([]rune(displayName)) > 80 || len([]rune(bio)) > 800 {
		writeError(w, http.StatusBadRequest, "Имя или описание профиля слишком длинное")
		return
	}
	if username != user.Username && len(s.config.AllowedUsernames) > 0 {
		if _, ok := s.config.AllowedUsernames[strings.ToLower(username)]; !ok {
			writeError(w, http.StatusForbidden, "Новый логин нужно сначала добавить в конфигурацию команды")
			return
		}
	}
	if input.BirthDate != nil {
		value := strings.TrimSpace(*input.BirthDate)
		if value == "" {
			birthDate = nil
		} else if !validDate(value) || value > time.Now().Format("2006-01-02") {
			writeError(w, http.StatusBadRequest, "Укажите корректную дату рождения")
			return
		} else {
			birthDate = &value
		}
	}
	if input.LifeExpectancyYears != nil {
		lifeExpectancyYears = *input.LifeExpectancyYears
	}
	if lifeExpectancyYears < 1 || lifeExpectancyYears > 150 {
		writeError(w, http.StatusBadRequest, "Горизонт жизни должен быть от 1 до 150 лет")
		return
	}
	beforeUsername := user.Username
	beforeDisplayName := user.DisplayName
	beforeBio := user.Bio
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение профиля")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE users SET username = ?, display_name = ?, bio = ?, birth_date = ?, life_expectancy_years = ?, updated_at = ? WHERE id = ?`, username, displayName, bio, birthDate, lifeExpectancyYears, nowText(), user.ID); err != nil {
		writeError(w, http.StatusConflict, "Логин уже занят")
		return
	}
	publicChanges := map[string]any{}
	if beforeUsername != username {
		publicChanges["username"] = map[string]any{"before": beforeUsername, "after": username}
	}
	if beforeDisplayName != displayName {
		publicChanges["displayName"] = map[string]any{"before": beforeDisplayName, "after": displayName}
	}
	if beforeBio != bio {
		publicChanges["bio"] = map[string]any{"before": beforeBio, "after": bio}
	}
	if len(publicChanges) > 0 {
		if err := writeActivity(r.Context(), tx, user.ID, "user", strconv.FormatInt(user.ID, 10), "profile_updated", "", publicChanges); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось записать историю профиля")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение профиля")
		return
	}
	user.Username = username
	user.DisplayName = displayName
	user.Bio = bio
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleUpdatePassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if len(input.NewPassword) < 8 || len(input.NewPassword) > 128 {
		writeError(w, http.StatusBadRequest, "Новый пароль должен содержать от 8 до 128 символов")
		return
	}
	user := currentUser(r)
	var currentHash string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT password_hash FROM users WHERE id = ?`, user.ID).Scan(&currentHash); err != nil || bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(input.CurrentPassword)) != nil {
		writeError(w, http.StatusBadRequest, "Текущий пароль указан неверно")
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить пароль")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать смену пароля")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, string(newHash), nowText(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить пароль")
		return
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?`, user.ID, hashToken(cookie.Value)); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось завершить другие сессии")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить смену пароля")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
	workspace := currentWorkspace(r)
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT u.id, u.username, u.display_name, u.bio, u.created_at, u.avatar_stored_name, u.avatar_updated_at
		FROM workspace_members member JOIN users u ON u.id = member.user_id
		WHERE member.workspace_id = ? AND member.status = 'active'
		ORDER BY u.username`, workspace.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить участников")
		return
	}
	defer rows.Close()
	users := make([]User, 0)
	for rows.Next() {
		var user User
		var avatarStoredName, avatarUpdatedAt string
		if err := rows.Scan(&user.ID, &user.Username, &user.DisplayName, &user.Bio, &user.CreatedAt, &avatarStoredName, &avatarUpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать участников")
			return
		}
		setUserAvatar(&user, avatarStoredName, avatarUpdatedAt)
		users = append(users, user)
	}
	writeJSON(w, http.StatusOK, users)
}

type recordScanner interface{ Scan(...any) error }

const recordSelect = `
	SELECT r.id, r.workspace_id, COALESCE(r.collection_id, ''), COALESCE(collection.name, ''), COALESCE(r.stage_id, ''), COALESCE(stage.name, ''), CASE WHEN r.business_kind <> '' THEN r.business_kind WHEN r.subtype = 'question_set' THEN 'question_set' WHEN r.record_kind = 'meeting' THEN 'meeting' ELSE r.type END, r.record_kind, r.title, r.description, r.status,
		r.author_id, author.username, r.owner_id, owner.username,
		r.decision_maker_id, decision_maker.username, r.due_at,
		r.priority, r.workstream, r.edit_policy, r.parent_id, r.is_root,
		r.estimate_minutes, r.actual_minutes,
		CASE
			WHEN r.type = 'decision' AND r.status NOT IN ('archived', 'cancelled') THEN 100
			WHEN r.type = 'research' AND r.business_kind = '' AND r.status = 'completed' THEN 100
			WHEN r.type = 'research' AND r.business_kind = '' THEN MIN(95,
				CASE WHEN TRIM(r.description) <> '' THEN 15 ELSE 0 END +
				CASE WHEN EXISTS(SELECT 1 FROM research_option_fields rf WHERE rf.record_id = r.id AND rf.active = 1)
					OR EXISTS(SELECT 1 FROM record_sections rs WHERE rs.record_id = r.id AND TRIM(rs.content) <> '') THEN 15 ELSE 0 END +
				CASE WHEN (SELECT COUNT(*) FROM research_options ro WHERE ro.record_id = r.id AND ro.status = 'active') >= 2 THEN 20
					WHEN EXISTS(SELECT 1 FROM research_options ro WHERE ro.record_id = r.id AND ro.status = 'active') THEN 10 ELSE 0 END +
				CASE WHEN (SELECT COUNT(*) FROM research_options ro WHERE ro.record_id = r.id AND ro.status = 'active') = 0 THEN 0 ELSE
					30 * (SELECT COUNT(*) FROM research_options ro WHERE ro.record_id = r.id AND ro.status = 'active'
						AND (TRIM(ro.summary_md) <> '' OR TRIM(ro.pros_md) <> '' OR TRIM(ro.cons_md) <> '' OR TRIM(ro.notes_md) <> ''
							OR EXISTS(SELECT 1 FROM research_option_values rv WHERE rv.option_id = ro.id AND TRIM(rv.value) <> '')))
					/ (SELECT COUNT(*) FROM research_options ro WHERE ro.record_id = r.id AND ro.status = 'active') END +
				CASE WHEN TRIM(r.result) <> '' THEN 20 ELSE 0 END)
			ELSE r.progress
		END,
		r.progress_note, r.result, r.completed_at,
		r.created_at, r.updated_at,
		(SELECT COUNT(*) FROM task_proofs p WHERE p.record_id = r.id),
		business.record_id, business.probability, business.impact, business.mitigation_md,
		business.occurred, business.metric, business.success_threshold, business.experiment_method_md,
		business.verdict, business.decision_state, business.effective_at, business.review_at, business.supersedes_id,
		business.applicability, business.source_excerpt_md, r.title_generated, r.criterion_weight
	FROM records r
	LEFT JOIN workspace_collections collection ON collection.id = r.collection_id
	LEFT JOIN collection_stages stage ON stage.id = r.stage_id
	JOIN users author ON author.id = r.author_id
	JOIN users owner ON owner.id = r.owner_id
	LEFT JOIN users decision_maker ON decision_maker.id = r.decision_maker_id
	LEFT JOIN record_business_details business ON business.record_id = r.id`

func scanRecord(scanner recordScanner) (Record, error) {
	var record Record
	var decisionMakerID sql.NullInt64
	var decisionMakerName, dueAt, parentID, completedAt sql.NullString
	var businessRecordID, mitigation, metric, threshold, method, verdict, decisionState, effectiveAt, reviewAt, supersedesID, applicability, sourceExcerpt sql.NullString
	var probability, impact, occurred sql.NullInt64
	var isRoot int
	err := scanner.Scan(&record.ID, &record.WorkspaceID, &record.CollectionID, &record.CollectionName, &record.StageID, &record.StageName, &record.Type, &record.Kind, &record.Title, &record.Description, &record.Status,
		&record.AuthorID, &record.AuthorUsername, &record.OwnerID, &record.OwnerUsername,
		&decisionMakerID, &decisionMakerName, &dueAt, &record.Priority, &record.Workstream, &record.EditPolicy, &parentID, &isRoot,
		&record.EstimateMinutes, &record.ActualMinutes, &record.Progress,
		&record.ProgressNote, &record.Result, &completedAt, &record.CreatedAt, &record.UpdatedAt, &record.ProofCount,
		&businessRecordID, &probability, &impact, &mitigation, &occurred, &metric, &threshold, &method,
		&verdict, &decisionState, &effectiveAt, &reviewAt, &supersedesID, &applicability, &sourceExcerpt, &record.TitleGenerated, &record.CriterionWeight)
	if decisionMakerID.Valid {
		record.DecisionMakerID = &decisionMakerID.Int64
	}
	if decisionMakerName.Valid {
		record.DecisionMakerName = &decisionMakerName.String
	}
	if dueAt.Valid {
		record.DueAt = &dueAt.String
	}
	if parentID.Valid {
		record.ParentID = &parentID.String
	}
	record.IsRoot = isRoot == 1
	if completedAt.Valid {
		record.CompletedAt = &completedAt.String
	}
	if businessRecordID.Valid {
		details := &RecordBusinessDetails{
			Probability: int(probability.Int64), Impact: int(impact.Int64), Mitigation: mitigation.String,
			Occurred: occurred.Int64 == 1, Metric: metric.String, SuccessThreshold: threshold.String,
			ExperimentMethod: method.String, Verdict: verdict.String, DecisionState: decisionState.String,
			Applicability: applicability.String, SourceExcerpt: sourceExcerpt.String,
		}
		if effectiveAt.Valid {
			details.EffectiveAt = &effectiveAt.String
		}
		if reviewAt.Valid {
			details.ReviewAt = &reviewAt.String
		}
		if supersedesID.Valid {
			details.SupersedesID = &supersedesID.String
		}
		record.BusinessDetails = details
	}
	return record, err
}

func (s *Server) getRecord(ctx context.Context, id string) (Record, error) {
	record, err := scanRecord(s.store.db.QueryRowContext(ctx, recordSelect+` WHERE r.id = ?`, id))
	if err != nil {
		return Record{}, err
	}
	if user, ok := ctx.Value(userContextKey).(User); ok {
		workspaceID := workspaceIDFromContext(ctx)
		if workspaceID != "" && record.WorkspaceID != workspaceID {
			return Record{}, sql.ErrNoRows
		}
		if !s.workspaceHasMember(ctx, record.WorkspaceID, user.ID) {
			return Record{}, sql.ErrNoRows
		}
	}
	records := []Record{record}
	if err := s.attachActiveBlockers(ctx, records); err != nil {
		return Record{}, err
	}
	if err := s.attachCustomFields(ctx, records); err != nil {
		return Record{}, err
	}
	return records[0], nil
}

func (s *Server) attachActiveBlockers(ctx context.Context, records []Record) error {
	indexes := make(map[string][]int, len(records))
	placeholders := make([]string, 0, len(records))
	args := make([]any, 0, len(records))
	for index := range records {
		records[index].Blockers = make([]RecordBlocker, 0)
		if _, exists := indexes[records[index].ID]; !exists {
			placeholders = append(placeholders, "?")
			args = append(args, records[index].ID)
		}
		indexes[records[index].ID] = append(indexes[records[index].ID], index)
	}
	if len(indexes) == 0 {
		return nil
	}
	rows, err := s.store.db.QueryContext(ctx, `SELECT links.source_id, target.id,
		CASE WHEN target.business_kind <> '' THEN target.business_kind WHEN target.subtype = 'question_set' THEN 'question_set' WHEN target.record_kind = 'meeting' THEN 'meeting' ELSE target.type END,
		target.title, target.status, target.owner_id, owner.username
		FROM record_links links
		JOIN records target ON target.id = links.target_id
		JOIN users owner ON owner.id = target.owner_id
		WHERE links.source_id IN (`+strings.Join(placeholders, ",")+`)
			AND links.active = 1 AND links.relation_type = 'depends_on'
			AND target.status NOT IN ('completed', 'cancelled', 'archived', 'rejected')
		ORDER BY CASE WHEN target.due_at IS NULL THEN 1 ELSE 0 END, target.due_at, target.updated_at DESC`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var sourceID string
		var blocker RecordBlocker
		if err := rows.Scan(&sourceID, &blocker.ID, &blocker.Type, &blocker.Title, &blocker.Status, &blocker.OwnerID, &blocker.OwnerUsername); err != nil {
			return err
		}
		for _, index := range indexes[sourceID] {
			records[index].Blockers = append(records[index].Blockers, blocker)
		}
	}
	return rows.Err()
}

func (s *Server) handleListRecords(w http.ResponseWriter, r *http.Request) {
	where := []string{"r.workspace_id = ?"}
	args := []any{currentWorkspace(r).ID}
	if collectionID := strings.TrimSpace(r.URL.Query().Get("collectionId")); collectionID != "" {
		if !s.collectionBelongsToWorkspace(r.Context(), collectionID, currentWorkspace(r).ID) {
			writeError(w, http.StatusNotFound, "Доска не найдена")
			return
		}
		where = append(where, "r.collection_id = ?")
		args = append(args, collectionID)
	}
	if recordType := strings.TrimSpace(r.URL.Query().Get("type")); recordType != "" {
		if _, ok := recordTypes[recordType]; !ok {
			writeError(w, http.StatusBadRequest, "Неизвестный тип карточки")
			return
		}
		if recordType == "question_set" {
			where = append(where, "r.subtype = 'question_set' AND r.business_kind = ''")
		} else if recordType == "meeting" {
			where = append(where, "r.type = 'document' AND r.record_kind = 'meeting' AND r.business_kind = ''")
		} else if recordType == "risk" || recordType == "hypothesis" || recordType == "experiment" || recordType == "inbox" {
			where = append(where, "r.business_kind = ?")
			args = append(args, recordType)
		} else if recordType == "document" {
			where = append(where, "r.type = 'document' AND r.subtype = '' AND r.record_kind = '' AND r.business_kind = ''")
		} else {
			where = append(where, "r.type = ? AND r.subtype = '' AND r.business_kind = ''")
			args = append(args, recordType)
		}
	}
	if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
		if _, ok := recordStatuses[status]; !ok {
			writeError(w, http.StatusBadRequest, "Неизвестный статус")
			return
		}
		where = append(where, "r.status = ?")
		args = append(args, status)
	} else if r.URL.Query().Get("includeArchived") != "true" {
		where = append(where, "r.status <> 'archived'")
	}
	if owner := strings.TrimSpace(r.URL.Query().Get("ownerId")); owner != "" {
		ownerID, err := strconv.ParseInt(owner, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "Некорректный владелец")
			return
		}
		where = append(where, "r.owner_id = ?")
		args = append(args, ownerID)
	}
	if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
		where = append(where, "(r.title LIKE ? OR r.description LIKE ?)")
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	if r.URL.Query().Has("pageSize") || r.URL.Query().Has("cursor") {
		s.handleRecordPage(w, r, where, args)
		return
	}
	// Keep the array contract for existing integrations without silently truncating it.
	query := recordSelect + " WHERE " + strings.Join(where, " AND ") + " ORDER BY CASE WHEN r.due_at IS NULL THEN 1 ELSE 0 END, r.due_at, r.updated_at DESC, r.id"
	rows, err := s.store.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		log.Printf("list records: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточки")
		return
	}
	records := make([]Record, 0)
	for rows.Next() {
		record, err := scanRecord(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать карточки")
			return
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать карточки")
		return
	}
	if err := rows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить загрузку карточек")
		return
	}
	if err := s.attachActiveBlockers(r.Context(), records); err != nil {
		log.Printf("attach active blockers: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить зависимости карточек")
		return
	}
	if err := s.attachCustomFields(r.Context(), records); err != nil {
		log.Printf("attach custom fields: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить пользовательские поля")
		return
	}
	writeJSON(w, http.StatusOK, records)
}

type createRecordRequest struct {
	Type            string                     `json:"type"`
	Title           string                     `json:"title"`
	Description     string                     `json:"description"`
	Status          string                     `json:"status"`
	OwnerID         int64                      `json:"ownerId"`
	DecisionMakerID *int64                     `json:"decisionMakerId"`
	DueAt           string                     `json:"dueAt"`
	Priority        string                     `json:"priority"`
	Workstream      string                     `json:"workstream"`
	EditPolicy      string                     `json:"editPolicy"`
	ParentID        string                     `json:"parentId"`
	IsRoot          bool                       `json:"isRoot"`
	EstimateMinutes int                        `json:"estimateMinutes"`
	ActualMinutes   int                        `json:"actualMinutes"`
	Kind            string                     `json:"kind"`
	CollectionID    string                     `json:"collectionId"`
	StageID         string                     `json:"stageId"`
	CustomFields    map[string]json.RawMessage `json:"customFields"`
	BusinessDetails *businessDetailsInput      `json:"businessDetails"`
}

func defaultStatus(recordType string) string {
	switch recordType {
	case "idea":
		return "inbox"
	case "goal", "task", "question_set", "meeting", "risk", "experiment":
		return "planned"
	case "inbox":
		return "inbox"
	case "hypothesis":
		return "draft"
	case "decision":
		return "completed"
	default:
		return "draft"
	}
}

func validStatusForType(recordType, status string) bool {
	if status == "archived" {
		return true
	}
	switch recordType {
	case "idea":
		return status == "inbox" || status == "review" || status == "main" || status == "rejected"
	case "task", "risk", "experiment":
		return status == "planned" || status == "in_progress" || status == "blocked" || status == "review" || status == "completed" || status == "postponed" || status == "cancelled"
	case "goal", "question_set", "meeting":
		return status == "planned" || status == "in_progress" || status == "blocked" || status == "completed" || status == "postponed" || status == "cancelled"
	case "decision":
		return status == "completed" || status == "cancelled"
	case "hypothesis":
		return status == "draft" || status == "review" || status == "in_progress" || status == "completed" || status == "rejected" || status == "cancelled"
	case "inbox":
		return status == "inbox" || status == "archived"
	default:
		return status == "draft" || status == "in_progress" || status == "completed" || status == "cancelled"
	}
}

func validPriority(priority string) bool {
	return priority == "low" || priority == "normal" || priority == "high" || priority == "critical"
}

func validWorkstream(workstream string) bool {
	return workstream == "business" || workstream == "platform" || workstream == "operations"
}

func validEditPolicy(editPolicy string) bool {
	return editPolicy == "shared" || editPolicy == "owner_only"
}

func (s *Server) requireRecordEdit(w http.ResponseWriter, r *http.Request, record Record) bool {
	userID := currentUser(r).ID
	if record.EditPolicy == "owner_only" && userID != record.OwnerID && userID != record.AuthorID {
		writeError(w, http.StatusForbidden, "Эту карточку может изменять только постановщик или ответственный")
		return false
	}
	return true
}

func validRecordKind(databaseType, kind string) bool {
	switch kind {
	case "":
		return true
	case "preference", "limitation":
		return databaseType == "criterion"
	case "rule", "insight":
		return databaseType == "decision"
	case "meeting":
		return databaseType == "document"
	default:
		return false
	}
}

func (s *Server) handleCreateRecord(w http.ResponseWriter, r *http.Request) {
	var input createRecordRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Type = strings.TrimSpace(input.Type)
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.CollectionID = strings.TrimSpace(input.CollectionID)
	input.StageID = strings.TrimSpace(input.StageID)
	workspaceID := currentWorkspace(r).ID
	var collectionFields []CollectionField
	if input.CollectionID != "" {
		var defaultType string
		if err := s.store.db.QueryRowContext(r.Context(), `SELECT default_record_type FROM workspace_collections WHERE id = ? AND workspace_id = ? AND archived_at IS NULL`, input.CollectionID, workspaceID).Scan(&defaultType); errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusBadRequest, "Доска не найдена")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось проверить доску")
			return
		}
		if input.Type == "" {
			input.Type = defaultType
		}
		var stageCategory string
		stageQuery := `SELECT id, category FROM collection_stages WHERE collection_id = ? AND archived_at IS NULL`
		stageArgs := []any{input.CollectionID}
		if input.StageID != "" {
			stageQuery += ` AND id = ?`
			stageArgs = append(stageArgs, input.StageID)
		} else {
			stageQuery += ` ORDER BY sort_order, name LIMIT 1`
		}
		if err := s.store.db.QueryRowContext(r.Context(), stageQuery, stageArgs...).Scan(&input.StageID, &stageCategory); err != nil {
			writeError(w, http.StatusBadRequest, "У доски нет доступного этапа")
			return
		}
		input.Status = map[string]string{"backlog": "planned", "active": "in_progress", "review": "review", "done": "completed"}[stageCategory]
		var err error
		collectionFields, err = s.listCollectionFields(r.Context(), input.CollectionID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось загрузить поля доски")
			return
		}
	}
	if _, ok := recordTypes[input.Type]; !ok {
		writeError(w, http.StatusBadRequest, "Неизвестный тип карточки")
		return
	}
	titleGenerated := input.Type == "inbox" && strings.TrimSpace(input.Title) == ""
	if input.Type == "inbox" {
		if !validatePersonalText(w, &input.Title, input.Description) {
			return
		}
	} else if input.Title == "" || len(input.Title) > 240 {
		writeError(w, http.StatusBadRequest, "Название обязательно и не длиннее 240 символов")
		return
	}
	if input.Type == "decision" && input.Description == "" {
		writeError(w, http.StatusBadRequest, "Зафиксируйте содержание и основание решения")
		return
	}
	if input.Status == "" {
		input.Status = defaultStatus(input.Type)
	}
	statusValid := validStatusForType(input.Type, input.Status)
	if input.CollectionID != "" {
		_, statusValid = recordStatuses[input.Status]
	}
	if !statusValid || (input.Status == "completed" && input.Type != "decision" && input.CollectionID == "") || input.Status == "archived" {
		writeError(w, http.StatusBadRequest, "Некорректный начальный статус")
		return
	}
	user := currentUser(r)
	if input.OwnerID == 0 {
		input.OwnerID = user.ID
	}
	if !s.workspaceHasMember(r.Context(), workspaceID, input.OwnerID) || (input.DecisionMakerID != nil && !s.workspaceHasMember(r.Context(), workspaceID, *input.DecisionMakerID)) {
		writeError(w, http.StatusBadRequest, "Указанный участник не найден")
		return
	}
	if input.EstimateMinutes < 0 || input.EstimateMinutes > 525600 {
		writeError(w, http.StatusBadRequest, "Некорректная оценка времени")
		return
	}
	if input.Priority == "" {
		input.Priority = "normal"
	}
	if !validPriority(input.Priority) {
		writeError(w, http.StatusBadRequest, "Некорректный приоритет")
		return
	}
	if input.Type == "decision" {
		input.DueAt = ""
		input.EstimateMinutes = 0
		input.ActualMinutes = 0
	}
	if input.Workstream == "" {
		input.Workstream = "business"
	}
	if !validWorkstream(input.Workstream) {
		writeError(w, http.StatusBadRequest, "Некорректное направление работы")
		return
	}
	if input.EditPolicy == "" {
		input.EditPolicy = "shared"
	}
	if !validEditPolicy(input.EditPolicy) {
		writeError(w, http.StatusBadRequest, "Некорректный режим доступа")
		return
	}
	if input.ActualMinutes < 0 || input.ActualMinutes > 525600 {
		writeError(w, http.StatusBadRequest, "Некорректное фактическое время")
		return
	}
	var parentID any
	if strings.TrimSpace(input.ParentID) != "" {
		if _, err := s.getRecord(r.Context(), strings.TrimSpace(input.ParentID)); err != nil {
			writeError(w, http.StatusBadRequest, "Родительская карточка не найдена")
			return
		}
		parentID = strings.TrimSpace(input.ParentID)
		input.IsRoot = false
	}
	dueAt, err := normalizeDueAt(input.DueAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный срок")
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать идентификатор")
		return
	}
	normalizedCustomFields := make(map[string]string)
	if input.CollectionID != "" {
		temporary := Record{ID: id, WorkspaceID: workspaceID, CollectionID: input.CollectionID}
		knownFields := make(map[string]bool, len(collectionFields))
		for _, field := range collectionFields {
			knownFields[field.ID] = true
		}
		for fieldID := range input.CustomFields {
			if !knownFields[fieldID] {
				writeError(w, http.StatusBadRequest, "Одно из полей не относится к этой доске")
				return
			}
		}
		for _, field := range collectionFields {
			raw, supplied := input.CustomFields[field.ID]
			if !supplied {
				if field.Required {
					writeError(w, http.StatusBadRequest, fmt.Sprintf("Заполните обязательное поле «%s»", field.Name))
					return
				}
				continue
			}
			normalized, empty, normalizeErr := s.normalizeCollectionFieldValue(r.Context(), temporary, field, raw)
			if normalizeErr != nil {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("%s: %s", field.Name, normalizeErr.Error()))
				return
			}
			if empty {
				if field.Required {
					writeError(w, http.StatusBadRequest, fmt.Sprintf("Заполните обязательное поле «%s»", field.Name))
					return
				}
				continue
			}
			normalizedCustomFields[field.ID] = normalized
		}
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание")
		return
	}
	defer tx.Rollback()
	now := nowText()
	databaseType := input.Type
	subtype := ""
	recordKind := strings.TrimSpace(input.Kind)
	businessKind := ""
	if input.Type == "question_set" {
		databaseType = "document"
		subtype = "question_set"
		recordKind = ""
	} else if input.Type == "meeting" {
		databaseType = "document"
		recordKind = "meeting"
	} else if input.Type == "risk" {
		databaseType = "disagreement"
		businessKind = "risk"
	} else if input.Type == "hypothesis" {
		databaseType = "idea"
		businessKind = "hypothesis"
	} else if input.Type == "experiment" {
		databaseType = "research"
		businessKind = "experiment"
	} else if input.Type == "inbox" {
		databaseType = "document"
		businessKind = "inbox"
	}
	if !validRecordKind(databaseType, recordKind) {
		writeError(w, http.StatusBadRequest, "Некорректный вид карточки")
		return
	}
	completedAt := any(nil)
	progress := 0
	if input.Type == "decision" || (input.CollectionID != "" && input.Status == "completed") {
		completedAt = now
		progress = 100
	}
	var collectionID, stageID any
	if input.CollectionID != "" {
		collectionID = input.CollectionID
		stageID = input.StageID
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO records(id, workspace_id, collection_id, stage_id, type, subtype, record_kind, business_kind, title, description, status, author_id, owner_id, decision_maker_id, due_at, priority, workstream, edit_policy, parent_id, is_root, estimate_minutes, actual_minutes, progress, completed_at, created_at, updated_at, title_generated) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, workspaceID, collectionID, stageID, databaseType, subtype, recordKind, businessKind, input.Title, strings.TrimSpace(input.Description), input.Status, user.ID, input.OwnerID, input.DecisionMakerID, dueAt, input.Priority, input.Workstream, input.EditPolicy, parentID, input.IsRoot, input.EstimateMinutes, input.ActualMinutes, progress, completedAt, now, now, titleGenerated)
	if err != nil {
		log.Printf("create record: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось создать карточку")
		return
	}
	for fieldID, valueJSON := range normalizedCustomFields {
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO record_field_values(record_id, field_id, value_json, updated_by, updated_at) VALUES(?, ?, ?, ?, ?)`, id, fieldID, valueJSON, user.ID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить пользовательские поля")
			return
		}
	}
	if businessKind != "" || input.Type == "decision" || input.Type == "criterion" {
		if err := saveBusinessDetails(r.Context(), tx, id, input.Type, input.BusinessDetails, user.ID, now); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := writeActivity(r.Context(), tx, user.ID, input.Type, id, "created", "", map[string]any{"title": input.Title, "status": input.Status, "ownerId": input.OwnerID}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if input.OwnerID != user.ID {
		if err := insertNotification(r.Context(), tx, input.OwnerID, "assignment", "Назначена новая работа", fmt.Sprintf("%s назначил вам карточку «%s»", user.Username, input.Title), input.Type, id); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось создать уведомление о назначении")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание")
		return
	}
	record, _ := s.getRecord(r.Context(), id)
	writeJSON(w, http.StatusCreated, record)
}

func (s *Server) handleGetRecord(w http.ResponseWriter, r *http.Request) {
	startedAt := time.Now()
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	sections := make([]RecordSection, 0)
	if record.Type != "question_set" {
		sections, err = s.listSections(r.Context(), record)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось загрузить содержание карточки")
			return
		}
	}
	proofs := make([]Proof, 0)
	if record.Type == "task" {
		proofs, err = s.listProofs(r.Context(), record.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось загрузить доказательства задачи")
			return
		}
	}
	workflow := QuestionWorkflow{Questions: make([]QuestionItem, 0)}
	if record.Type == "question_set" {
		workflow, err = s.listQuestionWorkflow(r.Context(), record.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось загрузить вопросы")
			return
		}
	}
	var derivation *RecordDerivation
	var origin RecordDerivation
	err = s.store.db.QueryRowContext(r.Context(), `
		SELECT d.source_record_id, source.title, COALESCE(d.source_question_id, ''), COALESCE(q.body, ''),
			COALESCE(d.source_decision_id, ''), d.source_excerpt, d.created_at
		FROM record_derivations d
		JOIN records source ON source.id = d.source_record_id
		LEFT JOIN question_items q ON q.id = d.source_question_id
		WHERE d.output_record_id = ?`, record.ID).Scan(&origin.SourceRecordID, &origin.SourceRecordTitle, &origin.SourceQuestionID, &origin.QuestionBody, &origin.SourceDecisionID, &origin.DecisionContent, &origin.CreatedAt)
	if err == nil {
		derivation = &origin
	} else if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить происхождение карточки")
		return
	}
	w.Header().Set("Server-Timing", fmt.Sprintf("record-detail;dur=%.2f", float64(time.Since(startedAt).Microseconds())/1000))
	writeJSON(w, http.StatusOK, map[string]any{
		"record": record, "sections": sections, "links": []RecordLink{}, "scores": []CriterionScore{}, "scoreDecisions": []CriterionDecision{},
		"proofs": proofs, "questionWorkflow": workflow, "derivation": derivation, "relationsLoaded": false,
	})
}

func (s *Server) handleGetRecordRelations(w http.ResponseWriter, r *http.Request) {
	startedAt := time.Now()
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	links, err := s.listLinks(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить связи")
		return
	}
	scores := make([]CriterionScore, 0)
	if record.Type != "criterion" {
		scores, err = s.listScores(r.Context(), record.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось загрузить оценки")
			return
		}
	}
	decisions, err := s.listCriterionDecisions(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить принятые итоги")
		return
	}
	researchOptions := make([]ResearchRelationOption, 0)
	if record.Type == "research" {
		var comparisonErr error
		researchOptions, comparisonErr = s.listResearchRelationOptions(r.Context(), record.ID)
		if comparisonErr != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось загрузить внутренние связи исследования")
			return
		}
	}
	w.Header().Set("Server-Timing", fmt.Sprintf("record-relations;dur=%.2f", float64(time.Since(startedAt).Microseconds())/1000))
	writeJSON(w, http.StatusOK, map[string]any{"links": links, "scores": scores, "scoreDecisions": decisions, "researchOptions": researchOptions})
}

type updateRecordRequest struct {
	CriterionWeight    *float64              `json:"criterionWeight"`
	Title              *string               `json:"title"`
	Description        *string               `json:"description"`
	Status             *string               `json:"status"`
	OwnerID            *int64                `json:"ownerId"`
	DecisionMakerID    *int64                `json:"decisionMakerId"`
	ClearDecisionMaker bool                  `json:"clearDecisionMaker"`
	DueAt              *string               `json:"dueAt"`
	Priority           *string               `json:"priority"`
	Workstream         *string               `json:"workstream"`
	EditPolicy         *string               `json:"editPolicy"`
	ParentID           *string               `json:"parentId"`
	ClearParent        bool                  `json:"clearParent"`
	IsRoot             *bool                 `json:"isRoot"`
	EstimateMinutes    *int                  `json:"estimateMinutes"`
	ActualMinutes      *int                  `json:"actualMinutes"`
	Progress           *int                  `json:"progress"`
	ProgressNote       *string               `json:"progressNote"`
	Result             *string               `json:"result"`
	Reason             string                `json:"reason"`
	ExpectedUpdatedAt  *string               `json:"expectedUpdatedAt"`
	BusinessDetails    *businessDetailsInput `json:"businessDetails"`
}

func (s *Server) handleUpdateRecord(w http.ResponseWriter, r *http.Request) {
	before, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	if !s.requireRecordEdit(w, r, before) {
		return
	}
	var input updateRecordRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	if currentUser(r).ID != before.OwnerID && currentUser(r).ID != before.AuthorID && (input.OwnerID != nil || input.EditPolicy != nil) {
		writeError(w, http.StatusForbidden, "Только постановщик или текущий ответственный может менять владельца и режим доступа")
		return
	}
	if input.ExpectedUpdatedAt != nil && *input.ExpectedUpdatedAt != before.UpdatedAt {
		writeError(w, http.StatusConflict, "Карточка уже изменена другим пользователем. Обновите её и повторите правку")
		return
	}
	updates := make([]string, 0)
	args := make([]any, 0)
	changes := make(map[string]any)
	reasonRequired := false
	businessDetailsChanged := false
	var nextBusinessDetails RecordBusinessDetails
	add := func(column string, value any) { updates = append(updates, column+" = ?"); args = append(args, value) }
	if before.Type == "inbox" && (input.Title != nil || input.Description != nil) {
		title, description := before.Title, before.Description
		if input.Title != nil {
			title = *input.Title
			add("title_generated", strings.TrimSpace(title) == "")
		}
		if input.Description != nil {
			description = *input.Description
		}
		if !validatePersonalText(w, &title, description) {
			return
		}
		input.Title = &title
	}
	if input.Title != nil {
		value := strings.TrimSpace(*input.Title)
		if value == "" || (before.Type != "inbox" && len(value) > 240) {
			writeError(w, http.StatusBadRequest, "Некорректное название")
			return
		}
		if value != before.Title {
			add("title", value)
			changes["title"] = map[string]any{"before": before.Title, "after": value}
		}
	}
	if input.Description != nil {
		value := strings.TrimSpace(*input.Description)
		if before.Type == "decision" && before.Description != "" && value == "" {
			writeError(w, http.StatusBadRequest, "Принятое решение нельзя оставить без содержания и основания")
			return
		}
		if value != before.Description {
			add("description", value)
			changes["description"] = map[string]any{"before": before.Description, "after": value}
		}
	}
	if input.Status != nil {
		if !validStatusForType(before.Type, *input.Status) {
			writeError(w, http.StatusBadRequest, "Статус не подходит типу карточки")
			return
		}
		if before.Type == "task" && *input.Status == "completed" && before.Status != "completed" {
			writeError(w, http.StatusBadRequest, "Задача завершается только с доказательством")
			return
		}
		if before.Type == "question_set" && *input.Status == "completed" && before.Status != "completed" {
			var total, unresolved int
			if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*), COALESCE(SUM(CASE WHEN status <> 'resolved' THEN 1 ELSE 0 END), 0) FROM question_items WHERE record_id = ? AND status <> 'archived'`, before.ID).Scan(&total, &unresolved); err != nil || total == 0 || unresolved > 0 {
				writeError(w, http.StatusBadRequest, "Карточку можно завершить после общего решения по каждому вопросу")
				return
			}
		}
		if before.Type == "research" && *input.Status == "completed" && before.Status != "completed" {
			writeError(w, http.StatusBadRequest, "Завершите исследование отдельным действием после фиксации вывода")
			return
		}
		if *input.Status != before.Status {
			if before.CollectionID != "" {
				category := collectionCategoryForStatus(*input.Status)
				var stageID string
				if err := s.store.db.QueryRowContext(r.Context(), `SELECT id FROM collection_stages WHERE collection_id = ? AND category = ? AND archived_at IS NULL ORDER BY sort_order LIMIT 1`, before.CollectionID, category).Scan(&stageID); err == nil {
					add("stage_id", stageID)
				}
			}
			add("status", *input.Status)
			changes["status"] = map[string]any{"before": before.Status, "after": *input.Status}
			reasonRequired = true
			if *input.Status == "archived" {
				add("archived_at", nowText())
			}
			if *input.Status == "completed" {
				add("completed_at", nowText())
				add("progress", 100)
			} else if *input.Status != "archived" && *input.Status != "cancelled" && *input.Status != "rejected" {
				add("completed_at", nil)
				if before.Status == "completed" && input.Progress == nil {
					add("progress", 0)
				}
			}
		}
	}
	if input.OwnerID != nil {
		if !s.workspaceHasMember(r.Context(), before.WorkspaceID, *input.OwnerID) {
			writeError(w, http.StatusBadRequest, "Ответственный не найден")
			return
		}
		if *input.OwnerID != before.OwnerID {
			add("owner_id", *input.OwnerID)
			changes["ownerId"] = map[string]any{"before": before.OwnerID, "after": *input.OwnerID}
		}
	}
	if input.DecisionMakerID != nil {
		if !s.workspaceHasMember(r.Context(), before.WorkspaceID, *input.DecisionMakerID) {
			writeError(w, http.StatusBadRequest, "Участник не найден")
			return
		}
		if before.DecisionMakerID == nil || *before.DecisionMakerID != *input.DecisionMakerID {
			add("decision_maker_id", *input.DecisionMakerID)
			changes["decisionMakerId"] = map[string]any{"before": before.DecisionMakerID, "after": *input.DecisionMakerID}
		}
	} else if input.ClearDecisionMaker && before.DecisionMakerID != nil {
		add("decision_maker_id", nil)
		changes["decisionMakerId"] = map[string]any{"before": before.DecisionMakerID, "after": nil}
	}
	if input.DueAt != nil {
		if before.Type == "decision" {
			writeError(w, http.StatusBadRequest, "У принятого решения нет срока выполнения")
			return
		}
		dueAt, err := normalizeDueAt(*input.DueAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "Некорректный срок")
			return
		}
		if !nullableStringEqual(before.DueAt, dueAt) {
			add("due_at", dueAt)
			changes["dueAt"] = map[string]any{"before": before.DueAt, "after": dueAt}
			reasonRequired = true
		}
	}
	if input.Priority != nil {
		if !validPriority(*input.Priority) {
			writeError(w, http.StatusBadRequest, "Некорректный приоритет")
			return
		}
		if *input.Priority != before.Priority {
			add("priority", *input.Priority)
			changes["priority"] = map[string]any{"before": before.Priority, "after": *input.Priority}
		}
	}
	if input.Workstream != nil {
		if !validWorkstream(*input.Workstream) {
			writeError(w, http.StatusBadRequest, "Некорректное направление работы")
			return
		}
		if *input.Workstream != before.Workstream {
			add("workstream", *input.Workstream)
			changes["workstream"] = map[string]any{"before": before.Workstream, "after": *input.Workstream}
		}
	}
	if input.EditPolicy != nil {
		if !validEditPolicy(*input.EditPolicy) {
			writeError(w, http.StatusBadRequest, "Некорректный режим доступа")
			return
		}
		if *input.EditPolicy != before.EditPolicy {
			add("edit_policy", *input.EditPolicy)
			changes["editPolicy"] = map[string]any{"before": before.EditPolicy, "after": *input.EditPolicy}
		}
	}
	if input.ParentID != nil {
		parentID := strings.TrimSpace(*input.ParentID)
		if parentID == before.ID {
			writeError(w, http.StatusBadRequest, "Карточка не может быть родителем самой себе")
			return
		}
		if parentID == "" {
			input.ClearParent = true
		} else {
			if _, err := s.getRecord(r.Context(), parentID); err != nil {
				writeError(w, http.StatusBadRequest, "Родительская карточка не найдена")
				return
			}
			createsCycle, err := s.parentCreatesCycle(r.Context(), before.ID, parentID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "Не удалось проверить иерархию")
				return
			}
			if createsCycle {
				writeError(w, http.StatusBadRequest, "Такая иерархия создаёт цикл")
				return
			}
			if before.ParentID == nil || *before.ParentID != parentID {
				add("parent_id", parentID)
				add("is_root", 0)
				changes["parentId"] = map[string]any{"before": before.ParentID, "after": parentID}
				reasonRequired = true
			}
		}
	}
	if input.ClearParent && before.ParentID != nil {
		add("parent_id", nil)
		changes["parentId"] = map[string]any{"before": before.ParentID, "after": nil}
		reasonRequired = true
	}
	if input.IsRoot != nil && *input.IsRoot != before.IsRoot {
		add("is_root", *input.IsRoot)
		changes["isRoot"] = map[string]any{"before": before.IsRoot, "after": *input.IsRoot}
		reasonRequired = true
		if *input.IsRoot && before.ParentID != nil && !input.ClearParent {
			add("parent_id", nil)
			changes["parentId"] = map[string]any{"before": before.ParentID, "after": nil}
		}
	}
	if input.CriterionWeight != nil {
		weight := *input.CriterionWeight
		if before.Type != "criterion" || weight < 0 || weight > 100 {
			writeError(w, http.StatusBadRequest, "Вес критерия должен быть от 0 до 100")
			return
		}
		if weight != before.CriterionWeight {
			add("criterion_weight", weight)
			changes["criterionWeight"] = map[string]any{"before": before.CriterionWeight, "after": weight}
		}
	}
	if input.EstimateMinutes != nil {
		if before.Type == "decision" {
			writeError(w, http.StatusBadRequest, "Решение не является работой и не имеет оценки времени")
			return
		}
		if *input.EstimateMinutes < 0 || *input.EstimateMinutes > 525600 {
			writeError(w, http.StatusBadRequest, "Некорректная оценка времени")
			return
		}
		if *input.EstimateMinutes != before.EstimateMinutes {
			add("estimate_minutes", *input.EstimateMinutes)
			changes["estimateMinutes"] = map[string]any{"before": before.EstimateMinutes, "after": *input.EstimateMinutes}
		}
	}
	if input.ActualMinutes != nil {
		if before.Type == "decision" {
			writeError(w, http.StatusBadRequest, "Решение не является работой и не имеет фактического времени")
			return
		}
		if *input.ActualMinutes < 0 || *input.ActualMinutes > 525600 {
			writeError(w, http.StatusBadRequest, "Некорректное фактическое время")
			return
		}
		if *input.ActualMinutes != before.ActualMinutes {
			add("actual_minutes", *input.ActualMinutes)
			changes["actualMinutes"] = map[string]any{"before": before.ActualMinutes, "after": *input.ActualMinutes}
		}
	}
	if input.Progress != nil {
		if before.Type == "decision" || before.Type == "research" {
			writeError(w, http.StatusBadRequest, "Прогресс этой карточки рассчитывается автоматически")
			return
		}
		if *input.Progress < 0 || *input.Progress > 100 {
			writeError(w, http.StatusBadRequest, "Прогресс должен быть от 0 до 100")
			return
		}
		if *input.Progress != before.Progress {
			add("progress", *input.Progress)
			changes["progress"] = map[string]any{"before": before.Progress, "after": *input.Progress}
			if input.Status == nil && before.Status == "planned" && *input.Progress > 0 {
				add("status", "in_progress")
				changes["status"] = map[string]any{"before": before.Status, "after": "in_progress"}
			}
		}
	}
	if input.ProgressNote != nil {
		value := strings.TrimSpace(*input.ProgressNote)
		if value != before.ProgressNote {
			add("progress_note", value)
			changes["progressNote"] = map[string]any{"before": before.ProgressNote, "after": value}
		}
	}
	if input.Result != nil {
		value := strings.TrimSpace(*input.Result)
		if value != before.Result {
			add("result", value)
			changes["result"] = map[string]any{"before": before.Result, "after": value}
		}
	}
	if input.BusinessDetails != nil {
		nextBusinessDetails, err = normalizeBusinessDetails(before.Type, input.BusinessDetails, nowText())
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		beforeMap := businessDetailsMap(before.BusinessDetails)
		afterMap := businessDetailsMap(&nextBusinessDetails)
		businessDetailsChanged = !reflect.DeepEqual(beforeMap, afterMap)
		if businessDetailsChanged {
			changes["businessDetails"] = map[string]any{"before": beforeMap, "after": afterMap}
			if beforeMap["decisionState"] != afterMap["decisionState"] || !reflect.DeepEqual(beforeMap["supersedesId"], afterMap["supersedesId"]) || beforeMap["occurred"] != afterMap["occurred"] {
				reasonRequired = true
			}
		}
	}
	if input.Status != nil && (before.Type == "hypothesis" || before.Type == "experiment") && (*input.Status == "completed" || *input.Status == "rejected") {
		details := before.BusinessDetails
		if input.BusinessDetails != nil {
			details = &nextBusinessDetails
		}
		if details == nil || details.Verdict == "" || details.Verdict == "pending" {
			writeError(w, http.StatusBadRequest, "Сначала зафиксируйте итог проверки гипотезы")
			return
		}
		result := before.Result
		if input.Result != nil {
			result = strings.TrimSpace(*input.Result)
		}
		if result == "" {
			writeError(w, http.StatusBadRequest, "Зафиксируйте вывод проверки перед завершением")
			return
		}
	}
	if reasonRequired && strings.TrimSpace(input.Reason) == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину изменения статуса, срока или места карточки в иерархии")
		return
	}
	if len(updates) == 0 && !businessDetailsChanged {
		writeError(w, http.StatusBadRequest, "Нет изменений")
		return
	}
	now := nowText()
	add("updated_at", now)
	args = append(args, before.ID)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	// Check the supplied version at the write, including concurrent weight edits.
	versionClause := ""
	if input.ExpectedUpdatedAt != nil {
		versionClause = " AND updated_at = ?"
		args = append(args, *input.ExpectedUpdatedAt)
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE records SET `+strings.Join(updates, ", ")+` WHERE id = ?`+versionClause, args...)
	if err != nil {
		log.Printf("update record: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить карточку")
		return
	}
	if changed, err := result.RowsAffected(); err != nil || changed != 1 {
		writeError(w, http.StatusConflict, "Карточка уже изменена. Обновите её и повторите правку")
		return
	}
	user := currentUser(r)
	if businessDetailsChanged {
		businessInput := *input.BusinessDetails
		if nextBusinessDetails.EffectiveAt != nil {
			businessInput.EffectiveAt = *nextBusinessDetails.EffectiveAt
		}
		if nextBusinessDetails.ReviewAt != nil {
			businessInput.ReviewAt = *nextBusinessDetails.ReviewAt
		}
		if err := saveBusinessDetails(r.Context(), tx, before.ID, before.Type, &businessInput, user.ID, now); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := writeActivity(r.Context(), tx, user.ID, before.Type, before.ID, "updated", strings.TrimSpace(input.Reason), changes); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if input.OwnerID != nil && *input.OwnerID != before.OwnerID && *input.OwnerID != user.ID {
		if err := insertNotification(r.Context(), tx, *input.OwnerID, "assignment", "Работа переназначена", fmt.Sprintf("%s назначил вам карточку «%s»", user.Username, before.Title), before.Type, before.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось создать уведомление о назначении")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение")
		return
	}
	after, _ := s.getRecord(r.Context(), before.ID)
	writeJSON(w, http.StatusOK, after)
}

func nullableStringEqual(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func (s *Server) parentCreatesCycle(ctx context.Context, childID, parentID string) (bool, error) {
	current := parentID
	for depth := 0; depth < 256 && current != ""; depth++ {
		if current == childID {
			return true, nil
		}
		var next sql.NullString
		err := s.store.db.QueryRowContext(ctx, `SELECT parent_id FROM records WHERE id = ?`, current).Scan(&next)
		if err != nil {
			return false, err
		}
		if !next.Valid {
			return false, nil
		}
		current = next.String
	}
	return current != "", nil
}

func (s *Server) handleConvertToQuestions(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	if record.Type == "question_set" {
		writeError(w, http.StatusConflict, "Это уже карточка вопросов")
		return
	}
	if record.Type != "task" {
		writeError(w, http.StatusConflict, "В карточку вопросов можно преобразовать только задачу")
		return
	}
	if record.Status == "archived" {
		writeError(w, http.StatusConflict, "Сначала верните карточку из архива")
		return
	}
	var input struct {
		Reason            string  `json:"reason"`
		ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину преобразования")
		return
	}
	if input.ExpectedUpdatedAt != nil && *input.ExpectedUpdatedAt != record.UpdatedAt {
		writeError(w, http.StatusConflict, "Карточка уже изменена. Откройте её заново")
		return
	}
	var filledSections, proofs int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT
		(SELECT COUNT(*) FROM record_sections WHERE record_id = ? AND TRIM(content) <> ''),
		(SELECT COUNT(*) FROM task_proofs WHERE record_id = ?)`, record.ID, record.ID).Scan(&filledSections, &proofs); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить содержимое карточки")
		return
	}
	if filledSections > 0 || proofs > 0 || strings.TrimSpace(record.Result) != "" {
		writeError(w, http.StatusConflict, "В карточке уже есть рабочие разделы, результат или доказательства. Перенесите их в описание перед преобразованием")
		return
	}
	status := "planned"
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать преобразование")
		return
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(r.Context(), `UPDATE records SET type = 'document', subtype = 'question_set', status = ?, progress = 0, progress_note = '', completed_at = NULL, updated_at = ? WHERE id = ? AND type = 'task' AND updated_at = ?`, status, now, record.ID, record.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось преобразовать карточку")
		return
	}
	updated, err := result.RowsAffected()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить результат преобразования")
		return
	}
	if updated != 1 {
		writeError(w, http.StatusConflict, "Карточка уже изменена. Откройте её заново")
		return
	}
	changes := map[string]any{"type": map[string]any{"before": record.Type, "after": "question_set"}}
	if record.Status != status {
		changes["status"] = map[string]any{"before": record.Status, "after": status}
	}
	if record.Progress != 0 {
		changes["progress"] = map[string]any{"before": record.Progress, "after": 0}
	}
	user := currentUser(r)
	if err := writeActivity(r.Context(), tx, user.ID, "question_set", record.ID, "converted_to_questions", input.Reason, changes); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю преобразования")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить преобразование")
		return
	}
	after, err := s.getRecord(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Карточка преобразована, но не загрузилась")
		return
	}
	writeJSON(w, http.StatusOK, after)
}

func (s *Server) handleArchiveRecord(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.Reason) == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину архивации")
		return
	}
	status := "archived"
	s.handleUpdateRecordWithInput(w, r, updateRecordRequest{Status: &status, Reason: input.Reason})
}

func (s *Server) handleUpdateRecordWithInput(w http.ResponseWriter, r *http.Request, input updateRecordRequest) {
	// Archive is intentionally implemented explicitly because request bodies can only be decoded once.
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать архивацию")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`, now, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось архивировать карточку")
		return
	}
	user := currentUser(r)
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "archived", input.Reason, map[string]any{"status": map[string]any{"before": record.Status, "after": "archived"}}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить архивацию")
		return
	}
	archived, _ := s.getRecord(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, archived)
}

func (s *Server) userExists(ctx context.Context, id int64) bool {
	var count int
	return s.store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE id = ?`, id).Scan(&count) == nil && count == 1
}

func (s *Server) listSections(ctx context.Context, record Record) ([]RecordSection, error) {
	rows, err := s.store.db.QueryContext(ctx, `
		SELECT COALESCE(rs.id, ''), rs.record_id, d.id, COALESCE(o.name,d.name), COALESCE(rs.content, ''), COALESCE(o.sort_order,d.sort_order),
			COALESCE(rs.updated_by, 0), COALESCE(u.username, ''), COALESCE(rs.updated_at, d.updated_at), COALESCE(o.active,d.active)=0
		FROM section_definitions d
		LEFT JOIN workspace_section_overrides o ON o.definition_id=d.id AND o.workspace_id=?
		LEFT JOIN record_sections rs ON rs.definition_id = d.id AND rs.record_id = ?
		LEFT JOIN users u ON u.id = rs.updated_by
		WHERE (d.scope_type IS NULL OR d.scope_type = ?) AND (d.workspace_id IS NULL OR d.workspace_id=? OR rs.id IS NOT NULL) AND (COALESCE(o.active,d.active) = 1 OR rs.id IS NOT NULL)
		UNION ALL
		SELECT rs.id, rs.record_id, NULL, rs.title, rs.content, rs.sort_order, rs.updated_by, u.username, rs.updated_at, 0
		FROM record_sections rs JOIN users u ON u.id = rs.updated_by
		WHERE rs.record_id = ? AND rs.definition_id IS NULL
		ORDER BY 6, 9`, record.WorkspaceID, record.ID, record.Type, record.WorkspaceID, record.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sections := make([]RecordSection, 0)
	for rows.Next() {
		var section RecordSection
		var recordID, definitionID sql.NullString
		if err := rows.Scan(&section.ID, &recordID, &definitionID, &section.Title, &section.Content, &section.SortOrder, &section.UpdatedBy, &section.UpdatedByName, &section.UpdatedAt, &section.Hidden); err != nil {
			return nil, err
		}
		section.RecordID = record.ID
		if definitionID.Valid {
			section.DefinitionID = &definitionID.String
		}
		sections = append(sections, section)
	}
	return sections, rows.Err()
}

func (s *Server) handleSections(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	sections, err := s.listSections(r.Context(), record)
	if err != nil {
		log.Printf("list sections: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить разделы")
		return
	}
	writeJSON(w, http.StatusOK, sections)
}

func (s *Server) handleSaveSection(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		DefinitionID *string `json:"definitionId"`
		SectionID    string  `json:"sectionId"`
		Title        string  `json:"title"`
		Content      string  `json:"content"`
		Reason       string  `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Content = strings.TrimSpace(input.Content)
	if input.DefinitionID == nil && input.Title == "" {
		writeError(w, http.StatusBadRequest, "Укажите название раздела")
		return
	}
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать сохранение")
		return
	}
	defer tx.Rollback()
	now := nowText()
	sectionID := strings.TrimSpace(input.SectionID)
	before := ""
	if input.DefinitionID != nil {
		var definitionName, scope sql.NullString
		if err := tx.QueryRowContext(r.Context(), `SELECT COALESCE(o.name,d.name), d.scope_type FROM section_definitions d LEFT JOIN workspace_section_overrides o ON o.definition_id=d.id AND o.workspace_id=? WHERE d.id = ? AND (d.workspace_id IS NULL OR d.workspace_id=? OR EXISTS(SELECT 1 FROM record_sections WHERE record_id=? AND definition_id=d.id))`, record.WorkspaceID, *input.DefinitionID, record.WorkspaceID, record.ID).Scan(&definitionName, &scope); err != nil {
			writeError(w, http.StatusBadRequest, "Раздел не найден")
			return
		}
		if scope.Valid && scope.String != record.Type {
			writeError(w, http.StatusBadRequest, "Раздел не подходит типу карточки")
			return
		}
		input.Title = definitionName.String
		err := tx.QueryRowContext(r.Context(), `SELECT id, content FROM record_sections WHERE record_id = ? AND definition_id = ?`, record.ID, *input.DefinitionID).Scan(&sectionID, &before)
		if errors.Is(err, sql.ErrNoRows) {
			sectionID, _ = newID()
			_, err = tx.ExecContext(r.Context(), `INSERT INTO record_sections(id, record_id, definition_id, title, content, sort_order, created_by, updated_by, created_at, updated_at) SELECT ?, ?, d.id, ?, ?, COALESCE(o.sort_order,d.sort_order), ?, ?, ?, ? FROM section_definitions d LEFT JOIN workspace_section_overrides o ON o.definition_id=d.id AND o.workspace_id=? WHERE d.id = ?`, sectionID, record.ID, input.Title, input.Content, user.ID, user.ID, now, now, record.WorkspaceID, *input.DefinitionID)
		} else if err == nil {
			_, err = tx.ExecContext(r.Context(), `UPDATE record_sections SET content = ?, updated_by = ?, updated_at = ? WHERE id = ?`, input.Content, user.ID, now, sectionID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить раздел")
			return
		}
	} else {
		if sectionID == "" {
			sectionID, _ = newID()
			var sortOrder int
			_ = tx.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), 0) + 10 FROM record_sections WHERE record_id = ?`, record.ID).Scan(&sortOrder)
			_, err = tx.ExecContext(r.Context(), `INSERT INTO record_sections(id, record_id, title, content, sort_order, created_by, updated_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, sectionID, record.ID, input.Title, input.Content, sortOrder, user.ID, user.ID, now, now)
		} else {
			if err := tx.QueryRowContext(r.Context(), `SELECT content FROM record_sections WHERE id = ? AND record_id = ? AND definition_id IS NULL`, sectionID, record.ID).Scan(&before); err != nil {
				writeError(w, http.StatusNotFound, "Раздел не найден")
				return
			}
			_, err = tx.ExecContext(r.Context(), `UPDATE record_sections SET title = ?, content = ?, updated_by = ?, updated_at = ? WHERE id = ?`, input.Title, input.Content, user.ID, now, sectionID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить раздел")
			return
		}
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "section_updated", input.Reason, map[string]any{"sectionId": sectionID, "section": input.Title, "before": before, "after": input.Content}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить сохранение")
		return
	}
	sections, _ := s.listSections(r.Context(), record)
	writeJSON(w, http.StatusOK, sections)
}

func (s *Server) listLinks(ctx context.Context, recordID string) ([]RecordLink, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT l.id, l.source_id, l.target_id, l.relation_type, l.created_at, r.id, CASE WHEN r.business_kind <> '' THEN r.business_kind WHEN r.subtype = 'question_set' THEN 'question_set' WHEN r.record_kind = 'meeting' THEN 'meeting' ELSE r.type END, r.record_kind, r.title, r.description, r.status, r.author_id, a.username, r.owner_id, o.username, r.decision_maker_id, dm.username, r.due_at, r.priority, r.workstream, r.edit_policy, r.parent_id, r.is_root, r.estimate_minutes, r.actual_minutes, r.progress, r.progress_note, r.result, r.completed_at, r.created_at, r.updated_at, (SELECT COUNT(*) FROM task_proofs p WHERE p.record_id = r.id) FROM record_links l JOIN records r ON r.id = CASE WHEN l.source_id = ? THEN l.target_id ELSE l.source_id END JOIN users a ON a.id = r.author_id JOIN users o ON o.id = r.owner_id LEFT JOIN users dm ON dm.id = r.decision_maker_id WHERE l.active = 1 AND (l.source_id = ? OR l.target_id = ?) ORDER BY l.created_at DESC`, recordID, recordID, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	links := make([]RecordLink, 0)
	for rows.Next() {
		var link RecordLink
		var dmID sql.NullInt64
		var dmName, dueAt, parentID, completedAt sql.NullString
		var isRoot int
		if err := rows.Scan(&link.ID, &link.SourceID, &link.TargetID, &link.RelationType, &link.CreatedAt, &link.Record.ID, &link.Record.Type, &link.Record.Kind, &link.Record.Title, &link.Record.Description, &link.Record.Status, &link.Record.AuthorID, &link.Record.AuthorUsername, &link.Record.OwnerID, &link.Record.OwnerUsername, &dmID, &dmName, &dueAt, &link.Record.Priority, &link.Record.Workstream, &link.Record.EditPolicy, &parentID, &isRoot, &link.Record.EstimateMinutes, &link.Record.ActualMinutes, &link.Record.Progress, &link.Record.ProgressNote, &link.Record.Result, &completedAt, &link.Record.CreatedAt, &link.Record.UpdatedAt, &link.Record.ProofCount); err != nil {
			return nil, err
		}
		if dmID.Valid {
			link.Record.DecisionMakerID = &dmID.Int64
		}
		if dmName.Valid {
			link.Record.DecisionMakerName = &dmName.String
		}
		if dueAt.Valid {
			link.Record.DueAt = &dueAt.String
		}
		if parentID.Valid {
			link.Record.ParentID = &parentID.String
		}
		link.Record.IsRoot = isRoot == 1
		if completedAt.Valid {
			link.Record.CompletedAt = &completedAt.String
		}
		links = append(links, link)
	}
	return links, rows.Err()
}

func (s *Server) handleCreateLink(w http.ResponseWriter, r *http.Request) {
	source, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	if !s.requireRecordEdit(w, r, source) {
		return
	}
	var input struct {
		TargetID     string `json:"targetId"`
		RelationType string `json:"relationType"`
		Reason       string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.TargetID == source.ID {
		writeError(w, http.StatusBadRequest, "Нельзя связать карточку с самой собой")
		return
	}
	if _, err := s.getRecord(r.Context(), input.TargetID); err != nil {
		writeError(w, http.StatusBadRequest, "Связанная карточка не найдена")
		return
	}
	input.RelationType = strings.TrimSpace(input.RelationType)
	if input.RelationType == "" {
		input.RelationType = "related"
	}
	if len(input.RelationType) > 64 {
		writeError(w, http.StatusBadRequest, "Тип связи слишком длинный")
		return
	}
	id, _ := newID()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание связи")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO record_links(id, source_id, target_id, relation_type, created_by, created_at) VALUES(?, ?, ?, ?, ?, ?)`, id, source.ID, input.TargetID, input.RelationType, user.ID, nowText()); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "Такая связь уже существует")
		} else {
			writeError(w, http.StatusInternalServerError, "Не удалось создать связь")
		}
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, source.Type, source.ID, "link_created", input.Reason, map[string]any{"linkId": id, "targetId": input.TargetID, "relationType": input.RelationType}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание связи")
		return
	}
	links, _ := s.listLinks(r.Context(), source.ID)
	writeJSON(w, http.StatusCreated, links)
}

func (s *Server) handleRemoveLink(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.Reason) == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину удаления связи")
		return
	}
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(r.Context(), `UPDATE record_links SET active = 0, removed_by = ?, removed_at = ? WHERE id = ? AND active = 1 AND (source_id = ? OR target_id = ?)`, user.ID, nowText(), r.PathValue("linkId"), record.ID, record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось удалить связь")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(w, http.StatusNotFound, "Связь не найдена")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "link_removed", input.Reason, map[string]any{"linkId": r.PathValue("linkId")}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение")
		return
	}
	links, _ := s.listLinks(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, links)
}

func (s *Server) listProofs(ctx context.Context, recordID string) ([]Proof, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT p.id, p.record_id, p.author_id, u.username, p.kind, p.content, p.created_at FROM task_proofs p JOIN users u ON u.id = p.author_id WHERE p.record_id = ? ORDER BY p.created_at DESC`, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	proofs := make([]Proof, 0)
	for rows.Next() {
		var proof Proof
		if err := rows.Scan(&proof.ID, &proof.RecordID, &proof.AuthorID, &proof.AuthorUsername, &proof.Kind, &proof.Content, &proof.CreatedAt); err != nil {
			return nil, err
		}
		proofs = append(proofs, proof)
	}
	return proofs, rows.Err()
}

func (s *Server) handleAddProof(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil || record.Type != "task" {
		writeError(w, http.StatusNotFound, "Задача не найдена")
		return
	}
	user := currentUser(r)
	if record.OwnerID != user.ID && record.EditPolicy != "shared" {
		writeError(w, http.StatusForbidden, "Доказательство добавляет ответственный за задачу")
		return
	}
	var input struct {
		Kind    string `json:"kind"`
		Content string `json:"content"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Kind = strings.TrimSpace(input.Kind)
	input.Content = strings.TrimSpace(input.Content)
	if input.Kind != "text" && input.Kind != "link" {
		writeError(w, http.StatusBadRequest, "Неизвестный тип доказательства")
		return
	}
	if input.Content == "" || len(input.Content) > 20000 {
		writeError(w, http.StatusBadRequest, "Доказательство обязательно и не длиннее 20000 символов")
		return
	}
	id, _ := newID()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать сохранение")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO task_proofs(id, record_id, author_id, kind, content, created_at) VALUES(?, ?, ?, ?, ?, ?)`, id, record.ID, user.ID, input.Kind, input.Content, nowText()); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить доказательство")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "task", record.ID, "proof_added", "", map[string]any{"proofId": id, "kind": input.Kind}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить сохранение")
		return
	}
	proofs, _ := s.listProofs(r.Context(), record.ID)
	writeJSON(w, http.StatusCreated, proofs)
}

func (s *Server) handleCompleteTask(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil || record.Type != "task" {
		writeError(w, http.StatusNotFound, "Задача не найдена")
		return
	}
	user := currentUser(r)
	if record.OwnerID != user.ID && record.EditPolicy != "shared" {
		writeError(w, http.StatusForbidden, "Задачу завершает назначенный ответственный")
		return
	}
	var input struct {
		Result         string `json:"result"`
		NotifyPartners bool   `json:"notifyPartners"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Result = strings.TrimSpace(input.Result)
	if input.Result == "" {
		writeError(w, http.StatusBadRequest, "Кратко опишите полученный результат")
		return
	}
	var proofCount int
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM task_proofs WHERE record_id = ?`, record.ID).Scan(&proofCount)
	if proofCount == 0 {
		writeError(w, http.StatusConflict, "Сначала добавьте доказательство выполнения")
		return
	}
	if record.AuthorID != record.OwnerID || record.DecisionMakerID != nil {
		reviewerID := record.AuthorID
		if record.DecisionMakerID != nil {
			reviewerID = *record.DecisionMakerID
		}
		tx, err := s.store.db.BeginTx(r.Context(), nil)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось начать приёмку")
			return
		}
		defer tx.Rollback()
		now := nowText()
		eventID, _ := newID()
		if _, err := tx.ExecContext(r.Context(), `UPDATE records SET stage_id = COALESCE((SELECT id FROM collection_stages WHERE collection_id = records.collection_id AND category = 'review' AND archived_at IS NULL ORDER BY sort_order LIMIT 1), stage_id), status = 'review', progress = 100, result = ?, completed_at = NULL, updated_at = ? WHERE id = ?`, input.Result, now, record.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось отправить результат на проверку")
			return
		}
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO task_review_events(id, record_id, actor_id, action, created_at) VALUES(?, ?, ?, 'submitted', ?)`, eventID, record.ID, user.ID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось записать приёмку")
			return
		}
		if err := writeActivity(r.Context(), tx, user.ID, "task", record.ID, "review_submitted", "", map[string]any{"proofCount": proofCount, "reviewerId": reviewerID}); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось записать историю приёмки")
			return
		}
		if reviewerID != user.ID {
			if err := insertNotification(r.Context(), tx, reviewerID, "task_review", "Результат ждёт проверки", fmt.Sprintf("%s отправил задачу «%s» на приёмку", user.Username, record.Title), "task", record.ID); err != nil {
				writeError(w, http.StatusInternalServerError, "Не удалось уведомить проверяющего")
				return
			}
		}
		if err := tx.Commit(); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось завершить приёмку")
			return
		}
		reviewRecord, _ := s.getRecord(r.Context(), record.ID)
		writeJSON(w, http.StatusOK, reviewRecord)
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать завершение")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET stage_id = COALESCE((SELECT id FROM collection_stages WHERE collection_id = records.collection_id AND category = 'done' AND archived_at IS NULL ORDER BY sort_order LIMIT 1), stage_id), status = 'completed', progress = 100, result = ?, completed_at = ?, updated_at = ? WHERE id = ?`, input.Result, now, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить задачу")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "task", record.ID, "completed", "", map[string]any{"proofCount": proofCount, "result": input.Result}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if input.NotifyPartners {
		if err := s.insertPartnerNotifications(r.Context(), tx, user, record, "Задача выполнена", fmt.Sprintf("%s завершил задачу «%s»", user.Username, record.Title)); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось создать уведомление")
			return
		}
	}
	if _, err := s.spawnRecurringTask(r.Context(), tx, record, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать следующее повторение")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить операцию")
		return
	}
	completed, _ := s.getRecord(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, completed)
}

func (s *Server) insertPartnerNotifications(ctx context.Context, tx *sql.Tx, actor User, record Record, title, body string) error {
	rows, err := tx.QueryContext(ctx, `SELECT user_id FROM workspace_members WHERE workspace_id = ? AND status = 'active' AND user_id <> ?`, record.WorkspaceID, actor.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, id := range ids {
		notificationID, _ := newID()
		if _, err := tx.ExecContext(ctx, `INSERT INTO notifications(id, user_id, type, title, body, entity_type, entity_id, created_at) VALUES(?, ?, 'record_update', ?, ?, ?, ?, ?)`, notificationID, id, title, body, record.Type, record.ID, nowText()); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) handleNotifyPartners(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	user := currentUser(r)
	var input struct {
		Message string `json:"message"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	message := strings.TrimSpace(input.Message)
	if message == "" {
		message = fmt.Sprintf("%s просит посмотреть карточку «%s»", user.Username, record.Title)
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать отправку")
		return
	}
	defer tx.Rollback()
	if err := s.insertPartnerNotifications(r.Context(), tx, user, record, "Обновление от партнёра", message); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось отправить уведомление")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "partners_notified", "", map[string]any{"message": message}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить отправку")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sent": true})
}

func (s *Server) questionBelongsToRecord(ctx context.Context, questionID, recordID string) bool {
	var count int
	return s.store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM question_items WHERE id = ? AND record_id = ?`, questionID, recordID).Scan(&count) == nil && count == 1
}

func updateQuestionSetProgress(ctx context.Context, tx *sql.Tx, recordID, updatedAt string) (string, error) {
	var total, resolved int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END), 0) FROM question_items WHERE record_id = ? AND status <> 'archived'`, recordID).Scan(&total, &resolved); err != nil {
		return "", err
	}
	var currentStatus string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM records WHERE id = ?`, recordID).Scan(&currentStatus); err != nil {
		return "", err
	}
	progress := 0
	if total > 0 {
		progress = resolved * 100 / total
	}
	status := currentStatus
	switch {
	case currentStatus == "archived" || currentStatus == "cancelled":
	case total == 0:
		status = "planned"
	case resolved == total:
		status = "completed"
	case currentStatus == "blocked" || currentStatus == "postponed":
	default:
		status = "in_progress"
	}
	_, err := tx.ExecContext(ctx, `UPDATE records SET progress = ?, status = ?, completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) WHEN ? IN ('archived', 'cancelled') THEN completed_at ELSE NULL END, updated_at = ? WHERE id = ?`, progress, status, status, updatedAt, status, updatedAt, recordID)
	return status, err
}

func (s *Server) handlePendingQuestions(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT q.id, q.body, r.id, r.title, r.due_at, q.created_at
		FROM question_items q
		JOIN records r ON r.id = q.record_id
		LEFT JOIN question_answers answer ON answer.question_id = q.id AND answer.author_id = ?
		WHERE r.subtype = 'question_set'
		  AND r.workspace_id = ?
		  AND r.status NOT IN ('archived', 'cancelled')
		  AND q.status = 'open'
		  AND answer.id IS NULL
		ORDER BY CASE WHEN r.due_at IS NULL THEN 1 ELSE 0 END, r.due_at, q.created_at`, user.ID, currentWorkspace(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить вопросы, ожидающие ответа")
		return
	}
	defer rows.Close()
	items := make([]PendingQuestion, 0)
	for rows.Next() {
		var item PendingQuestion
		var dueAt sql.NullString
		if err := rows.Scan(&item.QuestionID, &item.Body, &item.RecordID, &item.RecordTitle, &dueAt, &item.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать ожидающие вопросы")
			return
		}
		if dueAt.Valid {
			item.DueAt = &dueAt.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить загрузку ожидающих вопросов")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) listQuestionWorkflow(ctx context.Context, recordID string) (QuestionWorkflow, error) {
	workflow := QuestionWorkflow{Questions: make([]QuestionItem, 0)}
	if err := s.store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_members wm JOIN records r ON r.workspace_id=wm.workspace_id WHERE r.id=? AND wm.status='active'`, recordID).Scan(&workflow.UserCount); err != nil {
		return workflow, err
	}
	rows, err := s.store.db.QueryContext(ctx, `SELECT id, record_id, body, status, sort_order, created_by, created_at, updated_at FROM question_items WHERE record_id = ? AND status <> 'archived' ORDER BY sort_order, created_at`, recordID)
	if err != nil {
		return workflow, err
	}
	for rows.Next() {
		var item QuestionItem
		if err := rows.Scan(&item.ID, &item.RecordID, &item.Body, &item.Status, &item.SortOrder, &item.CreatedBy, &item.CreatedAt, &item.UpdatedAt); err != nil {
			rows.Close()
			return workflow, err
		}
		item.Answers = make([]QuestionAnswer, 0)
		workflow.Questions = append(workflow.Questions, item)
	}
	if err := rows.Close(); err != nil {
		return workflow, err
	}
	if err := rows.Err(); err != nil {
		return workflow, err
	}
	for index := range workflow.Questions {
		item := &workflow.Questions[index]
		item.Outputs = make([]QuestionOutput, 0)
		answerRows, err := s.store.db.QueryContext(ctx, `SELECT a.id, a.question_id, a.author_id, u.username, a.content, a.created_at, a.updated_at FROM question_answers a JOIN users u ON u.id = a.author_id WHERE a.question_id = ? ORDER BY u.username`, item.ID)
		if err != nil {
			return workflow, err
		}
		for answerRows.Next() {
			var answer QuestionAnswer
			if err := answerRows.Scan(&answer.ID, &answer.QuestionID, &answer.AuthorID, &answer.AuthorUsername, &answer.Content, &answer.CreatedAt, &answer.UpdatedAt); err != nil {
				answerRows.Close()
				return workflow, err
			}
			item.Answers = append(item.Answers, answer)
		}
		if err := answerRows.Close(); err != nil {
			return workflow, err
		}
		if err := s.store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM question_answers a JOIN workspace_members wm ON wm.user_id=a.author_id JOIN records r ON r.workspace_id=wm.workspace_id WHERE r.id=? AND a.question_id=? AND wm.status='active'`, recordID, item.ID).Scan(&item.ActiveAnswerCount); err != nil {
			return workflow, err
		}
		var decision QuestionDecision
		var sourceAnswerID, sourceAuthor sql.NullString
		err = s.store.db.QueryRowContext(ctx, `SELECT d.id, d.question_id, d.content, d.source_answer_id, source_user.username, d.decided_by, decider.username, d.created_at, d.updated_at FROM question_decisions d JOIN users decider ON decider.id = d.decided_by LEFT JOIN question_answers source_answer ON source_answer.id = d.source_answer_id LEFT JOIN users source_user ON source_user.id = source_answer.author_id WHERE d.question_id = ?`, item.ID).Scan(&decision.ID, &decision.QuestionID, &decision.Content, &sourceAnswerID, &sourceAuthor, &decision.DecidedBy, &decision.DecidedByUsername, &decision.CreatedAt, &decision.UpdatedAt)
		if err == nil {
			if sourceAnswerID.Valid {
				decision.SourceAnswerID = &sourceAnswerID.String
			}
			if sourceAuthor.Valid {
				decision.SourceAuthorUsername = &sourceAuthor.String
			}
			item.Decision = &decision
		} else if !errors.Is(err, sql.ErrNoRows) {
			return workflow, err
		}
		outputRows, err := s.store.db.QueryContext(ctx, `
			SELECT d.id, r.id,
				CASE WHEN r.business_kind <> '' THEN r.business_kind WHEN r.subtype = 'question_set' THEN 'question_set' WHEN r.record_kind = 'meeting' THEN 'meeting' ELSE r.type END,
				r.record_kind, r.title, r.status, d.created_at
			FROM record_derivations d
			JOIN records r ON r.id = d.output_record_id
			WHERE d.source_question_id = ?
			ORDER BY d.created_at`, item.ID)
		if err != nil {
			return workflow, err
		}
		for outputRows.Next() {
			var output QuestionOutput
			if err := outputRows.Scan(&output.ID, &output.RecordID, &output.Type, &output.Kind, &output.Title, &output.Status, &output.CreatedAt); err != nil {
				outputRows.Close()
				return workflow, err
			}
			item.Outputs = append(item.Outputs, output)
		}
		if err := outputRows.Close(); err != nil {
			return workflow, err
		}
		workflow.Answered += item.ActiveAnswerCount
		workflow.Expected += workflow.UserCount
		if item.Decision != nil {
			workflow.Resolved++
		}
	}
	return workflow, nil
}

func splitQuestionInput(body string) []string {
	lines := strings.Split(strings.ReplaceAll(body, "\r\n", "\n"), "\n")
	questions := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		line = strings.TrimSpace(questionListPrefixPattern.ReplaceAllString(line, ""))
		if line != "" {
			questions = append(questions, line)
		}
	}
	return questions
}

func (s *Server) handleAddQuestions(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil || record.Type != "question_set" {
		writeError(w, http.StatusNotFound, "Карточка вопросов не найдена")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Questions string `json:"questions"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	questions := splitQuestionInput(input.Questions)
	if len(questions) == 0 || len(questions) > 100 {
		writeError(w, http.StatusBadRequest, "Добавьте от 1 до 100 вопросов, каждый с новой строки")
		return
	}
	for _, question := range questions {
		if len(question) > 2000 {
			writeError(w, http.StatusBadRequest, "Формулировка вопроса не должна превышать 2000 символов")
			return
		}
	}
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать добавление вопросов")
		return
	}
	defer tx.Rollback()
	var sortOrder int
	_ = tx.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), 0) FROM question_items WHERE record_id = ?`, record.ID).Scan(&sortOrder)
	now := nowText()
	ids := make([]string, 0, len(questions))
	for _, question := range questions {
		id, _ := newID()
		sortOrder += 10
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO question_items(id, record_id, body, sort_order, created_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)`, id, record.ID, question, sortOrder, user.ID, now, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось добавить вопросы")
			return
		}
		ids = append(ids, id)
	}
	newStatus, err := updateQuestionSetProgress(r.Context(), tx, record.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить карточку")
		return
	}
	details := map[string]any{"count": len(questions), "questionIds": ids}
	if newStatus != record.Status {
		details["status"] = map[string]any{"before": record.Status, "after": newStatus}
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "questions_added", "", details); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить добавление")
		return
	}
	workflow, _ := s.listQuestionWorkflow(r.Context(), record.ID)
	writeJSON(w, http.StatusCreated, workflow)
}

func (s *Server) handleSaveQuestionAnswer(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	questionID := r.PathValue("questionId")
	if err != nil || record.Type != "question_set" || !s.questionBelongsToRecord(r.Context(), questionID, record.ID) {
		writeError(w, http.StatusNotFound, "Вопрос не найден")
		return
	}
	var input struct {
		Content string `json:"content"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Content = strings.TrimSpace(input.Content)
	if input.Content == "" || len(input.Content) > 50000 {
		writeError(w, http.StatusBadRequest, "Напишите ответ не длиннее 50000 символов")
		return
	}
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать сохранение ответа")
		return
	}
	defer tx.Rollback()
	var answerID, before string
	err = tx.QueryRowContext(r.Context(), `SELECT id, content FROM question_answers WHERE question_id = ? AND author_id = ?`, questionID, user.ID).Scan(&answerID, &before)
	now := nowText()
	if errors.Is(err, sql.ErrNoRows) {
		answerID, _ = newID()
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO question_answers(id, question_id, author_id, content, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)`, answerID, questionID, user.ID, input.Content, now, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить ответ")
			return
		}
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить ответ")
		return
	} else if before != input.Content {
		if _, err = tx.ExecContext(r.Context(), `UPDATE question_answers SET content = ?, updated_at = ? WHERE id = ?`, input.Content, now, answerID); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось обновить ответ")
			return
		}
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить карточку")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "question_answered", "", map[string]any{"questionId": questionID, "answerId": answerID, "before": before, "after": input.Content}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := s.insertPartnerNotifications(r.Context(), tx, user, record, "Новый ответ на вопрос", user.Username+" ответил в карточке «"+record.Title+"»"); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось уведомить партнёра")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить сохранение")
		return
	}
	workflow, _ := s.listQuestionWorkflow(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, workflow)
}

func (s *Server) handleSaveQuestionDecision(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	questionID := r.PathValue("questionId")
	if err != nil || record.Type != "question_set" || !s.questionBelongsToRecord(r.Context(), questionID, record.ID) {
		writeError(w, http.StatusNotFound, "Вопрос не найден")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Mode     string  `json:"mode"`
		AnswerID *string `json:"answerId"`
		Content  string  `json:"content"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Mode = strings.TrimSpace(input.Mode)
	input.Content = strings.TrimSpace(input.Content)
	var sourceAnswerID *string
	if input.Mode == "answer" {
		if input.AnswerID == nil {
			writeError(w, http.StatusBadRequest, "Выберите ответ")
			return
		}
		var answerContent string
		if err := s.store.db.QueryRowContext(r.Context(), `SELECT content FROM question_answers WHERE id = ? AND question_id = ?`, *input.AnswerID, questionID).Scan(&answerContent); err != nil {
			writeError(w, http.StatusBadRequest, "Выбранный ответ не найден")
			return
		}
		input.Content = answerContent
		sourceAnswerID = input.AnswerID
	} else if input.Mode != "custom" {
		writeError(w, http.StatusBadRequest, "Неизвестный способ решения")
		return
	}
	if input.Content == "" || len(input.Content) > 50000 {
		writeError(w, http.StatusBadRequest, "Итоговое решение обязательно")
		return
	}
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать фиксацию решения")
		return
	}
	defer tx.Rollback()
	var decisionID, before string
	var memberCount, answerCount int
	if err := tx.QueryRowContext(r.Context(), `SELECT COUNT(*),COUNT(a.id) FROM workspace_members wm JOIN records r ON r.workspace_id=wm.workspace_id LEFT JOIN question_answers a ON a.author_id=wm.user_id AND a.question_id=? WHERE r.id=? AND wm.status='active'`, questionID, record.ID).Scan(&memberCount, &answerCount); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить ответы участников команды")
		return
	}
	if memberCount == 0 || answerCount < memberCount {
		writeError(w, http.StatusConflict, "Итог можно зафиксировать после ответов всех действующих участников этой команды")
		return
	}
	err = tx.QueryRowContext(r.Context(), `SELECT id, content FROM question_decisions WHERE question_id = ?`, questionID).Scan(&decisionID, &before)
	now := nowText()
	if errors.Is(err, sql.ErrNoRows) {
		decisionID, _ = newID()
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO question_decisions(id, question_id, content, source_answer_id, decided_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)`, decisionID, questionID, input.Content, sourceAnswerID, user.ID, now, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить решение")
			return
		}
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить решение")
		return
	} else {
		if _, err = tx.ExecContext(r.Context(), `UPDATE question_decisions SET content = ?, source_answer_id = ?, decided_by = ?, updated_at = ? WHERE id = ?`, input.Content, sourceAnswerID, user.ID, now, decisionID); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось обновить решение")
			return
		}
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE question_items SET status = 'resolved', updated_at = ? WHERE id = ?`, now, questionID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить вопрос")
		return
	}
	newStatus, err := updateQuestionSetProgress(r.Context(), tx, record.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить карточку")
		return
	}
	details := map[string]any{"questionId": questionID, "decisionId": decisionID, "mode": input.Mode, "sourceAnswerId": sourceAnswerID, "before": before, "after": input.Content}
	if newStatus != record.Status {
		details["status"] = map[string]any{"before": record.Status, "after": newStatus}
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "question_decided", "", details); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := s.insertPartnerNotifications(r.Context(), tx, user, record, "Зафиксировано совместное решение", "В карточке «"+record.Title+"» появился итог по вопросу"); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось уведомить партнёра")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить решение")
		return
	}
	workflow, _ := s.listQuestionWorkflow(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, workflow)
}

func (s *Server) handleCreateQuestionOutput(w http.ResponseWriter, r *http.Request) {
	source, err := s.getRecord(r.Context(), r.PathValue("id"))
	questionID := r.PathValue("questionId")
	if err != nil || source.Type != "question_set" || !s.questionBelongsToRecord(r.Context(), questionID, source.ID) {
		writeError(w, http.StatusNotFound, "Вопрос не найден")
		return
	}
	if !s.requireRecordEdit(w, r, source) {
		return
	}
	var input struct {
		Kind            string `json:"kind"`
		Title           string `json:"title"`
		Description     string `json:"description"`
		OwnerID         int64  `json:"ownerId"`
		DueAt           string `json:"dueAt"`
		EstimateMinutes int    `json:"estimateMinutes"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Kind = strings.TrimSpace(input.Kind)
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	if input.Title == "" || len(input.Title) > 240 {
		writeError(w, http.StatusBadRequest, "Название обязательно и не длиннее 240 символов")
		return
	}
	if len(input.Description) > 100000 {
		writeError(w, http.StatusBadRequest, "Описание слишком длинное")
		return
	}
	if input.EstimateMinutes < 0 || input.EstimateMinutes > 525600 {
		writeError(w, http.StatusBadRequest, "Некорректная оценка времени")
		return
	}
	user := currentUser(r)
	if input.OwnerID == 0 {
		input.OwnerID = user.ID
	}
	if !s.workspaceHasMember(r.Context(), currentWorkspace(r).ID, input.OwnerID) {
		writeError(w, http.StatusBadRequest, "Указанный участник не найден")
		return
	}
	dueAt, err := normalizeDueAt(input.DueAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный срок")
		return
	}
	var databaseType, recordKind, status string
	switch input.Kind {
	case "preference":
		databaseType, recordKind, status = "criterion", "preference", "draft"
	case "limitation":
		databaseType, recordKind, status = "criterion", "limitation", "draft"
	case "rule":
		databaseType, recordKind, status = "decision", "rule", "completed"
	case "insight":
		databaseType, recordKind, status = "decision", "insight", "completed"
	case "task":
		databaseType, status = "task", "planned"
	case "idea":
		databaseType, status = "idea", "inbox"
	case "research":
		databaseType, status = "research", "draft"
	case "goal":
		databaseType, status = "goal", "planned"
	default:
		writeError(w, http.StatusBadRequest, "Неизвестный вид результата")
		return
	}
	var decisionID, decisionContent string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT id, content FROM question_decisions WHERE question_id = ?`, questionID).Scan(&decisionID, &decisionContent); err != nil {
		writeError(w, http.StatusConflict, "Сначала зафиксируйте совместный итог вопроса")
		return
	}
	if input.Description == "" {
		input.Description = decisionContent
	}
	outputID, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать идентификатор")
		return
	}
	derivationID, _ := newID()
	linkID, _ := newID()
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание результата")
		return
	}
	defer tx.Rollback()
	if databaseType == "decision" {
		dueAt = nil
		input.EstimateMinutes = 0
	}
	completedAt := any(nil)
	progress := 0
	if databaseType == "decision" {
		completedAt = now
		progress = 100
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO records(id, workspace_id, type, subtype, record_kind, title, description, status, author_id, owner_id, due_at, workstream, parent_id, estimate_minutes, progress, completed_at, created_at, updated_at) VALUES(?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, outputID, source.WorkspaceID, databaseType, recordKind, input.Title, input.Description, status, user.ID, input.OwnerID, dueAt, source.Workstream, source.ID, input.EstimateMinutes, progress, completedAt, now, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать карточку результата")
		return
	}
	if databaseType == "criterion" || databaseType == "decision" {
		businessInput := &businessDetailsInput{SourceExcerpt: decisionContent}
		if err = saveBusinessDetails(r.Context(), tx, outputID, databaseType, businessInput, user.ID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить происхождение знания")
			return
		}
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO record_links(id, source_id, target_id, relation_type, created_by, created_at) VALUES(?, ?, ?, 'produced', ?, ?)`, linkID, source.ID, outputID, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось связать результат с источником")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO record_derivations(id, output_record_id, source_record_id, source_question_id, source_decision_id, source_excerpt, created_by, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, derivationID, outputID, source.ID, questionID, decisionID, decisionContent, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить происхождение результата")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, source.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить источник")
		return
	}
	details := map[string]any{"questionId": questionID, "decisionId": decisionID, "outputId": outputID, "outputType": input.Kind, "title": input.Title}
	if err = writeActivity(r.Context(), tx, user.ID, source.Type, source.ID, "output_created", "Вывод превращён в рабочую сущность", details); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю источника")
		return
	}
	if err = writeActivity(r.Context(), tx, user.ID, databaseType, outputID, "created_from_question", "Создано из совместного вывода", map[string]any{"sourceRecordId": source.ID, "questionId": questionID, "decisionId": decisionID}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю результата")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание результата")
		return
	}
	created, _ := s.getRecord(r.Context(), outputID)
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleArchiveQuestion(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	questionID := r.PathValue("questionId")
	if err != nil || record.Type != "question_set" || !s.questionBelongsToRecord(r.Context(), questionID, record.ID) {
		writeError(w, http.StatusNotFound, "Вопрос не найден")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину архивации вопроса")
		return
	}
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать архивацию")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if _, err := tx.ExecContext(r.Context(), `UPDATE question_items SET status = 'archived', updated_at = ? WHERE id = ?`, now, questionID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось архивировать вопрос")
		return
	}
	newStatus, err := updateQuestionSetProgress(r.Context(), tx, record.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить карточку")
		return
	}
	details := map[string]any{"questionId": questionID}
	if newStatus != record.Status {
		details["status"] = map[string]any{"before": record.Status, "after": newStatus}
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "question_archived", input.Reason, details); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить архивацию")
		return
	}
	workflow, _ := s.listQuestionWorkflow(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, workflow)
}

func (s *Server) handleListDefinitions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT d.id, d.key, COALESCE(o.name,d.name), d.scope_type, d.kind, COALESCE(o.active,d.active), COALESCE(o.sort_order,d.sort_order) FROM section_definitions d LEFT JOIN workspace_section_overrides o ON o.definition_id=d.id AND o.workspace_id=? WHERE d.workspace_id IS NULL OR d.workspace_id=? ORDER BY 6 DESC, 4, 7, 3`, currentWorkspace(r).ID, currentWorkspace(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить структуру")
		return
	}
	defer rows.Close()
	definitions := make([]SectionDefinition, 0)
	for rows.Next() {
		var definition SectionDefinition
		var scope sql.NullString
		if err := rows.Scan(&definition.ID, &definition.Key, &definition.Name, &scope, &definition.Kind, &definition.Active, &definition.SortOrder); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать структуру")
			return
		}
		if scope.Valid {
			definition.ScopeType = &scope.String
		}
		definitions = append(definitions, definition)
	}
	writeJSON(w, http.StatusOK, definitions)
}

func (s *Server) handleCreateDefinition(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input struct {
		Name      string  `json:"name"`
		ScopeType *string `json:"scopeType"`
		Kind      string  `json:"kind"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len(input.Name) > 120 {
		writeError(w, http.StatusBadRequest, "Название раздела обязательно")
		return
	}
	if input.ScopeType != nil {
		if _, ok := recordTypes[*input.ScopeType]; !ok {
			writeError(w, http.StatusBadRequest, "Неизвестный тип карточки")
			return
		}
		if *input.ScopeType == "question_set" {
			writeError(w, http.StatusBadRequest, "Структура карточки вопросов фиксирована")
			return
		}
		if *input.ScopeType == "meeting" {
			writeError(w, http.StatusBadRequest, "Встреча использует фиксированный рабочий формат")
			return
		}
	}
	if input.Kind == "" {
		input.Kind = "universal"
	}
	if input.Kind != "universal" && input.Kind != "template" {
		writeError(w, http.StatusBadRequest, "Неизвестный вид раздела")
		return
	}
	id, _ := newID()
	key := "section_" + id
	user := currentUser(r)
	var sortOrder int
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(COALESCE(o.sort_order,d.sort_order)), 0) + 10 FROM section_definitions d LEFT JOIN workspace_section_overrides o ON o.definition_id=d.id AND o.workspace_id=? WHERE d.scope_type IS ? AND (d.workspace_id IS NULL OR d.workspace_id=?)`, currentWorkspace(r).ID, input.ScopeType, currentWorkspace(r).ID).Scan(&sortOrder)
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO section_definitions(id, key, name, scope_type, kind, active, sort_order, created_by, created_at, updated_at,workspace_id) VALUES(?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`, id, key, input.Name, input.ScopeType, input.Kind, sortOrder, user.ID, now, now, currentWorkspace(r).ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать раздел")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "section_definition", id, "created", "", map[string]any{"name": input.Name, "scopeType": input.ScopeType, "kind": input.Kind}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) handleUpdateDefinition(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input struct {
		Name   *string `json:"name"`
		Active *bool   `json:"active"`
		Reason string  `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	updates := make([]string, 0)
	args := make([]any, 0)
	details := make(map[string]any)
	if input.Name != nil {
		value := strings.TrimSpace(*input.Name)
		if value == "" || len([]rune(value)) > 120 {
			writeError(w, http.StatusBadRequest, "Название не может быть пустым")
			return
		}
		updates = append(updates, "name = ?")
		args = append(args, value)
		details["name"] = value
	}
	if input.Active != nil {
		updates = append(updates, "active = ?")
		args = append(args, *input.Active)
		details["active"] = *input.Active
	}
	if len(updates) == 0 {
		writeError(w, http.StatusBadRequest, "Нет изменений")
		return
	}
	updates = append(updates, "updated_at = ?")
	args = append(args, nowText(), r.PathValue("id"), currentWorkspace(r).ID)
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `INSERT OR IGNORE INTO workspace_section_overrides(workspace_id,definition_id,name,active,sort_order,updated_at) SELECT ?,id,name,active,sort_order,? FROM section_definitions WHERE id=? AND (workspace_id IS NULL OR workspace_id=?)`, currentWorkspace(r).ID, nowText(), r.PathValue("id"), currentWorkspace(r).ID); err != nil {
		writeError(w, 500, "Не удалось подготовить настройку блока")
		return
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE workspace_section_overrides SET `+strings.Join(updates, ", ")+` WHERE definition_id = ? AND workspace_id=?`, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось изменить раздел")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(w, http.StatusNotFound, "Раздел не найден")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "section_definition", r.PathValue("id"), "updated", input.Reason, details); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": true})
}

func (s *Server) handleReorderDefinitions(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input struct {
		ScopeType  string   `json:"scopeType"`
		OrderedIDs []string `json:"orderedIds"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if _, ok := recordTypes[input.ScopeType]; !ok || len(input.OrderedIDs) == 0 || len(input.OrderedIDs) > 100 {
		writeError(w, http.StatusBadRequest, "Некорректный порядок блоков")
		return
	}
	seen := make(map[string]struct{}, len(input.OrderedIDs))
	for _, id := range input.OrderedIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			writeError(w, http.StatusBadRequest, "Некорректный идентификатор блока")
			return
		}
		if _, exists := seen[id]; exists {
			writeError(w, http.StatusBadRequest, "Порядок содержит повторяющийся блок")
			return
		}
		seen[id] = struct{}{}
	}
	var expected int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM section_definitions d LEFT JOIN workspace_section_overrides o ON o.definition_id=d.id AND o.workspace_id=? WHERE d.scope_type = ? AND COALESCE(o.active,d.active) = 1 AND (d.workspace_id IS NULL OR d.workspace_id=?)`, currentWorkspace(r).ID, input.ScopeType, currentWorkspace(r).ID).Scan(&expected); err != nil || expected != len(input.OrderedIDs) {
		writeError(w, http.StatusConflict, "Состав блоков изменился. Обновите страницу и повторите")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать перестановку")
		return
	}
	defer tx.Rollback()
	for index, id := range input.OrderedIDs {
		result, updateErr := tx.ExecContext(r.Context(), `INSERT INTO workspace_section_overrides(workspace_id,definition_id,name,active,sort_order,updated_at) SELECT ?, d.id, COALESCE(o.name,d.name), COALESCE(o.active,d.active), ?, ? FROM section_definitions d LEFT JOIN workspace_section_overrides o ON o.definition_id=d.id AND o.workspace_id=? WHERE d.id=? AND d.scope_type=? AND COALESCE(o.active,d.active)=1 AND (d.workspace_id IS NULL OR d.workspace_id=?) ON CONFLICT(workspace_id,definition_id) DO UPDATE SET sort_order=excluded.sort_order,updated_at=excluded.updated_at`, currentWorkspace(r).ID, (index+1)*10, nowText(), currentWorkspace(r).ID, id, input.ScopeType, currentWorkspace(r).ID)
		if updateErr != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить порядок")
			return
		}
		if affected, _ := result.RowsAffected(); affected != 1 {
			writeError(w, http.StatusConflict, "Состав блоков изменился. Обновите страницу и повторите")
			return
		}
	}
	user := currentUser(r)
	if err := writeActivity(r.Context(), tx, user.ID, "section_definition", input.ScopeType, "reordered", "", map[string]any{"scopeType": input.ScopeType, "orderedIds": input.OrderedIDs}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить перестановку")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": len(input.OrderedIDs)})
}

func (s *Server) handleNotifications(w http.ResponseWriter, r *http.Request) {
	page, err := s.notificationPage(r, 200, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить уведомления")
		return
	}
	w.Header().Set("X-Unread-Count", strconv.Itoa(page.UnreadCount))
	writeJSON(w, http.StatusOK, page.Items)
}

func (s *Server) handleReadNotification(w http.ResponseWriter, r *http.Request) {
	s.setNotificationRead(w, r, true)
}
func (s *Server) handleReadAllNotifications(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if _, err := s.store.db.ExecContext(r.Context(), `UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?`, nowText(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось отметить уведомления")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleActivity(w http.ResponseWriter, r *http.Request) {
	where := []string{"a.workspace_id = ?"}
	args := []any{currentWorkspace(r).ID}
	limit := 200
	if value, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && value > 0 {
		limit = min(value, 500)
	}
	offset := 0
	if value, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && value > 0 {
		offset = min(value, 50000)
	}
	if entityType := strings.TrimSpace(r.URL.Query().Get("entityType")); entityType != "" {
		where = append(where, "a.entity_type = ?")
		args = append(args, entityType)
	}
	if entityID := strings.TrimSpace(r.URL.Query().Get("entityId")); entityID != "" {
		where = append(where, "a.entity_id = ?")
		args = append(args, entityID)
	}
	args = append(args, limit, offset)
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT a.id, a.actor_id, u.username, a.entity_type, a.entity_id, a.action, a.details_json, a.reason, a.created_at FROM activity a JOIN users u ON u.id = a.actor_id WHERE `+strings.Join(where, " AND ")+` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить историю")
		return
	}
	defer rows.Close()
	activity := make([]Activity, 0)
	for rows.Next() {
		var item Activity
		var details string
		if err := rows.Scan(&item.ID, &item.ActorID, &item.ActorUsername, &item.EntityType, &item.EntityID, &item.Action, &details, &item.Reason, &item.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать историю")
			return
		}
		if err := json.Unmarshal([]byte(details), &item.Details); err != nil {
			item.Details = map[string]any{"raw": details}
		}
		activity = append(activity, item)
	}
	writeJSON(w, http.StatusOK, activity)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		if errors.Is(err, io.EOF) {
			writeError(w, http.StatusBadRequest, "Пустой запрос")
		} else {
			writeError(w, http.StatusBadRequest, "Некорректные данные запроса")
		}
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if status != http.StatusNoContent {
		_ = json.NewEncoder(w).Encode(value)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
