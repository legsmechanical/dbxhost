#!/usr/bin/env bash
# The read meter counts what the device actually pays for.
#
# ⭐ WHY IT EXISTS. Every slow thing dAVEBOx has hit is one shape: a question to
# the sound engine and a wait, ~2.9 ms of SPI against a ~10.6 ms tick. Every fix
# so far was found by reasoning backwards from a symptom, and the DR32 picker has
# had THREE theories and no measurement — its "150-270 reads/frame" was inferred
# from frame time and then cited as though counted. A counter is what stops the
# fourth theory.
#
# ⚠⚠ A COUNTER THAT IS WRONG IS WORSE THAN NONE, so this drives the real module
# and checks the arithmetic against the REAL bulk encoder rather than a shape
# written here — the first cut of the bulk branch guessed a comma-separated
# format, described that guess in a comment, and `bulkEncode` uses no commas.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
import { installReadMeter, readMeterTick, readMeterReport, readMeterLine,
         readMeterReset, readMeterUninstallForTest }
    from "./davebox/ui/ui_readmeter.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };

/* ⚠⚠ THE ENCODER IS THE REAL ONE, lifted out of ui_engine.mjs by reading its
 * source — not a re-implementation. If `bulkEncode` changes shape this test
 * changes with it instead of quietly measuring a format nobody sends. */
const engineSrc = readFileSync("davebox/ui/ui_engine.mjs", "utf8");
const encLine = engineSrc.split("\n").find((l) => l.indexOf("function bulkEncode(") >= 0);
if (!encLine) { console.log("FAIL: bulkEncode not found in ui_engine.mjs"); process.exit(1); }
const utf8Len = (s) => { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : (c < 0x800 ? 2 : (c > 0xFFFF ? 4 : 3)); } return n; };
const bulkEncode = new Function("items", "utf8Len",
    encLine.replace(/^\s*function bulkEncode\(items\)\s*\{/, "").replace(/\}\s*$/, ""));
ok(typeof encLine === "string" && encLine.indexOf("items.length") >= 0,
   "control: the real bulkEncode was lifted from ui_engine.mjs");

let hostCalls = 0;
globalThis.shadow_get_param = () => { hostCalls++; return "v"; };
globalThis.shadow_get_params = () => { hostCalls++; return ""; };
readMeterUninstallForTest();
ok(installReadMeter() === true, "it installs");
/* ⚠⚠ init() RE-RUNS IN THE SAME RUNTIME on resume. A second wrap would count
 * every read TWICE and the number would silently double — the kind of wrong
 * that looks like a regression in the thing being measured. */
ok(installReadMeter() === false, "⚠ a second install is refused — a double wrap doubles every count");

readMeterReset();
globalThis.shadow_get_param(0, "synth:cutoff");
globalThis.shadow_get_param(0, "synth:cutoff");
globalThis.shadow_get_param(0, "synth:res");
readMeterTick();
{
    const r = readMeterReport();
    ok(r.worstCalls === 3, "three single reads in a tick count as three calls (" + r.worstCalls + ")");
    ok(r.worstKeys === 3, "...and three keys");
    ok(r.top[0] === "synth:cutoffx2", "the key histogram names the repeat offender: " + r.top[0]);
}

/* ⚠ A BULK read is ONE round trip carrying many keys. Counting it as many would
 * make BATCHING — which is the fix — look like the problem. */
readMeterReset();
globalThis.shadow_get_params(0, "chain:", bulkEncode(["a", "bb", "ccc", "d", "e"], utf8Len));
readMeterTick();
{
    const r = readMeterReport();
    ok(r.worstCalls === 1, "a bulk read is ONE call — the round trip is the cost (" + r.worstCalls + ")");
    ok(r.worstKeys === 5, "...carrying five keys, read off the real encoder (" + r.worstKeys + ")");
}

/* A read the counter cannot parse still happened. */
readMeterReset();
globalThis.shadow_get_params(0, "chain:", "");
readMeterTick();
ok(readMeterReport().worstKeys === 1,
   "an unparsable bulk blob counts as one key, never zero — the round trip is real");

/* ⚠⚠ IT MUST NOT SWALLOW OR ALTER THE READ. A meter that changes the value it
 * measures is the worst possible bug in a diagnostic. */
readMeterReset();
hostCalls = 0;
const got = globalThis.shadow_get_param(0, "synth:cutoff");
ok(got === "v", "the wrapped read still returns the host`s value");
ok(hostCalls === 1, "...and reaches the host exactly once");

/* The tick boundary. Counted at the TOP of a tick so a tick that THROWS still
 * reports — davebox`s tick wrapper swallows into a log file, and a failed tick
 * is exactly the one worth seeing. */
readMeterReset();
globalThis.shadow_get_param(0, "a");
readMeterTick();
globalThis.shadow_get_param(0, "b"); globalThis.shadow_get_param(0, "b");
readMeterTick();
readMeterTick();
{
    const r = readMeterReport();
    ok(r.ticks === 3, "three ticks closed (" + r.ticks + ")");
    ok(r.worstCalls === 2, "the WORST tick is reported, not the last (" + r.worstCalls + ")");
    ok(Math.abs(r.meanCalls - 1) < 1e-9, "the mean is over all ticks incl. the quiet one (" + r.meanCalls + ")");
}

/* The line that reaches debug.log. */
ok(/^readmeter ticks=\d+ worst=\d+ calls\/\d+ keys mean=/.test(readMeterLine()),
   "the log line is one line and names both numbers: " + readMeterLine());

/* ---- the wiring, at the one place it can be ---------------------------- */
const ui = readFileSync("davebox/ui/ui.js", "utf8");
ok(/installReadMeter\(\);/.test(ui), "ui.js installs it");
ok(ui.indexOf("installReadMeter();") > ui.indexOf("globalThis.init = function"),
   "...inside init(), where the other wraps are installed");
/* ⚠ ORDER: the boundary is taken before the body, or a throwing tick loses its
 * reads. Pinned as an ordering fact, which is all a source read can prove. */
const tickAt = ui.indexOf("globalThis.tick = function");
const body = ui.slice(tickAt, tickAt + 700);
const boundaryAt = body.indexOf("readMeterTick();");
const implAt = body.indexOf("_tickImpl();");
ok(boundaryAt >= 0 && implAt >= 0 && boundaryAt < implAt,
   "⚠ the tick boundary is taken BEFORE the tick body (" + boundaryAt + " < " + implAt + ")");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the read meter counts round trips, not keys, and cannot double-install");
'
