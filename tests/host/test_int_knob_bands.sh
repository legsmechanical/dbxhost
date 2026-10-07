#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# HOW MANY DETENTS AN INT KNOB TAKES PER VALUE (port of upstream #624's end state).
#
#   2..16 values   a choice of N things: the list's gate (ENUM_DELTA_DIV)
#   17..48 values  transposes, bend ranges, semitone depths — values you LAND
#                  on. At one per detent a +-12 pitch crossed half its range in
#                  a flick; at two it was "still too hard" on the device. Same
#                  gate as a list — but still a NUMBER (isNarrowInt is false).
#   wider          one per detent: 0..127 is already slow enough to read.
#
# The BOUNDARIES are what is pinned, not the constant.

command -v node >/dev/null 2>&1 || { echo "FAIL: node is required" >&2; exit 1; }

node --input-type=module -e '
const KE = await import(process.cwd() + "/src/shared/knob_engine.mjs");
let fails = 0;
const fail = (m) => { console.error("FAIL: " + m); fails++; };
const gated = (min, max) => KE.detentsPerStep({ type: "int", min, max });

if (gated(1, 16) !== KE.ENUM_DELTA_DIV) fail("a 1..16 selector steps once per detent");
if (gated(1, 16) !== gated(0, 4)) fail("a narrow int and a narrower one step differently");
if (gated(-12, 12) !== KE.ENUM_DELTA_DIV || gated(-24, 24) !== KE.ENUM_DELTA_DIV)
  fail("a +-12 / +-24 semitone int does not step like a selector — too fast to land on");
if (gated(0, 17) !== KE.ENUM_DELTA_DIV) fail("the band does not start right above the narrow one (0..17)");
if (gated(0, 48) !== KE.ENUM_DELTA_DIV) fail("the band does not reach 48");
if (gated(0, 49) !== 1) fail("an int wider than 48 is gated — 0..127 is already slow at one per detent");
if (gated(0, 127) !== 1) fail("0..127 is gated");
if (gated(0, 1) !== 1) fail("a two-value int went on the gate (it is a toggle, latched elsewhere)");
if (KE.detentsPerStep({ type: "int", min: -24, max: 24, knobAcceleration: "wide" }) !== 1)
  fail("knobAcceleration wide no longer opts out");
if (KE.detentsPerStep({ type: "float", min: -24, max: 24 }) !== 1) fail("a float went on the gate");
/* ...and the mid band is still a NUMBER, never a choice list. */
if (KE.isNarrowInt({ type: "int", min: -12, max: 12 }) || !KE.isNarrowInt({ type: "int", min: 1, max: 16 }))
  fail("isNarrowInt drifted from the 2..16 band");
if (fails) process.exit(1);
console.log("PASS: int knobs — 2..16 and 17..48 values take the list gate, wider is one per detent");
'
