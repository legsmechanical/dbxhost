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
    drawKitSampleSpan, drawKitHeaderParamPages, drawKitHintRow, MV_FOOTER_Y,
} from './ui_movy.mjs';
import {
    isWavPosition, wavPositionMeta, wavPositionText, wavPositionRatio, wavRatioKnown,
    wavSetPrecision, wavKnobStep, wavZoomWindow, wavZoomLabel, wavMarkerInWindow,
    wavViewGroupMembers, wavKnobRole, wavWindowColumns, resolveWavSourcePath,
    wavBaseName, clampWavZoom, wavZoomOffered,
    WAV_ZOOM_STEP, WAV_ZOOM_MAX, WAV_ZOOM_KNOB,
} from '/data/UserData/schwung/shared/param_pages/wav_position.mjs';
import {
    wavPeaks, wavPeaksTick, wavPeaksDone, wavPeaksHasIo,
} from '/data/UserData/schwung/shared/param_pages/wav_peaks.mjs';

/* The plot, in the panel between header and footer. */
/* ⚠ The marker labels print ABOVE the plot, so PLOT_Y must leave room for them
 * BELOW the header band (y 0..6) — at PLOT_Y 13 they landed at y=5, inside it.
 * And the plot must end clear of the footer band at MV_FOOTER_Y. */
const PLOT_X = 3, PLOT_Y = 16, PLOT_W = 122, PLOT_H = 36;
const LABEL_Y = PLOT_Y - 8;

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
/* ⚠⚠ THE SLOT IS PART OF THE KEY. Component names REPEAT across tracks (every
 * chain slot has a `synth`), so keying on component alone meant two tracks
 * holding the same module shared one zoom entry: set 64x on track 1's sampler,
 * open track 3's, and you land at 64x on a different file of a different
 * length. */
const zoomKey = (slot, comp, meta) =>
    `${slot}::${comp}::${(meta && meta.view_group) || (meta && meta.key) || ''}`;

/* The live screen, or null. Module-level like every other davebox view state. */
let W = null;
/* What the last draw actually showed, so a test can assert on the SCREEN's
 * reading rather than on the state that fed it. */
let lastFrame = null;

export function wavEditActive() { return W !== null; }
/*
 * The FILE this screen is about, as a wire key — what a browser would edit.
 *
 * ⚠⚠ WHY THIS EXISTS. Before this screen, clicking a sample marker dived to
 * davebox's bank editor, which is where the file browser lives. Taking that
 * dive for the waveform removed the only route to CHANGING the sample:
 * reported from the device as "no way to browse kits or samples". The editor
 * has to offer the browse itself, so the host needs to know which key to open.
 */
export function wavEditFileKey() {
    if (!W) return null;
    const a = activeMarker();
    const declared = String((a.meta && a.meta.filepath_param) || '').trim();
    if (!declared) return null;
    return declared.includes(':') ? declared
         : (W.io.siblingKey ? W.io.siblingKey(declared) : W.io.buildKey(declared));
}
/*
 * What this screen is called in a breadcrumb: the marker, and the instance it
 * belongs to when there is one — "PAD 7 START".
 *
 * ⚠ NOT the header string. A header may spend the full 128px; a crumb shares
 * 116px with the rest of the path, and `drawKitHeaderParamPages` truncates its
 * own left side anyway. Both read from here so the two cannot drift, which is
 * the failure this file has already had once with the marker LABEL.
 */
export function wavEditCrumb() {
    if (!W) return '';
    const a = activeMarker();
    const where = W.crumbs && W.crumbs.length ? String(W.crumbs[W.crumbs.length - 1]) : '';
    const what = labelOf({ ...a, label: null });
    return where ? `${where} ${what}` : what;
}

export function wavEditState() { return W ? { ...W } : null; }
export function wavEditFrameForTest() { return lastFrame; }

/** Drop a component's zoom — call when the editor leaves that component. */
export function wavForgetComponent(comp, slot) {
    const suffix = `::${comp}::`;
    for (const k of [...zoomByGroup.keys()]) {
        if (slot === undefined ? k.includes(suffix) : k.startsWith(`${slot}${suffix}`)) {
            zoomByGroup.delete(k);
        }
    }
}

