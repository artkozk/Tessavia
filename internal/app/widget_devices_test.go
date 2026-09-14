package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type widgetFixture struct {
	lifecycleFixture
	page       WorkspacePage
	definition PageAppDefinition
}
type widgetPairResult struct {
	ID      string `json:"id"`
	Code    string `json:"pairingCode"`
	Expires string `json:"pairingExpiresAt"`
}
type widgetRedeemResult struct {
	Token   string `json:"token"`
	Expires string `json:"expiresAt"`
	ID      string `json:"widgetId"`
}

func newWidgetFixture(t *testing.T) widgetFixture {
	t.Helper()
	f := widgetFixture{lifecycleFixture: newLifecycleFixture(t)}
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/workspace/pages", f.project.ID, map[string]any{"name": "My builder page"}, 201, &f.page)
	items := []PageAppItem{}
	for i := 0; i < 12; i++ {
		items = append(items, PageAppItem{ID: fmt.Sprintf("item%d", i), Label: fmt.Sprintf("Visible item %d", i)})
	}
	items = append(items, PageAppItem{ID: "hidden", Label: "HIDDEN ITEM SECRET", Hidden: true})
	f.definition = PageAppDefinition{Version: 1, Blocks: []PageAppBlock{
		{ID: "tracker", Kind: "tracker", Title: "My chosen checklist", Items: items, Color: "#123456", Background: "#abcdef"},
		{ID: "progress", Kind: "progress", Title: "Chosen progress", Source: "tracker"},
		{ID: "private", Kind: "text", Title: "UNRELATED TITLE SECRET", Text: "UNRELATED CONTENT SECRET"},
	}}
	f.save(t, 0)
	requestWorkspaceJSON(t, f.clients["member"], "PUT", f.url+"/api/workspace/pages/"+f.page.ID+"/app/marks", f.project.ID, map[string]any{"blockId": "tracker", "itemId": "item0", "checked": true, "expectedRevision": 1}, 200, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "PUT", f.url+"/api/workspace/pages/"+f.page.ID+"/app/marks", f.project.ID, map[string]any{"blockId": "tracker", "itemId": "item1", "checked": true, "expectedRevision": 1}, 200, nil)
	return f
}
func (f widgetFixture) save(t *testing.T, revision int) {
	t.Helper()
	requestWorkspaceJSON(t, f.clients["owner"], "PUT", f.url+"/api/workspace/pages/"+f.page.ID+"/app", f.project.ID, map[string]any{"definition": f.definition, "expectedRevision": revision}, 200, nil)
}
func (f widgetFixture) grant(t *testing.T, actor, block string) widgetPairResult {
	t.Helper()
	var out widgetPairResult
	requestWorkspaceJSON(t, f.clients[actor], "POST", f.url+"/api/me/widgets", f.project.ID, map[string]any{"pageId": f.page.ID, "blockId": block, "name": "My phone"}, 201, &out)
	if !validWidgetSecret(out.Code, 32) || !pageAppID.MatchString(out.ID) {
		t.Fatal("bad pairing response")
	}
	expires, err := time.Parse(time.RFC3339Nano, out.Expires)
	if err != nil || time.Until(expires) < 4*time.Minute || time.Until(expires) > widgetPairLifetime {
		t.Fatal("bad pairing expiry")
	}
	return out
}
func widgetRequest(t *testing.T, client *http.Client, method, url, token string, body any, status int, out any) string {
	t.Helper()
	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		payload = bytes.NewReader(raw)
	}
	r, err := http.NewRequest(method, url, payload)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != status {
		t.Fatalf("%s %s status %d want %d: %s", method, url, resp.StatusCode, status, raw)
	}
	if resp.Header.Get("Cache-Control") != "private, no-store" {
		t.Fatalf("cacheable credential/snapshot: %v", resp.Header)
	}
	if resp.Header.Get("Set-Cookie") != "" {
		t.Fatal("native widget issued browser cookie")
	}
	if out != nil && json.Unmarshal(raw, out) != nil {
		t.Fatalf("invalid JSON: %s", raw)
	}
	return string(raw)
}
func (f widgetFixture) redeem(t *testing.T, p widgetPairResult) widgetRedeemResult {
	t.Helper()
	var result widgetRedeemResult
	widgetRequest(t, http.DefaultClient, "POST", f.url+"/api/mobile/widgets/redeem", "", map[string]any{"code": p.Code}, 201, &result)
	if result.ID != p.ID || !validWidgetSecret(result.Token, 64) {
		t.Fatal("wrong widget token")
	}
	expires, err := time.Parse(time.RFC3339Nano, result.Expires)
	if err != nil || time.Until(expires) < widgetGrantLifetime-time.Minute || time.Until(expires) > widgetGrantLifetime {
		t.Fatal("wrong device expiry")
	}
	return result
}

