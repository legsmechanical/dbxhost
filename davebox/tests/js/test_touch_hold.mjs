/* tests/js/test_touch_hold.mjs — THE TOUCH RELEASE HOLD (ui_touch_hold.mjs).
 * A light finger makes a knob's or the jog's touch drop out and come back; the
 * release waits S.touchHoldMs so the screens a touch holds open never see the
 * gap. Through the real input path (globalThis.onMidiMessageInternal + tick);
 * the jog card is judged on the FRAME.
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
const pure = await import('../../ui/ui_pure.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const touchJog = () => midi(0x90, 9, 127);
const releaseJog = () => midi(0x80, 9, 0);
const jog = (d) => midi(0xB0, 14, d > 0 ? d : 128 + d);
const tick = () => { S.tickCount++; globalThis.tick(); };
/* The UI clock follows the ticks (10.6 ms each), so the hold can be crossed on purpose. */
S.clockFollowTicks = true; S.tickCount = 1000;
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const HOLD = S.touchHoldMs;
const inside = Math.floor((HOLD * 0.5) / 10.6), past = Math.ceil(HOLD / 10.6) + 2;
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const touchKnob = (k) => midi(0x90, k, 127);
const releaseKnob = (k) => midi(0x80, k, 0);
const releaseKnobOn0 = (k) => midi(0x90, k, 0);
const logs = [];
const _log = console.log;
const quiet = (fn) => { console.log = (...a) => logs.push(a.join(' ')); try { fn(); } finally { console.log = _log; } };

step('the hold is on by default', () => {
    assert(HOLD > 0, 'S.touchHoldMs is ' + HOLD);
    assert(inside >= 2, 'the rig needs room inside the hold: ' + inside + ' ticks');
});

step('⭐⭐ the jog card survives a flicker: off then on inside the hold never reaches the screen', () => {
    S.sessionView = false; S.activeBank = 1; S.trackActiveBank[2] = 1;
    S.bankCardLatched = false; S.jogTouched = false; ticks(past);
    const rest = frame();
    quiet(() => { touchJog(); }); tick();
    const card = frame();
    assert(!same(card, rest), 'control: the touch drew nothing');
    quiet(() => {
        for (let i = 0; i < 4; i++) {
            releaseJog(); ticks(inside);
            assert(S.jogTouched, 'flicker ' + i + ': the release reached the handler inside the hold');
            assert(same(frame(), card), 'flicker ' + i + ': the card dropped');
            touchJog(); ticks(inside);
            assert(same(frame(), card), 'flicker ' + i + ': the re-touch changed the frame');
        }
    });
    assert(logs.filter((l) => l.indexOf('touch flicker n=9') >= 0).length === 4,
           'each swallowed gap is logged once: ' + JSON.stringify(logs.filter((l) => l.indexOf('flicker') >= 0)));
});

step('⭐⭐ ...and a real release still lands — late by the hold, not lost', () => {
    const card = frame();
    quiet(() => { releaseJog(); ticks(inside); });
    assert(S.jogTouched && same(frame(), card), 'the release landed early');
    quiet(() => ticks(past));
    assert(!S.jogTouched, 'the release never landed');
    assert(!same(frame(), card), 'the card outlived the touch');
});

step('⭐ a knob: the touch survives a flicker in both release encodings, then lets go', () => {
    S.activeBank = 1; S.trackActiveBank[2] = 1;
    quiet(() => { touchKnob(3); tick(); });
    assert(S.knobTouched === 3, 'control: the touch did not register: ' + S.knobTouched);
    quiet(() => { releaseKnob(3); ticks(inside); touchKnob(3); ticks(inside); });
    assert(S.knobTouched === 3, 'a 0x80 flicker let go: ' + S.knobTouched);
    quiet(() => { releaseKnobOn0(3); ticks(inside); touchKnob(3); ticks(inside); });
    assert(S.knobTouched === 3, 'a 0x90/0 flicker let go: ' + S.knobTouched);
    quiet(() => { releaseKnob(3); releaseKnob(3); ticks(past); });
    assert(S.knobTouched === -1, 'the release never landed: ' + S.knobTouched);
});

step('⭐ one knob waiting does not hold another back, and a new touch after the hold is a new touch', () => {
    quiet(() => { touchKnob(2); tick(); releaseKnob(2); touchKnob(5); tick(); });
    assert(S.knobTouched === 5, 'the second knob was not taken: ' + S.knobTouched);
    quiet(() => { ticks(past); });
    assert(S.knobTouched === 5, 'the first knob\'s late release let go of the second: ' + S.knobTouched);
    quiet(() => { releaseKnob(5); ticks(past); touchKnob(5); tick(); });
    assert(S.knobTouched === 5, 'a touch after the hold was swallowed: ' + S.knobTouched);
    quiet(() => { releaseKnob(5); ticks(past); });
});

step('a release with no touch before it passes straight through; other notes are never held', () => {
    S.knobTouched = 6;
    quiet(() => { releaseKnob(6); });
    assert(S.knobTouched === -1, 'an unmatched release was held: ' + S.knobTouched);
    quiet(() => { midi(0x90, 70, 127); midi(0x80, 70, 0); });
    assert(!S.padPhysDown.has(70), 'a pad release was held back');
});

step('S.touchHoldMs = 0 turns it off: the release lands at once', () => {
    S.touchHoldMs = 0;
    quiet(() => { touchKnob(1); tick(); releaseKnob(1); });
    assert(S.knobTouched === -1, 'held with the hold off: ' + S.knobTouched);
    S.touchHoldMs = HOLD;
});

if (swallowed) { console.error('  FAIL — the UI swallowed an error: ' + swallowed); failed = 1; }
if (failed) { console.log('FAIL: touch hold'); process.exit(1); }
console.log('PASS: a touch release waits out a flicker, and a real release still lands');
}
main().catch((e) => { console.error(e); process.exit(1); });
