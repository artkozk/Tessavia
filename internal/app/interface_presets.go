package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
)

const interfacePresetPayloadVersion = 1

var portableInterfacePageKeys = func() map[string]bool {
	keys := map[string]bool{"personal": true, "notifications": true, "day:personal": true, "day:project": true, "calendar:personal": true, "calendar:project": true}
	for key := range projectViewKeys {
		keys[key] = true
	}
	return keys
}()

var portableInterfaceNavigationKeys = func() map[string]bool {
	keys := map[string]bool{"personal": true}
	for key := range projectViewKeys {
		keys[key] = true
	}
	return keys
}()

var portableInterfaceBlockKeys = map[string]bool{
	"heading": true, "filters": true, "summary": true, "records": true,
	"tabs": true, "habits": true, "plans": true, "life": true, "notes": true,
	"first-use": true, "day-focus": true, "day-time": true, "day-attention": true, "day-reminders": true, "day-waiting": true,
	"search": true, "preference": true, "limitation": true, "rule": true,
	"digest": true, "legend": true, "hidden": true,
	"month": true, "undated": true, "boards": true,
	"focus": true, "capture": true, "capacity": true, "quality": true,
	"widget:calendar": true, "widget:agenda": true, "widget:notes": true,
	"widget:plans": true, "widget:habits": true, "widget:tasks": true,
	"widget:research": true, "widget:risks": true, "widget:goals": true,
}

var portableInterfaceFieldKeys = map[string]bool{
	"description": true, "owner": true, "status": true, "due": true,
	"voice": true, "ai": true, "count": true, "zoom": true,
	"noteDates": true, "notePreview": true,
	"column:inbox": true, "column:queued": true, "column:in_progress": true,
	"column:blocked": true, "column:review": true, "column:completed": true,
	"column:postponed": true, "column:cancelled": true,
}

type InterfacePresetPayload struct {
	Version int                  `json:"version"`
	Desktop InterfacePreferences `json:"desktop"`
	Mobile  InterfacePreferences `json:"mobile"`
}

type InterfacePresetDeviceSummary struct {
	Device              string   `json:"device"`
	Changed             bool     `json:"changed"`
	HiddenMenuItems     int      `json:"hiddenMenuItems"`
	DashboardWidgets    int      `json:"dashboardWidgets"`
	CustomizedPages     int      `json:"customizedPages"`
	Density             string   `json:"density"`
	VisibleToolbarItems int      `json:"visibleToolbarItems"`
	HiddenNavigation    []string `json:"hiddenNavigation"`
	HiddenGroups        []string `json:"hiddenGroups"`
	DashboardOrder      []string `json:"dashboardOrder"`
	PageKeys            []string `json:"pageKeys"`
	ContentWidth        int      `json:"contentWidth"`
}

type InterfacePreset struct {
	ID          string                                  `json:"id"`
	Name        string                                  `json:"name"`
	Description string                                  `json:"description"`
	Visibility  string                                  `json:"visibility"`
	OwnerID     int64                                   `json:"ownerId"`
	OwnerName   string                                  `json:"ownerUsername"`
	Mine        bool                                    `json:"mine"`
	UseCount    int                                     `json:"useCount"`
	Summary     map[string]InterfacePresetDeviceSummary `json:"summary"`
	PublishedAt *string                                 `json:"publishedAt"`
	CreatedAt   string                                  `json:"createdAt"`
	UpdatedAt   string                                  `json:"updatedAt"`
}

type storedInterfacePreset struct {
	InterfacePreset
	Payload InterfacePresetPayload
}

type createInterfacePresetRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Visibility  string `json:"visibility"`
}

type updateInterfacePresetRequest struct {
	Name               *string `json:"name"`
	Description        *string `json:"description"`
	Visibility         *string `json:"visibility"`
	RefreshFromCurrent bool    `json:"refreshFromCurrent"`
	ExpectedUpdatedAt  string  `json:"expectedUpdatedAt"`
}

type applyInterfacePresetRequest struct {
	Devices []string `json:"devices"`
}

type interfacePresetApplicationPayload struct {
	Profiles map[string]InterfacePreferences `json:"profiles"`
}

