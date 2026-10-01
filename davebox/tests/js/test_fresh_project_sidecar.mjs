import './_bulk_get_stub.mjs';
/* tests/js/test_fresh_project_sidecar.mjs — a brand-new project starts CLEAN.
 *
 * Josh, 2026-10-01: *"so a new empty project will be truly empty?"* A project
 * with no UI sidecar used to reset only a handful of fields; the previous
 * project's macros, Program/Bank, perf slots, active track/clip/bank/lane... sat
 * on in S and were saved into the new project. restoreUiSidecar now restores a
 * COMPLETE fresh sidecar (freshSidecar) through the saved-project path.
 * Ruled the same day: a new project opens in Session View. */
let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }
const J = JSON.stringify;

/* The host: commands in order (set_params too, so the save's order shows),
 * files written, and the project listing a test sets. */
const LOG = [];
const FILES = {};
let listing = { current: 0, projects: [{ uuid: 'a', name: 'A', index: 0, color: 2 }], templates: [] };
let missingAnswer = '';
/* As on the device (shadow_ui.c js_host_system_cmd): a command whose first
 * word is not an allowed verb is REFUSED with -1. "From Template" led with its
 * variables and was refused on the device while this stub ran it. */
const ALLOWED = ['tar ', 'cp ', 'mv ', 'mkdir ', 'rm ', 'ls ', 'test ', 'chmod ', 'sh '];
globalThis.host_system_cmd = (c) => {
    c = String(c);
    if (!ALLOWED.some(v => c.startsWith(v))) { LOG.push('REFUSED ' + c); return -1; }
    LOG.push('cmd ' + c);
    const m = /new-at (\d+)/.exec(c);
    if (m) listing.projects.push({ uuid: 'new' + m[1], name: 'NEW', index: Number(m[1]), color: 1 });
    return 0;
};
globalThis.host_read_file = (p) => {
    p = String(p);
    if (/projects\.json$/.test(p)) return J(listing);
    if (/\.last-missing\.json$/.test(p)) return missingAnswer;
    return FILES[p] !== undefined ? FILES[p] : '';
};
/* As on the device, a write into a folder that does not exist FAILS (the atomic
 * write opens "<path>.tmp" there). Only templates/ is modelled: it is the one
 * folder this feature brings into being — on a Move that has never saved a
 * template it is not there, and "Set as Template" said FAILED. */