func TestWidgetDeviceLifecycleReadOnlyIsolationAndCredentials(t *testing.T) {
	f := newWidgetFixture(t)
	var sources struct {
		Sources []widgetSource `json:"sources"`
	}
	requestWorkspaceJSON(t, f.clients["member"], "GET", f.url+"/api/me/widgets/sources", f.project.ID, nil, 200, &sources)
	if len(sources.Sources) != 2 || sources.Sources[0].PageID != f.page.ID || sources.Sources[0].BlockID != "tracker" {
		t.Fatal(sources)
	}
	p := f.grant(t, "member", "tracker")
	var devices struct {
		Devices []widgetDevice `json:"devices"`
	}
	widgetRequest(t, f.clients["member"], "GET", f.url+"/api/me/widgets", "", nil, 200, &devices)
	if len(devices.Devices) != 1 || devices.Devices[0].PairedAt != "" || devices.Devices[0].LastUsedAt != "" {
		t.Fatal("pending pairing looks connected")
	}
	device := f.redeem(t, p)
	var pairing, token string
	if err := f.store.db.QueryRow(`SELECT COALESCE(pairing_hash,''),token_hash FROM widget_devices WHERE id=?`, p.ID).Scan(&pairing, &token); err != nil {
		t.Fatal(err)
	}
	if pairing != "" || token != hashToken(device.Token) || token == device.Token {
		t.Fatal("plaintext credential persisted or pairing survived")
	}
	var snapshot widgetSnapshot
	raw := widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 200, &snapshot)
	if snapshot.WidgetID != p.ID || snapshot.Total != 12 || snapshot.Completed != 1 || len(snapshot.Items) != 8 || !snapshot.Items[0].Checked || snapshot.Items[1].Checked || snapshot.Color != "#123456" || snapshot.OpenURL != "/" {
		t.Fatal("incorrect private snapshot", snapshot)
	}
	for _, secret := range []string{"SECRET", f.page.ID, f.project.ID, device.Token, f.users["member"].Email, "pageId", "blockId", "marks", "definition"} {
		if strings.Contains(raw, secret) {
			t.Fatalf("snapshot leaked field %q", secret)
		}
	}
	if _, err := time.Parse(time.RFC3339Nano, snapshot.UpdatedAt); err != nil {
		t.Fatal("missing actual update time")
	}
	raw = widgetRequest(t, f.clients["member"], "GET", f.url+"/api/me/widgets", "", nil, 200, &devices)
	if len(devices.Devices) != 1 || devices.Devices[0].PairedAt == "" || devices.Devices[0].LastUsedAt == "" {
		t.Fatal("missing pairing/read receipt")
	}
	if strings.Contains(raw, p.Code) || strings.Contains(raw, device.Token) || strings.Contains(raw, "token_hash") || strings.Contains(raw, "pairing_hash") {
		t.Fatal("list leaked credential")
	}
	devices.Devices = nil
	widgetRequest(t, f.clients["owner"], "GET", f.url+"/api/me/widgets", "", nil, 200, &devices)
	if len(devices.Devices) != 0 {
		t.Fatal("other owner sees grant")
	}
	widgetRequest(t, f.clients["owner"], "DELETE", f.url+"/api/me/widgets/"+p.ID, "", nil, 404, nil)
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", "", nil, 401, nil)
	widgetRequest(t, f.clients["member"], "GET", f.url+"/api/mobile/widget", device.Token, nil, 401, nil)
	widgetRequest(t, f.clients["member"], "GET", f.url+"/api/mobile/widget", "", nil, 401, nil)
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/me/widgets", device.Token, nil, 401, nil)
	widgetRequest(t, http.DefaultClient, "POST", f.url+"/api/mobile/widgets/redeem", "", map[string]any{"code": p.Code}, 400, nil)
	widgetRequest(t, f.clients["member"], "DELETE", f.url+"/api/me/widgets/"+p.ID, "", nil, 204, nil)
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 401, nil)
	widgetRequest(t, f.clients["member"], "DELETE", f.url+"/api/me/widgets/"+p.ID, "", nil, 404, nil)
}

