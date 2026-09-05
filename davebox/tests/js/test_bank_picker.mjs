/* THE JOG IS THE BANK PICKER in track view (Josh, 2026-08-25). A turn opens the
 * kit's list overlay over the page you were on, turns move a selection, and
 * letting go of the jog TOUCH commits. Shift+jog goes back to stepping tracks.
 *
 * TWO gestures commit: the jog CLICK (choose while staying in contact, so the
 * card stays up under your finger) and the touch RELEASE ("I am done, take
 * it"). Both call applyBankPick — two gestures for one behaviour, not two
 * implementations of it.
 *
 * ⚠ The settle timeout does NOT commit. It is the one path that fires with
 * nobody asking, and a picker you forgot about must not quietly change your
 * bank. Shift+jog, Shift+click and Back abandon too — they close the picker
 * BEFORE any release, which is also why a release cannot resurrect an
 * abandoned pick. A test that
 * sends the CC alone leaves the gesture unfinished and nothing lands.
 *
 * ⚠⚠ Nothing may be applied while browsing. The old walk applied every step as
 * it passed: it read a bank's params on each detent and ENTERED sound mode the
 * moment it reached SOUND + CONFIG, so a scroll across the strip did all of
 * that on the way. "Browsing past" must not mean "choosing".
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.host_register_primary = () => true;
globalThis.clear_screen = () => {};
let prints = [];
globalThis.print = (x, y, t) => { prints.push(String(t)); };
/* A real framebuffer: the bank HEADER is drawn with hdrPrint (set_pixel), not
 * the host print global, so a print spy cannot see it at all. */
const FBW = 128, FBH = 64;
const fb = new Uint8Array(FBW * FBH);
const _px = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < FBW && y >= 0 && y < FBH) fb[y * FBW + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) _px(x + i, y + j, v); };
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = _px;
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.text_width = (t) => String(t).length * 6;
/* ⚠⚠ tick() swallows errors — a missing binding kills every later stage. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
import { readFileSync } from 'node:fs';

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANK_SOUND, BANK_MACROS, BANK_AUTOMATION } = await import('../../ui/ui_constants.mjs');
const { bankCycleForMode, bankDisplayName } = await import('../../ui/ui_pure.mjs');
const { PAD_MODE_DRUM, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
const snd = await import('../../ui/ui_sound.mjs');
/* The vertical map, read rather than repeated: these assertions are about WHERE
 * the latch frame is, and hardcoding its rows is how a test keeps passing
 * against a page that has moved underneath it. */
const { MV_FOOTER_Y, MV_RULE_Y } = await import('../../ui/ui_movy.mjs');
const FRAME_TOP = 8, FRAME_BOT = MV_FOOTER_Y - 1;
const render = await import('../../ui/ui_render.mjs');
const kit = await import('../../ui/ui_movy.mjs');
const { BANKS } = await import('../../ui/ui_constants.mjs');

/* WHICH screen is up. The track overview draws the eight track digits through
 * the host print global (drawTrackRow); a bank page draws none of them. ⚠ The
 * flag alone is not the answer — bankSelectTick can be held while the renderer
 * ignores it, which is exactly what a mutation proved. */
function overviewIsUp() {
    prints = [];
    render.drawUI();
    return [1,2,3,4,5,6,7,8].every((n) => prints.indexOf(String(n)) >= 0);
}

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0x90, d1, d2]));
const shift = (on) => cc(49, on ? 127 : 0);
const touch = (on) => note(9, on ? 127 : 0);      /* MoveMainTouch = note 9 */
const jog   = (d) => cc(14, d > 0 ? 1 : 127);
const click = () => { cc(3, 127); cc(3, 0); globalThis.tick(); };
/* Turn and CHOOSE: touch, detent, click, release. */
const turn  = (d) => { touch(true); jog(d); globalThis.tick(); click(); touch(false); globalThis.tick(); };

