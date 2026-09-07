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
 * src/shared/param_pages/binding_movy.mjs reads off `ctx` — the binding itself,
 * which davebox IMPORTS rather than copies (shadow_ui_param_pages.mjs is now a
 * four-line shim that creates the shadow UI's instance over its own ctx). If
 * the binding grows a member and this does not, the editor loses a behaviour
 * silently: most of the reads are `typeof === 'function'` guarded, so a missing
 * member is a quiet fallback, not an error.
 * `tests/host/test_param_pages_vendor.sh` extracts the reads from the binding's
 * CODE and fails if this file does not answer them.
 */

export const ctx = {};

/* Fill the seam. Called once from ui_sound.mjs at init, before any entry into
 * the editor. Assign rather than replace, so the object the vendored binding
 * captured at import time stays the one it reads. */
/*
 * The QuickJS file reader for sample waveforms, handed over by the ENTRY POINT.
 *
 * ⚠⚠ IT CANNOT BE IMPORTED HERE, OR IN ui_sound. `wav_io_qjs.mjs` names `std`
 * and `os`, and `test_wav_peaks_io_registered.sh` pins that only the two
 * device-only entry points may reference it — every JS test imports ui_sound,
 * and a module that names those is unloadable under node. So the reader arrives
 * as a VALUE from ui.js and is put on the ctx here.
 *
 * ⭑ Why it must reach the ctx at all: the binding registers it into the
 * `wav_peaks` instance that the grid's PUMP and its DRAWER share, and nothing
 * outside the library can reach that one. Registering only from ui.js reached a
 * different instance — the fullscreen editor drew waveforms while every cell
 * stayed flat.
 */
export function setPpWavPeaksIo(io) { ctx.wavPeaksIo = io; }

export function installPpCtx(members) {
    for (const k of Object.keys(members || {})) ctx[k] = members[k];
    return ctx;
}

/* ===========================================================================
 * THE CONTRACT — every member src/shared/param_pages/binding_movy.mjs reads
 * off `ctx`, with what it is used for and what davebox must answer with. Kept
 * here because the binding is shared code and therefore carries no davebox
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
 *       ⚠ NOT "reset to default" any more, on either side. The library's own
 *       Mute+touch reset was DROPPED upstream (9e4e0bad) and is not in this
 *       tree — grep resetToDefault, there is nothing. davebox spends the
 *       gesture on its own automation instead: Mute+touch TOGGLES the
 *       parameter's automation on/off, Delete+touch CLEARS it
 *       (ui_sound.mjs, automationToggleActive). The collision the two
 *       meanings used to have went away with upstream's removal.
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
 *       ✅ ANSWERED (ui_sound.mjs, `evaluateVisibilityCondition:` in
 *       installPpCtx) through the ported evaluator in visibility.mjs. The
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
 *       ✅ ANSWERED (ui_sound.mjs, `openParamEditor:` in installPpCtx). A param
 *       the grid will not turn — filepath, canvas, wav_position, string, and a
 *       long enum list — leaves the grid for davebox's OWN bank editor, which
 *       is where its file browser, text entry and option list already live.
 *       That is the same shape the fork host uses (its openParamEditorFromGrid
 *       enters the hierarchy list editor), not a per-key editor built for the
 *       grid. ⚠ What it does NOT do is open a fullscreen WAVE editor for a
 *       sample: davebox has no such screen, which is why a click on a wave
 *       cell appears to do nothing.
 *
 *   openEnumPicker(opts)
 *       DELIBERATELY ABSENT, as on the fork host: a long option list dives out
 *       through openParamEditor to the bank editor, which has a picker.
 *       The fullscreen enum list is otherwise drawable Drawable with the shared
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
/*
 * ⚠ `wavPeaksIo` is DELIBERATELY NOT IN THIS LIST. Everything here is a member
 * `installPpCtx` supplies from ui_sound; the reader cannot come from there
 * (ui_sound must never reference wav_io_qjs — it names std/os and every JS test
 * imports ui_sound), so it arrives out of band from the entry point via
 * `setPpWavPeaksIo`. Listing it would make this contract claim ui_sound answers
 * something it must not.
 */
export const PP_CTX_MEMBERS = [
    'getSlotParam', 'setSlotParam', 'isMuteHeld', 'requestRedraw',
    'setView', 'VIEWS', 'getModuleAbbrev',
    'evaluateVisibilityCondition', 'isParamModulated', 'openParamEditor',
    'headerPresetName',
    /* A parameter's module-supplied card drawer. Answered, not absent: the host
     * answers it too, and this is where these modules are actually played — a
     * card that worked on stock and silently did nothing here would be the
     * worse half of the feature. */
    'loadCardScript',
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
/*
 * Members the ENTRY POINT supplies out of band, not `installPpCtx`.
 *
 * ⚠⚠ A THIRD CATEGORY EXISTS BECAUSE A REAL CONSTRAINT DOES. `wavPeaksIo` is
 * the QuickJS file reader, and `wav_io_qjs.mjs` names `std`/`os`: only the two
 * device-only entry points may reference it, because every JS test imports
 * ui_sound and a module naming those is unloadable under node
 * (`test_wav_peaks_io_registered.sh` pins exactly that). So ui.js hands it over
 * through `setPpWavPeaksIo`.
 *
 * It is DECLARED rather than exempted: the binding reads it, so the contract
 * has to name it, or the vendor pin cannot tell a deliberate out-of-band member
 * from one somebody forgot.
 */
export const PP_CTX_DEFERRED = ['wavPeaksIo'];

export const PP_CTX_ABSENT = [
    'getModuleDisplayName',
    'userPresetHeaderMark',
    'runSlotAction',
    'openEnumPicker',
];
