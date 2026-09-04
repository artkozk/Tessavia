// Package emoji validates one RGI emoji using the pinned Unicode 17.0 catalog.
// Source and reproduction instructions: tools/emoji-data/generate.py.
package emoji

import (
	_ "embed"
	"strings"
	"unicode/utf8"
)

//go:embed sequences.txt
var sequences string

var canonical = func() map[string]string {
	result := make(map[string]string)
	for _, value := range strings.Fields(sequences) {
		result[strings.ReplaceAll(value, "\ufe0f", "")] = value
	}
	return result
}()

// Normalize accepts emoji/text presentation aliases without changing ZWJ,
// flag, gender or skin-tone sequences. It rejects text and multiple emoji.
func Normalize(value string) (string, bool) {
	if len(value) > 128 || !utf8.ValidString(value) {
		return "", false
	}
	value = strings.TrimSpace(value)
	result, ok := canonical[strings.ReplaceAll(value, "\ufe0f", "")]
	return result, ok
}
