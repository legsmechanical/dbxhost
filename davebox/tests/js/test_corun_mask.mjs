/* tests/js/test_corun_mask.mjs — the co-run keep-mask declares the RULED
 * split (CORUN_PASSTHROUGH.md, Josh 2026-08-24), with the real group bits.
 *
 * The trap this pins: bit 3 is the RETIRED single-bit TRANSPORT — the host
 * classifier never returns it, so "keeping" it keeps nothing. davebox
 * carried it from the mask's birth until 2026-08-24, and Play/Rec/Loop were
 * silently ceded to Move during co-run while the mask READ as if transport
 * was kept. A mask is a contract with a header file; test the bits, not the
 * names. */

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

import { readFileSync } from 'fs';

let opened = null;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = (id, opts) => { opened = { id, opts }; return true; };
globalThis.host_close_service = () => true;
globalThis.move_midi_inject_to_move = () => {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {}; globalThis.set_pixel = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.move_midi_internal_send = () => {}; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

/* shadow_constants.h — the authority. Values copied, then PINNED against the
 * header text below so a drift fails here instead of on the device. */
const GRP = { PADS: 1 << 1, STEPS: 1 << 2, DEAD_TRANSPORT: 1 << 3, JOG: 1 << 4,
    TRACK: 1 << 5, KNOBS: 1 << 6, MASTER: 1 << 7, SHIFT: 1 << 8, BACK: 1 << 9,
    MENU: 1 << 10, TOUCH: 1 << 11, MUTE: 1 << 12, PLAY: 1 << 13, REC: 1 << 14,
    KEEP_BACK: 1 << 15, SAMPLE: 1 << 16, LOOP: 1 << 17, COPY: 1 << 18, DELETE: 1 << 19 };

async function main() {
const { readFileSync } = await import('fs');
const { S } = await import('../../ui/ui_state.mjs');
const corun = await import('../../ui/ui_corun.mjs');

step('header pin: the copied group values match src/host/shadow_constants.h', () => {
    const h = readFileSync('../src/host/shadow_constants.h', 'utf8');
    for (const [name, val, macro] of [
        ['SHIFT', GRP.SHIFT, 'CORUN_GRP_SHIFT'], ['PLAY', GRP.PLAY, 'CORUN_GRP_PLAY'],
        ['REC', GRP.REC, 'CORUN_GRP_REC'], ['SAMPLE', GRP.SAMPLE, 'CORUN_GRP_SAMPLE'],
        ['LOOP', GRP.LOOP, 'CORUN_GRP_LOOP'], ['COPY', GRP.COPY, 'CORUN_GRP_COPY'],
        ['DELETE', GRP.DELETE, 'CORUN_GRP_DELETE'], ['MUTE', GRP.MUTE, 'CORUN_GRP_MUTE'],
    ]) {
        const m = h.match(new RegExp(macro + '\\s+\\(1u << (\\d+)\\)'));
        if (!m) throw new Error(macro + ' not found in the header');
        if ((1 << parseInt(m[1], 10)) !== val)
            throw new Error(name + ': header says bit ' + m[1]);
    }
});

step('move-native declares the ruled split', () => {
    S.sessionView = false; S.moveCoRunTrack = -1;
    S.trackChannel[2] = 1; S.trackRoute[2] = 1;
    corun.enterMoveNativeCoRun(2, 'track');
    if (!opened || opened.id !== 'move_native') throw new Error('service not opened');
    const m = opened.opts.keep_mask;
    /* RE-RULED by Josh 2026-08-24, after living with the first cut: cede exactly
     * the instrument-editing controls, keep everything else "fully as it is
     * outside of co-run in track view". TRACK moved KEEP-side with that — they
     * are the clip buttons, and selecting clips is what they do everywhere
     * else. Shift stayed ours (no recalled use for it in Move's editor). */
    /* ⭑⭑ COPY and DELETE are KEPT because a pad-based gesture must live on the
     * same side as the PADS: Move's copy is hold-Copy, tap-source, tap-dest, so
     * ceding the button while keeping the pads hands Move a modifier it never
     * sees taps for and the gesture completes nowhere. Josh reported it as
     * copy not copying; Delete was his own correction.
     * ⚠ MUTE is still ceded and has the same defect — left as ruled, not
     * reversed unasked. If it ever moves, it moves for this reason. */
    const mustKeep = ['PADS', 'STEPS', 'MENU', 'SHIFT', 'TRACK',
                      'PLAY', 'REC', 'SAMPLE', 'LOOP', 'DELETE'];
    const mustCede = ['JOG', 'KNOBS', 'MASTER', 'BACK', 'TOUCH', 'MUTE'];
    for (const g of mustKeep) if (!(m & GRP[g])) throw new Error('does not keep ' + g);
    for (const g of mustCede) if (m & GRP[g]) throw new Error('keeps ' + g + ' (must cede)');
    if (m & GRP.DEAD_TRANSPORT)
        throw new Error('the RETIRED transport bit is back in the mask');
    if (!(m & GRP.KEEP_BACK)) throw new Error('lost the framework Back-exit opt-out');
});

step('the LED mask matches the keep mask — no lights/input split any more', () => {
    /* There used to be one: we owned CC 40-43's LIGHTS to blink a paired-track
     * indicator while their PRESSES ceded to Move. Both halves are ours now, so
     * a divergence here would mean a surface we light but cannot operate. */
    const m = opened.opts.led_keep_mask;
    if (m !== (opened.opts.keep_mask | GRP.TRACK))
        throw new Error('led mask drifted: ' + m + ' vs ' + (opened.opts.keep_mask | GRP.TRACK));
    if (!(opened.opts.keep_mask & GRP.TRACK))
        throw new Error('TRACK is lit but its presses cede — lights without input');
});

/* ── the LIT pad keeps its track colour in co-run ──────────────────────────
 *
 * Josh's other half of the same ruling: the inverted co-run pad scheme stays,
 * but "the last pressed pad" must still read as this track. Added because a
 * mutation proved it uncovered — flipping the lit pad back to White passed
 * every other test in the suite. Captured at the wire, the way the bank-jog
 * test does it: setLED emits [0x09, 0x90, note, color]. */
await import('../../ui/ui.js');          /* installs onMidiMessageInternal */
const ledsMod2 = await import('../../ui/ui_leds.mjs');
const constsMod2 = await import('../../ui/ui_constants.mjs');
const ifMod2 = await import('/data/UserData/schwung/shared/input_filter.mjs');

step('⭑ a sounding pad wears the TRACK colour in co-run, not white', () => {
    const { updateTrackLEDs, invalidateLEDCache, trackColor } = ledsMod2;
    const { TRACK_PAD_BASE, PAD_MODE_MELODIC_SCALE } = constsMod2;

    S.sessionView = false;
    S.activeTrack = 2;
    S.trackPadMode[2] = PAD_MODE_MELODIC_SCALE;
    S.activeBank = 0;                       /* not AUTO — that greys everything */
    S.ledInitComplete = true;
    /* init() builds this on-device only, and the melodic pad path reads it for
     * the track-arp latch check. */
    if (!S.bankParams)
        S.bankParams = Array.from({ length: 8 }, () =>
            Array.from({ length: 12 }, () => new Array(8).fill(0)));

    const colorsOfSounding = () => {
        const seen = {};
        ifMod2.clearAllLEDs();
        globalThis.move_midi_internal_send = (b) => {
            if (b && b[1] === 0x90 && b[2] >= TRACK_PAD_BASE && b[2] < TRACK_PAD_BASE + 32)
                seen[b[2]] = b[3];
        };
        invalidateLEDCache();
        updateTrackLEDs();
        globalThis.move_midi_internal_send = () => {};
        return seen;
    };

    /* Sound ONE pad, so exactly one LED can carry the lit colour. */
    const pitch = S.padNoteMap[0] + S.trackOctave[2] * 12;
    if (!(pitch >= 0 && pitch <= 127)) throw new Error('pad 0 has no usable pitch');
    S.liveActiveNotes = new Set([pitch]);

    S.moveCoRunTrack = -1;
    const outside = colorsOfSounding()[TRACK_PAD_BASE];
    S.moveCoRunTrack = 2;
    const inside = colorsOfSounding()[TRACK_PAD_BASE];
    S.moveCoRunTrack = -1;
    S.liveActiveNotes = new Set();

    const tc = trackColor(2);
    if (inside !== tc)
        throw new Error('lit pad in co-run is ' + inside + ', expected track colour ' + tc +
                        (inside === outside ? ' (it is still painting the non-co-run white)' : ''));
    if (outside === inside)
        throw new Error('control failed: co-run and normal look identical, so this proves nothing');
});

/* ── Copy is FORWARDED to Move in co-run ───────────────────────────────────
 *
 * Josh: "mute + pad works to mute move pads natively. so copy should too,
 * right?" It could not, and no mask setting would have fixed it — the
 * framework's legacy carve-out keeps the EDIT group (Copy/Delete/Undo/Capture)
 * with the TOOL regardless of keep_mask, so Move never saw CC 60. Mute works
 * because CC 88 is outside that group AND pad presses are already injected. So
 * Copy takes the same road: inject it.
 *
 * ⚠ Two halves, and the second is the one that would rot silently: forwarding
 * WITHOUT standing our own gesture down would run both copies off one press. */
step('⭑ co-run FORWARDS Copy to Move, and stands our own copy gesture down', () => {
    const sent = [];
    const prev = globalThis.move_midi_inject_to_move;
    globalThis.move_midi_inject_to_move = (b) => { sent.push(Array.from(b)); };

    S.sessionView = false;
    S.moveCoRunTrack = 2;
    S.copyHeld = false; S.copySrc = null;
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 60, 127]));

    globalThis.move_midi_inject_to_move = prev;
    S.moveCoRunTrack = -1;

    const copyMsg = sent.find((m) => m[1] === 0xB0 && m[2] === 60);
    if (!copyMsg)
        throw new Error('Copy was not forwarded to Move — it stays with the tool ' +
                        'by carve-out, so nothing native can ever see it');
    if (copyMsg[3] !== 127)
        throw new Error('forwarded the wrong value: ' + copyMsg[3]);
    if (S.copyHeld)
        throw new Error('our own copy gesture armed too — one press, two copies');
});

