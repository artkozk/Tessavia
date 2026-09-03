package app

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type TeamSummary struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	Role         string  `json:"role"`
	ProjectCount int     `json:"projectCount"`
	DeletedAt    *string `json:"deletedAt,omitempty"`
}

type TeamMemberView struct {
	ID           int64             `json:"id"`
	Username     string            `json:"username"`
	DisplayName  string            `json:"displayName"`
	AvatarURL    string            `json:"avatarUrl,omitempty"`
	Role         string            `json:"role"`
	ProjectRoles map[string]string `json:"projectRoles"`
}

type TeamInvitationView struct {
	ID         string   `json:"id"`
	Role       string   `json:"role"`
	ProjectIDs []string `json:"projectIds"`
	ExpiresAt  string   `json:"expiresAt"`
	MaxUses    int      `json:"maxUses"`
	UseCount   int      `json:"useCount"`
	RevokedAt  *string  `json:"revokedAt,omitempty"`
	CreatedAt  string   `json:"createdAt"`
	CreatedBy  string   `json:"createdBy"`
}

type TeamDetail struct {
	TeamSummary
	Projects    []Workspace          `json:"projects"`
	Members     []TeamMemberView     `json:"members"`
	Invitations []TeamInvitationView `json:"invitations"`
}

func (s *Server) teamRole(ctx context.Context, teamID string, userID int64) (string, error) {
	var role string
	err := s.store.db.QueryRowContext(ctx, `SELECT tm.role FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE team_id = ? AND user_id = ? AND status = 'active' AND t.deleted_at IS NULL`, teamID, userID).Scan(&role)
	return role, err
}

func (s *Server) requireTeamAdmin(w http.ResponseWriter, r *http.Request, teamID string) (string, bool) {
	role, err := s.teamRole(r.Context(), teamID, currentUser(r).ID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Команда не найдена")
		return "", false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить роль в команде")
		return "", false
	}
	if role != "owner" && role != "admin" {
		writeError(w, http.StatusForbidden, "Управлять командой может владелец или администратор")
		return role, false
	}
	return role, true
}

