#!/usr/bin/env bash
# PER-MOVE-BUS LFOs (Block 5) — the wiring invariants.
#
# Josh, 2026-09-10: "Add lfos to move tracks b/c they can target the move bus's
# effects." A Move bus is a `master_fx_slot_t` rack exactly like the master one,
# so it gets that rack type's LFOs rather than a new mechanism.
#
# ⚠ Why a SOURCE test and not a unit test: the engine lives in
# shadow_chain_mgmt.c, which is the shim — it cannot be compiled standalone the
# way tests/host's other subjects can. The build proves it COMPILES; this proves
# it is WIRED, which is the failure this codebase actually produces
# ([[a-reachability-audit-is-not-optional-for-a-staged-port]]: a whole file that
# compiles, links and is tested while nothing calls it).
set -u
cd "$(dirname "$0")/../.."

MGMT=src/host/shadow_chain_mgmt.c
HDR=src/host/shadow_chain_mgmt.h
SHIM=src/schwung_shim.c
for f in "$MGMT" "$HDR" "$SHIM"; do
    [ -f "$f" ] || { echo "FAIL: $f missing" >&2; exit 1; }
done

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }
chk() { local d="$1"; shift; if "$@"; then ok "$d"; else bad "$d"; fi; }
# Comments describe the rules; they must not satisfy them. Stripped ONCE into
# temp files — a `code()` shell function is invisible inside `bash -c`, which
# silently turned three of these checks into "command not found" failures.
code() { sed -e 's://.*$::' "$1" | sed -e '/^[[:space:]]*\*/d' -e '/^[[:space:]]*\/\*/d'; }
STRIP="$(mktemp -d)"; trap 'rm -rf "$STRIP"' EXIT
code "$MGMT" > "$STRIP/mgmt.c"
code "$HDR"  > "$STRIP/mgmt.h"
code "$SHIM" > "$STRIP/shim.c"

echo "test_move_bus_lfos"

# ---- 1. IT IS REACHED ------------------------------------------------------
# The whole point. A tick nothing calls is the shape that shipped 1,185 dead
# lines for four commits.
chk "the per-bus LFO tick is CALLED from the shim's audio path" \
    grep -q 'shadow_move_fx_lfo_tick(FRAMES_PER_BLOCK);' "$STRIP/shim.c"
chk "...on the same edge as its master-rack sibling" \
    bash -c "grep -A4 'shadow_master_fx_lfo_tick(FRAMES_PER_BLOCK);' '$STRIP/shim.c' | grep -q 'shadow_move_fx_lfo_tick'"
chk "it is declared in the header, so the shim is not calling an implicit decl" \
    grep -q 'void shadow_move_fx_lfo_tick(int frames);' "$STRIP/mgmt.h"
chk "state is per BUS and per LFO" \
    grep -q 'lfo_state_t shadow_move_fx_lfos\[MOVE_FX_SLOTS\]\[MOVE_FX_LFO_COUNT\];' "$STRIP/mgmt.c"

# ---- 2. A BUS NEVER REACHES ANOTHER BUS ------------------------------------
# An LFO belongs to its track. Crossing buses would let one track's automation
# silently move another track's sound — findable only by ear, and awful.
tick=$(code "$MGMT" | awk '/^void shadow_move_fx_lfo_tick/,/^}$/')
[ -n "$tick" ] || bad "could not isolate the tick body"
chk "the target block is resolved on THIS bus" \
    grep -q 'shadow_move_fx_slots\[bus\]\[target_blk\]' <(printf '%s\n' "$tick")
chk "LFO-to-LFO stays on THIS bus too" \
    grep -q 'shadow_move_fx_lfos\[bus\]\[target_lfo\]' <(printf '%s\n' "$tick")
if printf '%s\n' "$tick" | grep -qE 'shadow_move_fx_(slots|lfos)\[[^b]'; then
    bad "the tick indexes a bus it did not derive from its own loop — cross-bus reach"
else
    ok "⚠ no cross-bus indexing anywhere in the tick"
fi
chk "an LFO never targets itself (that is an unbounded feedback loop)" \
    grep -q 'if (target_lfo == i) continue;' <(printf '%s\n' "$tick")

# ---- 3. THE BASE VALUE ------------------------------------------------------
# Without a remembered base the LFO modulates around the value it last wrote,
# and walks its own target to a rail within seconds.
chk "a base value is snapshotted per (bus, lfo)" \
    grep -q 'move_lfo_base_valid\[bus\]\[i\]' <(printf '%s\n' "$tick")
chk "⚠ changing the TARGET invalidates the base (else it modulates around the old param's value)" \
    bash -c "grep -A3 'strcmp(lp, \"target\") == 0' '$STRIP/mgmt.c' | grep -q 'move_lfo_base_valid\[sl\]\[li\] = 0'"
chk "...and changing target_param does too" \
    bash -c "grep -A3 'strcmp(lp, \"target_param\") == 0' '$STRIP/mgmt.c' | grep -q 'move_lfo_base_valid\[sl\]\[li\] = 0'"

# ---- 4. AN EMPTY BLOCK IS A NO-OP, NOT A CRASH ------------------------------
# Assigning an LFO before loading the effect it is for is an ordinary thing to do.
chk "an unloaded target block is skipped, not dereferenced" \
    grep -q 'if (!mfx->instance || !mfx->api || !mfx->api->set_param) continue;' <(printf '%s\n' "$tick")

# ---- 5. THE PARAM SURFACE ---------------------------------------------------
# Every field the module's existing LFO editor speaks must be answerable, or the
# editor opens on a screen of blanks.
for f in enabled shape rate_hz rate_div sync depth polarity phase_offset retrigger target target_param; do
    n=$(code "$MGMT" | awk '/lfo_state_t \*lfo = &shadow_move_fx_lfos\[sl\]\[li\];/,/Strip-level params/' |
        grep -c "\"$f\"")
    # once in SET, once in GET
    [ "${n:-0}" -ge 2 ] || bad "field '$f' is not handled in BOTH set and get (found $n)"
done
ok "all 11 LFO fields answer on both SET and GET"
chk "the key shape is move_fx:<bus>:lfoN: (same vocabulary as master_fx:lfoN:)" \
    grep -q "strncmp(rest, \"lfo\", 3) == 0" "$STRIP/mgmt.c"

# ---- CONTROLS: prove these checks can fail ----------------------------------
tmp="$STRIP"
printf 'void shadow_move_fx_lfo_tick(int f){ x = shadow_move_fx_slots[2][0]; }\n' > "$tmp/cross.c"
if code "$tmp/cross.c" | awk '/^void shadow_move_fx_lfo_tick/,/^}$/' |
   grep -qE 'shadow_move_fx_(slots|lfos)\[[^b]'; then
    ok "control: cross-bus indexing IS detected"
else
    bad "control: the cross-bus check cannot fire — it is proving nothing"
fi
printf '// shadow_move_fx_lfo_tick(FRAMES_PER_BLOCK);\n' > "$tmp/commented.c"
if grep -q 'shadow_move_fx_lfo_tick(FRAMES_PER_BLOCK);' <(code "$tmp/commented.c"); then
    bad "control: a COMMENTED-OUT call still counts as wired — code() is not stripping"
else
    ok "control: a commented-out call does not count as wired"
fi

[ "$fails" = 0 ] && echo "PASS: test_move_bus_lfos" || echo "FAIL: test_move_bus_lfos" >&2
exit "$fails"
