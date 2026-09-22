/* tests/js/test_led_refused_is_retried.mjs — an LED write the host REFUSED is
 * sent again on the next paint.
 *
 * The host's MIDI-out buffer is shared with external MIDI, and LEDs may only
 * fill it up to a margin (SHADOW_MIDI_OUT_EXT_HEADROOM) so a sustain release or
 * pitch-bend return to external gear is never crowded out. A refused LED write
 * returns false. dAVEBOx keeps its OWN cache of what it sent (ui_leds
 * cachedSetLED), and it used to record the colour before sending — so a
 * refused write was believed sent, and that pad kept its old colour until
 * something cleared the cache.
 */
let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e}`); failed = 1; }

let refuse = false;
const sends = [];
globalThis.move_midi_internal_send = (pkt) => { sends.push(pkt.slice()); return !refuse; };
for (const fn of ['clear_screen', 'print', 'set_pixel', 'fill_rect', 'draw_rect'])
    globalThis[fn] = () => {};
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { S } = await import('../../ui/ui_state.mjs');
S.clockFollowTicks = true;
const { updateSessionLEDs, invalidateLEDCache } = await import('../../ui/ui_leds.mjs');
const PAD0 = 68;
const padSends = () => sends.filter(p => p[1] === 0x90 && p[2] === PAD0).length;

S.ledInitComplete = true;
S.projectPadPicker = { projects: [], current: -1,
    byIndex: { 0: { uuid: 'a', name: 'A', index: 0, color: 2 } },
    touchedIdx: -1, copySrcIdx: -1, deleteIdx: -1, menu: null, colorPick: null,
    confirmNew: null, renameActive: false, restarting: false };
S.tickCount = 0; S.clockMs = 0;
invalidateLEDCache();

refuse = true;  updateSessionLEDs();          /* the host refuses the pad's colour */
const refused = padSends();
refuse = false; updateSessionLEDs();          /* next paint, room again */
const after = padSends();
refused >= 1 ? ok('control: the first paint tried to send pad 1') : bad('control', 'pad 1 was never sent');
(after > refused) ? ok('a REFUSED LED write is sent again on the next paint')
                  : bad('a refused write was cached as sent', `sends ${refused} -> ${after}`);
updateSessionLEDs();
(padSends() === after) ? ok('…and once it WAS sent, an unchanged colour is not resent (the cache still works)')
                       : bad('the cache stopped caching', `sends ${after} -> ${padSends()}`);

if (failed) { console.log('FAIL: refused LED retry'); process.exit(1); }
console.log('PASS: a refused LED write is retried; a sent one is cached');
}
main().catch(e => { console.error(e); process.exit(1); });
