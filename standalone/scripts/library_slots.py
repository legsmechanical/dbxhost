"""library_slots.py — the ONE owner of the set library's contents.

A dAVEBOx project lives in its own root, `$DBX_DIR/projects/<id>/`, and is
shown to Move as a SLOT: a symlink of the same name inside the set library
(`$DBX_DIR/sets/library/`), which set-swap.sh bind-mounts over Move's single
`Sets/` directory for the duration of a session.

**Why the indirection.** Move has exactly one set library and its path is not
configurable, so anything we want Move to see has to be in that one directory.
Owning the projects ourselves, and presenting them through links, means every
verb that manages a project operates on a tree Move never enumerates — and, in
a later phase, that the library can hold FEWER entries than there are projects.

Three rules this module exists to keep in one place:

  1. ⚠⚠ **A slot's link is ABSOLUTE.** The library is READ at a different path
     than it LIVES at (bind-mounted over `Sets/`), so a relative link would
     resolve against the mount point: `../../projects/<id>` read through
     `/data/UserData/UserLibrary/Sets/<id>` points at
     `/data/UserData/UserLibrary/projects/<id>`, which is the user's own
     library and does not exist. Absolute links resolve identically either way.

  2. **Only ever replace a slot by rename.** Re-pointing is `symlink()` to a
     temp name then `rename()` over the old one — atomic, so a reader never
     sees the name missing.

  3. **Never touch what we do not own.** Entries that are not slot-shaped
     (the DO-NOT-EDIT notice, a real directory Move minted itself) are
     REPORTED, never removed. Deleting a project is `project-cmd delete`'s
     job; this module only keeps the view in step with the store.

⚠ Index and colour xattrs live on the PROJECT, not the slot — a symlink cannot
carry a user xattr (`PermissionError`, verified), and Move's `getxattr` follows
links (verified on hardware 2026-09-21), so it reads the target's index and
orders the slot by it.
"""
import os
import re

# A project id is the uuid string it was born with — an opaque directory name.
# Same shape the library has always used, so the migration is a move, not a
# rewrite: nothing inside a project embeds its id.
PROJECT_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$")

# The library carries this for the file surfaces we cannot filter (set-swap.sh
# writes it). It is a FILE, and it is not ours to move.
NOTICE = "DO-NOT-EDIT.txt"


def is_project_id(name):
    return bool(PROJECT_RE.match(name))


def project_ids(projects_dir):
    """Every project in the store, sorted by id."""
    try:
        names = os.listdir(projects_dir)
    except OSError:
        return []
    return sorted(n for n in names
                  if is_project_id(n) and os.path.isdir(os.path.join(projects_dir, n)))


def project_path(projects_dir, pid):
    return os.path.abspath(os.path.join(projects_dir, pid))


def point_slot(library, pid, target):
    """Create or re-point one slot. Atomic; returns True when it changed."""
    link = os.path.join(library, pid)
    try:
        if os.readlink(link) == target:
            return False
    except OSError:
        pass
    tmp = link + ".slottmp"
    try:
        os.unlink(tmp)
    except OSError:
        pass
    os.symlink(target, tmp)
    os.rename(tmp, link)            # atomic over an existing link
    return True


def sync(library, projects_dir):
    """Make the library show exactly one slot per project.

    Returns (linked, unlinked, strays): ids whose slot was created or
    re-pointed, ids whose stale slot was removed, and the names of entries
    left alone because they are not ours.
    """
    os.makedirs(library, exist_ok=True)
    ids = project_ids(projects_dir)
    linked, unlinked, strays = [], [], []

    for pid in ids:
        target = project_path(projects_dir, pid)
        link = os.path.join(library, pid)
        if os.path.lexists(link) and not os.path.islink(link):
            # A real directory sitting on the name a slot needs. Do NOT clobber
            # it — it is either an unmigrated project or something Move minted,
            # and either way it holds a user's work. migrate() is what moves it.
            strays.append(pid)
            continue
        if point_slot(library, pid, target):
            linked.append(pid)

    have = set(ids)
    for n in sorted(os.listdir(library)):
        p = os.path.join(library, n)
        if not os.path.islink(p):
            if n != NOTICE and n not in strays:
                strays.append(n)
            continue
        if n in have:
            continue
        # A slot with no project behind it: the project was deleted, or the
        # link was left by a phase this one replaces. Dropping it is the whole
        # reason the library is a VIEW — nothing of the user's is inside it.
        os.unlink(p)
        unlinked.append(n)

    return linked, unlinked, strays


def migrate(library, projects_dir):
    """Move real project directories out of the library into the store.

    One `rename()` per project — same filesystem, so it carries the song, the
    state dir and the xattrs in a single atomic operation. Resumable and
    idempotent across the library; ⚠ NOT atomic across it, and it must not be
    described as though it were: an interruption leaves some projects moved and
    some not, which is exactly the state a rerun finishes.

    Returns (moved, conflicts): ids relocated, and names left in place because
    the store already holds that id (never merged, never overwritten).

    ⚠ Everything directory-shaped moves, including `__pending-*` dirs and
    Move-born strays. They are projects-in-the-store's problem now, which is
    where `repair-indices` looks for them — leaving them in the library would
    put them in front of Move with nothing left to sweep them.
    """
    moved, conflicts = [], []
    try:
        names = sorted(os.listdir(library))
    except OSError:
        return moved, conflicts
    os.makedirs(projects_dir, exist_ok=True)
    for n in names:
        src = os.path.join(library, n)
        if n == NOTICE or os.path.islink(src) or not os.path.isdir(src):
            continue
        dst = os.path.join(projects_dir, n)
        if os.path.lexists(dst):
            conflicts.append(n)
            continue
        os.rename(src, dst)
        moved.append(n)
    if moved:
        os.sync()
    return moved, conflicts