func TestWidgetWorkspaceScopeAndProgressSource(t *testing.T) {
	f := newWidgetFixture(t)
	widgetRequest(t, f.clients["member"], "GET", f.url+"/api/me/widgets/sources", "", nil, 400, nil)
	requestWorkspaceJSON(t, f.clients["outsider"], "GET", f.url+"/api/me/widgets/sources", f.project.ID, nil, 403, nil)
	requestWorkspaceJSON(t, f.clients["outsider"], "POST", f.url+"/api/me/widgets", f.project.ID, map[string]any{"pageId": f.page.ID, "blockId": "tracker", "name": "Leak"}, 403, nil)
	var other Workspace
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Other"}, 201, &other)
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/me/widgets", other.ID, map[string]any{"pageId": f.page.ID, "blockId": "tracker", "name": "Wrong scope"}, 403, nil)
	var sources struct {
		Sources []widgetSource `json:"sources"`
	}
	requestWorkspaceJSON(t, f.clients["member"], "GET", f.url+"/api/me/widgets/sources", other.ID, nil, 200, &sources)
	if len(sources.Sources) != 0 {
		t.Fatal("selected workspace ignored")
	}
	device := f.redeem(t, f.grant(t, "member", "progress"))
	var snapshot widgetSnapshot
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 200, &snapshot)
	if snapshot.Kind != "progress" || snapshot.Title != "Chosen progress" || snapshot.Completed != 1 || snapshot.Total != 12 || len(snapshot.Items) != 0 {
		t.Fatal("progress leaked source labels or lost values", snapshot)
	}
	f.definition.Blocks[0].Hidden = true
	f.save(t, 1)
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 403, nil)
	requestWorkspaceJSON(t, f.clients["member"], "GET", f.url+"/api/me/widgets/sources", f.project.ID, nil, 200, &sources)
	if len(sources.Sources) != 0 {
		t.Fatal("hidden progress source offered")
	}
}

