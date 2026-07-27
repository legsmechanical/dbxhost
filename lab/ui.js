/* dAVEBOx Lab — module-hosting dev rig.
 *
 * Proves the phase-1 pipeline end to end, with no sequencer in the way:
 *
 *   slot view  -> pick one of the 4 shadow chain slots
 *   browse     -> list installed sound generators, load one
 *   edit       -> canvaskit bank pages built from the module's own metadata
 *
 * Layering (see docs/reference/MODULE_HOSTING.md):
 *   ui_engine.mjs    the ONLY file that talks to the chain engine  [rewritten for standalone]
 *   ui_discover.mjs  module metadata -> banks of param descriptors [carries over]
 *   ui_cells.mjs     descriptor + value -> render cell             [carries over]
 *   ../ui/ui_movy.mjs  the canvaskit renderer, shared with davebox [carries over]
 *
 * ui_movy.mjs is imported from davebox's own ui/ directory on purpose — esbuild
 * inlines it, so the rig and davebox cannot drift apart. Do not copy it.
 */

import { decodeDelta } from '/data/UserData/schwung/shared/input_filter.mjs';

import {
    COMPONENTS, engineListModules, engineLoadModule, engineLoadedModule,
    engineGet, engineSet, engineSlots, engineFocusedSlot,
} from './ui_engine.mjs';

import { discover, deriveSections, activeSection } from './ui_discover.mjs';

import {
    parseValue, stepValue, commitString, renderCellsForBank,
} from './ui_cells.mjs';

import {
    drawKitBankPage, drawKitHeader, drawKitSectionPicker, drawKitValueOverlay,
    hdrPrint, mvPrint, mvWidth, MV_HDR_H,
} from '../ui/ui_movy.mjs';

/* ---- constants ---- */

const VIEW_SLOT = 0, VIEW_BROWSE = 1, VIEW_EDIT = 2;
const COMPONENT = 'synth';          /* phase 1: instruments only */
const SLOT_COUNT = 4;
const POLL_TICKS = 8;               /* value refresh cadence (~11Hz at 94Hz tick) */
const TOUCH_HOLD_TICKS = 45;        /* how long a turned knob stays "touched" */

/* ---- state ---- */

const S = {
    view: VIEW_SLOT,
    slot: 0,
    slotNames: [],          /* loaded module id per slot */

    browseList: [],
    browseIdx: 0,

    banks: [],
    sections: [],
    bankIdx: 0,
    shiftHeld: false,
    source: '',
    moduleId: '',
    moduleName: '',

    values: {},             /* key -> parsed number */
    rawValues: {},          /* key -> raw string (filepath cells need this) */
    knobAccum: [0, 0, 0, 0, 0, 0, 0, 0],
    touchedIdx: -1,
    touchedTick: 0,

    tickCount: 0,
    dirty: true,
    status: '',
    statusTick: 0,
};

function log(msg) {
    if (typeof console !== 'undefined' && console.log) console.log('[lab] ' + msg);
}

function setStatus(msg) {
    S.status = msg;
    S.statusTick = S.tickCount;
    S.dirty = true;
    log(msg);
}

/* ---- slot survey ---- */

function refreshSlotNames() {
    S.slotNames = [];
    const slots = engineSlots();
    for (let i = 0; i < SLOT_COUNT; i++) {
        const id = engineLoadedModule(i, COMPONENT);
        S.slotNames.push({
            id: id || '',
            channel: (slots[i] && slots[i].channel != null) ? slots[i].channel : (i + 1),
        });
    }
    S.dirty = true;
}

/* ---- module load + discovery ---- */

