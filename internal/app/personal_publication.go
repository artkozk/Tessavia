package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type publicationReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}
type publicationSource struct {
	Title     string `json:"title"`
	Body      string `json:"body"`
	UpdatedAt string `json:"updatedAt"`
}
type publicationInput struct {
	SourceType        string   `json:"sourceType"`
	SourceID          string   `json:"sourceId"`
	ExpectedUpdatedAt string   `json:"expectedUpdatedAt"`
	WorkspaceID       string   `json:"workspaceId"`
	Type              string   `json:"type"`
	Title             string   `json:"title"`
	Body              string   `json:"body"`
	AttachmentIDs     []string `json:"attachmentIds"`
	RequestKey        string   `json:"requestKey"`
}
type publicationFile struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	Stored      string `json:"-"`
	Hash        string `json:"-"`
}
type publicationPreview struct {
	ID string `json:"id"`
	publicationInput
	WorkspaceName string            `json:"workspaceName"`
	Files         []publicationFile `json:"files"`
	ExpiresAt     string            `json:"expiresAt"`
	RecordID      string            `json:"recordId,omitempty"`
}

func readPublicationSource(ctx context.Context, db publicationReader, owner int64, kind, id string) (publicationSource, error) {
	// These are fixed queries, never identifiers supplied by the client.
	queries := map[string]string{
		"note":    `SELECT title,body,updated_at FROM personal_notes WHERE owner_id=? AND id=? AND archived_at IS NULL`,
		"plan":    `SELECT title,notes,updated_at FROM personal_plans WHERE owner_id=? AND id=? AND status<>'archived'`,
		"project": `SELECT title,notes,updated_at FROM personal_projects WHERE owner_id=? AND id=? AND status<>'archived'`,
		"goal":    `SELECT title,notes,updated_at FROM personal_goals WHERE owner_id=? AND id=? AND status<>'archived'`,
	}
	var source publicationSource
	query, ok := queries[kind]
	if !ok {
		return source, sql.ErrNoRows
	}
	err := db.QueryRowContext(ctx, query, owner, id).Scan(&source.Title, &source.Body, &source.UpdatedAt)
	return source, err
}

func publicationDestination(ctx context.Context, db publicationReader, owner int64, workspace string) (string, error) {
	var name string
	err := db.QueryRowContext(ctx, `SELECT w.name FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id
 WHERE w.id=? AND w.kind='team' AND w.archived_at IS NULL AND wm.user_id=? AND wm.status='active'
 AND wm.role IN ('owner','admin','member') AND (w.team_id IS NULL OR EXISTS
 (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=wm.user_id AND tm.status='active'))`, workspace, owner).Scan(&name)
	return name, err
}

func publicationFiles(ctx context.Context, db publicationReader, owner int64, input publicationInput) ([]publicationFile, error) {
	files := []publicationFile{}
	if len(input.AttachmentIDs) > 20 || (len(input.AttachmentIDs) > 0 && input.SourceType != "note") {
		return nil, errors.New("Можно выбрать до 20 файлов сохранённой заметки")
	}
	for _, id := range input.AttachmentIDs {
		var file publicationFile
		err := db.QueryRowContext(ctx, `SELECT a.id,a.original_name,a.content_type,a.size_bytes,a.stored_name,a.sha256 FROM personal_note_attachments a JOIN personal_notes n ON n.id=a.note_id WHERE a.id=? AND a.note_id=? AND n.owner_id=? AND a.removed_at IS NULL AND n.archived_at IS NULL`, id, input.SourceID, owner).Scan(&file.ID, &file.Name, &file.ContentType, &file.Size, &file.Stored, &file.Hash)
		if err != nil {
			return nil, errors.New("Выбранный файл больше не доступен. Подготовьте новый предпросмотр")
		}
		files = append(files, file)
	}
	return files, nil
}

func (s *Server) handlePublicationSource(w http.ResponseWriter, r *http.Request) {
	source, err := readPublicationSource(r.Context(), s.store.db, currentUser(r).ID, r.PathValue("kind"), r.PathValue("id"))
	if err != nil {
		writeError(w, 404, "Личная запись не найдена")
		return
	}
	writeJSON(w, 200, source)
}

