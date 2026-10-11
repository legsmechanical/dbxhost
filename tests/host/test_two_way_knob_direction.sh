#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A control with exactly TWO values has a DIRECTION: right is the second value
# (On, option 1), left is the first (Off, option 0). "one way on one way off".
#
#   - it never wraps: at On, turning right again does nothing, however far;
#   - it takes the same four detents as a longer enum ("4 dent"), so a brushed
#     knob does not switch it; a reversal drops the banked turn, so coming back
#     costs four too; no flick latch;
#   - the result of a turn depends on the DIRECTION only, never on where the
#     value started or how many detents the flick happened to carry.
#
# History: from 2026-09 it TOGGLED on any detent behind a per-flick latch.
# This file pinned that; it now pins the direction.

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required" >&2; exit 1
fi

node -e '
Promise.all([
  import("./src/shared/knob_engine.mjs"),
]).then(([K]) => {
  let failures = 0;
  const fail = (m) => { console.error("FAIL: " + m); failures++; };

  const OFF_ON  = { type: "enum", options: ["Off", "On"] };
  const CHOICE  = { type: "enum", options: ["Mix", "Reverb"] };
  const INTBOOL = { type: "int", min: 0, max: 1 };
  const THREE   = { type: "enum", options: ["A", "B", "C"] };
  const TRIGGER = { type: "enum", options: ["—", "Rnd!"], access: "write" };

  /* One detent, from a cold state, at t. */
  const tap = (meta, from, dir, t) => {
    const st = K.knobInit(from);
    K.knobStep(st, meta, dir, t);
    return st.value;
  };

  const GATE = K.ENUM_DELTA_DIV;
  if (!(GATE >= 2)) fail("ENUM_DELTA_DIV is not exported or is under 2: " + GATE);
  /* n detents one way, 30 ms apart, on an existing state */
  const turn = (st, meta, dir, n) => { for (let i = 0; i < n; i++) K.knobStep(st, meta, dir, 1000 + i * 30); };

  /* ---- 1. direction decides, from either value, after the gate --------- */
  for (const [name, meta] of [["Off/On", OFF_ON], ["Mix/Reverb", CHOICE], ["int 0..1", INTBOOL]]) {
    for (const from of [0, 1]) {
      for (const dir of [1, -1]) {
        const want = dir > 0 ? 1 : 0;
        const st = K.knobInit(from);
        turn(st, meta, dir, GATE - 1);
        if (st.value !== from)
          fail(name + " at " + from + ": " + (GATE - 1) + " detents already moved it to " + st.value +
               " — it takes " + GATE + ", like a longer enum, so a brushed knob does not switch it");
        turn(st, meta, dir, 1);
        if (st.value !== want)
          fail(name + " at " + from + " turned " + GATE + " detents " + (dir > 0 ? "right" : "left") +
               " gave " + st.value + ", expected " + want + " — right is the second value and " +
               "left the first, whatever it was before");
      }
    }
  }

  /* ---- 2. it never wraps: a long spin one way ends on that way-s value -- */
  for (const [name, meta] of [["Off/On", OFF_ON], ["Mix/Reverb", CHOICE], ["int 0..1", INTBOOL]]) {
    for (const dir of [1, -1]) {
      const want = dir > 0 ? 1 : 0;
      for (const from of [0, 1]) {
        /* one gate, two gates, and a ragged count: a toggle lands differently */
        for (const n of [GATE, 2 * GATE, 2 * GATE + 1, 7 * GATE + 3]) {
          const st = K.knobInit(from);
          turn(st, meta, dir, n);
          if (st.value !== want)
            fail(name + " from " + from + ": " + n + " detents " + (dir > 0 ? "right" : "left") +
                 " left it at " + st.value + " — it wrapped or toggled");
        }
      }
    }
  }

  /* ---- 3. coming back costs the gate, not the gate plus what was banked - */
  {
    const st = K.knobInit(0);
    turn(st, CHOICE, 1, GATE + GATE - 1);            /* on, with a partial turn banked */
    if (st.value !== 1) fail("setup: the right turn did not select the second value");
    turn(st, CHOICE, -1, GATE - 1);
    if (st.value !== 1) fail("turning back switched it before " + GATE + " detents");
    turn(st, CHOICE, -1, 1);
    if (st.value !== 0)
      fail("turning back " + GATE + " detents left it at " + st.value + " — a reversal must drop " +
           "the banked turn, or coming back costs up to " + (2 * GATE - 1));
  }

  /* ---- 3b. fine (Shift) is one detent ----------------------------------- */
  {
    const st = K.knobInit(0);
    K.knobStep(st, OFF_ON, 1, 1000, true);
    if (st.value !== 1) fail("a fine detent right did not select the second value");
    K.knobStep(st, OFF_ON, -1, 1030, true);
    if (st.value !== 0) fail("a fine detent left did not select the first value");
  }

  /* ---- 4. what is NOT a two-way ----------------------------------------- */
  {
    /* Three options keep the sweep: a long list wants a gate, not a toggle. */
    const st = K.knobInit(0);
    K.knobStep(st, THREE, 1, 1000);
    if (st.value === 1)
      fail("a three-option enum flipped on ONE detent — it should still be gated, and it " +
           "should never toggle");
    for (let t = 1030; t <= 1200; t += 30) K.knobStep(st, THREE, 1, t);
    if (st.value !== 1) fail("a three-option enum did not advance across a gated sweep");
    /* ...and it CLAMPS at the top rather than wrapping round to A. Wrapping a
     * 47-model list would make the end of it unreachable by feel. */
    for (let t = 1230; t <= 3000; t += 30) K.knobStep(st, THREE, 1, t);
    if (st.value !== 2) fail("a three-option enum did not clamp at its last option");

    /* A TRIGGER is a two-option enum on the wire, and its idle spelling is
     * option 0: one stray detent left must not write it (for euclidrum that
     * is the write that destroys a kit). page_controller routes triggers away
     * before the engine; this is the engine on its own. */
    const tv = tap(TRIGGER, 1, -1, 1000);
    if (tv === 0)
      fail("one detent left turned a trigger back to its IDLE spelling");
  }

  if (failures) process.exit(1);
  console.log("PASS: a two-value control is directional — right the second value, left the " +
              "first, behind the enum gate, never wrapping — and neither a longer enum nor a trigger is touched");
}).catch((e) => { console.error("FAIL: " + (e && e.stack || e)); process.exit(1); });
'
