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

import { engineDescribe, engineLoadKitStructure, engineLoadedModule,
         engineHostsOwnUi } from './ui_engine.mjs';

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
    return fitWord(s, lim);
}

/* Shorten to `lim` by dropping vowels from the RIGHT, only as many as needed.
 * Stripping every vowel at once spends less than the budget and costs
 * legibility: "Gain" -> GN when GAN fits, "Peak" -> PK when PEK fits. The
 * leading character is never dropped — it carries most of the recognition. */
function fitWord(s, lim) {
    if (s.length <= lim) return s;
    let out = s;
    while (out.length > lim) {
        let cut = -1;
        for (let i = out.length - 1; i >= 1; i--) {
            if (/[aeiou]/i.test(out[i])) { cut = i; break; }
        }
        if (cut < 0) break;
        out = out.slice(0, cut) + out.slice(cut + 1);
    }
    return out.slice(0, lim);
}

/* ---- module identity + the browser list --------------------------------
 *
 * A chain slot reports a module ID; a BUS reports the DSP PATH it was loaded
 * from. Everything above wants the id — it names the preset folder, the
 * baked-cache key and the picker label — so normalise once, here. */
export function moduleIdOf(raw) {
    if (!raw) return '';
    if (raw.indexOf('/') < 0) return raw;
    const parts = raw.split('/').filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
}

/* The module picker's rows, and where the cursor starts.
 *
 * `[ none ]` sits FIRST (Josh, 2026-07-29). It used to sit last for a real
 * reason: at index 0 with the cursor defaulting there, a single click unloaded
 * the block, and that wiped two slots during phase-1 testing. What makes the
 * top safe is this function's second job — **the cursor never rests on [ none ]
 * by default**. It opens on the loaded module, or on the first real module when
 * the block is empty, so unloading always costs a deliberate move onto the row.
 *
 * ⚠ The identity compare must be NORMALISED on both sides. A bus reports a path
 * while the rows carry ids, so a raw compare never matched on a bus and left
 * the cursor at 0 — invisible while [ none ] was at the bottom, and precisely
 * the slot-wipe above once it moved to the top. */
export function buildBrowseList(found, activeRaw) {
    const list = [{ id: '', name: '[ none ]' }].concat(found || []);
    const active = moduleIdOf(activeRaw);
    let idx = -1;
    if (active) {
        for (let i = 0; i < list.length; i++) {
            const m = list[i];
            if (m.id && moduleIdOf(m.path || m.id) === active) { idx = i; break; }
        }
    }
    if (idx < 0) idx = list.length > 1 ? 1 : 0;
    return { list, idx };
}

/* ---- label disambiguation ----------------------------------------------
 *
 * shortLabel keeps the LAST word, which is the identifying noun — right until
 * two params on the same level share it. Then the word it throws away is
 * exactly the one that told them apart, and you get a page reading
 * GAIN GAIN, or aphex's filter page reading CUT PEAK MG EG CUT PEAK MG EG.
 * Measured across the 72-module device dump: 28% of rendered pages had a
 * duplicate label. (Josh reported it as "gain" in ott-x — In/Out Gain, plus
 * Low/Mid/Hi Gain one level down.)
 *
 * In every real case the distinguishing token is a PREFIX and the shared one
 * trails: HPF/LPF Cut, E1/E2 Atk, A/B Sample, Lvl/Pan Morph, In/Out Gain. So
 * the fix is to spend characters on the prefix, and the only question is where
 * they go. Josh chose (2026-07-29), and each branch is what reads best for the
 * shape of qualifier it handles:
 *
 *   digits             -> TRAIL   E1 Atk / E2 Atk   -> ATK1 ATK2
 *   single character   -> TRAIL   A Sample/B Sample -> SMPA SMPB
 *   multi-character    -> LEAD    HPF Cut / LPF Cut -> HCUT LCUT
 *                                 In Gain / Out Gain-> IGAN OGAN
 *
 * Trailing digits keep the convention shortLabel already had for "Osc 2" ->
 * OSC2. A leading initial keeps the reading order of the full name, which is
 * how the gear itself labels these ("HPF Cut" -> HCUT).
 *
 * Scope is ONE LEVEL, across all its pages — a level should read consistently
 * as you scroll it, and a name only gets uglier when there is a real conflict.
 * Applied to DERIVED cells only: a canvaskit module's labels are hand-authored
 * to fit 4 glyphs and are none of our business. */
