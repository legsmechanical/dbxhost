/* ui_render.mjs
 * All OLED drawing: bank-header chrome, step-edit formatters, session
 * overview grid, Performance Mode screen, and the top-level drawUI dispatch
 * (the main per-tick render entry, including the drum position bar). Pure
 * S-state -> pixel-API translation; no input handling.
 * Extracted from ui.js (Phase 5 of the modularity refactor, module 5, final).
 */

import { S, PERF_FACTORY_PRESETS } from './ui_state.mjs';
import { drawDaveBox } from './ui_daves.mjs';
/* ui_engine imports only `os`, so this edge creates no cycle. */
import { SESS_KNOB_MODES, engineLoadedModule, engineModuleAbbrev } from './ui_engine.mjs';
import { instrValueFor } from './ui_dsp_bridge.mjs';
import { fontPrint4x5, fontWidth4x5 } from './ui_fonts_pp.mjs';
import { moduleIdOf } from './ui_discover.mjs';
import { schSlotForTrack } from './ui_corun.mjs';
import {
    BANKS, BANK_RESPONDER, BANK_OCTAVE, BANK_WHEN, BANK_SOUND, BANK_STEP, BANK_MACROS, BANK_AUTOMATION,
    INSTR_SCHWUNG, INSTR_MOVE_MAX, INSTR_MIDI_CH, INSTR_TRACK,
    NOTE_KEYS, NUM_CLIPS, NUM_STEPS, NUM_TRACKS, PAD_MODE_CONDUCT, PAD_MODE_DRUM,
    SCALE_DISPLAY, SCENE_LETTERS, TPS_VALUES, STEP_ITER_LIST,
    col4, col5, pixelPrint, pixelPrintC,
    fmtSign, fmtStretch, fmtLen, fmtRes, fmtPct, fmtBool, fmtGateMod,
    fmtArpRate, fmtVelOverride, fmtPlayDir, fmtRevStyle,
    fmtDly, fmtArpStyle, fmtArpSteps, fmtDiq, fmtPlain, fmtLgto, fmtPitchRnd
} from './ui_constants.mjs';
import {
    drawKitHeader, drawKitTouchedHeader, drawKitPageBar, drawKitBankHeader,
    kitUseLayout,
    drawKitCells, drawKitEnumOverlay, drawKitValueOverlay, drawKitListOverlay,
    drawVFader, mvPrint, mvWidth, rectOutline, plotLine,
    drawLevelCard,
    pf3Print, pf3Width, drawArcKnobAt, hdrPrint, hdrWidth, bigPrint, bigWidth, bigFit,
    MV_ROW0_Y, MV_KH, MV_BIG_H, MV_ZOOM_X, MV_ZOOM_Y, MV_ZOOM_W, MV_ZOOM_H,
    drawKitHintRow, enumOverlayWouldDraw, MV_FOOTER_Y
} from './ui_movy.mjs';
import {
    drawGlobalMenu, drawStateWipeConfirm, drawExitConfirm, drawRecordBlockedDialog, drawBpmMoveInfo,
    drawConvertToDrumConfirm, drawConvertToConductConfirm, drawMenuInfo,
    drawLgtoConfirm, drawBakeConfirm, drawSnapshotPicker,
    drawBakeSceneConfirm, drawXposeConfirm, drawBpmLine,
    drawProjectPadPicker
} from './ui_dialogs.mjs';
import { isBooleanPair } from './ui_cells.mjs';
import { ensureGlobalMenuFresh } from './ui_menu.mjs';
import { bankCyclePos, bankCycleForMode, bankDisplayName } from './ui_pure.mjs';
import { syncDrumRepeatState } from './ui_drummodel.mjs';
import {
    effectiveClip,
    bankHasAltParams, altIndicatorActive
} from './ui_leds.mjs';
import { soundRender, renderGatewayCard, renderTrackGatewayCard, renderMacrosPeek } from './ui_sound.mjs';
import { drawAutomationBankBody } from './ui_automation_bank.mjs';
import { automationStateFor } from './ui_automation.mjs';
import { seqAutoTargetForKnob } from './ui_constants.mjs';
import { sessStripTargets } from './ui_engine.mjs';
import { registerRingCells } from './ui_knob_leds.mjs';
import { drawMenuHeader } from '/data/UserData/schwung/shared/menu_layout.mjs';

/* ------------------------------------------------------------------ */
/* Parameter bank definitions                                           */
/* ------------------------------------------------------------------ */

/* THE BANK HEADER (Josh, 2026-09-05): [glyph] NAME ............ T3[OB]
 *
 * The glyph on the left says what the bank CONTROLS; the far right names the
 * TRACK and, in brackets, its INSTRUMENT. The track is there because of the
 * LATCH — a latched card holds the screen indefinitely and the track row is
 * out of sight (2026-08-25); it used to be a 'Tr3 - ' prefix on the left. The
 * alt-param chevron that sat at x=121 is gone, and with it the fixed text
 * budget: drawKitBankHeader measures the right label and gives the name the
 * rest. The STEP, SOUND + CONFIG and MACROS pages wear the same header
 * (2026-09-03: "just like pre-existing ones"). */
export function bankHeaderGlyph(bank) {
    if (bank === BANK_SOUND) return 'audio';
    if (bank === BANK_MACROS || bank === BANK_AUTOMATION) return 'perf';
    return 'seq';        /* clip, lanes, note fx, harmony, delay, arps, step, drum, conductor */
}
/* The right label. `bare` = the resting track overview, whose TRACK ROW already
 * names the track (Josh, 2026-08-31: "it's redundant") — it keeps only the
 * instrument. Session view has no track to name. */
export function bankHeaderRight(bare) {
    if (S.sessionView) return '';
    const instr = '[' + (S.instrAbbrev || '--') + ']';
    return bare ? instr : 'T' + (S.activeTrack + 1) + instr;   /* T3[OBXD] — no space (Josh) */
}
/* The instrument abbreviation for the active track — a CACHE, refreshed by the
 * tick once a second and forced (`S.instrAbbrevAt = 0`) on a track switch or
 * an instrument change. The header draws every frame; the module id is a
 * shadow_get_param round-trip (~2.9 ms), which must never sit on a draw path. */
export function refreshInstrAbbrev() {
    const t = S.activeTrack;
    const v = instrValueFor(t) | 0;
    let a = '--';
    if (v === INSTR_SCHWUNG) {
        const ref = engineLoadedModule(schSlotForTrack(t), 'synth');
        a = ref ? engineModuleAbbrev(moduleIdOf(ref)) : '--';
    } else if (v >= 0 && v <= INSTR_MOVE_MAX)                a = 'MV' + (v + 1);
    else if (v >= INSTR_MIDI_CH && v <= INSTR_MIDI_CH + 15)  a = 'CH' + (v - INSTR_MIDI_CH + 1);
    else if (v >= INSTR_TRACK && v <= INSTR_TRACK + 7)       a = 'TR' + (v - INSTR_TRACK + 1);
    S.instrAbbrev = String(a || '--').toUpperCase();
    S.instrAbbrevAt = S.clockMs + 1000;
}

/* The automation circle on a bank card's cell, for a knob on the seq: list. */
function markSeqAuto(cell, bank, k, altMode) {
    const t = S.activeTrack;
    const tg = seqAutoTargetForKnob(t, bank, k, altMode);
    if (!tg) return;
    const st = automationStateFor(t, effectiveClip(t), tg);
    if (st) cell.auto = st.active ? 'auto' : 'auto-off';
}

function drawBankHeading(name, showTrack, bareHdr) {
    /* bareHdr: the resting track overview draws the TRACK ROW, which already
     * names the active track (Josh, 2026-08-31: "it's redundant — you can see
     * active track on the track number row") — its right label keeps only the
     * instrument. Bank cards name the track: a latched card holds the screen
     * with no track row in sight (2026-08-25). */
    /* session view's mixer pages are AUDIO banks whatever the track's bank is */
    drawKitBankHeader(bankHeadingText(name), S.sessionView ? 'audio' : bankHeaderGlyph(S.activeBank),
                      bankHeaderRight(bareHdr));
}
/* The heading STRING: the name, with the Conductor's "C-" blink (phase driven
 * in the tick loop; the header font is fixed-advance so the name stays
 * steady). Split out so the STEP page can draw the same text. */
function bankHeadingText(name) {
    if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT &&
            name.charAt(0) === 'C' && name.charAt(1) === '-')
        return (S._altBlinkPhase !== 1 ? 'C-' : '  ') + name.slice(2);
    return name;
}

/* Vestigial: secondary banks (LIVE ARP / AUTOMATION / REPEAT GROOVE) now use
 * the same filled black-on-white header as everything else (Josh's call,
 * 2026-07-18). Kept so call sites stay stable. */
function drawBankHeadingInverted(name, showTrack, bareHdr) {
    drawBankHeading(name, showTrack, bareHdr);
}

/* Conductor bank render: standard white bank header + a 2x4 (2 rows x 4 cols)
 * grid of per-track cells labeled Tr1..Tr8, value rendered under each label.
 * Column/row metrics + col4() fixed-width cells + touched-knob highlight match
 * the standard 8-knob bank overview (colX = 4 + (i%4)*30, rowY = 12 | 36, value
 * at rowY+12; cell i is filled and rendered inverted when S.knobTouched === i —
 * same idiom as the drum-lane / ALL-LANES overviews). valFn(trackIdx) -> short
 * string. The Conductor's own track cell shows inertLabel instead of a value. */
function drawConductTrackGrid(header, valFn, inertLabel, footer) {
    /* Canvaskit grid: one value square per track, Tr# label strips, touched
     * cell swaps its label to the value and the header to "TRACK N". */
    const cells = [];
    for (let i = 0; i < 8; i++) {
        if (i === S.activeTrack) {
            /* activeTrack is the Conductor whenever these banks render */
            cells.push({ kind: 'blank', label: inertLabel });
        } else {
            cells.push({ kind: 'valsq', label: 'Tr' + (i + 1),
                         name: 'Track ' + (i + 1), text: String(valFn(i)) });
        }
    }
    drawKitPage(header, cells, false, footer);
}

/* Conductor RESPONDER grid: per-track TOGGLE bar (like the DELAY Retrig toggle)
 * showing each track's responder on/off state instead of an ON/off value box.
 * The Conductor's own cell and drum tracks (which never respond) stay blank —
 * distinct from an "off" track, which shows an empty framed bar. */
function drawConductToggleGrid(header, onFn, footer) {
    const cells = [];
    for (let i = 0; i < 8; i++) {
        if (i === S.activeTrack) {
            cells.push({ kind: 'blank', label: 'Cndct' });
        } else if (S.trackPadMode[i] === PAD_MODE_DRUM) {
            cells.push({ kind: 'blank', label: 'Tr' + (i + 1) });
        } else {
            const on = !!onFn(i);
            cells.push(toggleCell('Tr' + (i + 1), 'Track ' + (i + 1), on, 'ON', 'off'));
        }
    }
    drawKitPage(header, cells, false, footer);
}

/* A two-state cell, drawn by the SPLIT rather than by whoever wrote the literal.
 *
 * ⭑ Every hand-written toggle on this screen family goes through here, so the
 * pill/bar decision is made once from the two strings the cell will actually
 * show. Written as a helper the moment the pill was adopted, because the
 * alternative was six literals each carrying a `kind` that an author had to get
 * right — and the one that gets it wrong is invisible: a pill on a word pair
 * still draws, still toggles, and just stops saying which word.
 *
 * See isBooleanPair in ui_cells.mjs for the rule and why both halves must
 * qualify. Track View's toggles are the reason the vocabulary is case-insensitive
 * — the Conductor grid spells its states 'ON' and 'off'.
 */
function toggleCell(label, name, on, onText, offText) {
    if (!isBooleanPair(onText, offText)) {
        /* A pair of WORDS takes the enum box, which PRINTS the word. The bar it
         * used to take showed a fill level and nothing else, so Reverse Style
         * read as "full" or "empty" and you had to hold the knob to find out
         * whether that meant Step or Audio. `options`/`sel` come with it so the
         * turn-to-reveal picker still works. */
        return { kind: 'enumsq', label, name, text: on ? onText : offText,
                 options: [offText, onText], sel: on ? 1 : 0 };
    }
    return { kind: 'pill', label, name, text: on ? onText : offText,
             norm: on ? 1 : 0 };
}

/* Full-height dithered (checkerboard) bar — the "Thru" state in the step
 * editors: velocity passes through, so the bar reads as present-but-soft. */
function drawThruBar(x, w, top, bot) {
    for (let yy = top; yy <= bot; yy++)
        for (let xx = x + ((x + yy) & 1); xx < x + w; xx += 2)
            set_pixel(xx, yy, 1);
}

/* The enum/dir option-list overlay covers the 3 cells away from the touched
 * knob, so it must NOT appear on a bare orienting touch — only once the knob is
 * actually turned. knobTurnedTick[t] is reset to -1 on each touch-down and set
 * on turn, so `>= 0` means "turned since this touch began". It then stays up
 * until the finger lifts: knobTouched persists while physically held (the
 * post-turn highlight timeout in ui_tick is gated on knobPhysIdx). Returns the
 * index for drawKitEnumOverlay, or -1 to suppress. */
function enumOverlayIdx(t) {
    return (t >= 0 && S.knobTurnedTick[t] >= 0) ? t : -1;
}

/* The merged Note/Oct box spanning the K1+K2 widget span — shared by the
 * melodic step editor and the drum NOTE FX lane box so both read the same.
 * `name` is the note name in the big font; `sub` is an optional qualifier
 * (the lane's MIDI number, or "+2" for a chord step) alongside it in the
 * label font, the pair centred as a group. Inverts while either knob is
 * held. Falls back to an all-small line if the group overruns the box. */
function drawNoteBox(name, sub, invert) {
    const BX = 6, BW = 52, BY = MV_ROW0_Y, BH = MV_KH;
    if (invert) fill_rect(BX, BY, BW, BH, 1);
    else        rectOutline(BX, BY, BW, BH, 1);
    const fg = invert ? 0 : 1;
    const s  = sub ? String(sub) : '';
    const sW = s ? mvWidth(s) + 3 : 0;      /* 3px gap before the qualifier */
    const fit = bigFit(name, BW - 4 - sW);
    if (fit) {
        const x = BX + Math.round((BW - fit.w - sW) / 2);
        bigPrint(x, BY + Math.floor((BH - MV_BIG_H) / 2), name, fg, fit.cond);
        /* baseline-align the small text with the bottom of the big glyphs */
        if (s) mvPrint(x + fit.w + 3, BY + Math.floor((BH - MV_BIG_H) / 2) + MV_BIG_H - 5, s, fg);
        return;
    }
    const line = s ? name + ' ' + s : name;
    mvPrint(BX + Math.round((BW - mvWidth(line)) / 2),
            BY + Math.floor((BH - 5) / 2), line, fg);
}

/* Canvaskit step-editor page (drum + melodic step hold): "STEP N" filled
 * header (touched knob swaps in the param name), kit grid, enum overlay on
 * top. `noteBox` (melodic) draws the merged Oct/Note box over the K1+K2
 * widget span; cells === null renders the empty-step notice. */
/* The STEP bank at rest: the mode's step-edit layout with every value `--`. */
function stepBankIdleCells(drum) {
    const dash = (label, name, kind) => ({ kind: kind || 'valsq', label, name, text: '--' });
    if (drum) {
        return [dash('Leng', 'Length'), dash('Vel', 'Velocity', 'arc'), dash('Nudg', 'Nudge', 'arcbip'),
                { kind: 'blank', label: '' }, dash('Iter', 'Iteration'), dash('Prob', 'Probability', 'arc'),
                dash('Ratch', 'Ratchet'), { kind: 'blank', label: '' }];
    }
    return [{ kind: 'blank', label: 'Note', name: 'Note', bigText: '--' },
            { kind: 'blank', label: 'Oct',  name: 'Note', bigText: '--' },
            dash('Leng', 'Length'), dash('Vel', 'Velocity', 'arc'), dash('Nudg', 'Nudge', 'arcbip'),
            dash('Iter', 'Iteration'), dash('Prob', 'Probability', 'arc'), dash('Ratch', 'Ratchet')];
}

