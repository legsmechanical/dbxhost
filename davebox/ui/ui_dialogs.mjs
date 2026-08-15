import { S, conductorTrackIdx } from './ui_state.mjs';
import { MCUFONT, STATE_VERSION, NOTE_KEYS, SCALE_DISPLAY, pixelPrintC,
         NUM_CLIPS, PAD_MODE_DRUM, PAD_MODE_CONDUCT } from './ui_constants.mjs';
import {
    drawMenuHeader, drawMenuList, menuLayoutDefaults,
    drawDialogButton, drawDialogYesNoRow, drawDialogOkButton
} from '/data/UserData/schwung/shared/menu_layout.mjs';
import { formatItemValue, isDivider } from '/data/UserData/schwung/shared/menu_items.mjs';
/* The KIT chassis. ui_movy is pure — no imports, no state — so pulling it in
 * here cannot cycle. See docs/UI_LANGUAGE.md: a list of the app's own structure
 * renders on the kit; the host chassis is for dialogs. */
import { drawKitHeader, drawKitList } from './ui_movy.mjs';
import {
    SNAPSHOT_CAP, snapshotLabel, saveState, loadSnapshotManifest, showActionPopup,
    dropSnapshots, applySnapshotToLive, loadSelectedCurrentProject,
    readActiveSet
} from './ui_persistence.mjs';
import { effectiveClip, invalidateLEDCache } from './ui_leds.mjs';
import {
    openTextEntry, isTextEntryActive, handleTextEntryMidi, drawTextEntry, tickTextEntry,
    closeTextEntry,
} from '/data/UserData/schwung/shared/text_entry.mjs';
import {
    Blue, Cyan, Green, Lime, VividYellow, OrangeRed, Red, NeonPink, ElectricViolet, White,
} from '/data/UserData/schwung/shared/constants.mjs';

export function pixelPrintMcu(x, y, text, scale, color) {
    const charW = 5 * scale + scale;
    for (let ci = 0; ci < text.length; ci++) {
        const g = MCUFONT[text[ci]];
        if (!g) continue;
        for (let row = 0; row < 5; row++) {
            const bits = g[row];
            for (let col = 0; col < 5; col++) {
                if (bits & (1 << (4 - col)))
                    fill_rect(x + ci * charW + col * scale, y + row * scale, scale, scale, color);
            }
        }
    }
}

function pixelPrintLargeC(cx, y, text, scale, color) {
    const charW  = 5 * scale + scale;
    const totalW = text.length * charW - scale;
    const startX = cx - Math.floor(totalW / 2);
    for (let ci = 0; ci < text.length; ci++) {
        const g = MCUFONT[text[ci]];
        if (!g) continue;
        for (let row = 0; row < 5; row++) {
            const bits = g[row];
            for (let col = 0; col < 5; col++) {
                if (bits & (1 << (4 - col)))
                    fill_rect(startX + ci * charW + col * scale, y + row * scale, scale, scale, color);
            }
        }
    }
}

/* Left/right filled triangle "arrows" (the wheel-changeable "< >" indicator). */
function triLeft(x, y, w, h) {
    const mid = (h - 1) / 2;
    for (let r = 0; r < h; r++) {
        const c0 = Math.round((Math.abs(r - mid) / mid) * (w - 1));
        for (let c = c0; c < w; c++) set_pixel(x + c, y + r, 1);
    }
}
function triRight(x, y, w, h) {
    const mid = (h - 1) / 2;
    for (let r = 0; r < h; r++) {
        const c1 = Math.round((1 - Math.abs(r - mid) / mid) * (w - 1));
        for (let c = 0; c <= c1; c++) set_pixel(x + c, y + r, 1);
    }
}

/* Shared "< NNN unit >" value line — number in MCUFONT ×2, smaller unit label,
 * chevrons flanking (jog-changeable), the group centered at cx. Used by the
 * tap-tempo screen (unit 'bpm') and the post-capture chooser ('bpm' or 'bars'). */
export function drawBpmLine(cx, topY, value, unit) {
    const num = String(Math.round(value || 0));
    const u   = unit || 'bpm';
    const nS = 2, uS = 1;
    const nCW = 5 * nS + nS, uCW = 5 * uS + uS;
    const nW  = num.length * nCW - nS;
    const uW  = u.length * uCW - uS;
    const aW = 5, aH = 9, aGap = 5, uGap = 3;
    const total = aW + aGap + nW + uGap + uW + aGap + aW;
    let x = cx - Math.round(total / 2);
    if (x < 1) x = 1;
    const nH = 5 * nS;
    triLeft(x, topY + Math.round((nH - aH) / 2), aW, aH); x += aW + aGap;
    pixelPrintMcu(x, topY, num, nS, 1); x += nW + uGap;
    pixelPrintMcu(x, topY + (nH - 5 * uS), u, uS, 1); x += uW + aGap;
    triRight(x, topY + Math.round((nH - aH) / 2), aW, aH);
}

/* ---- Shared confirm-dialog chrome ----
 * The button primitive + Yes/No layout are the NORMATIVE dialog convention
 * (UI_LANGUAGE §5) and were consolidated here first (from ~8 copy-pasted
 * renderers), then hoisted into the host's shared menu_layout.mjs in P7 so
 * host screens draw the identical widget. These are thin delegates. */

const drawDlgBtn = drawDialogButton;

/* Canonical two-button Yes/No row: No left, Yes right, bottom of screen.
 * `sel` follows the universal davebox convention (0 = Yes, 1 = No). */
function drawYesNoRow(sel) {
    drawDialogYesNoRow(sel === 0);
}

/* Single filled OK button (info dialogs), centered horizontally at a caller-set
 * baseline y. Consistent 30×12 geometry everywhere. */
const drawOkButton = drawDialogOkButton;

/* Clamp a variable-length label to fit one OLED line at the 6px print font. */
function truncLabel(label, maxChars) {
    return label.length > maxChars ? label.substring(0, maxChars - 1) + '…' : label;
}

function drawTapTempoScreen() {
    clear_screen();
    drawMenuHeader('TAP TEMPO');
    drawBpmLine(64, 24, S.tapTempoBpm);
    pixelPrintC(64, 50, 'Tap any pad', 1);
}

function drawClearSessionConfirm() {
    clear_screen();
    drawMenuHeader('CLEAR SESSION');
    print(4, 16, 'This will clear the', 1);
    print(4, 25, 'entire project and', 1);
    print(4, 34, 'cannot be undone.', 1);
    drawYesNoRow(S.confirmClearSel);
}

function drawSaveStateConfirm() {
    clear_screen();
    drawMenuHeader('SAVE STATE');
    print(4, 20, 'Save this session?', 1);
    print(4, 32, S.confirmSaveCount + ' of ' + SNAPSHOT_CAP + ' saved', 1);
    drawYesNoRow(S.confirmSaveSel);
}

