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

import { readFileSync } from 'node:fs';

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANK_SOUND } = await import('../../ui/ui_constants.mjs');
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
    S.sessionView = false; S.globalMenuOpen = false;
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
    S.awaitingProjectSelect = false; S.loopHeld = false; S.shiftHeld = false;
    S.bankPickerSel = -1; S.bankPickerIdleTick = -1; S.bankCardLatched = false;
    S.activeTrack = 2; S.activeBank = 0;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackPadMode[t] = 0; S.trackActiveBank[t] = 0; }
    if (!S.bankParams) S.bankParams = Array.from({ length: 8 }, () =>
        Array.from({ length: 12 }, () => new Array(8).fill(0)));
}

step('⭑ a jog turn opens the picker and does NOT change the bank yet', () => {
    reset();
    touch(true); jog(1); globalThis.tick();
    if (S.bankPickerSel < 0) throw new Error('the picker did not open on the turn');
    if (S.activeBank !== 0)
        throw new Error('the bank changed to ' + S.activeBank + ' while browsing');
    touch(false); globalThis.tick();
});

step('⭑ the CLICK commits the selection', () => {
    reset();
    const cyc = bankCycleForMode(0);
    touch(true); jog(1); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    if (S.activeBank === want) throw new Error('control: it applied before the click');
    click();
    if (S.activeBank !== want) throw new Error('landed on ' + S.activeBank + ', expected ' + want);
    if (S.trackActiveBank[2] !== want)
        throw new Error('the per-track record did not follow: ' + S.trackActiveBank[2]);
    if (S.bankPickerSel >= 0) throw new Error('the picker stayed open after the click');
    touch(false); globalThis.tick();
});

step('⭑ letting go ALSO commits — the other natural end of the gesture', () => {
    reset();
    const cyc = bankCycleForMode(0);
    touch(true); jog(1); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    if (S.activeBank === want) throw new Error('control: it applied before the release');
    touch(false); globalThis.tick();
    if (S.activeBank !== want)
        throw new Error('the release did not commit: landed on ' + S.activeBank);
    if (S.bankPickerSel >= 0) throw new Error('the picker stayed open after the release');
});

step('⭑ the picked bank LINGERS after a release-commit', () => {
    /* ⚠ The release's own teardown stands the display window down, and it runs
     * AFTER the commit armed it — the bug that bit three times. It is the
     * OWNER that declines a same-pass teardown, not this path, which is why
     * adding release-commit back needed no new guard. */
    reset();
    touch(true); jog(1); globalThis.tick();
    touch(false); globalThis.tick();
    if (S.bankSelectTick < 0)
        throw new Error('the picked bank has no display window — the release wiped ' +
                        'what its own commit had just armed');
});

step('⚠ a click then its release does NOT apply twice', () => {
    /* Both gestures commit, so the ordinary case fires both. The click closes
     * the picker, so the release finds nothing — but if it did not, the second
     * apply would land on a selection index into a stale cycle. */
    reset();
    const cyc = bankCycleForMode(0);
    touch(true); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    click();
    if (S.bankPickerSel >= 0) throw new Error('control: the click left the picker open');
    touch(false); globalThis.tick();
    if (S.activeBank !== want)
        throw new Error('the bank moved again on the release: ' + S.activeBank);
});

step('⭑ the picked bank stays on screen — you are still touching the wheel', () => {
    /* The ergonomic point of committing on the click: you never let go, so the
     * card is up under your finger instead of needing a re-touch to look at. */
    reset();
    touch(true); jog(1); globalThis.tick();
    click();
    if (S.bankSelectTick < 0) throw new Error('the picked bank has no display window');
    if (!S.jogTouched) throw new Error('the click ended the touch — the card will drop');
    touch(false); globalThis.tick();
});

step('⭑ picking SOUND + CONFIG enters it, and keeps its display window', () => {
    reset();
    const cyc = bankCycleForMode(0);
    touch(true);
    for (let i = 0; i < cyc.length; i++) jog(1);      /* to the end = SOUND + CONFIG */
    globalThis.tick();
    if (cyc[S.bankPickerSel] !== BANK_SOUND) throw new Error('control: not on SOUND + CONFIG');
    if (snd.soundActive()) throw new Error('it entered while merely scrolling past');
    click();
    if (!snd.soundActive()) throw new Error('the click did not open the screen');
    touch(false);
    if (S.bankSelectTick < 0)
        throw new Error('the deferred entry lost its display window');
    snd.soundExit();
});

step('⚠ a touchless turn settles CLOSED, and applies nothing', () => {
    /* The capacitive read can miss a flick and the remote UI has no wheel, so a
     * picker with no way to close would swallow the jog forever. ⚠ It closes
     * without choosing: a timeout is the one caller that fires with nobody
     * asking, and committing there meant a forgotten picker changed your bank. */
    reset();
    const before = S.activeBank;
    jog(1); globalThis.tick();                        /* no touch at all */
    if (S.bankPickerSel < 0) throw new Error('control: the picker did not open');
    S.tickCount += 500; globalThis.tick();
    if (S.bankPickerSel >= 0) throw new Error('the picker never settled — it is stranded');
    if (S.activeBank !== before)
        throw new Error('the timeout APPLIED a bank (' + S.activeBank + ') — only the ' +
                        'click may do that');
});

