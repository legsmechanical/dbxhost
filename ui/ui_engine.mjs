/* ui_engine.mjs — THE PORT SURFACE.
 *
 * Every conversation with the Schwung chain engine goes through this file and
 * nowhere else. No other file in lab/ may call shadow_* for module work, and no
 * other file may build a `<component>:<key>` string. That discipline is the
 * whole point: when davebox becomes its own standalone host, this file is
 * rewritten against the in-process chain host and everything above it — the
 * discovery pass, the cell mapper, the renderer, any per-module overlays —
 * carries over untouched.
 *
 * Addressing is always the triple (slot, comp, key):
 *   slot — shadow chain slot 0..3 (standalone: whatever the host exposes)
 *   comp — 'synth' | 'fx1'..'fx4' | 'midi_fx1'
 *   key  — the module's own param key
 *
 * Host contract notes that cost real debugging time upstream (movy):
 *  - A module is LOADED by writing `<comp>:module`, but READ BACK from
 *    `<comp>_module` — the underscore alias. Reading the colon key returns
 *    empty and the UI concludes the slot is still empty.
 *  - Track components load by module ID. (master_fx:* components load by DSP
 *    path instead — not used here, noted so the asymmetry isn't rediscovered.)
 */

/* `os` is a QuickJS MODULE, not a global — shadow_ui.js line 1 imports it the
 * same way. Without this import the bare `os.readdir` below throws a
 * ReferenceError that the scan's own try/catch swallows, and every category
 * silently reports zero modules. The bundler must mark 'os' external so the
 * import survives to the device (see scripts/bundle_lab.sh). */
import * as os from 'os';

const MODULES_BASE = '/data/UserData/schwung/modules';

/* component -> where its modules live + the component_type they must declare */
export const COMPONENTS = {
    synth:    { label: 'SYNTH', scanDir: 'sound_generators', type: 'sound_generator' },
    fx1:      { label: 'FX 1',  scanDir: 'audio_fx',         type: 'audio_fx' },
    fx2:      { label: 'FX 2',  scanDir: 'audio_fx',         type: 'audio_fx' },
    fx3:      { label: 'FX 3',  scanDir: 'audio_fx',         type: 'audio_fx' },
    fx4:      { label: 'FX 4',  scanDir: 'audio_fx',         type: 'audio_fx' },
    midi_fx1: { label: 'MIDI',  scanDir: 'midi_fx',          type: 'midi_fx' },
};

/* Read-back key for "which module is loaded" — see header note. */
function moduleReadKey(comp) {
    return comp.indexOf(':') !== -1 ? comp + ':module' : comp + '_module';
}

/* ---- core param access ---- */

export function engineGet(slot, comp, key) {
    return shadow_get_param(slot, comp + ':' + key);
}

export function engineSet(slot, comp, key, val) {
    return shadow_set_param(slot, comp + ':' + key, String(val));
}

/* SLOT-level params (volume, muted, send_a...) live on the slot itself, not on
 * a component — same shadow_get/set_param call, different key namespace
 * ("slot:volume"). Kept here with every other key-building call per this file's
 * port-surface rule. Slot gains are 0..4, host-clamped, 1.0 = unity.
 *
 * NOTE: the host's setter updates runtime state and the UI mirror but does NOT
 * persist — call engineSaveState() once a gesture ends, not per detent. */

/* The key every "level" control in this module writes.
 *
 * `slot:volume` is the channel's BUS fader: it runs after the slot's FX, so it
 * also scales a Move track routed into that slot and cannot balance the two
 * against each other. `slot:synth_volume` scales the sound generator alone,
 * before anything is summed in — which is what a davebox track's level means,
 * since the routed Move audio belongs to some other track entirely.
 *
 * Requires the paired host (`slot:synth_volume` landed with the sound build). An
 * older shim drops the set silently, so the knob would move and nothing would be
 * heard. Not capability-probed: a get from a MIDI handler returns null on every
 * host, so a probe cannot tell "old shim" from "wrong context" and would latch
 * the wrong answer. Flip this one string to go back to the fader. */
