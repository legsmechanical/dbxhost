/* ui_canvas.mjs — dAVEBOx's fullscreen MODULE CANVAS.
 *
 * ⭐ WHAT IT CLOSES. Josh, from the device: "i'm davebox, pad sample browser
 * isn't working" and later "i don't see it on dvx and the knob 2 gesture isn't
 * doing anything but flickering the screen". The gesture fired.
 * `openParamEditor` dived out correctly. It landed in davebox's bank editor,
 * which has file, text and enum screens and nothing that runs a module's own
 * canvas script. There was no canvas screen to land in. This is it, and it is
 * the same shape as ui_wav.mjs, which closed the same hole for a `wav_position`
 * marker.
 *
 * ⚠⚠ NOT A SECOND CANVAS RUNTIME. davebox already evaluates a module's
 * canvas.js -- `engineCanvasOverlayShared` for the knob grid's in-cell widgets
 * and a module-owned page's `drawPage`, and `hostedCtx` for a whole-module
 * `bank_editor`. What was missing was the per-PARAM dive: a `type: "canvas"`
 * param names its own script, owns the whole 128x64, and takes the jog and the
 * click. So this is a SCREEN over the loader that already exists.
 *
 * ⭐ THE CONTRACT IS THE HOST'S, NOT OURS (charlesvestal/schwung#520):
 *
 *     enterable: true   the canvas keeps the jog click
 *     handleBack()      true = "I went up a level", anything else = "I am at
 *                       my top level" and we close
 *     ctx.close()       the module says its job is finished
 *     wantsPads         it would like pad presses forwarded
 *
 * Every one of those is spelled exactly as stock spells it, because a module is
 * written against stock and must run here unchanged. Anything we add or omit is
 * a divergence its author discovers by crashing.
 *
 * ⚠ The drawing primitives are HOST GLOBALS (`clear_screen`, `print`,
 * `fill_rect`, `draw_rect`, `set_pixel`, `draw_line`, `text_width`) --
 * implemented in C on globalThis, not importable. The ctx below is the thin
 * camelCase skin over them, deliberately the SAME SURFACE stock's
 * createCanvasRuntimeContext offers.
 */

import { drawKitHintRow, MV_FOOTER_Y } from './ui_movy.mjs';
/* ⚠ THE FOOTER'S CONTENT IS NOT OURS TO DECIDE. It said something different
 * here from what it says on stock for one afternoon, because this file followed
 * davebox's chrome idiom without comparing the two. Dress differs between the
 * surfaces; content does not. The decision is shared; we only render it. */
import {
    canvasHints, canvasCanGoUp,
} from '/data/UserData/schwung/shared/param_pages/canvas_hints.mjs';

/* The one open canvas, or null. */
let C = null;

export function canvasEditActive() { return C !== null; }

/** Is this param one this screen can open? */
export function isCanvasParam(meta) {
    return !!(meta && meta.type === 'canvas');
}

/**
 * Does it declare navigation inside it?
 *
 * ⚠ A canvas WITHOUT this is a visualiser: the click closes it, as on stock.
 * Reading the flag rather than assuming is what keeps a scope or a meter
 * behaving here the way it behaves there.
 */
export function isEnterable(meta) {
    if (!meta || typeof meta !== 'object') return false;
    if (meta.enterable !== undefined) return !!meta.enterable;
    const o = meta.options;
    return !!(o && !Array.isArray(o) && typeof o === 'object' && o.enterable);
}

/*
 * Which script, and which overlay inside it.
 *
 * ⚠ THE OBJECT FORM IS STOCK'S, KEY FOR KEY: `canvas_script` may be a bare
 * string OR an object naming the file under any of script/file/path and the
 * overlay under any of overlay/target/entry/element. Four aliases for one idea
 * is not a design I would choose, but a module that spells it `entry` works on
 * stock, and a davebox that understood only `overlay` would fail on exactly the
 * modules whose authors read the other half of the host's source.
 */
export function canvasScriptSpec(meta) {
    let script = 'canvas.js', ref = '';
    const cs = meta && meta.canvas_script;
    if (typeof cs === 'string') {
        /* "file.js#overlay" is the spelling card_script uses too. */
        const hash = cs.indexOf('#');
        script = (hash >= 0 ? cs.slice(0, hash) : cs).trim() || 'canvas.js';
        if (hash >= 0) ref = cs.slice(hash + 1).trim();
    } else if (cs && typeof cs === 'object') {
        script = String(cs.script || cs.file || cs.path || 'canvas.js');
        for (const k of ['overlay', 'target', 'entry', 'element']) {
            if (typeof cs[k] === 'string' && cs[k].trim()) { ref = cs[k].trim(); break; }
        }
    }
    if (!ref && typeof (meta && meta.canvas_overlay) === 'string') ref = meta.canvas_overlay.trim();
    return { script, ref };
}

