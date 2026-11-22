import './_bulk_get_stub.mjs';
/* tests/js/test_global_macros_s3.mjs — the GLOBAL macros reach the session
 * buses and a Move track's bus (slice 3), end to end through the REAL
 * dispatch (ui.js onMidiMessageInternal + the tick):
 *
 *   - the scope list ends Master FX / Send FX A / Send FX B
 *   - Master FX > FX1 > Mix: the header reads `MST FX1 MIX`, a turn writes
 *     `master_fx:fx1:mix` on slot 0; the bus list offers no MIDI
 *   - Send FX A > Return: `send_fx:a:return_level`, header `SNA RETURN` —
 *     metadata the bus table supplies (no chain_params lists it)
 *   - a Master FX reorder (busFxMove) renames the leg to fx2, and leaves a
 *     track leg alone
 *   - a Master FX2 module swap asks, counting the global leg; Yes prunes it
 *   - a Move-routed track's leg writes `move_fx:N:fxK:<key>`, header T<n> FX<k> */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const FXCP = JSON.stringify([
    { key: 'mix', name: 'Mix', type: 'float', min: 0, max: 1, step: 0.01 },
    { key: 'drive', name: 'Drive', type: 'float', min: 0, max: 1, step: 0.01 },
]);
const P = {
    '0|master_fx:fx1:module': 'freeverb', '0|master_fx:fx1:name': 'Freeverb',
    '0|master_fx:fx1:chain_params': FXCP, '0|master_fx:fx1:mix': '0.4',
    '0|master_fx:fx2:module': 'drive', '0|master_fx:fx2:name': 'Drive',
    '0|master_fx:fx2:chain_params': FXCP, '0|master_fx:fx2:mix': '0.6',
    '0|send_fx:a:return_level': '0.5',
    /* T6 is routed to Move on channel 2: its bus is move_fx:2 */
    '0|move_fx:2:fx1:module': 'saturator', '0|move_fx:2:fx1:name': 'Saturator',
    '0|move_fx:2:fx1:chain_params': FXCP, '0|move_fx:2:fx1:drive': '0.3',
};
let writes = [];
let jsErr = '';
globalThis.shadow_get_param = (slot, key) => (P[slot + '|' + key] != null ? P[slot + '|' + key] : '');
globalThis.shadow_set_param = (slot, key, val) => { writes.push({ slot, key, val: String(val) }); P[slot + '|' + key] = String(val); return 1; };
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.host_module_set_params = () => true;   /* the automation owner's bulk write */
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => ''; globalThis.host_file_exists = () => false;
globalThis.host_ui_publish = () => false;
globalThis.host_write_file = (p, t) => { if (/jserr/.test(p)) jsErr = String(t); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_seed_module_defaults = () => {};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const Pm = await import('../../ui/ui_pure.mjs');
const kit = await import('../../ui/ui_movy.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = true; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = i + 1; }
S.trackRoute[5] = 1; S.trackChannel[5] = 2;      /* T6 -> Move, bus 2 */
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const tick = (n) => { for (let i = 0; i < (n || 1); i++) globalThis.tick(); };
const click = () => { cc(3, 127); cc(3, 0); };
const jog = (n) => { for (let i = 0; i < Math.abs(n); i++) cc(14, n > 0 ? 1 : 127); };
let hdr = [];
kit.setKitHudSink((fam, d) => { if (fam === 'KitTouchedHeader') hdr.push(String(d.name)); });
const touchedName = () => { hdr = []; S.screenDirty = true; tick(); return hdr.length ? hdr[hdr.length - 1] : null; };
const release = (k) => { note(k, 0); tick(40); S.cardHoldUntil = -1; };
const mapTap = (pad) => { cc(3, 127); note(pad, 100); note(pad, 0); cc(3, 0); tick(2); };
const MACROS_PAD = Pm.bankMapPadForCell(Pm.SESS_PAD_MAP.ctrl.col, 0);

/* Knob k: scope row `scope` (a label prefix), then target id `target`, then
 * param `param` — every step a jog and a click. Returns the target list. */
function assignVia(k, scope, target, param) {
    note(k, 127); tick();
    click(); tick(3);
    let sc = snd.soundGmacScopeForTest();
    assert(sc.view, 'no scope list (view ' + snd.soundViewForTest() + ')');
    const si = sc.rows.findIndex((r) => r.indexOf(scope) === 0);
    assert(si >= 0, 'no ' + scope + ' row: ' + sc.rows);
    jog(si - sc.idx); click(); tick(3);
    const tg = snd.soundKnobPickRowsForTest();
    const ti = tg.indexOf(target);
    assert(ti >= 0, 'no ' + target + ' on ' + scope + "'s target list: " + tg);
    jog(ti - snd.soundKnobTargetIdxForTest()); click(); tick(3);
    const pl = snd.soundKnobParamsForTest().map((p) => p.key);
    const pi = pl.indexOf(param);
    assert(pi >= 0, 'no ' + param + ' on the param list: ' + pl);
    jog(pi - snd.soundKnobParamIdxForTest()); click(); tick(3);
    release(k);
    tick(12);
    return tg;
}
function turnWrites(k, key) {
    note(k, 127); tick();
    writes = [];
    cc(71 + k, 3); tick(6);
    const w = writes.filter((x) => x.key === key);
    release(k);
    return w;
}

step('setup: Session on its MACROS bank; the scope list ends with the three session buses', () => {
    tick(2);
    mapTap(MACROS_PAD);
    assert(snd.soundGlobalMacros(), 'the global page is not open');
    note(1, 127); tick(); click(); tick(3);
    const sc = snd.soundGmacScopeForTest();
    assert(sc.rows.slice(-3).join() === 'Master FX,Send FX A,Send FX B', 'rows: ' + sc.rows);
    cc(51, 127); cc(51, 0); tick(); release(1);
});

step('⭐⭐ K2 = Master FX > FX1 > Mix: header MST FX1 MIX; a turn writes master_fx:fx1:mix on slot 0; no MIDI row', () => {
    const tg = assignVia(1, 'Master FX', 'master_fx:fx1', 'mix');
    assert(tg.indexOf('midi') < 0 && tg.indexOf('midicc') < 0, 'a bus offers MIDI: ' + tg);
    const g = S.globalMacros[1];
    assert(g && g.legs[0].track === -1 && g.legs[0].comp === 'master_fx:fx1' && g.legs[0].key === 'mix', 'store: ' + JSON.stringify(g));
    note(1, 127);
    assert(touchedName() === 'MST FX1 MIX', 'header: ' + touchedName());
    release(1);
    const w = turnWrites(1, 'master_fx:fx1:mix');
    assert(w.length === 1 && w[0].slot === 0 && Number(w[0].val) > 0.4, 'writes: ' + JSON.stringify(writes));
});

step('⭐⭐ K3 = Send FX A > Return: header SNA RETURN; a turn writes send_fx:a:return_level', () => {
    assignVia(2, 'Send FX A', 'send_fx:a', 'return_level');
    const g = S.globalMacros[2];
    assert(g && g.legs[0].track === -1 && g.legs[0].comp === 'send_fx:a', 'store: ' + JSON.stringify(g));
    note(2, 127);
    assert(touchedName() === 'SNA RETURN', 'header: ' + touchedName());
    release(2);
    const w = turnWrites(2, 'send_fx:a:return_level');
    assert(w.length === 1 && w[0].slot === 0 && Number(w[0].val) > 0.5, 'writes: ' + JSON.stringify(writes));
});

step('⭐ a Master FX reorder (fx1 -> fx2) renames the global leg; the Send leg stays', () => {
    assert(snd.busFxMove('master_fx:', 1, 2), 'the move was refused');
    tick(2);
    assert(S.globalMacros[1].legs[0].comp === 'master_fx:fx2', 'K2 did not follow: ' + JSON.stringify(S.globalMacros[1]));
    assert(S.globalMacros[2].legs[0].comp === 'send_fx:a', 'K3 moved: ' + JSON.stringify(S.globalMacros[2]));
    tick(12);
    note(1, 127);
    assert(touchedName() === 'MST FX2 MIX', 'header after the move: ' + touchedName());
    release(1);
});

step('⭐⭐ a Master FX2 module swap asks, counting the global leg; Yes prunes it', () => {
    /* The swap is made where it really is: the Master FX editor, opened from the map. */
    mapTap(Pm.bankMapPadForCell(Pm.SESS_PAD_MAP.fx.col, 0)); tick(4);
    assert(snd.soundIsGlobal() && !snd.soundGlobalMacros(), 'setup: the MASTER editor is not up');
    snd.soundRequestModulePickForTest({ id: 'other', name: 'Other' }, { track: -1, slot: 0, comp: 'master_fx:fx2' });
    assert(S.confirmModuleChange && S.confirmModuleChange.macros === 1, 'confirm: ' + JSON.stringify(S.confirmModuleChange));
    jog(1); tick();
    assert(S.confirmModuleChangeSel === 0, 'sel ' + S.confirmModuleChangeSel);
    click(); tick(3);
    assert(!S.confirmModuleChange && S.globalMacros[1] === null, 'not pruned: ' + JSON.stringify(S.globalMacros[1]));
    assert(S.globalMacros[2] && S.globalMacros[2].legs[0].comp === 'send_fx:a', 'the Send leg went too');
    for (let i = 0; i < 4 && snd.soundOpen() && !snd.soundGlobalMacros(); i++) { cc(51, 127); cc(51, 0); tick(2); }
    tick(3);
    assert(S.sessionView && snd.soundGlobalMacros(), 'the page did not come back after the editor');
});

step('⭐ a Move-routed track (T6, bus 2): K4 writes move_fx:2:fx1:drive; header T6 FX1 DRIVE', () => {
    assignVia(3, 'T6 ', 'move_fx:2:fx1', 'drive');
    const g = S.globalMacros[3];
    assert(g && g.legs[0].track === 5 && g.legs[0].comp === 'move_fx:2:fx1', 'store: ' + JSON.stringify(g));
    note(3, 127);
    assert(touchedName() === 'T6 FX1 DRIVE', 'header: ' + touchedName());
    release(3);
    const w = turnWrites(3, 'move_fx:2:fx1:drive');
    assert(w.length === 1 && w[0].slot === 0, 'writes: ' + JSON.stringify(writes));
});

step('no tick threw', () => { assert(!jsErr, jsErr); });
kit.setKitHudSink(null);
if (failed) { console.error('FAIL: global macros S3'); process.exit(1); }
console.log('PASS: global macros S3 — Master / Send / Move-bus legs, the bus headers, reorder and swap');
process.exit(0);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
