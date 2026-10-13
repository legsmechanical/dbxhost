/* ui_touch_hold.mjs — a touch let go is HELD for a moment before it counts.
 *
 * The knobs' and the jog's capacitive touches (notes 0-9) arrive already
 * decided: on or off, no pressure. A light or uneven finger makes the sensor
 * drop out and come back while the hand never left, and every screen a touch
 * holds open (the page peek, the bank card, a touch + click gesture) flickered
 * with it.
 *
 * So the release waits S.touchHoldMs. A touch-on for the same note inside the
 * wait cancels both — the handlers never see the gap. A release nothing
 * follows is delivered late by the tick, unchanged.
 *
 * It sits in FRONT of the input handler rather than in it: the handler takes
 * touch edges in a dozen places behind as many modal gates, and each would
 * need the rule. Everything but notes 0-9 passes straight through. */

import { S } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';

const N = 10;
const _on   = new Array(N).fill(false);   /* a touch-on was delivered, no release yet */
const _due  = new Array(N).fill(-1);      /* when the held release is delivered; -1 = none */
const _at   = new Array(N).fill(0);       /* when the held release arrived */
const _held = new Array(N).fill(null);    /* the release, as it arrived */
let _pending = 0;

/* True = taken (held back, or a re-touch that cancelled a held release);
 * the caller must not handle the message. `deliver` hands a held release on. */
export function touchHoldTake(data, deliver) {
    const kind = (data[0] | 0) & 0xF0;
    if (kind !== 0x90 && kind !== 0x80) return false;
    const n  = (data[1] ?? 0) | 0;
    const d2 = (data[2] ?? 0) | 0;
    if (n < 0 || n >= N) return false;

    if (kind === 0x90 && d2 === 127) {
        if (_due[n] >= 0) {
            console.log('dbx: touch flicker n=' + n + ' gap=' + (nowMs() - _at[n]) + 'ms');
            _due[n] = -1; _held[n] = null; _pending--;
            _on[n] = true;
            return true;
        }
        /* A touch somewhere ELSE is a finger that moved: what it left lets go
         * first, in the order it happened — the handler's release clears the
         * touched knob whichever knob it names. */
        if (_pending > 0) _flush(deliver, true);
        _on[n] = true;
        return false;
    }
    /* The two release encodings the hardware uses. */
    if (kind === 0x80 || d2 < 64) {
        if (_due[n] >= 0) return true;        /* already waiting: the first one counts */
        if (!_on[n]) return false;            /* a release for a touch we never saw */
        _on[n] = false;
        if (!(S.touchHoldMs > 0)) return false;
        _at[n]   = nowMs();
        _due[n]  = _at[n] + S.touchHoldMs;
        _held[n] = [data[0] | 0, n, d2];
        _pending++;
        return true;
    }
    return false;
}

/* Once per tick: hand over the releases whose wait has run out. */
export function touchHoldFlush(deliver) {
    if (_pending > 0) _flush(deliver, false);
}

function _flush(deliver, all) {
    const now = nowMs();
    for (let n = 0; n < N; n++) {
        if (_due[n] < 0 || (!all && now < _due[n])) continue;
        const msg = _held[n];
        _due[n] = -1; _held[n] = null; _pending--;
        deliver(msg);
    }
}
