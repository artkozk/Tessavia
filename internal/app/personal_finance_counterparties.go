package app

import (
	"net/http"
	"strings"
)

type financeCounterparty struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Note     string `json:"note"`
	Archived bool   `json:"archived"`
	Revision int64  `json:"revision"`
}

func readFinanceCounterparties(tx *financeTx, r *http.Request) ([]financeCounterparty, error) {
	result := []financeCounterparty{}
	rows, err := tx.QueryContext(r.Context(), `SELECT id,name,note,archived,revision FROM personal_finance_counterparties WHERE owner_id=? ORDER BY name,id`, tx.owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var item financeCounterparty
		if err = rows.Scan(&item.ID, &item.Name, &item.Note, &item.Archived, &item.Revision); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func readFinanceCounterparty(tx *financeTx, r *http.Request, id string) (financeCounterparty, error) {
	var item financeCounterparty
	err := tx.QueryRowContext(r.Context(), `SELECT id,name,note,archived,revision FROM personal_finance_counterparties WHERE owner_id=? AND id=?`, tx.owner, id).Scan(&item.ID, &item.Name, &item.Note, &item.Archived, &item.Revision)
	return item, err
}

func (s *Server) handleFinanceCounterparty(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name             string `json:"name"`
		Note             string `json:"note"`
		Archived         bool   `json:"archived"`
		ExpectedRevision int64  `json:"expectedRevision"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Note = strings.TrimSpace(input.Note)
	if input.Name == "" || len([]rune(input.Name)) > 160 || len([]rune(input.Note)) > 2000 {
		financeWriteError(w, financeInvalid("Укажите имя или название до 160 символов и пометку до 2000 символов"))
		return
	}
	s.financeTransaction(w, r, func(tx *financeTx) (any, int, error) {
		item := financeCounterparty{Name: input.Name, Note: input.Note, Archived: input.Archived, Revision: 1}
		now := nowText()
		owner := tx.owner
		if r.Method == http.MethodPost {
			var err error
			item.ID, err = newID()
			if err != nil {
				return nil, 0, err
			}
			_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_finance_counterparties(id,owner_id,name,note,archived,revision,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)`, item.ID, owner, item.Name, item.Note, item.Archived, now, now)
			return item, http.StatusCreated, err
		}
		before, err := readFinanceCounterparty(tx, r, r.PathValue("id"))
		if err != nil {
			return nil, 0, err
		}
		if before.Revision != input.ExpectedRevision {
			return nil, 0, financeConflict("Плательщик уже изменён. Обновите данные и проверьте имя и пометку")
		}
		item.ID = before.ID
		item.Revision = before.Revision + 1
		result, err := tx.ExecContext(r.Context(), `UPDATE personal_finance_counterparties SET name=?,note=?,archived=?,revision=?,updated_at=? WHERE owner_id=? AND id=? AND revision=?`, item.Name, item.Note, item.Archived, item.Revision, now, owner, item.ID, before.Revision)
		if err != nil {
			return nil, 0, err
		}
		count, err := result.RowsAffected()
		if err == nil && count != 1 {
			err = financeConflict("Плательщик уже изменён. Обновите данные")
		}
		return item, http.StatusOK, err
	})
}

func financeResolvePayer(tx *financeTx, r *http.Request, input financeEntryInput, prior *financeEntry) (string, string, error) {
	payerID := ""
	if input.PayerID != nil {
		payerID = strings.TrimSpace(*input.PayerID)
	} else if prior != nil {
		payerID = prior.PayerID
	}
	if payerID == "" {
		return "", input.Payer, nil
	}
	// A historical income keeps its chosen identity and displayed name, including
	// archived payers. An old client omitting payerId cannot silently unlink it.
	if prior != nil && payerID == prior.PayerID {
		return payerID, prior.Payer, nil
	}
	payer, err := readFinanceCounterparty(tx, r, payerID)
	if err != nil {
		return "", "", err
	}
	if payer.Revision != input.ExpectedPayerRevision {
		return "", "", financeConflict("Данные плательщика изменились. Обновите справочник и проверьте имя перед сохранением")
	}
	if payer.Archived {
		return "", "", financeInvalid("Выберите действующего плательщика или введите имя без привязки к справочнику")
	}
	return payer.ID, payer.Name, nil
}
