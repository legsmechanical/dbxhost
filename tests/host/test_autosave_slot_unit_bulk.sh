#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# The slot (chain) autosave unit reads through bulk GETs — and writes the SAME
# bytes it wrote with single GETs.
#
# A slot unit used to cost ~25 single round-trips before its state blobs: the
# six module ids read TWICE (refreshSlotModuleSignature, then again for
# moduleChanged), `dirty`, each component's `:bypassed`, the channels,
# pre-mode, knob mappings, buses:config and LFOs. They now ride two `chain:`
# bulk GETs; `<prefix>:state` blobs stay single (the reply shares one buffer).
#
# A cheaper read is only acceptable if nothing downstream can tell. So this
# runs the REAL autosaveAllSlots/buildSlotPatchJson source three ways against
# ONE simulated host and requires byte-identical slot_N.json output, return
# values and signature/dirty bookkeeping — for the autosave AND for a
# snapshot take (forSnapshot):
#   single     — no bulk binding at all (the old read path);
#   bulk       — bulk GETs with the C wire semantics;
#   bulk-fails — every bulk request fails (null), forcing the fallback.
# The host model copies the C side, not a convenient one: a key resolves
# through the same table for both request types; an unresolved key is `?\n`
# in a bulk reply and "" from a single GET (the cleared value buffer); a slot
# with no chain instance resolves only `slot:*`; a failed request is null; a
# bulk reply past the value buffer is refused (null).

node --input-type=module - <<'NODE'
import fs from "fs";
import { bulkEncodeItems, bulkDecode } from "./src/shared/snapshot.mjs";
import * as BusModel from "./src/shared/bus_model.mjs";

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
const sigKeysDecl = (src.match(/const SLOT_MODULE_SIGNATURE_KEYS = \[[^\]]*\];/) || [""])[0];
ok(sigKeysDecl, "SLOT_MODULE_SIGNATURE_KEYS declaration not found");
const code = [sigKeysDecl, ...["getSlotParam", "getSlotParamsBulk", "getSlotStateWithRetry",
    "slotModuleSignatureOf", "getSlotModuleSignature", "refreshSlotModuleSignature",
    "buildSlotPatchJson", "autosaveAllSlots"].map(extractFn)].join("\n");

const VALUE_CAP = 128 * 1024;
const BUSES = JSON.stringify({ buses: [{ present: 1, name: "Verb", sends: [0.5], fx: [{ module: "chorus" }] }],
                               main_sends: [1, 0.25] });
/* slot -> { instance, keys } ; any key not listed is unresolved (-1). */
function makeWorld() {
    const sig = (m) => ({ synth_module: m[0] || "", midi_fx1_module: m[1] || "", fx1_module: m[2] || "",
                          fx2_module: m[3] || "", fx3_module: m[4] || "", fx4_module: m[5] || "" });
    return [
        { name: "Full", instance: true, keys: { ...sig(["obxd", "arp", "freeverb", "delay"]), dirty: "1",
            "synth:state": JSON.stringify({ patch: 7, name: "héllo" }), "midi_fx1:state": "{\"rate\":3}",
            "fx1:state": "mix=0.3;size=0.9", "fx2:state": "", "fx1:bypassed": "1", "synth:bypassed": "0",
            "midi_fx1:bypassed": "0", "fx2:bypassed": "0", midi_fx_pre_mode: "1",
            knob_mappings: JSON.stringify([{ knob: 1, target: "synth", param: "cutoff" }]),
            lfo_config: JSON.stringify([{ enabled: 1, shape: 2 }]), "buses:config": BUSES,
            "bus1:fx1:state": "{\"depth\":0.4}" } },
        /* A plugin that serves none of the optional keys: every one is `?`. */
        { name: "Bare", instance: true, keys: { ...sig(["dx7"]), dirty: "0", "synth:state": "{\"v\":1}" } },
        { name: "Fx34", instance: true, keys: { ...sig(["sampler", "", "", "", "eq", "comp"]), dirty: "1",
            "synth:state": "", "fx3:state": "{}", "fx4:state": "a=1", "fx3:bypassed": "0", "fx4:bypassed": "1",
            "buses:config": "", knob_mappings: "[]", lfo_config: "" } },
        /* Empty slot, no chain instance, no name: the empty marker. */
        { name: "", instance: false, keys: {} },
        /* Synth whose state read FAILS (null): the autosave bails, a snapshot writes. */
        { name: "Busy", instance: true, failState: "synth:state", keys: { ...sig(["jv880"]), dirty: "1",
            "synth:bypassed": "0" } },
    ].map((w, i) => ({ ...w, slot: i }));
}

