import './_bulk_get_stub.mjs';
/* tests/js/test_automation_bank_cycle.mjs — THE GRID FOLLOWS THE SELECTED ROW.
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
const leds = {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) return STEPS[m[1]] || '';
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
const { BANKS, BANK_AUTOMATION, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const { White, DarkGrey } = await import('/data/UserData/schwung/shared/constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const render = await import('../../ui/ui_render.mjs');
const movy = await import('../../ui/ui_movy.mjs');
const { fontPrint4x5 } = await import('../../ui/ui_fonts_pp.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true; S.playing = false;
const T = 0, C = 0;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const right = () => { cc(63, 127); cc(63, 0); };
const left  = () => { cc(62, 127); cc(62, 0); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };

function inkOf(text, hdr) {
    const save = fb; fb = new Uint8Array(128 * 64);
    /* the bank header's right label is the small 4x5 face (drawKitBankHeader) */
    (hdr ? fontPrint4x5 : movy.mvPrint)(0, 0, String(text).toUpperCase(), 1);
    const pts = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (fb[y * 128 + x]) pts.push([x, y]);
    fb = save;
    return pts;
}
/* `text` drawn anywhere, EXACTLY (lit AND dark pixels of its box) — in the
 * header's inverse band the text is dark on light, so try both polarities. */
function drawn(text, hdr) {
    const ink = inkOf(text, hdr);
    if (!ink.length) throw new Error('the font drew nothing for ' + text);
    const w = Math.max(...ink.map(p => p[0])) + 1, h = Math.max(...ink.map(p => p[1])) + 1;
    const on = new Set(ink.map(([x, y]) => y * 128 + x));
    for (const pol of [1, 0]) for (let oy = 0; oy + h <= 64; oy++) for (let ox = 0; ox + w <= 128; ox++) {
        let match = true;
        for (let y = 0; y < h && match; y++) for (let x = 0; x < w; x++) {
            const lit = fb[(oy + y) * 128 + ox + x] === pol;
            if (lit !== on.has(y * 128 + x)) { match = false; break; }
        }
        if (match) return true;
    }
    return false;
}
const drawScreen = () => { globalThis.clear_screen(); render.drawUI(); };
/* The colours each step button showed over ~1.2 s (both blink phases). */
function watchLeds() {
    const seen = Array.from({ length: 16 }, () => new Set());
    for (let n = 0; n < 120; n++) { ticks(1); for (let i = 0; i < 16; i++) seen[i].add(leds[16 + i]); }
    return seen;
}

/* A melodic clip, 32 steps (2 pages), with a note on every step of page 1 —
 * so a step row that still showed NOTES would be unmistakable. */
S.trackPadMode[T] = 0; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
S.clipLength[T][C] = 32; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
for (let i = 0; i < S.clipSteps[T][C].length; i++) S.clipSteps[T][C][i] = i < 16 ? 1 : 0;
S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1;
/* Cutoff: 4 bars (64 steps). Drive: 13 steps. Reso: follows the clip. */
LIST = '0 0 1 3 0:synth:cutoff 1536 5 100\n0 0 1 2 0:synth:drive 312 5 100\n0 0 1 1 0:synth:reso 0 5 100\n';
const mask = new Array(64).fill('0'); mask[20] = '1'; mask[50] = '1';
STEPS = { t0_c0: '0:synth:cutoff ' + mask.join('') + '\n0:synth:drive 0\n0:synth:reso 0\n' };
auto.automationRefreshPresence();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;

step('CONTROL: the resting card has no selected row — the clip\'s grid, notes and all', () => {
    ticks(2);
    assert(S.autoCycle === null, 'no cycle without a selected row');
    const seen = watchLeds();
    assert([...seen[3]].some(c => c !== 0 && c !== DarkGrey && c !== White), 'the clip\'s notes still show on the resting card');
});

step('⭐ cursor on a 4-bar lane: header "4 BAR PG 1/4", the overview\'s page bar, no notes on the buttons', () => {
    click();                                         /* card → menu, cursor on row 0 (Syn>Cutoff) */
    ticks(2);
    assert(S.autoCycle && S.autoCycle.pages === 4 && S.autoCycle.page === 0, 'cycle: ' + JSON.stringify(S.autoCycle));
    drawScreen();
    assert(drawn('4 BAR PG 1/4', true), 'the header does not read "4 BAR PG 1/4"');
    /* The page bar: four segments across 120 px from x=4 — the viewed one solid. */
    const segW = Math.floor((120 - 3) / 4);
    for (let y = 50; y < 54; y++) assert(fb[y * 128 + 4] === 1 && fb[y * 128 + 4 + segW - 1] === 1, 'page 1 segment solid at y=' + y);
    assert(fb[50 * 128 + 4 + segW + 1 + 2] === 0 && fb[53 * 128 + 4 + segW + 1 + 2] === 1, 'page 2 segment is an underline');
    const seen = watchLeds();
    for (let i = 0; i < 16; i++)
        assert([...seen[i]].every(c => c === 0), 'step ' + (i + 1) + ' should be dark on page 1 (no notes, no point): ' + [...seen[i]]);
});

