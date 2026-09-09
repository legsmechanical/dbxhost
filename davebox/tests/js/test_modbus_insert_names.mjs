/* tests/js/test_modbus_insert_names.mjs — an insert's box must say what the
 * EFFECT is, not what its binary is.
 *
 * ⭐ WHY THIS EXISTS. Shipping several effects from ONE binary is the normal
 * case — the docs `default_buses` (#464) added say so, and Airwindows is a
 * single `.so` carrying 500+ effects chosen by `plugin_id`. Declare four of
 * them in a bus and every box reads the SAME module abbreviation over
 * "FX 1".."FX 4": the user cannot tell the compressor from the drive. Upstream
 * #466 fixed this by drawing `<comp>:display_name`; this is davebox's consumer.
 *
 * ⚠⚠ THE TEST THAT MATTERS IS THE READ COUNT, not the label. Falling back to
 * the abbreviation is CORRECT — just uninformative — so every other test in
 * this repo passes with this feature completely inert, and so would a version
 * that re-reads all 8 buses every tick. Both failure modes are silent: one
 * shows the old wrong label, the other spends SLOT_BUSES x BUS_FX_SLOTS SPI
 * round trips a second at ~2.9 ms each.
 * → [[test-the-path-not-the-function]] [[schwung-param-roundtrip-is-the-cost]]
 */
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

let answers = {};
let reads = [];                       /* every key read, in order */
globalThis.shadow_get_param = (slot, k) => { reads.push(k); return (k in answers ? answers[k] : ''); };
globalThis.shadow_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.host_module_set_param = () => {};
globalThis.print = () => {}; globalThis.clear_screen = () => {};
globalThis.text_width = (t) => String(t).length * 6;
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.set_pixel = () => {}; globalThis.flush_display = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_internal_send = () => {};

async function main() {
const M = await import('../../ui/ui_modbus.mjs');
const SLOT = 0, G = 0;

/* One bus, FOUR inserts, ALL the same binary — the case that motivates this. */
const CONFIG = JSON.stringify({
    buses: [{ present: 1, name: 'Drums', orphans: 0, voices: [], sends: [0, 0],
              fx: [{ module: 'airwin' }, { module: 'airwin' },
                   { module: 'airwin' }, { module: 'airwin' }] }],
    main_sends: [0, 0],
});
const NAMES = {
    'buses:config': CONFIG,
    'bus1:fx1:display_name': 'BussColors4',
    'bus1:fx2:display_name': 'Console0Buss',
    'bus1:fx3:display_name': 'Pressure5',
    'bus1:fx4:display_name': 'Drive',
};

const fresh = () => {
    const st = M.modBusInitState();
    answers = Object.assign({}, NAMES);
    M.modBusRefreshConfig(st, SLOT);
    return st;
};

step('four inserts of ONE binary get four DIFFERENT names', () => {
    const st = fresh();
    M.modBusRefreshInsertNames(st, SLOT, G);
    eq([0, 1, 2, 3].map((i) => M.modBusInsertName(st, G, i)),
       ['BussColors4', 'Console0Buss', 'Pressure5', 'Drive'], 'names');
});

step('⚠ an UNRESOLVED read falls back, and never caches an empty label', () => {
    const st = fresh();
    delete answers['bus1:fx2:display_name'];
    answers['bus1:fx3:display_name'] = null;
    M.modBusRefreshInsertNames(st, SLOT, G);
    eq(M.modBusInsertName(st, G, 1), '', 'fx2 must fall back to the abbreviation');
    eq(M.modBusInsertName(st, G, 2), '', 'fx3 must fall back to the abbreviation');
    eq(M.modBusInsertName(st, G, 0), 'BussColors4', 'the resolved ones still answer');
});

/* ---- THE COST. This is the half a render test cannot see. -------------- */

step('⭑ a refresh reads ONLY the open bus, once per insert', () => {
    const st = fresh();
    reads = [];
    M.modBusRefreshInsertNames(st, SLOT, G);
    const dn = reads.filter((k) => k.endsWith(':display_name'));
    eq(dn.length, 4, 'display_name reads');
    if (dn.some((k) => !k.startsWith('bus1:')))
        throw new Error('read a bus that is not the open one: ' + JSON.stringify(dn));
});

step('⭑⭑ the latch: a second entry on the same (slot, bus) reads NOTHING', () => {
    const st = fresh();
    M.modBusRefreshInsertNames(st, SLOT, G);
    if (!M.modBusNamesFresh(st, SLOT, G)) throw new Error('latch never closed');
    reads = [];
    if (!M.modBusNamesFresh(st, SLOT, G)) throw new Error('latch reopened by itself');
    eq(reads.filter((k) => k.endsWith(':display_name')).length, 0, 'reads while latched');
});

step('a DIFFERENT bus is not fresh — names never cross buses', () => {
    const st = fresh();
    M.modBusRefreshInsertNames(st, SLOT, G);
    if (M.modBusNamesFresh(st, SLOT, G + 1)) throw new Error('bus 2 claimed bus 1\'s names');
    if (M.modBusNamesFresh(st, SLOT + 1, G)) throw new Error('another slot claimed these names');
});

step('a CONFIG refresh invalidates — the module behind a box may have changed', () => {
    const st = fresh();
    M.modBusRefreshInsertNames(st, SLOT, G);
    M.modBusRefreshConfig(st, SLOT);
    if (M.modBusNamesFresh(st, SLOT, G))
        throw new Error('stale names survived a config refresh');
});

step('leaving the screen invalidates, so re-entry re-reads after a swap', () => {
    const st = fresh();
    M.modBusRefreshInsertNames(st, SLOT, G);
    M.modBusInvalidateNames(st);
    if (M.modBusNamesFresh(st, SLOT, G)) throw new Error('invalidate did nothing');
});

step('an unresolved config asks for nothing at all', () => {
    const st = M.modBusInitState();
    answers = {};
    M.modBusRefreshConfig(st, SLOT);
    reads = [];
    M.modBusRefreshInsertNames(st, SLOT, G);
    eq(reads.filter((k) => k.endsWith(':display_name')).length, 0,
       'reads against an unresolved config');
    if (M.modBusNamesFresh(st, SLOT, G))
        throw new Error('latched on an unresolved config — it would never retry');
});

console.log(failed ? 'FAIL: test_modbus_insert_names.mjs' : 'PASS: test_modbus_insert_names.mjs');
process.exit(failed);
}
main();
