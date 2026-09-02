
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_sound_mute_bypass.mjs — Mute+click on SOUND + CONFIG bypasses
 * the focused block and does NOT also mute the track.
 *
 * Josh, 2026-08-26: "Mute+jog-click on SOUND + CONFIG falls through to track
 * mute instead of only bypassing the focused effect."
 *
 * ⚠ Swallowing the CLICK is not the whole gesture. davebox acts on the Mute
 * RELEASE (`d1 === MoveMute && d2 === 0`), and that handler fires unless
 * `muteUsedAsModifier` is set — so the bypass ran, then letting go of Mute muted
 * the track. The fix sets that flag, and the release is therefore the event this
 * test must send. A test that only sent press + click would pass against the bug.
 *
 * ⚠⚠ It must be set on davebox's state object (imported into sound mode as GS),
 * not on sound mode's own `S`. Setting it on the wrong one is silently inert —
 * and is the exact mistake that broke this same gesture once before, recorded in
 * ui_sound.mjs's own muteHeld note. [[schwung-davebox-two-state-objects]]
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const writes = [];
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { writes.push(k + '=' + v); };
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
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
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const sound = await import('../../ui/ui_sound.mjs');

function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

const MUTE = 88, JOG_CLICK = 3;

step('setup: track view, track 1 unmuted', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.trackMuted[0] = false;
    S.muteUsedAsModifier = false;
    ticks(16);
});

/* CONTROL FIRST: a plain Mute tap MUST still mute the track. Without this, a fix
 * that suppressed the release unconditionally would pass the real assertion
 * below while breaking the ordinary gesture — a strictly worse bug. */
step('control: a plain Mute tap still mutes the track', () => {
    const before = S.trackMuted[0];
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MUTE, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MUTE, 0]));
    ticks(2);
    if (S.trackMuted[0] === before)
        throw new Error('a plain Mute tap no longer mutes — the ordinary gesture is broken');
    /* put it back */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MUTE, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MUTE, 0]));
    ticks(2);
    S.muteUsedAsModifier = false;
});

step('Mute+click in sound mode bypasses WITHOUT muting the track', () => {
    /* Sound mode owns the surface; drive its CC entry point the way davebox does. */
    sound.soundEnter(0, 0);
    ticks(2);
    /* ⚠ Sound mode ENTERS ON THE BANK'S PROMPT now (Josh, 2026-08-28: the bank
     * is a door — "click to enter"), and the steps below act on the MENU. */
    sound.soundShowMenu();
    const wasMuted = S.trackMuted[0];

    sound.soundOnCC(MUTE, 127, () => 0);            /* Mute down  */
    sound.soundOnCC(JOG_CLICK, 127, () => 0);       /* jog click  → bypass */
    /* The release goes to davebox, exactly as on hardware: sound mode passes
     * Mute through (`return false`) so davebox tracks its own copy. */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MUTE, 0]));
    ticks(2);

    if (S.trackMuted[0] !== wasMuted)
        throw new Error(`the track's mute changed (${wasMuted} → ${S.trackMuted[0]}) — ` +
                        `the bypass gesture is still falling through to track mute`);
});

if (failed) process.exit(1);
console.log('test_sound_mute_bypass: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
