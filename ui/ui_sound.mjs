/* ui_sound.mjs — SOUND MODE: edit a track's instrument and effects in place.
 *
 * Spec: docs/reference/SOUND_MODE.md. Pipeline: docs/reference/MODULE_HOSTING.md.
 *
 *   block picker  -> the track's chain: MIDI FX / SYNTH / FX1..FX4
 *   editor        -> canvaskit bank pages built from the module's own metadata
 *   browser       -> pick a module for a block (an EMPTY block is how an
 *                    effect gets added at all)
 *
 * Deliberately self-contained: it takes the track's slot as an argument rather
 * than importing davebox state, so it stays testable off-device and so the
 * standalone port has one less coupling to unpick. The only engine access is
 * through ui_engine.mjs — that rule is the whole reason the port is cheap.
 *
 * TIMING — the constraint that bites. shadow_get/set_param are synchronous SHM
 * round-trips. The lab rig calls them straight from its MIDI handler because it
 * has no timing obligations; davebox is a SEQUENCER and must not. Every write
 * is queued and drained in tick(), and polling is budgeted. Getting this wrong
 * shows up as sequencer jitter, not as a broken editor.
 */

import * as os from 'os';
import {
    COMPONENTS, PRESET_ROOT, engineGet, engineSet, engineListModules,
    engineLoadModule, engineLoadedModule, engineGetState, engineSetState,
    engineListUserPresets, engineReadUserPreset,
    engineGetSlotParam, engineSetSlotParam, engineSaveState, engineVolBlock,
    SLOT_LEVEL_KEY, SLOT_LEVEL_STEP, SLOT_LEVEL_MAX,
} from './ui_engine.mjs';
/* davebox's GLOBAL state. Sound mode keeps its own `S`, so this is imported
 * under a different name deliberately — the two are easy to confuse, and
 * confusing them is exactly what broke the bypass gesture. Used only for the
 * Back long-press, which davebox owns module-wide. */
import { S as GS } from './ui_state.mjs';
import {
    openTextEntry, isTextEntryActive, handleTextEntryMidi, drawTextEntry, tickTextEntry,
    closeTextEntry,
} from '/data/UserData/schwung/shared/text_entry.mjs';
import {
    buildFilepathBrowserState, refreshFilepathBrowser,
    moveFilepathBrowserSelection, activateFilepathBrowserItem,
} from '/data/UserData/schwung/shared/filepath_browser.mjs';
import { discover, deriveSections, activeSection, filterVizFor,
    menuRows, menuCell } from './ui_discover.mjs';
import { parseValue, stepValue, commitString, renderCellsForBank,
    formatValue } from './ui_cells.mjs';
import {
    drawKitBankPage, drawKitHeader, drawKitSectionPicker,
    hdrPrint, mvPrint, mvWidth,
} from './ui_movy.mjs';

/* Chain blocks in signal order. This fork runs FOUR audio-FX blocks where
 * upstream has two — any block logic must cover fx3/fx4. */
export const BLOCKS = [
    { comp: 'midi_fx1', label: 'MIDI FX' },
    { comp: 'synth',    label: 'SYNTH'   },
    { comp: 'fx1',      label: 'FX 1'    },
    { comp: 'fx2',      label: 'FX 2'    },
    { comp: 'fx3',      label: 'FX 3'    },
    { comp: 'fx4',      label: 'FX 4'    },
];

/* ---- global FX buses ----
 *
 * Master FX and the two Send FX chains are the same shape as a slot's audio-FX
 * blocks — four components, each with params, a hierarchy and presets — but
 * they belong to the whole set rather than a track, and they live at slot 0.
 *
 * Addressing comes straight from the host's FX_BUS table (`shadow_ui.js`):
 * `master_fx:fxN:` and `send_fx:{a,b}:fxN:`. davebox's engine layer already
 * copes, because `moduleReadKey` special-cases colon-namespaced components —
 * groundwork the lab rig laid before there was anywhere to use it.
 *
 * ⚠ ONE real difference: a bus component's `:module` key takes a **DSP path**,
 * not a module id. Loading by id silently does nothing there. */
const FX_BUSES = [
    { id: 'master', title: 'MASTER FX', prefix: 'master_fx:',
      levelComp: 'master_fx',    levelKey: 'volume',       levelLabel: 'Master Vol' },
    { id: 'sendA',  title: 'SEND FX A', prefix: 'send_fx:a:',
      levelComp: 'send_fx:a',    levelKey: 'return_level',  levelLabel: 'Return Lvl' },
    { id: 'sendB',  title: 'SEND FX B', prefix: 'send_fx:b:',
      levelComp: 'send_fx:b',    levelKey: 'return_level',  levelLabel: 'Return Lvl' },
];
const BUS_BLOCKS = [1, 2, 3, 4];      /* fx1..fx4 on every bus */

const VIEW_BLOCKS = 0, VIEW_EDIT = 1, VIEW_BROWSE = 2,
      VIEW_PRESET_SRC = 3, VIEW_PRESET_LIST = 4, VIEW_PRESET_BAKED = 5,
      VIEW_MENU = 6, VIEW_FILE = 7, VIEW_SLOTCFG = 8, VIEW_BUSES = 9;

/* ---- slot settings ----
 *
 * The SLOT's own params, as opposed to any module in it: where the track's
 * audio goes and how its MIDI is routed. They were reachable only by leaving
 * davebox for the host's chain editor, which is a long way to go for a send.
 *
 * Mirrors the host's CHAIN_SETTINGS_ITEMS — same keys, same ranges, so the two
 * screens can't disagree — minus the rows that are actions rather than values
 * (knob assignment, LFOs, patch save/delete) and minus MPE, which is a mode you
 * set once at the host rather than reach for mid-track.
 *
 * `fmt` exists because a raw number is a lie for most of these: -1 on a forward
 * channel means Auto, 0 on a receive channel means All. */
const CH_FMT = (v) => (v === 0 ? 'All' : 'Ch ' + v);
const FWD_FMT = (v) => (v === -2 ? 'Thru' : v === -1 ? 'Auto' : 'Ch ' + (v + 1));
const PCT_FMT = (v) => Math.round(v * 100) + '%';
const ST_FMT  = (v) => (v === 0 ? '0 st' : (v > 0 ? '+' : '') + v + ' st');
const ONOFF   = (v) => (v ? 'Yes' : 'No');

const SLOT_SETTINGS = [
    { key: 'volume',        label: 'Volume',      min: 0, max: 4, step: 0.05, fmt: PCT_FMT },
    /* Module Level is deliberately NOT here — it belongs to whatever module is
     * loaded, not to the slot, and it already lives at the root of that
     * module's own menu. Two homes would make it ambiguous which one wins. */
    { key: 'send_a',        label: 'Send A',      min: 0, max: 1, step: 0.05, fmt: PCT_FMT, cap: 'sends' },
    { key: 'send_b',        label: 'Send B',      min: 0, max: 1, step: 0.05, fmt: PCT_FMT, cap: 'sends' },
    { key: 'transpose',     label: 'Transpose',   min: -12, max: 12, step: 1, int: true, fmt: ST_FMT },
    { key: 'receive_channel', label: 'Recv Ch',   min: 0, max: 16, step: 1, int: true, fmt: CH_FMT },
    { key: 'forward_channel', label: 'Fwd Ch',    min: -2, max: 15, step: 1, int: true, fmt: FWD_FMT },
    { key: 'muted',         label: 'Muted',       min: 0, max: 1, step: 1, int: true, fmt: ONOFF },
    { key: 'soloed',        label: 'Soloed',      min: 0, max: 1, step: 1, int: true, fmt: ONOFF },
    { key: 'move_to_slot',  label: 'Move>Schw',   min: 0, max: 1, step: 1, int: true, fmt: ONOFF },
];

/* The jog-click picker offers three destinations, and they are NOT the same
 * kind of thing — rows are dispatched by `kind`, never by a fixed index, since
 * the baked row only exists for modules that publish a bank:
 *  user  — files under presets/<module-id>/, wrapped {name,module,version,state};
 *          recalled through the ordinary <comp>:state slot-load path.
 *  baked — the module's own list_param/count_param/name_param bank. No files;
 *          names have to be harvested by selecting each index (see openBaked).
 *  menu  — hand the slot to Schwung's own chain editor: the full module
 *          hierarchy, for everything the canvas pages don't surface. */

/* ~160ms at davebox's ~94Hz tick. The host uses 7 ticks at ~44Hz for the same
 * feel; copying the NUMBER rather than the duration would make preview twice
 * as twitchy here. */
const PREVIEW_DELAY_TICKS = 15;
const BAKED_SCAN_PER_TICK = 2;        /* while PLAYING: same SHM budget as the write drain */
const BAKED_SCAN_PER_TICK_IDLE = 12;  /* stopped: nothing competes for the tick */
const SAVE_ROW = 0;

/* The slot level is a 0..4 gain, host-clamped, 1.0 = unity. The per-detent step
 * is SLOT_LEVEL_STEP, shared with the session-view knobs so both feel the same;
 * its header explains why the step is as fine as it is. */
const VOL_MIN = 0, VOL_MAX = SLOT_LEVEL_MAX, VOL_STEP = SLOT_LEVEL_STEP;
const VOL_SHOW_TICKS = 94;      /* ~1s readout after the last turn */

/* Poll cadences, in ticks (~94Hz). Deliberately slower than the lab rig's flat
 * 8 — davebox's tick is already busy, so idle refresh is cheap and the
 * responsive cases (entry, bank change, touch) are handled by explicit repolls. */
const POLL_IDLE_TICKS = 24;
const WRITES_PER_TICK = 2;      /* bound the per-tick SHM cost */
const TOUCH_HOLD_TICKS = 45;

