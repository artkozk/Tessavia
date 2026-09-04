package web

import "embed"

// Files contains the complete browser application and is compiled into the server binary.
//
//go:embed index.html app.js reading.js emoji-picker.js life-map.js personal-publish.js personal-inbox.js personal-today.js personal-navigation.js reminder-settings.js personal-reminders.js personal-waiting.js personal-review.js habit-reminders.js first-use.js note-media.js note-library.js bulk-work.js habit-tracker.js graph-layout-state.js offline-outbox.js outbox-ui.js sw.js styles.css manifest.webmanifest brand/* fonts/* vendor/*
var Files embed.FS
