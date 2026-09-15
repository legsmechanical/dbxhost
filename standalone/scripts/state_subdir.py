"""state_subdir.py — the ONE shell-side rule for naming a project's state dir.

A dAVEBOx project is `Sets/<uuid>/{<Name>/, <state>/}`: Move's song folder and
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
    device's losing hash order on a filesystem that has a different one."""
    names = os.listdir(d)
    rank = os.environ.get("DBX_TEST_DIR_ORDER")
    if rank:
        order = rank.split("|")
        known = [n for n in order if n in names]
        names = known + [n for n in names if n not in order]
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


def inner_dirs(uuid_dir):
    """Every non-state child dir, listing order — the old one-child filter."""
    return [n for n in child_dirs(uuid_dir) if not is_state_name(n)]


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
