
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_track_volume.mjs — Shift+volume = ACTIVE TRACK volume, in
 * every view; plain volume = Move's native main output (Josh, 2026-08-24:
 * "volume to control main output and shift+volume to control active track
 * volume. should apply across all modes").
 *
 * Silent failure modes everywhere: a missed claim leaks the first detent into
 * Move's master; a per-detent save is an invisible I/O storm; an EXT track
 * doing nothing looks identical to the gesture being broken. Drives
 * globalThis.onMidiMessageInternal + the real tick. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    /* ⚠⚠ An ASYNC fn returns a promise this runner never awaits: the body would
     * not run, nothing would throw, and the step would report ok. A test that
     * passes because it did NOTHING is worse than one that fails. Caught
     * 2026-08-24 — an async step "passed" against a mutation it could not have
     * seen. Hoist awaits to module scope; keep step bodies synchronous. */
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass ' +
                        'without running. Hoist the awaits to module scope.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const ENGINE = { };
let setCalls = [], volBlockCalls = [], saveCalls = 0;
globalThis.shadow_get_param = (slot, key) => (ENGINE[slot + '|' + key] != null ? ENGINE[slot + '|' + key] : '');
globalThis.shadow_set_param = (slot, key, val) => { setCalls.push([slot, key, val]); ENGINE[slot + '|' + key] = String(val); return 1; };
globalThis.host_vol_block = (on) => { volBlockCalls.push(on); };
globalThis.shadow_save_state_now = () => { saveCalls++; return 1; };
let extSends = [];
globalThis.move_midi_external_send = (pkt) => { extSends.push(pkt.slice ? pkt.slice() : pkt); };

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
let modSets = [];
globalThis.host_module_set_param = (k, v) => { modSets.push(k + '=' + v); };
globalThis.host_module_get_param = () => '';
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
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const shift = (on) => cc(49, on ? 127 : 0);
const vol   = (d) => cc(79, d > 0 ? d : 128 + d);   /* signed 7-bit delta */

S.ledInitComplete = true;
S.stateLoading = false; S.bootSplashMs = 0; S.awaitingProjectSelect = false;
S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
/* init() builds bankParams on-device only; session-view tick stages read it */
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));
ENGINE['2|slot:volume'] = '1.000';

const volWrites = () => setCalls.filter(([sl, k]) => k === 'slot:volume' || k.endsWith(':volume'));

step('the CLAIM rides the Shift key: press claims, release hands back', () => {
    volBlockCalls = [];
    shift(true); shift(false);
    if (JSON.stringify(volBlockCalls) !== '[1,0]')
        throw new Error('host_vol_block calls: ' + JSON.stringify(volBlockCalls));
});

step('plain volume writes NOTHING (Move native keeps the main output)', () => {
    setCalls = [];
    vol(1); vol(1); globalThis.tick();
    if (volWrites().length) throw new Error('a plain turn wrote: ' + JSON.stringify(volWrites()));
});

step('⭑ Shift+volume writes the active CHAIN track\'s slot level, once per tick', () => {
    setCalls = [];
    shift(true);
    for (let i = 0; i < 8; i++) vol(1);      /* 8 detents, one tick */
    globalThis.tick();
    const w = volWrites();
    if (w.length !== 1) throw new Error('expected ONE coalesced write, got ' + w.length);
    const [sl, k, v] = w[0];
    if (sl !== 2 || k !== 'slot:volume') throw new Error('wrote ' + sl + '/' + k);
    if (Math.abs(parseFloat(v) - (1 + 8 / 64)) > 2e-3) throw new Error('value ' + v);
    shift(false);
});

