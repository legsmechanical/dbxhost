#!/usr/bin/env bash
set -euo pipefail

# The template project must be born correctly wired (Design-B invariant I2):
# tracks 1-4 listen on channels 1-4 (0-based [0]..[3] in the set schema) with
# MIDI out off — the properties the standalone session's injection path
# depends on. Everything else comes verbatim from the pristine device-authored
# fixture, so this asserts ONLY the fields the generator claims to own.

cd "$(dirname "$0")/../.."

fail() { echo "FAIL: $*" >&2; exit 1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

python3 standalone/scripts/make-template.py "$T/Song.abl" >/dev/null ||
  fail "generator failed"

python3 - "$T/Song.abl" <<'PY' || exit 1
import json, sys
song = json.load(open(sys.argv[1]))
tracks = song["tracks"]
assert len(tracks) >= 4, "fewer than 4 tracks"
for i, t in enumerate(tracks[:4]):
    assert t["midiInputMode"] == [i], \
        "track %d midiInputMode=%r, want [%d]" % (i, t["midiInputMode"], i)
    assert t["midiOutputEndpoint"] is None, \
        "track %d midiOutputEndpoint=%r, want None (out off)" % (i, t["midiOutputEndpoint"])
assert isinstance(song.get("tempo"), (int, float)), "tempo missing"
assert "$schema" in song, "schema marker lost — not a faithful patch of the fixture"
print("wiring ok")
PY

grep -q "make-template.py" scripts/build.sh ||
  fail "build.sh no longer generates the template into the payload"

echo "PASS: template project wiring"
