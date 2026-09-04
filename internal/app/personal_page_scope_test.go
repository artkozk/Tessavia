package app

import (
	"database/sql"
	"encoding/json"
	"testing"
)

func TestPersonalPageScopeMigrationPreservesOwnersDevicesAndExistingChoices(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
 CREATE TABLE workspaces(id TEXT PRIMARY KEY, owner_id INTEGER, kind TEXT, created_at TEXT, archived_at TEXT, team_id TEXT);
 CREATE TABLE teams(id TEXT, deleted_at TEXT);
 CREATE TABLE team_members(team_id TEXT,user_id INTEGER,status TEXT);
 CREATE TABLE workspace_members(workspace_id TEXT,user_id INTEGER,status TEXT);
 CREATE TABLE user_interface_preferences(user_id INTEGER, workspace_id TEXT, layout_json TEXT NOT NULL DEFAULT '{}', mobile_preferences_json TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, marker TEXT DEFAULT 'default', PRIMARY KEY(user_id,workspace_id));
 INSERT INTO workspaces(id,owner_id,kind,created_at) VALUES('personal-1',1,'personal','1'),('personal-2',2,'personal','1'),('team-a',1,'team','1'),('team-b',1,'team','2'),('removed',1,'team','3');
 INSERT INTO workspace_members VALUES('personal-1',1,'active'),('personal-2',2,'active'),('team-a',1,'active'),('team-b',1,'active'),('team-b',2,'active'),('removed',1,'suspended');
 INSERT INTO user_interface_preferences VALUES
 (1,'personal-1','{"density":"compact","pages":{"personal":{},"work":{"contentWidth":1300}}}','{"layout":{"density":"compact","pages":{"calendar:personal":{"contentWidth":1400}}},"hiddenNavItems":["calendar"]}','1','keep'),
 (1,'team-a','{"pages":{"personal":{"contentWidth":1500},"calendar:personal":{"contentWidth":1600},"work":{"hiddenBlocks":["records"]}}}','{"updatedAt":"3","layout":{"pages":{"personal":{"contentWidth":1700},"day:personal":{"contentWidth":1800}}}}','2','team-a'),
 (1,'team-b','{"pages":{"personal":{"contentWidth":1900},"calendar:personal":{"contentWidth":2000}}}','{"updatedAt":"2","layout":{"pages":{"personal":{"contentWidth":2100},"calendar:personal":{"contentWidth":2200}}}}','4','team-b'),
 (2,'team-b','{"pages":{"personal":{"hiddenBlocks":["summary"]},"calendar:project":{"contentWidth":1300}}}','','5','other'),
 (1,'removed','{"pages":{"day:personal":{"contentWidth":2200}}}','','9','revoked');
 `)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := func() string {
		var value string
		if err := db.QueryRow(`SELECT json_group_array(json_array(user_id,workspace_id,layout_json,mobile_preferences_json,updated_at,marker)) FROM (SELECT * FROM user_interface_preferences WHERE workspace_id NOT LIKE 'personal-%' ORDER BY user_id,workspace_id)`).Scan(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	before := snapshot()
	migration, err := migrationFiles.ReadFile("migrations/044_personal_page_scope.sql")
	if err != nil {
		t.Fatal(err)
	}
	apply := func() {
		if _, err := db.Exec(string(migration)); err != nil {
			t.Fatal(err)
		}
	}
	apply()
	if snapshot() != before {
		t.Fatal("migration rewrote historical team rows")
	}
	var desktop, mobile, marker string
	if err := db.QueryRow(`SELECT layout_json,mobile_preferences_json,marker FROM user_interface_preferences WHERE user_id=1 AND workspace_id='personal-1'`).Scan(&desktop, &mobile, &marker); err != nil {
		t.Fatal(err)
	}
	var d InterfaceLayout
	var m InterfacePreferences
	if err := json.Unmarshal([]byte(desktop), &d); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(mobile), &m); err != nil {
		t.Fatal(err)
	}
	if marker != "keep" || d.Density != "compact" || d.Pages["personal"].ContentWidth != 0 || d.Pages["work"].ContentWidth != 1300 || d.Pages["calendar:personal"].ContentWidth != 2000 {
		t.Fatalf("desktop overwritten or wrong source: %s", desktop)
	}
	if _, ok := d.Pages["day:personal"]; ok {
		t.Fatal("copied layout from suspended membership")
	}
	if m.Layout.Density != "compact" || m.Layout.Pages["personal"].ContentWidth != 1700 || m.Layout.Pages["day:personal"].ContentWidth != 1800 || m.Layout.Pages["calendar:personal"].ContentWidth != 1400 || len(m.HiddenNavItems) != 1 {
		t.Fatalf("mobile overwritten or wrong timestamp: %s", mobile)
	}
	var second string
	if err := db.QueryRow(`SELECT layout_json FROM user_interface_preferences WHERE user_id=2 AND workspace_id='personal-2'`).Scan(&second); err != nil {
		t.Fatal(err)
	}
	var other InterfaceLayout
	json.Unmarshal([]byte(second), &other)
	if len(other.Pages) != 1 || len(other.Pages["personal"].HiddenBlocks) != 1 {
		t.Fatalf("account/project layout leak: %s", second)
	}
	apply()
	var againDesktop, againMobile string
	db.QueryRow(`SELECT layout_json,mobile_preferences_json FROM user_interface_preferences WHERE user_id=1 AND workspace_id='personal-1'`).Scan(&againDesktop, &againMobile)
	if desktop != againDesktop || mobile != againMobile || snapshot() != before {
		t.Fatal("replay changed existing choices")
	}
}
