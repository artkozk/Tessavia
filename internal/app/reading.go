package app

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
)

type ReadingEntry struct {
	CancelledAt *string `json:"cancelledAt,omitempty"`
	ID          string  `json:"id"`
	UserID      int64   `json:"userId"`
	Username    string  `json:"username"`
	GroupID     string  `json:"groupId"`
	Day         string  `json:"day"`
	Book        int     `json:"book"`
	Chapter     int     `json:"chapter"`
	Complete    bool    `json:"complete"`
	Stream      string  `json:"stream"`
	Note        string  `json:"note"`
	Shared      bool    `json:"shared"`
	UpdatedAt   string  `json:"updatedAt"`
}
type ReadingGroup struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	LeaderID     int64  `json:"leaderId"`
	Members      int    `json:"members"`
	ActiveDays   int    `json:"activeDays"`
	PossibleDays int    `json:"possibleDays"`
}
type ReadingPlan struct {
	ID           string                `json:"id"`
	GroupID      string                `json:"groupId"`
	Title        string                `json:"title"`
	Reference    string                `json:"reference"`
	Questions    string                `json:"questions"`
	Book         int                   `json:"book"`
	First        int                   `json:"first"`
	Last         int                   `json:"last"`
	MeetingDay   string                `json:"meetingDay"`
	CreatedAt    string                `json:"createdAt"`
	CancelledAt  *string               `json:"cancelledAt"`
	CancelReason string                `json:"cancelReason"`
	Done         int                   `json:"done"`
	Next         int                   `json:"next"`
	Progress     []ReadingPlanProgress `json:"progress"`
}
type ReadingPlanProgress struct {
	UserID   int64  `json:"userId"`
	Username string `json:"username"`
	Done     int    `json:"done"`
}
type ReadingRank struct {
	UserID        int64  `json:"userId"`
	Username      string `json:"username"`
	GroupID       string `json:"groupId"`
	Chapters      int    `json:"chapters"`
	Days          int    `json:"days"`
	CurrentStreak int    `json:"currentStreak"`
	BestStreak    int    `json:"bestStreak"`
	Place         int    `json:"place"`
}
type ReadingOverview struct {
	Enabled          bool           `json:"enabled"`
	Today            string         `json:"today"`
	Timezone         string         `json:"timezone"`
	GroupID          string         `json:"groupId"`
	Books            []BibleBook    `json:"books"`
	Entries          []ReadingEntry `json:"entries"`
	CancelledEntries []ReadingEntry `json:"cancelledEntries"`
	SharedNotes      []ReadingEntry `json:"sharedNotes"`
	Groups           []ReadingGroup `json:"groups"`
	Plans            []ReadingPlan  `json:"plans"`
	Ranking          []ReadingRank  `json:"ranking"`
	NextBook         int            `json:"nextBook"`
	NextChapter      int            `json:"nextChapter"`
	CurrentStreak    int            `json:"currentStreak"`
	BestStreak       int            `json:"bestStreak"`
}

func readingError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	writeError(w, 500, "Не удалось сохранить или прочитать данные чтения. Повторите запрос.")
	return true
}
func (s *Server) readingAccess(w http.ResponseWriter, r *http.Request, write bool) bool {
	ws := currentWorkspace(r)
	if ws.Kind != "team" {
		writeError(w, 404, "Чтение доступно в команде")
		return false
	}
	if write && ws.Role != "owner" && ws.Role != "admin" && ws.Role != "member" {
		writeError(w, 403, "Нет права изменять чтение")
		return false
	}
	var found int
	err := s.store.db.QueryRowContext(r.Context(), "SELECT 1 FROM reading_spaces WHERE workspace_id=?", ws.ID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Чтение в этой команде ещё не включено")
		return false
	}
	return !readingError(w, err)
}

