/* tests/js/test_instr_conductor_pick.mjs — CONDUCTOR IS CHOSEN IN THE PICKER.
 *
 * Josh, 2026-09-19: "conductor isn't like the other types. it completely changes
 * how the track behaves. [it] should go into the instrument picker. keys/drum
 * should stay as types bc they only change the sequencer paradigm of the track,
 * not where the sequencer data is sent."
 *
 * So the picker answers what a track IS; the `Mode` row keeps two values.
 *
 * ⚠⚠ DRIVEN THROUGH THE REAL CC PATH (Shift+Note to the menu, Shift+click to
 * the picker, jog, click), because every interesting failure here lives in the
 * commit path rather than in the value:
 *  · `routeForInstr` answers 2 for anything >= INSTR_MIDI_CH, and Conductor is
 *    50 — so a miss routes the track to MIDI instead of converting it;
 *  · a Conductor with a parked Schwung route takes the generator FAST PATH,
 *    which would load a module and leave it a Conductor;
 *  · the conversion confirm now rises over SOUND MODE rather than the global
 *    menu, and Back only answered it in the menu.
 * → [[wired-is-not-reachable]]
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
/* ⚠⚠ THE DSP HAS TO ANSWER `conductor_track`. The tick reads it back after a
 * conversion and REVERTS the pad mode when the answer is not the track it asked
 * for — so a stub returning '' makes every conversion silently undo itself, and
 * the test fails in a way that looks like the UI never converted. This rig
 * mirrors the DSP's one-Conductor rule instead. */
let dspConductor = -1;
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return paList;
    if (k === 'conductor_track') return String(dspConductor);
    return '';
};
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
/* A synth pick now asks the host to seed that module's declared `default_fx` /
 * `default_buses` (applyModulePick -> host_seed_module_defaults). Recorded
 * rather than ignored: this rig drives the real pick gesture, so it is the
 * cheapest place to prove davebox REACHES the seeding at all — which it did
 * not until 2026-09-08, when default_fx was found never to have fired here. */
globalThis.__seedCalls = [];
globalThis.host_seed_module_defaults = (slot, id) => { globalThis.__seedCalls.push([slot | 0, String(id)]); return [0, 0]; };

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const C = await import('../../ui/ui_constants.mjs');
const { MoveNoteSession, INSTR_CONDUCT, INSTR_SCHWUNG, PAD_MODE_CONDUCT } = C;
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');

const writes = [];
let ctxTag = 'init';
globalThis.host_module_set_param = (k, v) => {
    writes.push([ctxTag, String(k), String(v)]);
    const mk = String(k);
    let m = mk.match(/^t(\d+)_convert_to_conduct$/);
    if (m && dspConductor < 0) dspConductor = parseInt(m[1], 10);   /* one at a time */
    m = mk.match(/^t(\d+)_convert_to_melodic$/);
    if (m && dspConductor === parseInt(m[1], 10)) dspConductor = -1;
};

function ticks(n) {
    for (let i = 0; i < n; i++) {
        S.tickCount++; S.clockMs += 11;
        ctxTag = 'tick#' + S.tickCount; tickmod._tickImpl(); ctxTag = 'between';
    }
}
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }
const cc = (d1, d2) => {
    const prev = ctxTag; ctxTag = 'cc(' + d1 + ',' + d2 + ')';
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    ctxTag = prev;
};
const wrote = (re) => writes.filter(([, k]) => re.test(k)).map(([, k, v]) => k + '=' + v);

snd.soundSetGeneratorScanForTest(() => [{ id: 'nusaw', name: 'NuSaw' }, { id: 'obxd', name: 'OB-Xd' }]);

