package app

import (
	"errors"
	"time"
)

type personalPlanInput struct {
	Title             string  `json:"title"`
	Notes             string  `json:"notes"`
	Status            string  `json:"status"`
	DueAt             *string `json:"dueAt"`
	StartDate         *string `json:"startDate"`
	EndDate           *string `json:"endDate"`
	ColorKey          *string `json:"colorKey"`
	ExpectedUpdatedAt string  `json:"expectedUpdatedAt"`
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
	if plan.DueAt != nil && plan.StartDate != "" {
		return plan, errors.New("Выберите период целых дней или точное время")
	}
	switch plan.ColorKey {
	case "green", "blue", "amber", "purple", "red", "neutral":
	default:
		return plan, errors.New("Некорректный цвет плана")
	}
	return plan, nil
}
