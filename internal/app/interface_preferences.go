package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
)

var interfaceNavGroups = map[string]bool{
	"Личное": true, "Работа": true, "Основа": true, "Бизнес": true, "Контроль": true, "Настройки": true,
}

var interfaceDashboardWidgets = map[string]bool{
	"focus": true, "capture": true, "capacity": true, "quality": true,
}

var defaultDashboardWidgets = []string{"focus", "capture", "capacity", "quality"}

type InterfacePreferences struct {
	HiddenNavGroups    []string        `json:"hiddenNavGroups"`
	CollapsedNavGroups []string        `json:"collapsedNavGroups"`
	DashboardWidgets   []string        `json:"dashboardWidgets"`
	Layout             InterfaceLayout `json:"layout"`
	UpdatedAt          string          `json:"updatedAt,omitempty"`
}

type InterfaceLayout struct {
	ContentWidth   int            `json:"contentWidth"`
	SidebarWidth   int            `json:"sidebarWidth"`
	SidebarSide    string         `json:"sidebarSide"`
	Density        string         `json:"density"`
	WidgetSpans    map[string]int `json:"widgetSpans"`
	ToolbarActions []string       `json:"toolbarActions"`
	QuickActions   []string       `json:"quickActions"`
}

func normalizeInterfaceLayout(layout InterfaceLayout) InterfaceLayout {
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

func (s *Server) handleGetInterfacePreferences(w http.ResponseWriter, r *http.Request) {
	preferences := InterfacePreferences{HiddenNavGroups: []string{}, CollapsedNavGroups: []string{}, DashboardWidgets: append([]string(nil), defaultDashboardWidgets...), Layout: normalizeInterfaceLayout(InterfaceLayout{})}
	var hiddenJSON, collapsedJSON, widgetsJSON, layoutJSON string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT hidden_nav_groups_json, collapsed_nav_groups_json, dashboard_widgets_json, layout_json, updated_at FROM user_interface_preferences WHERE user_id = ? AND workspace_id = ?`, currentUser(r).ID, currentWorkspace(r).ID).
		Scan(&hiddenJSON, &collapsedJSON, &widgetsJSON, &layoutJSON, &preferences.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusOK, preferences)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить настройки интерфейса")
		return
	}
	if json.Unmarshal([]byte(hiddenJSON), &preferences.HiddenNavGroups) != nil || json.Unmarshal([]byte(collapsedJSON), &preferences.CollapsedNavGroups) != nil || json.Unmarshal([]byte(widgetsJSON), &preferences.DashboardWidgets) != nil {
		writeError(w, http.StatusInternalServerError, "Настройки интерфейса повреждены")
		return
	}
	preferences.HiddenNavGroups = uniqueAllowedStrings(preferences.HiddenNavGroups, interfaceNavGroups)
	preferences.CollapsedNavGroups = uniqueAllowedStrings(preferences.CollapsedNavGroups, interfaceNavGroups)
	preferences.DashboardWidgets = uniqueAllowedStrings(preferences.DashboardWidgets, interfaceDashboardWidgets)
	var layout InterfaceLayout
	if json.Unmarshal([]byte(layoutJSON), &layout) != nil {
		writeError(w, http.StatusInternalServerError, "Настройки раскладки повреждены")
		return
	}
	preferences.Layout = normalizeInterfaceLayout(layout)
	writeJSON(w, http.StatusOK, preferences)
}

func (s *Server) handleUpdateInterfacePreferences(w http.ResponseWriter, r *http.Request) {
	var input InterfacePreferences
	if !decodeJSON(w, r, &input) {
		return
	}
	input.HiddenNavGroups = uniqueAllowedStrings(input.HiddenNavGroups, interfaceNavGroups)
	input.CollapsedNavGroups = uniqueAllowedStrings(input.CollapsedNavGroups, interfaceNavGroups)
	input.DashboardWidgets = uniqueAllowedStrings(input.DashboardWidgets, interfaceDashboardWidgets)
	if len(input.DashboardWidgets) == 0 {
		input.DashboardWidgets = []string{"focus"}
	}
	input.Layout = normalizeInterfaceLayout(input.Layout)
	hiddenJSON, _ := json.Marshal(input.HiddenNavGroups)
	collapsedJSON, _ := json.Marshal(input.CollapsedNavGroups)
	widgetsJSON, _ := json.Marshal(input.DashboardWidgets)
	layoutJSON, _ := json.Marshal(input.Layout)
	input.UpdatedAt = nowText()
	if _, err := s.store.db.ExecContext(r.Context(), `INSERT INTO user_interface_preferences(user_id, workspace_id, hidden_nav_groups_json, collapsed_nav_groups_json, dashboard_widgets_json, layout_json, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, workspace_id) DO UPDATE SET hidden_nav_groups_json = excluded.hidden_nav_groups_json, collapsed_nav_groups_json = excluded.collapsed_nav_groups_json, dashboard_widgets_json = excluded.dashboard_widgets_json, layout_json = excluded.layout_json, updated_at = excluded.updated_at`, currentUser(r).ID, currentWorkspace(r).ID, string(hiddenJSON), string(collapsedJSON), string(widgetsJSON), string(layoutJSON), input.UpdatedAt); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить настройки интерфейса")
		return
	}
	writeJSON(w, http.StatusOK, input)
}
