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
    /* ⭑ The metadata is the point of the movy law, so the fixtures are chosen
     * to break a naive implementation:
     *   cutoff    — declares a COARSE step (0.5 over a 0..1 range = two
     *               positions). Normalising outright is what recovers it.
     *   room_size — a WIDE range (0.5..20) with a fine step. Using the declared
     *               step here is what makes a knob crawl.
     *   voices    — an INT whose 1% of range is 0.07; the declared step must
     *               act as a FLOOR or it would never move.
     *   shape     — an ENUM, exempt from normalisation, fixed detents per step.
     */
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.5 },
        { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8, step: 1 },
        { key: 'shape', name: 'Shape', type: 'enum', options: ['Saw', 'Square', 'Tri'] },
        { key: 'preset', name: 'Preset', type: 'int', min: 0, max: 99, step: 1 },
    ]),
    'fx2:chain_params': JSON.stringify([
        { key: 'room_size', name: 'Room Size', type: 'float', min: 0.5, max: 20, step: 0.01 },
    ]),
    'synth:voices': '4',
    'synth:shape': 'Saw',
};

/* Sound mode's view enum (ui_sound.mjs) — not exported, and not worth
 * exporting for a test; pinned here so a renumbering shows up as a failure. */
const VIEW_EDIT = 1, VIEW_KNOB_TARGET = 12, VIEW_KNOB_PARAM = 13;
globalThis.shadow_get_param = (slot, key) => { reads.push(key); return ASSIGN[key] || ''; };
/* Writes are the observable now that the value is owned in JS and written
 * absolutely. The stub also RECORDS the write back into ASSIGN, so a re-seed
 * reads what was actually set — a stub that always answers the original value
 * would make every re-touch look like a revert. */
let writes = [];
globalThis.shadow_set_param = (slot, key, val) => {
    writes.push({ key, val }); ASSIGN[key] = String(val); return 1;
};
let dspMidi = [];
globalThis.shadow_send_midi_to_dsp = (slot, msg) => { dspMidi.push(msg.slice()); };

/* Drawing surface. mvPrint/hdrPrint emit set_pixel per glyph pixel — the host
 * `print` stub never sees them (the mixer work paid for that lesson three
 * times), so text is measured as pixel bands, never as captured strings. */
let fills = [], px = [], seq = 0;
globalThis.fill_rect = (x, y, w, h, v) => { fills.push({ x, y, w, h, v, seq: seq++ }); };
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
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
/* ⚠ davebox's module editor is the HOST'S OWN binding (ui/vendor/), so sound
 * mode's exit path now reaches host bindings this rig never needed —
 * shadow_restore_knob_leds among them, on the LED teardown. Declared here
 * rather than injected into every bundle: tests/js/build.mjs refuses blanket
 * stubbing on purpose, because a missing binding throws inside tick() and the
 * rig would then pass against a tick that stopped on line one. */
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();

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
/* ⚠ ONE event carrying n detents — the shadow framework batches, and dropping
 * that magnitude is exactly the resolution bug this law replaced. */
const turnBy = (k, n) => cc(71 + k, n > 0 ? n : 128 + n);
const wrote = (key) => writes.filter((w) => w.key === key);
const lastWrite = (key) => { const w = wrote(key); return w.length ? w[w.length - 1].val : null; };
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
    /* ⚠ Sound mode ENTERS ON THE BANK'S PROMPT now, not the menu (Josh,
     * 2026-08-28: the bank is a door — "click to enter"). Every step below acts
     * on the MENU, so the setup opens it.
     * ⚠ AFTER the ticks, not before: the entry action is still in flight during
     * them and lands on the prompt, so opening the menu first is undone by the
     * very next tick. */
    snd.soundShowMenu();
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
    /* ⚠ ALTERNATE knobs. Re-touching the SAME knob skips the assignment stage
     * anyway (it only re-seeds the value), so a same-knob loop leaves the cache
     * guard untested — deleting it left this step green. Going away and coming
     * back is both the realistic gesture and the one that exercises it. */
    touch(0, false); ticks(6);
    touch(2, true); ticks(6); touch(2, false);   /* knob 3, warms its own cache */
    reads = [];
    touch(0, true); ticks(6); touch(0, false);
    touch(2, true); ticks(6); touch(2, false);
    touch(0, true); ticks(6);
    const asnReads = reads.filter((k) => k.indexOf('knob_') === 0);
    if (asnReads.length !== 0)
        throw new Error('re-read the assignment ' + asnReads.length + ' times: ' + asnReads.join(','));
    /* The target's chain_params is cached per slot too — it is the biggest read
     * of the three (a whole JSON param list). */
    const metaReads = reads.filter((k) => k.indexOf('chain_params') >= 0);
    if (metaReads.length !== 0)
        throw new Error('re-read metadata ' + metaReads.length + ' times: ' + metaReads.join(','));
    touch(0, false);
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

