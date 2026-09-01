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
    engineGetSlotParam, engineSetSlotParam, engineSaveState,
    engineGetChainParam, engineSetChainParam, engineModuleAbbrev,
    SLOT_LEVEL_KEY, SLOT_LEVEL_STEP, SLOT_LEVEL_MAX,
    slotIndex, moveBusForChannel, moveBusComp, moveBusPrefix,
} from './ui_engine.mjs';
/* davebox's GLOBAL state. Sound mode keeps its own `S`, so this is imported
 * under a different name deliberately — the two are easy to confuse, and
 * confusing them is exactly what broke the bypass gesture. Used only for the
 * Back long-press, which davebox owns module-wide. */
import { armBankDisplay, standDownBankDisplay, S as GS } from './ui_state.mjs';
/* ⚠ Deliberate import cycle with ui_render (it imports soundRender from here);
 * safe because both sides only call the binding inside function bodies, never
 * at module-init time — the same contract the ui_record ↔ ui_dsp_bridge cycle
 * documents. bankCardVisible is the ONE owner of card visibility. */
import { bankCardVisible, sessMixerVisible } from './ui_render.mjs';
/* Destination read/write and the option list. ui_dsp_bridge does not import
 * this file, so there is no cycle; ui_constants is a leaf. */
import { instrValueFor, applyInstrChoice } from './ui_dsp_bridge.mjs';
import { instrOptions, fmtInstr, INSTR_SCHWUNG, fmtVelOverride, BANK_SOUND, BANK_SOUND_PREV,
         PAD_MODE_CONDUCT as PMC, PAD_MODE_DRUM as PMD } from './ui_constants.mjs';
import { applyTrackConfig } from './ui_dsp_bridge.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { forceRedraw } from './ui_leds.mjs';
import { writeSidecar } from './ui_persistence.mjs';
import { requestTrackModeChange } from './ui_dialogs.mjs';
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
    drawKitBankPage, drawKitHeader, drawKitHeaderParamPages,
    drawKitSectionPicker, drawKitList, drawKitListOverlay,
    kitUseLayout,
    drawKitStackedList, drawKitBackdropDim, drawKitCrumbs, kitStackBox,
    MV_BAR_Y,
    hdrPrint, mvPrint, mvWidth, shapeSample, plotLine, hudCard, drawLevelCard,
} from './ui_movy.mjs';
import { bankCyclePos, bankCycleForMode } from './ui_pure.mjs';
/* ⭐⭐ THE MODULE EDITOR IS THE HOST'S, AND NOW LITERALLY THE SAME FILE.
 *
 * `createParamPagesBinding` is the editor the shadow UI runs; davebox creates
 * its OWN instance over its own host context. Not a copy, not a port, not a
 * resemblance — one file in shared/, two instances, so an improvement to the
 * editor reaches the host and davebox in a single commit.
 *
 * ⭑ It took a host change to get here, and that is the point rather than a
 * compromise: dbxhost is davebox's own host (workspace CLAUDE.md — "there is no
 * conceptual separation between what davebox needs and what the host can
 * provide. What we need the host to do, we change"). The editor was a singleton
 * in shadow/, reachable by no module, so davebox first carried a frozen COPY
 * defended by a stamp, a hand-edit detector and a skew check — machinery whose
 * whole job was to simulate being the same file. Making the host's binding a
 * factory in shared/ deleted all of it.
 *
 * davebox's half of the seam is ui/pp_ctx.mjs, and nothing else. */
import { createParamPagesBinding }
    from '/data/UserData/schwung/shared/param_pages/binding_movy.mjs';
import { ctx as ppCtx, installPpCtx } from './pp_ctx.mjs';
import { evaluateVisibility }
    from '/data/UserData/schwung/shared/param_pages/visibility.mjs';
/* The preset record's dirty test — SHARED with the host's editor (upstream
 * grew this module for exactly this bookkeeping), so the `*` means the same
 * thing on both. hashState makes a record persistable where the old full-blob
 * copy was not; isModified carries the rule that an unknown read is NOT a `*`. */
import { hashState, isModified }
    from '/data/UserData/schwung/shared/param_pages/current_preset.mjs';

/* ⚠ Created at module load, and it reads NOTHING from ppCtx yet — the binding
 * only ever touches ctx inside function bodies, which is what lets davebox fill
 * it below without an import cycle. Same rule the shadow UI relies on. */
const PP = createParamPagesBinding(ppCtx);
const { enterParamPages, exitParamPages, tickParamPages, drawParamPages,
        handleParamPagesMidi, paramPagesActive, paramPagesChildIndex,
        clearParamPagesTouch, currentParamPage,
        paramPagesPickerOpen, paramPagesMenuEntered,
        paramPagesRefreshTrailing } = PP;
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
    /* `Generator` — the module's own vocabulary (component_type:
     * sound_generator). `Sound` was doing double duty for the whole screen and
     * for this one row on it, and `Instrument` is taken: a track's INSTRUMENT is
     * its destination (TRACK_OWNS_ITS_INSTRUMENT.md), which is the `Track to`
     * row. */
    { comp: 'synth',    label: 'Generator' },
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
/* Short by necessity — the header is 128px wide and the long form did not fit.
 * The track header is used on screen (see renderBlocks); this remains the bus's
 * own name for any list that shows one. */