func TestWidgetPairingAtomicExpiryAndMalformedRequests(t *testing.T) {
	f := newWidgetFixture(t)
	p := f.grant(t, "member", "tracker")
	const workers = 8
	statuses := make(chan int, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := http.Post(f.url+"/api/mobile/widgets/redeem", "application/json", strings.NewReader(`{"code":"`+p.Code+`"}`))
			if err != nil {
				statuses <- 0
				return
			}
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			statuses <- resp.StatusCode
		}()
	}
	wg.Wait()
	close(statuses)
	success, denied := 0, 0
	for code := range statuses {
		if code == 201 {
			success++
		} else if code == 400 {
			denied++
		} else {
			t.Fatalf("unexpected racing status %d", code)
		}
	}
	if success != 1 || denied != workers-1 {
		t.Fatal("pairing was not single-use", success, denied)
	}
	expired := f.grant(t, "member", "tracker")
	if _, err := f.store.db.Exec(`UPDATE widget_devices SET pairing_expires_at=? WHERE id=?`, time.Now().Add(-time.Minute).UTC().Format(time.RFC3339Nano), expired.ID); err != nil {
		t.Fatal(err)
	}
	widgetRequest(t, http.DefaultClient, "POST", f.url+"/api/mobile/widgets/redeem", "", map[string]any{"code": expired.Code}, 400, nil)
	widgetRequest(t, f.clients["member"], "POST", f.url+"/api/mobile/widgets/redeem", "", map[string]any{"code": p.Code}, 400, nil)
	for _, code := range []string{"", strings.Repeat("z", 32), strings.ToUpper(p.Code), p.Code + "x"} {
		widgetRequest(t, http.DefaultClient, "POST", f.url+"/api/mobile/widgets/redeem", "", map[string]any{"code": code}, 400, nil)
	}
	widgetRequest(t, http.DefaultClient, "POST", f.url+"/api/mobile/widgets/redeem", "", map[string]any{"code": p.Code, "ownerId": f.users["owner"].ID}, 400, nil)
	resp, err := http.Post(f.url+"/api/mobile/widgets/redeem", "application/json", strings.NewReader(`{"code":"`+p.Code+`"} {}`))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatal("trailing JSON accepted")
	}
	device := f.redeem(t, f.grant(t, "member", "tracker"))
	if _, err = f.store.db.Exec(`UPDATE widget_devices SET expires_at=? WHERE id=?`, time.Now().Add(-time.Second).UTC().Format(time.RFC3339Nano), device.ID); err != nil {
		t.Fatal(err)
	}
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 401, nil)
}

func TestWidgetEveryReadRechecksVisibilityPageAndTeamAccess(t *testing.T) {
	f := newWidgetFixture(t)
	device := f.redeem(t, f.grant(t, "member", "tracker"))
	f.definition.Blocks = append(f.definition.Blocks, PageAppBlock{ID: "group", Kind: "group", Title: "Group"})
	f.definition.Blocks[0].ParentID = "group"
	f.definition.Blocks[3].Hidden = true
	f.save(t, 1)
	raw := widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 403, nil)
	if strings.Contains(raw, "My chosen") {
		t.Fatal("denial leaked title")
	}
	f.definition.Blocks[3].Hidden = false
	f.save(t, 2)
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 200, nil)
	if _, err := f.store.db.Exec(`UPDATE workspace_pages SET archived_at=? WHERE id=?`, nowText(), f.page.ID); err != nil {
		t.Fatal(err)
	}
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 403, nil)
	if _, err := f.store.db.Exec(`UPDATE workspace_pages SET archived_at=NULL WHERE id=?`, f.page.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.store.db.Exec(`UPDATE team_members SET status='suspended' WHERE team_id=? AND user_id=?`, f.project.TeamID, f.users["member"].ID); err != nil {
		t.Fatal(err)
	}
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 403, nil)
	var list struct {
		Devices []widgetDevice `json:"devices"`
	}
	widgetRequest(t, f.clients["member"], "GET", f.url+"/api/me/widgets", "", nil, 200, &list)
	if len(list.Devices) != 1 || list.Devices[0].PageName != "" || list.Devices[0].Title != "Источник недоступен" {
		t.Fatal("removed member sees source metadata")
	}
	widgetRequest(t, f.clients["member"], "DELETE", f.url+"/api/me/widgets/"+device.ID, "", nil, 204, nil)
}

