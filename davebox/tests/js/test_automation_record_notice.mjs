import './_bulk_get_stub.mjs';
/* tests/js/test_automation_record_notice.mjs — EVERY RECORDING START SAYS HOW
 * LONG THE LANE IS.
 *
 * Josh, 2026-09-24: a pop-up on every recording start showing only the record
 * symbol and the lane length — not the parameter, which you just turned. With
 * lanes at many lengths, the length is the thing that is hard to remember.
 *
 * Performs it on the real UI: the DELAY bank, a knob turned with Record armed
 * and the transport playing → "● LANE: 1 BAR" is DRAWN (the card's print, not
 * just the state). Stopped, or not armed → nothing. One notice per gesture;
 * the next gesture on the SAME lane says it again. A lane with its own loop
 * says its own length; a parameter with no lane yet says the clip's.
 *
 * (Rig from test_automation_hold_jump.mjs.) */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let fb = new Uint8Array(128 * 64);
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
let LIST = '';
let STEPS = {};
let SNAP = () => '';
const valReads = [];
let VALS = () => '';
const leds = {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    if (k === 'state_snapshot') return SNAP();
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) return STEPS[m[1]] || '';
    const v = /^t\d+_c\d+_pa_vals_(\d+)_(\d+)$/.exec(k);
    if (v) { valReads.push(v[1] + '_' + v[2]); return VALS(parseInt(v[1], 10)); }
    return '';
};
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 },
        { key: 'drive', name: 'Drive', type: 'float', min: 0, max: 1 },
        { key: 'reso', name: 'Reso', type: 'float', min: 0, max: 1 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
const printed = [];
globalThis.print = (x, y, t, c) => { printed.push(String(t)); for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = (x, y, c) => px(x, y, c);
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_AUTOMATION } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const render = await import('../../ui/ui_render.mjs');
const { fontPrint4x5 } = await import('../../ui/ui_fonts_pp.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true;
const T = 0, C = 0, DELAY = 3;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const STEP = (i) => 16 + i;
function drawnHdr(text) {
    const save = fb; fb = new Uint8Array(128 * 64);
    fontPrint4x5(0, 0, text, 1);
    const ink = []; for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (fb[y * 128 + x]) ink.push([x, y]);
    fb = save;
    const w = Math.max(...ink.map(p => p[0])) + 1, h = Math.max(...ink.map(p => p[1])) + 1;
    const on = new Set(ink.map(([x, y]) => y * 128 + x));
    for (const pol of [1, 0]) for (let oy = 0; oy + h <= 64; oy++) for (let ox = 0; ox + w <= 128; ox++) {
        let m = true;
        for (let y = 0; y < h && m; y++) for (let x = 0; x < w; x++) if ((fb[(oy + y) * 128 + ox + x] === pol) !== on.has(y * 128 + x)) { m = false; break; }
        if (m) return true;
    }
    return false;
}

S.trackPadMode[T] = 0; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
S.clipLength[T][C] = 16; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1;
LIST = '0 0 1 1 seq:0:delay_level 0 5 100\n';
auto.automationRefreshPresence();
S.activeBank = DELAY; S.trackActiveBank[T] = DELAY; S.bankCardLatched = true; S.altMode = false;

const DOT = '\u25CF';
/* A knob touch as the Move sends it: note-on 127, and note-on 0 to let go
 * (not a note-off — the handler reads the release off a note-on). */
const touch = (k, on) => globalThis.onMidiMessageInternal(new Uint8Array([0x90, k, on ? 127 : 0]));
/* One gesture on the Level knob (knob 2: touch 1, CC 72): touch, three
 * detents, let go — the release ends the gesture. */
function gesture() {
    touch(1, true); ticks(1);
    cc(72, 1); ticks(1); cc(72, 1); ticks(1); cc(72, 1); ticks(1);
    touch(1, false); ticks(2);
}
function notice() { return S.actionPopupLines.filter(l => String(l).indexOf('LANE') >= 0); }
function drawn(text) { printed.length = 0; globalThis.clear_screen(); render.drawUI(); return printed.indexOf(text) >= 0; }
function arm(playing, armed) { S.playing = playing; S.recordArmed = armed; S.actionPopupLines = []; S.actionPopupEndTick = -1; }

step('stopped, Record armed: a turn is a plain turn — no notice', () => {
    arm(false, true); gesture();
    assert(notice().length === 0, 'no notice, got ' + JSON.stringify(S.actionPopupLines));
});

step('playing, Record NOT armed: an override, not a recording — no notice', () => {
    arm(true, false); gesture();
    assert(S.playing, 'setup: still playing');
    assert(notice().length === 0, 'no notice, got ' + JSON.stringify(S.actionPopupLines));
});

step('⭐ playing + armed: "● LANE: 1 BAR" is drawn on screen', () => {
    arm(true, true); gesture();
    assert(S.playing && S.recordArmed, 'setup: still playing and armed');
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify([DOT + ' LANE: 1 BAR']),
           'the one line, got ' + JSON.stringify(S.actionPopupLines));
    assert(drawn(DOT + ' LANE: 1 BAR'), 'the card printed it, printed ' + JSON.stringify(printed));
});

step('one notice per gesture: more detents in the SAME gesture do not re-open it', () => {
    arm(true, true);
    touch(1, true); ticks(1); cc(72, 1); ticks(1);
    assert(notice().length === 1, 'the gesture opened it');
    S.actionPopupLines = [];
    cc(72, 1); ticks(1); cc(72, 1); ticks(1);
    assert(notice().length === 0, 'no second notice mid-gesture, got ' + JSON.stringify(S.actionPopupLines));
    touch(1, false); ticks(2);
});

step('⭐ the NEXT gesture on the same lane says it again', () => {
    arm(true, true); gesture();
    assert(notice().length === 1 && notice()[0] === DOT + ' LANE: 1 BAR', 'again, got ' + JSON.stringify(S.actionPopupLines));
});

step('a lane with its own 13-step loop says "13 ST"', () => {
    LIST = '0 0 1 1 seq:0:delay_level 312 5 100\n';
    auto.automationRefreshPresence();
    arm(true, true); gesture();
    assert(notice()[0] === DOT + ' LANE: 13 ST', 'its own length, got ' + JSON.stringify(S.actionPopupLines));
});

step('no lane yet: the clip\'s length (a 2-bar clip → "2 BAR")', () => {
    LIST = '';
    auto.automationRefreshPresence();
    S.clipLength[T][C] = 32;
    arm(true, true); gesture();
    assert(notice()[0] === DOT + ' LANE: 2 BAR', 'the clip, got ' + JSON.stringify(S.actionPopupLines));
});

if (failed) { console.error('FAIL: test_automation_record_notice'); process.exit(1); }
console.log('PASS: test_automation_record_notice');
}
main().catch(e => { console.error(e); process.exit(1); });
