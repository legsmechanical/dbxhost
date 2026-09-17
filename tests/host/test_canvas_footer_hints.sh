#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# WHAT A CANVAS SAYS AT THE BOTTOM OF THE SCREEN -- ONE DEFINITION, TWO HOSTS.
#
# The host draws this footer and dAVEBOx draws its own, and for one afternoon
# they said DIFFERENT THINGS: the host showed the parameter value and title,
# davebox showed a Back hint, because whoever wrote the second followed the
# local chrome idiom without comparing the two. Found on hardware, not here.
# Dress may differ between those surfaces; content may not. So the decision is
# a shared function and each side only renders it.
#
# What it must say on an enterable canvas:
#
#   BACK UP      Back would climb a level -- the module answers `canGoUp`
#   BACK EXIT    Back would leave, because the module is at its top
#   JOG PAGES    only while Shift is down: the escape hatch, advertised when it
#                is live rather than cluttering every frame
#
# A visualiser gets NO hints and keeps the old value/title footer, because a
# screen you only look at has nothing else to say and its click still closes it.
#
# NO APOSTROPHES inside the node script: single-quoted bash string.

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required" >&2
  exit 1
fi

node --input-type=module -e '
import { canvasHints, canvasCanGoUp, HINT_UP, HINT_EXIT, HINT_PAGES }
  from "./src/shared/param_pages/canvas_hints.mjs";
import { missingGlyphs4x5, fontWidth4x5 } from "./src/shared/param_pages/font4x5.mjs";
import { readFileSync } from "node:fs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fail++; };
const shape = (o) => canvasHints(o).map((h) => h.key + ":" + h.action).join(" ");

/* ---- the decision --------------------------------------------------- */

ok(shape({}) === "", "a visualiser gets no hints, so its value footer stands");
ok(shape({ enterable: true, canGoUp: true }) === "back:" + HINT_UP,
   "a canvas that can climb shows the up arrow");
ok(shape({ enterable: true }) === "back:" + HINT_EXIT,
   "at its top level it shows EXIT instead");
ok(shape({ enterable: true, shiftHeld: true }) === "jog:" + HINT_PAGES + " back:" + HINT_EXIT,
   "Shift advertises the escape hatch");
ok(shape({ enterable: true, canGoUp: true, shiftHeld: true })
     === "jog:" + HINT_PAGES + " back:" + HINT_UP,
   "...alongside the arrow, not instead of it");

/* The escape hatch must come FIRST: Back is pinned to the right edge on both
   surfaces, and a hint appearing between them would shove it. */
const withShift = canvasHints({ enterable: true, shiftHeld: true });
ok(withShift[0].key === "jog" && withShift[withShift.length - 1].key === "back",
   "Back stays last, so the pinned right-hand hint does not move");

/* ---- the words -------------------------------------------------------- */

/* ⚠ WORDS, NOT A GLYPH, and that is a decision rather than an oversight. An
   arrow reads better mid-navigation and was built first -- but font4x5 has no
   arrow, and adding one meant a 60th character in a table the eleven frozen
   typeface studies of the style catalog are each checked complete against, plus
   the same glyph again in davebox transcription of that font. Both words must
   be renderable by the font both hosts draw with, which is the check that
   actually matters: a missing glyph renders as NOTHING, silently. */
for (const w of [HINT_UP, HINT_EXIT, HINT_PAGES]) {
  ok(Object.keys(missingGlyphs4x5(w.toUpperCase())).length === 0,
     "font4x5 can draw " + JSON.stringify(w.toUpperCase()));
}

/* ---- asking the module ----------------------------------------------- */

ok(canvasCanGoUp(null, {}) === false, "no overlay cannot climb");
ok(canvasCanGoUp({}, {}) === false,
   "a module that does not answer is assumed to be at its top -- a wrong hint is worse than none");
ok(canvasCanGoUp({ canGoUp: () => true }, {}) === true, "a module that says yes is believed");
ok(canvasCanGoUp({ canGoUp: () => "yes" }, {}) === false, "...but only for a literal true");

/* ⭐ A THROW IS A NO. The hint is cosmetic and must never take the screen down,
   and a module whose navigation is broken is exactly the one that should not be
   promising a level it cannot climb. */
let threw = false;
try {
  ok(canvasCanGoUp({ canGoUp: () => { throw new Error("boom"); } }, {}) === false,
     "a throwing canGoUp answers NO rather than propagating");
} catch (e) { threw = true; }
ok(!threw, "...and does not escape into the draw path");

/* ---- the host renders the decision, rather than deciding again -------- */

const src = readFileSync("src/shadow/shadow_ui.js", "utf8");
const draw = src.slice(src.indexOf("function drawCanvasPreview"));
const body = draw.slice(0, draw.indexOf("\nfunction "));
ok(/canvasHints\(/.test(body), "drawCanvasPreview asks the shared decision");
ok(/canvasCanGoUp\(/.test(body), "...including whether the module can climb");
ok(/isShiftHeld\(\)/.test(body), "...and whether Shift is down");
ok(body.indexOf("canvasHints(") < body.indexOf("formatHierDisplayValue"),
   "hints are chosen BEFORE the value footer, which is now the visualiser fallback");

if (fail) { console.error("test_canvas_footer_hints: " + fail + " FAILURE(S)"); process.exit(1); }
console.log("PASS: one footer decision, rendered by both hosts");
'
