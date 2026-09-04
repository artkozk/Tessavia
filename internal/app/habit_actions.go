package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

func oneOf(value string, options ...string) bool {
	for _, option := range options {
		if value == option {
			return true
		}
	}
	return false
}

type habitInput struct {
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	ColorKey      string     `json:"colorKey"`
	IconKey       string     `json:"iconKey"`
	Timezone      string     `json:"timezone"`
	StartDate     string     `json:"startDate"`
	Rule          *HabitRule `json:"rule"`
	Revision      int        `json:"revision"`
	ScheduleKind  string     `json:"scheduleKind"`
	TargetPerWeek int        `json:"targetPerWeek"`
	Unit          string     `json:"unit"`
}

func validTrackerRule(rule HabitRule, start string) bool {
	if rule.ReminderTime != "" {
		if _, err := time.Parse("15:04", rule.ReminderTime); err != nil {
			return false
		}
	}
	if rule.Mode == "duration" && rule.Unit != "мин" {
		return false
	}
	if rule.Mode == "build" && rule.Target != 1 {
		return false
	}

	if !oneOf(rule.Mode, "build", "quantity", "duration", "quit", "reduce") || !oneOf(rule.Cadence, "daily", "weekdays", "interval", "weekly", "monthly") {
		return false
	}
	if rule.Target < 0 || rule.Target > 1000000 || rule.Mode != "quit" && rule.Mode != "reduce" && rule.Target == 0 || rule.Mode == "quit" && rule.Target != 0 {
		return false
	}
	if rule.Interval < 1 || rule.Interval > 365 || len([]rune(rule.Unit)) < 1 || len([]rune(rule.Unit)) > 32 {
		return false
	}
	if rule.EndDate != "" && (!validDate(rule.EndDate) || rule.EndDate < start) {
		return false
	}
	if rule.Cadence == "weekdays" {
		if len(rule.Weekdays) == 0 || len(rule.Weekdays) > 7 {
			return false
		}
		seen := map[int]bool{}
		for _, v := range rule.Weekdays {
			if v < 0 || v > 6 || seen[v] {
				return false
			}
			seen[v] = true
		}
	}
	if rule.Cadence == "weekly" || rule.Cadence == "monthly" {
		if rule.Mode == "quit" || rule.Mode == "reduce" || !oneOf(rule.PeriodMeasure, "days", "volume") || rule.PeriodTarget <= 0 || rule.PeriodTarget > 1000000 {
			return false
		}
		maxDays := 31.0
		if rule.Cadence == "weekly" {
			maxDays = 7
		}
		if rule.PeriodMeasure == "days" && (rule.PeriodTarget > maxDays || rule.PeriodTarget != float64(int(rule.PeriodTarget))) {
			return false
		}
	}
	return true
}
func (s *Server) handleCreatePersonalHabit(w http.ResponseWriter, r *http.Request) {
	s.saveHabit(w, r, false)
}
func (s *Server) handleUpdatePersonalHabit(w http.ResponseWriter, r *http.Request) {
	s.saveHabit(w, r, true)
}
func (s *Server) saveHabit(w http.ResponseWriter, r *http.Request, editing bool) {
	var in habitInput
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	if len([]rune(in.Title)) < 1 || len([]rune(in.Title)) > 160 || len([]rune(in.Description)) > 5000 {
		writeError(w, 400, "Укажите название до 160 символов и описание до 5000")
		return
	}
	var h PersonalHabit
	if editing {
		var ok bool
		h, ok = s.ownedHabit(w, r)
		if !ok {
			return
		}
		if h.ArchivedAt != "" {
			writeError(w, 409, "Сначала восстановите привычку")
			return
		}
		if in.Revision != h.Revision {
			writeError(w, 409, "Настройки изменились. Откройте их заново; черновик сохранён.")
			return
		}
	}
	if in.Timezone == "" {
		in.Timezone = "Europe/Moscow"
	}
	if editing {
		in.Timezone = h.Timezone
		in.StartDate = h.StartDate
	}
	loc, err := time.LoadLocation(in.Timezone)
	if err != nil {
		writeError(w, 400, "Неизвестный часовой пояс")
		return
	}
	today := time.Now().In(loc).Format("2006-01-02")
	if in.StartDate == "" {
		in.StartDate = today
	}
	if !validDate(in.StartDate) || in.StartDate < "2000-01-01" || in.StartDate > habitAdd(today, 366) {
		writeError(w, 400, "Проверьте дату начала (с 2000 года, не дальше года вперёд)")
		return
	}
	if in.ColorKey == "" {
		in.ColorKey = "green"
	}
	if in.IconKey == "" {
		in.IconKey = "checkSquare"
	}
	if !oneOf(in.ColorKey, "green", "blue", "purple", "orange", "pink") || !oneOf(in.IconKey, "checkSquare", "heart", "book", "clock", "activity", "target") {
		writeError(w, 400, "Неизвестный цвет или значок")
		return
	}
	if in.Rule == nil { // Original API create payload remains compatible.
		cadence := in.ScheduleKind
		if cadence == "" {
			cadence = "daily"
		}
		if cadence == "weekly_target" {
			cadence = "weekly"
		}
		if in.Unit == "" {
			in.Unit = "раз"
		}
		if in.TargetPerWeek == 0 {
			in.TargetPerWeek = 7
		}
		in.Rule = &HabitRule{Mode: "build", Cadence: cadence, Target: 1, PeriodTarget: float64(in.TargetPerWeek), PeriodMeasure: "days", Interval: 1, Weekdays: []int{1, 2, 3, 4, 5}, Unit: in.Unit}
	}
	rule := *in.Rule
	if !validTrackerRule(rule, in.StartDate) {
		writeError(w, 400, "Проверьте режим, цель, единицы и расписание")
		return
	}
	newRule := true
	if editing {
		if rule.Mode != h.Rule.Mode || rule.Unit != h.Rule.Unit {
			writeError(w, 400, "Режим и единицы сохраняют смысл истории. Для другого измерения создайте новую привычку.")
			return
		}
		if rule.EffectiveDate == "" {
			rule.EffectiveDate = habitAdd(today, 1)
		}
		previousRule, comparison := habitRuleOn(h, rule.EffectiveDate), rule
		previousRule.EffectiveDate, comparison.EffectiveDate = "", ""
		beforeJSON, _ := json.Marshal(previousRule)
		afterJSON, _ := json.Marshal(comparison)
		newRule = string(beforeJSON) != string(afterJSON)
		if newRule && (!validDate(rule.EffectiveDate) || rule.EffectiveDate <= today || rule.EffectiveDate > habitAdd(today, 366)) {
			writeError(w, 400, "Новая цель действует с завтрашнего дня или позже")
			return
		}
		// Quota changes start on a period boundary: no retroactive target for the
		// already-started week/month. Daily schedules can change on any future day.
		for _, cadence := range []string{h.Rule.Cadence, rule.Cadence} {
			if !newRule {
				break
			}
			if cadence == "weekly" || cadence == "monthly" {
				start, _ := habitPeriodBounds(rule.EffectiveDate, cadence)
				if start != rule.EffectiveDate {
					writeError(w, 400, "Для недельной/месячной цели выберите начало следующей недели/месяца")
					return
				}
			}
		}
	} else {
		rule.EffectiveDate = in.StartDate
		var ok bool
		h.ID, ok = newPersonalID(w)
		if !ok {
			return
		}
	}
	raw, err := json.Marshal(rule)
	if err != nil {
		writeError(w, 400, "Некорректная цель")
		return
	}
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить привычку")
		return
	}
	defer tx.Rollback()
	if editing {
		result, e := tx.ExecContext(r.Context(), `UPDATE personal_habits SET title=?,description=?,color_key=?,icon_key=?,updated_at=?,revision=revision+1 WHERE id=? AND owner_id=? AND revision=?`, in.Title, in.Description, in.ColorKey, in.IconKey, now, h.ID, currentUser(r).ID, h.Revision)
		err = e
		if err == nil && affectedRows(result) == 0 {
			writeError(w, 409, "Настройки уже изменены в другом окне")
			return
		}
	} else {
		legacy := "daily"
		if rule.Cadence == "weekdays" {
			legacy = "weekdays"
		}
		if rule.Cadence == "weekly" {
			legacy = "weekly_target"
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_habits(id,owner_id,title,schedule_kind,target_per_week,unit,start_date,created_at,updated_at,description,color_key,icon_key,timezone) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, h.ID, currentUser(r).ID, in.Title, legacy, 7, rule.Unit, in.StartDate, now, now, in.Description, in.ColorKey, in.IconKey, in.Timezone)
	}
	if err == nil && newRule {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_habit_rules(habit_id,effective_date,config) VALUES(?,?,?) ON CONFLICT(habit_id,effective_date) DO UPDATE SET config=excluded.config`, h.ID, rule.EffectiveDate, string(raw))
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить привычку")
		return
	}
	items, err := s.loadHabits(r, currentUser(r).ID, h.ID, today)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать привычку")
		return
	}
	status := 201
	if editing {
		status = 200
	}
	writeJSON(w, status, items[0])
}

func (s *Server) ownedHabit(w http.ResponseWriter, r *http.Request) (PersonalHabit, bool) {
	items, err := s.loadHabits(r, currentUser(r).ID, r.PathValue("id"), r.PathValue("date"))
	if err != nil {
		writeError(w, 500, "Не удалось прочитать привычку")
		return PersonalHabit{}, false
	}
	if len(items) != 1 {
		writeError(w, 404, "Привычка не найдена")
		return PersonalHabit{}, false
	}
	return items[0], true
}
func (s *Server) handleSetHabitCheckin(w http.ResponseWriter, r *http.Request) {
	s.writeHabitCheckin(w, r, false)
}
func (s *Server) handleDeleteHabitCheckin(w http.ResponseWriter, r *http.Request) {
	s.writeHabitCheckin(w, r, true)
}
func (s *Server) writeHabitCheckin(w http.ResponseWriter, r *http.Request, deleting bool) {
	h, ok := s.ownedHabit(w, r)
	if !ok {
		return
	}
	var in struct {
		Value             float64 `json:"value"`
		State             string  `json:"state"`
		Note              string  `json:"note"`
		ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
		Revision          int     `json:"revision"`
	}
	if !deleting || r.ContentLength > 0 {
		if !decodeJSON(w, r, &in) {
			return
		}
	}
	if in.State == "" {
		in.State = "measured"
	}
	date := r.PathValue("date")
	if !validDate(date) {
		writeError(w, 400, "Некорректная дата")
		return
	}
	checks := map[string]HabitCheckin{}
	for _, c := range h.Checkins {
		checks[c.Date] = c
	}
	d := habitDay(h, date, habitToday(h), checks)
	if !d.Editable {
		writeError(w, 400, "Отметка доступна только в прошедший или сегодняшний плановый день вне паузы и архива")
		return
	}
	if in.Revision != 0 && in.Revision != h.Revision {
		writeError(w, 409, "Расписание изменилось. Откройте день заново.")
		return
	}
	if !oneOf(in.State, "measured", "failed", "skipped", "snoozed") || in.Value < 0 || in.Value > 1000000 || len([]rune(in.Note)) > 1000 {
		writeError(w, 400, "Проверьте количество и заметку (до 1000 символов)")
		return
	}
	if in.State == "snoozed" && date != habitToday(h) {
		writeError(w, 400, "Отложить можно только сегодняшний результат")
		return
	}
	postponing := !deleting && in.State == "snoozed"
	if postponing && in.ExpectedUpdatedAt == nil {
		writeError(w, 400, "Для откладывания нужна текущая версия результата")
		return
	}
	if in.State != "measured" {
		in.Value = 0
	}
	in.Note = strings.TrimSpace(in.Note)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить результат")
		return
	}
	defer tx.Rollback()
	var old HabitCheckin
	old.Date = date
	err = tx.QueryRowContext(r.Context(), `SELECT COALESCE(amount,value),note,updated_at,result_state,snoozed_at,snoozed_from FROM personal_habit_checkins WHERE habit_id=? AND owner_id=? AND checkin_date=?`, h.ID, currentUser(r).ID, date).Scan(&old.Value, &old.Note, &old.UpdatedAt, &old.State, &old.SnoozedAt, &old.SnoozedFrom)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось прочитать результат")
		return
	}
	// A repeated absolute PUT is safe after a lost reply, including fractional zero.
	if postponing && old.SnoozedAt != "" && old.SnoozedFrom == *in.ExpectedUpdatedAt {
		writeJSON(w, 200, old)
		return
	}
	if !deleting && !postponing && old.SnoozedAt == "" && old.UpdatedAt != "" && old.Value == in.Value && old.Note == in.Note && old.State == in.State {
		writeJSON(w, 200, old)
		return
	}
	if in.ExpectedUpdatedAt != nil && *in.ExpectedUpdatedAt != old.UpdatedAt {
		writeError(w, 409, "Результат изменён в другом окне. Ваш ввод сохранён; обновите трекер перед исправлением.")
		return
	}
	var rev int
	err = tx.QueryRowContext(r.Context(), `SELECT revision FROM personal_habits WHERE id=? AND owner_id=?`, h.ID, currentUser(r).ID).Scan(&rev)
	if err != nil || rev != h.Revision {
		writeError(w, 409, "Настройки изменились. Откройте день заново.")
		return
	}
	now := nowText()
	snoozedAt, snoozedFrom := "", ""
	if postponing {
		for _, pause := range h.Pauses {
			if date >= pause.StartDate && (pause.EndDate == "" || date <= pause.EndDate) {
				writeError(w, 400, "Привычка на паузе; откладывание не требуется")
				return
			}
		}
		if old.UpdatedAt != "" {
			checks[date] = old
		} else {
			delete(checks, date)
		}
		day := habitDay(h, date, habitToday(h), checks)
		if !oneOf(day.State, "pending", "partial", "snoozed") {
			writeError(w, 400, "Отложить можно только ещё не завершённый день")
			return
		}
		// Deferral is separate from the measured fact, including fractional values.
		if old.UpdatedAt != "" {
			in.State, in.Value = old.State, old.Value
		}
		in.Note = old.Note
		snoozedAt, snoozedFrom = now, *in.ExpectedUpdatedAt
	}
	if deleting {
		_, err = tx.ExecContext(r.Context(), `DELETE FROM personal_habit_checkins WHERE habit_id=? AND owner_id=? AND checkin_date=?`, h.ID, currentUser(r).ID, date)
	} else {
		id, valid := newPersonalID(w)
		if !valid {
			return
		}
		// The old integer projection stays compatible with old binaries. Exact
		// measurement is amount; no existing historical value is altered by migration.
		legacy := 0
		if in.Value > 0 {
			legacy = 1
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_habit_checkins(id,habit_id,owner_id,checkin_date,value,amount,note,result_state,created_at,updated_at,snoozed_at,snoozed_from) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(habit_id,checkin_date) DO UPDATE SET value=excluded.value,amount=excluded.amount,note=excluded.note,result_state=excluded.result_state,updated_at=excluded.updated_at,snoozed_at=excluded.snoozed_at,snoozed_from=excluded.snoozed_from`, id, h.ID, currentUser(r).ID, date, legacy, in.Value, in.Note, in.State, now, now, snoozedAt, snoozedFrom)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить результат")
		return
	}
	if deleting {
		w.WriteHeader(204)
	} else {
		writeJSON(w, 200, HabitCheckin{Date: date, Value: in.Value, Note: in.Note, State: in.State, UpdatedAt: now, SnoozedAt: snoozedAt})
	}
}

