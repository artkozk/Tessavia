package app

import (
	"errors"
	"strings"
)

// Presentation only. Ledger IDs, account IDs and financial values never belong
// to a portable page definition: runtime resolves the page's own workspace.
type PageFinanceConfig struct {
	ShowTotal     *bool  `json:"showTotal,omitempty"`
	ShowAccounts  *bool  `json:"showAccounts,omitempty"`
	ShowRecent    *bool  `json:"showRecent,omitempty"`
	ShowActions   *bool  `json:"showActions,omitempty"`
	RecentLimit   int    `json:"recentLimit,omitempty"`
	Display       string `json:"display,omitempty"`
	TotalLabel    string `json:"totalLabel,omitempty"`
	AccountsLabel string `json:"accountsLabel,omitempty"`
	RecentLabel   string `json:"recentLabel,omitempty"`
	OpenLabel     string `json:"openLabel,omitempty"`
	IncomeLabel   string `json:"incomeLabel,omitempty"`
	ExpenseLabel  string `json:"expenseLabel,omitempty"`
}

func validatePageFinance(block *PageAppBlock) error {
	if block.Finance == nil {
		return nil
	}
	config := block.Finance
	if config.Display != "" && config.Display != "cards" && config.Display != "compact" {
		return errors.New("Выберите карточки или компактный список финансов")
	}
	if config.RecentLimit < 0 || config.RecentLimit > 10 {
		return errors.New("В блоке можно показывать от 1 до 10 последних операций")
	}
	for _, label := range []*string{&config.TotalLabel, &config.AccountsLabel, &config.RecentLabel, &config.OpenLabel, &config.IncomeLabel, &config.ExpenseLabel} {
		*label = strings.TrimSpace(*label)
		if len([]rune(*label)) > 80 {
			return errors.New("Подпись финансового блока — не более 80 символов")
		}
	}
	return nil
}
