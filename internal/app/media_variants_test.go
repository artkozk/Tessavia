package app

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

type mediaVariantsReport struct {
	Items     []MediaVariant `json:"items"`
	CanCreate bool           `json:"canCreate"`
}

func mediaVariantCall(t *testing.T, f lifecycleFixture, actor, method, path string, body any, status int, out any) {
	t.Helper()
	requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, f.project.ID, body, status, out)
}
func mediaVariantTestRecord(t *testing.T, f lifecycleFixture, id, kind string) string {
	t.Helper()
	financeTestRecord(t, f.store, f.project.ID, f.users["owner"].ID, id, "Logo brief", kind)
	return "/api/records/" + id
}

func TestMediaVariantsRecordHistorySelectionReceiptsAndAllRecordTypes(t *testing.T) {
	f := newMediaFixture(t)
	base := mediaVariantTestRecord(t, f, "record-logo-versions", "document")
	collection := base + "/media-variants"
	image := mediaPicture(t)
	one := uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "logo-upload-key-0001", "Round logo.png", image, 201)
	again := uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "logo-upload-key-0001", "Round logo.png", image, 200)
	if one.ID != again.ID {
		t.Fatal("upload replay duplicated file")
	}
	uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "logo-upload-key-0001", "Changed.png", image, 409)
	var report mediaVariantsReport
	mediaVariantCall(t, f, "member", "GET", collection, nil, 200, &report)
	if len(report.Items) != 1 || report.Items[0].ID != "legacy:"+one.ID || report.Items[0].Revision != 0 || report.Items[0].SelectedVersionID != "" || !report.CanCreate {
		t.Fatal(report)
	}
	before := report.Items[0]
	var count int
	f.store.db.QueryRow(`SELECT COUNT(*) FROM media_variants`).Scan(&count)
	if count != 0 {
		t.Fatal("GET materialized old uploads")
	}
	create := map[string]any{"requestKey": "logo-create-key-0001", "attachmentId": one.ID, "name": "Круглый знак", "note": "Первый набросок"}
	var v MediaVariant
	mediaVariantCall(t, f, "owner", "POST", collection, create, 201, &v)
	if v.ID != before.ID || v.Revision != 1 || v.Versions[0].Note != "Первый набросок" || v.SelectedVersionID != "" {
		t.Fatal(v)
	}
	mediaVariantCall(t, f, "owner", "POST", collection, create, 200, &v)
	two := uploadPageFile(t, f.clients["member"], f.url+base+"/attachments", f.project.ID, "logo-upload-key-0002", "Improved logo.png", image, 201)
	add := map[string]any{"requestKey": "logo-version-key-0001", "expectedRevision": 1, "attachmentId": two.ID, "note": "Увеличен отступ"}
	mediaVariantCall(t, f, "member", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", add, 201, &v)
	if len(v.Versions) != 2 || v.Versions[1].Version != 2 || v.SelectedVersionID != "" {
		t.Fatal("new version auto-selected or lost history", v)
	}
	mediaVariantCall(t, f, "member", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", add, 200, &v)
	mediaVariantCall(t, f, "owner", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "logo-select-key-0001", "expectedRevision": 2, "selectedVersionId": v.Versions[0].ID}, 200, &v)
	selected := v.SelectedVersionID
	three := uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "logo-upload-key-0003", "Alternative spacing.png", image, 201)
	mediaVariantCall(t, f, "owner", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", map[string]any{"requestKey": "logo-version-key-0002", "expectedRevision": 3, "attachmentId": three.ID}, 201, &v)
	if v.SelectedVersionID != selected || len(v.Versions) != 3 {
		t.Fatal("upload changed explicit user choice")
	}
	mediaVariantCall(t, f, "owner", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "logo-stale-key-0001", "expectedRevision": 2, "name": "Stale"}, 409, nil)
	mediaVariantCall(t, f, "owner", "GET", collection, nil, 200, &report)
	if len(report.Items) != 1 || len(report.Items[0].Versions) != 3 {
		t.Fatal("old versions also appear as independent variants")
	}
	for _, version := range v.Versions {
		headers, data := getMediaBytes(t, f.clients["member"], f.url+version.FileURL, 200)
		if !bytes.Equal(data, image) || headers.Get("Content-Type") != "image/png" {
			t.Fatal("immutable version bytes changed")
		}
	}
	var history struct {
		Items []map[string]any `json:"items"`
	}
	mediaVariantCall(t, f, "member", "GET", collection+"/"+url.PathEscape(v.ID)+"/history", nil, 200, &history)
	if len(history.Items) != 5 {
		t.Fatalf("unexpected history count %d", len(history.Items))
	}
	for _, statement := range []string{`UPDATE media_versions SET note='overwrite'`, `DELETE FROM media_versions`, `UPDATE media_variant_events SET action='renamed'`, `DELETE FROM media_variant_events`} {
		if _, err := f.store.db.Exec(statement); err == nil {
			t.Fatal("append-only guard missing", statement)
		}
	}
	for kind := range recordTypes {
		t.Run(kind, func(t *testing.T) {
			var record Record
			mediaVariantCall(t, f, "owner", "POST", "/api/records", map[string]any{"type": kind, "title": "Logo material " + kind, "description": "Описание и основание", "ownerId": f.users["owner"].ID}, 201, &record)
			base := "/api/records/" + record.ID
			file := uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "all-types-key-0001", "Sketch.png", image, 201)
			var items mediaVariantsReport
			mediaVariantCall(t, f, "owner", "GET", base+"/media-variants", nil, 200, &items)
			if len(items.Items) != 1 || items.Items[0].Versions[0].AttachmentID != file.ID {
				t.Fatal("type-specific media missing")
			}
		})
	}
}

