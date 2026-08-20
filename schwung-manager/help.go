package main

// The Help page is the dAVEBOx documentation shell: it lists and renders
// markdown files from <base>/help/, which the install payload generates by
// splitting the manual into one file per chapter (see the generator in the
// module's scripts/). The page shows an empty state when that directory is
// absent. The renderer below is a deliberate markdown SUBSET — headings
// (anchored), paragraphs, bullet and numbered lists, fenced code, pipe tables,
// blockquotes, horizontal rules, links, bold/italic/inline code — kept
// dependency-free so the manager stays a single vendored-free binary.
//
// ⚠ The subset is sized to the MANUAL, not to markdown: the manual leans on
// tables for every control map and quick-reference page, so a renderer without
// them turns its densest chapters into run-on prose. Widen it here rather than
// working around it in the source document.

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
			// The template prints the title as the page header, so rendering
			// the source's own leading "# Title" as well would show it twice.
			// Nothing links to that anchor — a cross-reference to a chapter's
			// top is written as the bare page — so dropping it costs nothing.
			data["DocHTML"] = renderMarkdownSubset(stripLeadingH1(string(raw)))
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

// stripLeadingH1 removes the first "# Heading" line and any blank lines that
// followed it, leaving everything else — including any later H1 — untouched.
func stripLeadingH1(src string) string {
	lines := strings.Split(strings.ReplaceAll(src, "\r\n", "\n"), "\n")
	for i, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		if !strings.HasPrefix(t, "# ") {
			return src // the doc does not open with a title; leave it alone
		}
		rest := lines[i+1:]
		for len(rest) > 0 && strings.TrimSpace(rest[0]) == "" {
			rest = rest[1:]
		}
		return strings.Join(rest, "\n")
	}
	return src
}

var (
	mdOrderedRe  = regexp.MustCompile(`^([0-9]+)[.)]\s+(.*)$`)
	slugStripRe  = regexp.MustCompile(`[^a-z0-9 -]+`)
	tableCellSep = "|"
)

// slugify reproduces the anchor GitHub derives from a heading, because the
// manual's own cross-references are written against that scheme
// ("## 16.2 Key & Scale" -> "162-key--scale"). Inline markup is unwrapped
// first so `**Bold**` does not leak asterisks into the id.
func slugify(s string) string {
	s = strings.ToLower(s)
	s = mdCodeRe.ReplaceAllString(s, "$1")
	s = mdBoldRe.ReplaceAllString(s, "$1")
	s = mdItalicRe.ReplaceAllString(s, "$1")
	s = mdLinkRe.ReplaceAllString(s, "$1")
	s = slugStripRe.ReplaceAllString(s, "")
	return strings.Trim(strings.ReplaceAll(s, " ", "-"), "-")
}

// splitTableRow splits one pipe row into trimmed cells, tolerating the
// optional leading and trailing pipes GFM allows.
func splitTableRow(line string) []string {
	t := strings.TrimSpace(line)
	t = strings.TrimPrefix(t, tableCellSep)
	t = strings.TrimSuffix(t, tableCellSep)
	cells := strings.Split(t, tableCellSep)
	for i := range cells {
		cells[i] = strings.TrimSpace(cells[i])
	}
	return cells
}

// isTableSeparator matches the |---|:--:| rule line that turns the row above
// it into a header. It is what distinguishes a table from a paragraph that
// merely happens to contain pipes.
func isTableSeparator(line string) bool {
	t := strings.TrimSpace(line)
	if !strings.Contains(t, "-") || !strings.Contains(t, tableCellSep) {
		return false
	}
	for _, r := range t {
		if r != '|' && r != '-' && r != ':' && r != ' ' {
			return false
		}
	}
	return true
}

// renderMarkdownSubset converts the supported subset to HTML.
func renderMarkdownSubset(src string) template.HTML {
	lines := strings.Split(strings.ReplaceAll(src, "\r\n", "\n"), "\n")
	return template.HTML(renderBlocks(lines))
}

