// The Projects page: a project downloaded here comes back through the upload
// as a second project, a module this Move lacks is named, and a bad id or a
// foreign file is refused. The archive rules themselves are project_archive.py's
// (tests/host/test_project_archive.sh); this runs the real project-cmd.sh.

package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func projectsApp(t *testing.T) (*App, string) {
	t.Helper()
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatalf("python3 is needed to run project-cmd.sh: %v", err)
	}
	src, err := filepath.Abs("../standalone/scripts/project-cmd.sh")
	if err != nil {
		t.Fatal(err)
	}
	old := projectCmdPath
	projectCmdPath = func(string) string { return src }
	t.Cleanup(func() { projectCmdPath = old })
	t.Setenv("PYTHONDONTWRITEBYTECODE", "1")
	base := t.TempDir()
	t.Setenv("SETTINGS_JSON", filepath.Join(base, "Settings.json"))
	d := filepath.Join(base, "projects", uuidA)
	writeFile(t, filepath.Join(d, "Move-Set-aaaaaaaa", "Song.abl"), []byte(`{"tracks":[]}`))
	writeFile(t, filepath.Join(d, "dAVEBOx", "seq8sa-state.json"), []byte(`{"v":36}`))
	writeFile(t, filepath.Join(d, "dAVEBOx", "name.txt"), []byte("Brave Castle\n"))
	writeFile(t, filepath.Join(d, "dAVEBOx", "host", "slot_1.json"),
		[]byte(`{"chain":{"synth":{"module":"plank"},"audio_fx":[{"module":"plank-amp"}]}}`))
	// This Move has plank (a sound generator) but not plank-amp. ⚠ It is
	// reached through a LINK, as the install's categories are (into the stock
	// tree), and plank-amp is not judged by the pack-entry prefix ("plank-…").
	stock := filepath.Join(base, "stock-modules", "sound_generators")
	if err := os.MkdirAll(filepath.Join(stock, "plank"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(base, "modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(stock, filepath.Join(base, "modules", "sound_generators")); err != nil {
		t.Fatal(err)
	}
	return newBugApp(t, base), base
}

func TestProjectsExportImportRoundTrip(t *testing.T) {
	app, base := projectsApp(t)

	page := get(app, app.handleProjects, "/projects")
	if page.Code != 200 || !strings.Contains(page.Body.String(), "Brave Castle") ||
		!strings.Contains(page.Body.String(), "/projects/export?id="+uuidA) {
		t.Fatalf("page does not list the project with its download link (%d)", page.Code)
	}

	rec := get(app, app.handleProjectExport, "/projects/export?id="+uuidA)
	if rec.Code != 200 {
		t.Fatalf("export: %d %s", rec.Code, rec.Body.String())
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "dAVEBOx-brave-castle-") {
		t.Errorf("download name: %q", cd)
	}
	body := rec.Body.Bytes()
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("export is not a zip: %v", err)
	}
	found := false
	for _, f := range zr.File {
		if f.Name == "projects/"+uuidA+"/dAVEBOx/seq8sa-state.json" {
			found = true
		}
	}
	if !found {
		t.Fatal("the project's state is not in the export")
	}
	if left, _ := filepath.Glob(filepath.Join(base, projectXferDir, "*")); len(left) != 0 {
		t.Errorf("export left staging files: %v", left)
	}

	res, code := uploadProject(t, app, body)
	if code != 200 || !res.OK || len(res.Imported) != 1 {
		t.Fatalf("import: %d %+v", code, res)
	}
	if res.Imported[0].Name != "Brave Castle (imported)" || res.Imported[0].UUID == uuidA {
		t.Errorf("imported as %+v — want a NEW project beside the original", res.Imported[0])
	}
	if len(res.NotInstalled) != 1 || res.NotInstalled[0] != "plank-amp" {
		t.Errorf("not installed = %v, want [plank-amp]", res.NotInstalled)
	}
	if n := len(listProjects(base)); n != 2 {
		t.Errorf("%d projects after the import, want 2", n)
	}
	if left, _ := filepath.Glob(filepath.Join(base, projectXferDir, "*")); len(left) != 0 {
		t.Errorf("import left staging files: %v", left)
	}
}

func TestProjectsRefusals(t *testing.T) {
	app, base := projectsApp(t)
	if rec := get(app, app.handleProjectExport, "/projects/export?id=../../etc"); rec.Code != http.StatusBadRequest {
		t.Errorf("a non-uuid id: %d, want 400", rec.Code)
	}
	if rec := get(app, app.handleProjectExport, "/projects/export?id="+uuidB); rec.Code != http.StatusNotFound {
		t.Errorf("an unknown project: %d, want 404", rec.Code)
	}
	res, code := uploadProject(t, app, []byte("not a zip at all"))
	if code != http.StatusUnprocessableEntity || res.OK || !strings.Contains(res.Error, "not a zip") {
		t.Errorf("a foreign file: %d %+v", code, res)
	}
	if n := len(listProjects(base)); n != 1 {
		t.Errorf("a refused import changed the store: %d projects", n)
	}
}

func uploadProject(t *testing.T, app *App, data []byte) (projectImportResult, int) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", "backup.zip")
	fw.Write(data)
	mw.Close()
	req := httptest.NewRequest("POST", "/projects/import", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	app.handleProjectImport(rec, req)
	var res projectImportResult
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("import answered non-JSON (%d): %s", rec.Code, rec.Body.String())
	}
	return res, rec.Code
}
