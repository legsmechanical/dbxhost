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
        const [entries] = os.readdir(dir);
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

export function engineDescribe(slot, comp) {
    let chainParams = null, hierarchy = null;
    const cpRaw = engineGet(slot, comp, 'chain_params');
    if (cpRaw) { try { chainParams = JSON.parse(cpRaw); } catch (e) { chainParams = null; } }
    const hRaw = engineGet(slot, comp, 'ui_hierarchy');
    if (hRaw) { try { hierarchy = JSON.parse(hRaw); } catch (e) { hierarchy = null; } }
    return { chainParams, hierarchy };
}

/* ---- opaque state blob (module presets ride on this) ---- */

export function engineGetState(slot, comp) { return engineGet(slot, comp, 'state'); }
export function engineSetState(slot, comp, blob) { return engineSet(slot, comp, 'state', blob); }

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
