package app

import "testing"

func TestNotebookRejectsStaleSaveWithoutReplacingNewerText(t *testing.T) {
	f := newLifecycleFixture(t)
	endpoint := f.url + "/api/personal/notes"
	var original, updated PersonalNote
	requestJSON(t, f.clients["member"], "POST", endpoint, map[string]any{"body": "Original text"}, 201, &original)
	payload := map[string]any{"body": "Newer text", "expectedUpdatedAt": original.UpdatedAt}
	requestJSON(t, f.clients["member"], "PATCH", endpoint+"/"+original.ID, payload, 200, &updated)
	if updated.UpdatedAt == original.UpdatedAt {
		t.Fatal("save did not advance the note version")
	}
	payload["body"] = "Stale text"
	requestJSON(t, f.clients["member"], "PATCH", endpoint+"/"+original.ID, payload, 409, nil)
	var overview PersonalOverview
	requestJSON(t, f.clients["member"], "GET", f.url+"/api/personal/overview", nil, 200, &overview)
	if len(overview.Notes) != 1 || overview.Notes[0].Body != "Newer text" || !overview.Notes[0].TitleGenerated {
		t.Fatalf("stale save replaced the current note: %#v", overview.Notes)
	}
}

func TestNotebookTitleOriginSurvivesReadAndEdit(t *testing.T) {
	f := newLifecycleFixture(t)
	for _, kind := range []string{"notes", "plans"} {
		t.Run(kind, func(t *testing.T) {
			bodyKey := "body"
			if kind == "plans" {
				bodyKey = "notes"
			}
			payload := map[string]any{"title": "", bodyKey: "First line\n\nSecond line"}
			endpoint := f.url + "/api/personal/" + kind
			var item map[string]any
			requestJSON(t, f.clients["member"], "POST", endpoint, payload, 201, &item)
			id := item["id"].(string)
			if item["titleGenerated"] != true || item["title"] != "First line" {
				t.Fatalf("generated: %#v", item)
			}
			var overview PersonalOverview
			requestJSON(t, f.clients["member"], "GET", f.url+"/api/personal/overview", nil, 200, &overview)
			if kind == "notes" && (len(overview.Notes) != 1 || !overview.Notes[0].TitleGenerated) {
				t.Fatal("note origin lost")
			}
			if kind == "plans" && (len(overview.Plans) != 1 || !overview.Plans[0].TitleGenerated) {
				t.Fatal("plan origin lost")
			}
			payload["title"], payload["status"] = "Explicit title", "planned"
			if kind == "notes" {
				delete(payload, "status")
			}
			requestJSON(t, f.clients["outsider"], "PATCH", endpoint+"/"+id, payload, 404, nil)
			requestJSON(t, f.clients["member"], "PATCH", endpoint+"/"+id, payload, 200, &item)
			if item["titleGenerated"] != false || item["title"] != "Explicit title" || item[bodyKey] != payload[bodyKey] {
				t.Fatalf("explicit: %#v", item)
			}
			payload["title"] = ""
			requestJSON(t, f.clients["member"], "PATCH", endpoint+"/"+id, payload, 200, &item)
			if item["titleGenerated"] != true || item[bodyKey] != payload[bodyKey] {
				t.Fatalf("cleared: %#v", item)
			}
		})
	}
	var record Record
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/records", f.project.ID, map[string]any{"type": "inbox", "description": "First line\nSecond"}, 201, &record)
	if !record.TitleGenerated {
		t.Fatal("inbox caption not marked")
	}
	requestWorkspaceJSON(t, f.clients["member"], "PATCH", f.url+"/api/records/"+record.ID, f.project.ID, map[string]any{"title": "Explicit"}, 200, &record)
	if record.TitleGenerated {
		t.Fatal("explicit inbox title hidden")
	}
}
