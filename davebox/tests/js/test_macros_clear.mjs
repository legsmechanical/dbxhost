import './_bulk_get_stub.mjs';
/* tests/js/test_macros_clear.mjs — MACROS bank, Delete + jog click: unassign all
 * eight macros on the track, AFTER a yes/no confirm (Josh, 2026-09-13).
 *
 * ⚠⚠ WHY THIS IS A SEPARATE FILE FROM test_sound_config_reset.mjs, AND WHY IT
 * ENTERS THROUGH `onMidiMessageInternal`:
 *
 * The first cut of this feature was DEAD CODE ON DEVICE. The confirm flag is
 * registered in `soundModeCovered()` so the dialog can draw over the MACROS bank
 * — and ui.js gates sound mode's input on that same predicate:
 *
 *     const _soundSteers = soundActive() && !soundModeCovered() && !_isCapture;
 *
 * so the handler, which lived in `soundOnCC`, became unreachable the instant its
 * own flag went up. The dialog opened and NOTHING on the device could dismiss it.
 *
 * A test that calls `soundOnCC` directly cannot see that: it bypasses the gate
 * that breaks it. So every gesture here goes in as real MIDI through
 * `onMidiMessageInternal` and out through `globalThis.tick()`, which is the only
 * shape that answers "can a person actually do this". → [[wired-is-not-reachable]]
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const ENGINE = {
    'synth:module': 'nusaw',
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
    ]),
    'synth:cutoff': '0.5',
};
globalThis.shadow_get_param = (slot, key) => (ENGINE[key] !== undefined ? ENGINE[key] : '');
let writes = [];
globalThis.shadow_set_param = (slot, key, val) => {
    writes.push({ slot, key, val: String(val) }); ENGINE[key] = String(val); return 1;
};
globalThis.shadow_send_midi_to_dsp = () => {};
/* The DSP-bound writes, so the control below can prove `undo_restore` was NOT
 * sent. Declared here because the blanket stub loop would swallow it. */
let dspWrites = [];
globalThis.host_module_set_param = (key, val) => { dspWrites.push(key + '=' + val); return 1; };
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const { BANK_MACROS } = await import('../../ui/ui_constants.mjs');
await import('../../ui/ui.js');          /* the REAL entry point + dispatch */

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = i + 1; }
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;

/* ⭑ REAL MIDI IN, REAL TICK OUT — the two doors a person's gesture goes through. */
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const CC_JOG_CLICK = 3, CC_JOG_TURN = 14, CC_DELETE = 119, CC_BACK = 51;
const click = () => { cc(CC_JOG_CLICK, 127); cc(CC_JOG_CLICK, 0); };
const withDelete = (fn) => { cc(CC_DELETE, 127); fn(); cc(CC_DELETE, 0); };
const assigned = (t) => (S.trackMacros[t] || []).filter((m) => !!m).length;
const chainClears = () => writes.filter((w) => /^knob_\d_clear$/.test(w.key));

function macroFixture() {
    return [
        { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] },
        null, null,
        { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] },
        null, null, null,
        { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] },
    ];
}
function openOnMacros(t) {
    if (snd.soundOpen()) snd.soundExit();
    S.activeTrack = t;
    snd.soundEnter(t, t);
    ticks(4);
    snd.soundSetBank(BANK_MACROS);
    ticks(3);
    S.trackMacros[t] = macroFixture();
    writes = [];
}

openOnMacros(1);

step('Delete + jog click on MACROS opens the confirm and clears NOTHING yet', () => {
    assert(assigned(1) === 3, 'setup: expected 3 assignments, got ' + assigned(1));
    withDelete(click);
    ticks(2);
    assert(S.confirmMacroClear === true, 'the confirm did not open');
    /* ⭑ Destructive, so it opens on CANCEL (Josh, 2026-09-13) — a stray second
     * click must not wipe eight assignments. */
    assert(S.confirmMacroClearSel === 1, 'it should open on CANCEL, not OK');
    assert(assigned(1) === 3, 'it cleared before being answered — the point of asking');
});

