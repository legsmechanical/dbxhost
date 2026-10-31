/* ui_automation_bank.mjs — THE AUTOMATION BANK (spec §2, ⭑RULED Josh 2026-09-02).
 *
 * Replaces the old AUTO bank 6 on the walk: the bank card is a LIST of what is
 * automated in the current clip — every kind: chain parameters, levels, MIDI
 * targets, the pads' aftertouch — framed with the module editor's bracketed
 * corners to say "press jog to interact". The eight knobs are a no-op here.
 *
 *   card (latched)  → jog click → the MENU: the same list with a cursor, plus a
 *                                  CLEAR CLIP row at the end
 *   + Add lane      → jog click → the MACROS picker: the parameter chosen gets
 *                                  an EMPTY lane, opened in its operations
 *   menu row        → jog click → the row's OPERATIONS, floating over the list:
 *                                  Delete · Mute/Unmute · Smooth/Stepped (floats)
 *                                  · Loop (clip, or N steps — click to edit,
 *                                  turn, click to set) · Scale (0-200 %, same
 *                                  shape: the lane's values up or down)
 *   Delete + click on a lane row  → CLEAR that lane (Josh, 2026-10-20 — it
 *                                  used to clear ALL, from anywhere)
 *   Back                          → ops → menu → card → (davebox's own: out)
 *
 * Every edit takes an UNDO CHECKPOINT (ui_automation queues it). Smooth/Stepped
 * lives HERE now — the module editor's knob-touch + jog-click toggle is gone.
 *
 * ⚠ The old bank-6 machinery (CC lanes, its LEDs, its step editor) is not on
 * the walk any more and is deleted in P8; its per-clip AT lane still records
 * pad pressure, so it is listed here as a row of its own kind (Delete only).
 *
 * Reads: none per tick. The list is the automation owner's cache (one pa_list
 * read per project load and per edit); labels use the owner's metadata cache
 * (one chain_params read per component, ever). */

import { S, noteUndoUnit, armBankDisplay } from './ui_state.mjs';
import { BANK_AUTOMATION, BANK_SOUND, BANK_MACROS, PAD_MODE_DRUM, midiTargetIsMidi, SEQ_AUTO_TARGETS, AU_AUTO_BANK } from './ui_constants.mjs';
import { openWave, closeAudioPanel } from './ui_audio_editor.mjs';
import { soundOpen, soundExit, soundJumpToParam, soundEditorComp, soundAutoAddLane, soundLaneFocusRow } from './ui_sound.mjs';
import { readBankParams } from './ui_dsp_bridge.mjs';
import { effectiveClip } from './ui_leds.mjs';
import { automationEntriesFor, automationTargetLabel, automationClearKey, automationClearPoints,
         automationToggleActive, automationToggleWrap, automationToggleLink,
         automationSetLoop, automationSetRate, automationRateText, automationSetScale,
         automationClearClip, automationListGen, automationStepTicks, rowCycle,
         cycleText, automationMatchPad, padCycle, automationStateFor, automationWireValue,
         automationTargetStepped } from './ui_automation.mjs';
import { drawKitList, drawKitStackedList, drawKitBackdropDim, drawKitHintRow,
         drawBrackets, kitUseLayout, kitLaneFocusRow, rectOutline, MV_FOOTER_Y,
         MV_ROW0_Y, MV_ROW1_Y, MV_LBL1_Y, MV_LBL_H } from './ui_movy.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { schSlotForTrack } from './ui_corun.mjs';
import { moveBusForChannel } from './ui_engine.mjs';
import { followActive } from './ui_prefs.mjs';

const LIST_TOP = 11;                 /* the kit list's own default */
/* The ops pop-up and the lane graph under it (bank layout; the mockups'
 * geometry): the box rows OPS_TOP..OPS_BOTTOM-1, the list behind dimmed from
 * under the header band, everything from OPS_CLEAR_Y down cleared for the
 * graph — a full-width rule, the curve, and the page bar on the last rows. */
const OPS_TOP = 3, OPS_BOTTOM = 34, OPS_DIM_TOP = 9, OPS_CLEAR_Y = 34;
const GRAPH_RULE_Y = 36, GRAPH_BAR_Y = 60, GRAPH_X = 1, GRAPH_W = 126;
/* Samples the lane's shape is read at: one a graph column. */
export const LANE_SHAPE_N = GRAPH_W;

/* The state lives on davebox's global S so a view switch / bank walk can drop
 * it from anywhere: { menu, sel, ops: { rows, sel, row } | null, loopEdit,
 * loopVal }. Lazily created; `reset` puts it back to the plain card. */
function st() {
    if (!S.autoBank) S.autoBank = { menu: false, sel: 0, ops: null, loopEdit: false, loopVal: 0 };
    return S.autoBank;
}
export function autoBankReset() {
    if (S.autoBank) { S.autoBank.menu = false; S.autoBank.ops = null; S.autoBank.loopEdit = false; S.autoBank.rateEdit = false; S.autoBank.scaleEdit = false; S.autoBank.cycleTarget = null; }
}
export function autoBankMenuOpen() { return !!(S.autoBank && (S.autoBank.menu || S.autoBank.ops)); }
/* The AUTOMATION menu is up and in use (its door screen; nothing else opens
 * it since Bank Lock went, 2026-10-04). An open menu is itself a reason the
 * card shows (bankCardVisible). */
export function autoMenuUp() {
    return S.activeBank === BANK_AUTOMATION && !S.sessionView && autoBankMenuOpen();
}

/* THE LANE JUMP (plan 6c2): Shift + click on a lane in the menu. The lane
 * under the cursor as { target, sel }, or null — only on the lane list itself
 * (no ops pop-up open), and only for a parameter lane (the pads' aftertouch
 * row has nowhere to jump to). */
export function autoBankJumpTarget() {
    const a = S.autoBank;
    if (!a || !a.menu || a.ops) return null;
    const t = S.activeTrack, c = effectiveClip(t);
    const r = autoBankRows(t, c)[a.sel];
    return (r && r.kind === 'entry') ? { target: r.target, sel: a.sel } : null;
}
/* Back from a jump: the menu again, with the cursor on the lane you left. */
export function autoBankRestoreMenu(sel) {
    const a = st();
    a.menu = true; a.ops = null;
    a.loopEdit = false; a.rateEdit = false; a.scaleEdit = false;
    a.sel = Math.max(0, sel | 0);
    /* Back from a jump: the menu takes the lane over again, on the page the
     * pin was showing (cycleTarget still names it, so the row keeps it). */
    lanePin = null;
}

/* The rows: every entry of the current clip (sorted by label so the list is
 * stable across edits), then the pads' aftertouch lane if the clip has one. */
export function autoBankRows(track, clip) {
    const rows = [];
    for (const e of automationEntriesFor(track, clip)) {
        rows.push({ kind: 'entry', target: e.target, label: automationTargetLabel(e.target),
                    active: e.active, wrapReset: !!e.wrapReset,
                    linked: e.linked !== false,
                    count: e.count, loop: e.loop, res: e.res, lo: e.lo | 0, st: e.st | 0,
                    scale: isFinite(e.scale) ? e.scale : 100 });
    }
    rows.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    if (S.clipAtHas[track] && S.clipAtHas[track][clip]) rows.push({ kind: 'at', label: 'Aftertouch (pads)' });
    return rows;
}
/* Land on `target`'s row with its operations open — where "+ Add lane" ends,
 * so the new lane's settings are chosen before anything is written into it. */
export function autoBankOpenLane(target) {
    const t = S.activeTrack, c = effectiveClip(t);
    const a = st();
    const rows = autoBankRows(t, c);
    const i = rows.findIndex(r => r.kind === 'entry' && r.target === target);
    a.menu = true;
    a.loopEdit = false; a.rateEdit = false; a.scaleEdit = false;
    if (i < 0) { a.ops = null; return; }
    a.sel = i;
    a.ops = { rows: opsFor(t, c, rows[i]), sel: 0, row: rows[i] };
}

/* The value column is the lane's CYCLE (Josh, 2026-09-24): "4 BAR", "13 ST",
 * "13 ST/32", or "CLIP" when it follows the clip — with lanes at different
 * lengths, how long each one loops is the thing that is hard to remember.
 * Muted still reads OFF; Wrap lives in the row's ops as a setting. */
