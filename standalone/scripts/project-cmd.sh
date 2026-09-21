#!/bin/sh
# project-cmd.sh — project management for a live standalone session.
#
# ⭐ Projects live in THEIR OWN root ($DBX_DIR/projects/<id>/), not in Move's
# set library. Every verb here enumerates that root. What Move sees is a VIEW
# of it: one symlink per project inside $DBX_DIR/sets/library, which
# set-swap.sh bind-mounts over Sets/ for a session. library_slots.py owns that
# view and is the only thing here that writes a link.
#
# Two consequences worth stating, because the old shape had neither:
#   · no verb can reach the user's own Move library, whatever is mounted —
#     the store is ours unconditionally;
#   · no verb operates on a symlink, so `rm -rf`, `rmtree`, `copytree` and
#     `shutil.move` all mean what they say again.
#
# A project keeps Move's own notions otherwise: <id>/<Name>/Song.abl, ordering
# is Move's own index xattr (on the PROJECT — a symlink cannot carry one, and
# Move's getxattr follows the link), and the active project is
# currentSongIndex in Settings.json.
#
# ⭐ The PICKER PAD is a different number and lives in a different xattr —
# see project_pad.py, which is the only thing that spells it. Every verb here
# finds a project BY PAD; Move's index is still stamped alongside it, and that
# is the part the next phase takes away.
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
#   library-sync    move anything still living IN the library into the store,
#                     then make the library show exactly one slot per project.
#                     Run from launch.sh before set-swap enters; idempotent.
#
# The switch path mirrors exit-to-stock.sh's shape: SIGTERM so the host runs
# its normal shutdown saves, detached because our caller dies with the process
# we signal. The launcher consumes relaunch_requested and runs Move again —
# same boot files, same session.

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
# ⭐ THE PROJECT STORE. Projects live here and nowhere else; every verb below
# enumerates THIS directory. The set library Move sees is a VIEW of it — one
# symlink per project, maintained by library_slots.py — so no verb here ever
# touches a link, and none of them can reach the user's own Move library.
PROJECTS_DIR="${PROJECTS_DIR:-$DBX_DIR/projects}"
# The library the slots live in. set-swap.sh bind-mounts it over Move's Sets/
# for the duration of a session, so a slot written here appears to Move at
# once — same inode, no copy, nothing to keep in step.
LIBRARY_DIR="${LIBRARY_DIR:-$DBX_DIR/sets/library}"
# Size of the picker's PROJECT_COLORS palette (davebox/ui/ui_dialogs.mjs). A
# new project is born with color `index % DBX_PALETTE_N` — round-robin by pad,
# so a shelf of fresh projects is not a wall of one colour, and the same pad
# always gets the same default. ⚠ Pinned to the JS table's length by
# davebox/tests/js/test_project_picker_leds.mjs: change both or the picker
# reads an out-of-range index as colour 0.
DBX_PALETTE_N=9
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
# Per-project state needs NO constant here: both halves live INSIDE the
# project's set dir (projects/<id>/<state>/ — module files flat, host
# half under host/), so delete/copy/rename of the set dir take everything.
# The host's own record of the set it loaded, rewritten on every set change.
# ⚠ THIS install's copy — the stock tree has a file of the same name holding
# native-session leftovers. Authoritative for "which project is open";
# Settings.json's currentSongIndex is only written at a relaunch and goes stale.
ACTIVE_SET_PATH="${ACTIVE_SET_PATH:-$DBX_DIR/active_set.txt}"
# Move's stock instrument library. Overridable so the tests can point at a
# fixture instead of the device's real one.
CORE_LIBRARY_DIR="${CORE_LIBRARY_DIR:-/data/CoreLibrary}"
# ⭑ The state dir INSIDE each project's set dir (Phase B of the
# state-co-location plan): projects/<id>/<state>/ holds the module's per-project
# state, beside Move's inner <Name>/ dir. Its NAME is not fixed: `dAVEBOx` or
# `dAVEBOx~<n>`, chosen per project so it lists AFTER the song folder, because
# Move opens the first subfolder it lists as the song (set-folder order fix,
# 2026-09-14). Every rule about that name — match, find, choose, re-order —
# lives in state_subdir.py beside this script; every python block here imports
# it rather than spelling the name. check-config.sh pins it against the C copy.
DBX_PY_DIR="${DBX_PY_DIR:-$(cd "$(dirname "$0")" && pwd)}"
export DBX_PY_DIR
# No __pycache__ beside the scripts (the install tree is a manifest-checked payload).
export PYTHONDONTWRITEBYTECODE=1
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

# ⭐⭐ WHAT IS OPEN IS A LIBRARY ENTRY. THESE VERBS REASON IN PROJECTS.
#
# `active_set.txt` carries exactly what MOVE confirmed, which is the entry it
# opened — a SLOT id since the library stopped being one entry per project. So
# does DBX_OPEN_UUID, because the module passes on what the host published.
# Every verb here compares against project ids.
#
# ⚠⚠ THE COST OF NOT DOING THIS, measured on the device: `delete` read the slot
# id, looked for a project by that name, found none, and so decided the project
# being deleted was NOT the open one — taking the immediate path and removing
# the live project out from under the session, with no relaunch queued. The
# screen sat on "deleting" forever, because the restart it was waiting for was
# never asked for. Silent, and the opposite of what the guard exists to do.
#
# Same rule as the JS side\'s projectIdOfEntry, same reason, other language.
resolve_open_project() { # entry-or-project-id  -> project id, or empty
    [ -n "${1:-}" ] || return 0
    python3 - "$LIBRARY_DIR" "$PROJECTS_DIR" "$1" <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl
library, projects_dir, ident = sys.argv[1], sys.argv[2], sys.argv[3]
if ident in sl.SLOT_IDS:
    ident = sl.slot_target(library, ident)
print(ident if ident and os.path.isdir(os.path.join(projects_dir, ident)) else "")
PYEOF
}

# The pad position of a project directory, or -1. The xattr IS the position —
# same source do_list, do_new_at and Move's own picker read (see the header
# note), so nothing here needs to keep a second opinion in step.
song_index() { # project-dir  — the PICKER PAD, or -1
    python3 -c 'import os,sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
_p = pp.pad_of(sys.argv[1])
print(-1 if _p is None else _p)' "$1" 2>/dev/null || printf '%s\n' -1
}

