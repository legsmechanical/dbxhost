#!/usr/bin/env bash
# A burst of writes to a gate driver buys ONE plan, not one plan per write.
#
# 🔴 THE MEASUREMENT THIS EXISTS FOR (dAVEBOx read meter, on hardware, dr32's
# send-effect picker):
#
#     worst=2916 calls/2930 keys
#     top=synth:send1_mode x1120  synth:send2_mode x1120  synth:send2_sync x448
#
# 2912 of those are gate reads, and dr32 evaluates 26 conditions per planning
# pass. 2912 / 26 = **112 FULL PLANNING PASSES IN A SINGLE TICK** — each one a
# level walk, a grouping, a row alignment and a fingerprint, on a device whose
# whole tick is 10.6 ms. The picker did not feel slow; it hung.
#
# ⚠⚠ AND THE FIRST DIAGNOSIS OF THIS WAS WRONG, which is why the test asserts the
# PASS COUNT and not a read count. I read the histogram as "112 evaluations each
# re-asking a key ten times" and said so out loud. `evaluateVisibility` makes
# EXACTLY ONE read per condition (visibility.mjs) and dr32 declares 36
# conditions in total, not 1120 — so the multiplier was never in the evaluator,
# it was in how often the whole planner ran. A read cache makes each pass cheap
# and leaves 112 passes; only coalescing removes them.
#
# THE OBSERVABLE: the `visible` hook fires once per condition per pass, so
# counting its calls counts passes. That is the same quantity the device meter
# saw, which is the point — a proxy nobody can check against hardware is how the
# "150-270 reads/frame" figure got into the worklog without ever being counted.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { createController, LAYOUT_MOVY } from "./src/shared/param_pages/page_controller.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok  " : "FAIL ") + " — " + m); if (!c) fail++; };

/* dr32-shaped: a mode param gating a set of cells on the same level. */
const PARAMS = [
  { key: "send1_mode", name: "Mode", type: "enum", options: ["delay", "reverb"] },
  { key: "send1_time", name: "Time", type: "float", min: 0, max: 1, step: 0.01 },
  { key: "send1_fb",   name: "FB",   type: "float", min: 0, max: 1, step: 0.01 },
];
const HIER = { modes: null, levels: { root: {
  label: "Send 1",
  knobs: ["send1_mode", "send1_time", "send1_fb"],
  params: [
    { key: "send1_mode" },
    { key: "send1_time", visible_if: { param: "send1_mode", equals: "delay" } },
    { key: "send1_fb",   visible_if: { param: "send1_mode", equals: "delay" } },
  ],
} } };

let evals = 0;
let mode = "delay";
let clock = 1000;
const ctl = createController({
  getParam: (k) => {
    const b = String(k).replace(/^[^:]+:/, "");
    if (b === "ui_hierarchy") return JSON.stringify(HIER);
    if (b === "chain_params") return JSON.stringify(PARAMS);
    if (b === "send1_mode") return mode;
    if (b.indexOf(":") >= 0) return "";
    return "0.5";
  },
  setParam: (k, v) => { if (String(k).endsWith("send1_mode")) mode = String(v); },
  announce: () => {},
  now: () => clock,
});
ctl.setLayout(LAYOUT_MOVY);
/* ⚠ `visible` is a LOAD option, not a constructor one — `replanIfCondition`
 * reads it off `s.lastLoadOpts`. Passed to createController it is silently
 * ignored, the hook never fires, and every count below is 0 === 0. The control
 * above exists because that is exactly what happened. */
ctl.load({
  prefix: "synth",
  /* One call per condition per planning pass — the pass counter. */
  visible: () => { evals += 1; return true; },
});

const perPass = (() => {
  evals = 0; clock += 20; ctl.tick();
  return evals;   /* whatever a settled tick costs; 0 when nothing is owed */
})();

/* The mode knob, driven exactly as the hardware drives it. */
const modeSlot = (() => {
  for (let i = 0; i < 8; i++) if (ctl.keyAt && ctl.keyAt(i) === "send1_mode") return i;
  return 0;
})();

/* ---- CONTROL: the hook is wired and a turn really does re-plan ---------- */
{
  evals = 0;
  clock += 20; ctl.onKnobTurn(modeSlot, 1, clock);
  clock += 20; ctl.tick();
  ok(evals > 0, "control: a turn of the gate knob costs a planning pass (" + evals + " evaluations)");
}
const ONE_PASS = evals;

/* ---- the burst --------------------------------------------------------- */
{
  evals = 0;
  /* An encoder sweep: a burst of detents inside ONE tick. This codebase already
   * has the law written down — a continuous cell emits 255x2 CCs per sweep — so
   * 112 is not a stress figure, it is Tuesday. */
  for (let i = 0; i < 112; i++) ctl.onKnobTurn(modeSlot, i % 2 ? 1 : -1, clock);
  const duringBurst = evals;
  ok(duringBurst === 0,
     "⭐ 112 writes inside one tick plan NOTHING while the burst is arriving (" + duringBurst + ")");

  clock += 20; ctl.tick();
  ok(evals === ONE_PASS,
     "⭐⭐ the whole burst costs ONE pass, not 112 (" + evals + " evaluations, one pass = " + ONE_PASS + ")");
  ok(evals * 112 !== 0 && evals < ONE_PASS * 2,
     "...and certainly not 112x — that was " + (ONE_PASS * 112) + " evaluations before this change");
}

/* ---- it must still actually happen, and before anything is drawn -------- */
{
  clock += 20; ctl.tick();
  evals = 0;
  clock += 20; ctl.onKnobTurn(modeSlot, 1, clock);
  ok(evals === 0, "a pending plan is not run by the write itself");
  clock += 20; ctl.tick();
  ok(evals === ONE_PASS, "⭐ and the tick DOES run it — a deferred plan that never happens is worse");
}

/* ---- a turn of a NON-gate knob buys nothing ---------------------------- */
{
  const timeSlot = (() => {
    for (let i = 0; i < 8; i++) if (ctl.keyAt && ctl.keyAt(i) === "send1_time") return i;
    return -1;
  })();
  if (timeSlot < 0) {
    ok(false, "control: send1_time is not on a knob — this case would test nothing");
  } else {
    evals = 0;
    for (let i = 0; i < 20; i++) { clock += 20; ctl.onKnobTurn(timeSlot, 1, clock); }
    clock += 20; ctl.tick();
    ok(evals === 0,
       "a turn of a knob no condition names plans nothing (" + evals + ")");
  }
}

/* ---- a settled tick is free ------------------------------------------- */
{
  evals = 0;
  for (let i = 0; i < 5; i++) { clock += 20; ctl.tick(); }
  ok(evals === 0, "five settled ticks plan nothing (" + evals + ")");
}

console.log(fail === 0 ? "PASS: a burst of gate writes costs one plan" : "FAIL (" + fail + ")");
process.exit(fail === 0 ? 0 : 1);
'
