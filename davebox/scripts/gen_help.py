#!/usr/bin/env python3
"""Generate the browser Help site's content from the manual.

The Help page (schwung-manager, /help) lists and renders markdown files from
<install dir>/help/. Nothing authored them, so the page shipped an empty state
while a complete 1500-line manual sat in the repo. This splits that manual into
one file per chapter and drops the result into the payload.

⚠ Derived, never authored. Editing anything in help/ is editing a build
artifact — the source of truth stays the manual, which `davebox/CLAUDE.md`
requires be updated in the same commit as any user-visible change. That is the
whole reason for generating: the Help site cannot drift from the manual because
it *is* the manual.

⚠ The DRAFT is the source, not the released MANUAL-SA.md. The payload ships the
current build, and the draft is what describes the current build; the released
manual is pinned to the last release and would document behaviour the deployed
code no longer has. At release time cut_release.sh promotes the draft into
MANUAL-SA.md in one commit, so the two agree there anyway.

Cross-references are rewritten, not dropped. The manual links to itself with
GitHub anchors ("#162-key--scale"), and the quick start links into the manual
with "MANUAL-SA.md#162-key--scale". Both become "/help?doc=<file>#<anchor>",
resolved against a map of every heading in the document — so a link is never
guessed from the shape of its slug, and one that resolves to nothing is
reported rather than silently left broken.

Usage: gen_help.py <output-dir>
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
DAVEBOX = HERE.parent

MANUAL = DAVEBOX / "docs" / "working" / "MANUAL-SA.draft.md"
QUICKSTART = DAVEBOX / "QUICKSTART.md"

# The frozen Legacy manual is not part of this payload; point at the public repo
# rather than emitting a link into a file the device does not have.
LEGACY_MANUAL_URL = (
    "https://github.com/legsmechanical/dbxhost/blob/main/davebox/MANUAL.md"
)

QUICKSTART_DOC = "00-quick-start"
INTRO_DOC = "01-about-davebox"

DRAFT_BANNER = re.compile(
    r"<!-- DRAFT-BANNER-START -->.*?<!-- DRAFT-BANNER-END -->\s*", re.S
)
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
CHAPTER = re.compile(r"^#\s+(\d+)\.\s+(.*?)\s*$")
# Matches both "](#anchor)" and "](MANUAL-SA.md#anchor)" / "](MANUAL-SA.md)".
MANUAL_LINK = re.compile(r"\]\((?:MANUAL-SA\.md)?(#[^)\s]*)?\)")
SLUG_STRIP = re.compile(r"[^a-z0-9 -]+")
INLINE_MARKUP = re.compile(r"`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*")


def slugify(text):
    """Reproduce GitHub's heading anchor. Must match slugify() in help.go —
    the renderer emits these as element ids and the links below target them."""
    text = INLINE_MARKUP.sub(lambda m: m.group(1) or m.group(2) or m.group(3), text.lower())
    text = SLUG_STRIP.sub("", text)
    return text.replace(" ", "-").strip("-")


def filename_slug(text):
    """A filename need not match an anchor, so collapse punctuation runs
    instead of preserving them: "Settings & Sets" -> "settings-sets"."""
    return re.sub(r"-{2,}", "-", slugify(text)).strip("-")


def split_chapters(body):
    """Split the manual at its "# N. Title" boundaries.

    Returns (front_matter, [(number, title, text), ...]). Fenced code is
    tracked so a "#" inside a diagram can never be mistaken for a heading.
    """
    front, chapters = [], []
    current = None
    in_code = False

    for line in body.split("\n"):
        if line.lstrip().startswith("```"):
            in_code = not in_code
        m = None if in_code else CHAPTER.match(line)
        if m:
            current = {"num": int(m.group(1)), "title": m.group(2), "lines": [line]}
            chapters.append(current)
        elif current is not None:
            current["lines"].append(line)
        else:
            front.append(line)

    return front, [(c["num"], c["title"], "\n".join(c["lines"])) for c in chapters]


def drop_contents_section(lines):
    """Remove the manual's own table of contents. The Help index IS that list,
    so keeping it would show the reader two of them, one of them dead links."""
    out, skipping = [], False
    for line in lines:
        if HEADING.match(line) and slugify(HEADING.match(line).group(2)) == "contents":
            skipping = True
            continue
        if skipping:
            # The rule after the list ends the section.
            if line.strip() == "---":
                skipping = False
            continue
        out.append(line)
    return out


def build_anchor_map(docs):
    """anchor slug -> (doc name, is that doc's own top heading).

    Built from every heading in every generated doc, so a link resolves by
    lookup rather than by parsing digits out of the slug — "#11-automation"
    (chapter 11) and "#101-note-fx" (section 10.1) are indistinguishable
    otherwise.
    """
    anchors, in_code = {}, False
    for name, text in docs:
        first = True
        for line in text.split("\n"):
            if line.lstrip().startswith("```"):
                in_code = not in_code
                continue
            if in_code:
                continue
            m = HEADING.match(line)
            if not m:
                continue
            slug = slugify(m.group(2))
            if slug and slug not in anchors:
                anchors[slug] = (name, first and len(m.group(1)) == 1)
            first = False
    return anchors


def rewrite_links(text, anchors, unresolved):
    """Point every manual cross-reference at its generated page."""

    def repl(m):
        anchor = m.group(1)
        if not anchor:  # a bare "](MANUAL-SA.md)" — the manual's front page
            return f"](/help?doc={INTRO_DOC})"
        slug = anchor[1:]
        target = anchors.get(slug)
        if target is None:
            unresolved.add(slug)
            return m.group(0)
        doc, is_doc_top = target
        # Linking to a page's own H1 is just linking to the page.
        return f"](/help?doc={doc})" if is_doc_top else f"](/help?doc={doc}{anchor})"

    text = MANUAL_LINK.sub(repl, text)
    text = text.replace("](QUICKSTART.md)", f"](/help?doc={QUICKSTART_DOC})")
    text = text.replace("](MANUAL.md)", f"]({LEGACY_MANUAL_URL})")
    text = text.replace("](`MANUAL.md`)", f"]({LEGACY_MANUAL_URL})")
    return text


def main():
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <output-dir>", file=sys.stderr)
        return 2
    out_dir = pathlib.Path(sys.argv[1])

    if not MANUAL.exists():
        print(f"gen_help: {MANUAL} not found — no help content generated", file=sys.stderr)
        return 1

    body = DRAFT_BANNER.sub("", MANUAL.read_text(encoding="utf-8"))
    front_lines, chapters = split_chapters(body)
    if not chapters:
        print("gen_help: no '# N. Title' chapters found — refusing to ship one huge page",
              file=sys.stderr)
        return 1

    docs = []
    if QUICKSTART.exists():
        docs.append((QUICKSTART_DOC, QUICKSTART.read_text(encoding="utf-8")))
    docs.append((INTRO_DOC, "\n".join(drop_contents_section(front_lines)).strip() + "\n"))
    for num, title, text in chapters:
        # +1 so the intro can hold 01 and the chapters keep the manual's own
        # numbering visible in the file name.
        docs.append((f"{num + 1:02d}-{filename_slug(title)}", text.strip() + "\n"))

    anchors = build_anchor_map(docs)
    unresolved = set()

    out_dir.mkdir(parents=True, exist_ok=True)
    # Stale chapters from an older manual must not survive a rename: the payload
    # is cleared here, and install-host.sh mirrors (rather than merges) help/ on
    # the device for the same reason.
    for old in out_dir.glob("*.md"):
        old.unlink()

    for name, text in docs:
        (out_dir / f"{name}.md").write_text(rewrite_links(text, anchors, unresolved),
                                            encoding="utf-8")

    print(f"gen_help: {len(docs)} help topics -> {out_dir}")
    if unresolved:
        # Not fatal: a broken link is worse than no link, but neither is worth
        # failing a build over. It IS worth saying out loud.
        print("gen_help: WARNING unresolved cross-references: "
              + ", ".join(sorted(unresolved)), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
