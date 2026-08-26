#!/usr/bin/env bash
# The bank-knob curve is a PORT of the host's generated-canvas knob engine, and
# a port silently rots. Josh's requirement is not "some acceleration" — it is
# "the generated canvas ui knobs feel perfect. i want that" (2026-08-26). If
# src/shared/knob_engine.mjs is ever retuned, dAVEBOx must be retuned with it or
# it stops meeting the requirement while every behaviour test still passes.
#
# So this pins the NUMBERS in davebox against the numbers in the engine, read
# out of both files' CODE — never a comment claiming they agree.
#
# ⚠ It deliberately does NOT pin the divisor LADDER's shape or the pick/delib
# divisors: those are dAVEBOx's own (KNOB_DELIB has no canvas counterpart), and
# over-pinning turns a tuning session into a test-fixing session.

set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$HERE/../src/shared/knob_engine.mjs"
DBX="$HERE/ui/ui_input_cc.mjs"
fails=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fails=1; }

echo "knob curve: dAVEBOx vs the host's generated-canvas engine"

if [ ! -f "$ENGINE" ]; then
    bad "the host engine is missing at $ENGINE — the port has no source of truth"
    echo "test_knob_curve_matches_host: FAIL"; exit 1
fi

# Pull `const NAME = <number>` out of a file, ignoring anything in a comment by
# requiring the declaration to start the line (both files declare at top level).
# ⚠ `(export )?` matters: adding `export` to a pinned constant made this
# extractor match nothing, and a blank extraction fails every comparison below.
# That is the test working — it noticed a change to the line it pins — but the
# pattern has to track the declaration, not one spelling of it.
num_of() { grep -E "^(export )?const $2[[:space:]]*=[[:space:]]*[0-9]+" "$1" | head -1 | grep -oE '[0-9]+' | head -1; }

for c in KNOB_ACCEL_FAST_MS KNOB_ACCEL_MED_MS KNOB_STALE_MS; do
    e="$(num_of "$ENGINE" "$c")"
    d="$(num_of "$DBX" "$c")"
    if [ -z "$e" ]; then bad "$c not found in the host engine (renamed? the port is now unpinned)"
    elif [ -z "$d" ]; then bad "$c not found in dAVEBOx"
    elif [ "$e" != "$d" ]; then bad "$c: host=$e dAVEBOx=$d — the port has drifted"
    else ok "$c = $e in both"
    fi
done

# The enum divisor is the host's one tunable for discrete params; dAVEBOx's
# KNOB_PICK is its counterpart and Josh asked for that feel specifically.
e_enum="$(grep -oE 'enumDivisor[[:space:]]*=[[:space:]]*[0-9]+' "$ENGINE" | grep -oE '[0-9]+' | head -1)"
d_pick="$(grep -oE '^(export )?const KNOB_PICK[[:space:]]*=[[:space:]]*[0-9]+' "$DBX" | grep -oE '[0-9]+' | head -1)"
if [ -z "$e_enum" ]; then bad "the host's enum divisor was not found — renamed?"
elif [ "$e_enum" != "$d_pick" ]; then bad "enum pace: host=$e_enum KNOB_PICK=$d_pick"
else ok "discrete pace matches the host's enum divisor ($e_enum)"
fi

# Control: the pin must be able to FAIL. A grep that matches nothing reports
# "ok" for every comparison above, which is the failure mode this guards.
if num_of "$ENGINE" KNOB_ACCEL_FAST_MS >/dev/null && \
   [ -n "$(num_of "$ENGINE" KNOB_ACCEL_FAST_MS)" ]; then
    ok "⚠ control: the extractor really did read a number out of the engine"
else
    bad "⚠ control: the extractor read nothing — every comparison above was vacuous"
fi

if [ "$fails" -ne 0 ]; then echo "test_knob_curve_matches_host: FAIL"; exit 1; fi
echo "test_knob_curve_matches_host: PASS"
