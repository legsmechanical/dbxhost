#!/usr/bin/env bash
# The feedback guard must not ask every slot for its synth module on every
# pass: that was ~130 round-trips a second at idle (keyed OTLP trace,
# 2026-09-02) for an answer that changes only on a module swap.
set -euo pipefail
cd "$(dirname "$0")/../.."
f() { echo "FAIL: $*"; exit 1; }
J=src/shadow/shadow_ui.js
grep -q 'const moduleId = feedbackSlotModuleId(slot);' $J || f "reconcileFeedbackHolds must read the module id through the cache"
grep -q 'now - _feedbackModuleCacheAt > FEEDBACK_MODULE_CACHE_MS' $J || f "the cache must be time-bounded"
grep -q 'invalidateFeedbackModuleCache();' $J || f "a module-signature change must invalidate the cache"
awk '/^function reconcileFeedbackHolds\(\)/,/^}/' $J | grep -q 'getSlotParam(slot, "synth_module")' && f "reconcileFeedbackHolds still reads synth_module directly"
echo "PASS: the feedback guard reads slot modules from a time-bounded, swap-invalidated cache"