function openBrowse() {
    const found = engineListModules(COMPONENT);
    /* [ none ] goes LAST, never first. It was at index 0 and the cursor defaults
     * to 0, so any click on an empty/short list unloaded the slot's synth —
     * which is exactly how slots 3 and 4 got wiped during the first device test.
     * Clearing a slot should take deliberate travel, not be the default action. */
    S.browseList = found.concat([{ id: '', name: '[ none ]' }]);
    const active = engineLoadedModule(S.slot, COMPONENT);
    S.browseIdx = 0;
    for (let i = 0; i < S.browseList.length; i++) {
        if (S.browseList[i].id === active) { S.browseIdx = i; break; }
    }
    S.view = VIEW_BROWSE;
    S.dirty = true;
    log('browse: ' + found.length + ' modules for ' + COMPONENT);
    if (!found.length) setStatus('No modules found');
}

function loadSelected() {
    const mod = S.browseList[S.browseIdx];
    if (!mod) return;
    engineLoadModule(S.slot, COMPONENT, mod.id);
    setStatus(mod.id ? 'Loading ' + mod.name : 'Cleared slot ' + (S.slot + 1));
    S.moduleName = mod.name;
    /* The chain host instantiates asynchronously — discovery has to wait a beat
     * or chain_params comes back null and the module looks empty. */
    S.pendingDiscover = 6;
    S.view = VIEW_EDIT;
    S.banks = [];
    S.dirty = true;
}

function runDiscovery() {
    const id = engineLoadedModule(S.slot, COMPONENT);
    S.moduleId = id;
    if (!id) {
        S.banks = [];
        S.source = '';
        S.dirty = true;
        return;
    }
    const res = discover(S.slot, COMPONENT);
    S.banks = res.banks;
    S.sections = deriveSections(res.banks);
    S.source = res.source;
    S.bankIdx = 0;
    S.values = {};
    S.rawValues = {};
    log('discover: ' + id + ' -> ' + res.banks.length + ' banks, ' +
        res.paramCount + ' params, via ' + res.source +
        ' [hier=' + res.hLen + 'B cp=' + res.cpLen + 'B' +
        (res.source === 'chain_params' ? ' why=' + res.hierReason : '') + ']');
    if (!res.banks.length) setStatus('No params published');
    pollValues(true);
    S.dirty = true;
}

/* ---- value polling ----
 * Only the VISIBLE bank is polled. Each read is a synchronous SHM round-trip to
 * the shim, so a full-module poll would cost one round-trip per param per pass.
 * Standalone will make these in-process calls, but keep the discipline: the
 * renderer must never depend on a value it hasn't already been given. */
function pollValues(force) {
    const bank = S.banks[S.bankIdx];
    if (!bank) return;
    for (const cell of bank.cells) {
        if (!cell || !cell.key) continue;
        /* Don't clobber a knob the user is actively turning — the optimistic
         * local value is ahead of what the engine will report this pass. */
        if (!force && S.touchedIdx >= 0 && bank.cells[S.touchedIdx] &&
            bank.cells[S.touchedIdx].key === cell.key) continue;
        const raw = engineGet(S.slot, COMPONENT, cell.key);
        S.rawValues[cell.key] = raw;
        S.values[cell.key] = parseValue(cell, raw);
    }
    S.dirty = true;
}

/* ---- knob edits ---- */

function onKnobTurn(knobIdx, delta) {
    const bank = S.banks[S.bankIdx];
    if (!bank) return;
    const cell = bank.cells[knobIdx];
    if (!cell || !cell.key) return;

    /* Accumulate detents and only move when the cell's sensitivity class says
     * so. This is what gives a dropdown different travel from a filter sweep. */
    S.knobAccum[knobIdx] += delta;
    const sens = cell.sens || 2;
    let steps = 0;
    while (S.knobAccum[knobIdx] >= sens) { steps++; S.knobAccum[knobIdx] -= sens; }
    while (S.knobAccum[knobIdx] <= -sens) { steps--; S.knobAccum[knobIdx] += sens; }

    S.touchedIdx = knobIdx;
    S.touchedTick = S.tickCount;
    S.dirty = true;
    if (!steps) return;

    const next = stepValue(cell, S.values[cell.key], steps);
    if (next === S.values[cell.key]) return;
    S.values[cell.key] = next;
    engineSet(S.slot, COMPONENT, cell.key, commitString(cell, next));
}

/* ---- rendering ---- */

