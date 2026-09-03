package app

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestOneTeamPerWorkspaceMigrationPreservesWorkspaceData(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "split.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`PRAGMA foreign_keys=ON;
		CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT NOT NULL);
		CREATE TABLE teams(id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', owner_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
		CREATE TABLE team_members(team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL, status TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(team_id,user_id));
		CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, owner_id INTEGER NOT NULL REFERENCES users(id), description TEXT NOT NULL DEFAULT '', team_id TEXT REFERENCES teams(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
		CREATE TABLE workspace_members(workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), role TEXT NOT NULL, status TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(workspace_id,user_id));
		CREATE TABLE workspace_invitations(id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), created_by INTEGER NOT NULL REFERENCES users(id), revoked_at TEXT);
		CREATE TABLE team_activity(id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, reason TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
		CREATE TABLE records(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL);
		INSERT INTO users VALUES(1,'owner'),(2,'second');
		INSERT INTO teams VALUES('team-root','Old group','old-group','',1,'2026-01-01','2026-01-01',NULL);
		INSERT INTO team_members VALUES('team-root',1,'owner','active','2026-01-01'),('team-root',2,'member','active','2026-01-01');
		INSERT INTO workspaces VALUES('root','Root','root','team',1,'','team-root','2026-01-01','2026-01-01'),('startup','Startup','startup','team',1,'Separate','team-root','2026-01-02','2026-01-02');
		INSERT INTO workspace_members VALUES('root',1,'owner','active','2026-01-01'),('startup',1,'owner','active','2026-01-02'),('startup',2,'member','active','2026-01-02');
		INSERT INTO workspace_invitations VALUES('old-invite','team-root',1,NULL);
		INSERT INTO records VALUES('startup-record','startup','Untouched');`); err != nil {
		t.Fatal(err)
	}
	body, err := migrationFiles.ReadFile("migrations/036_one_team_per_workspace.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(string(body)); err != nil {
		t.Fatal(err)
	}
	var rootTeam, startupTeam, recordWorkspace, recordTitle, secondRole, oldStatus string
	if err = db.QueryRow(`SELECT team_id FROM workspaces WHERE id='root'`).Scan(&rootTeam); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT team_id FROM workspaces WHERE id='startup'`).Scan(&startupTeam); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT workspace_id,title FROM records WHERE id='startup-record'`).Scan(&recordWorkspace, &recordTitle); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT role FROM team_members WHERE team_id=? AND user_id=2 AND status='active'`, startupTeam).Scan(&secondRole); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT status FROM team_members WHERE team_id='team-root' AND user_id=2`).Scan(&oldStatus); err != nil {
		t.Fatal(err)
	}
	var revoked, events int
	if err = db.QueryRow(`SELECT revoked_at IS NOT NULL FROM workspace_invitations WHERE id='old-invite'`).Scan(&revoked); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT COUNT(*) FROM team_activity WHERE team_id=? AND action='team_split'`, startupTeam).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if rootTeam != "team-root" || startupTeam == rootTeam || recordWorkspace != "startup" || recordTitle != "Untouched" || secondRole != "member" || oldStatus != "suspended" || revoked != 1 || events != 1 {
		t.Fatalf("split root=%q startup=%q record=%q/%q role=%q old=%q revoked=%d events=%d", rootTeam, startupTeam, recordWorkspace, recordTitle, secondRole, oldStatus, revoked, events)
	}
	if _, err = db.Exec(`INSERT INTO workspaces VALUES('duplicate','Duplicate','duplicate','team',1,'',?,'2026-01-03','2026-01-03')`, startupTeam); err == nil {
		t.Fatal("second workspace was attached to one team")
	}
}