export function drawConvertToDrumConfirm() {
    clear_screen();
    drawMenuHeader('CONVERT');
    print(4, 16, 'Warning:', 1);
    print(4, 25, 'Existing notes may', 1);
    print(4, 34, 'be lost. Proceed?', 1);
    drawYesNoRow(S.confirmConvertToDrumSel);
}

export function drawConvertToConductConfirm() {
    clear_screen();
    drawMenuHeader('CONVERT');
    print(4, 16, 'Make Conductor?', 1);
    print(4, 25, 'Clears FX/ARP/Auto.', 1);
    print(4, 34, 'Keeps notes.', 1);
    drawYesNoRow(S.confirmConvertToConductSel);
}

/* Generic single-button INFO dialog. Renders up to 4 lines from S.menuInfoLines
 * (empty = closed). Mirrors drawConvertToConductConfirm's layout with one OK
 * button. Used for "Conductor exists", "Stop playback to change type", etc. */
export function drawMenuInfo() {
    clear_screen();
    drawMenuHeader('INFO');
    const lines = S.menuInfoLines || [];
    let y = 16;
    for (let i = 0; i < lines.length && i < 4; i++) {
        print(4, y, lines[i], 1);
        y += 9;
    }
    drawOkButton(46);
}

function drawExportConfirm() {
    clear_screen();
    drawMenuHeader('EXPORT');
    if (S.confirmExportCondPhase) {
        print(4, 22, 'Apply Conductor?', 1);
        const bY = 47, bW = 36, mH = 11;
        drawDlgBtn(4,  bY, bW, mH, S.confirmExportCondSel === 0, 'Yes');
        drawDlgBtn(45, bY, bW, mH, S.confirmExportCondSel === 1, 'No');
        drawDlgBtn(86, bY, bW, mH, S.confirmExportCondSel === 2, 'Cancel');
        return;
    }
    print(4, 16, 'Export this set as', 1);
    print(4, 25, 'an Ableton bundle?', 1);
    print(4, 34, '(transport stopped)', 1);
    drawYesNoRow(S.confirmExportSel);
}

/* Persistent post-export confirmation: shows the full device path, dismissed
 * with OK (jog-click or Back). Path is wrapped to fit the OLED. */
function drawExportDoneDialog() {
    clear_screen();
    drawMenuHeader(S.exportDoneMissing > 0 ? ('EXPORTED -' + S.exportDoneMissing) : 'EXPORTED TO');
    const path = S.exportDonePath || '';
    const W = 21;   /* chars per line at the small print font */
    let y = 14, lines = 0;
    for (let i = 0; i < path.length && lines < 4; i += W, lines++) {
        print(2, y, path.slice(i, i + W), 1);
        y += 9;
    }
    drawOkButton(52);
}

export function drawGlobalMenu() {
    if (S.tapTempoOpen)        { drawTapTempoScreen();       return; }
    if (S.exportDoneDialog)    { drawExportDoneDialog();     return; }
    if (S.confirmClearSession) { drawClearSessionConfirm();  return; }
    if (S.confirmSaveState)    { drawSaveStateConfirm();     return; }
    if (S.confirmConvertToDrum){ drawConvertToDrumConfirm(); return; }
    if (S.confirmConvertToConduct){ drawConvertToConductConfirm(); return; }
    if (S.menuInfoLines.length > 0){ drawMenuInfo(); return; }
    if (S.confirmExport || S.confirmExportCondPhase) { drawExportConfirm(); return; }
    clear_screen();
    /* Always 'Global' now. This used to read 'Track N' for the first five rows,
     * back when the menu opened with a TRACK section — that section moved to
     * Track Control (2026-08-13) and the index test would otherwise label the
     * clock and key/scale rows with a track number.
     *
     * ⭑⭑ ON THE KIT since the 2026-08-15 cohesion pass. This screen used to be
     * the most visually distant in the app and it was the only one built from
     * two foreign fonts at once: a hand-drawn mcufont 5x5 title bar (a face no
     * other screen uses for a header) over host-font rows. Both are gone; it is
     * now the same header bar and the same list body as track settings.
     *
     * ⚠⚠ NO `editing` flag on the row. formatItemValue ALREADY wraps an edited
     * value in [brackets], and drawKitList would add a second pair — the screen
     * would read "[[MINOR]]". Two components implementing one grammar; the
     * value's owner keeps it. */
    drawKitHeader('GLOBAL', false);
    drawKitList(S.globalMenuItems.map(function(item, index) {
        if (isDivider(item)) return { divider: true };
        const isEditing = S.globalMenuState.editing && index === S.globalMenuState.selectedIndex;
        /* formatItemValue returns '>' for a SUBMENU, which is the same glyph
         * drawKitList's own `chevron` draws in the same place — so the doors
         * need no special case here. */
        return { label: item ? (item.label || '') : '', hdr: true,
                 value: formatItemValue(item, isEditing, S.globalMenuState.editValue) };
    }), S.globalMenuState.selectedIndex, {});
}

/* "REC Unavailable" two-option dialog (OK | BAKE NOW). Opens when Record
 * is pressed on a clip / lane in any non-Forward direction or Audio reverse
 * style. OK dismisses; BAKE NOW opens the standard bake confirm dialog
 * pre-targeted at the active clip / drum lane. */
export function drawStateWipeConfirm() {
    clear_screen();
    drawMenuHeader('INCOMPATIBLE STATE');
    print(4, 16, 'This session is from', 1);
    print(4, 25, 'a different dAVEBOx', 1);
    print(4, 34, 'version. Erase it?', 1);
    drawYesNoRow(S.confirmStateWipeSel);
}

export function drawRecordBlockedDialog() {
    clear_screen();
    drawMenuHeader('REC UNAVAILABLE');
    print(4, 16, 'Set clip Dir to Fwd,', 1);
    print(4, 25, 'or bake it first.', 1);
    drawDlgBtn(6,  46, 46, 13, S.recordBlockedDialogSel === 0, 'OK');
    drawDlgBtn(58, 46, 64, 13, S.recordBlockedDialogSel === 1, 'Bake Now');
}

/* Shown when Tap Tempo is invoked while Clock Follow = Move (tempo is Move's, so
 * there's nothing to tap). Single OK button; dismissed by jog click or Back. */
export function drawBpmMoveInfo() {
    clear_screen();
    drawMenuHeader('TEMPO');
    print(4, 20, 'Tempo follows Move', 1);
    print(4, 30, 'while clock-linked.', 1);
    drawOkButton(52);
}

/* Destructive Lgto confirm dialog. Right-turn of CLIP K8 / DRUM LANE K8
 * opens this. OK applies; CANCEL aborts. Undoable. */
export function drawLgtoConfirm() {
    clear_screen();
    drawMenuHeader(S.confirmLgtoIsDrum ? 'LEGATO (LANE)' : 'LEGATO (CLIP)');
    print(4, 16, 'Extend notes to fill', 1);
    print(4, 25, 'gaps. Destructive.', 1);
    drawDlgBtn(6,  46, 46, 13, S.confirmLgtoSel === 0, 'OK');
    drawDlgBtn(58, 46, 64, 13, S.confirmLgtoSel === 1, 'Cancel');
}