function wordsOf(name) {
    return String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/* The tokens that make this name different from the others it collides with.
 * Set intersection rather than a common-suffix walk: "Morph" vs "Pan Morph"
 * share a word without sharing a position, and chordism has exactly that. */
function distinctTokens(words, shared) {
    return words.filter(w => !shared.has(w.toUpperCase()));
}

/* Per member, the tokens no other member of the group has. */
function distinguish(wordLists) {
    const shared = new Set(wordLists[0].map(w => w.toUpperCase()));
    for (const ws of wordLists.slice(1)) {
        const have = new Set(ws.map(w => w.toUpperCase()));
        for (const w of [...shared]) if (!have.has(w)) shared.delete(w);
    }
    return wordLists.map(ws => distinctTokens(ws, shared));
}

/* `qFull` decides the SHAPE (lead vs trail); `take` only decides how many of
 * its characters we spend. Deciding from the truncated form instead turns
 * In/Out Gain — a multi-character qualifier, so leading — into GANI/GANO. */
function qualified(noun, qFull, take, lim, useDigits) {
    const digits = useDigits ? qFull.replace(/[^0-9]/g, '') : '';
    if (digits) {
        /* "Osc1 Freq" / "Env->Pitch1": the digit can sit in the qualifier OR
         * inside the noun itself. Either way it is the whole distinction, so
         * strip it from the noun before appending it — Ptc1/Ptc2, not Ptc11. */
        const bare = String(noun).replace(/[0-9]/g, '') || noun;
        return shortLabel(bare, Math.max(1, lim - digits.length)) + digits;
    }
    if (qFull.length === 1) return shortLabel(noun, Math.max(1, lim - 1)) + qFull;
    const pre = qFull.slice(0, take);
    return pre + shortLabel(noun, Math.max(1, lim - pre.length));
}

export function disambiguateLabels(cells, maxLen) {
    const lim = maxLen || 4;
    const groups = {};
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!c || !c.key || !c.short) continue;
        const k = String(c.short).toUpperCase();
        (groups[k] = groups[k] || []).push(i);
    }
    for (const k of Object.keys(groups)) {
        const idx = groups[k];
        if (idx.length < 2) continue;
        let words = idx.map(i => wordsOf(cells[i].label));
        let dists = distinguish(words);
        /* Names that carry NO distinction at all — eucalypso ships four params
         * all called "On", and chordism's "C" and "C#" both lose the sharp to
         * shortLabel's punctuation strip. The KEY is then the only thing that
         * differs (lane1_enabled..lane4_enabled), so fall back to it and get
         * On1..On4 instead of four identical cells. */
        if (dists.every(d => !d.length)) {
            const kwords = idx.map(i => wordsOf(String(cells[i].key).replace(/_/g, ' ')));
            const kdists = distinguish(kwords);
            if (kdists.some(d => d.length)) dists = kdists;
        }
        /* Digits are only the distinction if they actually DIFFER. osirus has
         * "Asgn1 Amt" and "LFO1 Asgn Amt" in one group: both reduce to digit 1,
         * so the digit shape can never separate them and the letters must. */
        const digitSets = dists.map(d => d.join('').replace(/\D/g, ''));
        const useDigits = new Set(digitSets).size === digitSets.length &&
                          digitSets.every(d => d.length > 0);
        /* Widen the qualifier until the group is distinct, rather than assuming
         * one character is enough: "Min Velocity" and "Max Velocity" both M. */
        for (let take = 1; take <= 3; take++) {
            const out = idx.map((i, n) => {
                const dist = dists[n];
                if (!dist.length) return cells[i].short;     /* nothing to say */
                const noun = words[n][words[n].length - 1] || cells[i].label;
                return qualified(noun, dist.join(''), take, lim, useDigits);
            });
            const uniq = new Set(out.map(s => s.toUpperCase()));
            if (uniq.size === out.length || take === 3) {
                for (let n = 0; n < idx.length; n++) cells[idx[n]].short = out[n];
                break;
            }
        }
    }
    /* Backstop. Rewriting one group can land on another group's label, and some
     * pairs simply have no 4-char distinction left: signal's "Rnd Patch" and
     * "Rnd Pitch" differ only in a vowel, which devowelling deletes. A numeric
     * suffix is not pretty, but two cells you cannot tell apart is worse, and
     * the full name is always one touch away in the header. Rare by design —
     * this fires on 2 of 389 pages across the fleet. */
    const used = {};
    for (const c of cells) {
        if (!c || !c.key || !c.short) continue;
        let s = c.short, u = s.toUpperCase();
        for (let n = 2; used[u]; n++) {
            s = s.slice(0, Math.max(1, lim - String(n).length)) + n;
            u = s.toUpperCase();
        }
        used[u] = 1;
        c.short = s;
    }
    return cells;
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

    /* Free text (clap's plugin_id) — the on-screen keyboard edits it. */
    if (type === 'string') {
        return {
            key, label, short: shortLabel(label), kind: 'text', type: 'text',
            min: 0, max: 0, step: 0, sens: SENS_DELIBERATE, options: null,
        };
    }

    /* A type we have no editor for. Kept as a first-class cell so the menu can
     * SAY so and still show the value, rather than dropping the row and
     * quietly under-reporting what the module exposes. New upstream types land
     * here by default instead of vanishing. */
    if (type === 'canvas' || type === 'module_picker' ||
        type === 'parameter_picker') {
        return {
            key, label, short: shortLabel(label), kind: 'opaque', type,
            min: 0, max: 0, step: 0, sens: SENS_DELIBERATE, options: null,
        };
    }

    const options = meta.options || null;

    /* A declared boolean. Without this it fell through to the numeric branch and
     * drew as a 0..1 arc knob — a continuous dial for something with two states,
     * which also gave it continuous knob sensitivity. Treated as the two-option
     * enum it is: bar widget, deliberate sensitivity so a brush can't flip it. */
    if (type === 'toggle' || type === 'bool') {
        return {
            key, label, short: shortLabel(label), kind: 'tog', type: 'enum',
            min: 0, max: 1, step: 1, sens: SENS_DELIBERATE,
            options: options && options.length === 2 ? options : ['Off', 'On'],
        };
    }

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
            /* Editing this param changes WHICH params the module exposes
             * (e.g. an effect selector whose choice swaps the whole knob set)
             * — the sound menu re-discovers after such a write. Opt-in via
             * chain_params `reload_level`; MODULES.md documents the flag. */
            reload: !!meta.reload_level,
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

