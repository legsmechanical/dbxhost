package main

// The Help page is the dAVEBOx documentation shell: it lists and renders
// markdown files from <base>/help/. Content is authored later and ships with
// the install payload; until then the page shows an empty state. The renderer
// below is a deliberate markdown SUBSET (headings, paragraphs, lists, fenced
// code, links, bold/italic/inline code) — kept dependency-free so the manager
// stays a single vendored-free binary.

import (
	"fmt"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type helpDoc struct {
	Name  string // file base name without .md — the ?doc= key
	Title string // first "# " heading, else the name
}

func (app *App) helpDir() string { return filepath.Join(app.basePath, "help") }

// listHelpDocs returns the available docs sorted by file name, so authors
// control ordering with numeric prefixes (10-intro.md, 20-tracks.md) which
// are stripped from the ?doc= key's display title only via the heading.
func (app *App) listHelpDocs() []helpDoc {
	entries, err := os.ReadDir(app.helpDir())
	if err != nil {
		return nil
	}
	var docs []helpDoc
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		name := strings.TrimSuffix(e.Name(), ".md")
		title := name
		if data, err := os.ReadFile(filepath.Join(app.helpDir(), e.Name())); err == nil {
			for _, line := range strings.SplitN(string(data), "\n", 20) {
				if strings.HasPrefix(line, "# ") {
					title = strings.TrimSpace(line[2:])
					break
				}
			}
		}
		docs = append(docs, helpDoc{Name: name, Title: title})
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].Name < docs[j].Name })
	return docs
}

var helpDocNameRe = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

func (app *App) handleHelp(w http.ResponseWriter, r *http.Request) {
	docs := app.listHelpDocs()
	data := map[string]any{
		"Title":  "Help",
		"Active": "help",
		"Docs":   docs,
	}
	if doc := r.URL.Query().Get("doc"); doc != "" && helpDocNameRe.MatchString(doc) {
		raw, err := os.ReadFile(filepath.Join(app.helpDir(), doc+".md"))
		if err == nil {
			data["Doc"] = doc
			data["DocHTML"] = renderMarkdownSubset(string(raw))
			for _, d := range docs {
				if d.Name == doc {
					data["DocTitle"] = d.Title
				}
			}
		}
	}
	app.render(w, r, "help.html", data)
}

var (
	mdLinkRe   = regexp.MustCompile(`\[([^\]]+)\]\(([^)\s]+)\)`)
	mdBoldRe   = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	mdItalicRe = regexp.MustCompile(`\*([^*]+)\*`)
	mdCodeRe   = regexp.MustCompile("`([^`]+)`")
)

// mdInline escapes a line then applies inline markup. Escaping FIRST is the
// safety property: the regexes below only ever wrap already-escaped text, so
// authored HTML in a doc renders as text, never as markup.
func mdInline(s string) string {
	s = template.HTMLEscapeString(s)
	s = mdCodeRe.ReplaceAllString(s, "<code>$1</code>")
	s = mdBoldRe.ReplaceAllString(s, "<strong>$1</strong>")
	s = mdItalicRe.ReplaceAllString(s, "<em>$1</em>")
	s = mdLinkRe.ReplaceAllString(s, `<a href="$2">$1</a>`)
	return s
}

// renderMarkdownSubset converts the supported subset to HTML.
func renderMarkdownSubset(src string) template.HTML {
	var b strings.Builder
	lines := strings.Split(strings.ReplaceAll(src, "\r\n", "\n"), "\n")
	inCode, inList, inPara := false, false, false
	closePara := func() {
		if inPara {
			b.WriteString("</p>\n")
			inPara = false
		}
	}
	closeList := func() {
		if inList {
			b.WriteString("</ul>\n")
			inList = false
		}
	}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			closePara()
			closeList()
			if inCode {
				b.WriteString("</code></pre>\n")
			} else {
				b.WriteString("<pre><code>")
			}
			inCode = !inCode
			continue
		}
		if inCode {
			b.WriteString(template.HTMLEscapeString(line))
			b.WriteString("\n")
			continue
		}
		switch {
		case trimmed == "":
			closePara()
			closeList()
		case strings.HasPrefix(trimmed, "#"):
			closePara()
			closeList()
			level := 0
			for level < len(trimmed) && trimmed[level] == '#' && level < 4 {
				level++
			}
			text := strings.TrimSpace(trimmed[level:])
			fmt.Fprintf(&b, "<h%d>%s</h%d>\n", level, mdInline(text), level)
		case strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* "):
			closePara()
			if !inList {
				b.WriteString("<ul>\n")
				inList = true
			}
			fmt.Fprintf(&b, "<li>%s</li>\n", mdInline(trimmed[2:]))
		default:
			closeList()
			if !inPara {
				b.WriteString("<p>")
				inPara = true
			} else {
				b.WriteString(" ")
			}
			b.WriteString(mdInline(trimmed))
		}
	}
	closePara()
	closeList()
	if inCode {
		b.WriteString("</code></pre>\n")
	}
	return template.HTML(b.String())
}
