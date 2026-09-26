import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_shortcut_status_icons.mjs — a shortcut's step ICON stays lit
 * while the thing it toggles is on (Josh, 2026-09-24): the metronome icon
 * (Step 6) when it plays during playback (Play / Always — not Off, not Cnt-In),
 * and in Track View the fixed-velocity icon (Step 10) and the track-arp icon
 * (Step 11, melodic) for the active track.
 *
 * Read off the wire: icons are CCs 16..31 (step LIGHTS are NoteOns on the same
 * numbers, so the status byte is kept). CONTROL first: everything off, Shift
 * up, the three icons are dark — so a lit icon below is the status, not a
 * default.
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_params = () => ''; globalThis.shadow_set_params = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.set_led = () => {};
globalThis.move_midi_external_send = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.host_autosave_hold = () => {};
globalThis.shadow_save_state_now = () => 1;
const icon = {};                                   /* CC number -> last value sent */
const light = {};                                  /* step LIGHT (NoteOn) number -> last value */
globalThis.move_midi_internal_send = (m) => {
    const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0xB0 && a[2] >= 16 && a[2] <= 31) icon[a[2]] = a[3];
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90 && a[2] >= 16 && a[2] <= 31) light[a[2]] = a[3];
    return true;
};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
globalThis.__dbxLeds = await import('../../ui/ui_leds.mjs');
globalThis.__dbxSound = await import('../../ui/ui_sound.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
S.tickCount = 400; S.currentSetUuid = 'icons-uuid';
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const lit = (stepNo) => (icon[15 + stepNo] | 0) !== 0;   /* Step N's icon is CC 15+N */
const settle = () => ticks(12);                          /* crosses a POLL_INTERVAL force-send */

step('CONTROL: all off, Shift up — the metronome, fixed-vel and arp icons are dark', () => {
    S.metronomeOn = 1; S.trackVelOverride[2] = 0; S.bankParams[2][5][0] = 0;
    settle();
    assert(!lit(6) && !lit(10) && !lit(11), 'lit with nothing on: ' + [lit(6), lit(10), lit(11)]);
});
step('metronome: Cnt-In and Off stay dark; Play and Always light Step 6', () => {
    S.metronomeOn = 0; settle(); assert(!lit(6), 'Off lit it');
    S.metronomeOn = 1; settle(); assert(!lit(6), 'Cnt-In lit it');
    S.metronomeOn = 2; settle(); assert(lit(6), 'Play did not light it');
    S.metronomeOn = 3; settle(); assert(lit(6), 'Always did not light it');
});
step('the metronome icon is status in SESSION view too', () => {
    S.sessionView = true; settle();
    assert(lit(6), 'dark in session view');
    S.sessionView = false; S.metronomeOn = 1; settle();
});
step('⭐ fixed velocity on the active track lights Step 10', () => {
    S.trackVelOverride[2] = 100; settle();
    assert(lit(10), 'fixed velocity did not light Step 10');
    S.trackVelOverride[2] = 0; settle();
    assert(!lit(10), 'Step 10 stayed lit after Live');
});
step('fixed velocity on ANOTHER track does not light it', () => {
    S.trackVelOverride[5] = 100; settle();
    assert(!lit(10), 'another track\'s fixed velocity lit the icon');
    S.trackVelOverride[5] = 0;
});
step('⭐ the track arp on a melodic active track lights Step 11', () => {
    S.bankParams[2][5][0] = 1; settle();
    assert(lit(11), 'the track arp did not light Step 11');
    S.bankParams[2][5][0] = 0; settle();
    assert(!lit(11), 'Step 11 stayed lit after the arp went off');
});
step('a drum track never lights the arp icon', () => {
    S.trackPadMode[2] = PAD_MODE_DRUM; S.bankParams[2][5][0] = 1; settle();
    assert(!lit(11), 'a drum track lit the arp icon');
    S.trackPadMode[2] = 0; S.bankParams[2][5][0] = 0; settle();
});
step('Shift held keeps the hint grammar: the icons are the shortcut hints', () => {
    S.shiftHeld = true; settle();
    assert(lit(10) && lit(11) && lit(6), 'the Shift hints went dark');
    S.shiftHeld = false; settle();
    assert(!lit(10) && !lit(11), 'hints stayed lit after Shift');
});

/* ⚠ Shift + Step 3 was RETIRED (the sound editor is Shift + Note/Session now)
 * and does nothing — so neither its icon nor its step light may advertise it.
 * It kept lighting in Track View after the gesture was gone. */
step('⚠ Shift held in Track View: Step 3 stays dark — its shortcut was retired', () => {
    const { invalidateLEDCache } = globalThis.__dbxLeds;
    S.sessionView = false; S.shiftHeld = true; invalidateLEDCache(); settle();
    assert(lit(2), 'CONTROL: Step 2\'s icon (Project Settings) is not lit — the overlay is not up');
    assert((light[17] | 0) !== 0, 'CONTROL: Step 2\'s light is not lit — the overlay is not up');
    const bad = [];
    if (lit(3)) bad.push('the Step 3 ICON is lit');
    if ((light[18] | 0) !== 0) bad.push('the Step 3 LIGHT is lit');
    S.shiftHeld = false; settle();
    assert(!bad.length, bad.join(' and ') + ' for a shortcut that does nothing');
});
step('⚠ and Shift + Step 3 really does nothing — no screen opens, no popup', () => {
    S.sessionView = false; S.actionPopupLines = [];
    const before = JSON.stringify([S.globalMenuOpen, globalThis.__dbxSound.soundOpen(), S.activeBank]);
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
    cc(49, 127); note(18, 127); note(18, 0); cc(49, 0);
    const after = JSON.stringify([S.globalMenuOpen, globalThis.__dbxSound.soundOpen(), S.activeBank]);
    assert(before === after, 'Shift + Step 3 changed something: ' + before + ' -> ' + after);
    assert(!(S.actionPopupLines || []).length, 'a popup appeared: ' + S.actionPopupLines);
});

process.exit(failed);
}
main();
