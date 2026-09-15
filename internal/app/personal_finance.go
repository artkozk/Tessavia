package app

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"
)

const personalFinanceMaxMinor int64 = 1_000_000_000_000
const personalFinanceMaxEntries = 5000
const personalFinanceFirstDate = "1900-01-01"
const personalFinanceLastDate = "9998-12-31"

func validFinanceDate(value string) bool {
	return validDate(value) && value >= personalFinanceFirstDate && value <= personalFinanceLastDate
}

type financeBucket struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Destination string `json:"destination"`
	Archived    bool   `json:"archived"`
	Revision    int64  `json:"revision"`
}
type financeRule struct {
	BucketID    string `json:"bucketId"`
	BasisPoints int64  `json:"basisPoints"`
}
type financeSource struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	DeductWorkers bool          `json:"deductWorkers"`
	Allocations   []financeRule `json:"allocations"`
	Archived      bool          `json:"archived"`
	Revision      int64         `json:"revision"`
}
type financeAllocation struct {
	BucketID    string `json:"bucketId"`
	BucketName  string `json:"bucketName"`
	BasisPoints int64  `json:"basisPoints"`
	AmountMinor int64  `json:"amountMinor"`
	PaidMinor   int64  `json:"paidMinor"`
}
type financeEntry struct {
	financeOrganization
	ID            string              `json:"id"`
	SourceID      string              `json:"sourceId"`
	SourceName    string              `json:"sourceName"`
	DeductWorkers bool                `json:"deductWorkers"`
	Date          string              `json:"date"`
	Payer         string              `json:"payer"`
	PayerID       string              `json:"payerId"`
	Note          string              `json:"note"`
	GrossMinor    int64               `json:"grossMinor"`
	WorkerMinor   int64               `json:"workerMinor"`
	BaseMinor     int64               `json:"baseMinor"`
	Allocations   []financeAllocation `json:"allocations"`
	Revision      int64               `json:"revision"`
	Voided        bool                `json:"voided"`
	CreatedAt     string              `json:"createdAt"`
	UpdatedAt     string              `json:"updatedAt"`
}
type financeOverview struct {
	Categories     []financeCategory      `json:"categories"`
	Scope          *workspaceFinanceScope `json:"scope,omitempty"`
	Currency       string                 `json:"currency"`
	Buckets        []financeBucket        `json:"buckets"`
	Sources        []financeSource        `json:"sources"`
	Entries        []financeEntry         `json:"entries"`
	Counterparties []financeCounterparty  `json:"counterparties"`
	Expenses       []financeExpense       `json:"expenses"`
	Balances       []financeBalance       `json:"balances"`
	BalanceThrough string                 `json:"balanceThrough"`
}
type financeEntryInput struct {
	financeOrganizationInput
	ClientRequestID        string  `json:"clientRequestId,omitempty"`
	SourceID               string  `json:"sourceId"`
	ExpectedSourceRevision int64   `json:"expectedSourceRevision,omitempty"`
	Date                   string  `json:"date"`
	Payer                  string  `json:"payer"`
	Note                   string  `json:"note"`
	GrossMinor             int64   `json:"grossMinor"`
	WorkerMinor            int64   `json:"workerMinor"`
	ExpectedRevision       int64   `json:"expectedRevision,omitempty"`
	PayerID                *string `json:"payerId,omitempty"`
	ExpectedPayerRevision  int64   `json:"expectedPayerRevision,omitempty"`
}
type financeError struct {
	status  int
	message string
}

func (e financeError) Error() string       { return e.message }
func financeInvalid(message string) error  { return financeError{400, message} }
func financeConflict(message string) error { return financeError{409, message} }
func financeNotFound() error               { return financeError{404, "Запись не найдена"} }

