#!/bin/sh
# project-cmd.sh — project management for a live standalone session.
#
# While a session runs, Sets/ IS the project library (set-swap.sh put it
# there), so these verbs operate directly on Sets/ using Move's own notions:
# a project is a <uuid>/<Name>/Song.abl set dir, ordering is the
# user.song-index xattr, and the active project is currentSongIndex in
# Settings.json.
#
# Verbs (driven by the hosted module through host_system_cmd's `sh ` prefix,
# results returned through files it can host_read_file):
#   list            write $DBX_DIR/projects.json:
#                     {"current": N, "projects": [{"uuid","name","index","color"}...]}
#   new <name>      create a project from the template (fresh uuid, next
#                     index, colour = index % DBX_PALETTE_N), then switch to it
#   switch <index>  save the current song, point currentSongIndex at <index>,
#                     and restart Move IN PLACE via the launcher's supervisor
#                     loop (relaunch_requested)
#   color <index> <n>    set (n < 0: clear) the pad-color palette index
#   rename <index> <name> rename the inner set dir + name index; the OPEN
#                     project defers the mv to relaunch_patch.sh and restarts
#                     Move in place (see do_rename)
#
# The switch path mirrors exit-to-stock.sh's shape: SIGTERM so the host runs
# its normal shutdown saves, detached because our caller dies with the process
# we signal. The launcher consumes relaunch_requested and runs Move again —
# same boot files, same session.

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
# Size of the picker's PROJECT_COLORS palette (davebox/ui/ui_dialogs.mjs). A
# new project is born with color `index % DBX_PALETTE_N` — round-robin by pad,
# so a shelf of fresh projects is not a wall of one colour, and the same pad
# always gets the same default. ⚠ Pinned to the JS table's length by
# davebox/tests/js/test_project_picker_leds.mjs: change both or the picker
# reads an out-of-range index as colour 0.
DBX_PALETTE_N=9
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
# Per-project state needs NO constant here: both halves live INSIDE the
# project's set dir (Sets/<uuid>/$DBX_SUBDIR_NAME/ — module files flat, host
# half under host/), so delete/copy/rename of the set dir take everything.
# The host's own record of the set it loaded, rewritten on every set change.
# ⚠ THIS install's copy — the stock tree has a file of the same name holding
# native-session leftovers. Authoritative for "which project is open";
# Settings.json's currentSongIndex is only written at a relaunch and goes stale.
ACTIVE_SET_PATH="${ACTIVE_SET_PATH:-$DBX_DIR/active_set.txt}"
# Move's stock instrument library. Overridable so the tests can point at a
# fixture instead of the device's real one.
CORE_LIBRARY_DIR="${CORE_LIBRARY_DIR:-/data/CoreLibrary}"
# ⭑ The reserved state subdir INSIDE each project's set dir (Phase B of the
# state-co-location plan): Sets/<uuid>/$DBX_SUBDIR_NAME/ holds the module's
# per-project state, beside Move's inner <Name>/ dir. Every site that hunts the
# inner set dir by "the one directory inside" MUST skip this name — a project
# dir has TWO children now, and os.listdir order is arbitrary, so an unfiltered
# [0] is a coin toss between the set and the state. Grep for dbx_subdir to find
# the filter sites; check-config.sh pins the spelling here, in the module
# (ui_persistence.mjs, dsp/seq8.c) and in select-list.sh.
DBX_SUBDIR_NAME="${DBX_SUBDIR_NAME:-dAVEBOx}"
OUT_JSON="$DBX_DIR/projects.json"
TEMPLATE_DIR="$DBX_DIR/sets/template"

die() { printf 'project-cmd: ERROR: %s\n' "$*" >&2; exit 1; }

save_song() {
    # Best-effort: an unsaved song must reach disk before Move goes away.
    dbus-send --system --print-reply --reply-timeout=4000 \
        --dest=com.ableton.move \
        /com/ableton/move/browser \
        com.ableton.move.Browser.saveSongIfDirty string: \
        >/dev/null 2>&1 || true
}

write_song_index() { # index
    [ -f "$SETTINGS_JSON" ] || return 0
    _tmp="$SETTINGS_JSON.projcmd.tmp"
    sed 's/\("currentSongIndex":[[:space:]]*\)-\{0,1\}[0-9][0-9]*/\1'"$1"'/' \
        "$SETTINGS_JSON" > "$_tmp" && mv -f "$_tmp" "$SETTINGS_JSON"
}

