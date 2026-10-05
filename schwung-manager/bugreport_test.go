// The "Report a bug" page: what it collects, that the preview IS what is sent,
// the upload contract with Google Apps Script (POST answered by a 302 to a GET),
// and the test-build gate.

package main

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

const (
	uuidA = "aaaaaaaa-1111-4111-8111-111111111111"
	uuidB = "bbbbbbbb-2222-4222-8222-222222222222"
	uuidC = "cccccccc-3333-4333-8333-333333333333"
	slotA = "5107a000-0000-4000-8000-000000000000"
)

func writeFile(t *testing.T, p string, b []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

// fixtureBase builds an install dir shaped like the device's.
func fixtureBase(t *testing.T) string {
	t.Helper()
	b := t.TempDir()
	// A: state folder suffixed by Move, a Move set with a sample in it.
	a := filepath.Join(b, "projects", uuidA)
	writeFile(t, filepath.Join(a, "dAVEBOx~11", "seq8sa-state.json"), []byte(`{"v":36}`))
	writeFile(t, filepath.Join(a, "dAVEBOx~11", "seq8sa-ui-state.json"), []byte(`{"v":9}`))
	writeFile(t, filepath.Join(a, "dAVEBOx~11", "name.txt"), []byte("Lead Set\n"))
	writeFile(t, filepath.Join(a, "dAVEBOx~11", "host", "slot_4.json"), []byte(`{"module":"minijv"}`))
	writeFile(t, filepath.Join(a, "Move-Set-aaaaaaaa", "Song.abl"), []byte("abl"))
	writeFile(t, filepath.Join(a, "Move-Set-aaaaaaaa", "Samples", "kick.wav"), []byte("RIFF....WAVE"))
	// B: plain state folder.
	bb := filepath.Join(b, "projects", uuidB)
	writeFile(t, filepath.Join(bb, "dAVEBOx", "seq8sa-state.json"), []byte(`{"v":36}`))
	writeFile(t, filepath.Join(bb, "dAVEBOx", "name.txt"), []byte("Beats"))
	// C: two candidate state folders — the last listed wins.
	c := filepath.Join(b, "projects", uuidC)
	writeFile(t, filepath.Join(c, "dAVEBOx", "seq8sa-state.json"), []byte(`{}`))
	writeFile(t, filepath.Join(c, "dAVEBOx~3", "seq8sa-state.json"), []byte(`{}`))
	// Not a project.
	writeFile(t, filepath.Join(b, "projects", "notes.txt"), []byte("x"))
	// Saves: A newest, then B, then C.
	now := time.Now()
	_ = os.Chtimes(filepath.Join(a, "dAVEBOx~11", "seq8sa-state.json"), now, now)
	_ = os.Chtimes(filepath.Join(bb, "dAVEBOx", "seq8sa-state.json"), now.Add(-time.Hour), now.Add(-time.Hour))
	_ = os.Chtimes(filepath.Join(c, "dAVEBOx~3", "seq8sa-state.json"), now.Add(-2*time.Hour), now.Add(-2*time.Hour))
	// The live library entry points at B (so the open project is NOT the newest save).
	if err := os.MkdirAll(filepath.Join(b, "sets", "library"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(bb, filepath.Join(b, "sets", "library", slotA)); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(b, "active_set.txt"), []byte(slotA+"\nMove-Set-bbbbbbbb\n"))
	// Logs: launch.log past its 2 MB tail, ending with a known line.
	big := bytes.Repeat([]byte("x"), 3<<20)
	big = append(big, []byte("\nLAST LINE\n")...)
	writeFile(t, filepath.Join(b, "launch.log"), big)
	writeFile(t, filepath.Join(b, "seq8sa.log"), []byte("SEQ8 init\n"))
	writeFile(t, filepath.Join(b, "sa-build.json"), []byte(`{"version":"0.0.11"}`))
	return b
}

func TestListProjectsFindsVariantStateDirs(t *testing.T) {
	ps := listProjects(fixtureBase(t))
	if len(ps) != 3 {
		t.Fatalf("want 3 projects, got %+v", ps)
	}
	if ps[0].UUID != uuidA || ps[0].StateDir != "dAVEBOx~11" || ps[0].Name != "Lead Set" || ps[0].SongDir != "Move-Set-aaaaaaaa" {
		t.Errorf("project A read wrong (or not newest first): %+v", ps[0])
	}
	if ps[1].UUID != uuidB || ps[1].StateDir != "dAVEBOx" || ps[1].Name != "Beats" {
		t.Errorf("project B read wrong: %+v", ps[1])
	}
	if ps[2].StateDir != "dAVEBOx~3" || ps[2].Name != uuidC[:8] {
		t.Errorf("project C: the last-listed state folder must win and the name fall back to the uuid: %+v", ps[2])
	}
}

// The name rule is project_name.py's clean(); a CRLF two-line file shows the
// shape (Python: "Lead\r\nSet\n" → "Lead  Set").
func TestCleanProjectNameMatchesPython(t *testing.T) {
	for in, want := range map[string]string{"Lead\r\nSet\n": "Lead  Set", "  Beats \n": "Beats", "": ""} {
		if got := cleanProjectName(in); got != want {
			t.Errorf("cleanProjectName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDetectOpenProject(t *testing.T) {
	b := fixtureBase(t)
	if u, how := detectOpenProject(b, listProjects(b)); u != uuidB || how != "active_set" {
		t.Errorf("open project via active_set: got %s/%s, want %s/active_set", u, how, uuidB)
	}
	_ = os.Remove(filepath.Join(b, "sets", "library", slotA))
	if u, how := detectOpenProject(b, listProjects(b)); u != uuidA || how != "newest" {
		t.Errorf("fallback to the newest save: got %s/%s, want %s/newest", u, how, uuidA)
	}
	empty := t.TempDir()
	if u, how := detectOpenProject(empty, nil); u != "" || how != "none" {
		t.Errorf("nothing to find: got %q/%q", u, how)
	}
}

func TestPlanReport(t *testing.T) {
	b := fixtureBase(t)
	ps := listProjects(b)
	pl := planReport(b, &ps[0])
	has := map[string]reportEntry{}
	for _, e := range pl.Entries {
		has[e.ZipPath] = e
	}
	for _, want := range []string{
		"project/" + uuidA + "/dAVEBOx~11/seq8sa-state.json",
		"project/" + uuidA + "/dAVEBOx~11/host/slot_4.json",
		"project/" + uuidA + "/Move-Set-aaaaaaaa/Song.abl",
		"logs/seq8sa.log",
	} {
		if _, ok := has[want]; !ok {
			t.Errorf("plan is missing %s", want)
		}
	}
	if e := has["logs/launch.log"]; e.Tail != 2<<20 || e.Size != 2<<20 {
		t.Errorf("launch.log must be sent as its last 2 MB: %+v", e)
	}
	skippedAudio := false
	for _, s := range pl.Skipped {
		if strings.HasSuffix(s.Path, "kick.wav") && s.Reason == "audio" {
			skippedAudio = true
		}
	}
	if !skippedAudio {
		t.Errorf("the sample was not skipped as audio: %+v", pl.Skipped)
	}
	missing := strings.Join(pl.Missing, ",")
	if !strings.Contains(missing, "shim_crash_bt.txt") {
		t.Errorf("an absent crash log must be listed as missing: %s", missing)
	}
	// Logs only.
	if lo := planReport(b, nil); lo.Project != nil || len(lo.Entries) == 0 {
		t.Errorf("a logs-only plan: %+v", lo)
	}
}

func openZip(t *testing.T, p string) map[string][]byte {
	t.Helper()
	zr, err := zip.OpenReader(p)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	out := map[string][]byte{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(rc)
		rc.Close()
		out[f.Name] = b
	}
	return out
}

func TestBuildZipMatchesPlanAndMeta(t *testing.T) {
	b := fixtureBase(t)
	ps := listProjects(b)
	pl := planReport(b, &ps[0])
	meta := &reportMeta{Note: "it crashed"}
	dst := filepath.Join(t.TempDir(), "r.zip")
	if err := buildZip(dst, pl, meta, bugReportCapBytes); err != nil {
		t.Fatal(err)
	}
	files := openZip(t, dst)
	for _, e := range pl.Entries {
		if _, ok := files[e.ZipPath]; !ok {
			t.Errorf("the zip lacks a planned file: %s", e.ZipPath)
		}
	}
	if len(files) != len(pl.Entries)+2 {
		t.Errorf("the zip holds %d files, the plan %d (+note, +meta)", len(files), len(pl.Entries))
	}
	if string(files["note.txt"]) != "it crashed\n" {
		t.Errorf("note.txt: %q", files["note.txt"])
	}
	if !strings.Contains(string(files["meta.json"]), `"truncated": false`) {
		t.Errorf("meta.json: %s", files["meta.json"])
	}
	lg := files["logs/launch.log"]
	if len(lg) != 2<<20 || !strings.HasSuffix(string(lg), "LAST LINE\n") {
		t.Errorf("launch.log tail: %d bytes, ends %q", len(lg), string(lg[len(lg)-12:]))
	}
}

func TestZipSizeCap(t *testing.T) {
	b := fixtureBase(t)
	for i := 0; i < 3; i++ {
		junk := make([]byte, 6<<20) // incompressible
		_, _ = rand.Read(junk)
		writeFile(t, filepath.Join(b, "projects", uuidA, "dAVEBOx~11", "blob"+string(rune('0'+i))+".bin"), junk)
	}
	ps := listProjects(b)
	pl := planReport(b, &ps[0])
	meta := &reportMeta{}
	dst := filepath.Join(t.TempDir(), "r.zip")
	const capB = 10 << 20
	if err := buildZip(dst, pl, meta, capB); err != nil {
		t.Fatal(err)
	}
	fi, _ := os.Stat(dst)
	if fi.Size() > capB+(7<<20) {
		t.Errorf("the zip is %d bytes, cap %d (+ at most one entry)", fi.Size(), capB)
	}
	if !meta.Truncated {
		t.Errorf("a capped zip must say truncated")
	}
	files := openZip(t, dst)
	if !strings.Contains(string(files["meta.json"]), "size cap") {
		t.Errorf("meta.json does not list what the cap left out")
	}
}

// The Apps Script contract: POST text/plain base64 → 302 → GET → JSON.
func TestUploadFollowsAppsScriptRedirect(t *testing.T) {
	dst := filepath.Join(t.TempDir(), "r.zip")
	if err := os.WriteFile(dst, bytes.Repeat([]byte("PK\x03\x04data"), 50000), 0o644); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(dst)
	want := sha256.Sum256(raw)
	echo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("after the 302 the client must GET, got %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true,"id":"drive123"}`)
	}))
	defer echo.Close()
	var gotName string
	exec := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("Content-Type") != "text/plain" || r.ContentLength <= 0 {
			t.Errorf("POST text/plain with a length expected: %s %q %d", r.Method, r.Header.Get("Content-Type"), r.ContentLength)
		}
		b, _ := io.ReadAll(r.Body)
		dec, err := base64.StdEncoding.DecodeString(string(b))
		if err != nil || sha256.Sum256(dec) != want {
			t.Errorf("the body is not the zip in base64 (err %v)", err)
		}
		gotName = r.URL.Query().Get("name")
		http.Redirect(w, r, echo.URL+"/macros/echo?x=1", http.StatusFound)
	}))
	defer exec.Close()
	id, err := uploadReport(t.Context(), &http.Client{}, bugReportConfig{UploadURL: exec.URL + "/exec"}, dst, "dbx-report_x.zip", "0.0.11", "move")
	if err != nil || id != "drive123" {
		t.Fatalf("upload: id %q err %v", id, err)
	}
	if gotName != "dbx-report_x.zip" {
		t.Errorf("name not passed: %q", gotName)
	}
}