// The auth middleware treats /api/personal/* as account scoped. No handler reads
// X-Workspace-ID or caller-supplied owner IDs, including joins and receipt lookup.
func (s *Server) registerPersonalFinanceRoutes() {
	for pattern, handler := range map[string]http.HandlerFunc{
		"GET /api/personal/finance":                          s.handlePersonalFinance,
		"POST /api/personal/finance/buckets":                 s.handleFinanceBucket,
		"PUT /api/personal/finance/buckets/{id}":             s.handleFinanceBucket,
		"POST /api/personal/finance/sources":                 s.handleFinanceSource,
		"PUT /api/personal/finance/sources/{id}":             s.handleFinanceSource,
		"POST /api/personal/finance/counterparties":          s.handleFinanceCounterparty,
		"PUT /api/personal/finance/counterparties/{id}":      s.handleFinanceCounterparty,
		"POST /api/personal/finance/entries":                 s.handleFinanceEntry,
		"PUT /api/personal/finance/entries/{id}":             s.handleFinanceEntry,
		"PATCH /api/personal/finance/entries/{id}/transfers": s.handleFinanceTransfer,
		"PATCH /api/personal/finance/entries/{id}/void":      s.handleFinanceVoid,
		"POST /api/personal/finance/expenses":                s.handleFinanceExpense,
		"GET /api/personal/finance/expenses/{id}":            s.handleReadFinanceExpense,
		"PUT /api/personal/finance/expenses/{id}":            s.handleFinanceExpense,
		"PATCH /api/personal/finance/expenses/{id}/void":     s.handleFinanceExpenseVoid,
	} {
		s.mux.Handle(pattern, s.requireAuth(handler))
	}
	s.registerWorkspaceFinanceRoutes()
	s.registerFinanceOrganizationRoutes()
}

func financeWriteError(w http.ResponseWriter, err error) {
	var value financeError
	if errors.As(err, &value) {
		writeError(w, value.status, value.message)
		return
	}
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Запись не найдена")
		return
	}
	writeError(w, 500, "Не удалось сохранить или прочитать финансы")
}
func (s *Server) financeTransaction(w http.ResponseWriter, r *http.Request, work func(*financeTx) (any, int, error)) {
	w.Header().Set("Cache-Control", "no-store")
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		financeWriteError(w, err)
		return
	}
	defer tx.Rollback()
	ledger := &financeTx{Tx: tx, owner: currentUser(r).ID}
	if strings.HasPrefix(r.URL.Path, "/api/workspace/finance") {
		scope, scopeErr := readWorkspaceFinanceScope(tx, r, true)
		if scopeErr != nil {
			financeWriteError(w, scopeErr)
			return
		}
		if scopeErr = checkWorkspaceFinanceRequest(r, scope); scopeErr != nil {
			financeWriteError(w, scopeErr)
			return
		}
		ledger.scope, ledger.owner = &scope, scope.SourceWorkspaceID
	}
	value, status, err := work(ledger)
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		financeWriteError(w, err)
		return
	}
	writeJSON(w, status, value)
}

func financePeriod(r *http.Request) (string, string, error) {
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if from == "" && to == "" {
		now := time.Now().UTC()
		start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		from = start.Format("2006-01-02")
		to = start.AddDate(0, 1, -1).Format("2006-01-02")
	}
	a, errA := time.Parse("2006-01-02", from)
	b, errB := time.Parse("2006-01-02", to)
	if errA != nil || errB != nil || !validFinanceDate(from) || !validFinanceDate(to) || b.Before(a) || b.Sub(a) > 365*24*time.Hour {
		return "", "", financeInvalid("Выберите период не более 366 дней в диапазоне 1900–9998 годов")
	}
	return from, to, nil
}

const financeEntryColumns = `id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at,COALESCE(payer_id,'')`

type financeScanner interface{ Scan(...any) error }

func scanFinanceEntry(row financeScanner) (financeEntry, error) {
	var e financeEntry
	var allocations string
	err := row.Scan(&e.ID, &e.SourceID, &e.SourceName, &e.DeductWorkers, &e.Date, &e.Payer, &e.Note, &e.GrossMinor, &e.WorkerMinor, &e.BaseMinor, &allocations, &e.Revision, &e.Voided, &e.CreatedAt, &e.UpdatedAt, &e.PayerID)
	if err == nil {
		err = json.Unmarshal([]byte(allocations), &e.Allocations)
	}
	return e, err
}
func readFinanceEntry(tx *financeTx, r *http.Request, id string) (financeEntry, error) {
	value, err := scanFinanceEntry(tx.QueryRowContext(r.Context(), `SELECT `+financeEntryColumns+` FROM personal_finance_entries WHERE owner_id=? AND id=?`, tx.owner, id))
	if err == nil {
		value.financeOrganization, err = readFinanceOrganization(tx, r, "income", id)
	}
	return value, err
}
func readFinanceSource(tx *financeTx, r *http.Request, id string) (financeSource, error) {
	var source financeSource
	var data string
	err := tx.QueryRowContext(r.Context(), `SELECT id,name,deduct_workers,allocations_json,archived,revision FROM personal_finance_sources WHERE owner_id=? AND id=?`, tx.owner, id).Scan(&source.ID, &source.Name, &source.DeductWorkers, &data, &source.Archived, &source.Revision)
	if err == nil {
		err = json.Unmarshal([]byte(data), &source.Allocations)
	}
	return source, err
}

