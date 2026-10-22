/* ui_chain_host.mjs — a module's own CHAIN SCREEN (`ui_chain.js`), run the way
 * stock runs it.
 *
 * ⭐ WHAT IT CLOSES. Stock's component editor opens the shared grid when a
 * module publishes a `ui_hierarchy`, and otherwise loads the module's own
 * screen script — `ui_chain.js`, or whatever `"ui_chain"` in module.json names
 * — and hands it the screen, the knobs, the jog and (if it asks) the pads.
 * dAVEBOx only ever had the first half, so a module that relies on the second
 * opened here as a flat list of its params and none of its own behaviour: the
 * report that started this was 9W9's pads not selecting drums. Josh: "i just
 * want to make sure what happens on schwung also happens on davebox in terms of
 * module editing and behavior". So nothing here names a module.
 *
 * ⭐ THE CONTRACT IS THE HOST'S, NOT OURS (docs/MODULES.md, "Signal Chain UI
 * Shims"; src/shadow/shadow_ui.js loadModuleUi / unloadModuleUi):
 *
 *     globalThis.chain_ui = { init, tick, onMidiMessageInternal,
 *                             onMidiMessageExternal, handleBack }
 *     — or plain init/tick/onMidiMessageInternal globals, which stock wraps
 *     tick()          draws; called once per frame from the draw path
 *     handleBack()    true = "I went up a level", else the host leaves
 *     host_pad_block  raised = the pads are the module's; it hands each one
 *                     back with move_midi_inject_to_move, which PLAYS it
 *
 * ⚠⚠ THE SHIMS ARE SCOPED TO EACH CALL, NOT TO THE SCREEN'S LIFETIME. Stock
 * installs `host_module_get_param` & co. while the module's screen is up,
 * because nothing else in its JS context calls them then. dAVEBOx calls
 * `host_module_*` for its OWN DSP from every tick and every MIDI handler, so a
 * lifetime install would route dAVEBOx's sequencer writes into the module. They
 * are swapped in around each hosted call and restored in `finally`, honouring
 * whether each name existed (the same had/saved discipline as
 * engineLoadCanvasOverlay).
 *
 * ⚠⚠ AND A PAD THE MODULE HANDS BACK IS REPLAYED AFTER THE CALL, never inside
 * it: the replay runs dAVEBOx's own pad path, which writes dAVEBOx's DSP
 * through the very names that are shimmed during the call.
 *
 * ⭐ A PARAMETER THE SCRIPT WRITES IS AN EDIT, as a knob turn in dAVEBOx's own
 * editor is: a held step makes it a lock, Record makes it a take. A script may
 * write through `host_module_set_param` (bare key) or straight through
 * `shadow_set_param(slot, "comp:key")` — 9W9 does the latter — so both are
 * caught for this screen's slot and component. The write lands at once; the
 * EDIT is queued and handed to dAVEBOx after the call, for the same reason the
 * pad replay is (the automation path writes dAVEBOx's DSP). Which of those
 * writes is a parameter (and not a module's private key) is dAVEBOx's call.
 *
 * ⚠ ONE STRIKE, as on the canvas screen: a hook that throws disables the
 * script, the screen SAYS which hook died, and Back still leaves.
 */

/* The one open screen, or null. */
let H = null;

/* The globals a script may assign at load, saved and restored around it. */
const LOAD_NAMES = ['init', 'tick', 'onMidiMessageInternal', 'onMidiMessageExternal', 'chain_ui'];

export function chainUiActive() { return H !== null; }

/*
 * Where a module's chain screen lives, or null — stock's getModuleUiPath.
 *
 * ⚠ ui_chain.js only, or the file module.json's `"ui_chain"` names. Stock also
 * falls back to a bare `ui.js`, but that is a module's STANDALONE screen,
 * written for a host that runs nothing else; in a dAVEBOx session it would
 * take over a sequencer that is still playing. A module that wants its ui.js
 * used as a chain screen says so with `"ui_chain": "ui.js"`, and that works.
 */
