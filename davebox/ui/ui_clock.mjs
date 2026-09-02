/* ui_clock.mjs — THE ONE CLOCK for UI timing (2026-09-02).
 *
 * The host calls the module tick as fast as the tick allows (a 2 ms sleep
 * between calls), so the tick RATE is whatever the tick's cost is: ~94 Hz
 * when a tick cost ~7 ms of parameter reads, ~340 Hz idle and ~160 Hz under
 * playback since the reads were folded into one prefetch. Every duration
 * that was counted in TICKS (the tap/hold threshold, the splash, popups,
 * flashes, blink phases, the save-quiet rule, the count-in flash) therefore
 * changed length with the speed-up — and would change again with load. A
 * duration is a number of MILLISECONDS off this clock, never a number of
 * ticks. The tick reads it once into S.clockMs; handlers call nowMs().
 *
 * Defined in ui_state.mjs (which owns S) and re-exported here so importing
 * the clock never creates an import cycle. */
export { nowMs, TICK_MS_FOR_TESTS } from './ui_state.mjs';