step('⭑ TURN reveals the value — and WRITES it, absolutely', () => {
    /* The value is owned in JS and written with shadow_set_param. It used to be
     * forwarded to the chain DSP as a relative CC and read back; that path is
     * gone, and with it the DSPs time-based acceleration. */
    ticks(50);                                   /* let the touch decay */
    writes = []; dspMidi = [];
    touch(0, true); ticks(4);                    /* seed: assignment, meta, value */
    if (snd.soundKnobHudForTest().value !== '')
        throw new Error('a bare TOUCH revealed the value — touch orients, turn reveals');
    /* ⚠ TWO detents. Continuous knobs are 2 detents per position, so a
     * one-detent stimulus moves nothing — the same trap that broke
     * test_session_level_knob when the mixer took this law. The one-detent
     * case is pinned deliberately just below, rather than papered over. */
    turn(0, +1); ticks(3);
    if (lastWrite('synth:cutoff') !== null)
        throw new Error('ONE detent moved a continuous knob: ' + lastWrite('synth:cutoff'));
    turn(0, +1); ticks(3);
    if (dspMidi.length)
        throw new Error('still forwarding a relative CC to the DSP');
    /* cutoff is 0..1 over 255 positions: one position is 0.00392 on 0.483. */
    if (lastWrite('synth:cutoff') !== '0.4869')
        throw new Error('expected a 0.4869 write, got ' + lastWrite('synth:cutoff'));
    const h = snd.soundKnobHudForTest();
    if (h.knob !== 0) throw new Error('the turn did not raise knob 1s card');
    if (h.value !== '0.49') throw new Error('card shows "' + h.value + '"');
    draw();
    if (headerRight() === 0) throw new Error('the value drew no pixels in the card header');
    touch(0, false);
});

step('⭑⭑ FULL RESOLUTION — one event carrying n detents moves n steps', () => {
    /* THE headline fix. The shadow framework hands davebox an ACCUMULATED
     * detent count; the old path sent one relative tick per event regardless,
     * so a fast turn moved LESS than a slow one. Ten detents in one event must
     * move exactly as far as ten events of one. */
    ticks(50);
    ASSIGN['synth:cutoff'] = '0.0000';
    touch(0, true); ticks(4);
    writes = [];
    turnBy(0, 20); ticks(3);                     /* 20 detents = 10 positions */
    const fast = parseFloat(lastWrite('synth:cutoff'));
    const TEN = 10 / 255;
    if (!(Math.abs(fast - TEN) < 1e-4))
        throw new Error('20 detents in ONE event moved to ' + fast + ', not ' + TEN +
                        (Math.abs(fast - 1 / 255) < 1e-4 ? ' (the magnitude was dropped)' : ''));

    ticks(50);
    ASSIGN['synth:cutoff'] = '0.0000';
    touch(0, false); touch(0, true); ticks(4);
    writes = [];
    for (let n = 0; n < 20; n++) turn(0, +1);
    ticks(3);
    const slow = parseFloat(lastWrite('synth:cutoff'));
    if (Math.abs(fast - slow) > 1e-6)
        throw new Error('a fast turn (' + fast + ') and a slow one (' + slow + ') disagree');
    touch(0, false);
});

step('⭑ a sweep costs ZERO reads and ONE coalesced write per tick', () => {
    /* Owning the value is what buys this: the old path read `target:param` back
     * on a cadence just to show it. 40 detents inside one tick window used to
     * be blocking round trips; now it is arithmetic. */
    ticks(50);
    touch(0, true); ticks(8);
    reads = []; writes = [];
    for (let n = 0; n < 40; n++) turn(0, +1);
    /* ⚠ TWO ticks minimum: the detents are applied at the END of a tick and the
     * write drains at the START of the next. Measuring after one tick sees the
     * value move and no write, which reads as a lost write. */
    ticks(3);
    if (reads.length !== 0)
        throw new Error('a sweep cost ' + reads.length + ' round trips: ' + reads.join(','));
    if (wrote('synth:cutoff').length !== 1)
        throw new Error('expected ONE coalesced write for 40 detents, got ' +
                        wrote('synth:cutoff').length);
    touch(0, false);
});

