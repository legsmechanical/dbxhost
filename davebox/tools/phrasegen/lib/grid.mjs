/* Grid helpers shared by the rules. Steps are 1..16 per bar (step 1 = the
 * downbeat), 24 ticks each at 96 PPQN — the notation research/*.md uses. */
export const STEP = 24;
export const BAR = 384;
export const isBeat = (s) => (s - 1) % 4 === 0;          /* 1 5 9 13 */
export const isOff8 = (s) => (s - 3) % 4 === 0;          /* 3 7 11 15 */
export const isOff16 = (s) => s % 2 === 0;               /* even steps */
/* Onset tick of step s in bar b, with 16th swing (even steps delayed). */
export function tickOf(b, s, swingTicks = 0) {
    return b * BAR + (s - 1) * STEP + (isOff16(s) ? swingTicks : 0);
}
export const clampVel = (v) => Math.max(1, Math.min(127, Math.round(v)));
/* Swing % → even-16th delay (research/basics.md): 48·s/100 − 24. */
export const swingDelay = (pct) => Math.round(48 * pct / 100 - 24);
/* A velocity drawn from a [lo, hi] range. */
export const velIn = (rng, [lo, hi]) => clampVel(lo + rng.next() * (hi - lo));
