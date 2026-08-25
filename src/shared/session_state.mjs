/* session_state.mjs — is a standalone session live, and what does it own?
 *
 * A standalone session takes over the whole device: it relaunches Move under
 * its own build and swaps its own project library over `Sets/`. While that is
 * true, the set library on disk is NOT the user's set list — it is the
 * session's projects, and the session module owns their lifecycle (create,
 * copy, rename, delete) through its own UI.
 *
 * That makes the library a hazard for every generic file surface: a rename or
 * delete from a file browser mutates a project the running session has open
 * and knows nothing about. This module is the shared answer to "should I be
 * showing this path right now", so the browsers and the session agree on one
 * definition instead of each carrying their own.
 */

import * as std from 'std';

/* The session's lock file, held by its supervisor for the life of the session.
 * ⚠ Read with std.loadFile, not host_read_file: the host binding validates
 * paths against /data/UserData and would reject /dev/shm outright. */
const SESSION_LOCK_PATH = "/dev/shm/.dbxhost-session.lock";

/* The set library, which a live session has swapped for its own projects. */
export const SET_LIBRARY_DIR = "/data/UserData/UserLibrary/Sets";

/* True while a standalone session is running. Re-read, never cached: a session
 * can start or end without a given process restarting.
 *
 * LIVENESS, not a marker. This used to be a file under /data removed only on
 * the launcher's clean-exit path, so a hard reboot — the documented recovery
 * action — left it behind, and a session that crashed mid-boot left one that
 * refused every launch until the next reboot. The launcher now holds an
 * exclusive flock on a /dev/shm dotfile for the life of the session with its
 * supervisor's pid as the payload: /dev/shm clears on reboot by construction,
 * the flock dies with the session's processes, and the answer here is a probe
 * of that pid. There is no staleness protocol left to get wrong.
 *
 * Fallbacks are deliberately PERMISSIVE — an unreadable or garbled payload
 * means "assume live" — because the two false answers are not symmetric. A
 * false negative sends a session-teardown gesture down the plain module-exit
 * path (stranding the session with its lock still held) and exposes a live
 * project library to the file browsers. A false positive only hides files that
 * are about to become visible again. Only a demonstrably dead pid (payload
 * readable, no /proc entry) counts as "no session". */
export function standaloneSessionActive() {
    try {
        const payload = std.loadFile(SESSION_LOCK_PATH);
        if (payload === null || payload === undefined) return false;
        const pid = parseInt(String(payload).trim(), 10);
        /* Garbled payload: assume live. The file exists, so something wrote it,
         * and the safe reading of "I cannot tell" is the one that protects the
         * projects rather than the one that exposes them. */
        if (!isFinite(pid) || pid <= 0) return true;
        return std.loadFile("/proc/" + pid + "/cmdline") !== null;
    } catch (e) {
        return false;
    }
}

/* True if `path` IS the set library or sits inside it.
 *
 * Prefix-compares on a trailing separator so a sibling that merely starts with
 * the same characters (".../SetsBackup") is not caught by it. */
export function isSetLibraryPath(path) {
    if (!path) return false;
    const p = String(path);
    if (p === SET_LIBRARY_DIR) return true;
    return p.indexOf(SET_LIBRARY_DIR + "/") === 0;
}

/* ── Provisional (not-yet-real) set identities ───────────────────────────────
 *
 * When Move's currentSongIndex moves before the matching `Sets/<UUID>/` folder
 * exists, the host publishes a SYNTHETIC identity so there is something to show
 * meanwhile: `__pending-<songIndex>-<seq>` (shadow_set_pages.c). It is a
 * placeholder for a blank working state, and it is deliberately not a uuid.
 *
 * ⚠⚠ It must NEVER be used as a storage path. Per-project state lives at
 * `Sets/<uuid>/dAVEBOx/`, so a placeholder uuid makes a REAL directory named
 * `__pending-2-1` in the set library, and that session's work is filed where no
 * real project will ever look for it. Five such directories were found on Josh's
 * device (2026-08-25), one created that same session — each holding only a
 * `dAVEBOx/` state dir and no Song.abl.
 *
 * ⭑ It lives HERE because both writers need it and they are in different
 * codebases: dAVEBOx (`ui_persistence.mjs`) and the host UI (`shadow_ui.js`,
 * which writes `dAVEBOx/host` under the same uuid). A copy in each is how the
 * two drift.
 *
 * The right behaviour when provisional is to write NOTHING and wait for a real
 * uuid — not to fall back to some other path. There is no project to save to
 * yet, and inventing one is what created the debris. */
export const PROVISIONAL_SET_UUID_PREFIX = "__pending-";

export function setUuidIsProvisional(uuid) {
    if (!uuid) return false;
    return String(uuid).indexOf(PROVISIONAL_SET_UUID_PREFIX) === 0;
}

/* The one question a file surface should ask before listing or offering an
 * entry: is this path off-limits right now?
 *
 * Off-limits only DURING a session. Outside one, `Sets/` is the user's own set
 * list managed by Move, and hiding it would be hiding their own files. */
export function pathHiddenFromBrowsers(path) {
    return isSetLibraryPath(path) && standaloneSessionActive();
}
