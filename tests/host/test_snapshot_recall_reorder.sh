#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A snapshot taken BEFORE insert FX were reordered puts the old order back.
#
# Insert FX move by permutation (`fx:move`, no reload). A recall matches
# modules by POSITION, so without this a moved chain came back with every
# module skipped as "swapped" and nothing restored. The recall now moves the
# chain back into the saved order first, then restores state.
#
# This runs the REAL recall source (hostSnapshotRecall and the functions it
# drives, extracted from shadow_ui.js) against a simulated host whose chains
# genuinely permute on `fx:move` and refuse like the shim. It asserts on what
# the ENGINE ends up holding and which state blob landed in which module —
# never on the plan alone.
#
# Also pinned: the Master FX live ids come from the SHIM. Its JS mirror goes
# stale when anything moves a master insert through the shim directly, and a
# stale id that still matches the snapshot writes one module's state blob into
# another. The stale-mirror case below fails on the mirror read.

node --input-type=module - <<'NODE'
import fs from "fs";
import { parseSlotSnapshot, parseBusSnapshot, planRestore, planReorders, batchWrites,
         bulkEncodeItems, bulkDecode } from "./src/shared/snapshot.mjs";

const src = fs.readFileSync("src/shadow/shadow_ui.js", "utf8");
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log("  ok   — " + msg); else { console.log("  FAIL — " + msg); fails++; } };

function extractFn(name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0 || src.indexOf(`function ${name}(`, start + 1) >= 0) throw new Error(`${name}: not found exactly once`);
    let depth = 0, i = src.indexOf("{", start);
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`${name}: unbalanced`);
}
const REAL = ["hostSnapshotRecall", "snapshotRecallTick", "hostSnapshotStatus", "snapshotRecords",
              "snapshotLiveIds", "masterFxShimValue", "moveBusFileNames", "moveBusPrefixes"];

/* ---- the simulated host ---- */
function makeWorld(o) {
    const w = { slots: {}, master: o.master || ["", "", "", ""], mirror: o.mirror || null,
                files: {}, log: [], writes: [], refuse: o.refuse || 0 };
    for (const [i, fx] of Object.entries(o.slots || {})) w.slots[i] = fx.slice();
    const put = (name, obj) => { w.files["/snap" + name] = JSON.stringify(obj); };
    for (const [i, fx] of Object.entries(o.savedSlots || {}))
        put("/slot_" + i + ".json", { chain: { synth: { module: "syn", config: { state: "syn" } },
            audio_fx: fx.map((id) => ({ type: id, params: { state: "state-of-" + id } })) } });
    (o.savedMaster || []).forEach((id, k) => put("/master_fx_" + k + ".json",
        id ? { module_id: id, state: "state-of-" + id } : {}));
    return w;
}
function permute(arr, v) {
    const m = /^(\d)>(\d)$/.exec(String(v));
    if (!m) return false;
    const from = +m[1], to = +m[2];
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (let k = lo; k <= hi; k++) if (!arr[k - 1]) return false;      /* never across a hole */
    const [id] = arr.splice(from - 1, 1);
    arr.splice(to - 1, 0, id);
    return true;
}
function run(w, undoDir) {
    const g = {
        SHADOW_UI_SLOTS: 8, SEND_FX_BUSES: ["a", "b"], SEND_FX_SLOTS_JS: 4,
        MOVE_FX_SLOTS_JS: 4, MOVE_FX_BLOCKS_JS: 4, SNAPSHOT_BULK_BYTES: 60000,
        snapshotRecallJob: null, snapshotLastResult: null, needsRedraw: false,
        parseSlotSnapshot, parseBusSnapshot, planRestore, planReorders, batchWrites, bulkEncodeItems,
        debugLog: () => {}, invalidateKnobValueCache: () => {}, paramPagesRefreshTrailing: () => {},
        snapshotScopeForWrites: () => null,
        hostSnapshotTake: () => { w.log.push("before-take"); return JSON.stringify({ ok: true }); },
        host_read_file: (p) => w.files[p] || null,
        createEmptyChainConfig: () => ({}),
        chainConfigs: [],
        refreshSlotModuleSignature: (i) => { g.chainConfigs[i] = cfgOf(i); },
        getSlotParam: () => "",
        masterFxConfig: {},
        shadow_get_param: (slot, k) => {
            const m = /^master_fx:fx(\d):name$/.exec(k);
            if (m) return w.master[+m[1] - 1] || "";
            return "";
        },
        shadow_set_param: (slot, k, v) => {
            if (k === "fx:move" || k === "master_fx:fx:move") {
                w.log.push(slot + " " + k + "=" + v);
                if (w.refuse > 0) { w.refuse--; return 0; }
                return permute(k === "fx:move" ? w.slots[slot] : w.master, v) ? 1 : 0;
            }
            return 1;
        },
        shadow_set_params: (slot, pfx, blob) => {
            const it = bulkDecode(blob);
            for (let i = 0; i + 1 < it.length; i += 2) w.writes.push(slot + " " + it[i] + "=" + it[i + 1]);
            return true;
        },
    };
    function cfgOf(i) {
        const fx = w.slots[i] || [];
        const c = { synth: { module: "syn" } };
        for (let k = 1; k <= 4; k++) c["fx" + k] = { module: fx[k - 1] || "" };
        return c;
    }
    for (const i of Object.keys(w.slots)) g.chainConfigs[i] = cfgOf(i);
    const m = w.mirror || w.master;                               /* the JS mirror, possibly stale */
    for (let k = 1; k <= 4; k++) g.masterFxConfig["fx" + k] = { module: m[k - 1] || "" };
    /* Each global becomes a parameter: a binding the real source reads and
     * assigns by name (snapshotRecallJob, snapshotLastResult, needsRedraw). */
    const names = Object.keys(g);
    const recall = new Function(...names, REAL.map(extractFn).join("\n") + "\nreturn hostSnapshotRecall;")
        (...names.map((n) => g[n]));
    return JSON.parse(recall("/snap", -1, undoDir || "", 0));
}
const has = (w, s) => w.writes.includes(s);

