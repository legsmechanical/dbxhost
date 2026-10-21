/* tests/js/test_bank_pad_map.mjs — THE BANK PAD MAP (Josh, 2026-10-02):
 * hold the jog and the left 4x4 pads are the track's banks, a column per
 * category; tap a pad to land on that bank; let go and the pads play again.
 * The map is up exactly as long as the jog is down (2026-10-13: the click
 * that left it up is retired — holding is the only way in).
 *
 * Performs the gesture through the real input path (onMidiMessageInternal)
 * and asserts what is ON SCREEN and ON THE PADS, not just state:
 *   - hold → after JOG_MAP_HOLD_MS the map paints: category labels, the
 *     current bank's box filled, an absent bank's box empty; pads in category
 *     colours, the current one White, the right 4x4 dark
 *   - tap → the bank changes (from the overview the overview stays)
 *   - release → the map goes, however short or long the hold; a quick
 *     click leaves nothing up
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
let loadedGen = '';   /* what every slot's synth:module read answers */
const LOADED = {};    /* other <comp>:module reads, by key */
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = (slot, key) => (key === 'synth:module' ? loadedGen : (LOADED[key] || ''));
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
globalThis.shadow_restore_knob_leds = () => {};

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
/* The map paints on the PRESS now (2026-10-04); a hold is just time passing. */
const holdPast = () => { S.tickCount += 2; globalThis.tick(); };
/* ...and a long look (over half a second). */
const holdLong = () => { S.tickCount += Math.ceil(500 / 10.6) + 1; globalThis.tick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const ink = (f, x, y, w, h) => { let n = 0; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) n += f[j * W + i]; return n; };
const cellInk = (f, c, r) => { const q = kit.bankMapCellRect(c, r); return ink(f, q.x, q.y, q.w, q.h) / (q.w * q.h); };
const rightDark = () => { for (let r = 0; r < 4; r++) for (let c = 4; c < 8; c++) if ((led[pad(c, r)] | 0) !== 0) return false; return true; };
/* The track map's right grid: the six MODULE pads lit (MIDI FX + INSTRUMENT
 * in the third column, FX 1-4 down the fourth), every other cell dark. */
const MODULE_CELLS = new Set(['6,0', '6,1', '7,0', '7,1', '7,2', '7,3']);
const lowerRightDark = () => { for (let r = 0; r < 4; r++) for (let c = 4; c < 8; c++) if (((led[pad(c, r)] | 0) !== 0) !== MODULE_CELLS.has(c + ',' + r)) return false; return true; };
const ccm = await import('../../ui/ui_input_cc.mjs');
const home = () => { ccm.bankMapEnd(); S.activeBank = 0; S.trackActiveBank[S.activeTrack] = 0; S.bankCardLatched = false;
    S.bankSelectTick = -1; S.pendingSoundEnterTrack = -1; S.trackPadMode[S.activeTrack] = C.PAD_MODE_MELODIC_SCALE ?? 0; };

home();

step('⭐ PRESS the jog on the overview: the map is ON SCREEN at once (Josh, 2026-10-04: "instantly")', () => {
    press();
    assert(S.jogPressMs >= 0 && S.bankMapUp, 'the press did not paint the map: up ' + S.bankMapUp);
    assert(!S.bankCardLatched, 'the press latched the bank card');
    const f = frame();
    assert(ink(f, 0, 0, 31, 5) > 0, 'no IN label over column 1');
    assert(ink(f, 2, 6, 27, 1) >= 20, 'no rule under the label');
    assert(cellInk(f, 2, 1) > 0.6, 'CLIP (SEQ column, row 2) is not the filled box: ' + cellInk(f, 2, 1));
    assert(cellInk(f, 3, 2) < 0.5 && cellInk(f, 3, 2) > 0.05, 'DELAY is not an outlined box');
    assert(cellInk(f, 2, 2) === 0, 'an absent bank drew something');
    assert(cellInk(f, 0, 0) === 0, 'CHORD drew outside the Chord layout');
});

