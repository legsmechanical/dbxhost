import './_bulk_get_stub.mjs';
/* tests/js/test_global_macros_s2.mjs — the GLOBAL macros drive TRACK legs,
 * live only (slice 2), end to end through the REAL dispatch (ui.js
 * onMidiMessageInternal + the tick):
 *
 *   - Session map, MACROS, touch K1 + click: the SCOPE list (T1..T8); jog to
 *     T3, click, the track's target list, Synth, Cutoff
 *   - touch K1: the header names the track, `T3 CUTOFF`; a turn writes exactly
 *     ONE `synth:cutoff` on slot 2, and NO automation reaches the DSP even with
 *     the transport playing and Record armed (a positive control proves the
 *     probe would see one)
 *   - T3's type change asks, counting the global leg; Yes leaves K1 UNASSIGNED
 *   - a module swap on T3's synth asks, counting it; Yes leaves it UNASSIGNED
 *   - a second leg on T5: the cell reads MAC1 and a %, the header keeps the
 *     first leg's track, and one turn writes BOTH slots (2 and 4) */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

/* Per-slot chain params: slot 2 is T3's chain, slot 4 is T5's. */
const CP = JSON.stringify([
    { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
    { key: 'reso', name: 'Resonance', type: 'float', min: 0, max: 1, step: 0.01 },
]);
const P = {};
for (const sl of [2, 4]) {
    P[sl + '|synth:module'] = 'nusaw';
    P[sl + '|synth:name'] = 'NuSaw';
    P[sl + '|synth:chain_params'] = CP;
    P[sl + '|synth:cutoff'] = '0.5';
    P[sl + '|synth:reso'] = '0.2';
}
/* Slot 6 (T7): a drum rack whose pad params live under a `child_prefix`
 * level, as DR32's do — the module answers `pad5_cutoff`, never `cutoff`. */
P['6|synth:module'] = 'dr32';
P['6|synth:name'] = 'DrumRack32';
P['6|synth:chain_params'] = JSON.stringify([
    { key: 'ui_current_pad', name: 'Pad', type: 'int', min: 1, max: 32 },
    { key: 'cutoff', name: 'Filter Freq', type: 'float', min: 0, max: 1, step: 0.01 },
]);
P['6|synth:ui_hierarchy'] = JSON.stringify({ levels: {
    root: { name: 'DrumRack32', params: [{ level: 'pad_shape', label: 'Shape' }], knobs: [] },
    pad_shape: { name: 'Shape', child_prefix: 'pad', child_count: 32, child_index_base: 1,
                 child_index_param: 'ui_current_pad',
                 params: [{ key: 'ui_current_pad', name: 'Pad', type: 'int', min: 1, max: 32 },
                          { key: 'cutoff', type: 'float', min: 0, max: 1 }] },   /* name only in chain_params */
} });
P['6|synth:ui_current_pad'] = '5';
P['6|synth:pad5_cutoff'] = '0.4';
P['6|synth:pad9_cutoff'] = '0.7';
let writes = [];          /* shadow_set_param(slot, key, val) */
let hostSets = [];        /* every key davebox sends its own DSP */
let jsErr = '';
globalThis.shadow_get_param = (slot, key) => (P[slot + '|' + key] != null ? P[slot + '|' + key] : '');
globalThis.shadow_set_param = (slot, key, val) => { writes.push({ slot, key, val: String(val) }); P[slot + '|' + key] = String(val); return 1; };
globalThis.host_module_set_param = (k) => { hostSets.push(String(k)); };
globalThis.host_module_get_param = () => '';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => ''; globalThis.host_file_exists = () => false;
globalThis.host_ui_publish = () => false;
globalThis.host_write_file = (p, t) => { if (/jserr/.test(p)) jsErr = String(t); return true; };
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_seed_module_defaults = () => {};   /* the module swap's load (applyModulePick) */

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
/* The bulk read goes through host_module_get_params: record its keys too. */
const _bulk = globalThis.host_module_set_params;
globalThis.host_module_set_params = (blob) => {
    const lines = String(blob || '').split('\n');
    for (const l of lines) if (/_pa_|^pa_/.test(l)) hostSets.push(l);
    return typeof _bulk === 'function' ? _bulk(blob) : true;
};
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const Pm = await import('../../ui/ui_pure.mjs');
const kit = await import('../../ui/ui_movy.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const { INSTR_MIDI_CH } = await import('../../ui/ui_constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = true; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = i + 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const tick = (n) => { for (let i = 0; i < (n || 1); i++) globalThis.tick(); };
const click = () => { cc(3, 127); cc(3, 0); };
const jog = (n) => { for (let i = 0; i < Math.abs(n); i++) cc(14, n > 0 ? 1 : 127); };
let hdr = [];
let crumbs = null;
kit.setKitHudSink((fam, d) => {
    if (fam === 'KitTouchedHeader') hdr.push(String(d.name));
    if (fam === 'KitCrumbs') crumbs = d.parts.slice();
});
const touchedName = () => { hdr = []; S.screenDirty = true; tick(); return hdr.length ? hdr[hdr.length - 1] : null; };
const release = (k) => { note(k, 0); tick(40); S.cardHoldUntil = -1; };
const MACROS_PAD = Pm.bankMapPadForCell(Pm.SESS_PAD_MAP.ctrl.col, 0);
const mapTap = (pad) => { cc(3, 127); note(pad, 100); note(pad, 0); cc(3, 0); tick(2); };
const drawn = (k) => snd.soundMacrosForTest().drawn[k];

/* Assign knob `k` (a fresh one, or + Add target on its leg list) to
 * T<track+1> Synth > `param`, all through the dispatch. */
let lastParamRows = [];
function assignVia(k, track, param, addRow) {
    note(k, 127); tick();
    click(); tick(3);
    if (addRow) {
        /* the leg list: walk to + Add target */
        const rows = snd.soundKnobLegRowsForTest();
        const at = rows.findIndex((r) => r.kind === 'add');
        snd.soundSetLegRowForTest(at);
        click(); tick(3);
    }
    let sc = snd.soundGmacScopeForTest();
    assert(sc.view, 'the click did not open the SCOPE list (view ' + snd.soundViewForTest() + ')');
    jog(track - sc.idx); tick();
    sc = snd.soundGmacScopeForTest();
    assert(sc.idx === track && /^T\d /.test(sc.rows[track]), 'scope cursor ' + sc.idx + ': ' + sc.rows[sc.idx]);
    click(); tick(3);
    const tg = snd.soundKnobPickRowsForTest();
    const si = tg.indexOf('synth');
    assert(si >= 0, 'no Synth on T' + (track + 1) + "'s target list: " + tg);
    assert(tg.indexOf('levels') < 0 && !tg.some((id) => /morph|^au/.test(id)), 'the global list offers Levels / SnapMorph / Sample: ' + tg);
    jog(si - snd.soundKnobTargetIdxForTest()); click(); tick(3);
    lastParamRows = snd.soundKnobParamsForTest();
    const pl = lastParamRows.map((p) => p.key);
    const pi = pl.indexOf(param);
    assert(pi >= 0, 'no ' + param + ' on the param list: ' + pl);
    jog(pi - snd.soundKnobParamIdxForTest()); click(); tick(3);
    release(k);
    tick(12);                                     /* the seed: metadata, then the value */
}

step('setup: Session on its MACROS bank', () => {
    tick(2);
    mapTap(MACROS_PAD);
    assert(snd.soundGlobalMacros() && snd.soundResting(), 'the global page is not resting open');
});

step('⭐⭐ touch K1 + click: the SCOPE list names T1..T8 by instrument; T3 > Synth > Cutoff assigns a T3 leg', () => {
    note(0, 127); tick();
    click(); tick(3);
    const sc = snd.soundGmacScopeForTest();
    assert(sc.view && sc.rows.length >= 8, 'no scope list: ' + JSON.stringify(sc));
    assert(/^T3 /.test(sc.rows[2]) && /^T8/.test(sc.rows[7]), 'rows: ' + sc.rows);
    /* the crumb trail's head: there is no track here (S.track is -1), so it
     * must not read "T0" (device, 2026-11-22) */
    crumbs = null; S.screenDirty = true; tick();
    assert(crumbs && crumbs[0] === 'Global', 'crumb head: ' + JSON.stringify(crumbs));
    cc(51, 127); cc(51, 0); tick();               /* Back: out to the page, nothing assigned */
    note(0, 0); tick(40);
    assert(!S.globalMacros[0], 'Back assigned something');
    assignVia(0, 2, 'cutoff');
    const g = S.globalMacros[0];
    assert(g && g.legs.length === 1 && g.legs[0].track === 2 && g.legs[0].comp === 'synth' && g.legs[0].key === 'cutoff',
           'store: ' + JSON.stringify(g));
    assert(snd.soundResting(), 'the commit did not land back on the resting page');
});

step('⭐⭐ touch K1: the header reads T3 CUTOFF; a turn writes ONE synth:cutoff on slot 2 — and no automation, even playing + Record', () => {
    S.playing = true; S.recordArmed = true;
    note(0, 127);
    assert(touchedName() === 'T3 CUTOFF', 'touched header: ' + touchedName());
    writes = []; hostSets = [];
    cc(71, 3); tick(6); auto.automationTick(); tick(4);
    const w = writes.filter((x) => /cutoff/.test(x.key));
    assert(w.length === 1 && w[0].slot === 2 && w[0].key === 'synth:cutoff', 'writes: ' + JSON.stringify(writes));
    assert(Number(w[0].val) > 0.5, 'the turn did not raise it: ' + w[0].val);
    release(0); auto.automationTick(); tick(4);
    const pa = hostSets.filter((k) => /_pa_|^pa_/.test(k));
    assert(pa.length === 0, 'a global macro reached the automation owner: ' + pa);
    /* ⭑ POSITIVE CONTROL: the probe sees an automation edit when one is made. */
    hostSets = [];
    auto.automationParamEdit(2, 0, 2, 'synth:cutoff', '0.7', '0.6');
    auto.automationTick(); tick(4);
    auto.automationParamTouch(2, 0, 2, 'synth:cutoff', false);
    auto.automationTick(); tick(30); auto.automationTick();
    assert(hostSets.some((k) => /_pa_/.test(k)), 'control: a real automation edit reached no _pa_ key — the probe is blind');
    S.playing = false; S.recordArmed = false; tick(4);
});

step('⭐⭐ T3 type change (to MIDI) asks, counting the global leg; Yes leaves K1 UNASSIGNED', () => {
    snd.requestInstrChange(2, INSTR_MIDI_CH);
    assert(S.confirmTypeChange && S.confirmTypeChange.macros === 1, 'confirm: ' + JSON.stringify(S.confirmTypeChange));
    jog(1); tick();
    assert(S.confirmTypeChangeSel === 0, 'sel ' + S.confirmTypeChangeSel);
    click(); tick(3);
    assert(!S.confirmTypeChange, 'the confirm stayed up');
    assert(S.globalMacros[0] === null, 'the leg survived: ' + JSON.stringify(S.globalMacros[0]));
    note(0, 127);
    assert(touchedName() === 'K1 UNASSIGNED', 'header: ' + touchedName());
    release(0);
    S.trackRoute[2] = 0; tick(2);                 /* back to a Schwung chain for the next step */
});

step('⭐⭐ a module swap on T3\'s synth asks, counting the global leg; Yes leaves K1 UNASSIGNED', () => {
    assignVia(0, 2, 'cutoff');
    assert(S.globalMacros[0] && S.globalMacros[0].legs[0].track === 2, 'setup: reassign');
    /* The swap is made where it really is: T3's sound, in Track View. */
    cc(50, 127); cc(50, 0); tick(2);
    assert(!S.sessionView, 'setup: Track View');
    snd.soundRequestModulePickForTest({ id: 'other', name: 'Other' }, { track: 2, slot: 2, comp: 'synth' });
    assert(S.confirmModuleChange && S.confirmModuleChange.macros === 1, 'confirm: ' + JSON.stringify(S.confirmModuleChange));
    S.confirmModuleChangeSel = 0;                 /* Yes (the jog flips it, as for the type change) */
    click(); tick(3);
    assert(!S.confirmModuleChange && S.globalMacros[0] === null, 'not pruned: ' + JSON.stringify(S.globalMacros[0]));
    snd.soundExit();
    cc(50, 127); cc(50, 0); tick(3);
    assert(S.sessionView && snd.soundGlobalMacros(), 'the page did not come back');
    P['2|synth:module'] = 'nusaw';
});

step('⭐ a second leg on T5: MAC1 and a %, the header keeps T3, one turn writes BOTH slots 2 and 4', () => {
    assignVia(0, 2, 'cutoff');
    assignVia(0, 4, 'cutoff', true);
    const g = S.globalMacros[0];
    assert(g && g.legs.length === 2 && g.legs[1].track === 4, 'store: ' + JSON.stringify(g));
    /* the leg list's commit lands on the leg list: back out to the page */
    if (snd.soundViewForTest() !== 19) { cc(51, 127); cc(51, 0); tick(2); }
    tick(12);
    const c = drawn(0);
    assert(c && c.label === 'MAC1' && /%$/.test(c.text), 'cell: ' + JSON.stringify(c));
    note(0, 127);
    assert(/^T3 /.test(touchedName() || ''), 'header: ' + touchedName());
    writes = [];
    cc(71, 4); tick(6);
    const sl = new Set(writes.filter((x) => x.key === 'synth:cutoff').map((x) => x.slot));
    assert(sl.has(2) && sl.has(4) && sl.size === 2, 'slots written: ' + JSON.stringify(writes));
    release(0);
});

step('⭐⭐ a PER-PAD param (a child_prefix level, e.g. DR32): the leg is fixed to the pad focused at assignment — pad5_cutoff, header T7 P5 FILTER FREQ', () => {
    /* the bare key is what the module never answers (device, 2026-11-22: the
     * knob read "--" and a turn did nothing) */
    assignVia(2, 6, 'pad5_cutoff');
    /* the row is named from chain_params with its pad (device: it read "P1 cutoff") */
    assert(lastParamRows.some((r) => r.key === 'pad5_cutoff' && r.label === 'P5 Filter Freq'), 'rows: ' + JSON.stringify(lastParamRows));
    const g = S.globalMacros[2];
    assert(g && g.legs.length === 1 && g.legs[0].key === 'pad5_cutoff' && g.legs[0].track === 6, 'store: ' + JSON.stringify(g));
    if (snd.soundViewForTest() !== 19) { cc(51, 127); cc(51, 0); tick(2); }
    tick(12);
    note(2, 127);
    assert(touchedName() === 'T7 P5 FILTER FREQ', 'header: ' + touchedName());
    writes = [];
    cc(73, 4); tick(6);
    assert(writes.length >= 1 && writes.every((x) => x.slot === 6 && x.key === 'synth:pad5_cutoff'), 'writes: ' + JSON.stringify(writes));
    /* focus moves to pad 9: the macro still drives pad 5 */
    P['6|synth:ui_current_pad'] = '9';
    writes = [];
    cc(73, 4); tick(6);
    assert(writes.length >= 1 && writes.every((x) => x.key === 'synth:pad5_cutoff'), 'after a focus change: ' + JSON.stringify(writes));
    release(2);
});

step('no tick threw', () => { assert(!jsErr, jsErr); });
kit.setKitHudSink(null);
if (failed) { console.error('FAIL: global macros S2'); process.exit(1); }
console.log('PASS: global macros S2 — the scope picker, T<n> headers, per-leg slots, live only, the prunes');
process.exit(0);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
