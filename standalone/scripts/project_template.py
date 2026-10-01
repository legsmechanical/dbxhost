"""Project templates: a saved copy of a project's SETUP, used to start new ones.

A template is taken from a project at one moment and kept on its own — deleting
or changing the source project never touches it. It holds the project's
settings, its instruments and effects (Move's own in Song.abl, Schwung's in the
state dir's host/ files) and its track settings, and none of its sequences:
no clips, no notes, no automation, every sequencer bank at its default.

Stored as  <templates>/<id>/{Song.abl, state.json, ui.json, host/, meta.json}.
Only one id is used today ("default"), but nothing here assumes one, so named
templates are a UI change.

The DSP state is filtered by a WHITELIST: a key nobody has classified stays
out, so the failure is "a setting did not come along", never "sequences
leaked into a new project". The UI sidecar is not filtered here at all: the
module writes the whole template sidecar itself (ui_persistence.mjs
templateSidecar), because only it knows every field's default.
"""
import json
import os
import re
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import state_subdir as ss  # noqa: E402

# The formats this was written against. A template whose state or sidecar
# version is not the running one's skips that half (the new project starts
# blank there) rather than handing the module a file it would refuse — the DSP
# asks to DELETE a state of another version (seq8_state.c).
# Pinned against seq8_state.c's version and writeSidecar's `v` by the tests.
STATE_V = 36
SIDECAR_V = 9

HOST_LEAF = "host"
NUM_TRACKS = 8
NUM_CLIPS = 16
DRUM_LANES = 32

# Project Settings rows, by state key.
PROJECT_KEYS = ("key", "scale", "lq", "bpm", "saw", "mic", "metro_on", "metro_vol",
                "_swa", "_swr", "_cf", "_cs")
# TRACK CONFIG rows and the track's destination, per track: t<N><suffix>.
TRACK_SUFFIXES = ("_ch", "_rt", "_mt", "_lp", "_tvo", "_tr", "_pm")
GLOBAL_TRACK_KEYS = ("cndt",)
# Kept from clip A and given to every clip (Josh, 2026-09-30): a MIDI track's
# Program / Bank, the patch its synth plays.
CLIP_PROGRAM_SUFFIXES = ("_pg", "_bm", "_bl")

# Everything the host would seed for a set it has never seen, so a template
# project never looks "unseen" to it for want of one file (shadow_ui.js,
# SET_CHANGED step 4). Counts match SHADOW_UI_SLOTS / SEND_FX / MOVE_FX.
SEED_EMPTY = (["slot_%d.json" % i for i in range(4)] +
              ["master_fx_%d.json" % i for i in range(4)] +
              ["send_fx_%s_%d.json" % (b, s) for b in ("a", "b") for s in range(4)] +
              ["move_fx_%d_%d.json" % (sl, b) for sl in range(4) for b in range(4)])


def _read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write_json(path, obj, indent=None):
    with open(path, "w") as f:
        json.dump(obj, f, indent=indent)
        f.write("\n")


# ---- the DSP state ----------------------------------------------------------

def _lane_notes(state, t):
    """Clip A's drum lane notes on track t: {lane: note} where not the default."""
    out = {}
    for l in range(DRUM_LANES):
        mn = state.get("t%dc0l%d_mn" % (t, l))
        if mn is None:
            g = state.get("t%dc0l%d_g" % (t, l))
            if isinstance(g, str):
                parts = g.split(":")
                if len(parts) >= 4 and parts[3].lstrip("-").isdigit():
                    mn = int(parts[3])
        if isinstance(mn, int) and 0 <= mn <= 127 and mn != 36 + l:
            out[l] = mn
    return out


def filter_state(state):
    """The template's DSP state: the whitelist, plus clip A's Program / Bank and
    drum lane notes on every clip. None when the state is not the running
    format (the new project then starts with a blank state)."""
    if not isinstance(state, dict) or state.get("v") != STATE_V:
        return None
    out = {"v": STATE_V}
    for k in PROJECT_KEYS + GLOBAL_TRACK_KEYS:
        if k in state:
            out[k] = state[k]
    for t in range(NUM_TRACKS):
        for suf in TRACK_SUFFIXES:
            k = "t%d%s" % (t, suf)
            if k in state:
                out[k] = state[k]
        for suf in CLIP_PROGRAM_SUFFIXES:
            v = state.get("t%dc0%s" % (t, suf))
            if v is not None:
                for c in range(NUM_CLIPS):
                    out["t%dc%d%s" % (t, c, suf)] = v
        if state.get("t%d_pm" % t) == 1:
            for l, mn in _lane_notes(state, t).items():
                for c in range(NUM_CLIPS):
                    out["t%dc%dl%d_mn" % (t, c, l)] = mn
    return out


