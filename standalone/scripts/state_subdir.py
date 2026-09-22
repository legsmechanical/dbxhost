"""state_subdir.py — the ONE shell-side rule for naming a project's state dir.

A dAVEBOx project is `Sets/<uuid>/{Move-Set-<id>/, <state>/}`: Move's song folder and
dAVEBOx's state dir, side by side. Move opens the FIRST subfolder its directory
listing returns as the song. On ext4 with dir_index that order is a hash of the
name under a per-filesystem seed (measured 2026-09-14,
_worklogs/specs/2026-09-14-set-folder-order-fix-plan.md) — so a fixed state-dir
name lists BEFORE the song for roughly a fifth of all song names, and Move then
opens `dAVEBOx/` as the set and comes up empty.

So the state dir's NAME is chosen per project: `dAVEBOx` if it lists after the
song folder, else `dAVEBOx~<n>` for the first n that does. Nothing here computes
a hash — every candidate is created and the real listing is READ, so it is
correct on any filesystem, kernel or seed.

⚠ The same rule exists in C (src/host/dbx_state_subdir.h, mirrored byte-for-byte
in davebox/dsp/) for the DSP and the host UI. check-config.sh pins the pattern
and the retry bound in both. Change one, change both.

⚠ On a creation-ordered filesystem (tmpfs) no candidate ever lists after the
song, the chooser exhausts its tries and falls back to the plain name. That is
the tests' problem only; the device is ext4. The S4 "Move did not open it"
screen is the backstop if a device ever does the same.
"""
import errno
import fnmatch
import os
import re

STATE_BASE = "dAVEBOx"
STATE_NAME_RE = re.compile(r"^dAVEBOx(~[0-9]+)?$")
STATE_MAX_TRIES = 256
SONG_FILE = "Song.abl"


def is_state_name(name):
    return bool(STATE_NAME_RE.match(name))


def candidate(n):
    return STATE_BASE if n == 0 else "%s~%d" % (STATE_BASE, n)


def listdir(d):
    """os.listdir, in the order the filesystem returns — the order Move sees.

    DBX_TEST_DIR_ORDER ("a|b|c") is a TEST seam: names it lists come back in
    that order, ahead of everything else. It exists so a test can reproduce a
    device's losing hash order on a filesystem that has a different one. An
    entry may be a glob (`Move-Set-*`): a song folder's name carries its
    project's random id, so a test cannot spell it in advance."""
    names = os.listdir(d)
    rank = os.environ.get("DBX_TEST_DIR_ORDER")
    if rank:
        known = []
        for pat in rank.split("|"):
            known += [n for n in names if n not in known and fnmatch.fnmatchcase(n, pat)]
        names = known + [n for n in names if n not in known]
    return names


def child_dirs(uuid_dir):
    """Non-dot child directories, in listing order."""
    out = []
    for n in listdir(uuid_dir):
        if n.startswith("."):
            continue
        if os.path.isdir(os.path.join(uuid_dir, n)):
            out.append(n)
    return out


def song_folder(uuid_dir):
    """The song folder's name: a non-state child holding Song.abl, or None."""
    try:
        kids = child_dirs(uuid_dir)
    except OSError:
        return None
    for n in kids:
        if not is_state_name(n) and os.path.isfile(os.path.join(uuid_dir, n, SONG_FILE)):
            return n
    return None


# (inner_dirs is GONE: it read a project's NAME off its folder. The name is a
# tag now — project_name.py — and the folder is Move's.)


def state_subdir(uuid_dir):
    """The existing state dir's name, or None.

    More than one match should never exist; if it does, the LAST in listing
    order wins, because that is the one that can list after the song — a stray
    plain `dAVEBOx` re-created by a missed writer must not shadow a chosen
    `dAVEBOx~3`."""
    try:
        found = [n for n in child_dirs(uuid_dir) if is_state_name(n)]
    except OSError:
        return None
    return found[-1] if found else None


def lists_after(uuid_dir, name, song):
    kids = listdir(uuid_dir)
    return name in kids and song in kids and kids.index(name) > kids.index(song)


def choose_state_name(uuid_dir, song):
    """Create and return a state dir name that lists after `song`.

    Each candidate is mkdir'd and the listing read back; a loser is rmdir'd and
    the next tried. Falls back to the plain name (created) when nothing wins."""
    for n in range(STATE_MAX_TRIES):
        name = candidate(n)
        path = os.path.join(uuid_dir, name)
        try:
            os.mkdir(path)
        except OSError as e:
            if e.errno == errno.EEXIST:
                continue          # not ours to probe with (and not a state dir we own)
            raise
        if lists_after(uuid_dir, name, song):
            return name
        os.rmdir(path)
    os.makedirs(os.path.join(uuid_dir, STATE_BASE), exist_ok=True)
    return STATE_BASE


def ensure_state_subdir(uuid_dir):
    """The state dir name, creating it through the chooser when absent."""
    have = state_subdir(uuid_dir)
    if have:
        return have
    song = song_folder(uuid_dir)
    if not song:
        os.makedirs(os.path.join(uuid_dir, STATE_BASE), exist_ok=True)
        return STATE_BASE
    return choose_state_name(uuid_dir, song)


def fix_state_order(uuid_dir):
    """If the state dir lists BEFORE the song folder, rename it to a name that
    lists after. Returns (old, new) when it moved something, else None.

    ⚠ Only for a project Move is NOT holding open: launch (Move down), a copy
    that has just been made, or a rename of a closed project."""
    song = song_folder(uuid_dir)
    have = state_subdir(uuid_dir)
    if not song or not have or lists_after(uuid_dir, have, song):
        return None
    old = os.path.join(uuid_dir, have)
    for n in range(STATE_MAX_TRIES):
        name = candidate(n)
        if name == have:
            continue
        probe = os.path.join(uuid_dir, name)
        try:
            os.mkdir(probe)
        except OSError as e:
            if e.errno == errno.EEXIST:
                continue
            raise
        ok = lists_after(uuid_dir, name, song)
        os.rmdir(probe)
        if not ok:
            continue
        os.rename(old, probe)
        if lists_after(uuid_dir, name, song):
            return (have, name)
        os.rename(probe, old)     # the listing disagreed after the move: put it back
    return None


UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$")


def fix_library_order(sets_dir, only_uuid=None):
    """fix_state_order over every project dir (or just `only_uuid`).

    Returns [(uuid, old, new)] for each state dir it moved. Same window rule as
    fix_state_order: Move must not be holding any of them open."""
    moved = []
    try:
        names = [only_uuid] if only_uuid else sorted(os.listdir(sets_dir))
    except OSError:
        return moved
    for u in names:
        p = os.path.join(sets_dir, u)
        if not UUID_RE.match(u) or not os.path.isdir(p):
            continue
        try:
            m = fix_state_order(p)
        except OSError as e:
            print("project-cmd: fix-order: WARNING %s: %s" % (u, e))
            continue
        if m:
            moved.append((u, m[0], m[1]))
    return moved
