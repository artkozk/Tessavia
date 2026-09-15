package app

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"
)

type NoteAttachment struct {
	ID          string  `json:"id"`
	NoteID      string  `json:"noteId"`
	Name        string  `json:"name"`
	ContentType string  `json:"contentType"`
	Size        int64   `json:"size"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	RemovedAt   *string `json:"removedAt"`
	Preview     bool    `json:"preview"`
}
type NoteVersion struct {
	ID      int64         `json:"id"`
	SavedAt string        `json:"savedAt"`
	Action  string        `json:"action"`
	Title   string        `json:"title"`
	Note    *PersonalNote `json:"note,omitempty"`
}

func noteImageType(kind string) bool {
	return kind == "image/png" || kind == "image/jpeg" || kind == "image/gif" || kind == "image/webp"
}
func scanNoteAttachment(row recordScanner) (NoteAttachment, error) {
	var item NoteAttachment
	err := row.Scan(&item.ID, &item.NoteID, &item.Name, &item.ContentType, &item.Size, &item.CreatedAt, &item.UpdatedAt, &item.RemovedAt)
	item.Preview = noteImageType(item.ContentType)
	return item, err
}

const noteAttachmentSelect = `SELECT a.id,a.note_id,a.original_name,a.content_type,a.size_bytes,a.created_at,a.updated_at,a.removed_at FROM personal_note_attachments a JOIN personal_notes n ON n.id=a.note_id`

func (s *Server) handleGetPersonalNote(w http.ResponseWriter, r *http.Request) {
	note, err := scanPersonalNote(s.store.db.QueryRowContext(r.Context(), personalNoteSelect+` WHERE n.id=? AND n.owner_id=?`, r.PathValue("id"), currentUser(r).ID))
	if err != nil {
		writeError(w, 404, "Заметка не найдена")
		return
	}
	writeJSON(w, 200, note)
}
func (s *Server) handleArchivedNotes(w http.ResponseWriter, r *http.Request) {
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	owner := currentUser(r).ID
	var total int
	if s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_notes WHERE owner_id=? AND archived_at IS NOT NULL`, owner).Scan(&total) != nil {
		writeError(w, 500, "Не удалось прочитать архив")
		return
	}
	// Metadata only; full text is loaded when the owner opens a note.
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,title,updated_at,archived_at FROM personal_notes WHERE owner_id=? AND archived_at IS NOT NULL ORDER BY archived_at DESC,id LIMIT 30 OFFSET ?`, owner, offset)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать архив")
		return
	}
	defer rows.Close()
	items := []PersonalNote{}
	for rows.Next() {
		var note PersonalNote
		if err = rows.Scan(&note.ID, &note.Title, &note.UpdatedAt, &note.ArchivedAt); err != nil {
			writeError(w, 500, "Не удалось прочитать архив")
			return
		}
		items = append(items, note)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось прочитать архив")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "offset": offset})
}

func (s *Server) handleRestoreArchivedNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
		AsOrdinary        bool   `json:"asOrdinary"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось восстановить заметку")
		return
	}
	defer tx.Rollback()
	owner, id := currentUser(r).ID, r.PathValue("id")
	note, err := scanPersonalNote(tx.QueryRowContext(r.Context(), personalNoteSelect+` WHERE n.id=? AND n.owner_id=?`, id, owner))
	if err != nil {
		writeError(w, 404, "Заметка не найдена")
		return
	}
	if note.ArchivedAt == nil {
		writeJSON(w, 200, note)
		return
	}
	if input.ExpectedUpdatedAt == "" || input.ExpectedUpdatedAt != note.UpdatedAt {
		writeError(w, 409, "Заметка изменилась. Обновите архив")
		return
	}
	daily := note.DailyDate
	if input.AsOrdinary {
		daily = ""
	}
	if daily != "" {
		var count int
		if tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_notes WHERE owner_id=? AND daily_date=? AND archived_at IS NULL`, owner, daily).Scan(&count) != nil {
			writeError(w, 500, "Не удалось проверить день")
			return
		}
		if count > 0 {
			writeJSON(w, 409, map[string]string{"error": "На этот день уже есть заметка. Можно восстановить эту запись как обычную заметку.", "code": "daily_note_exists"})
			return
		}
	}
	folder := note.FolderID
	if !noteFolderExists(r.Context(), tx, owner, folder) {
		folder = ""
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE personal_notes SET archived_at=NULL,updated_at=?,daily_date=?,folder_id=NULLIF(?,'') WHERE id=? AND owner_id=?`, nowText(), daily, folder, id, owner); err != nil {
		writeError(w, 500, "Не удалось восстановить заметку")
		return
	}
	note, err = scanPersonalNote(tx.QueryRowContext(r.Context(), personalNoteSelect+` WHERE n.id=? AND n.owner_id=?`, id, owner))
	if err != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить восстановление")
		return
	}
	writeJSON(w, 200, note)
}

