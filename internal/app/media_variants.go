package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

type mediaVariantError struct {
	status  int
	message string
}

func (e mediaVariantError) Error() string         { return e.message }
func mediaError(status int, message string) error { return mediaVariantError{status, message} }
func writeMediaError(w http.ResponseWriter, err error) {
	var value mediaVariantError
	if errors.As(err, &value) {
		writeError(w, value.status, value.message)
		return
	}
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Материал не найден в этом пространстве")
		return
	}
	writeError(w, 500, "Не удалось прочитать или сохранить историю материала")
}

type mediaVariantContext struct {
	kind, target, block, workspace, role, base string
	user                                       int64
	writable                                   bool
}
type mediaVariantFile struct {
	id, name, kind, stored, created, nameBy string
	size, uploader                          int64
	removed, available, manageable          bool
}
type MediaVersion struct {
	ID            string `json:"id"`
	AttachmentID  string `json:"attachmentId"`
	Version       int    `json:"version"`
	Name          string `json:"name"`
	ContentType   string `json:"contentType"`
	Size          int64  `json:"size"`
	Preview       string `json:"preview"`
	Note          string `json:"note"`
	CreatedAt     string `json:"createdAt"`
	CreatedBy     int64  `json:"createdBy"`
	CreatedByName string `json:"createdByName"`
	FileURL       string `json:"fileUrl"`
	Available     bool   `json:"available"`
	Removed       bool   `json:"removed"`
}
type MediaVariant struct {
	ID                string         `json:"id"`
	Name              string         `json:"name"`
	Revision          int64          `json:"revision"`
	Archived          bool           `json:"archived"`
	SelectedVersionID string         `json:"selectedVersionId"`
	CanManage         bool           `json:"canManage"`
	CreatedBy         int64          `json:"createdBy"`
	CreatedAt         string         `json:"createdAt"`
	Versions          []MediaVersion `json:"versions"`
}
type mediaVariantInput struct {
	RequestKey        string  `json:"requestKey"`
	AttachmentID      string  `json:"attachmentId,omitempty"`
	ExpectedRevision  int64   `json:"expectedRevision"`
	Name              *string `json:"name,omitempty"`
	Note              string  `json:"note,omitempty"`
	Archived          *bool   `json:"archived,omitempty"`
	SelectedVersionID *string `json:"selectedVersionId,omitempty"`
}

func (s *Server) registerMediaVariantRoutes() {
	for kind, base := range map[string]string{"record": "/api/records/{id}/media-variants", "note": "/api/personal/notes/{id}/media-variants", "page": "/api/workspace/pages/{id}/app/media/{blockId}/variants"} {
		for _, method := range []string{"GET", "POST"} {
			s.mux.Handle(method+" "+base, s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.handleMediaVariants(w, r, kind) })))
		}
		s.mux.Handle("POST "+base+"/{variantId}/versions", s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.handleMediaVariants(w, r, kind) })))
		s.mux.Handle("PATCH "+base+"/{variantId}", s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.handleMediaVariants(w, r, kind) })))
		s.mux.Handle("GET "+base+"/{variantId}/history", s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.handleMediaVariantHistory(w, r, kind) })))
		s.mux.Handle("GET "+base+"/{variantId}/versions/{versionId}/file", s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.handleMediaVariantFile(w, r, kind) })))
	}
}

