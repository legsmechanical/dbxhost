/* tests/js/test_instr_pick_sets_route.mjs — picking a Schwung generator on a
 * MOVE-routed track must move the track's ROUTE, not just load the module.
 *
 * Josh, 2026-09-07: "if i change track 1 default from move1 to a schwung
 * instrument, i can load and edit the schwung instrument but the pads only play
 * move1."
 *
 * ⭑ WHY THE ROUTE IS THE WHOLE THING. Pad notes do NOT consult the route in JS:
 * `liveSendNote` queues note on/off through `tN_live_notes` for route 0 AND
 * route 1 alike, and the DSP's own `pfx.route` picks the destination. So "the
 * pads still play Move" is a statement about `t<N>_route` in the DSP — nothing
 * else in davebox can produce it. The module loading is a separate fact, which
 * is exactly why the two can disagree.
 *
 * This drives the REAL gesture through the REAL CC path — Shift+Note to the
 * sound menu, Shift+click to the picker, jog, click — rather than calling the
 * commit directly, because the two paths that apply a generator pick are both
 * gated on the route ALREADY being 0 (`ui_sound.mjs`, commitInstrPick and the
 * reflavour action). A test that called the commit would be testing the branch
 * that cannot be the bug.
 *
 * Two shapes, because they commit differently:
 *   1. nothing to lose  — requestInstrChange applies at once;
 *   2. something to lose — the type-change modal, answered Yes, applies through
 *      performTypeChange, which ALSO writes the automation clears.
 * Shape 2 exists for the write ORDERING: same-track `tN_*` set_params fired in
 * one audio block can coalesce and silently drop the first (see the
 * pendingDefaultSetParams workarounds in ui_dsp_bridge / ui_tick). The route
 * write must not share a callback with another `tN_` write.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
let paList = '';
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? paList : '');
/* A MUTABLE engine. The stock rig answers `synth:module` with a fixed name,
 * which would make "the module loaded" true before the pick — the control this
 * test needs most. Here a slot holds what was actually loaded into it. */
const loaded = {};                       /* `${slot}:${comp}` -> module id */
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k !== 'string') return '';
    const m = k.match(/^(.*):module$/);
    return m ? (loaded[slot + ':' + m[1]] || '') : '';
};
globalThis.shadow_set_param = (slot, k, v) => {
    if (typeof k !== 'string') return;
    const m = k.match(/^(.*):module$/);
    if (m) loaded[slot + ':' + m[1]] = String(v);
};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const A = await import('../../ui/ui_automation.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const { MoveNoteSession } = await import('../../ui/ui_constants.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');

/* Every module write, tagged with the callback it was made from — the ordering
 * is half of what this test is for. */
const writes = [];
let ctxTag = 'init';
globalThis.host_module_set_param = (k, v) => { writes.push([ctxTag, String(k), String(v)]); };
globalThis.host_module_set_params = (blob) => {
    const str = String(blob); let p = 0;
    const nl0 = str.indexOf('\n'); const count = parseInt(str.slice(0, nl0), 10); p = nl0 + 1;
    const rec = () => { const nl = str.indexOf('\n', p); const n = parseInt(str.slice(p, nl), 10);
                        const v = str.slice(nl + 1, nl + 1 + n); p = nl + 1 + n; return v; };
    for (let i = 0; i + 1 < count; i += 2) { const k = rec(), v = rec(); writes.push([ctxTag + ':BULK', k, v]); }
    return true;
};

function ticks(n) {
    for (let i = 0; i < n; i++) {
        S.tickCount++; S.clockMs += 11;
        ctxTag = 'tick#' + S.tickCount; tickmod._tickImpl(); ctxTag = 'between';
    }
}
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
const cc = (d1, d2) => {
    const prev = ctxTag; ctxTag = 'cc(' + d1 + ',' + d2 + ')';
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    ctxTag = prev;
};

/* The module scan is an empty filesystem off-device. */
snd.soundSetGeneratorScanForTest(() => [{ id: 'nusaw', name: 'NuSaw' }, { id: 'obxd', name: 'OB-Xd' }]);

/* The gesture, end to end: Shift+Note to the menu (it lands on the Instrument
 * row), Shift+click to open the picker, jog to `name`, click to commit. */
function pickGenerator(name) {
    cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
    ticks(6);
    const st = snd.soundPickStateForTest();
    if (st.kinds[st.row] !== 'trackto')
        throw new Error('the menu did not land on Instrument: row kind ' + st.kinds[st.row]);
    cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0);
    ticks(4);
    const p = snd.soundEnumPickForTest();
    if (!p) throw new Error('Shift+click did not open the Instrument picker');
    const want = p.options.indexOf(name);
    if (want < 0) throw new Error(name + ' is not offered: ' + JSON.stringify(p.options));
    /* Jog one detent at a time, as the encoder does. The guard is a bound on
     * the list, not a timeout: a picker that ignored the jog would spin. */
    let guard = 0;
    while (snd.soundEnumPickForTest().sel !== want && guard++ <= p.options.length + 2)
        cc(14, snd.soundEnumPickForTest().sel < want ? 1 : 127);
    if (snd.soundEnumPickForTest().sel !== want)
        throw new Error('the jog never reached ' + name);
    writes.length = 0;
    cc(3, 127); cc(3, 0);
}
/* The callbacks a `t<N>_` write was made from, in order — the drop hazard is
 * two of them sharing one. */
