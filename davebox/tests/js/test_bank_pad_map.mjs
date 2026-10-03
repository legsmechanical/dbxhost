/* tests/js/test_bank_pad_map.mjs — THE BANK PAD MAP (Josh, 2026-10-02):
 * hold the jog and the left 4x4 pads are the track's banks, a column per
 * category; tap a pad to land on that bank; let go and the pads play again.
 * A quick click still does what it did — it now acts on the RELEASE.
 *
 * Performs the gesture through the real input path (onMidiMessageInternal)
 * and asserts what is ON SCREEN and ON THE PADS, not just state:
 *   - hold → after JOG_MAP_HOLD_MS the map paints: category labels, the
 *     current bank's box filled, an absent bank's box empty; pads in category
 *     colours, the current one White, the right 4x4 dark
 *   - tap → the bank changes (from the overview the overview stays)
 *   - release after a tap / turn, or once the map has painted → no click;
 *     a quick click (let go before the map paints) → the click
 *   - a pad held before the jog goes down is let go, and its release swallowed
 *   - drum, Session (mixer modes, an FX bus opens directly), gates
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
const fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => { globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v); };
globalThis.stipple_rect = (x, y, w, h, v, phase) => {
    for (let j = y; j < y + h; j++) for (let i = x + ((((x + j) & 1) === (phase & 1)) ? 0 : 1); i < x + w; i += 2) globalThis.set_pixel(i, j, v); };
globalThis.clear_screen = () => fb.fill(0);
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

globalThis.host_write_file = () => true;
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sentParams = [];
globalThis.host_module_set_param = (k, v) => { sentParams.push([String(k), String(v)]); };
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.host_module_get_params = () => null;
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
/* Pad LEDs: last colour per note, across the whole run (two caches sit in the
 * path, so an unchanged pad is not re-sent). */