step('…and ON THE PADS: categories coloured, CLIP White, absent dark, the right half only its module pads', () => {
    ticks(6);
    assert(led[pad(2, 1)] === K.White, 'CLIP pad is ' + led[pad(2, 1)]);
    assert(led[pad(3, 2)] === K.BrightOrange, 'DELAY pad is ' + led[pad(3, 2)]);
    assert(led[pad(0, 1)] === K.Cyan, 'LIVE ARP pad is ' + led[pad(0, 1)]);
    assert((led[pad(2, 2)] | 0) === 0, 'an absent bank pad is lit');
    assert(lowerRightDark(), 'the lower right grid is lit');
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

step('let go after a tap: the map goes, the pads come back', () => {
    release();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the map is still up');
    assert(!S.bankCardLatched, 'the release latched the bank card after a tap');
    const f = frame();
    assert(cellInk(f, 3, 2) < 0.9 || ink(f, 0, 0, 31, 5) === 0, 'the map is still on screen');
    ticks(6);
    assert(!rightDark() || (led[pad(3, 2)] !== K.White), 'pad LEDs did not repaint');
});

step('⭐⭐ a quick CLICK leaves NOTHING up: the map is there while the jog is down and gone when it comes up', () => {
    home();
    press();
    assert(S.bankMapUp, 'control: the press did not show the map');
    release();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the click left the map up: up ' + S.bankMapUp);
    assert(!S.bankCardLatched && S.activeBank === 0, 'the click latched the card or moved the bank');
    ticks(3);
    assert(ink(frame(), 0, 0, 31, 5) === 0 || cellInk(frame(), 2, 1) < 0.6, 'the map is still drawn');
    /* ...and a pad after it plays, it does not pick. */
    S.lastPlayedNote = -1;
    midi(0x90, pad(3, 2), 100);
    assert(S.activeBank === 0 && S.liveActiveNotes.size === 1, 'a pad after a click picked a bank: ' + S.activeBank);
    midi(0x80, pad(3, 2), 0);
});

step('⭐⭐ click after click after click: never a map left up', () => {
    home();
    for (let i = 0; i < 5; i++) {
        press(); release(); ticks(2);
        assert(!S.bankMapUp && S.jogPressMs < 0, 'click ' + (i + 1) + ' left the map up');
    }
});

step('⭐ several picks under ONE hold: each tap lands, the map stays until the jog is up', () => {
    home();
    press();
    tap(pad(3, 2));
    assert(S.activeBank === 3 && S.bankMapUp, 'first pick: bank ' + S.activeBank + ' up ' + S.bankMapUp);
    tap(pad(3, 0));
    assert(S.activeBank === 1 && S.bankMapUp, 'second pick: bank ' + S.activeBank + ' up ' + S.bankMapUp);
    release();
    assert(!S.bankMapUp && S.activeBank === 1, 'after release: up ' + S.bankMapUp + ' bank ' + S.activeBank);
});

step('⭐ held: another button puts the map away — Play, and Shift (a chord that needs the pads)', () => {
    home();
    press();
    midi(0xB0, 85, 127); midi(0xB0, 85, 0); ticks(2);          /* Play */
    assert(!S.bankMapUp, 'Play during the hold did not end the map');
    midi(0xB0, 85, 127); midi(0xB0, 85, 0); ticks(2);          /* stop again */
    release();
    press();
    midi(0xB0, 49, 127);                                       /* Shift */
    assert(!S.bankMapUp, 'Shift did not put the map away');
    midi(0xB0, 49, 0); release(); ticks(2);
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the late release brought the map back');
});

step('turning while held walks NO bank (retired 2026-10-04); the map stays through the turn and goes on the release', () => {
    home();
    press();
    jog(1);
    assert(S.activeBank === 0, 'the turn walked: ' + S.activeBank);
    assert(S.bankMapUp, 'the map went on a turn');
    release();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the release after a turn left the map up');
});

step('a long look, let go with no tap: the map goes, nothing latches', () => {
    home();
    press(); holdLong();
    release();
    assert(!S.bankMapUp && !S.bankCardLatched, 'letting go after a long look left something up');
});

step('a pad held before the jog is let go when the map paints; its release is swallowed', () => {
    home();
    S.lastPlayedNote = -1;
    midi(0x90, 68, 100);
    assert(S.liveActiveNotes.size === 1, 'the pad did not sound: ' + S.liveActiveNotes.size);
    press();
    assert(S.liveActiveNotes.size === 0, 'the held note is still on once the map painted (on the press)');
    holdLong();
    midi(0x80, 68, 0);
    assert(S.bankMapSwallow.size === 0, 'the swallow set kept the pad');
    release();
    assert(!S.bankMapUp, 'the long hold left the map up');
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

step('a stale swallow (release lost) does not eat the next ordinary press', () => {
    home();
    S.bankMapSwallow.add(69);
    midi(0x90, 69, 100);
    assert(S.liveActiveNotes.size === 1, 'the press did not sound');
    midi(0x80, 69, 0);
    assert(S.liveActiveNotes.size === 0, 'the release was eaten by a stale swallow — stuck note');
});

step('a knob turn during the hold leaves the map up; the release puts it away', () => {
    home();
    press();
    midi(0xB0, 71, 1);                       /* a turn (its touch arrives separately) */
    assert(S.bankMapUp, 'a knob turn ended the map');
    release();
    assert(!S.bankMapUp, 'a knob turn then release left the map up');
    midi(0x90, 0, 127); midi(0x80, 0, 0);     /* the knob's touch and let-go */
    S.knobTouched = -1;
});

step('a lost jog release: the next press ends the stale hold and is judged afresh', () => {
    home();
    press(); holdPast();                     /* ...and the release never arrives */
    assert(S.bankMapUp, 'setup');
    press();                                 /* judged afresh: a new hold */
    assert(S.bankMapUp && S.jogPressMs >= 0, 'the fresh press did not show the map');
    release();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the fresh release left the map up');
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

step('another button while held ends the map (Shift)', () => {
    home();
    press(); holdPast();
    midi(0xB0, 49, 127);
    assert(!S.bankMapUp && S.jogPressMs < 0, 'Shift did not end the map');
    midi(0xB0, 49, 0);
    release();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the release after Shift brought the map back');
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
    assert(S.bankMapUp && !snd.soundActive(), 'a HELD map opened CONFIG before the release');
    release();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the map stayed up over the editor');
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
    assert(S.bankMapUp && !ab.autoBankMenuOpen(), 'a HELD map opened AUTOMATION before the release');
    release();
    assert(!S.bankMapUp, 'the map stayed up');
    assert(S.activeBank === C.BANK_AUTOMATION && ab.autoBankMenuOpen(), 'menu not open');
    assert(render.bankCardVisible(), 'the menu is not on screen');
    tickS(2);
    assert(ab.autoBankMenuOpen(), 'drawing the card closed the menu');
    backBtn();
    assert(!ab.autoBankMenuOpen() && !render.bankCardVisible(), 'Back at the menu top did not dismiss the screen');
    assert(S.activeBank === 0 && S.trackActiveBank[2] === 0, 'AUTOMATION stayed the bank: ' + S.activeBank);
});

step('⭐⭐ LIVE ARP is a bank again: the map pick puts the knobs on it, and they stay', () => {
    home(); S.padLayoutChord[2] = false;
    press(); holdPast();
    tap(pad(0, 1));
    release();
    assert(S.activeBank === 5 && S.trackActiveBank[2] === 5, 'LIVE ARP not picked: ' + S.activeBank);
    assert(!S.doorReturn, 'LIVE ARP was opened as a door screen');
    backBtn();
    assert(S.activeBank === 5 && S.trackActiveBank[2] === 5, 'Back moved the knobs off LIVE ARP: ' + S.activeBank);
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
    /* The FX buses sit in the THIRD column, one clear of the mixer (Josh,
     * 2026-10-15); the second column is dark. */
    assert(led[pad(0, 0)] === K.White && led[pad(0, 1)] === K.Cyan && led[pad(2, 0)] === K.BrightOrange,
           'session pad colours');
    for (let r = 0; r < 4; r++) assert((led[pad(1, r)] | 0) === 0, 'the second column is lit at row ' + r);
    assert((led[pad(2, 1)] | 0) === 0 && rightDark(), 'session dark pads');
    const f = frame();
    assert(cellInk(f, 0, 0) > 0.6 && cellInk(f, 2, 1) === 0, 'session screen');
    assert(cellInk(f, 2, 0) > 0.05 && cellInk(f, 1, 0) === 0, 'MASTER is not drawn in the third column on screen');
    tap(pad(0, 1));
    assert(S.sessKnobMode === 1, 'PAN did not take: ' + S.sessKnobMode);
    tap(pad(6, 0));
    assert(S.bankMapUp, 'a right-half press did something');
    tap(pad(1, 0));
    assert(!S.bankMapDeferred, 'the old (second) column still acts');
    tap(pad(2, 0));
    assert(!snd.soundOpen() && S.bankMapUp, 'a HELD map opened MASTER before the release');
    release();
    assert(snd.soundOpen(), 'MASTER did not open the effect buses on the release');
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the map stayed over the bus editor');
});

step('⭐ Session, held: a MIXER pad walks the mode and the map stays; an FX pad opens its bus on the release', () => {
    if (snd.soundOpen()) snd.soundExit();
    home(); tickS(2);
    S.sessionView = true; S.sessKnobMode = 0;
    press();
    assert(S.bankMapUp && S.bankMapKind === 'session', 'setup: session map up');
    tap(pad(0, 2));
    assert(S.sessKnobMode === 2, 'SEND A did not take: ' + S.sessKnobMode);
    assert(S.bankMapUp, 'the held session map went on a mixer pick');
    tap(pad(2, 2));
    assert(!snd.soundOpen() && S.bankMapUp, 'SEND B opened before the release');
    release();
    assert(snd.soundOpen() && !S.bankMapUp, 'SEND B pad: open ' + snd.soundOpen() + ' up ' + S.bankMapUp);
    snd.soundExit(); tickS(2);
    S.sessionView = false;
});

const leds = await import('../../ui/ui_leds.mjs');
step('⭐ INST: right of MIX on melodic and drum, the track\'s colour, on screen; none on a Conductor', () => {
    home();
    for (const mode of [C.PAD_MODE_MELODIC_SCALE ?? 0, C.PAD_MODE_DRUM]) {
        const m = pure.bankPadMapForMode(mode, 2);
        assert(m[1].cells[3] && m[1].cells[3].bank === C.BANK_SOUND, 'MIX is not at col 1 row 3');
        const c = m[2].cells[3];
        assert(c && c.action === 'inst' && c.name === 'INST' && c.bank === null, 'no INST beside MIX: ' + JSON.stringify(c));
        assert(pure.bankPadMapActionAt(mode, 2, 3) === 'inst' && pure.bankPadMapCellAt(mode, 2, 2, 3) === null, 'INST lookup');
    }
    assert(pure.bankPadMapActionAt(C.PAD_MODE_CONDUCT, 2, 3) === null &&
           pure.bankPadMapForMode(C.PAD_MODE_CONDUCT, 2)[2].cells[3] === null, 'a Conductor has an INST pad');
    press(); ticks(6);
    assert(led[pad(2, 3)] === leds.trackColor(2) && led[pad(1, 3)] === leds.trackColor(2),
           'INST ' + led[pad(2, 3)] + ' / MIX ' + led[pad(1, 3)] + ' vs track ' + leds.trackColor(2));
    const f = frame();
    assert(cellInk(f, 2, 3) > 0.05 && cellInk(f, 2, 3) < 0.6, 'INST is not an outlined box: ' + cellInk(f, 2, 3));
    release();
});

step('⭐⭐ INST: it waits for the jog\'s release, then opens the track\'s instrument with a return crumb', () => {
    home(); tickS(2);
    S.genReturn = null;
    press(); holdPast();
    tap(pad(2, 3));
    assert(S.bankMapUp && !S.genReturn, 'a HELD map opened INST before the release');
    release();
    assert(!S.bankMapUp && S.jogPressMs < 0, 'the release left the map up');
    tickS(4);
    assert(snd.soundActive() && S.genReturn && S.genReturn.track === 2 && !S.genReturn.wasActive, 'the instrument did not open from a held map: ' + JSON.stringify(S.genReturn));
    assert(S.activeBank === 0, 'INST moved the bank: ' + S.activeBank);
    snd.soundExit(); tickS(2);
});

/* ⭑ THE FOOTER TELLS THE TRUTH: HLD BANKS shows exactly where the held jog
 * would show the map (bankMapArmable), and no footer says JOG BANK — the turn
 * walks nothing since 2026-10-04 (Josh: "change the hints on the
 * session/track overview screens to reflect new bank select behavior"). */
const clkOf = (h) => (h.find((p) => p[0] === 'CLK') || [])[1] || null;
const hldOf = (h) => (h.find((p) => p[0] === 'HLD') || [])[1] || null;
const jogOf = (h) => (h.find((p) => p[0] === 'JOG') || [])[1] || null;
step('⭐ overview hints: HLD BANKS where the held jog shows the map, never CLK BANKS or JOG BANK — Track, Session, Perf lock, Shift', () => {
    if (snd.soundOpen()) snd.soundExit();
    home(); tickS(2);
    const cases = [
        ['Track View', () => { S.sessionView = false; }],
        ['Session View', () => { S.sessionView = true; }],
        ['Session View, Perf locked', () => { S.sessionView = true; S.perfViewLocked = true; }],
    ];
    for (const [name, set] of cases) {
        set();
        const h = render.overviewHints();
        assert(jogOf(h) !== 'BANK', name + ': JOG BANK is back: ' + JSON.stringify(h));
        assert(clkOf(h) !== 'BANKS', name + ': CLK BANKS is back — a click opens no map: ' + JSON.stringify(h));
        assert((hldOf(h) === 'BANKS') === ccm.bankMapArmable(),
               name + ': hint ' + hldOf(h) + ' vs armable ' + ccm.bankMapArmable());
        press();                               /* ...and the hold really does, or does not */
        assert(S.bankMapUp === (hldOf(h) === 'BANKS'), name + ': hint ' + hldOf(h) + ' but map up ' + S.bankMapUp);
        release();
        assert(!S.bankMapUp, name + ': the map outlived the hold');
        S.perfViewLocked = false;
    }
    assert(hldOf((S.sessionView = true, render.overviewHints())) === 'BANKS', 'control: Session View offers the map');
    S.shiftHeld = true;
    const sh = render.overviewHints();
    S.shiftHeld = false; S.sessionView = false;
    assert(JSON.stringify(sh) === JSON.stringify([['JOG', 'TRACK']]), 'Shift in Session View: ' + JSON.stringify(sh));
});

step('⭐ bank page hints: HLD BANKS untouched, none with a knob touched (it keeps the map shut), none on a door bank', () => {
    home(); tickS(2);
    S.activeBank = 3; S.trackActiveBank[2] = 3;
    let h = render.bankPageHints(3);
    assert(hldOf(h) === 'BANKS' && clkOf(h) === null && jogOf(h) === null && ccm.bankMapArmable(), 'untouched DELAY: ' + JSON.stringify(h));
    S.knobTouched = 2;
    h = render.bankPageHints(3);
    assert(hldOf(h) !== 'BANKS' && !ccm.bankMapArmable(), 'touched DELAY: ' + JSON.stringify(h));
    S.knobTouched = -1;
    h = render.bankPageHints(C.BANK_AUTOMATION);
    assert(hldOf(h) !== 'BANKS', 'AUTOMATION (a door) offers the map: ' + JSON.stringify(h));
    home();
});

/* ⭑⭑ A HELD map holds the MENU pads until the jog is let go (Josh,
 * 2026-10-04: "when pad bank map is momentary, can we hold the menu entries
 * (automation, instrument, config, others?) until release of jog to allow ALL
 * pads to be tapped through without exiting map?"). */
step('⭐⭐ held: tap through CONFIG, AUTOMATION, INST and banks — the map stays; the menu pad waits, White and boxed', () => {
    if (snd.soundOpen()) snd.soundExit();
    home(); tickS(2);
    S.genReturn = null;
    press(); holdPast();
    for (const [c, r] of [[0, 3], [1, 1], [2, 3]]) {          /* CONFIG, AUTOMATION, INST */
        tap(pad(c, r));
        assert(S.bankMapUp && S.jogPressMs >= 0, 'a menu pad ended the held map: ' + c + ',' + r);
        assert(!snd.soundActive() && !ab.autoBankMenuOpen() && !S.genReturn, 'a menu opened mid-hold: ' + c + ',' + r);
        ticks(6);
        assert(led[pad(c, r)] === K.White, 'the waiting pad is not White: ' + c + ',' + r + ' = ' + led[pad(c, r)]);
        assert(led[pad(2, 1)] !== K.White, 'CLIP (the bank you are on) stayed White beside the waiting pad');
        assert(cellInk(frame(), c, r) > 0.6, 'the waiting pad is not the filled box on screen: ' + c + ',' + r);
    }
    tap(pad(3, 2));                                           /* DELAY: a bank — cancels the wait */
    assert(S.activeBank === 3 && S.bankMapUp && !S.bankMapDeferred, 'a bank tap did not pick and cancel the waiting menu');
    ticks(6);
    assert(led[pad(3, 2)] === K.White && led[pad(2, 3)] !== K.White, 'the White pad did not move back to the bank');
    release();
    assert(!S.bankMapUp && !snd.soundActive() && !S.genReturn && !ab.autoBankMenuOpen(),
           'the release opened a menu a bank tap had cancelled');
    assert(S.activeBank === 3, 'the bank pick did not stand: ' + S.activeBank);
});

step('held: the LAST menu pad tapped is the one the release opens', () => {
    home(); tickS(2);
    press(); holdPast();
    tap(pad(0, 3));                                           /* CONFIG... */
    tap(pad(1, 1));                                           /* ...then AUTOMATION */
    release();
    assert(ab.autoBankMenuOpen() && S.activeBank === C.BANK_AUTOMATION, 'AUTOMATION did not open on the release');
    assert(!snd.soundActive(), 'CONFIG opened as well');
    backBtn(); tickS(2);
});

step('held: Shift (the map goes another way) DISCARDS a waiting menu pad', () => {
    home(); tickS(2);
    press(); holdPast();
    tap(pad(0, 3));
    midi(0xB0, 49, 127);                                      /* Shift ends the hold */
    midi(0xB0, 49, 0);
    release();
    tickS(4);
    assert(!S.bankMapUp && !S.bankMapDeferred && !snd.soundActive(), 'a discarded CONFIG opened anyway');
});

step('held Session map: MASTER waits; a MIXER pad after it cancels it — the release opens nothing', () => {
    if (snd.soundOpen()) snd.soundExit();
    home(); S.sessionView = true; S.sessKnobMode = 0; tickS(2);
    press(); holdPast();
    tap(pad(2, 0));                                           /* MASTER: waits */
    assert(S.bankMapUp && !snd.soundOpen(), 'MASTER opened mid-hold');
    ticks(6);
    assert(led[pad(2, 0)] === K.White && led[pad(0, 0)] !== K.White, 'the waiting MASTER pad is not the White one');
    tap(pad(0, 1));                                           /* PAN */
    assert(S.sessKnobMode === 1 && !S.bankMapDeferred, 'PAN did not take, or MASTER still waits');
    release(); tickS(3);
    assert(!snd.soundOpen() && !S.bankMapUp, 'the release opened MASTER after a mixer pick cancelled it');
    S.sessionView = false; tickS(2);
});

step('⭐ the TRACK overview footer: HLD BANKS · TCH EDIT · SHFT TRK, all drawn; Shift: JOG TRACK alone; no menu-key pair', () => {
    if (snd.soundOpen()) snd.soundExit();
    home(); S.sessionView = false; tickS(2);
    const h = render.overviewHints();
    assert(JSON.stringify(h) === JSON.stringify([['HLD', 'BANKS'], ['TCH', 'EDIT'], ['SHFT', 'TRK']]), 'track overview: ' + JSON.stringify(h));
    assert(kit.drawKitHintRow(kit.MV_FOOTER_Y, h) === 3, 'the row does not fit all three pairs');
    S.shiftHeld = true;
    const sh = render.overviewHints();
    S.shiftHeld = false;
    assert(JSON.stringify(sh) === JSON.stringify([['JOG', 'TRACK']]), 'Shift: ' + JSON.stringify(sh));
    S.sessionView = true;
    const ses = render.overviewHints();
    S.sessionView = false;
    assert(JSON.stringify(ses) === JSON.stringify([['HLD', 'BANKS'], ['TCH', 'MIX']]), 'session overview: ' + JSON.stringify(ses));
    for (const k of ['CLK', 'HLD', 'TCH', 'SHFT', 'JOG', 'PAD'])
        assert(kit.MV_FOOTER_CANON.keys.indexOf(k) >= 0, k + ' is not a canon key');
});

/* ---- THE TRACK BUTTONS (Josh, 2026-10-08; moved 2026-10-14) -------------
 * "move the track selectors off of the pads on the right 4x4 and down to step
 * buttons one through 8 ... make all tracks show as bright track color with
 * the active one blinking track color/white". */
const TRK = (t) => 16 + t;
const await_eng = await import('../../ui/ui_engine.mjs');
const paintOn = () => { for (let i = 0; i < 80 && !leds.bankMapTrackBlinkOn(S.clockMs); i++) tick(); ticks(1); };

step('⭐ track buttons: Steps 1-8 BRIGHT in their colour, the active one blinks colour/White, Steps 9-16 dark, the right grid only its module pads', () => {
    home(); S.sessionView = false;
    const at = S.activeTrack;
    press(); holdPast();
    assert(S.bankMapUp, 'rig: map did not arm');
    paintOn();
    for (let t = 0; t < 8; t++) {
        if (t === at) continue;
        assert(led[TRK(t)] === C.TRACK_COLORS[t], 'Step ' + (t + 1) + ' is ' + led[TRK(t)] + ', wanted ' + C.TRACK_COLORS[t]);
    }
    const seen = new Set();
    for (let i = 0; i < 90; i++) { tick(); seen.add(led[TRK(at)] | 0); }
    assert(seen.has(C.TRACK_COLORS[at]) && seen.has(K.White) && seen.size === 2,
           'the active track button does not blink colour/White: ' + JSON.stringify([...seen]));
    for (let i = 8; i < 16; i++) assert((led[16 + i] | 0) === 0, 'Step ' + (i + 1) + ' is lit');
    assert(lowerRightDark(), 'the right grid shows more than the module pads');
    release(); ticks(2);
});

step('⭐⭐ HOLD + a track button: the track switches, the map STAYS and the next tap is a bank on the NEW track', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    const to = S.activeTrack === 5 ? 6 : 5;
    press(); holdPast();
    tap(TRK(to)); ticks(1);
    assert(S.activeTrack === to, 'the track button did not switch: active ' + S.activeTrack);
    assert(S.bankMapUp, 'the map went away on a track pick');
    /* ...and says which: the notice card, over the map, gone in a moment. */
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(['TRACK ' + (to + 1), 'No instrument']) && S.actionPopupCard,
           'no TRACK n card: ' + JSON.stringify(S.actionPopupLines));
    const bare = (() => { const keep = S.actionPopupEndTick; S.actionPopupEndTick = -1; const f = frame(); S.actionPopupEndTick = keep; return f; })();
    const carded = frame();
    let diff = 0; for (let i = 0; i < carded.length; i++) diff += carded[i] !== bare[i] ? 1 : 0;
    assert(diff > 40, 'the card is not drawn over the map (' + diff + ' px differ)');
    const until = S.actionPopupEndTick - S.clockMs;
    /* ~twice the first cut (Josh, 2026-10-15), and the header inverted. */
    assert(until >= 600 && until <= 800, 'the card is not ~700 ms: ' + until + ' ms');
    assert(S.actionPopupHighlight === 0, 'the TRACK n header is not set off (inverse video): ' + S.actionPopupHighlight);
    ticks(Math.ceil(850 / 10.6));
    let late = 0; const after = frame(); for (let i = 0; i < after.length; i++) late += after[i] !== bare[i] ? 1 : 0;
    assert(late === 0, 'the card is still up after its window (' + late + ' px)');
    tap(pad(3, 2)); ticks(1);
    assert(S.activeTrack === to && S.activeBank === 3, 'the bank pick did not land on the new track: track ' + S.activeTrack + ' bank ' + S.activeBank);
    holdLong(); release(); ticks(2);
    assert(!S.bankMapUp && S.activeTrack === to, 'after release');
});

step('the track\'s own button, Steps 9-16 and the right grid do nothing; another track button switches and says so', () => {
    ccm.bankMapEnd(); home();
    const at = S.activeTrack, to = at === 0 ? 1 : 0;
    press(); ticks(1);
    assert(S.bankMapUp, 'rig: the hold did not show the map');
    tap(TRK(at)); tap(24); tap(31); tap(pad(4, 0)); tap(pad(7, 1)); tap(pad(7, 3)); ticks(1);
    assert(S.activeTrack === at && S.bankMapUp, 'a dead pad did something');
    tap(TRK(to)); ticks(1);
    assert(S.activeTrack === to, 'the track pad did not switch: active ' + S.activeTrack);
    assert(S.bankMapUp, 'the held map went on a track pick');
    assert(S.actionPopupLines[0] === 'TRACK ' + (to + 1), 'no TRACK n card');
    release(); ticks(1);
    assert(!S.bankMapUp && S.activeTrack === to, 'after release: up ' + S.bankMapUp + ' track ' + S.activeTrack);
});

step('the card\'s second line is what the track PLAYS, in full: the generator\'s own name, Move n, MIDI Ch n, Track n', () => {
    const eng = await_eng;
    eng.engineNoteModuleAbbrevs([{ id: 'moog', name: 'Mini Moog', abbrev: 'MG' }]);
    const line2 = (t, setup) => {
        ccm.bankMapEnd(); home(); S.sessionView = false;
        if (S.activeTrack === t) { S.activeTrack = (t + 1) % 8; home(); }
        setup();
        press(); holdPast(); tap(TRK(t)); ticks(1);
        const l = S.actionPopupLines.slice();
        holdLong(); release(); ticks(2);
        assert(l[0] === 'TRACK ' + (t + 1), 'first line: ' + JSON.stringify(l));
        return l[1];
    };
    loadedGen = 'moog';
    assert(line2(4, () => { S.trackRoute[4] = 0; }) === 'Mini Moog', 'a Schwung track did not name its generator in full');
    loadedGen = 'nameless';
    assert(line2(4, () => { S.trackRoute[4] = 0; }) === 'nameless', 'a generator with no declared name did not fall back to its id');
    loadedGen = '';
    assert(line2(1, () => { S.trackRoute[1] = 1; S.trackChannel[1] = 2; }) === 'Move 2', 'a Move track');
    assert(line2(6, () => { S.trackRoute[6] = 2; S.trackMidiTo[6] = 0; S.trackChannel[6] = 5; }) === 'MIDI Ch 5', 'a MIDI track');
    assert(line2(6, () => { S.trackRoute[6] = 2; S.trackMidiTo[6] = 2; }) === 'Track 2', 'a track routed to a track');
    for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackMidiTo[i] = 0; }
});

step('⚠ RETIRED: Shift + a bottom-row pad no longer switches track — and lights no track row', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    const at = S.activeTrack, other = at === 6 ? 5 : 6;
    midi(0xB0, 49, 127); ticks(3);
    assert(S.shiftHeld, 'rig: Shift did not latch');
    const row = []; for (let i = 0; i < 8; i++) row.push(led[68 + i] | 0);
    let trackish = 0; for (let i = 0; i < 8; i++) if (row[i] === C.TRACK_COLORS[i] || row[i] === C.TRACK_DIM_COLORS[i]) trackish++;
    assert(trackish < 8, 'Shift still paints the bottom row in the eight track colours: ' + JSON.stringify(row));
    tap(68 + other); ticks(2);
    assert(S.activeTrack === at, 'Shift + bottom-row pad still switched track: ' + S.activeTrack);
    midi(0xB0, 49, 0); ticks(2);
});

step('SESSION map: no track buttons — the right grid is dark and dead, steps left to their owner', () => {
    ccm.bankMapEnd(); home(); S.sessionView = true; S.sessKnobMode = 0;
    const at = S.activeTrack;
    press(); holdPast(); ticks(6);
    assert(S.bankMapKind === 'session' && rightDark(), 'session map lit the right grid');
    tap(pad(4 + ((at === 6 ? 5 : 6) % 4), (at === 6 ? 5 : 6) >> 2)); ticks(1);
    assert(S.activeTrack === at, 'a session-map pad switched track');
    assert(!S.bankMapSwallow.has(16 + (at === 6 ? 5 : 6)), 'the session map took a step button');
    holdLong(); release(); ticks(2); S.sessionView = false;
});

/* ---- THE MODULE PADS (Josh, 2026-10-15) ---------------------------------
 * "I want these to be shortcuts to the respective module editors. they work
 * like the other shortcuts - pad map doesn't exit until it is released ...
 * pressing one of these shortcuts should show a pop-up like the track
 * shortcuts: [Slot name] / [Full module or instrument name]" — MIDI FX over
 * INSTRUMENT in the third column, FX 1-4 down the far-right one. */
const MOD = { midi: pad(6, 0), inst: pad(6, 1), fx1: pad(7, 0), fx2: pad(7, 1), fx3: pad(7, 2), fx4: pad(7, 3) };
const modLit = () => Object.keys(MOD).filter((k) => (led[MOD[k]] | 0) !== 0).sort().join(',');

step('⭐ module pads: a colour per kind — INSTRUMENT the track\'s, MIDI FX Cyan, every audio FX BrightOrange', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    const t = S.activeTrack;
    press(); holdPast(); ticks(2);
    const want = { inst: leds.trackColor(t), midi: K.Cyan, fx1: K.BrightOrange, fx2: K.BrightOrange, fx3: K.BrightOrange, fx4: K.BrightOrange };
    for (const k of Object.keys(MOD)) assert(led[MOD[k]] === want[k], k + ' pad is ' + led[MOD[k]] + ', wanted ' + want[k]);
    assert(new Set([want.inst, want.midi, want.fx1]).size === 3, 'the three kinds do not differ on this track');
    release(); ticks(2);
});

step('⭐⭐ HOLD + MIDI FX pad: the popup names the slot and the module, the map STAYS, the pad turns White; release opens its editor with Back armed', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    const t = S.activeTrack;
    LOADED['midi_fx1:module'] = 'arp';
    press(); holdPast();
    tap(MOD.midi); ticks(1);
    assert(S.bankMapUp, 'the map went away on a module pad');
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(['MIDI FX', 'arp']) && S.actionPopupCard,
           'popup: ' + JSON.stringify(S.actionPopupLines));
    const until = S.actionPopupEndTick - S.clockMs;
    assert(until >= 600 && until <= 800, 'the popup is not ~700 ms like a track pick\'s: ' + until + ' ms');
    assert(S.actionPopupHighlight === 0, 'the slot-name header is not set off (inverse video)');
    ticks(1);
    assert(led[MOD.midi] === K.White, 'the waiting pad is not White: ' + led[MOD.midi]);
    assert(!snd.soundOpen(), 'it opened before the release');
    holdLong(); release(); ticks(6);
    assert(!S.bankMapUp, 'the map is still up after the release');
    assert(snd.soundOpen() && snd.soundTrack() === t && snd.soundCompForTest() === 'midi_fx1',
           'not in the MIDI FX editor: open ' + snd.soundOpen() + ' comp ' + snd.soundCompForTest());
    assert(snd.soundGestureArmed(), 'no return crumb: Back would not retrace to where the map was held');
    snd.soundExit(); ticks(2);
    delete LOADED['midi_fx1:module'];
});

