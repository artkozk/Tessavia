package app

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// Components store a declarative subtree only. Runtime inputs live in the host
// page's existing private tables and are deliberately absent from this model.
type PageAppComponent struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Definition  *PageAppDefinition `json:"definition,omitempty"`
}

type PageAppComponentInsertion struct {
	PageAppState
	RootBlockID     string `json:"rootBlockId"`
	AlreadyInserted bool   `json:"alreadyInserted"`
	PageName        string `json:"pageName"`
}

func componentRequestHash(value any) string {
	raw, _ := json.Marshal(value)
	return fmt.Sprintf("%x", sha256.Sum256(raw))
}

func (s *Server) handlePageAppComponents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,name,description FROM page_app_components WHERE owner_id=? ORDER BY created_at DESC,id LIMIT 200`, currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось загрузить свои блоки")
		return
	}
	defer rows.Close()
	items := []PageAppComponent{}
	for rows.Next() {
		var item PageAppComponent
		if err = rows.Scan(&item.ID, &item.Name, &item.Description); err != nil {
			writeError(w, 500, "Не удалось прочитать свои блоки")
			return
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось прочитать свои блоки")
		return
	}
	writeJSON(w, 200, items)
}

func (s *Server) readPageAppComponent(r *http.Request, id string) (PageAppComponent, error) {
	var item PageAppComponent
	var raw string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT id,name,description,definition_json FROM page_app_components WHERE id=? AND owner_id=?`, id, currentUser(r).ID).Scan(&item.ID, &item.Name, &item.Description, &raw)
	if err == nil {
		err = json.Unmarshal([]byte(raw), &item.Definition)
	}
	return item, err
}

func (s *Server) handleGetPageAppComponent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	item, err := s.readPageAppComponent(r, r.PathValue("id"))
	if err != nil {
		writeError(w, 404, "Свой блок не найден")
		return
	}
	writeJSON(w, 200, item)
}

// Extract before validating: an unrelated, unfinished block elsewhere in the
// editor must not prevent saving a complete group. External behavior references
// are rejected explicitly, rather than silently binding to another host page.
func extractPageComponent(def PageAppDefinition, root string) (PageAppDefinition, error) {
	if def.Version != 1 || len(def.Blocks) > 40 || len(def.Collections) != 0 {
		return PageAppDefinition{}, errors.New("Выберите блоки текущей страницы, без внешних схем")
	}
	ids := map[string]bool{}
	for _, b := range def.Blocks {
		if !pageAppID.MatchString(b.ID) || ids[b.ID] {
			return PageAppDefinition{}, errors.New("У блоков должны быть разные постоянные ключи")
		}
		ids[b.ID] = true
	}
	if !ids[root] {
		return PageAppDefinition{}, errors.New("Выбранный блок не найден")
	}
	included := map[string]bool{root: true}
	for changed := true; changed; {
		changed = false
		for _, b := range def.Blocks {
			if b.ParentID != "" && included[b.ParentID] && !included[b.ID] {
				included[b.ID] = true
				changed = true
			}
		}
	}
	out := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}
	for _, b := range def.Blocks {
		if !included[b.ID] {
			continue
		}
		if b.ID == root {
			b.ParentID = ""
		}
		if b.Source != "" && !included[b.Source] {
			if b.Kind == "progress" || b.Kind == "button" {
				return out, fmt.Errorf("Блок «%s» связан с блоком вне выбранной группы. Перенесите их в одну группу и сохраните её целиком", b.Title)
			}
			b.Source = "" // An inactive type-switch setting is not a dependency.
		}
		for _, condition := range visibilityLeaves(b.Visibility) {
			if !included[condition.Source] {
				return out, fmt.Errorf("Условие блока «%s» зависит от отметок вне группы. Включите источник отметок в ту же группу", b.Title)
			}
		}
		out.Blocks = append(out.Blocks, b)
	}
	return out, validatePageApp(&out)
}

