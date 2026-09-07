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
export function readdir() { return [[], 2 /* ENOENT */]; }