# The pad position of a project directory, or -1. The xattr IS the position —
# same source do_list, do_new_at and Move's own picker read (see the header
# note), so nothing here needs to keep a second opinion in step.
song_index() { # set-dir
    python3 -c 'import os,sys
try:
    print(int(os.getxattr(sys.argv[1], "user.song-index").decode()))
except Exception:
    print(-1)' "$1" 2>/dev/null || printf '%s\n' -1
}

do_list() {
    python3 - "$SETS_DIR" "$SETTINGS_JSON" "$OUT_JSON" "$DBX_SUBDIR_NAME" <<'PYEOF'
import json, os, re, sys
sets_dir, settings, out, dbx_subdir = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
cur = 0
try:
    m = re.search(r'"currentSongIndex":\s*(-?\d+)', open(settings).read())
    if m: cur = int(m.group(1))
except OSError:
    pass
projects = []
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
if os.path.isdir(sets_dir):
    for u in sorted(os.listdir(sets_dir)):
        p = os.path.join(sets_dir, u)
        if not os.path.isdir(p) or not uuid_re.match(u):
            continue
        # ⚠ TWO children since Phase B: Move's inner <Name>/ AND the reserved
        # state subdir. listdir order is arbitrary — filter, or the project
        # can list under the state dir's name.
        names = [n for n in os.listdir(p)
                 if os.path.isdir(os.path.join(p, n)) and not n.startswith(".")
                 and n != dbx_subdir]
        name = names[0] if names else u[:8]
        idx = None
        color = None
        if hasattr(os, "getxattr"):
            try:
                idx = int(os.getxattr(p, "user.song-index").decode())
            except (OSError, ValueError):
                pass
            # Palette index into the picker's PROJECT_COLORS table; absent =
            # null = the default color. Lives on the uuid dir beside
            # user.song-index so it travels with the project through the
            # set-swap and dies with delete for free.
            try:
                color = int(os.getxattr(p, "user.dbx-color").decode())
            except (OSError, ValueError):
                pass
        projects.append({"uuid": u, "name": name, "index": idx, "color": color})
# Unindexed projects sort last, stably.
projects.sort(key=lambda x: (x["index"] is None, x["index"] if x["index"] is not None else 0, x["name"]))
tmp = out + ".tmp"
with open(tmp, "w") as f:
    json.dump({"current": cur, "projects": projects}, f)
os.replace(tmp, out)
print("project-cmd: %d project(s) listed" % len(projects))
PYEOF
}

# Force Move's own mixer neutral on every track of a project.
#
# All Move track mixing is done by the session's FX buses, so a mute, a solo or
# a volume trim in the SET is invisible to the surface the user is mixing on:
# the bus fader they can see moves and nothing happens, because the set-level
# mute is silencing the instrument underneath it. Move spells mute
# `speakerOn: false`; volume is dB, 0.0 = unity; solo is `solo-cue`.
#
# Pan is deliberately left alone — that is a musical choice, not a level.
#
# Idempotent, and only writes a file it actually changes, so running it over
# the whole library costs a parse per project and nothing else. Used two ways:
# at creation (every new/copied project), and as a sweep at session entry that
# repairs projects made before this rule existed — or muted from Move itself in
# a previous session.
do_normalize() { # [index]  — every project when omitted
    python3 - "$SETS_DIR" "$DBX_SUBDIR_NAME" "${1:-}" <<'PYEOF'
import json, os, re, sys

sets_dir, dbx_subdir, only = sys.argv[1], sys.argv[2], sys.argv[3]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')

def song_path(uuid_dir):
    """The project's Song.abl, via its single inner set dir.

    ⚠ Skip the reserved state subdir — it is a sibling of Move's inner <Name>/
    dir, not a set, and listdir order is arbitrary."""
    for n in sorted(os.listdir(uuid_dir)):
        if n.startswith(".") or n == dbx_subdir:
            continue
        p = os.path.join(uuid_dir, n)
        if os.path.isdir(p):
            f = os.path.join(p, "Song.abl")
            if os.path.isfile(f):
                return f
    return None

def wanted(mixer):
    """True when the mixer already satisfies the invariant."""
    return (mixer.get("speakerOn") is True
            and mixer.get("solo-cue") is False
            and mixer.get("volume") == 0.0)

def normalize(song_file):
    try:
        with open(song_file) as f:
            song = json.load(f)
    except (OSError, ValueError) as e:
        print("project-cmd: normalize: skipping unreadable %s (%s)" % (song_file, e))
        return False
    tracks = song.get("tracks")
    if not isinstance(tracks, list):
        return False
    changed = False
    for t in tracks:
        mixer = t.get("mixer") if isinstance(t, dict) else None
        if not isinstance(mixer, dict) or wanted(mixer):
            continue
        mixer["speakerOn"] = True
        mixer["solo-cue"] = False
        mixer["volume"] = 0.0
        changed = True
    if not changed:
        return False
    # Temp sibling + fsync + rename: Move reads this file at boot, and a torn
    # one is a set that will not open.
    tmp = song_file + ".tmp"
    with open(tmp, "w") as f:
        json.dump(song, f, separators=(",", ": "), indent=4)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, song_file)
    return True