# Stamp the xattrs a NATIVE Move-born set carries, in the same shape Move
# itself writes — see tools/pytest-schwung/src/schwung_bus/pytest_plugin.py
# ::_create_template_set (which stamps a test fixture to "look like an
# ordinary [Move] entry") and shadow_set_pages.c's set_page_xattr_names for
# the reference. Fix D of the 2026-09-14 new-project plan: a dAVEBOx-born
# project was missing these, and Move's own set-open code may be the thing
# silently rejecting a project that lacks its own provenance markers — this
# is provenance PARITY, not a guess at a new format.
#   user.song-color          Move's own color slot (distinct from dAVEBOx's
#                             own user.dbx-color) — mirror the SAME value so
#                             the project looks Move-born to Move too.
#   user.last-modified-time  ISO-8601 UTC, Move's own spelling.
#   user.local-cloud-state   Move seeds "notSynced" on a locally-made set.
# Best-effort, like every xattr write in this file: a project this fails on
# is simply missing Move's own metadata, not missing entirely.
stamp_move_xattrs() { # set-dir color-value
    python3 -c "import os,sys
_d, _c = sys.argv[1], sys.argv[2]
os.setxattr(_d, 'user.song-color', _c.encode())
os.setxattr(_d, 'user.last-modified-time', sys.argv[3].encode())
os.setxattr(_d, 'user.local-cloud-state', b'notSynced')
" "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null || true
}

# ---- the library view --------------------------------------------------------
# Bring the set library back in step with the store: one slot per project, and
# nothing else of ours. Cheap and idempotent — a healthy library is one listing
# and says nothing — so every verb that adds or removes a project just calls it
# rather than reasoning about which link to touch.
#
# ⚠ It writes into $LIBRARY_DIR, the library's REAL path, never through the
# bind mount at Sets/. Same inode while a session is up, so a new slot is
# visible to Move immediately; and outside a session there is no mount to be
# wrong about.
sync_library() {
    _prefer=""
    [ -f "$ACTIVE_SET_PATH" ] && \
        _prefer="$(head -n 1 "$ACTIVE_SET_PATH" | tr -d '[:space:]')"
    python3 - "$LIBRARY_DIR" "$PROJECTS_DIR" "$_prefer" <<'PYEOF' || \
        printf 'project-cmd: WARNING: library sync failed\n' >&2
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl
# ⭐ The boot project keeps slot 0 where it can, so a launch lands where the
# last session left off rather than on whichever project sorts first.
# ⚠ active_set.txt carries what MOVE confirmed — which is the library ENTRY,
# i.e. a slot id once slots exist. Resolve it to the project it leads to
# before preferring it, or the preference names a slot and matches nothing.
_prefer = sys.argv[3] if len(sys.argv) > 3 else ""
if _prefer in sl.SLOT_IDS:
    _prefer = sl.slot_target(sys.argv[1], _prefer)
pointed, removed, strays = sl.sync(sys.argv[1], sys.argv[2], _prefer)
for i, pid in pointed:
    print("project-cmd: library: slot %d -> %s" % (i, pid))
for n in removed:
    print("project-cmd: library: removed %s (not a slot)" % n)
for n in strays:
    print("project-cmd: library: WARNING not a slot, left alone: %s" % n)
PYEOF
}

# ⭐ THE SWITCH PRIMITIVE: point ONE slot at ONE project, and say what it
# actually resolves to afterwards.
#
# Prints the project id the slot leads to AFTER the write, and exits non-zero
# when that is not what was asked for. ⚠ A READBACK, not a success flag, and
# the difference is the whole point: if the rename did not land, the slot still
# points at its PREVIOUS project — so pressing its pad would make Move
# genuinely change set, Move would log, and the uuid it logs IS the slot we
# pressed. Confirmation would pass and the wrong project would be reported
# open. The caller must compare, and must not press on a mismatch.
#
# ⚠⚠ ONLY EVER THE IDLE SLOT. Re-pointing the slot Move is live on was tried
# deliberately on hardware: the session's state landed in an unrelated project,
# the project being edited took zero writes, and nothing said so.
do_point() { # slot-index project-id
    case "${1:-}" in *[!0-9]*|"") die "point needs a numeric slot index" ;; esac
    [ -n "${2:-}" ] || die "point needs a project id"
    python3 - "$LIBRARY_DIR" "$PROJECTS_DIR" "$1" "$2" <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl
library, projects_dir, slot, pid = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
if not os.path.isdir(os.path.join(projects_dir, pid)):
    sys.exit("project-cmd: ERROR: no such project: %s" % pid)
try:
    landed = sl.repoint(library, projects_dir, slot, pid)
except ValueError as e:
    sys.exit("project-cmd: ERROR: %s" % e)
print(landed)
if landed != pid:
    sys.exit("project-cmd: ERROR: slot %d resolves to %r, asked for %r — NOT pressed"
             % (slot, landed, pid))
PYEOF
}

# ⭐ THE BOOT POSITION IS A SLOT, NEVER A PICKER PAD.
#
# Move boots into `currentSongIndex` of the library it can SEE, which holds the
# two slots. A picker pad is dAVEBOx\'s own number and means nothing to Move —
# writing one names a position that does not exist, and Move mints its own
# default song instead of opening a project.
#
# ⚠⚠ THIS EXISTS BECAUSE THE SAME TRANSLATION WAS WRITTEN THREE TIMES AND
# MISSED ONCE. do_switch, select-hook and do_delete each write a boot position;
# do_delete was missed, which is how deleting the OPEN project left the device
# on a screen that never came back. One helper, so there is one place to be
# wrong rather than three.
boot_slot_for_pad() { # picker-pad  -> slot index on stdout (0 if unplaceable)
    _bs_uuid="$(python3 - "$PROJECTS_DIR" "${1:-}" <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl, project_pad as pp
projects_dir, pad = sys.argv[1], sys.argv[2]
try:
    pad = int(pad)
except ValueError:
    sys.exit(0)
for pid in sl.project_ids(projects_dir):
    if pp.pad_of(os.path.join(projects_dir, pid)) == pad:
        print(pid); break
PYEOF
)"
    _bs_slot=-1
    if [ -n "$_bs_uuid" ]; then
        _bs_slot="$(do_slot_of "$_bs_uuid" 2>/dev/null || echo -1)"
        if [ "$_bs_slot" = "-1" ]; then
            # Not on show. A relaunch kills Move, so there is no live slot to
            # protect — the one window where taking one is safe.
            do_point 0 "$_bs_uuid" >/dev/null 2>&1 && _bs_slot=0
        fi
    fi
    case "$_bs_slot" in ''|*[!0-9]*) _bs_slot=0 ;; esac
    printf '%s\n' "$_bs_slot"
}

