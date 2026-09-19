/* tests/js/test_capture_screens.mjs — the capture chooser, as the user drives it.
 *
 * Confirming the LENGTH chooser (warp-to-fit) used to announce "TEMPO SET /
 * 2 BPM" — its choices are bar counts. Driven through the real jog click.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
async function step(l, fn) { try { await fn(); ok(l); } catch (e) { bad(l, e); } }
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
const R = await import('../../ui/ui_render.mjs');
globalThis.init();
S.awaitingProjectSelect = false; S.ledInitComplete = true;
S.stateLoading = false; S.bootSplashMs = 0; S.sessionView = false;
const click = () => { globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 3, 127]));
                      globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 3, 0])); };
function open(warp, vals, idx) {
    S.tempoSelectActive = true; S.tempoSelectTrack = 1; S.tempoSelectClip = 0;
    S.tempoSelectWarp = warp; S.tempoSelectBpms = vals; S.tempoSelectIdx = idx;
    S.actionPopupLines = []; S.actionPopupEndTick = -1;
}

await step('the LENGTH chooser confirms a LENGTH, in bars', () => {
    open(true, [1, 2, 3, 4], 1);
    click();
    assert(!S.tempoSelectActive, 'the click did not close the chooser');
    const got = S.actionPopupLines.join(' ');
    assert(got === 'LENGTH SET 2 BARS', 'popup was: ' + got);
});

await step('⚠ CONTROL: the TEMPO chooser still confirms a tempo', () => {
    open(false, [61, 122, 244], 1);
    click();
    const got = S.actionPopupLines.join(' ');
    assert(got === 'TEMPO SET 122 BPM', 'popup was: ' + got);
});

await step('the chooser draws in the kit faces, not the host list font', () => {
    open(true, [1, 2, 3, 4], 0);
    const f = frame(R);
    assert(f.prints.length === 0, 'host print() is still used: ' + JSON.stringify(f.prints.map((p) => p.t)));
    S.tempoSelectActive = false;
});

/* The kit draws through fill_rect, so kit text is invisible to a print()
 * capture — these read it through the fonts' own trace. */
const fonts = await import('../../ui/ui_fonts_pp.mjs');
let kit = [];
fonts.setKitTextTrace((t) => kit.push(String(t)));
const kitFrame = () => { kit = []; frame(R); return kit.join(' | '); };

await step('the tempo chooser says what it is, in the kit faces', () => {
    open(false, [61, 122, 244], 1);
    const t = kitFrame();
    ['CAPTURE TEMPO', '122', 'BPM', 'TEMPO', 'SET'].forEach((w) =>
        assert(t.indexOf(w) >= 0, 'missing "' + w + '": ' + t));
    S.tempoSelectActive = false;
});

await step('TAP TEMPO is on the kit now, not the MCU dialog face', () => {
    S.tapTempoOpen = true; S.tapTempoBpm = 118;
    const t = kitFrame();
    ['TAP TEMPO', '118', 'BPM', 'TAP ANY PAD'].forEach((w) =>
        assert(t.indexOf(w) >= 0, 'missing "' + w + '": ' + t));
    S.tapTempoOpen = false;
});

await step('PERFORMANCE mode names its mode chips and what is engaged', () => {
    S.sessionView = true; S.perfViewLocked = true;
    S.perfModsToggled = 0; S.perfModsHeld = 0; S.perfStack = []; S.perfRecalledSlot = -1;
    let t = kitFrame();
    ['PERFORMANCE', 'NO MODS ENGAGED', 'HOLD', 'SYNC', 'LATCH'].forEach((w) =>
        assert(t.indexOf(w) >= 0, 'missing "' + w + '": ' + t));
    S.perfModsToggled = 0b101; S.perfStack = [{ idx: 2 }];
    t = kitFrame();
    assert(t.indexOf('OCT+') >= 0, 'an engaged mod is not named: ' + t);
    assert(t.indexOf('1/8') >= 0, 'the repeat rate is not shown: ' + t);
    S.sessionView = false; S.perfViewLocked = false; S.perfStack = []; S.perfModsToggled = 0;
});

await step('the LOADING screen names the project and the stage', () => {
    S.stateLoading = true; S.currentSetName = 'Grams at night';
    const t = kitFrame();
    ['LOADING', 'GRAMS AT NIGHT', 'STARTING THE SEQUENCER'].forEach((w) =>
        assert(t.indexOf(w) >= 0, 'missing "' + w + '": ' + t));
    S.stateLoading = false;
});

