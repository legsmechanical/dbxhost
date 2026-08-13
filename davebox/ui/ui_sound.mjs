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
    COMPONENTS, PRESET_ROOT, engineGet, engineSet, engineListModules, engineDescribe,
    engineClaimsEditCcs, SLOT_FX_BLOCKS, HAS_SEND_FX,
    engineLoadModule, engineLoadedModule, engineGetState, engineSetState,
    engineListUserPresets, engineReadUserPreset,
    engineGetSlotParam, engineSetSlotParam, engineSaveState, engineVolBlock,
    engineGetChainParam, engineSetChainParam,
    SLOT_LEVEL_KEY, SLOT_LEVEL_STEP, SLOT_LEVEL_MAX,
    slotIndex, moveBusForChannel, moveBusComp, moveBusPrefix,
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
    menuRows, menuCell, levelCommits, childSpec, modeRows, livePressSpec,
    inferGuessedMeta, moduleIdOf, buildBrowseList } from './ui_discover.mjs';
import { parseValue, stepValue, commitString, renderCellsForBank,
    formatValue } from './ui_cells.mjs';
import {
    drawKitBankPage, drawKitHeader, drawKitSectionPicker, drawKitList,
    hdrPrint, mvPrint, mvWidth, shapeSample, plotLine,
} from './ui_movy.mjs';
import { drawDialogYesNoRow } from '/data/UserData/schwung/shared/menu_layout.mjs';

/* Chain blocks in signal order, across the audio-FX blocks the host routes.
 *
 * ⚠ SLOT_FX_BLOCKS mirrors the host's own constant — do not write a literal here.
 * `fx1:`..`fx4:` are routed param NAMESPACES, so a count that overshoots what the
 * host routes does not fail: the extra rows render, every read comes back empty
 * and every write vanishes. Silent misbehaviour, invisible to any typeof check,
 * because the divergence is a key prefix rather than a binding. */
