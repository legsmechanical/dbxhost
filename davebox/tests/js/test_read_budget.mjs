/* tests/js/test_read_budget.mjs — a screen's ROUND-TRIP BUDGET, enforced.
 *
 * ⭐ WHY. Every slow thing dAVEBOx has hit is the screen asking the sound engine
 * for a value and waiting — a full SPI round trip, ~2.9 ms, against a ~10.6 ms
 * tick. So a handful per tick IS the budget. Every fix so far (snapshot recall
 * 600 ms -> 150 ms; the automation stall) was found by reasoning backwards from
 * a symptom a user had already felt. This is the thing that catches the NEXT one
 * before he feels it: drive a real screen, count what it asks for, fail if it
 * asks for too much.
 *
 * ⚠⚠ THE UNIT IS A COUNT OF READS, NEVER MILLISECONDS. The mailbox-lane work
 * (`param-write-ring`) changes what a read COSTS — reads stop queueing behind
 * writes — so a time-based cap would need re-baselining the day that lands and a
 * count-based one would not. Counts also mean the same number off-device and on.
 *
 * ⚠ THE CAPS ARE MEASURED, NOT CHOSEN. Each was read off this rig and then given
 * headroom, and the assertion PRINTS the number — so a regression reads "was 3,
 * now 19" rather than just "failed". Raising a cap is a decision to make on
 * purpose, with the new number in the diff.
 *
 * ⚠ STEADY STATE, not the first ticks. Opening a screen legitimately reads the
 * contract, the hierarchy and every visible value; that burst is not the bug.
 * The bug is a screen that keeps paying while nothing is happening. So the rig
 * warms up, resets the meter, and measures the quiet part.
 *
 * Modules are REAL — noisemaker (the one Josh plays, and the one whose macro
 * made the automation stall worst) and minijv (the fleet's heaviest contract,
 * 366 knobs across 57 levels) — taken from the 100-module device capture.
 */

import { readFileSync } from 'fs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const FLEET = JSON.parse(readFileSync('../tests/fixtures/module-contracts.json', 'utf8'));
const modOf = (id) => {
    const m = (FLEET.modules || []).find((x) => x && x.id === id);
    if (!m) throw new Error(`fixture: ${id} is not in the device capture`);
    return m;
};

/* ---- host surface -------------------------------------------------------- */
const ASSIGN = Object.create(null);
/*
 * ⚠⚠ THE MODULATION ORACLE MUST ANSWER, or the rig measures a path the device
 * does not take. davebox's `isParamModulated` asks `<key>:modulated` first and
 * takes '1'/'0' as final; ANY other answer — including the '' an unserved key
 * returns — drops it into a two-more-reads fallback that can never conclude, so
 * it re-runs on every rotation. A stub answering '' for everything therefore
 * measured THREE reads per parameter where the device pays one, and the whole
 * budget would have been calibrated against a fiction.
 *
 * `oracleServed` flips it off deliberately for the one case below that bounds
 * what happens when the host genuinely does not serve it.
 */
let oracleServed = true;
/* Keys the oracle should answer YES for — the modulated path is a different
 * budget and it is the one the 09-07 automation stall lived on. */
let modulatedKeys = new Set();
/* ⚠ The rig's OWN record of every key read, for assertions about WHICH keys were
 * asked for. The meter deliberately keeps only the WORST tick's histogram — that
 * is what diagnoses a spike — so asking it "was `:effective` ever read?" samples
 * one tick out of a hundred and answers no for the wrong reason. Obtain the
 * value; do not infer it from a summary built for something else. */
let seenKeys = [];
/* A hook the library can be temporarily mutated to call, so a question about
 * "does this code even run?" is answered by OBSERVATION rather than by reading.
 * Inert unless BUDGET_DEBUG is set; prints once per distinct message so a
 * per-tick probe does not produce 120 lines. */