export function drawBakeConfirm() {
    clear_screen();
    if (S.confirmBakeWrapPhase) {
        drawMenuHeader('WRAP TAILS?');
        print(4, 16, 'Wrap delay echoes', 1);
        print(4, 25, 'past clip end back', 1);
        print(4, 34, 'to the beginning?', 1);
        const bW = 38, bH = 13, bY = 50;
        drawDlgBtn(4,  bY, bW, bH, S.confirmBakeWrapSel === 0, 'Yes');
        drawDlgBtn(45, bY, bW, bH, S.confirmBakeWrapSel === 1, 'No');
        drawDlgBtn(86, bY, bW, bH, S.confirmBakeWrapSel === 2, 'Cancel');
    } else if (S.confirmBakeIsMultiLoop) {
        drawMenuHeader('BAKE FX?');
        print(4, 14, 'Bake the FX chain to', 1);
        print(4, 23, 'the clip — how many', 1);
        print(4, 32, 'loops?', 1);
        const bH = 12, bY = 44;
        drawDlgBtn(2,  bY, 27, bH, S.confirmBakeSel === 1, '1x');
        drawDlgBtn(31, bY, 27, bH, S.confirmBakeSel === 2, '2x');
        drawDlgBtn(60, bY, 27, bH, S.confirmBakeSel === 3, '4x');
        drawDlgBtn(89, bY, 37, bH, S.confirmBakeSel === 0, 'Cancel');
    } else if (!S.confirmBakeIsDrum) {
        drawMenuHeader('BAKE FX?');
        print(4, 16, 'Apply effects chain', 1);
        print(4, 25, 'to clip notes and', 1);
        print(4, 34, 'clear the settings.', 1);
        drawYesNoRow(S.confirmBakeSel);
    } else if (S.confirmBakeDrumLoopOpen) {
        /* Step 2: loop count selection */
        const modeLabel = S.confirmBakeDrumMode === 1 ? 'Lane' : 'Clip';
        drawMenuHeader('BAKE DRUMS?');
        print(4, 13, modeLabel + ' — loop count:', 1);
        const mH = 11;
        drawDlgBtn(14, 33, 100, mH, S.confirmBakeDrumLoopSel === 0, 'Cancel');
        drawDlgBtn(4,  47, 36,  mH, S.confirmBakeDrumLoopSel === 1, '1x');
        drawDlgBtn(46, 47, 36,  mH, S.confirmBakeDrumLoopSel === 2, '2x');
        drawDlgBtn(88, 47, 36,  mH, S.confirmBakeDrumLoopSel === 3, '4x');
    } else {
        drawMenuHeader('BAKE DRUMS?');
        print(4, 16, 'Bake FX to clip', 1);
        print(4, 25, '(all lanes) or lane?', 1);
        /* 3 buttons: Clip(0) | Lane(1) | Cancel(2, default) */
        const bW = 38, bH = 13, bY = 50;
        drawDlgBtn(4,  bY, bW, bH, S.confirmBakeSel === 0, 'Clip');
        drawDlgBtn(45, bY, bW, bH, S.confirmBakeSel === 1, 'Lane');
        drawDlgBtn(86, bY, bW, bH, S.confirmBakeSel === 2, 'Cancel');
    }
}

function snapById(p, id) {
    for (let i = 0; i < p.snaps.length; i++) if (p.snaps[i].id === id) return p.snaps[i];
    return null;
}

/* Yes/No buttons matching the other confirm dialogs (No left, Yes right). */
function drawSnapYesNo(sel) {
    drawYesNoRow(sel);
}

export function drawSnapshotPicker() {
    clear_screen();
    const p = S.snapshotPicker;
    if (!p) return;

    if (p.confirm) {
        const c = p.confirm;
        if (c.kind === 'wipe') {
            drawMenuHeader('STATES UPDATED');
            print(4, 18, 'Delete ' + c.wipeIds.length + ' snapshot(s)', 1);
            print(4, 27, 'from an older', 1);
            print(4, 36, 'version?', 1);
        } else if (c.kind === 'load') {
            const s = snapById(p, c.targetId);
            drawMenuHeader('LOAD STATE');
            print(4, 18, 'Load ' + truncLabel(s ? s.label : '', 15), 1);
            print(4, 27, 'Unsaved changes', 1);
            print(4, 36, 'will be lost.', 1);
        } else {
            const s = snapById(p, c.targetId);
            drawMenuHeader('OVERWRITE');
            print(4, 18, 'Replace', 1);
            print(4, 27, truncLabel(s ? s.label : '', 19) + '?', 1);
        }
        drawSnapYesNo(c.sel);
        return;
    }

    drawMenuHeader(p.mode === 'overwrite' ? 'OVERWRITE WHICH?' : 'LOAD STATE');
    const total = p.snaps.length;
    const visible = 4;
    const sel = p.sel;
    let top = Math.max(0, Math.min(sel - 1, total - visible));
    if (total <= visible) top = 0;
    const lineH = 9;
    const listTopY = 20;
    for (let i = 0; i < visible && (top + i) < total; i++) {
        const idx = top + i;
        const y = listTopY + i * lineH;
        const s = p.snaps[idx];
        let label = s.label || '';
        if (p.mode === 'load' && s.sv !== STATE_VERSION) label += ' (old)';
        const truncated = label.length > 20 ? label.substring(0, 19) + '…' : label;
        if (idx === sel) {
            fill_rect(2, y - 1, 124, lineH - 1, 1);
            print(5, y, truncated, 0);
        } else {
            print(5, y, truncated, 1);
        }
    }
    if (top > 0)               print(120, listTopY, '^', 1);
    if (top + visible < total) print(120, listTopY + (visible - 1) * lineH, 'v', 1);
}

/* CLEAR AUTOMATION modal — checkable AT / PB(disabled) / CC + a CLEAR action. */
export function drawClearAutoMenu() {
    clear_screen();
    const m = S.clearAutoMenu;
    if (!m) return;
    drawMenuHeader('CLEAR AUTOMATION');
    const rows = [
        { label: 'Aftertouch (AT)',     box: m.at ? '[x]' : '[ ]' },
        { label: 'Pitch bend (PB)',     box: '( )' },   /* placeholder, not selectable */
        { label: 'Control Change (CC)', box: m.cc ? '[x]' : '[ ]' },
        { label: 'CLEAR',  action: true },
        { label: 'Cancel', action: true }
    ];
    const lineH = 9, topY = 18;
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const y = topY + i * lineH;
        const seld = (m.sel === i);
        if (seld) fill_rect(2, y - 1, 124, lineH - 1, 1);
        const txt = r.action ? r.label : (r.box + ' ' + r.label);
        print(5, y, txt, seld ? 0 : 1);
    }
}