func (s *Server) handleReadingEnable(w http.ResponseWriter, r *http.Request) {
	var input struct{}
	if !decodeJSON(w, r, &input) {
		return
	}
	if currentWorkspace(r).Kind != "team" {
		writeError(w, 400, "Сначала создайте команду Домашка")
		return
	}
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	ws, user, now := currentWorkspace(r).ID, currentUser(r).ID, nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if readingError(w, err) {
		return
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO reading_spaces(workspace_id,created_at) VALUES(?,?) ON CONFLICT DO NOTHING`, ws, now)
	if readingError(w, err) {
		return
	}
	group := "reading-" + ws
	_, err = tx.ExecContext(r.Context(), `INSERT INTO reading_groups(id,workspace_id,name,leader_id,created_at) VALUES(?,?,'Домашка',?,?) ON CONFLICT(id) DO NOTHING`, group, ws, user, now)
	if readingError(w, err) {
		return
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO reading_members(workspace_id,user_id,group_id,joined_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING`, ws, user, group, now)
	if readingError(w, err) {
		return
	}
	if readingError(w, tx.Commit()) {
		return
	}
	writeJSON(w, 200, map[string]any{"enabled": true, "groupId": group})
}

func (s *Server) handleReadingJoin(w http.ResponseWriter, r *http.Request) {
	if !s.readingAccess(w, r, true) {
		return
	}
	var input struct {
		GroupID string `json:"groupId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	ws, user := currentWorkspace(r).ID, currentUser(r).ID
	var found int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM reading_groups WHERE workspace_id=? AND id=?`, ws, input.GroupID).Scan(&found); err != nil {
		writeError(w, 404, "Группа не найдена")
		return
	}
	// Switching groups is allowed only before any reading today; old points remain
	// attributed to their original group, and membership eligibility starts now.
	var old string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT group_id FROM reading_members WHERE workspace_id=? AND user_id=?`, ws, user).Scan(&old)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		readingError(w, err)
		return
	}
	if old == input.GroupID {
		writeJSON(w, 200, map[string]bool{"joined": true})
		return
	}
	now := time.Now()
	today := readingDay(now)
	result, err := s.store.db.ExecContext(r.Context(), `INSERT INTO reading_members(workspace_id,user_id,group_id,joined_at)
 SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM reading_entries WHERE workspace_id=? AND user_id=? AND day=?)
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET group_id=excluded.group_id,joined_at=excluded.joined_at`, ws, user, input.GroupID, now.UTC().Format(time.RFC3339Nano), ws, user, today)
	if readingError(w, err) {
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		writeError(w, 409, "Сегодня уже есть отметки. Группу можно сменить завтра до чтения.")
		return
	}
	writeJSON(w, 200, map[string]bool{"joined": true})
}

func (s *Server) handleReadingGroup(w http.ResponseWriter, r *http.Request) {
	if !s.readingAccess(w, r, true) || !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input struct {
		Name     string `json:"name"`
		LeaderID int64  `json:"leaderId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 100 || !s.workspaceHasMember(r.Context(), currentWorkspace(r).ID, input.LeaderID) {
		writeError(w, 400, "Нужны название до 100 символов и лидер из участников команды")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		var err error
		id, err = newID()
		if readingError(w, err) {
			return
		}
	}
	var err error
	if r.Method == http.MethodPost {
		_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO reading_groups(id,workspace_id,name,leader_id,created_at) VALUES(?,?,?,?,?)`, id, currentWorkspace(r).ID, input.Name, input.LeaderID, nowText())
	} else {
		var result sql.Result
		result, err = s.store.db.ExecContext(r.Context(), `UPDATE reading_groups SET name=?,leader_id=? WHERE id=? AND workspace_id=?`, input.Name, input.LeaderID, id, currentWorkspace(r).ID)
		if err == nil {
			n, _ := result.RowsAffected()
			if n == 0 {
				writeError(w, 404, "Группа не найдена")
				return
			}
		}
	}
	if err != nil {
		writeError(w, 409, "Не удалось сохранить группу. Проверьте уникальность названия.")
		return
	}
	writeJSON(w, 200, map[string]string{"id": id})
}

func (s *Server) handleReadingEntry(w http.ResponseWriter, r *http.Request) {
	if !s.readingAccess(w, r, true) {
		return
	}
	var input struct {
		Day      string `json:"day"`
		Book     int    `json:"book"`
		First    int    `json:"first"`
		Last     int    `json:"last"`
		Complete bool   `json:"complete"`
		Stream   string `json:"stream"`
		Note     string `json:"note"`
		Shared   bool   `json:"shared"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	now := time.Now()
	today := readingDay(now)
	stamp := now.UTC().Format(time.RFC3339Nano)
	if input.Day != today {
		writeError(w, 409, "Можно отметить только сегодняшний день по Москве. Обновите страницу: прошлый день закрыт.")
		return
	}
	if !validReadingRange(input.Book, input.First, input.Last) || len([]rune(input.Note)) > 10000 || (input.Stream != "personal" && input.Stream != "group") {
		writeError(w, 400, "Проверьте книгу, главы, поток чтения и заметку (до 10000 символов)")
		return
	}
	ws, user := currentWorkspace(r).ID, currentUser(r).ID
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if readingError(w, err) {
		return
	}
	defer tx.Rollback()
	var group string
	err = tx.QueryRowContext(r.Context(), `SELECT group_id FROM reading_members WHERE workspace_id=? AND user_id=?`, ws, user).Scan(&group)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 409, "Сначала выберите свою домашнюю группу")
		return
	}
	if readingError(w, err) {
		return
	}
	added := 0
	for chapter := input.First; chapter <= input.Last; chapter++ {
		id, err := newID()
		if readingError(w, err) {
			return
		}
		result, err := tx.ExecContext(r.Context(), `INSERT INTO reading_entries(id,workspace_id,user_id,group_id,day,book,chapter,complete,stream,note,shared,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,user_id,day,book,chapter) DO NOTHING`, id, ws, user, group, today, input.Book, chapter, input.Complete, input.Stream, input.Note, input.Shared, stamp, stamp)
		if readingError(w, err) {
			return
		}
		n, _ := result.RowsAffected()
		added += int(n)
	}
	if readingDay(time.Now()) != today {
		writeError(w, 409, "Наступил новый день. Обновите форму.")
		return
	}
	if readingError(w, tx.Commit()) {
		return
	}
	writeJSON(w, 200, map[string]any{"added": added, "day": today})
}