const S = {
    active: false,
    track: -1,
    slot: -1,
    view: VIEW_BLOCKS,

    blockIdx: 1,                /* default to SYNTH, the common case */
    comp: 'synth',

    banks: [],
    sections: [],
    bankIdx: 0,
    moduleId: '',

    values: {},
    rawValues: {},
    knobAccum: [0, 0, 0, 0, 0, 0, 0, 0],
    touchedIdx: -1,
    touchedTick: 0,
    touchHeld: false,
    turnedSinceTouch: false,

    browseList: [],
    browseIdx: 0,

    /* presets */
    presetSpec: null,           /* baked bank {listKey,countKey,nameKey} or null */
    presetSrcIdx: 0,
    srcRows: [],                /* [{kind,label}] — user / baked (if any) / menu */
    /* Module menu: the module's own parameter hierarchy, walked directly. The
     * knob pages are a lossy projection of this (knobs[] only), so anything a
     * module declares but doesn't knob-map is reachable ONLY here. */
    levels: null,
    rootKey: null,
    cpMap: null,
    menuStack: [],              /* [{levelKey, cursor}] — breadcrumb for Back */
    menuKey: null,
    menuIdx: 0,
    menuRowsCache: [],
    menuEditing: false,         /* jog edits the highlighted param instead of scrolling */
    fileState: null,            /* shared filepath_browser state, when browsing */
    fileKey: '',                /* param the browse will write on select */
    userPresets: [],
    userIdx: 0,                 /* 0 = the [Save current...] row; presets start at 1 */
    bakedCount: 0,
    bakedIdx: 0,
    bakedNames: [],
    bakedScan: -1,              /* prescan cursor; -1 = idle */
    bakedScanRestore: 0,        /* index to put back when the scan finishes */
    bakedCacheKey: '',          /* moduleId|comp|count the cached names belong to */
    bakedFp: '',                /* fingerprint of the preset SET those names came from */
    presetMsg: '',

    /* Audition. Scrolling applies the highlighted preset so you hear it before
     * committing; Back puts the original sound back. Debounced through tick so
     * a fast scroll doesn't reload state on every detent. Disabled when the
     * original can't be captured — better no preview than no way back. */
    origState: null,
    previewIdx: -1,
    previewDelay: 0,

    /* Shift+click on a preset asks to delete it; plain click loads. */
    confirmDel: false,
    confirmIdx: 0,              /* 0 = No, 1 = Yes */

    pendingWrites: [],
    pendingDiscover: 0,
    /* Single-slot navigation queue. Knob edits were always deferred, but the
     * VIEW transitions are the expensive ones — a discovery pass is dozens of
     * get_params and the browser is a filesystem scan. Doing either from the
     * MIDI handler is the exact mistake this module's header warns about, so
     * every one of them is queued here and run in soundTick(). Latest wins:
     * you can only be navigating to one place at a time. */
    pendingAction: null,
    needsPoll: false,           /* forced re-read owed (bank change) */
    blockNames: [],             /* loaded module id per block, for the picker */
    blockBypass: [],            /* 1 = that block is bypassed (host `<comp>:bypassed`) */
    muteHeld: false,            /* tracked HERE: the global one is a different S */
    bus: null,                  /* null = editing a TRACK's slot; else an FX_BUSES entry */
    busIdx: 0,                  /* cursor on the bus LIST */
    pickRows: [],               /* picker rows: {kind:'bus'|'block'|'settings'} */
    trackSlot: -1,              /* the slot to come back to when leaving a bus */
    pickRow: 0,                 /* cursor in the block PICKER (rows, not blocks) */
    blockRows: [],              /* block indices this host actually supports */
    slotRows: [],               /* SLOT_SETTINGS entries this host supports */
    capFx34: false,
    capSends: false,
    slotCfgIdx: 0,
    slotCfgVals: [],            /* live values, index-aligned with SLOT_SETTINGS */
    slotCfgEditing: false,
    slotCfgDirty: false,        /* something changed; save on leaving the screen */
    pendingSlotWrites: [],      /* slot-param writes, drained in tick */

    shiftHeld: false,
    tickCount: 0,
    dirty: true,
    ledDirty: false,   /* text entry repainted the pads; davebox must re-assert */

    /* Slot level on the master knob. Claimed for the whole of sound mode, so
     * plain Volume means "this chain's level" and Move's master is untouched
     * until you leave. */
    volLevel: 1,
    volShownUntil: -1,
    volTouched: false,
    volDirtySave: false,   /* level changed since the last persist */
    volPending: false,     /* level write owed to the engine (drained in tick) */
};

function log(msg) {
    if (typeof console !== 'undefined' && console.log) console.log('[sound] ' + msg);
}

export function soundActive() { return S.active; }
export function soundTrack() { return S.track; }
export function soundSlot()  { return S.slot; }

/* The keyboard is fully modal and wants the RAW message (it reads pads, jog and
 * buttons itself), so it hooks in ahead of every other dispatch rather than
 * through soundOnCC/soundOnNote. It paints its own pad LEDs, so davebox's have
 * to be re-asserted when it closes — see soundConsumeLedDirty. */
export function soundOnMidiRaw(data) {
    if (!S.active || !isTextEntryActive()) return false;
    handleTextEntryMidi(data);
    if (!isTextEntryActive()) { S.ledDirty = true; S.dirty = true; }
    return true;
}

export function soundConsumeLedDirty() {
    const d = S.ledDirty; S.ledDirty = false; return d;
}
export function soundDirty() { const d = S.dirty; S.dirty = false; return d; }
export function markSoundDirty() { S.dirty = true; }

/* ---- lifecycle ---- */

export function soundEnter(track, slot) {
    S.active = true;
    S.track = track;
    S.slot = slot;
    S.view = VIEW_BLOCKS;
    S.shiftHeld = false;
    S.touchedIdx = -1;
    S.turnedSinceTouch = false;
    S.pendingWrites.length = 0;
    S.blockNames = [];
    S.pendingAction = { t: 'names' };
    claimVolume(slot);
    S.dirty = true;
    log('enter: track ' + track + ' slot ' + slot);
}

/* Follow the track. Sound mode is bound to one track's slot, so a track change
 * used to close it; now it re-points at the new track instead. Your PLACE in the
 * chain is kept — if you were on SYNTH you stay on SYNTH — because the usual
 * reason to switch mid-edit is comparing the same block across two tracks.
 * An empty block on the new track falls back to the picker rather than the
 * module browser, which would be a startling thing to land in unasked. */
export function soundRetarget(track, slot) {
    /* Flush against the OLD slot first: these edits were made to that track and
     * must not follow you to the next one. */
    for (const w of S.pendingWrites) engineSet(w.slot, w.comp, w.key, w.val);
    S.pendingWrites.length = 0;
    /* Same for slot params — they carry their own slot, so landing them here is
     * correct rather than merely tidy. */
    for (const w of S.pendingSlotWrites) {
        const s = SLOT_SETTINGS.find(x => x.key === w.key);
        engineSetSlotParam(w.slot, w.key, s && s.int ? String(w.val) : w.val.toFixed(3));
    }
    S.pendingSlotWrites.length = 0;
    if (S.slotCfgDirty) { S.slotCfgDirty = false; engineSaveState(); }

    S.track = track;
    /* A BUS is global — following the active track must not drag its editing
     * context off slot 0. Remember where to return and leave the view alone. */
    if (S.bus) { S.trackSlot = slot; S.dirty = true; return; }
    S.slot = slot;
    S.shiftHeld = false;
    S.touchedIdx = -1;
    S.turnedSinceTouch = false;
    /* Everything below described the PREVIOUS module: an audition baseline, a
     * name cache, a half-open dialog, a browser position. None of it transfers. */
    S.origState = null;
    S.previewIdx = -1;
    S.previewDelay = 0;
    S.confirmDel = false;
    S.bakedCacheKey = '';
    S.bakedScan = -1;
    S.fileState = null;
    S.menuStack = [];
    S.menuKey = null;
    S.menuRowsCache = [];
    S.menuEditing = false;
    S.banks = [];
    S.sections = [];
    S.bankIdx = 0;
    S.moduleId = '';
    S.blockNames = [];
    S.presetMsg = '';
    S.pendingDiscover = 0;
    S.pendingAction = { t: 'retarget' };
    /* Persist the OLD slot's level before the reading moves — the claim itself
     * stays up, we're still in sound mode. */
    if (S.volPending) {                    /* land it on the OLD slot first */
        S.volPending = false;
        engineSetSlotParam(S.slot, SLOT_LEVEL_KEY, S.volLevel.toFixed(3));
    }
    flushVolumeSave();
    S.volLevel = readSlotVolume(slot);
    S.volShownUntil = -1;
    S.dirty = true;
    log('retarget: track ' + track + ' slot ' + slot + ' comp ' + S.comp);
}

export function soundExit() {
    /* The keyboard is modal and driven ONLY by soundOnMidiRaw, which gates on
     * S.active — so leaving with it open would strand it: still "active", never
     * fed another message, never drawn. Close it first. */
    if (isTextEntryActive()) closeTextEntry();
    releaseVolume();
    /* Slot edits are FLUSHED on the way out, not dropped like in-flight module
     * writes: a send you just dialled should survive leaving sound mode, and
     * each carries its own slot so landing them late is still correct. */
    for (const w of S.pendingSlotWrites) {
        const s = SLOT_SETTINGS.find(x => x.key === w.key);
        engineSetSlotParam(w.slot, w.key, s && s.int ? String(w.val) : w.val.toFixed(3));
    }
    S.pendingSlotWrites.length = 0;
    if (S.slotCfgDirty) { S.slotCfgDirty = false; engineSaveState(); }
    S.active = false;
    S.pendingWrites.length = 0;
    S.pendingAction = null;
    S.pendingDiscover = 0;
    S.dirty = true;
    log('exit');
}

/* Which module each block holds — drives the picker and the empty-block flow. */
function refreshBlockNames() {
    if (!S.bus) probeCaps();
    buildPickRows();
    /* Names and bypass are read per ROW, so a bus context reads its own four
     * components rather than the track's six. A bus reports a DSP PATH where a
     * chain slot reports a module id — show the basename, which is the module
     * directory and reads the same as the id would. */
    for (const r of S.pickRows) {
        if (r.kind !== 'block') continue;
        r.name = moduleIdOf(engineLoadedModule(S.slot, r.comp));
        r.bypassed = engineGet(S.slot, r.comp, 'bypassed') === '1' ? 1 : 0;
    }
}

/* ---- slot level on the master knob ----
 *
 * Plain Volume, for the whole of sound mode. Shift+Volume was the obvious
 * gesture and is unavailable: the host reserves Shift+Vol as its shadow-UI
 * entry prefix (Settings / Tools), and the shim eats it before a module sees
 * it. Claiming the knob outright avoids the collision and needs no modifier.
 *
 * The claim is what stops Move ALSO moving its master level and covering the
 * screen with its own volume overlay — CC 79 and touch note 8 are passed to
 * Move unconditionally otherwise, ahead of and independent of the module's
 * button_passthrough list, so there is no module.json way to opt out. */
function readSlotVolume(slot) {
    const raw = engineGetSlotParam(slot, SLOT_LEVEL_KEY);
    const v = parseFloat(raw);
    return (isFinite(v) && v >= 0) ? v : 1;
}

function claimVolume(slot) {
    S.volLevel = readSlotVolume(slot);
    S.volShownUntil = -1;
    S.volTouched = false;
    S.volDirtySave = false;
    engineVolBlock(true);
}

function releaseVolume() {
    flushVolumeSave();
    S.volTouched = false;
    S.volShownUntil = -1;
    engineVolBlock(false);
}

/* The host's slot-level setter updates runtime state but never persists, so
 * the write and the SAVE are separate acts. Saving is a synchronous file write,
 * so it happens once when the gesture ends — never per detent. */
function flushVolumeSave() {
    if (!S.volDirtySave) return;
    S.volDirtySave = false;
    engineSaveState();
}