step('⭑⭑ TRAVEL: a coarse declared step is ignored — the RANGE sets the step', () => {
    /* cutoff declares step 0.5 over 0..1 — two positions, and the DSP path used
     * exactly that. Normalising outright is what recovers the resolution.
     * ⚠ Self-contained: the accessor reports the cell of the TOUCHED knob, so a
     * step that inherited the previous one's release read null and failed for a
     * reason that had nothing to do with the law. */
    ticks(50);
    touch(0, true); ticks(6);
    const cell = snd.soundKnobHudForTest().cell;
    if (!cell) throw new Error('no cell loaded');
    if (Math.abs(cell.step - 1 / 255) > 1e-9)
        throw new Error('step is ' + cell.step + ', not 1/255 of the 0..1 range');
    /* ⭑ THE DIAL Josh is judging, asserted directly rather than inferred from
     * the step: how many detents a full sweep costs, end to end. */
    if (cell.sens * Math.round((cell.max - cell.min) / cell.step) !== 510)
        throw new Error('a full sweep is ' +
            cell.sens * Math.round((cell.max - cell.min) / cell.step) +
            ' detents, not the 510 the mixer uses');
    if (cell.name !== 'Cutoff')
        throw new Error('the card should name the param "Cutoff", not "' + cell.name + '"');
    touch(0, false);
});

step('⭑⭑ TRAVEL: a WIDE range does not crawl, and sweeps in the SAME gesture', () => {
    /* room_size is 0.5..20 declaring step 0.01 — 1950 detents for a sweep on
     * the declared step. Normalised it is 0.195 a detent, ~100 for the sweep,
     * the same gesture as cutoff despite the units. */
    ticks(50);
    touch(2, true); ticks(4);                    /* knob 3 -> fx2:room_size */
    const cell = snd.soundKnobHudForTest().cell;
    if (!cell) throw new Error('no cell for knob 3');
    if (Math.abs(cell.step - 19.5 / 255) > 1e-9)
        throw new Error('step is ' + cell.step + ', not 1/255 of the 0.5..20 range');
    /* ⭑ The POINT of normalising: 0.5..20 and 0..1 cost the same gesture. */
    if (cell.sens * Math.round((cell.max - cell.min) / cell.step) !== 510)
        throw new Error('a wide-range sweep is a different gesture from a narrow one');
    writes = [];
    turnBy(2, 2); ticks(3);
    if (Math.abs(parseFloat(lastWrite('fx2:room_size')) - (0.75 + 19.5 / 255)) > 1e-4)
        throw new Error('0.75 + one position = ' + lastWrite('fx2:room_size'));
    touch(2, false);
});

step('⭑ TRAVEL: an INT keeps its declared step as a FLOOR', () => {
    /* voices is 1..8: 1% of the range is 0.07, so a normalised float step would
     * take fourteen detents to move one voice — and round back to where it
     * started every time in between. */
    ASSIGN['knob_1_target'] = 'synth'; ASSIGN['knob_1_param'] = 'voices';
    enterTrack(3);                               /* drop the caches */
    ticks(50);
    touch(0, true); ticks(4);
    const cell = snd.soundKnobHudForTest().cell;
    if (!cell || cell.type !== 'int') throw new Error('not an int cell: ' + (cell && cell.type));
    if (cell.step !== 1) throw new Error('int step is ' + cell.step + ', not the declared 1');
    writes = [];
    turnBy(0, 2); ticks(3);
    if (lastWrite('synth:voices') !== '5')
        throw new Error('4 + one position = ' + lastWrite('synth:voices') + ', expected 5');
    /* An eight-voice sweep is 14 detents — snappy, but two detents a voice so a
     * brush cannot change it. 1/255 of the range would be 0.027 and never move. */
    if (cell.sens * Math.round((cell.max - cell.min) / cell.step) !== 14)
        throw new Error('a 1..8 int sweep is ' +
            cell.sens * Math.round((cell.max - cell.min) / cell.step) + ' detents, not 14');
    touch(0, false);
});

step('⭑ TRAVEL: an ENUM is exempt, and costs 4 detents per step', () => {
    ASSIGN['knob_1_target'] = 'synth'; ASSIGN['knob_1_param'] = 'shape';
    enterTrack(4);
    ticks(50);
    touch(0, true); ticks(4);
    const cell = snd.soundKnobHudForTest().cell;
    if (!cell || cell.type !== 'enum') throw new Error('not an enum cell');
    writes = [];
    turnBy(0, 3); ticks(3);                      /* three detents: not yet a step */
    if (wrote('synth:shape').length)
        throw new Error('an enum stepped on 3 detents: ' + lastWrite('synth:shape'));
    turn(0, +1); ticks(3);                       /* the fourth commits */
    if (lastWrite('synth:shape') !== '1')
        throw new Error('expected enum index 1 (Square), got ' + lastWrite('synth:shape'));
    /* ⭑ And it reads out as its NAME, not an index — that is what the cell buys. */
    if (snd.soundKnobHudForTest().value !== 'Square')
        throw new Error('enum read-out is "' + snd.soundKnobHudForTest().value + '"');
    touch(0, false);
});

