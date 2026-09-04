package app

import (
	"sort"
	"time"
	_ "time/tzdata"
)

type BibleBook struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Chapters int    `json:"chapters"`
}

// Stable IDs follow the 66-book catalogue, not alphabetical display order.
// Chapter counts checked against thiagobodruk/bible json/ru_synodal.json.
var bibleBooks = []BibleBook{
	{1, "Бытие", 50}, {2, "Исход", 40}, {3, "Левит", 27}, {4, "Числа", 36}, {5, "Второзаконие", 34},
	{6, "Иисус Навин", 24}, {7, "Судьи", 21}, {8, "Руфь", 4}, {9, "1 Царств", 31}, {10, "2 Царств", 24},
	{11, "3 Царств", 22}, {12, "4 Царств", 25}, {13, "1 Паралипоменон", 29}, {14, "2 Паралипоменон", 36},
	{15, "Ездра", 10}, {16, "Неемия", 13}, {17, "Есфирь", 10}, {18, "Иов", 42}, {19, "Псалтирь", 150},
	{20, "Притчи", 31}, {21, "Екклесиаст", 12}, {22, "Песнь песней", 8}, {23, "Исаия", 66},
	{24, "Иеремия", 52}, {25, "Плач Иеремии", 5}, {26, "Иезекииль", 48}, {27, "Даниил", 12},
	{28, "Осия", 14}, {29, "Иоиль", 3}, {30, "Амос", 9}, {31, "Авдий", 1}, {32, "Иона", 4},
	{33, "Михей", 7}, {34, "Наум", 3}, {35, "Аввакум", 3}, {36, "Софония", 3}, {37, "Аггей", 2},
	{38, "Захария", 14}, {39, "Малахия", 4}, {40, "Матфея", 28}, {41, "Марка", 16}, {42, "Луки", 24},
	{43, "Иоанна", 21}, {44, "Деяния", 28}, {45, "Римлянам", 16}, {46, "1 Коринфянам", 16},
	{47, "2 Коринфянам", 13}, {48, "Галатам", 6}, {49, "Ефесянам", 6}, {50, "Филиппийцам", 4},
	{51, "Колоссянам", 4}, {52, "1 Фессалоникийцам", 5}, {53, "2 Фессалоникийцам", 3},
	{54, "1 Тимофею", 6}, {55, "2 Тимофею", 4}, {56, "Титу", 3}, {57, "Филимону", 1},
	{58, "Евреям", 13}, {59, "Иакова", 5}, {60, "1 Петра", 5}, {61, "2 Петра", 3},
	{62, "1 Иоанна", 5}, {63, "2 Иоанна", 1}, {64, "3 Иоанна", 1}, {65, "Иуды", 1}, {66, "Откровение", 22},
}

var readingLocation = func() *time.Location {
	loc, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		panic(err)
	}
	return loc
}()

func readingDay(t time.Time) string { return t.In(readingLocation).Format("2006-01-02") }
func validReadingRange(book, first, last int) bool {
	return book > 0 && book <= len(bibleBooks) && first > 0 && last >= first && last <= bibleBooks[book-1].Chapters
}
func nextReading(book, chapter int) (int, int) {
	if !validReadingRange(book, chapter, chapter) {
		return 43, 1
	}
	if chapter < bibleBooks[book-1].Chapters {
		return book, chapter + 1
	}
	if book < len(bibleBooks) {
		return book + 1, 1
	}
	return 0, 0
}
func readingStreak(days map[string]bool, today string) (current, best int) {
	ordered := make([]string, 0, len(days))
	for day := range days {
		if day <= today {
			ordered = append(ordered, day)
		}
	}
	sort.Strings(ordered)
	run := 0
	previous := ""
	for _, day := range ordered {
		parsed, err := time.Parse("2006-01-02", day)
		if err != nil {
			continue
		}
		if parsed.AddDate(0, 0, -1).Format("2006-01-02") == previous {
			run++
		} else {
			run = 1
		}
		if run > best {
			best = run
		}
		previous = day
	}
	date, _ := time.Parse("2006-01-02", today)
	if previous == today || previous == date.AddDate(0, 0, -1).Format("2006-01-02") {
		current = run
	}
	return
}