await step('⚠ CONTROL: the trace SEES a draw — so a missing string means missing text, not a dead hook', () => {
    kit = [];
    fonts.fontPrint4x5(0, 0, '', 1);
    assert(kit.length === 1 && kit[0] === '', 'the trace does not see a draw: ' + JSON.stringify(kit));
});

await step('the confirm family: kit header, and the WORDMARK survives in the title', () => {
    S.confirmExit = 'quit'; S.confirmExitSel = 1;
    const t = kitFrame();
    assert(t.indexOf('QUIT dAVEBOx?') >= 0,
           'the title lost the wordmark (the header face has the lowercase glyphs): ' + t);
    assert(t.indexOf('SAVE AND LEAVE THE SESSION?') >= 0, 'body missing: ' + t);
    S.confirmExit = true;
    assert(kitFrame().indexOf('SUSPEND SESSION?') >= 0, 'the suspend confirm lost its title');
    S.confirmExit = false;
});

await step('⭑ a long body line WRAPS by measured width rather than running off the panel', () => {
    /* "of automation will be cleared." used to be hand-broken and lost its last
     * word on the wider of the two dialogs that draw it. */
    S.confirmTypeChange = { typeName: 'Drums', macros: 3, lanes: 2 };
    const t = kitFrame();
    assert(t.indexOf('CLEARED.') >= 0, 'the line was truncated instead of wrapped: ' + t);
    kit.filter((l) => l !== 'CHANGE TO DRUMS?').forEach((l) =>
        assert(fonts.fontWidth4x5(l) <= 124, 'a body line is wider than the panel: "' + l + '"'));
    S.confirmTypeChange = null;
});

await step('⭑ every dialog BUTTON has room for its label, boxes and all', async () => {
    /* Josh, device render 2026-09-19: "some of the letters/digits are touching
     * the box borders". Fixed widths did that — "Cancel" needs 15px more than
     * "1x" — so a row sizes each button to its MEASURED label now. This checks
     * the geometry rather than the look: every label ink box sits at least a
     * pixel inside its button, horizontally and vertically. */
    const ML = await import('/data/UserData/schwung/shared/menu_layout.mjs');
    const rows = [
        [{ label: 'Yes' }, { label: 'No' }, { label: 'Cancel' }],
        [{ label: '1x' }, { label: '2x' }, { label: '4x' }, { label: 'Cancel' }],
        [{ label: 'Clip' }, { label: 'Lane' }, { label: 'Cancel' }],
        [{ label: 'OK' }, { label: 'Bake Now' }],
    ];
    for (const h of [11, 12, 13]) {
        for (const row of rows) {
            const boxes = [], texts = [];
            globalThis.fill_rect = (x, y, w, hh) => { if (w > 12 && hh === h) boxes.push({ x, y, w, h: hh }); };
            globalThis.draw_rect = (x, y, w, hh) => { if (w > 12 && hh === h) boxes.push({ x, y, w, h: hh }); };
            globalThis.print = (x, y, t) => texts.push({ x, y, t: String(t), w: globalThis.text_width(String(t)) });
            /* every button SELECTED, so each box is one fill_rect — the
             * unselected outline is four thin ones and the widths are the same
             * either way (sel only picks the paint). */
            ML.drawDialogButtonRow(40, h, row.map((b) => ({ label: b.label, sel: true })));
            assert(boxes.length === row.length, 'expected ' + row.length + ' buttons, drew ' + boxes.length);
            assert(texts.length === row.length, 'expected ' + row.length + ' labels, drew ' + texts.length);
            for (let i = 0; i < row.length; i++) {
                const b = boxes[i], t = texts[i];
                assert(t.x >= b.x + 1 && t.x + t.w <= b.x + b.w - 1,
                       'h' + h + ' "' + t.t + '" touches its box sides: text ' + t.x + '+' + t.w +
                       ' in box ' + b.x + '+' + b.w);
                assert(t.y >= b.y + 1 && t.y + 7 <= b.y + b.h - 1,
                       'h' + h + ' "' + t.t + '" touches its box top/bottom: text y ' + t.y +
                       ' in box y ' + b.y + ' h ' + b.h);
            }
            assert(boxes[boxes.length - 1].x + boxes[boxes.length - 1].w <= 124, 'the row runs off the panel');
        }
    }
});

if (failed) process.exit(1);
console.log('PASS: test_capture_screens.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
