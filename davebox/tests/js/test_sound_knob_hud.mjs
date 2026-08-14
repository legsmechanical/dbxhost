/* tests/js/test_sound_knob_hud.mjs — the knob HUD in sound mode's non-EDIT
 * screens: touch orients, turn reveals, Shift+touch jumps to the assign flow.
 *
 * Josh's 08-10 spec. Outside a module's editor the eight physical knobs drive
 * the SLOT's knob assignments (soundOnCC forwards them as relative CCs to the
 * chain DSP), and nothing on screen said which knob was which — you turned one
 * and listened. The failure modes this file exists for are all silent:
 *
 *   - the HUD appears where the knobs DON'T forward (a bus, a module editor),
 *     so it names a mapping the knob is not driving
 *   - it appears over the assign screens it duplicates, covering them
 *   - Shift+touch lands on the assign flow for the WRONG knob
 *   - the assignment is re-read on every touch — eight round trips at ~2.9 ms
 *     each, from a sequencer's tick
 *   - the cache survives a retarget, naming the previous track's mapping
 *   - the value read-back fires per detent instead of on a bounded cadence
 *
 * Two observables, deliberately: `soundKnobHudForTest()` pins the CONTENT
 * decision (the card's text goes down one set_pixel at a time, so no render
 * stub can read it back), and a real `soundRender()` with pixel counting pins
 * that the draw path executes and puts the card down. Neither alone is enough
 * — the first cannot catch a scope error in the draw path, the second cannot
 * tell SYNTH from UNASSIGNED.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

/* ---- host surface ---- */

/* Every shadow_get_param that reaches us, so the round-trip COUNT is testable
 * — "is it cached" is a cost question and cost is the whole reason the reads
 * are deferred to tick in the first place. */
let reads = [];
const ASSIGN = {
    'knob_1_target': 'synth', 'knob_1_param': 'cutoff',
    'knob_3_target': 'fx2',   'knob_3_param': 'room_size',
    /* knob 5 is deliberately unassigned: both keys answer empty. */
    'synth:cutoff': '0.4830',
    'fx2:room_size': '0.75',
    /* A loaded synth, so a block can actually be opened and the VIEW_EDIT
     * exclusion tested against the real view rather than a forced one. */
    'synth:module': 'nusaw',
};

/* Sound mode's view enum (ui_sound.mjs) — not exported, and not worth
 * exporting for a test; pinned here so a renumbering shows up as a failure. */
const VIEW_EDIT = 1, VIEW_KNOB_TARGET = 12, VIEW_KNOB_PARAM = 13;
globalThis.shadow_get_param = (slot, key) => { reads.push(key); return ASSIGN[key] || ''; };
globalThis.shadow_set_param = () => {};
let dspMidi = [];
globalThis.shadow_send_midi_to_dsp = (slot, msg) => { dspMidi.push(msg.slice()); };

/* Drawing surface. mvPrint/hdrPrint emit set_pixel per glyph pixel — the host
 * `print` stub never sees them (the mixer work paid for that lesson three
 * times), so text is measured as pixel bands, never as captured strings. */
let fills = [], px = [], seq = 0;
globalThis.fill_rect = (x, y, w, h, v) => { fills.push({ x, y, w, h, v, seq: seq++ }); };
globalThis.draw_rect = () => {};
globalThis.set_pixel = (x, y) => { px.push({ x, y, seq: seq++ }); };
globalThis.clear_screen = () => { fills = []; px = []; seq = 0; };
globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;

for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

/* hudCard's own frame: the one fill of the full card width at its top-left.
 * Nothing else on these screens has that signature. */
const CARD_X = 6, CARD_Y = 11, CARD_W = 116, CARD_H = 42;
const cardFill = () => fills.find((f) =>
    f.x === CARD_X && f.y === CARD_Y && f.w === CARD_W && f.h === CARD_H);
const cardDrawn = () => !!cardFill();
/* ⚠⚠ Count only pixels laid down AFTER the card's own blanking fill. The card
 * opens by filling its rectangle with 0, which on the device ERASES the list
 * underneath — but the stub keeps every set_pixel ever made, so an unfiltered
 * band counts the block picker's rows showing through and reports a body line
 * the card never printed. (It did: "UNASSIGNED" measured as two lines.) The
 * sequence number is what makes the observable match the mechanism. */