function drawStepEditKitPage(title, cells, noteBox, footer) {
    /* The bank card's map, set explicitly: this page is drawn from two places
     * (the STEP bank, and the reveal over any screen) and must look the same
     * from both — the kit's layout binding is whatever the LAST draw chose. */
    kitUseLayout('bank');
    const t = S.knobTouched;
    const touched = cells && t >= 0 && cells[t] && cells[t].name ? cells[t] : null;
    if (touched) {
        drawKitTouchedHeader(touched.name);
    } else {
        /* The bank heading, Conductor blink included — `title` is the bank's
         * plain name; the Conductor's C- form comes from the walk. */
        drawKitBankHeader(bankHeadingText(bankDisplayName(S.trackPadMode[S.activeTrack], BANK_STEP)),
                          'seq', bankHeaderRight(false));
        fill_rect(0, 9, 128, 1, 1);   /* solid rule (no bank context here) */
    }
    if (!cells) {
        /* An empty step (or no step held): every knob reads `--` — spec §2, the
         * STEP bank. The layout is the mode's own, so the cells say what the
         * knobs WOULD edit. */
        drawKitCells(stepBankIdleCells(S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM), -1);
        if (footer) drawKitHintRow(MV_FOOTER_Y, footer);
        return;
    }
    drawKitCells(cells, t);
    if (noteBox != null) drawNoteBox(noteBox.name, noteBox.sub, (t === 0 || t === 1));
    const _ovi = enumOverlayIdx(t);
    drawKitEnumOverlay(cells, _ovi);
    drawKitValueOverlay(cells, _ovi);
    if (footer && !enumOverlayWouldDraw(cells, _ovi)) drawKitHintRow(MV_FOOTER_Y, footer);
}

/* Session-view MIXER page: the selected mixer mode across ALL EIGHT tracks, in
 * the same 8-cell shape as a clip param bank, so the mixer reads as one more
 * bank rather than a screen of its own.
 *
 * The widget per mode comes from SESS_KNOB_MODES: a level is a vertical FADER,
 * pan a BIPOLAR arc (its meaning is distance from centre, so centre must look
 * like centre), the sends plain arcs.
 *
 * ⚠ Values come from the CACHED `S.sessVolLevel[]`, never a fresh read: tick
 * already maintains it for the selected mode, and eight `get_param`s here would
 * cost ~23 ms of SPI round-trips per frame — see the param-roundtrip rule.
 * A track with no mixer position (routed to MIDI/EXT, or a Schwung track with no
 * slot) has nothing to show, so its cell is BLANK — deliberately distinct from a
 * track sitting at zero, which draws an empty widget. */
function drawSessionMixerPage() {
    const mode = SESS_KNOB_MODES[S.sessKnobMode];
    /* The gateway renders the SOUND + CONFIG door idiom: a prompt, not a
     * grid — the click is the entry, the knobs are inert. */
    if (mode.widget === 'gateway') {
        /* The SOUND + CONFIG door's exact dress, through the ONE drawer
         * (Josh, 2026-09-01: "should use same font as sound+config entry bank
         * on track view") — a hand-drawn copy here is how the two doors would
         * drift apart. */
        renderGatewayCard(mode.label, 'MASTER & SEND FX');
        return;
    }
    const cells = [];
    for (let t = 0; t < NUM_TRACKS; t++) {
        const label = 'Tr' + (t + 1);
        const isMidi = S.trackRoute[t] === 2 && !(S.trackMidiTo[t] | 0) &&
                       (mode.key === 'volume' || mode.key === 'pan');
        const hasPos = (S.sessVolBus[t] > 0) || isMidi ||
                       (S.trackRoute[t] === 0 && (S.sessVolSlots[t] | 0) !== 0);
        const v = S.sessVolLevel[t];
        /* ⭑ A track ROUTED TO ANOTHER TRACK is INERT here BY DESIGN — its audio
         * is the destination's, so the destination's strip is its strip. That
         * is a different fact from "no position yet" (a Schwung track with no
         * slot), which stays blank: an X box says "nothing to mix HERE, on
         * purpose" (2026-09-04, the routed-track disabled-states check). */
        const _dest = S.trackRoute[t] === 2 ? (S.trackMidiTo[t] | 0) : 0;
        if (!hasPos && _dest > 0) {
            cells.push({ kind: 'xbox', label, name: 'TRACK ' + (t + 1) + ' > TRACK ' + _dest, text: 'ROUTED' });
            continue;
        }
        if (!hasPos || !(v >= 0)) { cells.push({ kind: 'blank', label }); continue; }
        /* A MIDI track's volume reads as its CC value (0..127), not a gain. */
        const cell = { label, name: 'TRACK ' + (t + 1) + ' ' + mode.label,
                       text: (isMidi && mode.key === 'volume') ? String(Math.round((v / mode.max) * 127))
                                                              : String(mode.fmt(v)).toUpperCase() };
        /* The strip is automatable (2026-09-04): the circle, from the first
         * of its targets (a multi-slot track's slots move together). */
        const _tgs = sessStripTargets(S, t, mode.key);
        if (_tgs.length) {
            const st = automationStateFor(t, effectiveClip(t), _tgs[0].target);
            if (st) cell.auto = st.active ? 'auto' : 'auto-off';
        }
        if (mode.widget === 'arcbip') {
            /* -1..+1 around centre, which is what the bipolar arc draws from. */
            cell.kind = 'arcbip';
            cell.signed = (v - 0.5) * 2;
        } else {
            cell.kind = mode.widget;          /* 'vbar' (level) or 'arc' (sends) */
            cell.norm = mode.max > 0 ? v / mode.max : 0;
        }
        cells.push(cell);
    }
    if (mode.widget === 'vbar') { drawSessionFaderRow(cells, mode); return; }

    /* Pan / sends: the kit grid of arcs, but WITHOUT drawKitPage's floating
     * zoom box (Josh: "we can lose the big knob pop-ups for pan and sends").
     * On a param bank that box is the read-out; here it is noise — it covers
     * three of the eight tracks the page exists to compare, to magnify a number
     * the header is already showing. So the header carries the value instead,
     * exactly as the fader row does, and all eight arcs stay visible.
     *
     * The enum overlay goes with it: these cells have no options, so it would
     * draw nothing anyway — calling neither is clearer than relying on that. */
    const t = S.knobTouched;
    const touched = (t >= 0 && cells[t] && cells[t].name) ? cells[t] : null;
    if (touched) drawKitTouchedHeader(touched.name + '  ' + touched.text);
    else drawBankHeading(mode.label, false);
    drawKitCells(cells, t);
    drawKitHintRow(MV_FOOTER_Y, sessionMixerHints());
}
/* The session mixer pages wear the bank-card chassis (Josh, 2026-09-05: "aligned
 * with track bank UI organization and aesthetics"): the glyph header, the kit
 * cells, and the footer canon — the jog walks the banks, Back leaves. A click on
 * these pages does nothing (only the gateway takes one), so no CLK pair. */
function sessionMixerHints() {
    return [['JOG', 'BANK'], ['BACK', 'OUT']];
}

/* Levels get their OWN layout: eight tall faders in one row, not the 4x2 kit
 * grid. A mixer is read by comparing heights across tracks, and that comparison
 * only works when the strips are side by side on one axis — split over two rows
 * you are comparing four faders with four other faders somewhere else.
 * The kit grid stays right for pan and the sends, where each cell is a small
 * arc that is legible at 32px and meaningless at 16.
 *
 * 8 columns x 16px = the full 128. The fader is 8px wide, centred, leaving 4px
 * of air each side so adjacent strips never touch. A unity tick sits at the
 * halfway mark (levels are 0..2x, so unity is mid-throw by construction — see
 * SLOT_LEVEL_MAX) because "am I above or below unity" is the question a mixer
 * is actually asked. */
function drawSessionFaderRow(cells, mode) {
    const t = S.knobTouched;
    const touched = (t >= 0 && cells[t] && cells[t].name) ? cells[t] : null;
    if (touched) drawKitTouchedHeader(touched.name + '  ' + touched.text);
    else drawBankHeading(mode.label, false);
    drawKitHintRow(MV_FOOTER_Y, sessionMixerHints());

    /* BOT/LBL_Y moved up 7 rows on 2026-09-05 so the hint footer (row 57) fits
     * under the labels, as on every other bank card. */
    const COLW = 128 / 8, FW = 8, TOP = 14, BOT = 47, LBL_Y = 49;
    const unity = mode.max > 0 ? (1.0 / mode.max) : -1;
    /* TURNING is what asks for a number. The strip being moved swaps its track
     * number for its VALUE and swaps back once the turn goes quiet; touch alone
     * keeps the label, which is what tells you WHICH strip you are on.
     * (Josh: "turn initiates value display, touch falls back to track label".) */
    const lk = S.sessVolLastKnob;
    /* Liveness is the PHYSICAL TOUCH, not a timer: the value shows while the
     * knob is held and the number is back the instant you let go (Josh). A
     * timeout left the reading hanging around after the hand had moved on, which
     * makes the row look stale rather than live.
     *
     * `knobTouched` persists for the whole hold (see the note above drawKitPage),
     * so this is exactly "while my finger is on it". A turn that somehow arrives
     * with no touch — injected MIDI, a knob not reporting capacitance — simply
     * shows no value; the page and its header still update, so nothing is lost. */
    const valueLive = lk >= 0 && S.knobTouched === lk;

    for (let i = 0; i < cells.length && i < 8; i++) {
        const c = cells[i];
        const cx = Math.round(i * COLW);
        const fx = cx + Math.round((COLW - FW) / 2);
        if (c.kind === 'xbox') {
            /* The routed track's inert mark: a cross where its fader would
             * stand, drawn (not framed) so it cannot be read as a fader at
             * zero — see drawSessionMixerPage. */
            const xa = fx + 1, xb = fx + FW - 2, ya = TOP + 12, yb = BOT - 12;
            plotLine(xa, ya, xb, yb, 1);
            plotLine(xb, ya, xa, yb, 1);
        } else if (c.kind !== 'blank')
            drawVFader(fx, TOP, FW, BOT - TOP, c.norm || 0, unity);
        if (valueLive && lk === i && c.kind !== 'blank' && c.kind !== 'xbox') continue;  /* drawn last */
        const lbl = String(i + 1);
        const lw = mvWidth(lbl);
        const lx = cx + Math.round((COLW - lw) / 2);
        if (t === i) {
            fill_rect(cx, LBL_Y - 1, Math.round(COLW), 9, 1);
            mvPrint(lx, LBL_Y, lbl, 0);
        } else {
            mvPrint(lx, LBL_Y, lbl, 1);
        }
    }

    /* The live value goes on LAST and on TOP. Centred on a 16px column it will
     * overhang for the wider readings ("1.25X"), so it needs to be painted over
     * its neighbours' numbers rather than under them — which only works if every
     * neighbour is already down. Its own patch of background is cleared first so
     * the overhang stays readable. */
    if (valueLive && lk >= 0 && lk < cells.length && cells[lk] && cells[lk].kind !== 'blank') {
        const txt = cells[lk].text || '';
        const w = mvWidth(txt);
        let x = Math.round(lk * COLW) + Math.round((COLW - w) / 2);
        if (x < 0) x = 0;
        if (x + w > 128) x = 128 - w;
        /* HIGHLIGHTED while live: inverted, the same "this one is active" idiom
         * the touched label strip uses. It has to win against seven other
         * numbers on the same line and it is transient, so plain white-on-black
         * left it reading as just another label. The 1px bleed around the text
         * is what makes it a block rather than an outline. */
        fill_rect(x - 1, LBL_Y - 1, w + 2, 9, 1);
        mvPrint(x, LBL_Y, txt, 0);
    }
}

/* Shared canvaskit page entry: touched non-blank cell inverts the header to
 * its full param name (label strip below swaps to the value); resting state
 * goes through the standard heading helpers (C- blink, page bar, alt arrow). */
/* The hint row for a TRACK-VIEW bank card.
 *
 * ⭑⭑ EVERY PAIR NAMES A GESTURE THE INPUT CODE ACTUALLY IMPLEMENTS, and the
 * two conditional ones are conditional because the gesture is:
 *
 *   JOG  BANK    unshifted jog turn opens and scrolls the bank picker
 *                (_onCC_jog, MoveMainKnob branch). Always live.
 *   CLK  STEPS   plain jog click toggles the Arp-Steps interval overlay --
 *                MELODIC tracks only, banks 4 and 5, which is exactly how the
 *                handler is gated.
 *   CLK  ALT     otherwise, plain jog click toggles sticky alt-param mode --
 *                but ONLY on a bank that HAS alt params (bankHasAltParams).
 *                On a bank without them the click falls through and does
 *                nothing, so there is no hint to give.
 *   BACK OUT     a Back TAP rises one level: it clears alt mode, then the
 *                latch/bank display, then leaves the card. OUT and not EXIT --
 *                see MV_FOOTER_CANON, where the two are deliberately different
 *                words for different destinations.
 *
 * ⚠ THE WORDS ARE CUT TO THE 86px FLOW BUDGET (see hintPairWidth). JOG BANK +
 * CLK ALT is 80 and both show; CLK STEP is 42 where "STEPS" is 47, and at 47
 * the pair before it is the one that disappears.
 *
 * ⭑ SHFT TRK WAS DROPPED 2026-08-30 (Josh): Shift+jog steps the active track in
 * EVERY view, so it is a property of the instrument rather than of this page,
 * and the footer is for what is true HERE. It never fit the budget anyway. Its
 * removal is also what buys the page-specific pairs room to survive the fit
 * rule.
 *
 * ⚠ NOT HINTED, deliberately, though they exist: Delete+jog (bank resets),
 * Shift+Delete+jog, Shift+jog-click (latch). They are destructive or
 * modal-adjacent chords, the row holds three pairs before BACK claims the
 * right edge, and a hint that has to be dropped by the fit rule is worse than
 * one never offered. Most-important-first is the ordering contract; these are
 * not the most important three.
 *
 * ⚠ The row is CHROME. Nothing here reads or changes input state. */
function bankPageHints(bank) {
    /* ⭑ While a step is HELD the jog means something else (spec §2): on any
     * other bank a right turn REVEALS the step's page — so the pair says so,
     * in the same slot, and JOG BANK (which the hold suspends) is not shown.
     * On the STEP bank itself the jog does nothing under a hold: no pair. */
    const held = S.heldStep >= 0;
    const hints = held ? (bank === BANK_STEP ? [] : [['JOG', 'STEP']]) : [['JOG', 'BANK']];
    const drum = S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM;
    if (!drum && (bank === 4 || bank === 5)) hints.push(['CLK', 'STEP']);
    else if (bankHasAltParams(S.activeTrack, bank)) hints.push(['CLK', 'ALT']);
    hints.push(['BACK', 'OUT']);
    return hints;
}

function drawKitPage(name, cells, inverted, footer) {
    /* BANK's map: this is davebox's own track-view bank card, which has no page
     * strip and so starts its grid a row higher. Must be first — every kit draw
     * call below reads the layout bindings. */
    kitUseLayout('bank');
    const t = S.knobTouched;
    const touched = t >= 0 && cells[t] && cells[t].name ? cells[t] : null;
    if (touched) drawKitTouchedHeader(touched.name);
    else (inverted ? drawBankHeadingInverted : drawBankHeading)(name, false);
    /* ⚠ NO BANK-POSITION INDICATOR HERE, and it is a decision rather than an
     * omission. One was wired in on 2026-08-30 and taken straight back out:
     * "let's just get rid of the indicator row altogether." The jog opens a
     * NAMED picker, so the card already says which bank it is in words, and a
     * position strip repeats that in a form you have to count.
     * bankCyclePos() still exists for sound mode's param pages. */
    drawKitCells(cells, t);
    /* ⭑ NO value zoom on a bank page (Josh, 2026-08-26: "i've been meaning to
     * retire that"). Turning a knob widget no longer throws a magnified copy of
     * the cell over the middle of the screen — the cell itself already updates,
     * and the header already swaps to the param's full name, so the zoom was
     * covering six other params to repeat what two of them were saying.
     * The ENUM/picker overlays stay: those show a scrolling list of options that
     * is not on screen otherwise, which is a different job. */
    const _ovi = enumOverlayIdx(t);
    /* Stand the hints down under the picker — it is a modal that states its own
     * affordance, and a half-covered hint row is worse than none. See
     * drawKitBankPage, which makes the same call for the same reason. */
    if (footer && !enumOverlayWouldDraw(cells, _ovi)) {
        drawKitHintRow(MV_FOOTER_Y, footer);
    }
    drawKitEnumOverlay(cells, _ovi);
}