function rowValue(r, track, clip) {
    if (r.kind === 'at') return 'PADS';
    if (!r.active) return 'OFF';
    const cy = rowCycle(track, clip, r.target);
    /* Cleared and kept: nothing in it yet — but it keeps its LENGTH, which is
     * what the next recording or step input lands on (Josh, 2026-09-26: "can
     * we have empty lanes still have a length? that way you can clear
     * automation make a really long or short lane and start recording"). */
    if (!r.count) return cy ? 'EMPTY ' + cy.text : 'EMPTY';
    return cy ? cy.text : 'ON';
}
function loopText(steps) { return steps > 0 ? (steps + ' ST') : 'CLIP'; }
function scaleText(pct) { return (isFinite(pct) ? pct : 100) + '%'; }
function wrapText(reset) { return reset ? 'Reset' : 'Carry'; }
function linkText(linked) { return linked ? 'On' : 'Off'; }

/* A row's step in ticks: a drum lane's own (its cycle's grid), else the
 * clip's / pad's. */
function rowTps(track, clip, r) {
    return (r.st > 0 && r.loop > 0) ? r.st : automationStepTicks(track, clip);
}
/* Loop length in STEPS for the row (the store keeps ticks). */
function rowLoopSteps(track, clip, r) {
    const tps = rowTps(track, clip, r);
    return r.loop > 0 ? Math.max(1, Math.round(r.loop / tps)) : 0;
}
/* The Loop row's value: on a drum track the lane's CYCLE, never CLIP (every
 * drum lane has one); elsewhere steps, or CLIP to follow the clip. */
function loopValue(track, clip, r, steps) {
    if (S.trackPadMode[track] === PAD_MODE_DRUM && steps > 0) return cycleText(steps, rowTps(track, clip, r));
    return loopText(steps);
}

function opsFor(track, clip, r) {
    if (r.kind === 'at') return [{ op: 'delete', label: 'Delete' }];
    /* Delete is LAST, Clear beside it (Josh, 2026-09-25: "delete should be
     * moved to the bottom of the automation menu"). */
    const ops = [{ op: 'active', label: r.active ? 'Mute' : 'Unmute' }];
    /* ⭑ SET-AND-FORGET SETTINGS READ AS SETTINGS (Josh, 2026-09-11): a static
     * label on the left and the VALUE on the right — "Wrap: Carry/Reset." —
     * not an action label that flips its own wording. A click flips the value
     * in place (see runOp). WRAP: what the lane does at the loop end — Carry
     * glides into its start, Reset holds and jumps back (every lane: there are
     * no lane modes, every lane is one envelope). */
    ops.push({ op: 'wrap', label: 'Wrap', value: wrapText(r.wrapReset) });
    /* LINK (plan 6c): does the lane move with its notes? */
    ops.push({ op: 'link', label: 'Link', value: linkText(r.linked) });
    ops.push({ op: 'loop', label: 'Loop', value: loopValue(track, clip, r, rowLoopSteps(track, clip, r)) });
    /* A drum lane's cycle is a snapshot of the pad it was recorded on; Match
     * pad re-takes it from the pad selected NOW (its value, before you press). */
    if (S.trackPadMode[track] === PAD_MODE_DRUM) {
        const p = padCycle(track);
        ops.push({ op: 'match', label: 'Match pad', value: cycleText(p.len, p.tps) });
    }
    ops.push({ op: 'rate', label: 'Rate', value: automationRateText(r.res) });
    ops.push({ op: 'scale', label: 'Scale', value: scaleText(r.scale) });
    ops.push({ op: 'clear', label: 'Clear' });
    ops.push({ op: 'delete', label: 'Delete' });
    return ops;
}

/* ---- render ------------------------------------------------------------- */
/* The card, with the menu and the ops overlay when open. `heading` is drawn
 * by the caller (ui_render's bank heading, prefix and all). */
export function drawAutomationBankBody() {
    const t = S.activeTrack, c = effectiveClip(t);
    const a = st();
    const rows = autoBankRows(t, c);
    const listRows = rows.map(r => ({ label: r.label, value: rowValue(r, t, c) }));
    if (a.menu) {
        listRows.push({ label: '+ Add lane' });
        if (rows.length) listRows.push({ label: 'Clear all', hdr: true });
    }
    if (a.sel >= listRows.length) a.sel = Math.max(0, listRows.length - 1);
    kitUseLayout('bank');
    /* ⚠ h: the list's box ENDS AT THE FOOTER. Left to the screen's height it
     * drew a fifth row down through the hint pills (Aftertouch ran into
     * CLK MENU); four rows fit above them and the list scrolls, as it does in
     * the ops pop-up below. A multi-page cycle also draws the track overview's
     * page bar at rows 50–53 (ui_render), so the list keeps to four rows then. */
    const barShown = !!(S.autoCycle && S.autoCycle.t === t && S.autoCycle.pages > 1);
    const listOpts = { emptyMsg: 'NO AUTOMATION', h: MV_FOOTER_Y - LIST_TOP };
    if (barShown) listOpts.visible = 4;
    drawKitList(listRows, a.menu ? a.sel : -1, listOpts);
    /* The editor's bracketed corners on the resting card: "press jog to
     * interact" — the one mark the OLED language uses for that. */
    if (!a.menu) drawBrackets(0, LIST_TOP - 1, 128, MV_FOOTER_Y - LIST_TOP);
    let hints;
    if (a.ops) {
        /* Match pad reads the pad selected NOW: a pad tapped while the
         * pop-up is open changes it (Josh, 2026-09-25: it "stays at 12steps
         * regardless of what pad i'm using"). */
        const mr = a.ops.rows.find(o => o.op === 'match');
        if (mr) { const p = padCycle(t); mr.value = cycleText(p.len, p.tps); }
        const ors = a.ops.rows.map((o, i) => ({
            label: o.label,
            value: (o.op === 'loop' || o.op === 'rate' || o.op === 'scale')
                ? ((a.loopEdit || a.rateEdit || a.scaleEdit) && i === a.ops.sel ? '<' + o.value + '>' : o.value)
                : (o.op === 'wrap' || o.op === 'link' || o.op === 'match') ? o.value : undefined,
        }));
        /* ⭐ THE LANE ON SCREEN (2026-10-22): the pop-up moves UP — over the
         * lower half of the header — and gets SHORT (four rows in the header
         * face), so the lower half of the screen is the lane itself: its whole
         * window as a graph, the page bar as the graph's bottom edge, and the
         * playhead through both (drawAutomationOpsGraph, called by the bank's
         * renderer after this). A regular menu, so it carries no hints — the
         * lane list keeps its own. The list behind is dimmed down to the
         * pop-up's foot; everything below is the graph's. */
        drawKitBackdropDim(0, OPS_DIM_TOP, 128, OPS_CLEAR_Y + 1 - OPS_DIM_TOP);
        fill_rect(0, OPS_CLEAR_Y, 128, 64 - OPS_CLEAR_Y, 0);
        drawKitStackedList(1, ors, a.ops.sel, { topY: OPS_TOP, bottomY: OPS_BOTTOM, font: '4x5', rowH: 7 });
        return;
    } else if (a.menu) {
        /* Josh, 2026-10-21: "Need to add hints for shift. Get rid of jog:row
         * and back:card (those are self explanatory)". Shift + click jumps to
         * where the lane's parameter is edited — hinted only on a lane row
         * that has such a place on this track. */
        const jt = autoBankJumpTarget();
        const nLanes = autoBankRows(S.activeTrack, effectiveClip(S.activeTrack)).length;
        hints = a.sel === nLanes ? [['CLK', 'ADD']]
              : a.sel > nLanes ? [['CLK', 'CLEAR']]
              : (jt && laneHome(jt.target, S.activeTrack)) ? [['CLK', 'OPS'], ['SHFT', 'JUMP']] : [['CLK', 'OPS']];
    } else {
        hints = [['CLK', 'MENU'], [S.heldStep >= 0 ? 'JOG' : 'JOG', S.heldStep >= 0 ? 'STEP' : 'BANK'], ['BACK', 'OUT']];
    }
    drawKitHintRow(MV_FOOTER_Y, hints);
}