type interfacePresetApplicationResponse struct {
	ApplicationID string                          `json:"applicationId"`
	Profiles      map[string]InterfacePreferences `json:"profiles"`
}

type interfacePresetLatestApplication struct {
	ID         string `json:"id"`
	PresetName string `json:"presetName"`
	CreatedAt  string `json:"createdAt"`
	CanUndo    bool   `json:"canUndo"`
}

func validInterfacePresetText(name, description, visibility string) error {
	if name == "" || len([]rune(name)) > 80 {
		return errors.New("Название набора обязательно и не длиннее 80 символов")
	}
	if len([]rune(description)) > 500 {
		return errors.New("Описание набора не должно быть длиннее 500 символов")
	}
	if visibility != "private" && visibility != "public" {
		return errors.New("Неизвестная видимость набора")
	}
	return nil
}

func portableInterfacePreferences(input InterfacePreferences, device string) InterfacePreferences {
	input.Device = device
	input.UpdatedAt = ""
	input.HiddenNavGroups = uniqueAllowedStrings(input.HiddenNavGroups, interfaceNavGroups)
	input.CollapsedNavGroups = uniqueAllowedStrings(input.CollapsedNavGroups, interfaceNavGroups)
	input.HiddenNavItems = uniqueAllowedStrings(input.HiddenNavItems, portableInterfaceNavigationKeys)
	input.NavOrder = uniqueAllowedStrings(input.NavOrder, portableInterfaceNavigationKeys)
	input.DashboardWidgets = uniqueAllowedStrings(input.DashboardWidgets, interfaceDashboardWidgets)
	if len(input.DashboardWidgets) == 0 {
		input.DashboardWidgets = []string{"focus"}
	}
	input.Layout = normalizeInterfaceLayout(input.Layout)
	pages := make(map[string]PageLayout)
	for key, page := range input.Layout.Pages {
		if !portableInterfacePageKeys[key] {
			continue
		}
		page.Texts = nil // Personal wording is not part of a published layout.
		page.Order = uniqueAllowedStrings(page.Order, portableInterfaceBlockKeys)
		page.HiddenBlocks = uniqueAllowedStrings(page.HiddenBlocks, portableInterfaceBlockKeys)
		page.HiddenFields = uniqueAllowedStrings(page.HiddenFields, portableInterfaceFieldKeys)
		spans := make(map[string]int)
		for block, span := range page.BlockSpans {
			if portableInterfaceBlockKeys[block] {
				spans[block] = span
			}
		}
		page.BlockSpans = spans
		settings := make(map[string]PageBlockSettings)
		for block, value := range page.BlockSettings {
			if portableInterfaceBlockKeys[block] {
				settings[block] = value
			}
		}
		page.BlockSettings = settings
		pages[key] = page
	}
	input.Layout.Pages = pages
	return input
}

func mergePortableInterfacePreferences(current, portable InterfacePreferences, device string) InterfacePreferences {
	result := portableInterfacePreferences(portable, device)
	for _, key := range current.HiddenNavItems {
		if !portableInterfaceNavigationKeys[key] {
			result.HiddenNavItems = append(result.HiddenNavItems, key)
		}
	}
	for _, key := range current.NavOrder {
		if !portableInterfaceNavigationKeys[key] {
			result.NavOrder = append(result.NavOrder, key)
		}
	}
	for key, page := range current.Layout.Pages {
		if !portableInterfacePageKeys[key] {
			result.Layout.Pages[key] = page
		} else if len(page.Texts) > 0 {
			preserved := result.Layout.Pages[key]
			preserved.Texts = page.Texts
			result.Layout.Pages[key] = preserved
		}
	}
	return result
}

func interfacePresetPayload(desktop, mobile InterfacePreferences) InterfacePresetPayload {
	return InterfacePresetPayload{
		Version: interfacePresetPayloadVersion,
		Desktop: portableInterfacePreferences(desktop, "desktop"),
		Mobile:  portableInterfacePreferences(mobile, "mobile"),
	}
}

