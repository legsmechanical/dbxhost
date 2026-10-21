/* tests/js/test_instr_none.mjs — the NONE instrument is a SCHWUNG TRACK WITH
 * NOTHING LOADED.
 *
 * Josh, 2026-10-21: "Instrument - "None" should present as if the track were a
 * schwung track with no instrument loaded (basically a schwung track on a
 * default project that hasn't had an instrument assigned yet). This to
 * facilitate schwung chain preset loading without having to select a dummy
 * schwung instrument first." (None was a route of its own — 'none', 3 — from
 * 2026-09-05 until then.)
 *
 * The REAL gesture: TRACK CONFIG via the bank map, Shift + click the
 * Instrument row, jog to None, click — and what is then on the menu. Plus the
 * legacy load: a project saved with a None track opens as this state. The DSP
 * still accepts 'none' (tests/test_route_none.c) so an old file loads. */
import './_bulk_get_stub.mjs';
import { readFileSync } from 'fs';
import { openTrackConfigViaMap } from './_map_config.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const loaded = {};                       /* `${slot}:${comp}` -> module id */
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k !== 'string') return '';
    const m = k.match(/^(.*):module$/);
    return m ? (loaded[slot + ':' + m[1]] || '') : '';
};
globalThis.shadow_set_param = (slot, k, v) => {
    if (typeof k !== 'string') return;
    const m = k.match(/^(.*):module$/);
    if (m) { if (v) loaded[slot + ':' + m[1]] = String(v); else delete loaded[slot + ':' + m[1]]; }
};
const writes = [];
let ctxTag = 'init';
globalThis.host_module_set_param = (k, v) => { writes.push([ctxTag, String(k), String(v)]); };
globalThis.host_module_set_params = (blob) => {
    const str = String(blob); let p = 0;
    const nl0 = str.indexOf('\n'); const count = parseInt(str.slice(0, nl0), 10); p = nl0 + 1;
    const rec = () => { const nl = str.indexOf('\n', p); const n = parseInt(str.slice(p, nl), 10);
                        const v = str.slice(nl + 1, nl + 1 + n); p = nl + 1 + n; return v; };
    for (let i = 0; i + 1 < count; i += 2) { const k = rec(), v = rec(); writes.push([ctxTag + ':BULK', k, v]); }
    return true;
};
let routeAnswer = {};                    /* tN_route as the DSP answers it on a project load */
globalThis.host_module_get_param = (k) => (routeAnswer[k] !== undefined ? routeAnswer[k] : '');
for (const fn of ['host_system_cmd', 'host_vol_block', 'host_edit_cc_block', 'move_midi_internal_send',
                  'set_led', 'stipple_rect', 'draw_line', 'flush_display', 'host_open_service',
                  'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'clear_screen', 'print', 'fill_rect', 'draw_rect', 'set_pixel'])
    globalThis[fn] = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.shadow_save_state_now = () => true;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');
const R = await import('../../ui/ui_render.mjs');
const P = await import('../../ui/ui_pure.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
snd.soundSetGeneratorScanForTest(() => [{ id: 'nusaw', name: 'NuSaw' }]);

function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function ticks(n) {
    for (let i = 0; i < n; i++) {
        S.tickCount++; S.clockMs += 11;
        ctxTag = 'tick#' + S.tickCount; tickmod._tickImpl(); ctxTag = 'between';
    }
}
const cc = (d1, d2) => {
    const prev = ctxTag; ctxTag = 'cc(' + d1 + ',' + d2 + ')';
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    ctxTag = prev;
};
/* TRACK CONFIG → Shift + click Instrument → jog to `name` → click. */
function pickInstrument(name) {
    if (snd.soundActive()) { snd.soundExit(); ticks(2); }
    openTrackConfigViaMap(); ticks(6);
    const st = snd.soundPickStateForTest();
    if (st.kinds[st.row] !== 'trackto') throw new Error('the menu did not land on Instrument: ' + st.kinds[st.row]);
    cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0); ticks(4);
    const p = snd.soundEnumPickForTest();
    if (!p) throw new Error('Shift + click did not open the Instrument picker');
    const want = p.options.indexOf(name);
    if (want < 0) throw new Error(name + ' is not offered: ' + JSON.stringify(p.options));
    for (let g = 0; g < p.options.length + 2 && snd.soundEnumPickForTest().sel !== want; g++)
        cc(14, snd.soundEnumPickForTest().sel < want ? 1 : 127);
    writes.length = 0;
    cc(3, 127); cc(3, 0);
}
const routeWrites = (t) => writes.filter(([, k]) => k === 't' + t + '_route').map(([tag, , v]) => tag + '=' + v);
/* The full Schwung menu: MIDI FX, Instrument, FX 1-4, the levels, Presets. */
function assertSchwungMenu() {
    const st = snd.soundPickStateForTest();
    const blocks = st.kinds.filter(k => k === 'block').length;
    if (st.kinds.indexOf('trackto') < 0 || blocks < 3 || st.kinds.indexOf('buslevel') < 0 || st.kinds.indexOf('patches') < 0)
        throw new Error('not the Schwung menu: ' + st.kinds.join(','));
}

step('setup: track 1 a MOVE track (out of the box), track 2 a Schwung track playing NuSaw', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    for (let t = 0; t < 8; t++) S.trackChannel[t] = t + 1;
    S.activeTrack = 0; S.trackRoute[0] = 1; S.trackRoute[1] = 0;
    loaded['1:synth'] = 'nusaw';
    ticks(8);
});

step('the picker offers None FIRST, behind its own divider, as a word', () => {
    const rows = C.instrPickerRows(S.trackRoute, 0, []);
    if (!rows[0] || rows[0].v !== C.INSTR_NONE) throw new Error('first row is not None: ' + JSON.stringify(rows[0]));
    if (!rows[1] || !rows[1].divider) throw new Error('no divider after None');
    if (C.fmtInstr(C.INSTR_NONE) !== 'None') throw new Error('fmtInstr(NONE)=' + C.fmtInstr(C.INSTR_NONE));
});

step('⭐ None on a MOVE track: the track becomes Schwung (one route write, its own callback), nothing loaded, the whole chain menu with Presets', () => {
    pickInstrument('None');
    ticks(12);
    if (S.trackRoute[0] !== 0) throw new Error('route ' + S.trackRoute[0] + ', not Schwung');
    const rw = routeWrites(0);
    if (rw.length !== 1 || !/=schwung$/.test(rw[0])) throw new Error('t0_route writes: ' + JSON.stringify(rw));
    const shared = writes.filter(([tag, k]) => tag === rw[0].split('=')[0] && /^t0_/.test(k) && k !== 't0_route');
    if (shared.length) throw new Error('the route write shares its callback with ' + JSON.stringify(shared));
    if (loaded['0:synth']) throw new Error('a generator is loaded: ' + loaded['0:synth']);
    assertSchwungMenu();
    if (B.instrValueFor(0) !== C.INSTR_SCHWUNG) throw new Error('instrValueFor=' + B.instrValueFor(0));
    R.refreshInstrAbbrev();
    if (S.instrAbbrev !== '--') throw new Error('header [' + S.instrAbbrev + '], not [--] (a Schwung track with nothing loaded)');
});

step('the bank map lights every module pad on it, as on any Schwung track', () => {
    for (const p of P.BANK_MAP_MODULE_PADS)
        if (!P.bankMapModuleAt(S.trackRoute[0], S.trackPadMode[0], p.col, p.row)) throw new Error(p.comp + ' pad dark');
});

step('⭐ None on a Schwung track with a generator: Remove — the generator goes, the track stays Schwung', () => {
    S.activeTrack = 1; ticks(4);
    pickInstrument('[NuSaw]');                       /* rig: the cursor reaches the loaded one */
    ticks(4);
    pickInstrument('None');
    ticks(8);
    if (loaded['1:synth']) throw new Error('the generator is still loaded: ' + loaded['1:synth']);
    if (S.trackRoute[1] !== 0) throw new Error('route ' + S.trackRoute[1]);
    if (routeWrites(1).length) throw new Error('a route write on a track already Schwung: ' + JSON.stringify(routeWrites(1)));
    assertSchwungMenu();
});

step('⭐ LEGACY: a project saved with a None track opens as a Schwung track with nothing loaded', () => {
    snd.soundExit(); ticks(2);
    loaded['2:synth'] = 'parked-drone';              /* what None had parked in the slot */
    routeAnswer = { t2_route: 'none' };
    S.pendingDspSync = 0;
    B.syncClipsFromDsp();
    if (S.trackRoute[2] !== 0) throw new Error('route ' + S.trackRoute[2] + ' after the load');
    if (loaded['2:synth']) throw new Error('the parked generator is still loaded: ' + loaded['2:synth']);
    routeAnswer = {};
    writes.length = 0;
    ticks(4);
    if (!writes.some(([, k, v]) => k === 't2_route' && v === 'schwung')) throw new Error('the DSP was not told: ' + JSON.stringify(writes.filter(([, k]) => /route/.test(k))));
});

step('source pins: nothing sets the None route any more; the DSP still loads it', () => {
    const snd_ = readFileSync('ui/ui_sound.mjs', 'utf8');
    if (/ROUTE_NONE/.test(snd_)) throw new Error('ui_sound.mjs still branches on the None route');
    const br = readFileSync('ui/ui_dsp_bridge.mjs', 'utf8');
    if (/applyTrackConfig\(t, 'route', ROUTE_NONE\)/.test(br)) throw new Error('applyInstrChoice still writes the None route');
    const sp = readFileSync('dsp/setparam/sp_track_config.c', 'utf8');
    if (!/"none"\)\)\s+rt = ROUTE_NONE;/.test(sp)) throw new Error('the DSP setter no longer accepts a legacy "none"');
});

if (failed) process.exit(1);
console.log('PASS: test_instr_none');
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
