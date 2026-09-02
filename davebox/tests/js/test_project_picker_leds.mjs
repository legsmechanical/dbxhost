/* tests/js/test_project_picker_leds.mjs — the project picker's pad LEDs must
 * make CURRENT and SELECTED tellable apart.
 *
 * Both used to blink white (Josh, 2026-08-21: "very difficult to determine
 * which is the active and which is the selected"), and two blinking things read
 * as one blinking thing. The rule now is MOTION, not colour:
 *
 *   loaded (current)    solid White, never blinks — a fixed fact
 *   cursor (selected)   pulses in the project's OWN colour
 *   both on one pad     pulses White <-> own colour
 *   any other project   solid own colour
 *
 * ⚠ Why drive the real painter rather than assert on a colour table: the bug was
 * never a wrong constant, it was two branches choosing the SAME one. Only
 * running both blink phases and comparing the pads to each other can catch that
 * — a per-branch unit assertion passes happily while the branches collide.
 *
 * ⚠ There are TWO LED caches in the path (ui_leds' lastSentNoteLED and
 * input_filter's own ledCache), so an unchanged pad is simply not re-sent. The
 * test therefore tracks last-known state per note across the whole run instead
 * of expecting a write every frame — expecting a write per frame would report
 * the STEADY pad (the whole point of the fix) as "never painted".
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, got, want) {
    console.error(`  FAIL — ${label}: got ${got}, want ${want}`);
    failed = 1;
}
function eq(label, got, want) { (got === want) ? ok(label) : bad(label, got, want); }

/* host surface */
const ledState = {};
globalThis.move_midi_internal_send = (pkt) => { ledState[pkt[2]] = pkt[3]; };
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};

/* Dynamic imports inside an async main: the runner bundles to CJS, where
 * top-level await is unavailable — and the host globals above must be installed
 * before any ui module body runs. (Same shape as test_picker_boot.mjs.) */
