/*
 * wav_position.mjs — the arithmetic behind a sample-position marker.
 *
 * ⭐ WHY THIS FILE EXISTS. The fullscreen wave editor was written once, inside
 * `src/shadow/shadow_ui.js`, woven through that file's hierarchy-editor
 * globals. dAVEBOx cannot reach it: a module may import from `shared/` and
 * never from `shadow/` (the QuickJS loader rewrites only that prefix), which is
 * the same constraint that moved the param-pages binding here. So a click on a
 * sample cell in dAVEBOx's editor dived out and landed on a screen that draws
 * no waveform, and there was nowhere to put one.
 *
 * What lives here is the third of that editor which is PURE: the meta
 * expansion, the unit conversions, the ratio and precision arithmetic, the zoom
 * window, the marker/knob role table, and the path resolution (with its reads
 * injected). No globals, no drawing, no file IO — so it is node-testable, and
 * both hosts can call it and agree by construction rather than by two people
 * being careful.
 *
 * ⚠⚠ WHAT IS DELIBERATELY *NOT* HERE, and it is most of the original:
 *   - the PIXEL LOOP. Each host draws with what it has. dAVEBOx's
 *     `drawKitSampleSpan` is the better drawer of the two — its column
 *     arithmetic is `min(w-1, floor(p*w))`, and its own comment explains that
 *     the obvious `round(p*(w-1))` disagrees for a quarter of all positions.
 *     The host uses exactly that `round` form. Lifting the loop would ship the
 *     worse one twice.
 *   - the WHOLE-FILE READER. The host reads and sweeps the entire sample inside
 *     one draw call, which is what `wav_peaks.mjs` is streamed and bounded to
 *     avoid; on this device a blocked tick overflows the input ring and drops
 *     MIDI note-offs. A consumer should feed peaks in from `wav_peaks.mjs`
 *     instead. `wavWindowColumns` below takes the peaks it is given and never
 *     reads anything.
 *
 * ⚠ THE TWO SPELLINGS. A wav_position param is declared either as
 * `"type": "wav_position"` or as `"type": "float", "ui_type": "wav_position"`,
 * and BOTH are live in the fleet. The two trees then normalise in OPPOSITE
 * directions — `param_meta.mjs` folds `ui_type` into `type`, while the host
 * sets `type: "float"` and tests `ui_type` everywhere. `isWavPosition()` is the
 * one predicate that accepts every spelling; use it rather than comparing a
 * field, or half your tests will silently miss.
 */

/* Local, rather than imported from visibility.mjs: that file is this fork's
 * own, and nothing here should stop this module being offered upstream. */
