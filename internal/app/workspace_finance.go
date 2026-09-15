package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

// Only this constant mapping can choose finance tables. Neither SQL nor table
// names are accepted from a client. Personal requests keep their original SQL.
var workspaceFinanceSQL = strings.NewReplacer(
	"personal_finance_expense_requests", "workspace_finance_expense_requests",
	"personal_finance_counterparties", "workspace_finance_counterparties",
	"personal_finance_requests", "workspace_finance_requests",
	"personal_finance_expenses", "workspace_finance_expenses",
	"personal_finance_buckets", "workspace_finance_buckets",
	"personal_finance_sources", "workspace_finance_sources",
	"personal_finance_entries", "workspace_finance_entries",
	"owner_id", "workspace_id",
)

type financeTx struct {
	*sql.Tx
	owner any
	scope *workspaceFinanceScope
}

func (tx *financeTx) query(query string) string {
	if tx.scope != nil {
		return workspaceFinanceSQL.Replace(query)
	}
	return query
}
func (tx *financeTx) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return tx.Tx.ExecContext(ctx, tx.query(query), args...)
}
func (tx *financeTx) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return tx.Tx.QueryContext(ctx, tx.query(query), args...)
}
func (tx *financeTx) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	return tx.Tx.QueryRowContext(ctx, tx.query(query), args...)
}

type workspaceFinanceScope struct {
	Kind                string `json:"kind"`
	WorkspaceID         string `json:"workspaceId"`
	WorkspaceName       string `json:"workspaceName"`
	SourceWorkspaceID   string `json:"sourceWorkspaceId"`
	SourceWorkspaceName string `json:"sourceWorkspaceName"`
	SourceAvailable     bool   `json:"sourceAvailable"`
	Linked              bool   `json:"linked"`
	CanWrite            bool   `json:"canWrite"`
	CanConfigure        bool   `json:"canConfigure"`
	Revision            int64  `json:"revision"`
}

type workspaceFinanceOption struct {
	WorkspaceID   string `json:"workspaceId"`
	WorkspaceName string `json:"workspaceName"`
}
type workspaceFinanceSettings struct {
	Scope   workspaceFinanceScope    `json:"scope"`
	Options []workspaceFinanceOption `json:"options"`
}

const workspaceFinanceMembership = `SELECT w.id,w.name,wm.role
 FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id
 WHERE w.id=? AND w.kind='team' AND w.archived_at IS NULL
 AND wm.user_id=? AND wm.status='active'
 AND (w.team_id IS NULL OR EXISTS (
 SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
 WHERE t.id=w.team_id AND t.deleted_at IS NULL
 AND tm.user_id=wm.user_id AND tm.status='active'))`

func workspaceFinanceAccess(tx *sql.Tx, r *http.Request, workspaceID string) (workspaceFinanceOption, string, error) {
	var option workspaceFinanceOption
	var role string
	err := tx.QueryRowContext(r.Context(), workspaceFinanceMembership, workspaceID, currentUser(r).ID).Scan(&option.WorkspaceID, &option.WorkspaceName, &role)
	if errors.Is(err, sql.ErrNoRows) {
		err = financeError{http.StatusForbidden, "Финансы этой команды недоступны"}
	}
	return option, role, err
}

func workspaceFinanceAdmin(role string) bool { return role == "owner" || role == "admin" }