export function chainUiPathIn(dir, readFile, exists) {
    if (!dir) return null;
    let name = 'ui_chain.js';
    try {
        const mj = readFile(dir + '/module.json');
        const m = mj && String(mj).match(/"ui_chain"\s*:\s*"([^"]+)"/);
        if (m && m[1]) name = m[1];
    } catch (e) { /* no module.json: the default name */ }
    const path = name.startsWith('/') ? name : dir + '/' + name;
    return exists(path) ? path : null;
}

/*
 * Open the screen.
 *
 * `io` is dAVEBOx's half, so this file holds no dAVEBOx state:
 *   load(path) -> bool        evaluate the script (shadow_load_ui_module)
 *   shiftHeld() -> bool
 *   replayPad(status, d1, d2) play a pad the module handed back
 *   onParamEdit(bareKey, wire, prevWire)  the script changed a parameter
 *
 * Reads and writes go to the host's own shadow_get/set_param for `slot` and
 * `comp`, captured before the call's shims go in.
 */
export function chainUiOpen({ path, slot, comp, io }) {
    if (!path || !io || typeof io.load !== 'function') return false;
    H = { path, slot, comp, io, ui: null, padBlock: false, dead: false,
          error: '', replay: [], edits: [], wantsSwap: false };
    const G = globalThis;
    const had = {}, saved = {};
    for (const n of LOAD_NAMES) { had[n] = Object.prototype.hasOwnProperty.call(G, n); saved[n] = G[n]; }
    G.chain_ui = null;
    let ok = false;
    scoped(() => {
        try { ok = !!io.load(path); }
        catch (e) { ok = false; H.error = 'load error: ' + e; }
        if (ok) {
            if (G.chain_ui && typeof G.chain_ui === 'object') H.ui = G.chain_ui;
            else {
                /* Standard globals: wrap the ones the script CHANGED, as stock does. */
                const w = {
                    init: G.init !== saved.init ? G.init : null,
                    tick: G.tick !== saved.tick ? G.tick : null,
                    onMidiMessageInternal: G.onMidiMessageInternal !== saved.onMidiMessageInternal
                        ? G.onMidiMessageInternal : null,
                };
                if (w.init || w.tick || w.onMidiMessageInternal) H.ui = w;
            }
        }
    });
    for (const n of LOAD_NAMES) {
        if (had[n]) G[n] = saved[n]; else { try { delete G[n]; } catch (e) {} }
    }
    drainAfterCall(H);
    if (!H.ui) {
        H.error = H.error || (ok ? 'set no chain_ui' : 'failed to load');
        H.dead = true;
        return true;           /* the screen still opens, carrying the reason */
    }
    invoke('init');
    return true;
}

export function chainUiClose() {
    H = null;
}

/* One frame: the script's tick, which is also its draw. */
export function chainUiTick() {
    if (!H) return;
    invoke('tick');
}

/* Any MIDI the screen owns. */
export function chainUiMidi(status, d1, d2) {
    if (!H) return;
    invoke('onMidiMessageInternal', [status, d1, d2]);
}

/* Back: the module climbs first. True = it did, stay. */
export function chainUiBack() {
    if (!H) return false;
    return invoke('handleBack') === true;
}

/* Does the module hold the pads (host_pad_block raised, script alive)? */
export function chainUiHoldsPads() { return !!(H && H.padBlock && !H.dead); }

/* The module asked to be swapped (host_swap_module). Consumed by the asking. */
export function chainUiTakeSwap() {
    if (!H || !H.wantsSwap) return false;
    H.wantsSwap = false;
    return true;
}

export function chainUiDead() { return !!(H && H.dead); }
export function chainUiError() { return H ? H.error : ''; }

/* For tests. */
export function chainUiStateForTest() {
    return H ? { path: H.path, slot: H.slot, comp: H.comp, padBlock: H.padBlock,
                 dead: H.dead, error: H.error, hasUi: !!H.ui } : null;
}

/* ── the scoped call ─────────────────────────────────────────────────────── */