/*
 * Open the editor on one marker.
 *
 * `io` is davebox's half, injected so this file holds no davebox state:
 *   getParam(fullKey)    -> string        a live read
 *   setParam(fullKey, v)                  MUST enter the write ledger, never engineSet
 *   metaOf(bareKey)      -> meta|null     for a filepath param's root/start_path
 *   buildKey(bareKey)    -> fullKey       scoped to the component
 *   siblingKey(bareKey)  -> fullKey       scoped to the component AND INSTANCE —
 *                                         a child level's bare declaration means
 *                                         "this pad's", not "the component's"
 *   exists(path)         -> bool
 *   params               -> [{key, fullKey, meta}]  the level's params, IN ORDER
 *   durationSec          -> number        0 when unknown
 *   crumbs               -> string[]      the path to this screen
 */
export function wavEditOpen({ key, fullKey, meta, comp, slot = 0, io }) {
    const expanded = isWavPosition(meta) ? wavPositionMeta(meta) : null;
    if (!expanded) return false;
    /* The path to this screen, as the caller knows it — see wavEditCrumb. */
    const crumbs = (io && Array.isArray(io.crumbs)) ? io.crumbs.slice() : [];
    const members = wavViewGroupMembers(io.params || [], expanded.view_group);
    W = {
        key, fullKey, meta: expanded, comp, slot, io,
        crumbs,
        members,
        /* ⚠⚠ RESOLVED ONCE. Every resolution is one param read plus up to three
         * `stat`s, and this used to run in the DRAW — per frame, plus once more
         * per tick. A read on the draw path costs more than the whole page
         * render, which is the rule wav_peaks.mjs and binding_movy both state
         * outright. The link is re-checked once a tick against the RAW value
         * (one read), and only re-resolved when that value actually changes. */
        rawLink: null, path: '',
        /* The ACTIVE marker is an index into members, or -1 when this param is
         * not part of a group. A single marker is not member 0 of a group of
         * one: the knob roles differ, and conflating them is how a legacy
         * module loses its knob row. */
        active: members.findIndex((m) => m.fullKey === fullKey),
        notice: null, noticeUntil: 0,
    };
    refreshSourcePath();
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
    return clampWavZoom(zoomByGroup.get(zoomKey(W.slot, W.comp, W.meta)) || 0);
}
function setZoom(z) {
    if (!W) return;
    const v = clampWavZoom(z);
    const k = zoomKey(W.slot, W.comp, W.meta);
    if (v <= 0) zoomByGroup.delete(k); else zoomByGroup.set(k, v);
}

function notice(text, ms = 700) {
    if (!W) return;
    W.notice = text;
    W.noticeUntil = Date.now() + ms;
}

/*
 * The resolved file, from the cache. NEVER resolves — see `refreshSourcePath`.
 * Safe to call from the draw path, which is the whole point.
 */
function sourcePath() { return W ? W.path : ''; }

/*
 * Re-resolve only when the module's own filepath value has CHANGED.
 *
 * One param read a tick to notice; the `stat`s only on a real change. The
 * alternative — resolving in the draw — was a filesystem round trip per frame
 * on a screen whose entire job is to redraw smoothly.
 */
function refreshSourcePath() {
    if (!W) return;
    const a = activeMarker();
    const declared = String((a.meta && a.meta.filepath_param) || '').trim();
    if (!declared) { W.rawLink = ''; W.path = ''; return; }
    const linkedKey = declared.includes(':') ? declared
        : (W.io.siblingKey ? W.io.siblingKey(declared) : W.io.buildKey(declared));
    const raw = W.io.getParam(linkedKey);
    if (raw === W.rawLink) return;
    W.rawLink = raw;
    /*
     * ⚠⚠ A DIAGNOSTIC, and it earns its place. Three rounds of inference about
     * why a loaded pad reports "file not found" were each wrong — the key is
     * right, the file exists and is readable, the format is supported, the
     * shared library on the device is the new one. Everything checkable from
     * OUTSIDE the process says it should work, so the fact has to come from
     * INSIDE it. Logged once per resolve (the guard above returns unless the
     * module's value actually changed), never per tick.
     */
    const _dbgExists = (p) => { try { return W.io.exists(p) ? 'yes' : 'no'; } catch (e) { return 'threw:' + e; } };
    W.path = resolveWavSourcePath(a.meta, {
        getParam: W.io.getParam,
        metaOf: W.io.metaOf,
        buildKey: W.io.buildKey,
        /* ⚠⚠ WITHOUT THIS the resolver falls back to buildKey, which scopes to
         * the COMPONENT — and a child level's bare declaration means "this
         * pad's". That is the whole DR32 bug. An earlier edit added it to a
         * function that no longer existed in that shape, the replace matched
         * nothing, reported success, and the fix was never in the tree. */
        siblingKey: W.io.siblingKey,
        exists: W.io.exists,
    });
    console.log('[wav] key=' + linkedKey
              + ' raw=' + JSON.stringify(raw)
              + ' resolved=' + JSON.stringify(W.path)
              + ' exists=' + _dbgExists(W.path)
              + ' peaksIo=' + (wavPeaksHasIo && wavPeaksHasIo() ? 'yes' : 'no'));
}

