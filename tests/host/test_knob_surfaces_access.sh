#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Every knob surface must honour `access`, not just the param-pages grid.
#
# The axis landed on the param-pages knob grid and never reached shadow_ui.js.
# getKnobContext there serves the CHAIN EDITOR, MASTER FX and the hierarchy
# list editor alike, so on all three a trigger was an ordinary enum. That
# breadth is the point: the list editor is being deprecated, and if this were
# only about the list editor it would be near-dead code.
#
#   - TURNING its knob walked through the fire value and ran the action.
#     magneto's `clear` wipes the deck; euclidrum's `rnd_preset` randomises all
#     eight lanes. From a knob nudge, with no confirmation.
#   - CLICKING it opened the option picker -- a two-item list whose second item
#     is the action, i.e. another way to fire it by accident, and a "dive" into
#     something with nothing to browse.
#   - a READOUT was writable, and its picker discarded the choice in silence.
#
#
# ======================= FORK ADAPTATION (dbxhost) =======================
#
# Descended from upstream Schwung v1.0.0 (charlesvestal/schwung, e3d5bc8c).
# The assertions kept are upstream's, verbatim, comments included.
#
# THREE of upstream's blocks were REMOVED, not weakened, plus one adapted:
#
#   1. "a HELD trigger fires on the jog click, and does not dive", and "while
#      the card is up, a click never dives". Both are entirely about the
#      chain-editor KNOB CARD (`knobCardKnob`), which this fork does not have
#      and which the param-pages adoption deliberately did not port. There is
#      no fork code for them to be true or false about -- the fork's
#      MoveMainButton handler always falls through to handleSelect().
#
#   2. The `openEnumPicker` ordering checks. This fork has no openEnumPicker
#      and no VIEWS.ENUM_PICKER; a click on a longer enum enters edit mode and
#      the jog steps it. So "the trigger branch must precede the picker"
#      becomes "the trigger branch must precede the EDIT-MODE fallthrough",
#      which is what the click block below asserts instead.
#
#   3. The "Read only" / "Click to fire" string check and the
#      formatParamForOverlay-in-the-refused-turn check are kept, because this
#      fork has formatParamForOverlay and shows the value the same way -- but
#      through showOverlay(), not upstream's showKnobFeedback() (no card, so
#      no cardName argument), so the call is spelled differently.
#
# ⚠ WHAT THIS FORK HAD, AND WHY IT WAS NOT ENOUGH. shadow_ui.js already
# carried isTriggerEnumMeta + a gesture accumulator, so it LOOKED guarded.
# That predicate matches one naming convention -- options exactly
# ["idle","trigger"] -- and the destructive params in the fleet do not use it:
# euclidrum declares ["—","Rnd!"] and says what it is with `access: "write"`.
# The guard and the bug were about different sets of parameters. Both
# predicates are asserted below; they are not alternatives.
#
# ==========================================================================
#
# Pinned at the source: shadow_ui.js cannot be imported off-device (absolute
# on-device import paths), and these are guard clauses whose absence is the
# whole bug.

fail() { echo "FAIL: $1" >&2; exit 1; }
file="src/shadow/shadow_ui.js"

command grep -q "function isTriggerParam" "$file" || fail "shadow_ui.js has no access:write test"
command grep -q "function isReadoutParam" "$file" || fail "shadow_ui.js has no access:read test"

# --- the knob turn must branch on ACCESS before the enum stepper -------------
#
# A READOUT still bails: there is nothing to set.
#
# A TRIGGER no longer bails -- it FIRES, once per cooldown, in either
# direction. That reverses half of the original fix and the reason is that the
# original reasoning was about the enum STEPPER ("turning walks through the
# fire value"), not about the gesture: a momentary has no value to walk past.
# What keeps a knob from running the action a dozen times per flick is the
# cooldown, so the cooldown is the thing this file has to pin, and it is
# pinned as an ORDER (guard, then window, then write) because a fire placed
# after the window check is a fire with no window at all.
turn=$(awk '/A TRIGGER fires on a detent, in either direction/,/^    if \(ctx.meta && ctx.meta.type === "enum"/' "$file")
[ -n "$turn" ] || fail "the knob-turn access branch is gone from processPendingHierKnob"
command grep -q "if (isTriggerParam(ctx.meta)) {" <<<"$turn" || \
  fail "the knob turn does not check access:write"
command grep -q "if (isReadoutParam(ctx.meta)) {" <<<"$turn" || \
  fail "the knob turn does not check access:read"
command grep -q "TRIGGER_KNOB_GESTURE_GAP_MS" <<<"$turn" || \
  fail "a knob detent fires a trigger with NO gesture latch -- one flick runs the action a dozen times"
