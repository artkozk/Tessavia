package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

type financeCategory struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Archived bool   `json:"archived"`
	Revision int64  `json:"revision"`
}
type financeLinkInput struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}
type financeLink struct {
	Kind        string `json:"kind"`
	ID          string `json:"id"`
	Title       string `json:"title"`
	Available   bool   `json:"available"`
	Archived    bool   `json:"archived,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	RecordType  string `json:"recordType,omitempty"`
}
type financeOrganization struct {
	CategoryID   string        `json:"categoryId,omitempty"`
	CategoryName string        `json:"categoryName,omitempty"`
	Links        []financeLink `json:"links,omitempty"`
}
type financeOrganizationInput struct {
	CategoryID               *string             `json:"categoryId,omitempty"`
	ExpectedCategoryRevision int64               `json:"expectedCategoryRevision,omitempty"`
	Links                    *[]financeLinkInput `json:"links,omitempty"`
}

func (s *Server) registerFinanceOrganizationRoutes() {
	for _, prefix := range []string{"/api/personal/finance", "/api/workspace/finance"} {
		s.mux.Handle("POST "+prefix+"/categories", s.requireAuth(http.HandlerFunc(s.handleFinanceCategory)))
		s.mux.Handle("PUT "+prefix+"/categories/{id}", s.requireAuth(http.HandlerFunc(s.handleFinanceCategory)))
		s.mux.Handle("GET "+prefix+"/link-targets", s.requireAuth(http.HandlerFunc(s.handleFinanceLinkTargets)))
	}
}

func readFinanceCategories(tx *financeTx, r *http.Request) ([]financeCategory, error) {
	result := []financeCategory{}
	rows, err := tx.QueryContext(r.Context(), `SELECT id,name,archived,revision FROM personal_finance_categories WHERE owner_id=? ORDER BY name,id`, tx.owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var value financeCategory
		if err := rows.Scan(&value.ID, &value.Name, &value.Archived, &value.Revision); err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	return result, rows.Err()
}
func readFinanceCategory(tx *financeTx, r *http.Request, id string) (financeCategory, error) {
	var value financeCategory
	err := tx.QueryRowContext(r.Context(), `SELECT id,name,archived,revision FROM personal_finance_categories WHERE owner_id=? AND id=?`, tx.owner, id).Scan(&value.ID, &value.Name, &value.Archived, &value.Revision)
	return value, err
}
func (s *Server) handleFinanceCategory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var input struct {
		Name             string `json:"name"`
		Archived         bool   `json:"archived"`
		ExpectedRevision int64  `json:"expectedRevision"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 120 {
		financeWriteError(w, financeInvalid("Укажите название группы до 120 символов"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		value := financeCategory{Name: input.Name, Archived: input.Archived, Revision: 1}
		if r.Method == http.MethodPost {
			id, err := newID()
			if err != nil {
				return nil, 0, err
			}
			value.ID = id
			_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_categories(id,owner_id,name,archived,revision,created_at,updated_at) VALUES(?,?,?,?,1,?,?)`, id, tx.owner, value.Name, value.Archived, nowText(), nowText())
			return value, 201, err
		}
		before, err := readFinanceCategory(tx, r, r.PathValue("id"))
		if err != nil {
			return nil, 0, err
		}
		if before.Revision != input.ExpectedRevision {
			return nil, 0, financeConflict("Группа уже изменена. Обновите категории перед сохранением")
		}
		value.ID, value.Revision = before.ID, before.Revision+1
		result, err := tx.ExecContext(r.Context(), `UPDATE personal_finance_categories SET name=?,archived=?,revision=?,updated_at=? WHERE owner_id=? AND id=? AND revision=?`, value.Name, value.Archived, value.Revision, nowText(), tx.owner, value.ID, before.Revision)
		if err != nil {
			return nil, 0, err
		}
		count, err := result.RowsAffected()
		if err == nil && count != 1 {
			err = financeConflict("Группа уже изменена. Обновите категории")
		}
		return value, 200, err
	})
}

// Titles are resolved against the current scope, never stored in a financial
// snapshot. Moving a record or changing an owner cannot leak an old title.
func resolveFinanceLink(tx *financeTx, r *http.Request, ref financeLinkInput) (financeLink, error) {
	value := financeLink{Kind: ref.Kind, ID: ref.ID, Title: "Связь недоступна"}
	var title, status, recordType string
	var err error
	if tx.scope != nil {
		if ref.Kind != "record" {
			return value, financeInvalid("Для финансов команды выберите карточку этой команды")
		}
		err = tx.Tx.QueryRowContext(r.Context(), `SELECT title,status,type FROM records WHERE workspace_id=? AND id=?`, tx.scope.SourceWorkspaceID, ref.ID).Scan(&title, &status, &recordType)
	} else {
		switch ref.Kind {
		case "personal_goal":
			err = tx.Tx.QueryRowContext(r.Context(), `SELECT title,status FROM personal_goals WHERE owner_id=? AND id=?`, tx.owner, ref.ID).Scan(&title, &status)
		case "personal_plan":
			err = tx.Tx.QueryRowContext(r.Context(), `SELECT title,status FROM personal_plans WHERE owner_id=? AND id=?`, tx.owner, ref.ID).Scan(&title, &status)
		default:
			return value, financeInvalid("Для личных финансов выберите свою цель или дело")
		}
	}
	if errors.Is(err, sql.ErrNoRows) {
		return value, nil
	}
	if err != nil {
		return value, err
	}
	value.Title, value.Available, value.Archived = title, true, status == "archived"
	if tx.scope != nil {
		value.WorkspaceID, value.RecordType = tx.scope.SourceWorkspaceID, recordType
	}
	return value, nil
}

func prepareFinanceOrganization(tx *financeTx, r *http.Request, input financeOrganizationInput, prior financeOrganization) (financeOrganization, error) {
	value := prior
	if input.CategoryID != nil {
		id := strings.TrimSpace(*input.CategoryID)
		if id == "" {
			value.CategoryID, value.CategoryName = "", ""
		} else {
			category, err := readFinanceCategory(tx, r, id)
			if err != nil {
				return value, err
			}
			if id != prior.CategoryID {
				if category.Archived {
					return value, financeInvalid("Выберите действующую группу")
				}
				if input.ExpectedCategoryRevision != category.Revision {
					return value, financeConflict("Группа изменилась. Обновите категории и проверьте выбор")
				}
			}
			value.CategoryID, value.CategoryName = category.ID, category.Name
		}
	}
	if input.Links != nil {
		if len(*input.Links) > 10 {
			return value, financeInvalid("Можно связать до 10 карточек, целей или дел")
		}
		previous := map[string]bool{}
		for _, link := range prior.Links {
			previous[link.Kind+"\x00"+link.ID] = true
		}
		seen := map[string]bool{}
		value.Links = nil
		for _, ref := range *input.Links {
			ref.Kind, ref.ID = strings.TrimSpace(ref.Kind), strings.TrimSpace(ref.ID)
			key := ref.Kind + "\x00" + ref.ID
			if ref.ID == "" || len(ref.ID) > 128 || seen[key] {
				return value, financeInvalid("Проверьте связи: пустые и повторяющиеся записи недопустимы")
			}
			seen[key] = true
			link, err := resolveFinanceLink(tx, r, ref)
			if err != nil {
				return value, err
			}
			if (!link.Available || link.Archived) && !previous[key] {
				return value, financeInvalid("Новая связь недоступна. Выберите действующую запись в этом пространстве")
			}
			value.Links = append(value.Links, link)
		}
	}
	return value, nil
}

func saveFinanceOrganization(tx *financeTx, r *http.Request, kind, id string, input financeOrganizationInput, value financeOrganization) error {
	// Omitted metadata preserves the old operation and old request fingerprints.
	if input.CategoryID == nil && input.Links == nil {
		return nil
	}
	refs := make([]financeLinkInput, 0, len(value.Links))
	for _, link := range value.Links {
		refs = append(refs, financeLinkInput{link.Kind, link.ID})
	}
	data, err := json.Marshal(refs)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_organization(owner_id,operation_kind,operation_id,category_id,links_json,updated_at) VALUES(?,?,?,NULLIF(?,''),?,?) ON CONFLICT(owner_id,operation_kind,operation_id) DO UPDATE SET category_id=excluded.category_id,links_json=excluded.links_json,updated_at=excluded.updated_at`, tx.owner, kind, id, value.CategoryID, string(data), nowText())
	return err
}

func readFinanceOrganization(tx *financeTx, r *http.Request, kind, id string) (financeOrganization, error) {
	var value financeOrganization
	var raw string
	err := tx.QueryRowContext(r.Context(), `SELECT COALESCE(category_id,''),links_json FROM personal_finance_organization WHERE owner_id=? AND operation_kind=? AND operation_id=?`, tx.owner, kind, id).Scan(&value.CategoryID, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return value, nil
	}
	if err != nil {
		return value, err
	}
	if value.CategoryID != "" {
		category, err := readFinanceCategory(tx, r, value.CategoryID)
		if err != nil {
			return value, err
		}
		value.CategoryName = category.Name
	}
	var refs []financeLinkInput
	if err := json.Unmarshal([]byte(raw), &refs); err != nil {
		return value, err
	}
	for _, ref := range refs {
		link, err := resolveFinanceLink(tx, r, ref)
		if err != nil {
			return value, err
		}
		value.Links = append(value.Links, link)
	}
	return value, nil
}

func hydrateFinanceOverview(tx *financeTx, r *http.Request, result *financeOverview) error {
	// Bound reads to operations already in this report, batch metadata in chunks,
	// then resolve each unique target once after its SQL cursor has closed.
	entries := map[string]*financeOrganization{}
	expenses := map[string]*financeOrganization{}
	for i := range result.Entries {
		entries[result.Entries[i].ID] = &result.Entries[i].financeOrganization
	}
	for i := range result.Expenses {
		expenses[result.Expenses[i].ID] = &result.Expenses[i].financeOrganization
	}
	categoryNames := map[string]string{}
	for _, cat := range result.Categories {
		categoryNames[cat.ID] = cat.Name
	}
	cache := map[string]financeLink{}
	for _, group := range []struct {
		kind  string
		items map[string]*financeOrganization
	}{{"income", entries}, {"expense", expenses}} {
		ids := []string{}
		for id := range group.items {
			ids = append(ids, id)
		}
		for start := 0; start < len(ids); start += 400 {
			end := min(start+400, len(ids))
			args := []any{tx.owner, group.kind}
			for _, id := range ids[start:end] {
				args = append(args, id)
			}
			query := `SELECT operation_id,COALESCE(category_id,''),links_json FROM personal_finance_organization WHERE owner_id=? AND operation_kind=? AND operation_id IN (` + strings.TrimSuffix(strings.Repeat("?,", end-start), ",") + `)`
			rows, err := tx.QueryContext(r.Context(), query, args...)
			if err != nil {
				return err
			}
			type stored struct{ id, category, raw string }
			values := []stored{}
			for rows.Next() {
				var item stored
				if err = rows.Scan(&item.id, &item.category, &item.raw); err != nil {
					break
				}
				values = append(values, item)
			}
			if err == nil {
				err = rows.Err()
			}
			rows.Close()
			if err != nil {
				return err
			}
			for _, item := range values {
				value := group.items[item.id]
				value.CategoryID, value.CategoryName = item.category, categoryNames[item.category]
				var refs []financeLinkInput
				if err := json.Unmarshal([]byte(item.raw), &refs); err != nil {
					return err
				}
				for _, ref := range refs {
					key := ref.Kind + "\x00" + ref.ID
					link, ok := cache[key]
					if !ok {
						var err error
						link, err = resolveFinanceLink(tx, r, ref)
						if err != nil {
							return err
						}
						cache[key] = link
					}
					value.Links = append(value.Links, link)
				}
			}
		}
	}
	return nil
}

func (s *Server) handleFinanceLinkTargets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	search, kind := strings.TrimSpace(r.URL.Query().Get("q")), strings.TrimSpace(r.URL.Query().Get("kind"))
	if len([]rune(search)) > 120 {
		financeWriteError(w, financeInvalid("Поиск должен быть не длиннее 120 символов"))
		return
	}
	limit := 30
	if raw := r.URL.Query().Get("limit"); raw != "" {
		var err error
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			financeWriteError(w, financeInvalid("Выберите от 1 до 100 результатов"))
			return
		}
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		var query string
		var args []any
		if tx.scope != nil {
			if kind != "" && kind != "record" {
				return nil, 0, financeInvalid("В команде доступны связи с карточками")
			}
			query = `SELECT 'record',id,title,type FROM records WHERE workspace_id=? AND status<>'archived' ORDER BY updated_at DESC,id`
			args = []any{tx.scope.SourceWorkspaceID}
		} else {
			if kind != "" && kind != "personal_goal" && kind != "personal_plan" {
				return nil, 0, financeInvalid("Выберите личные цели или дела")
			}
			query = `SELECT kind,id,title,'' FROM (SELECT 'personal_goal' AS kind,id,title,updated_at FROM personal_goals WHERE owner_id=? AND status<>'archived' UNION ALL SELECT 'personal_plan' AS kind,id,title,updated_at FROM personal_plans WHERE owner_id=? AND status<>'archived') WHERE (?='' OR kind=?) ORDER BY updated_at DESC,id`
			args = []any{tx.owner, tx.owner, kind, kind}
		}
		rows, err := tx.Tx.QueryContext(r.Context(), query, args...)
		if err != nil {
			return nil, 0, err
		}
		defer rows.Close()
		items := []financeLink{}
		for rows.Next() {
			var item financeLink
			if err := rows.Scan(&item.Kind, &item.ID, &item.Title, &item.RecordType); err != nil {
				return nil, 0, err
			}
			// SQLite lower()/NOCASE only folds ASCII. Fold in Go so Russian
			// names match regardless of case; retain only the bounded response.
			if !strings.Contains(strings.ToLower(item.Title), strings.ToLower(search)) {
				continue
			}
			item.Available = true
			if tx.scope != nil {
				item.WorkspaceID = tx.scope.SourceWorkspaceID
			}
			items = append(items, item)
			if len(items) > limit {
				break
			}
		}
		if err := rows.Err(); err != nil {
			return nil, 0, err
		}
		more := len(items) > limit
		if more {
			items = items[:limit]
		}
		return map[string]any{"items": items, "hasMore": more}, 200, nil
	})
}