/*
 * Advance the streamed peaks. Called from davebox's tick while this view is up.
 *
 * ⚠ `wavPeaksDone` is asked FIRST so a settled file costs one map lookup a
 * tick rather than a job restart.
 */
export function wavEditTick() {
    if (!W) return;
    refreshSourcePath();
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
    const text = next.toFixed(
        wavSetPrecision(meta, { zoomable: wavZoomOffered(W.meta, W.members.length) }));
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
    /* ⭑ THE INSTANCE IS PART OF THE NAME. "START" alone does not say which of
     * DR32's thirty-two pads you are trimming, and the page this screen was
     * dived from was showing exactly that. The header fits its own left side
     * and drops the pad first if the value needs the room. */
    drawKitHeaderParamPages(wavEditCrumb(),
                            wavPositionText(raw, a.meta, dur) + zoomSuffix, true);

    /* ⚠ NO FILE, NO PLOT — and say which, rather than drawing an empty frame
     * that reads as a silent sample. */
    if (!path) {
        centre('No sample linked', 26);
        if (wavEditFileKey()) centre('shift+click to choose one', 37);
        footer();
        lastFrame = { path: '', reason: 'no file', markers: [] };
        return true;
    }

    const cache = wavPeaks(path);
    /* ⚠⚠ NORMALISED. `points` are absolute 0..1 sample peaks and `peak` is the
     * file's loudest — the cell widget divides by it, and without that a sample
     * peaking at 0.25 draws as a near-flat line here while filling its 15px
     * knob cell. Same file, two pictures, and the fullscreen one looks broken. */
    const rawPts = (cache && cache.points && cache.points.length) ? cache.points : null;
    const norm = (cache && cache.peak > 0) ? cache.peak : 1;
    const peaks = rawPts ? (norm === 1 ? rawPts : rawPts.map((v) => Math.min(1, v / norm))) : null;
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
        print(lx, LABEL_Y, lbl, 1);
    }

    /* ⚠ A TIME MARKER WITH NO DURATION is not at the file start — it is
     * unplaceable, and drawing a confident cursor at 0 is the lie this says out
     * loud instead. */
        /* ⚠ Inside the plot, not under it: PLOT_Y + PLOT_H is already at the
     * footer band, and this used to print straight over the hints. */
    if (!known) centre('no duration', PLOT_Y + PLOT_H - 9);

    footer();
    lastFrame = { path, reason: null, markers: marks, zoom, window: win };
    return true;
}

function centre(text, y) {
    const t = String(text);
    print(Math.max(0, Math.floor((128 - text_width(t)) / 2)), y, t, 1);
}

function footer() {
    /* ⚠⚠ IN THE FOOTER BAND. The first cut sent this through drawKitCrumbs,
     * which is anchored at y=0 and fills its box with ink 0 — so every detent
     * and every touch erased the header's value readout AND all the marker
     * labels for 700 ms, i.e. exactly while you were reading them. */
    if (W && W.notice && Date.now() < W.noticeUntil) {
        const t = String(W.notice).toUpperCase();
        fill_rect(0, MV_FOOTER_Y, 128, 64 - MV_FOOTER_Y, 0);
        print(Math.max(0, Math.floor((128 - text_width(t)) / 2)), MV_FOOTER_Y + 1, t, 1);
        return;
    }
    const hints = [['BACK', 'OUT'], ['JOG', 'MOVE']];
    if (W && wavEditFileKey()) hints.push(['SHFT CLK', 'FILE']);
    if (W && wavZoomOffered(W.meta, W.members.length)) hints.push(['K8', 'ZOOM']);
    drawKitHintRow(null, hints);
}
