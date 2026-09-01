package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func registerVerifiedWithoutFixture(t *testing.T, client *http.Client, baseURL, email, username string) User {
	t.Helper()
	var challenge registrationChallengeResponse
	requestJSON(t, client, http.MethodPost, baseURL+"/api/auth/register", map[string]any{
		"email": email, "username": username, "password": "strong-password-123",
	}, http.StatusAccepted, &challenge)
	var user User
	requestJSON(t, client, http.MethodPost, baseURL+"/api/auth/register/verify", map[string]any{
		"challengeId": challenge.ChallengeID, "code": challenge.TestingCode,
	}, http.StatusCreated, &user)
	return user
}

func TestTeamProjectsInvitationsAndPersonalPreferences(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "team-access.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	appServer := &Server{store: store}
	server := httptest.NewServer(NewServer(store, Config{
		SessionLifetime: 24 * time.Hour,
		AllowedUsernames: map[string]struct{}{
			"team_owner": {}, "team_member": {}, "team_second": {},
		},
	}))
	defer server.Close()

	ownerClient := testClient(t)
	memberClient := testClient(t)
	secondClient := testClient(t)
	registerVerifiedWithoutFixture(t, ownerClient, server.URL, "team-owner@example.test", "team_owner")
	member := registerVerifiedWithoutFixture(t, memberClient, server.URL, "team-member@example.test", "team_member")
	second := registerVerifiedWithoutFixture(t, secondClient, server.URL, "team-second@example.test", "team_second")

	var memberBefore []Workspace
	requestJSON(t, memberClient, http.MethodGet, server.URL+"/api/workspaces", nil, http.StatusOK, &memberBefore)
	if len(memberBefore) != 1 || memberBefore[0].Kind != "personal" {
		t.Fatalf("new account must only have personal workspace: %#v", memberBefore)
	}

	var firstProject Workspace
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{
		"name": "Продукт", "description": "Команда с несколькими закрытыми проектами",
	}, http.StatusCreated, &firstProject)
	var secondProject Workspace
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/teams/"+firstProject.TeamID+"/projects", firstProject.ID, map[string]any{
		"name": "CRM", "description": "Доступ только назначенным участникам",
	}, http.StatusCreated, &secondProject)

	var invite struct {
		Code string `json:"code"`
		URL  string `json:"url"`
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/teams/"+firstProject.TeamID+"/invitations", firstProject.ID, map[string]any{
		"role": "member", "projectIds": []string{secondProject.ID}, "expiresDays": 7, "maxUses": 1,
	}, http.StatusCreated, &invite)
	if invite.Code == "" || invite.URL == "" {
		t.Fatalf("invite secrets are incomplete: %#v", invite)
	}
	var accepted struct {
		TeamID string `json:"teamId"`
	}
	requestJSON(t, memberClient, http.MethodPost, server.URL+"/api/invitations/accept", map[string]any{"code": invite.Code}, http.StatusOK, &accepted)
	if accepted.TeamID != firstProject.TeamID {
		t.Fatalf("accepted team = %#v", accepted)
	}

	var memberAfter []Workspace
	requestJSON(t, memberClient, http.MethodGet, server.URL+"/api/workspaces", nil, http.StatusOK, &memberAfter)
	if len(memberAfter) != 2 || memberAfter[1].ID != secondProject.ID {
		t.Fatalf("member must see personal and selected project only: %#v", memberAfter)
	}
	requestWorkspaceJSON(t, memberClient, http.MethodGet, server.URL+"/api/records", firstProject.ID, nil, http.StatusForbidden, nil)
	requestWorkspaceJSON(t, memberClient, http.MethodGet, server.URL+"/api/records", secondProject.ID, nil, http.StatusOK, &[]Record{})
	var registrationInvite struct {
		URL string `json:"url"`
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/teams/"+firstProject.TeamID+"/invitations", firstProject.ID, map[string]any{
		"role": "member", "projectIds": []string{firstProject.ID}, "expiresDays": 7, "maxUses": 1,
	}, http.StatusCreated, &registrationInvite)
	parsedInvite, err := url.Parse(registrationInvite.URL)
	if err != nil || parsedInvite.Query().Get("invite") == "" {
		t.Fatalf("parse registration invite %q: %v", registrationInvite.URL, err)
	}
	invitedClient := testClient(t)
	var invitedChallenge registrationChallengeResponse
	requestJSON(t, invitedClient, http.MethodPost, server.URL+"/api/auth/register", map[string]any{
		"email": "invited-new@example.test", "username": "invited_new", "password": "strong-password-123", "inviteToken": parsedInvite.Query().Get("invite"),
	}, http.StatusAccepted, &invitedChallenge)
	if !invitedChallenge.InvitationPending {
		t.Fatalf("registration challenge is not linked to invitation: %#v", invitedChallenge)
	}
	requestJSON(t, invitedClient, http.MethodPost, server.URL+"/api/auth/register/verify", map[string]any{
		"challengeId": invitedChallenge.ChallengeID, "code": invitedChallenge.TestingCode,
	}, http.StatusCreated, &User{})
	var invitedWorkspaces []Workspace
	requestJSON(t, invitedClient, http.MethodGet, server.URL+"/api/workspaces", nil, http.StatusOK, &invitedWorkspaces)
	if len(invitedWorkspaces) != 2 || invitedWorkspaces[1].ID != firstProject.ID {
		t.Fatalf("invited registration access = %#v", invitedWorkspaces)
	}
	var recurringSource Record
	requestWorkspaceJSON(t, memberClient, http.MethodPost, server.URL+"/api/records", secondProject.ID, map[string]any{
		"type": "task", "title": "Повторяемая CRM-задача", "ownerId": member.ID,
	}, http.StatusCreated, &recurringSource)
	tx, err := store.db.Begin()
	if err != nil {
		t.Fatalf("begin recurring task: %v", err)
	}
	now := nowText()
	if _, err = tx.Exec(`INSERT INTO recurrence_rules(record_id, cadence, interval_count, active, updated_by, updated_at) VALUES(?, 'weekly', 1, 1, ?, ?)`, recurringSource.ID, member.ID, now); err != nil {
		t.Fatalf("insert recurrence: %v", err)
	}
	nextID, err := appServer.spawnRecurringTask(t.Context(), tx, recurringSource, member.ID, now)
	if err != nil {
		t.Fatalf("spawn recurring task: %v", err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatalf("commit recurring task: %v", err)
	}
	var recurringWorkspace string
	if err = store.db.QueryRow(`SELECT workspace_id FROM records WHERE id = ?`, nextID).Scan(&recurringWorkspace); err != nil || recurringWorkspace != secondProject.ID {
		t.Fatalf("recurring task workspace=%q err=%v, want %q", recurringWorkspace, err, secondProject.ID)
	}

	preferences := InterfacePreferences{HiddenNavGroups: []string{"Основа"}, CollapsedNavGroups: []string{"Бизнес"}, DashboardWidgets: []string{"focus", "quality"}}
	var savedPreferences InterfacePreferences
	requestWorkspaceJSON(t, memberClient, http.MethodPut, server.URL+"/api/interface/preferences", secondProject.ID, preferences, http.StatusOK, &savedPreferences)
	if len(savedPreferences.DashboardWidgets) != 2 || savedPreferences.HiddenNavGroups[0] != "Основа" {
		t.Fatalf("preferences = %#v", savedPreferences)
	}

	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/teams/"+firstProject.TeamID+"/members", firstProject.ID, map[string]any{
		"username": "@team_second", "role": "member", "projectIds": []string{firstProject.ID},
	}, http.StatusOK, &TeamDetail{})
	requestWorkspaceJSON(t, secondClient, http.MethodGet, server.URL+"/api/records", firstProject.ID, nil, http.StatusOK, &[]Record{})
	requestWorkspaceJSON(t, secondClient, http.MethodGet, server.URL+"/api/records", secondProject.ID, nil, http.StatusForbidden, nil)
	requestJSON(t, secondClient, http.MethodPost, server.URL+"/api/invitations/accept", map[string]any{"code": invite.Code}, http.StatusGone, nil)
	requestWorkspaceJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/teams/"+firstProject.TeamID+"/members/"+strconv.FormatInt(second.ID, 10), firstProject.ID, map[string]any{
		"role": "admin", "projectIds": []string{},
	}, http.StatusOK, &TeamDetail{})
	var memberInvite struct {
		Code string `json:"code"`
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/teams/"+firstProject.TeamID+"/invitations", firstProject.ID, map[string]any{
		"role": "member", "projectIds": []string{firstProject.ID}, "expiresDays": 7, "maxUses": 1,
	}, http.StatusCreated, &memberInvite)
	requestJSON(t, secondClient, http.MethodPost, server.URL+"/api/invitations/accept", map[string]any{"code": memberInvite.Code}, http.StatusOK, &accepted)
	requestWorkspaceJSON(t, secondClient, http.MethodGet, server.URL+"/api/records", secondProject.ID, nil, http.StatusOK, &[]Record{})

	var detail TeamDetail
	requestWorkspaceJSON(t, ownerClient, http.MethodGet, server.URL+"/api/teams/"+firstProject.TeamID, firstProject.ID, nil, http.StatusOK, &detail)
	if len(detail.Projects) != 2 || len(detail.Members) != 4 {
		t.Fatalf("team detail projects=%d members=%d member=%d", len(detail.Projects), len(detail.Members), member.ID)
	}
	for _, teamMember := range detail.Members {
		if teamMember.Username == "team_second" && (teamMember.Role != "admin" || len(teamMember.ProjectRoles) != 2) {
			t.Fatalf("member invitation downgraded administrator: %#v", teamMember)
		}
	}
}
