package app

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
)

type PageBlockTrashItem struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	BlockCount int    `json:"blockCount"`
	RemovedAt  string `json:"removedAt"`
	RemovedBy  string `json:"removedBy"`
}

// Only structure belongs in history. Existing marks and sheet values retain
// their original page/block/item/user keys throughout removal and restoration.
type pageBlockTrashSnapshot struct {
	Version     int            `json:"version"`
	RootBlockID string         `json:"rootBlockId"`
	Blocks      []PageAppBlock `json:"blocks"`
	Positions   []int          `json:"positions"`
}
type pageBlockTrashEntry struct {
	PageBlockTrashItem
	Snapshot pageBlockTrashSnapshot
}
type pageBlockTrashInput struct {
	BlockID          string            `json:"blockId,omitempty"`
	Definition       PageAppDefinition `json:"definition"`
	PageName         string            `json:"pageName"`
	ExpectedRevision int               `json:"expectedRevision"`
	ClientRequestID  string            `json:"clientRequestId"`
}
type PageBlockTrashResult struct {
	PageAppState
	PageName       string `json:"pageName"`
	TrashID        string `json:"trashId"`
	RootBlockID    string `json:"rootBlockId"`
	AlreadyApplied bool   `json:"alreadyApplied"`
	Operation      string `json:"operation"`
}

func decodePublicActivityDetails(action, raw string) map[string]any {
	details := map[string]any{}
	if json.Unmarshal([]byte(raw), &details) != nil {
		if action == "app_blocks_removed" || action == "app_blocks_restored" {
			return map[string]any{}
		}
		return map[string]any{"raw": raw}
	}
	if action != "app_blocks_removed" && action != "app_blocks_restored" {
		return details
	}
	// General history, sync and profiles must not ship entire deleted trees.
	summary := map[string]any{}
	for _, key := range []string{"title", "blockCount", "revision", "rootBlockId", "trashId"} {
		if value, ok := details[key]; ok {
			summary[key] = value
		}
	}
	return summary
}

const activePageBlockTrashSQL = `a.workspace_id=? AND a.entity_type='workspace_page' AND a.entity_id=? AND a.action='app_blocks_removed' AND NOT EXISTS(SELECT 1 FROM activity_undos undone WHERE undone.activity_id=a.id)`

type PageBlockTrashPage struct {
	Items      []PageBlockTrashItem `json:"items"`
	NextCursor string               `json:"nextCursor"`
}
type pageBlockTrashCursor struct{ Workspace, Page, Before, ID string }

func readPageBlockTrashEntry(ctx context.Context, tx *sql.Tx, workspace, page, id string) (pageBlockTrashEntry, error) {
	var entry pageBlockTrashEntry
	var raw string
	err := tx.QueryRowContext(ctx, `SELECT a.id,a.details_json,a.created_at,u.username FROM activity a JOIN users u ON u.id=a.actor_id WHERE `+activePageBlockTrashSQL+` AND a.id=?`, workspace, page, id).Scan(&entry.ID, &raw, &entry.RemovedAt, &entry.RemovedBy)
	if err != nil {
		return entry, err
	}
	var details struct {
		Title    string                 `json:"title"`
		Snapshot pageBlockTrashSnapshot `json:"snapshot"`
	}
	if err = json.Unmarshal([]byte(raw), &details); err != nil {
		return entry, err
	}
	entry.Title, entry.Snapshot, entry.BlockCount = details.Title, details.Snapshot, len(details.Snapshot.Blocks)
	if entry.Snapshot.Version != 1 || entry.BlockCount == 0 || entry.BlockCount > 40 || len(entry.Snapshot.Positions) != entry.BlockCount {
		return entry, errors.New("Не удалось прочитать сохранённую структуру корзины")
	}
	return entry, nil
}

