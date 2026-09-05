/* tests/js/test_instr_none.mjs — the NONE instrument (Josh, 2026-09-05: "Add
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


async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');
const R = await import('../../ui/ui_render.mjs');

function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}
/* every way a live note could leave davebox */
let out = 0; const writes = [];
const _hmsp = globalThis.host_module_set_param;
globalThis.host_module_set_param = (k, v) => { writes.push([String(k), String(v)]); if (/live_note|_notes/.test(String(k))) out++; return _hmsp(k, v); };
/* ⚠ NOT move_midi_internal_send: the tick paints LEDs through it (48 messages a
 * frame in this rig), which read as "emissions" in the first cut of this test. */
for (const fn of ['move_midi_inject_to_move', 'host_send_midi', 'shadow_send_midi_to_dsp'])
    globalThis[fn] = () => { out++; };

step('setup', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false; S.activeTrack = 0;
});
step('the picker offers None FIRST, behind its own divider, and formats it as a word', () => {
    const rows = C.instrPickerRows(S.trackRoute, 0, []);
    if (!rows[0] || rows[0].v !== C.INSTR_NONE) throw new Error('first row is not None: ' + JSON.stringify(rows[0]));
    if (!rows[1] || !rows[1].divider) throw new Error('no divider after None');
    if (C.fmtInstr(C.INSTR_NONE) !== 'None') throw new Error('fmtInstr(NONE)=' + C.fmtInstr(C.INSTR_NONE));
    if (C.fmtInstr(C.INSTR_NONE) === '--') throw new Error('NONE must never render as the unseeded --');
});
step('choosing None writes t0_route = none; the value reads back as INSTR_NONE', () => {
    writes.length = 0;
    B.applyInstrChoice(0, C.INSTR_NONE);
    if (!writes.some(([k, v]) => k === 't0_route' && v === 'none')) throw new Error('no t0_route=none write: ' + JSON.stringify(writes));
    if (S.trackRoute[0] !== C.ROUTE_NONE) throw new Error('trackRoute[0]=' + S.trackRoute[0]);
    if (B.instrValueFor(0) !== C.INSTR_NONE) throw new Error('instrValueFor=' + B.instrValueFor(0));
});
step('a NONE track is not a follow target for a MIDI track (same as EXT)', () => {
    const opts = C.instrOptions(S.trackRoute, 1);
    if (opts.includes(C.INSTR_TRACK + 0)) throw new Error('track 1 may follow the NONE track 0');
});
/* liveSendNote is the JS half of live dispatch: on a MIDI (EXT) track it queues
 * the note to the DSP (a host_module_set_param write); a SCHWUNG pad reaches the
 * DSP by a different road (on_midi), which tests/test_route_none.c covers. So the
 * control here is the MIDI route, the one this function actually emits on. */
function emissions(t) {
    globalThis.tick();                      /* drain anything already queued */
    const w0 = writes.length; out = 0;
    B.liveSendNote(t, 0x90, 60, 100); B.liveSendNote(t, 0x80, 60, 0);
    globalThis.tick();                      /* a queued live note is written to the DSP on the tick */
    return out + writes.filter(([k], i) => i >= w0 && k === 't' + t + '_live_notes').length;
}
step('CONTROL: a live note on a MIDI-routed track leaves davebox', () => {
    B.applyInstrChoice(1, C.INSTR_MIDI_CH + 4);
    const n = emissions(1);
    if (n === 0) throw new Error('the control emitted nothing — the drop assertion below cannot mean anything');
});
step('a live note on the NONE track emits NOTHING — not even into the parked chain', () => {
    const n = emissions(0);
    if (n !== 0) throw new Error(n + ' emissions from a NONE track');
});
step('the bank header names a NONE track [NONE], never the unseeded [--]', () => {
    /* refreshInstrAbbrev is the one cache behind every header's right label
     * (T1, 2026-09-05); track 0 is still NONE here. */
    S.activeTrack = 0;
    R.refreshInstrAbbrev();
    if (S.instrAbbrev !== 'NONE') throw new Error('instrAbbrev=' + JSON.stringify(S.instrAbbrev));
});
step('coming back to Schwung finds the same channel (parked, not destroyed)', () => {
    const ch = S.trackChannel[0];
    B.applyInstrChoice(0, C.INSTR_SCHWUNG);
    if (S.trackRoute[0] !== 0) throw new Error('route=' + S.trackRoute[0]);
    if (S.trackChannel[0] !== ch) throw new Error('channel changed on the way through None');
});
step('source pins: the screens that collapse for NONE, and the DSP gate', () => {
    const snd = readFileSync('ui/ui_sound.mjs', 'utf8');
    if (!/trackRoute\[S\.track\] === 2 \|\| GS\.trackRoute\[S\.track\] === ROUTE_NONE\) \{ S\.pickRows = rows;/.test(snd))
        throw new Error('buildPickRows does not collapse for NONE');
    if (!/const noneTrack = .*ROUTE_NONE/.test(snd) || !/!midiTrack && !noneTrack/.test(snd))
        throw new Error('knobTargetList offers chain targets to a NONE track');
    const seq = readFileSync('dsp/seq8.c', 'utf8');
    if (!/if \(route == ROUTE_NONE\) \{ d\.emit = 0; return d; \}/.test(seq)) throw new Error('midi_dest_resolve has no NONE gate');
    const st = readFileSync('dsp/seq8_state.c', 'utf8');
    if (!/ROUTE_SCHWUNG, ROUTE_NONE\);/.test(st)) throw new Error('the state clamp still stops at EXTERNAL');
    const sp = readFileSync('dsp/setparam/sp_track_config.c', 'utf8');
    if (!/"none"\)\)\s+rt = ROUTE_NONE;/.test(sp)) throw new Error('the setter does not accept "none"');
    const cc = readFileSync('ui/ui_input_cc.mjs', 'utf8');
    if (!/=== ROUTE_NONE\) \{\s*\/\*[^]*?\*\/\s*showActionPopup\('NO INSTRUMENT'/.test(cc)) throw new Error('the Shift+hold gesture would open the parked generator on a NONE track');
    const web = readFileSync('web_ui_core.js', 'utf8');
    if (!/none:3/.test(web)) throw new Error('the remote UI decode leaves a NONE track stale');
});

if (failed) process.exit(1);
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
