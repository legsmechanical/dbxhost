/* tests/js/test_sample_menu_gesture.mjs — the SAMPLE MENU and scene resample,
 * driven by the REAL gestures, with the screen checked.
 *
 * Josh, 2026-10-25: "a single short dialog/menu when sample is pressed. pick
 * what you want to do and select how." Session View: Bake scene / Resample
 * scene / Live merge. Track View: Bake clip / Live merge track.
 *
 * ⭑ What is ON SCREEN is asserted by drawing the frame through drawUI() and
 * comparing it, pixel for pixel, with the menu's own draw function — so a
 * menu that is wired but never reaches the screen (drawn under something
 * else, or not routed at all) goes red. A green suite on an unreachable
 * surface is how a feature was once built three times.
 *
 *   - a Sample tap opens the menu (Session / Track View items);
 *   - Resample scene → the scene picker (its own title) → a row → the options,
 *     Length defaulted from the engine's resample_bars_C;
 *   - Start sends ONE resample_scene with the path in the library folder;
 *   - Back steps back a level at every level; Note/Session tears it down;
 *   - refusals: playing, an empty scene; Live merge raises the notice;
 *   - the take's progress, SAVED once the host's sampler is done, and
 *     CANCELLED (the partial file removed) on Back.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const GET = { resample_bars_0: '3', resample_bars_5: '0', resample_err: '0' };
let SAMPLING = false;
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
globalThis.host_sampler_is_recording = () => SAMPLING;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_save_state_now = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
/* A real framebuffer: the kit draws through set_pixel / fill_rect. */
const FB = new Uint8Array(128 * 64);
const _px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = (x, y, str) => { for (let i = 0; i < String(str).length; i++) _px((x | 0) + i * 6, (y | 0) + 3, 1); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => {
    for (let i = 0; i < (w | 0); i++) { _px((x | 0) + i, y | 0, c); _px((x | 0) + i, (y | 0) + (h | 0) - 1, c); }
    for (let j = 0; j < (h | 0); j++) { _px(x | 0, (y | 0) + j, c); _px((x | 0) + (w | 0) - 1, (y | 0) + j, c); }
};
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
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
const R = await import('../../ui/ui_resample.mjs');
const render = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = true;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.currentSetName = 'My Song'; S.bpmMirror = 120; S.sceneRow = 0;

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); }
    assert(swallowed === null, 'the tick threw (it swallows errors, so later stages never ran): ' + swallowed);
};
/* What reached the engine: drained by the tick, or still queued. */
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]).concat(queued(k));
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const click = () => { cc(3, 127); cc(3, 0); };
const tap   = (d1) => { cc(d1, 127); cc(d1, 0); };
const back  = () => tap(HC.MoveBack);
const queued = (k) => S.pendingDefaultSetParams.filter((e) => e.key === k).map((e) => String(e.val));
const frame = (draw) => { globalThis.clear_screen(); draw(); return FB.slice(); };
const same  = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const inked = (f) => f.some((v) => v);
/* What drawUI puts on the screen IS this draw function's frame. */
function onScreen(draw, what) {
    const shown = frame(() => render.drawUI());
    const own = frame(draw);
    assert(inked(own), what + ' draws nothing');
    assert(same(shown, own), what + ' is not what the screen shows');
}
function reset() {
    S.sampleMenu = null; S.confirmResample = null; S.sampleFlow = false; S.scenePickFor = 'bake';
    S.pendingSceneBakePicker = false; S.confirmBakeScene = false; S.confirmBake = false;
    S.mergeNoticePending = false; S.resampleTake = null; S.resampleState = 0;
    S.playing = false; S.sessionView = true; S.pendingDefaultSetParams.length = 0; sets.length = 0;
    S.actionPopupEndTick = -1;                 /* a notice CARD draws over everything, by design */
}

step('⭐⭐ Session View: a Sample tap opens the menu — on screen — Bake / Resample / Live merge', () => {
    reset();
    tap(C.MoveSample);
    assert(S.sampleMenu, 'no menu');
    assert(S.sampleMenu.items.map((i) => i.id).join() === 'bake,resample,merge', 'items: ' + JSON.stringify(S.sampleMenu.items));
    /* the list grammar: a row that opens a screen (the picker) carries the chevron */
    assert(S.sampleMenu.items.map((i) => !!i.chevron).join() === 'true,true,false', 'chevrons: ' + JSON.stringify(S.sampleMenu.items));
    onScreen(R.drawSampleMenu, 'the Sample menu');
});