/* ---- canvaskit adoption ------------------------------------------------
 *
 * The kit's cell vocabulary and ours are the same language — both descend from
 * movy's widget set — so this is adoption, not translation. What it buys is
 * INTENT over inference: the author's bank order and grouping, labels already
 * chosen to fit 4 glyphs (so no shortLabel guessing), and real section rows.
 *
 * Kit kinds map as: unipolar -> uni, bipolar -> bip, octave -> oct,
 * fader/count/len/dir keep their names, and `enum` splits on option count
 * exactly as makeCell does (<=2 reads as a toggle). Sensitivity is re-derived
 * from OUR constants rather than copied, so knob feel stays uniform across
 * kit-described and derived modules. */
/* Minimum canvaskit version davebox will HOST. v39 is the first that stamps
 * bank_editor.kitVersion at runtime; anything older cannot be identified as
 * kit-generated at all, so it adopts. Raise this if the ctx contract changes —
 * refusing an old canvas beats rendering it wrong. */
const HOST_MIN_KIT_VERSION = 39;

const KIT_KIND = {
    unipolar: 'uni', fader: 'fader', bipolar: 'bip',
    octave: 'oct', count: 'count', len: 'len', dir: 'dir',
};

/* ---- authoritative value metadata for an adopted kit cell ----------------
 *
 * ⚠⚠ A canvaskit cell's `min`/`max`/`step` are NOT engineering units. `uni()`,
 * `bip()` and `fader()` all declare `min: 0, max: KIT_PARAM_MAX (=255)` — the
 * kit's WIRE domain — and fold the real range into a `parse`/`format` codec
 * that the generated `canvas.js` keeps to itself. Adopting those numbers as if
 * they were engineering units is how a -48..48 semitone transpose came out as
 * 0..255: the value shown was wrong, and a knob turn stepped from that wrong
 * base and WROTE it back. Wrong per-param in a way that looks random, because
 * only cells built by plin/plog carry a codec — pint/penum have none and were
 * always correct.
 *
 * So the numbers come from the module's own declaration, which is what every
 * other reader in this file already treats as the authority, and what the kit's
 * own design rule says a config expresses ("SEMANTICS, not appearance").
 * The kit keeps what it is actually good at: grouping, order, labels, and which
 * WIDGET to draw.
 *
 * Three key shapes resolve, in order:
 *   `cutoff`          — published in chain_params, or a plain level param
 *   `pad12_transpose` — a CONCRETE repeated-element key
 *   `pad_transpose`   — the ALIAS: no index, meaning "the focused element"
 * The last two resolve through whichever level declares `child_prefix`. DR32
 * already publishes that, so this needs no new declaration from any module.
 *
 * Modelled on schwung-movy's KnobParam (MIT, DimaDake), which keeps value
 * metadata and `renderStyle` as separate fields for exactly this reason. */
