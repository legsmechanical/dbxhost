/* tests/js/test_note_session_overview.mjs — THE NOTE/SESSION LAW (Josh, 2026-09-02).
 *
 *   "Note/Session returns you to the OVERVIEW; where there is no overview to
 *    return to yet, it does nothing."
 *
 * Its old grammar — tap switches view, hold peeks — is now constrained to the
 * overview screens. Pinned here:
 *   - ONE PRESS from each non-overview state lands at the overview, without
 *     changing which view you are in;
 *   - the boot modals (incompatible-state confirm, startup project picker) are
 *     inert — and the confirm must NOT exit the module, which is what the press
 *     used to do and the single most safety-critical line of the change;
 *   - at rest the old grammar is untouched (tap flips, hold peeks and reverts);
 *   - the release is swallowed, so the escape cannot flip the view on its way out;
 *   - ⭑ the DRIFT PIN: this file's law and `_backTap`'s parallel case list will
 *     diverge the moment someone adds a screen. Every `S.*` flag `backTapWouldAct`
 *     reads must appear in `atOverview()` or in an explicit carve-out below. */

import { readFileSync } from 'fs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

let exitCalls = 0;
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
/* ⚠⚠ TRIPWIRE: the entry-point wrapper SWALLOWS errors into seq8-jserr.log, and a
 * stubbed writer drops them — a dispatch that died on line one then looks exactly
 * like a clean pass and every assertion below would be vacuous. Fail instead. */
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {}; globalThis.set_pixel = () => {}; globalThis.stipple_rect = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_exit_module = () => { exitCalls++; };

async function main() {
await import('../../ui/ui.js');
const { S }   = await import('../../ui/ui_state.mjs');
S.clockFollowTicks = true;   /* time in tests is driven by S.tickCount (ui_clock) */
const cc_mod  = await import('../../ui/ui_input_cc.mjs');
const snd     = await import('../../ui/ui_sound.mjs');
const rec     = await import('../../ui/ui_record.mjs');

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const press = () => { cc(50, 127); cc(50, 0); };
const NS = 50;

function rest() {
    if (!S.bankParams)
        S.bankParams = Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () => new Array(16).fill(0)));
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
    S.awaitingProjectSelect = false; S.confirmStateWipe = false;
    S.sessionView = false; S.shiftHeld = false; S.activeBank = 0;
    S._modalSwallowCC = -1;
    S.noteSessionPressedTick = -1; S.sessionViewMomentary = false;
    S.shiftNoteSessionTick = -1;
    if (snd.soundActive()) snd.soundExit();
    rec.stepRecExit();
    cc_mod.__forTest_returnToOverview
        ? cc_mod.__forTest_returnToOverview()
        : null;
    S.bankCardLatched = false; S.sessMixerLatched = false;
    S.perfViewLocked = false; S.perfStack = [];
    S.globalMenuOpen = false; S.daveBox = false; S.projectPadPicker = null;
    S.snapshotPicker = null; S.globalEnumPick = null; S.clearAutoMenu = null;
    S.tapTempoOpen = false; S.tempoSelectActive = false;
    S.mergeNoticePending = false; S.mergeCountingIn = false;
    S.pendingMergePlacement = false; S.mergeSoloPlacement = -1;
    S.capturePlaceTrack = -1; S.pendingSceneBakePicker = false;
    S.confirmBakeScene = false; S.confirmBakeDrumLoopOpen = false;
    S.confirmXpose = false; S.confirmLgto = false; S.confirmBake = false;
    S.recordBlockedDialog = false; S.bpmMoveInfo = false;
    S.stepIntervalMode = false; S.altMode = false; S.allLanesConfirmed = false;
    if (!cc_mod.atOverview()) throw new Error('rig: could not reach the overview');
}

/* Each entry: a name, an arrange fn, and (optionally) extra assertions. */
const STATES = [
    ['a latched track bank view', () => { S.bankCardLatched = true; }],
    ['the session mixer page',    () => { S.sessionView = true; S.sessMixerLatched = true; }],
    ['perf lock (session view)',  () => { S.sessionView = true; S.perfViewLocked = true; }],
    ['the global menu',           () => { S.globalMenuOpen = true; }],
    ['the Dave Box album',        () => { S.daveBox = true; }],
    ['the snapshot picker',       () => { S.snapshotPicker = { confirm: null }; }],
    ['the clear-automation menu', () => { S.clearAutoMenu = { t: 0 }; }],
    ['the tap-tempo screen',      () => { S.tapTempoOpen = true; }],
    ['a live-merge notice',       () => { S.mergeNoticePending = true; }],
    ['a merge count-in',          () => { S.mergeCountingIn = true; }],
    ['a capture placement',       () => { S.capturePlaceTrack = 0; }],
    ['the scene-bake picker',     () => { S.pendingSceneBakePicker = true; }],
    ['the record-blocked dialog', () => { S.recordBlockedDialog = true; }],
    ['the BPM/Move info dialog',  () => { S.bpmMoveInfo = true; }],
    ['the arp-steps overlay',     () => { S.stepIntervalMode = true; }],
    ['an alt view',               () => { S.altMode = true; }],
    ['step recording',            () => { rec.stepRecEnter(); }],
    ['sound mode',                () => { snd.soundEnter(S.activeTrack, 0); }],
];

step('⭐ ONE PRESS returns to the overview from every non-overview state', () => {
    for (const [name, arrange] of STATES) {
        rest();
        arrange();
        const viewBefore = S.sessionView;   /* AFTER the arrange — some states are session-view */
        if (cc_mod.atOverview())
            throw new Error('rig: "' + name + '" did not leave the overview');
        press();
        if (!cc_mod.atOverview())
            throw new Error('one press did not reach the overview from ' + name);
        if (S.sessionView !== viewBefore)
            throw new Error('the escape SWITCHED VIEWS leaving ' + name);
    }
});

