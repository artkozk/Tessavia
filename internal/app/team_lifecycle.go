package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

// Account routes must survive a removed project still selected in another tab.
func accountScopedPath(path string) bool {
	return path == "/api/me" || strings.HasPrefix(path, "/api/me/") ||
		path == "/api/workspaces" || path == "/api/teams" || strings.HasPrefix(path, "/api/teams/") ||
		strings.HasPrefix(path, "/api/personal/") || path == "/api/invitations/accept" || path == "/api/auth/logout"
}

// Team access events must never inherit an unrelated selected project's history.
func writeTeamActivity(ctx context.Context, tx *sql.Tx, actorID int64, teamID, action, reason string, details map[string]any) error {
	id, err := newID()
	if err != nil {
		return err
	}
	body, err := json.Marshal(details)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO team_activity(id, team_id, actor_id, action, reason, details_json, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)`, id, teamID, actorID, action, reason, string(body), nowText())
	return err
}

func teamManagerTx(ctx context.Context, tx *sql.Tx, teamID string, actorID int64) (string, error) {
	var role string
	err := tx.QueryRowContext(ctx, `SELECT tm.role FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.id = ? AND t.deleted_at IS NULL AND tm.user_id = ? AND tm.status = 'active' AND tm.role IN ('owner', 'admin')`, teamID, actorID).Scan(&role)
	return role, err
}

func (s *Server) handleDeleteTeam(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("id")
	role, ok := s.requireTeamAdmin(w, r, teamID)
	if !ok {
		return
	}
	if role != "owner" {
		writeError(w, http.StatusForbidden, "Удалить команду может только владелец")
		return
	}
	var input struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать удаление")
		return
	}
	defer tx.Rollback()
	now := nowText()
	result, err := tx.ExecContext(r.Context(), `UPDATE teams SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND name = ? AND deleted_at IS NULL`, now, now, teamID, currentUser(r).ID, strings.TrimSpace(input.Name))
	if err != nil {
		writeError(w, 500, "Не удалось удалить команду")
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		writeError(w, 409, "Название или владелец команды изменились. Обновите окно и подтвердите название")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_invitations SET revoked_at = COALESCE(revoked_at, ?) WHERE team_id = ?`, now, teamID); err != nil {
		writeError(w, 500, "Не удалось отозвать приглашения")
		return
	}
	if err = writeTeamActivity(r.Context(), tx, currentUser(r).ID, teamID, "team_deleted", "Команда удалена с возможностью восстановления", nil); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось завершить удаление")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRestoreTeam(w http.ResponseWriter, r *http.Request) {
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать восстановление")
		return
	}
	defer tx.Rollback()
	teamID := r.PathValue("id")
	result, err := tx.ExecContext(r.Context(), `UPDATE teams SET deleted_at = NULL, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`, nowText(), teamID, currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось восстановить команду")
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		writeError(w, 404, "Удалённая команда не найдена")
		return
	}
	if err = writeTeamActivity(r.Context(), tx, currentUser(r).ID, teamID, "team_restored", "Команда восстановлена; приглашения остаются отозванными", nil); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось завершить восстановление")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleLeaveTeam(w http.ResponseWriter, r *http.Request) {
	s.removeTeamMember(w, r, currentUser(r).ID, true)
}

func (s *Server) handleRemoveTeamMember(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(r.PathValue("userId"), 10, 64)
	if err != nil || userID <= 0 {
		writeError(w, 400, "Некорректный участник")
		return
	}
	s.removeTeamMember(w, r, userID, false)
}

