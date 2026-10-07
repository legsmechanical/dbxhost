#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# A TRIGGER KNOB: ONE FIRE PER GESTURE, AND A HELD KNOB IS ONE GESTURE
# (port of upstream #620, the knob half; the blocks are from its
# tests/host/test_param_access.sh).
#
# A trigger (access: "write") fires on the first detent of a turn and then
# latches until the knob has been still for a gap. The gap is only the backstop
# for a touch the cap sensor never saw. Applied to a knob that IS held, a slow
# turn with a pause in it fired again — and for a toggle (a player's
# Play/Pause) that is pause-then-resume from one hand.
#
# NO APOSTROPHES inside the node script: it is a single-quoted bash string.

command -v node >/dev/null 2>&1 || { echo "FAIL: node is required" >&2; exit 1; }

node --input-type=module -e '
const C = await import(process.cwd() + "/src/shared/param_pages/page_controller.mjs");
let fails = 0;
const fail = (m) => { console.error("FAIL: " + m); fails++; };

const writes = [];
const HIER = JSON.stringify({ modes: null, levels: { root: { label: "S",
    knobs: ["rnd_preset", "detected_key"],
    params: [{ key: "rnd_preset" }, { key: "detected_key" }] } } });
const CP = JSON.stringify([
  { key: "rnd_preset",   name: "Randomise", type: "enum", options: ["—", "Rnd!"], access: "write" },
  { key: "detected_key", name: "Key",       type: "enum", options: ["C", "C#"],   access: "read"  },
]);
const ctl = C.createController({
  getParam: (k) => {
    const b = String(k).replace(/^[^:]+:/, "");
    if (b === "ui_hierarchy") return HIER;
    if (b === "chain_params") return CP;
    if (b === "rnd_preset") return "—";
    if (b === "detected_key") return "C#";
    return "0";
  },
  setParam: (k, v) => writes.push([k, v]),
  announce: () => {},
});
ctl.load({ slot: 0, component: "synth" });
for (let i = 0; i < 6; i++) ctl.tick();
const trigSlot = (ctl.page.keys || []).indexOf("rnd_preset");
if (trigSlot < 0) { fail("fixture did not put the trigger on the grid"); process.exit(1); }

/* control: untouched, the latch and its gap behave as before */
ctl.onKnobTurn(trigSlot, 1, 5000);
if (writes.length !== 1) fail("turning a trigger wrote " + writes.length + " times, expected 1");
writes.length = 0;
for (let t = 5030; t <= 7000; t += 30) ctl.onKnobTurn(trigSlot, 1, t);
if (writes.length) fail("a 2-second spin fired the trigger " + writes.length + " extra times");
ctl.onKnobTurn(trigSlot, 1, 8100);
if (writes.length !== 1) fail("control: untouched, a second flick a second later did not fire");

/* A TOUCH starts a gesture: 8150 is inside the gap left by 8100, so the first
 * detent of this touch can only fire because touch-down re-armed it. */
writes.length = 0;
ctl.onKnobTouch(trigSlot, true);
ctl.onKnobTurn(trigSlot, 1, 8150);
if (writes.length !== 1) fail("the first detent of a new touch was swallowed by a stale latch");

/* HELD, detents a full second apart: only the first fired. */
writes.length = 0;
ctl.onKnobTurn(trigSlot, 1, 9150);
ctl.onKnobTurn(trigSlot, 1, 10150);
if (writes.length)
  fail("a slow turn of a HELD knob re-fired the trigger " + writes.length +
       " times -- a toggle flips straight back");

/* Let go and grab again: a new gesture, at once. */
ctl.onKnobTouch(trigSlot, false);
ctl.onKnobTouch(trigSlot, true);
ctl.onKnobTurn(trigSlot, 1, 10200);
if (writes.length !== 1) fail("let go and grab again did not fire");
ctl.onKnobTouch(trigSlot, false);

if (fails) process.exit(1);
console.log("PASS: a held trigger knob fires once; a new touch fires at once");
'
