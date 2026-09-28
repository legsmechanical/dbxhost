package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The manual writes its own cross-references as GitHub anchors ("see §16.2"
// becomes #162-key--scale). The splitter that builds the help/ directory
// rewrites those to point at the rendered headings, so the two schemes have to
// agree exactly — a drift here silently produces links that land nowhere.
func TestSlugifyMatchesManualAnchors(t *testing.T) {
	cases := map[string]string{
		"1. Overview":            "1-overview",
		"11. Automation":         "11-automation",
		"16.2 Key & Scale":       "162-key--scale",
		"10.1 NOTE FX":           "101-note-fx",
		"18. Quick Reference":    "18-quick-reference",
		"9. Clip Timing & Grid":  "9-clip-timing--grid",
		"REPEAT GROOVE":          "repeat-groove",
		"**Bold** and `code`":    "bold-and-code",
		"2. Connect & Configure": "2-connect--configure",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRenderTable(t *testing.T) {
	got := string(renderMarkdownSubset(strings.Join([]string{
		"| Control | Role |",
		"|---|---|",
		"| **Jog** | Turn to cycle banks. |",
		"| Volume | Master output level. |",
	}, "\n")))

	for _, want := range []string{
		`<div class="table-scroll"><table>`,
		"<th>Control</th>",
		"<th>Role</th>",
		"<td><strong>Jog</strong></td>",
		"<td>Master output level.</td>",
		"</table></div>",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("table render missing %q\ngot: %s", want, got)
		}
	}
	if n := strings.Count(got, "<tr>"); n != 3 {
		t.Errorf("want 3 rows (1 header + 2 body), got %d\n%s", n, got)
	}
}

// A separator line is the ONLY thing that makes a pipe row a table. Prose that
// happens to contain pipes must stay a paragraph, or a sentence about the "|"
// character silently becomes a one-cell table.
func TestPipesWithoutSeparatorStayProse(t *testing.T) {
	got := string(renderMarkdownSubset("| this is not a table\nand nor is this"))
	if strings.Contains(got, "<table") {
		t.Errorf("pipe prose became a table: %s", got)
	}
	if !strings.Contains(got, "<p>") {
		t.Errorf("pipe prose lost its paragraph: %s", got)
	}
}

func TestRenderBlockquoteHoldsBlocks(t *testing.T) {
	got := string(renderMarkdownSubset(strings.Join([]string{
		"> **Like Move.** This works as it does on Move:",
		">",
		"> - one",
		"> - two",
	}, "\n")))

	if !strings.Contains(got, "<blockquote>") || !strings.Contains(got, "</blockquote>") {
		t.Fatalf("no blockquote: %s", got)
	}
	if !strings.Contains(got, "<ul>") || strings.Count(got, "<li>") != 2 {
		t.Errorf("blockquote did not render its nested list: %s", got)
	}
	if strings.Contains(got, "&gt;") {
		t.Errorf("quote marker leaked into the output: %s", got)
	}
}

func TestRenderOrderedListAndRule(t *testing.T) {
	got := string(renderMarkdownSubset("1. first\n2. second\n\n---\n\n- bullet"))
	if !strings.Contains(got, "<ol>") || strings.Count(got, "<li>") != 3 {
		t.Errorf("ordered list wrong: %s", got)
	}
	if !strings.Contains(got, "<hr>") {
		t.Errorf("horizontal rule missing: %s", got)
	}
	if !strings.Contains(got, "<ul>") {
		t.Errorf("bullet list after the rule missing: %s", got)
	}
	// The lists must not be nested into each other by a missed close.
	if strings.Contains(got, "<ol>\n<li>first</li>\n<li>second</li>\n<li>bullet</li>") {
		t.Errorf("bullet was swallowed by the ordered list: %s", got)
	}
}

func TestHeadingCarriesAnchorID(t *testing.T) {
	got := string(renderMarkdownSubset("## 16.2 Key & Scale"))
	if !strings.Contains(got, `<h2 id="162-key--scale">`) {
		t.Errorf("heading anchor missing: %s", got)
	}
}

// The escape-first property is the whole safety story of this renderer: a doc
// is authored content, but it must never be able to inject markup.
func TestAuthoredHTMLIsEscapedEverywhere(t *testing.T) {
	src := strings.Join([]string{
		"<script>alert(1)</script>",
		"",
		"# <img src=x onerror=y>",
		"",
		"> <b>quoted</b>",
		"",
		"| <i>cell</i> | b |",
		"|---|---|",
		"| <u>body</u> | d |",
	}, "\n")
	got := string(renderMarkdownSubset(src))
	for _, bad := range []string{"<script>", "<img ", "<b>quoted", "<i>cell", "<u>body"} {
		if strings.Contains(got, bad) {
			t.Errorf("unescaped %q survived into the output: %s", bad, got)
		}
	}
	if !strings.Contains(got, "&lt;script&gt;") {
		t.Errorf("expected escaped text, got: %s", got)
	}
}

func TestFencedCodeIsVerbatim(t *testing.T) {
	got := string(renderMarkdownSubset("```\n| not | a table |\n|---|---|\n**not bold**\n```"))
	if strings.Contains(got, "<table") || strings.Contains(got, "<strong>") {
		t.Errorf("markup was interpreted inside a fence: %s", got)
	}
	if !strings.Contains(got, "<pre><code>") {
		t.Errorf("no code block: %s", got)
	}
}

func TestStripLeadingH1(t *testing.T) {
	if got := stripLeadingH1("# Title\n\nbody\n\n# Later\n"); got != "body\n\n# Later\n" {
		t.Errorf("leading H1 not stripped cleanly: %q", got)
	}
	// A doc that opens with prose must be left exactly as it is.
	src := "intro line\n\n# Title\n"
	if got := stripLeadingH1(src); got != src {
		t.Errorf("non-title opening was modified: %q", got)
	}
	// A "#" inside the first paragraph is not a heading.
	src2 := "see #11 below\n"
	if got := stripLeadingH1(src2); got != src2 {
		t.Errorf("hash in prose treated as a title: %q", got)
	}
}

// ⭐ The Help page shows the full HTML manual when the payload carries it
// (Josh, 2026-09-28), and serves the manual itself at /help/manual.html.
// Without the file: the chapter list, and the manual URL is a 404.
func TestHelpShowsTheHTMLManual(t *testing.T) {
	base := t.TempDir()
	help := filepath.Join(base, "help")
	if err := os.MkdirAll(help, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(help, "10-intro.md"), []byte("# Intro\n\nhello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	tmpl, err := loadTemplates()
	if err != nil {
		t.Fatalf("loadTemplates: %v", err)
	}
	app := &App{tmpl: tmpl, basePath: base, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	get := func(h http.HandlerFunc, url string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h(rec, httptest.NewRequest("GET", url, nil))
		return rec
	}

	// No manual yet: the chapter list, no frame, and nothing at the manual URL.
	body := get(app.handleHelp, "/help").Body.String()
	if strings.Contains(body, `class="help-manual"`) || !strings.Contains(body, "?doc=10-intro") {
		t.Errorf("without manual.html: want the chapter list and no frame\n%s", body)
	}
	if rec := get(app.handleHelpManual, "/help/manual.html"); rec.Code != http.StatusNotFound {
		t.Errorf("without manual.html: /help/manual.html = %d, want 404", rec.Code)
	}

	const doc = "<!DOCTYPE html><title>dAVEBOx SA manual</title><h1>The whole manual</h1>"
	if err := os.WriteFile(filepath.Join(help, "manual.html"), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	body = get(app.handleHelp, "/help").Body.String()
	if !strings.Contains(body, `<iframe class="help-manual" src="/help/manual.html"`) {
		t.Errorf("with manual.html: /help does not frame the manual\n%s", body)
	}
	if strings.Contains(body, "?doc=10-intro") {
		t.Errorf("with manual.html: the chapter list is still shown")
	}
	rec := get(app.handleHelpManual, "/help/manual.html")
	if rec.Code != 200 || rec.Body.String() != doc || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
		t.Errorf("/help/manual.html = %d %q (%s), want the file as HTML", rec.Code, rec.Body.String(), rec.Header().Get("Content-Type"))
	}
	// A chapter link still opens its chapter.
	if b := get(app.handleHelp, "/help?doc=10-intro").Body.String(); !strings.Contains(b, "<p>hello</p>") {
		t.Errorf("?doc= no longer renders its chapter\n%s", b)
	}
}
