import './_bulk_get_stub.mjs';
/* tests/js/test_snapmorph.mjs — SNAPMORPH (18b, Josh 2026-09-13): a macro leg
 * that morphs a track's chain between two or more of its TRACK snapshots.
 *
 * Rulings pinned here:
 *   · the picker: `+ Add target` → SnapMorph → the track's FILLED snapshot
 *     slots; a click TOGGLES a slot into the leg (pick order = morph path),
 *     the list stays open, Back leaves to the leg list.
 *   · numbers interpolate; a CHOICE snaps to the NEARER snapshot's own value
 *     (Saw → Tri never passes through Square).
 *   · ONE lane, the knob's position (`mac:<track>:<knob>`, "SnapMorph K4"),
 *     never a lane per parameter.
 *   · a hand turn writes TRANSIENT bulk SETs and then ONE edit once the hand
 *     is off; playback writes transient only and owes nothing.
 *   · a module swap under the morph makes it re-check the module and drop
 *     the component (no silent rebind).
 *
 * Harness: test_macros_bank's — sound mode driven directly (soundOnCC /
 * soundOnNote / soundTick) against a shadow_get_param stub, plus a file map
 * for the snapshot json (test_device_snapshots's shape). */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let reads = [];
const ASSIGN = {
    'synth:module': 'nusaw',
    'synth:name': 'nusaw',
    'fx2:module': 'rrverb',
    'fx2:name': 'RRVerb',
    'synth:cutoff': '0.5', 'synth:voices': '4', 'synth:shape': 'Saw',
    'fx2:room_size': '3',
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
        { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8, step: 1 },
        { key: 'shape', name: 'Shape', type: 'enum', options: ['Saw', 'Square', 'Tri'] },
        { key: 'sample', name: 'Sample', type: 'filepath', root: '/data' },   /* never morphs */
    ]),
    'fx2:chain_params': JSON.stringify([
        { key: 'room_size', name: 'Room Size', type: 'float', min: 0.5, max: 20, step: 0.01 },
        { key: 'freeze', name: 'Freeze', type: 'toggle' },
    ]),
};
globalThis.shadow_get_param = (slot, key) => { reads.push(key); return ASSIGN[key] || ''; };
let writes = [];
globalThis.shadow_set_param = (slot, key, val) => { writes.push({ key, val }); ASSIGN[key] = String(val); return 1; };
/* THE OBSERVABLE: the bulk SET. Decoded into { slot, transient, pairs:{key:val} }. */
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
let bulks = [];
let bulkRefuse = false;
globalThis.shadow_set_params = (slot, prefix, blob, transient) => {
    if (bulkRefuse) return false;
    const it = dec(blob), pairs = {};
    for (let i = 0; i + 1 < it.length; i += 2) { pairs[it[i]] = it[i + 1]; ASSIGN[it[i]] = it[i + 1]; }
    bulks.push({ slot, prefix, transient: !!transient, pairs });
    return true;
};
globalThis.shadow_get_params = () => '';
globalThis.shadow_send_midi_to_dsp = () => {};
const modSets = [];
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) modSets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_set_param = (k, v) => { modSets.push(k + '=' + v); return 1; };
globalThis.host_module_get_param = () => '';
/* Files: the two track snapshots (slots 1 and 2 of track 3 = t2/0, t2/1),
 * and the sidecar writes. */
const files = {};
let sidecars = [];
globalThis.host_file_exists = (p) => Object.prototype.hasOwnProperty.call(files, p);   /* a stat, as on the device */
globalThis.host_read_file = (p) => (files[p] !== undefined ? files[p] : '');
globalThis.host_write_file = (p, body) => { sidecars.push({ p, body }); files[p] = body; return true; };
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => false;                 /* fenced away from Sets on the device */
globalThis.host_system_cmd = (cmd) => { const m = /^rm -rf (\S+)$/.exec(String(cmd)); if (!m) return 0; for (const k of Object.keys(files)) if (k.indexOf(m[1] + '/') === 0) delete files[k]; return 0; };
globalThis.host_snapshot_take = (dir) => { files[dir + '/slot_2.json'] = '{}\n'; return JSON.stringify({ ok: true, skipped: 0, positions: 1 }); };
globalThis.host_snapshot_recall = () => JSON.stringify({ ok: true, restored: 0, pending: false });
globalThis.host_snapshot_status = () => JSON.stringify({ pending: false, skipped: 0, added: 0 });
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.set_pixel = () => {}; globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {}; globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting', 'move_midi_internal_send',
                  'host_vol_block', 'host_edit_cc_block', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'host_autosave_hold', 'shadow_save_state_now'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const morph = await import('../../ui/ui_snapmorph.mjs');
const P = await import('../../ui/ui_persistence.mjs');
const { BANK_MACROS } = await import('../../ui/ui_constants.mjs');
const await0 = await import('../../ui/ui_engine.mjs');   /* the fader law, for the level assertions */
auto.automationRegisterSeqApply(snd.soundSeqApply);
auto.automationRegisterMacApply(morph.snapMorphApply);

