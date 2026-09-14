package app

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestPersonalParentReferenceRequiresOwnerOnPatch(t *testing.T) {
	_, server, owner, other := newPersonalPlanningFixture(t)
	var mine, foreign PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "My plan"}, 201, &mine)
	requestJSON(t, other, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "PRIVATE OTHER PARENT"}, 201, &foreign)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+mine.ID, map[string]any{
		"title": "Must not be saved", "status": "planned", "parentId": foreign.ID, "expectedUpdatedAt": mine.UpdatedAt,
	}, 400, nil)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	if len(overview.Plans) != 1 || !reflect.DeepEqual(overview.Plans[0], mine) {
		t.Fatal("invalid parent changed the plan")
	}
}

func TestPersonalHistoricalContainerReferencesRemainEditable(t *testing.T) {
	for _, archived := range []string{"project", "goal", "parent"} {
		t.Run(archived, func(t *testing.T) {
			_, server, owner, other := newPersonalPlanningFixture(t)
			var project PersonalProject
			requestJSON(t, owner, "POST", server.URL+"/api/personal/projects", map[string]any{"title": "My project"}, 201, &project)
			var goal PersonalGoal
			requestJSON(t, owner, "POST", server.URL+"/api/personal/goals", map[string]any{"title": "My goal", "projectId": project.ID}, 201, &goal)
			var parent, plan PersonalPlan
			requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Parent"}, 201, &parent)
			requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Retained plan", "goalId": goal.ID, "parentId": parent.ID}, 201, &plan)
			archivePath := map[string]string{"project": "projects/" + project.ID, "goal": "goals/" + goal.ID, "parent": "plans/" + parent.ID}[archived]
			requestJSON(t, owner, "DELETE", server.URL+"/api/personal/"+archivePath, nil, 204, nil)
			original := plan
			requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{
				"title": "Completed after archive", "status": "done", "expectedUpdatedAt": plan.UpdatedAt,
			}, 200, &plan)
			if plan.ProjectID != original.ProjectID || plan.GoalID != original.GoalID || plan.ParentID != original.ParentID || plan.Status != "done" {
				t.Fatal("historical reference was silently changed")
			}
			requestJSON(t, other, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": "Other account", "status": "done"}, http.StatusNotFound, nil)
		})
	}
}

