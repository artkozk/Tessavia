package app

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newMediaFixture(t *testing.T) lifecycleFixture {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "media.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: t.TempDir()}))
	t.Cleanup(server.Close)
	f := lifecycleFixture{store: store, url: server.URL, clients: map[string]*http.Client{}, users: map[string]User{}}
	for _, role := range []string{"owner", "admin", "member", "outsider"} {
		f.clients[role] = testClient(t)
		f.users[role] = registerVerifiedWithoutFixture(t, f.clients[role], f.url, role+"@media.test", "media_"+role)
	}
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/teams", map[string]any{"name": "Media team"}, 201, &f.project)
	for _, role := range []string{"admin", "member"} {
		requestJSON(t, f.clients["owner"], "POST", f.url+"/api/teams/"+f.project.TeamID+"/members", map[string]any{"username": "media_" + role, "role": role, "projectIds": []string{f.project.ID}}, 200, nil)
	}
	return f
}
func mediaPicture(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{18, 106, 85, 255})
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}
func uploadPageFile(t *testing.T, client *http.Client, url, workspace, key, name string, data []byte, status int) PageMediaAttachment {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("requestKey", key)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(data)
	_ = writer.Close()
	req, err := http.NewRequest("POST", url, &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("X-Workspace-ID", workspace)
	response, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	if response.StatusCode != status {
		t.Fatalf("upload %s: %d want %d: %s", name, response.StatusCode, status, raw)
	}
	var result PageMediaAttachment
	if status < 300 {
		if err = json.Unmarshal(raw, &result); err != nil {
			t.Fatal(err)
		}
	}
	return result
}
func getMediaBytes(t *testing.T, client *http.Client, url string, status int) (http.Header, []byte) {
	t.Helper()
	response, err := client.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	if response.StatusCode != status {
		t.Fatalf("GET: %d want %d: %s", response.StatusCode, status, raw)
	}
	return response.Header, raw
}

func TestPageMediaIsolationRecoveryAndPortableKits(t *testing.T) {
	f := newMediaFixture(t)
	var page WorkspacePage
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, f.project.ID, body, status, out)
	}
	call("owner", "POST", "/api/workspace/pages", map[string]any{"name": "Logo sketches"}, 201, &page)
	appPath := "/api/workspace/pages/" + page.ID + "/app"
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "sketches", Kind: "media", Title: "Logo sketches", Text: "Compare variants", Width: 12}}}
	save := func(revision int) {
		t.Helper()
		call("owner", "PUT", appPath, map[string]any{"expectedRevision": revision, "definition": definition}, 200, nil)
	}
	save(0)
	base := appPath + "/media/sketches"
	pngBytes := mediaPicture(t)
	file := uploadPageFile(t, f.clients["member"], f.url+base, f.project.ID, "media-create-stable-0001", "Набросок.png", pngBytes, 201)
	replay := uploadPageFile(t, f.clients["member"], f.url+base, f.project.ID, "media-create-stable-0001", "Набросок.png", pngBytes, 200)
	if file.ID != replay.ID || file.Preview != "image" || !file.CanManage {
		t.Fatal(file, replay)
	}
	uploadPageFile(t, f.clients["member"], f.url+base, f.project.ID, "media-create-stable-0001", "Changed.png", pngBytes, 409)
	uploadPageFile(t, f.clients["outsider"], f.url+base, f.project.ID, "media-create-stable-0002", "private.png", pngBytes, 403)
	uploadPageFile(t, f.clients["owner"], f.url+base, f.project.ID, "media-create-stable-0003", "fake.png", []byte("<html><script>alert(1)</script></html>"), 400)
	uploadPageFile(t, f.clients["owner"], f.url+base, f.project.ID, "media-create-stable-0004", "empty.txt", nil, 413)
	uploadPageFile(t, f.clients["owner"], f.url+base, f.project.ID, "media-create-stable-0005", "too-large.txt", bytes.Repeat([]byte("x"), maxAttachmentBytes+1), 413)
	var items []PageMediaAttachment
	call("owner", "GET", base, nil, 200, &items)
	if len(items) != 1 {
		t.Fatal(items)
	}
	filePath := f.url + base + "/" + file.ID + "/file?workspaceId=" + f.project.ID
	headers, raw := getMediaBytes(t, f.clients["member"], filePath, 200)
	if !bytes.Equal(raw, pngBytes) || headers.Get("Content-Type") != "image/png" || !strings.HasPrefix(headers.Get("Content-Disposition"), "inline") || headers.Get("Cache-Control") != "private, no-store" || headers.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("unsafe preview", headers)
	}
	headers, _ = getMediaBytes(t, f.clients["owner"], filePath+"&download=1", 200)
	if !strings.HasPrefix(headers.Get("Content-Disposition"), "attachment") {
		t.Fatal(headers)
	}
	getMediaBytes(t, f.clients["outsider"], filePath, 404)
	getMediaBytes(t, testClient(t), filePath, 401)
	// A valid but different team must never supply bytes from this page.
	var other Workspace
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Other media workspace"}, 201, &other)
	getMediaBytes(t, f.clients["owner"], f.url+base+"/"+file.ID+"/file?workspaceId="+other.ID, 404)
	requestWorkspaceJSON(t, f.clients["owner"], "GET", f.url+base, other.ID, nil, 404, nil)
	// Preview ranges support video seeking without public/static files.
	req, _ := http.NewRequest("GET", filePath, nil)
	req.Header.Set("Range", "bytes=0-7")
	response, err := f.clients["owner"].Do(req)
	if err != nil {
		t.Fatal(err)
	}
	rangeBytes, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 206 || !bytes.Equal(rangeBytes, pngBytes[:8]) {
		t.Fatal("range", response.StatusCode)
	}
	// Archive is reversible and optimistic; only uploader/admin can change it.
	call("member", "PATCH", base+"/"+file.ID, map[string]any{"removed": "true", "expectedUpdatedAt": file.UpdatedAt}, 400, nil)
	call("member", "PATCH", base+"/"+file.ID, map[string]any{"removed": true, "expectedUpdatedAt": "stale"}, 409, nil)
	call("member", "PATCH", base+"/"+file.ID, map[string]any{"removed": true, "expectedUpdatedAt": file.UpdatedAt}, 200, &file)
	if file.RemovedAt == nil {
		t.Fatal("not archived")
	}
	// A second ordinary member can read the team but not archived private recovery metadata.
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/teams/"+f.project.TeamID+"/members", map[string]any{"username": "media_outsider", "role": "member", "projectIds": []string{f.project.ID}}, 200, nil)
	call("outsider", "GET", base, nil, 200, &items)
	if len(items) != 0 {
		t.Fatal("recovery metadata leaked", items)
	}
	call("outsider", "PATCH", base+"/"+file.ID, map[string]any{"removed": false, "expectedUpdatedAt": file.UpdatedAt}, 403, nil)
	getMediaBytes(t, f.clients["outsider"], filePath, 404)
	call("admin", "PATCH", base+"/"+file.ID, map[string]any{"removed": false, "expectedUpdatedAt": file.UpdatedAt}, 200, &file)
	getMediaBytes(t, f.clients["outsider"], filePath, 200)
	definition.Blocks[0].Hidden = true
	save(1)
	call("owner", "GET", base, nil, 404, nil)
	getMediaBytes(t, f.clients["owner"], filePath, 404)
	definition.Blocks[0].Hidden = false
	save(2)
	call("member", "GET", base, nil, 200, &items)
	if len(items) != 1 || items[0].ID != file.ID {
		t.Fatal("hidden restore lost media", items)
	}
	// Sharing a kit exposes structure only. The new page starts empty.
	var kit PageAppTemplate
	call("owner", "POST", appPath+"/template", map[string]any{"name": "Sketch kit", "visibility": "public", "expectedRevision": 3}, 201, &kit)
	kitRaw, _ := json.Marshal(kit)
	if bytes.Contains(kitRaw, []byte(file.ID)) || bytes.Contains(kitRaw, []byte("Набросок.png")) {
		t.Fatal("kit leaked media")
	}
	var installed WorkspacePage
	call("owner", "POST", "/api/page-app/templates/"+kit.ID+"/install", map[string]any{"name": "Fresh sketches"}, 201, &installed)
	call("owner", "GET", "/api/workspace/pages/"+installed.ID+"/app/media/sketches", nil, 200, &items)
	if len(items) != 0 {
		t.Fatal("kit copied private media")
	}
	// Revoking membership also revokes a previously copied image URL.
	if _, err = f.store.db.Exec(`UPDATE workspace_members SET status='suspended' WHERE workspace_id=? AND user_id=?`, f.project.ID, f.users["member"].ID); err != nil {
		t.Fatal(err)
	}
	getMediaBytes(t, f.clients["member"], filePath, 404)
}