func readMediaVariantContext(tx *sql.Tx, r *http.Request, kind string) (mediaVariantContext, error) {
	c := mediaVariantContext{kind: kind, target: r.PathValue("id"), block: r.PathValue("blockId"), workspace: currentWorkspace(r).ID, user: currentUser(r).ID}
	if kind == "note" {
		var archived *string
		if err := tx.QueryRowContext(r.Context(), `SELECT archived_at FROM personal_notes WHERE id=? AND owner_id=?`, c.target, c.user).Scan(&archived); err != nil {
			return c, err
		}
		c.writable = archived == nil
		c.workspace = ""
		c.base = "/api/personal/notes/" + url.PathEscape(c.target) + "/media-variants"
		return c, nil
	}
	if requested := strings.TrimSpace(r.URL.Query().Get("workspaceId")); requested != "" {
		c.workspace = requested
	}
	if !batchMember(r.Context(), tx, c.workspace, c.user) {
		return c, mediaError(403, "Пространство больше недоступно")
	}
	if err := tx.QueryRowContext(r.Context(), `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'`, c.workspace, c.user).Scan(&c.role); err != nil {
		return c, err
	}
	if kind == "record" {
		var owner, author int64
		var policy, status string
		if err := tx.QueryRowContext(r.Context(), `SELECT owner_id,author_id,edit_policy,status FROM records WHERE id=? AND workspace_id=?`, c.target, c.workspace).Scan(&owner, &author, &policy, &status); err != nil {
			return c, err
		}
		c.writable = status != "archived" && (policy != "owner_only" || owner == c.user || author == c.user)
		c.base = "/api/records/" + url.PathEscape(c.target) + "/media-variants"
		return c, nil
	}
	var raw string
	var archived *string
	if err := tx.QueryRowContext(r.Context(), `SELECT d.definition_json,p.archived_at FROM workspace_pages p JOIN page_app_definitions d ON d.page_id=p.id WHERE p.id=? AND p.workspace_id=?`, c.target, c.workspace).Scan(&raw, &archived); err != nil {
		return c, err
	}
	var definition PageAppDefinition
	if json.Unmarshal([]byte(raw), &definition) != nil {
		return c, mediaError(404, "Медиаблок недоступен")
	}
	exists := false
	for _, block := range definition.Blocks {
		if block.ID == c.block && block.Kind == "media" {
			exists = true
		}
	}
	if !exists {
		return c, mediaError(404, "Медиаблок недоступен")
	}
	c.writable = archived == nil && pageMediaBlockExists(r.Context(), tx, c.workspace, c.target, c.block)
	if !c.writable && c.role != "owner" && c.role != "admin" {
		return c, mediaError(404, "Медиаблок недоступен")
	}
	c.base = "/api/workspace/pages/" + url.PathEscape(c.target) + "/app/media/" + url.PathEscape(c.block) + "/variants"
	return c, nil
}

