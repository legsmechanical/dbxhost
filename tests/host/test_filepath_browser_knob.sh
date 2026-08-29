#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# While the filepath browser is up, a knob must SCROLL IT.
#
# You reach it by holding a knob on the grid and clicking, so the hand is
# already on the knob and the reflex is to keep turning.
#
# The half worth pinning is the CORRECTNESS half, not the affordance: without
# the route, a turn fell through to handleKnobTurn and wrote knob_N_adjust
# into the SELECTED SLOT's global knob mapping. Behind a full-screen browser,
# so the only visible sign was the legacy "Knob 1" card drawn over the file
# list, which reads as a cosmetic glitch and is not one.
#
# Adapted from upstream schwung tests/host/test_filepath_browser_knob.sh. This
# fork has no src/shared/param_pages/list_knob.mjs, so the accumulator is a
# pair of locals in shadow_ui.js and the pins name those instead.

file="src/shadow/shadow_ui.js"

# ---------------------------------------------------------------- source pins

block=$(awk '/Handle knob CCs \(71-78\) for parameter control/,/adjustKnobAndShow\(knobIndex, delta\)/' "$file")
if [ -z "$block" ]; then
  echo "FAIL: could not find the knob CC handler in $file" >&2
  exit 1
fi

if ! grep -q "VIEWS.FILEPATH_BROWSER" <<<"$block"; then
  echo "FAIL: a knob turn is not routed to the filepath browser." >&2
  echo "      It falls through to handleKnobTurn, which writes knob_N_adjust" >&2
  echo "      to the selected slot behind the browser." >&2
  exit 1
fi
if ! grep -q "filepathBrowserJog" <<<"$block"; then
  echo "FAIL: the FILEPATH_BROWSER branch does not call filepathBrowserJog" >&2
  exit 1
fi

# ORDER: before adjustKnobAndShow/handleKnobTurn, or the write happens first
# and the scroll is dead code.
fp_line=$(grep -n "VIEWS.FILEPATH_BROWSER" <<<"$block" | head -n 1 | cut -d: -f1)
adj_line=$(grep -n "adjustKnobAndShow(knobIndex, delta)" <<<"$block" | head -n 1 | cut -d: -f1)
if [ -z "$fp_line" ] || [ -z "$adj_line" ] || [ "$fp_line" -ge "$adj_line" ]; then
  echo "FAIL: the FILEPATH_BROWSER route must come BEFORE adjustKnobAndShow" >&2
  echo "      (browser at line $fp_line, adjustKnobAndShow at $adj_line)" >&2
  exit 1
fi

# And it must RETURN, or the turn scrolls AND writes.
if ! sed -n "${fp_line},\$p" <<<"$block" | sed -n '1,20p' | grep -q "return;"; then
  echo "FAIL: the FILEPATH_BROWSER branch does not return — the turn would" >&2
  echo "      scroll the list AND edit the slot mapping underneath it." >&2
  exit 1
fi

# It must go through the accumulator, not 1:1. A jog detent is a click; a knob
# detent is a fraction of a twist, and a Samples folder is long.
if ! sed -n "${fp_line},\$p" <<<"$block" | sed -n '1,20p' | grep -q "filepathBrowserKnobAccum"; then
  echo "FAIL: the FILEPATH_BROWSER branch does not use filepathBrowserKnobAccum" >&2
  echo "      — a 1:1 knob is the 'way too fast' the accumulator exists to fix." >&2
  exit 1
fi

# The accumulator must be RESET when the browser opens, or the banked partial
# turn from the last list carries into this one.
if ! awk '/^function openHierarchyFilepathBrowser\(/,/^}/' "$file" \
     | grep -q "filepathBrowserKnobAccum = 0"; then
  echo "FAIL: openHierarchyFilepathBrowser does not reset filepathBrowserKnobAccum" >&2
  exit 1
fi

# A knob TOUCH must raise nothing while the browser is up: the legacy card
# covers the very rows being scrolled, and it names a mapping the turn is no
# longer writing.
if ! awk '/Use shared knob overlay for hierarchy\/chain editor contexts/{print prev6; print prev5; print prev4; print prev3; print prev2; print prev1; print; f=1} {prev6=prev5; prev5=prev4; prev4=prev3; prev3=prev2; prev2=prev1; prev1=$0}' "$file" \
     | grep -q "VIEWS.FILEPATH_BROWSER"; then
  echo "FAIL: a knob TOUCH still raises the legacy overlay over the browser." >&2
  exit 1