step('⚠ CONTROL: outside co-run, Copy is OURS and is not forwarded', () => {
    /* Without this the step above passes just as well against a Copy handler
     * that forwards unconditionally and never works anywhere. */
    const sent = [];
    const prev = globalThis.move_midi_inject_to_move;
    globalThis.move_midi_inject_to_move = (b) => { sent.push(Array.from(b)); };

    S.moveCoRunTrack = -1;
    S.copyHeld = false;
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 60, 127]));

    globalThis.move_midi_inject_to_move = prev;
    if (sent.some((m) => m[1] === 0xB0 && m[2] === 60))
        throw new Error('Copy is forwarded to Move OUTSIDE co-run');
    if (!S.copyHeld)
        throw new Error('Copy no longer arms our own gesture outside co-run');
    S.copyHeld = false;
});

/* ── co-run lands on a CLIP bank ───────────────────────────────────────────
 *
 * Josh, 2026-08-24: "entering co-run should always land on a clip bank."
 *
 * ⭑ This is the resolution of the "step buttons do nothing in co-run" report,
 * and it was NOT an input bug. Instrumentation showed the presses arriving
 * fine, no modifier stuck — and `bank=6`, AUTOMATION. Steps there edit
 * automation lanes, so with no lane armed the row is silently inert. Co-run is
 * reached through SOUND + CONFIG, which sits one jog PAST automation, so the
 * bank underneath was reliably the one that makes steps look dead.
 *
 * ⚠ trackActiveBank must move too: soundExit and every track-switch site
 * restore activeBank from it, so setting only the live value gets undone by
 * whichever runs first. */