const led = {};
globalThis.move_midi_internal_send = (pkt) => { if ((pkt[1] & 0xF0) === 0x90) led[pkt[2]] = pkt[3]; return true; };
globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const kit = await import('../../ui/ui_movy.mjs');
const pure = await import('../../ui/ui_pure.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const K = await import('/data/UserData/schwung/shared/constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
S.dspInboundEnabled = true;   /* the engine takes pad input, so the mute is pushed */
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const press = () => midi(0xB0, 3, 127);
const release = () => midi(0xB0, 3, 0);
const jog = (d) => midi(0xB0, 14, d > 0 ? d : 128 + d);
const tap = (note) => { midi(0x90, note, 100); midi(0x80, note, 0); };
const pad = pure.bankMapPadForCell;
S.clockFollowTicks = true; S.tickCount = 1000;
const tick = () => { S.tickCount++; globalThis.tick(); };
const holdPast = () => { S.tickCount += Math.ceil(C.JOG_MAP_HOLD_MS / 10.6) + 1; globalThis.tick(); };
/* ...and past the click window: letting go after this is no click. */
const holdLong = () => { S.tickCount += Math.ceil(C.JOG_CLICK_MAX_MS / 10.6) + 1; globalThis.tick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const ink = (f, x, y, w, h) => { let n = 0; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) n += f[j * W + i]; return n; };
const cellInk = (f, c, r) => { const q = kit.bankMapCellRect(c, r); return ink(f, q.x, q.y, q.w, q.h) / (q.w * q.h); };
const rightDark = () => { for (let r = 0; r < 4; r++) for (let c = 4; c < 8; c++) if ((led[pad(c, r)] | 0) !== 0) return false; return true; };
const home = () => { S.activeBank = 0; S.trackActiveBank[S.activeTrack] = 0; S.bankCardLatched = false;
    S.bankSelectTick = -1; S.pendingSoundEnterTrack = -1; S.trackPadMode[S.activeTrack] = C.PAD_MODE_MELODIC_SCALE ?? 0; };

home();

step('hold the jog on the overview: nothing yet, the click is held back', () => {
    press();
    assert(S.jogPressMs >= 0, 'the press was not deferred');
    assert(!S.bankMapUp, 'the map painted at once — a click would flash it');
    assert(!S.bankCardLatched, 'the click fired on the press');
});

step('held past JOG_MAP_HOLD_MS the map is ON SCREEN: labels, CLIP filled, empty cells empty', () => {
    holdPast();
    assert(S.bankMapUp, 'the map did not arm');
    const f = frame();
    assert(ink(f, 0, 0, 31, 5) > 0, 'no IN label over column 1');
    assert(ink(f, 2, 6, 27, 1) >= 20, 'no rule under the label');
    assert(cellInk(f, 2, 1) > 0.6, 'CLIP (SEQ column, row 2) is not the filled box: ' + cellInk(f, 2, 1));
    assert(cellInk(f, 3, 2) < 0.5 && cellInk(f, 3, 2) > 0.05, 'DELAY is not an outlined box');
    assert(cellInk(f, 2, 2) === 0, 'an absent bank drew something');
    assert(cellInk(f, 0, 0) === 0, 'CHORD drew outside the Chord layout');
});

step('…and ON THE PADS: categories coloured, CLIP White, absent and right half dark', () => {
    ticks(6);
    assert(led[pad(2, 1)] === K.White, 'CLIP pad is ' + led[pad(2, 1)]);
    assert(led[pad(3, 2)] === K.BrightOrange, 'DELAY pad is ' + led[pad(3, 2)]);
    assert(led[pad(0, 1)] === K.Cyan, 'LIVE ARP pad is ' + led[pad(0, 1)]);
    assert((led[pad(2, 2)] | 0) === 0, 'an absent bank pad is lit');
    assert(rightDark(), 'the right 4x4 is lit');
    const pm = sentParams.filter(([k]) => k === 't2_padmap').pop();
    assert(pm && pm[1].split(' ')[32] === '1', 'the DSP pads were not muted while the map is up: ' + (pm && pm[1]));
});

step('tap DELAY: the bank moves, the overview stays, the map stays up', () => {
    tap(pad(3, 2));
    assert(S.activeBank === 3, 'activeBank ' + S.activeBank);
    assert(!S.bankCardLatched, 'a tap from the overview latched the card');
    assert(S.bankSelectTick < 0 && !render.bankCardVisible(), 'a tap from the overview opened the bank page');
    assert(S.bankMapUp, 'the map went away on the tap');
    ticks(6);
    assert(led[pad(3, 2)] === K.White && led[pad(2, 1)] === K.VividYellow, 'the White pad did not follow');
});

step('let go after a tap: no click, the map goes, the pads come back', () => {
    release();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the map is still up');
    assert(!S.bankCardLatched, 'the release fired a click after a tap');
    const f = frame();
    assert(cellInk(f, 3, 2) < 0.9 || ink(f, 0, 0, 31, 5) === 0, 'the map is still on screen');
    ticks(6);
    assert(!rightDark() || (led[pad(3, 2)] !== K.White), 'pad LEDs did not repaint');
});

step('⚠ CONTROL: a quick click (press, release) still latches the bank view', () => {
    home();
    press(); release();
    assert(S.bankCardLatched, 'the replayed click did not latch');
    assert(!S.bankMapUp, 'a click flashed the map');
});

step('from the bank view a tap moves the CARD (it stays latched)', () => {
    press(); holdPast();
    tap(pad(3, 0));
    assert(S.activeBank === 1 && S.bankCardLatched, 'bank ' + S.activeBank + ' latched ' + S.bankCardLatched);
    release();
    assert(S.bankCardLatched && S.activeBank === 1, 'the release clicked (alt toggle / unlatch)');
});

step('turning while held still walks, and the release is not a click', () => {
    home();
    press();
    jog(1);
    assert(S.activeBank === 1, 'the turn did not walk: ' + S.activeBank);
    assert(S.bankMapUp, 'a turn did not arm the map');
    release();
    assert(!S.bankCardLatched, 'the release after a turn clicked');
});

step('⭐ a slow click (map painted, let go inside JOG_CLICK_MAX_MS): still the click', () => {
    home();
    assert(C.JOG_CLICK_MAX_MS > C.JOG_MAP_HOLD_MS, 'the click window must outlast the map delay');
    press(); holdPast();
    assert(S.bankMapUp, 'setup: the map did not paint');
    release();
    assert(!S.bankMapUp && S.bankCardLatched, 'a slow click inside the window was lost');
});

step('held past the click window and let go with no tap: the map goes, NO click', () => {
    home();
    press(); holdLong();
    release();
    assert(!S.bankMapUp && !S.bankCardLatched, 'letting go after a long look clicked');
});

step('a pad held before the jog is let go when the map paints; its release is swallowed', () => {
    home();
    S.lastPlayedNote = -1;
    midi(0x90, 68, 100);
    assert(S.liveActiveNotes.size === 1, 'the pad did not sound: ' + S.liveActiveNotes.size);
    press(); holdLong();
    assert(S.liveActiveNotes.size === 0, 'the held note is still on');
    midi(0x80, 68, 0);
    assert(S.bankMapSwallow.size === 0, 'the swallow set kept the pad');
    release();
    assert(!S.bankCardLatched, 'the release clicked');
});

step('a map pad still down when the jog comes up: its release is swallowed, then it plays again', () => {
    home();
    press(); holdPast();
    midi(0x90, pad(3, 2), 100);              /* tap DELAY, keep the finger down */
    release();                               /* jog up first */
    const n0 = S.liveActiveNotes.size;
    midi(0x80, pad(3, 2), 0);                /* the finger lifts after the map is gone */
    assert(!S.bankMapSwallow.has(pad(3, 2)), 'the swallow kept the pad');
    assert(S.liveActiveNotes.size === n0, 'the late release reached the pads');
    midi(0x90, pad(3, 2), 100);              /* and the next press is an ordinary note again */
    assert(S.liveActiveNotes.size === n0 + 1, 'the pad did not play after the map');
    midi(0x80, pad(3, 2), 0);
    assert(S.liveActiveNotes.size === n0, 'the ordinary release was eaten');
});

step('a pad held before the jog and let go BEFORE the map paints releases normally', () => {
    home();
    midi(0x90, 68, 100);
    press();
    midi(0x80, 68, 0);
    assert(S.liveActiveNotes.size === 0, 'the pre-map release was swallowed — stuck note');
    release();
});

step('a stale swallow (release lost) does not eat the next ordinary press', () => {
    home();
    S.bankMapSwallow.add(69);
    midi(0x90, 69, 100);
    assert(S.liveActiveNotes.size === 1, 'the press did not sound');
    midi(0x80, 69, 0);
    assert(S.liveActiveNotes.size === 0, 'the release was eaten by a stale swallow — stuck note');
});

step('a knob turn during a quick hold: the release is not a click', () => {
    home();
    press();
    midi(0xB0, 71, 1);                       /* a turn (its touch arrives separately) */
    assert(S.bankMapUsed, 'a knob turn did not count as doing something during the hold');
    release();
    assert(!S.bankCardLatched, 'a knob turn then release clicked');
    midi(0x90, 0, 127); midi(0x80, 0, 0);     /* the knob's touch and let-go */
    S.knobTouched = -1;
});

step('a lost jog release: the next press ends the stale hold and is judged afresh', () => {
    home();
    press(); holdPast();                     /* ...and the release never arrives */
    assert(S.bankMapUp, 'setup');
    press(); release();                      /* a quick click */
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the stale map survived');
    assert(S.bankCardLatched, 'the fresh click did not latch');
});

step('a lost jog release, and the next press is NOT armable: the stale map still ends', () => {
    home();
    press(); holdPast();                     /* the release never arrives */
    S.knobTouched = 0;                       /* a hand on a knob: the next press may not arm */
    press();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the stale map survived a press it could not take');
    S.knobTouched = -1;
    release();
});

step('the view changing under the hold ends the map', () => {
    home();
    press(); holdPast();
    S.sessionView = true; tick();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'a track map stayed up in Session View');
    S.sessionView = false; tick();
    release();
});