export const SLOT_LEVEL_KEY = 'synth_volume';

/* And the law for MOVING it, shared by every level control so they cannot drift
 * apart in feel. Levels are 0..4; a detent of 1/64 puts unity ~64 detents away
 * and the whole range in ~256.
 *
 * That is deliberately fine. `decodeDelta` returns a BATCHED count — the shadow
 * UI framework accumulates encoder ticks in overtake mode and sends the total in
 * one CC — so a quick turn arrives as a few large messages, not many small ones.
 * A coarse step turns each of those into an audible jump: at 1/16 a batch of
 * four moved a quarter of unity at once, which read as fast AND jerky. The step
 * has to be small enough that a batch still lands as a slide.
 *
 * The 8 knobs and the master knob get identical treatment because the host does
 * not accelerate either — it intercepts CC 79 only, and davebox claims it
 * (`claims_master_knob`), so both arrive as the same raw batched counts. */
export const SLOT_LEVEL_STEP = 1 / 64;

/* Ceiling for every level control, matching the host's Module Level row.
 *
 * NOT the slot Volume's 0..4. The gain is applied where the synth is summed into
 * the slot and clamps to int16 right there, so boost above unity clips before
 * the bus fader downstream can do anything about it. Some boost has to stay:
 * turning the synth down is the only way to favour a routed Move track, and
 * turning it up is the only way to favour the synth. Halving the range also
 * doubles the resolution around unity, where balancing actually happens.
 * (The host still CLAMPS at 4 — that is the wire bound, deliberately left
 * permissive so already-saved states aren't reinterpreted.) */
export const SLOT_LEVEL_MAX = 2;
export function engineGetSlotParam(slot, key) {
    return shadow_get_param(slot, 'slot:' + key);
}

export function engineSetSlotParam(slot, key, val) {
    return shadow_set_param(slot, 'slot:' + key, String(val));
}

/* Flush chain state to disk. shadow_ui.js defines this global and it already
 * persists slot volumes/channels/mute/solo, so no host change was needed to
 * make slot level survive a reboot. Synchronous file write — call it at the END
 * of a gesture. */
export function engineSaveState() {
    if (typeof shadow_save_state_now === 'function') return !!shadow_save_state_now();
    return false;
}

/* Runtime claim on the master volume knob: suppresses CC 79 + touch note 8 from
 * reaching Move firmware, so the knob can mean something else without Move also
 * moving its master level and covering the screen with its overlay. Requires
 * the host's host_vol_block (fork). Gated on typeof so an unpatched host simply
 * doesn't claim it — the editor still works, Move's volume just moves too. */
export function engineVolBlock(on) {
    if (typeof host_vol_block !== 'function') return false;
    host_vol_block(on ? 1 : 0);
    return true;
}

/* Batched reads. shadow_get_params(slot, key, value) exists but its wire format
 * is defined shim-side and undocumented in the JS contract, so this loops for
 * now. Callers already treat it as one call, so switching to the bulk path
 * later is a change to this function alone. */
export function engineGetMany(slot, comp, keys) {
    const out = {};
    for (const k of keys) out[k] = engineGet(slot, comp, k);
    return out;
}

export function engineSetMany(slot, comp, pairs) {
    for (const k in pairs) engineSet(slot, comp, k, pairs[k]);
    return true;
}

/* ---- module lifecycle ---- */

export function engineLoadedModule(slot, comp) {
    return shadow_get_param(slot, moduleReadKey(comp)) || '';
}

export function engineLoadModule(slot, comp, moduleId) {
    return shadow_set_param(slot, comp + ':module', String(moduleId));
}

/* Scan the filesystem for modules valid in this component. Returns
 * [{id, name, path}] sorted by name. A leading NONE entry is the caller's job. */
