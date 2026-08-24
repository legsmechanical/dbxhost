#!/bin/sh
# tests/host/test_new_project_variety.sh — a new project is not the last one.
#
# Josh, 2026-08-24: "Move sets created for davebox do not load random instruments
# from the stock library like move native does on creation. Can we make it do
# that? (m1 = drum kit; m2 = bass; m3/m4 = polyphonic instruments)" and
# "Randomize the key and scale for newly created projects."
#
# Both are create-time, both must NEVER block creation, and both are easy to get
# subtly wrong in ways that look fine: a preset installed under the wrong URI
# loads as silence, and a key seed left behind re-randomises a project every time
# it is opened. That is what this file is aimed at.
#
# ⚠⚠ Linux only — user.song-index is an xattr and macOS python has no
# os.setxattr. Skips rather than passing vacuously; CI runs on Linux.
set -u
cd "$(dirname "$0")/../.."
fail=0
ok()  { printf '  ok   — %s\n' "$1"; }
bad() { printf '  FAIL — %s\n' "$1" >&2; fail=1; }

python3 -c 'import os,sys; sys.exit(0 if hasattr(os,"setxattr") else 1)' 2>/dev/null || {
    printf 'SKIP: test_new_project_variety.sh (no os.setxattr — not Linux)\n'; exit 0; }

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/stub"; printf '#!/bin/sh\nexit 0\n' > "$T/stub/pkill"; chmod +x "$T/stub/pkill"
PATH="$T/stub:$PATH"; export PATH

