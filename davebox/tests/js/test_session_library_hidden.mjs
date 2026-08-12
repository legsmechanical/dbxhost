/* tests/js/test_session_library_hidden.mjs — while a standalone session is
 * live, its project library must not appear in any generic file browser.
 *
 * The session owns project create/copy/rename/delete through its own picker
 * and has the current project OPEN; a rename or delete from a file browser
 * mutates it behind the session's back, and by policy the project then opens
 * blank with nothing to recover it. Hiding happens at the one place every
 * browser lists through (`refreshFilepathBrowser` in the shared
 * filepath_browser.mjs), so this pins the shared behaviour rather than any one
 * consumer's copy of it.
 *
 * The session probe reads /dev/shm/.dbxhost-session.lock through QuickJS's
 * `std`, which the harness stubs (tests/js/stubs/quickjs_std.mjs) reading from
 * globalThis.__stubStdFiles — so a test can say "a session is live" precisely,
 * including the awkward cases: a dead pid, and a garbled payload.
 */
import { buildFilepathBrowserState, refreshFilepathBrowser } from '/data/UserData/schwung/shared/filepath_browser.mjs';
import { pathHiddenFromBrowsers, standaloneSessionActive } from '/data/UserData/schwung/shared/session_state.mjs';

let failed = 0;
function eq(got, want, label) {
    if (got !== want) { console.error(`FAIL: ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); failed = 1; }
}

const LOCK = '/dev/shm/.dbxhost-session.lock';
const LIB = '/data/UserData/UserLibrary';
const SETS = LIB + '/Sets';

/* A pid that is certainly alive in this process: our own. The probe reads
 * /proc/<pid>/cmdline, which the stub answers from the same map. */
const LIVE_PID = 4242;
function sessionLive() {
    globalThis.__stubStdFiles = {
        [LOCK]: String(LIVE_PID) + '\n',
        ['/proc/' + LIVE_PID + '/cmdline']: 'bash\0-c\0launch.sh\0',
    };
}
function sessionDeadPid() {
    /* Lock left behind by a crashed session: payload readable, no such process. */
    globalThis.__stubStdFiles = { [LOCK]: String(LIVE_PID) + '\n' };
}
function sessionGarbled() {
    globalThis.__stubStdFiles = { [LOCK]: 'not-a-pid' };
}
function noSession() {
    globalThis.__stubStdFiles = {};
}

/* A filesystem shaped like the device's UserLibrary. */
const TREE = {
    [LIB]: ['Sets', 'Samples', 'Presets'],
    [SETS]: ['a1b2-uuid-one', 'c3d4-uuid-two'],
    [LIB + '/Samples']: ['kick.wav'],
    [LIB + '/Presets']: [],
};
const FS = {
    readdir: (p) => TREE[p] || [],
    stat: (p) => [{ mode: (TREE[p] !== undefined) ? 0o040000 : 0o100000 }, 0],
};

function listLabels(dir) {
    const state = buildFilepathBrowserState({ root: LIB, filter: null, name: 't' }, '');
    state.currentDir = dir;
    refreshFilepathBrowser(state, FS);
    return state.items.filter((i) => i.kind !== 'up').map((i) => i.label);
}

/* -- the predicate itself -- */
noSession();
eq(standaloneSessionActive(), false, 'no lock file means no session');
eq(pathHiddenFromBrowsers(SETS), false, 'outside a session the set library is the user\'s own, and visible');

sessionLive();
eq(standaloneSessionActive(), true, 'a lock naming a live pid means a session');
eq(pathHiddenFromBrowsers(SETS), true, 'the library is hidden during a session');
eq(pathHiddenFromBrowsers(SETS + '/a1b2-uuid-one'), true, 'a project inside it is hidden too');
eq(pathHiddenFromBrowsers(LIB + '/Samples'), false, 'a sibling folder stays visible');
eq(pathHiddenFromBrowsers(LIB + '/SetsBackup'), false,
   'a sibling whose name merely STARTS with Sets is not caught by the prefix');

sessionDeadPid();
eq(standaloneSessionActive(), false, 'a lock from a crashed session is not a session');
eq(pathHiddenFromBrowsers(SETS), false, 'a stale lock must not hide the library forever');

sessionGarbled();
eq(standaloneSessionActive(), true, 'a garbled payload is assumed live — the safe reading');

/* -- the listing, which is what a user actually sees -- */
noSession();
eq(listLabels(LIB).join(','), '[Presets],[Samples],[Sets]', 'all folders listed outside a session');

sessionLive();
eq(listLabels(LIB).join(','), '[Presets],[Samples]', 'Sets is gone from the listing during a session');
eq(listLabels(SETS).length, 0,
   'and a browser already parked inside it lists nothing, rather than offering the projects');

if (failed) process.exit(1);
console.log('PASS: a live session hides its project library from file browsers');
