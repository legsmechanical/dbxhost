/* Stub for QuickJS's built-in `std` module, which Node has no notion of.
 *
 * Only what the shared modules under test actually call. `loadFile` returning
 * null means "file not present", which for session_state.mjs reads as "no
 * standalone session is live" — the right default off-device, and the one that
 * leaves browser listings unfiltered in tests unless a test says otherwise.
 *
 * A test that wants the other answer can install its own: the loader below
 * reads through `globalThis.__stubStdFiles`, a path→contents map.
 */
export function loadFile(path) {
    const files = globalThis.__stubStdFiles;
    if (files && Object.prototype.hasOwnProperty.call(files, path)) return files[path];
    return null;
}

/* Binary reads: a test that needs one installs `globalThis.__stubStdBinFiles`,
 * a path -> Uint8Array map, and gets a FILE-like object back; anything else is
 * "cannot open", as before. */
export function open(path) {
    const files = globalThis.__stubStdBinFiles;
    if (!files || !Object.prototype.hasOwnProperty.call(files, path)) return null;
    const bytes = files[path];
    let pos = 0;
    return {
        read(buf, off, len) {
            const n = Math.max(0, Math.min(len, bytes.length - pos));
            new Uint8Array(buf, off, n).set(bytes.subarray(pos, pos + n));
            pos += n;
            return n;
        },
        seek(o) { pos = o; return 0; },
        close() { return 0; },
    };
}
export function popen() { return null; }
export function printf() {}
export function urlGet() { return null; }
