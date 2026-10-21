import './_bulk_get_stub.mjs';
/* tests/js/test_automation_add_lane.mjs — "+ Add lane" on the AUTOMATION list
 * (Josh, 2026-10-21: "we should also allow empty lanes to be created from the
 * automation lane list … that way a user could choose which mode they start in
 * before inputting automation"; the target is chosen in the MACROS picker, "it's
 * how you choose macros and lfo destination already").
 *
 * The REAL gesture, end to end: open AUTOMATION from the bank map, jog to the
 * row, click, walk the picker, click — and assert what reached the DSP and what
 * is on screen afterwards (the list, the new lane's settings open).
 *
 * Harness: the whole UI (ui.js + onMidiMessageInternal + tick) over a
 * host_module_get_param stub answering pa_list. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
let LIST = '';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob);
    for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? LIST : '');
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
const printed = [];
globalThis.clear_screen = () => { printed.length = 0; };
globalThis.print = (x, y, t) => { printed.push(String(t)); };
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.flush_display = () => {};
globalThis.pixel_print = (x, y, t) => { printed.push(String(t)); };
globalThis.move_midi_internal_send = () => {}; globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
S.touchHoldMs = 0;
const { BANKS, BANK_AUTOMATION, SEQ_AUTO_TARGETS } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
auto.automationResolveOffForTest(true);
const ab = await import('../../ui/ui_automation_bank.mjs');
const render = await import('../../ui/ui_render.mjs');
const movy = await import('../../ui/ui_movy.mjs');
const snd = await import('../../ui/ui_sound.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const back = () => { cc(51, 127); cc(51, 0); };
const jog = (n) => { for (let i = 0; i < Math.abs(n); i++) cc(14, n > 0 ? 1 : 127); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const pad = (n) => { globalThis.onMidiMessageInternal(new Uint8Array([0x90, n, 100])); globalThis.onMidiMessageInternal(new Uint8Array([0x80, n, 0])); };
const draw = () => { globalThis.clear_screen(); render.drawUI(); };
const hints = () => { draw(); return JSON.stringify(movy.kitHintsForTest()); };
const T = 0, C = 0;
const menu = () => S.autoBank || {};
const VIEW_KNOB_TARGET = 12, VIEW_KNOB_PARAM = 13;
const openByMap = () => {
    for (let i = 0; i < 4 && (S.activeBank === BANK_AUTOMATION || snd.soundOpen()); i++) { back(); ticks(2); }
    cc(3, 127); ticks(2);                                /* jog down: the map */
    assert(S.bankMapUp, 'rig: holding the jog did not show the bank map');
    pad(85); cc(3, 0); ticks(3);                         /* CTRL column: AUTO, opened on the release */
    assert(S.activeBank === BANK_AUTOMATION && menu().menu === true, 'rig: the AUTO pad did not open the list');
};
/* Walk the picker's cursor to the row whose id is `id`, then click. */
const pickRow = (id) => {
    const rows = snd.soundKnobPickRowsForTest();
    const i = rows.indexOf(id);
    assert(i >= 0, 'the picker has no ' + id + ' row: ' + JSON.stringify(rows));
    jog(-rows.length); jog(i); click(); ticks(2);
};
const pickParam = (key) => {
    const ps = snd.soundKnobParamsForTest().map(p => p.key);
    const i = ps.indexOf(key);
    assert(i >= 0, 'the param list has no ' + key + ': ' + JSON.stringify(ps));
    jog(-ps.length); jog(i); click(); ticks(2);
};

step('⭐ the list ends with + Add lane, then Clear all; the row hints CLK ADD', () => {
    LIST = '0 0 9 8 0:synth:cutoff 0\n'; auto.automationRefreshPresence();
    openByMap();
    const n = ab.autoBankRows(T, C).length;
    assert(n === 1, 'rig: one lane listed, got ' + n);
    jog(1); ticks(1);
    assert(menu().sel === 1, 'the cursor did not reach the row after the lane');
    assert(hints() === JSON.stringify([['CLK', 'ADD']]), 'hints on + Add lane: ' + hints());
    assert(printed.indexOf('+ Add lane') >= 0, '+ Add lane is not on screen: ' + JSON.stringify(printed));
    jog(1); ticks(1);
    assert(menu().sel === 2 && hints() === JSON.stringify([['CLK', 'CLEAR']]), 'Clear all is the last row');
    jog(5); ticks(1);
    assert(menu().sel === 2, 'the cursor ran past Clear all');
    jog(-1); ticks(1);
});