const probeSeen = new Set();
globalThis.__probe = (msg) => {
    if (!process.env.BUDGET_DEBUG) return;
    const s = String(msg);
    if (probeSeen.has(s) || probeSeen.size > 6) return;
    probeSeen.add(s);
    console.log('         PROBE ' + s.slice(0, 300));
};
globalThis.shadow_get_param = (slot, key) => {
    seenKeys.push(String(key));
    if (oracleServed && typeof key === 'string' && key.endsWith(':modulated'))
        return modulatedKeys.has(key.slice(0, -':modulated'.length)) ? '1' : '0';
    return (key in ASSIGN ? ASSIGN[key] : '');
};
globalThis.shadow_set_param = (slot, key, val) => { ASSIGN[key] = String(val); return 1; };
globalThis.shadow_get_params = () => '';
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.set_pixel = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;

/* ⚠⚠ TRIPWIRE: the tick wrapper swallows exceptions into a log file, so a tick
 * that died on line one reads as a very cheap tick — which would PASS a budget
 * test. A dead tick must fail, not score well. */
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
for (const fn of ['host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const METER = await import('../../ui/ui_readmeter.mjs');
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

/* ⚠ Installed AFTER the stubs are in place — it wraps whatever the globals hold
 * at install time, which on the device is the host's real bindings. */
METER.readMeterUninstallForTest();
METER.installReadMeter();

const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) { METER.readMeterTick(); snd.soundTick(); } };
const click = () => { cc(3, 127); cc(3, 0); };

function loadModule(track, id) {
    const m = modOf(id);
    ASSIGN['synth:module'] = id;
    ASSIGN['synth:ui_hierarchy'] = JSON.stringify(m.ui_hierarchy || {});
    ASSIGN['synth:chain_params'] = JSON.stringify(m.chain_params || []);
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
    GS.activeTrack = track;
    snd.soundExit();
    snd.soundEnter(track, track);
    ticks(4);
    for (let guard = 0; snd.soundViewForTest() !== 1 /* VIEW_EDIT */; guard++) {
        assert(guard < 8, 'rig: never reached the module editor — view ' + snd.soundViewForTest());
        click(); ticks(4);
    }
    ticks(30);   /* let the contract, the plan and the first values settle */
    assert(snd.soundPPForTest().on, 'rig: the grid did not take the screen for ' + id);
}

/* Measure the QUIET cost of a screen: n ticks with no input at all. */
function idleCost(n) {
    METER.readMeterReset();
    seenKeys = [];
    ticks(n);
    return METER.readMeterReport();
}

const CAPS = {
    /* Measured on this rig, then given headroom. Print-and-compare, so a
     * regression names its own number. */
    /*
     * ⭑ MEASURED 2026-09-07 at 1.78 reads/tick idle for BOTH noisemaker and
     * minijv — the same number for a 14-level module and a 57-level one, which
     * is the shape you want: idle cost follows the ROTATION, not the contract.
     *
     * ⚠⚠ AND IT IS TWO READS PER PARAMETER, NOT ONE. The top keys are
     * `<key>:modulated` and `<key>` — so HALF the idle cost of every module
     * editor is asking "is this modulated?" about a parameter whose answer
     * changes only when a routing does, which the UI already knows about. That
     * is the next thing to take out (board item 3/4), and this cap is what will
     * show it landing: the number should fall to ~1.
     */
    idleMean: 2.0,     /* measured 1.78 */
    idleWorst: 3,      /* measured 2 */
    walkMean: 5,       /* measured 4.13 — a page change reads its new page's values */
    walkWorst: 22,     /* measured 18 — the arrival tick is the expensive one */
};

for (const id of ['noisemaker', 'minijv']) {
    step(`⭐ ${id}: a SETTLED editor costs almost nothing per tick`, () => {
        loadModule(2, id);
        const r = idleCost(120);
        console.log(`         ${id} idle: mean ${r.meanCalls.toFixed(2)} calls/tick,`
                  + ` worst ${r.worstCalls}, top ${r.top.slice(0, 3).join(' ') || '-'}`);
        /* ⚠ A CONTROL FIRST. A rig that never ticks, or a tick that died, scores
         * a perfect zero — the best-looking possible result and the least real.
         * The screen must be asking for SOMETHING. */
        assert(r.ticks === 120, `rig: ${r.ticks} ticks counted, expected 120`);
        assert(r.meanCalls > 0,
               'control: a live editor reads SOMETHING each tick — zero means the tick is dead');
        assert(r.meanCalls <= CAPS.idleMean,
               `idle cost ${r.meanCalls.toFixed(2)} reads/tick is over the ${CAPS.idleMean} budget`
               + ` — top keys: ${r.top.join(' ')}`);
        assert(r.worstCalls <= CAPS.idleWorst,
               `one tick spent ${r.worstCalls} reads (cap ${CAPS.idleWorst}) — top keys: ${r.top.join(' ')}`);
    });
}

