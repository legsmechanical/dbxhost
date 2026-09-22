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
/* Every step lock the automation editor writes is logged as `[auto] p-lock …`
 * (ui_automation.mjs automationParamEdit) — the observable a lock leaves. */
const locks = [];
const _log = console.log;
console.log = (...a) => { const m = a.join(' '); if (m.includes('[auto] p-lock')) locks.push(m); else _log(...a); };
const fb = new Uint8Array(128 * 64);
const fbHash = () => { let h = 0; for (let i = 0; i < fb.length; i++) h = (h * 31 + fb[i]) >>> 0; return h; };
/* The frame in two parts: the BODY (above the footer row) and the FOOTER (the
 * hint row), so a pin can say "the body is identical and the hints changed". */
let FOOTER_Y = 64;
const bodyHash = () => { let h = 0; for (let i = 0; i < FOOTER_Y * 128; i++) h = (h * 31 + fb[i]) >>> 0; return h; };
const footHash = () => { let h = 0; for (let i = FOOTER_Y * 128; i < fb.length; i++) h = (h * 31 + fb[i]) >>> 0; return h; };
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
    if (k.endsWith('_rand')) return '0';
    return '';
};
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); printed.length = 0; };
const printed = [];
globalThis.print = (x, y, t, c) => { printed.push(String(t)); for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
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
FOOTER_Y = (await import('../../ui/ui_movy.mjs')).MV_FOOTER_Y - 1;
const snd = await import('../../ui/ui_sound.mjs');
const rnd = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
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
    S.clipPlaybackDir[T][AC] = 0; S.bankParams[T][0][6] = 0;   /* CLIP Dir at its floor: a turn can move it */
    S.tickCount += 100;
}
function holdStep5() { note(STEP(5), 127); S.tickCount += 25; globalThis.tick(); }
function frameAt(tick) { const keep = S.tickCount; S.tickCount = tick; S.screenDirty = true; globalThis.tick(); const h = fbHash(); S.tickCount = keep; return h; }
function partsAt(tick) { const keep = S.tickCount; S.tickCount = tick; S.screenDirty = true; globalThis.tick(); const r = { body: bodyHash(), foot: footHash() }; S.tickCount = keep; return r; }
function release() { note(STEP(5), 0); globalThis.tick(); }

