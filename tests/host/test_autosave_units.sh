#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# The dirty-driven autosave's UNITS, driven through the real source.
#
# 2026-09-14: a session-fader gesture across four tracks cost 1.2-1.5 s of
# stalled ticks. Each dirty slot ran a chain save AND a full rewrite of
# shadow_chain_config.json — one file covering all eight slots, read with
# 81 single param GETs — so the same eight-slot file was re-read and
# re-written once per slot touched. The fix has three halves and this pins
# each by BEHAVIOUR, not by grep:
#   1. the chain and the slot settings are separate units with separate
#      dirty masks, each cleared only by its own success;
#   2. the config is written ONCE per pass however many slots changed, read
#      with one `chain:` bulk GET per slot (8 round-trips, 0 single GETs);
#   3. an unanswered key — `?` on the wire, or a failed request (null) —
#      refuses the write: no file, bits kept, back-off. Never defaults.
# Plus the starvation guard: a unit that fails is deferred for the rest of
# the pass, so a chain that cannot save does not block the config behind it.
#
# The stubs copy the C side's semantics, not convenient ones: the bulk reply
# is the real wire format ("<n>\n" then "<len>\n<bytes>", `?\n` for a key
# shadow_direct_get_param does not resolve — shim_handle_param_bulk_chain_get),
# a busy/failed request is null, and more than 64 items is a refused request.

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
const keysDecl = (src.match(/const CHAIN_CONFIG_KEYS = \[[^\]]*\];/) || [""])[0];
ok(keysDecl, "CHAIN_CONFIG_KEYS declaration not found");
const code = [keysDecl, "autosaveTraced", "readSlotConfigValues", "saveChainConfigToDir",
              "saveOneDirtyUnit", "autosaveEndPass"]
    .map((n) => n.startsWith("const ") ? n : extractFn(n)).join("\n");

const SLOT_KEYS = ["volume", "pan", "receive_channel", "forward_channel", "muted", "soloed",
                   "send_a", "send_b", "transpose", "synth_volume", "feedback_hold"];

/* A host: the values shadow_handle_slot_param_get would format, per slot. */
function makeHost(opts = {}) {
    const vals = [];
    for (let i = 0; i < 8; i++) vals.push({
        volume: (0.1 * (i + 1)).toFixed(2), pan: "0.50", receive_channel: String(i + 1),
        forward_channel: String(i - 1), muted: String(i % 2), soloed: "0",
        send_a: "0.25", send_b: "0.75", transpose: String(i - 4), synth_volume: "0.90",
        feedback_hold: "0",
    });
    const h = {
        vals, single: 0, bulk: 0, bulkKeys: 0, writes: [],
        unresolved: opts.unresolved || null,   /* {slot, key}: that key answers `?` */
        failBulkSlot: opts.failBulkSlot,       /* that slot's bulk request fails (null) */
        chainFails: new Set(opts.chainFails || []),
        chainCalls: [], busCalls: [],
    };
    /* shadow_direct_get_param: a string, or -1 for "I do not know this key". */
    h.direct = (slot, key) => {
        if (h.unresolved && h.unresolved.slot === slot && h.unresolved.key === key) return -1;
        if (key.startsWith("slot:") && SLOT_KEYS.includes(key.slice(5))) return vals[slot][key.slice(5)];
        return -1;
    };
    h.shadow_get_param = (slot, key) => { h.single++; const r = h.direct(slot, key); return r === -1 ? "" : r; };
    h.shadow_get_params = (slot, marker, blob) => {
        h.bulk++;
        if (marker !== "chain:") return null;
        if (h.failBulkSlot === slot) return null;
        const req = bulkDecode(blob);                 /* the request uses the same framing */
        if (!req || req.length > 64) return null;     /* error 22 -> null in shadow_param_bulk_js */
        h.bulkKeys += req.length;
        let out = req.length + "\n";
        for (const k of req) {
            const r = h.direct(slot, k);
            out += (r === -1) ? "?\n" : Buffer.byteLength(r, "utf8") + "\n" + r;
        }
        return out;
    };
    return h;
}