# ---- Move's song ------------------------------------------------------------

def strip_song(song):
    """Every clip slot emptied, in the file's own empty-slot shape (as
    make-template.py does); the tracks' devices stay."""
    for t in song.get("tracks") or []:
        for cs in (t.get("clipSlots") or []) if isinstance(t, dict) else []:
            if isinstance(cs, dict):
                cs["clip"] = None
    return song


# ---- Schwung's chains (host/) -----------------------------------------------

def neutral_host(host_dir):
    """Mute and solo off (the chain config, and the Move tracks' strips), and
    every file the host would seed present."""
    cfg_p = os.path.join(host_dir, "shadow_chain_config.json")
    cfg = _read_json(cfg_p)
    if not isinstance(cfg, dict) or not isinstance(cfg.get("slots"), list):
        cfg = {"slots": [{"name": "", "channel": i + 1, "volume": 1.0,
                          "forward_channel": -1, "muted": 0, "soloed": 0} for i in range(4)]}
    for s in cfg["slots"]:
        if isinstance(s, dict):
            s["muted"] = 0
            s["soloed"] = 0
    _write_json(cfg_p, cfg, indent=2)
    meta_p = os.path.join(host_dir, "move_fx_meta.json")
    meta = _read_json(meta_p)
    if isinstance(meta, dict) and isinstance(meta.get("strips"), list):
        for s in meta["strips"]:
            if isinstance(s, dict):
                s["muted"] = 0
                s["soloed"] = 0
        _write_json(meta_p, meta, indent=2)
    for name in SEED_EMPTY:
        p = os.path.join(host_dir, name)
        if not os.path.exists(p):
            with open(p, "w") as f:
                f.write("{}\n")


def module_refs(name, obj):
    """The module ids one host file loads."""
    ids = []
    if not isinstance(obj, dict):
        return ids
    if name.startswith("slot_"):
        chain = obj.get("chain")
        if isinstance(chain, dict):
            syn = chain.get("synth")
            if isinstance(syn, dict) and isinstance(syn.get("module"), str):
                ids.append(syn["module"])
            for key in ("midi_fx", "audio_fx"):
                for b in chain.get(key) or []:
                    if isinstance(b, dict) and isinstance(b.get("module"), str):
                        ids.append(b["module"])
    elif re.match(r"^(master|send|move)_fx_", name):
        for key in ("id", "module"):
            if isinstance(obj.get(key), str):
                ids.append(obj[key])
                break
    return [i for i in ids if i]


def _present(mid, have):
    if mid in have:
        return True
    # A sound generator's pack entry: "<module>-<pack>" (chain_host.c).
    return any(mid.startswith(h + "-") for h in have)


def blank_missing(host_dir, have):
    """Each host file that loads a module not in `have` is emptied — that slot
    or effect starts empty (Josh, 2026-09-30). Returns the missing ids, in
    first-seen order. `have` None = nothing is known, nothing is touched."""
    missing = []
    if have is None:
        return missing
    for name in sorted(os.listdir(host_dir)):
        if not name.endswith(".json"):
            continue
        p = os.path.join(host_dir, name)
        ids = module_refs(name, _read_json(p))
        gone = [i for i in ids if not _present(i, have)]
        if gone:
            with open(p, "w") as f:
                f.write("{}\n")
            for i in gone:
                if i not in missing:
                    missing.append(i)
    return missing


# ---- templates on disk ------------------------------------------------------

def _tdir(templates_dir, tid):
    if not re.match(r"^[A-Za-z0-9_-]{1,40}$", tid or ""):
        raise ValueError("bad template id %r" % tid)
    return os.path.join(templates_dir, tid)


