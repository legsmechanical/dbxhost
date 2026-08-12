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

export function open() { return null; }
export function popen() { return null; }
export function printf() {}
export function urlGet() { return null; }