/*
 * Open the canvas on one param.
 *
 * `io` is davebox's half, injected so this file holds no davebox state:
 *   loadOverlay(script, ref) -> { overlay, error }   the shared evaluator
 *   getParam(bareKey)        -> string               a live read, in-flight aware
 *   setParam(bareKey, value)                         MUST enter the write ledger
 *   getValue() / setValue(v)                         this canvas param's own value
 *   shiftHeld()              -> bool                 Shift is down (the footer
 *                                                    advertises the escape
 *                                                    hatch only while it is)
 *   crumbs                   -> string[]             the path to this screen
 */
export function canvasEditOpen({ key, fullKey, meta, comp, slot = 0, io }) {
    if (!isCanvasParam(meta) || !io || typeof io.loadOverlay !== 'function') return false;
    const spec = canvasScriptSpec(meta);
    const loaded = io.loadOverlay(spec.script, spec.ref) || {};
    /* ⭑ AN OVERLAY THAT WOULD NOT LOAD STILL OPENS THE SCREEN, carrying the
     * reason. Stock does this too, and it is the difference between "the
     * gesture does nothing" -- the report that started this file -- and a panel
     * that says which script it could not find. */
    C = {
        key, fullKey, meta, comp, slot, io,
        crumbs: (io && Array.isArray(io.crumbs)) ? io.crumbs.slice() : [],
        script: spec.script,
        enterable: isEnterable(meta),
        overlay: loaded.overlay || null,
        error: loaded.error || (loaded.overlay ? '' : 'no canvas overlay'),
        /* Fresh per open, as stock's is. A module keeps its cursor and scroll
         * here, and the overlay OBJECT is shared with the widget loader, so
         * state must not live on it. */
        state: {},
        opened: false,
        /* ⚠ ONE STRIKE, as stock: a throwing hook disables the overlay rather
         * than throwing again on every frame at 60Hz. */
        dead: false,
        wantsClose: false,
        ctx: null,
    };
    C.ctx = makeCtx(C);
    return true;
}

export function canvasEditClose() {
    /* onClose then onExit: stock fires the pair, and a module written against
     * it may listen to either. */
    invoke('onClose', { cancelled: false });
    invoke('onExit', { cancelled: false });
    C = null;
}

/** The breadcrumb — the param's own label, which is what was clicked. */
export function canvasEditCrumb() {
    if (!C) return '';
    const m = C.meta || {};
    return String(m.label || m.name || C.key || 'Canvas');
}

/** Does this overlay want PAD presses forwarded? Declared, never assumed. */
export function canvasEditWantsPads() {
    return !!(C && C.overlay && C.overlay.wantsPads && !C.dead);
}

/** Does the overlay animate itself? Only then is a redraw per tick warranted. */
export function canvasEditAnimates() {
    return !!(C && C.overlay && typeof C.overlay.tick === 'function' && !C.dead);
}

export function canvasEditTick() {
    if (!C) return;
    invoke('tick', {});
}

/** Did the module ask to be dismissed? Consumed by the asking. */
export function canvasEditTakeClose() {
    if (!C || !C.wantsClose) return false;
    C.wantsClose = false;
    return true;
}

/*
 * Hand one MIDI event to the overlay. Returns true when davebox should treat
 * the event as spent.
 *
 * ⚠⚠ THE CANVAS OWNS THE SCREEN, SO IT OWNS THE INPUT -- this does NOT use the
 * hosted canvas's "consume only if the module returns true" rule. A hosted
 * `bank_editor` shares VIEW_EDIT with davebox's own bank, so it has to decline
 * what it does not use. A dived canvas is alone on the panel: an unclaimed jog
 * turn would walk davebox's bank cycle UNDERNEATH a screen the user cannot see
 * changing, and they would come back out somewhere else. The caller keeps the
 * global escapes and Back for itself; everything else is the module's.
 */
export function canvasEditOnMidi(status, d1, d2) {
    if (!C) return false;
    invoke('onMidi', { source: 'internal', data: [status, d1, d2] });
    return true;
}

/*
 * Back: the module climbs first, and we close when it says it is at its top.
 *
 *   handleBack() === true   "I went up a level"     -> stay
 *   anything else           "I am at my top level"  -> the caller closes
 *
 * ⚠ Offered ONLY to an enterable canvas. A visualiser has no levels to climb,
 * and asking it would make Back's meaning depend on a hook nobody declared.
 * A hook that threw is dead and answers nothing, so it can never hold Back.
 */
export function canvasEditBack() {
    if (!C || !C.enterable) return false;
    return invoke('handleBack', {}) === true;
}

