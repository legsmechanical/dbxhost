/* tests/js/test_shift_volume_everywhere.mjs — Shift+Volume = the active track's
 * level from EVERY track-view state (Josh, 2026-09-04: "verify that shift+volume
 * for track level works everywhere in track view").
 *
 * The gesture has two owners: outside a sound screen it is ui_input_cc's
 * tvDeltaAcc drain; on a sound screen it is sound mode's onVolumeTurn →
 * volPending → the drain at the top of soundTick. Every state below sends the
 * SAME stimulus through the SAME entry point (onMidiMessageInternal, so ui.js's
 * steering is part of what is tested) and asserts the SAME observable: one
 * write to the active track's level in the engine. The control is a plain
 * turn (no Shift), which must write nothing anywhere.
 *
 * ⚠ tick() swallows errors, so every assertion here is a POSITIVE (a write that
 * happened); the jserr tripwire below catches a stage that died on the way. */

import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

/* ---- engine: a loaded synth in slot 2 so a block can open the real editor ---- */
const ENGINE = {
    'synth:module': 'nusaw',
    'synth:cutoff': '0.5',
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
    ]),
    'synth:ui_hierarchy': JSON.stringify({ levels: { root: { name: 'NuSaw',
        params: [{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }], knobs: ['cutoff'] } } }),
    'slot:volume': '1.000',
    'move_fx:1:volume': '1.000',
};
let writes = [];
globalThis.shadow_get_param = (slot, key) => (ENGINE[key] != null ? ENGINE[key] : '');
globalThis.shadow_set_param = (slot, key, val) => { writes.push([slot, key, String(val)]); ENGINE[key] = String(val); return 1; };
globalThis.shadow_get_params = () => '';
globalThis.shadow_set_params = () => true;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.shadow_save_state_now = () => 1;
globalThis.move_midi_external_send = () => {};
globalThis.host_vol_block = () => {};
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 600);
    return true;
};
for (const fn of ['host_read_file', 'host_file_exists', 'host_ensure_dir', 'host_remove_dir',
                  'host_system_cmd', 'host_module_set_param', 'host_module_get_param',
                  'host_send_midi', 'move_midi_inject_to_move', 'host_set_led', 'set_led',
                  'host_get_setting', 'host_set_setting', 'move_midi_internal_send',
                  'host_edit_cc_block', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'host_autosave_hold', 'host_register_primary',
                  'host_open_service', 'host_close_service'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.pixel_print = () => {};
globalThis.text_width = (t) => String(t).length * 6; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.draw_line = () => {}; globalThis.set_pixel = () => {};
globalThis.stipple_rect = () => {}; globalThis.flush_display = () => {};
globalThis.shadow_get_ui_flags = () => 0; globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_MACROS, BANK_AUTOMATION } = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const shift = (on) => cc(49, on ? 127 : 0);
const vol   = (d) => cc(79, d > 0 ? d : 128 + d);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const T = 2;
globalThis.__shiftHardware = true;

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
ticks(4);

const levelWrites = () => writes.filter(([sl, k]) => k === 'slot:volume' || k === 'move_fx:1:volume');

/* One stimulus, one observable — used by every state below. */
function assertGesture(label, expectKey, expectSlot) {
    writes = [];
    vol(1); vol(1); ticks(2);                      /* CONTROL: plain turns write nothing */
    if (levelWrites().length) throw new Error(label + ': a PLAIN turn wrote ' + JSON.stringify(levelWrites()));
    writes = [];
    shift(true);
    vol(1); vol(1); vol(1);
    ticks(2);
    shift(false);
    const w = levelWrites();
    if (!w.length) throw new Error(label + ': Shift+Volume wrote NOTHING (writes seen: ' + JSON.stringify(writes.slice(0, 6)) + ')');
    const [sl, k, v] = w[0];
    if (k !== expectKey) throw new Error(label + ': wrote ' + k + ', expected ' + expectKey);
    if (expectSlot != null && sl !== expectSlot) throw new Error(label + ': wrote slot ' + sl + ', expected ' + expectSlot);
    if (!(parseFloat(v) > 1.0)) throw new Error(label + ': level did not rise: ' + v);
    ENGINE['slot:volume'] = '1.000'; ENGINE['move_fx:1:volume'] = '1.000';
    if (swallowed) throw new Error(label + ': a stage threw: ' + swallowed);
}

step('1. track overview, sound mode CLOSED', () => {
    snd.soundExit();
    ticks(2);
    if (snd.soundOpen()) throw new Error('rig: sound mode still open');
    assertGesture('closed', 'slot:volume', T);
});

step('2. track overview with sound mode RESTING (track left on MACROS)', () => {
    S.activeBank = BANK_MACROS; S.trackActiveBank[T] = BANK_MACROS; S.bankCardLatched = false;
    ticks(12);
    if (!snd.soundOpen() || !snd.soundResting()) throw new Error('rig: not resting (open=' + snd.soundOpen() + ')');
    assertGesture('resting', 'slot:volume', T);
    if (!snd.soundResting()) throw new Error('the gesture woke sound mode');
});

step('3. the MACROS page (latched)', () => {
    cc(3, 127); cc(3, 0); ticks(3);                /* jog click latches the bank → the page */
    if (!snd.soundActive()) throw new Error('rig: MACROS page not active, view ' + snd.soundViewForTest());
    assertGesture('macros page', 'slot:volume', T);
});

step('4. the AUTOMATION bank card', () => {
    snd.soundExit(); ticks(2);
    S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;
    ticks(4);
    assertGesture('automation bank', 'slot:volume', T);
});

step('5. SOUND + CONFIG cards (the block list)', () => {
    snd.soundExit(); ticks(2);
    S.activeBank = 0; S.trackActiveBank[T] = 0; S.bankCardLatched = false;
    snd.soundEnter(T, T); ticks(4);                /* lands on the door (prompt, resting) */
    cc(3, 127); cc(3, 0); ticks(3);                /* first click LATCHES the door (active-as-bank) */
    if (!snd.soundActive() || snd.soundViewForTest() !== 18)
        throw new Error('rig: door not latched, active=' + snd.soundActive() + ' view ' + snd.soundViewForTest());
    assertGesture('door (latched)', 'slot:volume', T);
    cc(3, 127); cc(3, 0); ticks(3);                /* second click ENTERS the block list */
    if (!snd.soundActive() || snd.soundViewForTest() !== 0)
        throw new Error('rig: cards not up, active=' + snd.soundActive() + ' view ' + snd.soundViewForTest());
    assertGesture('cards', 'slot:volume', T);
});

step('6. the MODULE EDITOR (param pages on)', () => {
    /* Instrument row is 0; the Generator block is the next row. Jog to it and click. */
    /* The cursor carries over between entries, so walk it to the INSTRUMENT
     * row — the generator's door since 2026-09-04 (click enters the editor). */
    const gen = snd.soundPickStateForTest().kinds.indexOf('trackto');
    if (gen < 0) throw new Error('rig: no Instrument row in ' + JSON.stringify(snd.soundPickStateForTest().kinds));
    for (let g = 0; g < 20 && snd.soundPickStateForTest().row !== gen; g++) {
        cc(14, snd.soundPickStateForTest().row > gen ? 127 : 1); ticks(1);
    }
    cc(3, 127); cc(3, 0); ticks(8);                /* click it: a loaded module → the editor */
    const opened = !!snd.soundPPForTest().on;
    if (!opened) throw new Error('rig: the editor never came up (view ' + snd.soundViewForTest() + ' row ' + snd.soundPickStateForTest().row + ')');
    assertGesture('editor', 'slot:volume', T);
});

step('7. the editor with a HOSTED canvas that eats every CC', () => {
    if (!snd.soundPPForTest().on) throw new Error('rig: editor not on');
    snd.soundSetHostedForTest({ onMidi: () => true, draw: () => {}, tick: () => {} });
    try { assertGesture('hosted canvas', 'slot:volume', T); }
    finally { snd.soundSetHostedForTest(null); }
});

step('8. the enum picker over a card', () => {
    snd.soundExit(); ticks(2);
    snd.soundEnter(T, T); ticks(4);
    for (let b = 0; b < 4 && snd.soundViewForTest() !== 0 && snd.soundViewForTest() !== 18; b++) { cc(51, 127); cc(51, 0); ticks(2); }
    if (snd.soundViewForTest() === 18) { cc(3, 127); cc(3, 0); ticks(3); }   /* latch the door */
    if (snd.soundViewForTest() === 18) { cc(3, 127); cc(3, 0); ticks(3); }   /* → the list */
    if (snd.soundViewForTest() !== 0) throw new Error('rig: not on the list, view ' + snd.soundViewForTest());
    for (let g = 0; g < 20 && snd.soundPickStateForTest().row !== 0; g++) { cc(14, 127); ticks(1); }
    shift(true); cc(3, 127); cc(3, 0); shift(false); ticks(3);   /* Shift+click the Instrument row → the picker */
    if (snd.soundViewForTest() !== 17) throw new Error('rig: picker not open, view ' + snd.soundViewForTest());
    assertGesture('enum picker', 'slot:volume', T);
    cc(51, 127); cc(51, 0); ticks(2);
});

step('9. a MOVE-routed track\'s cards write its BUS strip volume', () => {
    snd.soundExit(); ticks(2);
    S.trackRoute[T] = 1; S.trackChannel[T] = 1;
    snd.soundEnterMove(T); ticks(4);
    assertGesture('move cards', 'move_fx:1:volume', 0);
    S.trackRoute[T] = 0;
});

step('10. a GLOBAL bus screen declines: the gesture still reaches the ACTIVE track', () => {
    snd.soundExit(); ticks(2);
    S.sessionView = true;                          /* the bus list is SESSION view's door */
    snd.soundEnterBuses(); ticks(2);
    const v0 = snd.soundViewForTest(), a0 = snd.soundActive();
    cc(3, 127); cc(3, 0); ticks(3);
    if (!snd.soundIsGlobal()) throw new Error('rig: not on a global bus (after enterBuses view ' + v0 + ' active ' + a0 + '; now view ' + snd.soundViewForTest() + ')');
    assertGesture('global bus', 'slot:volume', T);
    snd.soundExit(); ticks(2); S.sessionView = false;
});

if (swallowed) bad('tripwire', 'a stage threw and tick swallowed it: ' + swallowed);
if (failed) process.exit(1);
console.log('test_shift_volume_everywhere: PASS');
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