/* ---- input --------------------------------------------------------------- */
/* Jog click on the latched card. */
export function autoBankClick() {
    const t = S.activeTrack, c = effectiveClip(t);
    const a = st();
    const rows = autoBankRows(t, c);
    if (a.ops) { runOp(t, c, a); return; }
    if (!a.menu) { a.menu = true; a.sel = 0; return; }
    if (a.sel === rows.length) { soundAutoAddLane(t, c, a.sel); return; }   /* + Add lane */
    /* Clear all is listed only when there is a lane to clear: with none, a
     * click past the end does nothing (it used to say NONE and close the list). */
    if (a.sel > rows.length) { if (rows.length) autoBankClearClip(); return; }
    const r = rows[a.sel];
    a.ops = { rows: opsFor(t, c, r), sel: 0, row: r };
    a.loopEdit = false; a.rateEdit = false; a.scaleEdit = false;
}
/* Delete + jog click (Josh, 2026-10-20: "Get rid of delete + jog click to
 * clear all automation. Instead, delete + jog click when an automation lane is
 * selected from the list, should clear just that lane."). The lane under the
 * cursor is cleared — its row's own Clear (the aftertouch row's Delete, its
 * only clear). Anywhere else — the card, the Clear all row, an open op — it
 * does nothing: clearing everything is the Clear all row's click, on purpose. */
export function autoBankDeleteClick() {
    const t = S.activeTrack, c = effectiveClip(t);
    const a = st();
    if (!a.menu || a.ops) return;
    const rows = autoBankRows(t, c);
    const r = rows[a.sel];
    if (!r) return;
    if (r.kind === 'at') {
        S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + c + '_undo_checkpoint', val: '1' });
        noteUndoUnit();
        S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + c + '_at_clear', val: '1' });
        S.clipAtHas[t][c] = false;
        /* Its row goes, and the cursor must not slide onto Clear all — a
         * second click there would clear the whole clip. */
        if (a.sel > 0) a.sel--;
        showActionPopup('AFTERTOUCH', 'CLEARED');
        return;
    }
    if (r.kind !== 'entry') return;
    if (automationClearPoints(t, c, r.target)) showActionPopup('AUTOMATION', 'CLEARED');
}
function runOp(t, c, a) {
    const o = a.ops.rows[a.ops.sel], r = a.ops.row;
    if (!o) return;
    if (o.op === 'loop') {
        /* Click enters the edit; every turn APPLIES (Josh, 2026-09-03: "take
         * effect on value change rather than confirmation click"); the next
         * click — or Back — just leaves it. One checkpoint per edit session. */
        if (!a.loopEdit) { a.loopEdit = true; a.loopVal = rowLoopSteps(t, c, r); a.loopCkpt = false; return; }
        a.loopEdit = false; a.ops = null;
        return;
    }
    if (o.op === 'rate') {
        /* Same shape as Loop: click to edit, every turn applies, click/Back leaves. */
        if (!a.rateEdit) { a.rateEdit = true; a.rateVal = (r.res >= 1 && r.res <= 9) ? r.res : 5; a.rateCkpt = false; return; }
        a.rateEdit = false; a.ops = null;
        return;
    }
    if (o.op === 'scale') {
        /* Same shape again: click to edit, every detent applies 1 %, click/Back leaves. */
        if (!a.scaleEdit) { a.scaleEdit = true; a.scaleVal = isFinite(r.scale) ? r.scale : 100; a.scaleCkpt = false; return; }
        a.scaleEdit = false; a.ops = null;
        return;
    }
    if (r.kind === 'at') {
        if (o.op === 'delete') {
            S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + c + '_undo_checkpoint', val: '1' });
            noteUndoUnit();   /* the checkpoint is only reachable if Undo knows it is there */
            S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + c + '_at_clear', val: '1' });
            S.clipAtHas[t][c] = false;
            showActionPopup('AFTERTOUCH', 'DELETED');
        }
        a.ops = null;
        return;
    }
    if (o.op === 'match') {
        /* One press: the lane's cycle is the selected pad's. The pop-up stays
         * open on the new Loop value. */
        if (automationMatchPad(t, c, r.target)) {
            const p = padCycle(t);
            r.loop = p.len * p.tps; r.lo = p.off * p.tps; r.st = p.tps;
            const lr = a.ops.rows.find(x => x.op === 'loop');
            if (lr) lr.value = loopValue(t, c, r, p.len);
        }
        return;
    }
    if (o.op === 'delete') {
        if (automationClearKey(t, c, r.target)) showActionPopup('AUTOMATION', 'DELETED');
    } else if (o.op === 'clear') {
        if (automationClearPoints(t, c, r.target)) showActionPopup('AUTOMATION', 'CLEARED');
    } else if (o.op === 'active') {
        const on = automationToggleActive(t, c, r.target);
        if (on !== null) showActionPopup('AUTOMATION', on ? 'ON' : 'MUTED');
    } else if (o.op === 'link') {
        /* A setting, flipped in place like Wrap. */
        const linked = automationToggleLink(t, c, r.target);
        if (linked !== null) { r.linked = linked; o.value = linkText(linked); }
        return;
    } else if (o.op === 'wrap') {
        /* A setting, not an action: flip it IN PLACE and keep the pop-up open,
         * so the value you just set is the thing you are looking at. */
        const reset = automationToggleWrap(t, c, r.target);
        if (reset !== null) { r.wrapReset = reset; o.value = wrapText(reset); }
        return;
    }
    a.ops = null;
}
/* Jog turn while the menu or the ops are open. Returns true when consumed. */
export function autoBankJog(delta) {
    const a = st();
    if (!a.menu && !a.ops) return false;
    const t = S.activeTrack, c = effectiveClip(t);
    if (a.ops) {
        if (a.scaleEdit) {
            const nv = Math.max(0, Math.min(200, a.scaleVal + delta));
            if (nv !== a.scaleVal) {
                a.scaleVal = nv;
                automationSetScale(t, c, a.ops.row.target, nv, !a.scaleCkpt);
                a.scaleCkpt = true;
                a.ops.row.scale = nv;
                const sr = a.ops.rows.find(x => x.op === 'scale');
                if (sr) sr.value = scaleText(nv);
            }
            return true;
        }
        if (a.rateEdit) {
            const nv = Math.max(1, Math.min(9, a.rateVal + delta));
            if (nv !== a.rateVal) {
                a.rateVal = nv;
                automationSetRate(t, c, a.ops.row.target, nv, !a.rateCkpt);
                a.rateCkpt = true;
                a.ops.row.res = nv;
                const rr = a.ops.rows.find(x => x.op === 'rate');
                if (rr) rr.value = automationRateText(nv);
            }
            return true;
        }
        if (a.loopEdit) {
            /* A lane counts in ITS OWN steps and may run past its clip or pad —
             * it plays in full on the master clock (Josh, 2026-09-26: a Loop can
             * be shorter or longer than its clip) — up to 256 steps, or what the
             * store's 16-bit tick holds from where it starts. A drum lane from 1;
             * a melodic one from 0, which is CLIP (follow the clip). */
            const r = a.ops.row, drum = S.trackPadMode[t] === PAD_MODE_DRUM;
            const tps = rowTps(t, c, r);
            const max = Math.max(1, Math.min(256, Math.floor((65535 - (r.lo | 0)) / tps)));
            const nv = Math.max(drum ? 1 : 0, Math.min(max, a.loopVal + delta));
            if (nv !== a.loopVal) {
                a.loopVal = nv;
                automationSetLoop(t, c, r.target, nv > 0 ? nv * tps : 0, !a.loopCkpt);
                a.loopCkpt = true;
                r.loop = nv > 0 ? nv * tps : 0;
                const lr = a.ops.rows.find(x => x.op === 'loop');
                if (lr) lr.value = loopValue(t, c, r, nv);
            }
        } else {
            a.ops.sel = Math.max(0, Math.min(a.ops.rows.length - 1, a.ops.sel + delta));
        }
        return true;
    }
    /* After the lanes: + Add lane, then Clear all when there is a lane. */
    const nr = autoBankRows(t, c).length;
    const n = nr + (nr ? 2 : 1);
    a.sel = Math.max(0, Math.min(n - 1, a.sel + delta));
    return true;
}
/* Back: one layer at a time. Returns false when there was nothing of ours to
 * close, so davebox's own Back (out of bank mode) runs. */