func (s *Server) handleCreatePageAppComponent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input struct {
		Name            string            `json:"name"`
		Description     string            `json:"description"`
		RootBlockID     string            `json:"rootBlockId"`
		ClientRequestID string            `json:"clientRequestId"`
		Definition      PageAppDefinition `json:"definition"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name, input.Description = strings.TrimSpace(input.Name), strings.TrimSpace(input.Description)
	if !pageAppID.MatchString(input.ClientRequestID) || len(input.ClientRequestID) < 16 {
		writeError(w, 400, "Не удалось определить запрос. Откройте сохранение блока заново")
		return
	}
	if err := validInterfacePresetText(input.Name, input.Description, "private"); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	hash := componentRequestHash(struct {
		Workspace string
		Input     any
	}{currentWorkspace(r).ID, input})
	var existing, oldHash string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT id,request_hash FROM page_app_components WHERE owner_id=? AND request_id=?`, currentUser(r).ID, input.ClientRequestID).Scan(&existing, &oldHash)
	if err == nil {
		if oldHash != hash {
			writeError(w, 409, "Этот запрос уже сохранил другую версию блока. Откройте сохранение заново")
			return
		}
		item, readErr := s.readPageAppComponent(r, existing)
		if readErr != nil {
			writeError(w, 500, "Не удалось прочитать сохранённый блок")
			return
		}
		writeJSON(w, 201, item)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось проверить сохранение блока")
		return
	}
	definition, err := extractPageComponent(input.Definition, input.RootBlockID)
	if err == nil {
		err = s.snapshotPageAppCollections(r, &definition)
	}
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	raw, _ := json.Marshal(definition)
	if len(raw) > 2*1024*1024 {
		writeError(w, 400, "Структура блока больше 2 МБ. Разделите её на несколько блоков")
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, 500, "Не удалось создать свой блок")
		return
	}
	result, err := s.store.db.ExecContext(r.Context(), `INSERT INTO page_app_components(id,owner_id,name,description,definition_json,request_id,request_hash,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM page_app_components WHERE owner_id=?)<200 ON CONFLICT(owner_id,request_id) DO NOTHING`, id, currentUser(r).ID, input.Name, input.Description, string(raw), input.ClientRequestID, hash, nowText(), currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить свой блок")
		return
	}
	if n, _ := result.RowsAffected(); n != 1 {
		// A parallel retry may have won after our first lookup.
		if err = s.store.db.QueryRowContext(r.Context(), `SELECT id,request_hash FROM page_app_components WHERE owner_id=? AND request_id=?`, currentUser(r).ID, input.ClientRequestID).Scan(&existing, &oldHash); err == nil && oldHash == hash {
			item, _ := s.readPageAppComponent(r, existing)
			writeJSON(w, 201, item)
			return
		}
		writeError(w, 409, "В личной библиотеке уже 200 блоков или этот запрос изменился")
		return
	}
	writeJSON(w, 201, PageAppComponent{ID: id, Name: input.Name, Description: input.Description, Definition: &definition})
}

func remapPageComponent(def *PageAppDefinition, parent string) (string, error) {
	mapping := map[string]string{}
	for _, b := range def.Blocks {
		id, err := newID()
		if err != nil {
			return "", err
		}
		mapping[b.ID] = id
	}
	root := ""
	for i := range def.Blocks {
		b := &def.Blocks[i]
		b.ID = mapping[b.ID]
		if b.ParentID == "" {
			if root != "" {
				return "", errors.New("Свой блок должен иметь один корневой элемент")
			}
			root, b.ParentID = b.ID, parent
		} else {
			b.ParentID = mapping[b.ParentID]
		}
		if b.Source != "" {
			b.Source = mapping[b.Source]
		}
		for _, condition := range visibilityLeaves(b.Visibility) {
			condition.Source = mapping[condition.Source]
		}
	}
	if root == "" {
		return "", errors.New("В своём блоке нет корневого элемента")
	}
	return root, nil
}

