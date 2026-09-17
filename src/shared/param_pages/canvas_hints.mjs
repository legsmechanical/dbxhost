/*
 * What a module canvas says at the bottom of the screen.
 *
 * ⚠⚠ ONE DEFINITION, TWO SURFACES. The host draws this footer in
 * drawCanvasPreview and dAVEBOx draws it in its own renderer, and for one
 * afternoon they said different things: the host showed the parameter's VALUE
 * and its title (its behaviour since canvas params existed), while davebox
 * showed a Back hint, because whoever wrote the second one followed the local
 * chrome idiom without comparing the two. Dress is meant to differ between
 * those surfaces; CONTENT is not. So the decision lives here and each surface
 * only renders it.
 *
 * Josh, 2026-09-17: "we don't need the directory footer. we need a back hint
 * with an L-shaped 'up a level' arrow where appropriate that switches to a
 * back/exit hint at the top level. we also need to add a jog/pages hint when
 * shift is held to indicate the escape hatch."
 */

/*
 * The Back hint's meaning: climb a level, or leave.
 *
 * ⚠ THE WORD, not a glyph. An arrow reads better mid-navigation and was built
 * first -- but font4x5 has no arrow, and adding one meant a 60th character in a
 * table the eleven frozen typeface studies of the style catalog are each
 * checked complete against, plus the same glyph again in davebox's
 * transcription of that font. Three files and a test rule bent, so that a
 * footer could say a symbol instead of two letters. Josh: "this is too much
 * trouble. back/up instead of the glyph."
 */
export const HINT_UP   = "up";
export const HINT_EXIT = "exit";
/** The escape hatch, shown only while Shift is down. */
export const HINT_PAGES = "pages";

/*
 * The hints for one canvas, as {key, action} in DRAW ORDER.
 *
 *   canGoUp    the module says Back would climb rather than leave. A module
 *              answers through the optional `canGoUp` hook; absent, we assume
 *              it cannot, because a visualiser has no levels and a wrong hint
 *              is worse than a missing one.
 *   shiftHeld  Shift is down, so the escape hatch is live and should say so.
 *              Advertised ONLY while held: it is the way out of a screen whose
 *              own navigation has gone wrong, and a permanently visible hint
 *              for that would be clutter on every canvas that works.
 *   enterable  a visualiser gets no hints at all -- the click still closes it,
 *              which is what its footer already said.
 */
export function canvasHints({ enterable = false, canGoUp = false, shiftHeld = false } = {}) {
    if (!enterable) return [];
    const out = [];
    /* The escape hatch goes FIRST, because Back is pinned to the right edge on
     * both surfaces and a hint that appears between them would push it. */
    if (shiftHeld) out.push({ key: "jog", action: HINT_PAGES });
    out.push({ key: "back", action: canGoUp ? HINT_UP : HINT_EXIT });
    return out;
}

/*
 * Ask a module whether Back would climb.
 *
 * ⚠ DRAW PATH. This must not read a parameter -- it is called once per frame,
 * and a param read costs more than a whole page render. A module answers from
 * its own state, which is the only place the answer lives anyway.
 *
 * ⚠ A THROW IS A "NO". The hint is cosmetic and must never be able to take the
 * screen down, and a module whose own navigation is broken is exactly the one
 * we do not want promising a level it cannot climb.
 */
export function canvasCanGoUp(overlay, ctx) {
    if (!overlay || typeof overlay.canGoUp !== "function") return false;
    try { return overlay.canGoUp(ctx) === true; }
    catch (e) { return false; }
}