func (s *Server) handlePersonalFinance(w http.ResponseWriter, r *http.Request) {
	from, to, err := financePeriod(r)
	if err != nil {
		financeWriteError(w, err)
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		owner := tx.owner
		result := financeOverview{Scope: tx.scope, Currency: "RUB", Buckets: []financeBucket{}, Sources: []financeSource{}, Entries: []financeEntry{}}
		var err error
		result.Counterparties, err = readFinanceCounterparties(tx, r)
		if err != nil {
			return nil, 0, err
		}
		rows, err := tx.QueryContext(r.Context(), `SELECT id,name,destination,archived,revision FROM personal_finance_buckets WHERE owner_id=? ORDER BY created_at,id`, owner)
		if err != nil {
			return nil, 0, err
		}
		for rows.Next() {
			var value financeBucket
			if err = rows.Scan(&value.ID, &value.Name, &value.Destination, &value.Archived, &value.Revision); err != nil {
				rows.Close()
				return nil, 0, err
			}
			result.Buckets = append(result.Buckets, value)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, 0, err
		}
		rows, err = tx.QueryContext(r.Context(), `SELECT id,name,deduct_workers,allocations_json,archived,revision FROM personal_finance_sources WHERE owner_id=? ORDER BY created_at,id`, owner)
		if err != nil {
			return nil, 0, err
		}
		for rows.Next() {
			var value financeSource
			var data string
			if err = rows.Scan(&value.ID, &value.Name, &value.DeductWorkers, &data, &value.Archived, &value.Revision); err == nil {
				err = json.Unmarshal([]byte(data), &value.Allocations)
			}
			if err != nil {
				rows.Close()
				return nil, 0, err
			}
			result.Sources = append(result.Sources, value)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, 0, err
		}
		rows, err = tx.QueryContext(r.Context(), `SELECT `+financeEntryColumns+` FROM personal_finance_entries WHERE owner_id=? AND date>=? AND date<=? ORDER BY date DESC,created_at DESC,id LIMIT ?`, owner, from, to, personalFinanceMaxEntries+1)
		if err != nil {
			return nil, 0, err
		}
		for rows.Next() {
			value, e := scanFinanceEntry(rows)
			if e != nil {
				rows.Close()
				return nil, 0, e
			}
			result.Entries = append(result.Entries, value)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, 0, err
		}
		if len(result.Entries) > personalFinanceMaxEntries {
			return nil, 0, financeError{422, "В периоде больше 5000 доходов. Выберите меньший период — данные не обрезаны"}
		}
		result.Expenses, err = readFinanceExpenses(tx, r, from, to)
		if err != nil {
			return nil, 0, err
		}
		result.Balances, err = readFinanceBalances(tx, r, result.Buckets, from, to)
		if err != nil {
			return nil, 0, err
		}
		result.Categories, err = readFinanceCategories(tx, r)
		if err != nil {
			return nil, 0, err
		}
		if err = hydrateFinanceOverview(tx, r, &result); err != nil {
			return nil, 0, err
		}
		result.BalanceThrough = to
		return result, 200, nil
	})
}

