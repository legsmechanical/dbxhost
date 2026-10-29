/* tests/js/test_battery_header.mjs — the battery in Project Settings' header
 * (Josh, 2026-10-29: "project setting header - right side. little battery icon
 * with a percentage next to it"; "when it's charging replace battery icon with
 * little plug icon").
 *
 * Through the real hook the host calls (globalThis.onPowerReport) and the real
 * draw: no report ever → nothing at the right; a report on battery → "89%" and
 * a battery outline; flag 0x20 → a plug instead; the last report is kept in a
 * file and shown at the next launch; the title keeps its full name. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const FILES = {};
const WRITES = [];
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (FILES[p] !== undefined ? FILES[p] : '');
globalThis.host_file_exists = (p) => FILES[p] !== undefined;
globalThis.host_write_file = (p, b) => { FILES[p] = String(b); WRITES.push(p); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_params = () => ''; globalThis.shadow_set_params = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.print = () => {}; globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.host_autosave_hold = () => {};
const W = 128, H = 64, fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.clear_screen = () => fb.fill(0);

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const menu = await import('../../ui/ui_menu.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
const dlg = await import('../../ui/ui_dialogs.mjs');
const { BATTERY_PATH } = await import('../../ui/ui_battery.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.currentSetUuid = 'batt-uuid';
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
menu.openGlobalMenu();

function draw() {
    const text = [];
    fonts.setKitTextTrace((t) => text.push(t));
    try { dlg.drawGlobalMenu(); } finally { fonts.setKitTextTrace(null); }
    return text;
}
/* Ink-0 pixels at the header band's right end: where the battery draws. */
const darkRight = () => { let n = 0; for (let y = 1; y < 6; y++) for (let x = 96; x < W; x++) if (!fb[y * W + x]) n++; return n; };
/* The icon's left column (x) and top row: a battery's outline is dark there,
 * a plug's top row starts three pixels in. */
const iconX = (pctText) => W - 2 - fonts.fontWidth4x5(pctText) - 3 - 10;

step('no report ever seen: nothing at the right of the header, the title in full', () => {
    const t = draw();
    assert(t.indexOf('PROJECT SETTINGS') >= 0, 'title: ' + JSON.stringify(t.slice(0, 3)));
    /* the header draws first; a battery would be the next text, before the rows */
    assert(t[0] === 'PROJECT SETTINGS' && t[1] === '120', 'something after the title: ' + JSON.stringify(t.slice(0, 3)));
    assert(darkRight() === 0, darkRight() + ' dark pixels at the right of the band');
});

step('a report on battery (flags 0x00, 0x59): "89%" and a battery, kept in the file', () => {
    globalThis.onPowerReport(0x00, 0x59);
    const t = draw();
    assert(t[1] === '89%', 'no 89% in the header: ' + JSON.stringify(t.slice(0, 3)));
    assert(t.indexOf('PROJECT SETTINGS') >= 0, 'the title lost its name: ' + JSON.stringify(t.slice(0, 3)));
    const x = iconX('89%');
    for (let i = 0; i < 9; i++) assert(!fb[1 * W + x + i], 'battery top edge open at +' + i);
    assert(!fb[3 * W + x + 9], 'no nub');
    assert(!fb[3 * W + x + 1] && !fb[3 * W + x + 6] && fb[3 * W + x + 7], 'fill is not ~6 of 7 (89%)');
    assert(FILES[BATTERY_PATH] === '89 0\n', 'file: ' + JSON.stringify(FILES[BATTERY_PATH]));
});

step('on the charger (flag 0x20): a plug replaces the battery', () => {
    globalThis.onPowerReport(0x21, 54);
    const t = draw();
    assert(t[1] === '54%', 'no 54% in the header: ' + JSON.stringify(t.slice(0, 3)));
    const x = iconX('54%');
    const row = (y) => Array.from({ length: 10 }, (_, i) => fb[(1 + y) * W + x + i] ? '.' : '#').join('');
    const got = [0, 1, 2, 3, 4].map(row);
    const want = ['....####..', '.########.', '....######', '.########.', '....####..'];
    assert(JSON.stringify(got) === JSON.stringify(want), 'plug:\n' + got.join('\n'));
});

step('the same report again writes nothing; a value past 100 is ignored', () => {
    const n = WRITES.length;
    globalThis.onPowerReport(0x21, 54);
    globalThis.onPowerReport(0x00, 200);
    assert(WRITES.length === n, 'wrote ' + (WRITES.length - n) + ' more');
    assert(draw()[1] === '54%', 'the level changed');
});

step('the next launch shows the last report before a new one arrives', () => {
    FILES[BATTERY_PATH] = '37 41\n';
    S.battery = null;
    const t = draw();
    assert(t[1] === '37%', 'no 37% from the file: ' + JSON.stringify(t.slice(0, 3)));
    const x = iconX('37%');
    assert(fb[1 * W + x + 1], 'flags 41 (0x29, on the charger) did not draw the plug');
});

process.exit(failed);
}
main();
