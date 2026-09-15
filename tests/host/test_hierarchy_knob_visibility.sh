#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# A menu level's KNOBS are not the same list as its PARAMS, and the hierarchy
# editor used to treat them as one. applyHierarchyVisibilityFilters kept only
# the knobs whose key appeared among the level's VISIBLE params, with a single
# escape hatch: if that set came out empty ("only nav links here") it kept them
# all. A level that declares 8 knobs and lists ONE ordinary param beside its nav
# links — an ordinary shape for a menu root or page-select level — therefore
# missed the escape hatch and lost 7 of its 8 knobs. Nothing is logged; the
# knobs simply go dead.
#
# Pinned: a knob is dropped ONLY when its own param is hidden by a `visible_if`
# that currently evaluates false. A knob whose key the level does not list at
# all survives.
#
# The three functions are lifted out of the UI and run under node against stubs,
# so this asserts BEHAVIOUR, not source text. Point SHADOW_UI_FILE at a copy to
# run the control (a copy carrying the pre-fix block must fail case (a)).

fail() { echo "FAIL: $*" >&2; exit 1; }
ui="${SHADOW_UI_FILE:-src/shadow/shadow_ui.js}"
[ -f "$ui" ] || fail "no such UI file: $ui"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
harness="$tmp/harness.mjs"

{
  cat <<'PRELUDE'
/* --- stubs: everything the three lifted functions reach ------------------- */
const SWAP_MODULE_ACTION = "__swap_module__";
const MODULE_LEVEL_KEY = "slot:synth_volume";
let hierEditorSlot = 0;
let hierEditorHierarchy = { levels: {} };
let hierEditorAllParams = [];
let hierEditorAllKnobs = [];
let hierEditorParams = [];
let hierEditorKnobs = [];
let hierEditorSelectedIdx = 0;
/* conditions in this test are `{ tag }`; VIS says which tags are true now */
let VIS = {};
function evaluateVisibilityCondition(condition, _levelDef) {
    if (!condition || typeof condition !== "object") return true;
    return !!VIS[condition.tag];
}
PRELUDE
  sed -n '/^function extractHierarchyParamKey(/,/^}/p' "$ui"
  sed -n '/^function filterHierarchyParamsByVisibility(/,/^}/p' "$ui"
  sed -n '/^function applyHierarchyVisibilityFilters(/,/^}/p' "$ui"
  cat <<'CASES'

/* --- cases ---------------------------------------------------------------- */
let failed = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) { console.log(`FAIL: ${name}: got ${g}, want ${w}`); failed++; }
    else { console.log(`  ok  ${name}`); }
}
function run(level, vis) {
    VIS = vis || {};
    hierEditorAllParams = level.params || [];
    hierEditorAllKnobs = level.knobs || [];
    hierEditorParams = [];
    hierEditorKnobs = [];
    hierEditorSelectedIdx = 0;
    applyHierarchyVisibilityFilters(level);
    return hierEditorKnobs;
}

const eight = ["osc1", "osc2", "cutoff", "res", "attack", "decay", "sustain", "release"];

/* (a) a menu root: 8 knobs for the page it fronts, but it LISTS only one
 *     ordinary param plus nav links. All 8 knobs must survive. */
check("(a) a level listing one param beside nav links keeps all its knobs",
    run({
        knobs: eight,
        params: [
            { key: "bank_index", name: "Bank" },
            { key: "osc_page", name: "Oscillators", level: "osc" },
            { key: "env_page", name: "Envelope", level: "env" },
        ],
    }),
    eight);

/* (b) a knob whose OWN param is hidden by a false visible_if is dropped, and
 *     only that one. */
check("(b) a knob hidden by its own false visible_if is dropped",
    run({
        knobs: ["cutoff", "res", "fm_index"],
        params: [
            { key: "cutoff", name: "Cutoff" },
            { key: "res", name: "Resonance" },
            { key: "fm_index", name: "FM", visible_if: { tag: "fm" } },
        ],
    }, { fm: false }),
    ["cutoff", "res"]);

/* (b2) ...and it comes back when the condition turns true. */
check("(b2) the same knob returns when its visible_if evaluates true",
    run({
        knobs: ["cutoff", "res", "fm_index"],
        params: [
            { key: "cutoff", name: "Cutoff" },
            { key: "res", name: "Resonance" },
            { key: "fm_index", name: "FM", visible_if: { tag: "fm" } },
        ],
    }, { fm: true }),
    ["cutoff", "res", "fm_index"]);

/* (c) the old size===0 case: a level with no params at all keeps every knob. */
check("(c) a level with no params keeps every knob",
    run({ knobs: eight, params: [] }),
    eight);

/* (d) injected rows are not the level's own params and hide nothing. */
check("(d) injected rows never hide a knob",
    run({
        knobs: ["cutoff", "res"],
        params: [
            { key: "__swap_module__", name: "Swap" },
            { key: "slot:synth_volume", name: "Volume" },
        ],
    }),
    ["cutoff", "res"]);

/* (e) the level itself invisible → no knobs (unchanged early return). */
check("(e) an invisible level exposes no knobs",
    run({ knobs: eight, params: [{ key: "bank_index" }], visible_if: { tag: "lvl" } },
        { lvl: false }),
    []);

process.exit(failed ? 1 : 0);
CASES
} > "$harness"

command grep -q 'function applyHierarchyVisibilityFilters' "$harness" \
  || fail "applyHierarchyVisibilityFilters could not be lifted out of $ui"

node "$harness" || fail "hierarchy knob visibility behaves wrongly (see above)"
echo "PASS: test_hierarchy_knob_visibility"
