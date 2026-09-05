/* tests/js/test_type_change_clears.mjs — item 16
 * none option for instrument selection in sound menu").
 *
 * A track with no instrument: the pattern plays, nothing is emitted, the chain
 * slot is parked. This file pins the JS half — the picker row, the encode/decode
 * through `t<N>_route = 'none'`, the live-note drop against a Schwung CONTROL,
 * and the screens that must collapse for it — with source pins where the state
 * is module-private. The DSP half is tests/test_route_none.c. */
import './_bulk_get_stub.mjs';
import { readFileSync } from 'fs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
/* A loaded generator: engineLoadedModule() reads `<comp>:module`, and an empty
 * answer is what "no generator" looks like — so the happy path needs a name. */
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 1;


/* ITEM 16 (Josh, 2026-09-05): "When instrument is changed from a schwung
 * generator to a move track or midi track, incompatible macros and
 * automations need to be cleared. Give users a warning and ask for
 * confirmation before switching instrument TYPE since this is destructive."
 * Item 15 = A (a MIDI track routes through its parked slot's MIDI FX), which
 * fixes the matrix below. */
async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const A = await import('../../ui/ui_automation.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));

/* every write the module makes: singles and the bulk SET, decoded */
const writes = [];
const _single = globalThis.host_module_set_param;
globalThis.host_module_set_param = (k, v) => { writes.push([k, String(v)]); if (_single) _single(k, v); };
globalThis.host_module_set_params = (blob) => {
    const s = String(blob); let p = 0;
    /* bulkEncode: "<count>\n" then count × "<len>\n<bytes>" */
    const nl0 = s.indexOf('\n'); const count = parseInt(s.slice(0, nl0), 10); p = nl0 + 1;
    const rec = () => { const nl = s.indexOf('\n', p); const n = parseInt(s.slice(p, nl), 10); const v = s.slice(nl + 1, nl + 1 + n); p = nl + 1 + n; return v; };
    for (let i = 0; i + 1 < count; i += 2) { const k = rec(), v = rec(); writes.push([k, v]); }
    return true;
};
/* pa_list answers what the rig has planted */
let paList = '';
const _g = globalThis.host_module_get_param;
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? paList : _g(k));
const routeName = { 0: 'Schwung', 1: 'Move', 2: 'MIDI', 3: 'NONE' };

step('setup', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false; S.activeTrack = 0;
    S.trackRoute[0] = 0; S.trackRoute[1] = 0; S.trackRoute[2] = 1; S.trackChannel[2] = 1;
    S.confirmTypeChange = null;
});