function onVolumeTurn(delta) {
    let v = S.volLevel + delta * VOL_STEP;
    if (v < VOL_MIN) v = VOL_MIN;
    if (v > VOL_MAX) v = VOL_MAX;
    if (v === S.volLevel) return;
    S.volLevel = v;
    S.volDirtySave = true;
    S.volShownUntil = S.tickCount + VOL_SHOW_TICKS;
    /* Queued, NOT written here — this runs in the MIDI handler and
     * engineSetSlotParam is a synchronous SHM round-trip. A single flag is
     * enough: the level is one value, so a fast spin coalesces to one write per
     * tick for free. Drained in soundTick with everything else. */
    S.volPending = true;
    S.dirty = true;
}

/* ---- discovery ---- */

function openBlock(comp) {
    S.comp = comp;
    const bi = BLOCKS.findIndex(b => b.comp === comp);
    if (bi >= 0) S.blockIdx = bi;          /* meaningless on a bus, unused there */
    const id = engineLoadedModule(S.slot, S.comp);
    if (!id) { openBrowse(); return; }     /* empty block -> add something */
    S.view = VIEW_EDIT;
    runDiscovery();
}

/* ---- presets ---- */

/* Jog-click inside a module lands here, NOT on the module picker: once you're
 * editing a sound, "click" means "give me another sound for this thing", and
 * swapping the module out from under yourself is the rarer, more destructive
 * move. That one moved to Shift+click on the block picker. */
function openPresets() {
    S.presetMsg = '';
    /* Built fresh each time: the baked row only exists for modules that publish
     * a bank. "Module Menu" is always here, which is also why this picker is
     * never a one-row dead click any more — the old skip-straight-to-user
     * special case is gone, so Back always retraces through here. */
    S.srcRows = [{ kind: 'user', label: 'User Presets' }];
    if (S.presetSpec) S.srcRows.push({ kind: 'baked', label: modLabel() + ' Presets' });
    S.srcRows.push({ kind: 'menu', label: 'Module Menu' });
    if (S.presetSrcIdx >= S.srcRows.length) S.presetSrcIdx = 0;
    S.view = VIEW_PRESET_SRC;
}

function openUserPresets() {
    S.userPresets = engineListUserPresets(S.moduleId);
    S.userIdx = S.userPresets.length ? 1 : SAVE_ROW;
    S.confirmDel = false;
    S.view = VIEW_PRESET_LIST;
    S.presetMsg = '';
    captureOriginal();
    log('user presets: ' + S.userPresets.length + ' for ' + S.moduleId);
}

/* Audition needs somewhere to go back TO. If the module won't hand over its
 * state there is no way to undo a preview, so preview is disabled rather than
 * leaving the user stranded on a sound they only meant to hear. */
function captureOriginal() {
    S.origState = engineGetState(S.slot, S.comp) || null;
    S.previewIdx = -1;
    S.previewDelay = 0;
}

function revertOriginal() {
    if (S.origState !== null) engineSetState(S.slot, S.comp, S.origState);
    S.previewIdx = -1;
    S.previewDelay = 0;
}

function applyUserPreset(listIdx) {
    const p = S.userPresets[listIdx - 1];
    if (!p) return false;
    const blob = engineReadUserPreset(p.path);
    if (blob === null) { S.presetMsg = 'UNREADABLE'; return false; }
    engineSetState(S.slot, S.comp, blob);
    return true;
}

/* Commit: the previewed sound becomes the sound. The captured original is
 * dropped so a later Back can't resurrect it. */
function loadUserPreset() {
    if (!applyUserPreset(S.userIdx)) return;
    S.origState = null;
    S.presetMsg = '';
    S.pendingDiscover = 4;      /* a preset moves every param */
    /* Loading is the END of the errand — drop straight back to the canvas
     * pages so you're looking at the sound you just chose. Staying in the list
     * makes you Back out of somewhere you're already done with. */
    S.view = VIEW_EDIT;
}

function deleteUserPreset() {
    const p = S.userPresets[S.userIdx - 1];
    S.confirmDel = false;
    if (!p) return;
    let ok = false;
    try { ok = (os.remove(p.path) === 0); } catch (e) { ok = false; }
    S.presetMsg = ok ? 'DELETED' : 'DELETE FAILED';
    S.userPresets = engineListUserPresets(S.moduleId);
    if (S.userIdx > S.userPresets.length) S.userIdx = S.userPresets.length;
}

/* Save NEVER overwrites — a name collision gets a number, matching the host so
 * the two stores stay interchangeable. */
function saveUserPreset(rawName) {
    const name = uniqueName(String(rawName || '').trim() || 'Preset');
    const dir = PRESET_ROOT + '/' + S.moduleId;
    const stateJson = engineGetState(S.slot, S.comp);
    if (!stateJson) { S.presetMsg = 'NO STATE'; return; }
    if (typeof host_ensure_dir === 'function') host_ensure_dir(dir);
    /* Parsed object when the state is JSON, raw string otherwise — the same
     * opaque-state fallback the host's writer uses. */
    let state;
    try { state = JSON.parse(stateJson); } catch (e) { state = stateJson; }
    const payload = JSON.stringify({
        name, module: S.moduleId, version: 1, state,
    });
    const path = uniquePath(dir, safeStem(name));
    const ok = (typeof host_write_file === 'function') && host_write_file(path, payload);
    S.presetMsg = ok ? 'SAVED' : 'SAVE FAILED';
    if (!ok) return;
    S.userPresets = engineListUserPresets(S.moduleId);
    const i = S.userPresets.findIndex(p => p.name === name);
    S.userIdx = (i >= 0) ? i + 1 : SAVE_ROW;
    /* What was just saved IS the live sound, so there is nothing to revert to. */
    S.origState = null;
}

/* The on-screen keyboard is a shared host component with a host-agnostic
 * contract (isTextEntryActive / handleTextEntryMidi / drawTextEntry), so it
 * drops into davebox's own dispatch the same way it does into shadow_ui.
 * It takes the pads while open — naming is a deliberate modal moment, and the
 * sequencer keeps running underneath. */
function startSaveFlow() {
    if (!S.moduleId) { S.presetMsg = 'NO MODULE'; return; }
    openTextEntry({
        title: '',
        initialText: defaultSaveName(),
        onConfirm: (name) => { S.pendingAction = { t: 'usrsavedo', name }; S.dirty = true; },
        onCancel:  () => { S.presetMsg = 'CANCELLED'; S.dirty = true; },
    });
}

/* Seed the keyboard with the module's own idea of the current sound's name
 * where it has one (a baked bank's name_param), else the module name. */
function defaultSaveName() {
    const sp = S.presetSpec;
    if (sp) {
        const n = engineGet(S.slot, S.comp, sp.nameKey);
        if (n) return String(n);
    }
    return S.moduleId || 'Preset';
}

function safeStem(name) {
    let out = '';
    for (const ch of String(name)) {
        out += /[A-Za-z0-9 _-]/.test(ch) ? ch : '_';
    }
    out = out.trim().replace(/\s+/g, ' ');
    return out.slice(0, 40) || 'Preset';
}

function uniqueName(base) {
    const taken = {};
    for (const p of S.userPresets) taken[p.name] = true;
    if (!taken[base]) return base;
    for (let n = 2; n < 1000; n++) {
        if (!taken[base + ' ' + n]) return base + ' ' + n;
    }
    return base + ' ' + Date.now();
}

function uniquePath(dir, stem) {
    let path = dir + '/' + stem + '.json';
    if (!fileExists(path)) return path;
    for (let n = 2; n < 1000; n++) {
        path = dir + '/' + stem + ' ' + n + '.json';
        if (!fileExists(path)) return path;
    }
    return dir + '/' + stem + ' ' + Date.now() + '.json';
}

function fileExists(path) {
    if (typeof host_file_exists === 'function') return !!host_file_exists(path);
    try { return !!host_read_file(path); } catch (e) { return false; }
}

/* ---- module menu ----
 *
 * The module's own parameter hierarchy, walked in place. Nothing here is
 * privileged: `ui_hierarchy` and every param come through the same
 * (slot, comp, key) reads shadow_ui uses, so anything its menu can reach, this
 * one can. What it buys over the canvas pages is coverage — those are built
 * from `knobs[]` alone, so a param a module declares but never knob-maps is
 * invisible in them and reachable ONLY here. What it buys over co-run is the
 * landing point: we own navigation, so we open on the module's own root level
 * instead of the slot's component list.
 *
 * 99.3% of params across the installed fleet are float/enum/int (738/234/176
 * against 8 of everything else), so value editing reuses ui_cells rather than
 * growing a second engine. The handful of exotic types render read-only for
 * now and are one hop from the chain editor if they ever matter. */
function openMenu() {
    if (!S.levels || !S.rootKey) { S.presetMsg = 'NO MENU'; return; }
    S.menuStack = [];
    S.menuKey = S.rootKey;
    S.menuIdx = 0;
    S.menuEditing = false;
    refreshMenuRows();
    S.view = VIEW_MENU;
    log('menu: ' + S.moduleId + ' root=' + S.rootKey + ' rows=' + S.menuRowsCache.length);
}

/* A DYNAMIC level lists items the module hands back when asked (obxd's FXB
 * banks) rather than params declared in the hierarchy. menuRows cannot build
 * these — they don't exist until we read them — so they're built here, where
 * engine reads already happen and the tick budget is understood. */
function itemRows(lv) {
    const raw = engineGet(S.slot, S.comp, lv.items_param);
    let items = [];
    try { items = raw ? JSON.parse(raw) : []; }
    catch (e) { log('items parse failed for ' + lv.items_param + ': ' + e); }
    if (!Array.isArray(items)) items = [];
    const selectKey = lv.select_param || '';
    const cur = selectKey ? parseInt(engineGet(S.slot, S.comp, selectKey), 10) : NaN;
    return items.map((it, i) => {
        const index = (it && typeof it.index === 'number') ? it.index : i;
        return {
            kind: 'item', index, selectKey,
            navigateTo: lv.navigate_to || '',
            label: String((it && (it.label || it.name)) || ('Item ' + (index + 1))),
            selected: index === cur,
        };
    });
}

function refreshMenuRows() {
    const lv = (S.levels && S.levels[S.menuKey]) || null;
    if (lv && lv.items_param) {
        S.menuRowsCache = itemRows(lv);
        if (S.menuIdx >= S.menuRowsCache.length) S.menuIdx = 0;
        return;
    }
    S.menuRowsCache = menuRows(S.levels, S.menuKey, S.cpMap);
    if (S.menuIdx >= S.menuRowsCache.length) S.menuIdx = 0;
    /* Values for the params on this page only — a deep hierarchy is far more
     * params than one screen, and reading them all would be the lab rig's
     * mistake at a larger scale. */
    for (const r of S.menuRowsCache) {
        if (r.kind !== 'param') continue;
        const cell = menuCell(r.key, S.levels, S.menuKey, S.cpMap);
        r.cell = cell;
        const raw = engineGet(S.slot, S.comp, r.key);
        r.raw = raw;
        r.val = parseValue(cell, raw);
    }
}