/* (drawAltArrow — the alt-param chevron — retired 2026-09-05 with the bank
 * header layout; alt mode itself is unchanged.) */

/* (drawStepEditHeader retired 2026-07-18 — the step editors now use the
 * canvaskit chrome via drawStepEditKitPage.) */

/* Per-step trig-condition formatters (v=34).
 *   formatStepIter(raw):  0 -> "—"; else "{idx}:{len}" with raw=(len<<4)|idx
 *   formatStepRand(raw):  0 -> "—" (100%); else "{n}%"
 *   formatStepRatch(raw): 0|1 -> "—"; else "x{n}" */
function formatStepIter(raw) {
    if (!raw) return '--';
    /* colon, not a slash: it isn't a fraction (it's "fire on pass 2 of 4"),
     * and the tight colon leaves room for both digits in the big read-out. */
    return (raw & 0xF) + ':' + ((raw >> 4) & 0xF);
}
function formatStepRand(raw) {
    if (!raw) return '--';
    return raw + '%';
}
function formatStepRatch(raw) {
    if (raw < 2) return '--';
    return 'x' + raw;
}

function drawMetroIndicator() {
    /* Match the Global Menu / Shift+Step6 popup wording exactly (one source of
     * truth): Off / Cnt-In / Play / Always. */
    const METRO_LABELS = [null, 'Cnt-In', 'Play', 'Always'];
    const label = METRO_LABELS[S.metronomeOn];
    if (label) {
        /* Stock face (Josh, 2026-09-05: "replace any mcu font with the little
         * stock font" on both overviews); row 2 of the overview sits at y=19. */
        const tx = 8;
        const tw = ovwWidth(label);
        fill_rect(4, 19, 2, 2, 1);           /* left dot */
        ovwPrint(tx, 17, label, 1);
        fill_rect(tx + tw + 2, 19, 2, 2, 1); /* right dot */
    }
    if (S.sessionView) {
        /* ⚠ Was a parallel 4-entry literal — the gateway made sessKnobMode
         * reach 4, modeNames[4].length threw, and the WHOLE session draw died
         * right after this indicator (Josh, on device 2026-09-01: 'an
         * incomplete session view... only the count-in indicator'). Read the
         * mode table itself, the one owner; the gateway carries 'FX'. */
        const _sm = SESS_KNOB_MODES[S.sessKnobMode];
        const ml = (_sm && _sm.label) || 'VOLUME';
        /* "< SEND A >", underlined (Josh, 2026-09-05): the arrows say this is what
         * the jog scrolls, the rule matches the key/scale rule in track view.
         * The full label, not the short one — there is room beside the metro. */
        const lab = '< ' + ml + ' >';
        const lw = ovwWidth(lab), lx = 128 - 4 - lw;
        ovwPrint(lx, 17, lab, 1);
        fill_rect(lx, 23, lw, 1, 1);
    }
    /* Velocity / Fixed/Adaptive indicators (track view only, row 2 at y=19,
     * right-aligned in the stock face; Fix/Adap hugs the right edge, the
     * velocity word sits mid-row) */
    if (!S.sessionView) {
        const t  = S.activeTrack;
        const ac = (!S.playing && S.trackQueuedClip[t] >= 0) ? S.trackQueuedClip[t] : S.trackActiveClip[t];
        const _isDrum7   = S.trackPadMode[t] === PAD_MODE_DRUM;
        const _isEmpty7  = _isDrum7 ? !S.drumClipNonEmpty[t][ac] : !S.clipNonEmpty[t][ac];
        const _manualL7  = _isDrum7 ? S.drumLaneLengthManuallySet[t] : S.clipLengthManuallySet[t][ac];
        /* Velocity input indicator (between metro and fixed/adap) */
        ovwPrint(67, 17, fmtVelOverride(S.trackVelOverride[t]), 1);
        const _fa = (_isEmpty7 && !_manualL7) ? 'Adap' : 'Fixed';   /* the full word fits beside LIVE (Josh, 2026-09-05) */
        ovwPrint(128 - 4 - ovwWidth(_fa), 17, _fa, 1);
    }
}

const PERF_MOD_NAMES = [
    'Oct↑','Oct↓','Sc↑','Sc↓','5th','Triton','Drift','Storm',
    'Decrsc','Swell','Cresc','Pulse','Sdchn','Stac','Lgto','RmpG',
    '½time','3Skip','Phnm','Sprs','Gltch','Stggr','Shfl','Back',
];

function midiNoteName(n) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return names[n % 12] + (Math.floor(n / 12) - 1);
}

/* True when (track-type, bank) exposes alt params reachable via S.altMode.
 * Melodic: CLIP(0), DELAY(3), AUTO/CC(6 — CC-assign). Drum: DRUM LANE(0),
 * REPEAT GROOVE(5), AUTO(6), ALL LANES(7). Keep in sync with the
 * shiftHeld→altMode migration sites. */
/* Bank header label. Identical to BANKS[bank].name except a Conductor track
 * relabels bank 0 (CLIP) to "CONDUCT" — the CLIP bank is reused as the Conduct
 * bank. Does NOT rename BANKS[0] globally (other track types keep "CLIP"). */
/* One source for what a bank is CALLED — see bankDisplayName in ui_pure. The
 * drum aliases used to live inline in the drum render branch below, which is
 * how the picker ended up listing different names than the header. */
function bankHeaderName(t, bank) {
    return bankDisplayName(S.trackPadMode[t], bank);
}

/* ------------------------------------------------------------------ */
/* Canvaskit cell mapping                                               */
/* ------------------------------------------------------------------ */

/* Formatters whose domain is a browsable option list (enum square + the
 * scrolling overlay while touched). fmtBool is special-cased to the hbar. */
const KIT_ENUM_FMTS = [fmtPlayDir, fmtArpStyle, fmtArpSteps, fmtRevStyle];

/* Every set whose values are true n/m fractions — resolutions, arp rates,
 * gate rates, input quantize, delay times. They render as STACKED fractions
 * (numerator over rule over denominator, triplet/dotted mark beside the
 * denominator). Members of these sets that AREN'T fractions ("1bar", "--")
 * fall through to the big read-out inside drawFracStack, so a set reads as
 * one hierarchy rather than two competing widgets. */
const KIT_FRAC_FMTS = [fmtDly, fmtRes, fmtArpRate, fmtGateMod, fmtDiq];

/* Numeric lengths that are NOT fractions — LEN_LABELS is "--/.25/.50/1/2/16",
 * decimals and counts. These keep the big read-out; stacking a decimal makes
 * no sense. (Step-edit Length and Iteration likewise: steps and "2:4" aren't
 * n/m fractions, so neither stacks.) */
const KIT_RATE_FMTS = [fmtLen];

/* Full option names for the picker overlays (the widget squares keep the
 * short forms from the fmt* tables). */
const KIT_DIR_NAMES = ['Forward', 'Backward', 'Ping Pong', 'Rev Ping Pong'];
const KIT_ARP_STYLE_NAMES = ['Off', 'Up', 'Down', 'Up/Down', 'Down/Up',
                             'Converge', 'Diverge', 'Ordered', 'Random', 'Rnd Order'];

/* knobDef (BANKS entry) + current value -> canvaskit cell descriptor.
 * Widget choice mirrors the kit's cell constructors: toggles -> hbar,
 * option lists -> enum square, small counts / small signed / one-shot
 * actions -> value square, signed continuous -> center-tick arc,
 * unsigned continuous -> arc. Stubs -> blank. */
/* Step-edit note length in steps. Trailing zeros are trimmed ("0.50" -> "0.5")
 * so more lengths clear the big read-out's 32px cell — with the tight decimal
 * point, everything under 10 steps now fits. */