func (s *Server) removeTeamMember(w http.ResponseWriter, r *http.Request, userID int64, self bool) {
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать изменение участия")
		return
	}
	defer tx.Rollback()
	teamID, actorID := r.PathValue("id"), currentUser(r).ID
	var actorRole, targetRole string
	err = tx.QueryRowContext(r.Context(), `SELECT actor.role, target.role FROM teams t
		JOIN team_members actor ON actor.team_id = t.id AND actor.user_id = ? AND actor.status = 'active'
		JOIN team_members target ON target.team_id = t.id AND target.user_id = ? AND target.status = 'active'
		WHERE t.id = ? AND t.deleted_at IS NULL`, actorID, userID, teamID).Scan(&actorRole, &targetRole)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Команда или участник не найдены")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось проверить участие")
		return
	}
	if targetRole == "owner" {
		writeError(w, 409, "Сначала передайте владение командой или удалите её")
		return
	}
	if !self && actorID == userID {
		writeError(w, 400, "Для своего аккаунта используйте выход из команды")
		return
	}
	if !self && actorRole != "owner" && (actorRole != "admin" || targetRole != "member") {
		writeError(w, 403, "Недостаточно прав для исключения этого участника")
		return
	}
	if err = handoffTeamAssignmentsTx(r.Context(), tx, teamID, userID, "", actorID); err != nil {
		writeError(w, 500, "Не удалось передать незавершённую работу владельцу")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `DELETE FROM workspace_members WHERE user_id = ? AND workspace_id IN (SELECT id FROM workspaces WHERE team_id = ?)`, userID, teamID); err != nil {
		writeError(w, 500, "Не удалось закрыть проектный доступ")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE team_members SET status = 'suspended' WHERE team_id = ? AND user_id = ?`, teamID, userID); err != nil {
		writeError(w, 500, "Не удалось изменить участие")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_invitations SET revoked_at = COALESCE(revoked_at, ?) WHERE team_id = ? AND created_by = ?`, nowText(), teamID, userID); err != nil {
		writeError(w, 500, "Не удалось отозвать приглашения участника")
		return
	}
	action := "member_removed"
	if self {
		action = "member_left"
	}
	if err = writeTeamActivity(r.Context(), tx, actorID, teamID, action, "Доступ закрыт, незавершённая работа передана владельцу", map[string]any{"userId": userID}); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось завершить изменение участия")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Keep authorship and completed work intact; active work must not lose its operator.
