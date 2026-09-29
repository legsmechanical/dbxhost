import './_bulk_get_stub.mjs';
/* tests/js/test_seq_follow_gesture.mjs — Seq Follow is ONE device-wide switch
 * (Josh, 2026-09-29): hold Left or Right and press Play to toggle it; an arrow
 * press while the transport runs PAUSES it until the next real stop (a restart
 * is not a stop); the arrow still pages on PRESS; the overview shows a glyph.
 *
 * Performed through the real gestures (CC 62/63 arrows, CC 85 Play) and the
 * real poll (pollDSP reading a stubbed state_snapshot), so the page moving —
 * or not — is the engine-facing path, not a helper called directly. */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const files = Object.create(null);
const sets = [];
const T = 4;
const dsp = { playing: '0', step: 0 };
let px = [];
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => files[p] ?? '';
globalThis.host_file_exists = (p) => p in files;
globalThis.host_write_file = (p, body) => { files[p] = String(body); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (k === 'state_snapshot') {
        const a = new Array(64).fill('0');
        a[0] = dsp.playing;
        a[1 + T] = String(dsp.step);      /* the playing step */
        a[9 + T] = '0';                   /* clip A */
        a[26 + T] = dsp.playing;          /* the clip plays while the transport does */
        return a.join(' ');
    }
    if (/^t\d+_(c\d+|l\d+)_(steps|length|tps|loop_start)$/.test(k)) return null;
    return '';
};
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.shadow_get_ui_flags = () => 0; globalThis.shadow_get_shift_held = () => 0;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => { px = []; }; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = (x, y, v) => { if (v) px.push(x + ',' + y); };
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const render = await import('../../ui/ui_render.mjs');
const prefs = await import('../../ui/ui_prefs.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clipLength[T][0] = 64; S.clipLoopStart[T][0] = 0; S.trackActiveClip[T] = 0;
S.lastDspActiveClip[T] = 0;

const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const cc = (d1, d2) => midi(0xB0, d1, d2);
const LEFT = 62, RIGHT = 63, PLAY = 85;
const poll = () => { S.clockMs += 11; bridge.pollDSP(); };
const transportSends = () => sets.filter((x) => /^transport=/.test(x));
const lines = () => (S.actionPopupLines || []).join(' / ');
const run = (on) => { dsp.playing = on ? '1' : '0'; poll(); };
const glyphPx = () => {
    px = [];
    render.drawFollowGlyph(50, 18);
    return px.length;
};

step('setup: the switch defaults ON with no file, and the old per-clip store is gone', () => {
    assert(!(prefs.SEQ_FOLLOW_PATH in files), 'setup: a file already exists');
    assert(prefs.seqFollowOn() === true, 'absent file did not read as ON');
    assert(S.clipSeqFollow === undefined, 'S.clipSeqFollow still exists');
});

step('CONTROL: a plain Play still starts the transport', () => {
    sets.length = 0;
    cc(PLAY, 127); cc(PLAY, 0);
    assert(transportSends().length === 1, 'plain Play sent ' + JSON.stringify(transportSends()));
    run(true);
    cc(PLAY, 127); cc(PLAY, 0); run(false);
});

step('⭐⭐ THE GESTURE: hold Left + Play turns follow OFF, saves it, and leaves the transport alone', () => {
    sets.length = 0;
    cc(LEFT, 127);
    cc(PLAY, 127); cc(PLAY, 0);
    cc(LEFT, 0);
    assert(prefs.seqFollowOn() === false, 'follow is still on');
    assert(files[prefs.SEQ_FOLLOW_PATH] === '0\n', 'not persisted: ' + JSON.stringify(files[prefs.SEQ_FOLLOW_PATH]));
    assert(transportSends().length === 0, 'the transport was touched: ' + JSON.stringify(transportSends()));
    assert(lines() === 'FOLLOW / OFF', 'popup ' + lines());
});

step('⭐ hold Right + Play turns it back ON', () => {
    sets.length = 0;
    cc(RIGHT, 127); cc(PLAY, 127); cc(PLAY, 0); cc(RIGHT, 0);
    assert(prefs.seqFollowOn() === true && files[prefs.SEQ_FOLLOW_PATH] === '1\n', 'not back on');
    assert(transportSends().length === 0, 'the transport was touched');
    assert(lines() === 'FOLLOW / ON', 'popup ' + lines());
});

step('the arrow released, Play is Play again (no stuck held flag)', () => {
    sets.length = 0;
    cc(PLAY, 127); cc(PLAY, 0);
    assert(transportSends().length === 1, 'Play after the release sent ' + JSON.stringify(transportSends()));
    run(true); cc(PLAY, 127); cc(PLAY, 0); run(false);
});

step('⭐ a release SWALLOWED by a modal screen still lands (no stuck arrow)', () => {
    /* The project picker swallows every other button, arrows included — as the
     * phrase browser and sound mode's editors do. The held flag is taken above
     * those gates, so a release inside one still clears it. */
    cc(RIGHT, 127);
    S.projectPadPicker = { renameActive: false };
    cc(RIGHT, 0);
    S.projectPadPicker = null;
    sets.length = 0;
    cc(PLAY, 127); cc(PLAY, 0);
    assert(prefs.seqFollowOn() === true, 'a stuck arrow turned Play into a follow toggle');
    assert(transportSends().length === 1, 'Play sent ' + JSON.stringify(transportSends()));
    run(true); cc(PLAY, 127); cc(PLAY, 0); run(false);
});

step('session view: an arrow held + Play is a plain Play', () => {
    S.sessionView = true; sets.length = 0;
    cc(LEFT, 127); cc(PLAY, 127); cc(PLAY, 0); cc(LEFT, 0);
    S.sessionView = false;
    assert(prefs.seqFollowOn() === true, 'toggled from session view');
    assert(transportSends().length === 1, 'sent ' + JSON.stringify(transportSends()));
    run(true); cc(PLAY, 127); cc(PLAY, 0); run(false);
});

step('⭐ follow ON and playing: the poll moves the page to the playhead', () => {
    S.trackCurrentPage[T] = 0; dsp.step = 40;
    run(true);
    assert(S.trackCurrentPage[T] === 2, 'page ' + S.trackCurrentPage[T]);
});

step('⭐ the arrow still pages on PRESS, and pauses follow while playing', () => {
    cc(LEFT, 127);
    assert(S.trackCurrentPage[T] === 1, 'no page step on press: ' + S.trackCurrentPage[T]);
    cc(LEFT, 0);
    assert(S.followPaused === true, 'not paused');
    assert(prefs.seqFollowOn() === true, 'the switch itself changed');
    dsp.step = 50; poll();
    assert(S.trackCurrentPage[T] === 1, 'the paused poll moved the page to ' + S.trackCurrentPage[T]);
});

step('the paused glyph BLINKS on the eighth flash; ON is steady; OFF draws nothing', () => {
    S.flashEighth = true;  const a = glyphPx();
    S.flashEighth = false; const b = glyphPx();
    assert(a > 0 && b === 0, 'paused glyph did not blink: ' + a + '/' + b);
    S.followPaused = false;
    assert(glyphPx() > 0, 'ON drew nothing on the off phase');
    S.flashEighth = true;
    S.followPaused = true;
    prefs.setSeqFollowOn(false);
    assert(glyphPx() === 0, 'OFF still drew the glyph');
    prefs.setSeqFollowOn(true);
});

step('⭐ the glyph is on the real track overview', () => {
    S.followPaused = false; S.activeBank = -1;
    globalThis.clear_screen(); render.drawUI();
    const on = px.length;
    prefs.setSeqFollowOn(false);
    globalThis.clear_screen(); render.drawUI();
    const off = px.length;
    prefs.setSeqFollowOn(true);
    assert(on - off === 14, 'the overview drew ' + (on - off) + ' follow pixels, not the 14-pixel glyph');
    S.followPaused = true;
});

step('a RESTART (still playing, no stop edge) keeps the pause', () => {
    for (let i = 0; i < 3; i++) poll();
    assert(S.followPaused === true, 'a poll with no stop cleared the pause');
});

step('⭐ a real STOP ends the pause', () => {
    run(false);
    assert(S.followPaused === false, 'the stop edge did not clear the pause');
});

step('an arrow while STOPPED pages but does not pause', () => {
    cc(RIGHT, 127); cc(RIGHT, 0);
    assert(S.followPaused === false, 'paused while stopped');
});

process.exit(failed);
}
main().catch((e) => { bad('main', e); process.exit(1); });
