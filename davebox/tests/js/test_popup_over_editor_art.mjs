/* tests/js/test_popup_over_editor_art.mjs — A KNOB'S OPTION LIST IS ON TOP
 * (Josh, 2026-11-15: "pop-ups on page 3 land behind the wave form view
 * instead of infront of it"). Two editor pages draw art of their own beside
 * the knob page: the SLICER editor's page 3 its strip of the whole file, and
 * SAMPLE's TIME page the frame round Tempo and Bars. Both were drawn AFTER the
 * knob page, so the list a turned Sync / Warp opens was drawn over by them.
 *
 * Pinned through the real gesture (touch the knob, turn it) and the real
 * drawUI(): once the option list starts drawing (drawKitEnumOverlay), nothing
 * else may draw under the header — every primitive call is checked by who
 * called it. Proved red against the old order: both steps fail there.
 *
 * And page 3's waveform card (Josh, 2026-11-15: "can we use a similar popup
 * waveform view like the other audio tracks use when adjusting the anything
 * in page 3 that changes the sample display?"): Start, Zoom, End and Gain —
 * what changes how the sample draws — bring it up while in hand, named; the
 * other four do not, and it goes when the knob is let go. */
let failed = 0;
const step = (l, fn) => { try { fn(); console.log(`  ok   — ${l}`); } catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; } };
const assert = (c, m) => { if (!c) throw new Error(m); };

/* the draw primitives, each call checked against the overlay */
const HDR = 9;                        /* the header band the list leaves alone */
let measuring = false, overlaySeen = false, overlayDrew = 0;
const late = [];
const inOverlay = () => /drawKitEnumOverlay/.test(new Error().stack);
const check = (name, y, h) => {
    if (!measuring) return;
    if (inOverlay()) { overlaySeen = true; overlayDrew++; return; }
    if (overlaySeen && y + h > HDR) late.push(name + ' y=' + y + ' ' + new Error().stack.split('\n').slice(3, 7).map((s) => s.trim().split(' ')[1]).join('<'));
};
globalThis.set_pixel = (x, y) => check('set_pixel', y | 0, 1);
globalThis.fill_rect = (x, y, w, h) => { if (w > 0 && h > 0) check('fill_rect', y | 0, h | 0); };
globalThis.draw_rect = (x, y, w, h) => check('draw_rect', y | 0, h | 0);
globalThis.stipple_rect = (x, y, w, h) => check('stipple_rect', y | 0, h | 0);
globalThis.draw_line = (x0, y0, x1, y1) => check('draw_line', Math.min(y0, y1) | 0, Math.abs(y1 - y0) + 1);
globalThis.print = (x, y) => check('print', y | 0, 8);
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
globalThis.shadow_get_shift_held = () => 0;
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
    globalThis.__fontTrace = [];
    (await import('../../ui/ui_fonts_pp.mjs')).setKitTextTrace((x) => globalThis.__fontTrace.push(String(x)));
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
    /* touch knob k, turn it a detent, and draw with it in hand */
    function turnAndDraw(k) {
        note(k, 127); S.knobAccelLast[k] = 0; cc(71 + k, 1); ticks(1);
        overlaySeen = false; overlayDrew = 0; late.length = 0;
        measuring = true;
        try { render.drawUI(); } finally { measuring = false; }
        note(k, 0); ticks(1);
    }

    step('setup', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
        S.touchHoldMs = 0;              /* a release lands at once (the hold runs on the wall clock) */
        ticks(2);
    });

    step('⭐⭐ the SLICER editor\'s page 3: Sync\'s list is over the strip, not under it', () => {
        sampled(true); AED.openWave(T); ticks(2);
        assert(S.auEditor && S.auEditor.ed === 'slicer', 'the SLICER editor did not open');
        toPage(2);
        turnAndDraw(3);
        assert(overlaySeen && overlayDrew > 0, 'turning Sync opened no list — the check would prove nothing');
        assert(!late.length, 'drawn over the list (' + late.length + '): ' + late.slice(0, 4).join(' | '));
        AED.closeAudioEditor(); S.auPanel = null; ticks(2);
    });

    step('⭐⭐ page 3\'s waveform card: Start, Zoom, End and Gain bring it up, named; Pitch, Detune, Sync and Tempo do not; letting go takes it down', () => {
        const FT = globalThis.__fontTrace;
        sampled(true); AED.openWave(T); ticks(2); toPage(2);
        const NAME = { 0: 'START', 1: 'ZOOM', 2: 'END', 7: 'GAIN' };
        const card = (tx) => tx.some((x) => /^S \d+\.\d\dS   E \d+\.\d\dS$/.test(x));
        for (let k = 0; k < 8; k++) {
            note(k, 127); ticks(1);
            FT.length = 0; render.drawUI(); const tx = FT.slice();
            note(k, 0);
            for (let g = 0; g < 200 && S.knobTouched >= 0; g++) ticks(1);   /* the touch hold runs out */
            assert(S.knobTouched < 0, 'K' + (k + 1) + ' never let go');
            if (NAME[k]) {
                assert(card(tx), 'K' + (k + 1) + ' in hand shows no waveform card: ' + JSON.stringify(tx));
                assert(tx.indexOf(NAME[k]) >= 0, 'the card does not name K' + (k + 1) + ' ' + NAME[k] + ': ' + JSON.stringify(tx));
            } else assert(!card(tx), 'K' + (k + 1) + ' shows the waveform card: it changes how the sample plays, not how it draws');
            FT.length = 0; render.drawUI();
            assert(!card(FT.slice()), 'the card stayed up after K' + (k + 1) + ' was let go');
        }
        AED.closeAudioEditor(); S.auPanel = null; ticks(2);
    });

    step('⭐⭐ SAMPLE\'s TIME page: Warp\'s list is over the Tempo / Bars frame, not under it', () => {
        sampled(false); AED.openWave(T, 'sample'); ticks(2);
        assert(S.auEditor && S.auEditor.ed === 'sample', 'SAMPLE did not open');
        toPage(1);
        turnAndDraw(1);
        assert(overlaySeen && overlayDrew > 0, 'turning Warp opened no list — the check would prove nothing');
        assert(!late.length, 'drawn over the list (' + late.length + '): ' + late.slice(0, 4).join(' | '));
    });

    if (failed) { console.log('FAIL: pop-ups over editor art'); process.exit(1); }
    console.log('PASS: a knob\'s option list is drawn over the editor\'s own art');
}
main().catch((e) => { console.error(e); process.exit(1); });
