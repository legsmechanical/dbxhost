/* tests/js/test_canvas_transport.mjs — a full-screen module canvas leaves the
 * TRANSPORT alone.
 *
 * From the device (DR32's sample browser open under dAVEBOx): Play and Record
 * did nothing. The canvas screen handed every CC to the module except a short
 * list, Play and plain Record were not on it, and dAVEBOx is overtake-mode, so
 * the press reached neither dAVEBOx's transport nor Move. Driven through the
 * real input path (onMidiMessageInternal), with the jog as the control: it
 * must still belong to the canvas.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function step(l, fn) { try { fn(); console.log(`  ok   — ${l}`); } catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display', 'clear_screen',
    'print', 'fill_rect', 'draw_rect', 'set_pixel', 'move_midi_internal_send', 'set_led', 'host_open_service',
    'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable',
    'host_send_midi', 'move_midi_inject_to_move'])
    globalThis[fn] = () => 0;
globalThis.text_width = (t) => String(t).length * 6;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];
globalThis.host_module_get_param = () => '';
const writes = [];
globalThis.host_module_set_param = (k, v) => { writes.push([String(k), String(v)]); };
globalThis.host_module_set_params = () => true;

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const snd = await import('../../ui/ui_sound.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const { MoveNoteSession } = await import('../../ui/ui_constants.mjs');
    const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));

    /* the module's canvas records what reaches it */
    const got = [];
    const overlay = { onMidi: (ctx, msg) => { got.push(msg.data); return true; }, draw: () => {} };
    const io = { loadOverlay: () => ({ overlay }), getParam: () => '', setParam: () => {}, getValue: () => '', setValue: () => {} };

    step('setup: sound mode open, a full-screen canvas up', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.activeTrack = 4;
        cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
        ticks(6);
        assert(snd.soundOpenCanvasForTest({ key: 'browser', type: 'canvas', canvas_script: 'x.js' }, io), 'canvas did not open');
        ticks(2);
    });

    step('control: the jog still belongs to the canvas', () => {
        got.length = 0;
        cc(14, 1);
        assert(got.some(m => m[1] === 14), 'the jog did not reach the module');
    });

    step('⭐ Play reaches the transport, not the canvas', () => {
        got.length = 0; writes.length = 0;
        S.playing = false;
        cc(85, 127); cc(85, 0);
        assert(writes.some(w => w[0] === 'transport' && /play/.test(w[1])), 'Play sent nothing: ' + JSON.stringify(writes));
        assert(!got.some(m => m[1] === 85), 'the canvas took Play');
    });

    step('⭐ Record reaches dAVEBOx, not the canvas', () => {
        got.length = 0;
        cc(86, 127); cc(86, 0);
        assert(!got.some(m => m[1] === 86), 'the canvas took Record');
    });

    if (failed) { console.error('test_canvas_transport: FAIL'); process.exit(1); }
    console.log('test_canvas_transport: PASS');
}
main().catch(e => { console.error(e); process.exit(1); });
