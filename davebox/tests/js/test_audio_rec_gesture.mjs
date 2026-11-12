/* tests/js/test_audio_rec_gesture.mjs — Rec on an Audio track records the
 * Move's INPUT into its clip (ui_audio_rec; the engine seq8_audio_rec.c).
 *
 * Driven through the REAL Rec press and the REAL tick / poll:
 *   - stopped: Rec arms the take (the file in the project's samples folder,
 *     named for the set, the clip and the tempo) and THEN the count-in, which
 *     is MIDI's; no note recording is armed;
 *   - after the count-in the heading says REC; Rec again asks the engine to
 *     stop (the bar, or a layer's punch-out), not MIDI's disarm;
 *   - done: when the host has written the file it lands — one undo unit, the
 *     clip marked loading; the card says RECORDED;
 *   - playing: Rec arms with no count-in; the heading blinks WAIT;
 *   - cancelled (silent): the file is removed, the card says why;
 *   - speakers on, no cable: the feedback question first; Back arms nothing;
 *   - a Slicer: Rec stays MIDI's (its chops). */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

/* the OLED: 128x64, what the draw calls leave */
const FB = new Uint8Array(128 * 64);
const px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => FB.fill(0);
globalThis.set_pixel = (x, y, c) => px(x, y, c);
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } for (let j = 0; j < h; j++) { px(x, y + j, c); px(x + w - 1, y + j, c); } };
for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'host_write_file',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display', 'move_midi_inject_to_move', 'set_led',
    'move_midi_internal_send', 'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
    'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi',
    'move_midi_external_send'])
    globalThis[fn] = () => 0;
let drawn = [];
globalThis.print = (x, y, s, c) => { drawn.push(String(s)); for (let i = 0; i < String(s).length; i++) px(x + i * 6, y + 3, c === undefined ? 1 : c); };
globalThis.pixel_print = (x, y, s) => { drawn.push(String(s)); };
globalThis.shadow_save_state_now = () => 1;
globalThis.shadow_set_param = () => 1;
globalThis.host_read_file = () => '';
globalThis.host_ui_publish = () => false;
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
let SAMPLING = false, SPEAKER = false, LINE = false;
globalThis.host_sampler_is_recording = () => SAMPLING;
globalThis.host_speaker_active = () => SPEAKER;
globalThis.host_line_in_connected = () => LINE;
const sets = [];
/* the LEDs: the last write to each button (CC) and pad (note), with its animation channel */
const BTN = {}, PAD = {};
globalThis.move_midi_internal_send = (m) => { if ((m[1] & 0xF0) === 0xB0) BTN[m[2]] = { c: m[3], a: m[1] & 15 }; else if ((m[1] & 0xF0) === 0x90) PAD[m[2]] = { c: m[3], a: m[1] & 15 }; return true; };
const WRITTEN = {};
const _hwf0 = globalThis.host_write_file;
globalThis.host_write_file = (p, b) => { WRITTEN[p] = String(b); globalThis.__stubStdWritten = globalThis.__stubStdWritten || {}; globalThis.__stubStdWritten[p] = String(b); return true; };
globalThis.host_file_exists = (p) => !!(globalThis.__stubStdWritten && globalThis.__stubStdWritten[p] !== undefined) || WRITTEN[p] !== undefined;
globalThis.host_read_file = (p) => WRITTEN[p] !== undefined ? WRITTEN[p] : '';
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };

const UUID = 'audio-rec-uuid', DIR = '/p/Samples';
let PLAYING = '0', REC = '0 0 0 0 0 0 0 0', INPUT = '0 0 0 0 0', METER = '0 0';
const snapshot = () => { const v = new Array(64).fill('0'); v[0] = PLAYING; return v.join(' '); };
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (k === 'state_uuid') return UUID;
    if (k === 'state_dirty') return '0';
    if (k === 'state_snapshot') return snapshot();
    if (/^t\d_au_dir$/.test(k)) return DIR;
    if (k === 't0_au_rec') return REC;
    if (/^t\d_au_in$/.test(k)) return INPUT;
    if (/^t\d_au_in_meter$/.test(k)) return METER;
    return '';
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, POLL_INTERVAL, PAD_MODE_AUDIO, PAD_MODE_SLICER } = await import('../../ui/ui_constants.mjs');
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
const { drawUI } = await import('../../ui/ui_render.mjs');
const MENU = await import('../../ui/ui_menu.mjs');
const PURE = await import('../../ui/ui_pure.mjs');
const LEDS = await import('../../ui/ui_leds.mjs');
const CONST = await import('../../ui/ui_constants.mjs');
const { BANK_INPUT } = CONST;
const PREFS = await import('../../ui/ui_prefs.mjs');
const INP = await import('../../ui/ui_audio_input.mjs');
const await_au = await import('../../ui/ui_audio.mjs');
const INFO_CELLS = () => INP.inputBankCells(2);
const headingInkAt = (y0, y1) => { screen(); let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < 128; x++) n += FB[y * 128 + x]; return n; };
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.currentSetUuid = UUID; S.activeTrack = 2; S.sessionView = false; S.playing = false;
S.currentSetName = 'My Song'; S.bpmMirror = 120;
for (let t = 0; t < 8; t++) S.trackPadMode[t] = 0;
S.trackPadMode[2] = PAD_MODE_AUDIO;
S.trackActiveClip[2] = 1;
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };
const poll = () => { const t0 = Date.now(); ticks(POLL_INTERVAL * 3); while (Date.now() - t0 < 70) {} ticks(2); };
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const rec = () => { cc(HC.MoveRec, 127); cc(HC.MoveRec, 0); };
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1])
    .concat(S.pendingDefaultSetParams.filter((e) => e.key === k).map((e) => String(e.val)));
const files = () => Object.keys(globalThis.__stubStdWritten || {}).filter((p) => p.startsWith(DIR)).sort();
const write = (p) => { globalThis.__stubStdWritten = globalThis.__stubStdWritten || {}; globalThis.__stubStdWritten[p] = 'RIFF'; };
const card = () => (S.actionPopupLines || []).join(' ');
const screen = () => { drawn = []; FB.fill(0); drawUI(); return drawn.join(' | '); };
/* the heading row (the top 8 lines): how many pixels it lights */
const headingInk = () => { screen(); let n = 0; for (let i = 0; i < 128 * 8; i++) n += FB[i]; return n; };
const headingCols = () => { screen(); let r = 0; for (let x = 127; x >= 0; x--) { for (let y = 0; y < 8; y++) if (FB[y * 128 + x]) return x; } return r; };
const await_fg = await import('/data/UserData/schwung/shared/feedback_gate.mjs');
const PATH = DIR + '/My Song 3B rec 120bpm.wav';
const clear = () => { sets.length = 0; S.pendingDefaultSetParams.length = 0; };
poll();

step('⭐⭐ stopped: Rec arms the take (its file), then MIDI\'s count-in — no note take', () => {
    clear(); globalThis.__stubStdWritten = {};
    rec();
    assert(sent('t2_au_rec_arm').join() === '1 599 |' + PATH, 'arm: ' + JSON.stringify(sent('t2_au_rec_arm')));
    assert(sent('record_count_in').join() === '2', 'count-in: ' + sent('record_count_in'));
    const q = sets.map((x) => x[0]).concat(S.pendingDefaultSetParams.map((e) => e.key));
    assert(q.indexOf('t2_au_rec_arm') < q.indexOf('record_count_in'), 'the count-in went before the arm: ' + q.join(','));
    assert(!sent('t2_recording').length, 'a note take was armed');
    assert(S.recordCountingIn && S.auRec, 'no count-in / take state');
});

