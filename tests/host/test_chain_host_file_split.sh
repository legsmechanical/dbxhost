#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# 2026-06 cleanup step 10: chain_host.c (6,450 lines post-sweep) split into
# functional units. Pure static-function relocation — no behavior change, no
# exported-symbol change. This pins the structure so it doesn't silently
# re-accrete into one file.

dsp="src/modules/chain/dsp"

# 1. The split files exist and are non-trivial.
declare -A expect_fn=(
  ["chain_json.c"]='int json_get_string\('
  ["chain_params.c"]='int parse_chain_params\('
  ["chain_mod.c"]='void chain_mod_recompute_effective\('
  ["chain_midi.c"]='void v2_on_midi\('
  ["chain_patch.c"]='int v2_parse_patch_file\('
)
for f in chain_json.c chain_params.c chain_mod.c chain_midi.c chain_patch.c chain_internal.h; do
  if [ ! -f "$dsp/$f" ]; then
    echo "FAIL: $dsp/$f missing" >&2
    exit 1
  fi
done

# 2. Representative cluster functions live in their new homes.
for f in "${!expect_fn[@]}"; do
  if ! rg -q "${expect_fn[$f]}" "$dsp/$f"; then
    echo "FAIL: $dsp/$f does not define expected cluster fn (${expect_fn[$f]})" >&2
    exit 1
  fi
done

# 3. chain_host.c keeps only lifecycle/params-entry/render/entry (< 2900 lines).
lines=$(wc -l < "$dsp/chain_host.c")
if [ "$lines" -ge 2900 ]; then
  echo "FAIL: chain_host.c is $lines lines — split regressed (expected < 2900)" >&2
  exit 1
fi

# 4. build.sh compiles every split unit into the chain DSP.
for f in chain_host.c chain_json.c chain_params.c chain_mod.c chain_midi.c chain_patch.c; do
  if ! rg -q "$dsp/$f" scripts/build.sh; then
    echo "FAIL: scripts/build.sh does not compile $dsp/$f" >&2
    exit 1
  fi
done

# 5. Exported-symbol invariant: dsp.so must export exactly the intended set
#    (7 chain entry points + 6 unified_log fns). Cross-TU internals must be
#    hidden-visibility so dlopen'd sub-plugins can't collide with them.
#
#    ⭑ chain_drain_sends was ADDED to this list deliberately (module buses,
#    #453 piece 1). A slot's bus buffers live inside the chain instance and
#    reach the shim by no other route — render_block hands back only the summed
#    slot output — so the shim dlsym's this and passes its send accumulators
#    down. Widening the surface is the cost of that, and it is why this list is
#    a PIN rather than a comment: the next addition has to argue for itself here
#    too, in a diff, rather than appearing quietly.
# ⚠⚠ THIS CHECK CRIES WOLF ACROSS BRANCH SWITCHES, twice on 2026-09-12. `build/`
# is untracked and survives a checkout, so the artifact can have been built from
# a DIFFERENT branch than the want-list below — and the diff then reports a
# symbol "changed" that is simply from another commit. It blocked pre-commit on a
# clean `main`. If this fails and the diff names a symbol you did not touch:
# `rm build/modules/chain/dsp.so` (the check then skips) or rebuild.
# The list stays HARDCODED on purpose — deriving it from the sources would make
# it agree with any addition, and the whole point is that an addition has to
# argue for itself in a diff. [[a-check-that-cries-wolf-is-worse-than-none]]
#
#    ⭑ chain_take_midi_tick_wake is the next such addition (the idle-slot MIDI
#    wake, upstream #432/#436), and its argument is that no existing route can
#    carry the answer. The shim must decide, WITHIN one silent frame and after
#    the "mod:tick" that advances the timers, whether a MIDI FX just delivered a
#    generated note to the synth — because that decision is whether to render
#    this block or leave the slot parked for up to half a second. render_block
#    is the call being skipped, so it cannot report it; set_param returns void;
#    and appending a field to plugin_api_v2_t is exactly what that struct's size
#    contract forbids (a host built against the longer version reads past the
#    end of an older module's). A one-shot getter is the smallest surface that
#    answers it.
#
#    ⭑ chain_midi_fx_apply (2026-09-13) is the next, and its argument is that the
#    transform it exposes is ALREADY a pure function of its input —
#    v2_process_midi_fx takes messages and returns messages, knowing nothing about
#    a synth, a bus or a destination — but it is static, so the only way to reach
#    it is through chain_on_midi, which also SENDS the result to the slot's synth.
#    A sequencer that wants a slot's MIDI FX at a chosen point in its own chain
#    needs the transform WITHOUT the send. No existing route carries that: a
#    set_param returns void, "nothing leaves a chain as MIDI" is about routing
#    rather than calling, and hosting the modules a second time was rejected in
#    the design. An exported delegate that sends nothing is the smallest surface.
#    ⓘ It has NO caller yet, deliberately — see test_chain_midi_fx_apply.sh,
#    which pins that count so adding the first one has to be a conscious edit.
so="build/modules/chain/dsp.so"
if [ -f "$so" ] && command -v nm >/dev/null 2>&1; then
  got=$(nm -D --defined-only "$so" 2>/dev/null | awk '{print $NF}' | sort)
  want=$(printf '%s\n' \
    chain_drain_sends chain_fx_requires_continuous chain_process_fx \
    chain_set_external_fx_mode chain_set_inject_audio \
    chain_take_midi_tick_wake chain_midi_fx_apply move_plugin_init_v2 \
    unified_log unified_log_crash unified_log_enabled unified_log_init \
    unified_log_shutdown unified_log_v | sort)
  if [ "$got" != "$want" ]; then
    echo "FAIL: dsp.so exported symbols changed:" >&2
    diff <(echo "$want") <(echo "$got") >&2 || true
    exit 1
  fi
else
  echo "note: $so absent or nm unavailable — symbol check skipped (build to enable)"
fi

echo "PASS: chain_host split into functional units, symbol surface unchanged"
