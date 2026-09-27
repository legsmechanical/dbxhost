import './_bulk_get_stub.mjs';
/* tests/js/test_drum_held_step_vel_pads.mjs — a HELD drum step shows its own
 * velocity on the velocity pads (Josh, 2026-09-27: "Holding a note on a step in
 * a drum track when velocity pads are up on the right 4x4 should show the
 * step's approximate velocity on the velocity pads").
 *
 * Performs the GESTURE through the whole UI (ui.js + onMidiMessageInternal +
 * tick): hold a step button, and read the right 4x4 back out of the LED packets
 * the painter actually sends. The step's velocity comes from the DSP read at
 * the hold threshold, which the stub answers.
 * CONTROLS: before the hold, and after the release, the pads show the last
 * velocity PLAYED, as before; an empty step shows that too.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let STEP_VEL = '40';
const leds = {};                     /* note -> colour, NoteOn only */
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => (/^t0_l0_step_\d+_vel$/.test(k) ? STEP_VEL : /_step_\d+_/.test(k) ? '0' : '');
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM, TRACK_PAD_BASE } = await import('../../ui/ui_constants.mjs');
const { White } = await import('/data/UserData/schwung/shared/constants.mjs');
const pure = await import('../../ui/ui_pure.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true; S.playing = false;
S.trackPadMode[0] = PAD_MODE_DRUM; S.activeDrumLane[0] = 0; S.drumPerformMode[0] = 0;
S.drumStepPage[0] = 0; S.drumLastVelZone[0] = 12;
S.drumLaneSteps[0][0][3] = '1'; S.drumLaneHasNotes[0][0] = true;

const note = (st, n, v) => globalThis.onMidiMessageInternal(new Uint8Array([st, n, v]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const holdTicks = Math.ceil(400 / 10.6);          /* past the 250 ms hold threshold */
/* The zones whose pad is lit White on the right 4x4, from the LED packets. */
const whiteZones = () => {
    const z = [];
    for (let zone = 0; zone < 16; zone++) {
        const i = Math.floor(zone / 4) * 8 + 4 + (zone % 4);
        if (leds[TRACK_PAD_BASE + i] === White) z.push(zone);
    }
    return z;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

step('the zone map inverts the pads: every pad\'s own velocity maps back to that pad', () => {
    for (let z = 0; z < 16; z++) assert(pure.drumVelocityToZone(pure.drumVelZoneToVelocity(z)) === z, 'zone ' + z);
    assert(pure.drumVelocityToZone(1) === 0 && pure.drumVelocityToZone(127) === 15, 'the ends clamp');
});
step('CONTROL: at rest the pads show the last velocity played (zone 12)', () => {
    ticks(3);
    assert(eq(whiteZones(), [12]), 'lit: ' + JSON.stringify(whiteZones()));
});
step('⭐⭐ THE GESTURE: hold a step with a hit — the pad nearest its velocity lights', () => {
    STEP_VEL = '40';
    note(0x90, 16 + 3, 127); ticks(holdTicks);
    const want = pure.drumVelocityToZone(40);
    assert(S.heldStep === 3 && !S.drumHeldReadPending, 'setup: the hold did not establish / read');
    assert(want !== 12, 'control: the step\'s zone must differ from the last played');
    assert(eq(whiteZones(), [want]), 'want zone ' + want + ', lit: ' + JSON.stringify(whiteZones()));
});
step('release: back to the last velocity played', () => {
    note(0x80, 16 + 3, 0); ticks(3);
    assert(S.heldStep < 0, 'setup: still held');
    assert(eq(whiteZones(), [12]), 'lit: ' + JSON.stringify(whiteZones()));
});
step('a loud step lights the top pad', () => {
    STEP_VEL = '127';
    note(0x90, 16 + 3, 127); ticks(holdTicks);
    assert(eq(whiteZones(), [15]), 'lit: ' + JSON.stringify(whiteZones()));
    note(0x80, 16 + 3, 0); ticks(3);
});
step('⚠ inside the tap window (before the read) the pads do NOT show the press\'s placeholder velocity', () => {
    S.drumLastVelZone[0] = 3; STEP_VEL = '40';
    note(0x90, 16 + 3, 127); ticks(5);             /* ~53 ms: a tap, not yet a hold */
    assert(S.heldStep === 3 && S.drumHeldReadPending, 'setup: the read already ran');
    assert(eq(whiteZones(), [3]), 'the placeholder showed: lit ' + JSON.stringify(whiteZones()));
    ticks(holdTicks);
    assert(eq(whiteZones(), [pure.drumVelocityToZone(40)]), 'after the read: lit ' + JSON.stringify(whiteZones()));
    note(0x80, 16 + 3, 0); ticks(3);
    S.drumLastVelZone[0] = 12; ticks(2);
});
step('CONTROL: holding an EMPTY step shows the last velocity played', () => {
    note(0x90, 16 + 5, 127); ticks(holdTicks);
    assert(S.heldStep === 5, 'setup: not held');
    assert(eq(whiteZones(), [12]), 'lit: ' + JSON.stringify(whiteZones()));
    note(0x80, 16 + 5, 0); ticks(3);
});

if (failed) { console.log('FAIL: held drum step velocity on the pads'); process.exit(1); }
console.log('PASS: a held drum step shows its velocity on the velocity pads');
}
main().catch((e) => { console.error(e); process.exit(1); });