const DIRS = new Set();
const parentOf = (p) => String(p).replace(/\/[^\/]+$/, '');
globalThis.host_write_file = (p, body) => {
    if (/\/templates$/.test(parentOf(p)) && !DIRS.has(parentOf(p))) return false;
    FILES[String(p)] = String(body); return true;
};
globalThis.host_file_exists = (p) => String(p) in FILES;
globalThis.host_ensure_dir = (d) => { DIRS.add(String(d).replace(/\/$/, '')); return true; };
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { LOG.push('set ' + k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.host_module_get_params = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_params = () => '';
globalThis.shadow_set_params = () => true;
globalThis.shadow_save_state_now = () => { LOG.push('chains saved'); return true; };
for (const fn of ['host_vol_block', 'host_edit_cc_block', 'clear_screen', 'print', 'fill_rect', 'draw_rect',
                  'draw_line', 'set_pixel', 'flush_display', 'move_midi_internal_send', 'set_led',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_autosave_hold',
                  'pixel_print', 'move_midi_external_send', 'stipple_rect'])
    globalThis[fn] = () => 0;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);


async function main() {
/* ⚠ FIRST, before anything runs: S is pristine only now. */
const { S } = await import('../../ui/ui_state.mjs');
const P = await import('../../ui/ui_persistence.mjs');
const PRISTINE = JSON.parse(J(P.sidecarObject()));

step('⭐ freshSidecar is what a pristine dAVEBOx writes, field by field (except: Session View)', () => {
    const f = JSON.parse(J(P.freshSidecar()));
    const keys = Array.from(new Set(Object.keys(PRISTINE).concat(Object.keys(f)))).sort();
    const want = Object.assign({}, PRISTINE, { sv: 1 });
    for (const k of keys)
        assert(J(f[k]) === J(want[k]), k + ': freshSidecar ' + J(f[k]) + ', a pristine S writes ' + J(want[k]));
});

await import('../../ui/ui.js');
const B = await import('../../ui/ui_dsp_bridge.mjs');
const UUID = '11111111-2222-3333-4444-555555555555';

/* The project open before: everything a sidecar carries, moved off its default. */
function dirty() {
    S.currentSetUuid = UUID;
    S.activeTrack = 5; S.trackActiveClip.fill(3); S.sessionView = false;
    S.activeDrumLane.fill(7);
    S.perfModsToggled = 5; S.perfLatchMode = false; S.perfRecalledSlot = 9;
    for (let i = 8; i < 16; i++) S.perfSnapshots[i] = 77;
    S.beatMarkersEnabled = false;
    S.drumVelZoneArmed.fill(true);
    S.drumLaneEuclidN.forEach(r => r.fill(4));
    S.trackOctave.fill(1); S.trackActiveBank.fill(3);
    S.trackAtMode.fill(2);
    S.padLayoutChromatic.fill(true); S.padLayoutChord.fill(false); S.padLayoutPiano.fill(false);
    S.trackMacros = S.trackMacros.map(() => [{ v: 1, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff' }] }, null, null, null, null, null, null, null]);
    S.trackMidiVals = S.trackMidiVals.map(() => ({ 'cc:74': 99 }));
    S.clipProgram = S.clipProgram.map(c => c.map(() => [12, 0, 1]));
    S.presetRec = { '0:synth': { name: 'X', path: '/x', hash: null, mod: '' } };
}
const uiPath = () => P.uuidToUiStatePath(UUID);
function diffFromFresh() {
    const got = JSON.parse(J(P.sidecarObject())), want = JSON.parse(J(P.freshSidecar()));
    const bad = Object.keys(want).filter(k => J(got[k]) !== J(want[k]));
    return bad.map(k => k + ': ' + J(got[k]).slice(0, 60) + ' (fresh ' + J(want[k]).slice(0, 60) + ')');
}

step('⭐ a project with NO sidecar: nothing of the project before survives', () => {
    dirty();
    delete FILES[uiPath()];
    B.restoreUiSidecar(true);
    const bad = diffFromFresh();
    assert(bad.length === 0, 'carried from the previous project: ' + bad.join(' | '));
    assert(S.sessionView === true, 'a new project opens in Session View');
});

step('a CLEARED project ({"v":0}) is fresh the same way', () => {
    dirty();
    FILES[uiPath()] = '{"v":0}';
    B.restoreUiSidecar(true);
    const bad = diffFromFresh();
    assert(bad.length === 0, 'carried: ' + bad.join(' | '));
});

step('control: a SAVED project still restores its own values', () => {
    dirty();
    const saved = JSON.parse(J(P.sidecarObject()));
    saved.sv = 0;
    FILES[uiPath()] = J(saved);
    S.trackMacros = new Array(8).fill(null); S.activeTrack = 0; S.perfRecalledSlot = -1;
    B.restoreUiSidecar(true);
    assert(S.activeTrack === 5, 'active track ' + S.activeTrack);
    assert(S.trackMacros[2] && S.trackMacros[2][0], 'macros not restored: ' + J(S.trackMacros[2]));
    assert(S.perfRecalledSlot === 9, 'recalled slot ' + S.perfRecalledSlot);
    assert(S.sessionView === false, 'its own view (Track)');
});

step('a saved project with no recalled perf slot clears the previous one', () => {
    dirty();
    const saved = JSON.parse(J(P.sidecarObject()));
    saved.rs = -1;
    FILES[uiPath()] = J(saved);
    B.restoreUiSidecar(true);
    assert(S.perfRecalledSlot === -1, 'recalled slot leaked: ' + S.perfRecalledSlot);
});

if (failed) { console.log('FAIL: test_fresh_project_sidecar'); process.exit(1); }
console.log('PASS: test_fresh_project_sidecar');
}
main().catch(e => { console.error(e); process.exit(1); });
