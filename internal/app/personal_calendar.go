package app

import (
	"errors"
	"time"
)

type personalPlanInput struct {
	ExpectedSeriesUpdatedAt string                   `json:"expectedSeriesUpdatedAt"`
	RequestKey              string                   `json:"requestKey"`
	Title                   string                   `json:"title"`
	Notes                   string                   `json:"notes"`
	Status                  string                   `json:"status"`
	DueAt                   *string                  `json:"dueAt"`
	StartDate               *string                  `json:"startDate"`
	EndDate                 *string                  `json:"endDate"`
	ColorKey                *string                  `json:"colorKey"`
	ExpectedUpdatedAt       string                   `json:"expectedUpdatedAt"`
	ItemKind                *string                  `json:"itemKind"`
	ProjectID               *string                  `json:"projectId"`
	GoalID                  *string                  `json:"goalId"`
	ParentID                *string                  `json:"parentId"`
	PlannedMinutes          *int                     `json:"plannedMinutes"`
	ActualMinutes           *int                     `json:"actualMinutes"`
	StartsAt                *string                  `json:"startsAt"`
	EndsAt                  *string                  `json:"endsAt"`
	OccurrenceDate          *string                  `json:"occurrenceDate"`
	Recurrence              *personalRecurrenceInput `json:"recurrence"`
}

// Calendar dates stay timezone-free; a timed deadline retains its RFC3339 instant.
func (input personalPlanInput) calendarFields(plan PersonalPlan) (PersonalPlan, error) {
	if input.DueAt != nil {
		var err error
		plan.DueAt, err = normalizeDueAt(*input.DueAt)
		if err != nil {
			return plan, errors.New("Некорректная дата и время")
		}
	}
	if input.StartsAt != nil {
		var err error
		plan.StartsAt, err = normalizeDueAt(*input.StartsAt)
		if err != nil {
			return plan, errors.New("Некорректное начало события")
		}
	}
	if input.EndsAt != nil {
		var err error
		plan.EndsAt, err = normalizeDueAt(*input.EndsAt)
		if err != nil {
			return plan, errors.New("Некорректное окончание события")
		}
	}
	if input.StartDate != nil {
		plan.StartDate = *input.StartDate
	}
	if input.EndDate != nil {
		plan.EndDate = *input.EndDate
	}
	if input.ColorKey != nil {
		plan.ColorKey = *input.ColorKey
	}
	for _, value := range []string{plan.StartDate, plan.EndDate} {
		if value == "" {
			continue
		}
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil || parsed.Year() < 1900 || parsed.Year() > 9998 {
			return plan, errors.New("Некорректная календарная дата")
		}
	}
	if plan.StartDate == "" && plan.EndDate != "" {
		return plan, errors.New("Укажите начало периода")
	}
	if plan.StartDate != "" && plan.EndDate == "" {
		plan.EndDate = plan.StartDate
	}
	if plan.EndDate < plan.StartDate {
		return plan, errors.New("Конец периода не может быть раньше начала")
	}
	if (plan.StartsAt == nil) != (plan.EndsAt == nil) {
		return plan, errors.New("Укажите начало и окончание временного блока")
	}
	if plan.StartsAt != nil && plan.EndsAt != nil {
		start, _ := time.Parse(time.RFC3339Nano, *plan.StartsAt)
		end, _ := time.Parse(time.RFC3339Nano, *plan.EndsAt)
		if !end.After(start) {
			return plan, errors.New("Окончание события должно быть позже начала")
		}
	}
	modes := 0
	if plan.StartDate != "" {
		modes++
	}
	if plan.DueAt != nil {
		modes++
	}
	if plan.StartsAt != nil {
		modes++
	}
	if modes > 1 {
		return plan, errors.New("Выберите период дней, срок или временной блок")
	}
	switch plan.ColorKey {
	case "green", "blue", "amber", "purple", "red", "neutral":
	default:
		return plan, errors.New("Некорректный цвет плана")
	}
	return plan, nil
}