func (s *Server) handleFinanceBucket(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name             string `json:"name"`
		Destination      string `json:"destination"`
		Archived         bool   `json:"archived"`
		ExpectedRevision int64  `json:"expectedRevision"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Destination = strings.TrimSpace(input.Destination)
	if input.Name == "" || len([]rune(input.Name)) > 120 || len([]rune(input.Destination)) > 240 {
		financeWriteError(w, financeInvalid("Укажите название до 120 символов и назначение до 240 символов"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		id := r.PathValue("id")
		revision := int64(1)
		now := nowText()
		owner := tx.owner
		status := 201
		if r.Method == http.MethodPost {
			var err error
			id, err = newID()
			if err != nil {
				return nil, 0, err
			}
			_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_buckets(id,owner_id,name,destination,archived,revision,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)`, id, owner, input.Name, input.Destination, input.Archived, now, now)
			if err != nil {
				return nil, 0, err
			}
		} else {
			if err := tx.QueryRowContext(r.Context(), `SELECT revision FROM personal_finance_buckets WHERE owner_id=? AND id=?`, owner, id).Scan(&revision); err != nil {
				return nil, 0, err
			}
			if revision != input.ExpectedRevision {
				return nil, 0, financeConflict("Счёт уже изменён. Обновите данные")
			}
			revision++
			status = 200
			result, err := tx.ExecContext(r.Context(), `UPDATE personal_finance_buckets SET name=?,destination=?,archived=?,revision=?,updated_at=? WHERE owner_id=? AND id=? AND revision=?`, input.Name, input.Destination, input.Archived, revision, now, owner, id, input.ExpectedRevision)
			if err != nil {
				return nil, 0, err
			}
			if count, err := result.RowsAffected(); err != nil {
				return nil, 0, err
			} else if count != 1 {
				return nil, 0, financeConflict("Счёт уже изменён. Обновите данные")
			}
		}
		return financeBucket{id, input.Name, input.Destination, input.Archived, revision}, status, nil
	})
}

func financeValidateRules(rules []financeRule) error {
	if len(rules) < 1 || len(rules) > 20 {
		return financeInvalid("Распределите доход между 1–20 счетами")
	}
	var sum int64
	seen := map[string]bool{}
	for _, rule := range rules {
		if rule.BucketID == "" || seen[rule.BucketID] || rule.BasisPoints <= 0 || rule.BasisPoints > 10000 {
			return financeInvalid("Счета не должны повторяться; доля должна быть больше 0 и не больше 100%")
		}
		seen[rule.BucketID] = true
		sum += rule.BasisPoints
	}
	if sum != 10000 {
		return financeInvalid("Сумма долей должна быть ровно 100%")
	}
	return nil
}
func financeSnapshotRules(tx *financeTx, r *http.Request, rules []financeRule) ([]financeAllocation, error) {
	return financeReadRules(tx, r, rules, true)
}
func financeReadRules(tx *financeTx, r *http.Request, rules []financeRule, requireActive bool) ([]financeAllocation, error) {
	if err := financeValidateRules(rules); err != nil {
		return nil, err
	}
	result := make([]financeAllocation, 0, len(rules))
	for _, rule := range rules {
		var name string
		err := tx.QueryRowContext(r.Context(), `SELECT name FROM personal_finance_buckets WHERE owner_id=? AND id=? AND (?=0 OR archived=0)`, tx.owner, rule.BucketID, requireActive).Scan(&name)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, financeInvalid("Выберите свои действующие счета для всех долей")
		}
		if err != nil {
			return nil, err
		}
		result = append(result, financeAllocation{BucketID: rule.BucketID, BucketName: name, BasisPoints: rule.BasisPoints})
	}
	return result, nil
}
func (s *Server) handleFinanceSource(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name             string        `json:"name"`
		DeductWorkers    bool          `json:"deductWorkers"`
		Allocations      []financeRule `json:"allocations"`
		Archived         bool          `json:"archived"`
		ExpectedRevision int64         `json:"expectedRevision"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 120 {
		financeWriteError(w, financeInvalid("Укажите название источника до 120 символов"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		id := r.PathValue("id")
		revision := int64(1)
		status := 201
		allowArchivedBuckets := false
		if r.Method != http.MethodPost {
			before, err := readFinanceSource(tx, r, id)
			if err != nil {
				return nil, 0, err
			}
			if input.ExpectedRevision != before.Revision {
				return nil, 0, financeConflict("Источник уже изменён. Обновите данные")
			}
			revision = before.Revision + 1
			status = 200
			// Retiring an unchanged rule set must remain possible after a bucket
			// was retired. Restoration or changed rules still need active buckets.
			allowArchivedBuckets = input.Archived && slices.Equal(input.Allocations, before.Allocations)
		}
		if _, err := financeReadRules(tx, r, input.Allocations, !allowArchivedBuckets); err != nil {
			return nil, 0, err
		}
		data, err := json.Marshal(input.Allocations)
		if err != nil {
			return nil, 0, err
		}
		now := nowText()
		owner := tx.owner
		if r.Method == http.MethodPost {
			id, err = newID()
			if err != nil {
				return nil, 0, err
			}
			_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_sources(id,owner_id,name,deduct_workers,allocations_json,archived,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)`, id, owner, input.Name, input.DeductWorkers, string(data), input.Archived, now, now)
		} else {
			var result sql.Result
			result, err = tx.ExecContext(r.Context(), `UPDATE personal_finance_sources SET name=?,deduct_workers=?,allocations_json=?,archived=?,revision=?,updated_at=? WHERE owner_id=? AND id=? AND revision=?`, input.Name, input.DeductWorkers, string(data), input.Archived, revision, now, owner, id, input.ExpectedRevision)
			if err == nil {
				var count int64
				count, err = result.RowsAffected()
				if err == nil && count != 1 {
					err = financeConflict("Источник уже изменён. Обновите данные")
				}
			}
		}
		if err != nil {
			return nil, 0, err
		}
		return financeSource{id, input.Name, input.DeductWorkers, input.Allocations, input.Archived, revision}, status, nil
	})
}

