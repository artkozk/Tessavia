package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxAttachmentBytes = 15 << 20

var mentionPattern = regexp.MustCompile(`@([A-Za-z0-9_]{3,32})`)

type RecordComment struct {
	ID             string  `json:"id"`
	RecordID       string  `json:"recordId"`
	AuthorID       int64   `json:"authorId"`
	AuthorUsername string  `json:"authorUsername"`
	ParentID       *string `json:"parentId"`
	Body           string  `json:"body"`
	CreatedAt      string  `json:"createdAt"`
}

type ChecklistItem struct {
	ID            string  `json:"id"`
	RecordID      string  `json:"recordId"`
	Title         string  `json:"title"`
	OwnerID       *int64  `json:"ownerId"`
	OwnerUsername *string `json:"ownerUsername"`
	Status        string  `json:"status"`
	ProofText     string  `json:"proofText"`
	SortOrder     int     `json:"sortOrder"`
	CreatedBy     int64   `json:"createdBy"`
	CompletedBy   *int64  `json:"completedBy"`
	CompletedAt   *string `json:"completedAt"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type TaskReviewEvent struct {
	ID            string `json:"id"`
	RecordID      string `json:"recordId"`
	ActorID       int64  `json:"actorId"`
	ActorUsername string `json:"actorUsername"`
	Action        string `json:"action"`
	Reason        string `json:"reason"`
	CreatedAt     string `json:"createdAt"`
}

type RecordAttachment struct {
	ID               string `json:"id"`
	RecordID         string `json:"recordId"`
	UploaderID       int64  `json:"uploaderId"`
	UploaderUsername string `json:"uploaderUsername"`
	OriginalName     string `json:"originalName"`
	ContentType      string `json:"contentType"`
	SizeBytes        int64  `json:"sizeBytes"`
	SHA256           string `json:"sha256"`
	CreatedAt        string `json:"createdAt"`
}

type RecurrenceRule struct {
	Cadence   string `json:"cadence"`
	Interval  int    `json:"interval"`
	Active    bool   `json:"active"`
	UpdatedBy int64  `json:"updatedBy"`
	UpdatedAt string `json:"updatedAt"`
}

type SavedView struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	ViewMode  string          `json:"viewMode"`
	Filters   json.RawMessage `json:"filters"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
}

func userCanEditRecord(user User, record Record) bool {
	return record.EditPolicy == "shared" || user.ID == record.OwnerID || user.ID == record.AuthorID
}

func (s *Server) handleGetRecordWorkflow(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить рабочие данные")
		return
	}
	comments, err := s.listComments(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить обсуждение")
		return
	}
	checklist, err := s.listChecklist(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить чек-лист")
		return
	}
	reviews, err := s.listTaskReviews(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить приёмку")
		return
	}
	attachments, err := s.listAttachments(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить файлы")
		return
	}
	recurrence := RecurrenceRule{Cadence: "none", Interval: 1}
	var active int
	err = s.store.db.QueryRowContext(r.Context(), `SELECT cadence, interval_count, active, updated_by, updated_at FROM recurrence_rules WHERE record_id = ?`, record.ID).
		Scan(&recurrence.Cadence, &recurrence.Interval, &active, &recurrence.UpdatedBy, &recurrence.UpdatedAt)
	if err == nil {
		recurrence.Active = active == 1
	} else if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить повторение")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"comments": comments, "checklist": checklist, "reviews": reviews,
		"attachments": attachments, "recurrence": recurrence,
	})
}

func (s *Server) listComments(ctx context.Context, recordID string) ([]RecordComment, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT c.id, c.record_id, c.author_id, u.username, c.parent_id, c.body, c.created_at FROM record_comments c JOIN users u ON u.id = c.author_id WHERE c.record_id = ? ORDER BY c.created_at`, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]RecordComment, 0)
	for rows.Next() {
		var item RecordComment
		var parent sql.NullString
		if err := rows.Scan(&item.ID, &item.RecordID, &item.AuthorID, &item.AuthorUsername, &parent, &item.Body, &item.CreatedAt); err != nil {
			return nil, err
		}
		if parent.Valid {
			item.ParentID = &parent.String
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) handleAddComment(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	var input struct {
		Body     string `json:"body"`
		ParentID string `json:"parentId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Body = strings.TrimSpace(input.Body)
	if input.Body == "" || len(input.Body) > 20000 {
		writeError(w, http.StatusBadRequest, "Комментарий обязателен и не длиннее 20 000 символов")
		return
	}
	var parent any
	if strings.TrimSpace(input.ParentID) != "" {
		var count int
		_ = s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM record_comments WHERE id = ? AND record_id = ?`, input.ParentID, record.ID).Scan(&count)
		if count != 1 {
			writeError(w, http.StatusBadRequest, "Исходный комментарий не найден")
			return
		}
		parent = input.ParentID
	}
	id, _ := newID()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать обсуждение")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO record_comments(id, record_id, author_id, parent_id, body, created_at) VALUES(?, ?, ?, ?, ?, ?)`, id, record.ID, user.ID, parent, input.Body, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить комментарий")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "comment_added", "", map[string]any{"commentId": id, "parentId": input.ParentID}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := s.notifyCommentParticipants(r.Context(), tx, user, record, input.Body); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать уведомления")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить обсуждение")
		return
	}
	comments, _ := s.listComments(r.Context(), record.ID)
	writeJSON(w, http.StatusCreated, comments[len(comments)-1])
}

