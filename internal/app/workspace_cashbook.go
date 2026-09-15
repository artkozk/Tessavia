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

type workspaceReceiptInput struct {
	financeOrganizationInput
	ClientRequestID        string  `json:"clientRequestId,omitempty"`
	ReceiptKind            string  `json:"receiptKind"`
	BucketID               string  `json:"bucketId"`
	ExpectedBucketRevision int64   `json:"expectedBucketRevision,omitempty"`
	Date                   string  `json:"date"`
	GrossMinor             int64   `json:"grossMinor"`
	Payer                  string  `json:"payer"`
	PayerID                *string `json:"payerId,omitempty"`
	ExpectedPayerRevision  int64   `json:"expectedPayerRevision,omitempty"`
	Note                   string  `json:"note"`
	ExpectedRevision       int64   `json:"expectedRevision,omitempty"`
}

type workspaceCashbookSummary struct {
	ContributionMinor int64 `json:"contributionMinor"`
	RevenueMinor      int64 `json:"revenueMinor"`
	OtherMinor        int64 `json:"otherMinor"`
	UnclassifiedMinor int64 `json:"unclassifiedMinor"`
	SpentMinor        int64 `json:"spentMinor"`
	WorkerMinor       int64 `json:"workerMinor"`
	BalanceMinor      int64 `json:"balanceMinor"`
}

func workspaceReceiptName(kind string) string {
	switch kind {
	case "contribution":
		return "Вложения"
	case "revenue":
		return "Доходы"
	case "other":
		return "Другие поступления"
	default:
		return ""
	}
}

// Existing migration probes construct a server over the previous schema.
// Reading that schema still reports legacy entries without inventing a kind.
func workspaceCashbookAvailable(tx *financeTx, r *http.Request) (bool, error) {
	var exists bool
	err := tx.Tx.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='workspace_finance_receipts')`).Scan(&exists)
	return exists, err
}

func readWorkspaceReceiptKind(tx *financeTx, r *http.Request, id string) (string, error) {
	enabled, err := workspaceCashbookAvailable(tx, r)
	if err != nil || !enabled {
		return "", err
	}
	var kind string
	err = tx.Tx.QueryRowContext(r.Context(), `SELECT receipt_kind FROM workspace_finance_receipts WHERE workspace_id=? AND entry_id=?`, tx.owner, id).Scan(&kind)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return kind, err
}

// No account is seeded on GET. An omitted account is unambiguous only when
// there are zero or one active accounts in this ledger.
func workspaceCashbookBucket(tx *financeTx, r *http.Request, id string, expected int64) (financeBucket, error) {
	var bucket financeBucket
	if tx.scope == nil {
		return bucket, financeInvalid("Быстрый учёт доступен в финансах команды")
	}
	if id != "" {
		err := tx.QueryRowContext(r.Context(), `SELECT id,name,destination,archived,revision FROM personal_finance_buckets WHERE owner_id=? AND id=?`, tx.owner, id).Scan(&bucket.ID, &bucket.Name, &bucket.Destination, &bucket.Archived, &bucket.Revision)
		if err != nil {
			return bucket, err
		}
		if bucket.Archived {
			return bucket, financeInvalid("Выберите действующий счёт")
		}
		if expected != bucket.Revision {
			return bucket, financeConflict("Счёт уже изменён. Обновите данные и проверьте выбор")
		}
		return bucket, nil
	}
	rows, err := tx.QueryContext(r.Context(), `SELECT id,name,destination,archived,revision FROM personal_finance_buckets WHERE owner_id=? AND archived=0 ORDER BY created_at,id LIMIT 2`, tx.owner)
	if err != nil {
		return bucket, err
	}
	count := 0
	for rows.Next() {
		if err = rows.Scan(&bucket.ID, &bucket.Name, &bucket.Destination, &bucket.Archived, &bucket.Revision); err != nil {
			break
		}
		count++
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return bucket, err
	}
	if count > 1 {
		return bucket, financeInvalid("В бюджете несколько счетов. Выберите нужный")
	}
	if count == 1 {
		return bucket, nil
	}
	bucket = financeBucket{Name: "Бюджет проекта", Revision: 1}
	bucket.ID, err = newID()
	if err != nil {
		return bucket, err
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_buckets(id,owner_id,name,destination,archived,revision,created_at,updated_at) VALUES(?,?,?,'',0,1,?,?)`, bucket.ID, tx.owner, bucket.Name, nowText(), nowText())
	return bucket, err
}