// Integer kopecks only. The maximum product is 1e12*1e4=1e16, below int64.
// Largest remainders receive the remaining kopecks; equal remainders use the
// persisted rule order so repeated previews/edits cannot move a random kopeck.
func financeAllocate(base int64, rules []financeAllocation) ([]financeAllocation, error) {
	if base < 0 || base > personalFinanceMaxMinor {
		return nil, financeInvalid("Недопустимая сумма распределения")
	}
	check := make([]financeRule, len(rules))
	for i, rule := range rules {
		check[i] = financeRule{rule.BucketID, rule.BasisPoints}
	}
	if err := financeValidateRules(check); err != nil {
		return nil, err
	}
	result := append([]financeAllocation(nil), rules...)
	order := make([]int, len(result))
	var used int64
	for i := range result {
		result[i].AmountMinor = base * result[i].BasisPoints / 10000
		used += result[i].AmountMinor
		order[i] = i
	}
	sort.SliceStable(order, func(i, j int) bool {
		return base*result[order[i]].BasisPoints%10000 > base*result[order[j]].BasisPoints%10000
	})
	for i := int64(0); i < base-used; i++ {
		result[order[i]].AmountMinor++
	}
	for _, item := range result {
		if item.PaidMinor < 0 || item.PaidMinor > item.AmountMinor {
			return nil, financeConflict("Уже отмеченный перевод превышает новую долю. Сначала исправьте отметку перевода")
		}
	}
	return result, nil
}
func financeHasPaid(entry financeEntry) bool {
	for _, value := range entry.Allocations {
		if value.PaidMinor > 0 {
			return true
		}
	}
	return false
}

