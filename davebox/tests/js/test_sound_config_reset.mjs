import './_bulk_get_stub.mjs';
/* tests/js/test_sound_config_reset.mjs — BANK-RESET SLICE 3: Delete + jog click
 * on the SOUND + CONFIG bank puts its params back to their defaults.
 *
 * ⚠ THE DISTINCTION THIS TEST EXISTS TO HOLD (Josh, 2026-09-13, correcting me):
 * *"sound mode isn't a bank. SOUND + CONFIG IS. i never specd resetting the sound
 * menu params. this was only ever about bank params."* So the gesture acts on the
 * BANK's knobs — the four page levels — and must NOT act inside the module
 * editor, where the knobs belong to the module rather than to the bank.
 *
 * Driven as a GESTURE (real CCs through soundOnCC), because a green suite has
 * never meant the screen can be reached. → [[wired-is-not-reachable]]
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
    writes.push({ key, val: String(val) }); ENGINE[key] = String(val); return 1;
};
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const auto = await import('../../ui/ui_automation.mjs');

const cc = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) { GS.clockMs = (GS.clockMs || 0) + 10.6; snd.soundTick(); bridge.tickPrefetch(); auto.automationTick(); } };
const turnBy = (k, n) => cc(71 + k, n > 0 ? n : 128 + n);
const withDelete = (fn) => { cc(119, 127); fn(); cc(119, 0); };
const click = () => { cc(3, 127); cc(3, 0); };
const lastWrite = (key) => {
    const w = writes.filter((x) => x.key === key);
    return w.length ? w[w.length - 1].val : null;
};

function enterTrack(t) {
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;   /* all Schwung */
    GS.activeTrack = t;
    snd.soundEnter(t, t);
    ticks(4);
}

/* The four levels ON the SOUND + CONFIG card and their declared defaults
 * (LEVEL_KNOB_SPECS). Derived here only as a fixture; the code owns the truth. */
/* ⚠ The engine key is COMPONENT-prefixed (`slot:` on a Schwung track, `move_fx:N:`
 * on a Move bus). A bare `volume` matches nothing and every assertion on it then
 * passes vacuously against `null` — which is exactly how the first cut of this
 * test reported a trivially-true control. */
const LEVELS = [
    { key: 'slot:volume', def: 1 },
    { key: 'slot:pan',    def: 0.5 },
    { key: 'slot:send_a', def: 0 },
    { key: 'slot:send_b', def: 0 },
];

enterTrack(1);

step('the four SOUND + CONFIG levels move off their defaults first', () => {
    writes = [];
    turnBy(0, -20);        /* volume down */
    turnBy(1, 10);         /* pan right   */
    turnBy(2, 15);         /* send A up   */
    turnBy(3, 8);          /* send B up   */
    ticks(6);
    for (const L of LEVELS) {
        const got = lastWrite(L.key);
        assert(got !== null, L.key + ' was never written at all — wrong key? got: ' + JSON.stringify(writes));
        assert(parseFloat(got) !== L.def,
               L.key + ' did not move off its default (got ' + got + ')');
    }
});

step('⭐ Delete + jog click resets every one of them to its default', () => {
    writes = [];
    withDelete(click);
    ticks(6);
    for (const L of LEVELS) {
        const got = lastWrite(L.key);
        assert(got !== null, L.key + ' was never written by the reset: ' + JSON.stringify(writes));
        assert(parseFloat(got) === L.def,
               L.key + ' reset to ' + got + ', expected ' + L.def);
    }
});

step('⚠ CONTROL: it is IDEMPOTENT — a second reset writes nothing new', () => {
    /* The pending bit is only set for a level that actually MOVED, so a reset of
     * an already-default bank must not re-push four values every click. */
    writes = [];
    withDelete(click);
    ticks(6);
    const lvl = writes.filter((w) => LEVELS.some((L) => L.key === w.key));
    assert(lvl.length === 0, 'a no-op reset still wrote: ' + JSON.stringify(lvl));
});

step('⚠⚠ CONTROL: on a MIDI TRACK the gesture does not fire at all', () => {
    /* A MIDI track's SOUND + CONFIG card carries MIDI_MIX_SPECS — Expression,
     * Pan, Mod, Sustain, Program, Bank MSB/LSB — and NONE of them declares a
     * default value, so there is nothing to reset them TO. `levelsActive()`
     * already excludes a MIDI track; this is the control that proves the guard is
     * doing that work rather than being decorative.
     *
     * ⭑ THIS is the clause worth pinning. The module-editor case below is real
     * behaviour but is enforced UPSTREAM of this branch (the editor's own binding
     * consumes the jog click first), so a mutation of `levelsActive()` survives
     * against it — measured, not assumed. → [[explaining-is-not-checking]] */
    snd.soundExit();
    GS.trackRoute[4] = 2;                       /* MIDI channel route */
    GS.activeTrack = 4;
    snd.soundEnter(4, 4);
    ticks(4);
    writes = [];
    GS.actionPopupLines = null;
    withDelete(click);
    ticks(6);
    const popup = (GS.actionPopupLines || []).join(' ');
    assert(popup.indexOf('RESET') < 0,
           'a MIDI track has no resettable bank levels, but the reset fired: ' + popup);
    assert(!writes.some((w) => LEVELS.some((L) => L.key === w.key)),
           'a MIDI track wrote slot levels: ' + JSON.stringify(writes));
    /* back to the Schwung track for anything after this */
    snd.soundExit(); enterTrack(1);
});

