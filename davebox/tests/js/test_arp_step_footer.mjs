/* tests/js/test_arp_step_footer.mjs — the arp step editor announces its Shift
 * page in the FOOTER (Josh, 2026-09-26: "instead of having the shift indicator
 * on the header, we need to add a footer pill hint and adjust the rest of the
 * screen accordingly").
 *
 * Draws the real SEQ ARP step-pitch screen: the footer carries SHFT VELOCITY and
 * BACK OUT, nothing is printed in the header gap any more, and the step numbers
 * and bars end above the footer. Holding Shift flips to the velocity page.
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
const render = await import('../../ui/ui_render.mjs');
const kit = await import('../../ui/ui_movy.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const hints = () => JSON.stringify(kit.kitHintsForTest());

step('⭐ the pitch page: SHFT VELOCITY and BACK OUT in the footer', () => {
    S.activeBank = 4; S.trackActiveBank[2] = 4; S.stepIntervalMode = true; S.shiftHeld = false; S.knobTouched = -1;
    frame();
    const h = kit.kitHintsForTest() || [];
    assert(h.some((x) => x[0] === 'SHFT' && x[1] === 'VELOCITY'), 'no SHFT VELOCITY pill: ' + hints());
    assert(h.some((x) => x[0] === 'BACK'), 'no BACK pill: ' + hints());
    assert(swallowed === null, 'swallowed: ' + swallowed);
});
step('the step numbers and bars end above the footer', () => {
    const plain = frame();
    /* Rows between the numbers and the footer band stay clear. */
    let ink = 0; for (let y = kit.MV_FOOTER_Y - 2; y < kit.MV_FOOTER_Y; y++) for (let x = 0; x < 128; x++) ink += plain[y * 128 + x];
    assert(ink === 0, 'something runs into the footer: ' + ink + ' px in the rows above it');
    /* Step 5's number (column 5, x ~66..78) sits ABOVE the footer: drawn in the
     * number row, and that stretch of the footer (between the SHFT and BACK
     * pills) is empty. */
    let above = 0, inFooter = 0;
    for (let x = 66; x < 79; x++) {
        for (let y = kit.MV_FOOTER_Y - 12; y < kit.MV_FOOTER_Y - 2; y++) above += plain[y * 128 + x];
        for (let y = kit.MV_FOOTER_Y; y < 64; y++) inFooter += plain[y * 128 + x];
    }
    assert(above > 0, 'step 5 has no number above the footer');
    assert(inFooter === 0, 'something is drawn in the footer between the pills: ' + inFooter + ' px');
});
step('Shift held: the velocity page, no SHFT pill', () => {
    S.shiftHeld = true;
    frame();
    const h = kit.kitHintsForTest() || [];
    assert(!h.some((x) => x[0] === 'SHFT'), 'the SHFT pill stayed on the velocity page: ' + hints());
    S.shiftHeld = false; S.stepIntervalMode = false;
});

if (failed) { console.log('FAIL: arp step footer'); process.exit(1); }
console.log('PASS: the arp step editor names Shift in its footer');
}
main().catch((e) => { console.error(e); process.exit(1); });