func TestRecordAttachmentInlinePreviewStaysWorkspaceScoped(t *testing.T) {
	f := newMediaFixture(t)
	var record Record
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/records", f.project.ID, map[string]any{"type": "document", "title": "Sketch brief", "ownerId": f.users["owner"].ID}, 201, &record)
	file := uploadPageFile(t, f.clients["owner"], f.url+"/api/records/"+record.ID+"/attachments", f.project.ID, "unused-record-key", "Sketch.png", mediaPicture(t), 201)
	if file.ID == "" {
		t.Fatal("no file")
	}
	path := f.url + "/api/attachments/" + file.ID + "/download?preview=1&workspaceId=" + f.project.ID
	headers, _ := getMediaBytes(t, f.clients["member"], path, 200)
	if headers.Get("Content-Type") != "image/png" || !strings.HasPrefix(headers.Get("Content-Disposition"), "inline") {
		t.Fatal(headers)
	}
	getMediaBytes(t, f.clients["outsider"], path, 404)
	headers, _ = getMediaBytes(t, f.clients["member"], strings.Replace(path, "preview=1&", "", 1), 200)
	if headers.Get("Content-Type") != "application/octet-stream" || !strings.HasPrefix(headers.Get("Content-Disposition"), "attachment") {
		t.Fatal(headers)
	}
}
