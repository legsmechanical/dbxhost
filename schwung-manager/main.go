package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"log"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/charlesvestal/schwung/schwung-manager/middleware"
)

// ---------------------------------------------------------------------------
// Embedded assets
// ---------------------------------------------------------------------------

//go:embed all:templates
var templatesFS embed.FS

//go:embed static/*
var staticFS embed.FS

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

// SettingsSection describes a section of settings from settings-schema.json.
type SettingsSection struct {
	ID    string         `json:"id"`
	Label string         `json:"label"`
	Items []SettingsItem `json:"items"`
}

// SettingsItem describes a single setting within a section.
//
// The core Schwung settings schema (shared/settings-schema.json) uses a
// subset of these fields (key/label/type/options/values/min/max/step).
// Per-module schemas (modules/<...>/<id>/settings-schema.json) may
// additionally declare Default, DefaultSource, Rows, Help, HelpUrl for
// richer rendering of password/textarea/string fields.
type SettingsItem struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Type    string   `json:"type"`
	Options []string `json:"options,omitempty"`
	Values  []any    `json:"values,omitempty"`
	Min     float64  `json:"min,omitempty"`
	Max     float64  `json:"max,omitempty"`
	Step    float64  `json:"step,omitempty"`
	Default any      `json:"default,omitempty"`
	// DefaultSource is a file path relative to the module's install
	// directory whose contents are used as the default value for a
	// string/textarea field when no value has been saved. Lets a module
	// ship a long default (e.g. an LLM system prompt) as a plain text
	// file rather than inlining it in JSON. Ignored for core schema.
	DefaultSource string `json:"default_source,omitempty"`
	// Rows hints the rendered row count for textarea fields.
	Rows int `json:"rows,omitempty"`
	// Help is optional prose rendered below the input (e.g. "get a free
	// API key at <url>"). Plain text; HelpUrl renders as a clickable
	// link after the Help text.
	Help    string `json:"help,omitempty"`
	HelpUrl string `json:"help_url,omitempty"`
}

