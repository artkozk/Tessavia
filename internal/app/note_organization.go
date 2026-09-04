package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"
)

type PersonalNoteFolder struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
	Count     int    `json:"count"`
}
type PersonalNoteTemplate struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Title     string   `json:"title"`
	Body      string   `json:"body,omitempty"`
	FolderID  string   `json:"folderId"`
	Tags      []string `json:"tags"`
	UpdatedAt string   `json:"updatedAt"`
}

const personalNoteSelect = `SELECT n.id,n.title,n.body,n.pinned,n.created_at,n.updated_at,n.scheduled_date,n.in_inbox,n.title_generated,
 COALESCE(n.folder_id,''),COALESCE(f.name,''),n.tags_json,n.daily_date,n.archived_at FROM personal_notes n
 LEFT JOIN personal_note_folders f ON f.id=n.folder_id AND f.owner_id=n.owner_id AND f.archived_at IS NULL`

func scanPersonalNote(row recordScanner) (PersonalNote, error) {
	var note PersonalNote
	var tags string
	err := row.Scan(&note.ID, &note.Title, &note.Body, &note.Pinned, &note.CreatedAt, &note.UpdatedAt, &note.ScheduledDate, &note.InInbox, &note.TitleGenerated, &note.FolderID, &note.FolderName, &tags, &note.DailyDate, &note.ArchivedAt)
	if err == nil {
		err = json.Unmarshal([]byte(tags), &note.Tags)
	}
	return note, err
}

func normalizeNoteTags(tags []string) ([]string, error) {
	result := []string{}
	seen := map[string]bool{}
	for _, raw := range tags {
		value := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(raw), "#"))
		key := strings.ToLower(value)
		if value == "" || seen[key] {
			continue
		}
		if utf8.RuneCountInString(value) > 40 || strings.ContainsAny(value, "\n\r,;") {
			return nil, errors.New("Метка должна содержать до 40 символов без запятых и переносов")
		}
		seen[key] = true
		result = append(result, value)
	}
	if len(result) > 20 {
		return nil, errors.New("У заметки может быть до 20 меток")
	}
	return result, nil
}

func noteFolderExists(ctx context.Context, tx *sql.Tx, owner int64, id string) bool {
	if id == "" {
		return true
	}
	var found int
	return tx.QueryRowContext(ctx, `SELECT 1 FROM personal_note_folders WHERE id=? AND owner_id=? AND archived_at IS NULL`, id, owner).Scan(&found) == nil
}