export function engineListModules(comp) {
    const spec = COMPONENTS[comp];
    const result = [];
    if (!spec) return result;
    const dir = MODULES_BASE + '/' + spec.scanDir;
    try {
        /* os.readdir returns [names, errno] — the array is element 0. */
        const res = os.readdir(dir);
        const entries = res && res[0];
        if (!entries || !entries.length) return result;
        for (const entry of entries) {
            if (entry === '.' || entry === '..') continue;
            try {
                const raw = host_read_file(dir + '/' + entry + '/module.json');
                if (!raw) continue;
                const json = JSON.parse(raw);
                const ct = json.component_type ||
                           (json.capabilities && json.capabilities.component_type);
                if (ct !== spec.type) continue;
                result.push({
                    id:   json.id || entry,
                    name: json.name || entry,
                    path: dir + '/' + entry + '/' + (json.dsp || 'dsp.so'),
                });
            } catch (e) { /* skip unreadable/!json module dirs */ }
        }
    } catch (e) { /* missing category dir = no modules of this type */ }
    result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return result;
}

/* ---- canvaskit bank structure ----
 *
 * Modules built on schwung-canvaskit ship a generated canvas.js whose config is
 * a HAND-AUTHORED bank layout: bank order, which params group together, 4-char
 * labels chosen to fit, and which banks are envelopes. That is strictly better
 * information than our own walk can derive, because it is intent rather than
 * inference — so where a module publishes it, we use it.
 *
 * The config lives inside the generated file's IIFE and is not exported, but
 * the kit attaches its internals to the overlay it does export:
 *   globalThis.bank_editor._test = { BANKS, JUMP_SECTIONS, CONFIG, ... }
 * `_test` is the kit's own test surface, NOT a published contract — a kit
 * version bump could rename it. Every read below is therefore defensive and
 * returns null on anything unexpected, so a rename degrades to our derived
 * layout instead of breaking the editor.
 *
 * ⚠ THE HAZARD: shadow_load_ui_module evaluates the script into the SHARED
 * QuickJS globalThis — the one davebox's own init/tick/onMidiMessage* live on.
 * A module UI script may assign those. shadow_ui saves and restores them around
 * every load for exactly this reason; not doing so would stop davebox ticking.
 * Restore has to honour whether the property EXISTED, not just its value. */
function moduleDirFor(comp, moduleId) {
    const spec = COMPONENTS[comp];
    if (!spec || !moduleId) return '';
    const base = MODULES_BASE + '/' + spec.scanDir;
    /* Directory name usually IS the id, but module.json is the authority — a
     * mismatch would otherwise silently find no canvas. */
    const direct = base + '/' + moduleId;
    try {
        const raw = host_read_file(direct + '/module.json');
        if (raw && JSON.parse(raw).id === moduleId) return direct;
    } catch (e) { /* fall through to the scan */ }
    try {
        const res = os.readdir(base);
        const entries = (res && res[0]) || [];
        for (const entry of entries) {
            if (entry === '.' || entry === '..') continue;
            try {
                const raw = host_read_file(base + '/' + entry + '/module.json');
                if (raw && JSON.parse(raw).id === moduleId) return base + '/' + entry;
            } catch (e) { /* skip */ }
        }
    } catch (e) { /* no category dir */ }
    return '';
}