func TestWidgetPasswordChangeRevokesAllGrantsButWebLogoutDoesNot(t *testing.T) {
	f := newWidgetFixture(t)
	device := f.redeem(t, f.grant(t, "member", "tracker"))
	f.grant(t, "member", "progress")
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/auth/logout", nil, 204, nil)
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 200, nil)
	if _, err := f.store.db.Exec(`UPDATE users SET password_hash=password_hash||'changed' WHERE id=?`, f.users["member"].ID); err != nil {
		t.Fatal(err)
	}
	widgetRequest(t, http.DefaultClient, "GET", f.url+"/api/mobile/widget", device.Token, nil, 401, nil)
	var count int
	if err := f.store.db.QueryRow(`SELECT count(*) FROM widget_devices WHERE user_id=?`, f.users["member"].ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("password change retained grant", err, count)
	}
}

func TestWidgetConditionsAndPresentationMirrorBuilder(t *testing.T) {
	truth, falsity := true, false
	d := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{
		{ID: "source", Kind: "tracker", Items: []PageAppItem{{ID: "a", Label: "A"}, {ID: "b", Label: "B"}, {ID: "c", Label: "C"}, {ID: "removed", Label: "REMOVED", Hidden: true}}},
		{ID: "subject", Kind: "tracker", Title: "PRIVATE HIDDEN TITLE", Items: []PageAppItem{{ID: "first", Label: "STYLE HIDDEN"}, {ID: "second", Label: "Shown override"}}, ElementStyles: map[string]PageElementStyle{"title": {Hidden: &truth}, "item": {Hidden: &truth}, "item:second": {Hidden: &falsity}}},
	}}
	marks := map[string]bool{"source:a": true, "source:removed": true, "subject:first": true}
	for _, test := range []struct {
		metric, op string
		threshold  int
		want       bool
	}{{"checked", "eq", 1, true}, {"checked", "ne", 1, false}, {"remaining", "eq", 2, true}, {"percent", "gt", 33, true}, {"percent", "eq", 33, false}, {"percent", "gte", 34, false}, {"remaining", "lte", 2, true}, {"remaining", "lt", 2, false}} {
		c := &PageBlockVisibility{Source: "source", Metric: test.metric, Operator: test.op, Value: test.threshold}
		if got := widgetCondition(c, d, marks); got != test.want {
			t.Fatalf("condition %v got %v", test, got)
		}
	}
	one := PageBlockVisibility{Source: "source", Metric: "checked", Operator: "eq", Value: 1}
	two := one
	two.Value = 2
	if !widgetCondition(&PageBlockVisibility{Mode: "any", Conditions: []PageBlockVisibility{one, two}}, d, marks) || widgetCondition(&PageBlockVisibility{Mode: "all", Conditions: []PageBlockVisibility{one, two}}, d, marks) {
		t.Fatal("any/all mismatch")
	}
	d.Blocks[1].Visibility = &two
	if widgetBlockVisible(d.Blocks[1], d, marks) {
		t.Fatal("false condition visible")
	}
	d.Blocks[1].Visibility = &one
	p := widgetPage{definition: d, marks: marks, updatedAt: nowText()}
	b, source, ok := widgetSelected(p, "subject")
	if !ok {
		t.Fatal("true condition hidden")
	}
	out := renderWidgetSnapshot("id", p, b, source)
	if out.Title != "Пункты и отметки" || out.Total != 2 || out.Completed != 1 || len(out.Items) != 1 || out.Items[0].Label != "Shown override" {
		t.Fatal("presentation leaked hidden labels or changed builder calculation", out)
	}
	d.Blocks[1].ParentID = "missing"
	if widgetBlockVisible(d.Blocks[1], d, marks) {
		t.Fatal("missing parent visible")
	}
	d.Blocks[1].ParentID = "subject"
	if widgetBlockVisible(d.Blocks[1], d, marks) {
		t.Fatal("cyclic parent visible")
	}
	d.Blocks[0].Items = nil
	if widgetCondition(&one, d, marks) {
		t.Fatal("empty tracker condition passed")
	}
}

