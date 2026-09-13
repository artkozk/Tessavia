package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

// These numbers are portable constants only. Personal inputs are never stored
// in PageAppDefinition, template JSON, activity metadata or project records.
type PageSheetConfig struct {
	Rows []PageSheetRow `json:"rows"`
}

type PageSheetRow struct {
	ID        string            `json:"id"`
	Label     string            `json:"label"`
	Kind      string            `json:"kind"`
	Unit      string            `json:"unit,omitempty"`
	Precision *int              `json:"precision,omitempty"`
	Value     *string           `json:"value,omitempty"`
	Start     *PageSheetOperand `json:"start,omitempty"`
	Steps     []PageSheetStep   `json:"steps,omitempty"`
}

type PageSheetOperand struct {
	RowID string  `json:"rowId,omitempty"`
	Value *string `json:"value,omitempty"`
}

type PageSheetStep struct {
	Operation string  `json:"operation"`
	RowID     string  `json:"rowId,omitempty"`
	Value     *string `json:"value,omitempty"`
}

type PageSheetState struct {
	Values   map[string]string `json:"values"`
	Revision int               `json:"revision"`
}

var pageSheetDecimal = regexp.MustCompile(`^-?[0-9]{1,13}(\.[0-9]{1,6})?$`)

// Validate decimal text without float conversion: all supported values fit in
// signed int64 micro-units, including the +/- 10^12 boundary.
func normalizePageSheetDecimal(value string) (string, error) {
	if !pageSheetDecimal.MatchString(value) {
		return "", errors.New("Введите десятичное число: до 6 знаков после точки, без экспоненты")
	}
	negative := strings.HasPrefix(value, "-")
	unsigned := strings.TrimPrefix(value, "-")
	parts := strings.SplitN(unsigned, ".", 2)
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return "", errors.New("Число вне допустимого диапазона")
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = strings.TrimRight(parts[1], "0")
	}
	if whole > 1_000_000_000_000 || (whole == 1_000_000_000_000 && fraction != "") {
		return "", errors.New("Число по модулю не должно превышать 10¹²")
	}
	canonical := strconv.FormatInt(whole, 10)
	if fraction != "" {
		canonical += "." + fraction
	}
	if negative && canonical != "0" {
		canonical = "-" + canonical
	}
	return canonical, nil
}

