import { openTrackConfigViaMap } from './_map_config.mjs';
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

/* tests/js/test_audio_shot_knob.mjs — ONE-SHOT IS A CLIP BANK SETTING (Josh,
 * 2026-11-10: "it should be a clip bank setting"). On an Audio track's CLIP
 * bank, K1 is Mode: Loop · Shot. Turned through the real input path (the
 * deliberate feel: a brush does not flip it), it sends the engine the clip's
 * Shot and the cell reads it; Stretch and Shift keep K2 and K3. */
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
globalThis.host_preview_stop = () => {}; globalThis.host_preview_play = () => {};

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const A = await import('../../ui/ui_audio.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
    const T = 4;
    const shotSets = () => sets.filter(([k]) => k === 't' + T + '_au_set_shot').map(([, v]) => v);
    /* the clip's info is the engine's, refreshed each tick: hold it as the engine would report */
    let shot = 0;
    const info = () => { S.auInfo[T] = S.auInfo[T] || []; S.auInfo[T][0] = { state: 2, mode: 0, name: 'Break.wav', nframes: 44100, rate: 44100, ch: 1, bpm10: 1200, rot: 0, shot }; };
    /* each gesture starts from a clean accumulator, as a fresh touch would */
    const turn = (dir, n) => { S.knobAccum[0] = 0; for (let i = 0; i < n; i++) { info(); S.knobAccelLast[0] = 0; cc(71, dir > 0 ? 1 : 127); } info(); };

    step('setup: track 5 an Audio track with a sample in clip A, Track view, the CLIP bank', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true;
        S.trackPadMode[T] = 3; S.sessionView = false; S.activeTrack = T; S.activeBank = 0;
        S.trackActiveClip[T] = 0;
        info(); ticks(2); info();
    });

    step('⭐ the CLIP bank: K1 Mode (Loop), K2 Stretch, K3 Offset', () => {
        const cells = A.auLoopBankCells(T);
        assert(cells[0] && cells[0].label === 'Mode' && cells[0].text === 'Loop', 'K1 is not Mode Loop: ' + JSON.stringify(cells[0]));
        assert(cells[1] && cells[1].name === 'Stretch' && cells[2] && cells[2].name === 'Offset', 'Stretch / Offset moved: ' + JSON.stringify(cells.slice(1, 3)));
    });

    step('a brush (ten detents, half the deliberate feel) does not flip it', () => {
        sets.length = 0;
        note(0, 127); turn(1, 10); note(0, 0);
        assert(!shotSets().length, 'a brush flipped Mode: ' + JSON.stringify(shotSets()));
    });

    step('⭐ turned right: Shot — sent to the engine for clip A, the cell reads it', () => {
        sets.length = 0;
        note(0, 127); turn(1, 30); note(0, 0);
        assert(shotSets().length === 1 && shotSets()[0] === '0 1', 'Shot not sent once for clip A: ' + JSON.stringify(shotSets()));
        shot = 1; info();
        assert(A.auLoopBankCells(T)[0].text === 'Shot', 'the cell does not read Shot');
    });

    step('...turned on further: nothing more (already Shot)', () => {
        sets.length = 0;
        note(0, 127); turn(1, 30); note(0, 0);
        assert(!shotSets().length, 'sent again: ' + JSON.stringify(shotSets()));
    });

    step('⭐ turned left: Loop again', () => {
        sets.length = 0;
        note(0, 127); turn(-1, 30); note(0, 0);
        assert(shotSets().length === 1 && shotSets()[0] === '0 0', 'Loop not sent: ' + JSON.stringify(shotSets()));
    });

    process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
