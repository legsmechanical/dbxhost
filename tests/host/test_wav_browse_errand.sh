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

/* ---- the OPEN is deferred to tick ---------------------------------------- */
/* ⚠⚠ A BLOCKING READ AND A readdir INSIDE THE MIDI CC HANDLER stall the tick,
 * and a stalled tick tail-drops the 64-slot input ring. The event most likely
 * to be lost is a note RELEASE, which then sticks forever in Move AND in the
 * slot synth. davebox states this doctrine in openChainPatches` own comment and
 * follows it for its own file row (`{t: "file"}`); this gesture must too. */
const shiftBranch = src.slice(src.indexOf("S.view === VIEW_WAV && S.shiftHeld"),
                              src.indexOf("S.view === VIEW_WAV && S.shiftHeld") + 1400);
ok(/S\.pendingAction = \{ t: .wavfile., bare, cell, fileKey \};/.test(shiftBranch),
   "Shift+click QUEUES the browse rather than opening it");
ok(shiftBranch.indexOf("openFileBrowser(") < 0,
   "...the handler does not open the browser itself (readdir on the MIDI path)");
ok(shiftBranch.indexOf("engineGetChainParam(") < 0,
   "...nor take a blocking engine read on the MIDI path");
/* The decision is still made here, and it is pure — both of these read state we
 * already hold and touch no device. Pinned so a later "tidy" cannot move them
 * into the tick and leave the gesture consuming a press it may not own. */
ok(/authoritativeMeta\(bare, S\.cpMap, S\.levels\)/.test(shiftBranch) &&
   /makeCell\(bare, decl\)/.test(shiftBranch),
   "control: the pure decision — is there a file at all — stays in the handler");

/* ⚠ The whole program is inside single quotes in the shell, so a JS string
 * literal cannot contain one — match the action tag with a wildcard. */
const actionAt = src.search(/a\.t === .wavfile./);
const runAction = actionAt >= 0 ? src.slice(actionAt, actionAt + 500) : "";
ok(actionAt >= 0, "the tick dispatches a `wavfile` action");
ok(/if \(S\.view === VIEW_WAV\)/.test(runAction),
   "⚠ the queued open is dropped if the waveform is gone by the time it runs");
