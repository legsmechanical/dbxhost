import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_config_bank.mjs — the CONFIG bank and MIX (Josh, 2026-09-26):
 * "I'd like the track config menu to live as a menu on a bank in addition to
 * something accessible just through shift note/session. (and to take the click
 * to enter the menu off of sound+config and change sound+config to just
 * "mix")"; the card: "no knobs.  it literally shows the menu with the "click to
 * enter" corner brackets and clicking allows you to navigate and use the menu";
 * and a Conductor gets it too, "first on its walk".
 *
 * Performed through the real input path — jog detents, the jog click (CC 3),
 * Back (CC 51), a knob turn (CC 71) — and read off the framebuffer. */
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
const P = await import('../../ui/ui_pure.mjs');
const icc = await import('../../ui/ui_input_cc.mjs');
const render = await import('../../ui/ui_render.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const kit = await import('../../ui/ui_movy.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const tick = () => { S.tickCount++; globalThis.tick(); snd.soundTick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const jog = (d) => { cc(14, d > 0 ? 1 : 127); ticks(2); };
const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const px = (f, x, y) => f[y * W + x];
/* The door's corner brackets round the list: ink at the four corners of the
 * list box (drawBrackets(0, 10, 128, MV_FOOTER_Y - 11)). */
const TOP = 10, BOT = 10 + (kit.MV_FOOTER_Y - 11) - 1;
const bracketed = (f) => px(f, 0, TOP) && px(f, 3, TOP) && px(f, 127, TOP) && px(f, 124, TOP)
                      && px(f, 0, BOT) && px(f, 127, BOT) && px(f, 0, TOP + 2) && px(f, 127, TOP + 2);
const toBank = (b) => { S.activeBank = b; S.trackActiveBank[2] = b; ticks(4); };
const VIEW_BLOCKS = 0, VIEW_PROMPT = 18;

step('⭐ CONFIG is first in every track\'s banks but a DOOR — off the jog walk (2026-10-03); MIX (bank 11) is last where there is one', () => {
    for (const m of [C.PAD_MODE_MELODIC_SCALE, C.PAD_MODE_DRUM, C.PAD_MODE_CONDUCT]) {
        const list = P.bankListForMode(m, 2);
        assert(list[0] === C.BANK_CONFIG, 'mode ' + m + ': ' + list);
        assert(P.bankCycleForMode(m, 2).indexOf(C.BANK_CONFIG) < 0, 'CONFIG is on the walk, mode ' + m);
    }
    assert(P.bankCycleForMode(0, 2).slice(-1)[0] === C.BANK_SOUND && P.bankCycleForMode(1, 2).slice(-1)[0] === C.BANK_SOUND, 'MIX last');
    assert(P.bankCycleForMode(2, 2).indexOf(C.BANK_SOUND) < 0, 'a Conductor has no MIX');
    assert(P.bankDisplayName(0, C.BANK_SOUND) === 'MIX' && P.bankDisplayName(0, C.BANK_CONFIG) === 'CONFIG', 'names');
    assert(C.BANK_DEFAULT === 0, 'bank 0 stays the start');
});

step('⭐⭐ THE CARD: CONFIG locked (a restored bank, say) is the TRACK CONFIG list inside the corner brackets', () => {
    S.activeBank = 0; S.trackActiveBank[2] = 0; S.bankCardLatched = true; ticks(2);
    toBank(C.BANK_CONFIG);
    assert(S.activeBank === C.BANK_CONFIG, 'did not reach CONFIG: ' + S.activeBank);
    ticks(4);
    const st = snd.soundConfigCardForTest();
    assert(snd.soundOpen() && st.card, 'the CONFIG card is not up: ' + JSON.stringify(st));
    assert(st.rows.indexOf('trackto') >= 0 && st.rows.indexOf('block') >= 0, 'the card lacks the menu rows: ' + st.rows);
    const f = frame();
    assert(bracketed(f), 'no corner brackets round the list');
    assert(snd.soundMenuHeaderForTest().name === 'TRACK CONFIG', 'header ' + JSON.stringify(snd.soundMenuHeaderForTest()));
});

step('⭐ the click makes the menu live: brackets go, the jog moves the cursor instead of the bank', () => {
    click();
    assert(snd.soundPickStateForTest().view === VIEW_BLOCKS, 'not in the menu: ' + snd.soundPickStateForTest().view);
    assert(!bracketed(frame()), 'the live menu still wears the brackets');
    const r0 = snd.soundPickStateForTest().row;
    jog(1);
    assert(S.activeBank === C.BANK_CONFIG, 'the jog walked the bank off the live menu');
    assert(snd.soundPickStateForTest().row > r0, 'the cursor did not move: ' + r0 + ' -> ' + snd.soundPickStateForTest().row);
});

step('⭐ Back from the live menu returns to the bracketed card; Back again leaves bank mode, still on CONFIG', () => {
    for (let i = 0; i < 20 && snd.soundPickStateForTest().row > 0; i++) jog(-1);
    back();
    assert(snd.soundConfigCardForTest().card, 'Back did not return to the card: view ' + snd.soundPickStateForTest().view);
    assert(bracketed(frame()), 'the card came back without its brackets');
    back();
    assert(!S.bankCardLatched && S.activeBank === C.BANK_CONFIG, 'Back: latched ' + S.bankCardLatched + ' bank ' + S.activeBank);
});

step('⭐ CONFIG has no knobs: a turn on the card changes no level', () => {
    S.bankCardLatched = true; ticks(2);
    slotSets.length = 0;
    cc(71, 5); ticks(3);
    assert(!slotSets.some((k) => /volume|pan|send/.test(k)), 'a knob wrote a level: ' + slotSets);
});

step('⭐ MIX: its click opens nothing and it says no CLK MENU', () => {
    snd.soundExit(); toBank(C.BANK_SOUND); S.bankCardLatched = true; ticks(4);
    assert(snd.soundPickStateForTest().view === VIEW_PROMPT, 'not on the MIX card: ' + snd.soundPickStateForTest().view);
    click();
    assert(snd.soundPickStateForTest().view === VIEW_PROMPT, 'the MIX click opened ' + snd.soundPickStateForTest().view);
    assert(S.activeBank === C.BANK_SOUND, 'the bank moved');
});

step('⭐ a Conductor: CONFIG opens its menu rows (a door: off the walk)', () => {
    snd.soundExit(); S.bankCardLatched = false;
    S.trackPadMode[2] = C.PAD_MODE_CONDUCT;
    toBank(0); S.bankCardLatched = true; ticks(2);
    toBank(C.BANK_CONFIG);
    assert(S.activeBank === C.BANK_CONFIG, 'not on CONFIG: ' + S.activeBank);
    ticks(4);
    const st = snd.soundConfigCardForTest();
    assert(snd.soundOpen() && st.card, 'no CONFIG card on a Conductor: ' + JSON.stringify(st));
    assert(st.rows.indexOf('trackto') >= 0 && st.rows.indexOf('block') < 0, 'Conductor rows: ' + st.rows);
    /* Leave it by a bank map pick (the jog walk retired 2026-10-04): CLIP. */
    S.bankPickerSel = P.bankListForMode(S.trackPadMode[2], 2).indexOf(0); icc.applyBankPick(false); ticks(4);
    assert(S.activeBank === 0 && !snd.soundOpen(), 'leaving CONFIG did not close: ' + S.activeBank);
    toBank(C.BANK_SOUND);                              /* a stale MIX record on a Conductor */
    assert(!snd.soundOpen(), 'a Conductor opened MIX');
    S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE; S.bankCardLatched = false; toBank(0);
});

if (failed) { console.log('FAIL: CONFIG bank'); process.exit(1); }
console.log('PASS: CONFIG shows TRACK CONFIG at rest, the click enters it; MIX is levels only');
}
main().catch((e) => { console.error(e); process.exit(1); });