function numOf(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
function boolOf(value) {
    if (value === true || value === false) return value;
    const s = String(value === undefined || value === null ? "" : value).toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "on";
}
/* A declaration may carry its extras at the top level or inside `options`. */
function optOf(meta, key, fallback) {
    if (!meta || typeof meta !== "object") return fallback;
    if (meta[key] !== undefined) return meta[key];
    if (meta.options && !Array.isArray(meta.options) &&
        typeof meta.options === "object" && meta.options[key] !== undefined) {
        return meta.options[key];
    }
    return fallback;
}

/** Every spelling of "this parameter is a position in a sample file". */
export function isWavPosition(meta) {
    if (!meta) return false;
    const t = String(meta.type || "").toLowerCase();
    const u = String(meta.ui_type || "").toLowerCase();
    const e = String(meta.expanded_type || "").toLowerCase();
    return t === "wav_position" || u === "wav_position" || e === "wav_position";
}

/*
 * A declaration, expanded into everything the editor needs.
 *
 * The shape is the HOST'S (`type: "float"` plus `ui_type: "wav_position"`) so
 * that this can replace its `buildWavPositionParamMeta` verbatim rather than
 * being a second dialect. Read it back with `isWavPosition`, never by comparing
 * one of the two fields.
 */
export function wavPositionMeta(meta) {
    const unitRaw = String(optOf(meta, "display_unit", "percent")).toLowerCase();
    const displayUnit = (unitRaw === "ms" || unitRaw === "sec" || unitRaw === "s")
        ? unitRaw : "percent";

    /* `trim_front`/`trim_end` are the older spellings; both are in the fleet. */
    const modeRaw = String(optOf(meta, "mode", "position")).toLowerCase();
    const mode = (modeRaw === "trim_front" || modeRaw === "start") ? "start"
               : ((modeRaw === "trim_end" || modeRaw === "end") ? "end" : "position");

    const min = numOf(optOf(meta, "min", 0), 0);
    const max = numOf(optOf(meta, "max", 1), 1);
    /* A millisecond position wants whole units; a ratio wants hundredths. */
    const defaultStep = displayUnit === "ms" ? 1 : 0.01;
    const step = numOf(optOf(meta, "step", defaultStep), defaultStep);

    const shiftRaw = numOf(
        optOf(meta, "shift_increment_multiplier", optOf(meta, "shift_step_multiplier", 0.1)), 0.1);
    const shiftMultiplier = shiftRaw > 0 ? shiftRaw : 0.1;

    return {
        ...meta,
        type: "float",
        ui_type: "wav_position",
        expanded_type: "wav_position",
        min, max, step,
        shift_increment_multiplier: shiftMultiplier,
        display_unit: displayUnit,
        wav_mode: mode,
        filepath_param: String(optOf(meta, "filepath_param", "") || ""),
        enable_zoom: boolOf(optOf(meta, "enable_zoom", false)),
        view_group: String(optOf(meta, "view_group", "") || ""),
        marker_label: String(optOf(meta, "marker_label", "") || ""),
    };
}

/** "position" | "start" | "end" — what this marker MEANS to the module. */
export function wavPositionMode(meta) {
    return String((meta && meta.wav_mode) || "position").toLowerCase();
}

/** The fine-step factor Shift applies. Never 0 — that would freeze the knob. */
export function wavShiftMultiplier(meta) {
    const raw = numOf(meta && meta.shift_increment_multiplier, 0.1);
    return raw > 0 ? raw : 0.1;
}

/*
 * Where this value sits in the file, 0..1 — the only thing the drawing needs.
 *
 * ⚠ A TIME UNIT WITHOUT A DURATION IS NOT ZERO, it is UNKNOWN, and this returns
 * 0 for it because a marker has to be drawn somewhere. A caller that can tell
 * the difference should say so rather than showing a confident marker at the
 * file start — see `wavRatioKnown`.
 */
export function wavPositionRatio(rawValue, meta, durationSec) {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return 0;
    const unit = String((meta && meta.display_unit) || "percent").toLowerCase();
    if (unit === "sec" || unit === "s") {
        if (!durationSec || durationSec <= 0) return 0;
        return Math.max(0, Math.min(1, num / durationSec));
    }
    if (unit === "ms") {
        if (!durationSec || durationSec <= 0) return 0;
        return Math.max(0, Math.min(1, (num / 1000) / durationSec));
    }
    const min = numOf(meta && meta.min, 0);
    const max = numOf(meta && meta.max, 1);
    const span = max - min;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(1, (num - min) / span));
}

/** False when the ratio above is a fallback rather than an answer. */
export function wavRatioKnown(rawValue, meta, durationSec) {
    if (!Number.isFinite(Number(rawValue))) return false;
    const unit = String((meta && meta.display_unit) || "percent").toLowerCase();
    if (unit === "ms" || unit === "sec" || unit === "s") return durationSec > 0;
    return numOf(meta && meta.max, 1) - numOf(meta && meta.min, 0) > 0;
}

