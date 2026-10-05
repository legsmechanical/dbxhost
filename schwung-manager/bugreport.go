// The "Report a bug" page (test builds only).
//
// A tester types what happened, sees exactly which files will leave the
// device, and presses Send: the manager zips the logs and a project, then
// POSTs the zip to a Google Apps Script web app that files it in a Drive
// folder (tools/apps-script/dbx-bug-drop.gs, docs/BUG_REPORTS.md).
//
// The page exists only when <base>/bug-report.json does — test builds ship it,
// releases do not. {"upload_url": ""} keeps the page but makes it download-only.
//
// The plan (planReport) is the single source of truth: the page renders it and
// the zipper consumes it, so what the tester is shown is what is sent.

package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"compress/flate"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	bugReportConfigFile = "bug-report.json"
	bugReportDir        = "bug-reports"
	// Compressed cap. The upload is base64 (×4/3), and Apps Script refuses a
	// POST body past ~50 MB: 30 MB of zip is ~40 MB on the wire.
	bugReportCapBytes  = 30 << 20
	bugReportFileMax   = 8 << 20 // a single project file larger than this is skipped
	bugReportKeep      = 3       // reports kept on the device
	bugReportUploadMax = 5 * time.Minute
)

// Logs and small state files, relative to the install dir. tail > 0 sends
// only the last tail bytes (the rotated launch logs grow to a megabyte).
var bugReportLogFiles = []struct {
	rel  string
	tail int64
}{
	{"launch.log", 2 << 20},
	{"launch.log.1", 1 << 20},
	{"seq8sa.log", 0},
	{"shim_crash_bt.txt", 0},
	{"manager.log", 0},
	{"debug.log", 0},
	{"debug.log.1", 0},
	{"schwung.log", 0},
	{"sa-build.json", 0},
	{"active_set.txt", 0},
	{"intended_set.txt", 0},
	{"move_loaded_set.txt", 0},
	{"projects.json", 0},
	{"shadow_config.json", 0},
	{"shadow_chain_config.json", 0},
	{"config/features.json", 0},
}

var (
	bugReportAudioExt = map[string]bool{".wav": true, ".aif": true, ".aiff": true,
		".flac": true, ".mp3": true, ".ogg": true, ".m4a": true}
	reUUID       = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	reStateDir   = regexp.MustCompile(`^dAVEBOx(~[0-9]+)?$`)
	reReportName = regexp.MustCompile(`^dbx-report_[A-Za-z0-9._-]+\.zip$`)
	reSlugJunk   = regexp.MustCompile(`[^a-z0-9]+`)
	reVerJunk    = regexp.MustCompile(`[^A-Za-z0-9._-]+`)
)

// ---- config gate -----------------------------------------------------------

type bugReportConfig struct {
	UploadURL string `json:"upload_url"`
	Token     string `json:"token"`
}

// bugReportConfig is read on every call: cheap, and the file can appear or go
// with an install while the manager runs.
func (app *App) bugReportConfig() (bugReportConfig, bool) {
	var c bugReportConfig
	b, err := os.ReadFile(filepath.Join(app.basePath, bugReportConfigFile))
	if err != nil {
		return c, false
	}
	if err := json.Unmarshal(b, &c); err != nil {
		app.logger.Warn("bug-report.json unreadable — page shown download-only", "err", err)
		return bugReportConfig{}, true
	}
	c.UploadURL = strings.TrimSpace(c.UploadURL)
	return c, true
}

func (app *App) hasBugReport() bool { _, ok := app.bugReportConfig(); return ok }

// bugReportVersion: dAVEBOx's own build stamp, then the base version.
func (app *App) bugReportVersion() string {
	if b, err := os.ReadFile(filepath.Join(app.basePath, "sa-build.json")); err == nil {
		var v struct{ Version string `json:"version"` }
		if json.Unmarshal(b, &v) == nil && strings.TrimSpace(v.Version) != "" {
			return strings.TrimSpace(v.Version)
		}
	}
	if b, err := os.ReadFile(filepath.Join(app.basePath, "host", "version.txt")); err == nil {
		if s := strings.TrimSpace(string(b)); s != "" {
			return s
		}
	}
	return "unknown"
}

// ---- projects ----------------------------------------------------------------