export function autoBankBack() {
    const a = st();
    if (a.loopEdit) { a.loopEdit = false; return true; }
    if (a.rateEdit) { a.rateEdit = false; return true; }
    if (a.scaleEdit) { a.scaleEdit = false; return true; }
    if (a.ops) { a.ops = null; return true; }
    if (a.menu) { a.menu = false; a.cycleTarget = null; return true; }
    return false;
}
/* Delete + jog click on the card, and the menu's last row. */
export function autoBankClearClip() {
    const t = S.activeTrack, c = effectiveClip(t);
    const a = st();
    let any = automationClearClip(t, c);
    if (S.clipAtHas[t] && S.clipAtHas[t][c]) {
        S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + c + '_at_clear', val: '1' });
        S.clipAtHas[t][c] = false;
        any = true;
    }
    /* ⚠⚠ THE SNAPSHOT WAS TAKEN AND THEN STRANDED. Both halves book a DSP
     * checkpoint (automationClearClip queues tN_cC_undo_checkpoint; the DSP's
     * _at_clear calls undo_begin_single itself) — but nothing set S.undoAvailable,
     * so Undo answered "NOTHING TO UNDO" while a perfectly good snapshot sat
     * unused. One line, and the bank becomes undoable with no new state.
     * ⚠ Only when something was ACTUALLY cleared: raising the flag on a no-op
     * would make Undo revert an unrelated older edit still in the slot. */
    if (any) noteUndoUnit();
    showActionPopup('AUTOMATION', any ? 'CLIP CLEARED' : 'NONE');
    /* The list stays as it was: AUTOMATION is a screen, and clearing the clip
     * from its last row leaves you on it (now reading NO AUTOMATION), not on a
     * closed card that needs a click to come back. */
    a.ops = null; a.sel = 0;
}
/* ---- the step row: the selected lane's steps, blinking ------------------- */
/* Josh, 2026-09-10: "when scrolling through automation rows, have any p-locks
 * related to the lane light up on the step sequencer (blinking white)."
 *
 * The DSP answers the whole clip in ONE read (tN_cC_pa_steps: a step mask per
 * lane), cached until the list changes (automationListGen) or the clip does —
 * so moving the cursor costs nothing, and a menu left open costs nothing.
 * It must run from the TICK: get_param answers null from the MIDI handler.
 * The painter (ui_leds) only reads S.autoBankLit, set here each tick. */
let litCache = { key: null, map: null };
let litTryMs = -1e9;
/* A failed read is asked again after this long — milliseconds off the one
 * clock, never ticks (a tick's length is the tick's cost). */
const LIT_RETRY_MS = 500;

/* The lane under the cursor — or the one whose ops are open — else null. */
function selectedTarget(t, c) {
    const a = S.autoBank;
    if (!a || !(a.menu || a.ops)) return null;
    const r = a.ops ? a.ops.row : autoBankRows(t, c)[a.sel];
    return r && r.kind === 'entry' ? r.target : null;
}

/* The gradient's values: one read per page for the whole clip
 * (tN_cC_pa_vals_<base>_<tps>), refreshed when the page, the lane list or the
 * clip changes, and on a slow cadence otherwise (recorded points change values
 * without changing the list) — never per tick: a read is a whole SPI frame. */
let valsCache = { key: null, map: null, at: -1e9 };
/* True while the gradient's read is LIVE this tick (a lane drives the steps).
 * Only then may a held step reuse it: a cache left from an earlier visit to
 * AUTOMATION is never refreshed, so its values would go stale for the hold. */
let valsFed = false;
const VALS_REFRESH_MS = 400;
/* A lane the page read has no line for (an empty, cleared lane): no value on
 * any step — dark inside its cycle, which stays on the buttons to hold. */
const EMPTY_VALS = new Array(16).fill(-1);
EMPTY_VALS.v14 = new Array(16).fill(-1);
/* One page of every lane's per-step values, as playback plays them: a Map
 * target -> 16 values (0..127, -1 = none) with `v14` the 14-bit values, or
 * null when the read failed. */
function readValsPage(t, c, base, tps) {
    const raw = host_module_get_param('t' + t + '_c' + c + '_pa_vals_' + base + '_' + tps);
    if (raw === null || raw === undefined) return null;
    const map = new Map();
    for (const line of String(raw).split('\n')) {
        const sp = line.lastIndexOf(' ');
        if (sp <= 0) continue;
        /* Four hex digits a step: the 14-bit value, ffff = none. The
         * gradient's 0..127 is derived from it, rounded as the DSP
         * used to; `v14` keeps the full value for a held step to show in
         * the parameter's units. (Two digits a step is the older 7-bit
         * form, read as such.) */
        const hex = line.slice(sp + 1), v = [], v14 = [];
        const wide = hex.length >= 64;
        for (let s = 0; s < 16; s++) {
            if (wide) {
                const x = parseInt(hex.substr(s * 4, 4), 16);
                const ok = isFinite(x) && x !== 0xffff;
                v14.push(ok ? x : -1);
                v.push(ok ? Math.min(127, Math.floor((x * 127 + 8191) / 16383)) : -1);
            } else {
                const x = parseInt(hex.substr(s * 2, 2), 16);
                const ok = isFinite(x) && x !== 255;
                v.push(ok ? x : -1);
                v14.push(ok ? Math.round(x * 16383 / 127) : -1);
            }
        }
        v.v14 = v14;
        map.set(line.slice(0, sp), v);
    }
    return map;
}
/* A lock dialled on the held step changes what the lane plays. At Scale
 * 100 % the knob's own value is shown until the slow read (autoHeldValue);
 * at any other Scale the read is the only way to learn what PLAYS, so it
 * comes once the knob has rested this long instead of on the slow cadence. */
const LOCK_SETTLE_MS = 50;
function valsDue(cache, key) {
    if (cache.key !== key || S.clockMs - cache.at >= VALS_REFRESH_MS) return true;
    const L = S.autoLockLast;
    if (!L || L.at < cache.at || S.clockMs - L.at < LOCK_SETTLE_MS) return false;
    const stt = automationStateFor(L.track, L.clip, L.target);
    return !!stt && stt.scale !== 100;
}
function valsRefresh(cache, key, t, c, base, tps) {
    const map = readValsPage(t, c, base, tps);
    cache.at = S.clockMs;
    if (map) { cache.key = key; cache.map = map; }
    /* A failed read of a NEW page shows no stale values, and waits out the
     * slow cadence before trying again rather than reading every tick. */
    else if (cache.key !== key) { cache.key = key; cache.map = null; }
}
function autoLaneValsTick(t, c, target) {
    const cy = S.autoCycle;
    const base = ((cy.off >> 4) + cy.page) * 16;
    const key = t + ' ' + c + ' ' + base + ' ' + cy.tps + ' ' + automationListGen();
    if (valsDue(valsCache, key)) valsRefresh(valsCache, key, t, c, base, cy.tps);
    valsFed = true;
    const got = (valsCache.key === key && valsCache.map) ? (valsCache.map.get(target) || null) : null;
    const st0 = got ? null : automationStateFor(t, c, target);
    S.autoLaneVals = got || ((valsCache.key === key && valsCache.map && st0 && !st0.count) ? EMPTY_VALS : null);
}

/* ⭐ THE LANE'S SHAPE, for the ops pop-up's graph: the whole window of every
 * lane of the clip, LANE_SHAPE_N samples each, as playback plays them
 * (tN_cC_pa_shape_<n>: 0..254 a sample, ff = none). ONE read, from the tick,
 * only while a lane's ops are open — when the list generation, the lane, the
 * clip or the lane's own settings change (Loop, Rate, Scale, Wrap, Mute do
 * not move the list generation), and on the gradient's slow cadence for
 * recorded points. Never per tick, never from an input handler. */