func financePrepareEntry(tx *financeTx, r *http.Request, input financeEntryInput, prior *financeEntry) (financeEntry, error) {
	entry := financeEntry{}
	if !validFinanceDate(input.Date) {
		return entry, financeInvalid("Выберите дату дохода с 1 января 1900 года по 31 декабря 9998 года")
	}
	if input.GrossMinor <= 0 || input.GrossMinor > personalFinanceMaxMinor || input.WorkerMinor < 0 || input.WorkerMinor > input.GrossMinor || len([]rune(input.Payer)) > 160 || len([]rune(input.Note)) > 2000 {
		return entry, financeInvalid("Проверьте дату, сумму, расходы и длину заметки")
	}
	if prior != nil {
		entry = *prior
		if entry.Voided {
			return entry, financeConflict("Сначала восстановите отменённый доход")
		}
		if input.ExpectedRevision != entry.Revision {
			return entry, financeConflict("Доход уже изменён. Обновите данные")
		}
	}
	if prior == nil || prior.SourceID != input.SourceID {
		if prior != nil && financeHasPaid(*prior) {
			return entry, financeConflict("Нельзя сменить источник после отметки перевода")
		}
		source, err := readFinanceSource(tx, r, input.SourceID)
		if err != nil {
			return entry, err
		}
		if input.ExpectedSourceRevision != source.Revision {
			return entry, financeConflict("Схема источника изменилась. Обновите данные и проверьте распределение")
		}
		if source.Archived {
			return entry, financeInvalid("Выберите действующий источник дохода")
		}
		entry.Allocations, err = financeSnapshotRules(tx, r, source.Allocations)
		if err != nil {
			return entry, err
		}
		entry.SourceID = source.ID
		entry.SourceName = source.Name
		entry.DeductWorkers = source.DeductWorkers
	}
	if !entry.DeductWorkers && input.WorkerMinor != 0 {
		return entry, financeInvalid("Этот источник не предусматривает расходы работникам")
	}
	payerID, payer, err := financeResolvePayer(tx, r, input, prior)
	if err != nil {
		return entry, err
	}
	entry.Date = input.Date
	entry.Payer = payer
	entry.PayerID = payerID
	entry.Note = input.Note
	entry.GrossMinor = input.GrossMinor
	entry.WorkerMinor = input.WorkerMinor
	entry.BaseMinor = input.GrossMinor - input.WorkerMinor
	entry.Allocations, err = financeAllocate(entry.BaseMinor, entry.Allocations)
	return entry, err
}

func updateFinanceEntry(tx *financeTx, r *http.Request, entry *financeEntry, expected int64) error {
	data, err := json.Marshal(entry.Allocations)
	if err != nil {
		return err
	}
	entry.UpdatedAt = nowText()
	entry.Revision = expected + 1
	result, err := tx.ExecContext(r.Context(), `UPDATE personal_finance_entries SET source_id=?,source_name=?,deduct_workers=?,date=?,payer=?,note=?,gross_minor=?,worker_minor=?,base_minor=?,allocations_json=?,revision=?,voided=?,updated_at=?,payer_id=NULLIF(?,'') WHERE owner_id=? AND id=? AND revision=?`, entry.SourceID, entry.SourceName, entry.DeductWorkers, entry.Date, entry.Payer, entry.Note, entry.GrossMinor, entry.WorkerMinor, entry.BaseMinor, string(data), entry.Revision, entry.Voided, entry.UpdatedAt, entry.PayerID, tx.owner, entry.ID, expected)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n != 1 {
		return financeConflict("Доход уже изменён. Обновите данные")
	}
	return err
}