# ⭐⭐ PREPARE A SWITCH: make the target project reachable on a slot, and say
# WHICH slot to press. The whole invariant lives here, in one place, rather
# than split across the shell/JS seam where half of it would be assumed.
#
#   switch-slot <target-project> [live-project]
#
# Writes $DBX_DIR/slot_switch.json  {"slot": N, "project": "<id>", "ok": true}
# and exits non-zero on any failure, having written "ok": false.
#
# The rules it keeps, all three of which are load-bearing:
#   1. NEVER re-point the slot the live project is on. Re-pointing a live slot
#      was tried deliberately on hardware: the session state went into an
#      unrelated project and the project being edited took zero writes, both
#      directions, silently.
#   2. If the target is ALREADY on a slot, press that one — do not re-point
#      anything. This is the ordinary A->B->A case and it needs no write at all.
#   3. Confirm by READBACK before reporting a slot as pressable. A rename that
#      did not land leaves the slot on its previous project, and pressing it
#      would still make Move change set, still log, and log the slot we
#      pressed — so confirmation would pass for the wrong project.
do_switch_slot() { # target-project [live-project]
    [ -n "${1:-}" ] || die "switch-slot needs a target project id"
    python3 - "$LIBRARY_DIR" "$PROJECTS_DIR" "$DBX_DIR/slot_switch.json" "$1" "${2:-}" <<'PYEOF'
import json, os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl

library, projects_dir, out, target, live = sys.argv[1:6]

def answer(ok, slot=-1, project="", why=""):
    """Write the verdict and STOP. ⚠ It must terminate on success too.

    It did not, for one revision: the success path printed and returned, so the
    already-on-show case fell through and re-pointed a slot it had just said
    needed no re-point. Switching to the project that is ALREADY LIVE then hit
    the two-slots-one-project guard and wrote ok:false over its own ok:true —
    reporting failure for the one case that could not be simpler."""
    tmp = out + ".tmp"
    with open(tmp, "w") as f:
        # ⭐ slot_uuid is what MOVE will name when it opens this — the library
        # entry, not the project. The request the caller writes must carry it,
        # or confirmation compares a project id against an entry id and never
        # matches. (They are different strings now; that is the whole change.)
        json.dump({"ok": bool(ok), "slot": slot, "project": project,
                   "slot_uuid": sl.SLOT_IDS[slot] if 0 <= slot < len(sl.SLOT_IDS) else "",
                   "why": why}, f)
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp, out)
    if not ok:
        sys.exit("project-cmd: switch-slot: %s" % why)
    print("project-cmd: switch-slot: press slot %d for %s" % (slot, project))
    sys.exit(0)

if not os.path.isdir(os.path.join(projects_dir, target)):
    answer(False, why="no such project: %s" % target)

# 2. already on show — press it, touch nothing.
here = sl.slot_of_project(library, target)
if here is not None:
    answer(True, here, target)

# 1. the idle slot is the one the live project is NOT on.
live_slot = sl.slot_of_project(library, live) if live else None
idle = None
for i in range(len(sl.SLOT_IDS)):
    if i != live_slot and os.path.islink(os.path.join(library, sl.SLOT_IDS[i])):
        idle = i
        break
if idle is None:
    # Fewer slots than we thought (a single-project library that just grew).
    # Taking the next slot is safe: it holds nothing, so nothing is live on it.
    for i in range(len(sl.SLOT_IDS)):
        if not os.path.islink(os.path.join(library, sl.SLOT_IDS[i])):
            idle = i
            break
if idle is None:
    answer(False, why="no idle slot (live=%r)" % live)

try:
    landed = sl.repoint(library, projects_dir, idle, target)
except ValueError as e:
    answer(False, why=str(e))

# 3. readback, before anyone presses anything.
if landed != target:
    answer(False, idle, landed,
           "slot %d resolves to %r, asked for %r — NOT pressed" % (idle, landed, target))
os.sync()
answer(True, idle, target)
PYEOF
}

# Which slot currently leads to a project (or nothing). The caller needs this
# to know which slot is IDLE before it re-points one.
do_slot_of() { # project-id
    [ -n "${1:-}" ] || die "slot-of needs a project id"
    python3 - "$LIBRARY_DIR" "$1" <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl
i = sl.slot_of_project(sys.argv[1], sys.argv[2])
print(-1 if i is None else i)
PYEOF
}

# Migrate anything still living IN the library into the store, then sync.
# Runs from launch.sh before set-swap enters, i.e. while Move is down and the
# library is at its own path. Idempotent: a migrated library has nothing to
# move and the sync finds nothing to do.
do_library_sync() {
    python3 - "$LIBRARY_DIR" "$PROJECTS_DIR" <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl
import project_pad as pp
moved, conflicts = sl.migrate(sys.argv[1], sys.argv[2])
# ⭐ Give every project its own PICKER PAD, once, copied from the index it
# already had — so the picker does not move by a single pad. Idempotent; a
# project that already has one is left alone. Runs here because this is the
# Move-is-down window and every project is in the store by the line above.
for _pid in pp.migrate_pads(sys.argv[2], sl.project_ids(sys.argv[2])):
    print("project-cmd: pad: %s carried its picker pad across" % _pid)
for p in moved:
    print("project-cmd: library: migrated %s into the project store" % p)
for p in conflicts:
    # Both a store project and a library directory carry this id. Merging them
    # would silently pick a winner over a user's work, so neither is touched;
    # the library copy stays put and repair-indices never sees it.
    print("project-cmd: library: WARNING %s exists in BOTH the store and the "
          "library — left in the library, not merged" % p)
PYEOF
    sync_library
}