step('Right pages the LANE (clamped at its end); the clip\'s own page is untouched', () => {
    right(); ticks(1);
    assert(S.autoCycle.page === 1, 'page 2');
    drawScreen();
    assert(drawn('4 BAR PG 2/4', true), 'header PG 2/4');
    const seen = watchLeds();
    assert(seen[4].has(White) && seen[4].has(0), 'the point at step 21 (page 2, button 5) blinks: ' + [...seen[4]]);
    right(); right(); right(); ticks(1);
    assert(S.autoCycle.page === 3, 'clamped at page 4, got ' + S.autoCycle.page);
    assert(S.trackCurrentPage[T] === 0, 'the clip\'s page must not move, got ' + S.trackCurrentPage[T]);
    const seen4 = watchLeds();
    assert(seen4[2].has(White), 'the point at step 51 (page 4, button 3) blinks');
    left(); ticks(1);
    assert(S.autoCycle.page === 2, 'Left steps back');
});

step('a 13-step lane: one page, steps 14–16 DarkGrey, no PG in the header, arrows are no-ops', () => {
    jog(1); ticks(2);                                /* → Syn>Drive */
    assert(S.autoCycle && S.autoCycle.len === 13 && S.autoCycle.pages === 1, 'drive: ' + JSON.stringify(S.autoCycle));
    drawScreen();
    assert(drawn('13 ST', true), 'header "13 ST"');
    assert(!drawn('13 ST PG 1/1', true), 'a one-page cycle shows no PG');
    const seen = watchLeds();
    for (const i of [13, 14, 15]) assert(seen[i].size === 1 && seen[i].has(DarkGrey), 'step ' + (i + 1) + ' DarkGrey: ' + [...seen[i]]);
    assert(seen[12].has(0) && !seen[12].has(DarkGrey), 'step 13 is inside the cycle');
    right(); ticks(1);
    assert(S.autoCycle.page === 0 && S.trackCurrentPage[T] === 0, 'Right is a no-op on a one-page cycle and does not page the clip');
});

step('a lane that follows the clip reads "CLIP" and pages the clip\'s window', () => {
    jog(1); ticks(2);                                /* → Syn>Reso */
    assert(S.autoCycle && S.autoCycle.text === 'CLIP' && S.autoCycle.pages === 2, 'reso: ' + JSON.stringify(S.autoCycle));
    drawScreen();
    assert(drawn('CLIP PG 1/2', true), 'header "CLIP PG 1/2"');
});

step('selecting a different lane starts it at its first page', () => {
    jog(-2); ticks(2);
    assert(S.autoCycle.target === '0:synth:cutoff', 'back on cutoff');
    assert(S.autoCycle.page === 0, 'a different lane was selected in between, so it starts at page 1 again');
});

step('Back → no row: the clip\'s grid, header and arrows exactly as before', () => {
    back(); ticks(2);
    assert(S.autoCycle === null, 'no cycle after Back');
    drawScreen();
    assert(!drawn('4 BAR PG 1/4', true) && !drawn('CLIP', true), 'the header is the track\'s again');
    const seen = watchLeds();
    assert([...seen[3]].some(c => c !== 0 && c !== DarkGrey && c !== White), 'notes are back on the step row');
    right(); ticks(1);
    assert(S.trackCurrentPage[T] === 1, 'Right pages the clip again, got ' + S.trackCurrentPage[T]);
    S.trackCurrentPage[T] = 0;
});

step('a drum lane that follows the clip uses the selected pad\'s window', () => {
    S.trackPadMode[T] = PAD_MODE_DRUM; S.drumLaneLength[T] = 24; S.drumLaneTPS[T] = 24; S.drumLaneLoopStart[T] = 0;
    click(); jog(2); ticks(2);                       /* menu, → Syn>Reso */
    assert(S.autoCycle && S.autoCycle.len === 24 && S.autoCycle.pages === 2, 'drum follow: ' + JSON.stringify(S.autoCycle));
    const seen = watchLeds();
    right(); ticks(1);
    const seen2 = watchLeds();
    for (const i of [8, 9, 15]) assert(seen2[i].has(DarkGrey), 'drum page 2: step ' + (i + 1) + ' past the 24-step window is DarkGrey');
    back(); S.trackPadMode[T] = 0;
});

if (failed) { console.error('FAIL: test_automation_bank_cycle'); process.exit(1); }
console.log('PASS: test_automation_bank_cycle');
}
main().catch(e => { console.error(e); process.exit(1); });
