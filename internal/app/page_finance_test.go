package app

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestPageFinancePresentationValidation(t *testing.T) {
	for _, config := range []*PageFinanceConfig{nil, {}, {Display: "cards", RecentLimit: 1}, {Display: "compact", RecentLimit: 10}} {
		definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "money", Kind: "finance", Finance: config}}}
		if err := validatePageApp(&definition); err != nil {
			t.Fatal(config, err)
		}
	}
	for _, config := range []*PageFinanceConfig{{Display: "external"}, {RecentLimit: -1}, {RecentLimit: 11}, {IncomeLabel: strings.Repeat("я", 81)}} {
		if err := validatePageApp(&PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "money", Kind: "finance", Finance: config}}}); err == nil {
			t.Fatalf("invalid configuration accepted: %#v", config)
		}
	}
	config := &PageFinanceConfig{TotalLabel: "  Мой остаток  ", ExpenseLabel: strings.Repeat("я", 80)}
	if err := validatePageFinance(&PageAppBlock{Finance: config}); err != nil || config.TotalLabel != "Мой остаток" {
		t.Fatal("labels not normalized", config, err)
	}
}

func TestPageFinancePortableKitAndIndependentContexts(t *testing.T) {
	f := newLifecycleFixture(t)
	var page WorkspacePage
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/workspace/pages", f.project.ID, map[string]any{"name": "Обзор финансов"}, 201, &page)
	path := f.url + "/api/workspace/pages/" + page.ID + "/app"
	hide := false
	fontSize := 24
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "money", Kind: "finance", Title: "Общий учёт", Width: 12, Finance: &PageFinanceConfig{ShowRecent: &hide, RecentLimit: 3, Display: "compact", TotalLabel: "Бюджет", OpenLabel: "Весь учёт"}, ElementStyles: map[string]PageElementStyle{"financeValue": {FontSize: &fontSize}, "financeAccount": {Background: "#ffffff"}, "financeLabel": {Color: "#176b58"}, "financeButton": {Weight: "bold"}}}}}
	body := map[string]any{"expectedRevision": 0, "definition": definition}
	requestWorkspaceJSON(t, f.clients["member"], "PUT", path, f.project.ID, body, 403, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "PUT", path, f.project.ID, body, 200, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "PUT", path, f.project.ID, body, 409, nil)
	var state PageAppState
	requestWorkspaceJSON(t, f.clients["member"], "GET", path, f.project.ID, nil, 200, &state)
	if state.Revision != 1 || state.Definition.Blocks[0].Finance.ShowRecent == nil || *state.Definition.Blocks[0].Finance.ShowRecent || state.Definition.Blocks[0].Finance.Display != "compact" {
		t.Fatalf("presentation settings changed after reload: %#v", state)
	}
	// Unknown fields cannot smuggle a private ledger binding or live amounts into
	// the same schema that will be published in a kit.
	for _, field := range []string{"workspaceId", "sourceWorkspaceId", "bucketId", "balanceMinor", "entries"} {
		requestWorkspaceJSON(t, f.clients["owner"], "PUT", path, f.project.ID, map[string]any{"expectedRevision": 1, "definition": map[string]any{"version": 1, "blocks": []any{map[string]any{"id": "money", "kind": "finance", "finance": map[string]any{field: "private-value"}}}}}, 400, nil)
	}
	for _, invalid := range []map[string]any{{"showTotal": "false"}, {"recentLimit": 2.5}, {"recentLimit": 11}, {"display": "ledger"}} {
		requestWorkspaceJSON(t, f.clients["owner"], "PUT", path, f.project.ID, map[string]any{"expectedRevision": 1, "definition": map[string]any{"version": 1, "blocks": []any{map[string]any{"id": "money", "kind": "finance", "finance": invalid}}}}, 400, nil)
	}
	// Real finance exists independently of the block and must stay out of the
	// exported page: even another authenticated team can only install structure.
	bucket, source, entry, expense := workspaceFinanceFixture(t, f.clients["owner"], f.url, f.project.ID)
	personalBucket := financeCreateBucket(t, f.clients["owner"], f.url, "Личный непубличный резерв")
	var kit PageAppTemplate
	requestWorkspaceJSON(t, f.clients["owner"], "POST", path+"/template", f.project.ID, map[string]any{"name": "Настраиваемый финансовый обзор", "visibility": "public", "expectedRevision": 1}, 201, &kit)
	var published PageAppTemplate
	requestWorkspaceJSON(t, f.clients["outsider"], "GET", f.url+"/api/page-app/templates/"+kit.ID, fmt.Sprintf("personal-%d", f.users["outsider"].ID), nil, 200, &published)
	raw, err := json.Marshal(published.Definition)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{f.project.ID, bucket.ID, bucket.Name, source.ID, entry.ID, expense.ID, personalBucket.ID, personalBucket.Name, "sourceWorkspaceId", "balanceMinor"} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("kit contains financial data or binding: %s", secret)
		}
	}
	personalID := fmt.Sprintf("personal-%d", f.users["outsider"].ID)
	other := workspaceFinanceProject(t, f.clients["outsider"], f.url, "Независимая команда")
	for _, workspaceID := range []string{personalID, other.ID} {
		var installed WorkspacePage
		requestWorkspaceJSON(t, f.clients["outsider"], "POST", f.url+"/api/page-app/templates/"+kit.ID+"/install", workspaceID, map[string]any{}, 201, &installed)
		var installedState PageAppState
		requestWorkspaceJSON(t, f.clients["outsider"], "GET", f.url+"/api/workspace/pages/"+installed.ID+"/app", workspaceID, nil, 200, &installedState)
		block := installedState.Definition.Blocks[0]
		if installed.ID == page.ID || block.Kind != "finance" || block.Finance.TotalLabel != "Бюджет" || block.Finance.OpenLabel != "Весь учёт" || block.Finance.Display != "compact" || *block.Finance.ShowRecent || len(block.ElementStyles) != 4 {
			t.Fatal("kit lost presentation or reused page", installed, installedState)
		}
		var overview financeOverview
		if workspaceID == personalID {
			requestWorkspaceJSON(t, f.clients["outsider"], "GET", f.url+"/api/personal/finance", workspaceID, nil, 200, &overview)
		} else {
			workspaceFinanceRequest(t, f.clients["outsider"], "GET", f.url, "", workspaceID, "", "", nil, 200, &overview)
		}
		if len(overview.Buckets)+len(overview.Entries)+len(overview.Expenses) != 0 || (overview.Scope != nil && (overview.Scope.Linked || overview.Scope.SourceWorkspaceID != workspaceID)) {
			t.Fatal("installation copied source finances or created a source link", overview)
		}
	}
}
