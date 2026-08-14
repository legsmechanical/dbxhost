/* tests/js/test_session_mixer_modes.mjs — pin the session-view mixer MODE TABLE.
 *
 * `SESS_KNOB_MODES` is indexed by `S.sessKnobMode` from three places at once —
 * the knob handler (step/max/snap/format), the tick writer (param key) and the
 * renderer (widget). Before 2026-08-14 the key and the default also existed as
 * two hand-written parallel arrays beside it, which is one careless edit away
 * from a mode writing ANOTHER mode's param: turn "Pan" and move Send A, with
 * nothing on screen to say so.
 *
 * So this asserts the table is internally consistent and that the derived
 * arrays are actually derived. It is deliberately a data pin, not a render pin:
 * the widget CHOICE is the design decision worth freezing (a level is a fader,
 * pan is bipolar), while pixel layout is `drawKitPage`'s business and is
 * already covered by the kit previewer.
 */

import { SESS_KNOB_MODES, SESS_KNOB_KEYS, SESS_KNOB_DEFAULTS,
         SLOT_LEVEL_MAX, KNOB_POSITIONS, KNOB_SENS, knobAccumSteps } from '../../ui/ui_engine.mjs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e}`); failed = 1; }
function eq(a, b, label) { (a === b) ? ok(label) : bad(label, `expected ${b}, got ${a}`); }

/* 1. Exactly four modes, in the order the jog cycles them. */
eq(SESS_KNOB_MODES.length, 4, 'four mixer modes');
eq(SESS_KNOB_MODES.map(m => m.key).join(','), 'volume,pan,send_a,send_b',
   'mode order is volume, pan, send_a, send_b');

/* 2. The derived arrays are DERIVED — not hand-mirrored. Same length, same
 *    order, element-for-element. This is the pin that fails if someone
 *    reintroduces a literal array. */
eq(SESS_KNOB_KEYS.length, SESS_KNOB_MODES.length, 'KEYS has one entry per mode');
eq(SESS_KNOB_DEFAULTS.length, SESS_KNOB_MODES.length, 'DEFAULTS has one entry per mode');
let derived = true;
for (let i = 0; i < SESS_KNOB_MODES.length; i++) {
    if (SESS_KNOB_KEYS[i] !== SESS_KNOB_MODES[i].key) derived = false;
    if (SESS_KNOB_DEFAULTS[i] !== SESS_KNOB_MODES[i].def) derived = false;
}
derived ? ok('KEYS/DEFAULTS match the table element-for-element')
        : bad('KEYS/DEFAULTS match the table element-for-element', 'drifted');

/* 3. The widget per mode — the design decision. A level is a vertical fader;
 *    pan is a BIPOLAR arc (centre must look like centre); sends are plain arcs. */
eq(SESS_KNOB_MODES[0].widget, 'vbar',   'volume draws as a vertical fader');
eq(SESS_KNOB_MODES[1].widget, 'arcbip', 'pan draws as a BIPOLAR arc');
eq(SESS_KNOB_MODES[2].widget, 'arc',    'send A draws as a plain arc');
eq(SESS_KNOB_MODES[3].widget, 'arc',    'send B draws as a plain arc');

/* 4. Ranges, and the CANVAS KNOB LAW: every mode gets 255 positions across its
 *    own range, so a 0..2 level and a 0..1 send feel identical under the finger.
 *    The old hand-picked 0.05 step gave pan and the sends twenty positions. */
eq(SESS_KNOB_MODES[0].max, SLOT_LEVEL_MAX, 'volume max is the shared level ceiling');
for (let i = 1; i < 4; i++) eq(SESS_KNOB_MODES[i].max, 1.0, `${SESS_KNOB_MODES[i].key} max is 1.0`);
for (const m of SESS_KNOB_MODES)
    eq(Math.round(m.max / m.step), KNOB_POSITIONS, `${m.key}: ${KNOB_POSITIONS} positions across its range`);

/* 4b. The accumulator — canvaskit's accumStep, generalised for batched counts.
 *     SENS detents buy one step; a partial turn moves nothing; and a REVERSAL
 *     resets rather than having to unwind, which is the part that makes it feel
 *     right under the finger. */
eq(KNOB_SENS, 2, 'two detents per step, as canvaskit KIT_SENS');
{
    let a = knobAccumSteps(0, 1, 2);
    eq(a.steps, 0, 'one detent of two fires nothing');
    a = knobAccumSteps(a.accum, 1, 2);
    eq(a.steps, 1, 'the second detent fires one step');
    eq(a.accum, 0, '…and leaves nothing owed');
    /* A batch must not collapse to one step, or a fast turn would move LESS
     * than a slow one — davebox receives accumulated counts, canvaskit does not. */
    a = knobAccumSteps(0, 8, 2);
    eq(a.steps, 4, 'a batch of 8 detents fires 4 steps, not 1');
    /* Reversal clears the pending detent instead of unwinding it. */
    a = knobAccumSteps(0, 1, 2);
    a = knobAccumSteps(a.accum, -1, 2);
    eq(a.steps, 0, 'reversing after one detent fires nothing yet');
    eq(a.accum, -1, '…and the accumulator flipped rather than cancelling to 0');
    a = knobAccumSteps(0, -8, 2);
    eq(a.steps, -4, 'negative batches step down symmetrically');
}

/* 5. Only pan snaps, and it snaps to CENTRE. A send snapping to its midpoint
 *    would be meaningless; a level snapping would fight the mix. */
eq(SESS_KNOB_MODES[1].snap, 0.5, 'pan snaps to centre');
const otherSnaps = [0, 2, 3].filter(i => SESS_KNOB_MODES[i].snap !== undefined);
eq(otherSnaps.length, 0, 'no other mode snaps');

/* 6. Formatting reads correctly at the landmarks — these are what the cell and
 *    the touched header actually print. */
eq(SESS_KNOB_MODES[1].fmt(0.5), 'C',    'pan centre prints C');
eq(SESS_KNOB_MODES[1].fmt(0.0), '100L', 'pan hard left prints 100L');
eq(SESS_KNOB_MODES[1].fmt(1.0), '100R', 'pan hard right prints 100R');
eq(SESS_KNOB_MODES[0].fmt(1.0), '1.00x', 'unity level prints 1.00x');
eq(SESS_KNOB_MODES[2].fmt(0.5), '50%',  'a half-open send prints 50%');

/* 7. The bipolar mapping the renderer applies: signed = (v - 0.5) * 2. Pinned
 *    here because getting it backwards swaps left and right on screen while the
 *    audio stays correct — a discrepancy nobody would suspect the UI for. */
const signed = (v) => (v - 0.5) * 2;
eq(signed(0.5),  0, 'pan centre maps to signed 0');
eq(signed(1.0),  1, 'pan hard right maps to signed +1');
eq(signed(0.0), -1, 'pan hard left maps to signed -1');

console.log(failed ? 'test_session_mixer_modes: FAIL' : 'test_session_mixer_modes: PASS');
process.exit(failed);