let shapeCache = { key: null, map: null, raw: null, at: -1e9 };
let laneShape = null;            /* the open lane's samples, or null */
function readShape(t, c) {
    const raw = host_module_get_param('t' + t + '_c' + c + '_pa_shape_' + LANE_SHAPE_N);
    if (raw === null || raw === undefined) return null;
    return String(raw);
}
function parseShape(raw, n) {
    n = n || LANE_SHAPE_N;
    const map = new Map();
    for (const line of raw.split('\n')) {
        const sp = line.lastIndexOf(' ');
        if (sp <= 0) continue;
        const hex = line.slice(sp + 1), v = new Array(n);
        for (let i = 0; i < n; i++) {
            const x = parseInt(hex.substr(i * 2, 2), 16);
            v[i] = (isFinite(x) && x !== 255) ? x : -1;
        }
        map.set(line.slice(0, sp), v);
    }
    return map;
}
function laneShapeTick(t, c, target) {
    const st = automationStateFor(t, c, target);
    const sig = st ? [st.active ? 1 : 0, st.wrapReset ? 1 : 0, st.loop, st.lo, st.st, st.res, st.scale, st.count].join(',') : '-';
    const key = t + ' ' + c + ' ' + target + ' ' + automationListGen() + ' ' + sig;
    if (shapeCache.key !== key || S.clockMs - shapeCache.at >= VALS_REFRESH_MS) {
        const raw = readShape(t, c);
        shapeCache.at = S.clockMs;
        if (raw !== null) {
            if (raw !== shapeCache.raw || shapeCache.key !== key) S.screenDirty = true;
            shapeCache = { key, map: parseShape(raw), raw, at: S.clockMs };
        } else if (shapeCache.key !== key) { shapeCache = { key, map: null, raw: null, at: S.clockMs }; }
    }
    laneShape = (shapeCache.key === key && shapeCache.map) ? (shapeCache.map.get(target) || null) : null;
}
/* ⭐ THE PAGE'S SHAPE, for the page graph a hold or a pin draws: the lane's
 * current step page, one sample a column (PAGE_W), as playback plays it —
 * tN_cC_pa_shape_<n>_<t0>_<len>, so a punch draws flat with a hard edge and
 * a point glides, where 16 step values could only join the dots (Josh,
 * 2026-10-22: "punches and points both draw the same"). Read from the tick
 * on a new page or lane, on the slow cadence, and once a lock dialled during
 * the hold has rested; never from a handler or per frame. */
let pageShapeCache = { key: null, map: null, raw: null, at: -1e9 };
let pageShape = null;            /* the focused lane's page samples, or null */
function pageShapeTick(t, c, target) {
    const cy = S.autoCycle;
    if (!cy || !cy.tps) { pageShape = null; return; }
    const base = ((cy.off >> 4) + cy.page) * 16;
    const st = automationStateFor(t, c, target);
    const sig = st ? [st.active ? 1 : 0, st.wrapReset ? 1 : 0, st.loop, st.lo, st.st, st.res, st.scale, st.count].join(',') : '-';
    const key = t + ' ' + c + ' ' + target + ' ' + base + ' ' + cy.tps + ' ' + automationListGen() + ' ' + sig;
    const L = S.autoLockLast;
    const locked = !!L && L.at >= pageShapeCache.at && S.clockMs - L.at >= LOCK_SETTLE_MS;
    if (pageShapeCache.key !== key || locked || S.clockMs - pageShapeCache.at >= VALS_REFRESH_MS) {
        const raw = host_module_get_param('t' + t + '_c' + c + '_pa_shape_' + PAGE_W + '_' + (base * cy.tps) + '_' + (PAGE_STEPS * cy.tps));
        pageShapeCache.at = S.clockMs;
        if (raw !== null && raw !== undefined) {
            const r = String(raw);
            if (r !== pageShapeCache.raw || pageShapeCache.key !== key) S.screenDirty = true;
            pageShapeCache = { key, map: parseShape(r, PAGE_W), raw: r, at: S.clockMs };
        } else if (pageShapeCache.key !== key) { pageShapeCache = { key, map: null, raw: null, at: S.clockMs }; }
    }
    pageShape = (pageShapeCache.key === key && pageShapeCache.map) ? (pageShapeCache.map.get(target) || null) : null;
}

/* True while the ops pop-up of a lane is open on the AUTOMATION screen. */
export function autoOpsOpen() { return !!(S.autoBank && S.autoBank.ops) && autoMenuUp(); }

/* The lane's playhead as a FRACTIONAL step of its cycle (lane ticks / step),
 * or -1: the page bar's dot moves by tick, not by step, so it shares one x
 * with the graph's playhead column. */
export function autoLanePlayPos(cy) {
    if (!cy || !S.playing || !cy.tps) return -1;
    const lt = S.autoLanePos[cy.t];
    if (!(lt >= 0)) return -1;
    const p = lt / cy.tps;
    return (p >= cy.off && p < cy.off + cy.len) ? p : -1;
}

/* The ops pop-up's lane graph (bank layout, under the pop-up): a full-width
 * rule as its top, the curve over the lane's WHOLE window across x 1..126 —
 * the same span the page bar takes below it (drawn by the caller with
 * drawPositionBarGeom at GRAPH_BAR_Y), so a column is the same lane time in
 * both — and the playhead from the rule down to the bar. */
export function drawAutomationOpsGraph(cy) {
    fill_rect(0, GRAPH_RULE_Y, 128, 1, 1);
    const iy = GRAPH_RULE_Y + 2, ih = GRAPH_BAR_Y - 1 - iy;     /* one clear row above the bar */
    const v = laneShape;
    if (v) plotColumns(GRAPH_X, GRAPH_W, iy, ih, 254, (c) => v[c]);
    const p = autoLanePlayPos(cy);
    if (p >= 0) {
        const px = GRAPH_X + Math.floor((p - cy.off) * GRAPH_W / Math.max(1, cy.len));
        fill_rect(px, GRAPH_RULE_Y + 1, 1, GRAPH_BAR_Y - GRAPH_RULE_Y - 1, 1);
    }
    return { barY: GRAPH_BAR_Y, spanX: GRAPH_X, spanW: GRAPH_W, playStep: p };
}
/* A curve, one value a column (`at(c)` -> 0..vmax, or < 0 for none) across
 * columns x0..x0+w-1 inside rows iy..iy+ih-1; a change between two columns is
 * joined by a vertical run, so a jump reads as one. */
function plotColumns(x0, w, iy, ih, vmax, at) {
    const yOf = (val) => iy + ih - 1 - Math.round(val * (ih - 1) / vmax);
    let prev = -1;
    for (let c = 0; c < w; c++) {
        const val = at(c), px = x0 + c;
        if (!(val >= 0)) { prev = -1; continue; }
        const py = yOf(val);
        if (prev >= 0 && prev !== py) fill_rect(px, Math.min(prev, py), 1, Math.abs(prev - py) + 1, 1);
        else set_pixel(px, py, 1);
        prev = py;
    }
}

/* ⭐ THE PAGE ON THE PARAMETER'S SCREEN (2026-10-22): while a hold or a Shift
 * + click jump shows the lane's parameter on a dAVEBOx kit page (its bank
 * card, the levels, MACROS), the CURRENT step page of the lane is drawn over
 * the half of the screen the parameter is NOT in — a parameter in the top row
 * gets the graph over the lower half, one in the bottom row over the upper
 * half — so the knob being turned stays in view. 16 steps, 7 px each across
 * x 8..119; beat ticks every 4 steps on the floor; the held step between
 * dotted rails; the playhead when it is on this page. The curve is the page's
 * shape (pageShapeTick), so a punch has hard edges and a point glides; until
 * that read lands it is drawn from the step row's own values. The hint row
 * stays. Drawn where a kit page marked the lane's cell this frame
 * (kitLaneFocusRow) or a module's editor highlights its knob
 * (soundLaneFocusRow) — never on a drawn (canvas) screen. */
