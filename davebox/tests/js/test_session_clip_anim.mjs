/* tests/js/test_session_clip_anim.mjs — in Session View a PLAYING clip pulses
 * and a QUEUED clip blinks in the LED hardware, on the channels Move itself
 * writes for those two states, and the painter does not restart them.
 *
 * The packet shape is the Push 2 two-step: the start colour on channel 0, then
 * the target colour on the animation channel (ch9 = pulse @ quarter, ch13 =
 * blink @ eighth — faster than the pulse so the two read apart). Each repaint must send NOTHING while the state holds — a
 * repeat restarts the animation and reads as a flicker. Stopping is a plain
 * write of the resting colour on channel 0.
 */
let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e}`); failed = 1; }

const sends = [];
globalThis.move_midi_internal_send = (pkt) => { sends.push(pkt.slice()); return true; };
for (const fn of ['clear_screen', 'print', 'set_pixel', 'fill_rect', 'draw_rect'])
    globalThis[fn] = () => {};
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { S } = await import('../../ui/ui_state.mjs');
S.clockFollowTicks = true;
const { updateSessionLEDs, invalidateLEDCache, trackColor, trackDimColor } = await import('../../ui/ui_leds.mjs');
const { LED_PULSE_4TH, LED_BLINK_8TH } = await import('../../ui/ui_constants.mjs');

/* Track 0, scene 0 sits on pad 92 (row 0 of the grid). */
const T = 0, PAD = 92;
const padWrites = () => sends.filter(p => p[0] === 0x09 && (p[1] & 0xF0) === 0x90 && p[2] === PAD)
                             .map(p => ({ ch: p[1] & 0x0F, colour: p[3] }));
const take = () => { const w = padWrites(); sends.length = 0; return w; };

S.ledInitComplete = true;
S.projectPadPicker = null; S.bankMapUp = false; S.tapTempoOpen = false;
S.sceneRow = 0; S.tickCount = 0; S.clockMs = 0;
S.clipNonEmpty[T][0] = true;
S.trackActiveClip[T] = 0;
invalidateLEDCache();

/* --- idle with content: the dim colour, plain */
S.playing = false; S.trackClipPlaying[T] = false; S.trackQueuedClip[T] = -1;
updateSessionLEDs();
let w = take();
(w.length === 1 && w[0].ch === 0 && w[0].colour === trackDimColor(T))
    ? ok('an idle clip with content is the dim track colour on channel 0')
    : bad('idle clip', JSON.stringify(w));

/* --- queued while the transport runs: dim on ch0, then the colour on the BLINK channel */
S.playing = true; S.trackQueuedClip[T] = 0;
updateSessionLEDs();
w = take();
(w.length === 1 && w[0].ch === LED_BLINK_8TH && w[0].colour === trackColor(T))
    ? ok(`a queued clip blinks in hardware: track colour on channel ${LED_BLINK_8TH} (the dim start was already on the pad)`)
    : bad('queued clip', JSON.stringify(w));
updateSessionLEDs(); updateSessionLEDs(); S.clockMs += 500; updateSessionLEDs();
w = take();
(w.length === 0) ? ok('…and repaints send nothing while it stays queued (no restart, no flicker)')
                 : bad('queued repaint resent', JSON.stringify(w));

/* --- it launches: dim on ch0 (restart from dim), then the colour on the PULSE channel */
S.trackQueuedClip[T] = -1; S.trackClipPlaying[T] = true;
updateSessionLEDs();
w = take();
(w.length === 2 && w[0].ch === 0 && w[0].colour === trackDimColor(T)
               && w[1].ch === LED_PULSE_4TH && w[1].colour === trackColor(T))
    ? ok(`a playing clip pulses in hardware: dim on channel 0, then track colour on channel ${LED_PULSE_4TH}`)
    : bad('playing clip', JSON.stringify(w));
for (let i = 0; i < 50; i++) { S.clockMs += 11; S.tickCount++; updateSessionLEDs(); }
w = take();
(w.length === 0) ? ok('…and 50 repaints send nothing while it plays')
                 : bad('playing repaint resent', JSON.stringify(w));

/* --- it stops: one plain write of the dim colour on channel 0 ends the pulse */
S.trackClipPlaying[T] = false; S.playing = false;
updateSessionLEDs();
w = take();
(w.length === 1 && w[0].ch === 0 && w[0].colour === trackDimColor(T))
    ? ok('stopping is a plain write of the dim colour on channel 0, which ends the animation')
    : bad('stop', JSON.stringify(w));

/* --- queued while STOPPED stays solid, as before */
S.trackQueuedClip[T] = 0;
updateSessionLEDs();
w = take();
(w.length === 1 && w[0].ch === 0 && w[0].colour === trackColor(T))
    ? ok('a clip queued while stopped is the solid track colour, no animation')
    : bad('queued while stopped', JSON.stringify(w));

/* --- the copy-source blink stays software and overrides the animation */
S.playing = true; S.trackQueuedClip[T] = -1; S.trackClipPlaying[T] = true;
updateSessionLEDs(); take();
S.copySrc = { kind: 'clip', track: T, clip: 0 };
S.clockMs = 220; updateSessionLEDs();
w = take();
(w.length === 1 && w[0].ch === 0) ? ok('a copy-source clip is painted plainly on channel 0 (its software blink overrides the pulse)')
                                  : bad('copy source', JSON.stringify(w));
S.copySrc = null;

if (failed) { console.log('FAIL: session clip animations'); process.exit(1); }
console.log('PASS: Session View playing clips pulse and queued clips blink in hardware, without restarts');
}
main().catch(e => { console.error(e); process.exit(1); });
