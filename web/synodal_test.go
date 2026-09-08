package web

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestBundledSynodalTextHasEveryBookChapterAndOrderedVerses(t *testing.T) {
	counts := []int{50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22}
	total := 0
	for i, count := range counts {
		raw, err := Files.ReadFile(fmt.Sprintf("vendor/synodal/%d.json", i+1))
		if err != nil {
			t.Fatal(err)
		}
		var book struct {
			BookID   int
			Name     string
			Chapters [][]struct {
				Verse int
				Text  string
			}
		}
		if err := json.Unmarshal(raw, &book); err != nil {
			t.Fatal(err)
		}
		if book.BookID != i+1 || book.Name == "" || len(book.Chapters) != count {
			t.Fatalf("book %d: invalid catalogue", i+1)
		}
		for chapter, verses := range book.Chapters {
			if len(verses) == 0 {
				t.Fatalf("empty chapter %d:%d", i+1, chapter+1)
			}
			last := 0
			for _, v := range verses {
				if v.Verse <= last || v.Text == "" {
					t.Fatalf("invalid verse %d:%d", i+1, chapter+1)
				}
				last = v.Verse
				total++
			}
		}
	}
	if total != 31169 {
		t.Fatalf("unexpected verse count %d", total)
	}
}
