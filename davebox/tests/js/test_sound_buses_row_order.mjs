/* tests/js/test_sound_buses_row_order.mjs — the Buses row's POSITION in the
 * sound-menu pick list (Josh, 2026-09-15: "'Buses' row moves up to just below
 * Send B level, before Mute").
 *
 * buildPickRows() (ui_sound.mjs) used to push the SLOT_LEVELS rows (Volume,
 * Pan, Send A, Send B, Mute, Solo) as one block, then push 'modbus' after all
 * six, alongside the other doors (LFOs/Config/Presets). That put Buses below
 * Solo. This pins the corrected order: Volume, Pan, Send A, Send B, Buses,
 * Mute, Solo — Buses sits inline with the levels, not with the doors.
 *
 * The door only appears when ModBus.modBusDoorState() reads 'open' (the
 * module answered synth:split_voices with a real voice list) — the CONTROL
 * step below pins that a closed door still orders the remaining levels
 * correctly and never inserts a phantom row.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* ---- host surface ---- */
const VOICES = JSON.stringify([{ id: 'bd', label: 'Kick' }, { id: 'sd', label: 'Snare' }]);
let splitAnswer = '';   /* '' -> door closed (absent); VOICES -> door open */
const ANSWERS = {
    'synth:module': 'nusaw',
    /* capSends gates the Send A/Send B rows on — probeCaps reads this via
     * engineGetSlotParam('send_a'), which prefixes 'slot:'. */
    'slot:send_a': '0.5',
};
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k === 'string' && k.endsWith(':split_voices')) return splitAnswer;
    return (k in ANSWERS ? ANSWERS[k] : '');
};
globalThis.shadow_set_param = () => {};
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.host_write_file = () => true;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_system_cmd = () => 0;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.host_send_midi = () => {};
globalThis.move_midi_inject_to_move = () => {};
globalThis.host_set_led = () => {};
globalThis.set_led = () => {};
globalThis.host_get_setting = () => '';
globalThis.host_set_setting = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.set_pixel = () => {}; globalThis.flush_display = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

function enterTrack0() {
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
    GS.activeTrack = 0;
    snd.soundEnter(0, 0);
    snd.soundTick();       /* drains the pendingAction: names -> refreshBlockNames -> probeCaps + buildPickRows */
}

step('door OPEN: Buses sits right after Send B and right before Mute', () => {
    splitAnswer = VOICES;
    enterTrack0();
    const labels = snd.soundPickStateForTest().labels;
    const iSendB = labels.indexOf('Send B');
    const iBuses = labels.indexOf('Buses');
    const iMute  = labels.indexOf('Mute');
    const iSolo  = labels.indexOf('Solo');
    if (iSendB < 0 || iBuses < 0 || iMute < 0 || iSolo < 0)
        throw new Error('missing expected row(s): ' + JSON.stringify(labels));
    if (iBuses !== iSendB + 1)
        throw new Error('Buses is not immediately after Send B: ' + JSON.stringify(labels));
    if (iMute !== iBuses + 1)
        throw new Error('Mute is not immediately after Buses: ' + JSON.stringify(labels));
    if (iSolo !== iMute + 1)
        throw new Error('Solo is not immediately after Mute: ' + JSON.stringify(labels));
});

step('door CLOSED (absent): no Buses row, and the level block is still Volume..Solo in order', () => {
    splitAnswer = '';
    enterTrack0();
    const labels = snd.soundPickStateForTest().labels;
    if (labels.includes('Buses'))
        throw new Error('Buses row present with the door closed: ' + JSON.stringify(labels));
    const levels = labels.filter((l) => ['Volume', 'Pan', 'Send A', 'Send B', 'Mute', 'Solo'].includes(l));
    const want = ['Volume', 'Pan', 'Send A', 'Send B', 'Mute', 'Solo'];
    if (JSON.stringify(levels) !== JSON.stringify(want))
        throw new Error('level order: ' + JSON.stringify(levels));
});

}

main().then(() => process.exit(failed));