func TestPersonalReferencesRejectNewArchiveLinksAndExposeOnlyRelatedOwnLabels(t *testing.T) {
	store, server, owner, other := newPersonalPlanningFixture(t)
	create := func(t *testing.T, client *http.Client, title string) (PersonalProject, PersonalGoal, PersonalPlan) {
		t.Helper()
		var p PersonalProject
		var g PersonalGoal
		var parent PersonalPlan
		requestJSON(t, client, "POST", server.URL+"/api/personal/projects", map[string]any{"title": title + " project", "notes": "PRIVATE NOTES MUST NOT ENTER LABELS"}, 201, &p)
		requestJSON(t, client, "POST", server.URL+"/api/personal/goals", map[string]any{"title": title + " goal", "projectId": p.ID}, 201, &g)
		requestJSON(t, client, "POST", server.URL+"/api/personal/plans", map[string]any{"title": title + " parent"}, 201, &parent)
		return p, g, parent
	}
	project, goal, parent := create(t, owner, "Related")
	unusedProject, unusedGoal, unusedParent := create(t, owner, "UNRELATED ARCHIVE")
	foreignProject, foreignGoal, foreignParent := create(t, other, "OTHER ACCOUNT SECRET")
	var retained, unlinked PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Existing linked plan", "goalId": goal.ID, "parentId": parent.ID}, 201, &retained)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "No links"}, 201, &unlinked)
	for _, item := range []struct{ path, id string }{
		{"projects", project.ID}, {"goals", goal.ID}, {"plans", parent.ID},
		{"projects", unusedProject.ID}, {"goals", unusedGoal.ID}, {"plans", unusedParent.ID},
	} {
		requestJSON(t, owner, "DELETE", server.URL+"/api/personal/"+item.path+"/"+item.id, nil, 204, nil)
	}
	var overview, foreignOverview PersonalOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	wantLabels := PersonalHistoricalReferences{
		Projects: []PersonalReferenceLabel{{ID: project.ID, Title: project.Title}},
		Goals:    []PersonalReferenceLabel{{ID: goal.ID, Title: goal.Title}},
		Parents:  []PersonalReferenceLabel{{ID: parent.ID, Title: parent.Title}},
	}
	if !reflect.DeepEqual(overview.HistoricalReferences, wantLabels) || len(overview.Projects) != 0 || len(overview.Goals) != 0 {
		t.Fatal("historical labels leaked unrelated archives or became ordinary choices", overview.HistoricalReferences)
	}
	raw, _ := json.Marshal(overview.HistoricalReferences)
	if strings.Contains(string(raw), "NOTES") || strings.Contains(string(raw), "OTHER ACCOUNT") || strings.Contains(string(raw), "UNRELATED") {
		t.Fatal("historical labels disclose extra content")
	}
	requestJSON(t, other, "GET", server.URL+"/api/personal/overview", nil, 200, &foreignOverview)
	if len(foreignOverview.HistoricalReferences.Projects)+len(foreignOverview.HistoricalReferences.Goals)+len(foreignOverview.HistoricalReferences.Parents) != 0 {
		t.Fatal("another account received historical labels")
	}
	for _, invalid := range []struct{ field, id string }{
		{"projectId", project.ID}, {"goalId", goal.ID}, {"parentId", parent.ID},
		{"projectId", foreignProject.ID}, {"goalId", foreignGoal.ID}, {"parentId", foreignParent.ID},
		{"projectId", "missing_project"}, {"goalId", "missing_goal"}, {"parentId", "missing_parent"},
	} {
		body := map[string]any{"title": "New invalid plan", invalid.field: invalid.id}
		var failure map[string]string
		requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", body, 400, &failure)
		if strings.Contains(failure["error"], "OTHER ACCOUNT") {
			t.Fatal("invalid reference disclosed a foreign title")
		}
		body["status"], body["expectedUpdatedAt"] = "planned", unlinked.UpdatedAt
		requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+unlinked.ID, body, 400, nil)
	}
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	for _, p := range overview.Plans {
		if p.ID == unlinked.ID && !reflect.DeepEqual(p, unlinked) {
			t.Fatal("invalid reference wrote a partial update")
		}
	}
	// The old defect could already have stored this relationship. It must not
	// become trusted merely because the foreign ID equals the previous value.
	if _, err := store.db.Exec(`UPDATE personal_plans SET parent_id=? WHERE id=?`, foreignParent.ID, unlinked.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+unlinked.ID, map[string]any{"title": "Still invalid", "status": "planned", "expectedUpdatedAt": unlinked.UpdatedAt}, 400, nil)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+unlinked.ID, map[string]any{"title": "Explicitly repaired", "status": "planned", "parentId": "", "expectedUpdatedAt": unlinked.UpdatedAt}, 200, &unlinked)
	if unlinked.ParentID != "" {
		t.Fatal("explicit unlink did not repair the old foreign relationship")
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+retained.ID, map[string]any{
		"title": "Unlinked explicitly", "status": "planned", "projectId": "", "goalId": "", "parentId": "", "expectedUpdatedAt": retained.UpdatedAt,
	}, 200, &retained)
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	if len(overview.HistoricalReferences.Projects)+len(overview.HistoricalReferences.Goals)+len(overview.HistoricalReferences.Parents) != 0 {
		t.Fatal("unreferenced archives stayed exposed in the overview")
	}
}

func TestPersonalReferencesValidateInheritedProjectAndCyclesThroughArchive(t *testing.T) {
	store, server, owner, other := newPersonalPlanningFixture(t)
	owner.Timeout = 3 * time.Second // Regression must fail promptly if a CTE loops.
	var project PersonalProject
	var goal PersonalGoal
	requestJSON(t, owner, "POST", server.URL+"/api/personal/projects", map[string]any{"title": "Archived project"}, 201, &project)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/goals", map[string]any{"title": "Still active goal", "projectId": project.ID}, 201, &goal)
	requestJSON(t, owner, "DELETE", server.URL+"/api/personal/projects/"+project.ID, nil, 204, nil)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "No archive through inheritance", "goalId": goal.ID}, 400, nil)
	var a, b, c, foreign PersonalPlan
	for _, target := range []*PersonalPlan{&a, &b, &c} {
		requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Owned node"}, 201, target)
	}
	requestJSON(t, other, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Foreign ancestor"}, 201, &foreign)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+b.ID, map[string]any{"title": b.Title, "status": "planned", "parentId": a.ID}, 200, &b)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+c.ID, map[string]any{"title": c.Title, "status": "planned", "parentId": b.ID}, 200, &c)
	requestJSON(t, owner, "DELETE", server.URL+"/api/personal/plans/"+b.ID, nil, 204, nil)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+a.ID, map[string]any{"title": a.Title, "status": "planned", "parentId": c.ID}, 400, nil)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+a.ID, map[string]any{"title": a.Title, "status": "planned", "parentId": a.ID}, 400, nil)
	// Simulate an old cycle B -> C -> B, which does not contain the edited A.
	if _, err := store.db.Exec(`UPDATE personal_plans SET parent_id=? WHERE id=?`, c.ID, b.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+a.ID, map[string]any{"title": a.Title, "status": "planned", "parentId": c.ID}, 400, nil)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Do not extend cycle", "parentId": c.ID}, 400, nil)
	// Traversal must also stop at a foreign ancestor without accepting its ID.
	if _, err := store.db.Exec(`UPDATE personal_plans SET parent_id=? WHERE id=?`, foreign.ID, b.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+a.ID, map[string]any{"title": a.Title, "status": "planned", "parentId": c.ID}, 400, nil)
	var after PersonalPlan
	if err := scanPersonalPlan(store.db.QueryRow(`SELECT `+personalPlanSelect+` FROM personal_plans WHERE id=?`, a.ID), &after); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(a, after) {
		t.Fatal("cycle checks partially changed the edited plan")
	}
}

