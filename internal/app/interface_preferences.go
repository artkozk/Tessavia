package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
)

var interfaceNavGroups = map[string]bool{
	"Личное": true, "Работа": true, "Основа": true, "Бизнес": true, "Контроль": true, "Настройки": true,
}

var interfaceDashboardWidgets = map[string]bool{
	"focus": true, "capture": true, "capacity": true, "quality": true,
}

var defaultDashboardWidgets = []string{"focus", "capture", "capacity", "quality"}

type InterfacePreferences struct {
	Device             string          `json:"device"`
	HiddenNavItems     []string        `json:"hiddenNavItems"`
	NavOrder           []string        `json:"navOrder"`
	HiddenNavGroups    []string        `json:"hiddenNavGroups"`
	CollapsedNavGroups []string        `json:"collapsedNavGroups"`
	DashboardWidgets   []string        `json:"dashboardWidgets"`
	Layout             InterfaceLayout `json:"layout"`
	UpdatedAt          string          `json:"updatedAt,omitempty"`
}

type InterfaceLayout struct {
	Pages          map[string]PageLayout `json:"pages"`
	ContentWidth   int                   `json:"contentWidth"`
	SidebarWidth   int                   `json:"sidebarWidth"`
	SidebarSide    string                `json:"sidebarSide"`
	Density        string                `json:"density"`
	WidgetSpans    map[string]int        `json:"widgetSpans"`
	ToolbarActions []string              `json:"toolbarActions"`
	QuickActions   []string              `json:"quickActions"`
}

type PageLayout struct {
	Widgets                    []string                     `json:"widgets,omitempty"`
	BlockSettings              map[string]PageBlockSettings `json:"blockSettings,omitempty"`
	Order                      []string                     `json:"order"`
	HiddenBlocks               []string                     `json:"hiddenBlocks"`
	HiddenFields               []string                     `json:"hiddenFields"`
	WorkBoardColumnsConfigured bool                         `json:"workBoardColumnsConfigured,omitempty"`
	BlockSpans                 map[string]int               `json:"blockSpans"`
	ContentWidth               int                          `json:"contentWidth,omitempty"`
	Density                    string                       `json:"density,omitempty"`
	ToolbarActions             *[]string                    `json:"toolbarActions,omitempty"`
}

// Geometry contains no record identifiers or content, so it is safe to share in presets.
type PageBlockSettings struct {
	Column  int    `json:"column,omitempty"`
	Height  int    `json:"height,omitempty"`
	Limit   int    `json:"limit,omitempty"`
	Scale   int    `json:"scale,omitempty"`
	Density string `json:"density,omitempty"`
	Format  string `json:"format,omitempty"`
}

var pageWidgetKeys = map[string]bool{
	"widget:calendar": true, "widget:agenda": true, "widget:notes": true,
	"widget:plans": true, "widget:habits": true, "widget:tasks": true,
	"widget:research": true, "widget:risks": true, "widget:goals": true,
}

var pageLayoutKey = regexp.MustCompile(`^[a-zA-Z0-9_:-]{1,100}$`)

func normalizePageLayouts(pages map[string]PageLayout) map[string]PageLayout {
	result := make(map[string]PageLayout)
	clean := func(values []string) []string {
		allowed := make(map[string]bool)
		for _, key := range values {
			if len(allowed) < 100 && pageLayoutKey.MatchString(key) {
				allowed[key] = true
			}
		}
		return uniqueAllowedStrings(values, allowed)
	}
	for key, page := range pages {
		if !pageLayoutKey.MatchString(key) {
			continue
		}
		page.Order = clean(page.Order)
		page.HiddenBlocks = clean(page.HiddenBlocks)
		page.HiddenFields = clean(page.HiddenFields)
		page.Widgets = uniqueAllowedStrings(page.Widgets, pageWidgetKeys)
		settings := make(map[string]PageBlockSettings)
		for block, value := range page.BlockSettings {
			if len(settings) >= 100 || !pageLayoutKey.MatchString(block) {
				continue
			}
			value.Column = max(0, min(12, value.Column))
			if value.Height != 0 {
				value.Height = max(160, min(1600, value.Height))
			}
			if value.Limit != 0 {
				value.Limit = max(1, min(50, value.Limit))
			}
			if value.Scale != 0 {
				value.Scale = max(40, min(100, value.Scale))
			}
			if value.Density != "compact" && value.Density != "comfortable" {
				value.Density = ""
			}
			if value.Format != "circles" && value.Format != "grid" {
				value.Format = ""
			}
			settings[block] = value
		}
		page.BlockSettings = settings
		spans := make(map[string]int)
		for block, span := range page.BlockSpans {
			if len(spans) < 100 && pageLayoutKey.MatchString(block) && span >= 2 && span <= 12 {
				spans[block] = span
			}
		}
		page.BlockSpans = spans
		if page.ContentWidth != 0 {
			page.ContentWidth = max(900, min(2200, page.ContentWidth))
		}
		if page.Density != "compact" && page.Density != "comfortable" {
			page.Density = ""
		}
		if page.ToolbarActions != nil {
			actions := uniqueAllowedStrings(*page.ToolbarActions, map[string]bool{"help": true, "notifications": true, "create": true})
			page.ToolbarActions = &actions
		}
		result[key] = page
	}
	return result
}