/* ---- the matrix, one cell at a time ------------------------------------ */
const T = (target, route) => snd.targetCompatible(target, route);
step('chain params (synth / fxN) play only on a Schwung track', () => {
    for (const r of [1, 2, 3]) { if (T('4:synth:cutoff', r)) throw new Error('synth kept on ' + routeName[r]); if (T('4:fx2:mix', r)) throw new Error('fx kept on ' + routeName[r]); }
    if (!T('4:synth:cutoff', 0)) throw new Error('synth cleared on Schwung');
});
step('chain MIDI FX (midi_fxN) play on Schwung AND MIDI (item 15 = A), not Move or NONE', () => {
    if (!T('4:midi_fx1:rate', 0) || !T('4:midi_fx1:rate', 2)) throw new Error('midi_fx cleared where it should route');
    if (T('4:midi_fx1:rate', 1) || T('4:midi_fx1:rate', 3)) throw new Error('midi_fx kept on Move/NONE');
});
step('the levels (slot: volume/pan/sends) survive Schwung ↔ Move (both have a strip), not MIDI or NONE', () => {
    for (const k of ['volume', 'pan', 'send_a', 'send_b']) {
        if (!T('4:slot:' + k, 0) || !T('4:slot:' + k, 1)) throw new Error(k + ' cleared on a strip route');
        if (T('4:slot:' + k, 2) || T('4:slot:' + k, 3)) throw new Error(k + ' kept on MIDI/NONE');
    }
    if (!T('0:move_fx:2:volume', 0) || !T('0:move_fx:2:volume', 1)) throw new Error('a Move bus level does not carry over');
});
step('Move bus FX params play only on a Move track', () => {
    if (!T('0:move_fx:2:fx1:cutoff', 1)) throw new Error('bus fx cleared on Move');
    for (const r of [0, 2, 3]) if (T('0:move_fx:2:fx1:cutoff', r)) throw new Error('bus fx kept on ' + routeName[r]);
});
step('seq: targets (the bank params) survive every type', () => {
    for (const r of [0, 1, 2, 3]) if (!T('seq:4:swing', r)) throw new Error('seq cleared on ' + routeName[r]);
});
step('MIDI targets: at/pb survive every type but NONE; cc:N only a MIDI track', () => {
    for (const r of [0, 1, 2]) { if (!T('at', r) || !T('pb', r)) throw new Error('at/pb cleared on ' + routeName[r]); }
    if (T('at', 3) || T('pb', 3)) throw new Error('at/pb kept on NONE');
    if (!T('cc:74', 2)) throw new Error('cc cleared on MIDI'); for (const r of [0, 1, 3]) if (T('cc:74', r)) throw new Error('cc kept on ' + routeName[r]);
});
step('macro LEGS follow the same rule: bank always, level = strip routes, chain by comp, midi by target', () => {
    const L = (leg, r) => snd.legCompatible(leg, r);
    for (const r of [0, 1, 2, 3]) if (!L({ kind: 'bank', bank: 0, k: 1 }, r)) throw new Error('bank leg cleared');
    if (!L({ kind: 'level', key: 'pan' }, 1) || L({ kind: 'level', key: 'pan' }, 2)) throw new Error('level leg rule');
    if (!L({ kind: 'chain', comp: 'synth', key: 'cutoff' }, 0) || L({ kind: 'chain', comp: 'synth', key: 'cutoff' }, 1)) throw new Error('chain leg rule');
    if (!L({ kind: 'chain', comp: 'midi_fx1', key: 'rate' }, 2)) throw new Error('midi_fx leg cleared on MIDI');
    if (!L({ kind: 'midi', target: 'cc:1' }, 2) || L({ kind: 'midi', target: 'cc:1' }, 0)) throw new Error('midi leg rule');
});

