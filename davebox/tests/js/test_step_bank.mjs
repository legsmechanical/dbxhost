import './_bulk_get_stub.mjs';
/* tests/js/test_step_bank.mjs — the STEP bank (spec §2, Josh 2026-09-02):
 * the step editor is a BANK, and a held step redirects the on-screen knobs to
 * that step ONLY there (and in the module editor, pinned elsewhere). Every
 * other bank declines; nothing changes the screen under a hold. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
/* A 128x64 framebuffer, so a screen can be compared with another screen. */
const fb = new Uint8Array(128 * 64);
const fbHash = () => { let h = 0; for (let i = 0; i < fb.length; i++) h = (h * 31 + fb[i]) >>> 0; return h; };
/* The frame in two parts: the BODY (above the footer row) and the FOOTER (the
 * hint row), so a pin can say "the body is identical and the hints changed". */
let FOOTER_Y = 64;
const bodyHash = () => { let h = 0; for (let i = 0; i < FOOTER_Y * 128; i++) h = (h * 31 + fb[i]) >>> 0; return h; };
const footHash = () => { let h = 0; for (let i = FOOTER_Y * 128; i < fb.length; i++) h = (h * 31 + fb[i]) >>> 0; return h; };
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => {
    if (k.endsWith('_notes')) return '60';
    if (k.endsWith('_vel')) return '100';
    if (k.endsWith('_gate')) return '12';
    return '';
};
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } for (let j = 0; j < h; j++) { px(x, y + j, c); px(x + w - 1, y + j, c); } };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = px; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_STEP, BANK_SOUND, BANK_SOUND_PREV, PAD_MODE_DRUM, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
FOOTER_Y = (await import('../../ui/ui_movy.mjs')).MV_FOOTER_Y - 1;
const { bankCycleForMode, bankDisplayName } = await import('../../ui/ui_pure.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const STEP = (i) => 16 + i;
const T = 0, AC = 0;
function fresh(bank) {
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    S.activeBank = bank; S.trackActiveBank[T] = bank;
    S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = [];
    S.stepHoldPromote = false; S.stepWasEmpty = false; S.stepWasHeld = false;
    S.playing = false; S.trackQueuedClip[T] = -1; S.trackActiveClip[T] = AC;
    S.trackPadMode[T] = 0; S.trackCurrentPage[T] = 0;
    S.clipLength[T][AC] = 16; S.clipTPS[T][AC] = 24; S.lastPlayedNote = 60;
    for (let i = 0; i < 64; i++) S.clipSteps[T][AC][i] = 0;
    S.clipSteps[T][AC][5] = 1; S.clipNonEmpty[T][AC] = true;
    S.knobTouched = -1; S.bankCardLatched = false;
    S.tickCount += 100;
}
function holdStep5() { note(STEP(5), 127); S.tickCount += 25; globalThis.tick(); }

/* ---- registration ------------------------------------------------------ */
step('the STEP bank exists and sits just before SOUND + CONFIG on the melodic and drum walks, last on a Conductor', () => {
    assert(BANKS[BANK_STEP] && BANKS[BANK_STEP].name === 'STEP', 'BANKS[BANK_STEP] is STEP');
    const mel = bankCycleForMode(0), drum = bankCycleForMode(PAD_MODE_DRUM), con = bankCycleForMode(PAD_MODE_CONDUCT);
    /* … STEP, SOUND + CONFIG, MACROS, AUTOMATION — STEP is the stop before SOUND + CONFIG. */
    assert(mel.indexOf(BANK_STEP) === mel.indexOf(BANK_SOUND) - 1, 'melodic: STEP just before SOUND');
    assert(drum.indexOf(BANK_STEP) === drum.indexOf(BANK_SOUND) - 1, 'drum: STEP just before SOUND');
    assert(con[con.length - 1] === BANK_STEP, 'conductor: … STEP');
    assert(BANK_SOUND_PREV === BANK_STEP, 'the top-edge left turn from SOUND + CONFIG lands on STEP');
    assert(bankDisplayName(0, BANK_STEP) === 'STEP' && bankDisplayName(PAD_MODE_CONDUCT, BANK_STEP) === 'C-STEP', 'named like every bank');
});

/* ---- the knobs ------------------------------------------------------------ */
step('⚠ on the STEP bank a held step\'s knobs edit THAT step (K4 Vel writes _step_5_vel)', () => {
    fresh(BANK_STEP);
    holdStep5();
    assert(S.heldStepNotes.length === 1, 'held with notes');
    cc(74, 1); cc(74, 1);
    assert(sets.some(x => x.startsWith('t0_c0_step_5_vel=')), 'velocity written to step 5, got ' + JSON.stringify(sets));
    /* ONE undo per hold: the checkpoint lands once, before the first write, and
     * a third turn adds no second one. */
    cc(74, 1);
    const ck = sets.filter(x => x === 't0_c0_undo_checkpoint=1');
    assert(ck.length === 1, '⚠ exactly ONE undo checkpoint for the hold, got ' + ck.length);
    assert(sets.indexOf('t0_c0_undo_checkpoint=1') < sets.findIndex(x => x.startsWith('t0_c0_step_5_vel=')), 'and it precedes the first write');
    note(STEP(5), 0); globalThis.tick();
    sets.length = 0; holdStep5(); cc(74, 1);
    assert(sets.filter(x => x === 't0_c0_undo_checkpoint=1').length === 1, 'a NEW hold takes a new checkpoint');
    note(STEP(5), 0); globalThis.tick();
});
step('⚠ on another bank (NOTE FX) the same gesture writes NOTHING to the step — the bank declines', () => {
    fresh(1);
    holdStep5();
    cc(74, 1); cc(74, 1);
    assert(!sets.some(x => x.includes('_step_5_')), 'nothing written to step 5, got ' + JSON.stringify(sets));
    assert(S.activeBank === 1, 'and the bank did not change under the hold');
    note(STEP(5), 0); globalThis.tick();
});
step('⚠ the retired bank 6 writes NOTHING under a held step (P8 left its index a stub)', () => {
    fresh(6);
    holdStep5();
    cc(71, 1); cc(71, 1);
    assert(sets.length === 0, 'a retired bank writes nothing, got ' + JSON.stringify(sets));
    note(STEP(5), 0); globalThis.tick();
});

/* ---- the screen ------------------------------------------------------------
 * Rendered at the SAME tickCount with and without the hold, so a blinking
 * header cannot fake a difference: the hold is established, then the clock
 * is set back to the reference tick before the frame is drawn. */
function frameAt(tick) { const keep = S.tickCount; S.tickCount = tick; S.screenDirty = true; globalThis.tick(); const h = fbHash(); S.tickCount = keep; return h; }
function partsAt(tick) { const keep = S.tickCount; S.tickCount = tick; S.screenDirty = true; globalThis.tick(); const r = { body: bodyHash(), foot: footHash() }; S.tickCount = keep; return r; }
step('⚠ a held step does NOT change the screen on another bank (NOTE FX card, pixel-identical)', () => {
    fresh(1); S.bankCardLatched = true;
    const ref = S.tickCount + 50;
    const before = partsAt(ref);
    holdStep5();
    const during = partsAt(ref);
    assert(before.body === during.body, 'the NOTE FX card BODY is pixel-identical with the step held');
    assert(before.foot !== during.foot, '⚠ ...and the footer changed: the jog now reveals (JOG STEP), and the hint says so');
    note(STEP(5), 0); globalThis.tick();
});
step('⚠ on the STEP bank the held step IS the screen: the frame changes when a step is held', () => {
    fresh(BANK_STEP); S.bankCardLatched = true;
    const ref = S.tickCount + 50;
    const rest = frameAt(ref);
    assert(rest !== 0, 'the resting STEP card draws something (the -- cells)');
    holdStep5();
    const held = frameAt(ref);
    assert(rest !== held, 'holding a step with a note changes the STEP card');
    note(STEP(5), 0); globalThis.tick();
});

if (failed) { console.log('FAIL: STEP bank'); process.exit(1); }
console.log('PASS: the STEP bank — a held step redirects the knobs there and nowhere else');
}
main().catch(e => { console.error(e); process.exit(1); });