want_index = None
if only:
    try:
        want_index = int(only)
    except ValueError:
        sys.exit("project-cmd: normalize takes a numeric index")

seen = fixed = 0
for u in sorted(os.listdir(sets_dir)):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    if want_index is not None:
        try:
            if int(os.getxattr(p, "user.song-index").decode()) != want_index:
                continue
        except (OSError, ValueError):
            continue
    f = song_path(p)
    if not f:
        continue
    seen += 1
    if normalize(f):
        fixed += 1
        print("project-cmd: normalized Move mixer in %s" % u)

if fixed:
    os.sync()
print("project-cmd: mixer check: %d project(s), %d normalized" % (seen, fixed))
PYEOF
}

# ---- random stock instruments for a new project -----------------------------
# Move native fills a fresh set with random instruments from the stock library;
# ours always came up with the template's four, which made every new project
# sound identical (Josh, 2026-08-24). So: same idea, same library.
#
#   track 1  a drum kit          Drums/**            (kits are nested a level)
#   track 2  a bass              Bass/
#   track 3  polyphonic          one of POLY, and
#   track 4  polyphonic          a DIFFERENT one where the library allows
#
# ⭑ A stock Track Preset file IS the track's device object — same shape, minus
# `presetUri` and plus `$schema`. So installing one is a swap, not a merge, and
# there is nothing to keep in step when Ableton changes a device's parameters.
#
# ⚠ NEVER fails project creation. A missing library, an unreadable preset, an
# empty category — each one just leaves that track on whatever the template
# shipped, which is a working instrument. A new project you cannot make is a
# far worse outcome than a new project that sounds like the last one.
# ---- a new project starts in a random key ------------------------------------
# Josh, 2026-08-24. Key and scale are per-project DSP state, not something the
# Song.abl carries, and the DSP's own defaults (A minor) are compiled in — so a
# fresh project cannot be born in a random key from here. What CAN be done here
# is leave a note: the module reads it on the first load of that project,
# applies it, and deletes it. One marker, consumed once.
#
# ⚠ Written into the project's own dAVEBOx dir, so it travels with the project
# and dies with it — a copy of a project is NOT a new project and must not be
# re-randomised, which is exactly what a marker in a shared location would do.
seed_random_key() { # set-dir
    python3 - "$1" <<'PYEOF' || true
import json, os, random, sys
d = os.path.join(sys.argv[1], "dAVEBOx")
try:
    os.makedirs(d, exist_ok=True)
    # 12 keys x 14 scales — the same ranges the DSP clamps to
    # (sp_globals_transport.c: key 0-11, scale 0-13).
    with open(os.path.join(d, "new-project.json"), "w") as f:
        json.dump({"key": random.randint(0, 11), "scale": random.randint(0, 13)}, f)
except OSError:
    pass
PYEOF
}