const MOVE_BUS_TITLE = (bus) => 'MOVE ' + bus;
function moveBusFor(track) {
    const bus = moveBusForChannel(GS.trackChannel[track]);
    const cmp = moveBusComp(bus);
    return {
        id: 'move' + bus, kind: 'move', bus: bus, track: track,
        title: MOVE_BUS_TITLE(bus), prefix: moveBusPrefix(bus),
        levels: [
            { comp: cmp, key: 'volume', label: 'Volume',
              min: 0, max: SLOT_LEVEL_MAX, step: BUS_LEVEL_STEP, fmt: GAIN_FMT },
            { comp: cmp, key: 'pan', label: 'Pan',
              min: 0, max: 1, step: BUS_LEVEL_STEP, fmt: PAN_FMT },
            { comp: cmp, key: 'send_a', label: 'Send A',
              min: 0, max: 1, step: BUS_LEVEL_STEP },
            { comp: cmp, key: 'send_b', label: 'Send B',
              min: 0, max: 1, step: BUS_LEVEL_STEP },
            { comp: cmp, key: 'muted', label: 'Mute',
              min: 0, max: 1, step: 1, toggle: true },
            { comp: cmp, key: 'soloed', label: 'Solo',
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
      VIEW_LFO = 14, VIEW_LFO_TARGET = 15, VIEW_LFO_PARAM = 16,
      /* One picker serving every enum row in sound mode — see openEnumPicker. */
      VIEW_ENUM = 17,
      /* ⭑ The SOUND + CONFIG BANK's own screen (Josh, 2026-08-28). The bank is
       * a DOOR now, not the menu: landing on it offers to open the menu rather
       * than opening it. But the bank still OWNS THE KNOBS — K1-K8 drive the
       * slot's assignments here exactly as they did when the bank was the
       * screen — so sound mode is fully ACTIVE on this view, and the knob HUD
       * draws over it. Two states, not one: active-as-bank, and open-as-menu. */
      VIEW_PROMPT = 18;

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
const PAN_FMT = (v) => {
    const pct = Math.round((v - 0.5) * 200);
    if (pct === 0) return 'C';
    return pct < 0 ? Math.abs(pct) + 'L' : pct + 'R';
};
const ONOFF   = (v) => (v ? 'Yes' : 'No');

/* ---- a mixer position's LEVEL rows ----
 *
 * A chain slot and a Move FX bus are alternative occupants of ONE mixer
 * position, so they carry the same five controls and are shown the same way:
 * inline on the track's top level, not behind a settings door. A Move bus
 * already read that way; this is the chain slot catching up, and it is why both
 * flavours can now render from one row kind.
 *
 * The only difference is the backing store, which the `slot` flag selects: a bus
 * addresses `move_fx:N:<key>` through a component, a chain slot addresses
 * `slot:<key>` directly. Everything else — order, labels, ranges, formatting —
 * is shared, so the two cannot drift.
 *
 * ⚠ Volume is bound by SLOT_LEVEL_MAX, not the host's 4x wire clamp: one key
 * must not offer a ceiling here that the knobs would snap away from on the
 * first detent. */
const SLOT_LEVELS = [
    { slot: true, key: 'volume', label: 'Volume',
      min: 0, max: SLOT_LEVEL_MAX, step: 0.05, fmt: GAIN_FMT },
    { slot: true, key: 'pan', label: 'Pan',
      min: 0, max: 1, step: 0.05, fmt: PAN_FMT },
    { slot: true, key: 'send_a', label: 'Send A',
      min: 0, max: 1, step: 0.05, fmt: PCT_FMT, cap: 'sends' },
    { slot: true, key: 'send_b', label: 'Send B',
      min: 0, max: 1, step: 0.05, fmt: PCT_FMT, cap: 'sends' },
    { slot: true, key: 'muted',  label: 'Mute',
      min: 0, max: 1, step: 1, int: true, toggle: true, fmt: ONOFF },
    { slot: true, key: 'soloed', label: 'Solo',
      min: 0, max: 1, step: 1, int: true, toggle: true, fmt: ONOFF },
];

/* ---- Sound Control: what shapes the sound without being in its signal path ----
 *
 * Knob assignments are DIRECT access, LFOs are modulation; "Sound Control" is
 * the honest superset, and it is why this is not called Modulation. Both are
 * davebox's own editors (absorbed in P7 — they were host overlay services in
 * P5), reading and writing the same chain-host slot params the host's editors
 * did (knob_N_target/param via knob_N_set/clear; lfoN:* keys).
 *
 * Door rows: jog-click opens the editor, Back returns here. No value to read.
 *
 * ⚠ Chain-slot only. A Move FX bus has no knob or LFO assignment, so the door
 * does not appear on a Move track at all.
 *
 * `Volume`/`Send A`/`Send B`/`Muted`/`Soloed` used to sit here, in a screen
 * called SLOT SETTINGS, together with `Transpose`, `Recv Ch`, `Fwd Ch` and
 * `MPE`. The levels moved to the top level (SLOT_LEVELS above); `Transpose`
 * became a TRACK setting reaching every route; the three routing rows went when
 * the track gained ownership of its instrument. What is left is these three
 * doors, which is why the screen is now named for them.
 * ⚠ The host PARAMS behind the removed rows all still exist and still work —
 * davebox simply stopped writing them. */
/* ---- Config: the track's own settings ----
 *
 * What the track IS, as opposed to what it sounds like: how its pads are laid
 * out, what it transposes by, how it treats incoming velocity and pressure.
 * None of it belongs to the chain, and all of it applies whatever the track is
 * routed to — which is why these rows are identical on a Schwung track, a Move
 * track and an EXT one.
 *
 * Rows carry their own get/set because the backing store is davebox's OWN state
 * plus the DSP, reached through applyTrackConfig — not the host's slot params
 * that the level rows use. The settings screen therefore reads a row's value
 * through `get` when it has one and falls back to the slot store when it does
 * not, which is what lets Sound Control and Config share one screen.
 *
 * ⚠ `Mode` (Keys/Drums/Conduct) is NOT here yet. It is the only row whose edit
 * CONVERTS the track, behind a confirm, and that flow still lives in the global
 * menu's jog-click handler. Moving it is its own step.
 *
 * ⚠ Built per open, not once: which rows apply depends on the track's pad mode
 * and route, and both change under this screen. */
function configRows(t) {
    const melodic = GS.trackPadMode[t] === 0;
    const rows = [];
    /* Mode leads: it decides what the rest of this screen even means (Layout is
     * melodic-only, AftTch is hidden on drums, Transpose on Conduct).
     *
     * ⚠ COMMIT ON CLICK, not per detent — the only row here whose edit CONVERTS
     * the track. Scrolling past Drums must not fire a conversion, so the value
     * is previewed and applied when the edit closes. The rules (and the
     * confirms) are requestTrackModeChange's; this row only chooses a target. */
    rows.push({ key: 'mode', label: 'Mode', commitOnClick: true,
        opts: [0, 1, 2],
        fmt: (v) => (v === PMC ? 'Conduct' : v ? 'Drums' : 'Keys'),
        get: () => GS.trackPadMode[t] | 0,
        set: (v) => requestTrackModeChange(t, v | 0) });
    /* Pad layout is a melodic idea — a drum track's pads are its lanes. */
    rows.push({ key: 'layout', label: 'Layout',
        opts: [0, 1], fmt: (v) => (melodic ? (v ? 'Chrom' : 'Scale') : '-'),
        get: () => (GS.padLayoutChromatic[t] ? 1 : 0),
        set: (v) => {
            if (!melodic) return;
            GS.padLayoutChromatic[t] = v !== 0;
            computePadNoteMap();
            forceRedraw();
        } });
    /* Conduct emits nothing, so it has nothing to transpose. */
    if (GS.trackPadMode[t] !== PMC) {
        rows.push({ key: 'transpose', label: 'Transpose',
            min: -24, max: 24, step: 1, int: true,
            fmt: (v) => (v === 0 ? '0 st' : (v > 0 ? '+' : '') + v + ' st'),
            get: () => GS.trackTranspose[t] | 0,
            set: (v) => applyTrackConfig(t, 'transpose', v) });
    }
    rows.push({ key: 'velin', label: 'VelIn',
        min: 0, max: 127, step: 1, int: true, fmt: fmtVelOverride,
        get: () => GS.trackVelOverride[t] | 0,
        set: (v) => applyTrackConfig(t, 'track_vel_override', v) });
    rows.push({ key: 'looper', label: 'Looper',
        opts: [0, 1], fmt: (v) => (v ? 'On' : 'Off'),
        get: () => (GS.trackLooper[t] !== 0 ? 1 : 0),
        set: (v) => applyTrackConfig(t, 'track_looper', v ? 1 : 0) });
    /* Pad pressure: owned by the repeat-velocity system on drum tracks, so the
     * row is hidden there. Move takes poly AT only. */
    if (GS.trackPadMode[t] !== PMD) {
        rows.push({ key: 'afttch', label: 'AftTch',
            opts: GS.trackRoute[t] === 1 ? [0, 1] : [0, 1, 2],
            fmt: (v) => (v === 2 ? 'Chan' : v === 1 ? 'Poly' : 'Off'),
            get: () => GS.trackAtMode[t] | 0,
            set: (v) => { GS.trackAtMode[t] = v | 0; writeSidecar(); } });
    }
    return rows;
}

const SOUND_CONTROL = [
    { key: 'knobs', label: 'Knobs',  sub: 'knobs' },
    { key: 'lfo1',  label: 'LFO 1',  sub: 'lfo', lfo: 0 },
    { key: 'lfo2',  label: 'LFO 2',  sub: 'lfo', lfo: 1 },
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
/* ---- verify-and-rewrite (2026-08-24) ----
 * A write is not DONE until a read confirms it. shadow_set_param is
 * fire-and-forget in overtake mode: it waits <=8ms for the one-deep mailbox,
 * then claims it, STOMPING any unconsumed request — so back-to-back writes on
 * different keys silently lose the first whenever the shim is >8ms behind (a
 * module load stalls SPI ~200ms; proven on device 2026-08-23 with
 * junologue-chorus: mix=0.90 placed, mode=2 placed 8ms later, mix never
 * reached the engine). The UI then shows the optimistic value until a poll or
 * the hosted kit's cache flush re-reads the engine, and the knob SNAPS BACK.
 * So: every drained write stays IN-FLIGHT — polls treat it like a pending
 * write — until a budgeted verifier (one read per tick, ~2.9ms) reads it
 * back. Match -> confirmed, drop. Mismatch -> REWRITE, up to
 * INFLIGHT_TRIES, then log and accept the engine's value (a module whose
 * readback genuinely disagrees would otherwise be rewritten forever). */
const INFLIGHT_CONFIRM_TICKS = 2;   /* let the mailbox serve before reading */
const INFLIGHT_TRIES = 3;
const TOUCH_HOLD_TICKS = 45;

const S = {
    active: false,
    track: -1,
    slot: -1,
    view: VIEW_BLOCKS,
    /* Header shown over the module browser when it was opened because the block
     * was EMPTY, rather than by choosing to browse. '' = the ordinary case. */
    browsePrompt: '',
    browseAfterReflavour: false,   /* one-shot: see the reflavour action */

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
    inflight: [],               /* drained-but-unconfirmed writes: {slot,comp,key,val,tick,tries} */
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
    /* `Track to` edit state. DEFERRED COMMIT, and not for tidiness: applying a
     * route on every detent would tear down and rebuild Track Control once per
     * click as you scrolled past Schwung / Move / MIDI — and scrolling PAST an
     * EXT route would close the screen out from under the row you were turning.
     * Scroll previews, click commits. */
    instrEditing: false,
    instrSel: 0,
    cfgWhich: 'sound',          /* which list the settings screen is showing */
    slotRows: [],               /* the active settings row set */
    capFx34: false,
    capSends: false,
    slotCfgIdx: 0,
    slotCfgVals: [],            /* live values, index-aligned with slotRows */
    slotCfgEditing: false,
    /* The open enum picker: { label, options, sel, commit(i), from }. Null when
     * none is open — its VIEW_TREE parent reads `from`, so this is also what
     * says where Back goes. */
    enumPick: null,
    slotCfgDirty: false,        /* something changed; save on leaving the screen */
    pendingSlotWrites: [],      /* slot-param writes, drained in tick */

    /* Knob editor (P7 absorb): per-slot knob->target:param assignment. */
    knobIdx: 0,                 /* cursor, 0-7 */
    /* 8 entries, ONE cache with two fillers: the editor reads all eight at open,
     * a knob TOUCH lazily reads the one it needs. `null` = not read yet, and it
     * has to be distinguishable from `{target:'',param:''}` (= read, unassigned)
     * or every touch would re-pay two round trips to learn nothing. */
    knobAsn: [null, null, null, null, null, null, null, null],
    knobTargets: [],            /* [{id, name}] — components with modules */
    knobTargetIdx: 0,
    knobParams: [],             /* [{key, label}] for the chosen target */
    knobParamIdx: 0,
    knobTarget: '',             /* target chosen in the picker */

    /* Knob HUD (outside a module editor the eight knobs drive the slot's knob
     * ASSIGNMENTS, and nothing on screen said so). Lifetime is S.touchedIdx —
     * the physical touch plus tick's existing decay — never a second timer.
     * The VALUE is owned here and written absolutely, so a sweep costs no
     * reads at all; see the turn law above knobCellFor. */
    knobMeta: {},               /* target id -> chain_params array, cached per slot */
    asnLoadFor: -1,             /* knob being loaded/edited; -1 = none */
    asnStage: 0,                /* 0 assignment, 1 metadata, 2 value, 3 loaded */
    asnCell: null,              /* editable cell for asnCellFor */
    asnCellFor: -1,
    asnValNum: null,            /* authoritative local value, optimistic on turn */
    asnLastDir: 0,              /* for the reversal reset */
    asnRevealed: false,         /* the value is hidden until the knob MOVES */

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

/* Read-only view of the pick list, for tests. Blind row-sweeping was the
 * alternative and it is worse than an accessor: it clicked whatever happened to
 * be under the cursor, which after the row set changed meant entering `Track
 * to`'s edit and committing a destination — a test that both failed falsely and
 * (earlier) passed falsely. Exposes no mutation. */
export function soundPickStateForTest() {
    /* `shift` is sound mode's OWN copy of the key, re-read from the physical
     * one on entry. Exposed because a gesture that SPENDS Shift has to be
     * checked here, not on the global: the global is already false by then, and
     * it is this re-read that would resurrect it. */
    return { kinds: S.pickRows.map(r => r.kind), row: S.pickRow, view: S.view,
             shift: S.shiftHeld };
}

/* Read-only view of the knob HUD's CONTENT decision, for tests. The card's text
 * goes down one set_pixel at a time, so a render stub can prove that lines were
 * drawn but never that they say the right thing — this pins the decision, and
 * the render test pins that the draw path runs. Exposes no mutation. */
export function soundInflightForTest() { return S.inflight; }
/* The hosted canvas's ctx, for the read-shield behaviour test. Exposes the same
 * object the kit is handed — nothing a test could not already reach by faking a
 * kit module, minus the fixture. */
export function soundHostedCtxForTest() { return hostedCtx(); }
export function soundBusCountForTest() { return FX_BUSES.length; }
export function soundPendingActionForTest() { return S.pendingAction; }
export function soundQueueActionForTest(a) { S.pendingAction = a; }
/* The param-pages editor's live state: whether it took the screen, and the page
 * the jog is on. Pins the OUTCOME (which pages exist) rather than ppApplies()'s
 * boolean — a gate can be right while the plan it produces is wrong. */
export function soundPPForTest() {
    return {
        on: ppOn, page: ppOn ? currentParamPage() : null, applies: ppApplies(),
        /* ⭑ The TERMS, so a test can prove which one decided. A control that
         * asserts only `!applies` passes for any reason at all — including a
         * precondition it lost by accident. */
        terms: { flag: PP_EDITOR, active: S.active, busOk: !S.bus || S.bus.kind === 'global',
                 slot: S.slot >= 0, notHosted: !S.hosted, moduleId: !!S.moduleId },
    };
}
export function soundValueForTest(key) { return S.values[key]; }
/* The knob TARGET rows, built the way the picker builds them — the list is
 * assembled fresh on every open from live component probes, so this exercises
 * the real path rather than a copy of it. */
export function soundKnobTargetsForTest() { return knobTargetList(); }
/* Drives the view directly so a Back edge can be exercised without walking the
 * whole entry gesture. ⚠ Test-only: the real transitions go through the
 * openers, which also seed the state each screen reads. */
export function soundSetViewForTest(v) { S.view = v; }
/* The two display forms, so a test can pin them without a live slot. */
export function compLabelsForTest(id, param) {
    return { short: compShort(id), wide: compWide(id), pair: compParamLabel(id, param) };
}
export function soundLfoCompsForTest() { return lfoCompList(); }
export function soundKnobHudForTest() {
    const i = S.touchedIdx;
    const a = i >= 0 ? S.knobAsn[i] : null;
    return {
        shown: i >= 0 && knobHudContext(),
        knob: i,
        target: a ? a.target : null,
        param: a ? a.param : null,
        value: fmtAsnValue(i),
        cursor: S.knobIdx,          /* where the assign flow is pointed */
        cell: (S.asnCellFor === i && S.asnCell) ? S.asnCell : null,
    };
}

export function soundActive() { return S.active; }
/* Sound mode is open ON ITS ROOT SCREEN — the block picker, i.e. what the bank
 * walk calls SOUND + CONFIG — as opposed to being open somewhere deeper (a
 * block editor, a preset list, slot settings).
 *
 * Exists for exactly one caller: Shift+Note/Session. That gesture is a toggle
 * whose closer runs first, and sitting on SOUND + CONFIG made the closer eat the
 * press — Josh, 2026-08-26: "the first time you do shift+note/session it sends
 * the bank back to the first one and you have to do it again to get into the
 * instrument. it should just go right to the instrument."
 *
 * ⭑ Root is the ONE depth where closing is not the useful answer, because the
 * screen you are on is the one the gesture would otherwise open FROM. Every
 * deeper screen keeps the one-press exit the 08-24 retirement created — which is
 * why this is a root test and not `!generatorOpen`. */
export function soundAtBlockRoot() { return S.active && S.view === VIEW_BLOCKS; }
/* For tests: the module browser's state. Exposed because the EMPTY-generator
 * route is only observable as "which screen am I on and what does it say" —
 * asserting the popup that used to stand in for it would now pass against a
 * gesture that never opened anything. */
export function soundBrowseStateForTest() {
    return { browsing: S.active && S.view === VIEW_BROWSE,
             prompt: S.browsePrompt, count: S.browseList.length };
}
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

/* Show the MENU on an ALREADY-OPEN sound mode — the tap gesture's destination.
 * From any depth: it collapses the whole stack back to the menu root, which is
 * the one-press way out of a deep chain now that the gesture never closes.
 * ⚠ Entry itself is NOT here: it is route-aware and deferred to the tick (a
 * Move-routed track opens its bus, not a chain slot). */
/* The current view, for a caller that needs to record where the user was. */
export function soundViewForTest() { return S.view; }
/* Which module editor is live. Exported for the RIGS, not for the UI: two
 * assertions in test_sound_write_verify measure davebox's OWN optimistic value
 * and its own poll, machinery the vendored editor replaces wholesale. A rig
 * that cannot tell which editor is running would either contort itself to
 * satisfy both or quietly stop measuring anything. */
export function soundPpEditorForTest() { return PP_EDITOR; }

export function soundShowMenu() {
    if (!S.active) return;
    S.view = VIEW_BLOCKS;
    S.dirty = true;
}

export function soundEnter(track, slot) {
    /* Track view only (Josh, 2026-08-08): the track flavour belongs to track
     * view; session view has its own entry (soundEnterBuses). Guard the
     * mechanism so every door is covered. */
    if (GS.sessionView) return;
    S.active = true;
    takeBankIdentity(track);
    armBankDisplay();   /* the banks' display window: the screen
                                         * shows, then falls back to the overview
                                         * unless the jog is touched (soundRender) */
    S.enterSession = false;     /* called from TRACK view */
    /* A TRACK context is not a bus one. Without this the previous session's bus
     * survived — S.bus is what soundIsGlobal() and buildPickRows() read, so
     * entering a track's sound landed you back on the bus's blocks. Third bug
     * of this shape today: state that outlives the screen it belonged to. */
    clearBusContext();
    S.track = track;
    S.slot = slot;
    /* ⭑ The BANK's screen, not the menu (Josh, 2026-08-28). Every path into
     * here is the bank — the jog reaching SOUND + CONFIG, a track switch onto a
     * track stored there, the tick reconcile, the co-run return — and the bank
     * now OFFERS the menu rather than being it. `soundOpenMenu()` is the door
     * for the gesture that asks for the menu by name. */
    S.view = VIEW_PROMPT;
    /* ⚠ SYNC to the physical key, do not assume it is up. Clearing this on a
     * retarget made Shift+jog a ONE-SHOT: stepping a track retargets, the
     * retarget forgot Shift was still down, and the next turn was read as an
     * unshifted jog that moved the cursor instead of the track. Shift is a
     * physical state — a stale copy is wrong, not safe. davebox tracks it
     * globally (soundOnCC passes the CC through for exactly that reason). */
    S.shiftHeld = GS.shiftHeld === true;
    S.touchedIdx = -1;
    S.turnedSinceTouch = false;
    resetKnobAsn();
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
    for (const w of S.pendingWrites) {
        engineSet(w.slot, w.comp, w.key, w.val);
        /* Entries carry their own address, so the verifier can still confirm
         * them after the retarget points the screen elsewhere. */
        trackInflight(w.slot, w.comp, w.key, w.val);
    }
    S.pendingWrites.length = 0;
    /* Slot params carry their own slot, so landing them here is correct rather
     * than merely tidy. */
    for (const w of S.pendingSlotWrites) {
        engineSetSlotParam(w.slot, w.key, w.int ? String(w.val) : w.val.toFixed(3));
    }
    S.pendingSlotWrites.length = 0;
    if (S.slotCfgDirty || S.busLevelDirty) {
        S.slotCfgDirty = false;
        S.busLevelDirty = false;
        engineSaveState();
    }
}

/* SOUND + CONFIG is its own BANK (Josh, 2026-08-23), and it RECORDS ITSELF
 * like every other bank (Josh, 2026-08-25). S.activeBank becomes BANK_SOUND, so
 * sequencing, LEDs and the fallback overview all run their standard-bank
 * branches whatever bank the jog came from (AUTO's step editing included) —
 * and trackActiveBank takes it too, so the track IS on this bank as far as the
 * sidecar, the track switch and the exit restore are concerned.
 *
 * ⭑ That recording is the whole of the 08-25 fix. It was the ONE bank in the
 * walk that never wrote itself down, so trackActiveBank stayed STALE on the
 * bank you arrived from (always AUTOMATION — the only neighbour), and the exit
 * restore, the co-run landing and "banks land somewhere I did not leave them"
 * all fell out of that single omission.
 *
 * The bank to come BACK to on a top-edge left turn is the half trackActiveBank
 * used to carry implicitly; it now has its own store, trackSoundOrigin.
 * Conductor tracks keep their own bank: they have no sound bank in the cycle,
 * and their screens key on banks 0/8/9/10. */
function takeBankIdentity(track) {
    if (GS.trackPadMode[track] === PMC) return;
    /* Remember where we came from BEFORE overwriting the live mirror, and only
     * on a genuine arrival — a retarget onto a track already on this bank must
     * not overwrite its origin with BANK_SOUND. */
    if (GS.activeBank !== BANK_SOUND && GS.trackActiveBank[track] !== BANK_SOUND)
        GS.trackSoundOrigin[track] = GS.activeBank | 0;
    GS.activeBank = BANK_SOUND;
    GS.trackActiveBank[track] = BANK_SOUND;
}

/* Where the JOG's top-edge left turn lands: the bank this track was entered
 * from, or — for a track restored from the sidecar already on it, or arrived at
 * by a track switch — the bank the jog would have come through anyway. ⚠ Only
 * the jog reads this. A CLOSE (Back and friends) goes to the DEFAULT bank. */
function soundOriginBank(track) {
    const o = GS.trackSoundOrigin[track];
    return (typeof o === 'number' && o >= 0 && o !== BANK_SOUND) ? (o | 0) : BANK_SOUND_PREV;
}

export function soundRetarget(track, slot) {
    flushForRetarget();
    takeBankIdentity(track);

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
    /* ⚠ A retarget collapses deep screens to the root — but if you were on the
     * BANK'S PROMPT it must leave you there. Switching tracks is not asking for
     * the menu, and promoting the prompt into it on every track step is the
     * other half of the same bug. */
    const wasPrompt = S.view === VIEW_PROMPT;
    const keepPlace = !leftMoveBus && S.view === VIEW_EDIT;
    if (leftMoveBus) {
        /* Leaving a Move bus: nothing about WHERE you were transfers, because
         * the rows aren't the same rows. Land on the new track's picker, on its
         * synth — not on an fx index that meant a bus insert a moment ago. */
        clearBusContext();
        S.view = wasPrompt ? VIEW_PROMPT : VIEW_BLOCKS;
        S.pickRow = 0;
        S.comp = 'synth';
        S.blockIdx = 1;
    }
    S.slot = slot;
    /* ⚠ SYNC to the physical key, do not assume it is up. Clearing this on a
     * retarget made Shift+jog a ONE-SHOT: stepping a track retargets, the
     * retarget forgot Shift was still down, and the next turn was read as an
     * unshifted jog that moved the cursor instead of the track. Shift is a
     * physical state — a stale copy is wrong, not safe. davebox tracks it
     * globally (soundOnCC passes the CC through for exactly that reason). */
    S.shiftHeld = GS.shiftHeld === true;
    S.touchedIdx = -1;
    S.turnedSinceTouch = false;
    resetKnobAsn();
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

/* Where you land, in one place, because there are three different answers and
 * they used to be spread across the call sites:
 *
 *   soundExit()                — a deliberate CLOSE: the bank you CAME FROM.
 *                                Back, Shift+Note/Session, a view change, co-run
 *                                taking the OLED.
 *                                ⚠⚠ SUPERSEDED 2026-08-26. This used to land on
 *                                the track's DEFAULT bank, per Josh 2026-08-25:
 *                                "back inside a bank should always go to the
 *                                default bank." He RETIRED that on 2026-08-26 —
 *                                "we can get rid of the back goes to default
 *                                bank entirely" — after living with the gesture
 *                                return, which lands you where you pressed. Two
 *                                ways out that disagreed about where "out" is
 *                                was the thing that felt wrong; now there is one
 *                                answer everywhere: you go back where you came
 *                                from. Do not reinstate BANK_DEFAULT here.
 *   soundExit({landOn: n})     — an explicit destination: the JOG's top-edge
 *                                left turn, and the gesture return. Same law as
 *                                the default above, just named outright.
 *   soundExit({leaving: true}) — going somewhere the track comes WITH us from
 *                                (the track switch). The outgoing track STAYS
 *                                recorded on this bank, so returning returns
 *                                here.
 */
export function soundExit(opts) {
    const _opts = (opts && typeof opts === 'object') ? opts : {};
    const _leaving = _opts.leaving === true;
    /* Any exit at all spends the gesture crumb. A crumb that outlives its screen
     * is how a return point goes stale and lands you somewhere you never were —
     * see the note on genReturn in ui_state. */
    GS.genReturn = null;
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
        engineSetSlotParam(w.slot, w.key, w.int ? String(w.val) : w.val.toFixed(3));
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
    /* Exit-flush is UNVERIFIED — soundTick stops running, so in-flight
     * entries could never be checked. Accepted residual risk of the
     * fire-and-forget mailbox on the way out. */
    S.inflight.length = 0;
    /* ⚠ The editor must be told, not just stopped being drawn: its exit is
     * where the knob-ring LEDs are handed back (shadow_restore_knob_leds +
     * both LED cache invalidations). Leaving sound mode without it strands the
     * rings lit — the same class as the 08-26 linger, which was a missed
     * teardown rather than a painter bug. Asked of the BINDING, not of ppOn: if
     * the two ever disagree the binding's answer is the one that owns the LEDs. */
    if (ppOn || paramPagesActive()) { exitParamPages(); ppOn = false; }
    /* ⚠ The editor's navigation crumbs die with the session. A stale one would
     * swallow a Back or retrace to a screen from a previous visit — the failure
     * this whole pass was about, arriving by a different door. */
    ppAteBackPress = false; ppDivedOut = false; ppErrandView = null;
    ppSuppressOnce = false; ppRestorePage = null;
    if (S.busLevelDirty) engineSaveState();
    S.active = false;
    /* CLOSING hands the bank back; LEAVING keeps it. On a close the track stops
     * being on SOUND + CONFIG — in the live mirror AND in trackActiveBank,
     * which now records this bank like any other, so the two must move together
     * or the next load/switch would put you straight back on a screen you just
     * closed. The origin crumb is spent either way it is read, so it is dropped
     * here and re-earned by the next entry. */
    if (!_leaving && !soundIsGlobal() && S.track >= 0) {
        /* No explicit destination ⇒ the bank this track was entered from.
         * soundOriginBank() already falls back sensibly when there is no crumb
         * (the neighbour the jog would have come through), so a close never has
         * to invent a bank. See the docblock above for why BANK_DEFAULT is gone. */
        const _back = (typeof _opts.landOn === 'number') ? (_opts.landOn | 0)
                                                         : soundOriginBank(S.track);
        if (GS.trackActiveBank[S.track] === BANK_SOUND)
            GS.trackActiveBank[S.track] = _back;
        if (GS.activeBank === BANK_SOUND && S.track === GS.activeTrack)
            GS.activeBank = _back;
        GS.trackSoundOrigin[S.track] = -1;
    }
    /* A global bus (Master/Send FX) never took a track's bank, but it can be
     * open while activeBank still reads BANK_SOUND from a track flavour that
     * preceded it. RESYNC from the record rather than picking a bank: if the
     * active track really is recorded on SOUND + CONFIG then BANK_SOUND is the
     * truth, and the tick invariant re-opens its screen the moment track view
     * is showing. Forcing a default here instead would leave the live mirror
     * disagreeing with the record — the track's screen would not come back. */
    if (GS.activeBank === BANK_SOUND && !_leaving)
        GS.activeBank = GS.trackActiveBank[GS.activeTrack] | 0;
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
            /* A bus level addresses a component (`move_fx:N`); a SLOT level is
             * in the slot: namespace and has no component. One row kind, two
             * backing stores — see SLOT_LEVELS. */
            const raw = parseFloat(r.spec.slot
                ? engineGetSlotParam(S.slot, r.spec.key)
                : engineGet(S.slot, r.spec.comp, r.spec.key));
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

/* ⚠ Renamed in spirit, 2026-08-24: these no longer touch host_vol_block.
 * The knob CLAIM rides the Shift key globally (ui_input_cc's MoveShift
 * handler) — plain volume is Move's main output everywhere now, and
 * Shift+volume is the active track's volume. What remains here is the
 * per-context level cache (seed on entry/retarget) and the save flush. */
function claimVolume(slot) {
    S.volLevel = readSlotVolume(slot);
    S.volShownUntil = -1;
    S.volTouched = false;
    S.volDirtySave = false;
}

function releaseVolume() {
    flushVolumeSave();
    S.volTouched = false;
    S.volShownUntil = -1;
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
/* ⭐ WHICH USER PRESET THIS COMPONENT IS ON — the thing davebox never tracked,
 * and the reason its My Presets page could only offer "Presets" and "Save As".
 * Stock's page is Preset / Save / Save As / Delete, and three of those four need
 * an answer to "on what?": Save overwrites it, Delete removes it, and the Preset
 * row NAMES it.
 *
 * ⭑ `hash` is the state as it was when the preset was loaded or saved, so
 * "modified since" is a hash compare against the live state rather than a file
 * read — the same thing stock's `*` means. Keyed by slot AND component: the same
 * module in two slots is two independent answers.
 *
 * ⭑ PERSISTED since 2026-08-31: the record rides the UI sidecar (`upr` in
 * ui_persistence's writeSidecar), which is already the per-project file that
 * survives a relaunch — davebox's answer to stock riding slot_N.json. The live
 * map is GS.presetRec so the sidecar owns it wholesale: restoreUiSidecar
 * REPLACES it on every project load, which also closes the leak this map had
 * while session-lived — keyed by position, not by set, a project switch kept
 * the old project's records attached to the new project's slots.
 *
 * ⭑ `hash` (shared current_preset.mjs, FNV-1a over the blob) replaced the full
 * `blob` the record used to carry — a hash can live in the sidecar, a blob
 * cannot. Same discipline as before on what gets hashed: the read-back from
 * the device, never the string we wrote, because a module is free to normalise
 * state on the way in. And isModified inherits the shared module's rule that
 * an UNKNOWN never becomes a `*` — the old string compare here read a FAILED
 * engineGetState (null) as "modified", which was a lie.
 *
 * ⚠ `mod` is checked LAZILY, at the accessor: a sidecar can be older than the
 * slot it describes (the module swapped by anything that is not this editor),
 * and restore-time is too early to ask — module identity seeds async, and a
 * one-shot decision gated on async state must WAIT for the state (the
 * custom-panels race). The accessor runs when the editor is OPEN on the
 * component, when S.moduleId is real. */
const presetRecKey = () => S.slot + ':' + S.comp;
function presetRecord() {
    const r = GS.presetRec[presetRecKey()] || null;
    if (r && r.mod && S.moduleId && r.mod !== S.moduleId) {
        /* Stale: the slot holds a different module than the record was made
         * against. Drop it — a record must never offer another module's file
         * as this module's Save/Delete target. */
        setPresetRecord(null);
        return null;
    }
    return r;
}
function setPresetRecord(rec) {
    if (rec) GS.presetRec[presetRecKey()] = rec;
    else delete GS.presetRec[presetRecKey()];
    /* Records change on explicit, rare gestures (load/save/delete/module
     * pick), so each one is worth a synchronous sidecar write — the guards in
     * writeSidecar cover the mid-switch windows. */
    writeSidecar();
}
/* Test hook: point the record accessors at a (slot, comp, module) and hand
 * them over — the guard in presetRecord (stale `mod` drops the record) can
 * only be proven to fire through the accessor itself, and a guard never
 * exercised is a bug report, not a guard. */
export function soundPresetRecForTest(slot, comp, moduleId) {
    S.slot = slot; S.comp = comp; S.moduleId = moduleId;
    return { get: presetRecord, set: setPresetRecord };
}
/* Has the sound moved since it was loaded or saved? */
function presetDirty() {
    const r = presetRecord();
    if (!r) return false;
    return isModified(r, engineGetState(S.slot, S.comp));
}
/* What the Preset row shows: the name, marked when modified — stock's `*`. */
function presetRowValue() {
    const r = presetRecord();
    if (!r) return '(none)';
    return (presetDirty() ? '* ' : '') + r.name;
}

function openPresets() {
    S.presetMsg = '';
    /* Built fresh each time: the baked row only exists for modules that publish
     * a bank. "Module Menu" is always here, which is also why this picker is
     * never a one-row dead click any more — the old skip-straight-to-user
     * special case is gone, so Back always retraces through here. */
    S.srcRows = [{ kind: 'user', label: 'User Presets' }];
    if (S.presetSpec) S.srcRows.push({ kind: 'baked', label: modLabel() + ' Presets' });
    S.srcRows.push({ kind: 'menu', label: 'Module Menu' });
    /* Swap Module: the same thing Shift+click does on the block picker, offered
     * here as a plain row (Josh, 2026-08-24). Shift+click is fine when you are
     * LOOKING at the block list — the modifier reads as "not that block, the
     * question of what it is". Inside a module's own canvas there is no block
     * list on screen to shift-click, so without this row the gesture is simply
     * unreachable from where you are. Last in the list, because it is still the
     * destructive one: it throws away the sound you are editing. */
    S.srcRows.push({ kind: 'swap', label: 'Swap Module' });
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
    const p = S.userPresets[S.userIdx - 1];
    /* The sound IS this preset now — remember which, so Save/Delete have a
     * target and the Preset row has a name. */
    if (p) setPresetRecord({ name: p.name, path: p.path, mod: S.moduleId,
                             hash: hashState(engineGetState(S.slot, S.comp)) });
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
    setPresetRecord({ name, path, mod: S.moduleId, hash: hashState(stateJson) });
}

/* Overwrite the preset this component is on, in place and under its own name —
 * stock's Save, as against Save As. ⚠ davebox's saveUserPreset deliberately
 * NEVER overwrites (uniqueName/uniquePath: a collision gets a number), which is
 * right for Save As and is exactly what Save must not do. */
function overwriteUserPreset() {
    const r = presetRecord();
    if (!r) { S.presetMsg = 'NO PRESET'; return; }
    const stateJson = engineGetState(S.slot, S.comp);
    if (!stateJson) { S.presetMsg = 'NO STATE'; return; }
    let state;
    try { state = JSON.parse(stateJson); } catch (e) { state = stateJson; }
    const ok = host_write_file(r.path, JSON.stringify({
        name: r.name, module: S.moduleId, version: 1, state,
    }));
    S.presetMsg = ok ? 'SAVED' : 'SAVE FAILED';
    if (!ok) return;
    setPresetRecord({ name: r.name, path: r.path, mod: S.moduleId,
                      hash: hashState(stateJson) });
    S.origState = null;
    S.userPresets = engineListUserPresets(S.moduleId);
}

/* Delete the preset this component is on. */
function deleteRecordedPreset() {
    const r = presetRecord();
    if (!r) { S.presetMsg = 'NO PRESET'; return; }
    let ok = false;
    try { ok = (os.remove(r.path) === 0); } catch (e) { ok = false; }
    S.presetMsg = ok ? 'DELETED' : 'DELETE FAILED';
    if (!ok) return;
    /* The sound stays; only the file it came from is gone. */
    setPresetRecord(null);
    S.userPresets = engineListUserPresets(S.moduleId);
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
    const wasActive = S.active;
    if (S.active) flushForRetarget();
    S.active = true;
    takeBankIdentity(track);
    /* Only a genuine ENTRY opens the banks' display window. Arriving here as the
     * track-FOLLOW — Shift+jog stepping onto a Move-routed track, ui_tick's
     * reconcile block — is not a bank gesture, and stamping made the SOUND +
     * CONFIG screen jump back over the track overview on every such step while
     * every other bank stayed put. soundRetarget, the chain-side twin of this
     * call, has never stamped; this is the two paths agreeing. (Josh, 2026-08-24) */
    if (!wasActive) armBankDisplay();   /* same display window as soundEnter */
    S.enterSession = false;
    S.track = track;
    S.slot = 0;                 /* move_fx: keys ignore the slot argument */
    S.bus = moveBusFor(track);
    S.busIdx = 0;
    S.busLevelEditing = false;
    S.busLevelDirty = false;
    /* ⭑ THE BANK'S PROMPT, exactly as soundEnter does. Both flavours arrive by
     * the same door — the jog reaching SOUND + CONFIG, a track switch, the tick
     * reconcile — so both must land on the same screen. Missing this here was
     * the bug Josh hit on device: a MOVE-routed track walked straight into the
     * full menu while a Schwung one stopped at the prompt, and the gesture,
     * which enters through this same path, looked broken on Move tracks. */
    S.view = VIEW_PROMPT;
    S.pickRow = 0;
    S.comp = '';                /* no chain component is in scope on a Move bus */
    /* Sync, never assume up — see the note in soundEnter. */
    S.shiftHeld = GS.shiftHeld === true;
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
/* The Shift key is the volume gesture now; its RELEASE is the end of it and
 * the one moment worth persisting (saving is a synchronous file write). */
export function soundVolGestureEnd() { if (S.active) flushVolumeSave(); }

/* Open a track's GENERATOR editor in one press — sound mode, then straight into
 * the generator's own canvas UI, without walking the block picker.
 *
 * ⭑ "Generator", not "instrument". A track's INSTRUMENT is its DESTINATION (the
 * `Track to` row, TRACK_OWNS_ITS_INSTRUMENT.md); the thing with a canvas UI on a
 * Schwung-routed track is the Generator block. Josh asked for "instrument edit"
 * in the everyday sense — this is the row he means.
 *
 * ⚠ The open is QUEUED, not done here: openBlock() runs discovery, which reads
 * params, and this is called from a MIDI handler. Same rule as every other
 * pendingAction on this screen.
 *
 * Returns false when the track has no generator to open (an empty block), so the
 * caller can say so rather than leaving the user on a picker they did not ask
 * for. */
/* Return from a GESTURE-entered generator editor to wherever the gesture was
 * pressed (Josh, 2026-08-26). Two answers, one rule — the return point is the
 * place you pressed from:
 *   pressed from a normal bank  -> LEAVE sound mode, land on that bank
 *   pressed while already in it -> stay in sound mode, back on the picker
 * ("always leaves sound mode entirely unless you were already in sound mode").
 *
 * ⚠ SCOPED TO THE GESTURE, deliberately. Josh ruled on 2026-08-25 that "back
 * inside a bank should always go to the default bank" — that is SOUND + CONFIG
 * behaving like every other bank, and it stays exactly as it was. This is a
 * shortcut to a LEAF, so it retraces the shortcut; it is not the bank walk.
 *
 * Returns false when no gesture crumb is armed, so every ordinary Back and Menu
 * falls through to the behaviour it has always had. */
export function soundGestureReturn() {
    const g = GS.genReturn;
    if (!g || !S.active) return false;
    if (g.track !== S.track) { GS.genReturn = null; return false; }
    GS.genReturn = null;                      /* spent, whichever way it goes */
    if (g.wasActive) {
        /* ⭑ The SCREEN you pressed from, not just "the menu". After the respec
         * the bank has a prompt of its own, and pressing the gesture there and
         * being returned to the MENU would be a screen you were never on.
         * Older crumbs carry no `view`; they mean the menu, which is what it
         * always used to be. */
        S.view = (g.view === VIEW_PROMPT) ? VIEW_PROMPT : VIEW_BLOCKS;
        S.pendingAction = { t: 'names' };
        S.presetMsg = '';
        S.dirty = true;
    } else {
        soundExit({ landOn: g.bank });        /* out, onto the bank you pressed from */
    }
    return true;
}

export function soundGestureArmed() { return !!GS.genReturn; }

export function soundOpenGenerator(track) {
    soundEnter(track, slotIndex(track));
    if (!engineLoadedModule(S.slot, 'synth')) {
        /* NOTHING LOADED: go straight to the module picker (Josh, 2026-08-27).
         * It used to return false, and the caller dropped you on the block list
         * with a popup saying to pick one — an instruction where the picker
         * itself would do. The gesture means "edit this track's sound"; with no
         * sound yet, choosing one IS the edit.
         *
         * ⭑ Wording: INSTRUMENT since 2026-08-27. The rule that a track's
         * INSTRUMENT is its DESTINATION still holds — the destination row simply
         * carries the name now, so there is no longer a second thing competing
         * for it. Before that rename this said GENERATOR, deliberately.
         * ⚠ 118px in the header font against drawKitHeader's 124px budget. */
        S.pendingAction = { t: 'browse', comp: 'synth', prompt: 'SELECT INSTRUMENT' };
        return true;
    }
    S.pendingAction = { t: 'open', comp: 'synth' };
    return true;
}

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
    /* Flush any pending level save for the track we came from (the knob
     * itself is Move's unless Shift is held — nothing to hand back). */
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

/* Move the pick cursor by `delta`, stepping OVER grouping rules — they are real
 * rows so the list geometry stays a simple grid, but they are not stops. Bounded
 * by the row count so a list of nothing but rules cannot spin. */
function pickStep(delta) {
    const n = S.pickRows.length;
    if (!n) return 0;
    let i = S.pickRow;
    for (let guard = 0; guard < n; guard++) {
        i = listMove(n, i, delta);
        if (!S.pickRows[i] || S.pickRows[i].kind !== 'div') return i;
    }
    return S.pickRow;
}

function buildPickRows() {
    const rows = [];
    if (S.bus) {
        /* A Move bus leads with its instrument: the thing you came to edit is
         * Move's own synth, and the inserts hang off it exactly as a slot's FX
         * hang off its sound generator. Jog-click hands over to Move's editor
         * (co-run) — there is no module to browse, Move owns that voice. */
        if (S.bus.kind === 'move') {
            /* A Move-routed track is still a TRACK: its destination belongs at
             * the top of its screen exactly as on a Schwung one. Without this
             * the bus flavour had no `Track to` at all, so a Move track could
             * not be re-routed from Track Control — the same gap the EXT case
             * had, in the other flavour. ⚠ Master/Send buses do NOT get it:
             * they are entered from the session FX list, not from a track. */
            rows.push({ kind: 'trackto', label: 'Instrument' });
            rows.push({ kind: 'movesynth', label: 'Generator', value: 'Move ' + S.bus.bus + ' >' });
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
        rows.push({ kind: 'trackto', label: 'Instrument' });
        /* An EXT-routed track (MIDI out, or playing another track's instrument)
         * has no chain and no bus, so it has no sound to show and no mixer
         * position to set — every other row here would be backed by nothing.
         *
         * The screen is therefore just its destination. That is not a
         * placeholder: it is what an EXT track HAS, and it is the row you need
         * to route it back. Track Control stays open on these tracks precisely
         * so that is reachable (see the follow in ui_tick). */
        if (GS.trackRoute[S.track] === 2) { S.pickRows = rows; S.pickRow = 0; return; }
        for (const i of S.blockRows) {
            rows.push({ kind: 'block', comp: BLOCKS[i].comp, label: BLOCKS[i].label, blockIdx: i });
        }
        /* The slot's LEVELS, inline and immediately after the chain — the same
         * five rows a Move bus shows, in the same place, because a slot and a
         * bus are alternative occupants of one mixer position. They sat behind
         * a settings door until now, which meant the identical controls read
         * one way on a Move track and another on a Schwung one.
         *
         * Sends are capability-gated: a host without send buses would otherwise
         * offer two rows backed by nothing. */
        for (const lv of SLOT_LEVELS) {
            if (lv.cap === 'sends' && !S.capSends) continue;
            rows.push({ kind: 'buslevel', label: lv.label, spec: lv });
        }
        /* Doors last, presets last of all (Josh). "Presets" not "patches" in
         * user-facing text — the store is still the host's patches/ dir. */
        rows.push({ kind: 'settings', label: 'Sound Control' });
        rows.push({ kind: 'config',   label: 'Config' });
        rows.push({ kind: 'patches',  label: 'Presets' });
    }
    /* ---- grouping rules, each on a row of its own ----
     *
     * Three groups: DESTINATION | the chain | the mixer position — and then the
     * doors, which are left unseparated (Josh: no rules between the submenus).
     *
     * Inserted by ROLE, not index: which rows exist varies with flavour, the FX
     * capability probe and the sends gate, so a fixed index would put a rule in
     * the wrong place on half the hosts. Never after the last row.
     *
     * ⚠ These are REAL rows, so every index-based path has to step over them —
     * see pickStep() and the cursor restore below. */
    const _lastOf = (k) => { let i = -1; rows.forEach((r, n) => { if (r.kind === k) i = n; }); return i; };
    const _after = [_lastOf('trackto'), _lastOf('block'), _lastOf('buslevel')]
        .filter(i => i >= 0 && i < rows.length - 1)
        .sort((a, b) => b - a);                 /* descending: splice from the end */
    for (const i of _after) rows.splice(i + 1, 0, { kind: 'div' });

    S.pickRows = rows;
    /* Keep the cursor on the component it was on — the row INDEX shifts when a
     * host lacks fx3/4, and a bus context has different rows entirely. */
    const at = rows.findIndex(r => r.kind === 'block' && r.comp === S.comp);
    if (at >= 0) S.pickRow = at;
    if (S.pickRow >= rows.length) S.pickRow = 0;
    /* Never rest on a rule. */
    if (rows[S.pickRow] && rows[S.pickRow].kind === 'div') S.pickRow = pickStep(1);
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
    /* ⚠ Deliberately does NOT set S.slotRows. The settings screen owns its own
     * row set (openSlotCfg picks Sound Control or Config), and probeCaps runs on
     * entry and on every retarget — assigning here would swap the rows out from
     * under an open Config list on a track change. The sends gate that used to
     * live here now applies to the top-level LEVEL rows (see buildPickRows). */
    log('caps: fx34=' + (S.capFx34 ? 1 : 0) + ' sends=' + (S.capSends ? 1 : 0));
}

/* ---- slot settings: read, edit, persist ---- */

function openSlotCfg(keepCursor, which) {
    /* One screen, two row sets. `which` is remembered so a return from a
     * sub-editor (Knobs, LFO) reopens the list it came from rather than
     * whichever was opened last. */
    if (which) S.cfgWhich = which;
    S.slotRows = S.cfgWhich === 'config' ? configRows(S.track) : SOUND_CONTROL;
    S.slotCfgVals = S.slotRows.map(s => {
        if (s.sub) return 0;            /* no stored param behind these rows */
        /* A row with `get` owns its own value (davebox state + the DSP); one
         * without it is backed by a host slot param. */
        if (s.get) { const g = s.get(); return isFinite(g) ? g : 0; }
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
    let v;
    if (s.opts) {
        /* Enum: step the option list, CLAMPED at the ends. This used to wrap,
         * with a comment defending it for short closed sets — overridden by
         * Josh 2026-08-23: settings values stop at the beginning and end of
         * their lists, everywhere, so a scroll can never overshoot onto the
         * opposite extreme. (An end is one detent away from anywhere in a
         * 3-option set; nothing is stranded.) */
        const cur = s.opts.indexOf(S.slotCfgVals[S.slotCfgIdx]);
        v = s.opts[Math.max(0, Math.min(s.opts.length - 1, cur + (delta > 0 ? 1 : -1)))];
    } else {
        v = S.slotCfgVals[S.slotCfgIdx] + (delta > 0 ? s.step : -s.step);
        if (s.int) v = Math.round(v);
        else v = Math.round(v * 1000) / 1000;  /* keep 0.05 steps from drifting */
        if (v < s.min) v = s.min;
        if (v > s.max) v = s.max;
    }
    if (v === S.slotCfgVals[S.slotCfgIdx]) return;
    S.slotCfgVals[S.slotCfgIdx] = v;
    /* A row with `set` applies immediately and is persisted by whatever that
     * setter uses (the DSP param, or the sidecar). Only slot-backed rows go
     * through the queue and the chain save.
     * ⚠ Except a commit-on-click row: scrolling it must PREVIEW, never apply —
     * passing over `Drums` would otherwise convert the track. */
    if (s.commitOnClick) { S.dirty = true; return; }
    if (s.set) { s.set(v); S.dirty = true; return; }
    S.slotCfgDirty = true;
    queueSlotCfgWrite(s.key, v, !!s.int);
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
 * from this queue was the MPE row's `synth:mpe_enabled`, which went with it.
 *
 * `isInt` rides on the queued item rather than being looked up from a row table
 * at drain time. There are THREE drains (tick, the leave-flush, and the
 * per-tick queue) and each used to re-find the row to decide int-vs-fixed — so
 * a row that moved out of that table silently started writing "1.000" where the
 * host parses with atoi, and a mute would read as a level. The producer is the
 * one place that knows. */
function queueSlotCfgWrite(key, val, isInt) {
    for (const w of S.pendingSlotWrites) {
        if (w.key === key && w.slot === S.slot && !w.chain) { w.val = val; return; }
    }
    S.pendingSlotWrites.push({ slot: S.slot, key: key, val: val, int: !!isInt });
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
        engineSetSlotParam(w.slot, w.key, w.int ? String(w.val) : w.val.toFixed(3));
    }
}

function renderSlotCfg() {
    /* hdr: these are the track's OWN structure, so they take the header font
     * the top level uses. Without it the same component rendered them in the
     * thin label font and the submenu read as a different screen. */
    renderInChain(S.slotRows.map((s, idx) => (s.sub
        ? { label: s.label, hdr: true, chevron: true }
        : { label: s.label, hdr: true, value: s.fmt(S.slotCfgVals[idx]),
            editing: idx === S.slotCfgIdx && S.slotCfgEditing })),
        S.slotCfgIdx);
}

/* ---- knob editor (P7 absorb) --------------------------------------------
 * Same param model as the host's editor: read knob_{N}_target/_param, write
 * knob_{N}_set ("target:param") / knob_{N}_clear. All engine reads run from
 * tick via pendingAction; edits go through the slot-write queue. */

/* ── ONE title formula for every screen scoped to a track ──
 *
 * The (n) marker the approved top level uses, then the screen's own name.
 * ⚠⚠ NOT "TRACK n - NAME": that measured 160px against drawKitHeader's real
 * 124px limit, so "TRACK 5 - SOUND CONTROL" clipped to "TRACK 5 - SOUND C" on
 * the device with nothing on screen to say so. "(5) SOUND CONTROL" is 112px.
 * ⚠ ROUND brackets — the header font has no square ones; they advance the
 * cursor and draw nothing. */
function trackTitle(name) { return '(' + (S.track + 1) + ') ' + name; }

function readKnobAsn(i) {
    return {
        target: engineGetChainParam(S.slot, 'knob_' + (i + 1) + '_target') || '',
        param:  engineGetChainParam(S.slot, 'knob_' + (i + 1) + '_param') || '',
    };
}

/* Every assignment belongs to ONE slot, so a retarget must drop the lot. A
 * stale entry here is the silent kind of wrong: the HUD would name the previous
 * track's mapping over the new track's knob. */
function resetKnobAsn() {
    S.knobAsn = [null, null, null, null, null, null, null, null];
    S.knobMeta = {};
    S.asnLoadFor = -1;
    S.asnStage = 0;
    S.asnCell = null;
    S.asnCellFor = -1;
    S.asnValNum = null;
    S.asnLastDir = 0;
    S.asnRevealed = false;
}

function openKnobEditor() {
    for (let i = 0; i < NUM_KNOBS; i++) S.knobAsn[i] = readKnobAsn(i);
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
        targets.push({ id, name: String(name), slot: label });
    };
    probe('midi_fx1', 'MIDI FX');
    probe('synth', 'Synth');
    for (let i = 1; i <= 4; i++) probe('fx' + i, 'FX' + i);
    return qualifyDuplicates(targets);
}

/* ⭑ The rows name the MODULE, not "<slot>: <module>" (Josh, 2026-08-27): the
 * combined form is what made this screen read as something other than "pick the
 * module", which is all it does.
 *
 * ⚠⚠ But the slot prefix was accidentally carrying DISAMBIGUATION. Nothing stops
 * the same module being loaded in two FX slots — the probes above are
 * independent — and two rows both saying "RRVerb-10" cannot be told apart.
 * So the slot comes back ONLY where a name repeats, as a `qual` (movy small)
 * rather than in the name itself: the qualifier appears exactly when it carries
 * information, and the common case stays clean.
 *
 * Only fx1..fx4 can ever collide — synth and midi_fx1 are one each — but this
 * counts names rather than assuming that, so adding a second MIDI FX slot later
 * cannot silently reintroduce the ambiguity. */
function qualifyDuplicates(rows) {
    const seen = Object.create(null);
    for (const r of rows) {
        if (!r.slot) continue;
        seen[r.name] = (seen[r.name] || 0) + 1;
    }
    for (const r of rows) {
        if (r.slot && seen[r.name] > 1) r.qual = r.slot;
    }
    return rows;
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

/* ⭑ A component's SHORT form, for anywhere a target and a param are shown
 * together (Josh, 2026-08-27). `synth: cutoff` is 82px in the movy font against
 * a value column that has ~54px on the KNOBS screen — so the row's own LABEL was
 * being eaten to make room, and at the long end it truncated on the full screen
 * as well as in a box. `Syn>cutoff` is 69px, and the `>` reads as "inside".
 *
 * ⚠⚠ DISPLAY ONLY. The wire format is unchanged and must stay `target:param`
 * with the raw component id — `knob_<n>_set` is parsed by the chain DSP, and
 * `lfo<n>:target` is a param value. Shortening either would write a component
 * id that does not exist. This function is called from render paths only. */
/* ⭑⭑ ONE table owns what a component is CALLED, in both forms it is shown in.
 * They differ because the space does: the knob HUD gives a component a centred
 * line of its own across a 116px card, while an inline value shares its row with
 * a param name and a label. Two tables keyed on the same ids is a second source
 * of truth — add `fx5` to one and the other keeps saying `FX5` by fallthrough,
 * which is the shape of bug a table catches and only a SCAN would have found.
 *   `wide`  — the HUD's own line, and anywhere a component is named alone.
 *   `short` — inline, beside a param.
 * ⚠ Unknown ids pass through rather than being mangled: a component this table
 * has not heard of is better shown by its real id than by a guess. */
const COMPONENT_NAMES = {
    synth:    { wide: 'SYNTH',   short: 'Syn' },
    fx1:      { wide: 'FX 1',    short: 'FX1' },
    fx2:      { wide: 'FX 2',    short: 'FX2' },
    fx3:      { wide: 'FX 3',    short: 'FX3' },
    fx4:      { wide: 'FX 4',    short: 'FX4' },
    midi_fx1: { wide: 'MIDI FX', short: 'MFX1' },
    midi_fx2: { wide: 'MIDI FX 2', short: 'MFX2' },
    lfo1:     { wide: 'LFO 1',   short: 'LFO1' },
    lfo2:     { wide: 'LFO 2',   short: 'LFO2' },
};
function compShort(id) {
    const e = COMPONENT_NAMES[id];
    return e ? e.short : String(id || '');
}
function compWide(id) {
    const e = COMPONENT_NAMES[id];
    return e ? e.wide : String(id || '').toUpperCase();
}
function compParamLabel(target, param) {
    return (target && param) ? compShort(target) + '>' + param : '';
}

function knobAsnLabel(a) {
    return (a && a.target && a.param) ? compParamLabel(a.target, a.param) : '(None)';
}

function commitKnobAssignment(target, param) {
    const n = S.knobIdx + 1;
    S.knobAsn[S.knobIdx] = { target: target || '', param: param || '' };
    /* The cell and the value belonged to the OLD param — a number from a
     * different control, and a step law derived from a different range. Force
     * the whole load to re-run rather than clearing the pieces one by one. */
    if (S.asnCellFor === S.knobIdx) {
        S.asnCell = null; S.asnCellFor = -1; S.asnValNum = null;
    }
    if (S.asnLoadFor === S.knobIdx) S.asnStage = 0;
    if (target && param) queueChainWrite('knob_' + n + '_set', target + ':' + param);
    else queueChainWrite('knob_' + n + '_clear', '1');
    S.view = VIEW_KNOBS;
}

/* ── where a screen SITS in the tree ───────────────────────────────────────
 *
 * The Back handler already knew every one of these edges — as twenty branches
 * each naming its own parent. That is fine while Back is the only thing that
 * needs to know, and stops being fine the moment anything ELSE does: a
 * breadcrumb has to name the path you took, and an overlay stack has to know
 * how deep it is. Both would have to re-derive what the handler already
 * encodes, and a second copy of a tree agrees with the first only until one
 * of them is edited.
 *
 * So the PURE step-up edges are data, and Back reads this table for them.
 *
 * ⚠ Only the pure ones. Several Back branches do more than step up — they
 * revert an audition, retrace an entry gesture, close an edit before leaving,
 * or hand off through `pendingAction` — and those stay written out, because
 * what they do is not "go to my parent". A table that pretended otherwise
 * would be a tidier-looking lie.
 *
 * ⭑ `crumb` is what this screen is called in a breadcrumb, which is NOT its
 * header: a header can spend the full width, a crumb shares 116px with the rest
 * of the path. A function where the name depends on state. */
const VIEW_TREE = {
    /* `float`   — this screen renders as an overlay box over its chain's root.
     *             FALSE for a screen whose content is not a list: the spec's own
     *             exception, and LFO is the case — its live waveform strip lives
     *             at y49-62, which an overlay box would simply cover.
     * `backPure` — Back may step to `parent` straight from this table. Only for
     *             screens whose Back does NOTHING else; the rest keep their own
     *             branch, because reverting an audition or re-opening a parent
     *             with its state is not "go to my parent".
     * `crumb`   — what this screen is called in a breadcrumb, which is not its
     *             header: a header can spend the full width, a crumb shares
     *             116px with the rest of the path. */
    [VIEW_SLOTCFG]:     { parent: null,            float: true,
                          /* ⚠ 'Snd', not 'Sound' — measured, not taste. At the
                           * full word the knob-param path is 122px against a
                           * 116px bar and the LFO-target path is 117px, i.e.
                           * over by ONE pixel; both then drop a crumb. 'Snd'
                           * saves 10px and both fit. 'Config' needs no such
                           * help: its own paths are 78px at the deepest. */
                          crumb: () => (S.cfgWhich === 'config' ? 'Config' : 'Snd') },
    [VIEW_KNOBS]:       { parent: VIEW_SLOTCFG,    float: true,  crumb: () => 'Knobs' },
    [VIEW_LFO]:         { parent: VIEW_SLOTCFG,    float: true,
                          crumb: () => 'LFO ' + (S.lfoNum + 1) },
    [VIEW_KNOB_TARGET]: { parent: VIEW_KNOBS,      float: true, backPure: true,
                          crumb: () => 'K' + (S.knobIdx + 1) },
    [VIEW_KNOB_PARAM]:  { parent: VIEW_KNOB_TARGET, float: true, backPure: true,
                          /* ⚠ Falls back: the target is empty until one is
                           * chosen, and now that the current screen IS the last
                           * crumb, an empty one would silently drop the tail of
                           * the path rather than merely look odd. */
                          crumb: () => compShort(S.knobTarget) || 'Param' },
    [VIEW_LFO_TARGET]:  { parent: VIEW_LFO,        float: true, backPure: true,
                          crumb: () => 'Target' },
    [VIEW_LFO_PARAM]:   { parent: VIEW_LFO_TARGET, float: true, backPure: true,
                          crumb: () => 'Comp' },
    /* ⚠ VIEW_EDIT is tabled so the preset screens can NAME it in a crumb, but it
     * does NOT float and is never drawn as a backdrop: `renderEdit` hands the
     * whole frame to a hosted module canvas, and compositing over a surface that
     * paints everything itself is where this would flicker (the spec's rule).
     * renderInChain falls back to the blocks picker for it. */
    [VIEW_EDIT]:        { parent: null,            float: false,
                          crumb: () => modLabel() },
    [VIEW_BROWSE]:      { parent: null,            float: true,
                          crumb: () => 'Modules' },
    [VIEW_PRESET_SRC]:  { parent: VIEW_EDIT,       float: true,
                          crumb: () => 'Presets' },
    [VIEW_PRESET_BAKED]:{ parent: VIEW_PRESET_SRC, float: true,
                          crumb: () => 'Module' },
    [VIEW_PATCHES]:     { parent: null,            float: true,
                          crumb: () => 'Slot Presets' },
    [VIEW_BUSES]:       { parent: null,
                          /* full screen since 2026-09-01 — the S+C menu's dress */
                          crumb: () => 'Session FX' },
    [VIEW_ENUM]:        { parent: () => (S.enumPick ? S.enumPick.from : null),
                          float: true, backPure: true,
                          crumb: () => (S.enumPick ? S.enumPick.label : 'Value') },
};

/* Applying an Instrument choice. Extracted so the PICKER and the old
 * step-through path commit through one implementation — two copies of a write
 * that can retarget the screen is exactly the drift this tree keeps paying for.
 * Reads `S.instrSel`, which both paths set. */
function commitInstrChoice() {
    if (S.instrSel !== instrValueFor(S.track)) {
        /* ⭑ THE MERGE (Josh, 2026-08-27): choosing `Schwung` used to leave you
         * on the block list to notice the Generator row was empty and open it
         * yourself. Picking an instrument and picking WHICH is one intent, so
         * the module picker follows immediately — the same overlay the
         * empty-generator gesture opens. Consumed by `reflavour`, because the
         * browse has to happen AFTER the track has re-entered its new flavour. */
        if (S.instrSel === INSTR_SCHWUNG) S.browseAfterReflavour = true;
        applyInstrChoice(S.track, S.instrSel);
        /* The screen must FOLLOW the new destination immediately — a track just
         * switched to MIDI has no chain to show, and a switch between Schwung
         * and Move changes flavour entirely. tick's follow only fires when the
         * TRACK changes, and it did not; without this you had to leave and
         * re-enter to see the change. Deferred because re-entry reads params. */
        S.pendingAction = { t: 'reflavour' };
    }
    S.dirty = true;
}

/* ── the enum picker ───────────────────────────────────────────────────────
 *
 * The spec's law: a menu item adjusting an ENUM opens a picker; a CONTINUOUS
 * param is adjusted in place, because you do not need the list to know what a
 * filter cutoff is doing. This is the one picker that serves all of them —
 * slot config, the LFO, the instrument row — so a row only has to say what its
 * options ARE, not how to present them.
 *
 * ⚠ TWO options stay in place. A picker to choose between On and Off is a
 * screen to save one click, and §6 already says a two-state row toggles. The
 * threshold matches drawKitEnumOverlay's existing `options.length <= 2`, which
 * the canvas pickers have used since before any of this.
 *
 * `commit(i)` is the row's own setter, so the picker never needs to know what
 * it is editing — which is what lets one picker serve three screens. */
export function soundEnumPickable(options) { return !!options && options.length > 2; }
function openEnumPicker(label, options, sel, commit) {
    S.enumPick = { label, options, sel: Math.max(0, sel | 0), commit, from: S.view };
    S.view = VIEW_ENUM;
    S.dirty = true;
}
function closeEnumPicker(commitIt) {
    const p = S.enumPick;
    if (!p) return;
    if (commitIt && p.commit) p.commit(p.sel);
    S.view = p.from;
    S.enumPick = null;
    S.dirty = true;
}
function renderEnumPick() {
    renderInChain(S.enumPick ? S.enumPick.options : [], S.enumPick ? S.enumPick.sel : 0);
}

/* The path, INCLUDING the screen you are on, outermost first.
 *
 * ⚠⚠ It used to stop at the ancestors, on the reasoning that the current screen
 * is in front of you. That was wrong once the converted screens dropped their
 * headers: nothing then named where you WERE. Knobs and LFO 1 both read
 * "T3 > SOUND", and LFO 1 was indistinguishable from LFO 2 — Josh spotted it as
 * "why don't the lfo crumbs follow the knobs?", and they did: the RULE was the
 * problem, not the LFO's edges. Naming the current screen also makes the chains
 * symmetric, since each then names its own subject at the same depth.
 *
 * ⚠ Guarded against a cycle rather than trusting the table — a self-parent
 * would hang the render loop, which on this device means a dead UI and no
 * error anywhere. */
/* ⚠ `parent` may be a FUNCTION. Most screens sit at one place in the tree, but
 * the enum picker's parent is wherever it was opened from — it serves every
 * enum row in sound mode, so a static edge would be a lie. */
function treeParent(v) {
    const e = VIEW_TREE[v];
    if (!e) return null;
    return typeof e.parent === 'function' ? e.parent() : e.parent;
}

export function soundViewPath() {
    const self = VIEW_TREE[S.view];
    const out = self ? [self.crumb()] : [];
    let v = treeParent(S.view);
    for (let guard = 0; v != null && guard < 8; guard++) {
        const e = VIEW_TREE[v];
        /* ⚠ An UNTABLED ancestor contributes NOTHING — it does not get its view
         * NUMBER printed as a crumb. The blocks picker is the case: it is the
         * root everything falls back to, and it has no name of its own worth
         * showing, so the Instrument picker read "T3 > 0" on screen until this
         * stopped stringifying the enum. */
        if (e) out.unshift(e.crumb());
        v = treeParent(v);
    }
    return out;
}

/* How many boxes the stack draws: this screen plus every FLOATING ancestor up
 * to (not including) the first one that does not float. That non-floating
 * ancestor is the chain's ROOT — the screen drawn underneath and dimmed.
 * ⚠ A screen whose nearest ancestors all float has no root in the table at all;
 * the caller supplies the fallback (the blocks picker), which is the only screen
 * in sound mode that is always there. */
export function soundStackDepth() {
    if (!VIEW_TREE[S.view] || !VIEW_TREE[S.view].float) return 0;
    let d = 1, v = treeParent(S.view);
    for (let guard = 0; v != null && guard < 8; guard++) {
        const e = VIEW_TREE[v];
        if (!e || !e.float) break;
        d++; v = treeParent(v);
    }
    return d;
}

/* The screen drawn UNDER the stack: the nearest ancestor that does not float. */
function chainRootView() {
    let v = treeParent(S.view);
    for (let guard = 0; v != null && guard < 8; guard++) {
        const e = VIEW_TREE[v];
        if (!e || !e.float) return v;
        v = treeParent(v);
    }
    return null;
}

function renderKnobs() {
    /* Floats now: a submenu, and a plain list. The crumb says which track and
     * that you are in Knobs, so the header it used to draw is redundant. */
    renderInChain(S.knobAsn.map((a, i) =>
        /* `K1`..`K8`, not `Knob 1`: 13px against 34px, and the row's VALUE is the
         * part carrying information. With the long label the assignment was
         * eating into it — see compParamLabel. */
        ({ label: 'K' + (i + 1), hdr: true, value: knobAsnLabel(a) })),
        S.knobIdx);
}

/* A screen that sits IN a chain: the root screen behind it, knocked back, with
 * this screen's own box on top and the path named over the header.
 *
 * ⚠ `drawRoot` is the CHAIN'S ROOT, not the immediate parent — the layers
 * between are drawn as empty slivers, so nothing needs to render them. Passing
 * the parent instead would put its content on screen behind a box that already
 * covers it, for nothing.
 *
 * ⚠⚠ The root must be one of OUR draws, never a hosted module canvas:
 * `renderEdit` hands the whole frame to the module, and compositing over a
 * surface that paints everything itself is where this would flicker. Every
 * caller below is one of our own list screens. */
function renderInChain(rows, sel, emptyMsg, opts) {
    /* ⭐ A SCREEN THE MODULE EDITOR OPENED DRAWS AS A FULL SCREEN, like stock's.
     *
     * davebox floats a selection-only list over the screen you came from — Josh's
     * 2026-08-27 ruling, and right for the TRACK VIEW, where the thing behind it
     * is the bank you are choosing for. It is wrong here: stock's swap list and
     * preset browser are full screens, and the editor is supposed to be no
     * different from stock. Floating one over the BLOCK PICKER also shows a
     * backdrop you did not come through, since the editor cannot be the backdrop
     * (it hands the frame to the grid).
     *
     * ⚠ The track-view path is untouched — same function, different arrival. */
    if (ppErrandView !== null && S.view === ppErrandView) {
        /* ⚠⚠ CLEAR FIRST. Nothing else does on this path: every render function
         * in soundRender owns its own clear, and the overlay path below got one
         * for free from renderBlocks() drawing the backdrop. Returning early
         * without one leaves the module editor's pixels underneath and the list
         * prints straight over them — reported from the device as "swap module
         * menu is printing directly overtop of the editor page". */
        clear_screen();
        drawKitList(rows, sel, Object.assign({ emptyMsg }, opts || {}));
        return;
    }
    /* The ROOT is the nearest ancestor that does not float — the blocks picker
     * for most chains, but the LFO screen for its own pickers, because the LFO
     * keeps its waveform strip and so stays a full screen (the spec's
     * not-a-list exception). Falling back to the blocks picker: it is the one
     * screen in sound mode that is always available. */
    const root = chainRootView();
    /* ⚠⚠ VIEW_EDIT is deliberately NOT drawn here even though it is the root of
     * the preset chain: it hands the frame to a hosted module canvas. The blocks
     * picker stands in — the crumb still names the module you are editing. */
    if (root === VIEW_LFO) renderLfo();
    else renderBlocks();
    drawKitBackdropDim();
    drawKitStackedList(Math.max(1, soundStackDepth()), rows, sel,
                       Object.assign({ emptyMsg }, opts || {}));
    /* The track is the pinned head — you never lose which track you are in. */
    drawKitCrumbs(['T' + (S.track + 1), ...soundViewPath()]);
}

function renderKnobTarget() {
    /* A module row OPENS the param picker and shows no value of its own, so it
     * takes the chevron (§5.0: a chevron is a door). `(None)` is terminal — it
     * clears the assignment — so it does not.
     * ⭑ The header is gone: the crumb bar says which knob you are assigning,
     * which is all the header ever said. */
    renderInChain(S.knobTargets.map(t => ({ label: t.name, qual: t.qual,
                                            chevron: !!t.id })),
                  S.knobTargetIdx);
}

function renderKnobParam() {
    /* One step deeper in the same chain — so the root is still the KNOBS screen
     * and the TARGET picker beneath is a sliver, not a redraw. */
    renderInChain(S.knobParams.map(p => p.label), S.knobParamIdx, 'NO PARAMS');
}

/* ---- knob HUD: touch orients, turn reveals ------------------------------
 *
 * Outside a module's editor the eight physical knobs drive the SLOT's knob
 * assignments (see the CC 71-78 branch in soundOnCC), and until now nothing on
 * screen said which knob was which — you turned one and watched the sound.
 * Josh's 08-10 spec: touch names the assignment, turn shows its value, and
 * Shift+touch jumps to that knob's assign flow.
 *
 * ⚠⚠ The gate below is deliberately the SAME predicate as the turn-forwarding
 * branch (`!S.bus && S.slot >= 0`, view !== VIEW_EDIT): the HUD describes what
 * the knob actually does, so the two must not be able to disagree. A bus
 * context has no slot to address and forwards nothing — hence nothing to name.
 *
 * ⚠ Every read here is a ~2.9 ms SHM round trip, so they all run from tick, one
 * per tick: the assignment and the target's param metadata are cached per slot,
 * and the value is re-seeded once per touch. A SWEEP costs zero reads — see the
 * turn law below, which owns the value rather than reading it back. */

/* ── the turn law: movy's, applied in JS on an ABSOLUTE value ───────────────
 *
 * ⭑⭑ These knobs used to forward to the chain DSP as relative CCs and let it
 * decide (`chain_midi.c`, the CC 71-78 branch). That cost both resolution and
 * feel, for three separate reasons:
 *
 *  1. **The hardware delta magnitude was DROPPED.** The shadow framework hands
 *     davebox an ACCUMULATED detent count, and we sent exactly one tick per
 *     event regardless — so a fast turn moved LESS than a slow one. Same bug
 *     the session mixer had, same fix: drain the accumulator.
 *  2. **Sending N ticks instead would have been worse.** The DSP accelerates on
 *     the elapsed time BETWEEN events, and N events delivered in one batch are
 *     all stamped at once — every one of them at maximum acceleration.
 *  3. **The DSP's base step is the param's DECLARED step**, so a param
 *     declaring 0.1 over 0..1 has ten positions and nothing can recover them.
 *
 * So the value is owned here instead, and written absolutely. The DSP's own
 * `knob_mappings[].current_value` accumulator goes unused as a result — nothing
 * reads it under SA (`knob_N_value` has no caller in this tree), and it is
 * re-seeded from the live plugin on every state restore, a path whose comment
 * already anticipates exactly this ("may be stale if params were changed via
 * module UI"). ⚠ If a relative-CC writer for these knobs ever comes back, the
 * two accumulators will disagree and the knob will jump on the first turn.
 *
 * The law is RANGE NORMALISATION: the per-detent step is a fraction of the
 * param's own range, so every knob sweeps in the same number of detents
 * whatever its units — a wide range (reso 0.5..20) does not crawl and a narrow
 * one is not hair-trigger.
 *
 * ⭑ movy (`MIN_STEP_RANGE_FRAC` = 1% of range) and canvaskit (255 positions
 * across the range, N detents each) are the SAME law at different resolutions,
 * which is worth saying plainly because carrying both vocabularies invited two
 * knob feels on one device. Expressed below in canvaskit's terms, because that
 * is what the block editor and the session mixer already use — so all three
 * knob surfaces now match. */

/* ── KNOB TRAVEL — the dial, per param type ────────────────────────────────
 *
 * Josh, on the first cut: "knob travel end to end is too fast." It was movy's
 * unscaled 100 detents per sweep (and movy's own on-screen knobs are 200 — its
 * `ARC_DELTA_SCALE` halves them, which this had not ported).
 *
 * PER TYPE because one compromise cannot serve a 0..1 cutoff, an eight-voice
 * count and a three-entry waveform list. Read it as:
 *   `positions` = distinct values a full sweep crosses (step = span/positions)
 *   `sens`      = detents per position
 *   sweep       = positions x sens detents, end to end
 */
const KNOB_TRAVEL = {
    /* Continuous: canvaskit's law, and identical to the session-view mixer's
     * knobs — 255 positions, 2 detents each, ~510 detents end to end. The one
     * knob feel already blessed on this hardware. */
    float: { positions: 255, sens: 2 },
    /* Whole numbers keep their DECLARED step as a floor — 1..8 voices must move
     * one voice per step, never 0.03 — so `positions` only bites on a wide int
     * that would otherwise crawl (0..1000 → step 4, not 1). 2 detents per step
     * resists a brush; an eight-voice sweep is 14 detents. */
    int: { positions: 255, sens: 2 },
    /* A short named list: its positions ARE the options, so only the detent
     * cost is a choice. 4 makes changing patch deliberate rather than something
     * a sleeve does. (movy's ENUM_DELTA_DIV, and canvaskit's "pick" class is
     * the same idea at 6.) */
    enum: { positions: 0, sens: 4 },
};

/* Build the editable cell for an assignment, from the target's chain_params.
 * Same cell shape the block editor's knobs use, so stepValue / commitString /
 * formatValue all apply unchanged — including enum option names in the
 * read-out and the engine-facing commit-by-index rule. */
function knobCellFor(target, param) {
    const meta = S.knobMeta[target];
    const m = meta ? meta.find(p => p && p.key === param) : null;
    const opts = (m && Array.isArray(m.options) && m.options.length) ? m.options : null;
    const type = opts ? 'enum' : ((m && m.type) || 'float');
    /* The fallback is the DSP's own for a param it has no info for: a plain
     * 0..1 float. Guessing wider would make an unknown knob hair-trigger. */
    let min = (m && isFinite(m.min)) ? m.min : 0;
    let max = (m && isFinite(m.max)) ? m.max : 1;
    if (opts) { min = 0; max = opts.length - 1; }
    const span = max - min;
    const travel = KNOB_TRAVEL[type] || KNOB_TRAVEL.float;
    const sens = travel.sens;
    let step;
    if (type === 'enum') {
        step = 1;                   /* the options are the positions */
    } else {
        const rangeStep = (span > 0 && travel.positions) ? span / travel.positions : 0;
        const declared = (m && isFinite(m.step) && m.step > 0) ? m.step : 0;
        /* float: normalise OUTRIGHT — the declared step is what costs the
         * resolution. int: the declared step is a FLOOR, or a 1..8 voice count
         * would move by 0.03 and never change. */
        step = (type === 'int') ? Math.max(declared || 1, rangeStep)
                                : (rangeStep || declared || 0.01);
    }
    return { key: param, name: (m && (m.name || m.label)) || '', type,
             min, max, step, sens, options: opts };
}

/* ⚠⚠ TWO predicates, and the card's is a strict SUBSET of the writer's — never
 * two independent conditions. If the card could be up where the knob does not
 * write, or vice versa, it would name a control the knob is not driving.
 *
 * Where the eight knobs drive the slot's assignments at all. (In VIEW_EDIT they
 * edit the open block's own cells instead; a bus has no slot to address.) */
function knobDrivesSlot() {
    return !!(S.active && S.view !== VIEW_EDIT && !S.bus && S.slot >= 0);
}

/* ...and where the card that names them may appear. The assign screens ARE the
 * assignment, spelled out in full, so a card there would cover the list it
 * duplicates — but the knobs still WRITE there, so you can hear what you are
 * assigning. */
function knobHudContext() {
    if (!knobDrivesSlot()) return false;
    if (S.view === VIEW_KNOBS || S.view === VIEW_KNOB_TARGET ||
        S.view === VIEW_KNOB_PARAM) return false;
    return !isTextEntryActive();
}

/* A knob was touched or turned: show the card, and queue the one read that
 * fills it if this slot's assignment has never been read. */
function armKnobHud(idx, reseed) {
    S.touchedIdx = idx;
    S.touchedTick = S.tickCount;
    S.dirty = true;
    /* ⚠ NOT queued on S.pendingAction: that queue is latest-wins navigation, so
     * a touch arriving behind a pending screen change would drop its load and
     * the card would read UNASSIGNED for a knob that is assigned — with no
     * second chance, because the cache would still say "unread" only after the
     * touch that would have re-armed it. Its own field, drained every tick.
     *
     * ⭑ Armed unconditionally; what it COSTS is decided in one place, in the
     * tick. Testing the caches here too would be belt-and-braces that also has
     * to be right, against values that can change before the tick runs
     * (openKnobEditor reads all eight assignments). */
    if (idx !== S.asnLoadFor) {
        S.asnLoadFor = idx;
        S.asnStage = 0;
        S.knobAccum[idx] = 0;
        S.asnLastDir = 0;
        S.asnRevealed = false;
    } else if (reseed && S.asnStage >= 3) {
        /* Same knob, TOUCHED again: keep the assignment and metadata, re-seed
         * the VALUE. Something else may have moved it since (an LFO, a preset
         * recall), and a card that opens on a stale number is worse than one
         * that opens a tick late.
         *
         * ⚠⚠ TOUCH ONLY — never a turn. A turn also arms the card, and
         * re-seeding there would read the engine back mid-sweep and overwrite
         * the optimistic value we just computed, with a number that lags the
         * write still sitting in the queue. The knob would stutter backwards
         * under the hand. (Caught by the zero-reads-per-sweep assertion, which
         * measured the re-seed as a round trip.) */
        S.asnStage = 2;
    }
}

/* One read per tick, in dependency order — the assignment names the target, the
 * target's chain_params describe the param, the param has a value. Spread
 * because each is a blocking ~2.9 ms round trip and this runs inside a
 * sequencer's tick; the card fills in over ~3 ticks (~32 ms), which is not
 * perceptible, whereas one 9 ms tick is. */
function tickKnobAsn() {
    const k = S.asnLoadFor;
    if (k < 0) return;
    const a = S.knobAsn[k];

    if (S.asnStage === 0) {
        S.asnStage = 1;
        if (a === null) { S.knobAsn[k] = readKnobAsn(k); S.dirty = true; return; }
    }
    const asn = S.knobAsn[k];
    if (!asn || !asn.target || !asn.param) {   /* unassigned: nothing to load */
        S.asnStage = 3; S.asnCellFor = -1; S.asnValNum = null; S.knobAccum[k] = 0;
        return;
    }
    if (S.asnStage === 1) {
        S.asnStage = 2;
        if (!S.knobMeta[asn.target]) {
            let list = [];
            try { list = JSON.parse(engineGet(S.slot, asn.target, 'chain_params') || '[]') || []; }
            catch (e) { list = []; }
            S.knobMeta[asn.target] = list;
            S.dirty = true;
            return;
        }
    }
    if (S.asnStage === 2) {
        S.asnStage = 3;
        S.asnCell = knobCellFor(asn.target, asn.param);
        S.asnCellFor = k;
        S.asnValNum = parseValue(S.asnCell, engineGet(S.slot, asn.target, asn.param));
        S.dirty = true;
        return;
    }

    /* Loaded. Drain whatever detents arrived — including any from while the
     * reads above were still in flight, which is why they ACCUMULATE rather
     * than being applied at the handler. */
    const sens = S.asnCell.sens || 1;
    let steps = 0;
    while (S.knobAccum[k] >= sens) { steps++; S.knobAccum[k] -= sens; }
    while (S.knobAccum[k] <= -sens) { steps--; S.knobAccum[k] += sens; }
    if (!steps) return;
    const cur = (S.asnValNum == null) ? S.asnCell.min : S.asnValNum;
    const next = stepValue(S.asnCell, cur, steps);
    if (next === cur) return;
    S.asnValNum = next;                          /* optimistic, drawn now */
    queueWrite(S.asnCell.key, commitString(S.asnCell, next), asn.target);
    S.dirty = true;
}

/* A turn, in DETENTS. Accumulated rather than written here: this is the MIDI
 * handler, the value may not be seeded yet, and a sweep must coalesce into one
 * write per tick rather than one per event. */
function armKnobValue(idx, delta) {
    if (idx !== S.asnLoadFor) return;            /* armKnobHud owns the switch */
    /* ⚠ Raw DETENTS accumulate here; the tick converts them to steps, because
     * only the tick knows the cell and therefore the sens. Converting here
     * would apply sens 1 to every detent that arrived before the metadata
     * landed — the first flick of a turn, silently at the wrong law. */
    /* ⭑ TOUCH ORIENTS, TURN REVEALS (UI_LANGUAGE, and Josh's spec). The value
     * is now seeded on touch because the turn law needs a base to add to — but
     * it stays hidden until the knob actually moves, or a bare orienting touch
     * would answer a question that was not asked. */
    S.asnRevealed = true;
    const dir = delta > 0 ? 1 : -1;
    /* Direction reversal RESETS the accumulator rather than unwinding it — the
     * canvaskit rule, and the part that makes a knob feel right. */
    if (dir !== S.asnLastDir) { S.knobAccum[idx] = 0; S.asnLastDir = dir; }
    S.knobAccum[idx] += delta;
}

/* The read-out comes from the cell, so an enum reads as its option NAME and a
 * float rounds by its span — the same rules the block editor's values follow.
 * ⭑ It is the value we OWN, not a read-back, so it updates on the frame the
 * detent arrives instead of trailing a round trip. */
function fmtAsnValue(i) {
    if (!S.asnRevealed) return '';               /* touch orients; turn reveals */
    if (S.asnCellFor !== i || !S.asnCell || S.asnValNum == null) return '';
    const t = formatValue(S.asnCell, S.asnValNum);
    return (t && t.length > 10) ? t.slice(0, 10) : t;
}

function drawKnobAsnHud() {
    const i = S.touchedIdx;
    const a = S.knobAsn[i];
    const val = fmtAsnValue(i);
    const body = hudCard('KNOB ' + (i + 1), val || null);
    /* Two lines rather than one "SYNTH: CUTOFF": the body is 112px of label
     * font and a long param key would be truncated exactly where it stops being
     * identifiable. Unread reads as UNASSIGNED for one frame at most — the read
     * is queued by the same touch that opened this card. */
    const line = (n, txt) => {
        const t = String(txt);
        mvPrint(Math.max(body.x, body.x + Math.round((body.w - mvWidth(t)) / 2)),
                body.y + n * 11, t, 1);
    };
    if (!a || !a.target || !a.param) { line(0, 'UNASSIGNED'); return; }
    line(0, compWide(a.target));
    /* The module's own display NAME once its metadata is in ("Room Size", not
     * `room_size`); the raw key until then, and for a param it does not
     * declare. */
    const nm = (S.asnCellFor === i && S.asnCell && S.asnCell.name) || a.param;
    line(1, String(nm).toUpperCase());
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
            return (t && p) ? compParamLabel(t, p) : 'None';
        }
        default: return raw;
    }
}

/* An LFO enum's value IS its index, stored as a string — so the picker's
 * selection and the row's value are the same number, and these two helpers are
 * the only place that has to know it. */
function lfoRawIndex(item) {
    const v = parseInt(S.lfoVals[item.key] || '0');
    return (v >= 0 && v < item.options.length) ? v : 0;
}
function lfoSetIndex(item, i) {
    const v = Math.max(0, Math.min(item.options.length - 1, i | 0));
    if (String(v) === S.lfoVals[item.key]) return;
    S.lfoVals[item.key] = String(v);
    queueChainWrite(lfoKey(item.key), String(v));
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
    /* Same shape as knobTargetList: the row names the MODULE, and the slot comes
     * back as a `qual` only where a name repeats. Two MIDI FX slots exist here,
     * so this list can collide in two families rather than one. */
    const probe = (key, label) => {
        const m = engineLoadedModule(S.slot, key);
        if (m) comps.push({ key, name: String(engineGet(S.slot, key, 'name') || m),
                            slot: label });
    };
    probe('synth', 'Synth');
    for (let i = 1; i <= 4; i++) probe('fx' + i, 'FX ' + i);
    for (let i = 1; i <= 2; i++) probe('midi_fx' + i, 'MIDI FX ' + i);
    qualifyDuplicates(comps);
    for (const c of comps) c.label = c.name;
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
    /* ⭑ Floats now (Josh, 2026-08-28). It was the spec's not-a-list exception
     * because of the waveform strip — but the strip does not need the full
     * width to say what shape is running, so it moves INSIDE the box and the
     * screen stops being an exception. It shows ONE cycle rather than two: half
     * the width, and a single cycle is what identifies a shape anyway.
     *
     * ⚠ Rows drop from 4 to 3 to make room. The strip is the reason to be on
     * this screen at all — it is the only thing here that shows the LFO doing
     * something — so it keeps its place and the list gives way. */
    /* ⚠ ASPECT RATIO, not width. The strip was one cycle across the box's whole
     * width — 101px of span against 7px of height, **14:1**, which reads as a
     * stretched smear rather than a shape (Josh: "far too stretched"). The
     * full-screen original was two cycles across 125px at 13px tall = 4.8:1.
     * THREE cycles inside the box is 34px each at 7px = 4.8:1 — the original
     * proportions exactly, and it costs no height, so the list keeps its rows.
     * More cycles is the free lever here; more height is not. */
    const WAVE_H = 11, WAVE_CYCLES = 3;
    const rows = lfoItems().map((item, idx) =>
        ({ label: item.label, hdr: true, value: lfoDisplayValue(item),
           editing: idx === S.lfoIdx && S.lfoEditing }));
    renderInChain(rows, S.lfoIdx, undefined, { visible: 3, footer: WAVE_H });

    /* The strip, inside the box's foot. Geometry comes from the stack so the
     * two cannot drift: drawKitStackedList reports where its box is. */
    const box = kitStackBox(Math.max(1, soundStackDepth()));
    const shape = LFO_SHAPE_IDS[parseInt(S.lfoVals.shape) | 0] || 'sine';
    const bipolar = S.lfoVals.polarity === '1';
    const phase = parseFloat(S.lfoVals.phase_offset) || 0;
    const botY = box.y + box.h - 3, topY = botY - (WAVE_H - 4);
    const x0 = box.x + 3, spanW = box.w - 7;
    const baseY = bipolar ? Math.round((topY + botY) / 2) : botY;
    const amp = bipolar ? (botY - topY) / 2 : (botY - topY);
    for (let x = x0; x <= x0 + spanW; x += 2) set_pixel(x, baseY, 1);
    const yAt = (i) => {
        const v = shapeSample(shape, (i / spanW) * WAVE_CYCLES + phase);
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
    /* Every row here opens the param picker — the modules and the other LFO
     * alike — so all of them are doors and take the chevron (§5.0).
     * `[Clear Target]` is terminal: it commits and leaves. */
    renderInChain(S.lfoComps.map(c => ({ label: c.label, qual: c.qual,
                                         chevron: c.key !== '__clear__' })),
                  S.lfoCompIdx);
}

function renderLfoParam() {
    /* Mirrors the knob pair exactly: TARGET keeps the full screen (its rows open
     * per-module submenus), PARAM floats over it. */
    renderInChain(S.lfoParams.map(p => p.label), S.lfoParamIdx, 'NO PARAMS');
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
    if (!S.presetSpec) return;
    ensureBakedNames();
    S.view = VIEW_PRESET_BAKED;
    S.presetMsg = '';
    captureOriginal();
}

/* Resolve the module's preset NAMES: memory cache, else disk cache, else arm
 * the scan. Split out of openBaked() 2026-08-31 so the module editor's Presets
 * page can show the same list from the same cache — ONE owner for a decision
 * that is easy to get subtly different (which fingerprint counts as a hit, when
 * the index is restored, when a partial list is allowed to persist).
 *
 * ⚠⚠ THE SCAN IS AUDIBLE. Each step WRITES the preset index and reads the name
 * back, so the module really does load every preset as it walks — that is the
 * whole reason the names are cached at all, and why nothing here runs on a jog
 * past a page. The index is restored when the walk completes; a walk abandoned
 * half way persists nothing. */
function ensureBakedNames() {
    const sp = S.presetSpec;
    if (!sp) return;
    S.bakedCount = parseInt(engineGet(S.slot, S.comp, sp.countKey) || '0', 10) || 0;
    S.bakedIdx = parseInt(engineGet(S.slot, S.comp, sp.listKey) || '0', 10) || 0;

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

/* Are the module's preset names complete and current? */
function bakedNamesReady() {
    return !!S.presetSpec && S.bakedScan < 0 && S.bakedCount > 0 &&
           S.bakedNames.length === S.bakedCount;
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
    else if (a.t === 'browse')  openBrowse(a.comp, a.prompt);
    else if (a.t === 'load')    loadSelected();
    else if (a.t === 'presets') openPresets();
    else if (a.t === 'usrlist') openUserPresets();
    else if (a.t === 'baked')   openBaked();
    else if (a.t === 'usrload') loadUserPreset();
    else if (a.t === 'usrdel')  deleteUserPreset();
    else if (a.t === 'usrsave') startSaveFlow();
    /* ⚠ REFRESH AFTER THE SAVE, like its siblings. Josh, 2026-09-02: "the name
     * of the current preset doesn't update after you do a save as." Save As is
     * the only preset action that lands via pendingAction (the keyboard defers
     * it), and it was the only one not followed by ppRefreshPresets — up_save
     * and up_delete both call it inline. saveUserPreset DOES set the record;
     * nothing rebuilt the trailing page that displays it. */
    else if (a.t === 'usrsavedo') { saveUserPreset(a.name); ppRefreshPresets(); }
    else if (a.t === 'bakedset') commitBaked();
    else if (a.t === 'menu')     openMenu();
    else if (a.t === 'menuload') refreshMenuRows();
    else if (a.t === 'reflavour') {
        /* Re-enter the flavour the track's CURRENT route calls for. Same choice
         * tick's track-follow makes, for the case where the track did not
         * change but its destination did. */
        const _t = S.track;
        if (GS.trackRoute[_t] === 1) soundEnterMove(_t);
        else { clearBusContext(); soundRetarget(_t, slotIndex(_t)); }
        /* ...and if that choice was `Schwung` on an EMPTY slot, go straight on
         * to the module picker. One-shot, and cleared whether or not it fires:
         * a crumb that outlives its gesture opens a picker nobody asked for. */
        const _wantBrowse = S.browseAfterReflavour;
        S.browseAfterReflavour = false;
        if (_wantBrowse && GS.trackRoute[_t] === 0 && !engineLoadedModule(S.slot, 'synth'))
            S.pendingAction = { t: 'browse', comp: 'synth', prompt: 'SELECT INSTRUMENT' };
    }
    else if (a.t === 'slotcfg')  openSlotCfg(a.keep, a.which);
    else if (a.t === 'knobs')    openKnobEditor();
    else if (a.t === 'knobasn')  { openKnobEditor(); S.knobIdx = a.knob; openKnobTargets(); }
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
function openBrowse(comp, prompt) {
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
    S.browsePrompt = prompt || '';
    S.view = VIEW_BROWSE;
    S.dirty = true;
    log('browse: ' + found.length + ' modules for ' + S.comp);
}

function loadSelected() {
    const mod = S.browseList[S.browseIdx];
    if (!mod) return;
    applyModulePick(mod);
}

/* Apply a module choice — including the `[ none ]` row, which is how a module is
 * REMOVED. Split out of loadSelected 2026-08-31 so the editor's "Remove Module"
 * row IS this path rather than a copy of it: stock makes the same point about
 * its own remove_module ("IS applyChainComponentPick's None path, not a copy").
 * Two copies of a module swap is two places to forget pendingDiscover, the bank
 * reset, or the livePress hand-off. */
function applyModulePick(mod) {
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
    /* A different module cannot be "on" the old module's preset. */
    setPresetRecord(null);
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
        /* In-flight = drained but unconfirmed. Shielded even on a FORCED poll:
         * the engine is allowed to be stale (or to have LOST the write — the
         * fire-and-forget mailbox) for these keys until the verifier settles
         * them; reading them back now is how the knob used to snap back. */
        if (inflightFor(S.slot, S.comp, cell.key)) continue;
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

/* A drained write enters the in-flight ledger; coalesced by address so a
 * fast sweep keeps ONE entry carrying the newest value. */
function trackInflight(slot, comp, key, val) {
    for (const w of S.inflight) {
        if (w.key === key && w.comp === comp && w.slot === slot) {
            w.val = val; w.tick = S.tickCount; w.tries = 0; return;
        }
    }
    S.inflight.push({ slot, comp, key, val, tick: S.tickCount, tries: 0 });
}

function inflightFor(slot, comp, key) {
    return S.inflight.find(w => w.key === key && w.comp === comp && w.slot === slot) || null;
}

/* Does the engine's readback SAY the write landed? Tolerant on purpose:
 * floats come back reformatted ("0.9" -> "0.900000"), and an enum written as
 * an INDEX may echo as its option STRING (junologue-chorus mode: wrote "2",
 * read "II") — a re-quantizing engine must read as CONFIRMED, or the
 * verifier rewrites in a loop. */
function engineEcho(w, raw) {
    if (raw == null) return false;
    const rs = String(raw).trim(), ws = String(w.val).trim();
    if (rs === ws) return true;
    const rn = parseFloat(rs), wn = parseFloat(ws);
    if (isFinite(rn) && isFinite(wn) && /^[-+0-9.eE]+$/.test(rs))
        return Math.abs(rn - wn) <= Math.max(1e-3, Math.abs(wn) * 1e-3);
    if (isFinite(wn)) {
        /* index -> option string, via the cell if the bank still shows it */
        for (const b of S.banks) {
            for (const c of (b.cells || [])) {
                if (c && c.key === w.key && c.options && c.options.length) {
                    const opt = c.options[Math.round(wn)];
                    return opt != null && String(opt).trim() === rs;
                }
            }
        }
    }
    return false;
}

/* One verification per tick, oldest first. Skips a key that has a NEWER write
 * still queued — verify the value that will actually stand. */
function verifyInflight() {
    if (!S.inflight.length) return;
    const w = S.inflight[0];
    if (S.tickCount - w.tick < INFLIGHT_CONFIRM_TICKS) return;
    if (S.pendingWrites.some(p => p.key === w.key && p.comp === w.comp && p.slot === w.slot))
        return;
    const raw = engineGet(w.slot, w.comp, w.key);
    if (engineEcho(w, raw)) { S.inflight.shift(); return; }
    if (++w.tries > INFLIGHT_TRIES) {
        log('write UNCONFIRMED after ' + INFLIGHT_TRIES + ' rewrites: ' +
            w.comp + ':' + w.key + '=' + w.val + ' engine=' + raw);
        S.inflight.shift();
        return;
    }
    engineSet(w.slot, w.comp, w.key, w.val);   /* the rewrite */
    w.tick = S.tickCount;
}

/* Drain a bounded number of queued writes. Each drained write enters the
 * in-flight ledger — it is not DONE until verifyInflight reads it back.
 *
 * ⭑ ONE OWNER, and that is the point of it being a function. The tick has two
 * paths through it now — davebox's own editor and the vendored one — and the
 * ledger has to drain on BOTH: the vendored editor writes THROUGH queueWrite
 * (see installPpCtx), so a path that skipped this would queue every edit and
 * land none of them. Copying the loop into the second path would have been two
 * owners of the same invariant, which is how the drain gets fixed in one place
 * and stays broken in the other. */
function drainAndVerifyWrites() {
    for (let n = 0; n < WRITES_PER_TICK && S.pendingWrites.length; n++) {
        const w = S.pendingWrites.shift();
        engineSet(w.slot, w.comp, w.key, w.val);
        trackInflight(w.slot, w.comp, w.key, w.val);
    }
    verifyInflight();
    drainSlotWrites();
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
    if (cell.reload) {
        /* A param that changes the param SET (the effect selector). Write it
         * SYNCHRONOUSLY and re-discover, so the labels, knob count and rows
         * follow the new selection live rather than only on re-entry.
         * Pending optimistic writes were edits to the OUTGOING selection's
         * params — runDiscovery resets S.values anyway, so drop them for this
         * component instead of landing them on the wrong effect. */
        S.pendingWrites = S.pendingWrites.filter(
            w => !(w.slot === S.slot && w.comp === S.comp));
        engineSet(S.slot, S.comp, cell.key, commitString(cell, next));
        runDiscovery();
        return;
    }
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

    /* ⚠ AFTER the hosted check and BEFORE davebox's own handling, but the two
     * modifier CCs below are read FIRST and always fall through: the binding
     * asks davebox for Shift and Mute through ctx (precision mode, and
     * Mute+touch = reset to default), so swallowing them here would leave both
     * gestures dead inside the editor while davebox lost track of them too. */
    if (ppOn && d1 !== 49 && d1 !== 88) {
        /* ⭐⭐ ONE DETENT PER CALL — feed the editor what STOCK feeds it.
         *
         * ⚠⚠ THE SHAPES DIFFER, AND THAT IS THE WHOLE BUG. The shim hands the
         * shadow UI encoder CCs ONE DETENT AT A TIME. A TOOL gets one batched
         * message per knob per frame carrying that frame's WHOLE detent count —
         * davebox's own knob code says so in as many words, and the probe caught
         * a single message reading d2=46. Handing that straight to the shared
         * engine is giving stock's code an input shape stock never produces.
         *
         * So davebox expands the batch instead of the engine learning about it.
         * The engine then sees exactly the stream it sees under stock, and the
         * feel is identical BY CONSTRUCTION rather than by tuning — no second
         * knob law to keep in step, and nothing to re-tune when upstream
         * retunes theirs. (Josh: "why not just do it the way stock does it?")
         *
         * ⚠ Deliberately NOT fixed in knob_engine: making it scale by the
         * magnitude would look equivalent and is not. Its acceleration reads the
         * GAP BETWEEN CALLS, so one fat call and N thin ones are different
         * inputs to it however the amount is scaled — and the divisor
         * accumulator (int params, ENUM_DELTA_DIV) is written per detent too.
         *
         * ⚠ CAPPED. decodeDelta only spans ±63, and a runaway loop here is a
         * frozen UI on a device where that means no audio controls. */
        if (d1 >= 71 && d1 <= 78) {
            const n = decodeDelta(d2);
            if (n === 0) return false;
            const unit = n > 0 ? 1 : 127;            /* +1 / -1, re-encoded */
            const count = Math.min(Math.abs(n), 63);
            let took = false;
            for (let i = 0; i < count; i++) {
                if (handleParamPagesMidi([0xB0, d1, unit])) took = true;
            }
            if (took) { S.dirty = true; return true; }
            return false;
        }
        /* ⚠⚠ BACK IS SPLIT DELIBERATELY, and getting it wrong broke a shipped
         * gesture the first time I tried.
         *
         * The editor treats Back as one-layer-at-a-time: close the picker, then
         * step out of an entered menu, THEN leave the view. The first two are
         * its own layers and it must own them. The third is not its decision
         * here — davebox knows where leaving the editor goes, including the
         * gesture retrace ("a gesture-entered editor returns to where the
         * gesture was pressed"), which the editor's own exit would bypass by
         * going straight to chrome.returnView.
         *
         * So: hand Back to the editor ONLY while it has a layer to close. When
         * it has none, davebox's own Back runs, on the RELEASE, as it always
         * has. Anything else either loses the retrace or acts twice.
         *
         * ⚠ And Back is decided on opposite EDGES by the two — the editor on the
         * press, davebox on the release — so a press the editor took must have
         * its release swallowed, or one tap does both. */
        if (d1 === 51) {
            if (d2 >= 64 && ppHasLayer()) {
                handleParamPagesMidi([0xB0, d1, d2]);
                ppAteBackPress = true;
                S.dirty = true;
                return true;
            }
            /* No layer: fall through to davebox's own Back below. */
        } else if (handleParamPagesMidi([0xB0, d1, d2])) {
            S.dirty = true;
            return true;
        }
    }

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
        /* SHIFT+volume only (2026-08-24): plain turns never arrive — ui.js
         * drops them and Move's native main output acts. In the TRACK flavour
         * the screen's level IS the active track's volume (chain slot level,
         * or a Move bus's strip Volume — volTarget decides), so consuming here
         * keeps the on-screen rows, the readout and the save flush in step.
         * A GLOBAL bus screen (Master/Send FX) has no track on it: decline,
         * and the track-volume handler in ui_input_cc acts on the active
         * track exactly as it does outside sound mode. */
        if (!S.shiftHeld) return false;
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
         * knob-mapping ASSIGNMENTS (Knobs... in slot settings). The value is
         * owned and written HERE, absolutely, under movy's step law — see the
         * turn law above knobCellFor for why forwarding a relative CC to the
         * chain DSP cost both resolution and feel. Bus contexts have no slot
         * to address, so they neither write nor show a card. */
        if (knobDrivesSlot()) {
            const delta = decodeDelta(d2);
            if (delta) {
                /* Armed even with no preceding touch (an injected CC, or a hand
                 * already resting on the knob when the screen opened) — a turn
                 * is at least as strong a statement of intent as a touch, and
                 * the card is where the value has to appear. */
                armKnobHud(d1 - 71, false);   /* a turn never re-seeds */
                armKnobValue(d1 - 71, delta);
            }
        }
        return true;
    }

    if (d1 === 14) {                                   /* jog turn */
        /* ⭑⭑ THE PROMPT IS A BANK, so the jog WALKS (Josh, 2026-08-28). Sound
         * mode is fully active here — it owns the knobs and the HUD — but it
         * must DECLINE the turn, or the one bank you can never leave by turning
         * the jog is the bank whose whole job is being a door. Declining hands
         * the CC back to davebox's own handler, which walks the cycle and, with
         * Shift, switches track — both without a second copy here.
         * ⚠ The block below ends in an unconditional `return true`, so without
         * this the prompt would swallow every turn. */
        if (S.view === VIEW_PROMPT) return false;
        /* ---- Shift+jog = SWITCH TRACK, in the menu only ----
         *
         * Declining the CC is the whole implementation: davebox's own jog
         * handler already steps the active track on Shift+jog, and tick already
         * follows a track change across flavours (ui_tick: Schwung retargets,
         * Move re-enters the bus flavour, EXT closes). So the gesture means the
         * same thing here as everywhere else without a second copy of either.
         *
         * The global menu does exactly this — `S.globalMenuOpen && !S.shiftHeld`
         * — so it too falls through to the track switch and rebuilds for the new
         * track. Same shape, so the two screens cannot drift apart.
         *
         * ⚠ MENU ONLY. Inside a module's editor Shift+jog already JUMPS
         * SECTIONS (see the `S.shiftHeld && S.sections.length > 1` branch
         * below), which is a different, established meaning; stealing it there
         * would trade one gesture for another. Level editing is excluded for the
         * same reason — mid-edit the jog belongs to the value in hand.
         *
         * ⚠ And not on a GLOBAL bus (Master/Send FX): those are entered from the
         * session FX list, not from a track, so there is no track to step. That
         * is also why tick's follow is gated on !soundIsGlobal(). */
        if (S.shiftHeld && S.view === VIEW_BLOCKS && !S.busLevelEditing &&
                !soundIsGlobal()) {
            return false;                              /* davebox steps the track */
        }
        const delta = decodeDelta(d2);
        if (!delta) return true;
        if (S.view === VIEW_BUSES) {
            /* This list is also the session's FX BANK — the one past the last
             * mixer mode on the jog. So a left turn that cannot move the cursor
             * any further up leaves it the way it was entered: back onto the
             * mixer, exactly as the track flavour's top row steps back onto the
             * clip banks. Only the LIST does this; inside a bus the top edge
             * stays a clamp, same as inside a module's editor. */
            const _nextBus = listMove(FX_BUSES.length, S.busIdx, delta);
            if (_nextBus === S.busIdx && delta < 0 && S.enterSession) {
                soundExit();
                forceRedraw();
                return true;
            }
            S.busIdx = _nextBus;
            /* Each turn re-opens the display window, as a mixer mode change
             * does — without this the list would fall back to the overview
             * mid-scroll, 2s after entry, with the cursor still moving. */
            if (S.enterSession) armBankDisplay();
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
                    if (sp.slot) queueSlotCfgWrite(sp.key, v, !!sp.int);
                    else queueWrite(sp.key, v.toFixed(3), sp.comp);
                }
            }
        } else if (S.view === VIEW_BLOCKS && S.instrEditing) {
            const opts = instrOptions(GS.trackRoute, S.track);
            const cur = opts.indexOf(S.instrSel);
            /* Clamp, never wrap (Josh, 2026-08-23) — the Instrument list is a
             * settings value like any other. */
            S.instrSel = opts[Math.max(0, Math.min(opts.length - 1, cur + (delta > 0 ? 1 : -1)))];
        } else if (S.view === VIEW_BLOCKS) {
            const next = pickStep(delta);
            /* ⚠ THE TOP EDGE IS A CLAMP NOW (Josh, 2026-09-01: "when in
             * sound+config MENU, scrolling past the top should no longer jump
             * to the previous card. that menu is now exited by pressing back,
             * which lands you on the sound+config card"). The 08-26 top-edge
             * walk-out — soundExit({landOn: origin}) + re-arming the window +
             * re-opening the picker — is retired with the picker itself: the
             * jog walks banks directly OUTSIDE the menu, and Back is the one
             * way out of it (VIEW_BLOCKS -> VIEW_PROMPT, the card). */
            S.pickRow = next;
            /* Each turn re-opens the display window, as a bank change does on
             * the clip banks — without this the screen would fall back mid-
             * scroll, 2s after entry, while the cursor is still moving. */
            if (!soundIsGlobal() && !S.enterSession) armBankDisplay();
        } else if (S.view === VIEW_SLOTCFG) {
            slotCfgStep(delta);
        } else if (S.view === VIEW_KNOBS) {
            S.knobIdx = listMove(NUM_KNOBS, S.knobIdx, delta);
        } else if (S.view === VIEW_KNOB_TARGET) {
            S.knobTargetIdx = listMove(S.knobTargets.length, S.knobTargetIdx, delta);
        } else if (S.view === VIEW_ENUM) {
            if (S.enumPick)
                S.enumPick.sel = listMove(S.enumPick.options.length, S.enumPick.sel, delta);
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
            /* ⚠⚠ Tell DAVEBOX the Mute was a MODIFIER, on its own state object.
             * Swallowing the click here is not enough: davebox acts on the Mute
             * RELEASE (`d1 === MoveMute && d2 === 0`), and that handler fires
             * unless muteUsedAsModifier is set. So Mute+click bypassed the block
             * AND muted the track — Josh, 2026-08-26: "falls through to track
             * mute instead of only bypassing the focused effect."
             *
             * ⚠ It must be GS, not S. The `S` in this file is sound mode's own
             * object; setting the flag on it would be silently inert, which is
             * the exact mistake that broke this same gesture once before (see the
             * muteHeld tracking note above). Set OUTSIDE the row check: the
             * modifier was used the moment the gesture was claimed, even if the
             * row was empty and nothing was bypassed — otherwise a click on a
             * blank row still mutes the track. */
            GS.muteUsedAsModifier = true;
            const r = S.pickRows[S.pickRow];
            if (r && r.kind === 'block' && r.name) {   /* empty = nothing to bypass */
                r.bypassed = r.bypassed ? 0 : 1;
                queueWrite('bypassed', String(r.bypassed), r.comp);
                S.presetMsg = r.bypassed ? 'BYPASSED' : 'ACTIVE';
                S.dirty = true;
            }
            return true;
        }
        if (S.view === VIEW_PROMPT) { S.view = VIEW_BLOCKS; S.dirty = true; return true; }
        if (S.view === VIEW_ENUM) { closeEnumPicker(true); return true; }
        if (S.view === VIEW_SLOTCFG) {
            const row = S.slotRows[S.slotCfgIdx];
            if (row && row.sub) {
                /* Native sub-editor. Opening reads params — tick only. */
                S.pendingAction = { t: row.sub, lfo: row.lfo | 0 };
            } else if (row && soundEnumPickable(row.opts)) {
                /* ⭑ An enum of more than two opens the PICKER (the spec's law).
                 * `fmt` is what the row's own value column shows, so the list
                 * reads exactly like the value it is replacing — Keys / Drums /
                 * Conduct, not 0 / 1 / 2.
                 * ⚠ `commitOnClick` rows (Mode CONVERTS the track) are safe
                 * here: the commit runs on the picker's click, once, which is
                 * the same edge the old flow committed on. */
                const idx = row.opts.indexOf(S.slotCfgVals[S.slotCfgIdx]);
                openEnumPicker(row.label, row.opts.map(v => String(row.fmt(v))),
                               idx < 0 ? 0 : idx,
                               (i) => {
                                   S.slotCfgVals[S.slotCfgIdx] = row.opts[i];
                                   if (row.set) row.set(row.opts[i]);
                                   S.slotCfgDirty = true;
                               });
            } else if (row && row.commitOnClick && S.slotCfgEditing) {
                /* Closing the edit IS the commit. */
                S.slotCfgEditing = false;
                if (row.set) row.set(S.slotCfgVals[S.slotCfgIdx]);
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
            else if (item && item.type === 'enum' && soundEnumPickable(item.options)) {
                /* Shape and the sync divisions are the long lists here; Enabled,
                 * Mode, Sync and Retrigger are two-state and keep the toggle. */
                const cur = lfoRawIndex(item);
                openEnumPicker(item.label, item.options.slice(), cur,
                               (i) => lfoSetIndex(item, i));
            }
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
                 S.pickRows[S.pickRow].kind === 'trackto') {
            if (!S.instrEditing) {
                /* Conductor emits nothing, so it has no destination to choose —
                 * the row reads '-' and declines the edit, exactly as the global
                 * menu's row does. */
                if (GS.trackPadMode[S.track] === PMC) { S.dirty = true; }
                else {
                    /* ⭑ Instrument is an ENUM — four families and up to 30-odd
                     * entries — so it opens the PICKER rather than being ticked
                     * through one detent at a time behind a `[value]`. The list
                     * IS the thing you are choosing from; scrolling it blind
                     * through a single row was the worst case of the old grammar
                     * anywhere in the app. */
                    const opts = instrOptions(GS.trackRoute, S.track);
                    const cur = opts.indexOf(instrValueFor(S.track));
                    openEnumPicker('Instrument', opts.map(o => String(fmtInstr(o))),
                                   cur < 0 ? 0 : cur,
                                   (i) => { S.instrSel = opts[i]; commitInstrChoice(); });
                }
            } else {
                S.instrEditing = false;
                commitInstrChoice();
            }
            S.dirty = true;
            return true;
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
                if (_r.spec.slot) queueSlotCfgWrite(_r.spec.key, _r.val, true);
                else queueWrite(_r.spec.key, String(_r.val), _r.spec.comp);
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
            S.pendingAction = { t: 'slotcfg', which: 'sound' };  /* reads the slot — tick only */
        }
        else if (S.view === VIEW_BLOCKS && S.pickRows[S.pickRow] &&
                 S.pickRows[S.pickRow].kind === 'config') {
            S.pendingAction = { t: 'slotcfg', which: 'config' };
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
            /* Carries the CURRENT comp explicitly, exactly as the block-picker
             * route does — openBrowse falls back to fx1 on a bus when handed
             * nothing, which would silently browse the wrong block. */
            else if (row.kind === 'swap')  S.pendingAction = { t: 'browse', comp: S.comp };
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

    /* ⚠⚠ THE EDITOR AND davebox DISAGREED ABOUT WHICH EDGE BACK IS, AND BOTH
     * ACTED. The module editor decides on the PRESS (page_input: BACK_CC with
     * d2 > 0); davebox moved its own navigation to the RELEASE deliberately,
     * because that is where a tap is told apart from the long-press suspend. So
     * one tap did BOTH — the editor stepped out of an entered menu, and then
     * davebox's navigation left module edit underneath it.
     *
     * Josh, from the device: "when the preset list is active and being
     * scrolled, pressing back kicks you out of module edit. it should just send
     * you back to the bank."
     *
     * ⭑ ONE OWNER PER TAP. If the editor took the press, davebox swallows the
     * matching release and does nothing else with it — including when the
     * editor's answer was to leave the editor, which it does itself. */
    if (ppAteBackPress && d1 === 51 && d2 < 64) {
        ppAteBackPress = false;
        GS.backPressTick = -1;
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
        /* ⭐ ANY SCREEN THE EDITOR OPENED BACKS INTO THE EDITOR. Ahead of the
         * per-view branches below, because those step up davebox's OWN tree —
         * which is not the tree you walked when you arrived from a module page.
         * Cleanup still belongs to the view: leaving a preset browser
         * un-committed undoes the audition, exactly as it does on davebox's own
         * path. */
        if (ppErrandView !== null && S.view === ppErrandView) {
            if (S.view === VIEW_PRESET_LIST || S.view === VIEW_PRESET_BAKED) revertOriginal();
            ppErrandView = null;
            S.view = VIEW_EDIT;
            S.dirty = true;
            return true;
        }
        /* ⭑ A DIVE-OUT COMES BACK. An un-turnable param (filepath, string, a
         * long option list) hands the whole component to davebox's own editor,
         * exactly as stock hands it to the hierarchy list editor. Back from
         * there means "done with that param", so it returns to the GRID you
         * dived from — not out of module edit, which is where davebox's own
         * Back would take you and which reads as losing your place.
         * Josh: "same thing happens after you click to enter the hierarchy menu
         * editor." */
        if (ppDivedOut && S.view === VIEW_EDIT) {
            ppDivedOut = false;
            ppSuppressOnce = false;      /* let the reconcile re-enter the grid */
            S.dirty = true;
            return true;
        }
        if (S.view === VIEW_BLOCKS) {
            /* ⚠ A SESSION BUS FIRST. The prompt below is the TRACK door — a
             * session bus has no track, and walking a Master FX Back into it
             * rendered "CLICK TO ENTER TRACK 0 SOUND & CONFIG" (S.track is -1
             * there; Josh, on device, 2026-09-01, minutes after the gateway
             * shipped). Master/Send Backs into the session FX list through
             * leaveBus — the one door. ⚠ A MOVE bus does NOT take this branch:
             * it is a TRACK's menu wearing the bus dress, so it follows the
             * track rule below. Routing it through leaveBus (whose move branch
             * is soundExit) threw a Move track out of sound AND bank mode at
             * the menu top while a Schwung track stepped to the card — the
             * Move-track divergence (Josh, 2026-09-01). */
            if (S.bus && S.bus.kind !== 'move') {
                leaveBus();
                S.dirty = true;
                return true;
            }
            /* ⭐ THE BACK LAW (Josh, 2026-09-01): in a gateway-entered menu,
             * Back steps the menu structure level by level, and the TOP step —
             * this one — lands on the GATEWAY CARD, never the overview. Bank
             * mode only, because the card exists only there (THE ONE LAW): a
             * menu opened outside bank mode (the Shift+Note destination
             * gesture) has no card above it, so its top step leaves sound mode
             * for the resting overview — parking the invisible prompt there
             * instead would hold soundActive() true behind the overview and
             * re-arm the click-falls-through bug.
             * ⚠ THIS BELONGS TO BACK. It was first written against an anchor
             * that appears in BOTH the click and Back handlers and landed in
             * the CLICK path, so opening a block from the menu went to the
             * prompt instead. */
            if (GS.bankCardLatched) {
                if (S.bus) {
                    /* Move flavour: the card keeps its bus context — same
                     * level-edit flush leaveBus does on the way up. */
                    S.busLevelEditing = false;
                    if (S.busLevelDirty) { S.busLevelDirty = false; S.pendingAction = { t: 'slotsave' }; }
                }
                S.view = VIEW_PROMPT;
            } else {
                soundExit();
                standDownBankDisplay(true);
            }
            S.dirty = true;
            return true;
        }
        if (S.view === VIEW_ENUM) {
            /* Back ABANDONS. Committing on the way out would make an accidental
             * Back a silent edit, and the row you came from still shows the old
             * value — you would not see what you had changed. */
            closeEnumPicker(false);
            S.dirty = true;
            return true;
        }
        if (S.view === VIEW_BLOCKS && S.instrEditing) {
            S.instrEditing = false;                 /* abandon, do not apply */
            S.dirty = true;
            return true;
        }
        if (S.view === VIEW_SLOTCFG) {
            if (S.slotCfgEditing) S.slotCfgEditing = false;   /* leave edit first */
            else closeSlotCfg();
        } else if (S.view === VIEW_KNOBS) {
            /* Assignments were queued as they were made; nothing to flush.
             * The host autosave persists them (set_param marks the slot dirty). */
            S.pendingAction = { t: 'slotcfg', keep: true };
        } else if (S.view === VIEW_LFO) {
            if (S.lfoEditing) S.lfoEditing = false;
            else S.pendingAction = { t: 'slotcfg', keep: true };
        } else if (VIEW_TREE[S.view] && VIEW_TREE[S.view].backPure) {
            /* The pure step-ups, from VIEW_TREE. These were four branches doing
             * exactly `S.view = <my parent>`; the table is now the one place
             * that says so, and the breadcrumb reads the same edges.
             * ⚠ Below VIEW_LFO deliberately: LFO has an edit state to close
             * before it steps anywhere, so it is not a pure step-up. */
            S.view = VIEW_TREE[S.view].parent;
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
            /* Reached from davebox's own source menu, this steps back up to it.
             * Reached from the module editor, the branch near the top of Back
             * has already returned you there. */
            S.view = VIEW_PRESET_SRC;
        } else if (S.view === VIEW_PRESET_SRC) {
            S.view = VIEW_EDIT;
        } else if (S.view === VIEW_EDIT || S.view === VIEW_BROWSE) {
            /* A GESTURE-entered editor retraces the gesture instead of stepping
             * up to the picker — but only at the editor's TOP level, which is
             * here. Deeper screens (preset lists, the module menu, LFO/knob
             * pages) are handled above and still step up ONE level each, or you
             * could not back out of a preset list without being thrown all the
             * way out of sound mode. */
            if (!soundGestureReturn()) {
                S.view = VIEW_BLOCKS;
                S.pendingAction = { t: 'names' };
            }
        } else if (S.busLevelEditing) {
            S.busLevelEditing = false;
        } else if (S.bus && S.view !== VIEW_PROMPT) {
            /* One level up is wherever the bus was entered FROM — the track's
             * picker, or the session-wide bus list. leaveBus knows which.
             * ⚠ NOT the prompt: a MOVE flavour stands at the gateway card WITH
             * its bus context set, and this catch-all swallowed its Back into
             * leaveBus's soundExit — sound mode closed but bank mode stayed
             * latched, so a Move track's card could not Back to the overview
             * while a Schwung one (bus-less prompt) could. The final else is
             * the card's one exit, both flavours. */
            S.pendingAction = { t: 'leavebus' };
        } else if (S.view === VIEW_BUSES) {
            soundExit();
        } else {
            /* The prompt (and any stray top-level screen): Back is OUT — of
             * sound mode AND of bank mode (Josh, 2026-09-01: "pressing back
             * from any of those banks exits bank mode"). The jog's walk-off
             * keeps the mode; only Back ends it. */
            soundExit();
            GS.bankCardLatched = false;
            standDownBankDisplay(true);
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

    /* Note 8 (volume-knob touch) never arrives: ui.js drops it
     * unconditionally since the claim moved onto the Shift key (2026-08-24).
     * The save flush that used to ride the touch RELEASE rides the Shift
     * release instead — soundVolGestureEnd, called by the MoveShift handler. */
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

    /* The stock editor takes knob touch as the NOTE it is — page_input decodes
     * 0x90/0x80 on notes 0-7 into onKnobTouch, and that press is what claims
     * the header (a resting finger names the param before any turn). Without
     * this forward only the TURN path ever claimed it, so labels highlighted
     * on turn but not on touch (Josh, 2026-08-31; pre-1.0 behaviour restored).
     * Forwarded, not consumed — davebox's own touch bookkeeping below still
     * runs, the same doctrine as hostedNote above. */
    if (ppOn) handleParamPagesMidi([status, d1, d2]);

    const on = (status === 0x90 && d2 >= 64);

    /* Touch orients — and Shift+touch goes straight to the assignment.
     *
     * The long way round is the menu -> Sound Control -> Knobs... -> row N ->
     * Target, which is four screens to answer a question you asked by putting
     * your hand on the knob. Both live on the PRESS: a release-triggered jump
     * would fire after the hand has already moved on.
     *
     * ⭑ The assign route goes through openKnobEditor (all eight assignments)
     * rather than the one knob it needs, because committing lands you on the
     * KNOBS list — which would otherwise render seven unread rows as "(None)". */
    if (on && knobHudContext()) {
        if (S.shiftHeld) {
            S.pendingAction = { t: 'knobasn', knob: d1 };
            S.dirty = true;
            return true;
        }
        armKnobHud(d1, true);
    }

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

    /* ⭑ AHEAD of discovery: when the editor is on, davebox's own bank model is
     * not what is being drawn, and running both would pay for two contracts. */
    ppSync();
    if (ppOn) {
        tickParamPages();
        /* ⚠ AND THE PRESET WALK STILL STEPS. It runs from this tick and nowhere
         * else, so without this the Presets page would arm a scan that never
         * advanced — a list that stays empty forever with nothing logged. */
        if (S.bakedScan >= 0) stepBakedScan();
        /* ⚠⚠ THE LEDGER STILL DRAINS. davebox's bank model is not what is on
         * screen, but its WRITE PATH is: the vendored editor's setParam goes
         * through queueWrite, so returning before this would queue every edit
         * the grid makes and land none of them — writes that look accepted, a
         * screen that shows them, and nothing reaching the DSP. Caught by
         * test_sound_write_verify, which failed the moment the flag went on. */
        drainAndVerifyWrites();
        /* ⚠⚠ AND SO DOES pendingAction — the third thing this early return
         * stranded. Josh, from the device: "user presets don't seem to be
         * saving." startSaveFlow() queues {t:'usrsavedo'} and the keyboard
         * returns to the GRID, so the drain below was never reached: the name
         * was accepted, the keyboard closed, and nothing happened — no file and
         * no error, because the failing step never ran to report one.
         * ⚠ Not a bus bug. The grid has owned track FX since it shipped, so
         * Save As has been silently inert there too.
         * Same `!pendingWrites.length` guard as the drain below, for the same
         * reason: an action stacked on a write drain doubles the tick's SHM
         * cost exactly when the sequencer can least absorb it. */
        if (S.pendingAction && !S.pendingWrites.length) {
            const a = S.pendingAction;
            S.pendingAction = null;
            runAction(a);
        }
        return;
    }

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

    drainAndVerifyWrites();
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

    /* After the write drain, so a read never overtakes the turn it is reading
     * back, and after pendingAction so the assignment is cached first. */
    if (!S.pendingWrites.length) tickKnobAsn();

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

/* The bank's own screen: what this bank is, and how to open it.
 *
 * ⚠ It is NOT empty of function. The knobs are live here — the whole reason the
 * bank still activates sound mode — and the knob HUD draws over this on touch,
 * so a knob you turn still says what it is doing. The prompt is what fills the
 * screen the rest of the time.
 *
 * The track number comes from S.track, not the active track: on this screen
 * they are the same, but the sound mode's own notion is the one every other row
 * on the way in uses. */
/* ⭑ ONE DRAWER for every gateway card, exported and generalized: the prompt
 * view draws it while sound mode is open, ui_render draws it for the
 * knob-touch PEEK of a track remembered on SOUND + CONFIG (the mode is closed
 * at rest — Josh, 2026-09-01, THE ONE LAW — so the peek cannot go through
 * renderPrompt), and the session view's SESSION FX door wears it too. A
 * second hand-drawn copy is how cards drift apart (review finding: the
 * session door had grown exactly that). */
export function renderGatewayCard(title, line2) {
    clear_screen();
    /* ⚠ BANK's map, explicitly — this card is a bank card and is reached
     * from callers with different prior layouts. Selecting is not optional
     * on any surface that reads a binding (see renderBlocks). */
    kitUseLayout('bank');
    drawKitHeader(title, false);
    centreText(26, 'CLICK TO ENTER');
    centreText(40, line2);
}

/* The track flavour's card — both renderPrompt and the peek draw THIS, so the
 * strings live once. */
export function renderTrackGatewayCard(track) {
    renderGatewayCard('SOUND + CONFIG', 'TRACK ' + (track + 1) + ' SOUND & CONFIG');
}

function renderPrompt() {
    renderTrackGatewayCard(S.track);
}

function renderBlocks() {
    clear_screen();
    /* ⚠ BANK's map, explicitly. This screen is the last segment of the jog's
     * BANK cycle and wears the filled header, not sound mode's split one — and
     * since 2026-08-31 the two maps put the bar on different rows (7 vs 8), so
     * the clear below cleared the wrong row whenever the param editor had drawn
     * last. Selecting is not optional on any surface that reads a binding. */
    kitUseLayout('bank');
    /* A Move bus IS a track's screen, so it takes the track header too — the
     * Generator row already says which Move instrument. Only the GLOBAL buses
     * (Master/Send FX) keep their own title; they are not a track.
     * ⚠⚠ ROUND brackets, because the header font has no `[` or `]` — those
     * advance the cursor and draw NOTHING, so the title came out as
     * "TRACK 5  SETTINGS" with a hole where the brackets should be. Probed, not
     * guessed: that font inks ! # % ( ) + , - . / : < > ? and blanks the rest.
     * ⭑ The SMALL font does have square brackets, which is why the row edit
     * indicator ("[VALUE]") is unaffected — the two fonts differ.
     * ⚠ Width, against drawKitHeader's real limit (SCREEN_W - 4 = 124px): this
     * is 119px at every track number. The square-bracket form measured 125px
     * and would have lost its last letter even if the glyphs had existed. (An
     * earlier Move-bus title, "MOVE 2 - TRACK CONTROL", was 153px.) */
    drawKitHeader((S.bus && S.bus.kind !== 'move')
        ? S.bus.title
        : 'SOUND + CONFIG', false);   /* no track marker (Josh, 2026-08-23) —
                                       * a bank heading, like the clip banks' */
    /* The bank-position bar, continued: this screen is the LAST segment of the
     * jog's bank cycle, so it keeps the same indicator the clip banks carry —
     * the strip reads as one. Track flavour only (a session bus is not a bank),
     * and not for a Conductor track (its cycle has no sound bank; it can still
     * arrive here via Shift+Note). Row 9 is cleared first: the page bar's
     * segment gaps are UNPAINTED pixels, so anything already on the row would
     * fill them back in. */
    if (!soundIsGlobal() && GS.trackPadMode[S.track] !== PMC) {
        /* No rule and no indicator: this screen IS a bank, and both went with
         * the bank walk they described. The clear stays — it wipes whatever the
         * previous screen left on that row. */
        fill_rect(0, MV_BAR_Y, 128, 1, 0);
    }
    /* ⚠⚠ This builds a NEW object per row, so anything set on the pickRow has to
     * be forwarded EXPLICITLY. It is the second time that has bitten: the doors
     * had no chevron for the same reason, and the grouping rules' flag reached
     * drawKitList not at all, so they never drew. (They are their own ROWS now,
     * which sidesteps the whole class — a row cannot be forgotten by a mapper
     * that iterates rows.) */
    const _cell = (r, idx) => {
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
        if (r.kind === 'trackto') {
            const v = S.instrEditing ? S.instrSel : instrValueFor(S.track);
            const txt = GS.trackPadMode[S.track] === PMC ? '-' : fmtInstr(v);
            return { label: r.label, hdr: true,
                     value: S.instrEditing ? '[' + txt + ']' : txt };
        }
        if (r.kind === 'div') return { divider: true };
        if (r.kind === 'movesynth') return { label: r.label, hdr: true, value: r.value };
        /* Doors get the chevron drawKitList draws for a sub-row. They used to
         * fall through to the bare branch below, which sets neither value nor
         * chevron, so nothing on screen said they opened anything.
         * ⚠ `chevron` and `value` are mutually exclusive there (chevron wins),
         * which is why the Move Generator row carries its marker in the value
         * string instead — it has to show WHICH instrument it opens. */
        if (r.kind === 'settings' || r.kind === 'config' || r.kind === 'patches')
            return { label: r.label, hdr: true, chevron: true };
        if (r.kind !== 'block') return { label: r.label, hdr: true };
        /* A bypassed block still says what it holds — you need to know WHAT is
         * switched out — so the state rides as a prefix. Matches the host's 'B'. */
        return { label: r.label, hdr: true,
                 value: (r.bypassed ? 'B ' : '') + String(r.name || '-').toUpperCase() };
    };
    /* This screen was the TEST CASE for the menu type rule (2026-08-27); the
     * rule is drawKitList's default now, so there is nothing to pass. */
    drawKitList(S.pickRows.map(_cell), S.pickRow, {});   /* the menu type rule is the default now */
}

function renderBuses() {
    /* A FULL SCREEN, exactly the SOUND + CONFIG menu's dress (Josh,
     * 2026-09-01: "master send fx interface should be a menu just like
     * sound-config's, not a pop-up overlay on top of the bank card") — kit
     * header + kit list, no backdrop, no float. Its rows lead into bus
     * editors, which is the 08-27 criterion for a full screen anyway. */
    clear_screen();
    drawKitHeader('SESSION FX', false);
    drawKitList(FX_BUSES.map(b => ({ label: b.title, hdr: true, chevron: true })),
                S.busIdx, {});
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

/* ---- overlay PICKERS -------------------------------------------------------
 *
 * Josh's rule (2026-08-27): a list where you are only MAKING A SELECTION floats
 * over the screen you came from, so you stay oriented; a list that leads to
 * submenus keeps the full screen, because there you need the room.
 *
 * Ruled in, one by one: the module browser (Generator / FX 1-4), the knob PARAM
 * picker, the LFO PARAM picker, and the MODULE-side preset list.
 * Ruled OUT, with reasons: the knob and LFO TARGET pickers ("it contains
 * submenus for each module"), the preset SOURCE menu (its rows open menus), and
 * the USER preset list (Shift edits presets there, so it is not selection-only).
 *
 * ⭑ INPUT IS UNTOUCHED. Each of these keeps its own VIEW_ state and every
 * handler it had — only the drawing changes. That is what makes the change
 * cheap and reversible: Back, jog and click mean exactly what they meant.
 *
 * ⭑ The backdrop is the screen you came FROM, so the overlay answers "what am I
 * choosing this for" with the thing itself instead of with a header — which is
 * why dropping the picker headers is a gain rather than a loss.
 * ⚠ Backdrops must be OUR OWN draws, never a hosted canvas: renderEdit hands the
 * whole frame to the module (`if (S.hosted && renderHosted()) return;`), and
 * compositing over a surface that paints everything itself is where this would
 * flicker. Every backdrop below is one of our list screens. */
function renderBrowse() {
    /* Over the block picker, so you can see WHICH block you are filling.
     * ⭑ When the browser was opened because the block was EMPTY, the backdrop's
     * header is overdrawn to say so — the caption sits ABOVE the overlay because
     * that band is the only space there is: the box starts at MV_ZOOM_Y (14) and
     * rows 8-13 are too few for a line of 7px text without clipping the box. */
    /* ⚠ The prompt (why the browser opened) rides the header band, which the
     * crumb bar now owns — so an EMPTY-block browse says so in the crumb rather
     * than over the backdrop. */
    renderInChain(S.browseList.map(m => String(m.name)), S.browseIdx);
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
        /* Same verify-and-rewrite contract as the generated EDIT view: the
         * kit's 2x/sec cache flush re-reads every key, and a flush landing
         * after a write the mailbox LOST is exactly the hosted flavour of
         * "the knob resets". Reads serve the in-flight value until the
         * verifier confirms it; writes enter the ledger. */
        getParam: (k) => {
            const w = inflightFor(S.slot, S.comp, k);
            return w ? String(w.val) : engineGet(S.slot, S.comp, k);
        },
        setParam: (k, v) => {
            const r = engineSet(S.slot, S.comp, k, String(v));
            trackInflight(S.slot, S.comp, k, String(v));
            return r;
        },
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

/* The hint row for a MODULE EDITOR page. Different screen, different gestures —
 * every pair below is soundOnCC's, not the track view's, and the two rows
 * deliberately do not match:
 *
 *   JOG  PAGE     the jog walks S.bankIdx across this module's banks. It is
 *                 PAGE and not BANK because in here a "bank" is one page of one
 *                 module's params, where in the track view it is the whole
 *                 card you are looking at. The word follows the thing.
 *   SHFT SECT     Shift+jog jumps SECTIONS -- and only exists when the module
 *                 HAS more than one (S.sections.length > 1), which is exactly
 *                 the branch condition. A single-section module gets no hint,
 *                 because Shift+jog there falls through to stepping the track.
 *   CLK  PRESETS  jog click opens the preset browser. On an EMPTY block there
 *                 are no presets to offer and the click browses MODULES
 *                 instead, so the word changes with the destination
 *                 (`S.moduleId ? presets : browse`).
 *   BACK OUT      Back rises one level, out of the editor to the block picker.
 *
 * ⚠ MUTE+click bypasses a block, but only in VIEW_BLOCKS -- not here -- so it
 * is not hinted here. Hinting a gesture one screen up is the same failure as
 * inventing one.
 * ⚠ Knob touch/turn edits the value under your finger. Not hinted: the eight
 * knobs ARE the page, and a row of pills is for the gestures that are not
 * self-evident. */
function editHints() {
    /* ⚠⚠ ORDERED BY WHAT HAS NO ON-SCREEN TRACE, which is NOT the same as the
     * track view's order and is the one place these two rows deliberately
     * disagree. The flow budget is 86px (see hintPairWidth) and CLK PRESET
     * alone is 52, so this row shows ONE pair plus BACK. The one it shows must
     * therefore be the one nothing else says:
     *   · the PAGE BAR is already drawn above these cells and already
     *     advertises that the jog walks pages, so JOG PAGE is the redundant
     *     hint here — it goes last.
     *   · the click and the Shift chord have no visual trace whatsoever.
     * On the track view the jog opens a PICKER rather than stepping a page, so
     * there it leads. */
    const hints = [['CLK', S.moduleId ? 'PRESET' : 'BROWSE']];
    if (S.sections.length > 1) hints.push(['SHFT', 'SECT']);
    hints.push(['JOG', 'PAGE']);
    hints.push(['BACK', 'OUT']);
    return hints;
}

/* One section id per BANK, in bank order — the page bar's separator map.
 * Derived from the same S.sections the Shift picker uses, so the bar and the
 * picker can never describe different structure. */
function pageGroups() {
    if (!S.sections || S.sections.length < 2) return null;
    const out = new Array(S.banks.length);
    for (let i = 0; i < S.banks.length; i++) out[i] = activeSection(S.sections, i);
    return out;
}

/* ===========================================================================
 * THE MODULE EDITOR — stock's, wired to davebox's views
 *
 * Josh, 2026-08-31: "when i'm in davebox's module editing interface i want it
 * to be no different than when i'm in stock's module editing interface."
 *
 * What davebox contributes is ONLY the wiring: which slot/component is being
 * edited, where the values come from, where Back goes. Everything you see and
 * touch inside is the vendored binding's.
 *
 * ⚠ OFF BY DEFAULT while it is wired. davebox's own editor (renderEdit below)
 * is still the shipped one; flipping PP_EDITOR swaps them, and both paths stay
 * whole so a device pass can A/B them. This is not a permanent switch — it
 * comes out with ui_discover's bank model when the swap is made.
 * ⭐ Before removing the flag: MEASURE THE TICK on device. The controller
 * staggers to ~1 get_param per tick, but an entry rebuild bursts, and a blocked
 * tick is how the input ring overflows and drops MIDI RELEASES
 * ([[schwung-blocked-tick-drops-midi-releases]]) — the 771 ms stall that
 * stranded the LEDs was exactly this shape. */
const PP_EDITOR = true;

let ppOn = false;
/* ⭑ THE DIVE-OUT LATCH, and it mirrors the host's `suppressParamPagesOnce`
 * exactly. A param the grid will not turn hands off to davebox's own editor —
 * which is the SAME view the grid would otherwise claim, so without this the
 * reconcile below would re-enter the grid on the very next tick and the dive
 * would bounce straight back. Cleared by the entry it suppresses, never by
 * anything else, so it cannot leak into a later unrelated open. */
let ppSuppressOnce = false;
/* A Back PRESS the editor consumed, whose RELEASE davebox must not act on. */
let ppAteBackPress = false;
/* We left the grid for davebox's own editor via openParamEditor, so Back there
 * returns to the grid rather than out of module edit. */
let ppDivedOut = false;
/* ⭐⭐ THE SCREEN THE MODULE EDITOR SENT YOU TO, if any.
 *
 * ONE crumb for every one of them, not one per screen. Josh has said it as many
 * ways as it can be said — "the editor should follow stock", "no different than
 * stock" — and stock's rule is simply that a screen you reached FROM the editor
 * belongs to the editor: Back steps back into it, and it draws as a full screen
 * the way stock's do.
 *
 * ⚠ I fixed the preset list with a crumb of its own and was about to add a
 * second for the module browser. That is how this ends up being reported screen
 * by screen: the rule is general, so the crumb is general. Anything the editor
 * opens sets this, and both the Back path and the renderer read it. */
let ppErrandView = null;

/* Does the editor currently have a layer of its own for Back to close — an open
 * picker, or a menu/preset page you have entered? Only then does Back belong to
 * it; otherwise leaving is davebox's decision. */
function ppHasLayer() {
    if (!ppOn) return false;
    if (paramPagesPickerOpen()) return true;
    return paramPagesMenuEntered();
}

/* Where the editor applies.
 *
 * ⭑ SESSION BUSES USE IT TOO (Josh, 2026-09-02: "master/send effects should use
 * the same editor as track effects"). An FX insert on Master or Send A/B is an
 * ordinary audio_fx module with the same `ui_hierarchy` a chain slot's is, so
 * there was never a technical reason it planned differently — it simply was not
 * wired when the grid was imported ("SLOT CHAIN ONLY", dc9705c0), because
 * upstream had not wired Master FX either at our watermark. The visible effect
 * is parity: the trailing My Presets / Module pages appear at the end of the
 * jog walk instead of hiding behind a jog-click, `visible_if` starts folding
 * controls away, and the knob rings light.
 *
 * ⚠ Move buses stay out as a SCOPING choice, not an impossibility — Josh ruled
 * "master/send", so that is what shipped. Their FX inserts are ordinary audio_fx
 * modules that would plan fine (see FX_BUSES' neighbours above: they "ride the
 * same machinery"); it is only Move's GENERATOR row, its own voice reached
 * through co-run, that has nothing to plan from. So the same reverb gets the
 * grid and My Presets on Master and the older editor on a Move bus — a known
 * inconsistency, and the reason this is worth revisiting rather than a wall.
 * ⚠ And not a module drawing its OWN canvas, which already owns the whole frame. */
function ppApplies() {
    const busOk = !S.bus || S.bus.kind === 'global';
    return PP_EDITOR && S.active && busOk && S.slot >= 0 && !S.hosted && !!S.moduleId;
}

/* ⚠ THE PREFIX IS S.comp, AND THAT IS LOAD-BEARING. The binding hands the io
 * FULL keys (`${prefix}:${param}`) — including its own `${prefix}:is_loading`
 * probe. Passing S.comp makes every key exactly what davebox already addresses
 * with engineGet(slot, comp, key), so the split below is exact rather than a
 * guess. ⚠ Do NOT split on the first ':' instead: a component key can itself
 * contain one (`send_fx:a`), so the only safe split is stripping the prefix we
 * chose. */
function ppBare(fullKey) {
    const p = S.comp + ':';
    const k = String(fullKey);
    return k.startsWith(p) ? k.slice(p.length) : null;
}

/* Reconciled in ONE place rather than at the five sites that set VIEW_EDIT: the
 * editor's lifetime is a function of what is on screen, and a reconcile cannot
 * be forgotten by a new call site the way five enter() calls can. */
/* Screens the EDITOR opened and will come back from. While one is up the
 * controller must stay alive: it owns the page position, the staggered read
 * cursor and the enum commit path, and tearing it down to rebuild it on return
 * would land you on page 1 of a module you were nine pages into. */
function ppOwnsView() {
    return S.view === VIEW_ENUM && S.enumPick && S.enumPick.from === VIEW_EDIT;
}

/* The page you were on when you left, so a preset errand returns you there
 * rather than to page 1 of a module you were nine pages into. Upstream restores
 * by NAME for the same reason — after a rebuild every index has moved. */
let ppRestorePage = null;      /* { slot, comp, name } */

/* ⚠ THE PAGE NAME IS ONLY MEANINGFUL FOR THE COMPONENT IT CAME FROM. Restoring
 * "Filter 2" into a different module is at best a miss and at worst a silent
 * landing somewhere you did not ask for, so the crumb carries its own address
 * and is ignored unless it matches. */
function ppRestoreFor(slot, comp) {
    const r = ppRestorePage;
    return (r && r.slot === slot && r.comp === comp) ? r.name : null;
}

function ppSync() {
    if (ppSuppressOnce && S.view === VIEW_EDIT) {
        /* Consumed on arrival, not on departure: the dive target IS VIEW_EDIT,
         * so the first tick back here is the one that must not re-enter. */
        ppSuppressOnce = false;
        if (ppOn) { exitParamPages(); ppOn = false; S.dirty = true; }
        return;
    }
    const want = ppApplies() && (S.view === VIEW_EDIT || (ppOn && ppOwnsView()));
    if (want && !ppOn) {
        enterParamPages(S.slot, S.comp, S.comp, ppRestoreFor(S.slot, S.comp), ppIo(), {
            label: modLabel(),
            /* Back leaves the editor for the block picker — davebox's own
             * destination, unchanged from what renderEdit's footer promises. */
            returnView: VIEW_BLOCKS,
            onExit: () => { ppOn = false; },
        });
        ppOn = true;
        S.dirty = true;
    } else if (!want && ppOn) {
        /* Remembered BEFORE the exit — the page is the controller's, and it is
         * gone once the controller is. */
        const pg = currentParamPage();
        ppRestorePage = (pg && pg.name) ? { slot: S.slot, comp: S.comp, name: pg.name } : null;
        exitParamPages();
        ppOn = false;
        S.dirty = true;
    }
}

/* Re-read the user presets and rebuild the trailing pages from them.
 *
 * ⚠ THE DISK SCAN LIVES HERE AND NOWHERE ELSE. trailingMenus() runs on every
 * plan and every refresh, so scanning inside it would put a directory read on a
 * path the controller walks routinely. */
function ppRefreshPresets() {
    S.userPresets = S.moduleId ? engineListUserPresets(S.moduleId) : [];
    if (ppOn) paramPagesRefreshTrailing();
}

/* ⭐ THE PAGES AT THE END OF THE WALK — and the reason they are not optional.
 *
 * ⚠⚠ THE REGRESSION THEY FIX. davebox's own editor put its preset menu on the
 * JOG CLICK ("CLK PRESET" in its footer): user presets, the module's own baked
 * presets, the Module Menu, Swap Module. In this editor the jog click is the
 * SECTION PICKER, so that entire menu became unreachable the moment the editor
 * changed — not one missing page, a whole branch of davebox with no door.
 * Josh, from the device: "looks like my presets and maybe some other pages are
 * missing." They were.
 *
 * ⭑ THE SHAPE IS UPSTREAM'S. Stock appends exactly this — a "My Presets" page
 * and a "Module" page — through the same `io.trailingMenus` hook
 * (componentTrailingMenus in stock's shadow_ui.js), so jogging to the end of a
 * module's pages is where presets live. davebox reaches its OWN screens from
 * those rows rather than reimplementing a browser, which is the same move its
 * openParamEditor makes.
 *
 * ⚠ `io`, NOT `ctx`. These are per-entry, per-consumer hooks — the binding
 * spreads them over the ctx defaults — so supplying them is the extension point
 * working as designed, not davebox diverging from the host's context.
 *
 * ⚠ WHAT davebox CANNOT SHOW YET, stated rather than faked: stock's Preset row
 * reads back WHICH user preset is loaded, and hides Save/Delete when none is.
 * davebox keeps no such record — nothing tracks the loaded preset per
 * slot+component — so the row opens davebox's preset hub instead of naming a
 * preset, and the destructive rows live inside that hub where they already have
 * a target. Adding the record is its own piece of work. */
function ppIo() {
    return {
        trailingMenus: () => {
            if (!S.moduleId) return [];      /* nothing loaded to preset or swap */
            return [
                /* ⭑ STOCK'S FOUR ROWS, in stock's order (photographed from a
                 * stock session: Preset / Save / Save As / Delete, with the
                 * loaded preset named beside the first and marked `*` when the
                 * sound has moved since). Save and Delete both target the
                 * preset you are ON, so they appear only when there is one —
                 * the same always-or-hasPreset filter stock applies. Save As is
                 * unconditional: it goes to the keyboard either way. */
                { name: 'My Presets', entries: (function () {
                    const rows = [{ label: 'Preset', value: presetRowValue(),
                                    action: 'up_load' }];
                    if (presetRecord()) rows.push({ label: 'Save', action: 'up_save' });
                    rows.push({ label: 'Save As', action: 'up_save_as' });
                    if (presetRecord()) rows.push({ label: 'Delete', action: 'up_delete' });
                    return rows;
                })() },
                { name: 'Module', entries: [
                    { label: 'Swap Module', action: 'swap_module' },
                    /* ⭑ REMOVE IS THE `[ none ]` PICK, reached through the same
                     * applyModulePick — not a second way to clear a slot. */
                    { label: 'Remove Module', action: 'remove_module' },
                ] },
            ];
        },
        /* ⭐ THE PRESETS PAGE SHOWS THE LIST once davebox knows the names
         * (Josh, 2026-08-31). It is a DISPLAY change only — the library keeps
         * using the level's own index and count, so the jog walks presets
         * exactly as before.
         *
         * ⚠⚠ NOTHING HERE SCANS ON ARRIVAL. Reading the names means loading
         * every preset in turn, audibly; jogging past this page must never do
         * that. So a cold cache returns null and the page stays as it is, and
         * the walk starts only on ENTERED — a deliberate click into the page,
         * which is the same gesture that opens davebox's own preset screen. */
        presetNames: (page, o) => {
            if (!S.presetSpec) return null;
            if (bakedNamesReady()) return S.bakedNames;
            /* Entered and we have nothing: resolve caches, and arm the walk
             * only if both are cold. Cheap and idempotent when warm. */
            if (o && o.entered && S.bakedScan < 0) ensureBakedNames();
            return bakedNamesReady() ? S.bakedNames : null;
        },

        /* ⭑ Each action LEAVES the grid for a davebox screen, which is why every
         * one of them exits the editor first: these screens own the display, and
         * the reconcile in ppSync would otherwise re-enter the grid on the next
         * tick and take the screen straight back. Same latch openParamEditor
         * uses, and the same one stock's own hand-off uses. */
        runAction: (action) => {
            /* ⚠⚠ NO SUPPRESSION LATCH HERE, unlike openParamEditor — and the
             * difference is where you come back to. A dive-out for an
             * un-turnable param is meant to LAND in davebox's own editor and
             * stay there; a preset errand is meant to return you to the grid you
             * left. Arming the latch would have dropped you into the old editor
             * on the way back, silently, once per errand.
             *
             * Nothing needs to exit the grid explicitly either: these screens
             * set S.view, so ppSync sees the view move away and tears the editor
             * down on the next tick — one owner for that decision, as always. */
            clearParamPagesTouch();
            /* ⭑ THE BROWSER, NOT davebox's HUB. Stock's up_load calls
             * enterPresetBrowser — a list of the user's presets. openPresets()
             * is davebox's older SOURCE menu (User Presets / Module Presets /
             * Module Menu / Swap Module), which is a different screen with a
             * different job, and landing on it from this row is the wrong
             * destination. Josh: "pressing presets puts you into the earlier
             * davebox overlay menu. that's not right." */
            if (action === 'up_load') { openUserPresets(); ppErrandView = S.view; }
            /* ⭑ Save and Delete act IN PLACE and never navigate, so they leave
             * you on the page — stock closes its menu behind Save for the same
             * reason: the changed row is visible on the page you are left
             * looking at. */
            else if (action === 'up_save') { overwriteUserPreset(); ppRefreshPresets(); }
            else if (action === 'up_delete') { deleteRecordedPreset(); ppRefreshPresets(); }
            else if (action === 'remove_module') applyModulePick({ id: '', name: '[ none ]' });
            else if (action === 'up_save_as') startSaveFlow();
            else if (action === 'swap_module') { openBrowse(S.comp); ppErrandView = S.view; }
            else log('pp: unknown menu action ' + action);
            S.dirty = true;
        },
    };
}

/* Installed once, at module load. The host fills its ctx from shadow_ui.js at
 * init for the same reason: the binding reads these INSIDE function bodies, so
 * they only have to exist by the time the editor is entered.
 * ⚠⚠ The member list is not ours to choose — it is whatever the vendored
 * binding reads, and test_param_pages_vendor.sh fails if this and
 * pp_ctx.mjs's PP_CTX_MEMBERS / PP_CTX_ABSENT stop agreeing with it. */
installPpCtx({
    /* The header names the MODULE, not the patch (Josh, 2026-08-31: no preset
     * name in the editor breadcrumb). Stock keeps the patch name because its
     * chain editor — which names the module — is the screen you came from;
     * davebox's entry paths are its own, so the module name has nowhere else
     * to live. Generic opt-out, default-on in the binding. */
    headerPresetName: false,

    /* Bare key straight through: engineGetChainParam does no key building, and
     * the binding's keys are already full. */
    getSlotParam: (slot, key) => engineGetChainParam(slot, key),

    /* ⚠⚠ NOT engineSet. engineSet is the raw fire-and-forget shadow_set_param:
     * in overtake the host has ~8 ms of mailbox patience and then STOMPS an
     * unconsumed request, so a write vanishes with nothing logged. Sound mode's
     * answer is the verify-and-rewrite ledger (`a71cd569`) — a write is not
     * done until a read confirms it — and the grid has to enter it or its edits
     * will disappear exactly the way sound mode's did. queueWrite also
     * coalesces by key, so a sweep costs one write per drain rather than one
     * per detent. */
    setSlotParam: (slot, key, value) => {
        const k = ppBare(key);
        if (k === null) { log('pp: unprefixed write ignored: ' + key); return; }
        queueWrite(k, String(value));
    },

    isMuteHeld: () => S.muteHeld,
    requestRedraw: () => { S.dirty = true; },

    /* ⚠ davebox's OWN views, never the host's. The binding calls setView on
     * entry and again on exit; pointing those at the host's setter would yank
     * the screen out of overtake mid-session. */
    VIEWS: { PARAM_PAGES: VIEW_EDIT, CHAIN_EDIT: VIEW_BLOCKS },
    setView: (v) => { if (v !== S.view) { S.view = v; S.dirty = true; } },

    /* ⚠ ABBREV ONLY, and that is deliberate. This host supplies getModuleAbbrev
     * and NOT getModuleDisplayName (shadow_ui.js: "the four upstream entries
     * with no fork equivalent ... are deliberately absent"), so the binding
     * falls back from one to the other. Answering both would put a different
     * string in davebox's header than in the host's.
     * ⭑ AND THE STRING ITSELF MUST MATCH, not just the member. This was
     * `String(ref).toUpperCase()` — a placeholder that renders a header stock
     * never renders, in the one place the integration claims there is no
     * difference. engineModuleAbbrev is the host's own rule: the module's
     * declared `abbrev`, else its first two characters uppercased. */
    getModuleAbbrev: (ref) => engineModuleAbbrev(ref),

    /* `visible_if`. Ported, because the host's evaluator and all four of its
     * helpers live in shadow_ui.js rather than shared/ — see pp_visible.mjs.
     * Unanswered, the planner shows EVERYTHING, so davebox would display
     * controls a module folds away in its current mode. */
    evaluateVisibilityCondition: (condition, levelDef) => evaluateVisibility({
        prefix: S.comp,
        getParam: (fullKey) => engineGetChainParam(S.slot, fullKey),
        childIndexOf: (lvl) => paramPagesChildIndex(lvl),
    }, condition, levelDef),

    /* The modulation dot and the label's `~`. Same two-step read the host does:
     * ask the target whether it is modulated, and for targets that do not
     * implement `:modulated`, infer it by comparing the live value against its
     * `:base`. ⚠ A missing `:base` means NOT modulated, never "assume yes" —
     * the mark has to mean something. */
    isParamModulated: (slot, fullKey) => {
        const flag = engineGetChainParam(slot, fullKey + ':modulated');
        if (flag === '1') return true;
        if (flag === '0') return false;
        const base = engineGetChainParam(slot, fullKey + ':base');
        if (base === null || base === undefined || base === '') return false;
        const live = engineGetChainParam(slot, fullKey);
        return live !== null && live !== undefined && live !== base;
    },

    /* A param the grid will not turn — filepath, canvas, wav_position, string,
     * and (because openEnumPicker is deliberately absent, as on the host) a
     * long enum list too.
     *
     * ⭑ THE HOST DOES NOT OPEN A PER-KEY EDITOR HERE EITHER. Its
     * openParamEditorFromGrid exits the grid and enters the HIERARCHY LIST
     * editor for the whole component, which is where its file browser, text
     * entry and option list live. davebox's exact counterpart is its OWN
     * editor: the bank model, with openFileBrowser, startTextEdit and
     * openEnumPicker already wired into it. So the dive is the same shape —
     * hand the component to the editor that has the screens — rather than a
     * second set of editors built for the grid. */
    openParamEditor: (slot, fullKey, meta) => {
        clearParamPagesTouch();
        exitParamPages();
        ppOn = false;
        ppSuppressOnce = true;
        ppDivedOut = true;
        S.pendingDiscover = 1;      /* davebox's own editor needs its banks */
        S.view = VIEW_EDIT;
        S.dirty = true;
    },
});

function renderEdit() {
    clear_screen();
    /* Hosted modules draw themselves, INCLUDING their own header and picker. */
    if (S.hosted && renderHosted()) return;
    /* SOUND's map — module PARAM PAGES: the split header, its page bar, and the
     * row map that follows from them. Selected FIRST, before any kit draw call,
     * including on the empty branch below: the bindings are module state and a
     * surface that forgets to select draws with whichever map ran last. */
    kitUseLayout('sound');
    if (!S.banks.length) {
        drawKitHeaderParamPages(blockLabel(), '', false);
        centreText(28, S.moduleId ? 'NO PARAMS' : 'EMPTY');
        centreText(40, S.moduleId ? 'CLICK FOR PRESETS' : 'CLICK TO PICK');
        return;
    }
    const bank = S.banks[S.bankIdx];
    const cells = renderCellsForBank(bank, S.values, S.rawValues);
    drawKitBankPage(cells, {
        /* ⭑ UPSTREAM'S SPLIT (renderPageMovy): the MODULE left, the PAGE right.
         * The module name is constant and you already know it; the page name is
         * what changes as the jog walks, so it is what you are reading — which
         * is why the right side is fitted first and the left takes what is left.
         * This screen previously showed the page name alone and never named the
         * module it belonged to. */
        headerText: modLabel(),
        headerRight: String(bank.name || '').toUpperCase(),
        pageIdx: S.bankIdx,
        pageCount: S.banks.length,
        /* One SECTION id per page, so the bar's separators carry the structure
         * Shift+jog steps through — pages of a section sit flush, a 1px gap
         * marks the next. Same data drawKitSectionPicker uses. */
        pageGroups: pageGroups(),
        touchedIdx: S.touchedIdx,
        overlayIdx: overlayIdx(),
        env: bank.env || null,
        filt: filterVizFor(bank, S.values),
        footer: editHints(),
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
    renderInChain(S.srcRows.map(r => r.label), S.presetSrcIdx);
}

function renderChainPatches() {
    clear_screen();
    if (S.patchConfirm) {
        drawKitHeader(S.patchConfirm.t === 'delete' ? 'DELETE?' : 'OVERWRITE?', false);
        centreText(24, String(S.patchConfirm.name || '').toUpperCase());
        drawDialogYesNoRow(S.patchConfirmIdx === 1);
        return;
    }
    /* '*' marks the slot's current patch — the one [Save] would overwrite. */
    const rows = ['[Save]', '[Save as…]'].concat(
        S.patchNames.map(n => (n === S.patchCur ? '*' : ' ') + n));
    /* ⚠ A message keeps the FULL screen: it lives at y58, under where the box
     * ends, so floating would simply hide it. §5.0's not-a-list exception. */
    if (S.patchMsg) {
        drawKitHeader(trackTitle('SLOT PRESETS'), false);
        renderRows(rows, S.patchIdx, '');
        centreText(58, S.patchMsg);
        return;
    }
    renderInChain(rows, S.patchIdx);
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
    /* MODULE-side presets: picking is the only thing you can do here, so it is a
     * selection overlay. The USER list is deliberately NOT — Shift edits presets
     * there (Josh, 2026-08-27), which is more than a selection.
     *
     * ⚠ The SCAN and EMPTY states keep the full screen. They are not selections:
     * one is progress with a running count, the other is a message. Squeezing
     * either into a 5-row list box would say less in less space, and the scan's
     * two lines have nowhere to go. */
    if (S.bakedScan >= 0 || !S.bakedCount) {
        clear_screen();
        drawKitHeader(modLabel() + ' PRESETS', false);
        if (S.bakedScan >= 0) {
            centreText(26, 'READING NAMES');
            centreText(40, S.bakedScan + ' / ' + S.bakedCount);
        } else {
            centreText(30, S.presetMsg || 'NO PRESETS');
        }
        return;
    }
    const rows = S.bakedNames.map((n, i) =>
        String(i + 1).padStart(3, ' ') + '  ' + (n || ('Preset ' + (i + 1))));
    renderInChain(rows, S.bakedIdx);
    /* Transient feedback stays on top of the box, as it was on top of the list.
     * ⚠ It overlaps the bottom row while it is up; it is a few frames of status
     * after an action, not a thing you read while choosing. */
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
    /* The card itself moved to ui_movy (drawLevelCard) when Shift+Volume started
     * showing the same one everywhere — same control, one drawer. */
    /* Named with its track (Josh, 2026-08-24). The card can be raised from a
     * bank, the mixer or a module editor, and "LEVEL 1.35x" alone does not say
     * WHOSE. At the widest — "Tr 8  LEVEL  2.00x" — it is 86px in the 90px the
     * card has, so the label fits without truncation. */
    drawLevelCard('Tr ' + (S.track + 1) + '  LEVEL  ' + S.volLevel.toFixed(2) + 'x',
                  S.volLevel / VOL_MAX);
}

export function soundRender() {
    if (!S.active) return false;
    if (isTextEntryActive()) { drawTextEntry(); return true; }
    /* At the TOP LEVEL the screen keeps the clip banks' display law (Josh,
     * 2026-08-23): it shows while the jog is touched or the bank-display
     * window is open — the SAME flags the banks read — and otherwise stands
     * down so drawUI falls through to the track overview. Sound mode stays
     * ACTIVE underneath (input, knobs, the bank walk); only the drawing
     * yields, and touching the jog brings the screen back, exactly as on any
     * other bank. Held gestures keep it up: an in-progress row edit, the knob
     * card (S.touchedIdx), the volume gesture and its readout window. Track
     * flavour only — the session buses are not banks and never yield. */
    /* ⭑⭑ THE ONE LAW, SESSION FLAVOUR (Josh, 2026-09-02: "the weird jog touch
     * and click fall-through we fixed on track banks is still happening on
     * session banks"). The session FX list is the bank one past SEND B, so it
     * obeys the same law as the track card — and its one owner is
     * sessMixerVisible() (the session latch, or the mixer's knob peek).
     *
     * ⚠ THIS BRANCH WAS MISSED BY THE 2026-09-01 AUDIT. Its track twin below
     * was migrated onto bankCardVisible(); this one kept the RETIRED display
     * drivers (GS.jogTouched, the transient bankSelectTick window), which is
     * both halves of the bug he re-reported:
     *   - the list hid at rest even with bank mode ON (the latch survives
     *     soundEnterBuses), and touching the jog brought it back — the peek;
     *   - sound mode stays ACTIVE behind a stand-down, so the session click
     *     gate's `!soundActive()` was false and the click fell through.
     * Held gestures still keep it up; its own rows (inside a bus) never yield. */
    if (S.view === VIEW_BUSES && S.enterSession &&
            S.touchedIdx < 0 && !S.volTouched &&
            !sessMixerVisible())
        return false;
    /* ⭑⭑ THE PROMPT YIELDS; THE MENU DOES NOT (Josh, 2026-08-28: "it's not a
     * bank"). The display law belongs to BANKS — show while the jog is touched
     * or the window is open, otherwise stand down to the track overview — and
     * after the respec the only thing here that IS a bank is the prompt.
     *
     * The MENU is a screen you deliberately opened, so it stays up until it is
     * dismissed. That is the whole distinction the respec drew: arriving on a
     * bank is not the same as asking for a screen, and it would be perverse for
     * a menu you clicked into to vanish because you stopped touching the jog.
     * ⚠ Before the respec this test read VIEW_BLOCKS, correctly — the menu WAS
     * the bank then. Moving it to the prompt is the same rule, re-pointed at
     * the thing that now carries the bank's identity. */
    /* ⭑⭑ THE ONE LAW owns this too (Josh, 2026-09-01): the card — and the
     * prompt IS the SOUND + CONFIG card — shows iff bank mode is on or a knob
     * peeks. bankCardVisible() is the render's one owner of that answer; the
     * old reads here (GS.jogTouched, the transient bankSelectTick window) were
     * exactly the retired display drivers, and they were the "jog touch peeks
     * the card" half of the S+C-as-active-bank bug. */
    if (S.view === VIEW_PROMPT &&
            !soundIsGlobal() && !S.enterSession &&
            !S.instrEditing && !S.busLevelEditing &&
            S.touchedIdx < 0 && !S.volTouched &&
            !(S.volShownUntil >= 0 && S.tickCount <= S.volShownUntil) &&
            !bankCardVisible())
        return false;
    if (S.view === VIEW_PROMPT) renderPrompt();
    else if (S.view === VIEW_BLOCKS) renderBlocks();
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
    else if (S.view === VIEW_ENUM) renderEnumPick();
    else if (S.view === VIEW_PATCHES) renderChainPatches();
    else if (S.view === VIEW_BUSES) renderBuses();
    /* The editor draws the whole frame itself, header and footer included —
     * clear_screen() is its own first call, exactly as on the host. Falling
     * through to renderEdit when it declines is deliberate: it returns false
     * for a page kind it does not draw, and davebox's own editor is still the
     * shipped one behind PP_EDITOR. */
    else if (ppOn && drawParamPages()) { /* stock's editor drew it */ }
    else renderEdit();
    /* The level readout wins: it is the same box in the same place, and the
     * volume knob is a deliberate second gesture on top of this one. */
    if (S.volShownUntil >= 0 && S.tickCount <= S.volShownUntil) drawVolReadout();
    else if (S.touchedIdx >= 0 && knobHudContext()) drawKnobAsnHud();
    return true;
}
