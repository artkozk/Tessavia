package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"
)

type batchSelection struct {
	ID                string `json:"id"`
	ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
}
type batchPatch struct {
	OwnerID    *int64  `json:"ownerId,omitempty"`
	Status     *string `json:"status,omitempty"`
	Priority   *string `json:"priority,omitempty"`
	Workstream *string `json:"workstream,omitempty"`
}
type recordBatchRequest struct {
	ID     string           `json:"id"`
	Items  []batchSelection `json:"items"`
	Patch  batchPatch       `json:"patch"`
	Reason string           `json:"reason"`
}
type batchValues struct {
	OwnerID    int64  `json:"ownerId"`
	Status     string `json:"status"`
	Priority   string `json:"priority"`
	Workstream string `json:"workstream"`
	StageID    string `json:"stageId"`
}
type batchRow struct {
	ID      string       `json:"id"`
	Title   string       `json:"title"`
	State   string       `json:"state"`
	Error   string       `json:"error,omitempty"`
	Before  *batchValues `json:"before,omitempty"`
	After   *batchValues `json:"after,omitempty"`
	Version string       `json:"version,omitempty"`
}
type recordBatchReceipt struct {
	ID        string     `json:"id"`
	CreatedAt string     `json:"createdAt"`
	Undone    bool       `json:"undone"`
	Items     []batchRow `json:"items"`
}

func batchSnapshot(record Record) batchValues {
	return batchValues{record.OwnerID, record.Status, record.Priority, record.Workstream, record.StageID}
}

// Check inside the transaction as well as in auth middleware: membership may
// have changed while this request was waiting for the SQLite connection.
func batchMember(ctx context.Context, tx *sql.Tx, workspace string, user int64) bool {
	var found int
	err := tx.QueryRowContext(ctx, `SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id
 WHERE w.id=? AND m.user_id=? AND m.status='active' AND w.archived_at IS NULL
 AND (w.team_id IS NULL OR EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
 WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=m.user_id AND tm.status='active'))`, workspace, user).Scan(&found)
	return err == nil
}

func batchEditError(record Record, user int64, changingOwner bool) string {
	owns := user == record.OwnerID || user == record.AuthorID
	if record.EditPolicy == "owner_only" && !owns {
		return "Изменять может только постановщик или ответственный"
	}
	if changingOwner && !owns {
		return "Менять ответственного может только постановщик или текущий ответственный"
	}
	if record.Status == "archived" {
		return "Сначала верните карточку из архива"
	}
	return ""
}

func (s *Server) handlePreviewRecordBatch(w http.ResponseWriter, r *http.Request) {
	s.handleRecordBatch(w, r, false)
}
func (s *Server) handleApplyRecordBatch(w http.ResponseWriter, r *http.Request) {
	s.handleRecordBatch(w, r, true)
}