step('⭑ entering co-run lands on the CLIP bank, not whatever was underneath', () => {
    S.sessionView = false;
    S.moveCoRunTrack = -1;
    S.activeTrack = 2;
    S.trackChannel[2] = 1; S.trackRoute[2] = 1;
    S.activeBank = 6;                       /* AUTOMATION — what SOUND + CONFIG leaves behind */
    S.trackActiveBank[2] = 6;

    corun.enterMoveNativeCoRun(2, 'sound');

    if (S.activeBank !== 0)
        throw new Error('co-run kept bank ' + S.activeBank +
                        (S.activeBank === 6 ? ' (AUTOMATION — steps edit lanes, row reads dead)' : ''));
    if (S.trackActiveBank[2] !== 0)
        throw new Error('trackActiveBank still ' + S.trackActiveBank[2] +
                        ' — soundExit or a track switch would put the old bank straight back');
    S.moveCoRunTrack = -1;
});

/* ── Undo and Capture are NOT forwarded — a RULING, not an omission ────────
 *
 * Copy takes the injection road out of the legacy carve-out (above). The
 * obvious next move is to "finish the set" with the other two EDIT-group
 * buttons, and Josh ruled on 2026-08-25 that neither goes:
 *
 *   · UNDO — dAVEBOx KEEPS CORUN_GRP_SHIFT in co-run, so Move firmware never
 *     sees Shift held. A forwarded Shift+Undo would land on Move as a PLAIN
 *     undo and redo would be unreachable; injecting a synthetic Shift is the
 *     scheme that double-tap-latched Move's own Shift.
 *   · CAPTURE — Capture+scene row and Capture+pad (drum-lane select) would have
 *     to be surrendered in co-run, and the drum case IS the co-run case.
 *
 * ⚠ These steps assert the NEGATIVE, so each also asserts that our own handler
 * still ran — otherwise they would pass just as well against a handler that
 * was deleted or that returned early. */
