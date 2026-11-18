/* tests/js/test_dictation_gesture.mjs — push-to-talk dictation on the shared
 * keyboard, through the real gestures: the host's MIDI entry point
 * (onMidiMessageInternal), the real tick, the real drawn frame.
 *
 * Hold Rec on any keyboard to talk, release to transcribe. The audio comes
 * from the host sampler (Move Input), the words from a helper process; both
 * are faked here at the host-binding seam, in the order the device produces
 * them: the sampler reports recording a poll after start, keeps reporting it
 * for a couple of polls after stop while the WAV is closed, and the helper's
 * answer is a JSON file that appears later.
 *
 * Routes: Project menu → Save as Template... (the menu keyboard) and the
 * project picker's Rename. Sound mode's Save As is covered in
 * test_canvas_page_door.mjs (the repaint there is its own trap). */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }
const J = JSON.stringify;

/* ---- the clock ------------------------------------------------------------ */
let NOW = 1.8e12;
Date.now = () => NOW;

/* ---- the host -------------------------------------------------------------- */
globalThis.HOST_INSTALL_DIR = '/data/UserData/daveboxSA';   /* js_host_common.c, the SA flavour */
const LOG = [];
const SPAWNED = [];          /* dictation ids, in spawn order */
const FILES = {};
const listing = { current: 1, projects: [
    { uuid: 'a', name: 'Alpha', index: 0, color: 2 },
    { uuid: 'b', name: 'Beta', index: 1, color: 1 },
], templates: [] };
const ALLOWED = ['tar ', 'cp ', 'mv ', 'mkdir ', 'rm ', 'ls ', 'test ', 'chmod ', 'sh '];
globalThis.host_ui_publish = () => false;
globalThis.host_system_cmd = (c) => {
    c = String(c);
    if (!ALLOWED.some(v => c.startsWith(v))) { LOG.push('REFUSED ' + c); return -1; }
    LOG.push('cmd ' + c);
    const m = /stt-run\.sh' '[^']*' (d[0-9a-z]+) /.exec(c);
    if (m) SPAWNED.push(m[1]);
    return 0;
};
globalThis.host_read_file = (p) => {
    p = String(p);
    if (/projects\.json$/.test(p)) return J(listing);
    return FILES[p] !== undefined ? FILES[p] : '';
};
globalThis.host_write_file = (p, body) => { FILES[String(p)] = String(body); LOG.push('write ' + p); return true; };
globalThis.host_file_exists = (p) => String(p) in FILES;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { LOG.push('set ' + k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.host_module_get_params = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_params = () => '';
globalThis.shadow_set_params = () => true;
globalThis.shadow_save_state_now = () => true;
for (const fn of ['host_vol_block', 'host_edit_cc_block', 'clear_screen', 'draw_rect',
                  'draw_line', 'set_pixel', 'flush_display', 'set_led',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_autosave_hold',
                  'pixel_print', 'move_midi_external_send', 'stipple_rect', 'host_pad_block'])
    globalThis[fn] = () => 0;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

/* The sampler, as the shim behaves (shadow_ui.c / shadow_sampler.c): source
 * 0 = Resample, 1 = Move Input; start begins recording at once (unless the
 * previous take's I/O is busy — silently); stop keeps "recording" true while
 * the worker closes the file. */
const SAMP = { state: 0, source: 0, recording: false, startOk: true, closing: 0, vu: 0 };
globalThis.shadow_get_overlay_state = () => ({ type: 0, samplerState: SAMP.state, samplerSource: SAMP.source, samplerVuPeak: SAMP.vu });
globalThis.host_sampler_is_recording = () => SAMP.recording;
/* The sampler's worker closes the file over a few ticks, however often it is asked. */
function samplerWorker() { if (SAMP.closing > 0 && --SAMP.closing === 0) SAMP.recording = false; }
globalThis.host_sampler_set_silent = (v) => { LOG.push('silent ' + v); return true; };
globalThis.host_sampler_set_source = (v) => { LOG.push('source ' + v); SAMP.source = v ? 1 : 0; return true; };
globalThis.host_sampler_start = (p) => { LOG.push('start ' + p); if (SAMP.startOk) SAMP.recording = true; return true; };
globalThis.host_sampler_stop = () => { LOG.push('stop'); if (SAMP.recording) SAMP.closing = 3; return true; };

/* The line-in jack as the hardware reports it (shadow_control), and what
 * this host tells the Move about it (CC 114 through the inject ring). */
const JACK = { lineIn: false };
globalThis.host_line_in_connected = () => JACK.lineIn;
globalThis.move_midi_inject_to_move = (pkt) => { if (pkt[2] === 114) LOG.push('jack114 ' + pkt[3]); return true; };

/* LEDs: the last write to each button, with its animation channel. */
const BTN = {};
globalThis.move_midi_internal_send = (pkt) => {
    if (pkt[0] === 0x0b) BTN[pkt[2]] = { color: pkt[3], ch: pkt[1] & 0x0F };
    return true;
};

/* What is ON SCREEN: every string drawn, plus inverted bars. */
let INK = [];
globalThis.print = (x, y, str, c) => { INK.push(String(str) + (c === 0 ? '(inv)' : '')); };
/* The dictation card (text_entry.mjs CARD/METER): its frame's top edge, and
 * the level meter's fill, by width. */
globalThis.fill_rect = (x, y, w, h, c) => {
    if (x === 8 && y === 15 && w === 112 && h === 1 && c === 1) INK.push('[CARD]');
    if (x === 17 && y === 37 && h === 4 && c === 1) INK.push('[LEVEL ' + w + ']');
};
const levelPx = (sc) => { const m = /\[LEVEL (\d+)\]/.exec(sc); return m ? +m[1] : 0; };

async function main() {
const { S } = await import('../../ui/ui_state.mjs');
await import('../../ui/ui.js');
const menu = await import('../../ui/ui_menu.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const dlg = await import('../../ui/ui_dialogs.mjs');
const leds = await import('../../ui/ui_leds.mjs');
const render = await import('../../ui/ui_render.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
const te = await import('/data/UserData/schwung/shared/text_entry.mjs');
const dict = await import('/data/UserData/schwung/shared/dictation.mjs');
const { LED_PULSE_4TH } = await import('../../ui/ui_constants.mjs');
const { Red, White } = await import('/data/UserData/schwung/shared/constants.mjs');
fonts.setKitTextTrace((t) => INK.push(t));
globalThis.init();                 /* the real start-up: it registers the keyboard's dictation hooks */

const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const click = () => { cc(3, 127); cc(3, 0); };
const jog = (d) => cc(14, d > 0 ? 1 : 127);
const ticks = (n) => { for (let i = 0; i < n; i++) { samplerWorker(); S.tickCount++; tickmod._tickImpl(); } };
const later = (ms) => { NOW += ms; ticks(1); };
const recDown = () => cc(86, 127);
const recUp = () => cc(86, 0);
const screen = () => { INK = []; render.drawUI(); return INK.join(' | ').toUpperCase(); };
const kb = () => te.getTextEntryBuffer();
const dstate = () => (te.getTextEntryView() || {}).dictation || {};
const popup = () => (S.actionPopupLines || []).join(' / ');
const keyboardConfirm = () => { for (let i = 0; i < 120; i++) jog(1); click(); };
const lastId = () => SPAWNED[SPAWNED.length - 1] || null;
const WORK = '/data/UserData/daveboxSA/dictation';
const answer = (obj) => { FILES[WORK + '/' + lastId() + '.json'] = J(obj); };

function ready() {
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
    S.awaitingProjectSelect = false; S.sessionView = false; S.currentSetUuid = 'proj-uuid';
    S.pendingSetLoad = false; S.pendingDspSync = 0; S.playing = false;
    S.projectPadPicker = null; S.templateManager = null; S.templateNameEntry = null;
    S.globalMenuOpen = false;
    te.closeTextEntry();
    SAMP.state = 0; SAMP.source = 0; SAMP.recording = false; SAMP.startOk = true; SAMP.closing = 0;
    JACK.lineIn = false; S.inputPrefs = { mon: 0, mode: 0, gain: 0 };
    if (!S.bankParams || !S.bankParams[0])
        S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
    NOW += 5000; ticks(1);                       /* any notice from a step before expires */
}
/* The menu keyboard on S.currentSetName. */
function openTemplateKeyboard(name) {
    ready();
    S.currentSetName = name;
    menu.openGlobalMenuAt('Save as Template...'); click(); ticks(1);
    assert(te.isTextEntryActive() && kb() === name, 'rig: no keyboard on ' + J(name) + ' (got ' + J(kb()) + ')');
    LOG.length = 0;
}
/* Talk for `ms`, release, let the WAV close, answer, land. */
function dictate(obj, ms = 1500) {
    recDown(); ticks(1);
    later(ms);
    recUp(); ticks(5);
    answer(obj);
    later(150);
}

step('Rec on the keyboard: the dim "available" light', () => {
    openTemplateKeyboard('Old Name');
    ticks(1);
    assert(BTN[86] && BTN[86].color === 16 && BTN[86].ch === 0, 'Rec LED ' + J(BTN[86]));
});

step('⭐ hold Rec: the sampler on the Move input (silently), the helper started — in that order, on /data/UserData', () => {
    openTemplateKeyboard('Old Name');
    const armed = S.recordArmed;
    recDown();
    const i = (re) => LOG.findIndex(l => re.test(l));
    const iSil = i(/^silent 1$/), iSrc = i(/^source 1$/), iStart = i(/^start /), iCmd = i(/stt-run\.sh/);
    assert(iSil >= 0 && iSrc > iSil && iStart > iSrc && iCmd > iStart, 'order: ' + J(LOG));
    const start = LOG[iStart].slice(6), cmd = LOG[iCmd];
    assert(start.startsWith(WORK + '/') && start.endsWith('.wav'), 'take path ' + start);
    assert(cmd === "cmd sh '/data/UserData/daveboxSA/stt/stt-run.sh' '" + WORK + "' " + lastId() + ' 10 >/dev/null 2>&1 &',
           'spawn ' + cmd + ' / id ' + lastId());
    assert(!LOG.some(l => /\/tmp/.test(l)), '/tmp: ' + J(LOG));
    assert(S.recordArmed === armed, 'Rec under the keyboard armed recording');
    ticks(1);
    const sc = screen();
    assert(/\[CARD\]/.test(sc) && /LISTENING/.test(sc) && /0S/.test(sc), 'on screen: ' + sc);
    assert(/OLD NAME/.test(sc), 'the name is not kept in view above the card: ' + sc);
    assert(BTN[86].color === Red && BTN[86].ch === 0, 'Rec LED ' + J(BTN[86]));
    later(2300);
    assert(/\b2S\b/.test(screen()), 'seconds do not count: ' + screen());
});

step('…while the mic is open the keyboard ignores the jog and the click', () => {
    const before = [kb(), te.getTextEntryView().selected];
    jog(1); jog(1); click();
    assert(J([kb(), te.getTextEntryView().selected]) === J(before), 'keyboard moved: ' + J([kb(), te.getTextEntryView().selected]));
});

step('⭐ release: TRANSCRIBING; the go only once the WAV is closed; the user\'s sampler put back', () => {
    LOG.length = 0;
    recUp();
    assert(LOG.indexOf('stop') >= 0, 'release did not stop the sampler: ' + J(LOG));
    ticks(1);
    assert(!LOG.some(l => /\.go$/.test(l)), 'go written while the sampler was still recording: ' + J(LOG));
    assert(/TRANSCRIBING/.test(screen()), 'on screen: ' + screen());
    ticks(4);
    const iGo = LOG.findIndex(l => /\.go$/.test(l));
    const iRestore = LOG.indexOf('source 0'), iSilent = LOG.indexOf('silent 0');
    assert(iGo >= 0, 'no go: ' + J(LOG));
    assert(iRestore >= 0 && iRestore < iGo && iSilent >= 0, 'not restored before the go: ' + J(LOG));
    assert(SAMP.source === 0, 'the sampler is left on the Move input');
    assert(dstate().state === 'transcribing', 'state ' + J(dstate()));
    assert(BTN[86].color === White && BTN[86].ch === LED_PULSE_4TH, 'Rec LED ' + J(BTN[86]));
});

step('⭐ the words land: they REPLACE the untouched name, on screen; OK saves under them', () => {
    answer({ ok: true, text: ' Late night drive.', load_ms: 300, decode_ms: 400 });
    later(150);
    assert(kb() === 'Late night drive', 'buffer ' + J(kb()));
    const sc = screen();
    assert(/LATE NIGHT DRIVE/.test(sc) && !/\[BAR\]/.test(sc), 'on screen: ' + sc);
    assert(BTN[86].color === 16 && BTN[86].ch === 0, 'Rec LED ' + J(BTN[86]));
    keyboardConfirm(); ticks(4);
    assert(LOG.some(l => /template-set .*'Late night drive'$/.test(l)), J(LOG.filter(l => /template/.test(l))));
});

step('after typing, a transcript APPENDS with one space; sanitised to the keyboard\'s characters', () => {
    openTemplateKeyboard('Josh');
    click();                                    /* the selected key: 'a' */
    assert(kb() === 'Josha', 'rig: ' + kb());
    dictate({ ok: true, text: 'two  — tracks?' });
    assert(kb() === 'Josha two tracks', 'buffer ' + J(kb()));
});

step('silence: the name is untouched, NO SPEECH shows, then goes', () => {
    openTemplateKeyboard('Keep Me');
    dictate({ ok: false, text: '', err: 'no_speech' });
    assert(kb() === 'Keep Me', 'buffer ' + J(kb()));
    assert(/NO SPEECH/.test(screen()), 'on screen: ' + screen());
    later(2000);
    assert(!/NO SPEECH/.test(screen()) && !/\[BAR\]/.test(screen()), 'notice stuck: ' + screen());
    dictate({ ok: false, err: 'load_failed' });
    assert(kb() === 'Keep Me' && /STT FAILED/.test(screen()), J([kb(), screen()]));
});

step('the sampler busy (menu open, recording, paused): MIC BUSY, nothing started', () => {
    for (const st of [1, 2, 4]) {
        openTemplateKeyboard('X');
        SAMP.state = st;
        recDown(); ticks(1);
        assert(!LOG.some(l => /^start |stt-run/.test(l)), 'started with sampler state ' + st + ': ' + J(LOG));
        assert(/MIC BUSY/.test(screen()), 'on screen: ' + screen());
        recUp();
    }
});

step('a start that never takes: MIC BUSY, the helper cancelled, the sampler put back', () => {
    openTemplateKeyboard('X');
    SAMP.startOk = false;
    recDown(); ticks(1);
    later(700);
    assert(/MIC BUSY/.test(screen()), 'on screen: ' + screen());
    assert(LOG.indexOf('source 0') >= 0 && LOG.some(l => /\.cancel$/.test(l)), J(LOG));
    assert(SAMP.source === 0, 'source left on the Move input');
});

step('the user\'s sampler on Move Input stays on Move Input', () => {
    openTemplateKeyboard('X');
    SAMP.source = 1;
    dictate({ ok: true, text: 'hi' });
    assert(SAMP.source === 1 && LOG.indexOf('source 0') < 0, J(LOG));
    assert(kb() === 'hi', kb());
});

step('a tap is not a take: the hint, no go, the helper cancelled', () => {
    openTemplateKeyboard('X');
    recDown(); ticks(1); later(100); recUp(); ticks(5);
    assert(/HOLD REC TO TALK/.test(screen()), 'on screen: ' + screen());
    assert(!LOG.some(l => /\.go$/.test(l)) && LOG.some(l => /\.cancel$/.test(l)), J(LOG));
    assert(SAMP.source === 0 && kb() === 'X', 'state left behind');
});

step('the 10 s cap stops the take with Rec still held', () => {
    openTemplateKeyboard('X');
    recDown(); ticks(1);
    later(dict.MAX_TALK_MS + 50);
    assert(LOG.indexOf('stop') >= 0, 'no stop at the cap: ' + J(LOG));
    ticks(5);
    assert(dstate().state === 'transcribing', 'state ' + J(dstate()));
    recUp(); ticks(1);
    assert(dstate().state === 'transcribing', 'the late release disturbed it: ' + J(dstate()));
});

step('the Sample button stopping the take behind our back: it carries on to transcribe', () => {
    openTemplateKeyboard('X');
    recDown(); ticks(1); later(1200);
    SAMP.closing = 2;                           /* the shim stopped it */
    ticks(6);
    assert(dstate().state === 'transcribing' && LOG.some(l => /\.go$/.test(l)), J([dstate(), LOG]));
});

step('⭐ Back while listening cancels the dictation only; a second Back closes the keyboard', () => {
    openTemplateKeyboard('Stay');
    recDown(); ticks(1); later(800);
    cc(51, 127); cc(51, 0); ticks(5);
    assert(te.isTextEntryActive(), 'Back closed the keyboard');
    assert(kb() === 'Stay' && dstate().state !== 'listening', J([kb(), dstate()]));
    assert(LOG.indexOf('stop') >= 0 && LOG.some(l => /\.cancel$/.test(l)) && SAMP.source === 0, J(LOG));
    cc(51, 127); cc(51, 0); ticks(8);
    assert(!te.isTextEntryActive(), 'the second Back did not close it');
});

step('Back while transcribing: cancelled, and the late answer is ignored', () => {
    openTemplateKeyboard('Stay');
    recDown(); ticks(1); later(800); recUp(); ticks(5);
    assert(dstate().state === 'transcribing', 'rig ' + J(dstate()));
    cc(51, 127); cc(51, 0); ticks(1);
    assert(te.isTextEntryActive() && LOG.some(l => /\.cancel$/.test(l)), J(LOG));
    answer({ ok: true, text: 'too late' });
    later(300); ticks(3);
    assert(kb() === 'Stay', 'the cancelled answer landed: ' + kb());
});

step('⭐ the keys under the card are dead while it TRANSCRIBES: no typing, no OK', () => {
    openTemplateKeyboard('Mine');
    recDown(); ticks(1); later(800); recUp(); ticks(5);
    assert(dstate().state === 'transcribing', 'rig: ' + J(dstate()));
    const before = [kb(), te.getTextEntryView().selected];
    jog(1); click(); note(70, 100); note(70, 0); keyboardConfirm(); ticks(2);
    assert(te.isTextEntryActive(), 'OK under the card closed the keyboard');
    assert(J([kb(), te.getTextEntryView().selected]) === J(before), 'keys moved under the card: ' + J([kb(), te.getTextEntryView().selected]));
    assert(!LOG.some(l => /template-set/.test(l)), 'saved from under the card');
});

step('…and while a notice shows; Back takes the notice down, a second Back leaves', () => {
    openTemplateKeyboard('Mine');
    recDown(); ticks(1); later(100); recUp(); ticks(5);          /* a tap: the hint */
    assert(/HOLD REC TO TALK/.test(screen()), 'rig: ' + screen());
    const sel = te.getTextEntryView().selected;
    jog(1); click(); ticks(1);
    assert(kb() === 'Mine' && te.getTextEntryView().selected === sel, 'keys moved under the notice');
    cc(51, 127); cc(51, 0); ticks(1);
    assert(te.isTextEntryActive() && !/HOLD REC/.test(screen()), 'Back did not just dismiss: ' + screen());
    cc(51, 127); cc(51, 0); ticks(1);
    assert(!te.isTextEntryActive(), 'second Back did not leave');
});

step('the keyboard closing mid-take tears it down', () => {
    openTemplateKeyboard('Mine');
    recDown(); ticks(1); later(800); recUp(); ticks(5);
    te.closeTextEntry(); ticks(4);
    assert(LOG.some(l => /\.cancel$/.test(l)), 'helper not cancelled: ' + J(LOG));
    const stale = lastId();
    openTemplateKeyboard('Next');
    FILES[WORK + '/' + stale + '.json'] = J({ ok: true, text: 'stale words' });
    later(300); ticks(3);
    assert(kb() === 'Next', 'the previous keyboard\'s transcript landed here: ' + kb());
    recDown(); ticks(1); later(500);
    te.closeTextEntry();
    assert(!dict.dictationActive(), 'dictation still live');
    assert(LOG.indexOf('silent 0') < 0, 'the prompts back on before the sampler stopped (it would say Sample saved): ' + J(LOG));
    ticks(5);                                   /* no keyboard now: the dAVEBOx tick serves it */
    assert(LOG.indexOf('stop') >= 0 && SAMP.source === 0 && LOG.indexOf('silent 0') > LOG.indexOf('stop')
           && LOG.some(l => /\.cancel$/.test(l)), J(LOG));
});

step('⭐ the project picker\'s Rename: Rec lights in the picker\'s painter; the words rename', () => {
    ready();
    dlg.openProjectPadPicker(); ticks(1);
    assert(S.projectPadPicker, 'rig: no picker');
    note(68, 100); note(68, 0); ticks(1);         /* pad 0 = Alpha → its menu */
    for (let n = 0; n < 4 && !te.isTextEntryActive(); n++) {
        const p = S.projectPadPicker;
        if (!p || !p.menu) break;
        if (/RENAME/.test(screen()) && n > 0) click(); else { jog(1); click(); }
        ticks(1);
    }
    assert(te.isTextEntryActive() && kb() === 'Alpha', 'rig: no rename keyboard (' + J(kb()) + ') screen ' + screen());
    ticks(1);
    assert(BTN[86] && BTN[86].color === 16, 'Rec LED under the rename keyboard ' + J(BTN[86]));
    assert(BTN[60] && BTN[60].color === 0, 'Copy still lit under the keyboard ' + J(BTN[60]));
    LOG.length = 0;
    recDown(); ticks(2);
    assert(BTN[86].color === Red, 'Rec LED while listening ' + J(BTN[86]));
    later(1500); recUp(); ticks(5);
    assert(BTN[86].color === White && BTN[86].ch === LED_PULSE_4TH, 'Rec LED transcribing ' + J(BTN[86]));
    answer({ ok: true, text: 'Morning Sketch' }); later(150);
    assert(kb() === 'Morning Sketch', 'buffer ' + kb());
    keyboardConfirm(); ticks(4);
    assert(LOG.some(l => /rename/.test(l) && /Morning Sketch/.test(l)), 'no rename: ' + J(LOG.filter(l => /cmd/.test(l))));
});

step('Rec with no keyboard is still Record', () => {
    ready();
    LOG.length = 0;
    const before = !!S.recordArmed;
    cc(86, 127); cc(86, 0); ticks(2);
    assert(!!S.recordArmed !== before, 'Rec did not reach Record (armed ' + S.recordArmed + ')');
    cc(86, 127); cc(86, 0); ticks(2);           /* and back */
    assert(!LOG.some(l => /stt-run|^start /.test(l)), 'dictation without a keyboard: ' + J(LOG));
    assert(!dict.dictationActive(), 'a dictation started');
});

step('idle costs nothing: an open keyboard with no dictation makes no sampler or file call', () => {
    openTemplateKeyboard('Quiet');
    const was = { o: globalThis.shadow_get_overlay_state, r: globalThis.host_sampler_is_recording, e: globalThis.host_file_exists };
    let calls = 0;
    globalThis.shadow_get_overlay_state = () => { calls++; return was.o(); };
    globalThis.host_sampler_is_recording = () => { calls++; return was.r(); };
    globalThis.host_file_exists = (p) => { if (/dictation/.test(p)) calls++; return was.e(p); };
    ticks(20);
    Object.assign(globalThis, { shadow_get_overlay_state: was.o, host_sampler_is_recording: was.r, host_file_exists: was.e });
    assert(calls === 0, calls + ' host calls from an idle keyboard');
});

step('⭐ transport playing: Rec says STOP TO TALK, nothing starts, the Rec light is dark', () => {
    openTemplateKeyboard('Old Name');
    S.playing = true; ticks(1);
    assert(BTN[86].color === 0, 'Rec LED while playing ' + J(BTN[86]));
    const n = SPAWNED.length;
    recDown(); ticks(1);
    assert(!LOG.some(l => /^start |^source |^silent |^set ain_mon|^jack114/.test(l)) && SPAWNED.length === n, 'started: ' + J(LOG));
    assert(/STOP TO TALK/.test(screen()), 'on screen: ' + screen());
    recUp(); S.playing = false;
});

step('the transport starting mid-take (from outside) ends it: stopped, put back, cancelled', () => {
    openTemplateKeyboard('Old Name');
    recDown(); ticks(1); later(600);
    LOG.length = 0;
    S.playing = true; ticks(5);
    assert(LOG.indexOf('stop') >= 0 && LOG.indexOf('silent 0') >= 0, 'not stopped/restored: ' + J(LOG));
    assert(FILES[WORK + '/' + lastId() + '.cancel'] === '1', 'helper not cancelled');
    assert(!dict.dictationActive() && /STOP TO TALK/.test(screen()), 'on screen: ' + screen());
    recUp(); S.playing = false;
});

step('⭐ Monitor On: Off for the take, On again once it stops; the saved setting untouched', () => {
    openTemplateKeyboard('Old Name');
    S.inputPrefs = { mon: 2, mode: 0, gain: 0 };
    recDown();
    const iMute = LOG.indexOf('set ain_mon=1'), iStart = LOG.findIndex(l => /^start /.test(l));
    assert(iMute >= 0 && iMute < iStart, 'monitoring not off before the take: ' + J(LOG));
    later(1200); recUp(); ticks(1);
    assert(LOG.indexOf('set ain_mon=2') < 0, 'monitoring back on while the take is still closing: ' + J(LOG));
    ticks(4);
    const iBack = LOG.indexOf('set ain_mon=2');
    assert(iBack > LOG.indexOf('stop'), 'monitoring not restored after the take: ' + J(LOG));
    assert(!LOG.some(l => /input\.txt/.test(l)), 'the saved input setting was rewritten: ' + J(LOG));
    assert(S.inputPrefs.mon === 2, 'pref changed');
});

step('Monitor On, cancelled with Back: monitoring comes back too', () => {
    openTemplateKeyboard('Old Name');
    S.inputPrefs = { mon: 2, mode: 0, gain: 0 };
    recDown(); ticks(1); later(800);
    cc(51, 127); cc(51, 0); ticks(5);
    assert(LOG.indexOf('set ain_mon=1') >= 0 && LOG.lastIndexOf('set ain_mon=2') > LOG.indexOf('set ain_mon=1'), J(LOG));
    recUp();
});

step('Monitor Rec is turned Off for the take too; Monitor Off leaves the engine alone', () => {
    for (const mon of [1, 0]) {
        openTemplateKeyboard('Old Name');
        S.inputPrefs = { mon, mode: 0, gain: 0 };
        if (mon === 0) { recDown(); assert(LOG.indexOf('set ain_mon=1') >= 0, 'Rec not muted: ' + J(LOG)); recUp(); ticks(6); continue; }
        dictate({ ok: true, text: 'x' });
        assert(!LOG.some(l => /^set ain_mon/.test(l)), 'monitor set with it Off: ' + J(LOG));
    }
});

step('⭐ a cable in line-in: the Move is told the jack is empty for the take, and the truth after', () => {
    openTemplateKeyboard('Old Name');
    JACK.lineIn = true;
    recDown();
    const iJack = LOG.indexOf('jack114 0'), iStart = LOG.findIndex(l => /^start /.test(l));
    assert(iJack >= 0 && iJack < iStart, 'mic not selected before the take: ' + J(LOG));
    later(1200); recUp(); ticks(5);
    assert(LOG.indexOf('jack114 127') > LOG.indexOf('stop'), 'line-in not given back after the take: ' + J(LOG));
});

step('…a cable pulled mid-take: the Move is told the jack is empty (the hardware\'s answer, not the old one)', () => {
    openTemplateKeyboard('Old Name');
    JACK.lineIn = true;
    recDown(); later(800);
    JACK.lineIn = false;
    recUp(); ticks(5);
    const after = LOG.slice(LOG.indexOf('stop'));
    assert(after.indexOf('jack114 0') >= 0 && after.indexOf('jack114 127') < 0, J(LOG));
});

step('no cable: the jack is never mentioned to the Move', () => {
    openTemplateKeyboard('Old Name');
    dictate({ ok: true, text: 'x' });
    assert(!LOG.some(l => /^jack114/.test(l)), J(LOG));
});

step('⭐ the card\'s meter follows the mic: silence is empty, a loud peak fills it, and it repaints by itself', () => {
    openTemplateKeyboard('Old Name');
    recDown(); ticks(1); later(400);
    SAMP.vu = 0; later(50);
    assert(levelPx(screen()) === 0, 'silence drew a level: ' + screen());
    SAMP.vu = 3277;                                /* -20 dBFS */
    assert(te.tickTextEntry() === true, 'a level change did not ask for a repaint');
    const mid = levelPx(screen());
    SAMP.vu = 32767; later(50);
    const full = levelPx(screen());
    assert(mid > 40 && mid < 80 && full === 94, 'meter: -20 dB=' + mid + 'px, 0 dB=' + full + 'px (of 94)');
    SAMP.vu = 0; recUp(); ticks(6);
    assert(!/\[LEVEL/.test(screen()), 'the meter stays up while transcribing: ' + screen());
});

step('⭐ every cancel puts the prompts back only once the sampler has STOPPED (else: "Sample saved")', () => {
    for (const how of ['tap', 'back', 'transport']) {
        openTemplateKeyboard('Old Name');
        S.inputPrefs = { mon: 2, mode: 0, gain: 0 }; JACK.lineIn = true;
        recDown(); ticks(1);
        if (how === 'tap') { later(100); recUp(); }
        else if (how === 'back') { later(800); cc(51, 127); cc(51, 0); }
        else { later(800); S.playing = true; }
        ticks(1);
        assert(SAMP.recording, how + ': rig: the sampler should still be closing');
        for (const l of ['silent 0', 'source 0', 'set ain_mon=2', 'jack114 127'])
            assert(LOG.indexOf(l) < 0, how + ': ' + l + ' while the sampler is still stopping: ' + J(LOG));
        ticks(5);
        assert(!SAMP.recording, how + ': rig: still recording');
        for (const l of ['silent 0', 'source 0', 'set ain_mon=2', 'jack114 127'])
            assert(LOG.indexOf(l) > LOG.indexOf('stop'), how + ': ' + l + ' not restored after the stop: ' + J(LOG));
        if (how === 'tap') recUp(); else recUp();
        S.playing = false;
    }
});

step('a press while our cancelled take is still stopping WAITS for it, then starts (no MIC BUSY)', () => {
    openTemplateKeyboard('Old Name');
    recDown(); ticks(1); later(100); recUp();      /* a tap: the sampler is now closing */
    recDown();
    assert(!/MIC BUSY/.test(screen()) && /LISTENING/.test(screen()), 'on screen: ' + screen());
    const starts = LOG.filter(l => /^start /.test(l)).length;
    ticks(5);
    assert(LOG.filter(l => /^start /.test(l)).length === starts + 1, 'the held press never started: ' + J(LOG));
    later(1200); recUp(); ticks(5);
    assert(dstate().state === 'transcribing', 'state ' + J(dstate()));
    cc(51, 127); cc(51, 0); ticks(5);
});

step('the jack message is retried until the Move takes it (a full inject ring)', () => {
    openTemplateKeyboard('Old Name');
    JACK.lineIn = true;
    recDown(); later(800); recUp();
    const real = globalThis.move_midi_inject_to_move;
    let refuse = 3;
    globalThis.move_midi_inject_to_move = (pkt) => { if (refuse > 0) { refuse--; LOG.push('ring full'); return false; } return real(pkt); };
    ticks(8);
    globalThis.move_midi_inject_to_move = real;
    const i = LOG.indexOf('jack114 127');
    assert(i > LOG.lastIndexOf('ring full') && LOG.filter(l => l === 'ring full').length === 3, 'not retried: ' + J(LOG));
    cc(51, 127); cc(51, 0); ticks(5);
});

step('the cap holds even when nothing ticks the keyboard (only the dAVEBOx tick runs)', () => {
    openTemplateKeyboard('Old Name');
    recDown(); ticks(1);
    const real = te.tickTextEntry;
    NOW += 10500;
    dict.dictationService();
    assert(LOG.indexOf('stop') >= 0, 'an uncapped take: ' + J(LOG));
    recUp(); ticks(5); cc(51, 127); cc(51, 0); ticks(5);
});

step('"stopped" means the sequencer is not waiting either: count-in, merge count-in, an audio take', () => {
    for (const k of ['recordCountingIn', 'mergeCountingIn', 'countInDspPrev', 'auRec']) {
        openTemplateKeyboard('Old Name');
        const was = S[k];
        S[k] = k === 'auRec' ? { phase: 'armed' } : true;
        recDown(); ticks(1);
        assert(!LOG.some(l => /^start /.test(l)) && /STOP TO TALK/.test(screen()), k + ': ' + screen() + ' ' + J(LOG));
        assert(BTN[86].color === 0, k + ': Rec lit ' + J(BTN[86]));
        recUp(); S[k] = was;
    }
});

step('sanitizeTranscript: trimmed, single-spaced, no end punctuation, keyboard characters only', () => {
    const A = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890.-!@#$%^&*\'";:?/\\<>()[]{}=-+';
    const t = (s, n = 512) => dict.sanitizeTranscript(s, A, n);
    assert(t('  Hello,   world!  ') === 'Hello world', J(t('  Hello,   world!  ')));
    assert(t('café über') === 'caf ber', J(t('café über')));
    assert(t('What?!') === 'What', J(t('What?!')));
    assert(t('Mr. Blue') === 'Mr. Blue', J(t('Mr. Blue')));
    assert(t('abcdef', 3) === 'abc', J(t('abcdef', 3)));
    assert(t('…') === '', J(t('…')));
    const lyric = (x) => dict.sanitizeTranscript(x, A + ',', 512, true);
    assert(lyric('Breathe in, breathe out.') === 'Breathe in, breathe out.', J(lyric('Breathe in, breathe out.')));
    assert(lyric('Why?') === 'Why?', J(lyric('Why?')));
});

step('a NAME keyboard: a comma heard is kept (the keyboard has one now), a trailing full stop is not', () => {
    openTemplateKeyboard('Old Name');
    dictate({ ok: true, text: 'Late night, drive.' });
    assert(kb() === 'Late night, drive', 'buffer ' + J(kb()));
    te.closeTextEntry(); ticks(5);
});

step('a keyboard asking for more than 30 s gets 30; a take there runs past 10 s', () => {
    /* the keyboard itself (the module-page route is test_canvas_page_door.mjs) */
    ready();
    te.openTextEntry({ title: 'Lyrics', initialText: '', onConfirm() {}, dictation: { maxSeconds: 99, punctuation: true } });
    const key = (d1, d2) => te.handleTextEntryMidi(new Uint8Array([0xB0, d1, d2]));
    const step = (ms) => { NOW += ms; samplerWorker(); te.tickTextEntry(); };
    LOG.length = 0;
    key(86, 127); step(50);
    assert(LOG.some(l => / 30 >\/dev\/null/.test(l)), 'take length: ' + J(LOG));
    step(12000);
    assert(dstate().state === 'listening', 'cut at 10 s: ' + J(dstate()));
    step(19000);
    assert(LOG.indexOf('stop') >= 0, 'not capped at 30 s: ' + J(LOG));
    key(86, 0); for (let i = 0; i < 5; i++) step(20);
    assert(dstate().state === 'transcribing', 'rig: ' + J(dstate()));
    step(25000);          /* a name's take gives up at 20 s; 30 s of audio takes longer to decode */
    assert(dstate().state === 'transcribing', 'a long take gave up waiting for its words: ' + J(dstate()));
    key(51, 127); key(51, 0); for (let i = 0; i < 5; i++) step(20);
    te.closeTextEntry(); ticks(5);
});
}

main().then(() => {
    console.log(failed ? 'FAIL test_dictation_gesture' : 'PASS test_dictation_gesture');
    process.exit(failed);
}, (e) => { console.error(e); process.exit(1); });