step('⭐⭐ walking the pages does not multiply the idle cost', () => {
    loadModule(2, 'minijv');
    METER.readMeterReset();
    for (let i = 0; i < 12; i++) { cc(14, 1); ticks(6); }
    const r = METER.readMeterReport();
    console.log(`         minijv page walk: mean ${r.meanCalls.toFixed(2)} calls/tick,`
              + ` worst ${r.worstCalls}, top ${r.top.slice(0, 3).join(' ') || '-'}`);
    assert(r.meanCalls > 0, 'control: walking pages reads something');
    /* A page change legitimately reads its new values — the budget here is
     * looser than idle, and its job is to catch a walk that re-reads the WHOLE
     * contract per page rather than the page's own keys. */
    assert(r.meanCalls <= CAPS.walkMean,
           `a page walk costs ${r.meanCalls.toFixed(2)} reads/tick (cap ${CAPS.walkMean})`
           + ` — top keys: ${r.top.join(' ')}`);
    assert(r.worstCalls <= CAPS.walkWorst,
           `the worst walk tick spent ${r.worstCalls} reads (cap ${CAPS.walkWorst})`
           + ` — top keys: ${r.top.join(' ')}`);
});

/*
 * ⚠⚠ WHAT AN UNSERVED ORACLE COSTS — bounded, because it is a real device
 * shape, not a rig artifact.
 *
 * `isParamModulated` asks `<key>:modulated` and treats only '1'/'0' as an
 * answer. An unserved key comes back '' — not null — so the fallback fires,
 * spends TWO more reads, and still cannot conclude, which means it pays again
 * on the next rotation and forever. Any component whose host does not serve
 * that subkey therefore costs ~3× the idle budget for as long as its screen is
 * up, silently, with nothing on screen to say so.
 *
 * This is the same shape as the automation stall fixed on 2026-09-07: a slot
 * read as a flag, an unserved key answering '', and a fallback that never stops
 * firing. Pinned as a RATIO rather than an absolute, so it measures the
 * multiplier and not this rig's baseline.
 */
step('⚠⚠ an UNSERVED `:modulated` oracle multiplies the idle cost — bounded, and it is not a rig artifact', () => {
    loadModule(2, 'noisemaker');
    oracleServed = true;
    const served = idleCost(120);
    oracleServed = false;
    ticks(20);                       /* let the cache turn over onto the new answer */
    const unserved = idleCost(120);
    const ratio = unserved.meanCalls / (served.meanCalls || 1);
    console.log(`         oracle served ${served.meanCalls.toFixed(2)} -> unserved`
              + ` ${unserved.meanCalls.toFixed(2)} calls/tick (${ratio.toFixed(2)}x)`);
    assert(served.meanCalls > 0 && unserved.meanCalls > 0, 'control: both cases read something');
    assert(ratio > 1.2,
           'control: the fallback really is more expensive — if this stops being true the '
           + 'oracle changed and this test is measuring nothing');
    assert(ratio <= 3.5,
           `an unserved oracle now costs ${ratio.toFixed(2)}x idle (was ~3x when measured). `
           + 'If this rose, the fallback got wider; if it fell, someone fixed it — update the bound.');
    oracleServed = true;
});

