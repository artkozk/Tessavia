package app

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Row IDs are insertion positions, unaffected by edits to dates, status or title.
// A bounded scan plus a checkpoint taken before the scan lets the next sync
// pick up inserts and edits that happened while pages were being downloaded.
type recordPageCursor struct {
	Version       int    `json:"v"`
	Epoch         string `json:"e"`
	User          int64  `json:"u"`
	Workspace     string `json:"w"`
	Query         string `json:"q"`
	After         int64  `json:"a"`
	Maximum       int64  `json:"m"`
	ActivityAfter int64  `json:"aa"`
	ActivityMax   int64  `json:"am"`
	Checkpoint    string `json:"t"`
}

var errPageCursor = errors.New("Страница устарела или параметры изменились. Повторите загрузку")
var errPageSize = errors.New("Размер страницы должен быть от 1 до 500")

func writePaginationError(w http.ResponseWriter, err error) {
	if errors.Is(err, errPageCursor) || errors.Is(err, errPageSize) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeError(w, http.StatusInternalServerError, "Не удалось подготовить страницы. Повторите загрузку")
}

func (s *Server) recordPagination(r *http.Request) (recordPageCursor, int, error) {
	query := r.URL.Query()
	limit := 200
	if raw := query.Get("pageSize"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 500 {
			return recordPageCursor{}, 0, errPageSize
		}
		limit = value
	}
	raw := query.Get("cursor")
	query.Del("cursor")
	query.Del("pageSize")
	digest := sha256.Sum256([]byte(r.URL.Path + "?" + query.Encode()))
	scope := hex.EncodeToString(digest[:])
	page := recordPageCursor{Version: 1, Epoch: s.pageEpoch, User: currentUser(r).ID, Workspace: currentWorkspace(r).ID, Query: scope, Checkpoint: nowText()}
	if raw != "" {
		if len(raw) > 2048 {
			return page, 0, errPageCursor
		}
		encoded, err := base64.RawURLEncoding.DecodeString(raw)
		if err != nil || json.Unmarshal(encoded, &page) != nil {
			return page, 0, errPageCursor
		}
		checkpoint, err := time.Parse(time.RFC3339Nano, page.Checkpoint)
		if err != nil || time.Since(checkpoint) > 30*time.Minute || checkpoint.After(time.Now().Add(time.Minute)) ||
			page.Version != 1 || page.Epoch != s.pageEpoch || page.User != currentUser(r).ID || page.Workspace != currentWorkspace(r).ID || page.Query != scope ||
			page.After < 0 || page.Maximum < page.After || page.ActivityAfter < 0 || page.ActivityMax < page.ActivityAfter {
			return page, 0, errPageCursor
		}
		return page, limit, nil
	}
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(rowid),0) FROM records WHERE workspace_id=?`, page.Workspace).Scan(&page.Maximum); err != nil {
		return page, 0, err
	}
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(rowid),0) FROM activity WHERE workspace_id=?`, page.Workspace).Scan(&page.ActivityMax); err != nil {
		return page, 0, err
	}
	return page, limit, nil
}

func (p recordPageCursor) encode() string {
	value, _ := json.Marshal(p)
	return base64.RawURLEncoding.EncodeToString(value)
}

type recordPageScanner struct {
	recordScanner
	position *int64
}

func (p recordPageScanner) Scan(values ...any) error {
	return p.recordScanner.Scan(append([]any{p.position}, values...)...)
}

func (s *Server) readRecordPage(ctx context.Context, where []string, args []any, page *recordPageCursor, limit int) ([]Record, error) {
	where = append(append([]string{}, where...), "r.rowid > ?", "r.rowid <= ?")
	args = append(append([]any{}, args...), page.After, page.Maximum, limit+1)
	query := strings.Replace(recordSelect, "SELECT r.id", "SELECT r.rowid, r.id", 1) +
		" WHERE " + strings.Join(where, " AND ") + " ORDER BY r.rowid LIMIT ?"
	rows, err := s.store.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	records := make([]Record, 0, limit)
	more := false
	for rows.Next() {
		if len(records) == limit {
			more = true
			break
		}
		var position int64
		record, scanErr := scanRecord(recordPageScanner{rows, &position})
		if scanErr != nil {
			rows.Close()
			return nil, scanErr
		}
		page.After = position
		records = append(records, record)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if !more {
		page.After = page.Maximum
	}
	if err := s.attachActiveBlockers(ctx, records); err != nil {
		return nil, err
	}
	if err := s.attachCustomFields(ctx, records); err != nil {
		return nil, err
	}
	return records, nil
}

func (s *Server) handleRecordPage(w http.ResponseWriter, r *http.Request, where []string, args []any) {
	page, limit, err := s.recordPagination(r)
	if err != nil {
		writePaginationError(w, err)
		return
	}
	records, err := s.readRecordPage(r.Context(), where, args, &page, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить страницу карточек")
		return
	}
	next := ""
	if page.After < page.Maximum {
		next = page.encode()
	}
	writeJSON(w, http.StatusOK, map[string]any{"records": records, "nextCursor": next, "checkpoint": page.Checkpoint})
}

func (s *Server) readActivityPage(ctx context.Context, since string, page *recordPageCursor, limit int) ([]Activity, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT a.rowid,a.id,a.actor_id,u.username,a.entity_type,a.entity_id,a.action,a.details_json,a.reason,a.created_at
		FROM activity a JOIN users u ON u.id=a.actor_id
		WHERE a.workspace_id=? AND a.rowid>? AND a.rowid<=? AND julianday(a.created_at)>=julianday(?) ORDER BY a.rowid LIMIT ?`,
		page.Workspace, page.ActivityAfter, page.ActivityMax, since, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Activity, 0, limit)
	more := false
	for rows.Next() {
		if len(items) == limit {
			more = true
			break
		}
		var item Activity
		var details string
		if err := rows.Scan(&page.ActivityAfter, &item.ID, &item.ActorID, &item.ActorUsername, &item.EntityType, &item.EntityID, &item.Action, &details, &item.Reason, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.Details = decodePublicActivityDetails(item.Action, details)
		items = append(items, item)
	}
	if !more {
		page.ActivityAfter = page.ActivityMax
	}
	return items, rows.Err()
}

func (s *Server) handleSyncPages(w http.ResponseWriter, r *http.Request, recordsSince, activitySince string) {
	page, limit, err := s.recordPagination(r)
	if err != nil {
		writePaginationError(w, err)
		return
	}
	where := []string{"r.workspace_id=?", `(julianday(r.updated_at)>=julianday(?) OR EXISTS (
		SELECT 1 FROM record_links dependency JOIN records target ON target.id=dependency.target_id
		WHERE dependency.source_id=r.id AND dependency.active=1 AND dependency.relation_type='depends_on'
		AND julianday(target.updated_at)>=julianday(?)))`}
	records, err := s.readRecordPage(r.Context(), where, []any{page.Workspace, recordsSince, recordsSince}, &page, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось синхронизировать страницу карточек")
		return
	}
	activity, err := s.readActivityPage(r.Context(), activitySince, &page, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось синхронизировать страницу истории")
		return
	}
	next := ""
	if page.After < page.Maximum || page.ActivityAfter < page.ActivityMax {
		next = page.encode()
	}
	writeJSON(w, http.StatusOK, map[string]any{"records": records, "activity": activity, "nextCursor": next, "checkpoint": page.Checkpoint, "syncedAt": nowText()})
}
