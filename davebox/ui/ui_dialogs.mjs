import { S, conductorTrackIdx } from './ui_state.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { STATE_VERSION, NOTE_KEYS, SCALE_DISPLAY,
         NUM_CLIPS, PAD_MODE_DRUM, PAD_MODE_CONDUCT } from './ui_constants.mjs';
/* ⭑ drawMenuList and menuLayoutDefaults are GONE from this file as of the
 * 2026-08-15 cohesion pass — every list here renders on the kit now (§5.0).
 * The header and the button family stay: those are the dialog chassis, which
 * is still the right home for a confirm. */
import {
    drawDialogButton, drawDialogYesNoRow, drawDialogOkButton, drawDialogButtonRow
} from '/data/UserData/schwung/shared/menu_layout.mjs';
import { formatItemValue, isDivider } from '/data/UserData/schwung/shared/menu_items.mjs';
/* The KIT chassis. ui_movy is pure — no imports, no state — so pulling it in
 * here cannot cycle. See docs/UI_LANGUAGE.md: a list of the app's own structure
 * renders on the kit; the host chassis is for dialogs. */
import { drawKitHeader, drawKitList, fitHdr, hdrWidth, hdrPrint,
         MV_BRAND_HDR_H, drawKitStackedList, drawKitBackdropDim, drawKitCrumbs,
         drawKitBigValue, drawKitHintRow, drawKitMarkHeader, MV_FOOTER_Y } from './ui_movy.mjs';
import { fontPrint4x5, fontWidth4x5, fit4x5 } from './ui_fonts_pp.mjs';
import {
    SNAPSHOT_CAP, snapshotLabel, saveState, loadSnapshotManifest, showActionPopup, showActionPopupFor,
    dropSnapshots, applySnapshotToLive, loadSelectedCurrentProject,
    hostIdentity, projectIdOfEntry, projectDisplayName
} from './ui_persistence.mjs';
import { invalidateLEDCache } from './ui_leds.mjs';
import {
    openTextEntry, isTextEntryActive, handleTextEntryMidi, drawTextEntry, tickTextEntry,
    closeTextEntry,
} from '/data/UserData/schwung/shared/text_entry.mjs';
import {
    Blue, Cyan, Green, Lime, VividYellow, OrangeRed, Red, NeonPink, ElectricViolet,
    MoveMainKnob, MoveMainButton, MoveBack,
} from '/data/UserData/schwung/shared/constants.mjs';
import { decodeDelta } from '/data/UserData/schwung/shared/input_filter.mjs';
/* A provisional uuid is the host's placeholder for a set whose folder does not
 * exist yet — never a save destination. Read by the lost-project save below. */
import { setUuidIsProvisional }
    from '/data/UserData/schwung/shared/session_state.mjs';

/* ⭑ The MCUFONT value line (drawBpmLine), its ×2 printer and the chevron
 * triangles lived here and were DELETED 2026-09-19 with their last callers:
 * the capture choosers and tap tempo now draw the kit's big numerals
 * (drawKitBigValue). Nothing in the tree prints MCUFONT any more. */

/* ---- Shared confirm-dialog chrome ----
 * The button primitive + Yes/No layout are the NORMATIVE dialog convention
 * (UI_LANGUAGE §5) and were consolidated here first (from ~8 copy-pasted
 * renderers), then hoisted into the host's shared menu_layout.mjs in P7 so
 * host screens draw the identical widget. These are thin delegates. */

const drawDlgBtn = drawDialogButton;

/* Canonical two-button Yes/No row: No left, Yes right, bottom of screen.
 * `sel` follows the universal davebox convention (0 = Yes, 1 = No). */
/* ── THE CONFIRM FAMILY ON THE KIT (2026-09-19) ──────────────────────────────
 * Every dialog here drew its title and body in the HOST's list font under the
 * host menu header, so a confirm raised from a rebuilt screen looked like it
 * came from a different app. They now take the kit's bar and the 4x5 face,
 * and keep the shared button widgets (a confirm's buttons ARE the dialog
 * chassis — see docs/UI_LANGUAGE.md §5).
 *
 * `dlgHeader` prints VERBATIM in the header face: titles are written in CAPS
 * like every other kit header, and the ONE thing that is not is the wordmark,
 * which that face has the lowercase glyphs for; `dlgLines` CENTRES and UPPERCASES, because the 4x5 face has no
 * lowercase glyphs at all. Body lines are centred as a block between the
 * header and whatever the caller puts at `bottom` (its first button row). */
function dlgHeader(title) { drawKitMarkHeader(title); }
function dlgLines(lines, bottom) {
    /* WRAP BY MEASURED WIDTH, never by a guessed line break: the 4x5 face is
     * proportional, and a hand-broken line that fits one string overflows the
     * next one the same code draws (CHANGE TO DRUMS? lost "...ED." that way). */
    const out = [];
    for (const raw of lines) {
        if (raw === undefined || raw === null || raw === '') continue;
        let cur = '';
        for (const word of String(raw).toUpperCase().split(' ')) {
            const next = cur ? cur + ' ' + word : word;
            if (cur && fontWidth4x5(next) > 124) { out.push(cur); cur = word; }
            else cur = next;
        }
        if (cur) out.push(cur);
    }
    if (!out.length) return;
    const pitch = 10, bot = bottom == null ? 44 : bottom;
    const top = 7 + Math.floor((bot - 7 - (out.length * pitch - (pitch - 5))) / 2);
    for (let i = 0; i < out.length; i++) {
        const t = fit4x5(out[i], 124);
        fontPrint4x5(Math.floor((128 - fontWidth4x5(t)) / 2), top + i * pitch, t, 1);
    }
}

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

/* On the kit since 2026-09-19 — it wore the MCUFONT dialog face, the last
 * screen to do so alongside performance mode. The jog turns the tempo here,
 * so the value keeps the arrows. */
function drawTapTempoScreen() {
    clear_screen();
    drawKitHeader('Tap tempo');
    drawKitBigValue(14, Math.round(S.tapTempoBpm || 0), 'BPM', '', '', true);
    const t = fit4x5('TAP ANY PAD', 124);
    fontPrint4x5(Math.floor((128 - fontWidth4x5(t)) / 2), 40, t, 1);
    drawKitHintRow(MV_FOOTER_Y, [['jog', 'tempo'], ['clk', 'set']]);
}

function drawClearSessionConfirm() {
    clear_screen();
    dlgHeader('CLEAR SESSION');
    dlgLines(['This will clear the entire', 'project and cannot be undone.']);
    drawYesNoRow(S.confirmClearSel);
}

function drawSaveStateConfirm() {
    clear_screen();
    dlgHeader('SAVE STATE');
    dlgLines(['Save this session?', S.confirmSaveCount + ' of ' + SNAPSHOT_CAP + ' saved']);
    drawYesNoRow(S.confirmSaveSel);
}

export function drawConvertToDrumConfirm() {
    clear_screen();
    dlgHeader('CONVERT');
    dlgLines(['Warning:', 'Existing notes may be lost.', 'Proceed?']);
    drawYesNoRow(S.confirmConvertToDrumSel);
}

export function drawConvertToConductConfirm() {
    clear_screen();
    dlgHeader('CONVERT');
    dlgLines(['Make Conductor?', 'Clears FX/ARP/Auto.', 'Keeps notes.']);
    drawYesNoRow(S.confirmConvertToConductSel);
}

/* Generic single-button INFO dialog. Renders up to 4 lines from S.menuInfoLines
 * (empty = closed). Mirrors drawConvertToConductConfirm's layout with one OK
 * button. Used for "Conductor exists", "Stop playback to change type", etc. */
export function drawMenuInfo() {
    clear_screen();
    dlgHeader('INFO');
    dlgLines((S.menuInfoLines || []).slice(0, 4), 46);
    drawOkButton(46);
}

function drawExportConfirm() {
    clear_screen();
    dlgHeader('EXPORT');
    if (S.confirmExportCondPhase) {
        dlgLines(['Apply Conductor?'], 47);
        drawDialogButtonRow(47, 11, [
            { label: 'Yes',    sel: S.confirmExportCondSel === 0 },
            { label: 'No',     sel: S.confirmExportCondSel === 1 },
            { label: 'Cancel', sel: S.confirmExportCondSel === 2 }]);
        return;
    }
    dlgLines(['Export this set as', 'an Ableton bundle?', '(transport stopped)']);
    drawYesNoRow(S.confirmExportSel);
}

/* Persistent post-export confirmation: shows the full device path, dismissed
 * with OK (jog-click or Back). Path is wrapped to fit the OLED. */
function drawExportDoneDialog() {
    clear_screen();
    dlgHeader(S.exportDoneMissing > 0 ? ('EXPORTED -' + S.exportDoneMissing) : 'EXPORTED TO');
    /* ⚠ MEASURE, never estimate. This wrapped at a fixed 21 characters on a
     * PROPORTIONAL font, so a path of wide glyphs ran past the right edge and a
     * path of narrow ones wasted a third of the line. Same family as the two
     * off-screen strings the 2026-08-15 audit found. */
    const path = S.exportDonePath || '';
    const LIMIT = 124;
    let y = 14, lines = 0, i = 0;
    while (i < path.length && lines < 4) {
        let n = 1;
        while (i + n < path.length && text_width(path.slice(i, i + n + 1)) <= LIMIT) n++;
        print(2, y, path.slice(i, i + n), 1);   /* the host face: a PATH keeps its case */
        i += n; y += 9; lines++;
    }
    drawOkButton(52);
}

/* ⭑ The global menu's enum picker.
 *
 * Same law as sound mode's: a row with more than two options opens a list
 * rather than being ticked through behind `[brackets]`. This menu has the
 * longest enums in the app — Scale is 14, MIDI channel 17 — so it is the worst
 * case of the old grammar, and it is where a picker pays most.
 *
 * ⚠ It does NOT reuse sound mode's `openEnumPicker`: that one renders through
 * `renderInChain`, which draws a sound-mode screen as its backdrop. Here the
 * backdrop is this menu. Same law, same look, different chain — sharing the
 * renderer would mean sharing the wrong root.
 *
 * The global menu is FLAT (nothing pushes `globalMenuStack`), so this picker is
 * the only thing ever layered over it and the stack is always one box deep. */