func handoffTeamAssignmentsTx(ctx context.Context, tx *sql.Tx, teamID string, userID int64, projectID string, actorID int64) error {
	var ownerID int64
	if err := tx.QueryRowContext(ctx, `SELECT owner_id FROM teams WHERE id = ? AND deleted_at IS NULL`, teamID).Scan(&ownerID); err != nil {
		return err
	}
	if ownerID == userID {
		return nil
	}
	rows, err := tx.QueryContext(ctx, `SELECT r.id, r.type, r.workspace_id, r.owner_id, r.decision_maker_id, r.author_id FROM records r JOIN workspaces w ON w.id = r.workspace_id
		WHERE w.team_id = ? AND (? = '' OR w.id = ?) AND (r.owner_id = ? OR r.decision_maker_id = ? OR (r.type = 'task' AND r.author_id = ? AND r.decision_maker_id IS NULL))
		AND r.status NOT IN ('completed', 'cancelled', 'archived', 'rejected', 'replaced')`, teamID, projectID, projectID, userID, userID, userID)
	if err != nil {
		return err
	}
	type assignment struct {
		id, kind, workspace string
		owner, author       int64
		reviewer            sql.NullInt64
	}
	items := []assignment{}
	for rows.Next() {
		var item assignment
		if err := rows.Scan(&item.id, &item.kind, &item.workspace, &item.owner, &item.reviewer, &item.author); err != nil {
			rows.Close()
			return err
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, item := range items {
		changes := map[string]any{}
		if item.owner == userID {
			changes["ownerId"] = map[string]any{"before": userID, "after": ownerID}
		}
		if item.reviewer.Valid && item.reviewer.Int64 == userID || !item.reviewer.Valid && item.author == userID && item.kind == "task" {
			var before any
			if item.reviewer.Valid {
				before = item.reviewer.Int64
			}
			changes["decisionMakerId"] = map[string]any{"before": before, "after": ownerID}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE records SET owner_id = CASE WHEN owner_id = ? THEN ? ELSE owner_id END, decision_maker_id = CASE WHEN decision_maker_id = ? OR (type = 'task' AND author_id = ? AND decision_maker_id IS NULL) THEN ? ELSE decision_maker_id END, updated_at = ? WHERE id = ?`, userID, ownerID, userID, userID, ownerID, nowText(), item.id); err != nil {
			return err
		}
		projectContext := context.WithValue(ctx, workspaceContextKey, workspaceAccess{ID: item.workspace, Kind: "team", Role: "owner"})
		if err := writeActivity(projectContext, tx, actorID, item.kind, item.id, "updated", "Участник потерял доступ к проекту; работа передана владельцу команды", changes); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) handleTransferTeamOwnership(w http.ResponseWriter, r *http.Request) {
	var input struct {
		UserID int64 `json:"userId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.UserID == currentUser(r).ID || input.UserID <= 0 {
		writeError(w, 400, "Выберите другого участника")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать передачу команды")
		return
	}
	defer tx.Rollback()
	teamID, actorID := r.PathValue("id"), currentUser(r).ID
	result, err := tx.ExecContext(r.Context(), `UPDATE teams SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
		AND EXISTS (SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'active')`, input.UserID, nowText(), teamID, actorID, teamID, input.UserID)
	if err != nil {
		writeError(w, 500, "Не удалось передать команду")
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		writeError(w, 403, "Передать команду может её владелец действующему участнику")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE team_members SET role = CASE WHEN user_id = ? THEN 'owner' ELSE 'admin' END WHERE team_id = ? AND user_id IN (?, ?)`, input.UserID, teamID, actorID, input.UserID); err != nil {
		writeError(w, 500, "Не удалось обновить роли")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE workspaces SET owner_id = ?, updated_at = ? WHERE team_id = ?`, input.UserID, nowText(), teamID); err != nil {
		writeError(w, 500, "Не удалось передать проекты")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_members SET role = 'admin' WHERE workspace_id IN (SELECT id FROM workspaces WHERE team_id = ?) AND role = 'owner'`, teamID); err != nil {
		writeError(w, 500, "Не удалось обновить проектные роли")
		return
	}
	if err = grantTeamMemberTx(r.Context(), tx, teamID, input.UserID, "owner", nil, actorID, false); err != nil {
		writeError(w, 500, "Не удалось выдать доступ владельцу")
		return
	}
	if err = writeTeamActivity(r.Context(), tx, actorID, teamID, "ownership_transferred", "Владение командой передано", map[string]any{"before": actorID, "after": input.UserID}); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось завершить передачу")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRenameTeam(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("id")
	if _, ok := s.requireTeamAdmin(w, r, teamID); !ok {
		return
	}
	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name, input.Description = strings.TrimSpace(input.Name), strings.TrimSpace(input.Description)
	if input.Name == "" || len([]rune(input.Name)) > 100 || len([]rune(input.Description)) > 800 {
		writeError(w, 400, "Укажите название до 100 символов и описание до 800 символов")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать сохранение")
		return
	}
	defer tx.Rollback()
	if _, err = teamManagerTx(r.Context(), tx, teamID, currentUser(r).ID); err != nil {
		writeError(w, 403, "Доступ к управлению командой изменился")
		return
	}
	var previousName, previousDescription string
	if err = tx.QueryRowContext(r.Context(), `SELECT name, description FROM teams WHERE id = ?`, teamID).Scan(&previousName, &previousDescription); err != nil {
		writeError(w, 404, "Команда не найдена")
		return
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE teams SET name = ?, description = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, input.Name, input.Description, nowText(), teamID)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить команду")
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		writeError(w, 404, "Команда не найдена")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE workspaces SET name = ?, description = ?, updated_at = ? WHERE team_id = ? AND kind = 'team'`, input.Name, input.Description, nowText(), teamID); err != nil {
		writeError(w, 500, "Не удалось обновить рабочее пространство команды")
		return
	}
	if err = writeTeamActivity(r.Context(), tx, currentUser(r).ID, teamID, "team_updated", "Название и описание команды изменены", map[string]any{"name": map[string]any{"before": previousName, "after": input.Name}, "description": map[string]any{"before": previousDescription, "after": input.Description}}); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось завершить сохранение")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
