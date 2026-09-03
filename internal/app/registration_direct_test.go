package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"
)

func TestDirectRegistrationPreservesSessionsPrivacyAndInvitations(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "registration.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewTLSServer(NewServer(store, Config{
		SessionLifetime: 24 * time.Hour, CookieSecure: true, RegistrationSkipVerification: true,
	}))
	defer server.Close()
	client := func() *http.Client {
		c := server.Client()
		copy := *c
		copy.Jar = testClient(t).Jar
		return &copy
	}
	register := func(c *http.Client, name, token string, status int) User {
		var user User
		requestJSON(t, c, http.MethodPost, server.URL+"/api/auth/register", map[string]any{
			"username": name, "email": name + "@example.test", "password": "direct-password-2026", "inviteToken": token,
		}, status, &user)
		return user
	}
	ownerClient := client()
	owner := register(ownerClient, "direct_owner", "", http.StatusCreated)
	if owner.ID == 0 {
		t.Fatal("direct registration did not return a user")
	}
	var me User
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/me", nil, http.StatusOK, &me)
	if me.ID != owner.ID {
		t.Fatal("registration did not establish a session")
	}
	var workspaces []Workspace
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/workspaces", nil, http.StatusOK, &workspaces)
	if len(workspaces) != 1 || workspaces[0].Kind != "personal" {
		t.Fatal("new account has unexpected project access")
	}
	register(client(), "direct_owner", "", http.StatusConflict)
	var project Workspace
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Direct registration QA"}, http.StatusCreated, &project)
	outsider := client()
	register(outsider, "direct_outsider", "", http.StatusCreated)
	requestWorkspaceJSON(t, outsider, http.MethodGet, server.URL+"/api/records", project.ID, nil, http.StatusForbidden, nil)
	var invite struct {
		URL string `json:"url"`
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/teams/"+project.TeamID+"/invitations", project.ID, map[string]any{
		"role": "member", "projectIds": []string{project.ID}, "expiresDays": 7, "maxUses": 1,
	}, http.StatusCreated, &invite)
	inviteURL, err := url.Parse(invite.URL)
	if err != nil {
		t.Fatal(err)
	}
	token := inviteURL.Query().Get("invite")
	if token == "" {
		t.Fatal("missing invitation token")
	}
	invited := client()
	register(invited, "direct_invited", token, http.StatusCreated)
	requestWorkspaceJSON(t, invited, http.MethodGet, server.URL+"/api/records", project.ID, nil, http.StatusOK, &[]Record{})
	register(client(), "direct_expired", token, http.StatusGone)
	register(client(), "direct_invalid", "invalid-token", http.StatusGone)
	var count int
	store.db.QueryRow("SELECT COUNT(*) FROM registration_challenges").Scan(&count)
	if count != 0 {
		t.Fatal("direct registration left a challenge")
	}
	store.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if count != 3 {
		t.Fatalf("invalid invitation created an account: %d", count)
	}
	var reason string
	if err := store.db.QueryRow("SELECT reason FROM activity WHERE entity_type='user' AND actor_id=?", owner.ID).Scan(&reason); err != nil {
		t.Fatal(err)
	}
	if reason != "Регистрация без проверки почты" {
		t.Fatalf("misleading registration audit: %s", reason)
	}
}

func TestRegistrationSkipVerificationIsExplicit(t *testing.T) {
	t.Setenv("BUSINESS_REGISTRATION_SKIP_VERIFICATION", "")
	if LoadConfig().RegistrationSkipVerification {
		t.Fatal("verification must not be skipped by default")
	}
	t.Setenv("BUSINESS_REGISTRATION_SKIP_VERIFICATION", "true")
	if !LoadConfig().RegistrationSkipVerification {
		t.Fatal("explicit direct registration flag was ignored")
	}
}
