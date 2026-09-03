package web

import (
	"strings"
	"testing"
)

func TestCalendarCircleDatesKeepTheirShapeAndDoNotWrap(t *testing.T) {
	content, err := Files.ReadFile("styles.css")
	if err != nil {
		t.Fatal(err)
	}
	styles := string(content)
	rule := func(selector string) string {
		t.Helper()
		start := strings.Index(styles, selector+" {")
		if start < 0 {
			t.Fatalf("missing rule %s", selector)
		}
		return strings.SplitN(styles[start:], "}", 2)[0]
	}
	shared := rule(".calendar-circle > span, .mini-calendar-circles > button > span")
	for _, property := range []string{"aspect-ratio: 1;", "white-space: nowrap;", "overflow-wrap: normal;", "line-height: 1;", "flex-shrink: 0;"} {
		if !strings.Contains(shared, property) {
			t.Fatalf("date geometry missing %s", property)
		}
	}
	if !strings.Contains(rule(".calendar-circle"), "grid-template: minmax(0, 1fr) / minmax(0, 1fr);") {
		t.Fatal("date text must not enlarge the calendar button's grid tracks")
	}
	date := rule(".calendar-circle > span")
	if !strings.Contains(date, "width: max(22px, 82%);") || !strings.Contains(date, "height: auto;") {
		t.Fatal("circle diameter must fit two digits and determine its own height")
	}
	badge := rule(".calendar-circle > small")
	if !strings.Contains(badge, "top: -8px;") || !strings.Contains(badge, "height: 12px;") || !strings.Contains(badge, "white-space: nowrap;") {
		t.Fatal("entry counter must remain above the date text")
	}
	grid := rule(".time-map-days, .planner-circle-grid")
	if !strings.Contains(grid, "padding-block: 8px;") || !strings.Contains(grid, "gap: 8px 4px;") {
		t.Fatal("circle grid must reserve space for counters without clipping or overlapping rows")
	}
}

func TestMiniCalendarInitialScaleUsesCSSOM(t *testing.T) {
	content, err := Files.ReadFile("app.js")
	if err != nil {
		t.Fatal(err)
	}
	app := string(content)
	if strings.Contains(app, `data-calendar-scalable style="--calendar-scale:`) {
		t.Fatal("CSP blocks the mini-calendar's initial scale when written as HTML style markup")
	}
	if !strings.Contains(app, "if (calendar) calendar.style.setProperty('--calendar-scale',widgetScale(block,settings)/100);") {
		t.Fatal("mini-calendar must apply the persisted scale when mounted, not only on wheel input")
	}
}
