#!/usr/bin/env bash
# The wave editor must read the value that WILL STAND, not the engine's.
#
# ⚠⚠ THE ENGINE IS STALE UNTIL THE WRITE QUEUE DRAINS. A write sits in
# `S.pendingWrites` — coalesced per key — for up to a tick, then in `S.inflight`
# for INFLIGHT_CONFIRM_TICKS more before the readback confirms it. An editor
# that computes each detent's next value from a fresh `engineGet` computes it
# from the value BEFORE the last edit, and the coalescer then keeps only the
# newest of those: a fast sweep advances about one step per confirm cycle and
# the rest of the detents disappear. Redrawing from the engine snaps the cursor
# back the same way. davebox names this failure in `verifyInflight`'s own
# comment — "the knob resets after I turn it".
#
# The unit test cannot see this: the io is assembled in ui_sound, and a test rig
# supplies its own. So the SITE is pinned.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const src = readFileSync("davebox/ui/ui_sound.mjs", "utf8");

/* ---- the reader itself consults the queue, in order ---------------------- */
const fnAt = src.indexOf("function settledValue(");
ok(fnAt >= 0, "settledValue() exists");
if (fnAt < 0) { console.log("FAIL: nothing to check"); process.exit(1); }
let d = 0, i = src.indexOf("{", fnAt);
for (;; i++) { const c = src[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) break; } }
const fn = strip(src.slice(fnAt, i + 1));
const pend = fn.indexOf("pendingWrites"), infl = fn.indexOf("inflightFor"), eng = fn.indexOf("engineGet");
ok(pend >= 0 && infl >= 0 && eng >= 0, "control: it names all three sources");
ok(pend < infl && infl < eng,
   "queue, then inflight, then the engine — in that order (" + pend + "/" + infl + "/" + eng + ")");

/* ---- and the wave editor uses it ---------------------------------------- */
const opAt = src.indexOf("function openWavEditor(");
ok(opAt >= 0, "openWavEditor() exists");
d = 0; i = src.indexOf("{", opAt);
for (;; i++) { const c = src[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) break; } }
const op = strip(src.slice(opAt, i + 1));
ok(op.length > 300, "control: the function body was extracted (" + op.length + " chars)");
ok(/getParam:\s*\(k\)\s*=>\s*settledValue\(/.test(op),
   "the editor`s getParam goes through settledValue");
ok(!/getParam:\s*\(k\)\s*=>\s*engineGet/.test(op),
   "...and NOT straight at the engine — that is the stale read");
ok(/setParam:\s*\(k,\s*v\)\s*=>\s*queueWrite\(/.test(op),
   "control: writes still go through the ledger (queueWrite), never engineSet");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the wave editor reads the value that will stand");
'
