/* tests/js/test_hud_page_marks.mjs — THE SCREEN VIEW SHOWS WHAT THE OLED'S
 * PAGED BANKS SHOW (Josh, 2026-11-16: "remote color screen doesn't show page
 * indicators for multi-page banks (mixer, e.g.) and slice page 3 doesn't show
 * any of the first 3 params (start/zoom/end) on the knobs").
 *
 * Real gestures through ui.js, then the document published with a viewer
 * connected: the Session overview's mixer tabs name every bank (EQ and
 * COMPRESS too), the lit EQ tab carries its band and page; Track View's knob
 * strip carries MIX's page; the Slicer's page 3 publishes Start / Zoom / End
 * as knobs (on the OLED they are the strip over K1-K3, not cells). */
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

    const HP = await_HP;
    let probe = 8e15;
    const watched = () => {
        let last = null;
        globalThis.host_ui_publish = (j) => { if (j) last = j; return true; };
        HP.hudTick(probe += 1e12); S.screenDirty = true; render.drawUI();
        globalThis.host_ui_publish = () => false;
        assert(last, 'nothing was published with a viewer connected');
        return JSON.parse(last);
    };
    const ENG = await import('../../ui/ui_engine.mjs');

    step('⭐⭐ slice page 3: K1-K3 reach the Screen view as Start / Zoom / End knobs, with values', () => {
        fresh(2);
        S.knobTouched = -1;
        const d = watched();
        const kn = (d.body && d.body.knobs) || (d.knobs && d.knobs.knobs) || [];
        const lab = kn.slice(0, 3).map((c) => c && c.label);
        assert(lab.join() === 'Start,Zoom,End', 'K1-K3: ' + JSON.stringify(kn.slice(0, 3)));
        assert(kn.slice(0, 3).every((c) => c.text && c.text !== ''), 'a blank value: ' + JSON.stringify(kn.slice(0, 3)));
        assert(/^x[\d.]+$/.test(kn[1].text), 'Zoom reads as a factor: ' + kn[1].text);
        assert(kn.slice(3).some((c) => c && c.kind !== 'blank'), 'the page\'s own knobs went missing: ' + JSON.stringify(kn.slice(3)));
        assert(d.body.header && /3\/3$/.test(String(d.body.header.right)), 'page 3 says 3/3: ' + JSON.stringify(d.body.header));
    });
    step('...and with K1 in hand the card is a pop-up over that page, the knobs still there', () => {
        fresh(2); note(0, 127); ticks(1);
        const d = watched();
        note(0, 0); ticks(1);
        const kn = (d.body && d.body.knobs) || [];
        assert(kn[0] && kn[0].label === 'Start', 'K1 under the card: ' + JSON.stringify(kn[0]));
        assert(d.body.popup, 'the card is not a pop-up: ' + JSON.stringify(Object.keys(d.body)));
        if (S.auEditor) { AED.closeAudioEditor(); S.auPanel = null; ticks(2); }
    });

    step('⭐⭐ Session overview: a tab per mixer bank — EQ and COMPRESS too — and the lit EQ tab names its band and page', () => {
        S.sessionView = true; S.activeTrack = 0; ticks(2);
        const eq2 = ENG.SESS_EQ_MODE0 + 1;
        S.sessKnobMode = eq2; ticks(1);
        let d = watched();
        assert(d.where && d.where.screen === 'session.overview', 'not the session overview: ' + (d.where && d.where.screen));
        const o = d.ovw;
        assert(o.modes.join() === 'VOLUME,PAN,SEND A,SEND B,EQ,COMPRESS', 'tabs: ' + o.modes);
        assert(o.modes[o.modeIdx] === 'EQ', 'the lit tab: ' + o.modes[o.modeIdx]);
        assert(o.page === '2/' + ENG.SESS_EQ_PAGES && o.mode === 'EQ MID', 'band and page: ' + o.mode + ' ' + o.page);
        S.sessKnobMode = ENG.SESS_COMP_MODE; ticks(1);
        d = watched();
        assert(d.ovw.modes[d.ovw.modeIdx] === 'COMPRESS' && !d.ovw.page, 'COMPRESS: ' + JSON.stringify([d.ovw.modeIdx, d.ovw.page]));
        S.sessKnobMode = 1; ticks(1);
        d = watched();
        assert(d.ovw.modes[d.ovw.modeIdx] === 'PAN' && !d.ovw.page, 'control, PAN: ' + JSON.stringify([d.ovw.modeIdx, d.ovw.page]));
        S.sessKnobMode = 0; S.sessionView = false; ticks(2);
    });

    step('⭐⭐ Track View, MIX turned to page 2: the knob strip under the overview carries "2/2"', () => {
        const t = 2;
        S.trackPadMode[t] = 0; S.trackRoute[t] = 0;
        S.activeTrack = t; S.activeBank = S.trackActiveBank[t] = 11; ticks(4);
        let d = watched();
        const where = () => (d.knobs ? 'knobs' : 'body') + ' ' + JSON.stringify((d.knobs || d.body || {}).header);
        const pg = () => (d.knobs && d.knobs.page) || (d.body && d.body.header && (/(\d+\/\d+)$/.exec(String(d.body.header.right || '')) || [])[1]);
        assert(pg() === '1/2', 'MIX page 1 published no 1/2: ' + where() + ' page ' + pg());
        cc(14, 1); ticks(2);
        d = watched();
        assert(pg() === '2/2', 'MIX page 2 published no 2/2: ' + where() + ' page ' + pg());
        cc(14, 127); ticks(2);
    });

    process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
