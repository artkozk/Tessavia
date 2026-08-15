package app

import "testing"

func TestValidateAIOutputsKeepsOnlySemanticKnowledgeKinds(t *testing.T) {
	outputs := []AISuggestedOutput{
		{Type: "criterion", Kind: "limitation", Title: "Не работать постоянно в холоде", Priority: "normal"},
		{Type: "criterion", Kind: "preference", Title: "Видимый результат труда", Priority: "high"},
		{Type: "decision", Kind: "rule", Title: "Контрольное решение принимает ответственный", Priority: "normal"},
		{Type: "decision", Kind: "insight", Title: "Оба основателя предпочитают технические задачи", Priority: "normal"},
		{Type: "criterion", Kind: "rule", Title: "Неверная комбинация", Priority: "normal"},
		{Type: "decision", Kind: "limitation", Title: "Неверная комбинация", Priority: "normal"},
		{Type: "question_set", Kind: "", Title: "AI не должен создавать группы вопросов", Priority: "normal"},
	}

	validated := validateAIOutputs(outputs)
	if len(validated) != 4 {
		t.Fatalf("validated output count = %d, want 4: %#v", len(validated), validated)
	}
	want := []struct {
		typeName string
		kind     string
	}{
		{"criterion", "limitation"},
		{"criterion", "preference"},
		{"decision", "rule"},
		{"decision", "insight"},
	}
	for index, expected := range want {
		if validated[index].Type != expected.typeName || validated[index].Kind != expected.kind {
			t.Fatalf("validated[%d] = %s/%s, want %s/%s", index, validated[index].Type, validated[index].Kind, expected.typeName, expected.kind)
		}
	}
}
