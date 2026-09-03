package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

func concurrentScoreStatuses(t *testing.T, clients []*http.Client, url string, bodies []map[string]any) []int {
	t.Helper()
	start, results := make(chan struct{}), make(chan int, len(clients))
	for i, client := range clients {
		payload, _ := json.Marshal(bodies[i])
		go func(client *http.Client, payload []byte) {
			<-start
			req, _ := http.NewRequest(http.MethodPut, url, bytes.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			response, err := client.Do(req)
			if err != nil {
				results <- 0
				return
			}
			io.Copy(io.Discard, response.Body)
			response.Body.Close()
			results <- response.StatusCode
		}(client, payload)
	}
	close(start)
	statuses := make([]int, 0, len(clients))
	for range clients {
		statuses = append(statuses, <-results)
	}
	sort.Ints(statuses)
	return statuses
}

func TestPersonalCriterionScoresAndExplicitDecision(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "scores.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, partnerClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "score-owner@example.test", "score_owner")
	partner := register(t, partnerClient, server.URL, "score-partner@example.test", "score_partner")
	criterion := createRecord(t, ownerClient, server.URL, map[string]any{"type": "criterion", "title": "Спрос"})
	idea := createRecord(t, ownerClient, server.URL, map[string]any{"type": "idea", "title": "Новый продукт"})
	url := server.URL + "/api/records/" + idea.ID + "/criteria/" + criterion.ID
	requestJSON(t, ownerClient, http.MethodPut, url, map[string]any{"note": "Значение отсутствует"}, http.StatusBadRequest, nil)
	requestJSON(t, ownerClient, http.MethodPut, url, map[string]any{"score": 0}, http.StatusBadRequest, nil)
	statuses := concurrentScoreStatuses(t, []*http.Client{ownerClient, partnerClient}, url, []map[string]any{{"score": 0, "note": "Нет спроса", "expectedUpdatedAt": ""}, {"score": 8, "note": "Есть интервью", "expectedUpdatedAt": ""}})
	if statuses[0] != 200 || statuses[1] != 200 {
		t.Fatalf("independent votes: %v", statuses)
	}
	read := func() ([]CriterionScore, []CriterionDecision) {
		var result struct {
			Scores    []CriterionScore    `json:"scores"`
			Decisions []CriterionDecision `json:"scoreDecisions"`
		}
		requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/records/"+idea.ID+"/relations", nil, http.StatusOK, &result)
		return result.Scores, result.Decisions
	}
	scores, decisions := read()
	if len(scores) != 2 || len(decisions) != 0 {
		t.Fatalf("votes must remain separate: %#v %#v", scores, decisions)
	}
	var own, other CriterionScore
	for _, score := range scores {
		if score.EvaluatedBy == owner.ID {
			own = score
		} else if score.EvaluatedBy == partner.ID {
			other = score
		}
	}
	if own.Score != 0 || own.Note != "Нет спроса" || other.Score != 8 {
		t.Fatalf("votes changed: %#v", scores)
	}
	requestJSON(t, ownerClient, http.MethodPut, url, map[string]any{"score": 2, "note": "Нет версии"}, http.StatusConflict, nil)
	statuses = concurrentScoreStatuses(t, []*http.Client{ownerClient, ownerClient}, url, []map[string]any{{"score": 2, "note": "Вкладка 1", "expectedUpdatedAt": own.UpdatedAt}, {"score": 3, "note": "Вкладка 2", "expectedUpdatedAt": own.UpdatedAt}})
	if statuses[0] != 200 || statuses[1] != 409 {
		t.Fatalf("same author stale write: %v", statuses)
	}
	scores, _ = read()
	for _, score := range scores {
		if score.EvaluatedBy == owner.ID {
			if score.ID != own.ID {
				t.Fatal("vote ID changed")
			}
			own = score
		}
		if score.EvaluatedBy == partner.ID && score != other {
			t.Fatal("partner vote was overwritten")
		}
	}
	// Even an editor cannot approve the result unless explicitly responsible for the decision.
	requestJSON(t, partnerClient, http.MethodPut, url+"/decision", map[string]any{"score": 6, "reason": "Позиция партнёра"}, http.StatusForbidden, nil)
	var detail struct {
		Record Record `json:"record"`
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/records/"+idea.ID, nil, 200, &detail)
	decisionBody := map[string]any{"score": 6, "reason": "Принято после обсуждения разногласий", "expectedUpdatedAt": "", "expectedRecordUpdatedAt": detail.Record.UpdatedAt, "expectedCriterionUpdatedAt": criterion.UpdatedAt}
	requestJSON(t, ownerClient, http.MethodPut, url+"/decision", decisionBody, 200, &decisions)
	if len(decisions) != 1 || decisions[0].Score != 6 || decisions[0].DecidedBy != owner.ID || decisions[0].NeedsReview {
		t.Fatalf("decision: %#v", decisions)
	}
	requestJSON(t, ownerClient, http.MethodPut, url+"/decision", decisionBody, 409, nil)
	// Withdrawing a vote leaves its history and invalidates the explicit result, without rewriting it.
	requestJSON(t, partnerClient, http.MethodDelete, url, map[string]any{"expectedUpdatedAt": other.UpdatedAt, "reason": "Интервью не подтвердились"}, 200, nil)
	scores, decisions = read()
	if len(scores) != 1 || scores[0].EvaluatedBy != owner.ID || decisions[0].Score != 6 || !decisions[0].NeedsReview {
		t.Fatalf("withdrawal: %#v %#v", scores, decisions)
	}
	var events int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_id=? AND action='criterion_score_withdrawn' AND json_extract(details_json,'$.before.score')=8`, idea.ID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if events != 1 {
		t.Fatal("withdrawal history missing")
	}
	requestJSON(t, ownerClient, http.MethodPut, url, map[string]any{"score": 11, "note": "Вне шкалы", "expectedUpdatedAt": own.UpdatedAt}, 400, nil)
	// Shared weight has its own record permissions and optimistic version.
	var weighted Record
	requestJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/records/"+criterion.ID, map[string]any{"criterionWeight": 0, "expectedUpdatedAt": criterion.UpdatedAt}, 200, &weighted)
	if weighted.CriterionWeight != 0 {
		t.Fatal("weight zero lost")
	}
	requestJSON(t, partnerClient, http.MethodPatch, server.URL+"/api/records/"+criterion.ID, map[string]any{"criterionWeight": 5, "expectedUpdatedAt": criterion.UpdatedAt}, 409, nil)
	requestJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/records/"+criterion.ID, map[string]any{"criterionWeight": -1, "expectedUpdatedAt": weighted.UpdatedAt}, 400, nil)
	requestJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/records/"+criterion.ID, map[string]any{"editPolicy": "owner_only", "expectedUpdatedAt": weighted.UpdatedAt}, 200, &weighted)
	requestJSON(t, partnerClient, http.MethodPatch, server.URL+"/api/records/"+criterion.ID, map[string]any{"criterionWeight": 3, "expectedUpdatedAt": weighted.UpdatedAt}, 403, nil)
	// A fresh decision can be explicitly reapproved; a later criterion edit marks it stale again.
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/records/"+idea.ID, nil, 200, &detail)
	decisionBody["expectedUpdatedAt"], decisionBody["expectedRecordUpdatedAt"], decisionBody["expectedCriterionUpdatedAt"] = decisions[0].UpdatedAt, detail.Record.UpdatedAt, weighted.UpdatedAt
	requestJSON(t, ownerClient, http.MethodPut, url+"/decision", decisionBody, 200, &decisions)
	if decisions[0].NeedsReview {
		t.Fatal("explicit reconsideration still stale")
	}
	requestJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/records/"+criterion.ID, map[string]any{"criterionWeight": 2, "expectedUpdatedAt": weighted.UpdatedAt}, 200, &weighted)
	_, decisions = read()
	if !decisions[0].NeedsReview {
		t.Fatal("changed criterion not flagged")
	}
	var export struct {
		Tables map[string][]map[string]any `json:"tables"`
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/export", nil, 200, &export)
	if len(export.Tables["criterionScores"]) != 1 || len(export.Tables["criterionDecisions"]) != 1 {
		t.Fatal("export omits score or decision")
	}
	// Another project cannot read or modify this pair.
	var private Workspace
	requestJSON(t, partnerClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Другой проект"}, 201, &private)
	requestWorkspaceJSON(t, partnerClient, http.MethodPut, url, private.ID, map[string]any{"score": 9, "note": "Чужой проект"}, 404, nil)
	requestWorkspaceJSON(t, partnerClient, http.MethodGet, server.URL+"/api/records/"+idea.ID+"/relations", private.ID, nil, 404, nil)
}

func TestPersonalCriterionMigrationPreservesLegacyVote(t *testing.T) {
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "legacy.db"))+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	store := &Store{db: db}
	if _, err = db.Exec(`CREATE TABLE schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "032_personal_criterion_scores.sql" {
			continue
		}
		body, _ := migrationFiles.ReadFile("migrations/" + entry.Name())
		if _, err = db.Exec(string(body)); err != nil {
			t.Fatalf("%s: %v", entry.Name(), err)
		}
		if _, err = db.Exec(`INSERT INTO schema_migrations VALUES(?,?)`, entry.Name(), nowText()); err != nil {
			t.Fatal(err)
		}
		if entry.Name() == "001_init.sql" {
			_, err = db.Exec(`INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'old@example.test','old','unused','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z');
			INSERT INTO records(id,type,title,status,author_id,owner_id,created_at,updated_at) VALUES('old-idea','idea','Idea','inbox',1,1,'2020','2020'),('old-criterion','criterion','Criterion','main',1,1,'2020','2020');
			INSERT INTO criterion_scores VALUES('old-vote','old-idea','old-criterion',0,'Старая оценка с обоснованием',1,'2020-01-01T00:00:00Z','2020-01-02T00:00:00Z')`)
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	if err = store.migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	var id, note, created, updated string
	var score int
	var author int64
	if err = db.QueryRow(`SELECT id,score,note,evaluated_by,created_at,updated_at FROM criterion_scores`).Scan(&id, &score, &note, &author, &created, &updated); err != nil {
		t.Fatal(err)
	}
	if id != "old-vote" || score != 0 || note != "Старая оценка с обоснованием" || author != 1 || created != "2020-01-01T00:00:00Z" || updated != "2020-01-02T00:00:00Z" {
		t.Fatal("migration changed legacy vote")
	}
	var weight float64
	db.QueryRow(`SELECT criterion_weight FROM records WHERE id='old-criterion'`).Scan(&weight)
	if weight != 1 {
		t.Fatal("initial weight must be one")
	}
	if _, err = db.Exec(`INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(2,'second@example.test','second','unused','2020','2020'); INSERT INTO criterion_scores VALUES('second-vote','old-idea','old-criterion',10,'Другой участник',2,'2021','2021')`); err != nil {
		t.Fatal("independent author rejected:", err)
	}
	if _, err = db.Exec(`INSERT INTO criterion_scores VALUES('duplicate-vote','old-idea','old-criterion',1,'Дубль автора',1,'2021','2021')`); err == nil {
		t.Fatal("same-author duplicate allowed")
	}
	if err = store.migrate(context.Background()); err != nil {
		t.Fatal("migration not repeatable:", err)
	}
}
