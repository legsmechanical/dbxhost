/* tests/js/test_one_shot_triggers.mjs — one-shot knob actions fire the stock
 * way: TOUCH the knob and CLICK the jog, with the button's flash; a turn does
 * nothing (Josh, 2026-09-23). Legato on the CLIP bank (melodic) and on the
 * DRUM LANE bank, through the real handlers, reading what the engine is sent
 * and what the screen draws. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
for (const fn of ['host_system_cmd', 'host_write_file', 'host_ensure_dir', 'host_remove_dir',
    'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'clear_screen', 'print', 'fill_rect', 'draw_rect', 'stipple_rect', 'draw_line',
    'set_pixel', 'flush_display', 'move_midi_internal_send', 'move_midi_inject_to_move', 'set_led',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi'])
    globalThis[fn] = () => 0;
globalThis.host_module_set_param = (k, v) => { sets.push([k, String(v)]); return 0; };
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
ticks(3);
function screenText() {
    const out = [];
    fonts.setKitTextTrace((t) => out.push(t));
    try { globalThis.clear_screen(); render.drawUI(); } finally { fonts.setKitTextTrace(null); }
    return out;
}
const cc = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, n, v]));
const touch = (k, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, k, on ? 127 : 0]));
const click = () => { cc(3, 127); cc(3, 0); };
const lgtoSets = () => sets.filter((s) => /_lgto_apply$/.test(s[0]));

S.trackPadMode[0] = PAD_MODE_DRUM;                       /* the default kit track */
for (const [label, t, key] of [['melodic CLIP bank', 2, /^t2_lgto_apply$/], ['DRUM LANE bank', 0, /^t0_l\d+_lgto_apply$/]]) {
    step(`⭐ ${label}: turning Legato's knob does NOTHING — no apply, no dialog`, () => {
        S.activeTrack = t; S.activeBank = 0; S.bankCardLatched = true; ticks(1);
        if (t === 0) assert(S.trackPadMode[0] === PAD_MODE_DRUM, 't0 is not a drum track');
        sets.length = 0;
        touch(3, true); for (let i = 0; i < 6; i++) cc(74, 20); touch(3, false); ticks(1);
        assert(lgtoSets().length === 0, 'a turn applied legato: ' + JSON.stringify(lgtoSets()));
        assert(!S.confirmLgto, 'a turn raised a dialog');
    });
    step(`⭐ ${label}: touching it frames it as a click and the footer says CLK LEGATO`, () => {
        touch(3, true); ticks(1);
        const txt = screenText();
        assert(txt.includes('CLK') && txt.includes('LEGATO'), 'footer: ' + JSON.stringify(txt.slice(-8)));
        touch(3, false); ticks(1);
        assert(!screenText().includes('LEGATO'), 'the hint outlived the touch');
    });
    step(`⭐ ${label}: touch + click applies legato ONCE, and the button flashes`, () => {
        sets.length = 0;
        touch(3, true); click(); ticks(1);
        const l = lgtoSets();
        assert(l.length === 1 && key.test(l[0][0]), 'applied ' + JSON.stringify(l));
        assert(S.triggerFlashUntil > S.clockMs - 1000, 'no flash armed');
        touch(3, false); ticks(1);
    });
    step(`${label}: a click with Legato NOT touched does not apply it`, () => {
        sets.length = 0;
        touch(2, true); click(); touch(2, false); ticks(1);
        click(); ticks(1);
        assert(lgtoSets().length === 0, 'applied without the touch');
        S.bankCardLatched = false;
    });
}

if (failed) process.exit(1);
console.log('test_one_shot_triggers: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