step('with Back down the press is not held back (a suspend may follow)', () => {
    home();
    S.backPressTick = S.tickCount;
    press();
    assert(S.jogPressMs < 0, 'deferred with Back down');
    release();
    S.backPressTick = -1;
});

step('another button while held ends the map, no click (Shift)', () => {
    home();
    press(); holdPast();
    midi(0xB0, 49, 127);
    assert(!S.bankMapUp && S.jogPressMs < 0, 'Shift did not end the map');
    midi(0xB0, 49, 0);
    release();
    assert(!S.bankCardLatched, 'the release after Shift clicked');
});

step('gates: with Shift held the press is NOT held back', () => {
    home();
    S.shiftHeld = true;
    press();
    assert(S.jogPressMs < 0, 'Shift+click was deferred');
    release();
    S.shiftHeld = false;
});

step('drum track: RPT GROOVE where LIVE ARP is, ALL LANES under DRUM LANE, MIX opens sound', () => {
    home();
    S.trackPadMode[2] = C.PAD_MODE_DRUM;
    const m = pure.bankPadMapForMode(C.PAD_MODE_DRUM, 2);
    assert(m[0].cells[1].name === 'RPT GROOVE', m[0].cells[1] && m[0].cells[1].name);
    assert(m[2].cells[1].name === 'DRUM LANE' && m[2].cells[2].name === 'ALL LANES', 'drum SEQ column');
    assert(m[0].cells[0] === null && m[3].cells[1] === null, 'drum dark cells');
    press(); holdPast();
    tap(pad(1, 3));
    assert(S.pendingSoundEnterTrack === 2 && S.activeBank === C.BANK_SOUND, 'MIX did not queue its screen');
    release();
    S.pendingSoundEnterTrack = -1;
    S.trackPadMode[2] = 0;
});