export const BLOCKS = [
    { comp: 'midi_fx1', label: 'MIDI FX' },
    { comp: 'synth',    label: 'SYNTH'   },
    ...Array.from({ length: SLOT_FX_BLOCKS }, (_, i) => ({
        comp: `fx${i + 1}`, label: `FX ${i + 1}`,
    })),
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
/* ⚠ MASTER HAS NO LEVEL PARAM. `master_fx:volume` appears in the host's own
 * FX_BUS table but nothing implements it — `master_fx:` keys are parsed for
 * `fxN:` only, and a bare `volume` hits the "unrecognized, leave it" branch in
 * shadow_chain_mgmt.c. The host's own Master FX volume row therefore reads a key
 * nothing answers (so it always shows 100%) and writes into the void. Not worth
 * adding: the device already has a master output level (Josh, 07-29).
 *
 * The SEND return levels are real — `shadow_send_return_level[2]`, set + get,
 * persisted as `send_return_level`. Range matches the host's own row: 0..1. */
/* Master FX is upstream; the two SEND buses are fork-only — `send_fx:` exists in
 * no other build. Listed unconditionally because this host routes them; if that
 * ever stops being true they become browsable rows backed by nothing, which is
 * why HAS_SEND_FX declares the routing in one place rather than being assumed
 * at each use site. */
const BUS_LEVEL_STEP = 0.05;
/* A bus's own level rows, in the same shape a slot setting uses. Every bus
 * declares its own list because they genuinely differ: master has none, a send
 * has one 0..1 return, a Move bus has a strip (volume + both sends). */
const RETURN_LEVEL = (comp) => [
    { comp: comp, key: 'return_level', label: 'Return', min: 0, max: 1, step: BUS_LEVEL_STEP },
];
const FX_BUSES = [
    { id: 'master', kind: 'global', title: 'MASTER FX', prefix: 'master_fx:' },
    ...(HAS_SEND_FX ? [
        { id: 'sendA',  kind: 'global', title: 'SEND FX A', prefix: 'send_fx:a:',
          levels: RETURN_LEVEL('send_fx:a') },
        { id: 'sendB',  kind: 'global', title: 'SEND FX B', prefix: 'send_fx:b:',
          levels: RETURN_LEVEL('send_fx:b') },
    ] : []),
];
const BUS_BLOCKS = [1, 2, 3, 4];      /* fx1..fx4 on every bus */

/* ---- Move instrument buses (P8a 1b) ----
 *
 * A track routed to Move plays one of Move's own instruments, and that
 * instrument's audio comes back through the matching Move FX bus — so the track
 * HAS a sound to edit, it just isn't a Schwung chain. Same shape as the session
 * buses above (four inserts addressed by a key prefix, loaded by DSP PATH), so
 * it rides the same machinery; the differences are all in what a Move bus does
 * NOT have. There is no MIDI FX and no transpose — those are chain concepts —
 * and the "synth" is Move's own editor, reached through co-run.
 *
 * ⚠ Which bus, and how its keys are spelled, is `moveBusForChannel` /
 * `moveBusComp` in ui_engine.mjs — one home, because session view addresses the
 * same strip for the same track's level knob. The two traps live there: the bus
 * is the track's CHANNEL (not its index), and `move_fx:` keys are 1-BASED and
 * ignore the slot argument.
 *
 * The strip levels are real host state (`shadow_move_fx_strip[]`): volume is a
 * 0..4 gain like a slot's, the sends are 0..1, and Muted/Soloed are the bus's
 * own — a bus follows ITS mute, never the chain slot at the same index, but it
 * shares the solo group with them, because a solo that left the other family
 * sounding would not be a solo. Toggle rows flip on jog-click rather than
 * opening the level editor a 0/1 value has no use for. */
const MOVE_BUS_TITLE = (bus) => 'MOVE ' + bus + ' - SOUND';
function moveBusFor(track) {
    const bus = moveBusForChannel(GS.trackChannel[track]);
    const cmp = moveBusComp(bus);
    return {
        id: 'move' + bus, kind: 'move', bus: bus, track: track,
        title: MOVE_BUS_TITLE(bus), prefix: moveBusPrefix(bus),
        levels: [
            { comp: cmp, key: 'volume', label: 'Volume',
              min: 0, max: SLOT_LEVEL_MAX, step: BUS_LEVEL_STEP, fmt: GAIN_FMT },
            { comp: cmp, key: 'send_a', label: 'Send A',
              min: 0, max: 1, step: BUS_LEVEL_STEP },
            { comp: cmp, key: 'send_b', label: 'Send B',
              min: 0, max: 1, step: BUS_LEVEL_STEP },
            { comp: cmp, key: 'muted', label: 'Muted',
              min: 0, max: 1, step: 1, toggle: true },
            { comp: cmp, key: 'soloed', label: 'Soloed',
              min: 0, max: 1, step: 1, toggle: true },
        ],
    };
}

const VIEW_BLOCKS = 0, VIEW_EDIT = 1, VIEW_BROWSE = 2,
      VIEW_PRESET_SRC = 3, VIEW_PRESET_LIST = 4, VIEW_PRESET_BAKED = 5,
      VIEW_MENU = 6, VIEW_FILE = 7, VIEW_SLOTCFG = 8, VIEW_BUSES = 9,
      VIEW_PATCHES = 10,
      /* P7: the knob and LFO editors, absorbed from the host (they were
       * overlay services in P5). Sub-screens of slot settings. */
      VIEW_KNOBS = 11, VIEW_KNOB_TARGET = 12, VIEW_KNOB_PARAM = 13,
      VIEW_LFO = 14, VIEW_LFO_TARGET = 15, VIEW_LFO_PARAM = 16;

/* Chain-patch file ops (save_patch / delete_patch) are DSP-side and async —
 * the file appears/vanishes a beat after the request. Re-read the list once
 * this many ticks after a mutation so it shows the store's truth, not the
 * optimistic edit. (~320ms at ~94Hz.) */
const PATCH_RELIST_TICKS = 30;

/* ---- slot settings ----
 *
 * The SLOT's own params, as opposed to any module in it: where the track's
 * audio goes and how its MIDI is routed. They were reachable only by leaving
 * davebox for the host's chain editor, which is a long way to go for a send.
 *
 * Mirrors the host's CHAIN_SETTINGS_ITEMS — same keys, same ranges, so the two
 * screens can't disagree. Knob and LFO assignment are `sub` rows: davebox's
 * OWN editors (absorbed in P7 — they were host overlay services in P5),
 * reading and writing the same chain-host slot params the host's editors did
 * (knob_N_target/param via knob_N_set/clear; lfoN:* keys).
 *
 * `fmt` exists because a raw number is a lie for most of these: a transpose of
 * 0 is "0 st", a mute is Yes/No. */
const PCT_FMT = (v) => Math.round(v * 100) + '%';
/* Levels read as a GAIN, not a percentage — one notation for the quantity
 * wherever it appears (this row, the Move bus strip, the knob read-out), so the
 * same value never wears two labels now that they are all the same key. `x`
 * because a level goes above unity: "200%" invites reading a fader position,
 * "2.00x" says what it does. Sends keep PCT_FMT — they are 0..1 proportions,
 * where a percentage is exactly right. */
const GAIN_FMT = (v) => (v || 0).toFixed(2) + 'x';
const ST_FMT  = (v) => (v === 0 ? '0 st' : (v > 0 ? '+' : '') + v + ' st');
const ONOFF   = (v) => (v ? 'Yes' : 'No');

const SLOT_SETTINGS = [
    /* The slot's OUTPUT, and since the SLOT_LEVEL_KEY flip the same value the
     * volume knob and the session-view knobs move. Bound by SLOT_LEVEL_MAX
     * rather than the host's 4x wire clamp — one key must not offer a ceiling
     * here that the knobs would snap away from on the first detent. */
    { key: 'volume',        label: 'Volume',      min: 0, max: SLOT_LEVEL_MAX, step: 0.05, fmt: GAIN_FMT },
    /* Module Level is deliberately NOT here — it belongs to whatever module is
     * loaded, not to the slot, and it already lives at the root of that
     * module's own menu. Two homes would make it ambiguous which one wins.
     * ⚠ It is also no longer written by ANY davebox surface (SLOT_LEVEL_KEY
     * moved off `synth_volume`); it defaults to unity, so it is an inert
     * multiplier unless deliberately edited through the host's own row. */
    { key: 'send_a',        label: 'Send A',      min: 0, max: 1, step: 0.05, fmt: PCT_FMT, cap: 'sends' },
    { key: 'send_b',        label: 'Send B',      min: 0, max: 1, step: 0.05, fmt: PCT_FMT, cap: 'sends' },
    { key: 'transpose',     label: 'Transpose',   min: -12, max: 12, step: 1, int: true, fmt: ST_FMT },
    /* `Recv Ch`, `Fwd Ch` and the derived `MPE` row were here until the track
     * gained ownership of its instrument (TRACK_OWNS_ITS_INSTRUMENT.md, Josh
     * signed off all three). Where a track's notes go is answered entirely by
     * the Instrument selector — a second place to express routing is the
     * ambiguity that spec exists to remove, and this was the stale one:
     * davebox dispatches by ADDRESSED SLOT, never by channel match
     * (`ROUTE_SCHWUNG` in seq8.c), so a slot's receive channel never affected
     * anything davebox did. MPE was defined as recv=All + fwd=Thru, built out
     * of the very two rows above, and davebox does not support MPE anyway.
     * All three were absorbed from the host's chain editor in P7 because that
     * screen had them, not because this module used them.
     * ⚠ The host PARAMS stay — host code still reads them; removing state is a
     * separate, larger change. The consequence is noted in the spec. */
    { key: 'muted',         label: 'Muted',       min: 0, max: 1, step: 1, int: true, fmt: ONOFF },
    { key: 'soloed',        label: 'Soloed',      min: 0, max: 1, step: 1, int: true, fmt: ONOFF },
    /* `move_to_slot` was here until P8a 1a retired Move>Slot in the host: a slot
     * is a Move bus or a Schwung chain, never both. The host has no such key any
     * more, so the row read empty and wrote into the void — deleted rather than
     * left as a control that does nothing. */
    /* Sub-screen rows: jog-click opens davebox's own editor; Back returns
     * here. No value to read or edit on the row itself. */
    { key: 'knobs', label: 'Knobs...',  sub: 'knobs' },
    { key: 'lfo1',  label: 'LFO 1...',  sub: 'lfo', lfo: 0 },
    { key: 'lfo2',  label: 'LFO 2...',  sub: 'lfo', lfo: 1 },
];

/* ---- knob / LFO editor vocabulary (ported from the host's editors — same
 * constants, same param model, so existing assignments read back exactly) ---- */
const LFO_SHAPES = ['Sine', 'Tri', 'Saw', 'Square', 'S&H', 'Swishy'];
/* shapeSample ids, by the same index as LFO_SHAPES. */
const LFO_SHAPE_IDS = ['sine', 'tri', 'saw', 'square', 'sh', 'swishy'];
/* ⚠ Index IS the wire value the DSP stores — copied verbatim from the host's
 * 27-entry table, never reordered. */
const LFO_DIVISIONS = [
    '16bar', '15bar', '14bar', '13bar', '12bar', '11bar', '10bar', '9bar',
    '8bar', '7bar', '6bar', '5bar', '4bar', '3bar', '2bar',
    '1/1', '1/1T', '1/2', '1/2T', '1/4', '1/4T', '1/8', '1/8T',
    '1/16', '1/16T', '1/32', '1/32T'
];
/* Hardcoded LFO param list for LFO-to-LFO modulation. */
const LFO_TARGET_PARAMS = [
    { key: 'depth', label: 'Depth' },
    { key: 'rate_hz', label: 'Rate Hz' },
    { key: 'phase_offset', label: 'Phase Offset' },
];
const NUM_KNOBS = 8;

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
/* How long to watch for a vouched pad press to move the module's focus (~300ms
 * at 94Hz). Generous on purpose: the cost is one get_param every other tick and
 * it stops the moment focus moves, whereas giving up early is the failure that
 * reads as "the tap did nothing". */
const PAD_WATCH_TICKS = 28;
/* ⚠ `shadow_set_param` returns FALSE when the mailbox never goes idle — the
 * write is dropped, silently. Everything else here is a knob edit that the next
 * detent or the idle poll repairs; the vouch is a one-shot with a deadline, so
 * it is the one write that must be retried. */
const VOUCH_MAX_TRIES = 4;
/* A forced bank re-read is SPREAD over ticks. Eight synchronous get_params is
 * ~21ms against a ~10.6ms tick budget, so doing them together stalls the
 * sequencer AND the UI — once per pad press, which is exactly the moment it is
 * most visible. Measured cost per get_param on device: ~2.6ms. */
const POLL_PER_TICK = 3;
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

    /* Hosting: a module that DECLARES `capabilities.host_canvas_ui` draws
     * itself through its own bank_editor, and `banks` stays as the fallback.
     * See hostedCtx(). Null for every module that does not declare it. */
    hosted: null,
    hostedCtx: null,
    hostedPage: {},             /* "slot:comp:module" -> persisted bank index */
    hostedOpened: false,        /* onOpen fired for THIS block yet? */
    /* Whether WE currently hold the host's edit-CC claim. Mirrors what we last
     * told host_edit_cc_block, so reconcile only calls on a real change. */
    editCcClaimed: false,

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
    modes: null,                /* level keys when the module's top screen is a mode CHOICE */
    modeParam: '',              /* the engine key that mode choice also writes */
    cpMap: null,
    menuStack: [],              /* [{levelKey, cursor, child}] — breadcrumb for Back */
    menuKey: null,
    menuIdx: 0,
    menuChild: -1,              /* chosen repeated element on a child_prefix level */
    /* Live pad focus. `livePress` is the module's declaration (see
     * livePressSpec); `padVouch` is a press waiting to be sent. The vouch is
     * LATENCY-CRITICAL — the module correlates it against a note it has already
     * seen, inside a window measured in render blocks — so it jumps the write
     * queue rather than joining the back of it. */
    livePress: null,
    padVouch: false,
    /* After a vouch we WATCH for the module's focus to move rather than reading
     * once at a fixed delay — see the tick. `padWatchFrom` is where focus sat
     * before the vouch, so "not there yet" is distinguishable from "it moved". */
    padWatchLeft: 0,
    padWatchFrom: -1,
    padLastSeen: -1,            /* last selection we READ; the vouch's baseline */
    /* The note-naming key last DISCOVERED. Outside sound mode no discovery has
     * run, so this is how the co-run path knows what to write. */
    lastNoteParam: '',
    pollCursor: -1,             /* spread bank re-read; <0 = idle */
    padVouchTries: 0,           /* the vouch write can be DROPPED; retry it */
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
    confirmItem: null,          /* dynamic-list row awaiting "are you sure" */
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
    enterSession: false,        /* the VIEW this screen was called from; leaving it ends us */
    bus: null,                  /* null = editing a TRACK's slot; else a bus descriptor
                                 * (FX_BUSES entry, or a Move bus from moveBusFor) */
    coRunRequest: -1,           /* track whose Move editor to open; -1 = none */
    busIdx: 0,                  /* cursor on the bus LIST */
    busLevelEditing: false,     /* jog is editing the return level, not scrolling */
    busLevelDirty: false,       /* changed → save chain state when leaving the bus */
    pickRows: [],               /* picker rows: {kind:'bus'|'block'|'settings'} */
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

    /* Knob editor (P7 absorb): per-slot knob->target:param assignment. */
    knobIdx: 0,                 /* cursor, 0-7 */
    knobAsn: [],                /* 8 x {target, param}, read at open */
    knobTargets: [],            /* [{id, name}] — components with modules */
    knobTargetIdx: 0,
    knobParams: [],             /* [{key, label}] for the chosen target */
    knobParamIdx: 0,
    knobTarget: '',             /* target chosen in the picker */

    /* LFO editor (P7 absorb): lfoN:* slot params, values cached at open and
     * kept current optimistically on edit (reads are SHM round-trips). */
    lfoNum: 0,                  /* which LFO, 0/1 */
    lfoIdx: 0,                  /* cursor in the items list */
    lfoEditing: false,          /* jog edits the highlighted value */
    lfoVals: {},                /* key -> raw string value */
    lfoComps: [],               /* target picker: [{key, label}] */
    lfoCompIdx: 0,
    lfoParams: [],              /* target param picker: [{key, label}] */
    lfoParamIdx: 0,

    /* Whole-chain patches (P5 absorb — same patches/ store as the host,
     * through the host_patch_* API so the index space and serializer stay
     * the host's own). */
    patchNames: [],             /* store listing, index-aligned with the DSP */
    patchIdx: 0,                /* cursor: 0=[Save], 1=[Save as], 2+=patches */
    patchCur: '',               /* the slot's current patch name, '' untitled */
    patchMsg: '',
    patchConfirm: null,         /* {t:'overwrite'|'delete', index, name} */
    patchConfirmIdx: 0,
    patchRelist: 0,             /* ticks until a post-mutation re-list */

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
    /* Track view only (Josh, 2026-08-08): the track flavour belongs to track
     * view; session view has its own entry (soundEnterBuses). Guard the
     * mechanism so every door is covered. */
    if (GS.sessionView) return;
    S.active = true;
    S.enterSession = false;     /* called from TRACK view */
    /* A TRACK context is not a bus one. Without this the previous session's bus
     * survived — S.bus is what soundIsGlobal() and buildPickRows() read, so
     * entering a track's sound landed you back on the bus's blocks. Third bug
     * of this shape today: state that outlives the screen it belonged to. */
    clearBusContext();
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
/* Land everything queued against the track we are LEAVING. Shared by both
 * retarget paths (chain slot and Move bus): these edits were made to that track
 * and must not follow you to the next one. */
function flushForRetarget() {
    /* ⚠ FIRST, and inside this helper rather than at either call site: the
     * volume knob's target depends on the CURRENT context (chain level vs Move
     * bus strip), so a queued turn has to land before S.bus changes underneath
     * it — otherwise the bus's value is written to a chain slot's key. */
    if (S.volPending) {
        S.volPending = false;
        writeVolLevel(S.slot, S.volLevel);
    }
    for (const w of S.pendingWrites) engineSet(w.slot, w.comp, w.key, w.val);
    S.pendingWrites.length = 0;
    /* Slot params carry their own slot, so landing them here is correct rather
     * than merely tidy. */
    for (const w of S.pendingSlotWrites) {
        const s = SLOT_SETTINGS.find(x => x.key === w.key);
        engineSetSlotParam(w.slot, w.key, s && s.int ? String(w.val) : w.val.toFixed(3));
    }
    S.pendingSlotWrites.length = 0;
    if (S.slotCfgDirty || S.busLevelDirty) {
        S.slotCfgDirty = false;
        S.busLevelDirty = false;
        engineSaveState();
    }
}

export function soundRetarget(track, slot) {
    flushForRetarget();

    S.track = track;
    /* A SESSION bus is global — following the active track must not drag its
     * editing context off slot 0. Remember where to return and leave the view
     * alone. A MOVE bus is the opposite: it belongs to the track we are leaving,
     * so it must be dropped or the new track's chain would render underneath the
     * old track's Move header. */
    if (S.bus && S.bus.kind === 'global') { S.dirty = true; return; }
    const leftMoveBus = !!S.bus;
    /* WHERE you were, read before anything below moves it.
     *
     * "Keep your place" only ever meant something for one case: you were INSIDE
     * a block's editor, and the reason to switch tracks mid-edit is to compare
     * the same block across two of them. From anywhere else — the picker, slot
     * settings, a preset list — there is no place inside a block to keep, and
     * reopening one drops you a level DEEPER than you were.
     *
     * That distinction was missing: chain -> chain reopened the block whenever
     * the new track had one loaded, so switching from the picker landed on the
     * synth canvas while the same switch off a Move bus landed on the picker.
     * Josh caught the asymmetry on hardware, 2026-08-11. Cross-flavour is
     * always the picker anyway — the rows are not the same rows. */
    const keepPlace = !leftMoveBus && S.view === VIEW_EDIT;
    if (leftMoveBus) {
        /* Leaving a Move bus: nothing about WHERE you were transfers, because
         * the rows aren't the same rows. Land on the new track's picker, on its
         * synth — not on an fx index that meant a bus insert a moment ago. */
        clearBusContext();
        S.view = VIEW_BLOCKS;
        S.pickRow = 0;
        S.comp = 'synth';
        S.blockIdx = 1;
    }
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
    S.menuChild = -1;
    S.modes = null;
    S.modeParam = '';
    S.menuRowsCache = [];
    S.menuEditing = false;
    S.banks = [];
    S.sections = [];
    S.bankIdx = 0;
    S.moduleId = '';
    /* The declaration belongs to the module we are leaving. Re-derived by the
     * discovery this retarget queues; until then there is nothing to vouch to,
     * and a stale spec would aim a write at the NEW slot using the OLD module's
     * key — the silent kind of wrong. */
    S.livePress = null;
    S.padVouch = false;
    S.padWatchLeft = 0;
    S.padVouchTries = 0;
    S.pollCursor = -1;
    S.blockNames = [];
    S.presetMsg = '';
    S.pendingDiscover = 0;
    S.pendingAction = { t: 'retarget', picker: !keepPlace };
    /* The pending level already landed in flushForRetarget, against the context
     * it was turned in. The claim itself stays up — we're still in sound mode. */
    flushVolumeSave();
    /* Coming FROM a Move bus the claim is down — soundEnterMove released it,
     * because a Move bus has no slot level for the knob to mean. Re-claim it
     * here or the master knob would silently stop being this chain's level for
     * the rest of the session. claimVolume also reads the new level. */
    if (leftMoveBus) claimVolume(slot);
    else {
        S.volLevel = readSlotVolume(slot);
        S.volShownUntil = -1;
    }
    S.dirty = true;
    log('retarget: track ' + track + ' slot ' + slot + ' comp ' + S.comp);
}

/* Everything that only means something inside a bus. Cleared on both edges —
 * leaving sound mode and entering a track — so neither direction can inherit it. */
function clearBusContext() {
    S.bus = null;
    S.busIdx = 0;
    S.busLevelEditing = false;
    S.busLevelDirty = false;
}

export function soundExit() {
    /* Give the edit CCs back to Move FIRST. Everything below can throw or take a
     * slow path, and a stranded claim silently steals the user's native Undo. */
    reconcileEditCcClaim(true);
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
    /* Component writes are flushed too, not dropped. They were dropped back when
     * the only thing in this queue was a param edit mid-turn; a send's RETURN
     * level rides the same queue now, and leaving the screen is exactly when you
     * would expect the value you just dialled to stick. Each carries its own
     * slot and comp, so landing them here is correct, not merely tidy. */
    for (const w of S.pendingWrites) engineSet(w.slot, w.comp, w.key, w.val);
    S.pendingWrites.length = 0;
    if (S.busLevelDirty) engineSaveState();
    S.active = false;
    clearBusContext();
    S.pendingAction = null;
    S.pendingDiscover = 0;
    /* An in-flight vouch is DROPPED, not flushed. Its whole meaning is "focus
     * the pad I am looking at right now", and we are no longer looking. */
    S.padVouch = false;
    S.padWatchLeft = 0;
    S.padVouchTries = 0;
    S.pollCursor = -1;
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
        if (r.kind === 'buslevel') {
            const raw = parseFloat(engineGet(S.slot, r.spec.comp, r.spec.key));
            /* Unity is the right fallback for a level that passes signal
             * through (a return, a strip volume) but NOT for a send: an
             * unreadable send would come up fully open into a bus. */
            const passThrough = !r.spec.toggle &&
                                r.spec.key !== 'send_a' && r.spec.key !== 'send_b';
            r.val = isFinite(raw) ? raw : (passThrough ? 1 : 0);
            continue;
        }
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
/* WHAT the volume knob moves, in the one place both flavours agree on it.
 *
 * In sound mode plain Volume means "the level of the thing on this screen", and
 * both answers are now the same KIND of thing: for a chain that is the slot's
 * output (`slot:volume`, via SLOT_LEVEL_KEY), for a Move bus the bus strip's own
 * Volume. Two families, one mixer position, one ceiling (SLOT_LEVEL_MAX).
 *
 * ⚠ Returning null here is NOT an option, and getting this wrong is exactly the
 * bug Josh found: with the Move flavour excluded from soundIsGlobal(), the CC 79
 * branch still consumed the turn and wrote the SLOT level key against S.slot,
 * which a Move bus pins to 0 — so turning the knob moved a DIFFERENT track's
 * chain level, while Move (claim released) moved its master underneath. */
function volTarget() {
    if (S.bus && S.bus.kind === 'move') {
        return { comp: S.bus.prefix.slice(0, -1), key: 'volume' };
    }
    return null;                                /* null = the slot's own level */
}

function readSlotVolume(slot) {
    const t = volTarget();
    const raw = t ? engineGet(slot, t.comp, t.key) : engineGetSlotParam(slot, SLOT_LEVEL_KEY);
    const v = parseFloat(raw);
    return (isFinite(v) && v >= 0) ? v : 1;
}

function writeVolLevel(slot, v) {
    const t = volTarget();
    if (t) engineSet(slot, t.comp, t.key, v.toFixed(3));
    else engineSetSlotParam(slot, SLOT_LEVEL_KEY, v.toFixed(3));
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
    host_ensure_dir(dir);
    /* Parsed object when the state is JSON, raw string otherwise — the same
     * opaque-state fallback the host's writer uses. */
    let state;
    try { state = JSON.parse(stateJson); } catch (e) { state = stateJson; }
    const payload = JSON.stringify({
        name, module: S.moduleId, version: 1, state,
    });
    const path = uniquePath(dir, safeStem(name));
    const ok = host_write_file(path, payload);
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

/* ---- whole-chain patches (P5 absorb) ----
 *
 * The store, the serializer, and the index space are the HOST's, reached
 * through host_patch_list/current/load/save/delete — davebox owns only this
 * screen. That split is the point: two UIs over one store cannot disagree
 * about what a patch is. All host_patch_* calls are synchronous host JS
 * doing SHM/file work, so every entry runs from tick via pendingAction,
 * never from the MIDI handler. */

function openChainPatches() {
    S.patchNames = host_patch_list();
    S.patchCur = host_patch_current(S.slot);
    const cur = S.patchNames.indexOf(S.patchCur);
    S.patchIdx = (cur >= 0) ? cur + 2 : (S.patchNames.length ? 2 : 0);
    S.patchMsg = '';
    S.patchConfirm = null;
    S.patchRelist = 0;
    S.view = VIEW_PATCHES;
    log('chain patches: ' + S.patchNames.length + ' in store');
}

function doChainPatchLoad(index) {
    if (!host_patch_load(S.slot, index)) { S.patchMsg = 'LOAD FAILED'; return; }
    S.patchCur = S.patchNames[index] || '';
    S.patchMsg = '';
    /* A patch swaps every module in the chain — land back on the overview
     * with the block names re-read, looking at what just loaded. */
    S.view = VIEW_BLOCKS;
    S.pendingAction = { t: 'names' };
}

/* [Save]: overwrite the slot's current patch (confirmed) when it still
 * exists in the store; otherwise behave as Save As. */
function startPatchSave() {
    const existing = S.patchCur ? S.patchNames.indexOf(S.patchCur) : -1;
    if (existing >= 0) {
        S.patchConfirm = { t: 'overwrite', index: existing, name: S.patchCur };
        S.patchConfirmIdx = 0;
    } else {
        startPatchSaveAs(S.patchCur || 'Chain');
    }
}

function startPatchSaveAs(prefill) {
    openTextEntry({
        title: '',
        initialText: String(prefill || 'Chain'),
        onConfirm: (name) => {
            const trimmed = String(name || '').trim() || 'Chain';
            const existing = S.patchNames.indexOf(trimmed);
            if (existing >= 0) {
                /* An existing name is an overwrite, and overwrites confirm —
                 * unlike module presets, patches have no auto-number rule
                 * because replacing "the" patch by name is the common intent. */
                S.patchConfirm = { t: 'overwrite', index: existing, name: trimmed };
                S.patchConfirmIdx = 0;
            } else {
                S.pendingAction = { t: 'patchsavedo', name: trimmed, overwrite: -1 };
            }
            S.dirty = true;
        },
        onCancel: () => { S.patchMsg = 'CANCELLED'; S.dirty = true; },
    });
}

function doChainPatchSave(rawName, overwriteIndex) {
    const name = String(rawName || '').trim() || 'Chain';
    const ok = host_patch_save(S.slot, name, overwriteIndex);
    S.patchMsg = ok ? 'SAVED' : 'SAVE FAILED';
    if (!ok) return;
    S.patchCur = name;
    if (overwriteIndex < 0 && S.patchNames.indexOf(name) < 0) {
        /* Optimistic insert keeps the cursor meaningful until the store's
         * truth arrives on the delayed re-list. */
        S.patchNames.push(name);
    }
    S.patchRelist = PATCH_RELIST_TICKS;
}

function doChainPatchDelete(index) {
    const name = S.patchNames[index];
    const ok = host_patch_delete(S.slot, index);
    S.patchMsg = ok ? 'DELETED' : 'DELETE FAILED';
    if (!ok) return;
    if (name === S.patchCur) S.patchCur = '';
    S.patchNames.splice(index, 1);
    if (S.patchIdx > S.patchNames.length + 1) S.patchIdx = S.patchNames.length + 1;
    S.patchRelist = PATCH_RELIST_TICKS;
}

/* Post-mutation re-list once the DSP has had time to touch the files. */
function tickChainPatches() {
    if (S.patchRelist <= 0) return;
    if (--S.patchRelist > 0) return;
    if (S.view !== VIEW_PATCHES) return;
    S.patchNames = host_patch_list();
    S.patchCur = host_patch_current(S.slot);
    if (S.patchIdx > S.patchNames.length + 1) S.patchIdx = S.patchNames.length + 1;
    S.dirty = true;
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
    return !!host_file_exists(path);
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
    if (!S.levels || !(S.rootKey || S.modes)) { S.presetMsg = 'NO MENU'; return; }
    S.menuStack = [];
    /* A modes hierarchy has no root — its top screen is the mode list, so the
     * menu opens with no level at all. Anything else opens on root. */
    S.menuKey = S.modes ? null : S.rootKey;
    S.menuIdx = 0;
    S.menuChild = -1;
    S.menuEditing = false;
    refreshMenuRows();
    S.view = VIEW_MENU;
    log('menu: ' + S.moduleId + ' root=' + S.rootKey + ' rows=' + S.menuRowsCache.length);
}

/* A DYNAMIC level lists items the module hands back when asked (obxd's FXB
 * banks) rather than params declared in the hierarchy. menuRows cannot build
 * these — they don't exist until we read them — so they're built here, where
 * engine reads already happen and the tick budget is understood. */
function itemRows(lv, levelKey) {
    const raw = engineGet(S.slot, S.comp, lv.items_param);
    let items = [];
    try { items = raw ? JSON.parse(raw) : []; }
    catch (e) { log('items parse failed for ' + lv.items_param + ': ' + e); }
    if (!Array.isArray(items)) items = [];
    const selectKey = lv.select_param || '';
    const commits = levelCommits(lv, levelKey);
    const cur = selectKey ? parseInt(engineGet(S.slot, S.comp, selectKey), 10) : NaN;
    return items.map((it, i) => {
        const index = (it && typeof it.index === 'number') ? it.index : i;
        return {
            kind: 'item', index, selectKey, commits,
            navigateTo: lv.navigate_to || '',
            label: String((it && (it.label || it.name)) || ('Item ' + (index + 1))),
            selected: index === cur,
        };
    });
}

function refreshMenuRows() {
    if (!S.menuKey && S.modes) {
        S.menuRowsCache = modeRows(S.modes, S.levels);
        if (S.menuIdx >= S.menuRowsCache.length) S.menuIdx = 0;
        return;
    }
    const lv = (S.levels && S.levels[S.menuKey]) || null;
    if (lv && lv.items_param) {
        S.menuRowsCache = itemRows(lv, S.menuKey);
        if (S.menuIdx >= S.menuRowsCache.length) S.menuIdx = 0;
        return;
    }
    S.menuRowsCache = menuRows(S.levels, S.menuKey, S.cpMap, S.menuChild);
    if (S.menuIdx >= S.menuRowsCache.length) S.menuIdx = 0;
    /* Values for the params on this page only — a deep hierarchy is far more
     * params than one screen, and reading them all would be the lab rig's
     * mistake at a larger scale. */
    for (const r of S.menuRowsCache) {
        if (r.kind !== 'param') continue;
        /* Metadata by the declared key, value by the resolved address — inside
         * a repeated element those differ (see childSpec in ui_discover). */
        const cell = menuCell(r.key, S.levels, S.menuKey, S.cpMap);
        r.cell = cell;
        const raw = engineGet(S.slot, S.comp, r.pkey || r.key);
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
    S.fileKey = row.pkey || row.key;
    S.fileState = buildFilepathBrowserState({
        name: c.label, key: S.fileKey,
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
    /* A MOVE bus is a track's sound, not the session's — it belongs to whichever
     * track is routed to Move, so the follow-the-active-track logic must treat it
     * exactly like a chain slot. Only the session buses sit this out. */
    return S.view === VIEW_BUSES || !!(S.bus && S.bus.kind === 'global');
}

/* The Move flavour of sound mode: the track's Move instrument bus.
 *
 * Same door as soundEnter (Shift+Note/Session from track view) — the ROUTE picks
 * the flavour, not a different gesture. The volume knob is CLAIMED here exactly
 * as it is for a chain, and points at the bus strip's own Volume — in sound mode
 * plain Volume always means "the level of the thing on this screen".
 *
 * ⚠ Releasing it instead (the first attempt) was wrong twice over: Move took the
 * knob back and covered the screen with its native master overlay, AND sound
 * mode still consumed the CC, writing the turn into chain slot 0's module level
 * — a different track's sound. Found by Josh on hardware, 2026-08-11. */
export function soundEnterMove(track) {
    if (GS.sessionView) return;
    /* Also the RETARGET path (the active track switched to a Move-routed one),
     * so anything queued against the previous track has to land first — while
     * that track is still the volume knob's target. */
    if (S.active) flushForRetarget();
    S.active = true;
    S.enterSession = false;
    S.track = track;
    S.slot = 0;                 /* move_fx: keys ignore the slot argument */
    S.bus = moveBusFor(track);
    S.busIdx = 0;
    S.busLevelEditing = false;
    S.busLevelDirty = false;
    S.view = VIEW_BLOCKS;
    S.pickRow = 0;
    S.comp = '';                /* no chain component is in scope on a Move bus */
    S.shiftHeld = false;
    S.pendingWrites.length = 0;
    S.blockNames = [];
    S.pendingAction = { t: 'names' };
    /* AFTER S.bus is set — claimVolume reads through volTarget(), which is what
     * makes the knob the BUS strip's Volume rather than a chain slot's level. */
    claimVolume(S.slot);
    S.dirty = true;
    log('enter move bus ' + S.bus.bus + ' (track ' + track + ')');
}

/* Sound mode asking to hand over to Move's own editor. Consumed by the tick,
 * which owns the co-run entry — importing ui_corun here would close a cycle
 * (co-run reads sound mode's state on the way back). Same take-semantics as
 * soundConsumeLedDirty. */
export function soundConsumeCoRunRequest() {
    const t = S.coRunRequest;
    S.coRunRequest = -1;
    return t;
}

/* Which view this screen was opened FROM. Sound mode and the bus screen are not
 * two modes of davebox — they are things you call from INSIDE a view, and the
 * view is what owns them (Josh, 2026-07-29). Both doors are the same gesture
 * split on exactly this flag: Shift+Note/Session in session view opens the
 * buses, in track view it opens that track's sound. So leaving the view you
 * called it from ends it, in BOTH directions — one rule, no special cases, and
 * you land back on the view you actually navigated to. */
export function soundEnteredInSession() { return S.enterSession; }

export function soundEnterBuses() {
    /* Hand the volume knob back to Move before the screen opens. releaseVolume
     * also flushes any pending level save for the track we came from. */
    releaseVolume();
    S.active = true;
    S.enterSession = true;      /* called from SESSION view */
    S.bus = null;
    S.track = -1;
    S.slot = 0;
    S.busIdx = 0;
    S.view = VIEW_BUSES;
    S.presetMsg = '';
    S.dirty = true;
    log('buses: open');
}

function enterBus(bus) {
    S.bus = bus;
    S.slot = 0;
    S.blockIdx = 0;
    S.pickRow = 0;
    S.view = VIEW_BLOCKS;
    refreshBlockNames();
    log('bus: ' + bus.id);
}

/* A bus has exactly ONE door now — the session FX list — so leaving always goes
 * back there. It briefly had two, and the leftover "which door?" bookkeeping is
 * what sent Back from a Master FX effect to a TRACK's sound page: entering from
 * the session list recorded slot 0 as "the track I came from", and 0 is a valid
 * slot. A single door needs no bookkeeping. */
function leaveBus() {
    S.busLevelEditing = false;
    if (S.busLevelDirty) { S.busLevelDirty = false; S.pendingAction = { t: 'slotsave' }; }
    /* A MOVE bus was entered from a TRACK, not from the session FX list, so its
     * one level up is out of sound mode entirely — sending it to VIEW_BUSES would
     * drop you into the session's Master/Send list, which you never asked for. */
    if (S.bus && S.bus.kind === 'move') { soundExit(); return; }
    S.bus = null;
    S.view = VIEW_BUSES;
    S.dirty = true;
}

/* The picker's rows, dispatched by `kind` like every other list here.
 *
 * A TRACK context lists its blocks plus the slot's settings. A BUS context
 * lists only its four FX blocks — a bus has no slot to configure, and it is
 * reached from the session view rather than from any track. */
/* COMPONENTS is keyed by plain chain names; a bus component (`master_fx:fx2`)
 * browses the same audio-FX catalogue, so it resolves to the fx spec. */
/* moduleIdOf now lives in ui_discover.mjs — the browser list needs it too. */

function specKeyFor(comp) {
    return COMPONENTS[comp] ? comp : 'fx1';
}

function buildPickRows() {
    const rows = [];
    if (S.bus) {
        /* A Move bus leads with its instrument: the thing you came to edit is
         * Move's own synth, and the inserts hang off it exactly as a slot's FX
         * hang off its sound generator. Jog-click hands over to Move's editor
         * (co-run) — there is no module to browse, Move owns that voice. */
        if (S.bus.kind === 'move') {
            rows.push({ kind: 'movesynth', label: 'SYNTH', value: 'MOVE ' + S.bus.bus });
        }
        for (const n of BUS_BLOCKS) {
            rows.push({ kind: 'block', comp: S.bus.prefix + 'fx' + n, label: 'FX ' + n });
        }
        /* The bus's own levels sit WITH the effects rather than behind a
         * settings screen: for a send the return is the control you reach for
         * most, and a Move bus's three are the only slot-ish settings it has.
         * Master declares none; see the note on FX_BUSES. */
        for (const lv of (S.bus.levels || [])) {
            rows.push({ kind: 'buslevel', label: lv.label, spec: lv });
        }
    } else {
        for (const i of S.blockRows) {
            rows.push({ kind: 'block', comp: BLOCKS[i].comp, label: BLOCKS[i].label, blockIdx: i });
        }
        rows.push({ kind: 'settings', label: '[SLOT SETTINGS]' });
        /* Last row by Josh's ruling; "presets" not "patches" in user-facing
         * text — the store is still the host's patches/ dir. */
        rows.push({ kind: 'patches', label: '[SLOT PRESETS]' });
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

function openSlotCfg(keepCursor) {
    S.slotCfgVals = S.slotRows.map(s => {
        if (s.sub) return 0;            /* no stored param behind these rows */
        const raw = parseFloat(engineGetSlotParam(S.slot, s.key));
        return isFinite(raw) ? raw : 0;
    });
    /* Returning from a sub-editor keeps the cursor on the row that opened it. */
    if (!keepCursor) S.slotCfgIdx = 0;
    S.slotCfgEditing = false;
    S.slotCfgDirty = false;
    S.view = VIEW_SLOTCFG;
    S.dirty = true;
}

function slotCfgStep(delta) {
    const s = S.slotRows[S.slotCfgIdx];
    if (!S.slotCfgEditing || !s || s.sub) {
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
    queueSlotCfgWrite(s.key, v);
}

/* Queued like every other write here: this runs in the MIDI handler.
 * Slot captured at QUEUE time, same reason queueWrite does it: sound mode
 * can retarget to another track before the drain, and a send raised against
 * one slot must not land in the one that replaced it. */
/* Chain-level twin of queueSlotCfgWrite: same queue, bare-key namespace. */
function queueChainWrite(key, val) {
    for (const w of S.pendingSlotWrites) {
        if (w.chain && w.key === key && w.slot === S.slot) { w.val = val; return; }
    }
    S.pendingSlotWrites.push({ slot: S.slot, key: key, val: val, chain: true });
}

/* No `comp` argument: the only writer that addressed a component namespace
 * from this queue was the MPE row's `synth:mpe_enabled`, which went with it. */
function queueSlotCfgWrite(key, val) {
    for (const w of S.pendingSlotWrites) {
        if (w.key === key && w.slot === S.slot && !w.chain) { w.val = val; return; }
    }
    S.pendingSlotWrites.push({ slot: S.slot, key: key, val: val });
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
        /* Chain-level keys (knob_N_*, lfoN:*) go through BARE — they are not
         * in the slot: namespace (see engineSetChainParam). */
        if (w.chain) { engineSetChainParam(w.slot, w.key, String(w.val)); continue; }
        const s = SLOT_SETTINGS.find(x => x.key === w.key);
        engineSetSlotParam(w.slot, w.key, s && s.int ? String(w.val) : w.val.toFixed(3));
    }
}

function renderSlotCfg() {
    clear_screen();
    drawKitHeader('SLOT ' + (S.slot + 1) + ' SETTINGS', false);
    drawKitList(S.slotRows.map((s, idx) => (s.sub
        ? { label: s.label, chevron: true }
        : { label: s.label, value: s.fmt(S.slotCfgVals[idx]),
            editing: idx === S.slotCfgIdx && S.slotCfgEditing })),
        S.slotCfgIdx, {});
}

/* ---- knob editor (P7 absorb) --------------------------------------------
 * Same param model as the host's editor: read knob_{N}_target/_param, write
 * knob_{N}_set ("target:param") / knob_{N}_clear. All engine reads run from
 * tick via pendingAction; edits go through the slot-write queue. */

function openKnobEditor() {
    S.knobAsn = [];
    for (let i = 0; i < NUM_KNOBS; i++) {
        S.knobAsn.push({
            target: engineGetChainParam(S.slot, 'knob_' + (i + 1) + '_target') || '',
            param:  engineGetChainParam(S.slot, 'knob_' + (i + 1) + '_param') || '',
        });
    }
    S.knobIdx = 0;
    S.view = VIEW_KNOBS;
}

/* Components with a module loaded — the assignable targets. Ported from the
 * host's getKnobTargets, but probed the davebox way: engineLoadedModule
 * (the P6 symmetric `<comp>:module` readback), NOT the host-side
 * `<comp>_module` slot-param shape, which this engine seam doesn't serve. */
function knobTargetList() {
    const targets = [{ id: '', name: '(None)' }];
    const probe = (id, label) => {
        const mod = engineLoadedModule(S.slot, id);
        if (!mod) return;
        const name = engineGet(S.slot, id, 'name') || mod;
        targets.push({ id, name: label + ': ' + name });
    };
    probe('midi_fx1', 'MIDI FX');
    probe('synth', 'Synth');
    for (let i = 1; i <= 4; i++) probe('fx' + i, 'FX' + i);
    return targets;
}

function openKnobTargets() {
    S.knobTargets = knobTargetList();
    /* Seed the cursor on the current assignment's target. */
    const cur = S.knobAsn[S.knobIdx];
    const at = cur ? S.knobTargets.findIndex(t => t.id === cur.target) : -1;
    S.knobTargetIdx = at >= 0 ? at : 0;
    S.view = VIEW_KNOB_TARGET;
}

/* Knob-mappable params for a target — the host's getKnobParamsForTarget:
 * every knobs[]/params[] entry across the ui_hierarchy levels, then
 * chain_params, then the legacy hardcoded fallback. */
function knobParamList(target) {
    const params = [];
    const push = (key, label) => {
        if (key && !params.find(p => p.key === key)) params.push({ key, label: label || key });
    };
    const hier = engineGet(S.slot, target, 'ui_hierarchy');
    if (hier) {
        try {
            const h = JSON.parse(hier);
            if (h && h.levels) {
                for (const ln in h.levels) {
                    const level = h.levels[ln];
                    for (const k of (Array.isArray(level.knobs) ? level.knobs : [])) {
                        if (typeof k === 'string') push(k, k);
                        else if (k && k.key) push(k.key, k.label);
                    }
                    for (const p of (Array.isArray(level.params) ? level.params : [])) {
                        if (typeof p === 'string') push(p, p);
                        else if (p && p.key) push(p.key, p.label);
                    }
                }
            }
        } catch (e) { /* fall through to chain_params */ }
    }
    if (!params.length) {
        const cp = engineGet(S.slot, target, 'chain_params');
        if (cp) {
            try {
                for (const p of (JSON.parse(cp) || [])) {
                    if (p && p.key) push(p.key, p.name || p.label);
                }
            } catch (e) { /* fall through */ }
        }
    }
    if (!params.length) {
        if (target === 'synth') { push('preset', 'Preset'); push('volume', 'Volume'); }
        else { push('wet', 'Wet'); push('dry', 'Dry'); push('room_size', 'Room Size'); push('damping', 'Damping'); }
    }
    return params;
}

function openKnobParams(target) {
    S.knobTarget = target;
    S.knobParams = knobParamList(target);
    const cur = S.knobAsn[S.knobIdx];
    const at = (cur && cur.target === target)
        ? S.knobParams.findIndex(p => p.key === cur.param) : -1;
    S.knobParamIdx = at >= 0 ? at : 0;
    S.view = VIEW_KNOB_PARAM;
}

function knobAsnLabel(a) {
    return (a && a.target && a.param) ? a.target + ': ' + a.param : '(None)';
}

function commitKnobAssignment(target, param) {
    const n = S.knobIdx + 1;
    S.knobAsn[S.knobIdx] = { target: target || '', param: param || '' };
    if (target && param) queueChainWrite('knob_' + n + '_set', target + ':' + param);
    else queueChainWrite('knob_' + n + '_clear', '1');
    S.view = VIEW_KNOBS;
}

function renderKnobs() {
    clear_screen();
    drawKitHeader('SLOT ' + (S.slot + 1) + ' KNOBS', false);
    drawKitList(S.knobAsn.map((a, i) =>
        ({ label: 'Knob ' + (i + 1), value: knobAsnLabel(a) })),
        S.knobIdx, {});
}

function renderKnobTarget() {
    clear_screen();
    drawKitHeader('KNOB ' + (S.knobIdx + 1) + ' TARGET', false);
    drawKitList(S.knobTargets.map(t => t.name), S.knobTargetIdx, {});
}

function renderKnobParam() {
    clear_screen();
    drawKitHeader('KNOB ' + (S.knobIdx + 1) + ' PARAM', false);
    drawKitList(S.knobParams.map(p => p.label), S.knobParamIdx,
        { emptyMsg: 'NO PARAMS' });
}

/* ---- LFO editor (P7 absorb) ---------------------------------------------
 * lfoN:* slot params, the host editor's exact item list and display rules.
 * Values cached in S.lfoVals at open (11 reads, one-time) and updated
 * optimistically on edit; writes ride the slot-write queue. The one new
 * visual: a live waveform strip (shapeSample) under the list. */

const LFO_KEYS = ['enabled', 'shape', 'polarity', 'sync', 'rate_div', 'rate_hz',
    'depth', 'phase_offset', 'retrigger', 'target', 'target_param'];

function lfoKey(key) { return 'lfo' + (S.lfoNum + 1) + ':' + key; }

function openLfoEditor(lfoNum) {
    S.lfoNum = lfoNum;
    S.lfoVals = {};
    for (const k of LFO_KEYS) S.lfoVals[k] = engineGetChainParam(S.slot, lfoKey(k)) || '';
    S.lfoIdx = 0;
    S.lfoEditing = false;
    S.view = VIEW_LFO;
}

function lfoItems() {
    const sync = S.lfoVals.sync === '1';
    const items = [
        { key: 'target', label: 'Target', type: 'action' },
        { key: 'enabled', label: 'Enabled', type: 'enum', options: ['Off', 'On'] },
        { key: 'shape', label: 'Shape', type: 'enum', options: LFO_SHAPES },
        { key: 'polarity', label: 'Mode', type: 'enum', options: ['Unipolar', 'Bipolar'] },
        { key: 'sync', label: 'Sync', type: 'enum', options: ['Free', 'Sync'] },
    ];
    if (sync) items.push({ key: 'rate_div', label: 'Rate', type: 'enum', options: LFO_DIVISIONS });
    else items.push({ key: 'rate_hz', label: 'Rate', type: 'float', min: 0.1, max: 20.0, step: 0.1 });
    items.push({ key: 'depth', label: 'Depth', type: 'float', min: -1, max: 1, step: 0.01 });
    items.push({ key: 'phase_offset', label: 'Phase', type: 'float', min: 0, max: 1, step: 0.0417 });
    items.push({ key: 'retrigger', label: 'Retrigger', type: 'enum', options: ['Off', 'On'] });
    return items;
}

function lfoDisplayValue(item) {
    const raw = S.lfoVals[item.key];
    if (raw === null || raw === undefined || raw === '') {
        if (item.key === 'target') return 'None';
        return '';
    }
    switch (item.key) {
        case 'enabled':   return raw === '1' ? 'On' : 'Off';
        case 'shape': {
            const i = parseInt(raw);
            return (i >= 0 && i < LFO_SHAPES.length) ? LFO_SHAPES[i] : raw;
        }
        case 'polarity':  return raw === '1' ? 'Bipolar' : 'Unipolar';
        case 'sync':      return raw === '1' ? 'Sync' : 'Free';
        case 'rate_div': {
            const i = parseInt(raw);
            return (i >= 0 && i < LFO_DIVISIONS.length) ? LFO_DIVISIONS[i] : raw;
        }
        case 'rate_hz':   return parseFloat(raw).toFixed(1) + ' Hz';
        case 'depth':     return Math.round(parseFloat(raw) * 100) + '%';
        case 'phase_offset': return Math.round(parseFloat(raw) * 360) + 'deg';
        case 'retrigger': return raw === '1' ? 'On' : 'Off';
        case 'target': {
            const t = S.lfoVals.target, p = S.lfoVals.target_param;
            return (t && p) ? t + ':' + p : 'None';
        }
        default: return raw;
    }
}

function lfoAdjust(item, delta) {
    if (item.type === 'enum') {
        let v = parseInt(S.lfoVals[item.key] || '0') + delta;
        if (v < 0) v = 0;
        if (v >= item.options.length) v = item.options.length - 1;
        if (String(v) === S.lfoVals[item.key]) return;
        S.lfoVals[item.key] = String(v);
        queueChainWrite(lfoKey(item.key), String(v));
    } else if (item.type === 'float') {
        let v = parseFloat(S.lfoVals[item.key] || '0') + item.step * delta;
        if (v < item.min) v = item.min;
        if (v > item.max) v = item.max;
        const s = v.toFixed(4);
        if (s === S.lfoVals[item.key]) return;
        S.lfoVals[item.key] = s;
        queueChainWrite(lfoKey(item.key), s);
    }
}

/* Target picker: components (ported from the host's makeSlotLfoCtx). Probed
 * the davebox way — engineLoadedModule, not the host's *_module key shape. */
function lfoCompList() {
    const comps = [];
    const probe = (key, label) => {
        const m = engineLoadedModule(S.slot, key);
        if (m) comps.push({ key, label: label + ': ' + (engineGet(S.slot, key, 'name') || m) });
    };
    probe('synth', 'Synth');
    for (let i = 1; i <= 4; i++) probe('fx' + i, 'FX ' + i);
    for (let i = 1; i <= 2; i++) probe('midi_fx' + i, 'MIDI FX ' + i);
    comps.push({ key: 'lfo' + (S.lfoNum === 0 ? 2 : 1), label: 'LFO ' + (S.lfoNum === 0 ? 2 : 1) });
    comps.push({ key: '__clear__', label: '[Clear Target]' });
    return comps;
}

function openLfoTargets() {
    S.lfoComps = lfoCompList();
    S.lfoCompIdx = 0;
    S.view = VIEW_LFO_TARGET;
}

function lfoParamList(compKey) {
    if (compKey === 'lfo1' || compKey === 'lfo2') return LFO_TARGET_PARAMS.slice();
    const out = [];
    const cp = engineGet(S.slot, compKey, 'chain_params');
    if (cp) {
        try {
            for (const p of (JSON.parse(cp) || [])) {
                if (p && p.key && (p.type === 'float' || p.type === 'int' || p.type === 'enum')) {
                    out.push({ key: p.key, label: p.name || p.label || p.key });
                }
            }
        } catch (e) { /* empty list renders NO PARAMS */ }
    }
    return out;
}

function openLfoParams(compKey) {
    S.lfoParams = lfoParamList(compKey);
    S.lfoParamIdx = 0;
    S.view = VIEW_LFO_PARAM;
}

function commitLfoTarget(compKey, paramKey) {
    S.lfoVals.target = compKey || '';
    S.lfoVals.target_param = paramKey || '';
    queueChainWrite(lfoKey('target'), S.lfoVals.target);
    queueChainWrite(lfoKey('target_param'), S.lfoVals.target_param);
    S.view = VIEW_LFO;
}

function renderLfo() {
    clear_screen();
    const t = S.lfoVals.target, p = S.lfoVals.target_param;
    const on = S.lfoVals.enabled === '1';
    let title = 'LFO ' + (S.lfoNum + 1);
    if (on && t && p) title += ': ' + t + ':' + p;
    else if (!on) title += ': OFF';
    drawKitHeader(title, false);
    drawKitList(lfoItems().map((item, idx) =>
        ({ label: item.label, value: lfoDisplayValue(item),
           editing: idx === S.lfoIdx && S.lfoEditing })),
        S.lfoIdx, { rowH: 9, visible: 4 });
    /* Live waveform strip under the list — the shape as the DSP will run it:
     * two cycles, phase offset applied, dotted baseline (center when bipolar,
     * floor when unipolar), bold dot at the start when retrigger is on. */
    const shape = LFO_SHAPE_IDS[parseInt(S.lfoVals.shape) | 0] || 'sine';
    const bipolar = S.lfoVals.polarity === '1';
    const phase = parseFloat(S.lfoVals.phase_offset) || 0;
    const topY = 49, botY = 62, x0 = 1, spanW = 125;
    const baseY = bipolar ? Math.round((topY + botY) / 2) : botY;
    const amp = bipolar ? (botY - topY) / 2 : (botY - topY);
    for (let x = x0; x <= x0 + spanW; x += 2) set_pixel(x, baseY, 1);
    const yAt = (i) => {
        const v = shapeSample(shape, (i / spanW) * 2 + phase);
        return bipolar ? Math.round(baseY - v * amp)
                       : Math.round(botY - ((v + 1) / 2) * amp);
    };
    let px = x0, py = yAt(0);
    for (let i = 1; i <= spanW; i++) {
        const y = yAt(i);
        plotLine(px, py, x0 + i, y, 1);
        px = x0 + i; py = y;
    }
    if (S.lfoVals.retrigger === '1') {
        fill_rect(x0, Math.max(topY, Math.min(botY - 2, yAt(0) - 1)), 3, 3, 1);
    }
}

function renderLfoTarget() {
    clear_screen();
    drawKitHeader('LFO ' + (S.lfoNum + 1) + ' TARGET', false);
    drawKitList(S.lfoComps.map(c => c.label), S.lfoCompIdx, {});
}

function renderLfoParam() {
    clear_screen();
    const comp = S.lfoComps[S.lfoCompIdx];
    drawKitHeader('LFO ' + (S.lfoNum + 1) + ' > ' + String(comp ? comp.key : '').toUpperCase(), false);
    drawKitList(S.lfoParams.map(p => p.label), S.lfoParamIdx,
        { emptyMsg: 'NO PARAMS' });
}

function menuEnter() {
    if (S.confirmItem) {
        const row = S.confirmItem;
        S.confirmItem = null;
        if (S.confirmIdx === 1) commitItem(row);
        S.dirty = true;
        return;
    }
    const row = S.menuRowsCache[S.menuIdx];
    if (!row) return;
    /* Choosing a repeated element stays on the SAME level and only qualifies
     * its keys, so it pushes the breadcrumb like any other descent — Back then
     * pops back to the selector with no special case, because every stack entry
     * carries the child index it was pushed with. */
    /* Picking a mode is BOTH navigation and an engine write — minijv's `mode`
     * switches the JV-880 between single-patch and 8-part multitimbral, so
     * walking into the performance tree without setting it would show you
     * controls the engine isn't running. The index is the DECLARED position,
     * which is what the module's param takes. */
    if (row.kind === 'mode') {
        if (S.modeParam) queueWrite(S.modeParam, String(row.index));
        S.menuStack.push({ levelKey: S.menuKey, cursor: S.menuIdx, child: S.menuChild });
        S.menuKey = row.level;
        S.menuChild = -1;
        S.menuIdx = 0;
        S.menuEditing = false;
        S.pendingAction = { t: 'menuload' };
        return;
    }
    if (row.kind === 'child') {
        S.menuStack.push({ levelKey: S.menuKey, cursor: S.menuIdx, child: S.menuChild });
        S.menuChild = row.childIndex;
        S.menuIdx = 0;
        S.menuEditing = false;
        S.pendingAction = { t: 'menuload' };
        return;
    }
    if (row.kind === 'level') {
        S.menuStack.push({ levelKey: S.menuKey, cursor: S.menuIdx, child: S.menuChild });
        S.menuKey = row.level;
        S.menuChild = -1;
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
        /* A committing list asks first. One click is not enough to overwrite
         * something you cannot get back. */
        if (row.commits) { S.confirmItem = row; S.confirmIdx = 0; S.dirty = true; return; }
        commitItem(row);
        return;
    }
    menuEnterRow(row);
}

function commitItem(row) {
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
                /* Unwinding lands on the level as it was ENTERED, so restore
                 * the element that was chosen there rather than resetting. */
                S.menuChild = (entry.child != null) ? entry.child : -1;
            } else {
                S.menuStack.push({ levelKey: S.menuKey, cursor: S.menuIdx, child: S.menuChild });
                S.menuIdx = 0;
                S.menuChild = -1;
            }
            S.menuKey = target;
        }
    S.menuEditing = false;
    S.pendingAction = { t: 'menuload' };
}

function menuEnterRow(row) {
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
            queueWrite(row.pkey || row.key, String(txt));
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
        const row = S.menuRowsCache.find(r => (r.pkey || r.key) === S.fileKey);
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
    S.menuChild = (prev.child != null) ? prev.child : -1;
    S.pendingAction = { t: 'menuload' };   /* engine reads belong in tick */
    return true;
}

function menuStep(delta) {
    if (S.confirmItem) { S.confirmIdx = S.confirmIdx ? 0 : 1; return; }
    const row = S.menuRowsCache[S.menuIdx];
    if (!S.menuEditing || !row || row.kind !== 'param' || !row.cell) {
        S.menuIdx = listMove(S.menuRowsCache.length, S.menuIdx, delta);
        S.menuEditing = false;
        return;
    }
    const next = stepValue(row.cell, row.val, delta > 0 ? 1 : -1);
    if (next === row.val) return;
    row.val = next;                       /* optimistic, drawn now */
    queueWrite(row.pkey || row.key, commitString(row.cell, next));
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
    host_ensure_dir(BAKED_CACHE_DIR);
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
/* `picker` forces the block LIST instead of reopening the block you were on.
 *
 * Set unless you were genuinely INSIDE a block's editor on a chain slot — see
 * `keepPlace` in soundRetarget for why that is the only case where reopening
 * one is what you asked for. */
function retargetOpen(picker) {
    refreshBlockNames();
    if (!picker && engineLoadedModule(S.slot, S.comp)) {
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
    else if (a.t === 'retarget') retargetOpen(a.picker);
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
    else if (a.t === 'slotcfg')  openSlotCfg(a.keep);
    else if (a.t === 'knobs')    openKnobEditor();
    else if (a.t === 'knobtarget') openKnobTargets();
    else if (a.t === 'knobparam')  openKnobParams(a.target);
    else if (a.t === 'lfo')      openLfoEditor(a.lfo | 0);
    else if (a.t === 'lfotarget') openLfoTargets();
    else if (a.t === 'lfoparam')  openLfoParams(a.comp);
    else if (a.t === 'slotsave') engineSaveState();
    else if (a.t === 'patchlist')   openChainPatches();
    else if (a.t === 'patchload')   doChainPatchLoad(a.index);
    else if (a.t === 'patchsave')   startPatchSave();
    else if (a.t === 'patchsaveas') startPatchSaveAs(S.patchCur || 'Chain');
    else if (a.t === 'patchsavedo') doChainPatchSave(a.name, a.overwrite);
    else if (a.t === 'patchdel')    doChainPatchDelete(a.index);
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
    S.hosted = res.hostedOverlay || null;
    hostedReset();
    S.presetSpec = res.presetSpec || null;
    S.levels = res.levels || null;
    S.rootKey = res.rootKey || null;
    S.modes = res.modes || null;
    S.modeParam = res.modeParam || '';
    S.cpMap = res.cpMap || null;
    S.livePress = livePressSpec(res.levels);
    if (S.livePress && S.livePress.noteParam) S.lastNoteParam = S.livePress.noteParam;
    S.padVouch = false;
    S.padWatchLeft = 0;
    S.padVouchTries = 0;
    S.pollCursor = -1;
    /* Seed the baseline here, where a get_param is legal — the first press
     * raises its vouch from the MIDI handler, where one is not. */
    S.padLastSeen = -1;
    if (S.livePress) readLiveSelection();
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
    /* [ none ] first, and the cursor never resting on it, are one decision —
     * see buildBrowseList, which owns both and is pinned by tests. */
    const picked = buildBrowseList(found, engineLoadedModule(S.slot, S.comp));
    S.browseList = picked.list;
    S.browseIdx = picked.idx;
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
    S.livePress = null;                /* the outgoing module's, not the incoming one's */
    S.padVouch = false;
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
        /* Never clobber a value whose write hasn't landed yet. The engine is
         * STALE for that key until the queue drains, so reading it back snaps
         * the knob to the old value — which is what "the knob resets after I
         * turn it" looks like.
         *
         * Keyed on the pending WRITE, not on which knob is held: writes drain
         * 2/tick, so turning a second knob leaves the first one's write queued
         * and unprotected the moment your finger moves on. Touch is still
         * honoured for the knob in hand, since its write may not be queued yet
         * when the poll runs. */
        if (!force && S.pendingWrites.some(w => w.key === cell.key &&
                                                w.comp === S.comp && w.slot === S.slot)) continue;
        if (!force && S.touchedIdx >= 0 && bank.cells[S.touchedIdx] &&
            bank.cells[S.touchedIdx].key === cell.key) continue;
        const raw = engineGet(S.slot, S.comp, cell.key);
        inferGuessedMeta(cell, raw);       /* a guessed range learns from the value */
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

/* ---- live pad focus ----
 *
 * A drum module wants the pad you HIT to become the pad you EDIT, without a
 * running pattern dragging the editor around. It cannot do that alone: the one
 * signal separating a finger from the sequencer is the host forwarding raw
 * hardware pad notes to an open CANVAS (MODULES.md, "Pad presses in a canvas
 * UI"), and in sound mode the module's canvas is not the thing on screen — we
 * harvested its bank structure and put its globals back. davebox holds the
 * pads, so davebox is the only party that still knows.
 *
 * We contribute exactly one bit: "a finger did that." Deliberately NOT which
 * pad — the note says which, and only the module owns the note->pad map. A
 * grid position is not a pad (davebox transposes the same grid note up 16 to
 * reach pads 17-32), so any attempt to derive one here is wrong twice over.
 *
 * Called from the LIVE pad press sites in ui_input_pads.mjs and nowhere else.
 * That is the whole guarantee: sequencer playback never passes through them, so
 * a playing pattern cannot move focus. External MIDI is excluded too — it
 * reaches liveSendNote by a different path, and an incoming drum loop should no
 * more steal focus than a sequenced one. */
export function soundVouchLivePress(track, note) {
    /* `livePress` comes from the hierarchy of the block CURRENTLY open, so it
     * is null unless the module being looked at is one that asked for this.
     * That self-gates the whole feature — no module-id test needed. */
    if (!S.active || !S.livePress || S.bus) return;
    if (track !== S.track) return;         /* editing some other track's chain */

    S.padWatchFrom = S.padLastSeen;        /* NOT a get_param: null from here */
    S.padWatchLeft = PAD_WATCH_TICKS;
    S.padVouchTries = 0;

    /* ⭑ Tell a hosted canvas a pad was TAPPED.
     *
     * Its copy/paste gesture triggers on the tap, not on focus moving — so that
     * the source can be the pad already on screen, whose tap moves nothing. We
     * own the pad notes here and deliberately never forward them (replaying one
     * would make the kit vouch a SECOND time on top of the note we just wrote,
     * re-arming a press it had already resolved), so the tap has to be said out
     * loud instead. Ignored by the canvas unless a modifier is held, so this is
     * safe to call on every live press. */
    if (S.hosted && typeof S.hosted.padTap === 'function') {
        try { S.hosted.padTap(hostedCtx()); S.dirty = true; }
        catch (e) { /* a bad hook must not cost the user their pad press */ }
    }

    /* ⭑ NAME the pad when the module lets us. We EMIT this note, so unlike the
     * module's own canvas we know exactly which element it is — and saying so
     * is deterministic where vouching is a race. MEASURED (2026-07-30): the
     * vouch路 missed 2 of 16 presses, a hit->change latency of 55ms against a
     * 58ms correlation window. Naming the note has no window to miss.
     * The module maps note -> element; we never send an index. */
    if (S.livePress.noteParam && note >= 0) {
        engineSet(S.slot, S.comp, S.livePress.noteParam, String(note));
        return;
    }

    /* ⚠⚠ Fallback: the VOUCH, sent synchronously, breaking this file's "every
     * write is queued and drained in tick()" rule. That rule keeps STREAMS of
     * knob writes off the MIDI handler; this is one bounded write per press,
     * and deferring it is not merely slower but WRONG — queued for the tick it
     * landed at 27/32/41ms (matched) and 59ms (MISSED) against a 58ms window.
     * NOT the coalescing footgun in CLAUDE.md: that is host_module_set_param
     * sharing a channel with shadow_send_midi_to_dsp; this is shadow_set_param,
     * the chain-param SHM mailbox. The tick retry covers a dropped write. */
    if (!S.livePress.pressParam) return;
    S.padVouch = !engineSet(S.slot, S.comp, S.livePress.pressParam, '1');
}

/* Drain a spread bank re-read. `pollCursor` < 0 means idle. Deliberately does
 * NOT skip cells with pending writes the way pollValues does: this runs because
 * every alias cell now addresses a DIFFERENT element, so the local value is not
 * "optimistic and ahead of the engine", it belongs to another pad entirely. */
function drainForcedPoll() {
    if (S.pollCursor < 0) return;
    const bank = S.banks[S.bankIdx];
    if (!bank) { S.pollCursor = -1; return; }
    let done = 0;
    while (S.pollCursor < bank.cells.length && done < POLL_PER_TICK) {
        const cell = bank.cells[S.pollCursor++];
        if (!cell || !cell.key) continue;
        const raw = engineGet(S.slot, S.comp, cell.key);
        inferGuessedMeta(cell, raw);       /* a guessed range learns from the value */
        S.rawValues[cell.key] = raw;
        S.values[cell.key] = parseValue(cell, raw);
        done++;
    }
    if (S.pollCursor >= bank.cells.length) S.pollCursor = -1;
    if (done) S.dirty = true;
}

/* Where the module currently has its focus, or -1 if it won't say. ONE
 * get_param — cheap enough to poll with, unlike a whole bank re-read. */
function readLiveSelection() {
    const spec = S.livePress;
    if (!spec || !spec.selectParam) return -1;
    const idx = parseInt(engineGet(S.slot, S.comp, spec.selectParam), 10);
    const ok = (idx >= 0 && idx < spec.count) ? idx : -1;
    /* Remembered because the vouch is raised from the MIDI handler, where a
     * get_param silently returns null — so the baseline for "did focus move?"
     * has to be something we already know rather than a fresh read. */
    if (ok >= 0) S.padLastSeen = ok;
    return ok;
}

/* Follow the module to `idx`.
 *
 * The EDIT pages usually need nothing structural — a drum module binds its
 * cells to an ALIAS key the DSP redirects at the focused element (DR32's
 * "pad_") so the page re-points itself — but their VALUES now describe a
 * different pad, so the bank must be re-read. The MENU is the case that
 * genuinely needs the index: it walks the hierarchy with real `<prefix><n>_`
 * keys and has no alias to ride on, so without this the two screens disagree
 * about which pad is current. */
function followLiveSelection(idx) {
    const spec = S.livePress;
    if (!spec) return;
    S.pollCursor = 0;                       /* alias cells now mean another pad */
    hostedFocusMoved(spec);
    if (idx >= 0 && S.menuChild !== idx && S.menuKey === spec.levelKey) {
        S.menuChild = idx;
        refreshMenuRows();
    }
    S.dirty = true;
}

/* A hosted canvas caches its own param reads, so when focus moves it must be
 * told — otherwise every `<prefix>_*` cell keeps drawing the PREVIOUS element's
 * values until the kit's periodic full flush comes round, which reads on device
 * as "the screen takes ages to catch up after tapping a pad". (It did. That was
 * this function not existing.)
 *
 * ⭑ We invalidate rather than REPLAY the pad note into the overlay, and the
 * difference matters. Forwarding the note would make the kit write the vouch /
 * note key a SECOND time, on top of davebox's own authoritative write — and a
 * vouch arriving after the note already resolved focus re-arms the module for a
 * press that is over, which a later SEQUENCED note can then claim and yank
 * focus with. davebox emits the note, so it owns that signal; the kit only
 * needs to know its cache is stale.
 *
 * Scoped to the prefix on purpose: `master`, `send*_` and `kit` are still
 * perfectly good, and each needless re-read is a ~2.6 ms blocking round-trip.
 *
 * ⚠⚠ THE SELECT PARAM IS NOT IN THE PREFIX FAMILY — it is the key that DECIDES
 * the family, and it is named on its own terms (`ui_current_pad`, not
 * `pad_something`). Invalidating only `<prefix>_*` therefore refreshes every
 * cell and the sample name while the canvas keeps drawing the OLD INDEX from
 * cache: "settings and pad name update immediately, but the pad number lags"
 * (Josh, on device). The kit's own padFocusSettle force-drops this key before
 * re-reading it; doing the job from outside means doing that part too. */
function hostedFocusMoved(spec) {
    if (!S.hosted || !S.hostedCtx) return;
    const inv = S.hostedCtx.invalidate;     /* installed by the kit on first draw */
    if (typeof inv !== 'function') return;
    try {
        if (!spec || !spec.prefix) { inv(true); return; }  /* correct, just costlier */
        const drop = [spec.prefix + '_*'];
        if (spec.selectParam) drop.push(spec.selectParam);
        inv(drop);
    } catch (e) { /* a hosted cache that won't flush is not worth a crash */ }
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
/* Offer an event to a hosted module's own canvas FIRST, and let it DECLINE.
 *
 * The kit consumes only what means something to it (an open picker, a
 * drill-down) and declines at rest — the same consume-only-when-meaningful rule
 * as the host's contextual Back. So davebox keeps every shell gesture it had:
 * jog click still opens presets / the module menu, because the kit hands the
 * click back when it has no use for it.
 *
 * ⚠ Getting this backwards is the failure Josh flagged: `canvas_takes_click` in
 * the HOST is unconditional, so a module declaring it would eat every click and
 * the shell menu would never open. Here the RETURN VALUE decides, not the
 * declaration.
 * ⚠ A module's own CONFIG.onMidi can still swallow the click before the kit
 * sees it. That is the module author's call to get right, and another reason
 * hosting is opt-in.
 *
 * Shift (49) and Mute (88) are deliberately NOT offered: davebox tracks them
 * for its own gestures and they must keep flowing regardless. */
/* Hand a knob-touch NOTE to a hosted canvas. Deliberately fire-and-forget: the
 * return value is ignored, because davebox still wants its own touch state and
 * a hosted canvas cannot meaningfully decline a touch. */
function hostedNote(status, d1, d2) {
    if (!S.hosted || S.view !== VIEW_EDIT) return;
    if (typeof S.hosted.onMidi !== 'function') return;
    try {
        S.hosted.onMidi(hostedCtx(), { data: [status, d1, d2] });
        S.dirty = true;
    } catch (e) {
        S.hosted = null;                 /* same one-strike rule as renderHosted */
        try { console.log('davebox: hosted canvas onMidi failed, adopting instead: ' + e); }
        catch (e2) { /* best-effort */ }
    }
}

function hostedTakes(d1, d2) {
    if (!S.hosted || S.view !== VIEW_EDIT) return false;
    if (d1 === 49 || d1 === 88) return false;
    if (typeof S.hosted.onMidi !== 'function') return false;
    try {
        return S.hosted.onMidi(hostedCtx(), { data: [0xB0, d1, d2] }) === true;
    } catch (e) {
        S.hosted = null;                 /* same one-strike rule as renderHosted */
        try { console.log('davebox: hosted canvas onMidi failed, adopting instead: ' + e); }
        catch (e2) { /* best-effort */ }
        return false;
    }
}

export function soundOnCC(d1, d2, decodeDelta) {
    if (!S.active) return false;

    if (hostedTakes(d1, d2)) { S.dirty = true; return true; }

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

    if (d1 === 79) {                                   /* master knob */
        /* SESSION-wide context ONLY: the knob stays Move's NATIVE master volume.
         * Nothing there owns a level worth stealing it for — the device already
         * has a master output — and the claim is the only reason Move stops
         * seeing CC 79 at all, so declining to consume it is the whole fix.
         * (soundEnterBuses drops the claim; see releaseVolume there.)
         *
         * ⚠ A MOVE bus is deliberately NOT in this branch: it owns a level (its
         * strip Volume) and claims the knob like a chain does. The test is
         * soundIsGlobal(), which excludes Move buses — consuming the CC while
         * the claim was down is exactly how the turn reached both Move's master
         * and chain slot 0. */
        if (soundIsGlobal()) return false;
        const delta = decodeDelta(d2);
        if (delta) onVolumeTurn(delta);
        return true;
    }

    if (d1 >= 71 && d1 <= 78) {                        /* knobs 1-8 */
        if (S.view === VIEW_EDIT) {
            const delta = decodeDelta(d2);
            if (delta) onKnobTurn(d1 - 71, delta);
            return true;
        }
        /* Outside the module editor, the physical knobs drive the slot's
         * knob-mapping ASSIGNMENTS (Knobs... in slot settings): forward the
         * turn as the relative CC the chain DSP consumes (chain_midi.c).
         * One message per event, value 1/127 only — the DSP applies its own
         * time-based acceleration, so the hardware delta magnitude is
         * deliberately dropped rather than double-accelerating. Slot-addressed
         * (no channel gate); bus contexts have no slot to address. */
        if (!S.bus && S.slot >= 0) {
            const delta = decodeDelta(d2);
            if (delta) shadow_send_midi_to_dsp(slotIndex(S.slot), [0xB0, d1, delta > 0 ? 1 : 127]);
        }
        return true;
    }

    if (d1 === 14) {                                   /* jog turn */
        const delta = decodeDelta(d2);
        if (!delta) return true;
        if (S.view === VIEW_BUSES) {
            S.busIdx = listMove(FX_BUSES.length, S.busIdx, delta);
        } else if (S.view === VIEW_BLOCKS && S.busLevelEditing) {
            const r = S.pickRows[S.pickRow];
            if (r && r.kind === 'buslevel') {
                const sp = r.spec;
                let v = r.val + (delta > 0 ? sp.step : -sp.step);
                v = Math.round(v * 1000) / 1000;
                if (v < sp.min) v = sp.min;
                if (v > sp.max) v = sp.max;
                if (v !== r.val) {
                    r.val = v;
                    S.busLevelDirty = true;
                    /* Queued like every write here — this is the MIDI handler. */
                    queueWrite(sp.key, v.toFixed(3), sp.comp);
                }
            }
        } else if (S.view === VIEW_BLOCKS) {
            S.pickRow = listMove(S.pickRows.length, S.pickRow, delta);
        } else if (S.view === VIEW_SLOTCFG) {
            slotCfgStep(delta);
        } else if (S.view === VIEW_KNOBS) {
            S.knobIdx = listMove(NUM_KNOBS, S.knobIdx, delta);
        } else if (S.view === VIEW_KNOB_TARGET) {
            S.knobTargetIdx = listMove(S.knobTargets.length, S.knobTargetIdx, delta);
        } else if (S.view === VIEW_KNOB_PARAM) {
            S.knobParamIdx = listMove(S.knobParams.length, S.knobParamIdx, delta);
        } else if (S.view === VIEW_LFO) {
            const items = lfoItems();
            if (S.lfoEditing) lfoAdjust(items[S.lfoIdx], delta);
            else S.lfoIdx = listMove(items.length, S.lfoIdx, delta);
        } else if (S.view === VIEW_LFO_TARGET) {
            S.lfoCompIdx = listMove(S.lfoComps.length, S.lfoCompIdx, delta);
        } else if (S.view === VIEW_LFO_PARAM) {
            S.lfoParamIdx = listMove(S.lfoParams.length, S.lfoParamIdx, delta);
        } else if (S.view === VIEW_PATCHES) {
            if (S.patchConfirm) {
                S.patchConfirmIdx = listMove(2, S.patchConfirmIdx, delta);
            } else {
                S.patchIdx = listMove(S.patchNames.length + 2, S.patchIdx, delta);
                S.patchMsg = '';
            }
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
            const row = S.slotRows[S.slotCfgIdx];
            if (row && row.sub) {
                /* Native sub-editor. Opening reads params — tick only. */
                S.pendingAction = { t: row.sub, lfo: row.lfo | 0 };
            } else {
                S.slotCfgEditing = !S.slotCfgEditing;
            }
        }
        else if (S.view === VIEW_KNOBS) {
            S.pendingAction = { t: 'knobtarget' };   /* probes components — tick only */
        }
        else if (S.view === VIEW_KNOB_TARGET) {
            const t = S.knobTargets[S.knobTargetIdx];
            if (t && !t.id) commitKnobAssignment('', '');      /* (None) = clear */
            else if (t) S.pendingAction = { t: 'knobparam', target: t.id };
        }
        else if (S.view === VIEW_KNOB_PARAM) {
            const p = S.knobParams[S.knobParamIdx];
            if (p) commitKnobAssignment(S.knobTarget, p.key);
        }
        else if (S.view === VIEW_LFO) {
            const item = lfoItems()[S.lfoIdx];
            if (item && item.type === 'action') S.pendingAction = { t: 'lfotarget' };
            else S.lfoEditing = !S.lfoEditing;
        }
        else if (S.view === VIEW_LFO_TARGET) {
            const c = S.lfoComps[S.lfoCompIdx];
            if (c && c.key === '__clear__') commitLfoTarget('', '');
            else if (c && (c.key === 'lfo1' || c.key === 'lfo2')) openLfoParams(c.key);
            else if (c) S.pendingAction = { t: 'lfoparam', comp: c.key };
        }
        else if (S.view === VIEW_LFO_PARAM) {
            const c = S.lfoComps[S.lfoCompIdx];
            const p = S.lfoParams[S.lfoParamIdx];
            if (c && p) commitLfoTarget(c.key, p.key);
        }
        else if (S.view === VIEW_BUSES) {
            S.pendingAction = { t: 'bus', bus: FX_BUSES[S.busIdx] };
        }
        else if (S.view === VIEW_BLOCKS && S.pickRows[S.pickRow] &&
                 S.pickRows[S.pickRow].kind === 'buslevel') {
            const _r = S.pickRows[S.pickRow];
            if (_r.spec.toggle) {
                /* A 0/1 value has nothing to scrub, so the click IS the edit.
                 * Written as an int: the host parses these with atoi, and a
                 * "1.000" in the set's meta file would read as a level. */
                _r.val = _r.val ? 0 : 1;
                S.busLevelDirty = true;
                queueWrite(_r.spec.key, String(_r.val), _r.spec.comp);
                /* Solo is exclusive host-side, so every other row's cached
                 * value may now be stale — re-read on the tick, where the
                 * readback traffic belongs. */
                if (_r.spec.key === 'soloed') S.pendingAction = { t: 'names' };
            } else {
                S.busLevelEditing = !S.busLevelEditing;
            }
        }
        /* Move's own instrument editor. Not a module browser: Move owns that
         * voice and there is nothing of ours to load into it. */
        else if (S.view === VIEW_BLOCKS && S.pickRows[S.pickRow] &&
                 S.pickRows[S.pickRow].kind === 'movesynth') {
            S.coRunRequest = S.bus ? S.bus.track : -1;
        }
        else if (S.view === VIEW_BLOCKS && S.pickRows[S.pickRow] &&
                 S.pickRows[S.pickRow].kind === 'settings') {
            S.pendingAction = { t: 'slotcfg' };   /* reads the slot — tick only */
        }
        else if (S.view === VIEW_BLOCKS && S.pickRows[S.pickRow] &&
                 S.pickRows[S.pickRow].kind === 'patches') {
            S.pendingAction = { t: 'patchlist' };   /* store listing — tick only */
        }
        else if (S.view === VIEW_PATCHES) {
            if (S.patchConfirm) {
                const c = S.patchConfirm;
                S.patchConfirm = null;
                if (S.patchConfirmIdx === 1) {
                    S.pendingAction = (c.t === 'delete')
                        ? { t: 'patchdel', index: c.index }
                        : { t: 'patchsavedo', name: c.name, overwrite: c.index };
                }
            } else if (S.patchIdx === 0) {
                S.pendingAction = { t: 'patchsave' };
            } else if (S.patchIdx === 1) {
                S.pendingAction = { t: 'patchsaveas' };
            } else {
                const index = S.patchIdx - 2;
                if (S.patchNames[index] !== undefined) {
                    if (S.shiftHeld) {
                        /* Shift+click deletes — same modifier grammar as the
                         * user-preset list. */
                        S.patchConfirm = { t: 'delete', index, name: S.patchNames[index] };
                        S.patchConfirmIdx = 0;
                    } else {
                        S.pendingAction = { t: 'patchload', index };
                    }
                }
            }
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
        /* A hosted canvas gets first refusal on a Back TAP, so its own modal can
         * cancel instead of Back closing the screen out from under an open
         * field. It consumes only when something is open and declines at rest,
         * so davebox's navigation below is untouched the rest of the time.
         * ⚠ Deliberately the tap only — the long-press suspend above stays
         * unclaimable, the same failsafe shape as the host's Shift+Back. */
        if (hostedBack()) return true;
        if (S.view === VIEW_SLOTCFG) {
            if (S.slotCfgEditing) S.slotCfgEditing = false;   /* leave edit first */
            else closeSlotCfg();
        } else if (S.view === VIEW_KNOBS) {
            /* Assignments were queued as they were made; nothing to flush.
             * The host autosave persists them (set_param marks the slot dirty). */
            S.pendingAction = { t: 'slotcfg', keep: true };
        } else if (S.view === VIEW_KNOB_TARGET) {
            S.view = VIEW_KNOBS;
        } else if (S.view === VIEW_KNOB_PARAM) {
            S.view = VIEW_KNOB_TARGET;
        } else if (S.view === VIEW_LFO) {
            if (S.lfoEditing) S.lfoEditing = false;
            else S.pendingAction = { t: 'slotcfg', keep: true };
        } else if (S.view === VIEW_LFO_TARGET) {
            S.view = VIEW_LFO;
        } else if (S.view === VIEW_LFO_PARAM) {
            S.view = VIEW_LFO_TARGET;
        } else if (S.view === VIEW_PATCHES) {
            if (S.patchConfirm) S.patchConfirm = null;
            else { S.view = VIEW_BLOCKS; S.patchMsg = ''; }
        } else if (S.view === VIEW_FILE) {
            S.view = VIEW_MENU;
        } else if (S.view === VIEW_MENU && S.confirmItem) {
            S.confirmItem = null;
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
        } else if (S.busLevelEditing) {
            S.busLevelEditing = false;
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
        if (soundIsGlobal()) return false;   /* the knob is Move's here */
        const on = (status === 0x90 && d2 >= 64);
        if (S.volTouched && !on) flushVolumeSave();
        S.volTouched = on;
        S.volShownUntil = on ? (S.tickCount + VOL_SHOW_TICKS * 4) : S.tickCount + VOL_SHOW_TICKS;
        S.dirty = true;
        return true;
    }
    if (d1 > 7) return false;

    /* Knob touch is a NOTE, and hostedTakes() only forwards CCs — so a hosted
     * canvas never saw touch at all. Two symptoms on device, one cause: touching
     * a knob did not highlight it (the press note never arrived), and the
     * highlight STUCK after a turn (the release note never arrived either, so
     * nothing ever cleared what the turn had set).
     *
     * Forwarded but NOT consumed: davebox keeps its own touch bookkeeping below
     * — it drives the write-flush on release — and only the kit renders while
     * hosting, so the two cannot disagree on screen.
     *
     * ⚠ Notes 0-7 ONLY. Pad notes are deliberately never replayed into a hosted
     * canvas: the kit would write the vouch a second time on top of davebox's
     * own, re-arming a press the note already resolved. */
    hostedNote(status, d1, d2);

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

/* ── the edit-CC claim, while WE are the one showing a module's canvas ──────
 *
 * Undo (56) / Copy (60) / Delete (119) reach a module only while something
 * claims them; otherwise Move firmware keeps them. shadow_ui raises the claim
 * for its OWN screens, but its entry-condition table is keyed on VIEW — CANVAS,
 * HIERARCHY_EDITOR, COMPONENT_EDIT, COMPONENT_PARAMS — and while davebox hosts a
 * module canvas the view is davebox's overtake view. The host cannot know a tool
 * is showing a module's UI, so nobody claims them and a hold-Copy + tap-pad
 * gesture silently does nothing (measured exactly that on device: the gesture
 * fired correctly from an INJECTED CC 60, which bypasses the shim, and never
 * from the physical button, which does not).
 *
 * ⭑⭑ Re-DERIVED from what is on screen right now, in ONE place, never bookkept
 * at the sites that change the flags — the same rule the host's own version
 * follows, and the lesson rounds 24-26 paid for. A new screen wanting these
 * buttons changes the condition HERE.
 *
 * ⚠⚠ Releasing matters more than claiming. While the claim is up Move does NOT
 * see these three buttons, so a claim left stranded steals the user's native
 * Undo — which is exactly why the host's first unconditional attempt (PR #154)
 * was reverted (PR #175). Hence: re-checked every tick, and forced OFF in
 * soundExit, which is the one path the tick cannot cover because it stops. */
function editCcClaimWanted() {
    return !!(S.active && S.view === VIEW_EDIT && S.hosted &&
              engineClaimsEditCcs(S.comp, S.moduleId));
}

function reconcileEditCcClaim(force) {
    const want = force ? false : editCcClaimWanted();
    if (want === S.editCcClaimed) return;
    S.editCcClaimed = want;
    host_edit_cc_block(want ? 1 : 0);
}

export function soundTick() {
    /* Ahead of the S.active gate: leaving sound mode with the claim up would
     * strand it, and this is the cheap belt to soundExit's braces. */
    reconcileEditCcClaim(!S.active);
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

    /* The pad vouch goes FIRST and unbudgeted. The module matches it against a
     * note it has already seen, inside a window of a few render blocks, so a
     * vouch that waits its turn behind a knob sweep arrives after the window has
     * closed and the press is simply lost. It is one write, it coalesces to at
     * most one per tick, and it only exists at all while a module that asked for
     * it is open. */
    /* RETRY only — the vouch itself is sent from soundVouchLivePress, whose
     * header explains why it cannot wait for this tick. We arrive here solely
     * when that write was DROPPED (mailbox busy: a pad press is also when
     * davebox is busiest on the param channel, with lane select + step sync +
     * bank refresh all firing from the same handler). A retry is already late
     * against the module's window, so it is a long shot rather than the
     * mechanism — but it costs one write and beats losing the press outright. */
    if (S.padVouch && S.livePress) {
        if (engineSet(S.slot, S.comp, S.livePress.pressParam, '1') ||
                ++S.padVouchTries >= VOUCH_MAX_TRIES) {
            S.padVouch = false;
            S.padVouchTries = 0;
        }
    } else if (S.padWatchLeft > 0) {
        /* WATCH for the change; never read once at a fixed delay. The note and
         * the vouch reach the module by different paths with different
         * latencies, so there is no tick at which the answer is reliably ready
         * — a single early read gets the OLD index and there is no second
         * chance, leaving the screen stale until the ~250ms idle poll. That is
         * exactly the "a tap does nothing, holding works" report: holding just
         * kept you looking long enough for the idle poll to land.
         *
         * Every OTHER tick: ~21ms of granularity is imperceptible and halves
         * the cost of a drum roll, which re-arms this on every hit. */
        S.padWatchLeft--;
        /* A module may vouch without publishing a selection (press declared,
         * select not). There is then nothing to watch, so fall back to one
         * refresh late enough for the module to have acted — the pages ride the
         * alias, so re-reading their values is all they need. */
        if (!S.livePress.selectParam) {
            if (S.padWatchLeft === 0) followLiveSelection(-1);
        } else if ((S.padWatchLeft & 1) === 0) {
            const now = readLiveSelection();
            if (now >= 0 && now !== S.padWatchFrom) {
                S.padWatchLeft = 0;
                followLiveSelection(now);
            }
        }
    }

    /* Drain a bounded number of queued writes. */
    for (let n = 0; n < WRITES_PER_TICK && S.pendingWrites.length; n++) {
        const w = S.pendingWrites.shift();
        engineSet(w.slot, w.comp, w.key, w.val);
    }
    drainSlotWrites();
    drainForcedPoll();

    if (S.volPending) {
        S.volPending = false;
        writeVolLevel(S.slot, S.volLevel);
        /* Keep the on-screen VOLUME row in step — on a Move bus the knob and the
         * row are two controls on ONE value, and a stale row is a lie you can
         * see. (refreshBlockNames only re-reads on entry.) */
        const _vr = S.pickRows.find(r => r.kind === 'buslevel' && r.spec.key === 'volume');
        if (_vr) _vr.val = S.volLevel;
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

    tickChainPatches();

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
     * read back stale values and fight the optimistic local ones.
     *
     * ⭑ Skipped entirely while HOSTING: the module's own kit engine reads what
     * it draws, through its own cache, so polling into S.values here would be a
     * second set of ~2.6 ms round-trips for numbers nothing renders. Param
     * reads — not draw CPU — are the expensive half of a hosted frame. */
    if (S.view === VIEW_EDIT && !S.hosted && S.banks.length && !S.pendingWrites.length &&
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
    drawKitList(S.pickRows.map((r, idx) => {
        if (r.kind === 'buslevel') {
            /* `fmt` where the spec carries one — a bus VOLUME is a gain and
             * reads as one (GAIN_FMT), the same notation the slot's Volume row
             * and the knob read-out use. Sends and returns are 0..1 proportions
             * and stay a percentage, which is the default here. */
            return { label: r.label, hdr: true,
                     value: r.spec.toggle ? (r.val ? 'ON' : 'OFF')
                          : r.spec.fmt   ? r.spec.fmt(r.val || 0)
                                          : (Math.round((r.val || 0) * 100) + '%'),
                     editing: idx === S.pickRow && S.busLevelEditing };
        }
        if (r.kind === 'movesynth') return { label: r.label, hdr: true, value: r.value };
        if (r.kind !== 'block') return { label: r.label, hdr: true };
        /* A bypassed block still says what it holds — you need to know WHAT is
         * switched out — so the state rides as a prefix. Matches the host's 'B'. */
        return { label: r.label, hdr: true,
                 value: (r.bypassed ? 'B ' : '') + String(r.name || '-').toUpperCase() };
    }), S.pickRow, {});
}

function renderBuses() {
    clear_screen();
    drawKitHeader('SESSION FX', false);
    drawKitList(FX_BUSES.map(b => ({ label: b.title, hdr: true })),
        S.busIdx, { topY: 16 });
}

/* What to CALL the block being edited.
 *
 * ⚠ Not `BLOCKS[S.blockIdx].label`. On a bus, S.comp is a prefixed component
 * (`move_fx:2:fx3`, `master_fx:fx1`) that appears nowhere in BLOCKS, so
 * blockIdx keeps whatever a TRACK context left in it — which is how a Move
 * bus's FX 3 picker came up headed "SYNTH - PICK" on hardware. Derive the label
 * from the component actually open. */
function blockLabel() {
    if (S.bus) {
        const tail = String(S.comp || '').split(':').pop();
        const n = /^fx(\d+)$/.exec(tail);
        return n ? ('FX ' + n[1]) : tail.toUpperCase();
    }
    return BLOCKS[S.blockIdx].label;
}

function renderBrowse() {
    clear_screen();
    drawKitHeader(blockLabel() + ' - PICK', false);
    drawKitList(S.browseList.map(m => String(m.name)), S.browseIdx, {});
}

/* ── hosting a module's OWN canvas UI ──────────────────────────────────────
 *
 * For a module that DECLARES `capabilities.host_canvas_ui`, davebox runs its
 * real `bank_editor(ctx)` instead of re-drawing our adoption of it. One
 * renderer, so a module looks the same inside davebox as it does in the host.
 *
 * ⭑ Why this exists at all: `adoptKitStructure` can only carry DATA. A module's
 * header FUNCTION, its cellViz, browse picker and icons are CODE and die at
 * that boundary — which is why a hosted DR32 page could not say which pad it
 * was editing, however much we widened the adoption.
 *
 * The ctx is small (measured against canvaskit v38): fillRect, setPixel,
 * drawRect, print, measureText, getParam, setParam, getValue/setValue, plus
 * width/height/state. The kit REPLACES print/measureText with its own pixel
 * font on first draw, so ours only have to exist.
 *
 * ⚠ We track a contract we do not own. That is exactly why hosting is opt-in:
 * a module reaching past this surface must fail on its author's terms, not
 * silently inside our shell.
 *
 * Cost, MEASURED on device (2026-07-31, on-screen HUD — the log path would have
 * inflated the very frames under test): the whole render is **under the 1 ms
 * clock resolution**, ~20 µs/frame, with no frame in a 48-sample window
 * reaching 1 ms. The real cost is param reads at ~2.6 ms each, and the kit's
 * own cache keeps those to the 24-frame flush (0.38/frame on DR32's page) —
 * traffic davebox largely pays already. This was mispriced twice by inference
 * before anyone measured it; do not re-guess it. */
function hostedCtx() {
    if (S.hostedCtx) return S.hostedCtx;
    const ctx = {
        width: 128, height: 64,
        /* The kit persists its own bank index through getValue/setValue and
         * re-seeds from it in onOpen. Keep it on OUR state so a block reopen
         * lands where the user left it. */
        state: {},
        setPixel: (x, y, v) => set_pixel(x | 0, y | 0, v ? 1 : 0),
        fillRect: (x, y, w, h, v) => fill_rect(x | 0, y | 0, w | 0, h | 0, v ? 1 : 0),
        drawRect: (x, y, w, h, v) => draw_rect(x | 0, y | 0, w | 0, h | 0, v ? 1 : 0),
        print: (x, y, t, c) => print(x | 0, y | 0, String(t), c ? 1 : 0),
        measureText: (s) => (typeof text_width === 'function'
            ? text_width(String(s)) : String(s).length * 6),
        getParam: (k) => engineGet(S.slot, S.comp, k),
        setParam: (k, v) => engineSet(S.slot, S.comp, k, String(v)),
        /* The canvas persists its own bank index through these. Keyed per
         * MODULE so reopening a block returns to the page you left it on —
         * S.hostedValue used to be a single slot wiped by hostedReset(), so
         * onOpen re-seeded from a value that had just been cleared and every
         * open landed on bank 0. */
        getValue: () => String(S.hostedPage[hostedPageKey()] || '0'),
        setValue: (v) => { S.hostedPage[hostedPageKey()] = String(v); },
    };
    S.hostedCtx = ctx;
    return ctx;
}

/* Drop the hosted ctx when the block changes — its param cache, its bank index
 * and the kit's own per-ctx install all belong to the module we were editing.
 * Carrying them into the next one is the classic display-desync. */
/* Identity of "which module's page am I remembering?" — the block AND the
 * module in it, so swapping a module does not inherit the old one's page. */
function hostedPageKey() {
    return S.slot + ':' + S.comp + ':' + (S.moduleId || '');
}

function hostedReset() {
    S.hostedCtx = null;
    S.hostedOpened = false;
    /* NOT S.hostedPage — that is the whole point: it must OUTLIVE a reset, or
     * the canvas forgets its page every time discovery runs. */
}

/* Tell a hosted canvas it has been opened, once per block.
 *
 * The kit's onOpen re-seeds its state from the persisted value, so without this
 * the canvas always opens on bank 0 instead of where you left it — and a module
 * that does other setup there would simply never get it. Fired lazily on the
 * first draw rather than at discovery, because the ctx does not exist until
 * then. */
function hostedOpen(ctx) {
    if (S.hostedOpened || typeof S.hosted.onOpen !== 'function') return;
    S.hostedOpened = true;
    try { S.hosted.onOpen(ctx); } catch (e) { /* a bad onOpen must not kill the page */ }
}

/* Offer Back to a hosted canvas before davebox acts on it.
 *
 * The kit consumes Back ONLY while one of its own modals is open (its text
 * field, a picker) and declines at rest — the same consume-only-when-meaningful
 * rule as the jog click. Without this a module's popup has no cancel path: Back
 * would close davebox's screen out from under an open field.
 *
 * Returns true when the module took it. */
function hostedBack() {
    if (!S.hosted || S.view !== VIEW_EDIT) return false;
    if (typeof S.hosted.handleBack !== 'function') return false;
    try {
        if (S.hosted.handleBack(hostedCtx()) === true) { S.dirty = true; return true; }
    } catch (e) { /* declining is the safe default — never trap the user */ }
    return false;
}

function renderHosted() {
    const ov = S.hosted;
    try {
        hostedOpen(hostedCtx());
        ov.draw(hostedCtx());
        return true;
    } catch (e) {
        /* A throwing overlay must not take the whole editor down. Fall back to
         * the adopted banks for the rest of this block, and say so — silently
         * degrading would leave the author with no signal at all. */
        S.hosted = null;
        try { console.log('davebox: hosted canvas draw failed, adopting instead: ' + e); }
        catch (e2) { /* logging is best-effort */ }
        return false;
    }
}

function renderEdit() {
    clear_screen();
    /* Hosted modules draw themselves, INCLUDING their own header and picker. */
    if (S.hosted && renderHosted()) return;
    if (!S.banks.length) {
        drawKitHeader(blockLabel(), false);
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
    return String(S.moduleId || blockLabel()).toUpperCase();
}

/* Shared list body for the row-based preset screens (thin drawKitList shim). */
function renderRows(rows, sel, emptyMsg) {
    drawKitList(rows.map(String), sel, { emptyMsg });
}

function renderPresetSrc() {
    clear_screen();
    drawKitHeader(modLabel(), false);
    renderRows(S.srcRows.map(r => r.label), S.presetSrcIdx, '');
}

function renderChainPatches() {
    clear_screen();
    if (S.patchConfirm) {
        drawKitHeader(S.patchConfirm.t === 'delete' ? 'DELETE?' : 'OVERWRITE?', false);
        centreText(24, String(S.patchConfirm.name || '').toUpperCase());
        drawDialogYesNoRow(S.patchConfirmIdx === 1);
        return;
    }
    drawKitHeader('SLOT PRESETS', false);
    /* '*' marks the slot's current patch — the one [Save] would overwrite. */
    const rows = ['[Save]', '[Save as…]'].concat(
        S.patchNames.map(n => (n === S.patchCur ? '*' : ' ') + n));
    renderRows(rows, S.patchIdx, '');
    if (S.patchMsg) centreText(58, S.patchMsg);
}

function renderPresetList() {
    clear_screen();
    if (S.confirmDel) {
        const p = S.userPresets[S.userIdx - 1];
        drawKitHeader('DELETE?', false);
        centreText(24, String(p ? p.name : '').toUpperCase());
        drawDialogYesNoRow(S.confirmIdx === 1);
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
    if (S.confirmItem) {
        /* Name the SLOT being written, not the action — "Save to Slot" is the
         * screen you are already on; which slot is about to be overwritten is
         * the thing you need to check before saying yes. */
        drawKitHeader('OVERWRITE?', false);
        centreText(24, String(S.confirmItem.label || '').toUpperCase());
        drawDialogYesNoRow(S.confirmIdx === 1);
        return;
    }
    const lv = (S.levels && S.levels[S.menuKey]) || {};
    /* Inside a repeated element the level name alone is a lie — eight identical
     * "PARTS" screens with no way to tell which part you are editing. */
    const cspec = childSpec(lv);
    const title = (!S.menuKey && S.modes) ? (S.moduleId || 'MENU')
        : (cspec && S.menuChild >= 0) ? (cspec.label + ' ' + (S.menuChild + 1))
        : (lv.name || lv.label || S.menuKey || 'MENU');
    drawKitHeader(String(title).toUpperCase(), false);
    drawKitList(S.menuRowsCache.map((r, idx) => {
        /* An item row's "value" is whether it is the one in force — without it
         * a bank list is N identical rows and you cannot tell which you're on. */
        if (r.kind === 'level' || r.kind === 'child' || r.kind === 'mode')
            return { label: r.label, chevron: true };
        if (r.kind === 'item')
            return { label: r.label, value: r.selected ? '*' : '' };
        return { label: r.label,
                 value: r.cell ? String(formatValue(r.cell, r.val)) : '',
                 editing: idx === S.menuIdx && S.menuEditing && r.kind === 'param' };
    }), S.menuIdx, { emptyMsg: 'NO PARAMS' });
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
    else if (S.view === VIEW_KNOBS) renderKnobs();
    else if (S.view === VIEW_KNOB_TARGET) renderKnobTarget();
    else if (S.view === VIEW_KNOB_PARAM) renderKnobParam();
    else if (S.view === VIEW_LFO) renderLfo();
    else if (S.view === VIEW_LFO_TARGET) renderLfoTarget();
    else if (S.view === VIEW_LFO_PARAM) renderLfoParam();
    else if (S.view === VIEW_PATCHES) renderChainPatches();
    else if (S.view === VIEW_BUSES) renderBuses();
    else renderEdit();
    if (S.volShownUntil >= 0 && S.tickCount <= S.volShownUntil) drawVolReadout();
    return true;
}
