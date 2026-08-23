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
const { computePadNoteMap } = await import('../../ui/ui_drummodel.mjs');
const constsMod = await import('../../ui/ui_constants.mjs');
const ledsMod = await import('../../ui/ui_leds.mjs');
const ifMod = await import('/data/UserData/schwung/shared/input_filter.mjs');
const persistMod = await import('../../ui/ui_persistence.mjs');
const { PAD_MODE_DRUM, PAD_MODE_CONDUCT, PAD_MODE_MELODIC_SCALE, BANK_WHEN, BANK_SOUND } = constsMod;

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
    /* LED paths read bankParams, which init() builds on-device only */
    if (!S.bankParams)
        S.bankParams = Array.from({ length: 8 }, () =>
            Array.from({ length: 11 }, () => new Array(8).fill(0)));
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
    /* The screen IS a bank (Josh, 2026-08-23): activeBank takes the BANK_SOUND
     * identity so every bank-keyed behaviour runs its standard branch; the
     * origin waits in trackActiveBank for the exit landing. */
    if (S.activeBank !== BANK_SOUND) throw new Error('activeBank did not take the sound identity: ' + S.activeBank);
    if (S.trackActiveBank[2] !== 6) throw new Error('the origin bank was not preserved: ' + S.trackActiveBank[2]);
});

step('⭑ ...and the next right turn walks the menu, not the banks', () => {
    snd.soundTick();                   /* rows build on the tick after entry */
    const r0 = snd.soundPickStateForTest().row;
    right();
    const r1 = snd.soundPickStateForTest().row;
    if (!snd.soundActive()) throw new Error('sound mode closed on a right turn');
    if (r1 <= r0) throw new Error('cursor did not move down: ' + r0 + ' -> ' + r1);
    if (S.activeBank !== BANK_SOUND) throw new Error('the identity was lost underneath: ' + S.activeBank);
    if (S.trackActiveBank[2] !== 6) throw new Error('the origin bank drifted: ' + S.trackActiveBank[2]);
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
    /* This entry has NO jog behind it, so soundEnter itself must arm the
     * display window — without that the screen yields to the overview on the
     * very first frame and Shift+Note appears to do nothing. (The jog entry
     * path arms it at the CC site too, which masked this once.) */
    if (!snd.soundRender()) throw new Error('Shift+Note entry did not show the screen');
    toTop();
    left();
    if (snd.soundActive()) throw new Error('left at the top did not exit');
    if (S.activeBank !== 3) throw new Error('landed on the wrong bank: ' + S.activeBank);
});

step('⭑ AUTO-bank pad coloring stands down while SOUND + CONFIG is up', () => {
    /* The AUTO bank paints the melodic pads grey (palette 118 root / 124
     * non-root). Sound mode leaves S.activeBank on the bank it was entered
     * from — which can be AUTO — but the pads stay with the SEQUENCER there,
     * so they must wear their default clip coloring. The gate is
     * ui_leds' autoBankLeds() reading the S.soundOpen mirror; both halves
     * fail silently (a stale mirror or a missed site just leaves grey pads).
     * Captured at the wire: setLED emits [0x09, 0x90, note, color]. */
    const { updateTrackLEDs, invalidateLEDCache } = ledsMod;
    const { clearAllLEDs } = ifMod;   /* resets input_filter's send cache too */
    const { TRACK_PAD_BASE } = constsMod;
    const padColors = () => {
        const seen = {};
        clearAllLEDs();               /* before the capture arms — its own
                                       * note-offs are not pad paint */
        globalThis.move_midi_internal_send = (b) => {
            if (b && b[1] === 0x90 && b[2] >= TRACK_PAD_BASE && b[2] < TRACK_PAD_BASE + 32)
                seen[b[2]] = b[3];
        };               /* both caches — ui_leds' AND input_filter's;
                                       * ticks during earlier steps already primed
                                       * them, and a primed cache eats the repaint */
        invalidateLEDCache();
        updateTrackLEDs();
        globalThis.move_midi_internal_send = () => {};
        return Object.values(seen);
    };
    /* ⚠ DarkGrey === 124 === the AUTO non-root grey, so the non-root pads are
     * IDENTICAL in both states. The tell is the ROOT pads: AUTO paints them
     * 118 (LightGrey), the default coloring paints them trackColor(t). A real
     * pad map is needed or every pad is non-root and both states read all-124. */
    reset(PAD_MODE_MELODIC_SCALE, 6);
    computePadNoteMap();
    const tCol = ledsMod.trackColor(2);
    if (tCol === 118) throw new Error('fixture: trackColor(2) is LightGrey — pick another track');
    const grey = padColors();
    if (!grey.length) throw new Error('control: no pad LEDs painted at all');
    if (!grey.some(c => c === 118))
        throw new Error('control: AUTO bank painted no LightGrey root pads (' + grey.join(',') + ')');
    if (grey.some(c => c === tCol))
        throw new Error('control: AUTO bank painted track-color pads');
    right();                            /* enter SOUND + CONFIG from AUTO */
    if (!snd.soundActive()) throw new Error('did not enter sound mode');
    const inSound = padColors();
    if (!inSound.length) throw new Error('no pad LEDs painted in sound mode');
    if (inSound.some(c => c === 118))
        throw new Error('AUTO root grey still painted under sound mode: ' + inSound.join(','));
    if (!inSound.some(c => c === tCol))
        throw new Error('default track-color roots missing under sound mode: ' + inSound.join(','));
    snd.soundTick(); toTop(); left();   /* back out onto AUTO */
    if (snd.soundActive()) throw new Error('did not exit');
    const back = padColors();
    if (!back.some(c => c === 118))
        throw new Error('AUTO grey palette did not return after exit: ' + back.join(','));
});

