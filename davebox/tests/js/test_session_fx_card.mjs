import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_session_fx_card.mjs — the SESSION FX card is the Master & Send
 * FX list at rest (Josh, 2026-09-26: "can we make session view "session
 * effects" card the session effects menu like with did with the the track
 * config bank and track config menu?"): the list's rows, no cursor, the door's
 * corner brackets; the click opens it live; Back from the list comes back to
 * the bracketed card. Through the real session-view jog and click. */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step ' + label);
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
const fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => { globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v); };
globalThis.stipple_rect = (x, y, w, h, v, phase) => {
    for (let j = y; j < y + h; j++) for (let i = x + ((((x + j) & 1) === ((phase || 0) & 1)) ? 0 : 1); i < x + w; i += 2) globalThis.set_pixel(i, j, v); };
globalThis.clear_screen = () => fb.fill(0);
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

const slotSets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = (slot, k, v) => { slotSets.push(k); return 1; };
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const E = await import('../../ui/ui_engine.mjs');
const render = await import('../../ui/ui_render.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const kit = await import('../../ui/ui_movy.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = true; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const tick = () => { S.tickCount++; globalThis.tick(); snd.soundTick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
/* The bank map a turn raises is dropped at once — these steps read the card under it. */
const jog = (d) => { cc(14, d > 0 ? 1 : 127); ticks(2); S.bankNavKind = null; };
const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const px = (f, x, y) => f[y * W + x];
const TOP = 10, BOT = 10 + (kit.MV_FOOTER_Y - 11) - 1;
const bracketed = (f) => px(f, 0, TOP) && px(f, 3, TOP) && px(f, 127, TOP) && px(f, 124, TOP)
                      && px(f, 0, BOT) && px(f, 127, BOT) && px(f, 0, TOP + 2) && px(f, 127, TOP + 2);
/* A cursor row is a full-width inverted band: solid ink across the middle of
 * the list at some row. None at rest. */
const solidRow = (f, y) => { let n = 0; for (let x = 20; x < 100; x++) n += px(f, x, y); return n >= 60; };
/* Three solid rows running: a band, not the one-pixel rule under Master. */
const cursorRow = (f) => { for (let y = TOP + 2; y < BOT - 4; y++) if (solidRow(f, y) && solidRow(f, y + 1) && solidRow(f, y + 2)) return y; return -1; };
const FX = E.SESS_KNOB_MODES.findIndex((m) => m.widget === 'gateway');

step('⭐⭐ THE GESTURE: walk the session mixer to SESSION FX — the card is the list at rest, bracketed, no cursor', () => {
    assert(FX >= 0, 'no gateway mode');
    S.sessKnobMode = 0; S.sessMixerLatched = true; ticks(2);
    for (let i = 0; i < FX; i++) jog(1);
    assert(S.sessKnobMode === FX, 'did not reach SESSION FX: ' + S.sessKnobMode);
    assert(!snd.soundActive(), 'the list opened on arrival');
    const f = frame();
    assert(bracketed(f), 'no corner brackets round the list');
    assert(cursorRow(f) < 0, 'a cursor row at rest (y ' + cursorRow(f) + ')');
});
step('⭐ the click opens the list live: brackets go, a cursor row appears', () => {
    click();
    assert(snd.soundActive(), 'the list did not open');
    const f = frame();
    assert(!bracketed(f), 'the live list still wears the brackets');
    assert(cursorRow(f) >= 0, 'no cursor on the live list');
});
step('⭐ Back from the list returns to the bracketed card', () => {
    back();
    assert(!snd.soundActive(), 'Back did not close the list');
    assert(S.sessKnobMode === FX && S.sessMixerLatched, 'Back left the SESSION FX card');
    assert(bracketed(frame()), 'the card came back without its brackets');
});

if (failed) { console.log('FAIL: SESSION FX card'); process.exit(1); }
console.log('PASS: the SESSION FX card is the list at rest; the click opens it');
}
main().catch((e) => { console.error(e); process.exit(1); });