func (s *Server) handlePageBlockTrash(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !s.pageAppExists(r) {
		writeError(w, 404, "Страница не найдена")
		return
	}
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		s.mutatePageBlockTrash(w, r, false)
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		writeError(w, 500, "Не удалось открыть корзину")
		return
	}
	defer tx.Rollback()
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, e := strconv.Atoi(raw)
		if e != nil || value < 1 || value > 50 {
			writeError(w, 400, "Размер страницы корзины — от 1 до 50 записей")
			return
		}
		limit = value
	}
	cursor := pageBlockTrashCursor{Workspace: currentWorkspace(r).ID, Page: r.PathValue("id")}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		decoded, e := base64.RawURLEncoding.DecodeString(raw)
		if len(raw) > 1024 || e != nil || json.Unmarshal(decoded, &cursor) != nil || cursor.Workspace != currentWorkspace(r).ID || cursor.Page != r.PathValue("id") || cursor.Before == "" || len(cursor.Before) > 64 || !pageAppID.MatchString(cursor.ID) {
			writeError(w, 400, "Курсор корзины устарел или относится к другой странице")
			return
		}
	}
	rows, err := tx.QueryContext(r.Context(), `SELECT a.id,COALESCE(json_extract(a.details_json,'$.title'),''),json_array_length(a.details_json,'$.snapshot.blocks'),a.created_at,u.username FROM activity a JOIN users u ON u.id=a.actor_id WHERE `+activePageBlockTrashSQL+` AND (?='' OR a.created_at<? OR (a.created_at=? AND a.id<?)) ORDER BY a.created_at DESC,a.id DESC LIMIT ?`, cursor.Workspace, cursor.Page, cursor.Before, cursor.Before, cursor.Before, cursor.ID, limit+1)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать корзину")
		return
	}
	defer rows.Close()
	result := PageBlockTrashPage{Items: []PageBlockTrashItem{}}
	for rows.Next() {
		var item PageBlockTrashItem
		if err = rows.Scan(&item.ID, &item.Title, &item.BlockCount, &item.RemovedAt, &item.RemovedBy); err != nil {
			writeError(w, 500, "Не удалось прочитать корзину")
			return
		}
		if len(result.Items) == limit {
			last := result.Items[len(result.Items)-1]
			next, _ := json.Marshal(pageBlockTrashCursor{Workspace: cursor.Workspace, Page: cursor.Page, Before: last.RemovedAt, ID: last.ID})
			result.NextCursor = base64.RawURLEncoding.EncodeToString(next)
			break
		}
		result.Items = append(result.Items, item)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось прочитать корзину")
		return
	}
	writeJSON(w, 200, result)
}
func (s *Server) handleRestorePageBlockTrash(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !s.pageAppExists(r) {
		writeError(w, 404, "Страница не найдена")
		return
	}
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	s.mutatePageBlockTrash(w, r, true)
}

func pageBlockName(block PageAppBlock) string {
	if strings.TrimSpace(block.Title) != "" {
		return block.Title
	}
	return block.ID
}
func splitPageBlockTrash(def PageAppDefinition, root string) (PageAppDefinition, pageBlockTrashSnapshot, error) {
	snapshot := pageBlockTrashSnapshot{Version: 1, RootBlockID: root, Blocks: []PageAppBlock{}, Positions: []int{}}
	included := map[string]bool{}
	for _, b := range def.Blocks {
		if b.ID == root {
			included[root] = true
		}
	}
	if !included[root] {
		return def, snapshot, errors.New("Выбранный блок больше не найден на странице")
	}
	for changed := true; changed; {
		changed = false
		for _, b := range def.Blocks {
			if included[b.ParentID] && !included[b.ID] {
				included[b.ID] = true
				changed = true
			}
		}
	}
	out := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}
	for i, b := range def.Blocks {
		if included[b.ID] {
			snapshot.Blocks = append(snapshot.Blocks, b)
			snapshot.Positions = append(snapshot.Positions, i)
			continue
		}
		if (b.Kind == "progress" || b.Kind == "button") && included[b.Source] {
			return def, snapshot, fmt.Errorf("Блок «%s» использует удаляемый блок. Измените связь или перенесите их в корзину вместе через общую группу", pageBlockName(b))
		}
		for _, leaf := range visibilityLeaves(b.Visibility) {
			if included[leaf.Source] {
				return def, snapshot, fmt.Errorf("Условие показа блока «%s» использует удаляемые отметки. Измените условие или перенесите их вместе через общую группу", pageBlockName(b))
			}
		}
		out.Blocks = append(out.Blocks, b)
	}
	return out, snapshot, nil
}

