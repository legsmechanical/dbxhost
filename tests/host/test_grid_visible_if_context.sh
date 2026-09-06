#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# visible_if on the knob grid read the WRONG slot and failed open (upstream #427,
# taken 2026-09-06). evaluateVisibilityCondition resolved its condition against
# hierEditorSlot / hierEditorComponent -- the LIST editor's identity, which
# enterParamPages never sets. From the grid that is a stale or -1 slot: the read
# answers null, the evaluator fails open, and every visible_if is true.
#
# Pinned: on PARAM_PAGES the evaluator takes the grid's own slot/component, a
# per-instance key through the grid's child index by level NAME, and reads the
# controller's own values first, then a TTL cache -- never the raw getSlotParam.

fail() { echo "FAIL: $*" >&2; exit 1; }
ui="src/shadow/shadow_ui.js"
pp="src/shadow/shadow_ui_param_pages.mjs"
bm="src/shared/param_pages/binding_movy.mjs"

body=$(sed -n '/^function evaluateVisibilityCondition(condition, levelDef) {/,/^}/p' "$ui")
[ -n "$body" ] || fail "evaluateVisibilityCondition is gone"
echo "$body" | command grep -q 'paramPagesActive()' || fail "evaluateVisibilityCondition never asks whether the grid is up"
echo "$body" | command grep -q 'paramPagesSlot()' || fail "on the grid the evaluator does not use the grid's slot"
echo "$body" | command grep -q 'paramPagesComponent()' || fail "on the grid the evaluator does not use the grid's component"
echo "$body" | command grep -q 'paramPagesLevelNameOf(levelDef)' || fail "a per-instance condition cannot find its instance by level name"
command grep -q '^export const paramPagesLevelNameOf' "$pp" || fail "paramPagesLevelNameOf is not exported by $pp"
command grep -q '^export const paramPagesCachedValue' "$pp" || fail "paramPagesCachedValue is not exported by $pp"
command grep -q 'paramPagesLevelNameOf, paramPagesCachedValue,' "$ui" || fail "shadow_ui.js does not import the two grid helpers"
command grep -q 'levelNameOf: (def)' src/shared/param_pages/page_controller.mjs || fail "the controller has no levelNameOf"
command grep -q 'valueOf: (k)' src/shared/param_pages/page_controller.mjs || fail "the controller has no valueOf"
command grep -q '^        paramPagesCachedValue,' "$bm" && command grep -q '^        paramPagesLevelNameOf,' "$bm" || fail "the binding does not expose the two helpers"
echo "$body" | command grep -q 'paramPagesCachedValue(gridListedKeyFor(' || fail "the grid evaluator does not consult the controller's own values first"
echo "$body" | command grep -q 'getSlotParamCached(' || fail "a cache miss on the grid goes to an uncached blocking read"
if echo "$body" | command grep -q '[^a-zA-Z]getSlotParam(' ; then fail "the grid branch still reads through the uncached getSlotParam"; fi
echo "  ok  visible_if on the knob grid resolves against the grid's own slot and component, cache-first"
# ---- the cache is asked with the LISTED key (upstream #440) ----------------------
command grep -q 'paramPagesCachedValue(gridListedKeyFor(levelDef, childIdx, gridPrefix, k))' src/shadow/shadow_ui.js \
  || fail "the grid asks its value cache with the CONCRETE key -- a per-instance visible_if never hits it and pays the blocking read"
node -e '
import("./src/shared/param_pages/visibility.mjs").then((V) => {
  /* the invert must round-trip the normaliser: listed -> concrete -> listed */
  const lvl = { child_prefix: "pad", child_count: 4, params: [{ key: "type" }, "vol"] };
  const full = V.normalizeVisibilityConditionKey("synth", lvl, 3, "type");
  if (typeof full !== "string" || full.indexOf("pad3") < 0) { console.log("FAIL: normaliser did not produce a per-instance key: " + full); process.exit(1); }
  console.log("  ok  the normaliser resolves a listed key per instance, so the invert has something to walk back");
}).catch((e) => { console.log("FAIL: " + (e && e.stack || e)); process.exit(1); });
' || fail "visibility half"
echo "PASS: test_grid_visible_if_context"