function reset() {
    /* A track switch FOLLOWS in sound mode since 2026-09-05 (item 20), so a
     * step that switched tracks leaves sound mode OPEN; the next step starts
     * closed, like the device does after Back. */
    if (snd.soundOpen()) snd.soundExit();
    S.sessionView = false; S.globalMenuOpen = false;
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
    S.awaitingProjectSelect = false; S.loopHeld = false; S.shiftHeld = false;
    S.bankPickerSel = -1; S.bankCardLatched = false;
    S.activeTrack = 2; S.activeBank = 0;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackPadMode[t] = 0; S.trackActiveBank[t] = 0; }
    if (!S.bankParams) S.bankParams = Array.from({ length: 8 }, () =>
        Array.from({ length: 12 }, () => new Array(8).fill(0)));
}

/* ── the DIRECT WALK (Josh, 2026-09-01) ──────────────────────────────────
 * The 08-25 picker overlay is RETIRED: inside the bank view the jog moves
 * through the banks directly, one detent per bank, clamped at both ends.
 * Safe now because SOUND + CONFIG is a DOOR — landing on it shows the prompt
 * card, never the menu. The steps below replace the whole picker suite
 * (open/commit-on-click/commit-on-release/timeout/abandon): there is no
 * picker to open, commit, or abandon any more. */

step('⭑ the turn WALKS the banks directly — one detent, one bank, no overlay', () => {
    reset();
    S.bankCardLatched = true;              /* the walk lives inside the bank view */
    const cyc = bankCycleForMode(0);
    jog(1); globalThis.tick();
    if (S.bankPickerSel >= 0) throw new Error('an overlay opened — the picker is retired');
    if (S.activeBank !== cyc[1])
        throw new Error('one detent landed on ' + S.activeBank + ', expected ' + cyc[1]);
    if (S.trackActiveBank[2] !== cyc[1])
        throw new Error('the per-track record did not follow: ' + S.trackActiveBank[2]);
    if (S.bankSelectTick < 0) throw new Error('the walked-to bank has no display window');
});

step('⭑ ...and clamps at the first bank', () => {
    reset();
    S.bankCardLatched = true;
    jog(-1); globalThis.tick();
    if (S.activeBank !== 0) throw new Error('walked below the first bank: ' + S.activeBank);
});

step('⭑ walking onto SOUND + CONFIG lands the DOOR; on to MACROS is a screen switch; walking off leaves', () => {
    reset();
    S.bankCardLatched = true;
    const cyc = bankCycleForMode(0);
    /* Up to SOUND + CONFIG. */
    for (let i = 0; i < cyc.indexOf(BANK_SOUND); i++) { jog(1); }
    globalThis.tick(); globalThis.tick();          /* the entry defers to tick */
    if (!snd.soundActive()) throw new Error('the walk did not open the door');
    if (S.activeBank !== BANK_SOUND) throw new Error('not on SOUND + CONFIG: ' + S.activeBank);
    /* One more: MACROS — the mode stays open, the screen and the record switch. */
    jog(1); globalThis.tick();
    if (!snd.soundActive()) throw new Error('walking onto MACROS closed sound mode');
    if (S.activeBank !== BANK_MACROS || S.trackActiveBank[2] !== BANK_MACROS)
        throw new Error('MACROS did not record itself: ' + S.activeBank + '/' + S.trackActiveBank[2]);
    /* On to AUTOMATION (last since 2026-09-03): sound mode leaves; back left it re-opens on MACROS. */
    jog(1); globalThis.tick();
    if (S.activeBank !== BANK_AUTOMATION || snd.soundActive()) throw new Error('MACROS -> AUTOMATION should leave sound mode: ' + S.activeBank);
    jog(-1); globalThis.tick(); globalThis.tick();
    if (S.activeBank !== BANK_MACROS || !snd.soundActive()) throw new Error('AUTOMATION -> MACROS should re-open on the page: ' + S.activeBank);
    /* Back to the door, still open; then off it, closed. */
    jog(-1); globalThis.tick();
    if (!snd.soundActive() || S.activeBank !== BANK_SOUND)
        throw new Error('MACROS -> SOUND + CONFIG should keep the mode open on the door: ' + S.activeBank);
    jog(-1); globalThis.tick();
    if (snd.soundActive()) throw new Error('walking off the door did not leave sound mode');
    if (S.activeBank !== cyc[cyc.indexOf(BANK_SOUND) - 1])
        throw new Error('did not land on the neighbour bank: ' + S.activeBank);
});

