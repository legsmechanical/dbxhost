/* tests/js/test_track_volume.mjs — Shift+volume = ACTIVE TRACK volume, in
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
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

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
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
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
S.stateLoading = false; S.bootSplashTicks = 0; S.awaitingProjectSelect = false;
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

step('⭑ the save lands ONCE, on the Shift release — never per detent', () => {
    globalThis.tick();                    /* drain the PREVIOUS gesture's save */
    saveCalls = 0;
    shift(true); vol(1); globalThis.tick(); vol(1); globalThis.tick();
    if (saveCalls) throw new Error('saved mid-gesture');
    shift(false); globalThis.tick();
    if (saveCalls !== 1) throw new Error('saves on release: ' + saveCalls);
    globalThis.tick();
    if (saveCalls !== 1) throw new Error('kept saving after the gesture');
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
    if (S.tvCardUntil <= S.tickCount)
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
     * regression. */
    const _cc0 = S.tvExtCC7[2];
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
    S.tvExtCC7[2] = _cc0;
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

step('⭑ a MIDI track sends CC 7 on its channel (standard MIDI volume)', () => {
    S.trackRoute[2] = 2; S.trackChannel[2] = 5;
    setCalls = []; extSends = [];
    shift(true); vol(3); globalThis.tick(); shift(false); globalThis.tick();
    if (volWrites().length) throw new Error('EXT track wrote an engine level');
    const cc7 = extSends.filter(p => p[1] === (0xB0 | 4) && p[2] === 7);
    if (cc7.length !== 1) throw new Error('CC7 sends: ' + JSON.stringify(extSends));
    if (cc7[0][3] !== 103) throw new Error('expected 100+3=103, sent ' + cc7[0][3]);
    /* clamp: spin far past the top */
    extSends = [];
    shift(true); for (let i = 0; i < 8; i++) vol(9); globalThis.tick(); shift(false); globalThis.tick();
    const last = extSends.filter(p => p[2] === 7).pop();
    if (!last || last[3] !== 127) throw new Error('no clamp at 127: ' + JSON.stringify(last));
    S.trackRoute[2] = 0; S.trackChannel[2] = 1;
});

step('⚠ a MIDI-to-Track follower says NO VOLUME (its output never reaches the port)', () => {
    S.trackRoute[2] = 2; S.trackMidiTo[2] = 3;
    extSends = [];
    shift(true); vol(1); globalThis.tick(); shift(false); globalThis.tick();
    if (extSends.some(p => p[2] === 7)) throw new Error('follower sent CC7');
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