step('⭑ the TOP LEVEL keeps the banks\' display law: falls back to the overview', () => {
    /* Same flags the clip banks read: the screen shows while the jog is
     * touched or the bank-display window is open, and yields to the track
     * overview otherwise — sound mode stays ACTIVE underneath. Every branch
     * here fails silently (a screen that never yields just looks like the
     * old behaviour; one that never comes back looks broken only on device). */
    const jogTouch   = (on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, 9, on ? 127 : 0]));
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();                             /* enter SOUND + CONFIG */
    if (!snd.soundActive()) throw new Error('did not enter');
    snd.soundTick();
    if (!snd.soundRender()) throw new Error('screen not shown inside the entry window');
    /* Window expires: the banks\' own timeout clears bankSelectTick in tick. */
    S.tickCount += 200; globalThis.tick();
    if (S.bankSelectTick >= 0) throw new Error('control: display window did not expire');
    if (snd.soundRender()) throw new Error('top level did not yield to the overview after the window');
    if (!snd.soundActive()) throw new Error('yielding must not EXIT sound mode');
    /* Touch the jog: the screen comes back; release: it yields at once. */
    jogTouch(true);
    if (!S.jogTouched) throw new Error('control: jog touch not tracked');
    if (!snd.soundRender()) throw new Error('jog touch did not bring the screen back');
    jogTouch(false);
    if (snd.soundRender()) throw new Error('jog release did not yield immediately');
    /* A turn re-opens the window (and still moves the cursor). */
    const r0 = snd.soundPickStateForTest().row;
    right();
    if (snd.soundPickStateForTest().row === r0) throw new Error('turn no longer moves the cursor');
    if (!snd.soundRender()) throw new Error('a turn did not re-open the display window');
    /* Deeper levels never yield: open the row under the cursor via the real
     * click, then check with the window closed. */
    snd.soundTick();
    send(3, 127); snd.soundTick(); globalThis.tick();
    S.tickCount += 200; globalThis.tick();
    if (snd.soundPickStateForTest && snd.soundActive()) {
        if (!snd.soundRender()) throw new Error('a sub-screen yielded to the overview');
    }
    snd.soundExit();
});

step('⭑ the identity NEVER persists: sidecar write + Shift+jog track switch', () => {
    /* Two live writers sync activeBank into trackActiveBank; both must skip
     * BANK_SOUND or a track gets stranded on a bank the jog cannot reach —
     * silently, on the next launch or the next switch back. */
    const { writeSidecar } = persistMod;
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();                             /* enter from AUTOMATION */
    if (!snd.soundActive() || S.activeBank !== BANK_SOUND)
        throw new Error('control: not in sound mode with the identity on');
    let tab = null;
    globalThis.host_write_file = (path, body) => {
        if (String(path).indexOf('ui-state') >= 0) { try { tab = JSON.parse(body).tab; } catch (e) {} }
        return true;
    };
    S.currentSetUuid = 'testuuid';
    writeSidecar();
    globalThis.host_write_file = () => true;
    if (S.trackActiveBank[2] !== 6) throw new Error('sidecar sync clobbered the origin: ' + S.trackActiveBank[2]);
    if (tab && tab[2] === BANK_SOUND) throw new Error('BANK_SOUND serialized into the sidecar');
    /* Shift+jog switches tracks with sound mode open: the outgoing track's
     * origin must survive, and the retarget re-takes the identity. */
    S.trackActiveBank[3] = 2;
    send(49, 127);                        /* shift down */
    send(14, 1); globalThis.tick();       /* track 2 -> 3, retarget on tick */
    send(49, 0);
    if (S.activeTrack !== 3) throw new Error('control: track did not switch');
    if (S.trackActiveBank[2] !== 6) throw new Error('switch wrote the identity into track 2: ' + S.trackActiveBank[2]);
    if (S.activeBank !== BANK_SOUND) throw new Error('retarget did not re-take the identity: ' + S.activeBank);
    /* Exit lands on the NEW track's own origin. */
    snd.soundTick(); toTop(); left();
    if (snd.soundActive()) throw new Error('did not exit');
    if (S.activeBank !== 2) throw new Error('exit did not restore track 3\'s origin: ' + S.activeBank);
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
