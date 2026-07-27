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

/* ---- level-graph walk --------------------------------------------------
 * Turns a module's ui_hierarchy levels into an ordered list of knob pages.
 *
 * Re-derived from schwung-movy's src/model/hierarchy-walk.ts (MIT, (c) 2026
 * megadake). Every rule below is fleet knowledge paid for on real modules —
 * an earlier one-level-deep version of this walk lost dexed's operators
 * entirely and dropped minijv onto the chain_params fallback:
 *
 *   1. Follow BOTH edge kinds — `params[].level` nav entries AND `children` —
 *      from every level, not just root.
 *   2. `children` counts as absent when null, missing, OR the literal string
 *      "None" (dexed serialises it that way).
 *   3. Walk to arbitrary depth with a visited set, not a fixed depth limit.
 *      A level that has knobs can still own sub-levels (dexed Operators).
 *   4. Dedup pages by their exact knob key-list: modules routinely publish a
 *      `children` level that re-lists root's knobs, which would otherwise
 *      render as a duplicate page.
 *   5. A level's display name usually lives on the nav entry POINTING at it,
 *      not on the level itself — nav label wins.
 *   6. Sweep up levels no edge reaches (minijv's performance/part pages), or
 *      their knobs are permanently unreachable.
 *
 * `transparent` marks a level reached through a `children` edge: it stands in
 * for its parent's menu rather than being a category, so it neither introduces
 * nor consumes a name prefix. A `params` nav edge does introduce one, which is
 * what keeps sibling pages apart ("Tone 1/Filter").
 */

function levelNameToPrefix(name) {
    const words = String(name || '').split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    if (words.length === 1) return words[0].slice(0, 6);
    return (words[0].slice(0, 4) +
            words.slice(1).map(w => w[0].toUpperCase()).join('')).slice(0, 6);
}

function childOf(lvl) {
    const c = lvl && lvl.children;
    return (c && c !== 'None') ? c : null;
}

function knobEntries(lvl) {
    const out = [];
    const knobs = (lvl && lvl.knobs) || [];
    if (!Array.isArray(knobs)) return out;
    for (const k of knobs) {
        const key = (typeof k === 'string') ? k : (k && k.key);
        if (key) out.push({ key, meta: (typeof k === 'object') ? k : null });
    }
    return out;
}

export function buildLevelPages(allLevels, rootKey) {
    const out = [];
    const rootLevel = allLevels[rootKey];
    if (!rootLevel) return out;

    /* Nav-entry labels, collected from EVERY level (rule 5). */
    const navLabel = {};
    for (const lvl of Object.values(allLevels)) {
        for (const p of ((lvl && lvl.params) || [])) {
            if (p && typeof p === 'object' && p.level && p.label) navLabel[p.level] = p.label;
        }
    }
    const nameOf = (key, lvl) => (lvl && lvl.name) || navLabel[key] || (lvl && lvl.label) || key;

    const sigOf = (entries) => entries.map(e => e.key).join(' ');
    const rendered = new Set([sigOf(knobEntries(rootLevel))]);
    const visited = new Set([rootKey]);

    function visit(key, prefix, transparent) {
        if (visited.has(key)) return;
        visited.add(key);
        const lvl = allLevels[key];
        if (!lvl) return;

        const name = nameOf(key, lvl);
        const entries = knobEntries(lvl);
        const sig = sigOf(entries);
        if (entries.length && !rendered.has(sig)) {
            rendered.add(sig);
            out.push({ name: prefix ? prefix + '/' + name : name, entries });
        }

        /* Both edges, always — a level with knobs can still own sub-levels. */
        const childPrefix = transparent ? prefix : levelNameToPrefix(name);
        for (const p of (lvl.params || [])) {
            if (p && typeof p === 'object' && p.level) visit(p.level, childPrefix, false);
        }
        const child = childOf(lvl);
        if (child) visit(child, prefix, true);
    }

    for (const p of (rootLevel.params || [])) {
        if (p && typeof p === 'object' && p.level) visit(p.level, null, false);
    }
    const rootChild = childOf(rootLevel);
    if (rootChild) visit(rootChild, null, true);

    /* Rule 6: orphan levels no edge reaches. */
    for (const key of Object.keys(allLevels)) {
        if (!visited.has(key) && knobEntries(allLevels[key]).length) visit(key, null, false);
    }
    return out;
}