const T = 2, K = 3;                        /* track 3, knob K4 */
const UUID = 'morph-uuid';
GS.pendingDspSync = 0; GS.pendingSetLoad = false; GS.currentSetUuid = UUID;
/* Snapshot A (slot 1) and B (slot 2); slot 3 is EMPTY (a cleared slot = '') */
/* The mixer half rides too: A at −6 dB (gain 0.5, fader travel 0.6), B at
 * unity (travel 0.8); pan 0.2 → 0.8; send A 0 → 1; send B absent in A (a
 * level that read back as nothing at the take — not morphed). */
const snapJson = (vals, mixer) => JSON.stringify({ v: 4, track: T, mixer: [null, null, mixer], seq: [],
    params: [null, null, { synth: { module: 'nusaw', values: vals.synth }, fx2: { module: 'rrverb', values: vals.fx2 } }] });
files[P.trackSnapDir(UUID, T, 0) + '/davebox.json'] = snapJson({ synth: { cutoff: '0.2', voices: '2', shape: 'Saw', sample: '/a.wav' }, fx2: { room_size: '1', freeze: 'Off' } },
                                                               { route: 0, slot: T, volume: 0.5, pan: 0.2, send_a: 0 });
files[P.trackSnapDir(UUID, T, 1) + '/davebox.json'] = snapJson({ synth: { cutoff: '0.8', voices: '6', shape: 'Tri', sample: '/b.wav' }, fx2: { room_size: '11', freeze: 'On' } },
                                                               { route: 0, slot: T, volume: 1.0, pan: 0.8, send_a: 1, send_b: 0.3 });
/* slot 3 is EMPTY: no file at all (a cleared slot's directory is removed) */

const VIEW_MACROS = 19, VIEW_KNOBS = 11, VIEW_KNOBLEGS = 20, VIEW_KNOB_TARGET = 12, VIEW_KNOB_PARAM = 13;
const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const touch = (k, on) => snd.soundOnNote(on ? 0x90 : 0x80, k, on ? 127 : 0);
const turnBy = (k, n) => cc(71 + k, n > 0 ? n : 128 + n);
const jog = (dir) => snd.soundOnCC(14, dir > 0 ? 1 : 127, (v) => (v < 64 ? v : v - 128));
const click = () => { cc(3, 127); cc(3, 0); };
const back = () => { cc(51, 127); cc(51, 0); };
const ticks = (n) => { for (let i = 0; i < n; i++) { GS.clockMs = (GS.clockMs || 0) + 10.6; GS.tickCount++; snd.soundTick(); bridge.tickPrefetch(); auto.automationTick(); morph.morphTick(); } };
const M = () => snd.soundMacrosForTest();
const lastMac = () => { for (let i = sidecars.length - 1; i >= 0; i--) { try { const j = JSON.parse(sidecars[i].body); if (j && j.mac) return j.mac; } catch (e) {} } return null; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-3);
const mp = () => (GS.trackMacros[T] || [])[K];
const legsOf = () => (mp() && mp().legs) || [];
const morphLeg = () => legsOf().find(l => l.kind === 'morph') || null;
const chainBulks = () => bulks.filter(b => b.slot === T && b.prefix === 'chain:');

step('setup: sound mode on a Schwung track, MACROS bank, an already-seeded empty store', () => {
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
    GS.activeTrack = T;
    GS.trackMacros[T] = new Array(8).fill(null);        /* seeded: no chain migration */
    snd.soundEnter(T, T); ticks(3); snd.soundShowMenu();
    snd.soundSetBank(BANK_MACROS);
    ticks(4);
    assert(snd.soundViewForTest() === VIEW_MACROS, 'view MACROS, got ' + snd.soundViewForTest());
});

