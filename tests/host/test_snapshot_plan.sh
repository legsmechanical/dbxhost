#!/usr/bin/env bash
# Snapshot recall planner: what a recall writes, what it counts as skipped,
# and how the writes pack into bulk SETs.
#
# The counts are the assertion that matters. A recall that silently restores
# half the rig is indistinguishable from one that worked, so every branch that
# declines to write must show up in `skipped` and be attributable in `reasons`.
# (Ported from upstream #385's test; the bus parse and the batching are ours.)
set -euo pipefail
cd "$(dirname "$0")/../.."

node --input-type=module -e '
import { parseSlotSnapshot, parseBusSnapshot, parseMasterFxSnapshot, planRestore,
         batchWrites, bulkEncodeItems, recallMessage }
    from "./src/shared/snapshot.mjs";

let fails = 0;
function eq(what, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) { console.error(`FAIL ${what}\n  got  ${g}\n  want ${w}`); fails++; }
    else console.log(`  ok   ${what}`);
}

/* ---- parsing ---------------------------------------------------------- */
const slotJson = JSON.stringify({
    name: "Lead", version: 1, modified: false,
    chain: {
        synth: { module: "braids", config: { state: { pitch: 3 } }, bypassed: 0 },
        midi_fx: [ { type: "arp", params: { state: "rate=4" }, bypassed: 1 } ],
        audio_fx: [
            { type: "cloudseed", params: { state: { mix: 0.4 } }, bypassed: 0 },
            { type: "denis",     params: {},                     bypassed: 0 },
            { type: "verglas",   params: { state: { d: 1 } },    bypassed: 0 },
            { type: "ottx",      params: { state: { d: 2 } },    bypassed: 1 }
        ]
    }
});
const recs = parseSlotSnapshot(slotJson);
eq("slot prefixes (the fork has four audio FX)", recs.map(r => r.prefix),
   ["synth", "midi_fx1", "fx1", "fx2", "fx3", "fx4"]);
eq("object state is re-serialised", recs[0].state, JSON.stringify({ pitch: 3 }));
eq("string state passes through", recs[1].state, "rate=4");
eq("bypass carried", recs[1].bypassed, 1);
eq("no state key reads as null", recs[3].state, null);
eq("malformed slot file yields nothing", parseSlotSnapshot("{not json"), []);
eq("empty slot marker yields nothing", parseSlotSnapshot("{}"), []);

const mfx = parseMasterFxSnapshot(JSON.stringify({ id: "mverb", path: "/x.so", state: { size: 9 } }), 2);
eq("master fx prefix is 1-based", mfx.map(r => r.prefix), ["master_fx:fx3"]);
eq("master fx state", mfx[0].state, JSON.stringify({ size: 9 }));
eq("empty master position yields nothing", parseMasterFxSnapshot("{}", 0), []);
const sfx = parseBusSnapshot(JSON.stringify({ id: "ottx", module_id: "ottx", state: "a=1", bypassed: "1" }), "send_fx:b:fx2");
eq("a send position parses with its full prefix", sfx.map(r => [r.prefix, r.moduleId, r.state, r.bypassed]), [["send_fx:b:fx2", "ottx", "a=1", 1]]);
eq("a Move bus position parses the same way", parseBusSnapshot(JSON.stringify({ id: "filter" }), "move_fx:2:fx4").map(r => [r.prefix, r.state]), [["move_fx:2:fx4", null]]);

/* ---- planning --------------------------------------------------------- */
const live = {
    synth:    "braids",       /* unchanged     -> write   */
    midi_fx1: "chord",        /* swapped       -> skipped */
    fx1:      "cloudseed",    /* unchanged     -> write   */
    fx2:      "denis",        /* no state      -> skipped */
    fx3:      "verglas",      /* unchanged     -> write   */
    fx4:      "ottx",         /* unchanged     -> write   */
    /* master_fx:fx3 absent    -> removed      -> skipped */
    midi_fx2: "arp",          /* ADDED since   -> bypass-only write, listed */
    "master_fx:fx1": "mverb"  /* ADDED since   -> bypass-only write, listed */
};
const plan = planRestore(recs.concat(mfx), live);
eq("writes the matched positions (a no-state module still gets its BYPASS), then the positions ADDED since the save",
   plan.writes.map(w => w.prefix), ["synth", "fx1", "fx2", "fx3", "fx4", "midi_fx2", "master_fx:fx1"]);
