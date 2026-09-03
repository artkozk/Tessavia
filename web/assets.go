package web

import "embed"

// Files contains the complete browser application and is compiled into the server binary.
//
//go:embed index.html app.js habit-tracker.js graph-layout-state.js offline-outbox.js outbox-ui.js sw.js styles.css manifest.webmanifest brand/* fonts/* vendor/*
var Files embed.FS
