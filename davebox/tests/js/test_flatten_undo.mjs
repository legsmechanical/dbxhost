/* tests/js/test_flatten_undo.mjs — Undo after a track is made Audio
 * (ui_flatten_undo; the engine's half is tests/test_flatten_undo.c).
 * Josh, 2026-11-02: "undo".
 *
 * Driven by the real conversion (pendingTrackConvert, as Flatten and the
 * Instmt/Dest pick start it) and the real Undo / Shift+Undo presses:
 *   - the conversion asks the engine for its undo step ("u") and the Undo
 *     button has a step to take;
 *   - Undo: undo_restore goes, the track is MIDI again on screen, its
 *     instrument loads again and gets its own state once the slot has it, its
 *     insert FX get their bypass back;
 *   - Redo: the instrument goes again, the FX as Flatten left them;
 *   - a Move-instrument track gets its route and channel back;
 *   - a slot that never takes the module: the Undo says the sound did not come
 *     back, rather than set it on nothing.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const GET = { 't4_pad_mode': '3' };
globalThis.host_preview_play = () => {}; globalThis.host_preview_stop = () => {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
globalThis.host_module_get_param = (k) => (GET[k] !== undefined ? GET[k] : '');
globalThis.host_module_get_params = () => '';
globalThis.host_sampler_is_recording = () => false;
/* slot 4: braids with its state, two insert FX (fx2 is bypassed already) */
const SLOT = { 'synth:module': 'braids', 'synth:state': '{"patch":7}', 'fx1:module': 'cloudseed', 'fx1:bypassed': '0',
               'fx2:module': 'tapedelay', 'fx2:bypassed': '1' };
const slotSets = [];
let slotLags = 0;          /* ticks before a module write is seen loaded */
const lagged = [];
globalThis.shadow_get_param = (slot, key) => (slot === 4 && SLOT[key] !== undefined ? SLOT[key] : '');
globalThis.shadow_set_param = (slot, key, val) => {
    if (slot !== 4) return 1;
    slotSets.push([key, String(val)]);
    if (/:module$/.test(key) && slotLags) lagged.push({ key, val: String(val), at: slotLags });
    else SLOT[key] = String(val);
    if (key === 'synth:module' && !slotLags) SLOT['synth:state'] = '';
    return 1;
};
globalThis.shadow_save_state_now = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
const FB = new Uint8Array(128 * 64);
const _px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = (x, y, str) => { for (let i = 0; i < String(str).length; i++) _px((x | 0) + i * 6, (y | 0) + 3, 1); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = _px;
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

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.activeTrack = 4; S.activeBank = 0; S.touchHoldMs = 0;
S.clipNonEmpty[4][0] = true;

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) {
        S.tickCount++;
        for (const l of lagged.slice()) if (--l.at <= 0) { SLOT[l.key] = l.val; lagged.splice(lagged.indexOf(l), 1); }
        globalThis.tick();
    }
    assert(swallowed === null, 'the tick threw: ' + swallowed);
};
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]);
const slotSent = (k) => slotSets.filter((x) => x[0] === k).map((x) => x[1]);
const undo = () => { cc(HC.MoveUndo, 127); cc(HC.MoveUndo, 0); };
const redo = () => { S.shiftHeld = true; cc(HC.MoveUndo, 127); cc(HC.MoveUndo, 0); S.shiftHeld = false; };
ticks(3);

step('⭐ the conversion takes an undo step', () => {
    S.pendingTrackConvert = { t: 4, toAudio: true, bypassFx: true, takes: [] };
    ticks(4);
    assert(JSON.stringify(sent('t4_convert_to_audio')) === '["u"]', 'convert ' + JSON.stringify(sent('t4_convert_to_audio')));
    assert(S.trackPadMode[4] === C.PAD_MODE_AUDIO, 'not Audio');
    assert(SLOT['synth:module'] === '', 'the instrument stayed');
    assert(SLOT['fx1:bypassed'] === '1' && SLOT['fx2:bypassed'] === '1', 'Post did not bypass the FX: ' + SLOT['fx1:bypassed']);
    assert(S.undoAvailable && S.undoJsPatch && S.undoJsPatch.kind === 'flatten', 'no undo step');
});

step('⭐ Undo: the engine restores, the instrument comes back with its own sound, the FX as they were', () => {
    sets.length = 0; slotSets.length = 0; slotLags = 3;
    undo();
    assert(sent('undo_restore').length === 1, 'undo_restore not sent');
    assert(S.trackPadMode[4] === 0, 'still Audio on screen');
    assert(JSON.stringify(slotSent('synth:module')) === '["braids"]', 'module ' + JSON.stringify(slotSent('synth:module')));
    assert(slotSent('synth:state').length === 0, 'the state was set before the slot had the module');
    ticks(6);
    assert(JSON.stringify(slotSent('synth:state')) === '["{\\"patch\\":7}"]', 'state ' + JSON.stringify(slotSent('synth:state')));
    assert(SLOT['fx1:bypassed'] === '0' && SLOT['fx2:bypassed'] === '1', 'FX bypass ' + SLOT['fx1:bypassed'] + SLOT['fx2:bypassed']);
    assert(S.redoAvailable, 'no Redo');
});

step('⭐ Redo: Audio again, the instrument goes, the FX as Flatten left them', () => {
    sets.length = 0; slotSets.length = 0; slotLags = 0;
    redo();
    ticks(2);
    assert(sent('redo_restore').length === 1, 'redo_restore not sent');
    assert(S.trackPadMode[4] === C.PAD_MODE_AUDIO, 'not Audio on screen');
    assert(SLOT['synth:module'] === '' && SLOT['fx1:bypassed'] === '1', 'slot ' + JSON.stringify(SLOT));
    undo(); ticks(2);
    assert(SLOT['synth:module'] === 'braids' && SLOT['synth:state'] === '{"patch":7}', 'Undo after Redo: ' + JSON.stringify(SLOT));
});

step('⭐ a Move-instrument track gets its route and channel back', () => {
    S.trackRoute[2] = 1; S.trackChannel[2] = 3; S.trackPadMode[2] = 0;
    S.pendingTrackConvert = { t: 2, toAudio: true };
    ticks(3);
    assert(S.trackRoute[2] === 0, 'the Audio track is not on its slot');
    sets.length = 0;
    undo();
    assert(S.trackRoute[2] === 1 && S.trackChannel[2] === 3, 'route ' + S.trackRoute[2] + ' ch ' + S.trackChannel[2]);
    assert(sent('t2_route').pop() === 'move', 'route write ' + JSON.stringify(sent('t2_route')));
    ticks(2);
});

step('a slot that never takes the module: the Undo says so', () => {
    SLOT['synth:module'] = 'braids'; SLOT['synth:state'] = '{"patch":7}';
    S.trackRoute[4] = 0; S.trackPadMode[4] = 0;
    S.pendingTrackConvert = { t: 4, toAudio: true };
    ticks(3);
    slotSets.length = 0; slotLags = 100000;
    undo();
    ticks(450);
    assert(slotSent('synth:state').length === 0, 'state set on nothing');
    assert(S.actionPopupLines[0] === 'UNDO' && S.actionPopupLines[1] === 'Sound not restored', 'popup ' + JSON.stringify(S.actionPopupLines));
    slotLags = 0; lagged.length = 0;
});

if (failed) { console.error('FAIL: Undo after a track is made Audio'); process.exit(1); }
console.log('PASS: Undo after a track is made Audio (instrument, state, FX, route; Redo)');
}
main().catch((e) => { console.error(e); process.exit(1); });
