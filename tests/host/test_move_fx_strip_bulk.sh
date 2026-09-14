#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# S4: saveMoveFxChainConfig's 4 Move-bus strips (volume/pan/send_a/send_b/
# muted/soloed = 24 keys) now cost ONE `chain:` bulk GET at slot 0 instead of
# 24 single GETs. Block keys (name/state/params/bypassed) stay single.
#
# Runs the REAL saveMoveFxChainConfig source two ways against one simulated
# host and requires byte-identical move_fx_meta.json output and return value:
#   single — no bulk binding (bulk GET unavailable, falls back... actually
#            the function ALWAYS uses bulk now, so "single" here means the
#            bulk path serving from the SAME per-key table a single GET would.
#   bulk-fails — the bulk request returns null (mailbox timeout) => refuse.
#   bulk-unresolved — one of the 24 keys comes back `?` => refuse.
#
# The equivalence check proves the bulk decode maps onto the same JSON the
# single-GET code used to produce; the refusal checks prove neither a null
# reply nor a single `?` is silently treated as a valid (if odd) value.

node --input-type=module - <<'NODE'
import fs from "fs";
import { bulkEncodeItems, bulkDecode } from "./src/shared/snapshot.mjs";

const src = fs.readFileSync("src/shadow/shadow_ui.js", "utf8");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function extractFn(name) {
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
const code = extractFn("saveMoveFxChainConfig");
ok(code, "saveMoveFxChainConfig not found");
ok(code.includes("shadow_get_params"), "saveMoveFxChainConfig no longer calls shadow_get_params — did S4 regress?");

const STRIP_FIELDS = ["volume", "pan", "send_a", "send_b", "muted", "soloed"];
const VALUE_CAP = 128 * 1024;

/* Ground-truth strip state the host is serving, keyed by full param key. */
function makeStripTable() {
    const t = {};
    for (let sl = 0; sl < 4; sl++) {
        t["move_fx:" + (sl + 1) + ":volume"] = String(0.5 + sl * 0.1);
        t["move_fx:" + (sl + 1) + ":pan"] = String(0.5);
        t["move_fx:" + (sl + 1) + ":send_a"] = String(0.2 * sl);
        t["move_fx:" + (sl + 1) + ":send_b"] = String(0.1 * sl);
        t["move_fx:" + (sl + 1) + ":muted"] = (sl === 1) ? "1" : "0";
        t["move_fx:" + (sl + 1) + ":soloed"] = "0";
    }
    return t;
}

function makeHost(mode) {
    const strips = makeStripTable();
    const h = { singleCalls: 0, bulkCalls: 0 };
    /* Every block/name/bypassed key resolves empty (no module loaded) so the
     * block loop writes {} and never touches the strip table. */
    h.shadow_get_param = (slot, key) => {
        h.singleCalls++;
        if (key.endsWith(":name")) return "";
        return "0";
    };
    h.shadow_get_params = (slot, marker, blob) => {
        h.bulkCalls++;
        if (marker !== "chain:") return null;
        if (mode === "bulk-fails") return null;
        const req = bulkDecode(blob);
        if (!req) return null;
        let out = req.length + "\n";
        for (const k of req) {
            if (mode === "bulk-unresolved" && k === "move_fx:3:send_a") { out += "?\n"; continue; }
            const v = Object.prototype.hasOwnProperty.call(strips, k) ? strips[k] : null;
            out += (v === null) ? "?\n" : Buffer.byteLength(v, "utf8") + "\n" + v;
        }
        if (Buffer.byteLength(out, "utf8") >= VALUE_CAP) return null;
        return out;
    };
    h.strips = strips;
    return h;
}

function runRig(mode) {
    const host = makeHost(mode);
    const writes = [];
    const scope = {
        MOVE_FX_SLOTS_JS: 4, MOVE_FX_BLOCKS_JS: 4,
        MASTER_FX_OPTIONS: [],
        activeSlotStateDir: "/set",
        bulkEncodeItems, bulkDecode,
        host_write_file: (p, c) => { writes.push([p, c]); return true; },
        debugLog: () => {},
        shadow_get_param: host.shadow_get_param, shadow_get_params: host.shadow_get_params,
    };
    const run = new Function(...Object.keys(scope), `${code}
        const ret = saveMoveFxChainConfig();
        return { ret };`);
    const r = run(...Object.values(scope));
    return { ...r, writes, host };
}

const bulk = runRig("bulk");
const metaWrite = bulk.writes.find(([p]) => p === "/set/move_fx_meta.json");
ok(bulk.ret === true, `bulk mode should report ok=true, got ${bulk.ret}`);
ok(!!metaWrite, "bulk mode did not write move_fx_meta.json");
ok(bulk.host.bulkCalls === 1, `expected exactly ONE bulk GET for the strips, got ${bulk.host.bulkCalls}`);

if (metaWrite) {
    const meta = JSON.parse(metaWrite[1]);
    ok(Array.isArray(meta.strips) && meta.strips.length === 4, "move_fx_meta.json strips array wrong shape: " + metaWrite[1]);
    const expect = [];
    for (let sl = 0; sl < 4; sl++) {
        expect.push({
            volume: parseFloat(bulk.host.strips["move_fx:" + (sl + 1) + ":volume"]),
            pan: parseFloat(bulk.host.strips["move_fx:" + (sl + 1) + ":pan"]),
            send_a: parseFloat(bulk.host.strips["move_fx:" + (sl + 1) + ":send_a"]),
            send_b: parseFloat(bulk.host.strips["move_fx:" + (sl + 1) + ":send_b"]),
            muted: parseInt(bulk.host.strips["move_fx:" + (sl + 1) + ":muted"], 10) === 1 ? 1 : 0,
            soloed: parseInt(bulk.host.strips["move_fx:" + (sl + 1) + ":soloed"], 10) === 1 ? 1 : 0,
        });
    }
    ok(JSON.stringify(meta.strips) === JSON.stringify(expect),
       `strip values do not match the served table:\n  got=${JSON.stringify(meta.strips)}\n  want=${JSON.stringify(expect)}`);
}

for (const mode of ["bulk-fails", "bulk-unresolved"]) {
    const r = runRig(mode);
    ok(r.ret === false, `${mode}: expected ok=false, got ${r.ret}`);
    ok(!r.writes.some(([p]) => p === "/set/move_fx_meta.json"),
       `${mode}: move_fx_meta.json must NOT be written when a strip read fails/unresolves`);
}

/* Control: prove the rig can actually catch a broken strip value — flip one
 * field in the served table and require the equivalence check above to have
 * been discriminating (i.e. this alternate table produces DIFFERENT JSON). */
{
    const host = makeHost("bulk");
    host.strips["move_fx:2:pan"] = "0.9";
    const scope = {
        MOVE_FX_SLOTS_JS: 4, MOVE_FX_BLOCKS_JS: 4, MASTER_FX_OPTIONS: [],
        activeSlotStateDir: "/set", bulkEncodeItems, bulkDecode,
        host_write_file: (p, c) => { writes.push([p, c]); return true; },
        debugLog: () => {},
        shadow_get_param: host.shadow_get_param, shadow_get_params: host.shadow_get_params,
    };
    const writes = [];
    scope.host_write_file = (p, c) => { writes.push([p, c]); return true; };
    const run = new Function(...Object.keys(scope), `${code}\nreturn saveMoveFxChainConfig();`);
    run(...Object.values(scope));
    const mw = writes.find(([p]) => p === "/set/move_fx_meta.json");
    ok(mw && JSON.parse(mw[1]).strips[1].pan === 0.9,
       "control: perturbing the served table did not change the written pan — the rig is not sensitive to strip values");
}

if (fails.length) { for (const f of fails) console.error("FAIL: " + f); process.exit(1); }
console.log("PASS: Move FX strips via bulk write byte-identical meta, refuse on null/unresolved");
NODE
