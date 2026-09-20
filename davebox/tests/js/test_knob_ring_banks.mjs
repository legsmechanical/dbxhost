/* tests/js/test_knob_ring_banks.mjs — WHICH BANKS LIGHT THEIR KNOB RINGS.
 *
 * Josh, 2026-09-19: "Clip bank doesn't show knob led rings like the other
 * banks. They don't need to respond to the param values there, but they do need
 * the 4 (white) / 4 (orange) coloring of the other banks just so it's easier to
 * orient yourself. Same thing with step edit bank."
 *
 * ⚠ test_widget_pixels covers the COLOUR RULE as a pure function. This file
 * covers the other half, which is where the bug actually lived: whether a given
 * bank reaches that rule at all. CLIP was simply not in PARAM_LED_BANKS, and the
 * STEP bank's provider returned null unless a step was held — two absences no
 * amount of unit-testing the function could see.
 *
 * ⚠⚠ So this asserts the LEDs THAT ARE SENT, captured at the host boundary
 * (`move_midi_internal_send`), not the return value of a helper. Both caches in
 * the path suppress repeats, so each frame forces a re-emit.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const ENGINE = {};
globalThis.shadow_get_param = (slot, k) => (ENGINE[k] !== undefined ? ENGINE[k] : '');
globalThis.shadow_set_param = (slot, k, v) => { ENGINE[k] = String(v); return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.draw_rect = () => {}; globalThis.fill_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.set_pixel = () => {}; globalThis.flush_display = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

/* Every CC the module actually sent this frame, keyed by CC number. */
let SENT = {};
globalThis.move_midi_internal_send = (pkts) => {
    for (let i = 0; i + 3 < pkts.length; i += 4) {
        if (pkts[i] === 0x0b) SENT[pkts[i + 2]] = pkts[i + 3];
    }
    return true;
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const leds = await import('../../ui/ui_leds.mjs');
const K = await import('../../ui/ui_knob_leds.mjs');
const C = await import('../../ui/ui_constants.mjs');

globalThis.init();
S.awaitingProjectSelect = false; S.ledInitComplete = true;
S.stateLoading = false; S.bootSplashMs = 0;
S.sessionView = false; S.perfViewLocked = false;
S.activeTrack = 0; S.track = 0; S.heldStep = -1; S.heldStepNotes = [];
S.moveCoRunTrack = -1; S.knobTouched = -1;

/* One frame of knob rings: force past both caches, then read CC 71-78. */
function rings(bank, padMode) {
    S.activeBank = bank;
    if (padMode !== undefined) S.trackPadMode[S.activeTrack] = padMode;
    SENT = {};
    leds.invalidateLEDCache();
    S._forceKnobReemit = true;
    leds.updateTrackLEDs();
    const out = [];
    for (let k = 0; k < 8; k++) out.push(SENT[71 + k]);
    return out;
}
const WHITE = K.KNOB_WHITE_LEVELS, AMBER = K.KNOB_AMBER_LEVELS;
const lit = (r) => r.map((c) => c !== 0 && c !== undefined);
const show = (r) => JSON.stringify(r);
/* The property Josh actually asked for: you can tell knobs 1-4 from 5-8. */
function assertHueSplit(r, label) {
    for (let k = 0; k < 8; k++) {
        if (r[k] === 0 || r[k] === undefined) continue;
        const ramp = k < 4 ? WHITE : AMBER;
        const other = k < 4 ? AMBER : WHITE;
        assert(ramp.indexOf(r[k]) >= 0,
               label + ': knob ' + (k + 1) + ' is not in its own ramp — ' + show(r));
        assert(other.indexOf(r[k]) < 0,
               label + ': knob ' + (k + 1) + ' took the other row\'s hue — ' + show(r));
    }
}

step('setup: the ring rule is reachable at all (a known-lit bank)', () => {
    const r = rings(1, 0);                       /* NOTE FX: was always lit */
    assert(lit(r).some(Boolean), 'no ring lit on a bank that has always had them: ' + show(r));
    assertHueSplit(r, 'NOTE FX');
});

/* ⭐ THE ASK. Bank 0 was absent from PARAM_LED_BANKS, so every ring was dark. */
step('⭐ the CLIP bank lights its rings, hue-split, with the unassigned knob dark', () => {
    const r = rings(0, 0);
    const on = lit(r);
    assert(on[5] === false, 'CLIP knob 6 is UNASSIGNED and must stay dark: ' + show(r));
    for (const k of [0, 1, 2, 3, 4, 6, 7]) {
        assert(on[k], 'CLIP knob ' + (k + 1) + ' is dark but does something: ' + show(r));
    }
    assertHueSplit(r, 'CLIP');
    /* ⚠ The ACTION knobs (Stretch/Shift/Legato) have no value to report — they
     * were the reason a naive "ride the value" enrolment still left them dark. */
    for (const k of [1, 2, 3]) {
        assert(r[k] === (k < 4 ? WHITE : AMBER)[0],
               'CLIP action knob ' + (k + 1) + ' is not at the floor: ' + show(r));
    }
});

/* ⚠⚠ Bank 7's K1/K4/K5/K6/K7 are `scope: 'stub'` AND fully working, handled by
 * their own code. Reading the flag as "absent" left five live knobs dark. */
step('⭐ the ALL LANES bank lights every knob, custom-handled ones included', () => {
    const r = rings(7, 1);                        /* a DRUM track */
    const on = lit(r);
    for (let k = 0; k < 8; k++) {
        assert(on[k], 'ALL LANES knob ' + (k + 1) + ' is dark: ' + show(r));
    }
    assertHueSplit(r, 'ALL LANES');
});

step('⭐ the STEP bank lights its rings with NO step held', () => {
    S.heldStep = -1; S.heldStepNotes = [];
    const r = rings(C.BANK_STEP, 0);              /* melodic: all eight are knobs */
    const on = lit(r);
    for (let k = 0; k < 8; k++) {
        assert(on[k], 'STEP knob ' + (k + 1) + ' is dark with no step held: ' + show(r));
    }
    assertHueSplit(r, 'STEP');
});

/* ⭐⭐ THE DEFECT JOSH FOUND, not the feature. On the melodic step page K1/K2
 * NUDGE PITCH (by a scale degree, and by an octave) but are drawn as `blank`
 * because their value is big text. The ring rule read the shape and promised
 * they did nothing. */
step('⭐⭐ a HELD step lights the two PITCH knobs, which are drawn as "blank"', () => {
    S.trackPadMode[S.activeTrack] = 0;
    S.heldStep = 0; S.heldStepNotes = [60];
    const r = rings(C.BANK_STEP);
    const on = lit(r);
    assert(on[0], 'the held step\'s NOTE knob is dark — it nudges pitch: ' + show(r));
    assert(on[1], 'the held step\'s OCT knob is dark — it shifts by an octave: ' + show(r));
    assertHueSplit(r, 'STEP held');
    S.heldStep = -1; S.heldStepNotes = [];
});

step('a DRUM step page leaves its two genuinely empty cells dark', () => {
    S.heldStep = -1; S.heldStepNotes = [];
    const r = rings(C.BANK_STEP, 1);              /* drum: no K4, no K8 */
    const on = lit(r);
    assert(on[3] === false, 'drum STEP K4 lit, but the page has no K4: ' + show(r));
    assert(on[7] === false, 'drum STEP K8 lit, but the page has no K8: ' + show(r));
    for (const k of [0, 1, 2, 4, 5, 6]) {
        assert(on[k], 'drum STEP knob ' + (k + 1) + ' is dark: ' + show(r));
    }
    S.trackPadMode[S.activeTrack] = 0;
});

/* ⭐ CONDUCT is the exception, and it is an exception on purpose: knob k IS
 * track k on these three banks, so the param banks' 4/4 hue split would cut the
 * eight tracks into two arbitrary halves and tell you nothing. */
step('⭐ the CONDUCT banks light by TRACK COLOUR, not by the white/amber split', () => {
    for (const bank of C.CONDUCT_LED_BANKS) {
        const r = rings(bank, 0);
        for (let k = 0; k < 8; k++) {
            assert(r[k] !== 0 && r[k] !== undefined,
                   'conduct bank ' + bank + ' knob ' + (k + 1) + ' is dark: ' + show(r));
            assert(r[k] === C.TRACK_COLORS[k],
                   'conduct bank ' + bank + ' knob ' + (k + 1) + ' is not track ' + (k + 1) +
                   '\'s colour: ' + show(r));
        }
        /* ⚠ The CONTROL: this must NOT be the param-bank rule wearing a hat. */
        const sameAsParam = r.every((c, k) => (k < 4 ? WHITE : AMBER).indexOf(c) >= 0);
        assert(!sameAsParam, 'conduct bank ' + bank + ' fell through to the param ramps');
    }
});

/* ⚠ A bank with genuinely nothing on its knobs must still be able to say so —
 * otherwise "lit" stops carrying information anywhere. */
step('⚠ CONTROL: a bank whose knobs do nothing is still entirely dark', () => {
    const r = rings(2, 0);                        /* HARMONY: K5-K8 are _X */
    const on = lit(r);
    for (const k of [4, 5, 6, 7]) {
        assert(on[k] === false,
               'HARMONY knob ' + (k + 1) + ' lit, but nothing is bound to it: ' + show(r));
    }
});

if (failed) process.exit(1);
console.log('PASS: test_knob_ring_banks.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
