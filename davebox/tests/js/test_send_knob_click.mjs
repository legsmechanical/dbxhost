import './_bulk_get_stub.mjs';
/* tests/js/test_send_knob_click.mjs — TOUCH A SEND KNOB AND CLICK: that send's
 * effects, from the MIX bank and from the session mixer.
 *
 * Josh, 2026-10-01: "Add touch click send a/b knob support in mix bank and
 * session mixer to jump to respective send effects menu (just like shif+send in
 * track configuration menu) they get the click in widget corners" — the corner
 * brackets a touch-clickable widget wears.
 *
 * Driven through onMidiMessageInternal + the real tick; asserted on what the
 * screen holds (the bus open, the view, the brackets on the drawn cells, the
 * footer). Back returns to where the click came from. Also the Move track's
 * Shift+click send door, whose Back lost the Move bus. */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }
const J = JSON.stringify;

const ENGINE = {
    'synth:module': 'nusaw',
    'slot:volume': '1.000', 'slot:pan': '0.500',
    'slot:send_a': '0.250', 'slot:send_b': '0.100',
    'slot:muted': '0', 'slot:soloed': '0',
};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, key) => (ENGINE[key] != null ? ENGINE[key] : '');
globalThis.shadow_set_param = (slot, key, v) => { ENGINE[key] = String(v); return 1; };
globalThis.shadow_get_params = () => ''; globalThis.shadow_set_params = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.host_autosave_hold = () => {};
globalThis.shadow_save_state_now = () => 1;
globalThis.host_state_subdir = () => 'dAVEBOx';

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_SOUND } = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');
const movy = await import('../../ui/ui_movy.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 500; S.pendingDspSync = 0; S.pendingSetLoad = false; S.currentSetUuid = 'send-click-uuid';

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, d1, on ? 127 : 0]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const jog   = (d) => cc(14, d > 0 ? 1 : 127);
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const VIEW_BLOCKS = 0, VIEW_PROMPT = 18;
const bus  = () => snd.soundBusForTest();
const view = () => snd.soundViewForTest();
/* The cells the screen draws, as drawKitCells receives them (brackets = opens). */
const pills = () => J(movy.kitHintsForTest());
const put = (t, bank, latched) => {
    if (snd.soundOpen()) snd.soundExit();
    S.sessionView = false; S.sessMixerLatched = false;
    S.activeTrack = t; S.activeBank = bank; S.trackActiveBank[t] = bank; S.bankCardLatched = !!latched;
    ticks(6);
};
ticks(3);

step('setup: the MIX bank, latched, on a Schwung track with sends', () => {
    put(2, BANK_SOUND, true);
    assert(snd.soundOpen() && view() === VIEW_PROMPT, 'not on the MIX card: open ' + snd.soundOpen() + ' view ' + view());
});

step('⭐ MIX: Send A and Send B wear the click brackets, Volume and Pan do not', () => {
    const cells = snd.soundLevelCellsForTest();
    assert(cells[2].opens && cells[3].opens, 'sends without brackets: ' + J(cells.map(c => !!c.opens)));
    assert(!cells[0].opens && !cells[1].opens, 'Vol/Pan bracketed: ' + J(cells.map(c => !!c.opens)));
});

step('⭐⭐ MIX latched: touch Send A, the footer says CLK SEND A; click → SEND FX A', () => {
    put(2, BANK_SOUND, true);
    note(2, true); ticks(1);
    render.drawUI();
    assert(pills() === J([['CLK', 'SEND A'], ['BACK', 'OUT']]), 'footer ' + pills());
    click(); note(2, false); ticks(4);
    assert(bus() && bus().id === 'sendA' && view() === VIEW_BLOCKS, 'landed on ' + J(bus() && bus().id) + ' view ' + view());
});

step('⭐⭐ …and Back returns to the MIX card', () => {
    back(); ticks(4);
    assert(!bus() || bus().kind === 'move', 'still on ' + J(bus() && bus().id));
    assert(view() === VIEW_PROMPT && S.activeBank === BANK_SOUND, 'came back to view ' + view() + ' bank ' + S.activeBank);
});

step('⭐ MIX at REST (a touch peek, not latched): touch Send B and click → SEND FX B', () => {
    put(2, BANK_SOUND, false);
    assert(snd.soundOpen() && snd.soundResting(), 'rig: not resting on MIX');
    note(3, true); ticks(1);
    click(); note(3, false); ticks(4);
    assert(bus() && bus().id === 'sendB', 'landed on ' + J(bus() && bus().id) + ' view ' + view());
    back(); ticks(4);
    assert(view() === VIEW_PROMPT, 'Back went to view ' + view());
});