// Reservation runs inside all page writers' CAS transactions. SQLite examines
// only scoped archived block IDs; Go does not load every historical tree.
func validatePageBlockTrashIDs(ctx context.Context, tx *sql.Tx, workspace, page string, def PageAppDefinition) error {
	var malformed int
	err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM activity a WHERE `+activePageBlockTrashSQL+` AND CASE WHEN json_valid(a.details_json) THEN COALESCE(json_extract(a.details_json,'$.snapshot.version')!=1 OR json_type(a.details_json,'$.snapshot.blocks')!='array' OR json_array_length(a.details_json,'$.snapshot.blocks') NOT BETWEEN 1 AND 40 OR json_type(a.details_json,'$.snapshot.positions')!='array' OR json_array_length(a.details_json,'$.snapshot.positions')!=json_array_length(a.details_json,'$.snapshot.blocks'),1) ELSE 1 END`, workspace, page).Scan(&malformed)
	if err != nil {
		return err
	}
	if malformed > 0 {
		return errors.New("Структура корзины повреждена; сохранение остановлено для защиты данных")
	}
	ids := []string{}
	for _, b := range def.Blocks {
		ids = append(ids, b.ID)
	}
	raw, _ := json.Marshal(ids)
	var title string
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(NULLIF(json_extract(block.value,'$.title'),''),json_extract(block.value,'$.id')) FROM activity a JOIN json_each(a.details_json,'$.snapshot.blocks') block JOIN json_each(?) incoming ON incoming.value=json_extract(block.value,'$.id') WHERE `+activePageBlockTrashSQL+` LIMIT 1`, string(raw), workspace, page).Scan(&title)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return fmt.Errorf("Ключ блока «%s» сохранён в корзине. Восстановите его через корзину, чтобы сохранить отметки и личные числа", title)
}

func restorePageBlockSnapshot(def PageAppDefinition, snapshot pageBlockTrashSnapshot) (PageAppDefinition, error) {
	if len(def.Blocks)+len(snapshot.Blocks) > 40 {
		return def, fmt.Errorf("Для восстановления нужно %d мест, свободно %d из 40. Сначала перенесите другие блоки в корзину", len(snapshot.Blocks), 40-len(def.Blocks))
	}
	ids := map[string]PageAppBlock{}
	for _, b := range def.Blocks {
		ids[b.ID] = b
	}
	for _, b := range snapshot.Blocks {
		if _, ok := ids[b.ID]; ok {
			return def, fmt.Errorf("Ключ восстанавливаемого блока «%s» уже занят на странице", pageBlockName(b))
		}
		ids[b.ID] = b
	}
	for _, b := range snapshot.Blocks {
		if b.ParentID != "" && ids[b.ParentID].Kind != "group" {
			return def, fmt.Errorf("Для блока «%s» сначала восстановите исходную группу (%s)", pageBlockName(b), b.ParentID)
		}
		if b.Kind == "progress" && ids[b.Source].Kind != "tracker" || b.Kind == "button" && ids[b.Source].ID == "" {
			return def, fmt.Errorf("Для блока «%s» сначала восстановите источник или цель перехода (%s)", pageBlockName(b), b.Source)
		}
		for _, leaf := range visibilityLeaves(b.Visibility) {
			if ids[leaf.Source].Kind != "tracker" {
				return def, fmt.Errorf("Для условия блока «%s» сначала восстановите источник отметок (%s)", pageBlockName(b), leaf.Source)
			}
		}
	}
	out := PageAppDefinition{Version: 1, Blocks: append([]PageAppBlock{}, def.Blocks...)}
	order := make([]int, len(snapshot.Blocks))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(i, j int) bool { return snapshot.Positions[order[i]] < snapshot.Positions[order[j]] })
	for _, i := range order {
		position := max(0, min(snapshot.Positions[i], len(out.Blocks)))
		out.Blocks = append(out.Blocks, PageAppBlock{})
		copy(out.Blocks[position+1:], out.Blocks[position:])
		out.Blocks[position] = snapshot.Blocks[i]
	}
	return out, validatePageApp(&out)
}

