package app

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
)

type chatGroupMember struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Active   bool   `json:"active"`
}

type chatGroupDetail struct {
	ID              string            `json:"id"`
	Title           string            `json:"title"`
	Version         int64             `json:"version"`
	Role            string            `json:"role"`
	CanRecoverOwner bool              `json:"canRecoverOwner"`
	Members         []chatGroupMember `json:"members"`
}

// Keep a settings version separate from the thread's last-message timestamp.
// All authorization and membership writes below share one database transaction.
func (s *Server) handleChatGroup(w http.ResponseWriter, r *http.Request) {
	actor, workspace, thread := currentUser(r), currentWorkspace(r), r.PathValue("id")
	var input struct {
		Action          string `json:"action"`
		Title           string `json:"title"`
		UserID          int64  `json:"userId"`
		Role            string `json:"role"`
		ExpectedVersion int64  `json:"expectedVersion"`
	}
	if r.Method == "PATCH" && !decodeJSON(w, r, &input) {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть настройки группы")
		return
	}
	defer tx.Rollback()
	detail := chatGroupDetail{ID: thread, Members: []chatGroupMember{}}
	var projectRole string
	err = tx.QueryRowContext(r.Context(), `SELECT t.title,g.version,wm.role,COALESCE(gr.role,'member') FROM chat_threads t JOIN chat_group_settings g ON g.thread_id=t.id JOIN chat_members cm ON cm.thread_id=t.id AND cm.user_id=? JOIN workspace_members wm ON wm.workspace_id=t.workspace_id AND wm.user_id=cm.user_id AND wm.status='active' LEFT JOIN chat_group_roles gr ON gr.thread_id=t.id AND gr.user_id=cm.user_id WHERE t.id=? AND t.workspace_id=? AND t.conversation_kind='group'`, actor.ID, thread, workspace.ID).Scan(&detail.Title, &detail.Version, &projectRole, &detail.Role)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 403, "Нет доступа к настройкам этой группы")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось проверить доступ к группе")
		return
	}
	rows, err := tx.QueryContext(r.Context(), `SELECT u.id,u.username,COALESCE(gr.role,'member'),COALESCE(wm.status='active',0) FROM chat_members cm JOIN users u ON u.id=cm.user_id LEFT JOIN workspace_members wm ON wm.workspace_id=? AND wm.user_id=cm.user_id LEFT JOIN chat_group_roles gr ON gr.thread_id=cm.thread_id AND gr.user_id=cm.user_id WHERE cm.thread_id=? ORDER BY CASE COALESCE(gr.role,'member') WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.username,u.id`, workspace.ID, thread)
	if err != nil {
		writeError(w, 500, "Не удалось получить состав группы")
		return
	}
	activeOwner, activeCount := false, 0
	var target chatGroupMember
	for rows.Next() {
		var member chatGroupMember
		if err = rows.Scan(&member.ID, &member.Username, &member.Role, &member.Active); err != nil {
			break
		}
		detail.Members = append(detail.Members, member)
		if member.ID == input.UserID {
			target = member
		}
		if member.Active {
			activeCount++
			if member.Role == "owner" {
				activeOwner = true
			}
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		writeError(w, 500, "Не удалось получить состав группы")
		return
	}
	detail.CanRecoverOwner = !activeOwner && (detail.Role == "admin" || projectRole == "owner" || projectRole == "admin")
	if r.Method == "GET" {
		writeJSON(w, 200, detail)
		return
	}
	if input.ExpectedVersion != detail.Version {
		writeError(w, 409, "Состав или настройки изменились. Обновите окно и проверьте действие ещё раз")
		return
	}
	canManage := detail.Role == "owner" || detail.Role == "admin"
	deny := func() { writeError(w, 403, "Недостаточно прав в этой группе") }
	var event string
	switch input.Action {
	case "rename":
		if !canManage {
			deny()
			return
		}
		input.Title = strings.TrimSpace(input.Title)
		if input.Title == "" || len([]rune(input.Title)) > 100 {
			writeError(w, 400, "Название — от 1 до 100 символов")
			return
		}
		if input.Title == detail.Title {
			w.WriteHeader(204)
			return
		}
		_, err = tx.ExecContext(r.Context(), `UPDATE chat_threads SET title=? WHERE id=?`, input.Title, thread)
		event = actor.Username + " изменил название группы: «" + input.Title + "»"
	case "add":
		if !canManage {
			deny()
			return
		}
		var username string
		err = tx.QueryRowContext(r.Context(), `SELECT u.username FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=? AND wm.user_id=? AND wm.status='active'`, workspace.ID, input.UserID).Scan(&username)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 400, "Участник недоступен в этом проекте")
			return
		}
		if err != nil {
			writeError(w, 500, "Не удалось проверить участника")
			return
		}
		if target.ID != 0 {
			writeError(w, 409, "Этот участник уже в группе")
			return
		}
		if activeCount >= 100 {
			writeError(w, 400, "В группе может быть до 100 активных участников")
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_members(thread_id,user_id,last_read_at,joined_at) VALUES(?,?,'',?)`, thread, input.UserID, nowText())
		event = actor.Username + " добавил в группу " + username
	case "remove", "leave":
		if input.Action == "leave" {
			target = chatGroupMember{ID: actor.ID, Username: actor.Username, Role: detail.Role}
		}
		if target.ID == 0 {
			writeError(w, 400, "Участник больше не состоит в группе")
			return
		}
		if target.Role == "owner" {
			writeError(w, 409, "Сначала передайте владение другому активному участнику группы")
			return
		}
		if input.Action == "remove" && (!canManage || target.ID == actor.ID || detail.Role == "admin" && target.Role != "member") {
			deny()
			return
		}
		_, err = tx.ExecContext(r.Context(), `DELETE FROM chat_members WHERE thread_id=? AND user_id=?`, thread, target.ID)
		// The current call model has one shared peer offer, without a participant
		// roster. End it when access changes; a fresh call uses the new membership.
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `UPDATE chat_calls SET status='ended',ended_at=?,duration_seconds=MAX(0,CAST((julianday(?) - julianday(COALESCE(answered_at,started_at)))*86400 AS INTEGER)) WHERE thread_id=? AND status IN ('ringing','active')`, nowText(), nowText(), thread)
		}
		event = actor.Username + " исключил из группы " + target.Username
		if input.Action == "leave" {
			event = actor.Username + " вышел из группы"
		}
	case "role":
		if detail.Role != "owner" {
			deny()
			return
		}
		if target.ID == 0 || !target.Active || target.Role == "owner" || input.Role != "admin" && input.Role != "member" {
			writeError(w, 400, "Выберите активного участника и роль администратора или участника")
			return
		}
		if target.Role == input.Role {
			w.WriteHeader(204)
			return
		}
		if input.Role == "admin" {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_group_roles(thread_id,user_id,role) VALUES(?,?,'admin') ON CONFLICT(thread_id,user_id) DO UPDATE SET role='admin'`, thread, target.ID)
		} else {
			_, err = tx.ExecContext(r.Context(), `DELETE FROM chat_group_roles WHERE thread_id=? AND user_id=?`, thread, target.ID)
		}
		roleLabel := "участник"
		if input.Role == "admin" {
			roleLabel = "администратор"
		}
		event = actor.Username + " изменил роль " + target.Username + ": " + roleLabel
	case "transfer":
		if detail.Role != "owner" && !detail.CanRecoverOwner {
			deny()
			return
		}
		if target.ID == 0 || !target.Active || target.Role == "owner" {
			writeError(w, 400, "Выберите другого активного участника группы")
			return
		}
		_, err = tx.ExecContext(r.Context(), `UPDATE chat_group_roles SET role='admin' WHERE thread_id=? AND role='owner'`, thread)
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_group_roles(thread_id,user_id,role) VALUES(?,?,'owner') ON CONFLICT(thread_id,user_id) DO UPDATE SET role='owner'`, thread, target.ID)
		}
		event = actor.Username + " назначил владельцем группы " + target.Username
	default:
		writeError(w, 400, "Неизвестное действие с группой")
		return
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE chat_group_settings SET version=version+1 WHERE thread_id=?`, thread)
	}
	if err == nil {
		var id string
		id, err = newID()
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_messages(id,thread_id,author_id,message_type,body,created_at) VALUES(?,?,?,'system',?,?)`, id, thread, actor.ID, event, nowText())
		}
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE chat_threads SET updated_at=? WHERE id=?`, nowText(), thread)
	}
	if err != nil {
		writeError(w, 500, "Изменения группы не сохранены. Повторите попытку")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить изменения группы")
		return
	}
	w.WriteHeader(204)
}
