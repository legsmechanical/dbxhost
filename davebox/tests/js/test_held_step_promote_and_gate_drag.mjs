import './_bulk_get_stub.mjs';
/* tests/js/test_held_step_promote_and_gate_drag.mjs — two pins on the held
 * step, end to end through the real dispatch (spec §2, "the held step"):
 *
 *   1. PROMOTE-ON-FIRST-TURN: a knob turn while a step is down promotes the
 *      press to a hold on every bank. A tap on a filled step CLEARS it, so a
 *      fast press-turn-release must never read as a tap.
 *   2. CROSS-PAGE GATE-DRAG: hold a step, page forward with Right, tap a step
 *      on the new page — the gate spans from the held step (absolute) through
 *      the tapped step (absolute). Paging while held is how a note is extended
 *      past the page (Josh, 2026-09-02), so it is pinned as a feature. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
async function step(label, fn) { try { await fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
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
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const STEP = (i) => 16 + i;
const T = 0, AC = 0;
function fresh() {
    sets.length = 0;
    S.pendingDefaultSetParams.length = 0;
    S.activeBank = 0; S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = [];
    S.stepHoldPromote = false; S.stepWasEmpty = false; S.stepWasHeld = false;
    S.playing = false; S.trackQueuedClip[T] = -1; S.trackActiveClip[T] = AC;   /* effectiveClip(T) === AC */
    S.trackCurrentPage[T] = 0; S.clipLength[T][AC] = 32; S.clipTPS[T][AC] = 24;
    S.clipLoopStart[T][AC] = 0; S.lastPlayedNote = 60;
    for (let i = 0; i < 64; i++) S.clipSteps[T][AC][i] = 0;
    S.clipSteps[T][AC][5] = 1;                      /* step 5 holds a note */
    S.clipNonEmpty[T][AC] = true;
    S.tickCount += 100;
}
const wrote = (frag) => sets.some(x => x.includes(frag)) ||
                        S.pendingDefaultSetParams.some(p => p.key.includes(frag));

/* ---- 1. a fast press-turn-release does NOT clear the step -------------- */
await step('control: a plain TAP on a filled step clears it (the sharp edge the promotion guards)', () => {
    fresh();
    note(STEP(5), 127); S.tickCount += 2; globalThis.tick(); note(STEP(5), 0); globalThis.tick();
    assert(wrote('_step_5_clear'), 'expected the tap to clear step 5');
});
await step('⚠ press, turn K4 inside the tap window, release: the step SURVIVES (the turn promoted the press to a hold)', () => {
    fresh();
    note(STEP(5), 127); S.tickCount += 2;
    cc(74, 1);                                      /* one detent of Vel, well inside 200 ms */
    assert(S.stepHoldPromote === true, 'the turn set stepHoldPromote');
    globalThis.tick();                              /* the tick consumes it: tap window closed */
    assert(S.stepBtnPressedTick[5] === -1, 'tap window closed by the promotion');
    assert(S.heldStepNotes.length === 1 && S.heldStepNotes[0] === 60, 'and the step\'s notes were read');
    note(STEP(5), 0); globalThis.tick();
    assert(!wrote('_step_5_clear'), 'step 5 was NOT cleared on release');
});
await step('promotion applies on a bank whose knobs decline the step too (a turn is never a tap)', () => {
    fresh(); S.activeBank = 1;                      /* NOTE FX: track settings */
    note(STEP(5), 127); S.tickCount += 2; cc(71, 1); globalThis.tick();
    note(STEP(5), 0); globalThis.tick();
    assert(!wrote('_step_5_clear'), 'step 5 survived');
});

/* ---- 2. gate-drag across a page boundary ------------------------------- */
await step('⚠ hold step 5 (page 0), Right, tap step 3 of page 1: gate = steps 5..19 inclusive (absolute)', async () => {
    fresh();
    note(STEP(5), 127); S.tickCount += 25; globalThis.tick();      /* past the hold threshold */
    assert(S.heldStepNotes.length === 1, 'held past threshold with notes read');
    S.clipLength[T][AC] = 32;                                      /* the tick's sync re-derives it from the stub */
    cc(63, 127); cc(63, 0);                                        /* Right: page forward */
    assert(S.trackCurrentPage[T] === 1, 'paged to page 1 while holding');
    assert(S.heldStep === 5, 'the held step is still absolute step 5');
    note(STEP(3), 127);                                            /* tap on the NEW page */
    const g = sets.find(x => x.startsWith('t0_c0_step_5_gate='));
    assert(g, 'a gate write landed on the HELD step');
    assert(g === 't0_c0_step_5_gate=' + (15 * 24), 'span 5..19 = 15 steps x 24 tps, got ' + g);
    note(STEP(3), 0); note(STEP(5), 0); globalThis.tick();
    assert(!wrote('_step_5_clear') && !wrote('_step_19_'), 'neither step was cleared or toggled');
});

if (failed) { console.log('FAIL: held step promote + gate-drag'); process.exit(1); }
console.log('PASS: a turn while a step is down is a hold; gate-drag spans pages in absolute steps');
}
main().catch(e => { console.error(e); process.exit(1); });