func TestMediaVariantsRecordScopeRoleRevocationAndArchivedHistory(t *testing.T) {
	f := newMediaFixture(t)
	base := mediaVariantTestRecord(t, f, "private-logo-record", "task")
	other := mediaVariantTestRecord(t, f, "other-logo-record", "goal")
	collection := base + "/media-variants"
	image := mediaPicture(t)
	one := uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "record-owner-key-0001", "One.png", image, 201)
	foreign := uploadPageFile(t, f.clients["owner"], f.url+other+"/attachments", f.project.ID, "record-owner-key-0002", "Foreign.png", image, 201)
	var v MediaVariant
	mediaVariantCall(t, f, "owner", "POST", collection, map[string]any{"requestKey": "scope-create-key-0001", "attachmentId": one.ID, "name": "Logo"}, 201, &v)
	mediaVariantCall(t, f, "owner", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", map[string]any{"requestKey": "scope-version-key-0001", "expectedRevision": 1, "attachmentId": foreign.ID}, 404, nil)
	mediaVariantCall(t, f, "owner", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "scope-select-key-0001", "expectedRevision": 1, "selectedVersionId": "file:" + foreign.ID}, 400, nil)
	mediaVariantCall(t, f, "outsider", "GET", collection, nil, 403, nil)
	f.store.db.Exec(`UPDATE records SET edit_policy='owner_only' WHERE id='private-logo-record'`)
	mediaVariantCall(t, f, "member", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "scope-denied-key-0001", "expectedRevision": 1, "name": "Denied"}, 403, nil)
	uploadPageFile(t, f.clients["member"], f.url+base+"/attachments", f.project.ID, "record-denied-key-0001", "Denied.png", image, 403)
	f.store.db.Exec(`UPDATE records SET status='archived' WHERE id='private-logo-record'`)
	var report mediaVariantsReport
	mediaVariantCall(t, f, "owner", "GET", collection, nil, 200, &report)
	if report.CanCreate || report.Items[0].CanManage {
		t.Fatal("archived record allows edits")
	}
	getMediaBytes(t, f.clients["owner"], f.url+v.Versions[0].FileURL, 200)
	mediaVariantCall(t, f, "owner", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "archived-edit-key-0001", "expectedRevision": 1, "name": "Denied"}, 403, nil)
	f.store.db.Exec(`UPDATE workspace_members SET status='suspended' WHERE workspace_id=? AND user_id=?`, f.project.ID, f.users["member"].ID)
	mediaVariantCall(t, f, "member", "GET", collection, nil, 403, nil)
	getMediaBytes(t, f.clients["member"], f.url+v.Versions[0].FileURL, 403)
}

