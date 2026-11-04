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
 * by the one that did. */

let F = null;

export function hudFrameBegin() { F = { screen: null, layer: 'body', body: [], overlay: [] }; }
export function hudFrameOpen() { return F !== null; }

/* Name the screen being drawn. Cheap and safe with no frame open (the
 * ordinary case: nobody watching). */
export function hudScreen(id) { if (F && F.layer === 'body') F.screen = id; }

export function hudLayer(name) { if (F) F.layer = name; }

/* The sink: one call per primitive drawn, its arguments untouched. */
export function hudRecord(kind, payload) { if (F) F[F.layer].push([kind, payload]); }

export function hudFrameEnd() { const f = F; F = null; return f; }