step('⭑ co-run does NOT forward Undo — it stays dAVEBOx\'s, and ours still runs', () => {
    const sent = [];
    const prev = globalThis.move_midi_inject_to_move;
    globalThis.move_midi_inject_to_move = (b) => { sent.push(Array.from(b)); };

    S.sessionView = false;
    S.moveCoRunTrack = 2;
    S.shiftHeld = false;
    S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 56, 127]));

    globalThis.move_midi_inject_to_move = prev;
    S.moveCoRunTrack = -1;

    if (sent.some((m) => m[1] === 0xB0 && m[2] === 56))
        throw new Error('Undo was forwarded to Move — ruled against 2026-08-25 ' +
                        '(Move never sees our Shift, so redo would be unreachable)');
    if (S.undoAvailable || !S.redoAvailable)
        throw new Error('our own undo did not run in co-run, so the negative above ' +
                        'proves nothing');
});

step('⭑ co-run does NOT forward Capture — the modifier gestures stay ours', () => {
    const sent = [];
    const prev = globalThis.move_midi_inject_to_move;
    globalThis.move_midi_inject_to_move = (b) => { sent.push(Array.from(b)); };

    S.sessionView = false;
    S.moveCoRunTrack = 2;
    S.captureHeld = false;
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 52, 127]));

    globalThis.move_midi_inject_to_move = prev;
    S.moveCoRunTrack = -1;

    if (sent.some((m) => m[1] === 0xB0 && m[2] === 52))
        throw new Error('Capture was forwarded to Move — ruled against 2026-08-25 ' +
                        '(Capture+row and Capture+pad would be lost in co-run)');
    if (!S.captureHeld)
        throw new Error('our own Capture hold did not arm in co-run, so the negative ' +
                        'above proves nothing');
    S.captureHeld = false;
});

/* ── Shift+Note/Session no longer OPENS anything ───────────────────────────
 *
 * Josh, 2026-08-24: "I want to retire shift+menu to enter sound mode now that
 * we have that bank set up" — SOUND + CONFIG (track view) and MASTER + SEND FX
 * (session view) are both jog banks now, so the gesture was a second door to a
 * place the jog already reaches, and having two doors is what let people enter
 * co-run by a route that skipped the bank walk.
 *
 * ⚠ Source-pinned rather than driven: the opener is GONE, and a dispatch test
 * can only show that nothing happened — which is equally true if the whole
 * handler broke. The pin names the two things that must not come back. */
step('⚠ Shift+Note/Session opens neither sound mode nor the session buses', () => {
    const src = readFileSync('ui/ui_input_cc.mjs', 'utf8');
    const i = src.indexOf('if (d1 === MoveNoteSession)');
    if (i < 0) throw new Error('the Note/Session handler moved — re-anchor this pin');
    /* ⚠⚠ The window is bounded by the NEXT HANDLER, not by a character count.
     * It used to be `slice(i, i + 4000)`, and on 2026-08-26 a comment added
     * inside this handler pushed `soundExit()` to offset 3999 — one character
     * past the edge — so the pin failed against a tree where the closer was
     * present and working. A pin whose window is a magic number reports on how
     * much PROSE it is looking at, not on the code.
     * [[source-pins-must-read-code-not-prose]] */
    const nextHandler = src.indexOf('if (d1 === MoveLoop', i);
    if (nextHandler < 0)
        throw new Error('cannot bound the Note/Session handler — the sibling anchor ' +
                        '(MoveLoop) moved, so this pin no longer knows where it ends');
    const body = src.slice(i, nextHandler);
    if (/pendingSoundEnterTrack\s*=/.test(body))
        throw new Error('Shift+Note opens sound mode again — the bank walk is the only door');
    if (/pendingBusMenu\s*=\s*true/.test(body))
        throw new Error('Shift+Note opens the session buses again');
    if (!/soundExit\(\)/.test(body))
        throw new Error('it no longer CLOSES either — that half was deliberately kept');
    /* The 2026-08-26 root exception: the closer must be GATED, not unconditional,
     * or SOUND + CONFIG eats the press that was meant to open the generator. */
    if (!/soundAtBlockRoot\(\)/.test(body))
        throw new Error('the closer is unconditional again — sitting on SOUND + CONFIG ' +
                        'would spend the press closing the screen the gesture opens FROM');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