// Read source schemas on the same connection/transaction as the page CAS.
// Archived schemas are not re-created; restoration must bind to valid originals.
func (s *Server) validatePageAppSourcesTx(r *http.Request, tx *sql.Tx, def *PageAppDefinition) error {
	for _, b := range def.Blocks {
		if !pageAppHasSource(b) {
			continue
		}
		source, err := readPageAppSource(r.Context(), tx, currentWorkspace(r).ID, b.CollectionID)
		if err != nil {
			return fmt.Errorf("Доска блока «%s» недоступна. Восстановите исходную доску перед восстановлением блока", pageBlockName(b))
		}
		checks := []error{s.validatePageActionSource(r.Context(), b, source.Fields), validatePageElementStyleSource(b, source.Fields), validatePageRecordBindingSource(b, source.Fields), validatePageFormSource(b, source.Fields)}
		for _, err := range checks {
			if err != nil {
				return fmt.Errorf("Блок «%s»: %w", pageBlockName(b), err)
			}
		}
		fields := map[string]bool{}
		for _, f := range source.Fields {
			fields[f.ID] = true
		}
		seen := map[string]bool{}
		for _, id := range b.Fields {
			if !fields[id] || seen[id] {
				return fmt.Errorf("Поле блока «%s» недоступно или повторяется. Восстановите исходные поля доски", pageBlockName(b))
			}
			seen[id] = true
		}
	}
	return nil
}

