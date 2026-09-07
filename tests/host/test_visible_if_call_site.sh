#!/usr/bin/env bash
# The visible_if CALL SITE, pinned — the unit test cannot see it.
#
# ⚠⚠ `davebox/tests/js/test_visible_if_child_index.mjs` drives
# `evaluateVisibility` directly with an io it builds itself. That proves the
# EVALUATOR is right and says nothing about the io ui_sound actually passes —
# which is where both defects lived: the child index taken from the level DEF
# (a name-keyed lookup, so always 0) and a blocking engine read where the host
# is cache-first. Swapping the call site back to the broken form leaves that
# unit test green. So the site itself is pinned here.
#
# ⚠ The window is STRUCTURAL — the member's own body, found by brace-matching
# from `evaluateVisibilityCondition:` — not a fixed slice, and the test fails
# loudly if it cannot find it rather than passing on an empty string.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };

const src = readFileSync("davebox/ui/ui_sound.mjs", "utf8");
const at = src.indexOf("evaluateVisibilityCondition:");
if (at < 0) { console.log("FAIL: no evaluateVisibilityCondition member in ui_sound.mjs"); process.exit(1); }
const open = src.indexOf("{", at);
if (open < 0) { console.log("FAIL: could not find the member body"); process.exit(1); }
let d = 0, i = open;
for (;; i++) {
  const c = src[i];
  if (c === undefined) { console.log("FAIL: unterminated member body"); process.exit(1); }
  if (c === "{") d++;
  else if (c === "}") { d--; if (d === 0) break; }
}
const body = src.slice(at, i + 1);
/* ⚠ CONTROL. A window that came back empty, or that swallowed the rest of the
 * file, would make every assertion below meaningless in opposite directions. */
/* ⚠ The ceiling is a SANITY range, not a budget. The window above is
 * brace-MATCHED, so this control exists to catch the two ways extraction goes
 * wrong — nothing, or the rest of the file — and a member that grew because it
 * documents a measurement is neither. Raised 4000 -> 8000 on 2026-09-07 when
 * the per-tick gate memo landed with the device histogram written beside it. */
ok(body.length > 200 && body.length < 8000,
   "control: the extracted body is a plausible size (" + body.length + " chars)");
ok(body.includes("evaluateVisibility("), "control: the body is the one that calls the evaluator");

/* ---- the index comes from the NAME ------------------------------------- */
ok(/paramPagesLevelNameOf\(\s*levelDef\s*\)/.test(body),
   "the level NAME is resolved from the def first");
ok(/paramPagesChildIndex\(\s*lvlName\s*\)/.test(body),
   "and the child index is asked for by NAME");
ok(!/paramPagesChildIndex\(\s*(levelDef|lvl)\s*\)/.test(body),
   "the level DEFINITION is never passed to paramPagesChildIndex " +
   "(a name-keyed lookup: a def reads undefined and falls back to instance 0)");

/* ---- and the read is cache-first --------------------------------------- */
const cacheAt = body.indexOf("paramPagesCachedValue");
const engineAt = body.indexOf("engineGetChainParam");
ok(cacheAt >= 0, "the grid`s own value cache is consulted");
ok(engineAt >= 0, "control: a blocking read is still the fallback, not removed");
ok(cacheAt >= 0 && engineAt >= 0 && cacheAt < engineAt,
   "the cache is asked BEFORE the engine — a blocking chain read is ~2.9 ms " +
   "and a re-plan evaluates every gated param");
ok(/ppListedKeyFor\(/.test(body),
   "the cache is asked with the LISTED key, not the resolved one (#440): the " +
   "controller keys values by what the level lists, so a concrete child key misses every time");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the visible_if io names the shown instance and reads cache-first");
'
