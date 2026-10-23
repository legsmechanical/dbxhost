#!/usr/bin/env bash
set -euo pipefail

# project-cmd.sh export / import (project_archive.py): a project leaves as one
# zip and comes back as a NEW project — fresh id, its own song-folder name, the
# state dir after the song, never the archived pad, never over what is there.
# And an archive that is not ours, is damaged, reaches outside its folder or
# was saved by another state version is refused, with the reason.

cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1
CMD=standalone/scripts/project-cmd.sh

fails=0
ok()   { echo "  ok   $1"; }
bad()  { echo "  FAIL $1" >&2; fails=1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects" SETTINGS_JSON="$T/Settings.json" \
       LIBRARY_DIR="$T/dbx/sets/library" TEMPLATES_DIR="$T/dbx/templates"
mkdir -p "$PROJECTS_DIR" "$LIBRARY_DIR" "$TEMPLATES_DIR"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"
echo '{"version":"9.9.9-test"}' > "$DBX_DIR/sa-build.json"

mkproj() { # uuid name state-v
    local d="$PROJECTS_DIR/$1"
    mkdir -p "$d/Move-Set-${1:0:8}" "$d/dAVEBOx/host"
    python3 standalone/scripts/make-template.py "$d/Move-Set-${1:0:8}/Song.abl" >/dev/null
    printf '{"v":%s,"fixture":"%s"}\n' "$3" "$2" > "$d/dAVEBOx/seq8sa-state.json"
    echo '{"v":9}' > "$d/dAVEBOx/seq8sa-ui-state.json"
    echo '{"key":3}' > "$d/dAVEBOx/new-project.json"
    printf '%s\n' "$2" > "$d/dAVEBOx/name.txt"
    echo '{"chain":{"synth":{"module":"hatchet"},"audio_fx":[{"module":"hatchet-amp"}]}}' > "$d/dAVEBOx/host/slot_1.json"
}
U1=11111111-aaaa-4bbb-8ccc-000000000001
U2=22222222-aaaa-4bbb-8ccc-000000000002
mkproj "$U1" "Golf Buddy" 36
mkproj "$U2" "Loyal Magpie" 36
# A saved template, for Export All.
mkdir -p "$TEMPLATES_DIR/tmpl1/host"
cp "$PROJECTS_DIR/$U1/Move-Set-11111111/Song.abl" "$TEMPLATES_DIR/tmpl1/Song.abl"
echo '{"name":"Open Bench"}' > "$TEMPLATES_DIR/tmpl1/meta.json"
echo 'x' > "$TEMPLATES_DIR/.have-modules.txt"

echo "test_project_archive"

# ---- export one ----
out="$(sh "$CMD" export "$T/one.zip" "$U1")"
[ -f "$T/one.zip" ] && ok "export one: zip written" || bad "export one: no zip"
python3 - "$T/one.zip" "$U1" <<'PY' && ok "export one: manifest + only that project, seed left out" || bad "export one: archive content"
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1]); u = sys.argv[2]
names = z.namelist()
m = json.loads(z.read("manifest.json"))
assert m["kind"] == "dAVEBOx project archive" and m["format"] == 1, m
assert m["davebox_version"] == "9.9.9-test" and m["state_v"] == 36, m
assert [p["uuid"] for p in m["projects"]] == [u] and m["projects"][0]["name"] == "Golf Buddy", m
assert m["templates"] == [], "a single-project export carried the templates"
assert all(n == "manifest.json" or n.startswith("projects/" + u + "/") for n in names), names
assert "projects/%s/dAVEBOx/seq8sa-state.json" % u in names
assert "projects/%s/Move-Set-11111111/Song.abl" % u in names
assert not any(n.endswith("new-project.json") for n in names), "the one-shot new-project seed travelled"
PY
case "$out" in *'"ok": true'*) ok "export one: reports ok" ;; *) bad "export one: output $out" ;; esac