func (s *Server) mutatePageBlockTrash(w http.ResponseWriter, r *http.Request, restore bool) {
	var input pageBlockTrashInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.PageName = strings.TrimSpace(input.PageName)
	if !pageAppID.MatchString(input.ClientRequestID) || len(input.ClientRequestID) < 16 || input.ExpectedRevision < 0 || input.PageName == "" || len([]rune(input.PageName)) > 80 {
		writeError(w, 400, "Укажите название страницы, текущую версию и идентификатор операции")
		return
	}
	if len(input.Definition.Collections) > 0 {
		writeError(w, 400, "В страницу нельзя подставлять внешние схемы")
		return
	}
	operation, action := "removed", "app_blocks_removed"
	if restore {
		operation, action = "restored", "app_blocks_restored"
	}
	workspace, page, trashID := currentWorkspace(r).ID, r.PathValue("id"), r.PathValue("trashId")
	hash := componentRequestHash(struct {
		Workspace, Page, TrashID, Action string
		Input                            pageBlockTrashInput
	}{workspace, page, trashID, action, input})
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать операцию с корзиной")
		return
	}
	defer tx.Rollback()
	// Check the receipt before the stale revision: a committed retry must return
	// current state even if the page has since changed or the block was re-removed.
	var receiptID, receiptHash, receiptRoot, receiptTrash string
	err = tx.QueryRowContext(r.Context(), `SELECT id,json_extract(details_json,'$.requestHash'),json_extract(details_json,'$.rootBlockId'),COALESCE(json_extract(details_json,'$.trashId'),'')
  FROM activity WHERE workspace_id=? AND entity_type='workspace_page' AND entity_id=? AND actor_id=? AND action=? AND json_extract(details_json,'$.clientRequestId')=? LIMIT 1`, workspace, page, currentUser(r).ID, action, input.ClientRequestID).Scan(&receiptID, &receiptHash, &receiptRoot, &receiptTrash)
	if err == nil {
		if receiptHash != hash {
			writeError(w, 409, "Этот запрос уже выполнил другую операцию. Откройте действие заново")
			return
		}
		if !restore {
			receiptTrash = receiptID
		}
		tx.Rollback()
		s.writePageBlockTrashResult(w, r, receiptTrash, receiptRoot, operation, true)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось проверить результат операции")
		return
	}
	var revision int
	err = tx.QueryRowContext(r.Context(), `SELECT COALESCE(d.revision,0) FROM workspace_pages p LEFT JOIN page_app_definitions d ON d.page_id=p.id WHERE p.id=? AND p.workspace_id=? AND p.archived_at IS NULL`, page, workspace).Scan(&revision)
	if err != nil {
		writeError(w, 404, "Страница больше не доступна")
		return
	}
	if revision != input.ExpectedRevision {
		writeError(w, 409, "Страница изменилась. Черновик сохранён на устройстве; откройте актуальную страницу перед операцией с корзиной")
		return
	}
	if err = validatePageApp(&input.Definition); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err = validatePageBlockTrashIDs(r.Context(), tx, workspace, page, input.Definition); err != nil {
		writeError(w, 409, err.Error())
		return
	}
	var snapshot pageBlockTrashSnapshot
	var title, root string
	var combined PageAppDefinition
	if restore {
		entry, readErr := readPageBlockTrashEntry(r.Context(), tx, workspace, page, trashID)
		if errors.Is(readErr, sql.ErrNoRows) {
			writeError(w, 404, "Блок не найден в корзине этой страницы или уже восстановлен")
			return
		}
		if readErr != nil {
			writeError(w, 500, "Не удалось прочитать сохранённую структуру корзины")
			return
		}
		snapshot, title, root = entry.Snapshot, entry.Title, entry.Snapshot.RootBlockID
		combined, err = restorePageBlockSnapshot(input.Definition, snapshot)
	} else {
		combined, snapshot, err = splitPageBlockTrash(input.Definition, input.BlockID)
		root = input.BlockID
		for _, b := range snapshot.Blocks {
			if b.ID == root {
				title = pageBlockName(b)
			}
		}
		if err == nil {
			err = validatePageApp(&combined)
		}
	}
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err = s.validatePageAppSourcesTx(r, tx, &combined); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	raw, _ := json.Marshal(combined)
	now := nowText()
	var changed sql.Result
	if revision == 0 {
		changed, err = tx.ExecContext(r.Context(), `INSERT INTO page_app_definitions(page_id,definition_json,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(page_id) DO NOTHING`, page, string(raw), now)
	} else {
		changed, err = tx.ExecContext(r.Context(), `UPDATE page_app_definitions SET definition_json=?,revision=revision+1,updated_at=? WHERE page_id=? AND revision=?`, string(raw), now, page, revision)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить страницу")
		return
	}
	if n, _ := changed.RowsAffected(); n != 1 {
		writeError(w, 409, "Страница уже изменена. Повторите тот же запрос для проверки результата")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_pages SET name=?,updated_at=? WHERE id=? AND workspace_id=?`, input.PageName, now, page, workspace); err != nil {
		writeError(w, 500, "Не удалось сохранить название страницы")
		return
	}
	details := map[string]any{"title": title, "blockCount": len(snapshot.Blocks), "revision": revision + 1, "rootBlockId": root, "clientRequestId": input.ClientRequestID, "requestHash": hash}
	if restore {
		details["trashId"] = trashID
	} else {
		details["snapshot"] = snapshot
	}
	eventID, err := writeActivityWithID(r.Context(), tx, currentUser(r).ID, "workspace_page", page, action, "", details)
	if err == nil && restore {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO activity_undos(activity_id,undone_by,undo_activity_id,created_at) VALUES(?,?,?,?)`, trashID, currentUser(r).ID, eventID, now)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить историю корзины")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось подтвердить операцию. Повторите тот же запрос")
		return
	}
	if !restore {
		trashID = eventID
	}
	s.writePageBlockTrashResult(w, r, trashID, root, operation, false)
}

func (s *Server) writePageBlockTrashResult(w http.ResponseWriter, r *http.Request, trash, root, operation string, repeated bool) {
	state, err := s.readPageApp(r)
	if err != nil {
		writeError(w, 500, "Операция сохранена. Повторите тот же запрос для проверки результата")
		return
	}
	var name string
	if err = s.store.db.QueryRowContext(r.Context(), `SELECT name FROM workspace_pages WHERE id=? AND workspace_id=?`, r.PathValue("id"), currentWorkspace(r).ID).Scan(&name); err != nil {
		writeError(w, 500, "Не удалось перечитать название. Повторите тот же запрос")
		return
	}
	writeJSON(w, 200, PageBlockTrashResult{PageAppState: state, PageName: name, TrashID: trash, RootBlockID: root, AlreadyApplied: repeated, Operation: operation})
}