const ab = await import('../../ui/ui_automation_bank.mjs');
const tickS = (n) => { for (let i = 0; i < n; i++) { tick(); snd.soundTick(); } };
const backBtn = () => { midi(0xB0, 51, 127); midi(0xB0, 51, 0); tickS(2); };

step('⭐⭐ a CONFIG pick clicks INTO it: the TRACK CONFIG menu is up, the map is gone; Back gets home', () => {
    home();
    press(); holdPast();
    tap(pad(0, 3));                                    /* CONFIG, bottom-left */
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the map stayed up over the editor');
    release();
    tickS(4);
    assert(S.activeBank === 0, 'CONFIG became the bank (it is a screen): ' + S.activeBank);
    assert(snd.soundActive() && snd.soundViewForTest() === 0, 'not in the TRACK CONFIG menu: view ' + snd.soundViewForTest());
    for (let i = 0; i < 3 && snd.soundActive(); i++) backBtn();
    assert(!snd.soundActive() && !S.bankCardLatched, 'Back did not get home');
});

step('⭐⭐ an AUTOMATION pick clicks INTO it: its menu is open and on screen; Back gets home', () => {
    home(); tickS(2);
    press(); holdPast();
    tap(pad(1, 1));                                    /* AUTOMATION */
    assert(!S.bankMapUp, 'the map stayed up');
    release();
    assert(S.activeBank === C.BANK_AUTOMATION && ab.autoBankMenuOpen(), 'menu not open');
    assert(render.bankCardVisible(), 'the menu is not on screen');
    tickS(2);
    assert(ab.autoBankMenuOpen(), 'drawing the card closed the menu');
    backBtn();
    assert(!ab.autoBankMenuOpen() && !render.bankCardVisible(), 'Back at the menu top did not dismiss the screen');
    assert(S.activeBank === 0 && S.trackActiveBank[2] === 0, 'AUTOMATION stayed the bank: ' + S.activeBank);
});

step('…and with Bank Lock off it opens unlocked', () => {
    home(); S.bankLockOn = false; tickS(2);
    press(); holdPast();
    tap(pad(1, 1));
    release(); tickS(2);
    assert(ab.autoBankMenuOpen() && render.bankCardVisible(), 'menu not shown with Bank Lock off');
    backBtn();
    assert(!render.bankCardVisible() && S.activeBank === 0, 'Back did not get home: ' + S.activeBank);
    S.bankLockOn = true;
});