step('⭐⭐ Resample scene → the picker, titled for resample, on screen', () => {
    jog(1);
    assert(S.sampleMenu.items[S.sampleMenu.sel].id === 'resample', 'the jog did not reach Resample scene');
    click();
    assert(!S.sampleMenu && S.pendingSceneBakePicker && S.scenePickFor === 'resample', 'the picker did not open for resample');
    const resampleTitle = frame(() => render.drawUI());
    S.scenePickFor = 'bake';
    const bakeTitle = frame(() => render.drawUI());
    S.scenePickFor = 'resample';
    assert(inked(resampleTitle) && !same(resampleTitle, bakeTitle), 'the picker does not say which it picks for');
});

step('⭐⭐ a row → the options, Length from the engine (3 bars), on screen', () => {
    tap(43);                                   /* the top scene button: row S.sceneRow + 0 */
    assert(!S.pendingSceneBakePicker, 'the picker stayed up');
    assert(S.confirmResample && S.confirmResample.clip === 0, 'no options for row 0: ' + JSON.stringify(S.confirmResample));
    assert(S.confirmResample.bars === 3 && !S.confirmResample.warm && S.confirmResample.tail === 0,
           'defaults: ' + JSON.stringify(S.confirmResample));
    assert(S.confirmResample.sel === 3, 'the cursor does not start on Start');
    onScreen(R.drawResampleOptions, 'the resample options');
});

step('⭐ the options edit: Length by click + jog, Warm-up by click, Tail by click + jog', () => {
    const r = S.confirmResample;
    jog(-1); jog(-1); jog(-1);                 /* to Length */
    assert(r.sel === 0, 'not on Length');
    click(); jog(1); click();                  /* 3 → 4 */
    assert(r.bars === 4 && !r.editing, 'Length did not edit: ' + JSON.stringify(r));
    jog(1); click();                           /* Warm-up on */
    assert(r.warm, 'Warm-up did not toggle');
    jog(1); click(); jog(1); jog(1); click();  /* Tail 2 */
    assert(r.tail === 2, 'Tail did not edit');
    click(); back();                           /* editing → Back leaves the edit, not the dialog */
    assert(S.confirmResample && !r.editing, 'Back during an edit closed the dialog');
    jog(1);
    assert(r.sel === 3, 'not back on Start');
});

step('⭐⭐ Start: ONE resample_scene, the row / bars / warm-up / tail, a path in the library', () => {
    click();
    assert(!S.confirmResample, 'the dialog stayed up');
    const v = queued('resample_scene');
    assert(v.length === 1, 'resample_scene sent ' + v.length + ' times');
    assert(v[0] === '0 4 1 2 |/data/UserData/UserLibrary/Samples/dAVEBOx/Resample/My Song Scene A 4bar 120bpm.wav',
           'value: ' + v[0]);
    assert(S.resampleTake, 'no take tracked');
});

step('⭐ the take: RESAMPLING by bar, as PRINTING is shown — then RESAMPLED only once the host is done writing', () => {
    S.resampleState = 3; S.resampleFrames = 6 * 88200; S.resampleDone = 2 * 88200 + 5;
    ticks(2);
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(['RESAMPLING', 'Scene A, bar 3/6', 'Back cancels']),
           'progress: ' + JSON.stringify(S.actionPopupLines));
    assert(S.actionPopupGauge === -1, 'a gauge — the bar is for values you dial, not a running job');
    /* the surface is held, as a print holds it: buttons swallowed, Back cancels */
    S.pendingDefaultSetParams.length = 0; sets.length = 0;
    tap(HC.MovePlay); tap(C.MoveSample); tap(C.MoveCapture);
    assert(!S.sampleMenu && sent('transport').length === 0, 'a button got through a running take: ' + JSON.stringify(sets));
    S.pendingDefaultSetParams.length = 0; sets.length = 0;
    S.resampleState = 4; SAMPLING = true;
    ticks(2);
    assert(sent('transport').join() === 'stop', 'DONE did not stop the transport');
    assert(S.resampleTake, 'finished before the file was written');
    SAMPLING = false;
    globalThis.__stubStat = { [S.resampleTake.path]: { size: 100, mode: 0o100644 } };
    ticks(2);
    globalThis.__stubStat = null;
    assert(!S.resampleTake, 'the take did not finish');
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(['RESAMPLED', 'Scene A, 4 bars', 'In Samples/dAVEBOx']),
           'popup: ' + JSON.stringify(S.actionPopupLines));
    assert(sent('resample_clear').length === 1, 'the engine was not cleared');
});

