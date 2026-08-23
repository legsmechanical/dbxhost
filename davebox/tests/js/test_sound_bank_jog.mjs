/* tests/js/test_sound_bank_jog.mjs — SOUND + CONFIG is the bank past the last
 * clip bank on the jog.
 *
 * Josh, 2026-08-23: "add a new bank to all tracks that mirrors the track editor
 * menu called Sound & Config. When you land on the menu, continuing to scroll
 * scrolls through the track editor menu, jog click/back works like before. When
 * at the top level of the menu, scrolling left beyond the top level scrolls to
 * the preceding clip bank." Non-persisted; Conductor tracks excluded.
 *
 * Both halves fail SILENTLY: a right turn past AUTOMATION that does nothing is
 * indistinguishable from the clamp it replaced, and a left turn at the top of
 * the menu that clamps is exactly what the menu did before. So this drives
 * `globalThis.onMidiMessageInternal` + the real tick, and asserts the VIEW
 * changed, in both directions, for melodic and drum cycles — and does NOT for a
 * Conductor track.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

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
/* ⚠⚠ tick() swallows errors — a missing binding silently kills every later
 * stage, including the deferred sound-mode entry this file is about. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const { PAD_MODE_DRUM, PAD_MODE_CONDUCT, PAD_MODE_MELODIC_SCALE, BANK_WHEN } = await import('../../ui/ui_constants.mjs');

const send  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const right = () => { send(14, 1);   globalThis.tick(); };
const left  = () => { send(14, 127); globalThis.tick(); };

function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

/* Walk the menu cursor to its top row with left turns, asserting each one
 * stays INSIDE sound mode. Entry lands on the GENERATOR row (the block you
 * most likely came to edit), not row 0, so "the top" is a place to reach, not
 * the place you start. */
function toTop() {
    for (let guard = 0; guard < 16; guard++) {
        if (snd.soundPickStateForTest().row === 0) return;
        left();
        if (!snd.soundActive()) throw new Error('left turn BELOW the top row exited sound mode');
    }
    throw new Error('never reached the top row');
}

function reset(mode, bank) {
    if (snd.soundActive()) snd.soundExit();
    S.sessionView = false; S.globalMenuOpen = false;
    S.ledInitComplete = true;          /* the deferred entry lives past LED init */
    S.stateLoading = false; S.bootSplashTicks = 0; S.awaitingProjectSelect = false;
    S.loopHeld = false; S.shiftHeld = false;
    for (let t = 0; t < 8; t++) S.trackRoute[t] = 0;
    S.activeTrack = 2;
    S.trackPadMode[2] = mode;
    S.activeBank = bank; S.trackActiveBank[2] = bank;
    S.bankSelectTick = -1; S.jogTouched = false;
}

step('control: a right turn from CLIP moves to NOTE FX (the bank walk is live)', () => {
    reset(PAD_MODE_MELODIC_SCALE, 0);
    right();
    if (S.activeBank !== 1) throw new Error('bank did not step: ' + S.activeBank);
    if (snd.soundActive()) throw new Error('entered sound mode from CLIP');
});

step('⭑ melodic: right past AUTOMATION (6) enters SOUND + CONFIG', () => {
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();
    if (!snd.soundActive()) throw new Error('sound mode did not open');
    if (S.activeBank !== 6) throw new Error('activeBank moved off the last clip bank: ' + S.activeBank);
});

step('⭑ ...and the next right turn walks the menu, not the banks', () => {
    snd.soundTick();                   /* rows build on the tick after entry */
    const r0 = snd.soundPickStateForTest().row;
    right();
    const r1 = snd.soundPickStateForTest().row;
    if (!snd.soundActive()) throw new Error('sound mode closed on a right turn');
    if (r1 <= r0) throw new Error('cursor did not move down: ' + r0 + ' -> ' + r1);
    if (S.activeBank !== 6) throw new Error('the bank changed underneath: ' + S.activeBank);
});

step('⭑ left turns walk back up, and past the top row leave to the last clip bank', () => {
    toTop();
    left();
    if (snd.soundActive()) throw new Error('left turn at the top did not exit');
    if (S.activeBank !== 6) throw new Error('did not land on AUTOMATION: ' + S.activeBank);
    left();
    if (S.activeBank !== 5) throw new Error('bank walk did not resume leftward: ' + S.activeBank);
});

step('⭑ drum: right past CC PARAM (the end of BANK_CYCLE_DRUM) enters too', () => {
    reset(PAD_MODE_DRUM, 6);
    right();
    if (!snd.soundActive()) throw new Error('sound mode did not open on a drum track');
    snd.soundTick(); toTop();
    left();
    if (snd.soundActive()) throw new Error('left at the top did not exit on a drum track');
    if (S.activeBank !== 6) throw new Error('did not land on CC PARAM: ' + S.activeBank);
});

step('⚠ conductor: the cycle still ends at WHEN — no sound-mode bank', () => {
    reset(PAD_MODE_CONDUCT, BANK_WHEN);
    right();
    if (snd.soundActive()) throw new Error('a Conductor track entered sound mode from the jog');
    if (S.activeBank !== BANK_WHEN) throw new Error('bank moved: ' + S.activeBank);
});

step('⚠ Shift+Note entry is unchanged: left at the top still exits (same door, same way out)', () => {
    reset(PAD_MODE_MELODIC_SCALE, 3);
    S.pendingSoundEnterTrack = 2; globalThis.tick(); snd.soundTick();
    if (!snd.soundActive()) throw new Error('control: deferred entry did not open');
    toTop();
    left();
    if (snd.soundActive()) throw new Error('left at the top did not exit');
    if (S.activeBank !== 3) throw new Error('landed on the wrong bank: ' + S.activeBank);
});

step('⚠ a GLOBAL bus keeps its clamp: left at the top does not exit', () => {
    reset(PAD_MODE_MELODIC_SCALE, 0);
    S.sessionView = true;
    snd.soundEnterBuses(); snd.soundTick();
    /* open the first bus (Master) */
    send(3, 127); snd.soundTick(); globalThis.tick();
    if (!snd.soundIsGlobal()) throw new Error('control: not on a global bus');
    for (let i = 0; i < 12; i++) left();
    if (!snd.soundActive()) throw new Error('a global bus exited on a left turn');
    snd.soundExit(); S.sessionView = false;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
