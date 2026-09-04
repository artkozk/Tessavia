package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func reviewHas(section personalReviewSection, id string) bool {
	for _, item := range section.Items {
		if item.SourceID == id {
			return true
		}
	}
	return false
}

func TestPersonalWeeklyReviewCollectsSourcesAndNeverMutatesThem(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "review.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, otherClient := testClient(t), testClient(t)
	owner := registerVerifiedWithoutFixture(t, ownerClient, server.URL, "review@example.test", "review_owner")
	registerVerifiedWithoutFixture(t, otherClient, server.URL, "review-other@example.test", "review_other")

	var project PersonalProject
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/projects", map[string]any{"title": "Личный запуск"}, http.StatusCreated, &project)
	var completed, stalled, orphan PersonalPlan
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{"title": "Готовый личный результат", "projectId": project.ID, "actualMinutes": 75}, http.StatusCreated, &completed)
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{"title": "Просроченное связанное дело", "projectId": project.ID}, http.StatusCreated, &stalled)
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{"title": "Давно несвязанное дело"}, http.StatusCreated, &orphan)

	now := time.Now().UTC()
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	old := now.AddDate(0, 0, -14).Format(time.RFC3339Nano)
	if _, err = store.db.Exec(`UPDATE personal_plans SET status='done',completed_at=?,actual_minutes=75,updated_at=? WHERE id=?`, nowText(), nowText(), completed.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.db.Exec(`UPDATE personal_plans SET due_at=?,created_at=?,updated_at=? WHERE id=?`, yesterday+"T09:00:00Z", old, old, stalled.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.db.Exec(`UPDATE personal_plans SET created_at=?,updated_at=? WHERE id=?`, old, old, orphan.ID); err != nil {
		t.Fatal(err)
	}

	var waiting personalWaiting
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/waiting?timezone=UTC", map[string]any{
		"title": "Получить ответ поставщика", "waitingFor": "Поставщик", "sinceDate": yesterday,
		"expectedDate": yesterday, "planId": stalled.ID, "requestKey": "weekly-review-waiting-0001",
	}, http.StatusCreated, &waiting)

	var habit PersonalHabit
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/habits", map[string]any{
		"title": "Читать", "startDate": today,
		"rule": map[string]any{"mode": "build", "cadence": "daily", "target": 1, "periodTarget": 1, "periodMeasure": "days", "interval": 1, "weekdays": []int{1, 2, 3, 4, 5}, "unit": "раз"},
	}, http.StatusCreated, &habit)
	requestJSON(t, ownerClient, http.MethodPut, server.URL+"/api/personal/habits/"+habit.ID+"/checkins/"+today, map[string]any{
		"value": 1, "state": "measured", "note": "Фактический результат", "revision": habit.Revision,
	}, http.StatusOK, nil)

	var workspace Workspace
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Отдельный стартап"}, http.StatusCreated, &workspace)
	createRecord := func(kind, title string) Record {
		var record Record
		requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/records", workspace.ID, map[string]any{
			"type": kind, "title": title, "description": "Проверяемое содержание", "ownerId": owner.ID,
		}, http.StatusCreated, &record)
		return record
	}
	finished := createRecord("task", "Завершённая работа стартапа")
	if _, err = store.db.Exec(`UPDATE records SET status='completed',progress=100,result='Проверяемый результат',completed_at=?,updated_at=? WHERE id=?`, nowText(), nowText(), finished.ID); err != nil {
		t.Fatal(err)
	}
	decision := createRecord("decision", "Решение без следующего шага")
	decisionWithTask := createRecord("decision", "Решение со следующим шагом")
	next := createRecord("task", "Действие по решению")
	if _, err = store.db.Exec(`INSERT INTO record_links(id,source_id,target_id,relation_type,created_by,created_at) VALUES('review-next-link',?,?,'leads_to',?,?)`, decisionWithTask.ID, next.ID, owner.ID, nowText()); err != nil {
		t.Fatal(err)
	}
	risk := createRecord("risk", "Активный риск без действия")

	var review personalReviewResponse
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/review?week="+today+"&timezone=UTC", nil, http.StatusOK, &review)
	if len(review.WeekStart) != 10 || len(review.WeekEnd) != 10 || review.NextWeekStart <= review.WeekEnd {
		t.Fatalf("invalid week bounds: %+v", review)
	}
	if !reviewHas(review.CompletedPlans, completed.ID) || !reviewHas(review.CompletedRecords, finished.ID) || !reviewHas(review.HabitResults, habit.ID) {
		t.Fatal("review omitted a factual result")
	}
	for _, item := range review.HabitResults.Items {
		if item.SourceID == habit.ID && (item.Recorded != 1 || item.Success != 1 || item.TotalValue != 1) {
			t.Fatalf("habit review changed tracker facts: %+v", item)
		}
	}
	if !reviewHas(review.Waiting, waiting.ID) || !reviewHas(review.Stalled, stalled.ID) || !reviewHas(review.Unlinked, orphan.ID) {
		t.Fatal("review omitted a personal attention signal")
	}
	if !reviewHas(review.Decisions, decision.ID) || reviewHas(review.Decisions, decisionWithTask.ID) || !reviewHas(review.Risks, risk.ID) {
		t.Fatal("decision/risk next-action classification failed")
	}
	for _, item := range review.Decisions.Items {
		if item.SourceID == decision.ID && (item.WorkspaceID != workspace.ID || item.Workspace != workspace.Name) {
			t.Fatal("project context missing from decision")
		}
	}

	var beforeStatus, beforeDue, beforeUpdated string
	if err = store.db.QueryRow(`SELECT status,COALESCE(due_at,''),updated_at FROM personal_plans WHERE id=?`, stalled.ID).Scan(&beforeStatus, &beforeDue, &beforeUpdated); err != nil {
		t.Fatal(err)
	}
	choicePath := server.URL + "/api/personal/review/" + review.WeekStart + "/plan/" + stalled.ID
	input := map[string]any{"action": "next_week", "note": "Вернуться осознанно", "expectedRevision": 0, "requestKey": "weekly-review-choice-0001"}
	var choice personalReviewChoice
	requestJSON(t, ownerClient, http.MethodPut, choicePath, input, http.StatusOK, &choice)
	requestJSON(t, ownerClient, http.MethodPut, choicePath, input, http.StatusOK, &choice)
	requestJSON(t, ownerClient, http.MethodPut, choicePath, map[string]any{"action": "next_week", "note": "Вернуться осознанно", "expectedRevision": 1, "requestKey": "weekly-review-choice-noop-0001"}, http.StatusOK, &choice)
	if choice.Revision != 1 || choice.Action != "next_week" {
		t.Fatalf("choice replay changed revision: %+v", choice)
	}
	var events int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_review_choice_events WHERE choice_id=?`, choice.ID).Scan(&events)
	if events != 2 {
		t.Fatal("choice replay duplicated history")
	}
	requestJSON(t, ownerClient, http.MethodPut, server.URL+"/api/personal/review/"+review.WeekStart+"/waiting/"+waiting.ID, map[string]any{"action": "skip", "expectedRevision": 0, "requestKey": "weekly-review-choice-noop-0001"}, http.StatusConflict, nil)
	requestJSON(t, ownerClient, http.MethodPut, choicePath, map[string]any{"action": "fix", "expectedRevision": 0, "requestKey": "weekly-review-choice-0002"}, http.StatusConflict, nil)
	requestJSON(t, ownerClient, http.MethodPut, choicePath, map[string]any{"action": "fix", "expectedRevision": 1, "requestKey": "weekly-review-choice-0003"}, http.StatusOK, &choice)
	if choice.Revision != 2 || choice.Action != "fix" {
		t.Fatal("choice update failed")
	}
	var afterStatus, afterDue, afterUpdated string
	store.db.QueryRow(`SELECT status,COALESCE(due_at,''),updated_at FROM personal_plans WHERE id=?`, stalled.ID).Scan(&afterStatus, &afterDue, &afterUpdated)
	if beforeStatus != afterStatus || beforeDue != afterDue || beforeUpdated != afterUpdated {
		t.Fatal("review choice mutated its source plan")
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/review?week="+today+"&timezone=UTC", nil, http.StatusOK, &review)
	if review.Reviewed < 1 {
		t.Fatal("saved review choice not attached")
	}

	var otherReview personalReviewResponse
	requestJSON(t, otherClient, http.MethodGet, server.URL+"/api/personal/review?week="+today+"&timezone=UTC", nil, http.StatusOK, &otherReview)
	if otherReview.Candidates != 0 || otherReview.CompletedPlans.Total != 0 || otherReview.CompletedRecords.Total != 0 {
		t.Fatal("review leaked across accounts")
	}
	requestJSON(t, otherClient, http.MethodPut, choicePath, map[string]any{"action": "skip", "expectedRevision": 0, "requestKey": "weekly-review-foreign-0001"}, http.StatusNotFound, nil)

	if _, err = store.db.Exec(`DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspace.ID, owner.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/review?week="+today+"&timezone=UTC", nil, http.StatusOK, &review)
	if review.CompletedRecords.Total != 0 || review.Decisions.Total != 0 || review.Risks.Total != 0 {
		t.Fatal("revoked project access still visible in review")
	}
	requestJSON(t, ownerClient, http.MethodPut, server.URL+"/api/personal/review/"+review.WeekStart+"/record/"+risk.ID, map[string]any{"action": "fix", "expectedRevision": 0, "requestKey": "weekly-review-revoked-0001"}, http.StatusNotFound, nil)
}

