/*
 * shadow_ui_param_pages.mjs — the shadow UI's instance of the module editor.
 *
 * ⭐ THE EDITOR ITSELF MOVED to shared/param_pages/binding_movy.mjs and became a
 * FACTORY. This file is now just "the shadow UI's one", created over the ctx
 * that shadow_ui.js fills in — so every call site in shadow_ui.js keeps working
 * unchanged, and the same code serves dAVEBOx from its own ctx.
 *
 * ⚠⚠ WHY IT MOVED, and it is not tidiness. dbxhost is dAVEBOx's own host,
 * maintained on a separate track to serve what dAVEBOx needs (workspace
 * CLAUDE.md: "there is no conceptual separation between what davebox needs and
 * what the host can provide"). But a MODULE can only import from `shared/` —
 * the QuickJS loader rewrites that prefix and no other (SHARED_IMPORT_CANONICAL,
 * shadow_ui.c), so from `shadow/` a module would execute the STOCK tree. While
 * the editor lived here, dAVEBOx had to carry a frozen COPY of it, defended by a
 * stamp, a hand-edit detector and a skew check — machinery whose entire job was
 * to simulate being the same file. It IS the same file now.
 *
 * ⭑ And the singleton had to go with it: the binding held fourteen pieces of
 * module-level state closed over one ctx, which is precisely what
 * param_pages/README.md rule 4 forbids ("No module-level state — a tool has
 * four tracks x five components live at once"). The tool consumer that README
 * anticipates could not exist while the binding broke its own contract.
 *
 * ⚠ UPSTREAM SHAPE PRESERVED DELIBERATELY. Upstream keeps its editor at this
 * path with these export names; a pull that touches it lands here, on a shim
 * thin enough to re-read at a glance, rather than on 1,300 lines that have moved
 * house. Frictionless pulls are a goal, not a constraint — but this one is free.
 */
import { ctx } from './shadow_ui_ctx.mjs';
import { createParamPagesBinding }
    from '/data/UserData/schwung/shared/param_pages/binding_movy.mjs';

/* Re-exported unchanged: these are the library's own constants, not this
 * instance's — a layout id and a debounce are the same number for every
 * consumer, and pinning them per-instance would let two drift. */
export { LAYOUT_LIST } from '/data/UserData/schwung/shared/param_pages/page_controller.mjs';
export { CONTRACT_SETTLE_MS } from '/data/UserData/schwung/shared/param_pages/page_controller.mjs';

/* ⚠ Created at module load, like the singleton it replaces, so import order and
 * timing are exactly what they were. `ctx` is still empty at this point and
 * still filled by shadow_ui.js later — the binding only ever reads it inside
 * function bodies, which is the rule that made that safe before and now. */
const _view = createParamPagesBinding(ctx);

export const PARAM_VIEW_LIST = _view.PARAM_VIEW_LIST;
export const PARAM_VIEW_KNOBS = _view.PARAM_VIEW_KNOBS;
export const paramPagesEnabled = _view.paramPagesEnabled;
export const paramPagesLayout = _view.paramPagesLayout;
export const enterParamPages = _view.enterParamPages;
export const exitParamPages = _view.exitParamPages;
export const paramPagesExitMenu = _view.paramPagesExitMenu;
export const paramPagesRefreshTrailing = _view.paramPagesRefreshTrailing;
export const paramPagesActive = _view.paramPagesActive;
export const paramPagesComponent = _view.paramPagesComponent;
export const paramPagesSlot = _view.paramPagesSlot;
export const currentParamPage = _view.currentParamPage;
export const paramPagesChildIndex = _view.paramPagesChildIndex;
export const tickParamPages = _view.tickParamPages;
export const headerTitle = _view.headerTitle;
export const drawParamPages = _view.drawParamPages;
export const handleParamPagesMidi = _view.handleParamPagesMidi;
export const announceParamPageContents = _view.announceParamPageContents;
export const clearParamPagesTouch = _view.clearParamPagesTouch;
export const paramPagesJumpIndex = _view.paramPagesJumpIndex;
export const paramPagesGoTo = _view.paramPagesGoTo;
export const paramPagesRevealing = _view.paramPagesRevealing;
export const paramPagesFooterHints = _view.paramPagesFooterHints;
export const enumPickerFooterHints = _view.enumPickerFooterHints;
export const paramPagesPickerOpen = _view.paramPagesPickerOpen;