function makeRig(host, state) {
    const scope = {
        SHADOW_UI_SLOTS: 8, MOVE_FX_SLOTS_JS: 4, AUTOSAVE_RETRY_MS: 1000,
        FXBUS_DIRTY_MASTER: 1, FXBUS_DIRTY_SEND_A: 2, FXBUS_DIRTY_SEND_B: 4, FXBUS_DIRTY_MOVE_SHIFT: 8,
        activeSlotStateDir: "/set",
        slots: Array.from({ length: 8 }, (_, i) => ({ name: "S" + i })),
        bulkEncodeItems, bulkDecode,
        host_trace_begin: () => 0, host_trace_end: () => {},
        debugLog: () => {},
        shadow_get_param: host.shadow_get_param,
        shadow_get_params: host.shadow_get_params,
        getSlotParam: (s, k) => host.shadow_get_param(s, k),
        host_write_file: (p, c) => { host.writes.push({ p, c }); return true; },
        autosaveAllSlots: (slot) => { host.chainCalls.push(slot); return !host.chainFails.has(slot); },
        saveMasterFxChainConfig: () => { host.busCalls.push("master"); return true; },
        saveSendFxChainConfig: (w) => { host.busCalls.push("send_" + w); return true; },
        saveMoveFxChainConfig: (m) => { host.busCalls.push("move_" + m); return true; },
    };
    const body = `let autosaveDirtySlots = ${state.slots | 0}, autosaveDirtyConfig = ${state.config | 0},
                     autosaveDirtyBuses = ${state.buses | 0}, autosaveNotBefore = 0;
                 let autosaveDeferredSlots = 0, autosaveConfigDeferred = false;
                 ${code}
                 return {
                     unit: () => saveOneDirtyUnit(),
                     get: () => ({ slots: autosaveDirtySlots, config: autosaveDirtyConfig,
                                   buses: autosaveDirtyBuses, notBefore: autosaveNotBefore }),
                     save: (d) => saveChainConfigToDir(d),
                 };`;
    return new Function(...Object.keys(scope), body)(...Object.values(scope));
}

const configWrites = (h) => h.writes.filter((w) => w.p === "/set/shadow_chain_config.json");
/* Run units the way the tick does, until nothing is pending or a cap. */
function drain(rig, max = 40) {
    let n = 0;
    while (n < max) { const s = rig.get(); if (!s.slots && !s.config && !s.buses) break; rig.unit(); n++; }
    return n;
}

