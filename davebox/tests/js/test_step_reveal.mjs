import './_bulk_get_stub.mjs';
/* tests/js/test_step_reveal.mjs — THE REVEAL (spec §2, Josh 2026-09-02):
 * hold a step, jog RIGHT shows the STEP bank's page for that step on top of
 * whatever was up; jog LEFT (or the release) takes it away. Two positions, no
 * cycling; Shift+jog declined; a jog turn while a step is down promotes the
 * press to a hold; the knobs edit the step while it is revealed. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const fb = new Uint8Array(128 * 64);
const fbHash = () => { let h = 0; for (let i = 0; i < fb.length; i++) h = (h * 31 + fb[i]) >>> 0; return h; };
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
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
const { BANKS, BANK_STEP, BANK_SOUND } = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const STEP = (i) => 16 + i;
const right = () => { S.tickCount += 20; cc(14, 1); };
const left  = () => { S.tickCount += 20; cc(14, 127); };
const T = 0, AC = 0;
function fresh(bank) {
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    if (snd.soundActive()) snd.soundExit();
    S.activeBank = bank; S.trackActiveBank[T] = bank;
    S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = []; S.stepReveal = false; S.stepRevealJogTick = -1000;
    S.stepHoldPromote = false; S.stepWasEmpty = false; S.stepWasHeld = false;
    S.playing = false; S.trackQueuedClip[T] = -1; S.trackActiveClip[T] = AC;
    S.trackPadMode[T] = 0; S.trackCurrentPage[T] = 0;
    S.clipLength[T][AC] = 16; S.clipTPS[T][AC] = 24; S.lastPlayedNote = 60;
    for (let i = 0; i < 64; i++) S.clipSteps[T][AC][i] = 0;
    S.clipSteps[T][AC][5] = 1; S.clipNonEmpty[T][AC] = true;
    S.knobTouched = -1; S.bankCardLatched = true; S.shiftHeld = false;
    S.tickCount += 100;
}
function holdStep5() { note(STEP(5), 127); S.tickCount += 25; globalThis.tick(); }
function frameAt(tick) { const keep = S.tickCount; S.tickCount = tick; S.screenDirty = true; globalThis.tick(); const h = fbHash(); S.tickCount = keep; return h; }
function release() { note(STEP(5), 0); globalThis.tick(); }

step('⚠ NOTE FX + held step: jog RIGHT reveals the step page (the frame the STEP bank itself would draw); LEFT returns to the very same frame', () => {
    fresh(BANK_STEP); holdStep5();
    const REF = 5000;
    const stepBankHeld = frameAt(REF);
    release();
    fresh(1); holdStep5();
    const origin = frameAt(REF);
    assert(origin !== stepBankHeld, 'control: the NOTE FX card and the step page differ');
    right();
    assert(S.stepReveal === true, 'revealed');
    assert(frameAt(REF) === stepBankHeld, '⚠ the reveal IS the STEP bank\'s page for that step');
    right();
    assert(S.stepReveal === true && frameAt(REF) === stepBankHeld, 'a second right turn changes nothing (no cycling)');
    left();
    assert(S.stepReveal === false, 'returned');
    assert(frameAt(REF) === origin, '⚠ back on the exact frame you left');
    left();
    assert(S.stepReveal === false && S.activeBank === 1, 'a second left turn changes nothing — no bank walk under a hold');
    release();
});
step('⚠ while revealed the knobs edit the HELD STEP (K4 → _step_5_vel), not the bank', () => {
    fresh(1); holdStep5(); right();
    cc(74, 1); cc(74, 1);
    assert(sets.some(x => x.startsWith('t0_c0_step_5_vel=')), 'velocity written to step 5, got ' + JSON.stringify(sets));
    release();
});
step('releasing the step while revealed takes the reveal away', () => {
    fresh(1); holdStep5(); right();
    assert(S.stepReveal === true, 'revealed');
    release();
    assert(S.stepReveal === false && S.activeBank === 1, 'released: back on NOTE FX, nothing revealed');
});
step('a flick (right then left inside the debounce) stays revealed', () => {
    fresh(1); holdStep5(); right();
    cc(14, 127);                                   /* immediate left, no ticks elapsed */
    assert(S.stepReveal === true, 'the bounce was ignored');
    release();
});
step('Shift+jog while a step is held does NOTHING: no reveal, no track switch', () => {
    fresh(1); holdStep5(); S.shiftHeld = true;
    right();
    assert(S.stepReveal === false && S.activeTrack === 0, 'declined');
    S.shiftHeld = false; release();
});
step('already ON the STEP bank: right and left both do nothing', () => {
    fresh(BANK_STEP); holdStep5();
    right(); assert(S.stepReveal === false && S.activeBank === BANK_STEP, 'right: nothing');
    left();  assert(S.stepReveal === false && S.activeBank === BANK_STEP, 'left: nothing');
    release();
});
step('⚠ a jog turn inside the tap window PROMOTES the press: the release does not clear the step', () => {
    fresh(1);
    note(STEP(5), 127); S.tickCount += 2; cc(14, 1);
    assert(S.stepHoldPromote === true, 'promoted');
    globalThis.tick(); release();
    assert(!sets.some(x => x.includes('_step_5_clear')) && !S.pendingDefaultSetParams.some(p => p.key.includes('_step_5_clear')), 'step 5 survived');
});
step('⚠ from SOUND + CONFIG (sound mode active): the reveal draws over it, and left returns to it with sound mode still active', () => {
    fresh(BANK_STEP); S.bankCardLatched = true;
    right();                                       /* walk onto SOUND + CONFIG */
    globalThis.tick(); globalThis.tick();
    assert(snd.soundActive(), 'control: sound mode opened');
    const REF = 7000;
    const card = frameAt(REF);
    holdStep5();
    right();
    assert(S.stepReveal === true && snd.soundActive(), 'revealed; sound mode still active underneath');
    assert(frameAt(REF) !== card, 'the step page replaced the card');
    left();
    assert(S.stepReveal === false && snd.soundActive(), 'returned; sound mode still active');
    assert(frameAt(REF) === card, 'the card is back, pixel for pixel');
    release();
});

if (failed) { console.log('FAIL: the reveal'); process.exit(1); }
console.log('PASS: hold a step + jog right reveals the step page, jog left or release returns');
}
main().catch(e => { console.error(e); process.exit(1); });
