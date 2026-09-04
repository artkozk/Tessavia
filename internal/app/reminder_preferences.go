package app

import (
	"context"
	"database/sql"
	"net/http"
	"time"
)

type reminderPreferences struct {
	HabitsEnabled   bool                        `json:"habitsEnabled"`
	PersonalEnabled bool                        `json:"personalEnabled"`
	DeadlineEnabled bool                        `json:"deadlineEnabled"`
	Timezone        string                      `json:"timezone"`
	QuietStart      string                      `json:"quietStart"`
	QuietEnd        string                      `json:"quietEnd"`
	UpdatedAt       string                      `json:"updatedAt"`
	Projects        []reminderProjectPreference `json:"projects"`
}
type reminderProjectPreference struct {
	WorkspaceID string `json:"workspaceId"`
	Name        string `json:"name,omitempty"`
	Enabled     bool   `json:"enabled"`
}

const reminderWorkspaceAccess = `w.archived_at IS NULL AND m.status='active'
 AND (w.team_id IS NULL OR EXISTS(SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
 WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=m.user_id AND tm.status='active'))`

func loadReminderPreferences(ctx context.Context, q personalQueryer, user int64) (reminderPreferences, error) {
	p := reminderPreferences{HabitsEnabled: true, PersonalEnabled: true, DeadlineEnabled: true, Timezone: "Europe/Moscow", Projects: []reminderProjectPreference{}}
	err := q.QueryRowContext(ctx, `SELECT deadline_enabled,timezone,quiet_start,quiet_end,updated_at,personal_enabled,habits_enabled FROM reminder_preferences WHERE user_id=?`, user).Scan(&p.DeadlineEnabled, &p.Timezone, &p.QuietStart, &p.QuietEnd, &p.UpdatedAt, &p.PersonalEnabled, &p.HabitsEnabled)
	if err == sql.ErrNoRows {
		err = nil
	}
	return p, err
}
func reminderProjectEnabled(ctx context.Context, q personalQueryer, user int64, workspace string) (bool, error) {
	enabled := true
	err := q.QueryRowContext(ctx, `SELECT deadline_enabled FROM reminder_project_preferences WHERE user_id=? AND workspace_id=?`, user, workspace).Scan(&enabled)
	if err == sql.ErrNoRows {
		err = nil
	}
	return enabled, err
}
func reminderQuiet(p reminderPreferences, now time.Time, loc *time.Location) bool {
	if p.QuietStart == "" || p.QuietEnd == "" {
		return false
	}
	clock := now.In(loc).Format("15:04")
	if p.QuietStart < p.QuietEnd {
		return clock >= p.QuietStart && clock < p.QuietEnd
	}
	return clock >= p.QuietStart || clock < p.QuietEnd
}

