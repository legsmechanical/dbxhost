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

# ---- the two slots ----------------------------------------------------------
#
# Move sees exactly these, and never a project id. Switching is: re-point the
# IDLE slot at the project you want, confirm it landed, then press its pad —
# so the slot Move is LIVE on is never touched, which is the whole safety
# property. (Re-pointing the live slot was tried deliberately on hardware: it
# wrote the session's state into an unrelated project and left the project the
# user was editing with zero writes, silently, in both directions.)
#
# ⚠ Fixed, constant ids: a slot is a fixture, not a project, and nothing may
# ever mint one. `5107` reads as SLOT, and `a000`/`b000` are far enough apart to
# tell at a glance in a log line — a pair differing in the last character would
# not be. check-config.sh pins them.
SLOT_IDS = (
    "5107a000-0000-4000-8000-000000000000",
    "5107b000-0000-4000-8000-000000000001",
)

# Move orders the library by this xattr, read THROUGH the slot symlink (a
# symlink cannot carry one — PermissionError, verified). So it lives on
# whichever project a slot currently points at, is {0,1}, and is written HERE
# and nowhere else. The picker's own pad is a different number in a different
# xattr (project_pad.py).
SONG_INDEX_XATTR = "user.song-index"


def is_slot_id(name):
    return name in SLOT_IDS


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


# ⭐⭐ MOVE'S OWN SHAPE FOR A SET DIRECTORY — the tags Move writes on every set
# it makes itself. A project born WITHOUT them is not an ordinary set to Move.
#
# Measured on device, 2026-09-21: `user.was-externally-modified` was the one
# that mattered. A brand-new project lacked it; Move then filed that set LAST,
# ignoring its `user.song-index` — so a new project put into slot 0 landed
# behind slot 1, pad 0 pressed the set Move was already on, and the load timed
# out. Every first load of a new project failed that way, and the same project
# worked later, once Move had processed it and tagged it `true` itself. Stamping
# the tag by hand on a never-loaded project made it load first time.
#
# A fix on 2026-09-14 ("provenance parity") stamped three of these and missed
# this one, in one of five birth paths. Hence ONE function, called by every
# path that makes a project AND by sync() for every project in the store, so a
# project born without the shape — by any path, including one added later —
# is healed the next time the library is synced.
#
# ⚠ Only ever ADDS a missing tag. Move rewrites these on sets it has seen (it
# sets was-externally-modified to `true` once processed), and overwriting its
# answer with ours would be us deciding a fact that is Move's to state.
MOVE_SHAPE_DEFAULTS = (
    ("user.local-cloud-state", lambda d: b"notSynced"),
    ("user.was-externally-modified", lambda d: b"false"),
    ("user.song-color", lambda d: _xattr_or(d, "user.dbx-color", b"0")),
    ("user.last-modified-time", lambda d: _utc_now()),
)


def _xattr_or(project_dir, name, default):
    try:
        return os.getxattr(project_dir, name)
    except (OSError, AttributeError):
        return default