func (s *Server) listNoteLibrary(r *http.Request, overview *PersonalOverview) error {
	owner := currentUser(r).ID
	overview.NoteFolders = []PersonalNoteFolder{}
	overview.NoteTemplates = []PersonalNoteTemplate{}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT f.id,f.name,f.updated_at,(SELECT COUNT(*) FROM personal_notes n WHERE n.owner_id=f.owner_id AND n.folder_id=f.id AND n.archived_at IS NULL)
 FROM personal_note_folders f WHERE f.owner_id=? AND f.archived_at IS NULL ORDER BY f.name_key,f.id`, owner)
	if err != nil {
		return err
	}
	for rows.Next() {
		var item PersonalNoteFolder
		if err = rows.Scan(&item.ID, &item.Name, &item.UpdatedAt, &item.Count); err != nil {
			rows.Close()
			return err
		}
		overview.NoteFolders = append(overview.NoteFolders, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	rows, err = s.store.db.QueryContext(r.Context(), `SELECT id,name,title,updated_at FROM personal_note_templates WHERE owner_id=? AND archived_at IS NULL ORDER BY updated_at DESC,id`, owner)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var item PersonalNoteTemplate
		if err = rows.Scan(&item.ID, &item.Name, &item.Title, &item.UpdatedAt); err != nil {
			return err
		}
		overview.NoteTemplates = append(overview.NoteTemplates, item)
	}
	return rows.Err()
}

func (s *Server) handleSaveNoteFolder(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name              string `json:"name"`
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 80 {
		writeError(w, 400, "Название папки: от 1 до 80 символов")
		return
	}
	id := r.PathValue("id")
	owner := currentUser(r).ID
	now := nowText()
	status := 200
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть папку")
		return
	}
	defer tx.Rollback()
	var duplicate int
	if err = tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_note_folders WHERE owner_id=? AND name_key=? AND archived_at IS NULL AND id<>?`, owner, strings.ToLower(input.Name), id).Scan(&duplicate); err != nil {
		writeError(w, 500, "Не удалось проверить название")
		return
	}
	if duplicate > 0 {
		writeError(w, 409, "Папка с таким названием уже есть")
		return
	}
	if id == "" {
		var ok bool
		id, ok = newPersonalID(w)
		if !ok {
			return
		}
		status = 201
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_note_folders(id,owner_id,name,name_key,created_at,updated_at) VALUES(?,?,?,?,?,?)`, id, owner, input.Name, strings.ToLower(input.Name), now, now)
	} else {
		var current string
		if tx.QueryRowContext(r.Context(), `SELECT updated_at FROM personal_note_folders WHERE id=? AND owner_id=? AND archived_at IS NULL`, id, owner).Scan(&current) != nil {
			writeError(w, 404, "Папка не найдена")
			return
		}
		if input.ExpectedUpdatedAt != current {
			writeError(w, 409, "Папка изменилась. Обновите список")
			return
		}
		_, err = tx.ExecContext(r.Context(), `UPDATE personal_note_folders SET name=?,name_key=?,updated_at=? WHERE id=? AND owner_id=?`, input.Name, strings.ToLower(input.Name), now, id, owner)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить папку")
		return
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить сохранение")
		return
	}
	writeJSON(w, status, PersonalNoteFolder{ID: id, Name: input.Name, UpdatedAt: now})
}

func (s *Server) handleArchiveNoteFolder(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть папку")
		return
	}
	defer tx.Rollback()
	ctx, owner, id := r.Context(), currentUser(r).ID, r.PathValue("id")
	var version string
	if tx.QueryRowContext(ctx, `SELECT updated_at FROM personal_note_folders WHERE id=? AND owner_id=? AND archived_at IS NULL`, id, owner).Scan(&version) != nil {
		writeError(w, 404, "Папка не найдена")
		return
	}
	if input.ExpectedUpdatedAt != version {
		writeError(w, 409, "Папка изменилась. Обновите список")
		return
	}
	now := nowText()
	if _, err = tx.ExecContext(ctx, `UPDATE personal_notes SET folder_id=NULL,updated_at=? WHERE folder_id=? AND owner_id=?`, now, id, owner); err != nil {
		writeError(w, 500, "Не удалось сохранить заметки без папки")
		return
	}
	if _, err = tx.ExecContext(ctx, `UPDATE personal_note_templates SET folder_id=NULL,updated_at=? WHERE folder_id=? AND owner_id=?`, now, id, owner); err != nil {
		writeError(w, 500, "Не удалось сохранить шаблоны без папки")
		return
	}
	if _, err = tx.ExecContext(ctx, `UPDATE personal_note_folders SET archived_at=?,updated_at=? WHERE id=? AND owner_id=?`, now, now, id, owner); err != nil {
		writeError(w, 500, "Не удалось удалить папку")
		return
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить удаление")
		return
	}
	writeJSON(w, 200, map[string]bool{"archived": true})
}

func loadNoteTemplate(ctx context.Context, tx *sql.Tx, owner int64, id string) (PersonalNoteTemplate, error) {
	var item PersonalNoteTemplate
	var tags string
	err := tx.QueryRowContext(ctx, `SELECT id,name,title,body,COALESCE(folder_id,''),tags_json,updated_at FROM personal_note_templates WHERE id=? AND owner_id=? AND archived_at IS NULL`, id, owner).Scan(&item.ID, &item.Name, &item.Title, &item.Body, &item.FolderID, &tags, &item.UpdatedAt)
	if err == nil {
		err = json.Unmarshal([]byte(tags), &item.Tags)
	}
	return item, err
}

func (s *Server) handleGetNoteTemplate(w http.ResponseWriter, r *http.Request) {
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть шаблон")
		return
	}
	defer tx.Rollback()
	item, err := loadNoteTemplate(r.Context(), tx, currentUser(r).ID, r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Шаблон не найден")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать шаблон")
		return
	}
	writeJSON(w, 200, item)
}

func (s *Server) handleSaveNoteTemplate(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name              string   `json:"name"`
		Title             string   `json:"title"`
		Body              string   `json:"body"`
		FolderID          string   `json:"folderId"`
		Tags              []string `json:"tags"`
		ExpectedUpdatedAt string   `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 80 {
		writeError(w, 400, "Название шаблона: от 1 до 80 символов")
		return
	}
	if !validatePersonalText(w, &input.Title, input.Body) {
		return
	}
	tags, err := normalizeNoteTags(input.Tags)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть шаблон")
		return
	}
	defer tx.Rollback()
	ctx, owner, id := r.Context(), currentUser(r).ID, r.PathValue("id")
	if !noteFolderExists(ctx, tx, owner, input.FolderID) {
		writeError(w, 404, "Папка не найдена")
		return
	}
	now, status := nowText(), 200
	tagsJSON, _ := json.Marshal(tags)
	if id == "" {
		var ok bool
		id, ok = newPersonalID(w)
		if !ok {
			return
		}
		status = 201
		_, err = tx.ExecContext(ctx, `INSERT INTO personal_note_templates(id,owner_id,name,title,body,folder_id,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,NULLIF(?,''),?,?,?)`, id, owner, input.Name, input.Title, strings.TrimSpace(input.Body), input.FolderID, string(tagsJSON), now, now)
	} else {
		item, loadErr := loadNoteTemplate(ctx, tx, owner, id)
		if loadErr != nil {
			writeError(w, 404, "Шаблон не найден")
			return
		}
		if input.ExpectedUpdatedAt != item.UpdatedAt {
			writeError(w, 409, "Шаблон изменился. Обновите его")
			return
		}
		_, err = tx.ExecContext(ctx, `UPDATE personal_note_templates SET name=?,title=?,body=?,folder_id=NULLIF(?,''),tags_json=?,updated_at=? WHERE id=? AND owner_id=?`, input.Name, input.Title, strings.TrimSpace(input.Body), input.FolderID, string(tagsJSON), now, id, owner)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить шаблон")
		return
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить сохранение")
		return
	}
	writeJSON(w, status, PersonalNoteTemplate{ID: id, Name: input.Name, Title: input.Title, Body: strings.TrimSpace(input.Body), FolderID: input.FolderID, Tags: tags, UpdatedAt: now})
}