func TestWidgetRateLimitBoundedAndPeerValidation(t *testing.T) {
	var limiter widgetRateLimiter
	now := time.Now()
	for i := 0; i < 3; i++ {
		if !limiter.allow("one", 3, now) {
			t.Fatal("early throttle")
		}
	}
	if limiter.allow("one", 3, now) {
		t.Fatal("missing throttle")
	}
	if !limiter.allow("one", 3, now.Add(time.Minute)) {
		t.Fatal("window did not reset")
	}
	limiter = widgetRateLimiter{}
	for i := 0; i < 4096; i++ {
		if !limiter.allow(fmt.Sprint(i), 1, now) {
			t.Fatal("unexpected map limit")
		}
	}
	if limiter.allow("overflow", 1, now) || len(limiter.entries) != 4096 {
		t.Fatal("unbounded peer map")
	}
	r := httptest.NewRequest("GET", "http://example.test", nil)
	r.RemoteAddr = "203.0.113.2:443"
	r.Header.Set("X-Real-IP", "198.51.100.1")
	if widgetPeer(r) != "203.0.113.2" {
		t.Fatal("untrusted forwarded peer")
	}
	r.RemoteAddr = "127.0.0.1:8522"
	if widgetPeer(r) != "198.51.100.1" {
		t.Fatal("local proxy lost peer")
	}
	r.Header.Set("X-Real-IP", "1.1.1.1,2.2.2.2")
	if widgetPeer(r) != "127.0.0.1" {
		t.Fatal("accepted peer chain")
	}
	server := &Server{}
	for i := 0; i < 31; i++ {
		req := httptest.NewRequest("POST", "/api/mobile/widgets/redeem", strings.NewReader(`{"code":"invalid"}`))
		rec := httptest.NewRecorder()
		widgetNoStore(http.HandlerFunc(server.handleRedeemWidgetDevice)).ServeHTTP(rec, req)
		want := 400
		if i == 30 {
			want = 429
		}
		if rec.Code != want || i == 30 && rec.Header().Get("Retry-After") != "60" {
			t.Fatal("rate limit transport contract", i, rec.Code, rec.Header())
		}
	}
}

func TestWidgetGrantLimitNameValidationAndCrossOrigin(t *testing.T) {
	f := newWidgetFixture(t)
	for _, name := range []string{"", strings.Repeat("я", 81)} {
		requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/me/widgets", f.project.ID, map[string]any{"pageId": f.page.ID, "blockId": "tracker", "name": name}, 400, nil)
	}
	for _, block := range []string{"missing", "private"} {
		requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/me/widgets", f.project.ID, map[string]any{"pageId": f.page.ID, "blockId": block, "name": "Phone"}, 403, nil)
	}
	data := fmt.Sprintf(`{"pageId":%q,"blockId":"tracker","name":"Unwanted"}`, f.page.ID)
	req, err := http.NewRequest("POST", f.url+"/api/me/widgets", strings.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-Workspace-ID", f.project.ID)
	req.Header.Set("Origin", "https://attacker.invalid")
	req.Header.Set("Content-Type", "application/json")
	resp, err := f.clients["member"].Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 403 {
		t.Fatal("cross-origin grant allowed")
	}
	for i := 0; i < widgetDeviceLimit; i++ {
		f.grant(t, "member", "tracker")
	}
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/me/widgets", f.project.ID, map[string]any{"pageId": f.page.ID, "blockId": "tracker", "name": "Extra"}, 409, nil)
	if _, err = f.store.db.Exec(`UPDATE widget_devices SET pairing_expires_at=? WHERE user_id=?`, time.Now().Add(-time.Minute).UTC().Format(time.RFC3339Nano), f.users["member"].ID); err != nil {
		t.Fatal(err)
	}
	f.grant(t, "member", "tracker")
	var count int
	if err = f.store.db.QueryRow(`SELECT count(*) FROM widget_devices WHERE user_id=?`, f.users["member"].ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("expired pairing retained/counts against limit", count, err)
	}
}