/** What the screen prints for this value. */
export function wavPositionText(rawValue, meta, durationSec) {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return String(rawValue || "");
    const unit = String((meta && meta.display_unit) || "percent").toLowerCase();
    if (unit === "ms") return `${Math.round(num)} ms`;
    if (unit === "sec" || unit === "s") return `${num.toFixed(3)} s`;
    return `${(wavPositionRatio(num, meta, durationSec) * 100).toFixed(2)}%`;
}

/* Decimal places in a written value. */
function stepPrecision(step, fallback) {
    const num = Number(step);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    const text = String(num).toLowerCase();
    const expIdx = text.indexOf("e-");
    if (expIdx >= 0) {
        const exp = parseInt(text.slice(expIdx + 2), 10);
        return Number.isFinite(exp) ? Math.max(0, Math.min(6, exp)) : fallback;
    }
    const dotIdx = text.indexOf(".");
    if (dotIdx < 0) return 0;
    return Math.max(0, Math.min(6, text.length - dotIdx - 1));
}

/*
 * How many decimals a WRITE must carry.
 *
 * ⚠⚠ THE ZOOM DIVIDE IS WHY THIS IS NOT JUST `step`. A zoomable marker's step
 * is divided by up to 2^8, so at 256x one detent moves the value by less than a
 * thousandth. Round the write to the step's own precision and the number does
 * not change at all: the knob turns, the value is re-read identical, and the
 * marker sits still. It reads as a dead encoder, at exactly the zoom level
 * where precision was the point.
 */
export function wavSetPrecision(meta, { zoomable = null } = {}) {
    const unit = String((meta && meta.display_unit) || "percent").toLowerCase();
    const baseStep = Math.abs(numOf(meta && meta.step, 0.01));
    const fineStep = baseStep > 0 ? Math.abs(baseStep * wavShiftMultiplier(meta)) : 0;
    let effective = fineStep > 0 ? Math.min(baseStep || fineStep, fineStep) : baseStep;
    /*
     * ⚠⚠ THE ZOOM THAT IS OFFERED, NOT THE ZOOM THAT IS DECLARED. A group of two
     * or more markers gets the zoom knob whether or not any member declared
     * `enable_zoom` (see wavKnobRole), so gating this on the flag alone left a
     * grouped marker with 3-decimal writes and a 256x knob: from 32x up, one
     * detent rounded back to the value it started from and the encoder was
     * dead. The caller passes what it actually offers.
     */
    const zooms = zoomable === null ? !!(meta && meta.enable_zoom) : !!zoomable;
    if (zooms) effective = effective / Math.pow(2, WAV_ZOOM_MAX);
    /*
     * ⚠ MILLISECONDS ARE NOT ALWAYS WHOLE. Returning 0 here short-circuited
     * before the shift and zoom divides, so MODULES.md's own example
     * (`start_ms` with shift_increment_multiplier 0.05) wrote
     * (100 + 0.05).toFixed(0) === "100" — Shift was a dead encoder at every
     * zoom, and a plain turn was dead from 2x up. Whole milliseconds are the
     * FLOOR now, not the answer.
     */
    const fallback = unit === "ms" ? 0 : ((unit === "sec" || unit === "s") ? 3 : 2);
    return Math.max(fallback, stepPrecision(effective, fallback));
}

/* The value to seed an `end` marker with when a file is first chosen: the end
 * of that file, in the unit this parameter speaks. Without it a `loop_end`
 * stays empty, reads as ratio 0, and the module loops nothing. */
export function wavEndDefault(meta, durationSec) {
    const unit = String((meta && meta.display_unit) || "percent").toLowerCase();
    if ((unit === "sec" || unit === "s") && durationSec > 0) return Number(durationSec).toFixed(3);
    if (unit === "ms" && durationSec > 0) return String(Math.round(durationSec * 1000));
    if (unit === "sec" || unit === "s") return Number(numOf(meta && meta.max, 1)).toFixed(3);
    if (unit === "ms") return String(Math.round(numOf(meta && meta.max, 1)));
    return String(Math.max(numOf(meta && meta.min, 0), numOf(meta && meta.max, 1)));
}

