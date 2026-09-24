/* Deterministic randomness for the phrase generator: the shipped library is a
 * build artifact, so the same seed must give the same phrase on every machine. */
export function hashString(s) {
    let h = 2166136261 >>> 0;                 /* FNV-1a */
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h || 1;
}
export function makeRng(seed) {
    let x = (typeof seed === 'string' ? hashString(seed) : (seed >>> 0)) || 1;
    const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    return {
        next,
        chance: (p) => next() < p,
        int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
        pick: (arr) => arr[Math.floor(next() * arr.length)],
        /* weighted pick over [[value, weight], …] */
        weighted: (pairs) => {
            const tot = pairs.reduce((a, p) => a + p[1], 0);
            let r = next() * tot;
            for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
            return pairs[pairs.length - 1][0];
        },
    };
}