/* 1. A track chain moved since the take: the old order comes back, each state to its module. */
{
    const w = makeWorld({ slots: { 3: ["c", "a", "b", ""] }, savedSlots: { 3: ["a", "b", "c"] } });
    const r = run(w);
    ok(JSON.stringify(w.slots[3]) === JSON.stringify(["a", "b", "c", ""]),
       "a reordered chain is put back in the saved order (engine now " + JSON.stringify(w.slots[3]) + ")");
    ok(has(w, "3 fx1:state=state-of-a") && has(w, "3 fx2:state=state-of-b") && has(w, "3 fx3:state=state-of-c"),
       "...and each module gets ITS OWN state: " + JSON.stringify(w.writes.filter((x) => /fx\d:state/.test(x))));
    ok(r.skipped === 0, "nothing skipped (was: all three skipped as swapped) — skipped " + r.skipped);
    ok(JSON.stringify(r.moved) === JSON.stringify([{ scope: "3:", from: 2, to: 1 }, { scope: "3:", from: 3, to: 2 }]),
       "the moves are reported back so the caller's references follow: " + JSON.stringify(r.moved));
}

/* 2. CONTROL: a module SWAPPED since the take is not a reorder — nothing moves, the old skip stands. */
{
    const w = makeWorld({ slots: { 3: ["a", "d", "c", ""] }, savedSlots: { 3: ["a", "b", "c"] } });
    const r = run(w);
    ok(!w.log.some((x) => /fx:move/.test(x)), "a swapped module issues no move: " + JSON.stringify(w.log));
    ok(!has(w, "3 fx2:state=state-of-b"), "...and the swapped position is not written");
    ok(r.skipped === 1 && JSON.stringify(r.moved) === "[]", "...counted as one skip (" + r.skipped + "), no moves");
}

/* 3. A REFUSED move (a render still in flight) re-plans against what is really there. */
{
    const w = makeWorld({ slots: { 3: ["c", "a", "b", ""] }, savedSlots: { 3: ["a", "b", "c"] }, refuse: 1 });
    const r = run(w);
    ok(JSON.stringify(w.slots[3]) === JSON.stringify(["c", "a", "b", ""]), "the refused chain keeps its order");
    ok(!w.writes.some((x) => /fx\d:state=/.test(x)),
       "⚠ no state blob lands in the wrong module after a refusal: " + JSON.stringify(w.writes));
    ok(r.skipped === 3 && JSON.stringify(r.moved) === "[]", "...all three skipped, nothing reported moved");
}

/* 4. The Undo before-image is taken BEFORE the moves, so Undo brings the old order back. */
{
    const w = makeWorld({ slots: { 3: ["b", "a", "", ""] }, savedSlots: { 3: ["a", "b"] } });
    run(w, "/undo");
    const t = w.log.indexOf("before-take"), mv = w.log.findIndex((x) => /fx:move/.test(x));
    ok(t >= 0 && mv > t, "before-take precedes the first move: " + JSON.stringify(w.log));
}

/* 5. MASTER FX, with the JS mirror STALE (moved through the shim): read from the shim. */
{
    const w = makeWorld({ master: ["y", "x", "", ""], mirror: ["x", "y", "", ""], savedMaster: ["x", "y", "", ""] });
    const r = run(w);
    ok(JSON.stringify(w.master) === JSON.stringify(["x", "y", "", ""]),
       "the master chain is put back (engine now " + JSON.stringify(w.master) + ")");
    ok(has(w, "0 master_fx:fx1:state=state-of-x") && has(w, "0 master_fx:fx2:state=state-of-y"),
       "⚠ each master module gets its own state — never x's blob into y: " +
       JSON.stringify(w.writes.filter((x) => /state=/.test(x))));
    ok(JSON.stringify(r.moved) === JSON.stringify([{ scope: "master_fx:", from: 2, to: 1 }]), "master move reported");
}

/* 6. Already in order: nothing moves (the common case costs nothing). */
{
    const w = makeWorld({ slots: { 3: ["a", "b", "", ""] }, savedSlots: { 3: ["a", "b"] } });
    const r = run(w);
    ok(!w.log.some((x) => /fx:move/.test(x)) && JSON.stringify(r.moved) === "[]", "an unchanged chain issues no moves");
    ok(has(w, "3 fx1:state=state-of-a") && has(w, "3 fx2:state=state-of-b"), "...and restores as before");
}

if (fails) { console.log(`FAIL: ${fails} snapshot recall reorder check(s)`); process.exit(1); }
console.log("PASS: a recall puts moved insert FX back in the saved order, each state into its own module");
NODE
