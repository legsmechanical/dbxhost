/* hud_frame.mjs — the per-frame recorder behind the browser's Screen view.
 *
 * While a viewer is connected, drawUI() opens a frame, the ui_movy primitives
 * report every call to record() through the kit's HUD sink (and non-primitive
 * drawing through kitHudTap), and the frame is closed and handed to the
 * document builder (hud_doc.mjs). Nothing here draws or reads state.
 *
 * A frame has two LAYERS: `body` (the screen drawUIBody chose) and `overlay`
 * (the cards drawn over any screen afterwards — the bank picker, the track
 * volume card, notices). drawUI switches layers between the two.
 *
 * `screen` is the stable id of the body screen, set by hudScreen() at the
 * dispatcher branch that drew it. The LAST id of the body wins, so the most
 * specific name stands: a branch that delegates (the bank card → the STEP
 * page, soundRender → one of its views) is renamed by the screen it reached,
 * and a branch that tagged and then fell through without drawing is renamed
 * by the one that did.
 *
 * A third layer, `knobs`, holds the KNOB PAGE of a Track / Session view
 * screen that the OLED is not showing (ui_render.mjs hudDescribeKnobs): the
 * big screen keeps the overview up and shows what the knobs do beneath it,
 * so a knob touch does not switch the screen away. Drawn with the display
 * muted — it is described, never shown. */

let F = null;

export function hudFrameBegin() { F = { screen: null, layer: 'body', body: [], overlay: [], knobs: [], knobsScreen: null }; }
export function hudFrameOpen() { return F !== null; }

/* Name the screen being drawn. Cheap and safe with no frame open (the
 * ordinary case: nobody watching). */
export function hudScreen(id) {
    if (!F) return;
    if (F.layer === 'body') F.screen = id;
    else if (F.layer === 'knobs') F.knobsScreen = id;
}
/* the body screen named so far (null with no frame open) */
export function hudFrameScreen() { return F ? F.screen : null; }
/* A knob page was what the body drew: it becomes the knobs layer, and the
 * body starts over (for the overview to be described into it). */
export function hudBodyToKnobs() {
    if (!F) return;
    F.knobs = F.body; F.knobsScreen = F.screen; F.body = []; F.screen = null;
}
/* the knobs layer's calls so far (to judge whether it holds a knob page) */
export function hudFrameKnobs() { return F ? F.knobs : []; }
/* ...and back, when the overview could not be described after all */
export function hudKnobsToBody() {
    if (!F) return;
    F.body = F.knobs; F.screen = F.knobsScreen; F.knobs = []; F.knobsScreen = null;
}

export function hudLayer(name) { if (F) F.layer = name; }

/* The sink: one call per primitive drawn, its arguments untouched. */
export function hudRecord(kind, payload) { if (F) F[F.layer].push([kind, payload]); }

export function hudFrameEnd() { const f = F; F = null; return f; }
