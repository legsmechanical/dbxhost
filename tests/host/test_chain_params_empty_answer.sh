#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A chain component's chain_params are served plugin-first, with the params
# parsed out of the module's own module.json as the fallback beneath. The test
# that chose between them was `result > 0` — "the plugin wrote some bytes".
#
# A module that reads its chain_params from a JSON file at runtime answers "[]"
# when that file is not installed, which it is not in a shipped tarball. Two
# bytes is > 0, so the host discarded the declarations it had already parsed and
# served "[]". The Shadow UI then had no type for any of those params and drove
# every one as a float 0..1: an int wrote a fraction its atoi read as 0, an enum
# took option 0. Reported as "i could see the values change, but when i release,
# it reset to the default" — an edit complaint for a metadata bug two layers
# away, which is exactly why it needs a pin and not a comment.
#
#   RUN   the predicate over the shapes an empty answer really arrives in, the
#         failure cases, and the `result`-bounds rule
#         (tests/host/test_chain_params_empty_answer.c).
#
#   PIN   that EVERY route in chain_host.c uses it, with the count DERIVED
#         from MAX_AUDIO_FX / MAX_MIDI_FX. This fork has SEVEN (1 synth + 4
#         audio-FX + 2 MIDI-FX) where upstream has three, and fixing only the
#         three upstream names would leave the bug on fx2/fx3/fx4/midi_fx2 —
#         i.e. depending on which block the user opened.
#
#   PIN   that the C copy the run half compiles has not drifted from the real
#         definition in chain_internal.h. That header cannot be included in a
#         host test — it pulls in the chain instance, the plugin ABIs and
#         dlfcn — so the copy is checked rather than trusted.

fail() { echo "FAIL: $1"; exit 1; }

H=src/modules/chain/dsp/chain_internal.h
C=src/modules/chain/dsp/chain_host.c
T=tests/host/test_chain_params_empty_answer.c

# ------------------------------------------------------------------ run half
bin="build/tests/test_chain_params_empty_answer"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter "$T" -o "$bin"
"$bin"

# ------------------------------------------------------------------ pin half

# 1. The predicate exists where the production code reads it from.
command grep -q 'static inline int chain_params_answer_is_useful(const char \*buf, int result)' "$H" \
  || fail "chain_params_answer_is_useful is gone from $H"

# 2. EVERY route uses it, and the expected count is DERIVED, not a literal.
#
# ⚠ THIS FORK HAS SEVEN, NOT UPSTREAM'S THREE, and that is the whole reason this
# pin is counted rather than eyeballed. The chain_params route is copied once
# per component: the synth, then one per audio-FX block, then one per MIDI-FX
# block. Upstream ships 2 audio + 1 midi; this fork ships 4 audio + 2 midi
# (the fx1..fx4 divergence in CLAUDE.md), so fixing "the three sites" upstream
# names leaves fx2, fx3, fx4 and midi_fx2 still discarding the fallback — the
# bug would then depend on WHICH block the user opened. That is exactly the
# "any change to FX-block handling must be checked at fx3/fx4 too" trap, and it
# caught this fix in the act.
#
# Derived from the header so a fifth block fails HERE rather than shipping a
# component whose params silently lose their types.
cap_fx=$(sed -n 's/^#define MAX_AUDIO_FX \([0-9]*\).*/\1/p' "$H" | head -1)
cap_midi=$(sed -n 's/^#define MAX_MIDI_FX \([0-9]*\).*/\1/p' "$H" | head -1)
[ -n "$cap_fx" ] && [ -n "$cap_midi" ] || fail "could not read MAX_AUDIO_FX / MAX_MIDI_FX from $H"
want=$((1 + cap_fx + cap_midi))
sites=$(command grep -c 'if (chain_params_answer_is_useful(buf, result)) return result;' "$C" || true)
[ "$sites" = "$want" ] \
  || fail "expected $want chain_params_answer_is_useful call sites in $C (1 synth + $cap_fx audio-FX + $cap_midi MIDI-FX), found $sites"

# The old spelling must not survive beside them. Scoped to the chain_params
# routes: `result > 0` is a perfectly ordinary test elsewhere in this file, so a
# bare grep would cry wolf. Each route is the line following a get_param whose
# subkey is chain_params, which is what the -A window below captures.
stale=$(awk '/strcmp\(subkey, "chain_params"\) == 0/{w=14} w&&w--' "$C" \
        | command grep -c 'if (result > 0) return result;' || true)
[ "$stale" = 0 ] \
  || fail "a chain_params route still returns on \`result > 0\` ($stale left) — an empty array would again discard the module.json fallback"

# 3. The lifted copy has not drifted from the real one. Compare the function
#    bodies with whitespace collapsed, so reformatting is allowed and a changed
#    RULE is not.
body() { awk "/int chain_params_answer_is_useful\(/,/^}/" "$1" | tr -s '[:space:]' ' '; }
[ "$(body "$H")" = "$(body "$T")" ] \
  || fail "the copy in $T has drifted from the definition in $H — the run half is testing something the host does not do"

echo "PASS: an empty chain_params answer falls back to module.json, on every route"