const after = (lo, hi, minX) => {
    const c = cardFill();
    if (!c) return 0;
    return px.filter((p) => p.seq > c.seq && p.y >= lo && p.y <= hi &&
                            (minX == null || p.x >= minX)).length;
};
/* Body lines (line 0 at y=22, line 1 at y=33 — see drawKnobAsnHud). */
const line0 = () => after(22, 31);
const line1 = () => after(33, 42);
/* The value rides the card HEADER, right-aligned, in the 6-row header font. */
const headerRight = () => after(13, 18, 70);

const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const touch = (k, on) => snd.soundOnNote(on ? 0x90 : 0x80, k, on ? 127 : 0);
const turn  = (k, dir) => cc(71 + k, dir > 0 ? 1 : 127);
const shift = (on) => cc(49, on ? 127 : 0);
const draw  = () => { globalThis.clear_screen(); snd.soundRender(); };
/* Ticks are where every engine read happens — nothing about this feature is
 * observable without running them. */
const ticks = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };

function enterTrack(t) {
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;   /* all Schwung */
    GS.activeTrack = t;
    snd.soundEnter(t, t);
    ticks(3);                                           /* land the entry action */
}

step('setup: sound mode on a Schwung track, at its menu (a non-EDIT screen)', () => {
    enterTrack(2);
    if (!snd.soundActive()) throw new Error('sound mode did not enter');
    if (snd.soundKnobHudForTest().shown) throw new Error('a card is up before anything was touched');
});

step('⭑ touching knob 1 names its assignment — SYNTH: CUTOFF', () => {
    reads = [];
    touch(0, true);
    ticks(2);                       /* the assignment read is deferred to tick */
    const h = snd.soundKnobHudForTest();
    if (!h.shown) throw new Error('no card after a touch');
    if (h.knob !== 0) throw new Error('card names knob ' + (h.knob + 1));
    if (h.target !== 'synth' || h.param !== 'cutoff')
        throw new Error('wrong assignment: ' + h.target + ':' + h.param);
});

step('...and the real render path draws the card, with BOTH body lines', () => {
    /* ⚠ The content assertion above passes even if drawKnobAsnHud throws — the
     * render is wrapped nowhere here, but on device tick swallows it. This step
     * is the scope-error gate: esbuild treats a missing import as a host global,
     * so `hudCard` unimported would bundle clean and blank the screen. */
    draw();
    if (!cardDrawn()) throw new Error('hudCard frame not drawn');
    if (line0() === 0) throw new Error('target line drew no pixels');
    if (line1() === 0) throw new Error('param line drew no pixels');
});

step('⭑ the assignment is READ ONCE per knob per slot, not per touch', () => {
    /* Eight touches at two round trips each is ~46 ms of blocking SHM traffic
     * inside a sequencer's tick. The cache is the feature, not an optimisation. */
    reads = [];
    touch(0, false);
    touch(0, true); ticks(2);
    touch(0, false);
    touch(0, true); ticks(2);
    const asnReads = reads.filter((k) => k.indexOf('knob_') === 0);
    if (asnReads.length !== 0)
        throw new Error('re-read the assignment ' + asnReads.length + ' times: ' + asnReads.join(','));
});

step('⚠ a RETARGET drops the cache — a card must not name the old track', () => {
    snd.soundRetarget(4, 4);
    ticks(3);
    reads = [];
    touch(0, true); ticks(2);
    const asnReads = reads.filter((k) => k.indexOf('knob_1_') === 0);
    if (asnReads.length !== 2)
        throw new Error('expected both knob_1_ keys re-read after a retarget, got ' +
                        asnReads.length + ': ' + asnReads.join(','));
    touch(0, false);
    enterTrack(2);
});

step('an UNASSIGNED knob says so, on one line', () => {
    touch(4, true); ticks(2);
    const h = snd.soundKnobHudForTest();
    if (!h.shown || h.knob !== 4) throw new Error('no card for knob 5');
    if (h.target || h.param) throw new Error('knob 5 reported an assignment: ' + h.target);
    draw();
    if (!cardDrawn()) throw new Error('no card drawn for an unassigned knob');
    if (line0() === 0) throw new Error('UNASSIGNED line drew no pixels');
    if (line1() !== 0) throw new Error('a second body line was drawn for an unassigned knob');
    touch(4, false);
});

