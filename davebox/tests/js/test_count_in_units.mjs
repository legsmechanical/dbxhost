
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_count_in_units.mjs — THE COUNT-IN RUNS ON MILLISECONDS
 * (Josh, 2026-09-10: "count-in blink on the step buttons out of sync").
 *
 * Three bugs, one cause. The 2026-09-02 law says every UI duration is a number
 * of MILLISECONDS off the one clock — but four count-in fields kept `Tick` in
 * their names while holding ms, and three sites went on feeding them tick
 * COUNTS. Mixing the two is silent: the arithmetic still runs, the result is
 * just wrong by a factor of ~100, and nothing throws.
 *
 *   1. the blink's per-beat re-phase wrote S.tickCount into a field every
 *      reader subtracts from S.clockMs — so the FIRST metronome beat knocked
 *      the blink out of phase and it never lined up again. The period stayed
 *      right, which is why it read as drift rather than as a unit bug;
 *   2. the external-MIDI capture gate compared a tick count against an ms
 *      deadline, so a note played in the final eighth of the count-in — the
 *      one that should land on the one — was ALWAYS dropped;
 *   3. the preroll GATE divided a held duration in ticks by a bar duration in
 *      ms, giving ~0.0002, so every note played during a count-in landed at
 *      the minimum gate of 1 however long you held it.
 *
 * ⭑ The clock is deterministic here: `S.clockFollowTicks` makes nowMs() derive
 * from the tick count (ui_state.nowMs), which is the hook the code already
 * ships for exactly this.
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

const sets = [];
const leds = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, String(v)]); };
let metroBeat = 0;
globalThis.host_module_get_param = (k) => (String(k).indexOf('metro_beat_count') >= 0 ? String(metroBeat) : '');
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {};
globalThis.move_midi_external_send = () => {};
/* ⚠ BOTH channels: davebox paints some surfaces through set_led and others as
 * raw CC through move_midi_internal_send. A rig that watches one of them
 * reports "nothing painted" for a screen that is painting. */
globalThis.set_led = (cc, v) => { leds.push([cc, v]); };
/* ⚠ THE PACKET SHAPE: input_filter.setLED sends [CIN, status, note, colour] —
 * FOUR bytes with a USB-MIDI cable-index byte first, and the step buttons are
 * NOTES (0x09/NoteOn 16..31), not CCs. A stub matching a 3-byte CC message
 * captures nothing and the rig reports "no LEDs painted" for a screen that is
 * painting every tick. ⭑ setLED also CACHES: an unchanged colour sends
 * nothing, which is exactly what makes a FLASH observable — it only appears
 * when the colour actually changes. */
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4) leds.push([a[2], a[3]]);
    return true; };
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S, nowMs, TICK_MS_FOR_TESTS } = await import('../../ui/ui_state.mjs');
const { extCountInCapture } = await import('../../ui/ui_record.mjs');
const { prerollGateTicks } = await import('../../ui/ui_tick.mjs');
const { MoveRec, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');

S.clockFollowTicks = true;               /* nowMs() = tickCount * 10.6, deterministic */
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000;

const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
/* Advance the deterministic clock by ms, running ticks as the host would. */
const advanceMs = (ms) => {
    const n = Math.max(1, Math.round(ms / TICK_MS_FOR_TESTS));
    for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); }
};
/* Advance the CLOCK ONLY. ⚠ The capture-gate step sets `recordCountingIn` by
 * hand, and a real tick's pollDSP clears it again — which makes the gate
 * answer "always capture" and the step pass for the wrong reason. */
const advanceClock = (ms) => { S.tickCount += Math.max(1, Math.round(ms / TICK_MS_FOR_TESTS)); };
const QUARTER_MS = 500;                  /* 120 bpm */

/* ---- 3. THE GATE: the ratio a preroll note is recorded at ---------------- */
step('⭐ the preroll GATE is a RATIO of two millisecond durations — hold an eighth of the bar, get an eighth of 384', () => {
    const bar = 4 * QUARTER_MS;                       /* a 2 s count-in bar */
    const eighth = prerollGateTicks(bar, bar / 8, 384);
    if (eighth !== 48) throw new Error('an eighth of the bar should be 48 DSP ticks, got ' + eighth);
    const half = prerollGateTicks(bar, bar / 2, 384);
    if (half !== 192) throw new Error('half the bar should be 192, got ' + half);
    /* ⚠ THE BUG, stated as arithmetic: a held duration in TICKS (an eighth of
     * the bar is ~24 ticks) over a bar in MS collapses to the floor. */
    const mixed = prerollGateTicks(bar, (bar / 8) / TICK_MS_FOR_TESTS, 384);
    if (mixed !== 5) throw new Error('control: the mixed-unit form should collapse, got ' + mixed);
    if (prerollGateTicks(bar, 0, 384) !== 1) throw new Error('a zero-length hold still records something');
    if (prerollGateTicks(bar, bar * 4, 384) !== 384) throw new Error('and the cap holds');
});

