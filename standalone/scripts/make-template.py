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
  - every track's mixer at unity, unmuted, unsoloed (see below)

Source of truth for everything else is tests/fixtures/empty_song.abl — a real
device-authored set — patched minimally rather than synthesized, so schema
drift in fields we don't care about can never invalidate the template.
⚠ The mixer turned out to be a field we DO care about: the donor set was
captured with track 2 muted (`speakerOn: false`), and "patch minimally" carried
that mute into the template, into every project born from it, and into every
copy of those. Patched explicitly below — a captured set is a snapshot of
someone's session, and its mixer is not part of what we mean by "empty".

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
        # Move's own mixer stays neutral. Every Move instrument is mixed by the
        # session's FX bus for that track, so a mute or a trim HERE is invisible
        # to the surface the user is mixing on: the fader they can see moves and
        # nothing happens, because a set-level mute is silencing it underneath.
        # (Move spells mute `speakerOn: false`; volume is dB, 0.0 = unity.)
        mixer = t.get("mixer")
        if isinstance(mixer, dict):
            mixer["speakerOn"] = True
            mixer["solo-cue"] = False
            mixer["volume"] = 0.0

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
