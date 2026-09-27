/* tests/js/test_phrase_bank.mjs — the PHRASE bank, the phrase library's door.
 *
 * Josh: "phrase should be a bank" — "in seq. but phrase step clip. ( the order
 * of banks is meant to roughly reflect the data hierarchy, and phrase writes
 * all steps - and clip operates on existing steps)". It replaces the old door
 * (touch K6 on CLIP / DRUM LANE and click), which is gone: those cells are
 * empty again.
 *
 * Performed through the real input path — jog detents (CC 14), the jog click
 * (CC 3), Back (CC 51), knob touches (notes 0-7) and turns (CC 71-78) — and
 * read off the framebuffer, the printed text, the knob rings as SENT and the
 * engine writes. → [[wired-is-not-reachable]] */
import './_bulk_get_stub.mjs';

let failed = 0;
function step(l, fn) {
    try { fn(); console.log(`  ok   — ${l}`); }
    catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display',
    'set_led', 'host_open_service', 'host_close_service',
    'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi',
    'move_midi_inject_to_move'])
    globalThis[fn] = () => 0;
globalThis.host_write_file = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
/* The knob rings as SENT (setButtonLED → [0x0b, 0xB0, cc, colour]). */
const ring = {};
globalThis.move_midi_internal_send = (pkt) => { if (pkt && pkt[0] === 0x0b && pkt[1] === 0xB0 && pkt[2] >= 71 && pkt[2] <= 78) ring[pkt[2]] = pkt[3]; return 1; };
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];

