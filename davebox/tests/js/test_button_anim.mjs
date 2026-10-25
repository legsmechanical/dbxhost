/* tests/js/test_button_anim.mjs — function buttons that BLINK do so in the LED
 * hardware (Josh, 2026-10-24: "do the 1/4 pulse on ... any function buttons
 * that blink"), through the REAL tick's button block.
 *
 * A holding state pulses at a quarter note (channel 9) between off and the
 * button's colour; Rec's two "at the bar" flashes are the eighth blink
 * (channel 13). Each is written as the Push 2 two-step ONCE per state change
 * and never again while the state holds — the tick used to paint the ordinary
 * colour and then the Shift hint over it every frame, which with hardware
 * animations would stop and restart the pulse 94 times a second.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

for (const fn of ['set_pixel', 'fill_rect', 'draw_rect', 'stipple_rect', 'clear_screen', 'print'])
    globalThis[fn] = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 600);
    return true;
};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
/* The DSP mirror the tick polls: `capture_pending` = "<notes> <sweeps> <seq>",
 * from which pollDSP derives S.captureArmed. The rig arms Capture through it. */
let capturePendingAnswer = '0 0 0';
globalThis.host_module_get_param = (k) => (String(k).indexOf('capture_pending') >= 0 ? capturePendingAnswer : '');
globalThis.shadow_get_param = () => '';
globalThis.host_module_get_params = () => null;
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

/* every button (CC) write, in order: [cc, channel, colour] */
const ccWrites = [];
globalThis.move_midi_internal_send = (pkt) => { if (pkt[0] === 0x0B) ccWrites.push([pkt[2], pkt[1] & 0x0F, pkt[3]]); return true; };
const writesTo = (cc) => ccWrites.filter(w => w[0] === cc).map(w => [w[1], w[2]]);
const reset = () => { ccWrites.length = 0; };

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const SC = await import('/data/UserData/schwung/shared/constants.mjs');
const { White, Red } = SC;
const MoveMute = SC.MoveMute ?? 88;
const { MoveCapture, MoveLoop, MoveRec, MoveUndo, MoveCopy, MoveNoteSession,
        LED_OFF, LED_PULSE_4TH, LED_BLINK_8TH } = C;
const PULSE = LED_PULSE_4TH, BLINK8 = LED_BLINK_8TH;
/* The two-step: the start colour on ch0 is SKIPPED when the button already
 * shows it (the cache), so a pair is either [[0,from],[anim,to]] or just
 * [[anim,to]]. Either way the LAST write is the animated target and nothing
 * else is written on any other channel. */
const pulsePair = (w, to, anim) => {
    assert(w.length >= 1 && w.length <= 2, `expected the two-step, got ${JSON.stringify(w)}`);
    const last = w[w.length - 1];
    assert(last[0] === anim && last[1] === to, `expected [${anim},${to}] last, got ${JSON.stringify(w)}`);
    if (w.length === 2) assert(w[0][0] === 0, `start colour not on ch0: ${JSON.stringify(w)}`);
};

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
S.clockFollowTicks = true; S.tickCount = 1000;
const tick = () => { S.tickCount++; globalThis.tick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };

ticks(3); reset();
step('control: the tick runs without a swallowed error', () => assert(swallowed === null, swallowed));

/* ---- Capture armed: pulse once, then silence ---- */
step('Capture armed pulses White in hardware: off on ch0, then White on the pulse channel', () => {
    capturePendingAnswer = '1 0 0'; ticks(C.POLL_INTERVAL + 1);   /* pollDSP derives captureArmed from it */
    assert(S.captureArmed === true, 'rig: captureArmed did not derive');
    pulsePair(writesTo(MoveCapture), White, PULSE);
});
step('…and 40 more ticks write NOTHING to it (no restart)', () => {
    reset(); ticks(40);
    assert(writesTo(MoveCapture).length === 0, JSON.stringify(writesTo(MoveCapture)));
});
step('disarming is one plain write, which stops the pulse', () => {
    reset(); capturePendingAnswer = '0 0 0'; ticks(C.POLL_INTERVAL + 1);
    const w = writesTo(MoveCapture);
    assert(w.length === 1 && w[0][0] === 0, JSON.stringify(w));
});

