/* tests/js/test_session_mixer_render.mjs — DRIVE the real session-view render
 * across every mixer mode and touch state.
 *
 * Why a render test at all: esbuild treats an undeclared identifier as a host
 * global, so a missing import produces NO build error — only a runtime
 * ReferenceError on the device, in a draw path that `tick()` swallows. Bundling
 * is therefore not a gate for this code. The only cheap gate is to EVAL the real
 * modules off-device and actually call the draw path.
 *
 * It caught two live scope errors while the mixer page was being written
 * (`drawVFader` unimported, `SCREEN_W` not in scope in ui_render), both of which
 * bundled cleanly and would have blanked the screen on hardware.
 *
 * The assertions are deliberately structural — that each mode draws, that a
 * fader row draws EIGHT strips, that a track with no mixer position draws
 * nothing. Pixel-level appearance is the kit previewer's job.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

/* Host drawing surface: record calls so we can count what was drawn. */
let fills = [], prints = [];
/* ⚠ Count fill_rect, NOT draw_rect: rectOutline (and therefore drawVFader)
 * draws its frame from four fill_rect calls and never touches draw_rect. The
 * first version of this test counted draw_rect, measured 0 for everything, and
 * accused working code — the observable has to match the mechanism. */
globalThis.fill_rect = (x, y, w, h) => { fills.push({ x, y, w, h }); };
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
/* ⚠ The fader row labels are drawn with ui_movy's mvPrint, which puts ink down
 * one set_pixel at a time — the host `print` stub never sees them. Measuring
 * `prints` here reported "nothing drawn" for working code (the third time this
 * session an observable was aimed at the wrong mechanism), so the label band is
 * measured as PIXELS: one digit is ~4px wide, a value like "2.00X" is ~20px. */
let px = [];
/* ⚠ Record EVERY glyph pixel, ink or not: the TOUCHED strip prints its digit in
 * BLACK on a white fill, so filtering on v!==0 measured it as "nothing drawn".
 * mvPrint only calls set_pixel for glyph pixels, so this stays a clean signal. */
globalThis.set_pixel = (x, y, v) => { px.push({ x, y }); };
const labelSpan = (col) => {
    const lo = col * 16, hi = col * 16 + 15;          /* THIS column only — a wider
                                                      * window catches the neighbours' digits
                                                      * and every case measures the same. */
    /* the label row: LBL_Y-1 .. LBL_Y+7 (48..56) — it moved up on 2026-09-05 so the
     * hint footer fits on row 57, which this band must NOT include (footer pills
     * are glyphs too). */
    const xs = px.filter((p) => p.y >= 48 && p.y <= 56 && p.x >= lo && p.x <= hi).map((p) => p.x);
    return xs.length ? Math.max(...xs) - Math.min(...xs) + 1 : 0;
};
globalThis.clear_screen = () => { fills = []; prints = []; px = []; };
globalThis.print = (x, y, t) => { prints.push(String(t)); };
globalThis.pixel_print = (x, y, t) => { prints.push(String(t)); };
globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;

for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'shadow_set_param', 'shadow_get_param',
                  'host_send_midi', 'move_midi_inject_to_move', 'shadow_send_midi_to_dsp',
                  'host_set_led', 'host_get_setting', 'host_set_setting'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const render = await import('../../ui/ui_render.mjs');
const { S }  = await import('../../ui/ui_state.mjs');
const { SESS_KNOB_MODES } = await import('../../ui/ui_engine.mjs');

/* A representative mix: two Move-bus tracks, two Schwung-slot tracks, one
 * EXT-routed track and one with no slot — the last two must draw no widget. */
S.sessionView   = true;
S.globalMenuOpen = false;
S.sessVolBus    = [1, 2, 0, 0, 0, 0, 0, 0];
S.sessVolSlots  = [0, 0, 1, 2, 0, 0, 8, 16];
S.trackRoute    = [1, 1, 0, 0, 2, 0, 0, 0];   /* 1=Move, 0=Schwung, 2=EXT */
S.sessVolLevel  = [1.0, 0.5, 2.0, 0.0, 0.9, -1, 0.25, 1.5];
S.actionPopupEndTick = -1;
/* ⚠ Clear the BOOT gate. A fresh state is mid-launch — stateLoading /
 * bootSplashMs / awaitingProjectSelect make drawUI paint "LOADING" and
 * return, so every assertion below would measure the splash and quietly pass or
 * fail for the wrong reason. (It did: the first run of this test reported "0
 * faders" and accused working code.) */
S.stateLoading = false; S.bootSplashMs = 0; S.awaitingProjectSelect = false;

function draw() { globalThis.clear_screen(); render.drawUI(); }

/* 1. Every mode draws, in every touch state, without throwing. This is the
 *    scope-error gate. */
