/*
 * ui_readmeter.mjs — how many questions did this tick ask the sound engine?
 *
 * ⭐ WHY THIS EXISTS. Every slow thing dAVEBOx has hit is one shape: the screen
 * asks the engine for a value and waits. One question is a full SPI round trip,
 * ~2.9 ms, against a tick of ~10.6 ms — so a handful per tick IS the budget, and
 * every fix so far has been "ask fewer questions" (snapshot recall 600 ms ->
 * 150 ms; the automation stall 139 -> 41 reads over 40 ticks). Each of those was
 * found by reasoning backwards from a symptom, and one of them took three wrong
 * theories first.
 *
 * ⚠⚠ THE POINT IS TO STOP GUESSING. The DR32 send-effect picker has had three
 * explanations and ZERO measurements; a figure of "150-270 reads/frame" reached
 * the worklog having been INFERRED from frame time, and was cited afterwards as
 * though it had been counted. This makes the number observable so the next
 * answer is measured.
 *
 * WHAT IT COUNTS: every call that reaches the host's read bindings, from any
 * caller — davebox's own code AND the vendored param-pages library, which reads
 * through the same globals. That is the whole point of wrapping the BINDING
 * rather than instrumenting call sites: a call site you forget is a call site
 * you do not see, and the library has hundreds.
 *
 * ⚠ A BULK read is ONE round trip carrying many keys, and it is counted as one.
 * Counting it as sixty would make the batching work (which is the fix) look like
 * the problem. Both numbers are reported: `calls` is the cost, `keys` is the
 * work done for it, and the ratio is how well the batching is being used.
 *
 * ⚠ NOT GATED BEHIND A FLAG. A flag-off counter is a counter nobody has run
 * ([[flag-off-code-is-untested-code]]), and the cost here is an integer
 * increment and one property write against a 2.9 ms round trip — unmeasurable
 * next to the thing it measures.
 */

/* The tick being counted. Reset by readMeterTick(), read by the report. */
let cur = { calls: 0, keys: 0, hist: Object.create(null) };
/* The worst tick since the last report, kept WITH its key histogram — the count
 * says how bad, the keys say which screen, without this module having to know
 * anything about screens. */
let worst = { calls: 0, keys: 0, hist: Object.create(null), tick: -1 };
let ticks = 0;
let totalCalls = 0;
let totalKeys = 0;
let installed = false;

/** Every counter back to zero. The report interval and tests both use it. */
export function readMeterReset() {
    cur = { calls: 0, keys: 0, hist: Object.create(null) };
    worst = { calls: 0, keys: 0, hist: Object.create(null), tick: -1 };
    ticks = 0; totalCalls = 0; totalKeys = 0;
}

/* One read. `n` is how many KEYS the call carried — 1 for a single read, the
 * batch size for a bulk one. */
function note(key, n) {
    cur.calls += 1;
    cur.keys += (n | 0) || 1;
    const k = String(key === undefined || key === null ? '?' : key);
    cur.hist[k] = (cur.hist[k] | 0) + 1;
}

/*
 * Close the tick just finished and start a new one.
 *
 * ⚠ CALLED AT THE TOP OF THE TICK, not the bottom: a tick that THROWS still has
 * its reads counted, because the next tick closes it. Closing at the bottom
 * would silently drop exactly the ticks most worth seeing — davebox's own tick
 * wrapper swallows exceptions into a log file
 * ([[schwung-tick-swallows-errors-late-stages-never-run]]).
 */
export function readMeterTick() {
    if (cur.calls > worst.calls) worst = { ...cur, tick: ticks };
    ticks += 1;
    totalCalls += cur.calls;
    totalKeys += cur.keys;
    cur = { calls: 0, keys: 0, hist: Object.create(null) };
}

/** The worst tick since the last reset, its keys, and the running mean. */
export function readMeterReport() {
    const top = Object.keys(worst.hist)
        .sort((a, b) => worst.hist[b] - worst.hist[a])
        .slice(0, 6)
        .map((k) => `${k}x${worst.hist[k]}`);
    return {
        ticks,
        worstCalls: worst.calls,
        worstKeys: worst.keys,
        worstTick: worst.tick,
        meanCalls: ticks > 0 ? (totalCalls / ticks) : 0,
        meanKeys: ticks > 0 ? (totalKeys / ticks) : 0,
        top,
    };
}

/** The line that reaches debug.log. One line, so a long run stays readable. */
export function readMeterLine() {
    const r = readMeterReport();
    return `readmeter ticks=${r.ticks} worst=${r.worstCalls} calls/${r.worstKeys} keys`
         + ` mean=${r.meanCalls.toFixed(1)}/${r.meanKeys.toFixed(1)}`
         + (r.top.length ? ` top=${r.top.join(' ')}` : '');
}

/*
 * Wrap the host's read bindings, once.
 *
 * ⚠⚠ THE BINDING, NOT THE CALL SITES. davebox reads through `engineGetParam`,
 * `engineGetSlotParam`, `engineGetChainParam` and several direct calls, and the
 * vendored param-pages library reads through an injected accessor that lands on
 * the same globals. Instrumenting call sites means the ones you forget are
 * invisible — and the ones you forget are where the surprise is.
 *
 * ⚠ Idempotent. `init()` re-runs in the SAME runtime on resume (ui.js says so
 * for sound mode's module state), so a second install would count every read
 * twice and the number would silently double.
 */
export function installReadMeter() {
    if (installed) return false;
    installed = true;
    const one = globalThis.shadow_get_param;
    if (typeof one === 'function') {
        globalThis.shadow_get_param = function (slot, key) {
            note(key, 1);
            return one.apply(this, arguments);
        };
    }
    const many = globalThis.shadow_get_params;
    if (typeof many === 'function') {
        globalThis.shadow_get_params = function (slot, prefix, encoded) {
            /*
             * ⚠ THE COUNT IS THE FIRST LINE. `bulkEncode` (ui_engine.mjs) writes
             * `<count>\n` and then `<byteLen>\n<key>` per item — I first wrote
             * this as a comma count, described the format in a comment, and only
             * then read `bulkEncode`, which does not use commas at all. Read the
             * encoder, do not describe it.
             *
             * A malformed or absent blob counts as one key rather than zero: the
             * ROUND TRIP is the cost and it happened either way.
             */
            const head = encoded ? /^([0-9]+)\n/.exec(String(encoded)) : null;
            const n = head ? (parseInt(head[1], 10) || 1) : 1;
            note(`${prefix || ''}<bulk>`, n);
            return many.apply(this, arguments);
        };
    }
    return true;
}

/** Test-only: forget that the wrap happened, so a rig can install again. */
export function readMeterUninstallForTest() { installed = false; }