step('⭑ two detents before the tick: the queued door counts as the position (STEP → SOUND → MACROS)', () => {
    reset();
    S.bankCardLatched = true;
    const cyc = bankCycleForMode(0);
    for (let i = 0; i < cyc.indexOf(BANK_MACROS); i++) { jog(1); }   /* no tick between */
    globalThis.tick(); globalThis.tick();
    if (!snd.soundActive()) throw new Error('the walk did not open sound mode');
    if (S.activeBank !== BANK_MACROS)
        throw new Error('the second detent re-selected the door instead of walking on: ' + S.activeBank);
});

step('⚠ SHIFT+jog steps the TRACK — the walk is the unshifted turn', () => {
    reset();
    S.bankCardLatched = true;
    shift(true); jog(1); globalThis.tick();
    if (S.activeTrack !== 3) throw new Error('the track did not step: ' + S.activeTrack);
    shift(false); globalThis.tick();
});

step('⭑ the bank card names its TRACK, so a latched card still says where you are', () => {
    /* ⚠ Compared PIXEL-FOR-PIXEL against a reference drawn by the same
     * primitive, because the alternative — asserting some ink exists — passes
     * on any header at all. The reference is the string the header is supposed
     * to be, so this also catches a prefix that is right but truncated. */
    reset();
    S.activeTrack = 4;
    S.activeBank = 1;                                 /* NOTE FX */
    S.bankCardLatched = true;   /* one law: only bank mode shows the card */                   /* card up, not the overview */
    fb.fill(0);
    render.drawUI();
    const got = fb.slice(0, FBW * 8);                 /* the 8px header band */

    fb.fill(0);
    /* 2026-09-05: the track moved to the FAR RIGHT with the instrument in
     * brackets, behind a sequencer glyph on the left — the whole band is the
     * reference now (no chevron shares it any more). */
    kit.drawKitBankHeader(BANKS[1].name, 'seq', 'T5[' + S.instrAbbrev + ']');
    const want = fb.slice(0, FBW * 8);

    for (let y = 0; y < 8; y++)
        for (let x = 0; x < FBW; x++) {
            const i = y * FBW + x;
            if (got[i] !== want[i])
                throw new Error('the header is not "♫ ' + BANKS[1].name + ' … T5[' + S.instrAbbrev +
                                ']" — first difference at x=' + x + ' y=' + y);
        }
});

step('⭑ a bank card draws NO rule under the header', () => {
    /* The segmented bank indicator went when the jog became a picker, and Josh
     * then took the line itself: the header is a filled white bar, so it
     * separates itself.
     * ⚠ RE-CONFIRMED 2026-08-30 after an indicator was added and removed again
     * in one sitting ("let's just get rid of the indicator row altogether").
     * This row must stay empty on a bank card.
     * ⚠ Measured, not eyeballed — with and without the rule the screen looks
     * near identical in a render, because row 7 is the bottom of the header bar
     * and the eye reads that as the line. */
    reset();
    S.activeBank = 1;
    S.bankCardLatched = true;   /* one law: only bank mode shows the card */
    fb.fill(0);
    render.drawUI();
    let ink = 0;
    for (let x = 0; x < FBW; x++) if (fb[kit.MV_BAR_Y * FBW + x]) ink++;
    if (ink) throw new Error('row ' + kit.MV_BAR_Y + ' has ' + ink + 'px of ink — ' +
                             'something is drawing a rule under the header again');
});

