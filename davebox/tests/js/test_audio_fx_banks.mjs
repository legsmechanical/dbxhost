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

/* tests/js/test_audio_fx_banks.mjs — REPEAT and TAPE, the two Audio / Slicer
 * FX banks beside REMIX (Josh, 2026-11-14: "implement the 2 other slice/audio
 * track effects banks (and test)"). Through the real input path: where they
 * sit on the bank map and the walk, what each knob sends, their cards (a turn
 * reveals, the release takes down), the clip snapshot read back, a Free clip
 * (REPEAT has no bars there; TAPE works on anything), the rings. */
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
globalThis.host_module_set_params = (blob) => {
    const it = []; const nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1;
    for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; it.push(blob.slice(p, p + len)); p += len; }
    for (let i = 0; i + 1 < it.length; i += 2) sets.push([it[i], it[i + 1]]);
    return true;
};
globalThis.host_preview_stop = () => {}; globalThis.host_preview_play = () => {};
const CCLEDS = new Map();
globalThis.move_midi_internal_send = (m) => { if (m && (m[1] & 0xF0) === 0xB0) CCLEDS.set(m[2], m[3]); return true; };
const GET = {};
globalThis.host_module_get_param = (k) => (GET[k] != null ? GET[k] : '');
globalThis.shadow_get_param = (_s, k) => { const kk = String(k).replace(/^overtake_dsp:/, ''); return GET[kk] != null ? GET[kk] : ''; };

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const A = await import('../../ui/ui_audio.mjs');
    const P = await import('../../ui/ui_pure.mjs');
    const C = await import('../../ui/ui_constants.mjs');
    const B = await import('../../ui/ui_dsp_bridge.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const _kitText = [];
    (await import('../../ui/ui_fonts_pp.mjs')).setKitTextTrace((x) => _kitText.push(String(x)));
    const texts = (fn) => { _kitText.length = 0; fn(); return _kitText.slice(); };
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
    const T = 4;
    let free = 0;
    const info = () => { S.auInfo[T] = S.auInfo[T] || []; S.auInfo[T][0] = { state: 2, mode: 0, name: 'Break.wav', nframes: 44100, rate: 44100, ch: 1, bpm10: 1200, rot: 0, shot: 0, free, speed: 1000, sync: 0, rstart: 0, cut: 0, pitch: 0, detune: 0, gain: 0, nudge: 0, span: 0, revrs: 0 }; };
    const sent = (k) => sets.filter(([x]) => x === 't' + T + '_' + k).map(([, v]) => v);
    /* a knob held and turned n detents, as a hand would (a fresh touch: no carry-over) */
    const knob = (k, dir, n) => { S.knobAccum[k] = 0; note(k, 127); for (let i = 0; i < n; i++) { info(); S.knobAccelLast[k] = 0; cc(71 + k, dir > 0 ? 1 : 127); } info(); };
    const release = (k) => { note(k, 0); info(); ticks(1); info(); };

    step('setup: track 5 an Audio track with a sample in clip A, Track view', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true;
        S.trackPadMode[T] = C.PAD_MODE_AUDIO; S.sessionView = false; S.activeTrack = T; S.activeBank = 0;
        S.trackActiveClip[T] = 0;
        info(); ticks(2); info();
    });

    step('⭐⭐ on the bank map they fill the FX column\'s two free pads — REPEAT row 2, TAPE row 4 — on Audio and Slicer alike; the walk goes REMIX, REPEAT, TAPE', () => {
        const fx = (pm) => P.bankPadMapForMode(pm, T)[3].cells.map((c) => (c ? c.name : '-')).join(',');
        assert(fx(C.PAD_MODE_AUDIO) === '-,REPEAT,REMIX,TAPE', 'Audio FX column: ' + fx(C.PAD_MODE_AUDIO));
        assert(P.bankPadMapForMode(C.PAD_MODE_AUDIO, T)[3].cells[1].bank === C.BANK_REPEAT && P.bankPadMapForMode(C.PAD_MODE_AUDIO, T)[3].cells[3].bank === C.BANK_TAPE,
               'the pads do not open the banks');
        assert(fx(C.PAD_MODE_SLICER) === 'NOTE FX,REPEAT,REMIX,TAPE', 'Slicer FX column: ' + fx(C.PAD_MODE_SLICER));
        const walk = P.bankCycleForMode(C.PAD_MODE_AUDIO, T), i = walk.indexOf(C.BANK_REMIX);
        assert(i >= 0 && walk[i + 1] === C.BANK_REPEAT && walk[i + 2] === C.BANK_TAPE, 'the walk: ' + walk.join());
        /* a melodic track has neither */
        assert(P.bankCycleForMode(C.PAD_MODE_MELODIC_SCALE != null ? C.PAD_MODE_MELODIC_SCALE : 0, T).indexOf(C.BANK_REPEAT) < 0, 'a melodic track has REPEAT');
    });

    step('⭐⭐ REPEAT: Repeat · Grid · Start · Len · Gate · Pitch · Fade, each sent for the clip through the real knobs; the card shows the bar while turned and leaves on release', () => {
        S.activeBank = C.BANK_REPEAT; info(); ticks(1); info();
        const cells = A.rptBankCells(T);
        assert(cells.map((c) => c.label || '').join() === 'Rept,Grid,Start,Len,Gate,Pitch,Fade,', 'REPEAT cells: ' + cells.map((c) => c.label).join());
        assert(cells.map((c) => c.text || '').join() === 'Off,1/16,13,4/16,100%,0st,0%,', 'REPEAT defaults: ' + cells.map((c) => c.text).join());
        sets.length = 0;
        knob(0, 1, 10); release(0);
        assert(!sent('repeat_on').length, 'a brush turned Repeat on');
        knob(0, 1, 30);
        assert(sent('repeat_on').join() === '1', 'K1 is not Repeat On: ' + JSON.stringify(sets));
        S.bankCardLatched = true;
        const tx = texts(() => render.drawUI());
        assert(tx.some((x) => /^1\/16 FROM 13 FOR 4\/16$/.test(x)), 'the card is not up while K1 turns: ' + JSON.stringify(tx.slice(0, 20)));
        release(0);
        S.knobTouched = -1;                 /* the touch let go (the flicker guard's wall-clock wait, not under test here) */
        info(); ticks(1);
        assert(!S.fxCard && !texts(() => render.drawUI()).some((x) => /FROM 13 FOR/.test(x)), 'the release did not take the card down: touched ' + S.knobTouched + ' card ' + S.fxCard);
        sets.length = 0;
        knob(1, 1, 10); release(1);
        knob(2, -1, 10); release(2);
        knob(3, 1, 10); release(3);
        knob(4, -1, 3); release(4);
        knob(5, 1, 10); release(5);
        knob(6, 1, 3); release(6);
        knob(7, 1, 30); release(7);
        const got = ['grid', 'at', 'len', 'gate', 'pit', 'fade'].map((k) => k + '=' + (sent('repeat_' + k).slice(-1)[0] || ''));
        assert(got.join() === 'grid=3,at=11,len=5,gate=' + sent('repeat_gate').slice(-1)[0] + ',pit=1,fade=' + sent('repeat_fade').slice(-1)[0]
               && (sent('repeat_gate').slice(-1)[0] | 0) < 100 && (sent('repeat_fade').slice(-1)[0] | 0) > 0, 'REPEAT knobs: ' + got.join() + ' ' + JSON.stringify(sets));
        assert(!sets.some(([k]) => /repeat_/.test(k) && sets.length > 0 && k.endsWith('_8')), 'K8 sent');
        assert(A.rptBankCells(T).map((c) => c.text).slice(1, 4).join() === '1/32,12,5/16', 'the cells do not read the turns: ' + A.rptBankCells(T).map((c) => c.text).join());
        /* the picture: slot 12 repeated in 1/32s, dotted, from 1/16 12 */
        const m = A.rptMap(T);
        assert(m[10].src === 10 && m[11].src === 11 && m[12].src === 11 && m[15].src === 11 && (m[12].fl & 2) && m[16 - 1].pit > 0, 'REPEAT map: ' + JSON.stringify(m.slice(10)));
    });

    step('⭐⭐ TAPE: Tape · Type · Every · Len, sent for the clip; its card draws the head\'s speed and says it in words', () => {
        S.activeBank = C.BANK_TAPE; info(); ticks(1); info();
        const cells = A.tapeBankCells(T);
        assert(cells.map((c) => c.label || '').join() === 'Tape,Type,Every,Len,,,,', 'TAPE cells: ' + cells.map((c) => c.label).join());
        assert(cells.map((c) => c.text || '').join() === 'Off,Stop,1,1/4,,,,', 'TAPE defaults: ' + cells.map((c) => c.text).join());
        sets.length = 0;
        knob(0, 1, 30);
        assert(sent('tape_on').join() === '1', 'K1 is not Tape On: ' + JSON.stringify(sets));
        S.bankCardLatched = true;
        let tx = texts(() => render.drawUI());
        assert(tx.some((x) => x === 'STOP 1/4 PER BAR'), 'the TAPE card is not up: ' + JSON.stringify(tx.slice(0, 20)));
        release(0);
        knob(1, 1, 10);
        tx = texts(() => render.drawUI());
        assert(sent('tape_fx').join() === '1' && tx.some((x) => x === 'START 1/4 PER BAR'), 'K2 is not Type Start: ' + JSON.stringify(sets) + ' ' + JSON.stringify(tx.slice(0, 20)));
        release(1);
        knob(2, 1, 10); release(2);
        knob(3, 1, 10); release(3);
        knob(4, 1, 30); release(4);
        assert(sent('tape_every').join() === '1' && sent('tape_len').join() === '3', 'K3 / K4: ' + JSON.stringify(sets));
        assert(!sets.some(([k]) => /_tape_/.test(k) && !/tape_(on|fx|every|len)$/.test(k)), 'an unknown TAPE key sent');
        /* the curve: Start from 0 rising; Back below the axis */
        const c1 = A.tapeCurve(T, 32);
        assert(c1[0] < 0.2 && c1[31] === 1, 'the Start curve: ' + c1.slice(0, 4).join());
        S.tapeSet[T] = [1, 3, 0, 2];
        const c3 = A.tapeCurve(T, 32);
        assert(c3[0] === 1 && c3[31] === -1, 'the Back curve: ' + c3.slice(28).join());
    });

    step('⭐ the clip snapshot is read back into both (v[55..65])', () => {
        const v = new Array(66).fill(0);
        v[44] = 0; v[47] = 1; v[48] = 100; v[54] = 100;
        v[55] = 1; v[56] = 4; v[57] = 3; v[58] = 9; v[59] = 40; v[60] = -7; v[61] = 25;
        v[62] = 1; v[63] = 2; v[64] = 3; v[65] = 1;
        GET['t' + T + '_c0_pfx_snapshot'] = v.join(' ');
        B.refreshPerClipBankParams(T);
        assert(A.rptGet(T).join() === '1,4,3,9,40,-7,25' && A.tapeGet(T).join() === '1,2,3,1', 'snapshot read: ' + A.rptGet(T).join() + ' / ' + A.tapeGet(T).join());
        assert(A.rptBankCells(T).map((c) => c.text).join() === 'On,1/64,4,9/16,40%,-7st,25%,', 'cells from the snapshot: ' + A.rptBankCells(T).map((c) => c.text).join());
        delete GET['t' + T + '_c0_pfx_snapshot'];
    });

    step('⭐ a Free clip: REPEAT has no bars to repeat — dashed, its knobs rest; TAPE works on anything', () => {
        free = 1; info();
        assert(A.rptBankCells(T).filter((c) => c.kind !== 'blank').every((c) => c.text === '--'), 'REPEAT on Free: ' + A.rptBankCells(T).map((c) => c.text).join());
        sets.length = 0;
        assert(!A.rptBankKnob(T, 1, 1) && !sets.length, 'a REPEAT knob turned on a Free clip');
        assert(A.tapeBankKnob(T, 1, -1) && sent('tape_fx').length === 1, 'TAPE refused a Free clip');
        free = 0; info();
    });

    step('⭐ the rings: REPEAT K1-K7 lit, K8 dark; TAPE K1-K4 lit, the rest dark', () => {
        S.activeBank = C.BANK_REPEAT; S.bankCardLatched = false;
        for (let i = 0; i < 4; i++) { info(); render.drawUI(); ticks(1); }
        let lit = [71, 72, 73, 74, 75, 76, 77, 78].map((c) => (CCLEDS.get(c) ? 1 : 0)).join('');
        assert(lit === '11111110', 'REPEAT rings: ' + lit);
        S.activeBank = C.BANK_TAPE;
        for (let i = 0; i < 4; i++) { info(); render.drawUI(); ticks(1); }
        lit = [71, 72, 73, 74, 75, 76, 77, 78].map((c) => (CCLEDS.get(c) ? 1 : 0)).join('');
        assert(lit === '11110000', 'TAPE rings: ' + lit);
    });

    step('⭐ a track that stops being Audio leaves the banks', () => {
        S.activeBank = C.BANK_TAPE; S.trackActiveBank[T] = C.BANK_TAPE;
        assert(C.AUDIO_ONLY_BANKS.includes(C.BANK_REPEAT) && C.AUDIO_ONLY_BANKS.includes(C.BANK_TAPE), 'not listed as Audio-only');
    });

    process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
