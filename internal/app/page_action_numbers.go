package app

import (
	"encoding/json"
	"errors"
	"math"
	"math/big"
	"strconv"
)

const actionNumberLimit = 9007199254740991

func validateActionOperation(a PageRecordAction, field CollectionField) error {
	if a.Operation == "copy" {
		if !copyActionFieldType(field.FieldType) {
			return errors.New("Копирование этого типа требует отдельного сопоставления")
		}
		return nil
	}
	if a.Operation == "" || a.Operation == "set" {
		return nil
	}
	if a.Operation != "add" || (field.FieldType != "number" && field.FieldType != "money") {
		return errors.New("Прибавление доступно только для числа или суммы")
	}
	var value *float64
	if json.Unmarshal(a.Value, &value) != nil || value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) || math.Abs(*value) > actionNumberLimit {
		return errors.New("Укажите число для прибавления в пределах ±9 007 199 254 740 991")
	}
	return nil
}

func resolvePageActionValue(a PageRecordAction, record Record) (json.RawMessage, error) {
	if a.Operation == "copy" {
		return json.Marshal(record.CustomFields[a.SourceFieldID])
	}
	if a.Operation == "" || a.Operation == "set" {
		return a.Value, nil
	}
	if a.Operation != "add" {
		return nil, errors.New("Неизвестный способ изменения поля")
	}
	current, ok := record.CustomFields[a.FieldID].(float64)
	if !ok || math.IsNaN(current) || math.IsInf(current, 0) {
		return nil, errors.New("Сначала заполните числовое поле записи. Для нового счётчика можно задать начальное значение 0")
	}
	var delta *float64
	if json.Unmarshal(a.Value, &delta) != nil || delta == nil {
		return nil, errors.New("Укажите число для прибавления")
	}
	if math.Abs(current) > actionNumberLimit || math.Abs(*delta) > actionNumberLimit {
		return nil, errors.New("Значения счётчика выходят за допустимый числовой диапазон")
	}
	// Add decimal representations, avoiding visible 0.1 + 0.2 binary artefacts.
	x, _ := new(big.Rat).SetString(strconv.FormatFloat(current, 'g', -1, 64))
	y, _ := new(big.Rat).SetString(strconv.FormatFloat(*delta, 'g', -1, 64))
	if x == nil || y == nil {
		return nil, errors.New("Не удалось вычислить числовое значение")
	}
	result, _ := new(big.Rat).Add(x, y).Float64()
	if math.IsInf(result, 0) || math.IsNaN(result) || math.Abs(result) > actionNumberLimit || (*delta != 0 && result == current) {
		return nil, errors.New("Результат выходит за диапазон или точность числа. Уменьшите значение или измените шаг")
	}
	return json.Marshal(result)
}