step('⚠⚠ THE REGRESSION GUARD: the jog still REACHES the dialog once it is up', () => {
    /* This is the assertion the dead-code bug would have failed. With the handler
     * on the wrong side of soundModeCovered(), the jog reached nothing and the
     * selection could never move. */
    cc(CC_JOG_TURN, 1); ticks(1);
    assert(S.confirmMacroClearSel === 0,
           'the jog did not move the selection — the dialog is not receiving input');
});

step('⚠ CONTROL: Cancel keeps every assignment, and no chain write is made', () => {
    cc(CC_JOG_TURN, 1); ticks(1);              /* back to Cancel */
    assert(S.confirmMacroClearSel === 1, 'setup: expected Cancel selected');
    click(); ticks(2);
    assert(S.confirmMacroClear === false, 'the confirm stayed open after answering');
    assert(assigned(1) === 3, 'Cancel cleared them anyway (' + assigned(1) + ' left)');
    assert(chainClears().length === 0, 'Cancel wrote to the chain store: ' + JSON.stringify(chainClears()));
});

step('⭐ OK unassigns all eight, and tells the CHAIN STORE for every one of them', () => {
    writes = [];
    withDelete(click); ticks(2);
    assert(S.confirmMacroClear === true, 'the confirm did not re-open');
    cc(CC_JOG_TURN, 1); ticks(1);              /* jog from Cancel to OK */
    assert(S.confirmMacroClearSel === 0, 'setup: expected OK selected');
    click();
    ticks(12);                                 /* WRITES_PER_TICK = 2, so 8 needs ≥4 */
    assert(S.confirmMacroClear === false, 'the confirm stayed open');
    assert(assigned(1) === 0, 'assignments survived: ' + JSON.stringify(S.trackMacros[1]));
    /* ⚠ ALL EIGHT. Asserting "> 0" passed against a version that cleared one:
     * the queue drains 2 per tick, so a short tick budget hid the rest. */
    const keys = new Set(chainClears().map((w) => w.key));
    for (let i = 1; i <= 8; i++)
        assert(keys.has('knob_' + i + '_clear'),
               'knob_' + i + '_clear never reached the chain store — its macro would come '
               + 'back on the next merge. got: ' + [...keys].join(','));
});

step('⚠⚠ BACK CANCELS IT — and the dialog cannot be left standing', () => {
    openOnMacros(2);
    withDelete(click); ticks(2);
    assert(S.confirmMacroClear === true, 'setup: the confirm is not open');
    cc(CC_BACK, 127); cc(CC_BACK, 0); ticks(2);
    assert(S.confirmMacroClear === false, 'Back did not dismiss the dialog');
    assert(assigned(2) === 3, 'Back cleared the macros');
});

step('⚠⚠ LEAVING SOUND MODE drops it — or it paints over an unrelated screen', () => {
    openOnMacros(3);
    withDelete(click); ticks(2);
    assert(S.confirmMacroClear === true, 'setup: the confirm is not open');
    snd.soundExit();
    ticks(2);
    assert(S.confirmMacroClear === false,
           'the confirm survived soundExit — it draws over everything, so it would be '
           + 'stuck on the track overview with nothing able to dismiss it');
});

