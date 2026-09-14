package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// Only verified browser push providers. No arbitrary URLs, proxy, redirects or DNS rebinding.
func validPushEndpoint(raw string) bool {
	if len(raw) > 4096 {
		return false
	}
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || u.Fragment != "" || u.Path == "" || u.Path == "/" || u.Opaque != "" {
		return false
	}
	h := u.Hostname()
	if h != strings.ToLower(h) || u.Host != h {
		return false
	}
	return h == "fcm.googleapis.com" || (strings.HasSuffix(h, ".push.apple.com") && h != ".push.apple.com") || (strings.HasSuffix(h, ".push.services.mozilla.com") && h != ".push.services.mozilla.com")
}

func publicPushIP(ip net.IP) bool {
	a, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	a = a.Unmap()
	if !a.IsGlobalUnicast() || a.IsPrivate() || a.IsLoopback() || a.IsLinkLocalUnicast() || a.IsUnspecified() {
		return false
	}
	for _, prefix := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32", "2001::/32", "2002::/16", "64:ff9b::/96", "64:ff9b:1::/48"} {
		if netip.MustParsePrefix(prefix).Contains(a) {
			return false
		}
	}
	return true
}

func newPushHTTPClient() *http.Client {
	transport := &http.Transport{Proxy: nil, ResponseHeaderTimeout: 8 * time.Second, TLSHandshakeTimeout: 8 * time.Second, MaxResponseHeaderBytes: 8192, DisableKeepAlives: true}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, e := net.SplitHostPort(address)
		if e != nil || port != "443" || !validPushEndpoint("https://"+host+"/delivery") {
			return nil, errors.New("push destination rejected")
		}
		ips, e := net.DefaultResolver.LookupIPAddr(ctx, host)
		if e != nil || len(ips) == 0 {
			return nil, errors.New("push destination unresolved")
		}
		for _, ip := range ips {
			if !publicPushIP(ip.IP) {
				return nil, errors.New("push destination rejected")
			}
		}
		dialer := net.Dialer{Timeout: 8 * time.Second}
		for _, ip := range ips {
			conn, e := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), "443"))
			if e == nil {
				return conn, nil
			}
		}
		return nil, errors.New("push provider unavailable")
	}
	return &http.Client{Transport: transport, Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("push redirect rejected") }}
}