export function drawBakeSceneConfirm() {
    clear_screen();
    drawMenuHeader('BAKE SCENE?');
    const mH = 11;
    if (S.confirmBakeSceneCondPhase) {
        print(4, 22, 'Apply Conductor?', 1);
        const bY = 47, bW = 36;
        drawDlgBtn(4,  bY, bW, mH, S.confirmBakeSceneCondSel === 0, 'Yes');
        drawDlgBtn(45, bY, bW, mH, S.confirmBakeSceneCondSel === 1, 'No');
        drawDlgBtn(86, bY, bW, mH, S.confirmBakeSceneCondSel === 2, 'Cancel');
    } else if (S.confirmBakeSceneWrapPhase) {
        print(4, 22, 'Wrap tails?', 1);
        const bY = 47, bW = 36;
        drawDlgBtn(4,  bY, bW, mH, S.confirmBakeSceneWrapSel === 0, 'Yes');
        drawDlgBtn(45, bY, bW, mH, S.confirmBakeSceneWrapSel === 1, 'No');
        drawDlgBtn(86, bY, bW, mH, S.confirmBakeSceneWrapSel === 2, 'Cancel');
    } else {
        print(4, 22, 'Loop count:', 1);
        drawDlgBtn(14, 33, 100, mH, S.confirmBakeSceneSel === 0, 'Cancel');
        drawDlgBtn(4,  47, 36,  mH, S.confirmBakeSceneSel === 1, '1x');
        drawDlgBtn(46, 47, 36,  mH, S.confirmBakeSceneSel === 2, '2x');
        drawDlgBtn(88, 47, 36,  mH, S.confirmBakeSceneSel === 3, '4x');
    }
}

export function drawXposeConfirm() {
    clear_screen();
    drawMenuHeader('TRANSPOSE CLIPS?');
    const tgt = NOTE_KEYS[S.confirmXposeKey] + ' ' + (SCALE_DISPLAY[S.confirmXposeScale] || '?');
    print(4, 22, 'To ' + tgt, 1);
    print(4, 33, 'All melodic clips', 1);
    drawYesNoRow(S.confirmXposeSel);
}

/* ------------------------------------------------------------------ */
/* Snapshots — Save state / Load state                                 */
/* Self-contained modal (S.snapshotPicker), modeled on the inherit     */
/* picker. Confirm dialogs are folded into the picker object so the     */
/* only integration points are draw, jog-rotate, jog-click and close.  */
/* ------------------------------------------------------------------ */

/* Flush live state to disk (deferred 'save') then copy it into snapshot
 * `id` next tick — pendingSnapshotCopy is drained one tick after the save,
 * by which point seq8_save_state has written the file synchronously.
 * Reusing an existing id overwrites that snapshot in place. */
function beginSnapshotSave(id) {
    S.pendingSnapshotCopy = { id: id, label: snapshotLabel() };
    saveState();
}

/* Save state action. Under the cap → new timestamped snapshot. At the cap →
 * open the overwrite picker to choose which existing one to replace. */
export function openSaveSnapshot() {
    if (S.pendingSuspendSave || S.pendingSnapshotCopy) return;  /* save already in flight */
    const snaps = loadSnapshotManifest(S.currentSetUuid);
    if (snaps.length >= SNAPSHOT_CAP) {
        S.snapshotPicker = { mode: 'overwrite', snaps: snaps, sel: 0, confirm: null };
        S.globalMenuOpen = false;
        S.screenDirty = true;
        return;
    }
    beginSnapshotSave(String(Date.now()));
    S.globalMenuOpen = false;
    showActionPopup('STATE', 'SAVED');
}

/* Load state action. Empty → popup. If any snapshots predate the current
 * state version, offer to wipe them before showing the list. */
export function openLoadSnapshot() {
    const snaps = loadSnapshotManifest(S.currentSetUuid);
    if (snaps.length === 0) {
        S.globalMenuOpen = false;
        showActionPopup('NO', 'SNAPSHOTS');
        return;
    }
    const stale = [];
    for (let i = 0; i < snaps.length; i++)
        if (snaps[i].sv !== STATE_VERSION) stale.push(snaps[i].id);
    S.snapshotPicker = { mode: 'load', snaps: snaps, sel: 0, confirm: null };
    if (stale.length > 0)
        S.snapshotPicker.confirm = { kind: 'wipe', sel: 1, wipeIds: stale };
    S.globalMenuOpen = false;
    S.screenDirty = true;
}

export function closeSnapshotPicker() {
    S.snapshotPicker = null;
    S.screenDirty = true;
}

/* Jog rotation inside the picker: toggle a confirm's Yes/No, else move
 * the list selection. */
export function snapshotPickerRotate(delta) {
    const p = S.snapshotPicker;
    if (!p || delta === 0) return;
    if (p.confirm) {
        p.confirm.sel = p.confirm.sel === 0 ? 1 : 0;
    } else {
        const n = p.snaps.length;
        if (n > 0) p.sel = (p.sel + (delta > 0 ? 1 : n - 1)) % n;
    }
    S.screenDirty = true;
}

/* Jog click inside the picker: resolve a confirm, or arm one for the
 * selected entry. */
export function snapshotPickerClick() {
    const p = S.snapshotPicker;
    if (!p) return;
    if (p.confirm) {
        const yes = p.confirm.sel === 0;
        const kind = p.confirm.kind;
        if (kind === 'wipe') {
            if (yes) { p.snaps = dropSnapshots(S.currentSetUuid, p.confirm.wipeIds); p.sel = 0; }
            p.confirm = null;
            if (p.snaps.length === 0) closeSnapshotPicker();
            else S.screenDirty = true;
            return;
        }
        const id = p.confirm.targetId;
        closeSnapshotPicker();
        if (kind === 'load' && yes) {
            applySnapshotToLive(S.currentSetUuid, id);
            S.pendingSetLoad = true;          /* reuse the normal state_load reload path */
            showActionPopup('STATE', 'LOADED');
        } else if (kind === 'overwrite' && yes) {
            beginSnapshotSave(id);            /* reuse id → overwrite in place */
            showActionPopup('STATE', 'SAVED');
        }
        return;
    }
    const snap = p.snaps[p.sel];
    if (!snap) return;
    if (p.mode === 'load') {
        if (snap.sv !== STATE_VERSION) return;   /* incompatible: ignore press */
        p.confirm = { kind: 'load', sel: 1, targetId: snap.id };
    } else {
        p.confirm = { kind: 'overwrite', sel: 1, targetId: snap.id };
    }
    S.screenDirty = true;
}

/* ---- CLEAR AUTOMATION menu (Delete-tap on the AUTO bank) ---- */
export function openClearAutoMenu() {
    S.clearAutoMenu = { sel: 0, at: false, cc: false };
    S.screenDirty = true;
}

export function closeClearAutoMenu() {
    S.clearAutoMenu = null;
    S.screenDirty = true;
}

export function clearAutoMenuRotate(delta) {
    const m = S.clearAutoMenu;
    if (!m || delta === 0) return;
    m.sel = (m.sel + (delta > 0 ? 1 : 4)) % 5;   /* 0=AT 1=PB 2=CC 3=CLEAR 4=Cancel */
    S.screenDirty = true;
}

