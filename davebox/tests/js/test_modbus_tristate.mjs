/* tests/js/test_modbus_tristate.mjs — MODULE BUSES: the door must never latch
 * shut on a read that did not finish.
 *
 * ⭐ WHY THIS IS THE TEST WORTH HAVING. `synth:split_voices` decides whether a
 * slot offers voice groups AT ALL. It has three answers — JSON, "" and null —
 * and the difference between the last two is the difference between "this
 * module cannot split" and "ask me again".
 *
 * davebox's existing capability probe (`probeCaps`) collapses them: its helper
 * is `v !== null && v !== undefined && v !== ''`. For `send_a` that is
 * harmless. Here it is not, because the answer REMOVES A DOOR — one timed-out
 * read on entry would tell the user this module has no voice groups, and
 * nothing on the screen would ever contradict it. That is the shape of bug this
 * repo has paid for repeatedly, and it is invisible in a render.
 *
 * So: 'unknown' and 'absent' are separate values here, and this pins that they
 * stay separate.
 */

/* A STATIC import, and it is load-bearing twice over: it installs the bulk-read
 * stub every ui module expects, and it is what marks this file as ESM so
 * esbuild does not bundle it as CJS — where the top-level awaits below are a
 * build error rather than a behaviour. */
import './_bulk_get_stub.mjs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const eq = (got, want, what) => {
    const a = JSON.stringify(got), b = JSON.stringify(want);
    if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`);
};

/* ---- the engine, answering whatever the case under test wants ---------- */
let answers = {};                 /* key -> string | null */
const writes = [];                /* [key, value] in order */
globalThis.shadow_get_param = (slot, k) => (k in answers ? answers[k] : '');
globalThis.shadow_set_param = (slot, k, v) => { writes.push([k, String(v)]); };
globalThis.host_module_get_param = () => '';
globalThis.host_module_set_param = () => {};
globalThis.print = () => {}; globalThis.clear_screen = () => {};
globalThis.text_width = (t) => String(t).length * 6;
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.set_pixel = () => {}; globalThis.flush_display = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_internal_send = () => {};

/* An async main(), because the bundle format is CJS and a top-level await is a
 * BUILD error there — not a runtime one, so it fails loudly rather than
 * silently, but it fails. Every sibling test wraps for the same reason. */
async function main() {
const M = await import('../../ui/ui_modbus.mjs');

const SLOT = 0;
const VOICES = JSON.stringify([
    { id: 'bd', label: 'Kick' }, { id: 'sd', label: 'Snare' }, { id: 'chh', label: 'Hat' },
]);
/* A config with group 1 = {bd, gone}, a HOLE at 2, group 3 = {chh}. The hole is
 * what catches a path that renumbers. */
const CONFIG = JSON.stringify({
    buses: [
        { present: 1, name: 'Drums', orphans: 1, voices: ['bd', 'gone'], sends: [20, 0], fx: [] },
        { present: 0 },
        { present: 1, name: 'Hats', orphans: 0, voices: ['chh'], sends: [0, 5], fx: [] },
    ],
    main_sends: [3, 4],
});

/* ---- THE TRI-STATE ----------------------------------------------------- */

step('a read that did not complete is UNKNOWN, not absent', () => {
    const st = M.modBusInitState();
    answers = { 'synth:split_voices': null };
    M.modBusRefreshSplit(st, SLOT);
    eq(M.modBusDoorState(st), 'unknown', 'door');
    eq(M.modBusSplits(st), false, 'splits');
});

step('...and it RECOVERS on the next read — the door was not latched shut', () => {
    const st = M.modBusInitState();
    answers = { 'synth:split_voices': null };
    M.modBusRefreshSplit(st, SLOT);
    eq(M.modBusDoorState(st), 'unknown', 'after the failed read');
    /* This is the assertion the bug would fail: a `has()`-style probe caches a
     * boolean false and never asks again. */
    answers = { 'synth:split_voices': VOICES };
    M.modBusRefreshSplit(st, SLOT);
    eq(M.modBusDoorState(st), 'open', 'after the good read');
    eq(st.split.voices.map((v) => v.id), ['bd', 'sd', 'chh'], 'voices');
});

step('an EMPTY answer is ABSENT — this module cannot split, and that is final', () => {
    const st = M.modBusInitState();
    answers = { 'synth:split_voices': '' };
    M.modBusRefreshSplit(st, SLOT);
    eq(M.modBusDoorState(st), 'absent', 'door');
    eq(M.modBusSplits(st), false, 'splits');
});

step('absent and unknown are DIFFERENT VALUES — collapsing them is the bug', () => {
    const a = M.modBusInitState(); answers = { 'synth:split_voices': '' };
    M.modBusRefreshSplit(a, SLOT);
    const u = M.modBusInitState(); answers = { 'synth:split_voices': null };
    M.modBusRefreshSplit(u, SLOT);
    if (M.modBusDoorState(a) === M.modBusDoorState(u))
        throw new Error('"declares none" and "read failed" produced the same door state');
});

step('the resting state before any read is UNKNOWN, never "no groups"', () => {
    const st = M.modBusInitState();
    eq(M.modBusDoorState(st), 'unknown', 'door at boot');
    eq(M.modBusCount(st), -1, 'count is -1, not 0 — 0 would be a claim');
});

/* ---- THE CONFIG READ --------------------------------------------------- */

step('a failed config read KEEPS the last good list rather than emptying it', () => {
    const st = M.modBusInitState();
    answers = { 'buses:config': CONFIG };
    M.modBusRefreshConfig(st, SLOT);
    eq(M.modBusCount(st), 2, 'two groups');
    answers = { 'buses:config': null };
    M.modBusRefreshConfig(st, SLOT);
    /* Every row in the kept list was true a moment ago. An empty list is a
     * claim the slot never made, and it would flash on every slow read. */
    eq(M.modBusCount(st), 2, 'still two groups after a failed read');
});

step('a HOLE does not renumber — group 3 stays group 3', () => {
    const st = M.modBusInitState();
    answers = { 'buses:config': CONFIG };
    M.modBusRefreshConfig(st, SLOT);
    const rows = M.modBusRows(st);
    eq(rows.filter((r) => r.kind === 'bus').map((r) => r.index), [0, 2], 'indices');
    eq(rows.filter((r) => r.kind === 'bus').map((r) => r.name), ['Drums', 'Hats'], 'names');
});

/* ---- THE WRITES -------------------------------------------------------- */

step('taking a voice from another group MOVES it — two writes, not one', () => {
    const st = M.modBusInitState();
    answers = { 'synth:split_voices': VOICES, 'buses:config': CONFIG };
    M.modBusRefreshSplit(st, SLOT); M.modBusRefreshConfig(st, SLOT);
    writes.length = 0;
    const n = M.modBusToggleVoice(st, SLOT, 0, 'chh');   /* chh belongs to group 3 */
    eq(n, 2, 'write count');
    eq(writes[0], ['bus3:voices', ''], 'the old owner gives it up FIRST');
    eq(writes[1][0], 'bus1:voices', 'then the new owner takes it');
});

step('...and the write CARRIES THE ORPHAN — rebuilding from resolvable ids erases it', () => {
    const st = M.modBusInitState();
    answers = { 'synth:split_voices': VOICES, 'buses:config': CONFIG };
    M.modBusRefreshSplit(st, SLOT); M.modBusRefreshConfig(st, SLOT);
    writes.length = 0;
    M.modBusToggleVoice(st, SLOT, 0, 'sd');
    const w = writes.find((x) => x[0] === 'bus1:voices');
    if (!w) throw new Error('no write to bus1:voices');
    if (w[1].split(',').indexOf('gone') < 0)
        throw new Error(`the orphan was dropped: wrote "${w[1]}" — the count would then report nothing`);
});

step('an orphan row is listed, so the count has something to act on', () => {
    const st = M.modBusInitState();
    answers = { 'synth:split_voices': VOICES, 'buses:config': CONFIG };
    M.modBusRefreshSplit(st, SLOT); M.modBusRefreshConfig(st, SLOT);
    const rows = M.modBusVoiceRows(st, 0);
    eq(rows.filter((r) => r.kind === 'orphan').map((r) => r.id), ['gone'], 'orphans');
});

step('voice rows are EMPTY while the split read is unresolved', () => {
    const st = M.modBusInitState();
    answers = { 'buses:config': CONFIG };
    M.modBusRefreshConfig(st, SLOT);
    eq(M.modBusVoiceRows(st, 0).length, 0, 'rows');
});

/* ---- THE SEND KEY, through the model and only the model ---------------- */

step('a send write uses bus_model`s spelling, and the hole does not renumber', () => {
    const st = M.modBusInitState();
    answers = { 'buses:config': CONFIG };
    M.modBusRefreshConfig(st, SLOT);
    writes.length = 0;
    eq(M.modBusSetSend(st, SLOT, 2, 1, 64), true, 'accepted');
    eq(writes[0], ['bus3:send1', '64'], 'group 3 send A');
    writes.length = 0;
    M.modBusSetSend(st, SLOT, 2, 2, 200);
    eq(writes[0], ['bus3:send2', '127'], 'clamped to the max');
});

