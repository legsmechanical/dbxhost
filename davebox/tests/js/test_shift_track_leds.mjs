/* Shift + bottom row (track select) in track view: every switch TARGET pulses
 * between its own dim and bright track colour, and the ACTIVE track sits solid
 * bright (Josh, 2026-08-25).
 *
 * ⚠ It used to blink DarkGrey <-> dim track colour, so for half of every cycle
 * the row showed eight identical greys — the colour is the entire content of
 * this hint. The failure mode is a blink that still blinks, which looks alive
 * and says nothing, so the test asserts WHICH colours the two phases carry
 * rather than that something changed.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* ⚠ LEDs reach the device as MIDI packets (pkt[2] = note, pkt[3] = colour), and
 * there are TWO caches in the path — ui_leds' lastSentNoteLED and input_filter's
 * own — so an unchanged pad is simply not re-sent. Track last-known state per
 * note instead of expecting a write every frame, or the SOLID pad (the active
 * track, which is the thing under test) reads as "never painted". */
const ledState = {};
globalThis.move_midi_internal_send = (pkt) => { ledState[pkt[2]] = pkt[3]; };
globalThis.set_led = () => {};
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
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = () => {};
globalThis.text_width = (t) => String(t).length * 6;
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
S.clockFollowTicks = true;   /* time in tests is driven by S.tickCount (ui_clock) */
const leds_mod = await import('../../ui/ui_leds.mjs');
const { TRACK_PAD_BASE } = await import('../../ui/ui_constants.mjs');
const { trackColor, trackDimColor } = leds_mod;

S.sessionView = false; S.ledInitComplete = true;
S.stateLoading = false; S.bootSplashMs = 0; S.awaitingProjectSelect = false;
S.activeTrack = 2;
S.shiftHeld = true; S.shiftTrackLEDActive = true;
if (!S.bankParams) S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));

/* Drive both blink phases: the rate is 24 ticks, phase = floor(tick/24) % 2. */
function rowAt(tick) {
    S.tickCount = tick; S.clockMs = Math.round(tick * 10.6);   /* the painter reads the tick's clock (test cadence) */
    leds_mod.invalidateLEDCache();
    leds_mod.updateTrackLEDs();
    const out = [];
    for (let i = 0; i < 8; i++) out.push(ledState[TRACK_PAD_BASE + i]);
    return out;
}
const phaseA = rowAt(0);      /* floor(0/24)%2  = 0 */
const phaseB = rowAt(24);     /* floor(24/24)%2 = 1 */

step('control: the overlay paints the whole bottom row in both phases', () => {
    for (let i = 0; i < 8; i++) {
        if (phaseA[i] == null || phaseB[i] == null)
            throw new Error('track ' + i + ' unpainted — the rest of this file is blind');
    }
});

step('⭑ a switch target pulses between ITS OWN dim and bright colour', () => {
    for (let i = 0; i < 8; i++) {
        if (i === S.activeTrack) continue;
        const pair = [phaseA[i], phaseB[i]].sort();
        const want = [trackColor(i), trackDimColor(i)].sort();
        if (pair[0] !== want[0] || pair[1] !== want[1])
            throw new Error('track ' + i + ' blinks ' + JSON.stringify([phaseA[i], phaseB[i]]) +
                            ', expected its own dim/bright ' + JSON.stringify(want));
    }
});

step('⚠ neither phase is grey — the colour IS the hint', () => {
    /* The specific regression: half the duty cycle spent on a colour that says
     * nothing about which track it is. */
    for (let i = 0; i < 8; i++) {
        if (i === S.activeTrack) continue;
        for (const c of [phaseA[i], phaseB[i]])
            if (c !== trackColor(i) && c !== trackDimColor(i))
                throw new Error('track ' + i + ' shows ' + c + ', which is not one of its ' +
                                'own colours (' + trackColor(i) + '/' + trackDimColor(i) + ')');
    }
});

step('⭑ the ACTIVE track stays solid bright — it is chosen, not a target', () => {
    const t = S.activeTrack;
    if (phaseA[t] !== trackColor(t) || phaseB[t] !== trackColor(t))
        throw new Error('the active pad blinks (' + phaseA[t] + '/' + phaseB[t] +
                        ') — it should hold ' + trackColor(t));
});

step('⚠ control: the two phases really do differ, so the pulse is a pulse', () => {
    const moved = [0,1,2,3,4,5,6,7].filter((i) => phaseA[i] !== phaseB[i]);
    if (moved.length === 0)
        throw new Error('nothing changed between phases — the row is static and the ' +
                        'colour assertions above would pass on a frozen frame');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