step('⭐ the escape is ONE press, not a Back — it does not peel one level', () => {
    /* A dialog stacked over the menu: Back would close the dialog and leave the
     * menu; the escape must take both in a single press. */
    rest();
    S.globalMenuOpen = true; S.confirmLgto = true;
    press();
    if (S.confirmLgto)   throw new Error('the dialog survived');
    if (S.globalMenuOpen) throw new Error('only one level was peeled — that is Back, not the escape');
});

step('⭐ BOOT MODALS are inert — and the state-wipe confirm must NOT exit the module', () => {
    /* ⚠ "Does nothing" has THREE parts, and asserting only the first two lets a
     * broken guard pass: if the modal stops being recognised the press falls
     * through to the VIEW FLIP, which dismisses nothing and exits nothing while
     * still being badly wrong. Caught by mutation, 2026-09-02. */
    rest();
    S.confirmStateWipe = true;
    const before = exitCalls, viewA = S.sessionView;
    press();
    if (!S.confirmStateWipe)
        throw new Error('the escape dismissed a boot decision modal');
    if (exitCalls !== before)
        throw new Error('the escape EXITED THE MODULE from the state-wipe confirm (' +
                        (exitCalls - before) + ' calls) — it must do nothing here');
    if (S.sessionView !== viewA)
        throw new Error('the press flipped the view under the state-wipe confirm');
    S.confirmStateWipe = false;

    rest();
    S.projectPadPicker = { menu: null, colorPick: null, confirmNew: null };
    S.awaitingProjectSelect = true;
    const viewB = S.sessionView;
    press();
    if (!S.projectPadPicker)
        throw new Error('the escape closed the STARTUP picker — nothing is loaded behind it');
    if (S.sessionView !== viewB)
        throw new Error('the press flipped the view under the startup picker');
    S.awaitingProjectSelect = false; S.projectPadPicker = null;
});

step('⭐ at the overview the OLD grammar is untouched: tap flips, hold peeks and reverts', () => {
    rest();
    cc(NS, 127); cc(NS, 0);                      /* quick tap */
    if (!S.sessionView) throw new Error('a tap at rest did not flip the view');
    cc(NS, 127); cc(NS, 0);
    if (S.sessionView) throw new Error('a tap did not flip back');

    /* hold: press, let the threshold pass, release -> reverts */
    cc(NS, 127);
    if (!S.sessionView) throw new Error('the press did not show the other view');
    S.noteSessionPressedTick -= 40;              /* past NOTE_SESSION_HOLD_TICKS */
    cc(NS, 0);
    if (S.sessionView) throw new Error('a HOLD did not revert on release');
});

step('⭐ the RELEASE is swallowed after an escape — it must not flip the view out', () => {
    rest();
    S.bankCardLatched = true;
    cc(NS, 127);
    if (!cc_mod.atOverview()) throw new Error('the press did not escape');
    if (S._modalSwallowCC !== NS) throw new Error('the release was not armed for swallow');
    cc(NS, 0);
    if (S.sessionView) throw new Error('the release flipped the view out of the overview');
    if (S._modalSwallowCC === NS) throw new Error('the swallow was not cleared by the release');
});

step('⭐ Shift+Note/Session still opens from OFF-overview — the escape must not shadow it', () => {
    rest();
    S.bankCardLatched = true;
    S.shiftHeld = true;
    cc(NS, 127);
    if (S.shiftNoteSessionTick < 0)
        throw new Error('the shift gesture was not armed — the escape ran first and shadowed it');
    if (cc_mod.atOverview())
        throw new Error('the escape ran under Shift, destroying the state the gesture opens from');
    S.shiftNoteSessionTick = -1; S.shiftHeld = false; cc(NS, 0);
});

step('⭐ DRIFT PIN: every state Back knows about is a state the law knows about', () => {
    /* ⚠ Three parallel teardown lists now exist (_backTap, _switchViewCleanup,
     * returnToOverview). This reads the SOURCE — bounded by structural anchors,
     * never a character window — and requires that every S.* flag
     * backTapWouldAct consults is named by atOverview() or carved out below. */
    const src = readFileSync('ui/ui_input_cc.mjs', 'utf8')   /* the runner cds to the repo root */;
    const body = (name) => {
        const head = 'function ' + name + '() {';
        const i = src.indexOf(head);
        if (i < 0) throw new Error('the pin cannot find ' + name + ' — anchor is stale');
        const end = src.indexOf('\n}', i);
        if (end < 0) throw new Error('the pin cannot bound ' + name + ' — anchor is stale');
        return src.slice(i + head.length, end);
    };
    const flags = (t) => new Set((t.match(/\bS\.[A-Za-z_][A-Za-z0-9_]*/g) || []));
    const back = flags(body('backTapWouldAct'));
    const law  = flags(body('atOverview') + body('noOverviewYet'));
    /* Carve-outs, each with its reason — NOT a dumping ground. */
    const CARVE = new Map([
        ['S.activeBank', 'a non-default bank at rest IS the track overview; Back only uses it for its LED'],
    ]);
    if (back.size < 8) throw new Error('the pin read too few flags (' + back.size + ') — anchor is stale');
    const missing = [...back].filter(f => !law.has(f) && !CARVE.has(f));
    if (missing.length)
        throw new Error('Back knows these states, the escape law does not: ' + missing.join(', ') +
                        ' — add them to atOverview()/returnToOverview() or carve them out with a reason');
});

if (swallowed !== null) { console.error('  FAIL — a SWALLOWED exception reached the jserr log:\n' + swallowed); failed = 1; }
process.exit(failed);
}
main();
