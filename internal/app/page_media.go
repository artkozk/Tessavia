package app

import (
	"bytes"
	"context"
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
	"strings"
	"unicode/utf8"
)

type PageMediaAttachment struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	ContentType string  `json:"contentType"`
	Size        int64   `json:"size"`
	UploaderID  int64   `json:"uploaderId"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	RemovedAt   *string `json:"removedAt"`
	Preview     string  `json:"preview"`
	CanManage   bool    `json:"canManage"`
}

func attachmentPreviewKind(kind string) string {
	if noteImageType(kind) {
		return "image"
	}
	if kind == "video/mp4" || kind == "video/webm" {
		return "video"
	}
	return ""
}

func pageMediaBlockExists(ctx context.Context, db personalQueryer, workspace, page, block string) bool {
	var raw string
	if db.QueryRowContext(ctx, `SELECT d.definition_json FROM page_app_definitions d JOIN workspace_pages p ON p.id=d.page_id WHERE p.id=? AND p.workspace_id=? AND p.archived_at IS NULL`, page, workspace).Scan(&raw) != nil {
		return false
	}
	var definition PageAppDefinition
	if json.Unmarshal([]byte(raw), &definition) != nil {
		return false
	}
	blocks := map[string]PageAppBlock{}
	for _, item := range definition.Blocks {
		blocks[item.ID] = item
	}
	item, ok := blocks[block]
	if !ok || item.Kind != "media" {
		return false
	}
	seen := map[string]bool{}
	for {
		if item.Hidden || seen[item.ID] {
			return false
		}
		seen[item.ID] = true
		if item.ParentID == "" {
			return true
		}
		item, ok = blocks[item.ParentID]
		if !ok {
			return false
		}
	}
}

const pageMediaSelect = `SELECT id,original_name,content_type,size_bytes,uploader_id,created_at,updated_at,removed_at FROM page_media_attachments WHERE page_id=? AND block_id=?`

// Old attachment URLs and lists follow the same archive visibility as variants.
const pageMediaVisibleVariant = ` AND (? IN ('owner','admin') OR NOT EXISTS (
 SELECT 1 FROM media_versions mv JOIN media_variants v ON v.id=mv.variant_id
 WHERE mv.attachment_kind='page' AND mv.attachment_id=page_media_attachments.id
 AND v.archived=1 AND v.created_by<>?))`

func scanPageMedia(row recordScanner, user int64, role string) (PageMediaAttachment, error) {
	var item PageMediaAttachment
	err := row.Scan(&item.ID, &item.Name, &item.ContentType, &item.Size, &item.UploaderID, &item.CreatedAt, &item.UpdatedAt, &item.RemovedAt)
	item.Preview = attachmentPreviewKind(item.ContentType)
	item.CanManage = item.UploaderID == user || role == "owner" || role == "admin"
	return item, err
}

func (s *Server) pageMediaAccess(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("Cache-Control", "private, no-store")
	if !pageMediaBlockExists(r.Context(), s.store.db, currentWorkspace(r).ID, r.PathValue("id"), r.PathValue("blockId")) {
		writeError(w, 404, "Медиаблок не найден в этом пространстве")
		return false
	}
	return true
}

func (s *Server) handlePageMedia(w http.ResponseWriter, r *http.Request) {
	if !s.pageMediaAccess(w, r) {
		return
	}
	if r.Method == http.MethodPost {
		s.uploadPageMedia(w, r)
		return
	}
	rows, err := s.store.db.QueryContext(r.Context(), pageMediaSelect+pageMediaVisibleVariant+` ORDER BY created_at,id`, r.PathValue("id"), r.PathValue("blockId"), currentWorkspace(r).Role, currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать файлы")
		return
	}
	defer rows.Close()
	items := []PageMediaAttachment{}
	for rows.Next() {
		item, err := scanPageMedia(rows, currentUser(r).ID, currentWorkspace(r).Role)
		if err != nil {
			writeError(w, 500, "Не удалось прочитать файлы")
			return
		}
		// Only the uploader and administrators see the recovery list.
		if item.RemovedAt == nil || item.CanManage {
			items = append(items, item)
		}
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось прочитать файлы")
		return
	}
	writeJSON(w, 200, items)
}

func (s *Server) uploadPageMedia(w http.ResponseWriter, r *http.Request) {
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
	if !allowedAttachment(name, kind) && !(ext == ".gif" && kind == "image/gif") && !((ext == ".heic" || ext == ".heif") && kind == "application/octet-stream") {
		writeError(w, 400, "Этот тип файла не разрешён")
		return
	}
	dir := filepath.Join(s.config.UploadPath, "page-media")
	if os.MkdirAll(dir, 0o750) != nil {
		writeError(w, 500, "Не удалось подготовить хранилище")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	stored := id + ".bin"
	final := filepath.Join(dir, stored)
	temp := final + ".tmp"
	target, err := os.OpenFile(temp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить файл")
		return
	}
	defer os.Remove(temp)
	hash := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(target, hash), io.LimitReader(io.MultiReader(bytes.NewReader(prefix), file), maxAttachmentBytes+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil {
		writeError(w, 500, "Не удалось прочитать файл. Повторите отправку")
		return
	}
	if size < 1 || size > maxAttachmentBytes {
		writeError(w, 413, "Файл должен содержать от 1 байта до 15 МБ")
		return
	}
	digest := hex.EncodeToString(hash.Sum(nil))
	page, block, user, workspace := r.PathValue("id"), r.PathValue("blockId"), currentUser(r).ID, currentWorkspace(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось записать файл")
		return
	}
	defer tx.Rollback()
	if !batchMember(r.Context(), tx, workspace.ID, user) {
		writeError(w, 403, "Пространство больше недоступно")
		return
	}
	if !pageMediaBlockExists(r.Context(), tx, workspace.ID, page, block) {
		writeError(w, 404, "Медиаблок больше недоступен")
		return
	}
	old, readErr := scanPageMedia(tx.QueryRowContext(r.Context(), pageMediaSelect+` AND uploader_id=? AND request_key=?`, page, block, user, key), user, workspace.Role)
	if readErr == nil {
		var previousHash string
		if tx.QueryRowContext(r.Context(), `SELECT sha256 FROM page_media_attachments WHERE id=?`, old.ID).Scan(&previousHash) != nil {
			writeError(w, 500, "Не удалось проверить повторную отправку")
			return
		}
		if previousHash != digest || old.Name != name || old.ContentType != kind || old.Size != size {
			writeError(w, 409, "Ключ отправки уже использован для другого файла")
			return
		}
		writeJSON(w, 200, old)
		return
	}
	if !errors.Is(readErr, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось проверить отправку")
		return
	}
	var total int
	if tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM page_media_attachments WHERE page_id=? AND block_id=? AND removed_at IS NULL`, page, block).Scan(&total) != nil {
		writeError(w, 500, "Не удалось проверить список файлов")
		return
	}
	if total >= 200 {
		writeError(w, 409, "В блоке уже 200 файлов. Уберите ненужные в архив или добавьте ещё один медиаблок")
		return
	}
	if os.Rename(temp, final) != nil {
		writeError(w, 500, "Не удалось завершить загрузку")
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(final)
		}
	}()
	now := nowText()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO page_media_attachments(id,page_id,block_id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,request_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, id, page, block, user, name, stored, kind, size, digest, key, now, now)
	if err != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить запись файла")
		return
	}
	committed = true
	writeJSON(w, 201, PageMediaAttachment{ID: id, Name: name, ContentType: kind, Size: size, UploaderID: user, CreatedAt: now, UpdatedAt: now, Preview: attachmentPreviewKind(kind), CanManage: true})
}