func sameInterfaceSettings(left, right InterfacePreferences) bool {
	left.UpdatedAt, right.UpdatedAt = "", ""
	leftJSON, _ := json.Marshal(left)
	rightJSON, _ := json.Marshal(right)
	return string(leftJSON) == string(rightJSON)
}

func interfacePresetSummary(payload InterfacePresetPayload, current map[string]InterfacePreferences) map[string]InterfacePresetDeviceSummary {
	result := make(map[string]InterfacePresetDeviceSummary, 2)
	for _, item := range []struct {
		device      string
		preferences InterfacePreferences
	}{{"desktop", payload.Desktop}, {"mobile", payload.Mobile}} {
		preferences := portableInterfacePreferences(item.preferences, item.device)
		pageKeys := make([]string, 0, len(preferences.Layout.Pages))
		for key := range preferences.Layout.Pages {
			pageKeys = append(pageKeys, key)
		}
		sort.Strings(pageKeys)
		summary := InterfacePresetDeviceSummary{
			Device:              item.device,
			HiddenMenuItems:     len(preferences.HiddenNavItems) + len(preferences.HiddenNavGroups),
			DashboardWidgets:    len(preferences.DashboardWidgets),
			CustomizedPages:     len(preferences.Layout.Pages),
			Density:             preferences.Layout.Density,
			VisibleToolbarItems: len(preferences.Layout.ToolbarActions),
			HiddenNavigation:    preferences.HiddenNavItems,
			HiddenGroups:        preferences.HiddenNavGroups,
			DashboardOrder:      preferences.DashboardWidgets,
			PageKeys:            pageKeys,
			ContentWidth:        preferences.Layout.ContentWidth,
		}
		if existing, ok := current[item.device]; ok {
			summary.Changed = !sameInterfaceSettings(portableInterfacePreferences(existing, item.device), preferences)
		}
		result[item.device] = summary
	}
	return result
}

func (s *Server) currentInterfaceProfiles(r *http.Request) (map[string]InterfacePreferences, error) {
	profiles := make(map[string]InterfacePreferences, 2)
	for _, device := range []string{"desktop", "mobile"} {
		preferences, err := s.loadInterfacePreferences(r.Context(), currentUser(r).ID, currentWorkspace(r).ID, device)
		if err != nil {
			return nil, err
		}
		profiles[device] = preferences
	}
	return profiles, nil
}

func scanInterfacePreset(scanner interface{ Scan(...any) error }, userID int64) (storedInterfacePreset, error) {
	var result storedInterfacePreset
	var payloadJSON string
	var published sql.NullString
	err := scanner.Scan(&result.ID, &result.Name, &result.Description, &result.Visibility, &result.OwnerID, &result.OwnerName, &result.UseCount, &payloadJSON, &published, &result.CreatedAt, &result.UpdatedAt)
	if err != nil {
		return result, err
	}
	if err = json.Unmarshal([]byte(payloadJSON), &result.Payload); err != nil || result.Payload.Version != interfacePresetPayloadVersion {
		return result, errors.New("unsupported interface preset payload")
	}
	result.Mine = result.OwnerID == userID
	if published.Valid {
		result.PublishedAt = &published.String
	}
	return result, nil
}

const interfacePresetSelect = `SELECT p.id, p.name, p.description, p.visibility, p.owner_id, u.username, p.use_count, p.payload_json, p.published_at, p.created_at, p.updated_at FROM interface_presets p JOIN users u ON u.id = p.owner_id`

func (s *Server) loadVisibleInterfacePreset(r *http.Request, id string) (storedInterfacePreset, error) {
	return scanInterfacePreset(s.store.db.QueryRowContext(r.Context(), interfacePresetSelect+` WHERE p.id = ? AND (p.owner_id = ? OR p.visibility = 'public')`, id, currentUser(r).ID), currentUser(r).ID)
}