/* ---- envelope detection ------------------------------------------------
 * canvaskit declares envelopes in a hand-written config (`env: true`, or
 * { startCol, cellCount, roles }). Discovered banks have no such declaration,
 * so infer it: a run of consecutive continuous cells whose names read as
 * Attack / Decay / Sustain / Release in that order surrenders its individual
 * knobs to one envelope graphic.
 *
 * Constrained to a single widget ROW (cells 0-3 or 4-7) because the graphic is
 * drawn across one row's band — a run straddling the split would draw across a
 * gap. Hera puts A/D/S/R in cells 4-7, which is exactly the row-1 case.
 *
 * Requires 'a' plus at least one more stage: a lone Attack is just a knob. */
const ENV_ROLE_WORDS = [
    ['a', /\battack\b|\batk\b/i],
    ['d', /\bdecay\b|\bdcy\b/i],
    ['s', /\bsustain\b|\bsus\b/i],
    ['r', /\brelease\b|\brel\b/i],
];

function envRoleOf(cell) {
    if (!cell || !cell.key) return null;
    /* Continuous cells only — an enum named "Decay Mode" is not a stage. */
    if (cell.kind !== 'uni' && cell.kind !== 'fader' && cell.kind !== 'bip') return null;
    const hay = String(cell.label || '') + ' ' + String(cell.key || '').replace(/_/g, ' ');
    for (const [role, re] of ENV_ROLE_WORDS) if (re.test(hay)) return role;
    return null;
}

/* Valid stage orders — sustain is a LEVEL, so it never leads. */
const ENV_SHAPES = ['adsr', 'ad', 'ar', 'asr', 'ads'];

export function detectEnvelope(bank) {
    if (!bank || !bank.cells) return null;
    for (const rowStart of [0, 4]) {
        let run = [], roles = '';
        for (let i = rowStart; i < rowStart + 4; i++) {
            const role = envRoleOf(bank.cells[i]);
            if (role && roles.indexOf(role) === -1) {
                run.push(i); roles += role;
            } else if (run.length) {
                break;      /* run must be CONSECUTIVE */
            }
        }
        if (run.length >= 2 && roles[0] === 'a' && ENV_SHAPES.indexOf(roles) !== -1) {
            return { start: run[0], count: run.length, roles };
        }
    }
    return null;
}

/* A filter span and an envelope span must never claim the same cells — both
 * would draw over each other and both would suppress the same widgets. */
function overlapsEnv(filt, env) {
    if (!filt || !env) return false;
    const fa = filt.start, fb = filt.start + 1;
    const ea = env.start, eb = env.start + env.count - 1;
    return !(fb < ea || fa > eb);
}

/* ---- filter-curve detection --------------------------------------------
 * canvaskit declares this as filterViz: { cell, cutoffKey, resoKey, mode }.
 * Discovered banks declare nothing, so infer: an ADJACENT cutoff + resonance
 * pair of continuous cells in the same row surrenders both knobs to one
 * response curve. Hera's vcf_cutoff / vcf_resonance are exactly that.
 *
 * Resonance is REQUIRED. A lone cutoff knob is more useful as a knob than as a
 * curve whose bump never moves, and pairing is also what makes the inference
 * safe — "cutoff" alone appears on plenty of non-filter params (LFO cutoff mod
 * depth, envelope->cutoff amount) that would draw a meaningless curve. */
/* "cutoff" is unambiguous. Bare "freq" is NOT — every oscillator and LFO has
 * one, and pairing those with a neighbouring "res"-ish knob invented filter
 * curves on modules that have a single filter (noisemaker reported 4). So a
 * frequency only counts as a cutoff when the SAME name also says filter. */
const RE_CUTOFF_STRONG = /\bcutoff\b|\bcutof\b|\bctf\b/i;
const RE_FREQ = /\bfreq(uency)?\b/i;
const RE_FILTERISH = /\b(filter|vcf|flt|lpf|hpf|bpf)\b/i;
/* Bare "q" is too short to be safe on its own — it appears as a suffix and an
 * axis label all over the place. Require a real resonance word. */
const RE_RESO = /\bresonance\b|\breso\b|\bres\b|\bemphasis\b/i;

function looksLikeCutoff(name) {
    if (RE_CUTOFF_STRONG.test(name)) return true;
    return RE_FREQ.test(name) && RE_FILTERISH.test(name);
}
/* Mode enum option name -> kit curve id. Anything unmatched falls back to lp
 * rather than drawing a confidently wrong shape. */