func (s *Server) handleArchivePersonalHabit(w http.ResponseWriter, r *http.Request) {
	s.habitLifecycle(w, r, "archive")
}
func (s *Server) handleHabitRestore(w http.ResponseWriter, r *http.Request) {
	s.habitLifecycle(w, r, "restore")
}
func (s *Server) handleHabitPause(w http.ResponseWriter, r *http.Request) {
	s.habitLifecycle(w, r, "pause")
}
func (s *Server) handleHabitResume(w http.ResponseWriter, r *http.Request) {
	s.habitLifecycle(w, r, "resume")
}
func (s *Server) habitLifecycle(w http.ResponseWriter, r *http.Request, action string) {
	h, ok := s.ownedHabit(w, r)
	if !ok {
		return
	}
	var in struct {
		Revision int    `json:"revision"`
		EndDate  string `json:"endDate"`
	}
	if r.ContentLength > 0 && !decodeJSON(w, r, &in) {
		return
	}
	if in.Revision != h.Revision {
		writeError(w, 409, "Привычка изменена. Обновите трекер.")
		return
	}
	today := habitToday(h)
	if in.EndDate != "" && (!validDate(in.EndDate) || in.EndDate < today || in.EndDate > habitAdd(today, 366)) {
		writeError(w, 400, "Проверьте последний день паузы")
		return
	}
	if action == "restore" && h.ArchivedAt == "" || action != "restore" && h.ArchivedAt != "" {
		writeError(w, 409, "Состояние привычки уже изменилось")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить состояние")
		return
	}
	defer tx.Rollback()
	now := nowText()
	var archived any
	if action == "archive" {
		archived = now
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE personal_habits SET archived_at=?,updated_at=?,revision=revision+1 WHERE id=? AND owner_id=? AND revision=?`, archived, now, h.ID, currentUser(r).ID, h.Revision)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить состояние")
		return
	}
	if affectedRows(result) == 0 {
		writeError(w, 409, "Привычка уже изменена")
		return
	}
	if action == "pause" || action == "archive" {
		// Replacing an active pause closes only its future portion, preserving history.
		_, err = tx.ExecContext(r.Context(), `UPDATE personal_habit_pauses SET end_date=? WHERE habit_id=? AND (end_date='' OR end_date>=?)`, habitAdd(today, -1), h.ID, today)
		if err == nil {
			id, valid := newPersonalID(w)
			if !valid {
				return
			}
			_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_habit_pauses(id,habit_id,start_date,end_date,reason) VALUES(?,?,?,?,?)`, id, h.ID, today, in.EndDate, action)
		}
	} else {
		_, err = tx.ExecContext(r.Context(), `UPDATE personal_habit_pauses SET end_date=? WHERE habit_id=? AND (end_date='' OR end_date>=?)`, habitAdd(today, -1), h.ID, today)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить паузу")
		return
	}
	w.WriteHeader(204)
}