func (s *Server) handleListTeams(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT t.id, t.name, t.description, tm.role, t.deleted_at,
		(SELECT COUNT(*) FROM workspaces project JOIN workspace_members access ON access.workspace_id = project.id AND access.user_id = ? AND access.status = 'active' WHERE project.team_id = t.id AND project.archived_at IS NULL)
		FROM teams t JOIN team_members tm ON tm.team_id = t.id
		WHERE tm.user_id = ? AND tm.status = 'active'
		AND (t.deleted_at IS NULL OR (? AND t.owner_id = tm.user_id))
		ORDER BY t.name`, currentUser(r).ID, currentUser(r).ID, r.URL.Query().Get("includeDeleted") == "true")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить команды")
		return
	}
	defer rows.Close()
	items := make([]TeamSummary, 0)
	for rows.Next() {
		var item TeamSummary
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.Role, &item.DeletedAt, &item.ProjectCount); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать команды")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleCreateTeam(w http.ResponseWriter, r *http.Request) {
	// The compatibility endpoint creates a team and its first isolated project.
	s.handleCreateWorkspace(w, r)
}

func (s *Server) handleGetTeam(w http.ResponseWriter, r *http.Request) {
	teamID := strings.TrimSpace(r.PathValue("id"))
	if _, err := s.teamRole(r.Context(), teamID, currentUser(r).ID); err != nil {
		writeError(w, http.StatusNotFound, "Команда не найдена")
		return
	}
	detail, err := s.loadTeamDetail(r.Context(), teamID, currentUser(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить настройки команды")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) loadTeamDetail(ctx context.Context, teamID string, viewerID int64) (TeamDetail, error) {
	var detail TeamDetail
	if err := s.store.db.QueryRowContext(ctx, `SELECT t.id, t.name, t.description, tm.role,
		(SELECT COUNT(*) FROM workspaces WHERE team_id = t.id AND archived_at IS NULL)
		FROM teams t JOIN team_members tm ON tm.team_id = t.id
		WHERE t.id = ? AND tm.user_id = ? AND tm.status = 'active' AND t.deleted_at IS NULL`, teamID, viewerID).
		Scan(&detail.ID, &detail.Name, &detail.Description, &detail.Role, &detail.ProjectCount); err != nil {
		return detail, err
	}
	projectRows, err := s.store.db.QueryContext(ctx, `SELECT w.id, w.name, w.slug, w.kind, COALESCE(wm.role, ''), w.delete_policy, w.description, w.team_id, t.name, tm.role
		FROM workspaces w JOIN teams t ON t.id = w.team_id
		JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ? AND tm.status = 'active'
		LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.status = 'active'
		WHERE w.team_id = ? AND w.archived_at IS NULL AND (? IN ('owner', 'admin') OR wm.user_id IS NOT NULL) ORDER BY w.created_at, w.name`, viewerID, viewerID, teamID, detail.Role)
	if err != nil {
		return detail, err
	}
	detail.Projects = make([]Workspace, 0)
	for projectRows.Next() {
		var project Workspace
		if err := projectRows.Scan(&project.ID, &project.Name, &project.Slug, &project.Kind, &project.Role, &project.DeletePolicy, &project.Description, &project.TeamID, &project.TeamName, &project.TeamRole); err != nil {
			projectRows.Close()
			return detail, err
		}
		detail.Projects = append(detail.Projects, project)
	}
	if err := projectRows.Close(); err != nil {
		return detail, err
	}
	memberRows, err := s.store.db.QueryContext(ctx, `SELECT u.id, u.username, u.display_name, u.avatar_stored_name, u.avatar_updated_at, tm.role
		FROM team_members tm JOIN users u ON u.id = tm.user_id
		WHERE tm.team_id = ? AND tm.status = 'active' ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.username`, teamID)
	if err != nil {
		return detail, err
	}
	detail.Members = make([]TeamMemberView, 0)
	for memberRows.Next() {
		var member TeamMemberView
		var avatarStoredName, avatarUpdatedAt string
		if err := memberRows.Scan(&member.ID, &member.Username, &member.DisplayName, &avatarStoredName, &avatarUpdatedAt, &member.Role); err != nil {
			memberRows.Close()
			return detail, err
		}
		user := User{ID: member.ID}
		setUserAvatar(&user, avatarStoredName, avatarUpdatedAt)
		member.AvatarURL = user.AvatarURL
		member.ProjectRoles = make(map[string]string)
		detail.Members = append(detail.Members, member)
	}
	if err := memberRows.Close(); err != nil {
		return detail, err
	}
	memberIndexes := make(map[int64]int, len(detail.Members))
	visibleProjects := make(map[string]bool, len(detail.Projects))
	for _, project := range detail.Projects {
		visibleProjects[project.ID] = true
	}
	detail.ProjectCount = len(detail.Projects)
	for index := range detail.Members {
		memberIndexes[detail.Members[index].ID] = index
	}
	roleRows, err := s.store.db.QueryContext(ctx, `SELECT wm.user_id, wm.workspace_id, wm.role FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id WHERE w.team_id = ? AND wm.status = 'active' AND w.archived_at IS NULL`, teamID)
	if err != nil {
		return detail, err
	}
	for roleRows.Next() {
		var userID int64
		var projectID, projectRole string
		if err := roleRows.Scan(&userID, &projectID, &projectRole); err != nil {
			roleRows.Close()
			return detail, err
		}
		if index, ok := memberIndexes[userID]; ok && visibleProjects[projectID] {
			detail.Members[index].ProjectRoles[projectID] = projectRole
		}
	}
	if err := roleRows.Close(); err != nil {
		return detail, err
	}
	detail.Invitations = make([]TeamInvitationView, 0)
	if detail.Role == "member" {
		return detail, nil
	}
	inviteRows, err := s.store.db.QueryContext(ctx, `SELECT invitation.id, invitation.role, invitation.project_ids_json, invitation.expires_at, invitation.max_uses, invitation.use_count, invitation.revoked_at, invitation.created_at, creator.username
		FROM workspace_invitations invitation JOIN users creator ON creator.id = invitation.created_by
		WHERE invitation.team_id = ? ORDER BY invitation.created_at DESC LIMIT 50`, teamID)
	if err != nil {
		return detail, err
	}
	detail.Invitations = make([]TeamInvitationView, 0)
	for inviteRows.Next() {
		var item TeamInvitationView
		var projectJSON string
		if err := inviteRows.Scan(&item.ID, &item.Role, &projectJSON, &item.ExpiresAt, &item.MaxUses, &item.UseCount, &item.RevokedAt, &item.CreatedAt, &item.CreatedBy); err != nil {
			inviteRows.Close()
			return detail, err
		}
		_ = json.Unmarshal([]byte(projectJSON), &item.ProjectIDs)
		detail.Invitations = append(detail.Invitations, item)
	}
	inviteRows.Close()
	return detail, nil
}

func (s *Server) handleCreateTeamProject(w http.ResponseWriter, r *http.Request) {
	// Compatibility for cached clients: a former "project" is now an independent
	// team with its own membership and administrator boundary.
	s.handleCreateWorkspace(w, r)
}

func normalizeTeamRole(role string) string {
	if role == "admin" {
		return "admin"
	}
	return "member"
}

func (s *Server) validatedTeamProjects(ctx context.Context, teamID string, projectIDs []string) ([]string, error) {
	unique := make(map[string]bool)
	result := make([]string, 0, len(projectIDs))
	for _, projectID := range projectIDs {
		projectID = strings.TrimSpace(projectID)
		if projectID == "" || unique[projectID] {
			continue
		}
		var exists int
		if err := s.store.db.QueryRowContext(ctx, `SELECT 1 FROM workspaces WHERE id = ? AND team_id = ? AND archived_at IS NULL`, projectID, teamID).Scan(&exists); err != nil {
			return nil, errors.New("один из проектов не принадлежит команде")
		}
		unique[projectID] = true
		result = append(result, projectID)
	}
	return result, nil
}

func grantTeamMemberTx(ctx context.Context, tx *sql.Tx, teamID string, userID int64, role string, projectIDs []string, actorID int64, preserveElevatedRole bool) error {
	now := nowText()
	var activeTeam int
	if err := tx.QueryRowContext(ctx, `SELECT 1 FROM teams WHERE id = ? AND deleted_at IS NULL`, teamID).Scan(&activeTeam); err != nil {
		return err
	}
	var existingRole string
	err := tx.QueryRowContext(ctx, `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'active'`, teamID, userID).Scan(&existingRole)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if existingRole == "owner" || preserveElevatedRole && existingRole == "admin" && role == "member" {
		role = existingRole
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO team_members(team_id, user_id, role, status, joined_at) VALUES(?, ?, ?, 'active', ?)
		ON CONFLICT(team_id, user_id) DO UPDATE SET role = CASE WHEN team_members.role = 'owner' AND team_members.status = 'active' THEN 'owner' ELSE excluded.role END, status = 'active'`, teamID, userID, role, now); err != nil {
		return err
	}
	if role == "owner" || role == "admin" {
		rows, err := tx.QueryContext(ctx, `SELECT id FROM workspaces WHERE team_id = ? AND archived_at IS NULL`, teamID)
		if err != nil {
			return err
		}
		projectIDs = projectIDs[:0]
		for rows.Next() {
			var projectID string
			if err := rows.Scan(&projectID); err != nil {
				rows.Close()
				return err
			}
			projectIDs = append(projectIDs, projectID)
		}
		rows.Close()
	}
	allowed := make(map[string]bool, len(projectIDs))
	for _, projectID := range projectIDs {
		allowed[projectID] = true
		projectRole := "member"
		if role == "owner" {
			projectRole = "owner"
		} else if role == "admin" {
			projectRole = "admin"
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_members(workspace_id, user_id, role, status, joined_at) VALUES(?, ?, ?, 'active', ?)
			ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'`, projectID, userID, projectRole, now); err != nil {
			return err
		}
	}
	rows, err := tx.QueryContext(ctx, `SELECT wm.workspace_id FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id WHERE w.team_id = ? AND wm.user_id = ?`, teamID, userID)
	if err != nil {
		return err
	}
	remove := make([]string, 0)
	for rows.Next() {
		var projectID string
		if err := rows.Scan(&projectID); err != nil {
			rows.Close()
			return err
		}
		if !allowed[projectID] {
			remove = append(remove, projectID)
		}
	}
	rows.Close()
	for _, projectID := range remove {
		if err := handoffTeamAssignmentsTx(ctx, tx, teamID, userID, projectID, actorID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`, projectID, userID); err != nil {
			return err
		}
	}
	return writeTeamActivity(ctx, tx, actorID, teamID, "member_access_updated", "Доступ участника к проектам изменён", map[string]any{"userId": userID, "role": role, "projectIds": projectIDs})
}

func (s *Server) handleAddTeamMember(w http.ResponseWriter, r *http.Request) {
	teamID := strings.TrimSpace(r.PathValue("id"))
	if _, ok := s.requireTeamAdmin(w, r, teamID); !ok {
		return
	}
	var input struct {
		Username   string   `json:"username"`
		Role       string   `json:"role"`
		ProjectIDs []string `json:"projectIds"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	projects, err := s.validatedTeamProjects(r.Context(), teamID, input.ProjectIDs)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var userID int64
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT id FROM users WHERE username = ?`, strings.TrimPrefix(strings.TrimSpace(input.Username), "@")).Scan(&userID); err != nil {
		writeError(w, http.StatusNotFound, "Пользователь с таким юзернеймом не найден")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать добавление")
		return
	}
	defer tx.Rollback()
	if _, err = teamManagerTx(r.Context(), tx, teamID, currentUser(r).ID); err != nil {
		writeError(w, 403, "Доступ к управлению командой изменился")
		return
	}
	if err = grantTeamMemberTx(r.Context(), tx, teamID, userID, normalizeTeamRole(input.Role), projects, currentUser(r).ID, true); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось добавить участника")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить добавление")
		return
	}
	detail, _ := s.loadTeamDetail(r.Context(), teamID, currentUser(r).ID)
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleUpdateTeamMember(w http.ResponseWriter, r *http.Request) {
	teamID := strings.TrimSpace(r.PathValue("id"))
	if _, ok := s.requireTeamAdmin(w, r, teamID); !ok {
		return
	}
	userID, err := strconv.ParseInt(r.PathValue("userId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный участник")
		return
	}
	var ownerID int64
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT owner_id FROM teams WHERE id = ?`, teamID).Scan(&ownerID); err != nil || userID == ownerID {
		writeError(w, http.StatusBadRequest, "Роль владельца нельзя изменить")
		return
	}
	var input struct {
		Role       string   `json:"role"`
		ProjectIDs []string `json:"projectIds"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	projects, err := s.validatedTeamProjects(r.Context(), teamID, input.ProjectIDs)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение доступа")
		return
	}
	defer tx.Rollback()
	actorRole, roleErr := teamManagerTx(r.Context(), tx, teamID, currentUser(r).ID)
	if roleErr != nil {
		writeError(w, 403, "Доступ к управлению командой изменился")
		return
	}
	var targetRole string
	if err = tx.QueryRowContext(r.Context(), `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'active'`, teamID, userID).Scan(&targetRole); err != nil {
		writeError(w, 404, "Участник не найден")
		return
	}
	if targetRole == "owner" || actorRole == "admin" && targetRole == "admin" {
		writeError(w, 403, "Изменить доступ администратора может владелец команды")
		return
	}
	if err = grantTeamMemberTx(r.Context(), tx, teamID, userID, normalizeTeamRole(input.Role), projects, currentUser(r).ID, false); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось изменить доступ")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение")
		return
	}
	detail, _ := s.loadTeamDetail(r.Context(), teamID, currentUser(r).ID)
	writeJSON(w, http.StatusOK, detail)
}

func invitationCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	for index := range bytes {
		bytes[index] = alphabet[int(bytes[index])%len(alphabet)]
	}
	return string(bytes[:4]) + "-" + string(bytes[4:]), nil
}

func normalizeInvitationCode(value string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(value), "-", ""))
}

func (s *Server) handleCreateTeamInvitation(w http.ResponseWriter, r *http.Request) {
	teamID := strings.TrimSpace(r.PathValue("id"))
	if _, ok := s.requireTeamAdmin(w, r, teamID); !ok {
		return
	}
	var input struct {
		Role        string   `json:"role"`
		ProjectIDs  []string `json:"projectIds"`
		ExpiresDays int      `json:"expiresDays"`
		MaxUses     int      `json:"maxUses"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	projects, err := s.validatedTeamProjects(r.Context(), teamID, input.ProjectIDs)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.ExpiresDays < 1 || input.ExpiresDays > 90 {
		input.ExpiresDays = 7
	}
	if input.MaxUses < 1 || input.MaxUses > 1000 {
		input.MaxUses = 1
	}
	id, _ := newID()
	token, tokenHash, err := newSessionToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать ссылку")
		return
	}
	code, err := invitationCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать код")
		return
	}
	projectJSON, _ := json.Marshal(projects)
	expiresAt := time.Now().UTC().Add(time.Duration(input.ExpiresDays) * 24 * time.Hour).Format(time.RFC3339Nano)
	result, err := s.store.db.ExecContext(r.Context(), `INSERT INTO workspace_invitations(id, team_id, token_hash, code_hash, role, project_ids_json, created_by, expires_at, max_uses, created_at)
		SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = ? AND t.deleted_at IS NULL AND tm.user_id = ? AND tm.status = 'active' AND tm.role IN ('owner', 'admin'))`, id, teamID, tokenHash, hashToken(normalizeInvitationCode(code)), normalizeTeamRole(input.Role), string(projectJSON), currentUser(r).ID, expiresAt, input.MaxUses, nowText(), teamID, currentUser(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить приглашение")
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		writeError(w, 403, "Доступ к управлению командой изменился")
		return
	}
	proto := "https"
	if r.TLS == nil && strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")) == "" {
		proto = "http"
	} else if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwarded != "" {
		proto = forwarded
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": id, "teamId": teamID, "role": normalizeTeamRole(input.Role), "projectIds": projects,
		"expiresAt": expiresAt, "maxUses": input.MaxUses, "code": code,
		"url": fmt.Sprintf("%s://%s/?invite=%s", proto, r.Host, token),
	})
}

