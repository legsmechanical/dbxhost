"""project_archive.py — a project (or all of them) as ONE portable file, and back.

Export writes a zip; import reads one into the store as NEW projects. The
archive is how a project leaves the Move — to be kept on a computer, or carried
to another Move — so an import must give the same result as `project-cmd.sh
copy` would have given on the device the project came from:

  · a FRESH uuid, and the song folder renamed to the new uuid's fixed name
    (project_name.song_folder_name) — never the archived one, which would
    collide with the project it was exported from;
  · the state dir re-ordered after the song (state_subdir.fix_state_order), or
    Move opens the set empty;
  · a FREE picker pad, and Move's own provenance xattrs stamped.

⚠ What a zip cannot carry is the project DIRECTORY's xattrs — the picker pad
and colour are on the uuid dir itself (project_pad.py). The manifest carries
the colour; the pad is never restored (the archived pad may be taken here), an
import always lands on the lowest free one.

⚠ Import never OVERWRITES. Restoring a project means a second copy beside the
first; deleting the old one is the picker's job. That is also what keeps an
import safe during a live session: nothing open is ever touched.

Archive layout (format 1):
    manifest.json
    projects/<uuid>/...        each project's whole directory
    templates/<id>/...         Export All only: the saved templates
"""
import datetime
import json
import os
import re
import shutil
import stat
import sys
import uuid as uuidlib
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import project_name as pn  # noqa: E402
import project_pad as pp  # noqa: E402
import project_template as pt  # noqa: E402
import state_subdir as ss  # noqa: E402

FORMAT = 1
KIND = "dAVEBOx project archive"
PADS = 32                       # the picker's pads (ui_dialogs.mjs PICKER pads)
PALETTE_N = 9                   # project-cmd.sh DBX_PALETTE_N
MAX_UNPACKED = 2 << 30          # refuse an archive that unpacks larger than this
MAX_ENTRIES = 50000
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
TEMPLATE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
# Never part of a project: the one-shot new-project seed is consumed on the
# first load, and a copy must not re-randomise; .have-modules.txt is a scratch
# file the module writes beside the templates.
SKIP_NAMES = {"new-project.json", ".have-modules.txt"}


class ArchiveError(Exception):
    pass


# ---- export ------------------------------------------------------------------

def _xattr(path, name):
    try:
        return os.getxattr(path, name).decode()
    except (OSError, AttributeError, UnicodeDecodeError):
        return None


def _projects(projects_dir):
    try:
        names = sorted(os.listdir(projects_dir))
    except OSError:
        return []
    return [n for n in names if UUID_RE.match(n) and os.path.isdir(os.path.join(projects_dir, n))]


def _state_v(project_dir):
    sub = ss.state_subdir(project_dir)
    if not sub:
        return None
    for n in os.listdir(os.path.join(project_dir, sub)):
        if n.endswith("-state.json") and "-ui-" not in n:
            try:
                with open(os.path.join(project_dir, sub, n)) as f:
                    v = json.load(f).get("v")
                return v if isinstance(v, int) else None
            except (OSError, ValueError, AttributeError):
                return None
    return None


def _add_tree(zf, src_root, arc_root):
    """Every regular file under src_root, at arc_root/<relative path>. Links
    are never followed and never stored."""
    for dirpath, dirnames, filenames in os.walk(src_root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if not os.path.islink(os.path.join(dirpath, d)))
        for fn in sorted(filenames):
            if fn in SKIP_NAMES:
                continue
            p = os.path.join(dirpath, fn)
            if os.path.islink(p) or not os.path.isfile(p):
                continue
            rel = os.path.relpath(p, src_root).replace(os.sep, "/")
            zf.write(p, arc_root + "/" + rel)


def _version(dbx_dir):
    try:
        with open(os.path.join(dbx_dir, "sa-build.json")) as f:
            v = json.load(f).get("version")
        return str(v) if v else "unknown"
    except (OSError, ValueError, AttributeError):
        return "unknown"


