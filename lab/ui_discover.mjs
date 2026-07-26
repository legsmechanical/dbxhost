/* ui_discover.mjs — layers A + B of the pipeline.
 *
 *   A. discovery   : ask the module what it has (chain_params + ui_hierarchy)
 *   B. param model : decide what widget each param deserves
 *
 * Output is an array of BANKS, each { name, cells: [8] }, where a cell is the
 * canvaskit param descriptor:
 *
 *   { key, label, short, kind, type, min, max, step, sens, options, guessed }
 *
 * `kind` is deliberately canvaskit's vocabulary (uni/bip/tog/enumc/count/oct/
 * fader/len/dir/file) rather than a davebox-local one, so the cell mapper in
 * ui_cells.mjs stays a straight translation and a future hand-written overlay
 * file can name kinds directly.
 *
 * Nothing here talks to the engine except through ui_engine.mjs.
 *
 * Provenance: the discovery rules (hierarchy levels -> pages, chain_params as
 * the authority for value metadata, filepath handling, the no-metadata guess)
 * follow schwung-movy's src/model/hierarchy.ts (MIT, (c) 2026 megadake).
 * Re-derived here rather than ported: movy's version is TypeScript against its
 * own ModelState and carries movy-specific concerns (drum configs, automation
 * flags, LFO slots) this rig has no use for.
 */

import { engineDescribe } from './ui_engine.mjs';

export const CELLS_PER_BANK = 8;

/* Knob-response classes — canvaskit's three tiers, by detents per step.
 * Discrete kinds never accelerate and clamp rather than wrap. */
const SENS_CONTINUOUS = 2;
const SENS_PICK       = 6;
const SENS_DELIBERATE = 12;

/* Option-list shape sniffing: these decide enumc vs len vs dir. */
const FRACTION_RE = /^\d+\/\d+[td]?$/;
const DIR_WORDS = ['fwd', 'bwd', 'forward', 'backward', 'reverse', 'ppf', 'ppb', 'pingpong'];

function looksFractional(options) {
    if (!options || options.length < 2) return false;
    let hits = 0;
    for (const o of options) if (FRACTION_RE.test(String(o).trim())) hits++;
    return hits >= Math.ceil(options.length / 2);
}

function looksDirectional(options) {
    if (!options || options.length < 2 || options.length > 4) return false;
    let hits = 0;
    for (const o of options) {
        if (DIR_WORDS.indexOf(String(o).trim().toLowerCase().replace(/[\s-]/g, '')) !== -1) hits++;
    }
    return hits >= 2;
}

/* ---- short labels ------------------------------------------------------
 * The label strip is 32px — roughly 4-5 characters. chain_params gives full
 * names ("Beat Stretch"). The full name still renders in the touched header,
 * so a mediocre abbreviation degrades gracefully; it never loses information.
 *
 * Rule: for multi-word names the LAST word is almost always the noun that
 * identifies the param ("Filter Cutoff" -> Cutoff, "Osc 1 Pitch" -> Pitch), so
 * abbreviate that. Devowel (keeping the leading character) before truncating,
 * because consonants carry the recognition. */
export function shortLabel(name, maxLen) {
    const lim = maxLen || 4;
    let s = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
    if (!s) return '';
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
        const last = words[words.length - 1];
        /* A trailing number is an index, not the noun ("Osc 2") — keep the pair. */
        if (/^\d+$/.test(last) && words.length >= 2) {
            s = words[words.length - 2].slice(0, lim - last.length) + last;
            return s.slice(0, lim);
        }
        s = last;
    }
    if (s.length <= lim) return s;
    const devowelled = s[0] + s.slice(1).replace(/[aeiou]/gi, '');
    return (devowelled.length >= 2 ? devowelled : s).slice(0, lim);
}

/* ---- param -> cell descriptor ------------------------------------------ */

function makeCell(key, meta) {
    const label = String(meta.name || meta.label || key);
    const type = meta.type || 'float';

    if (type === 'filepath') {
        return {
            key, label, short: shortLabel(label), kind: 'file', type: 'file',
            min: 0, max: 0, step: 0, sens: SENS_DELIBERATE, options: null,
            fileRoot: meta.root || '/data/UserData',
            fileFilter: meta.filter || null,
            fileStartPath: meta.start_path || meta.root || '/data/UserData',
        };
    }

    const options = meta.options || null;

    if (type === 'enum') {
        const n = options ? options.length : 128;
        let kind = 'enumc';
        if (n <= 2) kind = 'tog';
        else if (looksFractional(options)) kind = 'len';
        else if (looksDirectional(options)) kind = 'dir';
        return {
            key, label, short: shortLabel(label), kind, type: 'enum',
            min: 0, max: n - 1, step: 1,
            sens: n <= 2 ? SENS_DELIBERATE : SENS_PICK,
            options,
        };
    }

    /* numeric */
    const hasRange = meta.min != null || meta.max != null;
    const min = meta.min != null ? Number(meta.min) : 0;
    const max = meta.max != null ? Number(meta.max) : 1;
    const step = meta.step != null ? Number(meta.step)
                                   : (type === 'float' ? (max - min) / 100 : 1);
    const span = max - min;
    let kind;
    if (type === 'int' && span > 0 && span <= 16) {
        /* canvaskit's own rule of thumb: <=16 discrete values reads as digits,
         * so it wants pick travel, not a sweep. */
        kind = min < 0 ? 'oct' : 'count';
    } else if (min < 0 && max > 0) {
        kind = 'bip';
    } else {
        kind = 'uni';
    }
    const cell = {
        key, label, short: shortLabel(label), kind, type,
        min, max, step,
        sens: (kind === 'count' || kind === 'oct') ? SENS_PICK : SENS_CONTINUOUS,
        options: null,
    };
    /* No range published anywhere — we guessed 0..1. Flagged so the UI can be
     * honest about it and so a first value read could widen the range later. */
    if (!hasRange) cell.guessed = true;
    return cell;
}