func normalizeInterfaceLayout(layout InterfaceLayout) InterfaceLayout {
	layout.Pages = normalizePageLayouts(layout.Pages)
	if layout.ContentWidth == 0 {
		layout.ContentWidth = 1500
	}
	layout.ContentWidth = max(900, min(2200, layout.ContentWidth))
	if layout.SidebarWidth == 0 {
		layout.SidebarWidth = 238
	}
	layout.SidebarWidth = max(196, min(340, layout.SidebarWidth))
	if layout.SidebarSide != "right" {
		layout.SidebarSide = "left"
	}
	if layout.Density != "compact" {
		layout.Density = "comfortable"
	}
	spans := map[string]int{"focus": 8, "capture": 4, "capacity": 6, "quality": 6}
	for key, span := range layout.WidgetSpans {
		if interfaceDashboardWidgets[key] && (span == 4 || span == 6 || span == 8 || span == 12) {
			spans[key] = span
		}
	}
	layout.WidgetSpans = spans
	if layout.ToolbarActions == nil {
		layout.ToolbarActions = []string{"help", "notifications", "create"}
	}
	layout.ToolbarActions = uniqueAllowedStrings(layout.ToolbarActions, map[string]bool{"help": true, "notifications": true, "create": true})
	if layout.QuickActions == nil {
		layout.QuickActions = []string{"inbox", "idea", "task", "question_set"}
	}
	layout.QuickActions = uniqueAllowedStrings(layout.QuickActions, map[string]bool{"inbox": true, "idea": true, "task": true, "question_set": true, "research": true, "decision": true, "document": true, "goal": true})
	return layout
}