export function openGlobalEnumPick(item) {
    const opts = item.options || [];
    const cur = opts.indexOf(item.value != null ? item.value : item.get && item.get());
    S.globalEnumPick = {
        label: item.label || '',
        options: opts.map(v => String(item.format ? item.format(v) : v)),
        raw: opts,
        sel: cur < 0 ? 0 : cur,
        item,
    };
    S.screenDirty = true;
}
export function globalEnumPickable(item) {
    return !!(item && item.options && item.options.length > 2);
}
export function closeGlobalEnumPick(commit) {
    const p = S.globalEnumPick;
    if (!p) return;
    /* ⚠ Back ABANDONS, the same as sound mode's picker: committing on the way
     * out turns an accidental Back into a silent edit. */
    if (commit && p.item && p.item.set) p.item.set(p.raw[p.sel]);
    S.globalEnumPick = null;
    S.screenDirty = true;
}
function drawGlobalEnumPick() {
    /* The menu itself is the backdrop — knocked back so the box reads as being
     * over it — then one box, then the path. No track head (Josh): this menu is
     * global, so a track crumb would be actively wrong. */
    drawGlobalMenuList();
    drawKitBackdropDim();
    drawKitStackedList(1, S.globalEnumPick.options, S.globalEnumPick.sel, {});
    drawKitCrumbs(['Global', S.globalEnumPick.label]);
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
    if (S.globalEnumPick) { drawGlobalEnumPick(); return; }
    drawGlobalMenuList();
}

/* The menu's own list body, split out so the enum picker can draw it as its
 * backdrop without re-running the dialog dispatch above. */
