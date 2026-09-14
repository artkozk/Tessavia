package app

import (
	"crypto/ecdh"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

type pushDevice struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Current       bool   `json:"current"`
	Enabled       bool   `json:"enabled"`
	LastStatus    string `json:"lastStatus"`
	LastAttemptAt string `json:"lastAttemptAt"`
	LastSuccessAt string `json:"lastSuccessAt"`
	CreatedAt     string `json:"createdAt"`
}

func pushConfigured(c Config) bool {
	if !c.PushEnabled {
		return false
	}
	private, e := base64.RawURLEncoding.DecodeString(c.PushVAPIDPrivateKey)
	if e != nil {
		return false
	}
	key, e := ecdh.P256().NewPrivateKey(private)
	if e != nil {
		return false
	}
	public, e := base64.RawURLEncoding.DecodeString(c.PushVAPIDPublicKey)
	if e != nil || subtle.ConstantTimeCompare(key.PublicKey().Bytes(), public) != 1 {
		return false
	}
	u, e := url.Parse(c.PushVAPIDSubject)
	return e == nil && ((u.Scheme == "mailto" && strings.Contains(u.Opaque, "@")) || (u.Scheme == "https" && u.Hostname() != "" && u.User == nil))
}

func pushSession(r *http.Request) string {
	cookie, e := r.Cookie(sessionCookieName)
	if e != nil {
		return ""
	}
	return hashToken(cookie.Value)
}

// Mutations accept only the origin of this application. JSON alone is not a CSRF boundary.
func pushSameOrigin(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		writeError(w, 403, "Запрос с другого сайта запрещён")
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		u, e := url.Parse(origin)
		if e != nil || u.Host != r.Host || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil {
			writeError(w, 403, "Запрос с другого сайта запрещён")
			return false
		}
	}
	return true
}

func (s *Server) handlePushSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	devices := []pushDevice{}
	rows, e := s.store.db.QueryContext(r.Context(), `SELECT p.id,p.name,p.session_hash=?,p.enabled,p.last_status,p.last_attempt_at,p.last_success_at,p.created_at FROM push_subscriptions p JOIN sessions se ON se.token_hash=p.session_hash AND se.user_id=p.user_id WHERE p.user_id=? AND julianday(se.expires_at)>julianday('now') ORDER BY p.created_at DESC,p.id`, pushSession(r), currentUser(r).ID)
	if e != nil {
		writeError(w, 500, "Не удалось загрузить устройства")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var d pushDevice
		if e = rows.Scan(&d.ID, &d.Name, &d.Current, &d.Enabled, &d.LastStatus, &d.LastAttemptAt, &d.LastSuccessAt, &d.CreatedAt); e != nil {
			writeError(w, 500, "Не удалось загрузить устройства")
			return
		}
		devices = append(devices, d)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось загрузить устройства")
		return
	}
	configured := pushConfigured(s.config)
	key := ""
	if configured {
		key = s.config.PushVAPIDPublicKey
	}
	writeJSON(w, 200, map[string]any{"configured": configured, "publicKey": key, "devices": devices})
}

