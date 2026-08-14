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
	"regexp"
	"strconv"
	"strings"
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
	"meeting": {},
}

var recordStatuses = map[string]struct{}{
	"draft": {}, "inbox": {}, "review": {}, "main": {}, "rejected": {},
	"planned": {}, "in_progress": {}, "blocked": {}, "completed": {},
	"postponed": {}, "cancelled": {}, "archived": {},
}

type Server struct {
	store  *Store
	config Config
	mux    *http.ServeMux
}

type contextKey string

const userContextKey contextKey = "user"

func NewServer(store *Store, config Config) http.Handler {
	server := &Server{store: store, config: config, mux: http.NewServeMux()}
	server.routes()
	return server.securityHeaders(server.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.handleHealth)
	s.mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	s.mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	s.mux.Handle("POST /api/auth/logout", s.requireAuth(http.HandlerFunc(s.handleLogout)))
	s.mux.Handle("GET /api/me", s.requireAuth(http.HandlerFunc(s.handleMe)))
	s.mux.Handle("PATCH /api/me", s.requireAuth(http.HandlerFunc(s.handleUpdateMe)))
	s.mux.Handle("GET /api/users", s.requireAuth(http.HandlerFunc(s.handleUsers)))
	s.mux.Handle("GET /api/users/{id}/profile", s.requireAuth(http.HandlerFunc(s.handleUserProfile)))
	s.mux.Handle("POST /api/presence", s.requireAuth(http.HandlerFunc(s.handlePresence)))
	s.mux.Handle("GET /api/graph", s.requireAuth(http.HandlerFunc(s.handleGraph)))
	s.mux.Handle("GET /api/search", s.requireAuth(http.HandlerFunc(s.handleSearch)))
	s.mux.Handle("POST /api/ai/suggest-record", s.requireAuth(http.HandlerFunc(s.handleSuggestRecord)))
	s.mux.Handle("POST /api/records/{id}/ai-analysis", s.requireAuth(http.HandlerFunc(s.handleAnalyzeRecord)))

	s.mux.Handle("GET /api/records", s.requireAuth(http.HandlerFunc(s.handleListRecords)))
	s.mux.Handle("POST /api/records", s.requireAuth(http.HandlerFunc(s.handleCreateRecord)))
	s.mux.Handle("GET /api/records/{id}", s.requireAuth(http.HandlerFunc(s.handleGetRecord)))
	s.mux.Handle("GET /api/records/{id}/relations", s.requireAuth(http.HandlerFunc(s.handleGetRecordRelations)))
	s.mux.Handle("PATCH /api/records/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdateRecord)))
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
	s.mux.Handle("POST /api/records/{id}/links", s.requireAuth(http.HandlerFunc(s.handleCreateLink)))
	s.mux.Handle("POST /api/records/{id}/links/{linkId}/remove", s.requireAuth(http.HandlerFunc(s.handleRemoveLink)))
	s.mux.Handle("PUT /api/records/{id}/criteria/{criterionId}", s.requireAuth(http.HandlerFunc(s.handleScoreCriterion)))
	s.mux.Handle("POST /api/records/{id}/proofs", s.requireAuth(http.HandlerFunc(s.handleAddProof)))
	s.mux.Handle("POST /api/records/{id}/complete", s.requireAuth(http.HandlerFunc(s.handleCompleteTask)))
	s.mux.Handle("POST /api/records/{id}/notify", s.requireAuth(http.HandlerFunc(s.handleNotifyPartners)))
	s.mux.Handle("POST /api/records/{id}/questions", s.requireAuth(http.HandlerFunc(s.handleAddQuestions)))
	s.mux.Handle("PUT /api/records/{id}/questions/{questionId}/answer", s.requireAuth(http.HandlerFunc(s.handleSaveQuestionAnswer)))
	s.mux.Handle("POST /api/records/{id}/questions/{questionId}/decision", s.requireAuth(http.HandlerFunc(s.handleSaveQuestionDecision)))
	s.mux.Handle("POST /api/records/{id}/questions/{questionId}/outputs", s.requireAuth(http.HandlerFunc(s.handleCreateQuestionOutput)))
	s.mux.Handle("POST /api/records/{id}/questions/{questionId}/archive", s.requireAuth(http.HandlerFunc(s.handleArchiveQuestion)))
	s.mux.Handle("GET /api/questions/pending", s.requireAuth(http.HandlerFunc(s.handlePendingQuestions)))

	s.mux.Handle("GET /api/section-definitions", s.requireAuth(http.HandlerFunc(s.handleListDefinitions)))
	s.mux.Handle("POST /api/section-definitions", s.requireAuth(http.HandlerFunc(s.handleCreateDefinition)))
	s.mux.Handle("POST /api/section-definitions/reorder", s.requireAuth(http.HandlerFunc(s.handleReorderDefinitions)))
	s.mux.Handle("PATCH /api/section-definitions/{id}", s.requireAuth(http.HandlerFunc(s.handleUpdateDefinition)))
	s.mux.Handle("GET /api/notifications", s.requireAuth(http.HandlerFunc(s.handleNotifications)))
	s.mux.Handle("POST /api/notifications/read-all", s.requireAuth(http.HandlerFunc(s.handleReadAllNotifications)))
	s.mux.Handle("POST /api/notifications/{id}/read", s.requireAuth(http.HandlerFunc(s.handleReadNotification)))
	s.mux.Handle("GET /api/activity", s.requireAuth(http.HandlerFunc(s.handleActivity)))

	s.mux.Handle("GET /", http.FileServer(http.FS(web.Files)))
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
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
		err = s.store.db.QueryRowContext(r.Context(), `
			SELECT u.id, u.email, u.username, u.created_at, s.last_seen_at
			FROM sessions s JOIN users u ON u.id = s.user_id
			WHERE s.token_hash = ? AND s.expires_at > ?`, hashToken(cookie.Value), nowText()).
			Scan(&user.ID, &user.Email, &user.Username, &user.CreatedAt, &lastSeenAt)
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
		lastSeen, parseErr := time.Parse(time.RFC3339Nano, lastSeenAt)
		if parseErr != nil || time.Since(lastSeen) >= 5*time.Minute {
			_, _ = s.store.db.ExecContext(r.Context(), `UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`, nowText(), hashToken(cookie.Value))
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey, user)))
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
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var input registerRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Username = strings.TrimSpace(input.Username)
	if !strings.Contains(input.Email, "@") || len(input.Email) > 254 {
		writeError(w, http.StatusBadRequest, "Укажите корректную почту")
		return
	}
	if !usernamePattern.MatchString(input.Username) {
		writeError(w, http.StatusBadRequest, "Логин: 3–32 символа, латинские буквы, цифры и _")
		return
	}
	if len(input.Password) < 8 || len(input.Password) > 128 {
		writeError(w, http.StatusBadRequest, "Пароль должен содержать от 8 до 128 символов")
		return
	}
	if len(s.config.AllowedUsernames) > 0 {
		if _, ok := s.config.AllowedUsernames[strings.ToLower(input.Username)]; !ok {
			writeError(w, http.StatusForbidden, "Этот логин не входит в рабочую команду")
			return
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать пароль")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать регистрацию")
		return
	}
	defer tx.Rollback()
	now := nowText()
	result, err := tx.ExecContext(r.Context(), `INSERT INTO users(email, username, password_hash, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`, input.Email, input.Username, string(hash), now, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "Почта или логин уже заняты")
			return
		}
		log.Printf("register user: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось зарегистрироваться")
		return
	}
	userID, _ := result.LastInsertId()
	if err := writeActivity(r.Context(), tx, userID, "user", strconv.FormatInt(userID, 10), "created", "", map[string]any{"username": input.Username}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать регистрацию")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить регистрацию")
		return
	}
	user := User{ID: userID, Email: input.Email, Username: input.Username, CreatedAt: now}
	if err := s.createSession(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Аккаунт создан, но вход не выполнен")
		return
	}
	writeJSON(w, http.StatusCreated, user)
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
	err := s.store.db.QueryRowContext(r.Context(), `SELECT id, email, username, created_at, password_hash FROM users WHERE email = ? OR username = ?`, strings.TrimSpace(input.Login), strings.TrimSpace(input.Login)).
		Scan(&user.ID, &user.Email, &user.Username, &user.CreatedAt, &passwordHash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "Неверный логин или пароль")
		return
	}
	if err := s.createSession(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать сессию")
		return
	}
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
		Username string `json:"username"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Username = strings.TrimSpace(input.Username)
	if !usernamePattern.MatchString(input.Username) {
		writeError(w, http.StatusBadRequest, "Логин: 3–32 символа, латинские буквы, цифры и _")
		return
	}
	if len(s.config.AllowedUsernames) > 0 {
		if _, ok := s.config.AllowedUsernames[strings.ToLower(input.Username)]; !ok {
			writeError(w, http.StatusForbidden, "Новый логин нужно сначала добавить в конфигурацию команды")
			return
		}
	}
	user := currentUser(r)
	beforeUsername := user.Username
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение профиля")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE users SET username = ?, updated_at = ? WHERE id = ?`, input.Username, nowText(), user.ID); err != nil {
		writeError(w, http.StatusConflict, "Логин уже занят")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "user", strconv.FormatInt(user.ID, 10), "profile_updated", "", map[string]any{
		"username": map[string]any{"before": beforeUsername, "after": input.Username},
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю профиля")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение профиля")
		return
	}
	user.Username = input.Username
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, email, username, created_at FROM users ORDER BY username`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить участников")
		return
	}
	defer rows.Close()
	users := make([]User, 0)
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.Email, &user.Username, &user.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать участников")
			return
		}
		users = append(users, user)
	}
	writeJSON(w, http.StatusOK, users)
}

type recordScanner interface{ Scan(...any) error }

const recordSelect = `
	SELECT r.id, CASE WHEN r.subtype = 'question_set' THEN 'question_set' WHEN r.record_kind = 'meeting' THEN 'meeting' ELSE r.type END, r.record_kind, r.title, r.description, r.status,
		r.author_id, author.username, r.owner_id, owner.username,
		r.decision_maker_id, decision_maker.username, r.due_at,
		r.priority, r.workstream, r.edit_policy, r.parent_id, r.is_root,
		r.estimate_minutes, r.actual_minutes, r.progress, r.progress_note, r.result, r.completed_at,
		r.created_at, r.updated_at,
		(SELECT COUNT(*) FROM task_proofs p WHERE p.record_id = r.id)
	FROM records r
	JOIN users author ON author.id = r.author_id
	JOIN users owner ON owner.id = r.owner_id
	LEFT JOIN users decision_maker ON decision_maker.id = r.decision_maker_id`

func scanRecord(scanner recordScanner) (Record, error) {
	var record Record
	var decisionMakerID sql.NullInt64
	var decisionMakerName, dueAt, parentID, completedAt sql.NullString
	var isRoot int
	err := scanner.Scan(&record.ID, &record.Type, &record.Kind, &record.Title, &record.Description, &record.Status,
		&record.AuthorID, &record.AuthorUsername, &record.OwnerID, &record.OwnerUsername,
		&decisionMakerID, &decisionMakerName, &dueAt, &record.Priority, &record.Workstream, &record.EditPolicy, &parentID, &isRoot,
		&record.EstimateMinutes, &record.ActualMinutes, &record.Progress,
		&record.ProgressNote, &record.Result, &completedAt, &record.CreatedAt, &record.UpdatedAt, &record.ProofCount)
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
	return record, err
}

func (s *Server) getRecord(ctx context.Context, id string) (Record, error) {
	return scanRecord(s.store.db.QueryRowContext(ctx, recordSelect+` WHERE r.id = ?`, id))
}

func (s *Server) handleListRecords(w http.ResponseWriter, r *http.Request) {
	where := []string{"1 = 1"}
	args := make([]any, 0)
	if recordType := strings.TrimSpace(r.URL.Query().Get("type")); recordType != "" {
		if _, ok := recordTypes[recordType]; !ok {
			writeError(w, http.StatusBadRequest, "Неизвестный тип карточки")
			return
		}
		if recordType == "question_set" {
			where = append(where, "r.subtype = 'question_set'")
		} else if recordType == "meeting" {
			where = append(where, "r.type = 'document' AND r.record_kind = 'meeting'")
		} else if recordType == "document" {
			where = append(where, "r.type = 'document' AND r.subtype = '' AND r.record_kind = ''")
		} else {
			where = append(where, "r.type = ? AND r.subtype = ''")
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
	query := recordSelect + " WHERE " + strings.Join(where, " AND ") + " ORDER BY CASE WHEN r.due_at IS NULL THEN 1 ELSE 0 END, r.due_at, r.updated_at DESC LIMIT 500"
	rows, err := s.store.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		log.Printf("list records: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточки")
		return
	}
	defer rows.Close()
	records := make([]Record, 0)
	for rows.Next() {
		record, err := scanRecord(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать карточки")
			return
		}
		records = append(records, record)
	}
	writeJSON(w, http.StatusOK, records)
}

type createRecordRequest struct {
	Type            string `json:"type"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	Status          string `json:"status"`
	OwnerID         int64  `json:"ownerId"`
	DecisionMakerID *int64 `json:"decisionMakerId"`
	DueAt           string `json:"dueAt"`
	Priority        string `json:"priority"`
	Workstream      string `json:"workstream"`
	EditPolicy      string `json:"editPolicy"`
	ParentID        string `json:"parentId"`
	IsRoot          bool   `json:"isRoot"`
	EstimateMinutes int    `json:"estimateMinutes"`
	ActualMinutes   int    `json:"actualMinutes"`
	Kind            string `json:"kind"`
}

