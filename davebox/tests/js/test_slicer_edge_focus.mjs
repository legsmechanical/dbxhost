/* tests/js/test_slicer_edge_focus.mjs — THE SLICER'S WAVEFORM KEEPS THE EDGE
 * YOU LAST WORKED ON (Josh, 2026-11-16: "if the last knob i touched/turned
 * was end after playing a slice, then the waveform focus needs to stay on end
 * until i leave slice editor or i touch/turn start"). Page 1, outside and
 * inside the slice editor: after End is touched or turned, a pad picking
 * another slice centres that slice's END, not its start; touching Start
 * hands the focus to the start; Back out of the slice editor lets go. A
 * touch of End centres the picked slice's end, never the clip's. */
let failed = 0;
const step = (l, fn) => { try { fn(); console.log(`  ok   — ${l}`); } catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; } };
const assert = (c, m) => { if (!c) throw new Error(m); };

for (const fn of ['set_pixel', 'fill_rect', 'draw_rect', 'stipple_rect', 'draw_line', 'print']) globalThis[fn] = () => {};
globalThis.clear_screen = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'flush_display', 'move_midi_internal_send', 'set_led', 'host_open_service',
    'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable',
    'host_send_midi', 'move_midi_inject_to_move', 'host_preview_stop', 'host_preview_play'])
    globalThis[fn] = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_ui_publish = () => false;
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
let SHIFT = 0;
globalThis.shadow_get_shift_held = () => SHIFT;   /* the host's Shift, as the real button sets it */
globalThis.host_seed_module_defaults = () => [0, 0];
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
/* the engine: track 5 with a sample, as the audio tests give it */
const ENGINE = {};
globalThis.host_module_get_param = (k) => (ENGINE[k] !== undefined ? ENGINE[k] : '');
import './_bulk_get_stub.mjs';

