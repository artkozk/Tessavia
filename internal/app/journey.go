package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"slices"
)

type journeyPreferences struct {
	TipsEnabled bool     `json:"tipsEnabled"`
	Dismissed   []string `json:"dismissed"`
}

func (s *Server) handleJourneyPreferences(w http.ResponseWriter, r *http.Request) {
	input := struct {
		TipsEnabled *bool  `json:"tipsEnabled"`
		Dismiss     string `json:"dismiss"`
	}{}
	if r.Method == "PATCH" {
		if !decodeJSON(w, r, &input) {
			return
		}
		if input.Dismiss != "" && !slices.Contains([]string{"first-use", "constructor", "relationships", "publication"}, input.Dismiss) {
			writeError(w, 400, "Неизвестная подсказка")
			return
		}
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть настройки помощи")
		return
	}
	defer tx.Rollback()
	prefs := journeyPreferences{TipsEnabled: true, Dismissed: []string{}}
	var dismissed string
	err = tx.QueryRowContext(r.Context(), `SELECT tips_enabled,dismissed_json FROM user_journey_preferences WHERE owner_id=?`, currentUser(r).ID).Scan(&prefs.TipsEnabled, &dismissed)
	if err != nil && err != sql.ErrNoRows {
		writeError(w, 500, "Не удалось прочитать настройки помощи")
		return
	}
	if dismissed != "" {
		if json.Unmarshal([]byte(dismissed), &prefs.Dismissed) != nil {
			writeError(w, 500, "Не удалось прочитать настройки помощи")
			return
		}
	}
	if r.Method == "PATCH" {
		if input.TipsEnabled != nil {
			prefs.TipsEnabled = *input.TipsEnabled
		}
		// Append a dismissal inside the transaction: another device's dismissals survive.
		if input.Dismiss != "" && !slices.Contains(prefs.Dismissed, input.Dismiss) {
			prefs.Dismissed = append(prefs.Dismissed, input.Dismiss)
		}
		raw, _ := json.Marshal(prefs.Dismissed)
		_, err = tx.ExecContext(r.Context(), `INSERT INTO user_journey_preferences(owner_id,tips_enabled,dismissed_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET tips_enabled=excluded.tips_enabled,dismissed_json=excluded.dismissed_json,updated_at=excluded.updated_at`, currentUser(r).ID, prefs.TipsEnabled, string(raw), nowText())
		if err != nil {
			writeError(w, 500, "Не удалось сохранить настройки помощи")
			return
		}
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось подтвердить настройки помощи")
		return
	}
	writeJSON(w, 200, prefs)
}