fi

# The jog case must DELEGATE to the same helper. Two copies is how the knob
# path ends up scrolling without auditioning or speaking.
jog_case=$(awk '/case VIEWS.FILEPATH_BROWSER:/{f=1} f{print} f&&/break;/{exit}' "$file")
if ! grep -q "filepathBrowserJog(delta)" <<<"$jog_case"; then
  echo "FAIL: the jog case does not delegate to filepathBrowserJog — the knob" >&2
  echo "      and the jog can now drift apart on preview and announcement." >&2
  exit 1
fi

echo "  ok  source: knob routed to the browser, before the fallthrough, via the accumulator"

# ------------------------------------------------------- behaviour: lift & run
#
# The helper is lifted out of the real file and driven against the real
# moveFilepathBrowserSelection, so this cannot pass against a reimplementation.

node --input-type=module -e '
import fs from "node:fs";

/* filepath_browser.mjs cannot be imported here: it pulls in session_state.mjs,
 * which imports QuickJS "std". Lift the one function out of the real file
 * instead, so this still drives the shipped implementation rather than a
 * restatement of it. */
const shared = fs.readFileSync("src/shared/filepath_browser.mjs", "utf8");
const mv = shared.match(/export function moveFilepathBrowserSelection\(state, delta\) \{[\s\S]*?\n\}/);
if (!mv) { console.error("FAIL: moveFilepathBrowserSelection not found in src/shared/filepath_browser.mjs"); process.exit(1); }
const moveFilepathBrowserSelection = new Function(
    mv[0].replace(/^export /, "") + "; return moveFilepathBrowserSelection;"
)();

const src = fs.readFileSync("src/shadow/shadow_ui.js", "utf8");
const m = src.match(/function filepathBrowserJog\(delta\) \{[\s\S]*?\n\}/);
if (!m) { console.error("FAIL: filepathBrowserJog not found"); process.exit(1); }

let announced = [];
const state = {
    items: [
        { kind: "up",   label: "..",   path: "/x" },
        { kind: "file", label: "a.wav", path: "/x/a.wav" },
        { kind: "file", label: "b.wav", path: "/x/b.wav" },
        { kind: "file", label: "c.wav", path: "/x/c.wav" },
        { kind: "file", label: "d.wav", path: "/x/d.wav" },
    ],
    selectedIndex: 0,
    livePreviewEnabled: true,
    previewPendingPath: "",
    previewPendingTime: 0,
};

const jog = new Function(
    "filepathBrowserState", "moveFilepathBrowserSelection", "announceMenuItem",
    m[0] + "; return filepathBrowserJog;"
)(state, moveFilepathBrowserSelection, (l, v) => announced.push(l));

// A scroll moves the highlight, arms the audition, and speaks the row.
jog(1);
if (state.selectedIndex === 0) { console.error("FAIL: the scroll did not move the selection"); process.exit(1); }
const sel = state.items[state.selectedIndex];
if (sel.kind === "file" && state.previewPendingPath !== sel.path) {
    console.error("FAIL: the scroll did not arm the live preview");
    process.exit(1);
}
if (announced.length !== 1) {
    console.error("FAIL: the scroll did not announce the row");
    process.exit(1);
}

// It clamps at both ends: a fast turn can deliver a step bigger than the list.
jog(999);
if (state.selectedIndex !== state.items.length - 1) {
    console.error("FAIL: an oversized step ran off the end"); process.exit(1);
}
jog(-999);
if (state.selectedIndex !== 0) {
    console.error("FAIL: an oversized negative step ran off the start"); process.exit(1);
}

// A non-file row (".." / a directory) must CLEAR the pending audition rather
// than leaving the previous file armed to play after you have walked away.
state.selectedIndex = 1; jog(0);
if (state.previewPendingPath !== "/x/a.wav") { console.error("FAIL: file row did not arm"); process.exit(1); }
jog(-1);
if (state.previewPendingPath !== "" || state.previewPendingTime !== 0) {
    console.error("FAIL: a directory row left a stale audition armed"); process.exit(1);
}
console.log("  ok  behaviour: scrolls, auditions, announces, clamps, clears on a non-file row");
'

echo "PASS: a knob scrolls the filepath browser instead of editing the slot behind it"
