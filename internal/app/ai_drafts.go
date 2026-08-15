package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
)

type AIQuestionDraft struct {
	Decision         string              `json:"decision"`
	Rationale        string              `json:"rationale"`
	SuggestedOutputs []AISuggestedOutput `json:"suggestedOutputs"`
	ContextCoverage  AIContextCoverage   `json:"contextCoverage"`
	Source           string              `json:"source"`
}

type AIFieldDraft struct {
	Value           string            `json:"value"`
	Fields          map[string]string `json:"fields"`
	Rationale       string            `json:"rationale"`
	ContextCoverage AIContextCoverage `json:"contextCoverage"`
	Source          string            `json:"source"`
}

func (s *Server) externalAIJSON(ctx context.Context, systemInstruction, prompt string, maxTokens int) (string, string, error) {
	var providerErrors []string
	if s.config.GeminiAPIKey != "" {
		content, err := s.geminiJSON(ctx, systemInstruction, prompt, maxTokens)
		if err == nil {
			return content, "gemini", nil
		}
		providerErrors = append(providerErrors, "gemini: "+err.Error())
	}
	if s.config.GroqAPIKey != "" {
		content, err := s.groqJSON(ctx, systemInstruction, prompt, maxTokens)
		if err == nil {
			return content, "groq", nil
		}
		providerErrors = append(providerErrors, "groq: "+err.Error())
	}
	if len(providerErrors) == 0 {
		return "", "", errors.New("external AI is not configured")
	}
	return "", "", errors.New(strings.Join(providerErrors, "; "))
}

func validateAIOutputs(outputs []AISuggestedOutput) []AISuggestedOutput {
	validated := make([]AISuggestedOutput, 0, min(5, len(outputs)))
	for _, output := range outputs {
		output.Title = strings.TrimSpace(output.Title)
		output.Description = strings.TrimSpace(output.Description)
		output.Reason = strings.TrimSpace(output.Reason)
		if _, ok := recordTypes[output.Type]; !ok || output.Type == "question_set" || output.Type == "meeting" || output.Title == "" || len([]rune(output.Title)) > 240 || !validPriority(output.Priority) || output.EstimateMinutes < 0 || output.EstimateMinutes > 525600 {
			continue
		}
		if !validRecordKind(output.Type, output.Kind) {
			continue
		}
		validated = append(validated, output)
		if len(validated) == 5 {
			break
		}
	}
	return validated
}

func (s *Server) handleAIQuestionDraft(w http.ResponseWriter, r *http.Request) {
	mode := strings.TrimSpace(r.URL.Query().Get("mode"))
	if mode != "" && mode != "structure" {
		writeError(w, http.StatusBadRequest, "Неизвестный режим AI-разбора")
		return
	}
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) || record.Type != "question_set" {
		writeError(w, http.StatusNotFound, "Карточка вопросов не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку вопросов")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	workflow, err := s.listQuestionWorkflow(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить ответы")
		return
	}
	var question *QuestionItem
	for index := range workflow.Questions {
		if workflow.Questions[index].ID == r.PathValue("questionId") {
			question = &workflow.Questions[index]
			break
		}
	}
	if question == nil {
		writeError(w, http.StatusNotFound, "Вопрос не найден")
		return
	}
	if len(question.Answers) < workflow.UserCount {
		writeError(w, http.StatusConflict, "AI-итог доступен после ответов всех основателей")
		return
	}
	dossier, coverage, err := s.buildAIRecordContext(r.Context(), record)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось собрать контекст вопроса")
		return
	}
	dossierJSON, _ := json.Marshal(dossier)
	questionJSON, _ := json.Marshal(question)
	promptInstruction := `Подготовь нейтральный черновик совместного решения двух сооснователей.`
	if mode == "structure" {
		promptInstruction = `Проанализируй ответы двух сооснователей и выдели только самостоятельные знания, которые пригодятся в будущей работе: критерии-предпочтения, ограничения, правила принятия решений и проверяемые выводы. Не превращай каждую фразу в сущность. Формулируй один атомарный смысл на одну карточку. Например, "не хотим постоянно работать в холоде" становится criterion с kind limitation; "контрольное решение принимает ответственный за направление" становится decision с kind rule. Одновременно подготовь короткий редактируемый общий итог.`
	}
	prompt := fmt.Sprintf(`%s Верни только JSON:
{"decision":"общий итог в Markdown","rationale":"коротко, какие общие позиции и различия учтены","suggestedOutputs":[{"type":"task|idea|criterion|research|decision|goal","kind":"|preference|limitation|rule|insight","title":"...","description":"...","priority":"low|normal|high|critical","estimateMinutes":60,"reason":"..."}]}.

Не выбирай сторону автоматически. Сохрани согласованные факты, явно обозначь оставшиеся различия и сформулируй решение так, чтобы его можно было отредактировать перед сохранением. Из ответов предложи отдельные критерии-предпочтения, ограничения и правила только когда они действительно сформулированы участниками. Для ограничения используй type=criterion и kind=limitation, для положительного критерия type=criterion и kind=preference, для правила type=decision и kind=rule, для вывода type=decision и kind=insight. Не выдумывай обязательства. Не больше 5 результатов. Вопрос: %s. Полное досье карточки: %s`, promptInstruction, questionJSON, dossierJSON)
	content, source, providerErr := s.externalAIJSON(r.Context(), "Ты фасилитатор решений сооснователей. Ты создаёшь только редактируемый черновик и не принимаешь решение за людей.", prompt, 2200)
	if providerErr != nil {
		log.Printf("question AI draft fallback record=%s question=%s: %v", record.ID, question.ID, providerErr)
		parts := make([]string, 0, len(question.Answers))
		for _, answer := range question.Answers {
			parts = append(parts, fmt.Sprintf("### Позиция %s\n\n%s", answer.AuthorUsername, answer.Content))
		}
		writeJSON(w, http.StatusOK, AIQuestionDraft{
			Decision: strings.Join(parts, "\n\n"), Rationale: "Внешний AI недоступен. Позиции собраны в один редактируемый черновик без автоматического вывода.",
			SuggestedOutputs: []AISuggestedOutput{}, ContextCoverage: coverage, Source: "heuristic",
		})
		return
	}
	var draft AIQuestionDraft
	if json.Unmarshal([]byte(content), &draft) != nil || strings.TrimSpace(draft.Decision) == "" {
		writeError(w, http.StatusBadGateway, "AI вернул неполный черновик. Повторите запрос")
		return
	}
	draft.Decision = strings.TrimSpace(draft.Decision)
	draft.Rationale = strings.TrimSpace(draft.Rationale)
	draft.SuggestedOutputs = validateAIOutputs(draft.SuggestedOutputs)
	draft.ContextCoverage = coverage
	draft.Source = source
	writeJSON(w, http.StatusOK, draft)
}

