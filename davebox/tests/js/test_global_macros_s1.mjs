import './_bulk_get_stub.mjs';
/* tests/js/test_global_macros_s1.mjs — Session's MACROS bank (the GLOBAL
 * macros, slice 1), end to end through the REAL dispatch (ui.js
 * onMidiMessageInternal + the tick):
 *
 *   - the Session map shows MACROS at the top of its third column (CTRL)
 *   - hold the jog, tap that pad, let go: Session is on its MACROS bank, sound
 *     mode open AT REST on the global page, and the map still arms over it
 *   - a knob touch peeks the page: K1 UNASSIGNED; a turn writes NOTHING
 *   - a mixer pick on the map leaves the bank and closes the page
 *   - Note/Session out and back: the page comes back
 *   - the sidecar's `gmac` round trip drops a bad leg and keeps its sibling
 *   - Delete + jog asks, OK clears all eight, Undo puts them back */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let writes = [];
let sidecarTxt = null;
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => (sidecarTxt == null ? '' : sidecarTxt);
globalThis.host_file_exists = () => sidecarTxt != null;
globalThis.host_ui_publish = () => false;
/* A tick SWALLOWS its errors into this file: surface them, or the rig passes
 * against a tick that stopped on line one. */
let jsErr = '';
globalThis.host_write_file = (p, t) => { if (/jserr/.test(p)) jsErr = String(t); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = (slot, key, val) => { writes.push({ slot, key, val: String(val) }); return 1; };
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.host_state_subdir = () => 'dAVEBOx';

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');
const P = await import('../../ui/ui_pure.mjs');
const kit = await import('../../ui/ui_movy.mjs');
const pers = await import('../../ui/ui_persistence.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
const NOTE_SESSION = 50;   /* ui_constants' MoveNoteSession (the shared constants have none) */

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = true; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = i + 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const tick = (n) => { for (let i = 0; i < (n || 1); i++) globalThis.tick(); };
/* What the OLED was asked to draw this frame: the touched header's name, the
 * resting header's text. */
let hdr = [];
let info2 = null;
kit.setKitHudSink((fam, d) => {
    if (fam === 'KitTouchedHeader' || fam === 'KitBankHeader') hdr.push({ fam, d });
    if (fam === 'Info2') info2 = d;
});
const frame = () => { hdr = []; S.screenDirty = true; tick(); return hdr; };
const touchedName = () => { const h = frame().filter((x) => x.fam === 'KitTouchedHeader'); return h.length ? String(h[h.length - 1].d.name) : null; };
const MACROS_PAD = P.bankMapPadForCell(P.SESS_PAD_MAP.ctrl.col, 0);
const VOLUME_PAD = P.bankMapPadForCell(0, 0);
const mapTap = (pad) => { cc(3, 127); note(pad, 100); note(pad, 0); cc(3, 0); tick(2); };

step('⭐ the Session map shows MACROS at the top of its third column (CTRL), pad 94', () => {
    tick(2);
    cc(3, 127);
    assert(S.bankMapUp && S.bankMapKind === 'session', 'the jog press did not show the Session map');
    const it = render.bankMapItems();
    assert(it.cols[2] && it.cols[2].label === 'CTRL' && it.cols[2].cells[0] === 'MACROS', 'col 2: ' + JSON.stringify(it.cols[2]));
    assert(MACROS_PAD === 94, 'pad ' + MACROS_PAD);
    cc(3, 0); tick();
});

step('⭐⭐ hold jog, tap MACROS, let go: Session on its MACROS bank, the global page open AT REST; the map still arms', () => {
    mapTap(MACROS_PAD);
    assert(S.sessMacros, 'S.sessMacros not set');
    assert(snd.soundOpen() && snd.soundGlobalMacros(), 'the global page did not open');
    assert(snd.soundResting() && !snd.soundActive(), 'it should rest (open, not active)');
    assert(!S.bankMapUp, 'the map stayed up');
    cc(3, 127);
    assert(S.bankMapUp && S.bankMapKind === 'session', 'the next press did not arm the map over the page');
    const it = render.bankMapItems();
    assert(it.cur && it.cur.c === 2 && it.cur.r === 0, 'the map does not mark MACROS as where you are: ' + JSON.stringify(it.cur));
    cc(3, 0); tick();
    assert(snd.soundGlobalMacros(), 'the release closed the page');
    /* the overview names the bank the knobs are on: it read "< VOLUME >" over
     * the MACROS bank (device, 2026-11-22) */
    info2 = null; S.screenDirty = true; tick();
    assert(info2 && info2.right === 'MACROS', 'overview label: ' + JSON.stringify(info2));
    const hints = JSON.stringify(render.overviewHints());
    assert(hints === JSON.stringify([['HLD', 'BANKS'], ['TCH', 'EDIT']]), 'overview hints: ' + hints);
});

step('⭐⭐ touch K1: the header reads K1 UNASSIGNED over GLOBAL MACROS; a turn writes nothing', () => {
    writes = [];
    note(0, 127);
    assert(touchedName() === 'K1 UNASSIGNED', 'touched header: ' + touchedName());
    cc(71, 1); cc(71, 1); tick(4);
    assert(writes.length === 0, 'an unassigned global macro wrote: ' + JSON.stringify(writes));
    note(0, 0); tick(40);                        /* a touch release is held briefly (ui_touch_hold) */
    S.cardHoldUntil = -1;                        /* the card-hold preference's linger, spent */
    const rest = frame();
    assert(!rest.some((x) => x.fam === 'KitTouchedHeader'), 'the page did not stand down when the knob was let go');
    S.jogTouched = true;
    const h = frame().find((x) => x.fam === 'KitBankHeader');
    S.jogTouched = false;
    assert(h && /GLOBAL MACROS/.test(JSON.stringify(h.d)), 'the jog-touch reveal did not draw GLOBAL MACROS: ' + JSON.stringify(h && h.d));
});

step('⭐ picking VOLUME on the map leaves the bank: the page closes', () => {
    mapTap(VOLUME_PAD);
    assert(!S.sessMacros, 'still on MACROS');
    assert(!snd.soundOpen(), 'the global page stayed open');
    assert(S.sessKnobMode === 0, 'mode ' + S.sessKnobMode);
});

step('⭐ Note/Session out and back: the page returns', () => {
    mapTap(MACROS_PAD);
    assert(snd.soundGlobalMacros(), 'setup');
    cc(NOTE_SESSION, 127); cc(NOTE_SESSION, 0); tick(2);
    assert(!S.sessionView && !snd.soundGlobalMacros(), 'Track View kept the global page');
    cc(NOTE_SESSION, 127); cc(NOTE_SESSION, 0); tick(2);
    assert(S.sessionView && S.sessMacros && snd.soundGlobalMacros(), 'the page did not come back');
});

step('⭐ the sidecar: `gmac` round-trips; a bad leg (track 9) is dropped, its sibling survives', () => {
    S.globalMacros[0] = { v: 0.25, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1, track: 2 },
        { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1, track: 9 },
    ] };
    S.globalMacros[1] = { v: null, legs: [{ kind: 'chain', comp: 'master_fx:fx1', key: 'mix', lo: 0, hi: 1, track: -1 }] };
    S.globalMacros[2] = { v: null, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1, track: -1 }] };   /* a track comp on a bus: bad */
    const obj = pers.sidecarObject();
    assert(Array.isArray(obj.gmac) && obj.gmac.length === 8, 'sidecar has no gmac');
    S.currentSetUuid = 'test-uuid';
    sidecarTxt = JSON.stringify(obj);
    for (let i = 0; i < 8; i++) S.globalMacros[i] = { v: 1, legs: [] };   /* the reader must reset first */
    bridge.restoreUiSidecar(false);
    sidecarTxt = null;
    const g = S.globalMacros;
    assert(g[0] && g[0].legs.length === 1 && g[0].legs[0].track === 2 && g[0].legs[0].key === 'cutoff' && g[0].v === 0.25,
           'K1: ' + JSON.stringify(g[0]));
    assert(g[1] && g[1].legs[0].track === -1 && g[1].legs[0].comp === 'master_fx:fx1', 'K2 (master): ' + JSON.stringify(g[1]));
    assert(g[2] === null, 'K3 (a track comp at track -1) should be dropped: ' + JSON.stringify(g[2]));
    for (let i = 3; i < 8; i++) assert(g[i] === null, 'K' + (i + 1) + ' not reset: ' + JSON.stringify(g[i]));
    assert(S.sessionView, 'the restore left Session View');
});

