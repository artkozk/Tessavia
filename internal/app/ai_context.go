package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

const aiContextTextBudget = 180000

type AIContextCoverage struct {
	Sections         int  `json:"sections"`
	ResearchOptions  int  `json:"researchOptions"`
	ResearchFields   int  `json:"researchFields"`
	Relations        int  `json:"relations"`
	CriterionScores  int  `json:"criterionScores"`
	Questions        int  `json:"questions"`
	Answers          int  `json:"answers"`
	Decisions        int  `json:"decisions"`
	ChecklistItems   int  `json:"checklistItems"`
	Proofs           int  `json:"proofs"`
	Comments         int  `json:"comments"`
	Attachments      int  `json:"attachments"`
	HistoryEvents    int  `json:"historyEvents"`
	ContextTruncated bool `json:"contextTruncated"`
}

type aiTextBudget struct {
	remaining int
	truncated bool
}

func newAITextBudget() *aiTextBudget {
	return &aiTextBudget{remaining: aiContextTextBudget}
}

func (b *aiTextBudget) take(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || b.remaining <= 0 {
		if value != "" {
			b.truncated = true
		}
		return ""
	}
	runes := []rune(value)
	if len(runes) <= b.remaining {
		b.remaining -= len(runes)
		return value
	}
	b.truncated = true
	result := string(runes[:b.remaining])
	b.remaining = 0
	return result + "\n[контекст сокращён системой]"
}