func (s *Server) notifyCommentParticipants(ctx context.Context, tx *sql.Tx, actor User, record Record, body string) error {
	recipients := map[int64]bool{}
	for _, id := range []int64{record.AuthorID, record.OwnerID} {
		if id != actor.ID {
			recipients[id] = true
		}
	}
	if record.DecisionMakerID != nil && *record.DecisionMakerID != actor.ID {
		recipients[*record.DecisionMakerID] = true
	}
	for _, match := range mentionPattern.FindAllStringSubmatch(body, -1) {
		var id int64
		if tx.QueryRowContext(ctx, `SELECT id FROM users WHERE lower(username) = lower(?)`, match[1]).Scan(&id) == nil && id != actor.ID {
			recipients[id] = true
		}
	}
	preview := []rune(strings.ReplaceAll(body, "\n", " "))
	if len(preview) > 180 {
		preview = preview[:180]
	}
	for id := range recipients {
		if err := insertNotification(ctx, tx, id, "comment", "Новое обсуждение", fmt.Sprintf("%s в «%s»: %s", actor.Username, record.Title, string(preview)), record.Type, record.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) listChecklist(ctx context.Context, recordID string) ([]ChecklistItem, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT i.id, i.record_id, i.title, i.owner_id, owner.username, i.status, i.proof_text, i.sort_order, i.created_by, i.completed_by, i.completed_at, i.created_at, i.updated_at FROM checklist_items i LEFT JOIN users owner ON owner.id = i.owner_id WHERE i.record_id = ? ORDER BY i.sort_order, i.created_at`, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]ChecklistItem, 0)
	for rows.Next() {
		var item ChecklistItem
		var ownerID, completedBy sql.NullInt64
		var ownerName, completedAt sql.NullString
		if err := rows.Scan(&item.ID, &item.RecordID, &item.Title, &ownerID, &ownerName, &item.Status, &item.ProofText, &item.SortOrder, &item.CreatedBy, &completedBy, &completedAt, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			item.OwnerID = &ownerID.Int64
		}
		if ownerName.Valid {
			item.OwnerUsername = &ownerName.String
		}
		if completedBy.Valid {
			item.CompletedBy = &completedBy.Int64
		}
		if completedAt.Valid {
			item.CompletedAt = &completedAt.String
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) handleAddChecklistItem(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Title   string `json:"title"`
		OwnerID *int64 `json:"ownerId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len(input.Title) > 300 {
		writeError(w, http.StatusBadRequest, "Шаг обязателен и не длиннее 300 символов")
		return
	}
	if input.OwnerID != nil && !s.userExists(r.Context(), *input.OwnerID) {
		writeError(w, http.StatusBadRequest, "Исполнитель не найден")
		return
	}
	var sortOrder int
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), 0) + 10 FROM checklist_items WHERE record_id = ?`, record.ID).Scan(&sortOrder)
	id, _ := newID()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO checklist_items(id, record_id, title, owner_id, sort_order, created_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, id, record.ID, input.Title, input.OwnerID, sortOrder, user.ID, now, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось добавить шаг")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "checklist_added", "", map[string]any{"itemId": id, "title": input.Title, "ownerId": input.OwnerID}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю шага")
		return
	}
	if input.OwnerID != nil && *input.OwnerID != user.ID {
		if err := insertNotification(r.Context(), tx, *input.OwnerID, "assignment", "Назначен шаг", fmt.Sprintf("%s назначил вам шаг «%s» в карточке «%s»", user.Username, input.Title, record.Title), record.Type, record.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось уведомить исполнителя")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение")
		return
	}
	items, _ := s.listChecklist(r.Context(), record.ID)
	writeJSON(w, http.StatusCreated, items)
}

func (s *Server) handleUpdateChecklistItem(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	var before ChecklistItem
	var ownerID sql.NullInt64
	err = s.store.db.QueryRowContext(r.Context(), `SELECT id, record_id, title, owner_id, status, proof_text, sort_order, created_by, created_at, updated_at FROM checklist_items WHERE id = ? AND record_id = ?`, r.PathValue("itemId"), record.ID).
		Scan(&before.ID, &before.RecordID, &before.Title, &ownerID, &before.Status, &before.ProofText, &before.SortOrder, &before.CreatedBy, &before.CreatedAt, &before.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "Шаг не найден")
		return
	}
	if ownerID.Valid {
		before.OwnerID = &ownerID.Int64
	}
	user := currentUser(r)
	canManage := userCanEditRecord(user, record)
	canExecute := before.OwnerID != nil && *before.OwnerID == user.ID
	if !canManage && !canExecute {
		writeError(w, http.StatusForbidden, "Этот шаг изменяет владелец карточки или исполнитель")
		return
	}
	var input struct {
		Title      *string `json:"title"`
		OwnerID    *int64  `json:"ownerId"`
		ClearOwner bool    `json:"clearOwner"`
		Status     *string `json:"status"`
		ProofText  *string `json:"proofText"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !canManage && (input.Title != nil || input.OwnerID != nil || input.ClearOwner) {
		writeError(w, http.StatusForbidden, "Исполнитель может менять только состояние и отчёт шага")
		return
	}
	updates := make([]string, 0)
	args := make([]any, 0)
	changes := map[string]any{}
	add := func(column string, value any) { updates = append(updates, column+" = ?"); args = append(args, value) }
	if input.Title != nil {
		value := strings.TrimSpace(*input.Title)
		if value == "" || len(value) > 300 {
			writeError(w, http.StatusBadRequest, "Некорректное название шага")
			return
		}
		if value != before.Title {
			add("title", value)
			changes["title"] = map[string]any{"before": before.Title, "after": value}
		}
	}
	if input.OwnerID != nil {
		if !s.userExists(r.Context(), *input.OwnerID) {
			writeError(w, http.StatusBadRequest, "Исполнитель не найден")
			return
		}
		if before.OwnerID == nil || *before.OwnerID != *input.OwnerID {
			add("owner_id", *input.OwnerID)
			changes["ownerId"] = map[string]any{"before": before.OwnerID, "after": *input.OwnerID}
		}
	} else if input.ClearOwner && before.OwnerID != nil {
		add("owner_id", nil)
		changes["ownerId"] = map[string]any{"before": before.OwnerID, "after": nil}
	}
	if input.Status != nil {
		if *input.Status != "open" && *input.Status != "completed" && *input.Status != "cancelled" {
			writeError(w, http.StatusBadRequest, "Некорректное состояние шага")
			return
		}
		if *input.Status != before.Status {
			add("status", *input.Status)
			changes["status"] = map[string]any{"before": before.Status, "after": *input.Status}
			if *input.Status == "completed" {
				now := nowText()
				add("completed_by", user.ID)
				add("completed_at", now)
			} else {
				add("completed_by", nil)
				add("completed_at", nil)
			}
		}
	}
	if input.ProofText != nil {
		value := strings.TrimSpace(*input.ProofText)
		if len(value) > 10000 {
			writeError(w, http.StatusBadRequest, "Отчёт шага слишком длинный")
			return
		}
		if value != before.ProofText {
			add("proof_text", value)
			changes["proofText"] = map[string]any{"before": before.ProofText, "after": value}
		}
	}
	if len(updates) == 0 {
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
	if _, err := tx.ExecContext(r.Context(), `UPDATE checklist_items SET `+strings.Join(updates, ", ")+` WHERE id = ?`, args...); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить шаг")
		return
	}
	if err := updateChecklistProgress(r.Context(), tx, record, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось пересчитать прогресс")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "checklist_updated", "", map[string]any{"itemId": before.ID, "changes": changes}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю шага")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"checklist": mustChecklist(s, r.Context(), record.ID), "record": mustRecord(s, r.Context(), record.ID)})
}