func (s *Server) handleReminderPreferences(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r).ID
	if r.Method == http.MethodPut {
		var input struct {
			reminderPreferences
			HabitsEnabled     *bool   `json:"habitsEnabled"`
			PersonalEnabled   *bool   `json:"personalEnabled"`
			ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
		}
		if !decodeJSON(w, r, &input) {
			return
		}
		if input.ExpectedUpdatedAt == nil || input.Timezone == "" || input.Timezone == "Local" || len(input.Timezone) > 64 || len(input.Projects) > 500 {
			writeError(w, 400, "Укажите часовой пояс и текущую версию настроек")
			return
		}
		if _, err := time.LoadLocation(input.Timezone); err != nil {
			writeError(w, 400, "Неизвестный часовой пояс")
			return
		}
		if (input.QuietStart != "" || input.QuietEnd != "") && (!validDayClock(input.QuietStart) || !validDayClock(input.QuietEnd) || input.QuietStart == input.QuietEnd) {
			writeError(w, 400, "Укажите разные начало и конец тихих часов или очистите оба поля")
			return
		}
		tx, err := s.store.db.BeginTx(r.Context(), nil)
		if err != nil {
			writeError(w, 500, "Не удалось сохранить настройки напоминаний")
			return
		}
		defer tx.Rollback()
		old, err := loadReminderPreferences(r.Context(), tx, user)
		if err != nil {
			writeError(w, 500, "Не удалось прочитать настройки")
			return
		}
		habitsEnabled := old.HabitsEnabled
		if input.HabitsEnabled != nil {
			habitsEnabled = *input.HabitsEnabled
		}
		personalEnabled := old.PersonalEnabled
		if input.PersonalEnabled != nil {
			personalEnabled = *input.PersonalEnabled
		}
		changed := old.HabitsEnabled != habitsEnabled || old.PersonalEnabled != personalEnabled || old.DeadlineEnabled != input.DeadlineEnabled || old.Timezone != input.Timezone || old.QuietStart != input.QuietStart || old.QuietEnd != input.QuietEnd
		seen := map[string]bool{}
		for _, project := range input.Projects {
			if project.WorkspaceID == "" || seen[project.WorkspaceID] {
				writeError(w, 400, "Проект указан повторно или без идентификатора")
				return
			}
			seen[project.WorkspaceID] = true
			var allowed int
			err = tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE w.id=? AND w.kind='team' AND m.user_id=? AND `+reminderWorkspaceAccess, project.WorkspaceID, user).Scan(&allowed)
			if err != nil {
				writeError(w, 500, "Не удалось проверить доступ к проекту")
				return
			}
			if allowed == 0 {
				writeError(w, 403, "Доступ к одному из проектов изменился. Обновите список проектов")
				return
			}
			enabled, err := reminderProjectEnabled(r.Context(), tx, user, project.WorkspaceID)
			if err != nil {
				writeError(w, 500, "Не удалось прочитать настройку проекта")
				return
			}
			changed = changed || enabled != project.Enabled
		}
		if changed {
			if old.UpdatedAt != *input.ExpectedUpdatedAt {
				writeError(w, 409, "Настройки изменились в другом окне. Сравните текущий выбор перед сохранением")
				return
			}
			stamp := nowText()
			if _, err = tx.ExecContext(r.Context(), `INSERT INTO reminder_preferences(user_id,deadline_enabled,timezone,quiet_start,quiet_end,updated_at,personal_enabled,habits_enabled) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET deadline_enabled=excluded.deadline_enabled,timezone=excluded.timezone,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,updated_at=excluded.updated_at,personal_enabled=excluded.personal_enabled,habits_enabled=excluded.habits_enabled`, user, input.DeadlineEnabled, input.Timezone, input.QuietStart, input.QuietEnd, stamp, personalEnabled, habitsEnabled); err != nil {
				writeError(w, 500, "Не удалось сохранить настройки")
				return
			}
			for _, project := range input.Projects {
				if _, err = tx.ExecContext(r.Context(), `INSERT INTO reminder_project_preferences(user_id,workspace_id,deadline_enabled) VALUES(?,?,?) ON CONFLICT(user_id,workspace_id) DO UPDATE SET deadline_enabled=excluded.deadline_enabled`, user, project.WorkspaceID, project.Enabled); err != nil {
					writeError(w, 500, "Не удалось сохранить выбор проектов")
					return
				}
			}
		}
		if tx.Commit() != nil {
			writeError(w, 500, "Не удалось подтвердить сохранение")
			return
		}
	}
	p, err := loadReminderPreferences(r.Context(), s.store.db, user)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать настройки напоминаний")
		return
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT w.id,w.name,COALESCE(pref.deadline_enabled,1) FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id LEFT JOIN reminder_project_preferences pref ON pref.workspace_id=w.id AND pref.user_id=m.user_id WHERE m.user_id=? AND w.kind='team' AND `+reminderWorkspaceAccess+` ORDER BY w.name,w.id`, user)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать список проектов")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var project reminderProjectPreference
		if err = rows.Scan(&project.WorkspaceID, &project.Name, &project.Enabled); err != nil {
			writeError(w, 500, "Не удалось прочитать проект")
			return
		}
		p.Projects = append(p.Projects, project)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось дочитать проекты")
		return
	}
	writeJSON(w, 200, p)
}
