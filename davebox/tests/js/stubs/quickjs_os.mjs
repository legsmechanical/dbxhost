/* Stub for QuickJS's built-in `os` module, which Node has no notion of.
 *
 * ⚠ WHY IT EXISTS EVEN THOUGH NO TEST NEEDS IT TODAY. `std` already had a stub
 * and `os` did not, so any shared module naming `os` took the WHOLE JS suite
 * down at bundle time rather than failing one test — the same shape as the
 * 2026-08-31 basename() flattening, where one new import broke every test at
 * once. wav_io_qjs.mjs names both, and davebox's entry point now imports it
 * (the wav peaks IO). ui.js is not reachable from a test today; this is the
 * lock on the door rather than a fix for a break.
 *
 * Only what the shared modules actually call. `stat` returning an errno means
 * "no answer", which is what a caller reads as "no such file" — the right
 * default off-device.
 */
export function stat() { return [null, 2 /* ENOENT */]; }
export function open() { return -1; }
export function read() { return 0; }
export function seek() { return -1; }
export function close() { return 0; }
/* Default: no directory exists. A test that needs a listing (a module scan)
 * opts in with __setReaddir({ '<dir>': ['a', 'b'] }) and clears it after. */
let _readdirMap = null;
export function __setReaddir(map) { _readdirMap = map || null; }
export function readdir(p) {
    const k = String(p);
    if (_readdirMap && Object.prototype.hasOwnProperty.call(_readdirMap, k)) return [_readdirMap[k].slice(), 0];
    return [[], 2 /* ENOENT */];
}

/* ⚠ realpath was MISSING until 2026-09-21, and its absence was invisible: the
 * one caller (ui_persistence's dbxProjectDir, the Phase-1 resolve seam) wraps
 * it in try/catch and falls back to the literal join, so `os.realpath` being
 * undefined threw and the tests silently exercised only the fallback. A seam
 * whose resolving half is never reached in any test is a seam nobody is
 * testing.
 *
 * Default stays "cannot resolve" — [.., ENOENT] — so every existing test keeps
 * the join it has always had. A test that wants the RESOLVING half opts in with
 * __setRealpath({ '<from>': '<to>' }), and must clear it afterwards. */
let _realpathMap = null;

export function __setRealpath(map) { _realpathMap = map || null; }

export function realpath(p) {
    const k = String(p);
    if (_realpathMap && Object.prototype.hasOwnProperty.call(_realpathMap, k)) {
        return [_realpathMap[k], 0];
    }
    return ['', 2 /* ENOENT */];
}