function drawGlobalMenuList() {
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
/* Confirm before leaving the session. Same chassis as the other Yes/No modals;
 * the copy names what the user is about to do in their own terms (a session is
 * parked or left — never "overtake" or a host word). */
export function drawExitConfirm() {
    clear_screen();
    if (S.confirmExit === 'quit') {
        dlgHeader('QUIT dAVEBOx?');
        dlgLines(['Save and leave the session?', 'The device returns to Move.']);
    } else {
        dlgHeader('SUSPEND SESSION?');
        /* the name lives in the HEADER: the 4x5 face has no lowercase, so a
         * wordmark in the body can only come out as DAVEBOX */
        dlgLines(['Save and park the session', 'in the background?']);
    }
    drawYesNoRow(S.confirmExitSel);
}

/* Item 16: the instrument TYPE change is destructive — say what goes. */
export function drawTypeChangeConfirm() {
    clear_screen();
    const c = S.confirmTypeChange;
    dlgHeader('CHANGE TO ' + (c ? String(c.typeName).toUpperCase() : '') + '?');
    const parts = [];
    if (c && c.macros) parts.push(c.macros + (c.macros === 1 ? ' macro' : ' macros'));
    if (c && c.lanes)  parts.push(c.lanes + (c.lanes === 1 ? ' lane' : ' lanes'));
    dlgLines([parts.join(', '), 'of automation will be cleared.']);
    drawYesNoRow(S.confirmTypeChangeSel);
}

export function drawModuleSwapConfirm() {
    clear_screen();
    const c = S.confirmModuleChange;
    /* Remove and swap are the same operation with a different destination, so
     * they are the same dialog with a different verb. */
    dlgHeader(c && c.removing ? 'REMOVE MODULE?' : 'SWAP TO ' + (c ? String(c.name).toUpperCase() : '') + '?');
    const parts = [];
    if (c && c.macros) parts.push(c.macros + (c.macros === 1 ? ' macro' : ' macros'));
    if (c && c.lanes)  parts.push(c.lanes + (c.lanes === 1 ? ' lane' : ' lanes'));
    dlgLines([parts.join(', '), 'of automation will be cleared.']);
    drawYesNoRow(S.confirmModuleChangeSel);
}

export function drawStateWipeConfirm() {
    clear_screen();
    dlgHeader('STATE MISMATCH');
    dlgLines(['This session is from a', 'different version. Erase it?']);
    drawYesNoRow(S.confirmStateWipeSel);
}

/* ── PROJECT DID NOT OPEN ────────────────────────────────────────────────────
 *
 * Move was pointed at a project and opened something else — typically an empty
 * set of its own. The host notices by comparing what Move logged loading with
 * the project it resolved, and publishes a placeholder identity instead of the
 * project (src/host/shadow_loaded_set_policy.h); readActiveSet reports that as
 * `unopenedIndex`.
 *
 * From that moment NOTHING may be saved: whatever dAVEBOx holds is not what
 * Move holds, and the project's own files are the one place a save must not
 * land. Rather than add a second family of save gates, it re-enters the
 * select-before-load state, whose gates are already every save path in JS
 * (saveState, writeSidecar, the deferred autosave, snapshots, Clear Session)
 * and in the DSP (seq8_save_state — destroy_instance included — state_full,
 * state_chunk_). The next real load clears it, exactly as a selection does.
 *
 * Dialog chassis (UI_LANGUAGE §5.0: a confirm/info screen stays a dialog). Copy
 * in the user's terms — a project did not open; nothing about sets or hosts. */
/* ⭑ The 34 s verdict window is GONE: waiting is a published state now, so
 * there is nothing to outlast and nothing to miss after it expires. */

export function checkProjectOpened() {
    const id = hostIdentity();
    /* A save-then-lock is already in flight (see lockAfterProjectLost): the
     * session is finishing its last write and the lock fires on the next tick.
     * Re-entering here would raise the verdict NOW, i.e. set awaiting_select
     * before `save=1` reaches the DSP, and seq8_save_state refuses under that
     * flag — the write the whole detour exists for would be dropped. */
    if (S.pendingProjectLostLock) return;
    const f = S.projectOpenFailed;
    if (f) {
        /* A late real answer (Move opened it after all): drop the screen and
         * load it the way a selection would. Not while a Retry is already
         * tearing the session down. */
        if (id.state === 'open' && id.uuid && !f.retrying) {
            S.projectOpenFailed = null;
            S.forceRelaunchNextLoad = false;   /* Move did open it: nothing to force */
            S.currentSetUuid = id.uuid;
            S.currentSetName = projectDisplayName(id.uuid);
            S.currentSetFolder = id.name;
            loadSelectedCurrentProject();
            S.screenDirty = true;
        }
        return;
    }
    /* SELECT-BEFORE-LOAD outranks the verdict. While the session is still
     * awaiting a pick nothing of ours is loaded, every save path is already
     * refused, and no project has been chosen for the verdict to be ABOUT — so
     * the only thing it can still do is destroy the picker.
     *
     * Device, 2026-09-15, four identical tools-menu launches: ~3 s in, the host
     * published a verdict about the project the LAST session had been in, which
     * nobody had asked for. It raised this screen, cleared the pending picker,
     * and ~1 s later the late-answer branch above loaded that project with no
     * pick. Every launch came up on the old project, too fast to read. */
    if (S.awaitingProjectSelect) return;

    /* ⭑ The verdict is a STATE now, not a name to decode. `none` means Move is
     * not holding a project, and `reason` says which sentence to show. Under
     * "retry only" (Josh, 2026-09-15) none of these ever becomes an open
     * project: the dialog offers Retry, or Back to the picker, and nothing
     * else. `pending` is NOT a failure — it is the wait, and it must not raise
     * anything, which is the whole reason the host publishes it. */
    if (id.state !== 'none') return;

    const reason = id.reason || 'unknown';

    /* ⭐ A PROJECT LOST UNDERNEATH A LIVE SESSION SAVES TO WHERE IT CAME FROM,
     * THEN LOCKS (Josh, 2026-09-20, the save/load design pass, ruling ②).
     *
     * If a project is loaded when the verdict arrives, everything played since
     * the last autosave lives in DSP memory and NOWHERE else — no journal, no
     * second copy. Locking immediately (what this used to do, and what
     * enterProjectOpenFailed below still does) throws it away silently.
     *
     * The destination is not a guess. `S.currentSetUuid` is assigned in exactly
     * three places and every one of them requires `state === 'open'` — a
     * Move-CONFIRMED identity — so a non-empty value here names the project
     * this session was loaded under, and that project's own folder is a
     * legitimate place for its own work. The DSP does not even take our word
     * for it: seq8_save_state writes to `inst->state_uuid`, set by the load.
     * (Ruled out, 2026-09-20: doing nothing, and holding the work for the next
     * pick — which would land one project's work inside another.)
     *
     * ⚠ The ORDER is the whole trick. `awaiting_select` is what refuses saves,
     * in JS and in the DSP alike, so it cannot be set until the save has gone.
     * saveState() writes the sidecar synchronously and arms pendingSuspendSave,
     * which ui_tick drains at the END of this same tick as `save=1`; the lock
     * fires from a sibling branch one tick later, the same shape
     * pendingExitAfterSave uses. Until then the guard at the top of this
     * function keeps the verdict from being raised early. */
    if (S.currentSetUuid && !setUuidIsProvisional(S.currentSetUuid)) {
        S.pendingProjectLostLock = { pad: id.index, name: id.name, reason: reason };
        console.log('PROJECT LOST (' + reason + '): saving this session into ' +
                    S.currentSetUuid + ' before locking');
        saveState();
        S.screenDirty = true;
        return;
    }

    enterProjectOpenFailed(id.index, id.name, reason);
}

/* The lock, shared by both ways in: straight from the verdict when no project
 * was loaded, and one tick after the last save when one was. It is its own
 * function so there is ONE lock rather than two that can drift — what it
 * clears is what every save path reads. */
function enterProjectOpenFailed(pad, name, reason) {
    S.projectOpenFailed = {
        pad: pad, name: name, sel: 0, retrying: false,
        /* `unknown` is a different sentence: Move did not say what it opened,
         * rather than saying it opened something else. */
        reason: reason
    };
    /* No project is open: nothing downstream may name one — not even the
     * project the session was in before, and not the one that failed. */
    S.currentSetUuid = '';
    S.currentSetName = '';
    S.currentSetFolder = '';
    S.awaitingProjectSelect = true;
    host_module_set_param('awaiting_select', '1');
    /* Anything already queued toward a save or a load is void now. */
    S.pendingSuspendSave = false;
    S.pendingSetLoad = false;
    S.saveNowOnce = false;
    S.pendingSnapshotCopy = null;
    S.projectPadPicker = null;
    S.pendingOpenProjectPicker = false;
    console.log('NO PROJECT OPEN (' + reason + '): pad ' + pad +
                (name ? ' (' + name + ')' : '') + ' \u2014 saves refused');
    S.screenDirty = true;
}

/* Drained by ui_tick one tick AFTER the `save=1` that saveState armed, so the
 * DSP has had a whole buffer to write the blob out before saving is refused.
 * What this session had is now on disk under the project it came from; from
 * here the session is locked and the picker is the only way forward. */
export function lockAfterProjectLost() {
    const l = S.pendingProjectLostLock;
    S.pendingProjectLostLock = null;
    if (!l) return;
    enterProjectOpenFailed(l.pad, l.name, l.reason);
}


export function drawProjectOpenFailed() {
    const f = S.projectOpenFailed;
    const name = f && f.name ? f.name : 'Project ' + ((f ? f.pad : 0) + 1);
    clear_screen();
    drawKitHeader('Project did not open');
    const line = (y, t) => {
        const s4 = fit4x5(String(t).toUpperCase(), 124);
        fontPrint4x5(Math.floor((128 - fontWidth4x5(s4)) / 2), y, s4, 1);
    };
    line(13, name);
    if (f && f.retrying) { line(30, 'Opening again...'); return; }
    line(26, 'Move could not load it.');
    line(35, 'Nothing was saved.');
    drawDialogButtonRow(46, 13, [{ label: 'Retry', sel: !f || f.sel === 0 },
                                 { label: 'Back',  sel: !!f && f.sel === 1 }], { x0: 6, x1: 122 });
}

/* Fully modal: every internal message lands here while the screen is up.
 * Jog turns move between the buttons, the jog click commits, Back = Back. */
export function projectOpenFailedMidi(data) {
    const f = S.projectOpenFailed;
    if (!f) return false;
    const status = data[0] & 0xF0, d1 = data[1] | 0, d2 = data[2] | 0;
    if (f.retrying || status !== 0xB0) return true;
    if (d1 === MoveMainKnob) {
        if (decodeDelta(d2) !== 0) { f.sel = f.sel === 0 ? 1 : 0; S.screenDirty = true; }
        return true;
    }
    const click = (d1 === MoveMainButton && d2 === 127);
    const back  = (d1 === MoveBack && d2 === 127);
    if (!click && !back) return true;
    /* Retry on a song that cannot be read would relaunch into nothing — and
     * project-cmd `switch` refuses it, so this screen would sit locked until
     * the session went down. Read the list first; if the pad's song is
     * unreadable, go to the picker with the reason instead. */
    let _retryBroken = null;
    if (click && f.sel === 0) {
        const _l = _pppRunList();
        const _pr = _l && _l.projects.find(x => x.index === f.pad);
        _retryBroken = (_pr && _pr.broken) || null;
    }
    if (click && f.sel === 0 && !_retryBroken) {
        /* Retry: relaunch into the same pad through the existing switch path
         * (project-cmd `switch`, fired from the tick). The screen stays up,
         * locked, until the session goes down. */
        f.retrying = true;
        /* RE-ISSUE the same request. The picker is gone and the verdict record
         * carries no uuid — only the pad and the name the host reported — so
         * the request we made is the only thing that still knows what we asked
         * for. If we asked for nothing (the verdict arrived about a set nobody
         * requested), we write nothing: a Retry cannot invent a request. */
        /* RELAUNCH route (pendingProjectRelaunch below), so it must go in the
         * file that survives the restart. */
        if (S.requestedSet) _pppWriteRequest(S.requestedSet, RELAUNCH_REQUEST);
        S.pendingProjectRelaunch = f.pad;
    } else {
        /* Back to the project picker. Still awaiting a selection, so the picker
         * is the select-before-load one: nothing loads until a pad is chosen.
         * ⚠ Whatever is chosen must RELAUNCH Move (S9): Move is on a default
         * set of its own, so neither the select actuator nor an in-place load
         * of the "current" pad opens anything — the pick loaded nothing and
         * the verdict came straight back. And stop watching for the verdict:
         * active_set.txt still names the same failure, so the watch would
         * re-raise the screen over the picker the user was sent to. */
        S.forceRelaunchNextLoad = true;
        S.projectOpenFailed = null;
        S.projectPadPicker = null;
        openProjectPadPicker();
        if (_retryBroken) _pppRefuseUnreadable(_retryBroken);
    }
    S.screenDirty = true;
    return true;
}

export function drawRecordBlockedDialog() {
    clear_screen();
    dlgHeader('REC UNAVAILABLE');
    dlgLines(['Set clip Dir to Fwd,', 'or bake it first.']);
    drawDialogButtonRow(46, 13, [{ label: 'OK',       sel: S.recordBlockedDialogSel === 0 },
                                 { label: 'Bake Now', sel: S.recordBlockedDialogSel === 1 }],
                        { x0: 6, x1: 122 });
}

/* Shown when Tap Tempo is invoked while Clock Follow = Move (tempo is Move's, so
 * there's nothing to tap). Single OK button; dismissed by jog click or Back. */
export function drawBpmMoveInfo() {
    clear_screen();
    dlgHeader('TEMPO');
    dlgLines(['Tempo follows Move', 'while clock-linked.']);
    drawOkButton(52);
}

/* Destructive Lgto confirm dialog. Right-turn of CLIP K8 / DRUM LANE K8
 * opens this. OK applies; CANCEL aborts. Undoable. */
export function drawLgtoConfirm() {
    clear_screen();
    dlgHeader(S.confirmLgtoIsDrum ? 'LEGATO (LANE)' : 'LEGATO (CLIP)');
    dlgLines(['Extend notes to fill gaps.', 'Destructive.']);
    drawDialogButtonRow(46, 13, [{ label: 'OK',     sel: S.confirmLgtoSel === 0 },
                                 { label: 'Cancel', sel: S.confirmLgtoSel === 1 }], { x0: 6, x1: 122 });
}

/* MACROS bank, Delete + jog click: clear every macro ASSIGNMENT on the track.
 * Josh, 2026-09-13, asked for the confirmation explicitly — eight assignments are
 * real work to rebuild, and nothing else on that bank is destructive. */
export function drawMacroClearConfirm() {
    clear_screen();
    dlgHeader('CLEAR MACROS');
    dlgLines(['Unassign all 8 macros', 'on this track.']);
    drawDialogButtonRow(46, 13, [{ label: 'OK',     sel: S.confirmMacroClearSel === 0 },
                                 { label: 'Cancel', sel: S.confirmMacroClearSel === 1 }], { x0: 6, x1: 122 });
}

export function drawBakeConfirm() {
    clear_screen();
    if (S.confirmBakeWrapPhase) {
        dlgHeader('WRAP TAILS?');
        dlgLines(['Wrap delay echoes past', 'clip end back to the start?'], 50);
        drawDialogButtonRow(50, 13, [
            { label: 'Yes',    sel: S.confirmBakeWrapSel === 0 },
            { label: 'No',     sel: S.confirmBakeWrapSel === 1 },
            { label: 'Cancel', sel: S.confirmBakeWrapSel === 2 }]);
    } else if (S.confirmBakeIsMultiLoop) {
        dlgHeader('BAKE FX?');
        dlgLines(['Bake the FX chain to the', 'clip - how many loops?'], 44);
        drawDialogButtonRow(44, 12, [
            { label: '1x',     sel: S.confirmBakeSel === 1 },
            { label: '2x',     sel: S.confirmBakeSel === 2 },
            { label: '4x',     sel: S.confirmBakeSel === 3 },
            { label: 'Cancel', sel: S.confirmBakeSel === 0 }]);
    } else if (!S.confirmBakeIsDrum) {
        dlgHeader('BAKE FX?');
        dlgLines(['Apply effects chain to clip', 'notes and clear the settings.']);
        drawYesNoRow(S.confirmBakeSel);
    } else if (S.confirmBakeDrumLoopOpen) {
        /* Step 2: loop count selection */
        const modeLabel = S.confirmBakeDrumMode === 1 ? 'Lane' : 'Clip';
        dlgHeader('BAKE DRUMS?');
        dlgLines([modeLabel + ' - loop count:'], 33);
        drawDialogButtonRow(33, 11, [{ label: 'Cancel', sel: S.confirmBakeDrumLoopSel === 0 }],
                            { x0: 14, x1: 114 });
        drawDialogButtonRow(47, 11, [
            { label: '1x', sel: S.confirmBakeDrumLoopSel === 1 },
            { label: '2x', sel: S.confirmBakeDrumLoopSel === 2 },
            { label: '4x', sel: S.confirmBakeDrumLoopSel === 3 }]);
    } else {
        dlgHeader('BAKE DRUMS?');
        dlgLines(['Bake FX to clip', '(all lanes) or lane?'], 50);
        /* 3 buttons: Clip(0) | Lane(1) | Cancel(2, default) */
        drawDialogButtonRow(50, 13, [
            { label: 'Clip',   sel: S.confirmBakeSel === 0 },
            { label: 'Lane',   sel: S.confirmBakeSel === 1 },
            { label: 'Cancel', sel: S.confirmBakeSel === 2 }]);
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

/* ⚠ PICKER — opted OUT of the 2026-08-27 menu type rule at every drawKitList
 * call below (`hostLabels: false`). Josh: "Do not make any changes to canvas
 * kit, pickers or anything like that." Its labels keep the small movy font. */
export function drawSnapshotPicker() {
    clear_screen();
    const p = S.snapshotPicker;
    if (!p) return;

    if (p.confirm) {
        const c = p.confirm;
        if (c.kind === 'wipe') {
            dlgHeader('STATES UPDATED');
            dlgLines(['Delete ' + c.wipeIds.length + ' snapshot(s)', 'from an older version?']);
        } else if (c.kind === 'load') {
            const s = snapById(p, c.targetId);
            dlgHeader('LOAD STATE');
            dlgLines(['Load ' + truncLabel(s ? s.label : '', 15), 'Unsaved changes will be lost.']);
        } else {
            const s = snapById(p, c.targetId);
            dlgHeader('OVERWRITE');
            dlgLines(['Replace', truncLabel(s ? s.label : '', 19) + '?']);
        }
        drawSnapYesNo(c.sel);
        return;
    }

    /* A list of the app's own state, so it renders on the kit — this was the
     * last hand-rolled list in the tree, with its own windowing, its own inset
     * highlight and ^/v glyphs where every other list has a scrollbar. Snapshot
     * NAMES come from the user, so they stay on the label font (no hdr) and get
     * drawKitList's measured truncation instead of a guessed 20-char cut. */
    drawKitHeader(p.mode === 'overwrite' ? 'OVERWRITE WHICH?' : 'LOAD STATE', false);
    drawKitList(p.snaps.map(function(s) {
        return { label: (s.label || '') +
                 ((p.mode === 'load' && s.sv !== STATE_VERSION) ? ' (old)' : '') };
    }), p.sel, { emptyMsg: 'No states', hostLabels: false });
}

export function drawBakeSceneConfirm() {
    clear_screen();
    dlgHeader('BAKE SCENE?');
    const mH = 11;
    if (S.confirmBakeSceneCondPhase) {
        dlgLines(['Apply Conductor?'], 47);
        drawDialogButtonRow(47, mH, [
            { label: 'Yes',    sel: S.confirmBakeSceneCondSel === 0 },
            { label: 'No',     sel: S.confirmBakeSceneCondSel === 1 },
            { label: 'Cancel', sel: S.confirmBakeSceneCondSel === 2 }]);
    } else if (S.confirmBakeSceneWrapPhase) {
        dlgLines(['Wrap tails?'], 47);
        drawDialogButtonRow(47, mH, [
            { label: 'Yes',    sel: S.confirmBakeSceneWrapSel === 0 },
            { label: 'No',     sel: S.confirmBakeSceneWrapSel === 1 },
            { label: 'Cancel', sel: S.confirmBakeSceneWrapSel === 2 }]);
    } else {
        dlgLines(['Loop count:'], 33);
        drawDialogButtonRow(33, mH, [{ label: 'Cancel', sel: S.confirmBakeSceneSel === 0 }],
                            { x0: 14, x1: 114 });
        drawDialogButtonRow(47, mH, [
            { label: '1x', sel: S.confirmBakeSceneSel === 1 },
            { label: '2x', sel: S.confirmBakeSceneSel === 2 },
            { label: '4x', sel: S.confirmBakeSceneSel === 3 }]);
    }
}

export function drawXposeConfirm() {
    clear_screen();
    dlgHeader('TRANSPOSE CLIPS?');
    const tgt = NOTE_KEYS[S.confirmXposeKey] + ' ' + (SCALE_DISPLAY[S.confirmXposeScale] || '?');
    dlgLines(['To ' + tgt, 'All melodic clips']);
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
/* The launcher's queued-work file. project-cmd appends an mv here when it
 * decides a rename touches a set MOVE still has open; its presence is the only
 * way this side can tell "deferred" from "failed". */
const RELAUNCH_PATCH = '/data/UserData/dbx-host/relaunch_patch.sh';

/* ⭑⭑ DID THE SCRIPT DEFER? — the one question this side must not answer twice.
 *
 * project-cmd decides for ITSELF which project is open, deliberately: one
 * decider living in JS is the shape that caused the loss the identity work
 * exists to fix (see do_delete's `_open_del`). When it decides the target is
 * open it QUEUES the mv or rm for the launcher and restarts Move in place —
 * so nothing has changed on disk when we look, and the project is still there.
 *
 * At the boot picker the two halves disagree by construction: dAVEBOx has
 * nothing loaded, while MOVE is still holding the set it had. Guessing again
 * from a re-listing is what made a deferred rename report RENAME FAILED, and a
 * deferred delete report PROJECT DELETED — both wrong, and both with a tail
 * where the real thing happened silently at the next launch.
 *
 * So compare the queue around the command instead of re-deciding. A CHANGE is
 * the script's own answer. Comparing content rather than mere existence
 * matters: a patch left by earlier queued work would otherwise read as "this
 * command deferred". */
function _pppQueueSnapshot() {
    try { return String(host_read_file(RELAUNCH_PATCH) || ''); } catch (e) { return ''; }
}
/* ⭐ THE REQUEST. Written at the moment of the pick, consumed and unlinked by
 * the host the instant it arms (src/host/shadow_set_pages.c). Format is fixed
 * by that reader: `uuid \n index \n name`.
 *
 * Without it the host has no way to tell "dAVEBOx asked for this project and
 * got it" from "a set was already open underneath" — it takes whatever Move
 * loads as the answer, and the PROJECT DID NOT OPEN verdict, which exists for
 * exactly the case where we asked and did not get it, can never be produced. */
const INTENDED_SET = '/data/UserData/dbx-host/intended_set.txt';
/* ⭐⭐ THE SAME RECORD, FOR THE NEXT SESSION. A request does NOT survive a Move
 * relaunch: the still-live shim consumes intended_set.txt within ~1.4 s of the
 * pick, about a second before the relaunch tears that shim down, so the new
 * session starts with nothing to confirm against and can never answer "did
 * Move open what we asked for". Measured on device 2026-09-21 — it is why a
 * project created this session bounced back to the picker on its FIRST load
 * while every later load worked.
 *
 * ⚠ The relaunch route therefore writes HERE instead. No shim reads this path;
 * launch.sh installs it as the next session's intended_set.txt while Move is
 * down, appending the counter it is measured against. Writing BOTH would be
 * pointless (the dying shim would still eat one) and would give two records a
 * chance to disagree — the shape deliberately removed on 2026-09-16. */
const RELAUNCH_REQUEST = '/data/UserData/dbx-host/relaunch_request.txt';

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
    /* ⭑⭑ "CURRENT" MEANS CONFIRMED OPEN, AND NOTHING ELSE.
     *
     * This used to fall back to Settings.json's index whenever the boot record
     * named nothing we recognised. That index is a GUESS — it says which pad
     * Move is sitting on, never which project Move actually opened — and it fed
     * the one shortcut in this file that loads without making a request
     * (`k === p.current` in _pppLoad). So tapping the "current" pad could load
     * on an unconfirmed identity, which is exactly what "retry only" forbids
     * (Josh, 2026-09-15).
     *
     * So: current comes from the host's CONFIRMED identity or it is -1. Under
     * -1 every pick is a new request, which is the slower path and the only
     * honest one. */
    p.current = -1;
    const _id = hostIdentity();
    /* ⚠ Match on the PROJECT, not on the library entry Move named. `projects`
     * is the project store; `_id.uuid` is the entry Move opened and logged.
     * They are the same string while the library holds one slot per project and
     * names it after that project — and the moment it holds two fixed slots
     * instead, matching the entry would leave `current` at -1 forever, so the
     * picker would never mark the open project and every pick would be treated
     * as a switch. Identical behaviour today; correct behaviour after. */
    if (_id.state === 'open' && _id.projectId) {
        for (let i = 0; i < data.projects.length; i++) {
            const pr = data.projects[i];
            if (pr.uuid === _id.projectId && pr.index !== null && pr.index !== undefined) {
                p.current = pr.index;
                break;
            }
        }
    }
}

/* ⭐ A LIST THAT CANNOT BE READ FAILS CLOSED (Josh, 2026-09-20,
 * the save/load design pass, ruling ③). If the picker cannot open at session start — no host_system_cmd,
 * or project-cmd gave us no list — the user gets a card that says so, with
 * Retry and Quit. Nothing loads on its own.
 *
 * ⚠ What this REPLACES, and why it had to go. This used to fail OPEN: it called
 * loadSelectedCurrentProject() and loaded whatever project the session booted
 * into, on the reasoning that a degraded session beats an unusable one. That
 * made it the last place in the module where a project opened WITHOUT a pick —
 * the exact thing select-before-load exists to prevent — and it did so at the
 * one moment we know least: the list we would have checked it against is the
 * thing that just failed to read. A user who launched meaning to choose would
 * land in a project already live, with a popup that has gone by the time they
 * look up, and every keystroke from then on recorded into it.
 *
 * ⭑ Only while AWAITING. Mid-session the picker is a menu that failed to open;
 * the caller shows the popup and the session carries on. There is no dead end
 * to rescue anyone from, and a modal card over working music would be worse
 * than the thing it reports. */
function _pppFailClosed(why) {
    if (!S.awaitingProjectSelect) return;
    if (S.projectListFailed) return;        /* already on the card */
    console.log('projectPadPicker: ' + why + ' — NO PROJECT LIST (nothing loaded)');
    S.projectListFailed = { sel: 0, why: why };
    S.projectPadPicker = null;
    S.pendingOpenProjectPicker = false;
    S.screenDirty = true;
}

/* NO PROJECT LIST. Sibling of PROJECT DID NOT OPEN and deliberately the same
 * chassis: both are "dAVEBOx cannot go on, here is why, here is what you can
 * do". Copy in the user's terms — a list of projects, not projects.json or a
 * shell that would not run. */
export function drawProjectListFailed() {
    const f = S.projectListFailed;
    clear_screen();
    drawKitHeader('No project list');
    const line = (y, t) => {
        const s4 = fit4x5(String(t).toUpperCase(), 124);
        fontPrint4x5(Math.floor((128 - fontWidth4x5(s4)) / 2), y, s4, 1);
    };
    if (f && f.retrying) { line(26, 'Looking again...'); return; }
    line(20, 'Your projects could not');
    line(29, 'be read. Nothing loaded.');
    drawDialogButtonRow(46, 13, [{ label: 'Retry', sel: !f || f.sel === 0 },
                                 { label: 'Quit',  sel: !!f && f.sel === 1 }], { x0: 6, x1: 122 });
}

/* Fully modal, same contract as projectOpenFailedMidi: every internal message
 * lands here while the card is up, the jog moves between the two buttons and
 * the click commits. Back is deliberately NOT a third answer — there is nowhere
 * to go back TO, and a Back that silently did nothing would read as a freeze. */
export function projectListFailedMidi(data) {
    const f = S.projectListFailed;
    if (!f) return false;
    const status = data[0] & 0xF0, d1 = data[1] | 0, d2 = data[2] | 0;
    if (f.retrying || status !== 0xB0) return true;
    if (d1 === MoveMainKnob) {
        if (decodeDelta(d2) !== 0) { f.sel = f.sel === 0 ? 1 : 0; S.screenDirty = true; }
        return true;
    }
    if (!(d1 === MoveMainButton && d2 === 127)) return true;
    if (f.sel === 0) {
        /* Retry: run the list again. Clearing the card first is what lets the
         * open either succeed (picker up) or fail into a FRESH card — with the
         * card still set, _pppFailClosed would stand down and the retry would
         * look like it did nothing. */
        S.projectListFailed = null;
        openProjectPadPicker();
        /* Still no list: say so again rather than leaving a blank screen. */
        if (!S.projectPadPicker) _pppFailClosed('retry found no list');
    } else {
        /* Quit. This is exitSessionNow's tail (ui_input_cc.mjs) and nothing
         * else, because its other two legs are provably no-ops here: the
         * transport is locked while awaiting a selection, so there is nothing
         * to stop, and saveState() returns immediately under the same flag,
         * so there is nothing to save. Calling it directly would import
         * ui_input_cc, which already imports this file. */
        S.projectListFailed = null;
        S.pendingExitAfterSave = true;
    }
    S.screenDirty = true;
    return true;
}

function _openProjectPadPicker_impl() {
    /* Projects are a davebox-host concept (project-cmd.sh, projects.json live in
     * the SA install), and this is that host — the picker is always legitimate
     * here. _pppFailClosed() remains the answer for a genuine data failure below;
     * it just no longer answers "which host is this". */
    /* Toggle — EXCEPT while awaiting a selection, where closing the picker
     * leaves nothing loaded, nothing on screen but LOADING, and no way out.
     * Belt to the step-button gate: this is reachable from the menu too. */
    if (S.projectPadPicker) {
        if (!S.awaitingProjectSelect) closeProjectPadPicker();
        return;
    }
    const data = _pppRunList();
    if (!data) { showActionPopup('NO PROJECT', 'LIST'); _pppFailClosed('project-cmd gave no list'); return; }
    const p = { projects: [], byIndex: {}, current: -1,
                touchedIdx: -1, copySrcIdx: -1, deleteIdx: -1,
                /* jog-menu overlays (one open at a time; see the tap impl) */
                menu: null, colorPick: null, confirmNew: null, renameActive: false,
                restarting: false };
    _pppApplyList(p, data);
    /* ⭑ ONE SCREEN, showing whichever project is SELECTED — and on open the
     * prior project already is, so the picker comes up on that project's own
     * screen rather than a bare root (Josh, 2026-08-15). There is no separate
     * root any more; when nothing is selected, because the prior project was
     * deleted out from under us, the draw falls through to SELECT PROJECT. */
    _pppReselect(p);
    S.projectPadPicker = p;
    computePadNoteMap();            /* pads become PROJECT BUTTONS — DSP sees all-0xFF (see _padDispatchMutedNow) */
    S.globalMenuOpen = false;
    invalidateLEDCache();
    S.screenDirty = true;
}

function _closeProjectPadPicker_impl() {
    /* A live rename keyboard must not outlive the picker that opened it. */
    const _p = S.projectPadPicker;
    if (_p && _p.renameActive && isTextEntryActive()) closeTextEntry();
    S.projectPadPicker = null;
    computePadNoteMap();            /* pads become NOTES again (DSP side) */
    S.ledInitComplete = false;      /* repaint the sequencer surface */
    invalidateLEDCache();
    S.screenDirty = true;
}

/* Pre-defined pad colors a project can carry (spec: Josh, 2026-08-11). The
 * xattr user.dbx-color stores an INDEX into this table (project-cmd.sh
 * `color` verb); absent/null or out of range = index 0. A new project is born
 * with `index % PROJECT_COLORS.length` (project-cmd.sh DBX_PALETTE_N, pinned
 * to this table's length by test_project_picker_leds) so the shelf is not a
 * wall of one colour. Exported for
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
];
/* ⚠ No WHITE here, on purpose (Josh, 2026-08-22). The picker's pad grammar
 * spends solid White on exactly one meaning — "this is the OPEN project"
 * (ui_leds paintProjectPickerLEDs) — so a project painted white would read as
 * current whenever it sat idle. A project that picked WHITE before it was
 * retired stores index 9, which is now out of range and falls back to 0. */
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

/* ⚠⚠ host_system_cmd REFUSES anything not starting with an allowed verb
 * (`sh `, `cp `, `mv `, …, see js_host_system_cmd in shadow_ui.c). An
 * environment assignment in front — `DBX_OPEN_UUID=… sh project-cmd …` —
 * matches none of them, so the command was REJECTED and never ran. The
 * rejection prints to stderr, which nothing collects, so the caller saw a
 * command that silently did nothing:
 *
 *   rename          -> nothing renamed, the re-listing shows the old name,
 *                      and the UI reported RENAME FAILED
 *   delete (open)   -> nothing queued and no restart, so the picker sat on
 *                      DELETING / RESTARTING forever, waiting for a teardown
 *                      that was never asked for. The device had to be freed
 *                      from outside.
 *
 * Every other project-cmd call starts with `sh ` and was therefore fine —
 * which is why create, copy, and deleting a project Move is NOT holding all
 * worked, and only these two were broken.
 * (Josh, on hardware 2026-09-20: "it gave me rename failed", then
 * "device seems stuck on deleting restarting the session screen".)
 *
 * The command is run by /bin/sh anyway, so the assignment is fine once the
 * check is satisfied: put the allowed verb first and let that shell apply it.
 * Deliberately NOT widening the allowlist — this is a caller's mistake, and
 * the guard should keep refusing anything that does not name its verb. */
function _pppCmdWithOpenUuid(rest) {
    return 'sh -c ' + _shq('DBX_OPEN_UUID=' + (S.currentSetUuid || '') + ' sh ' + rest);
}

function _pppCloseOverlays(p) {
    p.menu = null; p.colorPick = null; p.confirmNew = null;
}

/* The project jog-menu (spec: Josh, 2026-08-11 — tap never loads).
 *
 * ⚠⚠ Built as a MODEL of row KINDS, not a fixed array indexed by position. The
 * loaded and unloaded states have different row COUNTS, and dispatching a click
 * on a bare index would mean two index spaces to keep in step — the shape that
 * silently fires the wrong action the first time a row is inserted. */
export function _pppMenuModel(p, k) {
    const rows = [];
    if (_pppIsLoaded(p, k)) {
        /* Status first, then the way back INTO the project.
         *
         * ⭑ Resume exists because removing Load from this screen removed the
         * only on-screen way out of the picker (Josh, 2026-08-15). Back does
         * still close it — but a menu offering nothing but Rename and Color on
         * the project you are already in reads as a dead end, and "Back works"
         * is not the same as "Back is discoverable". */
        rows.push({ kind: 'status', label: '(Current)', value: 'CURRENT' });
        rows.push({ kind: 'resume', label: 'Resume' });
    } else if (_pppBroken(p, k)) {
        /* No Load to offer. Rename, Color and Delete stay: none of them touch
         * the song, and Delete is how a damaged project is cleared out. */
        rows.push({ kind: 'status', label: "(Can't open)", value: "CAN'T OPEN" });
    } else {
        rows.push({ kind: 'load', label: 'Load' });
    }
    rows.push({ kind: 'rename', label: 'Rename' });
    rows.push({ kind: 'color',  label: 'Color' });
    return rows;
}

/* Is THIS project the one actually playing?
 *
 * ⚠⚠ `k === p.current` alone is not the question. On a fresh launch the prior
 * project is current — it is the pulsing pad — but nothing is loaded yet, and
 * Load is the row the user must press to start the session. Answering "yes"
 * there would print (CURRENT) on the one screen where nothing is current and
 * hide the only way forward. awaitingProjectSelect is what separates them. */
function _pppIsLoaded(p, k) {
    return k === p.current && !S.awaitingProjectSelect;
}

/* The first SELECTABLE row — index 1 when a (Current) status line occupies
 * row 0, so the cursor opens on Resume, which is the likeliest thing you came
 * here to do. */
function _pppMenuTop(p, k) { return (_pppIsLoaded(p, k) || _pppBroken(p, k)) ? 1 : 0; }

/* Put the picker back on the SELECTED project's screen. Since the 2026-08-15
 * cohesion pass that screen is the picker's only resting state, so every path
 * that closes an overlay has to land here rather than on a root that no longer
 * exists — otherwise it falls through to SELECT PROJECT while a project is
 * plainly selected. */
function _pppReselect(p) {
    if (p.current >= 0 && p.byIndex[p.current]) p.menu = { k: p.current, sel: _pppMenuTop(p, p.current) };
    S.screenDirty = true;
}

function _pppOpenMenu(p, k) {
    _pppCloseOverlays(p);
    p.menu = { k: k, sel: _pppMenuTop(p, k) };
    S.screenDirty = true;
}

/* --- menu actions ------------------------------------------------------ */

/* Author the request for pad k, before either actuator fires.
 *
 * ⚠ ONE request, ONE arming: the host unlinks the file as it arms, so a record
 * that outlived its request would be judged against a later, unrelated load.
 * Writing it here — not at the drain — is deliberate: the drains carry only a
 * pad INDEX, and re-deriving the uuid downstream by watching Move is the exact
 * inference this record exists to replace. */
/* `entryUuid` is what MOVE will name in its log — the library ENTRY, i.e. the
 * slot about to be pressed. `index` is the position the actuator presses.
 *
 * ⚠⚠ NOT the project uuid, and not the picker pad. Confirmation is a string
 * compare against the uuid Move logs (shadow_loaded_set_policy.h), so a
 * request carrying the project would never match once a slot stops being
 * named after the project it holds — every switch would read as `unopened`.
 * The project id rides along for the message the user sees, nothing else. */
/* Put a project on a slot and say which one to press.
 *
 * ⚠ Both routes to a project need this — the actuator switch AND the relaunch
 * route (now only Retry) — and the second one is easy to forget,
 * because it looks like it is about Move re-reading its set list rather than
 * about identity. Forgetting it is exactly what happened: the relaunch route
 * authored NO request, so nothing could confirm what Move opened and every
 * freshly created project bounced back to the picker on its first load.
 *
 * ⚠⚠ AND AUTHORING ONE WAS NOT ENOUGH — the same symptom survived that fix.
 * A request written to intended_set.txt on the relaunch route is consumed by
 * the shim that is ABOUT TO DIE, so the new session still had nothing to
 * confirm against. The relaunch route writes RELAUNCH_REQUEST, which launch.sh
 * installs for the next session; see that constant. Device 2026-09-21.
 *
 * Returns the parsed answer, or null. Re-pointing the IDLE slot is safe at any
 * time — it is never the one Move is on. */
export function prepareSlotFor(projectUuid) {
    if (!projectUuid) return null;
    const live = hostIdentity().projectId || '';
    host_system_cmd('sh ' + PROJECT_CMD + ' switch-slot ' + projectUuid + ' ' + live);
    _slotRefusedUnreadable = null;
    try {
        const a = JSON.parse(host_read_file('/data/UserData/dbx-host/slot_switch.json') || '{}');
        if (a && !a.ok && typeof a.why === 'string' && a.why.indexOf('unreadable:') === 0)
            _slotRefusedUnreadable = a.why.slice('unreadable:'.length);
        return (a && a.ok && typeof a.slot === 'number' && a.slot >= 0) ? a : null;
    } catch (e) { return null; }
}

/* Why the LAST prepareSlotFor refused, when the reason was an unreadable song
 * (the file broke after the picker listed it): the word, or null. */
let _slotRefusedUnreadable = null;
export function slotRefusedUnreadable() { return _slotRefusedUnreadable; }

/* The picker back up, with the reason — for a refusal found after the picker
 * had already closed for the load. */
export function reopenPickerRefusingUnreadable(why) {
    openProjectPadPicker();
    _pppRefuseUnreadable(why);
}

/* `viaRelaunch` says WHICH SESSION will answer this request, and therefore
 * which file it goes in. It is not a preference: a relaunch-route request left
 * in intended_set.txt is eaten by the shim that is about to die. */
export function requestSetForSlot(pick, entryUuid, slotIndex, viaRelaunch) {
    const uuid = entryUuid || '';
    if (!uuid) { S.requestedSet = null; return false; }
    S.requestedSet = { uuid: uuid, index: slotIndex,
                       name: (pick && pick.name) ? pick.name : '',
                       projectId: (pick && pick.uuid) ? pick.uuid : '' };
    return _pppWriteRequest(S.requestedSet,
                            viaRelaunch ? RELAUNCH_REQUEST : INTENDED_SET);
}

function _pppWriteRequest(req, path) {
    /* Best effort by design: a request that cannot be written leaves the host
     * in the state it is in TODAY (it treats what Move opens as the answer),
     * which is degraded but not wrong. Failing the load over it would be worse
     * than the thing this fixes. */
    const dest = path || INTENDED_SET;
    let ok = false;
    try {
        ok = !!host_write_file(dest,
                               req.uuid + '\n' + req.index + '\n' + req.name + '\n');
    } catch (e) { ok = false; }
    if (!ok) console.log('project request: could not write ' + dest +
                         ' for ' + req.uuid + ' (pad ' + req.index + ')');
    return ok;
}

/* ⭐ A SONG MOVE CANNOT READ IS NEVER LOADED (Josh, 2026-09-22: "refuse to
 * open with notice"). Move reports such a load as OPENED and the session comes
 * back empty, so the only place the fault shows is the file — project-cmd's
 * list reads it (`broken`, state_subdir.song_status) and switch-slot re-reads
 * it at the pick. The three words are a contract, pinned by check-config.sh. */
export const SONG_UNREADABLE_LINE = {
    missing: 'Song file missing',
    empty:   'Song file empty',
    invalid: 'Song file damaged',
};
const UNREADABLE_CARD_MS = 2000;   /* a reason to READ, not a glance */

/* Why this pad's project cannot be opened, or null. Never for the project that
 * is actually playing: it is open already, and Move may be mid-write on it. */
function _pppBroken(p, k) {
    const pr = p.byIndex[k];
    return (pr && pr.broken && !_pppIsLoaded(p, k)) ? pr.broken : null;
}

function _pppRefuseUnreadable(why) {
    showActionPopupFor(UNREADABLE_CARD_MS, "CAN'T OPEN",
                       SONG_UNREADABLE_LINE[why] || SONG_UNREADABLE_LINE.invalid);
}

function _pppLoad(p, k) {
    /* Before anything closes the picker or saves: the refusal leaves you on
     * the pad you pressed, with the reason on screen. */
    const _why = _pppBroken(p, k);
    if (_why) { console.log('project load: refused pad ' + k + ' (song ' + _why + ')'); _pppRefuseUnreadable(_why); return; }
    const _forceRelaunch = S.forceRelaunchNextLoad;
    if (k === p.current && !_forceRelaunch) {
        /* The already-current project. Under SELECT-BEFORE-LOAD this IS the
         * selection: create_instance loaded nothing, so load now. Once a
         * project is live, "Load" on the current one just closes the picker. */
        closeProjectPadPicker();
        if (S.awaitingProjectSelect) {
            /* The pick IS the load here, and checkProjectOpened stands down
             * while awaiting — so the "did Move open it" window is measured
             * from the pick, not from init. The switch path needs no such line:
             * it relaunches, and init() arms the window again. */
            loadSelectedCurrentProject();
        }
        return;
    }
    /* Switch: save first; the command fires one tick after the save lands
     * (the switch suspends/tears this module down — same shape as Quit).
     * saveState() is a no-op while awaiting a selection — there is nothing
     * loaded to save, and writing would clobber the project we are leaving. */
    closeProjectPadPicker();
    /* ⭐ ONE LOADING SCREEN, from the press to the project (Josh, 2026-09-22:
     * "can we have one screen that just say 'Loading / Name' and under it,
     * which part is being loaded?"). It starts here, naming the project PICKED
     * — S.currentSetName is still the one being left — and only its stage line
     * changes after this: SAVING, then LOADING SET (drawn as we hand over; the
     * host keeps that frame up while Move switches), then STARTING THE
     * SEQUENCER. It replaces an OPENING PROJECT pop-up over the old screen. */
    S.switchLoading = { name: (p.byIndex[k] && p.byIndex[k].name) || '',
                        stage: 'Saving', at: S.clockMs };
    /* ⭑ STOP THE OUTGOING PROJECT FIRST (Josh, 2026-09-02: "loading a new
     * project should immediately stop transport on current project"). The
     * switch parks us with the DSP still rolling — Move kept playing the old
     * set behind the Loading screen, and the eventual state_load zeroes
     * `playing` WITHOUT note-offs (it must not panic mid-load), so a chain
     * synth could hold a note across the swap. A real transport stop releases
     * every voice and, under clock-follow, asks Move to stop too. It is a
     * pending flag, not a call: from this MIDI-handler context the tick's own
     * `save` set_param could coalesce it away — the drain gives it a tick of
     * its own ahead of the save, and the switch fires the tick after that. */
    if (S.playing) S.pendingStopBeforeSave = true;
    saveState();
    /* (A project CREATED THIS SESSION used to need a Move relaunch here: under
     * one-entry-per-project, Move enumerated sets at launch and could not see
     * a new one — confirmed on hardware 2026-08-27. Under two fixed slots the
     * library never gains an entry, so it takes the normal switch; see below.)
     * ⚠ The one relaunch left is after PROJECT DID NOT OPEN -> Back (forceRelaunchNextLoad):
     * Move is on a set it minted itself, and only a relaunch makes it open the
     * pad's real set. */
    S.forceRelaunchNextLoad = false;
    /* ⭐ AUTHOR THE REQUEST before either actuator fires. Both of them carry a
     * pad index only; this is the record that says WHICH PROJECT was asked for,
     * so the host can tell an answer from a coincidence.
     *
     * ⚠ Deliberately NOT on the `k === p.current` shortcut above: that path
     * asks Move for nothing (the set is already open and Move confirmed it on
     * its own), it only loads OUR state. A request there would be a claim we
     * never made. */
    /* ⭐ The REQUEST is authored at the drain now, not here: it must name the
     * SLOT that is about to be pressed, and which slot that is depends on
     * where the live project sits — a question best asked as late as possible,
     * immediately before the press. What is recorded here is the PROJECT. */
    const _proj = p && p.byIndex ? p.byIndex[k] : null;
    /* ⭐ A PROJECT CREATED THIS SESSION TAKES THE NORMAL SWITCH NOW.
     * It used to relaunch Move, because under one-library-entry-per-project
     * Move only discovers a new entry when it starts. With two fixed slots Move
     * never has to discover anything: a new project is just a different folder
     * behind the idle slot, and Move re-reads a re-pointed slot from disk
     * (measured on a freshly created, never-opened set, 4.2 s, no restart).
     * The relaunch was a leftover — and the route every first load of a new
     * project failed on, because nothing the module remembered survived it.
     * Only the explicit one-shot below still relaunches. */
    if (_forceRelaunch) {
        /* The relaunch route. It still needs the project ON a slot and a
         * request NAMING that slot: the relaunch is how Move re-reads its set
         * list, not a substitute for identity. */
        const _sw = prepareSlotFor(_proj && _proj.uuid ? _proj.uuid : '');
        if (!_sw && _slotRefusedUnreadable) {
            /* Broke since the list was read: `switch` would refuse too, and the
             * Loading screen would wait for a relaunch that never comes. */
            S.switchLoading = null;
            reopenPickerRefusingUnreadable(_slotRefusedUnreadable);
            return;
        }
        if (_sw) requestSetForSlot({ pad: k, uuid: _proj.uuid, name: _proj.name },
                                   _sw.slot_uuid, _sw.slot, true);
        else console.log('project relaunch: no slot prepared for pad ' + k +
                         ' — Move will boot wherever it was');
        S.pendingProjectRelaunch = k;
    }
    else S.pendingProjectSwitch = { pad: k,
                                    uuid: (_proj && _proj.uuid) ? _proj.uuid : '',
                                    name: (_proj && _proj.name) ? _proj.name : '' };
}

/* ⭑⭑ IS PAD k THE PROJECT THIS SESSION IS IN?
 *
 * One predicate, because three places ask it and they must never disagree:
 * delete (careful path vs immediate), rename (queued mv vs immediate), and the
 * confirm screen that WARNS you the session will restart.
 *
 * ⚠ It is NOT `k === p.current`. That value is deliberately −1 until the host
 * confirms an open project, which is right for the load shortcut — loading must
 * never act on a guess — and wrong here. This question is about what dAVEBOx
 * has LOADED, and the answer is its own currentSetUuid. Reading the unconfirmed
 * value made a delete or a rename act on the directory underneath a live
 * session, and made the warning about that silently absent.
 * (2026-09-16: introduced by the identity work, caught the same day.) */
function _pppIsOpenProject(p, k) {
    const proj = p && p.byIndex ? p.byIndex[k] : null;
    /* ⚠⚠ RESOLVE. `currentSetUuid` is the library ENTRY Move opened; `proj.uuid`
     * is a PROJECT. Comparing them directly worked only while a slot was named
     * after the project it held — after that it can never match, and this
     * function silently falls through to `k === p.current`, which is exactly
     * the value the comment above says is wrong here because it is -1 until
     * the host confirms. That would put the un-warned delete/rename window
     * back, i.e. re-open the defect of 2026-09-16 without touching its fix. */
    if (S.currentSetUuid && proj &&
        proj.uuid === projectIdOfEntry(S.currentSetUuid)) return true;
    return k === p.current && p.current >= 0;
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
    /* ⭐ A NAME IS A TAG, NOT A FOLDER (project_name.py). Any character but a
     * newline is allowed — "/" included — and a rename moves nothing, so the
     * OPEN project renames in place like any other: no RENAMING/RESTARTING,
     * no Move restart. (It used to move Move's song folder, which for the open
     * project meant a deferred patch and a restart — and a picker lock, a
     * `reselect` marker, and a "was it deferred?" probe to cope with them.) */
    const trimmed = String(name || '').replace(/[\r\n]+/g, ' ').trim();
    if (!proj || !trimmed || trimmed === proj.name) { S.screenDirty = true; return; }
    /* Two projects with one name read as one on every screen that names them
     * — refuse up front. */
    for (let i = 0; i < p.projects.length; i++) {
        if (p.projects[i].uuid !== proj.uuid && p.projects[i].name === trimmed) {
            showActionPopup('NAME', 'TAKEN');
            return;
        }
    }
    const _wasOpen = _pppIsOpenProject(p, k);
    /* No DBX_OPEN_UUID: a rename makes no open-project decision any more. */
    host_system_cmd('sh ' + PROJECT_CMD + ' rename ' + k + ' ' + _shq(trimmed));
    const d = _pppRunList();
    if (d) _pppApplyList(p, d);
    const now = p.byIndex[k];
    if (now && now.name === trimmed) {
        /* The loading screen and export name the open project from this. */
        if (_wasOpen) S.currentSetName = trimmed;
        showActionPopup('PROJECT', 'RENAMED');
        S.screenDirty = true;
        return;
    }
    showActionPopup('RENAME', 'FAILED');
    S.screenDirty = true;
}

function _pppCommitColor(p, k, colorIdx) {
    host_system_cmd('sh ' + PROJECT_CMD + ' color ' + k + ' ' + colorIdx);
    const d = _pppRunList();
    if (d) _pppApplyList(p, d);
    p.colorPick = null;
    /* ⚠ Back to that project's screen. Opening the colour picker nulls the menu,
     * so without this the commit landed on no screen at all — which used to be
     * the root and is now the SELECT PROJECT empty state, with a project
     * selected. */
    _pppOpenMenu(p, k);
    invalidateLEDCache();
    S.screenDirty = true;
}

/* Jog click while the picker is up. With no overlay open it opens the menu on
 * the CURRENT project — the keyboard-free confirm under SELECT-BEFORE-LOAD. */
function _projectPadPickerClick_impl() {
    const p = S.projectPadPicker;
    if (!p) return;
    if (p.restarting) return;      /* delete-of-current: teardown in flight */
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
        const row = _pppMenuModel(p, m.k)[m.sel];
        if (!row || row.kind === 'status') return;      /* not an action */
        if (row.kind === 'load')   { _pppLoad(p, m.k); return; }
        /* Resume is simply "put the picker away" — the project is already
         * playing, so there is nothing to load. Same thing Back does; this is
         * the visible version of it. */
        if (row.kind === 'resume') { closeProjectPadPicker(); return; }
        if (row.kind === 'rename') { _pppStartRename(p, m.k); return; }
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
    if (p.restarting) return;      /* delete-of-current: teardown in flight */
    if (p.confirmNew) {
        p.confirmNew.sel = p.confirmNew.sel === 0 ? 1 : 0;
    } else if (p.colorPick) {
        const n = PROJECT_COLORS.length;
        p.colorPick.sel = (p.colorPick.sel + (delta > 0 ? 1 : n - 1)) % n;
        invalidateLEDCache();     /* live preview on the target pad */
    } else if (p.menu) {
        const n = _pppMenuModel(p, p.menu.k).length;
        const top = _pppMenuTop(p, p.menu.k);
        /* Wrap across the SELECTABLE rows only — the (CURRENT) status line is
         * not a stop, the same contract dividers have in drawKitList. */
        const span = n - top;
        p.menu.sel = top + (((p.menu.sel - top) + (delta > 0 ? 1 : span - 1)) % span);
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
    if (p.confirmNew) { _pppCloseOverlays(p); _pppReselect(p); return true; }
    /* ⭑ The menu IS the picker's screen now, so there is nothing behind it to
     * peel back to and Back closes the picker outright (returning false hands
     * that to the caller).
     * ⚠ EXCEPT while awaiting a selection: closing then leaves nothing loaded,
     * nothing on screen but LOADING, and no way out — the same dead end the
     * open path guards against. Swallow it there. */
    if (p.menu) return !!S.awaitingProjectSelect;
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

/* Pad tap inside the picker. k = the project's PICKER PAD, 0-31 — ours, not
 * Move's ordering index. The two were one number until the pad got its own
 * home (standalone/scripts/project_pad.py); `projects.json.index` carries it. */
function _projectPadPickerTap_impl(k) {
    const p = S.projectPadPicker;
    if (!p) return;
    if (p.restarting) return;      /* delete-of-current: teardown in flight */
    p.touchedIdx = k;
    const proj = p.byIndex[k];

    if (S.deleteHeld) {
        _pppCloseOverlays(p);
        if (!proj) { p.deleteIdx = -1; showActionPopup('EMPTY', 'PAD'); return; }
        /* ⭑⭑ "Am I IN this project?" is NOT "has Move confirmed it?".
         *
         * `p.current` is deliberately −1 until the host confirms an open
         * project, because the load shortcut must never act on a guess. The
         * delete guard is asking a different question — whether this directory
         * is the one the running session has loaded — and the answer to that is
         * what dAVEBOx itself holds. Using p.current here would let a delete
         * during the unconfirmed window take the immediate path and remove the
         * directory underneath a live session, which is precisely what the
         * careful path exists to prevent.
         *
         * So ask both: the loaded uuid first, and p.current as the fallback for
         * the case where nothing is loaded but a project is confirmed open. */
        if (_pppIsOpenProject(p, k)) {
            /* Deleting the project you are IN (Josh, 2026-08-24). It cannot
             * happen underneath a running session, so it happens the way a
             * rename of the open project already does: project-cmd queues the
             * rm into relaunch_patch.sh and restarts Move in place, and the
             * launcher runs it in the window after Move exits — nothing holding
             * the directory, no dying save able to write it back. The session
             * comes back on the lowest remaining project, or on the picker if
             * that was the last one.
             * ⚠ No saveState() here, unlike the rename: we would be writing
             * this project's state into a directory that is about to be
             * removed, and the shell's save_song is skipped for the same
             * reason. Everything else about the gesture is unchanged — hold
             * Delete, tap once to arm, tap again to confirm. */
            if (p.deleteIdx === k) {
                p.restarting = 'DELETING';
                _pppCloseOverlays(p);
                p.deleteIdx = -1;
                S.screenDirty = true;
                showActionPopup('DELETING', 'RESTARTING');
                /* Tell the script what we know rather than letting it
                 * re-derive it from the boot record, which is silent
                 * until Move confirms. See do_delete in project-cmd.sh. */
                host_system_cmd(_pppCmdWithOpenUuid(PROJECT_CMD + ' delete ' + k));
                return;
            }
            p.deleteIdx = k;
            S.screenDirty = true;
            return;
        }
        if (p.deleteIdx === k) {
            /* ⚠ This path used to announce PROJECT DELETED unconditionally —
             * without even re-reading the list. When the script deferred (it
             * had decided the project was open, which at the boot picker it
             * routinely is), the directory was still there, the pad still
             * showed the project, and it vanished at the next launch instead.
             * Ask the queue what the script decided; see _pppQueueSnapshot. */
            const _queueBefore = _pppQueueSnapshot();
            host_system_cmd('sh ' + PROJECT_CMD + ' delete ' + k);
            const deferred = (_pppQueueSnapshot() !== _queueBefore);
            const d = _pppRunList();
            if (d) _pppApplyList(p, d);
            p.deleteIdx = -1;
            invalidateLEDCache();
            if (deferred) {
                p.restarting = 'DELETING';
                _pppCloseOverlays(p);
                showActionPopup('DELETING', 'RESTARTING');
            } else {
                showActionPopup('PROJECT', 'DELETED');
            }
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
            /* A copy is just another project folder: loading it re-points the
             * idle slot and presses it, exactly like any other project. It used
             * to need a Move relaunch (Move only discovered new library entries
             * at startup), and copy once silently skipped that relaunch, so its
             * edits landed in the previous project (Josh, 2026-09-16). Under two
             * fixed slots there is nothing for Move to discover, and a load that
             * does not open what was asked never becomes `open`, so nothing can
             * save into the wrong project. */
            const d = _pppRunList();
            if (d) _pppApplyList(p, d);
            p.copySrcIdx = -1;
            invalidateLEDCache();
            showActionPopup('PROJECT', 'COPIED');
        }
        S.screenDirty = true;
        return;
    }

    /* SHIFT+pad = load it NOW, creating it first if the pad is empty (Josh,
     * 2026-08-26). The third modifier in the picker's own vocabulary, beside
     * Delete+tap and Copy+tap — and placed AFTER both so a held Delete or Copy
     * keeps its meaning rather than becoming ambiguous.
     *
     * ⭑ This does not weaken the 2026-08-11 spec below. That rule is that a
     * PLAIN tap never loads, because a stray finger on the picker should not
     * swap the project out from under you. A held modifier is not a stray
     * finger — it is the same reason Delete+tap is allowed to delete.
     *
     * ⚠ Create-then-load is deliberately NOT the confirm flow: the confirm
     * exists so a plain tap on an empty pad cannot create by accident, and Shift
     * is that intent already stated. Failure is still reported — the create can
     * fail (a full disk, a name collision), and loading a project that was never
     * made would be a silent no-op. */
    if (S.shiftHeld) {
        _pppCloseOverlays(p);
        if (!proj) {
            host_system_cmd('sh ' + PROJECT_CMD + ' new-at ' + k);
            const d = _pppRunList();
            if (d) _pppApplyList(p, d);
            if (!p.byIndex[k]) { showActionPopup('CREATE', 'FAILED'); return; }
            invalidateLEDCache();
        }
        _pppLoad(p, k);
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

/* The picker's own header: the brand bar's height (MV_BRAND_HDR_H) and y, but
 * the title "SELECT PROJECT" in the kit's 4x5 caps face, centred — Josh,
 * 2026-09-15: the header should say what the screen is for, and not in the
 * wordmark's mixed-case font. Nothing else on this screen moved. */
function _drawProjectPickerHeader() {
    /* ALL CAPS in the kit's 4x5 face, not the wordmark's mixed-case header
     * font (Josh, 2026-09-15: "project picker header shouldn't use the mixed
     * font. use all caps."). Same bar, same y, still centred. */
    const t = 'SELECT PROJECT';
    fill_rect(0, 0, 128, MV_BRAND_HDR_H, 1);
    fontPrint4x5(Math.max(2, Math.round((128 - fontWidth4x5(t)) / 2)), 1, t, 0);
}

/* ⚠ PICKER — opted OUT of the 2026-08-27 menu type rule at every drawKitList
 * call below (`hostLabels: false`), including the menu and confirms that live
 * INSIDE it: it is one surface and half-converting it would look like a bug. */
function _drawProjectPadPicker_impl() {
    const p = S.projectPadPicker;
    if (!p) { clear_screen(); return; }

    /* Rename keyboard is fully modal and draws itself. */
    if (p.renameActive && isTextEntryActive()) { drawTextEntry(); return; }

    /* ⭑⭑ RE-DERIVE the resting state here, in ONE place, rather than bookkeeping
     * it at every mutator — the same rule the edit-CC claim follows, and for the
     * same reason. Since the menu became the picker's only resting screen, SIX
     * paths that call _pppCloseOverlays (arming delete or copy, cancelling
     * either, both completions, and the three refusals) would each have to
     * remember to put the picker back on the selected project. One of them
     * forgetting shows SELECT PROJECT while a project is plainly selected. */
    if (!p.restarting && !p.confirmNew && !p.colorPick && !p.menu &&
        p.deleteIdx < 0 && p.copySrcIdx < 0) _pppReselect(p);

    clear_screen();

    /* ⭑ The wordmark is the set manager's ALWAYS-ON header (Josh, 2026-08-23):
     * this screen is the first thing a user lands on after load, so it is the
     * app's face. Every kit-chassis screen below takes drawKitBrandHeader()
     * and carries its former title as its first list row instead. The one
     * yes/no confirm keeps the shared DIALOG chassis (§5.0 — dialogs are the
     * host family, and it is transient). */
    if (p.restarting) {
        /* `restarting` carries its VERB rather than a bare true. Only delete of
         * the open project takes this path now (a rename moves nothing and no
         * longer restarts); the verb stays so a second one cannot be mislabelled. */
        _drawProjectPickerHeader();
        drawKitList([{ label: p.restarting, hdr: true },
                     { note: 'Restarting' }, { note: 'the session...' }], -1,
                    { hostLabels: false });
        return;
    }

    /* A CONFIRM, so it stays on the shared dialog family — that is what the
     * dialog chassis is for, and its header already matches the kit's. */
    if (p.confirmNew) {
        drawKitHeader('New project');
        /* The question, through the same body helper every other confirm
         * uses. It used to be gated on the WHOLE sentence fitting one line —
         * which it never does — so the card showed a header over No/Yes and
         * never said what Yes does (Josh, at the device, 2026-09-21). */
        dlgLines(['Create a new project', 'on this pad?']);
        drawYesNoRow(p.confirmNew.sel);
        return;
    }

    /* Armed by hold-Delete / hold-Copy + tap. Prompts, not screens: they own
     * the display until the gesture completes or is cancelled. They used to be
     * free text squeezed under the root's status line, where the longest of
     * them ran off the right edge of the panel. */
    if (p.deleteIdx >= 0) {
        const dp = p.byIndex[p.deleteIdx];
        _drawProjectPickerHeader();
        drawKitList([{ label: 'DELETE ' + (dp ? dp.name : '?'), hdr: true },
                     { divider: true },
                     { note: 'Tap the pad again' },
                     ...(_pppIsOpenProject(p, p.deleteIdx)
                         ? [{ note: 'This one is OPEN —' }, { note: 'session restarts' }]
                         : [])], -1, { hostLabels: false });
        return;
    }
    if (p.copySrcIdx >= 0) {
        const sp = p.byIndex[p.copySrcIdx];
        _drawProjectPickerHeader();
        drawKitList([{ label: 'COPY ' + (sp ? sp.name : '?'), hdr: true },
                     { divider: true },
                     { note: 'Tap an empty pad' }], -1, { hostLabels: false });
        return;
    }

    /* The colour picker is a LIST of the colours now, selected by inverse video
     * like every other list — it was a `< NAME >` text row, a selection idiom
     * used nowhere else in the app. The pad still previews the real colour
     * live, which is the part a 1-bit display cannot do. */
    if (p.colorPick) {
        const cp = p.byIndex[p.colorPick.k];
        _drawProjectPickerHeader();
        /* No title row here, deliberately: the colour list SCROLLS, and a row-0
         * title scrolls off with it — worse than absent. Context is carried by
         * the flow (this screen opens from that project's own menu) and by the
         * pad, which previews the colour live. `cp` stays for the guard. */
        void cp;
        drawKitList(PROJECT_COLORS.map(c => ({ label: c.name })),
                    p.colorPick.sel, { hostLabels: false });   /* small font, like the menu's actions */
        return;
    }

    if (p.menu) {
        const mp = p.byIndex[p.menu.k];
        _drawProjectPickerHeader();
        /* Name row + rule under it (Josh, 2026-08-23), then the actions. The
         * (Current) status folds into the name row's VALUE rather than keeping
         * its own note row — with the brand header above, a sixth row pushes
         * the name off the top the moment the cursor rests on RESUME.
         * `sel` never lands on the status row (_pppMenuTop skips it, the wrap
         * spans selectable rows only), so the display offset is title+divider
         * minus the folded status row when one exists. */
        const model = _pppMenuModel(p, p.menu.k);
        const hasStatus = model.length > 0 && model[0].kind === 'status';
        const nameLbl = fitHdr(String(mp ? mp.name : '?').toUpperCase(), 124);
        const rows = [{ label: nameLbl,
                        /* The status row's OWN word — this printed CURRENT for any
                         * status, so a project that cannot open read as the open
                         * one (device, 2026-09-22). */
                        hdr: true, value: hasStatus ? model[0].value : undefined }]
            .concat(model.filter(r => r.kind !== 'status').map(function(r) {
            /* Both open a screen, so both carry the chevron and NEITHER carries a
             * value (Josh, 2026-08-15). Showing the current colour here read as
             * a value the jog would edit in place, which is the grammar for a
             * row you scrub — this one is a door. The picker names the colour,
             * and the pad shows it in the one form a 1-bit panel cannot. */
            /* Action rows take the SMALL (movy label) font — the name above
             * stays in the header font, so the two element kinds read apart
             * at a glance (Josh, 2026-08-23). */
            if (r.kind === 'rename' || r.kind === 'color')
                return { label: r.label, chevron: true };
            return { label: r.label };
        }));
        drawKitList(rows, p.menu.sel + 1 - (hasStatus ? 1 : 0), { hostLabels: false });
        /* Full-width rule inside the name row's band (Josh, 2026-08-23 —
         * position at y=18, "should extend full screen width"). In-band and
         * safe: the name row is never selectable so no fill ever clips it,
         * and y=18 leaves one clear pixel above the next row's fill edge at
         * 20 — the earlier rule at 19 touched it and read as a taller
         * highlight. Name glyphs sit at y=11..16. */
        void hdrWidth; void nameLbl;
        fill_rect(0, 18, 128, 1, 1);
        return;
    }

    /* Nothing selected — the prior project no longer exists. The header drops
     * to the generic title and the screen carries one centred hint until a pad
     * is tapped. No gesture legend anywhere in here: copy and delete are
     * Move-native gestures the user already knows (Josh, 2026-08-15). */
    _drawProjectPickerHeader();
    drawKitList([], -1, { emptyMsg: 'Select project', emptyHdr: true, hostLabels: false });
    _drawPreflightNotice();
}

/* One-line footer notice for a launch-time preflight failure (see ui.js init
 * and standalone/scripts/preflight.sh) — never a popup, so it does not steal
 * the picker's attention from project selection. Sits in the same bottom
 * strip other screens reserve for a hint row, well clear of the centred
 * "Select project" prompt above it, so it never displaces the list. */
function _drawPreflightNotice() {
    if (!S.preflightFailed) return;
    print(4, 58, 'Preflight: see log', 1);
}

/* Fail-SAFE wrappers: see the banner above. */
function _pppGuard(name, impl, args) {
    try { return impl.apply(null, args); }
    catch (e) {
        try { console.log('projectPadPicker FAULT in ' + name + ': ' + e + ' :: ' + (e && e.stack ? e.stack : 'no stack')); } catch (e2) {}
        try { S.projectPadPicker = null; computePadNoteMap(); } catch (e3) {}
        /* Nulling the picker is survivable once a project is loaded — the user
         * lands back on the sequencer. While AWAITING it is a dead end: no
         * project, no picker, LOADING pinned, transport locked. The tick
         * watchdog re-arms the open, but if the fault is in the open itself
         * that would loop, so count the attempts and put up the NO PROJECT LIST
         * card instead — which is drawn outside this guard, so a fault in the
         * picker's own draw cannot take it down too. (It used to load the boot
         * project here; see _pppFailClosed for why that had to stop.) */
        try {
            if (S.awaitingProjectSelect) {
                S._pppFaultCount = (S._pppFaultCount | 0) + 1;
                if (S._pppFaultCount >= 3) _pppFailClosed('the picker faulted three times');
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
