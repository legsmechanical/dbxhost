/* THE JOG IS THE BANK PICKER in track view (Josh, 2026-08-25). A turn opens the
 * kit's list overlay over the page you were on, turns move a selection, and
 * letting go of the jog TOUCH commits. Shift+jog goes back to stepping tracks.
 *
 * ⚠ A turn is TOUCH, turn, RELEASE — you cannot turn the wheel without touching
 * it, which is what lets the gesture commit without a modifier. A test that
 * sends the CC alone leaves the gesture unfinished and nothing lands.
 *
 * ⚠⚠ Nothing may be applied while browsing. The old walk applied every step as
 * it passed: it read a bank's params on each detent and ENTERED sound mode the
 * moment it reached SOUND + CONFIG, so a scroll across the strip did all of
 * that on the way. "Browsing past" must not mean "choosing".
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.host_register_primary = () => true;
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.text_width = (t) => String(t).length * 6;
/* ⚠⚠ tick() swallows errors — a missing binding kills every later stage. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANK_SOUND } = await import('../../ui/ui_constants.mjs');
const { bankCycleForMode } = await import('../../ui/ui_pure.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0x90, d1, d2]));
const shift = (on) => cc(49, on ? 127 : 0);
const touch = (on) => note(9, on ? 127 : 0);      /* MoveMainTouch = note 9 */
const jog   = (d) => cc(14, d > 0 ? 1 : 127);
/* One complete turn of the wheel: touch, detent, release. */
const turn  = (d) => { touch(true); jog(d); globalThis.tick(); touch(false); globalThis.tick(); };

function reset() {
    S.sessionView = false; S.globalMenuOpen = false;
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
    S.awaitingProjectSelect = false; S.loopHeld = false; S.shiftHeld = false;
    S.bankPickerSel = -1; S.bankPickerIdleTick = -1; S.bankCardLatched = false;
    S.activeTrack = 2; S.activeBank = 0;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackPadMode[t] = 0; S.trackActiveBank[t] = 0; }
    if (!S.bankParams) S.bankParams = Array.from({ length: 8 }, () =>
        Array.from({ length: 12 }, () => new Array(8).fill(0)));
}

step('⭑ a jog turn opens the picker and does NOT change the bank yet', () => {
    reset();
    touch(true); jog(1); globalThis.tick();
    if (S.bankPickerSel < 0) throw new Error('the picker did not open on the turn');
    if (S.activeBank !== 0)
        throw new Error('the bank changed to ' + S.activeBank + ' while browsing');
    touch(false); globalThis.tick();
});

step('⭑ letting go of the jog COMMITS the selection', () => {
    reset();
    const cyc = bankCycleForMode(0);
    touch(true); jog(1); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    if (S.activeBank === want) throw new Error('control: it applied before the release');
    touch(false); globalThis.tick();
    if (S.activeBank !== want) throw new Error('landed on ' + S.activeBank + ', expected ' + want);
    if (S.trackActiveBank[2] !== want)
        throw new Error('the per-track record did not follow: ' + S.trackActiveBank[2]);
    if (S.bankPickerSel >= 0) throw new Error('the picker stayed open after the release');
});

step('⭑ the picked bank LINGERS on screen — the release must not wipe its window', () => {
    /* The jog-touch release also stands the bank display down. On a commit that
     * would make the bank you just chose vanish as you let go. */
    reset();
    turn(1);
    if (S.bankSelectTick < 0)
        throw new Error('the release cleared the display window — the picked bank ' +
                        'never gets shown');
});

step('⭑ picking SOUND + CONFIG enters it, and keeps its display window', () => {
    reset();
    const cyc = bankCycleForMode(0);
    touch(true);
    for (let i = 0; i < cyc.length; i++) jog(1);      /* to the end = SOUND + CONFIG */
    globalThis.tick();
    if (cyc[S.bankPickerSel] !== BANK_SOUND) throw new Error('control: not on SOUND + CONFIG');
    if (snd.soundActive()) throw new Error('it entered while merely scrolling past');
    touch(false); globalThis.tick();
    if (!snd.soundActive()) throw new Error('the release did not open the screen');
    if (S.bankSelectTick < 0)
        throw new Error('the deferred entry lost its display window');
    snd.soundExit();
});

step('⚠ a touchless turn still commits, on settle — the overlay cannot strand', () => {
    /* The capacitive read can miss a flick and the remote UI has no wheel; a
     * picker with no way to close would swallow the jog forever. */
    reset();
    jog(1); globalThis.tick();                        /* no touch at all */
    if (S.bankPickerSel < 0) throw new Error('control: the picker did not open');
    S.tickCount += 500; globalThis.tick();
    if (S.bankPickerSel >= 0) throw new Error('the picker never settled — it is stranded');
    if (S.activeBank === 0) throw new Error('settling did not apply the selection');
});

step('⚠ SHIFT+jog steps the TRACK again — the picker is the unshifted turn', () => {
    reset();
    shift(true); jog(1); globalThis.tick();
    if (S.bankPickerSel >= 0) throw new Error('Shift+jog opened the picker');
    if (S.activeTrack !== 3) throw new Error('the track did not step: ' + S.activeTrack);
    shift(false); globalThis.tick();
});

step('⭑ Shift + jog CLICK latches the bank card; Back unlatches and dismisses', () => {
    reset();
    turn(1);                                          /* land on a bank */
    shift(true); cc(3, 127); cc(3, 0); globalThis.tick(); shift(false);
    if (!S.bankCardLatched) throw new Error('Shift+click did not latch');
    S.tickCount += 500; globalThis.tick();
    if (S.bankSelectTick < 0)
        throw new Error('the card stood down while latched — the latch is the one ' +
                        'thing that stops it');
    const bankBefore = S.activeBank;
    cc(51, 127); cc(51, 0); globalThis.tick();        /* Back */
    if (S.bankCardLatched) throw new Error('Back did not unlatch');
    if (S.bankSelectTick >= 0) throw new Error('Back did not dismiss to the overview');
    if (S.activeBank !== bankBefore)
        throw new Error('Back MOVED the bank to ' + S.activeBank + ' — it dismisses the ' +
                        'screen now, it does not change where you are');
});

step('⭑ a drum track offers ITS cycle, not the melodic one', () => {
    reset();
    S.trackPadMode[2] = 1;                            /* PAD_MODE_DRUM */
    const cyc = bankCycleForMode(1);
    touch(true); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    touch(false); globalThis.tick();
    if (S.activeBank !== want)
        throw new Error('landed on ' + S.activeBank + ', not the drum cycle step ' + want);
    S.trackPadMode[2] = 0;
});

step('⚠ Shift + a TOP-row pad no longer jumps to a bank (retired)', () => {
    /* The jog is the picker now; a second door addressed by pad POSITION, with
     * three parallel pad maps to keep in lockstep, is exactly what it replaced. */
    reset();
    S.activeBank = 3;
    shift(true);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 92, 127]));   /* top-row pad 0 */
    globalThis.tick();
    shift(false); globalThis.tick();
    if (S.activeBank !== 3)
        throw new Error('Shift+top-pad still moved the bank to ' + S.activeBank);
});

step('⚠ ...and Shift + a BOTTOM-row pad still selects the track', () => {
    /* The control for the step above: the pad path is alive, so "nothing
     * happened" up there is the retirement and not a dead handler. */
    reset();
    shift(true);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 68 + 5, 127]));  /* track 6 */
    globalThis.tick();
    shift(false); globalThis.tick();
    if (S.activeTrack !== 5)
        throw new Error('Shift+bottom-pad did not select the track: ' + S.activeTrack);
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