step('⭐⭐ Delete + jog: the confirm; OK clears all eight (GLOBAL MACROS / CLEARED); Undo puts them back', () => {
    if (!S.sessionView) { cc(NOTE_SESSION, 127); cc(NOTE_SESSION, 0); }
    S.sessMacros = true; tick(2);
    assert(snd.soundGlobalMacros(), 'setup: the page is not open');
    const before = JSON.stringify(S.globalMacros);
    assert(S.globalMacros[0] && S.globalMacros[1], 'setup: two macros set');
    cc(HC.MoveDelete, 127); cc(3, 127); cc(3, 0); cc(HC.MoveDelete, 0); tick();
    assert(S.confirmMacroClear && S.confirmMacroClearGlobal, 'no global confirm');
    assert(!S.bankMapUp, 'Delete + jog opened the map');
    assert(S.globalMacros[0], 'the confirm cleared before OK');
    cc(14, 127); tick();                         /* jog: Cancel -> OK */
    assert(S.confirmMacroClearSel === 0, 'sel ' + S.confirmMacroClearSel);
    cc(3, 127); cc(3, 0); tick();
    assert(!S.confirmMacroClear, 'the confirm stayed up');
    assert(S.globalMacros.every((m) => m === null), 'not cleared: ' + JSON.stringify(S.globalMacros));
    assert((S.actionPopupLines || []).join('/') === 'GLOBAL MACROS/CLEARED', 'popup: ' + JSON.stringify(S.actionPopupLines));
    cc(HC.MoveUndo, 127); cc(HC.MoveUndo, 0); tick();
    assert(JSON.stringify(S.globalMacros) === before, 'Undo did not restore: ' + JSON.stringify(S.globalMacros));
});

kit.setKitHudSink(null);
step('no tick threw', () => { assert(!jsErr, jsErr); });
if (failed) { console.error('FAIL: global macros S1'); process.exit(1); }
console.log('PASS: global macros S1 — the Session MACROS pad, the resting page, the sidecar, the clear');
process.exit(0);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