step('⭑ a direction REVERSAL resets the accumulator rather than unwinding it', () => {
    /* Still on the enum, where the 4-detent accumulator is observable.
     *
     * ⚠⚠ The stimulus has to DISTINGUISH the two laws, and the obvious one does
     * not: 3 up then 1 down leaves 2 under a reset and -1 under an unwind, and
     * neither reaches a step — so the assertion passed against its own mutation.
     * 3 up then 4 down separates them cleanly: a reset zeroes the 3 and the 4
     * downs commit a step; an unwind nets to -1 and commits nothing. */
    writes = [];
    turnBy(0, 3); ticks(2);
    turnBy(0, -4); ticks(3);
    if (lastWrite('synth:shape') !== '0')
        throw new Error('3 up then 4 down should step DOWN to 0, wrote ' +
                        lastWrite('synth:shape') +
                        (lastWrite('synth:shape') === null
                            ? ' (the reversal unwound the 3 instead of clearing them)' : ''));
    touch(0, false);
    /* Put the fixture back for the steps that follow. */
    ASSIGN['knob_1_target'] = 'synth'; ASSIGN['knob_1_param'] = 'cutoff';
    ASSIGN['synth:cutoff'] = '0.4830';
    enterTrack(2);
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

step('⭐ in the module editor TOUCH claims the header — the note reaches the binding', () => {
    /* The stock editor takes knob touch as a NOTE (page_input: 0x90/0x80 on
     * notes 0-7 -> onKnobTouch), and the press is what inverts the header.
     * davebox's soundOnNote used to keep the note to itself, so the header
     * only inverted once a TURN claimed it (Josh, 2026-08-31). The observable
     * is the INVERSION BAND — drawHeader fills the full 128px width at y=0
     * only when touched — not captured text, which no stub here can read. */
    if (snd.soundPickStateForTest().view !== VIEW_EDIT)
        throw new Error('setup: not in the module editor');
    const hdrBand = () => fills.some((f) =>
        f.x === 0 && f.y === 0 && f.w === 128 && f.h >= 5 && f.v === 1);
    /* ⚠ Control: untouched, the band must be ABSENT — otherwise the presence
     * check below can pass with touch handling broken outright. */
    draw();
    if (hdrBand()) throw new Error('control failed: header band present untouched');
    touch(0, true);
    draw();
    if (!hdrBand()) throw new Error('touch alone did not claim the header — the note never reached the binding');
    touch(0, false);
    draw();
    if (hdrBand()) throw new Error('release did not clear the header claim');
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
    touch(0, true); ticks(4);
    turnBy(0, 2); ticks(3);                      /* one position, owned */
    if (snd.soundKnobHudForTest().value !== '0.49')
        throw new Error('control failed: no value to invalidate, got "' +
                        snd.soundKnobHudForTest().value + '"');
    touch(0, false);

    shift(true); touch(0, true); ticks(3); shift(false); touch(0, false);
    if (snd.soundPickStateForTest().view !== VIEW_KNOB_TARGET)
        throw new Error('did not reach the target picker');
    cc(3, 127); ticks(3);                        /* click: take the seeded target */
    if (snd.soundPickStateForTest().view !== VIEW_KNOB_PARAM)
        throw new Error('did not reach the param picker');
    /* ⚠ MOVE the cursor first. The picker seeds on the CURRENT assignment, so
     * clicking straight through re-commits the param it already had and the
     * step measures nothing. (It did, once chain_params gave the list a real
     * ordering instead of the two-entry fallback.) */
    cc(14, 1); ticks(1);
    cc(14, 1); ticks(1);
    cc(14, 1); ticks(1);                         /* cutoff -> voices -> shape -> preset */
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
    /* ⭑ And the CELL is rebuilt too — preset is 0..99, so its step law is a
     * different one. Keeping cutoff's 0..1 cell would clamp every turn to 1. */
    turnBy(0, 2); ticks(3);
    const c = snd.soundKnobHudForTest().cell;
    if (!c || c.key !== 'preset')
        throw new Error('the cell was not rebuilt for the new param: ' + (c && c.key));
    if (Math.abs(c.step - 1) > 1e-9)
        throw new Error('preset (0..99, step 1) got step ' + c.step);
    touch(0, false);
});

if (failed) process.exit(1);
console.log('test_sound_knob_hud: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