step('⚠⚠ CONTROL: inside the MODULE EDITOR the gesture does NOT reset the bank', () => {
    /* Josh, 2026-09-13: this was only ever about BANK params. In the editor the
     * knobs are the MODULE's, so the click keeps whatever meaning it had there.
     *
     * ⚠ The first cut of this control PASSED for the wrong reason — one click
     * does not reach the editor (entry lands on view 18, one click → the block
     * list 0, TWO → the editor 1), so it was still asserting on the bank card and
     * "the gesture did not fire in the editor" was never tested at all. Hence the
     * explicit view assertions: a control that cannot reach its own precondition
     * is worse than no control. → [[a-check-that-cries-wolf-is-worse-than-none]] */
    const VIEW_BLOCKS = 0, VIEW_EDIT = 1;

    /* Off default while the levels ARE the knobs — i.e. before the editor. */
    turnBy(0, -20); ticks(4);
    const before = lastWrite('slot:volume');
    assert(before !== null, 'setup failed: volume was never written');
    assert(parseFloat(before) !== 1, 'setup failed: volume is already at its default');

    click(); ticks(3);
    assert(snd.soundViewForTest() === VIEW_BLOCKS,
           'expected the block list, got view ' + snd.soundViewForTest());
    click(); ticks(3);
    assert(snd.soundViewForTest() === VIEW_EDIT,
           'THE PRECONDITION: expected the module editor, got view ' + snd.soundViewForTest());

    writes = [];
    GS.actionPopupLines = null;
    withDelete(click);
    ticks(6);

    /* ⚠⚠ THE OBSERVABLE HAS TO BE "DID THE GESTURE FIRE", NOT "WAS ANYTHING
     * WRITTEN" — and finding that out cost a survived mutation. Asserting only
     * on writes, this control passed even with `levelsActive()` deleted from the
     * guard, because the level FLUSH is gated on the same predicate: in the
     * editor nothing reaches the engine whether the branch ran or not. So the
     * write assertion could never distinguish the guard from the flush gate.
     * The POPUP is what only the reset produces. → [[test-the-path-not-the-function]] */
    const popup = (GS.actionPopupLines || []).join(' ');
    assert(popup.indexOf('RESET') < 0,
           'the reset FIRED inside the module editor — popup was: ' + popup);
    const after = lastWrite('slot:volume');
    assert(after === null || parseFloat(after) === parseFloat(before),
           'the editor reset the BANK levels (volume became ' + after + ')');
});

/* ---- MACROS bank: Delete + click clears the ASSIGNMENTS, after asking -----
 * Josh, 2026-09-13: *"delete click on macro bank clears all macro assignments
 * for the track. but it needs a yes/no confirmation option before it executes."*
 * ⚠ This REPLACES the 09-12 model's "values to defaults, assignments unchanged". */
const BANK_MACROS = 13;
function seedMacros(t) {
    GS.trackMacros[t] = [
        { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] },
        null, null,
        { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] },
        null, null, null, null,
    ];
}
const assignedCount = (t) => (GS.trackMacros[t] || []).filter((m) => !!m).length;

step('Delete + click on MACROS ASKS FIRST — nothing is cleared yet', () => {
    snd.soundExit(); enterTrack(1);
    seedMacros(1);
    snd.soundSetBank(BANK_MACROS); ticks(3);
    assert(assignedCount(1) === 2, 'setup: expected 2 assignments, got ' + assignedCount(1));
    withDelete(click);
    ticks(2);
    assert(GS.confirmMacroClear === true, 'the confirm did not open');
    assert(GS.confirmMacroClearSel === 0, 'the confirm should open on OK');
    assert(assignedCount(1) === 2,
           '⚠⚠ it cleared BEFORE the confirm was answered — the whole point of asking');
});

step('⚠⚠ CONTROL: Cancel keeps every assignment', () => {
    cc(14, 1); ticks(1);                       /* jog turn -> Cancel */
    assert(GS.confirmMacroClearSel === 1, 'the jog did not move the selection');
    click(); ticks(2);
    assert(GS.confirmMacroClear === false, 'the confirm stayed open after a click');
    assert(assignedCount(1) === 2, 'Cancel cleared them anyway (' + assignedCount(1) + ' left)');
});

step('⭐ OK clears all eight assignments on the track', () => {
    withDelete(click); ticks(2);
    assert(GS.confirmMacroClear === true, 'the confirm did not re-open');
    click(); ticks(3);                         /* sel 0 = OK */
    assert(GS.confirmMacroClear === false, 'the confirm stayed open');
    assert(assignedCount(1) === 0, 'assignments survived: ' + JSON.stringify(GS.trackMacros[1]));
});

step('⚠ CONTROL: the CHAIN store is told too, so the clear is not JS-only', () => {
    /* macroMirrorToChain queues knob_N_clear; without it the chain store would
     * re-seed the macros on the next merge and they would come back. */
    const cleared = writes.filter((w) => /knob_\d_clear/.test(w.key));
    assert(cleared.length > 0, 'no knob_N_clear reached the chain store: ' + JSON.stringify(writes.slice(-8)));
});

console.log(failed ? 'FAIL: test_sound_config_reset' : 'PASS: test_sound_config_reset');
process.exit(failed);
}
main();
