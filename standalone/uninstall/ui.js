/*
 * Uninstall dAVEBOx — the screen (2026-09-27).
 *
 * Runs under STOCK Schwung's shadow UI as a Tools module
 * (interactive + skip_file_browser, overtake:false — the host forwards the jog
 * click and Back, ticks at 60 Hz and leaves the LEDs alone). All the work is in
 * uninstall.sh beside this file; this only asks, starts it and reports.
 *
 *   --check      run synchronously at open (fast): live / installed / absent.
 *   --run        started in the BACKGROUND (`sh … &`: host_system_cmd blocks
 *                until its shell exits, and the `&` makes that immediate; the
 *                background job also runs at normal priority, not the UI's).
 *                Its log goes to LOG_FILE; it writes its exit code to DONE_FILE,
 *                which this polls.
 *
 * ⚠ The script deletes this module's directory LAST. That is safe: the host
 * read this file into memory before running it, and nothing here reads from
 * the module directory after the start. Both files it talks through live
 * outside that directory, under /data/UserData (the only root the host's file
 * calls accept).
 */

const MOD_DIR = '/data/UserData/schwung/modules/tools/davebox-uninstall';
const CHECK_FILE = '/data/UserData/.dbx-uninstall.check';
const DONE_FILE = '/data/UserData/.dbx-uninstall.done';
const LOG_FILE = '/data/UserData/dbx-uninstall.log';

const CC_JOG_CLICK = 3;
const CC_BACK = 51;
const LINE_H = 10;
const POLL_MS = 250;
const GIVE_UP_MS = 180000;

/* State: 'live' | 'installed' | 'absent' | 'confirm' | 'running' | 'done' */
let state = 'installed';
let rc = null;
let startedAt = 0;
let lastPoll = 0;

function now() { return Date.now(); }

function checkStatus() {
    host_system_cmd('sh ' + MOD_DIR + '/uninstall.sh --check > ' + CHECK_FILE + ' 2>&1');
    const out = String(host_read_file(CHECK_FILE) || '').trim();
    if (out === 'live' || out === 'absent' || out === 'installed') return out;
    return 'installed';   /* unreadable answer: offer the run, which refuses safely itself */
}

function startRun() {
    host_system_cmd('rm -f ' + DONE_FILE);
    host_system_cmd('sh ' + MOD_DIR + '/uninstall.sh --run > ' + LOG_FILE + ' 2>&1 &');
    state = 'running';
    startedAt = now();
    lastPoll = 0;
}

function pollDone() {
    const t = now();
    if (t - lastPoll < POLL_MS) return;
    lastPoll = t;
    if (!host_file_exists(DONE_FILE)) {
        if (t - startedAt > GIVE_UP_MS) { rc = -1; state = 'done'; }
        return;
    }
    const v = parseInt(String(host_read_file(DONE_FILE) || '').trim(), 10);
    rc = isNaN(v) ? -1 : v;
    state = 'done';
}

function title(text) {
    fill_rect(0, 0, 128, 11, 1);
    print(2, 2, text, 0);
}

function lines(rows, y0) {
    let y = y0;
    for (const r of rows) { print(2, y, r, 1); y += LINE_H; }
}

/* Every line fits stock's 5x7 proportional font in 124 px (measured against the
 * device's font.png; tests/host/test_uninstall_ui.sh checks every screen). */
const KEPT = ['Projects & settings', 'kept in /data/', 'UserData/dbx-host'];

function screenRows() {
    switch (state) {
        case 'live':
            return ['DAVEBOX IS RUNNING', ['Quit dAVEBOx first,', 'then open this again.', '', 'Back: exit']];
        case 'absent':
            return ['NOTHING TO UNINSTALL', ['dAVEBOx is not here.', ...KEPT, 'Click: remove tool']];
        case 'installed':
            return ['UNINSTALL DAVEBOX?', [...KEPT, 'Click: uninstall', 'Back: cancel']];
        case 'confirm':
            return ['ARE YOU SURE?', ['This removes dAVEBOx', 'Projects & settings', 'are kept.', 'Click again: uninstall', 'Back: cancel']];
        case 'running': {
            const dots = '.'.repeat(1 + (Math.floor((now() - startedAt) / 400) % 3));
            return ['UNINSTALLING', ['Removing dAVEBOx' + dots, '', 'Keep the Move on.']];
        }
        case 'done':
            if (rc === 0) return ['DAVEBOX REMOVED', [...KEPT, '', 'Back: exit']];
            if (rc === 2) return ['NOT UNINSTALLED', ['dAVEBOx is running.', 'Quit it, then retry.', '', 'Back: exit']];
            if (rc === 3) return ['NOT UNINSTALLED', ['Restart the Move,', 'then run this again.', 'Nothing was removed.', 'Back: exit']];
            if (rc === 4) return ['REMOVED, WITH ISSUES', ['Details in /data/', 'UserData/', 'dbx-uninstall.log', 'Back: exit']];
            return ['NO ANSWER', ['Check /data/UserData/', 'dbx-uninstall.log', '', 'Back: exit']];
    }
    return ['', []];
}

globalThis.init = function () {
    rc = null;
    state = checkStatus();
};

globalThis.tick = function () {
    if (state === 'running') pollDone();
    clear_screen();
    const [t, rows] = screenRows();
    title(t);
    lines(rows, 14);
};

globalThis.onMidiMessageInternal = function (data) {
    if ((data[0] & 0xF0) !== 0xB0 || data[2] === 0) return;
    const cc = data[1];
    if (cc === CC_BACK) {
        if (state === 'confirm') { state = 'installed'; return; }
        if (state === 'running') return;          /* never leave mid-run: the result would go unseen */
        host_exit_module();
        return;
    }
    if (cc !== CC_JOG_CLICK) return;
    if (state === 'installed') state = 'confirm';
    else if (state === 'confirm' || state === 'absent') startRun();
};

/* For the off-device test only: every screen the UI can show. */
globalThis.__uninstallAllScreensForTest = function () {
    const saved = [state, rc], out = [];
    for (const st of ['live', 'absent', 'installed', 'confirm', 'running'])
        { state = st; out.push(screenRows()); }
    for (const r of [0, 2, 3, 4, -1]) { state = 'done'; rc = r; out.push(screenRows()); }
    [state, rc] = saved;
    return out;
};
/* For the off-device test only. */
globalThis.__uninstallStateForTest = function () { return { state, rc }; };
