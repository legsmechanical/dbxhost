// The file browser's shortcut links (-file-shortcuts): the page a user opens
// at /files shows each one whose folder exists, and hides one whose folder
// does not.

package main

import (
	"io"
	"log/slog"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseFileShortcuts(t *testing.T) {
	got := parseFileShortcuts(" Exports = /data/x/exports/ , bad, =/nolabel, Rel=relative/path, Two=/a")
	want := []fileShortcut{{"Exports", "/data/x/exports"}, {"Two", "/a"}}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("[%d] got %v, want %v", i, got[i], want[i])
		}
	}
	if parseFileShortcuts("") != nil {
		t.Errorf("an empty flag must give no shortcuts")
	}
}

func TestFilesPageShowsShortcuts(t *testing.T) {
	root := t.TempDir()
	exports := filepath.Join(root, "dbx", "exports")
	if err := os.MkdirAll(exports, 0o755); err != nil {
		t.Fatal(err)
	}
	tmpl, err := loadTemplates()
	if err != nil {
		t.Fatalf("loadTemplates: %v", err)
	}
	app := &App{
		tmpl:    tmpl,
		fileSvc: &FileService{AllowedRoots: []string{root + "/"}},
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		fileShortcuts: parseFileShortcuts("My exports=" + exports +
			",Missing=" + filepath.Join(root, "nope") + ",Outside=/"),
	}
	page := func(path string) string {
		rec := httptest.NewRecorder()
		app.handleFiles(rec, httptest.NewRequest("GET", "/files?path="+path, nil))
		if rec.Code != 200 {
			t.Fatalf("GET /files?path=%s: %d %s", path, rec.Code, rec.Body.String())
		}
		return rec.Body.String()
	}
	body := page(root)
	if !strings.Contains(body, `class="file-shortcuts"`) || !strings.Contains(body, ">My exports</a>") {
		t.Fatalf("the shortcut is not on the page:\n%s", body)
	}
	// html/template escapes the query: compare in the escaped form.
	if !strings.Contains(strings.ToLower(body), strings.ToLower(`href="/files?path=`+url.QueryEscape(exports)+`"`)) {
		t.Errorf("the shortcut does not open its folder")
	}
	if strings.Contains(body, "Missing") {
		t.Errorf("a shortcut to a folder that does not exist is shown")
	}
	if strings.Contains(body, ">Outside</a>") {
		t.Errorf("a shortcut outside the allowed roots is shown")
	}
	// The shortcut to the folder being shown is marked.
	if !strings.Contains(page(exports), `aria-current="page">My exports</a>`) {
		t.Errorf("the current folder's shortcut is not marked")
	}
	// Control: no flag, no shortcut row.
	app.fileShortcuts = nil
	if strings.Contains(page(root), `class="file-shortcuts"`) {
		t.Errorf("a shortcut row with no shortcuts")
	}
}
