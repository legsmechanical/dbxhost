/* ui_wav.mjs — dAVEBOx's fullscreen sample-marker editor.
 *
 * ⭐ WHAT IT CLOSES. Josh, from the device (2026-09-06): "the touch click
 * gesture to enter full screen wave doesn't do anything." It did fire —
 * `openParamEditor` dived out correctly — and landed in davebox's bank editor,
 * which has file, text and enum screens and nothing that draws a waveform.
 * There was no wave screen to land in. This is it.
 *
 * ⚠⚠ THIS FILE OWNS NO ARITHMETIC. Every unit conversion, ratio, zoom window,
 * write precision, marker/knob role and path resolution comes from
 * `shared/param_pages/wav_position.mjs`, which the host can call too. What
 * lives here is the SCREEN: davebox's chrome, davebox's input grammar, and
 * davebox's write ledger.
 *
 * ⚠ AND IT DOES NO FILE IO. Peaks come from `wav_peaks.mjs` — streamed, two
 * blocks a tick, capped at 2 MB, cached. The host's editor reads and sweeps the
 * WHOLE file inside its draw call; on this device a blocked tick overflows the
 * input ring and drops note-offs, and a dropped note-off is a stuck note in
 * both Move and the slot synth. The price is resolution at extreme zoom (128
 * source columns), which is a picture problem, not an audio one.
 */

/* ⚠ The drawing primitives are HOST GLOBALS (`clear_screen`, `print`,
 * `fill_rect`, `text_width`), implemented in C and installed on globalThis —
 * they are not importable, and ui_movy says so at the top of its own file. */
import {
    drawKitSampleSpan, drawKitHeaderParamPages, drawKitHintRow, drawKitCrumbs,
} from './ui_movy.mjs';
import {
    isWavPosition, wavPositionMeta, wavPositionText, wavPositionRatio, wavRatioKnown,
    wavSetPrecision, wavKnobStep, wavZoomWindow, wavZoomLabel, wavMarkerInWindow,
    wavViewGroupMembers, wavKnobRole, wavWindowColumns, resolveWavSourcePath,
    wavBaseName, clampWavZoom, WAV_ZOOM_STEP, WAV_ZOOM_MAX, WAV_ZOOM_KNOB,
} from '/data/UserData/schwung/shared/param_pages/wav_position.mjs';
import {
    wavPeaks, wavPeaksTick, wavPeaksDone,
} from '/data/UserData/schwung/shared/param_pages/wav_peaks.mjs';

/* The plot, in the panel between header and footer. */
const PLOT_X = 3, PLOT_Y = 13, PLOT_W = 122, PLOT_H = 38;

/*
 * ⚠⚠ ZOOM IS PER GROUP AND SURVIVES THE SCREEN, but not the component.
 *
 * Leaving zoom on exit would cost you 64x every time you glanced at another
 * parameter and came back; never clearing it would carry one module's zoom into
 * the next module loaded into the same slot, where the file is a different
 * length and the window means something else. So it is keyed by component and
 * group, and `wavForgetComponent` is called when the editor leaves a component.
 */
const zoomByGroup = new Map();
const zoomKey = (comp, meta) =>
    `${comp}::${(meta && meta.view_group) || (meta && meta.key) || ''}`;

/* The live screen, or null. Module-level like every other davebox view state. */
let W = null;
/* What the last draw actually showed, so a test can assert on the SCREEN's
 * reading rather than on the state that fed it. */
let lastFrame = null;

export function wavEditActive() { return W !== null; }
export function wavEditState() { return W ? { ...W } : null; }
export function wavEditFrameForTest() { return lastFrame; }

/** Drop a component's zoom — call when the editor leaves that component. */
export function wavForgetComponent(comp) {
    for (const k of [...zoomByGroup.keys()]) {
        if (k.startsWith(`${comp}::`)) zoomByGroup.delete(k);
    }
}

