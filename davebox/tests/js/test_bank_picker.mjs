/* THE JOG IS THE BANK PICKER in track view (Josh, 2026-08-25). A turn opens the
 * kit's list overlay over the page you were on, turns move a selection, and
 * letting go of the jog TOUCH commits. Shift+jog goes back to stepping tracks.
 *
 * ⚠ A turn is TOUCH, turn, RELEASE — you cannot turn the wheel without touching
 * it, which is what lets the gesture commit without a modifier. A test that
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
globalThis.set_pixel = _px;
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.text_width = (t) => String(t).length * 6;
/* ⚠⚠ tick() swallows errors — a missing binding kills every later stage. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANK_SOUND } = await import('../../ui/ui_constants.mjs');
const { bankCycleForMode } = await import('../../ui/ui_pure.mjs');
const snd = await import('../../ui/ui_sound.mjs');
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
/* One complete turn of the wheel: touch, detent, release. */
const turn  = (d) => { touch(true); jog(d); globalThis.tick(); touch(false); globalThis.tick(); };

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

step('⭑ letting go of the jog COMMITS the selection', () => {
    reset();
    const cyc = bankCycleForMode(0);
    touch(true); jog(1); jog(1); globalThis.tick();
    const want = cyc[S.bankPickerSel];
    if (S.activeBank === want) throw new Error('control: it applied before the release');
    touch(false); globalThis.tick();
    if (S.activeBank !== want) throw new Error('landed on ' + S.activeBank + ', expected ' + want);
    if (S.trackActiveBank[2] !== want)
        throw new Error('the per-track record did not follow: ' + S.trackActiveBank[2]);
    if (S.bankPickerSel >= 0) throw new Error('the picker stayed open after the release');
});

step('⭑ the picked bank LINGERS on screen — the release must not wipe its window', () => {
    /* The jog-touch release also stands the bank display down. On a commit that
     * would make the bank you just chose vanish as you let go. */
    reset();
    turn(1);
    if (S.bankSelectTick < 0)
        throw new Error('the release cleared the display window — the picked bank ' +
                        'never gets shown');
});

step('⭑ picking SOUND + CONFIG enters it, and keeps its display window', () => {
    reset();
    const cyc = bankCycleForMode(0);
    touch(true);
    for (let i = 0; i < cyc.length; i++) jog(1);      /* to the end = SOUND + CONFIG */
    globalThis.tick();
    if (cyc[S.bankPickerSel] !== BANK_SOUND) throw new Error('control: not on SOUND + CONFIG');
    if (snd.soundActive()) throw new Error('it entered while merely scrolling past');
    touch(false); globalThis.tick();
    if (!snd.soundActive()) throw new Error('the release did not open the screen');
    if (S.bankSelectTick < 0)
        throw new Error('the deferred entry lost its display window');
    snd.soundExit();
});

step('⚠ a touchless turn still commits, on settle — the overlay cannot strand', () => {
    /* The capacitive read can miss a flick and the remote UI has no wheel; a
     * picker with no way to close would swallow the jog forever. */
    reset();
    jog(1); globalThis.tick();                        /* no touch at all */
    if (S.bankPickerSel < 0) throw new Error('control: the picker did not open');
    S.tickCount += 500; globalThis.tick();
    if (S.bankPickerSel >= 0) throw new Error('the picker never settled — it is stranded');
    if (S.activeBank === 0) throw new Error('settling did not apply the selection');
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
    if (S.activeBank !== bankBefore)
        throw new Error('the later touch release committed the abandoned pick');
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
    touch(false); globalThis.tick();
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
    const ARROW_X = 121, TEXT_X = 2, GAP = 2;
    const budget = ARROW_X - TEXT_X - GAP;
    for (let b = 0; b < BANKS.length; b++) {
        if (!BANKS[b] || !BANKS[b].name) continue;
        /* ⚠ BANK_SOUND is excluded, and only it: its screen is sound mode's own,
         * with its own header, so this name never reaches drawBankHeading. It
         * DOES appear in the picker list, which auto-sizes — that is where the
         * full 'SOUND + CONFIG' is read. Excluded by identity rather than by
         * length, so a genuinely too-long bank name cannot hide behind it. */
        if (b === BANK_SOUND) continue;
        for (const t of [0, 7]) {                  /* Tr1 and Tr8 */
            const hdr = ('Tr' + (t + 1) + ' - ' + BANKS[b].name).toUpperCase();
            const w = kit.hdrWidth(hdr);
            if (w > budget)
                throw new Error('"' + hdr + '" is ' + w + 'px, past the ' + budget +
                                'px the text may use before the alt arrow at x=' +
                                ARROW_X + ' — it would be trimmed or drawn under it');
        }
    }
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