export function clearAutoMenuClick() {
    const m = S.clearAutoMenu;
    if (!m) return;
    if (m.sel === 0) { m.at = !m.at; }              /* Aftertouch (AT) */
    else if (m.sel === 1) { /* Pitch bend (PB) — placeholder, not selectable */ }
    else if (m.sel === 2) { m.cc = !m.cc; }         /* Control Change (CC) — all CC data */
    else if (m.sel === 4) { closeClearAutoMenu(); return; }   /* Cancel */
    else {                                           /* CLEAR — execute */
        const t = S.activeTrack, c = effectiveClip(t);
        if (m.cc) {
            S.trackCCAutoBits[t][c] = 0;
            S.trackCCLiveVal[t] = new Array(8).fill(-1);
            S.clipCCVal[t][c] = new Array(8).fill(-1);
            S.pendingDefaultSetParams.push({ key: 't' + t + '_cc_auto_clear', val: String(c) });
        }
        if (m.at) {
            S.clipAtHas[t][c] = false;
            S.pendingDefaultSetParams.push({ key: 't' + t + '_c' + c + '_at_clear', val: '1' });
        }
        const done = [];
        if (m.at) done.push('AT');
        if (m.cc) done.push('CC');
        if (done.length) {
            S.undoAvailable = true; S.redoAvailable = false; S.undoSeqArpSnapshot = null;
        }
        closeClearAutoMenu();
        invalidateLEDCache();
        showActionPopup('CLEARED', done.length ? done.join(' ') : 'NOTHING');
        return;
    }
    S.screenDirty = true;
}

/* Open the generic menu INFO dialog with the given text lines (each argument is
 * one line, up to ~4 shown). Empty = closed. */
export function showMenuInfo() {
    S.menuInfoLines = Array.prototype.slice.call(arguments);
    S.screenDirty = true;
}

/* Tear down the Keys->Drums confirm dialog and the menu's edit state so a
 * lingering enum edit doesn't replay. Call on Yes, No, and Back-cancel. */
export function closeConvertConfirm() {
    S.confirmConvertToDrum = false;
    S.confirmConvertToConduct = false;
    S.menuInfoLines = [];
    if (S.globalMenuState) S.globalMenuState.editing = false;
    if (S.globalMenuState) S.globalMenuState.editValue = null;
    S.lastSentMenuEditValue = null;
    S.bpmWasEditing = false;
}

/* ------------------------------------------------------------------ */
/* PROJECTS pad picker (v3, 2026-08-07). History: a jog picker lived   */
/* here (built + retired 08-06 for the native-picker model), then the  */
/* native Move picker turned out to be an unownable USER surface (the  */
/* seams: gesture injection, mode fighting, invisible scroll state) — */
/* so the picker came home: dAVEBOx draws it, on the pads, and the     */
/* host gate survives only as a headless switch actuator. Lesson kept  */
/* from the jog picker's one device freeze: module input dead + host   */
/* input alive = a repeated JS exception in an input handler, and      */
/* NOTHING logs it — every entry point here is wrapped (_pppGuard).    */
/* ------------------------------------------------------------------ */

const PROJECT_CMD = '/data/UserData/dbx-host/scripts/project-cmd.sh';
const PROJECTS_JSON = '/data/UserData/dbx-host/projects.json';

function _pppRunList() {
    /* host_system_cmd blocks (system()), so the refreshed list is readable
     * immediately — same contract the retired jog picker relied on. */
    host_system_cmd('sh ' + PROJECT_CMD + ' list');
    let data = null;
    try { data = JSON.parse(host_read_file(PROJECTS_JSON) || ''); }
    catch (e) { data = null; }
    return (data && Array.isArray(data.projects)) ? data : null;
}

function _pppApplyList(p, data) {
    p.projects = data.projects;
    p.byIndex = {};
    for (let i = 0; i < data.projects.length; i++) {
        const pr = data.projects[i];
        if (pr.index !== null && pr.index !== undefined) p.byIndex[pr.index] = pr;
    }
    /* WHICH PROJECT IS OPEN: ask the host, not Settings.json.
     *
     * data.current is project-cmd's read of Move's `currentSongIndex`, and that
     * value is only written at a relaunch — it goes stale in a live session and
     * then names the WRONG project. Measured on hardware 2026-08-11: it said 5
     * while active_set.txt, the DSP's own autosave target and the user all said
     * 14. That is not cosmetic: the pad tap below treats `k === p.current` as
     * "you tapped the project that is already open" and just closes the picker,
     * so with a stale value the real project becomes UNSELECTABLE (Josh: "pressing
     * slot 5 doesn't load anything, it goes back to slot 14"), while the delete
     * guard protects the wrong pad and would permit deleting the live one.
     *
     * active_set.txt is the host's own record of the set it loaded, written on
     * every set change, and it is per-install — ours, under DAVEBOX_HOST_DIR.
     * (⚠ The STOCK tree has a file of the same name holding native-session
     * leftovers; readActiveSet reads OURS. See tests/test_install_paths.sh.)
     * Match it by uuid and fall back to Settings.json only when it names nothing
     * we know — at first boot, before any set change has been recorded. */
    p.current = data.current;
    const _as = readActiveSet();
    if (_as.uuid) {
        for (let i = 0; i < data.projects.length; i++) {
            const pr = data.projects[i];
            if (pr.uuid === _as.uuid && pr.index !== null && pr.index !== undefined) {
                p.current = pr.index;
                break;
            }
        }
    }
}

/* SELECT-BEFORE-LOAD safety valve. If the picker cannot open at session start
 * — no host_system_cmd, or project-cmd gave us no list — the user would be
 * stranded on an empty instance with no way to choose and nothing loaded. Fail
 * OPEN: load the boot project, exactly as a pre-select-before-load session did.
 * A degraded session that works beats a correct one that is unusable. */
function _pppFailOpen() {
    if (!S.awaitingProjectSelect) return;
    console.log('projectPadPicker: cannot open at boot — loading boot project');
    loadSelectedCurrentProject();
}

function _openProjectPadPicker_impl() {
    /* Projects are a davebox-host concept (project-cmd.sh, projects.json live in
     * the SA install), and this is that host — the picker is always legitimate
     * here. _pppFailOpen() remains the answer for a genuine data failure below;
     * it just no longer answers "which host is this". */
    /* Toggle — EXCEPT while awaiting a selection, where closing the picker
     * leaves nothing loaded, nothing on screen but LOADING, and no way out.
     * Belt to the step-button gate: this is reachable from the menu too. */
    if (S.projectPadPicker) {
        if (!S.awaitingProjectSelect) closeProjectPadPicker();
        return;
    }
    const data = _pppRunList();
    if (!data) { showActionPopup('NO PROJECT', 'LIST'); _pppFailOpen(); return; }
    const p = { projects: [], byIndex: {}, current: -1,
                touchedIdx: -1, copySrcIdx: -1, deleteIdx: -1,
                /* jog-menu overlays (one open at a time; see the tap impl) */
                menu: null, colorPick: null, confirmNew: null, renameActive: false,
                restarting: false };
    _pppApplyList(p, data);
    S.projectPadPicker = p;
    S.globalMenuOpen = false;
    invalidateLEDCache();
    S.screenDirty = true;
}