# THE EXPRESSION, not just the name. ADDED IN THIS FORK, because the check
# above is satisfied by the CONSTANT APPEARING IN THE COMMENT: mutating
# `const startsGesture = ... >= TRIGGER_KNOB_GESTURE_GAP_MS` to
# `const startsGesture = true` -- i.e. every single detent fires the action,
# the exact bug this whole file exists to prevent -- left every assertion here
# green. Found by mutation-testing this test before trusting it, which is the
# same failure upstream records two blocks down ("the mutation survived until
# this line existed"). This is an ADDED assertion, not a relaxed one.
command grep -qE "startsGesture *=.*\(t - last\) *>= *TRIGGER_KNOB_GESTURE_GAP_MS" <<<"$turn" || \
  fail "the gesture test is not computed from the stamp and the gap -- the latch is decorative"
command grep -q "triggerFireValue(ctx.meta" <<<"$turn" || \
  fail "the knob fire does not use the module wire value -- a bare index destroys euclidrum kits"
# The gesture test must be evaluated BEFORE the write, not after it.
# `|| true` on every lookup: with `set -euo pipefail` a grep that finds nothing
# kills the script at the assignment, so the fail() message below -- the only
# thing that says WHICH invariant broke -- never prints. An unexplained exit 1
# is how a deliberate change gets mistaken for a broken harness.
cl=$( { command grep -n "if (!startsGesture) return;" "$file" || true; } | head -n 1 | cut -d: -f1)
fl=$( { command grep -n "setSlotParam(ctx.slot, ctx.fullKey, fire)" "$file" || true; } | head -n 1 | cut -d: -f1)
[ -n "$cl" ] && [ -n "$fl" ] && [ "$cl" -lt "$fl" ] || \
  fail "the gesture latch is evaluated AFTER the fire (gate $cl, write $fl) -- it gates nothing"
# THE STAMP MUST BE WRITTEN BEFORE THE BAIL. That one line is the whole
# difference between a latch and a rate limit: stamping only on a fire makes
# the clock measure elapsed time, so a long spin fires every window. Stamping
# on every DETENT makes it measure stillness, which is the promise the docs
# make ("a whole flick counts as one press"). Reported from the device as
# "gesture test fires repeatedly on detent".
st=$( { command grep -n "triggerKnobLastMs\[knobIndex\] = t;" "$file" || true; } | head -n 1 | cut -d: -f1)
[ -n "$st" ] && [ "$st" -lt "$cl" ] || \
  fail "the detent stamp is written AFTER the bail (stamp $st, bail $cl) -- that is a rate limit, not a latch"
# ORDER is the whole point: both guards must precede the enum stepper's read.
g=$( { command grep -n "if (isTriggerParam(ctx.meta)) {" "$file" || true; } | head -n 1 | cut -d: -f1)
r=$( { command grep -n "if (isReadoutParam(ctx.meta)) {" "$file" || true; } | head -n 1 | cut -d: -f1)
w=$( { command grep -n "const currentVal = getKnobCachedValue" "$file" || true; } | head -n 1 | cut -d: -f1)
[ -n "$g" ] && [ -n "$r" ] && [ -n "$w" ] && [ "$g" -lt "$w" ] && [ "$r" -lt "$w" ] || \
  fail "an access guard runs AFTER the value is read (trigger $g, readout $r, read $w)"
# The LATCH IS KNOB-ONLY. A click is one gesture per press, and the two
# click paths must not consult it -- a shared timer is exactly how "clicking
# twice quickly only fired once" gets introduced.
for fn in "A held TRIGGER is fired by the click" "A TRIGGER is pushed, not opened"; do
  blk=$(awk -v pat="$fn" 'index($0, pat) {n=1} n && n++ <= 40' "$file")
  command grep -q "TRIGGER_KNOB_GESTURE_GAP_MS" <<<"$blk" && \
    fail "the click path \"$fn\" is gated by the KNOB gesture latch"
done

# --- and the two surfaces must agree on how long that window is --------------
#
# The knob grid (page_controller.mjs) and this file drive the SAME physical
# encoder against the SAME parameter; which one is on screen is a Param View
# setting the user can flip. Two copies of the number is two behaviours, and
# the disagreement would only ever be noticed as "it fires differently in List
# view", which nobody would think to report as a constant.
a=$( { command grep -oE "^const TRIGGER_KNOB_GESTURE_GAP_MS = [0-9]+" "$file" || true; } | head -n 1)
b=$( { command grep -oE "^const TRIGGER_KNOB_GESTURE_GAP_MS = [0-9]+" \
         src/shared/param_pages/page_controller.mjs || true; } | head -n 1)
