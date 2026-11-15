/* tests/js/test_slicer_hints.mjs — THE SLICER EDITOR'S FOOTER SAYS WHAT
 * EACH GESTURE DOES NOW (Josh, 2026-11-15: "make sure the hints are updated on
 * slice pages to account for the new gestures"). For every page and state —
 * page 1, the slice editor inside it, page 2, page 3, page 3 with Tempo in
 * hand — plain and with Shift held: the hints drawn are read back, and each
 * one the footer names is PERFORMED and checked to do that: CLK EDIT enters
 * the slice editor, CLK ADD adds a slice, CLK MENU (Shift) opens the SLICE
 * menu, CLK MENU on page 3 the SAMPLE menu, CLK TEMPO Tempo's menu, JOG PAGE
 * turns the page, BACK DONE leaves the slice editor. And with Shift held,
 * never JOG PAGE: Shift + the jog leaves the editor. */
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
    const hints = () => { S.screenDirty = true; render.drawUI(); return (kit.kitHintsForTest() || []).map((h) => h[0].toUpperCase() + ' ' + h[1].toUpperCase()); };
    const shift = (on) => { SHIFT = on ? 1 : 0; cc(49, on ? 127 : 0); ticks(1); };
    const click = () => { cc(3, 127); ticks(1); cc(3, 0); ticks(2); };
    const fresh = (p) => {
        if (S.auEditor) { AED.closeAudioEditor(); S.auPanel = null; ticks(2); }
        sampled(true); AED.openWave(T); ticks(2);
        assert(S.auEditor && S.auEditor.ed === 'slicer', 'the SLICER editor did not open');
        toPage(p);
    };
    const has = (hs, h) => assert(hs.indexOf(h) >= 0, 'no ' + h + ' in ' + JSON.stringify(hs));
    const hasNot = (hs, h) => assert(hs.indexOf(h) < 0, h + ' is shown: ' + JSON.stringify(hs));

    step('⭐⭐ page 1: CLK EDIT · SH MENU · JOG PAGE — and each does that', () => {
        fresh(0);
        const hs = hints();
        assert(JSON.stringify(hs) === JSON.stringify(['CLK EDIT', 'SH MENU', 'JOG PAGE']), 'page 1: ' + JSON.stringify(hs));
        click(); assert(AED.slcInside(S.auEditor), 'CLK EDIT did not enter the slice editor');
        fresh(0); cc(14, 1); ticks(2); assert((S.auEditor.page | 0) === 1, 'JOG PAGE did not turn to page 2');
    });
    step('⭐⭐ page 1 with Shift: CLK MENU · TCH ALL SLICES, never JOG PAGE — and Shift + click opens the SLICE menu', () => {
        fresh(0); shift(true);
        const hs = hints(); has(hs, 'CLK MENU'); has(hs, 'TCH ALL SLICES'); hasNot(hs, 'JOG PAGE'); hasNot(hs, 'CLK EDIT');
        click(); shift(false);
        assert(S.auEditor.pick && S.auEditor.pick.menu === 'slices', 'Shift + click did not open the SLICE menu: ' + JSON.stringify(S.auEditor.pick));
    });
    step('⭐⭐ the slice editor: CLK ADD · SH MENU · BACK DONE; with Shift CLK MENU — each does that', () => {
        fresh(0); click();
        let hs = hints();
        assert(JSON.stringify(hs) === JSON.stringify(['CLK ADD', 'SH MENU', 'BACK DONE']), 'inside: ' + JSON.stringify(hs));
        shift(true); hs = hints(); has(hs, 'CLK MENU'); hasNot(hs, 'CLK ADD'); hasNot(hs, 'JOG PAGE');
        click(); shift(false);
        assert(S.auEditor.pick && S.auEditor.pick.menu === 'slices', 'Shift + click inside did not open the SLICE menu');
        fresh(0); click(); cc(51, 127); ticks(1); cc(51, 0); ticks(2);
        assert(S.auEditor && !AED.slcInside(S.auEditor), 'BACK DONE did not leave the slice editor');
    });
    step('⭐⭐ page 2: SH MENU · JOG PAGE; with Shift CLK MENU · TCH ALL SLICES — Shift + click opens the SLICE menu', () => {
        fresh(1);
        let hs = hints();
        assert(JSON.stringify(hs) === JSON.stringify(['SH MENU', 'JOG PAGE']), 'page 2: ' + JSON.stringify(hs));
        shift(true); hs = hints(); has(hs, 'CLK MENU'); has(hs, 'TCH ALL SLICES'); hasNot(hs, 'JOG PAGE');
        click(); shift(false);
        assert(S.auEditor.pick && S.auEditor.pick.menu === 'slices', 'Shift + click on page 2 did not open the SLICE menu');
    });
    step('⭐⭐ page 3: CLK MENU · JOG PAGE (the SAMPLE menu); Tempo in hand CLK TEMPO; with Shift TCH FINE, never JOG PAGE', () => {
        fresh(2);
        let hs = hints();
        assert(JSON.stringify(hs) === JSON.stringify(['CLK MENU', 'JOG PAGE']), 'page 3: ' + JSON.stringify(hs));
        click(); assert(S.auEditor.pick && S.auEditor.pick.menu === 'sample', 'CLK MENU on page 3 did not open the SAMPLE menu');
        fresh(2); shift(true); hs = hints(); has(hs, 'CLK MENU'); has(hs, 'TCH FINE'); hasNot(hs, 'JOG PAGE'); shift(false);
        fresh(2); note(6, 127); ticks(1);
        hs = hints(); has(hs, 'CLK TEMPO');
        click(); note(6, 0); ticks(1);
        assert(S.auEditor.pick && S.auEditor.pick.tempo, 'CLK TEMPO did not open Tempo\'s menu');
    });

    if (failed) { console.log('FAIL: SLICER hints'); process.exit(1); }
    console.log('PASS: the SLICER editor\'s hints say what each gesture does');
}
main().catch((e) => { console.error(e); process.exit(1); });