def set_template(templates_dir, tid, project_dir, ui_path, prefix, source_name=""):
    """Take the template from a project. The project is only READ. The old
    template (if any) is replaced whole, never left half-written."""
    final = _tdir(templates_dir, tid)
    song_dir = ss.song_folder(project_dir)
    sub = ss.state_subdir(project_dir)
    if not song_dir:
        raise ValueError("the project has no song")
    song = _read_json(os.path.join(project_dir, song_dir, ss.SONG_FILE))
    if not isinstance(song, dict):
        raise ValueError("the project's song is unreadable")
    ui = _read_json(ui_path)
    if not isinstance(ui, dict) or ui.get("v") != SIDECAR_V:
        raise ValueError("no template sidecar from the module")
    os.makedirs(templates_dir, exist_ok=True)
    tmp = os.path.join(templates_dir, "." + tid + ".tmp")
    old = os.path.join(templates_dir, "." + tid + ".old")
    for d in (tmp, old):
        shutil.rmtree(d, ignore_errors=True)
    os.makedirs(tmp)
    try:
        _write_json(os.path.join(tmp, ss.SONG_FILE), strip_song(song), indent=4)
        state = _read_json(os.path.join(project_dir, sub, prefix + "-state.json")) if sub else None
        fs = filter_state(state)
        if fs is not None:
            _write_json(os.path.join(tmp, "state.json"), fs)
        _write_json(os.path.join(tmp, "ui.json"), ui)
        host_src = os.path.join(project_dir, sub, HOST_LEAF) if sub else None
        host_dst = os.path.join(tmp, HOST_LEAF)
        if host_src and os.path.isdir(host_src):
            shutil.copytree(host_src, host_dst)
        else:
            os.makedirs(host_dst)
        neutral_host(host_dst)
        _write_json(os.path.join(tmp, "meta.json"),
                    {"id": tid, "name": "Template", "source_name": source_name,
                     "created": int(time.time()), "state_v": STATE_V, "sidecar_v": SIDECAR_V})
        if os.path.exists(final):
            os.rename(final, old)
        os.rename(tmp, final)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.rmtree(old, ignore_errors=True)
    if hasattr(os, "sync"):
        os.sync()


def clear_template(templates_dir, tid):
    shutil.rmtree(_tdir(templates_dir, tid), ignore_errors=True)
    if hasattr(os, "sync"):
        os.sync()


def list_templates(templates_dir):
    """[{id, name, source_name}] — a folder with a readable meta.json and a
    song; dot-names (a swap in flight) are never listed."""
    out = []
    try:
        names = sorted(os.listdir(templates_dir))
    except OSError:
        return out
    for n in names:
        if n.startswith("."):
            continue
        d = os.path.join(templates_dir, n)
        meta = _read_json(os.path.join(d, "meta.json"))
        if isinstance(meta, dict) and os.path.isfile(os.path.join(d, ss.SONG_FILE)):
            out.append({"id": n, "name": meta.get("name") or n,
                        "source_name": meta.get("source_name") or ""})
    return out


def template_song(templates_dir, tid):
    """The template's Song.abl path, or None when there is no usable one."""
    p = os.path.join(_tdir(templates_dir, tid), ss.SONG_FILE)
    return p if isinstance(_read_json(p), dict) else None


def apply_template(templates_dir, tid, project_dir, prefix, have=None):
    """Fill a NEW project's state dir from the template. Call after its
    Song.abl is in place (the state dir's name depends on the song's). Each
    half is best-effort: one that cannot be used is skipped, and the project
    starts blank there, never fails to exist. Returns the missing module ids."""
    src = _tdir(templates_dir, tid)
    sub = ss.ensure_state_subdir(project_dir)
    dst = os.path.join(project_dir, sub)
    state = _read_json(os.path.join(src, "state.json"))
    if isinstance(state, dict) and state.get("v") == STATE_V:
        _write_json(os.path.join(dst, prefix + "-state.json"), state)
    ui = _read_json(os.path.join(src, "ui.json"))
    if isinstance(ui, dict) and ui.get("v") == SIDECAR_V:
        _write_json(os.path.join(dst, prefix + "-ui-state.json"), ui)
    missing = []
    hsrc = os.path.join(src, HOST_LEAF)
    if os.path.isdir(hsrc):
        hdst = os.path.join(dst, HOST_LEAF)
        shutil.rmtree(hdst, ignore_errors=True)
        shutil.copytree(hsrc, hdst)
        neutral_host(hdst)
        missing = blank_missing(hdst, have)
    return missing


def read_have(path):
    """The installed module ids the module wrote for this call, one per line;
    None when it wrote none (nothing is then blanked)."""
    if not path:
        return None
    try:
        with open(path) as f:
            return set(l.strip() for l in f if l.strip())
    except OSError:
        return None


def main(argv):
    if len(argv) < 2:
        raise SystemExit("usage: project_template.py set|clear|list|song|apply …")
    cmd = argv[1]
    if cmd == "set":        # templates tid project_dir ui_path prefix [source_name]
        set_template(argv[2], argv[3], argv[4], argv[5], argv[6], argv[7] if len(argv) > 7 else "")
    elif cmd == "clear":    # templates tid
        clear_template(argv[2], argv[3])
    elif cmd == "list":     # templates
        print(json.dumps(list_templates(argv[2])))
    elif cmd == "song":     # templates tid
        p = template_song(argv[2], argv[3])
        if p:
            print(p)
    elif cmd == "apply":    # templates tid project_dir prefix have_path missing_out
        missing = apply_template(argv[2], argv[3], argv[4], argv[5], read_have(argv[6]))
        _write_json(argv[7], {"missing": missing})
    else:
        raise SystemExit("unknown command %r" % cmd)


if __name__ == "__main__":
    main(sys.argv)