func TestPersonalWeeklyReviewRejectsFutureWeekAndBoundsSections(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "review-bounds.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "review-bounds@example.test", "review_bounds")
	today := time.Now().UTC()
	future := today.AddDate(0, 0, 14).Format("2006-01-02")
	requestJSON(t, client, http.MethodGet, server.URL+"/api/personal/review?week="+future+"&timezone=UTC", nil, http.StatusBadRequest, nil)
	old := today.AddDate(0, 0, -30).Format(time.RFC3339Nano)
	for index := 0; index < personalReviewLimit+2; index++ {
		var plan PersonalPlan
		requestJSON(t, client, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{"title": "Ограниченное дело"}, http.StatusCreated, &plan)
		if _, err = store.db.Exec(`UPDATE personal_plans SET created_at=?,updated_at=? WHERE id=?`, old, old, plan.ID); err != nil {
			t.Fatal(err)
		}
	}
	var review personalReviewResponse
	requestJSON(t, client, http.MethodGet, server.URL+"/api/personal/review?timezone=UTC", nil, http.StatusOK, &review)
	if review.Unlinked.Total != personalReviewLimit+2 || len(review.Unlinked.Items) != personalReviewLimit || !review.Unlinked.HasMore {
		t.Fatalf("unlinked section is not bounded: %+v", review.Unlinked)
	}
}