func TestMediaVariantsPersonalNotesRemainPrivateAndParentArchiveKeepsHistory(t *testing.T) {
	f := newMediaFixture(t)
	var note, other PersonalNote
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/personal/notes", map[string]any{"title": "Private logo notes"}, 201, &note)
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/personal/notes", map[string]any{"title": "Other private note"}, 201, &other)
	base := "/api/personal/notes/" + note.ID
	collection := base + "/media-variants"
	image := mediaPicture(t)
	one := uploadPersonalFile(t, f.clients["owner"], f.url+base+"/attachments", "note-image-key-0001", "", "Private.png", image, 201)
	two := uploadPersonalFile(t, f.clients["owner"], f.url+base+"/attachments", "note-image-key-0002", "", "Next.png", image, 201)
	foreign := uploadPersonalFile(t, f.clients["member"], f.url+"/api/personal/notes/"+other.ID+"/attachments", "note-image-key-0003", "", "Secret.png", image, 201)
	var v MediaVariant
	mediaVariantCall(t, f, "owner", "POST", collection+"/legacy:"+one.ID+"/versions", map[string]any{"requestKey": "note-version-key-0001", "expectedRevision": 0, "attachmentId": two.ID, "note": "New note"}, 201, &v)
	if v.Revision != 1 || len(v.Versions) != 2 {
		t.Fatal(v)
	}
	mediaVariantCall(t, f, "member", "GET", collection, nil, 404, nil)
	mediaVariantCall(t, f, "owner", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", map[string]any{"requestKey": "note-foreign-key-0001", "expectedRevision": 1, "attachmentId": foreign.ID}, 404, nil)
	getMediaBytes(t, f.clients["member"], f.url+v.Versions[0].FileURL, 404)
	f.store.db.Exec(`UPDATE personal_notes SET archived_at=? WHERE id=?`, nowText(), note.ID)
	var report mediaVariantsReport
	mediaVariantCall(t, f, "owner", "GET", collection, nil, 200, &report)
	if report.CanCreate || report.Items[0].CanManage {
		t.Fatal("archived note mutable")
	}
	getMediaBytes(t, f.clients["owner"], f.url+v.Versions[0].FileURL, 200)
	mediaVariantCall(t, f, "owner", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "note-archive-key-0001", "expectedRevision": 1, "name": "Denied"}, 403, nil)
}

func TestMediaVariantsPageOwnershipBlockIsolationArchiveAndPortableDefinition(t *testing.T) {
	f := newMediaFixture(t)
	var page WorkspacePage
	mediaVariantCall(t, f, "owner", "POST", "/api/workspace/pages", map[string]any{"name": "Logo gallery"}, 201, &page)
	app := "/api/workspace/pages/" + page.ID + "/app"
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "logo", Kind: "media", Width: 12}, {ID: "other", Kind: "media", Width: 12}}}
	mediaVariantCall(t, f, "owner", "PUT", app, map[string]any{"expectedRevision": 0, "definition": definition}, 200, nil)
	base := app + "/media/logo"
	collection := base + "/variants"
	image := mediaPicture(t)
	one := uploadPageFile(t, f.clients["member"], f.url+base, f.project.ID, "page-image-key-0001", "A.png", image, 201)
	two := uploadPageFile(t, f.clients["member"], f.url+base, f.project.ID, "page-image-key-0002", "B.png", image, 201)
	other := uploadPageFile(t, f.clients["owner"], f.url+app+"/media/other", f.project.ID, "page-image-key-0003", "Other block.png", image, 201)
	var v MediaVariant
	mediaVariantCall(t, f, "member", "POST", collection, map[string]any{"requestKey": "page-create-key-0001", "attachmentId": one.ID, "name": "Variant A", "note": "Initial"}, 201, &v)
	mediaVariantCall(t, f, "member", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", map[string]any{"requestKey": "page-version-key-0001", "expectedRevision": 1, "attachmentId": two.ID}, 201, &v)
	mediaVariantCall(t, f, "owner", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", map[string]any{"requestKey": "page-foreign-key-0001", "expectedRevision": 2, "attachmentId": other.ID}, 404, nil)
	mediaVariantCall(t, f, "member", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "page-archive-key-0001", "expectedRevision": 2, "archived": true}, 200, &v)
	var report mediaVariantsReport
	mediaVariantCall(t, f, "admin", "GET", collection, nil, 200, &report)
	if len(report.Items) != 1 || !report.Items[0].Archived {
		t.Fatal("admin lost archived history")
	}
	mediaVariantCall(t, f, "member", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "page-restore-key-0001", "expectedRevision": 3, "archived": false}, 200, &v)
	var raw string
	f.store.db.QueryRow(`SELECT definition_json FROM page_app_definitions WHERE page_id=?`, page.ID).Scan(&raw)
	for _, secret := range []string{one.ID, two.ID, v.ID, "Initial"} {
		if strings.Contains(raw, secret) {
			t.Fatal("media data leaked into portable definition")
		}
	}
	var before json.RawMessage = json.RawMessage(raw)
	var normalized any
	json.Unmarshal(before, &normalized)
	var expected any
	encoded, _ := json.Marshal(definition)
	json.Unmarshal(encoded, &expected)
	if !reflect.DeepEqual(normalized, expected) {
		t.Fatal("upload altered page definition")
	}
	f.store.db.Exec(`UPDATE workspace_pages SET archived_at=? WHERE id=?`, nowText(), page.ID)
	mediaVariantCall(t, f, "owner", "GET", collection, nil, 200, &report)
	if report.CanCreate || report.Items[0].CanManage {
		t.Fatal("archived page mutable")
	}
	getMediaBytes(t, f.clients["owner"], f.url+v.Versions[0].FileURL, 200)
	mediaVariantCall(t, f, "member", "GET", collection, nil, 404, nil)
}