[ -n "$a" ] || fail "shadow_ui.js does not declare TRIGGER_KNOB_GESTURE_GAP_MS"
[ -n "$b" ] || fail "page_controller.mjs does not declare TRIGGER_KNOB_GESTURE_GAP_MS"
[ "$a" = "$b" ] || fail "the knob trigger gesture gap has drifted: shadow_ui \"$a\" vs grid \"$b\""

# LETTING GO RE-ARMS IT. The gap is the fallback for a cap sensor that never
# registered; a release is the real boundary. Without this you fire, let go,
# take hold again, and the next detent is swallowed for up to 400ms.
rearm=$( { command grep -n "triggerKnobLastMs\[knobIndex\] = 0;" "$file" || true; } | head -n 1 | cut -d: -f1)
[ -n "$rearm" ] || fail "releasing a knob does not re-arm the trigger latch on this surface"
# FORK ANCHOR. Upstream locates its release handler by `knobTouched[knobIndex]
# = false;`; this fork has no knobTouched array at all -- its release handler
# is the note-off branch that drains the pending knob delta, identified by the
# MoveKnob touch-note range test. Same assertion (the re-arm must live INSIDE
# the release handler and not somewhere that merely runs often), different
# landmark. The bare MoveKnob touch-note range test is NOT usable as the
# anchor -- it appears three times in this fork (a co-run branch and a
# knob-press branch come first), so `head -n 1` finds the wrong one and the
# proximity check fails against code that is not the release handler at all.
touchoff=$( { command grep -n "Handle Note Off for knob release" "$file" || true; } | head -n 1 | cut -d: -f1)
[ -n "$touchoff" ] && [ "$rearm" -gt "$touchoff" ] && [ $((rearm - touchoff)) -lt 30 ] || \
  fail "the trigger re-arm is not in the knob RELEASE handler (release $touchoff, re-arm $rearm)"
# ...and that handler must accept BOTH note-off spellings, or a real 0x80
# never reaches the re-arm above and the latch stays armed across a release.
command grep -q "(status & 0xF0) === MidiNoteOff) {" "$file" || \
  fail "the knob release handler still matches only note-on-velocity-0"

echo "  ok  a knob detent fires a trigger once per GESTURE; a readout still writes nothing"
echo "  ok  releasing the knob re-arms the latch"
echo "  ok  both knob surfaces share one gesture-gap value"

# --- the click must FIRE a trigger, not enter edit mode ----------------------
#
# FORK: upstream asserts "not open a picker". Same defect, different
# fallthrough -- this fork has no picker, so a click on a two-option enum
# enters EDIT MODE and hands the jog a way to walk onto the fire value. The
# branch has to precede that fallthrough or it is dead code.
click=$(awk '/A TRIGGER is pushed, not opened/,/beginHierarchyParamEdit\(selectedKey\)/' "$file")
[ -n "$click" ] || fail "clicking a trigger no longer fires it"
command grep -q "triggerFireValue" <<<"$click" || fail "the click does not use the module wire value"
# The CONDITION, not just the code under it. Replacing the test with `if
# (false)` would leave every string below intact and this check green.
command grep -q "isTriggerParam(meta)" <<<"$click" || \
  fail "the trigger branch is no longer guarded by isTriggerParam -- it is dead code"
command grep -q "isReadoutParam(meta)" <<<"$click" || fail "clicking a readout still opens an editor"
tl=$(command grep -n "A TRIGGER is pushed, not opened" "$file" | head -n 1 | cut -d: -f1)
el=$(command grep -n "if (beginHierarchyParamEdit(selectedKey)) {" "$file" | head -n 1 | cut -d: -f1)
[ "$tl" -lt "$el" ] || fail "the trigger branch is after the edit-mode fallthrough -- edit mode wins"
echo "  ok  a click fires a trigger through the module wire, and never enters edit mode"
echo "  ok  a click on a readout opens nothing"

# --- the fire value must be the module's own wire format ---------------------
fv=$(awk '/^function triggerFireValue\(/,/^}/' "$file")
command grep -q "opts\[1\]" <<<"$fv" || fail "triggerFireValue does not use option 1"
command grep -q "usesIndex" <<<"$fv" || fail "triggerFireValue ignores index-reporting modules"
# THE destructive case: a bare "0" MEANS the idle option, i.e. do nothing, and
# euclidrum fires on anything that is not it. Writing 0 must be unreachable.
command grep -q '"0"' <<<"$fv" && fail "triggerFireValue can emit \"0\" -- that means IDLE, not fire"
echo "  ok  the fire value is the module wire value, and can never be the idle option"

