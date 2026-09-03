package app

import (
	"path/filepath"
	"testing"
)

func TestTessavieMigrationPreservesIdentityAndCustomNames(t *testing.T) {
	for _, tc := range []struct{ id, old, want string }{
		{"bizflow-team", "Команда BizFlow", "Команда Tessavie"},
		{"bizflow-team", "Наш собственный проект", "Наш собственный проект"},
		{"another-team", "Команда BizFlow", "Команда BizFlow"},
	} {
		t.Run(tc.id+"/"+tc.old, func(t *testing.T) {
			store, err := OpenStore(filepath.Join(t.TempDir(), "brand.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			_, err = store.db.Exec(`INSERT INTO users(id,email,username,password_hash,created_at,updated_at)
				VALUES(1,'brand@example.test','brand_user','unused','2026-01-01','2026-01-01');`)
			if err != nil {
				t.Fatal(err)
			}
			_, err = store.db.Exec(`INSERT INTO teams(id,name,slug,owner_id,created_at,updated_at)
				VALUES(?,?,?,?,?,?);`, "team-"+tc.id, tc.old, "test-team", 1, "2026-01-01", "2026-01-01")
			if err != nil {
				t.Fatal(err)
			}
			_, err = store.db.Exec(`INSERT INTO workspaces(id,name,slug,kind,owner_id,team_id,created_at,updated_at)
				VALUES(?,?,?,'team',1,?,'2026-01-01','2026-01-01');`, tc.id, tc.old, "test-project", "team-"+tc.id)
			if err != nil {
				t.Fatal(err)
			}
			_, err = store.db.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,status,joined_at)
				VALUES(?,1,'owner','active','2026-01-01');`, tc.id)
			if err != nil {
				t.Fatal(err)
			}
			migration, err := migrationFiles.ReadFile("migrations/029_tessavie_brand.sql")
			if err != nil {
				t.Fatal(err)
			}
			for run := 0; run < 2; run++ {
				if _, err := store.db.Exec(string(migration)); err != nil {
					t.Fatal(err)
				}
			}
			var projectName, teamName, projectSlug, teamID, role, createdAt string
			err = store.db.QueryRow(`SELECT w.name,t.name,w.slug,w.team_id,m.role,w.created_at
				FROM workspaces w JOIN teams t ON t.id=w.team_id
				JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=1 WHERE w.id=?`, tc.id).
				Scan(&projectName, &teamName, &projectSlug, &teamID, &role, &createdAt)
			if err != nil {
				t.Fatal(err)
			}
			if projectName != tc.want || teamName != tc.want {
				t.Fatalf("project=%q team=%q, want %q", projectName, teamName, tc.want)
			}
			if projectSlug != "test-project" || teamID != "team-"+tc.id || role != "owner" || createdAt != "2026-01-01" {
				t.Fatal("rebranding changed project identity, ownership or creation history")
			}
			var violations int
			if err := store.db.QueryRow(`SELECT COUNT(*) FROM pragma_foreign_key_check`).Scan(&violations); err != nil || violations != 0 {
				t.Fatalf("foreign key violations=%d err=%v", violations, err)
			}
		})
	}
}