do_list() {
    python3 - "$PROJECTS_DIR" "$SETTINGS_JSON" "$OUT_JSON" <<'PYEOF'
import json, os, re, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
import state_subdir as ss
projects_dir, settings, out = sys.argv[1], sys.argv[2], sys.argv[3]
cur = 0
try:
    m = re.search(r'"currentSongIndex":\s*(-?\d+)', open(settings).read())
    if m: cur = int(m.group(1))
except OSError:
    pass
projects = []
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
if os.path.isdir(projects_dir):
    for u in sorted(os.listdir(projects_dir)):
        p = os.path.join(projects_dir, u)
        if not os.path.isdir(p) or not uuid_re.match(u):
            continue
        # ⚠ TWO children since Phase B: Move's inner <Name>/ AND the state
        # dir. Filter, or the project can list under the state dir's name.
        names = ss.inner_dirs(p)
        name = names[0] if names else u[:8]
        idx = None
        color = None
        if hasattr(os, "getxattr"):
            try:
                idx = pp.pad_of(p)
            except (OSError, ValueError):
                pass
            # Palette index into the picker's PROJECT_COLORS table; absent =
            # null = the default color. Lives on the uuid dir beside
            # the picker pad so it travels with the project through the
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
    python3 - "$PROJECTS_DIR" "${1:-}" <<'PYEOF'
import json, os, re, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
import state_subdir as ss

projects_dir, only = sys.argv[1], sys.argv[2]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')

def song_path(uuid_dir):
    """The project's Song.abl, via its single inner set dir.

    ⚠ Skips the state dir — a sibling of Move's inner <Name>/ dir, not a set."""
    n = ss.song_folder(uuid_dir)
    return os.path.join(uuid_dir, n, ss.SONG_FILE) if n else None

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
for u in sorted(os.listdir(projects_dir)):
    p = os.path.join(projects_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    if want_index is not None:
        try:
            if pp.pad_of(p) != want_index:
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
# ---- a new project starts with Full Velocity OFF ----------------------------
# Josh, 2026-08-24: "move sets have a fixed velocity setting. i want to make sure
# that is always off by default when new sets are created."
#
# ⚠ It is Move's GLOBAL setting (`isFullVelocityOn` in Settings.json), not a
# per-set field — there is nothing in Song.abl to carry it. So a new project
# cannot own the value; the best we can do is clear it at creation, which is
# what "off by default when new sets are created" asks for.
#
# ⚠⚠ And it can be clobbered: Move rewrites Settings.json on SIGTERM, so a value
# written while Move is running is lost if Move exits without re-reading it.
# That is the same exposure every Settings.json write in this file has (see
# write_song_index and the launcher deferral) — worth knowing, not worth a
# relaunch for a velocity toggle.
clear_full_velocity() {
    [ -f "$SETTINGS_JSON" ] || return 0
    python3 - "$SETTINGS_JSON" <<'PYEOF' || true
import json, os, sys
p = sys.argv[1]
try:
    with open(p) as f:
        cfg = json.load(f)
except (OSError, ValueError):
    sys.exit(0)                      # never block creation over a toggle
if cfg.get("isFullVelocityOn") is False:
    sys.exit(0)                      # already off — do not rewrite the file
cfg["isFullVelocityOn"] = False
tmp = p + ".fvtmp"
with open(tmp, "w") as f:
    json.dump(cfg, f, indent=4)
    f.flush()
    os.fsync(f.fileno())
os.rename(tmp, p)
PYEOF
}

# ---- a new project starts in a random key ------------------------------------
# Josh, 2026-08-24. Key and scale are per-project DSP state, not something the
# Song.abl carries, and the DSP's own defaults (A minor) are compiled in — so a
# fresh project cannot be born in a random key from here. What CAN be done here
# is leave a note: the module reads it on the first load of that project,
# applies it, and deletes it. One marker, consumed once.
#
# ⚠ Written into the project's own state dir, so it travels with the project
# and dies with it — a copy of a project is NOT a new project and must not be
# re-randomised, which is exactly what a marker in a shared location would do.
# ⚠⚠ This is usually the FIRST thing to create the state dir, so it goes
# through the chooser: a plain mkdir of `dAVEBOx` here is exactly the bug that
# opened an empty Move set on some pads (it listed before the song folder).
seed_random_key() { # set-dir
    python3 - "$1" <<'PYEOF' || true
import json, os, random, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import state_subdir as ss
try:
    d = os.path.join(sys.argv[1], ss.ensure_state_subdir(sys.argv[1]))
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
    _dst="$PROJECTS_DIR/$_uuid/$1"
    mkdir -p "$_dst"
    # The template contains one <Name>/Song.abl; take the Song.abl regardless
    # of the template's own inner name.
    _src="$(find "$TEMPLATE_DIR" -name Song.abl | head -n 1)"
    [ -n "$_src" ] || die "template has no Song.abl"
    cp "$_src" "$_dst/Song.abl"
    # Random stock instruments, like Move native does on a new set.
    # After the copy (there is a file), before normalize (which re-reads it).
    randomize_instruments "$_dst/Song.abl"
    seed_random_key "$PROJECTS_DIR/$_uuid"
    clear_full_velocity
    # Belt and braces: the template ships neutral, but a project is born here
    # and this is the one place that can promise it.
    do_normalize >/dev/null

    _idx="$(python3 - "$PROJECTS_DIR" "$_uuid" "$DBX_PALETTE_N" <<'PYEOF'
import os, re, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
projects_dir, new_uuid, palette_n = sys.argv[1], sys.argv[2], int(sys.argv[3])
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
top = -1
for u in os.listdir(projects_dir):
    p = os.path.join(projects_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u) or u == new_uuid:
        continue
    if hasattr(os, "getxattr"):
        try:
            _pad = pp.pad_of(p)
            if _pad is not None:
                top = max(top, _pad)
        except (OSError, ValueError):
            pass
nxt = top + 1
if hasattr(os, "setxattr"):
    try:
        pp.set_pad(os.path.join(projects_dir, new_uuid), nxt)
        os.setxattr(os.path.join(projects_dir, new_uuid), "user.dbx-color", str(nxt % palette_n).encode())
    except OSError:
        pass
print(nxt)
PYEOF
)"
    # The project exists; give it its slot before the switch takes Move
    # through the library looking for it.
    sync_library
    printf 'project-cmd: created "%s" (%s) at index %s\n' "$1" "$_uuid" "$_idx"
    do_switch "$_idx"
}

do_switch() { # index
    case "${1:-}" in *[!0-9]*|"") die "switch needs a numeric index" ;; esac
    # S5 (Fix E of the 2026-09-14 new-project plan): refuse rather than queue
    # a SECOND relaunch. A relaunch already in flight means launch.sh's
    # supervisor loop is about to consume relaunch_song_index/relaunch_patch.sh
    # and kill Move out from under us — a second writer here would either be
    # silently clobbered by the one already in flight (losing this switch) or
    # clobber IT (losing whatever it queued, e.g. a `new` mid-relaunch: `new`
    # ends by calling do_switch itself, which is exactly how a create-during-
    # relaunch race would otherwise slip through undetected).
    if [ -f "$DBX_DIR/relaunch_requested" ]; then
        die "a relaunch is already queued (relaunch_requested exists) — refusing to queue a second one"
    fi
    save_song
    # ⚠ Do NOT write currentSongIndex here: Move is still alive, and its
    # SIGTERM teardown saves Settings.json — overwriting the value with its
    # own stale in-memory index (observed on hardware 2026-08-06: the fresh
    # session then booted into an unmatched set, `__pending-*`). The launcher
    # applies this file to Settings.json AFTER Move has exited, which is the
    # same ordering the host's own set-page change uses.
    # ⚠⚠ TRANSLATE THE PAD TO A SLOT. The caller names a PICKER PAD; Move boots
    # into `currentSongIndex` of the library it can see, which holds the two
    # slots. Writing the pad would name a position that does not exist and Move
    # would open its own default song — which is exactly what a stale index did
    # on hardware. Every caller keeps passing a pad; the translation lives here
    # so none of them has to know.
    printf '%s\n' "$(boot_slot_for_pad "$1")" > "$DBX_DIR/relaunch_song_index"
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
    mkdir -p "$PROJECTS_DIR/$_uuid/$_name"
    cp "$_src" "$PROJECTS_DIR/$_uuid/$_name/Song.abl"
    # Random stock instruments, like Move native does on a new set.
    # After the copy (there is a file), before normalize (which re-reads it).
    randomize_instruments "$PROJECTS_DIR/$_uuid/$_name/Song.abl"
    seed_random_key "$PROJECTS_DIR/$_uuid"
    clear_full_velocity
    python3 -c "import os,sys
sys.path.insert(0, os.environ['DBX_PY_DIR'])
import project_pad as pp
pp.set_pad(sys.argv[1], int(sys.argv[2]))" \
        "$PROJECTS_DIR/$_uuid" "$1" 2>/dev/null || true
    # Default colour: round-robin by pad (see DBX_PALETTE_N). Same best-effort
    # shape as the index above — a project without the xattr is simply colour 0.
    python3 -c "import os,sys; os.setxattr(sys.argv[1], 'user.dbx-color', str(int(sys.argv[2]) % int(sys.argv[3])).encode())" \
        "$PROJECTS_DIR/$_uuid" "$1" "$DBX_PALETTE_N" 2>/dev/null || true
    # Provenance parity (Fix D, S2): Move's OWN xattrs, mirroring the SAME
    # colour value just chosen above. See stamp_move_xattrs for why.
    stamp_move_xattrs "$PROJECTS_DIR/$_uuid" "$(( $1 % DBX_PALETTE_N ))"
    do_normalize "$1" >/dev/null
    sync_library
    do_list
    printf 'project-cmd: created "%s" (%s) at index %s\n' "$_name" "$_uuid" "$1"
}

