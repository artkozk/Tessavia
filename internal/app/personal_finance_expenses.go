package app

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

// JSON numbers must remain exact in browsers as well as on the server.
const personalFinanceMaxTotalMinor int64 = 9_007_199_254_740_991

type financeExpense struct {
	ID          string `json:"id"`
	BucketID    string `json:"bucketId"`
	BucketName  string `json:"bucketName"`
	Date        string `json:"date"`
	AmountMinor int64  `json:"amountMinor"`
	Payee       string `json:"payee"`
	Note        string `json:"note"`
	Revision    int64  `json:"revision"`
	Voided      bool   `json:"voided"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type financeExpenseInput struct {
	ClientRequestID        string `json:"clientRequestId,omitempty"`
	BucketID               string `json:"bucketId"`
	ExpectedBucketRevision int64  `json:"expectedBucketRevision,omitempty"`
	Date                   string `json:"date"`
	AmountMinor            int64  `json:"amountMinor"`
	Payee                  string `json:"payee"`
	Note                   string `json:"note"`
	ExpectedRevision       int64  `json:"expectedRevision,omitempty"`
}

type financeBalance struct {
	BucketID             string `json:"bucketId"`
	AllocatedMinor       int64  `json:"allocatedMinor"`
	SpentMinor           int64  `json:"spentMinor"`
	BalanceMinor         int64  `json:"balanceMinor"`
	PeriodAllocatedMinor int64  `json:"periodAllocatedMinor"`
	PeriodSpentMinor     int64  `json:"periodSpentMinor"`
	OpeningMinor         int64  `json:"openingMinor"`
}

const financeExpenseColumns = `id,bucket_id,bucket_name,date,amount_minor,payee,note,revision,voided,created_at,updated_at`

func scanFinanceExpense(row financeScanner) (financeExpense, error) {
	var value financeExpense
	err := row.Scan(&value.ID, &value.BucketID, &value.BucketName, &value.Date, &value.AmountMinor, &value.Payee, &value.Note, &value.Revision, &value.Voided, &value.CreatedAt, &value.UpdatedAt)
	return value, err
}

func readFinanceExpense(tx *financeTx, r *http.Request, id string) (financeExpense, error) {
	return scanFinanceExpense(tx.QueryRowContext(r.Context(), `SELECT `+financeExpenseColumns+` FROM personal_finance_expenses WHERE owner_id=? AND id=?`, tx.owner, id))
}

func readFinanceExpenses(tx *financeTx, r *http.Request, from, to string) ([]financeExpense, error) {
	result := []financeExpense{}
	rows, err := tx.QueryContext(r.Context(), `SELECT `+financeExpenseColumns+` FROM personal_finance_expenses WHERE owner_id=? AND date>=? AND date<=? ORDER BY date DESC,created_at DESC,id DESC LIMIT ?`, tx.owner, from, to, personalFinanceMaxEntries+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		value, err := scanFinanceExpense(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if len(result) > personalFinanceMaxEntries {
		return nil, financeError{422, "В периоде больше 5000 расходов. Выберите меньший период — данные не обрезаны"}
	}
	return result, nil
}

func financeAddTotal(total *int64, amount int64) error {
	if amount < 0 || amount > personalFinanceMaxTotalMinor || *total < 0 || *total > personalFinanceMaxTotalMinor-amount {
		return financeError{422, "Суммы истории превышают точный диапазон отчёта. Итоги не округлены; записи сохранены"}
	}
	*total += amount
	return nil
}

// Read all history independently of the journal's date range and row cap.
// A bucket is an envelope: paidMinor only marks a transfer and is not spending.
func readFinanceBalances(tx *financeTx, r *http.Request, buckets []financeBucket, from, to string) ([]financeBalance, error) {
	result := make([]financeBalance, len(buckets))
	indices := make(map[string]int, len(buckets))
	for i, bucket := range buckets {
		result[i].BucketID = bucket.ID
		indices[bucket.ID] = i
	}
	owner := tx.owner
	var totalAllocated, totalSpent int64
	rows, err := tx.QueryContext(r.Context(), `SELECT date,allocations_json FROM personal_finance_entries WHERE owner_id=? AND voided=0 AND date<=? ORDER BY date,id`, owner, to)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var date, data string
		if err = rows.Scan(&date, &data); err != nil {
			break
		}
		var allocations []financeAllocation
		if err = json.Unmarshal([]byte(data), &allocations); err != nil {
			break
		}
		for _, allocation := range allocations {
			if err = financeAddTotal(&totalAllocated, allocation.AmountMinor); err != nil {
				break
			}
			index, exists := indices[allocation.BucketID]
			if !exists {
				// A broken reference must not silently hide money from the total.
				err = errors.New("finance allocation references missing private bucket")
				break
			}
			balance := &result[index]
			if err = financeAddTotal(&balance.AllocatedMinor, allocation.AmountMinor); err != nil {
				break
			}
			if date >= from {
				err = financeAddTotal(&balance.PeriodAllocatedMinor, allocation.AmountMinor)
				if err != nil {
					break
				}
			}
		}
		if err != nil {
			break
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return nil, err
	}
	rows, err = tx.QueryContext(r.Context(), `SELECT bucket_id,date,amount_minor FROM personal_finance_expenses WHERE owner_id=? AND voided=0 AND date<=? ORDER BY date,id`, owner, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var bucket, date string
		var amount int64
		if err = rows.Scan(&bucket, &date, &amount); err != nil {
			return nil, err
		}
		index, exists := indices[bucket]
		if !exists {
			return nil, errors.New("finance expense references missing private bucket")
		}
		balance := &result[index]
		if err = financeAddTotal(&totalSpent, amount); err != nil {
			return nil, err
		}
		if err = financeAddTotal(&balance.SpentMinor, amount); err != nil {
			return nil, err
		}
		if date >= from {
			if err = financeAddTotal(&balance.PeriodSpentMinor, amount); err != nil {
				return nil, err
			}
		}
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	for i := range result {
		balance := &result[i]
		balance.BalanceMinor = balance.AllocatedMinor - balance.SpentMinor
		balance.OpeningMinor = (balance.AllocatedMinor - balance.PeriodAllocatedMinor) - (balance.SpentMinor - balance.PeriodSpentMinor)
	}
	return result, nil
}

func financePrepareExpense(tx *financeTx, r *http.Request, input financeExpenseInput, prior *financeExpense) (financeExpense, error) {
	expense := financeExpense{}
	if prior != nil {
		expense = *prior
		if input.ExpectedRevision != expense.Revision {
			return expense, financeConflict("Расход уже изменён. Обновите данные")
		}
		if expense.Voided {
			return expense, financeConflict("Сначала восстановите отменённый расход")
		}
	}
	if !validFinanceDate(input.Date) || input.AmountMinor <= 0 || input.AmountMinor > personalFinanceMaxMinor || len([]rune(input.Payee)) > 120 || len([]rune(input.Note)) > 2000 {
		return expense, financeInvalid("Укажите дату 1900–9998 годов, положительную сумму, получателя до 120 символов и заметку до 2000 символов")
	}
	if prior == nil || prior.BucketID != input.BucketID {
		var bucket financeBucket
		err := tx.QueryRowContext(r.Context(), `SELECT id,name,archived,revision FROM personal_finance_buckets WHERE owner_id=? AND id=?`, tx.owner, input.BucketID).Scan(&bucket.ID, &bucket.Name, &bucket.Archived, &bucket.Revision)
		if err != nil {
			return expense, err
		}
		if input.ExpectedBucketRevision != bucket.Revision {
			return expense, financeConflict("Счёт уже изменён. Обновите данные и проверьте выбор")
		}
		if bucket.Archived {
			return expense, financeInvalid("Выберите действующий счёт для нового расхода")
		}
		expense.BucketID = bucket.ID
		expense.BucketName = bucket.Name
	}
	expense.Date = input.Date
	expense.AmountMinor = input.AmountMinor
	expense.Payee = input.Payee
	expense.Note = input.Note
	return expense, nil
}

func updateFinanceExpense(tx *financeTx, r *http.Request, expense *financeExpense, expected int64) error {
	expense.UpdatedAt = nowText()
	expense.Revision = expected + 1
	result, err := tx.ExecContext(r.Context(), `UPDATE personal_finance_expenses SET bucket_id=?,bucket_name=?,date=?,amount_minor=?,payee=?,note=?,revision=?,voided=?,updated_at=? WHERE owner_id=? AND id=? AND revision=?`, expense.BucketID, expense.BucketName, expense.Date, expense.AmountMinor, expense.Payee, expense.Note, expense.Revision, expense.Voided, expense.UpdatedAt, tx.owner, expense.ID, expected)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n != 1 {
		return financeConflict("Расход уже изменён. Обновите данные")
	}
	return err
}

func (s *Server) handleFinanceExpense(w http.ResponseWriter, r *http.Request) {
	var input financeExpenseInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.BucketID = strings.TrimSpace(input.BucketID)
	input.Payee = strings.TrimSpace(input.Payee)
	input.Note = strings.TrimSpace(input.Note)
	if r.Method == http.MethodPost && (len(input.ClientRequestID) < 8 || len(input.ClientRequestID) > 128 || strings.TrimSpace(input.ClientRequestID) != input.ClientRequestID || input.ExpectedRevision != 0) {
		financeWriteError(w, financeInvalid("Нужен уникальный ключ создания расхода"))
		return
	}
	if r.Method == http.MethodPut && input.ClientRequestID != "" {
		financeWriteError(w, financeInvalid("Ключ создания не используется при изменении расхода"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		owner := tx.owner
		var prior *financeExpense
		var fingerprint string
		if r.Method == http.MethodPost {
			canonical := input
			canonical.ClientRequestID = ""
			payload, _ := json.Marshal(canonical)
			sum := sha256.Sum256(payload)
			fingerprint = hex.EncodeToString(sum[:])
			var previousHash, id string
			err := tx.QueryRowContext(r.Context(), `SELECT payload_hash,expense_id FROM personal_finance_expense_requests WHERE owner_id=? AND request_id=?`, owner, input.ClientRequestID).Scan(&previousHash, &id)
			if err == nil {
				if previousHash != fingerprint {
					return nil, 0, financeConflict("Этот запрос уже использован с другими данными")
				}
				existing, e := readFinanceExpense(tx, r, id)
				return existing, 200, e
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return nil, 0, err
			}
		} else {
			value, err := readFinanceExpense(tx, r, r.PathValue("id"))
			if err != nil {
				return nil, 0, err
			}
			prior = &value
		}
		expense, err := financePrepareExpense(tx, r, input, prior)
		if err != nil {
			return nil, 0, err
		}
		if prior != nil {
			err = updateFinanceExpense(tx, r, &expense, prior.Revision)
			return expense, 200, err
		}
		expense.ID, err = newID()
		if err != nil {
			return nil, 0, err
		}
		expense.Revision = 1
		expense.CreatedAt = nowText()
		expense.UpdatedAt = expense.CreatedAt
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_expenses(id,owner_id,bucket_id,bucket_name,date,amount_minor,payee,note,revision,voided,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,0,?,?)`, expense.ID, owner, expense.BucketID, expense.BucketName, expense.Date, expense.AmountMinor, expense.Payee, expense.Note, expense.CreatedAt, expense.UpdatedAt)
		if err != nil {
			return nil, 0, err
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_expense_requests(owner_id,request_id,payload_hash,expense_id,created_at) VALUES(?,?,?,?,?)`, owner, input.ClientRequestID, fingerprint, expense.ID, expense.CreatedAt)
		return expense, 201, err
	})
}

// Conflict recovery works even when another session moved an expense outside
// the selected period. It uses the same account boundary as the journal.
func (s *Server) handleReadFinanceExpense(w http.ResponseWriter, r *http.Request) {
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		expense, err := readFinanceExpense(tx, r, r.PathValue("id"))
		return expense, 200, err
	})
}

func (s *Server) handleFinanceExpenseVoid(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedRevision int64 `json:"expectedRevision"`
		Voided           *bool `json:"voided"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Voided == nil {
		financeWriteError(w, financeInvalid("Укажите отмену или восстановление расхода"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		expense, err := readFinanceExpense(tx, r, r.PathValue("id"))
		if err != nil {
			return nil, 0, err
		}
		if expense.Revision != input.ExpectedRevision {
			return nil, 0, financeConflict("Расход уже изменён. Обновите данные")
		}
		expense.Voided = *input.Voided
		err = updateFinanceExpense(tx, r, &expense, input.ExpectedRevision)
		return expense, 200, err
	})
}