step('control: touch Volume and click on MIX does nothing', () => {
    put(2, BANK_SOUND, true);
    note(0, true); ticks(1);
    click(); note(0, false); ticks(4);
    assert(!bus() && view() === VIEW_PROMPT, 'moved to ' + J(bus() && bus().id) + ' view ' + view());
});

/* ---- the session mixer ---- */
function sessionMixerOn(mode) {
    if (snd.soundOpen()) snd.soundExit();
    S.sessionView = true; S.sessMixerLatched = true; S.sessKnobMode = mode;
    for (let t = 0; t < 8; t++) { S.sessVolBus[t] = 1; S.sessVolLevel[t] = 0.3; }
    ticks(4);
}

step('⭐ session mixer SEND A page: the track cells wear the brackets; the footer names the send under a touch', () => {
    sessionMixerOn(2);
    assert(render.sessMixerCellOpens(0) && render.sessMixerCellOpens(7), 'cells not clickable');
    note(0, true); ticks(1);
    render.drawUI();
    assert(pills() === J([['CLK', 'SEND A'], ['BACK', 'OUT']]), 'footer ' + pills());
    note(0, false); ticks(1);
});

step('⭐⭐ session mixer: touch a track\'s Send A, click → SEND FX A; Back → the SEND A page again', () => {
    sessionMixerOn(2);
    note(4, true); ticks(1);
    click(); note(4, false); ticks(4);
    assert(snd.soundActive() && bus() && bus().id === 'sendA', 'landed on ' + J(bus() && bus().id));
    back(); ticks(4);
    assert(!snd.soundActive() && S.sessionView && S.sessMixerLatched && S.sessKnobMode === 2,
           'came back to ' + J({ active: snd.soundActive(), sv: S.sessionView, latched: S.sessMixerLatched, mode: S.sessKnobMode }));
});

step('session mixer SEND B page → SEND FX B', () => {
    sessionMixerOn(3);
    note(1, true); ticks(1);
    click(); note(1, false); ticks(4);
    assert(bus() && bus().id === 'sendB', 'landed on ' + J(bus() && bus().id));
    back(); ticks(4);
    assert(S.sessKnobMode === 3, 'mode ' + S.sessKnobMode);
});

step('control: the PAN page and a send with nothing to mix take no click', () => {
    sessionMixerOn(1);
    assert(!render.sessMixerCellOpens(0), 'Pan clickable');
    note(0, true); ticks(1); click(); note(0, false); ticks(4);
    assert(!snd.soundActive(), 'Pan click opened ' + J(bus() && bus().id));
    sessionMixerOn(2);
    S.sessVolBus[5] = 0; S.trackRoute[5] = 2;      /* a MIDI track: no send */
    assert(!render.sessMixerCellOpens(5), 'a MIDI track\'s blank send is clickable');
    note(5, true); ticks(1); click(); note(5, false); ticks(4);
    assert(!snd.soundActive(), 'a blank send opened ' + J(bus() && bus().id));
    S.trackRoute[5] = 0;
});

step('⭐ a MOVE track: Shift+click its Send A row, then Back, lands on its MOVE bus menu (it lost the bus before)', () => {
    if (snd.soundOpen()) snd.soundExit();
    S.sessionView = false; S.sessMixerLatched = false;
    S.trackChannel[3] = 1; S.trackRoute[3] = 1;       /* ROUTE_MOVE -> move_fx:1 */
    S.activeTrack = 3;
    snd.soundEnterMove(3); ticks(4);
    assert(snd.soundOpen(), 'rig: not open on the Move track');
    snd.soundShowMenu(); ticks(3);                      /* the track's menu */
    for (let g = 0; ; g++) {
        const st = snd.soundPickStateForTest();
        if (st.labels[st.row] === 'Send A') break;
        if (g > 30) throw new Error('rig: no Send A row on the Move track: row ' + st.row + ' view ' + view() + ' active ' + snd.soundActive() + ' ' + J(st.labels));
        jog(1); ticks(1);
    }
    const moveBus = bus();
    assert(moveBus && moveBus.kind === 'move', 'rig: not on the Move bus: ' + J(moveBus && moveBus.id));
    cc(49, 127); click(); cc(49, 0); ticks(4);
    assert(bus() && bus().id === 'sendA', 'Shift+click landed on ' + J(bus() && bus().id));
    back(); ticks(4);
    assert(bus() && bus().kind === 'move', 'Back landed on bus ' + J(bus() && bus().id) + ', wanted the Move bus');
    const st = snd.soundPickStateForTest();
    assert(st.labels[st.row] === 'Send A', 'cursor on ' + st.labels[st.row]);
    S.trackRoute[3] = 0;
});

if (failed) { console.log('FAIL: test_send_knob_click'); process.exit(1); }
console.log('PASS: test_send_knob_click');
}
main().catch(e => { console.error(e); process.exit(1); });