// FileEntry represents a file or directory for the file browser.
type FileEntry struct {
	Name    string
	Path    string
	IsDir   bool
	Size    int64
	ModTime time.Time
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

// FileService provides safe filesystem operations.
type FileService struct {
	AllowedRoots []string
}

func (s *FileService) validate(path string) (string, error) {
	return middleware.ValidatePath(path, s.AllowedRoots)
}

// ListDir returns entries in the given directory.
func (s *FileService) ListDir(dir string) ([]FileEntry, error) {
	clean, err := s.validate(dir)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(clean)
	if err != nil {
		return nil, err
	}
	var result []FileEntry
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		result = append(result, FileEntry{
			Name:    e.Name(),
			Path:    filepath.Join(clean, e.Name()),
			IsDir:   e.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime(),
		})
	}
	// Directories first, then alphabetical.
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// findModuleDir locates the installed directory for a module by ID, searching
// the same category subdirs the RemoteUI web_ui discovery uses.
func (app *App) findModuleDir(id string) string {
	for _, cat := range moduleCategoryDirs {
		dir := filepath.Join(app.basePath, "modules", cat, id)
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return dir
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

var funcMap = template.FuncMap{
	// needsRepair: the stock self-heal/repair machinery is gone (under SA it
	// would mend the WRONG host — this install's shim is davebox-shim.so with
	// its own setuid healer). Kept as a constant so base.html needs no change.
	"needsRepair": func() bool { return false },
	"dict": func(pairs ...any) map[string]any {
		m := make(map[string]any, len(pairs)/2)
		for i := 0; i+1 < len(pairs); i += 2 {
			key, _ := pairs[i].(string)
			m[key] = pairs[i+1]
		}
		return m
	},
	"formatBytes": func(b int64) string {
		const unit = 1024
		if b < unit {
			return fmt.Sprintf("%d B", b)
		}
		div, exp := int64(unit), 0
		for n := b / unit; n >= unit; n /= unit {
			div *= unit
			exp++
		}
		return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
	},
	"formatTime": func(t time.Time) string {
		if t.IsZero() {
			return "-"
		}
		return t.Format("2006-01-02 15:04")
	},
	"categoryLabel": func(ct string) string {
		labels := map[string]string{
			"sound_generator": "Sound Generator",
			"audio_fx":        "Audio FX",
			"midi_fx":         "MIDI FX",
			"utility":         "Utility",
			"overtake":        "Overtake",
			"tool":            "Tool",
			"system":          "System",
			"featured":        "Featured",
		}
		if l, ok := labels[ct]; ok {
			return l
		}
		return ct
	},
	"versionStr": func(v string) string {
		if v == "" {
			return ""
		}
		if !strings.HasPrefix(v, "v") {
			return "v" + v
		}
		return v
	},
	"releaseURL": func(repo, version string) string {
		if repo == "" || version == "" {
			return ""
		}
		if !strings.HasPrefix(version, "v") {
			version = "v" + version
		}
		return "https://github.com/" + repo + "/releases/tag/" + version
	},
	"settingValue": func(key string, values map[string]any) any {
		if v, ok := values[key]; ok {
			return v
		}
		return ""
	},
	"settingChecked": func(key string, values map[string]any) bool {
		v, ok := values[key]
		if !ok {
			return false
		}
		switch b := v.(type) {
		case bool:
			return b
		case float64:
			return b != 0
		default:
			return false
		}
	},
	"enumOptions": func(item SettingsItem) []map[string]any {
		var result []map[string]any
		for i, opt := range item.Options {
			var val any
			if i < len(item.Values) {
				val = item.Values[i]
			} else {
				val = opt
			}
			result = append(result, map[string]any{"Label": opt, "Value": val})
		}
		return result
	},
	"settingSelected": func(optVal any, key string, values map[string]any) bool {
		cur, ok := values[key]
		if !ok {
			return false
		}
		// Compare as strings for robustness (JSON numbers are float64).
		return fmt.Sprint(optVal) == fmt.Sprint(cur)
	},
	"joinHelpLines": func(lines []string) template.HTML {
		// Join OLED-width lines into paragraphs for web display.
		// Blank lines become paragraph breaks.
		var paragraphs []string
		var current []string
		for _, line := range lines {
			if line == "" {
				if len(current) > 0 {
					paragraphs = append(paragraphs, strings.Join(current, " "))
					current = nil
				}
			} else {
				current = append(current, strings.TrimRight(line, " "))
			}
		}
		if len(current) > 0 {
			paragraphs = append(paragraphs, strings.Join(current, " "))
		}
		var sb strings.Builder
		for _, p := range paragraphs {
			sb.WriteString("<p>")
			sb.WriteString(template.HTMLEscapeString(p))
			sb.WriteString("</p>\n")
		}
		return template.HTML(sb.String())
	},
	"humanSize": func(b int64) string {
		const unit = 1024
		if b < unit {
			return fmt.Sprintf("%d B", b)
		}
		div, exp := int64(unit), 0
		for n := b / unit; n >= unit; n /= unit {
			div *= unit
			exp++
		}
		return fmt.Sprintf("%.0f %cB", float64(b)/float64(div), "KMGTPE"[exp])
	},
	"derefBool": func(b *bool) bool {
		if b == nil {
			return true
		}
		return *b
	},
}

// templateMap maps page template names to their parsed template sets.
// hostVersionString returns the trimmed contents of host/version.txt, or
// "" if the file is unreadable. Used by compat checks that need to fail
// open on dev builds where the version file may be missing.
func (app *App) hostVersionString() string {
	b, err := os.ReadFile(filepath.Join(app.basePath, "host", "version.txt"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

type templateMap map[string]*template.Template

func loadTemplates() (templateMap, error) {
	// Parse shared templates (base layout + partials).
	base, err := template.New("").Funcs(funcMap).ParseFS(templatesFS,
		"templates/base.html",
		"templates/partials/*.html",
	)
	if err != nil {
		return nil, fmt.Errorf("parsing base templates: %w", err)
	}

	// Each page template gets its own clone so "content"/"title" blocks
	// don't collide across pages.
	pages := []string{
		"templates/waiting.html",
		"templates/files.html",
		"templates/config.html",
		"templates/system.html",
		"templates/help.html",
	}

	m := make(templateMap, len(pages))
	for _, page := range pages {
		clone, err := base.Clone()
		if err != nil {
			return nil, fmt.Errorf("cloning base for %s: %w", page, err)
		}
		t, err := clone.ParseFS(templatesFS, page)
		if err != nil {
			return nil, fmt.Errorf("parsing %s: %w", page, err)
		}
		// Key by short name for convenience in render() calls.
		// ParseFS names the template by its full path within the FS,
		// so we store both the short name and the full FS path.
		short := filepath.Base(page)
		m[short] = t
	}
	return m, nil
}

// ---------------------------------------------------------------------------
// App holds shared dependencies.
// ---------------------------------------------------------------------------

type App struct {
	tmpl      templateMap
	fileSvc   *FileService
	basePath  string // the host install dir (-base), e.g. /data/UserData/dbx-host
	logger    *slog.Logger
	shm       *ShmConfig // shared memory for live config sync (nil if not on device)
	shmParams *ShmParams // shared memory for param get/set (nil if not on device)
	remoteUI  *RemoteUI  // set in main() after construction; used by the landing route
}

func (app *App) render(w http.ResponseWriter, r *http.Request, name string, data map[string]any) {
	t, ok := app.tmpl[name]
	if !ok {
		app.logger.Error("template not found", "template", name)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	// Inject CSRF token from cookie so forms work without JS.
	if cookie, err := r.Cookie("csrf_token"); err == nil {
		data["CSRFToken"] = cookie.Value
	}
	// Inject mirror enabled state for nav bar.
	if app.shm != nil {
		data["MirrorEnabled"] = app.shm.DisplayMirror()
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// ParseFS names templates by the base filename, not the full path.
	if err := t.ExecuteTemplate(w, name, data); err != nil {
		app.logger.Error("template render", "template", name, "err", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// -- Home --

// currentToolAppURL returns the integrated app URL for the running dAVEBOx
// tool, or "" while no tool (or no web_ui.html) is present.
func (app *App) currentToolAppURL() string {
	ru := app.remoteUI
	if ru == nil {
		return ""
	}
	id, known := ru.activeOvertakeToolID(0)
	if !known || id == "" {
		return ""
	}
	url := ru.findModuleWebUI(id)
	if url == "" {
		return ""
	}
	// Redirect (not inline serve) so the app's sibling assets resolve
	// against the module dir. schwungStandalone=1&tool=1 selects the
	// remote API's standalone (non-iframe) transport.
	return url + "?schwungStandalone=1&tool=1"
}

// handleHome is the landing route: the dAVEBOx app IS the page. While the
// session is still coming up, a small waiting page polls /api/tool.
func (app *App) handleHome(w http.ResponseWriter, r *http.Request) {
	if url := app.currentToolAppURL(); url != "" {
		http.Redirect(w, r, url, http.StatusFound)
		return
	}
	app.render(w, r, "waiting.html", map[string]any{
		"Title": "dAVEBOx", "Active": "davebox",
	})
}

// handleAPIModulePanel reports whether a module ships its own web panel
// (web_ui.html) and where it is served from. The Sound view uses this to
// decide between hosting the module's panel and the generated param editor.
func (app *App) handleAPIModulePanel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	resp := map[string]string{}
	if ru := app.remoteUI; ru != nil && id != "" && !strings.ContainsAny(id, "/\\.") {
		if url := ru.findModuleWebUI(id); url != "" {
			resp["url"] = url
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// handleAPITool reports the running tool for the waiting page's poll.
func (app *App) handleAPITool(w http.ResponseWriter, r *http.Request) {
	resp := map[string]string{}
	if ru := app.remoteUI; ru != nil {
		if id, known := ru.activeOvertakeToolID(0); known && id != "" {
			resp["id"] = id
			if url := app.currentToolAppURL(); url != "" {
				resp["url"] = url
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// -- Modules --

// -- API (JSON) --

// -- Module Assets --

// -- Files --

func (app *App) handleFiles(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("path")
	if dir == "" {
		dir = app.fileSvc.AllowedRoots[0]
	}
	entries, err := app.fileSvc.ListDir(dir)
	if err != nil {
		app.logger.Error("list dir", "path", dir, "err", err)
		http.Error(w, "Could not list directory: "+err.Error(), http.StatusForbidden)
		return
	}

	// Build breadcrumbs.
	type crumb struct {
		Name string
		Path string
	}
	var crumbs []crumb
	parts := strings.Split(strings.Trim(dir, "/"), "/")
	for i := range parts {
		p := "/" + strings.Join(parts[:i+1], "/")
		crumbs = append(crumbs, crumb{Name: parts[i], Path: p})
	}

	// Compute parent directory (empty if at an allowed root).
	parentDir := ""
	cleanDir := filepath.Clean(dir)
	for _, root := range app.fileSvc.AllowedRoots {
		if cleanDir != filepath.Clean(root) && strings.HasPrefix(cleanDir, filepath.Clean(root)) {
			parentDir = filepath.Dir(cleanDir)
			break
		}
	}

	data := map[string]any{
		"Title":       "Files",
		"Dir":         dir,
		"ParentDir":   parentDir,
		"Entries":     entries,
		"Breadcrumbs": crumbs,
		"Flash":       r.URL.Query().Get("flash"),
		"Active":      "files",
	}
	app.render(w, r, "files.html", data)
}

func (app *App) handleFileUpload(w http.ResponseWriter, r *http.Request) {
	// Ensure multipart is parsed for drag-drop uploads.
	if r.MultipartForm == nil {
		r.ParseMultipartForm(64 << 20)
	}
	dest := r.FormValue("path")
	if dest == "" {
		app.logger.Error("upload: missing path", "content-type", r.Header.Get("Content-Type"), "form", r.Form)
		http.Error(w, "missing destination", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		app.logger.Error("upload: missing file", "err", err, "path", dest)
		http.Error(w, "missing file field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if _, err := app.fileSvc.validate(dest); err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	target := filepath.Join(dest, header.Filename)
	out, err := os.Create(target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	n, copyErr := io.Copy(out, file)
	closeErr := out.Close()

	app.logger.Info("file uploaded",
		"target", target,
		"content_length", r.ContentLength,
		"part_size", header.Size,
		"bytes_written", n,
		"copy_err", copyErr,
		"close_err", closeErr,
		"user_agent", r.Header.Get("User-Agent"))
	// For AJAX/fetch requests, return 200 instead of redirect.
	if r.Header.Get("X-CSRF-Token") != "" {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "Uploaded %s", header.Filename)
		return
	}
	http.Redirect(w, r, "/files?path="+dest+"&flash=Uploaded+"+header.Filename, http.StatusSeeOther)
}

func (app *App) handleFileDownload(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	clean, err := app.fileSvc.validate(path)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	info, err := os.Stat(clean)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(clean)+"\"")
	http.ServeFile(w, r, clean)
}

func (app *App) handleFileMkdir(w http.ResponseWriter, r *http.Request) {
	parent := r.FormValue("path")
	name := r.FormValue("name")
	if parent == "" || name == "" {
		http.Error(w, "missing path or name", http.StatusBadRequest)
		return
	}
	target := filepath.Join(parent, name)
	if _, err := app.fileSvc.validate(target); err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if err := os.MkdirAll(target, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.logger.Info("mkdir", "path", target)
	if r.Header.Get("X-CSRF-Token") != "" {
		w.WriteHeader(http.StatusOK)
		return
	}
	http.Redirect(w, r, "/files?path="+parent+"&flash=Created+"+name, http.StatusSeeOther)
}

func (app *App) handleFileRename(w http.ResponseWriter, r *http.Request) {
	oldPath := r.FormValue("path")
	newName := r.FormValue("name")
	if oldPath == "" || newName == "" {
		http.Error(w, "missing path or name", http.StatusBadRequest)
		return
	}
	clean, err := app.fileSvc.validate(oldPath)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	newPath := filepath.Join(filepath.Dir(clean), newName)
	if _, err := app.fileSvc.validate(newPath); err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if err := os.Rename(clean, newPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.logger.Info("rename", "from", clean, "to", newPath)
	dir := filepath.Dir(clean)
	http.Redirect(w, r, "/files?path="+dir+"&flash=Renamed", http.StatusSeeOther)
}

func (app *App) handleFileDelete(w http.ResponseWriter, r *http.Request) {
	path := r.FormValue("path")
	clean, err := app.fileSvc.validate(path)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if err := os.RemoveAll(clean); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.logger.Info("delete", "path", clean)
	if r.Header.Get("X-CSRF-Token") != "" {
		w.WriteHeader(http.StatusOK)
		return
	}
	dir := filepath.Dir(clean)
	http.Redirect(w, r, "/files?path="+dir+"&flash=Deleted", http.StatusSeeOther)
}

// -- Config --

// readJSONFile reads a JSON file into a map, returning an empty map if missing or invalid.
func readJSONFile(path string) map[string]any {
	data, err := os.ReadFile(path)
	if err != nil {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return map[string]any{}
	}
	return m
}

// writeJSONFile writes a map as pretty-printed JSON to path, creating parent dirs.
func writeJSONFile(path string, m map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	pretty, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(pretty, '\n'), 0644)
}

// jsonBool extracts a bool from a map key, with a default.
func jsonBool(m map[string]any, key string, def bool) bool {
	v, ok := m[key]
	if !ok {
		return def
	}
	switch b := v.(type) {
	case bool:
		return b
	default:
		return def
	}
}

// jsonFloat extracts a float64 from a map key, with a default.
func jsonFloat(m map[string]any, key string, def float64) float64 {
	v, ok := m[key]
	if !ok {
		return def
	}
	switch f := v.(type) {
	case float64:
		return f
	default:
		return def
	}
}

// loadSettingsSchema reads and parses the settings-schema.json file.
func (app *App) loadSettingsSchema() ([]SettingsSection, error) {
	schemaPath := filepath.Join(app.basePath, "shared", "settings-schema.json")
	data, err := os.ReadFile(schemaPath)
	if err != nil {
		return nil, fmt.Errorf("reading settings schema: %w", err)
	}
	var sections []SettingsSection
	if err := json.Unmarshal(data, &sections); err != nil {
		return nil, fmt.Errorf("parsing settings schema: %w", err)
	}
	return sections, nil
}

// settingsKeyMapping maps schema keys to their config file keys.
// Keys not listed here are assumed to match 1:1 with shadow_config.json.
var settingsToShadowConfig = map[string]string{
	"overlay_knobs":          "overlay_knobs_mode",
	"screen_reader_debounce": "tts_debounce_ms",
	"resample_bridge":        "resample_bridge_mode",
	"link_audio_publish":     "link_audio_publish",
	"pad_typing":             "pad_typing",
	"text_preview":           "text_preview",
	"browser_preview":        "browser_preview",
	"filebrowser_enabled":    "filebrowser_enabled",
	"screen_reader_enabled":  "screen_reader_enabled",
	"screen_reader_engine":   "screen_reader_engine",
	"screen_reader_speed":    "screen_reader_speed",
	"screen_reader_pitch":    "screen_reader_pitch",
	"screen_reader_volume":   "screen_reader_volume",
}

// settingsToFeatures maps schema keys to features.json keys.
var settingsToFeatures = map[string]string{
	"display_mirror":         "display_mirror_enabled",
	"link_audio_routing":     "link_audio_enabled",
	"skipback_seconds":       "skipback_seconds",
	"midi_indicator_enabled": "midi_indicator_enabled",
}

func (app *App) handleConfig(w http.ResponseWriter, r *http.Request) {
	sections, err := app.loadSettingsSchema()
	if err != nil {
		app.logger.Error("failed to load settings schema", "err", err)
		http.Error(w, "Failed to load settings schema", http.StatusInternalServerError)
		return
	}

	shadowPath := filepath.Join(app.basePath, "shadow_config.json")
	featuresPath := filepath.Join(app.basePath, "config", "features.json")

	sc := readJSONFile(shadowPath)
	ft := readJSONFile(featuresPath)

	// Build merged values map using schema keys.
	values := make(map[string]any)

	// Map features.json into schema keys.
	for schemaKey, featKey := range settingsToFeatures {
		if schemaKey == "skipback_seconds" {
			// skipback_seconds (number) — fall back to 30 if missing/invalid
			if v, ok := ft[featKey]; ok {
				if n, ok2 := v.(float64); ok2 {
					values[schemaKey] = n
				} else {
					values[schemaKey] = float64(30)
				}
			} else {
				values[schemaKey] = float64(30)
			}
		} else if schemaKey == "link_audio_routing" {
			// link_audio_enabled -> link_audio_routing (bool)
			values[schemaKey] = jsonBool(ft, featKey, false)
		} else {
			values[schemaKey] = jsonBool(ft, featKey, false)
		}
	}

	// Map shadow_config.json into schema keys.
	for schemaKey, scKey := range settingsToShadowConfig {
		if v, ok := sc[scKey]; ok {
			values[schemaKey] = v
		}
	}

	data := map[string]any{
		"Title":    "Settings",
		"Flash":    r.URL.Query().Get("flash"),
		"Active":   "config",
		"Sections": sections,
		"Values":   values,
	}
	app.render(w, r, "config.html", data)
}

func (app *App) handleConfigValues(w http.ResponseWriter, r *http.Request) {
	sections, _ := app.loadSettingsSchema()
	shadowConfig := readJSONFile(filepath.Join(app.basePath, "shadow_config.json"))
	features := readJSONFile(filepath.Join(app.basePath, "config", "features.json"))

	values := make(map[string]any)
	for _, section := range sections {
		for _, item := range section.Items {
			configKey := item.Key
			if mapped, ok := settingsToShadowConfig[item.Key]; ok {
				configKey = mapped
			}
			if v, ok := shadowConfig[configKey]; ok {
				values[item.Key] = v
			}
			if featKey, ok := settingsToFeatures[item.Key]; ok {
				if v, ok := features[featKey]; ok {
					values[item.Key] = v
				}
			}
		}
	}

	// Overlay with live values from shared memory (source of truth for device state).
	if app.shm != nil {
		values["display_mirror"] = app.shm.DisplayMirror()
		values["overlay_knobs"] = float64(app.shm.OverlayKnobsMode())
		values["screen_reader_enabled"] = app.shm.TTSEnabled()
		if app.shm.TTSEngine() == 1 {
			values["screen_reader_engine"] = "flite"
		} else {
			values["screen_reader_engine"] = "espeak"
		}
		values["screen_reader_speed"] = float64(app.shm.TTSSpeed())
		values["screen_reader_pitch"] = float64(app.shm.TTSPitch())
		values["screen_reader_volume"] = float64(app.shm.TTSVolume())
		values["screen_reader_debounce"] = float64(app.shm.TTSDebounce())
		if s := app.shm.SkipbackSeconds(); s > 0 {
			values["skipback_seconds"] = float64(s)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(values)
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func (app *App) handleConfigSetSetting(w http.ResponseWriter, r *http.Request) {
	key := r.FormValue("key")
	value := r.FormValue("value")
	if key == "" {
		http.Error(w, `{"ok":false,"error":"missing key"}`, http.StatusBadRequest)
		return
	}

	sections, err := app.loadSettingsSchema()
	if err != nil {
		app.logger.Error("failed to load settings schema for set", "err", err)
		http.Error(w, `{"ok":false,"error":"schema load error"}`, http.StatusInternalServerError)
		return
	}

	// Find the schema item for this key so we know the type.
	var item *SettingsItem
	for _, section := range sections {
		for i := range section.Items {
			if section.Items[i].Key == key {
				item = &section.Items[i]
				break
			}
		}
		if item != nil {
			break
		}
	}
	if item == nil {
		http.Error(w, `{"ok":false,"error":"unknown setting key"}`, http.StatusBadRequest)
		return
	}

	shadowPath := filepath.Join(app.basePath, "shadow_config.json")
	featuresPath := filepath.Join(app.basePath, "config", "features.json")

	if featKey, isFeat := settingsToFeatures[key]; isFeat {
		// Feature flag — read, update, write features.json.
		ft := readJSONFile(featuresPath)
		switch key {
		case "skipback_seconds":
			val, err := strconv.Atoi(value)
			if err != nil || val < 30 {
				val = 30
			}
			if val > 300 {
				val = 300
			}
			ft[featKey] = val
		default:
			ft[featKey] = value == "true"
		}
		if err := writeJSONFile(featuresPath, ft); err != nil {
			http.Error(w, `{"ok":false,"error":"write failed"}`, http.StatusInternalServerError)
			return
		}
		// Also write to shadow_config.json for live sync with shadow UI.
		sc := readJSONFile(shadowPath)
		switch item.Type {
		case "enum":
			if n, err := strconv.ParseFloat(value, 64); err == nil {
				sc[key] = n
			} else {
				sc[key] = value
			}
		case "int":
			n, _ := strconv.Atoi(value)
			sc[key] = n
		default:
			sc[key] = value == "true"
		}
		writeJSONFile(shadowPath, sc)
	} else {
		// Shadow config — read, update, write shadow_config.json.
		sc := readJSONFile(shadowPath)
		scKey := key
		if mapped, ok := settingsToShadowConfig[key]; ok {
			scKey = mapped
		}
		switch item.Type {
		case "bool":
			sc[scKey] = value == "true"
		case "enum":
			if n, err := strconv.ParseFloat(value, 64); err == nil {
				sc[scKey] = n
			} else {
				sc[scKey] = value
			}
		case "int":
			n, _ := strconv.Atoi(value)
			sc[scKey] = n
		case "float":
			f, _ := strconv.ParseFloat(value, 64)
			sc[scKey] = f
		}
		if err := writeJSONFile(shadowPath, sc); err != nil {
			http.Error(w, `{"ok":false,"error":"write failed"}`, http.StatusInternalServerError)
			return
		}

		// Sync filebrowser flag file (checked by shim-entrypoint.sh at boot).
		if key == "filebrowser_enabled" {
			flagPath := filepath.Join(app.basePath, "filebrowser_enabled")
			if value == "true" {
				os.WriteFile(flagPath, []byte("1"), 0644)
			} else {
				os.Remove(flagPath)
			}
		}
	}

	app.logger.Info("config setting updated", "key", key, "value", value)

	// Apply to shared memory for instant effect (no JS tick() involvement).
	app.applyShmSetting(key, value)

	// JSON response for AJAX callers.
	if r.Header.Get("X-CSRF-Token") != "" {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
		return
	}
	// Fallback redirect for non-AJAX.
	http.Redirect(w, r, "/config", http.StatusSeeOther)
}

// applyShmSetting writes a config setting directly to shared memory for
// instant effect. This bypasses the JS tick() path entirely, avoiding the
// SIGABRT that occurred when syncSettingsFromConfigFile() was called from tick().
func (app *App) applyShmSetting(key, value string) {
	if app.shm == nil {
		return
	}
	switch key {
	case "display_mirror":
		app.shm.SetDisplayMirror(value == "true")
	case "overlay_knobs":
		if v, err := strconv.Atoi(value); err == nil {
			app.shm.SetOverlayKnobsMode(uint8(v))
		}
	case "screen_reader_enabled":
		app.shm.SetTTSEnabled(value == "true")
	case "screen_reader_engine":
		if value == "flite" {
			app.shm.SetTTSEngine(1)
		} else {
			app.shm.SetTTSEngine(0)
		}
	case "screen_reader_speed":
		if v, err := strconv.ParseFloat(value, 32); err == nil {
			app.shm.SetTTSSpeed(float32(v))
		}
	case "screen_reader_pitch":
		if v, err := strconv.Atoi(value); err == nil {
			app.shm.SetTTSPitch(uint16(v))
		}
	case "screen_reader_volume":
		if v, err := strconv.Atoi(value); err == nil {
			app.shm.SetTTSVolume(uint8(v))
		}
	case "screen_reader_debounce":
		if v, err := strconv.Atoi(value); err == nil {
			app.shm.SetTTSDebounce(uint16(v))
		}
	case "skipback_seconds":
		if v, err := strconv.Atoi(value); err == nil {
			if v < 30 {
				v = 30
			}
			if v > 300 {
				v = 300
			}
			app.shm.SetSkipbackSeconds(uint16(v))
		}
	}
}

// -- System --

func (app *App) handleSystem(w http.ResponseWriter, r *http.Request) {
	// Read version.
	verBytes, err := os.ReadFile(filepath.Join(app.basePath, "host", "version.txt"))
	version := "unknown"
	if err == nil {
		version = strings.TrimSpace(string(verBytes))
	}

	// Disk usage via stat (simplified).
	var diskTotal, diskFree uint64
	var stat syscall.Statfs_t
	if err := syscall.Statfs(app.basePath, &stat); err == nil {
		diskTotal = stat.Blocks * uint64(stat.Bsize)
		diskFree = stat.Bavail * uint64(stat.Bsize)
	}

	data := map[string]any{
		"Title":       "System",
		"Version":     version,
		"DiskTotal":   int64(diskTotal),
		"DiskFree":    int64(diskFree),
		"DiskUsed":    int64(diskTotal - diskFree),
		"DiskPercent": 0,
		"Flash":       r.URL.Query().Get("flash"),
		"Active":      "system",
	}
	if diskTotal > 0 {
		data["DiskPercent"] = int((diskTotal - diskFree) * 100 / diskTotal)
	}
	app.render(w, r, "system.html", data)
}

func (app *App) handleSystemLogs(w http.ResponseWriter, r *http.Request) {
	logPath := filepath.Join(app.basePath, "debug.log")
	content, err := os.ReadFile(logPath)
	if err != nil {
		content = []byte("(no log file found)")
	}
	// Return last 200 lines.
	lines := strings.Split(string(content), "\n")
	if len(lines) > 200 {
		lines = lines[len(lines)-200:]
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprint(w, strings.Join(lines, "\n"))
}

// -- Help --

// -- Install --

// -- Download --

const (
	webstreamBinDir = "/data/UserData/schwung/modules/sound_generators/webstream/bin"
	downloadOutDir  = "/data/UserData/UserLibrary/Samples/Schwung/Webstream"
)

// -- Remote UI --

// handleRemoteUI survives as a redirect: the stock tab page it rendered is
// gone — the integrated app at / is the remote UI now.
func (app *App) handleRemoteUI(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/", http.StatusMovedPermanently)
}

// handleModuleWebUIAsset serves static files from a module's install directory.
// Used by custom module web UIs loaded in an iframe on the Remote UI page.
func (app *App) handleModuleWebUIAsset(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	fp := r.PathValue("filepath")

	// Validate module ID and filepath to prevent directory traversal.
	if id == "" || fp == "" ||
		strings.Contains(id, "..") || strings.Contains(id, "/") || strings.Contains(id, "\\") ||
		strings.Contains(fp, "..") {
		http.NotFound(w, r)
		return
	}

	modDir := app.findModuleDir(id)
	if modDir == "" {
		http.NotFound(w, r)
		return
	}

	fullPath := filepath.Join(modDir, fp)

	// Ensure resolved path is within the module directory.
	resolved, err := filepath.EvalSymlinks(fullPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	resolvedDir, err := filepath.EvalSymlinks(modDir)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if !strings.HasPrefix(resolved, resolvedDir+string(filepath.Separator)) && resolved != resolvedDir {
		http.NotFound(w, r)
		return
	}

	// Only serve files, not directories.
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}

	// Module web UIs are intentionally embedded in the Remote UI page's
	// same-origin iframe (see remote_ui.go / static/remote-ui.js). The global
	// SecurityHeaders middleware sets X-Frame-Options: DENY, which would block
	// that embed and leave a blank/error iframe. Relax it to SAMEORIGIN for
	// these assets only — cross-origin framing (clickjacking) is still denied.
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")

	// Module UIs change when a module is updated/reinstalled, and a stale cached
	// response would also pin stale security headers in the browser. Never cache.
	w.Header().Set("Cache-Control", "no-store")

	http.ServeFile(w, r, fullPath)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	// Move's /tmp is on the root filesystem which is nearly always full.
	// Go's multipart parser writes temp files to os.TempDir() (/tmp by default),
	// so large uploads (e.g. soundfonts) fail and surface as "invalid CSRF token".
	port := flag.Int("port", 7700, "HTTP listen port")
	roots := flag.String("roots", "/data/UserData/", "Comma-separated allowed filesystem roots")
	displayBackend := flag.String("display-backend", "127.0.0.1:7681", "Address of display server")
	baseFlag := flag.String("base", "", "Host install dir (default: probe <root>/schwung)")
	shmPrefixFlag := flag.String("shm-prefix", "", "Override the built-in SHM prefix (dev use)")
	// Deprecated flags — accepted but ignored for backwards compatibility with old entrypoints.
	flag.String("move-backend", "", "(deprecated, ignored)")
	flag.String("schwung-host", "", "(deprecated, ignored)")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	if *shmPrefixFlag != "" {
		setShmPrefix(*shmPrefixFlag)
	}
	logger.Info("shm prefix", "prefix", shmPrefix)

	allowedRoots := strings.Split(*roots, ",")
	for i := range allowedRoots {
		allowedRoots[i] = strings.TrimSpace(allowedRoots[i])
	}

	// Determine the host install base path.
	basePath := *baseFlag
	if basePath == "" {
		basePath = "/data/UserData/schwung"
		for _, r := range allowedRoots {
			candidate := filepath.Join(r, "schwung")
			if info, err := os.Stat(candidate); err == nil && info.IsDir() {
				basePath = candidate
				break
			}
		}
	}

	// Redirect temp files under the install base, which has space (never /tmp:
	// the root FS is small) and never the other install's tree.
	tmpDir := filepath.Join(basePath, ".tmp")
	if info, err := os.Stat("/data/UserData"); err == nil && info.IsDir() {
		os.RemoveAll(tmpDir) // clear stale temp files from previous runs
		os.MkdirAll(tmpDir, 0755)
		os.Setenv("TMPDIR", tmpDir)
	}

	tmpl, err := loadTemplates()
	if err != nil {
		logger.Error("failed to load templates", "err", err)
		os.Exit(1)
	}

	shm := OpenShmConfig()
	if shm != nil {
		logger.Info("shared memory config: connected")
	} else {
		logger.Info("shared memory config: not available (not on device)")
	}

	shmParams := OpenShmParams()
	if shmParams != nil {
		logger.Info("shared memory params: connected")
	} else {
		logger.Info("shared memory params: not available (not on device)")
	}

	webSetRing := OpenShmWebParamSetRing()
	if webSetRing != nil {
		logger.Info("web param set ring: connected")
	} else {
		logger.Info("web param set ring: not available (not on device)")
	}

	app := &App{
		tmpl:      tmpl,
		fileSvc:   &FileService{AllowedRoots: allowedRoots},
		basePath:  basePath,
		logger:    logger,
		shm:       shm,
		shmParams: shmParams,
	}

	mux := http.NewServeMux()

	// Static files.
	staticSub, _ := fs.Sub(staticFS, "static")
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticSub))))

	// Home.
	mux.HandleFunc("GET /{$}", app.handleHome)

	// Modules.

	// Module assets.

	// API (JSON).

	// Files.
	mux.HandleFunc("GET /files", app.handleFiles)
	mux.HandleFunc("POST /files/upload", app.handleFileUpload)
	mux.HandleFunc("GET /files/download", app.handleFileDownload)
	mux.HandleFunc("POST /files/mkdir", app.handleFileMkdir)
	mux.HandleFunc("POST /files/rename", app.handleFileRename)
	mux.HandleFunc("POST /files/delete", app.handleFileDelete)

	// Config.
	mux.HandleFunc("GET /config", app.handleConfig)
	mux.HandleFunc("GET /config/values", app.handleConfigValues)
	mux.HandleFunc("POST /config/set", app.handleConfigSetSetting)

	// Per-module settings live inline on the module detail page
	// (/modules/{id}). These endpoints are the JSON read/write
	// API the page polls and posts to. Values and secrets are
	// stored inside the module's install directory.

	// System.
	mux.HandleFunc("GET /system", app.handleSystem)
	mux.HandleFunc("GET /system/logs", app.handleSystemLogs)

	// Help.
	mux.HandleFunc("GET /help", app.handleHelp)

	// Remote UI.
	mux.HandleFunc("GET /remote-ui", app.handleRemoteUI)

	// Install.

	// Download.

	// Graceful shutdown context — created early so RemoteUI can use it.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Remote UI WebSocket (shmParams may be nil — lazy connect when Move starts).
	remoteUI := NewRemoteUI(shmParams, webSetRing, app.basePath, logger)
	remoteUI.Start(ctx)
	app.remoteUI = remoteUI // landing route asks it for the running tool
	mux.Handle("GET /ws/remote-ui", remoteUI)
	mux.HandleFunc("GET /api/tool", app.handleAPITool)
	mux.HandleFunc("GET /api/module-panel/{id}", app.handleAPIModulePanel)

	// Module web UI assets (custom web_ui.html and related files).
	mux.HandleFunc("GET /api/remote-ui/module-assets/{id}/{filepath...}", app.handleModuleWebUIAsset)

	// Display server proxy (/mirror and /stream-auto).
	displayProxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = "http"
			req.URL.Host = *displayBackend
			if strings.HasPrefix(req.URL.Path, "/mirror") {
				req.URL.Path = strings.TrimPrefix(req.URL.Path, "/mirror")
				if req.URL.Path == "" {
					req.URL.Path = "/"
				}
			}
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			logger.Error("display proxy error", "err", err, "path", r.URL.Path)
			http.Error(w, "Display server unavailable", http.StatusBadGateway)
		},
	}
	// Opening the mirror turns the shim's display-mirror flag on in SHM: the
	// shim only pays for the live-frame copy while someone is watching, and
	// the shim asserts the flag ONCE at startup (from features.json), so a
	// runtime enable here sticks for the session without touching the
	// persisted setting.
	mirrorOn := func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if app.shm != nil && !app.shm.DisplayMirror() {
				app.shm.SetDisplayMirror(true)
				logger.Info("display mirror enabled (viewer opened /mirror)")
			}
			h.ServeHTTP(w, r)
		})
	}
	mux.Handle("GET /mirror", mirrorOn(displayProxy))
	mux.Handle("GET /mirror/", mirrorOn(displayProxy))
	mux.Handle("GET /stream-auto", mirrorOn(displayProxy))

	// Apply middleware.  WebSocket paths bypass CSRF (upgrades don't carry tokens).
	// SecurityHeaders runs outermost so headers are set even on responses
	// generated by inner middleware (e.g. CSRF rejections).
	var handler http.Handler = mux
	handler = middleware.PathTraversalProtection(allowedRoots)(handler)
	handler = middleware.CSRFProtectionWithExemptions(handler, []string{"/ws/"})
	handler = middleware.SecurityHeaders(handler)

	// Never bind port 80 — old entrypoints may pass -port 80 but we must not
	// interfere with stock MoveWebService.
	if *port == 80 {
		logger.Warn("port 80 requested (old entrypoint), overriding to 7700")
		*port = 7700
	}

	// Silence Go's default http.Server error logger to avoid log spam from
	// transient connection errors (broken pipes, TLS probes, etc.).
	discardLog := log.New(io.Discard, "", 0)

	addr := fmt.Sprintf(":%d", *port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
		ErrorLog:     discardLog,
	}

	go func() {
		const maxRetries = 5
		for attempt := 0; ; attempt++ {
			logger.Info("starting schwung-manager", "addr", addr)
			err := srv.ListenAndServe()
			if err == http.ErrServerClosed {
				return
			}
			if err != nil {
				if attempt >= maxRetries {
					logger.Error("server bind failed, giving up after retries", "err", err, "attempts", attempt+1)
					os.Exit(1)
				}
				logger.Error("server bind failed, retrying in 3s", "err", err, "attempt", attempt+1)
				time.Sleep(3 * time.Second)
				srv = &http.Server{
					Addr:         addr,
					Handler:      handler,
					ReadTimeout:  30 * time.Second,
					WriteTimeout: 60 * time.Second,
					IdleTimeout:  120 * time.Second,
					ErrorLog:     discardLog,
				}
				continue
			}
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "err", err)
	}
	logger.Info("stopped")
}
