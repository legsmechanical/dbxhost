/*
 * Input filtering and hardware utilities for Move modules
 */

import {
    MidiNoteOn, MidiNoteOff, MidiCC,
    MidiClock, MidiSysexStart, MidiSysexEnd,
    MidiChAftertouch, MidiPolyAftertouch,
    MovePads
} from './constants.mjs';

/* ============ Capacitive Touch Filtering ============ */

/* Capacitive touch events come as notes 0-9 from knob touches */
export function isCapacitiveTouch(noteNumber) {
    return noteNumber < 10;
}

/* Check if a MIDI message is a capacitive touch event */
export function isCapacitiveTouchMessage(data) {
    const status = data[0] & 0xF0;
    const isNote = status === MidiNoteOn || status === MidiNoteOff;
    return isNote && isCapacitiveTouch(data[1]);
}

/* ============ MIDI Message Filtering ============ */

/* Messages to filter out (noise from hardware) */
export function isNoiseMessage(data) {
    const status = data[0];
    const statusType = status & 0xF0;
    return (
        status === MidiClock ||           // 0xF8 - MIDI clock
        status === MidiSysexStart ||      // 0xF0 - Sysex start
        status === MidiSysexEnd ||        // 0xF7 - Sysex end
        statusType === MidiChAftertouch ||    // 0xD0 - Channel aftertouch (any channel)
        statusType === MidiPolyAftertouch     // 0xA0 - Poly aftertouch (any channel)
    );
}

/* Combined filter - returns true if message should be ignored */
export function shouldFilterMessage(data) {
    return isNoiseMessage(data) || isCapacitiveTouchMessage(data);
}

/* ============ Pad Utilities ============ */

/* @deprecated No known consumers (verified across all module repos,
 * 2026-06 dead-code sweep). Removal candidate at the next major bump. */
export function isPadNote(noteNumber) {
    return MovePads.includes(noteNumber);
}

/* @deprecated No known consumers (verified across all module repos,
 * 2026-06 dead-code sweep). Removal candidate at the next major bump. */
export function getPadIndex(noteNumber) {
    return MovePads.indexOf(noteNumber);
}

/* ============ LED Control ============ */

const ledCache = new Array(128).fill(-1);
const buttonCache = new Array(128).fill(-1);

/*
 * Cache what the hardware shows ONLY if the packet was actually queued.
 *
 * These two suppress a repaint matching the cache, which is what keeps a full
 * redraw from costing 128 packets a frame. The cost of that is that a write
 * recorded but never delivered is never retried — the LED stays wrong until
 * its value happens to change, which for a pad that is simply "off" can be
 * forever. move_midi_internal_send returns false when the shadow-UI MIDI-out
 * buffer was full, so record -1 and let the next draw re-emit it.
 *
 * -1 rather than leaving the previous value: the previous value is a claim
 * about the hardware that we have just failed to make true.
 */

/*
 * THE STATUS CHANNEL IS THE ANIMATION. Move's LED controller reads the low
 * nibble of a note-on / CC status byte as Push 2 does (Ableton's published
 * Push 2 MIDI interface, "LED animation"): channel 0 sets the colour at once;
 * 1-5 fade from the colour the LED shows to the new one and stop (one-shot,
 * over a 24th / 16th / 8th / quarter / half note); 6-10 pulse between the two
 * and 11-15 blink between them, repeating. The controller advances the
 * animation phase on MIDI clock (0xF8, 24 per beat) received on cable 0 and
 * resets it on Start / Continue; without a clock it runs at 120 BPM.
 *
 * Move's own firmware paints this way (measured on the device, 2026-10-24):
 * a hit pad is written white on channel 0 at the press, and at the release the
 * target colour goes out on channel 9; a queued clip is its colour on channel
 * 0 then the alternate on channel 14; a playing clip channel 0 then channel 9.
 * Nothing in the host rewrites the status byte on the way to the hardware —
 * the LED queue keys a note's packet by its number and sends the status it was
 * given — so a caller passes `anim` and the whole path carries it.
 *
 * The cache therefore remembers the ANIMATION as well as the colour. The two
 * together decide whether a write is a repeat: a static write that matches a
 * static cache is skipped, as before; the same (colour, anim) re-sent while an
 * animation runs would RESTART it (a new colour on channels 1-15 stops the
 * transition in flight and starts over), so it is skipped too; and a static
 * write of the colour a pulse or blink is running on is NOT skipped — it is
 * the only thing that stops the animation. A one-shot leaves the LED on its
 * target colour, which is what the cache then claims: it is recorded as a
 * plain colour, so the painter's next frame — which asks for that colour
 * without an animation — is a repeat and sends nothing, and the fade runs to
 * its end instead of being cut by a channel-0 write a tick later.
 */