randomize_instruments() { # song.abl
    python3 - "$1" "$CORE_LIBRARY_DIR" <<'PYEOF' || true
import json, os, random, sys
from urllib.parse import quote

song_path, core = sys.argv[1], sys.argv[2]
root = os.path.join(core, "Track Presets")
# Polyphonic = things you would play a chord on. Synth Lead is deliberately out
# (it is the one category that is monophonic by intent), as are Drums, Rhythmic,
# Sliced Loops, Special Effects and Templates — none of them are "an instrument
# on a melodic track".
POLY = ["Piano & Keys", "Synth Keys", "Pad", "Strings", "Mallets",
        "Guitar & Plucked", "Synth Pluck", "Brass", "Evolving"]


def presets_in(rel):
    """Every .json under one category, recursively — Drums nests by kit family."""
    base = os.path.join(root, rel)
    out = []
    for dirpath, _dirs, files in os.walk(base):
        for f in files:
            if f.endswith(".json"):
                out.append(os.path.join(dirpath, f))
    return out


def device_from(path):
    """A preset file as a track device: drop $schema, add the presetUri."""
    with open(path) as f:
        dev = json.load(f)
    if not isinstance(dev, dict) or "kind" not in dev:
        raise ValueError("not a preset")
    dev.pop("$schema", None)
    rel = os.path.relpath(path, core)
    # Percent-encoding exactly as Move writes it — spaces %20, ampersands %26.
    dev["presetUri"] = "ableton:/packs/abl-core-library/" + quote(rel, safe="/")
    return dev


try:
    with open(song_path) as f:
        song = json.load(f)
    tracks = song.get("tracks")
    if not isinstance(tracks, list):
        sys.exit(0)

    poly_pool = []
    for c in POLY:
        poly_pool.extend(presets_in(c))
    random.shuffle(poly_pool)
    # Two DIFFERENT poly instruments when the library can offer two.
    poly_pick = poly_pool[:2]

    wanted = [presets_in("Drums"), presets_in("Bass")]
    picks = [random.choice(w) if w else None for w in wanted]
    picks.append(poly_pick[0] if len(poly_pick) > 0 else None)
    picks.append(poly_pick[1] if len(poly_pick) > 1 else None)

    changed = False
    for i, pick in enumerate(picks):
        if pick is None or i >= len(tracks):
            continue
        t = tracks[i]
        if not isinstance(t, dict) or not isinstance(t.get("devices"), list) or not t["devices"]:
            continue
        try:
            t["devices"][0] = device_from(pick)
            changed = True
        except (OSError, ValueError, json.JSONDecodeError):
            pass          # this track keeps the template's instrument
    if not changed:
        sys.exit(0)

    tmp = song_path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(song, f, separators=(",", ": "), indent=4)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, song_path)
except Exception:
    sys.exit(0)     # never block project creation
PYEOF
}

do_new() { # name
    [ -n "${1:-}" ] || die "new needs a name"
    [ -d "$TEMPLATE_DIR" ] || die "no template at $TEMPLATE_DIR"
    _uuid="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')"
    _dst="$SETS_DIR/$_uuid/$1"
    mkdir -p "$_dst"
    # The template contains one <Name>/Song.abl; take the Song.abl regardless
    # of the template's own inner name.
    _src="$(find "$TEMPLATE_DIR" -name Song.abl | head -n 1)"
    [ -n "$_src" ] || die "template has no Song.abl"
    cp "$_src" "$_dst/Song.abl"
    # Random stock instruments, like Move native does on a new set.
    # After the copy (there is a file), before normalize (which re-reads it).
    randomize_instruments "$_dst/Song.abl"
    seed_random_key "$SETS_DIR/$_uuid"
    # Belt and braces: the template ships neutral, but a project is born here
    # and this is the one place that can promise it.
    do_normalize >/dev/null

    _idx="$(python3 - "$SETS_DIR" "$_uuid" "$DBX_PALETTE_N" <<'PYEOF'
import os, re, sys
sets_dir, new_uuid, palette_n = sys.argv[1], sys.argv[2], int(sys.argv[3])
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
top = -1
for u in os.listdir(sets_dir):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u) or u == new_uuid:
        continue
    if hasattr(os, "getxattr"):
        try:
            top = max(top, int(os.getxattr(p, "user.song-index").decode()))
        except (OSError, ValueError):
            pass
nxt = top + 1
if hasattr(os, "setxattr"):
    try:
        os.setxattr(os.path.join(sets_dir, new_uuid), "user.song-index", str(nxt).encode())
        os.setxattr(os.path.join(sets_dir, new_uuid), "user.dbx-color", str(nxt % palette_n).encode())
    except OSError:
        pass
print(nxt)
PYEOF
)"
    printf 'project-cmd: created "%s" (%s) at index %s\n' "$1" "$_uuid" "$_idx"
    do_switch "$_idx"
}

