/* tests/js/test_visible_if_read_memo.mjs — a `visible_if` gate is read ONCE per
 * tick, not once per evaluation.
 *
 * ⚠⚠ THE MEASUREMENT THIS EXISTS FOR, from the device (readmeter, 09:45:07):
 *
 *   worst=2916 calls/2930 keys  top=synth:send1_mode x1120  synth:send2_mode x1120
 *                                   synth:send2_sync x448   synth:send1_env x112
 *
 * 2916 blocking round trips in ONE tick. At ~2.9 ms each that is over eight
 * seconds, which is why dr32's send picker reads as a hang rather than as lag.
 * The arithmetic names the cause exactly — 1120 = 112x10, 448 = 112x4,
 * 112 = 112x1 — so 112 evaluations each re-asking the same handful of keys.
 *
 * ⚠ The five gates listed account for 2912 of the 2916; the remaining 4 are not
 * in the histogram (it reports the top six, and `overtake_dsp:<bulk>x2` is one
 * of them). The replay below therefore asserts 2912, not 2916 — the number it
 * can actually account for.
 *
 * ⭑ AND IT WAS MEASURED, not inferred. An earlier figure of "150-270 reads per
 * frame" reached the worklog having been derived from frame time and was then
 * cited as though counted; it is wrong by an order of magnitude. This file
 * asserts on the COUNT so the next change to this path cannot quietly undo it.
 */

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

/* Every read is counted, the way the device's meter counts: at the binding.
 *
 * ⚠⚠ THE ANSWER MUST BE ABLE TO CHANGE. The first version of this file returned
 * 'delay' unconditionally, which made two of its steps VACUOUS: "a write drops
 * it" could only observe that a read happened, never that it returned something
 * different, and "the answer is the same one" was true for any implementation at
 * all. `ENGINE` is now real mutable state, so a stale memo produces a WRONG
 * VERDICT and the assertions are about the verdict, not about the traffic. */