func uniqueAllowedStrings(values []string, allowed map[string]bool) []string {
	seen := make(map[string]bool)
	result := make([]string, 0, len(values))
	for _, value := range values {
		if allowed[value] && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

func interfaceDevice(w http.ResponseWriter, r *http.Request) (string, bool) {
	device := r.URL.Query().Get("device")
	if device == "" {
		device = "desktop"
	}
	if device != "desktop" && device != "mobile" {
		writeError(w, http.StatusBadRequest, "Неизвестный тип устройства")
		return "", false
	}
	return device, true
}

func defaultInterfacePreferences(device string) InterfacePreferences {
	return InterfacePreferences{Device: device, HiddenNavItems: []string{}, NavOrder: []string{}, HiddenNavGroups: []string{}, CollapsedNavGroups: []string{}, DashboardWidgets: append([]string(nil), defaultDashboardWidgets...), Layout: normalizeInterfaceLayout(InterfaceLayout{})}
}

func (s *Server) loadInterfacePreferences(ctx context.Context, userID int64, workspaceID, device string) (InterfacePreferences, error) {
	return loadInterfacePreferencesWithReader(ctx, s.store.db, userID, workspaceID, device)
}

type interfacePreferenceReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func loadInterfacePreferencesWithReader(ctx context.Context, reader interfacePreferenceReader, userID int64, workspaceID, device string) (InterfacePreferences, error) {
	preferences := defaultInterfacePreferences(device)
	var hiddenJSON, collapsedJSON, widgetsJSON, layoutJSON, itemsJSON, orderJSON, mobileJSON string
	err := reader.QueryRowContext(ctx, `SELECT hidden_nav_groups_json, collapsed_nav_groups_json, dashboard_widgets_json, layout_json, hidden_nav_items_json, nav_order_json, mobile_preferences_json, updated_at FROM user_interface_preferences WHERE user_id = ? AND workspace_id = ?`, userID, workspaceID).
		Scan(&hiddenJSON, &collapsedJSON, &widgetsJSON, &layoutJSON, &itemsJSON, &orderJSON, &mobileJSON, &preferences.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return preferences, nil
	}
	if err != nil {
		return InterfacePreferences{}, err
	}
	if device == "mobile" {
		preferences = defaultInterfacePreferences(device)
		if mobileJSON != "" {
			if err := json.Unmarshal([]byte(mobileJSON), &preferences); err != nil {
				return InterfacePreferences{}, err
			}
		}
		preferences.Device = device
		preferences.Layout = normalizeInterfaceLayout(preferences.Layout)
		return preferences, nil
	}
	if err := json.Unmarshal([]byte(hiddenJSON), &preferences.HiddenNavGroups); err != nil {
		return InterfacePreferences{}, err
	}
	if err := json.Unmarshal([]byte(collapsedJSON), &preferences.CollapsedNavGroups); err != nil {
		return InterfacePreferences{}, err
	}
	if err := json.Unmarshal([]byte(widgetsJSON), &preferences.DashboardWidgets); err != nil {
		return InterfacePreferences{}, err
	}
	preferences.HiddenNavGroups = uniqueAllowedStrings(preferences.HiddenNavGroups, interfaceNavGroups)
	preferences.CollapsedNavGroups = uniqueAllowedStrings(preferences.CollapsedNavGroups, interfaceNavGroups)
	preferences.DashboardWidgets = uniqueAllowedStrings(preferences.DashboardWidgets, interfaceDashboardWidgets)
	var layout InterfaceLayout
	if err := json.Unmarshal([]byte(layoutJSON), &layout); err != nil {
		return InterfacePreferences{}, err
	}
	preferences.Layout = normalizeInterfaceLayout(layout)
	if err := json.Unmarshal([]byte(itemsJSON), &preferences.HiddenNavItems); err != nil {
		return InterfacePreferences{}, err
	}
	if err := json.Unmarshal([]byte(orderJSON), &preferences.NavOrder); err != nil {
		return InterfacePreferences{}, err
	}
	return preferences, nil
}

func (s *Server) prepareInterfacePreferences(ctx context.Context, workspaceID, device string, input InterfacePreferences) (InterfacePreferences, error) {
	keys, err := s.navigationKeys(ctx, workspaceID)
	if err != nil {
		return InterfacePreferences{}, err
	}
	return normalizeInterfacePreferences(input, device, keys), nil
}

func normalizeInterfacePreferences(input InterfacePreferences, device string, keys map[string]bool) InterfacePreferences {
	input.HiddenNavGroups = uniqueAllowedStrings(input.HiddenNavGroups, interfaceNavGroups)
	input.CollapsedNavGroups = uniqueAllowedStrings(input.CollapsedNavGroups, interfaceNavGroups)
	input.DashboardWidgets = uniqueAllowedStrings(input.DashboardWidgets, interfaceDashboardWidgets)
	if len(input.DashboardWidgets) == 0 {
		input.DashboardWidgets = []string{"focus"}
	}
	input.Layout = normalizeInterfaceLayout(input.Layout)
	input.HiddenNavItems = uniqueAllowedStrings(input.HiddenNavItems, keys)
	input.NavOrder = uniqueAllowedStrings(input.NavOrder, keys)
	input.Device = device
	input.UpdatedAt = nowText()
	return input
}

type interfacePreferenceExecer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func persistInterfacePreferences(ctx context.Context, exec interfacePreferenceExecer, userID int64, workspaceID, device string, input InterfacePreferences) error {
	if device == "mobile" {
		mobileJSON, _ := json.Marshal(input)
		_, err := exec.ExecContext(ctx, `INSERT INTO user_interface_preferences(user_id, workspace_id, mobile_preferences_json, updated_at) VALUES(?, ?, ?, ?)
			ON CONFLICT(user_id, workspace_id) DO UPDATE SET mobile_preferences_json = excluded.mobile_preferences_json, updated_at = excluded.updated_at`, userID, workspaceID, string(mobileJSON), input.UpdatedAt)
		return err
	}
	hiddenJSON, _ := json.Marshal(input.HiddenNavGroups)
	collapsedJSON, _ := json.Marshal(input.CollapsedNavGroups)
	widgetsJSON, _ := json.Marshal(input.DashboardWidgets)
	layoutJSON, _ := json.Marshal(input.Layout)
	itemsJSON, _ := json.Marshal(input.HiddenNavItems)
	orderJSON, _ := json.Marshal(input.NavOrder)
	_, err := exec.ExecContext(ctx, `INSERT INTO user_interface_preferences(user_id, workspace_id, hidden_nav_groups_json, collapsed_nav_groups_json, dashboard_widgets_json, layout_json, hidden_nav_items_json, nav_order_json, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, workspace_id) DO UPDATE SET hidden_nav_groups_json = excluded.hidden_nav_groups_json, collapsed_nav_groups_json = excluded.collapsed_nav_groups_json, dashboard_widgets_json = excluded.dashboard_widgets_json, layout_json = excluded.layout_json, hidden_nav_items_json=excluded.hidden_nav_items_json, nav_order_json=excluded.nav_order_json, updated_at = excluded.updated_at`, userID, workspaceID, string(hiddenJSON), string(collapsedJSON), string(widgetsJSON), string(layoutJSON), string(itemsJSON), string(orderJSON), input.UpdatedAt)
	return err
}

func (s *Server) handleGetInterfacePreferences(w http.ResponseWriter, r *http.Request) {
	device, ok := interfaceDevice(w, r)
	if !ok {
		return
	}
	preferences, err := s.loadInterfacePreferences(r.Context(), currentUser(r).ID, currentWorkspace(r).ID, device)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить настройки интерфейса")
		return
	}
	writeJSON(w, http.StatusOK, preferences)
}

func (s *Server) handleUpdateInterfacePreferences(w http.ResponseWriter, r *http.Request) {
	device, ok := interfaceDevice(w, r)
	if !ok {
		return
	}
	var input InterfacePreferences
	if !decodeJSON(w, r, &input) {
		return
	}
	input, err := s.prepareInterfacePreferences(r.Context(), currentWorkspace(r).ID, device, input)
	if err != nil {
		writeError(w, 500, "Не удалось проверить пункты меню")
		return
	}
	if err := persistInterfacePreferences(r.Context(), s.store.db, currentUser(r).ID, currentWorkspace(r).ID, device, input); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить настройки интерфейса")
		return
	}
	writeJSON(w, http.StatusOK, input)
}