step('an EMPTY block says so; a later pad replaces the waiting one; INSTRUMENT names what the track plays', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    press(); holdPast();
    tap(MOD.fx3); ticks(1);
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(['FX 3', 'Empty']), 'popup: ' + JSON.stringify(S.actionPopupLines));
    loadedGen = 'moog';
    await_eng.engineNoteModuleAbbrevs([{ id: 'moog', name: 'Mini Moog', abbrev: 'MG' }]);
    tap(MOD.inst); ticks(1);
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(['INSTRUMENT', 'Mini Moog']), 'popup: ' + JSON.stringify(S.actionPopupLines));
    ticks(1);
    assert(led[MOD.inst] === K.White && led[MOD.fx3] !== K.White, 'the White pad did not move to the later tap');
    holdLong(); release(); ticks(6);
    assert(snd.soundOpen() && snd.soundCompForTest() === 'synth', 'INSTRUMENT did not open the generator: comp ' + snd.soundCompForTest());
    snd.soundExit(); ticks(2);
    loadedGen = '';
});

step('a bank tap after a module pad cancels it: the release opens nothing', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    press(); holdPast();
    tap(MOD.fx1); ticks(1);
    tap(pad(3, 2)); ticks(1);
    holdLong(); release(); ticks(6);
    assert(!snd.soundOpen(), 'the module pad still opened after a bank tap');
    assert(S.activeBank === 3, 'the bank tap did not land: ' + S.activeBank);
});