// Membership, binding and ledger rows are read in the same transaction. A
// connection is a reference to an original ledger, never an access grant.
func readWorkspaceFinanceScope(tx *sql.Tx, r *http.Request, requireSource bool) (workspaceFinanceScope, error) {
	var scope workspaceFinanceScope
	workspaceID := strings.TrimSpace(r.Header.Get("X-Workspace-ID"))
	if workspaceID == "" {
		return scope, financeInvalid("Выберите команду для финансов")
	}
	destination, role, err := workspaceFinanceAccess(tx, r, workspaceID)
	if err != nil {
		return scope, err
	}
	scope = workspaceFinanceScope{Kind: "team", WorkspaceID: workspaceID, WorkspaceName: destination.WorkspaceName, SourceWorkspaceID: workspaceID,
		SourceWorkspaceName: destination.WorkspaceName, SourceAvailable: true, CanConfigure: workspaceFinanceAdmin(role), CanWrite: workspaceFinanceAdmin(role)}
	err = tx.QueryRowContext(r.Context(), `SELECT source_workspace_id,revision FROM workspace_finance_settings WHERE workspace_id=?`, workspaceID).Scan(&scope.SourceWorkspaceID, &scope.Revision)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return scope, err
	}
	scope.Linked = scope.SourceWorkspaceID != workspaceID
	if scope.Linked {
		scope.CanWrite = false
		scope.SourceWorkspaceName = ""
		scope.SourceAvailable = false
		source, _, sourceErr := workspaceFinanceAccess(tx, r, scope.SourceWorkspaceID)
		if sourceErr != nil {
			var accessErr financeError
			if !errors.As(sourceErr, &accessErr) || requireSource {
				return scope, sourceErr
			}
		} else {
			scope.SourceAvailable = true
			scope.SourceWorkspaceName = source.WorkspaceName
		}
	}
	return scope, nil
}

func checkWorkspaceFinanceRequest(r *http.Request, scope workspaceFinanceScope) error {
	write := r.Method != http.MethodGet && r.Method != http.MethodHead
	source, revision := r.Header.Get("X-Finance-Source"), r.Header.Get("X-Finance-Revision")
	if write || source != "" || revision != "" {
		if source != scope.SourceWorkspaceID || revision != strconv.FormatInt(scope.Revision, 10) {
			return financeConflict("Источник финансов изменился. Обновите данные и проверьте команду перед сохранением")
		}
	}
	if write && !scope.CanWrite {
		if scope.Linked {
			return financeError{http.StatusForbidden, "Подключённые финансы доступны для просмотра. Изменяйте их в исходной команде"}
		}
		return financeError{http.StatusForbidden, "Изменять финансы команды может владелец или администратор"}
	}
	return nil
}

func (s *Server) registerWorkspaceFinanceRoutes() {
	for pattern, handler := range map[string]http.HandlerFunc{
		"GET /api/workspace/finance":                          s.handlePersonalFinance,
		"GET /api/workspace/finance/settings":                 s.handleWorkspaceFinanceSettings,
		"PUT /api/workspace/finance/settings":                 s.handleWorkspaceFinanceSettings,
		"POST /api/workspace/finance/buckets":                 s.handleFinanceBucket,
		"PUT /api/workspace/finance/buckets/{id}":             s.handleFinanceBucket,
		"POST /api/workspace/finance/sources":                 s.handleFinanceSource,
		"PUT /api/workspace/finance/sources/{id}":             s.handleFinanceSource,
		"POST /api/workspace/finance/counterparties":          s.handleFinanceCounterparty,
		"PUT /api/workspace/finance/counterparties/{id}":      s.handleFinanceCounterparty,
		"POST /api/workspace/finance/entries":                 s.handleFinanceEntry,
		"PUT /api/workspace/finance/entries/{id}":             s.handleFinanceEntry,
		"PATCH /api/workspace/finance/entries/{id}/transfers": s.handleFinanceTransfer,
		"PATCH /api/workspace/finance/entries/{id}/void":      s.handleFinanceVoid,
		"POST /api/workspace/finance/expenses":                s.handleFinanceExpense,
		"GET /api/workspace/finance/expenses/{id}":            s.handleReadFinanceExpense,
		"PUT /api/workspace/finance/expenses/{id}":            s.handleFinanceExpense,
		"PATCH /api/workspace/finance/expenses/{id}/void":     s.handleFinanceExpenseVoid,
	} {
		s.mux.Handle(pattern, s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			handler(w, r)
		})))
	}
}

