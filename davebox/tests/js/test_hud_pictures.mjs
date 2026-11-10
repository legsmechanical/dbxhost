import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_hud_pictures.mjs — THE SCREEN VIEW ON A SCREEN THAT IS A
 * PICTURE: Move's own (co-run) and a module's own canvas.
 *
 * Co-run (Josh, 2026-11-10: "maybe we just show the mirrored move oled in the
 * frame?" · "we should still show the knobs, just not labeled or anything"):
 * the live mirror carries Move's frame, and nothing else of Move's is
 * readable, so the screen publishes a picture — with its knobs SHOWN, not
 * live: a browser press replays to this UI and the module, never to Move.
 * A canvas takes every knob message, so its knobs are LIVE — and a turn from
 * the browser's surface reaches the module, through the real input path.
 * Before this, co-run published no body at all: the Screen view was blank. */
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
globalThis.host_ui_publish = () => false;   /* the Screen view: nobody watching */
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
    const HP = await import('../../ui/hud/hud_publish.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
    let probe = 8e15;
    /* one frame with a viewer connected: the document it publishes */
    const watched = () => {
        let last = null;
        globalThis.host_ui_publish = (j) => { if (j) last = j; return true; };
        HP.hudTick(probe += 1e12);
        render.drawUI();
        globalThis.host_ui_publish = () => false;
        assert(last, 'nothing was published with a viewer connected');
        return JSON.parse(last);
    };

    const got = [];
    const overlay = { onMidi: (ctx, msg) => { got.push(Array.from(msg.data)); }, draw: () => {} };
    const io = { loadOverlay: () => ({ overlay }), getParam: () => '', setParam: () => {}, getValue: () => '', setValue: () => {} };

    step('setup', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.activeTrack = 4;
        ticks(4);
    });

    step('⭐ co-run: a picture of Move\'s own screen, knobs shown and not live', () => {
        S.moveCoRunTrack = 4;
        const d = watched();
        S.moveCoRunTrack = -1;
        assert(d.where.screen === 'co-run', 'screen ' + d.where.screen);
        assert(d.body && d.body.picture, 'no picture: ' + JSON.stringify(d.body));
        assert(d.body.picture.kind === 'move', 'kind ' + d.body.picture.kind);
        assert(d.body.picture.knobs === 'shown', 'knobs ' + d.body.picture.knobs);
        assert(d.body.picture.track === 4, 'the co-run track is not named: ' + d.body.picture.track);
        assert(!d.body.knobs, 'co-run published knob cells it cannot know: ' + JSON.stringify(d.body.knobs));
    });

    step('⭐ a module canvas: its picture, knobs live', () => {
        openTrackConfigViaMap();
        ticks(6);
        assert(snd.soundOpenCanvasForTest({ key: 'view', type: 'canvas', canvas_script: 'x.js' }, io), 'canvas did not open');
        ticks(2);
        const d = watched();
        assert(d.where.screen === 'sound.canvas-edit', 'screen ' + d.where.screen);
        assert(d.body && d.body.picture && d.body.picture.kind === 'module', 'picture ' + JSON.stringify(d.body));
        assert(d.body.picture.knobs === 'live', 'knobs ' + d.body.picture.knobs);
    });

    step('...and a knob the browser turns reaches the module: touch, the detent, release', () => {
        got.length = 0;
        note(3, 127); cc(74, 1); note(3, 0); ticks(2);
        const sawTurn = got.some((m) => (m[0] & 0xF0) === 0xB0 && m[1] === 74 && m[2] === 1);
        assert(sawTurn, 'the canvas did not get the turn: ' + JSON.stringify(got));
    });

    step('nobody watching: nothing is published', () => {
        globalThis.host_ui_publish = (j) => { if (j) throw new Error('published with nobody watching'); return false; };
        HP.hudTick(probe += 1e12); render.drawUI();
        globalThis.host_ui_publish = () => false;
    });

    process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
