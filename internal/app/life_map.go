package app

import (
	"database/sql"
	"net/http"
	"time"
)

func (s *Server) handleLifeSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		BirthDate         string  `json:"birthDate"`
		Years             int     `json:"lifeExpectancyYears"`
		ExpectedBirthDate *string `json:"expectedBirthDate"`
		ExpectedYears     *int    `json:"expectedYears"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Years < 1 || input.Years > 150 || input.ExpectedBirthDate == nil || input.ExpectedYears == nil || (input.BirthDate != "" && (!validDate(input.BirthDate) || input.BirthDate > time.Now().UTC().Format("2006-01-02"))) {
		writeError(w, 400, "Укажите корректную дату рождения и горизонт от 1 до 150 лет")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить настройки карты")
		return
	}
	defer tx.Rollback()
	var birth sql.NullString
	var years int
	if err = tx.QueryRowContext(r.Context(), `SELECT birth_date,life_expectancy_years FROM users WHERE id=?`, currentUser(r).ID).Scan(&birth, &years); err != nil {
		writeError(w, 500, "Не удалось прочитать настройки карты")
		return
	}
	if birth.String != input.BirthDate || years != input.Years {
		if birth.String != *input.ExpectedBirthDate || years != *input.ExpectedYears {
			writeError(w, 409, "Настройки карты изменились в другом окне. Обновите страницу перед сохранением")
			return
		}
		if _, err = tx.ExecContext(r.Context(), `UPDATE users SET birth_date=NULLIF(?,''),life_expectancy_years=?,updated_at=? WHERE id=?`, input.BirthDate, input.Years, nowText(), currentUser(r).ID); err != nil {
			writeError(w, 500, "Не удалось сохранить настройки карты")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить настройки карты")
		return
	}
	var date *string
	if input.BirthDate != "" {
		date = &input.BirthDate
	}
	writeJSON(w, 200, PersonalSettings{BirthDate: date, LifeExpectancyYears: input.Years})
}
