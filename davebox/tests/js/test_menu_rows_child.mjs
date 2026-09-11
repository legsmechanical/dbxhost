/* tests/js/test_menu_rows_child.mjs — the Module Menu lists a module's repeated
 * elements (parts, pads, tones) instead of throwing.
 *
 * From 2026-09-07 (7f663793) to 2026-09-11 menuRows read `lvl` — a name that only
 * exists in OTHER functions of ui_discover — while building the element list, so
 * Presets > Module Menu on any module with repeated elements threw before it
 * opened. Found by tools/check_undeclared.mjs (tests/test_undeclared_names.sh).
 * The bug lived entirely inside menuRows, so the test calls it directly. */
let failed = 0;
const ok = (m) => console.log('  ok   — ' + m);
const bad = (m, e) => { console.error('  FAIL — ' + m + ': ' + (e && e.stack || e)); failed = 1; };
function step(m, fn) { try { fn(); ok(m); } catch (e) { bad(m, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

async function main() {
const { menuRows } = await import('../../ui/ui_discover.mjs');
const levels = {
    root: { name: 'Parts', child_prefix: 'part', child_count: 3, child_label: 'Part',
            child_names: ['Bass', 'Lead', ''], params: ['level', 'pan'] },
};
step('a level of repeated elements lists one row per element, by name or by number', () => {
    const rows = menuRows(levels, 'root', {}, -1);
    assert(rows.length === 3 && rows.every(r => r.kind === 'child'), 'three child rows, got ' + JSON.stringify(rows));
    assert(rows[0].label === 'Bass' && rows[1].label === 'Lead', 'declared names used: ' + rows.map(r => r.label));
    assert(rows[2].label === 'Part 3', 'a blank name falls back to the numbered label: ' + rows[2].label);
});
step('CONTROL: once an element is chosen, its params are listed', () => {
    const rows = menuRows(levels, 'root', {}, 1);
    assert(rows.some(r => r.kind === 'param' && r.key === 'level'), 'params of the chosen element: ' + JSON.stringify(rows));
});
if (failed) process.exit(1);
console.log('test_menu_rows_child: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
