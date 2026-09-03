package app

import (
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestGraphChildNodesStayInsideAuthorizedProject(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "graph-isolation.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, memberClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "graph-owner@example.test", "graph_owner")
	register(t, memberClient, server.URL, "graph-member@example.test", "graph_member")
	shared := collaborativeTestTeamsValue(t, server.URL)
	var private Workspace
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Закрытый проект владельца"}, 201, &private)
	for index, workspace := range []string{shared, private.ID} {
		prefix := fmt.Sprintf("graph-scope-%d-", index)
		now := nowText()
		_, err = store.db.Exec(`INSERT INTO records(id,workspace_id,type,subtype,title,status,author_id,owner_id,created_at,updated_at) VALUES(?,?,'idea','question_set',?,'inbox',?,?,?,?), (?,?,'research','',?,'draft',?,?,?,?)`, prefix+"questions", workspace, prefix+"questions", owner.ID, owner.ID, now, now, prefix+"research", workspace, prefix+"research", owner.ID, owner.ID, now, now)
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.db.Exec(`INSERT INTO question_items(id,record_id,body,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?);`, prefix+"question", prefix+"questions", prefix+"question body", owner.ID, now, now)
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.db.Exec(`INSERT INTO question_answers(id,question_id,author_id,content,created_at,updated_at) VALUES(?,?,?,?,?,?)`, prefix+"answer", prefix+"question", owner.ID, prefix+"answer body", now, now)
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.db.Exec(`INSERT INTO question_decisions(id,question_id,decided_by,content,created_at,updated_at) VALUES(?,?,?,?,?,?)`, prefix+"decision", prefix+"question", owner.ID, prefix+"decision body", now, now)
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.db.Exec(`INSERT INTO research_options(id,record_id,title,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, prefix+"option", prefix+"research", prefix+"research option", owner.ID, owner.ID, now, now)
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, archived := range []string{"false", "true"} {
		var graph GraphResponse
		requestWorkspaceJSON(t, memberClient, "GET", server.URL+"/api/graph?includeArchived="+archived, shared, nil, 200, &graph)
		kinds := map[string]int{}
		ids := map[string]bool{}
		for _, node := range graph.Nodes {
			if node.RecordID != "graph-scope-0-questions" && node.RecordID != "graph-scope-0-research" {
				t.Fatalf("private child leaked: %#v", node)
			}
			kinds[node.EntityKind]++
			ids[node.ID] = true
		}
		for _, kind := range []string{"question", "answer", "joint_decision", "research_option"} {
			if kinds[kind] != 1 {
				t.Fatalf("own %s missing: %#v", kind, kinds)
			}
		}
		for _, edge := range graph.Edges {
			if !ids[edge.Source] || !ids[edge.Target] {
				t.Fatalf("cross-project edge: %#v", edge)
			}
		}
		requestWorkspaceJSON(t, ownerClient, "GET", server.URL+"/api/graph?includeArchived="+archived, private.ID, nil, 200, &graph)
		for _, node := range graph.Nodes {
			if node.RecordID != "graph-scope-1-questions" && node.RecordID != "graph-scope-1-research" {
				t.Fatalf("wrong project on switch: %#v", node)
			}
		}
	}
	requestWorkspaceJSON(t, memberClient, "GET", server.URL+"/api/graph", private.ID, nil, 403, nil)
}

func collaborativeTestTeamsValue(t *testing.T, base string) string {
	t.Helper()
	value, ok := collaborativeTestTeams.Load(base)
	if !ok {
		t.Fatal("missing test team")
	}
	return value.(collaborativeTestTeam).projectID
}
