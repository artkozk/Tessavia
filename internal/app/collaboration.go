package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type UserActivityDay struct {
	Date          string `json:"date"`
	ActiveSeconds int    `json:"activeSeconds"`
	Interactions  int    `json:"interactions"`
	LastSeenAt    string `json:"lastSeenAt"`
}

type UserProfile struct {
	User                User              `json:"user"`
	ActiveSeconds30Days int               `json:"activeSeconds30Days"`
	Interactions30Days  int               `json:"interactions30Days"`
	Actions30Days       int               `json:"actions30Days"`
	CompletedRecords    int               `json:"completedRecords"`
	EstimateMinutes     int               `json:"estimateMinutes"`
	ActualMinutes       int               `json:"actualMinutes"`
	Activity            []UserActivityDay `json:"activity"`
	RecentActions       []Activity        `json:"recentActions"`
}

func (s *Server) handlePresence(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ActiveSeconds int `json:"activeSeconds"`
		Interactions  int `json:"interactions"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.ActiveSeconds < 0 {
		input.ActiveSeconds = 0
	}
	if input.ActiveSeconds > 120 {
		input.ActiveSeconds = 120
	}
	if input.Interactions < 0 {
		input.Interactions = 0
	}
	if input.Interactions > 500 {
		input.Interactions = 500
	}
	user := currentUser(r)
	now := time.Now().UTC()
	date := now.Format("2006-01-02")
	_, err := s.store.db.ExecContext(r.Context(), `
		INSERT INTO user_activity_daily(user_id, activity_date, active_seconds, interactions, last_seen_at)
		VALUES(?, ?, ?, ?, ?)
		ON CONFLICT(user_id, activity_date) DO UPDATE SET
			active_seconds = active_seconds + excluded.active_seconds,
			interactions = interactions + excluded.interactions,
			last_seen_at = excluded.last_seen_at`, user.ID, date, input.ActiveSeconds, input.Interactions, nowText())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить активность")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUserProfile(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный участник")
		return
	}
	var profile UserProfile
	err = s.store.db.QueryRowContext(r.Context(), `SELECT id, email, username, created_at FROM users WHERE id = ?`, userID).
		Scan(&profile.User.ID, &profile.User.Email, &profile.User.Username, &profile.User.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Участник не найден")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить профиль")
		return
	}
	since := time.Now().UTC().AddDate(0, 0, -29).Format("2006-01-02")
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(active_seconds), 0), COALESCE(SUM(interactions), 0) FROM user_activity_daily WHERE user_id = ? AND activity_date >= ?`, userID, since).
		Scan(&profile.ActiveSeconds30Days, &profile.Interactions30Days)
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM activity WHERE actor_id = ? AND created_at >= ?`, userID, time.Now().UTC().AddDate(0, 0, -30).Format(time.RFC3339Nano)).Scan(&profile.Actions30Days)
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*), COALESCE(SUM(estimate_minutes), 0), COALESCE(SUM(actual_minutes), 0) FROM records WHERE owner_id = ? AND status = 'completed'`, userID).
		Scan(&profile.CompletedRecords, &profile.EstimateMinutes, &profile.ActualMinutes)

	profile.Activity = make([]UserActivityDay, 0)
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT activity_date, active_seconds, interactions, last_seen_at FROM user_activity_daily WHERE user_id = ? ORDER BY activity_date DESC LIMIT 30`, userID)
	if err == nil {
		for rows.Next() {
			var day UserActivityDay
			if rows.Scan(&day.Date, &day.ActiveSeconds, &day.Interactions, &day.LastSeenAt) == nil {
				profile.Activity = append(profile.Activity, day)
			}
		}
		rows.Close()
	}
	profile.RecentActions, _ = s.listUserActivity(r.Context(), userID, 40)
	writeJSON(w, http.StatusOK, profile)
}

func (s *Server) listUserActivity(ctx context.Context, userID int64, limit int) ([]Activity, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT a.id, a.actor_id, u.username, a.entity_type, a.entity_id, a.action, a.details_json, a.reason, a.created_at FROM activity a JOIN users u ON u.id = a.actor_id WHERE a.actor_id = ? ORDER BY a.created_at DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Activity, 0)
	for rows.Next() {
		var item Activity
		var details string
		if err := rows.Scan(&item.ID, &item.ActorID, &item.ActorUsername, &item.EntityType, &item.EntityID, &item.Action, &details, &item.Reason, &item.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(details), &item.Details)
		items = append(items, item)
	}
	return items, rows.Err()
}

type RecordSuggestion struct {
	Priority        string  `json:"priority"`
	Workstream      string  `json:"workstream"`
	ParentID        string  `json:"parentId"`
	EstimateMinutes int     `json:"estimateMinutes"`
	Confidence      float64 `json:"confidence"`
	Reason          string  `json:"reason"`
	Source          string  `json:"source"`
}

type AISuggestedLink struct {
	RecordID     string `json:"recordId"`
	Title        string `json:"title"`
	RelationType string `json:"relationType"`
	Reason       string `json:"reason"`
}

type AISuggestedOutput struct {
	Type            string `json:"type"`
	Kind            string `json:"kind"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	Priority        string `json:"priority"`
	EstimateMinutes int    `json:"estimateMinutes"`
	Reason          string `json:"reason"`
}