step('⚠ SHIFT+jog steps the TRACK again — the picker is the unshifted turn', () => {
    reset();
    shift(true); jog(1); globalThis.tick();
    if (S.bankPickerSel >= 0) throw new Error('Shift+jog opened the picker');
    if (S.activeTrack !== 3) throw new Error('the track did not step: ' + S.activeTrack);
    shift(false); globalThis.tick();
});

step('⭑ Shift+jog DROPS an open picker — and does not commit it', () => {
    /* Pressing Shift means the wheel is choosing a TRACK now. Leaving the bank
     * list up while it scrolls underneath is a lie about what the jog is doing;
     * committing it would apply a pick the user walked away from. */
    reset();
    const bankBefore = S.activeBank;
    touch(true); jog(1); globalThis.tick();          /* picker open, browsing */
    if (S.bankPickerSel < 0) throw new Error('control: the picker did not open');
    shift(true); jog(1); globalThis.tick();
    if (S.bankPickerSel >= 0)
        throw new Error('the picker survived under a track switch');
    if (S.activeBank !== bankBefore)
        throw new Error('dropping the picker COMMITTED it — the bank moved to ' +
                        S.activeBank);
    if (S.activeTrack !== 3) throw new Error('the track did not step: ' + S.activeTrack);
    shift(false); touch(false); globalThis.tick();
    /* ⚠ The release commits an OPEN picker, so this also proves the drop really
     * closed it — an abandoned pick must not be resurrected by letting go. */
    if (S.activeBank !== bankBefore)
        throw new Error('the release resurrected the abandoned pick: ' + S.activeBank);
});

step('⭑ the bank card names its TRACK, so a latched card still says where you are', () => {
    /* ⚠ Compared PIXEL-FOR-PIXEL against a reference drawn by the same
     * primitive, because the alternative — asserting some ink exists — passes
     * on any header at all. The reference is the string the header is supposed
     * to be, so this also catches a prefix that is right but truncated. */
    reset();
    S.activeTrack = 4;
    S.activeBank = 1;                                 /* NOTE FX */
    S.bankSelectTick = S.tickCount;                   /* card up, not the overview */
    fb.fill(0);
    render.drawUI();
    const got = fb.slice(0, FBW * 8);                 /* the 8px header band */

    fb.fill(0);
    kit.drawKitHeader('Tr5 - ' + BANKS[1].name, false, 117);
    const want = fb.slice(0, FBW * 8);

    /* ⚠ Text region only: the header's RIGHT edge carries the page-position bar
     * and the alt arrow (drawBankHeaderRight), which the reference does not
     * draw. Comparing the whole band reports those as a mismatch at x=121. */
    const TEXT_W = 118;
    for (let y = 0; y < 8; y++)
        for (let x = 0; x < TEXT_W; x++) {
            const i = y * FBW + x;
            if (got[i] !== want[i])
                throw new Error('the header is not "Tr5 - ' + BANKS[1].name + '" — first ' +
                                'difference at x=' + x + ' y=' + y);
        }
});

step('⭑ a bank card draws NO rule under the header', () => {
    /* The segmented bank indicator went when the jog became a picker, and Josh
     * then took the line itself: the header is a filled white bar, so it
     * separates itself.
     * ⚠ Measured, not eyeballed — with and without the rule the screen looks
     * near identical in a render, because row 7 is the bottom of the header bar
     * and the eye reads that as the line. */
    reset();
    S.activeBank = 1;
    S.bankSelectTick = S.tickCount;
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
    kit.drawKitHeader(BANKS[1].name, false, 117);
    const bare = fb.slice(0, FBW * 8);
    fb.fill(0);
    kit.drawKitHeader('Tr5 - ' + BANKS[1].name, false, 117);
    const prefixed = fb.slice(0, FBW * 8);
    let same = true;
    for (let i = 0; i < bare.length; i++) if (bare[i] !== prefixed[i]) { same = false; break; }
    if (same) throw new Error('prefixed and bare headers render identically — the ' +
                              'comparison above cannot detect a missing prefix');
});

