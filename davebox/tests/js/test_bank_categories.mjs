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
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const px = (f, x, y) => f[y * W + x];
const ROW = kit.MV_BANKNAV_ROW_H, MID = (kit.MV_BANKNAV_ROWS - 1) >> 1, MID_Y = MID * ROW + 1;
/* The layout the column promises, derived from the same widths it measures. */
const lineX = 2 + Math.max(...['IN', 'CTRL', 'SEQ', 'FX'].map((t) => kit.mvWidth(t))) + 3;
const GUT = lineX + 4;
const onBank = (b) => { S.activeBank = b; S.trackActiveBank[2] = b; S.bankNavKind = 'track'; S.jogTouched = true; };
const inkLeftOfLine = (f, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < lineX - 1; x++) n += px(f, x, y); return n; };

const MEL = [5, C.BANK_MACROS, C.BANK_AUTOMATION, C.BANK_STEP, 0, 1, 2, 3, 4, C.BANK_SOUND];
step('⭐ the melodic walk is IN, CTRL, SEQ, FX, MIX; a Chord-layout track adds CHORD at the head of IN', () => {
    S.padLayoutChord = [false, false, false, false, false, false, false, false];
    assert(JSON.stringify(P.bankCycleForMode(0, 2)) === JSON.stringify(MEL), 'plain: ' + P.bankCycleForMode(0, 2));
    S.padLayoutChord[2] = true;
    assert(JSON.stringify(P.bankCycleForMode(0, 2)) === JSON.stringify([C.BANK_CHORD].concat(MEL)), 'chord: ' + P.bankCycleForMode(0, 2));
    S.padLayoutChord[2] = false;
    assert(C.BANK_DEFAULT === 0, 'CLIP stays the start and Back bank');
});
step('⭐⭐ THE GESTURE: from CLIP the jog walks left through SEQ, CTRL, IN and right through FX to SOUND + CONFIG, the column following', () => {
    S.activeBank = 0; S.trackActiveBank[2] = 0; S.bankSelectTick = -1;
    touchJog(); tick();
    const seen = [];
    for (let i = 0; i < 5; i++) { jog(-1); tick(); seen.push(S.activeBank); }
    assert(JSON.stringify(seen) === JSON.stringify([C.BANK_STEP, C.BANK_AUTOMATION, C.BANK_MACROS, 5, 5]), 'left: ' + seen);
    const nav = render.bankNavItems();
    assert(nav.items[nav.cur].name === 'LIVE ARP' && nav.items[nav.cur].cat && nav.items[nav.cur].cat.label === 'IN', 'centred ' + JSON.stringify(nav.items[nav.cur]));
    for (let i = 0; i < 4; i++) { jog(1); tick(); }
    assert(S.activeBank === 0, 'back on CLIP: ' + S.activeBank);
    const right = [];
    for (let i = 0; i < 5; i++) { jog(1); tick(); right.push(S.activeBank); }
    assert(JSON.stringify(right) === JSON.stringify([1, 2, 3, 4, C.BANK_SOUND]), 'right: ' + right);
    releaseJog(); tick();
    assert(!S.bankNavKind, 'the column outlived the release');
});
step('⭐ a row in a category is indented past the gutter, its highlight too; the category has a line and a label', () => {
    onBank(0);                                        /* CLIP: SEQ is STEP, CLIP */
    const f = frame();
    assert(!px(f, 1, MID_Y + 3), 'the highlight covers the category gutter');
    assert(px(f, GUT - 2, MID_Y + 3) && px(f, GUT - 1, MID_Y + 3), 'the highlight does not start at the row\'s indent');
    const top = (MID - 1) * ROW + 2, bot = MID * ROW + ROW - 2;
    for (let y = top; y < bot; y++) assert(px(f, lineX, y), 'no line at y ' + y);
    assert(!px(f, lineX, top - 1) && !px(f, lineX, bot), 'the line runs past its group');
    assert(inkLeftOfLine(f, top, bot) > 0, 'no SEQ label');
});
step('⭐ IN keeps its category with only LIVE ARP (it CAN hold two)', () => {
    S.padLayoutChord[2] = false;
    onBank(5);
    const nav = render.bankNavItems();
    assert(nav.items[nav.cur].cat && nav.items[nav.cur].cat.label === 'IN', 'LIVE ARP has no category');
    const f = frame();
    assert(px(f, lineX, MID_Y + 3), 'no line beside LIVE ARP');
    assert(inkLeftOfLine(f, MID_Y, MID_Y + ROW - 1) > 0, 'no IN label');
    assert(!px(f, 1, MID_Y + 3), 'LIVE ARP is drawn as a plain row');
});
step('⭐ the label is centred on the VISIBLE part of its group', () => {
    onBank(1);                                        /* NOTE FX in the middle: FX shows rows MID..MID+3 */
    const f = frame();
    const top = MID * ROW + 2, bot = (MID + 3) * ROW + ROW - 2;
    let y0 = 99, y1 = -1;
    for (let y = top; y < bot; y++) for (let x = 0; x < lineX - 1; x++) if (px(f, x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    assert(y1 >= 0, 'no FX label');
    const c = (y0 + y1) / 2, want = (top + bot) / 2;
    assert(Math.abs(c - want) <= 1, 'label centre ' + c + ', group centre ' + want);
    let x0 = 99, x1 = -1;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < lineX; x++) if (px(f, x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    assert(Math.abs((x0 + x1) / 2 - lineX / 2) <= 1.5, 'label not centred left of the line: ' + x0 + '..' + x1 + ' line ' + lineX);
});
step('⭐ a category of one (MIX: SOUND + CONFIG) is a plain row, fully left', () => {
    onBank(C.BANK_SOUND);
    const nav = render.bankNavItems();
    assert(nav.items[nav.cur].cat === null, 'SOUND + CONFIG has a category');
    const f = frame();
    assert(px(f, 1, MID_Y + 3), 'the plain row\'s highlight does not start at the left edge');
});
step('⚠ CONTROL: drum and Conductor tracks have no categories yet — plain rows as before', () => {
    S.trackPadMode[2] = C.PAD_MODE_DRUM; onBank(0);
    assert(render.bankNavItems().items.every((it) => it.cat === null), 'a drum row has a category');
    const f = frame();
    assert(px(f, 1, MID_Y + 3), 'the drum column is not plain');
    S.trackPadMode[2] = C.PAD_MODE_CONDUCT;
    assert(render.bankNavItems().items.every((it) => it.cat === null), 'a Conductor row has a category');
    S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE; S.bankNavKind = null; S.jogTouched = false;
});

if (failed) { console.log('FAIL: bank categories'); process.exit(1); }
console.log('PASS: the melodic walk runs in categories and the column draws them');
}
main().catch((e) => { console.error(e); process.exit(1); });