step('⭐ Back during a take cancels it — RESAMPLE CANCELLED', () => {
    reset();
    tap(C.MoveSample); jog(1); click(); tap(43); click();
    assert(S.resampleTake, 'rig: no take');
    S.resampleState = 3; S.resampleFrames = 88200; S.resampleDone = 100;
    S.pendingDefaultSetParams.length = 0;
    back();
    assert(sent('transport').join() === 'stop', 'Back did not stop the transport');
    S.resampleState = 5;
    ticks(2);
    assert(!S.resampleTake, 'the cancel did not finish');
    assert((S.actionPopupLines || [])[0] === 'RESAMPLE CANCELLED', 'popup: ' + JSON.stringify(S.actionPopupLines));
});

step('⭐ Back steps back a level: options → picker → menu → closed', () => {
    reset();
    tap(C.MoveSample); jog(1); click(); tap(43);
    assert(S.confirmResample, 'rig: no options');
    back();
    assert(!S.confirmResample && S.pendingSceneBakePicker && S.scenePickFor === 'resample', 'options did not step back to the picker');
    back();
    assert(!S.pendingSceneBakePicker && S.sampleMenu && S.sampleMenu.items[S.sampleMenu.sel].id === 'resample',
           'the picker did not step back to the menu, on Resample');
    back();
    assert(!S.sampleMenu, 'the menu did not close');
});

step('⭐ Bake scene goes through the same picker to the bake dialog, and Back steps back', () => {
    reset();
    tap(C.MoveSample); click();               /* Bake scene */
    assert(S.pendingSceneBakePicker && S.scenePickFor === 'bake', 'no bake picker');
    tap(43);
    assert(S.confirmBakeScene && S.confirmBakeSceneClip === 0, 'no scene-bake dialog');
    back();
    assert(!S.confirmBakeScene && S.pendingSceneBakePicker, 'Back did not step back to the picker');
    back(); back();
    assert(!S.sampleMenu && !S.pendingSceneBakePicker, 'not closed');
});

step('⭐ Note/Session tears the whole flow down', () => {
    reset();
    tap(C.MoveSample); jog(1); click(); tap(43);
    tap(C.MoveNoteSession);
    assert(!S.confirmResample && !S.sampleMenu && !S.pendingSceneBakePicker, 'something survived the escape');
});

step('⭐ refusals: playing (before the picker), an empty scene (before the options)', () => {
    reset();
    S.playing = true;
    tap(C.MoveSample); jog(1); click();
    assert(!S.pendingSceneBakePicker && !S.sampleMenu, 'a resample picker opened while playing');
    assert((S.actionPopupLines || [])[0] === 'STOP TO RESAMPLE', 'popup: ' + JSON.stringify(S.actionPopupLines));
    reset();
    S.sceneRow = 5;
    tap(C.MoveSample); jog(1); click(); tap(43);  /* row 5: empty */
    S.sceneRow = 0;
    assert(!S.confirmResample, 'options opened on an empty scene');
    assert((S.actionPopupLines || [])[0] === 'NOTHING TO', 'popup: ' + JSON.stringify(S.actionPopupLines));
});

step('⭐ Live merge (Session View): the all-tracks notice', () => {
    reset();
    tap(C.MoveSample); jog(1); jog(1); click();
    assert(S.mergeNoticePending && S.mergeNoticeSingleTrack === -1, 'no all-tracks notice');
    back();
});

step('⭐ Track View: Bake clip / Live merge track; Bake clip → the clip bake, Back → the menu', () => {
    reset();
    S.sessionView = false;
    tap(C.MoveSample);
    assert(S.sampleMenu.items.map((i) => i.id).join() === 'bake,merge', 'items: ' + JSON.stringify(S.sampleMenu.items));
    onScreen(R.drawSampleMenu, 'the Track View Sample menu');
    click();
    assert(S.confirmBake, 'no clip bake');
    back();
    assert(!S.confirmBake && S.sampleMenu, 'Back did not step back to the menu');
    back();
    S.sessionView = true;
});

step('CONTROL: Shift+Sample opens nothing (the chord is gone)', () => {
    reset();
    S.shiftHeld = true; tap(C.MoveSample); S.shiftHeld = false;
    assert(!S.sampleMenu && !S.mergeNoticePending, 'Shift+Sample still does something');
});

assert(swallowed === null, 'a handler threw: ' + swallowed);
if (failed) { console.log('FAIL: Sample menu'); process.exit(1); }
console.log('PASS: Sample menu — reachable, on screen, steps back, starts a take');
}
main().catch((e) => { console.error(e); process.exit(1); });
