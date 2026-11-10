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

/* tests/js/test_audio_clip_delete.mjs — DELETE + CLIP ON AN AUDIO CLIP (Josh,
 * 2026-11-10: "clear the sample, but ask for confirmation first").
 * An Audio clip IS its sample: it has no steps, so the old clear said
 * "SEQUENCE CLEARED" and did nothing. Now the gesture asks REMOVE SAMPLE (No
 * selected); Yes clears the sample, No or Back leaves it, any answer closes
 * the question. An empty Audio clip has nothing to clear and asks nothing; a
 * melodic clip is cleared as before. Driven through the real input path in
 * Session view (Delete held + a clip pad) and Track view (Delete + a track
 * button). */
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
globalThis.host_preview_stop = () => {}; globalThis.host_preview_play = () => {};

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const HP = await import('../../ui/hud/hud_publish.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
    const T = 4, PAD_A = 92 + T, PAD_B = 84 + T, DEL = 119;
    const cleared = () => sets.filter(([k]) => k === 't' + T + '_au_clear').map(([, v]) => v);
    const popup = () => (S.actionPopupLines || []).join(' ');

    step('setup: track 5 an Audio track, clip A holding a sample, clip B empty; Session view', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true;
        S.trackPadMode[T] = 3;
        S.auInfo[T] = S.auInfo[T] || [];
        S.auInfo[T][0] = { state: 2, name: 'Break Phenom 84 bpm.wav' };
        S.auInfo[T][1] = null;
        S.sessionView = true; S.sceneRow = 0;
        ticks(3);
    });

    /* the sample's info is the engine's, refreshed each tick (the stub engine
     * knows no sample): name clip A's sample right before the gesture */
    let hasA = true;
    const delPad = (pad) => { if (hasA) S.auInfo[T][0] = { state: 2, name: 'Break Phenom 84 bpm.wav' };
        cc(DEL, 127); note(pad, 100); note(pad, 0); cc(DEL, 0); ticks(2); };

    step('⭐ Delete + clip A: asks REMOVE SAMPLE, No selected, nothing cleared yet', () => {
        sets.length = 0;
        delPad(PAD_A);
        assert(S.auChooser && S.auChooser.askNone && S.auChooser.askNone.only, 'no question: ' + JSON.stringify(S.auChooser && S.auChooser.askNone) + ' popup "' + popup() + '"');
        assert(S.auChooser.askNone.sel === 1, 'Yes was selected by default');
        assert(S.auChooser.t === T && S.auChooser.c === 0, 'asked about the wrong clip');
        assert(!cleared().length, 'the sample went before the answer');
        assert(!/SEQUENCE/.test(popup()), 'still says SEQUENCE CLEARED');
    });

    step('...and it is what the screen shows, over Session view (REMOVE SAMPLE, naming 5A)', () => {
        let last = null;
        globalThis.host_ui_publish = (j) => { if (j) last = j; return true; };
        HP.hudTick(8e15); render.drawUI();
        globalThis.host_ui_publish = () => false;
        const d = last && JSON.parse(last);
        assert(d && d.where.screen === 'audio-chooser', 'the screen is ' + (d && d.where.screen));
        const t = JSON.stringify(d.body);
        assert(/REMOVE SAMPLE/i.test(t) && /5A/.test(t), 'the question is not on screen: ' + t.slice(0, 200));
    });

    step('...No (the click as it stands): the question closes and the sample stays', () => {
        cc(3, 127); cc(3, 0); ticks(2);
        assert(!S.auChooser, 'the chooser stayed up after No');
        assert(!cleared().length, 'No cleared the sample');
    });

    step('...Back closes it too, clearing nothing', () => {
        delPad(PAD_A);
        assert(S.auChooser && S.auChooser.askNone, 'did not ask again');
        cc(51, 127); cc(51, 0); ticks(2);
        assert(!S.auChooser, 'Back left the chooser up (it walked into the places list?)');
        assert(!cleared().length, 'Back cleared the sample');
    });

    step('⭐ ...Yes clears clip A\'s sample (one undoable clear, the chooser\'s own)', () => {
        delPad(PAD_A);
        cc(14, 1); ticks(1);                 /* the jog to Yes */
        assert(S.auChooser.askNone.sel === 0, 'the jog did not reach Yes');
        cc(3, 127); cc(3, 0); ticks(2);
        assert(!S.auChooser, 'the chooser stayed up after Yes');
        assert(cleared().length === 1 && cleared()[0] === '0', 'clip A was not cleared once: ' + JSON.stringify(cleared()));
        assert(!(S.auInfo[T][0] && S.auInfo[T][0].name), 'the clip still names its sample');
        hasA = false;
    });

    step('an empty Audio clip asks nothing and clears nothing', () => {
        sets.length = 0;
        delPad(PAD_B);
        assert(!S.auChooser, 'asked about an empty clip');
        assert(!cleared().length, 'cleared an empty clip');
        assert(/NO SAMPLE/.test(popup()), 'no word that there is nothing to clear: "' + popup() + '"');
    });

    step('⭐ Track view, Delete + a track button: the same question', () => {
        S.auInfo[T][0] = { state: 2, name: 'Break Phenom 84 bpm.wav' };
        S.sessionView = false; S.activeTrack = T; ticks(2);
        sets.length = 0;
        cc(DEL, 127); cc(43, 127); cc(43, 0); cc(DEL, 0); ticks(2);   /* CC 43 = the top track button = clip A */
        assert(S.auChooser && S.auChooser.askNone && S.auChooser.askNone.only && S.auChooser.c === 0,
               'Track view did not ask: ' + JSON.stringify(S.auChooser && { c: S.auChooser.c, ask: S.auChooser.askNone }) + ' popup "' + popup() + '"');
        cc(51, 127); cc(51, 0); ticks(2);
        assert(!S.auChooser && !cleared().length, 'Back did not close it cleanly');
        /* No in Track view: nothing else closes the chooser here (Session view's
         * tick would), so this is the answer itself closing it */
        S.auInfo[T][0] = { state: 2, name: 'Break Phenom 84 bpm.wav' };
        cc(DEL, 127); cc(43, 127); cc(43, 0); cc(DEL, 0); ticks(2);
        assert(S.auChooser && S.auChooser.askNone, 'Track view did not ask the second time');
        cc(3, 127); cc(3, 0); ticks(2);
        assert(!S.auChooser, 'No left the chooser up in Track view (on its places list?)');
        assert(!cleared().length, 'No cleared the sample in Track view');
    });

    step('a melodic clip is cleared as before: SEQUENCE CLEARED, no question', () => {
        S.sessionView = true; S.trackPadMode[2] = 0; ticks(1);
        delPad(92 + 2);
        assert(!S.auChooser, 'a melodic clip asked');
        assert(/SEQUENCE/.test(popup()), 'a melodic clip lost its SEQUENCE CLEARED: "' + popup() + '"');
    });

    process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
