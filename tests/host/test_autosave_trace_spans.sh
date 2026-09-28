#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Autosave instrumentation: a trace must be able to say WHICH autosave unit a
# slow tick paid for, and how many round-trips it made — bulk ones included.
#
# Two blind spots made the autosave stall (2026-09-14) an inference rather than
# a measurement:
#   1. a bulk GET (shadow_get_params) had no span at all, so a fix that moves
#      reads onto bulk would have looked like it made the reads DISAPPEAR;
#   2. the autosave units had no span, so a 300 ms js.tick showed ~100
#      param.get children and nothing saying which saver issued them.
#
# (1) is C and is pinned structurally. (2) is pinned by running the real
# saveOneDirtyUnit/autosaveTraced source against stub savers: every unit it
# dispatches must open exactly one `autosave.<kind>` span and close it, also
# when the saver throws (an unbalanced span leaks a handle for the tick).

c="src/shadow/shadow_ui.c"
fail() { echo "FAIL: $1" >&2; exit 1; }

node - "$c" <<'NODE' || exit 1
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const fails = [];
function body(name) {
    const start = src.indexOf(name);
    if (start < 0) { fails.push(`${name} not found`); return ""; }
    let depth = 0, i = src.indexOf("{", start);
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
    }
    return "";
}
const bulk = body("static JSValue shadow_param_bulk_js(");
/* A span opened with cleanup, so it closes on every early return. */
if (!/trace_handle_t \w+ __attribute__\(\(cleanup\(schwung_trace__cleanup\)\)\) =\s*\(req_type == 3\) \? js_param_get_bulk_span_begin\(key\)/.test(bulk))
    fails.push("shadow_param_bulk_js does not open a cleanup-scoped param.get_bulk span for BULK_GET");
/* ...opened BEFORE the blocking wait, or the span misses the time it exists to measure. */
if (bulk.indexOf("js_param_get_bulk_span_begin") > bulk.indexOf("shadow_param_wait_idle"))
    fails.push("the param.get_bulk span opens after shadow_param_wait_idle — it would not cover the round-trip");
if (!/js_param_span_begin\("param\.get_bulk", &s_plain, marker\)/.test(src))
    fails.push("param.get_bulk span is not named by the bulk verb + marker");
if (!/js_param_span_begin\("param\.get", &s_plain, key\)/.test(src))
    fails.push("the single param.get span lost its name");
if (fails.length) { for (const f of fails) console.error("FAIL: " + f); process.exit(1); }
NODE

node - <<'NODE' || exit 1
const fs = require("fs");
const src = fs.readFileSync("src/shadow/shadow_ui.js", "utf8");
const fails = [];
function extract(name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0 || src.indexOf(`function ${name}(`, start + 1) >= 0) {
        fails.push(`${name}: not found exactly once`); return "";
    }
    let depth = 0, i = src.indexOf("{", start);
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
    }
    fails.push(`${name}: unbalanced`); return "";
}
const code = extract("autosaveTraced") + "\n" + extract("saveOneDirtyUnit") + "\n" + extract("autosaveEndPass");

function run(code, dirtySlots, dirtyBuses, throwIn, dirtyConfig = 0) {
    const spans = [];           /* [name, "begin"|"end"] in order */
    let next = 1;
    const open = new Map();
    const scope = {
        SHADOW_UI_SLOTS: 8, MOVE_FX_SLOTS_JS: 4, AUTOSAVE_RETRY_MS: 500,
        FXBUS_DIRTY_MASTER: 1, FXBUS_DIRTY_SEND_A: 2, FXBUS_DIRTY_SEND_B: 4, FXBUS_DIRTY_MOVE_SHIFT: 8,
        activeSlotStateDir: "/x",
        host_trace_begin: (n) => { const h = next++; open.set(h, n); spans.push([n, "begin"]); return h; },
        host_trace_end: (h) => { spans.push([open.get(h), "end"]); open.delete(h); },
        debugLog: () => {},
    };
    const saver = (kind) => () => { if (throwIn === kind) throw new Error("boom"); return true; };
    const fn = new Function(...Object.keys(scope),
        "autosaveAllSlots", "saveChainConfigToDir", "saveMasterFxChainConfig",
        "saveSendFxChainConfig", "saveMoveFxChainConfig",
        `let autosaveDirtySlots = ${dirtySlots}, autosaveDirtyConfig = ${dirtyConfig}, autosaveDirtyBuses = ${dirtyBuses}, autosaveNotBefore = 0;
         let autosaveDeferredSlots = 0, autosaveConfigDeferred = false;
         ${code}
         let threw = false;
         try { saveOneDirtyUnit(); } catch (e) { threw = e; }
         return threw;`);
    const threw = fn(...Object.values(scope), saver("slot"), saver("config"),
                     saver("master_fx"), saver("send_fx"), saver("move_fx"));
    return { spans, open: open.size, threw };
}

function check(label, dirtySlots, dirtyBuses, expectKinds, throwIn, dirtyConfig = 0) {
    const r = run(code, dirtySlots, dirtyBuses, throwIn, dirtyConfig);
    /* Only the deliberately throwing saver may throw — a ReferenceError from a
     * stale stub scope would otherwise read as "no spans". */
    if (r.threw && !(throwIn && String(r.threw.message) === "boom")) fails.push(`${label}: threw ${r.threw}`);
    const begun = r.spans.filter((s) => s[1] === "begin").map((s) => s[0]);
    if (JSON.stringify(begun) !== JSON.stringify(expectKinds))
        fails.push(`${label}: spans ${JSON.stringify(begun)}, expected ${JSON.stringify(expectKinds)}`);
    if (r.open !== 0) fails.push(`${label}: ${r.open} span(s) left open`);
}

check("slot unit", 1 << 3, 0, ["autosave.slot"]);
check("config unit", 0, 0, ["autosave.config"], undefined, 1 << 2);
check("master bus", 0, 1, ["autosave.master_fx"]);
check("send bus", 0, 4, ["autosave.send_fx"]);
check("move bus", 0, 1 << 10, ["autosave.move_fx"]);
check("throwing saver still closes its span", 0, 1, ["autosave.master_fx"], "master_fx");
/* Control: the harness must SEE an unclosed span, or "0 left open" means nothing. */
{
    const probe = code.replace("finally { host_trace_end(h); }", "finally { }");
    if (probe === code) fails.push("control: could not remove host_trace_end from autosaveTraced");
    else if (run(probe, 0, 1).open !== 1) fails.push("control: harness did not detect an unclosed span");
}

if (fails.length) { for (const f of fails) console.error("FAIL: " + f); process.exit(1); }
NODE

echo "PASS: bulk GETs and every autosave unit carry a balanced trace span"