func TestPersonalHistoricalReferencesContinueSeriesAndFutureInstances(t *testing.T) {
	_, server, owner, other := newPersonalPlanningFixture(t)
	var project PersonalProject
	var goal PersonalGoal
	var parent, first PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/projects", map[string]any{"title": "Series project"}, 201, &project)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/goals", map[string]any{"title": "Series goal", "projectId": project.ID}, 201, &goal)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Series parent"}, 201, &parent)
	rule := map[string]any{"cadence": "daily", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-14", "untilDate": "2026-09-30"}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{
		"title": "Recurring plan", "goalId": goal.ID, "parentId": parent.ID, "recurrence": rule,
	}, 201, &first)
	for _, path := range []string{"projects/" + project.ID, "goals/" + goal.ID, "plans/" + parent.ID} {
		requestJSON(t, owner, "DELETE", server.URL+"/api/personal/"+path, nil, 204, nil)
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+first.ID, map[string]any{"title": first.Title, "status": "done", "expectedUpdatedAt": first.UpdatedAt}, 200, &first)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	second := onlyPlannedOccurrence(t, overview.Plans, "2026-09-15")
	assertLinks := func(t *testing.T, p PersonalPlan) {
		t.Helper()
		if p.ProjectID != project.ID || p.GoalID != goal.ID || p.ParentID != parent.ID {
			t.Fatal("series lost historical links", p)
		}
	}
	assertLinks(t, second)
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/plans/"+second.ID+"/series", map[string]any{
		"title": "Updated retained series", "notes": "Keep historical links", "recurrence": rule,
		"expectedUpdatedAt": second.UpdatedAt, "expectedSeriesUpdatedAt": second.Recurrence.UpdatedAt,
	}, 200, &second)
	assertLinks(t, second)
	var future, repeated PersonalPlan
	materialize := server.URL + "/api/personal/series/" + first.SeriesID + "/occurrences"
	body := map[string]any{"date": "2026-09-20", "expectedSeriesUpdatedAt": second.Recurrence.UpdatedAt}
	requestJSON(t, owner, "POST", materialize, body, 201, &future)
	requestJSON(t, owner, "POST", materialize, body, 200, &repeated)
	if future.ID != repeated.ID {
		t.Fatal("materialization retry created another occurrence")
	}
	assertLinks(t, future)
	requestJSON(t, other, "POST", materialize, body, 404, nil)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans/"+second.ID+"/skip", map[string]any{"expectedUpdatedAt": second.UpdatedAt}, 200, &second)
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	third := onlyPlannedOccurrence(t, overview.Plans, "2026-09-16")
	assertLinks(t, third)
	if second.OccurrenceState != "skipped" {
		t.Fatal("skip became completion")
	}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "New manual archive", "goalId": goal.ID, "recurrence": rule}, 400, nil)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+third.ID, map[string]any{"title": "Stale historical edit", "status": "planned", "expectedUpdatedAt": first.UpdatedAt}, 409, nil)
}