function _closeProjectPadPicker_impl() {
    /* A live rename keyboard must not outlive the picker that opened it. */
    const _p = S.projectPadPicker;
    if (_p && _p.renameActive && isTextEntryActive()) closeTextEntry();
    S.projectPadPicker = null;
    S.ledInitComplete = false;      /* repaint the sequencer surface */
    invalidateLEDCache();
    S.screenDirty = true;
}

/* Pre-defined pad colors a project can carry (spec: Josh, 2026-08-11). The
 * xattr user.dbx-color stores an INDEX into this table (project-cmd.sh
 * `color` verb); absent/null = index 0, today's uniform blue. Exported for
 * the LED painter. */
export const PROJECT_COLORS = [
    { name: 'BLUE',   led: Blue },
    { name: 'CYAN',   led: Cyan },
    { name: 'GREEN',  led: Green },
    { name: 'LIME',   led: Lime },
    { name: 'YELLOW', led: VividYellow },
    { name: 'ORANGE', led: OrangeRed },
    { name: 'RED',    led: Red },
    { name: 'PINK',   led: NeonPink },
    { name: 'VIOLET', led: ElectricViolet },
    { name: 'WHITE',  led: White },
];
/* ⚠ `color` is null for a project that never picked one, and `null >= 0` is
 * TRUE in JS — indexing the table with null crashed the LED painter inside
 * the tick, which wedged the whole boot (LOADING pinned, pads dark; found on
 * hardware 2026-08-12). Only a real in-range number selects a palette entry. */
function projectColorIdx(proj) {
    const c = proj ? proj.color : null;
    return (typeof c === 'number' && c >= 0 && c < PROJECT_COLORS.length) ? c : 0;
}
export function projectColorLED(proj) {
    return PROJECT_COLORS[projectColorIdx(proj)].led;
}

/* POSIX single-quote for a name headed through host_system_cmd (system()). */
function _shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function _pppCloseOverlays(p) {
    p.menu = null; p.colorPick = null; p.confirmNew = null;
}

/* The project jog-menu (spec: Josh, 2026-08-11 — tap never loads). */
const PPP_MENU_ROWS = ['Load', 'Rename', 'Color'];

function _pppOpenMenu(p, k) {
    _pppCloseOverlays(p);
    p.menu = { k: k, sel: 0 };
    S.screenDirty = true;
}

/* --- menu actions ------------------------------------------------------ */

function _pppLoad(p, k) {
    if (k === p.current) {
        /* The already-current project. Under SELECT-BEFORE-LOAD this IS the
         * selection: create_instance loaded nothing, so load now. Once a
         * project is live, "Load" on the current one just closes the picker. */
        closeProjectPadPicker();
        if (S.awaitingProjectSelect) loadSelectedCurrentProject();
        return;
    }
    /* Switch: save first; the command fires one tick after the save lands
     * (the switch suspends/tears this module down — same shape as Quit).
     * saveState() is a no-op while awaiting a selection — there is nothing
     * loaded to save, and writing would clobber the project we are leaving. */
    closeProjectPadPicker();
    showActionPopup('OPENING', 'PROJECT');
    saveState();
    S.pendingProjectSwitch = k;
}

function _pppStartRename(p, k) {
    const proj = p.byIndex[k];
    if (!proj) return;
    p.renameActive = true;
    openTextEntry({
        title: '',
        initialText: proj.name,
        onConfirm: (name) => { _pppGuard('renamedo', _pppDoRename_impl, [k, name]); },
        onCancel:  () => {
            const q = S.projectPadPicker;
            if (q) { q.renameActive = false; }
            S.screenDirty = true;
        },
    });
    S.screenDirty = true;
}

