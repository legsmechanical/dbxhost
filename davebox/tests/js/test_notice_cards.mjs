/* tests/js/test_notice_cards.mjs — every timed notice is a CARD over the
 * current screen, never a screen of its own.
 *
 * Before this, the plain popup (showActionPopup, the one nearly every notice
 * uses) took the whole screen in track view — and in SOUND MODE it drew nothing
 * at all: soundRender owns the panel and returns before any popup branch, so
 * "SOUND RESET", "MACROS CLEARED", "AUTOMATION CLEARED" and "NOT SAVED" fired
 * into the void whenever the sound card was up, which is exactly when you make
 * those gestures. The first case here performs one of those gestures for real
 * and asserts what is on the screen. → [[wired-is-not-reachable]]
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const ENGINE = {};
globalThis.shadow_get_param = (slot, k) => (ENGINE[k] !== undefined ? ENGINE[k] : '');
globalThis.shadow_set_param = (slot, k, v) => { ENGINE[k] = String(v); return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.stipple_rect = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.draw_rect = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

/* One frame, recorded: every print, every box, every fill. */
let F;
function frame(R) {
    F = { prints: [], rects: [], fills: [] };
    globalThis.clear_screen = () => {};
    globalThis.print = (x, y, t, c) => F.prints.push({ x, y, t: String(t), c });
    globalThis.draw_rect = (x, y, w, h, c) => F.rects.push({ x, y, w, h, c });
    globalThis.fill_rect = (x, y, w, h, c) => F.fills.push({ x, y, w, h, c });
    R.drawUI();
    return F;
}
/* The card: the one box drawn at CARD_X 6, width 116. */
const cardBox = (f) => f.rects.find((r) => r.x === 6 && r.w === 116);
const said = (f, t) => f.prints.some((p) => p.t === t);
const inCard = (f, t) => {
    const b = cardBox(f);
    return !!b && f.prints.some((p) => p.t === t && p.x >= b.x && p.x < b.x + b.w &&
                                         p.y >= b.y && p.y < b.y + b.h);
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const R = await import('../../ui/ui_render.mjs');
const P = await import('../../ui/ui_persistence.mjs');
const E = await import('../../ui/ui_editops.mjs');

globalThis.init();
S.awaitingProjectSelect = false; S.ledInitComplete = true;
S.stateLoading = false; S.bootSplashMs = 0;
S.sessionView = false; S.activeTrack = 1;
for (let i = 0; i < 8; i++) S.trackRoute[i] = 0;
const clearPopup = () => { S.actionPopupEndTick = -1; S.actionPopupLines = []; };
const cc = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.clockMs = (S.clockMs || 0) + 10.6; snd.soundTick(); } };

step('⭐ THE GESTURE: Delete + jog click on the SOUND + CONFIG card shows its notice ON the card', () => {
    S.bankCardLatched = true;
    snd.soundEnter(1, 1);
    ticks(4);
    /* move a level off its default so the reset has something to do */
    cc(71, 128 - 20); ticks(4);
    clearPopup();
    const before = frame(R);
    assert(!cardBox(before), 'setup: a card was already up');
    cc(119, 127); cc(3, 127); cc(3, 0); cc(119, 0);
    ticks(2);
    assert((S.actionPopupLines || []).join(' ').indexOf('RESET') >= 0,
           'setup: the reset did not fire (popup ' + JSON.stringify(S.actionPopupLines) + ')');
    const f = frame(R);
    assert(cardBox(f), 'the reset notice drew no card over the sound screen');
    assert(inCard(f, 'RESET'), 'the card does not carry the notice: ' + JSON.stringify(f.prints.map((p) => p.t)));
    snd.soundExit(); clearPopup();
    S.bankCardLatched = false;
});

