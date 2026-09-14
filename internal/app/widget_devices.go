package app

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const widgetGrantLifetime = 90 * 24 * time.Hour
const widgetPairLifetime = 5 * time.Minute
const widgetDeviceLimit = 32

type widgetRateEntry struct {
	start time.Time
	count int
}
type widgetRateLimiter struct {
	mu      sync.Mutex
	entries map[string]widgetRateEntry
}

// The peer address is authoritative. Only a local reverse proxy may supply X-Real-IP;
// forwarded chains are deliberately ignored. Map size is bounded even under churn.
func widgetPeer(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	if ip != nil && ip.IsLoopback() {
		if real := net.ParseIP(r.Header.Get("X-Real-IP")); real != nil {
			return real.String()
		}
	}
	if ip != nil {
		return ip.String()
	}
	return "unknown"
}
func (l *widgetRateLimiter) allow(key string, limit int, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.entries == nil {
		l.entries = map[string]widgetRateEntry{}
	}
	for k, v := range l.entries {
		if !now.Before(v.start.Add(time.Minute)) {
			delete(l.entries, k)
		}
	}
	v, found := l.entries[key]
	if !found {
		if len(l.entries) >= 4096 {
			return false
		}
		v.start = now
	}
	if v.count >= limit {
		return false
	}
	v.count++
	l.entries[key] = v
	return true
}
func (s *Server) widgetRate(w http.ResponseWriter, r *http.Request, kind string, limit int) bool {
	if s.widgetLimits.allow(kind+":"+widgetPeer(r), limit, time.Now()) {
		return true
	}
	w.Header().Set("Retry-After", "60")
	writeError(w, 429, "Слишком много запросов. Повторите через минуту")
	return false
}
func widgetNoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("Pragma", "no-cache")
		next.ServeHTTP(w, r)
	})
}
func decodeWidgetJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		writeError(w, 400, "Некорректный запрос")
		return false
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		writeError(w, 400, "Некорректный запрос")
		return false
	}
	return true
}

type widgetSource struct {
	PageID   string `json:"pageId"`
	PageName string `json:"pageName"`
	BlockID  string `json:"blockId"`
	Title    string `json:"title"`
	Kind     string `json:"kind"`
}
type widgetDevice struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	PageName   string `json:"pageName"`
	Title      string `json:"title"`
	CreatedAt  string `json:"createdAt"`
	PairedAt   string `json:"pairedAt"`
	LastUsedAt string `json:"lastUsedAt"`
	ExpiresAt  string `json:"expiresAt"`
}
type widgetItem struct {
	Label   string `json:"label"`
	Checked bool   `json:"checked"`
}
type widgetSnapshot struct {
	WidgetID   string       `json:"widgetId"`
	Title      string       `json:"title"`
	Kind       string       `json:"kind"`
	Completed  int          `json:"completed"`
	Total      int          `json:"total"`
	Items      []widgetItem `json:"items"`
	UpdatedAt  string       `json:"updatedAt"`
	OpenURL    string       `json:"openUrl"`
	Color      string       `json:"color,omitempty"`
	Background string       `json:"background,omitempty"`
}
type widgetPage struct {
	name       string
	definition PageAppDefinition
	marks      map[string]bool
	markTimes  map[string]string
	updatedAt  string
}

// This SQL deliberately matches resolveWorkspaceAccess, including team lifecycle.
const widgetWorkspaceAccessSQL = `SELECT 1 FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id
 WHERE w.id=? AND wm.user_id=? AND wm.status='active' AND w.archived_at IS NULL
 AND (w.kind<>'personal' OR w.owner_id=wm.user_id)
 AND (w.team_id IS NULL OR EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
 WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=wm.user_id AND tm.status='active'))`