eq("the no-state position writes bypass only, with the SAVED value", plan.writes[2], { prefix: "fx2", state: null, bypassed: 0, slot: undefined, key: undefined });
eq("an added position is written bypassed with NO state", plan.writes.slice(-2).map(w => [w.state, w.bypassed]), [[null, 1], [null, 1]]);
eq("added positions are listed with what they hold", plan.added, [{ prefix: "midi_fx2", now: "arp" }, { prefix: "master_fx:fx1", now: "mverb" }]);
eq("a SYNTH that appeared since is not bypassed (the track owns that)",
   planRestore([], { "3:synth": "braids", "3:fx2": "ottx" }).writes.map(w => [w.prefix, w.slot, w.key]), [["3:fx2", 3, "fx2"]]);
eq("a bus prefix splits to slot 0 and itself", planRestore([], { "send_fx:b:fx2": "ottx" }).writes.map(w => [w.slot, w.key]), [[0, "send_fx:b:fx2"]]);
eq("skipped counts every position that did not come back", plan.skipped, 3);
eq("reasons are attributable",
   plan.reasons.map(r => [r.prefix, r.reason]),
   [["midi_fx1","swapped"], ["fx2","nostate"], ["master_fx:fx3","empty"]]);
eq("empty-in-snapshot is not counted",
   planRestore([{ prefix: "fx3", moduleId: "", state: null, bypassed: 0 }], {}).skipped, 0);

/* ---- packing into bulk SETs ------------------------------------------- */
const ws = [
    { prefix: "2:synth", slot: 2, key: "synth", state: "S", bypassed: 0 },
    { prefix: "2:fx1",   slot: 2, key: "fx1",   state: "F", bypassed: 1 },
    { prefix: "5:synth", slot: 5, key: "synth", state: "T", bypassed: 0 },
    { prefix: "master_fx:fx1", slot: 0, key: "master_fx:fx1", state: "M", bypassed: 0 },
];
const b = batchWrites(ws, 60000);
eq("one batch per slot, in write order", b.map(x => [x.slot, x.positions]),
   [[2, ["2:synth", "2:fx1"]], [5, ["5:synth"]], [0, ["master_fx:fx1"]]]);
eq("a batch carries state AND bypass per position, as key/value pairs",
   b[0].items, ["synth:state", "S", "synth:bypassed", "0", "fx1:state", "F", "fx1:bypassed", "1"]);
eq("a bypass-only write (added since the save) carries NO state item",
   batchWrites([{ prefix: "2:fx3", slot: 2, key: "fx3", state: null, bypassed: 1 }], 60000)[0].items, ["fx3:bypassed", "1"]);
const big = "x".repeat(50000);
const b2 = batchWrites([{ prefix: "1:synth", slot: 1, key: "synth", state: big, bypassed: 0 },
                        { prefix: "1:fx1",   slot: 1, key: "fx1",   state: big, bypassed: 0 }], 60000);
eq("two blobs that do not fit one request split into two batches, same slot", b2.map(x => x.positions), [["1:synth"], ["1:fx1"]]);
eq("a blob that does not fit alone still goes, alone",
   batchWrites([{ prefix: "1:synth", slot: 1, key: "synth", state: "y".repeat(70000), bypassed: 0 }], 60000).length, 1);

/* ---- the wire form: lengths are BYTES ---------------------------------- */
eq("bulk encode is count then len/bytes records, no separator after the bytes", bulkEncodeItems(["ab", "c"]), "2\n2\nab1\nc");
eq("a non-ASCII value is measured in UTF-8 bytes", bulkEncodeItems(["é"]), "1\n2\né");

eq("clean recall message", recallMessage(0), ["restored"]);
eq("lossy recall message", recallMessage(3), ["restored", "3 skipped"]);
eq("recall message names what was bypassed and muted", recallMessage(0, 2, 1), ["restored", "2 new fx bypassed", "1 track muted"]);

if (fails) { console.error(`\n${fails} assertion(s) failed`); process.exit(1); }
console.log("PASS: test_snapshot_plan");
'
