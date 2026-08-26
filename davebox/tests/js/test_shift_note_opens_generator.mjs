/* tests/js/test_shift_note_opens_generator.mjs — Shift+Note/Session opens the
 * active track's generator editor in one press, and still CLOSES what is open.
 *
 * Josh, 2026-08-26: "Track view: Shift+Note/Session should jump STRAIGHT to
 * either the generator's canvas UI (inside the SOUND + CONFIG bank, so Back
 * returns you to it) or Move co-run."
 *
 * ⚠⚠ THE CLOSER IS THE PART MOST AT RISK, which is why it is asserted first and
 * last. The opener was deliberately RETIRED on 2026-08-24 ("no gesture may open
 * a menu the module's own UI already reaches"), and retiring it is what made
 * this the one-press way out from any depth. Adding a destination must not cost
 * that exit — so the gesture is a toggle, and a change that only implemented
 * "open" would satisfy the request while removing the property the last ruling
 * was about.
 *
 * The destination follows the track's ROUTE, because "edit this track's
 * instrument" means different things per route: a Schwung track's sound is its
 * Generator block, a Move track's belongs to Move (co-run), and an EXT/MIDI
 * track has neither.
 */

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
globalThis.host_module_get_param = () => '';
/* A loaded generator: engineLoadedModule() reads `<comp>:module`, and an empty
 * answer is what "no generator" looks like — so the happy path needs a name. */
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
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
globalThis.shadow_get_shift_held = () => 1;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const sound = await import('../../ui/ui_sound.mjs');
/* ⚠ MoveNoteSession comes from dAVEBOx's OWN constants, not the host's shared
 * ones — importing it from there yields `undefined`, the CC never matches, and
 * every assertion below reports "the gesture did nothing" while testing nothing.
 * Caught by printing the constant when the first assertion failed. */
const { MoveNoteSession } = await import('../../ui/ui_constants.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');

function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}
/* The gesture as hardware sends it: Shift down, the button, Shift up. */
function shiftNote() {
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 0]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 0]));
}

step('setup: track view, track 1 on a Schwung chain', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 0;                 /* Schwung chain */
    ticks(16);
    if (sound.soundActive()) throw new Error('sound mode was already open before the gesture');
});

step('one press OPENS the track\'s sound', () => {
    shiftNote();
    ticks(4);
    if (!sound.soundActive())
        throw new Error('the gesture did not open sound mode');
});

/* THE PROPERTY THE LAST RULING WAS ABOUT. */
step('...and pressing it again CLOSES — the one-press way out survives', () => {
    shiftNote();
    ticks(4);
    if (sound.soundActive())
        throw new Error('the gesture no longer closes — the way out from any depth is gone');
});

step('a MIDI-routed track opens nothing and says why', () => {
    S.trackRoute[0] = 2;                 /* MIDI out — no generator, no co-run */
    S.actionPopupEndTick = -1;
    shiftNote();
    ticks(4);
    if (sound.soundActive())
        throw new Error('opened sound mode for a track that has no sound');
    if (S.actionPopupEndTick < 0)
        throw new Error('silently did nothing — a one-press gesture must explain itself');
    S.trackRoute[0] = 0;
});

/* Session view has its own meaning for this gesture (the buses); the opener is
 * track-view only, and co-run refuses in session view anyway. */
step('session view is left alone', () => {
    S.sessionView = true;
    ticks(2);
    shiftNote();
    ticks(4);
    if (sound.soundActive())
        throw new Error('the track-view opener fired in session view');
    S.sessionView = false;
});

if (failed) process.exit(1);
console.log('test_shift_note_opens_generator: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
