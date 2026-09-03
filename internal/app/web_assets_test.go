package app

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"business-control/web"
)

func TestOnlyPublicAssetsReceiveLongLivedCaching(t *testing.T) {
	handler := cacheEmbeddedAssets(http.FileServer(http.FS(web.Files)))
	for _, item := range []struct{ path, cache string }{
		{"/", "no-cache"}, {"/index.html?v=1", "no-cache"},
		{"/manifest.webmanifest", "no-cache"}, {"/app.js", "no-cache"},
		{"/app.js?v=release-1", "public, max-age=31536000, immutable"},
		{"/styles.css?v=release-1", "public, max-age=31536000, immutable"},
		{"/brand/tessavie-logo.svg?v=linked-1", "public, max-age=31536000, immutable"},
		{"/fonts/Onest-Variable.ttf", "public, max-age=86400"},
		{"/brand/missing.svg?v=1", ""}, {"/api/private?v=1", ""},
	} {
		t.Run(item.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, item.path, nil))
			if got := response.Header().Get("Cache-Control"); got != item.cache {
				t.Fatalf("Cache-Control = %q; want %q", got, item.cache)
			}
		})
	}
}
