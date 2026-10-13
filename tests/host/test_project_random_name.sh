#!/usr/bin/env bash
set -euo pipefail

# A project created without a name is born with two plain words —
# "<Adjective> <Noun>" — that no other project in the store is showing
# (project_name.py random_name; project-cmd.sh new-at with no name).

cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1   # no __pycache__ in standalone/scripts
CMD=standalone/scripts/project-cmd.sh
[ -f "$CMD" ] || { echo "FAIL: $CMD missing" >&2; exit 1; }

fails=0
py() { local d="$1"; shift; if python3 - "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }

# ---- the words -------------------------------------------------------------
py "the lists: plain capitalised words, six letters at most, none twice" <<'PY'
import re, sys
sys.path.insert(0, "standalone/scripts")
import project_name as pn
for words in (pn.ADJECTIVES, pn.NOUNS):
    assert len(words) >= 100, len(words)
    assert len(set(words)) == len(words), "a word appears twice"
    for w in words:
        assert re.fullmatch(r"[A-Z][a-z]{2,5}", w), w
assert not set(pn.ADJECTIVES) & set(pn.NOUNS), "a word is in both lists"
PY

py "a name is one adjective and one noun" <<'PY'
import sys
sys.path.insert(0, "standalone/scripts")
import project_name as pn
for _ in range(200):
    a, n = pn.random_name().split(" ")
    assert a in pn.ADJECTIVES and n in pn.NOUNS, (a, n)
PY

py "a name already showing is not given again, whatever its case" <<'PY'
import sys
sys.path.insert(0, "standalone/scripts")
import project_name as pn
class Rig:                      # hands out the first pair twice, then the last
    def __init__(self): self.n = 0
    def choice(self, seq):
        self.n += 1
        return seq[0] if self.n <= 4 else seq[-1]
first = pn.ADJECTIVES[0] + " " + pn.NOUNS[0]
assert pn.random_name((), Rig()) == first, "rig: the first draw is not the first pair"
got = pn.random_name([first.upper()], Rig())
assert got == pn.ADJECTIVES[-1] + " " + pn.NOUNS[-1], got
PY

py "every name taken: it still names the project" <<'PY'
import sys
sys.path.insert(0, "standalone/scripts")
import project_name as pn
every = [a + " " + n for a in pn.ADJECTIVES for n in pn.NOUNS]
assert pn.random_name(every) in every
PY

# ---- through project-cmd ----------------------------------------------------
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects" SETTINGS_JSON="$T/Settings.json"
mkdir -p "$PROJECTS_DIR" "$DBX_DIR/sets/template/Project 1"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"
python3 standalone/scripts/make-template.py "$DBX_DIR/sets/template/Project 1/Song.abl" >/dev/null

for k in 0 1 2 3 4 5 6 7; do
    sh "$CMD" new-at "$k" >"$T/new.log" 2>&1 || { cat "$T/new.log" >&2; echo "  FAIL new-at $k" >&2; fails=1; }
done
sh "$CMD" new-at 9 "Named By Hand" >/dev/null 2>&1 || { echo "  FAIL new-at with a name" >&2; fails=1; }

py "new-at with no name: eight projects, eight different two-word names" "$PROJECTS_DIR" <<'PY'
import os, sys
sys.path.insert(0, "standalone/scripts")
import project_name as pn
names = sorted(pn.names_in(sys.argv[1]))
assert len(os.listdir(sys.argv[1])) == 9, os.listdir(sys.argv[1])
assert "Named By Hand" in names, "a name given by the caller was not kept: %r" % names
born = [n for n in names if n != "Named By Hand"]
assert len(born) == 8, "names repeat or are missing: %r" % names
for n in born:
    a, w = n.split(" ")
    assert a in pn.ADJECTIVES and w in pn.NOUNS, n
PY

[ "$fails" = 0 ] && echo "PASS: project random name" || { echo "FAIL: project random name" >&2; exit 1; }