func TestMediaVariantsDatabaseRejectsCrossScopeAndReceiptPayloadChanges(t *testing.T) {
	f := newMediaFixture(t)
	base := mediaVariantTestRecord(t, f, "receipt-logo-record", "document")
	other := mediaVariantTestRecord(t, f, "receipt-other-record", "document")
	image := mediaPicture(t)
	one := uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "receipt-image-key-0001", "First.png", image, 201)
	foreign := uploadPageFile(t, f.clients["owner"], f.url+other+"/attachments", f.project.ID, "receipt-image-key-0002", "Other.png", image, 201)
	var v MediaVariant
	collection := base + "/media-variants"
	create := map[string]any{"requestKey": "receipt-create-key-0001", "attachmentId": one.ID, "name": "Name"}
	mediaVariantCall(t, f, "owner", "POST", collection, create, 201, &v)
	create["name"] = "Changed"
	mediaVariantCall(t, f, "owner", "POST", collection, create, 409, nil)
	for _, statement := range []string{
		fmt.Sprintf(`INSERT INTO media_versions(id,variant_id,attachment_kind,attachment_id,ordinal,note,created_by,created_at) VALUES('bad','%s','record','%s',2,'',%d,'now')`, v.ID, foreign.ID, f.users["owner"].ID),
		fmt.Sprintf(`UPDATE media_variants SET selected_version_id='file:%s' WHERE id='%s'`, foreign.ID, v.ID),
		fmt.Sprintf(`UPDATE media_variants SET target_id='receipt-other-record' WHERE id='%s'`, v.ID),
		fmt.Sprintf(`INSERT INTO record_attachment_requests(owner_id,record_id,request_key,payload_hash,attachment_id,created_at) VALUES(%d,'receipt-logo-record','bad-db-key','hash','%s','now')`, f.users["owner"].ID, foreign.ID),
		`UPDATE media_variant_requests SET payload_hash='changed'`,
		`DELETE FROM media_variant_requests`,
		`UPDATE record_attachment_requests SET payload_hash='changed'`,
		`DELETE FROM record_attachment_requests`,
	} {
		if _, err := f.store.db.Exec(statement); err == nil {
			t.Fatal("database accepted cross-scope metadata")
		}
	}
	mediaVariantCall(t, f, "owner", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "invalid-name-key-0001", "expectedRevision": 1, "name": strings.Repeat("я", 161)}, 400, nil)
	mediaVariantCall(t, f, "owner", "PATCH", collection+"/"+url.PathEscape(v.ID), map[string]any{"requestKey": "short", "expectedRevision": 1, "name": "New"}, 400, nil)
	requestJSON(t, testClient(t), http.MethodGet, f.url+collection, nil, 401, nil)
}