func (s *Server) handleAIFieldDraft(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Target       string         `json:"target"`
		Label        string         `json:"label"`
		CurrentValue string         `json:"currentValue"`
		Instruction  string         `json:"instruction"`
		FormContext  map[string]any `json:"formContext"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	allowed := map[string]bool{
		"description": true, "progressNote": true, "result": true, "section": true,
		"question_answer": true, "comment": true, "proof": true, "research_option": true,
	}
	input.Target = strings.TrimSpace(input.Target)
	if !allowed[input.Target] {
		writeError(w, http.StatusBadRequest, "Для этого поля AI-черновик не предусмотрен")
		return
	}
	if input.Target == "research_option" && record.Type != "research" {
		writeError(w, http.StatusConflict, "Варианты доступны только в исследовании")
		return
	}
	dossier, coverage, err := s.buildAIRecordContext(r.Context(), record)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось собрать контекст карточки")
		return
	}
	dossierJSON, _ := json.Marshal(dossier)
	formJSON, _ := json.Marshal(input.FormContext)
	schema := `{"value":"готовый Markdown-текст","fields":{},"rationale":"что использовано"}`
	instruction := `Предложи текст только для указанного поля. Сохрани факты, не выдумывай числа, даты, ссылки и выполненные действия. Верни value. fields оставь пустым.`
	if input.Target == "research_option" {
		schema = `{"value":"","fields":{"summaryMd":"...","prosMd":"...","consMd":"...","notesMd":"..."},"rationale":"что использовано"}`
		instruction = `Заполни только смысловые части варианта исследования: summaryMd, prosMd, consMd и notesMd. Верни все четыре ключа, но не изменяй уже заполненный пользователем текст: для заполненного ключа повтори его дословно. Не придумывай значения параметров или оценку.`
	}
	prompt := fmt.Sprintf(`Верни только JSON %s.
%s Пользователь может полностью изменить предложение, ничего не сохраняется автоматически. Цель поля: %s. Подсказка пользователя: %s. Текущее значение: %s. Несохранённые данные формы: %s. Полное досье карточки: %s`, schema, instruction, input.Label, input.Instruction, input.CurrentValue, formJSON, dossierJSON)
	content, source, providerErr := s.externalAIJSON(r.Context(), "Ты редактор рабочего пространства сооснователей. Используй только переданный контекст и готовь лаконичный редактируемый Markdown-черновик.", prompt, 1800)
	if providerErr != nil {
		log.Printf("field AI draft failed record=%s target=%s: %v", record.ID, input.Target, providerErr)
		writeError(w, http.StatusServiceUnavailable, "Внешний AI сейчас недоступен. Введённый текст сохранён в локальном черновике")
		return
	}
	var draft AIFieldDraft
	if json.Unmarshal([]byte(content), &draft) != nil {
		writeError(w, http.StatusBadGateway, "AI вернул некорректный черновик. Повторите запрос")
		return
	}
	draft.Value = strings.TrimSpace(draft.Value)
	draft.Rationale = strings.TrimSpace(draft.Rationale)
	if draft.Fields == nil {
		draft.Fields = map[string]string{}
	}
	if input.Target == "research_option" {
		validated := make(map[string]string, 4)
		for _, key := range []string{"summaryMd", "prosMd", "consMd", "notesMd"} {
			validated[key] = strings.TrimSpace(draft.Fields[key])
		}
		draft.Fields = validated
	} else if draft.Value == "" {
		writeError(w, http.StatusBadGateway, "AI не предложил текст для этого поля")
		return
	}
	draft.ContextCoverage = coverage
	draft.Source = source
	writeJSON(w, http.StatusOK, draft)
}
