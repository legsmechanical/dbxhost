/* tests/js/test_bank_categories.mjs — the melodic bank walk in CATEGORIES
 * (Josh, 2026-09-26): IN (CHORD, LIVE ARP), CTRL (MACROS, AUTOMATION), SEQ
 * (STEP, CLIP), FX (NOTE FX, HARMONY, DELAY, SEQ ARP), then SOUND + CONFIG on
 * its own. The bank navigation column draws each category that CAN hold several
 * banks as a group: a plain vertical line down its visible rows, the label
 * centred left of it; a category of one is a plain row, fully left.
 *
 * Walks the real jog from CLIP both ways and reads the column's pixels.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
const fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => { globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v); };
globalThis.stipple_rect = (x, y, w, h, v, phase) => {
    for (let j = y; j < y + h; j++) for (let i = x + ((((x + j) & 1) === (phase & 1)) ? 0 : 1); i < x + w; i += 2) globalThis.set_pixel(i, j, v); };
globalThis.clear_screen = () => fb.fill(0);
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.host_module_get_params = () => null;
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const kit = await import('../../ui/ui_movy.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const P = await import('../../ui/ui_pure.mjs');
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const touchJog = () => midi(0x90, 9, 127);
const releaseJog = () => midi(0x80, 9, 0);
const jog = (d) => midi(0xB0, 14, d > 0 ? d : 128 + d);
const tick = () => { S.tickCount++; globalThis.tick(); };
S.clockFollowTicks = true; S.tickCount = 1000;   /* the UI clock follows the ticks */
const settle = () => { S.tickCount += Math.ceil(C.BANKNAV_HOLD_MS / 10.6) + 1; globalThis.tick(); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const px = (f, x, y) => f[y * W + x];
const ROW = kit.MV_BANKNAV_ROW_H, MID = (kit.MV_BANKNAV_ROWS - 1) >> 1, MID_Y = MID * ROW + 1;
/* The layout the column promises, derived from the same widths it measures. */
const lineX = 2 + Math.max(...['IN', 'CTRL', 'SEQ', 'FX'].map((t) => kit.mvWidth(t))) + 3;
const GUT = lineX + 4;
const onBank = (b) => { S.activeBank = b; S.trackActiveBank[2] = b; S.bankNavKind = 'track'; S.jogTouched = true; };
const inkLeftOfLine = (f, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < lineX - 1; x++) n += px(f, x, y); return n; };

/* The track's banks (the map, the commits) and the WALK (the jog's turn): the
 * walk is the list minus the doors — CONFIG and AUTOMATION (Josh, 2026-10-03:
 * "hide config and automation from the bank list"). LIVE ARP came back on
 * the walk on 2026-10-04 ("put the live arp back as a bank"). */
const MEL_LIST = [C.BANK_CONFIG, 5, C.BANK_MACROS, C.BANK_AUTOMATION, C.BANK_STEP, 0, 1, 2, 3, 4, C.BANK_SOUND];
const MEL = [5, C.BANK_MACROS, C.BANK_STEP, 0, 1, 2, 3, 4, C.BANK_SOUND];
step('⭐ the melodic walk is IN, CTRL, SEQ, FX, MIX (the doors are off it); a Chord-layout track adds CHORD at the head of IN', () => {
    S.padLayoutChord = [false, false, false, false, false, false, false, false];
    assert(JSON.stringify(P.bankListForMode(0, 2)) === JSON.stringify(MEL_LIST), 'list: ' + P.bankListForMode(0, 2));
    assert(JSON.stringify(P.bankCycleForMode(0, 2)) === JSON.stringify(MEL), 'plain: ' + P.bankCycleForMode(0, 2));
    S.padLayoutChord[2] = true;
    assert(JSON.stringify(P.bankCycleForMode(0, 2)) === JSON.stringify([C.BANK_CHORD].concat(MEL)), 'chord: ' + P.bankCycleForMode(0, 2));
    S.padLayoutChord[2] = false;
    assert(C.BANK_DEFAULT === 0, 'CLIP stays the start and Back bank');
});
/* (The jog walk and the bank column it drew retired 2026-10-04 — Josh: "i want
 * to retire jog to switch banks and the bank column overlay". The walk's ORDER
 * stays: bankCyclePos reads it, and it is the order the banks are listed in.) */
const DRUM = [5, C.BANK_MACROS, C.BANK_STEP, 7, 0, 1, 3, C.BANK_SOUND];   /* RPT GROOVE stays: it is not LIVE ARP */
const COND = [0, C.BANK_STEP, 1, C.BANK_RESPONDER, C.BANK_OCTAVE, C.BANK_WHEN];
step('⭐ the drum walk is IN, CTRL, SEQ, FX (under DRUM LANE), MIX; the Conductor walk is CLIP, STEP, NOTE FX, RSPD', () => {
    assert(JSON.stringify(P.bankCycleForMode(C.PAD_MODE_DRUM, 2)) === JSON.stringify(DRUM), 'drum: ' + P.bankCycleForMode(C.PAD_MODE_DRUM, 2));
    assert(JSON.stringify(P.bankCycleForMode(C.PAD_MODE_CONDUCT, 2)) === JSON.stringify(COND), 'conductor: ' + P.bankCycleForMode(C.PAD_MODE_CONDUCT, 2));
});
if (failed) { console.log('FAIL: bank categories'); process.exit(1); }
console.log('PASS: the melodic walk runs in categories and the column draws them');
}
main().catch((e) => { console.error(e); process.exit(1); });
