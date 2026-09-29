package main

import (
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
)

// /mirror is the manager's own page now, not display-server's proxied one:
// it must come out of this binary's embed, whole, and never be cached (a
// device update must be seen on the next load).
func TestHandleMirrorServesEmbeddedPage(t *testing.T) {
	app := &App{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	rec := httptest.NewRecorder()
	app.handleMirror(rec, httptest.NewRequest("GET", "/mirror", nil))

	if rec.Code != 200 {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type %q, want text/html", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control %q, want no-store", cc)
	}
	body := rec.Body.String()
	for _, want := range []string{"const SURFACE_VERSION", "/stream-auto?v=2", "</html>"} {
		if !strings.Contains(body, want) {
			t.Errorf("page is missing %q", want)
		}
	}
}