func (s *Server) handleListInterfacePresets(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if scope == "" {
		scope = "all"
	}
	if scope != "all" && scope != "mine" && scope != "public" {
		writeError(w, http.StatusBadRequest, "Неизвестный каталог наборов")
		return
	}
	where := `(p.owner_id = ? OR p.visibility = 'public')`
	args := []any{currentUser(r).ID}
	if scope == "mine" {
		where = `p.owner_id = ?`
	} else if scope == "public" {
		where = `p.visibility = 'public'`
		args = nil
	}
	if query != "" {
		where += ` AND (p.name LIKE ? OR p.description LIKE ? OR u.username LIKE ?)`
		pattern := "%" + query + "%"
		args = append(args, pattern, pattern, pattern)
	}
	args = append(args, currentUser(r).ID)
	rows, err := s.store.db.QueryContext(r.Context(), interfacePresetSelect+` WHERE `+where+` ORDER BY CASE WHEN p.owner_id = ? THEN 0 ELSE 1 END, p.use_count DESC, p.updated_at DESC LIMIT 100`, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить наборы интерфейса")
		return
	}
	defer rows.Close()
	result := make([]InterfacePreset, 0)
	for rows.Next() {
		preset, err := scanInterfacePreset(rows, currentUser(r).ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Набор интерфейса повреждён")
			return
		}
		preset.Summary = interfacePresetSummary(preset.Payload, nil)
		result = append(result, preset.InterfacePreset)
	}
	if rows.Err() != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать наборы интерфейса")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleCreateInterfacePreset(w http.ResponseWriter, r *http.Request) {
	var input createInterfacePresetRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if input.Visibility == "" {
		input.Visibility = "private"
	}
	if err := validInterfacePresetText(input.Name, input.Description, input.Visibility); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	profiles, err := s.currentInterfaceProfiles(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось собрать текущий интерфейс")
		return
	}
	payload := interfacePresetPayload(profiles["desktop"], profiles["mobile"])
	payloadJSON, _ := json.Marshal(payload)
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать набор")
		return
	}
	now := nowText()
	var published any
	if input.Visibility == "public" {
		published = now
	}
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO interface_presets(id, owner_id, name, description, visibility, payload_json, published_at, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, currentUser(r).ID, input.Name, input.Description, input.Visibility, string(payloadJSON), published, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить набор интерфейса")
		return
	}
	preset, err := s.loadVisibleInterfacePreset(r, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Набор сохранён, но не загрузился")
		return
	}
	preset.Summary = interfacePresetSummary(preset.Payload, profiles)
	writeJSON(w, http.StatusCreated, preset.InterfacePreset)
}

func (s *Server) handleGetInterfacePreset(w http.ResponseWriter, r *http.Request) {
	preset, err := s.loadVisibleInterfacePreset(r, r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Набор интерфейса не найден")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить набор интерфейса")
		return
	}
	profiles, err := s.currentInterfaceProfiles(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сравнить настройки интерфейса")
		return
	}
	preset.Summary = interfacePresetSummary(preset.Payload, profiles)
	writeJSON(w, http.StatusOK, preset.InterfacePreset)
}