ok(/openFileBrowser\(\{ key: a\.bare/.test(runAction),
   "control: the tick is what actually opens it");

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
/* ⭑ THREE destinations now, because a browse can be asked for from three
 * places: the waveform sent us, a GRID cell sent us, or davebox`s own menu did.
 * Landing a grid-originated pick on VIEW_MENU is what produced the device
 * report "NO PARAMS, then PRESETS, then main" — three screens the user never
 * asked for, because the bank editor`s banks were never discovered on that
 * path. */
ok(/S\.view = \(wavErrand && wavEditActive\(\)\) \? VIEW_WAV\s*\n?\s*: \(ppFileErrand \? VIEW_EDIT : VIEW_MENU\);/.test(act),
   "a PICK returns where it was ASKED FOR — waveform, grid, or davebox`s menu");
ok(/if \(ppFileErrand\) \{ ppSuppressOnce = false; ppDivedOut = false; \}/.test(act),
   "...and a grid-originated pick lets the grid re-enter at once");
ok(/wavErrand = false;/.test(act), "...and the crumb is dropped as it is spent");

/* ---- it cannot outlive the screen ---------------------------------------- */
/* ⚠⚠ THE EXIT THAT A COUNT CANNOT SEE. `wavEditCloseIfOpen` is the ONE place
 * that reconciles the editor`s lifetime — a track switch (`soundRetarget`) and a
 * module swap (`runDiscovery`) both reach it — and on an errand the view is
 * VIEW_FILE, not VIEW_WAV, so its own view branch does not run. Left set, the
 * crumb outlives the screen it belongs to: Back lands on a VIEW_WAV whose
 * renderer bails, leaving the PREVIOUS FRAME on the panel, and later davebox`s
 * own file browser backs into the waveform instead of its menu.
 * A count of `wavErrand = false;` sites cannot see a missing one — name it. */
{
    const closer = body("function wavEditCloseIfOpen(");
    const dropAt = closer.indexOf("wavErrand = false;");
    const viewAt = closer.search(/if \(S\.view === VIEW_WAV/);
    /* ⚠⚠ BOTH INDICES MUST BE FOUND FIRST. `indexOf` answers -1 for a string
     * that is not there, and `-1 < 172` is TRUE — so an ordering assertion
     * written as a bare comparison reports ok on the very tree where the
     * statement was DELETED. Caught by an advisor pass running that exact
     * mutation: the neighbour above fired and this one said ok. */
    ok(dropAt >= 0, "the editor`s own lifetime reconcile drops the errand");
    ok(viewAt >= 0, "control: the reconcile still has a view branch to be ahead of");
    ok(dropAt >= 0 && viewAt >= 0 && dropAt < viewAt,
       "...unconditionally, ahead of the view branch (" + dropAt + " < " + viewAt + ")");

    /* ⚠⚠ AND THE BROWSER GOES WITH IT. Clearing the crumb alone left the user
     * standing in a file browser built from the OLD component`s `S.fileKey`,
     * over the NEW slot — and `queueWrite` captures `S.slot` AT CALL TIME, so a
     * pick after the switch writes the old module`s key into the track that
     * replaced it. That is the "lands an edit on a track the user never opened"
     * this function`s own header exists to prevent. */
    ok(/hadErrand && S\.view === VIEW_FILE/.test(closer),
       "⭑ a browse open across a track switch is closed too, not just un-crumbed");
    ok(/ppDivedOut = false;/.test(closer),
       "...and the dive crumb goes with it — left set it would eat the next Back");
    ok(/ppSuppressOnce = false;/.test(closer),
       "...and the grid is free to re-enter on the component we moved to");
}
/* ⚠ A SESSION BUS MUST NOT LOSE THE WAVEFORM. `soundRetarget` closes the editor
 * before switching tracks, which is right on the chain path — but its
 * session-bus branch returns a few lines below WITHOUT moving the slot or the
 * component, so there is nothing to protect against and the close was pure
 * loss: every track press tore the waveform down while you were editing a
 * session send. Guarded on the same condition as that return.
 *
 * ⚠ THIS IS AN ORDER-AND-CONDITION PIN, and that is ALL it proves — the guard
 * is spelled and it sits ahead of the retarget. It cannot show the editor
 * survives; that needs the gesture rig this suite does not have yet. Said
 * plainly, because a source pin read as a behaviour proof is how three bugs got
 * through this arc. */
{
    const retarget = body("export function soundRetarget(");
    ok(/if \(!\(S\.bus && S\.bus\.kind === .global.\)\) wavEditCloseIfOpen\(\);/.test(retarget),
       "a session bus keeps its waveform across a track press");
    const guardAt = retarget.search(/if \(!\(S\.bus && S\.bus\.kind === .global.\)\) wavEditCloseIfOpen/);
    const flushAt = retarget.indexOf("flushForRetarget()");
    ok(guardAt >= 0 && flushAt >= 0 && guardAt < flushAt,
       "...and the close still happens BEFORE the slot moves, for the chain path");
    ok(!/^\s*wavEditCloseIfOpen\(\);/m.test(retarget),
       "control: no unguarded call survives beside it");
}

/* Both returns refuse a screen that is not there — belt to those braces. */
ok(/if \(wavEditActive\(\)\) \{ S\.view = VIEW_WAV; S\.dirty = true; return true; \}/.test(src),
   "Back only goes to the waveform if the editor is still open");
const clears = (src.match(/wavErrand = false;/g) || []).length;
ok(clears >= 4,
   "the crumb is cleared on every exit — pick, Back, the click exit and the " +
   "editor reset (" + clears + " sites)");
ok(/ppErrandView = null; wavErrand = false;/.test(src),
   "...including the reset that clears the editor`s other crumbs");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the wave editor`s file browse comes back to the waveform");
'
