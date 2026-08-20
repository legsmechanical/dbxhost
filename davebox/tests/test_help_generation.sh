#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# The browser Help site is GENERATED from the manual, one page per chapter, by
# scripts/gen_help.py — the install payload runs it and the manager renders the
# result at /help. Nothing about that is visible while editing the manual, so
# this pins the properties whose breakage would be silent:
#
#   - a restructured manual still splits into chapters at all;
#   - every cross-reference still resolves to a page that exists (a renamed
#     chapter changes its file name, and a link to the old one just 404s);
#   - no link into a source .md file survives — the device has no such files,
#     so those would be dead links on a page the user is reading FOR help;
#   - the draft banner never reaches a user.
#
# The last one is the nastiest: the banner tells the reader they are looking at
# an internal working draft, which is true of the repo and false of the device.

command -v python3 >/dev/null 2>&1 || { echo "SKIP: help generation (no python3)"; exit 0; }

fail=0
note() { echo "  FAIL: $*" >&2; fail=1; }

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if ! python3 scripts/gen_help.py "$OUT" >/dev/null; then
    echo "  FAIL: gen_help.py exited non-zero" >&2
    exit 1
fi

# 1. It produced a real site, not one giant page or an empty directory.
count=$(find "$OUT" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
[ "$count" -ge 15 ] || note "only $count help topics generated — the chapter split looks broken"
[ -f "$OUT/00-quick-start.md" ] || note "the quick start is missing from the help site"
[ -f "$OUT/01-about-davebox.md" ] || note "the manual's front matter is missing from the help site"

# 2. Every rewritten cross-reference points at a page that exists. This is the
#    check that survives a chapter being renamed or renumbered.
while IFS= read -r doc; do
    [ -f "$OUT/$doc.md" ] || note "cross-reference targets a missing page: $doc"
done < <(grep -rho '](/help?doc=[^)#]*' "$OUT" | sed 's#.*doc=##' | sort -u)

# 3. No link into a source file: those paths do not exist on the device.
if grep -rn '](MANUAL-SA\.md' "$OUT" >/dev/null 2>&1; then
    note "a link into MANUAL-SA.md was not rewritten — it would 404 on the device"
fi
if grep -rn '](QUICKSTART\.md' "$OUT" >/dev/null 2>&1; then
    note "a link into QUICKSTART.md was not rewritten — it would 404 on the device"
fi
# A bare in-page anchor is fine only if it resolves within the same page; the
# generator rewrites every KNOWN one, so a survivor means an unresolved slug.
if grep -rn '](#' "$OUT" >/dev/null 2>&1; then
    note "an unresolved anchor survived: $(grep -rho '](#[^)]*' "$OUT" | sort -u | tr '\n' ' ')"
fi

# 4. The draft banner must never ship.
if grep -rn 'DRAFT-BANNER\|WORKING DRAFT' "$OUT" >/dev/null 2>&1; then
    note "the draft banner reached the generated help site"
fi

# 5. The manual's own table of contents is dropped — the topic index replaces it,
#    and keeping it would show the reader two lists, one of them dead.
if grep -q '^## Contents' "$OUT/01-about-davebox.md"; then
    note "the manual's Contents section was not dropped from the help front page"
fi

# 6. Each page opens with the heading the manager uses as its title.
for f in "$OUT"/*.md; do
    head -1 "$f" | grep -q '^# ' || note "$(basename "$f") does not open with a '# ' title"
done

if [ "$fail" != "0" ]; then
    echo "help generation: FAILED" >&2
    exit 1
fi
echo "PASS: help site generates from the manual ($count topics, all links resolve)"
