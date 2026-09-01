package app

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
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

func TestProfileAvatarLifecycleAndVisibility(t *testing.T) {
	temp := t.TempDir()
	store, err := OpenStore(filepath.Join(temp, "avatar.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	uploadPath := filepath.Join(temp, "uploads")
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: uploadPath}))
	defer server.Close()

	ownerClient := testClient(t)
	partnerClient := testClient(t)
	outsiderClient := testClient(t)
	owner := register(t, ownerClient, server.URL, "avatar-owner@example.test", "avatar_owner")
	register(t, partnerClient, server.URL, "avatar-partner@example.test", "avatar_partner")
	outsider := register(t, outsiderClient, server.URL, "avatar-outsider@example.test", "avatar_outsider")
	if _, err := store.db.Exec(`DELETE FROM workspace_members WHERE user_id = ? AND workspace_id NOT LIKE 'personal-%'`, outsider.ID); err != nil {
		t.Fatalf("separate outsider workspace: %v", err)
	}
	if _, err := store.db.Exec(`DELETE FROM team_members WHERE user_id = ?`, outsider.ID); err != nil {
		t.Fatalf("separate outsider team: %v", err)
	}

	postAvatar(t, ownerClient, server.URL, "fake.png", []byte("not an image"), http.StatusBadRequest, nil)
	firstImage := encodedAvatarPNG(t, 96, 80)
	var uploaded User
	postAvatar(t, ownerClient, server.URL, "portrait.png", firstImage, http.StatusOK, &uploaded)
	if uploaded.ID != owner.ID || !strings.Contains(uploaded.AvatarURL, "/api/users/") {
		t.Fatalf("uploaded avatar user = %#v", uploaded)
	}

	assertAvatarResponse(t, ownerClient, server.URL+uploaded.AvatarURL, http.StatusOK, "image/png", firstImage)
	assertAvatarResponse(t, partnerClient, server.URL+uploaded.AvatarURL, http.StatusOK, "image/png", firstImage)
	assertAvatarResponse(t, testClient(t), server.URL+uploaded.AvatarURL, http.StatusUnauthorized, "", nil)
	assertAvatarResponse(t, outsiderClient, server.URL+uploaded.AvatarURL, http.StatusForbidden, "", nil)
	requestJSON(t, outsiderClient, http.MethodGet, server.URL+"/api/users/"+strconvInt64(owner.ID)+"/profile", nil, http.StatusForbidden, nil)

	var outsiderUsers []User
	requestJSON(t, outsiderClient, http.MethodGet, server.URL+"/api/users", nil, http.StatusOK, &outsiderUsers)
	if len(outsiderUsers) != 1 || outsiderUsers[0].ID != outsider.ID {
		t.Fatalf("outsider user directory leaked shared profiles: %#v", outsiderUsers)
	}

	secondImage := encodedAvatarJPEG(t, 120, 120)
	var replaced User
	postAvatar(t, ownerClient, server.URL, "portrait.jpg", secondImage, http.StatusOK, &replaced)
	if replaced.AvatarURL == "" || replaced.AvatarURL == uploaded.AvatarURL {
		t.Fatalf("avatar cache version was not changed: before=%q after=%q", uploaded.AvatarURL, replaced.AvatarURL)
	}
	files, err := filepath.Glob(filepath.Join(uploadPath, "avatars", "*"))
	if err != nil || len(files) != 1 {
		t.Fatalf("avatar replacement left files=%#v err=%v", files, err)
	}
	assertAvatarResponse(t, partnerClient, server.URL+replaced.AvatarURL, http.StatusOK, "image/jpeg", secondImage)

	requestJSON(t, ownerClient, http.MethodDelete, server.URL+"/api/me/avatar", nil, http.StatusNoContent, nil)
	var me User
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/me", nil, http.StatusOK, &me)
	if me.AvatarURL != "" {
		t.Fatalf("deleted avatar URL = %q", me.AvatarURL)
	}
	assertAvatarResponse(t, ownerClient, server.URL+"/api/users/"+strconvInt64(owner.ID)+"/avatar", http.StatusNotFound, "", nil)
	files, _ = filepath.Glob(filepath.Join(uploadPath, "avatars", "*"))
	if len(files) != 0 {
		t.Fatalf("deleted avatar files remain: %#v", files)
	}
}

func encodedAvatarPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	imageValue := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			imageValue.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 90, A: 255})
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, imageValue); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buffer.Bytes()
}

func encodedAvatarJPEG(t *testing.T, width, height int) []byte {
	t.Helper()
	imageValue := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			imageValue.Set(x, y, color.RGBA{R: 36, G: uint8(x), B: uint8(y), A: 255})
		}
	}
	var buffer bytes.Buffer
	if err := jpeg.Encode(&buffer, imageValue, &jpeg.Options{Quality: 88}); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buffer.Bytes()
}

func postAvatar(t *testing.T, client *http.Client, baseURL, name string, content []byte, wantStatus int, target any) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		t.Fatalf("create avatar part: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write avatar part: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close avatar form: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, baseURL+"/api/me/avatar", &body)
	if err != nil {
		t.Fatalf("create avatar request: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("post avatar: %v", err)
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode != wantStatus {
		t.Fatalf("avatar status=%d want=%d body=%s", response.StatusCode, wantStatus, responseBody)
	}
	if target != nil && len(responseBody) > 0 {
		decodeJSONBytes(t, responseBody, target)
	}
}

func assertAvatarResponse(t *testing.T, client *http.Client, url string, wantStatus int, wantType string, wantBody []byte) {
	t.Helper()
	response, err := client.Get(url)
	if err != nil {
		t.Fatalf("get avatar: %v", err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != wantStatus {
		t.Fatalf("avatar GET status=%d want=%d body=%s", response.StatusCode, wantStatus, body)
	}
	if wantType != "" && response.Header.Get("Content-Type") != wantType {
		t.Fatalf("avatar content type=%q want=%q", response.Header.Get("Content-Type"), wantType)
	}
	if wantBody != nil && !bytes.Equal(body, wantBody) {
		t.Fatalf("avatar response body changed: got=%d want=%d bytes", len(body), len(wantBody))
	}
}

func decodeJSONBytes(t *testing.T, value []byte, target any) {
	t.Helper()
	if err := json.Unmarshal(value, target); err != nil {
		t.Fatalf("decode JSON: %v body=%s", err, value)
	}
}

func strconvInt64(value int64) string {
	return strconv.FormatInt(value, 10)
}