function makeHost(mode) {
    const world = makeWorld();
    const h = { single: 0, bulk: 0, perSlot: {} };
    const count = (slot, kind) => { h.perSlot[slot] = h.perSlot[slot] || { single: 0, bulk: 0 }; h.perSlot[slot][kind]++; };
    const slotKey = (slot, key) => ({ "slot:receive_channel": String(slot + 1), "slot:forward_channel": "-1" })[key];
    h.direct = (slot, key) => {
        const w = world[slot];
        const sk = slotKey(slot, key);
        if (sk !== undefined) return sk;
        if (!w || !w.instance) return -1;
        return Object.prototype.hasOwnProperty.call(w.keys, key) ? w.keys[key] : -1;
    };
    h.shadow_get_param = (slot, key) => {
        h.single++; count(slot, "single");
        const w = world[slot];
        if (w && w.failState === key) return null;         /* timeout */
        const r = h.direct(slot, key);
        return r === -1 ? "" : r;
    };
    h.shadow_get_params = (mode === "single") ? undefined : (slot, marker, blob) => {
        h.bulk++; count(slot, "bulk");
        if (mode === "bulk-fails" || marker !== "chain:") return null;
        const req = bulkDecode(blob);
        if (!req || req.length > 64) return null;
        let out = req.length + "\n";
        for (const k of req) {
            const r = h.direct(slot, k);
            out += (r === -1) ? "?\n" : Buffer.byteLength(r, "utf8") + "\n" + r;
        }
        if (Buffer.byteLength(out, "utf8") >= VALUE_CAP) return null;
        return out;
    };
    h.world = world;
    return h;
}

function runRig(mode, forSnapshot) {
    const host = makeHost(mode);
    const writes = [];
    const chainConfigs = Array.from({ length: 8 }, () => null);
    const scope = {
        SHADOW_UI_SLOTS: 5, BusModel, bulkEncodeItems, bulkDecode,
        activeSlotStateDir: "/set",
        slots: host.world.map((w) => ({ name: w.name })),
        chainConfigs,
        lastSlotModuleSignatures: [], slotDirtyCache: [], slotUserCleared: [],
        lastSavedSlotSignature: ["", "", "", "", "jv880|||||"],
        isPresetPreviewActive: () => false,
        host_read_file: () => null,
        host_write_file: (p, c) => { writes.push([p, c]); return true; },
        /* loadChainConfigFromSlot: fills chainConfigs from the module ids, as the
         * real one does — without round-trips, so both modes share its cost. */
        loadChainConfigFromSlot: (i) => {
            const k = host.world[i].keys, m = (id) => id ? { module: id, params: {} } : null;
            chainConfigs[i] = { synth: m(k.synth_module), midiFx: m(k.midi_fx1_module), fx1: m(k.fx1_module),
                                fx2: m(k.fx2_module), fx3: m(k.fx3_module), fx4: m(k.fx4_module) };
        },
        invalidateFeedbackModuleCache: () => {}, invalidateKnobContextCache: () => {},
        debugLog: () => {},
        shadow_get_param: host.shadow_get_param, shadow_get_params: host.shadow_get_params,
    };
    const run = new Function(...Object.keys(scope), `let needsRedraw = false;
        ${code}
        const ret = [];
        for (let s = 0; s < SHADOW_UI_SLOTS; s++) ret.push(autosaveAllSlots(s, ${forSnapshot}));
        return { ret, dirty: slotDirtyCache.slice(), saved: lastSavedSlotSignature.slice(),
                 sigs: lastSlotModuleSignatures.slice() };`);
    const r = run(...Object.values(scope));
    return { ...r, writes, host };
}