type projectInfo struct {
	UUID       string
	Name       string
	StateDir   string // basename: dAVEBOx, dAVEBOx~11, ...
	SongDir    string // basename of the Move set folder, "" if none
	StateMTime time.Time
}

// listProjects returns every project folder under <base>/projects, newest save
// first. The state folder's name varies (Move suffixes it: dAVEBOx~11); when
// several match, the last in listing order wins, as state_subdir() decides.
func listProjects(base string) []projectInfo {
	root := filepath.Join(base, "projects")
	ents, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []projectInfo
	for _, e := range ents {
		if !e.IsDir() || !reUUID.MatchString(e.Name()) {
			continue
		}
		p := projectInfo{UUID: e.Name()}
		dir := filepath.Join(root, e.Name())
		kids, _ := os.ReadDir(dir)
		for _, k := range kids {
			if !k.IsDir() {
				continue
			}
			if reStateDir.MatchString(k.Name()) {
				p.StateDir = k.Name()
			} else if p.SongDir == "" {
				if _, err := os.Stat(filepath.Join(dir, k.Name(), "Song.abl")); err == nil {
					p.SongDir = k.Name()
				}
			}
		}
		if p.StateDir != "" {
			sd := filepath.Join(dir, p.StateDir)
			if b, err := os.ReadFile(filepath.Join(sd, "name.txt")); err == nil {
				p.Name = cleanProjectName(string(b))
			}
			if fi, err := os.Stat(filepath.Join(sd, "seq8sa-state.json")); err == nil {
				p.StateMTime = fi.ModTime()
			}
		}
		if p.Name == "" {
			p.Name = p.UUID[:8]
		}
		out = append(out, p)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StateMTime.After(out[j].StateMTime) })
	return out
}

// cleanProjectName mirrors standalone/scripts/project_name.py clean(), the
// one home of the project name (a Go reader cannot import it; pinned by
// tests/host/test_project_name_readers.sh): one line, trimmed.
func cleanProjectName(s string) string {
	return strings.TrimSpace(strings.Join(strings.Split(strings.ReplaceAll(s, "\r", "\n"), "\n"), " "))
}