export function authoritativeMeta(key, cpMap, levels) {
    if (!key) return null;
    if (cpMap && cpMap[key]) return cpMap[key];

    const paramsOf = (lvl) => (lvl && Array.isArray(lvl.params)) ? lvl.params : [];
    const findIn = (lvl, k) => paramsOf(lvl).find(
        p => p && typeof p === 'object' && !p.level && p.key === k) || null;

    for (const lvl of Object.values(levels || {})) {
        const direct = findIn(lvl, key);
        if (direct) return direct;
    }
    /* Repeated elements: strip `<prefix>` plus either an index or nothing. */
    for (const lvl of Object.values(levels || {})) {
        const spec = childSpec(lvl);
        if (!spec || key.indexOf(spec.prefix) !== 0) continue;
        let rest = key.slice(spec.prefix.length);
        while (rest.length && rest[0] >= '0' && rest[0] <= '9') rest = rest.slice(1);
        if (rest[0] !== '_') continue;
        const sub = findIn(lvl, rest.slice(1));
        if (sub) return sub;
    }
    return null;
}

/* Port of schwung-movy's inferGuessedMeta (MIT, DimaDake).
 *
 * Only for cells nothing published metadata for — see `metaGuessed`. The first
 * real value read tells us more than the guess did: an integer whose magnitude
 * exceeds the guessed range is plainly an int control, so widen to contain it.
 * Negatives are almost always symmetric bipolar (transpose, detune), so mirror
 * the magnitude and keep 0 centred; positives take the smallest power of two
 * that fits, rather than over-claiming a 0..127 range we cannot confirm. */
export function inferGuessedMeta(cell, raw) {
    if (!cell || !cell.metaGuessed) return false;
    const s = String(raw == null ? '' : raw).trim();
    const v = Number(s);
    if (!s || !isFinite(v)) return false;
    if (!(Number.isInteger(v) && Math.abs(v) > 1)) return false;
    cell.type = 'int';
    cell.min = v < 0 ? v : 0;
    cell.max = v < 0 ? -v : (() => { let p = 1; while (p < v) p *= 2; return p; })();
    cell.step = 1;
    cell.metaGuessed = false;
    return true;
}

function adoptKitCell(kc, meta) {
    if (!kc || !kc.key) return blankCell();
    /* The module declared this param: build the cell the same way every other
     * path does, then put the KIT's presentation back on top. */
    if (meta) {
        const cell = makeCell(kc.key, meta);
        const kitLabel = kc.label ? String(kc.label) : '';
        if (kitLabel) {
            cell.label = kitLabel;
            cell.short = kitLabel.length <= 4 ? kitLabel : shortLabel(kitLabel);
        }
        /* Widget choice is the kit's to make — but only for continuous cells.
         * An enum/file/text cell's kind is decided by its TYPE, and letting a
         * kit override that draws a picker with nothing to pick. */
        const kitKind = KIT_KIND[kc.kind];
        if (kitKind && cell.kind !== 'file' && cell.kind !== 'text' && cell.type !== 'enum') {
            cell.kind = kitKind;
        }
        return cell;
    }
    const label = String(kc.label || kc.key);
    const options = Array.isArray(kc.options) ? kc.options : null;

    let kind = KIT_KIND[kc.kind] || null;
    if (!kind) {
        if (kc.kind === 'enum') {
            kind = (options && options.length <= 2) ? 'tog'
                 : (options && looksFractional(options)) ? 'len'
                 : (options && looksDirectional(options)) ? 'dir'
                 : 'enumc';
        } else {
            /* A kit kind we don't model (mod-slot boxes, HUD cells). Keep the
             * row with its value rather than dropping a param the author
             * deliberately placed. */
            kind = 'uni';
        }
    }
    const isEnum = (kind === 'tog' || kind === 'enumc' || kind === 'len' || kind === 'dir');
    const sens = isEnum
        ? (options && options.length <= 2 ? SENS_DELIBERATE : SENS_PICK)
        : (kind === 'count' || kind === 'oct') ? SENS_PICK : SENS_CONTINUOUS;

    return {
        key: kc.key,
        label,
        /* Kit labels are already <=4 chars by construction — re-shortening
         * them would only mangle deliberate abbreviations. */
        short: label.length <= 4 ? label : shortLabel(label),
        kind,
        type: isEnum ? 'enum' : 'int',
        min: kc.min != null ? Number(kc.min) : 0,
        max: kc.max != null ? Number(kc.max) : 100,
        step: kc.step != null ? Number(kc.step) : 1,
        sens,
        options,
        /* Nothing published this param's range, so the numbers above are the
         * KIT's wire domain and are probably wrong. Say so, rather than
         * presenting a guess as fact — the first real value read corrects it
         * (inferGuessedMeta). Enums are exempt: their options ARE the range. */
        metaGuessed: !isEnum,
    };
}

/* Returns {banks, sections} in OUR shape, or null if the structure is unusable
 * — every caller must be able to fall back to the derived walk. */