step('MIDI track: only MIDI FX is lit, and the dark pads do nothing', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    const t = S.activeTrack;
    S.trackRoute[t] = 2;
    press(); holdPast(); ticks(2);
    assert(modLit() === 'midi', 'lit on a MIDI track: ' + modLit());
    S.actionPopupLines = [];
    tap(MOD.fx1); tap(MOD.inst); ticks(1);
    assert(!(S.actionPopupLines || []).length && !S.bankMapDeferred, 'a dark pad acted: ' + JSON.stringify(S.actionPopupLines));
    release(); ticks(2);
    S.trackRoute[t] = 0;
});

step('Conductor: none lit', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    const t = S.activeTrack;
    S.trackPadMode[t] = C.PAD_MODE_CONDUCT;
    press(); holdPast(); ticks(2);
    assert(modLit() === '', 'lit on a Conductor: ' + modLit());
    release(); ticks(2);
    S.trackPadMode[t] = C.PAD_MODE_MELODIC_SCALE ?? 0;
    S.trackRoute[t] = 0;
});

step('Move track: an FX pad names the module on the track\'s Move bus insert', () => {
    ccm.bankMapEnd(); home(); S.sessionView = false;
    const t = S.activeTrack;
    S.trackRoute[t] = 1; S.trackChannel[t] = 2;
    LOADED['move_fx:2:fx2:module'] = 'freeverb';
    press(); holdPast(); ticks(2);
    assert(modLit() === 'fx1,fx2,fx3,fx4,inst,midi', 'lit on a Move track: ' + modLit());
    tap(MOD.fx2); ticks(1);
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(['FX 2', 'freeverb']), 'popup: ' + JSON.stringify(S.actionPopupLines));
    ccm.bankMapEnd(); ticks(2);
    S.trackRoute[t] = 0; S.trackChannel[t] = 1;
    delete LOADED['move_fx:2:fx2:module'];
});

if (failed) { console.error('test_bank_pad_map: FAIL'); process.exit(1); }
console.log('test_bank_pad_map: all passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