const W = 128, H = 64;
const FB = new Uint8Array(W * H);
const _px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) FB[y * W + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => {
    for (let i = 0; i < (w | 0); i++) { _px((x | 0) + i, y | 0, c); _px((x | 0) + i, (y | 0) + (h | 0) - 1, c); }
    for (let j = 0; j < (h | 0); j++) { _px(x | 0, (y | 0) + j, c); _px((x | 0) + (w | 0) - 1, (y | 0) + j, c); }
};
globalThis.set_pixel = _px;

/* A one-phrase library for each side, served where the module keeps it. */
const LIBS = {
    bass: { v: 1, cat: 'bass', phrases: [
        { id: 'bass.a', name: 'ROOT 8THS', g: '', bars: 1, mode: 'min', n: '0 0 0 0 100 40;48 0 0 0 90 40' } ] },
    hat: { v: 1, cat: 'hat', phrases: [
        { id: 'hat.a', name: 'HOUSE OFF', g: 'HOUSE', bars: 1, n: '48 100 12;144 100 12' } ] },
};
const files = {};
globalThis.host_file_exists = (p) => Object.prototype.hasOwnProperty.call(files, p);
globalThis.host_read_file = (p) => files[p] || '';

const writes = [];
globalThis.host_module_set_param = (k, v) => { writes.push(String(k) + '=' + String(v)); };
globalThis.host_module_set_params = () => true;
globalThis.shadow_set_param = (slot, k, v) => { writes.push('slot' + slot + ':' + String(k) + '=' + String(v)); return 1; };
globalThis.host_module_get_param = () => '';

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const C = await import('../../ui/ui_constants.mjs');
    const P = await import('../../ui/ui_pure.mjs');
    const PB = await import('../../ui/ui_phrase_browser.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const kit = await import('../../ui/ui_movy.mjs');
    const fonts = await import('../../ui/ui_fonts_pp.mjs');
    const bridge = await import('../../ui/ui_dsp_bridge.mjs');
    files[PB.PB_SHIPPED_DIR + '/phrases-open.pack'] = JSON.stringify({ v: 1, enc: false,
        chunks: { bass: JSON.stringify(LIBS.bass), hat: JSON.stringify(LIBS.hat) } });

    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
    const cc = (d1, d2) => midi(0xB0, d1, d2);
    const touch = (k, on) => midi(on ? 0x90 : 0x80, k, on ? 127 : 0);
    const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
    const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
    const jog = (d) => { cc(14, d > 0 ? 1 : 127); ticks(2); };
    const turn = (k, n) => { for (let i = 0; i < n; i++) cc(71 + k, 1); ticks(1); };
    function screen() {
        const printed = [];
        fonts.setKitTextTrace((t) => printed.push(String(t)));
        try { FB.fill(0); render.drawUI(); } finally { fonts.setKitTextTrace(null); }
        return { f: FB.slice(), text: printed };
    }
    const px = (f, x, y) => f[y * W + x];
    /* The door's corner brackets: drawBrackets(0, 10, 128, MV_FOOTER_Y - 11). */
    const TOP = 10, BOT = 10 + (kit.MV_FOOTER_Y - 11) - 1;
    const bracketed = (f) => px(f, 0, TOP) && px(f, 3, TOP) && px(f, 127, TOP) && px(f, 124, TOP)
                          && px(f, 0, BOT) && px(f, 127, BOT) && px(f, 0, TOP + 2) && px(f, 127, TOP + 2)
                          && !px(f, 4, TOP) && !px(f, 0, TOP + 3);
    const onBank = (t, b) => { S.activeTrack = t; S.activeBank = b; S.trackActiveBank[t] = b; };

    step('setup: track 2 melodic, track 1 drums, track 3 a Conductor', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE; S.trackPadMode[1] = C.PAD_MODE_DRUM;
        S.trackPadMode[3] = C.PAD_MODE_CONDUCT;
        S.padLayoutChord = [false, false, false, false, false, false, false, false];
        ticks(8);
    });

    step('⭐ SEQ opens on PHRASE: PHRASE, STEP, CLIP (melodic) and PHRASE, STEP, ALL LANES, DRUM LANE (drum); no Conductor has it', () => {
        const seq = (m) => P.bankCategoriesForMode(m, 2).find((g) => g.label === 'SEQ');
        assert(JSON.stringify(seq(C.PAD_MODE_MELODIC_SCALE).banks) === JSON.stringify([C.BANK_PHRASE, C.BANK_STEP, 0]), 'melodic SEQ ' + JSON.stringify(seq(0)));
        assert(JSON.stringify(seq(C.PAD_MODE_DRUM).banks) === JSON.stringify([C.BANK_PHRASE, C.BANK_STEP, 7, 0]), 'drum SEQ ' + JSON.stringify(seq(1)));
        assert(P.bankCycleForMode(C.PAD_MODE_CONDUCT, 3).indexOf(C.BANK_PHRASE) < 0, 'a Conductor has PHRASE');
        assert(P.bankDisplayName(0, C.BANK_PHRASE) === 'PHRASE' && P.bankDisplayName(C.PAD_MODE_DRUM, C.BANK_PHRASE) === 'PHRASE', 'name');
    });

    step('⭐⭐ THE GESTURE (melodic): latched on CLIP, two detents left walk STEP then PHRASE; the card is PHRASE LIBRARY in the brackets', () => {
        onBank(2, 0); S.bankCardLatched = true; ticks(2);
        jog(-1);
        assert(S.activeBank === C.BANK_STEP, 'one left of CLIP is not STEP: ' + S.activeBank);
        jog(-1);
        assert(S.activeBank === C.BANK_PHRASE, 'one left of STEP is not PHRASE: ' + S.activeBank);
        assert(S.bankCardLatched, 'the walk unlatched the card');
        ticks(20);                                    /* the bank map outlives the detent: let it go */
        const s = screen();
        assert(bracketed(s.f), 'no corner brackets on the card');
        assert(s.text.indexOf(render.PHRASE_CARD_TEXT) >= 0 && render.PHRASE_CARD_TEXT === 'PHRASE LIBRARY', 'text: ' + JSON.stringify(s.text));
        assert(s.text.indexOf('PHRASE') >= 0, 'the header does not name the bank: ' + JSON.stringify(s.text));
        assert(s.text.indexOf('OPEN') >= 0 && s.text.indexOf('OUT') >= 0, 'footer: ' + JSON.stringify(s.text));
        /* the words sit inside the box, centred */
        let x0 = 99, x1 = -1;
        for (let y = TOP + 2; y < BOT - 2; y++) for (let x = 2; x < 126; x++) if (px(s.f, x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        assert(x1 > 0 && Math.abs((x0 + x1) / 2 - 63.5) <= 2, 'not centred: ' + x0 + '..' + x1);
    });

    step('⭐⭐ a click on the latched card opens the browser for the active track', () => {
        assert(!PB.pbActive(), 'already open');
        click();
        assert(PB.pbActive() && PB.pbStateForTest().track === 2, 'the click did not open it on track 2');
    });

    step('⭐⭐ Back from the browser returns to the PHRASE card, still latched', () => {
        back();
        assert(!PB.pbActive(), 'Back did not close the browser');
        assert(S.activeBank === C.BANK_PHRASE && S.bankCardLatched, 'bank ' + S.activeBank + ' latched ' + S.bankCardLatched);
        assert(bracketed(screen().f), 'the card did not come back');
        back();
        assert(!S.bankCardLatched && S.activeBank === C.BANK_PHRASE, 'the second Back: latched ' + S.bankCardLatched + ' bank ' + S.activeBank);
    });

    step('⭐ from the overview: the first click latches the card, the second opens the browser (THE ONE LAW)', () => {
        assert(!S.bankCardLatched && !render.bankCardVisible(), 'not at the overview');
        click();
        assert(S.bankCardLatched && !PB.pbActive(), 'the first click: latched ' + S.bankCardLatched + ' open ' + PB.pbActive());
        click();
        assert(PB.pbActive(), 'the second click did not open it');
        back(); back();
    });

    step('⭐ the knobs on the PHRASE card send nothing, and their rings are dark', () => {
        onBank(2, C.BANK_PHRASE); S.bankCardLatched = true; ticks(6);
        const base = writes.length; ticks(4);
        const idle = new Set(writes.slice(base).map((w) => w.split('=')[0]));
        const n = writes.length;
        for (let k = 0; k < 8; k++) { touch(k, true); turn(k, 6); touch(k, false); ticks(1); }
        ticks(4);
        /* slot:parallel is the render pool's own bookkeeping, written on its
         * own clock whatever the knobs do */
        const fresh = writes.slice(n).filter((w) => !idle.has(w.split('=')[0]) && !/slot:parallel=/.test(w));
        assert(fresh.length === 0, 'a knob wrote: ' + JSON.stringify(fresh.slice(0, 5)));
        assert(!PB.pbActive() && S.activeBank === C.BANK_PHRASE, 'a knob moved something');
        for (let k = 71; k <= 78; k++) assert((ring[k] | 0) === 0, 'ring ' + k + ' lit: ' + ring[k]);
        /* positive control: the same turns on NOTE FX do write, and light the rings */
        onBank(2, 1); ticks(6);
        const m = writes.length;
        touch(0, true); turn(0, 6); touch(0, false); ticks(4);
        assert(writes.length > m, 'the control wrote nothing — the probe cannot see a write');
        assert([71, 72, 73, 74, 75, 76, 77, 78].some((k) => (ring[k] | 0) !== 0), 'the control lit no ring');
    });

    step('⭐ CLIP K6 is no longer the phrases trigger: no CLK PHRASES, and touch + click opens no browser', () => {
        onBank(2, 0); S.bankCardLatched = true; ticks(2);
        touch(5, true); ticks(1);
        const hints = render.bankPageHints(0);
        const s = screen();
        const k6 = ((kit.kitCellsForTest() || {}).cells || [])[5];
        click();
        touch(5, false); ticks(1);
        assert(!PB.pbActive(), 'K6 + click on CLIP opened the browser');
        /* K6 is CROP here (main's), not a phrases trigger. */
        assert(k6 && !/phrase/i.test(String(k6.label || '')), 'CLIP K6 is still the phrases trigger: ' + JSON.stringify(k6));
        assert(!JSON.stringify(hints).includes('PHRASES'), 'hints: ' + JSON.stringify(hints));
        assert(s.text.indexOf('Phrs') < 0 && s.text.indexOf('Phrases') < 0, 'CLIP still shows the Phrases cell: ' + JSON.stringify(s.text));
        S.bankCardLatched = false; ticks(2);
    });

    step('⭐ drum: latched on DRUM LANE, three detents left reach PHRASE; the click opens the browser on the drum track', () => {
        onBank(1, 0); S.bankCardLatched = true; ticks(2);
        touch(5, true); screen();
        const k6 = ((kit.kitCellsForTest() || {}).cells || [])[5];
        click(); touch(5, false); ticks(1);
        assert(!PB.pbActive(), 'K6 + click on DRUM LANE opened the browser');
        assert(k6 && !/phrase/i.test(String(k6.label || '')), 'DRUM LANE K6 is still the phrases trigger: ' + JSON.stringify(k6));
        const seen = [];
        for (let i = 0; i < 3; i++) { jog(-1); seen.push(S.activeBank); }
        assert(JSON.stringify(seen) === JSON.stringify([7, C.BANK_STEP, C.BANK_PHRASE]), 'left: ' + seen);
        ticks(20);
        assert(bracketed(screen().f), 'no card on the drum track');
        click();
        assert(PB.pbActive() && PB.pbStateForTest().drum && PB.pbStateForTest().track === 1, 'not opened on the drum track');
        back();
        assert(!PB.pbActive() && S.activeBank === C.BANK_PHRASE && S.bankCardLatched, 'Back: bank ' + S.activeBank);
        back();
    });

    step('⭐ the sidecar: a stored PHRASE comes back on a melodic or drum track, and falls to bank 0 on a Conductor', () => {
        const us = { v: 8, tab: [0, C.BANK_PHRASE, C.BANK_PHRASE, C.BANK_PHRASE, 0, 0, 0, 0] };
        globalThis.host_read_file = (p) => /ui-state\.json$/.test(p) ? JSON.stringify(us) : (files[p] || '');
        const fe = globalThis.host_file_exists;
        globalThis.host_file_exists = (p) => /ui-state\.json$/.test(p) || fe(p);
        const uuid = S.currentSetUuid;
        S.currentSetUuid = uuid || 'test-set-uuid';
        try {
            bridge.restoreUiSidecar(true);
        } finally {
            globalThis.host_read_file = (p) => files[p] || '';
            globalThis.host_file_exists = fe;
            S.currentSetUuid = uuid;
        }
        assert(S.trackActiveBank[2] === C.BANK_PHRASE, 'melodic: ' + S.trackActiveBank[2]);
        assert(S.trackActiveBank[1] === C.BANK_PHRASE, 'drum: ' + S.trackActiveBank[1]);
        assert(S.trackActiveBank[3] === 0, 'Conductor: ' + S.trackActiveBank[3]);
    });

    if (failed) { console.error('FAIL: the PHRASE bank'); process.exit(1); }
    console.log('PASS: the PHRASE bank opens the phrase library, and CLIP K6 is empty');
}
main().catch(e => { console.error(e); process.exit(1); });