step('⭑ TURN reveals the value — read back from the DSP, shown in the header', () => {
    /* The DSP owns the value: we send it a relative CC, never a number, so the
     * only way to show one is to read `target:param` back. */
    ticks(50);                                   /* let the touch decay */
    dspMidi = [];
    turn(0, +1);
    if (!dspMidi.length) throw new Error('the turn was not forwarded to the DSP');
    ticks(10);
    const h = snd.soundKnobHudForTest();
    if (h.knob !== 0) throw new Error('the turn did not raise knob 1s card');
    if (h.value !== '0.48')
        throw new Error('expected the read-back 0.4830 shown as 0.48, got "' + h.value + '"');
    draw();
    if (headerRight() === 0) throw new Error('the value drew no pixels in the card header');
});

step('⚠ the read-back STOPS once the turning settles', () => {
    /* The cadence bounds a sweep; this bounds the silence after it. Leaving
     * asnValFor armed turns the settle read into a permanent poll — one
     * blocking round trip every four ticks, for the rest of the session, for a
     * value nothing is looking at. It is invisible except as sequencer jitter. */
    ticks(20);                                   /* let it settle */
    reads = [];
    ticks(40);
    const valReads = reads.filter((k) => k === 'synth:cutoff');
    if (valReads.length !== 0)
        throw new Error('still polling ' + valReads.length + ' times over 40 idle ticks');
});

step('⚠ a value never shows under a knob it does not belong to', () => {
    /* The read-back is cached, so the ONLY thing stopping knob 1s cutoff being
     * printed on knob 3s card is that the card checks whose value it is. */
    touch(2, true); ticks(3);                    /* knob 3, never turned */
    const h = snd.soundKnobHudForTest();
    if (h.knob !== 2) throw new Error('wrong knob on the card');
    if (h.value !== '')
        throw new Error('knob 3 showed a value it never had: "' + h.value + '"');
    touch(2, false);
    ticks(50);
});

step('⚠ a sweep costs a BOUNDED number of read-backs, not one per detent', () => {
    /* 20 detents inside one tick window. At ~2.9 ms a read, one per detent is
     * 58 ms of blocking traffic in a single tick of a running sequencer. */
    reads = [];
    for (let i = 0; i < 20; i++) turn(0, +1);
    ticks(8);
    const valReads = reads.filter((k) => k === 'synth:cutoff');
    if (valReads.length === 0) throw new Error('no value read at all during the sweep');
    if (valReads.length > 3)
        throw new Error('read the value ' + valReads.length + ' times for 20 detents');
});

step('⭑ SHIFT + touch opens the assign flow for THAT knob', () => {
    touch(0, false);
    ticks(50);
    shift(true);
    touch(2, true);                              /* knob 3 -> fx2:room_size */

    /* ⚠⚠ BEFORE the tick, which is the only moment the two gestures can both be
     * live. Asserting after the tick proves nothing: by then the assign screen
     * is up and the card's own view exclusion suppresses it anyway — a version
     * of this step that only checked afterwards passed with the shift branch
     * deliberately falling through into armKnobHud. */
    if (snd.soundKnobHudForTest().shown)
        throw new Error('the card was armed by a Shift+touch — it will flash before the screen opens');
    draw();
    if (cardDrawn()) throw new Error('a card was drawn between the press and the tick');

    ticks(3);
    shift(false);
    const st = snd.soundPickStateForTest();
    if (st.view !== VIEW_KNOB_TARGET)
        throw new Error('expected the TARGET picker, landed on view ' + st.view);
    const h = snd.soundKnobHudForTest();
    if (h.shown) throw new Error('the card is up over the assign screen it duplicates');
    /* The cursor must be on the knob that was TOUCHED, not knob 1: openKnobEditor
     * resets it to 0, so the ORDER of those two calls is the whole gesture. */
    if (h.cursor !== 2)
        throw new Error('assign flow opened on knob ' + (h.cursor + 1) + ', not 3');
    touch(2, false);
});

step('⚠ ...and touching a knob ON the assign screen raises no card either', () => {
    /* ⭑ The touch matters. Checking only the state left by the Shift gesture
     * proves nothing about the view exclusion — that gesture never arms a card
     * in the first place, so deleting the exclusion outright left the step
     * green. The screen already lists every assignment; a card would cover the
     * list it duplicates. */
    touch(5, true); ticks(3);
    if (snd.soundKnobHudForTest().shown)
        throw new Error('a card was armed on the assign screen');
    draw();
    if (cardDrawn()) throw new Error('a card was drawn over the assign screen');
    touch(5, false);
});

