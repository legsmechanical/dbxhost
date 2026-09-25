import './_bulk_get_stub.mjs';
/* tests/js/test_automation_playhead.mjs — THE SELECTED LANE'S OWN PLAYHEAD.
 *
 * Josh, 2026-09-24: "we'd need to add a playhead - i dont' think there's one
 * there now". While a lane is selected, the step row's White is where THAT
 * lane is in its own cycle — not the clip's step — and the page bar's tick
 * follows it. The position comes from the DSP (tN_pa_view names the lane;
 * state_snapshot 57..64 reports it), so the view is sent once per selection
 * change and cleared with "-", and no read is added.
 *
 * ---- the rig's original header (test_automation_bank_gradient.mjs): ----
 * THE STEP ROW SHOWS WHAT THE LANE PLAYS.
 *
 * Josh, 2026-09-24: no notes on the step buttons in automation mode — instead
 * Legacy's intensity gradient: each step coloured by the value the selected
 * lane plays there (seven levels), a step holding a real point blinking OFF
 * briefly, DarkGrey outside the cycle. The values come from ONE read per page
 * (tN_cC_pa_vals_<base>_<tps>), never per tick.
 *
 * (Rig shared with test_automation_bank_cycle.mjs.)
 *
 * ---- original header of the rig: ----
 * THE GRID FOLLOWS THE SELECTED ROW.
 *
 * Josh, 2026-09-24: with a lane selected on the AUTOMATION bank, the step
 * buttons, Left/Right, the page bar ("mimic the style used in track overview")
 * and the header are THAT lane's cycle — a 4-bar lane under a 2-bar clip has
 * four pages; a 13-step lane leaves 14–16 dark — and no notes, which cannot be
 * edited there. Back → the clip's grid again, exactly as before.
 *
 * Performs the gestures on the real UI (jog click, jog turn, Right/Left, Back)
 * and asserts what is ON SCREEN (the header text, found pixel-exact; the page
 * bar's pixels) and ON THE STEP BUTTONS (the LED stream). */

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
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
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
const C_ = await import('/data/UserData/schwung/shared/constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const render = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true;
const T = 0, C = 0;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const right = () => { cc(63, 127); cc(63, 0); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const whites = () => { const w = []; for (let i = 0; i < 16; i++) if (leds[16 + i] === C_.White) w.push(i); return w; };

/* A playing snapshot: transport on, track 0's clip playing at clip step 3,
 * and — fields 57..64 — the viewed lane's own tick for track 0. */
let LANE_TICK = -1, PLAYING = 1;
SNAP = () => {
    const f = new Array(65).fill('0');
    f[0] = String(PLAYING); f[1] = '3';                     /* clip step 3 */
    for (let t = 0; t < 8; t++) { f[9 + t] = '0'; f[17 + t] = '-1'; }
    f[26] = '1';                                            /* t0 clip playing */
    f[56] = '255';
    for (let t = 0; t < 8; t++) f[57 + t] = t === 0 ? String(LANE_TICK) : '-1';
    return f.join(' ');
};

S.trackPadMode[T] = 0; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
S.clipLength[T][C] = 16; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
for (let i = 0; i < S.clipSteps[T][C].length; i++) S.clipSteps[T][C][i] = 0;
S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1;
LIST = '0 0 1 3 0:synth:cutoff 768 5 100\n';                /* its own 2-bar cycle */
STEPS = { t0_c0: '0:synth:cutoff 0\n' };
VALS = () => '0:synth:cutoff ' + '00'.repeat(16) + '\n';
auto.automationRefreshPresence();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;

step('selecting a lane sends ONE tN_pa_view naming it; no re-send while it stays selected', () => {
    sets.length = 0;
    click(); ticks(6);
    const v = sets.filter(s => s.startsWith('t0_pa_view='));
    assert(v.length === 1 && v[0] === 't0_pa_view=0 0:synth:cutoff', 'one view, got ' + JSON.stringify(v));
});

step('⭐ the White step is the LANE\'s position (step 10 of its cycle), not the clip\'s step 4', () => {
    LANE_TICK = 9 * 24 + 5;                                  /* lane step 10 */
    ticks(3);
    const w = whites();
    assert(w.length === 1 && w[0] === 9, 'white on button 10 only, got ' + JSON.stringify(w));
});

step('on page 2 of the cycle the playhead shows there, and not on page 1', () => {
    LANE_TICK = 21 * 24;                                      /* lane step 22 = page 2, button 6 */
    ticks(3);
    assert(whites().length === 0, 'viewing page 1: the playhead is on page 2, got ' + JSON.stringify(whites()));
    right(); ticks(3);
    const w = whites();
    assert(w.length === 1 && w[0] === 5, 'page 2, button 6, got ' + JSON.stringify(w));
});

step('the page bar\'s tick follows the lane, inverted on the viewed (solid) page', () => {
    globalThis.clear_screen(); render.drawUI();
    /* 2 pages → segW = floor((120-1)/2) = 59; the lane at step 22 of 32 maps across the 119-px span. */
    const segW = 59, winPxW = 2 * (segW + 1) - 1;
    const dotX = 4 + Math.floor(21 * winPxW / 32);
    for (let y = 50; y < 54; y++) assert(fb[y * 128 + dotX] === 0, 'the tick is dark on the solid page at y=' + y);
    assert(fb[50 * 128 + dotX - 1] === 1 && fb[50 * 128 + dotX + 1] === 1, 'the solid page around it');
});

step('stopped: no playhead', () => {
    PLAYING = 0; ticks(3);
    assert(whites().length === 0, 'no white while stopped, got ' + JSON.stringify(whites()));
    PLAYING = 1;
});

step('Back ends the selection: "-" is sent once', () => {
    sets.length = 0;
    back(); ticks(4);
    const v = sets.filter(s => s.startsWith('t0_pa_view='));
    assert(v.length === 1 && v[0] === 't0_pa_view=-', 'one clear, got ' + JSON.stringify(v));
});

if (failed) { console.error('FAIL: test_automation_playhead'); process.exit(1); }
console.log('PASS: test_automation_playhead');
}
main().catch(e => { console.error(e); process.exit(1); });
