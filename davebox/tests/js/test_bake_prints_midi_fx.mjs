import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_bake_prints_midi_fx.mjs — Bake with a MIDI FX module in play.
 *
 * Josh, 2026-10-14: a POST module must be bakeable. The offline bake cannot
 * run a module, so Bake on a clip whose track has one in play (loaded, not
 * bypassed, Position Post) PRINTS: the engine plays the clip and records the
 * module's output (print_arm … print_state 3), then the UI bypasses the
 * module. Every other bake stays instant. Drives the REAL gesture: Sample
 * press/release in Track View (the Sample menu, Bake clip), jog to a loop count, click.
 *
 *   - Post module in play → print_offline "T C N 0" (the host runs a copy of
 *     the module, at once, playing or not), not `bake`; no wrap question;
 *     landed → bypassed, BAKED; refused → BAKE FAILED, nothing bypassed;
 *   - Shift held on the confirm → the LIVE print, print_arm "T C N";
 *   - the slot's routing is left alone: the module already runs first, so
 *     the track's own output -- what the engine records -- has it in;
 *   - the surface is held: Back cancels (print_cancel), other buttons are
 *     swallowed;
 *   - done → the module is bypassed on the track's slot, print_done, BAKED;
 *   - CONTROLS: no module / a bypassed one / a Pre one → the instant bake.
 *   - playing → refused with a notice, nothing armed.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