# ---- export all ----
sh "$CMD" export "$T/all.zip" all >/dev/null
python3 - "$T/all.zip" <<'PY' && ok "export all: every project and the templates" || bad "export all: archive content"
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1]); m = json.loads(z.read("manifest.json"))
assert len(m["projects"]) == 2, m["projects"]
assert m["templates"] == [{"id": "tmpl1", "name": "Open Bench"}], m["templates"]
assert "templates/tmpl1/Song.abl" in z.namelist()
assert not any(n.endswith(".have-modules.txt") for n in z.namelist())
PY
sh "$CMD" export "$T/none.zip" 99999999-aaaa-4bbb-8ccc-000000000009 >/dev/null 2>&1 \
    && bad "export: an unknown project id was accepted" || ok "export: an unknown project id is refused"

# ---- import into the SAME store: new projects beside the originals ----
res="$(sh "$CMD" import "$T/all.zip")"
python3 - "$PROJECTS_DIR" "$U1" "$U2" "$res" <<'PY' && ok "import: two NEW projects, fresh ids, own song folders, names kept apart" || bad "import: result on disk"
import json, os, sys
sys.path.insert(0, "standalone/scripts")
import state_subdir as ss, project_name as pn
pd, u1, u2, res = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4].strip().splitlines()[-1])
assert res["ok"] and len(res["imported"]) == 2 and res["skipped"] == [], res
dirs = sorted(os.listdir(pd))
assert len(dirs) == 4 and u1 in dirs and u2 in dirs, dirs
names = set()
for r in res["imported"]:
    u = r["uuid"]; d = os.path.join(pd, u)
    assert u not in (u1, u2)
    song = ss.song_folder(d)
    assert song == pn.song_folder_name(d), "song folder %r is not the new id's" % song
    sub = ss.state_subdir(d)
    assert sorted(os.listdir(d)).index(sub) > sorted(os.listdir(d)).index(song), "state dir lists before the song"
    assert not os.path.exists(os.path.join(d, sub, "new-project.json")), "new-project seed came back"
    assert json.load(open(os.path.join(d, sub, "seq8sa-state.json")))["v"] == 36
    names.add(pn.name_of(d))
assert names == {"Golf Buddy (imported)", "Loyal Magpie (imported)"}, names
# The originals are untouched.
assert pn.name_of(os.path.join(pd, u1)) == "Golf Buddy"
assert set(res["modules"]) == {"hatchet", "hatchet-amp"}, res["modules"]
assert res["templates"] == [], "a template already present was imported again"
PY

# ---- import into an EMPTY store (another Move): names as they were ----
export PROJECTS_DIR="$T/other/projects" TEMPLATES_DIR="$T/other/templates"
mkdir -p "$PROJECTS_DIR"
res="$(sh "$CMD" import "$T/all.zip")"
python3 - "$PROJECTS_DIR" "$TEMPLATES_DIR" "$res" <<'PY' && ok "import elsewhere: names unchanged, templates restored" || bad "import elsewhere"
import json, os, sys
sys.path.insert(0, "standalone/scripts")
import project_name as pn, project_template as pt
pd, td, res = sys.argv[1], sys.argv[2], json.loads(sys.argv[3].strip().splitlines()[-1])
assert {pn.name_of(os.path.join(pd, u)) for u in os.listdir(pd)} == {"Golf Buddy", "Loyal Magpie"}
assert [t["name"] for t in pt.list_templates(td)] == ["Open Bench"], pt.list_templates(td)
PY

# ---- pads: the lowest FREE ones, never the archived pad (needs user xattrs:
#      Linux — test-linux.sh; named as skipped elsewhere, never silently) ----
if python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.t", b"1")' "$T" 2>/dev/null; then
    export PROJECTS_DIR="$T/pads/projects"; mkdir -p "$PROJECTS_DIR"
    mkproj 33333333-aaaa-4bbb-8ccc-000000000003 "On Pad Zero" 36
    python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.dbx-pad", b"0")' "$PROJECTS_DIR/33333333-aaaa-4bbb-8ccc-000000000003"
    res="$(sh "$CMD" import "$T/all.zip")"
    python3 - "$res" <<'PY' && ok "import: lowest free pads (1, 2), pad 0 left alone" || bad "import pads: $res"
import json, sys
res = json.loads(sys.argv[1].strip().splitlines()[-1])
assert sorted(p["pad"] for p in res["imported"]) == [1, 2], res
PY
else
    echo "  SKIP pads: this filesystem has no user xattrs (covered by scripts/test-linux.sh)"