func (s *Server) buildAIRecordContext(ctx context.Context, record Record) (map[string]any, AIContextCoverage, error) {
	budget := newAITextBudget()
	coverage := AIContextCoverage{}
	dossier := map[string]any{
		"record": map[string]any{
			"id": record.ID, "type": record.Type, "kind": record.Kind, "title": budget.take(record.Title),
			"description": budget.take(record.Description), "status": record.Status, "dueAt": record.DueAt,
			"priority": record.Priority, "workstream": record.Workstream, "editPolicy": record.EditPolicy,
			"author": record.AuthorUsername, "owner": record.OwnerUsername, "decisionMaker": record.DecisionMakerName,
			"parentId": record.ParentID, "isRoot": record.IsRoot, "estimateMinutes": record.EstimateMinutes,
			"actualMinutes": record.ActualMinutes, "progress": record.Progress,
			"progressNote": budget.take(record.ProgressNote), "result": budget.take(record.Result),
			"createdAt": record.CreatedAt, "updatedAt": record.UpdatedAt,
		},
	}

	sections, err := s.listSections(ctx, record)
	if err != nil {
		return nil, coverage, err
	}
	sectionContext := make([]map[string]any, 0, len(sections))
	for _, section := range sections {
		if strings.TrimSpace(section.Content) == "" {
			continue
		}
		sectionContext = append(sectionContext, map[string]any{
			"title": budget.take(section.Title), "content": budget.take(section.Content),
			"updatedBy": section.UpdatedByName, "updatedAt": section.UpdatedAt,
		})
	}
	coverage.Sections = len(sectionContext)
	dossier["sections"] = sectionContext

	if record.Type == "research" {
		comparison, loadErr := s.listResearchComparison(ctx, record.ID)
		if loadErr != nil {
			return nil, coverage, loadErr
		}
		coverage.ResearchFields = len(comparison.Fields)
		coverage.ResearchOptions = len(comparison.Options)
		fieldsByID := make(map[string]ResearchOptionField, len(comparison.Fields))
		fieldContext := make([]map[string]any, 0, len(comparison.Fields))
		for _, field := range comparison.Fields {
			fieldsByID[field.ID] = field
			fieldContext = append(fieldContext, map[string]any{"id": field.ID, "name": budget.take(field.Name), "type": field.FieldType})
		}
		optionContext := make([]map[string]any, 0, len(comparison.Options))
		for _, option := range comparison.Options {
			values := make([]map[string]string, 0, len(option.Values))
			for fieldID, value := range option.Values {
				field := fieldsByID[fieldID]
				values = append(values, map[string]string{"field": budget.take(field.Name), "type": field.FieldType, "value": budget.take(value)})
			}
			optionContext = append(optionContext, map[string]any{
				"id": option.ID, "title": budget.take(option.Title), "rating": option.Rating,
				"summary": budget.take(option.SummaryMD), "pros": budget.take(option.ProsMD),
				"cons": budget.take(option.ConsMD), "notes": budget.take(option.NotesMD), "values": values,
				"updatedBy": option.UpdatedByUsername, "updatedAt": option.UpdatedAt,
			})
		}
		dossier["researchComparison"] = map[string]any{"fields": fieldContext, "options": optionContext}
	}

	links, err := s.listLinks(ctx, record.ID)
	if err != nil {
		return nil, coverage, err
	}
	linkContext := make([]map[string]any, 0, len(links))
	for _, link := range links {
		direction := "outgoing"
		if link.TargetID == record.ID {
			direction = "incoming"
		}
		linkContext = append(linkContext, map[string]any{
			"direction": direction, "relationType": link.RelationType, "recordId": link.Record.ID,
			"type": link.Record.Type, "kind": link.Record.Kind, "title": budget.take(link.Record.Title),
			"description": budget.take(link.Record.Description), "status": link.Record.Status,
		})
	}
	coverage.Relations = len(linkContext)
	dossier["relations"] = linkContext

	scores, err := s.listScores(ctx, record.ID)
	if err != nil {
		return nil, coverage, err
	}
	scoreContext := make([]map[string]any, 0, len(scores))
	for _, score := range scores {
		scoreContext = append(scoreContext, map[string]any{
			"criterionId": score.CriterionID, "criterion": budget.take(score.CriterionTitle),
			"score": score.Score, "note": budget.take(score.Note), "evaluatedBy": score.EvaluatorUsername,
		})
	}
	coverage.CriterionScores = len(scoreContext)
	dossier["criterionScores"] = scoreContext

	if record.Type == "question_set" {
		workflow, loadErr := s.listQuestionWorkflow(ctx, record.ID)
		if loadErr != nil {
			return nil, coverage, loadErr
		}
		questionContext := make([]map[string]any, 0, len(workflow.Questions))
		for _, question := range workflow.Questions {
			answers := make([]map[string]any, 0, len(question.Answers))
			for _, answer := range question.Answers {
				answers = append(answers, map[string]any{"author": answer.AuthorUsername, "content": budget.take(answer.Content), "updatedAt": answer.UpdatedAt})
			}
			coverage.Answers += len(answers)
			var decision any
			if question.Decision != nil {
				coverage.Decisions++
				decision = map[string]any{"content": budget.take(question.Decision.Content), "decidedBy": question.Decision.DecidedByUsername, "updatedAt": question.Decision.UpdatedAt}
			}
			questionContext = append(questionContext, map[string]any{
				"id": question.ID, "question": budget.take(question.Body), "status": question.Status,
				"answers": answers, "decision": decision, "outputs": question.Outputs,
			})
		}
		coverage.Questions = len(questionContext)
		dossier["questionWorkflow"] = map[string]any{"questions": questionContext, "founders": workflow.UserCount}
	}

	comments, err := s.listComments(ctx, record.ID)
	if err != nil {
		return nil, coverage, err
	}
	commentContext := make([]map[string]any, 0, min(30, len(comments)))
	start := max(0, len(comments)-30)
	for _, comment := range comments[start:] {
		commentContext = append(commentContext, map[string]any{"author": comment.AuthorUsername, "body": budget.take(comment.Body), "createdAt": comment.CreatedAt})
	}
	coverage.Comments = len(comments)
	dossier["recentComments"] = commentContext

	checklist, err := s.listChecklist(ctx, record.ID)
	if err != nil {
		return nil, coverage, err
	}
	checklistContext := make([]map[string]any, 0, len(checklist))
	for _, item := range checklist {
		checklistContext = append(checklistContext, map[string]any{
			"title": budget.take(item.Title), "owner": item.OwnerUsername, "status": item.Status,
			"proof": budget.take(item.ProofText), "updatedAt": item.UpdatedAt,
		})
	}
	coverage.ChecklistItems = len(checklistContext)
	dossier["checklist"] = checklistContext

	proofs, err := s.listProofs(ctx, record.ID)
	if err != nil {
		return nil, coverage, err
	}
	proofContext := make([]map[string]any, 0, len(proofs))
	for _, proof := range proofs {
		proofContext = append(proofContext, map[string]any{"author": proof.AuthorUsername, "kind": proof.Kind, "content": budget.take(proof.Content), "createdAt": proof.CreatedAt})
	}
	coverage.Proofs = len(proofContext)
	dossier["proofs"] = proofContext

	attachments, err := s.listAttachments(ctx, record.ID)
	if err != nil {
		return nil, coverage, err
	}
	attachmentContext := make([]map[string]any, 0, len(attachments))
	for _, attachment := range attachments {
		attachmentContext = append(attachmentContext, map[string]any{
			"name": budget.take(attachment.OriginalName), "contentType": attachment.ContentType,
			"sizeBytes": attachment.SizeBytes, "uploadedBy": attachment.UploaderUsername, "createdAt": attachment.CreatedAt,
		})
	}
	coverage.Attachments = len(attachmentContext)
	dossier["attachmentsMetadata"] = attachmentContext

	var origin RecordDerivation
	err = s.store.db.QueryRowContext(ctx, `
		SELECT d.source_record_id, source.title, COALESCE(d.source_question_id, ''), COALESCE(q.body, ''),
			COALESCE(d.source_decision_id, ''), d.source_excerpt, d.created_at
		FROM record_derivations d
		JOIN records source ON source.id = d.source_record_id
		LEFT JOIN question_items q ON q.id = d.source_question_id
		WHERE d.output_record_id = ?`, record.ID).Scan(&origin.SourceRecordID, &origin.SourceRecordTitle, &origin.SourceQuestionID, &origin.QuestionBody, &origin.SourceDecisionID, &origin.DecisionContent, &origin.CreatedAt)
	if err == nil {
		dossier["origin"] = map[string]any{
			"sourceRecordId": origin.SourceRecordID, "sourceRecordTitle": budget.take(origin.SourceRecordTitle),
			"question": budget.take(origin.QuestionBody), "decision": budget.take(origin.DecisionContent), "createdAt": origin.CreatedAt,
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, coverage, err
	}

	historyRows, err := s.store.db.QueryContext(ctx, `
		SELECT u.username, a.action, a.details_json, a.reason, a.created_at
		FROM activity a JOIN users u ON u.id = a.actor_id
		WHERE a.entity_id = ? ORDER BY a.created_at DESC LIMIT 30`, record.ID)
	if err != nil {
		return nil, coverage, err
	}
	history := make([]map[string]any, 0, 30)
	for historyRows.Next() {
		var actor, action, detailsJSON, reason, createdAt string
		if scanErr := historyRows.Scan(&actor, &action, &detailsJSON, &reason, &createdAt); scanErr != nil {
			historyRows.Close()
			return nil, coverage, scanErr
		}
		var details any
		if json.Unmarshal([]byte(detailsJSON), &details) != nil {
			details = budget.take(detailsJSON)
		} else {
			normalized, _ := json.Marshal(details)
			details = budget.take(string(normalized))
		}
		history = append(history, map[string]any{"actor": actor, "action": action, "reason": budget.take(reason), "details": details, "createdAt": createdAt})
	}
	if err := historyRows.Close(); err != nil {
		return nil, coverage, err
	}
	if err := historyRows.Err(); err != nil {
		return nil, coverage, err
	}
	coverage.HistoryEvents = len(history)
	dossier["recentHistory"] = history

	coverage.ContextTruncated = budget.truncated
	dossier["coverage"] = coverage
	return dossier, coverage, nil
}
