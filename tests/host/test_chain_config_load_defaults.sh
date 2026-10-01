#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A project switch writes EVERY per-slot setting — the saved value, else the
# default — so nothing of the previous project survives in the shim (whose slot
# settings are global, not per set).
#
# 2026-10-01 clean-slate audit: loadChainConfigFromDir wrote slot:transpose only
# when the file had it (a new project's seeded config has none → the previous
# project's transpose carried) and never wrote slot:synth_volume (Module Level)
# at all — it carried across EVERY runtime switch; only the boot loader read it.
# Mute/solo stay "only when present" (the shim's mute carries the boot feedback
# guard); saved and seeded configs always have both.

node --input-type=module - <<'NODE'
import fs from "fs";
const src = fs.readFileSync("src/shadow/shadow_ui.js", "utf8");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
function extractFn(name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0 || src.indexOf(`function ${name}(`, start + 1) >= 0) { fails.push(`${name}: not found exactly once`); return ""; }
    let depth = 0, i = src.indexOf("{", start);
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
    }
    fails.push(`${name}: unbalanced`); return "";
}
const make = new Function("FILES", "SETS", `
    const SHADOW_UI_SLOTS = 8;
    const host_read_file = (p) => (p in FILES ? FILES[p] : null);
    const setSlotParamWithTimeout = (i, k, v) => { SETS.push([i, k, v]); return true; };
    const debugLog = () => {};
    ${extractFn("loadChainConfigFromDir")}
    return loadChainConfigFromDir;`);

function run(files) {
    const SETS = [];
    make(files, SETS)("/d");
    const by = {};
    for (const [i, k, v] of SETS) (by[i] = by[i] || {})[k] = v;
    return by;
}
const P = "/d/shadow_chain_config.json";

/* 1. A seeded NEW-project config (what processSetChangedFlag writes): no
 *    transpose, no synth_volume, no sends. */
const seed = { slots: Array.from({ length: 8 }, (_, i) => ({ name: "", channel: i + 1, volume: 1.0, forward_channel: -1, muted: 0, soloed: 0 })) };
let by = run({ [P]: JSON.stringify(seed) });
for (let i = 0; i < 8; i++) {
    ok(by[i] && by[i]["slot:transpose"] === "0", `seeded slot ${i}: transpose written as 0, got ${by[i] && by[i]["slot:transpose"]}`);
    ok(by[i] && by[i]["slot:synth_volume"] === "1", `seeded slot ${i}: Module Level written as 1, got ${by[i] && by[i]["slot:synth_volume"]}`);
    ok(by[i]["slot:send_a"] === "0" && by[i]["slot:send_b"] === "0", `seeded slot ${i}: sends 0`);
    ok(by[i]["slot:receive_channel"] === String(i + 1), `seeded slot ${i}: receive channel`);
    ok(by[i]["slot:muted"] === "0" && by[i]["slot:soloed"] === "0", `seeded slot ${i}: mute/solo from the file`);
}

/* 2. A SAVED project's own values are written as saved. */
const saved = { slots: Array.from({ length: 8 }, (_, i) => ({ name: "x", channel: 3, volume: 0.5, pan: 0.2, forward_channel: 4,
    muted: 1, soloed: 0, send_a: 0.3, send_b: 0.6, transpose: -5, synth_volume: 0.75 })) };
by = run({ [P]: JSON.stringify(saved) });
ok(by[2]["slot:transpose"] === "-5", "saved transpose");
ok(by[2]["slot:synth_volume"] === "0.75", "saved Module Level");
ok(by[2]["slot:volume"] === "0.5" && by[2]["slot:pan"] === "0.2", "saved volume/pan");
ok(by[2]["slot:forward_channel"] === "4" && by[2]["slot:muted"] === "1", "saved fwd/mute");
ok(by[2]["slot:send_a"] === "0.3" && by[2]["slot:send_b"] === "0.6", "saved sends");

/* 3. Out of range → the default, as the boot loader (shadow_set_pages.c). */
by = run({ [P]: JSON.stringify({ slots: [{ transpose: 40, synth_volume: 9 }] }) });
ok(by[0]["slot:transpose"] === "0" && by[0]["slot:synth_volume"] === "1", `out of range → defaults: ${JSON.stringify(by[0])}`);

/* 4. No file at all, or a short one: EVERY slot gets its defaults. */
by = run({});
ok(Object.keys(by).length === 8, `no file: all 8 slots written, got ${Object.keys(by).length}`);
ok(by[7] && by[7]["slot:transpose"] === "0" && by[7]["slot:synth_volume"] === "1" && by[7]["slot:volume"] === "1", "no file: defaults");
ok(by[7] && !("slot:muted" in by[7]), "no file: mute left alone (the feedback guard)");
by = run({ [P]: JSON.stringify({ slots: [{ transpose: 3 }] }) });
ok(by[0]["slot:transpose"] === "3" && by[5] && by[5]["slot:transpose"] === "0", "short file: the rest at defaults");

if (fails.length) { for (const f of fails) console.log("FAIL:", f); process.exit(1); }
console.log("PASS: loadChainConfigFromDir writes every slot setting, saved or default");
NODE
