package app

import (
	"log"
	"net/http"
	"strings"
)

type SearchResult struct {
	ID               string `json:"id"`
	EntityKind       string `json:"entityKind"`
	RecordID         string `json:"recordId"`
	QuestionID       string `json:"questionId,omitempty"`
	ResearchOptionID string `json:"researchOptionId,omitempty"`
	Type             string `json:"type"`
	Title            string `json:"title"`
	Context          string `json:"context"`
	Status           string `json:"status"`
	UpdatedAt        string `json:"updatedAt"`
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeJSON(w, http.StatusOK, []SearchResult{})
		return
	}
	if len(query) > 200 {
		writeError(w, http.StatusBadRequest, "Поисковый запрос слишком длинный")
		return
	}
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT id, entity_kind, record_id, question_id, research_option_id, type, title, context, status, updated_at
		FROM (
			SELECT 'record:' || r.id AS id, 'record' AS entity_kind, r.id AS record_id, '' AS question_id, '' AS research_option_id,
				CASE WHEN r.subtype = 'question_set' THEN 'question_set' WHEN r.record_kind = 'meeting' THEN 'meeting' ELSE r.type END AS type,
				r.title AS title, r.description AS context, r.status AS status, r.updated_at AS updated_at, 1 AS rank
			FROM records r
			WHERE r.status <> 'archived'
			UNION ALL
			SELECT 'question:' || q.id, 'question', q.record_id, q.id, '', 'question', q.body,
				'Вопрос в «' || r.title || '»', q.status, q.updated_at, 2
			FROM question_items q JOIN records r ON r.id = q.record_id
			WHERE r.status <> 'archived' AND q.status <> 'archived'
			UNION ALL
			SELECT 'answer:' || a.id, 'answer', q.record_id, q.id, '', 'answer', 'Ответ ' || u.username,
				a.content, 'completed', a.updated_at, 3
			FROM question_answers a
			JOIN question_items q ON q.id = a.question_id
			JOIN records r ON r.id = q.record_id
			JOIN users u ON u.id = a.author_id
			WHERE r.status <> 'archived' AND q.status <> 'archived'
			UNION ALL
			SELECT 'decision:' || d.id, 'joint_decision', q.record_id, q.id, '', 'joint_decision', 'Совместный итог',
				d.content, 'completed', d.updated_at, 4
			FROM question_decisions d
			JOIN question_items q ON q.id = d.question_id
			JOIN records r ON r.id = q.record_id
			WHERE r.status <> 'archived' AND q.status <> 'archived'
			UNION ALL
			SELECT 'research-option:' || o.id, 'research_option', o.record_id, '', o.id, 'research', o.title,
				o.summary_md || ' ' || o.pros_md || ' ' || o.cons_md || ' ' || o.notes_md,
				'active', o.updated_at, 5
			FROM research_options o
			JOIN records r ON r.id = o.record_id
			WHERE r.status <> 'archived' AND o.status = 'active'
		)
		ORDER BY rank, updated_at DESC
		LIMIT 5000`)
	if err != nil {
		log.Printf("search: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось выполнить поиск")
		return
	}
	defer rows.Close()
	results := make([]SearchResult, 0)
	normalizedQuery := strings.ToLower(query)
	for rows.Next() {
		var result SearchResult
		if err := rows.Scan(&result.ID, &result.EntityKind, &result.RecordID, &result.QuestionID, &result.ResearchOptionID, &result.Type, &result.Title, &result.Context, &result.Status, &result.UpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать результаты поиска")
			return
		}
		haystack := strings.ToLower(result.Title + " " + result.Context)
		if strings.Contains(haystack, normalizedQuery) {
			results = append(results, result)
			if len(results) == 40 {
				break
			}
		}
	}
	writeJSON(w, http.StatusOK, results)
}
