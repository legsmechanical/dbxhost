/* ui_automation_bank.mjs — THE AUTOMATION BANK (spec §2, ⭑RULED Josh 2026-09-02).
 *
 * Replaces the old AUTO bank 6 on the walk: the bank card is a LIST of what is
 * automated in the current clip — every kind: chain parameters, levels, MIDI
 * targets, the pads' aftertouch — framed with the module editor's bracketed
 * corners to say "press jog to interact". The eight knobs are a no-op here.
 *
 *   card (latched)  → jog click → the MENU: the same list with a cursor, plus a
 *                                  CLEAR CLIP row at the end
 *   menu row        → jog click → the row's OPERATIONS, floating over the list:
 *                                  Delete · Mute/Unmute · Smooth/Stepped (floats)
 *                                  · Loop (clip, or N steps — click to edit,
 *                                  turn, click to set) · Scale (0-200 %, same
 *                                  shape: the lane's values up or down)
 *   Delete + click on the card    → CLEAR ALL, the shortcut
 *   Back                          → ops → menu → card → (davebox's own: out)
 *
 * Every edit takes an UNDO CHECKPOINT (ui_automation queues it). Smooth/Stepped
 * lives HERE now — the module editor's knob-touch + jog-click toggle is gone.
 *
 * ⚠ The old bank-6 machinery (CC lanes, its LEDs, its step editor) is not on
 * the walk any more and is deleted in P8; its per-clip AT lane still records
 * pad pressure, so it is listed here as a row of its own kind (Delete only).
 * ⚠ Resolution (`pa_loop`'s third field) is stored but has no playback effect
 * yet (pa_entry_tick reads loop_len/loop_off only), so it is not offered.
 *
 * Reads: none per tick. The list is the automation owner's cache (one pa_list
 * read per project load and per edit); labels use the owner's metadata cache
 * (one chain_params read per component, ever). */

import { S, noteUndoUnit, armBankDisplay } from './ui_state.mjs';
import { BANK_AUTOMATION, BANK_SOUND, BANK_MACROS, PAD_MODE_DRUM, midiTargetIsMidi, SEQ_AUTO_TARGETS } from './ui_constants.mjs';
import { soundOpen, soundExit, soundJumpToParam } from './ui_sound.mjs';
import { readBankParams } from './ui_dsp_bridge.mjs';
import { effectiveClip } from './ui_leds.mjs';
import { automationEntriesFor, automationTargetLabel, automationClearKey,
         automationToggleActive, automationToggleSmooth, automationToggleWrap, automationToggleMode, automationToggleLink, automationSmoothable,
         automationSetLoop, automationSetRate, automationRateText, automationSetScale,
         automationClearClip, automationListGen, automationStepTicks, rowCycle,
         cycleText, automationMatchPad, padCycle } from './ui_automation.mjs';
import { drawKitList, drawKitStackedList, drawKitBackdropDim, drawKitHintRow,
         drawBrackets, kitUseLayout, MV_FOOTER_Y } from './ui_movy.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { schSlotForTrack } from './ui_corun.mjs';
import { moveBusForChannel } from './ui_engine.mjs';

const LIST_TOP = 11;                 /* the kit list's own default */

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
                    active: e.active, smooth: e.smooth, wrapReset: !!e.wrapReset, punch: !!e.punch,
                    linked: e.linked !== false,
                    count: e.count, loop: e.loop, res: e.res, lo: e.lo | 0, st: e.st | 0,
                    scale: isFinite(e.scale) ? e.scale : 100 });
    }
    rows.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    if (S.clipAtHas[track] && S.clipAtHas[track][clip]) rows.push({ kind: 'at', label: 'Aftertouch (pads)' });
    return rows;
}
/* The value column is the lane's CYCLE (Josh, 2026-09-24): "4 BAR", "13 ST",
 * "13 ST/32", or "CLIP" when it follows the clip — with lanes at different
 * lengths, how long each one loops is the thing that is hard to remember.
 * Muted still reads OFF; Smooth lives in the row's ops as a setting. */
