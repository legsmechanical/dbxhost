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
const CCLEDS = new Map();
globalThis.move_midi_internal_send = (m) => { if (m && (m[1] & 0xF0) === 0xB0) CCLEDS.set(m[2], m[3]); return true; };

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const A = await import('../../ui/ui_audio.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
    const T = 4;
    const shotSets = () => sets.filter(([k]) => k === 't' + T + '_au_set_shot').map(([, v]) => v);
    /* the clip's info is the engine's, refreshed each tick: hold it as the engine would report */
    let shot = 0, free = 0, speed = 1000, sync = 0;
    const info = () => { S.auInfo[T] = S.auInfo[T] || []; S.auInfo[T][0] = { state: 2, mode: 0, name: 'Break.wav', nframes: 44100, rate: 44100, ch: 1, bpm10: 1200, rot: 0, shot, free, speed, sync, rstart: 0, cut: 0, pitch: 0, detune: 0, gain: 0 }; };
    const freeSets = () => sets.filter(([k]) => k === 't' + T + '_au_set_free').map(([, v]) => v);
    const speedSets = () => sets.filter(([k]) => k === 't' + T + '_au_set_speed').map(([, v]) => v);
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

    step('⭐ its knob rings: Mode, Stretch and Offset lit, K4-K8 dark — nothing there (Josh, 2026-11-12: "clip bank knob led rings are lit on empty knobs, which they shouldn\'t be per the general UI conventions")', () => {
        S.bankCardLatched = false;
        for (let i = 0; i < 4; i++) { info(); render.drawUI(); ticks(1); }
        const lit = [71, 72, 73, 74, 75, 76, 77, 78].map((c) => (CCLEDS.get(c) ? 1 : 0)).join('');
        assert(lit === '11100000', 'the CLIP bank rings: ' + lit + ' ' + JSON.stringify([71, 72, 73, 74, 75, 76, 77, 78].map((c) => CCLEDS.get(c))));
    });

    step('⭐ Loop + jog changes an Audio clip\'s length a step a detent, as on any clip (Josh, 2026-11-12: "on audio clips, loop + jog gesture to change length by steps doesn\'t work")', () => {
        S.clipLength[T][0] = 16;
        sets.length = 0;
        note(0, 0);
        cc(58, 127);                                     /* Loop down */
        info(); cc(14, 1); info(); ticks(1);
        cc(58, 0);
        const ls = sets.filter(([k]) => /clip_length|loop_set/.test(k));
        assert(S.clipLength[T][0] === 17 && ls.length, 'Loop + jog right did not lengthen the clip: ' + S.clipLength[T][0] + ' ' + JSON.stringify(sets.slice(0, 12)));
        cc(58, 127); info(); cc(14, 127); info(); ticks(1); cc(58, 0);
        assert(S.clipLength[T][0] === 16, 'Loop + jog left did not shorten it back: ' + S.clipLength[T][0]);
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

    step('⭐ turned on further: Free (Josh, 2026-11-13: "a mode ... irrespective of the sequencer\'s timing" · "yep") — the cell reads it, Offset leaves (no grid to move against)', () => {
        sets.length = 0;
        note(0, 127); turn(1, 30); note(0, 0);
        assert(freeSets().length === 1 && freeSets()[0] === '0 1' && !shotSets().length, 'Free not sent once: ' + JSON.stringify(sets));
        shot = 0; free = 1; info();
        const cells = A.auLoopBankCells(T);
        assert(cells[0].text === 'Free' && cells[0].options.join() === 'Loop,Shot,Free', 'the cell does not read Free: ' + JSON.stringify(cells[0]));
        assert(cells[2].kind === 'blank', 'a Free clip shows Offset: ' + JSON.stringify(cells[2]));
        sets.length = 0;
        note(0, 127); turn(1, 30); note(0, 0);
        assert(!freeSets().length && !shotSets().length, 'past Free it sent more: ' + JSON.stringify(sets));
    });

    step('⭐ Free: Strch x2 halves the Speed (twice as long), /2 doubles it; the clip\'s Length is not touched', () => {
        S.clipLength[T][0] = 16;
        sets.length = 0;
        A.auClipBankKnob(T, 1, 1);
        assert(speedSets().join() === '0 500' && S.clipLength[T][0] === 16, 'x2 on Free: ' + JSON.stringify(sets));
        speed = 500; info();
        sets.length = 0;
        A.auClipBankKnob(T, 1, -1);
        assert(speedSets().join() === '0 1000', '/2 on Free: ' + JSON.stringify(sets));
        speed = 1000; info();
        assert(!A.auClipBankKnob(T, 2, 1), 'Offset turned on a Free clip');
        /* REMIX works on bars: on a Free clip its setting is kept, read as --, and its knobs rest */
        assert(A.rmxBankCells(T).every((x) => x.text === '--'), 'REMIX on a Free clip: ' + A.rmxBankCells(T).map((x) => x.text).join());
        sets.length = 0;
        assert(!A.rmxBankKnob(T, 0, 1) && !sets.length, 'a REMIX knob turned on a Free clip: ' + JSON.stringify(sets));
    });

    step('⭐ Free: SAMPLE page 2 is Speed mode (Warp · Tape), Pitch, Detune, Gain, Speed, Revrs — no Bars (Josh: "why not keep sync? it\'d basically allow pitch and time to work independently")', () => {
        const p2 = A.auSampleP2Cells(T, 0);
        assert(p2.map((x) => x.label || '').join() === 'Spd Md,Pitch,Detune,Gain,Speed,,Revrs,', 'page 2 on Free: ' + p2.map((x) => x.label).join());
        assert(p2[0].text === 'Warp' && p2[4].text === '100%', 'Free\'s readings: ' + p2[0].text + ' ' + p2[4].text);
        sets.length = 0;
        A.auSampleP2Knob(T, 0, 1, 1);
        assert(sets.some(([k, v]) => k === 't' + T + '_au_set_sync' && v === '0 2'), 'Speed mode right is not Tape (Sync Pitch): ' + JSON.stringify(sets));
        sync = 2; info();
        assert(A.auSampleP2Cells(T, 0)[0].text === 'Tape', 'the cell does not read Tape');
        sets.length = 0;
        assert(A.auSpeedTurn(T, 0, 3) && speedSets().join() === '0 1030', 'Speed: 1 % a detent: ' + JSON.stringify(sets));
        S.shiftHeld = true; sets.length = 0; info();
        A.auSpeedTurn(T, 0, 1);
        S.shiftHeld = false;
        assert(speedSets().join() === '0 1001', 'Speed with Shift: 0.1 % a detent: ' + JSON.stringify(sets));
        info();
        assert(!A.auBarsTurn(T, 0, 1), 'Bars turned on a Free clip');
        /* the Track View's SAMPLE page: Speed mode and Speed for Sync and Tempo, no Nudge */
        assert(A.auPanelPageName({ t: T, page: 0 }) === 'SAMPLE', 'the Track View page is not SAMPLE: ' + A.auPanelPageName({ t: T, page: 0 }));
        const pc = A.auPanelCells({ t: T, page: 0 });
        assert(pc[7].label === 'Speed' && pc[6].label === 'Spd Md' && pc[5].kind === 'blank', 'the Track View page on Free: ' + pc.map((x) => x.label).join());
        sets.length = 0; info();
        A.auPanelKnob({ t: T, page: 0 }, 7, 1);
        assert(speedSets().length === 1 && !sets.some(([k]) => /set_bpm/.test(k)), 'the Track View K8 on Free is not Speed: ' + JSON.stringify(sets));
        info();
        sync = 0; info();
    });

    step('⭐ turned left from Free: Shot, then Loop', () => {
        sets.length = 0;
        note(0, 127); turn(-1, 30); note(0, 0);
        assert(shotSets().join() === '0 1', 'Shot not sent from Free: ' + JSON.stringify(sets));
        shot = 1; free = 0; info();
        sets.length = 0;
        note(0, 127); turn(-1, 30); note(0, 0);
        assert(shotSets().length === 1 && shotSets()[0] === '0 0', 'Loop not sent: ' + JSON.stringify(shotSets()));
    });

    process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