func validatePageSheet(block *PageAppBlock) error {
	if block.Sheet == nil {
		if block.Kind == "sheet" {
			return errors.New("Добавьте строки расчётного листа")
		}
		return nil
	}
	// Inactive settings must remain valid and portable after a kind switch.
	if len(block.Sheet.Rows) == 0 || len(block.Sheet.Rows) > 40 {
		return errors.New("В расчётном листе должно быть от 1 до 40 строк")
	}
	rows := map[string]*PageSheetRow{}
	for i := range block.Sheet.Rows {
		row := &block.Sheet.Rows[i]
		row.Label = strings.TrimSpace(row.Label)
		row.Unit = strings.TrimSpace(row.Unit)
		if !pageAppID.MatchString(row.ID) || rows[row.ID] != nil || row.Label == "" || len([]rune(row.Label)) > 160 || len([]rune(row.Unit)) > 32 {
			return errors.New("Укажите разные постоянные ключи строк, подписи до 160 и единицы до 32 символов")
		}
		if row.Precision != nil && (*row.Precision < 0 || *row.Precision > 6) {
			return errors.New("Точность строки — от 0 до 6 знаков после запятой")
		}
		if len(row.Steps) > 12 {
			return errors.New("В формуле допускается до 12 шагов")
		}
		switch row.Kind {
		case "input":
			if row.Value != nil || row.Start != nil || len(row.Steps) != 0 {
				return errors.New("Личные числа вводятся на странице, а не сохраняются в схеме поля ввода")
			}
		case "constant":
			if row.Value == nil || row.Start != nil || len(row.Steps) != 0 {
				return errors.New("Для постоянной строки задайте только число схемы")
			}
			value, err := normalizePageSheetDecimal(*row.Value)
			if err != nil {
				return fmt.Errorf("Строка «%s»: %w", row.Label, err)
			}
			row.Value = &value
		case "formula":
			if row.Value != nil || row.Start == nil {
				return errors.New("Для результата выберите начальное значение формулы")
			}
		default:
			return errors.New("Выберите тип строки: ввод, константа или результат")
		}
		rows[row.ID] = row
	}
	dependencies := map[string][]string{}
	for _, row := range block.Sheet.Rows {
		if row.Kind != "formula" {
			continue
		}
		validateOperand := func(rowID string, value **string) error {
			if (rowID != "") == (*value != nil) {
				return errors.New("Выберите ровно одну строку или одно постоянное число")
			}
			if rowID != "" {
				if rows[rowID] == nil {
					return errors.New("Формула ссылается на удалённую или недоступную строку этого листа")
				}
				dependencies[row.ID] = append(dependencies[row.ID], rowID)
				return nil
			}
			canonical, err := normalizePageSheetDecimal(**value)
			if err == nil {
				*value = &canonical
			}
			return err
		}
		if err := validateOperand(row.Start.RowID, &row.Start.Value); err != nil {
			return fmt.Errorf("Строка «%s»: %w", row.Label, err)
		}
		for i := range row.Steps {
			step := &row.Steps[i]
			switch step.Operation {
			case "add", "subtract", "multiply", "divide", "min", "max":
			default:
				return errors.New("Выберите доступную операцию расчётного листа")
			}
			if err := validateOperand(step.RowID, &step.Value); err != nil {
				return fmt.Errorf("Строка «%s»: %w", row.Label, err)
			}
		}
	}
	visited := map[string]int{}
	var visit func(string) error
	visit = func(id string) error {
		if visited[id] == 1 {
			return errors.New("В формулах найден замкнутый круг ссылок: результат не может зависеть от самого себя")
		}
		if visited[id] == 2 {
			return nil
		}
		visited[id] = 1
		for _, source := range dependencies[id] {
			if err := visit(source); err != nil {
				return err
			}
		}
		visited[id] = 2
		return nil
	}
	for id := range rows {
		if err := visit(id); err != nil {
			return err
		}
	}
	return nil
}

func sheetInputIDs(block PageAppBlock) map[string]bool {
	inputs := map[string]bool{}
	if block.Kind == "sheet" && block.Sheet != nil {
		for _, row := range block.Sheet.Rows {
			if row.Kind == "input" {
				inputs[row.ID] = true
			}
		}
	}
	return inputs
}