export function fmtStepLen(steps) {
    if (steps % 1 === 0) return steps.toFixed(0);
    return steps.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/* An "off"/null/empty value always reads as "--" in a big numeric read-out —
 * the word "OFF" competes with the numbers around it and, on a picker, with
 * the real named options. Applies to the value AND its option list, so the
 * scrolling picker matches the widget. */
const _offDash = (s) => {
    const t = s == null ? '' : String(s);
    return (t === '' || t.toLowerCase() === 'off') ? '--' : t;
};

/* Full formatted option list for a discrete numeric knob (min..max), so a
 * value-box param can drive the picker overlay just like a named enum. */
function _discreteOpts(knob) {
    const opts = [];
    for (let i = knob.min; i <= knob.max; i++) opts.push(_offDash(knob.fmt(i)));
    return opts;
}

function kitCellForKnob(knob, val) {
    if (!knob || !knob.abbrev) return { kind: 'blank', label: '' };
    const v = val | 0;
    const text = knob.fmt(v);
    const base = { label: knob.abbrev, name: knob.full, text };
    /* fmtBool is literally ON/OFF, so it is the pill by the rule — but it is
     * asked rather than assumed, so that renaming those two strings moves the
     * widget with them instead of leaving a pill on a pair of words. */
    if (knob.fmt === fmtBool) {
        base.kind = isBooleanPair(fmtBool(1), fmtBool(0)) ? 'pill' : 'enumsq';
        base.norm = v ? 1 : 0;
        return base;
    }
    if (knob.fmt === fmtLgto) { base.kind = 'action'; base.oneWay = true; return base; }
    /* ⭑⭑ THE BUTTON IS FOR FIRE-ACTIONS ONLY, and `scope: 'action'` is not that
     * test. Three params carry that scope and exactly ONE is a trigger:
     *
     *   Lgto   fmtLgto() returns '->' unconditionally — no value, one-shot,
     *          oneWay. A real button, and it keeps the button (above).
     *   Strch  its cell holds the last TURN DIRECTION (-1 / 0 / +1, reset to 0
     *          at rest by ui_dsp_bridge) and reads '/2' | '1x' | 'x2'.
     *   Shift  an ACCUMULATING signed counter (`+= dir`), reads '+0' | '-3'.
     *
     * The last two are signed VALUES, and a pushbutton is the wrong picture for
     * them (Josh, 2026-08-29: "stretch and shift don't make sense as trigger
     * button widgets bc they're bipolar"). A button says "press me and
     * something happens"; these say "here is where you have got to".
     *
     * ⚠ NOT arcbip, though they ARE bipolar. An arc needs a RANGE to point
     * along and these declare min = max = 0 — the value is a running total the
     * DSP owns, not a position on a scale, so there is nothing to normalise
     * against and an arc would be inventing bounds. The signed big number shows
     * the number and claims nothing about limits, which is what is true.
     *
     * ⚠ The value is now PERSISTENT, where the old "< >" square revealed it
     * only while the knob was touched. That was the point of the old widget and
     * it is what made these read as buttons; showing it is the change.
     * (Octave Shift was already a value box below, for the same reason.)
     *
     * ⚠ NOTHING ABOUT THE GESTURE CHANGES — same scope, same sensitivity, same
     * lock, handler untouched. This is the DRAWING only. */
    if (knob.scope === 'action') { base.kind = 'valsq'; return base; }
    if (knob.fmt === fmtPlayDir) {
        base.kind = 'dirsq';
        base.options = KIT_DIR_NAMES;
        base.sel = v;
        return base;
    }
    if (KIT_FRAC_FMTS.indexOf(knob.fmt) >= 0) {
        base.kind = 'frac'; base.text = _offDash(text);
        base.options = [];
        for (let i = knob.min; i <= knob.max; i++) base.options.push(_offDash(knob.fmt(i)));
        base.sel = v - knob.min;
        return base;
    }
    if (KIT_RATE_FMTS.indexOf(knob.fmt) >= 0) {
        base.kind = 'valsq'; base.text = _offDash(text);
        base.options = [];
        for (let i = knob.min; i <= knob.max; i++) base.options.push(_offDash(knob.fmt(i)));
        base.sel = v - knob.min;
        return base;
    }
    if (KIT_ENUM_FMTS.indexOf(knob.fmt) >= 0) {
        base.kind = 'enumsq';
        if (knob.fmt === fmtArpStyle) {
            base.options = KIT_ARP_STYLE_NAMES;
        } else {
            base.options = [];
            for (let i = knob.min; i <= knob.max; i++) base.options.push(knob.fmt(i));
        }
        base.sel = v - knob.min;
        return base;
    }
    if (knob.min < 0) {
        /* Discrete signed values worth showing exactly — octave shift (±4) and
         * semitone offsets/intervals (±24: Note Offset, Harmony 1/2/3, Pitch
         * Feedback) — get a persistent value box. Wider signed ranges (±127
         * velocities) stay a bipolar arc where the sweep reads better than digits. */
        if (knob.max <= 24) {
            base.kind = 'valsq'; base.text = _offDash(text);
            base.options = _discreteOpts(knob); base.sel = v - knob.min;
            return base;
        }
        base.kind = 'arcbip';
        const halfR = Math.max(1, Math.max(knob.max, -knob.min));
        base.signed = Math.max(-1, Math.min(1, v / halfR));
        return base;
    }
    if (knob.fmt === fmtPlain && knob.max <= 16) {   /* counts (Repts) */
        base.kind = 'valsq'; base.text = _offDash(text);
        base.options = _discreteOpts(knob); base.sel = v - knob.min;
        return base;
    }
    if (knob.fmt === fmtPitchRnd) {                  /* Pitch Random 0..24 ("OFF" at 0) */
        base.kind = 'valsq'; base.text = _offDash(text);
        base.options = _discreteOpts(knob); base.sel = v - knob.min;
        return base;
    }
    base.kind = 'arc';
    base.norm = Math.max(0, Math.min(1, (v - knob.min) / ((knob.max - knob.min) || 1)));
    return base;
}

/* ------------------------------------------------------------------ */
/* Display                                                              */
/* ------------------------------------------------------------------ */

/* Pure graphical 8×16 grid (128×64 OLED). 8 columns = tracks, 16 rows = scenes.
 * Each cell is 16×4 px. Cell states:
 *   active clip on active track → blink (solid ↔ center bar)
 *   active clip on other track  → solid fill (16×4)
 *   has content, not active     → center bar (14×2 at x+1,y+1)
 *   empty                       → nothing */
/* The session banner's wordmark, set in the BANK-HEADING font — the same 6x6
 * face drawKitHeader uses, drawn the same way it draws: ONE hdrPrint of the
 * whole string, centred on its measured width. That font carries a true
 * lowercase 'd' and an 'x' added for this very mark, so the casing survives.
 *
 * ⚠ It was briefly drawn letter-by-letter into per-character slots, to stop the
 * transport animation shifting the word. That was wrong twice over: the face is
 * FIXED-ADVANCE, so a swapped glyph cannot move anything and the slots bought
 * nothing — and each slot was sized with hdrWidth(oneChar), which returns the
 * advance MINUS the trailing gap (6, not 7). Every letter lost a pixel and the
 * word closed up: "squashed and blurry" (Josh, on hardware). Measure a STRING
 * with hdrWidth, never a character as if it were a cell. */
const MARK_BAR_H = 12;

function drawWordmark(mark) {
    hdrPrint(Math.round((128 - hdrWidth(mark)) / 2), 3, mark, 0);
}

function drawSessionOverview() {
    /* White background everywhere; current scene group band stays black. */
    fill_rect(0, 0, 128, 64, 1);
    const bandY = Math.floor(S.sceneRow / 4) * 16;
    fill_rect(0, bandY, 128, 16, 0);

    /* Horizontal grid lines: white inside band, black outside. */
    for (let s = 0; s < NUM_CLIPS; s++) {
        const ly = s * 4;
        fill_rect(0, ly, 128, 1, (ly >= bandY && ly < bandY + 16) ? 1 : 0);
    }

    /* Vertical grid lines: three segments per column — black/white/black. */
    for (let t = 0; t < NUM_TRACKS; t++) {
        const lx = t * 16;
        if (bandY > 0)        fill_rect(lx, 0,          1, bandY,             0);
                              fill_rect(lx, bandY,      1, 16,                1);
        if (bandY + 16 < 64) fill_rect(lx, bandY + 16, 1, 64 - bandY - 16,  0);
    }

    /* Cell content: white (1) inside band, black (0) outside. */
    const blinkOn = S.flashEighth;
    for (let t = 0; t < NUM_TRACKS; t++) {
        const x  = t * 16 + 1;
        const ac = S.trackActiveClip[t];
        for (let s = 0; s < NUM_CLIPS; s++) {
            const y      = s * 4 + 1;
            const color  = (s >= S.sceneRow && s < S.sceneRow + 4) ? 1 : 0;
            const hasData    = S.clipNonEmpty[t][s];
            const isActive   = (s === ac);
            const isPlaying  = (isActive && S.trackClipPlaying[t]);
            if (isPlaying && hasData) {
                if (blinkOn) fill_rect(x + 1, y + 1, 13, 1, color);
            } else if (isActive && hasData) {
                fill_rect(x + 1, y + 1, 13, 1, color);
            } else if (S.overviewCache[t][s]) {
                fill_rect(x + 6, y + 1, 2, 1, color);
            }
        }
    }
}

/* Track-number row: active track has a box (1px border + 1px pad around number).
 * Muted = inverted. Soloed = blink. */
/* THE OVERVIEW'S LOWER HALF (Josh, 2026-09-05), shared by the track overviews
 * and the session view: the track row, the scene letters in the STOCK face, and
 * the hint footer on row 57 — which is why the position bar moved up to 52.
 * Josh, 2026-09-05 (second pass): the two rows under the header and the clip
 * letters use the SMALL HEADER FACE (font4x5) — only the track numbers keep the
 * stock 5x7. Rows, top to bottom: header 0-6 · info 9-13 (+rule 15) · row 2
 * 17-21 · track boxes 27-38 · scene letters 41-45 · position bar 50-53 ·
 * footer 57-63. */
export const OVW_TRACK_ROW_Y = 29, OVW_SCENE_Y = 41;
/* The small header face has NO lowercase (drawKitHeader uppercases for the same
 * reason) — so every overview string goes through these two. */
function ovwPrint(x, y, str, color) { fontPrint4x5(x, y, String(str).toUpperCase(), color); }
function ovwWidth(str) { return fontWidth4x5(String(str).toUpperCase()); }
function drawOverviewTracks(hints) {
    drawTrackRow(OVW_TRACK_ROW_Y);
    for (let t = 0; t < NUM_TRACKS; t++) {
        const cx = t * 16 + 5;
        const ac = S.trackActiveClip[t];
        const hasData = S.trackPadMode[t] === PAD_MODE_DRUM
            ? S.drumClipNonEmpty[t][ac]
            : S.clipNonEmpty[t][ac];
        const isActive = (S.trackClipPlaying[t] || S.trackWillRelaunch[t] || (S.trackQueuedClip[t] >= 0)) && hasData;
        /* the letter is centred under its track number: 4x5 glyphs are 4 wide
         * where the 5x7 digits are 5, hence the half-pixel nudge to cx */
        if (isActive) {
            fill_rect(cx - 1, OVW_SCENE_Y - 2, 7, 9, 1);
            ovwPrint(cx, OVW_SCENE_Y, SCENE_LETTERS[ac], 0);
        } else {
            ovwPrint(cx, OVW_SCENE_Y, SCENE_LETTERS[ac], 1);
        }
    }
    drawKitHintRow(MV_FOOTER_Y, hints);
}
/* What the jog does at rest on each overview — the footer says only what is
 * true HERE (the canon): in track view it walks the banks and a click opens the
 * card; in session view it walks the mixer mode and a click latches the mixer. */
function overviewHints() {
    /* CLK says EDIT, not BANK — the jog pair already names the bank (Josh); the
     * MENU pair names the OTHER overview a Note/Session tap switches to (Josh,
     * 2026-09-05: "MENU:[TRACK/GRID]"). */
    /* TRK, not TRACK: MENU TRACK is 53px and the row has 45 left (measured). */
    return [['JOG', 'BANK'], ['CLK', 'EDIT'], ['MENU', S.sessionView ? 'TRK' : 'SESS']];
}

function drawTrackRow(y) {
    const soloBlinkOn = Math.floor(S.clockMs / 220) % 2 === 0;
    for (let _t = 0; _t < NUM_TRACKS; _t++) {
        const cx = _t * 16 + 5;
        const bx = _t * 16 + 3;
        const by = y - 2;
        const bw = 10, bh = 12;
        const isActive = (_t === S.activeTrack);
        if (S.trackMuted[_t]) {
            if (soloBlinkOn) print(cx, y, String(_t + 1), 1);
            if (isActive) {
                fill_rect(bx, by,      bw, 1,  1);
                fill_rect(bx, by+bh-1, bw, 1,  1);
                fill_rect(bx, by,      1,  bh, 1);
                fill_rect(bx+bw-1, by, 1,  bh, 1);
            }
        } else if (S.trackSoloed[_t]) {
            fill_rect(bx, by, bw, bh, 1);
            print(cx, y, String(_t + 1), 0);
        } else {
            print(cx, y, String(_t + 1), 1);
            if (isActive) {
                fill_rect(bx, by,      bw, 1,  1);
                fill_rect(bx, by+bh-1, bw, 1,  1);
                fill_rect(bx, by,      1,  bh, 1);
                fill_rect(bx+bw-1, by, 1,  bh, 1);
            }
        }
    }
}

/* Convert a PERF_MOD_NAMES entry to mcufont-safe ASCII (no arrows / fractions). */
function _modAscii(name) {
    return name.replace('↑', '+').replace('↓', '-').replace('½', 'Hf');
}

/* Footer indicator chip: filled-rect when active, outline when inactive.
 * Returns the chip's width so the caller can advance x. */
function _perfChip(x, y, label, active) {
    const w = label.length * 6 + 3;
    if (active) {
        fill_rect(x, y, w, 9, 1);
        pixelPrint(x + 2, y + 2, label, 0);
    } else {
        /* hollow outline */
        fill_rect(x,         y,     w, 1, 1);
        fill_rect(x,         y + 8, w, 1, 1);
        fill_rect(x,         y,     1, 9, 1);
        fill_rect(x + w - 1, y,     1, 9, 1);
        pixelPrint(x + 2, y + 2, label, 1);
    }
    return w;
}

function drawPerfModeOled() {
    clear_screen();
    const activeMods = S.perfModsToggled | S.perfModsHeld;

    /* ── Header bar (y 0-11): preset name or "PERFORMANCE" ── */
    fill_rect(0, 0, 128, 12, 1);
    let title;
    if (S.perfRecalledSlot >= 0) {
        const fp = PERF_FACTORY_PRESETS[S.perfRecalledSlot];
        title = fp ? fp.name : ('SLOT ' + (S.perfRecalledSlot + 1));
    } else {
        title = 'PERFORMANCE';
    }
    print(4, 3, title, 0);

    /* ── Body (y 14-49): action popup → mod popup → mods list ── */
    if (S.actionPopupEndTick >= 0 && S.clockMs <= S.actionPopupEndTick && S.actionPopupLines.length > 0) {
        const _n = S.actionPopupLines.length;
        if (_n >= 4) {
            print(4, 14, S.actionPopupLines[0], 1);
            print(4, 25, S.actionPopupLines[1], 1);
            print(4, 36, S.actionPopupLines[2], 1);
            print(4, 47, S.actionPopupLines[3], 1);
        } else if (_n === 3) {
            print(4, 17, S.actionPopupLines[0], 1);
            print(4, 29, S.actionPopupLines[1], 1);
            print(4, 41, S.actionPopupLines[2], 1);
        } else if (_n === 2) {
            print(4, 20, S.actionPopupLines[0], 1);
            print(4, 32, S.actionPopupLines[1], 1);
        } else {
            print(4, 26, S.actionPopupLines[0], 1);
        }
    } else if (S.perfModPopupEndTick >= 0 && S.clockMs <= S.perfModPopupEndTick && S.perfModPopupName) {
        const px = Math.floor((128 - S.perfModPopupName.length * 6) / 2);
        print(px < 0 ? 0 : px, 26, S.perfModPopupName, 1);
    } else {
        S.perfModPopupEndTick = -1;
        const activeNames = [];
        for (let i = 0; i < PERF_MOD_NAMES.length; i++)
            if ((activeMods >> i) & 1) activeNames.push(_modAscii(PERF_MOD_NAMES[i]));
        if (activeNames.length === 0) {
            pixelPrint(4, 24, 'no mods active', 1);
            pixelPrint(4, 34, 'tap pad to engage', 1);
        } else {
            /* Wrap into up to 4 lines, ~20 chars per line at 6px each. */
            const MAX_CHARS = 20;
            const MAX_LINES = 4;
            const lines = [];
            let cur = '';
            for (let i = 0; i < activeNames.length; i++) {
                const sep  = cur ? '  ' : '';
                const next = cur + sep + activeNames[i];
                if (next.length > MAX_CHARS && cur) {
                    lines.push(cur);
                    if (lines.length >= MAX_LINES) { cur = ''; break; }
                    cur = activeNames[i];
                } else {
                    cur = next;
                }
            }
            if (cur && lines.length < MAX_LINES) lines.push(cur);
            for (let li = 0; li < lines.length; li++) {
                pixelPrint(4, 16 + li * 8, lines[li], 1);
            }
        }
    }

    /* ── Footer (y 53-61): mode chips + rate ── */
    const fy = 53;
    let fx = 2;
    fx += _perfChip(fx, fy, 'Hold',  S.perfHoldPadHeld || S.perfStickyLengths.size > 0) + 3;
    fx += _perfChip(fx, fy, 'Sync',  S.perfSync) + 3;
    fx += _perfChip(fx, fy, 'Latch', S.perfLatchMode) + 3;

    /* Rate (right-aligned, only when a loop length is active) */
    if (S.perfStack.length > 0) {
        const RATE_LABELS = ['1/32','1/16','1/8','1/4','1/2'];
        const top = S.perfStack[S.perfStack.length - 1];
        const lab = RATE_LABELS[top.idx];
        const w   = lab.length * 6 + 3;
        const rx  = 128 - w - 2;
        fill_rect(rx, fy, w, 9, 1);
        pixelPrint(rx + 2, fy + 2, lab, 0);
    }
}

/* Post-capture tempo chooser (Move-style). A big scaled tempo flanked by "< >"
 * (wheel to change), and a BAR view — the loop drawn as numbered bars with
 * bright dividers, the notes, the loop end, and a live playhead sweeping at the
 * selected tempo — so the user sees where the bar breaks and loop point fall
 * relative to what they hear. Jog click keeps the tempo. */
function drawTempoSelect() {
    clear_screen();
    const t    = S.tempoSelectTrack;
    const c    = S.tempoSelectClip;
    const idx  = S.tempoSelectIdx | 0;
    const bpms = S.tempoSelectBpms;
    const isDrum = S.trackPadMode[t] === PAD_MODE_DRUM;

    /* "< 120 bpm >" (empty-session tempo) or "< 2 bars >" (warp-to-fit) —
     * shared value line (same look as the tap-tempo screen). */
    drawBpmLine(64, 6, bpms[idx], S.tempoSelectWarp ? 'bars' : 'bpm');
    if (S.tempoSelectWarp) pixelPrintC(64, 22, 'Shift = Fine adjust', 1);

    /* BAR view. */
    const BX = 4, BW = 120, BY = 28, BH = 19;
    const len = Math.max(1, (isDrum ? (S.drumLaneLength[t] | 0)
                                    : (S.clipLength[t][c] | 0)) || 16);
    const bars = Math.max(1, Math.round(len / 16));
    rectOutline(BX, BY, BW, BH, 1);
    /* Bar dividers (bright, full height) + faint beat marks. */
    for (let s = 4; s < len; s += 4) {
        const x = BX + Math.round((s / len) * BW);
        if (s % 16 === 0) for (let yy = BY; yy < BY + BH; yy++) set_pixel(x, yy, 1);
        else for (let yy = BY + 2; yy < BY + BH - 2; yy += 3) set_pixel(x, yy, 1);
    }
    /* Bar numbers along the top-inside of each bar segment (if they fit). */
    if (BW / bars >= 10) {
        for (let bi = 0; bi < bars; bi++) {
            const x = BX + Math.round((bi * 16 / len) * BW) + 2;
            print(x, BY + 1, String(bi + 1), 1);
        }
    }
    /* Note ticks (melodic clip, or the active drum lane). */
    const steps = isDrum ? S.drumLaneSteps[t][S.activeDrumLane[t]] : S.clipSteps[t][c];
    if (steps) {
        for (let s = 0; s < len && s < steps.length; s++) {
            if (!steps[s] || steps[s] === '0') continue;
            const x = BX + Math.round((s / len) * BW);
            fill_rect(Math.min(x, BX + BW - 2), BY + BH - 6, 2, 4, 1);
        }
    }
    /* Playhead sweeping at the selected tempo. */
    const cur = isDrum ? (S.drumCurrentStep[t] | 0) : (S.trackCurrentStep[t] | 0);
    const ph  = ((cur % len) + len) % len;
    const px  = BX + Math.round((ph / len) * BW);
    for (let yy = BY; yy < BY + BH; yy++) set_pixel(Math.min(px, BX + BW - 1), yy, 1);

    pixelPrintC(64, 56, 'Click to set', 1);
}

/* Drum-view position bar (bottom strip): loop-window pages, view page solid,
 * playing page outlined, playhead dot, off-window extent ticks. Moved here
 * from ui_leds.mjs in P7 — it is OLED drawing, not LED writing. */
function drawPositionBar(t) {
    const ac     = effectiveClip(t);
    const lsBase = S.clipLoopStart[t][ac] | 0;
    const len    = S.clipLength[t][ac];
    const startPage = lsBase >> 4;
    const winPages  = Math.max(1, Math.ceil(len / 16));
    /* View/play pages are translated into window-relative space so the bar
     * always anchors at the window's first page on the left edge. */
    const viewPage = Math.max(0, Math.min(S.trackCurrentPage[t] - startPage, winPages - 1));
    const cs = S.trackCurrentStep[t];
    const playPage = (S.playing && S.trackClipPlaying[t] && cs >= lsBase && cs < lsBase + len)
                   ? Math.floor((cs - lsBase) / 16) : -1;
    const barY = 50, barH = 4, segGap = 1;   /* 2026-09-05: the hint footer owns row 57 */
    const segW   = Math.max(2, Math.floor((120 - (winPages - 1) * segGap) / winPages));
    const startX = 4;
    for (let pg = 0; pg < winPages; pg++) {
        const x = startX + pg * (segW + segGap);
        if (pg === viewPage) {
            fill_rect(x, barY, segW, barH, 1);
        } else if (pg === playPage) {
            rectOutline(x, barY, segW, barH, 1);
        } else {
            fill_rect(x, barY + barH - 1, segW, 1, 1);
        }
    }
    /* Playhead dot mapped across the window's pixel span (not full 128px). */
    if (S.playing && S.trackClipPlaying[t] && cs >= lsBase && cs < lsBase + len) {
        const winPxW = winPages * (segW + segGap) - segGap;
        const dotX = startX + Math.floor((cs - lsBase) * winPxW / Math.max(1, len));
        const viewSegStart = startX + viewPage * (segW + segGap);
        const onSolid = dotX >= viewSegStart && dotX < viewSegStart + segW;
        fill_rect(dotX, barY, 1, barH, onSolid ? 0 : 1);
    }
    /* Extent markers: small vertical ticks just outside the bar edges to
     * hint that clip content exists before / after the visible window. */
    const steps = S.clipSteps[t][ac];
    let hasLeft = false, hasRight = false;
    for (let s = 0; s < lsBase; s++) if (steps[s] !== 0) { hasLeft = true; break; }
    for (let s = lsBase + len; s < NUM_STEPS; s++) if (steps[s] !== 0) { hasRight = true; break; }
    if (hasLeft)  fill_rect(startX - 2, barY + 1, 1, barH - 2, 1);
    if (hasRight) {
        const xRight = startX + winPages * (segW + segGap) - segGap + 1;
        fill_rect(xRight, barY + 1, 1, barH - 2, 1);
    }
}

/* TRUE while an overlay that sits ABOVE sound mode in drawUI's stack owns the
 * OLED. Input dispatch reads this so INPUT PRIORITY FOLLOWS DRAW PRIORITY: a
 * screen that sound mode is not painting must not be one sound mode is
 * steering. Without it the global/track menu opened from sound mode drew fine
 * and was input-dead — sound mode owns the jog, and its CC hook sits ahead of
 * dAVEBOx's own handling, so every turn and click was swallowed by a screen
 * nobody could see (Josh, on hardware).
 *
 * ⚠ This list MIRRORS the checks between `drawUI`'s co-run bail and its
 * `soundRender()` call, and the two MUST stay in step — a flag added there and
 * not here re-opens exactly this bug. `tests/test_sound_mode_overlay_gate.sh`
 * pins that correspondence by diffing the two flag sets. */
/* ⭑ ONE OWNER for "the session mixer page is what session view shows":
 * the session latch, the transient window, or a touched knob. ⚠ TOUCH-REVEAL
 * ON THE JOG IS RETIRED HERE TOO (Josh's 'mirror track view' ruling) —
 * S.jogTouched deliberately absent; the KNOB touch stays, it is the mixer's
 * own edit surface. Render and the session click gate both read this. */
export function sessMixerVisible() {
    /* Same one law as track view: bank mode, or the knob-touch peek. */
    return !!(S.sessionView && (S.sessMixerLatched || S.knobTouched >= 0));
}

/* Is the BANK CARD what track view is showing right now (vs the resting
 * overview)? The plain jog-click's context gate (Josh, 2026-08-31: click from
 * the OVERVIEW opens the persistent display; on a visible card it keeps its
 * per-bank meanings) reads this instead of re-deriving the branch. */
/* ⭑⭑ ONE LAW (Josh, 2026-09-01): THE BANK CARD IS VISIBLE IFF BANK MODE IS
 * ON. Nothing else shows it — not a knob touch, not the old transient
 * bankSelectTick window (a dozen actions arm it, and cards appearing outside
 * the mode is exactly what made the click look broken on device), not a
 * timeout decay. bankSelectTick lives on only as plumbing other features
 * stamp; it no longer drives this screen. */
export function bankCardVisible() {
    /* ...plus ONE peek (Josh: "knob touches are the ONLY other thing that
     * shows the card... it just peeks the active one until knob is
     * released"). And Shift stands the card down UNLESS a knob is held —
     * Shift is the track-switch modifier and the overview is its read-out
     * (Josh, 2026-08-24); a Shift+knob gesture keeps the peek. */
    if (S.sessionView) return false;
    if (S.shiftHeld && S.knobTouched < 0) return false;
    return !!S.bankCardLatched || S.knobTouched >= 0;
}

export function soundModeCovered() {
    return !!(S.stepReveal || S.sessionOverlayHeld || S.snapshotPicker || S.daveBox ||
        S.projectPadPicker || S.pendingSceneBakePicker ||
        S.mergePlacing || S.mergeNoticePending || S.pendingMergePlacement ||
        S.tempoSelectActive || S.mergeSoloPlacement >= 0 || S.capturePlaceTrack >= 0 ||
        S.confirmStateWipe || S.confirmExit || S.bpmMoveInfo || S.recordBlockedDialog ||
        S.confirmConvertToDrum || S.confirmConvertToConduct ||
        (S.menuInfoLines && S.menuInfoLines.length > 0) ||
        S.confirmLgto || S.confirmXpose || S.confirmBakeScene || S.confirmBake ||
        S.globalMenuOpen || S.tapTempoOpen ||
        (S.sessionView && (S.loopHeld || S.perfViewLocked)));
}

/* Shift+Volume's level card, drawn OVER whatever is on screen.
 *
 * ⚠ It has to live outside drawUIBody: that function returns early from a dozen
 * places (loading, popups, sound mode, every bank branch), so anything drawn at
 * its end would simply never appear on most screens — and "everywhere" is the
 * whole request. Drawn last, unconditionally, which is what makes it an overlay
 * rather than another branch competing for the screen.
 *
 * Sound mode keeps drawing its OWN read-out through the same drawLevelCard, so
 * the two are one card by construction; this one covers everywhere else. */
function drawTrackVolCard() {
    if (S.tvCardUntil < 0 || S.clockMs > S.tvCardUntil) return;
    drawLevelCard(S.tvCardText, S.tvCardFrac);
}

/* Bank picker (Shift+jog in track view): the kit's list overlay, the same
 * control an enum param opens, over whatever screen is underneath. An OVERLAY
 * rather than a screen, like the volume card — the gesture is a hold, and what
 * it is browsing away from should stay visible behind it. */
function drawBankPicker() {
    if (S.bankPickerSel < 0) return;
    const cyc = bankCycleForMode(S.trackPadMode[S.activeTrack]);
    /* BANKS[] names the real banks; SOUND + CONFIG is a stub entry there, so it
     * still carries its own name — every reader of that index does this. */
    /* Width is the overlay's own business now — it sizes to the longest label,
     * which is what makes 'SOUND + CONFIG' readable here and stops any enum
     * picker being cut elsewhere. */
    /* ⭑ `hdrFont` — the ONE overlay that is not in the stock font. It previews
     * BANK NAMES, and a bank's own header is always the header font, so the
     * picker matches what you are about to land on (Josh, 2026-08-27:
     * "hdr in pickers is only for banks"). */
    drawKitListOverlay(cyc.map((b) => bankDisplayName(S.trackPadMode[S.activeTrack], b)),
                       Math.max(0, Math.min(cyc.length - 1, S.bankPickerSel)),
                       { hdrFont: true });
}

/* The bank-card LATCH indicator: a 1px frame around the params, alternating
 * solid and segmented at the standard blink rate.
 *
 * ⚠ Drawn after the body, for the reason drawKitLatchBox gives — a widget that
 * reaches the panel edge would punch holes in a frame drawn underneath it.
 *
 * Only where a bank CARD is what is on screen: not in session view, and not in
 * sound mode, which owns the whole panel and is not a card to frame. */
function drawBankLatchBox() {
    /* RETIRED (Josh, 2026-09-01: "since banks are always persistent now, we
     * don't need the bank border anymore") — with the click-latch the normal
     * state, a frame marking it marked everything. Kept as a stub so the
     * drawUI seam and this rationale survive; delete outright when the dust
     * settles. */
}

export function drawUI() {
    drawUIBody();
    drawBankLatchBox();
    drawTrackVolCard();
    drawBankPicker();
}

/* The held step's page: the STEP bank's layout with THAT step's values. Drawn
 * (a) on the STEP bank whenever a step is held and (b) anywhere as THE REVEAL
 * (S.stepReveal, hold + jog right). Returns true when it drew the frame. */
/* The held step's eight cells — the STEP bank's page AND its knob rings read
 * these (registerRingCells below), so the two cannot disagree. null when no
 * step with notes is held. */
export function heldStepCells() {
    if (S.heldStep < 0 || !S.heldStepNotes.length) return null;
    const _dash = (s) => s === '—' ? '--' : s;
    const t = S.activeTrack;
    if (S.trackPadMode[t] === PAD_MODE_DRUM) {
        const tps   = S.drumLaneTPS[t] || 24;
        const _gateSteps = S.stepEditGate / tps;
        return [
                { kind: 'valsq', label: 'Leng', name: 'Length',
                  text: fmtStepLen(_gateSteps) },
                { kind: 'arc', label: 'Vel', name: 'Velocity', text: String(S.stepEditVel),
                  norm: Math.max(0, Math.min(1, S.stepEditVel / 127)) },
                { kind: 'arcbip', label: 'Nudg', name: 'Nudge',
                  text: (S.stepEditNudge >= 0 ? '+' : '') + S.stepEditNudge,
                  signed: Math.max(-1, Math.min(1, S.stepEditNudge / Math.max(1, tps - 1))) },
                { kind: 'blank', label: '' },
                { kind: 'valsq', label: 'Iter', name: 'Iteration',
                  text: _dash(formatStepIter(S.stepEditIter)),
                  options: STEP_ITER_LIST.map((v) => _dash(formatStepIter(v))),
                  sel: Math.max(0, STEP_ITER_LIST.indexOf(S.stepEditIter)) },
                { kind: 'arc', label: 'Prob', name: 'Probability',
                  text: (S.stepEditRand === 0 ? 100 : S.stepEditRand) + '%',
                  norm: (S.stepEditRand === 0 ? 100 : S.stepEditRand) / 100 },
                { kind: 'valsq', label: 'Ratch', name: 'Ratchet',
                  text: S.stepEditRatch <= 1 ? '--' : String(S.stepEditRatch),
                  options: ['--', '2', '3', '4'], sel: S.stepEditRatch <= 1 ? 0 : S.stepEditRatch - 1 },
                { kind: 'blank', label: '' },
            ];
    }
    const ac = effectiveClip(t);
    const root = S.heldStepNotes[0];
    const noteName = midiNoteName(root);
    const noteSub = S.heldStepNotes.length > 1 ? '+' + (S.heldStepNotes.length - 1) : '';
    const noteLabel = noteSub ? noteName + noteSub : noteName;
    const tps = S.clipTPS[t][ac] || 24;
    const _gateSteps = S.stepEditGate / tps;
    return [
        { kind: 'blank', label: 'Note', name: 'Note', bigText: noteLabel },
        { kind: 'blank', label: 'Oct',  name: 'Note', bigText: noteLabel },
        { kind: 'valsq', label: 'Leng', name: 'Length',
          text: fmtStepLen(_gateSteps) },
        { kind: 'arc', label: 'Vel', name: 'Velocity', text: String(S.stepEditVel),
          norm: Math.max(0, Math.min(1, S.stepEditVel / 127)) },
        { kind: 'arcbip', label: 'Nudg', name: 'Nudge',
          text: (S.stepEditNudge >= 0 ? '+' : '') + S.stepEditNudge,
          signed: Math.max(-1, Math.min(1, S.stepEditNudge / Math.max(1, tps - 1))) },
        { kind: 'valsq', label: 'Iter', name: 'Iteration',
          text: _dash(formatStepIter(S.stepEditIter)),
          options: STEP_ITER_LIST.map((v) => _dash(formatStepIter(v))),
          sel: Math.max(0, STEP_ITER_LIST.indexOf(S.stepEditIter)) },
        { kind: 'arc', label: 'Prob', name: 'Probability',
          text: (S.stepEditRand === 0 ? 100 : S.stepEditRand) + '%',
          norm: (S.stepEditRand === 0 ? 100 : S.stepEditRand) / 100 },
        { kind: 'valsq', label: 'Ratch', name: 'Ratchet',
          text: S.stepEditRatch <= 1 ? '--' : String(S.stepEditRatch),
          options: ['--', '2', '3', '4'], sel: S.stepEditRatch <= 1 ? 0 : S.stepEditRatch - 1 },
    ];
}
registerRingCells(BANK_STEP, heldStepCells);

function drawHeldStepPage() {
    if (S.heldStep < 0) return false;
    /* The footer says what the jog does HERE: on the reveal it goes back; on
     * the STEP bank under a hold it does nothing (bankPageHints drops the pair). */
    const _footer = (S.stepReveal && S.activeBank !== BANK_STEP) ? [['JOG', 'BACK']] : bankPageHints(BANK_STEP);
    /* Canvaskit step editors (drum + melodic). The kit fonts don't map
     * the formatters' em dash — normalize to "--". */
    const _dash = (s) => s === '—' ? '--' : s;
    const _stepTitle = 'Step ' + (S.heldStep + 1);
    if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
        /* Drum step edit: K1 Leng, K2 Vel, K3 Nudg, K5 Iter, K6 Prob, K7 Ratch. */
        const t = S.activeTrack;
        if (S.heldStepNotes.length > 0) {
            const tps   = S.drumLaneTPS[t] || 24;
            const _gateSteps = S.stepEditGate / tps;
            const cells = heldStepCells();
            drawStepEditKitPage(_stepTitle, cells, null, _footer);
        } else {
            drawStepEditKitPage(_stepTitle, null, null, _footer);
        }
        return true;
    }
    const ac        = effectiveClip(S.activeTrack);
    if (S.heldStepNotes.length > 0) {
        /* Melodic step edit: K1 Note + K2 Oct share the merged note box
         * (same idiom as the drum NOTE FX lane box); K3 Leng, K4 Vel,
         * K5 Nudg, K6 Iter, K7 Prob, K8 Ratch. */
        const root = S.heldStepNotes[0];
        const noteName = midiNoteName(root);
        /* extra notes on the step ride alongside the name as "+2" */
        const noteSub = S.heldStepNotes.length > 1
            ? '+' + (S.heldStepNotes.length - 1) : '';
        const noteLabel = noteSub ? noteName + noteSub : noteName;
        const tps = S.clipTPS[S.activeTrack][ac] || 24;
        const _gateSteps = S.stepEditGate / tps;
        const cells = heldStepCells();
        drawStepEditKitPage(_stepTitle, cells, { name: noteName, sub: noteSub }, _footer);
        return true;
    } else if (S.stepWasEmpty) {
        drawStepEditKitPage(_stepTitle, null, null, _footer);
        return true;
    }
    /* non-empty step, notes still loading at hold threshold — fall through to bank/header */
    return false;
}