/* ⚠⚠ THE CONTRACT CHANGED 2026-08-26 — this step used to assert the opposite.
 *
 * It required exactly ONE save on the Shift release, which was right when the
 * alternative was saving per detent. It is wrong now: engineSaveState() is
 * shadow_save_state_now(), the SHUTDOWN flush ("flushed set state before exit"),
 * which writes all eight slots, every FX bus and the chain config synchronously.
 * Measured on Josh's device, that froze the UI loop for 771 ms against a median
 * tick of 11-17 ms — and that stall let the input ring overflow, which dropped
 * the Shift RELEASE, which left the track LEDs blinking. It was the root cause
 * of the "LED linger" chased across two sessions.
 *
 * The host persists this correctly and incrementally on its own: the write marks
 * the slot dirty and shadow_ui's autosave saves ONE unit after a quiet period.
 * So the gesture must now save NOTHING, and the assertion is inverted.
 *
 * ⚠ Verified on hardware before this was allowed to stand — removing a save is a
 * data-loss risk, so Josh confirmed a volume change survives quit + relaunch.
 * Do not "restore" the save to make some future test green without repeating
 * that check. */
step('⭑ the gesture saves NOTHING — a full flush here froze the loop for 771 ms', () => {
    globalThis.tick();
    saveCalls = 0;
    shift(true); vol(1); globalThis.tick(); vol(1); globalThis.tick();
    if (saveCalls) throw new Error('saved mid-gesture: ' + saveCalls);
    shift(false); globalThis.tick();
    if (saveCalls) throw new Error('saved on release: ' + saveCalls +
                                   ' — that is the 771 ms full flush, back again');
    globalThis.tick(); globalThis.tick();
    if (saveCalls) throw new Error('saved after the gesture: ' + saveCalls);
});

step('⭑ the level CARD shows — the same one sound mode draws, over any screen', () => {
    /* Josh, 2026-08-24: Shift+Volume should "show everywhere as an overlay with
     * the same card we use for track volume adjustment in sound mode". It used
     * to raise a two-line TEXT popup instead, which reads as a different
     * control from the boxed level-with-a-bar sound mode shows for the same
     * value.
     *
     * ⚠ Asserted on the CARD state, not on the popup: an actionPopup would
     * satisfy "something appeared" while being the wrong thing entirely, which
     * is exactly what was there before. */
    S.tvCardUntil = -1;
    S.actionPopupEndTick = -1;
    shift(true);
    vol(1); globalThis.tick();
    if (S.tvCardUntil < 0)
        throw new Error('no level card was raised by a Shift+Volume turn');
    if (S.tvCardUntil <= S.clockMs)
        throw new Error('the card was raised already expired');
    /* Named with its track: the card can be raised from a bank, the mixer or a
     * module editor, so the value alone does not say whose it is. */
    if (!/^Tr 3  LEVEL /.test(S.tvCardText))
        throw new Error('card text is not "Tr <n>  LEVEL ...": ' + S.tvCardText);
    if (!(S.tvCardFrac >= 0 && S.tvCardFrac <= 1))
        throw new Error('card fraction out of range: ' + S.tvCardFrac);
    if (S.actionPopupEndTick >= 0)
        throw new Error('it ALSO raised a text popup — two controls for one value');
    shift(false);
});

step('⚠ a MIDI track shows the same card in MIDI units (CC 7 is 0-127)', () => {
    /* One card, and the caller owns the unit — a slot level is 0-2x, CC 7 is
     * 0-127, and the bar shows the proportion either way. */
    /* ⚠ Restores what it touches. The CC 7 value is session-local state that a
     * LATER step asserts an exact number against — leaving this turn in it made
     * that step fail by one, which is a test-ordering bug pretending to be a
     * regression. It lives in S.trackMidiVals since P8 retired S.tvExtCC7. */
    const _cc0 = Object.assign({}, S.trackMidiVals[2]);
    S.tvCardUntil = -1;
    S.trackRoute[2] = 2;
    S.trackMidiTo[2] = 0;
    shift(true);
    vol(1); globalThis.tick();
    if (S.tvCardUntil < 0) throw new Error('no card on a MIDI track');
    if (!/^Tr 3  CC7 /.test(S.tvCardText))
        throw new Error('MIDI card should read "Tr <n>  CC7 ...", got: ' + S.tvCardText);
    shift(false);
    S.trackRoute[2] = 0;
    S.trackMidiVals[2] = _cc0;
    S.tvSeeded = false;
});