step('⚠ control: the same comparison FAILS without the prefix', () => {
    /* Otherwise the step above would pass against a header that never carried a
     * track at all, if the reference happened to be drawn the same way. */
    fb.fill(0);
    kit.drawKitBankHeader(BANKS[1].name, 'seq', '');
    const bare = fb.slice(0, FBW * 8);
    fb.fill(0);
    kit.drawKitBankHeader(BANKS[1].name, 'seq', 'T5[' + S.instrAbbrev + ']');
    const prefixed = fb.slice(0, FBW * 8);
    let same = true;
    for (let i = 0; i < bare.length; i++) if (bare[i] !== prefixed[i]) { same = false; break; }
    if (same) throw new Error('prefixed and bare headers render identically — the ' +
                              'comparison above cannot detect a missing prefix');
});

step('⭑ plain jog CLICK from the overview latches the bank card; Back unlatches and dismisses', () => {
    /* The latch moved from Shift+click to the plain click, context-gated on
     * the resting overview (Josh, 2026-08-31 — Front 2). The rest of this
     * step is unchanged: renderer honours the latch past the window's expiry,
     * Back dismisses without moving the bank. Gesture-grammar detail lives in
     * test_bank_click_latch.mjs. */
    reset();
    S.tickCount += 500; globalThis.tick();            /* let the window lapse: overview up */
    cc(3, 127); cc(3, 0); globalThis.tick();
    if (!S.bankCardLatched) throw new Error('plain click from the overview did not latch');
    S.tickCount += 500; globalThis.tick();
    /* ⚠ The window itself is EXPECTED to expire — the latch is a separate
     * reason to hold the screen, not a freeze on the timer. Asserting the
     * window survived is what let a mutation through: both mechanisms existed,
     * so removing either changed nothing. */
    /* ⭑ The screen, not the flag: the renderer has to honour the latch. */
    if (overviewIsUp())
        throw new Error('the track overview took the screen while LATCHED — the ' +
                        'flag survived but the renderer ignored it');
    const bankBefore = S.activeBank;
    cc(51, 127); cc(51, 0); globalThis.tick();        /* Back */
    if (S.bankCardLatched) throw new Error('Back did not unlatch');
    if (S.bankSelectTick >= 0) throw new Error('Back did not dismiss to the overview');
    if (!overviewIsUp())
        throw new Error('Back unlatched but the overview did not come back');
    if (S.activeBank !== bankBefore)
        throw new Error('Back MOVED the bank to ' + S.activeBank + ' — it dismisses the ' +
                        'screen now, it does not change where you are');
});

step('⭑ a drum track WALKS its own cycle, not the melodic one', () => {
    reset();
    S.bankCardLatched = true;
    S.trackPadMode[2] = 1;                            /* PAD_MODE_DRUM */
    const cyc = bankCycleForMode(1);
    /* One detent from wherever bank 0 sits in the DRUM order. */
    const want = cyc[cyc.indexOf(0) + 1];
    jog(1); globalThis.tick();
    if (S.activeBank !== want)
        throw new Error('landed on ' + S.activeBank + ', not the drum cycle step ' + want);
    S.trackPadMode[2] = 0;
});

step('⚠ Shift + a TOP-row pad no longer jumps to a bank (retired)', () => {
    /* The jog is the picker now; a second door addressed by pad POSITION, with
     * three parallel pad maps to keep in lockstep, is exactly what it replaced. */
    reset();
    S.activeBank = 3;
    shift(true);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 92, 127]));   /* top-row pad 0 */
    globalThis.tick();
    shift(false); globalThis.tick();
    if (S.activeBank !== 3)
        throw new Error('Shift+top-pad still moved the bank to ' + S.activeBank);
});

step('⚠ ...and Shift + a BOTTOM-row pad still selects the track', () => {
    /* The control for the step above: the pad path is alive, so "nothing
     * happened" up there is the retirement and not a dead handler. */
    reset();
    shift(true);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 68 + 5, 127]));  /* track 6 */
    globalThis.tick();
    shift(false); globalThis.tick();
    if (S.activeTrack !== 5)
        throw new Error('Shift+bottom-pad did not select the track: ' + S.activeTrack);
});