func (s *Server) handleRevokeTeamInvitation(w http.ResponseWriter, r *http.Request) {
	teamID := strings.TrimSpace(r.PathValue("id"))
	if _, ok := s.requireTeamAdmin(w, r, teamID); !ok {
		return
	}
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE workspace_invitations SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND team_id = ?`, nowText(), r.PathValue("inviteId"), teamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось отозвать приглашение")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(w, http.StatusNotFound, "Приглашение не найдено")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAcceptTeamInvitation(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token string `json:"token"`
		Code  string `json:"code"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	lookupColumn := "token_hash"
	lookupValue := hashToken(strings.TrimSpace(input.Token))
	if strings.TrimSpace(input.Token) == "" {
		lookupColumn = "code_hash"
		lookupValue = hashToken(normalizeInvitationCode(input.Code))
	}
	if strings.TrimSpace(input.Token) == "" && normalizeInvitationCode(input.Code) == "" {
		writeError(w, http.StatusBadRequest, "Введите код или откройте ссылку приглашения")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать принятие приглашения")
		return
	}
	defer tx.Rollback()
	var inviteID, teamID, role, projectJSON, expiresAt string
	var maxUses, useCount int
	err = tx.QueryRowContext(r.Context(), `SELECT id, team_id, role, project_ids_json, expires_at, max_uses, use_count FROM workspace_invitations WHERE `+lookupColumn+` = ? AND revoked_at IS NULL`, lookupValue).
		Scan(&inviteID, &teamID, &role, &projectJSON, &expiresAt, &maxUses, &useCount)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Приглашение не найдено или отозвано")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить приглашение")
		return
	}
	if timestampExpired(expiresAt) || useCount >= maxUses {
		writeError(w, http.StatusGone, "Срок или число использований приглашения исчерпаны")
		return
	}
	projects := make([]string, 0)
	if err := json.Unmarshal([]byte(projectJSON), &projects); err != nil {
		writeError(w, http.StatusInternalServerError, "В приглашении повреждён список проектов")
		return
	}
	if err = grantTeamMemberTx(r.Context(), tx, teamID, currentUser(r).ID, role, projects, currentUser(r).ID, true); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось выдать доступ")
		return
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE workspace_invitations SET use_count = use_count + 1 WHERE id = ? AND use_count = ? AND use_count < max_uses`, inviteID, useCount)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось применить приглашение")
		return
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		writeError(w, http.StatusConflict, "Приглашение уже применено другим пользователем")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusConflict, "Приглашение уже применено другим пользователем")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"teamId": teamID})
}