func (s *Server) handlePublicationPreview(w http.ResponseWriter, r *http.Request) {
	var input publicationInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	if !createRequestKeyPattern.MatchString(input.RequestKey) || input.ExpectedUpdatedAt == "" || input.Title == "" || len([]rune(input.Title)) > 240 || len(input.Body) > 100000 || (input.Type != "document" && input.Type != "idea" && input.Type != "task") {
		writeError(w, 400, "Укажите название до 240 символов, тип карточки и версию личной записи")
		return
	}
	sort.Strings(input.AttachmentIDs)
	for i, id := range input.AttachmentIDs {
		if id == "" || (i > 0 && id == input.AttachmentIDs[i-1]) {
			writeError(w, 400, "Файл выбран повторно")
			return
		}
	}
	// Private attachment links would be broken for project members and expose internal IDs.
	if strings.Contains(strings.ToLower(input.Body), "/api/personal/") {
		writeError(w, 400, "Уберите ссылки на личные файлы из текста и выберите файлы отдельно")
		return
	}
	owner, ctx := currentUser(r).ID, r.Context()
	tx, err := s.store.db.BeginTx(ctx, nil)
	if err != nil {
		writeError(w, 500, "Не удалось подготовить публикацию")
		return
	}
	defer tx.Rollback()
	name, err := publicationDestination(ctx, tx, owner, input.WorkspaceID)
	if err != nil {
		writeError(w, 403, "Нет доступа на создание карточки в этом проекте")
		return
	}
	hash, _ := createPayloadHash(input)
	var previousHash, previousID, raw, expires string
	var record sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT id,payload_hash,payload_json,expires_at,record_id FROM personal_publications WHERE owner_id=? AND request_key=?`, owner, input.RequestKey).Scan(&previousID, &previousHash, &raw, &expires, &record)
	if err == nil {
		if previousHash != hash {
			writeError(w, 409, "Состав публикации изменился. Создайте новый предпросмотр")
			return
		}
		var preview publicationPreview
		if json.Unmarshal([]byte(raw), &preview) != nil {
			writeError(w, 500, "Не удалось прочитать предпросмотр")
			return
		}
		preview.ID = previousID
		preview.ExpiresAt = expires
		preview.RecordID = record.String
		if preview.RecordID == "" {
			source, sourceErr := readPublicationSource(ctx, tx, owner, input.SourceType, input.SourceID)
			if sourceErr != nil || source.UpdatedAt != input.ExpectedUpdatedAt {
				writeError(w, 409, "Личная запись изменилась. Обновите версию оригинала в выборе публикации")
				return
			}
			if _, fileErr := publicationFiles(ctx, tx, owner, input); fileErr != nil {
				writeError(w, 409, fileErr.Error())
				return
			}
			deadline, parseErr := time.Parse(time.RFC3339Nano, preview.ExpiresAt)
			if parseErr != nil || !time.Now().Before(deadline) {
				preview.ExpiresAt = time.Now().UTC().Add(15 * time.Minute).Format(time.RFC3339Nano)
				payload, _ := json.Marshal(preview)
				if _, err = tx.ExecContext(ctx, `UPDATE personal_publications SET expires_at=?,payload_json=? WHERE id=?`, preview.ExpiresAt, string(payload), preview.ID); err != nil {
					writeError(w, 500, "Не удалось обновить предпросмотр")
					return
				}
			}
		}
		if tx.Commit() != nil {
			writeError(w, 500, "Не удалось прочитать предпросмотр")
			return
		}
		writeJSON(w, 200, preview)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось прочитать публикацию")
		return
	}
	source, err := readPublicationSource(ctx, tx, owner, input.SourceType, input.SourceID)
	if err != nil {
		writeError(w, 404, "Личная запись не найдена")
		return
	}
	if source.UpdatedAt != input.ExpectedUpdatedAt {
		writeError(w, 409, "Личная запись изменилась. Откройте публикацию заново")
		return
	}
	files, err := publicationFiles(ctx, tx, owner, input)
	if err != nil {
		writeError(w, 409, err.Error())
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	preview := publicationPreview{ID: id, publicationInput: input, WorkspaceName: name, Files: files, ExpiresAt: time.Now().UTC().Add(15 * time.Minute).Format(time.RFC3339Nano)}
	payload, _ := json.Marshal(preview)
	if _, err = tx.ExecContext(ctx, `INSERT INTO personal_publications(id,owner_id,request_key,payload_hash,payload_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?)`, id, owner, input.RequestKey, hash, string(payload), nowText(), preview.ExpiresAt); err != nil {
		writeError(w, 500, "Не удалось сохранить предпросмотр")
		return
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось сохранить предпросмотр")
		return
	}
	writeJSON(w, 201, preview)
}

func readPublication(ctx context.Context, db publicationReader, owner int64, id string) (publicationPreview, error) {
	var preview publicationPreview
	var raw string
	var record sql.NullString
	err := db.QueryRowContext(ctx, `SELECT payload_json,record_id FROM personal_publications WHERE id=? AND owner_id=?`, id, owner).Scan(&raw, &record)
	if err != nil {
		return preview, err
	}
	err = json.Unmarshal([]byte(raw), &preview)
	preview.RecordID = record.String
	return preview, err
}

func (s *Server) handleGetPublication(w http.ResponseWriter, r *http.Request) {
	preview, err := readPublication(r.Context(), s.store.db, currentUser(r).ID, r.PathValue("id"))
	if err != nil {
		writeError(w, 404, "Предпросмотр не найден")
		return
	}
	if _, err = publicationDestination(r.Context(), s.store.db, currentUser(r).ID, preview.WorkspaceID); err != nil {
		writeError(w, 403, "Нет доступа к проекту публикации")
		return
	}
	writeJSON(w, 200, preview)
}

func validatePublication(ctx context.Context, db publicationReader, owner int64, preview publicationPreview) ([]publicationFile, error) {
	if preview.RecordID != "" {
		var exists int
		err := db.QueryRowContext(ctx, `SELECT 1 FROM records WHERE id=? AND workspace_id=? AND archived_at IS NULL`, preview.RecordID, preview.WorkspaceID).Scan(&exists)
		if err != nil {
			return nil, errors.New("Копия уже создана, но больше не доступна. Повторная копия не создавалась")
		}
		return nil, nil
	}
	expires, err := time.Parse(time.RFC3339Nano, preview.ExpiresAt)
	if err != nil || !time.Now().Before(expires) {
		return nil, errors.New("Предпросмотр устарел. Подготовьте его заново")
	}
	source, err := readPublicationSource(ctx, db, owner, preview.SourceType, preview.SourceID)
	if err != nil || source.UpdatedAt != preview.ExpectedUpdatedAt {
		return nil, errors.New("Личная запись изменилась или перемещена в архив. Подготовьте новый предпросмотр")
	}
	return publicationFiles(ctx, db, owner, preview.publicationInput)
}

func copyPublicationFile(root string, file publicationFile) (string, error) {
	if file.Size < 1 || file.Size > 15*1024*1024 || filepath.Base(file.Stored) != file.Stored {
		return "", errors.New("Некорректный файл")
	}
	source, err := os.Open(filepath.Join(root, "personal-notes", file.Stored))
	if err != nil {
		return "", err
	}
	defer source.Close()
	id, err := newID()
	if err != nil {
		return "", err
	}
	name := id + strings.ToLower(filepath.Ext(file.Stored))
	target := filepath.Join(root, name)
	out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0640)
	if err != nil {
		return "", err
	}
	hash := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(out, hash), io.LimitReader(source, file.Size+1))
	syncErr := out.Sync()
	closeErr := out.Close()
	if copyErr != nil || syncErr != nil || closeErr != nil || size != file.Size || hex.EncodeToString(hash.Sum(nil)) != file.Hash {
		_ = os.Remove(target)
		return "", errors.New("Файл изменился или не удалось записать копию")
	}
	return name, nil
}

func (s *Server) handlePublicationApply(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Confirm bool `json:"confirm"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !input.Confirm {
		writeError(w, 400, "Подтвердите публикацию после предпросмотра")
		return
	}
	owner, ctx := currentUser(r).ID, r.Context()
	preview, err := readPublication(ctx, s.store.db, owner, r.PathValue("id"))
	if err != nil {
		writeError(w, 404, "Предпросмотр не найден")
		return
	}
	if _, err = publicationDestination(ctx, s.store.db, owner, preview.WorkspaceID); err != nil {
		writeError(w, 403, "Доступ к проекту изменился. Публикация недоступна")
		return
	}
	files, err := validatePublication(ctx, s.store.db, owner, preview)
	if err != nil {
		writeError(w, 409, err.Error())
		return
	}
	result := func(status int) {
		writeJSON(w, status, map[string]string{"recordId": preview.RecordID, "workspaceId": preview.WorkspaceID, "title": preview.Title})
	}
	if preview.RecordID != "" {
		result(200)
		return
	}
	copied := []string{}
	committed := false
	defer func() {
		if !committed {
			for _, name := range copied {
				_ = os.Remove(filepath.Join(s.config.UploadPath, name))
			}
		}
	}()
	// Copy immutable bytes outside the SQLite write transaction, then recheck access
	// and source state inside it. Concurrent retries discard their unused copies.
	for _, file := range files {
		name, err := copyPublicationFile(s.config.UploadPath, file)
		if err != nil {
			writeError(w, 500, "Не удалось скопировать выбранные файлы. Можно повторить подтверждение")
			return
		}
		copied = append(copied, name)
	}
	tx, err := s.store.db.BeginTx(ctx, nil)
	if err != nil {
		writeError(w, 500, "Не удалось опубликовать запись")
		return
	}
	defer tx.Rollback()
	preview, err = readPublication(ctx, tx, owner, preview.ID)
	if err != nil {
		writeError(w, 404, "Предпросмотр не найден")
		return
	}
	if _, err = publicationDestination(ctx, tx, owner, preview.WorkspaceID); err != nil {
		writeError(w, 403, "Доступ к проекту изменился. Публикация недоступна")
		return
	}
	checked, err := validatePublication(ctx, tx, owner, preview)
	if err != nil {
		writeError(w, 409, err.Error())
		return
	}
	if preview.RecordID != "" {
		result(200)
		return
	}
	for i, file := range checked {
		if i >= len(files) || file.ID != files[i].ID || file.Hash != files[i].Hash || file.Size != files[i].Size {
			writeError(w, 409, "Состав файлов изменился. Подготовьте новый предпросмотр")
			return
		}
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	status := map[string]string{"document": "draft", "idea": "inbox", "task": "planned"}[preview.Type]
	_, err = tx.ExecContext(ctx, `INSERT INTO records(id,workspace_id,type,title,description,status,author_id,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, id, preview.WorkspaceID, preview.Type, preview.Title, preview.Body, status, owner, owner, now, now)
	if err != nil {
		writeError(w, 500, "Не удалось создать командную копию")
		return
	}
	for i, file := range checked {
		fileID, ok := newPersonalID(w)
		if !ok {
			return
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO record_attachments(id,record_id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, fileID, id, owner, file.Name, copied[i], file.ContentType, file.Size, file.Hash, now); err != nil {
			writeError(w, 500, "Не удалось сохранить копии файлов")
			return
		}
	}
	activityContext := context.WithValue(ctx, workspaceContextKey, workspaceAccess{ID: preview.WorkspaceID, Kind: "team"})
	if err = writeActivity(activityContext, tx, owner, preview.Type, id, "created", "", map[string]any{"title": preview.Title, "status": status, "ownerId": owner}); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if _, err = tx.ExecContext(ctx, `UPDATE personal_publications SET record_id=? WHERE id=? AND owner_id=?`, id, preview.ID, owner); err != nil {
		writeError(w, 500, "Не удалось сохранить результат публикации")
		return
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить публикацию. Повторите подтверждение")
		return
	}
	committed = true
	preview.RecordID = id
	result(201)
}