do_switch() { # index
    case "${1:-}" in *[!0-9]*|"") die "switch needs a numeric index" ;; esac
    save_song
    # ⚠ Do NOT write currentSongIndex here: Move is still alive, and its
    # SIGTERM teardown saves Settings.json — overwriting the value with its
    # own stale in-memory index (observed on hardware 2026-08-06: the fresh
    # session then booted into an unmatched set, `__pending-*`). The launcher
    # applies this file to Settings.json AFTER Move has exited, which is the
    # same ordering the host's own set-page change uses.
    printf '%s\n' "$1" > "$DBX_DIR/relaunch_song_index"
    : > "$DBX_DIR/relaunch_requested"
    # Detached, exactly like exit-to-stock.sh: our caller is a child of the
    # process we are about to signal. SIGTERM so shutdown saves run; the
    # launcher's supervisor loop sees relaunch_requested and runs Move again.
    setsid sh -c '
      sleep 1
      pkill -x MoveOriginal
    ' >/dev/null 2>&1 &
    printf 'project-cmd: switching to index %s (Move restarting in place)\n' "$1"
}

# Template birth at a SPECIFIC index (the pad the user tapped in the picker).
# Unlike do_new (next-free index + auto-switch), this only creates — the
# caller orchestrates the switch itself.
do_new_at() { # index [name]
    case "${1:-}" in *[!0-9]*|"") die "new-at needs a numeric index" ;; esac
    [ -d "$TEMPLATE_DIR" ] || die "no template at $TEMPLATE_DIR"
    _src="$(find "$TEMPLATE_DIR" -name Song.abl | head -n 1)"
    [ -n "$_src" ] || die "template has no Song.abl"
    _uuid="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')"
    _name="${2:-Project $(($1 + 1))}"
    mkdir -p "$SETS_DIR/$_uuid/$_name"
    cp "$_src" "$SETS_DIR/$_uuid/$_name/Song.abl"
    # Random stock instruments, like Move native does on a new set.
    # After the copy (there is a file), before normalize (which re-reads it).
    randomize_instruments "$SETS_DIR/$_uuid/$_name/Song.abl"
    seed_random_key "$SETS_DIR/$_uuid"
    python3 -c "import os,sys; os.setxattr(sys.argv[1], 'user.song-index', sys.argv[2].encode())" \
        "$SETS_DIR/$_uuid" "$1" 2>/dev/null || true
    # Default colour: round-robin by pad (see DBX_PALETTE_N). Same best-effort
    # shape as the index above — a project without the xattr is simply colour 0.
    python3 -c "import os,sys; os.setxattr(sys.argv[1], 'user.dbx-color', str(int(sys.argv[2]) % int(sys.argv[3])).encode())" \
        "$SETS_DIR/$_uuid" "$1" "$DBX_PALETTE_N" 2>/dev/null || true
    do_normalize "$1" >/dev/null
    do_list
    printf 'project-cmd: created "%s" (%s) at index %s\n' "$_name" "$_uuid" "$1"
}

# Duplicate a project onto another pad. Inner name gets Move's own " Copy"
# suffix so the hosted module's copy-inheritance machinery (family lookup on
# first open) treats it exactly like a native pad-copy.
do_copy() { # src-index dst-index
    case "${1:-}" in *[!0-9]*|"") die "copy needs a numeric source index" ;; esac
    case "${2:-}" in *[!0-9]*|"") die "copy needs a numeric destination index" ;; esac
    python3 - "$SETS_DIR" "$1" "$2" "$DBX_SUBDIR_NAME" <<'PYEOF'
import os, re, shutil, sys, uuid as uuidlib
sets_dir, src, dst = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
dbx_subdir = sys.argv[4]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
def find(idx):
    for u in os.listdir(sets_dir):
        p = os.path.join(sets_dir, u)
        if not os.path.isdir(p) or not uuid_re.match(u):
            continue
        try:
            if int(os.getxattr(p, "user.song-index").decode()) == idx:
                return u, p
        except (OSError, ValueError):
            pass
    return None, None
su, sp = find(src)
if not su:
    sys.exit("project-cmd: ERROR: no project at index %d" % src)
du, _ = find(dst)
if du:
    sys.exit("project-cmd: ERROR: index %d already occupied" % dst)

# ⭑ COPY = one copytree of the WHOLE uuid dir. The module's state lives INSIDE
# it (<uuid>/<dbx_subdir>/, Phase B of the state-co-location plan), so the
# duplicate is a snapshot BY CONSTRUCTION — the hand-copied module-state seeding
# that used to live here, and the silently-tracks-its-source bug it fixed
# (Josh, hardware, 2026-08-11), are both structurally impossible now.
# The inner set dir is renamed to "<Name> Copy" AFTER the copy; the reserved
# state subdir is skipped when hunting it (it is a sibling, not a set).
nu = str(uuidlib.uuid4())
np = os.path.join(sets_dir, nu)
shutil.copytree(sp, np)
inner = [n for n in os.listdir(np)
         if os.path.isdir(os.path.join(np, n)) and not n.startswith(".")
         and n != dbx_subdir]