func (s *Server) handleFinanceEntry(w http.ResponseWriter, r *http.Request) {
	var input financeEntryInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Payer = strings.TrimSpace(input.Payer)
	input.Note = strings.TrimSpace(input.Note)
	input.SourceID = strings.TrimSpace(input.SourceID)
	if r.Method == http.MethodPost && (len(input.ClientRequestID) < 8 || len(input.ClientRequestID) > 128 || strings.TrimSpace(input.ClientRequestID) != input.ClientRequestID || input.ExpectedRevision != 0) {
		financeWriteError(w, financeInvalid("Нужен уникальный ключ создания дохода"))
		return
	}
	if r.Method == http.MethodPut && input.ClientRequestID != "" {
		financeWriteError(w, financeInvalid("Ключ создания не используется при изменении дохода"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		owner := tx.owner
		var prior *financeEntry
		var fingerprint string
		if r.Method == http.MethodPost {
			canonical := input
			canonical.ClientRequestID = ""
			payload, _ := json.Marshal(canonical)
			sum := sha256.Sum256(payload)
			fingerprint = hex.EncodeToString(sum[:])
			var previousHash, id string
			err := tx.QueryRowContext(r.Context(), `SELECT payload_hash,entry_id FROM personal_finance_requests WHERE owner_id=? AND request_id=?`, owner, input.ClientRequestID).Scan(&previousHash, &id)
			if err == nil {
				if previousHash != fingerprint {
					return nil, 0, financeConflict("Этот запрос уже использован с другими данными")
				}
				existing, e := readFinanceEntry(tx, r, id)
				return existing, 200, e
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return nil, 0, err
			}
		} else {
			value, err := readFinanceEntry(tx, r, r.PathValue("id"))
			if err != nil {
				return nil, 0, err
			}
			prior = &value
		}
		entry, err := financePrepareEntry(tx, r, input, prior)
		if err != nil {
			return nil, 0, err
		}
		var previousOrganization financeOrganization
		if prior != nil {
			previousOrganization = prior.financeOrganization
		}
		organization, err := prepareFinanceOrganization(tx, r, input.financeOrganizationInput, previousOrganization)
		if err != nil {
			return nil, 0, err
		}
		entry.financeOrganization = organization
		if prior != nil {
			err = updateFinanceEntry(tx, r, &entry, prior.Revision)
			if err == nil {
				err = saveFinanceOrganization(tx, r, "income", entry.ID, input.financeOrganizationInput, organization)
			}
			return entry, 200, err
		}
		entry.ID, err = newID()
		if err != nil {
			return nil, 0, err
		}
		entry.Revision = 1
		entry.CreatedAt = nowText()
		entry.UpdatedAt = entry.CreatedAt
		data, err := json.Marshal(entry.Allocations)
		if err != nil {
			return nil, 0, err
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_entries(id,owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at,payer_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,NULLIF(?,''))`, entry.ID, owner, entry.SourceID, entry.SourceName, entry.DeductWorkers, entry.Date, entry.Payer, entry.Note, entry.GrossMinor, entry.WorkerMinor, entry.BaseMinor, string(data), entry.CreatedAt, entry.UpdatedAt, entry.PayerID)
		if err != nil {
			return nil, 0, err
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_requests(owner_id,request_id,payload_hash,entry_id,created_at) VALUES(?,?,?,?,?)`, owner, input.ClientRequestID, fingerprint, entry.ID, entry.CreatedAt)
		if err == nil {
			err = saveFinanceOrganization(tx, r, "income", entry.ID, input.financeOrganizationInput, organization)
		}
		return entry, 201, err
	})
}

func (s *Server) handleFinanceTransfer(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedRevision int64  `json:"expectedRevision"`
		BucketID         string `json:"bucketId"`
		PaidMinor        *int64 `json:"paidMinor"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.PaidMinor == nil {
		financeWriteError(w, financeInvalid("Укажите отмеченную сумму перевода, включая ноль при исправлении"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		entry, err := readFinanceEntry(tx, r, r.PathValue("id"))
		if err != nil {
			return nil, 0, err
		}
		if entry.Revision != input.ExpectedRevision {
			return nil, 0, financeConflict("Доход уже изменён. Обновите данные")
		}
		if entry.Voided {
			return nil, 0, financeConflict("Сначала восстановите отменённый доход")
		}
		found := false
		for i := range entry.Allocations {
			if entry.Allocations[i].BucketID == input.BucketID {
				found = true
				if *input.PaidMinor < 0 || *input.PaidMinor > entry.Allocations[i].AmountMinor {
					return nil, 0, financeInvalid("Отмеченный перевод должен быть от 0 до суммы доли")
				}
				entry.Allocations[i].PaidMinor = *input.PaidMinor
			}
		}
		if !found {
			return nil, 0, financeNotFound()
		}
		err = updateFinanceEntry(tx, r, &entry, input.ExpectedRevision)
		return entry, 200, err
	})
}
func (s *Server) handleFinanceVoid(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedRevision int64 `json:"expectedRevision"`
		Voided           *bool `json:"voided"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Voided == nil {
		financeWriteError(w, financeInvalid("Укажите отмену или восстановление дохода"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		entry, err := readFinanceEntry(tx, r, r.PathValue("id"))
		if err != nil {
			return nil, 0, err
		}
		if entry.Revision != input.ExpectedRevision {
			return nil, 0, financeConflict("Доход уже изменён. Обновите данные")
		}
		if *input.Voided && financeHasPaid(entry) {
			return nil, 0, financeConflict("Сначала исправьте отмеченные переводы, затем отмените доход")
		}
		entry.Voided = *input.Voided
		err = updateFinanceEntry(tx, r, &entry, input.ExpectedRevision)
		return entry, 200, err
	})
}
