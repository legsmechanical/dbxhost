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

import {
    COMPONENTS, engineGet, engineSet, engineListModules,
    engineLoadModule, engineLoadedModule, engineSetState,
    engineListUserPresets, engineReadUserPreset,
} from './ui_engine.mjs';
import { discover, deriveSections, activeSection, filterVizFor } from './ui_discover.mjs';
import { parseValue, stepValue, commitString, renderCellsForBank } from './ui_cells.mjs';
import {
    drawKitBankPage, drawKitHeader, drawKitSectionPicker, drawKitValueOverlay,
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

const VIEW_BLOCKS = 0, VIEW_EDIT = 1, VIEW_BROWSE = 2,
      VIEW_PRESET_SRC = 3, VIEW_PRESET_LIST = 4, VIEW_PRESET_BAKED = 5;

/* The two preset sources, which are NOT the same kind of thing:
 *  USER  — files under presets/<module-id>/, wrapped {name,module,version,state};
 *          recalled through the ordinary <comp>:state slot-load path. A real list.
 *  BAKED — the module's own list_param/count_param/name_param bank. There is no
 *          file and no way to read a name without WRITING the index first, so it
 *          browses as a scrubber that changes the sound as you move. That's the
 *          mechanism (the host's preset level behaves identically), not a gap. */
const SRC_USER = 0, SRC_BAKED = 1;

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
    presetSrcSkipped: false,    /* jumped straight to USER (no baked bank) — Back must skip back too */
    userPresets: [],
    userIdx: 0,
    bakedCount: 0,
    bakedIdx: 0,
    bakedName: '',
    presetMsg: '',

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

    shiftHeld: false,
    tickCount: 0,
    dirty: true,
};

function log(msg) {
    if (typeof console !== 'undefined' && console.log) console.log('[sound] ' + msg);
}

export function soundActive() { return S.active; }
export function soundTrack() { return S.track; }
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
    S.dirty = true;
    log('enter: track ' + track + ' slot ' + slot);
}

export function soundExit() {
    S.active = false;
    S.pendingWrites.length = 0;
    S.pendingAction = null;
    S.pendingDiscover = 0;
    S.dirty = true;
    log('exit');
}

/* Which module each block holds — drives the picker and the empty-block flow. */
function refreshBlockNames() {
    S.blockNames = BLOCKS.map(b => engineLoadedModule(S.slot, b.comp) || '');
}

/* ---- discovery ---- */

function openBlock(idx) {
    S.blockIdx = idx;
    S.comp = BLOCKS[idx].comp;
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
    if (S.presetSpec) {
        S.presetSrcSkipped = false;
        S.presetSrcIdx = SRC_USER;
        S.view = VIEW_PRESET_SRC;
    } else {
        /* No baked bank — a one-row source picker is just a dead click, so go
         * straight to the user store and remember to skip it on the way back. */
        S.presetSrcSkipped = true;
        openUserPresets();
    }
}

function openUserPresets() {
    S.userPresets = engineListUserPresets(S.moduleId);
    S.userIdx = 0;
    S.view = VIEW_PRESET_LIST;
    S.presetMsg = S.userPresets.length ? '' : 'NO USER PRESETS';
    log('user presets: ' + S.userPresets.length + ' for ' + S.moduleId);
}

function loadUserPreset() {
    const p = S.userPresets[S.userIdx];
    if (!p) return;
    const blob = engineReadUserPreset(p.path);
    if (blob === null) { S.presetMsg = 'UNREADABLE'; return; }
    engineSetState(S.slot, S.comp, blob);
    S.presetMsg = 'LOADED';
    /* The whole param set just changed underneath the cached values. */
    S.pendingDiscover = 4;
}

/* Baked banks are an INDEX, not a list: the only way to learn a preset's name
 * is to select it. So this browses by scrubbing — each step writes the index
 * and the next poll reads the name back. Moving the cursor changes the sound,
 * which is the module's own behaviour, not ours. */
function openBaked() {
    const sp = S.presetSpec;
    if (!sp) return;
    S.bakedCount = parseInt(engineGet(S.slot, S.comp, sp.countKey) || '0', 10) || 0;
    S.bakedIdx = parseInt(engineGet(S.slot, S.comp, sp.listKey) || '0', 10) || 0;
    S.bakedName = engineGet(S.slot, S.comp, sp.nameKey) || '';
    S.view = VIEW_PRESET_BAKED;
    S.presetMsg = S.bakedCount ? '' : 'NO PRESETS';
    log('baked: ' + S.bakedCount + ' via ' + sp.listKey);
}