for (let m = 0; m < SESS_KNOB_MODES.length; m++) {
    const name = SESS_KNOB_MODES[m].key;
    S.sessKnobMode = m;
    for (const [what, set] of [
        /* ⭑ ONE LAW (2026-09-01): only the latch shows the page. Knob-touch
         * states are tested WITH the latch on — touch drives highlights on
         * the shown page, never the page itself. */
        ['latched',           () => { S.knobTouched = -1; S.sessMixerLatched = true; S.bankSelectTick = -1; }],
        ['latched + knob',    () => { S.knobTouched = 2;  S.sessMixerLatched = true; S.bankSelectTick = -1; }],
        ['latched + window',  () => { S.knobTouched = -1; S.sessMixerLatched = true; S.bankSelectTick = 1;  }],
        ['latched blank trk', () => { S.knobTouched = 5;  S.sessMixerLatched = true; S.bankSelectTick = -1; }],
    ]) {
        set();
        try { draw(); ok(`${name}: renders on ${what}`); }
        catch (e) { bad(`${name}: renders on ${what}`, e); }
    }
}

/* 2. The fader row draws one strip per track that HAS a mixer position, and
 *    none for the two that do not. drawVFader outlines its channel, so counting
 *    outline calls counts strips. */
S.sessKnobMode = 0; S.knobTouched = -1; S.sessMixerLatched = true; S.bankSelectTick = -1;
draw();
/* A fader channel's top edge is the one fill of width 8 at y=TOP(14) — one per
 * strip, and nothing else on this screen has that signature. */
const countFaders = () => fills.filter((f) => f.w === 8 && f.h === 1 && f.y === 14).length;
const faderCount = countFaders();
/* 7 since 2026-09-03 (spec §2b): a MIDI (EXT) track HAS a volume strip — CC 7 —
 * so track 5 draws; only track 6 (no mixer position) stays blank. */
if (faderCount === 7) ok('volume row draws 7 faders — one per track with a mixer position (the MIDI track\'s is CC 7)');
else bad('volume row draws 7 faders', `drew ${faderCount} (track 6=no-level must be blank; the EXT track draws its CC 7)`);

/* 3. …and that this is really position-driven: give the EXT track a position
 *    and the count must rise. Without this, "6" could be any constant. */
S.trackRoute[4] = 0; S.sessVolSlots[4] = 4; S.sessVolLevel[4] = 0.7;
/* ⚠ Track 5 was the EXT track and already drew (CC 7); the control below needs a
 * track that was BLANK — track 6 gains a position instead. */
S.trackRoute[5] = 0; S.sessVolSlots[5] = 4; S.sessVolLevel[5] = 0.7;
draw();
if (countFaders() === faderCount + 1) ok('a track gaining a mixer position gains a fader');
else bad('a track gaining a mixer position gains a fader', `${faderCount} -> ${countFaders()}`);
S.trackRoute[4] = 2; S.sessVolSlots[4] = 0;

/* 4. The mixer page must WIN over a pending popup while a knob is held — the
 *    page is the richer read-out and the popup would cover it. */
S.actionPopupEndTick = 999; S.actionPopupLines = ['SOMETHING']; S.actionPopupGauge = -1;
S.sessKnobMode = 0; S.knobTouched = 3; S.sessMixerLatched = true; S.bankSelectTick = -1;
draw();
if (!prints.includes('SOMETHING')) ok('a held knob shows the mixer page, not a queued popup');
else bad('a held knob shows the mixer page, not a queued popup', 'popup drew over it');

/* 5. …and the popup still gets its turn once nothing is touched. */
S.knobTouched = -1; S.jogTouched = false; S.bankSelectTick = -1; S.sessMixerLatched = false;
draw();
if (prints.includes('SOMETHING')) ok('with nothing touched, ordinary popups still draw');
else bad('with nothing touched, ordinary popups still draw', 'popup was swallowed');

/* 6. TURN shows the value under that strip; TOUCH alone keeps the track number.
 *    This is the whole point of Josh's ask, and the two states are one tick
 *    apart, so a regression here would be easy to miss by eye. */
S.actionPopupEndTick = -1;
S.sessKnobMode = 0; S.knobTouched = 2; S.sessMixerLatched = true; S.bankSelectTick = -1;
S.tickCount = 1000;

S.sessVolLastKnob = -1; S.sessVolLastTurn = -1;          /* touched, never turned */
draw();
const spanLabel = labelSpan(2);
if (spanLabel > 0 && spanLabel <= 8) ok(`touch alone shows the TRACK NUMBER (${spanLabel}px)`);
else bad('touch alone shows the track number', `${spanLabel}px of ink — expected a single digit`);

S.sessVolLastKnob = 2; S.sessVolLastTurn = 1000;         /* just turned knob 3, still held */
draw();
const spanValue = labelSpan(2);
if (spanValue > spanLabel + 6) ok(`a turn swaps that strip to its VALUE (${spanValue}px)`);
else bad('a turn swaps that strip to its value', `${spanValue}px vs label ${spanLabel}px`);