step('⭑ a MOVE-routed track writes its BUS strip Volume, not a slot', () => {
    S.trackRoute[2] = 1; S.trackChannel[2] = 3;
    ENGINE['0|move_fx:3:volume'] = '0.800';
    setCalls = [];
    shift(true); vol(2); globalThis.tick(); shift(false); globalThis.tick();
    const w = volWrites();
    if (w.length !== 1) throw new Error('writes: ' + JSON.stringify(w));
    const [sl, k, v] = w[0];
    if (sl !== 0 || k !== 'move_fx:3:volume') throw new Error('wrote ' + sl + '/' + k);
    if (Math.abs(parseFloat(v) - (0.8 + 2 / 64)) > 2e-3) throw new Error('value ' + v);
    S.trackRoute[2] = 0;
});

/* ── in Move-native CO-RUN the gesture belongs to the CO-RUN track ──────────
 *
 * Josh, 2026-08-25. This was a documented limit: in co-run the knob moved
 * MOVE's master, because CC 79 is ceded to Move firmware and the cede ignored
 * the runtime claim. The claim (vol_block, raised only while Shift is held) now
 * beats the cede — a PLAIN turn still reaches Move's master, only the Shift
 * gesture is ours. That half lives in tests/host/test_corun_cede_default.c;
 * this is what dAVEBOx does with the CC once it arrives.
 *
 * ⚠ The active track and the co-run track DIFFER here on purpose. They usually
 * agree on device, so a test where they agree would pass against code that
 * takes the wrong one — which is the only mistake this step can catch. */
step('⭑ co-run: Shift+volume writes the CO-RUN track bus, not the active track', () => {
    S.activeTrack = 5;
    S.trackRoute[5] = 0;                       /* chain track — the WRONG answer */
    ENGINE['5|slot:volume'] = '1.000';
    S.trackRoute[2] = 1; S.trackChannel[2] = 4;
    ENGINE['0|move_fx:4:volume'] = '0.500';
    S.moveCoRunTrack = 2;                      /* co-run is on track 2 */
    S.tvSeeded = false; S.tvCardUntil = -1;
    setCalls = [];

    shift(true); vol(2); globalThis.tick(); shift(false); globalThis.tick();

    const w = volWrites();
    if (!w.length) throw new Error('the gesture was inert in co-run');
    const slotWrite = w.find(([, k]) => String(k).indexOf('slot:') === 0);
    if (slotWrite)
        throw new Error('wrote the ACTIVE track chain slot: ' + JSON.stringify(slotWrite));
    const [sl, k, v] = w[0];
    if (sl !== 0 || k !== 'move_fx:4:volume')
        throw new Error('wrote ' + sl + '/' + k + ' — expected the co-run track bus');
    if (Math.abs(parseFloat(v) - (0.5 + 2 / 64)) > 2e-3) throw new Error('value ' + v);

    /* ⚠ No level card: Move owns the OLED in co-run, so it would draw into a
     * buffer nobody composites and then pop, stale, over the screen you land on
     * when co-run exits. The gesture is deliberately blind there. */
    if (S.tvCardUntil >= 0)
        throw new Error('armed the level card while Move owns the OLED');

    S.moveCoRunTrack = -1;
    S.trackRoute[2] = 0; S.trackChannel[2] = 1;
    S.activeTrack = 2;
});