func TestMediaVariantsPageArchiveCannotBeBypassedThroughOriginalFileAPI(t *testing.T) {
	f := newMediaFixture(t)
	var page WorkspacePage
	mediaVariantCall(t, f, "owner", "POST", "/api/workspace/pages", map[string]any{"name": "Archive visibility"}, 201, &page)
	app := "/api/workspace/pages/" + page.ID + "/app"
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "logo", Kind: "media", Width: 12}}}
	mediaVariantCall(t, f, "owner", "PUT", app, map[string]any{"expectedRevision": 0, "definition": definition}, 200, nil)
	base := app + "/media/logo"
	collection := base + "/variants"
	one := uploadPageFile(t, f.clients["owner"], f.url+base, f.project.ID, "archive-protection-file-0001", "Archived.png", mediaPicture(t), 201)
	var v MediaVariant
	mediaVariantCall(t, f, "owner", "POST", collection, map[string]any{"requestKey": "archive-protection-create-0001", "attachmentId": one.ID, "name": "Private archive"}, 201, &v)
	oldURL := f.url + base + "/" + one.ID + "/file?workspaceId=" + url.QueryEscape(f.project.ID)
	getMediaBytes(t, f.clients["member"], oldURL, 200)
	endpoint := collection + "/" + url.PathEscape(v.ID)
	mediaVariantCall(t, f, "owner", "PATCH", endpoint, map[string]any{"requestKey": "archive-protection-archive-0001", "expectedRevision": 1, "archived": true}, 200, &v)
	var files []PageMediaAttachment
	mediaVariantCall(t, f, "member", "GET", base, nil, 200, &files)
	if len(files) != 0 {
		t.Fatal("old list exposes archived variant files")
	}
	var report mediaVariantsReport
	mediaVariantCall(t, f, "member", "GET", collection, nil, 200, &report)
	if len(report.Items) != 0 {
		t.Fatal("new list exposes archived variant")
	}
	getMediaBytes(t, f.clients["member"], oldURL, 404)
	getMediaBytes(t, f.clients["member"], f.url+v.Versions[0].FileURL, 404)
	mediaVariantCall(t, f, "member", "GET", endpoint+"/history", nil, 404, nil)
	for _, actor := range []string{"owner", "admin"} {
		getMediaBytes(t, f.clients[actor], oldURL, 200)
		getMediaBytes(t, f.clients[actor], f.url+v.Versions[0].FileURL, 200)
	}
	mediaVariantCall(t, f, "owner", "PATCH", endpoint, map[string]any{"requestKey": "archive-protection-restore-0001", "expectedRevision": 2, "archived": false}, 200, &v)
	getMediaBytes(t, f.clients["member"], oldURL, 200)
}