/* Deferred like every other engine call — the write is queued, and the name
 * read happens on the drain so it reflects the index that actually landed. */
function commitBaked() {
    const sp = S.presetSpec;
    if (!sp || !S.bakedCount) return;
    engineSet(S.slot, S.comp, sp.listKey, String(S.bakedIdx));
    S.bakedName = engineGet(S.slot, S.comp, sp.nameKey) || '';
    S.pendingDiscover = 4;   /* preset change moves every param */
}

/* Every entry point below runs from soundTick(), never from a MIDI handler. */
function runAction(a) {
    if (a.t === 'names')        refreshBlockNames();
    else if (a.t === 'open')    openBlock(a.idx);
    else if (a.t === 'browse')  openBrowse(a.idx);
    else if (a.t === 'load')    loadSelected();
    else if (a.t === 'presets') openPresets();
    else if (a.t === 'usrlist') openUserPresets();
    else if (a.t === 'baked')   openBaked();
    else if (a.t === 'usrload') loadUserPreset();
    else if (a.t === 'bakedset') commitBaked();
    S.dirty = true;
}

function runDiscovery() {
    const id = engineLoadedModule(S.slot, S.comp);
    S.moduleId = id;
    if (!id) { S.banks = []; S.sections = []; S.dirty = true; return; }
    const res = discover(S.slot, S.comp);
    S.banks = res.banks;
    S.presetSpec = res.presetSpec || null;
    S.sections = deriveSections(res.banks);
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
function openBrowse(idx) {
    if (idx != null) {
        S.blockIdx = idx;
        S.comp = BLOCKS[idx].comp;
    }
    const spec = COMPONENTS[S.comp];
    const found = spec ? engineListModules(S.comp) : [];
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
    engineLoadModule(S.slot, S.comp, mod.id);
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
function queueWrite(key, val) {
    for (const w of S.pendingWrites) {
        if (w.key === key && w.comp === S.comp) { w.val = val; return; }
    }
    S.pendingWrites.push({ comp: S.comp, key, val });
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

    if (d1 >= 71 && d1 <= 78) {                        /* knobs 1-8 */
        if (S.view !== VIEW_EDIT) return true;
        const delta = decodeDelta(d2);
        if (delta) onKnobTurn(d1 - 71, delta);
        return true;
    }

    if (d1 === 14) {                                   /* jog turn */
        const delta = decodeDelta(d2);
        if (!delta) return true;
        if (S.view === VIEW_BLOCKS) {
            S.blockIdx = listMove(BLOCKS.length, S.blockIdx, delta);
        } else if (S.view === VIEW_BROWSE) {
            S.browseIdx = listMove(S.browseList.length, S.browseIdx, delta);
        } else if (S.view === VIEW_PRESET_SRC) {
            S.presetSrcIdx = listMove(2, S.presetSrcIdx, delta);
        } else if (S.view === VIEW_PRESET_LIST) {
            S.userIdx = listMove(S.userPresets.length, S.userIdx, delta);
        } else if (S.view === VIEW_PRESET_BAKED) {
            const next = listMove(S.bakedCount, S.bakedIdx, delta);
            if (next !== S.bakedIdx) {
                S.bakedIdx = next;
                /* Scrubbing IS selecting for a baked bank — queue the write so a
                 * fast spin costs one drain per tick, not one per detent. */
                S.pendingAction = { t: 'bakedset' };
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
        if (S.view === VIEW_BLOCKS) {
            /* Shift+click SWAPS the module; plain click opens it. Changing what
             * a block IS is rarer and more destructive than editing it, so it
             * costs the modifier and lives only here, at the chain overview
             * where "what is in this block" is the question being asked. */
            S.pendingAction = { t: S.shiftHeld ? 'browse' : 'open', idx: S.blockIdx };
        }
        else if (S.view === VIEW_BROWSE)      S.pendingAction = { t: 'load' };
        /* An EMPTY block has no presets to offer, and its editor's whole job is
         * "pick something" — so click there still means the module browser. */
        else if (S.view === VIEW_EDIT)
            S.pendingAction = S.moduleId ? { t: 'presets' } : { t: 'browse' };
        else if (S.view === VIEW_PRESET_SRC)
            S.pendingAction = (S.presetSrcIdx === SRC_BAKED) ? { t: 'baked' } : { t: 'usrlist' };
        else if (S.view === VIEW_PRESET_LIST) S.pendingAction = { t: 'usrload' };
        else if (S.view === VIEW_PRESET_BAKED) S.presetMsg = 'LOADED';  /* already applied on scrub */
        S.dirty = true;
        return true;
    }

    if (d1 === 51 && d2 >= 64) {                       /* back */
        if (S.view === VIEW_PRESET_LIST || S.view === VIEW_PRESET_BAKED) {
            /* Straight back to the editor when the source picker was skipped,
             * so Back always retraces the way you actually came in. */
            S.view = S.presetSrcSkipped ? VIEW_EDIT : VIEW_PRESET_SRC;
        } else if (S.view === VIEW_PRESET_SRC) {
            S.view = VIEW_EDIT;
        } else if (S.view === VIEW_EDIT || S.view === VIEW_BROWSE) {
            S.view = VIEW_BLOCKS;
            S.pendingAction = { t: 'names' };
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
    if (!S.active || d1 > 7) return false;
    if (status !== 0x90 && status !== 0x80) return false;
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

    if (S.pendingDiscover > 0 && --S.pendingDiscover === 0) runDiscovery();

    /* Drain a bounded number of queued writes. */
    for (let n = 0; n < WRITES_PER_TICK && S.pendingWrites.length; n++) {
        const w = S.pendingWrites.shift();
        engineSet(S.slot, w.comp, w.key, w.val);
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

function overlayIdx() {
    return (S.touchedIdx >= 0 && S.turnedSinceTouch) ? S.touchedIdx : -1;
}

function centreText(y, text) {
    mvPrint(Math.max(0, Math.round((128 - mvWidth(text)) / 2)), y, text, 1);
}

function renderBlocks() {
    clear_screen();
    drawKitHeader('TRACK ' + (S.track + 1) + ' - SOUND', false);
    const ROW_H = 9, VISIBLE = 6;
    const start = Math.max(0, Math.min(S.blockIdx - 2, BLOCKS.length - VISIBLE));
    for (let i = 0; i < VISIBLE; i++) {
        const idx = start + i;
        if (idx >= BLOCKS.length) break;
        const y = 10 + i * ROW_H;
        const sel = (idx === S.blockIdx);
        if (sel) fill_rect(0, y - 1, 128, ROW_H, 1);
        hdrPrint(3, y, BLOCKS[idx].label, sel ? 0 : 1);
        const id = S.blockNames[idx] || '-';
        let t = String(id).toUpperCase();
        while (t.length > 1 && mvWidth(t) > 60) t = t.slice(0, -1);
        mvPrint(Math.max(62, 125 - mvWidth(t)), y + 2, t, sel ? 0 : 1);
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
    drawKitValueOverlay(cells, overlayIdx());
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
    drawKitHeader(modLabel() + ' - PRESETS', false);
    renderRows(['User Presets', modLabel() + ' Presets'], S.presetSrcIdx, '');
}

function renderPresetList() {
    clear_screen();
    drawKitHeader('USER PRESETS', false);
    renderRows(S.userPresets.map(p => p.name), S.userIdx, S.presetMsg || 'NO USER PRESETS');
    if (S.presetMsg && S.userPresets.length) centreText(58, S.presetMsg);
}

/* A baked bank has no list to draw — only the current index and its name, and
 * the name only exists once the index has been written. Hence a scrubber. */
function renderPresetBaked() {
    clear_screen();
    drawKitHeader(modLabel() + ' PRESETS', false);
    if (!S.bakedCount) { centreText(30, S.presetMsg || 'NO PRESETS'); return; }
    centreText(22, String(S.bakedName || '—').toUpperCase());
    centreText(40, (S.bakedIdx + 1) + ' / ' + S.bakedCount);
    if (S.presetMsg) centreText(56, S.presetMsg);
}

export function soundRender() {
    if (!S.active) return false;
    if (S.view === VIEW_BLOCKS) renderBlocks();
    else if (S.view === VIEW_BROWSE) renderBrowse();
    else if (S.view === VIEW_PRESET_SRC) renderPresetSrc();
    else if (S.view === VIEW_PRESET_LIST) renderPresetList();
    else if (S.view === VIEW_PRESET_BAKED) renderPresetBaked();
    else renderEdit();
    return true;
}