func updateChecklistProgress(ctx context.Context, tx *sql.Tx, record Record, now string) error {
	var total, completed int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) FROM checklist_items WHERE record_id = ? AND status <> 'cancelled'`, record.ID).Scan(&total, &completed); err != nil {
		return err
	}
	if total == 0 {
		return nil
	}
	progress := completed * 100 / total
	status := record.Status
	if status == "planned" && completed > 0 {
		status = "in_progress"
	}
	_, err := tx.ExecContext(ctx, `UPDATE records SET progress = ?, status = ?, updated_at = ? WHERE id = ?`, progress, status, now, record.ID)
	return err
}

func mustChecklist(s *Server, ctx context.Context, recordID string) []ChecklistItem {
	items, _ := s.listChecklist(ctx, recordID)
	return items
}
func mustRecord(s *Server, ctx context.Context, recordID string) Record {
	item, _ := s.getRecord(ctx, recordID)
	return item
}

func (s *Server) listTaskReviews(ctx context.Context, recordID string) ([]TaskReviewEvent, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT e.id, e.record_id, e.actor_id, u.username, e.action, e.reason, e.created_at FROM task_review_events e JOIN users u ON u.id = e.actor_id WHERE e.record_id = ? ORDER BY e.created_at DESC`, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]TaskReviewEvent, 0)
	for rows.Next() {
		var item TaskReviewEvent
		if err := rows.Scan(&item.ID, &item.RecordID, &item.ActorID, &item.ActorUsername, &item.Action, &item.Reason, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) handleSubmitTaskReview(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil || record.Type != "task" {
		writeError(w, http.StatusNotFound, "Задача не найдена")
		return
	}
	user := currentUser(r)
	if user.ID != record.OwnerID && record.EditPolicy != "shared" {
		writeError(w, http.StatusForbidden, "Отправить результат может исполнитель")
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
	var proofs int
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM task_proofs WHERE record_id = ?`, record.ID).Scan(&proofs)
	if proofs == 0 {
		writeError(w, http.StatusConflict, "Сначала приложите доказательство выполнения")
		return
	}
	if record.AuthorID == record.OwnerID && record.DecisionMakerID == nil {
		s.completeTaskDirect(w, r, record, input.Result, input.NotifyPartners)
		return
	}
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
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET status = 'review', result = ?, progress = 100, completed_at = NULL, updated_at = ? WHERE id = ?`, input.Result, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось отправить на проверку")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO task_review_events(id, record_id, actor_id, action, created_at) VALUES(?, ?, ?, 'submitted', ?)`, eventID, record.ID, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать отправку на проверку")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "task", record.ID, "review_submitted", "", map[string]any{"proofCount": proofs, "reviewerId": reviewerID}); err != nil {
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
	writeJSON(w, http.StatusOK, mustRecord(s, r.Context(), record.ID))
}

func (s *Server) handleReviewTask(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil || record.Type != "task" {
		writeError(w, http.StatusNotFound, "Задача не найдена")
		return
	}
	if record.Status != "review" {
		writeError(w, http.StatusConflict, "Задача сейчас не ожидает приёмки")
		return
	}
	user := currentUser(r)
	reviewerID := record.AuthorID
	if record.DecisionMakerID != nil {
		reviewerID = *record.DecisionMakerID
	}
	if user.ID != reviewerID {
		writeError(w, http.StatusForbidden, "Принять результат может постановщик или указанный принимающий")
		return
	}
	var input struct {
		Decision string `json:"decision"`
		Reason   string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Decision != "accept" && input.Decision != "rework" {
		writeError(w, http.StatusBadRequest, "Выберите результат проверки")
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Decision == "rework" && input.Reason == "" {
		writeError(w, http.StatusBadRequest, "Укажите, что нужно доработать")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать приёмку")
		return
	}
	defer tx.Rollback()
	now := nowText()
	eventID, _ := newID()
	status, action := "completed", "accepted"
	var completedAt any = now
	if input.Decision == "rework" {
		status, action, completedAt = "in_progress", "rework", nil
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET status = ?, progress = CASE WHEN ? = 'completed' THEN 100 ELSE MIN(progress, 95) END, completed_at = ?, updated_at = ? WHERE id = ?`, status, status, completedAt, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить решение по задаче")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO task_review_events(id, record_id, actor_id, action, reason, created_at) VALUES(?, ?, ?, ?, ?, ?)`, eventID, record.ID, user.ID, action, input.Reason, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать решение по задаче")
		return
	}
	activityAction := "review_accepted"
	if action == "rework" {
		activityAction = "review_rework"
	}
	if err := writeActivity(r.Context(), tx, user.ID, "task", record.ID, activityAction, input.Reason, map[string]any{"status": status}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю приёмки")
		return
	}
	if err := insertNotification(r.Context(), tx, record.OwnerID, "task_review", map[bool]string{true: "Результат принят", false: "Задача возвращена"}[action == "accepted"], fmt.Sprintf("%s проверил задачу «%s»%s", user.Username, record.Title, map[bool]string{true: "", false: ": " + input.Reason}[action == "accepted"]), "task", record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось уведомить исполнителя")
		return
	}
	if action == "accepted" {
		if _, err := s.spawnRecurringTask(r.Context(), tx, record, user.ID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось создать следующее повторение")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить приёмку")
		return
	}
	writeJSON(w, http.StatusOK, mustRecord(s, r.Context(), record.ID))
}

func (s *Server) completeTaskDirect(w http.ResponseWriter, r *http.Request, record Record, result string, notify bool) {
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать завершение")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET status = 'completed', progress = 100, result = ?, completed_at = ?, updated_at = ? WHERE id = ?`, result, now, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить задачу")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "task", record.ID, "completed", "", map[string]any{"result": result}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать завершение задачи")
		return
	}
	if notify {
		if err := s.insertPartnerNotifications(r.Context(), tx, user, record, "Задача выполнена", fmt.Sprintf("%s завершил задачу «%s»", user.Username, record.Title)); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось уведомить партнёра")
			return
		}
	}
	if _, err := s.spawnRecurringTask(r.Context(), tx, record, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать следующее повторение")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить задачу")
		return
	}
	writeJSON(w, http.StatusOK, mustRecord(s, r.Context(), record.ID))
}

