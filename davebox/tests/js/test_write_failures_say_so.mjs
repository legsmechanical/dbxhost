/* tests/js/test_write_failures_say_so.mjs — a project write that FAILS says so.
 *
 * THE BUG THIS PINS (2026-10-04 module review): host_write_file returns false
 * on a failed write (disk full, a missing dir, a failed rename), and the
 * sidecar, snapshot, snapshot-load and Clear Session writers all discarded it.
 * A failed write looked exactly like a saved one. Each now logs and shows
 * SAVE FAILED; a snapshot whose copy failed is not reported as saved/loaded.
 *
 * Control: the same calls with a working disk show nothing. */
let failed = 0;
const ok  = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
const step = (l, fn) => { try { fn(); ok(l); } catch (e) { bad(l, e); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

const FILES = {};
let diskWorks = true;
globalThis.host_write_file = (p, c) => { if (!diskWorks) return false; FILES[p] = c; return true; };
globalThis.host_read_file = (p) => (FILES[p] !== undefined ? FILES[p] : '');
globalThis.host_file_exists = (p) => Object.prototype.hasOwnProperty.call(FILES, p);
globalThis.host_ensure_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_system_cmd = () => 0;
globalThis.host_module_get_param = () => '';
globalThis.host_module_set_param = () => {};

const LOGS = [];
const realLog = console.log;
console.log = (...a) => { LOGS.push(a.join(' ')); };

async function main() {
    const { S } = await import('../../ui/ui_state.mjs');
    const P = await import('../../ui/ui_persistence.mjs');
    S.awaitingProjectSelect = false;
    S.currentSetUuid = 'aaaa-bbbb';
    const popup = () => (S.actionPopupLines || []).join(' / ');
    const reset = () => { LOGS.length = 0; S.actionPopupLines = []; };
    const sawFailure = (what) => LOGS.some(l => l.indexOf('WRITE FAILED (' + what + ')') >= 0)
                              && popup() === 'SAVE FAILED / CHECK STORAGE';

    step('control: a working disk writes the sidecar and shows nothing', () => {
        diskWorks = true; reset();
        P.writeSidecar();
        assert(!LOGS.some(l => l.indexOf('WRITE FAILED') >= 0), 'logged a failure on a working disk: ' + LOGS);
        assert(popup() === '', 'showed a popup on a working disk: ' + popup());
    });

    step('a failed sidecar write logs and shows SAVE FAILED', () => {
        diskWorks = false; reset();
        P.writeSidecar();
        assert(sawFailure('sidecar'), 'no failure notice: logs=' + JSON.stringify(LOGS) + ' popup=' + popup());
    });

    step('a failed Clear Session write logs and shows SAVE FAILED', () => {
        diskWorks = false; reset();
        P.doClearSession();
        assert(sawFailure('clear'), 'no failure notice: logs=' + JSON.stringify(LOGS) + ' popup=' + popup());
    });

    step('a snapshot whose copy fails returns false and says so', () => {
        diskWorks = true;
        FILES[P.uuidToStatePath('aaaa-bbbb')] = '{"v":36}';
        diskWorks = false; reset();
        const r = P.commitSnapshot('aaaa-bbbb', 7, 'x');
        assert(r === false, 'commitSnapshot reported success on a failed write');
        assert(sawFailure('snapshot'), 'no failure notice: ' + JSON.stringify(LOGS));
    });

    step('loading a snapshot whose copy fails returns false and says so', () => {
        diskWorks = true;
        assert(P.commitSnapshot('aaaa-bbbb', 8, 'y') === true, 'control: snapshot 8 saved');
        diskWorks = false; reset();
        const r = P.applySnapshotToLive('aaaa-bbbb', 8);
        assert(r === false, 'applySnapshotToLive reported success on a failed write');
        assert(sawFailure('state load'), 'no failure notice: ' + JSON.stringify(LOGS));
    });

    console.log = realLog;
    if (failed) { console.error('FAIL: write_failures_say_so'); process.exit(1); }
    console.log('PASS: write_failures_say_so');
}
main().catch((e) => { console.log = realLog; console.error(e); process.exit(1); });
