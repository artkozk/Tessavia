package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func uploadPersonalFile(t *testing.T, client *http.Client, url, key, parent, name string, data []byte, status int) NoteAttachment {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	_ = form.WriteField("requestKey", key)
	if parent != "" {
		_ = form.WriteField("noteRequestKey", parent)
	}
	file, err := form.CreateFormFile("file", name)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = file.Write(data)
	_ = form.Close()
	request, _ := http.NewRequest("POST", url, &body)
	request.Header.Set("Content-Type", form.FormDataContentType())
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	if response.StatusCode != status {
		t.Fatalf("upload status=%d want=%d: %s", response.StatusCode, status, raw)
	}
	var item NoteAttachment
	if status < 300 && json.Unmarshal(raw, &item) != nil {
		t.Fatal("bad attachment JSON")
	}
	return item
}

func TestNoteMediaPrivateRetryArchiveAndHistory(t *testing.T) {
	root := t.TempDir()
	store, err := OpenStore(filepath.Join(root, "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: filepath.Join(root, "uploads")}))
	defer server.Close()
	owner, other := testClient(t), testClient(t)
	register(t, owner, server.URL, "owner@example.test", "media_owner")
	register(t, other, server.URL, "other@example.test", "media_other")
	base := server.URL + "/api/personal"
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/notes", map[string]any{"title": "До правки", "body": "Первый текст", "tags": []string{"Личное"}}, 201, &note)
	initialVersion := note.UpdatedAt
	var history struct {
		Items      []NoteVersion `json:"items"`
		NextBefore int64         `json:"nextBefore"`
	}
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID+"/versions", nil, 200, &history)
	if len(history.Items) != 1 {
		t.Fatalf("initial history: %#v", history)
	}
	first := history.Items[0].ID
	requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": "После правки", "body": "Второй текст", "tags": []string{"Изменённое"}, "expectedUpdatedAt": note.UpdatedAt}, 200, &note)
	secondVersion := note.UpdatedAt
	var picture bytes.Buffer
	_ = png.Encode(&picture, image.NewNRGBA(image.Rect(0, 0, 2, 2)))
	file := uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "private-file-key-0001", "", "Фото.png", picture.Bytes(), 201)
	repeat := uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "private-file-key-0001", "", "Фото.png", picture.Bytes(), 200)
	if file.ID != repeat.ID || !file.Preview {
		t.Fatalf("duplicate or unpreviewable image: %#v %#v", file, repeat)
	}
	uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "private-file-key-0001", "", "Иное.png", picture.Bytes(), 409)
	uploadPersonalFile(t, other, base+"/notes/"+note.ID+"/attachments", "private-file-key-0002", "", "Фото.png", picture.Bytes(), 404)
	uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "private-file-key-0003", "", "script.html", []byte("<html><script>alert(1)</script></html>"), 400)
	var files []NoteAttachment
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID+"/attachments", nil, 200, &files)
	if len(files) != 1 {
		t.Fatal("duplicate attachment")
	}
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID, nil, 200, &note)
	if note.UpdatedAt != secondVersion {
		t.Fatal("upload changed editor version")
	}
	for _, path := range []string{"/notes/" + note.ID, "/notes/" + note.ID + "/attachments", "/notes/" + note.ID + "/versions", "/notes/" + note.ID + "/versions/" + strconv.FormatInt(first, 10), "/note-attachments/" + file.ID + "/file"} {
		requestJSON(t, other, "GET", base+path, nil, 404, nil)
	}
	response, err := owner.Get(base + "/note-attachments/" + file.ID + "/file")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if !bytes.Equal(raw, picture.Bytes()) || response.Header.Get("Content-Type") != "image/png" || !strings.Contains(response.Header.Get("Cache-Control"), "no-store") {
		t.Fatal("private preview headers/body")
	}
	response, err = owner.Get(base + "/note-attachments/" + file.ID + "/file?download=1")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if !strings.HasPrefix(response.Header.Get("Content-Disposition"), "attachment;") {
		t.Fatal("download disposition")
	}
	requestJSON(t, other, "PATCH", base+"/note-attachments/"+file.ID, map[string]any{"removed": true, "expectedUpdatedAt": file.UpdatedAt}, 404, nil)
	requestJSON(t, owner, "PATCH", base+"/note-attachments/"+file.ID, map[string]any{"removed": true, "expectedUpdatedAt": file.UpdatedAt}, 200, &file)
	if file.RemovedAt == nil {
		t.Fatal("file not removed")
	}
	requestJSON(t, owner, "PATCH", base+"/note-attachments/"+file.ID, map[string]any{"removed": false, "expectedUpdatedAt": file.UpdatedAt}, 200, &file)
	if file.RemovedAt != nil {
		t.Fatal("file not restored")
	}
	restoreURL := base + "/notes/" + note.ID + "/versions/" + strconv.FormatInt(first, 10) + "/restore"
	requestJSON(t, other, "POST", restoreURL, map[string]any{"expectedUpdatedAt": note.UpdatedAt}, 404, nil)
	requestJSON(t, owner, "POST", restoreURL, map[string]any{"expectedUpdatedAt": initialVersion}, 409, nil)
	requestJSON(t, owner, "POST", restoreURL, map[string]any{"expectedUpdatedAt": note.UpdatedAt}, 200, &note)
	if note.Title != "До правки" || note.Body != "Первый текст" || len(note.Tags) != 1 || note.Tags[0] != "Личное" {
		t.Fatalf("restore: %#v", note)
	}
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID+"/versions", nil, 200, &history)
	if len(history.Items) != 3 || history.Items[0].Action != "restored" || history.Items[1].Title != "После правки" {
		t.Fatalf("history lost: %#v", history)
	}
	var plan PersonalPlan
	requestJSON(t, owner, "POST", base+"/plans", map[string]any{"title": "Связанный план"}, 201, &plan)
	requestJSON(t, owner, "POST", base+"/links", map[string]any{"sourceType": "note", "sourceId": note.ID, "targetType": "plan", "targetId": plan.ID, "relationType": "related"}, 201, nil)
	requestJSON(t, owner, "DELETE", base+"/notes/"+note.ID, map[string]any{"expectedUpdatedAt": secondVersion}, 409, nil)
	requestJSON(t, owner, "DELETE", base+"/notes/"+note.ID, map[string]any{"expectedUpdatedAt": note.UpdatedAt}, 204, nil)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", base+"/overview", nil, 200, &overview)
	if len(overview.Notes) != 0 || len(overview.Links) != 0 {
		t.Fatal("archived note visible in overview")
	}
	var archive struct {
		Items []PersonalNote `json:"items"`
		Total int            `json:"total"`
	}
	requestJSON(t, owner, "GET", base+"/notes/archive", nil, 200, &archive)
	if archive.Total != 1 || archive.Items[0].Body != "" {
		t.Fatalf("archive metadata: %#v", archive)
	}
	requestJSON(t, other, "GET", base+"/notes/archive", nil, 200, &archive)
	if archive.Total != 0 {
		t.Fatal("archive privacy")
	}
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID, nil, 200, &note)
	requestJSON(t, other, "POST", base+"/notes/"+note.ID+"/restore", map[string]any{"expectedUpdatedAt": note.UpdatedAt}, 404, nil)
	uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "private-file-key-0004", "", "blocked.txt", []byte("hello"), 404)
	requestJSON(t, owner, "POST", base+"/notes/"+note.ID+"/restore", map[string]any{"expectedUpdatedAt": note.UpdatedAt}, 200, &note)
	requestJSON(t, owner, "GET", base+"/overview", nil, 200, &overview)
	if len(overview.Notes) != 1 || len(overview.Links) != 1 {
		t.Fatal("archive restore lost links")
	}
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID+"/attachments", nil, 200, &files)
	if len(files) != 1 || files[0].ID != file.ID {
		t.Fatal("archive restore lost file")
	}
	for i := 0; i < 32; i++ {
		requestJSON(t, owner, "PATCH", base+"/notes/"+note.ID, map[string]any{"title": fmt.Sprintf("Правка %d", i), "body": "Текст", "expectedUpdatedAt": note.UpdatedAt}, 200, &note)
	}
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID+"/versions", nil, 200, &history)
	if len(history.Items) != 30 || history.NextBefore == 0 || history.Items[0].Note != nil {
		t.Fatal("history must paginate metadata")
	}
	newest := history.Items[0].ID
	requestJSON(t, owner, "GET", base+"/notes/"+note.ID+"/versions?before="+strconv.FormatInt(history.NextBefore, 10), nil, 200, &history)
	if len(history.Items) == 0 || history.Items[0].ID >= newest {
		t.Fatal("history older page")
	}
}