func TestUploadRejectsHtmlAndUnreachable(t *testing.T) {
	dst := filepath.Join(t.TempDir(), "r.zip")
	_ = os.WriteFile(dst, []byte("PK"), 0o644)
	html := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "<html>You need access</html>")
	}))
	defer html.Close()
	if _, err := uploadReport(t.Context(), &http.Client{}, bugReportConfig{UploadURL: html.URL}, dst, "n.zip", "v", "h"); err == nil || !strings.Contains(err.Error(), "unexpected response") {
		t.Errorf("a 200 carrying HTML must fail: %v", err)
	}
	refused := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"ok":false,"error":"bad token"}`)
	}))
	defer refused.Close()
	if _, err := uploadReport(t.Context(), &http.Client{}, bugReportConfig{UploadURL: refused.URL}, dst, "n.zip", "v", "h"); err == nil || !strings.Contains(err.Error(), "bad token") {
		t.Errorf("ok:false must fail with its reason: %v", err)
	}
	gone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	u := gone.URL
	gone.Close()
	if _, err := uploadReport(t.Context(), &http.Client{}, bugReportConfig{UploadURL: u}, dst, "n.zip", "v", "h"); err == nil {
		t.Errorf("an unreachable receiver must fail")
	}
}

func TestReportNameSlug(t *testing.T) {
	at := time.Date(2026, 10, 5, 9, 8, 7, 0, time.Local)
	for _, c := range []struct{ ver, note, want string }{
		{"0.0.11", "My note!", "dbx-report_2026-10-05_09-08-07_0.0.11_my-note.zip"},
		{"abc123-dirty", "", "dbx-report_2026-10-05_09-08-07_abc123-dirty_no-note.zip"},
		{"v/1 2", "Crash when loading TEST copy copy, again and again and again", "dbx-report_2026-10-05_09-08-07_v_1_2_crash-when-loading-test-copy-cop.zip"},
	} {
		if got := reportName(at, c.ver, c.note); got != c.want {
			t.Errorf("reportName(%q,%q) = %q, want %q", c.ver, c.note, got, c.want)
		}
		if !reReportName.MatchString(reportName(at, c.ver, c.note)) {
			t.Errorf("a generated name fails the download check: %s", reportName(at, c.ver, c.note))
		}
	}
}

func newBugApp(t *testing.T, base string) *App {
	t.Helper()
	tmpl, err := loadTemplates()
	if err != nil {
		t.Fatalf("loadTemplates: %v", err)
	}
	return &App{tmpl: tmpl, basePath: base, fileSvc: &FileService{AllowedRoots: []string{base + "/"}},
		logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func get(app *App, h http.HandlerFunc, target string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest("GET", target, nil))
	return rec
}

func TestBugReportPageGate(t *testing.T) {
	b := fixtureBase(t)
	app := newBugApp(t, b)
	// No file: no page, no card.
	if rec := get(app, app.handleBugReport, "/bug-report"); rec.Code != 404 {
		t.Errorf("without bug-report.json the page must 404, got %d", rec.Code)
	}
	if strings.Contains(get(app, app.handleSystem, "/system").Body.String(), "/bug-report") {
		t.Errorf("the System page links the report page in a non-test build")
	}
	// Download-only.
	writeFile(t, filepath.Join(b, bugReportConfigFile), []byte(`{"upload_url":""}`))
	body := get(app, app.handleBugReport, "/bug-report").Body.String()
	if !strings.Contains(body, "Download report instead") || strings.Contains(body, "Send report") {
		t.Errorf("an empty upload_url must give a download-only page")
	}
	if !strings.Contains(body, "Beats (open now)") || !strings.Contains(body, "Lead Set") {
		t.Errorf("the project list / open marker is wrong")
	}
	if !strings.Contains(body, "dAVEBOx~11") && !strings.Contains(body, "seq8sa-state.json") {
		t.Errorf("the plan is not shown")
	}
	if !strings.Contains(get(app, app.handleSystem, "/system").Body.String(), `href="/bug-report"`) {
		t.Errorf("a test build's System page lacks the report link")
	}
	// With an address.
	writeFile(t, filepath.Join(b, bugReportConfigFile), []byte(`{"upload_url":"https://example.invalid/exec"}`))
	if !strings.Contains(get(app, app.handleBugReport, "/bug-report").Body.String(), "Send report") {
		t.Errorf("with an upload_url the page must offer Send")
	}
	// The plan partial validates the project.
	if rec := get(app, app.handleBugReportPlan, "/bug-report/plan?project=../../etc"); rec.Code != 400 {
		t.Errorf("an unknown project must be refused, got %d", rec.Code)
	}
	if rec := get(app, app.handleBugReportPlan, "/bug-report/plan?project="+uuidA); rec.Code != 200 || !strings.Contains(rec.Body.String(), "slot_4.json") {
		t.Errorf("the plan partial for project A: %d", rec.Code)
	}
}

func TestSendFlowEndToEnd(t *testing.T) {
	b := fixtureBase(t)
	app := newBugApp(t, b)
	recv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.ReadAll(r.Body)
		_, _ = io.WriteString(w, `{"ok":true,"id":"d1"}`)
	}))
	defer recv.Close()
	writeFile(t, filepath.Join(b, bugReportConfigFile), []byte(`{"upload_url":"`+recv.URL+`"}`))
	post := func(form url.Values) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/bug-report/send", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		rec := httptest.NewRecorder()
		app.handleBugReportSend(rec, req)
		return rec
	}
	if rec := post(url.Values{"project": {"nope"}, "mode": {"send"}}); rec.Code != 400 {
		t.Errorf("an unknown project must be refused, got %d", rec.Code)
	}
	rec := post(url.Values{"project": {uuidA}, "note": {"My note"}, "mode": {"send"}})
	m := regexp.MustCompile(`/bug-report/status/(r\d+)`).FindStringSubmatch(rec.Body.String())
	if rec.Code != 200 || m == nil {
		t.Fatalf("send: %d %s", rec.Code, rec.Body.String())
	}
	// The polling box must target itself: it sits inside the form, and htmx
	// would otherwise inherit the form's hx-target and stop updating.
	if !regexp.MustCompile(`<div hx-target="this" hx-get="/bug-report/status/`).MatchString(rec.Body.String()) {
		t.Errorf("the status poll must carry hx-target=\"this\": %s", rec.Body.String())
	}
	// A second report while the first runs is refused.
	if rec2 := post(url.Values{"project": {uuidA}, "mode": {"send"}}); rec2.Code != 409 {
		t.Errorf("a concurrent send must be refused, got %d", rec2.Code)
	}
	var j reportJob
	for i := 0; i < 200; i++ {
		j, _ = reportJobs.get(m[1])
		if j.Terminal() {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if j.State != "done" || j.DriveID != "d1" {
		t.Fatalf("the report did not send: %+v", j)
	}
	if !regexp.MustCompile(`^dbx-report_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_0\.0\.11_my-note\.zip$`).MatchString(j.Name) {
		t.Errorf("report name: %s", j.Name)
	}
	st := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/bug-report/status/"+m[1], nil)
	req.SetPathValue("id", m[1])
	app.handleBugReportStatus(st, req)
	if !strings.Contains(st.Body.String(), "Sent") {
		t.Errorf("the status says: %s", st.Body.String())
	}
	// The zip stays on the device and downloads.
	dl := httptest.NewRecorder()
	dreq := httptest.NewRequest("GET", "/bug-report/download/"+j.Name, nil)
	dreq.SetPathValue("name", j.Name)
	app.handleBugReportDownload(dl, dreq)
	if dl.Code != 200 || !bytes.HasPrefix(dl.Body.Bytes(), []byte("PK")) {
		t.Errorf("download: %d", dl.Code)
	}
	bad := httptest.NewRecorder()
	breq := httptest.NewRequest("GET", "/bug-report/download/x", nil)
	breq.SetPathValue("name", "../sa-build.json")
	app.handleBugReportDownload(bad, breq)
	if bad.Code != 404 {
		t.Errorf("a download outside the reports must 404, got %d", bad.Code)
	}

	// A failed upload keeps the zip and offers it.
	writeFile(t, filepath.Join(b, bugReportConfigFile), []byte(`{"upload_url":"http://127.0.0.1:1/exec"}`))
	rec = post(url.Values{"project": {"none"}, "note": {"second"}, "mode": {"send"}})
	m = regexp.MustCompile(`/bug-report/status/(r\d+)`).FindStringSubmatch(rec.Body.String())
	if m == nil {
		t.Fatalf("second send: %s", rec.Body.String())
	}
	for i := 0; i < 200; i++ {
		j, _ = reportJobs.get(m[1])
		if j.Terminal() {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if j.State != "failed" || !j.HasZip {
		t.Fatalf("a failed upload: %+v", j)
	}
	st = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/bug-report/status/"+m[1], nil)
	req.SetPathValue("id", m[1])
	app.handleBugReportStatus(st, req)
	if !strings.Contains(st.Body.String(), "Download the report") {
		t.Errorf("a failed upload must offer the download: %s", st.Body.String())
	}
}