fi

# ---- refusals: each one for its own reason, and nothing written ----
refuse() { # label zip expected-substring
    local before after r rc=0
    before="$(ls "$PROJECTS_DIR" | wc -l)"
    r="$(sh "$CMD" import "$2" 2>&1)" || rc=$?
    after="$(ls "$PROJECTS_DIR" | wc -l)"
    if [ "$rc" -ne 0 ] && [ "$before" = "$after" ] && printf '%s' "$r" | grep -F -- "$3" >/dev/null; then
        ok "refused: $1"
    else
        bad "refused: $1 (rc=$rc, projects $before -> $after, said: $r)"
    fi
}
echo 'not a zip' > "$T/junk.zip"
refuse "not a zip" "$T/junk.zip" "not a zip file"
python3 -c 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("hello.txt","x"); z.close()' "$T/foreign.zip"
refuse "no manifest" "$T/foreign.zip" "no manifest.json"
python3 - "$T/all.zip" "$T/evil.zip" <<'PY'
import zipfile, sys
src = zipfile.ZipFile(sys.argv[1]); z = zipfile.ZipFile(sys.argv[2], "w")
for n in src.namelist(): z.writestr(n, src.read(n))
z.writestr("projects/../../escaped.txt", "x"); z.close()
PY
refuse "a path out of the archive" "$T/evil.zip" "unsafe path"
[ ! -e "$T/escaped.txt" ] && [ ! -e "$T/other/escaped.txt" ] && ok "nothing escaped" || bad "a file escaped the staging dir"
python3 - "$T/all.zip" "$T/link.zip" <<'PY'
import zipfile, sys
src = zipfile.ZipFile(sys.argv[1]); z = zipfile.ZipFile(sys.argv[2], "w")
for n in src.namelist(): z.writestr(n, src.read(n))
i = zipfile.ZipInfo("projects/link"); i.external_attr = (0o120777 << 16); z.writestr(i, "/etc/passwd"); z.close()
PY
refuse "a link" "$T/link.zip" "contains a link"
python3 - "$T/all.zip" "$T/future.zip" <<'PY'
import json, zipfile, sys
src = zipfile.ZipFile(sys.argv[1]); z = zipfile.ZipFile(sys.argv[2], "w")
for n in src.namelist():
    b = src.read(n)
    if n == "manifest.json":
        m = json.loads(b); m["format"] = 2; b = json.dumps(m)
    z.writestr(n, b)
z.close()
PY
refuse "a newer format" "$T/future.zip" "newer than this dAVEBOx"

# A project saved by another state version is SKIPPED (the DSP would ask to
# erase it), named, and the rest still come in.
export PROJECTS_DIR="$T/third/projects"; mkdir -p "$PROJECTS_DIR"
python3 - "$T/all.zip" "$T/oldv.zip" "$U2" <<'PY'
import zipfile, sys
src = zipfile.ZipFile(sys.argv[1]); z = zipfile.ZipFile(sys.argv[2], "w")
for n in src.namelist():
    b = src.read(n)
    if n == "projects/%s/dAVEBOx/seq8sa-state.json" % sys.argv[3]: b = b'{"v":35}'
    z.writestr(n, b)
z.close()
PY
res="$(sh "$CMD" import "$T/oldv.zip")"
python3 - "$PROJECTS_DIR" "$res" <<'PY' && ok "another state version: that project skipped and named, the other imported" || bad "state version skip: $res"
import json, os, sys
pd, res = sys.argv[1], json.loads(sys.argv[2].strip().splitlines()[-1])
assert [p["name"] for p in res["imported"]] == ["Golf Buddy"], res
assert len(res["skipped"]) == 1 and res["skipped"][0]["name"] == "Loyal Magpie" and "v35" in res["skipped"][0]["why"], res
assert len(os.listdir(pd)) == 1
PY
[ -z "$(ls -A "$DBX_DIR/imports" 2>/dev/null)" ] && ok "staging cleaned up" || bad "staging left behind: $(ls "$DBX_DIR/imports")"

if [ "$fails" -ne 0 ]; then echo "FAIL: test_project_archive"; exit 1; fi
echo "PASS: test_project_archive"