func readMediaVariantFiles(tx *sql.Tx, r *http.Request, c mediaVariantContext) (map[string]mediaVariantFile, error) {
	var query string
	args := []any{c.target}
	switch c.kind {
	case "record":
		query = `SELECT a.id,a.original_name,a.content_type,a.stored_name,a.size_bytes,a.uploader_id,a.created_at,u.username,0 FROM record_attachments a JOIN users u ON u.id=a.uploader_id WHERE a.record_id=? ORDER BY a.created_at,a.id`
	case "note":
		query = `SELECT a.id,a.original_name,a.content_type,a.stored_name,a.size_bytes,n.owner_id,a.created_at,u.username,a.removed_at IS NOT NULL FROM personal_note_attachments a JOIN personal_notes n ON n.id=a.note_id JOIN users u ON u.id=n.owner_id WHERE a.note_id=? ORDER BY a.created_at,a.id`
	case "page":
		query = `SELECT a.id,a.original_name,a.content_type,a.stored_name,a.size_bytes,a.uploader_id,a.created_at,u.username,a.removed_at IS NOT NULL FROM page_media_attachments a JOIN users u ON u.id=a.uploader_id WHERE a.page_id=? AND a.block_id=? ORDER BY a.created_at,a.id`
		args = append(args, c.block)
	}
	rows, err := tx.QueryContext(r.Context(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]mediaVariantFile{}
	for rows.Next() {
		var f mediaVariantFile
		if err := rows.Scan(&f.id, &f.name, &f.kind, &f.stored, &f.size, &f.uploader, &f.created, &f.nameBy, &f.removed); err != nil {
			return nil, err
		}
		f.manageable = c.writable && (c.kind != "page" || c.role == "owner" || c.role == "admin" || f.uploader == c.user)
		f.available = c.kind != "page" || !f.removed || c.role == "owner" || c.role == "admin" || f.uploader == c.user
		result[f.id] = f
	}
	return result, rows.Err()
}
func variantVersion(c mediaVariantContext, variant string, f mediaVariantFile, ordinal int, note string) MediaVersion {
	v := MediaVersion{ID: "file:" + f.id, AttachmentID: f.id, Version: ordinal, Note: note, CreatedAt: f.created, CreatedBy: f.uploader, CreatedByName: f.nameBy, Available: f.available, Removed: f.removed}
	if !f.available {
		v.Name = "Файл недоступен"
		v.Note = ""
		v.CreatedBy = 0
		v.CreatedByName = ""
		return v
	}
	v.Name, v.ContentType, v.Size, v.Preview = f.name, f.kind, f.size, attachmentPreviewKind(f.kind)
	v.FileURL = c.base + "/" + url.PathEscape(variant) + "/versions/" + url.PathEscape(v.ID) + "/file"
	if c.workspace != "" {
		v.FileURL += "?workspaceId=" + url.QueryEscape(c.workspace)
	}
	return v
}
func mediaVariantCanManage(c mediaVariantContext, v MediaVariant) bool {
	return c.writable && (c.kind != "page" || c.role == "owner" || c.role == "admin" || v.CreatedBy == c.user)
}
func sortMediaVariants(items []MediaVariant) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt == items[j].CreatedAt {
			return items[i].ID < items[j].ID
		}
		return items[i].CreatedAt < items[j].CreatedAt
	})
}
func readMediaVariant(tx *sql.Tx, r *http.Request, c mediaVariantContext, id string, files map[string]mediaVariantFile) (MediaVariant, error) {
	v := MediaVariant{Versions: []MediaVersion{}}
	err := tx.QueryRowContext(r.Context(), `SELECT id,name,revision,archived,selected_version_id,created_by,created_at FROM media_variants WHERE id=? AND context_kind=? AND target_id=? AND block_id=?`, id, c.kind, c.target, c.block).Scan(&v.ID, &v.Name, &v.Revision, &v.Archived, &v.SelectedVersionID, &v.CreatedBy, &v.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) && strings.HasPrefix(id, "legacy:") {
		file, ok := files[strings.TrimPrefix(id, "legacy:")]
		if !ok || !file.available {
			return v, sql.ErrNoRows
		}
		var linked string
		err = tx.QueryRowContext(r.Context(), `SELECT variant_id FROM media_versions WHERE attachment_kind=? AND attachment_id=?`, c.kind, file.id).Scan(&linked)
		if err == nil {
			return v, sql.ErrNoRows
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return v, err
		}
		v.ID, v.Name, v.CreatedBy, v.CreatedAt, v.Archived = id, file.name, file.uploader, file.created, file.removed
		v.CanManage = mediaVariantCanManage(c, v)
		v.Versions = []MediaVersion{variantVersion(c, id, file, 1, "")}
		return v, nil
	}
	if err != nil {
		return v, err
	}
	v.CanManage = mediaVariantCanManage(c, v)
	if c.kind == "page" && v.Archived && !(c.role == "owner" || c.role == "admin" || v.CreatedBy == c.user) {
		return v, sql.ErrNoRows
	}
	rows, err := tx.QueryContext(r.Context(), `SELECT mv.id,mv.attachment_id,mv.ordinal,mv.note,mv.created_by,mv.created_at,u.username FROM media_versions mv JOIN users u ON u.id=mv.created_by WHERE mv.variant_id=? ORDER BY mv.ordinal`, id)
	if err != nil {
		return v, err
	}
	defer rows.Close()
	for rows.Next() {
		var versionID, attachment, note, created, actorName string
		var ordinal int
		var actor int64
		if err := rows.Scan(&versionID, &attachment, &ordinal, &note, &actor, &created, &actorName); err != nil {
			return v, err
		}
		f, ok := files[attachment]
		if !ok {
			f = mediaVariantFile{id: attachment}
		}
		item := variantVersion(c, id, f, ordinal, note)
		item.ID = versionID
		if item.Available {
			item.CreatedBy = actor
			item.CreatedByName = actorName
			item.CreatedAt = created
		}
		v.Versions = append(v.Versions, item)
	}
	return v, rows.Err()
}
func listMediaVariants(tx *sql.Tx, r *http.Request, c mediaVariantContext, files map[string]mediaVariantFile) ([]MediaVariant, error) {
	rows, err := tx.QueryContext(r.Context(), `SELECT id FROM media_variants WHERE context_kind=? AND target_id=? AND block_id=? ORDER BY created_at,id`, c.kind, c.target, c.block)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return nil, err
	}
	linked := map[string]bool{}
	result := []MediaVariant{}
	for _, id := range ids {
		v, err := readMediaVariant(tx, r, c, id, files)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, version := range v.Versions {
			linked[version.AttachmentID] = true
		}
		result = append(result, v)
	}
	// Exclude versions of hidden archived variants as well, without showing their names.
	rows, err = tx.QueryContext(r.Context(), `SELECT mv.attachment_id FROM media_versions mv JOIN media_variants v ON v.id=mv.variant_id WHERE v.context_kind=? AND v.target_id=? AND v.block_id=?`, c.kind, c.target, c.block)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			break
		}
		linked[id] = true
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return nil, err
	}
	for id, f := range files {
		if linked[id] || !f.available {
			continue
		}
		v := MediaVariant{ID: "legacy:" + id, Name: f.name, Archived: f.removed, CreatedBy: f.uploader, CreatedAt: f.created, Versions: []MediaVersion{variantVersion(c, "legacy:"+id, f, 1, "")}}
		v.CanManage = mediaVariantCanManage(c, v)
		result = append(result, v)
	}
	// Stable ordering is important for comparison selection and durable queues.
	sortMediaVariants(result)
	return result, nil
}