/* RELEASE — the number must be back on the very next frame, not after a timer.
 * `sessVolLastTurn` deliberately stays where it is: if the fallback were still
 * time-based this would keep showing the value and the assertion would fail. */
S.knobTouched = -1; S.jogTouched = true;
draw();
if (labelSpan(2) === spanLabel) ok('the value falls back IMMEDIATELY on release');
else bad('the value falls back immediately on release', `${labelSpan(2)}px, expected ${spanLabel}px`);
S.knobTouched = 2; S.jogTouched = false;

/* …and a strip with no mixer position never shows a value, even if it was
 *    somehow the last "turned" knob — it has no value TO show. */
S.sessVolLastKnob = 5; S.sessVolLastTurn = 1000;
draw();
const spanBlank = labelSpan(5);
if (spanBlank > 0 && spanBlank <= 8) ok('a positionless strip keeps its number');
else bad('a positionless strip keeps its number', `${spanBlank}px of ink`);

/* 7. The live value is HIGHLIGHTED (inverted): a filled block behind it, with
 *    the glyphs punched out in black. Without the fill it read as just another
 *    of the eight numbers on that line. */
S.sessKnobMode = 0; S.knobTouched = 2; S.jogTouched = false; S.bankSelectTick = 1;
S.sessVolLastKnob = 2; S.sessVolLastTurn = 1000; S.tickCount = 1000;
draw();
const band = (col) => fills.filter((f) => f.y === 48 && f.h === 9   /* LBL_Y-1: the labels sit above the row-57 footer (2026-09-05) */ &&
                                          f.x >= col * 16 - 8 && f.x <= col * 16 + 20);
if (band(2).length > 0) ok('the live value sits on a filled highlight block');
else bad('the live value sits on a filled highlight block', 'no fill behind it');

/* …and the highlight goes with the value, on release. */
S.knobTouched = -1; S.jogTouched = true;
draw();
if (band(2).length === 0) ok('the highlight goes when the value does');
else bad('the highlight goes when the value does', 'still filled after release');

/* 8. Pan and the sends must NOT draw the big zoom box (Josh: lose the pop-ups).
 *    MV_ZOOM geometry is unmistakable — a wide box high on the screen. */
/* ⚠ The zoom box is gated on knobTurnedTick, NOT on touch — it appears when you
 * TURN, which is exactly when Josh saw it. Without setting this the assertion
 * below is vacuous: it passed even with the overlay call restored. */
S.sessKnobMode = 1; S.knobTouched = 2; S.jogTouched = false; S.bankSelectTick = 1;
S.knobTurnedTick[2] = 1000;
draw();
const zoomish = fills.filter((f) => f.w >= 40 && f.h >= 14 && f.y < 40);
if (zoomish.length === 0) ok('pan draws no zoom-box pop-up');
else bad('pan draws no zoom-box pop-up', `${zoomish.length} box-like fills: ${JSON.stringify(zoomish[0])}`);

S.sessKnobMode = 2;
S.knobTurnedTick[2] = 1000;
draw();
const zoomish2 = fills.filter((f) => f.w >= 40 && f.h >= 14 && f.y < 40);
if (zoomish2.length === 0) ok('send A draws no zoom-box pop-up');
else bad('send A draws no zoom-box pop-up', `${zoomish2.length} box-like fills`);

/* 8. A track ROUTED TO ANOTHER TRACK is visibly INERT, not merely absent
 *    (2026-09-04, the routed-track disabled-states check). Its column carries
 *    a drawn cross and NO fader; the fader count must not move. Control: the
 *    same track with no destination (plain MIDI out) draws its CC 7 fader. */
S.knobTouched = -1; S.sessMixerLatched = true; S.bankSelectTick = -1; S.sessKnobMode = 0;
S.trackRoute[6] = 2; S.trackMidiTo[6] = 3; S.sessVolSlots[6] = 0; S.sessVolBus[6] = 0; S.sessVolLevel[6] = 0.5;
draw();
const fadersRouted = countFaders();
const colX0 = Math.round(6 * 16) + 4, colX1 = colX0 + 8;
const crossInk = px.filter((p) => p.x >= colX0 && p.x < colX1 && p.y > 26 && p.y < 42).length;
if (crossInk >= 12) ok('a track routed to another track draws an inert cross in its column');
else bad('a track routed to another track draws an inert cross in its column', `only ${crossInk} pixels in the column body`);
S.sessKnobMode = 1; draw();          /* the arc grid takes the same cell as an X box */
S.sessKnobMode = 0;
S.trackMidiTo[6] = 0; S.sessVolLevel[6] = 0.5;
draw();
if (countFaders() === fadersRouted + 1) ok('control: the same track with no destination draws its CC 7 fader instead');
else bad('control: the same track with no destination draws its CC 7 fader instead', `${fadersRouted} -> ${countFaders()}`);
S.trackRoute[6] = 0; S.trackMidiTo[6] = 0;

if (failed) process.exit(1);
console.log('test_session_mixer_render: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