func (s *Server) handleReadingEntryUpdate(w http.ResponseWriter, r *http.Request) {
	if !s.readingAccess(w, r, true) {
		return
	}
	var input struct {
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
		Note              string `json:"note"`
		Shared            bool   `json:"shared"`
		Complete          bool   `json:"complete"`
		Cancel            bool   `json:"cancel"`
		Restore           bool   `json:"restore"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if len([]rune(input.Note)) > 10000 || input.ExpectedUpdatedAt == "" {
		writeError(w, 400, "Нужна версия записи и заметка не длиннее 10000 символов")
		return
	}
	ws, user, id := currentWorkspace(r).ID, currentUser(r).ID, r.PathValue("id")
	now := time.Now()
	stamp := now.UTC().Format(time.RFC3339Nano)
	var cancelled any
	if input.Cancel {
		cancelled = stamp
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if readingError(w, err) {
		return
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(r.Context(), `UPDATE reading_entries SET note=?,shared=?,complete=?,cancelled_at=?,updated_at=? WHERE id=? AND workspace_id=? AND user_id=? AND updated_at=? AND day=? AND (cancelled_at IS NULL OR ?)`, input.Note, input.Shared, input.Complete, cancelled, stamp, id, ws, user, input.ExpectedUpdatedAt, readingDay(now), input.Restore && !input.Cancel)
	if readingError(w, err) {
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		writeError(w, 409, "Отметка недоступна, изменилась или день уже закрыт. Обновите страницу.")
		return
	}
	action := "edit"
	if input.Cancel {
		action = "cancel"
	} else if input.Restore {
		action = "restore"
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO reading_entry_events(entry_id,actor_id,action,happened_at) VALUES(?,?,?,?)`, id, user, action, stamp)
	if readingError(w, err) {
		return
	}
	if readingDay(time.Now()) != readingDay(now) {
		writeError(w, 409, "Наступил новый день. Обновите форму.")
		return
	}
	if readingError(w, tx.Commit()) {
		return
	}
	writeJSON(w, 200, map[string]string{"updatedAt": stamp})
}