if not inner:
    shutil.rmtree(np)
    sys.exit("project-cmd: ERROR: source has no inner set dir")
os.rename(os.path.join(np, inner[0]), os.path.join(np, inner[0] + " Copy"))
# copytree carries the INNER tree but not the OUTER dir's xattrs — index and
# color are the outer dir's, so set by hand.
os.setxattr(np, "user.song-index", str(dst).encode())
try:
    os.setxattr(np, "user.dbx-color", os.getxattr(sp, "user.dbx-color"))
except OSError:
    pass

# (No second half to hand-copy: since Phase C the HOST state — chains, slots,
# FX — lives inside the set dir too, under <subdir>/host/, so the copytree
# above carried BOTH halves. The whole project is one directory.)

# ⚠ SYNC before returning (Josh, hardware, 2026-08-12): a hard power cut can
# lose unsynced directory operations to journal replay. A copy that vanishes is
# merely surprising; the same replay UN-DOING A DELETE resurrects projects the
# user watched disappear. All destructive/creative verbs flush.
os.sync()
print("project-cmd: copied index %d -> %d (%s)" % (src, dst, nu))
PYEOF
    # A copy inherits its source's Move mixer, including a mute the user set
    # from Move itself — so the duplicate gets the invariant applied, not the
    # source's history.
    do_normalize "$2" >/dev/null
    do_list
}

do_delete() { # index
    case "${1:-}" in *[!0-9]*|"") die "delete needs a numeric index" ;; esac

    # ---- deleting the OPEN project (Josh, 2026-08-24) -----------------------
    # Used to be refused outright, by two independent guards, because you cannot
    # rmtree a set the host has loaded and expect the session to survive it. The
    # answer is the one do_rename already uses for the same problem: don't do it
    # NOW, hand it to the launcher to do after Move has exited, and restart in
    # place. `relaunch_patch.sh` runs in exactly that window — no process holding
    # the directory, and no dying Move able to save the set back into existence.
    #
    # The session comes back on the LOWEST remaining project, or, if that was the
    # last one, on the picker (`reselect`), which is also what a fresh install
    # shows. The guard below still stands for every path that has NOT arranged
    # this — it is the accident that is refused, not the intent.
    _open_del=""
    [ -f "$ACTIVE_SET_PATH" ] && _open_del="$(head -n 1 "$ACTIVE_SET_PATH" | tr -d '[:space:]')"
    if [ -n "$_open_del" ] && [ -d "$SETS_DIR/$_open_del" ] && \
       [ "$(song_index "$SETS_DIR/$_open_del")" = "$1" ]; then
        _next_idx="$(python3 - "$SETS_DIR" "$_open_del" <<'PYEOF'
import os, re, sys
sets_dir, skip = sys.argv[1], sys.argv[2]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
idxs = []
for u in os.listdir(sets_dir):
    if u == skip or not uuid_re.match(u):
        continue
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p):
        continue
    try:
        idxs.append(int(os.getxattr(p, "user.song-index").decode()))
    except (OSError, ValueError):
        pass
print(min(idxs) if idxs else -1)
PYEOF
)"
        save_song
        # ⭑ rm -rf, not rmtree-in-python: this line is executed by the LAUNCHER
        # long after this script is gone. Quote it the way do_rename quotes its
        # mv — a set directory is a uuid, but $SETS_DIR need not be innocent.
        printf 'rm -rf %s\n' \
            "'$(printf '%s' "$SETS_DIR/$_open_del" | sed "s/'/'\\\\''/g")'" \
            >> "$DBX_DIR/relaunch_patch.sh"
        # ⚠ sync AFTER the rm, in the same deferred script — an unsynced rmtree
        # can be undone by journal replay after a power cut (Josh, hardware,
        # 2026-08-12), and that lesson does not stop applying because the delete
        # moved into the launcher.
        printf 'sync\n' >> "$DBX_DIR/relaunch_patch.sh"
        if [ "$_next_idx" -ge 0 ] 2>/dev/null; then
            printf '%s\n' "$_next_idx" > "$DBX_DIR/relaunch_song_index"
        else
            : > "$DBX_DIR/relaunch_reselect"
        fi
        : > "$DBX_DIR/relaunch_requested"
        setsid sh -c '
          sleep 1
          pkill -x MoveOriginal
        ' >/dev/null 2>&1 &
        printf 'project-cmd: delete of OPEN project queued (Move restarting in place)\n'
        return 0
    fi
    python3 - "$SETS_DIR" "$SETTINGS_JSON" "$1" "$ACTIVE_SET_PATH" <<'PYEOF'
