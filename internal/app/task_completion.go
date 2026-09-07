package app

import (
	"fmt"
	"net/http"
)

// finishTask separates completion from the optional human review and preserves an explicit board destination.
func (s *Server) finishTask(w http.ResponseWriter, r *http.Request, record Record, result string, notify bool, stageID string) {
	user := currentUser(r)
	if record.Status == "archived" || record.Status == "cancelled" {
		writeError(w, 409, "Сначала верните задачу в работу")
		return
	}
	reviewer := record.AuthorID
	if record.DecisionMakerID != nil {
		reviewer = *record.DecisionMakerID
	}
	pending := (record.AuthorID != record.OwnerID || record.DecisionMakerID != nil) && reviewer != user.ID
	already := record.Status == "completed"
	if already && (stageID == "" || stageID == record.StageID) {
		writeJSON(w, 200, record)
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать завершение")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if stageID == "" {
		stageID = record.StageID
		var done string
		err = tx.QueryRowContext(r.Context(), `SELECT id FROM collection_stages WHERE collection_id=? AND category='done' AND archived_at IS NULL ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,sort_order,id LIMIT 1`, record.CollectionID, record.StageID).Scan(&done)
		if err == nil {
			stageID = done
		}
	}
	var destination any
	if stageID != "" {
		destination = stageID
	}
	if already {
		pending = record.ReviewPending
		result = record.Result
	}
	update, err := tx.ExecContext(r.Context(), `UPDATE records SET stage_id=?, status='completed',review_pending=?,progress=100,result=?,completed_at=COALESCE(completed_at,?),updated_at=? WHERE id=? AND updated_at=?`, destination, pending, result, now, now, record.ID, record.UpdatedAt)
	if err != nil {
		writeError(w, 500, "Не удалось завершить задачу")
		return
	}
	if n, _ := update.RowsAffected(); n != 1 {
		writeError(w, 409, "Задача изменилась. Обновите карточку")
		return
	}
	if err = writeActivity(r.Context(), tx, user.ID, "task", record.ID, "completed", "", map[string]any{"result": result, "reviewPending": pending, "stageId": stageID, "previousStageId": record.StageID}); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if !already {
		if pending {
			eventID, _ := newID()
			if _, err = tx.ExecContext(r.Context(), `INSERT INTO task_review_events(id,record_id,actor_id,action,created_at) VALUES(?,?,?,'submitted',?)`, eventID, record.ID, user.ID, now); err != nil {
				writeError(w, 500, "Не удалось записать проверку")
				return
			}
			if err = insertNotification(r.Context(), tx, reviewer, "task_review", "Задача выполнена — можно проверить", fmt.Sprintf("%s завершил задачу «%s». Она остаётся в завершённых. При необходимости верните её в работу с пояснением.", user.Username, record.Title), "task", record.ID); err != nil {
				writeError(w, 500, "Не удалось уведомить принимающего")
				return
			}
		} else if notify {
			if err = s.insertPartnerNotifications(r.Context(), tx, user, record, "Задача выполнена", fmt.Sprintf("%s завершил задачу «%s»", user.Username, record.Title)); err != nil {
				writeError(w, 500, "Не удалось создать уведомления")
				return
			}
		}
		if _, err = s.spawnRecurringTask(r.Context(), tx, record, user.ID, now); err != nil {
			writeError(w, 500, "Не удалось создать повторение")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить завершение")
		return
	}
	writeJSON(w, 200, mustRecord(s, r.Context(), record.ID))
}