const PAGE_X = 8, STEP_PX = 7, PAGE_STEPS = 16, PAGE_W = PAGE_STEPS * STEP_PX;
export function drawLaneFocusOverlay() {
    /* a kit page's marked cell, else the module editor's highlighted knob */
    let row = kitLaneFocusRow();
    if (row < 0) row = soundLaneFocusRow();
    if (row < 0) return;
    const f = autoLaneFocus();
    const cy = S.autoCycle;
    if (!f || !cy || cy.target !== f.target || cy.t !== S.activeTrack) return;
    /* the far half: from the bottom row's widgets to under its labels, or
     * from the top row's widgets down to just above the bottom row's */
    const y = row === 0 ? MV_ROW1_Y - 1 : MV_ROW0_Y;
    const bottom = row === 0 ? MV_LBL1_Y + MV_LBL_H + 1 : MV_ROW1_Y - 1;
    const h = bottom - y + 1;
    fill_rect(0, y, 128, h, 0);
    rectOutline(0, y, 128, h, 1);
    /* ⭑ THE BOTTOM EDGE IS THE PAGE BAR (Josh, 2026-10-22: "nothing indicates
     * the page of the automation lane you're on"): one segment a page across
     * the frame, a 1-px gap between, the page shown two rows thick. */
    fill_rect(0, y + h - 1, 128, 1, 0);
    const np = Math.max(1, cy.pages | 0), segW = Math.floor((128 - (np - 1)) / np);
    for (let pg = 0; pg < np; pg++) {
        const sx = pg * (segW + 1), sw = pg === np - 1 ? 128 - sx : segW;
        fill_rect(sx, pg === cy.page ? y + h - 2 : y + h - 1, sw, pg === cy.page ? 2 : 1, 1);
    }
    const iy = y + 2, ih = h - 5;
    const base = ((cy.off >> 4) + cy.page) * 16;
    const vals = S.autoLaneVals;
    const v14 = vals && vals.v14;
    if (pageShape) plotColumns(PAGE_X, PAGE_W, iy, ih, 254, (c) => pageShape[c]);
    else if (v14) {
        const stepped = automationTargetStepped(f.target);
        plotColumns(PAGE_X, PAGE_STEPS * STEP_PX, iy, ih, 16383, (c) => {
            const s = Math.floor(c / STEP_PX), a = v14[s];
            if (!(a >= 0)) return -1;
            const b = s + 1 < PAGE_STEPS ? v14[s + 1] : -1;
            if (stepped || !(b >= 0)) return a;
            return a + (b - a) * (c - s * STEP_PX) / STEP_PX;
        });
    }
    for (let b = 0; b <= PAGE_STEPS; b += 4) set_pixel(PAGE_X + b * STEP_PX - (b === PAGE_STEPS ? 1 : 0), y + h - 3, 1);
    const held = f.step >= 0 ? f.step - base : -1;
    if (held >= 0 && held < PAGE_STEPS) {
        const hx = PAGE_X + held * STEP_PX;
        for (let yy = iy; yy < iy + ih; yy += 2) { set_pixel(hx, yy, 1); set_pixel(hx + STEP_PX, yy, 1); }
    }
    if (S.playing && cy.tps) {
        const lt = S.autoLanePos[cy.t], t0 = base * cy.tps;
        if (lt >= t0 && lt < t0 + PAGE_STEPS * cy.tps && lt < (cy.off + cy.len) * cy.tps)
            fill_rect(PAGE_X + Math.floor((lt - t0) * PAGE_STEPS * STEP_PX / (PAGE_STEPS * cy.tps)), y + 1, 1, h - 3, 1);
    }
}

/* ⭐ THE HELD STEP'S VALUES (Josh, 2026-10-20: "When holding a step with a
 * real or interpolated automation value, if you're on a screen that shows
 * that param, have the param temporarily change to show the value at that
 * step"). One page read covers every lane of the clip, so a screen asks
 * autoHeldValue(target) for each parameter it draws. The page is the HELD
 * step's (a hold can page on to extend), on the grid the step was pressed
 * on: a lane's own cycle on the AUTOMATION steps, else the clip's (a drum
 * track's active lane). When the gradient's read is that same page, it is
 * reused — a jump costs no second read. */
let heldVals = { key: null, map: null, at: -1e9 };
function heldGeom() {
    if (S.heldStep < 0) return null;
    const t = S.activeTrack, cy = S.autoCycle;
    let c, tps;
    if (S.heldStepAuto && cy && cy.t === t) { c = cy.c; tps = cy.tps; }
    else { c = effectiveClip(t); tps = automationStepTicks(t, c); }
    const base = (S.heldStep >> 4) * 16;
    return { t, c, tps, base, key: t + ' ' + c + ' ' + base + ' ' + tps + ' ' + automationListGen() };
}
function heldValsTick() {
    const g = heldGeom();
    if (!g || (valsFed && valsCache.key === g.key)) return;
    if (valsDue(heldVals, g.key)) { valsRefresh(heldVals, g.key, g.t, g.c, g.base, g.tps); S.screenDirty = true; }
}
/* What `target` plays at the held step — { norm, wire } in 14 bits and the
 * parameter's units — or null: no step held, no lane, or no value there. A
 * lock just dialled on the step answers at once from the knob (only at Scale
 * 100 %: the read is what PLAYS, scaled) until the next read catches up. */
export function autoHeldValue(target) {
    const g = heldGeom();
    if (!g) return null;
    const cache = (valsFed && valsCache.key === g.key) ? valsCache : heldVals.key === g.key ? heldVals : null;
    let norm = null;
    const L = S.autoLockLast;
    if (L && L.track === g.t && L.clip === g.c && L.target === target && L.step === S.heldStep &&
            (!cache || L.at >= cache.at)) {
        const stt = automationStateFor(g.t, g.c, target);
        if (!stt || stt.scale === 100) norm = L.norm;
    }
    if (norm == null && cache && cache.map) {
        const v = cache.map.get(target);
        if (v && v.v14 && v.v14[S.heldStep - g.base] >= 0) norm = v.v14[S.heldStep - g.base];
    }
    return norm == null ? null : { norm, wire: automationWireValue(target, norm) };
}

/* The lane the DSP is told to report a position for (tN_pa_view) — sent only
 * when the selection CHANGES, and "-" to the old track when it ends, so the
 * playhead costs no read (it rides state_snapshot, polled anyway). */
let viewSent = null;             /* { t, key } */
function syncPaView(t, c, target) {
    const key = target === null ? null : c + ' ' + target;
    if (viewSent && viewSent.t === t && viewSent.key === key) return;
    if (viewSent) S.pendingDefaultSetParams.push({ key: 't' + viewSent.t + '_pa_view', val: '-' });
    viewSent = key === null ? null : { t, key };
    if (key !== null) S.pendingDefaultSetParams.push({ key: 't' + t + '_pa_view', val: key });
}

/* ⭐ HOLD A POINT, EDIT IT (Josh, 2026-09-24): "When an automation lane is
 * selected, either by having the cursor over it or being in it's overlay
 * menu, holding a step with an automation point from that lane should
 * temporarily take you to the bank that param lives on, allowing you to
 * quickly edit the automation value on that point. Releasing the step takes
 * you back to where you were."
 *
 * The jump shows the parameter's bank with the step still HELD, so a knob
 * turn is the existing held-step lock (automationParamEdit writes _pa_set2 at
 * that step, in the lane's own steps). Nothing here edits a value.
 *   - the bank is shown via S.activeBank ONLY: never applyBankPick or
 *     autoBankReset (they wipe the menu), and never trackActiveBank — the
 *     track's remembered bank stays AUTOMATION (corrected on the way back if
 *     anything recorded the jump);
 *   - the step row keeps the lane's cycle (S.autoCycle is held from the stash);
 *   - where it goes is laneHome's answer (seq: targets with the alt page,
 *     modules, levels, MACROS); a target it places nowhere pops NO EDITOR
 *     and the hold stays an automation hold. */
/* ⭐ THE LANE PIN (Josh, 2026-09-25: after a Shift + click jump the steps
 * keep showing the lane until Back — "this should work on any automated
 * param"). The jump leaves the AUTOMATION bank (a davebox bank, SOUND+CFG,
 * MACROS) or opens an editor over it; the pin keeps the step row on the lane
 * you jumped from — its cycle, page, colours and playhead — so a held step
 * edits that step with the destination's knob. It lives only while the jump's
 * own return crumb does: Back (autoBankRestoreMenu), any other way out of the
 * destination, a track or clip change, Session view, co-run, or the lane
 * being deleted ends it. */
let lanePin = null;             /* { t, c, target, page, crumb: 'auto'|'sound', bank } */
export function autoLanePinActive() { return !!lanePin; }
export function autoLanePinClear() { lanePin = null; }
/* The editor the bank map marks as where you are, or null for the bank. A
 * jump's destination is still the automation context (Josh, 2026-10-20: "it
 * shows that i'm in instrument mode on the pads when viewing it in the
 * automation context"), so while the pin lives the map marks AUTOMATION. */
export function autoMapEditorComp() { return lanePin ? null : soundEditorComp(); }
/* ...and the bank it marks: AUTOMATION while a jump's pin lives, whatever
 * bank the jump landed on (DELAY, SOUND + CONFIG, MACROS). */
