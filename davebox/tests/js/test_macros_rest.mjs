import './_bulk_get_stub.mjs';
/* tests/js/test_macros_rest.mjs — MACROS AT REST (Josh, 2026-09-03: "when i'm
 * on the overview page, the knobs don't do anything and, in fact, peek to a
 * macro page where nothing is assigned"). A track remembered on MACROS keeps
 * sound mode OPEN at rest (soundOpen), but not ACTIVE (soundActive): the
 * knobs are the macros on the overview, a knob touch peeks the LIVE page,
 * the jog click latches bank mode like any bank, and step record / the
 * Note/Session home tap still see the overview.
 *
 * Harness: the whole UI (ui.js + onMidiMessageInternal + tick), as
 * test_step_bank does, over a shadow_get_param stub. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const fb = new Uint8Array(128 * 64);
let painted = 0;
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) { fb[y * 128 + x] = c ? 1 : 0; painted++; } };
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
const ASSIGN = {
    'knob_1_target': 'synth', 'knob_1_param': 'cutoff',
    'synth:cutoff': '0.5', 'synth:module': 'nusaw',
    'synth:chain_params': JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 }]),
};
let reads = [], writes = [];
globalThis.shadow_get_param = (slot, key) => { reads.push(key); return ASSIGN[key] || ''; };
globalThis.shadow_set_param = (slot, key, val) => { writes.push({ key, val }); ASSIGN[key] = String(val); return 1; };
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.shadow_save_state_now = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = px; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
for (const fn of ['host_set_led', 'host_get_setting', 'host_set_setting', 'host_send_midi', 'move_midi_inject_to_move', 'shadow_restore_knob_leds'])
    if (!globalThis[fn]) globalThis[fn] = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_MACROS, BANK_SOUND } = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const T = 0;

step('a track remembered on MACROS, at rest (bank mode unlatched): sound mode OPENS silently but is not ACTIVE', () => {
    S.trackMacros[T] = null;
    S.activeBank = BANK_MACROS; S.trackActiveBank[T] = BANK_MACROS; S.bankCardLatched = false;
    ticks(12);
    assert(snd.soundOpen(), 'open');
    assert(snd.soundResting(), 'resting');
    assert(!snd.soundActive(), 'not active — davebox gates read it as closed');
    assert(S.activeBank === BANK_MACROS && S.trackActiveBank[T] === BANK_MACROS, 'the bank stays MACROS');
    const st = S.trackMacros[T];
    assert(st && st[0] && st[0].key === 'cutoff', 'the store migrated at rest, got ' + JSON.stringify(st));
});
step('⭑ on the overview the knobs ARE the macros: K1 writes synth:cutoff', () => {
    writes = [];
    cc(71, 4); ticks(2);
    const w = writes.filter(x => x.key === 'synth:cutoff');
    assert(w.length === 1, 'one write, got ' + JSON.stringify(writes));
});
step('⭑ a knob touch PEEKS the LIVE page (assignments shown), and the release stands it down', () => {
    note(0, 127); ticks(1);
    assert(S.knobTouched === 0, 'davebox\'s own touch bookkeeping still ran (the peek arms on it)');
    assert(render.bankCardVisible(), 'the card is visible on the touch');
    painted = 0; globalThis.clear_screen(); render.drawUI();
    assert(painted > 200, 'the page drew');
    const m = snd.soundMacrosForTest();
    assert(m.drawn[0].kind === 'arc' && m.drawn[0].text !== '--', 'K1 is drawn assigned with its value, got ' + JSON.stringify(m.drawn[0]));
    note(0, 0); ticks(1);
    assert(!render.bankCardVisible(), 'stood down');
});
step('⭑ the jog CLICK at rest LATCHES bank mode (as on any bank) — it does not open the assign list', () => {
    cc(3, 127); cc(3, 0); ticks(1);
    assert(S.bankCardLatched, 'latched');
    assert(snd.soundActive() && snd.soundViewForTest() === 19, 'now active on the MACROS page, view ' + snd.soundViewForTest());
    cc(3, 127); cc(3, 0); ticks(1);
    assert(snd.soundViewForTest() === 11, 'the second click (latched) opens the assign list');
    cc(51, 127); cc(51, 0); ticks(1);
    assert(snd.soundViewForTest() === 19, 'Back to the page');
    cc(51, 127); cc(51, 0); ticks(1);
    assert(!S.bankCardLatched, 'Back from the page leaves bank mode');
});
step('after Back the track is off MACROS (the exit hands the bank to its origin) and sound mode stays closed', () => {
    ticks(3);
    assert(!snd.soundOpen(), 'closed');
    assert(S.activeBank !== BANK_MACROS, 'landed elsewhere: ' + S.activeBank);
});
step('a track switch onto a MACROS track re-opens the rest state silently', () => {
    S.trackActiveBank[1] = BANK_MACROS; S.trackMacros[1] = null;
    cc(49, 127); cc(14, 1); cc(49, 0);     /* Shift + jog: next track */
    ticks(12);
    assert(S.activeTrack === 1, 'on track 2, got ' + S.activeTrack);
    assert(snd.soundOpen() && snd.soundResting(), 'resting on the new track');
    assert(!S.bankSelectTick || S.bankSelectTick < 0 || !render.bankCardVisible(), 'no card popped (silent)');
});

if (failed) { console.log('FAIL: macros at rest'); process.exit(1); }
console.log('PASS: MACROS at rest — knobs live, live peek, click latches');
}
main().catch(e => { console.error(e); process.exit(1); });
