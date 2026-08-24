/* tests/js/test_menu_no_wrap.mjs — settings values CLAMP, never wrap (Josh,
 * 2026-08-23: "All items in global settings and track settings menu and
 * submenu: DO NOT loop values around when scrolling them. Scrolling stops at
 * the beginning and end of lists.")
 *
 * The failure is a UX one and perfectly silent in code: a wrap looks like a
 * successful step. Covered at three depths — the shared menu_nav machinery
 * (unit), davebox's own global-menu edit branch (real dispatch), and source
 * pins for the two sound-mode sites whose state is module-private
 * (slotCfgStep, the Instrument picker). The pins also stand guard against a
 * NEW `% opts.length` wrap creeping into either file. */

import { readFileSync } from 'fs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const nav = await import('/data/UserData/schwung/shared/menu_nav.mjs');

const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));

step('menu_nav: an enum edit clamps at the TOP of its list', () => {
    const item = { type: 'enum', options: ['A', 'B', 'C'] };
    const state = { editing: true, editValue: 'C', selectedIndex: 0 };
    nav.handleMenuInput({ cc: 14, value: 1, items: [item], state, stack: [], onBack: () => {} });
    if (state.editValue !== 'C') throw new Error('wrapped past the end to ' + state.editValue);
});
step('menu_nav: ...and at the BOTTOM', () => {
    const item = { type: 'enum', options: ['A', 'B', 'C'] };
    const state = { editing: true, editValue: 'A', selectedIndex: 0 };
    nav.handleMenuInput({ cc: 14, value: 127, items: [item], state, stack: [], onBack: () => {} });
    if (state.editValue !== 'A') throw new Error('wrapped past the start to ' + state.editValue);
});
step('menu_nav: an interior step still moves (clamp is not a freeze)', () => {
    const item = { type: 'enum', options: ['A', 'B', 'C'] };
    const state = { editing: true, editValue: 'B', selectedIndex: 0 };
    nav.handleMenuInput({ cc: 14, value: 1, items: [item], state, stack: [], onBack: () => {} });
    if (state.editValue !== 'C') throw new Error('interior step did not move: ' + state.editValue);
});

step('global menu (real dispatch): enum edit clamps both ways', () => {
    S.ledInitComplete = true;
    S.stateLoading = false; S.bootSplashTicks = 0; S.awaitingProjectSelect = false;
    S.sessionView = false;
    S.globalMenuOpen = true;
    S.globalMenuItems = [{ type: 'enum', options: ['X', 'Y', 'Z'], label: 'T' }];
    /* ensureGlobalMenuFresh rebuilds the item list on the first jog after a
     * track change and would clobber this seed — mark it fresh. */
    S.globalMenuBuiltForTrack = S.activeTrack;
    /* globalMenuState is built lazily on menu open — seed it whole. */
    S.globalMenuState = { editing: true, selectedIndex: 0, editValue: 'Z', scrollOffset: 0 };
    cc(14, 1);                    /* +1 at the end */
    if (S.globalMenuState.editValue !== 'Z')
        throw new Error('wrapped past the end to ' + S.globalMenuState.editValue);
    cc(14, 127); cc(14, 127); cc(14, 127);   /* -3: Z -> Y -> X -> clamp */
    if (S.globalMenuState.editValue !== 'X')
        throw new Error('expected X after stepping down, got ' + S.globalMenuState.editValue);
    S.globalMenuState = null; S.globalMenuOpen = false;
});

step('session mixer banks (real dispatch): the mode list clamps both ways', () => {
    /* Josh, 2026-08-24: "Session view mixer banks should not loop around when
     * scrolling through them. Hard stop at beginning and end." Same law as the
     * settings enums above — four modes (Volume / Pan / Send A / Send B) walked
     * by the jog, and the wrap made the last one look like the first.
     *
     * ⭑ POSITIVE CONTROL first: an interior step must still move, or a clamp
     * test passes just as well against a jog that does nothing at all. */
    S.ledInitComplete = true;
    S.globalMenuOpen = false;
    S.sessionView = true;
    S.shiftHeld = false;
    S.sessKnobMode = 1;
    cc(14, 1);
    if (S.sessKnobMode !== 2)
        throw new Error('control failed: an interior step did not move (' + S.sessKnobMode + ')');

    S.sessKnobMode = 3;                       /* SEND B, the last mode */
    cc(14, 1);
    if (S.sessKnobMode !== 3)
        throw new Error('wrapped past SEND B to mode ' + S.sessKnobMode);

    S.sessKnobMode = 0;                       /* VOLUME, the first */
    cc(14, 127);                              /* -1 detent */
    if (S.sessKnobMode !== 0)
        throw new Error('wrapped below VOLUME to mode ' + S.sessKnobMode);
    S.sessionView = false;
});

step('⚠ a CLAMPED mixer turn must not discard the level cache (the flicker)', () => {
    /* The clamp's own regression, found by Josh on device the day it landed:
     * the branch invalidated all eight cached levels on EVERY turn, which was
     * harmless while it wrapped (a turn always changed the mode, so the cache
     * was genuinely stale) and destructive once it clamped — a track with no
     * level draws no widget, so each blocked detent wiped the page and let the
     * poll paint it back. The OLED flickered at both ends of the list.
     *
     * ⭑ POSITIVE CONTROL first: a REAL change must still invalidate, or this
     * passes just as well against the invalidator deleted outright. */
    S.ledInitComplete = true;
    S.globalMenuOpen = false;
    S.sessionView = true;
    S.shiftHeld = false;

    S.sessKnobMode = 1;
    S.sessVolLevel.fill(0.5);
    cc(14, 1);                                /* 1 -> 2: a real step */
    if (S.sessVolLevel[0] !== -1)
        throw new Error('control failed: a real mode change no longer re-reads the levels');

    S.sessKnobMode = 3;                       /* SEND B, clamped */
    S.sessVolLevel.fill(0.5);
    cc(14, 1);
    if (S.sessVolLevel.some((v) => v === -1))
        throw new Error('a clamped turn at the END wiped the level cache — the mixer flickers');

    S.sessKnobMode = 0;                       /* VOLUME, clamped */
    S.sessVolLevel.fill(0.5);
    cc(14, 127);
    if (S.sessVolLevel.some((v) => v === -1))
        throw new Error('a clamped turn at the START wiped the level cache — the mixer flickers');
    S.sessionView = false;
});

step('source pin: the mixer mode walk does not modulo again (ui_input_cc)', () => {
    const src = readFileSync('ui/ui_input_cc.mjs', 'utf8');
    if (/sessKnobMode[^;]*%\s*4/.test(src))
        throw new Error('the mixer mode walk wraps again');
});

step('source pins: no % wrap in slotCfgStep / Instrument picker (ui_sound)', () => {
    const src = readFileSync('ui/ui_sound.mjs', 'utf8');
    if (/% s\.opts\.length/.test(src)) throw new Error('slotCfgStep wraps again');
    if (/% opts\.length/.test(src)) throw new Error('an opts wrap returned to ui_sound');
});
step('source pin: the global-menu enum branch does not wrap (ui_input_cc)', () => {
    const src = readFileSync('ui/ui_input_cc.mjs', 'utf8');
    if (/% opts\.length/.test(src)) throw new Error('the enum edit wraps again');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
