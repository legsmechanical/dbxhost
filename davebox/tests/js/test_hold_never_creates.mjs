import './_bulk_get_stub.mjs';
/* tests/js/test_hold_never_creates.mjs — spec §2 (Josh, 2026-09-02): "holding a
 * step should not add a note unless I've selected while the step is held."
 *
 *   - an empty step held past the threshold stays EMPTY (melodic and drum)
 *   - a pad press while it is held CREATES the note — and is itself the hold,
 *     so the release cannot tap-assign or clear over it
 *   - drum: a velocity-zone pad while holding an empty step creates the hit
 *     at that velocity
 *   - a tap on an empty step still places the last note (unchanged) */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
let notesOnStep = '';
globalThis.host_module_get_param = (k) => {
    if (k.endsWith('_notes')) return notesOnStep;
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
const { computePadNoteMap } = await import('../../ui/ui_drummodel.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const STEP = (i) => 16 + i;
const PAD = (i) => 68 + i;
const T = 0, AC = 0;
const wrote = (frag) => sets.some(x => x.includes(frag)) ||
                        S.pendingDefaultSetParams.some(p => p.key.includes(frag));
function fresh(drum) {
    sets.length = 0; S.pendingDefaultSetParams.length = 0; notesOnStep = '';
    S.activeBank = 0; S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = [];
    S.stepHoldPromote = false; S.stepWasEmpty = false; S.stepWasHeld = false;
    S.playing = false; S.trackQueuedClip[T] = -1; S.trackActiveClip[T] = AC;
    S.trackPadMode[T] = drum ? 1 : 0;
    S.trackCurrentPage[T] = 0; S.drumStepPage[T] = 0;
    S.clipLength[T][AC] = 16; S.clipTPS[T][AC] = 24; S.lastPlayedNote = 60;
    for (let i = 0; i < 64; i++) S.clipSteps[T][AC][i] = 0;
    S.clipNonEmpty[T][AC] = false;
    S.activeDrumLane[T] = 0; S.drumLanePage[T] = 0;
    S.drumLaneSteps[T][0] = new Array(64).fill('0');
    S.drumLaneHasNotes[T][0] = false;
    S.noNoteFlashEndTick = -1;
    S.liveActiveNotes.clear();
    computePadNoteMap();
    S.tickCount += 100;
}

/* ---- melodic ------------------------------------------------------------- */
step('⚠ an empty melodic step held past the threshold stays EMPTY — no note written, knobs have nothing', () => {
    fresh(false);
    note(STEP(3), 127); S.tickCount += 25; globalThis.tick(); globalThis.tick();
    assert(S.stepWasHeld === true, 'the hold registered');
    assert(!wrote('_step_3_'), 'nothing was written to step 3, got ' + JSON.stringify(sets));
    assert(S.heldStepNotes.length === 0, 'heldStepNotes empty');
    assert(S.noNoteFlashEndTick < 0, 'and no NO NOTE flash for a hold');
    note(STEP(3), 0); globalThis.tick();
    assert(!wrote('_step_3_toggle') && !wrote('_step_3_clear'), 'release wrote nothing either');
});
step('⚠ a pad press while the empty step is held CREATES the note at that pitch', () => {
    fresh(false);
    note(STEP(3), 127); S.tickCount += 25; globalThis.tick();
    const padIdx = S.padNoteMap.findIndex(n => n !== 0xFF);
    const pitch = S.padNoteMap[padIdx] + S.trackOctave[T] * 12;
    notesOnStep = String(pitch);
    note(PAD(padIdx), 100);
    const w = sets.find(x => x.startsWith('t0_c0_step_3_toggle='));
    assert(w && w.startsWith('t0_c0_step_3_toggle=' + pitch + ' '), 'the pad wrote the note, got ' + w);
    assert(sets.indexOf('t0_c0_undo_checkpoint=1') >= 0 && sets.indexOf('t0_c0_undo_checkpoint=1') < sets.indexOf(w),
           'the creation took the hold\'s ONE undo checkpoint first');
    assert(S.heldStepNotes.length === 1 && S.heldStepNotes[0] === pitch, 'heldStepNotes follows');
    note(PAD(padIdx), 0); note(STEP(3), 0); globalThis.tick();
    assert(sets.filter(x => x.startsWith('t0_c0_step_3_')).length === 1, 'release added nothing more');
});
step('⚠ a pad press INSIDE the tap window is the creation too — the release does not toggle it back off', () => {
    fresh(false);
    note(STEP(3), 127); S.tickCount += 2;
    const padIdx = S.padNoteMap.findIndex(n => n !== 0xFF);
    const pitch = S.padNoteMap[padIdx] + S.trackOctave[T] * 12;
    notesOnStep = String(pitch); S.lastPlayedNote = pitch;
    note(PAD(padIdx), 100); note(PAD(padIdx), 0);
    assert(S.stepBtnPressedTick[3] === -1, 'the pad press closed the tap window');
    note(STEP(3), 0); globalThis.tick();
    assert(sets.filter(x => x.startsWith('t0_c0_step_3_toggle=')).length === 1, 'exactly ONE toggle: the creation');
});
step('control: a TAP on an empty step still places the last note (unchanged)', () => {
    fresh(false);
    note(STEP(3), 127); S.tickCount += 2; globalThis.tick(); note(STEP(3), 0); globalThis.tick();
    assert(wrote('t0_c0_step_3_toggle=60'), 'the tap placed the last note');
});

/* ---- drum ----------------------------------------------------------------- */
step('⚠ an empty DRUM step held past the threshold stays empty', () => {
    fresh(true);
    note(STEP(3), 127); S.tickCount += 25; globalThis.tick(); globalThis.tick();
    assert(S.stepWasHeld === true, 'the hold registered');
    assert(!wrote('_step_3_'), 'nothing written, got ' + JSON.stringify(sets));
    assert(S.heldStepNotes.length === 0, 'no hit');
    note(STEP(3), 0); globalThis.tick();
    assert(!wrote('_step_3_toggle'), 'release created nothing');
});
step('⚠ a velocity-zone pad while holding the empty drum step CREATES the hit at that velocity', () => {
    fresh(true);
    note(STEP(3), 127); S.tickCount += 25; globalThis.tick();
    note(PAD(4), 100);                                  /* right half, row 0, zone 0 */
    const w = sets.find(x => x.startsWith('t0_l0_step_3_toggle='));
    assert(w, 'the hit was created, got ' + JSON.stringify(sets));
    assert(sets.indexOf('t0_drum_undo_checkpoint=1') >= 0 && sets.indexOf('t0_drum_undo_checkpoint=1') < sets.indexOf(w),
           'the drum checkpoint (every lane of the clip) came first');
    assert(S.heldStepNotes.length === 1, 'and the hold now has the hit');
    assert(S.drumLaneSteps[T][0][3] === '1', 'mirror follows');
    note(PAD(4), 0); note(STEP(3), 0); globalThis.tick();
    assert(sets.filter(x => x.startsWith('t0_l0_step_3_')).filter(x => !x.includes('_vel=')).length === 1,
           'release did not toggle it back, got ' + JSON.stringify(sets));
});

if (failed) { console.log('FAIL: hold never creates'); process.exit(1); }
console.log('PASS: a hold never creates a note; a pad press while held does');
}
main().catch(e => { console.error(e); process.exit(1); });