/* ------------------------------------------------------------------ zoom */

export const WAV_ZOOM_MAX = 8;              /* 2^8 = 256x */
export const WAV_ZOOM_STEP = 0.5;           /* half an octave per detent */
/* The window Shift previews when a param has no sticky zoom of its own. */
export const WAV_SHIFT_PREVIEW_WINDOW = 0.1;

export function clampWavZoom(z) {
    const n = Number(z);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(WAV_ZOOM_MAX, n);
}

/** 1x at zoom 0, 256x at zoom 8. */
export function wavZoomFactor(z) {
    return Math.pow(2, clampWavZoom(z));
}

/** How a zoom level reads on screen. */
export function wavZoomLabel(z) {
    const factor = wavZoomFactor(z);
    if (clampWavZoom(z) <= 0.01) return "1x (off)";
    return `${factor.toFixed(factor < 10 ? 1 : 0)}x`;
}

/*
 * One detent of a marker knob, in the parameter's own units.
 *
 * The zoom divide lives HERE rather than in the caller's knob config, so that
 * `wavSetPrecision` above and this function cannot disagree about how small a
 * step can get.
 */
export function wavKnobStep(meta, zoom, shiftHeld) {
    const base = Math.abs(numOf(meta && meta.step, 0.01)) || 0.01;
    const withShift = shiftHeld ? base * wavShiftMultiplier(meta) : base;
    return withShift / Math.pow(2, clampWavZoom(zoom));
}

/*
 * The visible slice of the file, centred on the marker.
 *
 * Two regimes, and the second is the reason a legacy module still feels right:
 * a param with sticky zoom shows 1/2^z of the file, and one without shows the
 * whole file until Shift is held, which previews a tenth.
 *
 * Clamped so the window never runs off either end — at the file start the
 * marker sits at the left of a full window rather than centred in half of one.
 */
export function wavZoomWindow(ratio, zoom, shiftHeld) {
    const r = Math.max(0, Math.min(1, Number(ratio) || 0));
    const z = clampWavZoom(zoom);
    const window = z > 0 ? (1 / Math.pow(2, z))
                         : (shiftHeld ? WAV_SHIFT_PREVIEW_WINDOW : 1.0);
    const start = Math.max(0, Math.min(1 - window, r - (window / 2)));
    const end = start + window;
    return { start, end, span: Math.max(0.000001, end - start), window };
}

/*
 * Where a marker lands in a window: 0..1 across the plot, or off an edge.
 *
 * `off` is -1/0/+1 so a caller can draw the arrow that says "there is another
 * marker out that way" — without it, zooming in makes siblings vanish with no
 * indication they exist.
 */
export function wavMarkerInWindow(ratio, win) {
    const r = Math.max(0, Math.min(1, Number(ratio) || 0));
    if (r < win.start) return { pos: 0, off: -1 };
    if (r > win.end) return { pos: 1, off: 1 };
    return { pos: (r - win.start) / win.span, off: 0 };
}

/* ------------------------------------------------------- markers + knobs */

/*
 * The sibling markers on one waveform, in DECLARATION ORDER.
 *
 * ⚠⚠ THAT ORDER IS THE KNOB ASSIGNMENT, so it is not cosmetic: reordering a
 * module's params moves its markers to different encoders. Members are taken
 * from the list of params the caller considers live — a member hidden by
 * `visible_if`, or paged onto another screen, is simply not in the group, and
 * the ones that remain shift down a knob.
 */
