package app

import (
	"io/fs"
	"net/http"
	"strings"

	"business-control/web"
)

// Only public, versioned application files can be cached permanently. HTML must
// revalidate so the next deployment supplies its new CSS/JS URLs immediately.
func cacheEmbeddedAssets(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		versioned := r.URL.Query().Get("v") != "" && (name == "app.js" || name == "styles.css" || strings.HasPrefix(name, "brand/"))
		stable := strings.HasPrefix(name, "fonts/") || strings.HasPrefix(name, "vendor/")
		if info, err := fs.Stat(web.Files, name); err == nil && !info.IsDir() && (versioned || stable) {
			if versioned {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "public, max-age=86400")
			}
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		next.ServeHTTP(w, r)
	})
}