func insertMediaVariantEvent(tx *sql.Tx, r *http.Request, c mediaVariantContext, id, action string, revision int64, details any) error {
	raw, err := json.Marshal(details)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO media_variant_events(variant_id,action,revision,actor_id,details_json,created_at) VALUES(?,?,?,?,?,?)`, id, action, revision, c.user, string(raw), nowText())
	return err
}
func materializeMediaVariant(tx *sql.Tx, r *http.Request, c mediaVariantContext, v MediaVariant) error {
	var found int
	err := tx.QueryRowContext(r.Context(), `SELECT 1 FROM media_variants WHERE id=?`, v.ID).Scan(&found)
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO media_variants(id,context_kind,target_id,block_id,name,created_by,created_at,updated_at,revision,archived,selected_version_id) VALUES(?,?,?,?,?,?,?,?,0,?,'')`, v.ID, c.kind, c.target, c.block, v.Name, v.CreatedBy, v.CreatedAt, nowText(), v.Archived)
	if err != nil {
		return err
	}
	first := v.Versions[0]
	_, err = tx.ExecContext(r.Context(), `INSERT INTO media_versions(id,variant_id,attachment_kind,attachment_id,ordinal,note,created_by,created_at) VALUES(?,?,?,?,1,?,?,?)`, first.ID, v.ID, c.kind, first.AttachmentID, first.Note, first.CreatedBy, first.CreatedAt)
	if err != nil {
		return err
	}
	return insertMediaVariantEvent(tx, r, c, v.ID, "imported", 0, map[string]any{"versionId": first.ID})
}