func TestMediaVariantsRestoreLegacyArchiveKeepsOriginalFileAndCapacity(t *testing.T) {
	for _, kind := range []string{"note", "page"} {
		t.Run(kind, func(t *testing.T) {
			f := newMediaFixture(t)
			var collection, id, parent string
			table := "personal_note_attachments"
			if kind == "note" {
				var note PersonalNote
				requestJSON(t, f.clients["owner"], "POST", f.url+"/api/personal/notes", map[string]any{"title": "Old archive"}, 201, &note)
				parent = note.ID
				collection = "/api/personal/notes/" + note.ID + "/media-variants"
				file := uploadPersonalFile(t, f.clients["owner"], f.url+"/api/personal/notes/"+note.ID+"/attachments", "old-archive-file-0001", "", "Old.png", mediaPicture(t), 201)
				id = file.ID
			} else {
				table = "page_media_attachments"
				var page WorkspacePage
				mediaVariantCall(t, f, "owner", "POST", "/api/workspace/pages", map[string]any{"name": "Old archive page"}, 201, &page)
				parent = page.ID
				app := "/api/workspace/pages/" + page.ID + "/app"
				definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "archive", Kind: "media", Width: 12}}}
				mediaVariantCall(t, f, "owner", "PUT", app, map[string]any{"expectedRevision": 0, "definition": definition}, 200, nil)
				collection = app + "/media/archive/variants"
				file := uploadPageFile(t, f.clients["owner"], f.url+app+"/media/archive", f.project.ID, "old-archive-file-0001", "Old.png", mediaPicture(t), 201)
				id = file.ID
			}
			if _, err := f.store.db.Exec(`UPDATE `+table+` SET removed_at=? WHERE id=?`, nowText(), id); err != nil {
				t.Fatal(err)
			}
			var report mediaVariantsReport
			mediaVariantCall(t, f, "owner", "GET", collection, nil, 200, &report)
			if len(report.Items) != 1 || !report.Items[0].Archived || !report.Items[0].Versions[0].Removed {
				t.Fatal("old archive missing")
			}
			var v MediaVariant
			endpoint := collection + "/legacy:" + id
			mediaVariantCall(t, f, "owner", "PATCH", endpoint, map[string]any{"requestKey": "old-archive-rename-0001", "expectedRevision": 0, "name": "Renamed in archive"}, 200, &v)
			restore := map[string]any{"requestKey": "old-archive-restore-0001", "expectedRevision": 1, "archived": false}
			if kind == "page" {
				_, err := f.store.db.Exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<200)
				 INSERT INTO page_media_attachments(id,page_id,block_id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,request_key,created_at,updated_at)
				 SELECT 'capacity-'||i,?,'archive',?,'Existing.png','capacity-'||i||'.bin','image/png',1,'hash','capacity-key-'||i,'now','now' FROM n`, parent, f.users["owner"].ID)
				if err != nil {
					t.Fatal(err)
				}
				mediaVariantCall(t, f, "owner", "PATCH", endpoint, restore, 409, nil)
				f.store.db.Exec(`UPDATE page_media_attachments SET removed_at='now' WHERE id='capacity-1'`)
			}
			mediaVariantCall(t, f, "owner", "PATCH", endpoint, restore, 200, &v)
			mediaVariantCall(t, f, "owner", "PATCH", endpoint, restore, 200, &v)
			if v.Archived || v.Versions[0].Removed || v.Revision != 2 {
				t.Fatal("restore did not restore original exactly once", v)
			}
			var removed bool
			if err := f.store.db.QueryRow(`SELECT removed_at IS NOT NULL FROM `+table+` WHERE id=?`, id).Scan(&removed); err != nil || removed {
				t.Fatal("underlying upload remains archived", err)
			}
			mediaVariantCall(t, f, "owner", "PATCH", endpoint, map[string]any{"requestKey": "restored-selection-0001", "expectedRevision": 2, "selectedVersionId": "file:" + id}, 200, &v)
			getMediaBytes(t, f.clients["owner"], f.url+v.Versions[0].FileURL, 200)
		})
	}
}

func TestMediaVariantsFailedMetadataKeepsUploadedFileAndRetryDoesNotDuplicate(t *testing.T) {
	f := newMediaFixture(t)
	base := mediaVariantTestRecord(t, f, "retry-media-record", "document")
	collection := base + "/media-variants"
	one := uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "retry-image-key-0001", "Keep upload.png", mediaPicture(t), 201)
	if _, err := f.store.db.Exec(`CREATE TRIGGER test_fail_media_version BEFORE INSERT ON media_versions BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END`); err != nil {
		t.Fatal(err)
	}
	input := map[string]any{"requestKey": "retry-metadata-key-0001", "attachmentId": one.ID, "name": "Durable pending variant", "note": "Saved exactly once"}
	mediaVariantCall(t, f, "owner", "POST", collection, input, 500, nil)
	for _, table := range []string{"media_variants", "media_versions", "media_variant_events", "media_variant_requests"} {
		var count int
		if err := f.store.db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("partial metadata in %s: %d %v", table, count, err)
		}
	}
	var report mediaVariantsReport
	mediaVariantCall(t, f, "owner", "GET", collection, nil, 200, &report)
	if len(report.Items) != 1 || report.Items[0].Versions[0].AttachmentID != one.ID {
		t.Fatal("failed metadata lost uploaded bytes")
	}
	f.store.db.Exec(`DROP TRIGGER test_fail_media_version`)
	var v MediaVariant
	mediaVariantCall(t, f, "owner", "POST", collection, input, 201, &v)
	mediaVariantCall(t, f, "owner", "POST", collection, input, 200, &v)
	var count int
	f.store.db.QueryRow(`SELECT COUNT(*) FROM record_attachments WHERE record_id='retry-media-record'`).Scan(&count)
	if count != 1 || len(v.Versions) != 1 {
		t.Fatal("retry uploaded or linked twice")
	}
	two := uploadPageFile(t, f.clients["owner"], f.url+base+"/attachments", f.project.ID, "retry-image-key-0002", "Pending next.png", mediaPicture(t), 201)
	add := map[string]any{"requestKey": "retry-version-key-0001", "expectedRevision": 0, "attachmentId": two.ID}
	mediaVariantCall(t, f, "owner", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", add, 409, nil)
	mediaVariantCall(t, f, "owner", "GET", collection, nil, 200, &report)
	if len(report.Items) != 2 {
		t.Fatal("conflicting append swallowed independent upload")
	}
	add["expectedRevision"] = 1
	add["requestKey"] = "retry-version-key-0002"
	mediaVariantCall(t, f, "owner", "POST", collection+"/"+url.PathEscape(v.ID)+"/versions", add, 201, &v)
	if len(v.Versions) != 2 {
		t.Fatal("reviewed CAS did not preserve uploaded version")
	}
}

func TestMediaVariantsMigration076KeepsAll143TablesAndStoredAttachmentMetadata(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "pre076.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err = db.Exec(`PRAGMA foreign_keys=ON;CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	files, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") || file.Name() >= "076" {
			continue
		}
		body, err := migrationFiles.ReadFile("migrations/" + file.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(string(body)); err != nil {
			t.Fatalf("apply %s: %v", file.Name(), err)
		}
		if _, err = db.Exec(`INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)`, file.Name(), nowText()); err != nil {
			t.Fatal(err)
		}
	}
	store := &Store{db: db}
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: t.TempDir()}))
	defer server.Close()
	client := testClient(t)
	user := registerVerifiedWithoutFixture(t, client, server.URL, "pre076@example.test", "pre076")
	team := workspaceFinanceProject(t, client, server.URL, "Old media team")
	financeTestRecord(t, store, team.ID, user.ID, "old-media-record", "Original record", "document")
	var note PersonalNote
	requestJSON(t, client, "POST", server.URL+"/api/personal/notes", map[string]any{"title": "Original private note"}, 201, &note)
	var page WorkspacePage
	requestWorkspaceJSON(t, client, "POST", server.URL+"/api/workspace/pages", team.ID, map[string]any{"name": "Old page"}, 201, &page)
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO record_attachments(id,record_id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,created_at) VALUES('old-record-file','old-media-record',?,'Original.png','original.bin','image/png',4,'hash','2026-09-01')`, []any{user.ID}},
		{`INSERT INTO personal_note_attachments(id,note_id,original_name,stored_name,content_type,size_bytes,sha256,request_key,created_at,updated_at) VALUES('old-note-file',?,'Note.png','note.bin','image/png',4,'hash','old-note-key-0001','2026-09-01','2026-09-01')`, []any{note.ID}},
		{`INSERT INTO page_media_attachments(id,page_id,block_id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,request_key,created_at,updated_at) VALUES('old-page-file',?,'old-block',?,'Page.png','page.bin','image/png',4,'hash','old-page-key-0001','2026-09-01','2026-09-01')`, []any{page.ID, user.ID}},
	}
	for _, statement := range statements {
		if _, err = db.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	tables := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	rows.Close()
	if len(tables) != 143 {
		t.Fatal("pre076 schema mismatch", len(tables))
	}
	before := map[string][]map[string]any{}
	for _, table := range tables {
		before[table], err = exportRows(t.Context(), db, `SELECT * FROM "`+table+`"`, nil)
		if err != nil {
			t.Fatal(err)
		}
	}
	schemaBefore, err := exportRows(t.Context(), db, `SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name`, nil)
	if err != nil {
		t.Fatal(err)
	}
	body, err := migrationFiles.ReadFile("migrations/076_media_variants.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(string(body)); err != nil {
		t.Fatal(err)
	}
	for _, table := range tables {
		after, err := exportRows(t.Context(), db, `SELECT * FROM "`+table+`"`, nil)
		if err != nil || !reflect.DeepEqual(before[table], after) {
			t.Fatalf("076 altered %s: %v", table, err)
		}
	}
	schemaAfter, err := exportRows(t.Context(), db, `SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name NOT IN ('media_variants','media_versions','media_variant_events','media_variant_requests','record_attachment_requests') ORDER BY type,name`, nil)
	if err != nil || !reflect.DeepEqual(schemaBefore, schemaAfter) {
		t.Fatal("076 altered existing schema", err)
	}
	for _, table := range []string{"media_variants", "media_versions", "media_variant_events", "media_variant_requests", "record_attachment_requests"} {
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil || count != 0 {
			t.Fatal("076 backfilled a table", table, count, err)
		}
	}
	var report mediaVariantsReport
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/records/old-media-record/media-variants", team.ID, nil, 200, &report)
	if len(report.Items) != 1 || report.Items[0].Revision != 0 {
		t.Fatal("old media missing after migration")
	}
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM media_variants`).Scan(&count)
	if count != 0 {
		t.Fatal("first read backfilled metadata")
	}
}