function centreText(y, text) {
    mvPrint(Math.max(0, Math.round((128 - mvWidth(text)) / 2)), y, text, 1);
}

function renderSlotView() {
    clear_screen();
    drawKitHeader('LAB - SLOTS', false);
    for (let i = 0; i < SLOT_COUNT; i++) {
        const y = 13 + i * 12;
        const info = S.slotNames[i] || { id: '', channel: i + 1 };
        const sel = (i === S.slot);
        if (sel) fill_rect(0, y - 1, 128, 11, 1);
        const left = 'SLOT ' + (i + 1) + '  CH' + info.channel;
        hdrPrint(3, y, left, sel ? 0 : 1);
        const right = info.id || '(empty)';
        mvPrint(Math.max(60, 125 - mvWidth(right)), y + 2, right, sel ? 0 : 1);
    }
}

function renderBrowseView() {
    clear_screen();
    drawKitHeader('SLOT ' + (S.slot + 1) + ' - ' + (COMPONENTS[COMPONENT] || {}).label, false);
    const VISIBLE = 5, ROW_H = 10;
    const half = Math.floor(VISIBLE / 2);
    const n = S.browseList.length;
    const start = Math.max(0, Math.min(S.browseIdx - half, n - VISIBLE));
    for (let i = 0; i < VISIBLE; i++) {
        const idx = start + i;
        if (idx >= n) break;
        const y = MV_HDR_H + 3 + i * ROW_H;
        const sel = (idx === S.browseIdx);
        if (sel) fill_rect(0, y - 1, 128, ROW_H, 1);
        let label = String(S.browseList[idx].name);
        while (label.length > 1 && mvWidth(label) > 122) label = label.slice(0, -1);
        mvPrint(3, y + 1, label, sel ? 0 : 1);
    }
}

function renderEditView() {
    clear_screen();
    if (!S.banks.length) {
        drawKitHeader('SLOT ' + (S.slot + 1), false);
        centreText(28, S.moduleId ? 'No params' : 'Empty slot');
        centreText(40, 'Jog click = browse');
        return;
    }
    const bank = S.banks[S.bankIdx];
    const cells = renderCellsForBank(bank, S.values, S.rawValues);
    drawKitBankPage(cells, {
        /* Uppercase for the header font's sake — see the `up()` note in
         * ui_cells.mjs. Raw level names render as "EdIt" / "TONE2/WAVE" mixed. */
        headerText: String(bank.name || '').toUpperCase(),
        headerInvert: false,
        pageIdx: S.bankIdx,
        pageCount: S.banks.length,
        touchedIdx: S.touchedIdx,
    });
    /* Turn-to-reveal value zoom for the knob being turned. Shares the same box
     * footprint as the enum picker (drawKitBankPage draws that one for discrete
     * lists), so the two read as one control rather than two pop-ups. */
    if (S.touchedIdx >= 0) drawKitValueOverlay(cells, S.touchedIdx);

    /* Section picker rides ON TOP of the page while shift is held — it clears
     * its own footprint, so the page underneath costs nothing to draw first
     * and reappears the instant shift is released. */
    if (S.shiftHeld && S.sections.length > 1) {
        drawKitSectionPicker(S.sections, activeSection(S.sections, S.bankIdx));
    }
}

function render() {
    if (S.view === VIEW_SLOT) renderSlotView();
    else if (S.view === VIEW_BROWSE) renderBrowseView();
    else renderEditView();

    /* Transient status line over the bottom of whatever view is up. */
    if (S.status && S.tickCount - S.statusTick < 90) {
        fill_rect(0, 55, 128, 9, 0);
        fill_rect(0, 55, 128, 1, 1);
        centreText(57, S.status);
    }
}

/* ---- MIDI ---- */