/* `os` is a QuickJS MODULE here, not a global. filepath_browser's default
 * adapter reads `globalThis.os`, which is undefined in davebox — passing this
 * explicitly is the difference between a working browser and an empty one. */
const FS_ADAPTER = {
    readdir(path) {
        const out = os.readdir(path) || [];
        if (Array.isArray(out[0])) return out[0];
        if (Array.isArray(out)) return out;
        return [];
    },
    stat(path) { return os.stat(path); },
};

function openFileBrowser(row) {
    const c = row.cell;
    S.fileKey = row.key;
    S.fileState = buildFilepathBrowserState({
        name: c.label, key: row.key,
        root: c.fileRoot, filter: c.fileFilter, start_path: c.fileStartPath,
    }, row.raw || '');
    refreshFilepathBrowser(S.fileState, FS_ADAPTER);
    S.view = VIEW_FILE;
}

/* ---- host capabilities ----
 *
 * FX blocks 3-4 and the Send A/B buses are fork/daily-driver features, not
 * upstream Schwung. Offering rows the host cannot answer would give you
 * controls that silently do nothing, which is worse than not having them.
 *
 * Probed rather than assumed: a host without the feature returns nothing for
 * the key, so we ask it once per entry instead of hardcoding a host version.
 * Cheap — four reads on a screen you just opened. */
/* Enter / leave a global bus. The bus IS a slot-0 context, so everything below
 * (editor, menu, presets, bypass) keeps working on `(S.slot, S.comp, key)` with
 * no idea it's addressing a bus rather than a track's chain. */
/* Session-wide FX, entered from the SESSION view rather than from a track:
 * Master and the two Sends belong to the set, not to whichever track happens to
 * be selected. Sound mode hosts the screen because everything below it — block
 * picker, editor, menu, presets, bypass — already works on any (slot, comp). */
/* True while sound mode is showing SESSION-wide FX — either the bus list or a
 * bus's blocks. Nothing here belongs to a track, so the caller's
 * "follow the active track" logic must sit this out. */
export function soundIsGlobal() {
    return S.view === VIEW_BUSES || !!S.bus;
}

export function soundEnterBuses() {
    S.active = true;
    S.bus = null;
    S.track = -1;
    S.trackSlot = -1;
    S.slot = 0;
    S.busIdx = 0;
    S.view = VIEW_BUSES;
    S.presetMsg = '';
    S.dirty = true;
    log('buses: open');
}

function enterBus(bus) {
    if (S.trackSlot < 0) S.trackSlot = S.slot;
    S.bus = bus;
    S.slot = 0;
    S.blockIdx = 0;
    S.pickRow = 0;
    S.view = VIEW_BLOCKS;
    refreshBlockNames();
    log('bus: ' + bus.id);
}

function leaveBus() {
    const cameFromTrack = S.trackSlot >= 0;
    S.bus = null;
    if (cameFromTrack) {
        S.slot = S.trackSlot;
        S.trackSlot = -1;
        S.blockIdx = 1;         /* back on SYNTH, the common case */
        S.view = VIEW_BLOCKS;
        refreshBlockNames();
        return;
    }
    S.view = VIEW_BUSES;        /* entered from the session view — go back there */
    S.dirty = true;
}

/* The picker's rows, dispatched by `kind` like every other list here.
 *
 * A TRACK context lists its blocks plus the slot's settings. A BUS context
 * lists only its four FX blocks — a bus has no slot to configure, and it is
 * reached from the session view rather than from any track. */
/* COMPONENTS is keyed by plain chain names; a bus component (`master_fx:fx2`)
 * browses the same audio-FX catalogue, so it resolves to the fx spec. */
/* A chain slot reports a module ID; a bus reports the DSP PATH it was loaded
 * from. Everything above this line wants the id — it names the preset folder,
 * the baked-cache key and the picker label — so normalise once, here. */
function moduleIdOf(raw) {
    if (!raw) return '';
    if (raw.indexOf('/') < 0) return raw;
    const parts = raw.split('/').filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
}

function specKeyFor(comp) {
    return COMPONENTS[comp] ? comp : 'fx1';
}

function buildPickRows() {
    const rows = [];
    if (S.bus) {
        for (const n of BUS_BLOCKS) {
            rows.push({ kind: 'block', comp: S.bus.prefix + 'fx' + n, label: 'FX ' + n });
        }
    } else {
        for (const i of S.blockRows) {
            rows.push({ kind: 'block', comp: BLOCKS[i].comp, label: BLOCKS[i].label, blockIdx: i });
        }
        rows.push({ kind: 'settings', label: '[SLOT SETTINGS]' });
    }
    S.pickRows = rows;
    /* Keep the cursor on the component it was on — the row INDEX shifts when a
     * host lacks fx3/4, and a bus context has different rows entirely. */
    const at = rows.findIndex(r => r.kind === 'block' && r.comp === S.comp);
    if (at >= 0) S.pickRow = at;
    if (S.pickRow >= rows.length) S.pickRow = 0;
}

function probeCaps() {
    const has = (v) => v !== null && v !== undefined && v !== '';
    S.capFx34  = has(engineGet(S.slot, 'fx3', 'bypassed')) ||
                 has(engineGet(S.slot, 'fx4', 'bypassed'));
    S.capSends = has(engineGetSlotParam(S.slot, 'send_a'));
    S.blockRows = [];
    for (let i = 0; i < BLOCKS.length; i++) {
        const c = BLOCKS[i].comp;
        if (!S.capFx34 && (c === 'fx3' || c === 'fx4')) continue;
        S.blockRows.push(i);
    }
    S.slotRows = SLOT_SETTINGS.filter(s => !s.cap || (s.cap === 'sends' && S.capSends));
    log('caps: fx34=' + (S.capFx34 ? 1 : 0) + ' sends=' + (S.capSends ? 1 : 0));
}

/* ---- slot settings: read, edit, persist ---- */

function openSlotCfg() {
    S.slotCfgVals = S.slotRows.map(s => {
        const raw = parseFloat(engineGetSlotParam(S.slot, s.key));
        return isFinite(raw) ? raw : 0;
    });
    S.slotCfgIdx = 0;
    S.slotCfgEditing = false;
    S.slotCfgDirty = false;
    S.view = VIEW_SLOTCFG;
    S.dirty = true;
}

function slotCfgStep(delta) {
    const s = S.slotRows[S.slotCfgIdx];
    if (!S.slotCfgEditing || !s) {
        S.slotCfgIdx = listMove(S.slotRows.length, S.slotCfgIdx, delta);
        S.slotCfgEditing = false;
        return;
    }
    let v = S.slotCfgVals[S.slotCfgIdx] + (delta > 0 ? s.step : -s.step);
    if (s.int) v = Math.round(v);
    else v = Math.round(v * 1000) / 1000;      /* keep 0.05 steps from drifting */
    if (v < s.min) v = s.min;
    if (v > s.max) v = s.max;
    if (v === S.slotCfgVals[S.slotCfgIdx]) return;
    S.slotCfgVals[S.slotCfgIdx] = v;
    S.slotCfgDirty = true;
    /* Queued like every other write here: this runs in the MIDI handler. */
    /* Slot captured at QUEUE time, same reason queueWrite does it: sound mode
     * can retarget to another track before the drain, and a send raised against
     * one slot must not land in the one that replaced it. */
    for (const w of S.pendingSlotWrites) {
        if (w.key === s.key && w.slot === S.slot) { w.val = v; return; }
    }
    S.pendingSlotWrites.push({ slot: S.slot, key: s.key, val: v });
}

/* Saving is a synchronous whole-chain file write, so it happens on LEAVING the
 * screen — one gesture boundary that can't be mistaken, unlike "no writes
 * pending this tick", which fires in the gaps between jog detents. */
function closeSlotCfg() {
    if (S.slotCfgDirty) {
        S.slotCfgDirty = false;
        S.pendingAction = { t: 'slotsave' };
    }
    S.view = VIEW_BLOCKS;
    S.dirty = true;
}

function drainSlotWrites() {
    const q = S.pendingSlotWrites;
    if (!q.length) return;
    for (let n = 0; n < WRITES_PER_TICK && q.length; n++) {
        const w = q.shift();
        const s = SLOT_SETTINGS.find(x => x.key === w.key);
        engineSetSlotParam(w.slot, w.key, s && s.int ? String(w.val) : w.val.toFixed(3));
    }
}

function renderSlotCfg() {
    clear_screen();
    drawKitHeader('SLOT ' + (S.slot + 1) + ' SETTINGS', false);
    const ROW_H = 10, VISIBLE = 5;
    const start = Math.max(0, Math.min(S.slotCfgIdx - 2, S.slotRows.length - VISIBLE));
    for (let i = 0; i < VISIBLE; i++) {
        const idx = start + i;
        if (idx >= S.slotRows.length) break;
        const s = S.slotRows[idx];
        const y = 11 + i * ROW_H;
        const on = (idx === S.slotCfgIdx);
        if (on) fill_rect(0, y - 1, 128, ROW_H, 1);
        const ink = on ? 0 : 1;
        const val = s.fmt(S.slotCfgVals[idx]);
        const vw = mvWidth(val);
        mvPrint(3, y + 1, s.label, ink);
        mvPrint(125 - vw, y + 1, val, ink);
        if (on && S.slotCfgEditing) mvPrint(125 - vw - 6, y + 1, '*', ink);
    }
}

function menuEnter() {
    const row = S.menuRowsCache[S.menuIdx];
    if (!row) return;
    if (row.kind === 'level') {
        S.menuStack.push({ levelKey: S.menuKey, cursor: S.menuIdx });
        S.menuKey = row.level;
        S.menuIdx = 0;
        S.menuEditing = false;
        /* Queued, not called: this runs in the MIDI handler and the refresh
         * reads the engine — a dynamic level reads TWICE (list + selection).
         * soundTick drains it after the pending writes, so a level entered
         * right after an edit reads back the value that edit already landed. */
        S.pendingAction = { t: 'menuload' };
        return;
    }
    /* Selecting a dynamic item IS the errand: write the module's select_param,
     * then go where it says (obxd sends you back to root, where the newly
     * chosen bank's presets now live). Unwind to that level if it's already
     * behind us rather than pushing a second copy onto the stack. */
    if (row.kind === 'item') {
        if (row.selectKey) queueWrite(row.selectKey, String(row.index));
        /* Choosing from a dynamic list usually REPLACES the preset set behind it
         * — that is what obxd's and dexed's banks are for. The baked-name cache
         * is keyed by module|comp|count, none of which a bank switch changes,
         * so without this you keep browsing the previous bank's names against
         * the new bank's sounds. Drop it and let the next open rescan. */
        S.bakedCacheKey = '';
        S.bakedNames = [];
        const target = row.navigateTo;
        if (target && S.levels && S.levels[target]) {
            const at = S.menuStack.findIndex(e => e.levelKey === target);
            if (at >= 0) {
                const entry = S.menuStack[at];
                S.menuStack.length = at;
                S.menuIdx = entry.cursor;
            } else {
                S.menuStack.push({ levelKey: S.menuKey, cursor: S.menuIdx });
                S.menuIdx = 0;
            }
            S.menuKey = target;
        }
        S.menuEditing = false;
        S.pendingAction = { t: 'menuload' };
        return;
    }
    const c = row.cell;
    /* Each param type opens the editor it needs. The shared components do the
     * work — the browser and the keyboard are the host's, not reimplementations
     * — so supporting a type is wiring, not writing an editor. */
    if (c && c.kind === 'file') { S.pendingAction = { t: 'file', idx: S.menuIdx }; return; }
    if (c && c.kind === 'text') { S.pendingAction = { t: 'textedit', idx: S.menuIdx }; return; }
    if (c && c.kind === 'opaque') { S.presetMsg = 'EDIT IN ' + String(c.type).toUpperCase(); return; }
    /* Click toggles edit on the highlighted param: jog then changes the
     * value instead of moving the cursor. One knob, two jobs, switched
     * explicitly — the alternative is editing whatever you scroll past. */
    S.menuEditing = !S.menuEditing;
}

