package emoji

import (
	"strings"
	"testing"
)

func TestCatalogAndCompoundSequences(t *testing.T) {
	for _, value := range strings.Fields(sequences) {
		if got, ok := Normalize(value); !ok || got != value {
			t.Fatalf("catalog sequence %q: %q %v", value, got, ok)
		}
	}
	for _, value := range []string{"👩🏽‍❤️‍💋‍👨🏿", "👨‍👩‍👧‍👦", "🇷🇺", "🏴\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f", "🫱🏽‍🫲🏿"} {
		if _, ok := Normalize(value); !ok {
			t.Errorf("rejected %q", value)
		}
	}
	if got, ok := Normalize("❤"); !ok || got != "❤️" {
		t.Fatal("presentation alias", got)
	}
	for _, value := range []string{"", "hello", "😀😀", "😀text", "🏽", "\u200d", "🇷", "😀\x00", "😀\ufe0e", string([]byte{0xff}), strings.Repeat("😀", 40)} {
		if _, ok := Normalize(value); ok {
			t.Errorf("accepted %q", value)
		}
	}
}