import os, re, shutil, sys
sets_dir, settings, idx = sys.argv[1], sys.argv[2], int(sys.argv[3])
active_set_path = sys.argv[4] if len(sys.argv) > 4 else ""


def open_uuid():
    """UUID of the set the HOST has loaded, or '' if unknown.

    active_set.txt is written on every set change; currentSongIndex is only
    written at a relaunch and goes stale mid-session — measured naming project 5
    while 14 was loaded. Trusting the stale one here is the dangerous direction:
    it protects the wrong pad AND permits deleting the project that is live.
    """
    try:
        with open(active_set_path) as f:
            return f.readline().strip()
    except OSError:
        return ""


def index_of(uuid):
    if not uuid:
        return -1
    p = os.path.join(sets_dir, uuid)
    try:
        return int(os.getxattr(p, "user.song-index").decode())
    except (OSError, ValueError):
        return -1


cur = index_of(open_uuid())
if cur < 0:                                  # no usable record — fall back
    try:
        m = re.search(r'"currentSongIndex":\s*(-?\d+)', open(settings).read())
        if m: cur = int(m.group(1))
    except OSError:
        pass
if idx == cur:
    sys.exit("project-cmd: ERROR: refusing to delete the OPEN project")
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(sets_dir):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if int(os.getxattr(p, "user.song-index").decode()) == idx:
            shutil.rmtree(p)
            # ⭑ ONE rmtree deletes the WHOLE project. Both state halves live
            # inside the set dir (module since Phase B, host since Phase C),
            # so "delete the project" and "delete its state" stopped being two
            # operations to keep in step — there is nothing else to take.
            # ⚠ SYNC before reporting success (Josh, hardware, 2026-08-12): a
            # hard power cut replays the journal, and an unsynced rmtree can be
            # UNDONE by it — the user watched this project disappear, and it
            # was back after a power pull. Deletion is only real once flushed.
            os.sync()
            # ⚠ The NAME INDEX is deliberately NOT touched here. The module holds
            # it in memory (S.nameIndexCache) and rewrites the whole file on the
            # next save, so a drop written behind its back is simply resurrected
            # — and the module is the one that knows the delete happened. It
            # drops the entry itself (dropNameIndexUuid, ui_dialogs' delete
            # branch); the rename path here only writes it because the module is
            # NOT involved in a rename. One writer per moment.
            print("project-cmd: deleted index %d (%s)" % (idx, u))
            sys.exit(0)
    except (OSError, ValueError):
        pass
sys.exit("project-cmd: ERROR: no project at index %d" % idx)
PYEOF
    do_list
}

# Set (or clear, with n < 0) the pad color for a project. The value is an
# index into the picker's palette table, not an LED code — the module owns
# what the numbers look like.
do_color() { # index n
    case "${1:-}" in *[!0-9]*|"") die "color needs a numeric index" ;; esac
    case "${2:-}" in -*|[0-9]*) ;; *) die "color needs a numeric value" ;; esac
    python3 - "$SETS_DIR" "$1" "$2" <<'PYEOF'
import os, re, sys
sets_dir, idx, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(sets_dir):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if int(os.getxattr(p, "user.song-index").decode()) != idx:
            continue
    except (OSError, ValueError):
        continue
    if n < 0:
        try:
            os.removexattr(p, "user.dbx-color")
        except OSError:
            pass
        print("project-cmd: cleared color on index %d" % idx)
    else:
        os.setxattr(p, "user.dbx-color", str(n).encode())
        print("project-cmd: set color %d on index %d" % (n, idx))
    sys.exit(0)
sys.exit("project-cmd: ERROR: no project at index %d" % idx)
PYEOF
    do_list
}

# Rename a project's INNER set dir — the name Move shows.
# (The name→uuid index this used to maintain died with the inherit machinery in
# Phase 0 of the state-co-location plan; a rename is just the mv now.)
#
# ⚠ The OPEN project cannot be renamed live: Move holds the song and its saves
# write by path, so a live mv risks the dying save re-creating the old dir.
# For the open project the rename is DEFERRED to the launcher's
# relaunch_patch.sh hook (applied AFTER Move exits, before the in-place
# restart) and rides the exact switch-in-place machinery do_switch proved:
# save, queue, SIGTERM, supervisor relaunch at the same index. Non-open
# projects rename immediately — the same liveness argument delete already
# proved on hardware.

