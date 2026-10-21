import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_pick_returns_to_menu.mjs — where a module pick LANDS.
 *
 * Josh, 2026-10-21: "Don't automatically enter a module's editor after
 * selecting it from the module list on the track config menu (do continue to
 * enter the editor immediately after selecting from the list through the pad
 * map path, though)".
 *
 * The REAL gestures, both doors:
 *   TRACK CONFIG — click an empty FX row, Shift + click a full one, Shift +
 *                  click the Instrument row: the pick lands on the MENU, on
 *                  the row just filled;
 *   the bank map — an FX pad or the INSTRUMENT pad on an empty block: the
 *                  pick enters the module's EDITOR, as before.
 */
import './_bulk_get_stub.mjs';
import * as os from 'os';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

const loaded = {};                       /* comp -> module id (one slot is enough) */
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k !== 'string') return '';
    const m = k.match(/^(.*):module$/);
    if (m) return loaded[m[1]] || '';
    if (/fx[1-4]:bypassed$/.test(k)) return '0';
    return '';
};
globalThis.shadow_set_param = (slot, k, v) => {
    if (typeof k !== 'string') return 0;
    const m = k.match(/^(.*):module$/);
    if (m) { if (v) loaded[m[1]] = String(v); else delete loaded[m[1]]; }
    return 1;
};

const FX_DIR = '/data/UserData/schwung/modules/audio_fx';
const CATALOGUE = { chorus: 'Chorus', delay: 'Delay', reverb: 'Reverb' };
os.__setReaddir({ [FX_DIR]: Object.keys(CATALOGUE) });
globalThis.host_read_file = (p) => {
    const m = String(p).match(/audio_fx\/([^/]+)\/module\.json$/);
    return m && CATALOGUE[m[1]]
        ? JSON.stringify({ id: m[1], name: CATALOGUE[m[1]], component_type: 'audio_fx' }) : '';
};
for (const fn of ['host_system_cmd', 'host_module_set_param', 'host_vol_block', 'host_edit_cc_block',
                  'move_midi_internal_send', 'set_led', 'stipple_rect', 'draw_line', 'flush_display',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'clear_screen', 'print',
                  'fill_rect', 'draw_rect', 'set_pixel'])
    globalThis[fn] = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_get_param = () => '';
globalThis.host_module_set_params = () => true;
globalThis.shadow_save_state_now = () => true;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
snd.soundSetGeneratorScanForTest(() => [{ id: 'nusaw', name: 'NuSaw' }, { id: 'obxd', name: 'OB-Xd' }]);

function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const pad = (n) => { globalThis.onMidiMessageInternal(new Uint8Array([0x90, n, 100])); globalThis.onMidiMessageInternal(new Uint8Array([0x80, n, 0])); };
const JOG = 14, CLICK = 3;
const VIEW_BLOCKS = 0, VIEW_EDIT = 1;
const view = () => snd.soundPickStateForTest().view;

function openMenu() {
    if (snd.soundActive()) { snd.soundExit(); ticks(2); }
    openTrackConfigViaMap();
    ticks(6);
    if (view() !== VIEW_BLOCKS) throw new Error('the sound menu did not open');
}
function jogMenuTo(pred, what) {
    for (let g = 0; g < 40; g++) {
        const st = snd.soundPickStateForTest();
        const want = st.kinds.findIndex((k, i) => pred(k, st.comps[i]));
        if (want < 0) throw new Error('no ' + what + ' row on the menu: ' + JSON.stringify(st.kinds));
        if (st.row === want) return;
        cc(JOG, st.row < want ? 1 : 127); ticks(1);
    }
    throw new Error('the jog never reached ' + what);
}
const click = () => { cc(CLICK, 127); cc(CLICK, 0); ticks(4); };
const shiftClick = () => { cc(MoveShift, 127); cc(CLICK, 127); cc(CLICK, 0); cc(MoveShift, 0); ticks(4); };
function browsePick(name) {
    const b = snd.soundBrowseStateForTest();
    if (!b.browsing) throw new Error('the module list is not open');
    for (let g = 0; g < 40; g++) {
        const c = snd.soundBrowseStateForTest();
        const want = c.names.indexOf(name);
        if (want < 0) throw new Error('no "' + name + '" row: ' + JSON.stringify(c.names));
        if (c.idx === want) break;
        cc(JOG, c.idx < want ? 1 : 127); ticks(1);
    }
    click(); ticks(4);
}
function instrPick(name) {
    const p = snd.soundEnumPickForTest();
    if (!p) throw new Error('the Instrument picker is not open');
    const want = p.options.indexOf(name);
    if (want < 0) throw new Error(name + ' is not offered: ' + JSON.stringify(p.options));
    for (let g = 0; g < p.options.length + 2 && snd.soundEnumPickForTest().sel !== want; g++)
        cc(JOG, snd.soundEnumPickForTest().sel < want ? 1 : 127);
    click(); ticks(8);
}
/* The bank map's module pads (BANK_MAP_MODULE_PADS): FX 1 = col 7 row 0,
 * INSTRUMENT = col 6 row 1; note = 68 + (3 - row) * 8 + col. */