func (s *Server) handlePageMediaState(w http.ResponseWriter, r *http.Request) {
	if !s.pageMediaAccess(w, r) {
		return
	}
	var input struct {
		Removed           *bool  `json:"removed"`
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Removed == nil || input.ExpectedUpdatedAt == "" {
		writeError(w, 400, "Укажите действие и версию файла")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось изменить файл")
		return
	}
	defer tx.Rollback()
	page, block, workspace := r.PathValue("id"), r.PathValue("blockId"), currentWorkspace(r)
	if !batchMember(r.Context(), tx, workspace.ID, currentUser(r).ID) || tx.QueryRowContext(r.Context(), `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'`, workspace.ID, currentUser(r).ID).Scan(&workspace.Role) != nil {
		writeError(w, 403, "Пространство больше недоступно")
		return
	}
	if !pageMediaBlockExists(r.Context(), tx, workspace.ID, page, block) {
		writeError(w, 404, "Медиаблок больше недоступен")
		return
	}
	item, err := scanPageMedia(tx.QueryRowContext(r.Context(), pageMediaSelect+pageMediaVisibleVariant+` AND id=?`, page, block, workspace.Role, currentUser(r).ID, r.PathValue("attachment")), currentUser(r).ID, workspace.Role)
	if err != nil {
		writeError(w, 404, "Файл не найден")
		return
	}
	if !item.CanManage {
		writeError(w, 403, "Изменять файл может его автор или администратор")
		return
	}
	if item.UpdatedAt != input.ExpectedUpdatedAt {
		writeError(w, 409, "Файл уже изменился. Обновите список")
		return
	}
	if (item.RemovedAt != nil) == *input.Removed {
		writeJSON(w, 200, item)
		return
	}
	if !*input.Removed {
		var count int
		if tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM page_media_attachments WHERE page_id=? AND block_id=? AND removed_at IS NULL`, page, block).Scan(&count) != nil || count >= 200 {
			writeError(w, 409, "В блоке нет места для восстановления. Сначала уберите другой файл")
			return
		}
	}
	now := nowText()
	var removed *string
	if *input.Removed {
		removed = &now
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE page_media_attachments SET removed_at=?,updated_at=? WHERE id=?`, removed, now, item.ID); err != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось изменить файл")
		return
	}
	item.UpdatedAt = now
	item.RemovedAt = removed
	writeJSON(w, 200, item)
}