func workspaceReceiptSource(tx *financeTx, r *http.Request, bucket financeBucket, kind string) (financeSource, error) {
	// Only explicitly marked system sources are reused. A user-defined source
	// with the same name must remain a separately configurable rule.
	rows, err := tx.Tx.QueryContext(r.Context(), `SELECT s.id,s.name,s.deduct_workers,s.allocations_json,s.archived,s.revision FROM workspace_finance_cashbook_sources c JOIN workspace_finance_sources s ON s.workspace_id=c.workspace_id AND s.id=c.source_id WHERE c.workspace_id=? AND c.bucket_id=? AND c.receipt_kind=? AND s.archived=0 ORDER BY s.created_at,s.id`, tx.owner, bucket.ID, kind)
	if err != nil {
		return financeSource{}, err
	}
	var source financeSource
	found := false
	for rows.Next() {
		var raw string
		if err = rows.Scan(&source.ID, &source.Name, &source.DeductWorkers, &raw, &source.Archived, &source.Revision); err != nil {
			break
		}
		if err = json.Unmarshal([]byte(raw), &source.Allocations); err != nil {
			break
		}
		if !source.DeductWorkers && len(source.Allocations) == 1 && source.Allocations[0] == (financeRule{bucket.ID, 10000}) {
			found = true
			break
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil || found {
		source.ReceiptKind = kind
		return source, err
	}
	source = financeSource{ReceiptKind: kind, Name: workspaceReceiptName(kind), Allocations: []financeRule{{bucket.ID, 10000}}, Revision: 1}
	source.ID, err = newID()
	if err != nil {
		return source, err
	}
	rules, _ := json.Marshal(source.Allocations)
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_sources(id,owner_id,name,deduct_workers,allocations_json,archived,revision,created_at,updated_at) VALUES(?,?,?,0,?,0,1,?,?)`, source.ID, tx.owner, source.Name, string(rules), nowText(), nowText())
	if err == nil {
		_, err = tx.Tx.ExecContext(r.Context(), `INSERT INTO workspace_finance_cashbook_sources(workspace_id,source_id,receipt_kind,bucket_id) VALUES(?,?,?,?)`, tx.owner, source.ID, kind, bucket.ID)
	}
	return source, err
}

func (s *Server) handleReadWorkspaceReceipt(w http.ResponseWriter, r *http.Request) {
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		entry, err := readFinanceEntry(tx, r, r.PathValue("id"))
		if err == nil && entry.ReceiptKind == "" {
			err = financeNotFound()
		}
		return entry, 200, err
	})
}

func (s *Server) handleWorkspaceReceipt(w http.ResponseWriter, r *http.Request) {
	var input workspaceReceiptInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.BucketID, input.Payer, input.Note = strings.TrimSpace(input.BucketID), strings.TrimSpace(input.Payer), strings.TrimSpace(input.Note)
	if workspaceReceiptName(input.ReceiptKind) == "" {
		financeWriteError(w, financeInvalid("Выберите вложение, доход или другое поступление"))
		return
	}
	if r.Method == http.MethodPost && (len(input.ClientRequestID) < 8 || len(input.ClientRequestID) > 128 || strings.TrimSpace(input.ClientRequestID) != input.ClientRequestID || input.ExpectedRevision != 0) {
		financeWriteError(w, financeInvalid("Нужен уникальный ключ создания поступления"))
		return
	}
	if r.Method == http.MethodPut && input.ClientRequestID != "" {
		financeWriteError(w, financeInvalid("Ключ создания не используется при изменении поступления"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		var prior *financeEntry
		var fingerprint string
		if r.Method == http.MethodPost {
			canonical := input
			canonical.ClientRequestID = ""
			payload, _ := json.Marshal(canonical)
			// Different endpoint semantics cannot reuse a legacy income receipt.
			sum := sha256.Sum256(append([]byte("workspace-receipt-v1\n"), payload...))
			fingerprint = hex.EncodeToString(sum[:])
			var previousHash, id string
			err := tx.QueryRowContext(r.Context(), `SELECT payload_hash,entry_id FROM personal_finance_requests WHERE owner_id=? AND request_id=?`, tx.owner, input.ClientRequestID).Scan(&previousHash, &id)
			if err == nil {
				if previousHash != fingerprint {
					return nil, 0, financeConflict("Этот запрос уже использован с другими данными")
				}
				entry, err := readFinanceEntry(tx, r, id)
				return entry, 200, err
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return nil, 0, err
			}
		} else {
			entry, err := readFinanceEntry(tx, r, r.PathValue("id"))
			if err != nil {
				return nil, 0, err
			}
			if entry.ReceiptKind == "" {
				return nil, 0, financeConflict("Прежнее поступление сохраняет своё распределение. Измените его в исходной форме")
			}
			prior = &entry
		}
		var source financeSource
		var err error
		if prior != nil && prior.ReceiptKind == input.ReceiptKind && len(prior.Allocations) == 1 && input.BucketID == prior.Allocations[0].BucketID {
			// Editing an existing receipt retains its recorded account/rule even
			// after archiving a dictionary item, just like the legacy ledger.
			// New receipts and changing the destination still require active items.
			source, err = readFinanceSource(tx, r, prior.SourceID)
		} else {
			var bucket financeBucket
			bucket, err = workspaceCashbookBucket(tx, r, input.BucketID, input.ExpectedBucketRevision)
			if err == nil {
				source, err = workspaceReceiptSource(tx, r, bucket, input.ReceiptKind)
			}
		}
		if err != nil {
			return nil, 0, err
		}
		preparedInput := financeEntryInput{financeOrganizationInput: input.financeOrganizationInput, SourceID: source.ID, ExpectedSourceRevision: source.Revision, Date: input.Date, Payer: input.Payer, PayerID: input.PayerID, ExpectedPayerRevision: input.ExpectedPayerRevision, Note: input.Note, GrossMinor: input.GrossMinor, ExpectedRevision: input.ExpectedRevision}
		entry, err := financePrepareEntry(tx, r, preparedInput, prior)
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
		entry.financeOrganization, entry.ReceiptKind = organization, input.ReceiptKind
		status := http.StatusCreated
		if prior != nil {
			status = http.StatusOK
			err = updateFinanceEntry(tx, r, &entry, prior.Revision)
		} else {
			entry.ID, err = newID()
			if err != nil {
				return nil, 0, err
			}
			entry.Revision, entry.CreatedAt = 1, nowText()
			entry.UpdatedAt = entry.CreatedAt
			allocations, _ := json.Marshal(entry.Allocations)
			_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_entries(id,owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at,payer_id) VALUES(?,?,?,?,0,?,?,?,?,0,?,?,1,0,?,?,NULLIF(?,''))`, entry.ID, tx.owner, entry.SourceID, entry.SourceName, entry.Date, entry.Payer, entry.Note, entry.GrossMinor, entry.BaseMinor, string(allocations), entry.CreatedAt, entry.UpdatedAt, entry.PayerID)
			if err == nil {
				_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_requests(owner_id,request_id,payload_hash,entry_id,created_at) VALUES(?,?,?,?,?)`, tx.owner, input.ClientRequestID, fingerprint, entry.ID, entry.CreatedAt)
			}
		}
		if err == nil {
			_, err = tx.Tx.ExecContext(r.Context(), `INSERT INTO workspace_finance_receipts(workspace_id,entry_id,receipt_kind) VALUES(?,?,?) ON CONFLICT(workspace_id,entry_id) DO UPDATE SET receipt_kind=excluded.receipt_kind`, tx.owner, entry.ID, entry.ReceiptKind)
		}
		if err == nil {
			err = saveFinanceOrganization(tx, r, "income", entry.ID, input.financeOrganizationInput, organization)
		}
		return entry, status, err
	})
}

func hydrateWorkspaceCashbook(tx *financeTx, r *http.Request, report *financeOverview) error {
	enabled, err := workspaceCashbookAvailable(tx, r)
	if err != nil || !enabled {
		return err
	}
	report.TeamSummary = &workspaceCashbookSummary{}
	visible := map[string]*financeEntry{}
	for i := range report.Entries {
		visible[report.Entries[i].ID] = &report.Entries[i]
	}
	// All dates, including recorded future operations, are intentional. A monthly
	// journal must not be mistaken for the team's complete funding and balance.
	rows, err := tx.Tx.QueryContext(r.Context(), `SELECT e.id,COALESCE(c.receipt_kind,''),e.gross_minor,e.worker_minor,e.voided FROM workspace_finance_entries e LEFT JOIN workspace_finance_receipts c ON c.workspace_id=e.workspace_id AND c.entry_id=e.id WHERE e.workspace_id=? ORDER BY e.date,e.id`, tx.owner)
	if err != nil {
		return err
	}
	var total, outflow int64
	for rows.Next() {
		var id, kind string
		var gross, worker int64
		var voided bool
		if err = rows.Scan(&id, &kind, &gross, &worker, &voided); err != nil {
			break
		}
		if entry := visible[id]; entry != nil {
			entry.ReceiptKind = kind
		}
		if voided {
			continue
		}
		if err = financeAddTotal(&total, gross); err != nil {
			break
		}
		var category *int64
		switch kind {
		case "contribution":
			category = &report.TeamSummary.ContributionMinor
		case "revenue":
			category = &report.TeamSummary.RevenueMinor
		case "other":
			category = &report.TeamSummary.OtherMinor
		default:
			category = &report.TeamSummary.UnclassifiedMinor
		}
		if err = financeAddTotal(category, gross); err != nil {
			break
		}
		if err = financeAddTotal(&report.TeamSummary.WorkerMinor, worker); err != nil {
			break
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return err
	}
	rows, err = tx.QueryContext(r.Context(), `SELECT amount_minor FROM personal_finance_expenses WHERE owner_id=? AND voided=0 ORDER BY date,id`, tx.owner)
	if err != nil {
		return err
	}
	for rows.Next() {
		var amount int64
		if err = rows.Scan(&amount); err != nil {
			break
		}
		if err = financeAddTotal(&report.TeamSummary.SpentMinor, amount); err != nil {
			break
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return err
	}
	if err = financeAddTotal(&outflow, report.TeamSummary.WorkerMinor); err != nil {
		return err
	}
	if err = financeAddTotal(&outflow, report.TeamSummary.SpentMinor); err != nil {
		return err
	}
	report.TeamSummary.BalanceMinor = total - outflow
	rows, err = tx.Tx.QueryContext(r.Context(), `SELECT source_id,receipt_kind,bucket_id FROM workspace_finance_cashbook_sources WHERE workspace_id=?`, tx.owner)
	if err != nil {
		return err
	}
	defer rows.Close()
	sources := map[string]*financeSource{}
	for i := range report.Sources {
		sources[report.Sources[i].ID] = &report.Sources[i]
	}
	for rows.Next() {
		var id, kind, bucketID string
		if err = rows.Scan(&id, &kind, &bucketID); err != nil {
			return err
		}
		if source := sources[id]; source != nil && !source.DeductWorkers && len(source.Allocations) == 1 && source.Allocations[0] == (financeRule{bucketID, 10000}) {
			source.ReceiptKind = kind
		}
	}
	return rows.Err()
}
