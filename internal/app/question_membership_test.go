package app

import (
	"strconv"
	"testing"
)

func TestQuestionDecisionCountsOnlyCurrentWorkspaceMembers(t *testing.T) {
	f := newLifecycleFixture(t) // Three members and an unrelated registered account.
	var record Record
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/records", f.project.ID,
		map[string]any{"type": "question_set", "title": "Membership-scoped decision", "ownerId": f.users["owner"].ID}, 201, &record)
	base := f.url + "/api/records/" + record.ID + "/questions"
	var workflow QuestionWorkflow
	requestWorkspaceJSON(t, f.clients["owner"], "POST", base, f.project.ID,
		map[string]any{"questions": "How do we accept the result?"}, 201, &workflow)
	if workflow.UserCount != 3 || workflow.Expected != 3 {
		t.Fatalf("unrelated account counted: %#v", workflow)
	}
	path := base + "/" + workflow.Questions[0].ID
	answer := func(role string) {
		requestWorkspaceJSON(t, f.clients[role], "PUT", path+"/answer", f.project.ID,
			map[string]any{"content": "Position of " + role}, 200, &workflow)
	}
	decide := func(status int) {
		requestWorkspaceJSON(t, f.clients["owner"], "POST", path+"/decision", f.project.ID,
			map[string]any{"mode": "custom", "content": "Agreed test result"}, status, nil)
	}
	answer("owner")
	answer("member")
	decide(409) // The active admin has not answered.
	requestJSON(t, f.clients["owner"], "DELETE", f.url+"/api/teams/"+f.project.TeamID+"/members/"+strconv.FormatInt(f.users["member"].ID, 10), nil, 204, nil)
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/teams/"+f.project.TeamID+"/members",
		map[string]any{"username": f.users["outsider"].Username, "role": "member", "projectIds": []string{f.project.ID}}, 200, nil)
	answer("admin")
	if len(workflow.Questions[0].Answers) != 3 || workflow.Questions[0].ActiveAnswerCount != 2 || workflow.Answered != 2 {
		t.Fatalf("former answer must remain in history without replacing newcomer: %#v", workflow)
	}
	decide(409) // Three stored answers must not stand in for the new participant.
	requestWorkspaceJSON(t, f.clients["owner"], "POST", path+"/ai-draft", f.project.ID, nil, 409, nil)
	answer("outsider")
	if workflow.Questions[0].ActiveAnswerCount != 3 {
		t.Fatalf("missing active answer: %#v", workflow)
	}
	decide(200)
}
