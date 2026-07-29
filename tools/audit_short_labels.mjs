// tools/audit_short_labels.mjs — report params that would render with the SAME
// 4-char label on the same page of sound mode's canvas editor.
//
// Written 2026-07-29 after Josh reported "gain" in ott-x: In Gain and Out Gain
// both rendered GAIN. shortLabel keeps the last word because it is usually the
// identifying noun — but when two params on a level share that noun, the word
// it drops is exactly the one that told them apart. The sweep found the problem
// was fleet-wide, not one module: 109 of 389 rendered pages (28%) had a
// duplicate. ui_discover's disambiguateLabels took that to 0.
//
// Run it after touching shortLabel / fitWord / disambiguateLabels, and when a
// new module lands — a fresh naming style is exactly what would reintroduce it.
//
//   node tools/audit_short_labels.mjs <device-dump.json> [--verbose]
//
// The dump is movy's module dump (ui_hierarchy + chain_params for every
// installed module), e.g. schwung-movy/docs/module-dump/device-dump.json.
// Exit status is 1 if any page has a duplicate, so it can gate a build.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/* Host globals the discovery module expects to exist. */
globalThis.shadow_get_param = () => null;
globalThis.shadow_set_param = () => 0;
globalThis.shadow_get_slots = () => [];
globalThis.shadow_get_ui_slot = () => 0;
globalThis.host_read_file = () => null;
globalThis.os = { readdir: () => [[], 0] };

const HERE = dirname(fileURLToPath(import.meta.url));
const { shortLabel, buildLevelPages, disambiguateLabels } =
    await import(resolve(HERE, '../ui/ui_discover.mjs'));

const input = process.argv[2];
const verbose = process.argv.includes('--verbose');
if (!input) {
    console.error('usage: node tools/audit_short_labels.mjs <device-dump.json> [--verbose]');
    process.exit(2);
}
const dump = JSON.parse(readFileSync(input, 'utf8'));

/* One bank = 8 cells, which is what you see at once. Disambiguation is applied
 * per LEVEL (matching addLevel), then collisions are counted per rendered page. */
const CELLS_PER_BANK = 8;
let pages = 0, bad = 0;
const hits = [];

for (const m of (dump.modules || [])) {
    const h = m.ui_hierarchy;
    if (!h || !h.levels) continue;
    const levels = h.levels;
    const cp = {};
    for (const c of (m.chain_params || [])) if (c && c.key) cp[c.key] = c;

    const rootKey = levels['root'] ? 'root' : Object.keys(levels)[0];
    if (!rootKey) continue;
    const walk = [];
    const rl = levels[rootKey];
    if (rl && Array.isArray(rl.knobs)) {
        walk.push({ name: 'Main', entries: rl.knobs.map(k => ({ key: (typeof k === 'string') ? k : (k && k.key) })) });
    }
    try { for (const p of buildLevelPages(levels, rootKey)) walk.push(p); } catch (e) { /* malformed hierarchy */ }

    for (const p of walk) {
        const cells = (p.entries || []).filter(e => e && e.key).map(e => {
            const name = (cp[e.key] && cp[e.key].name) || e.key;
            return { key: e.key, label: name, short: shortLabel(name) };
        });
        disambiguateLabels(cells);
        for (let off = 0; off < cells.length; off += CELLS_PER_BANK) {
            const chunk = cells.slice(off, off + CELLS_PER_BANK);
            if (chunk.length < 2) continue;
            pages++;
            const seen = {}, dup = new Set();
            for (const c of chunk) {
                const u = String(c.short).toUpperCase();
                if (seen[u]) dup.add(u);
                seen[u] = 1;
            }
            if (dup.size) {
                bad++;
                hits.push({ id: m.id || '?', page: p.name, chunk, dup: [...dup] });
            }
        }
    }
}

const pct = pages ? (100 * bad / pages).toFixed(1) : '0.0';
console.log(`${bad}/${pages} rendered pages have a duplicate label (${pct}%)\n`);
for (const h of hits) {
    console.log(`${h.id.padEnd(15)} ${String(h.page).slice(0, 22).padEnd(22)} ` +
                `[${h.chunk.map(c => c.short).join(' ')}]  dup=${h.dup.join(',')}`);
    if (verbose) for (const c of h.chunk) console.log(`      ${c.short.padEnd(5)} <- ${c.label}  [${c.key}]`);
}
process.exit(bad ? 1 : 0);
