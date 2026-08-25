package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestBusinessMemoryLifecycleAndSafeUndo(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "business-memory.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "founder@example.test", "founder")

	inbox := createRecord(t, client, server.URL, map[string]any{
		"type": "inbox", "title": "Проверить спрос через лендинг", "description": "Сырая мысль без выбранного типа",
	})
	if inbox.Type != "inbox" || inbox.Status != "inbox" {
		t.Fatalf("inbox = %#v", inbox)
	}
	var hypothesis Record
	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+inbox.ID+"/triage", map[string]any{
		"targetType": "hypothesis", "reason": "Мысль сформулирована как проверяемое предположение",
	}, http.StatusOK, &hypothesis)
	if hypothesis.ID != inbox.ID || hypothesis.Type != "hypothesis" || hypothesis.BusinessDetails == nil || hypothesis.BusinessDetails.Verdict != "pending" {
		t.Fatalf("triaged hypothesis = %#v", hypothesis)
	}
	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+inbox.ID+"/triage", map[string]any{
		"targetType": "task", "reason": "Повторный разбор не должен менять уже назначенный тип",
	}, http.StatusConflict, nil)

	var confirmed Record
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/"+hypothesis.ID, map[string]any{
		"status": "completed", "result": "Лендинг дал 14 заявок за неделю", "reason": "Порог успеха достигнут",
		"expectedUpdatedAt": hypothesis.UpdatedAt,
		"businessDetails": map[string]any{
			"metric": "Количество заявок", "successThreshold": "Не менее 10 за неделю",
			"experimentMethod": "Запустить лендинг на тестовом трафике", "verdict": "confirmed",
		},
	}, http.StatusOK, &confirmed)
	if confirmed.Status != "completed" || confirmed.BusinessDetails == nil || confirmed.BusinessDetails.Verdict != "confirmed" {
		t.Fatalf("confirmed hypothesis = %#v", confirmed)
	}
	var searchResults []SearchResult
	requestJSON(t, client, http.MethodGet, server.URL+"/api/search?q=%D0%9A%D0%BE%D0%BB%D0%B8%D1%87%D0%B5%D1%81%D1%82%D0%B2%D0%BE%20%D0%B7%D0%B0%D1%8F%D0%B2%D0%BE%D0%BA", nil, http.StatusOK, &searchResults)
	foundHypothesis := false
	for _, result := range searchResults {
		if result.RecordID == hypothesis.ID {
			foundHypothesis = true
			break
		}
	}
	if !foundHypothesis {
		t.Fatal("business details must be available in global search")
	}

	experiment := createRecord(t, client, server.URL, map[string]any{
		"type": "experiment", "title": "Проверить ручной прогресс эксперимента",
		"businessDetails": map[string]any{"metric": "Ответы", "successThreshold": "5 ответов", "experimentMethod": "Провести интервью"},
	})
	var runningExperiment Record
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/"+experiment.ID, map[string]any{
		"status": "in_progress", "progress": 37, "reason": "Начали проверку", "expectedUpdatedAt": experiment.UpdatedAt,
	}, http.StatusOK, &runningExperiment)
	if runningExperiment.Progress != 37 {
		t.Fatalf("experiment progress = %d, want manually tracked 37", runningExperiment.Progress)
	}

	previousDecision := createRecord(t, client, server.URL, map[string]any{
		"type": "decision", "title": "Использовать ручной учёт", "description": "Временное решение на старте",
	})
	replacement := createRecord(t, client, server.URL, map[string]any{
		"type": "decision", "title": "Перейти на BizFlow", "description": "Рабочая память хранится в платформе",
		"businessDetails": map[string]any{"decisionState": "active", "supersedesId": previousDecision.ID},
	})
	if replacement.BusinessDetails == nil || replacement.BusinessDetails.SupersedesID == nil || *replacement.BusinessDetails.SupersedesID != previousDecision.ID {
		t.Fatalf("replacement decision = %#v", replacement)
	}
	var replaced Record
	requestJSON(t, client, http.MethodGet, server.URL+"/api/records/"+previousDecision.ID, nil, http.StatusOK, &struct {
		Record *Record `json:"record"`
	}{Record: &replaced})
	if replaced.BusinessDetails == nil || replaced.BusinessDetails.DecisionState != "superseded" {
		t.Fatalf("replaced decision lifecycle = %#v", replaced.BusinessDetails)
	}
	var replacementAudit int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_id = ? AND action = 'business_details_updated'`, previousDecision.ID).Scan(&replacementAudit); err != nil || replacementAudit != 1 {
		t.Fatalf("replacement decision audit count = %d, err = %v", replacementAudit, err)
	}
	var graph GraphResponse
	requestJSON(t, client, http.MethodGet, server.URL+"/api/graph", nil, http.StatusOK, &graph)
	foundReplacementEdge := false
	for _, edge := range graph.Edges {
		if edge.Source == graphRecordID(replacement.ID) && edge.Target == graphRecordID(previousDecision.ID) && edge.RelationType == "supersedes" {
			foundReplacementEdge = true
			break
		}
	}
	if !foundReplacementEdge {
		t.Fatal("decision replacement must be visible as a graph edge")
	}

	task := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Проверить отмену этапа"})
	var started Record
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/"+task.ID, map[string]any{
		"status": "in_progress", "reason": "Начали работу", "expectedUpdatedAt": task.UpdatedAt,
	}, http.StatusOK, &started)
	var activityID string
	if err := store.db.QueryRow(`SELECT id FROM activity WHERE entity_id = ? AND action = 'updated' ORDER BY created_at DESC LIMIT 1`, task.ID).Scan(&activityID); err != nil {
		t.Fatalf("find update activity: %v", err)
	}
	var undone Record
	requestJSON(t, client, http.MethodPost, server.URL+"/api/activity/"+activityID+"/undo", map[string]any{}, http.StatusOK, &undone)
	if undone.Status != "planned" {
		t.Fatalf("undone status = %q, want planned", undone.Status)
	}
	requestJSON(t, client, http.MethodPost, server.URL+"/api/activity/"+activityID+"/undo", map[string]any{}, http.StatusConflict, nil)
}

func TestActiveDependencyBlockersAndKnowledgeMetadata(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "blockers-and-knowledge.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "founder@example.test", "founder")

	blocker := createRecord(t, client, server.URL, map[string]any{
		"type": "task", "title": "Получить исходные данные",
	})
	dependent := createRecord(t, client, server.URL, map[string]any{
		"type": "task", "title": "Собрать финансовую модель",
	})
	var links []RecordLink
	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+dependent.ID+"/links", map[string]any{
		"targetId": blocker.ID, "relationType": "depends_on", "reason": "Без исходных данных расчёт недостоверен",
	}, http.StatusCreated, &links)

	var detail struct {
		Record Record `json:"record"`
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/records/"+dependent.ID, nil, http.StatusOK, &detail)
	if len(detail.Record.Blockers) != 1 || detail.Record.Blockers[0].ID != blocker.ID {
		t.Fatalf("active blockers = %#v, want blocker %s", detail.Record.Blockers, blocker.ID)
	}
	if _, err := store.db.Exec(`UPDATE records SET status = 'completed', progress = 100, completed_at = ?, updated_at = ? WHERE id = ?`, nowText(), nowText(), blocker.ID); err != nil {
		t.Fatalf("complete blocker: %v", err)
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/records/"+dependent.ID, nil, http.StatusOK, &detail)
	if len(detail.Record.Blockers) != 0 {
		t.Fatalf("completed dependency must not block work: %#v", detail.Record.Blockers)
	}

	reviewAt := "2026-09-30T12:00:00Z"
	criterion := createRecord(t, client, server.URL, map[string]any{
		"type": "criterion", "kind": "limitation", "title": "Не работать в постоянном холоде",
		"businessDetails": map[string]any{
			"applicability": "Оценка бизнес-направлений и операционных моделей",
			"sourceExcerpt": "Оба основателя исключили постоянную работу в холоде.",
			"reviewAt":      reviewAt,
		},
	})
	if criterion.BusinessDetails == nil || criterion.BusinessDetails.Applicability == "" || criterion.BusinessDetails.SourceExcerpt == "" || criterion.BusinessDetails.ReviewAt == nil {
		t.Fatalf("criterion metadata = %#v", criterion.BusinessDetails)
	}
	var searchResults []SearchResult
	requestJSON(t, client, http.MethodGet, server.URL+"/api/search?q=%D0%BF%D0%BE%D1%81%D1%82%D0%BE%D1%8F%D0%BD%D0%BD%D1%83%D1%8E%20%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%83%20%D0%B2%20%D1%85%D0%BE%D0%BB%D0%BE%D0%B4%D0%B5", nil, http.StatusOK, &searchResults)
	if len(searchResults) == 0 || searchResults[0].RecordID != criterion.ID {
		t.Fatalf("knowledge source excerpt missing from search: %#v", searchResults)
	}
}