func readWorkspaceFinanceSettings(tx *sql.Tx, r *http.Request) (workspaceFinanceSettings, error) {
	result := workspaceFinanceSettings{Options: []workspaceFinanceOption{}}
	var err error
	result.Scope, err = readWorkspaceFinanceScope(tx, r, false)
	if err != nil {
		return result, err
	}
	if !result.Scope.CanConfigure {
		return result, nil
	}
	// Only administrators of the source may establish a connection. Every reader
	// still needs their own active source membership after it is connected.
	rows, err := tx.QueryContext(r.Context(), `SELECT w.id,w.name
 FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id
 WHERE w.kind='team' AND w.archived_at IS NULL AND wm.user_id=? AND wm.status='active'
 AND wm.role IN ('owner','admin') AND (w.team_id IS NULL OR EXISTS (
 SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
 WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=wm.user_id AND tm.status='active'))
 AND (w.id=? OR NOT EXISTS (SELECT 1 FROM workspace_finance_settings fs
 WHERE fs.workspace_id=w.id AND fs.source_workspace_id<>w.id))
 ORDER BY w.name,w.id`, currentUser(r).ID, result.Scope.WorkspaceID)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var option workspaceFinanceOption
		if err := rows.Scan(&option.WorkspaceID, &option.WorkspaceName); err != nil {
			return result, err
		}
		result.Options = append(result.Options, option)
	}
	return result, rows.Err()
}

func (s *Server) handleWorkspaceFinanceSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		SourceWorkspaceID string `json:"sourceWorkspaceId"`
		ExpectedRevision  int64  `json:"expectedRevision"`
	}
	if r.Method == http.MethodPut && !decodeJSON(w, r, &input) {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		financeWriteError(w, err)
		return
	}
	defer tx.Rollback()
	scope, err := readWorkspaceFinanceScope(tx, r, false)
	if err == nil && r.Method == http.MethodPut {
		err = updateWorkspaceFinanceSettings(tx, r, scope, strings.TrimSpace(input.SourceWorkspaceID), input.ExpectedRevision)
	}
	var result workspaceFinanceSettings
	if err == nil {
		result, err = readWorkspaceFinanceSettings(tx, r)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		financeWriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func updateWorkspaceFinanceSettings(tx *sql.Tx, r *http.Request, scope workspaceFinanceScope, sourceID string, expectedRevision int64) error {
	if !scope.CanConfigure {
		return financeError{http.StatusForbidden, "Подключать финансы может владелец или администратор команды"}
	}
	if expectedRevision != scope.Revision {
		return financeConflict("Подключение уже изменено. Обновите настройки")
	}
	if sourceID == "" {
		return financeInvalid("Выберите собственные финансы или команду-источник")
	}
	_, role, err := workspaceFinanceAccess(tx, r, sourceID)
	if err != nil {
		return err
	}
	if !workspaceFinanceAdmin(role) {
		return financeError{http.StatusForbidden, "Для подключения нужны права администратора исходной команды"}
	}
	// A link names that workspace's own ledger, never follows another link. This
	// keeps its meaning stable and prevents cycles or transitive access grants.
	if sourceID != scope.WorkspaceID {
		var linkedSource string
		err := tx.QueryRowContext(r.Context(), `SELECT source_workspace_id FROM workspace_finance_settings WHERE workspace_id=?`, sourceID).Scan(&linkedSource)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil && linkedSource != sourceID {
			return financeInvalid("Эта команда показывает подключённые финансы. Выберите исходную команду напрямую")
		}
	}
	if scope.Revision == 0 {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_finance_settings(workspace_id,source_workspace_id,revision,updated_by,updated_at) VALUES(?,?,1,?,?)`, scope.WorkspaceID, sourceID, currentUser(r).ID, nowText())
	} else {
		var result sql.Result
		result, err = tx.ExecContext(r.Context(), `UPDATE workspace_finance_settings SET source_workspace_id=?,revision=revision+1,updated_by=?,updated_at=? WHERE workspace_id=? AND revision=?`, sourceID, currentUser(r).ID, nowText(), scope.WorkspaceID, expectedRevision)
		if err == nil {
			count, countErr := result.RowsAffected()
			err = countErr
			if err == nil && count != 1 {
				err = financeConflict("Подключение уже изменено. Обновите настройки")
			}
		}
	}
	return err
}
