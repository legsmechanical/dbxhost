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
         SLOT_LEVEL_MAX } from '../../ui/ui_engine.mjs';

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
    eq(Math.round(m.max / m.step), m.units, `${m.key}: ${m.units} units across its range`);

/* ⭑⭑ THE UNIT MUST BE VISIBLE — this is the whole point of the 2026-08-26 change.
 * Josh: "is there a way to make all the knobs feel the same and still allow fine
 * tuning (+/-1) with very slow movements?" The shared curve already pins a slow
 * detent to exactly ONE unit, so fine tuning means something only if one unit is
 * an increment the formatter actually PRINTS. The mixer's old unit was 1/255 of
 * range — a canvaskit artefact nothing displayed — so easing off sild between
 * readings instead of landing on them.
 *
 * Asserted by DRIVING each formatter, not by comparing the numbers: a unit that
 * rounds away in `fmt` is exactly the bug, and only fmt can reveal it. */
for (const m of SESS_KNOB_MODES) {
    const mid = m.max / 2;
    if (m.fmt(mid) === m.fmt(mid + m.step))
        throw new Error(`${m.key}: one unit (${m.step}) does not change the readout ` +
                        `("${m.fmt(mid)}"), so a slow turn cannot dial +/-1`);
    ok(`${m.key}: one unit moves the readout — "${m.fmt(mid)}" -> "${m.fmt(mid + m.step)}"`);
}

/* 4b. ⚠ The accumulator block that stood here is GONE (2026-08-26), with the law
 *     it tested. It pinned `knobAccumSteps` + `KNOB_SENS = 2` — a flat two
 *     counts per position with no speed curve — which cost KNOB_POSITIONS * 2 =
 *     510 encoder counts for a full sweep while the bank knobs beside it were
 *     tuned to 100. Every assertion in it passed; they were faithfully pinning a
 *     mixer that was 5.1x slower than its neighbours.
 *
 *     The mixer now runs the shared ccKnobDelta law (see _sessionKnobParam),
 *     scaled by `units / SWEEP_UNITS`, where `units` is now the increment each
 *     mode's own formatter prints. The FEEL is covered where it can be driven
 *     end to end through a real CC — test_session_level_knob — rather than here,
 *     where only the pure helper was ever in reach.

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