func (s *Server) handleMediaVariants(w http.ResponseWriter, r *http.Request, kind string) {
	w.Header().Set("Cache-Control", "private, no-store")
	var input mediaVariantInput
	if r.Method != "GET" {
		if !decodeJSON(w, r, &input) {
			return
		}
		if !validateCreateRequestKey(w, r, &input.RequestKey) {
			return
		}
		if input.RequestKey == "" {
			writeError(w, 400, "Нужен ключ сохранения")
			return
		}
		input.AttachmentID = strings.TrimSpace(input.AttachmentID)
		input.Note = strings.TrimSpace(input.Note)
		if utf8.RuneCountInString(input.Note) > 2000 {
			writeError(w, 400, "Пометка должна быть не длиннее 2000 символов")
			return
		}
		if input.Name != nil {
			clean := strings.TrimSpace(*input.Name)
			input.Name = &clean
			if clean == "" || utf8.RuneCountInString(clean) > 160 {
				writeError(w, 400, "Укажите название варианта до 160 символов")
				return
			}
		}
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	defer tx.Rollback()
	c, err := readMediaVariantContext(tx, r, kind)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	files, err := readMediaVariantFiles(tx, r, c)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	if r.Method == "GET" {
		items, err := listMediaVariants(tx, r, c, files)
		if err != nil {
			writeMediaError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"items": items, "canCreate": c.writable})
		return
	}
	if !c.writable {
		writeError(w, 403, "Материал доступен только для просмотра. Верните запись из архива или проверьте права")
		return
	}
	value, status, err := mutateMediaVariant(tx, r, c, input, files)
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeMediaError(w, err)
		return
	}
	writeJSON(w, status, value)
}
func mutateMediaVariant(tx *sql.Tx, r *http.Request, c mediaVariantContext, input mediaVariantInput, files map[string]mediaVariantFile) (MediaVariant, int, error) {
	var zero MediaVariant
	id := r.PathValue("variantId")
	action := "patch"
	if r.Method == "POST" {
		action = "version"
		if id == "" {
			action = "create"
			id = "legacy:" + input.AttachmentID
		}
	}
	canonical := input
	canonical.RequestKey = ""
	fingerprint, err := createPayloadHash(struct {
		Action, Variant string
		Input           mediaVariantInput
	}{action, id, canonical})
	if err != nil {
		return zero, 0, err
	}
	var oldHash, oldID string
	err = tx.QueryRowContext(r.Context(), `SELECT payload_hash,variant_id FROM media_variant_requests WHERE owner_id=? AND context_kind=? AND target_id=? AND block_id=? AND request_key=?`, c.user, c.kind, c.target, c.block, input.RequestKey).Scan(&oldHash, &oldID)
	if err == nil {
		if oldHash != fingerprint {
			return zero, 0, mediaError(409, "Ключ сохранения уже использован с другими данными")
		}
		v, err := readMediaVariant(tx, r, c, oldID, files)
		if err == nil && !v.CanManage {
			return zero, 0, mediaError(403, "Нет прав на изменение варианта")
		}
		return v, 200, err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return zero, 0, err
	}
	v, err := readMediaVariant(tx, r, c, id, files)
	if err != nil {
		return zero, 0, err
	}
	if !v.CanManage {
		return zero, 0, mediaError(403, "Изменить вариант может его автор или администратор")
	}
	if input.ExpectedRevision != v.Revision {
		return zero, 0, mediaError(409, "Вариант уже изменён. Обновите историю перед сохранением")
	}
	if action == "create" && (v.Revision != 0 || input.AttachmentID == "" || input.Name == nil || input.Archived != nil || input.SelectedVersionID != nil) {
		return zero, 0, mediaError(400, "Укажите новый файл и название варианта")
	}
	if action == "version" && (input.AttachmentID == "" || input.Name != nil || input.Archived != nil || input.SelectedVersionID != nil || v.Archived) {
		return zero, 0, mediaError(400, "Для новой версии выберите файл действующего варианта")
	}
	if action == "patch" && (input.AttachmentID != "" || input.Note != "" || (input.Name == nil && input.Archived == nil && input.SelectedVersionID == nil)) {
		return zero, 0, mediaError(400, "Выберите изменение названия, архива или выбранной версии")
	}
	if action == "version" && len(v.Versions) >= 100 {
		return zero, 0, mediaError(409, "В варианте уже 100 версий. Создайте новый вариант")
	}
	if action == "version" || action == "create" {
		f, ok := files[input.AttachmentID]
		if !ok || !f.available || f.removed {
			return zero, 0, mediaError(404, "Файл недоступен в этой записи")
		}
		if !f.manageable {
			return zero, 0, mediaError(403, "Нельзя присоединить чужой файл к варианту")
		}
		var linked string
		if err := tx.QueryRowContext(r.Context(), `SELECT variant_id FROM media_versions WHERE attachment_kind=? AND attachment_id=?`, c.kind, f.id).Scan(&linked); err == nil {
			return zero, 0, mediaError(409, "Файл уже относится к варианту")
		} else if !errors.Is(err, sql.ErrNoRows) {
			return zero, 0, err
		}
		if action == "version" && f.id == v.Versions[0].AttachmentID {
			return zero, 0, mediaError(409, "Этот файл уже является первой версией")
		}
	}
	if input.SelectedVersionID != nil && *input.SelectedVersionID != "" {
		found := false
		for _, version := range v.Versions {
			if version.ID == *input.SelectedVersionID && version.Available && !version.Removed {
				found = true
			}
		}
		if !found {
			return zero, 0, mediaError(400, "Выберите доступную версию этого варианта")
		}
	}
	if action == "create" {
		v.Versions[0].Note = input.Note
	}
	// An old archived upload is a one-file virtual variant. Restoring that
	// variant must restore the original attachment too, including after rename.
	// Removed individual versions in a multi-version chain retain their state.
	if input.Archived != nil && !*input.Archived && v.Archived && len(v.Versions) == 1 && v.Versions[0].Removed {
		f := files[v.Versions[0].AttachmentID]
		if !f.manageable {
			return zero, 0, mediaError(403, "Нет прав на восстановление исходного файла")
		}
		var query string
		args := []any{nowText(), f.id, c.target}
		switch c.kind {
		case "note":
			query = `UPDATE personal_note_attachments SET removed_at=NULL,updated_at=? WHERE id=? AND note_id=? AND removed_at IS NOT NULL`
		case "page":
			var count int
			if err := tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM page_media_attachments WHERE page_id=? AND block_id=? AND removed_at IS NULL`, c.target, c.block).Scan(&count); err != nil {
				return zero, 0, err
			}
			if count >= 200 {
				return zero, 0, mediaError(409, "В блоке нет места для восстановления. Сначала уберите другой файл")
			}
			query = `UPDATE page_media_attachments SET removed_at=NULL,updated_at=? WHERE id=? AND page_id=? AND block_id=? AND removed_at IS NOT NULL`
			args = append(args, c.block)
		}
		if query != "" {
			result, err := tx.ExecContext(r.Context(), query, args...)
			if err != nil {
				return zero, 0, err
			}
			changed, err := result.RowsAffected()
			if err != nil || changed != 1 {
				return zero, 0, mediaError(409, "Исходный файл уже изменился. Обновите список")
			}
			f.removed = false
			files[f.id] = f
			v.Versions[0].Removed = false
		}
	}
	if err := materializeMediaVariant(tx, r, c, v); err != nil {
		return zero, 0, err
	}
	v.Revision++
	if action == "create" {
		v.Name = *input.Name
		err = insertMediaVariantEvent(tx, r, c, id, "created", v.Revision, map[string]any{"name": v.Name})
	} else if action == "version" {
		f := files[input.AttachmentID]
		version := variantVersion(c, id, f, len(v.Versions)+1, input.Note)
		version.CreatedBy = c.user
		version.CreatedByName = currentUser(r).Username
		version.CreatedAt = nowText()
		_, err = tx.ExecContext(r.Context(), `INSERT INTO media_versions(id,variant_id,attachment_kind,attachment_id,ordinal,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)`, version.ID, id, c.kind, version.AttachmentID, version.Version, version.Note, version.CreatedBy, version.CreatedAt)
		if err == nil {
			err = insertMediaVariantEvent(tx, r, c, id, "version_added", v.Revision, map[string]any{"versionId": version.ID, "ordinal": version.Version})
		}
		v.Versions = append(v.Versions, version)
	} else {
		if input.Name != nil {
			v.Name = *input.Name
			err = insertMediaVariantEvent(tx, r, c, id, "renamed", v.Revision, map[string]any{"name": v.Name})
		}
		if err == nil && input.Archived != nil {
			v.Archived = *input.Archived
			verb := "archived"
			if !v.Archived {
				verb = "restored"
			}
			err = insertMediaVariantEvent(tx, r, c, id, verb, v.Revision, map[string]any{})
		}
		if err == nil && input.SelectedVersionID != nil {
			v.SelectedVersionID = *input.SelectedVersionID
			err = insertMediaVariantEvent(tx, r, c, id, "selected", v.Revision, map[string]any{"versionId": v.SelectedVersionID})
		}
	}
	if err != nil {
		return zero, 0, err
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE media_variants SET name=?,archived=?,selected_version_id=?,revision=?,updated_at=? WHERE id=? AND revision=?`, v.Name, v.Archived, v.SelectedVersionID, v.Revision, nowText(), v.ID, v.Revision-1)
	if err != nil {
		return zero, 0, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return zero, 0, err
	}
	if changed != 1 {
		return zero, 0, mediaError(409, "Вариант уже изменился")
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO media_variant_requests(owner_id,context_kind,target_id,block_id,request_key,payload_hash,variant_id,created_at) VALUES(?,?,?,?,?,?,?,?)`, c.user, c.kind, c.target, c.block, input.RequestKey, fingerprint, v.ID, nowText())
	if err != nil {
		return zero, 0, err
	}
	status := 200
	if action != "patch" {
		status = 201
	}
	return v, status, nil
}

func (s *Server) handleMediaVariantHistory(w http.ResponseWriter, r *http.Request, kind string) {
	w.Header().Set("Cache-Control", "private, no-store")
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	defer tx.Rollback()
	c, err := readMediaVariantContext(tx, r, kind)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	files, err := readMediaVariantFiles(tx, r, c)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	v, err := readMediaVariant(tx, r, c, r.PathValue("variantId"), files)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	rows, err := tx.QueryContext(r.Context(), `SELECT e.id,e.action,e.revision,e.actor_id,u.username,e.details_json,e.created_at FROM media_variant_events e JOIN users u ON u.id=e.actor_id WHERE e.variant_id=? ORDER BY e.id`, v.ID)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, revision, actor int64
		var action, name, raw, created string
		if err = rows.Scan(&id, &action, &revision, &actor, &name, &raw, &created); err != nil {
			break
		}
		items = append(items, map[string]any{"id": id, "action": action, "revision": revision, "actorId": actor, "actorName": name, "details": json.RawMessage(raw), "createdAt": created})
	}
	if err == nil {
		err = rows.Err()
	}
	if err != nil {
		writeMediaError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *Server) handleMediaVariantFile(w http.ResponseWriter, r *http.Request, kind string) {
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	defer tx.Rollback()
	c, err := readMediaVariantContext(tx, r, kind)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	files, err := readMediaVariantFiles(tx, r, c)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	v, err := readMediaVariant(tx, r, c, r.PathValue("variantId"), files)
	if err != nil {
		writeMediaError(w, err)
		return
	}
	var file mediaVariantFile
	found := false
	for _, version := range v.Versions {
		if version.ID == r.PathValue("versionId") && version.Available {
			file = files[version.AttachmentID]
			found = true
			break
		}
	}
	if !found || filepath.Base(file.stored) != file.stored || strings.ContainsAny(file.stored, "/\\") {
		writeError(w, 404, "Файл недоступен")
		return
	}
	dir := s.config.UploadPath
	if kind == "note" {
		dir = filepath.Join(dir, "personal-notes")
	} else if kind == "page" {
		dir = filepath.Join(dir, "page-media")
	}
	// Authorization and immutable path are captured before releasing the DB;
	// do not hold its only connection while streaming a large file.
	if err = tx.Commit(); err != nil {
		writeMediaError(w, err)
		return
	}
	servePrivateMediaFile(w, r, filepath.Join(dir, file.stored), file.name, file.kind, r.URL.Query().Get("download") != "1")
}

func recordUploadScope(ctx context.Context, tx *sql.Tx, workspace, record string, user int64) error {
	if !batchMember(ctx, tx, workspace, user) {
		return mediaError(403, "Пространство больше недоступно")
	}
	var owner, author int64
	var policy, status string
	if err := tx.QueryRowContext(ctx, `SELECT owner_id,author_id,edit_policy,status FROM records WHERE id=? AND workspace_id=?`, record, workspace).Scan(&owner, &author, &policy, &status); err != nil {
		return err
	}
	if status == "archived" || (policy == "owner_only" && owner != user && author != user) {
		return mediaError(403, "Карточка недоступна для изменения")
	}
	return nil
}