function startTextEdit(idx) {
    const row = S.menuRowsCache[idx];
    if (!row) return;
    openTextEntry({
        title: String(row.label || '').toUpperCase(),
        initialText: String(row.raw || ''),
        onConfirm: (txt) => {
            queueWrite(row.key, String(txt));
            row.raw = String(txt);
            row.val = String(txt);
            S.dirty = true;
        },
        onCancel: () => { S.dirty = true; },
    });
}

function fileActivate() {
    const res = activateFilepathBrowserItem(S.fileState);
    if (res.action === 'open') { refreshFilepathBrowser(S.fileState, FS_ADAPTER); return; }
    if (res.action === 'select') {
        queueWrite(S.fileKey, res.value);
        const row = S.menuRowsCache.find(r => r.key === S.fileKey);
        if (row) { row.raw = res.value; row.val = res.value; }
        S.view = VIEW_MENU;
        S.presetMsg = '';
    }
}

/* Back pops one level; at the root it returns to the picker it came from. */
function menuBack() {
    if (S.menuEditing) { S.menuEditing = false; return true; }
    const prev = S.menuStack.pop();
    if (!prev) return false;
    S.menuKey = prev.levelKey;
    S.menuIdx = prev.cursor;
    S.pendingAction = { t: 'menuload' };   /* engine reads belong in tick */
    return true;
}

function menuStep(delta) {
    const row = S.menuRowsCache[S.menuIdx];
    if (!S.menuEditing || !row || row.kind !== 'param' || !row.cell) {
        S.menuIdx = listMove(S.menuRowsCache.length, S.menuIdx, delta);
        S.menuEditing = false;
        return;
    }
    const next = stepValue(row.cell, row.val, delta > 0 ? 1 : -1);
    if (next === row.val) return;
    row.val = next;                       /* optimistic, drawn now */
    queueWrite(row.key, commitString(row.cell, next));
}

/* ---- baked bank ----
 * A baked bank publishes a COUNT and the name of the CURRENT preset only —
 * there is no bulk name list (obxd's items_param is its FXB bank files, not
 * preset names). So a browsable list has to be built by selecting each index
 * in turn and reading the name back. That is done ONCE per module+comp, cached,
 * budgeted across ticks, and the original index is restored at the end.
 *
 * The unavoidable cost: the scan riffles the module through every preset, so
 * with notes sounding you hear it sweep. Once per entry, not per scroll. */
/* ---- baked name cache, on disk ----
 *
 * The scan is the expensive thing in this module: one write + one read per
 * preset, so minijv's 4096 cost ~22s of riffling before you can read a list.
 * That cost is worth paying ONCE, not once per visit and never twice per boot.
 * Nothing about a ROM's preset names changes between sessions.
 *
 * Identity cannot come from the module id alone: obxd and dexed swap the whole
 * preset set underneath an unchanged id, comp and count.
 *
 * It also cannot be inferred from the hierarchy's dynamic levels, which was the
 * first attempt. minijv declares THREE — `jump_to_expansion` and
 * `load_expansion` genuinely change the patch set, but `do_save_to_slot` is a
 * write-only save COMMAND, and folding that into identity would throw away 4096
 * cached names every time you saved a patch. `navigate_to` doesn't separate
 * them either: minijv's save slot and its expansion jump both point at `patch`.
 *
 * So don't guess from names — ASK THE SET WHAT IT IS. A fingerprint of the
 * preset names at a few fixed indices identifies the set directly: it changes
 * exactly when the thing we cached changes, whatever caused it. Three samples
 * against 4096 is free, and it also catches the case a bank-identity key never
 * could — new content dropped into a bank that kept the same count.
 *
 * Each distinct fingerprint gets its own file, so alternating between two banks
 * reads both from disk rather than re-scanning on every switch. */
const BAKED_CACHE_DIR = '/data/UserData/schwung/cache/davebox-presetnames';
const BAKED_CACHE_V = 2;

/* Sampling MOVES the module's preset index — the caller restores it. Kept out
 * of the memory-cache path so a warm list opens without perturbing the sound. */
function bakedFingerprint(sp, count) {
    if (!count) return '';
    const idxs = (count <= 3) ? [0] : [0, count >> 1, count - 1];
    const out = [];
    for (const i of idxs) {
        engineSet(S.slot, S.comp, sp.listKey, String(i));
        out.push(engineGet(S.slot, S.comp, sp.nameKey) || '');
    }
    return out.join('');
}

function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
}

function bakedCachePath(key, fp) {
    const stem = (key + '_' + hashStr(fp)).replace(/[^A-Za-z0-9._-]/g, '_');
    return BAKED_CACHE_DIR + '/' + stem + '.json';
}

function loadBakedCache(key, fp, count) {
    if (typeof host_read_file !== 'function') return null;
    let txt = null;
    try { txt = host_read_file(bakedCachePath(key, fp)); } catch (e) { return null; }
    if (!txt) return null;
    try {
        const o = JSON.parse(txt);
        if (!o || o.v !== BAKED_CACHE_V || o.key !== key || o.fp !== fp) return null;
        if (!Array.isArray(o.names) || o.names.length !== count) return null;
        return o.names;
    } catch (e) { log('baked cache parse failed: ' + e); return null; }
}

function saveBakedCache(key, fp, names) {
    if (typeof host_write_file !== 'function') return;
    if (typeof host_ensure_dir === 'function') host_ensure_dir(BAKED_CACHE_DIR);
    try {
        host_write_file(bakedCachePath(key, fp),
                        JSON.stringify({ v: BAKED_CACHE_V, key, fp, names }));
    } catch (e) { log('baked cache write failed: ' + e); }
}

function openBaked() {
    const sp = S.presetSpec;
    if (!sp) return;
    S.bakedCount = parseInt(engineGet(S.slot, S.comp, sp.countKey) || '0', 10) || 0;
    S.bakedIdx = parseInt(engineGet(S.slot, S.comp, sp.listKey) || '0', 10) || 0;
    S.view = VIEW_PRESET_BAKED;
    S.presetMsg = '';
    captureOriginal();

    const key = S.moduleId + '|' + S.comp + '|' + S.bakedCount;
    let via = 'scanning';
    if (key === S.bakedCacheKey && S.bakedNames.length === S.bakedCount) {
        /* Warm in memory. Selecting any dynamic item drops this, so a bank
         * switch cannot land here — which is what earns skipping the sampling. */
        S.bakedScan = -1;
        via = 'memory';
    } else {
        const fp = bakedFingerprint(sp, S.bakedCount);
        engineSet(S.slot, S.comp, sp.listKey, String(S.bakedIdx));   /* undo sampling */
        const cached = loadBakedCache(key, fp, S.bakedCount);
        if (cached) {
            S.bakedNames = cached;
            S.bakedCacheKey = key;
            S.bakedFp = fp;
            S.bakedScan = -1;
            via = 'disk';
        } else {
            S.bakedNames = new Array(S.bakedCount).fill('');
            S.bakedCacheKey = key;
            S.bakedFp = fp;
            S.bakedScanRestore = S.bakedIdx;
            S.bakedScan = S.bakedCount ? 0 : -1;
        }
    }
    log('baked: ' + S.bakedCount + ' via ' + sp.listKey + ' (' + via + ')');
}

/* One slice of the prescan. Runs from soundTick only.
 *
 * Rate is transport-aware. Each step is a write plus a read — two synchronous
 * SHM round-trips — and while the sequencer is PLAYING that budget belongs to
 * note timing, which is the product. Stopped, nothing competes, so the scan can
 * run an order of magnitude harder: minijv's 4096 presets go from ~22s to ~4s,
 * and the audible riffle through every preset shortens with it. */
function bakedScanRate() {
    return S.playing ? BAKED_SCAN_PER_TICK : BAKED_SCAN_PER_TICK_IDLE;
}

function stepBakedScan() {
    const sp = S.presetSpec;
    if (!sp || S.bakedScan < 0) return;
    for (let n = 0; n < bakedScanRate() && S.bakedScan < S.bakedCount; n++) {
        const i = S.bakedScan++;
        engineSet(S.slot, S.comp, sp.listKey, String(i));
        S.bakedNames[i] = engineGet(S.slot, S.comp, sp.nameKey) || ('Preset ' + (i + 1));
    }
    if (S.bakedScan >= S.bakedCount) {
        S.bakedScan = -1;
        S.bakedIdx = S.bakedScanRestore;
        engineSet(S.slot, S.comp, sp.listKey, String(S.bakedIdx));
        /* Paid for it — keep it. The write lands here, at the end of the scan,
         * so a scan abandoned half-way never persists a partial list. */
        saveBakedCache(S.bakedCacheKey, S.bakedFp, S.bakedNames);
    }
    S.dirty = true;
}

/* Selecting a baked preset IS writing the index — the same act as auditioning
 * it, so scrolling previews for free and Load is just "stop reverting". */
function applyBaked(idx) {
    const sp = S.presetSpec;
    if (!sp || !S.bakedCount) return;
    engineSet(S.slot, S.comp, sp.listKey, String(idx));
}

function commitBaked() {
    applyBaked(S.bakedIdx);
    S.origState = null;
    S.presetMsg = '';
    S.pendingDiscover = 4;
    S.view = VIEW_EDIT;         /* same errand-is-over rule as the user list */
}

/* Every entry point below runs from soundTick(), never from a MIDI handler. */
/* Runs from soundTick. Keeps the block you were on when the new track has
 * something loaded there; otherwise shows the chain so you can choose. */
function retargetOpen() {
    refreshBlockNames();
    if (engineLoadedModule(S.slot, S.comp)) {
        S.view = VIEW_EDIT;
        runDiscovery();
    } else {
        S.view = VIEW_BLOCKS;
    }
}

