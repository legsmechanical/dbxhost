/* tests/js/test_audio_convert_gesture.mjs — picking Audio on a track that
 * plays an instrument OFFERS to resample its clips first (ui_audio_convert).
 *
 * Josh, 2026-10-26: "changing an instrument track to audio asks whether you
 * want to resample the clips there and loads the resulting clips in the
 * corresponding slots as audio clips" · "Instrument before effects." · "It
 * becomes a Loop-mode audio clip, and its notes are replaced".
 *
 *   - the question reaches the screen; Back cancels (nothing sent);
 *   - No: the plain conversion (no takes);
 *   - Yes: each clip with notes is recorded ALONE, one after another, before
 *     its FX (src 2) into the project's samples/; then the track converts and
 *     each clip, one per tick, wipes its notes and loads its take;
 *   - Back while recording cancels everything: the takes made are removed and
 *     nothing converts.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const DIR = '/data/UserData/daveboxSA/projects/x/dAVEBOx/samples';
const GET = { 't4_au_dir': DIR, 'resample_bars_t4_c0': '1', 'resample_bars_t4_c2': '2', 't4_pad_mode': '3', 'resample_err': '0' };
let SAMPLING = false;
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
globalThis.host_sampler_is_recording = () => SAMPLING;
globalThis.shadow_get_param = (slot, key) => (slot === 4 && /synth/.test(key) ? 'braids' : '');
globalThis.shadow_set_param = () => 1;
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
const D = await import('../../ui/ui_dialogs.mjs');
const render = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.activeTrack = 4; S.activeBank = 0; S.touchHoldMs = 0; S.currentSetName = 'My Song'; S.bpmMirror = 120;
S.clipNonEmpty[4][0] = true; S.clipNonEmpty[4][2] = true;

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); }
    assert(swallowed === null, 'the tick threw: ' + swallowed);
};
const queued = (k) => S.pendingDefaultSetParams.filter((e) => e.key === k).map((e) => String(e.val));
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]).concat(queued(k));
const click = () => { cc(3, 127); cc(3, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const frame = (draw) => { globalThis.clear_screen(); draw(); return FB.slice(); };
const inked = (f) => f.some((v) => v);
const reset = () => { sets.length = 0; S.pendingDefaultSetParams.length = 0; };
const os = await import('os');
const P0 = DIR + '/My Song 5A 1bar 120bpm.wav', P2 = DIR + '/My Song 5C 2bar 120bpm.wav';

step('⭐⭐ picking Audio on an instrument track with clips ASKS, on screen; Back cancels', () => {
    reset();
    D.requestTrackModeChange(4, 3);
    assert(S.confirmConvertToDrum && S.confirmConvertAudio === 'resample', 'no resample question');
    const f = frame(() => render.drawUI());
    const own = frame(() => D.drawConvertToDrumConfirm());
    assert(inked(own) && f.every((v, i) => v === own[i]), 'the question is not what the screen shows');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    ticks(2);
    assert(!S.confirmConvertToDrum && !S.confirmConvertAudio, 'Back did not close it');
    assert(sent('t4_convert_to_audio').length === 0 && sent('resample_clip').length === 0, 'Back converted / recorded');
});

step('⭐ an instrument-less track is not asked to resample (nothing to record) — only warned (Q2)', () => {
    S.clipNonEmpty[3][0] = true;
    D.requestTrackModeChange(3, 3);
    assert(S.confirmConvertAudio !== 'resample', 'a track with no instrument was offered a resample');
    assert(S.confirmConvertToDrum && S.confirmConvertAudio === 'audio', 'its notes-are-cleared confirm is gone');
    D.closeConvertConfirm(); S.clipNonEmpty[3][0] = false;
});

step('⭐⭐ Yes: clip A recorded alone, before its FX, into the project', () => {
    reset();
    D.requestTrackModeChange(4, 3);
    assert(S.confirmConvertToDrumSel === 0, 'the question does not open on Yes');
    click();
    ticks(2);
    assert(S.auConvert && S.auConvert.list.length === 2, 'takes: ' + JSON.stringify(S.auConvert));
    assert(S.resampleTake && S.resampleTake.convert, 'the surface is not held');
    assert(sent('resample_clip').join() === '4 0 1 0 0 2 |' + P0, 'first take: ' + sent('resample_clip'));
});

step('⭐⭐ ...then clip C, then the conversion, then each clip takes its recording', () => {
    S.resampleState = 1; ticks(1);
    S.resampleState = 3; S.resampleFrames = 88200; S.resampleDone = 1000; ticks(3);
    /* the notice is the conversion's own, never the plain resample's (on the
     * device it read "undefined, bar NaN/undefined") */
    assert(S.actionPopupLines[0] === 'TO AUDIO 1/2' && S.actionPopupLines[1] === '5A, bar 1/1',
           'the notice: ' + JSON.stringify(S.actionPopupLines));
    S.resampleState = 4; SAMPLING = true; ticks(1);
    assert(S.resampleTake && S.resampleTake.convert, 'the plain resample tick ended the conversion\'s take');
    assert(sent('transport').indexOf('stop') >= 0, 'no stop at the end of the take');
    globalThis.__stubStat = { [P0]: { mode: 0o100644, size: 9 } };
    SAMPLING = false; ticks(1);
    assert(sent('resample_clear').length >= 1 && S.auConvert.i === 1, 'did not move on');
    reset();
    S.resampleState = 0; ticks(1);
    assert(sent('resample_clip').join() === '4 2 2 0 0 2 |' + P2, 'second take: ' + sent('resample_clip'));
    S.resampleState = 3; ticks(1);
    S.resampleState = 4; globalThis.__stubStat[P2] = { mode: 0o100644, size: 9 }; ticks(2);
    assert(!S.auConvert && !S.resampleTake, 'the takes did not end');
    ticks(8);
    assert(sent('t4_convert_to_audio').length === 1, 'not converted');
    assert(sets.findIndex((x) => x[0] === 't4_convert_to_audio') < sets.findIndex((x) => x[0] === 't4_au_pick_join'),
           'a take was loaded before the conversion');
    assert(sent('t4_au_pick_join').join() === '0|' + P0 + ',2|' + P2 && !sent('t4_au_pick').length && !sent('t4_au_undo').length,
           'a conversion\'s picks took an undo step: ' + sent('t4_au_pick'));
    globalThis.__stubStat = null;
});