function drawUIBody() {
    /* Exit farewell: the last frame the session ever pushes — the panel
     * retains it across the hand-back to stock, so it must win over every
     * other screen. Same grammar as the LOADING screen (verb, then subject). */
    if (S.exitFarewell !== 0) {
        /* Wordmark over the verb, in the app's own fonts (Josh, 2026-08-24) —
         * deliberately the SAME layout and the same two fonts as the boot text
         * screen, so the session opens and closes on one face instead of two.
         * The name goes FIRST now: it is the subject, and "Exiting..." is what
         * is happening to it.
         *
         * ⭑ hdrPrint prints VERBATIM — the header font carries real lowercase
         * d/x glyphs, and uppercasing would destroy the mark. Host `print` is
         * gone from here: it is one fixed 6px face, which is why this screen
         * used to read as a system message rather than as ours. */
        clear_screen();
        const _xn = 'dAVEBOx';
        hdrPrint(Math.max(0, Math.round((128 - hdrWidth(_xn)) / 2)), 26, _xn, 1);
        const _xl = 'Exiting...';
        mvPrint(Math.max(0, Math.round((128 - mvWidth(_xl)) / 2)), 40, _xl, 1);
        return;
    }

    /* CO-RUN: shadow_ui's chain editor owns the OLED while this is active.
    /* Move-native co-run: Move firmware owns the OLED (preset browser /
     * device-edit pages). The shim's display_mode bypass keeps Move's
     * framebuffer visible while the MIDI filter stays active; we just
     * stay out of the way. Pad/step LEDs freeze at entry-time state —
     * verified harmless in real use (nothing the user does during co-run
     * depends on live LED feedback). */
    if (S.moveCoRunTrack >= 0) {
        /* Side clip buttons: the button paired to the Move track this dAVEBOx
         * track routes to blinks; the rest stay dark grey. Move's track numbering
         * is reversed (Track 1 = CC 43 = top .. Track 4 = CC 40 = bottom), so a
         * channel ch (1-4) maps to top-to-bottom bit (ch-1). Forced every
         * POLL_INTERVAL to re-assert over Move firmware's pass-through writes. */
        const _coRunCh = (S.trackChannel[S.moveCoRunTrack] | 0);
        const _litMask = (_coRunCh >= 1 && _coRunCh <= 4) ? (1 << (_coRunCh - 1)) : 0;
        /* ⚠ The paired-track blink is GONE (Josh, 2026-08-24). It owned CC 40-43
         * so co-run could show which track was paired — but those are the clip
         * buttons, and Josh's rule is that everything outside the instrument-
         * editing controls behaves as it does in track view. They paint clip
         * state now, from updateTrackLEDs, and their presses are kept. */
        return;
    }
    /* Alt-param mode is transient: any bank change, track change, or entering
     * Session View drops back to primary params. Diff-guard catches every
     * S.activeBank / S.activeTrack reassignment regardless of source. */
    if (S.altMode && (S.sessionView ||              /* session view can be entered via a button after altMode was set */
            S.activeBank !== S._altPrevBank ||
            S.activeTrack !== S._altPrevTrack)) {
        S.altMode = false;
    }
    S._altPrevBank  = S.activeBank;
    S._altPrevTrack = S.activeTrack;
    if (S.sessionOverlayHeld) { drawSessionOverview(); return; }
    if (S.daveBox) { drawDaveBox(); return; }
    if (S.snapshotPicker) { drawSnapshotPicker(); return; }
    if (S.projectPadPicker) { drawProjectPadPicker(); return; }
    if (S.pendingSceneBakePicker) {
        clear_screen();
        drawMenuHeader('BAKE SCENE');
        print(4, 20, 'Tap a row or scene', 1);
        print(4, 30, 'step to pick it.',   1);
        print(4, 50, 'Back cancels',        1);
        return;
    }
    if (S.mergePlacing) {
        /* Destination picked — DSP is committing the take. Shown so the jump
         * back to the normal screen doesn't read as a freeze. */
        clear_screen();
        drawMenuHeader('PLACING MERGED');
        print(4, 26, S.mergePlacingScene ? 'Clips…' : 'Clip…', 1);
        return;
    }
    if (S.mergeNoticePending) {
        /* Shift+Sample raised this notice; it does NOT start the merge. Plain
         * Rec begins the count-in, Back cancels. */
        clear_screen();
        drawMenuHeader('LIVE MERGE');
        print(4, 20, S.mergeNoticeSingleTrack < 0 ? 'Capture all 8.'
                                                   : 'Capture this track.', 1);
        print(4, 34, 'Rec to start,',                                       1);
        print(4, 48, 'Back to cancel.',                                     1);
        return;
    }
    if (S.pendingMergePlacement) {
        clear_screen();
        drawMenuHeader('PLACE MERGED');
        print(4, 20, 'Tap a row or scene', 1);
        print(4, 30, 'step for the clips.', 1);
        print(4, 50, 'Back cancels',         1);
        return;
    }
    if (S.tempoSelectActive) { drawTempoSelect(); return; }
    if (S.mergeSoloPlacement >= 0) {
        clear_screen();
        drawMenuHeader('MERGED TAKE');
        print(4, 20, 'Tap a blinking clip', 1);
        print(4, 32, 'on track ' + (S.mergeSoloPlacement + 1) + ' to save.', 1);
        print(4, 50, 'Back cancels',         1);
        return;
    }
    if (S.capturePlaceTrack >= 0) {
        clear_screen();
        drawMenuHeader('CAPTURED TAKE');
        print(4, 20, 'Tap a blinking clip', 1);
        print(4, 32, 'on track ' + (S.capturePlaceTrack + 1) + ' to save.', 1);
        print(4, 50, 'Back cancels',         1);   /* Rec still works; Back is the universal cancel */
        return;
    }
    if (S.confirmStateWipe) { drawStateWipeConfirm(); return; }
    if (S.confirmExit)      { drawExitConfirm();      return; }
    if (S.bpmMoveInfo) { drawBpmMoveInfo(); return; }
    if (S.recordBlockedDialog) { drawRecordBlockedDialog(); return; }
    if (S.confirmLgto)         { drawLgtoConfirm();         return; }
    if (S.confirmXpose) { drawXposeConfirm(); return; }
    if (S.confirmBakeScene) { drawBakeSceneConfirm(); return; }
    if (S.confirmBake) { drawBakeConfirm(); return; }
    /* Modal dialogs that either screen can raise. They belong ABOVE Track
     * Control, so they are drawn before soundRender() — which returns and would
     * otherwise swallow them — and they appear in soundModeCovered() so sound
     * mode stops steering while they are up. `Mode` moving to Config is what
     * made this reachable with the global menu shut. */
    if (S.confirmConvertToDrum)    { drawConvertToDrumConfirm();    return; }
    if (S.confirmConvertToConduct) { drawConvertToConductConfirm(); return; }
    if (S.menuInfoLines.length > 0){ drawMenuInfo();                return; }
    if (S.globalMenuOpen || S.tapTempoOpen) { ensureGlobalMenuFresh(); drawGlobalMenu(); return; }
    /* Perf Mode OLED takeover (Session View + Loop held or locked) */
    if (S.sessionView && (S.loopHeld || S.perfViewLocked)) { drawPerfModeOled(); return; }

    /* SOUND MODE draws the whole screen itself (block picker / bank pages /
     * module browser). It sits HERE, below every overlay above, so anything
     * that grabs the OLED — the global menu, tap tempo, perf mode, a confirm,
     * a picker — wins over it. It used to be the first check and painted over
     * all of them. Sound mode isn't dismissed by those; it just stops drawing
     * and comes back when they close. */
    /* ⭑ THE REVEAL (spec §2): hold a step, jog right — the STEP bank's page
     * for that step, on top of whatever was up, sound mode included (it is
     * covered, see soundModeCovered). Jog left or the release removes it. */
    if (S.stepReveal) { clear_screen(); if (drawHeldStepPage()) return; }
    if (soundRender()) return;
    /* awaitingProjectSelect keeps the loading screen up for the gap between
     * init and the picker opening (LED init has to finish first). Without it
     * that window renders the ordinary session view of an EMPTY instance — a
     * fake, playable-looking project flashing up in the one flow whose whole
     * point is that nothing is loaded yet. The picker's own draw is checked
     * earlier and still wins the moment it opens.
     * NOT done by setting stateLoading: the picker's open condition in tick()
     * requires !stateLoading, so that would deadlock it closed. */
    if (S.stateLoading || S.bootSplashMs > 0 ||
            (S.awaitingProjectSelect && !S.projectPadPicker)) {
        /* Loading screen (v3): plain text, no artwork. The dAVEBOx splash
         * bitmap moved UP a level — it is the HOST session splash now
         * (dbxhost splash.hex contract) — so the module showing it again
         * mid-switch read as a second product. From the moment a project is
         * picked to the moment the sequencer is ready, everything on screen
         * says one thing: which set is loading. (The host actuator shows
         * "Loading <name>" during its half; this is the davebox half.) */
        clear_screen();
        const _ln = 'LOADING';
        print(Math.max(0, Math.floor((128 - _ln.length * 6) / 2)), 20, _ln, 1);
        const _sn = (S.currentSetName || '').length ? S.currentSetName : '...';
        const _snT = _sn.length > 20 ? _sn.substring(0, 19) + '…' : _sn;
        print(Math.max(0, Math.floor((128 - _snT.length * 6) / 2)), 34, _snT, 1);
        return;
    }

    clear_screen();
    if (S.sessionView) {
        /* Touch reveals the mix. A knob touch, a jog touch, or the timeout after
         * a turn opens the 8-track mixer page for the selected mode — the same
         * gesture and the same window as a clip param bank, which is what makes
         * the mixer feel like part of the instrument rather than a mode.
         *
         * Deliberately ABOVE the popup branch: the page is the richer read-out
         * (eight tracks vs one), so while a knob is held it should win. Other
         * popups still show once the finger lifts and the window closes. */
        if (sessMixerVisible()) {
            drawSessionMixerPage();
            return;
        }
        if (S.actionPopupEndTick >= 0) {
            const _n = S.actionPopupLines.length;
            if (S.actionPopupGauge >= 0) {
                /* Gauge popup: text sits high so the bar owns the lower half.
                 * Same geometry as sound mode's level read-out, so the two
                 * levels look like the same control seen from two places. */
                print(4, 18, S.actionPopupLines[0], 1);
                if (_n >= 2) print(4, 30, S.actionPopupLines[1], 1);
                const _bx = 4, _bw = 120, _by = 46, _bh = 6;
                draw_rect(_bx, _by, _bw, _bh, 1);
                const _fw = Math.round((_bw - 2) * S.actionPopupGauge);
                if (_fw > 0) fill_rect(_bx + 1, _by + 1, _fw, _bh - 2, 1);
                /* Unity tick, drawn ABOVE the bar rather than inside it — a
                 * mark inside would be swallowed by the fill exactly when you
                 * are on it, which is the moment it has to be visible. */
                if (S.actionPopupGaugeMark >= 0) {
                    const _mx = _bx + 1 + Math.round((_bw - 2) * S.actionPopupGaugeMark);
                    fill_rect(_mx, _by - 4, 1, 3, 1);
                }
            } else if (_n >= 4) {
                print(4, 14, S.actionPopupLines[0], 1);
                print(4, 25, S.actionPopupLines[1], 1);
                print(4, 36, S.actionPopupLines[2], 1);
                print(4, 47, S.actionPopupLines[3], 1);
            } else if (_n === 3) {
                print(4, 17, S.actionPopupLines[0], 1);
                print(4, 29, S.actionPopupLines[1], 1);
                print(4, 41, S.actionPopupLines[2], 1);
            } else if (_n === 2) {
                print(4, 22, S.actionPopupLines[0], 1);
                print(4, 34, S.actionPopupLines[1], 1);
            } else {
                print(4, 28, S.actionPopupLines[0], 1);
            }
            return;
        }
        /* dAVEBOx banner — white bar, letters animated when transport running.
         * The wordmark is set in the BIG font (Josh, 2026-08-25, picking it off
         * the rendered candidates). It is the only large face that keeps the
         * mark's own casing: the movy font scaled up is a caps design and reads
         * DAVEBOX, and the 6x6 bank-heading font is no bigger than the 5x7 the
         * bar used before. */
        fill_rect(0, 0, 128, MARK_BAR_H, 1);
        let dA, dE, dO;
        if (S.playing) {
            dA = (Math.floor(S.masterPos /  96) % 2 === 0) ? 'A' : '@';
            dE = (Math.floor(S.masterPos /  48) % 2 === 0) ? '3' : 'E';
            dO = (Math.floor(S.masterPos / 192) % 2 === 0) ? 'O' : 'o';
        } else {
            dA = 'A'; dE = 'E'; dO = 'O';
        }
        drawWordmark('d' + dA + 'V' + dE + 'B' + dO + 'x');
        drawMetroIndicator();
        drawOverviewTracks(overviewHints());
        return;
    }

    /* Track View — priority display state machine */
    const bank      = S.activeBank;
    /* ⭑ The LATCH (now the plain jog click, Josh 2026-08-31; Shift+click
     * 2026-08-25 before that) is a way to be "in" the bank display that does
     * not expire — that is the whole point of it. Folded into the ONE
     * predicate every screen reads rather than added at each screen, so a
     * bank that forgot to check it cannot exist.
     * ⚠ TOUCH-REVEAL IS RETIRED (Josh, 2026-08-31: "do away with touch jog to
     * reveal davebox banks") — S.jogTouched deliberately absent here. The jog
     * turn still opens the PICKER while touched, and a commit still arms the
     * transient window; only the bare resting touch stopped revealing. */
    const inTimeout = bankCardVisible();

    /* Compress-limit override: highest priority for ~1500ms after a blocked compress */
    if (S.stretchBlockedEndTick >= 0) {
        print(4, 10, '[CLIP       ]', 1);
        print(4, 22, 'Beat Stretch', 1);
        print(4, 34, 'COMPRESS LIMIT', 1);
        return;
    }

    /* Action confirmation pop-up: ~500ms; defers to step edit and active-knob bank overview */
    if (S.actionPopupEndTick >= 0 && S.heldStep < 0 && S.knobTouched < 0) {
        if (S.actionPopupHighlight >= 0 && S.actionPopupLines.length >= 3) {
            const _title = S.actionPopupLines[0];
            const _tw = _title.length * 6;
            const _tx = Math.floor((128 - _tw) / 2);
            print(_tx, 4, _title, 1);
            fill_rect(_tx, 13, _tw, 1, 1);
            for (let _li = 1; _li < S.actionPopupLines.length; _li++) {
                const _ly = 12 + _li * 14;
                const _lw = S.actionPopupLines[_li].length * 6;
                const _lx = Math.floor((128 - _lw) / 2);
                if (_li === S.actionPopupHighlight) {
                    fill_rect(0, _ly - 1, 128, 13, 1);
                    print(_lx, _ly, S.actionPopupLines[_li], 0);
                } else {
                    print(_lx, _ly, S.actionPopupLines[_li], 1);
                }
            }
        } else if (S.actionPopupLines.length >= 4) {
            /* 3+ line info popups have no highlight, so they fell through to the
             * 2-line branch below and silently dropped lines 3-4. Render all
             * four (matches the Perf-view popup renderer's layout). */
            print(4, 14, S.actionPopupLines[0], 1);
            print(4, 25, S.actionPopupLines[1], 1);
            print(4, 36, S.actionPopupLines[2], 1);
            print(4, 47, S.actionPopupLines[3], 1);
        } else if (S.actionPopupLines.length === 3) {
            print(4, 17, S.actionPopupLines[0], 1);
            print(4, 29, S.actionPopupLines[1], 1);
            print(4, 41, S.actionPopupLines[2], 1);
        } else if (S.actionPopupLines.length >= 2) {
            print(4, 22, S.actionPopupLines[0], 1);
            print(4, 34, S.actionPopupLines[1], 1);
        } else {
            print(4, 28, S.actionPopupLines[0], 1);
        }
        return;
    }

    /* No-note flash: ~600ms after pressing an empty step with no prior pad */
    if (S.noNoteFlashEndTick >= 0 && S.activeBank !== 6) {
        print(4, 22, 'NO NOTE', 1);
        print(4, 34, 'Play a pad first', 1);
        return;
    }

    /* Step edit — ON THE STEP BANK (spec §2, 2026-09-02): a held step is the
     * screen there; everywhere else it changes nothing (the reveal excepted,
     * drawn above sound mode below). */
    if (S.heldStep >= 0 && S.activeBank === BANK_STEP && drawHeldStepPage()) return;

    /* Loop view: own priority state so screen is fully cleared first. Suppressed
     * on the unconfirmed drum ALL LANES bank so holding Loop surfaces the confirm
     * screen (below) instead of the clip-length view for a gated gesture. */
    if (S.loopHeld && !(S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && S.activeBank === 7 && !S.allLanesConfirmed)) {
        const _loopL2 = 'STEP BTN=by page';
        const _loopL3 = 'JOG TURN=by step';
        const _loopX2 = Math.floor((128 - _loopL2.length * 6) / 2);
        const _loopX3 = Math.floor((128 - _loopL3.length * 6) / 2);
        function _drawLoopSteps(steps) {
            const _l4  = 'Steps: ' + steps + '/256';
            const _l4x = Math.floor((128 - _l4.length * 6) / 2);
            const _nvX = _l4x + 7 * 6;
            const _nvW = (_l4.length - 7) * 6;
            fill_rect(_nvX - 1, 50, _nvW + 2, 14, 1);
            print(_l4x, 52, 'Steps: ', 1);
            print(_nvX, 52, steps + '/256', 0);
        }
        if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
            const t   = S.activeTrack;
            const len = S.drumLaneLength[t];
            if (S.activeBank === 7) {
                const _allBlink = Math.floor(S.clockMs / 220) % 2 === 0;
                const _l1 = 'Clip length-' + (_allBlink ? 'ALL' : '   ') + ' lanes';
                print(Math.floor((128 - 21 * 6) / 2), 4, _l1, 1);
            } else {
                print(Math.floor((128 - 11 * 6) / 2), 4, 'Lane length', 1);
            }
            fill_rect(0, 15, 128, 1, 1);
            print(_loopX2, 22, _loopL2, 1);
            print(_loopX3, 34, _loopL3, 1);
            _drawLoopSteps(len);
        } else {
            const ac_l    = effectiveClip(S.activeTrack);
            const steps_l = S.clipLength[S.activeTrack][ac_l];
            print(Math.floor((128 - 11 * 6) / 2), 4, 'Clip Length', 1);
            fill_rect(0, 15, 128, 1, 1);
            print(_loopX2, 22, _loopL2, 1);
            print(_loopX3, 34, _loopL3, 1);
            _drawLoopSteps(steps_l);
        }
        return;
    }

    /* Arp Steps interval overlay: persistent bank overview while jog-clicked into
     * step-interval mode on SEQ ARP (4) or TARP (5). K1-K8 = per-step scale-degree
     * offsets (±24); pad grid is the persistent step-vel level editor handled in
     * updateTrackLEDs. Renders REGARDLESS of knob-touch / inTimeout (persistent). */
    if (bank >= 0 && S.stepIntervalMode && !S.sessionView && (bank === 4 || bank === 5)) {
        /* Repeat-groove-style single 8-column row: bipolar bars (±24
         * scale-degree offset) around a dotted centerline, step number under
         * each bar; touched step inverts its number, header = "Offset: +N". */
        const t      = S.activeTrack;
        const isSeq  = (bank === 4);
        const _ac    = effectiveClip(t);
        const _velPage = S.shiftHeld;   /* Shift page = absolute step velocity */
        const arr    = _velPage ? (isSeq ? S.seqArpStepVel[t][_ac] : S.tarpStepVel[t])
                                : (isSeq ? S.seqArpStepInt[t][_ac] : S.tarpStepInt[t]);
        const _llRaw = isSeq ? (S.seqArpStepLoopLen[t][_ac] | 0) : (S.tarpStepLoopLen[t] | 0);
        const _ll    = (_llRaw >= 1 && _llRaw <= 8) ? _llRaw : 8;
        const _tk    = S.knobTouched;
        if (_tk >= 0 && _tk < _ll) {
            const _v = arr[_tk] | 0;
            if (_velPage) drawKitTouchedHeader('Velocity: ' + (_v === 0 ? 'Off' : _v > 127 ? 'Thru' : _v));
            else          drawKitTouchedHeader('Pitch: ' + (_v > 0 ? '+' : '') + _v);
        } else {
            drawBankHeading(_velPage ? 'Step Vel' : 'Step Pitch');
            if (!_velPage) {
                /* micro-font hint that Shift flips to the velocity page —
                 * black on the filled header bar, tucked LEFT of the alt
                 * arrow (which sits at x=121-126) */
                pf3Print(118 - pf3Width('SHIFT'), 2, 'SHIFT', 0);
            }
        }
        const _colW = 16, _barW = 10, _top = 14, _bot = 54, _numY = 57;
        const _cy = Math.floor((_top + _bot) / 2);
        if (_velPage) fill_rect(0, _bot + 1, 128, 1, 1);   /* velocity baseline */
        else for (let x = 0; x < 128; x += 2) set_pixel(x, _cy, 1);
        for (let k = 0; k < 8; k++) {
            const _x = k * _colW + 3;
            if (k >= _ll) {
                fill_rect(_x + 3, _bot - 1, 4, 1, 1);   /* inactive stub */
                continue;
            }
            const _v = arr[k] | 0;
            if (_velPage) {
                /* absolute velocity: bar up from the baseline; 0 = step off;
                 * Thru (default) = full-height dithered bar */
                if (_v > 127) {
                    drawThruBar(_x, _barW, _top, _bot);
                } else if (_v > 0) {
                    const _h = Math.max(1, Math.round(_v / 127 * (_bot - _top)));
                    fill_rect(_x, _bot - _h, _barW, _h, 1);
                }
            } else {
                const _mag = Math.round(Math.abs(_v) / 24 * (_cy - _top));
                if (_v === 0) fill_rect(_x, _cy - 1, _barW, 3, 1);
                else if (_v > 0) fill_rect(_x, _cy - _mag, _barW, Math.max(1, _mag), 1);
                else fill_rect(_x, _cy + 1, _barW, Math.max(1, _mag), 1);
            }
            const _num = String(k + 1);
            const _nw = mvWidth(_num);
            const _nx = Math.round(k * _colW + _colW / 2 - _nw / 2);
            if (k === _tk) {
                fill_rect(k * _colW + 2, _numY - 1, _colW - 4, 7, 1);
                mvPrint(_nx, _numY, _num, 0);
            } else {
                mvPrint(_nx, _numY, _num, 1);
            }
        }
        return;
    }


    /* Conductor banks (Responder/Octave/When): per-track 2x4 grid, shown on knob
     * touch / bank-select timeout; idle falls through to the resting overview like
     * the Conduct bank. Gated on PAD_MODE_CONDUCT so it never affects melodic/drum. */
    if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT &&
            (bank === BANK_RESPONDER || bank === BANK_OCTAVE || bank === BANK_WHEN) &&
            bankCardVisible()) {
        const _ch = bankHeaderName(S.activeTrack, bank);
        if (bank === BANK_RESPONDER) {
            const _cc = S.trackActiveClip[S.activeTrack] | 0;
            drawConductToggleGrid(_ch, function(k){ return S.condResp[_cc][k]; },
                                  bankPageHints(bank));
        } else if (bank === BANK_OCTAVE) {
            drawConductTrackGrid(_ch, function(k){ if (S.trackPadMode[k] === PAD_MODE_DRUM) return '--'; const o = S.condOct[S.trackActiveClip[S.activeTrack] | 0][k]; return o === 0 ? '--' : (o > 0 ? '+' + o : '' + o); }, 'Cndct', bankPageHints(bank));
        } else { /* BANK_WHEN */
            drawConductTrackGrid(_ch, function(k){ return S.trackPadMode[k] === PAD_MODE_DRUM ? '--' : (S.condWhen[S.trackActiveClip[S.activeTrack] | 0][k] ? 'Now' : 'Next'); }, 'Cndct', bankPageHints(bank));
        }
        return;
    }

    if (bank >= 0 && bankCardVisible()) {
        /* SOUND + CONFIG's card is the GATEWAY prompt. Reached here only while
         * sound mode is CLOSED — the knob-touch PEEK of a track remembered on
         * this bank at rest (the mode no longer holds the screen open there;
         * Josh, 2026-09-01, THE ONE LAW), and the one-tick gap before a queued
         * entry resolves. Open sound mode never gets this far: drawUI routed to
         * soundRender above. Without this, BANKS[11]'s stub knobs drew a blank
         * eight-cell kit page. */
        if (bank === BANK_SOUND) {
            renderTrackGatewayCard(S.activeTrack);
            return;
        }
        /* MACROS at rest, same gap: the page from the store, values as last
         * seen (sound mode owns the reads; a peek pays for none). */
        if (bank === BANK_MACROS) {
            renderMacrosPeek(S.activeTrack);
            return;
        }
        /* AUTOMATION: the list of what is automated in this clip, its menu
         * and its ops (ui_automation_bank). The heading is a bank heading. */
        if (bank === BANK_AUTOMATION) {
            clear_screen();
            drawBankHeading(bankDisplayName(S.trackPadMode[S.activeTrack], BANK_AUTOMATION), false, false);
            drawAutomationBankBody();
            return;
        }
        if (bank === BANK_STEP) {
            /* STEP with nothing held: the layout, every cell `--`. A held step
             * with a note is drawn by the step-edit block above, before the
             * card gate — a held step is the reason for being here. */
            drawStepEditKitPage(BANKS[BANK_STEP].name, null, null, bankPageHints(BANK_STEP));
            return;
        }
        const isDrumLaneBank = (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 0);
        if (isDrumLaneBank) {
            /* DRUM LANE bank overview: mirrors CLIP bank at lane level */
            const t    = S.activeTrack;
            const ac   = effectiveClip(t);
            const lane = S.activeDrumLane[t];
            const len  = S.drumLaneLength[t];
            const tpsIdx = Math.max(0, TPS_VALUES.indexOf(S.drumLaneTPS[t]));
            const sqfl   = S.clipSeqFollow[t][ac] ? 1 : 0;
            const eucN = Math.min(S.drumLaneEuclidN[t][lane] | 0, len);
            const _dlRev = S.drumLanePlaybackAudioReverse[t][lane] | 0;
            const _dlDir = S.drumLanePlaybackDir[t][lane] | 0;
            const cells = [
                { kind: 'frac', label: S.altMode ? 'Zoom' : 'Res',
                  name: S.altMode ? 'Zoom' : 'Resolution', text: fmtRes(tpsIdx),
                  options: [0,1,2,3,4,5].map(fmtRes), sel: tpsIdx },
                { kind: 'valsq', label: 'Strch', name: 'Beat Stretch',
                  text: fmtStretch(S.bankParams[t][0][1]) },
                { kind: 'valsq', label: S.altMode ? 'Nudge' : 'Shift',
                  name: S.altMode ? 'Nudge' : 'Clock Shift',
                  text: fmtSign(S.bankParams[t][0][2]) },
                { kind: 'action', oneWay: true, label: 'Lgto', name: 'Apply Legato', text: '->' },
                { kind: 'valsq', label: 'Eucld', name: 'Euclid Fill', text: String(eucN) },
                { kind: 'blank', label: '' },
                S.altMode
                    ? toggleCell('Revrs', 'Reverse Style', _dlRev,
                                 fmtRevStyle(1), fmtRevStyle(0))
                    : { kind: 'dirsq', label: 'Dir', name: 'Playback Dir',
                        text: fmtPlayDir(_dlDir), options: KIT_DIR_NAMES, sel: _dlDir },
                toggleCell('SeqFl', 'Seq Follow', sqfl, fmtBool(1), fmtBool(0)),
            ];
            /* Named by bankDisplayName, not spelled here — this literal and
             * the one below are how the picker and the header drifted apart. */
            drawKitPage(bankHeaderName(S.activeTrack, 0), cells, false, bankPageHints(0));
        } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 7 && !S.allLanesConfirmed) {
            /* ALL LANES confirmation screen */
            drawKitHeader((Math.floor(S.clockMs / 220) % 2 === 0 ? 'ALL' : '   ') + ' LANES', false);
            print(10, 18, 'Edits will affect', 1);
            print(10, 28, 'all lanes. Proceed?', 1);
            fill_rect(40, 44, 48, 16, 1);
            print(52, 48, 'OK', 0);
        } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 7) {
            /* ALL LANES bank overview */
            const t = S.activeTrack;
            const rv = S.bankParams[t][7][0];
            const qv = S.bankParams[t][7][3];
            const dv = S.bankParams[t][7][6];
            const DIQ_LABELS = ['Off','1/64','1/32','1/16','1/16t','1/8','1/8t','1/4','1/4t'];
            const _inq = S.drumInpQuant[t] | 0;
            const cells = [
                rv < 0 ? { kind: 'frac', label: 'Res', name: 'Resolution', text: '--' }
                       : { kind: 'frac', label: 'Res', name: 'Resolution', text: fmtRes(rv),
                           options: [0,1,2,3,4,5].map(fmtRes), sel: rv },
                { kind: 'valsq', label: 'Strch', name: 'Beat Stretch',
                  text: fmtStretch(S.bankParams[t][7][1]) },
                { kind: 'valsq', label: S.altMode ? 'Nudge' : 'Shift',
                  name: S.altMode ? 'Nudge' : 'Clock Shift',
                  text: fmtSign(S.bankParams[t][7][2]) },
                qv <= 0 ? { kind: 'valsq', label: 'Quant', name: 'Quantize', text: '--' }
                        : { kind: 'arc', label: 'Quant', name: 'Quantize',
                            text: fmtPct(qv), norm: Math.min(1, qv / 100) },
                { kind: 'valsq', label: 'VelIn', name: 'Velocity Input',
                  text: fmtVelOverride(S.trackVelOverride[t]) },
                { kind: 'frac', label: 'InQnt', name: 'Input Quantize',
                  text: _offDash(DIQ_LABELS[_inq]), options: DIQ_LABELS.map(_offDash), sel: _inq },
                dv < 0 ? { kind: 'valsq', label: S.altMode ? 'Revrs' : 'Dir',
                           name: S.altMode ? 'Reverse Style' : 'Playback Dir', text: '--' }
                       : (S.altMode
                            ? toggleCell('Revrs', 'Reverse Style', dv,
                                         fmtRevStyle(1), fmtRevStyle(0))
                            : { kind: 'dirsq', label: 'Dir', name: 'Playback Dir',
                                text: fmtPlayDir(dv), options: KIT_DIR_NAMES, sel: dv }),
                toggleCell('RSync', 'Repeat Sync', S.bankParams[t][7][7],
                           fmtBool(1), fmtBool(0)),
            ];
            /* blinking "ALL" prefix: the header font is fixed-advance, so a
             * space prefix keeps "LANES" steady */
            drawKitPage((Math.floor(S.clockMs / 220) % 2 === 0 ? 'ALL' : '   ') + ' LANES', cells, false,
                        bankPageHints(7));
        } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 1) {
        /* Drum NOTE/NOTEFX bank: K1=Gate K2=Vel K3=Qnt */
        /* Drum NOTE FX: K1+K2=Oct/Note (merged), K3=Vel, K4=Qnt, K5=Len(placeholder), K6=Gate */
        const t     = S.activeTrack;
        const vals  = S.bankParams[t][1];
        const _lane = S.activeDrumLane[t];
        const _dlNote  = S.drumLaneNote[t][_lane];
        const _lenMode = S.drumLaneLenMode[t][_lane] | 0;
        const LEN_OPTS = [0,1,2,3,4,5,6,7,8].map(fmtLen);
        /* K1+K2 share the merged Oct/Note box (drawn as part of this page's
         * widget pass, BEFORE the enum overlay so a touched Len list draws on
         * top of it). Their labels don't value-swap on touch — the box already
         * shows the note readout. */
        const cells = [
            { kind: 'blank', label: 'Oct',  name: 'Lane Note' },
            { kind: 'blank', label: 'Note', name: 'Lane Note' },
            { kind: 'arcbip', label: 'Vel', name: 'Velocity Offset', text: fmtSign(vals[1]),
              signed: Math.max(-1, Math.min(1, (vals[1] | 0) / 127)) },
            { kind: 'arc', label: 'Quant', name: 'Quantize', text: fmtPct(vals[2]),
              norm: Math.max(0, Math.min(1, (vals[2] | 0) / 100)) },
            { kind: 'valsq', label: 'Len>', name: 'Note Length', text: fmtLen(_lenMode),
              options: LEN_OPTS, sel: _lenMode },
            { kind: 'arc', label: '>Gate', name: 'Gate Time', text: fmtPct(vals[0]),
              norm: Math.max(0, Math.min(1, (vals[0] | 0) / 400)) },
            { kind: 'blank', label: '' },
            { kind: 'blank', label: '' },
        ];
        {
            const _tch = S.knobTouched;
            const _tcell = _tch >= 0 && cells[_tch] && cells[_tch].name ? cells[_tch] : null;
            if (_tcell) drawKitTouchedHeader(_tcell.name);
            else drawBankHeading('NOTE FX', false);
            drawKitCells(cells, _tch);
            /* merged Oct/Note box over the K1+K2 widget span — same read-out as
             * the melodic step editor: big note name, MIDI number alongside. */
            drawNoteBox(midiNoteName(_dlNote), String(_dlNote), _tch === 0 || _tch === 1);
            /* Same retirement as drawKitPage above — this is the drum-lane
             * flavour of the same bank, and the two must not disagree. */
            const _ovi2 = enumOverlayIdx(_tch);
            drawKitEnumOverlay(cells, _ovi2);
        }

        } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 5) {
        /* Drum RPT GROOVE bank overview — 8 steps, vel scale (unshifted) or nudge (Shift) */
        const t    = S.activeTrack;
        const lane = S.activeDrumLane[t];
        syncDrumRepeatState(t, lane);
        /* Single 8-column step row: bar height = absolute step velocity
         * (1-127) on the standard page, bipolar nudge (±50%) on the jog-click
         * page; filled = gate on, outline = gate off; step number under each
         * bar (touched step inverts + header shows STEP N: value). Steps past
         * the gate length draw a stub tick and no number. */
        const _gLen = S.drumRepeatGateLen[t][lane];
        const _tk = S.knobTouched;
        if (_tk >= 0 && _tk < _gLen) {
            const _ndg = S.drumRepeatNudge[t][lane][_tk];
            const _tv  = S.drumRepeatVelScale[t][lane][_tk] | 0;
            const _val = S.altMode
                ? (_ndg > 0 ? '+' : '') + _ndg + '%'
                : (_tv > 127 ? 'Thru' : String(_tv));
            /* No step number here — the touched step's own number is already
             * highlighted in the row below. */
            drawKitTouchedHeader((S.altMode ? 'Nudge' : 'Velocity') + ': ' + _val);
        } else {
            /* ⚠ This one still said 'REPEAT GROOVE' after the rename, so a drum
             * track's bank-5 header disagreed with its own picker AND overflowed
             * the header budget at 131px. Found by the source scan, not by the
             * name table — a table can only catch a wrong name, never a second
             * place that names things. */
            drawBankHeadingInverted(bankHeaderName(S.activeTrack, 5));
        }
        const _colW = 16, _barW = 10, _top = 14, _bot = 54, _numY = 57;
        if (S.altMode) {
            /* dotted center baseline for the bipolar nudge page */
            const _cy = Math.floor((_top + _bot) / 2);
            for (let x = 0; x < 128; x += 2) set_pixel(x, _cy, 1);
        } else {
            fill_rect(0, _bot + 1, 128, 1, 1);   /* velocity baseline */
        }
        for (let k = 0; k < 8; k++) {
            const _x = k * _colW + 3;
            if (k >= _gLen) {
                fill_rect(_x + 3, _bot - 1, 4, 1, 1);   /* inactive stub */
                continue;
            }
            const gateOn = !!(S.drumRepeatGate[t][lane] & (1 << k));
            if (S.altMode) {
                const _cy = Math.floor((_top + _bot) / 2);
                const _n = S.drumRepeatNudge[t][lane][k] | 0;
                const _mag = Math.round(Math.abs(_n) / 50 * (_cy - _top));
                const _y = _n >= 0 ? _cy - _mag : _cy + 1;
                const _h = Math.max(1, _mag);
                if (_n === 0) fill_rect(_x, _cy - 1, _barW, 3, 1);
                else if (gateOn) fill_rect(_x, _y, _barW, _h, 1);
                else rectOutline(_x, _y, _barW, Math.max(2, _h), 1);
            } else {
                const _v = S.drumRepeatVelScale[t][lane][k] | 0;
                if (_v > 127) {
                    /* Thru: full-height dithered bar (outline when gated off) */
                    if (gateOn) drawThruBar(_x, _barW, _top, _bot);
                    else rectOutline(_x, _top, _barW, _bot - _top + 1, 1);
                } else {
                    const _h = Math.max(1, Math.round(_v / 127 * (_bot - _top)));
                    const _y = _bot - _h;
                    if (gateOn) fill_rect(_x, _y, _barW, _h, 1);
                    else rectOutline(_x, _y, _barW, Math.max(2, _h), 1);
                }
            }
            const _num = String(k + 1);
            const _nw = mvWidth(_num);
            const _nx = Math.round(k * _colW + _colW / 2 - _nw / 2);
            if (k === _tk) {
                fill_rect(k * _colW + 2, _numY - 1, _colW - 4, 7, 1);
                mvPrint(_nx, _numY, _num, 0);
            } else {
                mvPrint(_nx, _numY, _num, 1);
            }
        }
        } else if (S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM && bank === 1) {
        /* Melodic NOTE FX: K1=Oct, K2=Ofs, K3=Vel, K4=Qnt, K5=Len, K6=>Gate,
         * K7=blocked, K8=Rnd — canvaskit grid (proportional labels, so
         * ">Gate" needs no widened cell). */
        const t     = S.activeTrack;
        const knobs = BANKS[1].knobs;
        const vals  = S.bankParams[t][1];
        const RND_ALG_NAMES_NFX = ['Pure', 'Gaus', 'Walk'];
        /* Conductor reuses melodic NOTE FX but only Oct(K1)/Ofs(K2)/Rnd(K8) +
         * alt-K8 random-mode apply — they shape the conductor note before its
         * offset is derived. K3-K6 (Vel/Qnt/Len/Gate) are inert/greyed. */
        const _conductNfx = S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT;
        const cells = [];
        for (let k = 0; k < 8; k++) {
            if (k === 6) { cells.push({ kind: 'blank', label: '' }); continue; }  /* K7 blocked */
            if (_conductNfx && (k === 2 || k === 3 || k === 4 || k === 5)) {
                cells.push({ kind: 'blank', label: '-' });  /* inert on Conductor */
                continue;
            }
            if (S.altMode && k === 7) {
                const _md = S.noteFXRandomMode[t] || 0;
                cells.push({ kind: 'enumsq', label: 'Algo', name: 'Random Algo',
                             text: RND_ALG_NAMES_NFX[_md], options: RND_ALG_NAMES_NFX, sel: _md });
                continue;
            }
            cells.push(kitCellForKnob(knobs[k], vals[k]));
        }
        drawKitPage(BANKS[1].name, cells, false, bankPageHints(1));
        } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM && bank === 3) {
        /* Drum MIDI DLY: K1-K4 same as melodic, K5=Gate, K6=Clk, K7=Retrg, K8 empty.
         * Drum has no Pfb (no per-lane pitch) and no Rnd (no random pitch fb),
         * so K5/K6 borrow those physical slots for Gate/Clk via the per-track
         * remap in applyBankParam, and K7 hosts delay_retrig directly. */
        const t    = S.activeTrack;
        const vals = S.bankParams[t][3];
        const knobs = BANKS[3].knobs;
        const cells = [
            kitCellForKnob(knobs[0], vals[0]),
            kitCellForKnob(knobs[1], vals[1]),
            kitCellForKnob(knobs[2], vals[2]),
            kitCellForKnob(knobs[3], vals[3]),
            { kind: 'frac', label: 'Gate', name: 'Gate', text: _offDash(fmtGateMod(vals[4])),
              options: [0,1,2,3,4,5,6,7,8,9,10].map(fmtGateMod).map(_offDash), sel: vals[4] | 0 },
            { kind: 'arcbip', label: 'ClkFb', name: 'Clock Feedback', text: fmtSign(vals[5]),
              signed: Math.max(-1, Math.min(1, (vals[5] | 0) / 127)) },
            toggleCell('Retrg', 'Retrig', vals[6], fmtBool(1), fmtBool(0)),
            { kind: 'blank', label: '' },
        ];
        drawKitPage(BANKS[3].name, cells, false, bankPageHints(3));

        } else {
        /* Bank overview — canvaskit grid (widgets + label strips + touch swap) */
        const knobs = BANKS[bank].knobs;
        const vals  = S.bankParams[S.activeTrack][bank];
        const _isDrum = S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM;
        const RND_ALG_NAMES = ['Pure', 'Gaus', 'Walk'];
        const cells = [];
        for (let k = 0; k < 8; k++) {
            /* Conduct bank (CLIP bank 0 on a Conductor) K6 = CdLk lock toggle.
             * Melodic/drum CLIP K6 stays the generic stub (unchanged). */
            if (bank === 0 && k === 5 &&
                    S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT) {
                const _cdc = S.trackActiveClip[S.activeTrack] | 0;
                const _lk = S.condLock[_cdc] ? 1 : 0;
                /* ⚠ 'Lock'/'Off' is HALF a boolean pair, so this stays the bar
                  * by the rule — the ON state is NAMED, and a pill would throw
                  * the name away. Spell it 'On' and it becomes a pill on its
                  * own; that is the decision, not an oversight. */
                cells.push(toggleCell('CdLk', 'Conduct Lock', _lk, 'Lock', 'Off'));
                continue;
            }
            /* Shift+K1 on DELAY bank (melodic): flips to delay_clock_fb.
             * Drum: K6 already holds clock_fb directly via remap; no flip. */
            const _delayShiftClkF = S.altMode && !_isDrum && bank === 3 && k === 0;
            const _clipDirAlt    = S.altMode && !_isDrum && knobs[k].dspKey === 'clip_playback_dir';
            const _rndAltAlgo    = S.altMode && !_isDrum && (bank === 1 || bank === 3) && k === 7;
            if (_rndAltAlgo) {
                const _md = bank === 3 ? (S.midiDlyRandomMode[S.activeTrack] || 0)
                                       : (S.noteFXRandomMode[S.activeTrack] || 0);
                cells.push({ kind: 'enumsq', label: 'Algo', name: 'Random Algo',
                             text: RND_ALG_NAMES[_md], options: RND_ALG_NAMES, sel: _md });
                continue;
            }
            if (_delayShiftClkF) {
                const _cv = S.delayClockFb[S.activeTrack] | 0;
                const _cc = { kind: 'arcbip', label: 'ClkFb', name: 'Clock Feedback',
                              text: fmtSign(_cv), signed: Math.max(-1, Math.min(1, _cv / 127)) };
                markSeqAuto(_cc, bank, k, true);
                cells.push(_cc);
                continue;
            }
            if (_clipDirAlt) {
                const _rv = S.clipPlaybackAudioReverse[S.activeTrack][effectiveClip(S.activeTrack)] | 0;
                cells.push(toggleCell('Revrs', 'Reverse Style', _rv,
                                      fmtRevStyle(1), fmtRevStyle(0)));
                continue;
            }
            const cell = kitCellForKnob(knobs[k], vals[k]);
            if (S.altMode) {
                if      (knobs[k].dspKey === 'clock_shift')     { cell.label = 'Nudge'; cell.name = 'Nudge'; }
                else if (knobs[k].dspKey === 'clip_resolution') { cell.label = 'Zoom'; cell.name = 'Zoom'; }
            }
            /* The bank knob IS the parameter a macro can point at, so its
             * automation shows HERE too (Josh, 2026-09-03): the circle. */
            markSeqAuto(cell, bank, k, false);
            cells.push(cell);
        }
        drawKitPage(bankHeaderName(S.activeTrack, bank), cells, false, bankPageHints(bank));
        }

    } else if (S.trackPadMode[S.activeTrack] === PAD_MODE_DRUM) {
        /* Drum Track View — idle state */
        const t         = S.activeTrack;
        const lane      = S.activeDrumLane[t];
        const pg        = S.drumLanePage[t];
        const note      = S.drumLaneNote[t][lane];
        const oct       = Math.floor(note / 12) - 2;
        const name      = NOTE_KEYS[note % 12];
        const bankGroup = pg === 0 ? 'Bank:A' : 'Bank:B';
        /* ⚠ The name comes from bankDisplayName now — these aliases used to be
         * written out here, where only this screen could see them. The BLINK
         * stays local: it is this header's animation, not part of the name. */
        const _bnStatic = bankHeaderName(t, S.activeBank);
        const bankName  = S.activeBank === 7
            ? (Math.floor(S.clockMs / 220) % 2 === 0 ? 'ALL' : '   ') + ' LANES'
            : _bnStatic;
        (S.activeBank === 5 ? drawBankHeadingInverted : drawBankHeading)(bankName, false, true);
        /* info row at y=9, in the STOCK face (2026-09-05) — 2px clear of the header */
        ovwPrint(4, 9, bankGroup + '  Pad:' + name + oct + ' (' + note + ')', 1);
        const laneBit = 1 << lane;
        if (S.drumLaneSolo[t] & laneBit) {
            ovwPrint(128 - 4 - ovwWidth('SOLOED'), 17, 'SOLOED', 1);
        } else if (S.drumLaneMute[t] & laneBit) {
            if (Math.floor(S.clockMs / 440) % 2 === 0)
                ovwPrint(128 - 4 - ovwWidth('MUTED'), 17, 'MUTED', 1);
        }
        drawMetroIndicator();
        drawOverviewTracks(overviewHints());
        drawDrumPositionBar(t);
    } else {
        /* State 4: normal Track View */
        const recTag  = (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === S.activeTrack)
            ? ' REC' : '';
        const oct     = S.trackOctave[S.activeTrack];
        const octStr  = 'Oct:' + (oct >= 0 ? '+' : '') + oct;
        const keyScl  = NOTE_KEYS[S.padKey] + ' ' + (SCALE_DISPLAY[S.padScale] || '?');
        const keySclW = ovwWidth(keyScl);
        const keySclX = 128 - 4 - keySclW;
        (S.activeBank === 5 ? drawBankHeadingInverted : drawBankHeading)(bankHeaderName(S.activeTrack, S.activeBank) + recTag, false, true);
        /* info row at y=9 in the small header face (Josh, 2026-09-05) — 2px
         * clear of the header; the glyphs end at y=13 and the scale rule is 15. */
        ovwPrint(4, 9, octStr, 1);
        if (S.bankParams[S.activeTrack][5][0]) {
            const arpW = ovwWidth('Arp');
            if (S.bankParams[S.activeTrack][5][7]) {
                /* Latch on: invert 'Arp' (black on white chip), 1px pad around
                 * the 4x5 glyphs at (52, 9). */
                fill_rect(51, 8, arpW + 2, 7, 1);
                ovwPrint(52, 9, 'Arp', 0);
            } else {
                ovwPrint(52, 9, 'Arp', 1);
            }
        }
        ovwPrint(keySclX, 9, keyScl, 1);
        if (S.scaleAware) fill_rect(keySclX, 15, keySclW, 1, 1);
        drawMetroIndicator();
        drawOverviewTracks(overviewHints());
        drawPositionBar(S.activeTrack);
    }
}