export function wavViewGroupMembers(params, group) {
    const want = String(group || "");
    if (!want) return [];
    const out = [];
    for (const p of params || []) {
        const meta = p && (p.meta || p);
        if (!meta || !isWavPosition(meta)) continue;
        if (String(meta.view_group || "") !== want) continue;
        /* ⚠⚠ EXPANDED, not raw. A member's meta is used to clamp and to step, and
         * a raw declaration may carry no `min`/`max` at all (MODULES.md lists
         * them as optional) or hide `step`/`display_unit` inside `options`.
         * Passing the raw object through meant `Number(undefined)` — NaN — in
         * every clamp, so a grouped marker could be driven past its range
         * forever while the drawn cursor pinned at the edge. */
        out.push({
            key: p.key !== undefined ? p.key : meta.key,
            fullKey: p.fullKey !== undefined ? p.fullKey : (p.key !== undefined ? p.key : meta.key),
            meta: wavPositionMeta(meta),
            label: String(meta.marker_label
                || (meta.name ? String(meta.name).slice(0, 2) : String(p.key || "").slice(0, 2))),
        });
    }
    return out;
}

export const WAV_ZOOM_KNOB = 7;             /* the eighth encoder */

/*
 * Is the zoom knob offered for this parameter?
 *
 * ⭑ ONE PREDICATE, because two things must agree about it: the knob role table
 * below, and `wavSetPrecision`. When they disagreed, a grouped marker was given
 * a 256x zoom and 3-decimal writes, and the encoder went dead above 32x.
 */
export function wavZoomOffered(meta, memberCount) {
    return (memberCount | 0) > 1 || !!(meta && meta.enable_zoom);
}

/*
 * What each encoder does while this screen is up.
 *
 * Three regimes, and the quiet one matters most:
 *
 *   MULTI  (a view_group with two or more members) — knobs 0..N-1 are the
 *          markers, knob 8 is zoom, and EVERY OTHER KNOB IS SILENT. Silent is
 *          not laziness: the knobs still carry the page's own mapping
 *          underneath, so an unclaimed encoder would edit some unrelated
 *          parameter of the module while you are looking at a waveform.
 *
 *   SINGLE + enable_zoom — knob 8 is zoom, everything else is left alone.
 *
 *   LEGACY (no zoom, no group) — nothing is claimed at all. A module written
 *          before any of this keeps its whole knob row, which is why the roles
 *          are opt-in rather than a screen-wide takeover.
 */
export function wavKnobRole(knobIndex, { members = [], meta = null } = {}) {
    const i = knobIndex | 0;
    const multi = members.length > 1;
    if (multi) {
        if (i < members.length) return { type: "marker", member: members[i] };
        if (i === WAV_ZOOM_KNOB) return { type: "zoom", anchor: members[0] };
        return { type: "silent" };
    }
    if (meta && meta.enable_zoom && i === WAV_ZOOM_KNOB) return { type: "zoom", anchor: null };
    return null;
}

/* ------------------------------------------------------------------ path */

export function normalizeWavPath(path) {
    if (!path) return "";
    let value = String(path).trim();
    if (value.startsWith("file://")) value = value.slice("file://".length);
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).trim();
    }
    return value;
}

export function joinWavPath(base, leaf) {
    if (!base) return leaf || "";
    if (!leaf) return base;
    return `${String(base).replace(/\/+$/, "")}/${String(leaf).replace(/^\/+/, "")}`;
}

/*
 * The wire key of a SIBLING parameter on the same instance.
 *
 * ⚠⚠ THE CHILD INDEX IS THE WHOLE PROBLEM. A marker on a child level declares
 * its file by a BARE key — DR32's pads say `"filepath_param": "sample_move"` —
 * but the parameter that actually exists on the wire is `pad05_sample_move`.
 * Scoping the declared key to the component alone asks for `synth:sample_move`,
 * which no module serves: the read comes back empty and the screen reports "no
 * sample linked" for a pad that is loaded and audibly playing.
 *
 * ⭑ THE PREFIX IS TAKEN FROM THE MARKER'S OWN RESOLVED KEY rather than rebuilt
 * from `child_prefix` and an index. The marker was handed to us already
 * resolved (`pad05_start`) and it declares its own bare name (`start`), so the
 * difference between them IS the instance prefix — whatever that module's
 * numbering looks like, zero-padded or not, 0- or 1-based. Rebuilding it would
 * be a second implementation of a convention we can simply read.
 *
 * @param {string} markerFullKey  the marker as addressed, e.g. "synth:pad05_start"
 * @param {string} ownBare        what the marker calls itself, e.g. "start"
 * @param {string} declaredBare   the sibling it names, e.g. "sample_move"
 * @param {string} prefix         the component, e.g. "synth"
 */
