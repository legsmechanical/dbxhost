// tools/audit_module_menus.mjs — run every installed module's ui_hierarchy
// through sound mode's REAL menu code and report what the menu cannot render.
//
// Written 2026-07-28 after two device reports (nusaw showed "NO PARAMS"; obxd's
// banks could not be selected) turned out to be two shapes of one problem: the
// menu reads a hierarchy field in a narrower way than modules actually write it.
// Sweeping beats waiting for the next report — it immediately found a third
// (surge's six nav rows pointing at levels it never defines).
//
// Step 1 — pull the hierarchies off the device (each is a string literal in the
// module's dsp.so):
//
//   ssh ableton@move.local "for d in /data/UserData/schwung/modules/sound_generators/*/; do \
//     id=\$(basename \$d); [ -f \$d/dsp.so ] || continue; \
//     h=\$(strings \$d/dsp.so | grep -o '{\"modes\".*\"levels\".*' | head -1); \
//     echo \"\$id|\${h:-NOLITERAL}\"; done" > /tmp/hierarchies.txt
//
// Step 2 — audit:  node tools/audit_module_menus.mjs /tmp/hierarchies.txt
//
// ⚠ Modules that build their hierarchy at runtime (snprintf/macros rather than
// one literal) cannot be audited this way — they report NOLITERAL or fail to
// parse. Roughly a third of the fleet. Auditing those needs a live get_param
// against a loaded slot; this tool deliberately does the cheap half.
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
const { menuRows } = await import(resolve(HERE, '../ui/ui_discover.mjs'));

const input = process.argv[2];
if (!input) { console.error('usage: node tools/audit_module_menus.mjs <hierarchies.txt>'); process.exit(2); }
const lines = readFileSync(input, 'utf8').split('\n').filter(Boolean);

/* The strings dump can carry trailing junk after the JSON — walk braces. */
function sliceJson(raw) {
    let depth = 0;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '{') depth++;
        else if (raw[i] === '}' && --depth === 0) return raw.slice(0, i + 1);
    }
    return raw;
}

const rows = [];
for (const line of lines) {
    const cut = line.indexOf('|');
    const id = line.slice(0, cut), raw = line.slice(cut + 1);
    if (raw === 'NOLITERAL') { rows.push({ id, note: 'built at runtime — not auditable offline' }); continue; }
    let h;
    try { h = JSON.parse(sliceJson(raw)); }
    catch (e) { rows.push({ id, note: 'unparseable (likely also runtime-built)' }); continue; }

    const levels = h.levels || {};
    const rootKey = levels['root'] ? 'root' : (Object.keys(levels)[0] || null);
    if (!rootKey) { rows.push({ id, note: 'no levels' }); continue; }

    const flags = [], dead = [], dyn = [], missing = new Set();
    if (h.modes) flags.push(`MODES(${Array.isArray(h.modes) ? h.modes.length : '?'})`);

    for (const [k, lv] of Object.entries(levels)) {
        if (lv && lv.items_param) { dyn.push(k); continue; }          /* dynamic list */
        if (lv && lv.list_param && lv.count_param) continue;          /* preset browser */
        const r = menuRows(levels, k, {});
        if (!r.length) dead.push(k);
        for (const row of r) if (row.kind === 'level' && !levels[row.level]) missing.add(row.level);
    }
    const rootRows = menuRows(levels, rootKey, {}).length;
    if (!rootRows && !(levels[rootKey] || {}).items_param) flags.push('ROOT-EMPTY');
    if (dead.length) flags.push(`DEAD:${dead.join(',')}`);
    if (missing.size) flags.push(`MISSING-LEVEL:${[...missing].join(',')}`);
    if (dyn.length) flags.push(`dyn:${dyn.join(',')}`);   /* supported — informational */

    rows.push({ id, rootKey, rootRows, levels: Object.keys(levels).length, flags });
}

const problems = rows.filter(r => r.flags && r.flags.some(f => f === f.toUpperCase()));
const skipped = rows.filter(r => r.note);
console.log(`${rows.length} modules: ${rows.length - problems.length - skipped.length} clean, ` +
            `${problems.length} flagged, ${skipped.length} not auditable\n`);
for (const r of rows) {
    if (r.note) { console.log(`${r.id.padEnd(15)} —  ${r.note}`); continue; }
    const f = r.flags.length ? '  ' + r.flags.join('  ') : '';
    console.log(`${r.id.padEnd(15)} root=${String(r.rootKey).padEnd(6)} rows=${String(r.rootRows).padStart(2)} levels=${String(r.levels).padStart(2)}${f}`);
}