def _utc_now():
    import datetime
    return (datetime.datetime.now(datetime.timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%SZ").encode())


def ensure_move_shape(project_dir):
    """Add any of Move's own set tags this project is missing. Returns the
    names added (empty when the project already looks Move-born)."""
    added = []
    for name, value in MOVE_SHAPE_DEFAULTS:
        try:
            os.getxattr(project_dir, name)
            continue                    # present: Move's answer, or ours — keep it
        except AttributeError:
            return added                # a platform without user xattrs
        except OSError:
            pass
        try:
            os.setxattr(project_dir, name, value(project_dir))
            added.append(name)
        except (OSError, AttributeError):
            pass                        # best effort, like every tag here
    return added


def _set_song_index(project_dir, idx):
    """Put Move's ordering index on a project, or take it off (idx None)."""
    try:
        if idx is None:
            os.removexattr(project_dir, SONG_INDEX_XATTR)
        else:
            os.setxattr(project_dir, SONG_INDEX_XATTR, str(int(idx)).encode())
    except (OSError, AttributeError):
        pass            # best effort: a platform without user.* xattrs, or none set


def _point(library, slot_id, target):
    """Create or re-point ONE slot. Atomic; returns True when it changed.

    ⚠ symlink-to-temp then rename, never unlink-then-symlink: the rename is
    atomic, so a reader — Move, enumerating the library — never sees the name
    missing. An unlink/symlink pair has a window where the slot does not exist,
    and Move enumerating in that window sees a library one entry short.
    """
    link = os.path.join(library, slot_id)
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
    os.rename(tmp, link)
    return True


def slot_target(library, slot_id):
    """The project id a slot currently leads to, or '' if it leads nowhere."""
    try:
        t = os.readlink(os.path.join(library, slot_id))
    except OSError:
        return ""
    return os.path.basename(t.rstrip("/"))


def slot_of_project(library, pid):
    """Which slot currently points at this project, or None."""
    if not pid:
        return None
    for i, sid in enumerate(SLOT_IDS):
        if slot_target(library, sid) == pid:
            return i
    return None


def plan_slots(ids, current):
    """Choose what each slot should point at. Pure — no filesystem.

    `ids` is the store, `current` is what each slot points at NOW (a list the
    length of SLOT_IDS, entries '' for unset). Returns the same shape.

    Two rules, and the second is the one that is easy to get wrong:

      1. **Keep what is already pointed**, where it is still a real project.
         A launch must not move a slot Move may be about to boot into.
      2. ⚠⚠ **The two slots must never point at the SAME project.** They would
         share one directory, so they would share its single `user.song-index`
         — and Move would see two entries claiming one position, which is
         undefined. Nothing else in the design prevents this, so it is
         prevented here.

    ⭑ With ONE project there is ONE slot, not a second slot parked somewhere
    invented. Nothing can be switched to when there is nothing else, so a
    second slot would buy a placeholder project that could leak into the
    picker, for no behaviour at all. The slot appears when the second project
    does. (Josh's call, 2026-09-21.)
    """
    want = [""] * len(SLOT_IDS)
    taken = set()
    n = min(len(SLOT_IDS), len(ids))
    for i in range(n):
        c = current[i] if i < len(current) else ""
        if c and c in ids and c not in taken:
            want[i] = c
            taken.add(c)
    for i in range(n):
        if want[i]:
            continue
        for pid in ids:
            if pid not in taken:
                want[i] = pid
                taken.add(pid)
                break
    return want


def sync(library, projects_dir, prefer=""):
    """Make the library show the two slots, and NOTHING else.

    `prefer` names a project that should keep/take slot 0 when it is not
    already placed — the boot project, so a launch lands where it left off.

    Returns (pointed, removed, strays): (slot index, project id) pairs that
    moved, library entries removed, and entries left alone because they are
    not ours to touch.
    """
    os.makedirs(library, exist_ok=True)
    ids = project_ids(projects_dir)
    current = [slot_target(library, sid) for sid in SLOT_IDS]
    if prefer and prefer in ids and prefer not in current:
        current[0] = prefer
    want = plan_slots(ids, current)

    # ⚠ TAG BEFORE LINK, as in repoint(): this sync also runs MID-SESSION
    # (delete, repair), with Move up and re-reading the library whenever a link
    # moves. Every project about to go on show is tagged FIRST; the links move;
    # only then do projects that left lose their tag. At no instant does a slot
    # lead to an untagged project — which Move would rank last, putting pad 0
    # on the other slot for the rest of the session.
    # Every project must look Move-born BEFORE a slot can put it on show —
    # see ensure_move_shape(). This is also what heals projects born before
    # the fix, and any birth path that forgets.
    for pid in ids:
        ensure_move_shape(project_path(projects_dir, pid))

    on_show = {}
    for i, pid in enumerate(want):
        if pid:
            on_show[pid] = i
    for pid, i in on_show.items():
        _set_song_index(project_path(projects_dir, pid), i)

    pointed, removed, strays = [], [], []
    for i, sid in enumerate(SLOT_IDS):
        link = os.path.join(library, sid)
        if not want[i]:
            if os.path.islink(link):
                os.unlink(link)
                removed.append(sid)
            continue
        if os.path.lexists(link) and not os.path.islink(link):
            strays.append(sid)          # a real directory on a slot's name
            continue
        if _point(library, sid, project_path(projects_dir, want[i])):
            pointed.append((i, want[i]))

    # ⭐ Move's ordering index is a SLOT property: it belongs to whichever
    # project each slot points at, and to no other. Re-derived from scratch on
    # every sync, which is also what heals a crash between a re-point and its
    # xattr write — the state is a pure function of where the links point.
    # The incoming half was written above, before the links moved; this is the
    # outgoing half, and it must come AFTER them.
    for pid in ids:
        if pid not in on_show:
            _set_song_index(project_path(projects_dir, pid), None)

    # Anything else in the library is not a slot. The per-project links the
    # previous phase made are exactly this, which is how the layout migrates.
    for n in sorted(os.listdir(library)):
        if n == NOTICE or is_slot_id(n):
            continue
        p = os.path.join(library, n)
        if os.path.islink(p):
            os.unlink(p)
            removed.append(n)
        elif n not in strays:
            strays.append(n)

    return pointed, removed, strays


def repoint(library, projects_dir, slot_index, pid):
    """Point ONE slot at a project and confirm it landed. The switch primitive.

    ⚠⚠ THE CALLER MUST ONLY EVER PASS THE IDLE SLOT. Re-pointing the slot Move
    is live on was tried deliberately on hardware: the session's state went into
    an unrelated project, the project being edited took zero writes, and nothing
    on screen said so — in both directions, silently.

    Returns the project id the slot resolves to AFTER the write, which the
    caller must compare against what it asked for. It is deliberately a
    READBACK rather than a success flag: if the rename did not land, the slot
    still points at its previous project, Move would still change set, still
    log, and the uuid it logs IS the slot we pressed — so confirmation would
    pass and the wrong project would be reported open.
    """
    if slot_index < 0 or slot_index >= len(SLOT_IDS):
        raise ValueError("no such slot: %r" % (slot_index,))
    sid = SLOT_IDS[slot_index]
    other = slot_target(library, SLOT_IDS[1 - slot_index]) if len(SLOT_IDS) == 2 else ""
    if pid and pid == other:
        raise ValueError("slot %d already holds %s — the two slots may not share a project"
                         % (1 - slot_index, pid))
    # ⚠⚠ THE INDEX GOES ON BEFORE THE LINK MOVES — never after.
    # Move re-reads the library when a slot link changes, and ranks an entry
    # with no `user.song-index` LAST. The other order (rename, then tag) opens a
    # window where slot 0 leads to an untagged project: Move re-ranks it behind
    # slot 1 and does NOT re-rank when the tag lands a moment later. From then
    # on pad 0 is the OTHER slot, so every switch to slot 0 presses the project
    # Move is already on, Move says nothing, and the load times out as
    # `unopened` (device, 2026-09-21: two in a row, one on a brand-new project
    # and one on an old one whose tag the launch sync had cleared).
    # Slot 1 never shows it — untagged sorts last, and slot 1 IS last — which
    # is why it looked slot-specific.
    target = project_path(projects_dir, pid)
    # The switch can reach a project no sync has seen yet (created seconds ago
    # on a path that forgot the shape) — so make sure here too, before Move can
    # see it, for the same reason the index goes on first.
    ensure_move_shape(target)
    _set_song_index(target, slot_index)
    _point(library, sid, target)
    landed = slot_target(library, sid)
    if landed != pid:
        # The link did not move, so this project is not on show: take the tag
        # back off rather than leave a second project claiming the index.
        _set_song_index(target, None)
    return landed


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