export function adoptKitStructure(kit, resolveMeta) {
    if (!kit || !Array.isArray(kit.banks) || !kit.banks.length) return null;
    const banks = [];
    for (const kb of kit.banks) {
        if (!kb) continue;
        const cells = (Array.isArray(kb.knobs) ? kb.knobs : [])
            .map(kc => adoptKitCell(kc, resolveMeta && kc && kc.key ? resolveMeta(kc.key) : null));
        if (!cells.some(c => c && c.key)) continue;     /* an all-blank bank is noise */
        banks.push(padToBank(String(kb.label || kb.name || ''), cells));
    }
    if (!banks.length) return null;

    /* Envelope banks are re-detected from the adopted cells rather than trusted
     * from the kit's `env: true` flag, so the graphic's stage INDICES come from
     * the same code path as every other module. */
    for (const b of banks) b.env = detectEnvelope(b);

    let sections = null;
    if (Array.isArray(kit.sections) && kit.sections.length) {
        sections = kit.sections
            .filter(s => s && typeof s.bank === 'number' && s.bank >= 0 && s.bank < banks.length)
            .map(s => ({ name: String(s.name || banks[s.bank].name), bank: s.bank }));
        if (!sections.length) sections = null;
    }
    return { banks, sections };
}

/* ---- bank assembly ----------------------------------------------------- */

function padToBank(name, cells) {
    const out = cells.slice(0, CELLS_PER_BANK);
    while (out.length < CELLS_PER_BANK) out.push(blankCell());
    return { name, cells: out };
}