# --- the OLDER convention is still guarded too -------------------------------
#
# isTriggerEnumMeta predates this fork's param-pages adoption and guards a
# DIFFERENT set of params (options exactly ["idle","trigger"]). It was never
# the bug and it is not superseded -- a module using that convention without
# declaring `access` still needs it. Pinned so a later tidy-up does not delete
# it on the belief that isTriggerParam replaced it.
command grep -q "function isTriggerEnumMeta" "$file" || \
  fail "isTriggerEnumMeta is gone -- the older [idle,trigger] convention is now unguarded"
# The ORDER is asserted against the ENUM STEPPER, not against the other
# predicate. isTriggerEnumMeta(ctx.meta) appears twice in this fork -- once in
# the overlay-refresh branch at the top of processPendingHierKnob (no delta,
# nothing is written) and once inside the stepper -- so comparing the two
# predicates by first occurrence measures the wrong pair and fails against
# correct code. The stepper is where a write happens, and the access guard has
# to be in front of it.
al=$(command grep -n "if (isTriggerParam(ctx.meta)) {" "$file" | head -n 1 | cut -d: -f1)
sl=$(command grep -n 'if (ctx.meta && ctx.meta.type === "enum" && ctx.meta.options && ctx.meta.options.length > 0) {' "$file" | head -n 1 | cut -d: -f1)
[ -n "$al" ] && [ -n "$sl" ] && [ "$al" -lt "$sl" ] || \
  fail "the access guard does not precede the enum stepper (access $al, stepper $sl)"
echo "  ok  both trigger predicates are live, and access is checked before the stepper"

# --- AND IT MUST ACTUALLY CATCH THE PARAMS IT WAS WRITTEN FOR ----------------
#
# Everything above is a regex over the source: it proves a guard is wired in
# the right ORDER, not that it fires on anything. This runs the predicate
# against the fleet fixture, because the access-only version of this guard
# would have passed every check above while leaving both named bugs live.
#
# Measured on this fixture: exactly THREE params in 100 modules declare
# `access: "write"`, and neither magneto `clear` nor euclidrum `rnd_preset` is
# among them -- they declare nothing at all. That is why isTriggerParam
# consults the shared inference when no access is declared.
if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required" >&2
  exit 1
fi
node --input-type=module -e '
import { inferMomentary } from "./src/shared/param_pages/param_meta.mjs";
import { readFileSync } from "node:fs";
const fx = JSON.parse(readFileSync("tests/fixtures/module-contracts.json", "utf8"));
let bad = 0;
const fail = (m) => { console.log("FAIL: " + m); bad++; };
const find = (id, key) => {
  const mod = fx.modules.find((x) => x.id === id);
  if (!mod) return null;
  let hit = null;
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.key === key) hit = o;
    Object.values(o).forEach(walk);
  };
  walk(mod.chain_params);
  return hit;
};
/* Same precedence isTriggerParam applies: a declaration wins, otherwise infer. */
const isTrigger = (meta) => {
  const a = String((meta && meta.access) || "").toLowerCase();
  return a ? a === "write" : inferMomentary(meta);
};

/* POSITIVE: the destructive ones, however they declared themselves. */
for (const [id, key] of [["magneto", "clear"], ["euclidrum", "rnd_preset"],
                         ["tablor", "preset_rnd"]]) {
  const meta = find(id, key);
  if (!meta) { fail(id + ":" + key + " vanished from the fixture -- this test is now vacuous"); continue; }
  if (!isTrigger(meta))
    fail(id + ":" + key + " is not treated as a trigger -- a knob turn would run the action");
}

/* NEGATIVE CONTROL, and it is not optional: a predicate that answers TRUE for
 * everything passes every positive above. A mode is a STATE you set, even when
 * one of its options is literally called "trigger" -- slicer mode is
 * ["trigger","gate"], and turning it into a button would make the control
 * unreachable rather than merely unsafe. */
for (const [id, key] of [["slicer", "mode"], ["mrdrums", "pad_mode"],
                         ["303", "drive_model"]]) {
  const meta = find(id, key);
  if (!meta) { fail(id + ":" + key + " vanished from the fixture -- the negative control is vacuous"); continue; }
  if (isTrigger(meta))
    fail(id + ":" + key + " was classified as a trigger -- a real two-way control just became a button");
}
if (bad) process.exit(1);
console.log("  ok  the named destructive params classify as triggers, and real two-way controls do not");
'

echo "PASS: every knob surface honours access"
