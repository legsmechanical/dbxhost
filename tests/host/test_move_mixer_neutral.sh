#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Every Move instrument must sit at unity, unmuted and unsoloed IN THE SET.
#
# All Move track mixing is done by the session's FX buses. A mute or a trim in
# the set is therefore invisible on the surface the user is actually mixing on:
# the bus fader moves and nothing happens, because the instrument is being
# silenced underneath it. This is not a preference — a set-level mute is a
# control with no visible owner.
#
# The bug that produced this rule: the donor fixture the template is generated
# from was captured with track 2 muted (`speakerOn: false`), and "patch the
# template minimally" carried that mute into every project born from it, and
# into every copy of those.

fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1" >&2; fail=1; }

# --- 1. the template the projects are born from ----------------------------
tmpl=$(mktemp -d)/Song.abl
python3 standalone/scripts/make-template.py "$tmpl" >/dev/null
python3 - "$tmpl" <<'PY' || fail=1
import json, sys
song = json.load(open(sys.argv[1]))
bad = []
for i, t in enumerate(song.get("tracks", [])[:4]):
    m = t.get("mixer", {})
    if m.get("speakerOn") is not True: bad.append("track %d muted" % (i + 1))
    if m.get("solo-cue") is not False: bad.append("track %d soloed" % (i + 1))
    if m.get("volume") != 0.0:         bad.append("track %d volume %r" % (i + 1, m.get("volume")))
if bad:
    print("  FAIL — generated template violates the invariant: " + ", ".join(bad))
    sys.exit(1)
print("  ok   — the generated template is unity/unmuted/unsoloed on all 4 tracks")
PY

# --- 2. the normalizer, against a library that violates it ------------------
lib=$(mktemp -d)
trap 'rm -rf "$lib"' EXIT
uuid=aaaaaaaa-1111-2222-3333-444444444444
mkdir -p "$lib/$uuid/My Project" "$lib/$uuid/dAVEBOx"
# A project as the bug produced it: one muted track, one soloed, one trimmed.
python3 - "$lib/$uuid/My Project/Song.abl" <<'PY'
import json, sys
song = {"tracks": [
    {"mixer": {"pan": 0.0, "solo-cue": False, "speakerOn": False, "volume": 0.0,  "sends": []}},
    {"mixer": {"pan": 0.3, "solo-cue": True,  "speakerOn": True,  "volume": 0.0,  "sends": []}},
    {"mixer": {"pan": 0.0, "solo-cue": False, "speakerOn": True,  "volume": -6.0, "sends": []}},
    {"mixer": {"pan": 0.0, "solo-cue": False, "speakerOn": True,  "volume": 0.0,  "sends": []}},
]}
json.dump(song, open(sys.argv[1], "w"))
PY
# The reserved state subdir must NOT be mistaken for the set dir.
echo '{"v":36}' > "$lib/$uuid/dAVEBOx/seq8sa-state.json"

out=$(SETS_DIR="$lib" DBX_DIR="$lib/.dbx" sh standalone/scripts/project-cmd.sh normalize 2>&1)
grep -q "1 project(s), 1 normalized" <<<"$out" \
    && ok "the sweep found and fixed the project" \
    || bad "unexpected sweep output: $out"

python3 - "$lib/$uuid/My Project/Song.abl" <<'PY' || fail=1
import json, sys
song = json.load(open(sys.argv[1]))
m = [t["mixer"] for t in song["tracks"]]
assert all(x["speakerOn"] is True for x in m), "a track is still muted"
assert all(x["solo-cue"] is False for x in m), "a track is still soloed"
assert all(x["volume"] == 0.0 for x in m), "a track is still trimmed"
# Pan is a musical choice, not a level — it must survive.
assert m[1]["pan"] == 0.3, "pan was flattened; only levels are ours to reset"
print("  ok   — mute, solo and trim cleared; pan left alone")
PY

# --- 3. idempotent, and it does not rewrite a healthy file ------------------
before=$(stat -f %m "$lib/$uuid/My Project/Song.abl" 2>/dev/null || stat -c %Y "$lib/$uuid/My Project/Song.abl")
sleep 1
out=$(SETS_DIR="$lib" DBX_DIR="$lib/.dbx" sh standalone/scripts/project-cmd.sh normalize 2>&1)
after=$(stat -f %m "$lib/$uuid/My Project/Song.abl" 2>/dev/null || stat -c %Y "$lib/$uuid/My Project/Song.abl")
grep -q "1 project(s), 0 normalized" <<<"$out" \
    && ok "a healthy library reports nothing to do" \
    || bad "second pass did not report 0 normalized: $out"
[ "$before" = "$after" ] \
    && ok "and does not rewrite the file (parse-only on a healthy library)" \
    || bad "the sweep rewrote a file it did not need to — that is a write per project per launch"
[ -f "$lib/$uuid/My Project/Song.abl.tmp" ] \
    && bad "left a .tmp sibling behind" \
    || ok "no .tmp residue"

# --- 4. wired into the paths that matter -----------------------------------
pc=standalone/scripts/project-cmd.sh
for fn in do_new do_new_at do_copy; do
    body=$(awk "/^${fn}\(\)/,/^}/" "$pc")
    grep -q 'do_normalize' <<<"$body" \
        && ok "$fn normalizes what it creates" \
        || bad "$fn can produce a project with Move tracks muted"
done
grep -q 'project-cmd.sh" normalize' standalone/scripts/launch.sh \
    && ok "session entry sweeps the whole library" \
    || bad "nothing repairs projects that predate the rule"
# The sweep must run while Move is NOT running, or its own save clobbers ours.
awk '/set-swap.sh" enter/,/project-cmd.sh" normalize/' standalone/scripts/launch.sh \
    | grep -q 'MoveOriginal' \
    && bad "the sweep runs after Move starts — Move would overwrite it on exit" \
    || ok "the sweep runs before Move is started"

[ $fail -eq 0 ] && echo "PASS: Move tracks are unity, unmuted and unsoloed in every project"
exit $fail