/* 1. A mixer gesture on four slots: ONE config write, by bulk only. */
{
    const h = makeHost();
    const rig = makeRig(h, { config: (1 << 1) | (1 << 3) | (1 << 5) | (1 << 6) });
    const units = drain(rig);
    ok(configWrites(h).length === 1, `mixer gesture: config written ${configWrites(h).length}x, expected once`);
    ok(h.single === 0, `mixer gesture: ${h.single} single GETs, expected 0`);
    ok(h.bulk === 8, `mixer gesture: ${h.bulk} bulk GETs, expected 8 (one per slot)`);
    ok(h.chainCalls.length === 0, "mixer gesture: a config-only edit ran a chain save");
    ok(units === 1 && rig.get().config === 0, `mixer gesture: ${units} units, config bits ${rig.get().config}`);
    const doc = JSON.parse(configWrites(h)[0].c);
    ok(doc.slots.length === 8, "config: 8 slots written");
    const s3 = doc.slots[3];
    ok(s3.volume === 0.4 && s3.channel === 4 && s3.forward_channel === 2 && s3.muted === 1 &&
       s3.send_b === 0.75 && s3.transpose === -1 && s3.synth_volume === 0.9 && s3.name === "S3",
       "config: slot 3 values do not match what the host served: " + JSON.stringify(s3));

    /* Cross-pin: the JSON field order equals the C writer's (shadow_set_pages.c). */
    const c = fs.readFileSync("src/host/shadow_set_pages.c", "utf8");
    const fmt = (c.match(/fprintf\(f, "    \{(\\"name\\".*?)\}%s\\n"/) || [])[1];
    ok(fmt, "cross-pin: the C writer's per-slot format string was not found");
    if (fmt) {
        const cKeys = [...fmt.matchAll(/\\"([a-z_]+)\\":/g)].map((m) => m[1]);
        ok(JSON.stringify(Object.keys(s3)) === JSON.stringify(cKeys),
           `cross-pin: JS fields ${JSON.stringify(Object.keys(s3))} != C fields ${JSON.stringify(cKeys)}`);
    }
}

/* 2. Chain + config dirty on two slots: two chain units, still ONE config write. */
{
    const h = makeHost();
    const rig = makeRig(h, { slots: (1 << 1) | (1 << 3), config: (1 << 1) | (1 << 3) });
    drain(rig);
    ok(JSON.stringify(h.chainCalls) === "[1,3]", `chain units ran ${JSON.stringify(h.chainCalls)}, expected [1,3]`);
    ok(configWrites(h).length === 1, `chain+config: config written ${configWrites(h).length}x, expected once`);
}

/* 3. One unresolved key (`?`) anywhere: no file, bits kept, back-off. */
{
    const h = makeHost({ unresolved: { slot: 6, key: "slot:transpose" } });
    const rig = makeRig(h, { config: 1 << 2 });
    rig.unit();
    const st = rig.get();
    ok(configWrites(h).length === 0, "`?` reply: the config file was written anyway (defaults over the user's settings)");
    ok(st.config === (1 << 2), `\`?\` reply: config bits ${st.config}, expected kept`);
    ok(st.notBefore > 0, "`?` reply: no back-off");
    ok(rig.save("/set") === false, "`?` reply: saveChainConfigToDir did not report failure");
}

/* 3b. Control for 3: the SAME position answering "" (an answer) writes. */
{
    const h = makeHost();
    h.vals[6].transpose = "";
    const rig = makeRig(h, { config: 1 << 2 });
    rig.unit();
    ok(configWrites(h).length === 1, "control: an EMPTY value is an answer and must write (only `?` refuses)");
    if (configWrites(h).length) ok(JSON.parse(configWrites(h)[0].c).slots[6].transpose === 0,
                                   "control: an empty transpose writes its default 0");
}

/* 4. A failed bulk request (null) on any slot: no file, bits kept, back-off. */
{
    const h = makeHost({ failBulkSlot: 7 });
    const rig = makeRig(h, { config: 1 });
    rig.unit();
    ok(configWrites(h).length === 0, "null reply: the config file was written anyway");
    ok(rig.get().config === 1 && rig.get().notBefore > 0, "null reply: bits not kept / no back-off");
}

/* 4b. Strictly ONE unit per tick: config and a bus both pending -> the config
 *     alone this tick, the bus on the next. */
{
    const h = makeHost();
    const rig = makeRig(h, { config: 1, buses: 1 });
    rig.unit();
    ok(configWrites(h).length === 1 && h.busCalls.length === 0,
       `one unit per tick: config + ${JSON.stringify(h.busCalls)} ran in the same tick`);
    rig.unit();
    ok(JSON.stringify(h.busCalls) === '["master"]', `one unit per tick: the bus did not follow (${JSON.stringify(h.busCalls)})`);
}

/* 5. A chain save that fails keeps ITS bit, does not clear config bits, and does
 *    not starve the config write queued behind it; it is retried next pass. */
{
    const h = makeHost({ chainFails: [2] });
    const rig = makeRig(h, { slots: 1 << 2, config: 1 << 2 });
    rig.unit();                                     /* chain slot 2: fails */
    ok(rig.get().slots === (1 << 2), "chain failure: chain bit cleared");
    ok(rig.get().config === (1 << 2), "chain failure: config bits were touched by the chain unit");
    ok(rig.get().notBefore > 0, "chain failure: no back-off");
    rig.unit();                                     /* config: must run, not the failed chain */
    ok(configWrites(h).length === 1 && rig.get().config === 0, "chain failure starved the config unit");
    ok(h.chainCalls.length === 1, "chain failure: retried before the rest of the pass had its turn");
    rig.unit();                                     /* pass ran dry -> deferral reset */
    rig.unit();                                     /* retry */
    ok(h.chainCalls.length === 2, `chain failure: not retried on the next pass (${h.chainCalls.length} calls)`);
    ok(rig.get().slots === (1 << 2), "chain failure: bit lost on the retry that also failed");
}

if (fails.length) { for (const f of fails) console.error("FAIL: " + f); process.exit(1); }
console.log("PASS: autosave units — chain/config split, config once per pass via bulk, `?`/null refuse, no starvation");
NODE
