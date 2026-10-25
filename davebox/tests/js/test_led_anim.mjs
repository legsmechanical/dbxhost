/* tests/js/test_led_anim.mjs — the LED animation channel, end to end in JS.
 *
 * Pins three things a device cannot show quickly:
 *  1. input_filter's setLED / setButtonLED put the animation in the status
 *     byte's low nibble and cache it the way the hardware behaves — a fade is
 *     one-shot (the next plain write of the same colour is a repeat and sends
 *     nothing, so the fade is not cut short), a pulse / blink repeats (a plain
 *     write of the same colour MUST go out, it is what stops it), and re-sending
 *     a running animation unchanged is a repeat (it would restart it).
 *  2. ui_led_clock's step: Start at the play edge, one 0xF8 per 4 master
 *     ticks, Stop at the stop edge, nothing while following Move's clock, no
 *     burst after a stall.
 *  3. The packets are whole 4-byte USB-MIDI packets on cable 0 — the ring
 *     refuses anything else.
 */
import assert from 'node:assert/strict';

const sent = [];
globalThis.move_midi_internal_send = (arr) => { sent.push(arr.slice()); return true; };

(async () => {
const IF = await import('/data/UserData/schwung/shared/input_filter.mjs');
const { ledClockState, ledClockStep } = await import('../../ui/ui_led_clock.mjs');

function take() { const s = sent.splice(0); return s; }
function statuses(pk) { return pk.map(p => p[1]); }

/* --- 1. the channel rides the status byte, and the cache knows the kinds --- */
IF.invalidateLedCache(); take();

assert.deepEqual(take(), []);
assert.equal(IF.setLED(70, 10), true);
assert.deepEqual(take(), [[0x09, 0x90, 70, 10]], 'a plain write is channel 0');
IF.setLED(70, 10);
assert.deepEqual(take(), [], 'the same plain colour is a repeat');

IF.setLED(70, 20, false, 4);
assert.deepEqual(take(), [[0x09, 0x94, 70, 20]], 'a fade is the colour on channel 4');
IF.setLED(70, 20);
assert.deepEqual(take(), [], 'the plain colour after a fade is a repeat: the fade runs to its end');
assert.equal(IF.ledAnimOf(70), 0, 'a fade is recorded as a plain colour');
IF.setLED(70, 20, false, 4);
assert.deepEqual(take(), [[0x09, 0x94, 70, 20]], 'asking for the fade again is explicit and goes out');

IF.setLED(70, 30, false, 9);
assert.deepEqual(take(), [[0x09, 0x99, 70, 30]], 'a pulse is channel 9');
assert.equal(IF.ledAnimOf(70), 9, 'a pulse is remembered');
IF.setLED(70, 30, false, 9);
assert.deepEqual(take(), [], 're-sending a running pulse unchanged would restart it: a repeat');
IF.setLED(70, 30);
assert.deepEqual(take(), [[0x09, 0x90, 70, 30]], 'the plain colour STOPS a pulse, so it is sent');
assert.equal(IF.ledAnimOf(70), 0);

IF.setLED(71, 0, false, 14);
assert.deepEqual(take(), [[0x09, 0x9E, 71, 0]], 'a blink to off keeps channel 14');
IF.setLED(71, 5, false, 14);
assert.deepEqual(take(), [[0x09, 0x9E, 71, 5]], 'a different colour on the same channel is a new animation');

IF.setButtonLED(85, 122, false, 9);
assert.deepEqual(take(), [[0x0B, 0xB9, 85, 122]], 'a CC LED animates the same way');
IF.setButtonLED(85, 122);
assert.deepEqual(take(), [[0x0B, 0xB0, 85, 122]], 'and a plain write stops it');
assert.equal(IF.buttonAnimOf(85), 0);

IF.setLED(72, 7, false, 0x1F);
assert.deepEqual(take(), [[0x09, 0x9F, 72, 7]], 'anim is a nibble: masked, never spills into the message type');

/* a REFUSED write caches nothing — the next frame retries */
globalThis.move_midi_internal_send = (arr) => { sent.push(arr.slice()); return false; };
IF.setLED(73, 9, false, 9); take();
assert.equal(IF.ledAnimOf(73), 0, 'a refused pulse is not remembered as running');
globalThis.move_midi_internal_send = (arr) => { sent.push(arr.slice()); return true; };
IF.setLED(73, 9, false, 9);
assert.deepEqual(take(), [[0x09, 0x99, 73, 9]], 'it is retried');

/* invalidate forgets the animations too */
IF.setLED(74, 3, false, 11); take();
IF.invalidateLedCache();
assert.equal(IF.ledAnimOf(74), 0);

/* --- 2. the LED clock --- */
const st = ledClockState();
assert.deepEqual(ledClockStep(st, false, false, 0), [], 'stopped: silence');
assert.deepEqual(statuses(ledClockStep(st, true, false, 0)), [0xFA], 'play edge: Start');
assert.deepEqual(statuses(ledClockStep(st, true, false, 3)), [], 'no clock before 4 master ticks');
assert.deepEqual(statuses(ledClockStep(st, true, false, 4)), [0xF8], 'one clock per 4 master ticks');
assert.deepEqual(statuses(ledClockStep(st, true, false, 12)), [0xF8, 0xF8], 'catches up by the ticks elapsed');
assert.deepEqual(statuses(ledClockStep(st, true, false, 12)), [], 'nothing twice for one position');
assert.deepEqual(statuses(ledClockStep(st, true, false, 400)), new Array(12).fill(0xF8), 'a stall is capped, not a burst');
assert.deepEqual(statuses(ledClockStep(st, true, false, 4)), [], 'a position that moved back resumes from there');
assert.deepEqual(statuses(ledClockStep(st, true, false, 8)), [0xF8]);
assert.deepEqual(statuses(ledClockStep(st, false, false, 8)), [0xFC], 'stop edge: Stop');
assert.deepEqual(statuses(ledClockStep(st, false, false, 8)), [], 'once');
assert.deepEqual(statuses(ledClockStep(st, true, false, 96)), [0xFA], 'Start again: beat zero is the position it starts at');
assert.deepEqual(statuses(ledClockStep(st, true, false, 100)), [0xF8]);
assert.deepEqual(statuses(ledClockStep(st, true, true, 200)), [0xFC], 'following Move: hand the clock back once');
assert.deepEqual(statuses(ledClockStep(st, true, true, 300)), [], 'and stay silent while Move is the clock');

/* --- 3. whole packets on cable 0 --- */
for (const p of [...ledClockStep(ledClockState(), true, false, 0), ...ledClockStep({ running: true, sentClocks: 0 }, true, false, 8)]) {
    assert.equal(p.length, 4);
    assert.equal(p[0], 0x0F, 'realtime CIN, cable 0');
    assert.ok(p[1] >= 0xF8);
}

/* --- 4. the two-step helpers: a repeating animation BETWEEN two colours --- */
IF.invalidateLedCache(); take();
IF.setLEDAnim(80, 0, 20, 9);
assert.deepEqual(take(), [[0x09, 0x90, 80, 0], [0x09, 0x99, 80, 20]], 'start colour on ch0, target on the pulse channel');
IF.setLEDAnim(80, 0, 20, 9);
assert.deepEqual(take(), [], 'the same pair again sends nothing — it would restart the pulse');
IF.setLEDAnim(80, 0, 20, 13);
assert.deepEqual(take(), [[0x09, 0x90, 80, 0], [0x09, 0x9D, 80, 20]], 'a different animation of the same colour is a change, and restarts from the start colour');
IF.setLED(80, 5);
assert.deepEqual(take(), [[0x09, 0x90, 80, 5]], 'a plain write stops it');
IF.setLEDAnim(80, 5, 20, 9);
assert.deepEqual(take(), [[0x09, 0x99, 80, 20]], 'a start colour the LED already shows is not re-sent');
IF.setButtonLEDAnim(52, 0, 120, 9);
assert.deepEqual(take(), [[0x0B, 0xB0, 52, 0], [0x0B, 0xB9, 52, 120]], 'buttons: the same two-step on CC');
IF.setButtonLEDAnim(52, 0, 120, 9);
assert.deepEqual(take(), [], 'buttons: the repeat is skipped too');

console.log('test_led_anim: ok');
})().catch(e => { console.error(e); process.exit(1); });