const LED_ANIM_REPEATING = 6;   /* channels 6-15 run until a plain write stops them */
const ledAnim = new Array(128).fill(0);
const buttonAnim = new Array(128).fill(0);

/* Set LED color for a note (pad, step, etc.) */
/* Returns false when the host REFUSED the write (its MIDI-out buffer was full)
 * — nothing is cached then, so a caller keeping its own cache must not either.
 * An unchanged (cached) colour returns true: the hardware already shows it.
 * `anim` is the animation channel (0 = set at once; see the note above). */
export function setLED(note, color, force = false, anim = 0) {
    anim &= 0x0F;
    if (!force && ledCache[note] === color && ledAnim[note] === anim) return true;
    const sent = move_midi_internal_send([0x09, MidiNoteOn | anim, note, color]);
    ledCache[note] = sent ? color : -1;
    ledAnim[note] = (sent && anim >= LED_ANIM_REPEATING) ? anim : 0;
    return !!sent;
}

/* Set LED color via CC (for buttons) */
export function setButtonLED(cc, color, force = false, anim = 0) {
    anim &= 0x0F;
    if (!force && buttonCache[cc] === color && buttonAnim[cc] === anim) return true;
    const sent = move_midi_internal_send([0x0b, MidiCC | anim, cc, color]);
    buttonCache[cc] = sent ? color : -1;
    buttonAnim[cc] = (sent && anim >= LED_ANIM_REPEATING) ? anim : 0;
    return !!sent;
}

/* A repeating animation BETWEEN two colours — the two-step the controller
 * expects: the start colour on channel 0, then the target on the animation
 * channel, so a pulse breathes from `from` to `to` and a blink snaps between
 * them. Skipped entirely while the LED is already running this (to, anim),
 * because re-sending the pair every frame would restart it each time and read
 * as a flicker. A later plain write of any colour stops it.
 *
 * ⚠ The two writes go out on DIFFERENT frames. The host's LED queue keeps only
 * the LAST write per note (or CC) per frame, so a start colour and an animated
 * target sent in one tick reach the hardware as the target alone, and the
 * controller then pulses from whatever the LED happened to show — a solid pad
 * when it already showed the target, a colour nobody asked for otherwise
 * (seen on the device, 2026-10-24). So: the first call writes the start colour
 * and returns false ("not yet"); the caller paints every tick anyway, and the
 * next call, finding the start colour on the LED, writes the animated target.
 * One tick (~10 ms) of plain colour before the animation starts is invisible. */
export function setLEDAnim(note, from, to, anim) {
    anim &= 0x0F;
    if (ledCache[note] === to && ledAnim[note] === anim) return true;
    if (ledCache[note] !== from || ledAnim[note] !== 0) { setLED(note, from, false, 0); return false; }
    return setLED(note, to, false, anim);
}
export function setButtonLEDAnim(cc, from, to, anim) {
    anim &= 0x0F;
    if (buttonCache[cc] === to && buttonAnim[cc] === anim) return true;
    if (buttonCache[cc] !== from || buttonAnim[cc] !== 0) { setButtonLED(cc, from, false, 0); return false; }
    return setButtonLED(cc, to, false, anim);
}

/* What the cache believes an LED is doing: the animation channel of the last
 * accepted write, 0 when it was a plain colour. A painter deciding whether a
 * change should fade needs to know whether the LED is mid-animation. */
export function ledAnimOf(note) { return ledAnim[note]; }
export function buttonAnimOf(cc) { return buttonAnim[cc]; }