step('⭐⭐ after the count-in the heading says REC; Rec again asks the engine to stop', () => {
    PLAYING = '1'; S.playing = true; S.recordCountingIn = false;
    const save = S.auRec; S.auRec = null;
    const plain = headingInk();                        /* CONTROL: the same screen with no take */
    S.auRec = save;
    REC = '2 2 1 44100 0 900 0 0'; poll();
    assert(!S.recordArmed, 'the note take is still armed after the count-in');
    const inked = headingInk();
    assert(plain > 0 && Math.abs(inked - plain) > 20, 'the heading did not gain the REC tag: ' + plain + ' -> ' + inked);
    ticks(3);
    assert(BTN[HC.MoveRec] && BTN[HC.MoveRec].c === 127 && BTN[HC.MoveRec].a === 0, 'the Rec LED is not solid red while recording: ' + JSON.stringify(BTN[HC.MoveRec]));
    /* Track view: the empty clip's pads count the bars in red — the first
     * pulsing (half a bar in), the rest dark (Free) */
    {
        const AU = await_au;
        const pulsing = () => Object.keys(PAD).filter((n) => n >= 68 && n < 100 && PAD[n].c === 120 && PAD[n].a > 0).map(Number);
        const k0 = [...Array(32).keys()].find((i) => AU.auPadToSlice(i, 2) === 0);
        S.trackActiveClip[2] = 1;                                     /* the take's clip (the stub snapshot reads 0) */
        LEDS.forceRedraw();
        assert(pulsing().join() === String(68 + k0), 'Track view: the recording bar\'s pad does not pulse red: ' + JSON.stringify(PAD));
        REC = "2 2 1 132300 0 900 0 0"; poll(); S.trackActiveClip[2] = 1; LEDS.forceRedraw();             /* 1.5 bars */
        const k1 = [...Array(32).keys()].find((i) => AU.auPadToSlice(i, 2) === 1);
        assert(pulsing().join() === String(68 + k1) && PAD[68 + k0].c === 120 && PAD[68 + k0].a === 0,
               'Track view: bar 1 is not solid red with bar 2 pulsing: ' + JSON.stringify(PAD));
    }
    /* Session view: the clip's pad pulses red, the top bar names the take */
    S.sessionView = true; S.sceneRow = 0;
    const saveR = S.auRec; S.auRec = null; const barPlain = headingInk(); S.auRec = saveR;
    ticks(3);
    const pad = PAD[92 - 1 * 8 + 2];
    assert(pad && pad.c === 120 && pad.a > 0, 'the recording clip\'s pad does not pulse white: ' + JSON.stringify(pad));
    assert(Math.abs(headingInk() - barPlain) > 20, 'Session view\'s top bar does not show the take');
    S.sessionView = false;
    clear(); rec();
    assert(sent('t2_au_rec_stop').length === 1, 'Rec again did not ask the engine: ' + JSON.stringify(sets));
    assert(!sent('t2_recording').length && !sent('record_count_in_cancel').length, 'MIDI\'s disarm ran');
});

step('⭐⭐ done: the written file lands — one undo unit, the clip loading, RECORDED', () => {
    REC = '4 2 1 176400 176400 900 0 768';
    SAMPLING = true; clear(); poll();
    assert(!sent('t2_au_rec_land').length, 'landed while the host was still writing');
    SAMPLING = false; write(PATH); poll();
    assert(sent('t2_au_rec_land').join() === '1', 'land: ' + JSON.stringify(sent('t2_au_rec_land')));
    assert(S.auInfo[2][1].state === 1, 'the clip is not marked loading');
    assert(/RECORDED/.test(card()) && /3B/.test(card()), 'card: ' + card());
    assert(!S.auRec, 'the take state stayed');
    REC = '0 2 1 0 0 0 0 0';
});

step('⭐ playing: Rec arms with no count-in; the heading blinks WAIT', () => {
    S.playing = true; PLAYING = '1'; S.trackClipPlaying[2] = true; S.trackQueuedClip[2] = -1;
    clear(); globalThis.__stubStdWritten = {};
    rec();
    assert(sent('t2_au_rec_arm').length === 1 && !sent('record_count_in').length, 'arm / count-in: ' + JSON.stringify(sets));
    REC = '1 2 1 0 0 0 0 0'; poll();
    const save = S.auRec; S.auRec = null;
    const plain = headingInk();
    S.auRec = save;
    let most = 0, least = 1e9;
    for (const ms of [0, 440, 880, 1320]) { S.clockMs = ms; const n = headingInk(); most = Math.max(most, n); least = Math.min(least, n); }
    ticks(3);
    assert(BTN[HC.MoveRec] && BTN[HC.MoveRec].c === 127 && BTN[HC.MoveRec].a > 0, 'the Rec LED does not blink while waiting: ' + JSON.stringify(BTN[HC.MoveRec]));
    assert(Math.abs(most - least) > 20 && (Math.abs(most - plain) <= 2 || Math.abs(least - plain) <= 2), 'the heading does not blink a WAIT tag: plain ' + plain + ', ' + least + '..' + most);
});

step('⭐ cancelled (silent): the file is removed, the card says why', () => {
    assert(S.auRec, 'rig: no take armed');
    write(S.auRec.path);
    REC = '2 2 ' + S.auRec.c + ' 132300 0 900 0 0'; poll(); S.trackActiveClip[2] = S.auRec.c; LEDS.forceRedraw();
    const lit = () => Object.keys(PAD).filter((n) => n >= 68 && n < 100 && PAD[n].c === 120).map(Number);
    assert(lit().length >= 2, 'rig: the take\'s pads are not red: ' + JSON.stringify(PAD));
    { const c0 = S.auRec.c; REC = '5 2 ' + c0 + ' 0 0 0 6 0'; poll(); S.trackActiveClip[2] = c0; ticks(3); }
    assert(!S.auRec && files().length === 0, 'left: ' + JSON.stringify(files()));
    assert(/No input heard/.test(card()), 'card: ' + card());
    /* the pads leave the take's white (found on the device, 2026-11-12) */
    assert(lit().length === 0, 'the pads stay white after the take: ' + lit());
    REC = '0 2 1 0 0 0 0 0';
});