def export(projects_dir, out_path, uuids=None, templates_dir=None, dbx_dir=""):
    """Write the archive to out_path (temp + rename). uuids None = every
    project. templates_dir set = the saved templates go in too. Returns the
    manifest."""
    have = _projects(projects_dir)
    if uuids is None:
        uuids = have
    for u in uuids:
        if u not in have:
            raise ArchiveError("no project %s" % u)
    if not uuids:
        raise ArchiveError("no projects to export")
    manifest = {
        "format": FORMAT,
        "kind": KIND,
        "davebox_version": _version(dbx_dir),
        "state_v": pt.STATE_V,
        "created": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "projects": [],
        "templates": [],
    }
    tmp = out_path + ".tmp"
    try:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
            for u in uuids:
                d = os.path.join(projects_dir, u)
                manifest["projects"].append({
                    "uuid": u,
                    "name": pn.name_of(d),
                    "color": _xattr(d, "user.dbx-color"),
                    "pad": pp.pad_of(d),
                    "state_v": _state_v(d),
                })
                _add_tree(zf, d, "projects/" + u)
            if templates_dir:
                for t in pt.list_templates(templates_dir):
                    manifest["templates"].append({"id": t["id"], "name": t["name"]})
                    _add_tree(zf, os.path.join(templates_dir, t["id"]), "templates/" + t["id"])
            zf.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")
        os.replace(tmp, out_path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return manifest


# ---- import ------------------------------------------------------------------

def _safe_names(zf):
    """Refuse anything that could land outside the staging dir, any link, and
    an archive too large to be what it claims."""
    infos = zf.infolist()
    if len(infos) > MAX_ENTRIES:
        raise ArchiveError("too many files in the archive")
    total = 0
    for i in infos:
        n = i.filename
        if not n or n.startswith("/") or "\\" in n or "\0" in n or re.match(r"^[A-Za-z]:", n):
            raise ArchiveError("unsafe path in archive: %r" % n)
        if any(part in ("..", "") for part in n.rstrip("/").split("/")):
            raise ArchiveError("unsafe path in archive: %r" % n)
        mode = (i.external_attr >> 16) & 0xFFFF
        if stat.S_ISLNK(mode):
            raise ArchiveError("archive contains a link: %r" % n)
        total += i.file_size
        if total > MAX_UNPACKED:
            raise ArchiveError("archive unpacks larger than %d MB" % (MAX_UNPACKED >> 20))
    return infos


def _read_manifest(zf):
    try:
        m = json.loads(zf.read("manifest.json").decode("utf-8"))
    except KeyError:
        raise ArchiveError("not a dAVEBOx project archive (no manifest.json)")
    except (ValueError, UnicodeDecodeError):
        raise ArchiveError("manifest.json is damaged")
    if not isinstance(m, dict) or m.get("kind") != KIND:
        raise ArchiveError("not a dAVEBOx project archive")
    if not isinstance(m.get("format"), int) or m["format"] > FORMAT:
        raise ArchiveError("archive format %r is newer than this dAVEBOx can read" % m.get("format"))
    return m


def _free_pads(projects_dir):
    used = set()
    for u in _projects(projects_dir):
        p = pp.pad_of(os.path.join(projects_dir, u))
        if p is not None:
            used.add(p)
    return [k for k in range(PADS) if k not in used]


def _names(projects_dir):
    return {pn.name_of(os.path.join(projects_dir, u)) for u in _projects(projects_dir)}


def _unique_name(name, taken):
    if name not in taken:
        return name
    base = name + " (imported)"
    n, k = base, 2
    while n in taken:
        n = "%s %d" % (base, k)
        k += 1
    return n


def _set_xattr(path, name, value):
    try:
        os.setxattr(path, name, value.encode())
    except (OSError, AttributeError):
        pass


def _modules(project_dir):
    sub = ss.state_subdir(project_dir)
    host = os.path.join(project_dir, sub, pt.HOST_LEAF) if sub else None
    ids = []
    if host and os.path.isdir(host):
        for n in sorted(os.listdir(host)):
            if n.endswith(".json"):
                for i in pt.module_refs(n, pt._read_json(os.path.join(host, n))):
                    if i not in ids:
                        ids.append(i)
    return ids


def import_archive(archive, projects_dir, staging_root, templates_dir=None):
    """Bring every project in `archive` in as a new project. Returns
    {"imported": [{uuid, name, pad}], "skipped": [{name, why}],
     "templates": [{id, name}], "modules": [ids the imported projects load]}."""
    result = {"imported": [], "skipped": [], "templates": [], "modules": []}
    os.makedirs(staging_root, exist_ok=True)
    stage = os.path.join(staging_root, "import-" + uuidlib.uuid4().hex[:12])
    try:
        try:
            zf = zipfile.ZipFile(archive)
        except (zipfile.BadZipFile, OSError) as e:
            raise ArchiveError("not a zip file (%s)" % e)
        with zf:
            _safe_names(zf)
            manifest = _read_manifest(zf)
            zf.extractall(stage)

        free = _free_pads(projects_dir)
        taken = _names(projects_dir)
        for entry in manifest.get("projects") or []:
            old = entry.get("uuid") if isinstance(entry, dict) else None
            name = pn.clean(str(entry.get("name") or "")) if isinstance(entry, dict) else ""
            src = os.path.join(stage, "projects", old or "")
            label = name or (old or "?")[:8]
            if not old or not UUID_RE.match(old) or not os.path.isdir(src):
                result["skipped"].append({"name": label, "why": "missing from the archive"})
                continue
            if not ss.song_folder(src):
                result["skipped"].append({"name": label, "why": "no Move song in it"})
                continue
            v = _state_v(src)
            if v is not None and v != pt.STATE_V:
                # The DSP would ask to ERASE a state of another version.
                result["skipped"].append({"name": label, "why": "saved by another dAVEBOx version (state v%s, this one reads v%d)" % (v, pt.STATE_V)})
                continue
            if not free:
                result["skipped"].append({"name": label, "why": "no free pad in the picker"})
                continue
            nu = str(uuidlib.uuid4())
            np = os.path.join(projects_dir, nu)
            shutil.copytree(src, np, symlinks=False)
            song = ss.song_folder(np)
            os.rename(os.path.join(np, song), os.path.join(np, pn.song_folder_name(np)))
            final = _unique_name(name or pn.name_of(np), taken)
            pn.set_name(np, final)
            taken.add(final)
            ss.fix_state_order(np)
            pad = free.pop(0)
            pp.set_pad(np, pad)
            color = entry.get("color")
            color = color if isinstance(color, str) and color.lstrip("-").isdigit() else str(pad % PALETTE_N)
            _set_xattr(np, "user.dbx-color", color)
            # Move's own provenance tags, as do_copy stamps them (project-cmd.sh
            # stamp_move_xattrs): without was-externally-modified Move mis-files it.
            _set_xattr(np, "user.song-color", color)
            _set_xattr(np, "user.last-modified-time",
                       datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
            _set_xattr(np, "user.local-cloud-state", "notSynced")
            _set_xattr(np, "user.was-externally-modified", "false")
            result["imported"].append({"uuid": nu, "name": final, "pad": pad})
            for m in _modules(np):
                if m not in result["modules"]:
                    result["modules"].append(m)

        if templates_dir:
            have = {t["id"] for t in pt.list_templates(templates_dir)}
            have_names = {t["name"] for t in pt.list_templates(templates_dir)}
            for entry in manifest.get("templates") or []:
                tid = entry.get("id") if isinstance(entry, dict) else None
                src = os.path.join(stage, "templates", tid or "")
                if not tid or not TEMPLATE_ID_RE.match(tid) or not os.path.isdir(src):
                    continue
                tname = str(entry.get("name") or tid)
                if tid in have:
                    continue            # the same template is already here
                os.makedirs(templates_dir, exist_ok=True)
                shutil.copytree(src, os.path.join(templates_dir, tid), symlinks=False)
                if tname in have_names:
                    pt.rename_template(templates_dir, tid, _unique_name(tname, have_names))
                result["templates"].append({"id": tid, "name": tname})
        os.sync()
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    return result


def main(argv):
    try:
        if len(argv) >= 5 and argv[0] == "export":
            # export <projects_dir> <out.zip> <dbx_dir> <templates_dir|-> [uuid ...]
            projects_dir, out, dbx_dir, tdir = argv[1], argv[2], argv[3], argv[4]
            uuids = argv[5:] or None
            m = export(projects_dir, out, uuids, None if tdir == "-" else tdir, dbx_dir)
            print(json.dumps({"ok": True, "projects": len(m["projects"]), "templates": len(m["templates"])}))
            return 0
        if len(argv) >= 5 and argv[0] == "import":
            # import <archive> <projects_dir> <staging_root> <templates_dir|->
            r = import_archive(argv[1], argv[2], argv[3], None if argv[4] == "-" else argv[4])
            r["ok"] = True
            print(json.dumps(r))
            return 0
    except ArchiveError as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return 3
    print("usage: project_archive.py export|import ...", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