func (s *Server) handleInsertPageAppComponent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	if !s.pageAppExists(r) {
		writeError(w, 404, "Страница не найдена")
		return
	}
	var input struct {
		ComponentID      string            `json:"componentId"`
		ClientRequestID  string            `json:"clientRequestId"`
		ParentID         string            `json:"parentId"`
		PageName         string            `json:"pageName"`
		ExpectedRevision int               `json:"expectedRevision"`
		Definition       PageAppDefinition `json:"definition"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.PageName = strings.TrimSpace(input.PageName)
	if !pageAppID.MatchString(input.ClientRequestID) || len(input.ClientRequestID) < 16 || input.PageName == "" || len([]rune(input.PageName)) > 80 || input.ExpectedRevision < 0 {
		writeError(w, 400, "Проверьте название страницы и повторите вставку блока")
		return
	}
	hash := componentRequestHash(struct {
		Workspace, Page string
		Input           any
	}{currentWorkspace(r).ID, r.PathValue("id"), input})
	var oldHash, oldPage, root string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT request_hash,page_id,root_block_id FROM page_app_component_insertions WHERE owner_id=? AND request_id=?`, currentUser(r).ID, input.ClientRequestID).Scan(&oldHash, &oldPage, &root)
	if err == nil {
		if oldHash != hash || oldPage != r.PathValue("id") {
			writeError(w, 409, "Этот запрос уже вставил другую версию. Откройте библиотеку заново")
			return
		}
		s.writePageComponentInsertion(w, r, root, true)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось проверить вставку блока")
		return
	}
	component, err := s.readPageAppComponent(r, input.ComponentID)
	if err != nil || component.Definition == nil {
		writeError(w, 404, "Свой блок не найден")
		return
	}
	if len(input.Definition.Collections) != 0 {
		writeError(w, 400, "В черновик нельзя подставлять внешние схемы")
		return
	}
	if err = validatePageApp(&input.Definition); err == nil {
		err = s.validatePageAppSources(r, &input.Definition)
	}
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if input.ParentID != "" {
		found := false
		for _, b := range input.Definition.Blocks {
			if b.ID == input.ParentID && b.Kind == "group" {
				found = true
			}
		}
		if !found {
			writeError(w, 400, "Выберите существующую группу для вставки")
			return
		}
	}
	if err = validatePageApp(component.Definition); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	root, err = remapPageComponent(component.Definition, input.ParentID)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	combined := PageAppDefinition{Version: 1, Blocks: append(input.Definition.Blocks, component.Definition.Blocks...)}
	if err = validatePageApp(&combined); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать вставку блока")
		return
	}
	defer tx.Rollback()
	// Claim the request and revision in the same transaction as the fresh
	// schemas. Conflicts, failed source validation and retries create no orphans.
	now := nowText()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO page_app_component_insertions(owner_id,request_id,request_hash,page_id,component_id,root_block_id,created_at) VALUES(?,?,?,?,?,?,?)`, currentUser(r).ID, input.ClientRequestID, hash, r.PathValue("id"), input.ComponentID, root, now)
	if err != nil {
		// Another copy of the same request can finish between the first lookup
		// and BEGIN. Read its receipt after releasing this transaction; a 409
		// would incorrectly tell the client that no insertion was committed.
		tx.Rollback()
		readErr := s.store.db.QueryRowContext(r.Context(), `SELECT request_hash,page_id,root_block_id FROM page_app_component_insertions WHERE owner_id=? AND request_id=?`, currentUser(r).ID, input.ClientRequestID).Scan(&oldHash, &oldPage, &root)
		if readErr == nil && oldHash == hash && oldPage == r.PathValue("id") {
			s.writePageComponentInsertion(w, r, root, true)
			return
		}
		writeError(w, 409, "Вставка уже выполняется. Повторите тот же запрос")
		return
	}
	if err = s.installPageAppCollections(r.Context(), tx, currentWorkspace(r).ID, currentUser(r).ID, component.Definition, now); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	combined.Blocks = append(input.Definition.Blocks, component.Definition.Blocks...)
	raw, _ := json.Marshal(combined)
	var changed sql.Result
	if input.ExpectedRevision == 0 {
		changed, err = tx.ExecContext(r.Context(), `INSERT INTO page_app_definitions(page_id,definition_json,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(page_id) DO NOTHING`, r.PathValue("id"), string(raw), now)
	} else {
		changed, err = tx.ExecContext(r.Context(), `UPDATE page_app_definitions SET definition_json=?,revision=revision+1,updated_at=? WHERE page_id=? AND revision=?`, string(raw), now, r.PathValue("id"), input.ExpectedRevision)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить вставленный блок")
		return
	}
	if n, _ := changed.RowsAffected(); n != 1 {
		writeError(w, 409, "Страница уже изменена. Черновик сохранён на устройстве; откройте актуальную страницу перед вставкой")
		return
	}
	_, err = tx.ExecContext(r.Context(), `UPDATE workspace_pages SET name=?,updated_at=? WHERE id=? AND workspace_id=?`, input.PageName, now, r.PathValue("id"), currentWorkspace(r).ID)
	if err == nil {
		err = writeActivity(r.Context(), tx, currentUser(r).ID, "workspace_page", r.PathValue("id"), "component_inserted", "", map[string]any{"componentId": input.ComponentID, "revision": input.ExpectedRevision + 1})
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось завершить вставку блока")
		return
	}
	s.writePageComponentInsertion(w, r, root, false)
}

func (s *Server) writePageComponentInsertion(w http.ResponseWriter, r *http.Request, root string, repeated bool) {
	state, err := s.readPageApp(r)
	if err != nil {
		writeError(w, 500, "Блок сохранён, но не удалось перечитать страницу. Повторите тот же запрос")
		return
	}
	var name string
	if err = s.store.db.QueryRowContext(r.Context(), `SELECT name FROM workspace_pages WHERE id=? AND workspace_id=?`, r.PathValue("id"), currentWorkspace(r).ID).Scan(&name); err != nil {
		writeError(w, 500, "Блок сохранён, но не удалось перечитать название страницы. Повторите тот же запрос")
		return
	}
	writeJSON(w, 200, PageAppComponentInsertion{PageAppState: state, RootBlockID: root, AlreadyInserted: repeated, PageName: name})
}