func defaultStatus(recordType string) string {
	switch recordType {
	case "idea":
		return "inbox"
	case "goal", "task", "question_set", "meeting":
		return "planned"
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
	case "goal", "task", "question_set", "meeting":
		return status == "planned" || status == "in_progress" || status == "blocked" || status == "completed" || status == "postponed" || status == "cancelled"
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
	if record.EditPolicy == "owner_only" && currentUser(r).ID != record.OwnerID {
		writeError(w, http.StatusForbidden, "Эту карточку может изменять только её ответственный")
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
	if _, ok := recordTypes[input.Type]; !ok {
		writeError(w, http.StatusBadRequest, "Неизвестный тип карточки")
		return
	}
	if input.Title == "" || len(input.Title) > 240 {
		writeError(w, http.StatusBadRequest, "Название обязательно и не длиннее 240 символов")
		return
	}
	if input.Status == "" {
		input.Status = defaultStatus(input.Type)
	}
	if !validStatusForType(input.Type, input.Status) || input.Status == "completed" || input.Status == "archived" {
		writeError(w, http.StatusBadRequest, "Некорректный начальный статус")
		return
	}
	user := currentUser(r)
	if input.OwnerID == 0 {
		input.OwnerID = user.ID
	}
	if !s.userExists(r.Context(), input.OwnerID) || (input.DecisionMakerID != nil && !s.userExists(r.Context(), *input.DecisionMakerID)) {
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
	if input.Type == "question_set" {
		databaseType = "document"
		subtype = "question_set"
		recordKind = ""
	} else if input.Type == "meeting" {
		databaseType = "document"
		recordKind = "meeting"
	}
	if !validRecordKind(databaseType, recordKind) {
		writeError(w, http.StatusBadRequest, "Некорректный вид карточки")
		return
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO records(id, type, subtype, record_kind, title, description, status, author_id, owner_id, decision_maker_id, due_at, priority, workstream, edit_policy, parent_id, is_root, estimate_minutes, actual_minutes, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, databaseType, subtype, recordKind, input.Title, strings.TrimSpace(input.Description), input.Status, user.ID, input.OwnerID, input.DecisionMakerID, dueAt, input.Priority, input.Workstream, input.EditPolicy, parentID, input.IsRoot, input.EstimateMinutes, input.ActualMinutes, now, now)
	if err != nil {
		log.Printf("create record: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось создать карточку")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, input.Type, id, "created", "", map[string]any{"title": input.Title, "status": input.Status, "ownerId": input.OwnerID}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
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
		"record": record, "sections": sections, "links": []RecordLink{}, "scores": []CriterionScore{},
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
	writeJSON(w, http.StatusOK, map[string]any{"links": links, "scores": scores, "researchOptions": researchOptions})
}

type updateRecordRequest struct {
	Title              *string `json:"title"`
	Description        *string `json:"description"`
	Status             *string `json:"status"`
	OwnerID            *int64  `json:"ownerId"`
	DecisionMakerID    *int64  `json:"decisionMakerId"`
	ClearDecisionMaker bool    `json:"clearDecisionMaker"`
	DueAt              *string `json:"dueAt"`
	Priority           *string `json:"priority"`
	Workstream         *string `json:"workstream"`
	EditPolicy         *string `json:"editPolicy"`
	ParentID           *string `json:"parentId"`
	ClearParent        bool    `json:"clearParent"`
	IsRoot             *bool   `json:"isRoot"`
	EstimateMinutes    *int    `json:"estimateMinutes"`
	ActualMinutes      *int    `json:"actualMinutes"`
	Progress           *int    `json:"progress"`
	ProgressNote       *string `json:"progressNote"`
	Result             *string `json:"result"`
	Reason             string  `json:"reason"`
	ExpectedUpdatedAt  *string `json:"expectedUpdatedAt"`
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
	if currentUser(r).ID != before.OwnerID && (input.OwnerID != nil || input.EditPolicy != nil) {
		writeError(w, http.StatusForbidden, "Только текущий ответственный может менять владельца и режим доступа")
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
	add := func(column string, value any) { updates = append(updates, column+" = ?"); args = append(args, value) }
	if input.Title != nil {
		value := strings.TrimSpace(*input.Title)
		if value == "" || len(value) > 240 {
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
		if *input.Status != before.Status {
			add("status", *input.Status)
			changes["status"] = map[string]any{"before": before.Status, "after": *input.Status}
			reasonRequired = true
			if *input.Status == "archived" {
				add("archived_at", nowText())
			}
			if *input.Status == "completed" {
				add("completed_at", nowText())
				add("progress", 100)
			}
		}
	}
	if input.OwnerID != nil {
		if !s.userExists(r.Context(), *input.OwnerID) {
			writeError(w, http.StatusBadRequest, "Ответственный не найден")
			return
		}
		if *input.OwnerID != before.OwnerID {
			add("owner_id", *input.OwnerID)
			changes["ownerId"] = map[string]any{"before": before.OwnerID, "after": *input.OwnerID}
		}
	}
	if input.DecisionMakerID != nil {
		if !s.userExists(r.Context(), *input.DecisionMakerID) {
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
			}
		}
	}
	if input.ClearParent && before.ParentID != nil {
		add("parent_id", nil)
		changes["parentId"] = map[string]any{"before": before.ParentID, "after": nil}
	}
	if input.IsRoot != nil && *input.IsRoot != before.IsRoot {
		add("is_root", *input.IsRoot)
		changes["isRoot"] = map[string]any{"before": before.IsRoot, "after": *input.IsRoot}
		if *input.IsRoot && before.ParentID != nil && !input.ClearParent {
			add("parent_id", nil)
			changes["parentId"] = map[string]any{"before": before.ParentID, "after": nil}
		}
	}
	if input.EstimateMinutes != nil {
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
	if reasonRequired && strings.TrimSpace(input.Reason) == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину фактического изменения статуса или срока")
		return
	}
	if len(updates) == 0 {
		writeError(w, http.StatusBadRequest, "Нет изменений")
		return
	}
	add("updated_at", nowText())
	args = append(args, before.ID)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET `+strings.Join(updates, ", ")+` WHERE id = ?`, args...); err != nil {
		log.Printf("update record: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить карточку")
		return
	}
	user := currentUser(r)
	if err := writeActivity(r.Context(), tx, user.ID, before.Type, before.ID, "updated", strings.TrimSpace(input.Reason), changes); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
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
		SELECT COALESCE(rs.id, ''), rs.record_id, d.id, d.name, COALESCE(rs.content, ''), d.sort_order,
			COALESCE(rs.updated_by, 0), COALESCE(u.username, ''), COALESCE(rs.updated_at, d.updated_at)
		FROM section_definitions d
		LEFT JOIN record_sections rs ON rs.definition_id = d.id AND rs.record_id = ?
		LEFT JOIN users u ON u.id = rs.updated_by
		WHERE (d.scope_type IS NULL OR d.scope_type = ?) AND (d.active = 1 OR rs.id IS NOT NULL)
		UNION ALL
		SELECT rs.id, rs.record_id, NULL, rs.title, rs.content, rs.sort_order, rs.updated_by, u.username, rs.updated_at
		FROM record_sections rs JOIN users u ON u.id = rs.updated_by
		WHERE rs.record_id = ? AND rs.definition_id IS NULL
		ORDER BY 6, 9`, record.ID, record.Type, record.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sections := make([]RecordSection, 0)
	for rows.Next() {
		var section RecordSection
		var recordID, definitionID sql.NullString
		if err := rows.Scan(&section.ID, &recordID, &definitionID, &section.Title, &section.Content, &section.SortOrder, &section.UpdatedBy, &section.UpdatedByName, &section.UpdatedAt); err != nil {
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
		if err := tx.QueryRowContext(r.Context(), `SELECT name, scope_type FROM section_definitions WHERE id = ?`, *input.DefinitionID).Scan(&definitionName, &scope); err != nil {
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
			_, err = tx.ExecContext(r.Context(), `INSERT INTO record_sections(id, record_id, definition_id, title, content, sort_order, created_by, updated_by, created_at, updated_at) SELECT ?, ?, id, name, ?, sort_order, ?, ?, ?, ? FROM section_definitions WHERE id = ?`, sectionID, record.ID, input.Content, user.ID, user.ID, now, now, *input.DefinitionID)
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
	rows, err := s.store.db.QueryContext(ctx, `SELECT l.id, l.source_id, l.target_id, l.relation_type, l.created_at, r.id, CASE WHEN r.subtype = 'question_set' THEN 'question_set' WHEN r.record_kind = 'meeting' THEN 'meeting' ELSE r.type END, r.record_kind, r.title, r.description, r.status, r.author_id, a.username, r.owner_id, o.username, r.decision_maker_id, dm.username, r.due_at, r.priority, r.workstream, r.edit_policy, r.parent_id, r.is_root, r.estimate_minutes, r.actual_minutes, r.progress, r.progress_note, r.result, r.completed_at, r.created_at, r.updated_at, (SELECT COUNT(*) FROM task_proofs p WHERE p.record_id = r.id) FROM record_links l JOIN records r ON r.id = CASE WHEN l.source_id = ? THEN l.target_id ELSE l.source_id END JOIN users a ON a.id = r.author_id JOIN users o ON o.id = r.owner_id LEFT JOIN users dm ON dm.id = r.decision_maker_id WHERE l.active = 1 AND (l.source_id = ? OR l.target_id = ?) ORDER BY l.created_at DESC`, recordID, recordID, recordID)
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
	if err := writeActivity(r.Context(), tx, user.ID, source.Type, source.ID, "link_created", input.Reason, map[string]any{"targetId": input.TargetID, "relationType": input.RelationType}); err != nil {
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

func (s *Server) listScores(ctx context.Context, recordID string) ([]CriterionScore, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT cs.id, cs.record_id, cs.criterion_id, c.title, cs.score, cs.note, cs.evaluated_by, u.username, cs.updated_at FROM criterion_scores cs JOIN records c ON c.id = cs.criterion_id JOIN users u ON u.id = cs.evaluated_by WHERE cs.record_id = ? ORDER BY c.title`, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	scores := make([]CriterionScore, 0)
	for rows.Next() {
		var score CriterionScore
		if err := rows.Scan(&score.ID, &score.RecordID, &score.CriterionID, &score.CriterionTitle, &score.Score, &score.Note, &score.EvaluatedBy, &score.EvaluatorUsername, &score.UpdatedAt); err != nil {
			return nil, err
		}
		scores = append(scores, score)
	}
	return scores, rows.Err()
}

func (s *Server) handleScoreCriterion(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	criterion, err := s.getRecord(r.Context(), r.PathValue("criterionId"))
	if err != nil || criterion.Type != "criterion" {
		writeError(w, http.StatusBadRequest, "Критерий не найден")
		return
	}
	var input struct {
		Score  int    `json:"score"`
		Note   string `json:"note"`
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Score < 0 || input.Score > 10 {
		writeError(w, http.StatusBadRequest, "Оценка должна быть от 0 до 10")
		return
	}
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать оценку")
		return
	}
	defer tx.Rollback()
	now := nowText()
	id, _ := newID()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO criterion_scores(id, record_id, criterion_id, score, note, evaluated_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(record_id, criterion_id) DO UPDATE SET score = excluded.score, note = excluded.note, evaluated_by = excluded.evaluated_by, updated_at = excluded.updated_at`, id, record.ID, criterion.ID, input.Score, strings.TrimSpace(input.Note), user.ID, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить оценку")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "criterion_scored", input.Reason, map[string]any{"criterionId": criterion.ID, "criterion": criterion.Title, "score": input.Score, "note": input.Note}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить оценку")
		return
	}
	scores, _ := s.listScores(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, scores)
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
	var proofCount int
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM task_proofs WHERE record_id = ?`, record.ID).Scan(&proofCount)
	if proofCount == 0 {
		writeError(w, http.StatusConflict, "Сначала добавьте доказательство выполнения")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать завершение")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET status = 'completed', progress = 100, result = ?, completed_at = ?, updated_at = ? WHERE id = ?`, strings.TrimSpace(input.Result), now, now, record.ID); err != nil {
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
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить операцию")
		return
	}
	completed, _ := s.getRecord(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, completed)
}

func (s *Server) insertPartnerNotifications(ctx context.Context, tx *sql.Tx, actor User, record Record, title, body string) error {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM users WHERE id <> ?`, actor.ID)
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
		  AND r.status NOT IN ('archived', 'cancelled')
		  AND q.status = 'open'
		  AND answer.id IS NULL
		ORDER BY CASE WHEN r.due_at IS NULL THEN 1 ELSE 0 END, r.due_at, q.created_at`, user.ID)
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
	if err := s.store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&workflow.UserCount); err != nil {
		return workflow, err
	}
	if workflow.UserCount < 2 {
		workflow.UserCount = 2
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
				CASE WHEN r.subtype = 'question_set' THEN 'question_set' WHEN r.record_kind = 'meeting' THEN 'meeting' ELSE r.type END,
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
		workflow.Answered += len(item.Answers)
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
	var registeredUserCount, answerCount int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT (SELECT COUNT(*) FROM users), (SELECT COUNT(*) FROM question_answers WHERE question_id = ?)`, questionID).Scan(&registeredUserCount, &answerCount); err != nil || registeredUserCount < 2 || answerCount < registeredUserCount {
		writeError(w, http.StatusConflict, "Совместное решение можно зафиксировать после ответов всех основателей")
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
	if !s.userExists(r.Context(), input.OwnerID) {
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
		databaseType, recordKind, status = "decision", "rule", "in_progress"
	case "insight":
		databaseType, recordKind, status = "decision", "insight", "draft"
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
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO records(id, type, subtype, record_kind, title, description, status, author_id, owner_id, due_at, workstream, parent_id, estimate_minutes, created_at, updated_at) VALUES(?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, outputID, databaseType, recordKind, input.Title, input.Description, status, user.ID, input.OwnerID, dueAt, source.Workstream, source.ID, input.EstimateMinutes, now, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать карточку результата")
		return
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
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, key, name, scope_type, kind, active, sort_order FROM section_definitions ORDER BY active DESC, scope_type, sort_order, name`)
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
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), 0) + 10 FROM section_definitions WHERE scope_type IS ?`, input.ScopeType).Scan(&sortOrder)
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO section_definitions(id, key, name, scope_type, kind, active, sort_order, created_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`, id, key, input.Name, input.ScopeType, input.Kind, sortOrder, user.ID, now, now); err != nil {
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
		if value == "" {
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
	args = append(args, nowText(), r.PathValue("id"))
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(r.Context(), `UPDATE section_definitions SET `+strings.Join(updates, ", ")+` WHERE id = ?`, args...)
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
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM section_definitions WHERE scope_type = ? AND active = 1`, input.ScopeType).Scan(&expected); err != nil || expected != len(input.OrderedIDs) {
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
		result, updateErr := tx.ExecContext(r.Context(), `UPDATE section_definitions SET sort_order = ?, updated_at = ? WHERE id = ? AND scope_type = ? AND active = 1`, (index+1)*10, nowText(), id, input.ScopeType)
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
	user := currentUser(r)
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, type, title, body, entity_type, entity_id, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить уведомления")
		return
	}
	defer rows.Close()
	notifications := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		var entityType, entityID, readAt sql.NullString
		if err := rows.Scan(&n.ID, &n.Type, &n.Title, &n.Body, &entityType, &entityID, &readAt, &n.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать уведомления")
			return
		}
		if entityType.Valid {
			n.EntityType = &entityType.String
		}
		if entityID.Valid {
			n.EntityID = &entityID.String
		}
		if readAt.Valid {
			n.ReadAt = &readAt.String
		}
		notifications = append(notifications, n)
	}
	writeJSON(w, http.StatusOK, notifications)
}

func (s *Server) handleReadNotification(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	_, _ = s.store.db.ExecContext(r.Context(), `UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?`, nowText(), r.PathValue("id"), user.ID)
	w.WriteHeader(http.StatusNoContent)
}
func (s *Server) handleReadAllNotifications(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	_, _ = s.store.db.ExecContext(r.Context(), `UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?`, nowText(), user.ID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleActivity(w http.ResponseWriter, r *http.Request) {
	where := []string{"1 = 1"}
	args := make([]any, 0)
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
