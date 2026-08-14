package app

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

type GraphNode struct {
	ID               string `json:"id"`
	EntityKind       string `json:"entityKind"`
	RecordID         string `json:"recordId"`
	QuestionID       string `json:"questionId,omitempty"`
	ResearchOptionID string `json:"researchOptionId,omitempty"`
	Type             string `json:"type"`
	Kind             string `json:"kind,omitempty"`
	Title            string `json:"title"`
	Description      string `json:"description,omitempty"`
	Status           string `json:"status"`
	OwnerUsername    string `json:"ownerUsername,omitempty"`
	Workstream       string `json:"workstream,omitempty"`
	EditPolicy       string `json:"editPolicy,omitempty"`
	ParentID         string `json:"parentId,omitempty"`
	IsRoot           bool   `json:"isRoot,omitempty"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

type GraphEdge struct {
	ID           string `json:"id"`
	Source       string `json:"source"`
	Target       string `json:"target"`
	RelationType string `json:"relationType"`
	Label        string `json:"label"`
}

type GraphResponse struct {
	Nodes       []GraphNode `json:"nodes"`
	Edges       []GraphEdge `json:"edges"`
	GeneratedAt string      `json:"generatedAt"`
}

func graphRecordID(id string) string         { return "record:" + id }
func graphQuestionID(id string) string       { return "question:" + id }
func graphAnswerID(id string) string         { return "answer:" + id }
func graphDecisionID(id string) string       { return "decision:" + id }
func graphResearchOptionID(id string) string { return "research-option:" + id }

func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	startedAt := time.Now()
	includeArchived := r.URL.Query().Get("includeArchived") == "true"
	archiveFilter := ""
	if !includeArchived {
		archiveFilter = " WHERE r.status <> 'archived'"
	}

	rows, err := s.store.db.QueryContext(r.Context(), recordSelect+archiveFilter+" ORDER BY r.updated_at DESC LIMIT 2000")
	if err != nil {
		log.Printf("graph records: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточки карты")
		return
	}
	nodes := make([]GraphNode, 0)
	nodeIDs := make(map[string]struct{})
	for rows.Next() {
		record, scanErr := scanRecord(rows)
		if scanErr != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать карточки карты")
			return
		}
		node := GraphNode{
			ID: graphRecordID(record.ID), EntityKind: "record", RecordID: record.ID,
			Type: record.Type, Kind: record.Kind, Title: record.Title, Description: record.Description,
			Status: record.Status, OwnerUsername: record.OwnerUsername, Workstream: record.Workstream, EditPolicy: record.EditPolicy,
			IsRoot: record.IsRoot, CreatedAt: record.CreatedAt, UpdatedAt: record.UpdatedAt,
		}
		if record.ParentID != nil {
			node.ParentID = *record.ParentID
		}
		nodes = append(nodes, node)
		nodeIDs[node.ID] = struct{}{}
	}
	if err := rows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить чтение карты")
		return
	}

	edges := make([]GraphEdge, 0)
	addEdge := func(edge GraphEdge) {
		if _, ok := nodeIDs[edge.Source]; !ok {
			return
		}
		if _, ok := nodeIDs[edge.Target]; !ok {
			return
		}
		edges = append(edges, edge)
	}
	for _, node := range nodes {
		if node.ParentID != "" {
			addEdge(GraphEdge{ID: "hierarchy:" + node.RecordID, Source: graphRecordID(node.ParentID), Target: node.ID, RelationType: "parent_of", Label: "родитель"})
		}
	}

	linkRows, err := s.store.db.QueryContext(r.Context(), `
		SELECT l.id, l.source_id, l.target_id, l.relation_type
		FROM record_links l
		WHERE l.active = 1
		ORDER BY l.created_at`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить связи карты")
		return
	}
	for linkRows.Next() {
		var id, sourceID, targetID, relationType string
		if err := linkRows.Scan(&id, &sourceID, &targetID, &relationType); err != nil {
			linkRows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать связь карты")
			return
		}
		addEdge(GraphEdge{ID: "link:" + id, Source: graphRecordID(sourceID), Target: graphRecordID(targetID), RelationType: relationType, Label: graphRelationLabel(relationType)})
	}
	if err := linkRows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить чтение связей")
		return
	}

	questionRows, err := s.store.db.QueryContext(r.Context(), `
		SELECT q.id, q.record_id, q.body, q.status, q.created_at, q.updated_at
		FROM question_items q
		JOIN records r ON r.id = q.record_id
		WHERE (? = 1 OR (r.status <> 'archived' AND q.status <> 'archived'))
		ORDER BY q.record_id, q.sort_order, q.created_at`, includeArchived)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить вопросы карты")
		return
	}
	for questionRows.Next() {
		var id, recordID, body, status, createdAt, updatedAt string
		if err := questionRows.Scan(&id, &recordID, &body, &status, &createdAt, &updatedAt); err != nil {
			questionRows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать вопрос карты")
			return
		}
		node := GraphNode{ID: graphQuestionID(id), EntityKind: "question", RecordID: recordID, QuestionID: id, Type: "question", Title: body, Status: status, CreatedAt: createdAt, UpdatedAt: updatedAt}
		nodes = append(nodes, node)
		nodeIDs[node.ID] = struct{}{}
		addEdge(GraphEdge{ID: "contains-question:" + id, Source: graphRecordID(recordID), Target: node.ID, RelationType: "contains", Label: "содержит вопрос"})
	}
	if err := questionRows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить чтение вопросов")
		return
	}

	answerRows, err := s.store.db.QueryContext(r.Context(), `
		SELECT a.id, a.question_id, q.record_id, u.username, a.content, a.created_at, a.updated_at
		FROM question_answers a
		JOIN question_items q ON q.id = a.question_id
		JOIN records r ON r.id = q.record_id
		JOIN users u ON u.id = a.author_id
		WHERE (? = 1 OR (r.status <> 'archived' AND q.status <> 'archived'))
		ORDER BY a.created_at`, includeArchived)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить ответы карты")
		return
	}
	for answerRows.Next() {
		var id, questionID, recordID, username, content, createdAt, updatedAt string
		if err := answerRows.Scan(&id, &questionID, &recordID, &username, &content, &createdAt, &updatedAt); err != nil {
			answerRows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать ответ карты")
			return
		}
		node := GraphNode{ID: graphAnswerID(id), EntityKind: "answer", RecordID: recordID, QuestionID: questionID, Type: "answer", Title: "Ответ " + username, Description: content, Status: "completed", OwnerUsername: username, CreatedAt: createdAt, UpdatedAt: updatedAt}
		nodes = append(nodes, node)
		nodeIDs[node.ID] = struct{}{}
		addEdge(GraphEdge{ID: "answers-question:" + id, Source: graphQuestionID(questionID), Target: node.ID, RelationType: "answered_by", Label: username + " ответил"})
	}
	if err := answerRows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить чтение ответов")
		return
	}

	decisionRows, err := s.store.db.QueryContext(r.Context(), `
		SELECT d.id, d.question_id, q.record_id, d.content, u.username, d.created_at, d.updated_at
		FROM question_decisions d
		JOIN question_items q ON q.id = d.question_id
		JOIN records r ON r.id = q.record_id
		JOIN users u ON u.id = d.decided_by
		WHERE (? = 1 OR (r.status <> 'archived' AND q.status <> 'archived'))
		ORDER BY d.created_at`, includeArchived)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить итоги карты")
		return
	}
	for decisionRows.Next() {
		var id, questionID, recordID, content, username, createdAt, updatedAt string
		if err := decisionRows.Scan(&id, &questionID, &recordID, &content, &username, &createdAt, &updatedAt); err != nil {
			decisionRows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать итог карты")
			return
		}
		node := GraphNode{ID: graphDecisionID(id), EntityKind: "joint_decision", RecordID: recordID, QuestionID: questionID, Type: "joint_decision", Title: "Совместный итог", Description: content, Status: "completed", OwnerUsername: username, CreatedAt: createdAt, UpdatedAt: updatedAt}
		nodes = append(nodes, node)
		nodeIDs[node.ID] = struct{}{}
		addEdge(GraphEdge{ID: "question-decision:" + id, Source: graphQuestionID(questionID), Target: node.ID, RelationType: "decided_as", Label: "принят итог"})
	}
	if err := decisionRows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить чтение итогов")
		return
	}

	researchOptionRows, err := s.store.db.QueryContext(r.Context(), `
		SELECT o.id, o.record_id, o.title, o.summary_md, o.status, o.created_at, o.updated_at, u.username
		FROM research_options o
		JOIN records r ON r.id = o.record_id
		JOIN users u ON u.id = o.updated_by
		WHERE (? = 1 OR (r.status <> 'archived' AND o.status <> 'archived'))
		ORDER BY o.record_id, o.sort_order, o.created_at`, includeArchived)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить варианты исследований карты")
		return
	}
	for researchOptionRows.Next() {
		var id, recordID, title, summary, status, createdAt, updatedAt, username string
		if err := researchOptionRows.Scan(&id, &recordID, &title, &summary, &status, &createdAt, &updatedAt, &username); err != nil {
			researchOptionRows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать вариант исследования карты")
			return
		}
		node := GraphNode{ID: graphResearchOptionID(id), EntityKind: "research_option", RecordID: recordID, ResearchOptionID: id, Type: "research_option", Title: title, Description: summary, Status: status, OwnerUsername: username, CreatedAt: createdAt, UpdatedAt: updatedAt}
		nodes = append(nodes, node)
		nodeIDs[node.ID] = struct{}{}
		addEdge(GraphEdge{ID: "contains-research-option:" + id, Source: graphRecordID(recordID), Target: node.ID, RelationType: "contains_option", Label: "рассматривает вариант"})
	}
	if err := researchOptionRows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить чтение вариантов исследований")
		return
	}

	scoreRows, err := s.store.db.QueryContext(r.Context(), `
		SELECT id, record_id, criterion_id, score
		FROM criterion_scores
		ORDER BY updated_at`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить оценки карты")
		return
	}
	for scoreRows.Next() {
		var id, recordID, criterionID string
		var score int
		if err := scoreRows.Scan(&id, &recordID, &criterionID, &score); err != nil {
			scoreRows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать оценку карты")
			return
		}
		addEdge(GraphEdge{ID: "score:" + id, Source: graphRecordID(recordID), Target: graphRecordID(criterionID), RelationType: "evaluated_by", Label: fmt.Sprintf("оценено %d/10", score)})
	}
	if err := scoreRows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить чтение оценок")
		return
	}

	derivationRows, err := s.store.db.QueryContext(r.Context(), `
		SELECT id, output_record_id, source_record_id, COALESCE(source_question_id, ''), COALESCE(source_decision_id, '')
		FROM record_derivations
		ORDER BY created_at`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить происхождение карточек")
		return
	}
	for derivationRows.Next() {
		var id, outputRecordID, sourceRecordID, sourceQuestionID, sourceDecisionID string
		if err := derivationRows.Scan(&id, &outputRecordID, &sourceRecordID, &sourceQuestionID, &sourceDecisionID); err != nil {
			derivationRows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать происхождение карточки")
			return
		}
		source := graphRecordID(sourceRecordID)
		if strings.TrimSpace(sourceDecisionID) != "" {
			source = graphDecisionID(sourceDecisionID)
		} else if strings.TrimSpace(sourceQuestionID) != "" {
			source = graphQuestionID(sourceQuestionID)
		}
		addEdge(GraphEdge{ID: "derivation:" + id, Source: source, Target: graphRecordID(outputRecordID), RelationType: "produced", Label: "превращено в работу"})
	}
	if err := derivationRows.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить чтение происхождения")
		return
	}

	w.Header().Set("Server-Timing", fmt.Sprintf("graph;dur=%.2f", float64(time.Since(startedAt).Microseconds())/1000))
	writeJSON(w, http.StatusOK, GraphResponse{Nodes: nodes, Edges: edges, GeneratedAt: nowText()})
}

func graphRelationLabel(relationType string) string {
	labels := map[string]string{
		"related": "связано", "supports": "поддерживает", "depends_on": "зависит от",
		"result_of": "является результатом", "leads_to": "приводит к", "produced": "порождает",
		"evaluated_by": "оценивается по",
	}
	if label, ok := labels[relationType]; ok {
		return label
	}
	return strings.ReplaceAll(relationType, "_", " ")
}
