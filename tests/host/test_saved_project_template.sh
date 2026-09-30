#!/usr/bin/env bash
set -euo pipefail

# Saved project templates (project-cmd.sh template-set / template-clear, and
# new-at from a template; standalone/scripts/project_template.py).
#
# A template is a SEPARATE COPY of a project's setup: its settings, its
# instruments and effects, its track settings — no clips, no notes, no
# automation, every sequencer bank at its default. It must outlive its source,
# and a module the template uses that this device does not have leaves that
# slot empty and is named, never a failed New.

cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1
CMD=standalone/scripts/project-cmd.sh
fails=0
# The project a New just made: the one folder that was not there before
# (the pad index is an xattr, which the native macOS run cannot read back).
newest() { python3 - "$PROJECTS_DIR" "$1" <<'PY'
import os, sys
seen = set(open(sys.argv[2]).read().split()) if os.path.exists(sys.argv[2]) else set()
now = sorted(d for d in os.listdir(sys.argv[1]) if not d.startswith("."))
new = [d for d in now if d not in seen]
open(sys.argv[2], "w").write("\n".join(now))
assert len(new) == 1, new
print(new[0])
PY
}
check() { local d="$1"; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }
py() { local d="$1"; shift; if python3 - "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects" SETTINGS_JSON="$T/Settings.json"
export LIBRARY_DIR="$T/library"
mkdir -p "$PROJECTS_DIR" "$LIBRARY_DIR" "$DBX_DIR/sets/template/Project 1"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"
python3 standalone/scripts/make-template.py "$DBX_DIR/sets/template/Project 1/Song.abl" >/dev/null

echo "test_saved_project_template"

# ---- the source project: settings, sequences, chains, snapshots -------------
U1=11111111-aaaa-4bbb-8ccc-000000000001
P1="$PROJECTS_DIR/$U1"
mkdir -p "$P1/Move-Set-11111111" "$P1/dAVEBOx/host" "$P1/dAVEBOx/snapshots/0"
python3 - "$DBX_DIR/sets/template/Project 1/Song.abl" "$P1/Move-Set-11111111/Song.abl" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
s["tracks"][0]["clipSlots"][0]["clip"] = {"notes": [1, 2, 3], "fixture": "a clip"}
s["tracks"][1]["devices"] = [{"kind": "fixture-instrument"}]
json.dump(s, open(sys.argv[2], "w"))
PY
python3 - "$P1/dAVEBOx/seq8sa-state.json" <<'PY'
import json, sys
st = {"v": 36, "playing": 1, "t0_ac": 3, "t0_wr": 1,
      # project settings
      "key": 4, "scale": 2, "lq": 1, "bpm": 97.5, "saw": 0, "mic": 1, "metro_on": 1,
      "metro_vol": 60, "_swa": 30, "_swr": 1, "_cf": 1, "_cs": 1, "iq": 5,
      "cndt": 7,
      # track config
      "t0_ch": 9, "t0_rt": 0, "t0_pm": 1, "t0_tr": -3, "t0_tvo": 90, "t0_lp": 0,
      "t4_ch": 2, "t4_rt": 2, "t4_mt": 1,
      # banks (must NOT survive)
      "t0_tast": 3, "t0c0_nfoc": 2, "t1c0_arst": 4, "t0c0_dp0": 5,
      # sequences (must NOT survive)
      "t1c0_len": 64, "t1c0_n": "0:60:100:24;", "t1c2_n": "0:62:100:24;",
      "t0c0l2_len": 32, "t0c0_lg": "32:0:24", "pa": [1, 2], "t1c0at0": "x",
      "mute": 3, "solo": 1, "sn0_x": 1,
      # clip A's program (MIDI track 4) and a custom kit map (drum track 0)
      "t4c0_pg": 12, "t4c0_bm": 1, "t4c0_bl": 3, "t4c5_pg": 99,
      "t0c0l0_mn": 60, "t0c0l1_g": "16:0:24:61:0:0", "t0c0l2_mn": 38}
json.dump(st, open(sys.argv[1], "w"))
PY
echo 'Source Project' > "$P1/dAVEBOx/name.txt"
echo '{"key":1,"scale":1}' > "$P1/dAVEBOx/new-project.json"
echo '{"snap":1}' > "$P1/dAVEBOx/snapshots/0/davebox.json"
echo '{"v":9,"snap":1}' > "$P1/dAVEBOx/seq8sa-snap-1-state.json"
cat > "$P1/dAVEBOx/host/slot_0.json" <<'J'
{"name": "Lead", "version": 1, "chain": {"synth": {"module": "obxd", "config": {"state": "abc"}},
 "audio_fx": [{"module": "freeverb"}], "knob_mappings": [{"target": "synth"}]}}
J
cat > "$P1/dAVEBOx/host/slot_1.json" <<'J'
{"name": "Gone", "version": 1, "chain": {"synth": {"module": "notonthisdevice"}}}
J
echo '{"id": "tapedelay", "path": "/x/dsp.so"}' > "$P1/dAVEBOx/host/master_fx_0.json"
cat > "$P1/dAVEBOx/host/shadow_chain_config.json" <<'J'
{"slots": [{"name": "Lead", "channel": 1, "volume": 0.7, "muted": 1, "soloed": 1},
           {"name": "", "channel": 2, "volume": 1.0, "muted": 0, "soloed": 1}]}
J
echo '{"strips": [{"volume": 0.5, "muted": 1, "soloed": 1}]}' > "$P1/dAVEBOx/host/move_fx_meta.json"
# The module's template sidecar (ui_persistence templateSidecar writes it).
UI="$DBX_DIR/templates-incoming-ui.json"
mkdir -p "$DBX_DIR"
echo '{"v": 9, "am": [1,0,0,0,0,0,0,0], "at": 0}' > "$UI"

# ---- take it ----------------------------------------------------------------
SRC_SUM_BEFORE="$(cd "$P1" && find . -type f -exec shasum {} \; | sort | shasum)"
sh "$CMD" template-set default "$U1" "$UI" seq8sa >/dev/null
TD="$DBX_DIR/templates/default"
check "template-set: the template exists" test -f "$TD/Song.abl"
check "template-set: the source project is untouched (hash)" \
    test "$SRC_SUM_BEFORE" = "$(cd "$P1" && find . -type f -exec shasum {} \; | sort | shasum)"
py "the DSP state is the whitelist exactly (+ clip A's program and kit map on every clip)" "$TD/state.json" <<'PY'
import json, sys
st = json.load(open(sys.argv[1]))
want = {"v": 36, "key": 4, "scale": 2, "lq": 1, "bpm": 97.5, "saw": 0, "mic": 1, "metro_on": 1,
        "metro_vol": 60, "_swa": 30, "_swr": 1, "_cf": 1, "_cs": 1, "cndt": 7,
        "t0_ch": 9, "t0_rt": 0, "t0_pm": 1, "t0_tr": -3, "t0_tvo": 90, "t0_lp": 0,
        "t4_ch": 2, "t4_rt": 2, "t4_mt": 1}
for c in range(16):
    want["t4c%d_pg" % c] = 12; want["t4c%d_bm" % c] = 1; want["t4c%d_bl" % c] = 3
    want["t0c%dl0_mn" % c] = 60; want["t0c%dl1_mn" % c] = 61
assert st == want, "extra %s / missing %s / differ %s" % (
    sorted(set(st) - set(want)), sorted(set(want) - set(st)),
    sorted(k for k in st if k in want and st[k] != want[k]))
PY
py "the song keeps its instruments and loses every clip" "$TD/Song.abl" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
assert all(cs.get("clip") is None for t in s["tracks"] for cs in t.get("clipSlots") or [])
assert s["tracks"][1]["devices"] == [{"kind": "fixture-instrument"}]
PY
py "the chains come along; mute and solo are off" "$TD/host" <<'PY'
import json, os, sys
h = sys.argv[1]
assert json.load(open(os.path.join(h, "slot_0.json")))["chain"]["synth"]["module"] == "obxd"
cfg = json.load(open(os.path.join(h, "shadow_chain_config.json")))
assert [ (s["muted"], s["soloed"]) for s in cfg["slots"] ] == [(0, 0), (0, 0)], cfg
assert cfg["slots"][0]["volume"] == 0.7
m = json.load(open(os.path.join(h, "move_fx_meta.json")))
assert m["strips"][0]["muted"] == 0 and m["strips"][0]["soloed"] == 0 and m["strips"][0]["volume"] == 0.5
for n in ["slot_3.json", "send_fx_b_3.json", "move_fx_3_3.json", "master_fx_3.json"]:
    assert open(os.path.join(h, n)).read() == "{}\n", n
PY
check "the module's sidecar is the template's" python3 -c "import json,sys; assert json.load(open(sys.argv[1]))['am'][0] == 1" "$TD/ui.json"
check "no snapshots, name or new-project seed in the template" \
    test -z "$(find "$TD" -name 'snapshots' -o -name 'name.txt' -o -name 'new-project.json' -o -name '*snap*')"
py "projects.json lists the template, named after its source" "$DBX_DIR/projects.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d["templates"] == [{"id": "default", "name": "Template", "source_name": "Source Project"}], d["templates"]
PY

# ---- it outlives its source ------------------------------------------------
rm -rf "$P1"
newest "$T/seen" >/dev/null 2>&1 || true
printf 'obxd\nfreeverb\ntapedelay\n' > "$T/have.txt"
DBX_TEMPLATE=default DBX_STATE_PREFIX=seq8sa DBX_HAVE_MODULES="$T/have.txt" DBX_MISSING_OUT="$T/missing.json" \
    sh "$CMD" new-at 3 >"$T/new3.log" 2>&1 || { cat "$T/new3.log"; exit 1; }
NEWP="$(newest "$T/seen")"
N="$PROJECTS_DIR/$NEWP"
NS="$(python3 -c "import sys; sys.path.insert(0,'standalone/scripts'); import state_subdir as ss; print(ss.state_subdir(sys.argv[1]))" "$N")"
check "new from template, source deleted: the state is the template's" cmp -s "$TD/state.json" "$N/$NS/seq8sa-state.json"
check "…and the sidecar" cmp -s "$TD/ui.json" "$N/$NS/seq8sa-ui-state.json"
check "…and the chains" cmp -s "$TD/host/slot_0.json" "$N/$NS/host/slot_0.json"
check "…and the song (no clips)" cmp -s "$TD/Song.abl" "$N/$(python3 -c "import sys; sys.path.insert(0,'standalone/scripts'); import state_subdir as ss; print(ss.song_folder(sys.argv[1]))" "$N")/Song.abl"
check "no random key/instruments from New's dice" test ! -e "$N/$NS/new-project.json"
check "it is named as a new project" test "$(cat "$N/$NS/name.txt")" = "Project 4"
check "a module this device lacks: that slot starts empty" test "$(cat "$N/$NS/host/slot_1.json")" = "{}"
check "…and is named" python3 -c "import json,sys; assert json.load(open(sys.argv[1]))['missing'] == ['notonthisdevice']" "$T/missing.json"
check "…and the template itself still has it (it is the device that lacks it)" grep -q notonthisdevice "$TD/host/slot_1.json"

# ---- a template that cannot be used: a blank project, never no project ------
cp "$TD/Song.abl" "$T/song.bak"; echo 'not json' > "$TD/Song.abl"
DBX_TEMPLATE=default DBX_STATE_PREFIX=seq8sa sh "$CMD" new-at 5 >/dev/null 2>&1
NB="$(newest "$T/seen")"
check "a broken template: the project is born blank (the random-key seed is there)" \
    test -n "$(find "$PROJECTS_DIR/$NB" -name new-project.json)"
cp "$T/song.bak" "$TD/Song.abl"

# ---- another format: that half is skipped -----------------------------------
python3 -c "import json,sys; p=sys.argv[1]; d=json.load(open(p)); d['v']=37; json.dump(d,open(p,'w'))" "$TD/state.json"
DBX_TEMPLATE=default DBX_STATE_PREFIX=seq8sa sh "$CMD" new-at 6 >/dev/null
NV="$(newest "$T/seen")"
check "a template state of another version is not written (the DSP would ask to delete it)" \
    test -z "$(find "$PROJECTS_DIR/$NV" -name 'seq8sa-state.json')"
check "…while the chains still come along" test -n "$(find "$PROJECTS_DIR/$NV" -path '*host/slot_0.json')"

# ---- clear it: New is blank again -------------------------------------------
sh "$CMD" template-clear default >/dev/null
check "template-clear removes it" test ! -e "$TD"
check "…and projects.json lists none" python3 -c "import json,sys; assert json.load(open(sys.argv[1]))['templates'] == []" "$DBX_DIR/projects.json"
DBX_TEMPLATE=default DBX_STATE_PREFIX=seq8sa sh "$CMD" new-at 7 >/dev/null 2>&1
NC="$(newest "$T/seen")"
check "after a clear, New is blank again (random-key seed)" test -n "$(find "$PROJECTS_DIR/$NC" -name new-project.json)"
sh "$CMD" new-at 8 >/dev/null
N8="$(newest "$T/seen")"
check "without DBX_TEMPLATE, New is today's New" test -n "$(find "$PROJECTS_DIR/$N8" -name new-project.json)"

# ---- the formats are pinned to the writers ----------------------------------
py "STATE_V is the DSP serializer's version; SIDECAR_V is writeSidecar's" <<'PY'
import re, sys
sys.path.insert(0, "standalone/scripts")
import project_template as pt
dsp = open("davebox/dsp/seq8_state.c").read()
m = re.search(r'fprintf\(fp, "\{\\"v\\":(\d+),', dsp)
assert m and int(m.group(1)) == pt.STATE_V, (m and m.group(1), pt.STATE_V)
js = open("davebox/ui/ui_persistence.mjs").read()
m = re.search(r"JSON\.stringify\(\{\s*v: (\d+), at:", js)
assert m and int(m.group(1)) == pt.SIDECAR_V, (m and m.group(1), pt.SIDECAR_V)
PY

[ "$fails" -eq 0 ] && echo "PASS: test_saved_project_template" || echo "FAIL: test_saved_project_template"
exit "$fails"