# Duplicate a project onto another pad. Inner name gets Move's own " Copy"
# suffix so the hosted module's copy-inheritance machinery (family lookup on
# first open) treats it exactly like a native pad-copy.
do_copy() { # src-index dst-index
    case "${1:-}" in *[!0-9]*|"") die "copy needs a numeric source index" ;; esac
    case "${2:-}" in *[!0-9]*|"") die "copy needs a numeric destination index" ;; esac
    python3 - "$PROJECTS_DIR" "$1" "$2" <<'PYEOF'
import datetime, os, re, shutil, sys, uuid as uuidlib
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
import state_subdir as ss
projects_dir, src, dst = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
def find(idx):
    for u in os.listdir(projects_dir):
        p = os.path.join(projects_dir, u)
        if not os.path.isdir(p) or not uuid_re.match(u):
            continue
        try:
            if pp.pad_of(p) == idx:
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
# it (<uuid>/<state>/, Phase B of the state-co-location plan), so the
# duplicate is a snapshot BY CONSTRUCTION — the hand-copied module-state seeding
# that used to live here, and the silently-tracks-its-source bug it fixed
# (Josh, hardware, 2026-08-11), are both structurally impossible now.
# The inner set dir is renamed to "<Name> Copy" AFTER the copy; the reserved
# state subdir is skipped when hunting it (it is a sibling, not a set).
nu = str(uuidlib.uuid4())
np = os.path.join(projects_dir, nu)
shutil.copytree(sp, np)
inner = ss.inner_dirs(np)
if not inner:
    shutil.rmtree(np)
    sys.exit("project-cmd: ERROR: source has no inner set dir")
os.rename(os.path.join(np, inner[0]), os.path.join(np, inner[0] + " Copy"))
# " Copy" is a NEW song name, so it can list on the other side of the copied
# state dir — re-run the order rule, or the duplicate opens as an empty set.
moved = ss.fix_state_order(np)
if moved:
    print("project-cmd: copy: state dir %s -> %s (lists after the song)" % moved)
# copytree carries the INNER tree but not the OUTER dir's xattrs — index and
# color are the outer dir's, so set by hand.
pp.set_pad(np, dst)
try:
    os.setxattr(np, "user.dbx-color", os.getxattr(sp, "user.dbx-color"))
except OSError:
    pass
# Provenance parity (Fix D, S2): stamp Move's OWN xattrs too — see
# stamp_move_xattrs (this file, shell side) for the reference shape and why.
# Mirror whatever colour dAVEBOx just settled on above (0 if the source had
# none), same as do_new_at does for a brand-new project.
try:
    _color = os.getxattr(np, "user.dbx-color").decode()
except OSError:
    _color = "0"