/* DOORS (2026-10-03): CONFIG, AUTOMATION, LIVE ARP are off the jog walk but
 * on the map, and a turn from one steps to its nearest walk neighbour. */
step('⭐⭐ a door is still picked from the map (LIVE ARP lands; a walk-indexed pick would do nothing)', () => {
    home(); S.padLayoutChord[2] = false;
    press(); holdPast();
    tap(pad(0, 1));
    release();
    assert(S.activeBank === 5 && S.bankCardLatched && render.bankCardVisible(), 'LIVE ARP screen: ' + S.activeBank);
    backBtn();
    assert(S.activeBank === 0 && !S.bankCardLatched, 'Back did not give the bank back: ' + S.activeBank);
});
const onDoor = (b) => { home(); ab.autoBankReset(); S.activeBank = b; S.trackActiveBank[2] = b; tickS(2); };
step('⭐ a turn from a door steps to the nearest walk bank that way', () => {
    S.padLayoutChord[2] = false;
    onDoor(5); jog(1); assert(S.activeBank === C.BANK_MACROS, 'LIVE ARP right: ' + S.activeBank);
    onDoor(5); jog(-1); assert(S.activeBank === C.BANK_MACROS, 'LIVE ARP left (nothing left of it): ' + S.activeBank);
    S.padLayoutChord[2] = true;
    onDoor(5); jog(-1); assert(S.activeBank === C.BANK_CHORD, 'LIVE ARP left on a Chord track: ' + S.activeBank);
    S.padLayoutChord[2] = false;
    onDoor(C.BANK_AUTOMATION); jog(-1); assert(S.activeBank === C.BANK_MACROS, 'AUTOMATION left: ' + S.activeBank);
    onDoor(C.BANK_AUTOMATION); jog(1); assert(S.activeBank === C.BANK_STEP, 'AUTOMATION right: ' + S.activeBank);
    snd.soundExit(); home();
});

step('Conductor: CLIP and STEP in SEQ, the responders in column 2', () => {
    const m = pure.bankPadMapForMode(C.PAD_MODE_CONDUCT, 2);
    assert(m[2].cells[0].name === 'CLIP' && m[2].cells[1].bank === C.BANK_STEP, 'conductor SEQ');
    assert(m[1].label === 'RSPD' && m[1].cells[0].name === 'ON/OFF', 'conductor RSPD');
    assert(m[0].label === null && m[0].cells[3].bank === C.BANK_CONFIG, 'conductor CONFIG');
});

step('Session: a MIXER pad walks the mode; MASTER opens its effects; the right half is dead', () => {
    home();
    S.sessionView = true; S.sessKnobMode = 0;
    press(); holdPast();
    assert(S.bankMapUp && S.bankMapKind === 'session', 'session map did not arm');
    ticks(6);
    assert(led[pad(0, 0)] === K.White && led[pad(0, 1)] === K.Cyan && led[pad(1, 0)] === K.BrightOrange,
           'session pad colours');
    assert((led[pad(1, 1)] | 0) === 0 && rightDark(), 'session dark pads');
    const f = frame();
    assert(cellInk(f, 0, 0) > 0.6 && cellInk(f, 1, 1) === 0, 'session screen');
    tap(pad(0, 1));
    assert(S.sessKnobMode === 1, 'PAN did not take: ' + S.sessKnobMode);
    tap(pad(6, 0));
    assert(S.bankMapUp, 'a right-half press did something');
    tap(pad(1, 0));
    assert(snd.soundOpen(), 'MASTER did not open the effect buses');
    assert(!S.bankMapUp, 'the map stayed over the bus editor');
    release();
    assert(snd.soundOpen() && S.jogPressMs < 0, 'the jog release after the FX tap acted');
});

if (failed) { console.error('test_bank_pad_map: FAIL'); process.exit(1); }
console.log('test_bank_pad_map: all passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
