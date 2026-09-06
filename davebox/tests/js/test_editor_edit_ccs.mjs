/* tests/js/test_editor_edit_ccs.mjs — Undo / Copy / Delete on a module's page
 * in sound mode (upstream #429, this fork's route).
 *
 * dAVEBOx receives every CC as the tool, so the module's claim
 * (capabilities.claims_edit_ccs) is checked by sound mode itself before a
 * button is offered to the knob grid's instance copy/clear gesture. Pinned,
 * through the REAL CC entry point (onMidiMessageInternal) and the real editor:
 *   1. a claiming module's page up → the edit-trio claim is raised
 *      (host_edit_cc_block(1)); Copy held + a focus change pastes the declared
 *      keys into the picked instance, and davebox never saw the press
 *      (copyHeld stays false); the release ends it; Undo puts it back
 *   2. Shift+Copy is NOT the module's — nothing pastes
 *   3. a module that claimed nothing: Delete falls through to davebox's own
 *      modifier (deleteHeld), nothing is cleared, no claim is raised
 *   4. leaving sound mode drops the claim (host_edit_cc_block(0))
 *
 * ⚠ The premise this test exists for: the #425 port deleted the C binding
 * host_edit_cc_block while sound mode still called it, and every JS test stubs
 * host globals, so the suite could not see it. The stub here RECORDS calls,
 * and the host test (tests/host/test_child_copy_gesture.sh) pins that the
 * global exists in shadow_ui.js. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

/* ---- the fake module -------------------------------------------------- */
const PADS = {
    label: "Pads", child_count: 4, child_label: "Pad", child_prefix: "pad",
    child_index_param: "ui_current_pad",
    child_copy_keys: ["sample", "vol", "gain"],
    knobs: ["vol", "tune"],
    params: [
        { key: "sample", name: "Sample", type: "filepath" },
        { key: "vol", name: "Vol", type: "float", min: 0, max: 1, default: 0.5 },
        { key: "tune", name: "Tune", type: "float", min: -12, max: 12 },
    ],
};
const HIER = { pad_layout: "drums", levels: {
    root: { params: [{ level: "pads", label: "Pads" }, { level: "fx", label: "FX" }] },
    pads: PADS,
    fx: { name: "FX", knobs: ["verb"], params: [{ key: "verb", name: "Verb", type: "float", min: 0, max: 1 }] },
} };
const CP = [];
for (let i = 0; i < 4; i++) {
    CP.push({ key: `pad${i}_sample`, name: "Sample", type: "filepath" });
    CP.push({ key: `pad${i}_vol`, name: "Vol", type: "float", min: 0, max: 1, default: 0.5 });
    CP.push({ key: `pad${i}_tune`, name: "Tune", type: "float", min: -12, max: 12 });
    CP.push({ key: `pad${i}_gain`, name: "Gain", type: "float", min: 0, max: 2 });
}
CP.push({ key: "verb", name: "Verb", type: "float", min: 0, max: 1 });
const dev = {};
function resetDev() {
    for (const k of Object.keys(dev)) delete dev[k];
    for (let i = 0; i < 4; i++) { dev[`pad${i}_sample`] = `/s/${i}.wav`; dev[`pad${i}_vol`] = String((i + 1) / 10); dev[`pad${i}_tune`] = String(i); dev[`pad${i}_gain`] = String(1 + i); }
    dev.verb = "0.3"; dev.ui_current_pad = "0";
}
resetDev();
let moduleId = 'claimer';                    /* which module every slot holds */
const MODULES = {
    claimer: { id: 'claimer', capabilities: { claims_edit_ccs: true } },
    plain:   { id: 'plain' },
};
const writes = [];
const claimCalls = [];

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (path) => {
    const m = /\/sound_generators\/([a-z]+)\/module\.json$/.exec(String(path));
    return (m && MODULES[m[1]]) ? JSON.stringify(MODULES[m[1]]) : '';
};
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, k) => {
    const key = String(k);
    if (!key.startsWith('synth:')) return '';
    const bare = key.slice('synth:'.length);
    if (bare === 'module') return moduleId;
    if (bare === 'ui_hierarchy') return JSON.stringify(HIER);
    if (bare === 'chain_params') return JSON.stringify(CP);
    if (bare === 'preset_name') return '';
    if (bare === 'is_loading') return '0';
    return bare in dev ? dev[bare] : '';
};
globalThis.shadow_set_param = (slot, k, v) => {
    const key = String(k);
    if (key.startsWith('synth:')) { dev[key.slice(6)] = String(v); writes.push([key.slice(6), String(v)]); }
};
globalThis.shadow_restore_knob_leds = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = (on) => { claimCalls.push(on | 0); };
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
/* ⚠⚠ A MISSING host binding throws inside tick()'s try/catch and every later
 * stage silently never runs — see test_track_switch_follows_editor_cc. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const { MoveShift, MoveMainKnob, MoveUndo, MoveCopy, MoveDelete } = await import('/data/UserData/schwung/shared/constants.mjs');

const VIEW_EDIT = 1;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const shift = (down) => cc(MoveShift, down ? 127 : 0);
const jog = (delta) => cc(MoveMainKnob, delta > 0 ? delta : 128 + delta);
const view = () => snd.soundPickStateForTest().view;
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const lastClaim = () => claimCalls.length ? claimCalls[claimCalls.length - 1] : null;
const padWrites = (i) => writes.filter(([k]) => k.startsWith('pad' + i + '_'));

function enterEditor(t) {
    S.activeTrack = t;
    snd.soundEnter(t, t);
    snd.soundQueueActionForTest({ t: 'open', comp: 'synth' });
    globalThis.tick();
    if (!snd.soundOpen() || view() !== VIEW_EDIT) throw new Error('control failed: editor did not open on track ' + t + ' (view ' + view() + ')');
    ticks(40);                                       /* the contract settles, pages plan */
}
/* Walk the jog until the grid shows the pads level. The plain jog pages the
 * editor; bounded so a plan without a pads page fails loudly. */
