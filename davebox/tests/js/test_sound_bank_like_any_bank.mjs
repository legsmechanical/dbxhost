import './_bulk_get_stub.mjs';
/* tests/js/test_sound_bank_like_any_bank.mjs — the SOUND+CFG and MACROS BANKS behave
 * like every other bank (Josh, 2026-09-24: "bottom line is that sound+config bank
 * shouldn't get any treatment and work just like every other bank." · "there's the
 * sound+cfg BANK and the sound+config (sound) MENU. they're different. i'm only
 * interested in the bank").
 *
 * Opening the Sound MENU by any gesture never changes the track's bank, live or
 * recorded; walking onto the bank records it at once; suspend, track switches and
 * Back all leave it where it was. Every step performs the real gesture through
 * onMidiMessageInternal + the tick and asserts the recorded bank, the live bank and
 * what sound mode is doing. Plan: Fable, 2026-09-24.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const fb = new Uint8Array(128 * 64);
let painted = 0;
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) { fb[y * 128 + x] = c ? 1 : 0; painted++; } };
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = (p) => files.get(String(p)) || '';
globalThis.host_file_exists = (p) => files.has(String(p)); const files = new Map();
globalThis.host_write_file = (p, c) => { files.set(String(p), String(c)); return true; };
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

globalThis.host_state_subdir = () => 'dAVEBOx';
async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_MACROS, BANK_SOUND, BANK_STEP } = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const menu = await import('../../ui/ui_menu.mjs');
const editops = await import('../../ui/ui_editops.mjs');
const persist = await import('../../ui/ui_persistence.mjs');
const chord = await import('../../ui/ui_chord_pads.mjs');
const { BANK_CHORD } = await import('../../ui/ui_constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.currentSetUuid = 'bank-like-any-uuid';
const UIP = persist.uuidToUiStatePath(S.currentSetUuid);

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const jog   = (d) => cc(14, d > 0 ? 1 : 127);
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const shiftNote = (holdTicks) => {
    cc(49, 127); cc(50, 127);
    if (holdTicks) { S.tickCount += holdTicks; ticks(2); }
    cc(50, 0); cc(49, 0);
};
const shiftNoteTap  = () => { shiftNote(0); ticks(4); };
const shiftNoteHold = () => { shiftNote(46); ticks(4); };
const VIEW_BLOCKS = 0, VIEW_PROMPT = 18, VIEW_MACROS = 19;
const NOTEFX = 1;
const sidecarBank = (t) => { const j = JSON.parse(files.get(UIP) || '{}'); return Array.isArray(j.tab) ? j.tab[t] : undefined; };
const state = (t) => ({ live: S.activeBank, rec: S.trackActiveBank[t], open: snd.soundOpen(), active: snd.soundActive(),
                        view: snd.soundViewForTest(), latched: !!S.bankCardLatched });
const put = (t, bank, latched) => {
    if (snd.soundOpen()) snd.soundExit();
    S.activeTrack = t; S.activeBank = bank; S.trackActiveBank[t] = bank; S.bankCardLatched = !!latched;
    ticks(6);
};
const menuAction = (label) => {
    menu.openGlobalMenu();
    const item = S.globalMenuItems.find((it) => it && it.label === label);
    if (!item) throw new Error('no menu item "' + label + '"');
    item.onAction();
};
ticks(3);

step('(1) the jog walk at rest onto SOUND+CFG records it AT ONCE and saves the sidecar in the same call', () => {
    put(0, BANK_STEP, false);
    files.delete(UIP);
    jog(1);                                          /* no tick yet */
    assert(S.trackActiveBank[0] === BANK_SOUND, 'not recorded at the turn: ' + JSON.stringify(state(0)));
    assert(sidecarBank(0) === BANK_SOUND, 'the sidecar was not written with SOUND+CFG: ' + sidecarBank(0));
    ticks(4);
    assert(snd.soundOpen() && snd.soundResting(), 'the bank does not rest open for its knobs: ' + JSON.stringify(state(0)));
});

step('(2) SUSPEND from a track resting on SOUND+CFG keeps SOUND+CFG', () => {
    put(0, BANK_SOUND, false);
    files.delete(UIP);
    menuAction('Suspend session');
    jog(1); click();                                 /* No -> Yes, confirm */
    assert(S.pendingSuspendManaged, 'rig: did not suspend');
    assert(S.trackActiveBank[0] === BANK_SOUND, 'suspend moved the track off SOUND+CFG: ' + S.trackActiveBank[0]);
    ticks(3);
    assert(sidecarBank(0) === BANK_SOUND, 'the suspend save wrote bank ' + sidecarBank(0));
    S.pendingSuspendManaged = false; S.globalMenuOpen = false; S.confirmExit = null;
});

step('(3) Shift+Note/Session tap from a track RESTING on SOUND+CFG, then Back: still on SOUND+CFG', () => {
    put(0, BANK_SOUND, false);
    shiftNoteTap();
    assert(snd.soundActive() && snd.soundViewForTest() === VIEW_BLOCKS, 'rig: the tap did not open the menu: ' + JSON.stringify(state(0)));
    back(); ticks(4);
    assert(S.activeBank === BANK_SOUND && S.trackActiveBank[0] === BANK_SOUND,
           'Back moved the bank: ' + JSON.stringify(state(0)));
});