async function main() {
const { S } = await import('../../ui/ui_state.mjs');
const { nowMs } = await import('../../ui/ui_clock.mjs');
S.clockFollowTicks = true;   /* time in tests is driven by S.tickCount (ui_clock) */
const { updateSessionLEDs } = await import('../../ui/ui_leds.mjs');
const { PROJECT_COLORS } = await import('../../ui/ui_dialogs.mjs');
const { White } = await import('/data/UserData/schwung/shared/constants.mjs');
const LED_OFF = 0, TRACK_PAD_BASE = 68;

const GREEN = PROJECT_COLORS[2].led;      /* pad 0's colour */
const BLUE  = PROJECT_COLORS[0].led;      /* pad 1's colour */
const RED   = PROJECT_COLORS[6].led;      /* pad 2's colour */
const pad = (i) => ledState[TRACK_PAD_BASE + i];

function mkPicker(currentIdx, selectedIdx) {
    return {
        projects: [], current: currentIdx,
        byIndex: {
            0: { uuid: 'a', name: 'A', index: 0, color: 2 },
            1: { uuid: 'b', name: 'B', index: 1, color: 0 },
            2: { uuid: 'c', name: 'C', index: 2, color: 6 },
        },
        touchedIdx: -1, copySrcIdx: -1, deleteIdx: -1,
        menu: selectedIdx >= 0 ? { k: selectedIdx, sel: 0 } : null,
        colorPick: null, confirmNew: null, renameActive: false, restarting: false,
    };
}
/* blink is (S.tickCount % 30) < 15 */
function paintAt(tick) { S.tickCount = tick; S.clockMs = nowMs(); updateSessionLEDs(); }   /* the painter reads the tick's clock */

S.ledInitComplete = true;

/* ---- current and selected on DIFFERENT pads ---- */
S.projectPadPicker = mkPicker(/*current*/1, /*selected*/0);
paintAt(0);                                  /* blink phase ON */
const onSel = pad(0), onCur = pad(1), onOther = pad(2);
paintAt(30);                                 /* blink phase OFF: 30 ticks = 318 ms, the off half of the 400 ms blink */
const offSel = pad(0), offCur = pad(1), offOther = pad(2);

eq('selected pad shows its own colour on the blink', onSel, GREEN);
eq('selected pad goes dark off the blink (it MOVES)', offSel, LED_OFF);
eq('current pad is White on the blink', onCur, White);
eq('current pad is STILL White off the blink (it does not move)', offCur, White);
eq('an ordinary project is its own colour', onOther, RED);
eq('an ordinary project does not blink', offOther, RED);

/* ⭑ THE REGRESSION ITSELF: the two must not look the same in either phase. */
(onSel !== onCur && offSel !== offCur)
    ? ok('current and selected differ in BOTH blink phases')
    : bad('current and selected differ in BOTH blink phases',
          `on:${onSel}/${onCur} off:${offSel}/${offCur}`, 'different');
/* and only ONE of them is the one that moves */
((onSel !== offSel) && (onCur === offCur))
    ? ok('exactly one of the two blinks — the selected one')
    : bad('exactly one of the two blinks', `sel ${onSel}/${offSel}, cur ${onCur}/${offCur}`,
          'selected changes, current steady');

/* ---- current and selected on the SAME pad (the common case on open) ---- */
S.projectPadPicker = mkPicker(/*current*/1, /*selected*/1);
paintAt(0);  const onBoth = pad(1);
paintAt(30); const offBoth = pad(1);        /* 318 ms: the off half */
eq('both-on-one-pad shows White on the blink', onBoth, White);
eq('both-on-one-pad shows its own colour off the blink', offBoth, BLUE);
(onBoth !== offBoth)
    ? ok('both-on-one-pad pulses, so it reads as selected too')
    : bad('both-on-one-pad pulses', `${onBoth}/${offBoth}`, 'two different colours');

/* ---- a plain project must never be mistaken for the current one ---- */
S.projectPadPicker = mkPicker(/*current*/-1, /*selected*/-1);
paintAt(0);
((pad(0) !== White) && (pad(1) !== White) && (pad(2) !== White))
    ? ok('with no current project, no pad is White')
    : bad('with no current project, no pad is White',
          `${pad(0)}/${pad(1)}/${pad(2)}`, 'no White');

/* ---- the palette itself must not contain the "current" colour ----
 * Josh, 2026-08-22: WHITE was dropped from PROJECT_COLORS because a
 * white-coloured project sitting idle was indistinguishable from the OPEN one.
 * Check the LEDs, not the names — a renamed entry with the same LED would
 * still collide. */
const whiteEntries = PROJECT_COLORS.filter(c => c.led === White);
eq('no palette entry paints the pad White (White means CURRENT)', whiteEntries.length, 0);

/* A stored index from the retired entry (9) must degrade, not crash or paint. */
S.projectPadPicker = mkPicker(-1, -1);
S.projectPadPicker.byIndex[2].color = 9;
paintAt(0);
eq('a retired/out-of-range stored colour falls back to colour 0', pad(2), PROJECT_COLORS[0].led);

/* ---- round-robin default colour: the shell side is pinned to this table ----
 * project-cmd.sh gives a new project colour `index % DBX_PALETTE_N`. The
 * script cannot import the JS table, so its constant is checked here. */
const fs = await import('fs');
/* run.sh bundles to CJS (no import.meta) and runs from davebox/, so cwd-relative. */
const script = fs.readFileSync('../standalone/scripts/project-cmd.sh', 'utf8');
const m = script.match(/^DBX_PALETTE_N=(\d+)$/m);
eq('project-cmd.sh declares DBX_PALETTE_N', !!m, true);
eq('DBX_PALETTE_N matches PROJECT_COLORS.length', m ? Number(m[1]) : -1, PROJECT_COLORS.length);
/* both creation verbs must write the colour, not just the index */
const body = (name) => { const i = script.indexOf(name + '() {'); return script.slice(i, script.indexOf('\n}\n', i)); };
eq('do_new_at writes user.dbx-color', /user\.dbx-color/.test(body('do_new_at')), true);
eq('do_new writes user.dbx-color', /user\.dbx-color/.test(body('do_new')), true);
eq('do_new_at takes the colour modulo DBX_PALETTE_N', /%\s*int\(sys\.argv\[3\]\)/.test(body('do_new_at')) && /DBX_PALETTE_N/.test(body('do_new_at')), true);
eq('do_new takes the colour modulo the palette', /nxt\s*%\s*palette_n/.test(body('do_new')), true);

console.log(failed ? 'project picker LEDs: FAILED' : 'project picker LEDs: PASS');
process.exit(failed);
}

main().catch((e) => { console.error('  FAIL — harness:', e && e.stack ? e.stack : e); process.exit(1); });
