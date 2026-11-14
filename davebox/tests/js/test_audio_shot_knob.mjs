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
 * bank, K1 is Mode: Loop · Shot, K2 Strch, and nothing else (2026-11-14: the
 * rest is SAMPLE's pages). Turned through the real input path (the deliberate
 * feel: a brush does not flip it), it sends the engine the clip's Shot and the
 * cell reads it. Free is SAMPLE's Sync, with Loop or Shot. */
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
/* the bulk write's blob: "<n>\n" then "<len>\n<item>" n times, key / value pairs */
globalThis.host_module_set_params = (blob) => {
    const it = []; const nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1;
    for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; it.push(blob.slice(p, p + len)); p += len; }
    for (let i = 0; i + 1 < it.length; i += 2) sets.push([it[i], it[i + 1]]);
    return true;
};
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
    globalThis.__dbxE = await import('../../ui/ui_audio_editor.mjs');
    const await_consts = await import('../../ui/ui_constants.mjs');
    const await_auto = await import('../../ui/ui_automation.mjs');
    const _kitText = [];
    (await import('../../ui/ui_fonts_pp.mjs')).setKitTextTrace((x) => _kitText.push(String(x)));
    const texts = (fn) => { _kitText.length = 0; fn(); return _kitText.slice(); };
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
    const T = 4;
    const shotSets = () => sets.filter(([k]) => k === 't' + T + '_au_set_shot').map(([, v]) => v);
    /* the clip's info is the engine's, refreshed each tick: hold it as the engine would report */
    let shot = 0, free = 0, speed = 1000, sync = 0;
    let rot = 0, dir = 0;
    const info = () => { S.auInfo[T] = S.auInfo[T] || []; S.auInfo[T][0] = { state: 2, mode: 0, name: 'Break.wav', nframes: 44100, rate: 44100, ch: 1, bpm10: 1200, rot, shot, free, speed, sync, rstart: 0, cut: 0, pitch: 0, detune: 0, gain: 0, nudge: 0, span: 0, dir }; };
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

    step('⭐⭐ the CLIP bank is K1 Mode (Loop · Shot), K2 Strch and K7 Dir, nothing else (Josh, 2026-11-14: "aside from clip bank mode and stretch, let\'s figure out a way to put everything on multiple audio editor pages" · "make reverse a clip param")', () => {
        const cells = A.auLoopBankCells(T);
        assert(cells[0] && cells[0].label === 'Mode' && cells[0].text === 'Loop', 'K1 is not Mode Loop: ' + JSON.stringify(cells[0]));
        assert(cells[0].options.join() === 'Loop,Shot', 'Mode is not Loop · Shot (Free is SAMPLE\'s Sync now): ' + cells[0].options.join());
        assert(cells.map((x) => x.label || '').join() === 'Mode,Strch,,,,,Dir,', 'the CLIP bank: ' + cells.map((x) => x.label).join());
        assert(cells[6].options.join() === 'Fwd,Bwd,PPf,PPb' && cells[6].text === 'Fwd', 'K7 Dir is not a MIDI clip\'s four: ' + JSON.stringify(cells[6]));
        assert(!A.knobAltOnTrack(T, 3, 0, 2), 'K3 has an alternate');
    });

    step('⭐⭐ K3-K6 and K8 on the CLIP bank set nothing and write no lane, through the real input path', () => {
        const knob = (k, dir, n) => { S.knobAccum[k] = 0; note(k, 127); for (let i = 0; i < n; i++) { info(); S.knobAccelLast[k] = 0; cc(71 + k, dir > 0 ? 1 : 127); } info(); note(k, 0); info(); };
        S.playing = true;
        for (let k = 2; k < 8; k++) {
            if (k === 6) continue;
            sets.length = 0; knob(k, 1, 30); ticks(1);
            assert(!sets.some(([x]) => /_au_set_|_pa_/.test(x)), 'K' + (k + 1) + ' set something: ' + JSON.stringify(sets));
        }
        S.playing = false;
        assert([0, 1, 2, 3, 4, 5, 7].every((k) => A.bankAutoTarget(T, 0, k, false) === null), 'a CLIP knob other than Dir has a lane');
        assert(A.bankAutoTarget(T, 0, 6, false) === 'seq:' + T + ':au_dir', 'Dir has no lane: ' + A.bankAutoTarget(T, 0, 6, false));
    });

    step('⭐⭐ K7 Dir: a detent a choice, through the real input path, written as the clip\'s and heard by automation; a Shot offers Fwd · Bwd alone, a ping-pong set before showing as its first way (Josh, 2026-11-14: "no sense in having those options when shot is selected")', () => {
        const knob = (k, d, n) => { S.knobAccum[k] = 0; note(k, 127); for (let i = 0; i < n; i++) { info(); S.knobAccelLast[k] = 0; cc(71 + k, d > 0 ? 1 : 127); } info(); note(k, 0); info(); };
        S.playing = true;
        sets.length = 0; knob(6, 1, 30); ticks(1);
        const ds = sets.filter(([k]) => k === 't' + T + '_au_set_dir').map(([, v]) => v);
        assert(ds.join() === '0 1', 'K7 right did not set Bwd once: ' + JSON.stringify(sets));
        assert(sets.some(([k, v]) => k === 't' + T + '_pa_live' && v.indexOf('seq:' + T + ':au_dir ') === 0), 'Dir did not reach its lane: ' + JSON.stringify(sets));
        S.playing = false;
        dir = 2; shot = 1; info();
        let c6 = A.auLoopBankCells(T)[6];
        assert(c6.options.join() === 'Fwd,Bwd' && c6.text === 'Fwd', 'a Shot\'s Dir is not Fwd · Bwd, PPf shown as Fwd: ' + JSON.stringify(c6));
        sets.length = 0; knob(6, 1, 30); ticks(1);
        assert(sets.filter(([k]) => k === 't' + T + '_au_set_dir').map(([, v]) => v).join() === '0 1', 'a Shot\'s K7 right did not go to Bwd: ' + JSON.stringify(sets));
        dir = 1; info();
        sets.length = 0; knob(6, 1, 30); ticks(1);
        assert(!sets.some(([k]) => k === 't' + T + '_au_set_dir'), 'a Shot\'s Dir went past Bwd: ' + JSON.stringify(sets));
        dir = 3; shot = 0; info();
        c6 = A.auLoopBankCells(T)[6];
        assert(c6.text === 'PPb' && c6.options.length === 4, 'back on Loop the ping-pong did not come back: ' + JSON.stringify(c6));
        dir = 0; info();
    });

    step('⭐⭐ Strch moves the waveform\'s grid, so touching it shows the waveform card; nothing else on CLIP does, and never on Free', () => {
        assert([0, 1, 2, 3, 4, 5, 6, 7].map((k) => (A.auClipWaveKnob(T, k) ? 1 : 0)).join('') === '01000000',
               'the knobs with a card: ' + [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (A.auClipWaveKnob(T, k) ? 1 : 0)).join(''));
        S.bankCardLatched = false;
        const card = (x) => /^120 BPM   0\.5 BARS$/.test(x);   /* whole: not cut short */
        info();
        assert(!texts(() => render.drawUI()).some(card), 'the card is up with no knob touched');
        note(1, 127); info();
        const tx = texts(() => render.drawUI());
        assert(tx.some(card) && tx.indexOf('STRETCH') >= 0, 'touching Strch does not show the card: ' + JSON.stringify(tx));
        note(1, 0); info();
        note(0, 127); info();
        assert(!texts(() => render.drawUI()).some(card), 'touching Mode shows the card');
        note(0, 0); info();
        free = 1; info();
        assert(!A.auClipWaveKnob(T, 1), 'a Free clip shows the card');
        free = 0; info();
    });

    step('⭐⭐ on SAMPLE\'s TIME page, touching Offset, Tempo or Bars shows the waveform card; Sync, Warp and Nudge do not; on Free, Offset alone (Josh, 2026-11-14: "any parameters on a following page that requires our changes waveform visualization gets a waveform visual popup")', () => {
        const E = globalThis.__dbxE;
        E.openWave(T, 'sample'); info(); ticks(2); info();
        assert(S.auEditor, 'SAMPLE did not open');
        cc(14, 1); info(); ticks(1); info();
        assert(S.auEditor.page === 1, 'not on TIME: page ' + S.auEditor.page);
        const card = (x) => /^120 BPM   0\.5 BARS$/.test(x);
        const touched = (k) => { note(k, 127); info(); const tx = texts(() => render.drawUI()); note(k, 0); info(); return tx; };
        assert(!texts(() => render.drawUI()).some(card), 'the card is up with no knob touched');
        const got = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (touched(k).some(card) ? 1 : 0)).join('');
        assert(got === '00010011', 'the TIME knobs with a card: ' + got);
        assert(touched(3).indexOf('OFFSET') >= 0, 'the card does not name Offset');
        free = 1; info();
        const fgot = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (touched(k).some((x) => /^SPEED 100%$/.test(x)) ? 1 : 0)).join('');
        assert(fgot === '00010000', 'on Free, the TIME knobs with a card: ' + fgot);
        free = 0; info();
        while (S.auEditor) { cc(51, 127); cc(51, 0); info(); ticks(1); }
        S.activeBank = 0; info();
    });

    step('⭐ its knob rings: K1-K2 and K7 lit, the rest dark — nothing there (Josh, 2026-11-12: "clip bank knob led rings are lit on empty knobs, which they shouldn\'t be per the general UI conventions")', () => {
        S.bankCardLatched = false;
        for (let i = 0; i < 4; i++) { info(); render.drawUI(); ticks(1); }
        const lit = [71, 72, 73, 74, 75, 76, 77, 78].map((c) => (CCLEDS.get(c) ? 1 : 0)).join('');
        assert(lit === '11000010', 'the CLIP bank rings: ' + lit + ' ' + JSON.stringify([71, 72, 73, 74, 75, 76, 77, 78].map((c) => CCLEDS.get(c))));
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

    step('⭐ turned on further: nothing more — Mode is Loop · Shot', () => {
        sets.length = 0;
        note(0, 127); turn(1, 30); note(0, 0);
        assert(!freeSets().length && !shotSets().length, 'past Shot it sent more: ' + JSON.stringify(sets));
    });

    step('⭐⭐ Free goes with Shot (Josh, 2026-11-14: "free isn\'t really a clip mode. it should be available in both loop and one shot"): SAMPLE\'s Sync turns it on, Mode stays Shot, the header says both', () => {
        sets.length = 0;
        assert(A.auFreeTurn(T, 0, 1) && freeSets().join() === '0 1' && !shotSets().length, 'Sync Free: ' + JSON.stringify(sets));
        free = 1; info();
        assert(A.auLoopBankCells(T)[0].text === 'Shot', 'Mode did not stay Shot under Free: ' + A.auLoopBankCells(T)[0].text);
        assert(A.auSampleP2Cells(T, 0)[0].text === 'Free', 'Sync does not read Free');
        S.knobTouched = -1; S.bankCardLatched = false;
        const htx = texts(() => render.drawUI());
        assert(htx.some((x) => /^shot free 100% /i.test(x)), 'the header does not say Shot Free: ' + JSON.stringify(htx.slice(0, 8)));
        sets.length = 0;
        assert(!A.auFreeTurn(T, 0, 1) && !sets.length, 'Free again sent something');
    });

    step('⭐ Free: Strch x2 halves the Speed (twice as long), /2 doubles it; the clip\'s Length is not touched; Offset and Nudge turn, Bars does not', () => {
        S.clipLength[T][0] = 16;
        sets.length = 0;
        A.auClipBankKnob(T, 1, 1);
        assert(speedSets().join() === '0 500' && S.clipLength[T][0] === 16, 'x2 on Free: ' + JSON.stringify(sets));
        speed = 500; info();
        sets.length = 0;
        A.auClipBankKnob(T, 1, -1);
        assert(speedSets().join() === '0 1000', '/2 on Free: ' + JSON.stringify(sets));
        speed = 1000; info();
        sets.length = 0;
        assert(A.auOffsetStep(T, 0, 1) && sets.some(([k, v]) => k === 't' + T + '_au_set_rot' && v === '0 24'), 'Offset on a Free clip: ' + JSON.stringify(sets));
        info();
        sets.length = 0;
        assert(A.auNudgeStep(T, 0, 1) && sets.some(([k]) => k === 't' + T + '_au_set_nudge'), 'Nudge on a Free clip: ' + JSON.stringify(sets));
        info();
        assert(!A.auBarsTurn(T, 0, 1), 'Bars turned on a Free clip');
        /* REMIX works on bars: on a Free clip its setting is kept, read as --, and its knobs rest */
        assert(A.rmxBankCells(T).every((x) => x.text === '--'), 'REMIX on a Free clip: ' + A.rmxBankCells(T).map((x) => x.text).join());
        sets.length = 0;
        assert(!A.rmxBankKnob(T, 0, 1) && !sets.length, 'a REMIX knob turned on a Free clip: ' + JSON.stringify(sets));
    });

    step('⭐ Free: SAMPLE\'s TIME page is Sync (Free), Warp (Pitch · Warp), Nudge, Offset, Speed on Tempo\'s knob, Bars -- (Josh, 2026-11-14: "warp for sync and sync for clock")', () => {
        const p2 = A.auSampleP2Cells(T, 0);
        assert(p2.map((x) => x.label || '').join() === 'Sync,Warp,Nudge,Offst,,,Speed,Bars', 'TIME on Free: ' + p2.map((x) => x.label).join());
        assert(p2[1].text === 'Warp' && p2[1].options.join() === 'Pitch,Warp' && p2[6].text === '100%' && p2[7].text === '--',
               'Free\'s readings: ' + p2.map((x) => x.text).join());
        sets.length = 0;
        A.auSampleP2Knob(T, 0, 1, -1);
        assert(sets.some(([k, v]) => k === 't' + T + '_au_set_sync' && v === '0 2'), 'Warp left is not Pitch (speed and pitch together): ' + JSON.stringify(sets));
        sync = 2; info();
        assert(A.auSampleP2Cells(T, 0)[1].text === 'Pitch', 'the cell does not read Pitch');
        sets.length = 0;
        assert(A.auSpeedTurn(T, 0, 3) && speedSets().join() === '0 1030', 'Speed: 1 % a detent: ' + JSON.stringify(sets));
        S.shiftHeld = true; sets.length = 0; info();
        A.auSpeedTurn(T, 0, 1);
        S.shiftHeld = false;
        assert(speedSets().join() === '0 1001', 'Speed with Shift: 0.1 % a detent: ' + JSON.stringify(sets));
        /* down to 1 % (Josh, 2026-11-13: "can we make speed minimum lower?"), not past it */
        speed = 30; info(); sets.length = 0;
        A.auSpeedTurn(T, 0, -5);
        assert(speedSets().join() === '0 10', 'Speed does not stop at 1 %: ' + JSON.stringify(sets));
        speed = 10; info();
        assert(A.auSampleP2Cells(T, 0)[6].text === '1%' && !A.auSpeedTurn(T, 0, -1), 'Speed at 1 %: ' + A.auSampleP2Cells(T, 0)[6].text);
        speed = 1000; info();
        /* the panel's SAMPLE page: Warp and Speed where Sync and Tempo were */
        assert(A.auPanelPageName({ t: T, page: 0 }) === 'SAMPLE', 'the panel page is not SAMPLE: ' + A.auPanelPageName({ t: T, page: 0 }));
        const pc = A.auPanelCells({ t: T, page: 0 });
        assert(pc[7].label === 'Speed' && pc[6].label === 'Warp', 'the panel page on Free: ' + pc.map((x) => x.label).join());
        sets.length = 0; info();
        A.auPanelKnob({ t: T, page: 0 }, 7, 1);
        assert(speedSets().length === 1 && !sets.some(([k]) => /set_bpm/.test(k)), 'the panel K8 on Free is not Speed: ' + JSON.stringify(sets));
        info();
        sync = 0; rot = 0; info();
        sets.length = 0;
        assert(A.auFreeTurn(T, 0, -1) && freeSets().join() === '0 0', 'Sync back to Grid: ' + JSON.stringify(sets));
        free = 0; info();
    });

    step('⭐ TIME\'s reset (Delete + click on it): Sync Grid, Warp Warp, Nudge 0, Offset 0 — the Tempo and Bars, the sample\'s own, stay', () => {
        free = 1; sync = 2; rot = 48; info();
        S.auInfo[T][0] = Object.assign({}, S.auInfo[T][0], { nudge: 20, span: 768 });
        sets.length = 0;
        assert(A.auTimeReset(T, 0), 'nothing reset');
        const got = sets.filter(([k]) => /_au_set_/.test(k)).map(([k, v]) => k.replace('t' + T + '_au_set_', '') + '=' + v).sort().join();
        assert(got === 'free=0 0,nudge=0 0,rot=0 0,sync=0 0', 'TIME reset: ' + got);
        free = 0; sync = 0; rot = 0; info();
        sets.length = 0;
        assert(!A.auTimeReset(T, 0) && !sets.length, 'a reset at the defaults sent something: ' + JSON.stringify(sets));
    });

    step('⭐ turned left: Loop', () => {
        sets.length = 0;
        note(0, 127); turn(-1, 30); note(0, 0);
        assert(shotSets().length === 1 && shotSets()[0] === '0 0', 'Loop not sent: ' + JSON.stringify(shotSets()));
    });

    step('Strch\'s x2 is the turn in hand: let go, and a later bare touch reads 1x (it kept x2)', () => {
        info();
        S.auStrchDir = { t: T, dir: 1 };
        S.knobTouched = 1;
        assert(A.auLoopBankCells(T)[1].text === 'x2', 'control: the turn in hand does not read x2');
        S.knobTouched = -1; ticks(2);
        S.knobTouched = 1;
        assert(A.auLoopBankCells(T)[1].text === '1x', 'a bare touch after letting go reads ' + A.auLoopBankCells(T)[1].text);
        S.knobTouched = -1;
    });

    step('⭐ Delete + click on the CLIP bank: Mode back to Loop, Dir to Fwd, and nothing of the MIDI CLIP bank (Res / InQ / its Dir) it does not show', () => {
        shot = 1; free = 0; dir = 3; info();
        S.activeBank = 0; S.sessionView = false; S.knobTouched = -1;
        sets.length = 0;
        cc(119, 127); cc(3, 127); cc(3, 0); cc(119, 0);
        ticks(4);
        const midi = sets.filter(([k]) => /_clip_resolution|_diq|_clip_playback_dir|_clip_playback_audio_reverse/.test(k));
        assert(!midi.length, 'the reset wrote the MIDI CLIP bank\'s settings: ' + JSON.stringify(midi));
        assert(shotSets().join() === '0 0', 'Mode not reset to Loop: ' + JSON.stringify(sets));
        assert(sets.filter(([k]) => k === 't' + T + '_au_set_dir').map(([, v]) => v).join() === '0 0', 'Dir not reset to Fwd: ' + JSON.stringify(sets));
        shot = 0; dir = 0; info(); sets.length = 0;
        cc(119, 127); cc(3, 127); cc(3, 0); cc(119, 0);
        ticks(4);
        assert(!shotSets().length && !sets.some(([k]) => /_clip_resolution|_diq/.test(k)), 'a reset at Loop sent something: ' + JSON.stringify(sets));
    });

    step('⭐ Delete + click on REMIX: the clip\'s REMIX back to a fresh clip\'s, one undo step first; at the defaults, nothing', () => {
        const CONSTS = await_consts;
        S.rmxSet[T] = [1, 3, 17, 0, 40, 30, 0, 0, 5, 0, 100];
        S.activeBank = CONSTS.BANK_REMIX; S.knobTouched = -1; sets.length = 0;
        cc(119, 127); cc(3, 127); cc(3, 0); cc(119, 0);
        ticks(4);
        const ks = sets.filter(([k]) => !/_padmap$/.test(k)).map(([k, v]) => k.replace('t' + T + '_', '') + '=' + v);
        assert(ks[0] === 'au_undo=0', 'the undo step is not first: ' + JSON.stringify(ks));
        for (const w of ['remix_on=0', 'remix_type=0', 'remix_var=0', 'remix_rvel=1'])
            assert(ks.includes(w), 'REMIX reset did not send ' + w + ': ' + JSON.stringify(ks));
        sets.length = 0;
        cc(119, 127); cc(3, 127); cc(3, 0); cc(119, 0);
        ticks(4);
        assert(!sets.some(([k]) => /remix_|au_undo/.test(k)), 'a reset at the defaults sent something: ' + JSON.stringify(sets));
        S.activeBank = 0;
    });

    step('⭐ SOUND\'s reset is one undo step, and takes the Pitch lane with it (a lane left would put Pitch back)', () => {
        const AUTO = await_auto;
        const gp = globalThis.host_module_get_param;
        globalThis.host_module_get_param = (k) => (String(k) === 'pa_list' ? T + ' 0 1 4 seq:' + T + ':au_pitch 0 0\n' : gp(k));
        AUTO.automationRefreshPresence();
        assert(AUTO.automationStateFor(T, 0, 'seq:' + T + ':au_pitch'), 'rig: no Pitch lane');
        info(); sets.length = 0;
        assert(A.auSampleReset(T, 0), 'nothing reset');
        ticks(4);
        const ks = sets.map(([k, v]) => k.replace('t' + T + '_', '') + '=' + v);
        assert(ks[0] === 'au_undo=0', 'the undo step is not first: ' + JSON.stringify(ks));
        assert(ks.includes('pa_clear_key=0 seq:' + T + ':au_pitch'), 'the Pitch lane stayed: ' + JSON.stringify(ks));
        assert(!ks.some((k) => /pa_clear_key=0 seq:\d:au_gain/.test(k)), 'a lane that does not exist was cleared: ' + JSON.stringify(ks));
        globalThis.host_module_get_param = gp;
        AUTO.automationRefreshPresence();
    });

    process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