func (s *Server) handleNoteVersions(w http.ResponseWriter, r *http.Request) {
	owner, id := currentUser(r).ID, r.PathValue("id")
	var found int
	if s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM personal_notes WHERE id=? AND owner_id=?`, id, owner).Scan(&found) != nil {
		writeError(w, 404, "Заметка не найдена")
		return
	}
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT v.id,v.saved_at,v.action,v.title FROM personal_note_versions v JOIN personal_notes n ON n.id=v.note_id WHERE v.note_id=? AND n.owner_id=? AND (?=0 OR v.id<?) ORDER BY v.id DESC LIMIT 31`, id, owner, before, before)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать историю")
		return
	}
	defer rows.Close()
	items := []NoteVersion{}
	for rows.Next() {
		var item NoteVersion
		if rows.Scan(&item.ID, &item.SavedAt, &item.Action, &item.Title) != nil {
			writeError(w, 500, "Не удалось прочитать историю")
			return
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось прочитать историю")
		return
	}
	var next int64
	if len(items) > 30 {
		items = items[:30]
		next = items[len(items)-1].ID
	}
	writeJSON(w, 200, map[string]any{"items": items, "nextBefore": next})
}

func loadNoteVersion(row recordScanner) (NoteVersion, error) {
	var item NoteVersion
	note := PersonalNote{}
	var tags string
	err := row.Scan(&item.ID, &item.SavedAt, &item.Action, &note.ID, &note.Title, &note.Body, &note.Pinned, &note.ScheduledDate, &note.InInbox, &note.TitleGenerated, &note.FolderID, &tags, &note.DailyDate, &note.ArchivedAt)
	if err == nil {
		err = json.Unmarshal([]byte(tags), &note.Tags)
	}
	item.Title = note.Title
	note.UpdatedAt = item.SavedAt
	item.Note = &note
	return item, err
}

const noteVersionSelect = `SELECT v.id,v.saved_at,v.action,v.note_id,v.title,v.body,v.pinned,v.scheduled_date,v.in_inbox,v.title_generated,COALESCE(v.folder_id,''),v.tags_json,v.daily_date,v.archived_at FROM personal_note_versions v JOIN personal_notes n ON n.id=v.note_id WHERE v.id=? AND v.note_id=? AND n.owner_id=?`