step('⭑⭑ NO bank header can reach the alt-param arrow, with the track prefix on', () => {
    /* ⚠ The arrow is drawn at x=121 INSIDE the header band, so the header does
     * not own the full width — and drawKitHeader trims to the full width by
     * default, which is how a long title slides underneath it. That was already
     * possible before the prefix; the prefix just made it near.
     *
     * Checked against EVERY bank name rather than the one that happens to be
     * longest today: the next name someone adds is the one that breaks it, and
     * it will be added by someone who never read this file. */
    /* ⚠ The budget is arithmetic, not taste: text from TEXT_X must end before
     * ARROW_X. 118px ends at x=119 and leaves column 120 clear. An earlier
     * version of this pin subtracted an invented 2px margin and then failed a
     * name that fits — a pin that is wrong in the SAFE direction still gets
     * loosened by whoever hits it. */
    const ARROW_X = 121, TEXT_X = 2;
    const budget = ARROW_X - TEXT_X - 1;
    /* ⚠⚠ Through bankDisplayName, for EVERY pad mode — not BANKS[].name. The
     * first version of this pin read the raw table and therefore never saw the
     * drum aliases, so it passed while a drum track's bank 5 header
     * ('REPEAT GROOVE', 131px with the prefix) was being trimmed on device. A
     * pin that checks the wrong strings is worse than none: it says the shape
     * is covered. */
    for (const padMode of [0, PAD_MODE_DRUM, PAD_MODE_CONDUCT]) {
    /* ⚠ Each pad mode's own CYCLE — the banks that track can actually reach.
     * Iterating every bank against every mode invents combinations navigation
     * cannot produce (a Conductor on AUTOMATION), and a pin that fails on an
     * unreachable case teaches people to loosen it.
     * ⭑ Known exception, accepted: CONVERTING a track to Conductor while it
     * sits on AUTOMATION leaves it on a bank outside the cycle, and
     * 'C-AUTOMATION' with the prefix is 125px — fitHdr trims it. Reachable only
     * that way, and the trim is graceful. */
    for (const b of bankCycleForMode(padMode)) {
        if (!BANKS[b] || !BANKS[b].name) continue;
        /* ⚠ BANK_SOUND is excluded, and only it: its screen is sound mode's own,
         * with its own header, so this name never reaches drawBankHeading. It
         * DOES appear in the picker list, which auto-sizes — that is where the
         * full 'SOUND + CONFIG' is read. Excluded by identity rather than by
         * length, so a genuinely too-long bank name cannot hide behind it. */
        if (b === BANK_SOUND) continue;
        for (const t of [0, 7]) {                  /* Tr1 and Tr8 */
            const hdr = ('Tr' + (t + 1) + ' - ' + bankDisplayName(padMode, b)).toUpperCase();
            const w = kit.hdrWidth(hdr);
            if (w > budget)
                throw new Error('"' + hdr + '" (pad mode ' + padMode + ') is ' + w +
                                'px, past the ' + budget + 'px the text may use before ' +
                                'the alt arrow at x=' + ARROW_X);
        }
    }
    }
});

step('⭑⭑ each track type shows ITS OWN bank names, in the picker and the header', () => {
    /* Josh, on device: "the picker names don't match bank names for drum
     * tracks." They were two sources — the drum aliases lived inline in the
     * render where nothing else could reach them.
     *
     * ⚠⚠ Spelled out as a TABLE, not as picker-vs-header. Both now call
     * bankDisplayName, so comparing them compares a function to itself: the
     * first version of this step did exactly that, passed, and let a mutation
     * deleting the bank-5 alias straight through. The expectations have to come
     * from outside the code under test. */
    const EXPECT = {
        0: { 0: 'CLIP', 1: 'NOTE FX', 5: 'LIVE ARP', 14: 'AUTOMATION', 12: 'STEP' },
        [PAD_MODE_DRUM]:    { 0: 'DRUM LANE', 1: 'NOTE FX', 5: 'RPT GROOVE',
                              14: 'AUTOMATION', 7: 'ALL LANES', 12: 'STEP' },
        [PAD_MODE_CONDUCT]: { 0: 'C-CONDUCT', 1: 'C-NOTE FX', 8: 'C-RESPONDER',
                              9: 'C-OCTAVE', 10: 'C-WHEN', 12: 'C-STEP' },
    };
    for (const mode of Object.keys(EXPECT)) {
        for (const bank of Object.keys(EXPECT[mode])) {
            const got = bankDisplayName(Number(mode), Number(bank));
            if (got !== EXPECT[mode][bank])
                throw new Error('pad mode ' + mode + ' bank ' + bank + ': got "' + got +
                                '", expected "' + EXPECT[mode][bank] + '"');
        }
    }
});