async function main() {
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const C = await import('../../ui/ui_constants.mjs');
    const AUD = await import('../../ui/ui_audio.mjs');
    const AED = await import('../../ui/ui_audio_editor.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    /* a knob touch and its release: note-on, velocity 0 to let go, as Move sends them */
    const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0x90, d1, d2]));
    const T = 4;

    function sampled(slicer) {
        const cols = Array.from({ length: 128 }, (_, i) => ((i * 7) % 100).toString(16).padStart(2, '0').repeat(2)).join('');
        const info = '2 0 ' + (slicer ? 1 : 0) + ' 8 1 16 6000 90000 0 0 96000 48000 2 0 0 0 8 0 0 96000 840 8 50 0 0|Break 84 bpm.wav';
        const marks = Array.from({ length: 8 }, (_, k) => (6000 + k * 10500) + ' ' + (6000 + (k + 1) * 10500)).join(' ');
        const pm = slicer ? C.PAD_MODE_SLICER : C.PAD_MODE_AUDIO;
        S.trackPadMode[T] = pm;
        Object.assign(ENGINE, { ['t' + T + '_pad_mode']: String(pm), ['t' + T + '_au_info_0']: info, ['t' + T + '_au_info_16']: info,
            ['t' + T + '_au_peaks_0']: cols, ['t' + T + '_au_peaks_16']: cols, ['t' + T + '_au_marks_0']: marks, ['t' + T + '_au_marks_16']: marks });
        S.sessionView = false; S.activeTrack = T; S.activeBank = 0; S.trackActiveClip[T] = 0;
        AUD.auMarkStale(T, slicer ? 16 : 0); AUD.auMarkStale(T, 0);
        ticks(6);
    }
    function toPage(p) {
        for (let g = 0; g < 4 && (S.auEditor.page | 0) !== p; g++) { cc(14, (S.auEditor.page | 0) < p ? 1 : 127); ticks(2); }
        assert((S.auEditor.page | 0) === p, 'the jog never reached page ' + (p + 1));
    }
    step('setup', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
        S.touchHoldMs = 0;              /* a release lands at once (the hold runs on the wall clock) */
        ticks(2);
    });


    const kit = await import('../../ui/ui_movy.mjs');
    const pad = (k) => { const p = AUD.auSliceToPad(k, T); assert(p >= 0, 'slice ' + k + ' is off the pads'); note(C.TRACK_PAD_BASE + p, 100); ticks(1); note(C.TRACK_PAD_BASE + p, 0); ticks(1); };
    const touch = (k) => { note(k, 127); ticks(1); note(k, 0); ticks(1); };
    const click = () => { cc(3, 127); ticks(1); cc(3, 0); ticks(2); };
    const fresh = (inside) => {
        if (S.auEditor) { AED.closeAudioEditor(); S.auPanel = null; ticks(2); }
        sampled(true); AED.openWave(T); ticks(2);
        assert(S.auEditor && S.auEditor.ed === 'slicer', 'the SLICER editor did not open');
        if (inside) { click(); assert(AED.slcInside(S.auEditor), 'the slice editor did not open'); }
        /* zoom in until the view is narrower than a slice, so centring shows */
        for (let g = 0; g < 30 && S.auEditor.B - S.auEditor.A > 4000; g++) { cc(72, 1); ticks(1); }
        assert(S.auEditor.B - S.auEditor.A <= 4000, 'could not zoom in: span ' + (S.auEditor.B - S.auEditor.A));
        return S.auEditor;
    };
    const mid = (ed) => (ed.A + ed.B) / 2;
    const near = (ed, f, what) => assert(Math.abs(mid(ed) - f) <= (ed.B - ed.A) / 8 + 2, what + ': view centre ' + mid(ed) + ', wanted ~' + f + ' (A ' + ed.A + ' B ' + ed.B + ')');
    const mk = (ed, k) => AUD.auMarks(ed.t, ed.c)[k];

    for (const inside of [false, true]) {
        const where = inside ? 'inside the slice editor' : 'page 1';
        step('⭐⭐ ' + where + ': control — with no edge held, a pad centres the slice\'s START', () => {
            const ed = fresh(inside);
            pad(3); near(ed, mk(ed, 3)[0], 'pad 4');
        });
        step('⭐⭐ ' + where + ': End TOUCHED, then pads — each centres its slice\'s END, never the clip\'s end', () => {
            const ed = fresh(inside);
            pad(2); touch(2); near(ed, mk(ed, 2)[1], 'End touched on slice 3');
            for (const k of [5, 1, 6]) { pad(k); near(ed, mk(ed, k)[1], 'pad ' + (k + 1) + ' after End'); }
        });
        step('⭐⭐ ' + where + ': End TURNED, then a pad — its END', () => {
            const ed = fresh(inside);
            pad(1); cc(73, 127); ticks(1);
            pad(4); near(ed, mk(ed, 4)[1], 'pad 5 after an End turn');
        });
        step('⭐⭐ ' + where + ': touching Start hands the focus back — the next pad centres its START', () => {
            const ed = fresh(inside);
            pad(1); touch(2); pad(4); near(ed, mk(ed, 4)[1], 'control: End held');
            touch(0); near(ed, mk(ed, 4)[0], 'Start touched');
            pad(6); near(ed, mk(ed, 6)[0], 'pad 7 after Start');
        });
    }
    step('⭐⭐ Back out of the slice editor lets go of End: the next pad centres its START', () => {
        const ed = fresh(true);
        pad(1); touch(2); pad(4); near(ed, mk(ed, 4)[1], 'control: End held inside');
        cc(51, 127); ticks(1); cc(51, 0); ticks(2);
        assert(!AED.slcInside(S.auEditor), 'Back did not leave the slice editor');
        pad(6); near(S.auEditor, mk(S.auEditor, 6)[0], 'pad 7 after Back');
    });

    if (failed) { console.log('FAIL: SLICER edge focus'); process.exit(1); }
    console.log('PASS: the SLICER keeps the edge last worked on in view');
}
main().catch((e) => { console.error(e); process.exit(1); });