function runAction(a) {
    if (a.t === 'names')        refreshBlockNames();
    else if (a.t === 'bus')     enterBus(a.bus);
    else if (a.t === 'leavebus') leaveBus();
    else if (a.t === 'retarget') retargetOpen();
    else if (a.t === 'open')    openBlock(a.comp);
    else if (a.t === 'browse')  openBrowse(a.comp);
    else if (a.t === 'load')    loadSelected();
    else if (a.t === 'presets') openPresets();
    else if (a.t === 'usrlist') openUserPresets();
    else if (a.t === 'baked')   openBaked();
    else if (a.t === 'usrload') loadUserPreset();
    else if (a.t === 'usrdel')  deleteUserPreset();
    else if (a.t === 'usrsave') startSaveFlow();
    else if (a.t === 'usrsavedo') saveUserPreset(a.name);
    else if (a.t === 'bakedset') commitBaked();
    else if (a.t === 'menu')     openMenu();
    else if (a.t === 'menuload') refreshMenuRows();
    else if (a.t === 'slotcfg')  openSlotCfg();
    else if (a.t === 'slotsave') engineSaveState();
    else if (a.t === 'file')     openFileBrowser(S.menuRowsCache[a.idx]);
    else if (a.t === 'textedit') startTextEdit(a.idx);
    S.dirty = true;
}

function runDiscovery() {
    const id = moduleIdOf(engineLoadedModule(S.slot, S.comp));
    S.moduleId = id;
    if (!id) { S.banks = []; S.sections = []; S.dirty = true; return; }
    const res = discover(S.slot, S.comp);
    S.banks = res.banks;
    S.presetSpec = res.presetSpec || null;
    S.levels = res.levels || null;
    S.rootKey = res.rootKey || null;
    S.cpMap = res.cpMap || null;
    /* Kit-described modules ship their own section rows; only derive when a
     * module didn't tell us how it wants to be grouped. */
    S.sections = res.kitSections || deriveSections(res.banks);
    S.bankIdx = 0;
    S.values = {};
    S.rawValues = {};
    log('discover: ' + id + ' (' + S.comp + ') -> ' + res.banks.length +
        ' banks, ' + res.paramCount + ' params, via ' + res.source +
        ' env=' + res.envCount + ' filt=' + res.filtCount);
    pollValues(true);
    S.dirty = true;
}

/* ---- module browser (per block) ---- */

/* `idx` retargets the block first. Shift+click arrives from the block PICKER,
 * where S.comp still names whichever block was last opened — browsing without
 * this would offer modules for the wrong component and load into it. */
function openBrowse(comp) {
    if (comp) {
        S.comp = comp;
        const bi = BLOCKS.findIndex(b => b.comp === comp);
        if (bi >= 0) S.blockIdx = bi;
    }
    /* A bus component is `master_fx:fx2` etc; it browses the same audio-FX
     * catalogue as a chain FX block, so map it onto that spec. */
    const spec = COMPONENTS[S.comp] || (S.bus ? COMPONENTS.fx1 : null);
    const found = spec ? engineListModules(specKeyFor(S.comp)) : [];
    /* [ none ] LAST — as index 0 with the cursor defaulting there, a single
     * click unloaded the block. That wiped two slots during phase-1 testing. */
    S.browseList = found.concat([{ id: '', name: '[ none ]' }]);
    const active = engineLoadedModule(S.slot, S.comp);
    S.browseIdx = 0;
    for (let i = 0; i < S.browseList.length; i++) {
        if (S.browseList[i].id === active) { S.browseIdx = i; break; }
    }
    S.view = VIEW_BROWSE;
    S.dirty = true;
    log('browse: ' + found.length + ' modules for ' + S.comp);
}

function loadSelected() {
    const mod = S.browseList[S.browseIdx];
    if (!mod) return;
    /* ⚠ A BUS component's `:module` takes a DSP PATH; a chain slot's takes a
     * module id. Same key, different currency — loading a bus by id silently
     * does nothing, which is the kind of failure you debug for an hour. */
    engineLoadModule(S.slot, S.comp, S.bus ? (mod.path || '') : mod.id);
    /* The chain host instantiates asynchronously — discovering immediately
     * returns null metadata and the module looks empty. */
    S.pendingDiscover = 6;
    S.banks = [];
    S.view = mod.id ? VIEW_EDIT : VIEW_BLOCKS;
    refreshBlockNames();
    S.dirty = true;
}

/* ---- values ---- */

function pollValues(force) {
    const bank = S.banks[S.bankIdx];
    if (!bank) return;
    for (const cell of bank.cells) {
        if (!cell || !cell.key) continue;
        /* Never clobber the knob being turned — the local value leads the
         * engine until the queued write lands. */
        if (!force && S.touchedIdx >= 0 && bank.cells[S.touchedIdx] &&
            bank.cells[S.touchedIdx].key === cell.key) continue;
        const raw = engineGet(S.slot, S.comp, cell.key);
        S.rawValues[cell.key] = raw;
        S.values[cell.key] = parseValue(cell, raw);
    }
    /* The filter MODEL enum usually lives on the filter page only while
     * cutoff/resonance are re-listed elsewhere; without this those pages draw a
     * low-pass whatever the filter is set to. */
    const mk = bank.filt && bank.filt.modeKey;
    if (mk && !bank.cells.some(c => c && c.key === mk)) {
        const raw = engineGet(S.slot, S.comp, mk);
        if (raw != null) {
            const i = bank.filt.modeOptions.indexOf(String(raw).trim());
            S.values[mk] = (i >= 0) ? i : (parseFloat(raw) || 0);
        }
    }
    S.dirty = true;
}

/* Queue rather than write. Coalesces by key so a fast sweep costs one write per
 * key per drain instead of one per detent. */
/* `comp` defaults to the block being edited; the block PICKER passes one
 * explicitly, since there the cursor and S.comp are different things. */
function queueWrite(key, val, comp) {
    const c = comp || S.comp;
    for (const w of S.pendingWrites) {
        if (w.key === key && w.comp === c && w.slot === S.slot) { w.val = val; return; }
    }
    if (comp) { S.pendingWrites.push({ slot: S.slot, comp: c, key, val }); return; }
    /* The SLOT is captured here, not read at drain time. Sound mode can retarget
     * to another track mid-queue, and a write raised against one slot must never
     * land in the one that replaced it. */
    S.pendingWrites.push({ slot: S.slot, comp: S.comp, key, val });
}

/* ---- input ---- */

function onKnobTurn(knobIdx, delta) {
    const bank = S.banks[S.bankIdx];
    if (!bank) return;
    const cell = bank.cells[knobIdx];
    if (!cell || !cell.key) return;

    /* Sensitivity CLASS, not davebox's run-length acceleration: a sweep moves
     * fast, a dropdown costs travel, a toggle resists a brush. */
    S.knobAccum[knobIdx] += delta;
    const sens = cell.sens || 2;
    let steps = 0;
    while (S.knobAccum[knobIdx] >= sens) { steps++; S.knobAccum[knobIdx] -= sens; }
    while (S.knobAccum[knobIdx] <= -sens) { steps--; S.knobAccum[knobIdx] += sens; }

    S.touchedIdx = knobIdx;
    S.touchedTick = S.tickCount;
    S.turnedSinceTouch = true;
    S.dirty = true;
    if (!steps) return;

    const next = stepValue(cell, S.values[cell.key], steps);
    if (next === S.values[cell.key]) return;
    S.values[cell.key] = next;                   /* optimistic, drawn now */
    queueWrite(cell.key, commitString(cell, next));
}

function listMove(len, idx, delta) {
    if (!len) return 0;
    return Math.max(0, Math.min(len - 1, idx + (delta > 0 ? 1 : -1)));
}

/* Returns TRUE when the event was consumed. davebox keeps everything we don't
 * take — pads, steps and transport stay with the sequencer throughout. */