step('⭑ Shift + jog CLICK latches the bank card; Back unlatches and dismisses', () => {
    reset();
    turn(1);                                          /* land on a bank */
    shift(true); cc(3, 127); cc(3, 0); globalThis.tick(); shift(false);
    if (!S.bankCardLatched) throw new Error('Shift+click did not latch');
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

step('⭑ a drum track offers ITS cycle, not the melodic one', () => {
    reset();
    S.trackPadMode[2] = 1;                            /* PAD_MODE_DRUM */
    const cyc = bankCycleForMode(1);
    touch(true); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    click(); touch(false); globalThis.tick();
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
        0: { 0: 'CLIP', 1: 'NOTE FX', 5: 'LIVE ARP', 6: 'AUTOMATION' },
        [PAD_MODE_DRUM]:    { 0: 'DRUM LANE', 1: 'NOTE FX', 5: 'RPT GROOVE',
                              6: 'AUTOMATION', 7: 'ALL LANES' },
        [PAD_MODE_CONDUCT]: { 0: 'C-CONDUCT', 1: 'C-NOTE FX', 8: 'C-RESPONDER',
                              9: 'C-OCTAVE', 10: 'C-WHEN' },
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

step('⭑ the LATCH draws a frame around the params, and only when latched', () => {
    /* The visible half of the latch. ⚠ Asserted on the FRAME EDGES rather than
     * "the screen changed": a card redraws for many reasons, and only the edges
     * are the indicator. */
    /* ⚠⚠ THE BOTTOM EDGE IS NO LONGER PART OF THE LATCH'S IDENTITY. It lands on
     * MV_RULE_Y, and since 2026-08-29 the footer rule draws a solid hairline
     * there on EVERY bank page — so counting that row would report a frame on
     * an unlatched card and this assertion would fail on the rule doing its
     * job. The frame is identified by its TOP row and its two SIDE columns,
     * which nothing else draws; the shared bottom row gets its own checks
     * below, so nothing is dropped, only moved. */
    const edgeInk = () => {
        let n = 0;
        for (let x = 0; x < FBW; x++) if (fb[FRAME_TOP * FBW + x]) n++;
        /* ⚠ Stops ABOVE FRAME_BOT (=== MV_RULE_Y), so the side counts stay
         * comparable between the two phases and the bottom edge is measured on
         * its own below. */
        for (let y = FRAME_TOP; y < MV_RULE_Y; y++) { if (fb[y * FBW]) n++; if (fb[y * FBW + 127]) n++; }
        return n;
    };
    /* Ink on the frame's BOTTOM EDGE row.
     * ⚠ This used to also assert a footer RULE lived here in both states. The
     * rule was RETIRED 2026-08-30 (Josh, on the device — see the note in
     * ui_movy.mjs), so the row now carries the latch frame and nothing else,
     * and an unlatched card is legitimately empty here. */
    const bottomEdgeInk = () => { let n = 0; for (let x = 0; x < FBW; x++) if (fb[MV_RULE_Y * FBW + x]) n++; return n; };
    reset();
    S.activeBank = 1;
    S.bankSelectTick = S.tickCount;
    fb.fill(0); render.drawUI();
    if (edgeInk() !== 0)
        throw new Error('an UNLATCHED card already draws a frame — the indicator ' +
                        'would mean nothing');

    if (bottomEdgeInk() !== 0)
        throw new Error('an UNLATCHED card draws ink on the frame row (' +
                        bottomEdgeInk() + 'px) — the footer rule is retired, so ' +
                        'nothing but the latch frame may draw there');

    S.bankCardLatched = true;
    S.tickCount = 0;  fb.fill(0); render.drawUI();
    const solid = edgeInk();
    const solidRule = bottomEdgeInk();
    S.tickCount = 24; fb.fill(0); render.drawUI();
    const dashed = edgeInk();
    /* ⚠⚠ THE DASHED PHASE MUST READ AS DASHED ON THE BOTTOM EDGE TOO. When a
     * solid footer rule still shared this row, a dashed edge that only SET ink
     * left the rule showing through every gap and looked solid in both phases —
     * the animation dying on one edge with nothing to say so. drawKitLatchBox
     * knocks its gaps out for exactly that reason. The rule is gone, but the
     * knock-out is still what makes the phases differ here, so keep asserting
     * the result rather than trusting it. */
    const dashedRule = bottomEdgeInk();
    if (!(dashedRule < solidRule))
        throw new Error('the latch frame\'s bottom edge does not read as dashed (' +
                        solidRule + ' vs ' + dashedRule + ') — it is not knocking ' +
                        'its gaps out');
    if (!solid || !dashed) throw new Error('the latch frame did not draw: ' +
                                           JSON.stringify({ solid, dashed }));
    /* ⭑ It alternates SOLID <-> SEGMENTED rather than blinking out: a frame that
     * vanishes makes the page twitch. So both phases have ink, and the dashed
     * one has meaningfully less. */
    if (dashed >= solid)
        throw new Error('the two phases are not solid vs segmented (' + solid +
                        ' vs ' + dashed + ') — it is not animating, or it blinks out');
    S.bankCardLatched = false;
});

step('⚠ the latch frame does not sit ON the params', () => {
    /* The body was shifted up into the reclaimed rule space so the frame has a
     * row of its own. Measured, because a frame touching the labels looks
     * identical to one clipping them — I misread it as clipping twice. */
    reset();
    S.activeBank = 1;
    S.bankSelectTick = S.tickCount;
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