export function engineLoadKitStructure(comp, moduleId) {
    if (typeof shadow_load_ui_module !== 'function') return null;
    const dir = moduleDirFor(comp, moduleId);
    if (!dir) return null;
    const path = dir + '/canvas.js';
    if (typeof host_file_exists === 'function' && !host_file_exists(path)) return null;

    const G = globalThis;
    const had = {
        init: Object.prototype.hasOwnProperty.call(G, 'init'),
        tick: Object.prototype.hasOwnProperty.call(G, 'tick'),
        mi:   Object.prototype.hasOwnProperty.call(G, 'onMidiMessageInternal'),
        me:   Object.prototype.hasOwnProperty.call(G, 'onMidiMessageExternal'),
        be:   Object.prototype.hasOwnProperty.call(G, 'bank_editor'),
        co:   Object.prototype.hasOwnProperty.call(G, 'canvas_overlay'),
        cos:  Object.prototype.hasOwnProperty.call(G, 'canvas_overlays'),
    };
    const saved = {
        init: G.init, tick: G.tick,
        mi: G.onMidiMessageInternal, me: G.onMidiMessageExternal,
        be: G.bank_editor, co: G.canvas_overlay, cos: G.canvas_overlays,
    };

    let out = null;
    try {
        if (shadow_load_ui_module(path)) {
            const t = G.bank_editor && G.bank_editor._test;
            if (t && Array.isArray(t.BANKS) && t.BANKS.length) {
                out = {
                    banks: t.BANKS,
                    sections: Array.isArray(t.JUMP_SECTIONS) ? t.JUMP_SECTIONS : null,
                    /* ⭑ The LIVE overlay, kept for modules that opt into hosting.
                     *
                     * Adoption can only ever carry DATA. Everything a module
                     * expresses as CODE — its header function, cellViz, the
                     * browse picker, icons — dies at this boundary, which is why
                     * a hosted DR32 page could never say which pad it was
                     * editing. Keeping the object lets us run its real
                     * bank_editor(ctx) instead of re-implementing it.
                     *
                     * Safe to retain after the globals are restored below: the
                     * overlay closes over its own IIFE scope, so it does not
                     * depend on globalThis.bank_editor still pointing at it.
                     *
                     * Only used when the module DECLARES hosting (see
                     * engineHostsOwnUi) — davebox tracks a ctx contract it does
                     * not own, so a module reaching past it must fail on the
                     * author's terms, not silently inside our shell. */
                    overlay: G.bank_editor,
                };
            }
        }
    } catch (e) {
        out = null;
    }

    /* Restore unconditionally — including on the throw path above. */
    if (had.init) G.init = saved.init; else delete G.init;
    if (had.tick) G.tick = saved.tick; else delete G.tick;
    if (had.mi) G.onMidiMessageInternal = saved.mi; else delete G.onMidiMessageInternal;
    if (had.me) G.onMidiMessageExternal = saved.me; else delete G.onMidiMessageExternal;
    if (had.be) G.bank_editor = saved.be; else delete G.bank_editor;
    if (had.co) G.canvas_overlay = saved.co; else delete G.canvas_overlay;
    if (had.cos) G.canvas_overlays = saved.cos; else delete G.canvas_overlays;

    return out;
}

/* Does this module ask davebox to run its OWN canvas UI?
 *
 * OPT-IN, and deliberately so. davebox supplies a ctx it does not own the
 * contract for (~8 functions), so under automatic hosting a module reaching
 * beyond that surface would break *inside davebox*, silently, and the bug
 * report would land on the module author for someone else's shell. A
 * declaration means somebody verified it works hosted.
 *
 * Declared, not sniffed — the same rule as the host's own input claims. The
 * synthesised/adopted path stays the fallback, so a module that does not
 * declare simply looks the way it looks today rather than blanking.
 */
export function engineHostsOwnUi(comp, moduleId) {
    const dir = moduleDirFor(comp, moduleId);
    if (!dir) return false;
    try {
        const raw = host_read_file(dir + '/module.json');
        if (!raw) return false;
        const caps = JSON.parse(raw).capabilities;
        return !!(caps && caps.host_canvas_ui === true);
    } catch (e) {
        return false;   /* unreadable/unparseable -> adopt, never guess */
    }
}

/* ---- self-description (feeds ui_discover) ---- */

/* `diag` records WHY a module ended up on the path it did. A silent fall back to
 * chain_params is indistinguishable from a module that genuinely publishes no
 * hierarchy, and that ambiguity already cost one wrong diagnosis (Mini-JV, which
 * does publish one). Never let a parse failure disappear into a bare catch. */
