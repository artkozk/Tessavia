package app

import (
	"database/sql"
	"errors"
	"net/http"
)

func (s *Server) requireCollectionManager(w http.ResponseWriter, r *http.Request) bool {
	if !s.requireWorkspaceAdmin(w, r) {
		return false
	}
	if !s.collectionBelongsToWorkspace(r.Context(), r.PathValue("id"), currentWorkspace(r).ID) {
		writeError(w, 404, "Доска не найдена")
		return false
	}
	return true
}

func (s *Server) handleCollectionSchema(w http.ResponseWriter, r *http.Request) {
	if !s.requireCollectionManager(w, r) {
		return
	}
	fields, err := s.listCollectionSchemaFields(r.Context(), r.PathValue("id"), true)
	if err != nil {
		writeError(w, 500, "Не удалось загрузить поля")
		return
	}
	stages, err := s.listCollectionSchemaStages(r.Context(), r.PathValue("id"), true)
	if err != nil {
		writeError(w, 500, "Не удалось загрузить колонки")
		return
	}
	writeJSON(w, 200, map[string]any{"fields": fields, "stages": stages})
}

func (s *Server) handleArchiveCollectionElement(w http.ResponseWriter, r *http.Request) {
	s.setCollectionElementArchive(w, r, false)
}
func (s *Server) handleRestoreCollectionElement(w http.ResponseWriter, r *http.Request) {
	s.setCollectionElementArchive(w, r, true)
}

func (s *Server) setCollectionElementArchive(w http.ResponseWriter, r *http.Request, restore bool) {
	if !s.requireCollectionManager(w, r) {
		return
	}
	var input struct {
		ExpectedAt string `json:"expectedUpdatedAt"`
		MoveTo     string `json:"moveToStageId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.ExpectedAt == "" {
		writeError(w, 409, "Обновите конструктор перед изменением")
		return
	}
	table, kind, id := "collection_fields", "field", r.PathValue("fieldId")
	if id == "" {
		table, kind, id = "collection_stages", "stage", r.PathValue("stageId")
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	var version, name string
	var archived sql.NullString
	err = tx.QueryRowContext(r.Context(), `SELECT name,updated_at,archived_at FROM `+table+` WHERE id=? AND collection_id=?`, id, r.PathValue("id")).Scan(&name, &version, &archived)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Элемент не найден")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать схему")
		return
	}
	if version != input.ExpectedAt || restore != archived.Valid {
		writeError(w, 409, "Схема изменилась. Обновите конструктор")
		return
	}
	now := nowText()
	moved := []string{}
	movedTypes := map[string]string{}
	if kind == "stage" && !restore {
		var active int
		if err = tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM collection_stages WHERE collection_id=? AND archived_at IS NULL`, r.PathValue("id")).Scan(&active); err != nil {
			writeError(w, 500, "Не удалось проверить колонки")
			return
		}
		if active <= 1 {
			writeError(w, 409, "На доске должна остаться хотя бы одна колонка")
			return
		}
		rows, queryErr := tx.QueryContext(r.Context(), `SELECT id,type FROM records WHERE collection_id=? AND stage_id=?`, r.PathValue("id"), id)
		if queryErr != nil {
			writeError(w, 500, "Не удалось проверить карточки")
			return
		}
		for rows.Next() {
			var recordID, recordType string
			if queryErr = rows.Scan(&recordID, &recordType); queryErr != nil {
				rows.Close()
				writeError(w, 500, "Не удалось прочитать карточки")
				return
			}
			moved = append(moved, recordID)
			movedTypes[recordID] = recordType
		}
		queryErr = rows.Err()
		rows.Close()
		if queryErr != nil {
			writeError(w, 500, "Не удалось прочитать карточки")
			return
		}
		if len(moved) > 0 {
			var target string
			if input.MoveTo == id || tx.QueryRowContext(r.Context(), `SELECT id FROM collection_stages WHERE id=? AND collection_id=? AND archived_at IS NULL`, input.MoveTo, r.PathValue("id")).Scan(&target) != nil {
				writeError(w, 409, "Выберите другую колонку для находящихся здесь карточек")
				return
			}
			if _, err = tx.ExecContext(r.Context(), `UPDATE records SET stage_id=?,updated_at=? WHERE collection_id=? AND stage_id=?`, target, now, r.PathValue("id"), id); err != nil {
				writeError(w, 500, "Не удалось перенести карточки")
				return
			}
			for _, recordID := range moved {
				if err = writeActivity(r.Context(), tx, currentUser(r).ID, movedTypes[recordID], recordID, "collection_stage_relocated", "Колонка удалена; состояние карточки сохранено", map[string]any{"before": id, "after": target}); err != nil {
					writeError(w, 500, "Не удалось сохранить историю карточек")
					return
				}
			}
		}
	}
	var archiveValue any = now
	action := kind + "_archived"
	if restore {
		archiveValue = nil
		action = kind + "_restored"
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE `+table+` SET archived_at=?,updated_at=? WHERE id=? AND collection_id=?`, archiveValue, now, id, r.PathValue("id")); err != nil {
		writeError(w, 500, "Не удалось изменить схему")
		return
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, "collection", r.PathValue("id"), action, "", map[string]any{"id": id, "name": name, "movedRecords": len(moved), "targetStage": input.MoveTo}); err != nil {
		writeError(w, 500, "Не удалось сохранить историю схемы")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить изменение")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCollectionSchemaOrder(w http.ResponseWriter, r *http.Request) {
	if !s.requireCollectionManager(w, r) {
		return
	}
	var input struct {
		Kind     string            `json:"kind"`
		IDs      []string          `json:"ids"`
		Versions map[string]string `json:"versions"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	table := "collection_fields"
	if input.Kind == "stages" {
		table = "collection_stages"
	} else if input.Kind != "fields" {
		writeError(w, 400, "Неизвестный вид элементов")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(r.Context(), `SELECT id,updated_at FROM `+table+` WHERE collection_id=? AND archived_at IS NULL ORDER BY sort_order,name`, r.PathValue("id"))
	if err != nil {
		writeError(w, 500, "Не удалось прочитать схему")
		return
	}
	versions := map[string]string{}
	before := []string{}
	for rows.Next() {
		var id, version string
		if err = rows.Scan(&id, &version); err != nil {
			rows.Close()
			writeError(w, 500, "Не удалось прочитать схему")
			return
		}
		versions[id] = version
		before = append(before, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		writeError(w, 500, "Не удалось прочитать схему")
		return
	}
	if len(input.IDs) != len(versions) || len(input.Versions) != len(versions) {
		writeError(w, 409, "Состав схемы изменился. Обновите конструктор")
		return
	}
	seen := map[string]bool{}
	for _, id := range input.IDs {
		if seen[id] || versions[id] == "" || input.Versions[id] != versions[id] {
			writeError(w, 409, "Схема изменилась или порядок содержит чужие элементы")
			return
		}
		seen[id] = true
	}
	now := nowText()
	for i, id := range input.IDs {
		if _, err = tx.ExecContext(r.Context(), `UPDATE `+table+` SET sort_order=?,updated_at=? WHERE id=? AND collection_id=?`, (i+1)*10, now, id, r.PathValue("id")); err != nil {
			writeError(w, 500, "Не удалось сохранить порядок")
			return
		}
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, "collection", r.PathValue("id"), "schema_reordered", "", map[string]any{"kind": input.Kind, "before": before, "after": input.IDs}); err != nil {
		writeError(w, 500, "Не удалось сохранить историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить порядок")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