step('⭐⭐ click → the MACROS picker, choosing a LANE: no (None), no SnapMorph; Levels → Volume adds an EMPTY lane and lands on its settings', () => {
    sets.length = 0;
    click(); ticks(3);
    assert(snd.soundOpen() && snd.soundViewForTest() === VIEW_KNOB_TARGET, 'the click did not open the target picker (view ' + snd.soundViewForTest() + ')');
    assert(snd.soundKnobPickForForTest(), 'the picker is not choosing a lane');
    const rows = snd.soundKnobPickRowsForTest();
    assert(rows.indexOf('') < 0, '(None) is offered for a lane: ' + JSON.stringify(rows));
    assert(!rows.some(id => /morph/i.test(id)), 'SnapMorph is offered for a lane: ' + JSON.stringify(rows));
    assert(JSON.stringify(snd.soundViewPath()).indexOf('Add lane') >= 0, 'the crumb does not say Add lane: ' + JSON.stringify(snd.soundViewPath()));
    pickRow('level');
    assert(snd.soundViewForTest() === VIEW_KNOB_PARAM, 'Levels did not open its params');
    /* Back from the params is the targets, still choosing a lane. */
    back(); ticks(2);
    assert(snd.soundViewForTest() === VIEW_KNOB_TARGET && snd.soundKnobPickForForTest(), 'Back from the params left the lane pick');
    pickRow('level');
    LIST = '0 0 9 8 0:synth:cutoff 0\n0 0 41 0 0:slot:volume 0\n';     /* what the DSP lists after pa_add */
    pickParam('volume');
    const add = sets.filter(x => x.indexOf('t0_pa_add=') === 0);
    assert(add.length === 1 && add[0] === 't0_pa_add=0 0:slot:volume', 'pa_add: ' + JSON.stringify(add));
    assert(sets.some(x => x.indexOf('t0_c0_undo_checkpoint=') === 0), 'no undo checkpoint');
    assert(!snd.soundOpen(), 'the picker is still open');
    assert(S.activeBank === BANK_AUTOMATION && menu().menu === true, 'not back on the AUTOMATION list');
    assert(menu().ops && menu().ops.row.target === '0:slot:volume', 'the new lane\'s settings are not open: ' + JSON.stringify(menu().ops && menu().ops.row));
    const r = ab.autoBankRows(T, C).find(x => x.target === '0:slot:volume');
    assert(r && r.count === 0 && r.active, 'the new lane is not listed empty and on: ' + JSON.stringify(r));
    assert(!snd.soundKnobPickForForTest(), 'the lane intent outlived its commit');
    /* ...and it stays listed through the re-read that follows the write. */
    ticks(40);
    assert(ab.autoBankRows(T, C).some(x => x.target === '0:slot:volume'), 'the re-read dropped the new lane');
});

step('Back from the picker\'s top lands on the list, cursor where it was, nothing added', () => {
    back(); ticks(1);                                    /* close the ops */
    const n = ab.autoBankRows(T, C).length;
    jog(-9); jog(n); ticks(1);
    assert(menu().sel === n, 'rig: not on + Add lane');
    sets.length = 0;
    click(); ticks(3);
    assert(snd.soundViewForTest() === VIEW_KNOB_TARGET, 'rig: the picker did not open');
    back(); ticks(2);
    assert(!snd.soundOpen(), 'Back left the picker open');
    assert(S.activeBank === BANK_AUTOMATION && menu().menu === true && !menu().ops, 'Back did not land on the list');
    assert(menu().sel === n, 'the cursor moved: ' + menu().sel);
    assert(!sets.some(x => /pa_add|undo_checkpoint/.test(x)), 'Back wrote ' + JSON.stringify(sets));
    assert(!snd.soundKnobPickForForTest(), 'the lane intent outlived Back');
});

step('picking a parameter that already has a lane adds nothing and opens THAT lane', () => {
    sets.length = 0;
    click(); ticks(3);
    pickRow('level');
    pickParam('volume');
    assert(!sets.some(x => /pa_add|undo_checkpoint/.test(x)), 'an existing lane was added again: ' + JSON.stringify(sets));
    assert(menu().ops && menu().ops.row.target === '0:slot:volume', 'the existing lane is not open');
});

step('a bank target offers only what a lane can play, and records to the same target a turn of that knob would', () => {
    back(); ticks(1);
    const n = ab.autoBankRows(T, C).length;
    jog(-9); jog(n); click(); ticks(3);
    const banks = snd.soundKnobPickRowsForTest().filter(id => id.indexOf('bank:') === 0);
    assert(banks.length > 0, 'rig: no bank rows on a melodic track');
    pickRow(banks[0]);
    const ps = snd.soundKnobParamsForTest();
    assert(ps.length > 0, 'the bank lists nothing');
    sets.length = 0;
    pickParam(ps[0].key);
    const add = sets.filter(x => x.indexOf('t0_pa_add=') === 0);
    assert(add.length === 1, 'pa_add: ' + JSON.stringify(sets));
    const key = add[0].split(' ')[1].split(':')[2];
    const sat = SEQ_AUTO_TARGETS[key];
    assert(/^0 seq:0:/.test(add[0].slice('t0_pa_add='.length)) && sat && sat.automatable, 'not an automatable seq target: ' + add[0]);
});

if (failed) { console.log('FAIL: + Add lane'); process.exit(1); }
console.log('PASS: + Add lane — the picker, the empty lane, its settings');
}
main().catch(e => { console.error(e); process.exit(1); });
