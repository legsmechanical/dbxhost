/* pp_ctx.mjs — davebox's half of the host's param-pages binding.
 *
 * ⭐ WHAT THIS IS FOR (Josh, 2026-08-31): "when i'm in davebox's module editing
 * interface i want it to be no different than when i'm in stock's module
 * editing interface."
 *
 * It is not different, because it is not a reimplementation: davebox runs the
 * host's own `shadow_ui_param_pages.mjs`, vendored into the bundle at build
 * time (see scripts/bundle_ui.sh for why a copy and not an import), over the
 * shared `param_pages/` engine imported unmodified. Everything that decides how
 * the editor looks and behaves -- the page planner, the movy grid, the widgets,
 * knob feel, the page kinds, the menus, both layouts -- is stock's code.
 *
 * THIS FILE IS THE ONLY SEAM. The binding reaches the host through exactly one
 * object, and this is davebox's version of it. The host fills its copy from
 * shadow_ui.js at init; davebox fills this one from ui_sound.mjs at init, which
 * is the same pattern for the same reason.
 *
 * ⚠ READ MEMBERS INSIDE FUNCTION BODIES, NEVER AT TOP LEVEL. `ctx` is empty
 * until installPpCtx() runs, exactly as the host's shadow_ui_ctx.mjs is empty
 * until shadow_ui.js populates it. That rule is also what keeps this file free
 * of an import cycle: ui_sound.mjs imports the binding, so this file must not
 * import ui_sound.mjs back.
 *
 * ⚠⚠ THE SET OF MEMBERS IS NOT OURS TO CHOOSE. It is whatever
 * src/shadow/shadow_ui_param_pages.mjs reads off `ctx`, and that file is
 * vendored verbatim -- so if it grows a member and this does not, the editor
 * loses a behaviour silently (most of the reads are `typeof === 'function'`
 * guarded, so a missing member is a quiet fallback, not an error).
 * `tests/host/test_param_pages_vendor.sh` extracts the reads from the binding's
 * CODE and fails if this file does not answer them.
 */

export const ctx = {};

/* Fill the seam. Called once from ui_sound.mjs at init, before any entry into
 * the editor. Assign rather than replace, so the object the vendored binding
 * captured at import time stays the one it reads. */
export function installPpCtx(members) {
    for (const k of Object.keys(members || {})) ctx[k] = members[k];
    return ctx;
}