/* ---- THE PICKER ------------------------------------------------------------ */
step('the target picker offers SnapMorph on a chain track', () => {
    click(); assert(snd.soundViewForTest() === VIEW_KNOBS, 'K-list');
    for (let i = 0; i < K; i++) jog(1);
    click(); ticks(1);
    assert(snd.soundViewForTest() === VIEW_KNOB_TARGET, 'an empty knob opens the targets, view ' + snd.soundViewForTest());
    const names = snd.soundKnobTargetsForTest().map(t => t.name);
    assert(names.indexOf('SnapMorph') >= 0, 'SnapMorph offered, got ' + JSON.stringify(names));
    assert(names.indexOf('SnapMorph') === names.length - 1, 'last, after Levels');
});
step('…and on a Move track (its bus FX and levels), but NOT on a MIDI track (nothing to morph)', () => {
    try {
        GS.trackRoute[T] = 2;
        assert(snd.soundKnobTargetsForTest().map(t => t.name).indexOf('SnapMorph') < 0, 'MIDI track: absent');
        GS.trackRoute[T] = 1;
        assert(snd.soundKnobTargetsForTest().map(t => t.name).indexOf('SnapMorph') >= 0, 'Move track: offered');
    } finally { GS.trackRoute[T] = 0; }
});
step('SnapMorph lists the FILLED snapshot slots only; a click TOGGLES one in, the leg appears, the list stays open and marks it', () => {
    sidecars = [];
    const targets = snd.soundKnobTargetsForTest();
    const ti = targets.findIndex(t => t.name === 'SnapMorph');
    for (let i = 0; i < ti; i++) jog(1);
    click(); ticks(1);
    assert(snd.soundViewForTest() === VIEW_KNOB_PARAM, 'the slot list, view ' + snd.soundViewForTest());
    let rows = snd.soundKnobParamsForTest().map(p => p.label);
    assert(rows.length === 2 && /Snapshot 1$/.test(rows[0]) && /Snapshot 2$/.test(rows[1]), 'slots 1 and 2 (3 is empty), got ' + JSON.stringify(rows));
    assert(!/\[/.test(rows[0]), 'nothing chosen yet: ' + rows[0]);
    click();                                                 /* Snapshot 1 */
    assert(snd.soundViewForTest() === VIEW_KNOB_PARAM, 'the list STAYS OPEN after a pick');
    let leg = morphLeg();
    assert(leg && leg.snaps.length === 1 && leg.snaps[0] === 0, 'one pick = a leg with one snapshot, got ' + JSON.stringify(legsOf()));
    rows = snd.soundKnobParamsForTest().map(p => p.label);
    assert(/^\[1\] Snapshot 1$/.test(rows[0]), 'marked with its ORDER, got ' + JSON.stringify(rows));
    jog(1); click();                                         /* Snapshot 2 */
    leg = morphLeg();
    assert(leg.snaps.length === 2 && leg.snaps[1] === 1, 'second pick appends, got ' + JSON.stringify(leg.snaps));
    rows = snd.soundKnobParamsForTest().map(p => p.label);
    assert(/^\[2\] Snapshot 2$/.test(rows[1]), 'order 2, got ' + rows[1]);
    assert(leg.lo === 0 && leg.hi === 1, 'whole range');
    const mac = lastMac();
    assert(mac && mac[T] && mac[T][K] && mac[T][K].legs[0].kind === 'morph' && mac[T][K].legs[0].snaps.join() === '0,1', 'persisted in the sidecar, got ' + JSON.stringify(mac && mac[T] && mac[T][K]));
});
step('a second click on a chosen slot takes it OUT (pick order re-counts); picked again it goes LAST', () => {
    click();                                                 /* Snapshot 2 again: out */
    assert(morphLeg().snaps.join() === '0', 'removed, got ' + morphLeg().snaps.join());
    jog(-1); click();                                        /* Snapshot 1: out → leg gone */
    assert(!morphLeg() && mp() === null, 'last removal drops the leg and the knob is unassigned, got ' + JSON.stringify(mp()));
    jog(1); click(); jog(-1); click();                       /* 2 then 1: path B → A */
    assert(morphLeg().snaps.join() === '1,0', 'pick order is the path, got ' + morphLeg().snaps.join());
    const rows = snd.soundKnobParamsForTest().map(p => p.label);
    assert(/^\[2\] Snapshot 1$/.test(rows[0]) && /^\[1\] Snapshot 2$/.test(rows[1]), 'marks follow the order, got ' + JSON.stringify(rows));
    /* Put it back to A → B for the rest of the file. */
    click(); jog(1); click(); jog(-1); click(); jog(1); click();
    assert(morphLeg().snaps.join() === '0,1', 'A → B again, got ' + morphLeg().snaps.join());
});
step('Back leaves the slot list onto the LEG list; the morph leg has Lo/Hi and NO Travel row', () => {
    back();
    assert(snd.soundViewForTest() === VIEW_KNOBLEGS, 'leg list, view ' + snd.soundViewForTest());
    const rows = snd.soundKnobLegRowsForTest();
    assert(rows[0].kind === 'leg' && rows[0].label === 'Morph' && rows[0].value === 'Snap>1+2', 'the leg row: ' + JSON.stringify(rows[0]));
    assert(rows[1].kind === 'lo' && rows[2].kind === 'hi' && rows[3].kind === 'add', 'Lo, Hi, then + Add target (no Travel), got ' + JSON.stringify(rows.map(r => r.kind)));
    back(); assert(snd.soundViewForTest() === VIEW_KNOBS, 'then the K-list');
    assert(snd.soundKnobRowLabelForTest(K) === 'Snap>1+2', 'K4 reads its snapshots, got ' + snd.soundKnobRowLabelForTest(K));
    back(); assert(snd.soundViewForTest() === VIEW_MACROS, 'then the page');
});

/* ---- THE SEED --------------------------------------------------------------- */
step('⚠ SEED within the tick budget: the live module id and chain_params per shared component, once; the page draws an arc at 0%', () => {
    reads = [];
    ticks(6);
    assert(reads.filter(k => k === 'synth:module').length === 1, 'synth module checked once, got ' + reads.filter(k => k === 'synth:module').length);
    assert(reads.filter(k => k === 'fx2:module').length === 1, 'fx2 module checked once');
    assert(reads.filter(k => k === 'synth:chain_params').length === 1, 'synth metadata once');
    assert(reads.filter(k => k === 'fx2:chain_params').length === 1, 'fx2 metadata once');
    assert(morph.morphReady(T, K, morphLeg()), 'ready');
    assert(mp().v === 0, 'a fresh morph knob sits at the FIRST snapshot, v=' + mp().v);
    const d = M().drawn[K];
    assert(d.kind === 'arc' && d.label === 'MORPH' && d.text === '0%' && /SNAPMORPH 1\+2/.test(d.name), 'the cell: ' + JSON.stringify(d));
    ticks(6);
    assert(reads.filter(k => k === 'synth:chain_params').length === 1, 'and never again');
});

/* ---- THE TURN --------------------------------------------------------------- */
step('⭐ a turn to the midpoint writes ONE transient bulk SET: numbers interpolate, ints land on ints, a CHOICE snaps to the nearer snapshot, filepath/toggle-less keys are left alone', () => {
    bulks = []; modSets.length = 0; writes = [];
    touch(K, true);
    /* ⚠ a CC value ≥ 64 decodes as NEGATIVE (v − 128): 63 is the largest
     * positive event. 4 × 63 + 2 = 254 detents = 127 steps ≈ v 0.498. */
    turnBy(K, 63); turnBy(K, 63); turnBy(K, 63); turnBy(K, 63); turnBy(K, 2); ticks(1);
    const b = chainBulks();
    assert(b.length === 1, 'one bulk SET for the whole turn, got ' + b.length + ' ' + JSON.stringify(bulks));
    assert(b[0].transient === true, 'transient under the hand');
    const p = b[0].pairs;
    assert(near(mp().v, 127 / 255), 'v ≈ 0.498, got ' + mp().v);
    assert(near(parseFloat(p['synth:cutoff']), 0.2 + 0.6 * (127 / 255), 0.002), 'cutoff interpolated, got ' + p['synth:cutoff']);
    assert(p['synth:voices'] === '4', 'voices 2→6 at the midpoint is 4, got ' + p['synth:voices']);
    assert(p['synth:shape'] === '0', 'shape just UNDER the midpoint stays Saw (index 0), not Square, got ' + p['synth:shape']);
    assert(near(parseFloat(p['fx2:room_size']), 1 + 10 * (127 / 255), 0.02), 'room size interpolated, got ' + p['fx2:room_size']);
    assert(p['fx2:freeze'] === '0', 'freeze (a switch) stays Off under the midpoint, got ' + p['fx2:freeze']);
    assert(!('synth:sample' in p), 'a filepath never morphs');
    assert(writes.length === 0, 'no single-param writes: ' + JSON.stringify(writes));
});
step('⭐ THE MIXER LEVELS ride in the same bulk: volume morphs in FADER travel (−6 dB → 0 dB passes −3 dB, not linear gain 0.75), pan and send A linear, a level one snapshot lacks stays out', () => {
    const p = chainBulks()[0].pairs;
    const f = 127 / 255;
    const { faderGainToTravel, faderTravelToGain } = await0;
    const tMid = 0.6 + (0.8 - 0.6) * f;                    /* travel: −6 dB is 0.6, unity 0.8 */
    assert(near(parseFloat(p['slot:volume']), faderTravelToGain(tMid), 0.002), 'volume at travel midpoint ≈ −3 dB (' + faderTravelToGain(tMid).toFixed(4) + '), got ' + p['slot:volume']);
    assert(!near(parseFloat(p['slot:volume']), 0.5 + 0.5 * f, 0.01), 'and NOT the linear-gain midpoint');
    assert(near(parseFloat(p['slot:pan']), 0.2 + 0.6 * f, 0.002), 'pan linear, got ' + p['slot:pan']);
    assert(near(parseFloat(p['slot:send_a']), f, 0.002), 'send A linear, got ' + p['slot:send_a']);
    assert(!('slot:send_b' in p), 'send B (absent in A) is not morphed');
    assert(faderGainToTravel(0.5) > 0.59 && faderGainToTravel(0.5) < 0.61, 'the premise: gain 0.5 is travel 0.6');
    assert(GS.sessVolLevel.every(v => v === -1), 'the session strips were told to re-read');
});
step('one more detent pair crosses the midpoint: ONLY the changed pairs go out, and the choice snaps to Tri', () => {
    bulks = [];
    turnBy(K, 2); ticks(1);
    const b = chainBulks();
    assert(b.length === 1, 'one bulk, got ' + b.length);
    const p = b[0].pairs;
    assert(p['synth:shape'] === '2', 'Saw → Tri, never Square: ' + p['synth:shape']);
    assert(p['fx2:freeze'] === '1', 'Off → On at the midpoint: ' + p['fx2:freeze']);
    assert('synth:cutoff' in p, 'cutoff moved');
    assert(!('synth:voices' in p), 'voices is still 4 → not re-sent, got ' + JSON.stringify(p));
});
step('⭐ THE LANE: the turn recorded the KNOB position on mac:<track>:<knob> and nothing per parameter (Record + Play)', () => {
    modSets.length = 0; bulks = [];
    GS.playing = true; GS.recordArmed = true;
    turnBy(K, 2); ticks(1);
    const live = modSets.filter(x => x.startsWith('t' + T + '_pa_live='));
    assert(live.length === 1, 'exactly one live write, got ' + JSON.stringify(modSets));
    assert(/^t2_pa_live=mac:2:3 \d+$/.test(live[0]), 'the SnapMorph lane, got ' + live[0]);
    const norm = parseInt(live[0].split(' ')[1], 10);
    assert(near(norm / 16383, mp().v, 0.001), 'records v (' + mp().v + '), got ' + norm);
    assert(!modSets.some(x => /synth:|fx2:/.test(x)), 'no per-parameter lane: ' + JSON.stringify(modSets.filter(x => /synth:|fx2:/.test(x))));
    assert(chainBulks().length === 1 && chainBulks()[0].transient, 'the chain still gets its transient bulk');
    GS.playing = false; GS.recordArmed = false;
});
step('the AUTOMATION list names the lane "SnapMorph K4"; it ramps; it has no bipolar centre; export skips it', () => {
    assert(auto.automationTargetLabel('mac:2:3') === 'SnapMorph K4', 'label: ' + auto.automationTargetLabel('mac:2:3'));
    assert(auto.automationSmoothable('mac', '2:3') === true, 'a morph ramps');
    assert(auto.automationBipolarCenter('mac:2:3') === null, 'no centre');
});
step('⭐ THE EDIT: the hand comes off, MORPH_FINAL_MS later the last values go out ONCE more as a NON-transient bulk, and only once', () => {
    bulks = [];
    touch(K, false); ticks(1);
    assert(morph.morphFinalPendingForTest(T, K), 'an edit is owed');
    assert(chainBulks().length === 0, 'not yet');
    ticks(Math.ceil(morph.MORPH_FINAL_MS / 10.6) + 2);
    const b = chainBulks();
    assert(b.length === 1 && b[0].transient === false, 'ONE edit bulk, got ' + JSON.stringify(b.map(x => x.transient)));
    assert(b[0].pairs['synth:shape'] === '2' && 'synth:cutoff' in b[0].pairs && 'synth:voices' in b[0].pairs, 'carrying every value the turn touched: ' + JSON.stringify(Object.keys(b[0].pairs)));
    assert(!morph.morphFinalPendingForTest(T, K), 'settled');
    ticks(50);
    assert(chainBulks().length === 1, 'and never again');
});
step('a refused bulk (host busy) is not forgotten: the pairs go out on the next apply', () => {
    bulks = []; bulkRefuse = true;
    touch(K, true); turnBy(K, 2); ticks(1);
    assert(chainBulks().length === 0, 'refused: nothing recorded as sent');
    bulkRefuse = false;
    turnBy(K, 2); ticks(1);
    const b = chainBulks();
    assert(b.length === 1 && 'synth:cutoff' in b[0].pairs, 'the next detent carries it');
    touch(K, false); ticks(Math.ceil(morph.MORPH_FINAL_MS / 10.6) + 2);
});

step('⭐ a NEW turn re-asserts EVERY morphed parameter — a value the hand moved in between snaps back to the morph\'s position (Josh, device)', () => {
    /* The hand (the editor, a preset) moved voices to 8 between turns; the
     * morph at v≈0.5 says 4, and 4 is what it wrote last, so the changed-pairs
     * filter alone would leave 8 in place. */
    ASSIGN['synth:voices'] = '8';
    bulks = [];
    touch(K, true); turnBy(K, 2); ticks(1);
    const b = chainBulks();
    assert(b.length === 1, 'one bulk, got ' + b.length);
    const p = b[0].pairs;
    assert(p['synth:voices'] === '4', 'voices re-asserted to the morph\'s 4, got ' + JSON.stringify(p));
    assert('synth:shape' in p && 'fx2:room_size' in p && 'slot:volume' in p, 'the WHOLE set goes on the first apply of a turn: ' + JSON.stringify(Object.keys(p)));
    /* …and the rest of the same gesture is back to changed pairs only. */
    bulks = [];
    turnBy(K, 2); ticks(1);
    assert(chainBulks().length === 1 && !('synth:voices' in chainBulks()[0].pairs), 'mid-gesture: only what moved, got ' + JSON.stringify(chainBulks()[0] && chainBulks()[0].pairs));
    touch(K, false); ticks(Math.ceil(morph.MORPH_FINAL_MS / 10.6) + 2);
});

/* ---- PLAYBACK ------------------------------------------------------------- */
step('⭐ PLAYBACK: the applier moves v and writes the chain TRANSIENT, with no edit owed — the top snapshot exactly', () => {
    bulks = [];
    const r = morph.snapMorphApply(T, K, 1.0);
    assert(r === true, 'applied');
    assert(mp().v === 1, 'v follows playback, got ' + mp().v);
    const b = chainBulks();
    assert(b.length === 1 && b[0].transient === true, 'one transient bulk, got ' + JSON.stringify(b.map(x => x.transient)));
    const p = b[0].pairs;
    assert(p['synth:cutoff'] === '0.8' && p['synth:voices'] === '6' && p['fx2:room_size'] === '11', 'snapshot B exactly: ' + JSON.stringify(p));
    /* shape and freeze were ALREADY at B's values from the turn, so they are
     * not re-sent (only changed pairs go); the mirror says where they sit. */
    assert(!('synth:shape' in p) && ASSIGN['synth:shape'] === '2' && ASSIGN['fx2:freeze'] === '1', 'unchanged pairs not re-sent: ' + JSON.stringify(p));
    assert(!morph.morphFinalPendingForTest(T, K), 'playback owes no edit');
    ticks(Math.ceil(morph.MORPH_FINAL_MS / 10.6) + 2);
    assert(chainBulks().length === 1, 'and none arrives');
    assert(M().drawn[K].text === '100%', 'the dial follows: ' + M().drawn[K].text);
});
step('playback through the owner: a staged mac: value reaches the applier (pushPair routing)', () => {
    bulks = [];
    /* automationTick drains pa_pending when something is playing. */
    assert(auto.automationGestureCountForTest() === 0, 'no gesture holds the lane');
    /* The DSP lists the lane (the presence read after the gesture ended had
     * cleared anyAutomation against an EMPTY pa_list), then stages a value. */
    let staged = 'mac:' + T + ':' + K + ' 0\n';
    const LIST = T + ' 0 1 4 mac:' + T + ':' + K + ' 0 0\n';
    globalThis.host_module_get_param = (k) => {
        if (k === 'pa_pending') { const r = staged; staged = ''; return r; }
        if (k === 'pa_list') return LIST;
        if (k === 'pa_store_full' || k === 'pa_ring_dropped' || k === 'pa_owner_conflict') return '0';
        return '';
    };
    auto.automationRefreshPresence();
    assert(auto.automationTargetLabel('mac:' + T + ':' + K) === 'SnapMorph K4', 'the list names it');
    GS.playing = true;
    ticks(4);
    GS.playing = false;
    globalThis.host_module_get_param = () => '';
    assert(mp().v === 0, 'v back to 0 via the owner, got ' + mp().v + ' pending=' + auto.automationPendingSizeForTest());
    const b = chainBulks();
    assert(b.length >= 1 && b[b.length - 1].pairs['synth:cutoff'] === '0.2', 'snapshot A written, got ' + JSON.stringify(b));
});
step('the applier refuses a knob with no morph leg, an off-route track, and a nonsense knob', () => {
    assert(morph.snapMorphApply(T, 0, 0.5) === false, 'K1 has no morph');
    GS.trackRoute[T] = 2;
    assert(morph.snapMorphApply(T, K, 0.5) === false, 'a MIDI track');
    GS.trackRoute[T] = 0;
    assert(morph.snapMorphApply(T, 9, 0.5) === false, 'knob 9');
});

/* ---- A LEG WINDOW, and a MODULE SWAP ----------------------------------------- */
step('Lo/Hi window the path: hi 0.5 means the knob\'s full sweep only reaches the midpoint — and a range edit applies NOW (the tick\'s range pass)', () => {
    morph.snapMorphApply(T, K, 1.0);
    bulks = [];
    morphLeg().hi = 0.5;
    ticks(2);                                               /* the range pass applies it */
    const b = chainBulks();
    assert(b.length === 1, 'the range pass wrote once, got ' + b.length);
    assert(b[0].pairs['synth:voices'] === '4', 'v=1 through hi=0.5 is the midpoint: voices 4, got ' + JSON.stringify(b[0].pairs));
    morphLeg().hi = 1; ticks(2);
    assert(chainBulks().length === 2 && chainBulks()[1].pairs['synth:voices'] === '6', 'and back to the top');
    ticks(Math.ceil(morph.MORPH_FINAL_MS / 10.6) + 2);   /* let the range edits settle */
});
step('⚠ a MODULE SWAP under the morph: the cache is dropped, the component re-checked, and the new module is NOT driven through same-named keys', () => {
    ASSIGN['synth:module'] = 'othersynth';                   /* same keys, different module */
    morph.morphInvalidate(T);                                /* what applyModulePick calls */
    reads = []; bulks = [];
    ticks(6);
    assert(reads.filter(k => k === 'synth:module').length >= 1, 're-checked the synth');
    morph.snapMorphApply(T, K, 1.0);
    const p = chainBulks()[0].pairs;
    assert(!('synth:cutoff' in p) && !('synth:shape' in p), 'the synth is left alone: ' + JSON.stringify(Object.keys(p)));
    assert(p['fx2:room_size'] === '11', 'the FX that did not change still morphs');
    ASSIGN['synth:module'] = 'nusaw';
    morph.morphInvalidate(T);
});
step('a snapshot with a DIFFERENT module in a component drops that component from the morph', () => {
    files[P.trackSnapDir(UUID, T, 1) + '/davebox.json'] = JSON.stringify({ v: 4, track: T, mixer: [], seq: [],
        params: [null, null, { synth: { module: 'other', values: { cutoff: '0.9' } }, fx2: { module: 'rrverb', values: { room_size: '11', freeze: 'On' } } }] });
    morph.morphInvalidate(T);
    bulks = [];
    ticks(6);
    morph.snapMorphApply(T, K, 1.0);
    const p = chainBulks()[0].pairs;
    assert(!('synth:cutoff' in p) && p['fx2:room_size'] === '11', 'synth out, fx2 in: ' + JSON.stringify(p));
});

/* ---- A SNAPSHOT CHANGES UNDER THE MORPH (Josh, device, 2026-09-13) ----------------
 * "changing a snapshot doesn't change what the morph knob does - it morphs
 * between snapshots that shouldn't exist anymore." A save or a clear of a slot
 * must make every morph over it re-read. */
const D = await import('../../ui/ui_devsnap.mjs');
step('⭐ RE-SAVING snapshot 2 (through the real devSnapSave) makes the morph re-seed and morph to the NEW values', () => {
    /* Restore the two-snapshot leg on K4 and seed it. */
    GS.trackMacros[T][K] = { v: 0, legs: [{ kind: 'morph', snaps: [0, 1], lo: 0, hi: 1 }] };
    files[P.trackSnapDir(UUID, T, 1) + '/davebox.json'] = snapJson({ synth: { cutoff: '0.8', voices: '6', shape: 'Tri' }, fx2: { room_size: '11', freeze: 'On' } },
                                                                   { route: 0, slot: T, volume: 1.0, pan: 0.8, send_a: 1 });
    morph.morphInvalidate(T); ticks(8);
    assert(morph.morphReady(T, K, morphLeg()), 'seeded on the old snapshot 2');
    /* The take reads the LIVE values: cutoff is now 0.3 on the engine. */
    ASSIGN['synth:cutoff'] = '0.3'; ASSIGN['synth:voices'] = '4'; ASSIGN['synth:shape'] = 'Saw'; ASSIGN['fx2:room_size'] = '3';
    /* The take's seq half reads the bank mirrors, which init() allocates and
     * this rig (which never runs init) has not. */
    if (!GS.bankParams) GS.bankParams = [];
    for (let t = 0; t < 8; t++) if (!GS.bankParams[t] || !GS.bankParams[t][0]) GS.bankParams[t] = Array.from({ length: 8 }, () => new Array(8).fill(0));
    D.devSnapEnter(T);
    assert(D.devSnapSave(1) === true, 'saved slot 2 over the old one');
    D.devSnapLeave();
    assert(!morph.morphReady(T, K, morphLeg()), 'the morph forgot the old snapshot 2');
    ticks(8);
    assert(morph.morphReady(T, K, morphLeg()), 're-seeded');
    bulks = [];
    morph.snapMorphApply(T, K, 1.0);
    const p = chainBulks()[0].pairs;
    assert(p['synth:cutoff'] === '0.3' && p['fx2:room_size'] === '3', 'the top of the morph is the NEW snapshot 2: ' + JSON.stringify(p));
});
step('⭐ CLEARING snapshot 2 removes its directory (host files too), the layer\'s scan agrees, and the morph over it goes quiet', () => {
    D.devSnapEnter(T);
    assert(D.devSnapClear(1) === true, 'cleared');
    const dir = P.trackSnapDir(UUID, T, 1);
    assert(!Object.keys(files).some(k => k.indexOf(dir + '/') === 0), 'nothing left under the slot dir: ' + JSON.stringify(Object.keys(files).filter(k => k.indexOf(dir) === 0)));
    D.devSnapLeave(); D.devSnapEnter(T);
    assert(D.devSnapState().slots[1] === false, 'on re-entry the slot reads EMPTY (the LED bug)');
    D.devSnapLeave();
    ticks(8);
    bulks = [];
    morph.snapMorphApply(T, K, 1.0);
    assert(chainBulks().length === 0, 'a morph over a cleared slot writes nothing');
    /* Put snapshot 2 back for the sections below. */
    files[P.trackSnapDir(UUID, T, 1) + '/davebox.json'] = snapJson({ synth: { cutoff: '0.8', voices: '6', shape: 'Tri', sample: '/b.wav' }, fx2: { room_size: '11', freeze: 'On' } },
                                                                   { route: 0, slot: T, volume: 1.0, pan: 0.8, send_a: 1, send_b: 0.3 });
    ASSIGN['synth:cutoff'] = '0.5'; morph.morphInvalidate(T); ticks(8);
});

/* ---- A MOVE TRACK: its bus FX and bus levels (Josh, 2026-09-13) ------------------ */
const TM = 4, KM = 0;                     /* track 5 on Move 2 (channel 2 → bus 2), K1 */
step('setup: track 5 is a Move track on Move 2; two snapshots hold its bus FX and bus levels', () => {
    GS.trackRoute[TM] = 1; GS.trackChannel[TM] = 2;
    Object.assign(ASSIGN, {
        'move_fx:2:fx1:module': 'rrverb',
        'move_fx:2:fx1:chain_params': JSON.stringify([{ key: 'room_size', name: 'Room Size', type: 'float', min: 0.5, max: 20, step: 0.01 }]),
    });
    const busJson = (room, mixer) => JSON.stringify({ v: 4, track: TM, mixer: [null, null, null, null, mixer], seq: [],
        params: [null, null, null, null, { 'move_fx:2:fx1': { module: 'rrverb', values: { room_size: room } } }] });
    files[P.trackSnapDir(UUID, TM, 0) + '/davebox.json'] = busJson('1', { route: 1, bus: 2, volume: 0.5, pan: 0.5 });
    files[P.trackSnapDir(UUID, TM, 1) + '/davebox.json'] = busJson('11', { route: 1, bus: 2, volume: 1.0, pan: 0.5 });
    GS.trackMacros[TM] = new Array(8).fill(null);
    GS.trackMacros[TM][KM] = { v: 0, legs: [{ kind: 'morph', snaps: [0, 1], lo: 0, hi: 1 }] };
});
step('the target picker offers SnapMorph on a Move track', () => {
    snd.soundEnter(TM, TM); ticks(3); snd.soundShowMenu(); snd.soundSetBank(BANK_MACROS);
    reads = [];                                              /* the seed starts on the next tick */
    ticks(2);
    const names = snd.soundKnobTargetsForTest().map(t => t.name);
    assert(names.indexOf('SnapMorph') >= 0, 'offered on a Move track: ' + JSON.stringify(names));
});
step('⭐ a Move-track morph writes the BUS: slot 0, `move_fx:2:fx1:room_size` and `move_fx:2:volume`, one transient bulk', () => {
    bulks = [];
    ticks(6);
    assert(reads.filter(k => k === 'move_fx:2:fx1:module').length === 1, 'the bus insert\'s module checked once');
    assert(morph.morphReady(TM, KM, GS.trackMacros[TM][KM].legs[0]), 'ready');
    assert(morph.snapMorphApply(TM, KM, 1.0) === true, 'applied');
    const b = bulks.filter(x => x.prefix === 'chain:');
    assert(b.length === 1 && b[0].slot === 0 && b[0].transient, 'one transient bulk on SLOT 0, got ' + JSON.stringify(b.map(x => [x.slot, x.transient])));
    assert(b[0].pairs['move_fx:2:fx1:room_size'] === '11', 'the bus FX param: ' + JSON.stringify(b[0].pairs));
    assert(near(parseFloat(b[0].pairs['move_fx:2:volume']), 1.0, 0.001), 'the bus volume (fader travel): ' + b[0].pairs['move_fx:2:volume']);
    assert(!('slot:volume' in b[0].pairs), 'never the chain slot\'s level');
});
step('⚠ re-pointed to another Move instrument since the save, the morph is EMPTY (and says why) — the saved bus is somebody else\'s now', () => {
    GS.trackChannel[TM] = 3;                                 /* Move 3 → bus 3 */
    morph.morphInvalidate(TM);
    bulks = [];
    ticks(6);
    assert(morph.morphReady(TM, KM, GS.trackMacros[TM][KM].legs[0]), 'ready (with nothing)');
    morph.snapMorphApply(TM, KM, 0.5);
    assert(bulks.filter(x => x.prefix === 'chain:').length === 0, 'nothing written: ' + JSON.stringify(bulks));
    GS.trackChannel[TM] = 2; morph.morphInvalidate(TM);
});
step('back on the chain track for the store checks', () => { snd.soundEnter(T, T); ticks(3); snd.soundShowMenu(); snd.soundSetBank(BANK_MACROS); ticks(2); });

/* ---- THE STORE ---------------------------------------------------------------- */
step('the sidecar round-trips a morph leg through the validator (order kept, bad slots dropped, a stray key ignored)', () => {
    const uiPath = P.uuidToUiStatePath(UUID);
    files[uiPath] = JSON.stringify({ v: 9, mac: [null, null, [null, null, null,
        { v: 0.3, legs: [{ kind: 'morph', snaps: [3, 1, 99, 1, 'x', 0], lo: 0.1, hi: 0.9, travel: 'full' }] }] ] });
    bridge.restoreUiSidecar(false);
    const l = GS.trackMacros[T][K].legs[0];
    assert(l.kind === 'morph' && l.snaps.join() === '3,1,0', 'snaps validated in order, got ' + JSON.stringify(l));
    assert(l.lo === 0.1 && l.hi === 0.9 && l.travel === undefined, 'range kept, travel meaningless and dropped');
    assert(GS.trackMacros[T][K].v === 0.3, 'v kept');
    files[uiPath] = JSON.stringify({ v: 9, mac: [null, null, [null, null, null, { v: 0, legs: [{ kind: 'morph', snaps: [] }] }]] });
    bridge.restoreUiSidecar(false);
    assert(GS.trackMacros[T][K] === null, 'an empty snap list is no leg');
});

if (failed) { console.error('test_snapmorph: FAILED'); process.exit(1); }
console.log('test_snapmorph: all ok');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
