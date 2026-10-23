// The Projects page: download a project (or every project and template) as one
// zip, and upload one back.
//
// The work is project-cmd.sh's `export` / `import` (project_archive.py) — the
// same owner as every other project operation, so an import lands exactly as a
// copy made on the device does. This file only moves bytes: it runs the verb,
// streams the zip out, and stages an upload under the install dir (never /tmp,
// the Move's root filesystem is full) for the verb to read.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	projectXferDir      = "project-xfer"    // staging under the install dir
	projectImportMax    = int64(2200) << 20 // an upload past this is refused (the script caps unpacked size at 2 GB)
	projectXferDeadline = 10 * time.Minute
)

// projectCmdPath is where the install keeps project-cmd.sh. A var so a test can
// run the script from the source tree.
var projectCmdPath = func(base string) string { return filepath.Join(base, "scripts", "project-cmd.sh") }

// One export or import at a time: both walk the whole project store.
var projectXferMu sync.Mutex

type projectImportResult struct {
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
	Imported []struct {
		UUID string `json:"uuid"`
		Name string `json:"name"`
		Pad  int    `json:"pad"`
	} `json:"imported"`
	Skipped []struct {
		Name string `json:"name"`
		Why  string `json:"why"`
	} `json:"skipped"`
	Templates []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"templates"`
	Modules     []string `json:"modules"`
	Instruments []string `json:"instruments"`
	// Filled here: module ids the imported projects load that this Move does
	// not have. Those slots will open empty.
	NotInstalled []string `json:"not_installed"`
}

func (app *App) runProjectCmd(ctx context.Context, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "sh", append([]string{projectCmdPath(app.basePath)}, args...)...)
	cmd.Env = append(os.Environ(), "DBX_DIR="+app.basePath)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		app.logger.Warn("project-cmd failed", "args", args, "err", err, "stderr", stderr.String())
	}
	return out, err
}

func (app *App) handleProjects(w http.ResponseWriter, r *http.Request) {
	projects := listProjects(app.basePath)
	open, how := detectOpenProject(app.basePath, projects)
	if how != "active_set" {
		open = "" // a guess (the newest save) is not worth a warning
	}
	app.render(w, r, "projects.html", map[string]any{
		"Title":    "Projects",
		"Active":   "projects",
		"Projects": projects,
		"OpenUUID": open,
		"Version":  app.bugReportVersion(),
	})
}

// exportName: dAVEBOx-<project slug>-<date>.zip, or dAVEBOx-backup-<date>.zip.
func exportName(now time.Time, project string) string {
	slug := strings.Trim(reSlugJunk.ReplaceAllString(strings.ToLower(project), "-"), "-")
	if len(slug) > 40 {
		slug = slug[:40]
	}
	if slug == "" {
		slug = "backup"
	}
	return "dAVEBOx-" + slug + "-" + now.Format("2006-01-02-1504") + ".zip"
}

func (app *App) handleProjectExport(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	label := ""
	if id != "all" {
		if !reUUID.MatchString(id) {
			http.Error(w, "bad project id", http.StatusBadRequest)
			return
		}
		for _, p := range listProjects(app.basePath) {
			if p.UUID == id {
				label = p.Name
			}
		}
		if label == "" {
			http.NotFound(w, r)
			return
		}
	}
	if !projectXferMu.TryLock() {
		http.Error(w, "another export or import is running — try again in a moment", http.StatusConflict)
		return
	}
	defer projectXferMu.Unlock()

	dir := filepath.Join(app.basePath, projectXferDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	tmp := filepath.Join(dir, fmt.Sprintf("export-%d.zip", time.Now().UnixNano()))
	defer os.Remove(tmp)
	ctx, cancel := context.WithTimeout(r.Context(), projectXferDeadline)
	defer cancel()
	if _, err := app.runProjectCmd(ctx, "export", tmp, id); err != nil {
		http.Error(w, "export failed — see the manager log", http.StatusInternalServerError)
		return
	}
	f, err := os.Open(tmp)
	if err != nil {
		http.Error(w, "export failed — no archive written", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	fi, _ := f.Stat()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+exportName(time.Now(), label)+`"`)
	http.ServeContent(w, r, "", fi.ModTime(), f)
}