function drawDrumPositionBar(t) {
    const lsBase = S.drumLaneLoopStart[t] | 0;
    const len    = S.drumLaneLength[t];
    const startPage = lsBase >> 4;
    const winPages  = Math.max(1, Math.ceil(len / 16));
    const viewPage  = Math.max(0, Math.min(S.drumStepPage[t] - startPage, winPages - 1));
    const cs        = S.drumCurrentStep[t];
    const playPage  = (S.playing && S.trackClipPlaying[t] && cs >= lsBase && cs < lsBase + len)
                    ? Math.floor((cs - lsBase) / 16) : -1;
    const barY = 50, barH = 4, segGap = 1;   /* 2026-09-05: the hint footer owns row 57 */
    const segW   = Math.max(2, Math.floor((120 - (winPages - 1) * segGap) / winPages));
    const startX = 4;
    for (let pg = 0; pg < winPages; pg++) {
        const x = startX + pg * (segW + segGap);
        if (pg === viewPage) {
            fill_rect(x, barY, segW, barH, 1);
        } else if (pg === playPage) {
            fill_rect(x, barY, segW, 1, 1);
            fill_rect(x, barY + barH - 1, segW, 1, 1);
            fill_rect(x, barY, 1, barH, 1);
            fill_rect(x + segW - 1, barY, 1, barH, 1);
        } else {
            fill_rect(x, barY + barH - 1, segW, 1, 1);
        }
    }
    if (S.playing && S.trackClipPlaying[t] && cs >= lsBase && cs < lsBase + len) {
        const winPxW = winPages * (segW + segGap) - segGap;
        const dotX = startX + Math.floor((cs - lsBase) * winPxW / Math.max(1, len));
        const viewSegStart = startX + viewPage * (segW + segGap);
        const onSolid = dotX >= viewSegStart && dotX < viewSegStart + segW;
        fill_rect(dotX, barY, 1, barH, onSolid ? 0 : 1);
    }
    /* Extent markers from the active lane's step mirror. */
    const lane  = S.activeDrumLane[t];
    const steps = S.drumLaneSteps[t][lane];
    let hasLeft = false, hasRight = false;
    for (let s = 0; s < lsBase; s++) if (steps[s] !== '0') { hasLeft = true; break; }
    for (let s = lsBase + len; s < 256; s++) if (steps[s] !== '0') { hasRight = true; break; }
    if (hasLeft)  fill_rect(startX - 2, barY + 1, 1, barH - 2, 1);
    if (hasRight) {
        const xRight = startX + winPages * (segW + segGap) - segGap + 1;
        fill_rect(xRight, barY + 1, 1, barH - 2, 1);
    }
}