/*
 * Open the editor on one marker.
 *
 * `io` is davebox's half, injected so this file holds no davebox state:
 *   getParam(fullKey)    -> string        a live read
 *   setParam(fullKey, v)                  MUST enter the write ledger, never engineSet
 *   metaOf(bareKey)      -> meta|null     for a filepath param's root/start_path
 *   buildKey(bareKey)    -> fullKey       scoped to the component/child on screen
 *   exists(path)         -> bool
 *   params               -> [{key, fullKey, meta}]  the level's params, IN ORDER
 *   durationSec          -> number        0 when unknown
 *   crumbs               -> string[]      the path to this screen
 */
export function wavEditOpen({ key, fullKey, meta, comp, io }) {
    const expanded = isWavPosition(meta) ? wavPositionMeta(meta) : null;
    if (!expanded) return false;
    const members = wavViewGroupMembers(io.params || [], expanded.view_group);
    W = {
        key, fullKey, meta: expanded, comp, io,
        members,
        /* The ACTIVE marker is an index into members, or -1 when this param is
         * not part of a group. A single marker is not member 0 of a group of
         * one: the knob roles differ, and conflating them is how a legacy
         * module loses its knob row. */
        active: members.findIndex((m) => m.fullKey === fullKey),
        notice: null, noticeUntil: 0,
    };
    return true;
}

export function wavEditClose() {
    W = null;
    lastFrame = null;
}

/** The parameter the screen is editing right now (follows marker selection). */
function activeMarker() {
    if (!W) return null;
    if (W.active >= 0 && W.members[W.active]) {
        const m = W.members[W.active];
        return { key: m.key, fullKey: m.fullKey, meta: m.meta };
    }
    return { key: W.key, fullKey: W.fullKey, meta: W.meta };
}

function zoomOf() {
    if (!W) return 0;
    return clampWavZoom(zoomByGroup.get(zoomKey(W.comp, W.meta)) || 0);
}
function setZoom(z) {
    if (!W) return;
    const v = clampWavZoom(z);
    const k = zoomKey(W.comp, W.meta);
    if (v <= 0) zoomByGroup.delete(k); else zoomByGroup.set(k, v);
}

function notice(text, ms = 700) {
    if (!W) return;
    W.notice = text;
    W.noticeUntil = Date.now() + ms;
}

function sourcePath() {
    if (!W) return '';
    const a = activeMarker();
    return resolveWavSourcePath(a.meta, {
        getParam: W.io.getParam,
        metaOf: W.io.metaOf,
        buildKey: W.io.buildKey,
        exists: W.io.exists,
    });
}

/*
 * Advance the streamed peaks. Called from davebox's tick while this view is up.
 *
 * ⚠ `wavPeaksDone` is asked FIRST so a settled file costs one map lookup a
 * tick rather than a job restart.
 */
export function wavEditTick() {
    if (!W) return;
    const path = sourcePath();
    if (!path) return;
    if (wavPeaksDone(path)) return;
    wavPeaksTick(path);
}

/* ------------------------------------------------------------------ input */

/*
 * A knob turn. Returns true when the editor consumed it.
 *
 * ⚠⚠ EVERY UNCLAIMED KNOB IS SWALLOWED IN A GROUP. The page's own knob mapping
 * is still underneath this screen, so an unclaimed encoder would edit an
 * unrelated parameter of the module while the user is looking at a waveform —
 * silently, because nothing on screen names it. `wavKnobRole` returns "silent"
 * for exactly that reason; a LEGACY marker (no zoom, no group) claims nothing
 * at all and the module keeps its whole row.
 */