function _pppDoRename_impl(k, name) {
    const p = S.projectPadPicker;
    if (!p) return;
    p.renameActive = false;
    const proj = p.byIndex[k];
    const trimmed = String(name || '').trim().replace(/\//g, '-');
    if (!proj || !trimmed || trimmed === proj.name) { S.screenDirty = true; return; }
    /* Two projects with one name would confuse the family lookup AND the
     * name index (name -> uuid) — refuse up front. */
    for (let i = 0; i < p.projects.length; i++) {
        if (p.projects[i].uuid !== proj.uuid && p.projects[i].name === trimmed) {
            showActionPopup('NAME', 'TAKEN');
            return;
        }
    }
    if (k === p.current) {
        /* The OPEN project renames via the deferred switch-in-place path:
         * project-cmd queues the mv for the launcher and restarts Move at the
         * same index. Save our half first — same ordering as a switch.
         *
         * ⚠ LOCK THE PICKER FIRST. The SIGTERM lands ~1-2 s after the command
         * returns, and any gesture accepted in that window races the teardown
         * — on hardware (2026-08-12) a recolor + Load fired in the gap, the
         * Load's select-handoff had its Move killed mid-walk, and the session
         * came back with the module parked under the host UI. `restarting`
         * makes every picker entry point a no-op until the restart takes us.
         *
         * From the BOOT picker (awaiting select) nothing is loaded and nobody
         * chose anything, so the restart must come back to the picker —
         * that is the `reselect` arg (launcher re-arms fresh_session). A
         * rename inside a live session restarts back into the project, which
         * is what "restart in place" means there. */
        p.restarting = true;
        _pppCloseOverlays(p);
        S.screenDirty = true;
        saveState();
        showActionPopup('RENAMING', 'RESTARTING');
        host_system_cmd('sh ' + PROJECT_CMD + ' rename ' + k + ' ' + _shq(trimmed) +
                        (S.awaitingProjectSelect ? ' reselect' : ''));
        return;
    }
    host_system_cmd('sh ' + PROJECT_CMD + ' rename ' + k + ' ' + _shq(trimmed));
    const d = _pppRunList();
    if (d) _pppApplyList(p, d);
    const now = p.byIndex[k];
    if (now && now.name === trimmed) showActionPopup('PROJECT', 'RENAMED');
    else showActionPopup('RENAME', 'FAILED');
    S.screenDirty = true;
}

function _pppCommitColor(p, k, colorIdx) {
    host_system_cmd('sh ' + PROJECT_CMD + ' color ' + k + ' ' + colorIdx);
    const d = _pppRunList();
    if (d) _pppApplyList(p, d);
    p.colorPick = null;
    invalidateLEDCache();
    S.screenDirty = true;
}

/* Jog click while the picker is up. With no overlay open it opens the menu on
 * the CURRENT project — the keyboard-free confirm under SELECT-BEFORE-LOAD. */
function _projectPadPickerClick_impl() {
    const p = S.projectPadPicker;
    if (!p) return;
    if (p.restarting) return;      /* rename-of-current: teardown in flight */
    if (p.confirmNew) {
        const c = p.confirmNew;
        if (c.sel === 0) {          /* Yes — create, then open its menu */
            host_system_cmd('sh ' + PROJECT_CMD + ' new-at ' + c.k);
            const d = _pppRunList();
            if (d) _pppApplyList(p, d);
            if (!p.byIndex[c.k]) { p.confirmNew = null; showActionPopup('CREATE', 'FAILED'); return; }
            invalidateLEDCache();
            _pppOpenMenu(p, c.k);
        } else {
            p.confirmNew = null;
        }
        S.screenDirty = true;
        return;
    }
    if (p.colorPick) {
        _pppCommitColor(p, p.colorPick.k, p.colorPick.sel);
        return;
    }
    if (p.menu) {
        const m = p.menu;
        if (m.sel === 0) { _pppLoad(p, m.k); return; }
        if (m.sel === 1) { _pppStartRename(p, m.k); return; }
        p.colorPick = { k: m.k, sel: projectColorIdx(p.byIndex[m.k]) };
        p.menu = null;
        S.screenDirty = true;
        return;
    }
    if (p.current >= 0 && p.current < 32 && p.byIndex[p.current]) _pppOpenMenu(p, p.current);
}

function _projectPadPickerRotate_impl(delta) {
    const p = S.projectPadPicker;
    if (!p || !delta) return;
    if (p.restarting) return;      /* rename-of-current: teardown in flight */
    if (p.confirmNew) {
        p.confirmNew.sel = p.confirmNew.sel === 0 ? 1 : 0;
    } else if (p.colorPick) {
        const n = PROJECT_COLORS.length;
        p.colorPick.sel = (p.colorPick.sel + (delta > 0 ? 1 : n - 1)) % n;
        invalidateLEDCache();     /* live preview on the target pad */
    } else if (p.menu) {
        const n = PPP_MENU_ROWS.length;
        p.menu.sel = (p.menu.sel + (delta > 0 ? 1 : n - 1)) % n;
    } else {
        return;
    }
    S.screenDirty = true;
}

/* Back while the picker is up: peel one overlay level; returns false when
 * there was nothing to peel (caller closes the picker itself). */
function _projectPadPickerBack_impl() {
    const p = S.projectPadPicker;
    if (!p) return false;
    if (p.restarting) return true; /* swallow — teardown in flight */
    if (p.colorPick) { _pppOpenMenu(p, p.colorPick.k); invalidateLEDCache(); return true; }
    if (p.menu || p.confirmNew) { _pppCloseOverlays(p); S.screenDirty = true; return true; }
    return false;
}

/* Keyboard plumbing while a rename is live: the shared text-entry component
 * is fully modal and reads raw messages (same contract sound mode uses). */
function _projectPickerTextEntryMidi_impl(data) {
    const p = S.projectPadPicker;
    if (!p || !p.renameActive) return false;
    if (!isTextEntryActive()) { p.renameActive = false; return false; }
    handleTextEntryMidi(data);
    S.screenDirty = true;
    if (!isTextEntryActive()) {
        const q = S.projectPadPicker;      /* rename may have torn the picker down */
        if (q) q.renameActive = false;
        invalidateLEDCache();
    }
    return true;
}

function _projectPickerTextEntryTick_impl() {
    const p = S.projectPadPicker;
    if (p && p.renameActive && isTextEntryActive()) {
        if (tickTextEntry()) S.screenDirty = true;
        return true;
    }
    return false;
}

/* Pad tap inside the picker. k = pad index 0-31 == user.song-index. */
function _projectPadPickerTap_impl(k) {
    const p = S.projectPadPicker;
    if (!p) return;
    if (p.restarting) return;      /* rename-of-current: teardown in flight */
    p.touchedIdx = k;
    const proj = p.byIndex[k];

    if (S.deleteHeld) {
        _pppCloseOverlays(p);
        if (!proj) { p.deleteIdx = -1; showActionPopup('EMPTY', 'PAD'); return; }
        if (k === p.current) { p.deleteIdx = -1; showActionPopup('CANT DELETE', 'OPEN PROJ'); return; }
        if (p.deleteIdx === k) {
            host_system_cmd('sh ' + PROJECT_CMD + ' delete ' + k);
            const d = _pppRunList();
            if (d) _pppApplyList(p, d);
            p.deleteIdx = -1;
            invalidateLEDCache();
            showActionPopup('PROJECT', 'DELETED');
        } else {
            p.deleteIdx = k;    /* OLED asks for the confirming tap */
        }
        S.screenDirty = true;
        return;
    }

    if (S.copyHeld) {
        _pppCloseOverlays(p);
        if (p.copySrcIdx < 0) {
            if (!proj) { showActionPopup('EMPTY', 'PAD'); return; }
            p.copySrcIdx = k;
        } else if (k === p.copySrcIdx) {
            p.copySrcIdx = -1;                       /* tap source again = cancel */
        } else if (proj) {
            showActionPopup('PAD', 'OCCUPIED');
        } else {
            host_system_cmd('sh ' + PROJECT_CMD + ' copy ' + p.copySrcIdx + ' ' + k);
            const d = _pppRunList();
            if (d) _pppApplyList(p, d);
            p.copySrcIdx = -1;
            invalidateLEDCache();
            showActionPopup('PROJECT', 'COPIED');
        }
        S.screenDirty = true;
        return;
    }

    /* Plain tap NEVER loads (spec: Josh, 2026-08-11 — it also removes the
     * accidental-load hazard). Occupied pad -> the Load/Rename/Color jog-menu;
     * empty pad -> a Create-new confirm. Tapping while an overlay is already
     * open simply re-targets. */
    if (!proj) {
        _pppCloseOverlays(p);
        p.confirmNew = { k: k, sel: 0 };
        S.screenDirty = true;
        return;
    }
    _pppOpenMenu(p, k);
}

/* Modifier releases cancel the two-step flows (OUR semantics — matches how
 * Move treats its own hold-modifiers, and what the user asked for). */
function _projectPadPickerModifiers_impl() {
    const p = S.projectPadPicker;
    if (!p) return;
    let dirty = false;
    if (!S.copyHeld && p.copySrcIdx >= 0)  { p.copySrcIdx = -1; dirty = true; }
    if (!S.deleteHeld && p.deleteIdx >= 0) { p.deleteIdx = -1; dirty = true; }
    if (dirty) S.screenDirty = true;
}

function _drawProjectPadPicker_impl() {
    const p = S.projectPadPicker;
    if (!p) { clear_screen(); return; }

    /* Rename keyboard is fully modal and draws itself. */
    if (p.renameActive && isTextEntryActive()) { drawTextEntry(); return; }

    clear_screen();

    if (p.restarting) {
        drawMenuHeader('RENAMING');
        print(4, 24, 'Restarting the', 1);
        print(4, 34, 'session...', 1);
        return;
    }

    if (p.confirmNew) {
        drawMenuHeader('NEW PROJECT');
        print(4, 20, 'Create new project', 1);
        print(4, 30, 'on this pad?', 1);
        drawYesNoRow(p.confirmNew.sel);
        return;
    }

    if (p.colorPick) {
        const cp = p.byIndex[p.colorPick.k];
        drawMenuHeader(truncLabel(cp ? cp.name : '?', 18));
        print(4, 20, 'Color:', 1);
        /* Wheel-changeable value row (< NAME >); the pad itself previews the
         * actual color live. */
        const nm = PROJECT_COLORS[p.colorPick.sel].name;
        print(4, 32, '< ' + nm + ' >', 1);
        print(4, 50, 'Click: set  Back: cancel', 1);
        return;
    }

    if (p.menu) {
        const mp = p.byIndex[p.menu.k];
        drawMenuHeader(truncLabel(mp ? mp.name : '?', 18));
        const lineH = 10, listTopY = 18;
        for (let i = 0; i < PPP_MENU_ROWS.length; i++) {
            const y = listTopY + i * lineH;
            if (i === p.menu.sel) {
                fill_rect(2, y - 1, 124, lineH - 1, 1);
                print(5, y, PPP_MENU_ROWS[i], 0);
            } else {
                print(5, y, PPP_MENU_ROWS[i], 1);
            }
        }
        print(4, 54, 'Click: select  Back: close', 1);
        return;
    }

    drawMenuHeader('PROJECTS');
    const cur = p.byIndex[p.current];
    print(4, 16, 'Now: ' + truncLabel(cur ? cur.name : '-', 16), 1);
    if (p.deleteIdx >= 0) {
        const dp = p.byIndex[p.deleteIdx];
        print(4, 28, 'Delete ' + truncLabel(dp ? dp.name : '?', 12) + '?', 1);
        print(4, 38, 'Tap the pad again.', 1);
    } else if (p.copySrcIdx >= 0) {
        const sp = p.byIndex[p.copySrcIdx];
        print(4, 28, 'Copy ' + truncLabel(sp ? sp.name : '?', 13), 1);
        print(4, 38, 'Tap an empty pad.', 1);
    } else {
        print(4, 28, 'Tap a pad: menu.', 1);
        print(4, 38, 'Empty pad = new.', 1);
    }
    print(4, 50, 'Copy/Del: hold+tap  Back: close', 1);
}

/* Fail-SAFE wrappers: see the banner above. */
function _pppGuard(name, impl, args) {
    try { return impl.apply(null, args); }
    catch (e) {
        try { console.log('projectPadPicker FAULT in ' + name + ': ' + e + ' :: ' + (e && e.stack ? e.stack : 'no stack')); } catch (e2) {}
        try { S.projectPadPicker = null; } catch (e3) {}
        /* Nulling the picker is survivable once a project is loaded — the user
         * lands back on the sequencer. While AWAITING it is a dead end: no
         * project, no picker, LOADING pinned, transport locked. The tick
         * watchdog re-arms the open, but if the fault is in the open itself
         * that would loop, so count the attempts and fail open to the boot
         * project instead. */
        try {
            if (S.awaitingProjectSelect) {
                S._pppFaultCount = (S._pppFaultCount | 0) + 1;
                if (S._pppFaultCount >= 3) _pppFailOpen();
            }
        } catch (e4) {}
    }
}
export function openProjectPadPicker()      { return _pppGuard('open',  _openProjectPadPicker_impl, []); }
export function closeProjectPadPicker()     { return _pppGuard('close', _closeProjectPadPicker_impl, []); }
export function projectPadPickerTap(k)      { return _pppGuard('tap',   _projectPadPickerTap_impl, [k]); }
export function projectPadPickerModifiers() { return _pppGuard('mods',  _projectPadPickerModifiers_impl, []); }
export function drawProjectPadPicker()      { return _pppGuard('draw',  _drawProjectPadPicker_impl, []); }
export function projectPadPickerClick()     { return _pppGuard('click', _projectPadPickerClick_impl, []); }
export function projectPadPickerRotate(d)   { return _pppGuard('rot',   _projectPadPickerRotate_impl, [d]); }
export function projectPadPickerBack()      { return _pppGuard('back',  _projectPadPickerBack_impl, []); }
export function projectPickerTextEntryMidi(data) { return _pppGuard('kbd',  _projectPickerTextEntryMidi_impl, [data]); }
export function projectPickerTextEntryTick()     { return _pppGuard('kbdt', _projectPickerTextEntryTick_impl, []); }


/* ---- changing a track's TYPE (Keys / Drums / Conductor) ----
 *
 * The only per-track setting whose edit CONVERTS the track, so it is the only
 * one that has to ask first. Lifted out of the global menu's jog-click handler
 * when `Mode` moved to Track Control's Config screen — the rules are too
 * particular to copy, and there is no longer a second screen to copy them to.
 *
 * Every branch is a different kind of "no" and they are not interchangeable:
 *   - playing            -> refuse outright; converting under the transport is
 *                           not something a confirm can make safe
 *   - -> Drums           -> confirm ONLY if notes would be lost
 *   - -> Conductor       -> a Conductor already elsewhere is REFUSED, not
 *                           confirmed (the DSP would reject it anyway, so
 *                           asking would be a lie); otherwise always confirm,
 *                           since it clears FX/ARP/Auto
 *   - -> Keys            -> no prompt; nothing is lost
 *
 * Returns nothing: it raises confirm/info state and the caller redraws. The
 * conversion itself is deferred to tick via `pendingTrackConvert`.
 *
 * ⚠ The dialogs it raises MUST be drawn above Track Control and must gate its
 * input — see drawUI's pre-soundRender list and soundModeCovered(). */
export function requestTrackModeChange(t, target) {
    const cur = S.trackPadMode[t];
    if (target === cur) return;
    if (S.playing) {
        showMenuInfo('Stop playback', 'to change the', 'track type.');
        return;
    }
    if (target === PAD_MODE_DRUM) {
        let hasData = false;
        for (let c = 0; c < NUM_CLIPS; c++)
            if (S.clipNonEmpty[t][c]) { hasData = true; break; }
        if (hasData) {
            S.confirmConvertToDrum = true; S.confirmConvertToDrumSel = 1;
            S.confirmConvertTrack = t;
        } else {
            S.pendingTrackConvert = { t: t, toDrum: true };
        }
        return;
    }
    if (target === PAD_MODE_CONDUCT) {
        const existingCond = conductorTrackIdx();
        if (existingCond >= 0 && existingCond !== t) {
            showMenuInfo('Conductor exists', 'on T' + (existingCond + 1) + '.', 'Route it back first.');
        } else {
            S.confirmConvertToConduct = true; S.confirmConvertToConductSel = 1;
            S.confirmConvertTrack = t;
        }
        return;
    }
    /* Drums/Conductor -> Keys: no prompt; deferred to tick(). */
    if (S.conductorTrack === t) S.conductorTrack = -1;
    S.pendingTrackConvert = { t: t, toDrum: false };
}
