/* Shift + jog in TRACK VIEW browses the track's banks in the kit's list
 * overlay, and commits on the Shift release (Josh, 2026-08-25). It used to step
 * the active TRACK; that meaning moved to Shift + the bottom pad row.
 *
 * ⚠⚠ The trap this file exists for: Shift+jog still MEANS "step the track" in
 * session view, in sound mode's menu, and in the global menu — and a track step
 * EXITS sound mode. So a per-turn test of "am I in track view" flips mid-hold
 * and drops the rest of one continuous scroll into the picker. The meaning is
 * latched per HOLD, and the sound-mode scroll test is what caught it.
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
const shift = (on) => cc(49, on ? 127 : 0);
const jog   = (d) => cc(14, d > 0 ? 1 : 127);

function reset() {
    S.sessionView = false; S.globalMenuOpen = false;
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
    S.awaitingProjectSelect = false; S.loopHeld = false; S.shiftHeld = false;
    S.shiftJogMode = 0; S.bankPickerSel = -1;
    S.activeTrack = 2; S.activeBank = 0;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackPadMode[t] = 0; S.trackActiveBank[t] = 0; }
    if (!S.bankParams) S.bankParams = Array.from({ length: 8 }, () =>
        Array.from({ length: 12 }, () => new Array(8).fill(0)));
}

step('⭑ Shift+jog opens the picker and does NOT step the track', () => {
    reset();
    shift(true); jog(1); globalThis.tick();
    if (S.activeTrack !== 2)
        throw new Error('the track moved to ' + S.activeTrack + ' — that gesture is Shift+pad now');
    if (S.bankPickerSel < 0) throw new Error('the picker did not open');
});

step('⭑ browsing applies NOTHING until the Shift release', () => {
    /* Passing over AUTOMATION or SOUND + CONFIG has side effects — a bank read,
     * entering a screen — so browsing past something must not do the thing. */
    reset();
    shift(true);
    jog(1); jog(1); globalThis.tick();
    if (S.activeBank !== 0)
        throw new Error('the bank changed while browsing: ' + S.activeBank);
    if (S.pendingSoundEnterTrack >= 0)
        throw new Error('browsing queued a sound-mode entry');
});

step('⭑ the Shift release commits the selected bank', () => {
    reset();
    const cyc = bankCycleForMode(0);
    shift(true); jog(1); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    shift(false); globalThis.tick();
    if (S.activeBank !== want)
        throw new Error('landed on ' + S.activeBank + ', expected ' + want);
    if (S.trackActiveBank[2] !== want)
        throw new Error('the per-track record did not follow: ' + S.trackActiveBank[2]);
    if (S.bankPickerSel >= 0) throw new Error('the picker stayed open after the release');
});

step('⭑ picking SOUND + CONFIG enters it, and keeps its display window', () => {
    /* BANKS[11] draws nothing on its own, so the pick has to queue the ENTRY —
     * and the Shift-release edge clears bankSelectTick, which that deferred
     * entry needs. Both halves are the bug this pins. */
    reset();
    const cyc = bankCycleForMode(0);
    shift(true);
    for (let i = 0; i < cyc.length; i++) jog(1);        /* to the end = SOUND + CONFIG */
    globalThis.tick();
    if (cyc[S.bankPickerSel] !== BANK_SOUND) throw new Error('control: not on SOUND + CONFIG');
    shift(false); globalThis.tick();
    /* ⚠ The tick CONSUMES the queued entry, so asserting on pendingSoundEnterTrack
     * after it is asserting on a field that is already back to -1. Ask whether
     * the screen actually opened — that is what the pick was for.
     * (The first version of this line read `!S.bankPickerSel < 0`, which parses
     * as `(!x) < 0` and can never be true: an assertion that cannot fail.) */
    if (!snd.soundActive())
        throw new Error('picking SOUND + CONFIG did not open the screen');
    if (S.bankSelectTick < 0)
        throw new Error('the Shift edge wiped the display window — the deferred ' +
                        'entry loses the window the bank walk arms for it');
    snd.soundExit();
});

step('⚠ SESSION VIEW still steps the track — the gesture is unchanged there', () => {
    reset();
    S.sessionView = true;
    shift(true); jog(1); globalThis.tick();
    if (S.bankPickerSel >= 0) throw new Error('the picker opened in session view');
    if (S.activeTrack !== 3) throw new Error('the track did not step: ' + S.activeTrack);
    shift(false); globalThis.tick();
    S.sessionView = false;
});

step('⭑⭑ the meaning is latched per HOLD, not re-decided per turn', () => {
    /* The regression that bit during the build: a track step exits sound mode,
     * so a second turn of the SAME hold saw "track view" and opened the picker,
     * eating the rest of one continuous scroll. */
    reset();
    S.sessionView = true;                 /* start where the gesture means TRACK */
    shift(true);
    jog(1); globalThis.tick();
    S.sessionView = false;                /* the world changes mid-hold */
    jog(1); globalThis.tick();
    if (S.bankPickerSel >= 0)
        throw new Error('the hold changed meaning halfway — the rest of the scroll ' +
                        'went into the picker');
    if (S.activeTrack !== 4)
        throw new Error('the second turn did not step the track: ' + S.activeTrack);
    shift(false); globalThis.tick();
});

step('⭑ a drum track offers ITS cycle, not the melodic one', () => {
    reset();
    S.trackPadMode[2] = 1;                /* PAD_MODE_DRUM */
    S.activeBank = 0;
    const cyc = bankCycleForMode(1);
    shift(true); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    shift(false); globalThis.tick();
    if (S.activeBank !== want)
        throw new Error('landed on ' + S.activeBank + ' which is not the drum cycle step');
    S.trackPadMode[2] = 0;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