export function wavEditOnKnob(knobIndex, delta, shiftHeld) {
    if (!W || !delta) return false;
    const role = wavKnobRole(knobIndex, { members: W.members, meta: W.meta });
    if (!role) return false;
    if (role.type === 'silent') return true;

    if (role.type === 'zoom') {
        const next = clampWavZoom(zoomOf() + delta * WAV_ZOOM_STEP);
        setZoom(next);
        notice(`Zoom ${wavZoomLabel(next)}`);
        return true;
    }

    /* A marker knob EDITS ITS OWN MARKER, and selects it: turning knob 3 while
     * looking at knob 1's marker should move knob 3's, not the one that
     * happened to be active. */
    const idx = W.members.indexOf(role.member);
    if (idx >= 0) W.active = idx;
    writeMarker(role.member, delta, shiftHeld);
    return true;
}

function writeMarker(member, delta, shiftHeld) {
    if (!W) return;
    const meta = member.meta;
    const step = wavKnobStep(meta, zoomOf(), shiftHeld);
    const cur = Number(W.io.getParam(member.fullKey));
    const base = Number.isFinite(cur) ? cur : Number(meta.min) || 0;
    const min = Number(meta.min), max = Number(meta.max);
    let next = base + delta * step;
    if (Number.isFinite(min) && next < min) next = min;
    if (Number.isFinite(max) && next > max) next = max;
    /* ⚠⚠ THE PRECISION IS NOT COSMETIC. At high zoom one detent moves the value
     * by less than a thousandth; rounded to the step's own precision it writes
     * back identical and the marker does not move — a dead encoder at exactly
     * the zoom where precision was the point. */
    const text = next.toFixed(wavSetPrecision(meta));
    /* ⚠ Through davebox's LEDGER, never a raw engineSet: in overtake the host
     * has ~8 ms of mailbox patience and then STOMPS an unconsumed request, so a
     * per-detent write vanishes with nothing logged. */
    W.io.setParam(member.fullKey, text);
    notice(`${labelOf(member)} ${wavPositionText(text, meta, W.io.durationSec || 0)}`);
}

function labelOf(member) {
    return String(member.label || member.meta.marker_label || member.meta.name || member.key)
        .toUpperCase();
}

/*
 * A knob TOUCH. In a group this SELECTS the marker without changing it — the
 * fastest way to move the cursor to another marker is to put a finger on its
 * encoder. The zoom knob reports the zoom rather than changing it.
 */
export function wavEditOnKnobTouch(knobIndex) {
    if (!W) return false;
    const role = wavKnobRole(knobIndex, { members: W.members, meta: W.meta });
    if (!role) return false;
    if (role.type === 'silent') return true;
    if (role.type === 'zoom') { notice(`Zoom ${wavZoomLabel(zoomOf())}`); return true; }
    const idx = W.members.indexOf(role.member);
    if (idx >= 0) {
        W.active = idx;
        const v = W.io.getParam(role.member.fullKey);
        notice(`${labelOf(role.member)} ${wavPositionText(v, role.member.meta, W.io.durationSec || 0)}`);
    }
    return true;
}

/*
 * The jog moves the ACTIVE marker. Shift is the fine step — ⚠ NOT a zoom, even
 * for a zoomable param: the zoom lives on knob 8, and one gesture meaning two
 * things depending on which kind of marker you are on is how the host's version
 * ended up with a `!view_group` guard nobody could explain.
 */
export function wavEditOnJog(delta, shiftHeld) {
    if (!W || !delta) return false;
    const a = activeMarker();
    writeMarker({ ...a, label: labelOf(a) }, delta, shiftHeld);
    return true;
}

/* ------------------------------------------------------------------- draw */

