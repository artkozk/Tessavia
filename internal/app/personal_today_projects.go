package app

import (
	"context"
	"database/sql"
	"time"
)

const personalDayProjectLimit = 6

type personalDayProjectItem struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspaceId"`
	Workspace   string `json:"workspace"`
	Kind        string `json:"kind"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	Priority    string `json:"priority"`
	Reason      string `json:"reason"`
	DueAt       string `json:"dueAt,omitempty"`
}

type personalDayProjectSection struct {
	Items   []personalDayProjectItem `json:"items"`
	Total   int                      `json:"total"`
	HasMore bool                     `json:"hasMore"`
}

const personalDayActiveProjectRecord = `r.status NOT IN ('completed','cancelled','archived','rejected','postponed') AND (r.status='review' OR r.progress<100)`

func projectDayKindSQL() string {
	return `CASE WHEN r.business_kind<>'' THEN r.business_kind WHEN r.subtype='question_set' THEN 'question_set' WHEN r.record_kind='meeting' THEN 'meeting' ELSE r.type END`
}

func scanPersonalDayProjects(rows *sql.Rows, start, end time.Time, attention bool) ([]personalDayProjectItem, error) {
	items := []personalDayProjectItem{}
	for rows.Next() {
		var item personalDayProjectItem
		var due sql.NullString
		var author, reviewer int64
		if err := rows.Scan(&item.ID, &item.Title, &item.Kind, &item.Status, &item.Priority, &due, &item.WorkspaceID, &item.Workspace, &author, &reviewer); err != nil {
			return nil, err
		}
		if due.Valid {
			item.DueAt = due.String
		}
		dueTime, _ := time.Parse(time.RFC3339Nano, item.DueAt)
		if attention {
			switch {
			case item.Status == "review":
				item.Reason = "Нужна ваша приёмка"
			case !dueTime.IsZero() && dueTime.Before(start):
				item.Reason = "Срок проекта прошёл"
			default:
				item.Reason = "Критический риск проекта"
			}
		} else {
			switch {
			case !dueTime.IsZero() && !dueTime.Before(start) && dueTime.Before(end):
				item.Reason = "Срок сегодня"
			case item.Status == "blocked":
				item.Reason = "Заблокировано"
			default:
				item.Reason = "В работе"
			}
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) personalDayProjectSection(ctx context.Context, owner int64, start, end time.Time, attention bool) (personalDayProjectSection, error) {
	condition := reviewWorkspaceAccess + ` AND ` + personalDayActiveProjectRecord
	args := []any{owner}
	if attention {
		condition += ` AND ((r.owner_id=? AND r.due_at IS NOT NULL AND julianday(r.due_at)<julianday(?))
		 OR (r.status='review' AND COALESCE(r.decision_maker_id,r.author_id)=?)
		 OR (r.business_kind='risk' AND r.priority='critical' AND (r.owner_id=? OR COALESCE(r.decision_maker_id,r.author_id)=?)))`
		args = append(args, owner, start.UTC().Format(time.RFC3339Nano), owner, owner, owner)
	} else {
		condition += ` AND r.owner_id=? AND r.status<>'review'
		 AND NOT (r.business_kind='risk' AND r.priority='critical')
		 AND ((r.due_at IS NOT NULL AND julianday(r.due_at)>=julianday(?) AND julianday(r.due_at)<julianday(?)) OR r.status IN ('in_progress','blocked'))`
		args = append(args, owner, start.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano))
	}
	var total int
	if err := s.store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM records r`+condition, args...).Scan(&total); err != nil {
		return personalDayProjectSection{}, err
	}
	order := `CASE WHEN r.due_at IS NOT NULL AND julianday(r.due_at)<julianday(?) THEN 0 WHEN r.status='review' THEN 1 ELSE 2 END,r.updated_at,r.id`
	orderArgs := []any{start.UTC().Format(time.RFC3339Nano)}
	if !attention {
		order = `CASE WHEN r.due_at IS NOT NULL AND julianday(r.due_at)<julianday(?) THEN 0 WHEN r.status='blocked' THEN 1 ELSE 2 END,COALESCE(r.due_at,r.updated_at),r.id`
		orderArgs[0] = end.UTC().Format(time.RFC3339Nano)
	}
	queryArgs := append(append([]any{}, args...), orderArgs...)
	queryArgs = append(queryArgs, personalDayProjectLimit)
	rows, err := s.store.db.QueryContext(ctx, `SELECT r.id,r.title,`+projectDayKindSQL()+`,r.status,r.priority,r.due_at,w.id,w.name,r.author_id,COALESCE(r.decision_maker_id,r.author_id) FROM records r`+condition+` ORDER BY `+order+` LIMIT ?`, queryArgs...)
	if err != nil {
		return personalDayProjectSection{}, err
	}
	defer rows.Close()
	items, err := scanPersonalDayProjects(rows, start, end, attention)
	if err != nil {
		return personalDayProjectSection{}, err
	}
	return personalDayProjectSection{Items: items, Total: total, HasMore: total > len(items)}, nil
}

func (s *Server) personalDayProjects(ctx context.Context, owner int64, day, timezone string) (personalDayProjectSection, personalDayProjectSection, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return personalDayProjectSection{}, personalDayProjectSection{}, err
	}
	start, err := time.ParseInLocation("2006-01-02", day, loc)
	if err != nil {
		return personalDayProjectSection{}, personalDayProjectSection{}, err
	}
	end := start.AddDate(0, 0, 1)
	work, err := s.personalDayProjectSection(ctx, owner, start, end, false)
	if err != nil {
		return work, personalDayProjectSection{}, err
	}
	attention, err := s.personalDayProjectSection(ctx, owner, start, end, true)
	return work, attention, err
}