// detectOpenProject: the library entry Move confirmed (active_set.txt line 1)
// resolves through sets/library/<id> to the project folder. projects.json's
// "current" is a cache of Move's settings and was seen stale, so it is not
// used. Fallback: the newest save. how = "active_set" | "newest" | "none".
func detectOpenProject(base string, projects []projectInfo) (string, string) {
	has := func(u string) bool {
		for _, p := range projects {
			if p.UUID == u {
				return true
			}
		}
		return false
	}
	if b, err := os.ReadFile(filepath.Join(base, "active_set.txt")); err == nil {
		id := strings.TrimSpace(strings.SplitN(string(b), "\n", 2)[0])
		if id != "" && !strings.ContainsAny(id, `/\`) {
			if tgt, err := os.Readlink(filepath.Join(base, "sets", "library", id)); err == nil {
				if u := filepath.Base(tgt); has(u) {
					return u, "active_set"
				}
			}
			if has(id) {
				return id, "active_set"
			}
		}
	}
	for _, p := range projects { // newest first
		if !p.StateMTime.IsZero() {
			return p.UUID, "newest"
		}
	}
	return "", "none"
}

// ---- plan --------------------------------------------------------------------

type reportEntry struct {
	ZipPath string
	SrcPath string
	Size    int64
	Kind    string // log | project
	Tail    int64  // >0: only the last Tail bytes
}

type reportSkip struct {
	Path   string
	Size   int64
	Reason string
}

type reportPlan struct {
	Entries  []reportEntry
	Skipped  []reportSkip
	Missing  []string
	Project  *projectInfo
	TotalEst int64 // uncompressed bytes that will be read
}

// planReport lists exactly what a report holds. p == nil: logs only.
func planReport(base string, p *projectInfo) reportPlan {
	var pl reportPlan
	for _, lf := range bugReportLogFiles {
		src := filepath.Join(base, filepath.FromSlash(lf.rel))
		fi, err := os.Stat(src)
		if err != nil || !fi.Mode().IsRegular() {
			pl.Missing = append(pl.Missing, lf.rel)
			continue
		}
		n := fi.Size()
		if lf.tail > 0 && n > lf.tail {
			n = lf.tail
		}
		pl.Entries = append(pl.Entries, reportEntry{ZipPath: "logs/" + lf.rel, SrcPath: src,
			Size: n, Kind: "log", Tail: lf.tail})
		pl.TotalEst += n
	}
	if p == nil {
		return pl
	}
	pl.Project = p
	root := filepath.Join(base, "projects", p.UUID)
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		zp := "project/" + p.UUID + "/" + filepath.ToSlash(rel)
		if d.Type()&fs.ModeSymlink != 0 || !d.Type().IsRegular() {
			pl.Skipped = append(pl.Skipped, reportSkip{zp, 0, "link"})
			return nil
		}
		fi, err := d.Info()
		if err != nil {
			return nil
		}
		if bugReportAudioExt[strings.ToLower(filepath.Ext(path))] {
			pl.Skipped = append(pl.Skipped, reportSkip{zp, fi.Size(), "audio"})
			return nil
		}
		if fi.Size() > bugReportFileMax {
			pl.Skipped = append(pl.Skipped, reportSkip{zp, fi.Size(), "too large"})
			return nil
		}
		pl.Entries = append(pl.Entries, reportEntry{ZipPath: zp, SrcPath: path, Size: fi.Size(), Kind: "project"})
		pl.TotalEst += fi.Size()
		return nil
	})
	return pl
}

// ---- zip -----------------------------------------------------------------------

type countingWriter struct {
	w io.Writer
	n int64
}

func (c *countingWriter) Write(p []byte) (int, error) {
	n, err := c.w.Write(p)
	c.n += int64(n)
	return n, err
}

type reportMeta struct {
	Note        string        `json:"note"`
	CreatedUTC  string        `json:"created_utc"`
	CreatedLoc  string        `json:"created_local"`
	Version     string        `json:"version"`
	Host        string        `json:"host"`
	OpenProject string        `json:"open_project"`
	OpenHow     string        `json:"open_how"`
	Project     *projectInfo  `json:"project,omitempty"`
	Included    []string      `json:"included"`
	Skipped     []reportSkip  `json:"skipped"`
	Missing     []string      `json:"missing"`
	Truncated   bool          `json:"truncated"`
	FreeBytes   uint64        `json:"free_bytes"`
}

// buildZip writes the plan to dst, stopping before the compressed size passes
// capBytes (meta.json says so). meta is filled with what actually went in.
func buildZip(dst string, pl reportPlan, meta *reportMeta, capBytes int64) error {
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer f.Close()
	bw := bufio.NewWriterSize(f, 64<<10)
	cw := &countingWriter{w: bw}
	zw := zip.NewWriter(cw)
	zw.RegisterCompressor(zip.Deflate, func(out io.Writer) (io.WriteCloser, error) {
		return flate.NewWriter(out, flate.BestSpeed)
	})
	buf := make([]byte, 64<<10)
	add := func(name string, r io.Reader, mod time.Time) error {
		w, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: mod})
		if err != nil {
			return err
		}
		_, err = io.CopyBuffer(w, r, buf)
		return err
	}
	if err := add("note.txt", strings.NewReader(meta.Note+"\n"), time.Now()); err != nil {
		return err
	}
	for _, e := range pl.Entries {
		if cw.n >= capBytes {
			meta.Truncated = true
			meta.Skipped = append(meta.Skipped, reportSkip{e.ZipPath, e.Size, "size cap"})
			continue
		}
		src, err := os.Open(e.SrcPath)
		if err != nil {
			meta.Missing = append(meta.Missing, e.ZipPath)
			continue
		}
		var r io.Reader = src
		var mod time.Time
		if fi, err := src.Stat(); err == nil {
			mod = fi.ModTime()
			if e.Tail > 0 && fi.Size() > e.Tail {
				_, _ = src.Seek(fi.Size()-e.Tail, io.SeekStart)
			}
		}
		if e.Tail > 0 {
			r = io.LimitReader(src, e.Tail)
		}
		err = add(e.ZipPath, r, mod)
		src.Close()
		if err != nil {
			return err
		}
		meta.Included = append(meta.Included, e.ZipPath)
		if err := zw.Flush(); err != nil {
			return err
		}
	}
	mb, _ := json.MarshalIndent(meta, "", "  ")
	if err := add("meta.json", bytes.NewReader(mb), time.Now()); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	return bw.Flush()
}

// reportName: dbx-report_<local time>_<version>_<slug of the note>.zip
func reportName(now time.Time, version, note string) string {
	slug := strings.ToLower(note)
	if len(slug) > 64 {
		slug = slug[:64]
	}
	slug = strings.Trim(reSlugJunk.ReplaceAllString(slug, "-"), "-")
	if len(slug) > 32 {
		slug = strings.Trim(slug[:32], "-")
	}
	if slug == "" {
		slug = "no-note"
	}
	ver := strings.Trim(reVerJunk.ReplaceAllString(version, "_"), "_")
	if ver == "" {
		ver = "unknown"
	}
	return fmt.Sprintf("dbx-report_%s_%s_%s.zip", now.Format("2006-01-02_15-04-05"), ver, slug)
}

// pruneReports keeps the newest `keep` report zips.
func pruneReports(dir string, keep int) {
	ents, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	var names []string
	for _, e := range ents {
		if reReportName.MatchString(e.Name()) {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names) // names start with the timestamp
	for i := 0; i+keep < len(names); i++ {
		_ = os.Remove(filepath.Join(dir, names[i]))
	}
}

// ---- upload ------------------------------------------------------------------

// uploadReport POSTs the zip, base64, as text/plain, with the metadata in the
// query. Apps Script answers a POST with 302 to script.googleusercontent.com;
// Go's client turns that into the GET the contract expects, so the default
// redirect policy is kept on purpose. Success is a JSON body with ok:true —
// a 200 carrying Google's HTML (deployment not shared with "Anyone") is not.
func uploadReport(ctx context.Context, client *http.Client, cfg bugReportConfig, zipPath, name, version, host string) (string, error) {
	fi, err := os.Stat(zipPath)
	if err != nil {
		return "", err
	}
	q := url.Values{"v": {"1"}, "name": {name}, "version": {version}, "host": {host}}
	if cfg.Token != "" {
		q.Set("token", cfg.Token)
	}
	u := cfg.UploadURL
	if strings.Contains(u, "?") {
		u += "&" + q.Encode()
	} else {
		u += "?" + q.Encode()
	}
	body := func() (io.ReadCloser, error) {
		f, err := os.Open(zipPath)
		if err != nil {
			return nil, err
		}
		pr, pw := io.Pipe()
		go func() {
			enc := base64.NewEncoder(base64.StdEncoding, pw)
			_, err := io.Copy(enc, f)
			if err == nil {
				err = enc.Close()
			}
			f.Close()
			pw.CloseWithError(err)
		}()
		return pr, nil
	}
	rc, err := body()
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", u, rc)
	if err != nil {
		rc.Close()
		return "", err
	}
	req.ContentLength = int64(base64.StdEncoding.EncodedLen(int(fi.Size())))
	req.GetBody = body
	req.Header.Set("Content-Type", "text/plain")
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload failed: %w", err)
	}
	defer resp.Body.Close()
	return parseUploadReply(resp)
}

func parseUploadReply(resp *http.Response) (string, error) {
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	var r struct {
		OK    bool   `json:"ok"`
		ID    string `json:"id"`
		Error string `json:"error"`
	}
	if resp.StatusCode != 200 || json.Unmarshal(raw, &r) != nil {
		s := strings.TrimSpace(string(raw))
		if len(s) > 200 {
			s = s[:200]
		}
		return "", fmt.Errorf("unexpected response (HTTP %d): %s", resp.StatusCode, s)
	}
	if !r.OK {
		return "", fmt.Errorf("the receiver refused the report: %s", r.Error)
	}
	return r.ID, nil
}

// pingUpload: GET the endpoint, expecting {ok:true}. Checks TLS, the clock
// and the deployment's sharing from the device itself.
func pingUpload(ctx context.Context, client *http.Client, cfg bugReportConfig) error {
	req, err := http.NewRequestWithContext(ctx, "GET", cfg.UploadURL, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, err = parseUploadReply(resp)
	return err
}

// ---- jobs --------------------------------------------------------------------

type reportJob struct {
	ID      string
	Name    string
	State   string // zipping | uploading | done | failed | saved
	Err     string
	DriveID string
	Size    int64
	HasZip  bool // the zip exists on the device (a failure before it does has none)
}

func (j reportJob) Terminal() bool { return j.State == "done" || j.State == "failed" || j.State == "saved" }

type bugJobs struct {
	mu     sync.Mutex
	jobs   map[string]*reportJob
	busy   bool
	seq    int
	client *http.Client // nil: a default client with bugReportUploadMax
}

var reportJobs = &bugJobs{jobs: map[string]*reportJob{}}

func (b *bugJobs) get(id string) (reportJob, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	j, ok := b.jobs[id]
	if !ok {
		return reportJob{}, false
	}
	return *j, true
}

func (b *bugJobs) update(id string, f func(*reportJob)) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if j, ok := b.jobs[id]; ok {
		f(j)
	}
}

func (b *bugJobs) httpClient() *http.Client {
	if b.client != nil {
		return b.client
	}
	return &http.Client{Timeout: bugReportUploadMax}
}

// startReport runs one report in the background; one at a time.
func (app *App) startReport(note string, p *projectInfo, upload bool) (string, error) {
	b := reportJobs
	b.mu.Lock()
	if b.busy {
		b.mu.Unlock()
		return "", errBusy
	}
	b.busy = true
	b.seq++
	id := fmt.Sprintf("r%d", b.seq)
	version := app.bugReportVersion()
	name := reportName(time.Now(), version, note)
	j := &reportJob{ID: id, Name: name, State: "zipping"}
	b.jobs[id] = j
	b.mu.Unlock()

	go func() {
		defer func() { b.mu.Lock(); b.busy = false; b.mu.Unlock() }()
		lowerThreadPriority() // nice the zip: the device is making music
		fail := func(msg string) { b.update(id, func(j *reportJob) { j.State, j.Err = "failed", msg }) }

		dir := filepath.Join(app.basePath, bugReportDir)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			fail("cannot create " + dir + ": " + err.Error())
			return
		}
		var st syscall.Statfs_t
		var free uint64
		if syscall.Statfs(app.basePath, &st) == nil {
			free = st.Bavail * uint64(st.Bsize)
			if free < 2*bugReportCapBytes {
				fail(fmt.Sprintf("not enough free space on the device (%d MB free)", free>>20))
				return
			}
		}
		projects := listProjects(app.basePath)
		open, how := detectOpenProject(app.basePath, projects)
		host, _ := os.Hostname()
		pl := planReport(app.basePath, p)
		now := time.Now()
		meta := &reportMeta{Note: note, CreatedUTC: now.UTC().Format(time.RFC3339),
			CreatedLoc: now.Format(time.RFC3339), Version: version, Host: host,
			OpenProject: open, OpenHow: how, Project: p,
			Skipped: append([]reportSkip(nil), pl.Skipped...), Missing: append([]string(nil), pl.Missing...),
			FreeBytes: free}
		zp := filepath.Join(dir, name)
		if err := buildZip(zp, pl, meta, bugReportCapBytes); err != nil {
			_ = os.Remove(zp)
			fail("could not build the report: " + err.Error())
			return
		}
		pruneReports(dir, bugReportKeep)
		b.update(id, func(j *reportJob) { j.HasZip = true })
		var size int64
		if fi, err := os.Stat(zp); err == nil {
			size = fi.Size()
		}
		cfg, _ := app.bugReportConfig()
		if !upload || cfg.UploadURL == "" {
			b.update(id, func(j *reportJob) { j.State, j.Size = "saved", size })
			return
		}
		b.update(id, func(j *reportJob) { j.State, j.Size = "uploading", size })
		ctx, cancel := context.WithTimeout(context.Background(), bugReportUploadMax)
		defer cancel()
		did, err := uploadReport(ctx, b.httpClient(), cfg, zp, name, version, host)
		if err != nil {
			app.logger.Warn("bug report upload failed", "name", name, "err", err)
			fail(err.Error())
			return
		}
		app.logger.Info("bug report sent", "name", name, "id", did, "bytes", size)
		b.update(id, func(j *reportJob) { j.State, j.DriveID = "done", did })
	}()
	return id, nil
}

var errBusy = errors.New("a report is already being prepared")

// ---- handlers ----------------------------------------------------------------

func (app *App) projectByUUID(u string) (*projectInfo, bool) {
	if !reUUID.MatchString(u) {
		return nil, false
	}
	for _, p := range listProjects(app.basePath) {
		if p.UUID == u {
			pp := p
			return &pp, true
		}
	}
	return nil, false
}

// projectParam: "" or "none" → no project; a known uuid → it; anything else → bad.
func (app *App) projectParam(v string) (*projectInfo, bool) {
	if v == "" || v == "none" {
		return nil, true
	}
	return app.projectByUUID(v)
}

func previousReports(dir string) []string {
	ents, _ := os.ReadDir(dir)
	var out []string
	for _, e := range ents {
		if reReportName.MatchString(e.Name()) {
			out = append(out, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(out)))
	return out
}

func (app *App) handleBugReport(w http.ResponseWriter, r *http.Request) {
	cfg, ok := app.bugReportConfig()
	if !ok {
		http.NotFound(w, r)
		return
	}
	projects := listProjects(app.basePath)
	open, how := detectOpenProject(app.basePath, projects)
	var sel *projectInfo
	for i := range projects {
		if projects[i].UUID == open {
			sel = &projects[i]
		}
	}
	app.render(w, r, "bug_report.html", map[string]any{
		"Title":     "Report a bug",
		"Active":    "system",
		"Projects":  projects,
		"OpenUUID":  open,
		"OpenHow":   how,
		"Plan":      planReport(app.basePath, sel),
		"CanUpload": cfg.UploadURL != "",
		"Version":   app.bugReportVersion(),
		"Previous":  previousReports(filepath.Join(app.basePath, bugReportDir)),
	})
}

func (app *App) handleBugReportPlan(w http.ResponseWriter, r *http.Request) {
	if !app.hasBugReport() {
		http.NotFound(w, r)
		return
	}
	p, ok := app.projectParam(r.URL.Query().Get("project"))
	if !ok {
		http.Error(w, "unknown project", http.StatusBadRequest)
		return
	}
	app.renderPartial(w, "bug_report_plan", map[string]any{"Plan": planReport(app.basePath, p)})
}

func (app *App) handleBugReportSend(w http.ResponseWriter, r *http.Request) {
	cfg, ok := app.bugReportConfig()
	if !ok {
		http.NotFound(w, r)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad form", http.StatusBadRequest)
		return
	}
	p, ok := app.projectParam(r.FormValue("project"))
	if !ok {
		http.Error(w, "unknown project", http.StatusBadRequest)
		return
	}
	note := strings.TrimSpace(r.FormValue("note"))
	if len(note) > 2000 {
		note = note[:2000]
	}
	upload := r.FormValue("mode") != "download" && cfg.UploadURL != ""
	id, err := app.startReport(note, p, upload)
	if errors.Is(err, errBusy) {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	j, _ := reportJobs.get(id)
	app.renderPartial(w, "bug_report_status", map[string]any{"Job": j})
}

func (app *App) handleBugReportStatus(w http.ResponseWriter, r *http.Request) {
	j, ok := reportJobs.get(r.PathValue("id"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	app.renderPartial(w, "bug_report_status", map[string]any{"Job": j})
}

func (app *App) handleBugReportDownload(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !app.hasBugReport() || !reReportName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	p := filepath.Join(app.basePath, bugReportDir, name)
	if _, err := os.Stat(p); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	http.ServeFile(w, r, p)
}

func (app *App) handleBugReportPing(w http.ResponseWriter, r *http.Request) {
	cfg, ok := app.bugReportConfig()
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if cfg.UploadURL == "" {
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "this build has no upload address"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := pingUpload(ctx, reportJobs.httpClient(), cfg); err != nil {
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

// renderPartial executes a {{define}} block (templates/partials/) on its own,
// for htmx swaps. Partials are parsed into every page; the bug-report page's
// set is used.
func (app *App) renderPartial(w http.ResponseWriter, name string, data map[string]any) {
	t, ok := app.tmpl["bug_report.html"]
	if !ok {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := t.ExecuteTemplate(w, name, data); err != nil {
		app.logger.Error("partial render", "partial", name, "err", err)
	}
}