step('a group past the cap writes NOTHING rather than a key the host refuses', () => {
    const st = M.modBusInitState();
    answers = { 'buses:config': CONFIG };
    M.modBusRefreshConfig(st, SLOT);
    writes.length = 0;
    eq(M.modBusSetSend(st, SLOT, 99, 1, 10), false, 'refused');
    eq(writes.length, 0, 'no write');
});

step('the read cost is ONE round trip per refresh, not per voice or per group', () => {
    const st = M.modBusInitState();
    let reads = 0;
    const real = globalThis.shadow_get_param;
    globalThis.shadow_get_param = (s, k) => { reads++; return real(s, k); };
    answers = { 'synth:split_voices': VOICES, 'buses:config': CONFIG };
    M.modBusRefreshSplit(st, SLOT);
    M.modBusRefreshConfig(st, SLOT);
    globalThis.shadow_get_param = real;
    /* Two refreshes, two reads. The rows, the voice list and the send values
     * all come off the cache — a screen that read per row would be 8 groups x
     * 32 voices of round trips at ~2.9 ms each. */
    eq(reads, 2, 'reads');
    M.modBusRows(st); M.modBusVoiceRows(st, 0); M.modBusSendValue(st, 0, 1);
});

console.log(failed ? 'FAIL test_modbus_tristate' : 'PASS test_modbus_tristate');
process.exit(failed);
}

main().catch((e) => { console.error('FAIL test_modbus_tristate:', e && e.stack ? e.stack : e); process.exit(1); });
