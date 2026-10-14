/* tests/js/test_card_hold.mjs — CARD HOLD (Josh, 2026-10-13: "a custom knob
 * overview hold setting that dictates how long a card remains on screen after
 * a knob touch is released"). Through the real input path and the tick's
 * clock; judged on the FRAME.
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
/* The UI clock follows the ticks, so the hold window can be crossed on purpose. */
S.clockFollowTicks = true; S.tickCount = 1000;
const holdTicks = 12;
const settle = () => { S.tickCount += holdTicks; globalThis.tick(); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const menu = await import('../../ui/ui_menu.mjs');
const menuItems = () => { menu.openGlobalMenu(); const it = S.globalMenuItems; S.globalMenuOpen = false; return it; };
const prefs = await import('../../ui/ui_prefs.mjs');
const written = {};
const _hwf = globalThis.host_write_file;
globalThis.host_write_file = (p, b) => { written[p] = String(b); return _hwf(p, b); };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const { nowMs } = await import('../../ui/ui_state.mjs');
/* Ticks are the clock here (clockFollowTicks): tick until this many ms have gone by. */
const passMs = (ms) => { const end = nowMs() + ms; while (nowMs() < end) tick(); };
const MS_PER_TICK = 25;                          /* a little over one rig tick */
const touchKnob = (k) => midi(0x90, k, 127);
const releaseKnob = (k) => midi(0x80, k, 0);
const item = () => menuItems().find((it) => it && it.label === 'Card Hold');
const frames = () => {
    S.sessionView = false; S.activeBank = 1; S.trackActiveBank[2] = 1;
    S.bankCardLatched = false; S.knobTouched = -1; S.cardHoldUntil = -1; settle();
    const rest = frame();
    S.bankCardLatched = true; const card = frame(); S.bankCardLatched = false;
    return { rest, card };
};
/* After the release the touch-release hold (S.touchHoldMs) runs first; the
 * card hold counts from the moment the release is DELIVERED. */
const letGo = (k) => { releaseKnob(k); passMs(S.touchHoldMs + 2 * MS_PER_TICK); };

step('the global menu has Card Hold under Beat Marks: Off, 0.5 s, 1 s, 2 s — Off by default', () => {
    const items = menuItems(), i = items.findIndex((it) => it && it.label === 'Card Hold');
    assert(i > 0 && items[i - 1].label === 'Beat Marks', 'not under Beat Marks');
    assert(JSON.stringify(items[i].options) === JSON.stringify([0, 500, 1000, 2000]), 'choices ' + JSON.stringify(items[i].options));
    assert(JSON.stringify(items[i].options.map(items[i].format)) === JSON.stringify(['Off', '0.5 s', '1 s', '2 s']),
           'shown as ' + JSON.stringify(items[i].options.map(items[i].format)));
    S.cardHoldMs = null;
    assert(prefs.cardHoldMs() === 0, 'default is not Off: ' + prefs.cardHoldMs());
});

step('⭐ OFF: the page goes with the finger, as before', () => {
    item().set(0);
    const { rest, card } = frames();
    assert(!same(rest, card), 'control: the overview and the bank page draw the same frame');
    touchKnob(3); tick();
    assert(!same(frame(), rest), 'control: a knob touch did not show the page');
    letGo(3);
    assert(same(frame(), rest), 'the page outlived the touch with Card Hold off');
});

for (const ms of [500, 1000, 2000]) {
    step('⭐⭐ ' + (ms / 1000) + ' s: the page stays that long after the knob is let go, then the overview is back', () => {
        item().set(ms);
        assert(written[prefs.CARD_HOLD_PATH] === ms + '\n', 'not persisted: ' + JSON.stringify(written));
        const { rest } = frames();
        touchKnob(3); tick();
        letGo(3);
        assert(S.knobTouched < 0, 'rig: the release was not delivered');
        assert(!same(frame(), rest) && render.bankCardShown(), 'the page went with the finger');
        assert(!render.bankCardVisible(), 'the held page counts as bank mode — it is drawn, nothing more');
        passMs(ms * 0.6);
        assert(!same(frame(), rest), 'the page went early, ' + Math.round(ms * 0.6) + ' ms in');
        passMs(ms * 0.6);
        assert(same(frame(), rest) && !render.bankCardShown(), 'the page is still up ' + Math.round(ms * 1.2) + ' ms after the release');
    });
}

step('⭐ touching again inside the hold keeps the page; the count starts over at the next release', () => {
    item().set(1000);
    const { rest } = frames();
    touchKnob(3); tick(); letGo(3);
    passMs(700);
    touchKnob(5); tick();
    passMs(700);                                   /* past the first release's hold, finger down */
    assert(!same(frame(), rest), 'the page went while a knob was touched');
    letGo(5);
    passMs(700);
    assert(!same(frame(), rest), 'the second release did not get its own full hold');
    passMs(500);
    assert(same(frame(), rest), 'the page never came down');
});

step('⭐ the held page belongs to where it was armed: Shift, another track, another view take it down', () => {
    item().set(2000);
    let { rest } = frames();
    touchKnob(3); tick(); letGo(3);
    assert(render.bankCardShown(), 'rig: no held page');
    S.shiftHeld = true;
    assert(!render.bankCardShown(), 'Shift did not stand the held page down');
    S.shiftHeld = false;
    S.activeTrack = 4;
    assert(!render.bankCardShown(), 'the held page followed to another track');
    S.activeTrack = 2;
    S.sessionView = true;
    assert(!render.sessMixerShown() && !render.bankCardShown(), 'the held page followed into Session View');
    S.sessionView = false;
    passMs(2300);
});

step('⭐ Session View: the mixer page stays the same way', () => {
    item().set(500);
    S.sessionView = true; S.sessKnobMode = 0; S.cardHoldUntil = -1; settle();
    const rest = frame();
    assert(!render.sessMixerShown(), 'control: the mixer page shows untouched');
    touchKnob(2); tick();
    assert(render.sessMixerShown(), 'control: a knob touch did not show the mixer page');
    letGo(2);
    assert(render.sessMixerShown() && !render.sessMixerVisible(), 'the mixer page went with the finger');
    passMs(700);
    assert(!render.sessMixerShown() && same(frame(), rest), 'the mixer page never came down');
    S.sessionView = false;
});

step('the setting is read from its file at launch; anything but a listed value is Off', () => {
    for (const [body, want] of [['1000\n', 1000], ['2000', 2000], ['750\n', 0], ['junk', 0]]) {
        globalThis.host_file_exists = (p) => p === prefs.CARD_HOLD_PATH;
        globalThis.host_read_file = (p) => (p === prefs.CARD_HOLD_PATH ? body : '');
        S.cardHoldMs = null;
        assert(prefs.cardHoldMs() === want, JSON.stringify(body) + ' read as ' + prefs.cardHoldMs());
    }
    globalThis.host_file_exists = () => false; globalThis.host_read_file = () => '';
    S.cardHoldMs = null;
    assert(prefs.cardHoldMs() === 0, 'no file is not Off');
});

if (failed) { console.log('FAIL: card hold'); process.exit(1); }
console.log('PASS: a knob\'s page stays for the Card Hold time after the release');
}
main().catch((e) => { console.error(e); process.exit(1); });