func (s *Server) handleRecordBatch(w http.ResponseWriter, r *http.Request, apply bool) {
	var input recordBatchRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if len(input.Items) < 1 || len(input.Items) > 100 || len(input.ID) > 80 || (apply && len(input.ID) < 16) {
		writeError(w, 400, "Выберите от 1 до 100 карточек и укажите идентификатор операции")
		return
	}
	if utf8.RuneCountInString(input.Reason) > 2000 || input.Reason == "" {
		writeError(w, 400, "Укажите причину изменения (до 2000 символов)")
		return
	}
	p := input.Patch
	if p.OwnerID == nil && p.Status == nil && p.Priority == nil && p.Workstream == nil {
		writeError(w, 400, "Выберите хотя бы одно изменение")
		return
	}
	if (p.Priority != nil && !validPriority(*p.Priority)) || (p.Workstream != nil && !validWorkstream(*p.Workstream)) {
		writeError(w, 400, "Некорректный приоритет или направление")
		return
	}
	seen := map[string]bool{}
	for _, item := range input.Items {
		if item.ID == "" || item.ExpectedUpdatedAt == "" || seen[item.ID] {
			writeError(w, 400, "Нужны уникальные карточки и их версии")
			return
		}
		seen[item.ID] = true
	}
	raw, _ := json.Marshal(input)
	fingerprint := hashToken(string(raw))
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать операцию")
		return
	}
	defer tx.Rollback()
	ctx, user, workspace := r.Context(), currentUser(r), currentWorkspace(r).ID
	if !batchMember(ctx, tx, workspace, user.ID) {
		writeError(w, 403, "Доступ к проекту изменился")
		return
	}
	if apply {
		var storedHash, receiptJSON string
		err = tx.QueryRowContext(ctx, `SELECT request_hash,receipt_json FROM record_batches WHERE id=? AND user_id=? AND workspace_id=?`, input.ID, user.ID, workspace).Scan(&storedHash, &receiptJSON)
		if err == nil {
			if storedHash != fingerprint {
				writeError(w, 409, "Этот идентификатор уже использован для другой операции")
				return
			}
			var receipt recordBatchReceipt
			if json.Unmarshal([]byte(receiptJSON), &receipt) != nil {
				writeError(w, 500, "Не удалось прочитать результат")
				return
			}
			writeJSON(w, 200, receipt)
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			writeError(w, 500, "Не удалось проверить повтор операции")
			return
		}
	}
	receipt := recordBatchReceipt{ID: input.ID, CreatedAt: nowText(), Items: []batchRow{}}
	for _, selected := range input.Items {
		row := batchRow{ID: selected.ID, State: "rejected"}
		record, readErr := scanRecord(tx.QueryRowContext(ctx, recordSelect+` WHERE r.id=? AND r.workspace_id=?`, selected.ID, workspace))
		if errors.Is(readErr, sql.ErrNoRows) {
			row.Error = "Карточка недоступна в этом проекте"
			receipt.Items = append(receipt.Items, row)
			continue
		}
		if readErr != nil {
			writeError(w, 500, "Не удалось проверить карточки")
			return
		}
		row.Title = record.Title
		row.Error = batchEditError(record, user.ID, p.OwnerID != nil && *p.OwnerID != record.OwnerID)
		if row.Error == "" && selected.ExpectedUpdatedAt != record.UpdatedAt {
			row.Error = "Карточка изменилась. Обновите выбор"
		}
		before := batchSnapshot(record)
		after := before
		if p.OwnerID != nil {
			after.OwnerID = *p.OwnerID
		}
		if p.Priority != nil {
			after.Priority = *p.Priority
		}
		if p.Workstream != nil {
			after.Workstream = *p.Workstream
		}
		if p.Status != nil {
			after.Status = *p.Status
		}
		if row.Error == "" && after.OwnerID != before.OwnerID && !batchMember(ctx, tx, workspace, after.OwnerID) {
			row.Error = "Ответственный не участвует в этом проекте"
		}
		if row.Error == "" && after.Status != before.Status {
			switch {
			case !validStatusForType(record.Type, after.Status):
				row.Error = "Состояние не подходит типу карточки"
			case before.Status == "completed" || after.Status == "completed" || after.Status == "archived" || (record.Type == "task" && after.Status == "review") || ((record.Type == "hypothesis" || record.Type == "experiment") && after.Status == "rejected"):
				row.Error = "Этот переход оформляется в карточке с результатом и необходимыми подтверждениями"
			default:
				if record.CollectionID != "" {
					stageErr := tx.QueryRowContext(ctx, `SELECT id FROM collection_stages WHERE collection_id=? AND category=? AND archived_at IS NULL ORDER BY sort_order,id LIMIT 1`, record.CollectionID, collectionCategoryForStatus(after.Status)).Scan(&after.StageID)
					if errors.Is(stageErr, sql.ErrNoRows) {
						row.Error = "На доске нет подходящего этапа для этого состояния"
					} else if stageErr != nil {
						writeError(w, 500, "Не удалось проверить этап доски")
						return
					}
				}
			}
		}
		if row.Error != "" {
			receipt.Items = append(receipt.Items, row)
			continue
		}
		row.Before = &before
		row.After = &after
		row.Version = record.UpdatedAt
		row.State = "ready"
		if before == after {
			row.State = "unchanged"
		} else if apply {
			version, saveErr := saveBatchRecord(ctx, tx, user, record, after, input.Reason, input.ID, "bulk_updated")
			if saveErr != nil {
				writeError(w, 500, "Не удалось сохранить операцию. Изменения не применены")
				return
			}
			row.Version = version
			row.State = "applied"
		}
		receipt.Items = append(receipt.Items, row)
	}
	if apply {
		data, _ := json.Marshal(receipt)
		if _, err = tx.ExecContext(ctx, `INSERT INTO record_batches(id,user_id,workspace_id,request_hash,receipt_json,created_at) VALUES(?,?,?,?,?,?)`, input.ID, user.ID, workspace, fingerprint, string(data), receipt.CreatedAt); err != nil {
			writeError(w, 409, "Операция с таким идентификатором уже существует")
			return
		}
		if err = tx.Commit(); err != nil {
			writeError(w, 500, "Не удалось завершить операцию")
			return
		}
	}
	writeJSON(w, 200, receipt)
}