func (s *Server) handleGetNoteVersion(w http.ResponseWriter, r *http.Request) {
	item, err := loadNoteVersion(s.store.db.QueryRowContext(r.Context(), noteVersionSelect, r.PathValue("version"), r.PathValue("id"), currentUser(r).ID))
	if err != nil {
		writeError(w, 404, "Версия не найдена")
		return
	}
	writeJSON(w, 200, item)
}
func (s *Server) handleRestoreNoteVersion(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	owner, id := currentUser(r).ID, r.PathValue("id")
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть заметку")
		return
	}
	defer tx.Rollback()
	current, err := scanPersonalNote(tx.QueryRowContext(r.Context(), personalNoteSelect+` WHERE n.id=? AND n.owner_id=? AND n.archived_at IS NULL`, id, owner))
	if err != nil {
		writeError(w, 404, "Активная заметка не найдена")
		return
	}
	if input.ExpectedUpdatedAt == "" || input.ExpectedUpdatedAt != current.UpdatedAt {
		writeError(w, 409, "Заметка изменилась. Обновите её перед восстановлением")
		return
	}
	version, err := loadNoteVersion(tx.QueryRowContext(r.Context(), noteVersionSelect, r.PathValue("version"), id, owner))
	if err != nil {
		writeError(w, 404, "Версия не найдена")
		return
	}
	previous := version.Note
	folder := previous.FolderID
	if !noteFolderExists(r.Context(), tx, owner, folder) {
		folder = ""
	}
	rawTags, _ := json.Marshal(previous.Tags)
	tags := string(rawTags)
	now := nowText()
	_, err = tx.ExecContext(r.Context(), `UPDATE personal_notes SET title=?,body=?,pinned=?,scheduled_date=?,in_inbox=?,title_generated=?,folder_id=NULLIF(?,''),tags_json=?,updated_at=? WHERE id=? AND owner_id=?`, previous.Title, previous.Body, previous.Pinned, previous.ScheduledDate, previous.InInbox, previous.TitleGenerated, folder, tags, now, id, owner)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE personal_note_versions SET action='restored' WHERE note_id=? AND saved_at=?`, id, now)
	}
	if err != nil {
		writeError(w, 500, "Не удалось восстановить версию")
		return
	}
	note, err := scanPersonalNote(tx.QueryRowContext(r.Context(), personalNoteSelect+` WHERE n.id=? AND n.owner_id=?`, id, owner))
	if err != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить восстановление")
		return
	}
	writeJSON(w, 200, note)
}

func (s *Server) handleNoteAttachments(w http.ResponseWriter, r *http.Request) {
	owner, id := currentUser(r).ID, r.PathValue("id")
	var found int
	if s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM personal_notes WHERE id=? AND owner_id=?`, id, owner).Scan(&found) != nil {
		writeError(w, 404, "Заметка не найдена")
		return
	}
	rows, err := s.store.db.QueryContext(r.Context(), noteAttachmentSelect+` WHERE n.owner_id=? AND n.id=? ORDER BY a.created_at,a.id`, owner, id)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать вложения")
		return
	}
	defer rows.Close()
	items := []NoteAttachment{}
	for rows.Next() {
		item, err := scanNoteAttachment(rows)
		if err != nil {
			writeError(w, 500, "Не удалось прочитать вложения")
			return
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось прочитать вложения")
		return
	}
	writeJSON(w, 200, items)
}
func (s *Server) handleUploadNoteAttachment(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxAttachmentBytes+(1<<20))
	if r.ParseMultipartForm(1<<20) != nil {
		writeError(w, 413, "Файл должен быть не больше 15 МБ")
		return
	}
	defer r.MultipartForm.RemoveAll()
	key := r.FormValue("requestKey")
	if !validateCreateRequestKey(w, r, &key) {
		return
	}
	if key == "" {
		writeError(w, 400, "Нужен ключ отправки файла")
		return
	}
	owner, noteID := currentUser(r).ID, r.PathValue("id")
	if noteID == "" {
		parentKey := r.FormValue("noteRequestKey")
		if !validateCreateRequestKey(w, r, &parentKey) {
			return
		}
		if parentKey == "" {
			writeError(w, 400, "Укажите заметку")
			return
		}
		err := s.store.db.QueryRowContext(r.Context(), `SELECT entity_id FROM personal_create_requests WHERE owner_id=? AND request_key=? AND entity_kind='note'`, owner, parentKey).Scan(&noteID)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 425, "Сначала ожидаем подтверждения самой заметки")
			return
		}
		if err != nil {
			writeError(w, 500, "Не удалось проверить заметку")
			return
		}
	}
	var found int
	if s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM personal_notes WHERE id=? AND owner_id=? AND archived_at IS NULL`, noteID, owner).Scan(&found) != nil {
		writeError(w, 404, "Активная заметка не найдена")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, 400, "Выберите файл")
		return
	}
	defer file.Close()
	name := filepath.Base(strings.ReplaceAll(strings.TrimSpace(header.Filename), "\\", "/"))
	if name == "" || name == "." || utf8.RuneCountInString(name) > 240 {
		writeError(w, 400, "Некорректное имя файла")
		return
	}
	prefix := make([]byte, 512)
	count, _ := io.ReadFull(file, prefix)
	prefix = prefix[:count]
	kind := http.DetectContentType(prefix)
	ext := strings.ToLower(filepath.Ext(name))
	if !allowedAttachment(name, kind) && !(ext == ".gif" && kind == "image/gif") && !(ext == ".heic" || ext == ".heif") {
		writeError(w, 400, "Этот тип файла не разрешён")
		return
	}
	dir := filepath.Join(s.config.UploadPath, "personal-notes")
	if os.MkdirAll(dir, 0o750) != nil {
		writeError(w, 500, "Не удалось подготовить хранилище")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	stored := id + ".bin"
	finalPath := filepath.Join(dir, stored)
	tempPath := finalPath + ".tmp"
	target, err := os.OpenFile(tempPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить файл")
		return
	}
	defer os.Remove(tempPath)
	hash := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(target, hash), io.LimitReader(io.MultiReader(bytes.NewReader(prefix), file), maxAttachmentBytes+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil {
		writeError(w, 500, "Не удалось прочитать файл. Можно повторить отправку")
		return
	}
	if size < 1 || size > maxAttachmentBytes {
		writeError(w, 413, "Файл должен содержать от 1 байта до 15 МБ")
		return
	}
	digest := hex.EncodeToString(hash.Sum(nil))
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось записать файл")
		return
	}
	defer tx.Rollback()
	if tx.QueryRowContext(r.Context(), `SELECT 1 FROM personal_notes WHERE id=? AND owner_id=? AND archived_at IS NULL`, noteID, owner).Scan(&found) != nil {
		writeError(w, 404, "Активная заметка не найдена")
		return
	}
	existing, readErr := scanNoteAttachment(tx.QueryRowContext(r.Context(), noteAttachmentSelect+` WHERE n.owner_id=? AND n.id=? AND a.request_key=?`, owner, noteID, key))
	if readErr == nil {
		var oldHash string
		if tx.QueryRowContext(r.Context(), `SELECT sha256 FROM personal_note_attachments WHERE id=?`, existing.ID).Scan(&oldHash) != nil {
			writeError(w, 500, "Не удалось проверить файл")
			return
		}
		if oldHash != digest || existing.Name != name || existing.Size != size {
			writeError(w, 409, "Ключ отправки уже использован для другого файла")
			return
		}
		writeJSON(w, 200, existing)
		return
	}
	if !errors.Is(readErr, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось проверить отправку")
		return
	}
	if os.Rename(tempPath, finalPath) != nil {
		writeError(w, 500, "Не удалось завершить загрузку")
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(finalPath)
		}
	}()
	now := nowText()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_note_attachments(id,note_id,original_name,stored_name,content_type,size_bytes,sha256,request_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, id, noteID, name, stored, kind, size, digest, key, now, now)
	if err != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить запись файла")
		return
	}
	committed = true
	writeJSON(w, 201, NoteAttachment{ID: id, NoteID: noteID, Name: name, ContentType: kind, Size: size, CreatedAt: now, UpdatedAt: now, Preview: noteImageType(kind)})
}
func (s *Server) handleNoteAttachmentFile(w http.ResponseWriter, r *http.Request) {
	var stored, name, kind string
	if s.store.db.QueryRowContext(r.Context(), `SELECT a.stored_name,a.original_name,a.content_type FROM personal_note_attachments a JOIN personal_notes n ON n.id=a.note_id WHERE a.id=? AND n.owner_id=?`, r.PathValue("attachment"), currentUser(r).ID).Scan(&stored, &name, &kind) != nil {
		writeError(w, 404, "Файл не найден")
		return
	}
	// Only our generated basename is ever used as a path; inactive files remain
	// readable by their owner for recovery, never by project membership.
	if filepath.Base(stored) != stored || strings.ContainsAny(stored, "/\\") {
		writeError(w, 404, "Файл не найден")
		return
	}
	file, err := os.Open(filepath.Join(s.config.UploadPath, "personal-notes", stored))
	if err != nil {
		writeError(w, 404, "Файл отсутствует в хранилище")
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		writeError(w, 500, "Не удалось прочитать файл")
		return
	}
	disposition := "attachment"
	contentType := "application/octet-stream"
	if attachmentPreviewKind(kind) != "" && r.URL.Query().Get("download") != "1" {
		disposition = "inline"
		contentType = kind
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": name}))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeContent(w, r, name, info.ModTime(), file)
}
func (s *Server) handleNoteAttachmentState(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
		Removed           bool   `json:"removed"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	owner := currentUser(r).ID
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось изменить вложение")
		return
	}
	defer tx.Rollback()
	item, err := scanNoteAttachment(tx.QueryRowContext(r.Context(), noteAttachmentSelect+` WHERE a.id=? AND n.owner_id=? AND n.archived_at IS NULL`, r.PathValue("attachment"), owner))
	if err != nil {
		writeError(w, 404, "Вложение не найдено")
		return
	}
	if input.ExpectedUpdatedAt == "" || input.ExpectedUpdatedAt != item.UpdatedAt {
		writeError(w, 409, "Вложение изменилось. Обновите список")
		return
	}
	now := nowText()
	var removed any
	if input.Removed {
		removed = now
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE personal_note_attachments SET removed_at=?,updated_at=? WHERE id=?`, removed, now, item.ID); err != nil {
		writeError(w, 500, "Не удалось изменить вложение")
		return
	}
	item, err = scanNoteAttachment(tx.QueryRowContext(r.Context(), noteAttachmentSelect+` WHERE a.id=? AND n.owner_id=?`, item.ID, owner))
	if err != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить изменение")
		return
	}
	writeJSON(w, 200, item)
}
