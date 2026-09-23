/* ui_trigger.mjs — one-shot knob actions, fired the stock way.
 *
 * Josh, 2026-09-23: "we should make the other one-shot gestures in davebox
 * (like legato) function the same (touch+click+animation)". A trigger cell
 * is fired by TOUCHING its knob and CLICKING the jog — never by a turn — and
 * answers with the stock button's press flash. The cell wears stock's corner
 * brackets (`opens`) and, while touched, the footer says "CLK <action>".
 *
 * The press times live here, keyed by what fired, so any page can draw the
 * flash for its own trigger. */

import { S } from './ui_state.mjs';
import { buttonPhase } from './ui_movy.mjs';
import { nowMs } from './ui_clock.mjs';

const FLASH_MS = 600;             /* covers the button's burst (BTN_FLASH_MS) */
const fired = {};

/* A trigger fired: stamp it for the flash, and keep the screen redrawing
 * until the flash is over (triggerFlashing, read by the tick). */
export function triggerFire(key) {
    const now = nowMs();
    fired[key] = (fired[key] || []).filter((p) => now - p < FLASH_MS).concat([now]);
    S.triggerFlashUntil = now + FLASH_MS;
    S.screenDirty = true;
}

/* The button's look for trigger `key`: idle, highlighted while its knob is
 * `held`, pressed and bursting just after a fire. */
export function triggerPhase(key, held) {
    return buttonPhase(fired[key] || [], nowMs(), held);
}

export function triggerFlashing() { return nowMs() < (S.triggerFlashUntil || 0); }