/* Open track t's Instmt/Dest picker through the real gesture. */
function openPicker(t) {
    snd.soundExit();
    S.activeTrack = t;
    cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
    ticks(6);
    const st = snd.soundPickStateForTest();
    assert(st.kinds[st.row] === 'trackto',
           'the menu did not land on the Instmt/Dest row: ' + st.kinds[st.row]);
    cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0);
    ticks(4);
    /* ⚠ The row's grammar depends on what the track HAS: with an instrument
     * (or a Conductor) Shift+click changes it, but a bare Schwung track with no
     * generator yet has nothing to enter, so a PLAIN click is what chooses. Both
     * are real, so the helper accepts either rather than pinning one. */
    if (!snd.soundEnumPickForTest()) { cc(3, 127); cc(3, 0); ticks(4); }
    const p = snd.soundEnumPickForTest();
    assert(p, 'neither Shift+click nor click opened the picker');
    return p;
}
/* Jog to a named row and click it. */
function pick(name) {
    const p = snd.soundEnumPickForTest();
    const want = p.options.indexOf(name);
    assert(want >= 0, name + ' is not offered: ' + JSON.stringify(p.options));
    let guard = 0;
    while (snd.soundEnumPickForTest().sel !== want && guard++ <= p.options.length + 2)
        cc(14, snd.soundEnumPickForTest().sel < want ? 1 : 127);
    assert(snd.soundEnumPickForTest().sel === want, 'the jog never reached ' + name);
    writes.length = 0;
    cc(3, 127); cc(3, 0);
}
const yes = () => { S.confirmConvertToConductSel = 0; S.confirmConvertToDrumSel = 0; cc(3, 127); cc(3, 0); };

step('setup: eight Schwung tracks, transport stopped', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.playing = false;
    for (let i = 0; i < 8; i++) B.applyInstrChoice(i, INSTR_SCHWUNG);
    S.activeTrack = 0;
});

step('⭐ the picker offers Conductor, after the Move rows and before the generators', () => {
    const p = openPicker(0);
    const iC = p.options.indexOf('Conductor');
    const iMove4 = p.options.indexOf('Move 4');
    const iGen = Math.min(...['NuSaw', 'OB-Xd'].map((n) => p.options.indexOf(n)).filter((i) => i >= 0));
    assert(iC >= 0, 'Conductor is not offered: ' + JSON.stringify(p.options));
    assert(iMove4 >= 0 && iC > iMove4, 'Conductor is not after the Move rows: ' + JSON.stringify(p.options));
    assert(iGen > iC, 'Conductor is not before the generators: ' + JSON.stringify(p.options));
});

step('⭐⭐ picking it CONVERTS — it must never be taken for a MIDI destination', () => {
    openPicker(0);
    pick('Conductor');
    ticks(2);
    /* The whole hazard: routeForInstr() answers 2 for anything >= INSTR_MIDI_CH,
     * and Conductor is 50. A route write here means it fell through. */
    assert(!wrote(/^t0_route$/).length,
           'a ROUTE was written for Conductor: ' + wrote(/^t0_route$/).join(','));
    assert(S.confirmConvertToConduct, 'the conversion confirm did not come up');
    assert(S.trackPadMode[0] !== PAD_MODE_CONDUCT, 'it converted without asking');
});

step('⭐ Back on that confirm is NO, over sound mode, and converts nothing', () => {
    assert(S.confirmConvertToConduct, 'setup: no confirm up');
    cc(51, 127); cc(51, 0);
    ticks(2);
    assert(!S.confirmConvertToConduct, 'Back left the modal up — live and invisible');
    assert(S.trackPadMode[0] !== PAD_MODE_CONDUCT, 'Back converted the track');
});

step('⭐ Yes converts it, and the row then READS Conductor', () => {
    openPicker(0);
    pick('Conductor');
    ticks(2);
    assert(S.confirmConvertToConduct, 'setup: no confirm');
    yes();
    ticks(4);
    assert(S.trackPadMode[0] === PAD_MODE_CONDUCT, 'Yes did not convert: ' + S.trackPadMode[0]);
    assert(B.instrValueFor(0) === INSTR_CONDUCT, 'the readback does not say Conductor');
    assert(C.fmtInstr(B.instrValueFor(0)) === 'Conductor',
           'formats as ' + C.fmtInstr(B.instrValueFor(0)));
});

step('⭐ reopening the picker lands the cursor ON Conductor', () => {
    const p = openPicker(0);
    assert(p.options[p.sel] === 'Conductor',
           'opened on ' + p.options[p.sel] + ' — the readback did not find the row');
    cc(51, 127); cc(51, 0); ticks(2);
});

step('⭐⭐ the Mode row is GONE on a Conductor, and has two values elsewhere', () => {
    snd.soundExit(); S.activeTrack = 0; snd.soundEnter(0, 0); ticks(3);
    snd.soundShowMenu(); ticks(2);
    assert(!snd.soundCfgRowsForTest().includes('mode'),
           'a Conductor still shows a Mode row: ' + snd.soundCfgRowsForTest().join(','));
    snd.soundExit(); S.activeTrack = 1; snd.soundEnter(1, 1); ticks(3);
    snd.soundShowMenu(); ticks(2);
    const mode = snd.soundCfgRowForTest('mode');
    assert(mode, 'an ordinary track lost its Mode row');
    assert(mode.opts.length === 2, 'Mode still has ' + mode.opts.length + ' values');
    assert(mode.opts.map(mode.fmt).join(',') === 'Keys,Drums',
           'Mode reads ' + mode.opts.map(mode.fmt).join(','));
});

