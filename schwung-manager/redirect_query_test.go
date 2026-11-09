package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The short addresses must keep their query: ?screen=1 on /remote-ui or /
// is how a tablet opens the Screen view alone.
func TestCarryQuery(t *testing.T) {
	for _, c := range []struct{ target, q, want string }{
		{"/", "", "/"},
		{"/", "screen=1", "/?screen=1"},
		{"/m/web_ui.html?schwungStandalone=1&tool=1", "screen=1", "/m/web_ui.html?schwungStandalone=1&tool=1&screen=1"},
	} {
		if got := carryQuery(c.target, c.q); got != c.want {
			t.Errorf("carryQuery(%q, %q) = %q, want %q", c.target, c.q, got, c.want)
		}
	}
}

func TestRemoteUIRedirectKeepsQuery(t *testing.T) {
	app := &App{}
	rec := httptest.NewRecorder()
	app.handleRemoteUI(rec, httptest.NewRequest(http.MethodGet, "/remote-ui?screen=1", nil))
	if loc := rec.Header().Get("Location"); loc != "/?screen=1" {
		t.Fatalf("Location = %q, want /?screen=1", loc)
	}
}