os.setxattr(np, "user.song-color", _color.encode())
os.setxattr(np, "user.last-modified-time",
            datetime.datetime.now(datetime.timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%SZ").encode())
os.setxattr(np, "user.local-cloud-state", b"notSynced")

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
    sync_library
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
    # The session comes back on the PICKER with nothing chosen (`reselect`) —
    # Josh, 2026-09-05: "deleting an active session ... automatically loads
    # another project. it shouldn't. it should land on project manager page
    # with nothing loaded." Until then it auto-landed on the lowest remaining
    # project, which read as the delete having picked a project for you.
    # The lowest remaining index is STILL written when one exists, because Move
    # itself needs a valid boot set underneath the picker (its own index would
    # otherwise name the set we just removed); the marker is what keeps davebox
    # from loading it — the same shape as a fresh install. The guard below still
    # stands for every path that has NOT arranged this — it is the accident that
    # is refused, not the intent.
    # ⭑⭑ THE CALLER SAYS which project is open; the boot record is a FALLBACK.
    #
    # dAVEBOx knows what it has loaded. This script was re-deriving the same
    # answer from active_set.txt, which since 2026-09-16 is written ONLY once
    # Move has confirmed a project -- so in an unconfirmed window it is stale
    # or silent, and the fall-through is the IMMEDIATE path: removing the
    # directory underneath a live session. Two independent deciders for one
    # question is the shape that caused the loss this work exists to fix, and
    # fixing only the JS half would have left this one still guessing.
    _open_del="${DBX_OPEN_UUID:-}"
    [ -z "$_open_del" ] && [ -f "$ACTIVE_SET_PATH" ] && \
        _open_del="$(head -n 1 "$ACTIVE_SET_PATH" | tr -d '[:space:]')"
    _open_del="$(resolve_open_project "$_open_del")"
    if [ -n "$_open_del" ] && [ -d "$PROJECTS_DIR/$_open_del" ] && \
       [ "$(song_index "$PROJECTS_DIR/$_open_del")" = "$1" ]; then
        _next_idx="$(python3 - "$PROJECTS_DIR" "$_open_del" <<'PYEOF'
import os, re, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
projects_dir, skip = sys.argv[1], sys.argv[2]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
idxs = []
for u in os.listdir(projects_dir):
    if u == skip or not uuid_re.match(u):
        continue
    p = os.path.join(projects_dir, u)
    if not os.path.isdir(p):
        continue
    try:
        _pad = pp.pad_of(p)
        if _pad is not None:
            idxs.append(_pad)
    except (OSError, ValueError):
        pass
print(min(idxs) if idxs else -1)
PYEOF
)"
        save_song
        # ⭑ rm -rf, not rmtree-in-python: this line is executed by the LAUNCHER
        # long after this script is gone. Quote it the way do_rename quotes its
        # mv — a set directory is a uuid, but $PROJECTS_DIR need not be innocent.
        printf 'rm -rf %s\n' \
            "'$(printf '%s' "$PROJECTS_DIR/$_open_del" | sed "s/'/'\\\\''/g")'" \
            >> "$DBX_DIR/relaunch_patch.sh"
        # …and the slot that showed it. `rm -f` on a SYMLINK removes the link
        # and never the project — but the project is gone by this line anyway,
        # and the next launch's library sync would drop the dangling slot in
        # any case. This is here so the library is never momentarily showing a
        # project that no longer exists, which is what Move would enumerate on
        # the relaunch that follows.
        printf 'rm -f %s\n' \
            "'$(printf '%s' "$LIBRARY_DIR/$_open_del" | sed "s/'/'\\\\''/g")'" \
            >> "$DBX_DIR/relaunch_patch.sh"
        # ⚠ sync AFTER the rm, in the same deferred script — an unsynced rmtree
        # can be undone by journal replay after a power cut (Josh, hardware,
        # 2026-08-12), and that lesson does not stop applying because the delete
        # moved into the launcher.
        printf 'sync\n' >> "$DBX_DIR/relaunch_patch.sh"
        # ⚠ A SLOT, not the pad. `_next_idx` is the lowest remaining PICKER
        # PAD; Move needs the position in ITS library.
        if [ "$_next_idx" -ge 0 ] 2>/dev/null; then
            printf '%s\n' "$(boot_slot_for_pad "$_next_idx")" > "$DBX_DIR/relaunch_song_index"
        fi
        # …and the deleted project's slot leads nowhere until something
        # re-points it. The launcher applies this patch before Move restarts,
        # which is exactly the window: a relaunch does NOT run the launch-time
        # sync, so without this Move enumerates a slot pointing at a project
        # that no longer exists.
        printf 'sh %s library-sync\n' \
            "'$(printf '%s' "$DBX_PY_DIR/project-cmd.sh" | sed "s/'/'\\\\''/g")'" \
            >> "$DBX_DIR/relaunch_patch.sh"
        : > "$DBX_DIR/relaunch_reselect"
        : > "$DBX_DIR/relaunch_requested"
        setsid sh -c '
          sleep 1
          pkill -x MoveOriginal
        ' >/dev/null 2>&1 &
        printf 'project-cmd: delete of OPEN project queued (Move restarting in place)\n'
        return 0
    fi
    python3 - "$PROJECTS_DIR" "$SETTINGS_JSON" "$1" "$_open_del" <<'PYEOF'
import os, re, shutil, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
projects_dir, settings, idx = sys.argv[1], sys.argv[2], int(sys.argv[3])
# ⭐ Handed in ALREADY RESOLVED to a project id (resolve_open_project). It used
# to read active_set.txt itself, which carries the library ENTRY — a slot id —
# so it matched no project and reported "nothing is open", which is the
# dangerous direction: it permits deleting the project that is live.
open_project = sys.argv[4] if len(sys.argv) > 4 else ""


def open_uuid():
    return open_project


def index_of(uuid):
    if not uuid:
        return -1
    p = os.path.join(projects_dir, uuid)
    # ⚠ -1, never None: the caller compares this numerically against
    # currentSongIndex, and `None < 0` is a TypeError rather than a falsy — it
    # would abort the delete instead of falling through to the Settings.json
    # fallback. pad_of() answers None for "this project has no pad".
    _pad = pp.pad_of(p)
    return -1 if _pad is None else _pad


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
for u in os.listdir(projects_dir):
    p = os.path.join(projects_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if pp.pad_of(p) == idx:
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
    sync_library
    do_list
}

# Set (or clear, with n < 0) the pad color for a project. The value is an
# index into the picker's palette table, not an LED code — the module owns
# what the numbers look like.
do_color() { # index n
    case "${1:-}" in *[!0-9]*|"") die "color needs a numeric index" ;; esac
    case "${2:-}" in -*|[0-9]*) ;; *) die "color needs a numeric value" ;; esac
    python3 - "$PROJECTS_DIR" "$1" "$2" <<'PYEOF'