for (const forSnapshot of [false, true]) {
    const tag = forSnapshot ? "snapshot" : "autosave";
    const base = runRig("single", forSnapshot);
    ok(base.writes.length >= 4, `${tag}: the single-read baseline wrote ${base.writes.length} files — the rig is not exercising the saver`);
    for (const mode of ["bulk", "bulk-fails"]) {
        const r = runRig(mode, forSnapshot);
        ok(JSON.stringify(r.writes) === JSON.stringify(base.writes),
           `${tag}/${mode}: slot files differ from the single-read path:\n  single=${JSON.stringify(base.writes)}\n  ${mode}=${JSON.stringify(r.writes)}`);
        for (const f of ["ret", "dirty", "saved", "sigs"])
            ok(JSON.stringify(r[f]) === JSON.stringify(base[f]),
               `${tag}/${mode}: ${f} differs: ${JSON.stringify(base[f])} vs ${JSON.stringify(r[f])}`);
    }
    if (forSnapshot) continue;
    /* The point of it: round-trips. Slot 0 = 5 state blobs (synth, midi fx, fx1,
     * fx2, one bus insert) as singles, everything else in 2 bulks. */
    const b = runRig("bulk", false).host.perSlot;
    ok(b[0].single === 5 && b[0].bulk === 2, `slot 0 (4 components + 1 bus insert): ${JSON.stringify(b[0])}, expected 5 single + 2 bulk`);
    ok(base.host.perSlot[0].single > 20, `control: the single path should cost >20 GETs for slot 0, got ${base.host.perSlot[0].single}`);
    ok(b[2].single === 3 && b[2].bulk === 2, `slot 2 (synth + fx3 + fx4): ${JSON.stringify(b[2])}, expected 3 single + 2 bulk`);
    ok(b[3].single === 0 && b[3].bulk === 1, `empty slot: ${JSON.stringify(b[3])}, expected 0 single + 1 bulk`);
    /* Equivalence cannot see a read of the WRONG key (both modes would read it),
     * so the document must also carry what the host served, field by field. */
    const doc = (slot) => { const w = base.writes.find(([p]) => p === `/set/slot_${slot}.json`); return w ? JSON.parse(w[1]).chain : null; };
    const d0 = doc(0), d2 = doc(2);
    ok(d0 && d0.synth.bypassed === 0 && d0.audio_fx[0].bypassed === 1 && d0.audio_fx[1].bypassed === 0 &&
       d0.midi_fx[0].bypassed === 0 && d0.receive_channel === 1 && d0.forward_channel === -1 &&
       d0.midi_fx_pre_mode === 1 && d0.knob_mappings[0].param === "cutoff" && d0.lfos[0].shape === 2 &&
       d0.buses[0].fx[0].state.depth === 0.4 && d0.main_sends[1] === 0.25 &&
       d0.synth.config.state.name === "héllo" && d0.audio_fx[0].params.state === "mix=0.3;size=0.9",
       "slot 0 document does not carry the served values: " + JSON.stringify(d0));
    ok(d2 && d2.audio_fx.length === 2 && d2.audio_fx[0].bypassed === 0 && d2.audio_fx[1].bypassed === 1 &&
       d2.receive_channel === 3 && d2.buses === undefined && d2.knob_mappings === undefined,
       "slot 2 document does not carry the served values: " + JSON.stringify(d2));
    /* Sanity on the scenario itself: the bail and the empty marker both happened. */
    ok(!base.writes.some(([p]) => p === "/set/slot_4.json"), "control: slot 4's failed state read did not bail the autosave");
    ok(base.writes.some(([p, c]) => p === "/set/slot_3.json" && c === "{}\n"), "control: the empty slot did not write its marker");
    ok(base.writes.some(([p, c]) => p === "/set/slot_1.json" && c.includes("\"midi_fx_pre_mode\": 0")),
       "control: an unresolved midi_fx_pre_mode did not serialise as 0 (the `?` -> \"\" mapping is untested)");
}

if (fails.length) { for (const f of fails) console.error("FAIL: " + f); process.exit(1); }
console.log("PASS: slot autosave unit via bulk writes byte-identical slot files (autosave + snapshot, incl. failed bulks)");
NODE