function mapPad(note) {
    if (snd.soundActive()) { snd.soundExit(); ticks(2); }
    cc(3, 127); ticks(2);
    pad(note); cc(3, 0); ticks(8);
}
const FX1_PAD = 68 + 3 * 8 + 7, INSTR_PAD = 68 + 2 * 8 + 6;

step('setup: track 1, a Schwung track with nothing loaded', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 0; S.trackRoute[0] = 0; S.trackChannel[0] = 1;
    ticks(8);
});

step('⭐ TRACK CONFIG: click an empty FX row, pick → back on the MENU, on that row (not the editor)', () => {
    openMenu();
    jogMenuTo((k, c) => k === 'block' && c === 'fx1', 'FX 1');
    click();
    browsePick('Delay');
    if (loaded.fx1 !== 'delay') throw new Error('the pick did not load: ' + JSON.stringify(loaded));
    if (view() !== VIEW_BLOCKS) throw new Error('the pick entered the editor (view ' + view() + ')');
    const st = snd.soundPickStateForTest();
    if (st.comps[st.row] !== 'fx1') throw new Error('the cursor is not on FX 1: ' + st.comps[st.row]);
});

step('TRACK CONFIG: Shift + click a full FX row (change it), pick → back on the menu', () => {
    shiftClick();
    browsePick('Reverb');
    if (loaded.fx1 !== 'reverb') throw new Error('the change did not load');
    if (view() !== VIEW_BLOCKS) throw new Error('the change entered the editor (view ' + view() + ')');
});

step('CONTROL: a plain click on a FULL row still opens its editor (that is editing, not picking)', () => {
    click(); ticks(4);
    if (view() !== VIEW_EDIT) throw new Error('a click on a loaded FX did not open its editor (view ' + view() + ')');
});

step('⭐ TRACK CONFIG: the Instrument row, pick a generator → back on the menu, on Instrument', () => {
    openMenu();
    jogMenuTo((k) => k === 'trackto', 'Instrument');
    click();                                       /* nothing loaded: the click IS the picker */
    instrPick('NuSaw');
    if (loaded.synth !== 'nusaw') throw new Error('the generator did not load: ' + JSON.stringify(loaded));
    if (view() !== VIEW_BLOCKS) throw new Error('the pick entered the editor (view ' + view() + ')');
    const st = snd.soundPickStateForTest();
    if (st.kinds[st.row] !== 'trackto') throw new Error('the cursor is not on Instrument: ' + st.kinds[st.row]);
});

step('TRACK CONFIG: re-picking the LOADED generator closes the picker onto the menu', () => {
    shiftClick();
    instrPick('[NuSaw]');                           /* the loaded one is bracketed */
    if (view() !== VIEW_BLOCKS) throw new Error('re-picking entered the editor (view ' + view() + ')');
});

step('⭐ the bank map: the FX 2..4 pad on an empty block, pick → the EDITOR, as before', () => {
    delete loaded.fx1;
    mapPad(FX1_PAD);
    if (!snd.soundBrowseStateForTest().browsing) throw new Error('the FX 1 pad on an empty block did not open the module list');
    browsePick('Chorus');
    if (loaded.fx1 !== 'chorus') throw new Error('the pick did not load');
    if (view() !== VIEW_EDIT) throw new Error('a pick from the map did not enter the editor (view ' + view() + ')');
});

step('⭐ the bank map: the INSTRUMENT pad with nothing loaded, pick → the EDITOR', () => {
    delete loaded.synth;
    mapPad(INSTR_PAD);
    instrPick('OB-Xd');
    if (loaded.synth !== 'obxd') throw new Error('the generator did not load: ' + JSON.stringify(loaded));
    if (view() !== VIEW_EDIT) throw new Error('a pick from the map did not enter the editor (view ' + view() + ')');
});

if (failed) { console.log('FAIL: test_pick_returns_to_menu'); process.exit(1); }
console.log('PASS: test_pick_returns_to_menu');
}
main().catch(e => { console.error(e); process.exit(1); });