type AIRecordAnalysis struct {
	Summary          string              `json:"summary"`
	ProposedDecision string              `json:"proposedDecision"`
	Gaps             []string            `json:"gaps"`
	Risks            []string            `json:"risks"`
	NextAction       string              `json:"nextAction"`
	Priority         string              `json:"priority"`
	EstimateMinutes  int                 `json:"estimateMinutes"`
	SuggestedLinks   []AISuggestedLink   `json:"suggestedLinks"`
	SuggestedOutputs []AISuggestedOutput `json:"suggestedOutputs"`
	ContextCoverage  AIContextCoverage   `json:"contextCoverage"`
	Confidence       float64             `json:"confidence"`
	Source           string              `json:"source"`
}

func (s *Server) handleSuggestRecord(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Type        string `json:"type"`
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	if input.Title == "" {
		writeError(w, http.StatusBadRequest, "Сначала укажите название")
		return
	}
	suggestion := s.heuristicSuggestion(r.Context(), input.Type, input.Title, input.Description)
	if s.config.GeminiAPIKey != "" {
		if aiSuggestion, err := s.geminiSuggestion(r.Context(), input.Type, input.Title, input.Description); err == nil {
			suggestion = aiSuggestion
		} else {
			log.Printf("gemini suggest fallback: %v", err)
		}
	} else if s.config.GroqAPIKey != "" {
		if aiSuggestion, err := s.groqSuggestion(r.Context(), input.Type, input.Title, input.Description); err == nil {
			suggestion = aiSuggestion
		} else {
			log.Printf("groq suggest fallback: %v", err)
		}
	}
	writeJSON(w, http.StatusOK, suggestion)
}

func (s *Server) suggestionPrompt(ctx context.Context, recordType, title, description string) (string, error) {
	parentRows, err := s.store.db.QueryContext(ctx, `SELECT id, title, type, workstream FROM records WHERE status NOT IN ('archived', 'cancelled') AND (is_root = 1 OR parent_id IS NULL) ORDER BY updated_at DESC LIMIT 40`)
	if err != nil {
		return "", err
	}
	defer parentRows.Close()
	parents := make([]map[string]string, 0)
	for parentRows.Next() {
		var id, parentTitle, parentType, workstream string
		if parentRows.Scan(&id, &parentTitle, &parentType, &workstream) == nil {
			parents = append(parents, map[string]string{"id": id, "title": parentTitle, "type": parentType, "workstream": workstream})
		}
	}
	parentJSON, _ := json.Marshal(parents)
	return fmt.Sprintf("Определи priority (low|normal|high|critical), workstream (business|platform|operations), parentId из списка или пустую строку и реалистичную estimateMinutes. Верни только JSON {priority,workstream,parentId,estimateMinutes,confidence,reason}. confidence от 0 до 1. Тип: %s. Название: %s. Описание: %s. Возможные родители: %s", recordType, title, description, parentJSON), nil
}

func (s *Server) validateSuggestion(ctx context.Context, suggestion RecordSuggestion, source string) (RecordSuggestion, error) {
	if !validPriority(suggestion.Priority) || !validWorkstream(suggestion.Workstream) || suggestion.EstimateMinutes < 0 || suggestion.EstimateMinutes > 525600 {
		return RecordSuggestion{}, errors.New("invalid AI suggestion")
	}
	if suggestion.ParentID != "" {
		if _, err := s.getRecord(ctx, suggestion.ParentID); err != nil {
			suggestion.ParentID = ""
		}
	}
	suggestion.Source = source
	if suggestion.Confidence < 0 || suggestion.Confidence > 1 {
		suggestion.Confidence = 0.7
	}
	return suggestion, nil
}