function invoke(hook, arg) {
    if (!H || H.dead || !H.ui) return undefined;
    const fn = H.ui[hook];
    if (typeof fn !== 'function') return undefined;
    let r;
    const h = H;
    scoped(() => {
        try { r = arg === undefined ? fn() : fn(arg); }
        catch (e) { h.error = hook + ' error: ' + e; h.dead = true; h.padBlock = false; r = undefined; }
    });
    drainAfterCall(h);
    return r;
}

/* The host bindings a chain script expects, with dAVEBOx's meaning for each.
 * Installed for the duration of `body`, then restored exactly. */
function scoped(body) {
    const G = globalThis;
    const h = H;
    /* The host's real bindings, taken before the shims replace them. */
    const realGet = G.shadow_get_param, realSet = G.shadow_set_param;
    const pre = h.comp + ':';
    const read = (bare) => (typeof realGet === 'function' ? realGet(h.slot, pre + bare) : null);
    const write = (bare, v) => {
        const prev = read(bare);
        const r = typeof realSet === 'function' ? realSet(h.slot, pre + bare, v) : false;
        h.edits.push([bare, v, prev == null ? '' : String(prev)]);
        return r;
    };
    const shims = {
        host_module_get_param: (k) => read(String(k)),
        host_module_set_param: (k, v) => write(String(k), String(v)),
        /* A write on THIS screen's slot and component is the script editing
         * its module; anything else passes straight through. */
        shadow_set_param: (s, k, v) => {
            const key = String(k);
            if ((s | 0) === h.slot && key.startsWith(pre)) return write(key.slice(pre.length), String(v));
            return typeof realSet === 'function' ? realSet(s, k, v) : false;
        },
        /* The slot the script edits is the one it was opened on. A script
         * gating on "am I focused" (shadow_get_ui_slot() === my slot) must
         * read yes while its screen is up. */
        shadow_get_ui_slot: () => h.slot,
        /* The screen is up whenever it is being called. */
        shadow_get_display_mode: () => 1,
        shadow_get_shift_held: () => (h.io.shiftHeld() ? 1 : 0),
        /* dAVEBOx already owns the pads, so this is a flag, not the SHM byte
         * stock's shim reads. */
        host_pad_block: (on) => { h.padBlock = !!on; return true; },
        /* "Give the pad back to Move" — in a dAVEBOx session the pads are
         * dAVEBOx's, so the pad plays (and records) through dAVEBOx. */
        move_midi_inject_to_move: (pkt) => {
            const p = pkt || [];
            const st = p[1] | 0, d1 = p[2] | 0, d2 = p[3] | 0;
            const k = st & 0xF0;
            if ((k === 0x90 || k === 0x80 || k === 0xA0) && d1 >= 68 && d1 <= 99) h.replay.push([st, d1, d2]);
            return true;
        },
        host_swap_module: () => { h.wantsSwap = true; },
        host_open_file_in_tool: () => false,
    };
    const had = {}, saved = {};
    for (const n in shims) { had[n] = Object.prototype.hasOwnProperty.call(G, n); saved[n] = G[n]; G[n] = shims[n]; }
    try { body(); }
    finally {
        for (const n in shims) {
            if (had[n]) G[n] = saved[n]; else { try { delete G[n]; } catch (e) {} }
        }
    }
}

/* After every hosted call, outside its shims: the edits the script made, then
 * the pads it handed back, in that order (an edit dialled on a held step must
 * be booked before the step's release can read it as a tap). */
function drainAfterCall(h) {
    if (h.edits.length) {
        const q = h.edits; h.edits = [];
        for (const [k, v, prev] of q) {
            try { if (h.io.onParamEdit) h.io.onParamEdit(k, v, prev); } catch (e) { /* dAVEBOx logs its own */ }
        }
    }
    if (h.replay.length) {
        const q = h.replay; h.replay = [];
        for (const [st, d1, d2] of q) {
            try { h.io.replayPad(st, d1, d2); } catch (e) { /* dAVEBOx's own path logs its errors */ }
        }
    }
}