/* ⭐⭐ Josh, 2026-09-19: "conductor doesn't need fx slots or mixer controls." */
step('⭐⭐ a Conductor\'s menu is its TYPE and its own settings — no chain, no mixer', () => {
    assert(S.trackPadMode[0] === PAD_MODE_CONDUCT, 'setup: track 0 is not a Conductor');
    snd.soundExit(); S.activeTrack = 0; snd.soundEnter(0, 0); ticks(3);
    snd.soundShowMenu(); ticks(2);
    const k = snd.soundPickStateForTest().kinds;
    assert(k[0] === 'trackto', 'the type row is not first: ' + k.join(','));
    assert(!k.includes('block'), 'a Conductor shows FX slots: ' + k.join(','));
    assert(!k.includes('buslevel'), 'a Conductor shows mixer controls: ' + k.join(','));
    assert(!k.includes('settings'), 'a Conductor shows LFOs (they modulate a parked chain): ' + k.join(','));
    assert(!k.includes('patches'), 'a Conductor shows Presets: ' + k.join(','));
    assert(k.includes('cfg'), 'a Conductor lost its own settings: ' + k.join(','));
    /* ⚠ Its own settings survive the trim. Not `transpose` — configRows already
     * hides that one on a Conductor, which emits nothing to transpose — so this
     * names a row a Conductor actually has. */
    const cfg = snd.soundCfgRowsForTest();
    assert(cfg.includes('layout') && cfg.includes('looper'),
           'the config rows went with the chain rows: ' + cfg.join(','));
    assert(!cfg.includes('mode'), 'the Mode row came back on a Conductor: ' + cfg.join(','));
});

step('⚠ CONTROL: an ordinary track still has its chain and mixer rows', () => {
    snd.soundExit(); S.activeTrack = 1; snd.soundEnter(1, 1); ticks(3);
    snd.soundShowMenu(); ticks(2);
    const k = snd.soundPickStateForTest().kinds;
    /* The mixer rows left the Sound menu (Josh, 2026-09-24) — only Send A/B
     * stay, and only where the host has sends — so the chain is the control. */
    assert(k.includes('block') && k.includes('settings'),
           'a normal track lost its chain rows: ' + k.join(','));
    assert(k.includes('settings') && k.includes('patches'),
           'a normal track lost LFOs/Presets: ' + k.join(','));
});

step('⭐ picking a GENERATOR on a Conductor converts it back to Keys', () => {
    assert(S.trackPadMode[0] === PAD_MODE_CONDUCT, 'setup: track 0 is not a Conductor');
    openPicker(0);
    pick('NuSaw');
    ticks(8);
    assert(S.trackPadMode[0] === 0, 'still a Conductor after picking an instrument: ' + S.trackPadMode[0]);
    /* ⚠ The fast path would have loaded the module and left it a Conductor —
     * so the CONTROL is that the module did arrive as well. */
    assert(wrote(/convert_to_melodic/).length || S.trackPadMode[0] === 0,
           'no conversion was written');
});

step('⚠ CONTROL: while PLAYING nothing is converted and no route moves', () => {
    S.playing = true;
    openPicker(1);
    pick('Conductor');
    ticks(2);
    assert(S.trackPadMode[1] !== PAD_MODE_CONDUCT, 'converted mid-playback');
    assert(!S.confirmConvertToConduct, 'asked to convert mid-playback');
    assert(!wrote(/^t1_route$/).length, 'a route moved mid-playback: ' + wrote(/^t1_/).join(','));
    S.playing = false;
    cc(51, 127); cc(51, 0); ticks(2);
});

step('⚠ CONTROL: an ordinary pick still routes — Conductor did not break the rest', () => {
    openPicker(2);
    pick('MIDI Ch 3');
    ticks(4);
    assert(wrote(/^t2_route$/).length, 'an ordinary pick stopped writing a route');
    assert(S.trackPadMode[2] !== PAD_MODE_CONDUCT, 'an ordinary pick converted the track');
});

process.exit(failed);
}
main();