/* The \d* is load-bearing. Real option lists carry the slope in the same token
 * — noisemaker ships LP24 LP18 LP12 LP6 HP24 BP24 Notch SV-LP SV-HP SV-BP Moog
 * Moog2 — and \bhp\b does NOT match "HP24", because there is no word boundary
 * between letters and digits. Without it every sloped high-pass and band-pass
 * fell through to the lp default and drew the wrong curve. (SV-HP matched only
 * because the hyphen happens to create a boundary.)
 *
 * Order matters: notch/bp/hp are tested before lp, or "SV-LP" would shadow
 * nothing but "SV-BP" would match lp on its trailing letters. Named ladder
 * models (Moog) are low-pass, so they map to lp deliberately rather than by
 * falling through. */
const FILT_MODE_WORDS = [
    ['notch', /notch|\bbr\d*\b|band\s*reject/i],
    ['bp', /band\s*pass|\bbp\d*\b/i],
    ['hp', /high\s*pass|\bhp\d*\b|hipass/i],
    ['lp', /low\s*pass|\blp\d*\b|lopass|\bmoog\d*\b|ladder/i],
    ['peak', /peak|bell/i],
    ['ap', /all\s*pass|\bap\d*\b/i],
    ['off', /\boff\b|bypass/i],
];

function isContinuous(cell) {
    return cell && (cell.kind === 'uni' || cell.kind === 'fader' || cell.kind === 'bip');
}

/* The module's filter-MODEL enum, searched MODULE-WIDE rather than per bank.
 * A module typically publishes filter_type on its filter page only, while
 * cutoff/resonance are re-listed as convenience knobs on several others
 * (noisemaker does exactly this on root/fenv/env3). Resolving the mode only
 * from the current bank meant those pages always drew lp no matter what model
 * the filter was actually set to. */
export function findFilterModeCell(banks) {
    for (const b of banks) {
        for (const cell of b.cells) {
            if (!cell || !cell.key || cell.kind !== 'enumc' || !cell.options) continue;
            const nm = String(cell.label || '') + ' ' + String(cell.key || '').replace(/_/g, ' ');
            if (!/\b(filter|vcf|flt)\b/i.test(nm)) continue;
            if (!/\b(mode|type|model|slope|shape)\b/i.test(nm)) continue;
            return { key: cell.key, options: cell.options };
        }
    }
    return null;
}

/* Map a mode enum's CURRENT option string to a curve id. */
export function modeIdFor(optionText) {
    if (!optionText) return null;
    for (const [id, re] of FILT_MODE_WORDS) if (re.test(String(optionText))) return id;
    return 'lp';            /* published a model we don't recognise */
}

export function detectFilterViz(bank) {
    if (!bank || !bank.cells) return null;
    for (const rowStart of [0, 4]) {
        for (let i = rowStart; i < rowStart + 3; i++) {
            const a = bank.cells[i], b = bank.cells[i + 1];
            if (!isContinuous(a) || !isContinuous(b)) continue;
            const an = String(a.label || '') + ' ' + String(a.key || '').replace(/_/g, ' ');
            const bn = String(b.label || '') + ' ' + String(b.key || '').replace(/_/g, ' ');
            /* Cutoff must lead — that's the column the corner sits on. */
            if (looksLikeCutoff(an) && RE_RESO.test(bn) && !looksLikeCutoff(bn)) {
                return { start: i, cutoffKey: a.key, resoKey: b.key };
            }
        }
    }
    return null;
}

/* Fill in the live values + mode for a detected filter, ready to render. */
export function filterVizFor(bank, values) {
    if (!bank || !bank.filt) return null;
    const f = bank.filt;
    const normOf = (key) => {
        for (const c of bank.cells) {
            if (c && c.key === key) {
                const v = values ? values[key] : null;
                const span = c.max - c.min;
                return (v == null || span <= 0) ? 0 : (v - c.min) / span;
            }
        }
        return 0;
    };
    /* Mode comes from the module-wide model enum, whose value the caller polls
     * even when it lives on another page (see pollValues). */
    let mode = 'lp';
    if (f.modeKey && f.modeOptions && values) {
        const v = values[f.modeKey];
        if (v != null) mode = modeIdFor(f.modeOptions[Math.round(v)]) || 'lp';
    }
    return {
        start: f.start,
        cutoffNorm: normOf(f.cutoffKey),
        resoNorm: normOf(f.resoKey),
        mode,
    };
}

/* ---- sections ----------------------------------------------------------
 * Coarse jump targets for the SHIFT picker. canvaskit takes these from a
 * hand-authored CONFIG.sections; here they fall out of the walk for free,
 * because a nested page is already named "<parent>/<level>". Grouping
 * consecutive banks by that parent prefix turns minijv's 49 banks into one row
 * per tone, which is the difference between crossing the module in a few steps
 * and 49. Banks with no prefix are their own section.
 *
 * Returns [{ name, bank }] where `bank` is the index to jump to. */