func (s *Server) handleHabitMove(w http.ResponseWriter, r *http.Request) {
	h, ok := s.ownedHabit(w, r)
	if !ok {
		return
	}
	var in struct {
		SourceDate string `json:"sourceDate"`
		TargetDate string `json:"targetDate"`
		Revision   int    `json:"revision"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	today := habitToday(h)
	rule := habitRuleOn(h, in.SourceDate)
	if in.Revision != h.Revision {
		writeError(w, 409, "Расписание изменено")
		return
	}
	if h.ArchivedAt != "" || h.Paused || rule.Mode == "quit" || rule.Mode == "reduce" || rule.Cadence == "weekly" || rule.Cadence == "monthly" {
		writeError(w, 400, "Для этого режима перенос недоступен; у цели на период дни уже свободные")
		return
	}
	if !validDate(in.SourceDate) || !validDate(in.TargetDate) || in.SourceDate < today || in.TargetDate < today || in.TargetDate > habitAdd(today, 366) || in.SourceDate > habitAdd(today, 366) || in.TargetDate == in.SourceDate || !habitScheduled(h, rule, in.SourceDate) || habitScheduled(h, habitRuleOn(h, in.TargetDate), in.TargetDate) || in.TargetDate < h.StartDate || rule.EndDate != "" && in.TargetDate > rule.EndDate {
		writeError(w, 400, "Переносите предстоящее выполнение на свободный день в пределах года")
		return
	}
	for _, c := range h.Checkins {
		if c.Date == in.SourceDate || c.Date == in.TargetDate {
			writeError(w, 409, "В этот день уже есть результат")
			return
		}
	}
	for _, m := range h.Moves {
		if m.SourceDate == in.SourceDate || m.TargetDate == in.SourceDate || m.TargetDate == in.TargetDate || m.SourceDate == in.TargetDate {
			writeError(w, 409, "Эти даты уже участвуют в переносе")
			return
		}
	}
	for _, p := range h.Pauses {
		if in.TargetDate >= p.StartDate && (p.EndDate == "" || in.TargetDate <= p.EndDate) {
			writeError(w, 400, "На выбранную дату действует пауза")
			return
		}
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось перенести")
		return
	}
	defer tx.Rollback()
	var existingFacts int
	err = tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_habit_checkins WHERE habit_id=? AND checkin_date IN (?,?)`, h.ID, in.SourceDate, in.TargetDate).Scan(&existingFacts)
	if err != nil {
		writeError(w, 500, "Не удалось проверить результаты перед переносом")
		return
	}
	if existingFacts != 0 {
		writeError(w, 409, "В этот день уже сохранён результат. Перенос отменён.")
		return
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE personal_habits SET revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?`, nowText(), h.ID, currentUser(r).ID, h.Revision)
	if err == nil && affectedRows(result) == 0 {
		writeError(w, 409, "Расписание изменилось")
		return
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_habit_moves(habit_id,source_date,target_date) VALUES(?,?,?)`, h.ID, in.SourceDate, in.TargetDate)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 409, "Перенос не сохранён, обновите трекер")
		return
	}
	w.WriteHeader(204)
}