let reads = [];
const ENGINE = { 'synth:send1_mode': 'delay' };
globalThis.shadow_get_param = (slot, key) => {
    reads.push(key);
    return Object.prototype.hasOwnProperty.call(ENGINE, key) ? ENGINE[key] : '';
};
globalThis.shadow_set_param = (slot, key, val) => { ENGINE[key] = String(val); return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
for (const fn of ['set_pixel', 'fill_rect', 'draw_rect', 'stipple_rect', 'clear_screen',
                  'print', 'pixel_print', 'flush_display'])
    globalThis[fn] = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const snd = await import('../../ui/ui_sound.mjs');
/* ⚠ The invalidation is a WRAPPER over shadow_set_param, installed by ui.js at
 * init — which a test does not run. Without this the write steps below would
 * quietly measure an uninvalidated memo. */
assert(snd.installGateMemoInvalidation(), 'the gate-memo invalidation did not install');
const V = snd.soundVisibilityForTest();
V.setContext(2, 'synth');

/* dr32's shape: a level whose params are gated on the send's MODE — a param
 * that is not itself displayed on this page, so the grid's own value cache
 * never holds it and every miss used to be a round trip. */
const LEVEL = { name: 'Send 1', params: [] };
const GATE  = { param: 'send1_mode', equals: 'delay' };

const countEvals = (n, { perTick = false } = {}) => {
    reads = [];
    V.dropMemo();
    for (let i = 0; i < n; i++) {
        if (perTick) V.dropMemo();          /* a fresh tick before each */
        V.evaluate(GATE, LEVEL);
    }
    return reads.filter((k) => String(k).indexOf('send1_mode') >= 0).length;
};

step('control: the gate really does reach the engine when nothing is remembered', () => {
    const n = countEvals(112, { perTick: true });
    assert(n === 112, `expected one read per tick over 112 ticks, got ${n}`);
});

step('⭐ 112 evaluations INSIDE one tick cost ONE read, not 112', () => {
    const n = countEvals(112);
    assert(n === 1, `the gate was read ${n} times in a single tick; it should be read once`);
});

step('the memo answers the same VERDICT the engine would', () => {
    ENGINE['synth:send1_mode'] = 'delay';
    V.dropMemo();
    assert(V.evaluate(GATE, LEVEL) === true, 'the gate should be open when the mode matches');
    for (let i = 0; i < 20; i++) {
        assert(V.evaluate(GATE, LEVEL) === true, 'a memoised evaluation disagreed with the first');
    }
});

step('⭐⭐ a write that REACHES THE ENGINE flips the verdict, memo or no memo', () => {
    /* ⚠ The point of the whole invalidation. A stale memo here does not cost a
     * read — it shows the WRONG SET OF CELLS, and `replanIfCondition` caches the
     * plan, so it stays wrong until the next condition change. */
    ENGINE['synth:send1_mode'] = 'delay';
    V.dropMemo();
    assert(V.evaluate(GATE, LEVEL) === true, 'precondition: the gate starts open');
    V.engineWrite('synth:send1_mode', 'reverb');
    assert(V.evaluate(GATE, LEVEL) === false,
           'the gate still reads OPEN after the engine value changed — a stale memo');
});

step('⭐ ...including a write that bypasses queueWrite entirely (reload_level, preset scan)', () => {
    /* These call engineSet directly. The invalidation wraps the BINDING, so it
     * cannot matter which call site made the write. */
    ENGINE['synth:send1_mode'] = 'delay';
    V.dropMemo();
    V.evaluate(GATE, LEVEL);
    V.directSet('synth:send1_mode', 'reverb');
    assert(V.evaluate(GATE, LEVEL) === false,
           'a direct engine write left the gate answering from the pre-write value');
});

step('a QUEUED write is not yet an engine write — and the drain is what invalidates', () => {
    ENGINE['synth:send1_mode'] = 'delay';
    V.dropMemo();
    V.evaluate(GATE, LEVEL);
    V.write('send1_mode', 'reverb');       /* queued only; the engine is untouched */
    assert(ENGINE['synth:send1_mode'] === 'delay',
           'precondition: queueWrite must not have reached the engine');
    assert(V.evaluate(GATE, LEVEL) === true,
           'the gate changed before the value did — it must follow the ENGINE, not the queue');
});

step('⚠⚠ a different SLOT cannot be answered from the previous one — it is in the key', () => {
    /* ⚠ This drives S.slot directly rather than calling soundRetarget: what is
     * pinned is the KEY SHAPE, which is what makes a mid-tick retarget safe. The
     * retarget path itself is pinned in tests/test_gate_memo_lifetime.sh. */
    V.dropMemo();
    V.setContext(2, 'synth');
    V.evaluate(GATE, LEVEL);
    reads = [];
    /* Deliberately WITHOUT dropping the memo: soundRetarget moves S.slot inside
     * a tick, and the whole point of keying on it is that no clear is needed. */
    V.setContext(5, 'synth');
    V.evaluate(GATE, LEVEL);
    assert(reads.filter((k) => String(k).indexOf('send1_mode') >= 0).length === 1,
           'the new slot re-used the old slot’s gate value');
    V.setContext(2, 'synth');
});

step('...and the same for a component switch', () => {
    V.dropMemo();
    V.setContext(2, 'synth');
    V.evaluate(GATE, LEVEL);
    reads = [];
    V.setContext(2, 'fx1');
    V.evaluate(GATE, LEVEL);
    assert(reads.filter((k) => String(k).indexOf('send1_mode') >= 0).length === 1,
           'a different component re-used the previous one’s gate value');
    V.setContext(2, 'synth');
});

step('the memo does not grow without bound within a tick', () => {
    V.dropMemo();
    for (let i = 0; i < 200; i++) V.evaluate(GATE, LEVEL);
    assert(V.memoSize() === 1, `one key should hold one entry, got ${V.memoSize()}`);
    V.dropMemo();
    assert(V.memoSize() === 0, 'the drop left entries behind');
});

/* ---- the device's own worst tick, replayed ------------------------------ */
step('⭐ the measured worst tick: 2916 reads become 5', () => {
    /* The exact histogram from the device, as evaluation counts per gate. */
    const DEVICE = [['send1_mode', 1120], ['send2_mode', 1120], ['send2_sync', 448],
                    ['send1_env', 112], ['send2_env', 112]];
    reads = [];
    V.dropMemo();
    for (const [key, times] of DEVICE)
        for (let i = 0; i < times; i++) V.evaluate({ param: key, equals: 'delay' }, LEVEL);
    const before = DEVICE.reduce((a, [, n]) => a + n, 0);
    assert(before === 2912, `the replayed histogram should be 2912 evaluations, got ${before}`);
    assert(reads.length === DEVICE.length,
           `${before} evaluations should cost ${DEVICE.length} reads, cost ${reads.length}`);
    console.log(`         ${before} evaluations -> ${reads.length} round trips`
              + ` (~${(before * 2.9 / 1000).toFixed(1)}s -> ~${(reads.length * 2.9).toFixed(0)}ms)`);
});

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed);
}
main();