func (s *Server) handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	if !pushSameOrigin(w, r) {
		return
	}
	if !pushConfigured(s.config) {
		writeError(w, 503, "Доставка на устройства пока не настроена")
		return
	}
	var in struct {
		Endpoint          string `json:"endpoint"`
		ExpectedPublicKey string `json:"expectedPublicKey"`
		Keys              struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.ExpectedPublicKey == "" {
		writeError(w, 400, "Укажите ключ доставки, с которым подключается устройство")
		return
	}
	if in.ExpectedPublicKey != s.config.PushVAPIDPublicKey {
		writeJSON(w, 409, map[string]string{"code": "push_key_changed", "error": "Ключ доставки изменился. Обновите настройки и подключите устройство заново"})
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	public, e := base64.RawURLEncoding.DecodeString(in.Keys.P256dh)
	auth, ae := base64.RawURLEncoding.DecodeString(in.Keys.Auth)
	if _, ke := ecdh.P256().NewPublicKey(public); e != nil || ke != nil || ae != nil || len(auth) != 16 || utf8.RuneCountInString(in.Name) > 80 || len(in.Name) == 0 || !validPushEndpoint(in.Endpoint) {
		writeError(w, 400, "Некорректная подписка устройства")
		return
	}
	tx, e := s.store.db.BeginTx(r.Context(), nil)
	if e != nil {
		writeError(w, 500, "Не удалось включить уведомления")
		return
	}
	defer tx.Rollback()
	user, session := currentUser(r).ID, pushSession(r)
	var owner int64
	var id, oldSession, oldPublic, oldAuth, oldVapid string
	var enabled bool
	e = tx.QueryRowContext(r.Context(), `SELECT id,user_id,session_hash,p256dh,auth,vapid_public_key,enabled FROM push_subscriptions WHERE endpoint=?`, in.Endpoint).Scan(&id, &owner, &oldSession, &oldPublic, &oldAuth, &oldVapid, &enabled)
	if e != nil && e != sql.ErrNoRows {
		writeError(w, 500, "Не удалось включить уведомления")
		return
	}
	if e == nil && owner != user {
		writeError(w, 409, "Эта браузерная подписка связана с другим аккаунтом. Отключите её на устройстве и включите заново")
		return
	}
	if e == nil && oldSession == session && oldPublic == in.Keys.P256dh && oldAuth == in.Keys.Auth && oldVapid == s.config.PushVAPIDPublicKey && enabled {
		_, e = tx.ExecContext(r.Context(), `UPDATE push_subscriptions SET name=? WHERE id=?`, in.Name, id)
	} else {
		// A new login/key/permission starts a new consent interval; never replay the old backlog.
		_, e = tx.ExecContext(r.Context(), `DELETE FROM push_subscriptions WHERE user_id=? AND (session_hash=? OR endpoint=?)`, user, session, in.Endpoint)
		if e == nil {
			id, e = newID()
		}
		if e == nil {
			_, e = tx.ExecContext(r.Context(), `INSERT INTO push_subscriptions(id,user_id,session_hash,endpoint,p256dh,auth,vapid_public_key,name,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, id, user, session, in.Endpoint, in.Keys.P256dh, in.Keys.Auth, s.config.PushVAPIDPublicKey, in.Name, nowText())
		}
	}
	if e != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось включить уведомления")
		return
	}
	writeJSON(w, 200, map[string]string{"subscriptionId": id})
}

func (s *Server) handlePushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	if !pushSameOrigin(w, r) {
		return
	}
	result, e := s.store.db.ExecContext(r.Context(), `DELETE FROM push_subscriptions WHERE id=? AND user_id=?`, r.PathValue("id"), currentUser(r).ID)
	if e != nil {
		writeError(w, 500, "Не удалось отключить устройство")
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		writeError(w, 404, "Устройство не найдено")
		return
	}
	w.WriteHeader(204)
}

func (s *Server) handlePushTest(w http.ResponseWriter, r *http.Request) {
	if !pushSameOrigin(w, r) {
		return
	}
	if !pushConfigured(s.config) {
		writeError(w, 503, "Доставка на устройства пока не настроена")
		return
	}
	var in struct {
		SubscriptionID string `json:"subscriptionId"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	tx, e := s.store.db.BeginTx(r.Context(), nil)
	if e != nil {
		writeError(w, 500, "Не удалось проверить доставку")
		return
	}
	defer tx.Rollback()
	var id string
	e = tx.QueryRowContext(r.Context(), `SELECT id FROM push_subscriptions WHERE id=? AND user_id=? AND session_hash=? AND enabled=1 AND vapid_public_key=?`, in.SubscriptionID, currentUser(r).ID, pushSession(r), s.config.PushVAPIDPublicKey).Scan(&id)
	if e == sql.ErrNoRows {
		writeError(w, 404, "Устройство не найдено или отключено")
		return
	}
	if e != nil {
		writeError(w, 500, "Не удалось проверить доставку")
		return
	}
	now := time.Now().UTC()
	status := "pending"
	e = tx.QueryRowContext(r.Context(), `SELECT id,status FROM push_deliveries WHERE subscription_id=? AND notification_id IS NULL AND julianday(created_at)>julianday(?) ORDER BY created_at DESC LIMIT 1`, id, now.Add(-time.Minute).Format(time.RFC3339Nano)).Scan(&id, &status)
	if e == sql.ErrNoRows {
		id, e = newID()
		if e == nil {
			_, e = tx.ExecContext(r.Context(), `INSERT INTO push_deliveries(id,subscription_id,next_attempt_at,created_at,expires_at) VALUES(?,?,?,?,?)`, id, in.SubscriptionID, now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano), now.Add(5*time.Minute).Format(time.RFC3339Nano))
		}
	}
	if e != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось проверить доставку")
		return
	}
	if status == "pending" || status == "sending" {
		status = "queued"
	}
	writeJSON(w, 202, map[string]string{"deliveryId": id, "status": status})
}