function rowValue(r, track, clip) {
    if (r.kind === 'at') return 'PADS';
    if (!r.active) return 'OFF';
    const cy = rowCycle(track, clip, r.target);
    return cy ? cy.text : 'ON';
}
function loopText(steps) { return steps > 0 ? (steps + ' ST') : 'CLIP'; }
function scaleText(pct) { return (isFinite(pct) ? pct : 100) + '%'; }
function smoothText(on) { return on ? 'On' : 'Off'; }
function wrapText(reset) { return reset ? 'Reset' : 'Carry'; }
function modeText(punch) { return punch ? 'Punch' : 'Curve'; }
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
    const ops = [{ op: 'delete', label: 'Delete' },
                 { op: 'active', label: r.active ? 'Mute' : 'Unmute' }];
    const i = r.target.indexOf(':');
    const slot = parseInt(r.target.slice(0, i), 10), fullKey = r.target.slice(i + 1);
    /* ⭑ SET-AND-FORGET SETTINGS READ AS SETTINGS (Josh, 2026-09-11): a static
     * label on the left and the VALUE on the right — "Smooth: On/Off. Wrap:
     * Carry/Reset." — not an action label that flips its own wording. A click
     * flips the value in place (see runOp). */
    /* MODE first: it decides which of the rows below mean anything. In Punch a
     * point lasts its own step and every other step is at rest — nothing carries
     * round the loop and nothing glides between points — so Smooth and Wrap are
     * HIDDEN there (their settings are kept for when the lane goes back to
     * Curve). Plan 6c4, Josh 2026-09-11. */
    ops.push({ op: 'mode', label: 'Mode', value: modeText(r.punch) });
    if (!r.punch) {
        if (midiTargetIsMidi(r.target) || (isFinite(slot) && automationSmoothable(slot, fullKey)))
            ops.push({ op: 'smooth', label: 'Smooth', value: smoothText(r.smooth) });
        ops.push({ op: 'wrap', label: 'Wrap', value: wrapText(r.wrapReset) });
    }
    /* LINK (plan 6c): does the lane move with its notes? Shown in both modes —
     * a Punch lock follows its note as much as a curve does. */
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
    return ops;
}

/* ---- render ------------------------------------------------------------- */
/* The card, with the menu and the ops overlay when open. `heading` is drawn
 * by the caller (ui_render's bank heading, prefix and all). */