export function deriveSections(banks) {
    const out = [];
    let last = null;
    for (let i = 0; i < banks.length; i++) {
        const name = String((banks[i] && banks[i].name) || '');
        const slash = name.indexOf('/');
        /* A trailing " 2"/" 3" from a multi-page level shares its base name, so
         * strip it too — "Filter 1".."Filter 3" is one section, not three. */
        let group = slash > 0 ? name.slice(0, slash) : name.replace(/ \d+$/, '');
        if (!group) group = name;
        if (group !== last) { out.push({ name: group, bank: i }); last = group; }
    }
    return out;
}

/* Index of the section owning a bank: the last section at or before it. */
export function activeSection(sections, bankIdx) {
    let idx = 0;
    for (let i = 0; i < sections.length; i++) {
        if (sections[i].bank <= bankIdx) idx = i; else break;
    }
    return idx;
}

/* Build the full bank list for a loaded module.
 * Returns { banks: [{name, cells}], paramCount, source } where `source` says
 * which discovery path produced the layout — useful when a module lays out
 * badly and you need to know whether to blame the hierarchy or the fallback. */
export function discover(slot, comp) {
    const { chainParams, hierarchy, diag } = engineDescribe(slot, comp);

    /* chain_params is the AUTHORITY for value metadata. ui_hierarchy only
     * decides layout (and supplies labels for params chain_params omits). */
    const cpMap = {}, cpOrder = [];
    if (chainParams && chainParams.length) {
        for (const cp of chainParams) {
            if (cp && cp.key) { cpMap[cp.key] = cp; cpOrder.push(cp.key); }
        }
    }

    const levels = (hierarchy && hierarchy.levels) || {};
    /* 'root' by convention, but fall back to the first declared level so a
     * module that names its entry point differently still gets walked. */
    const rootKey = levels['root'] ? 'root' : (Object.keys(levels)[0] || null);
    const root = rootKey ? levels[rootKey] : null;
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

    if (root) {
        /* Root's own knobs are the "Main" page; every other reachable level
         * comes from the walk (which already deduped against root's key list). */
        const rootEntries = keysOf(root.knobs);
        if (rootEntries.length) {
            addLevel(banks, root.name || 'Main', rootEntries.map(e => cellFor(e.key, e.meta)));
        }
        for (const page of buildLevelPages(levels, rootKey)) {
            addLevel(banks, page.name, page.entries.map(e => cellFor(e.key, e.meta)));
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

    let paramCount = 0, envCount = 0, filtCount = 0;
    const filtPairs = [];
    for (const b of banks) {
        for (const c of b.cells) if (c.key) paramCount++;
        b.env = detectEnvelope(b);
        if (b.env) envCount++;
        /* Filter curve must not fight the envelope for the same cells. */
        const f = detectFilterViz(b);
        b.filt = (f && !overlapsEnv(f, b.env)) ? f : null;
        if (b.filt) { filtCount++; filtPairs.push(b.filt.cutoffKey + '/' + b.filt.resoKey); }
    }
    /* One model enum for the whole module, shared by every page that draws a
     * curve — including the pages that do not carry the enum themselves. */
    const modeCell = findFilterModeCell(banks);
    if (modeCell) {
        for (const b of banks) {
            if (b.filt) { b.filt.modeKey = modeCell.key; b.filt.modeOptions = modeCell.options; }
        }
    }

    /* Why this module landed on this path. `hierReason` is the interesting field
     * when source === 'chain_params': it separates "published no hierarchy" from
     * "published one we failed to use", which look identical from the outside. */
    let hierReason = 'used';
    if (source === 'chain_params') {
        if (diag && diag.hError) hierReason = 'parse-error: ' + diag.hError +
                                              ' tail=' + JSON.stringify(diag.hTail || '');
        else if (!diag || !diag.hLen) hierReason = 'none-published';
        else if (!hierarchy) hierReason = 'parsed-null';
        else if (!root) hierReason = 'no-root-level:' + JSON.stringify(Object.keys(levels).slice(0, 6));
        else hierReason = 'walk-found-no-knobs-in-' + Object.keys(levels).length + '-levels';
    }

    return {
        banks, paramCount, source, hierReason, envCount, filtCount, filtPairs,
        presetSpec: findPresetSpec(levels),
        /* The RAW hierarchy, for the menu. The knob pages above are a lossy
         * projection: buildLevelPages reads `knobs` only and uses `params`
         * purely for navigation edges, so every param a module declares but
         * doesn't map to one of the 8 knobs is invisible in them. The menu
         * walks these levels directly, which is the whole point of having it. */
        levels, rootKey, cpMap,
        hLen: diag ? diag.hLen : 0,
        cpLen: diag ? diag.cpLen : 0,
    };
}

/* Menu rows for one level: navigation links and editable params, in declared
 * order. `cpMap` (chain_params) stays the authority for value metadata, exactly
 * as it is for the knob pages — the hierarchy only supplies layout and labels.
 *
 * Preset levels are SKIPPED deliberately: sound mode has its own preset picker,
 * and shadow_ui does the same thing ("Skip preset browser levels (those with
 * list_param)", shadow_ui.js). Duplicating it here would be two doors again. */
export function menuRows(levels, levelKey, cpMap) {
    const lv = levels && levels[levelKey];
    const rows = [];
    if (!lv) return rows;
    for (const p of (lv.params || [])) {
        if (typeof p === 'string') {
            rows.push({ kind: 'param', key: p, label: labelFor(p, null, cpMap) });
        } else if (p && p.level) {
            const child = levels[p.level];
            if (child && child.list_param && child.count_param) continue;
            rows.push({ kind: 'level', level: p.level,
                        label: p.label || p.name || (child && (child.name || child.label)) || p.level });
        } else if (p && p.key) {
            rows.push({ kind: 'param', key: p.key, label: labelFor(p.key, p, cpMap) });
        }
    }
    /* A level can own sub-levels via `children` as well as `params` nav entries
     * — dexed's operators are reachable only that way (and it serialises the
     * absent case as the literal string "None"). */
    const kids = lv.children;
    if (kids && kids !== 'None' && Array.isArray(kids)) {
        for (const c of kids) {
            const ck = (typeof c === 'string') ? c : (c && c.level);
            if (!ck || !levels[ck]) continue;
            const child = levels[ck];
            if (child.list_param && child.count_param) continue;
            rows.push({ kind: 'level', level: ck,
                        label: child.name || child.label || ck });
        }
    }
    return rows;
}

function labelFor(key, hierMeta, cpMap) {
    const cp = (cpMap && cpMap[key]) || {};
    return cp.name || (hierMeta && (hierMeta.name || hierMeta.label)) || key;
}

/* Value metadata for a menu param, in the same shape makeCell produces so the
 * menu can reuse ui_cells' parse/step/commit rather than growing a second,
 * subtly-different value engine. */
export function menuCell(key, levels, levelKey, cpMap) {
    const lv = (levels && levels[levelKey]) || {};
    let hierMeta = null;
    for (const p of (lv.params || [])) {
        if (p && typeof p === 'object' && p.key === key) { hierMeta = p; break; }
    }
    const cp = (cpMap && cpMap[key]) || {};
    return makeCell(key, {
        name: cp.name || (hierMeta && (hierMeta.name || hierMeta.label)) || key,
        type: cp.type || (hierMeta && hierMeta.type),
        min:  cp.min  != null ? cp.min  : (hierMeta && hierMeta.min),
        max:  cp.max  != null ? cp.max  : (hierMeta && hierMeta.max),
        step: cp.step != null ? cp.step : (hierMeta && hierMeta.step),
        options: cp.options || (hierMeta && hierMeta.options) || null,
        root: cp.root, filter: cp.filter, start_path: cp.start_path,
    });
}

/* A module's BAKED-IN presets: any hierarchy level declaring both `list_param`
 * (the current index, read/write) and `count_param` (how many). `name_param`
 * names the current one and defaults to "preset_name" — the same default
 * shadow_ui.js uses, so a module that omits it still browses.
 *
 * This is NOT a file list: the module owns the bank, and the ONLY way to read
 * a name is to write the index and read back — i.e. browsing a baked bank
 * changes the sound as you scroll. That's the mechanism, not a shortcoming;
 * the host's own preset level behaves the same way.
 *
 * Most modules declare nothing here (4 of ~30 installed do), which is why the
 * caller must treat null as "this module has no baked presets" rather than as
 * a discovery failure. Scans every level, not just root — the declaration
 * usually sits on root but nothing in the format requires it. */
export function findPresetSpec(levels) {
    if (!levels) return null;
    for (const k of Object.keys(levels)) {
        const lv = levels[k];
        if (lv && lv.list_param && lv.count_param) {
            return {
                listKey:  lv.list_param,
                countKey: lv.count_param,
                nameKey:  lv.name_param || 'preset_name',
            };
        }
    }
    return null;
}
