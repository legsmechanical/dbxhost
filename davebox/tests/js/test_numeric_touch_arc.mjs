/* tests/js/test_numeric_touch_arc.mjs — a NUMBER turns as an ARC, never a list
 * (Josh, 2026-09-26: "A for all").
 *
 * Performs the gesture through the real input path: touch NOTE FX's Octave knob
 * and turn it clockwise. The value goes UP, no option list is drawn, and the
 * cell's widget is an arc that swept clockwise. CONTROL: a NAMED list (SEQ
 * ARP's Style) still opens the picker, so the pin has a subject.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
const fb = new Uint8Array(W * H);
let prints = [];
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => { globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v); };
globalThis.stipple_rect = () => {};
globalThis.clear_screen = () => fb.fill(0);
globalThis.print = (x, y, t) => { prints.push(String(t)); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
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

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const T = 2;
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const touch = (k) => midi(0x90, k, 127);
const untouch = (k) => midi(0x90, k, 0);
const turn = (k, d) => midi(0xB0, 71 + k, d > 0 ? d : 128 + d);
/* One VALUE step: the knob's `sens` detents (Octave is 8). */
const stepUp = (k, bank) => {
    const v0 = S.bankParams[T][bank][k];
    for (let i = 0; i < 64 && S.bankParams[T][bank][k] === v0; i++) { turn(k, 1); S.tickCount++; globalThis.tick(); }
};
const frame = () => { prints = []; fb.fill(0); render.drawUI(); return fb.slice(); };
const ink = (f, x0, y0, w, h) => { let n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) n += f[y * W + x]; return n; };
const onBank = (b) => { S.activeBank = b; S.trackActiveBank[T] = b; S.bankSelectTick = S.tickCount; S.bankCardLatched = true; };

const NFX = 1, OCT = C.BANKS[NFX].knobs.findIndex((k) => k && k.abbrev === 'Oct');
const ARP = 4, STYLE = C.BANKS[ARP].knobs.findIndex((k) => k && k.abbrev === 'Style');
assert(OCT >= 0 && STYLE >= 0, 'fixture: knobs not found');

let resting, before;
step('⭐ touching NOTE FX Octave draws an ARC in its cell, not the list', () => {
    onBank(NFX);
    resting = frame();
    touch(OCT); S.tickCount++; globalThis.tick();
    stepUp(OCT, NFX); S.tickCount++; globalThis.tick();
    before = S.bankParams[T][NFX][OCT];
    const f = frame();
    assert(before === 1, 'a clockwise turn did not raise the octave: ' + before);
    /* the list would print its neighbours; the arc prints no option text */
    assert(!prints.includes('+2') && !prints.includes('-1'), 'the option list was drawn: ' + JSON.stringify(prints));
    const cell = ink(f, 0, 10, 32, 16), rest = ink(resting, 0, 10, 32, 16);
    assert(cell > 0, 'nothing drawn in the Octave cell');
    let differ = 0; for (let i = 0; i < f.length; i++) if (f[i] !== resting[i] && (i % W) < 32 && ((i / W) | 0) >= 10 && ((i / W) | 0) < 26) differ++;
    assert(differ > 10, 'the cell looks the same touched as at rest (' + cell + ' vs ' + rest + ' px)');
    assert(swallowed === null, 'swallowed: ' + swallowed);
});
step('⭐ turning further sweeps the arc CLOCKWISE (its tip moves right)', () => {
    const tip = (f) => { let sx = 0, n = 0; for (let y = 10; y < 26; y++) for (let x = 0; x < 32; x++) if (f[y * W + x]) { sx += x; n++; } return sx / n; };
    const a = tip(frame());
    stepUp(OCT, NFX); stepUp(OCT, NFX); S.tickCount++; globalThis.tick();
    assert(S.bankParams[T][NFX][OCT] === 3, 'value ' + S.bankParams[T][NFX][OCT]);
    const b = tip(frame());
    assert(b > a, 'the arc did not move right: ' + a.toFixed(2) + ' -> ' + b.toFixed(2));
    untouch(OCT); S.tickCount++; globalThis.tick();
});
step('⚠ CONTROL: a NAMED list (SEQ ARP Style) still opens the picker', () => {
    onBank(ARP);
    touch(STYLE); S.tickCount++; globalThis.tick();
    stepUp(STYLE, ARP); S.tickCount++; globalThis.tick();
    frame();
    assert(prints.length > 3, 'no picker for Style: ' + JSON.stringify(prints));
    untouch(STYLE); S.tickCount++; globalThis.tick();
});

if (failed) { console.log('FAIL: numeric touch arc'); process.exit(1); }
console.log('PASS: numbers turn as arcs; named lists keep the picker');
}
main().catch((e) => { console.error(e); process.exit(1); });
