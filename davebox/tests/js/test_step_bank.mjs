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
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = px; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_STEP, BANK_SOUND, PAD_MODE_DRUM, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
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
/* Snapshot the actual pixels (not just a hash), for the pins that need to
 * look at a specific region of the cell area rather than just "it changed". */
function snapAt(tick) { const keep = S.tickCount; S.tickCount = tick; S.screenDirty = true; globalThis.tick(); const s = fb.slice(); S.tickCount = keep; return s; }
/* Count lit pixels in rows [y0, y1) — used to check a row-band of the cell
 * area (above the footer, below the header rule) for content. */
function litInRows(snap, y0, y1) { let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < 128; x++) if (snap[y * 128 + x]) n++; return n; }
step('⚠ a held step does NOT change the screen on another bank (NOTE FX card, pixel-identical)', () => {
    fresh(1); S.bankCardLatched = true;
    /* Read past the held-step jog hint (a timed card, STEP_JOG_HINT_MS, pinned
     * in test_step_reveal): what this pins is the PAGE under it. */
    const ref = S.tickCount + 250;
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

/* Josh, 2026-09-15: "knobs should only appear on oled when a step is held.
 * otherwise it should read 'Hold step to edit'." — no step held → no cells,
 * one centred notice line. A step held but EMPTY still shows the dash cells
 * (spec §2): the two idle states must render differently, and only the
 * held-empty one fills the knob rows. */
const KNOB_TOP = 10, KNOB_BOT = 57; /* just below the header's solid rule (y=9) .. MV_FOOTER_Y */
step('⚠ the STEP bank at rest (nothing held) shows NO cells — just the notice line, cell area otherwise blank', () => {
    fresh(BANK_STEP); S.bankCardLatched = true;
    const ref = S.tickCount + 50;
    const snap = snapAt(ref);
    const litRows = litInRows(snap, KNOB_TOP, KNOB_BOT);
    assert(litRows > 0, 'the cell area draws SOMETHING (the notice line)');
    /* The notice is one line at y=30 (drawStepEditKitPage): everything else
     * in the cell area (where the dash cells would otherwise sit) is blank. */
    const litOutsideNotice = litInRows(snap, KNOB_TOP, 30) + litInRows(snap, 31, KNOB_BOT);
    assert(litOutsideNotice === 0, 'no cell content anywhere in the knob rows besides the one notice line, got ' + litOutsideNotice + ' px');
});
step('⚠ a held EMPTY step still shows the dash cells (not the "hold step" notice)', () => {
    fresh(BANK_STEP); S.bankCardLatched = true;
    const ref = S.tickCount + 50;
    /* idle (nothing held) reference frame */
    const idleSnap = snapAt(ref);
    const idleLit = litInRows(idleSnap, KNOB_TOP, KNOB_BOT);
    /* now hold an EMPTY step (no notes ever placed on it) */
    note(STEP(2), 127); S.tickCount += 25; globalThis.tick();
    assert(S.heldStep >= 0, 'a step is now held');
    assert(S.heldStepNotes.length === 0, 'the held step has no notes (empty)');
    const heldSnap = snapAt(ref);
    const heldLit = litInRows(heldSnap, KNOB_TOP, KNOB_BOT);
    assert(heldLit > idleLit, 'the held-empty dash cells light MORE of the cell area than the idle one-line notice, got held=' + heldLit + ' idle=' + idleLit);
    /* and it is NOT just the same notice line — the widget rows (outside y=30) are lit */
    const heldOutsideNotice = litInRows(heldSnap, KNOB_TOP, 30) + litInRows(heldSnap, 31, KNOB_BOT);
    assert(heldOutsideNotice > 0, 'held-empty draws real dash cells in the widget rows, not just the notice line');
    note(STEP(2), 0); globalThis.tick();
});

if (failed) { console.log('FAIL: STEP bank'); process.exit(1); }
console.log('PASS: the STEP bank — a held step redirects the knobs there and nowhere else');
}
main().catch(e => { console.error(e); process.exit(1); });