step('⚠ inside a module EDITOR the card stays away — the knobs edit cells there', () => {
    /* Opened for real, not forced: the exclusion is a VIEW test, so a test that
     * sets the view by hand would pass against a gate keyed on anything else. */
    enterTrack(2);
    const st = snd.soundPickStateForTest();
    /* The first block row AT OR AFTER the cursor — the picker opens on SYNTH,
     * which is already a block row, and the jog only moves forward. Searching
     * from 0 aimed at MIDI FX, behind the cursor, and never arrived. */
    const target = st.kinds.indexOf('block', st.row);
    if (target < 0) throw new Error('no block row at or after the cursor');
    /* ⚠ Turn until the cursor ARRIVES — the cursor steps over grouping-rule
     * rows, so one turn is not one index. */
    for (let guard = 0; guard <= st.kinds.length * 2; guard++) {
        if (snd.soundPickStateForTest().row === target) break;
        cc(14, 1);
        if (guard === st.kinds.length * 2) throw new Error('never reached the block row');
    }
    cc(3, 127);                                  /* jog click -> open the block */
    ticks(3);
    if (snd.soundPickStateForTest().view !== VIEW_EDIT)
        throw new Error('the block did not open — still on view ' +
                        snd.soundPickStateForTest().view);
    touch(0, true); ticks(2);
    if (snd.soundKnobHudForTest().shown)
        throw new Error('the card appeared in the module editor');
    draw();
    if (cardDrawn()) throw new Error('the card was drawn in the module editor');
    touch(0, false);
});

step('⚠ on a BUS the card stays away — a bus forwards no knob at all', () => {
    /* ⭑ POSITIVE CONTROL first, at this exact state: without it this step would
     * pass just as well if touch handling were broken outright. */
    enterTrack(2);
    touch(0, true); ticks(2);
    if (!snd.soundKnobHudForTest().shown)
        throw new Error('control failed: no card on a track, so the bus case proves nothing');
    touch(0, false);
    ticks(50);

    snd.soundEnterBuses();
    cc(3, 127);                                  /* jog click -> enter the bus */
    ticks(3);
    if (!snd.soundIsGlobal()) throw new Error('not in a global bus context');
    dspMidi = [];
    touch(0, true); ticks(2);
    turn(0, +1);
    if (dspMidi.length) throw new Error('a bus forwarded a knob turn to a slot');
    if (snd.soundKnobHudForTest().shown) throw new Error('the card appeared on a bus');
    draw();
    if (cardDrawn()) throw new Error('the card was drawn on a bus');
    touch(0, false);
});

step('⚠ RE-ASSIGNING a knob drops its cached value — it belonged to the old param', () => {
    /* Otherwise the card shows a number read from the parameter the knob USED
     * to drive, under the name of the one it drives now. */
    enterTrack(2);
    turn(0, +1); ticks(10);                      /* cache 0.48 for synth:cutoff */
    if (snd.soundKnobHudForTest().value !== '0.48')
        throw new Error('control failed: no cached value to invalidate');

    shift(true); touch(0, true); ticks(3); shift(false); touch(0, false);
    if (snd.soundPickStateForTest().view !== VIEW_KNOB_TARGET)
        throw new Error('did not reach the target picker');
    cc(3, 127); ticks(3);                        /* click: take the seeded target */
    if (snd.soundPickStateForTest().view !== VIEW_KNOB_PARAM)
        throw new Error('did not reach the param picker');
    cc(3, 127); ticks(3);                        /* click: commit a DIFFERENT param */

    /* ⚠⚠ Get back to a screen the card lives on, and TOUCH the knob, before
     * asking what it shows. Reading the accessor straight after the commit
     * measured nothing: the release that ended the Shift gesture had already
     * put S.touchedIdx back to -1, so `value` was masked to '' whether or not
     * the invalidation ran, and the step passed against its own mutation. */
    for (let guard = 0; guard < 4 && snd.soundPickStateForTest().view !== 0; guard++)
        { cc(51, 127); ticks(3); }               /* Back, out to the picker */
    touch(0, true); ticks(3);

    const h = snd.soundKnobHudForTest();
    if (h.param !== 'preset')
        throw new Error('the cache still names the old param: ' + h.target + ':' + h.param);
    if (h.value !== '')
        throw new Error('kept the old param\'s value after re-assigning: "' + h.value + '"');
    touch(0, false);
});

if (failed) process.exit(1);
console.log('test_sound_knob_hud: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