function trackWriteCallbacks(t) {
    const seen = [];
    for (const [tag, key] of writes)
        if (key.indexOf('t' + t + '_') === 0 && seen[seen.length - 1] !== tag) seen.push(tag);
    return seen;
}
function routeWrites(t) { return writes.filter(([, k]) => k === 't' + t + '_route').map(([tag, , v]) => tag + '=' + v); }

step('setup: track 1 is a MOVE track, as it is out of the box', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 1; S.trackChannel[0] = 1;
    ticks(8);
    /* CONTROL: nothing is loaded yet, so "the module loaded" below is a real
     * transition and not the rig answering with a fixed name. */
    if (loaded['0:synth']) throw new Error('the rig starts with a module already loaded');
});

step('⭑ picking a generator moves the ROUTE to Schwung, and loads the module', () => {
    pickGenerator('NuSaw');
    ticks(10);
    if (S.trackRoute[0] !== 0)
        throw new Error('the route did not follow the pick: ' + S.trackRoute[0] +
                        ' (the module may still have loaded — that is the bug, not the fix)');
    if (loaded['0:synth'] !== 'nusaw')
        throw new Error('the module did not load: ' + JSON.stringify(loaded));
    const rw = routeWrites(0);
    if (rw.length !== 1 || !/=schwung$/.test(rw[0]))
        throw new Error('t0_route written ' + rw.length + ' times: ' + JSON.stringify(rw));
});

step('⚠ ...and the route write does not share a callback with another t0_ write', () => {
    /* Same-track `tN_*` set_params fired in one audio block can coalesce and
     * drop the first. The route write must stand alone in its callback — the
     * padmap pushes that follow it belong to later ticks. */
    const tag = writes.find(([, k]) => k === 't0_route')[0];
    const others = writes.filter(([t, k]) => t === tag && k !== 't0_route' && k.indexOf('t0_') === 0);
    if (others.length)
        throw new Error('t0_route shares callback ' + tag + ' with ' + JSON.stringify(others.map(o => o[1])));
});

step('setup: a second Move track, this one with something a type change destroys', () => {
    snd.soundExit(); ticks(4);
    S.activeTrack = 1;
    S.trackRoute[1] = 1; S.trackChannel[1] = 2;
    S.trackMacros[1] = new Array(8).fill(null);
    /* A Move BUS FX leg and lane: incompatible with Schwung, so the change is
     * destructive and the modal must appear. */
    S.trackMacros[1][0] = { v: 0.5, legs: [{ kind: 'chain', comp: 'move_fx:2:fx1', key: 'cutoff', lo: 0, hi: 1 }] };
    paList = '1 0 1 4 0:move_fx:2:fx1:cutoff 0 4 100\n';
    A.automationRefreshPresence();
    ticks(4);
    if (loaded['1:synth']) throw new Error('the rig starts with a module already loaded on slot 1');
});

step('⭑ the destructive change ASKS first, and Yes still moves the route', () => {
    pickGenerator('NuSaw');
    ticks(2);
    const c = S.confirmTypeChange;
    if (!c) throw new Error('no confirmation for a change that destroys a lane');
    if (S.trackRoute[1] !== 1) throw new Error('the route moved before the answer');
    if (S.confirmTypeChangeSel !== 0) cc(14, 1);       /* opens on No — jog to Yes */
    writes.length = 0;
    cc(3, 127); cc(3, 0);
    ticks(10);
    if (S.trackRoute[1] !== 0)
        throw new Error('the route did not follow the confirmed pick: ' + S.trackRoute[1]);
    if (loaded['1:synth'] !== 'nusaw')
        throw new Error('the module did not load after the confirm: ' + JSON.stringify(loaded));
});

step('⚠ ...and there too the route write stands alone in its callback', () => {
    const r = writes.find(([, k]) => k === 't1_route');
    if (!r) throw new Error('t1_route was never written');
    const others = writes.filter(([t, k]) => t === r[0] && k !== 't1_route' && k.indexOf('t1_') === 0);
    if (others.length)
        throw new Error('t1_route shares callback ' + r[0] + ' with ' + JSON.stringify(others.map(o => o[1])) +
                        ' — the clears must be deferred, not fired alongside it');
    /* CONTROL: the clears DID happen, on a later callback. Without this the
     * assertion above is satisfied by a build that simply never clears. */
    const clears = writes.filter(([, k]) => /^t1_pa_clear_key$/.test(k));
    if (!clears.length) throw new Error('nothing was cleared — the ordering above proves nothing');
    if (clears[0][0] === r[0]) throw new Error('the clear landed in the route\'s own callback');
});

step('a change WITHIN the Move type never asks, and never writes a route', () => {
    /* CONTROL for the modal: it must be the TYPE change that raises it, not any
     * commit at all. */
    S.confirmTypeChange = null; writes.length = 0;
    snd.requestInstrChange(0, 1 /* Move 2 */);
    if (S.confirmTypeChange) throw new Error('a same-type change asked for confirmation');
});

process.exit(failed);
}
main();