step('⭐⭐ Back while recording cancels everything: takes removed, nothing converts', () => {
    S.trackPadMode[4] = 0; GET['t4_pad_mode'] = '0'; S.resampleState = 0;
    reset();
    D.requestTrackModeChange(4, 3);
    click();
    ticks(2);
    assert(S.auConvert, 'did not start');
    S.resampleState = 3; ticks(1);
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(sent('transport').indexOf('stop') >= 0, 'Back did not stop the take');
    const removed = [];
    globalThis.__stubStdWritten = { [P0]: 'x' };
    S.resampleState = 5; ticks(2);
    assert(!S.auConvert && !S.resampleTake, 'the conversion did not end');
    assert(!(P0 in globalThis.__stubStdWritten), 'the take was not removed');
    reset(); ticks(4);
    assert(sent('t4_convert_to_audio').length === 0, 'it converted anyway');
});

/* ---- FREEZE TRACK (Josh, 2026-10-30: "freeze track (convert track to
 * resampled audio)" · "freeze track should have pre or post effect option.
 * pre leaves the track insert effects in place after. post mutes the them
 * after" · "freeze track lives on track config") ---- */
const snd = await import('../../ui/ui_sound.mjs');
const ENG = {};                                    /* slot 4's FX: fx1 and fx3 loaded */
let NOSYNTH = false;                               /* an Audio track's slot holds no instrument */
globalThis.shadow_get_param = (slot, key) => {
    if (slot === 4 && /synth/.test(key)) return NOSYNTH ? '' : 'braids';
    if (slot === 4 && /^fx[13]:module$|^fx[13]_module$/.test(key)) return 'cloudseed';
    return ENG[slot + ' ' + key] !== undefined ? ENG[slot + ' ' + key] : '';
};
const shadowSets = [];
globalThis.shadow_set_param = (slot, key, val) => { shadowSets.push([slot, String(key), String(val)]); ENG[slot + ' ' + key] = String(val); return 1; };
const sndCC = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
/* TRACK CONFIG's Freeze track row, clicked */
function freezeRow(t) {
    snd.soundExit();
    S.activeTrack = t;
    snd.soundEnter(t, t);
    for (let i = 0; i < 3; i++) snd.soundTick();
    snd.soundShowMenu();
    for (let i = 0; i < 2; i++) snd.soundTick();
    let found = false;
    for (let guard = 0; guard < 60 && !found; guard++) {
        const row = snd.soundPickRowSpecForTest();
        if (row && row.key === 'freeze') { found = true; break; }
        const st = snd.soundPickStateForTest().row;
        sndCC(14, 1); snd.soundTick();
        if (snd.soundPickStateForTest().row === st) break;
    }
    assert(found, 'no Flatten track row on track ' + (t + 1) + "'s TRACK CONFIG");
    assert(sndCC(3, 127), 'the click was not the menu\'s'); sndCC(3, 0);
}
/* Flatten's options open on Flatten: Effects · Warm-up · Flatten (no Effects
 * for a Move instrument). `post`: Effects to Post first. */
