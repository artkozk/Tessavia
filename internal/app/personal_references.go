package app

import (
	"context"
	"errors"
	"net/http"
)

type personalReferenceError struct{ message string }

func (e *personalReferenceError) Error() string { return e.message }

func invalidPersonalReference(message string) error {
	return &personalReferenceError{message}
}

func writePersonalReferenceMutationError(w http.ResponseWriter, err error, fallback string) {
	var invalid *personalReferenceError
	if errors.As(err, &invalid) {
		writeError(w, http.StatusBadRequest, invalid.Error())
		return
	}
	writeError(w, http.StatusInternalServerError, fallback)
}

// Historical references label already saved links, separately from new choices.
type PersonalReferenceLabel struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type PersonalHistoricalReferences struct {
	Projects []PersonalReferenceLabel `json:"projects"`
	Goals    []PersonalReferenceLabel `json:"goals"`
	Parents  []PersonalReferenceLabel `json:"parents"`
}

func (s *Server) listPersonalHistoricalReferences(r *http.Request, owner int64) (PersonalHistoricalReferences, error) {
	result := PersonalHistoricalReferences{Projects: []PersonalReferenceLabel{}, Goals: []PersonalReferenceLabel{}, Parents: []PersonalReferenceLabel{}}
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT 'project', c.id, c.title FROM personal_projects c
		WHERE c.owner_id=? AND c.status='archived' AND EXISTS (
		 SELECT 1 FROM personal_plans p WHERE p.owner_id=c.owner_id AND p.status<>'archived' AND p.project_id=c.id)
		UNION ALL
		SELECT 'goal', c.id, c.title FROM personal_goals c
		WHERE c.owner_id=? AND c.status='archived' AND EXISTS (
		 SELECT 1 FROM personal_plans p WHERE p.owner_id=c.owner_id AND p.status<>'archived' AND p.goal_id=c.id)
		UNION ALL
		SELECT 'parent', c.id, c.title FROM personal_plans c
		WHERE c.owner_id=? AND c.status='archived' AND EXISTS (
		 SELECT 1 FROM personal_plans p WHERE p.owner_id=c.owner_id AND p.status<>'archived' AND p.parent_id=c.id)
		ORDER BY 1,3,2`, owner, owner, owner)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var item PersonalReferenceLabel
		if err = rows.Scan(&kind, &item.ID, &item.Title); err != nil {
			return result, err
		}
		switch kind {
		case "project":
			result.Projects = append(result.Projects, item)
		case "goal":
			result.Goals = append(result.Goals, item)
		case "parent":
			result.Parents = append(result.Parents, item)
		}
	}
	return result, rows.Err()
}

// previous must be an owner-scoped persisted plan or recurrence template from
// this transaction, never a request offered as its own historical authority.
func validatePersonalPlanReferences(ctx context.Context, q personalReferenceQueryer, owner int64, plan *PersonalPlan, previous *PersonalPlan) error {
	old := PersonalPlan{}
	if previous != nil {
		old = *previous
	}
	if plan.GoalID != "" {
		var project, status string
		if err := q.QueryRowContext(ctx, `SELECT COALESCE(project_id,''),status FROM personal_goals WHERE id=? AND owner_id=?`, plan.GoalID, owner).Scan(&project, &status); err != nil {
			return invalidPersonalReference("Личная цель недоступна. Уберите связь или выберите другую цель")
		}
		if status == "archived" && plan.GoalID != old.GoalID {
			return invalidPersonalReference("Нельзя выбрать архивную цель для новой связи")
		}
		if plan.ProjectID == "" {
			plan.ProjectID = project
		} else if project != "" && project != plan.ProjectID {
			return invalidPersonalReference("Цель относится к другому личному проекту")
		}
	}
	// Check after inheritance: an active goal cannot smuggle in a new archived
	// project, or a foreign project from a previously corrupted relation.
	if plan.ProjectID != "" {
		var status string
		if err := q.QueryRowContext(ctx, `SELECT status FROM personal_projects WHERE id=? AND owner_id=?`, plan.ProjectID, owner).Scan(&status); err != nil {
			return invalidPersonalReference("Личный проект недоступен. Уберите связь или выберите другой проект")
		}
		if status == "archived" && plan.ProjectID != old.ProjectID {
			return invalidPersonalReference("Нельзя выбрать архивный проект для новой связи")
		}
	}
	if plan.ParentID == "" {
		return nil
	}
	selfID := plan.ID
	if old.ID != "" {
		selfID = old.ID
	}
	if plan.ParentID == selfID {
		return invalidPersonalReference("Дело не может быть собственной подзадачей")
	}
	var status string
	if err := q.QueryRowContext(ctx, `SELECT status FROM personal_plans WHERE id=? AND owner_id=?`, plan.ParentID, owner).Scan(&status); err != nil {
		return invalidPersonalReference("Родительское дело недоступно. Уберите связь или выберите другое дело")
	}
	if status == "archived" && plan.ParentID != old.ParentID {
		return invalidPersonalReference("Нельзя выбрать архивное родительское дело для новой связи")
	}
	// UNION deduplicates visited pairs: even an existing cycle unrelated to self
	// terminates. Include archived ancestors, otherwise archiving hides cycles.
	// A valid owned chain ends at a root, not a foreign or missing ancestor.
	var selfCount, roots int
	if err := q.QueryRowContext(ctx, `WITH RECURSIVE chain(id,parent_id) AS (
		SELECT id,parent_id FROM personal_plans WHERE id=? AND owner_id=?
		UNION
		SELECT p.id,p.parent_id FROM personal_plans p JOIN chain c ON p.id=c.parent_id WHERE p.owner_id=?
	) SELECT COALESCE(SUM(CASE WHEN id=? THEN 1 ELSE 0 END),0),
	 COALESCE(SUM(CASE WHEN parent_id IS NULL OR parent_id='' THEN 1 ELSE 0 END),0) FROM chain`, plan.ParentID, owner, owner, selfID).Scan(&selfCount, &roots); err != nil {
		return invalidPersonalReference("Не удалось проверить родительское дело")
	}
	if selfCount > 0 || roots != 1 {
		return invalidPersonalReference("Цепочка родительских дел содержит цикл или недоступную связь. Уберите связь или выберите другое дело")
	}
	return nil
}