func (s *Server) handleArchiveNoteTemplate(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	owner, id := currentUser(r).ID, r.PathValue("id")
	var version string
	if s.store.db.QueryRowContext(r.Context(), `SELECT updated_at FROM personal_note_templates WHERE id=? AND owner_id=? AND archived_at IS NULL`, id, owner).Scan(&version) != nil {
		writeError(w, 404, "Шаблон не найден")
		return
	}
	if input.ExpectedUpdatedAt != version {
		writeError(w, 409, "Шаблон изменился. Обновите список")
		return
	}
	now := nowText()
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_note_templates SET archived_at=?,updated_at=? WHERE id=? AND owner_id=? AND archived_at IS NULL AND updated_at=?`, now, now, id, owner, version)
	if err != nil {
		writeError(w, 500, "Не удалось удалить шаблон")
		return
	}
	if affectedRows(result) != 1 {
		writeError(w, 409, "Шаблон изменился. Обновите список")
		return
	}
	writeJSON(w, 200, map[string]bool{"archived": true})
}

// Both shortcuts create explicit user-requested notes, never scheduled writes.
func (s *Server) handleCreateNoteShortcut(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Date       string `json:"date"`
		RequestKey string `json:"requestKey"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !validDate(input.Date) {
		writeError(w, 400, "Укажите календарную дату")
		return
	}
	templateID := r.PathValue("id")
	daily := templateID == ""
	if !daily && (!validateCreateRequestKey(w, r, &input.RequestKey)) {
		return
	}
	if !daily && input.RequestKey == "" {
		writeError(w, 400, "Укажите ключ создания")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть заметку")
		return
	}
	defer tx.Rollback()
	ctx, owner := r.Context(), currentUser(r).ID
	payloadHash, _ := createPayloadHash(struct{ TemplateID, Date string }{templateID, input.Date})
	if daily {
		existing, readErr := scanPersonalNote(tx.QueryRowContext(ctx, personalNoteSelect+` WHERE n.owner_id=? AND n.daily_date=? AND n.archived_at IS NULL`, owner, input.Date))
		if readErr == nil {
			writeJSON(w, 200, existing)
			return
		}
		if !errors.Is(readErr, sql.ErrNoRows) {
			writeError(w, 500, "Не удалось проверить заметку дня")
			return
		}
	} else {
		existing, lookupErr := lookupPersonalCreate(ctx, tx, owner, "note", input.RequestKey, payloadHash)
		if lookupErr != nil {
			writeCreateReceiptError(w, lookupErr)
			return
		}
		if existing != "" {
			writePersonalCreateReplay(w, r, tx, "note", existing)
			return
		}
	}
	title, body, folder, tags, dailyDate := "День · "+input.Date, "", "", []string{}, ""
	if daily {
		dailyDate = input.Date
	} else {
		template, loadErr := loadNoteTemplate(ctx, tx, owner, templateID)
		if loadErr != nil {
			writeError(w, 404, "Шаблон не найден")
			return
		}
		title = strings.ReplaceAll(template.Title, "{{date}}", input.Date)
		body = strings.ReplaceAll(template.Body, "{{date}}", input.Date)
		folder, tags = template.FolderID, template.Tags
		if !noteFolderExists(ctx, tx, owner, folder) {
			writeError(w, 404, "Папка шаблона не найдена")
			return
		}
	}
	if !validatePersonalText(w, &title, body) {
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	rawTags, _ := json.Marshal(tags)
	_, err = tx.ExecContext(ctx, `INSERT INTO personal_notes(id,owner_id,title,body,pinned,created_at,updated_at,scheduled_date,folder_id,tags_json,daily_date) VALUES(?,?,?,?,0,?,?,?,NULLIF(?,''),?,?)`, id, owner, title, body, now, now, input.Date, folder, string(rawTags), dailyDate)
	if err == nil && !daily {
		err = recordPersonalCreate(ctx, tx, owner, "note", input.RequestKey, payloadHash, id, now)
	}
	if err != nil {
		writeError(w, 500, "Не удалось создать заметку")
		return
	}
	note, err := scanPersonalNote(tx.QueryRowContext(ctx, personalNoteSelect+` WHERE n.id=? AND n.owner_id=?`, id, owner))
	if err != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить создание заметки")
		return
	}
	writeJSON(w, 201, note)
}

func noteOrganizationHash(original, folder string, tags []string) (string, error) {
	if folder == "" && len(tags) == 0 {
		return original, nil
	}
	return createPayloadHash(struct {
		Original, Folder string
		Tags             []string
	}{original, folder, tags})
}
