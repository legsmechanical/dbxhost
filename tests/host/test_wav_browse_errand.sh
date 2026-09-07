#!/usr/bin/env bash
# The browser the WAVE EDITOR opens must come back to the waveform.
#
# ⚠⚠ BOTH EXITS STRANDED THE USER, and neither said so. `VIEW_FILE`'s Back steps
# to `VIEW_MENU` and `fileActivate` lands there too — davebox's own hierarchy
# menu. From the wave editor you never came through it, and its `S.menuRowsCache`
# was never built, because the dive out of the knob grid does not ask for a
# discover. So you pick a sample and arrive at an empty list with the waveform
# you were looking at gone.
#
# ⭑ THE EDITOR IS LEFT OPEN UNDERNEATH — `wavEditClose()` is deliberately NOT
# called on the way to the browser. Coming back is then a view change with
# nothing to rebuild, and `refreshSourcePath` notices the newly-picked value on
# the next tick and re-streams the peaks, which is the entire point of having
# gone. Closing it would mean re-deriving the marker, its group and its zoom
# from a fullKey the browser does not carry.
#
# Pinned as SOURCE. The gesture rig for this lives in the JS suite and cannot
# reach the marker cell yet — DR32's per-pad knob pages do not appear in the
# off-device plan (they do on the device: the pass reported markers on every
# pad), so the rig is wrong and running it down is its own job. A pin that says
# what the code must do is worth more than a rig that cannot yet drive it.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = strip(readFileSync("davebox/ui/ui_sound.mjs", "utf8"));
const body = (needle) => {
    const at = src.indexOf(needle);
    if (at < 0) throw new Error("anchor not found: " + needle);
    let d = 0, i = src.indexOf("{", at);
    for (;; i++) { const c = src[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) break; } }
    return src.slice(at, i + 1);
};

ok(/\blet wavErrand = false;/.test(src), "the errand crumb exists");

/* ---- the way out: the browser opens with the editor still alive ---------- */
const nSetTrue = (src.match(/wavErrand = true;/g) || []).length;
ok(nSetTrue === 1, "exactly one place sets the errand — the Shift+click browse (" + nSetTrue + ")");
const openIdx = src.indexOf("wavErrand = true;");
const browseWindow = src.slice(openIdx, src.indexOf("openFileBrowser(", openIdx) + 20);
ok(browseWindow.indexOf("openFileBrowser(") > 0,
   "...and it is the statement immediately before openFileBrowser");
ok(!/wavEditClose\(\);\s*wavErrand = true;/.test(src) &&
   browseWindow.indexOf("wavEditClose") < 0,
   "⭑ the editor is NOT closed on the way out — the return has nothing to rebuild");

/* ---- Back ---------------------------------------------------------------- */
ok(/if \(S\.view === VIEW_FILE && wavErrand\) \{[\s\S]{0,120}S\.view = VIEW_WAV;/.test(src),
   "Back from the browser returns to the WAVEFORM");
/* ⚠ ORDER IS THE WHOLE FIX. davebox`s own per-view tree steps up ITS screens,
 * so a branch placed after it never runs — the VIEW_FILE -> VIEW_MENU edge
 * would win and the strand would be back with the test still green. */
const backErrand = src.indexOf("if (S.view === VIEW_FILE && wavErrand)");
/* ⚠ ANCHOR ON THE EDGE, NOT THE TEST. `} else if (S.view === VIEW_FILE) {`
 * appears twice — the jog handler moves the browser selection with the same
 * spelling and comes FIRST in the file — so matching the condition alone
 * measured against the wrong branch and failed a correct tree. */
const backGeneric = src.search(/\} else if \(S\.view === VIEW_FILE\) \{\s*S\.view = VIEW_MENU;/);
ok(backErrand >= 0 && backGeneric >= 0 && backErrand < backGeneric,
   "...and it is tested BEFORE davebox`s own VIEW_FILE -> VIEW_MENU edge (" +
   backErrand + " < " + backGeneric + ")");

/* ---- a pick -------------------------------------------------------------- */
const act = body("function fileActivate(");
ok(/S\.view = \(wavErrand \? VIEW_WAV : VIEW_MENU\);/.test(act),
   "a PICK returns to the waveform too, and to VIEW_MENU otherwise");
ok(/wavErrand = false;/.test(act), "...and the crumb is dropped as it is spent");

/* ---- it cannot outlive the screen ---------------------------------------- */
const clears = (src.match(/wavErrand = false;/g) || []).length;
ok(clears >= 4,
   "the crumb is cleared on every exit — pick, Back, the click exit and the " +
   "editor reset (" + clears + " sites)");
ok(/ppErrandView = null; wavErrand = false;/.test(src),
   "...including the reset that clears the editor`s other crumbs");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the wave editor`s file browse comes back to the waveform");
'