export function drawAutomationBankBody() {
    const t = S.activeTrack, c = effectiveClip(t);
    const a = st();
    if (!S.bankCardLatched) autoBankReset();       /* the peek shows the plain card */
    const rows = autoBankRows(t, c);
    const listRows = rows.map(r => ({ label: r.label, value: rowValue(r, t, c) }));
    if (a.menu) listRows.push({ label: 'Clear all', hdr: true });
    if (a.sel >= listRows.length) a.sel = Math.max(0, listRows.length - 1);
    kitUseLayout('bank');
    /* A multi-page cycle draws the track overview's page bar at rows 50–53
     * (ui_render), so the list stops at four rows above it. */
    const barShown = !!(S.autoCycle && S.autoCycle.t === t && S.autoCycle.pages > 1);
    drawKitList(listRows, a.menu ? a.sel : -1,
                barShown ? { emptyMsg: 'NO AUTOMATION', visible: 4 } : { emptyMsg: 'NO AUTOMATION' });
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
                : (o.op === 'smooth' || o.op === 'wrap' || o.op === 'mode' || o.op === 'link' || o.op === 'match') ? o.value : undefined,
        }));
        drawKitBackdropDim(0, LIST_TOP, 128, MV_FOOTER_Y - LIST_TOP);
        /* ⚠ bottomY: STOP THE BOX ABOVE THE FOOTER. Without it the stacked
         * list runs to y=62 while the hint row below draws at MV_FOOTER_Y=57 —
         * six rows of overlap, and since the footer is drawn AFTERWARDS it
         * painted over the bottom of the pop-up. Josh, 2026-09-10: "the
         * automation editor pop-up sits behind the bank's hint footer rather
         * than on top where it should be."
         * ⭑ Note the backdrop dim beside it already stops at MV_FOOTER_Y — the
         * footer band was always meant to stay out of the overlay's area, and
         * only the box's own height had not been told. */
        drawKitStackedList(1, ors, a.ops.sel, { bottomY: MV_FOOTER_Y - 1 });
        hints = a.loopEdit ? [['JOG', 'LEN'], ['CLK', 'DONE'], ['BACK', 'DONE']]
              : a.rateEdit ? [['JOG', 'RATE'], ['CLK', 'DONE'], ['BACK', 'DONE']]
              : a.scaleEdit ? [['JOG', 'PCT'], ['CLK', 'DONE'], ['BACK', 'DONE']]
                           : [['CLK', 'DO'], ['JOG', 'OP'], ['BACK', 'LIST']];
    } else if (a.menu) {
        hints = [['CLK', 'OPS'], ['JOG', 'ROW'], ['BACK', 'CARD']];
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
    if (a.sel >= rows.length) { autoBankClearClip(); return; }      /* the Clear all row */
    const r = rows[a.sel];
    a.ops = { rows: opsFor(t, c, r), sel: 0, row: r };
    a.loopEdit = false; a.rateEdit = false; a.scaleEdit = false;
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
    } else if (o.op === 'active') {
        const on = automationToggleActive(t, c, r.target);
        if (on !== null) showActionPopup('AUTOMATION', on ? 'ON' : 'MUTED');
    } else if (o.op === 'mode') {
        /* A setting, flipped in place — and it changes WHICH rows exist (Smooth
         * and Wrap come and go), so the list is rebuilt with the cursor kept on
         * Mode. */
        const punch = automationToggleMode(t, c, r.target);
        if (punch !== null) {
            r.punch = punch;
            a.ops.rows = opsFor(t, c, r);
            a.ops.sel = Math.max(0, a.ops.rows.findIndex(x => x.op === 'mode'));
        }
        return;
    } else if (o.op === 'link') {
        /* A setting, flipped in place like Smooth and Wrap. */
        const linked = automationToggleLink(t, c, r.target);
        if (linked !== null) { r.linked = linked; o.value = linkText(linked); }
        return;
    } else if (o.op === 'smooth' || o.op === 'wrap') {
        /* A setting, not an action: flip it IN PLACE and keep the pop-up open,
         * so the value you just set is the thing you are looking at. */
        if (o.op === 'smooth') {
            const on = automationToggleSmooth(t, c, r.target);
            if (on !== null) { r.smooth = on; o.value = smoothText(on); }
        } else {
            const reset = automationToggleWrap(t, c, r.target);
            if (reset !== null) { r.wrapReset = reset; o.value = wrapText(reset); }
        }
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
            /* A drum lane counts in ITS OWN steps, 1 up — its cycle may run past
             * every pad (it plays in full), up to what the store's 16-bit tick
             * holds from where it starts. A melodic lane: 0 (CLIP) up to its
             * clip's length. */
            const r = a.ops.row, drum = S.trackPadMode[t] === PAD_MODE_DRUM;
            const tps = rowTps(t, c, r);
            const max = drum ? Math.max(1, Math.min(256, Math.floor((65535 - (r.lo | 0)) / tps)))
                      : ((S.clipLength[t] && S.clipLength[t][c]) || 16);
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
    const n = autoBankRows(t, c).length + 1;                 /* + Clear all */
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
    a.ops = null; a.menu = false;
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
const VALS_REFRESH_MS = 400;
function autoLaneValsTick(t, c, target) {
    const cy = S.autoCycle;
    const base = ((cy.off >> 4) + cy.page) * 16;
    const key = t + ' ' + c + ' ' + base + ' ' + cy.tps + ' ' + automationListGen();
    if (valsCache.key !== key || S.clockMs - valsCache.at >= VALS_REFRESH_MS) {
        const raw = host_module_get_param('t' + t + '_c' + c + '_pa_vals_' + base + '_' + cy.tps);
        valsCache.at = S.clockMs;
        if (raw !== null && raw !== undefined) {
            const map = new Map();
            for (const line of String(raw).split('\n')) {
                const sp = line.lastIndexOf(' ');
                if (sp <= 0) continue;
                const hex = line.slice(sp + 1), v = [];
                for (let s = 0; s < 16; s++) { const x = parseInt(hex.substr(s * 2, 2), 16); v.push(x === 255 || !isFinite(x) ? -1 : x); }
                map.set(line.slice(0, sp), v);
            }
            valsCache.key = key; valsCache.map = map;
        } else if (valsCache.key !== key) {
            valsCache.map = null;             /* a failed read of a NEW page shows no stale colours */
        }
    }
    S.autoLaneVals = (valsCache.key === key && valsCache.map) ? (valsCache.map.get(target) || null) : null;
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
 *   - v1 covers davebox's own parameters (seq: targets, alt page included);
 *     any other target pops NO EDITOR and the hold stays an automation hold. */
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
    feedLit(p.t, p.c, p.target);
    return true;
}

let holdJump = null;
/* ⭐ WHERE A LANE IS EDITED — one answer for both jumps (Shift + click and
 * the hold). { kind, comp, key } or null (not this track's, or nowhere):
 *   seq     a davebox bank knob (SEQ_AUTO_TARGETS)
 *   midi    a MIDI target: MACROS
 *   level   the track's levels (`<slot>:slot:*`) or its Move bus's
 *           (`0:move_fx:N:*`): SOUND+CFG
 *   module  a chain component's parameter: its editor
 *   busfx   a Move bus insert's parameter (`0:move_fx:N:fxK:key`): its editor
 * ⚠ A Move bus lane is on slot 0 whatever the track (move_fx keys ignore the
 * slot), so it belongs to the track by its BUS, not its slot. */
export function laneHome(tgt, t) {
    tgt = String(tgt);
    if (midiTargetIsMidi(tgt)) return { kind: 'midi' };
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
    if (holdJump || lanePin || !autoBankIsActive() || !S.bankCardLatched) return false;
    const cy = S.autoCycle;
    /* ANY step of the cycle jumps, not only one holding a point (Josh,
     * 2026-09-25: "this should work on ANY step, not just ones with data, so
     * that new automation steps can be added as well as old automation steps
     * edited"). The caller keeps the press inside the cycle. */
    if (!cy || cy.t !== S.activeTrack) return false;
    const tgt = String(cy.target);
    const sat = tgt.indexOf('seq:') === 0 ? SEQ_AUTO_TARGETS[tgt.split(':')[2]] : null;
    const home = sat ? null : laneHome(tgt, cy.t);
    const sb = !home ? -1 : home.kind === 'midi' ? BANK_MACROS : home.kind === 'level' ? BANK_SOUND : -1;
    const mp = (home && (home.kind === 'module' || home.kind === 'busfx')) ? home : null;
    if (!sat && sb < 0 && !mp) { showActionPopup('NO EDITOR'); return false; }
    const a = st();
    if (mp) {
        /* A module parameter: its editor, on the page holding the key, for as
         * long as the step is held. The bank stays AUTOMATION underneath (an
         * editor is not a bank), so release only has to close the editor. */
        if (!soundJumpToParam(cy.t, mp.comp, mp.key, a.sel)) { showActionPopup('NOT LOADED'); return false; }
        holdJump = { track: cy.t, clip: cy.c, bank: BANK_AUTOMATION, sound: true, altWas: !!S.altMode, sel: a.sel,
                     opsSel: a.ops ? a.ops.sel : -1, cycle: Object.assign({}, cy), step: absStep };
        return true;
    }
    holdJump = { track: cy.t, clip: cy.c, bank: sat ? sat.bank : sb, sound: !sat, altWas: !!S.altMode, sel: a.sel,
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
    S.altMode = !!sat.alt;
    /* Render drops alt mode on ANY bank change (its diff guard, ui_render):
     * this change is deliberate, so it is the guard's new baseline — or Clock
     * Feedback's alt page would vanish on the first frame. */
    S._altPrevBank = sat.bank; S._altPrevTrack = S.activeTrack;
    if (sat.bank === 7) S.allLanesConfirmed = false;
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
    if (S.activeTrack === j.track && S.activeBank === j.bank) {
        S.activeBank = BANK_AUTOMATION;
        S.altMode = j.altWas;
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
    S.autoBankLit = null;
    S.autoCycle = null;
    S.autoLaneVals = null;
    /* The held step went away without our release (a track switch, a suspend,
     * any of the other clear sites): the jump ends here. */
    if (holdJump && S.heldStep < 0) autoHoldJumpEnd();
    if (holdJump) {
        /* Mid-jump: the step row stays the lane's — its cycle, its colours. */
        S.autoCycle = holdJump.cycle;
        S.autoBankLit = litCache.map ? (litCache.map.get(holdJump.cycle.target) || '') : null;
        const vk = valsCache.map;
        S.autoLaneVals = vk ? (vk.get(holdJump.cycle.target) || null) : null;
        return;
    }
    if (lanePin && lanePinTick()) return;
    if (!autoBankIsActive() || !S.bankCardLatched || S.moveCoRunTrack >= 0) {
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
    a.cyclePage = Math.max(0, Math.min(cy.pages - 1, a.cyclePage | 0));
    S.autoCycle = { t, c, target, off: cy.off, len: cy.len, tps: cy.tps,
                    pages: cy.pages, page: a.cyclePage, text: cy.text };
}
/* Left/Right while a row is selected: page through ITS cycle, clamped at the
 * ends. True when consumed — a one-page cycle still consumes them (nothing to
 * page to, and the pad's grid is not what is on the buttons). */
export function autoCyclePageStep(delta) {
    const cy = S.autoCycle;
    if (!cy || cy.t !== S.activeTrack || !(autoBankIsActive() || lanePin)) return false;
    const a = st();
    a.cyclePage = Math.max(0, Math.min(cy.pages - 1, (a.cyclePage | 0) + (delta < 0 ? -1 : 1)));
    cy.page = a.cyclePage;
    return true;
}

/* Which slot this track's chain targets live in — for tests and labels. */
export function autoBankSlotForTrack(t) { return schSlotForTrack(t); }
export function autoBankIsActive() { return S.activeBank === BANK_AUTOMATION && !S.sessionView; }