export function blankCell() {
    return { key: null, label: '', short: '', kind: 'blank', type: 'blank',
             min: 0, max: 0, step: 0, sens: SENS_DELIBERATE, options: null };
}

/* ---- bank assembly ----------------------------------------------------- */

function padToBank(name, cells) {
    const out = cells.slice(0, CELLS_PER_BANK);
    while (out.length < CELLS_PER_BANK) out.push(blankCell());
    return { name, cells: out };
}

function addLevel(banks, label, cells) {
    const pages = Math.max(1, Math.ceil(cells.length / CELLS_PER_BANK));
    for (let i = 0; i < pages; i++) {
        banks.push(padToBank(
            pages === 1 ? label : label + ' ' + (i + 1),
            cells.slice(i * CELLS_PER_BANK, (i + 1) * CELLS_PER_BANK),
        ));
    }
}

/* Build the full bank list for a loaded module.
 * Returns { banks: [{name, cells}], paramCount, source } where `source` says
 * which discovery path produced the layout — useful when a module lays out
 * badly and you need to know whether to blame the hierarchy or the fallback. */
export function discover(slot, comp) {
    const { chainParams, hierarchy } = engineDescribe(slot, comp);

    /* chain_params is the AUTHORITY for value metadata. ui_hierarchy only
     * decides layout (and supplies labels for params chain_params omits). */
    const cpMap = {}, cpOrder = [];
    if (chainParams && chainParams.length) {
        for (const cp of chainParams) {
            if (cp && cp.key) { cpMap[cp.key] = cp; cpOrder.push(cp.key); }
        }
    }

    const levels = (hierarchy && hierarchy.levels) || {};
    const root = levels['root'] || null;
    const banks = [];
    const seen = {};

    function cellFor(key, hierMeta) {
        const cp = cpMap[key] || {};
        const meta = {
            name: cp.name || (hierMeta && hierMeta.label) || key,
            type: cp.type || (hierMeta && hierMeta.type),
            min:  cp.min  != null ? cp.min  : (hierMeta && hierMeta.min),
            max:  cp.max  != null ? cp.max  : (hierMeta && hierMeta.max),
            step: cp.step != null ? cp.step : (hierMeta && hierMeta.step),
            options: cp.options || (hierMeta && hierMeta.options) || null,
            root: cp.root, filter: cp.filter, start_path: cp.start_path,
        };
        seen[key] = true;
        return makeCell(key, meta);
    }

    function keysOf(knobs) {
        const out = [];
        if (!Array.isArray(knobs)) return out;
        for (const k of knobs) {
            const key = (typeof k === 'string') ? k : (k && k.key);
            if (key) out.push({ key, meta: (typeof k === 'object') ? k : null });
        }
        return out;
    }

    let source = 'hierarchy';

    if (root && Array.isArray(root.knobs) && root.knobs.length) {
        addLevel(banks, 'Main', keysOf(root.knobs).map(e => cellFor(e.key, e.meta)));
    }

    /* Sub-levels: any level reachable from root.params that carries its own
     * knobs becomes its own bank (or run of banks). One level deep — deeper
     * trees are navigation scaffolding, not knob pages. */
    if (root && Array.isArray(root.params)) {
        for (const entry of root.params) {
            if (!entry || typeof entry !== 'object' || !entry.level) continue;
            const lvl = levels[entry.level];
            if (!lvl || !Array.isArray(lvl.knobs) || !lvl.knobs.length) continue;
            const name = lvl.name || entry.label || entry.level;
            addLevel(banks, name, keysOf(lvl.knobs).map(e => cellFor(e.key, e.meta)));
        }
    }

    /* Fallback: module published chain_params but no usable hierarchy. Chunk the
     * publish order. `ui_*` keys are the module's own UI state, not user params. */
    if (banks.length === 0 && cpOrder.length) {
        source = 'chain_params';
        const keys = cpOrder.filter(k => k.indexOf('ui_') !== 0);
        addLevel(banks, 'Params', keys.map(k => cellFor(k, null)));
    }

    /* Any filepath param the layout missed is worth surfacing — it's usually the
     * most important control the module has (the sample/ROM/bank to load). */
    const orphanFiles = cpOrder.filter(k => !seen[k] && cpMap[k].type === 'filepath');
    if (orphanFiles.length) {
        addLevel(banks, 'Files', orphanFiles.map(k => cellFor(k, null)));
    }

    let paramCount = 0;
    for (const b of banks) for (const c of b.cells) if (c.key) paramCount++;

    return { banks, paramCount, source };
}