const RS = await import('../../ui/ui_resample.mjs');
const answer = (post) => { if (post) { jog(-1); jog(-1); click(); jog(1); jog(1); } click(); };
const cancelTakes = () => {
    S.resampleState = 3; ticks(1);
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    S.resampleState = 5; ticks(2);
    S.resampleState = 0; reset(); ticks(2);
};

step('⭐⭐ TRACK CONFIG › Flatten track opens its options — Effects Pre, Warm-up Off, Flatten — on screen; Back changes nothing', () => {
    S.trackPadMode[4] = 0; GET['t4_pad_mode'] = '0'; S.resampleState = 0;
    S.actionPopupLines = []; S.actionPopupEndTick = 0;    /* the last step's notice, not this screen's */
    reset();
    freezeRow(4);
    const r = S.confirmResample;
    assert(r && r.flatten && r.track === 4 && r.choice && !r.post && !r.warm && r.sel === 2, 'no Flatten options: ' + JSON.stringify(r));
    const f = frame(() => render.drawUI());
    const own = frame(() => RS.drawResampleOptions());
    assert(inked(own) && f.every((v, i) => v === own[i]), 'the options are not what the screen shows');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    ticks(3);
    assert(!S.confirmResample && !S.auConvert, 'Back did not close them');
    assert(sent('resample_clip').length === 0, 'Back recorded');
});

step('⭐⭐ Pre (the default): every clip before its FX; the FX are left on', () => {
    reset();
    freezeRow(4);
    answer(false);
    ticks(2);
    assert(S.auConvert && S.auConvert.list.length === 2 && !S.auConvert.bypass, 'takes: ' + JSON.stringify(S.auConvert));
    assert(sent('resample_clip').join() === '4 0 1 0 0 2 |' + P0, 'Pre take: ' + sent('resample_clip'));
    cancelTakes();
});

step('⭐⭐ Warm-up (Josh, 2026-10-30: "Freeze track needs warm up option"): turned On, each take plays its clip once first', () => {
    reset();
    freezeRow(4);
    jog(-1); click();                                 /* Warm-up On */
    assert(S.confirmResample.warm, 'Warm-up did not turn On');
    jog(1); click();                                  /* Flatten */
    ticks(2);
    assert(sent('resample_clip').join() === '4 0 1 1 0 2 |' + P0, 'the take is not warmed up: ' + sent('resample_clip'));
    cancelTakes();
});

