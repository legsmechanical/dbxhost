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
