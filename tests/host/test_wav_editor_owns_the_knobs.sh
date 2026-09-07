#!/usr/bin/env bash
# While the wave editor is up, ALL EIGHT knobs belong to it.
#
# ⚠⚠ THE BUG THIS PINS, and it is not the obvious one. "An unclaimed knob falls
# through to the module's own row" was the intent, and it was WRONG twice over:
#
#   1. By the time this screen is up, openParamEditor has already called
#      exitParamPages() and cleared ppOn — the module's knob row is TORN DOWN.
#   2. What is actually underneath is `levelsActive()`, which is true on any
#      view that is not VIEW_EDIT. So an unclaimed encoder reached onLevelTurn
#      and moved the TRACK'S CHAIN LEVEL — silently, on a screen showing a
#      waveform, with nothing naming what changed.
#
# A single-marker module (no view_group — the shape docs/MODULES.md documents)
# claims no knobs at all, so that was K1-K7 on the commonest declaration.
#
# The ROLE table still decides what a knob DOES (and a legacy marker still takes
# no role — pinned in davebox/tests/js/test_wav_editor.mjs). This pins who OWNS
# the event, which is the view.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };

const src = readFileSync("davebox/ui/ui_sound.mjs", "utf8");

/* STRUCTURAL WINDOW: the knob block itself, from its own comment to the end of
 * the `if`. Fails loudly rather than passing on an empty slice. */
/* ⚠ ANCHOR ON THE COMMENT. `if (d1 >= 71 && d1 <= 78) {` appears TWICE — the
 * first is inside the ppOn (grid) block and is not the branch that owns the
 * knobs on davebox`s own views. A first cut of this test matched that one, got
 * a 491-char window, and reported the wave editor missing from a tree that had
 * it. The size control below is tightened to match. */
const at = src.indexOf("if (d1 >= 71 && d1 <= 78) {                        /* knobs 1-8 */");
if (at < 0) { console.log("FAIL: the `knobs 1-8` branch was not found in ui_sound.mjs"); process.exit(1); }
const open = src.indexOf("{", at);
let d = 0, i = open;
for (;; i++) {
  const c = src[i];
  if (c === undefined) { console.log("FAIL: unterminated knob branch"); process.exit(1); }
  if (c === "{") d++; else if (c === "}") { d--; if (d === 0) break; }
}
const raw = src.slice(at, i + 1);
/* ⚠⚠ COMMENTS STRIPPED BEFORE ANY ORDERING CHECK. The first cut compared
 * positions in the raw text and failed a CORRECT tree, because the paragraph
 * EXPLAINING the levelsActive hazard sits above the code that avoids it — the
 * pin was reading its own prose. A source pin must read CODE. */
const body = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(body.length > 600 && body.length < 6000,
   "control: the knob branch was extracted (" + body.length + " chars)");

const wavAt = body.indexOf("S.view === VIEW_WAV");
ok(wavAt >= 0, "the knob branch tests for the wave editor");

/* It must come FIRST — before every other owner in the block. */
const others = ["macrosActive()", "midiMixActive()", "levelsActive()", "S.view === VIEW_EDIT"];
for (const o of others) {
  const p = body.indexOf(o);
  ok(p < 0 || wavAt < p, `the wave editor is tested before ${o}`);
}

/* And it must CONSUME unconditionally: an early `return true` that does not
 * depend on what wavEditOnKnob answered. */
const seg = body.slice(wavAt, body.indexOf("if (S.view === VIEW_EDIT)", wavAt) + 1 || undefined);
ok(/return true;/.test(seg), "it returns true — the event does not fall through");
ok(!/if \(wavEditOnKnob\([^)]*\)\)\s*\{/.test(seg),
   "the return is NOT conditional on wavEditOnKnob — an unclaimed knob must be " +
   "swallowed too, or it reaches the track levels");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the wave editor owns every knob while it is up");
'
