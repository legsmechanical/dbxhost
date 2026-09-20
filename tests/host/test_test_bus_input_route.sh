#!/usr/bin/env bash
set -euo pipefail

# The test bus drives the SURFACE on its own ring — never Move's.
#
# There are two MIDI_IN routes and they do not meet:
#
#   /schwung-midi-inject   drained into MOVE'S MAILBOX for the firmware. It is
#                          also how dAVEBOx's sequencer plays Move's own sounds
#                          (shadow_chain_midi_inject).
#   the hardware buffer    what an overtake module is actually fed from.
#
# A test packet on the first route reaches Move and is INVISIBLE to the module
# on screen: measured 2026-09-20, a project-picker pad tap moved none of the 32
# pad LEDs, which reads as "the gesture did nothing" rather than "the gesture
# went somewhere else". Hence a dedicated ring, replayed onto the hardware route.
#
# ⚠⚠ THE MISTAKE THIS GUARDS. Upstream solved the same problem by draining the
# SHARED ring during overtake. That works there and would be actively dangerous
# here, because the shared ring carries the product's note output: their next
# two commits fix fallout from it, one of them a module hearing its own notes
# played back as its own input. If someone later "simplifies" this by pointing
# the drain at shadow_midi_inject_shm, nothing fails to compile and nothing
# fails to run — dAVEBOx just starts playing itself. So it is pinned here.
#
# These are source pins, which are weak by nature: they prove a shape, not a
# behaviour. The behaviour is proved on the device, by pressing a pad through
# the bus and reading the screen back. Keep both.

cd "$(dirname "$0")/../.."

shim=src/schwung_shim.c
cmds=src/host/test_daemon/commands.c

fail() { echo "FAIL: $*" >&2; exit 1; }

for f in "$shim" "$cmds"; do
  [ -f "$f" ] || fail "$f missing"
done

# 1. The drain exists, and reads the TEST ring.
command grep -q 'shadow_midi_inject_peek(test_inject_ui_shm' "$shim" ||
  fail "the shim no longer drains the test bus's own surface ring — injected \
gestures would go back to being invisible to the module on screen"

# 2. It replays onto the route a hardware press takes.
command grep -q 'shadow_ui_midi_publish(hdr, status, d1, d2)' "$shim" ||
  fail "the test-bus drain no longer publishes to the shadow UI — the module \
would never see the gesture"

# 3. 🔴 The drain must NOT consume Move's shared inject ring. Anchored on the
#    peek, because that is what consuming looks like; a mere mention of the
#    pointer elsewhere in the file is fine and expected.
if command grep -q 'shadow_midi_inject_peek(shadow_midi_inject_shm' "$shim"; then
  fail "the shim drains MOVE'S inject ring on the surface path — that ring \
carries dAVEBOx's sequencer output, so the module would hear its own notes as \
input (upstream shipped this bug and needed two commits to unpick it)"
fi

# 4. The drain is BOUNDED. It runs in the SPI callback, where an unbounded loop
#    is a dropout, not a slowdown.
command grep -q 'int budget = 16;' "$shim" ||
  fail "the test-bus drain lost its budget — an unbounded loop in the SPI \
callback is an audio dropout"

# 5. The daemon routes by WHO IS ON SCREEN, not by the caller's assumption.
command grep -q 'g_shm.control->overtake_mode && g_shm.inject_ui' "$cmds" ||
  fail "INJECT_MIDI no longer routes on overtake_mode — it would silently \
deliver to Move while a module is on screen, the original defect"

# 6. ...and the escape hatch for tests that genuinely mean Move still exists.
command grep -q '"INJECT_MIDI_MOVE"' "$cmds" ||
  fail "INJECT_MIDI_MOVE is gone — a co-run/native test has no way to address \
Move once auto-routing is in place"

echo "PASS: test-bus input routes to the surface, not through Move's ring"