func (s *Server) readPageSheets(r *http.Request, definition PageAppDefinition) (map[string]PageSheetState, error) {
	result := map[string]PageSheetState{}
	inputs := map[string]map[string]bool{}
	for _, block := range definition.Blocks {
		if block.Kind == "sheet" && block.Sheet != nil {
			result[block.ID] = PageSheetState{Values: map[string]string{}}
			inputs[block.ID] = sheetInputIDs(block)
		}
	}
	if len(result) == 0 {
		return result, nil
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT block_id,values_json,revision FROM page_app_sheet_values WHERE page_id=? AND user_id=?`, r.PathValue("id"), currentUser(r).ID)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, raw string
		var revision int
		if err = rows.Scan(&id, &raw, &revision); err != nil {
			return result, err
		}
		if inputs[id] == nil {
			continue
		}
		var stored map[string]string
		if err = json.Unmarshal([]byte(raw), &stored); err != nil {
			return result, err
		}
		values := map[string]string{}
		for rowID, value := range stored {
			if inputs[id][rowID] {
				values[rowID] = value
			}
		}
		result[id] = PageSheetState{Values: values, Revision: revision}
	}
	return result, rows.Err()
}

// An ordinary page member can replace only their own active input snapshot.
// Both revisions protect against changing formulas and concurrent devices.
func (s *Server) handlePageAppSheet(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !s.pageAppExists(r) {
		writeError(w, 404, "Страница не найдена")
		return
	}
	var input struct {
		Values                 map[string]json.RawMessage `json:"values"`
		ExpectedRevision       *int                       `json:"expectedRevision"`
		ExpectedValuesRevision *int                       `json:"expectedValuesRevision"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Values == nil || len(input.Values) > 40 || input.ExpectedRevision == nil || *input.ExpectedRevision < 1 || input.ExpectedValuesRevision == nil || *input.ExpectedValuesRevision < 0 {
		writeError(w, 400, "Передайте значения и текущие версии страницы и личного ввода")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать сохранение чисел")
		return
	}
	defer tx.Rollback()
	var raw string
	var revision int
	err = tx.QueryRowContext(r.Context(), `SELECT d.definition_json,d.revision FROM page_app_definitions d JOIN workspace_pages p ON p.id=d.page_id WHERE d.page_id=? AND p.workspace_id=? AND p.archived_at IS NULL`, r.PathValue("id"), currentWorkspace(r).ID).Scan(&raw, &revision)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Страница ещё не настроена или больше не доступна")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать схему листа")
		return
	}
	if revision != *input.ExpectedRevision {
		writeError(w, 409, "Схема страницы изменилась. Обновите её перед сохранением чисел")
		return
	}
	var definition PageAppDefinition
	if json.Unmarshal([]byte(raw), &definition) != nil {
		writeError(w, 500, "Не удалось прочитать схему листа")
		return
	}
	var block *PageAppBlock
	for i := range definition.Blocks {
		candidate := &definition.Blocks[i]
		if candidate.ID == r.PathValue("blockId") && candidate.Kind == "sheet" && candidate.Sheet != nil && !candidate.Hidden {
			block = candidate
			break
		}
	}
	if block == nil {
		writeError(w, 400, "Расчётный лист больше не доступен")
		return
	}
	allowed := sheetInputIDs(*block)
	values := map[string]string{}
	for id, rawValue := range input.Values {
		if !allowed[id] {
			writeError(w, 400, "Менять можно только поля ввода этого листа")
			return
		}
		var value *string
		if json.Unmarshal(rawValue, &value) != nil || value == nil {
			writeError(w, 400, "Значение поля должно быть десятичной строкой; пустая строка очищает ввод")
			return
		}
		if *value == "" {
			continue
		}
		canonical, err := normalizePageSheetDecimal(*value)
		if err != nil {
			writeError(w, 400, err.Error())
			return
		}
		values[id] = canonical
	}
	// The client cannot see dormant values and must not accidentally delete them
	// when saving the remaining visible inputs after a schema edit.
	storedValues := map[string]string{}
	var previousValues string
	err = tx.QueryRowContext(r.Context(), `SELECT values_json FROM page_app_sheet_values WHERE page_id=? AND block_id=? AND user_id=?`, r.PathValue("id"), block.ID, currentUser(r).ID).Scan(&previousValues)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось прочитать прежние личные числа")
		return
	}
	if err == nil && json.Unmarshal([]byte(previousValues), &storedValues) != nil {
		writeError(w, 500, "Не удалось прочитать прежние личные числа")
		return
	}
	if storedValues == nil {
		storedValues = map[string]string{}
	}
	for id := range allowed {
		delete(storedValues, id)
	}
	for id, value := range values {
		storedValues[id] = value
	}
	encoded, _ := json.Marshal(storedValues)
	var changed sql.Result
	if *input.ExpectedValuesRevision == 0 {
		changed, err = tx.ExecContext(r.Context(), `INSERT INTO page_app_sheet_values(page_id,block_id,user_id,values_json,revision,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(page_id,block_id,user_id) DO NOTHING`, r.PathValue("id"), block.ID, currentUser(r).ID, string(encoded), nowText())
	} else {
		changed, err = tx.ExecContext(r.Context(), `UPDATE page_app_sheet_values SET values_json=?,revision=revision+1,updated_at=? WHERE page_id=? AND block_id=? AND user_id=? AND revision=?`, string(encoded), nowText(), r.PathValue("id"), block.ID, currentUser(r).ID, *input.ExpectedValuesRevision)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить личные числа")
		return
	}
	if count, _ := changed.RowsAffected(); count != 1 {
		writeError(w, 409, "Личные числа изменились на другом устройстве. Обновите лист перед сохранением")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить личные числа")
		return
	}
	writeJSON(w, 200, PageSheetState{Values: values, Revision: *input.ExpectedValuesRevision + 1})
}