export function autoMapMarkedBank() { return lanePin ? BANK_AUTOMATION : S.activeBank; }
export function autoLanePinJump(target, crumb, bank) {
    const t = S.activeTrack, c = effectiveClip(t), a = st();
    const page = (a.cycleTarget === target && a.cycleTrack === t && a.cycleClip === c) ? (a.cyclePage | 0) : 0;
    lanePin = { t, c, target, page, crumb, bank };
}
function lanePinAlive(p) {
    if (S.activeTrack !== p.t || effectiveClip(p.t) !== p.c || S.sessionView || S.moveCoRunTrack >= 0) return false;
    /* The jump's return crumb: a davebox bank keeps S.autoReturn until a
     * track-view Back spends it; sound mode keeps genReturn (with the lane's
     * row) until it exits by any path. */
    if (p.crumb === 'auto') return !!S.autoReturn && S.activeBank === p.bank;
    return !!(S.genReturn && S.genReturn.autoSel != null);
}
/* True when the pin fed the step row this tick. */
function lanePinTick() {
    const p = lanePin;
    if (!lanePinAlive(p)) { lanePin = null; return false; }
    const a = st();
    if (a.cycleTarget !== p.target || a.cycleTrack !== p.t || a.cycleClip !== p.c) {
        a.cycleTarget = p.target; a.cycleTrack = p.t; a.cycleClip = p.c; a.cyclePage = p.page;
    }
    updateAutoCycle(p.t, p.c, p.target);
    if (!S.autoCycle) { lanePin = null; return false; }     /* the lane is gone */
    p.page = S.autoCycle.page;
    syncPaView(p.t, p.c, p.target);
    autoLaneValsTick(p.t, p.c, p.target);
    if (p.t === S.activeTrack) pageShapeTick(p.t, p.c, p.target);
    feedLit(p.t, p.c, p.target);
    return true;
}

/* ⭐ THE LANE IN FOCUS on a jump destination (Josh, 2026-09-25: "highlight
 * the param the lane belongs to and show the value that the automation step
 * is setting"). { target, step, norm, wire } while a hold jump or a lane pin
 * is up on this track, else null. `step` is the held step (-1 when none);
 * `norm`/`wire` are what the lane plays there — the knob's own last lock
 * while the values read has not caught up (and only at Scale 100 %, since
 * the read is what plays, scaled) — in 14 bits and in the parameter's units. */
export function autoLaneFocus() {
    const t = S.activeTrack;
    const cy = (holdJump && holdJump.track === t) ? holdJump.cycle
             : (lanePin && lanePin.t === t && S.autoCycle && S.autoCycle.target === lanePin.target) ? S.autoCycle : null;
    if (!cy) return null;
    const target = cy.target;
    const step = (S.heldStepAuto && S.heldStep >= 0) ? S.heldStep : -1;
    const hv = step >= 0 ? autoHeldValue(target) : null;
    return { target, step, norm: hv ? hv.norm : null, wire: hv ? hv.wire : null };
}

let holdJump = null;
/* ⭐ WHERE A LANE IS EDITED — one answer for both jumps (Shift + click and
 * the hold). { kind, comp, key } or null (not this track's, or nowhere):
 *   seq     a davebox bank knob (SEQ_AUTO_TARGETS)
 *   macros  MACROS: a MIDI target, or a SnapMorph knob (`mac:<track>:<knob>`,
 *           this track's only)
 *   level   the track's levels (`<slot>:slot:*`) or its Move bus's
 *           (`0:move_fx:N:*`): SOUND+CFG
 *   module  a chain component's parameter: its editor
 *   busfx   a Move bus insert's parameter (`0:move_fx:N:fxK:key`): its editor
 * ⚠ A Move bus lane is on slot 0 whatever the track (move_fx keys ignore the
 * slot), so it belongs to the track by its BUS, not its slot. */
export function laneHome(tgt, t) {
    tgt = String(tgt);
    if (midiTargetIsMidi(tgt)) return { kind: 'macros' };
    if (tgt.indexOf('mac:') === 0) return parseInt(tgt.split(':')[1], 10) === t ? { kind: 'macros' } : null;
    if (tgt.indexOf('seq:') === 0) return SEQ_AUTO_TARGETS[tgt.split(':')[2]] ? { kind: 'seq' } : null;
    const i = tgt.indexOf(':');
    if (i < 0) return null;
    const slot = parseInt(tgt.slice(0, i), 10);
    const rest = tgt.slice(i + 1), k = rest.lastIndexOf(':');
    if (!isFinite(slot) || k <= 0) return null;
    const comp = rest.slice(0, k), key = rest.slice(k + 1);
    const mb = /^move_fx:(\d+)(:fx\d+)?$/.exec(comp);
    if (mb) {
        if (S.trackRoute[t] !== 1 || moveBusForChannel(S.trackChannel[t]) !== parseInt(mb[1], 10)) return null;
        return { kind: mb[2] ? 'busfx' : 'level', comp, key };
    }
    if (slot !== schSlotForTrack(t)) return null;
    if (comp === 'slot') return { kind: 'level', comp, key };
    if (comp.indexOf('send_fx') === 0 || comp.indexOf('bus') === 0) return null;
    return { kind: 'module', comp, key };
}
export function autoHoldJumpActive() { return !!holdJump; }
export function autoHoldJumpStep() { return holdJump ? holdJump.step : -1; }
export function autoHoldJumpBegin(absStep) {
    if (holdJump || lanePin || !autoBankIsActive() || !(S.bankCardLatched || autoMenuUp())) return false;
    const cy = S.autoCycle;
    /* ANY step of the cycle jumps, not only one holding a point (Josh,
     * 2026-09-25: "this should work on ANY step, not just ones with data, so
     * that new automation steps can be added as well as old automation steps
     * edited"). The caller keeps the press inside the cycle. */
    if (!cy || cy.t !== S.activeTrack) return false;
    const tgt = String(cy.target);
    const sat = tgt.indexOf('seq:') === 0 ? SEQ_AUTO_TARGETS[tgt.split(':')[2]] : null;
    const home = sat ? null : laneHome(tgt, cy.t);
    const sb = !home ? -1 : home.kind === 'macros' ? BANK_MACROS : home.kind === 'level' ? BANK_SOUND : -1;
    const mp = (home && (home.kind === 'module' || home.kind === 'busfx')) ? home : null;
    if (!sat && sb < 0 && !mp) { showActionPopup('NO EDITOR'); return false; }
    const a = st();
    if (sat && sat.bank === AU_AUTO_BANK) {
        /* An Audio clip's sound: the SAMPLE editor over the AUTOMATION bank,
         * for as long as the step is held (its K4-K8 lock the step). */
        openWave(cy.t, 'sample');
        holdJump = { track: cy.t, clip: cy.c, bank: BANK_AUTOMATION, wave: true, altWas: !!S.altMode, knobAltWas: S.knobAlt, sel: a.sel,
                     opsSel: a.ops ? a.ops.sel : -1, cycle: Object.assign({}, cy), step: absStep };
        return true;
    }
    if (mp) {
        /* A module parameter: its editor, on the page holding the key, for as
         * long as the step is held. The bank stays AUTOMATION underneath (an
         * editor is not a bank), so release only has to close the editor. */
        if (!soundJumpToParam(cy.t, mp.comp, mp.key, a.sel)) { showActionPopup('NOT LOADED'); return false; }
        holdJump = { track: cy.t, clip: cy.c, bank: BANK_AUTOMATION, sound: true, altWas: !!S.altMode, knobAltWas: S.knobAlt, sel: a.sel,
                     opsSel: a.ops ? a.ops.sel : -1, cycle: Object.assign({}, cy), step: absStep };
        return true;
    }
    holdJump = { track: cy.t, clip: cy.c, bank: sat ? sat.bank : sb, sound: !sat, altWas: !!S.altMode, knobAltWas: S.knobAlt, sel: a.sel,
                 opsSel: a.ops ? a.ops.sel : -1, cycle: Object.assign({}, cy), step: absStep };
    if (!sat) {
        /* A level (SOUND+CFG) or a MIDI target (MACROS): the sound bank for as
         * long as the step is held, through the ordinary deferred entry (the
         * tick opens it). The track's remembered bank is NOT moved. */
        S.activeBank = sb;
        S.pendingSoundEnterTrack = cy.t;
        armBankDisplay();
        return true;
    }
    S.activeBank = sat.bank;
    /* An alt target (DELAY's Clock Feedback) flips just its knob (KNOB_ALTS). */
    S.altMode = false;
    S.knobAlt = sat.alt ? (1 << sat.k) : 0;
    /* Render drops alt mode on ANY bank change (its diff guard, ui_render):
     * this change is deliberate, so it is the guard's new baseline — or Clock
     * Feedback's alt page would vanish on the first frame. */
    S._altPrevBank = sat.bank; S._altPrevTrack = S.activeTrack;
    readBankParams(cy.t, sat.bank);
    armBankDisplay();
    return true;
}
/* Release (or any clear of the held step, via autoBankTick's edge): back to
 * the AUTOMATION menu, the same row, page and ops; the track's remembered
 * bank corrected if anything recorded the jump. */