step('a plain notice in TRACK view is a card over the screen, which still draws underneath', () => {
    const under = frame(R).prints.length;
    assert(under > 0, 'setup: the track overview printed nothing');
    P.showActionPopup('UNDO');
    const f = frame(R);
    assert(inCard(f, 'UNDO'), 'no UNDO card');
    assert(f.prints.length > under, 'the underlay was replaced rather than covered');
    /* the retired full-screen layout printed at x=4 */
    assert(!f.prints.some((p) => p.t === 'UNDO' && p.x === 4), 'the full-screen layout is still drawn');
    clearPopup();
});

step('a plain notice DEFERS while a knob is touched, then shows for the rest of its window', () => {
    P.showActionPopup('AUTOMATION', 'ON');
    S.knobTouched = 2;
    assert(!said(frame(R), 'AUTOMATION'), 'the card drew over a held knob');
    S.knobTouched = -1;
    assert(inCard(frame(R), 'AUTOMATION'), 'the card did not come back after the knob was released');
    clearPopup();
});

step('⚠ CONTROL: a showActionPopupFor notice does NOT defer (a result you have to read)', () => {
    P.showActionPopupFor(1500, 'SNAPSHOT 1', 'SAVED');
    S.knobTouched = 2;
    assert(inCard(frame(R), 'SAVED'), 'a non-deferring card was hidden by a held knob');
    S.knobTouched = -1;
    clearPopup();
});

step('the Performance Pads mode list is a card, its current choice in inverse video', () => {
    E.showModePopup('PERFORMANCE PADS', ['Velocity', 'Repeat Play (Rpt1)', 'Repeat Set (Rpt2)'], 1);
    const f = frame(R);
    const b = cardBox(f);
    assert(b, 'no card for the mode list');
    const hi = f.prints.find((p) => p.t === 'Repeat Play (Rpt1)');
    assert(hi && hi.c === 0, 'the current choice is not drawn in inverse');
    const lo = f.prints.find((p) => p.t === 'Velocity');
    assert(lo && lo.c === 1, 'an unselected choice is drawn in inverse');
    assert(f.fills.some((r) => r.c === 1 && r.x > b.x && r.x + r.w < b.x + b.w && r.y <= hi.y && r.y + r.h > hi.y),
           'no inverse bar inside the card behind the current choice');
    clearPopup();
});

step('NO NOTE and COMPRESS LIMIT are cards too', () => {
    S.noNoteFlashEndTick = S.clockMs + 600;
    assert(inCard(frame(R), 'NO NOTE'), 'NO NOTE is not a card');
    S.noNoteFlashEndTick = -1;
    S.stretchBlockedEndTick = S.clockMs + 1500;
    assert(inCard(frame(R), 'COMPRESS LIMIT'), 'COMPRESS LIMIT is not a card');
    S.stretchBlockedEndTick = -1;
});

step('⚠ SESSION view: a card notice draws ONLY the card — no full-screen copy with an empty bar under it', () => {
    S.sessionView = true;
    P.showActionPopupFor(1500, 'SNAPSHOT 1', 'SAVED');
    const f = frame(R);
    assert(inCard(f, 'SNAPSHOT 1'), 'no card in session view');
    const copies = f.prints.filter((p) => p.t === 'SNAPSHOT 1').length;
    assert(copies === 1, 'the notice was printed ' + copies + ' times');
    assert(!f.rects.some((r) => r.x === 4 && r.w === 120), 'the gauge bar was drawn for a notice with no gauge');
    S.sessionView = false;
    clearPopup();
});

step('⚠ CONTROL: the gauge popup keeps its full screen in session view', () => {
    S.sessionView = true;
    P.showActionPopupGauge(0.5, 0.8, 'LEVEL', '-6 dB');
    const f = frame(R);
    assert(!cardBox(f), 'the gauge was drawn as a card');
    assert(f.rects.some((r) => r.x === 4 && r.w === 120), 'the gauge bar is missing');
    S.sessionView = false;
    clearPopup();
});

if (failed) process.exit(1);
console.log('PASS: test_notice_cards.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