let PRINT_STATE = '0';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_module_set_param = (k, v) => { sets.push(['dsp', String(k), String(v)]); };
let BAKE_AU_KEPT = '0';
globalThis.host_module_get_param = (k) => (k === 'print_state' ? PRINT_STATE : k === 'bake_au_kept' ? BAKE_AU_KEPT : '');
const ENG = {};                                  /* `${slot}|${key}` */
globalThis.shadow_get_param = (slot, key) => (ENG[slot + '|' + key] !== undefined ? ENG[slot + '|' + key] : '');
globalThis.shadow_set_param = (slot, key, v) => { ENG[slot + '|' + key] = String(v); sets.push(['chain', slot + '|' + key, String(v)]); return 1; };
globalThis.shadow_save_state_now = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.move_midi_inject_to_move = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
const { commitSceneBake, sceneBakeHasConductor } = await import('../../ui/ui_xpose.mjs');
const PRINT = await import('../../ui/ui_print.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;

const T = 2;
S.activeTrack = T;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const click = () => { cc(3, 127); cc(3, 0); };
const dsp   = (k) => sets.filter((x) => x[0] === 'dsp' && x[1] === k).map((x) => x[2]);
const all   = () => { const q = S.pendingDefaultSetParams.map((e) => e.key); return sets.map((x) => x[1]).concat(q); };
function setModule(id, bypassed) {
    ENG[T + '|midi_fx1:module'] = id;
    ENG[T + '|midi_fx1:bypassed'] = bypassed ? '1' : '0';
}
/* Sample tap → the Sample menu → Bake clip → the bake dialog → 2x → click
 * (Shift held on it: LIVE print). */
function bake2x(live) {
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    cc(C.MoveSample, 127); cc(C.MoveSample, 0);
    assert(S.sampleMenu && S.sampleMenu.items[S.sampleMenu.sel].id === 'bake',
           'rig: the Sample menu did not open on Bake clip');
    click();
    assert(S.confirmBake, 'rig: the bake dialog did not open');
    S.confirmBakeSel = 2;                         /* 2x (0 = cancel, 1 = 1x, 2 = 2x, 3 = 4x) */
    if (live) S.shiftHeld = true;
    click();
    S.shiftHeld = false;
}

step('⭐⭐ a Post module in play: Bake goes OFFLINE — print_offline, no live print, no instant bake, no wrap question', () => {
    setModule('arp', false); S.trackFxPre[T] = 0;
    bake2x();
    assert(swallowed === null, 'a handler threw: ' + swallowed);
    assert(dsp('print_offline').join() === T + ' ' + S.trackActiveClip[T] + ' 2 0', 'print_offline: ' + JSON.stringify(sets));
    assert(dsp('print_arm').length === 0 && !all().includes('bake'), 'a live print or the instant bake ran too: ' + JSON.stringify(all()));
    assert(!S.confirmBake && !S.confirmBakeWrapPhase, 'a dialog is still up (the wrap question?)');
});

step('⭐⭐ ...it lands: the module is bypassed, the engine told, BAKED shown', () => {
    sets.length = 0;
    PRINT_STATE = '3';
    ticks(6);
    assert(ENG[T + '|midi_fx1:bypassed'] === '1', 'the module was not bypassed — the clip would play through it twice');
    assert(dsp('print_done').length === 1, 'print_done: ' + JSON.stringify(sets));
    assert((S.actionPopupLines || []).join(' ').indexOf('BAKED') >= 0, 'popup: ' + JSON.stringify(S.actionPopupLines));
    PRINT_STATE = '0';
    ENG[T + '|midi_fx1:bypassed'] = '0';
});

step('⭐ an offline bake runs with the transport PLAYING (nothing is played)', () => {
    S.playing = true;
    bake2x();
    S.playing = false;
    assert(dsp('print_offline').length === 1, 'refused while playing: ' + JSON.stringify(sets));
    PRINT_STATE = '3'; ticks(6); PRINT_STATE = '0';
    ENG[T + '|midi_fx1:bypassed'] = '0';
});

step('⭐ an offline bake that does not run says so, and bypasses nothing', () => {
    bake2x();
    PRINT_STATE = '0';
    ticks(30);
    assert((S.actionPopupLines || []).join(' ').indexOf('BAKE FAILED') >= 0, 'popup: ' + JSON.stringify(S.actionPopupLines));
    assert(ENG[T + '|midi_fx1:bypassed'] === '0', 'a failed bake bypassed the module');
});

step('⭐ a DRUM clip bakes offline too', () => {
    S.trackPadMode[T] = C.PAD_MODE_DRUM;
    sets.length = 0;
    PRINT.printStart(T, S.trackActiveClip[T], 2);
    assert(dsp('print_offline').length === 1 && dsp('print_arm').length === 0, 'a drum clip did not go offline: ' + JSON.stringify(sets));
    PRINT_STATE = '3'; ticks(6); PRINT_STATE = '0';
    ENG[T + '|midi_fx1:bypassed'] = '0';
    S.trackPadMode[T] = 0;
});

step('⭐⭐ Shift on the confirm PRINTS live — print_arm, no instant bake, no wrap question', () => {
    setModule('arp', false); S.trackFxPre[T] = 0;
    bake2x(true);
    assert(swallowed === null, 'a handler threw: ' + swallowed);
    assert(dsp('print_arm').join() === T + ' ' + S.trackActiveClip[T] + ' 2', 'print_arm: ' + JSON.stringify(sets));
    assert(!all().includes('bake'), 'the instant bake ran too: ' + JSON.stringify(all()));
    assert(!S.confirmBake && !S.confirmBakeWrapPhase, 'a dialog is still up (the wrap question?)');
});

step('⭐ the print leaves the slot\'s routing alone (the module already runs first)', () => {
    assert(!sets.some((x) => x[1] === T + '|midi_fx_host_route'), 'the print re-routed the slot: ' + JSON.stringify(sets));
});

step('⭐ while it plays the surface is held: buttons are swallowed', () => {
    sets.length = 0;
    cc(HC.MovePlay, 127); cc(HC.MovePlay, 0);
    ticks(2);
    assert(!all().some((k) => /transport|launch/.test(k)), 'Play got through: ' + JSON.stringify(all()));
});

step('⭐⭐ DONE: the module is bypassed on the track\'s slot, the engine told, and BAKED shown', () => {
    sets.length = 0;
    PRINT_STATE = '3';
    ticks(12);
    assert(ENG[T + '|midi_fx1:bypassed'] === '1', 'the module was not bypassed — the clip would play through it twice');
    assert(dsp('print_done').length === 1, 'print_done: ' + JSON.stringify(sets));
    assert((S.actionPopupLines || []).join(' ').indexOf('BAKED') >= 0, 'popup: ' + JSON.stringify(S.actionPopupLines));
    assert(!sets.some((x) => x[1] === T + '|midi_fx_host_route'), 'the finish re-routed the slot: ' + JSON.stringify(sets));
    PRINT_STATE = '0';
});

step('⭐ Back during a print cancels it, and leaves the module as it was', () => {
    setModule('arp', false);
    bake2x(true);
    assert(dsp('print_arm').length === 1, 'rig: not printing');
    sets.length = 0;
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(dsp('print_cancel').length === 1, 'print_cancel: ' + JSON.stringify(sets));
    assert(!sets.some((x) => x[1] === T + '|midi_fx_host_route'), 'the cancel re-routed the slot: ' + JSON.stringify(sets));
    ticks(12);
    assert(ENG[T + '|midi_fx1:bypassed'] === '0', 'a cancelled print bypassed the module');
});

for (const [why, id, byp, pre] of [['no module', '', false, 0], ['a bypassed module', 'arp', true, 0], ['a PRE module', 'arp', false, 1]]) {
    step('CONTROL: ' + why + ' → the instant bake (the wrap question), no print', () => {
        setModule(id, byp); S.trackFxPre[T] = pre;
        bake2x();
        assert(dsp('print_arm').length === 0 && dsp('print_offline').length === 0, 'printed: ' + JSON.stringify(sets));
        assert(S.confirmBakeWrapPhase, 'not on the wrap question');
        S.confirmBake = false; S.confirmBakeWrapPhase = false;
        S.trackFxPre[T] = 0;
    });
}

step('a LIVE print while playing: refused with a notice, nothing armed', () => {
    setModule('arp', false);
    S.playing = true;
    bake2x(true);
    S.playing = false;
    assert(dsp('print_arm').length === 0, 'armed while playing');
    assert((S.actionPopupLines || []).join(' ').indexOf('STOP') >= 0, 'no notice: ' + JSON.stringify(S.actionPopupLines));
});

step('⭐ a SCENE bake (offline) says which tracks\' MIDI FX it left out', () => {
    setModule('arp', false); S.trackFxPre[T] = 0;
    S.actionPopupLines = [];
    commitSceneBake(0, 1, 0, 0);
    const txt = (S.actionPopupLines || []).join(' ');
    assert(/MIDI FX not baked/.test(txt) && txt.indexOf('T' + (T + 1)) >= 0, 'popup: ' + JSON.stringify(S.actionPopupLines));
    setModule('', false);
    commitSceneBake(0, 1, 0, 0);
    assert(!/MIDI FX/.test((S.actionPopupLines || []).join(' ')), 'warned with no module: ' + JSON.stringify(S.actionPopupLines));
});

step('⭐⭐ Apply Conductor on Audio tracks: asked for an Audio responder alone; one folded, the other named as still following', () => {
    setModule('', false);
    const keep = S.trackPadMode.slice();
    for (let t = 0; t < 8; t++) S.trackPadMode[t] = C.PAD_MODE_DRUM;
    S.trackPadMode[6] = C.PAD_MODE_CONDUCT;
    S.trackPadMode[4] = C.PAD_MODE_AUDIO; S.trackPadMode[5] = C.PAD_MODE_AUDIO;
    S.condResp[0] = [0, 0, 0, 0, 1, 1, 0, 0];
    assert(sceneBakeHasConductor(0), 'an Audio responder alone did not offer Apply Conductor');
    S.trackPadMode[4] = C.PAD_MODE_DRUM; S.trackPadMode[5] = C.PAD_MODE_DRUM;
    assert(!sceneBakeHasConductor(0), 'control: drum tracks offered Apply Conductor');
    S.trackPadMode[4] = C.PAD_MODE_AUDIO; S.trackPadMode[5] = C.PAD_MODE_AUDIO;
    BAKE_AU_KEPT = String(1 << 5);                    /* the engine: T6's shift changes */
    sets.length = 0; S.pendingDefaultSetParams.length = 0; S.actionPopupLines = [];
    commitSceneBake(0, 1, 0, 1);
    assert(S.pendingDefaultSetParams.some((e) => e.key === 'bake_scene' && e.val === '0 1 0 1'), 'no bake sent');
    ticks(4);
    const txt = (S.actionPopupLines || []).join(' ');
    assert(/Still follows/.test(txt) && /T6/.test(txt) && !/T5/.test(txt), 'notice: ' + JSON.stringify(S.actionPopupLines));
    assert(S.condResp[0][4] === 0 && S.condResp[0][5] === 1, 'responders: ' + JSON.stringify(S.condResp[0]));
    /* nothing kept: no notice */
    S.condResp[0] = [0, 0, 0, 0, 1, 1, 0, 0]; BAKE_AU_KEPT = '0'; S.actionPopupLines = [];
    commitSceneBake(0, 1, 0, 1); ticks(4);
    assert(!/Still follows/.test((S.actionPopupLines || []).join(' ')) && !S.condResp[0][4] && !S.condResp[0][5],
           'all folded, yet: ' + JSON.stringify(S.actionPopupLines) + ' ' + JSON.stringify(S.condResp[0]));
    for (let t = 0; t < 8; t++) S.trackPadMode[t] = keep[t];
});

if (failed) { console.log('FAIL: Bake prints a MIDI FX module'); process.exit(1); }
console.log('PASS: Bake bakes a Post MIDI FX module offline (Shift: prints it live), bypasses it after, and cancels clean');
process.exit(0);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