func (s *Server) geminiSuggestion(ctx context.Context, recordType, title, description string) (RecordSuggestion, error) {
	prompt, err := s.suggestionPrompt(ctx, recordType, title, description)
	if err != nil {
		return RecordSuggestion{}, err
	}
	content, err := s.geminiJSON(ctx, "Ты помощник закрытой системы двух сооснователей. Не выдумывай идентификаторы. Ответ только валидным JSON.", prompt, 450)
	if err != nil {
		return RecordSuggestion{}, err
	}
	var suggestion RecordSuggestion
	if err := json.Unmarshal([]byte(content), &suggestion); err != nil {
		return RecordSuggestion{}, err
	}
	return s.validateSuggestion(ctx, suggestion, "gemini")
}

func (s *Server) geminiJSON(ctx context.Context, systemInstruction, prompt string, maxTokens int) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	payload := map[string]any{
		"systemInstruction": map[string]any{"parts": []map[string]string{{"text": systemInstruction}}},
		"contents":          []map[string]any{{"role": "user", "parts": []map[string]string{{"text": prompt}}}},
		"generationConfig": map[string]any{
			"temperature":      0.15,
			"maxOutputTokens":  maxTokens,
			"responseMimeType": "application/json",
			"thinkingConfig":   map[string]int{"thinkingBudget": 0},
		},
	}
	body, _ := json.Marshal(payload)
	url := strings.TrimRight(s.config.GeminiBaseURL, "/") + "/models/" + s.config.GeminiModel + ":generateContent"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", s.config.GeminiAPIKey)
	response, err := s.doAIRequest(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if response.StatusCode != http.StatusOK {
		var providerError struct {
			Error struct {
				Status  string `json:"status"`
				Details []struct {
					Reason string `json:"reason"`
				} `json:"details"`
			} `json:"error"`
		}
		_ = json.Unmarshal(responseBody, &providerError)
		reason := strings.TrimSpace(providerError.Error.Status)
		for _, detail := range providerError.Error.Details {
			if strings.TrimSpace(detail.Reason) != "" {
				reason = strings.TrimSpace(detail.Reason)
				break
			}
		}
		if reason == "" {
			reason = "UNKNOWN"
		}
		return "", fmt.Errorf("gemini status %d: %s", response.StatusCode, reason)
	}
	var completion struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(responseBody, &completion); err != nil || len(completion.Candidates) == 0 || len(completion.Candidates[0].Content.Parts) == 0 {
		return "", errors.New("invalid gemini response")
	}
	content := strings.TrimSpace(completion.Candidates[0].Content.Parts[0].Text)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	return strings.TrimSpace(content), nil
}

func (s *Server) heuristicSuggestion(ctx context.Context, recordType, title, description string) RecordSuggestion {
	text := strings.ToLower(title + " " + description)
	priority := "normal"
	if strings.Contains(text, "сроч") || strings.Contains(text, "критич") || strings.Contains(text, "блокир") {
		priority = "critical"
	} else if strings.Contains(text, "важн") || strings.Contains(text, "релиз") || strings.Contains(text, "дедлайн") {
		priority = "high"
	}
	workstream := "business"
	if strings.Contains(text, "платформ") || strings.Contains(text, "интерфейс") || strings.Contains(text, "api") || strings.Contains(text, "баг") || strings.Contains(text, "сервер") || strings.Contains(text, "дизайн") {
		workstream = "platform"
	}
	parentID := ""
	var candidate string
	_ = s.store.db.QueryRowContext(ctx, `SELECT id FROM records WHERE status NOT IN ('archived', 'cancelled', 'completed') AND is_root = 1 AND workstream = ? ORDER BY updated_at DESC LIMIT 1`, workstream).Scan(&candidate)
	if candidate != "" {
		parentID = candidate
	}
	return RecordSuggestion{Priority: priority, Workstream: workstream, ParentID: parentID, EstimateMinutes: heuristicEstimate(recordType, text), Confidence: 0.45, Reason: "Предложено по формулировке и текущим корневым карточкам. Проверьте перед сохранением.", Source: "heuristic"}
}