export function engineDescribe(slot, comp) {
    let chainParams = null, hierarchy = null;
    const diag = { cpLen: 0, hLen: 0, cpError: null, hError: null };

    const cpRaw = engineGet(slot, comp, 'chain_params');
    diag.cpLen = cpRaw ? cpRaw.length : 0;
    if (cpRaw) {
        try { chainParams = JSON.parse(cpRaw); }
        catch (e) { chainParams = null; diag.cpError = String(e); }
    }

    const hRaw = engineGet(slot, comp, 'ui_hierarchy');
    diag.hLen = hRaw ? hRaw.length : 0;
    if (hRaw) {
        try { hierarchy = JSON.parse(hRaw); }
        catch (e) {
            hierarchy = null;
            diag.hError = String(e);
            /* Truncation shows up as a parse error at the very end of the blob —
             * record the tail so a transport limit is distinguishable from
             * genuinely malformed JSON. */
            diag.hTail = hRaw.slice(-40);
        }
    }
    return { chainParams, hierarchy, diag };
}

/* ---- opaque state blob (module presets ride on this) ---- */

export function engineGetState(slot, comp) { return engineGet(slot, comp, 'state'); }
export function engineSetState(slot, comp, blob) { return engineSet(slot, comp, 'state', blob); }

/* ---- USER presets (the wrapped-JSON store) ----
 *
 * The host's own "Module Presets" browser (shadow_ui_presets.mjs) stores one
 * component's state per file under presets/<module-id>/, so filtering to the
 * loaded module is free — we only ever list that one folder. Format:
 *
 *   { "name": "Fat Brass", "module": "obxd", "version": 1, "state": <blob> }
 *
 * `state` is the PARSED object when the module's state is JSON, and the raw
 * opaque string otherwise. Recall is the ordinary slot-load path
 * (`<comp>:state`), which is why no per-module code is needed.
 *
 * Do NOT confuse these with a module's BAKED-IN presets: those aren't files at
 * all, they're the list_param/count_param/name_param level (see ui_discover's
 * findPresetSpec) — an index the module owns, not a store we can write. */
export const PRESET_ROOT = '/data/UserData/schwung/presets';

export function engineListUserPresets(moduleId) {
    const out = [];
    if (!moduleId) return out;
    const dir = PRESET_ROOT + '/' + moduleId;
    try {
        const res = os.readdir(dir);
        const entries = res && res[0];
        if (!entries || !entries.length) return out;
        for (const entry of entries) {
            if (entry === '.' || entry === '..') continue;
            if (entry.length < 6 || entry.slice(-5) !== '.json') continue;
            /* Prefer the in-file name (it survives filename sanitising), fall
             * back to the basename — same precedence the host browser uses. */
            let name = entry.slice(0, -5);
            try {
                const raw = host_read_file(dir + '/' + entry);
                if (raw) {
                    const j = JSON.parse(raw);
                    if (j && typeof j.name === 'string' && j.name) name = j.name;
                }
            } catch (e) { /* unreadable/!json: keep the basename */ }
            out.push({ name, path: dir + '/' + entry });
        }
    } catch (e) { /* no folder = this module has no user presets */ }
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out;
}

/* Read a preset file and hand back the blob to feed engineSetState. Returns
 * null when the file is missing/corrupt so the caller can say so rather than
 * pushing `undefined` into the slot and silently zeroing the sound. */
export function engineReadUserPreset(path) {
    try {
        const raw = host_read_file(path);
        if (!raw) return null;
        const j = JSON.parse(raw);
        if (!j || j.state === undefined || j.state === null) return null;
        return (typeof j.state === 'string') ? j.state : JSON.stringify(j.state);
    } catch (e) { return null; }
}

/* ---- slots ---- */

export function engineSlots() {
    const raw = (typeof shadow_get_slots === 'function') ? shadow_get_slots() : null;
    if (!raw) return [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        out.push({ idx: i, channel: raw[i].channel, name: raw[i].name || '' });
    }
    return out;
}

export function engineFocusedSlot() {
    return (typeof shadow_get_ui_slot === 'function') ? (shadow_get_ui_slot() | 0) : 0;
}
