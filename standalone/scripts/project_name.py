"""project_name.py — the ONE place that knows where a project's NAME lives.

A project is `<store>/<uuid>/{<song folder>/Song.abl, <state>/}`. Move insists
on that shape — every set it makes is `Sets/<id>/<Name>/Song.abl` — and opens
the first inner folder holding a Song.abl. For a long time the inner folder's
name WAS the user's project name, so a rename moved a real folder under a live
Move (a deferred patch and a Move restart), and every reader of "the name"
read a directory listing.

The folder is Move's, and the name is ours. So:

  · the song folder is `Move-Set-<first 8 of the project uuid>` — fixed for
    the project's life, never the user's words, and named for what it holds;
  · the name the user sees is `<state>/name.txt`, one line, any character but a
    newline.

⚠ This module is the only speller of both. `check-config.sh` pins the two
literals, and tests/host/test_project_name_readers.sh fails if a second speller
appears, or if anything goes back to deriving a name from a folder.

There is no migration and no old-shape fallback: projects from before this
change were disposable (Josh, 2026-09-22: "we don't need to save any current
projects"), so there is exactly ONE shape to be right about.
"""
import os

import state_subdir as ss

SONG_PREFIX = "Move-Set-"
NAME_FILE = "name.txt"


def song_folder_name(project_dir):
    """The fixed song-folder name for this project."""
    return SONG_PREFIX + os.path.basename(os.path.normpath(project_dir))[:8]


def clean(name):
    """What a name may be: one line, trimmed. '' when nothing is left."""
    return " ".join(str(name or "").replace("\r", "\n").split("\n")).strip()


def _name_path(project_dir):
    st = ss.state_subdir(project_dir)
    return os.path.join(project_dir, st, NAME_FILE) if st else None


def name_of(project_dir):
    """The name to SHOW for a project: name.txt, else the short uuid.

    ⚠ Never the song folder. That name is Move's, and a reader that falls back
    to it is exactly the reader this module exists to remove."""
    p = _name_path(project_dir)
    if p:
        try:
            with open(p, encoding="utf-8") as f:
                n = clean(f.read())
            if n:
                return n
        except OSError:
            pass
    return os.path.basename(os.path.normpath(project_dir))[:8]


def _fsync_dir(d):
    try:
        fd = os.open(d, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def set_name(project_dir, name):
    """Write the name. Temp + fsync + rename + dir fsync, so a power cut leaves
    the old name or the new one, never a torn file. Raises ValueError on an
    empty name."""
    n = clean(name)
    if not n:
        raise ValueError("empty project name")
    st = ss.ensure_state_subdir(project_dir)
    d = os.path.join(project_dir, st)
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, NAME_FILE)
    tmp = dst + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(n + "\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, dst)
    _fsync_dir(d)
    return n
