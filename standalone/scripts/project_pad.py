"""project_pad.py — the ONE place that knows where a project's PICKER PAD lives.

A project has two numbers that used to be the same one, and the whole reason
this module exists is that they are about to stop being the same one.

  · **the picker pad** (0..31) — which pad in dAVEBOx's OWN project picker this
    project sits on. The user chose it. It is ours, it means nothing to Move,
    and it must survive anything we do to the set library.
  · **the slot index** (`user.song-index`) — where Move orders this directory
    in the one set library it can see.

They coincide today only because the library presents every project as its own
set, in pad order. Under two slots the library presents exactly TWO sets, so
`user.song-index` collapses to {0,1} on whichever projects the two slots point
at — and if the picker pad were still that same xattr, **every switch would
silently renumber the pads of the projects it touched**.

⚠ So: `user.song-index` is Move's. `user.dbx-pad` is ours. This module is the
only thing in the tree that spells the second one — `check-config.sh` pins that,
and `tests/host/test_project_pad_readers.sh` fails if a second speller appears.
Everything else calls `pad_of` / `set_pad` / `clear_pad`.

⭑ Precedent: `user.dbx-color` already works exactly this way — a dAVEBOx-owned
xattr on the project directory that travels with the project through a copy and
dies with it on delete, because it lives on the directory the operation moves.

⚠ Best-effort, like every xattr write in this tree: a filesystem without
`user.*` support (macOS in the test suite, tmpfs before 6.6) makes every write a
no-op and every read a None. A project without a pad is not broken — it sorts
last and `repair-indices` gives it a free pad on the next launch. Never let a
missing pad fail an operation the user asked for.
"""
import os

# ⚠ THE ONE SPELLING. Pinned by check-config.sh against this file, and by
# tests/host/test_project_pad_readers.sh against the whole tree.
PAD_XATTR = "user.dbx-pad"

# Move's own ordering xattr. Named here ONLY so the migration can read it;
# nothing in this module writes it, because it is not ours to write.
SONG_INDEX_XATTR = "user.song-index"


def _get_int(path, name):
    try:
        return int(os.getxattr(path, name).decode())
    except (OSError, ValueError, AttributeError):
        # AttributeError: os.getxattr does not exist on macOS, where the host
        # suite runs. A platform without xattrs answers "no pad", not "crash".
        return None


def pad_of(project_dir):
    """This project's picker pad, or None if it has not got one."""
    return _get_int(project_dir, PAD_XATTR)


def set_pad(project_dir, pad):
    """Put this project on a pad. Returns True if it landed."""
    try:
        os.setxattr(project_dir, PAD_XATTR, str(int(pad)).encode())
        return True
    except (OSError, ValueError, AttributeError):
        return False


def clear_pad(project_dir):
    try:
        os.removexattr(project_dir, PAD_XATTR)
    except (OSError, AttributeError):
        pass


def song_index_of(project_dir):
    """Move's ordering index for this directory, or None.

    Read-only on purpose. The slot index is Move's view of the library and, from
    the next phase, `library_slots.py`'s to write — never a project verb's.
    """
    return _get_int(project_dir, SONG_INDEX_XATTR)


def migrate_pads(projects_dir, project_ids):
    """Give every project a picker pad, once, from the index it already had.

    Before this module the picker pad WAS `user.song-index`, so the existing
    value is exactly the pad the user is looking at — copy it across and the
    picker does not move by a single pad.

    Idempotent: a project that already has a pad is left alone, so a rerun (or a
    launch after a half-finished one) changes nothing. Returns the ids migrated.

    ⚠ A project with neither xattr gets nothing and stays unindexed, which is
    the state `do_list` already sorts last and `repair-indices` already repairs.
    Inventing a pad here would be a second opinion about pad assignment, and two
    deciders for one question is the shape this project has already paid for.
    """
    moved = []
    for pid in project_ids:
        p = os.path.join(projects_dir, pid)
        if pad_of(p) is not None:
            continue
        idx = song_index_of(p)
        if idx is None:
            continue
        if set_pad(p, idx):
            moved.append(pid)
    return moved
