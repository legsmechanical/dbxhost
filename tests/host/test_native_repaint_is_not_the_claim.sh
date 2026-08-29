#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# The JS half of the skip_led_clear / native_repaint_on_exit split.
#
# tests/host/test_overtake_native_led_repaint.c pins the AUDIO side: a standing
# skip_led_clear claim must not be read as an exit request. That test cannot
# see the other half of the same bug, which is a JS site asking for a native
# repaint by raising the CLAIM byte -- which is exactly how the regression
# shipped (25f73f81, copying upstream, where one byte carries both meanings).
#
# THE TWO MEANINGS, and why they cannot share a byte in this fork:
#
#   skip_led_clear            a PERSISTENT CLAIM. davebox's primary-services
#                             layer holds it for a whole move_native co-run
#                             session (PRIMARY_SERVICES.move_native claims
#                             skip_led_clear: 1). Project management runs on it.
#   native_repaint_on_exit    a ONE-SHOT about a single exit, consumed by the
#                             audio side at the overtake->0 transition.
#
# Observed on hardware with them merged: project management showed no pad LEDs,
# and loading a project showed PM's stale pattern inside davebox.

fail() { echo "FAIL: $1" >&2; exit 1; }
file="src/shadow/shadow_ui.js"

# --- the suspend site asks with the ONE-SHOT byte ---------------------------
#
# Anchored inside suspendOvertakeMode, not file-wide: a match anywhere else
# would satisfy a count while the suspend path went back to raising the claim.
susp=$(awk '/^function suspendOvertakeMode/,/^}/' "$file")
[ -n "$susp" ] || fail "suspendOvertakeMode is gone -- this test no longer measures anything"
command grep -q "shadow_set_native_repaint_on_exit(1);" <<<"$susp" || \
  fail "suspendOvertakeMode does not request the native repaint on its own byte"
command grep -q "shadow_set_skip_led_clear" <<<"$susp" && \
  fail "suspendOvertakeMode touches skip_led_clear -- that byte is a standing claim, \
not an exit request, and raising it here is the hardware regression"

# The request must be set BEFORE the mode drops, or the audio side observes the
# transition with the byte still clear and the request is simply lost.
rl=$(command grep -n "shadow_set_native_repaint_on_exit(1);" "$file" | head -n 1 | cut -d: -f1)
ml=$(command grep -n "shadow_set_overtake_mode(0);" "$file" | head -n 1 | cut -d: -f1)
[ -n "$rl" ] && [ -n "$ml" ] && [ "$rl" -lt "$ml" ] || \
  fail "the repaint request is set AFTER the mode drop (request $rl, drop $ml) -- it is lost"
echo "  ok  the suspend path asks on native_repaint_on_exit, before the mode drops"

# --- nobody clears the one-shot from JS -------------------------------------
#
# The audio thread consumes it. A JS clear races that thread, which is the
# other defect 25f73f81 was written to fix; it must not come back.
command grep -q "shadow_set_native_repaint_on_exit(0)" "$file" && \
  fail "JS clears the one-shot -- the audio side consumes it, and clearing here races that thread"
echo "  ok  JS never clears the one-shot"

# --- no capability probe on the new binding ---------------------------------
#
# Fork invariant: one host and one module, shipped together, so a typeof gate
# on a host binding can only ever be true. The backport's hunks arrived with
# them.
command grep -qE 'typeof shadow_set_native_repaint_on_exit' "$file" && \
  fail "the new binding is behind a typeof probe -- there is one host, the binding exists"
susp_gate=$(command grep -c 'typeof shadow_set_skip_led_clear' <<<"$susp" || true)
[ "$susp_gate" = "0" ] || fail "the suspend path still carries a skip_led_clear typeof probe"
echo "  ok  no capability probe on the repaint binding"

# --- the binding is actually registered -------------------------------------
command grep -q 'JS_SetPropertyStr(ctx, global_obj, "shadow_set_native_repaint_on_exit"' \
  src/shadow/shadow_ui.c || fail "shadow_set_native_repaint_on_exit is never registered as a global"
command grep -q "shadow_control->native_repaint_on_exit" src/shadow/shadow_ui.c || \
  fail "the binding does not write native_repaint_on_exit"
echo "  ok  the binding exists and writes its own byte"

# --- the audio side reads the one-shot, and never the claim ------------------
led="src/host/shadow_led_queue.c"
command grep -q "int native_repaint = (ctrl && ctrl->native_repaint_on_exit) ? 1 : 0;" "$led" || \
  fail "the exit transition does not compute native_repaint from native_repaint_on_exit"
command grep -q "ctrl->native_repaint_on_exit = 0;" "$led" || \
  fail "the exit transition never consumes the one-shot -- it would fire on every later exit"
command grep -q "ctrl->skip_led_clear = 0;" "$led" && \
  fail "the audio side clears skip_led_clear -- it is a standing claim, and the claim reconciler \
in shadow_ui_primary.mjs is edge-triggered, so it would never be re-applied"
echo "  ok  the audio side reads and consumes the one-shot, and leaves the claim alone"

# --- the claim really is persistent, which is the premise of all of the above -
command grep -q "skip_led_clear: 1," "$file" || \
  fail "PRIMARY_SERVICES no longer claims skip_led_clear -- if that is deliberate, this \
whole split may need revisiting; if not, davebox has lost its LED passthrough"
command grep -q 'if (p\[key\] !== n\[key\]) ops.push' src/shadow/shadow_ui_primary.mjs || \
  fail "the claim reconciler is no longer edge-triggered -- re-check whether consuming a \
claim byte from C is still unsafe"
echo "  ok  the claim is still persistent and its reconciler still edge-triggered"

echo "PASS: the native-repaint request and the skip_led_clear claim are separate"