// renderBlocks is the whole block grammar. It is index-driven rather than
// range-driven because two constructs need lookahead or run-collection:
// a table is only a table if the NEXT line is its separator, and a blockquote
// is gathered whole and rendered recursively so it can hold lists and tables.
func renderBlocks(lines []string) string {
	var b strings.Builder
	inCode, inList, inOrdered, inPara := false, false, false, false

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
		if inOrdered {
			b.WriteString("</ol>\n")
			inOrdered = false
		}
	}
	closeBlocks := func() {
		closePara()
		closeList()
	}

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "```") {
			closeBlocks()
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

		// A table: this row plus a separator beneath it. Consume the whole run.
		if strings.HasPrefix(trimmed, tableCellSep) && i+1 < len(lines) && isTableSeparator(lines[i+1]) {
			closeBlocks()
			header := splitTableRow(trimmed)
			// The wrapper is what keeps a wide control map from forcing the
			// whole page to scroll sideways on a phone.
			b.WriteString("<div class=\"table-scroll\"><table>\n<thead><tr>")
			for _, c := range header {
				fmt.Fprintf(&b, "<th>%s</th>", mdInline(c))
			}
			b.WriteString("</tr></thead>\n<tbody>\n")
			i += 2 // past the header and its separator
			for i < len(lines) && strings.HasPrefix(strings.TrimSpace(lines[i]), tableCellSep) {
				b.WriteString("<tr>")
				for _, c := range splitTableRow(lines[i]) {
					fmt.Fprintf(&b, "<td>%s</td>", mdInline(c))
				}
				b.WriteString("</tr>\n")
				i++
			}
			i-- // the outer loop advances
			b.WriteString("</tbody>\n</table></div>\n")
			continue
		}

		// A blockquote: gather the run, strip one marker level, recurse.
		if strings.HasPrefix(trimmed, ">") {
			closeBlocks()
			var inner []string
			for i < len(lines) {
				t := strings.TrimSpace(lines[i])
				if !strings.HasPrefix(t, ">") {
					break
				}
				inner = append(inner, strings.TrimPrefix(strings.TrimPrefix(t, ">"), " "))
				i++
			}
			i--
			b.WriteString("<blockquote>\n")
			b.WriteString(renderBlocks(inner))
			b.WriteString("</blockquote>\n")
			continue
		}

		switch {
		case trimmed == "":
			closeBlocks()
		case trimmed == "---" || trimmed == "***" || trimmed == "___":
			closeBlocks()
			b.WriteString("<hr>\n")
		case strings.HasPrefix(trimmed, "#"):
			closeBlocks()
			level := 0
			for level < len(trimmed) && trimmed[level] == '#' && level < 4 {
				level++
			}
			text := strings.TrimSpace(trimmed[level:])
			// The id is load-bearing: the manual's own "see §16.2" links land
			// on it, and the splitter rewrites them to point here.
			fmt.Fprintf(&b, "<h%d id=\"%s\">%s</h%d>\n",
				level, template.HTMLEscapeString(slugify(text)), mdInline(text), level)
		case strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* "):
			closePara()
			if inOrdered {
				b.WriteString("</ol>\n")
				inOrdered = false
			}
			if !inList {
				b.WriteString("<ul>\n")
				inList = true
			}
			fmt.Fprintf(&b, "<li>%s</li>\n", mdInline(trimmed[2:]))
		case mdOrderedRe.MatchString(trimmed):
			closePara()
			if inList {
				b.WriteString("</ul>\n")
				inList = false
			}
			if !inOrdered {
				b.WriteString("<ol>\n")
				inOrdered = true
			}
			fmt.Fprintf(&b, "<li>%s</li>\n", mdInline(mdOrderedRe.FindStringSubmatch(trimmed)[2]))
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

	closeBlocks()
	if inCode {
		b.WriteString("</code></pre>\n")
	}
	return b.String()
}
