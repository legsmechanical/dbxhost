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
 *   Delete + click on the card    → CLEAR CLIP, the shortcut
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

import { S } from './ui_state.mjs';
import { BANK_AUTOMATION, midiTargetIsMidi } from './ui_constants.mjs';
import { effectiveClip } from './ui_leds.mjs';
import { automationEntriesFor, automationTargetLabel, automationClearKey,
         automationToggleActive, automationToggleSmooth, automationSmoothable,
         automationSetLoop, automationSetRate, automationRateText, automationSetScale,
         automationClearClip } from './ui_automation.mjs';
import { drawKitList, drawKitStackedList, drawKitBackdropDim, drawKitHintRow,
         drawBrackets, kitUseLayout, MV_FOOTER_Y } from './ui_movy.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { schSlotForTrack } from './ui_corun.mjs';

const LIST_TOP = 11;                 /* the kit list's own default */

/* The state lives on davebox's global S so a view switch / bank walk can drop
 * it from anywhere: { menu, sel, ops: { rows, sel, row } | null, loopEdit,
 * loopVal }. Lazily created; `reset` puts it back to the plain card. */
function st() {
    if (!S.autoBank) S.autoBank = { menu: false, sel: 0, ops: null, loopEdit: false, loopVal: 0 };
    return S.autoBank;
}
export function autoBankReset() {
    if (S.autoBank) { S.autoBank.menu = false; S.autoBank.ops = null; S.autoBank.loopEdit = false; S.autoBank.rateEdit = false; S.autoBank.scaleEdit = false; }
}
export function autoBankMenuOpen() { return !!(S.autoBank && (S.autoBank.menu || S.autoBank.ops)); }

/* The rows: every entry of the current clip (sorted by label so the list is
 * stable across edits), then the pads' aftertouch lane if the clip has one. */
export function autoBankRows(track, clip) {
    const rows = [];
    for (const e of automationEntriesFor(track, clip)) {
        rows.push({ kind: 'entry', target: e.target, label: automationTargetLabel(e.target),
                    active: e.active, smooth: e.smooth, count: e.count, loop: e.loop, res: e.res,
                    scale: isFinite(e.scale) ? e.scale : 100 });
    }
    rows.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    if (S.clipAtHas[track] && S.clipAtHas[track][clip]) rows.push({ kind: 'at', label: 'Aftertouch (pads)' });
    return rows;
}
function rowValue(r) {
    if (r.kind === 'at') return 'PADS';
    if (!r.active) return 'OFF';
    return r.smooth ? 'SMTH' : 'ON';
}
function loopText(steps) { return steps > 0 ? (steps + ' ST') : 'CLIP'; }
function scaleText(pct) { return (isFinite(pct) ? pct : 100) + '%'; }

/* Loop length in STEPS for the row (the store keeps ticks). */
function rowLoopSteps(track, clip, r) {
    const tps = (S.clipTPS[track] && S.clipTPS[track][clip]) || 24;
    return r.loop > 0 ? Math.max(1, Math.round(r.loop / tps)) : 0;
}

function opsFor(track, clip, r) {
    if (r.kind === 'at') return [{ op: 'delete', label: 'Delete' }];
    const ops = [{ op: 'delete', label: 'Delete' },
                 { op: 'active', label: r.active ? 'Mute' : 'Unmute' }];
    const i = r.target.indexOf(':');
    const slot = parseInt(r.target.slice(0, i), 10), fullKey = r.target.slice(i + 1);
    if (midiTargetIsMidi(r.target) || (isFinite(slot) && automationSmoothable(slot, fullKey)))
        ops.push({ op: 'smooth', label: r.smooth ? 'Stepped' : 'Smooth' });
    ops.push({ op: 'loop', label: 'Loop', value: loopText(rowLoopSteps(track, clip, r)) });
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
    const listRows = rows.map(r => ({ label: r.label, value: rowValue(r) }));
    if (a.menu) listRows.push({ label: 'Clear clip', hdr: true });
    if (a.sel >= listRows.length) a.sel = Math.max(0, listRows.length - 1);
    kitUseLayout('bank');
    drawKitList(listRows, a.menu ? a.sel : -1, { emptyMsg: 'NO AUTOMATION' });
    /* The editor's bracketed corners on the resting card: "press jog to
     * interact" — the one mark the OLED language uses for that. */
    if (!a.menu) drawBrackets(0, LIST_TOP - 1, 128, MV_FOOTER_Y - LIST_TOP);
    let hints;
    if (a.ops) {
        const ors = a.ops.rows.map((o, i) => ({
            label: o.label,
            value: (o.op === 'loop' || o.op === 'rate' || o.op === 'scale')
                ? ((a.loopEdit || a.rateEdit || a.scaleEdit) && i === a.ops.sel ? '<' + o.value + '>' : o.value) : undefined,
        }));
        drawKitBackdropDim(0, LIST_TOP, 128, MV_FOOTER_Y - LIST_TOP);
        drawKitStackedList(1, ors, a.ops.sel, {});
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
    if (a.sel >= rows.length) { autoBankClearClip(); return; }      /* the Clear clip row */
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
    if (o.op === 'delete') {
        if (automationClearKey(t, c, r.target)) showActionPopup('AUTOMATION', 'DELETED');
    } else if (o.op === 'active') {
        const on = automationToggleActive(t, c, r.target);
        if (on !== null) showActionPopup('AUTOMATION', on ? 'ON' : 'MUTED');
    } else if (o.op === 'smooth') {
        const on = automationToggleSmooth(t, c, r.target);
        if (on !== null) showActionPopup('AUTOMATION', on ? 'SMOOTH' : 'STEPPED');
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
            const max = (S.clipLength[t] && S.clipLength[t][c]) || 16;
            const nv = Math.max(0, Math.min(max, a.loopVal + delta));
            if (nv !== a.loopVal) {
                a.loopVal = nv;
                const tps = (S.clipTPS[t] && S.clipTPS[t][c]) || 24;
                automationSetLoop(t, c, a.ops.row.target, nv > 0 ? nv * tps : 0, !a.loopCkpt);
                a.loopCkpt = true;
                a.ops.row.loop = nv > 0 ? nv * tps : 0;
                const lr = a.ops.rows.find(x => x.op === 'loop');
                if (lr) lr.value = loopText(nv);
            }
        } else {
            a.ops.sel = Math.max(0, Math.min(a.ops.rows.length - 1, a.ops.sel + delta));
        }
        return true;
    }
    const n = autoBankRows(t, c).length + 1;                 /* + Clear clip */
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
    if (a.menu) { a.menu = false; return true; }
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
    showActionPopup('AUTOMATION', any ? 'CLIP CLEARED' : 'NONE');
    a.ops = null; a.menu = false;
}
/* Which slot this track's chain targets live in — for tests and labels. */
export function autoBankSlotForTrack(t) { return schSlotForTrack(t); }
export function autoBankIsActive() { return S.activeBank === BANK_AUTOMATION && !S.sessionView; }
