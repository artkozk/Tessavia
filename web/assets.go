package web

import "embed"

// Files contains the complete browser application and is compiled into the server binary.
//
//go:embed page-block-trash.js page-block-trash.css
//go:embed field-conversion.js page-block-kind.js
//go:embed personal-plan-references.js
//go:embed mobile-access.js mobile-access.css phone-notifications.js phone-notifications.css
//go:embed swipe-tabs.js
//go:embed mobile-widgets.js
//go:embed select-positioning.js
//go:embed page-media.js page-media.css
//go:embed page-finance.js page-finance.css
//
//go:embed page-labels.js page-components.js page-components.css page-sheets.js page-sheets.css index.html app.js personal-finance.js personal-finance.css settings-hub.js settings-hub.css field-conflicts.js page-apps.js page-element-styles.js page-form-elements.js page-composition.js page-record-bindings.js page-record-card.js page-calculations.js page-data-sources.js page-block-visibility.js page-forms.js page-record-actions.js page-action-conditions.js chat-workspace.js chat-groups.js reading.js emoji-picker.js life-map.js personal-publish.js personal-inbox.js personal-today.js personal-calendar.js personal-navigation.js reminder-settings.js personal-reminders.js personal-waiting.js personal-review.js habit-reminders.js first-use.js note-media.js note-library.js bulk-work.js habit-tracker.js graph-layout-state.js offline-outbox.js outbox-ui.js sw.js styles.css manifest.webmanifest brand/* fonts/* vendor/*
var Files embed.FS