func TestNewNoteFileDependencyAndDailyArchiveCollision(t *testing.T) {
	root := t.TempDir()
	store, err := OpenStore(filepath.Join(root, "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: filepath.Join(root, "uploads")}))
	defer server.Close()
	owner := testClient(t)
	register(t, owner, server.URL, "owner@example.test", "dependency_owner")
	base := server.URL + "/api/personal"
	parent := "parent-note-key-0001"
	uploadPersonalFile(t, owner, base+"/note-attachments", "parent-file-key-0001", parent, "note.txt", []byte("file"), 425)
	var note PersonalNote
	requestJSON(t, owner, "POST", base+"/notes", map[string]any{"title": "Из очереди", "requestKey": parent}, 201, &note)
	file := uploadPersonalFile(t, owner, base+"/note-attachments", "parent-file-key-0001", parent, "note.txt", []byte("file"), 201)
	if file.NoteID != note.ID {
		t.Fatal("file attached to wrong parent")
	}
	uploadPersonalFile(t, owner, base+"/note-attachments", "parent-file-key-0001", parent, "note.txt", []byte("file"), 200)
	// Match the public upload contract at the application boundary, independently
	// of the nginx transport allowance for multipart framing.
	uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "large-file-key-0001", "", "large.txt", bytes.Repeat([]byte("x"), maxAttachmentBytes), 201)
	uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "large-file-key-0002", "", "too-large.txt", bytes.Repeat([]byte("x"), maxAttachmentBytes+1), 413)
	uploadPersonalFile(t, owner, base+"/notes/"+note.ID+"/attachments", "empty-file-key-0001", "", "empty.txt", nil, 413)
	requestJSON(t, owner, "POST", base+"/notes/daily", map[string]any{"date": "2026-09-04"}, 201, &note)
	id := note.ID
	requestJSON(t, owner, "DELETE", base+"/notes/"+id, nil, 204, nil)
	requestJSON(t, owner, "GET", base+"/notes/"+id, nil, 200, &note)
	requestJSON(t, owner, "POST", base+"/notes/daily", map[string]any{"date": "2026-09-04"}, 201, nil)
	requestJSON(t, owner, "POST", base+"/notes/"+id+"/restore", map[string]any{"expectedUpdatedAt": note.UpdatedAt}, 409, nil)
	requestJSON(t, owner, "POST", base+"/notes/"+id+"/restore", map[string]any{"expectedUpdatedAt": note.UpdatedAt, "asOrdinary": true}, 200, &note)
	if note.ID != id || note.DailyDate != "" || note.ArchivedAt != nil {
		t.Fatal("ordinary restore changed ID or kept daily conflict")
	}
}