export function autoHoldJumpEnd() {
    const j = holdJump;
    if (!j) return;
    holdJump = null;
    if (j.sound) {
        /* Close the sound bank's screen BEFORE the bank goes back: the tick's
         * reconcile only agrees with a resting sound mode while the bank is a
         * sound bank. A release inside the entry tick cancels the entry. */
        if (S.pendingSoundEnterTrack === j.track) S.pendingSoundEnterTrack = -1;
        if (soundOpen()) soundExit();
    }
    if (j.wave && S.auPanel) closeAudioPanel();
    if (S.activeTrack === j.track && S.activeBank === j.bank) {
        S.activeBank = BANK_AUTOMATION;
        S.altMode = j.altWas;
        S.knobAlt = j.knobAltWas | 0;
        S._altPrevBank = BANK_AUTOMATION; S._altPrevTrack = S.activeTrack;
        autoBankRestoreMenu(j.sel);
        const a = st();
        a.cycleTarget = j.cycle.target; a.cycleTrack = j.cycle.t; a.cycleClip = j.cycle.c;
        a.cyclePage = j.cycle.page;
        if (j.opsSel >= 0) {
            const r = autoBankRows(j.track, j.clip).find(x => x.kind === 'entry' && x.target === j.cycle.target);
            if (r) a.ops = { rows: opsFor(j.track, j.clip, r), sel: j.opsSel, row: r };
        }
    }
    if (S.trackActiveBank[j.track] === j.bank) S.trackActiveBank[j.track] = BANK_AUTOMATION;
}

export function autoBankTick() {
    valsFed = false;
    autoBankTickLane();
    heldValsTick();
}
function autoBankTickLane() {
    S.autoBankLit = null;
    S.autoCycle = null;
    S.autoLaneVals = null;
    laneShape = null;
    pageShape = null;
    /* The held step went away without our release (a track switch, a suspend,
     * any of the other clear sites): the jump ends here. */
    if (holdJump && S.heldStep < 0) autoHoldJumpEnd();
    if (holdJump) {
        /* Mid-jump: the step row stays the lane's — its cycle, its colours —
         * and its values keep refreshing on their slow cadence, so what the
         * destination shows for the held step follows what was locked. */
        const j = holdJump;
        S.autoCycle = j.cycle;
        if (S.activeTrack === j.track) {
            autoLaneValsTick(j.track, j.clip, j.cycle.target);
            pageShapeTick(j.track, j.clip, j.cycle.target);
            feedLit(j.track, j.clip, j.cycle.target);
        }
        return;
    }
    if (lanePin && lanePinTick()) return;
    /* ⭑ The steps follow the lane list only while it is ON SCREEN (Josh,
     * 2026-10-20, on device: "steps should revert to note mode when I leave
     * the automation areas"). An editor opened over AUTOMATION — the map's
     * INSTRUMENT / FX pads, INST — leaves the bank and its open list
     * underneath, so Back returns there; the list must not drive the steps
     * from behind the editor. A jump's pin and a hold jump answered above. */
    if (!autoBankIsActive() || !(S.bankCardLatched || autoMenuUp()) || S.moveCoRunTrack >= 0 || soundOpen()) {
        if (viewSent) syncPaView(viewSent.t, 0, null);
        return;
    }
    const t = S.activeTrack, c = effectiveClip(t);
    const target = selectedTarget(t, c);
    syncPaView(t, c, target);
    /* No row selected: forget the lane's page, so the next time a row is
     * picked it opens where the clip is being viewed, not where it was left.
     * (Closing the menu forgets it too — Back and a click can land between
     * two ticks.) */
    if (target === null) { if (S.autoBank) S.autoBank.cycleTarget = null; return; }
    updateAutoCycle(t, c, target);
    if (S.autoCycle) autoLaneValsTick(t, c, target);
    /* The ops pop-up shows the lane: its shape, read here (never per tick). */
    if (S.autoCycle && S.autoBank && S.autoBank.ops) laneShapeTick(t, c, target);
    feedLit(t, c, target);
}

/* The lane's points (the step row's '1' map), read once per list generation
 * and on a slow retry after a failed read. */
function feedLit(t, c, target) {
    const key = t + ' ' + c + ' ' + automationListGen();
    if (litCache.key !== key) {
        /* A failed read (null) is not "no steps": keep the old map off the
         * row and ask again on the slow cadence, not every tick. */
        if (S.clockMs - litTryMs < LIT_RETRY_MS) return;
        litTryMs = S.clockMs;
        const raw = host_module_get_param('t' + t + '_c' + c + '_pa_steps');
        if (raw === null || raw === undefined) return;
        const map = new Map();
        for (const line of String(raw).split('\n')) {
            const sp = line.lastIndexOf(' ');
            if (sp > 0) map.set(line.slice(0, sp), line.slice(sp + 1));
        }
        litCache = { key, map };
        litTryMs = -1e9;
    }
    S.autoBankLit = litCache.map.get(target) || '';
}

/* ⭐ THE GRID FOLLOWS THE ROW (Josh, 2026-09-24). The selected lane's cycle,
 * with the page being viewed — kept while that lane stays selected; picking a
 * different lane (or closing the menu) starts afresh. */
function updateAutoCycle(t, c, target) {
    const cy = rowCycle(t, c, target);
    if (!cy) return;
    const a = st();
    if (a.cycleTarget !== target || a.cycleTrack !== t || a.cycleClip !== c) {
        a.cycleTarget = target; a.cycleTrack = t; a.cycleClip = c;
        /* A lane that follows the clip opens on the page you were already
         * looking at; a lane with its own cycle opens on its first page. */
        const viewed = S.trackPadMode[t] === PAD_MODE_DRUM ? (S.drumStepPage[t] | 0) : (S.trackCurrentPage[t] | 0);
        a.cyclePage = cy.follows ? viewed - (cy.off >> 4) : 0;
    }
    else laneFollow(t, cy, a);
    a.cyclePage = Math.max(0, Math.min(cy.pages - 1, a.cyclePage | 0));
    S.autoCycle = { t, c, target, off: cy.off, len: cy.len, tps: cy.tps,
                    pages: cy.pages, page: a.cyclePage, text: cy.text };
}
/* ⭑ SEQ FOLLOW on a lane (Josh, 2026-10-22: "set up the lane on param view
 * to follow or not follow playback like we do on note mode"): while the
 * transport runs and Seq Follow is active (the one switch, Play + Left/Right;
 * paused by paging by hand until the next stop), the lane's page is the page
 * its playhead is on — on the lane list, a pin's page graph and the step
 * row alike. Never while a step is held: the held step's page stays put so
 * an edit or an extend is not moved out from under the finger. Not on the
 * tick a lane is opened either: the playhead read is still the last lane's. */
function laneFollow(t, cy, a) {
    if (!S.playing || S.heldStep >= 0 || !followActive() || !S.trackClipPlaying[t] || !cy.tps) return;
    const lt = S.autoLanePos[t];
    if (!(lt >= 0)) return;
    const p = lt / cy.tps;
    if (p < cy.off || p >= cy.off + cy.len) return;
    const page = Math.floor(p / 16) - (cy.off >> 4);
    if (page !== a.cyclePage) { a.cyclePage = page; S.screenDirty = true; }
}

/* Left/Right while a row is selected: page through ITS cycle, clamped at the
 * ends. True when consumed — a one-page cycle still consumes them (nothing to
 * page to, and the pad's grid is not what is on the buttons). */
export function autoCyclePageStep(delta) {
    const cy = S.autoCycle;
    /* A hold jump keeps the lane's step row, so the arrows page it there too —
     * an extend reaches a later bar (the jump to a level or MACROS moves the
     * bank off AUTOMATION, which alone would refuse). */
    if (!cy || cy.t !== S.activeTrack || !(autoBankIsActive() || lanePin || holdJump)) return false;
    const a = st();
    a.cyclePage = Math.max(0, Math.min(cy.pages - 1, (a.cyclePage | 0) + (delta < 0 ? -1 : 1)));
    cy.page = a.cyclePage;
    /* paging by hand pauses Seq Follow, as it does on the note steps */
    if (S.playing) S.followPaused = true;
    return true;
}

/* Which slot this track's chain targets live in — for tests and labels. */
export function autoBankSlotForTrack(t) { return schSlotForTrack(t); }
export function autoBankIsActive() { return S.activeBank === BANK_AUTOMATION && !S.sessionView; }
