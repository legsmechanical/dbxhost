#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A slot emptied by a MODULE UI is saved empty; a slot that failed to load at
# boot is still preserved.
#
# The autosave refuses to write `{}` over a slot whose file has a chain while
# the shim reports no modules — that guard protects a patch that failed to load
# at boot. Only the host's own picker could get past it (slotUserCleared). A
# module UI that clears a slot through the param API — dAVEBOx's Instrument
# None / Remove — never reaches that picker, so its removal was "preserved" and
# the instrument came back at the next launch (device, 2026-10-23: the log said
# "shim reports empty ... preserving (likely shim glitch)" for every slot set
# to None). A slot SEEN loaded this session and now empty was emptied on
# purpose; one never seen loaded is the boot failure the guard is for.
#
# Runs the REAL autosaveAllSlots / refreshSlotModuleSignature / noteSlotSeen
# source against a simulated host, as test_autosave_slot_unit_bulk.sh does.

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
    "slotModuleSignatureOf", "readSlotModuleIds", "getSlotModuleSignature", "noteSlotSeen",
    "refreshSlotModuleSignature", "buildSlotPatchJson", "autosaveAllSlots"].map(extractFn)].join("\n");

const SAVED = JSON.stringify({ name: "Untitled", version: 1, chain: { synth: { module: "tenebrae" } } });

/* One slot. `loaded` is what the shim reports right now. */
function rig() {
    const world = { loaded: "tenebrae" };
    const writes = [];
    const chainConfigs = [null];
    const keys = () => world.loaded
        ? { synth_module: world.loaded, midi_fx1_module: "", fx1_module: "", fx2_module: "", fx3_module: "",
            fx4_module: "", dirty: "1", "synth:state": "{\"v\":1}", "synth:bypassed": "0" }
        : { synth_module: "", midi_fx1_module: "", fx1_module: "", fx2_module: "", fx3_module: "", fx4_module: "" };
    const get = (slot, key) => { const k = keys(); return Object.prototype.hasOwnProperty.call(k, key) ? k[key] : ""; };
    const scope = {
        SHADOW_UI_SLOTS: 1, BusModel, bulkEncodeItems, bulkDecode,
        activeSlotStateDir: "/set",
        slots: [{ name: "Untitled" }],
        chainConfigs,
        lastSlotModuleSignatures: [], slotDirtyCache: [], slotUserCleared: [false], slotSeenLoaded: [false],
        lastSavedSlotSignature: [""],
        isPresetPreviewActive: () => false,
        host_read_file: () => SAVED,
        host_write_file: (p, c) => { writes.push(c); return true; },
        loadChainConfigFromSlot: (i) => {
            const m = (id) => id ? { module: id, params: {} } : null;
            chainConfigs[i] = { synth: m(world.loaded), midiFx: null, fx1: null, fx2: null, fx3: null, fx4: null };
        },
        invalidateFeedbackModuleCache: () => {}, invalidateKnobContextCache: () => {},
        debugLog: () => {},
        shadow_get_param: get, shadow_get_params: undefined,
    };
    const api = new Function(...Object.keys(scope), `let needsRedraw = false; let autosaveSuppressUntil = 0;
        ${code}
        return {
            save: () => autosaveAllSlots(0, false),
            refresh: () => refreshSlotModuleSignature(0),
            setChanged: () => { lastSlotModuleSignatures[0] = ""; refreshSlotModuleSignature(0);
                                slotUserCleared[0] = false; slotSeenLoaded[0] = false;
                                autosaveSuppressUntil = Date.now() + 60000; },
            quietOver: () => { autosaveSuppressUntil = 0; },
            userCleared: () => { slotUserCleared[0] = true; },
        };`)(...Object.values(scope));
    return { world, writes, api };
}

/* ⭐ The bug: seen loaded, then emptied by a module UI → the empty marker. */
{
    const r = rig();
    r.api.save();
    ok(r.writes.length === 1 && r.writes[0].includes("tenebrae"), "control: the loaded slot was not saved: " + JSON.stringify(r.writes));
    r.world.loaded = "";
    r.api.save();
    ok(r.writes.length === 2 && r.writes[1] === "{}\n",
       "a slot seen loaded and then emptied (Instrument None) was not saved empty: " + JSON.stringify(r.writes));
}

/* Seen by a signature refresh alone (no autosave of it yet) counts too. */
{
    const r = rig();
    r.api.refresh();
    r.world.loaded = "";
    r.api.save();
    ok(r.writes.length === 1 && r.writes[0] === "{}\n", "seen by a refresh, then emptied, was not saved empty: " + JSON.stringify(r.writes));
}

/* The guard's own case: a boot load that failed — never seen loaded. */
{
    const r = rig();
    r.world.loaded = "";
    r.api.save();
    ok(r.writes.length === 0, "a slot never seen loaded overwrote its saved chain (the boot-glitch guard is gone): " + JSON.stringify(r.writes));
}

/* A set change: what answered inside the quiet window is the OUTGOING set's,
 * so it does not count — the new set's empty slot is preserved. */
{
    const r = rig();
    r.api.save();
    r.api.setChanged();
    r.api.refresh();                       /* still inside the quiet window */
    r.world.loaded = "";
    r.api.quietOver();
    r.api.save();
    ok(r.writes.length === 1, "a set change kept 'seen loaded' from the outgoing set: " + JSON.stringify(r.writes));
}

/* The host picker's path still works. */
{
    const r = rig();
    r.world.loaded = "";
    r.api.userCleared();
    r.api.save();
    ok(r.writes.length === 1 && r.writes[0] === "{}\n", "the host picker's clear no longer saves: " + JSON.stringify(r.writes));
}

if (fails.length) { for (const f of fails) console.error("FAIL: " + f); process.exit(1); }
console.log("PASS: a slot a module UI empties is saved empty; a boot-failed slot is still preserved");
NODE