step('⭑ ...and OUTSIDE co-run the very same gesture is the active track again', () => {
    /* The positive control for the step above: without it, code that always
     * used moveCoRunTrack (or never did) could pass one of the two. */
    S.activeTrack = 2; S.moveCoRunTrack = -1;
    S.trackRoute[2] = 0;
    ENGINE['2|slot:volume'] = '1.000';
    S.tvSeeded = false; S.tvCardUntil = -1;
    setCalls = [];
    shift(true); vol(1); globalThis.tick(); shift(false); globalThis.tick();
    const w = volWrites();
    if (!w.length || String(w[0][1]).indexOf('slot:') !== 0)
        throw new Error('outside co-run it stopped writing the active track: ' + JSON.stringify(w));
    if (S.tvCardUntil < 0)
        throw new Error('the level card vanished outside co-run too — the guard is too wide');
});

step('⭑ a MIDI track sends CC 7 on its channel (standard MIDI volume)', () => {
    S.trackRoute[2] = 2; S.trackChannel[2] = 5;
    setCalls = []; extSends = []; modSets = [];
    S.trackMidiVals[2] = {};
    shift(true); vol(3); globalThis.tick(); shift(false); globalThis.tick();
    if (volWrites().length) throw new Error('EXT track wrote an engine level');
    /* ⚠ 2026-09-03 (spec §2b): CC 7 goes out through the DSP's MIDI target
     * path (tN_pa_midi_out, the store's 14 bits), from davebox's ONE MIDI knob
     * value — shared with the session strip and a macro — not straight to
     * the port from here. 103/127 → 13287. */
    const cc7 = modSets.filter(x => x.startsWith('t2_pa_midi_out=cc:7 '));
    if (cc7.length !== 1) throw new Error('CC7 sends: ' + JSON.stringify(modSets));
    if (cc7[0] !== 't2_pa_midi_out=cc:7 13287') throw new Error('expected 100+3=103 (round(103*16383/127) = 13287), sent ' + cc7[0]);
    if (S.trackMidiVals[2]['cc:7'] !== 103) throw new Error('the shared value did not follow: ' + JSON.stringify(S.trackMidiVals[2]));
    /* clamp: spin far past the top */
    modSets = [];
    shift(true); for (let i = 0; i < 8; i++) vol(9); globalThis.tick(); shift(false); globalThis.tick();
    const last = modSets.filter(x => x.startsWith('t2_pa_midi_out=cc:7 ')).pop();
    if (!last || last !== 't2_pa_midi_out=cc:7 16383') throw new Error('no clamp at 127: ' + JSON.stringify(last));
    S.trackRoute[2] = 0; S.trackChannel[2] = 1;
});

step('⚠ a MIDI-to-Track follower says NO VOLUME (its output never reaches the port)', () => {
    S.trackRoute[2] = 2; S.trackMidiTo[2] = 3;
    extSends = []; modSets = [];
    shift(true); vol(1); globalThis.tick(); shift(false); globalThis.tick();
    if (modSets.some(x => x.indexOf('pa_midi_out=cc:7') >= 0)) throw new Error('follower sent CC7');
    if (!S.actionPopupLines.some(l => /NO VOLUME/.test(l)))
        throw new Error('no popup: ' + JSON.stringify(S.actionPopupLines));
    S.trackRoute[2] = 0; S.trackMidiTo[2] = 0;
});

step('⭑ a NEW gesture re-reads the level — an edit made elsewhere is honoured', () => {
    ENGINE['2|slot:volume'] = '0.500';        /* changed behind our back */
    setCalls = [];
    shift(true); vol(1); globalThis.tick(); shift(false); globalThis.tick();
    const w = volWrites();
    if (w.length !== 1) throw new Error('writes: ' + w.length);
    if (Math.abs(parseFloat(w[0][2]) - (0.5 + 1 / 64)) > 2e-3)
        throw new Error('stale seed: wrote ' + w[0][2]);
});

step('session view: same gesture, same meaning', () => {
    S.sessionView = true;
    setCalls = [];
    shift(true); vol(1);
    globalThis.tick();
    shift(false); globalThis.tick();
    if (volWrites().length !== 1) throw new Error('did not write in session view');
    S.sessionView = false;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