/* ── drawing ─────────────────────────────────────────────────────────────── */

export function renderCanvasEdit() {
    if (!C) return false;
    clear_screen();
    const drew = !!(C.overlay && typeof C.overlay.draw === 'function' && !C.dead);
    if (drew) invoke('draw', {});
    if (!drew) {
        print(3, 12, fit(canvasEditCrumb(), 24), 1);
        print(3, 30, fit(C.error || 'No module canvas overlay', 24), 1);
    }
    /* ⭑ FOOTER OVER THE CANVAS, as on stock and SAYING THE SAME THING, honouring
     * the same opt-out. The module owns all 64 rows and may have drawn under
     * here; `show_footer: false` is how it says so. */
    if (!C.meta || C.meta.show_footer !== false) {
        const hints = canvasHints({
            enterable: C.enterable,
            canGoUp: canvasCanGoUp(C.dead ? null : C.overlay, C.ctx),
            shiftHeld: typeof C.io.shiftHeld === 'function' ? !!C.io.shiftHeld() : false,
        });
        drawKitHintRow(MV_FOOTER_Y, hints.length
            ? hints.map((h) => [h.key, h.action])
            : [['back', 'exit']]);
    }
    return true;
}

function fit(s, n) {
    const t = String(s == null ? '' : s);
    return t.length <= n ? t : t.slice(0, n);
}

/* ── the module's ctx ────────────────────────────────────────────────────── */

/*
 * ⚠ ONE STRIKE, and the screen STAYS. `renderHosted` drops a throwing overlay
 * and falls back to davebox's adopted page, because there IS a page underneath.
 * This screen has none: dropping it would leave a blank panel with a footer. So
 * a throw is caught, recorded, SHOWN, and the overlay is not called again --
 * the message is the only thing on the device that can say which hook died.
 */
function invoke(hook, payload) {
    if (!C || !C.overlay || C.dead) return undefined;
    /* onOpen runs exactly once, lazily, before the first hook that needs it. */
    if (!C.opened && hook !== 'onOpen') {
        C.opened = true;
        if (typeof C.overlay.onOpen === 'function') {
            try { C.overlay.onOpen(C.ctx); }
            catch (e) { C.error = 'onOpen error: ' + e; C.dead = true; return undefined; }
        }
    }
    const fn = C.overlay[hook];
    if (typeof fn !== 'function') return undefined;
    try {
        return fn(C.ctx, payload || {});
    } catch (e) {
        C.error = hook + ' error: ' + e;
        C.dead = true;
        return undefined;
    }
}

function makeCtx(c) {
    return {
        width: 128, height: 64,
        get state() { return c.state; },
        clear: () => clear_screen(),
        setPixel: (x, y, v) => set_pixel(Math.round(x), Math.round(y), v ? 1 : 0),
        drawRect: (x, y, w, h, v) => draw_rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), v ? 1 : 0),
        fillRect: (x, y, w, h, v) => fill_rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), v ? 1 : 0),
        /* ⚠ `draw_line`, the bare global -- NOT a `display.drawLine`. Stock's
         * own ctx reached for a `display` object that exists only in its other
         * JSContext, which threw a ReferenceError and blanked the canvas. Fixed
         * there; spelled out here because copying that line is the obvious
         * thing to do. */
        drawLine: (x1, y1, x2, y2, v) => draw_line(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), v ? 1 : 0),
        print: (x, y, t, color = 1) => print(Math.round(x), Math.round(y), String(t), color ? 1 : 0),
        measureText: (s) => (typeof text_width === 'function'
            ? text_width(String(s)) : String(s).length * 6),
        now: () => Date.now(),
        random: () => Math.random(),
        /* "I am done." Recorded rather than acted on: the VIEW is davebox's, so
         * the caller reads this back and leaves on the module's behalf. */
        close: () => { c.wantsClose = true; return true; },
        /* The canvas param's OWN value. */
        getValue: () => (typeof c.io.getValue === 'function' ? String(c.io.getValue() || '') : ''),
        setValue: (v) => (typeof c.io.setValue === 'function' ? c.io.setValue(String(v)) : false),
        /* Any param on the component, by BARE key -- the scoping is davebox's,
         * in `io`, because only ui_sound knows the slot and the component. */
        getParam: (k) => c.io.getParam(String(k)),
        setParam: (k, v) => c.io.setParam(String(k), String(v)),
    };
}

/** For tests: what the screen is holding, without reaching into the closure. */
export function canvasEditState() {
    return C ? { key: C.key, fullKey: C.fullKey, comp: C.comp, slot: C.slot,
                 script: C.script, error: C.error, opened: C.opened,
                 enterable: C.enterable, dead: C.dead,
                 hasOverlay: !!C.overlay } : null;
}