export function wavSiblingKey(markerFullKey, ownBare, declaredBare, prefix) {
    const declared = String(declaredBare || "");
    if (!declared) return "";
    /* Already fully qualified: the module named a component itself. */
    if (declared.includes(":")) return declared;

    const full = String(markerFullKey || "");
    const own = String(ownBare || "");
    const p = String(prefix || "");
    const bare = (p && full.startsWith(p + ":")) ? full.slice(p.length + 1) : full;

    let instance = "";
    if (own && bare.length > own.length && bare.endsWith(own)) {
        instance = bare.slice(0, bare.length - own.length);
    }
    /*
     * ⚠⚠ A DECLARATION MAY ALREADY BE CONCRETE, and re-scoping one is not a
     * near miss — it asks for a key no module serves.
     *
     * Both shapes are in the fleet and `param_meta` produces the second on
     * purpose. mrdrums declares each pad separately, so `p05_start` names
     * `"filepath_param": "p05_sample_path"` — already carrying the instance —
     * while dr32's child level says `"sample_move"` and means "this pad's".
     * Prefixing the first gave `p05_p05_sample_path`, which reads empty, which
     * the screen reports as "no sample linked".
     *
     * The test is the instance prefix we just derived: if the declared key
     * already begins with it, the module has scoped it itself.
     */
    /*
     * ⭑ ANY instance of the same repeated element, not only THIS one. The
     * narrow test caught `p05_start` naming `p05_sample_path`, and missed
     * `pad4_start` naming `pad7_end` — which came out `pad4_pad7_end`, a key no
     * module serves. The instance we derived is `<prefix><index>_`; a declared
     * key wearing the SAME prefix and any index is already scoped.
     *
     * ⚠ Derived from the instance, never guessed. A blanket `^[a-z]+\d+_` test
     * would strip the scoping from a legitimately bare `osc1_freq` on a child
     * level — which is a real key shape — whereas this can only fire for the
     * module's own child_prefix, where a leading `<prefix><digits>_` cannot
     * mean anything else.
     */
    if (instance) {
        if (declared.startsWith(instance)) instance = "";
        else {
            const head = instance.match(/^([^0-9]+)[0-9]+_$/);
            if (head && new RegExp("^" + head[1] + "[0-9]+_").test(declared)) instance = "";
        }
    }
    return p ? `${p}:${instance}${declared}` : `${instance}${declared}`;
}

export function wavBaseName(path) {
    if (!path) return "";
    const idx = String(path).lastIndexOf("/");
    return idx >= 0 ? String(path).slice(idx + 1) : String(path);
}

/*
 * Which FILE this marker is a position in.
 *
 * ⚠ It is ALWAYS a declared sibling: `filepath_param` names the key holding the
 * path. There is no filename sniffing and no "nearest filepath param on the
 * page" — a module says which, or this screen has no file. (The CELL widget in
 * viz.mjs does guess; the two disagree on purpose, because a wrong guess on a
 * cell costs a picture and a wrong guess here costs an edit.)
 *
 * The value may be relative, in which case it is resolved against the FILE
 * BROWSER'S OWN roots — the `start_path` and `root` declared on the filepath
 * param — because that is what the value was picked relative to.
 *
 * `io` is { getParam(key), metaOf(bareKey), buildKey(bareKey), exists(path) };
 * all four are injected so this stays free of any host's globals and can be
 * exercised without a filesystem.
 */
