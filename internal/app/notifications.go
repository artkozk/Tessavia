package app

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type notificationInbox struct {
	Items       []Notification `json:"items"`
	NextCursor  string         `json:"nextCursor"`
	UnreadCount int            `json:"unreadCount"`
}

type notificationCursor struct{ CreatedAt, ID string }

var errNotificationFilter = errors.New("invalid notification filter")

// Notifications must not retain access to a project's content after access is revoked.
const notificationAccess = `n.user_id = ? AND (COALESCE(n.entity_id, '') = '' OR EXISTS (
	SELECT 1 FROM records rec JOIN workspace_members member ON member.workspace_id = rec.workspace_id
	JOIN workspaces w ON w.id = rec.workspace_id
	WHERE rec.id = n.entity_id AND member.user_id = n.user_id AND member.status = 'active'
	AND w.archived_at IS NULL AND (w.team_id IS NULL OR EXISTS (
	SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id
	WHERE t.id = w.team_id AND t.deleted_at IS NULL AND tm.user_id = member.user_id AND tm.status = 'active'))))`

func (s *Server) notificationPage(r *http.Request, limit int, filtered bool) (notificationInbox, error) {
	page := notificationInbox{Items: []Notification{}}
	where := notificationAccess
	args := []any{currentUser(r).ID}
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM notifications n WHERE `+notificationAccess+` AND n.read_at IS NULL AND `+notificationFresh, args...).Scan(&page.UnreadCount); err != nil {
		return page, err
	}
	if filtered {
		q := r.URL.Query()
		switch q.Get("status") {
		case "", "all":
		case "unread":
			where += ` AND n.read_at IS NULL AND ` + notificationFresh
		case "read":
			where += ` AND n.read_at IS NOT NULL`
		default:
			return page, errNotificationFilter
		}
		for _, key := range []string{"since", "before"} {
			if value := q.Get(key); value != "" {
				parsed, err := time.Parse(time.RFC3339, value)
				if err != nil {
					return page, errNotificationFilter
				}
				operator := ">="
				if key == "before" {
					operator = "<"
				}
				where += ` AND julianday(n.created_at) ` + operator + ` julianday(?)`
				args = append(args, parsed.UTC().Format(time.RFC3339Nano))
			}
		}
		if raw := q.Get("cursor"); raw != "" {
			data, err := base64.RawURLEncoding.DecodeString(raw)
			var cursor notificationCursor
			if err != nil || json.Unmarshal(data, &cursor) != nil || cursor.ID == "" || cursor.CreatedAt == "" {
				return page, errNotificationFilter
			}
			where += ` AND (n.created_at < ? OR (n.created_at = ? AND n.id < ?))`
			args = append(args, cursor.CreatedAt, cursor.CreatedAt, cursor.ID)
		}
	}
	args = append(args, limit+1)
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT n.id, n.type, n.title, n.body, n.entity_type, n.entity_id, n.read_at, n.created_at, COALESCE(rec.workspace_id, ''), NOT `+notificationFresh+` FROM notifications n LEFT JOIN records rec ON rec.id = n.entity_id WHERE `+where+` ORDER BY n.created_at DESC, n.id DESC LIMIT ?`, args...)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		var n Notification
		var entityType, entityID, readAt sql.NullString
		if err = rows.Scan(&n.ID, &n.Type, &n.Title, &n.Body, &entityType, &entityID, &readAt, &n.CreatedAt, &n.WorkspaceID, &n.Obsolete); err != nil {
			return page, err
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
		page.Items = append(page.Items, n)
	}
	if err = rows.Err(); err != nil {
		return page, err
	}
	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		last := page.Items[limit-1]
		data, _ := json.Marshal(notificationCursor{last.CreatedAt, last.ID})
		page.NextCursor = base64.RawURLEncoding.EncodeToString(data)
	}
	return page, nil
}

func (s *Server) handleNotificationInbox(w http.ResponseWriter, r *http.Request) {
	limit := 30
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			writeError(w, http.StatusBadRequest, "Неверный размер страницы")
			return
		}
		limit = value
	}
	page, err := s.notificationPage(r, limit, true)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, errNotificationFilter) {
			status = http.StatusBadRequest
		}
		writeError(w, status, "Не удалось загрузить историю уведомлений")
		return
	}
	w.Header().Set("X-Unread-Count", strconv.Itoa(page.UnreadCount))
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) handleUnreadNotification(w http.ResponseWriter, r *http.Request) {
	s.setNotificationRead(w, r, false)
}

func (s *Server) setNotificationRead(w http.ResponseWriter, r *http.Request, read bool) {
	var value any
	if read {
		value = nowText()
	}
	expression := "?"
	if read {
		expression = "COALESCE(read_at, ?)"
	}
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE notifications AS n SET read_at = `+expression+` WHERE n.id = ? AND `+notificationAccess, value, strings.TrimSpace(r.PathValue("id")), currentUser(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось изменить уведомление")
		return
	}
	count, err := result.RowsAffected()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось изменить уведомление")
		return
	}
	if count == 0 {
		writeError(w, http.StatusNotFound, "Уведомление не найдено")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
