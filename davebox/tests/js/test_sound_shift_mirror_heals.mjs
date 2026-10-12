/* tests/js/test_sound_shift_mirror_heals.mjs — sound mode keeps its OWN copy of
 * Shift, fed only by a CC 49 that reaches soundOnCC. A release that goes
 * anywhere else (dropped by the input ring while a tick stalls, taken by a
 * screen covering sound mode) used to leave that copy held: the global was
 * healed by the tick's reconcile and sound mode kept reading Shift+click.
 * Josh, 2026-10-12: Shift+click on a module, then "it'll put me in the list
 * manager rather than the module selector".
 *
 * Performs the gestures through onMidiMessageInternal and reads what the next
 * click QUEUES — the mirror itself is only the control. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_restore_knob_leds = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
/* ⚠⚠ These matter more than they look. `tick()` wraps _tickImpl in a
 * try/catch, so a MISSING host binding throws on the first line that touches it
 * and every later stage of the tick — including sound mode's track-follow —
 * silently never runs. The whole tick looks like it executed. A fourth version
 * of the one-shot step passed against its mutation purely because
 * host_ext_midi_remap_clear was undefined and the follow was unreachable. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
/* A loaded generator on every chain slot: engineLoadedModule() reads
 * `<comp>:module`, and the editor only opens on a block that has something in
 * it. The PARKED chain of a MIDI / NONE track answers the same — which is
 * exactly why those routes must NOT reopen an editor. */
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};


let physShift = 0;
globalThis.shadow_get_shift_held = () => physShift;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const VIEW_BLOCKS = 0;   /* ui_sound's own numbering */
const midi = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const pick = () => snd.soundPickStateForTest();
const view = () => pick().view;

function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

function enterMenu(t) {
    S.activeTrack = t; snd.soundEnter(t, t); globalThis.tick();
    snd.soundQueueActionForTest({ t: 'view', view: VIEW_BLOCKS }); globalThis.tick();
    if (view() !== VIEW_BLOCKS) throw new Error('control: menu did not open (view ' + view() + ')');
    if (pick().kinds[pick().row] !== 'trackto') throw new Error('control: not on the Instrument row: ' + pick().kinds.join(','));
}
/* The click on the Instrument row of a track with a generator: plain ENTERS
 * the generator (queues `open`), Shift+click opens the picker (queues nothing
 * of the kind). So what it queues says which one sound mode believed. */
function clickQueues() {
    midi(3, 127); midi(3, 0);
    const pa = snd.soundPendingActionForTest();
    return pa ? pa.t : null;
}

step('setup', () => {
    S.sessionView = false; S.globalMenuOpen = false; S.ledInitComplete = true;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackActiveBank[t] = 0; }
});

step('control: a plain click on the Instrument row enters the generator; a held Shift does not', () => {
    enterMenu(2);
    if (clickQueues() !== 'open') throw new Error('plain click queued ' + JSON.stringify(snd.soundPendingActionForTest()));
    snd.soundExit();
    enterMenu(2);
    physShift = 1; midi(49, 127);
    if (!pick().shift || !S.shiftHeld) throw new Error('the press did not reach both copies');
    if (clickQueues() === 'open') throw new Error('Shift+click entered the generator');
    physShift = 0; midi(49, 0);
    snd.soundExit(); globalThis.tick();
});

step('a DROPPED release: the tick heals sound mode\'s copy with the global, and the next click is a plain one', () => {
    enterMenu(2);
    physShift = 1; midi(49, 127);
    physShift = 0;                       /* the key came up; the CC never arrived */
    globalThis.tick();
    if (S.shiftHeld) throw new Error('control: the global was not healed');
    if (pick().shift) throw new Error('sound mode still reads Shift held');
    if (clickQueues() !== 'open') throw new Error('the next click was read as Shift+click: ' + JSON.stringify(snd.soundPendingActionForTest()));
    snd.soundExit(); globalThis.tick();
});

step('a release that reaches davebox but NOT sound mode (a screen covering it) still lifts sound mode\'s copy', () => {
    enterMenu(2);
    physShift = 1; midi(49, 127);
    S.tapTempoOpen = true;               /* covers sound mode: soundOnCC is not offered the CC */
    midi(49, 0);
    S.tapTempoOpen = false;
    if (S.shiftHeld) throw new Error('control: the release did not reach the global');
    physShift = 1;                       /* the reconcile is given nothing to say */
    if (pick().shift) throw new Error('sound mode still reads Shift held');
    physShift = 0;
    snd.soundExit(); globalThis.tick();
});

step('sound mode\'s copy ALONE held (the global already up) is healed too', () => {
    enterMenu(2);
    physShift = 1; midi(49, 127);
    S.shiftHeld = false;                 /* any direct clear of the global: resume, a modal picker */
    physShift = 0;
    globalThis.tick();
    if (pick().shift) throw new Error('sound mode still reads Shift held');
    snd.soundExit();
});

step('⚠ one direction only: a Shift genuinely held is never lifted', () => {
    enterMenu(2);
    physShift = 1; midi(49, 127);
    globalThis.tick(); globalThis.tick();
    if (!pick().shift || !S.shiftHeld) throw new Error('a held Shift was cleared');
    physShift = 0; midi(49, 0);
    if (pick().shift || S.shiftHeld) throw new Error('the real release did not land');
    snd.soundExit();
});

process.exit(failed);
}
main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
