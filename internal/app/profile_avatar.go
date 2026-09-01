package app

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	maxAvatarBytes     = 5 << 20
	minAvatarDimension = 64
	maxAvatarDimension = 6000
)

func avatarURL(userID int64, storedName, updatedAt string) string {
	if strings.TrimSpace(storedName) == "" {
		return ""
	}
	return fmt.Sprintf("/api/users/%d/avatar?v=%s", userID, url.QueryEscape(updatedAt))
}

func setUserAvatar(user *User, storedName, updatedAt string) {
	user.AvatarURL = avatarURL(user.ID, storedName, updatedAt)
}

func (s *Server) canViewUserProfile(r *http.Request, targetUserID int64) (bool, error) {
	viewer := currentUser(r)
	if viewer.ID == targetUserID {
		return true, nil
	}
	var allowed int
	err := s.store.db.QueryRowContext(r.Context(), `
		SELECT 1
		FROM workspace_members viewer
		JOIN workspace_members target ON target.workspace_id = viewer.workspace_id
		WHERE viewer.user_id = ? AND viewer.status = 'active'
			AND target.user_id = ? AND target.status = 'active'
		LIMIT 1`, viewer.ID, targetUserID).Scan(&allowed)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func avatarImageConfig(contentType string, data []byte) (int, int, error) {
	var width, height int
	switch contentType {
	case "image/jpeg":
		config, err := jpeg.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return 0, 0, err
		}
		width, height = config.Width, config.Height
	case "image/png":
		config, err := png.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return 0, 0, err
		}
		width, height = config.Width, config.Height
	default:
		return 0, 0, errors.New("unsupported avatar format")
	}
	if width < minAvatarDimension || height < minAvatarDimension || width > maxAvatarDimension || height > maxAvatarDimension {
		return 0, 0, errors.New("avatar dimensions out of range")
	}
	return width, height, nil
}

func (s *Server) handleUploadAvatar(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes+1<<20)
	if err := r.ParseMultipartForm(maxAvatarBytes); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "Фото должно быть не больше 5 МБ")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Выберите фото")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxAvatarBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Не удалось прочитать фото")
		return
	}
	if len(data) == 0 || len(data) > maxAvatarBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "Фото должно быть не больше 5 МБ")
		return
	}
	contentType := http.DetectContentType(data)
	if _, _, err := avatarImageConfig(contentType, data); err != nil {
		writeError(w, http.StatusBadRequest, "Используйте корректное JPEG или PNG от 64 до 6000 пикселей")
		return
	}

	user := currentUser(r)
	avatarDir := filepath.Join(s.config.UploadPath, "avatars")
	if err := os.MkdirAll(avatarDir, 0o750); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось подготовить хранилище фото")
		return
	}
	id, _ := newID()
	extension := ".jpg"
	if contentType == "image/png" {
		extension = ".png"
	}
	storedName := filepath.ToSlash(filepath.Join("avatars", strconv.FormatInt(user.ID, 10)+"-"+id+extension))
	finalPath := filepath.Join(s.config.UploadPath, filepath.FromSlash(storedName))
	tempPath := finalPath + ".tmp"
	if err := os.WriteFile(tempPath, data, 0o640); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить фото")
		return
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		_ = os.Remove(tempPath)
		writeError(w, http.StatusInternalServerError, "Не удалось завершить сохранение фото")
		return
	}

	var oldStoredName string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT avatar_stored_name FROM users WHERE id = ?`, user.ID).Scan(&oldStoredName); err != nil {
		_ = os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить профиль")
		return
	}
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		_ = os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось начать обновление фото")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE users SET avatar_stored_name = ?, avatar_content_type = ?, avatar_size_bytes = ?, avatar_updated_at = ?, updated_at = ? WHERE id = ?`, storedName, contentType, len(data), now, now, user.ID); err != nil {
		_ = os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось обновить фото")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "user", strconv.FormatInt(user.ID, 10), "avatar_updated", "", map[string]any{"contentType": contentType, "sizeBytes": len(data)}); err != nil {
		_ = os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось записать изменение фото")
		return
	}
	if err := tx.Commit(); err != nil {
		_ = os.Remove(finalPath)
		writeError(w, http.StatusInternalServerError, "Не удалось завершить обновление фото")
		return
	}
	if oldStoredName != "" && oldStoredName != storedName {
		_ = os.Remove(filepath.Join(s.config.UploadPath, filepath.FromSlash(oldStoredName)))
	}
	setUserAvatar(&user, storedName, now)
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleDeleteAvatar(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	var storedName string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT avatar_stored_name FROM users WHERE id = ?`, user.ID).Scan(&storedName); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить профиль")
		return
	}
	if storedName == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать удаление фото")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE users SET avatar_stored_name = '', avatar_content_type = '', avatar_size_bytes = 0, avatar_updated_at = '', updated_at = ? WHERE id = ?`, nowText(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось удалить фото")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, "user", strconv.FormatInt(user.ID, 10), "avatar_removed", "", map[string]any{}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать удаление фото")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить удаление фото")
		return
	}
	_ = os.Remove(filepath.Join(s.config.UploadPath, filepath.FromSlash(storedName)))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAvatar(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный участник")
		return
	}
	allowed, err := s.canViewUserProfile(r, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить доступ к фото")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "Профиль доступен только участникам общего пространства")
		return
	}
	var storedName, contentType, updatedAt string
	var size int64
	err = s.store.db.QueryRowContext(r.Context(), `SELECT avatar_stored_name, avatar_content_type, avatar_size_bytes, avatar_updated_at FROM users WHERE id = ?`, userID).
		Scan(&storedName, &contentType, &size, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) || storedName == "" {
		writeError(w, http.StatusNotFound, "Фото не установлено")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить фото")
		return
	}
	etag := `"` + updatedAt + `"`
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	file, err := os.Open(filepath.Join(s.config.UploadPath, filepath.FromSlash(storedName)))
	if err != nil {
		writeError(w, http.StatusNotFound, "Фото отсутствует в хранилище")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("Content-Disposition", "inline")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("ETag", etag)
	_, _ = io.Copy(w, file)
}