do_rename() { # index newname [reselect]
    case "${1:-}" in *[!0-9]*|"") die "rename needs a numeric index" ;; esac
    [ -n "${2:-}" ] || die "rename needs a name"
    case "$2" in */*) die "name must not contain /" ;; esac

    _found="$(python3 - "$SETS_DIR" "$1" "$DBX_SUBDIR_NAME" <<'PYEOF'
import os, re, sys
sets_dir, idx, dbx_subdir = sys.argv[1], int(sys.argv[2]), sys.argv[3]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(sets_dir):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if int(os.getxattr(p, "user.song-index").decode()) != idx:
            continue
    except (OSError, ValueError):
        continue
    inner = [n for n in os.listdir(p)
             if os.path.isdir(os.path.join(p, n)) and not n.startswith(".")
             and n != dbx_subdir]
    if not inner:
        sys.exit("project-cmd: ERROR: project has no inner set dir")
    print(u); print(inner[0])
    sys.exit(0)
sys.exit("project-cmd: ERROR: no project at index %d" % idx)
PYEOF
)" || die "no project at index $1"
    _uuid="$(printf '%s\n' "$_found" | sed -n 1p)"
    _old="$(printf '%s\n' "$_found" | sed -n 2p)"
    [ "$_old" = "$2" ] && { do_list; return 0; }

    _open=""
    [ -f "$ACTIVE_SET_PATH" ] && _open="$(head -n 1 "$ACTIVE_SET_PATH" | tr -d '[:space:]')"
    if [ "$_uuid" = "$_open" ]; then
        # OPEN project: defer the mv to the launcher (post-exit), then restart
        # Move in place at the same index — do_switch's exact shape. Append to
        # relaunch_patch.sh rather than clobbering a pending patch.
        save_song
        {
            printf 'mv %s %s\n' \
                "'$SETS_DIR/$_uuid/$(printf '%s' "$_old" | sed "s/'/'\\\\''/g")'" \
                "'$SETS_DIR/$_uuid/$(printf '%s' "$2"   | sed "s/'/'\\\\''/g")'"
        } >> "$DBX_DIR/relaunch_patch.sh"
        printf '%s\n' "$1" > "$DBX_DIR/relaunch_song_index"
        # A rename issued while NOTHING is loaded (the boot picker) must bring
        # the fresh session back to the picker instead of auto-loading — the
        # caller says so with a literal third arg `reselect` and the launcher
        # honours the marker by re-arming fresh_session.
        [ "${3:-}" = "reselect" ] && : > "$DBX_DIR/relaunch_reselect"
        : > "$DBX_DIR/relaunch_requested"
        setsid sh -c '
          sleep 1
          pkill -x MoveOriginal
        ' >/dev/null 2>&1 &
        printf 'project-cmd: rename of OPEN project queued (Move restarting in place)\n'
        return 0
    fi

    mv "$SETS_DIR/$_uuid/$_old" "$SETS_DIR/$_uuid/$2"
    printf 'project-cmd: renamed index %s to "%s"\n' "$1" "$2"
    do_list
}

# (do_prune is GONE — Phase C. It reclaimed orphaned HOST state dirs from the
# parallel $DBX_DIR/set_state root, with a four-root liveness test and a
# refuse-rather-than-guess sweep, because a deleted set could leave its routing
# behind. Both state halves live inside the set dir now: no parallel root, no
# orphan, nothing to reclaim. Devices that ran older builds may hold inert
# leftovers under $DBX_DIR/set_state — KB-scale history, harmless.)

case "${1:-}" in
    list)   do_list ;;
    new)    shift; do_new "${1:-}" ;;
    new-at) shift; do_new_at "${1:-}" "${2:-}" ;;
    copy)   shift; do_copy "${1:-}" "${2:-}" ;;
    delete) shift; do_delete "${1:-}" ;;
    switch) shift; do_switch "${1:-}" ;;
    color)  shift; do_color "${1:-}" "${2:-}" ;;
    normalize) shift; do_normalize "${1:-}" ;;
    rename) shift; do_rename "${1:-}" "${2:-}" "${3:-}" ;;
    *) die "usage: project-cmd.sh list|new <name>|new-at <index> [name]|copy <src> <dst>|delete <index>|switch <index>|color <index> <n>|rename <index> <name>" ;;
esac