step('(4) Shift+Note/Session tap from a LATCHED NOTE FX card, then Back: the NOTE FX card, and never a SOUND+CFG card', () => {
    put(0, NOTEFX, true);
    shiftNoteTap();
    assert(snd.soundActive(), 'rig: the menu did not open');
    assert(S.activeBank === NOTEFX, 'opening the MENU changed the live bank to ' + S.activeBank);
    assert(S.trackActiveBank[0] === NOTEFX, 'opening the MENU changed the recorded bank to ' + S.trackActiveBank[0]);
    back(); ticks(6);
    assert(snd.soundViewForTest() !== VIEW_PROMPT || !snd.soundActive(), 'Back landed on a SOUND+CFG card: ' + JSON.stringify(state(0)));
    assert(S.activeBank === NOTEFX && S.trackActiveBank[0] === NOTEFX && S.bankCardLatched,
           'not back on the latched NOTE FX card: ' + JSON.stringify(state(0)));
    assert(!snd.soundOpen(), 'sound mode stays open over NOTE FX: ' + JSON.stringify(state(0)));
});

step('(5) a track switch from the latched SOUND+CFG CARD: the new track shows ITS OWN bank; the old one keeps SOUND+CFG', () => {
    S.trackActiveBank[3] = 2;
    put(0, BANK_SOUND, true);
    ticks(4);
    assert(snd.soundActive() && snd.soundViewForTest() === VIEW_PROMPT, 'rig: not on the latched card: ' + JSON.stringify(state(0)));
    editops._switchActiveTrack(3); ticks(6);
    assert(S.activeBank === 2 && S.trackActiveBank[3] === 2, 'the new track is not on its own bank: ' + JSON.stringify(state(3)));
    assert(!(snd.soundActive() && snd.soundViewForTest() === VIEW_PROMPT), 'the SOUND+CFG card followed onto the new track');
    assert(S.trackActiveBank[0] === BANK_SOUND, 'the old track lost SOUND+CFG: ' + S.trackActiveBank[0]);
    editops._switchActiveTrack(0); ticks(6);
    assert(S.activeBank === BANK_SOUND, 'back on track 1 it is not on SOUND+CFG: ' + JSON.stringify(state(0)));
});

step('(6) Shift+hold (instrument editor) from a latched NOTE FX card, then Back: the NOTE FX card, and it STAYS', () => {
    put(0, NOTEFX, true);
    shiftNoteHold();
    assert(snd.soundActive(), 'rig: the hold opened nothing');
    assert(S.trackActiveBank[0] === NOTEFX && S.activeBank === NOTEFX, 'the editor changed the bank: ' + JSON.stringify(state(0)));
    for (let g = 0; g < 4 && snd.soundActive(); g++) { back(); ticks(3); }
    ticks(6);
    assert(S.activeBank === NOTEFX && S.trackActiveBank[0] === NOTEFX, 'Back did not retrace to NOTE FX: ' + JSON.stringify(state(0)));
    assert(!snd.soundOpen(), 'sound mode reopened over NOTE FX: ' + JSON.stringify(state(0)));
});

step('(7) Shift+hold from a track resting on MACROS, then Back: MACROS, never the Sound menu', () => {
    put(0, BANK_MACROS, false);
    shiftNoteHold();
    assert(snd.soundActive(), 'rig: the hold opened nothing');
    for (let g = 0; g < 4 && snd.soundActive() && snd.soundViewForTest() !== VIEW_MACROS; g++) { back(); ticks(3); }
    assert(snd.soundViewForTest() !== VIEW_BLOCKS || !snd.soundActive(), 'Back landed on the Sound menu: ' + JSON.stringify(state(0)));
    assert(S.activeBank === BANK_MACROS && S.trackActiveBank[0] === BANK_MACROS, 'not on MACROS: ' + JSON.stringify(state(0)));
});

step('(9) a non-jog bank writer (the Chord layout) moves a track resting on MACROS to CHORD, and the resting mode closes', () => {
    put(0, BANK_MACROS, false);
    assert(snd.soundOpen() && snd.soundResting(), 'rig: MACROS is not resting open');
    chord.setChordLayout(0, true); ticks(4);
    assert(S.activeBank === BANK_CHORD && S.trackActiveBank[0] === BANK_CHORD, 'the layout did not land on CHORD: ' + JSON.stringify(state(0)));
    assert(!snd.soundOpen(), 'sound mode stayed open over the CHORD bank');
    chord.setChordLayout(0, false); S.chordPopupOpen = false; ticks(2);
});

step('(8) CONTROL: walking off SOUND+CFG with the jog still records the next bank (the walk is the one writer)', () => {
    put(0, BANK_SOUND, true);
    const cyc = [0, 1, 2, 3, 4, 5, BANK_STEP, BANK_SOUND, BANK_MACROS];
    jog(1); ticks(4);
    assert(S.trackActiveBank[0] === BANK_MACROS && S.activeBank === BANK_MACROS, 'the walk to MACROS: ' + JSON.stringify(state(0)));
    jog(-1); jog(-1); ticks(4);
    assert(S.trackActiveBank[0] === BANK_STEP, 'the walk back to STEP: ' + JSON.stringify(state(0)) + ' ' + cyc.length);
    S.bankCardLatched = false;
});

process.exit(failed);
}
main();