/*
 * ⚠⚠ THE MODULATED PATH IS A SECOND BUDGET, and until this case existed the rig
 * never entered it: every key answered "not modulated", so
 * `refreshModulatedValues` early-returned and its whole per-tick cost was
 * invisible. A mutation that renamed its read-budget constant SURVIVED, which is
 * how the gap was found — a test that cannot reach a path cannot budget it.
 *
 * This is the shape that cost a live take on 2026-09-07: a modulated key is
 * re-read EVERY tick (`<key>:effective`) so the driven-value dot can move, on
 * top of the `:base` the cursor asks for. That is correct and wanted — it is
 * what makes an LFO visible — but it is a per-tick price that must stay bounded
 * and must scale with the number of MODULATED params, never with the page.
 */
step('⭐⭐ marking params MODULATED costs a BOUNDED amount per tick', () => {
    loadModule(2, 'noisemaker');
    const plain = idleCost(120);

    /* Modulate two params that are actually on the grid, taken from the page the
     * editor is showing rather than names invented here. */
    const page = snd.soundEditorPageForTest();
    const keys = ((page && page.keys) || []).slice(0, 2);
    assert(keys.length === 2, 'rig: the page has fewer than two keys to modulate');
    modulatedKeys = new Set(keys.map((k) => `synth:${k}`));
    ticks(40);                       /* let the cache turn over onto the new answer */
    const mod = idleCost(120);

    if (process.env.BUDGET_DEBUG) {
        const suf = {};
        for (const k of seenKeys) { const m = /(:[a-z]+)$/.exec(k); const t = m ? m[1] : '(plain)'; suf[t] = (suf[t]|0)+1; }
        console.log('         DEBUG suffixes:', JSON.stringify(suf), 'modulating:', [...modulatedKeys].join(','));
    }
    console.log(`         plain ${plain.meanCalls.toFixed(2)} -> 2 modulated`
              + ` ${mod.meanCalls.toFixed(2)} calls/tick, worst ${mod.worstCalls},`
              + ` top ${mod.top.slice(0, 3).join(' ')}`);
    /* ⚠ CONTROL: if this is not more expensive, the refresh is not running and
     * the budget below is measuring nothing — which is exactly the state this
     * case was added to end. */
    assert(mod.meanCalls > plain.meanCalls,
           'control: a modulated param must cost MORE per tick — if not, refreshModulatedValues '
           + 'is not being reached and this case is inert again');
    /*
     * ⚠⚠ AN OPEN QUESTION THIS TEST FOUND AND DOES NOT ANSWER — recorded here
     * rather than asserted, because I could not confirm the mechanism.
     *
     * `refreshModulatedValues` is supposed to read `<key>:effective` once a tick
     * for every modulated key on the page — that is what moves the driven-value
     * DOT under an LFO. In this rig, with two page keys reporting modulated, the
     * cost DOES rise (1.78 -> 2.98 reads/tick) but `:effective` is never asked
     * for ONCE in 120 ticks. The whole rise is `:modulated` + `:base`, i.e. the
     * value cursor, not the refresh.
     *
     * So either the refresh is not reached on this path, or `modCache` and
     * `page.keys` are keyed differently and `modKeys` comes out empty. Both are
     * worth knowing: if it is the second, the modulation dot is dead on the
     * device too, and nothing on screen would say so.
     *
     * ⚠ It is NOT asserted either way. An assertion for a mechanism I have not
     * traced is the exact failure this arc has been paying for — a claim that
     * reads as verification. The BOUND below stands on measured numbers alone,
     * and the question is on the board.
     */
    /* The ceiling is what matters: marking params modulated must cost a BOUNDED
     * amount per tick, not an amount that grows with how many are modulated.
     * Measured at +1.20 reads/tick for two; the cap is what fails if that starts
     * scaling with the page. */
    assert(mod.meanCalls <= plain.meanCalls + 1.5,
           `modulation added ${(mod.meanCalls - plain.meanCalls).toFixed(2)} reads/tick `
           + '(measured +1.20 for two params). More than the cap means the per-tick cost '
           + 'started scaling with the number of modulated params instead of being budgeted.');
    modulatedKeys = new Set();
});

if (swallowed) { console.error('  FAIL — a tick threw and was swallowed:\n' + swallowed); failed = 1; }
if (failed) { console.error('test_read_budget: FAIL'); process.exit(1); }
console.log('test_read_budget: PASS');
process.exit(0);
}
main();
