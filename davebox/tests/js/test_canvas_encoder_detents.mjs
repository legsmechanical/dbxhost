import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_canvas_encoder_detents.mjs — a module's own screen gets its
 * encoders ONE DETENT PER MESSAGE, as it does under stock.
 *
 * From the device (Beat Bank's pattern screen under dAVEBOx): knob 8 should
 * switch genre and did nothing. Its canvas gears the knob down by counting
 * MESSAGES — one genre per 24 — which is 24 detents under stock, where the
 * shadow UI hands a canvas one CC per detent. dAVEBOx is a tool: it gets one
 * batched CC per knob per frame carrying that frame's whole detent count, and
 * handed that straight on. A sweep of 24 detents arrived as a few messages.
 *
 * Driven through the real input path (onMidiMessageInternal), against a
 * canvas that counts the way Beat Bank's does.
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
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const snd = await import('../../ui/ui_sound.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));

    /* A canvas that counts as Beat Bank's does: direction only, one count per
     * message, a genre every 24. */
    const got = [];
    let accum = 0, genre = 0;
    const overlay = {
        onMidi: (ctx, msg) => {
            const d = msg.data;
            got.push([d[0], d[1], d[2]]);
            if ((d[0] & 0xF0) !== 0xB0 || d[2] === 0 || d[1] !== 78) return;
            accum += d[2] < 64 ? 1 : -1;
            while (accum >= 24) { genre++; accum -= 24; }
            while (accum <= -24) { genre--; accum += 24; }
        },
        draw: () => {},
    };
    const io = { loadOverlay: () => ({ overlay }), getParam: () => '', setParam: () => {}, getValue: () => '', setValue: () => {} };

    step('setup: sound mode open, a module screen up', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.activeTrack = 4;
        openTrackConfigViaMap();
        ticks(6);
        assert(snd.soundOpenCanvasForTest({ key: 'view', type: 'canvas', canvas_script: 'x.js' }, io), 'canvas did not open');
        ticks(2);
    });

    step('control: a single detent is one message, unchanged', () => {
        got.length = 0;
        cc(78, 1); cc(78, 127);
        assert(JSON.stringify(got) === JSON.stringify([[0xB0, 78, 1], [0xB0, 78, 127]]), 'got ' + JSON.stringify(got));
    });

    step('⭐⭐ a frame carrying 24 detents of knob 8 is 24 detents to the module: the genre moves', () => {
        got.length = 0; accum = 0; genre = 0;
        cc(78, 24);
        assert(got.length === 24 && got.every((m) => m[1] === 78 && m[2] === 1),
               '24 detents right arrived as ' + got.length + ' message(s): ' + JSON.stringify(got.slice(0, 3)));
        assert(genre === 1, 'the genre did not move (a module counting messages saw ' + got.length + ')');
        got.length = 0;
        cc(78, 128 - 24);
        assert(got.length === 24 && got.every((m) => m[2] === 127), '24 detents left arrived as ' + got.length);
        assert(genre === 0, 'the genre did not come back: ' + genre);
    });

    step('⭐ a sweep split unevenly across frames adds up the same (8 + 13 + 3)', () => {
        got.length = 0; accum = 0; genre = 0;
        cc(78, 8); cc(78, 13); cc(78, 3);
        assert(got.length === 24 && genre === 1, got.length + ' messages, genre ' + genre);
    });

    step('⭐ the jog and the other knobs are expanded the same way', () => {
        got.length = 0;
        cc(14, 3); cc(71, 5); cc(77, 128 - 4);
        const n = (c) => got.filter((m) => m[1] === c).length;
        assert(n(14) === 3 && n(71) === 5 && n(77) === 4, JSON.stringify([n(14), n(71), n(77)]));
        assert(got.filter((m) => m[1] === 77).every((m) => m[2] === 127), 'a left turn lost its direction');
    });

    step('⭐ a button is not an encoder: its 127 is passed as it came, once', () => {
        got.length = 0;
        cc(3, 127); cc(3, 0);                 /* the jog click */
        const clicks = got.filter((m) => m[1] === 3);
        assert(clicks.length === 2 && clicks[0][2] === 127 && clicks[1][2] === 0, JSON.stringify(clicks));
    });

    if (failed) { console.error('test_canvas_encoder_detents: FAIL'); process.exit(1); }
    console.log('test_canvas_encoder_detents: PASS');
}
main().catch(e => { console.error(e); process.exit(1); });