export function renderWavEdit() {
    if (!W) return false;
    clear_screen();

    const a = activeMarker();
    const dur = W.io.durationSec || 0;
    const raw = W.io.getParam(a.fullKey);
    const ratio = wavPositionRatio(raw, a.meta, dur);
    const known = wavRatioKnown(raw, a.meta, dur);
    const zoom = zoomOf();
    const win = wavZoomWindow(ratio, zoom, false);
    const path = sourcePath();

    const zoomSuffix = zoom > 0 ? ` ${wavZoomLabel(zoom)}` : '';
    drawKitHeaderParamPages(labelOf({ ...a, label: null }),
                            wavPositionText(raw, a.meta, dur) + zoomSuffix, true);

    /* ⚠ NO FILE, NO PLOT — and say which, rather than drawing an empty frame
     * that reads as a silent sample. */
    if (!path) {
        centre('No sample linked', 30);
        footer();
        lastFrame = { path: '', reason: 'no file', markers: [] };
        return true;
    }

    const cache = wavPeaks(path);
    const peaks = (cache && cache.points && cache.points.length) ? cache.points : null;
    if (cache && cache.error) {
        centre(wavBaseName(path), 26);
        centre(String(cache.error), 36);
        footer();
        lastFrame = { path, reason: cache.error, markers: [] };
        return true;
    }
    if (!peaks) {
        centre(wavBaseName(path), 26);
        centre('reading…', 36);
        footer();
        lastFrame = { path, reason: 'reading', markers: [] };
        return true;
    }

    /* The columns for THIS window, then davebox's own sample drawer — the same
     * one the knob cells use, given a rect instead of a cell span. */
    const cols = wavWindowColumns(peaks, win, PLOT_W - 2);
    const marks = [];
    const viz = {
        start: 0, count: 4,
        rect: { x: PLOT_X + 1, y: PLOT_Y + 1, w: PLOT_W - 2, h: PLOT_H - 2 },
        peaks: cols,
    };
    /* The ACTIVE marker is the cursor; siblings are drawn after, as ticks, so
     * they never win the column the cursor is in. */
    if (known) viz.pos = wavMarkerInWindow(ratio, win).pos;
    drawKitSampleSpan(0, viz);

    for (const m of W.members) {
        const r = wavPositionRatio(W.io.getParam(m.fullKey), m.meta, dur);
        const at = wavMarkerInWindow(r, win);
        const isActive = m.fullKey === a.fullKey;
        const mx = PLOT_X + 1 + Math.min(PLOT_W - 3, Math.floor(at.pos * (PLOT_W - 2)));
        if (!isActive) {
            /* Dashed, so a sibling never reads as the thing you are moving. */
            for (let y = PLOT_Y + 1; y < PLOT_Y + PLOT_H - 1; y += 2) fill_rect(mx, y, 1, 1, 1);
        }
        /* ⚠ AN OFFSCREEN SIBLING STILL GETS A MARK. Zoom in far enough and every
         * other marker leaves the window; with nothing at the edge the screen
         * says the file has one marker, which is a lie you act on. */
        if (at.off !== 0) {
            const ex = at.off < 0 ? PLOT_X + 1 : PLOT_X + PLOT_W - 2;
            for (let y = PLOT_Y + 3; y < PLOT_Y + PLOT_H - 3; y += 3) fill_rect(ex, y, 1, 1, 1);
        }
        marks.push({ key: m.key, pos: at.pos, off: at.off, active: isActive });
        const lbl = labelOf(m);
        const lx = Math.max(0, Math.min(128 - text_width(lbl), mx - Math.floor(text_width(lbl) / 2)));
        print(lx, PLOT_Y - 8, lbl, 1);
    }

    /* ⚠ A TIME MARKER WITH NO DURATION is not at the file start — it is
     * unplaceable, and drawing a confident cursor at 0 is the lie this says out
     * loud instead. */
    if (!known) centre('no duration', PLOT_Y + PLOT_H + 1);

    footer();
    lastFrame = { path, reason: null, markers: marks, zoom, window: win };
    return true;
}

function centre(text, y) {
    const t = String(text);
    print(Math.max(0, Math.floor((128 - text_width(t)) / 2)), y, t, 1);
}

function footer() {
    if (W && W.notice && Date.now() < W.noticeUntil) {
        drawKitCrumbs([W.notice]);
        return;
    }
    const hints = [['BACK', 'OUT'], ['JOG', 'MOVE']];
    if (W && (W.members.length > 1 || W.meta.enable_zoom)) hints.push(['K8', 'ZOOM']);
    drawKitHintRow(null, hints);
}