func (s *Server) handleSaveRecurrence(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil || record.Type != "task" {
		writeError(w, http.StatusNotFound, "Задача не найдена")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Cadence  string `json:"cadence"`
		Interval int    `json:"interval"`
		Active   bool   `json:"active"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Cadence != "none" && input.Cadence != "daily" && input.Cadence != "weekly" && input.Cadence != "monthly" {
		writeError(w, http.StatusBadRequest, "Некорректная периодичность")
		return
	}
	if input.Interval < 1 || input.Interval > 365 {
		writeError(w, http.StatusBadRequest, "Интервал должен быть от 1 до 365")
		return
	}
	user := currentUser(r)
	now := nowText()
	active := 0
	if input.Active && input.Cadence != "none" {
		active = 1
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение повторения")
		return
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO recurrence_rules(record_id, cadence, interval_count, active, updated_by, updated_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(record_id) DO UPDATE SET cadence = excluded.cadence, interval_count = excluded.interval_count, active = excluded.active, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, record.ID, input.Cadence, input.Interval, active, user.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить повторение")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "task", record.ID, "recurrence_updated", "", map[string]any{"cadence": input.Cadence, "interval": input.Interval, "active": active == 1}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю повторения")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение повторения")
		return
	}
	writeJSON(w, http.StatusOK, RecurrenceRule{Cadence: input.Cadence, Interval: input.Interval, Active: active == 1, UpdatedBy: user.ID, UpdatedAt: now})
}

func (s *Server) spawnRecurringTask(ctx context.Context, tx *sql.Tx, record Record, actorID int64, now string) (string, error) {
	var cadence string
	var interval, active int
	if err := tx.QueryRowContext(ctx, `SELECT cadence, interval_count, active FROM recurrence_rules WHERE record_id = ?`, record.ID).Scan(&cadence, &interval, &active); errors.Is(err, sql.ErrNoRows) {
		return "", nil
	} else if err != nil {
		return "", err
	}
	if active != 1 || cadence == "none" {
		return "", nil
	}
	base := time.Now().UTC()
	if record.DueAt != nil {
		if parsed, err := time.Parse(time.RFC3339Nano, *record.DueAt); err == nil {
			base = parsed
		}
	}
	var next time.Time
	switch cadence {
	case "daily":
		next = base.AddDate(0, 0, interval)
	case "weekly":
		next = base.AddDate(0, 0, 7*interval)
	case "monthly":
		next = base.AddDate(0, interval, 0)
	}
	id, _ := newID()
	_, err := tx.ExecContext(ctx, `INSERT INTO records(id, type, title, description, status, author_id, owner_id, decision_maker_id, due_at, priority, workstream, edit_policy, parent_id, is_root, estimate_minutes, actual_minutes, created_at, updated_at) VALUES(?, 'task', ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`, id, record.Title, record.Description, record.AuthorID, record.OwnerID, record.DecisionMakerID, next.Format(time.RFC3339Nano), record.Priority, record.Workstream, record.EditPolicy, record.ParentID, record.EstimateMinutes, now, now)
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO recurrence_rules(record_id, cadence, interval_count, active, updated_by, updated_at) VALUES(?, ?, ?, 1, ?, ?)`, id, cadence, interval, actorID, now)
	if err != nil {
		return "", err
	}
	rows, err := tx.QueryContext(ctx, `SELECT title, owner_id, sort_order FROM checklist_items WHERE record_id = ? AND status <> 'cancelled' ORDER BY sort_order`, record.ID)
	if err != nil {
		return "", err
	}
	type step struct {
		title string
		owner any
		order int
	}
	steps := make([]step, 0)
	for rows.Next() {
		var title string
		var owner sql.NullInt64
		var order int
		if rows.Scan(&title, &owner, &order) == nil {
			var value any
			if owner.Valid {
				value = owner.Int64
			}
			steps = append(steps, step{title, value, order})
		}
	}
	rows.Close()
	for _, item := range steps {
		itemID, _ := newID()
		if _, err := tx.ExecContext(ctx, `INSERT INTO checklist_items(id, record_id, title, owner_id, sort_order, created_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, itemID, id, item.title, item.owner, item.order, actorID, now, now); err != nil {
			return "", err
		}
	}
	linkID, _ := newID()
	if _, err := tx.ExecContext(ctx, `INSERT INTO record_links(id, source_id, target_id, relation_type, created_by, created_at) VALUES(?, ?, ?, 'leads_to', ?, ?)`, linkID, record.ID, id, actorID, now); err != nil {
		return "", err
	}
	if err := writeActivity(ctx, tx, actorID, "task", id, "recurrence_created", "", map[string]any{"sourceRecordId": record.ID, "cadence": cadence, "dueAt": next.Format(time.RFC3339Nano)}); err != nil {
		return "", err
	}
	return id, nil
}

func (s *Server) listAttachments(ctx context.Context, recordID string) ([]RecordAttachment, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT a.id, a.record_id, a.uploader_id, u.username, a.original_name, a.content_type, a.size_bytes, a.sha256, a.created_at FROM record_attachments a JOIN users u ON u.id = a.uploader_id WHERE a.record_id = ? ORDER BY a.created_at DESC`, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]RecordAttachment, 0)
	for rows.Next() {
		var item RecordAttachment
		if err := rows.Scan(&item.ID, &item.RecordID, &item.UploaderID, &item.UploaderUsername, &item.OriginalName, &item.ContentType, &item.SizeBytes, &item.SHA256, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func allowedAttachment(name, contentType string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	allowedExt := map[string]bool{".pdf": true, ".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".txt": true, ".md": true, ".csv": true, ".xlsx": true, ".docx": true, ".pptx": true, ".zip": true}
	if !allowedExt[ext] {
		return false
	}
	blocked := []string{"text/html", "image/svg", "application/javascript", "application/x-executable"}
	for _, value := range blocked {
		if strings.Contains(strings.ToLower(contentType), value) {
			return false
		}
	}
	return true
}

func (s *Server) handleUploadAttachment(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAttachmentBytes+1<<20)
	if err := r.ParseMultipartForm(maxAttachmentBytes); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "Файл должен быть не больше 15 МБ")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Выберите файл")
		return
	}
	defer file.Close()
	name := filepath.Base(strings.TrimSpace(header.Filename))
	if name == "" || len(name) > 240 {
		writeError(w, http.StatusBadRequest, "Некорректное имя файла")
		return
	}
	buffer := make([]byte, 512)
	count, _ := io.ReadFull(file, buffer)
	buffer = buffer[:count]
	contentType := http.DetectContentType(buffer)
	if header.Header.Get("Content-Type") != "" && contentType == "application/octet-stream" {
		contentType = header.Header.Get("Content-Type")
	}
	if !allowedAttachment(name, contentType) {
		writeError(w, http.StatusBadRequest, "Этот тип файла не разрешён")
		return
	}
	if err := os.MkdirAll(s.config.UploadPath, 0o750); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось подготовить хранилище")
		return
	}
	id, _ := newID()
	storedName := id + strings.ToLower(filepath.Ext(name))
	finalPath := filepath.Join(s.config.UploadPath, storedName)
	tempPath := finalPath + ".tmp"
	target, err := os.OpenFile(tempPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить файл")
		return
	}
	hash := sha256.New()
	writer := io.MultiWriter(target, hash)
	written, copyErr := io.Copy(writer, io.MultiReader(bytes.NewReader(buffer), file))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil || written > maxAttachmentBytes {
		os.Remove(tempPath)
		writeError(w, http.StatusRequestEntityTooLarge, "Файл должен быть не больше 15 МБ")
		return
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		os.Remove(tempPath)
		writeError(w, http.StatusInternalServerError, "Не удалось завершить сохранение файла")
		return
	}
	user := currentUser(r)
	now := nowText()
	digest := hex.EncodeToString(hash.Sum(nil))
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось записать файл")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO record_attachments(id, record_id, uploader_id, original_name, stored_name, content_type, size_bytes, sha256, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, record.ID, user.ID, name, storedName, contentType, written, digest, now); err != nil {
		os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось записать файл")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "attachment_added", "", map[string]any{"attachmentId": id, "name": name, "sizeBytes": written, "sha256": digest}); err != nil {
		os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось записать файл в историю")
		return
	}
	if err := tx.Commit(); err != nil {
		os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось завершить загрузку")
		return
	}
	items, _ := s.listAttachments(r.Context(), record.ID)
	writeJSON(w, http.StatusCreated, items[0])
}

