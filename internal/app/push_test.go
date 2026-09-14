package app

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/hkdf"
)

type pushFixture struct {
	store         *Store
	server        *httptest.Server
	client, other *http.Client
	user          User
	config        Config
	private       *ecdh.PrivateKey
	auth          []byte
	input         map[string]any
	id            string
}

func newPushFixture(t *testing.T) *pushFixture {
	t.Helper()
	store, e := OpenStore(filepath.Join(t.TempDir(), "push.db"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { store.Close() })
	vapid, e := ecdh.P256().GenerateKey(rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	c := Config{SessionLifetime: 24 * time.Hour, PushEnabled: true, PushVAPIDPublicKey: base64.RawURLEncoding.EncodeToString(vapid.PublicKey().Bytes()), PushVAPIDPrivateKey: base64.RawURLEncoding.EncodeToString(vapid.Bytes()), PushVAPIDSubject: "mailto:admin@example.test"}
	server := httptest.NewServer(NewServer(store, c))
	t.Cleanup(server.Close)
	client, other := testClient(t), testClient(t)
	user := registerVerifiedWithoutFixture(t, client, server.URL, "push@example.test", "push_owner")
	registerVerifiedWithoutFixture(t, other, server.URL, "otherpush@example.test", "push_other")
	private, e := ecdh.P256().GenerateKey(rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	auth := make([]byte, 16)
	rand.Read(auth)
	in := map[string]any{"name": "Мой телефон", "endpoint": "https://fcm.googleapis.com/fcm/send/test-secret-device", "expectedPublicKey": c.PushVAPIDPublicKey, "keys": map[string]string{"p256dh": base64.RawURLEncoding.EncodeToString(private.PublicKey().Bytes()), "auth": base64.RawURLEncoding.EncodeToString(auth)}}
	return &pushFixture{store: store, server: server, client: client, other: other, user: user, config: c, private: private, auth: auth, input: in}
}
func (f *pushFixture) subscribe(t *testing.T) string {
	t.Helper()
	var out map[string]string
	requestJSON(t, f.client, "POST", f.server.URL+"/api/me/push/subscriptions", f.input, 200, &out)
	f.id = out["subscriptionId"]
	return f.id
}
func (f *pushFixture) notice(t *testing.T, id string) {
	t.Helper()
	if _, e := f.store.db.Exec(`INSERT INTO notifications(id,user_id,type,title,body,created_at) VALUES(?,?,'record_update','PRIVATE TITLE','PRIVATE FINANCE BODY',?)`, id, f.user.ID, nowText()); e != nil {
		t.Fatal(e)
	}
}

type pushFakeClient func(*http.Request) (*http.Response, error)

func (f pushFakeClient) Do(r *http.Request) (*http.Response, error) { return f(r) }
func pushResponse(code int, after string) *http.Response {
	return &http.Response{StatusCode: code, Header: http.Header{"Retry-After": []string{after}}, Body: io.NopCloser(strings.NewReader("provider-private-response"))}
}
func (f *pushFixture) tick(t *testing.T, client pushFakeClient, now time.Time) {
	t.Helper()
	if e := deliverPushTick(context.Background(), f.store, f.config, client, now); e != nil {
		t.Fatal(e)
	}
}
func (f *pushFixture) decrypt(t *testing.T, r *http.Request) map[string]any {
	t.Helper()
	if r.Method != "POST" || r.Header.Get("Content-Encoding") != "aes128gcm" || !strings.HasPrefix(r.Header.Get("Authorization"), "vapid ") || len(r.Header.Get("Topic")) != 32 {
		t.Fatalf("unencrypted/unsigned request headers: %v", r.Header)
	}
	encoded := strings.TrimPrefix(strings.Split(r.Header.Get("Authorization"), ",")[0], "vapid t=")
	pubBytes, _ := base64.RawURLEncoding.DecodeString(f.config.PushVAPIDPublicKey)
	x, y := elliptic.Unmarshal(elliptic.P256(), pubBytes)
	parsed, e := jwt.Parse(encoded, func(token *jwt.Token) (any, error) { return &ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, nil }, jwt.WithValidMethods([]string{"ES256"}), jwt.WithAudience("https://fcm.googleapis.com"), jwt.WithSubject(f.config.PushVAPIDSubject))
	if e != nil || !parsed.Valid {
		t.Fatalf("invalid VAPID identity/signature: %v", e)
	}
	data, e := io.ReadAll(r.Body)
	if e != nil || len(data) < 86 {
		t.Fatal("missing encrypted record")
	}
	if bytes.Contains(data, []byte("PRIVATE")) {
		t.Fatal("plaintext leaked")
	}
	pub, e := ecdh.P256().NewPublicKey(data[21:86])
	if e != nil {
		t.Fatal(e)
	}
	shared, e := f.private.ECDH(pub)
	if e != nil {
		t.Fatal(e)
	}
	info := append([]byte("WebPush: info\x00"), f.private.PublicKey().Bytes()...)
	info = append(info, pub.Bytes()...)
	derive := func(secret, salt, info []byte, n int) []byte {
		out := make([]byte, n)
		if _, e := io.ReadFull(hkdf.New(sha256.New, secret, salt, info), out); e != nil {
			t.Fatal(e)
		}
		return out
	}
	ikm := derive(shared, f.auth, info, 32)
	key := derive(ikm, data[:16], []byte("Content-Encoding: aes128gcm\x00"), 16)
	nonce := derive(ikm, data[:16], []byte("Content-Encoding: nonce\x00"), 12)
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	plain, e := gcm.Open(nil, nonce, data[86:], nil)
	if e != nil {
		t.Fatal(e)
	}
	plain = bytes.TrimRight(plain, "\x00")
	if plain[len(plain)-1] != 2 {
		t.Fatal("record delimiter")
	}
	plain = plain[:len(plain)-1]
	var out map[string]any
	if e = json.Unmarshal(plain, &out); e != nil {
		t.Fatal(e)
	}
	if len(out) != 4 || out["url"] != "/?launch=notifications" || out["version"] != float64(1) || strings.Contains(string(plain), "PRIVATE") {
		t.Fatalf("unsafe payload: %s", plain)
	}
	return out
}

func TestPushRetryBudgetDisableKeyRotationAndNoDatabaseLockDuringHTTP(t *testing.T) {
	f := newPushFixture(t)
	f.subscribe(t)
	f.notice(t, "rate-limited")
	now := time.Now().UTC()
	calls := 0
	fake := pushFakeClient(func(r *http.Request) (*http.Response, error) {
		calls++
		f.decrypt(t, r)
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		var one int
		if e := f.store.db.QueryRowContext(ctx, `SELECT 1`).Scan(&one); e != nil {
			t.Fatal("database held during network call", e)
		}
		return pushResponse(429, "0"), nil
	})
	for i := 0; i < 8; i++ {
		f.tick(t, fake, now.Add(time.Duration(i)*10*time.Minute))
	}
	if calls != 5 {
		t.Fatalf("unbounded/missing retries: %d", calls)
	}
	var status string
	f.store.db.QueryRow(`SELECT status FROM push_deliveries WHERE notification_id='rate-limited'`).Scan(&status)
	if status != "failed" {
		t.Fatal("budget not closed")
	}
	f.notice(t, "disabled-config")
	disabled := f.config
	disabled.PushEnabled = false
	if e := deliverPushTick(context.Background(), f.store, disabled, fake, now.Add(2*time.Hour)); e != nil {
		t.Fatal(e)
	}
	if calls != 5 {
		t.Fatal("disabled transport sent")
	}
	key, _ := ecdh.P256().GenerateKey(rand.Reader)
	changed := f.config
	changed.PushVAPIDPublicKey = base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes())
	changed.PushVAPIDPrivateKey = base64.RawURLEncoding.EncodeToString(key.Bytes())
	if e := deliverPushTick(context.Background(), f.store, changed, fake, now.Add(2*time.Hour)); e != nil {
		t.Fatal(e)
	}
	if calls != 5 {
		t.Fatal("changed VAPID sent")
	}
	var enabled bool
	f.store.db.QueryRow(`SELECT enabled,last_status FROM push_subscriptions WHERE id=?`, f.id).Scan(&enabled, &status)
	if enabled || status != "key_changed" {
		t.Fatal("changed key not reflected")
	}
}

func TestPushConsentIsNotBackfilledAfterReadToggleOrVacuum(t *testing.T) {
	f := newPushFixture(t)
	f.notice(t, "before-consent")
	f.subscribe(t)
	if _, e := f.store.db.Exec(`VACUUM`); e != nil {
		t.Fatal(e)
	}
	requestJSON(t, f.client, "POST", f.server.URL+"/api/notifications/before-consent/read", nil, 204, nil)
	requestJSON(t, f.client, "POST", f.server.URL+"/api/notifications/before-consent/unread", nil, 204, nil)
	calls := 0
	fake := pushFakeClient(func(r *http.Request) (*http.Response, error) {
		calls++
		f.decrypt(t, r)
		return pushResponse(201, ""), nil
	})
	f.tick(t, fake, time.Now())
	if calls != 0 {
		t.Fatal("backfilled preconsent event")
	}
	f.notice(t, "after-vacuum")
	f.tick(t, fake, time.Now())
	if calls != 1 {
		t.Fatal("new event lost after vacuum")
	}
	requestJSON(t, f.client, "DELETE", f.server.URL+"/api/me/push/subscriptions/"+f.id, nil, 204, nil)
	f.notice(t, "while-unsubscribed")
	f.subscribe(t)
	f.tick(t, fake, time.Now())
	if calls != 1 {
		t.Fatal("resubscribe replayed old inbox")
	}
}

func TestPushExplicitConsentMetadataIdempotencyAndLogout(t *testing.T) {
	f := newPushFixture(t)
	f.notice(t, "old")
	var settings struct {
		Configured bool         `json:"configured"`
		PublicKey  string       `json:"publicKey"`
		Devices    []pushDevice `json:"devices"`
	}
	requestJSON(t, f.client, "GET", f.server.URL+"/api/me/push", nil, 200, &settings)
	if !settings.Configured || len(settings.Devices) != 0 {
		t.Fatal("GET enrolled a device")
	}
	id := f.subscribe(t)
	if f.subscribe(t) != id {
		t.Fatal("repeat changed consent")
	}
	var receipt map[string]string
	requestJSON(t, f.other, "POST", f.server.URL+"/api/me/push/subscriptions", f.input, 409, nil)
	requestJSON(t, f.other, "POST", f.server.URL+"/api/me/push/test", map[string]string{"subscriptionId": id}, 404, nil)
	requestJSON(t, f.other, "DELETE", f.server.URL+"/api/me/push/subscriptions/"+id, nil, 404, nil)
	requestJSON(t, f.client, "GET", f.server.URL+"/api/me/push", nil, 200, &settings)
	if len(settings.Devices) != 1 || !settings.Devices[0].Current {
		t.Fatal("missing current device")
	}
	raw, _ := json.Marshal(settings)
	for _, secret := range []string{"endpoint", "p256dh", "auth", "session_hash", "test-secret-device"} {
		if bytes.Contains(raw, []byte(secret)) {
			t.Fatal("subscription credentials leaked")
		}
	}
	sent := 0
	fake := pushFakeClient(func(r *http.Request) (*http.Response, error) {
		sent++
		payload := f.decrypt(t, r)
		if payload["type"] != "notification" {
			t.Fatal("wrong type")
		}
		return pushResponse(201, ""), nil
	})
	f.tick(t, fake, time.Now())
	if sent != 0 {
		t.Fatal("old notifications sent on enable")
	}
	f.notice(t, "new")
	f.subscribe(t)
	f.tick(t, fake, time.Now())
	f.tick(t, fake, time.Now().Add(time.Minute))
	if sent != 1 {
		t.Fatalf("new notification not exactly queued once: %d", sent)
	}
	requestJSON(t, f.client, "POST", f.server.URL+"/api/me/push/test", map[string]string{"subscriptionId": id}, 202, &receipt)
	first := receipt["deliveryId"]
	requestJSON(t, f.client, "POST", f.server.URL+"/api/me/push/test", map[string]string{"subscriptionId": id}, 202, &receipt)
	if first != receipt["deliveryId"] {
		t.Fatal("duplicate test")
	}
	requestJSON(t, f.client, "POST", f.server.URL+"/api/auth/logout", nil, 204, nil)
	f.tick(t, fake, time.Now())
	if sent != 1 {
		t.Fatal("logout did not revoke pending push")
	}
	var count int
	f.store.db.QueryRow(`SELECT COUNT(*) FROM push_subscriptions`).Scan(&count)
	if count != 0 {
		t.Fatal("logout left keys")
	}
}

func TestPushQuietReadAndAccessRevocationBeforeTransport(t *testing.T) {
	f := newPushFixture(t)
	f.subscribe(t)
	now := time.Now().UTC()
	f.notice(t, "read")
	f.notice(t, "quiet")
	if e := enqueuePush(context.Background(), f.store, f.config, now); e != nil {
		t.Fatal(e)
	}
	requestJSON(t, f.client, "POST", f.server.URL+"/api/notifications/read/read", nil, 204, nil)
	requestJSON(t, f.client, "PUT", f.server.URL+"/api/me/reminders", map[string]any{"deadlineEnabled": true, "timezone": "UTC", "quietStart": now.Add(-time.Minute).Format("15:04"), "quietEnd": now.Add(time.Hour).Format("15:04"), "expectedUpdatedAt": ""}, 200, nil)
	sent := 0
	fake := pushFakeClient(func(r *http.Request) (*http.Response, error) {
		sent++
		f.decrypt(t, r)
		return pushResponse(201, ""), nil
	})
	f.tick(t, fake, now)
	if sent != 0 {
		t.Fatal("read/quiet notification sent")
	}
	f.tick(t, fake, now.Add(2*time.Hour))
	if sent != 1 {
		t.Fatal("quiet notification not resumed")
	}
	var workspace Workspace
	requestJSON(t, f.client, "POST", f.server.URL+"/api/workspaces", map[string]any{"name": "Push project"}, 201, &workspace)
	var record Record
	requestWorkspaceJSON(t, f.client, "POST", f.server.URL+"/api/records", workspace.ID, map[string]any{"type": "task", "title": "Private team item"}, 201, &record)
	f.notice(t, "revoked")
	f.store.db.Exec(`UPDATE notifications SET entity_type='task',entity_id=? WHERE id='revoked'`, record.ID)
	if e := enqueuePush(context.Background(), f.store, f.config, now.Add(2*time.Hour)); e != nil {
		t.Fatal(e)
	}
	if _, e := f.store.db.Exec(`UPDATE workspace_members SET status='suspended' WHERE user_id=? AND workspace_id=?`, f.user.ID, workspace.ID); e != nil {
		t.Fatal(e)
	}
	f.tick(t, fake, now.Add(2*time.Hour))
	if sent != 1 {
		t.Fatal("revoked content was pushed")
	}
}

func TestPushPersonalSourceArchivedAndPreferenceDisabled(t *testing.T) {
	f := newPushFixture(t)
	f.subscribe(t)
	var plan PersonalPlan
	requestJSON(t, f.client, "POST", f.server.URL+"/api/personal/plans", map[string]any{"title": "Private appointment"}, 201, &plan)
	at := time.Now().UTC().Add(time.Minute)
	requestJSON(t, f.client, "PUT", f.server.URL+"/api/personal/plans/"+plan.ID+"/reminder", map[string]any{"remindAt": at.Format(time.RFC3339Nano), "timezone": "UTC", "expectedRevision": 0, "expectedPlanUpdatedAt": plan.UpdatedAt}, 200, nil)
	if e := deliverPersonalPlanReminders(context.Background(), f.store, at.Add(time.Second)); e != nil {
		t.Fatal(e)
	}
	if e := enqueuePush(context.Background(), f.store, f.config, at.Add(time.Second)); e != nil {
		t.Fatal(e)
	}
	requestJSON(t, f.client, "PUT", f.server.URL+"/api/me/reminders", map[string]any{"deadlineEnabled": true, "personalEnabled": false, "timezone": "UTC", "expectedUpdatedAt": ""}, 200, nil)
	fake := pushFakeClient(func(*http.Request) (*http.Response, error) { t.Fatal("disabled reminder pushed"); return nil, nil })
	f.tick(t, fake, at.Add(2*time.Second))
	f.notice(t, "archived")
	f.store.db.Exec(`UPDATE notifications SET entity_type='personal_plan',entity_id=? WHERE id='archived'`, plan.ID)
	if e := enqueuePush(context.Background(), f.store, f.config, at.Add(3*time.Second)); e != nil {
		t.Fatal(e)
	}
	if _, e := f.store.db.Exec(`UPDATE personal_plans SET status='archived' WHERE id=?`, plan.ID); e != nil {
		t.Fatal(e)
	}
	f.tick(t, fake, at.Add(4*time.Second))
}

func TestPushRetryConcurrencyLeaseRecoveryAndProviderExpiry(t *testing.T) {
	f := newPushFixture(t)
	f.subscribe(t)
	f.notice(t, "retry")
	now := time.Now().UTC()
	var calls atomic.Int32
	tags := []string{}
	var mu sync.Mutex
	fake := pushFakeClient(func(r *http.Request) (*http.Response, error) {
		p := f.decrypt(t, r)
		mu.Lock()
		tags = append(tags, p["tag"].(string))
		mu.Unlock()
		if calls.Add(1) == 1 {
			return pushResponse(503, "120"), nil
		}
		return pushResponse(201, ""), nil
	})
	f.tick(t, fake, now)
	f.tick(t, fake, now.Add(time.Minute))
	if calls.Load() != 1 {
		t.Fatal("ignored Retry-After")
	}
	var wg sync.WaitGroup
	errs := make(chan error, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- deliverPushTick(context.Background(), f.store, f.config, fake, now.Add(3*time.Minute))
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	if calls.Load() != 2 || tags[0] != tags[1] {
		t.Fatal("retry duplicated job/tag")
	}
	// Simulate a crash after provider acceptance, before the receipt: same tag on lease retry.
	var id string
	f.store.db.QueryRow(`SELECT id FROM push_deliveries WHERE notification_id='retry'`).Scan(&id)
	f.store.db.Exec(`UPDATE push_deliveries SET status='sending',lease_token='lost',lease_until=? WHERE id=?`, now.Format(time.RFC3339Nano), id)
	f.tick(t, fake, now.Add(4*time.Minute))
	if calls.Load() != 3 || tags[2] != tags[0] {
		t.Fatal("unknown outcome changed identity")
	}
	f.notice(t, "gone")
	expired := pushFakeClient(func(r *http.Request) (*http.Response, error) { f.decrypt(t, r); return pushResponse(410, ""), nil })
	f.tick(t, expired, now.Add(5*time.Minute))
	var enabled bool
	var public, auth, endpoint string
	f.store.db.QueryRow(`SELECT enabled,p256dh,auth,endpoint FROM push_subscriptions WHERE id=?`, f.id).Scan(&enabled, &public, &auth, &endpoint)
	if enabled || public != "" || auth != "" || strings.HasPrefix(endpoint, "https:") {
		t.Fatal("expired credentials retained")
	}
	f.notice(t, "after-expired")
	f.tick(t, fake, now.Add(6*time.Minute))
	if calls.Load() != 3 {
		t.Fatal("expired endpoint sent again")
	}
}

func TestPushSessionsRebindAndExpiry(t *testing.T) {
	f := newPushFixture(t)
	old := f.subscribe(t)
	f.notice(t, "before-rebind")
	second := testClient(t)
	requestJSON(t, second, "POST", f.server.URL+"/api/auth/login", map[string]string{"login": "push_owner", "password": "strong-password-123"}, 200, nil)
	var out map[string]string
	requestJSON(t, second, "POST", f.server.URL+"/api/me/push/test", map[string]string{"subscriptionId": old}, 404, nil)
	requestJSON(t, second, "POST", f.server.URL+"/api/me/push/subscriptions", f.input, 200, &out)
	if out["subscriptionId"] == old {
		t.Fatal("rebind retained old consent")
	}
	f.notice(t, "after-rebind")
	u, _ := url.Parse(f.server.URL)
	for _, cookie := range second.Jar.Cookies(u) {
		if cookie.Name == sessionCookieName {
			f.store.db.Exec(`UPDATE sessions SET expires_at=? WHERE token_hash=?`, time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano), hashToken(cookie.Value))
		}
	}
	f.tick(t, pushFakeClient(func(*http.Request) (*http.Response, error) { t.Fatal("expired login sent"); return nil, nil }), time.Now())
}

func TestPushEndpointAndKeyValidation(t *testing.T) {
	for _, raw := range []string{"http://fcm.googleapis.com/send/a", "https://fcm.googleapis.com:443/send/a", "https://fcm.googleapis.com.evil.test/a", "https://evil@fcm.googleapis.com/a", "https://fcm.googleapis.com/a#b", "https://127.0.0.1/a", "https://push.apple.com/a", "https://fcm.googleapis.com/", "https://push.services.mozilla.com/a"} {
		if validPushEndpoint(raw) {
			t.Fatalf("unsafe endpoint accepted: %s", raw)
		}
	}
	for _, raw := range []string{"https://fcm.googleapis.com/fcm/send/a", "https://web.push.apple.com/Q/a", "https://updates.push.services.mozilla.com/wpush/v2/a"} {
		if !validPushEndpoint(raw) {
			t.Fatalf("provider rejected: %s", raw)
		}
	}
	for _, raw := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.100.100.200", "192.0.2.1", "::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "2001:db8::1"} {
		if publicPushIP(net.ParseIP(raw)) {
			t.Fatalf("private address allowed: %s", raw)
		}
	}
	if !publicPushIP(net.ParseIP("8.8.8.8")) || !publicPushIP(net.ParseIP("2606:4700:4700::1111")) {
		t.Fatal("public IP denied")
	}
	c := newPushHTTPClient()
	if c.Transport.(*http.Transport).Proxy != nil || c.CheckRedirect(&http.Request{}, nil) == nil {
		t.Fatal("redirect/proxy allowed")
	}
	f := newPushFixture(t)
	f.input["endpoint"] = "https://127.0.0.1/private"
	requestJSON(t, f.client, "POST", f.server.URL+"/api/me/push/subscriptions", f.input, 400, nil)
	f.input["endpoint"] = "https://fcm.googleapis.com/fcm/send/x"
	f.input["keys"] = map[string]string{"p256dh": "invalid", "auth": "invalid"}
	requestJSON(t, f.client, "POST", f.server.URL+"/api/me/push/subscriptions", f.input, 400, nil)
	req, _ := http.NewRequest("POST", f.server.URL+"/api/me/push/test", strings.NewReader(`{"subscriptionId":"anything"}`))
	req.Header.Set("Origin", "https://evil.test")
	response, e := f.client.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	response.Body.Close()
	if response.StatusCode != 403 {
		t.Fatal("cross origin mutation permitted")
	}
	invalid := f.config
	invalid.PushVAPIDPublicKey = base64.RawURLEncoding.EncodeToString(f.private.PublicKey().Bytes())
	if pushConfigured(invalid) {
		t.Fatal("mismatched VAPID accepted")
	}
}

func TestPushExpectedPublicKeyProtectsRegistrationAndExistingConsent(t *testing.T) {
	f := newPushFixture(t)
	delete(f.input, "expectedPublicKey")
	requestJSON(t, f.client, "POST", f.server.URL+"/api/me/push/subscriptions", f.input, 400, nil)
	var count int
	if err := f.store.db.QueryRow(`SELECT COUNT(*) FROM push_subscriptions`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("missing key created a subscription: count=%d err=%v", count, err)
	}
	staleKey, _ := ecdh.P256().GenerateKey(rand.Reader)
	f.input["expectedPublicKey"] = base64.RawURLEncoding.EncodeToString(staleKey.PublicKey().Bytes())
	var response map[string]string
	requestJSON(t, f.client, "POST", f.server.URL+"/api/me/push/subscriptions", f.input, 409, &response)
	if response["code"] != "push_key_changed" {
		t.Fatalf("missing rotation recovery code: %v", response)
	}
	if err := f.store.db.QueryRow(`SELECT COUNT(*) FROM push_subscriptions`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("stale key created a subscription: count=%d err=%v", count, err)
	}
	f.input["expectedPublicKey"] = f.config.PushVAPIDPublicKey
	id := f.subscribe(t)
	f.notice(t, "keep-existing-consent")
	f.input["name"] = "Must not change"
	f.input["expectedPublicKey"] = base64.RawURLEncoding.EncodeToString(staleKey.PublicKey().Bytes())
	requestJSON(t, f.client, "POST", f.server.URL+"/api/me/push/subscriptions", f.input, 409, &response)
	var name, storedID string
	if err := f.store.db.QueryRow(`SELECT id,name FROM push_subscriptions WHERE user_id=?`, f.user.ID).Scan(&storedID, &name); err != nil || storedID != id || name != "Мой телефон" {
		t.Fatalf("stale request changed existing consent: id=%s name=%s err=%v", storedID, name, err)
	}
	if err := f.store.db.QueryRow(`SELECT COUNT(*) FROM push_deliveries WHERE subscription_id=? AND notification_id='keep-existing-consent'`, id).Scan(&count); err != nil || count != 1 {
		t.Fatalf("stale request removed existing queue: count=%d err=%v", count, err)
	}
}
