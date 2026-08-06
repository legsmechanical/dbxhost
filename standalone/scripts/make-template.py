#!/usr/bin/env python3
"""Generate the standalone session's template project from the pristine set fixture.

Every project in the standalone workspace is BORN from this template (Design B,
invariant I2 in the davebox repo's DBSA_SET_WORKSPACE.md): the wiring the
session depends on is baked in at creation, so no set ever needs rewriting.

The wiring, per the SA spec:
  - Move instrument tracks 1-4 receive on MIDI channels 1-4
    (midiInputMode: [N] with N 0-based — the Move set schema's own encoding,
    already present on tracks that have an explicit listen channel)
  - MIDI out off (midiOutputEndpoint: null)

Source of truth for everything else is tests/fixtures/empty_song.abl — a real
device-authored set — patched minimally rather than synthesized, so schema
drift in fields we don't care about can never invalidate the template.

Run by scripts/build.sh; output lands in the payload at
build/sets/template/<name>/Song.abl and the launcher seeds the first project
from it (launch.sh first-run branch).
"""
import json
import os
import sys

FIXTURE = os.path.join(os.path.dirname(__file__), "..", "..",
                       "tests", "fixtures", "empty_song.abl")
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), "..", "..",
                           "build", "sets", "template", "Project 1", "Song.abl")
DEFAULT_TEMPO = 120.0


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    with open(FIXTURE) as f:
        song = json.load(f)

    tracks = song.get("tracks")
    if not isinstance(tracks, list) or len(tracks) < 4:
        sys.exit("make-template: fixture has no 4-track array — refusing")

    for i, t in enumerate(tracks[:4]):
        t["midiInputMode"] = [i]        # 0-based listen channel = track number
        t["midiOutputEndpoint"] = None  # MIDI out off — loop safety for injection

    # A neutral musical starting point; the fixture's authored tempo is
    # whatever its donor session used.
    song["tempo"] = DEFAULT_TEMPO

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        # Compact separators keep the file closest to Move's own writer style;
        # Move re-serializes on first save anyway.
        json.dump(song, f, separators=(",", ": "), indent=4)
        f.write("\n")
    print("make-template: wrote %s (%d bytes)" % (out, os.path.getsize(out)))


if __name__ == "__main__":
    main()
