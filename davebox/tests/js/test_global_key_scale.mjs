
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_global_key_scale.mjs — a Key/Scale pick from the global menu
 * COMMITS (Josh, 2026-09-01: "changing scale from the global menu isn't
 * sticking").
 *
 * The seam that broke: Key and Scale each have >2 options, so the jog click
 * opens the PICKER overlay rather than an in-place enum edit — and the picker
 * closed through the item's own `set()`, which for these two rows is a live
 * transpose PREVIEW, never the commit. Nothing reached xposeCommit, so
 * `padScale` never moved and the tick's stranded-preview heal dropped the
 * preview: the row snapped back within a blink, silently.
 *
 * Both branches are pinned here, because they fail differently:
 *   - no melodic content → commit outright (padScale moves, t0_xpose_apply queued);
 *   - melodic content     → raise the "Transpose all clips?" confirm — AND the
 *     confirm must SURVIVE A TICK. The heal (ui_tick's `_onKeyScale`) cancels a
 *     confirmXpose whose menu row is not in an edit, so a dialog raised from the
 *     picker dies on the next tick unless the finisher leaves `editing` true.
 *     That is the trap a naive fix walks straight into.
 *
 * ⭑ POSITIVE CONTROL first: a non-Key/Scale picker row (Launch, whose set() IS
 * the real write) must still commit — or these tests would pass just as well
 * against a picker that had stopped working altogether. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; 
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
/* ⚠⚠ TRIPWIRE: the entry-point wrapper SWALLOWS errors (captureError in ui.js),
 * writing them to seq8-jserr.log — which a stubbed host_write_file drops on the
 * floor. A tick or MIDI dispatch that died on line one then looks exactly like a
 * clean pass, so every "and it survives a tick" assertion below would be vacuous.
 * Fail the run instead: any jserr write is a swallowed exception. */
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.stipple_rect = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.move_midi_inject_to_move = () => {};

async function main() {
await import('../../ui/ui.js');
const { S }  = await import('../../ui/ui_state.mjs');
const menu   = await import('../../ui/ui_menu.mjs');
const xp     = await import('../../ui/ui_xpose.mjs');
const HC     = await import('/data/UserData/schwung/shared/constants.mjs');

const cc     = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click  = () => { cc(3, 127); cc(3, 0); };
const turnUp = () => cc(14, 1);
const queued = () => S.pendingDefaultSetParams.map(e => [e.key, e.val]);

/* Open the REAL global menu and park the cursor on `label`. */
function openOn(label) {
    /* ⚠ RIG: bankParams is built by init(), which this harness never runs —
     * left null, the LED repaint inside forceRedraw() throws, and the MIDI
     * wrapper SWALLOWS it, so a commit appears to half-happen (the value moves,
     * the dialog never closes). Seed it before anything can redraw. */
    if (!S.bankParams)
        S.bankParams = Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () => new Array(16).fill(0)));
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
    S.awaitingProjectSelect = false; S.sessionView = false; S.shiftHeld = false;
    S.globalEnumPick = null; S.confirmXpose = false;
    S.xposePrevKey = null; S.xposePrevScale = null;
    S.pendingDefaultSetParams.length = 0; sets.length = 0;
    menu.openGlobalMenu();
    const idx = S.globalMenuItems.findIndex(i => i && i.label === label);
    if (idx < 0) throw new Error('no "' + label + '" row in the global menu');
    S.globalMenuState.selectedIndex = idx;
    return S.globalMenuItems[idx];
}

step('CONTROL: a non-Key/Scale picker row (Launch) still commits through its own set()', () => {
    openOn('Launch');
    click();
    if (!S.globalEnumPick) throw new Error('the click did not open the picker');
    turnUp();
    const want = S.globalEnumPick.raw[S.globalEnumPick.sel];
    click();
    if (S.globalEnumPick) throw new Error('the picker did not close');
    const wrote = sets.some(([k]) => k === 'launch_quant') ||
                  queued().some(([k]) => k === 'launch_quant');
    if (!wrote) throw new Error('control failed: Launch wrote nothing — the picker itself is broken');
    if (S.launchQuant !== want)
        throw new Error('control failed: Launch did not adopt ' + want + ' (got ' + S.launchQuant + ')');
});

step('⭐ SCALE picks through the picker and COMMITS when no clip has melodic content', () => {
    openOn('Scale');
    const before = S.padScale;
    click();
    if (!S.globalEnumPick) throw new Error('the click did not open the Scale picker');
    turnUp();
    const want = S.globalEnumPick.raw[S.globalEnumPick.sel];
    if (want === before) throw new Error('rig: the turn did not move off the current scale');
    click();
    if (S.globalEnumPick) throw new Error('the picker did not close');
    if (S.padScale !== want)
        throw new Error('the pick did not stick: padScale is ' + S.padScale + ', wanted ' + want);
    if (!queued().some(([k]) => k === 't0_xpose_apply'))
        throw new Error('no t0_xpose_apply was queued — nothing reached the DSP');
    /* and it must still be there a tick later, not healed away */
    globalThis.tick();
    if (S.padScale !== want) throw new Error('the tick reverted padScale to ' + S.padScale);
});

step('⭐ KEY behaves identically — the same seam, the same two rows', () => {
    openOn('Key');
    const before = S.padKey;
    click(); turnUp();
    const want = S.globalEnumPick.raw[S.globalEnumPick.sel];
    click();
    if (S.padKey !== want)
        throw new Error('the Key pick did not stick: padKey is ' + S.padKey + ', wanted ' + want);
    if (want === before) throw new Error('rig: the turn did not move off the current key');
});

step('⭐ with melodic content the pick RAISES the confirm — and it SURVIVES A TICK', () => {
    const it = openOn('Scale');
    /* Give a melodic clip content so anyMelodicClipHasContent() is true —
     * it reads clipNonEmpty on a non-drum track, nothing deeper. */
    const t = S.activeTrack, c = S.trackActiveClip[t];
    const wasNonEmpty = S.clipNonEmpty[t][c];
    S.clipNonEmpty[t][c] = 1;
    const before = S.padScale;
    click(); turnUp();
    const want = S.globalEnumPick.raw[S.globalEnumPick.sel];
    click();
    if (!S.confirmXpose)
        throw new Error('a pick over melodic content did not raise the transpose confirm');
    if (S.padScale !== before)
        throw new Error('the confirm branch committed early — padScale moved before the answer');
    globalThis.tick();
    if (!S.confirmXpose)
        throw new Error('the stranded-preview heal cancelled the confirm on the next tick');
    /* answer YES: the jog click on the dialog commits */
    click();
    if (S.confirmXpose) throw new Error('the confirm did not close on an answer');
    if (S.padScale !== want)
        throw new Error('answering YES did not commit: padScale is ' + S.padScale);
    if (!queued().some(([k]) => k === 't0_xpose_apply'))
        throw new Error('answering YES queued no t0_xpose_apply');
    S.clipNonEmpty[t][c] = wasNonEmpty;
});

if (swallowed !== null) { console.error('  FAIL — a SWALLOWED exception reached the jserr log:\n' + swallowed); failed = 1; }
step('⭐ answering NO abandons: the value stays put and the preview is cancelled', () => {
    const t = S.activeTrack, c = S.trackActiveClip[t];
    openOn('Scale');
    const wasNonEmpty = S.clipNonEmpty[t][c]; S.clipNonEmpty[t][c] = 1;
    const before = S.padScale;
    click(); turnUp(); click();
    if (!S.confirmXpose) throw new Error('rig: no confirm to answer');
    cc(14, 1);                       /* move the Yes/No selection to No */
    if (S.confirmXposeSel !== 1) throw new Error('rig: the jog did not reach No');
    click();
    if (S.confirmXpose) throw new Error('No did not close the confirm');
    if (S.padScale !== before)
        throw new Error('No committed anyway: padScale is ' + S.padScale);
    if (S.xposePrevKey !== null) throw new Error('No left a preview armed');
    if (S.globalMenuState.editing) throw new Error('No left the row in an edit');
    S.clipNonEmpty[t][c] = wasNonEmpty;
});

step('⭐ BACK on the confirm cancels WITHOUT stranding an edit (the phantom-edit trap)', () => {
    /* The confirm branch arms `editing` on purpose — the tick heal reads it to
     * decide the dialog is still live — so ONLY the cancel paths can disarm it.
     * Left armed, the row shows the candidate the user just cancelled and the
     * next jog-click re-raises the same confirm through the Key/Scale
     * interceptor. */
    const t = S.activeTrack, c = S.trackActiveClip[t];
    openOn('Scale');
    const wasNonEmpty = S.clipNonEmpty[t][c]; S.clipNonEmpty[t][c] = 1;
    const before = S.padScale;
    click(); turnUp(); click();
    if (!S.confirmXpose) throw new Error('rig: no confirm to cancel');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    if (S.confirmXpose) throw new Error('Back did not cancel the confirm');
    if (S.padScale !== before) throw new Error('Back committed: padScale is ' + S.padScale);
    if (S.globalMenuState.editing)
        throw new Error('Back stranded an edit the user never started');
    if (S.globalMenuState.editValue !== null)
        throw new Error('Back left the cancelled candidate in editValue');
    S.clipNonEmpty[t][c] = wasNonEmpty;
});

step('⭐ BACK abandons the picker itself — no commit, no preview', () => {
    openOn('Scale');
    const before = S.padScale;
    click(); turnUp();
    if (!S.globalEnumPick) throw new Error('rig: no picker open');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    if (S.globalEnumPick) throw new Error('Back did not close the picker');
    if (S.padScale !== before) throw new Error('an abandoned picker committed anyway');
    if (S.confirmXpose) throw new Error('an abandoned picker raised the confirm');
    if (queued().some(([k]) => k === 't0_xpose_apply'))
        throw new Error('an abandoned picker queued a transpose');
});

step('⭐ picking the value it already has is a no-op — no confirm, nothing queued', () => {
    const t = S.activeTrack, c = S.trackActiveClip[t];
    openOn('Scale');
    const wasNonEmpty = S.clipNonEmpty[t][c]; S.clipNonEmpty[t][c] = 1;
    const before = S.padScale;
    click();                          /* open on the current value, do not turn */
    if (S.globalEnumPick.raw[S.globalEnumPick.sel] !== before)
        throw new Error('rig: the picker did not open on the current value');
    click();
    if (S.confirmXpose) throw new Error('an unchanged pick raised the confirm');
    if (S.padScale !== before) throw new Error('an unchanged pick moved padScale');
    if (queued().some(([k]) => k === 't0_xpose_apply'))
        throw new Error('an unchanged pick queued a transpose');
    if (S.globalMenuState.editing) throw new Error('an unchanged pick left an edit armed');
    S.clipNonEmpty[t][c] = wasNonEmpty;
});

step('⭐ CONTROL: the stranded-preview heal CAN fire in this rig', () => {
    /* The three "survives a tick" assertions above are only worth something if
     * a tick in this rig is capable of cancelling a preview at all. Strand one
     * deliberately — armed, with the menu closed — and require the tick to take
     * it. Without this, a tick that did nothing would pass them all. */
    openOn('Scale');
    xp.xposePreviewSet(S.padKey, (S.padScale + 1) % 12);
    if (S.xposePrevKey === null) throw new Error('rig: the preview did not arm');
    S.globalMenuOpen = false;         /* navigated away — nothing owns it now */
    globalThis.tick();
    if (S.xposePrevKey !== null)
        throw new Error('control failed: the heal never fires here, so the survival assertions prove nothing');
});

process.exit(failed);
}
main();