export function soundOnCC(d1, d2, decodeDelta) {
    if (!S.active) return false;

    if (d1 === 49) {                                   /* shift */
        const held = d2 >= 64;
        if (held !== S.shiftHeld) { S.shiftHeld = held; S.dirty = true; }
        return false;                                  /* davebox also tracks it */
    }

    /* Mute, tracked HERE and not read off davebox's state: the `S` in this file
     * is sound mode's own object, so `S.muteHeld` was silently undefined and
     * the bypass gesture never fired. Passed through like shift, so davebox
     * keeps its own copy for everything outside sound mode. */
    if (d1 === 88) {
        S.muteHeld = d2 >= 64;
        return false;
    }

    if (d1 === 79) {                                   /* master knob = slot level */
        const delta = decodeDelta(d2);
        if (delta) onVolumeTurn(delta);
        return true;
    }

    if (d1 >= 71 && d1 <= 78) {                        /* knobs 1-8 */
        if (S.view !== VIEW_EDIT) return true;
        const delta = decodeDelta(d2);
        if (delta) onKnobTurn(d1 - 71, delta);
        return true;
    }

    if (d1 === 14) {                                   /* jog turn */
        const delta = decodeDelta(d2);
        if (!delta) return true;
        if (S.view === VIEW_BUSES) {
            S.busIdx = listMove(FX_BUSES.length, S.busIdx, delta);
        } else if (S.view === VIEW_BLOCKS) {
            S.pickRow = listMove(S.pickRows.length, S.pickRow, delta);
        } else if (S.view === VIEW_SLOTCFG) {
            slotCfgStep(delta);
        } else if (S.view === VIEW_BROWSE) {
            S.browseIdx = listMove(S.browseList.length, S.browseIdx, delta);
        } else if (S.view === VIEW_PRESET_SRC) {
            S.presetSrcIdx = listMove(S.srcRows.length, S.presetSrcIdx, delta);
        } else if (S.view === VIEW_PRESET_LIST) {
            if (S.confirmDel) {
                S.confirmIdx = listMove(2, S.confirmIdx, delta);
            } else {
                const next = listMove(S.userPresets.length + 1, S.userIdx, delta);
                if (next !== S.userIdx) {
                    S.userIdx = next;
                    /* Audition the highlighted row after a beat. The save row
                     * has no sound of its own, so landing there puts the
                     * original back rather than leaving the last preview up. */
                    S.previewIdx = (next === SAVE_ROW) ? -1 : next;
                    S.previewDelay = PREVIEW_DELAY_TICKS;
                    S.presetMsg = '';
                }
            }
        } else if (S.view === VIEW_MENU) {
            menuStep(delta);
        } else if (S.view === VIEW_FILE) {
            moveFilepathBrowserSelection(S.fileState, delta > 0 ? 1 : -1);
        } else if (S.view === VIEW_PRESET_BAKED) {
            if (S.bakedScan < 0) {
                const next = listMove(S.bakedCount, S.bakedIdx, delta);
                if (next !== S.bakedIdx) {
                    S.bakedIdx = next;
                    S.previewIdx = next;
                    S.previewDelay = PREVIEW_DELAY_TICKS;
                    S.presetMsg = '';
                }
            }
        } else if (S.banks.length) {
            if (S.shiftHeld && S.sections.length > 1) {
                const cur = activeSection(S.sections, S.bankIdx);
                const next = listMove(S.sections.length, cur, delta);
                S.bankIdx = S.sections[next].bank;
            } else {
                S.bankIdx = listMove(S.banks.length, S.bankIdx, delta);
            }
            S.touchedIdx = -1;
            /* A bank change re-reads up to 8 params. Cheap next tick, not from
             * here — a fast jog spin would otherwise fire a burst of blocking
             * SHM round-trips straight through the sequencer's MIDI path. */
            S.needsPoll = true;
        }
        S.dirty = true;
        return true;
    }

    if (d1 === 3 && d2 >= 64) {                        /* jog click */
        /* Mute + click = bypass the focused block, the same gesture the host's
         * chain editor uses, so the reflex carries over. Works from the picker
         * (the block under the cursor) and from inside a block's editor (the
         * one you're in). Toggled optimistically and queued, because this runs
         * in the MIDI handler. */
        if (S.muteHeld && S.view === VIEW_BLOCKS) {
            const r = S.pickRows[S.pickRow];
            if (r && r.kind === 'block' && r.name) {   /* empty = nothing to bypass */
                r.bypassed = r.bypassed ? 0 : 1;
                queueWrite('bypassed', String(r.bypassed), r.comp);
                S.presetMsg = r.bypassed ? 'BYPASSED' : 'ACTIVE';
                S.dirty = true;
            }
            return true;
        }
        if (S.view === VIEW_SLOTCFG) {
            S.slotCfgEditing = !S.slotCfgEditing;
        }
        else if (S.view === VIEW_BUSES) {
            S.pendingAction = { t: 'bus', bus: FX_BUSES[S.busIdx] };
        }
        else if (S.view === VIEW_BLOCKS && S.pickRows[S.pickRow] &&
                 S.pickRows[S.pickRow].kind === 'settings') {
            S.pendingAction = { t: 'slotcfg' };   /* reads the slot — tick only */
        }
        else if (S.view === VIEW_BLOCKS && S.pickRows[S.pickRow] &&
                 S.pickRows[S.pickRow].kind === 'bus') {
            S.pendingAction = { t: 'bus', bus: S.pickRows[S.pickRow].bus };
        }
        else if (S.view === VIEW_BLOCKS) {
            /* Shift+click SWAPS the module; plain click opens it. Changing what
             * a block IS is rarer and more destructive than editing it, so it
             * costs the modifier and lives only here, at the chain overview
             * where "what is in this block" is the question being asked. */
            S.pendingAction = { t: S.shiftHeld ? 'browse' : 'open', comp: S.pickRows[S.pickRow].comp };
        }
        else if (S.view === VIEW_BROWSE)      S.pendingAction = { t: 'load' };
        /* An EMPTY block has no presets to offer, and its editor's whole job is
         * "pick something" — so click there still means the module browser. */
        else if (S.view === VIEW_EDIT)
            S.pendingAction = S.moduleId ? { t: 'presets' } : { t: 'browse' };
        else if (S.view === VIEW_PRESET_SRC) {
            const row = S.srcRows[S.presetSrcIdx];
            if (!row) { /* nothing */ }
            else if (row.kind === 'baked') S.pendingAction = { t: 'baked' };
            else if (row.kind === 'menu')  S.pendingAction = { t: 'menu' };
            else                           S.pendingAction = { t: 'usrlist' };
        }
        else if (S.view === VIEW_PRESET_LIST) {
            if (S.confirmDel) {
                if (S.confirmIdx === 1) S.pendingAction = { t: 'usrdel' };
                else { S.confirmDel = false; }
            } else if (S.userIdx === SAVE_ROW) {
                S.pendingAction = { t: 'usrsave' };
            } else if (S.shiftHeld) {
                /* Delete hides behind Shift. Loading is the common act and now
                 * costs one click; putting a Load/Delete menu in front of it
                 * made you choose "the obvious one" every single time, and put
                 * the destructive option one careless click from the safe one.
                 * The named confirm below is what actually guards it. */
                S.confirmDel = true;
                S.confirmIdx = 0;
            } else {
                S.pendingAction = { t: 'usrload' };
            }
        }
        else if (S.view === VIEW_PRESET_BAKED) S.pendingAction = { t: 'bakedset' };
        else if (S.view === VIEW_MENU) menuEnter();
        else if (S.view === VIEW_FILE) fileActivate();
        S.dirty = true;
        return true;
    }

    /* Back PRESS only starts the clock. Long-press = suspend the module is a
     * davebox-wide gesture, and sound mode was swallowing the press so it was
     * the one place you couldn't do it. Hand the press to davebox's global
     * tracker — checkBackHold() runs in tick, fires past the threshold, and
     * calls soundExit() itself — and move sound mode's own navigation to the
     * RELEASE, which is where a tap is decided anyway. */
    if (d1 === 51 && d2 >= 64) {
        GS.backPressTick = GS.tickCount;
        GS.backHoldFired = false;
        return true;
    }

    if (d1 === 51 && d2 < 64) {                        /* back RELEASE = tap */
        const wasHold = GS.backHoldFired;
        GS.backPressTick = -1;
        GS.backHoldFired = false;
        if (wasHold) return true;                      /* the hold already suspended */
        if (S.view === VIEW_SLOTCFG) {
            if (S.slotCfgEditing) S.slotCfgEditing = false;   /* leave edit first */
            else closeSlotCfg();
        } else if (S.view === VIEW_FILE) {
            S.view = VIEW_MENU;
        } else if (S.view === VIEW_MENU) {
            if (!menuBack()) S.view = VIEW_PRESET_SRC;
        } else if (S.view === VIEW_PRESET_LIST && S.confirmDel) {
            S.confirmDel = false;
        } else if (S.view === VIEW_PRESET_LIST || S.view === VIEW_PRESET_BAKED) {
            /* Leaving the browser un-committed undoes the audition: you came in
             * with a sound and you leave with it. Load is what makes a preview
             * permanent (it drops origState). */
            revertOriginal();
            S.view = VIEW_PRESET_SRC;
        } else if (S.view === VIEW_PRESET_SRC) {
            S.view = VIEW_EDIT;
        } else if (S.view === VIEW_EDIT || S.view === VIEW_BROWSE) {
            S.view = VIEW_BLOCKS;
            S.pendingAction = { t: 'names' };
        } else if (S.bus) {
            /* One level up is wherever the bus was entered FROM — the track's
             * picker, or the session-wide bus list. leaveBus knows which. */
            S.pendingAction = { t: 'leavebus' };
        } else if (S.view === VIEW_BUSES) {
            soundExit();
        } else {
            soundExit();
        }
        S.presetMsg = '';
        S.dirty = true;
        return true;
    }
    return false;
}

/* Capacitive knob touch (notes 0-7). Touch HIGHLIGHTS; a turn within that touch
 * is what reveals the zoom/picker. */
export function soundOnNote(status, d1, d2) {
    if (!S.active) return false;
    if (status !== 0x90 && status !== 0x80) return false;

    /* Note 8 = volume-knob touch. Its RELEASE is the end of the gesture, and
     * the only moment worth persisting: the host's slot-level setter doesn't
     * save, and saving is a synchronous file write. */
    if (d1 === 8) {
        const on = (status === 0x90 && d2 >= 64);
        if (S.volTouched && !on) flushVolumeSave();
        S.volTouched = on;
        S.volShownUntil = on ? (S.tickCount + VOL_SHOW_TICKS * 4) : S.tickCount + VOL_SHOW_TICKS;
        S.dirty = true;
        return true;
    }
    if (d1 > 7) return false;
    const on = (status === 0x90 && d2 >= 64);
    const next = on ? d1 : -1;
    if (next !== S.touchedIdx) {
        S.touchedIdx = next;
        S.touchedTick = S.tickCount;
        S.touchHeld = on;
        S.turnedSinceTouch = false;
        S.dirty = true;
    }
    return true;
}

/* ---- tick: this is where every engine call happens ---- */

export function soundTick() {
    if (!S.active) return;
    S.tickCount++;

    if (isTextEntryActive()) { tickTextEntry(); return; }

    if (S.pendingDiscover > 0 && --S.pendingDiscover === 0) runDiscovery();

    /* Prescan owns the tick while it runs: it is already at the SHM budget, and
     * letting a preview interleave would fight it for the same index param. */
    if (S.bakedScan >= 0) { stepBakedScan(); return; }

    /* Debounced audition. */
    if (S.previewDelay > 0 && --S.previewDelay === 0 && S.previewIdx >= 0) {
        if (S.view === VIEW_PRESET_BAKED) applyBaked(S.previewIdx);
        else if (S.view === VIEW_PRESET_LIST) applyUserPreset(S.previewIdx);
        S.dirty = true;
    } else if (S.previewDelay === 0 && S.previewIdx === -1 &&
               S.view === VIEW_PRESET_LIST && S.userIdx === SAVE_ROW &&
               S.origState !== null) {
        /* Parked on the save row: make sure what you hear is the sound that
         * will actually be saved, not the last thing auditioned. */
        engineSetState(S.slot, S.comp, S.origState);
        S.previewIdx = -2;   /* done; -1 would re-fire every tick */
    }

    /* Drain a bounded number of queued writes. */
    for (let n = 0; n < WRITES_PER_TICK && S.pendingWrites.length; n++) {
        const w = S.pendingWrites.shift();
        engineSet(w.slot, w.comp, w.key, w.val);
    }
    drainSlotWrites();

    if (S.volPending) {
        S.volPending = false;
        engineSetSlotParam(S.slot, SLOT_LEVEL_KEY, S.volLevel.toFixed(3));
    }

    /* One heavy job per tick, and never on top of pending writes: a discovery
     * pass or a browser scan is the most expensive thing this module does, and
     * stacking it on a write drain doubles the tick's SHM cost at exactly the
     * moment the sequencer is least able to absorb it. Waiting also means a
     * discovery reads back values the edits ahead of it have already landed.
     * The queue coalesces by key, so the wait is bounded by the eight knobs. */
    if (S.pendingAction && !S.pendingWrites.length) {
        const a = S.pendingAction;
        S.pendingAction = null;
        runAction(a);
    }

    if (S.needsPoll && !S.pendingWrites.length) {
        S.needsPoll = false;
        pollValues(true);
    }

    if (S.touchedIdx >= 0 && !S.touchHeld &&
        S.tickCount - S.touchedTick > TOUCH_HOLD_TICKS) {
        S.touchedIdx = -1;
        S.dirty = true;
    }

    /* Idle refresh, and only while nothing is queued — a poll mid-sweep would
     * read back stale values and fight the optimistic local ones. */
    if (S.view === VIEW_EDIT && S.banks.length && !S.pendingWrites.length &&
        S.tickCount % POLL_IDLE_TICKS === 0) {
        pollValues(false);
    }
}