func (s *Server) handleUpdateInterfacePreset(w http.ResponseWriter, r *http.Request) {
	var input updateInterfacePresetRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	var current storedInterfacePreset
	var err error
	current, err = scanInterfacePreset(s.store.db.QueryRowContext(r.Context(), interfacePresetSelect+` WHERE p.id = ? AND p.owner_id = ?`, r.PathValue("id"), currentUser(r).ID), currentUser(r).ID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Ваш набор интерфейса не найден")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить набор интерфейса")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != current.UpdatedAt {
		writeError(w, http.StatusConflict, "Набор уже изменён. Откройте его заново")
		return
	}
	name, description, visibility := current.Name, current.Description, current.Visibility
	if input.Name != nil {
		name = strings.TrimSpace(*input.Name)
	}
	if input.Description != nil {
		description = strings.TrimSpace(*input.Description)
	}
	if input.Visibility != nil {
		visibility = *input.Visibility
	}
	if err := validInterfacePresetText(name, description, visibility); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	payload := current.Payload
	if input.RefreshFromCurrent {
		profiles, err := s.currentInterfaceProfiles(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось обновить содержимое набора")
			return
		}
		payload = interfacePresetPayload(profiles["desktop"], profiles["mobile"])
	}
	payloadJSON, _ := json.Marshal(payload)
	now := nowText()
	var published any
	if visibility == "public" {
		if current.PublishedAt != nil {
			published = *current.PublishedAt
		} else {
			published = now
		}
	}
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE interface_presets SET name = ?, description = ?, visibility = ?, payload_json = ?, published_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND updated_at = ?`, name, description, visibility, string(payloadJSON), published, now, current.ID, currentUser(r).ID, current.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить набор интерфейса")
		return
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		writeError(w, http.StatusConflict, "Набор уже изменён. Откройте его заново")
		return
	}
	updated, err := s.loadVisibleInterfacePreset(r, current.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Набор обновлён, но не загрузился")
		return
	}
	profiles, _ := s.currentInterfaceProfiles(r)
	updated.Summary = interfacePresetSummary(updated.Payload, profiles)
	writeJSON(w, http.StatusOK, updated.InterfacePreset)
}

func (s *Server) handleDeleteInterfacePreset(w http.ResponseWriter, r *http.Request) {
	result, err := s.store.db.ExecContext(r.Context(), `DELETE FROM interface_presets WHERE id = ? AND owner_id = ?`, r.PathValue("id"), currentUser(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось удалить набор интерфейса")
		return
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		writeError(w, http.StatusNotFound, "Ваш набор интерфейса не найден")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func requestedPresetDevices(values []string) ([]string, error) {
	if len(values) == 0 {
		return []string{"desktop", "mobile"}, nil
	}
	allowed := map[string]bool{"desktop": true, "mobile": true}
	devices := uniqueAllowedStrings(values, allowed)
	if len(devices) != len(values) || len(devices) == 0 {
		return nil, errors.New("Выберите ПК, телефон или оба устройства")
	}
	return devices, nil
}

func (s *Server) handleApplyInterfacePreset(w http.ResponseWriter, r *http.Request) {
	var input applyInterfacePresetRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	devices, err := requestedPresetDevices(input.Devices)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	keys, err := s.navigationKeys(r.Context(), currentWorkspace(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить пункты меню")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать применение набора")
		return
	}
	defer tx.Rollback()
	preset, err := scanInterfacePreset(tx.QueryRowContext(r.Context(), interfacePresetSelect+` WHERE p.id = ? AND (p.owner_id = ? OR p.visibility = 'public')`, r.PathValue("id"), currentUser(r).ID), currentUser(r).ID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Набор интерфейса не найден")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить набор интерфейса")
		return
	}
	previous := interfacePresetApplicationPayload{Profiles: make(map[string]InterfacePreferences, len(devices))}
	applied := interfacePresetApplicationPayload{Profiles: make(map[string]InterfacePreferences, len(devices))}
	for _, device := range devices {
		current, err := loadInterfacePreferencesWithReader(r.Context(), tx, currentUser(r).ID, currentWorkspace(r).ID, device)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить предыдущую раскладку")
			return
		}
		previous.Profiles[device] = current
		target := preset.Payload.Desktop
		if device == "mobile" {
			target = preset.Payload.Mobile
		}
		target = normalizeInterfacePreferences(mergePortableInterfacePreferences(current, target, device), device, keys)
		applied.Profiles[device] = target
	}
	applicationID, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать точку отмены")
		return
	}
	devicesJSON, _ := json.Marshal(devices)
	previousJSON, _ := json.Marshal(previous)
	appliedJSON, _ := json.Marshal(applied)
	for _, device := range devices {
		if err = persistInterfacePreferences(r.Context(), tx, currentUser(r).ID, currentWorkspace(r).ID, device, applied.Profiles[device]); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось применить набор интерфейса")
			return
		}
	}
	now := nowText()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO interface_preset_applications(id, preset_id, user_id, workspace_id, devices_json, previous_payload_json, applied_payload_json, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, applicationID, preset.ID, currentUser(r).ID, currentWorkspace(r).ID, string(devicesJSON), string(previousJSON), string(appliedJSON), now); err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE interface_presets SET use_count = use_count + 1 WHERE id = ?`, preset.ID)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить применение набора")
		return
	}
	writeJSON(w, http.StatusOK, interfacePresetApplicationResponse{ApplicationID: applicationID, Profiles: applied.Profiles})
}

