package app

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type registrationChallengeResponse struct {
	ChallengeID       string `json:"challengeId"`
	ExpiresAt         string `json:"expiresAt"`
	TestingCode       string `json:"testingCode,omitempty"`
	InvitationPending bool   `json:"invitationPending,omitempty"`
}

func timestampExpired(value string) bool {
	expiresAt, err := time.Parse(time.RFC3339Nano, value)
	return err != nil || !expiresAt.After(time.Now().UTC())
}

func registrationCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func (s *Server) startRegistration(w http.ResponseWriter, r *http.Request) {
	var input registerRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Username = strings.TrimSpace(input.Username)
	if !strings.Contains(input.Email, "@") || len(input.Email) > 254 {
		writeError(w, http.StatusBadRequest, "Укажите корректную почту")
		return
	}
	if !usernamePattern.MatchString(input.Username) {
		writeError(w, http.StatusBadRequest, "Логин: 3-32 символа, латинские буквы, цифры и _")
		return
	}
	if len(input.Password) < 8 || len(input.Password) > 128 {
		writeError(w, http.StatusBadRequest, "Пароль должен содержать от 8 до 128 символов")
		return
	}
	input.InviteToken = strings.TrimSpace(input.InviteToken)
	invitationID := ""
	if input.InviteToken != "" {
		var expiresAt string
		var maxUses, useCount int
		err := s.store.db.QueryRowContext(r.Context(), `SELECT id, expires_at, max_uses, use_count FROM workspace_invitations WHERE token_hash = ? AND revoked_at IS NULL`, hashToken(input.InviteToken)).
			Scan(&invitationID, &expiresAt, &maxUses, &useCount)
		if errors.Is(err, sql.ErrNoRows) || err == nil && (timestampExpired(expiresAt) || useCount >= maxUses) {
			writeError(w, http.StatusGone, "Ссылка приглашения недействительна или уже использована")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось проверить приглашение")
			return
		}
	}
	if len(s.config.AllowedUsernames) > 0 {
		if _, ok := s.config.AllowedUsernames[strings.ToLower(input.Username)]; !ok && invitationID == "" {
			writeError(w, http.StatusForbidden, "Этот логин не входит в закрытую проверку")
			return
		}
	}
	if s.config.CookieSecure && !s.config.RegistrationTestMode && !s.config.RegistrationSkipVerification {
		writeError(w, http.StatusServiceUnavailable, "Доставка кодов подтверждения пока не настроена")
		return
	}
	var exists int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE email = ? OR username = ?`, input.Email, input.Username).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить аккаунт")
		return
	}
	if exists > 0 {
		writeError(w, http.StatusConflict, "Почта или логин уже заняты")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось защитить пароль")
		return
	}
	challengeID, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать проверку")
		return
	}
	code, err := registrationCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать код")
		return
	}
	now := time.Now().UTC()
	expiresAt := now.Add(15 * time.Minute).Format(time.RFC3339Nano)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать проверку")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `DELETE FROM registration_challenges WHERE expires_at <= ? OR email = ? OR username = ?`, now.Format(time.RFC3339Nano), input.Email, input.Username); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить проверку")
		return
	}
	var invitationValue any
	if invitationID != "" {
		invitationValue = invitationID
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO registration_challenges(id, email, username, password_hash, code_hash, invitation_id, expires_at, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, challengeID, input.Email, input.Username, string(passwordHash), hashToken(code), invitationValue, expiresAt, now.Format(time.RFC3339Nano)); err != nil {
		writeError(w, http.StatusConflict, "Для этих данных уже создана проверка")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить проверку")
		return
	}
	if s.config.RegistrationSkipVerification {
		s.finishRegistration(w, r, challengeID, code, false)
		return
	}
	response := registrationChallengeResponse{ChallengeID: challengeID, ExpiresAt: expiresAt, InvitationPending: invitationID != ""}
	if s.config.RegistrationTestMode || !s.config.CookieSecure {
		response.TestingCode = code
	}
	writeJSON(w, http.StatusAccepted, response)
}

func (s *Server) handleVerifyRegistration(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ChallengeID string `json:"challengeId"`
		Code        string `json:"code"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.ChallengeID = strings.TrimSpace(input.ChallengeID)
	input.Code = strings.TrimSpace(input.Code)
	if input.ChallengeID == "" || len(input.Code) != 6 {
		writeError(w, http.StatusBadRequest, "Введите шестизначный код")
		return
	}
	s.finishRegistration(w, r, input.ChallengeID, input.Code, true)
}