/* ---- render ---- */

/* Turn-to-reveal index: which knob has been physically touched AND then turned.
 *
 * It gates the option-list picker overlay — a bare orienting touch must not
 * cover three neighbouring cells; only an actual turn should.
 *
 * The value ZOOM used to ride this too and is gone (Josh, 2026-07-28: the
 * header already names the param and the cell already shows the value, so the
 * zoom bought legibility by hiding half the page). Removed rather than left
 * behind a disabled flag: while it was gated off, this function returned -1
 * unconditionally, which silently took the option-list picker down with it. */
function overlayIdx() {
    return (S.touchedIdx >= 0 && S.turnedSinceTouch) ? S.touchedIdx : -1;
}

function centreText(y, text) {
    mvPrint(Math.max(0, Math.round((128 - mvWidth(text)) / 2)), y, text, 1);
}

function renderBlocks() {
    clear_screen();
    drawKitHeader(S.bus ? S.bus.title : ('TRACK ' + (S.track + 1) + ' - SOUND'), false);
    const ROW_H = 9, VISIBLE = 6;
    const rows = S.pickRows;
    const start = Math.max(0, Math.min(S.pickRow - 2, rows.length - VISIBLE));
    for (let i = 0; i < VISIBLE; i++) {
        const r = rows[start + i];
        if (!r) break;
        const y = 10 + i * ROW_H;
        const sel = ((start + i) === S.pickRow);
        if (sel) fill_rect(0, y - 1, 128, ROW_H, 1);
        hdrPrint(3, y, r.label, sel ? 0 : 1);
        if (r.kind !== 'block') continue;
        /* A bypassed block still says what it holds — you need to know WHAT is
         * switched out — so the state rides as a prefix. Matches the host's 'B'. */
        let t = (r.bypassed ? 'B ' : '') + String(r.name || '-').toUpperCase();
        while (t.length > 1 && mvWidth(t) > 60) t = t.slice(0, -1);
        mvPrint(Math.max(62, 125 - mvWidth(t)), y + 2, t, sel ? 0 : 1);
    }
}

function renderBuses() {
    clear_screen();
    drawKitHeader('SESSION FX', false);
    const ROW_H = 11;
    for (let i = 0; i < FX_BUSES.length; i++) {
        const y = 16 + i * ROW_H;
        const sel = (i === S.busIdx);
        if (sel) fill_rect(0, y - 1, 128, ROW_H, 1);
        hdrPrint(4, y, FX_BUSES[i].title, sel ? 0 : 1);
    }
}

function renderBrowse() {
    clear_screen();
    drawKitHeader(BLOCKS[S.blockIdx].label + ' - PICK', false);
    const ROW_H = 10, VISIBLE = 5;
    const n = S.browseList.length;
    const start = Math.max(0, Math.min(S.browseIdx - 2, n - VISIBLE));
    for (let i = 0; i < VISIBLE; i++) {
        const idx = start + i;
        if (idx >= n) break;
        const y = 11 + i * ROW_H;
        const sel = (idx === S.browseIdx);
        if (sel) fill_rect(0, y - 1, 128, ROW_H, 1);
        let label = String(S.browseList[idx].name);
        while (label.length > 1 && mvWidth(label) > 122) label = label.slice(0, -1);
        mvPrint(3, y + 1, label, sel ? 0 : 1);
    }
}

function renderEdit() {
    clear_screen();
    if (!S.banks.length) {
        drawKitHeader(BLOCKS[S.blockIdx].label, false);
        centreText(28, S.moduleId ? 'NO PARAMS' : 'EMPTY');
        centreText(40, S.moduleId ? 'CLICK FOR PRESETS' : 'CLICK TO PICK');
        return;
    }
    const bank = S.banks[S.bankIdx];
    const cells = renderCellsForBank(bank, S.values, S.rawValues);
    drawKitBankPage(cells, {
        headerText: String(bank.name || '').toUpperCase(),
        headerInvert: false,
        pageIdx: S.bankIdx,
        pageCount: S.banks.length,
        touchedIdx: S.touchedIdx,
        overlayIdx: overlayIdx(),
        env: bank.env || null,
        filt: filterVizFor(bank, S.values),
    });
    if (S.shiftHeld && S.sections.length > 1) {
        drawKitSectionPicker(S.sections, activeSection(S.sections, S.bankIdx));
    }
}

function modLabel() {
    return String(S.moduleId || BLOCKS[S.blockIdx].label).toUpperCase();
}

/* Shared list body for the two row-based preset screens. */
function renderRows(rows, sel, emptyMsg) {
    const ROW_H = 10, VISIBLE = 5;
    if (!rows.length) { centreText(30, emptyMsg); return; }
    const start = Math.max(0, Math.min(sel - 2, rows.length - VISIBLE));
    for (let i = 0; i < VISIBLE; i++) {
        const idx = start + i;
        if (idx >= rows.length) break;
        const y = 11 + i * ROW_H;
        const on = (idx === sel);
        if (on) fill_rect(0, y - 1, 128, ROW_H, 1);
        let label = String(rows[idx]);
        while (label.length > 1 && mvWidth(label) > 122) label = label.slice(0, -1);
        mvPrint(3, y + 1, label, on ? 0 : 1);
    }
}

function renderPresetSrc() {
    clear_screen();
    drawKitHeader(modLabel(), false);
    renderRows(S.srcRows.map(r => r.label), S.presetSrcIdx, '');
}

function renderPresetList() {
    clear_screen();
    if (S.confirmDel) {
        const p = S.userPresets[S.userIdx - 1];
        drawKitHeader('DELETE?', false);
        centreText(20, String(p ? p.name : '').toUpperCase());
        renderRows(['No', 'Yes'], S.confirmIdx, '');
        return;
    }
    drawKitHeader('USER PRESETS', false);
    const rows = ['[Save current…]'].concat(S.userPresets.map(p => p.name));
    renderRows(rows, S.userIdx, '');
    if (S.presetMsg) centreText(58, S.presetMsg);
}

/* Numbered scrollable list, same shape as the user list. The names behind it
 * had to be harvested one index at a time (see openBaked) — while that is
 * running there is nothing to list yet, so show the progress instead of an
 * empty box. */
function renderPresetBaked() {
    clear_screen();
    drawKitHeader(modLabel() + ' PRESETS', false);
    if (S.bakedScan >= 0) {
        centreText(26, 'READING NAMES');
        centreText(40, S.bakedScan + ' / ' + S.bakedCount);
        return;
    }
    if (!S.bakedCount) { centreText(30, S.presetMsg || 'NO PRESETS'); return; }
    const rows = S.bakedNames.map((n, i) =>
        String(i + 1).padStart(3, ' ') + '  ' + (n || ('Preset ' + (i + 1))));
    renderRows(rows, S.bakedIdx, '');
    if (S.presetMsg) centreText(58, S.presetMsg);
}

/* Two-column rows: label left, value right — levels show a chevron instead.
 * The row being edited inverts so it is obvious the jog changed jobs. */
function renderMenu() {
    clear_screen();
    const lv = (S.levels && S.levels[S.menuKey]) || {};
    drawKitHeader(String(lv.name || lv.label || S.menuKey || 'MENU').toUpperCase(), false);
    const rows = S.menuRowsCache;
    if (!rows.length) { centreText(30, 'NO PARAMS'); return; }
    const ROW_H = 10, VISIBLE = 5;
    const start = Math.max(0, Math.min(S.menuIdx - 2, rows.length - VISIBLE));
    for (let i = 0; i < VISIBLE; i++) {
        const idx = start + i;
        if (idx >= rows.length) break;
        const r = rows[idx];
        const y = 11 + i * ROW_H;
        const on = (idx === S.menuIdx);
        if (on) fill_rect(0, y - 1, 128, ROW_H, 1);
        const ink = on ? 0 : 1;
        /* An item row's "value" is whether it is the one in force — without it
         * a bank list is N identical rows and you cannot tell which you're on. */
        const val = (r.kind === 'level') ? '>' :
            (r.kind === 'item') ? (r.selected ? '*' : '') :
            (r.cell ? String(formatValue(r.cell, r.val)) : '');
        let label = String(r.label || '');
        const vw = mvWidth(val);
        while (label.length > 1 && mvWidth(label) > 118 - vw) label = label.slice(0, -1);
        mvPrint(3, y + 1, label, ink);
        mvPrint(125 - vw, y + 1, val, ink);
        /* Edit mode marker: a caret on the value side of the active row. */
        if (on && S.menuEditing && r.kind === 'param') mvPrint(125 - vw - 6, y + 1, '*', ink);
    }
}

function renderFile() {
    clear_screen();
    const st = S.fileState;
    if (!st) { centreText(30, 'NO BROWSER'); return; }
    drawKitHeader(String(st.title || 'FILE').toUpperCase(), false);
    if (st.error) { centreText(30, String(st.error).toUpperCase()); return; }
    renderRows(st.items.map(it => (it.kind === 'dir' ? it.label + '/' : it.label)),
               st.selectedIndex, 'EMPTY');
}

/* Level read-out. Drawn OVER whichever view is up rather than as its own
 * screen: the knob is live everywhere in sound mode, so it has to be readable
 * from everywhere, and it should not cost you your place. */
function drawVolReadout() {
    const pct = Math.round((S.volLevel / VOL_MAX) * 100);
    const txt = 'LEVEL  ' + (S.volLevel).toFixed(2) + 'x';
    const w = 100, h = 22, x = (128 - w) >> 1, y = 21;
    fill_rect(x, y, w, h, 0);
    draw_rect(x, y, w, h, 1);
    mvPrint(x + 5, y + 4, txt, 1);
    const bw = w - 10;
    draw_rect(x + 5, y + 14, bw, 4, 1);
    const fillw = Math.max(0, Math.min(bw, Math.round(bw * pct / 100)));
    if (fillw > 0) fill_rect(x + 5, y + 14, fillw, 4, 1);
}

export function soundRender() {
    if (!S.active) return false;
    if (isTextEntryActive()) { drawTextEntry(); return true; }
    if (S.view === VIEW_BLOCKS) renderBlocks();
    else if (S.view === VIEW_BROWSE) renderBrowse();
    else if (S.view === VIEW_PRESET_SRC) renderPresetSrc();
    else if (S.view === VIEW_PRESET_LIST) renderPresetList();
    else if (S.view === VIEW_PRESET_BAKED) renderPresetBaked();
    else if (S.view === VIEW_MENU) renderMenu();
    else if (S.view === VIEW_FILE) renderFile();
    else if (S.view === VIEW_SLOTCFG) renderSlotCfg();
    else if (S.view === VIEW_BUSES) renderBuses();
    else renderEdit();
    if (S.volShownUntil >= 0 && S.tickCount <= S.volShownUntil) drawVolReadout();
    return true;
}
