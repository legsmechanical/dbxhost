#!/usr/bin/env bash
# THE SHIM USES THE LINK AUDIO CONCEALMENT THE WAY IT HAS TO BE USED
# (ports of upstream #571 and #572's stall gate).
#
# tests/host/test_link_audio_conceal.c proves the pieces. This pins how the
# mixer wires them, because each of these, missing, is a click and not an error:
#   - the 0->1 rebuild edge resets the concealment and the gate, or the first
#     starve after it replays a block last heard before the rebuild stopped;
#   - the frame gate decides rebuild-vs-native from REAL and CONCEALED counts,
#     so a stall on every track falls back to Move's own mix (ramped) instead
#     of fading to silence and then stepping up;
#   - the depth alignment never sees slot 4 — that is Move's MAIN MIX in the
#     sidecar's segment, not a track;
#   - the native crossfade is added AFTER master volume and the speaker EQ,
#     because Move's native mix already carries both.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*"; exit 1; }
S=src/schwung_shim.c

edge=$(awk '/^        if \(entering_rebuild\) \{/ {on=1} on {print; n++} n > 10 {exit}' "$S")
printf '%s\n' "$edge" | grep -q 'link_audio_conceal_reset();' || fail "entering the rebuild does not reset concealment"
printf '%s\n' "$edge" | grep -q 'la_rebuild_gate_reset(&shim_la_gate);' || fail "entering the rebuild does not reset the frame gate"

grep -q 'int la_gate = la_rebuild_gate(&shim_la_gate, la_real, la_concealed);' "$S" \
    || fail "the rebuild decision is not the frame gate over real/concealed counts"
grep -q 'if (r == LA_READ_REAL) la_real++;' "$S" || fail "a real read is not counted"
grep -q 'else if (r == LA_READ_CONCEALED) la_concealed++;' "$S" || fail "a concealed read is not told apart from a real one"
grep -q 'la_ramp_in(mailbox_audio, FRAMES_PER_BLOCK);' "$S" || fail "the fallback to Move's mix is not ramped in"

tick=$(grep -n -A3 'link_audio_align_tick(shadow_in_audio_shm,' "$S")
printf '%s\n' "$tick" | grep -q 'MOVE_TRACK_CHANNELS' || fail "the depth alignment is not bounded by MOVE_TRACK_CHANNELS — slot 4 is Move's main mix"

eq=$(grep -n 'speaker_eq_process(mailbox_audio, FRAMES_PER_BLOCK);' "$S" | sed -n 1p | cut -d: -f1)
xf=$(grep -n 'la_mix_ramp_out(mailbox_audio, la_native_xfade, FRAMES_PER_BLOCK);' "$S" | sed -n 1p | cut -d: -f1)
[ -n "$eq" ] && [ -n "$xf" ] || fail "cannot find the speaker EQ or the native crossfade"
[ "$xf" -gt "$eq" ] || fail "the native crossfade must come AFTER the speaker EQ (native audio already has it)"
echo "PASS: the mixer wires the Link Audio concealment correctly"