// Serve only authenticated, scoped bytes. Unknown formats always download;
// browser media uses sniffed raster/video types and supports Range requests.
func servePrivateMediaFile(w http.ResponseWriter, r *http.Request, path, name, kind string, preview bool) {
	file, err := os.Open(path)
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
	disposition, contentType := "attachment", "application/octet-stream"
	if preview && attachmentPreviewKind(kind) != "" {
		disposition, contentType = "inline", kind
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": name}))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeContent(w, r, name, info.ModTime(), file)
}

func (s *Server) handlePageMediaFile(w http.ResponseWriter, r *http.Request) {
	// Images/video cannot send a workspace header. Resolve their explicit URL
	// scope through the same membership checks instead of using another active team.
	requested := strings.TrimSpace(r.URL.Query().Get("workspaceId"))
	if requested == "" {
		writeError(w, 400, "Не указано пространство файла")
		return
	}
	access, err := s.resolveWorkspaceAccess(r.Context(), currentUser(r).ID, requested)
	if err != nil {
		writeError(w, 404, "Файл не найден")
		return
	}
	r = r.WithContext(context.WithValue(r.Context(), workspaceContextKey, access))
	if !s.pageMediaAccess(w, r) {
		return
	}
	item, err := scanPageMedia(s.store.db.QueryRowContext(r.Context(), pageMediaSelect+pageMediaVisibleVariant+` AND id=?`, r.PathValue("id"), r.PathValue("blockId"), currentWorkspace(r).Role, currentUser(r).ID, r.PathValue("attachment")), currentUser(r).ID, currentWorkspace(r).Role)
	if err != nil || (item.RemovedAt != nil && !item.CanManage) {
		writeError(w, 404, "Файл не найден")
		return
	}
	var stored string
	if s.store.db.QueryRowContext(r.Context(), `SELECT stored_name FROM page_media_attachments WHERE id=?`, item.ID).Scan(&stored) != nil || filepath.Base(stored) != stored || strings.ContainsAny(stored, "/\\") {
		writeError(w, 404, "Файл не найден")
		return
	}
	servePrivateMediaFile(w, r, filepath.Join(s.config.UploadPath, "page-media", stored), item.Name, item.ContentType, r.URL.Query().Get("download") != "1")
}