step('⚠ ...and the render calls that function rather than naming banks itself', () => {
    /* The aliases came back as a mismatch once because they were written inline
     * in one screen. A scan is what stops that recurring — the table above
     * cannot see a second source, only a wrong one. */
    const src = readFileSync('ui/ui_render.mjs', 'utf8');
    const strays = [];
    for (const line of src.split('\n')) {
        const code = line.trim();
        if (code.startsWith('*') || code.startsWith('/*') || code.startsWith('//')) continue;
        if (/'(DRUM LANE|RPT GROOVE|REPEAT GROOVE|C-CONDUCT)'/.test(code)) strays.push(code);
    }
    if (strays.length)
        throw new Error('the render names banks itself again:\n  ' + strays.join('\n  '));
});

step('⭑ the latch frame is RETIRED — a latched card draws exactly like a windowed one', () => {
    /* Josh, 2026-09-01: "since banks are always persistent now, we don't need
     * the bank border anymore." The strongest pin is EQUALITY: render the same
     * card latched and merely windowed, and the framebuffers must match — any
     * frame, any blink, any leftover edge shows up as a diff. Both blink
     * phases, so a phase-gated frame cannot hide. */
    reset();
    S.activeBank = 1;
    /* Under the one law only the latch shows the card at all, so the
     * equality is across BLINK PHASES of the latched card itself: any
     * phase-gated indicator shows up as a diff. */
    S.bankCardLatched = true; S.bankSelectTick = -1;
    S.tickCount = 0;  fb.fill(0); render.drawUI();
    const phase0 = fb.slice();
    S.tickCount = 24; fb.fill(0); render.drawUI();
    for (let i = 0; i < fb.length; i++)
        if (fb[i] !== phase0[i])
            throw new Error('the latched card differs across blink phases at px ' + i +
                            ' — a blinking latch indicator is back');
    S.bankCardLatched = false;
});
step('⚠ the latch frame does not sit ON the params', () => {
    /* The body was shifted up into the reclaimed rule space so the frame has a
     * row of its own. Measured, because a frame touching the labels looks
     * identical to one clipping them — I misread it as clipping twice. */
    reset();
    S.activeBank = 1;
    S.bankCardLatched = true;   /* one law: only bank mode shows the card */
    S.bankCardLatched = false;
    fb.fill(0); render.drawUI();
    /* ⚠ The scan stops ABOVE the rule row. Below it is chrome — the rule itself
     * and then the hint pills, which deliberately reach the bottom scanline and
     * the right edge — so including either would fail this on the things that
     * are meant to be there. The assertion is unchanged in substance: nothing
     * the CARD draws may touch the frame. */
    let lowest = -1;
    for (let y = 0; y < MV_RULE_Y; y++)
        for (let x = 0; x < FBW; x++)
            if (fb[y * FBW + x]) { lowest = y; break; }
    if (lowest >= MV_RULE_Y)
        throw new Error('card content reaches row ' + lowest + ', where the frame ' +
                        'draws — they would overlap');
    for (let y = FRAME_TOP + 1; y < MV_RULE_Y; y++)
        if (fb[y * FBW] || fb[y * FBW + 127])
            throw new Error('content touches column 0/127 at row ' + y + ' — the ' +
                            'frame edges would cut through it');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