step('⚠ NOTE FX + held step: jog RIGHT reveals the step page (the frame the STEP bank itself would draw); LEFT returns to the very same frame', () => {
    fresh(BANK_STEP); holdStep5();
    const REF = 5000;
    const stepBankHeld = partsAt(REF);
    release();
    fresh(1); holdStep5();
    const origin = partsAt(REF);
    assert(origin.body !== stepBankHeld.body, 'control: the NOTE FX card and the step page differ');
    right();
    assert(S.stepReveal === true, 'revealed');
    const revealed = partsAt(REF);
    assert(revealed.body === stepBankHeld.body, '⚠ the reveal IS the STEP bank\'s page for that step (body)');
    assert(revealed.foot !== stepBankHeld.foot, 'and its footer says JOG BACK, which the STEP bank\'s own page does not');
    right();
    const again = partsAt(REF);
    assert(S.stepReveal === true && again.body === revealed.body && again.foot === revealed.foot, 'a second right turn changes nothing (no cycling)');
    left();
    assert(S.stepReveal === false, 'returned');
    const back = partsAt(REF);
    assert(back.body === origin.body && back.foot === origin.foot, '⚠ back on the exact frame you left');
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
step('⚠⚠ while revealed a knob edits ONLY the step — the bank underneath gets no lock (CLIP K7 = Dir under the reveal\'s K7 = Prob)', () => {
    /* Found on the device 2026-09-22: turning a knob on the reveal ALSO locked
     * the hidden bank's knob at that step (ALL LANES Dir under drum Ratch), and
     * the lock then overrode every manual change to that param. */
    fresh(0); holdStep5(); right();
    locks.length = 0;
    cc(77, 1); cc(77, 1); cc(77, 1);
    assert(sets.some(x => x.startsWith('t0_c0_step_5_rand=')), 'control: the step\'s Prob was written, got ' + JSON.stringify(sets));
    assert(!sets.some(x => /playback_dir/.test(x)), 'the hidden CLIP Dir was written: ' + JSON.stringify(sets));
    assert(locks.length === 0, 'a lock was written on the hidden bank: ' + JSON.stringify(locks));
    release();
});
step('⚠ control: WITHOUT the reveal the same turn on a held step DOES lock CLIP Dir (the pin above has a subject)', () => {
    fresh(0); holdStep5(); S.tickCount += 20; globalThis.tick();
    locks.length = 0;
    cc(77, 1); cc(77, 1); cc(77, 1);
    assert(locks.some(l => /clip_playback_dir|playback_dir/.test(l)), 'no lock and no Dir write — the bank path is not reached, so the reveal pin proves nothing');
    release();
});
/* The held-step jog hint (Josh, 2026-09-22): a card saying what the jog does,
 * once a press becomes a hold by time. Asserted on what is DRAWN. */
const shows = () => { S.screenDirty = true; globalThis.tick(); return printed.includes('JOG RIGHT') && printed.includes('Edit step'); };
step('⚠ a held step shows the JOG RIGHT / Edit step card on a bank page', () => {
    fresh(1); holdStep5();
    assert(shows(), 'no hint card drawn after the hold, printed: ' + JSON.stringify(printed));
    release();
});
step('the hint goes for good once the jog is used — jogging back does not bring it back', () => {
    fresh(1); holdStep5(); assert(shows(), 'control: shown');
    right(); assert(!shows(), 'still up over the revealed step page');
    left();  assert(!shows(), 'came back after jogging left');
    release();
});
step('the hint goes the moment a knob is turned (it would sit over the cells being set)', () => {
    fresh(1); holdStep5(); assert(shows(), 'control: shown');
    cc(74, 1);
    assert(!shows(), 'still up after a knob turn');
    release();
});
step('the hint goes with the release', () => {
    fresh(1); holdStep5(); assert(shows(), 'control: shown');
    release();
    assert(!shows(), 'still up after the step was released');
});
step('no hint on the STEP bank itself — the jog does nothing there under a hold', () => {
    fresh(BANK_STEP); holdStep5();
    assert(!shows(), 'hint drawn on the STEP bank');
    release();
});
/* An EMPTY step has nothing on the step page (Josh, 2026-09-22: "should only
 * work when you're holding a step with a note"): no reveal, no card, no pill. */
function holdStep6() { note(STEP(6), 127); S.tickCount += 25; globalThis.tick(); }
function release6() { note(STEP(6), 0); globalThis.tick(); }
const jogPair = (h) => (h.find(p => p[0] === 'JOG') || [])[1] || null;
step('⚠ an EMPTY held step: jog right reveals nothing, no card, and the bank footer offers no jog', () => {
    fresh(1); holdStep6();
    assert(S.heldStep === 6 && S.heldStepNotes.length === 0, 'control: step 6 held and empty');
    assert(!shows(), 'hint card drawn on an empty step');
    assert(jogPair(rnd.bankPageHints(1)) === null, 'footer jog pair on an empty step: ' + JSON.stringify(rnd.bankPageHints(1)));
    right();
    assert(S.stepReveal === false, 'revealed an empty step');
    assert(S.activeBank === 1, 'the jog walked the bank under a hold');
    release6();
});
step('control: the SAME bank with a filled step does offer JOG STEP', () => {
    fresh(1); holdStep5();
    assert(jogPair(rnd.bankPageHints(1)) === 'STEP', 'got ' + JSON.stringify(rnd.bankPageHints(1)));
    release();
});
step('⚠ TRACK OVERVIEW (no bank card up): holding a filled step says JOG STEP, and the drawn footer changes', () => {
    fresh(1); S.bankCardLatched = false;
    const REF = S.tickCount + 250;               /* past the card's window: the footer is what is read */
    const idle = partsAt(REF);
    assert(jogPair(rnd.overviewHints()) === 'BANK', 'control: idle overview says JOG BANK');
    holdStep5();
    assert(jogPair(rnd.overviewHints()) === 'STEP', 'held overview says ' + JSON.stringify(rnd.overviewHints()));
    const held = partsAt(REF);
    assert(held.foot !== idle.foot, 'the drawn footer did not change under the hold');
    right();
    assert(S.stepReveal === true, 'and the jog does open the step page from the overview');
    release();
});
step('TRACK OVERVIEW + an EMPTY held step: no jog pair (JOG BANK would promise a walk the hold suspends)', () => {
    fresh(1); S.bankCardLatched = false; holdStep6();
    assert(jogPair(rnd.overviewHints()) === null, 'got ' + JSON.stringify(rnd.overviewHints()));
    release6();
});
step('⚠ the PRESS before it is a hold: both footers still say JOG BANK (a tap must not flicker them), then JOG STEP once it is a hold', () => {
    /* Device, 2026-09-22: for the first 250 ms of a hold the footer had NO jog
     * pair — a melodic step's notes are only read at the hold threshold. */
    fresh(1); S.bankCardLatched = false;
    note(STEP(5), 127); S.tickCount += 2; globalThis.tick();
    assert(S.heldStep === 5 && S.stepBtnPressedTick[S.heldStepBtn] >= 0, 'control: still inside the tap window');
    assert(jogPair(rnd.overviewHints()) === 'BANK', 'overview in the press window: ' + JSON.stringify(rnd.overviewHints()));
    assert(jogPair(rnd.bankPageHints(1)) === 'BANK', 'bank page in the press window: ' + JSON.stringify(rnd.bankPageHints(1)));
    S.tickCount += 25; globalThis.tick();
    assert(jogPair(rnd.overviewHints()) === 'STEP', 'overview once held: ' + JSON.stringify(rnd.overviewHints()));
    assert(jogPair(rnd.bankPageHints(1)) === 'STEP', 'bank page once held: ' + JSON.stringify(rnd.bankPageHints(1)));
    release();
});
step('⚠ a filled MELODIC step can be revealed inside the press window, before its notes are read', () => {
    fresh(1);
    note(STEP(5), 127); S.tickCount += 2;
    assert(S.heldStepNotes.length === 0, 'control: notes not read yet');
    cc(14, 1);
    assert(S.stepReveal === true, 'the jog refused a filled step because its notes were not read yet');
    globalThis.tick(); release();
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