// Both modes use the same invitation, uniqueness and session checks.
func (s *Server) finishRegistration(w http.ResponseWriter, r *http.Request, challengeID, code string, codeConfirmed bool) {
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать подтверждение")
		return
	}
	defer tx.Rollback()
	var email, username, passwordHash, codeHash, expiresAt string
	var invitationID sql.NullString
	var attempts int
	err = tx.QueryRowContext(r.Context(), `SELECT email, username, password_hash, code_hash, invitation_id, attempts, expires_at FROM registration_challenges WHERE id = ?`, challengeID).
		Scan(&email, &username, &passwordHash, &codeHash, &invitationID, &attempts, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Проверка не найдена. Запросите новый код")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать проверку")
		return
	}
	if timestampExpired(expiresAt) {
		_, _ = tx.ExecContext(r.Context(), `DELETE FROM registration_challenges WHERE id = ?`, challengeID)
		_ = tx.Commit()
		writeError(w, http.StatusGone, "Код истёк. Запросите новый")
		return
	}
	if attempts >= 5 || hashToken(code) != codeHash {
		if attempts+1 >= 5 {
			_, _ = tx.ExecContext(r.Context(), `DELETE FROM registration_challenges WHERE id = ?`, challengeID)
		} else {
			_, _ = tx.ExecContext(r.Context(), `UPDATE registration_challenges SET attempts = attempts + 1 WHERE id = ?`, challengeID)
		}
		_ = tx.Commit()
		writeError(w, http.StatusUnauthorized, "Неверный код подтверждения")
		return
	}
	var invitationTeamID, invitationRole string
	invitationProjects := make([]string, 0)
	var invitationUseCount int
	if invitationID.Valid {
		var projectJSON, invitationExpiresAt string
		var maxUses int
		err = tx.QueryRowContext(r.Context(), `SELECT team_id, role, project_ids_json, expires_at, max_uses, use_count FROM workspace_invitations WHERE id = ? AND revoked_at IS NULL`, invitationID.String).
			Scan(&invitationTeamID, &invitationRole, &projectJSON, &invitationExpiresAt, &maxUses, &invitationUseCount)
		if errors.Is(err, sql.ErrNoRows) || err == nil && (timestampExpired(invitationExpiresAt) || invitationUseCount >= maxUses) {
			_, _ = tx.ExecContext(r.Context(), `DELETE FROM registration_challenges WHERE id = ?`, challengeID)
			_ = tx.Commit()
			writeError(w, http.StatusGone, "Ссылка приглашения недействительна или уже использована")
			return
		}
		if err != nil || json.Unmarshal([]byte(projectJSON), &invitationProjects) != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось проверить доступ приглашения")
			return
		}
	}
	now := nowText()
	result, err := tx.ExecContext(r.Context(), `INSERT INTO users(email, username, password_hash, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`, email, username, passwordHash, now, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "Почта или логин уже заняты")
			return
		}
		log.Printf("verify registration: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось создать аккаунт")
		return
	}
	userID, _ := result.LastInsertId()
	if invitationID.Valid {
		if err = grantTeamMemberTx(r.Context(), tx, invitationTeamID, userID, invitationRole, invitationProjects, userID, true); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось выдать доступ приглашения")
			return
		}
		inviteResult, updateErr := tx.ExecContext(r.Context(), `UPDATE workspace_invitations SET use_count = use_count + 1 WHERE id = ? AND use_count = ? AND use_count < max_uses`, invitationID.String, invitationUseCount)
		if updateErr != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось применить приглашение")
			return
		}
		affected, rowsErr := inviteResult.RowsAffected()
		if rowsErr != nil || affected != 1 {
			writeError(w, http.StatusConflict, "Приглашение уже применено другим пользователем")
			return
		}
	}
	if _, err = tx.ExecContext(r.Context(), `DELETE FROM registration_challenges WHERE id = ?`, challengeID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить проверку")
		return
	}
	reason := "Регистрация без проверки почты"
	if codeConfirmed {
		reason = "Код регистрации подтверждён"
	}
	if err = writeActivity(r.Context(), tx, userID, "user", strconv.FormatInt(userID, 10), "created", reason, map[string]any{"username": username}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать регистрацию")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить регистрацию")
		return
	}
	user := User{ID: userID, Email: email, Username: username, CreatedAt: now}
	if err = s.createSession(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Аккаунт создан, но вход не выполнен")
		return
	}
	writeJSON(w, http.StatusCreated, user)
}
