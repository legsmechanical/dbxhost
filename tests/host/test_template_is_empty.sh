#!/usr/bin/env bash
# A new project is EMPTY apart from its track devices.
#
# The template is generated from tests/fixtures/empty_song.abl, a real
# device-authored set, "patched minimally". That file is not empty: it carries
# 14 notes + one automation ENVELOPE on track 1, 5 on track 2, 19 on track 3.
# So every project ever created was born holding a stranger's demo material.
#
# ⚠⚠ The envelope was not cosmetic, it was FATAL. It binds to a device parameter
# by id; randomize_instruments then swaps that track's device for a random kit;
# the id no longer resolves; and Move refuses the WHOLE set with "Unknown id" —
# no song loads, currentSongIndex goes to -1, and the session silently shows
# whatever set was already resident. Three of Josh's four projects were
# unloadable this way (2026-08-25). It presented as "the wrong set loads on
# relaunch", which is why it went unrecognised for so long.
#
# This pins the OUTPUT, not the fixture: the donor is allowed to be a real
# session (that is the point of patching a real set rather than synthesising
# one). What must never ship is its content.
set -u
cd "$(dirname "$0")/../.."
GEN=standalone/scripts/make-template.py
[ -f "$GEN" ] || { echo "FAIL: $GEN missing" >&2; exit 1; }

OUT=$(mktemp -d)/Song.abl
python3 "$GEN" "$OUT" >/dev/null || { echo "FAIL: generator errored" >&2; exit 1; }

python3 - "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
fails = 0

def bad(msg):
    global fails
    print("  FAIL %s" % msg); fails = 1

def ok(msg):
    print("  ok   %s" % msg)

tracks = d.get("tracks") or []
clips = [(i, j) for i, t in enumerate(tracks)
         for j, cs in enumerate(t.get("clipSlots") or [])
         if isinstance(cs.get("clip"), dict)]
if clips:
    bad("the template ships %d clip(s): %s" % (len(clips), clips[:6]))
else:
    ok("no clips on any track")

envs = sum(len(cs["clip"].get("envelopes") or [])
           for t in tracks for cs in (t.get("clipSlots") or [])
           if isinstance(cs.get("clip"), dict))
if envs:
    bad("the template ships %d automation envelope(s) — the Unknown id trap" % envs)
else:
    ok("no automation envelopes (nothing can dangle when a device is swapped)")

# The control: devices MUST survive. An "empty" template that also stripped the
# instruments would pass both checks above and be useless.
kinds = [(t.get("devices") or [{}])[0].get("kind") for t in tracks]
if len(tracks) < 4 or any(k is None for k in kinds):
    bad("track devices did not survive: %s" % kinds)
else:
    ok("all %d track devices intact (%s)" % (len(tracks), kinds[0]))

sys.exit(fails)
PY
rc=$?
rm -rf "$(dirname "$OUT")"
if [ "$rc" = "0" ]; then
    echo "PASS: the generated template is empty apart from its track devices"
else
    echo "FAIL: template content pin broken" >&2
fi
exit "$rc"