function addLevel(banks, label, cells) {
    /* Before the level is chunked into pages of 8 — the chosen scope is the
     * whole level, so a param keeps the same label on page 2 as on page 1. */
    disambiguateLabels(cells);
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

/* `children` in the wild is THREE shapes, and reading only one of them loses a
 * module's entire menu: a single level key as a STRING (nusaw — `"main"`), an
 * ARRAY of keys or `{level}` objects (dexed's operators), or absent — which
 * serialises as null, missing, or the literal string `"None"`.
 *
 * The page walk (childOf) always took the single-value form, so nusaw's canvas
 * pages worked while its MENU came up empty. Both edges must agree. */
export function childLevelKeys(lvl) {
    const c = lvl && lvl.children;
    if (!c || c === 'None') return [];
    const list = Array.isArray(c) ? c : [c];
    const out = [];
    for (const e of list) {
        const k = (typeof e === 'string') ? e : (e && e.level);
        if (k) out.push(k);
    }
    return out;
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

/* ---- repeated elements (child_prefix) ----------------------------------
 *
 * A level declaring `child_prefix` / `child_count` / `child_label` describes
 * ONE element repeated N times — minijv's 8 multitimbral parts. It publishes a
 * single set of params and the real key for element i is
 * `<child_prefix><i>_<key>`. Nothing else in the hierarchy says so, so a
 * reader that ignores these fields addresses `partlevel` — a key the module
 * does not have. Reads come back null and writes land nowhere, with no error:
 * the page renders, the knobs move, and the sound never changes.
 *
 * Two things the key shape does NOT change:
 *
 *   - `chain_params` publishes the BARE key (`partlevel`, not
 *     `sram_part_0_partlevel`), so value metadata is still looked up unprefixed.
 *     Only engine I/O takes the prefix — hence `key` (metadata) and `pkey`
 *     (address) being separate below.
 *   - The prefix does NOT reach a level navigated to FROM here. The host
 *     doesn't carry the child context across a level hop either, and minijv's
 *     own module.json says so explicitly, which is why its per-tone pages are
 *     spelled out as fully-qualified levels instead. Match the host.
 *
 * minijv is the ONLY user in the 72-module device dump — dexed's operators are
 * a `children` ARRAY, not this. That is why the audit sweep now prints a
 * `child:` flag: one module today, and no other way to notice the next one. */
/* Two optional companions describe a level whose selection the MODULE owns
 * rather than the UI:
 *
 *   child_select_param — a param carrying the selected index. Read it and the
 *                        menu's cursor follows whatever moved the module's own
 *                        focus.
 *   child_press_param  — write "1" to vouch that a PHYSICAL pad press just
 *                        happened. It deliberately does not say which pad: the
 *                        note does, and only the module owns the note->element
 *                        map. See soundVouchLivePress in ui_sound.mjs.
 *
 * Why a module can't do this alone: the host forwards raw hardware pad notes
 * (68-99) only to an OPEN canvas overlay (MODULES.md, "Pad presses in a canvas
 * UI"), and that is the sole signal separating a finger from the sequencer —
 * by the time a note reaches a DSP the two are byte-identical. Under a tool
 * module the tool holds the pads and the module's canvas never runs, so the
 * tool has to vouch in its place or the feature silently does nothing. */
export function childSpec(lvl) {
    const prefix = lvl && lvl.child_prefix;
    if (typeof prefix !== 'string' || !prefix) return null;
    const count = parseInt(lvl.child_count, 10);
    if (!(count > 0)) return null;
    const str = (v) => (typeof v === 'string' && v) ? v : '';
    return {
        prefix,
        count,
        label: (typeof lvl.child_label === 'string' && lvl.child_label)
            ? lvl.child_label : 'Item',
        selectParam: str(lvl.child_select_param),
        pressParam: str(lvl.child_press_param),
        /* A host that EMITS the note can name the element outright — no vouch,
         * no correlation window, no race. Sequencers can; a canvas cannot. */
        noteParam: str(lvl.child_press_note_param),
    };
}

/* The press/select declaration anywhere in a hierarchy. A module declares it on
 * the repeated level, but the vouch is a MODULE-WIDE signal — sound mode fires
 * it from a pad press without knowing or caring which screen is open, so it
 * must be findable without a level in hand. First declaration wins; nothing
 * sensible could come of two. */
export function livePressSpec(levels) {
    for (const key of Object.keys(levels || {})) {
        const spec = childSpec(levels[key]);
        if (spec && (spec.pressParam || spec.noteParam)) {
            return { levelKey: key, pressParam: spec.pressParam,
                     noteParam: spec.noteParam,
                     /* Carried for the HOSTED path: when focus moves, every
                      * `<prefix>_*` key a hosted canvas cached now addresses a
                      * different element, and only the prefix can scope that
                      * invalidation. Dropping it here made the first hosted
                      * build wait for the kit's periodic flush instead. */
                     prefix: spec.prefix,
                     selectParam: spec.selectParam, count: spec.count };
        }
    }
    return null;
}

/* The address for `key` on element `childIndex` of `lvl`. Returns `key`
 * unchanged when the level has no children or none is selected, so callers can
 * route every read and write through it unconditionally. */
export function childParamKey(lvl, childIndex, key) {
    const spec = childSpec(lvl);
    if (!spec || !(childIndex >= 0)) return key;
    return spec.prefix + childIndex + '_' + key;
}

/* ---- modes ------------------------------------------------------------
 *
 * A hierarchy can declare `modes` — a list of level keys — plus `mode_param`.
 * There is then NO `root` level: the module's top screen is a choice between
 * whole trees, and choosing one is also an engine setting (minijv's `mode`
 * switches the JV-880 between single-patch and 8-part multitimbral).
 *
 * Missing this costs a whole tree. davebox fell back to "first declared level"
 * and landed on `patch`, so minijv's ENTIRE performance side — the 8 parts, the
 * expansion loader, the octave transpose — had no door in the menu at all. It
 * showed up in the knob pages only because the page walk sweeps orphan levels
 * (rule 6) and swept it up by accident.
 *
 * minijv is the ONLY module in the 72-module device dump that declares modes,
 * so the shape is rare — and rare is exactly why it went unnoticed. The audit
 * sweep did print `MODES(2)` all along; nothing acted on it. It now reports
 * such a module as `root=modes` and counts the mode list as the root screen,
 * so the number it prints is the one you'd actually see. */
export function modeKeys(hierarchy, levels) {
    const m = hierarchy && hierarchy.modes;
    if (!Array.isArray(m)) return null;
    const out = m.filter(k => typeof k === 'string' && levels && levels[k]);
    return out.length ? out : null;
}

/* The mode list as menu rows. `index` is the position in the DECLARED list,
 * because that is what `mode_param` takes — not the row's position after
 * undefined levels are dropped.
 *
 * A mode level is typically a preset browser (`list_param`+`count_param`) with
 * no params of its own and ONE `children` edge — sound mode has its own preset
 * picker and skips browser levels, so entering it would land you on a screen
 * with exactly one row to click through. Resolve past it. The mode INDEX still
 * comes from the declared list, so the engine write is unaffected. */
export function modeRows(modes, levels) {
    const rows = [];
    if (!Array.isArray(modes)) return rows;
    for (let i = 0; i < modes.length; i++) {
        const key = modes[i];
        const lv = (levels && levels[key]) || {};
        const kids = childLevelKeys(lv).filter(k => levels && levels[k]);
        const ownRows = ((lv.params || []).length > 0);
        const passThrough = (!ownRows && kids.length === 1) ? kids[0] : null;
        const target = passThrough || key;
        const tLv = (levels && levels[target]) || {};
        /* The host lists the raw key. A mode level rarely names itself, but the
         * level it stands in front of does ("Patch", "Performance"), and
         * failing that the key capitalised beats printing `perf_main`. */
        const label = lv.name || lv.label || tLv.label || tLv.name ||
                      (key.charAt(0).toUpperCase() + key.slice(1));
        rows.push({ kind: 'mode', level: target, index: i, label: String(label) });
    }
    return rows;
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

    const sigOf = (entries) => entries.map(e => e.pkey || e.key).join(' ');
    const rendered = new Set([sigOf(knobEntries(rootLevel))]);
    const visited = new Set([rootKey]);

    function visit(key, prefix, transparent) {
        if (visited.has(key)) return;
        visited.add(key);
        const lvl = allLevels[key];
        if (!lvl) return;

        const name = nameOf(key, lvl);
        const entries = knobEntries(lvl);
        /* Repeated elements become one page per element. The host shows a
         * selector list instead, but these pages are FLAT — a selector has
         * nowhere to live here, and eight "Part n" pages is the only shape in
         * which minijv's parts are reachable at all. */
        const spec = childSpec(lvl);
        if (spec && entries.length) {
            for (let i = 0; i < spec.count; i++) {
                const kids = entries.map(e => ({
                    key: e.key, meta: e.meta,
                    pkey: childParamKey(lvl, i, e.key),
                }));
                const sig = sigOf(kids);
                if (rendered.has(sig)) continue;
                rendered.add(sig);
                const label = spec.label + ' ' + (i + 1);
                out.push({ name: prefix ? prefix + '/' + label : label, entries: kids });
            }
        } else {
            const sig = sigOf(entries);
            if (entries.length && !rendered.has(sig)) {
                rendered.add(sig);
                out.push({ name: prefix ? prefix + '/' + name : name, entries });
            }
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

    /* `key` is the metadata key (what chain_params publishes); `pkey` is the
     * address to read and write. They differ only inside a repeated element —
     * see childSpec. Everything downstream addresses the engine by `cell.key`,
     * so the resolved address is what the cell carries. */
    function cellFor(key, hierMeta, pkey) {
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
        const cell = makeCell(key, meta);
        if (pkey && pkey !== key) cell.key = pkey;
        return cell;
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
            addLevel(banks, page.name,
                     page.entries.map(e => cellFor(e.key, e.meta, e.pkey)));
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

    /* A canvaskit module publishes the layout its author actually designed —
     * bank order, grouping, fitted labels. Prefer it over our own inference,
     * but only AFTER the walk has run, so a kit that fails to load or exposes
     * nothing usable falls back to a fully-built derived layout rather than an
     * empty editor. Swapped in place so every check below (envelopes, filter
     * curves, the module-wide model enum) runs over the adopted banks. */
    let kitSections = null;
    let hostedOverlay = null;
    const kitModuleId = engineLoadedModule(slot, comp);
    if (kitModuleId) {
        const kit = engineLoadKitStructure(comp, kitModuleId);
        const adopted = adoptKitStructure(kit, (k) => authoritativeMeta(k, cpMap, levels));
        if (adopted) {
            banks.length = 0;
            for (const b of adopted.banks) banks.push(b);
            kitSections = adopted.sections;
            source = 'canvaskit';
        }
        /* Hosting runs the module's OWN bank_editor instead of our adoption of
         * it. Adopt REGARDLESS, and keep both: the adopted banks stay the
         * fallback if the overlay turns out unusable, and the menu/derived
         * paths downstream still want them. */
        /* ⭑⭑ TWO conditions, and they are deliberately different things.
         *
         * `host_canvas_ui` is the MODULE's generic declaration — "any host may
         * run my canvas through the standard ctx". It says nothing about
         * davebox.
         *
         * `kitVersion` is DAVEBOX'S OWN POLICY on top: it hosts kit-generated
         * canvases only, because what it is selling is one consistent UI across
         * modules — a bespoke canvas would render fine and look like a different
         * product. Another host is free to accept the declaration alone.
         *
         * ⚠ This restriction already existed, by ACCIDENT: hosting rode on the
         * `_test.BANKS` harvest, so a non-kit canvas silently got nothing.
         * `_test` is the kit's internal test surface — renaming it at any
         * version would have switched hosting off with no one told. Now the
         * signal is a stamped version (kit >= v39), which also gives us a floor
         * if the ctx contract ever changes: refusing an old canvas beats
         * rendering it wrong. */
        if (kit && kit.overlay && engineHostsOwnUi(comp, kitModuleId)) {
            const kv = parseInt(kit.overlay.kitVersion, 10);
            if (kv >= HOST_MIN_KIT_VERSION) {
                hostedOverlay = kit.overlay;
                source = 'canvaskit-hosted';
            } else {
                /* Say why. A module that declares hosting and silently gets
                 * adoption anyway is the failure this whole arc keeps paying
                 * for. */
                try {
                    console.log('davebox: ' + kitModuleId + ' declares host_canvas_ui but ' +
                        (kv > 0 ? 'canvaskit v' + kv + ' < v' + HOST_MIN_KIT_VERSION
                                : 'is not kit-generated (no kitVersion)') +
                        ' — adopting instead');
                } catch (e) { /* logging is best-effort */ }
            }
        }
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
        /* Author-authored section rows when the kit supplied them; null
         * means the caller should derive its own. */
        kitSections,
        /* The module.s live bank_editor when it DECLARES hosting, else null. */
        hostedOverlay,
        presetSpec: findPresetSpec(levels),
        /* The RAW hierarchy, for the menu. The knob pages above are a lossy
         * projection: buildLevelPages reads `knobs` only and uses `params`
         * purely for navigation edges, so every param a module declares but
         * doesn't map to one of the 8 knobs is invisible in them. The menu
         * walks these levels directly, which is the whole point of having it. */
        levels, rootKey, cpMap,
        /* A modes hierarchy has no `root` at all: its top level is a CHOICE of
         * level, and the mode you pick is also an engine setting. See modeRows. */
        modes: modeKeys(hierarchy, levels),
        modeParam: (hierarchy && typeof hierarchy.mode_param === 'string')
            ? hierarchy.mode_param : '',
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
/* Some dynamic lists CHOOSE (obxd's banks: pick one, hear it, pick another) and
 * some COMMIT (minijv's "Save to Slot": pick one and your patch is written over
 * whatever was there). In the data they are identical — `items_param` +
 * `select_param` — so the difference is only ever stated in the label. Nothing
 * declares intent, and until a host convention exists, the wording is the only
 * signal there is.
 *
 * So: match the wording, and confirm those. A heuristic, deliberately — a module
 * saying "Commit" slips through, which is why the words are listed here in one
 * place to extend rather than scattered at the call site. Getting it wrong the
 * safe way costs one extra click on a list that reads like a save; getting it
 * wrong the other way costs somebody's patch. */
export const COMMIT_WORDS = /save|writ|stor|overwrit|commit|export/i;

export function levelCommits(lv, levelKey) {
    if (!lv) return false;
    return COMMIT_WORDS.test(String(lv.label || '')) ||
           COMMIT_WORDS.test(String(lv.name || '')) ||
           COMMIT_WORDS.test(String(levelKey || '')) ||
           COMMIT_WORDS.test(String(lv.select_param || ''));
}

export function menuRows(levels, levelKey, cpMap, childIndex) {
    const lv = levels && levels[levelKey];
    const rows = [];
    if (!lv) return rows;
    /* A level of repeated elements asks WHICH one first, exactly as the host
     * does — its params are meaningless until an element is chosen, and
     * rendering them unqualified is what addresses keys the module lacks. */
    const spec = childSpec(lv);
    if (spec && !(childIndex >= 0)) {
        for (let i = 0; i < spec.count; i++) {
            rows.push({ kind: 'child', childIndex: i, label: spec.label + ' ' + (i + 1) });
        }
        return rows;
    }
    const addr = (k) => childParamKey(lv, childIndex, k);
    for (const p of (lv.params || [])) {
        if (typeof p === 'string') {
            rows.push({ kind: 'param', key: p, pkey: addr(p),
                        label: labelFor(p, null, cpMap) });
        } else if (p && p.level) {
            const child = levels[p.level];
            /* A nav entry can name a level the module never defines — surge
             * advertises "Mod Slot 1".."6" (`mod_0`..`mod_5`) and ships none of
             * them. Rendering the row anyway hands you six entries that open on
             * "NO PARAMS", which reads as a broken menu rather than an absent
             * feature. Drop them: a row that cannot go anywhere is worse than
             * no row. (Same check the `children` walk below applies.) */
            if (!child) continue;
            if (child.list_param && child.count_param) continue;
            rows.push({ kind: 'level', level: p.level,
                        label: p.label || p.name || child.name || child.label || p.level });
        } else if (p && p.key) {
            rows.push({ kind: 'param', key: p.key, pkey: addr(p.key),
                        label: labelFor(p.key, p, cpMap) });
        }
    }
    /* A level can own sub-levels via `children` as well as `params` nav entries
     * — dexed's operators are reachable only that way, and nusaw's ENTIRE menu
     * is one string child off a root whose `params` is empty. See
     * childLevelKeys for the three shapes this field takes. */
    for (const ck of childLevelKeys(lv)) {
        const child = levels[ck];
        if (!child) continue;
        if (child.list_param && child.count_param) continue;
        rows.push({ kind: 'level', level: ck,
                    label: child.name || child.label || ck });
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
        root: cp.root  != null ? cp.root  : (hierMeta && hierMeta.root),
        filter: cp.filter != null ? cp.filter : (hierMeta && hierMeta.filter),
        start_path: cp.start_path != null ? cp.start_path : (hierMeta && hierMeta.start_path),
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