func (s *Server) handleUndoInterfacePresetApplication(w http.ResponseWriter, r *http.Request) {
	keys, err := s.navigationKeys(r.Context(), currentWorkspace(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить пункты меню")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать отмену")
		return
	}
	defer tx.Rollback()
	var previousJSON, appliedJSON, workspaceID string
	var undone sql.NullString
	err = tx.QueryRowContext(r.Context(), `SELECT workspace_id, previous_payload_json, applied_payload_json, undone_at FROM interface_preset_applications WHERE id = ? AND user_id = ?`, r.PathValue("id"), currentUser(r).ID).Scan(&workspaceID, &previousJSON, &appliedJSON, &undone)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Точка отмены не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить точку отмены")
		return
	}
	if workspaceID != currentWorkspace(r).ID {
		writeError(w, http.StatusNotFound, "Точка отмены не найдена")
		return
	}
	if undone.Valid {
		writeError(w, http.StatusConflict, "Этот набор уже отменён")
		return
	}
	var previous, applied interfacePresetApplicationPayload
	if json.Unmarshal([]byte(previousJSON), &previous) != nil || json.Unmarshal([]byte(appliedJSON), &applied) != nil {
		writeError(w, http.StatusInternalServerError, "Точка отмены повреждена")
		return
	}
	restored := make(map[string]InterfacePreferences, len(previous.Profiles))
	for device, expected := range applied.Profiles {
		current, err := loadInterfacePreferencesWithReader(r.Context(), tx, currentUser(r).ID, workspaceID, device)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось проверить текущую раскладку")
			return
		}
		if !sameInterfaceSettings(current, expected) {
			writeError(w, http.StatusConflict, "После применения настройки уже менялись. Автоматическая отмена недоступна")
			return
		}
		prepared := normalizeInterfacePreferences(previous.Profiles[device], device, keys)
		restored[device] = prepared
	}
	for device, preferences := range restored {
		if err = persistInterfacePreferences(r.Context(), tx, currentUser(r).ID, workspaceID, device, preferences); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось восстановить раскладку")
			return
		}
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE interface_preset_applications SET undone_at = ? WHERE id = ? AND user_id = ? AND undone_at IS NULL`, nowText(), r.PathValue("id"), currentUser(r).ID)
	if err == nil {
		if changed, _ := result.RowsAffected(); changed == 0 {
			err = errors.New("application already undone")
		}
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, http.StatusConflict, "Не удалось безопасно отменить применение набора")
		return
	}
	writeJSON(w, http.StatusOK, interfacePresetApplicationResponse{ApplicationID: r.PathValue("id"), Profiles: restored})
}

func (s *Server) handleLatestInterfacePresetApplication(w http.ResponseWriter, r *http.Request) {
	var result interfacePresetLatestApplication
	var appliedJSON string
	var undone sql.NullString
	err := s.store.db.QueryRowContext(r.Context(), `SELECT a.id, COALESCE(p.name, 'Удалённый набор'), a.created_at, a.applied_payload_json, a.undone_at FROM interface_preset_applications a LEFT JOIN interface_presets p ON p.id = a.preset_id WHERE a.user_id = ? AND a.workspace_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 1`, currentUser(r).ID, currentWorkspace(r).ID).Scan(&result.ID, &result.PresetName, &result.CreatedAt, &appliedJSON, &undone)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && undone.Valid) {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить последнее применение")
		return
	}
	var applied interfacePresetApplicationPayload
	if json.Unmarshal([]byte(appliedJSON), &applied) != nil {
		writeError(w, http.StatusInternalServerError, "Точка отмены повреждена")
		return
	}
	result.CanUndo = true
	for device, expected := range applied.Profiles {
		current, err := s.loadInterfacePreferences(r.Context(), currentUser(r).ID, currentWorkspace(r).ID, device)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось проверить возможность отмены")
			return
		}
		if !sameInterfaceSettings(current, expected) {
			result.CanUndo = false
		}
	}
	writeJSON(w, http.StatusOK, result)
}
