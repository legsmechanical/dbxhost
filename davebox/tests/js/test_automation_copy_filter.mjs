import './_bulk_get_stub.mjs';
/* tests/js/test_automation_copy_filter.mjs — A DRUM CLIP COPIED TO ANOTHER
 * TRACK TAKES THE AUTOMATION THAT MEANS THE SAME THING THERE.
 *
 * Josh, 2026-09-24: copying a clip should carry automation whose target is
 * constant across tracks (volume, pan, sends, dAVEBOx's own knobs) — not
 * carrying a module's automation "makes sense". A module parameter carries
 * only when the destination has the SAME module in the same place; the rest
 * is cleared after the copy lands, and a notice counts them. A module read
 * that fails keeps the lane (never delete what could not be checked).
 *
 * Performs Copy + clip pad in Session View on the real UI and asserts what is
 * SENT (the clear after the copy, in order) and what is SAID.
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
let MODS = {};                           /* "<slot> <comp>" -> module id; absent = the read fails */
globalThis.shadow_get_param = (slot, key) => {
    if (/:module$/.test(key)) { const k = slot + ' ' + key.slice(0, -7); return k in MODS ? MODS[k] : null; }
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
const { BANKS, BANK_AUTOMATION, PAD_MODE_DRUM, PAD_MODE_MELODIC_SCALE } = await import('../../ui/ui_constants.mjs');
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

const COPY = 60;
const clipPad = (row, t) => 92 - row * 8 + t;
function copyGesture(srcT, dstT) {
    cc(COPY, 127); ticks(1);
    note(clipPad(0, srcT), 127); note(clipPad(0, srcT), 0); ticks(1);
    note(clipPad(0, dstT), 127); note(clipPad(0, dstT), 0); ticks(1);
    cc(COPY, 0); ticks(3);
}
function setup() {
    for (const t of [0, 1, 2]) { S.trackPadMode[t] = PAD_MODE_DRUM; S.trackActiveClip[t] = 0; S.trackQueuedClip[t] = -1; }
    S.sessionView = true; S.sceneRow = 0; S.copySrc = null; S.copyHeld = false;
    /* Track 0, clip 0: a synth lane, an FX lane, a level, and a dAVEBOx knob. */
    LIST = '0 0 1 1 0:synth:cutoff 288 5 100 0 24\n0 0 1 1 0:fx1:mix 288 5 100 0 24\n' +
           '0 0 1 1 0:slot:pan 288 5 100 0 24\n0 0 1 1 seq:0:all_lanes_playback_dir 288 5 100 0 24\n';
    auto.automationRefreshPresence();
    sets.length = 0; S.actionPopupLines = [];
}

step('⭐ to a track with a DIFFERENT synth: the synth lane is cleared, the rest carry', () => {
    setup();
    /* Every read answers — the level's "module" differing too, so a filter
     * that wrongly treated a level as a module lane would drop pan. */
    MODS = { '0 synth': 'obxd', '1 synth': 'dx7', '0 fx1': 'reverb', '1 fx1': 'reverb',
             '0 slot': 'a', '1 slot': 'b' };
    copyGesture(0, 1);
    const ci = sets.findIndex(s => s === 'drum_clip_copy=0 0 1 0');
    assert(ci >= 0, 'the copy was sent, got ' + JSON.stringify(sets));
    const clears = sets.filter(s => s.startsWith('t1_pa_clear_key='));
    assert(JSON.stringify(clears) === JSON.stringify(['t1_pa_clear_key=0 1:synth:cutoff']),
           'only the synth lane is cleared (its module differs; the same reverb carries; levels and dAVEBOx knobs always do), got ' + JSON.stringify(clears));
    assert(sets.indexOf(clears[0]) > ci, 'the clear lands AFTER the copy');
    assert(S.actionPopupLines.join(' ') === 'AUTOMATION 1 LANE NOT CARRIED', 'the notice counts it, got ' + JSON.stringify(S.actionPopupLines));
});

step('the SAME synth on the destination: everything carries, no notice', () => {
    setup();
    MODS = { '0 synth': 'obxd', '2 synth': 'obxd', '0 fx1': 'reverb', '2 fx1': 'reverb' };
    copyGesture(0, 2);
    assert(sets.some(s => s === 'drum_clip_copy=0 0 2 0'), 'setup: copied');
    assert(!sets.some(s => s.indexOf('_pa_clear_key') >= 0), 'nothing cleared, got ' + JSON.stringify(sets));
    assert(!S.actionPopupLines.some(l => /NOT CARRIED/.test(l)), 'no notice');
});

step('a module read that FAILS keeps the lane', () => {
    setup();
    MODS = { '0 synth': 'obxd', '0 fx1': 'reverb', '1 fx1': 'reverb' };   /* track 1's synth: no answer */
    copyGesture(0, 1);
    assert(!sets.some(s => s.indexOf('_pa_clear_key') >= 0), 'nothing cleared on a failed read, got ' + JSON.stringify(sets));
});

step('CONTROL: an empty destination slot does not carry a module lane', () => {
    setup();
    MODS = { '0 synth': 'obxd', '1 synth': '', '0 fx1': 'reverb', '1 fx1': '' };
    copyGesture(0, 1);
    const clears = sets.filter(s => s.startsWith('t1_pa_clear_key='));
    assert(clears.length === 2, 'both module lanes cleared, got ' + JSON.stringify(clears));
    assert(S.actionPopupLines.join(' ') === 'AUTOMATION 2 LANES NOT CARRIED', 'counted, got ' + JSON.stringify(S.actionPopupLines));
});

function setupMelodic() {
    setup();
    for (const t of [0, 1, 2]) S.trackPadMode[t] = PAD_MODE_MELODIC_SCALE;
}

step('⭐ MELODIC copy to a track with a different synth: the synth lane is cleared, the rest carry', () => {
    setupMelodic();
    MODS = { '0 synth': 'obxd', '1 synth': 'dx7', '0 fx1': 'reverb', '1 fx1': 'reverb', '0 slot': 'a', '1 slot': 'b' };
    copyGesture(0, 1);
    const ci = sets.findIndex(s => s === 'clip_copy=0 0 1 0');
    assert(ci >= 0, 'the melodic copy was sent, got ' + JSON.stringify(sets));
    const clears = sets.filter(s => s.startsWith('t1_pa_clear_key='));
    assert(JSON.stringify(clears) === JSON.stringify(['t1_pa_clear_key=0 1:synth:cutoff']), 'only the synth lane, got ' + JSON.stringify(clears));
    assert(sets.indexOf(clears[0]) > ci, 'the clear lands AFTER the copy');
    assert(S.actionPopupLines.join(' ') === 'AUTOMATION 1 LANE NOT CARRIED', 'counted, got ' + JSON.stringify(S.actionPopupLines));
});

step('MELODIC cut (Shift) to a track with a different synth: filtered the same way', () => {
    setupMelodic();
    MODS = { '0 synth': 'obxd', '2 synth': 'dx7', '0 fx1': 'reverb', '2 fx1': 'reverb' };
    cc(49, 127); ticks(1);
    cc(COPY, 127); ticks(1);
    note(clipPad(0, 0), 127); note(clipPad(0, 0), 0); ticks(1);
    cc(49, 0); ticks(1);
    note(clipPad(0, 2), 127); note(clipPad(0, 2), 0); ticks(1);
    cc(COPY, 0); ticks(3);
    const ci = sets.findIndex(s => s === 'clip_cut=0 0 2 0');
    assert(ci >= 0, 'the cut was sent, got ' + JSON.stringify(sets));
    const clears = sets.filter(s => s.startsWith('t2_pa_clear_key='));
    assert(JSON.stringify(clears) === JSON.stringify(['t2_pa_clear_key=0 2:synth:cutoff']), 'only the synth lane, got ' + JSON.stringify(clears));
});

step('MELODIC copy within the SAME track: nothing is filtered', () => {
    setupMelodic();
    MODS = { '0 synth': 'obxd', '0 fx1': 'reverb' };
    cc(COPY, 127); ticks(1);
    note(clipPad(0, 0), 127); note(clipPad(0, 0), 0); ticks(1);
    note(clipPad(1, 0), 127); note(clipPad(1, 0), 0); ticks(1);
    cc(COPY, 0); ticks(3);
    assert(sets.some(s => s === 'clip_copy=0 0 0 1'), 'setup: copied within the track, got ' + JSON.stringify(sets));
    assert(!sets.some(s => s.indexOf('_pa_clear_key') >= 0), 'nothing cleared');
});

if (failed) { console.error('FAIL: test_automation_copy_filter'); process.exit(1); }
console.log('PASS: test_automation_copy_filter');
}
main().catch(e => { console.error(e); process.exit(1); });