function onCC(d1, d2) {
    /* knobs 1-8 */
    if (d1 >= 71 && d1 <= 78) {
        if (S.view !== VIEW_EDIT) return;
        const delta = decodeDelta(d2);
        if (delta) onKnobTurn(d1 - 71, delta);
        return;
    }

    /* jog turn */
    if (d1 === 14) {
        const delta = decodeDelta(d2);
        if (!delta) return;
        if (S.view === VIEW_SLOT) {
            S.slot = Math.max(0, Math.min(SLOT_COUNT - 1, S.slot + (delta > 0 ? 1 : -1)));
        } else if (S.view === VIEW_BROWSE) {
            const n = S.browseList.length;
            if (n) S.browseIdx = Math.max(0, Math.min(n - 1, S.browseIdx + (delta > 0 ? 1 : -1)));
        } else if (S.banks.length) {
            if (S.shiftHeld && S.sections.length > 1) {
                /* Shift+jog = coarse jump by SECTION. Landing bank is the
                 * section's first, so releasing shift leaves you there. */
                const cur = activeSection(S.sections, S.bankIdx);
                const next = Math.max(0, Math.min(S.sections.length - 1,
                                                  cur + (delta > 0 ? 1 : -1)));
                S.bankIdx = S.sections[next].bank;
            } else {
                S.bankIdx = Math.max(0, Math.min(S.banks.length - 1,
                                                 S.bankIdx + (delta > 0 ? 1 : -1)));
            }
            S.touchedIdx = -1;
            pollValues(true);
        }
        S.dirty = true;
        return;
    }

    /* jog click */
    if (d1 === 3 && d2 >= 64) {
        if (S.view === VIEW_SLOT) {
            if (typeof shadow_set_focused_slot === 'function') shadow_set_focused_slot(S.slot);
            S.view = VIEW_EDIT;
            runDiscovery();
        } else if (S.view === VIEW_BROWSE) {
            loadSelected();
        } else {
            openBrowse();
        }
        S.dirty = true;
        return;
    }

    /* back */
    if (d1 === 51 && d2 >= 64) {
        if (S.view === VIEW_EDIT || S.view === VIEW_BROWSE) {
            S.view = VIEW_SLOT;
            refreshSlotNames();
        } else if (typeof host_exit_module === 'function') {
            host_exit_module();
        }
        S.dirty = true;
        return;
    }

    /* shift — CC 49 on Move. The picker is a held-modifier overlay, so both
     * edges must redraw: press shows it, release hides it. */
    if (d1 === 49) {
        const held = d2 >= 64;
        if (held !== S.shiftHeld) { S.shiftHeld = held; S.dirty = true; }
        return;
    }
}

/* ---- lifecycle ---- */

globalThis.init = function () {
    S.slot = engineFocusedSlot();
    if (S.slot < 0 || S.slot >= SLOT_COUNT) S.slot = 0;
    S.view = VIEW_SLOT;
    S.tickCount = 0;
    refreshSlotNames();
    log('init: focused slot ' + S.slot);
    S.dirty = true;
};

globalThis.tick = function () {
    S.tickCount++;

    if (S.pendingDiscover > 0) {
        S.pendingDiscover--;
        if (S.pendingDiscover === 0) runDiscovery();
    }

    if (S.view === VIEW_EDIT && S.banks.length && S.tickCount % POLL_TICKS === 0) {
        pollValues(false);
    }

    if (S.touchedIdx >= 0 && S.tickCount - S.touchedTick > TOUCH_HOLD_TICKS) {
        S.touchedIdx = -1;
        S.dirty = true;
    }

    /* The page bar animates, so the edit view redraws on the poll cadence. */
    if (S.view === VIEW_EDIT && S.tickCount % POLL_TICKS === 0) S.dirty = true;

    if (S.dirty) { render(); S.dirty = false; }
};

globalThis.onMidiMessageInternal = function (data) {
    if (!data || data.length < 3) return;
    const status = data[0] & 0xF0;
    /* Dispatch by STATUS first. Pad notes are 68-99 and knob CCs are 71-78 —
     * overlapping numbers, different message types. Getting this wrong swallows
     * every knob turn (movy's oldest gotcha). */
    if (status === 0xB0) { onCC(data[1], data[2]); return; }
};

globalThis.onMidiMessageExternal = function () { /* unused in the rig */ };