step('⭐⭐ Post: every clip through its FX (Dry); once converted, the loaded inserts are bypassed — kept, not removed', () => {
    reset();
    freezeRow(4);
    answer(true);
    ticks(2);
    assert(sent('resample_clip').join() === '4 0 1 0 0 1 |' + P0, 'Post take: ' + sent('resample_clip'));
    globalThis.__stubStat = { [P0]: { mode: 0o100644, size: 9 }, [P2]: { mode: 0o100644, size: 9 } };
    S.resampleState = 3; ticks(1); S.resampleState = 4; ticks(2);
    S.resampleState = 0; ticks(1); S.resampleState = 3; ticks(1); S.resampleState = 4; ticks(2);
    S.resampleState = 0;
    assert(!S.auConvert, 'the takes did not end');
    shadowSets.length = 0;
    ticks(10);
    assert(sent('t4_au_pick_join').length === 2, 'picks: ' + sent('t4_au_pick_join'));
    const byp = shadowSets.filter((x) => x[0] === 4 && /bypassed/.test(x[1]) && x[2] === '1').map((x) => x[1]).sort();
    assert(byp.join() === 'fx1:bypassed,fx3:bypassed', 'bypassed: ' + JSON.stringify(shadowSets.filter((x) => /bypass/.test(x[1]))));
    /* TRACK CONFIG, still open where Freeze was asked for, shows them bypassed
     * (on the device it went on showing them playing until reopened) */
    for (let i = 0; i < 6; i++) snd.soundTick();
    const st = snd.soundPickStateForTest();
    const fx1 = st.comps.indexOf('fx1');
    assert(fx1 >= 0 && st.bypassed[fx1] === 1, 'TRACK CONFIG does not show FX 1 bypassed: ' + JSON.stringify(st.bypassed));
    globalThis.__stubStat = null;
    S.trackPadMode[4] = 0; GET['t4_pad_mode'] = '0';
});

step('⭐⭐ an Audio track freezes IN PLACE (Josh, 2026-10-30: "audio tracks ought to be able to be frozen (essentially resampling every clip in place) just like the otehrs"): every clip with a sample re-recorded; each resets, then picks its take; nothing converts; Post bypasses', () => {
    S.trackPadMode[4] = 3; GET['t4_pad_mode'] = '3'; S.resampleState = 0; NOSYNTH = true;
    S.clipNonEmpty[4][0] = false; S.clipNonEmpty[4][2] = false;          /* Loop clips: no steps */
    S.auInfo[4][0] = Object.assign({}, S.auInfo[4][0] || {}, { state: 2, name: 'loop a.wav' });
    S.auInfo[4][2] = Object.assign({}, S.auInfo[4][2] || {}, { state: 2, name: 'loop c.wav' });
    reset();
    freezeRow(4);
    assert(S.confirmResample && S.confirmResample.flatten && S.confirmResample.choice, 'an Audio track has no Pre / Post');
    answer(true);
    ticks(2);
    assert(S.auConvert && S.auConvert.inPlace && S.auConvert.list.length === 2, 'takes: ' + JSON.stringify(S.auConvert));
    assert(sent('resample_clip').join() === '4 0 1 0 0 1 |' + P0, 'Post take: ' + sent('resample_clip'));
    S.resampleState = 3; S.resampleFrames = 88200; S.resampleDone = 100; ticks(2);
    assert(S.actionPopupLines[0] === 'FLATTEN 1/2', 'notice: ' + JSON.stringify(S.actionPopupLines));
    globalThis.__stubStat = { [P0]: { mode: 0o100644, size: 9 }, [P2]: { mode: 0o100644, size: 9 } };
    S.resampleState = 4; ticks(2);
    S.resampleState = 0; ticks(1); S.resampleState = 3; ticks(1); S.resampleState = 4; ticks(2);
    S.resampleState = 0;
    assert(!S.auConvert, 'the takes did not end');
    shadowSets.length = 0;
    ticks(16);
    globalThis.__stubStat = null;
    /* one undo step over both clips, taken first; each reset and pick joins it */
    const order = sets.map((x) => x[0]).filter((k) => /^t4_(c[02]_hard_reset|au_pick|au_pick_join|au_undo)$/.test(k));
    assert(order.join() === 't4_au_undo,t4_c0_hard_reset,t4_au_pick_join,t4_c2_hard_reset,t4_au_pick_join', 'order: ' + order.join());
    assert(sent('t4_au_undo').join() === '0 2', 'undo step: ' + sent('t4_au_undo'));
    assert(sent('t4_c0_hard_reset').concat(sent('t4_c2_hard_reset')).join() === 'j,j', 'a reset took its own undo step');
    assert(sent('t4_au_pick_join').join() === '0|' + P0 + ',2|' + P2, 'picks: ' + sent('t4_au_pick_join'));
    assert(S.undoAvailable, 'Undo is not available after Flatten');
    assert(sent('t4_convert_to_audio').length === 0, 'an Audio track was converted');
    assert(shadowSets.some((x) => x[0] === 4 && x[1] === 'fx1:bypassed' && x[2] === '1'), 'Post did not bypass');
    S.trackPadMode[4] = 0; GET['t4_pad_mode'] = '0'; NOSYNTH = false;
    S.clipNonEmpty[4][0] = true; S.clipNonEmpty[4][2] = true;
});

