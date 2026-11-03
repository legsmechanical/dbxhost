#!/usr/bin/env bash
set -euo pipefail

# A saved project template keeps a SLICER whole — its sample, chops, Tempo and
# Sync — and a project made from it gets its own copy of the sample file; an
# AUDIO track arrives empty (its samples are its clips', and a template has no
# clips). standalone/scripts/project_template.py: filter_state,
# slicer_samples, set_template, apply_template.

cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1
T="$(mktemp -d "${TMPDIR:-/tmp}/dbx-tmpl-slc.XXXXXX")"
trap 'rm -rf "$T"' EXIT

python3 - "$T" <<'PY'
import json, os, sys
sys.path.insert(0, "standalone/scripts")
import project_template as pt
root = sys.argv[1]
fails = []
def check(ok, what):
    print(("  ok   " if ok else "  FAIL ") + what)
    if not ok: fails.append(what)

# a project: its song folder and its state dir, a Slicer on t2, Audio on t5
proj = os.path.join(root, "proj")
os.makedirs(os.path.join(proj, "Move-Set-aaaaaaaa"))
json.dump({"tracks": []}, open(os.path.join(proj, "Move-Set-aaaaaaaa", "Song.abl"), "w"))
sub = os.path.join(proj, "dAVEBOx")
os.makedirs(os.path.join(sub, "samples"))
open(os.path.join(sub, "samples", "break.wav"), "wb").write(b"RIFFbreak")
open(os.path.join(sub, "samples", "loop.wav"), "wb").write(b"RIFFloop")
state = {"v": 37, "bpm": 96,
         "t2_pm": 4, "t2_slc": "p=0 dt=0 g=-3 rv=0 bpm=900 sy=1 sens=50 cond=0 lay=1 n=2|break.wav",
         "t2s0_slc": "st=0 en=0 p=0 dt=0 g=0 rv=0 pl=0 at=0 dc=0",
         "t2s1_slc": "st=22050 en=0 p=2 dt=0 g=0 rv=0 pl=1 at=0 dc=0",
         "t2c0_n": "0:3:100:24;",
         "t5_pm": 3, "t5c0_aud": "rs=0 p=0 dt=0 g=0 rv=0 nu=0 sh=0 sy=0 bpm=1200|loop.wav"}
json.dump(state, open(os.path.join(sub, "seq8sa-state.json"), "w"))
ui = os.path.join(root, "ui.json")
json.dump({"v": pt.SIDECAR_V}, open(ui, "w"))

fs = pt.filter_state(state)
check(fs["t2_slc"] == state["t2_slc"] and fs["t2s1_slc"] == state["t2s1_slc"], "the Slicer's line and its chops are kept")
check("t5c0_aud" not in fs and fs.get("t5_pm") == 3, "an Audio track is kept as Audio, empty")
check("t2c0_n" not in fs, "a Slicer's clip steps are not kept (a template has no clips)")
check(pt.slicer_samples(fs) == ["break.wav"], "the Slicer's sample is named: %r" % pt.slicer_samples(fs))
check(pt.slicer_samples({"t1_pm": 4, "t1_slc": "p=0|../evil.wav"}) == [], "a name with a path in it is never copied")

tdir = os.path.join(root, "templates")
pt.set_template(tdir, "tpl1", proj, ui, "seq8sa", "Proj")
check(os.path.isfile(os.path.join(tdir, "tpl1", "samples", "break.wav")), "the template holds the Slicer's sample")
check(not os.path.exists(os.path.join(tdir, "tpl1", "samples", "loop.wav")), "the template does not hold an Audio clip's sample")

# a new project from it: its own copy of the sample
new = os.path.join(root, "new")
os.makedirs(os.path.join(new, "Move-Set-bbbbbbbb"))
json.dump({"tracks": []}, open(os.path.join(new, "Move-Set-bbbbbbbb", "Song.abl"), "w"))
pt.apply_template(tdir, "tpl1", new, "seq8sa")
nsub = os.path.join(new, pt.ss.state_subdir(new))
ns = json.load(open(os.path.join(nsub, "seq8sa-state.json")))
check(ns.get("t2_slc") == state["t2_slc"] and ns.get("t2_pm") == 4, "the new project's state has the Slicer")
p = os.path.join(nsub, "samples", "break.wav")
check(os.path.isfile(p) and open(p, "rb").read() == b"RIFFbreak", "the new project has its own copy of the sample")
# the source can go: the copy stays
os.remove(os.path.join(tdir, "tpl1", "samples", "break.wav"))
check(os.path.isfile(p), "the copy outlives the template's file")
sys.exit(1 if fails else 0)
PY
echo "PASS: test_template_slicer_sample"
