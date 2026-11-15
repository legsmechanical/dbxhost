/* tests/js/test_slicer_hints.mjs — THE SLICER EDITOR'S FOOTER SAYS WHAT
 * EACH GESTURE DOES NOW (Josh, 2026-11-15: "make sure the hints are updated on
 * slice pages to account for the new gestures"). For every page and state —
 * page 1, the slice editor inside it, page 2, page 3, page 3 with Tempo in
 * hand — plain and with Shift held: the hints drawn are read back, and each
 * one the footer names is PERFORMED and checked to do that: CLK EDIT enters
 * the slice editor, CLK ADD adds a slice, CLK MENU (Shift, outside) opens the
 * SLICE menu, KNB EDIT ALL (Shift) leaves only the every-slice knobs live, CLK MENU on page 3 the SAMPLE menu, CLK TEMPO Tempo's menu, JOG PAGE
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
    const await_HP = await import('../../ui/hud/hud_publish.mjs');
    const KT = [];
    (await import('../../ui/ui_fonts_pp.mjs')).setKitTextTrace((x) => KT.push(String(x)));
    const texts = () => { KT.length = 0; S.screenDirty = true; render.drawUI(); return KT.slice(); };
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
    step('⭐⭐ page 1 with Shift: CLK MENU · KNB EDIT ALL, never JOG PAGE — and Shift + click opens the SLICE menu', () => {
        fresh(0); shift(true);
        const hs = hints(); has(hs, 'CLK MENU'); has(hs, 'KNB EDIT ALL'); hasNot(hs, 'JOG PAGE'); hasNot(hs, 'CLK EDIT');
        click(); shift(false);
        assert(S.auEditor.pick && S.auEditor.pick.menu === 'slices', 'Shift + click did not open the SLICE menu: ' + JSON.stringify(S.auEditor.pick));
    });
    step('⭐⭐ the slice editor: CLK ADD · SH ALL · BACK DONE; with Shift only KNB EDIT ALL — Shift + click does nothing inside', () => {
        fresh(0); click();
        let hs = hints();
        assert(JSON.stringify(hs) === JSON.stringify(['CLK ADD', 'SH ALL', 'BACK DONE']), 'inside: ' + JSON.stringify(hs));
        shift(true); hs = hints();
        assert(JSON.stringify(hs) === JSON.stringify(['KNB EDIT ALL']), 'inside with Shift: ' + JSON.stringify(hs));
        const ed = S.auEditor, before = JSON.stringify(S.auInfo[ed.t][ed.c]);
        click(); shift(false);
        assert(!S.auEditor.pick, 'Shift + click inside opened a menu: ' + JSON.stringify(S.auEditor.pick));
        assert(AED.slcInside(S.auEditor), 'Shift + click inside left the slice editor');
        assert(JSON.stringify(S.auInfo[ed.t][ed.c]) === before, 'Shift + click inside changed the slices');
        fresh(0); click(); cc(51, 127); ticks(1); cc(51, 0); ticks(2);
        assert(S.auEditor && !AED.slcInside(S.auEditor), 'BACK DONE did not leave the slice editor');
    });
    step('⭐⭐ page 2: SH MENU · JOG PAGE; with Shift CLK MENU · KNB EDIT ALL — Shift + click opens the SLICE menu', () => {
        fresh(1);
        let hs = hints();
        assert(JSON.stringify(hs) === JSON.stringify(['SH MENU', 'JOG PAGE']), 'page 2: ' + JSON.stringify(hs));
        shift(true); hs = hints(); has(hs, 'CLK MENU'); has(hs, 'KNB EDIT ALL'); hasNot(hs, 'JOG PAGE');
        click(); shift(false);
        assert(S.auEditor.pick && S.auEditor.pick.menu === 'slices', 'Shift + click on page 2 did not open the SLICE menu');
    });
    step('⭐⭐ Shift on page 1 (inside and out): Start, Zoom and End do nothing and their rings are dark; Play and Revrs stay lit', () => {
        for (const inside of [false, true]) {
            fresh(0); if (inside) click();
            const ed = S.auEditor, where = inside ? 'inside' : 'outside';
            let r = AED.slcRingCells(ed);
            S.knobTouched = -1; S.screenDirty = true; render.drawUI();
            assert(texts().some((x) => /^S \d/.test(x)), where + ': control — no Start time on the OLED without Shift: ' + JSON.stringify(texts()));
            assert(r[0] && r[1] && r[2], where + ': without Shift, Start / Zoom / End are lit: ' + JSON.stringify(r.slice(0, 3)));
            shift(true);
            r = AED.slcRingCells(ed);
            assert(!r[0] && !r[1] && !r[2], where + ': with Shift, Start / Zoom / End rings are lit: ' + JSON.stringify(r.slice(0, 3)));
            assert(r[3] && r[6], where + ': with Shift, Play / Revrs rings went dark: ' + JSON.stringify([r[3], r[6]]));
            const before = JSON.stringify([AUD.auMarks(ed.t, ed.c), ed.A, ed.B, ed.cur]);
            for (const k of [0, 2]) { note(k, 127); ticks(1); note(k, 0); ticks(1); }
            assert(JSON.stringify([AUD.auMarks(ed.t, ed.c), ed.A, ed.B, ed.cur]) === before, where + ': a Start / End touch with Shift moved the view');
            S.knobTouched = -1; S.screenDirty = true; render.drawUI();
            assert(!texts().some((x) => /^S \d|^E \d|^E NEXT|ZOOM/.test(x)), where + ': with Shift the OLED still shows Start / End / Zoom: ' + JSON.stringify(texts()));
            for (const k of [0, 1, 2]) { cc(71 + k, 1); ticks(1); cc(71 + k, 127); cc(71 + k, 127); ticks(1); }
            assert(JSON.stringify([AUD.auMarks(ed.t, ed.c), ed.A, ed.B, ed.cur]) === before, where + ': a Start / Zoom / End turn with Shift moved something');
            shift(false);
            cc(71 + 1, 1); ticks(1);
            assert(JSON.stringify([AUD.auMarks(ed.t, ed.c), ed.A, ed.B, ed.cur]) !== before, where + ': control — a Zoom turn without Shift moved nothing');
        }
    });
    step('⭐⭐ the remote screen follows: inside with Shift, no Start / Zoom / End cells or times, footer KNB EDIT ALL', () => {
        const HP = await_HP;
        let probe = 8e15;
        const watched = () => {
            let last = null;
            globalThis.host_ui_publish = (j) => { if (j) last = j; return true; };
            HP.hudTick(probe += 1e12); S.screenDirty = true; render.drawUI();
            globalThis.host_ui_publish = () => false;
            assert(last, 'nothing was published with a viewer connected');
            return last;
        };
        fresh(0); click();
        const plain = watched();
        assert(/"Start"/.test(plain) && /"Zoom"/.test(plain), 'control: the plain frame has no Start / Zoom cells: ' + plain.slice(0, 400));
        assert(/"S \d/.test(plain), 'control: the plain frame has no start time readout');
        assert(/"sh"[^\]]*"all"/i.test(plain), 'the plain frame\'s footer has no SH ALL');
        shift(true);
        const sh = watched();
        shift(false);
        assert(!/"Start"|"Zoom"|"End"/.test(sh), 'with Shift the remote frame still has Start / Zoom / End: ' + sh.slice(0, 600));
        assert(!/"S \d|"E \d|"E NEXT"/.test(sh), 'with Shift the remote frame still shows the slice times');
        assert(/"knb"[^\]]*"edit all"/i.test(sh), 'with Shift the remote footer is not KNB EDIT ALL: ' + sh.slice(-400));
        /* page 3's waveform card reaches it as a pop-up: the knob and its value, and the waveform */
        fresh(2); note(0, 127); ticks(1);
        const card = JSON.parse(watched());
        note(0, 0); ticks(1);
        const pop = card.body && card.body.popup;
        assert(pop && pop.wave && pop.message && /^Start \S/.test(pop.message.big), 'page 3 Start in hand: no card with its value on the remote: ' + JSON.stringify(pop && { message: pop.message, wave: !!pop.wave, primary: pop.primary }));
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