func heuristicEstimate(recordType, text string) int {
	base := map[string]int{"task": 60, "question_set": 90, "meeting": 60, "research": 180, "decision": 45, "disagreement": 90, "goal": 240}[recordType]
	if base == 0 {
		base = 30
	}
	if strings.Contains(text, "аудит") || strings.Contains(text, "исследован") || strings.Contains(text, "анализ") {
		base *= 2
	}
	if strings.Contains(text, "быстр") || strings.Contains(text, "коротк") {
		base = max(15, base/2)
	}
	return base
}

func (s *Server) groqSuggestion(ctx context.Context, recordType, title, description string) (RecordSuggestion, error) {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	parentRows, err := s.store.db.QueryContext(ctx, `SELECT id, title, type, workstream FROM records WHERE status NOT IN ('archived', 'cancelled') AND (is_root = 1 OR parent_id IS NULL) ORDER BY updated_at DESC LIMIT 40`)
	if err != nil {
		return RecordSuggestion{}, err
	}
	parents := make([]map[string]string, 0)
	for parentRows.Next() {
		var id, parentTitle, parentType, workstream string
		if parentRows.Scan(&id, &parentTitle, &parentType, &workstream) == nil {
			parents = append(parents, map[string]string{"id": id, "title": parentTitle, "type": parentType, "workstream": workstream})
		}
	}
	parentRows.Close()
	parentJSON, _ := json.Marshal(parents)
	prompt := fmt.Sprintf("Определи priority (low|normal|high|critical), workstream (business|platform|operations), parentId из списка или пустую строку и реалистичную estimateMinutes. Верни только JSON {priority,workstream,parentId,estimateMinutes,confidence,reason}. confidence от 0 до 1. Тип: %s. Название: %s. Описание: %s. Возможные родители: %s", recordType, title, description, parentJSON)
	payload := map[string]any{
		"model":                 s.config.GroqModel,
		"messages":              []map[string]string{{"role": "system", "content": "Ты помощник закрытой системы двух сооснователей. Не выдумывай идентификаторы. Ответ только валидным JSON."}, {"role": "user", "content": prompt}},
		"temperature":           0.1,
		"max_completion_tokens": 450,
		"response_format":       map[string]string{"type": "json_object"},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.groqURL()+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return RecordSuggestion{}, err
	}
	req.Header.Set("Authorization", "Bearer "+s.config.GroqAPIKey)
	req.Header.Set("Content-Type", "application/json")
	response, err := s.doAIRequest(req)
	if err != nil {
		return RecordSuggestion{}, err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode != http.StatusOK {
		return RecordSuggestion{}, fmt.Errorf("groq status %d", response.StatusCode)
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(responseBody, &completion); err != nil || len(completion.Choices) == 0 {
		return RecordSuggestion{}, errors.New("invalid groq response")
	}
	var suggestion RecordSuggestion
	if err := json.Unmarshal([]byte(completion.Choices[0].Message.Content), &suggestion); err != nil {
		return RecordSuggestion{}, err
	}
	if !validPriority(suggestion.Priority) || !validWorkstream(suggestion.Workstream) || suggestion.EstimateMinutes < 0 || suggestion.EstimateMinutes > 525600 {
		return RecordSuggestion{}, errors.New("invalid groq suggestion")
	}
	if suggestion.ParentID != "" {
		if _, err := s.getRecord(ctx, suggestion.ParentID); err != nil {
			suggestion.ParentID = ""
		}
	}
	suggestion.Source = "groq"
	if suggestion.Confidence < 0 || suggestion.Confidence > 1 {
		suggestion.Confidence = 0.7
	}
	return suggestion, nil
}

func (s *Server) groqURL() string {
	if strings.TrimSpace(s.config.GroqBaseURL) == "" {
		return "https://api.groq.com/openai/v1"
	}
	return strings.TrimRight(s.config.GroqBaseURL, "/")
}

func (s *Server) groqJSON(ctx context.Context, systemInstruction, prompt string, maxTokens int) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	payload := map[string]any{
		"model":                 s.config.GroqModel,
		"messages":              []map[string]string{{"role": "system", "content": systemInstruction}, {"role": "user", "content": prompt}},
		"temperature":           0.15,
		"max_completion_tokens": maxTokens,
		"response_format":       map[string]string{"type": "json_object"},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.groqURL()+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.config.GroqAPIKey)
	req.Header.Set("Content-Type", "application/json")
	response, err := s.doAIRequest(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("groq status %d", response.StatusCode)
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(responseBody, &completion); err != nil || len(completion.Choices) == 0 {
		return "", errors.New("invalid groq response")
	}
	return strings.TrimSpace(completion.Choices[0].Message.Content), nil
}

func (s *Server) handleAnalyzeRecord(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	if s.config.GeminiAPIKey != "" {
		if aiAnalysis, aiErr := s.geminiRecordAnalysis(r.Context(), record); aiErr == nil {
			writeJSON(w, http.StatusOK, aiAnalysis)
			return
		} else {
			log.Printf("gemini analysis fallback record=%s: %v", record.ID, aiErr)
		}
	}
	if s.config.GroqAPIKey != "" {
		if aiAnalysis, aiErr := s.groqRecordAnalysis(r.Context(), record); aiErr == nil {
			writeJSON(w, http.StatusOK, aiAnalysis)
			return
		} else {
			log.Printf("groq analysis fallback record=%s: %v", record.ID, aiErr)
		}
	}
	analysis := s.heuristicRecordAnalysis(r.Context(), record)
	writeJSON(w, http.StatusOK, analysis)
}

func (s *Server) heuristicRecordAnalysis(ctx context.Context, record Record) AIRecordAnalysis {
	_, coverage, _ := s.buildAIRecordContext(ctx, record)
	gaps := make([]string, 0)
	risks := make([]string, 0)
	if strings.TrimSpace(record.Description) == "" {
		gaps = append(gaps, "Не зафиксирован контекст или ожидаемый результат.")
	}
	if record.EstimateMinutes == 0 && record.Type != "idea" && record.Type != "criterion" && record.Type != "document" {
		gaps = append(gaps, "Нет оценки времени, поэтому нагрузку команды нельзя проверить.")
	}
	if record.DueAt == nil && (record.Type == "task" || record.Type == "question_set" || record.Type == "research" || record.Type == "goal") {
		gaps = append(gaps, "Не указан срок выполнения.")
	}
	if record.ParentID == nil && !record.IsRoot {
		gaps = append(gaps, "Карточка не закреплена в причинно-следственной ветке.")
	}
	if record.Status == "blocked" {
		risks = append(risks, "Работа заблокирована, но из статуса не видно следующего действия по разблокировке.")
	}
	if record.Priority == "critical" && record.DueAt == nil {
		risks = append(risks, "Критический приоритет не подкреплён сроком.")
	}
	if record.DueAt != nil {
		if due, parseErr := time.Parse(time.RFC3339Nano, *record.DueAt); parseErr == nil && due.Before(time.Now().UTC()) && record.Status != "completed" && record.Status != "cancelled" && record.Status != "archived" {
			risks = append(risks, "Срок уже прошёл, а карточка остаётся активной.")
		}
	}
	nextAction := "Уточнить ожидаемый результат и зафиксировать ближайшее проверяемое действие."
	if record.Status == "planned" {
		nextAction = "Назначить первый конкретный шаг и перевести карточку в работу."
	} else if record.Status == "in_progress" && strings.TrimSpace(record.ProgressNote) != "" {
		nextAction = "Проверить текущее обновление и зафиксировать следующий измеримый шаг."
	} else if record.Type == "idea" {
		nextAction = "Связать идею хотя бы с одной целью или критерием и определить, что нужно исследовать."
	} else if record.Type == "meeting" {
		nextAction = "Выделить из заметок решения, задачи и ограничения, затем создать связанные карточки."
	}
	links := make([]AISuggestedLink, 0)
	if record.ParentID != nil {
		if parent, parentErr := s.getRecord(ctx, *record.ParentID); parentErr == nil {
			links = append(links, AISuggestedLink{RecordID: parent.ID, Title: parent.Title, RelationType: "depends_on", Reason: "Текущий родитель задаёт контекст этой работы."})
		}
	}
	outputs := make([]AISuggestedOutput, 0)
	if record.Type == "meeting" && strings.TrimSpace(record.Description) != "" {
		outputs = append(outputs, AISuggestedOutput{Type: "decision", Title: "Зафиксировать итог встречи: " + record.Title, Description: record.Description, Priority: "normal", EstimateMinutes: 30, Reason: "Встреча должна завершаться предметным решением или следующей работой."})
	}
	summary := strings.TrimSpace(record.Description)
	if summary == "" {
		summary = "Карточка «" + record.Title + "» пока содержит только название."
	}
	proposedDecision := ""
	if record.Type == "research" && coverage.ResearchOptions > 0 {
		summary = fmt.Sprintf("В исследовании зафиксировано вариантов: %d; параметров сравнения: %d. Внешний AI недоступен, поэтому содержательный выбор не сформирован локальными правилами.", coverage.ResearchOptions, coverage.ResearchFields)
		nextAction = "Проверить заполненные варианты и зафиксировать итог исследования."
	}
	return AIRecordAnalysis{Summary: summary, ProposedDecision: proposedDecision, Gaps: gaps, Risks: risks, NextAction: nextAction, Priority: record.Priority, EstimateMinutes: max(record.EstimateMinutes, heuristicEstimate(record.Type, strings.ToLower(record.Title+" "+record.Description))), SuggestedLinks: links, SuggestedOutputs: outputs, ContextCoverage: coverage, Confidence: 0.45, Source: "heuristic"}
}

func (s *Server) recordAnalysisPrompt(ctx context.Context, record Record) (string, map[string]string, AIContextCoverage, error) {
	dossier, coverage, err := s.buildAIRecordContext(ctx, record)
	if err != nil {
		return "", nil, coverage, err
	}
	rows, err := s.store.db.QueryContext(ctx, `SELECT id, CASE WHEN subtype = 'question_set' THEN 'question_set' WHEN record_kind = 'meeting' THEN 'meeting' ELSE type END, title, description, status, workstream FROM records WHERE id <> ? AND status NOT IN ('archived', 'cancelled', 'completed', 'rejected') ORDER BY updated_at DESC LIMIT 60`, record.ID)
	if err != nil {
		return "", nil, coverage, err
	}
	defer rows.Close()
	candidates := make([]map[string]string, 0)
	validCandidateIDs := make(map[string]string)
	for rows.Next() {
		var id, recordType, title, description, status, workstream string
		if rows.Scan(&id, &recordType, &title, &description, &status, &workstream) == nil {
			descriptionRunes := []rune(description)
			if len(descriptionRunes) > 500 {
				description = string(descriptionRunes[:500]) + "…"
			}
			candidates = append(candidates, map[string]string{"id": id, "type": recordType, "title": title, "description": description, "status": status, "workstream": workstream})
			validCandidateIDs[id] = title
		}
	}
	candidateJSON, _ := json.Marshal(candidates)
	dossierJSON, _ := json.Marshal(dossier)
	prompt := fmt.Sprintf(`Разбери рабочую карточку и верни только JSON:
{"summary":"краткая выжимка всех существенных данных","proposedDecision":"предлагаемый итог или пустая строка","gaps":["..."],"risks":["..."],"nextAction":"...","priority":"low|normal|high|critical","estimateMinutes":60,"confidence":0.8,"suggestedLinks":[{"recordId":"id из списка","relationType":"related|supports|depends_on|result_of|leads_to","reason":"..."}],"suggestedOutputs":[{"type":"task|idea|criterion|research|decision|goal","kind":"|preference|limitation|rule|insight","title":"...","description":"...","priority":"low|normal|high|critical","estimateMinutes":60,"reason":"..."}]}.

ДОСЬЕ является единственным источником истины. Прочитай все его источники: sections, researchComparison, relations, criterionScores, questionWorkflow, recentComments, checklist, proofs, attachmentsMetadata, origin и recentHistory. Нельзя называть данные отсутствующими, если они есть хотя бы в одном источнике ДОСЬЕ.

Для исследования с вариантами сравни варианты по именам, общей оценке, заполненным параметрам, плюсам, минусам и примечаниям. Если варианты уже есть, summary обязан перечислить рассмотренные варианты, а proposedDecision предложить обоснованный итог. Не предлагай «добавить варианты» или «указать критерии», если соответствующие данные уже зафиксированы. Пустой result означает, что итог ещё не принят, а не что исследование пустое.

Для группы вопросов учитывай все личные ответы и совместные итоги. Если из фактов следует устойчивое предпочтение, ограничение или правило, предложи отдельную сущность через suggestedOutputs: criterion+preference, criterion+limitation либо decision+rule. Для встречи извлекай только предметные решения, задачи, критерии, ограничения и идеи. Для обычной карточки suggestedOutputs оставь пустым, если из материалов не следует самостоятельная сущность.

Не меняй факты, не выдумывай ID, отделяй вывод от предположения, не предлагай больше 4 связей и 5 новых сущностей. ДОСЬЕ: %s. Кандидаты для новых связей: %s`, dossierJSON, candidateJSON)
	return prompt, validCandidateIDs, coverage, nil
}

func validateRecordAnalysis(analysis AIRecordAnalysis, validCandidateIDs map[string]string, source string) (AIRecordAnalysis, error) {
	if strings.TrimSpace(analysis.Summary) == "" || strings.TrimSpace(analysis.NextAction) == "" || !validPriority(analysis.Priority) || analysis.EstimateMinutes < 0 || analysis.EstimateMinutes > 525600 {
		return AIRecordAnalysis{}, errors.New("invalid AI analysis")
	}
	if len(analysis.Gaps) > 6 {
		analysis.Gaps = analysis.Gaps[:6]
	}
	if len(analysis.Risks) > 6 {
		analysis.Risks = analysis.Risks[:6]
	}
	validRelations := map[string]bool{"related": true, "supports": true, "depends_on": true, "result_of": true, "leads_to": true}
	validatedLinks := make([]AISuggestedLink, 0, min(4, len(analysis.SuggestedLinks)))
	for _, link := range analysis.SuggestedLinks {
		if title, ok := validCandidateIDs[link.RecordID]; ok && validRelations[link.RelationType] && len(validatedLinks) < 4 {
			link.Title = title
			validatedLinks = append(validatedLinks, link)
		}
	}
	analysis.SuggestedLinks = validatedLinks
	validatedOutputs := make([]AISuggestedOutput, 0, min(5, len(analysis.SuggestedOutputs)))
	for _, output := range analysis.SuggestedOutputs {
		if _, ok := recordTypes[output.Type]; !ok || output.Type == "question_set" || output.Type == "meeting" || strings.TrimSpace(output.Title) == "" || len(output.Title) > 240 || !validPriority(output.Priority) || output.EstimateMinutes < 0 || output.EstimateMinutes > 525600 {
			continue
		}
		if !validRecordKind(output.Type, output.Kind) {
			continue
		}
		validatedOutputs = append(validatedOutputs, output)
		if len(validatedOutputs) == 5 {
			break
		}
	}
	analysis.SuggestedOutputs = validatedOutputs
	analysis.Summary = strings.TrimSpace(analysis.Summary)
	analysis.ProposedDecision = strings.TrimSpace(analysis.ProposedDecision)
	if len([]rune(analysis.ProposedDecision)) > 12000 {
		analysis.ProposedDecision = string([]rune(analysis.ProposedDecision)[:12000])
	}
	if analysis.Confidence < 0 || analysis.Confidence > 1 {
		analysis.Confidence = 0.7
	}
	analysis.Source = source
	return analysis, nil
}

func (s *Server) geminiRecordAnalysis(ctx context.Context, record Record) (AIRecordAnalysis, error) {
	prompt, candidates, coverage, err := s.recordAnalysisPrompt(ctx, record)
	if err != nil {
		return AIRecordAnalysis{}, err
	}
	content, err := s.geminiJSON(ctx, "Ты аналитик закрытого рабочего пространства двух сооснователей. Отделяй факт от предположения, опирайся на всё переданное досье, давай короткие проверяемые рекомендации и никогда не применяй изменения сам.", prompt, 2600)
	if err != nil {
		return AIRecordAnalysis{}, err
	}
	var analysis AIRecordAnalysis
	if err := json.Unmarshal([]byte(content), &analysis); err != nil {
		return AIRecordAnalysis{}, err
	}
	validated, err := validateRecordAnalysis(analysis, candidates, "gemini")
	validated.ContextCoverage = coverage
	return validated, err
}

func (s *Server) groqRecordAnalysis(ctx context.Context, record Record) (AIRecordAnalysis, error) {
	prompt, candidates, coverage, err := s.recordAnalysisPrompt(ctx, record)
	if err != nil {
		return AIRecordAnalysis{}, err
	}
	content, err := s.groqJSON(ctx, "Ты аналитик закрытого рабочего пространства двух сооснователей. Отделяй факт от предположения, опирайся на всё переданное досье, давай короткие проверяемые рекомендации и никогда не применяй изменения сам.", prompt, 2600)
	if err != nil {
		return AIRecordAnalysis{}, err
	}
	var analysis AIRecordAnalysis
	if err := json.Unmarshal([]byte(content), &analysis); err != nil {
		return AIRecordAnalysis{}, err
	}
	validated, err := validateRecordAnalysis(analysis, candidates, "groq")
	validated.ContextCoverage = coverage
	return validated, err
}