func (s *Server) readingLeader(r *http.Request, group string) bool {
	var leader int64
	if s.store.db.QueryRowContext(r.Context(), `SELECT leader_id FROM reading_groups WHERE workspace_id=? AND id=?`, currentWorkspace(r).ID, group).Scan(&leader) != nil {
		return false
	}
	return leader == currentUser(r).ID || currentWorkspace(r).Role == "owner" || currentWorkspace(r).Role == "admin"
}
func (s *Server) handleReadingPlan(w http.ResponseWriter, r *http.Request) {
	if !s.readingAccess(w, r, true) {
		return
	}
	var input ReadingPlan
	if !decodeJSON(w, r, &input) {
		return
	}
	if !s.readingLeader(r, input.GroupID) {
		writeError(w, 403, "План публикует лидер этой группы или администратор")
		return
	}
	date, err := time.Parse("2006-01-02", input.MeetingDay)
	if err != nil || input.MeetingDay < readingDay(time.Now()) || date.After(time.Now().AddDate(2, 0, 0)) || !validReadingRange(input.Book, input.First, input.Last) || strings.TrimSpace(input.Title) == "" || len([]rune(input.Title)) > 160 || len([]rune(input.Reference)) > 300 || len([]rune(input.Questions)) > 10000 {
		writeError(w, 400, "Проверьте тему, местописание и дату встречи (сегодня или в ближайшие два года)")
		return
	}
	id, err := newID()
	if readingError(w, err) {
		return
	}
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO reading_plans(id,workspace_id,group_id,author_id,title,reference,questions,book,first_chapter,last_chapter,meeting_day,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, id, currentWorkspace(r).ID, input.GroupID, currentUser(r).ID, strings.TrimSpace(input.Title), input.Reference, input.Questions, input.Book, input.First, input.Last, input.MeetingDay, nowText())
	if readingError(w, err) {
		return
	}
	writeJSON(w, 201, map[string]string{"id": id})
}
func (s *Server) handleReadingPlanCancel(w http.ResponseWriter, r *http.Request) {
	if !s.readingAccess(w, r, true) {
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" || len([]rune(input.Reason)) > 1000 {
		writeError(w, 400, "Укажите причину отмены до 1000 символов")
		return
	}
	var group string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT group_id FROM reading_plans WHERE workspace_id=? AND id=?`, currentWorkspace(r).ID, r.PathValue("id")).Scan(&group)
	if err != nil {
		writeError(w, 404, "План не найден")
		return
	}
	if !s.readingLeader(r, group) {
		writeError(w, 403, "Нет права отменять этот план")
		return
	}
	_, err = s.store.db.ExecContext(r.Context(), `UPDATE reading_plans SET cancelled_at=?,cancel_reason=? WHERE workspace_id=? AND id=? AND cancelled_at IS NULL`, nowText(), input.Reason, currentWorkspace(r).ID, r.PathValue("id"))
	if readingError(w, err) {
		return
	}
	writeJSON(w, 200, map[string]bool{"cancelled": true})
}

func (s *Server) handleReadingOverview(w http.ResponseWriter, r *http.Request) {
	if !s.readingAccess(w, r, false) {
		return
	}
	result, err := s.loadReading(r)
	if readingError(w, err) {
		return
	}
	writeJSON(w, 200, result)
}

func (s *Server) loadReading(r *http.Request) (ReadingOverview, error) {
	ws, user := currentWorkspace(r).ID, currentUser(r).ID
	now := time.Now()
	today := readingDay(now)
	out := ReadingOverview{Enabled: true, Today: today, Timezone: "Europe/Moscow", Books: bibleBooks, Entries: []ReadingEntry{}, SharedNotes: []ReadingEntry{}, Groups: []ReadingGroup{}, Plans: []ReadingPlan{}, Ranking: []ReadingRank{}}
	err := s.store.db.QueryRowContext(r.Context(), `SELECT group_id FROM reading_members WHERE workspace_id=? AND user_id=?`, ws, user).Scan(&out.GroupID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return out, err
	}
	out.CancelledEntries = []ReadingEntry{}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT e.id,e.user_id,u.username,e.group_id,e.day,e.book,e.chapter,e.complete,e.stream,e.note,e.shared,e.updated_at,e.cancelled_at FROM reading_entries e JOIN users u ON u.id=e.user_id WHERE e.workspace_id=? AND e.user_id=? ORDER BY e.created_at,e.book,e.chapter`, ws, user)
	if err != nil {
		return out, err
	}
	days := map[string]bool{}
	out.NextBook, out.NextChapter = 43, 1
	for rows.Next() {
		var e ReadingEntry
		if err = rows.Scan(&e.ID, &e.UserID, &e.Username, &e.GroupID, &e.Day, &e.Book, &e.Chapter, &e.Complete, &e.Stream, &e.Note, &e.Shared, &e.UpdatedAt, &e.CancelledAt); err != nil {
			rows.Close()
			return out, err
		}
		if e.CancelledAt != nil {
			out.CancelledEntries = append(out.CancelledEntries, e)
			continue
		}
		out.Entries = append(out.Entries, e)
		days[e.Day] = true
		if e.Complete && e.Stream == "personal" {
			out.NextBook, out.NextChapter = nextReading(e.Book, e.Chapter)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	out.CurrentStreak, out.BestStreak = readingStreak(days, today)
	rows, err = s.store.db.QueryContext(r.Context(), `SELECT e.id,e.user_id,u.username,e.group_id,e.day,e.book,e.chapter,e.complete,e.stream,e.note,e.shared,e.updated_at FROM reading_entries e JOIN users u ON u.id=e.user_id WHERE e.workspace_id=? AND e.group_id=? AND e.shared=1 AND e.note<>'' AND e.cancelled_at IS NULL ORDER BY e.created_at DESC LIMIT 100`, ws, out.GroupID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var e ReadingEntry
		if err = rows.Scan(&e.ID, &e.UserID, &e.Username, &e.GroupID, &e.Day, &e.Book, &e.Chapter, &e.Complete, &e.Stream, &e.Note, &e.Shared, &e.UpdatedAt); err != nil {
			rows.Close()
			return out, err
		}
		out.SharedNotes = append(out.SharedNotes, e)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	rows, err = s.store.db.QueryContext(r.Context(), `SELECT id,name,leader_id FROM reading_groups WHERE workspace_id=? ORDER BY created_at,id`, ws)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var g ReadingGroup
		if err = rows.Scan(&g.ID, &g.Name, &g.LeaderID); err != nil {
			rows.Close()
			return out, err
		}
		out.Groups = append(out.Groups, g)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	if err = s.readingRanks(r, &out, now); err != nil {
		return out, err
	}
	rows, err = s.store.db.QueryContext(r.Context(), `SELECT id,group_id,title,reference,questions,book,first_chapter,last_chapter,meeting_day,created_at,cancelled_at,cancel_reason FROM reading_plans WHERE workspace_id=? ORDER BY meeting_day DESC,created_at DESC LIMIT 200`, ws)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var p ReadingPlan
		if err = rows.Scan(&p.ID, &p.GroupID, &p.Title, &p.Reference, &p.Questions, &p.Book, &p.First, &p.Last, &p.MeetingDay, &p.CreatedAt, &p.CancelledAt, &p.CancelReason); err != nil {
			rows.Close()
			return out, err
		}
		p.Progress = []ReadingPlanProgress{}
		out.Plans = append(out.Plans, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	for i := range out.Plans {
		p := &out.Plans[i]
		published, parseErr := time.Parse(time.RFC3339Nano, p.CreatedAt)
		if parseErr != nil {
			return out, parseErr
		}
		firstDay := readingDay(published)
		seen := map[int]bool{}
		for _, e := range out.Entries {
			if e.Complete && e.Book == p.Book && e.Chapter >= p.First && e.Chapter <= p.Last && e.Day >= firstDay && e.Day <= p.MeetingDay {
				seen[e.Chapter] = true
			}
		}
		p.Done = len(seen)
		for ch := p.First; ch <= p.Last; ch++ {
			if !seen[ch] {
				p.Next = ch
				break
			}
		}
		if !s.readingLeader(r, p.GroupID) {
			continue
		}
		progressRows, err := s.store.db.QueryContext(r.Context(), `SELECT m.user_id,u.username,COUNT(DISTINCT e.chapter) FROM reading_members m JOIN users u ON u.id=m.user_id JOIN workspace_members wm ON wm.workspace_id=m.workspace_id AND wm.user_id=m.user_id AND wm.status='active' LEFT JOIN reading_entries e ON e.workspace_id=m.workspace_id AND e.user_id=m.user_id AND e.cancelled_at IS NULL AND e.complete=1 AND e.book=? AND e.chapter BETWEEN ? AND ? AND e.day BETWEEN ? AND ? WHERE m.workspace_id=? AND m.group_id=? GROUP BY m.user_id,u.username`, p.Book, p.First, p.Last, firstDay, p.MeetingDay, ws, p.GroupID)
		if err != nil {
			return out, err
		}
		for progressRows.Next() {
			var pr ReadingPlanProgress
			if err = progressRows.Scan(&pr.UserID, &pr.Username, &pr.Done); err != nil {
				progressRows.Close()
				return out, err
			}
			p.Progress = append(p.Progress, pr)
		}
		err = progressRows.Err()
		progressRows.Close()
		if err != nil {
			return out, err
		}
	}
	return out, nil
}

func (s *Server) readingRanks(r *http.Request, out *ReadingOverview, now time.Time) error {
	// Private notes never enter the aggregate query or the leaderboard response.
	start := "0000-01-01"
	date, _ := time.Parse("2006-01-02", out.Today)
	switch r.URL.Query().Get("period") {
	case "week":
		start = date.AddDate(0, 0, -6).Format("2006-01-02")
	case "month":
		start = date.AddDate(0, 0, -29).Format("2006-01-02")
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT wm.user_id,u.username,COALESCE(m.group_id,''),COALESCE(m.joined_at,''),COALESCE(e.day,''),COALESCE(e.complete,0),COALESCE(e.group_id,'') FROM workspace_members wm JOIN users u ON u.id=wm.user_id LEFT JOIN reading_members m ON m.workspace_id=wm.workspace_id AND m.user_id=wm.user_id LEFT JOIN reading_entries e ON e.workspace_id=wm.workspace_id AND e.user_id=wm.user_id AND e.cancelled_at IS NULL WHERE wm.workspace_id=? AND wm.status='active' ORDER BY wm.user_id`, currentWorkspace(r).ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	all := map[int64]*ReadingRank{}
	days := map[int64]map[string]bool{}
	periodDays := map[int64]map[string]bool{}
	groupDays := map[string]bool{}
	groupIndex := map[string]int{}
	for i, g := range out.Groups {
		groupIndex[g.ID] = i
	}
	for rows.Next() {
		var uid int64
		var username, group, joined, day, entryGroup string
		var complete int
		if err = rows.Scan(&uid, &username, &group, &joined, &day, &complete, &entryGroup); err != nil {
			return err
		}
		if all[uid] == nil {
			all[uid] = &ReadingRank{UserID: uid, Username: username, GroupID: group}
			days[uid] = map[string]bool{}
			periodDays[uid] = map[string]bool{}
			if gi, ok := groupIndex[group]; ok {
				g := &out.Groups[gi]
				g.Members++
				since, parseErr := time.Parse(time.RFC3339Nano, joined)
				if parseErr == nil {
					joinDate, _ := time.Parse("2006-01-02", readingDay(since))
					eligible := int(date.Sub(joinDate).Hours()/24) + 1
					if eligible > 7 {
						eligible = 7
					}
					if eligible > 0 {
						g.PossibleDays += eligible
					}
				}
			}
		}
		if day == "" || day > out.Today {
			continue
		}
		days[uid][day] = true
		if day >= start {
			all[uid].Chapters += complete
			periodDays[uid][day] = true
		}
		if gi, ok := groupIndex[group]; ok && group == entryGroup && day >= date.AddDate(0, 0, -6).Format("2006-01-02") {
			since, err := time.Parse(time.RFC3339Nano, joined)
			if err == nil && day >= readingDay(since) {
				key := fmt.Sprintf("%s/%d/%s", group, uid, day)
				if !groupDays[key] {
					groupDays[key] = true
					out.Groups[gi].ActiveDays++
				}
			}
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}
	for uid, rank := range all {
		rank.Days = len(periodDays[uid])
		rank.CurrentStreak, rank.BestStreak = readingStreak(days[uid], out.Today)
		out.Ranking = append(out.Ranking, *rank)
	}
	sort.Slice(out.Ranking, func(i, j int) bool {
		a, b := out.Ranking[i], out.Ranking[j]
		if a.Chapters != b.Chapters {
			return a.Chapters > b.Chapters
		}
		return a.Username < b.Username
	})
	for i := range out.Ranking {
		out.Ranking[i].Place = i + 1
		if i > 0 && out.Ranking[i].Chapters == out.Ranking[i-1].Chapters {
			out.Ranking[i].Place = out.Ranking[i-1].Place
		}
	}
	return nil
}