step('⭐⭐ a MIDI track that follows another freezes THAT instrument (Pre: before its FX)', () => {
    S.trackRoute[5] = 2; S.trackMidiTo[5] = 5; S.clipNonEmpty[5][0] = true;
    GET['t5_au_dir'] = DIR; GET['resample_bars_t5_c0'] = '1';
    reset();
    freezeRow(5);
    answer(false);
    ticks(2);
    assert(sent('resample_clip').join() === '5 0 1 0 0 2 |' + DIR + '/My Song 6A 1bar 120bpm.wav',
           'follower take: ' + sent('resample_clip'));
    cancelTakes();
});

step('⭐ a Move instrument has no Effects row (as heard); Warm-up starts On, as Resample clip\'s; Back changes nothing', () => {
    S.trackRoute[5] = 1; S.trackMidiTo[5] = 0;
    reset();
    freezeRow(5);
    const r = S.confirmResample;
    assert(r && r.flatten && !r.choice && r.warm && r.sel === 1, 'a Move track\'s options: ' + JSON.stringify(r));
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    ticks(2);
    assert(!S.confirmResample && !S.auConvert && sent('resample_clip').length === 0, 'Back recorded');
});

step('⭐ ...and so does a MIDI track that follows a Move instrument: Flatten records it as heard (Wet), warmed up', () => {
    S.trackRoute[6] = 1; S.trackRoute[5] = 2; S.trackMidiTo[5] = 7;
    reset();
    freezeRow(5);
    assert(S.confirmResample && S.confirmResample.flatten && !S.confirmResample.choice, 'a follower of a Move track was offered Pre / Post');
    click();
    ticks(2);
    assert(sent('resample_clip').join() === '5 0 1 1 0 0 |' + DIR + '/My Song 6A 1bar 120bpm.wav',
           'take: ' + sent('resample_clip'));
    cancelTakes();
    S.trackRoute[6] = 0;
});

step('⭐ external MIDI, an empty instrument slot, a muted track, playing: no question, a notice', () => {
    S.trackRoute[5] = 2; S.trackMidiTo[5] = 0;
    reset(); freezeRow(5);
    assert(!S.confirmResample && S.actionPopupLines[0] === 'NOTHING TO FLATTEN' && /MIDI out/.test(S.actionPopupLines[1]),
           'external: ' + JSON.stringify(S.actionPopupLines));
    S.trackRoute[5] = 0;                       /* slot 5 holds no synth in this rig */
    reset(); freezeRow(5);
    assert(!S.confirmResample && /no instrument/.test(S.actionPopupLines[1]), 'empty slot: ' + JSON.stringify(S.actionPopupLines));
    S.trackMuted[4] = true;
    reset(); freezeRow(4);
    assert(!S.confirmResample && /muted/.test(S.actionPopupLines[1]), 'muted: ' + JSON.stringify(S.actionPopupLines));
    S.trackMuted[4] = false;
    S.playing = true;
    reset(); freezeRow(4);
    assert(!S.confirmResample && S.actionPopupLines[0] === 'STOP TO FLATTEN', 'playing: ' + JSON.stringify(S.actionPopupLines));
    S.playing = false;
    snd.soundExit();
});

if (failed) { console.error('FAIL: test_audio_convert_gesture'); process.exit(1); }
console.log('PASS: test_audio_convert_gesture');
}
main().catch((e) => { console.error(e); process.exit(1); });