step('⭐ speakers on, no cable: the feedback question first; Back arms nothing', () => {
    SPEAKER = true; LINE = false; clear();
    rec();
    assert(!sent('t2_au_rec_arm').length, 'armed before the question');
    assert(await_fg.feedbackGateActive(), 'the question is not up');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(!sent('t2_au_rec_arm').length && !S.auRec && !await_fg.feedbackGateActive(), 'Back armed the take, or left the question up');
    rec();
    cc(3, 127); cc(3, 0);                               /* jog click: Yes */
    assert(sent('t2_au_rec_arm').length === 1, 'Yes did not arm');
    SPEAKER = false;
    REC = '5 2 1 0 0 0 0 0'; poll();
    REC = '0 2 1 0 0 0 0 0';
});

step('⭐⭐ the INPUT bank (green, above SAMPLE): its knobs set the track\'s input; the screen shows a meter', () => {
    S.trackPadMode[2] = PAD_MODE_AUDIO; S.auRec = null; S.sessionView = false; S.activeTrack = 2;
    INPUT = '0 0 0 0 0'; S.auIn = null; S.inputPrefs = null;
    /* the pad map: INPUT sits above SAMPLE, green */
    const map = PURE.bankPadMapForMode(PAD_MODE_AUDIO, 2);
    assert(map[2].cells[2] && map[2].cells[2].bank === BANK_INPUT, 'INPUT not above SAMPLE: ' + JSON.stringify(map[2].cells));
    assert(map[2].cells[3] && map[2].cells[3].action === 'wave', 'SAMPLE moved');
    assert(!PURE.bankPadMapForMode(PAD_MODE_SLICER, 2)[2].cells.some((c) => c && c.bank === BANK_INPUT), 'a Slicer has INPUT');
    S.bankMapUp = true; S.bankMapKind = 'track';
    const col = LEDS.bankMapPadColors();
    S.bankMapUp = false;
    assert(col[PURE.bankMapPadForCell(2, 2) - 68] === 126, 'INPUT pad not green: ' + col[PURE.bankMapPadForCell(2, 2) - 68]);
    /* the real gesture: hold the jog, tap the INPUT pad, let go */
    S.activeBank = 0; S.trackActiveBank[2] = 0; ticks(2);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 9, 127]));
    cc(3, 127); ticks(3);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, PURE.bankMapPadForCell(2, 2), 100])); ticks(1);
    globalThis.onMidiMessageInternal(new Uint8Array([0x80, PURE.bankMapPadForCell(2, 2), 0])); ticks(1);
    cc(3, 0); globalThis.onMidiMessageInternal(new Uint8Array([0x80, 9, 0])); ticks(3);
    assert(S.activeBank === BANK_INPUT, 'the INPUT pad on the map did not open the bank: bank ' + S.activeBank);
    const turn = (k, n) => { for (let i = 0; i < Math.abs(n); i++) { cc(71 + k, n > 0 ? 1 : 127); } };
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 2, 127]));       /* touch K3 */
    clear(); turn(2, 30);                                                    /* Gain: a dB a pick */
    assert(sent('ain_gain').length && +sent('ain_gain').slice(-1)[0] > 0, 'Gain: ' + JSON.stringify(sent('ain_gain')));
    globalThis.onMidiMessageInternal(new Uint8Array([0x80, 2, 0]));
    clear(); turn(1, 20);                                                    /* Input: one deliberate step */
    assert(sent('ain_mode').join() === '1', 'Input: ' + JSON.stringify(sent('ain_mode')));
    clear(); turn(3, 40);
    assert(sent('t2_au_in_len').join() === '1,2', 'Length: ' + JSON.stringify(sent('t2_au_in_len')));
    clear(); turn(4, 20);
    assert(sent('t2_au_in_ovr').join() === '1', 'Overdub: ' + JSON.stringify(sent('t2_au_in_ovr')));
    /* Monitor: Rec -> Off (left), then On (right, past Rec) with no feedback risk */
    clear(); turn(0, -20);
    assert(sent('ain_mon').join() === '1', 'Monitor Off: ' + JSON.stringify(sent('ain_mon')));
    clear(); turn(0, 40);
    assert(sent('ain_mon').join() === '0,2', 'Monitor Rec, On: ' + JSON.stringify(sent('ain_mon')));
    /* speakers on, no cable: On asks first; Back keeps it as it was */
    SPEAKER = true; LINE = false; PREFS.setInputPref('mon', 0);
    clear(); turn(0, 20);
    assert(!sent('ain_mon').length, 'Monitor On without the question');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(!sent('ain_mon').length && PREFS.inputPrefs().mon === 0, 'Back set Monitor On');
    /* the global menu shows the same values the bank set, and sets them too */
    MENU.openGlobalMenu(); const items = S.globalMenuItems; S.globalMenuOpen = false;
    const it = (l) => items.find((x) => x && x.label === l);
    assert(it('Monitor') && it('Input') && it('Input Gain'), 'the global menu has no input rows');
    assert(it('Input').get() === 1 && it('Input Gain').get() === PREFS.inputPrefs().gain && it('Input').format(1) === 'Mono L',
           'the menu does not show what the bank set: ' + it('Input').get() + ' / ' + it('Input Gain').get());
    clear(); it('Input Gain').set(-3);
    assert(sent('ain_gain').join() === '-3' && /^0 1 -3/.test(String(WRITTEN['/data/UserData/daveboxSA/input.txt'])), 'the menu did not set / save: ' + WRITTEN['/data/UserData/daveboxSA/input.txt']);
    S.inputPrefs = null;
    assert(PREFS.inputPrefs().gain === -3 && PREFS.inputPrefs().mode === 1, 'not read back from the device file');
    assert(INFO_CELLS().slice(0, 3).map((c) => c.text).join() === 'Rec,Mono L,-3dB', 'the bank does not show the menu\'s values: ' + INFO_CELLS().slice(0, 3).map((c) => c.text).join());
    PREFS.setInputPref('mode', 0); PREFS.setInputPref('gain', 0);
    SPEAKER = false;
    /* the screen: the meter where the waveform sits, moving with the input */
    METER = '0 0'; S.auInMeter = null; ticks(8); const quiet = headingInkAt(46, 57);
    METER = '30000 30000'; S.auInMeter = null; { const t0 = Date.now(); while (Date.now() - t0 < 60) {} } ticks(8); const loud = headingInkAt(46, 57);
    assert(loud > quiet + 60, 'the meter does not move with the input: ' + quiet + ' -> ' + loud);
    /* the INPUT bank shows the meter on a clip WITH a sample too; every other
     * bank keeps the waveform (Josh, 2026-11-12: "always there on input.
     * sample bank (and any other bank) shows waveform/nosample") */
    {
        const c = await_au.auClipOf(2), keep = S.auInfo[2][c];
        S.auInfo[2][c] = Object.assign({}, keep, { state: 2, name: 'x.wav', nframes: 88200, rate: 44100, ch: 2 });
        METER = '30000 30000'; S.auInMeter = null; { const t0 = Date.now(); while (Date.now() - t0 < 60) {} } ticks(8);
        assert(S.auInMeter && S.auInMeter.l > 0.5, 'the meter is not read on a clip with a sample');
        S.auInMeter = { l: 1, r: 1, clipUntil: 0, at: 0 };
        const full = headingInkAt(46, 57); S.auInMeter = { l: 0, r: 0, clipUntil: 0, at: 0 };
        assert(full > headingInkAt(46, 57) + 60, 'the meter is not drawn over a clip with a sample');
        /* CONTROL: another bank, no meter read or drawn */
        S.activeBank = 0; S.trackActiveBank[2] = 0; S.auInMeter = null;
        { const t0 = Date.now(); while (Date.now() - t0 < 60) {} } ticks(8);
        assert(!S.auInMeter, 'the meter is read on the CLIP bank');
        S.auInMeter = { l: 1, r: 1, clipUntil: 0, at: 0 };
        const other = headingInkAt(46, 57); S.auInMeter = { l: 0, r: 0, clipUntil: 0, at: 0 };
        assert(Math.abs(other - headingInkAt(46, 57)) < 10, 'the meter is drawn on the CLIP bank');
        S.auInfo[2][c] = keep;
    }
    S.activeBank = 0; S.trackActiveBank[2] = 0;
});

step('CONTROL: a Slicer keeps Rec for its chops', () => {
    S.trackPadMode[2] = PAD_MODE_SLICER; S.auRec = null; clear();
    rec();
    assert(!sent('t2_au_rec_arm').length, 'a Slicer armed an input take');
    assert(sent('t2_recording').join() === '1', 'the Slicer\'s note take did not arm: ' + JSON.stringify(sets));
});

if (failed) { console.error('FAIL: test_audio_rec_gesture'); process.exit(1); }
console.log('PASS: test_audio_rec_gesture');
process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