/* ---- Mute, track soloed ---- */
step('a soloed track pulses the Mute button', () => {
    reset(); S.trackSoloed[S.activeTrack] = true; tick();
    pulsePair(writesTo(MoveMute), 124, PULSE);
    reset(); ticks(20); assert(writesTo(MoveMute).length === 0, 'resent while soloed');
    S.trackSoloed[S.activeTrack] = false; tick();
});

/* ---- Loop latched (Track View) ---- */
step('the latched Loop view pulses the Loop button White', () => {
    reset(); S.loopLatched = true; tick();
    pulsePair(writesTo(MoveLoop), White, PULSE);
    reset(); ticks(20); assert(writesTo(MoveLoop).length === 0, 'resent while latched');
    S.loopLatched = false; tick();
});

/* ---- Rec: the two at-the-bar flashes are the faster eighth BLINK ---- */
step('Rec with a stop scheduled BLINKS Red at an eighth (urgency, not a breathe)', () => {
    reset(); S.recordScheduledStop = true; tick();
    pulsePair(writesTo(MoveRec), Red, BLINK8);
    reset(); ticks(20); assert(writesTo(MoveRec).length === 0, 'resent while scheduled');
    S.recordScheduledStop = false; tick();
});
step('the merge notice blinks Rec the same way', () => {
    reset(); S.mergeNoticePending = true; tick();
    pulsePair(writesTo(MoveRec), Red, BLINK8);
    S.mergeNoticePending = false; tick();
});

/* ---- Shift held: the hints pulse, decided in ONE place per button ---- */
step('Shift held (Track View) pulses Note/Session, Undo, Copy, Mute at 16 and Rec Red — each written ONCE', () => {
    reset(); S.shiftHeld = true; tick();
    for (const cc of [MoveNoteSession, MoveUndo, MoveCopy, MoveMute]) pulsePair(writesTo(cc), 16, PULSE);
    pulsePair(writesTo(MoveRec), Red, PULSE);
    assert(writesTo(MoveLoop).length === 0, `Loop is not a Shift hint in Track View: ${JSON.stringify(writesTo(MoveLoop))}`);
});
step('the step-button ICONS (CC 16-31) never animate — every write to them is channel 0 (Josh, 2026-10-25)', () => {
    const icon = ccWrites.filter(w => w[0] >= 16 && w[0] <= 31);
    assert(icon.length > 0, 'rig: no icon writes seen under Shift (the hints should light)');
    const bad_ = icon.filter(w => w[1] !== 0);
    assert(bad_.length === 0, `icons on an animation channel: ${JSON.stringify(bad_)}`);
});
step('…and while Shift stays held, 40 ticks write nothing to any of them', () => {
    reset(); ticks(40);
    for (const cc of [MoveNoteSession, MoveUndo, MoveCopy, MoveMute, MoveRec])
        assert(writesTo(cc).length === 0, `cc ${cc} resent: ${JSON.stringify(writesTo(cc))}`);
});
step('Shift released: each goes back to its plain colour with one channel-0 write', () => {
    reset(); S.shiftHeld = false; tick();
    for (const cc of [MoveNoteSession, MoveUndo, MoveCopy, MoveMute, MoveRec]) {
        const w = writesTo(cc);
        assert(w.length === 1 && w[0][0] === 0, `cc ${cc}: ${JSON.stringify(w)}`);
    }
});
step('Shift held in Session View pulses Loop instead of Mute', () => {
    S.sessionView = true; ticks(2); reset(); S.shiftHeld = true; tick();
    pulsePair(writesTo(MoveLoop), 16, PULSE);
    assert(writesTo(MoveMute).every(w => w[0] === 0), `Mute animated in Session View: ${JSON.stringify(writesTo(MoveMute))}`);
    S.shiftHeld = false; S.sessionView = false; tick();
});

step('no tick error was swallowed along the way', () => assert(swallowed === null, swallowed));

if (failed) { console.log('FAIL: button animations'); process.exit(1); }
console.log('PASS: blinking function buttons pulse / blink in hardware, written once per state');
}
main().catch(e => { console.error(e); process.exit(1); });