func saveBatchRecord(ctx context.Context, tx *sql.Tx, user User, before Record, after batchValues, reason, batchID, action string) (string, error) {
	now := nowText()
	result, err := tx.ExecContext(ctx, `UPDATE records SET owner_id=?,status=?,priority=?,workstream=?,stage_id=NULLIF(?,''),updated_at=? WHERE id=? AND workspace_id=? AND updated_at=?`, after.OwnerID, after.Status, after.Priority, after.Workstream, after.StageID, now, before.ID, before.WorkspaceID, before.UpdatedAt)
	if err != nil {
		return "", err
	}
	count, err := result.RowsAffected()
	if err != nil || count != 1 {
		return "", fmt.Errorf("record version conflict")
	}
	changes := map[string]any{"batchId": batchID}
	old := batchSnapshot(before)
	left, _ := json.Marshal(old)
	right, _ := json.Marshal(after)
	var a, b map[string]any
	_ = json.Unmarshal(left, &a)
	_ = json.Unmarshal(right, &b)
	for key, value := range a {
		if value != b[key] {
			changes[key] = map[string]any{"before": value, "after": b[key]}
		}
	}
	if err = writeActivity(ctx, tx, user.ID, before.Type, before.ID, action, reason, changes); err != nil {
		return "", err
	}
	if after.OwnerID != before.OwnerID && after.OwnerID != user.ID {
		if err = insertNotification(ctx, tx, after.OwnerID, "assignment", "Работа переназначена", fmt.Sprintf("%s назначил вам карточку «%s»", user.Username, before.Title), before.Type, before.ID); err != nil {
			return "", err
		}
	}
	return now, nil
}

func (s *Server) handleGetRecordBatch(w http.ResponseWriter, r *http.Request) {
	var data string
	query := `SELECT receipt_json FROM record_batches WHERE user_id=? AND workspace_id=?`
	args := []any{currentUser(r).ID, currentWorkspace(r).ID}
	if r.PathValue("id") != "latest" {
		query += ` AND id=?`
		args = append(args, r.PathValue("id"))
	}
	query += ` ORDER BY created_at DESC,id DESC LIMIT 1`
	err := s.store.db.QueryRowContext(r.Context(), query, args...).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, 200, nil)
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось загрузить операцию")
		return
	}
	var receipt recordBatchReceipt
	if json.Unmarshal([]byte(data), &receipt) != nil {
		writeError(w, 500, "Не удалось прочитать операцию")
		return
	}
	writeJSON(w, 200, receipt)
}

func (s *Server) handleUndoRecordBatch(w http.ResponseWriter, r *http.Request) {
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать отмену")
		return
	}
	defer tx.Rollback()
	ctx, user, workspace := r.Context(), currentUser(r), currentWorkspace(r).ID
	if !batchMember(ctx, tx, workspace, user.ID) {
		writeError(w, 403, "Доступ к проекту изменился")
		return
	}
	var data string
	err = tx.QueryRowContext(ctx, `SELECT receipt_json FROM record_batches WHERE id=? AND user_id=? AND workspace_id=?`, r.PathValue("id"), user.ID, workspace).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Операция не найдена")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось загрузить операцию")
		return
	}
	var receipt recordBatchReceipt
	if json.Unmarshal([]byte(data), &receipt) != nil {
		writeError(w, 500, "Не удалось прочитать операцию")
		return
	}
	if receipt.Undone {
		writeJSON(w, 200, receipt)
		return
	}
	for i := range receipt.Items {
		row := &receipt.Items[i]
		if row.State != "applied" {
			continue
		}
		record, readErr := scanRecord(tx.QueryRowContext(ctx, recordSelect+` WHERE r.id=? AND r.workspace_id=?`, row.ID, workspace))
		if errors.Is(readErr, sql.ErrNoRows) {
			row.State = "undo_rejected"
			row.Title = ""
			row.Error = "Карточка больше недоступна"
			continue
		}
		if readErr != nil {
			writeError(w, 500, "Не удалось проверить отмену")
			return
		}
		row.Error = batchEditError(record, user.ID, row.Before.OwnerID != record.OwnerID)
		if row.Error == "" && record.UpdatedAt != row.Version {
			row.Error = "После операции карточка изменилась. Последующие правки сохранены"
		}
		if row.Error == "" && row.Before.OwnerID != record.OwnerID && !batchMember(ctx, tx, workspace, row.Before.OwnerID) {
			row.Error = "Прежний ответственный больше не участвует в проекте"
		}
		if row.Error == "" && row.Before.StageID != "" {
			var exists int
			if tx.QueryRowContext(ctx, `SELECT 1 FROM collection_stages WHERE id=? AND collection_id=? AND archived_at IS NULL`, row.Before.StageID, record.CollectionID).Scan(&exists) != nil {
				row.Error = "Прежний этап больше недоступен"
			}
		}
		if row.Error != "" {
			row.State = "undo_rejected"
			continue
		}
		version, saveErr := saveBatchRecord(ctx, tx, user, record, *row.Before, "Отмена массового изменения", receipt.ID, "bulk_undone")
		if saveErr != nil {
			writeError(w, 500, "Не удалось сохранить отмену. Изменения не применены")
			return
		}
		row.State = "undone"
		row.Version = version
	}
	receipt.Undone = true
	updated, _ := json.Marshal(receipt)
	if _, err = tx.ExecContext(ctx, `UPDATE record_batches SET receipt_json=? WHERE id=? AND user_id=? AND workspace_id=?`, string(updated), receipt.ID, user.ID, workspace); err != nil {
		writeError(w, 500, "Не удалось сохранить отмену")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось завершить отмену")
		return
	}
	writeJSON(w, 200, receipt)
}