/* ⚠⚠ NOT PINNED, AND SAYING SO RATHER THAN PRETENDING: THE MODIFIER RELEASE.
 *
 * `macroClearConfirmOpen` sets ui_sound's own `S.deleteHeld = false`, because on
 * the LATCHED card sound mode sees Delete's press and then cannot see its release
 * (the flag it raises makes soundModeCovered() true, and ui.js stops routing CCs
 * there). Left held, every later knob touch in sound mode clears that parameter's
 * automation — a silent lane-destroyer.
 *
 * A mutation deleting that line SURVIVES. The reason is not that the line is
 * pointless: on the RESTING overview, which is what this rig can drive, CC 119
 * never reaches sound mode at all, so there is nothing to leave held. I could not
 * get the harness to route Delete into sound mode on the latched card (probed:
 * latched, not resting, active, view 19 — and `S.deleteHeld` still false), and I
 * stopped rather than keep digging.
 *
 * So: the line is defensive and unproven HERE. It is worth one device check —
 * open the confirm from the latched MACROS card, cancel it, then touch a knob and
 * confirm that touch does NOT clear the parameter's automation. */

/* ---- ⭐ UNDO (Josh, 2026-09-13: "it should be undoable") --------------------
 *
 * ⚠⚠ AND THE CONTROL THAT MATTERS MOST: Undo must NOT send `undo_restore`. The
 * macro store is not in any clip, so involving the DSP would revert an unrelated
 * older clip edit out of its one-deep slot — a gesture that silently undoes
 * something the user did minutes ago. That is why the JS unit exists at all. */
const CC_UNDO = 56, CC_SHIFT = 49;   /* MoveUndo = 56 (ui_constants.mjs) */
const undoPress = () => { cc(CC_UNDO, 127); cc(CC_UNDO, 0); };

step('⭐ UNDO brings all eight macro assignments back', () => {
    openOnMacros(5);
    const wanted = (S.trackMacros[5] || []).map((m) => (m ? 1 : 0)).join('');
    assert(assigned(5) === 3, 'setup: expected 3 assignments');
    withDelete(click); ticks(2);
    /* ⓘ Selecting OK directly. The jog's reach into the dialog is pinned by the
     * regression-guard step above; this step is about what UNDO restores, and
     * driving the selection here only adds a way for it to fail for another
     * reason. */
    S.confirmMacroClearSel = 0;
    click(); ticks(6);
    assert(assigned(5) === 0, 'setup: the clear did not happen');

    writes = []; dspWrites = [];
    undoPress(); ticks(8);
    assert(assigned(5) === 3, 'UNDO did not restore the assignments: ' + JSON.stringify(S.trackMacros[5]));
    assert((S.trackMacros[5] || []).map((m) => (m ? 1 : 0)).join('') === wanted,
           'the assignments came back in the wrong SLOTS: expected ' + wanted);
});

step('⚠⚠ CONTROL: UNDO did NOT send undo_restore — no clip was touched', () => {
    /* This is the whole reason for the typed unit. If it fires, Undo is reverting a
     * clip edit the user never associated with this gesture. */
    assert(!dspWrites.some((w) => w.indexOf('undo_restore') >= 0),
           'Undo sent undo_restore for a JS-only change — it would revert an unrelated '
           + 'older clip edit: ' + dspWrites.join(' | '));
});

step('⭐ and the CHAIN STORE is re-pointed, or the next merge would undo the undo', () => {
    /* macroMigrateTick documents that a chain-store assignment WINS, so a restore
     * that only fixed davebox's store would have the macros vanish again. */
    const blob = writes.map((w) => w.key || '').join(' ');
    assert(/knob_\d_set/.test(blob),
           'no knob_N_set reached the chain store on undo: ' + blob);
});

step('⭐ SHIFT+UNDO clears them again (redo)', () => {
    /* ⚠ Not vacuous: assert they are BACK before redoing, or "still cleared" passes
     * for the wrong reason (it did, on the first run of this test). */
    assert(assigned(5) === 3, 'setup: undo should have restored them first');
    cc(CC_SHIFT, 127); undoPress(); cc(CC_SHIFT, 0); ticks(8);
    assert(assigned(5) === 0,
           'redo did not re-clear: ' + JSON.stringify(S.trackMacros[5]));
});

console.log(failed ? 'FAIL: test_macros_clear' : 'PASS: test_macros_clear');
process.exit(failed);
}
main();