/*
 * Forget what we believe the hardware is showing, without touching it.
 *
 * setLED/setButtonLED suppress a write that matches the cache, which is what
 * keeps a repaint from costing 128 packets a frame. That is only sound while
 * this cache is the only thing writing. When something else repaints the
 * surface underneath us — the shim replaying Move's own LED state on the way
 * out of the knob grid, an overtake LED clear — the cache goes on claiming
 * colours the hardware no longer shows, and every one of those LEDs stays
 * wrong until its value happens to change.
 *
 * Call this after any such repaint. The next draw re-emits everything, which
 * costs one frame of packets and is the only way back to being correct.
 */
export function invalidateLedCache() {
    for (let i = 0; i < 128; i++) { ledCache[i] = -1; buttonCache[i] = -1; ledAnim[i] = 0; buttonAnim[i] = 0; }
}

/* Clear all LEDs */
export function clearAllLEDs() {
    for (let i = 0; i < 128; i++) {
        ledCache[i] = -1;
        buttonCache[i] = -1;
        ledAnim[i] = 0;
        buttonAnim[i] = 0;
    }
    for (let i = 0; i < 128; i++) {
        setLED(i, 0, true);
        setButtonLED(i, 0, true);
    }
}

/* ============ Encoder Delta Decoding ============ */

/**
 * Decode encoder/jog delta from CC value.
 * The shadow UI framework batches encoder ticks in overtake mode and encodes
 * the accumulated count: CW = count (1-63), CCW = 128 - count (65-127).
 * Returns the signed accumulated count for proportional response.
 *
 * @param {number} value - CC value (1-63 = CW count, 65-127 = CCW count)
 * @returns {number} Signed delta (positive = CW, negative = CCW)
 */
export function decodeDelta(value) {
    if (value === 0) return 0;
    if (value >= 1 && value <= 63) return value;
    if (value >= 65 && value <= 127) return -(128 - value);
    return 0;
}

/* ============ Encoder Acceleration ============ */

/* Acceleration settings */
const ACCEL_MIN_STEP = 1;
const ACCEL_MAX_STEP = 10;
const ACCEL_SLOW_THRESHOLD = 150;  /* ms - slower than this = min step */
const ACCEL_FAST_THRESHOLD = 25;   /* ms - faster than this = max step */

/* Track last event time per encoder */
const encoderLastTime = new Map();

/**
 * Decode encoder delta with acceleration applied
 * Slow turns = fine control (step 1), fast turns = coarse control (larger steps)
 * @param {number} value - CC value from encoder
 * @param {number} encoderId - Encoder identifier (CC number or index)
 * @returns {number} Accelerated delta (signed, preserves direction)
 */
export function decodeAcceleratedDelta(value, encoderId = 0) {
    const rawDelta = decodeDelta(value);
    if (rawDelta === 0) return 0;

    const now = Date.now();
    const lastTime = encoderLastTime.get(encoderId) || 0;
    const elapsed = now - lastTime;
    encoderLastTime.set(encoderId, now);

    /* Calculate step based on speed */
    let step;
    if (elapsed <= 0 || elapsed >= ACCEL_SLOW_THRESHOLD) {
        step = ACCEL_MIN_STEP;
    } else if (elapsed <= ACCEL_FAST_THRESHOLD) {
        step = ACCEL_MAX_STEP;
    } else {
        const speedRatio = (ACCEL_SLOW_THRESHOLD - elapsed) / (ACCEL_SLOW_THRESHOLD - ACCEL_FAST_THRESHOLD);
        step = Math.round(ACCEL_MIN_STEP + speedRatio * (ACCEL_MAX_STEP - ACCEL_MIN_STEP));
    }

    return rawDelta * step;
}

/**
 * Reset acceleration tracking for an encoder
 * @param {number} encoderId - Encoder identifier
 */
/* @deprecated No known consumers (verified across all module repos,
 * 2026-06 dead-code sweep). Removal candidate at the next major bump. */
export function resetEncoderAccel(encoderId) {
    encoderLastTime.delete(encoderId);
}

/**
 * Reset all encoder acceleration tracking
 */
/* @deprecated No known consumers (verified across all module repos,
 * 2026-06 dead-code sweep). Removal candidate at the next major bump. */
export function resetAllEncoderAccel() {
    encoderLastTime.clear();
}