func (s *Server) handleDownloadAttachment(w http.ResponseWriter, r *http.Request) {
	var stored, original, contentType string
	var size int64
	err := s.store.db.QueryRowContext(r.Context(), `SELECT stored_name, original_name, content_type, size_bytes FROM record_attachments WHERE id = ?`, r.PathValue("id")).Scan(&stored, &original, &contentType, &size)
	if err != nil {
		writeError(w, http.StatusNotFound, "Файл не найден")
		return
	}
	path := filepath.Join(s.config.UploadPath, stored)
	file, err := os.Open(path)
	if err != nil {
		writeError(w, http.StatusNotFound, "Файл отсутствует в хранилище")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": original}))
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = io.Copy(w, file)
}

func insertNotification(ctx context.Context, tx *sql.Tx, userID int64, notificationType, title, body, entityType, entityID string) error {
	id, _ := newID()
	_, err := tx.ExecContext(ctx, `INSERT INTO notifications(id, user_id, type, title, body, entity_type, entity_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, id, userID, notificationType, title, body, entityType, entityID, nowText())
	return err
}

func (s *Server) ensureDeadlineNotifications(ctx context.Context) error {
	rows, err := s.store.db.QueryContext(ctx, `SELECT id, CASE WHEN subtype = 'question_set' THEN 'question_set' WHEN record_kind = 'meeting' THEN 'meeting' ELSE type END, title, owner_id, due_at FROM records WHERE due_at IS NOT NULL AND status NOT IN ('completed','cancelled','archived','rejected')`)
	if err != nil {
		return err
	}
	type dueRecord struct {
		id, typ, title, due string
		owner               int64
	}
	records := make([]dueRecord, 0)
	for rows.Next() {
		var item dueRecord
		if rows.Scan(&item.id, &item.typ, &item.title, &item.owner, &item.due) == nil {
			records = append(records, item)
		}
	}
	rows.Close()
	moscow := time.FixedZone("Europe/Moscow", 3*60*60)
	now := time.Now().In(moscow)
	today := now.Format("2006-01-02")
	for _, item := range records {
		due, parseErr := time.Parse(time.RFC3339Nano, item.due)
		if parseErr != nil {
			continue
		}
		localDue := due.In(moscow)
		days := int(localDue.Truncate(24*time.Hour).Sub(now.Truncate(24*time.Hour)).Hours() / 24)
		kind, title := "", ""
		switch {
		case localDue.Before(now):
			kind, title = "overdue", "Срок просрочен"
		case days == 0:
			kind, title = "due_today", "Срок сегодня"
		case days == 1:
			kind, title = "due_tomorrow", "Срок завтра"
		}
		if kind == "" {
			continue
		}
		key := fmt.Sprintf("deadline:%s:%d:%s:%s", item.id, item.owner, kind, today)
		tx, beginErr := s.store.db.BeginTx(ctx, nil)
		if beginErr != nil {
			return beginErr
		}
		var exists int
		_ = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE delivery_key = ?`, key).Scan(&exists)
		if exists > 0 {
			tx.Rollback()
			continue
		}
		notificationID, _ := newID()
		body := fmt.Sprintf("«%s» · %s", item.title, localDue.Format("02.01.2006 15:04"))
		if _, err := tx.ExecContext(ctx, `INSERT INTO notifications(id, user_id, type, title, body, entity_type, entity_id, created_at) VALUES(?, ?, 'deadline', ?, ?, ?, ?, ?)`, notificationID, item.owner, title, body, item.typ, item.id, nowText()); err != nil {
			tx.Rollback()
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO notification_deliveries(delivery_key, notification_id, created_at) VALUES(?, ?, ?)`, key, notificationID, nowText()); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func validViewMode(value string) bool {
	return value == "list" || value == "hierarchy" || value == "kanban" || value == "calendar"
}

func (s *Server) handleListSavedViews(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, name, view_mode, filters_json, created_at, updated_at FROM saved_views WHERE user_id = ? ORDER BY name`, currentUser(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить представления")
		return
	}
	defer rows.Close()
	items := make([]SavedView, 0)
	for rows.Next() {
		var item SavedView
		var filters string
		if rows.Scan(&item.ID, &item.Name, &item.ViewMode, &filters, &item.CreatedAt, &item.UpdatedAt) == nil {
			item.Filters = json.RawMessage(filters)
			items = append(items, item)
		}
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleCreateSavedView(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name     string          `json:"name"`
		ViewMode string          `json:"viewMode"`
		Filters  json.RawMessage `json:"filters"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len(input.Name) > 80 || !validViewMode(input.ViewMode) || len(input.Filters) > 8192 || !json.Valid(input.Filters) {
		writeError(w, http.StatusBadRequest, "Некорректное представление")
		return
	}
	id, _ := newID()
	now := nowText()
	_, err := s.store.db.ExecContext(r.Context(), `INSERT INTO saved_views(id, user_id, name, view_mode, filters_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, name) DO UPDATE SET view_mode = excluded.view_mode, filters_json = excluded.filters_json, updated_at = excluded.updated_at`, id, currentUser(r).ID, input.Name, input.ViewMode, string(input.Filters), now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить представление")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"saved": true})
}

func (s *Server) handleDeleteSavedView(w http.ResponseWriter, r *http.Request) {
	s.store.db.ExecContext(r.Context(), `DELETE FROM saved_views WHERE id = ? AND user_id = ?`, r.PathValue("id"), currentUser(r).ID)
	w.WriteHeader(http.StatusNoContent)
}

func exportRows(ctx context.Context, db *sql.DB, query string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns, _ := rows.Columns()
	result := make([]map[string]any, 0)
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for index := range values {
			pointers[index] = &values[index]
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		item := map[string]any{}
		for index, column := range columns {
			if bytes, ok := values[index].([]byte); ok {
				item[column] = string(bytes)
			} else {
				item[column] = values[index]
			}
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Server) handleExportProject(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("format") == "csv" {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="bizflow-records.csv"`)
		_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})
		writer := csv.NewWriter(w)
		defer writer.Flush()
		_ = writer.Write([]string{"ID", "Тип", "Название", "Статус", "Ответственный", "Срок", "Приоритет", "Прогресс"})
		rows, err := s.store.db.QueryContext(r.Context(), recordSelect+` WHERE r.status <> 'archived' ORDER BY r.updated_at DESC`)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			item, err := scanRecord(rows)
			if err != nil {
				return
			}
			due := ""
			if item.DueAt != nil {
				due = *item.DueAt
			}
			_ = writer.Write([]string{item.ID, item.Type, item.Title, item.Status, item.OwnerUsername, due, item.Priority, strconv.Itoa(item.Progress)})
		}
		return
	}
	tables := map[string]string{
		"users": `SELECT id, email, username, created_at FROM users`, "records": `SELECT * FROM records`, "sections": `SELECT * FROM record_sections`, "links": `SELECT * FROM record_links`, "criterionScores": `SELECT * FROM criterion_scores`, "proofs": `SELECT * FROM task_proofs`, "questions": `SELECT * FROM question_items`, "answers": `SELECT * FROM question_answers`, "questionDecisions": `SELECT * FROM question_decisions`, "derivations": `SELECT * FROM record_derivations`, "comments": `SELECT * FROM record_comments`, "checklist": `SELECT * FROM checklist_items`, "reviews": `SELECT * FROM task_review_events`, "attachments": `SELECT id, record_id, uploader_id, original_name, content_type, size_bytes, sha256, created_at FROM record_attachments`, "recurrence": `SELECT * FROM recurrence_rules`, "activity": `SELECT * FROM activity`,
	}
	payload := map[string]any{"schemaVersion": 7, "exportedAt": nowText(), "exportedBy": currentUser(r).Username, "tables": map[string]any{}}
	data := payload["tables"].(map[string]any)
	for name, query := range tables {
		rows, err := exportRows(r.Context(), s.store.db, query)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось подготовить экспорт")
			return
		}
		data[name] = rows
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="bizflow-export.json"`)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) handleAIHealth(w http.ResponseWriter, r *http.Request) {
	provider := "local"
	model := "heuristic-v1"
	configured := false
	if s.config.GeminiAPIKey != "" {
		provider, model, configured = "gemini", s.config.GeminiModel, true
	} else if s.config.GroqAPIKey != "" {
		provider, model, configured = "groq", s.config.GroqModel, true
	}
	route := "direct"
	if strings.TrimSpace(s.config.AIProxyURL) != "" {
		route = "proxy"
	}
	response := map[string]any{"configured": configured, "providerAvailable": false, "provider": provider, "model": model, "route": route, "checkedAt": nowText(), "source": "heuristic"}
	if !configured {
		response["message"] = "Внешняя модель не настроена; локальные правила активны"
		writeJSON(w, http.StatusOK, response)
		return
	}
	var err error
	if provider == "gemini" {
		_, err = s.geminiSuggestion(r.Context(), "task", "Проверка соединения AI", "Верни безопасную тестовую классификацию")
	} else {
		_, err = s.groqSuggestion(r.Context(), "task", "Проверка соединения AI", "Верни безопасную тестовую классификацию")
	}
	if err != nil {
		log.Printf("%s health: %v", provider, err)
		response["message"] = aiUnavailableMessage(provider, err)
		writeJSON(w, http.StatusOK, response)
		return
	}
	successMessage := "Внешний AI отвечает и прошёл серверную валидацию"
	if route == "proxy" {
		successMessage = "Gemini отвечает через серверный прокси и прошёл валидацию"
	}
	response["providerAvailable"], response["source"], response["message"] = true, provider, successMessage
	writeJSON(w, http.StatusOK, response)
}

func aiUnavailableMessage(provider string, err error) string {
	message := strings.ToUpper(err.Error())
	switch {
	case strings.Contains(message, "BILLING_DISABLED"):
		return "В Google Cloud не включён биллинг; локальный анализ активен"
	case strings.Contains(message, "API_KEY_INVALID"), strings.Contains(message, "UNAUTHENTICATED"):
		return "Ключ внешнего AI отклонён; локальный анализ активен"
	case strings.Contains(message, "RESOURCE_EXHAUSTED"), strings.Contains(message, "STATUS 429"):
		return "Квота внешнего AI исчерпана; локальный анализ активен"
	case strings.Contains(message, "INVALID AI PROXY"):
		return "Прокси внешнего AI настроен неверно; локальный анализ активен"
	case provider == "gemini":
		return "Google Gemini API временно недоступен; локальный анализ активен"
	default:
		return "Внешний AI временно недоступен; локальный анализ активен"
	}
}
