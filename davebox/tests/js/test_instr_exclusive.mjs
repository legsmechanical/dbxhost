import './_bulk_get_stub.mjs';
/* tests/js/test_instr_exclusive.mjs — ONE dAVEBOx TRACK PER MOVE INSTRUMENT
 * (Josh, 2026-09-13: "we should never allow a track to address a move track
 * that's already addressed").
 *
 * Three doors, all pinned: the PURE rule (moveInstrOwner / moveInstrDuplicates
 * / instrPickerRows with channels), the GUARD behind every choice
 * (applyInstrChoice refuses and writes nothing), and the PICKER a hand uses —
 * driven through the real gesture (sound menu → Shift+click → the list), where
 * a taken Move instrument is a NOTE row naming its owner that the jog steps
 * over. A MIDI track FOLLOWING the owner is still allowed: it plays through
 * the owner's bus. Existing duplicates are REPORTED on load, never repaired. */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
const writes = [];
globalThis.host_module_set_param = (k, v) => { writes.push(String(k) + '=' + String(v)); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true;
globalThis.shadow_get_params = () => '';
globalThis.shadow_save_state_now = () => true;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_set_ui_flags = () => 0;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {}; globalThis.host_close_service = () => {};
globalThis.host_seed_module_defaults = () => [0, 0];
globalThis.host_autosave_hold = () => {};
for (const fn of ['host_send_midi', 'move_midi_inject_to_move', 'host_set_led', 'set_led',
                  'host_get_setting', 'host_set_setting', 'move_midi_internal_send', 'move_midi_external_send',
                  'host_vol_block', 'host_edit_cc_block', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'host_trace_begin', 'host_trace_end', 'host_canvas_input',
                  'host_suspend_overtake', 'host_hide_module', 'host_exit_module', 'host_load_module',
                  'host_module_init', 'host_list_dir', 'host_stat', 'host_get_bpm', 'host_get_clock_status',
                  'host_pad_observe', 'host_claim_ccs', 'host_release_ccs', 'host_set_button_led', 'host_display_flush'])
    globalThis[fn] = () => (fn.indexOf('get') >= 0 ? '' : 0);
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const C = await import('../../ui/ui_constants.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
const { MoveNoteSession } = C;

/* ---- the PURE rule ---------------------------------------------------- */
step('moveInstrOwner: the track routed to Move on that channel, never itself; none = -1', () => {
    const routes = [1, 0, 1, 2, 3, 0, 0, 0], chans = [1, 1, 3, 3, 1, 1, 1, 1];
    assert(C.moveInstrOwner(routes, chans, 0, 5) === 0, 'Move 1 is track 1\'s');
    assert(C.moveInstrOwner(routes, chans, 0, 0) === -1, '…but not from track 1\'s own point of view');
    assert(C.moveInstrOwner(routes, chans, 2, 5) === 2, 'Move 3 is track 3\'s');
    assert(C.moveInstrOwner(routes, chans, 1, 5) === -1, 'Move 2 is free');
    assert(C.moveInstrOwner(routes, chans, 0, 5) === 0 && C.moveInstrOwner([2, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1, 1], 0, 5) === -1,
           'a MIDI track on channel 1 does not own Move 1 (route 2 is not Move)');
});
step('moveInstrDuplicates: every Move instrument with more than one track, reported not repaired', () => {
    const d = C.moveInstrDuplicates([1, 1, 1, 0, 1, 1, 0, 0], [1, 1, 2, 2, 4, 4, 4, 4]);
    assert(JSON.stringify(d) === JSON.stringify([[0, [0, 1]], [3, [4, 5]]]), 'got ' + JSON.stringify(d));
    assert(C.moveInstrDuplicates([1, 1, 1, 1], [1, 2, 3, 4]).length === 0, 'four tracks on four instruments: clean');
});
step('instrPickerRows: a taken Move row carries its owner; the free ones do not; without channels nothing is taken', () => {
    const rows = C.instrPickerRows([1, 0, 1, 0, 0, 0, 0, 0], 1, [], [1, 1, 3, 1, 1, 1, 1, 1]);
    const move = rows.filter(r => typeof r.v === 'number' && r.v >= 0 && r.v <= C.INSTR_MOVE_MAX);
    assert(move.length === 4, 'four Move rows');
    assert(move[0].taken === 0 && move[2].taken === 2, 'Move 1 → T1, Move 3 → T3: ' + JSON.stringify(move));
    assert(move[1].taken === undefined && move[3].taken === undefined, 'Move 2 and 4 free');
    const rows0 = C.instrPickerRows([1, 0, 1, 0, 0, 0, 0, 0], 1, []);
    assert(rows0.every(r => r.taken === undefined), 'no channels → nothing taken (the old callers)');
    const self = C.instrPickerRows([1, 0, 1, 0, 0, 0, 0, 0], 0, [], [1, 1, 3, 1, 1, 1, 1, 1]);
    assert(self.find(r => r.v === 0).taken === undefined, 'a track\'s OWN Move instrument is offered to it');
});

/* ---- the GUARD ---------------------------------------------------------- */
step('applyInstrChoice refuses a taken Move instrument and writes NOTHING; a free one goes through', () => {
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackChannel[t] = 1; S.trackMidiTo[t] = 0; }
    S.trackRoute[0] = 1; S.trackChannel[0] = 2;             /* track 1 owns Move 2 */
    writes.length = 0;
    const r = bridge.applyInstrChoice(4, 1);                /* track 5 wants Move 2 */
    assert(r === false, 'refused');
    assert(writes.length === 0, 'nothing written: ' + JSON.stringify(writes));
    assert(S.trackRoute[4] === 0 && S.trackChannel[4] === 1, 'track 5 unchanged');
    assert(bridge.applyInstrChoice(4, 2) === true, 'Move 3 is free');
    assert(S.trackRoute[4] === 1 && S.trackChannel[4] === 3, 'track 5 is on Move 3');
    assert(writes.some(w => w === 't4_route=move') && writes.some(w => w === 't4_channel=3'), 'written: ' + JSON.stringify(writes));
    assert(bridge.applyInstrChoice(0, 1) === true, 'the OWNER re-choosing its own instrument is fine');
});
step('requestInstrChange refuses a taken Move BEFORE the type-change confirm (no modal, nothing cleared)', () => {
    S.trackRoute[1] = 0;                                    /* track 2: a chain track wanting Move 2 */
    S.confirmTypeChange = null;
    const r = snd.requestInstrChange(1, 1);
    assert(r === false && !S.confirmTypeChange && S.trackRoute[1] === 0, 'refused with no modal: ' + JSON.stringify([r, !!S.confirmTypeChange, S.trackRoute[1]]));
});
step('a MIDI track may still FOLLOW the owner (it plays through the owner\'s bus)', () => {
    writes.length = 0;
    bridge.applyInstrChoice(6, C.INSTR_TRACK + 0);          /* track 7 follows track 1 */
    assert(S.trackRoute[6] === 2 && S.trackMidiTo[6] === 1, 'following: ' + S.trackRoute[6] + '/' + S.trackMidiTo[6]);
});

/* ---- the PICKER, through the real gesture -------------------------------- */
function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
snd.soundSetGeneratorScanForTest(() => [{ id: 'nusaw', name: 'NuSaw' }]);
function openPicker() {
    cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
    ticks(6);
    cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0);
    ticks(4);
    const p = snd.soundEnumPickForTest();
    if (!p) throw new Error('the Instrument picker did not open');
    return p;
}
step('setup: init; track 1 owns Move 1, track 3 owns Move 3; the active track is 5 (a chain track)', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackChannel[t] = 1; S.trackMidiTo[t] = 0; }
    S.trackRoute[0] = 1; S.trackChannel[0] = 1;
    S.trackRoute[2] = 1; S.trackChannel[2] = 3;
    S.activeTrack = 4;
    ticks(8);
});
step('⭐ the picker shows Move 1 and Move 3 as NOTE rows naming their owners, Move 2 and 4 as choices', () => {
    const p = openPicker();
    const labels = p.options.map(o => (o && o.note) ? 'note:' + o.note : (o && o.divider) ? '-' : String(o));
    assert(labels.indexOf('note:Move 1 - T1') >= 0, 'Move 1 is a note with its owner: ' + JSON.stringify(labels));
    assert(labels.indexOf('note:Move 3 - T3') >= 0, 'Move 3 too');
    assert(labels.indexOf('Move 2') >= 0 && labels.indexOf('Move 4') >= 0, 'Move 2 and 4 are plain choices');
    assert(labels.indexOf('Move 1') < 0, 'Move 1 is NOT also offered as a choice');
});
step('…the jog steps OVER a taken row, so it can never be selected', () => {
    const p = snd.soundEnumPickForTest();
    const i1 = p.options.findIndex(o => o && o.note === 'Move 1 - T1');
    const i2 = p.options.indexOf('Move 2');
    assert(i1 >= 0 && i2 === i1 + 1, 'Move 1 (note) sits right above Move 2: ' + i1 + '/' + i2);
    /* Walk to the top, then down one at a time: the cursor must land on Move 2
     * without ever resting on the note. */
    let guard = 0;
    while (snd.soundEnumPickForTest().sel > 0 && guard++ < 80) cc(14, 127);
    const visited = [];
    guard = 0;
    while (snd.soundEnumPickForTest().sel < i2 && guard++ < 80) { cc(14, 1); visited.push(snd.soundEnumPickForTest().sel); }
    assert(visited.indexOf(i1) < 0, 'the cursor rested on the note row: ' + JSON.stringify(visited));
    assert(snd.soundEnumPickForTest().sel === i2, 'landed on Move 2');
    cc(9, 127); cc(9, 0); ticks(2);                        /* Back: leave the picker */
});
step('the OWNER opening the picker sees its own Move instrument as a choice (it is not taken from itself)', () => {
    S.activeTrack = 0; ticks(4);
    const p = openPicker();
    assert(p.options.indexOf('Move 1') >= 0, 'track 1 is offered Move 1: ' + JSON.stringify(p.options.filter(o => typeof o === 'string' && /^Move/.test(o))));
    assert(p.options.some(o => o && o.note === 'Move 3 - T3'), 'and still sees Move 3 as taken');
    cc(9, 127); cc(9, 0); ticks(2);
});

if (failed) { console.error('test_instr_exclusive: FAILED'); process.exit(1); }
console.log('test_instr_exclusive: all ok');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