export function resolveWavSourcePath(meta, io) {
    const declared = String((meta && meta.filepath_param) || "").trim();
    if (!declared || !io || typeof io.getParam !== "function") return "";

    /* A key that already names a component is used as-is; a bare one is scoped
     * to whatever the caller is showing — component AND CHILD INSTANCE.
     *
     * ⚠ `siblingKey` is preferred over `buildKey` precisely because a bare
     * declaration on a child level means "this instance's", not "the
     * component's": see wavSiblingKey. `buildKey` remains the fallback for a
     * caller that has no marker identity to derive from. */
    const linkedKey = declared.includes(":")
        ? declared
        : (typeof io.siblingKey === "function"
            ? io.siblingKey(declared)
            : (typeof io.buildKey === "function" ? io.buildKey(declared) : declared));

    const raw = normalizeWavPath(io.getParam(linkedKey) || "");
    if (!raw) return "";

    const exists = typeof io.exists === "function" ? io.exists : () => false;
    if (exists(raw)) return raw;

    const lookupKey = declared.includes(":")
        ? String(declared.split(":").pop() || "").trim()
        : declared;
    const sourceMeta = (lookupKey && typeof io.metaOf === "function")
        ? (io.metaOf(lookupKey) || {}) : {};
    for (const base of [sourceMeta.start_path, sourceMeta.root]) {
        if (!base) continue;
        const candidate = joinWavPath(base, raw);
        if (exists(candidate)) return candidate;
    }
    /* Hand back what the module said, so the screen can name the file it could
     * not find rather than saying nothing at all. */
    return raw;
}

/*
 * The plot's columns, from peaks that are already in memory.
 *
 * ⚠ NO IO, EVER — see the header. `peaks` is a 0..1 array covering the WHOLE
 * file (`wav_peaks.mjs` shape); this maps the visible window onto `width`
 * columns, taking the MAX across each column's span so a transient one sample
 * wide still draws at full height instead of being sampled past.
 *
 * ⚠ At high zoom the answer is only as good as the peaks: a 128-column source
 * stretched over a 1/256th window is one source column per plot column and the
 * wave reads as a staircase. That is a resolution limit, not a bug, and it is
 * the price of never reading a file on the draw path.
 */
export function wavWindowColumns(peaks, win, width) {
    const w = Math.max(1, width | 0);
    const out = new Array(w).fill(0);
    const n = peaks && peaks.length ? peaks.length : 0;
    if (!n) return out;
    for (let i = 0; i < w; i++) {
        const a = win.start + ((i / w) * win.span);
        const b = win.start + (((i + 1) / w) * win.span);
        /* ⚠⚠ HALF-OPEN, so the columns TILE the file: each source peak belongs
         * to exactly one column. Inclusive spans smear a one-sample transient
         * across two columns and make a drum hit look 2px wide at one zoom and
         * 1px at the next.
         *
         * ⚠ `ceil` on the LOW edge, not `floor`. `floor(a*n)` re-reads the peak
         * that `ceil(b*n)-1` already gave the previous column whenever the
         * boundary is fractional — which is almost always. It tiles perfectly
         * at 100 peaks over 10 columns and smears 112 of 128 at the geometry
         * this actually ships with (128 peaks over 120 columns), so the first
         * version of this passed its own test by being measured only where it
         * could not fail. */
        let lo = Math.ceil(a * n);
        let hi = Math.ceil(b * n) - 1;
        if (lo < 0) lo = 0;
        if (hi > n - 1) hi = n - 1;
        /* A column narrower than one peak still has to read one. */
        if (hi < lo) hi = lo;
        let max = 0;
        for (let j = lo; j <= hi; j++) {
            const v = Math.abs(Number(peaks[j]) || 0);
            if (v > max) max = v;
        }
        out[i] = max > 1 ? 1 : max;
    }
    return out;
}