// installedModules: every module id under <base>/modules/<category>/<id>/ —
// what the instrument and effect pickers can load.
func installedModules(base string) map[string]bool {
	have := map[string]bool{}
	cats, _ := os.ReadDir(filepath.Join(base, "modules"))
	// Stat, not DirEntry.IsDir: the categories (and some modules) are links
	// into the stock tree, and a link's DirEntry is never a directory.
	isDir := func(p string) bool { fi, err := os.Stat(p); return err == nil && fi.IsDir() }
	for _, c := range cats {
		cdir := filepath.Join(base, "modules", c.Name())
		if !isDir(cdir) {
			continue
		}
		ids, _ := os.ReadDir(cdir)
		for _, m := range ids {
			if isDir(filepath.Join(cdir, m.Name())) {
				have[m.Name()] = true
			}
		}
	}
	return have
}

// moduleInstalled: as project_template._present, but the pack-entry prefix
// ("<generator>-<pack>", chain_host.c) is honoured only for an id the project
// loads as an INSTRUMENT — otherwise "plank-amp" would count as installed
// wherever "plank" is.
func moduleInstalled(id string, instrument bool, have map[string]bool) bool {
	if have[id] {
		return true
	}
	if instrument {
		for h := range have {
			if strings.HasPrefix(id, h+"-") {
				return true
			}
		}
	}
	return false
}

func writeImportResult(w http.ResponseWriter, status int, res projectImportResult) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(res)
}

func (app *App) handleProjectImport(w http.ResponseWriter, r *http.Request) {
	fail := func(status int, msg string) {
		writeImportResult(w, status, projectImportResult{Error: msg})
	}
	r.Body = http.MaxBytesReader(w, r.Body, projectImportMax)
	mr, err := r.MultipartReader()
	if err != nil {
		fail(http.StatusBadRequest, "expected a file upload")
		return
	}
	if !projectXferMu.TryLock() {
		fail(http.StatusConflict, "another export or import is running — try again in a moment")
		return
	}
	defer projectXferMu.Unlock()

	dir := filepath.Join(app.basePath, projectXferDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fail(http.StatusInternalServerError, err.Error())
		return
	}
	up := filepath.Join(dir, fmt.Sprintf("upload-%d.zip", time.Now().UnixNano()))
	defer os.Remove(up)
	got := false
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			fail(http.StatusBadRequest, "upload interrupted or too large (2 GB at most)")
			return
		}
		if part.FormName() != "file" {
			continue
		}
		out, err := os.Create(up)
		if err != nil {
			fail(http.StatusInternalServerError, err.Error())
			return
		}
		_, cerr := io.Copy(out, part)
		if err := out.Close(); cerr == nil {
			cerr = err
		}
		if cerr != nil {
			fail(http.StatusBadRequest, "upload interrupted or too large (2 GB at most)")
			return
		}
		got = true
		break
	}
	if !got {
		fail(http.StatusBadRequest, "no file in the upload")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), projectXferDeadline)
	defer cancel()
	out, runErr := app.runProjectCmd(ctx, "import", up)
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var res projectImportResult
	if jerr := json.Unmarshal([]byte(lines[len(lines)-1]), &res); jerr != nil {
		fail(http.StatusInternalServerError, "import failed — see the manager log")
		return
	}
	if runErr != nil || !res.OK {
		if res.Error == "" {
			res.Error = "import failed — see the manager log"
		}
		writeImportResult(w, http.StatusUnprocessableEntity, res)
		return
	}
	have := installedModules(app.basePath)
	instr := map[string]bool{}
	for _, m := range res.Instruments {
		instr[m] = true
	}
	for _, m := range res.Modules {
		if !moduleInstalled(m, instr[m], have) {
			res.NotInstalled = append(res.NotInstalled, m)
		}
	}
	app.logger.Info("projects imported", "imported", len(res.Imported), "skipped", len(res.Skipped))
	writeImportResult(w, http.StatusOK, res)
}