function onPadsPage() {
    for (let i = 0; i < 12; i++) {
        const pg = snd.soundEditorPageForTest();
        if (pg && pg.level === 'pads' && Array.isArray(pg.keys) && pg.keys.some(Boolean)) return;
        jog(1); ticks(3);
    }
    throw new Error('control failed: no pads knob page reached (page ' + JSON.stringify(snd.soundEditorPageForTest()) + ')');
}
const focus = (i) => { dev.ui_current_pad = String(i); ticks(30); };

step('setup: track view, Schwung routes, a claiming module on every slot', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true;
    S.sessionView = false; S.globalMenuOpen = false;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackSoundOrigin[t] = -1; }
    S.playing = false;
    if (!globalThis.onMidiMessageInternal) throw new Error('no CC entry point');
});

step('1a. control: a claiming module\'s page up → the edit-trio claim is RAISED', () => {
    claimCalls.length = 0;
    enterEditor(2);
    onPadsPage();
    if (lastClaim() !== 1) throw new Error('host_edit_cc_block calls: ' + JSON.stringify(claimCalls));
});

step('1b. hold Copy on pad 0, focus pad 2 → the declared keys are pasted, in order; davebox never saw the press', () => {
    writes.length = 0;
    cc(MoveCopy, 127);
    if (S.copyHeld) throw new Error('davebox took the Copy press (copyHeld) — the module\'s page had claimed it');
    focus(2);
    const want = [['pad2_sample', '/s/0.wav'], ['pad2_vol', '0.1'], ['pad2_gain', '1']];
    if (JSON.stringify(padWrites(2)) !== JSON.stringify(want)) throw new Error('pad 2 writes ' + JSON.stringify(padWrites(2)) + ', want ' + JSON.stringify(want));
    if (writes.some(([k]) => k === 'pad2_tune')) throw new Error('a key outside child_copy_keys was written');
    if (padWrites(0).length || padWrites(1).length || padWrites(3).length) throw new Error('an unpicked instance was written: ' + JSON.stringify(writes));
});

step('1c. the release ends the gesture (latched to the press): the next focus change pastes nothing', () => {
    cc(MoveCopy, 0);
    if (S.copyHeld) throw new Error('copyHeld set by the release');
    writes.length = 0;
    focus(3);
    if (writes.length) throw new Error('a paste after the release: ' + JSON.stringify(writes));
});

step('1d. Undo puts pad 2 back', () => {
    writes.length = 0;
    cc(MoveUndo, 127); cc(MoveUndo, 0); ticks(2);
    const want = [['pad2_sample', '/s/2.wav'], ['pad2_vol', '0.3'], ['pad2_gain', '3']];
    if (JSON.stringify(padWrites(2)) !== JSON.stringify(want)) throw new Error('undo wrote ' + JSON.stringify(padWrites(2)) + ', want ' + JSON.stringify(want));
});

step('2. Shift+Copy is NOT the module\'s: a focus change while it is held pastes nothing', () => {
    focus(0);
    writes.length = 0;
    shift(true); cc(MoveCopy, 127);
    focus(1);
    if (writes.length) throw new Error('Shift+Copy armed the module\'s copy: ' + JSON.stringify(writes));
    cc(MoveCopy, 0); shift(false); ticks(2);
});

step('3. a module that claimed nothing: no claim raised; Delete is davebox\'s own modifier and clears nothing', () => {
    snd.soundExit(); ticks(3);
    if (lastClaim() !== 0) throw new Error('leaving the editor did not drop the claim: ' + JSON.stringify(claimCalls));
    moduleId = 'plain'; resetDev();
    claimCalls.length = 0;
    enterEditor(3);
    onPadsPage();
    if (claimCalls.some((v) => v === 1)) throw new Error('a claim was raised for a module that declared nothing: ' + JSON.stringify(claimCalls));
    writes.length = 0;
    cc(MoveDelete, 127);
    if (!S.deleteHeld) throw new Error('Delete did not reach davebox\'s own modifier (deleteHeld)');
    focus(2);
    if (writes.length) throw new Error('an unclaiming module\'s pad was cleared: ' + JSON.stringify(writes));
    cc(MoveDelete, 0);
    if (S.deleteHeld) throw new Error('the Delete release did not reach davebox (deleteHeld stuck)');
});

step('4. back to the claiming module: Delete + pick CLEARS (declared defaults, "" for the file), and leaving drops the claim', () => {
    snd.soundExit(); ticks(3);
    moduleId = 'claimer'; resetDev();
    enterEditor(4);
    onPadsPage();
    writes.length = 0;
    cc(MoveDelete, 127);
    if (S.deleteHeld) throw new Error('davebox took the Delete press the module\'s page had claimed');
    focus(1);
    const want = [['pad1_sample', ''], ['pad1_vol', '0.5']];
    if (JSON.stringify(padWrites(1)) !== JSON.stringify(want)) throw new Error('clear wrote ' + JSON.stringify(padWrites(1)) + ', want ' + JSON.stringify(want));
    cc(MoveDelete, 0);
    claimCalls.length = 0;
    snd.soundExit(); ticks(3);
    if (lastClaim() !== 0) throw new Error('soundExit did not drop the claim: ' + JSON.stringify(claimCalls));
});

process.exit(failed);
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