// RunPushWorker transports already-created inbox notifications; it never creates reminder schedules.
func RunPushWorker(ctx context.Context, store *Store, config Config) {
	if !pushConfigured(config) {
		return
	}
	client := newPushHTTPClient()
	defer client.CloseIdleConnections()
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		if ctx.Err() != nil {
			return
		}
		if e := deliverPushTick(ctx, store, config, client, time.Now().UTC()); e != nil && ctx.Err() == nil {
			log.Print("push delivery tick failed")
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func enqueuePush(ctx context.Context, store *Store, config Config, now time.Time) error {
	// The migration's AFTER INSERT trigger enqueues atomically with each new notification.
	// This tick only invalidates changed server keys, without replaying historical inbox rows.
	_, e := store.db.ExecContext(ctx, `UPDATE push_subscriptions SET enabled=0,last_status='key_changed' WHERE enabled=1 AND vapid_public_key<>?`, config.PushVAPIDPublicKey)
	return e
}

type pushJob struct {
	id, subscription, notification, endpoint, public, auth, lease, expires string
	user                                                                   int64
	attempts                                                               int
}

func deliverPushTick(ctx context.Context, store *Store, config Config, client webpush.HTTPClient, now time.Time) error {
	started := time.Now()
	if !pushConfigured(config) {
		return nil
	}
	if e := enqueuePush(ctx, store, config, now); e != nil {
		return e
	}
	// Keep a bounded batch and release rows before SQLite transactions or network calls.
	rows, e := store.db.QueryContext(ctx, `SELECT id FROM push_deliveries WHERE (status='pending' AND julianday(next_attempt_at)<=julianday(?)) OR (status='sending' AND julianday(lease_until)<=julianday(?)) ORDER BY next_attempt_at,id LIMIT 30`, now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if e != nil {
		return e
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, id := range ids {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if e = deliverPushJob(ctx, store, config, client, id, now.Add(time.Since(started))); e != nil {
			return e
		}
	}
	return nil
}

func deliverPushJob(ctx context.Context, store *Store, config Config, client webpush.HTTPClient, id string, now time.Time) error {
	token, e := newID()
	if e != nil {
		return e
	}
	result, e := store.db.ExecContext(ctx, `UPDATE push_deliveries SET status='sending',lease_token=?,lease_until=? WHERE id=? AND ((status='pending' AND julianday(next_attempt_at)<=julianday(?)) OR (status='sending' AND julianday(lease_until)<=julianday(?)))`, token, now.Add(time.Minute).Format(time.RFC3339Nano), id, now.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if e != nil {
		return e
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return nil
	}
	var j pushJob
	j.id = id
	j.lease = token
	e = store.db.QueryRowContext(ctx, `SELECT d.subscription_id,COALESCE(d.notification_id,''),p.user_id,p.endpoint,p.p256dh,p.auth,d.attempts,d.expires_at FROM push_deliveries d JOIN push_subscriptions p ON p.id=d.subscription_id JOIN sessions se ON se.token_hash=p.session_hash AND se.user_id=p.user_id WHERE d.id=? AND d.lease_token=? AND p.enabled=1 AND p.vapid_public_key=? AND julianday(se.expires_at)>julianday(?)`, id, token, config.PushVAPIDPublicKey, now.Format(time.RFC3339Nano)).Scan(&j.subscription, &j.notification, &j.user, &j.endpoint, &j.public, &j.auth, &j.attempts, &j.expires)
	if e == sql.ErrNoRows {
		return finishPush(ctx, store, j, "cancelled", "disabled", now, now, false)
	}
	if e != nil {
		return e
	}
	expires, e := time.Parse(time.RFC3339Nano, j.expires)
	if e != nil || !expires.After(now) || j.attempts >= 5 || !validPushEndpoint(j.endpoint) {
		return finishPush(ctx, store, j, "failed", "expired", now, now, false)
	}
	if j.notification != "" {
		allowed, quiet, e := pushNotificationAllowed(ctx, store, j.user, j.notification, now)
		if e != nil {
			return e
		}
		if !allowed {
			return finishPush(ctx, store, j, "cancelled", "obsolete", now, now, false)
		}
		if quiet {
			return finishPush(ctx, store, j, "pending", "quiet", now, now.Add(time.Minute), false)
		}
	}
	// No transaction is held during encryption/HTTP. Revocation cannot recall an already accepted send.
	payload, _ := json.Marshal(map[string]any{"version": 1, "type": map[bool]string{true: "test", false: "notification"}[j.notification == ""], "tag": "tessavie-" + j.id, "url": "/?launch=notifications"})
	topic := sha256.Sum256([]byte(j.id))
	ttl := int(expires.Sub(now).Seconds())
	if ttl > 3600 {
		ttl = 3600
	}
	if ttl < 1 {
		ttl = 1
	}
	sendCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	response, sendErr := webpush.SendNotificationWithContext(sendCtx, payload, &webpush.Subscription{Endpoint: j.endpoint, Keys: webpush.Keys{P256dh: j.public, Auth: j.auth}}, &webpush.Options{HTTPClient: client, TTL: ttl, Topic: base64.RawURLEncoding.EncodeToString(topic[:24]), Urgency: webpush.UrgencyNormal, Subscriber: strings.TrimPrefix(config.PushVAPIDSubject, "mailto:"), VAPIDPublicKey: config.PushVAPIDPublicKey, VAPIDPrivateKey: config.PushVAPIDPrivateKey})
	status, last := "pending", "retrying"
	next := now.Add(time.Duration(30*(1<<j.attempts)) * time.Second)
	code := 0
	if response != nil {
		code = response.StatusCode
		io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		response.Body.Close()
	}
	if sendErr == nil && code >= 200 && code < 300 {
		status, last = "accepted", "accepted"
	} else if code == 404 || code == 410 {
		// Retain a credential-free status in UI until the owner reconnects or removes it.
		_, e = store.db.ExecContext(ctx, `UPDATE push_subscriptions SET enabled=0,endpoint='expired:'||id,p256dh='',auth='',last_status='expired' WHERE id=?`, j.subscription)
		if e != nil {
			return e
		}
		status, last = "failed", "expired"
	} else if sendErr == nil && code != 429 && code != 503 && code < 500 {
		status, last = "failed", "rejected"
	}
	if response != nil && (code == 429 || code == 503) {
		if retry := pushRetryAfter(response.Header.Get("Retry-After"), now); retry.After(next) {
			next = retry
		}
	}
	if status == "pending" && (j.attempts+1 >= 5 || !next.Before(expires)) {
		status, last = "failed", "failed"
	}
	return finishPush(ctx, store, j, status, last, now, next, true)
}

func pushRetryAfter(value string, now time.Time) time.Time {
	seconds, e := strconv.Atoi(value)
	if e == nil && seconds >= 0 {
		if seconds > 3600 {
			seconds = 3600
		}
		return now.Add(time.Duration(seconds) * time.Second)
	}
	if when, e := http.ParseTime(value); e == nil {
		if when.After(now.Add(time.Hour)) {
			return now.Add(time.Hour)
		}
		return when
	}
	return now
}

func finishPush(ctx context.Context, store *Store, j pushJob, status, last string, now, next time.Time, attempt bool) error {
	tx, e := store.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	result, e := tx.ExecContext(ctx, `UPDATE push_deliveries SET status=?,next_attempt_at=?,lease_until='',lease_token='',attempts=attempts+? WHERE id=? AND lease_token=?`, status, next.Format(time.RFC3339Nano), attempt, j.id, j.lease)
	if e != nil {
		return e
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return nil
	}
	if j.subscription != "" {
		_, e = tx.ExecContext(ctx, `UPDATE push_subscriptions SET last_status=?,last_attempt_at=CASE WHEN ? THEN ? ELSE last_attempt_at END,last_success_at=CASE WHEN ?='accepted' THEN ? ELSE last_success_at END WHERE id=?`, last, attempt, now.Format(time.RFC3339Nano), status, now.Format(time.RFC3339Nano), j.subscription)
		if e != nil {
			return e
		}
	}
	return tx.Commit()
}

func pushNotificationAllowed(ctx context.Context, store *Store, user int64, id string, now time.Time) (bool, bool, error) {
	var typ, workspace string
	e := store.db.QueryRowContext(ctx, `SELECT n.type,COALESCE((SELECT workspace_id FROM records WHERE id=n.entity_id),'') FROM notifications n WHERE n.id=? AND n.read_at IS NULL AND `+notificationAccess+` AND `+notificationFresh+` AND (COALESCE(n.entity_type,'') IN ('personal_plan','personal_habit','personal_digest','waiting_ping') OR NOT EXISTS(SELECT 1 FROM records r WHERE r.id=n.entity_id AND (r.archived_at IS NOT NULL OR r.status='archived')))`, id, user).Scan(&typ, &workspace)
	if e != nil {
		if errors.Is(e, sql.ErrNoRows) {
			return false, false, nil
		}
		return false, false, e
	}
	p, e := loadReminderPreferences(ctx, store.db, user)
	if e != nil {
		return false, false, e
	}
	if (typ == "personal_reminder" && !p.PersonalEnabled) || (typ == "habit_reminder" && !p.HabitsEnabled) || (typ == "deadline" && !p.DeadlineEnabled) || (typ == "daily_digest" && !p.DailyDigestEnabled) || (typ == "weekly_digest" && !p.WeeklyDigestEnabled) {
		return false, false, nil
	}
	if typ == "deadline" {
		enabled, e := reminderProjectEnabled(ctx, store.db, user, workspace)
		if e != nil || !enabled {
			return false, false, e
		}
	}
	loc, e := time.LoadLocation(p.Timezone)
	if e != nil {
		return false, false, e
	}
	return true, reminderQuiet(p, now, loc), nil
}