/* ===========================================================================
 * THE CONTRACT — every member src/shadow/shadow_ui_param_pages.mjs reads off
 * `ctx`, with what it is used for and what davebox must answer with. Kept here
 * because the binding is vendored verbatim and therefore carries no davebox
 * notes of its own, and pinned member-for-member by
 * tests/host/test_param_pages_vendor.sh, which reads the list out of the
 * binding's CODE rather than out of this comment.
 *
 * ⚠⚠ MOST OF THESE READS ARE `typeof === 'function'` GUARDED. A member davebox
 * does not supply is NOT an error — the editor silently drops whatever that
 * member does, and drops it in a way that looks like a design choice. That is
 * why every one is listed, including the ones deliberately not answered yet.
 *
 *   getSlotParam(slot, key) -> raw
 *       Every value the grid shows. -> engineGet(slot, comp, key).
 *
 *   setSlotParam(slot, key, value)
 *       ⚠⚠ MUST NOT be engineSet(). engineSet is a raw fire-and-forget
 *       shadow_set_param: in overtake the host has ~8ms of mailbox patience and
 *       then STOMPS an unconsumed request, so writes vanish with nothing logged.
 *       Sound mode's answer is the verify-and-rewrite ledger (`a71cd569`,
 *       S.pendingWrites / verifyInflight in ui_sound.mjs) — a write is not done
 *       until a read confirms it. This must enter that ledger. Wiring the grid
 *       straight to engineSet would lose edits exactly as sound mode's did.
 *
 *   isParamModulated(slot, key) -> bool
 *       Draws the modulation mark on a cell. davebox knows its own LFO targets.
 *
 *   isMuteHeld() -> bool
 *       Mute + touch a knob = reset that param to its declared default.
 *
 *   requestRedraw()
 *       -> S.dirty = true.
 *
 *   setView(v) / VIEWS
 *       ⚠ NEVER the host's real setView. The binding calls
 *       `ctx.setView(ctx.VIEWS.PARAM_PAGES)` on entry and `ctx.setView(back)` on
 *       exit; pointing those at the host would yank the screen out of overtake
 *       mid-session. davebox supplies its OWN view setter and its own VIEWS
 *       constants. `chrome.returnView` overrides the exit target, so
 *       VIEWS.CHAIN_EDIT is only the fallback.
 *
 *   getModuleDisplayName(ref) / getModuleAbbrev(ref) -> string
 *       The header title. davebox has both readings already.
 *
 *   evaluateVisibilityCondition(condition, levelDef) -> bool
 *       🔴 KNOWN GAP, not yet answered. `visible_if` on a param or level. The
 *       host's evaluator is shadow_ui.js:2646-2700 and its four helpers
 *       (parseMetaBool / parseMetaNumber / compareConditionValue /
 *       normalizeVisibilityConditionKey) are host-only — none is in shared/ — so
 *       this is the one member that is a PORT rather than a wire-up, and a port
 *       is the drift shape this repo keeps paying for. Unanswered, the
 *       controller's default shows everything, so davebox would display params
 *       stock HIDES. That is a real difference from stock and it is why this is
 *       written down rather than left to be noticed.
 *
 *   openParamEditor(slot, fullKey, meta)
 *       🔴 KNOWN GAP. A param the grid will not turn — filepath, canvas,
 *       wav_position, string — hands off to a fullscreen editor. davebox has
 *       file and text screens to point this at.
 *
 *   openEnumPicker(opts)
 *       🔴 KNOWN GAP. The fullscreen enum list. Drawable with the shared
 *       enum_list.mjs; the commit path goes back through the controller so the
 *       grid stays alive underneath.
 *
 *   runSlotAction(slot, action)
 *       🔴 KNOWN GAP. What a PAGE_MENU entry's action does (Save / Delete /
 *       knob mapping). Note the fork host does not supply this either.
 *
 *   userPresetHeaderMark(slot, component) -> string|null
 *       The header's "this is a user preset" mark. Fork host does not supply it.
 *
 *   headerPresetName -> boolean
 *       false = the header title is the chrome LABEL alone (davebox's label
 *       is modLabel(), the module) — no patch name, and no abbreviation
 *       either: the first cut appended the abbrev and rendered the module
 *       twice. A deliberate, Josh-ruled divergence from stock (2026-08-31:
 *       "don't show preset name on editor header breadcrumbs"). Default-on
 *       in the binding.
 * ======================================================================== */

/* The contract as DATA, not prose — every member the binding reads, split into
 * the ones davebox answers and the ones it deliberately does NOT.
 *
 * ⚠⚠ WHY THIS IS DATA. Almost every read in the binding is
 * `typeof === 'function'` guarded, so a member davebox forgets is not an error:
 * the editor silently drops whatever that member does, and the drop looks like
 * a design choice. A list in a COMMENT cannot be checked, and this repo has
 * twice shipped a source pin that passed because it was reading prose rather
 * than code. tests/host/test_param_pages_vendor.sh reads THESE arrays, the
 * binding's own code, AND what ui_sound actually installs, and fails if any two
 * disagree. */
export const PP_CTX_MEMBERS = [
    'getSlotParam', 'setSlotParam', 'isMuteHeld', 'requestRedraw',
    'setView', 'VIEWS', 'getModuleAbbrev',
    'evaluateVisibilityCondition', 'isParamModulated', 'openParamEditor',
    'headerPresetName',
];

/* ⭐⭐ DELIBERATELY ABSENT — because THE HOST OMITS THEM TOO, and davebox is
 * supposed to be no different from stock rather than politely better than it.
 *
 * shadow_ui.js says so in as many words, at the block that fills its own ctx:
 *   "The four upstream entries with no fork equivalent — getModuleDisplayName,
 *    userPresetHeaderMark, runSlotAction, openEnumPicker — are deliberately
 *    absent; each has a documented fallback in that module (the abbreviation,
 *    the module's own patch name, an inert menu row, and the list editor
 *    respectively)."
 *
 * ⚠ Supplying any of these would make davebox's editor differ from stock's on
 * this build — in the nicer direction, which is still a difference and still a
 * surprise. If the host ever grows one, davebox should grow it in the same pass.
 *
 * ⭑ Note what the fourth one costs and where it is paid: with openEnumPicker
 * absent, clicking a long option list falls through to openParamEditor — which
 * davebox answers by handing the component to its OWN editor, exactly as the
 * host hands it to the hierarchy list editor. The option list is reachable;
 * it is reached the way stock reaches it. */
export const PP_CTX_ABSENT = [
    'getModuleDisplayName',
    'userPresetHeaderMark',
    'runSlotAction',
    'openEnumPicker',
];