/* ---- 2. THE EXT-MIDI CAPTURE GATE --------------------------------------- */
step('⭐ external MIDI in the FINAL EIGHTH of the count-in is CAPTURED; earlier is dropped', () => {
    S.recordCountingIn = true;
    S.countInQuarterMs = QUARTER_MS;
    S.countInStartMs   = nowMs();
    if (extCountInCapture()) throw new Error('a note at the START of the count-in must be dropped as warm-up');
    advanceClock(QUARTER_MS * 2);                     /* halfway through the bar */
    if (extCountInCapture()) throw new Error('a note HALFWAY through must still be dropped');
    advanceClock(QUARTER_MS * 2 - QUARTER_MS / 4);    /* into the final eighth */
    if (!extCountInCapture()) throw new Error('a note in the FINAL EIGHTH must be captured — it lands on the one');
    S.recordCountingIn = false;
    if (!extCountInCapture()) throw new Error('control: not counting in = always capture');
});

/* ---- 1. THE BLINK ------------------------------------------------------- */
step('⭐⭐ the count-in blink RE-PHASES ON THE BEAT — the metronome beat is the flash', () => {
    S.playing = false; S.bpmMirror = 120; S.metronomeOn = 1;
    S.clipNonEmpty[2][0] = false; S.clipLengthManuallySet[2][0] = false;
    sets.length = 0;
    cc(MoveRec, 127); cc(MoveRec, 0);                 /* stopped + Record = count-in */
    if (!S.recordCountingIn) throw new Error('rig: not counting in: ' + JSON.stringify(sets));
    if (Math.abs(S.countInBeatStartMs - nowMs()) > 1)
        throw new Error('the count-in starts phased to NOW, got ' + S.countInBeatStartMs + ' vs ' + nowMs());

    /* Let the beat land somewhere OFF the current phase, then fire it. */
    advanceMs(QUARTER_MS * 1.5);
    metroBeat++;                                       /* the DSP reports a beat */
    advanceMs(TICK_MS_FOR_TESTS * 2);
    const drift = Math.abs(S.countInBeatStartMs - nowMs());
    if (drift > TICK_MS_FOR_TESTS * 3)
        throw new Error('⭑ the beat did not re-phase the blink: reference is ' + drift.toFixed(0)
            + ' ms from the beat (a TICK COUNT was written here, not a clock reading)');

    /* And the flash is ON at the beat: elapsed ≈ 0 is inside the first eighth. */
    leds.length = 0;
    S.tickCount++; globalThis.tick();
    const stepLeds = leds.filter(([c]) => c >= 16 && c <= 31);
    if (!stepLeds.length) throw new Error('no step LEDs painted during the count-in');
    if (!stepLeds.some(([, v]) => v !== 0))
        throw new Error('⭑ the step buttons are DARK on the beat — the flash is out of phase');
    S.metronomeOn = 0; S.recordCountingIn = false; S.recordArmed = false;
});

/* ---- 3b. THE CALL SITE, not just the helper ------------------------------ */
step('⭐⭐ a pad pressed during the count-in is stamped with the CLOCK — the helper is only right if it is fed ms', () => {
    /* ⚠ The gate step above drives prerollGateTicks DIRECTLY, so it stays green
     * while the CALLER hands it a tick count — the exact shape of
     * [[pin-the-call-site-not-just-the-mechanism]]. This step pins the stamp
     * the caller actually writes. */
    S.playing = false; S.bpmMirror = 120;
    S.trackPadMode[2] = PAD_MODE_DRUM;
    S.clipNonEmpty[2][0] = false; S.clipLengthManuallySet[2][0] = false;
    S.pendingPrerollNote = null;
    cc(MoveRec, 127); cc(MoveRec, 0);                 /* count-in */
    if (!S.recordCountingIn) throw new Error('rig: not counting in');
    advanceClock(300);                                /* somewhere inside the bar */
    note(68, 100);                                    /* pad 1 — pads are notes 68..99 */
    const pr = S.pendingPrerollNote;
    if (!pr) throw new Error('rig: the press did not queue a preroll note (drum path not reached)');
    if (Math.abs(pr.pressedAtMs - nowMs()) > 1)
        throw new Error('⭑ the press is stamped ' + pr.pressedAtMs + ' against a clock reading '
            + nowMs() + ' — a TICK COUNT here is what collapsed every preroll gate to 1');
    if (Math.abs(pr.countInStart - S.countInStartMs) > 0.5)
        throw new Error('and the count-in start it carries must be the same clock');
    /* The two together ARE the gate's inputs, so state the whole relationship:
     * held for a quarter of a 2 s bar = a quarter of 384. */
    const gate = prerollGateTicks(4 * QUARTER_MS, nowMs() + QUARTER_MS - pr.pressedAtMs, 384);
    if (gate < 80 || gate > 110)
        throw new Error('a quarter-bar hold should land near 96 DSP ticks, got ' + gate);
    S.recordCountingIn = false; S.recordArmed = false; S.pendingPrerollNote = null;
});

process.exit(failed);
}
main();