import os, re, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
projects_dir, idx, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(projects_dir):
    p = os.path.join(projects_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if pp.pad_of(p) != idx:
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

    _found="$(python3 - "$PROJECTS_DIR" "$1" <<'PYEOF'
import os, re, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
import state_subdir as ss
projects_dir, idx = sys.argv[1], int(sys.argv[2])
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(projects_dir):
    p = os.path.join(projects_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if pp.pad_of(p) != idx:
            continue
    except (OSError, ValueError):
        continue
    inner = ss.inner_dirs(p)
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

    # Same rule as do_delete: the caller's word first, the boot record second.
    _open="${DBX_OPEN_UUID:-}"
    [ -z "$_open" ] && [ -f "$ACTIVE_SET_PATH" ] && \
        _open="$(head -n 1 "$ACTIVE_SET_PATH" | tr -d '[:space:]')"
    _open="$(resolve_open_project "$_open")"
    if [ "$_uuid" = "$_open" ]; then
        # OPEN project: defer the mv to the launcher (post-exit), then restart
        # Move in place at the same index — do_switch's exact shape. Append to
        # relaunch_patch.sh rather than clobbering a pending patch.
        save_song
        {
            printf 'mv %s %s\n' \
                "'$PROJECTS_DIR/$_uuid/$(printf '%s' "$_old" | sed "s/'/'\\\\''/g")'" \
                "'$PROJECTS_DIR/$_uuid/$(printf '%s' "$2"   | sed "s/'/'\\\\''/g")'"
            # The new name can list on the other side of the state dir; the
            # launcher also sweeps fix-order after every patch, this names it.
            printf 'sh %s fix-order %s\n' \
                "'$(printf '%s' "$DBX_PY_DIR/project-cmd.sh" | sed "s/'/'\\\\''/g")'" "'$_uuid'"
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

    mv "$PROJECTS_DIR/$_uuid/$_old" "$PROJECTS_DIR/$_uuid/$2"
    # A new song name can list on the other side of the state dir: re-order.
    python3 -c 'import os,sys; sys.path.insert(0, os.environ["DBX_PY_DIR"]); import state_subdir as ss
m = ss.fix_state_order(sys.argv[1])
if m: print("project-cmd: rename: state dir %s -> %s (lists after the song)" % m)' "$PROJECTS_DIR/$_uuid" \
        || printf 'project-cmd: WARNING: rename: state-dir order check failed\n' >&2
    printf 'project-cmd: renamed index %s to "%s"\n' "$1" "$2"
    do_list
}

# (do_prune is GONE — Phase C. It reclaimed orphaned HOST state dirs from the
# parallel $DBX_DIR/set_state root, with a four-root liveness test and a
# refuse-rather-than-guess sweep, because a deleted set could leave its routing
# behind. Both state halves live inside the set dir now: no parallel root, no
# orphan, nothing to reclaim. Devices that ran older builds may hold inert
# leftovers under $DBX_DIR/set_state — KB-scale history, harmless.)

# Launch-time index/orphan repair (Fix C of the 2026-09-14 new-project plan).
# Called from launch.sh in the SAME Move-not-running window as `normalize` —
# the only window a set dir can be renamed/moved without a live Move's own
# save clobbering the change or the OS refusing a busy directory.
#
# WHAT IT FIXES: the PICKER PAD (project_pad.py), for BOTH dAVEBOx's own
# picker and the way Move itself resolves currentSongIndex — but Move can
# mint a set of its OWN out-of-band (CLAUDE.md's "dAVEBOx owns project
# management" section; out-of-band mutation is not defended against, only
# repaired here) and happen to land on the SAME index as an existing dAVEBOx
# project. Two set dirs sharing one index is exactly the failure this plan
# traced: the picker shows one, Move may resolve the other, and a save can
# land in the wrong project.
#
# PROVENANCE: a project is dAVEBOx's own if it carries the `user.dbx-color`
# xattr OR a `<uuid>/<state>/new-project.json` file — every project
# do_new/do_new_at/do_copy creates leaves one or the other (seed_random_key
# always writes new-project.json; the color xattr is best-effort). A project
# sharing an index with one of those, that is NEITHER, is the Move-born
# stray — IT moves, to the lowest free pad (0..31 — davebox/ui/ui_state.mjs:
# "32 pads = project slots"), never the dAVEBOx project: the dAVEBOx picker's
# pad assignment is the one the user actually sees and chose.
#
# ORPHANS (not a collision, just unusable, and quarantined regardless of any
# index): `__pending-*` dirs (an interrupted native creation) and uuid dirs
# with no Song.abl anywhere inside them. Moved WHOLE, name preserved, to
# $DBX_DIR/sets/quarantine/<YYYYMMDD>/ — NEVER deleted, so a human can always
# recover one by hand. `DO-NOT-EDIT.txt` (a file, not a project dir) and any
# other non-directory entry are skipped outright.
#
# Idempotent: a rerun over an already-repaired library finds nothing to do —
# the strays now hold unique indices, and the orphans are no longer inside
# the store to be found again. Parse-only unless something is actually wrong,
# so a healthy library costs one directory listing and logs NOTHING — same
# "silent when there is nothing to say" shape `do_normalize` already has.
do_repair_indices() {
    python3 - "$PROJECTS_DIR" "$DBX_DIR" <<'PYEOF'
import datetime, os, re, shutil, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import project_pad as pp
import state_subdir as ss

projects_dir, dbx_dir = sys.argv[1], sys.argv[2]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
NUM_PADS = 32   # davebox/ui/ui_state.mjs: "32 pads = project slots"


def has_song(uuid_dir):
    """A Song.abl under any non-state inner dir — do_normalize's rule."""
    return ss.song_folder(uuid_dir) is not None


def is_dbx_owned(uuid_dir):
    st = ss.state_subdir(uuid_dir)
    if st and os.path.exists(os.path.join(uuid_dir, st, "new-project.json")):
        return True
    if hasattr(os, "getxattr"):
        try:
            os.getxattr(uuid_dir, "user.dbx-color")
            return True
        except OSError:
            pass
    return False


def song_index(p):
    try:
        return pp.pad_of(p)
    except (OSError, ValueError):
        return None


if not os.path.isdir(projects_dir):
    sys.exit(0)

orphans = []     # (name, path)
projects = []    # (name, path, index_or_None, dbx_owned)

for n in sorted(os.listdir(projects_dir)):
    if n == "DO-NOT-EDIT.txt":
        continue
    p = os.path.join(projects_dir, n)
    if not os.path.isdir(p):
        continue
    if n.startswith("__pending-") or not uuid_re.match(n):
        orphans.append((n, p))
        continue
    if not has_song(p):
        orphans.append((n, p))
        continue
    projects.append((n, p, song_index(p), is_dbx_owned(p)))

used = set(idx for _n, _p, idx, _o in projects if idx is not None)

# Group by index so one collision cannot chase the free-index search's own
# tail as it fills gaps.
by_index = {}
for n, p, idx, owned in projects:
    if idx is not None:
        by_index.setdefault(idx, []).append((n, p, owned))

moves = []   # (path, old_index)
for idx, group in sorted(by_index.items()):
    if len(group) < 2 or not any(owned for _n, _p, owned in group):
        continue   # no collision, or a collision with no dAVEBOx side — not ours to arbitrate
    for n, p, owned in group:
        if not owned:
            moves.append((p, idx))

repaired = 0
for p, old_idx in moves:
    new_idx = 0
    while new_idx in used and new_idx < NUM_PADS:
        new_idx += 1
    if new_idx >= NUM_PADS:
        print("project-cmd: repair-indices: WARNING no free pad for %s (index %d)" % (p, old_idx))
        continue
    pp.set_pad(p, new_idx)
    used.add(new_idx)
    repaired += 1
    print("project-cmd: repair-indices: moved %s from index %d to %d" % (os.path.basename(p), old_idx, new_idx))

quarantined = 0
if orphans:
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    qdir = os.path.join(dbx_dir, "sets", "quarantine", stamp)
    for n, p in orphans:
        os.makedirs(qdir, exist_ok=True)
        dest = os.path.join(qdir, n)
        if os.path.exists(dest):
            dest = dest + "-" + str(int(datetime.datetime.now().timestamp() * 1000))
        shutil.move(p, dest)
        quarantined += 1
        print("project-cmd: repair-indices: quarantined %s -> %s" % (n, dest))

# STATE-DIR ORDER (set-folder order fix, S7): a project whose state dir lists
# BEFORE its song folder opens as an empty Move set — Move takes the first
# subfolder. Projects made before the fix, or copied/renamed by Move itself,
# are renamed here to the first name that lists after. Same window as the rest
# of this function: Move is down, so nothing holds the directory.
reordered = ss.fix_library_order(projects_dir)
for u, old, new in reordered:
    print("project-cmd: repair-indices: %s state dir %s -> %s (listed before the song)" % (u, old, new))

if repaired or quarantined or reordered:
    os.sync()
    print("project-cmd: repair-indices: %d project(s) checked, %d re-indexed, %d quarantined, %d re-ordered"
          % (len(projects), repaired, quarantined, len(reordered)))
PYEOF
    # Quarantine MOVES a project out of the store, so the library can be left
    # showing a slot with nothing behind it. Reconcile.
    sync_library
}

# Re-order state dirs that list before their song folder — one project, or the
# whole library. The same pass repair-indices ends with, as its own verb for
# the launcher's relaunch branch: a rename of the OPEN project is applied by
# relaunch_patch.sh after Move exits, and the new song name may list on the
# other side of the state dir. ⚠ Only while Move is not running.
do_fix_order() { # [uuid]
    python3 - "$PROJECTS_DIR" "${1:-}" <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import state_subdir as ss
moved = ss.fix_library_order(sys.argv[1], sys.argv[2] or None)
for u, old, new in moved:
    print("project-cmd: fix-order: %s state dir %s -> %s (listed before the song)" % (u, old, new))
if moved:
    os.sync()
PYEOF
}

# ⚠⚠ REFUSE TO TOUCH THE USER'S OWN LIBRARY — re-scoped, NOT removed.
#
# It used to read "refuse unless set-swap has the bind mount on", because every
# verb operated on Sets/ and that path is the PROJECT library only while the
# mount is up. With no session the same path is the user's NATIVE Move library
# — his own sets, sitting underneath the mount untouched — and `delete` there
# is irreversible. It is not hypothetical: on 2026-09-20 `list` was run with no
# session and returned the native sets (Set 29, and Move's factory demos),
# writing them into projects.json as though they were dAVEBOx projects;
# scratch projects were about to be created the same way, and a file had
# already been moved inside one of those real sets earlier the same evening.
#
# ⭐ The verbs no longer operate on Sets/ at all. They operate on $PROJECTS_DIR
# and write slots into $LIBRARY_DIR, both of which are ours whatever is
# mounted, so "is a session up" has stopped being the question — gating on it
# now only refuses legitimate work outside a session.
#
# What replaces it is the thing the old guard was really protecting, stated
# directly and checked ALWAYS rather than only when a session is down:
# **neither root may be, or live inside, the user's own Move library.** That
# holds for a misconfigured $PROJECTS_DIR, a misconfigured $LIBRARY_DIR and a
# future caller that has not read this file — none of which the mount check
# could see.
#
# ⚠ MATCH THE PATH POSITIVELY, prefix by prefix. The first cut of the old
# guard grepped for "bound" in set-swap's status, and "not bound" CONTAINS
# "bound" — so it reported every unbound library as bound and created a
# project in the user's native library while claiming to protect it
# (2026-09-21 01:24, recovered). A containment test is not a prefix test:
# compare against the root and the root plus a separator, nothing looser.
DBX_NATIVE_LIBRARY="${DBX_NATIVE_LIBRARY:-/data/UserData/UserLibrary}"
_not_native() { # role path
    case "$2" in
        "$DBX_NATIVE_LIBRARY"|"$DBX_NATIVE_LIBRARY"/*)
            die "refusing to $1: $2 is inside the user's own Move library
     ($DBX_NATIVE_LIBRARY). dAVEBOx projects live in their own root; nothing
     here may write into the library Move keeps the user's native sets in." ;;
    esac
}
_require_own_tree() { # verb
    _not_native "$1" "$PROJECTS_DIR"
    _not_native "$1" "$LIBRARY_DIR"
}

case "${1:-}" in
    list)   do_list ;;
    new) _require_own_tree new; shift; do_new "${1:-}" ;;
    new-at) _require_own_tree new-at; shift; do_new_at "${1:-}" "${2:-}" ;;
    copy) _require_own_tree copy; shift; do_copy "${1:-}" "${2:-}" ;;
    delete) _require_own_tree delete; shift; do_delete "${1:-}" ;;
    switch) shift; do_switch "${1:-}" ;;
    color) _require_own_tree color; shift; do_color "${1:-}" "${2:-}" ;;
    normalize) _require_own_tree normalize; shift; do_normalize "${1:-}" ;;
    library-sync) _require_own_tree library-sync; do_library_sync ;;
    point) _require_own_tree point; shift; do_point "${1:-}" "${2:-}" ;;
    slot-of) shift; do_slot_of "${1:-}" ;;
    switch-slot) _require_own_tree switch-slot; shift; do_switch_slot "${1:-}" "${2:-}" ;;
    rename) _require_own_tree rename; shift; do_rename "${1:-}" "${2:-}" "${3:-}" ;;
    repair-indices) _require_own_tree repair-indices; do_repair_indices ;;
    fix-order) _require_own_tree fix-order; shift; do_fix_order "${1:-}" ;;
    *) die "usage: project-cmd.sh list|new <name>|new-at <index> [name]|copy <src> <dst>|delete <index>|switch <index>|color <index> <n>|rename <index> <name>|library-sync|repair-indices|fix-order [uuid]" ;;
esac