# A miniature stock library, so this does not depend on what the device ships.
# Names carry a space and an ampersand on purpose — those are the two characters
# the presetUri has to encode, and "Piano & Keys" is a real category.
mklib() {
    for c in "Drums/Hybrid" "Bass" "Pad" "Piano & Keys" "Synth Keys"; do
        mkdir -p "$T/core/Track Presets/$c"
    done
    for f in "Drums/Hybrid/A Kit" "Drums/Hybrid/B Kit" \
             "Bass/A Bass" "Bass/B Bass" \
             "Pad/A Pad" "Piano & Keys/E Piano" "Synth Keys/S Keys"; do
        printf '{"$schema":"x","kind":"instrumentRack","name":"%s","chains":[]}\n' \
            "$(basename "$f")" > "$T/core/Track Presets/$f.json"
    done
}
mktpl() {
    mkdir -p "$T/dbx/sets/template/Blank"
    cp tests/fixtures/empty_song.abl "$T/dbx/sets/template/Blank/Song.abl"
}
newproj() { # index
    rm -rf "$T/lib"; mkdir -p "$T/lib"
    SETS_DIR="$T/lib" DBX_DIR="$T/dbx" CORE_LIBRARY_DIR="$T/core" \
      ACTIVE_SET_PATH="$T/dbx/active_set.txt" \
      sh standalone/scripts/project-cmd.sh new-at "$1" "P" >/dev/null 2>&1
    find "$T/lib" -name Song.abl | head -n 1
}
names() { python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
print(" ".join(t["devices"][0]["name"] for t in d["tracks"][:4]))' "$1"; }

mklib; mktpl

# --- 1. the right FAMILY lands on the right track --------------------------
song=$(newproj 0)
[ -n "$song" ] || bad "no project was created at all"
python3 - "$song" <<'PY' && ok "kit on 1, bass on 2, two poly on 3 and 4" \
                         || bad "instrument families landed on the wrong tracks"
import json, sys
d = json.load(open(sys.argv[1]))
u = [t["devices"][0]["presetUri"] for t in d["tracks"][:4]]
assert "/Drums/" in u[0], u[0]
assert "/Bass/" in u[1], u[1]
for x in u[2:4]:
    assert "/Drums/" not in x and "/Bass/" not in x, x
sys.exit(0)
PY

# --- 2. the URI is one Move can actually resolve ---------------------------
# ⭑ The failure this catches is silent on device: a wrongly-encoded URI loads as
# an empty track, not an error. Space -> %20 and & -> %26, and the path after the
# prefix must match a real file on disk.
python3 - "$song" "$T/core" <<'PY' && ok "every presetUri encodes correctly AND resolves to a real file" \
                                    || bad "a presetUri is malformed or points at nothing"
import json, os, sys
from urllib.parse import unquote
d = json.load(open(sys.argv[1])); core = sys.argv[2]
P = "ableton:/packs/abl-core-library/"
for t in d["tracks"][:4]:
    u = t["devices"][0]["presetUri"]
    assert u.startswith(P), u
    rel = u[len(P):]
    assert " " not in rel and "&" not in rel, "unencoded character in %s" % u
    assert os.path.isfile(os.path.join(core, unquote(rel))), "no such preset: %s" % u
sys.exit(0)
PY

# --- 3. the two poly tracks differ ------------------------------------------
python3 - "$song" <<'PY' && ok "the two polyphonic tracks are different instruments" \
                         || bad "both poly tracks got the SAME instrument"
import json, sys
d = json.load(open(sys.argv[1]))
a, b = [t["devices"][0]["presetUri"] for t in d["tracks"][2:4]]
sys.exit(0 if a != b else 1)
PY

# --- 4. it actually VARIES (the whole point) --------------------------------
# ⭑ Positive control for everything above: a hardcoded pick would satisfy 1-3.
seen=""; i=0
while [ "$i" -lt 12 ]; do
    s=$(newproj 0); seen="$seen
$(names "$s")"; i=$((i+1))
done
n=$(printf '%s' "$seen" | sort -u | grep -c .)
[ "$n" -gt 1 ] && ok "12 new projects produced $n different instrument sets" \
               || bad "every new project got identical instruments — not random"

# --- 5. the key seed: written, in range, and consumed-once by contract -----
s=$(newproj 0)
seed=$(find "$T/lib" -name new-project.json | head -n 1)
[ -n "$seed" ] && ok "a new project is seeded with a key/scale note" \
               || bad "no new-project.json written — key stays A minor forever"
python3 - "$seed" <<'PY' && ok "...and the seed is inside the DSP's own clamps" \
                         || bad "seeded key/scale out of range (DSP clamps 0-11 / 0-13)"
import json, sys
j = json.load(open(sys.argv[1]))
sys.exit(0 if 0 <= j["key"] <= 11 and 0 <= j["scale"] <= 13 else 1)
PY
keys=""; i=0
while [ "$i" -lt 12 ]; do
    s=$(newproj 0); f=$(find "$T/lib" -name new-project.json | head -n 1)
    keys="$keys $(python3 -c 'import json,sys; j=json.load(open(sys.argv[1])); print("%d-%d"%(j["key"],j["scale"]))' "$f")"
    i=$((i+1))
done
nk=$(printf '%s' "$keys" | tr ' ' '\n' | sort -u | grep -c .)
[ "$nk" -gt 1 ] && ok "12 new projects produced $nk different keys" \
               || bad "every new project got the same key — not random"

# --- 6. a COPY is not a new project -----------------------------------------
# ⭑ The one that would bite silently: re-randomising on copy would change the
# sounds of a project someone deliberately duplicated.
s=$(newproj 0)
before=$(names "$s")
SETS_DIR="$T/lib" DBX_DIR="$T/dbx" CORE_LIBRARY_DIR="$T/core" \
  ACTIVE_SET_PATH="$T/dbx/active_set.txt" \
  sh standalone/scripts/project-cmd.sh copy 0 1 >/dev/null 2>&1
csong=$(find "$T/lib" -name Song.abl | grep -v "$(dirname "$s")" | head -n 1)
[ -n "$csong" ] || bad "copy produced no project"
[ "$(names "$csong")" = "$before" ] \
    && ok "a COPY keeps the original's instruments" \
    || bad "copy re-randomised the instruments — a duplicate must sound the same"

# --- 7. no stock library: creation still succeeds ---------------------------
# ⚠ The rule that matters most. A project you cannot create is far worse than a
# project that sounds like the template.
mv "$T/core" "$T/core-away"
s=$(newproj 0)
[ -n "$s" ] && ok "creation still works with NO stock library (template sounds)" \
            || bad "a missing stock library broke project creation outright"
mv "$T/core-away" "$T/core"

[ "$fail" = "0" ] && printf 'PASS: new projects vary — instruments and key\n'
exit $fail