func TestPersonalSeriesReferenceFailuresAreAtomicAndRepairable(t *testing.T) {
	store, server, owner, other := newPersonalPlanningFixture(t)
	var first, foreign PersonalPlan
	rule := map[string]any{"cadence": "daily", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-14"}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Series to repair", "recurrence": rule}, 201, &first)
	requestJSON(t, other, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "PRIVATE FOREIGN TEMPLATE PARENT"}, 201, &foreign)
	var oldTemplate string
	if err := store.db.QueryRow(`SELECT plan_json FROM personal_recurrence_templates WHERE series_id=?`, first.SeriesID).Scan(&oldTemplate); err != nil {
		t.Fatal(err)
	}
	var corrupt PersonalPlan
	if err := json.Unmarshal([]byte(oldTemplate), &corrupt); err != nil {
		t.Fatal(err)
	}
	corrupt.ParentID = foreign.ID
	corruptJSON, _ := json.Marshal(corrupt)
	if _, err := store.db.Exec(`UPDATE personal_recurrence_templates SET plan_json=? WHERE series_id=?`, string(corruptJSON), first.SeriesID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+first.ID, map[string]any{"title": "Must roll back", "status": "done", "expectedUpdatedAt": first.UpdatedAt}, 400, nil)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans/"+first.ID+"/skip", map[string]any{"expectedUpdatedAt": first.UpdatedAt}, 400, nil)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/series/"+first.SeriesID+"/occurrences", map[string]any{"date": "2026-09-20", "expectedSeriesUpdatedAt": first.Recurrence.UpdatedAt}, 400, nil)
	var after PersonalPlan
	var count int
	if err := scanPersonalPlan(store.db.QueryRow(`SELECT `+personalPlanSelect+` FROM personal_plans WHERE id=?`, first.ID), &after); err != nil {
		t.Fatal(err)
	}
	expected := first
	expected.Recurrence = nil
	if !reflect.DeepEqual(after, expected) {
		t.Fatal("invalid template partially completed, skipped or changed current plan")
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM personal_recurrence_instances WHERE series_id=?`, first.SeriesID).Scan(&count); err != nil || count != 1 {
		t.Fatal("invalid template left a new occurrence or mapping", count, err)
	}
	var retainedTemplate string
	if err := store.db.QueryRow(`SELECT plan_json FROM personal_recurrence_templates WHERE series_id=?`, first.SeriesID).Scan(&retainedTemplate); err != nil || retainedTemplate != string(corruptJSON) {
		t.Fatal("invalid template was silently repaired", err)
	}
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/plans/"+first.ID+"/series", map[string]any{
		"title": "Explicitly repaired series", "parentId": "", "recurrence": rule,
		"expectedUpdatedAt": first.UpdatedAt, "expectedSeriesUpdatedAt": first.Recurrence.UpdatedAt,
	}, 200, &first)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+first.ID, map[string]any{"title": first.Title, "status": "done", "expectedUpdatedAt": first.UpdatedAt}, 200, &first)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	next := onlyPlannedOccurrence(t, overview.Plans, "2026-09-15")
	if next.ParentID != "" {
		t.Fatal("repaired template still propagated foreign data")
	}
}

func TestPersonalSeriesDoesNotAcquireNewArchivedReferenceFromException(t *testing.T) {
	store, server, owner, _ := newPersonalPlanningFixture(t)
	var first, parent PersonalPlan
	rule := map[string]any{"cadence": "daily", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-14"}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Series without parent", "recurrence": rule}, 201, &first)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Exception parent"}, 201, &parent)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+first.ID, map[string]any{"title": "Single exception", "status": "planned", "parentId": parent.ID, "expectedUpdatedAt": first.UpdatedAt}, 200, &first)
	requestJSON(t, owner, "DELETE", server.URL+"/api/personal/plans/"+parent.ID, nil, 204, nil)
	var beforeTemplate, beforeRule string
	if err := store.db.QueryRow(`SELECT plan_json FROM personal_recurrence_templates WHERE series_id=?`, first.SeriesID).Scan(&beforeTemplate); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT updated_at FROM personal_recurrence_rules WHERE series_id=?`, first.SeriesID).Scan(&beforeRule); err != nil {
		t.Fatal(err)
	}
	// It is historical for this one exception, but new for the saved template.
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/plans/"+first.ID+"/series", map[string]any{
		"title": "Must not spread archive", "recurrence": rule,
		"expectedUpdatedAt": first.UpdatedAt, "expectedSeriesUpdatedAt": first.Recurrence.UpdatedAt,
	}, 400, nil)
	var afterTemplate, afterRule string
	if err := store.db.QueryRow(`SELECT plan_json FROM personal_recurrence_templates WHERE series_id=?`, first.SeriesID).Scan(&afterTemplate); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT updated_at FROM personal_recurrence_rules WHERE series_id=?`, first.SeriesID).Scan(&afterRule); err != nil {
		t.Fatal(err)
	}
	if beforeTemplate != afterTemplate || beforeRule != afterRule {
		t.Fatal("failed series update changed its template or revision")
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+first.ID, map[string]any{"title": first.Title, "status": "done", "expectedUpdatedAt": first.UpdatedAt}, 200, &first)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	next := onlyPlannedOccurrence(t, overview.Plans, "2026-09-15")
	if next.ParentID != "" || first.ParentID != parent.ID {
		t.Fatal("completion lost exception history or copied it into the next instance")
	}
}