// Access, definition and private marks are read in one database transaction.
func loadWidgetPage(ctx context.Context, tx *sql.Tx, userID int64, workspaceID, pageID string) (widgetPage, error) {
	p := widgetPage{marks: map[string]bool{}, markTimes: map[string]string{}}
	var access int
	if err := tx.QueryRowContext(ctx, widgetWorkspaceAccessSQL, workspaceID, userID).Scan(&access); err != nil {
		return p, err
	}
	var raw string
	err := tx.QueryRowContext(ctx, `SELECT p.name,d.definition_json,d.updated_at FROM workspace_pages p JOIN page_app_definitions d ON d.page_id=p.id WHERE p.id=? AND p.workspace_id=? AND p.archived_at IS NULL`, pageID, workspaceID).Scan(&p.name, &raw, &p.updatedAt)
	if err != nil {
		return p, err
	}
	if err = json.Unmarshal([]byte(raw), &p.definition); err != nil {
		return p, err
	}
	// Fail closed on corrupted/unsupported schemas, never infer a replacement source.
	if err = validatePageApp(&p.definition); err != nil {
		return p, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT block_id,item_id,checked,updated_at FROM page_app_marks WHERE page_id=? AND user_id=?`, pageID, userID)
	if err != nil {
		return p, err
	}
	defer rows.Close()
	for rows.Next() {
		var block, item, updated string
		var checked bool
		if err = rows.Scan(&block, &item, &checked, &updated); err != nil {
			return p, err
		}
		p.marks[block+":"+item] = checked
		p.markTimes[block+":"+item] = updated
	}
	return p, rows.Err()
}
func widgetLater(a, b string) bool {
	x, e1 := time.Parse(time.RFC3339Nano, a)
	y, e2 := time.Parse(time.RFC3339Nano, b)
	return e1 == nil && (e2 != nil || x.After(y))
}
func widgetBlock(d PageAppDefinition, id string) (PageAppBlock, bool) {
	for _, b := range d.Blocks {
		if b.ID == id {
			return b, true
		}
	}
	return PageAppBlock{}, false
}

// Conditions intentionally use the same raw percentage and item.hidden semantics
// as web/page-block-visibility.js. Presentation-hidden items still count there.
func widgetCondition(c *PageBlockVisibility, d PageAppDefinition, marks map[string]bool) bool {
	if c == nil {
		return true
	}
	if c.Mode != "" || len(c.Conditions) > 0 {
		if (c.Mode != "all" && c.Mode != "any") || len(c.Conditions) == 0 || len(c.Conditions) > 8 {
			return false
		}
		matched := 0
		for _, leaf := range c.Conditions {
			if leaf.Mode != "" || len(leaf.Conditions) > 0 {
				return false
			}
			if widgetCondition(&leaf, d, marks) {
				matched++
			}
		}
		return c.Mode == "all" && matched == len(c.Conditions) || c.Mode == "any" && matched > 0
	}
	source, ok := widgetBlock(d, c.Source)
	if !ok || source.Kind != "tracker" {
		return false
	}
	total, checked := 0, 0
	for _, item := range source.Items {
		if !item.Hidden {
			total++
			if marks[source.ID+":"+item.ID] {
				checked++
			}
		}
	}
	if total == 0 {
		return false
	}
	value := float64(checked)
	switch c.Metric {
	case "checked":
	case "remaining":
		value = float64(total - checked)
	case "percent":
		value = float64(checked) / float64(total) * 100
	default:
		return false
	}
	want := float64(c.Value)
	switch c.Operator {
	case "eq":
		return value == want
	case "ne":
		return value != want
	case "gt":
		return value > want
	case "gte":
		return value >= want
	case "lt":
		return value < want
	case "lte":
		return value <= want
	}
	return false
}
func widgetBlockVisible(b PageAppBlock, d PageAppDefinition, marks map[string]bool) bool {
	seen := map[string]bool{}
	for {
		if seen[b.ID] || b.Hidden || !widgetCondition(b.Visibility, d, marks) {
			return false
		}
		seen[b.ID] = true
		if b.ParentID == "" {
			return true
		}
		var ok bool
		b, ok = widgetBlock(d, b.ParentID)
		if !ok || b.Kind != "group" {
			return false
		}
	}
}
func widgetElementsHidden(b PageAppBlock, keys ...string) bool {
	hidden := false
	for _, key := range keys {
		if value := b.ElementStyles[key].Hidden; value != nil {
			hidden = *value
		}
	}
	return hidden
}
func widgetSelected(p widgetPage, id string) (PageAppBlock, PageAppBlock, bool) {
	b, ok := widgetBlock(p.definition, id)
	if !ok || (b.Kind != "tracker" && b.Kind != "progress") || !widgetBlockVisible(b, p.definition, p.marks) {
		return b, b, false
	}
	source := b
	if b.Kind == "progress" {
		source, ok = widgetBlock(p.definition, b.Source)
		if !ok || source.Kind != "tracker" || !widgetBlockVisible(source, p.definition, p.marks) {
			return b, source, false
		}
	}
	return b, source, true
}
func widgetBlockTitle(b PageAppBlock) string {
	if widgetElementsHidden(b, "title") || strings.TrimSpace(b.Title) == "" {
		if b.Kind == "progress" {
			return "Прогресс"
		}
		return "Пункты и отметки"
	}
	return b.Title
}
func renderWidgetSnapshot(id string, p widgetPage, b, source PageAppBlock) widgetSnapshot {
	out := widgetSnapshot{WidgetID: id, Title: widgetBlockTitle(b), Kind: b.Kind, Items: []widgetItem{}, UpdatedAt: p.updatedAt, OpenURL: "/"}
	if pageAppColor.MatchString(b.Color) {
		out.Color = b.Color
	}
	if pageAppColor.MatchString(b.Background) {
		out.Background = b.Background
	}
	for _, item := range source.Items {
		if item.Hidden {
			continue
		}
		out.Total++
		checked := p.marks[source.ID+":"+item.ID]
		if updated := p.markTimes[source.ID+":"+item.ID]; widgetLater(updated, out.UpdatedAt) {
			out.UpdatedAt = updated
		}
		if checked {
			out.Completed++
		}
		// Progress blocks expose their aggregate only, never source labels that the
		// user did not choose to show. Tracker presentation-hidden labels stay private.
		if b.Kind == "tracker" && !widgetElementsHidden(source, "item", "item:"+item.ID) && len(out.Items) < 8 {
			out.Items = append(out.Items, widgetItem{Label: item.Label, Checked: checked})
		}
	}
	return out
}
func (s *Server) widgetWorkspace(w http.ResponseWriter, r *http.Request) (workspaceAccess, bool) {
	id := strings.TrimSpace(r.Header.Get("X-Workspace-ID"))
	if id == "" {
		writeError(w, 400, "Выберите пространство для виджета")
		return workspaceAccess{}, false
	}
	access, err := s.resolveWorkspaceAccess(r.Context(), currentUser(r).ID, id)
	if err != nil {
		writeError(w, 403, "Пространство недоступно")
		return workspaceAccess{}, false
	}
	return access, true
}

func (s *Server) handleWidgetSources(w http.ResponseWriter, r *http.Request) {
	workspace, ok := s.widgetWorkspace(w, r)
	if !ok {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать источники")
		return
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(r.Context(), `SELECT p.id FROM workspace_pages p JOIN page_app_definitions d ON d.page_id=p.id WHERE p.workspace_id=? AND p.archived_at IS NULL ORDER BY p.sort_order,p.name,p.id`, workspace.ID)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать источники")
		return
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		writeError(w, 500, "Не удалось прочитать источники")
		return
	}
	sources := []widgetSource{}
	for _, id := range ids {
		p, e := loadWidgetPage(r.Context(), tx, currentUser(r).ID, workspace.ID, id)
		if e != nil {
			writeError(w, 403, "Источник недоступен")
			return
		}
		for _, candidate := range p.definition.Blocks {
			b, _, ok := widgetSelected(p, candidate.ID)
			if ok {
				sources = append(sources, widgetSource{PageID: id, PageName: p.name, BlockID: b.ID, Title: widgetBlockTitle(b), Kind: b.Kind})
			}
		}
	}
	writeJSON(w, 200, map[string]any{"sources": sources})
}
func (s *Server) handleWidgetDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		s.createWidgetDevice(w, r)
		return
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT d.id,d.name,CASE WHEN p.archived_at IS NULL THEN p.name ELSE '' END,d.created_at,d.redeemed_at,d.last_used_at,d.expires_at,d.workspace_id,d.page_id,d.block_id FROM widget_devices d JOIN workspace_pages p ON p.id=d.page_id WHERE d.user_id=? AND julianday(d.expires_at)>julianday('now') AND (d.token_hash IS NOT NULL OR julianday(d.pairing_expires_at)>julianday('now')) ORDER BY d.created_at DESC,d.id`, currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать устройства")
		return
	}
	type row struct {
		device                 widgetDevice
		workspace, page, block string
	}
	data := []row{}
	for rows.Next() {
		var item row
		d := &item.device
		if err = rows.Scan(&d.ID, &d.Name, &d.PageName, &d.CreatedAt, &d.PairedAt, &d.LastUsedAt, &d.ExpiresAt, &item.workspace, &item.page, &item.block); err != nil {
			break
		}
		data = append(data, item)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		writeError(w, 500, "Не удалось прочитать устройства")
		return
	}
	devices := []widgetDevice{}
	for _, item := range data {
		tx, e := s.store.db.BeginTx(r.Context(), nil)
		if e != nil {
			writeError(w, 500, "Не удалось прочитать устройства")
			return
		}
		p, e := loadWidgetPage(r.Context(), tx, currentUser(r).ID, item.workspace, item.page)
		tx.Rollback()
		item.device.PageName = ""
		item.device.Title = "Источник недоступен"
		if e == nil {
			if b, _, ok := widgetSelected(p, item.block); ok {
				item.device.PageName = p.name
				item.device.Title = widgetBlockTitle(b)
			}
		}
		devices = append(devices, item.device)
	}
	writeJSON(w, 200, map[string]any{"devices": devices})
}
func (s *Server) createWidgetDevice(w http.ResponseWriter, r *http.Request) {
	if !pushSameOrigin(w, r) {
		return
	}
	workspace, ok := s.widgetWorkspace(w, r)
	if !ok {
		return
	}
	var in struct {
		PageID  string `json:"pageId"`
		BlockID string `json:"blockId"`
		Name    string `json:"name"`
	}
	if !decodeWidgetJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if !pageAppID.MatchString(in.PageID) || !pageAppID.MatchString(in.BlockID) || in.Name == "" || len([]rune(in.Name)) > 80 {
		writeError(w, 400, "Выберите блок и название устройства до 80 символов")
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, 500, "Не удалось создать доступ")
		return
	}
	code, err := newID()
	if err != nil {
		writeError(w, 500, "Не удалось создать доступ")
		return
	}
	now := time.Now().UTC()
	pairUntil := now.Add(widgetPairLifetime).Format(time.RFC3339Nano)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось создать доступ")
		return
	}
	defer tx.Rollback()
	p, err := loadWidgetPage(r.Context(), tx, currentUser(r).ID, workspace.ID, in.PageID)
	if err != nil {
		writeError(w, 403, "Источник недоступен")
		return
	}
	if _, _, ok := widgetSelected(p, in.BlockID); !ok {
		writeError(w, 403, "Источник недоступен")
		return
	}
	// Expired secrets are not retained and do not consume the account's device limit.
	_, err = tx.ExecContext(r.Context(), `DELETE FROM widget_devices WHERE user_id=? AND (julianday(expires_at)<=julianday(?) OR (token_hash IS NULL AND julianday(pairing_expires_at)<=julianday(?)))`, currentUser(r).ID, now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if err != nil {
		writeError(w, 500, "Не удалось создать доступ")
		return
	}
	var count int
	err = tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM widget_devices WHERE user_id=?`, currentUser(r).ID).Scan(&count)
	if err != nil {
		writeError(w, 500, "Не удалось создать доступ")
		return
	}
	if count >= widgetDeviceLimit {
		writeError(w, 409, "Сначала отключите неиспользуемый виджет (максимум 32)")
		return
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO widget_devices(id,user_id,workspace_id,page_id,block_id,name,pairing_hash,pairing_expires_at,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, id, currentUser(r).ID, workspace.ID, in.PageID, in.BlockID, in.Name, hashToken(code), pairUntil, now.Format(time.RFC3339Nano), now.Add(widgetGrantLifetime).Format(time.RFC3339Nano))
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось создать доступ")
		return
	}
	writeJSON(w, 201, map[string]string{"id": id, "pairingCode": code, "pairingExpiresAt": pairUntil})
}
func (s *Server) handleDeleteWidgetDevice(w http.ResponseWriter, r *http.Request) {
	if !pushSameOrigin(w, r) {
		return
	}
	result, err := s.store.db.ExecContext(r.Context(), `DELETE FROM widget_devices WHERE id=? AND user_id=?`, r.PathValue("id"), currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось отключить виджет")
		return
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		writeError(w, 404, "Виджет не найден")
		return
	}
	w.WriteHeader(204)
}
func validWidgetSecret(value string, n int) bool {
	if len(value) != n || strings.ToLower(value) != value {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}
func (s *Server) handleRedeemWidgetDevice(w http.ResponseWriter, r *http.Request) {
	if !s.widgetRate(w, r, "redeem", 30) {
		return
	}
	// A native pairing request must not carry browser authority or an existing grant.
	if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
		writeError(w, 400, "Код недействителен или срок истёк")
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if !decodeWidgetJSON(w, r, &in) {
		return
	}
	if !validWidgetSecret(in.Code, 32) {
		writeError(w, 400, "Код недействителен или срок истёк")
		return
	}
	token, tokenHash, err := newSessionToken()
	if err != nil {
		writeError(w, 500, "Не удалось подключить виджет")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось подключить виджет")
		return
	}
	defer tx.Rollback()
	var id, workspace, page, block, expires string
	var userID int64
	err = tx.QueryRowContext(r.Context(), `SELECT id,user_id,workspace_id,page_id,block_id,expires_at FROM widget_devices WHERE pairing_hash=? AND token_hash IS NULL AND julianday(pairing_expires_at)>julianday('now') AND julianday(expires_at)>julianday('now')`, hashToken(in.Code)).Scan(&id, &userID, &workspace, &page, &block, &expires)
	if err != nil {
		writeError(w, 400, "Код недействителен или срок истёк")
		return
	}
	p, err := loadWidgetPage(r.Context(), tx, userID, workspace, page)
	if err != nil {
		writeError(w, 400, "Код недействителен или срок истёк")
		return
	}
	if _, _, ok := widgetSelected(p, block); !ok {
		writeError(w, 400, "Код недействителен или срок истёк")
		return
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE widget_devices SET pairing_hash=NULL,token_hash=?,redeemed_at=? WHERE id=? AND pairing_hash=? AND token_hash IS NULL AND julianday(pairing_expires_at)>julianday('now')`, tokenHash, nowText(), id, hashToken(in.Code))
	if err != nil {
		writeError(w, 500, "Не удалось подключить виджет")
		return
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		writeError(w, 400, "Код недействителен или срок истёк")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось подключить виджет")
		return
	}
	writeJSON(w, 201, map[string]string{"token": token, "expiresAt": expires, "widgetId": id})
}
func (s *Server) handleMobileWidget(w http.ResponseWriter, r *http.Request) {
	if !s.widgetRate(w, r, "snapshot", 240) {
		return
	}
	auth := r.Header.Values("Authorization")
	if r.Header.Get("Cookie") != "" || len(auth) != 1 || !strings.HasPrefix(auth[0], "Bearer ") || !validWidgetSecret(strings.TrimPrefix(auth[0], "Bearer "), 64) {
		writeError(w, 401, "Доступ к виджету недействителен")
		return
	}
	tokenHash := hashToken(strings.TrimPrefix(auth[0], "Bearer "))
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось обновить виджет")
		return
	}
	defer tx.Rollback()
	var id, workspace, page, block string
	var userID int64
	err = tx.QueryRowContext(r.Context(), `SELECT id,user_id,workspace_id,page_id,block_id FROM widget_devices WHERE token_hash=? AND julianday(expires_at)>julianday('now')`, tokenHash).Scan(&id, &userID, &workspace, &page, &block)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 401, "Доступ к виджету недействителен")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось обновить виджет")
		return
	}
	p, err := loadWidgetPage(r.Context(), tx, userID, workspace, page)
	if err != nil {
		writeError(w, 403, "Источник виджета недоступен")
		return
	}
	b, source, ok := widgetSelected(p, block)
	if !ok {
		writeError(w, 403, "Источник виджета недоступен")
		return
	}
	out := renderWidgetSnapshot(id, p, b, source)
	// The update and source read share the grant transaction: revocation cannot be
	// observed half-way through producing a successful authorised snapshot.
	_, err = tx.ExecContext(r.Context(), `UPDATE widget_devices SET last_used_at=? WHERE id=?`, nowText(), id)
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось обновить виджет")
		return
	}
	writeJSON(w, 200, out)
}