/* ---- the picker flow ---------------------------------------------------- */
function plant() {
    /* track 0 (Schwung, slot 0): three macro legs — synth cutoff (chain), pan
     * (level), a bank param — and lanes in clips 0 and 3 on cutoff, pan, swing. */
    S.trackMacros[0] = new Array(8).fill(null);
    S.trackMacros[0][0] = { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }, { kind: 'level', key: 'pan', lo: 0, hi: 1 }] };
    S.trackMacros[0][1] = { v: 0.2, legs: [{ kind: 'bank', bank: 0, k: 1, lo: 0, hi: 1 }] };
    paList = '0 0 1 4 0:synth:cutoff 0 4 100\n0 3 1 4 0:synth:cutoff 0 4 100\n0 0 1 4 0:slot:pan 0 4 100\n0 0 1 2 seq:0:swing 0 4 100\n';
    A.automationRefreshPresence();
}
step('a change of TYPE with something to lose ASKS; nothing is written yet', () => {
    plant(); writes.length = 0;
    S.trackRoute[0] = 0;
    const applied = snd.requestInstrChange(0, 0 /* INSTR Move 1 */);
    if (applied !== false) throw new Error('applied without asking');
    const c = S.confirmTypeChange;
    if (!c) throw new Error('no modal');
    if (c.typeName !== 'MOVE TRACK') throw new Error('type name ' + c.typeName);
    if (c.macros !== 1) throw new Error('macros to clear: ' + c.macros + ' (only the synth leg; pan and bank survive Move)');
    if (c.lanes !== 2) throw new Error('lanes to clear: ' + c.lanes + ' (cutoff in clips 0 and 3; pan and swing survive)');
    if (S.confirmTypeChangeSel !== 1) throw new Error('must open on No');
    if (writes.some(([k]) => k === 't0_route')) throw new Error('the route changed before the answer');
    if (S.trackRoute[0] !== 0) throw new Error('route changed');
});
step('No (Back) keeps everything', () => {
    globalThis.onBackTap ? globalThis.onBackTap() : cc(51, 127);
    if (S.confirmTypeChange) { /* the CC path: click with No selected */ S.confirmTypeChangeSel = 1; cc(3, 127); }
    if (S.confirmTypeChange) throw new Error('modal still up');
    if (S.trackRoute[0] !== 0) throw new Error('route changed on No');
    if (!S.trackMacros[0][0] || S.trackMacros[0][0].legs.length !== 2) throw new Error('macro cleared on No');
    if (writes.some(([k]) => /_pa_clear_key$/.test(k) || k === 't0_route')) throw new Error('writes on No: ' + JSON.stringify(writes));
    if (A.automationEntriesFor(0, 0).length !== 3) throw new Error('lanes lost on No');
});
step('Yes applies the change and clears EXACTLY the incompatible set, in every clip', () => {
    snd.requestInstrChange(0, 0);
    if (!S.confirmTypeChange) throw new Error('no modal');
    cc(14, 1);                                       /* jog: No → Yes */
    if (S.confirmTypeChangeSel !== 0) throw new Error('jog did not move to Yes');
    writes.length = 0;
    cc(3, 127);                                      /* click = confirm */
    /* The DSP has now dropped the cutoff lanes: the next pa_list read says so. */
    paList = '0 0 1 4 0:slot:pan 0 4 100\n0 0 1 2 seq:0:swing 0 4 100\n';
    ticks(3);                                        /* the bulk flush */
    if (S.confirmTypeChange) throw new Error('modal still up');
    if (S.trackRoute[0] !== 1) throw new Error('route not Move: ' + S.trackRoute[0]);
    const clears = writes.filter(([k]) => /_pa_clear_key$/.test(k)).map(([k, v]) => k + '=' + v).sort();
    const want = ['t0_pa_clear_key=0 0:synth:cutoff', 't0_pa_clear_key=3 0:synth:cutoff'];
    if (JSON.stringify(clears) !== JSON.stringify(want)) throw new Error('cleared ' + JSON.stringify(clears) + ' want ' + JSON.stringify(want));
    const m0 = S.trackMacros[0][0];
    if (!m0 || m0.legs.length !== 1 || m0.legs[0].kind !== 'level') throw new Error('macro 0 should keep only its pan leg: ' + JSON.stringify(m0));
    if (!S.trackMacros[0][1]) throw new Error('the bank macro must survive');
    if (A.automationStateFor(0, 0, '0:slot:pan') === null || A.automationStateFor(0, 0, 'seq:0:swing') === null) throw new Error('a compatible lane was dropped');
    if (A.automationStateFor(0, 0, '0:synth:cutoff') !== null) throw new Error('the synth lane survived in the map');
});
step('a change WITHIN a type asks nothing and clears nothing', () => {
    plant(); writes.length = 0;
    S.trackRoute[0] = 1; S.trackChannel[0] = 1;
    const applied = snd.requestInstrChange(0, 1 /* Move 2 */);
    if (applied !== true || S.confirmTypeChange) throw new Error('a same-type change asked');
    if (!S.trackMacros[0][0] || S.trackMacros[0][0].legs.length !== 2) throw new Error('same-type change cleared a macro');
    if (writes.some(([k]) => /_pa_clear_key$/.test(k))) throw new Error('same-type change cleared lanes');
    if (!writes.some(([k, v]) => k === 't0_channel' && v === '2')) throw new Error('the change was not applied');
});
step('a type change with NOTHING to lose applies at once', () => {
    S.trackMacros[1] = new Array(8).fill(null); paList = ''; A.automationRefreshPresence();
    S.trackRoute[1] = 0; writes.length = 0;
    const applied = snd.requestInstrChange(1, C.INSTR_MIDI_CH + 3);
    if (applied !== true || S.confirmTypeChange) throw new Error('asked with nothing to clear');
    if (S.trackRoute[1] !== 2) throw new Error('not applied');
});
if (failed) process.exit(1);
console.log('PASS: test_type_change_clears.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
