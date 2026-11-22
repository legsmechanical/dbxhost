/* tests/js/test_bank_pad_map_table.mjs — the bank pad map's positions are a
 * TABLE, but which banks appear is the WALK's. This pins the two together, so
 * a bank added to a walk with no pad (or two banks on one pad) goes red here
 * instead of silently vanishing from the map. (The Shift + top-row bank jump
 * was retired in 2026-08 partly because its pad maps drifted from the walks.)
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

async function main() {
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const P = await import('../../ui/ui_pure.mjs');
const { SESS_KNOB_MODES } = await import('../../ui/ui_engine.mjs');

function check(label, mode, chord) {
    step(label + ': every bank the track has is on exactly one pad, and nothing else is', () => {
        S.padLayoutChord[2] = chord;
        const walk = P.bankListForMode(mode, 2);   /* the full list: the walk's doors are on the map */
        const map = P.bankPadMapForMode(mode, 2);
        assert(map.length === 4 && map.every((c) => c.cells.length === 4), 'not 4x4');
        const placed = [];
        /* ACTION pads (INST) are not banks — the action table pins them. */
        map.forEach((c) => c.cells.forEach((cell) => { if (cell && !cell.action) placed.push(cell.bank); }));
        assert(new Set(placed).size === placed.length, 'a bank on two pads: ' + placed);
        const a = walk.slice().sort().join(), b = placed.slice().sort().join();
        assert(a === b, 'list ' + a + ' vs map ' + b);
        const cyc = P.bankCycleForMode(mode, 2);
        assert(cyc.every((x) => walk.indexOf(x) >= 0) && walk.every((x) => cyc.indexOf(x) >= 0 || P.bankIsDoor(mode, x)),
               'the walk is not the list minus the doors');
        assert(map[0].cells[3] && map[0].cells[3].bank === C.BANK_CONFIG, 'CONFIG is not bottom-left');
        for (const c of map) for (const cell of c.cells)
            if (cell) assert(P.bankPadMapCellAt(mode, 2, map.indexOf(c), c.cells.indexOf(cell)) === cell.bank, 'cell lookup');
        for (const c of map) for (const cell of c.cells)
            if (cell && cell.action) assert(cell.bank === null &&
                P.bankPadMapActionAt(mode, map.indexOf(c), c.cells.indexOf(cell)) === cell.action, 'action lookup');
    });
}
check('melodic', C.PAD_MODE_MELODIC_SCALE, false);
check('melodic, Chord layout', C.PAD_MODE_MELODIC_SCALE, true);
check('drum', C.PAD_MODE_DRUM, false);
check('Conductor', C.PAD_MODE_CONDUCT, false);

step('melodic and drum put the same job on the same pad', () => {
    S.padLayoutChord[2] = false;
    const m = P.bankPadMapForMode(C.PAD_MODE_MELODIC_SCALE, 2), d = P.bankPadMapForMode(C.PAD_MODE_DRUM, 2);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        const a = m[c].cells[r], b = d[c].cells[r];
        if (a && b) assert(a.bank === b.bank, 'col ' + c + ' row ' + r + ': ' + a.name + ' vs ' + b.name);
    }
});

step('Session: the MIXER column is every mixer mode but the gateway; FX buses beside their levels', () => {
    /* the four levels down the first column; the channel strip's EQ (its first
     * band — the jog walks the rest) and COMPRESS down the second: between
     * them, every mixer mode is reachable from the map */
    const modes = P.SESS_PAD_MAP.mixer.modes;
    assert(modes.join() === '0,1,2,3', 'mixer column ' + modes);
    const sm = P.SESS_PAD_MAP.strip.modes;
    assert(SESS_KNOB_MODES[sm[0]].key === 'eq_low' && SESS_KNOB_MODES[sm[1]].key === 'comp', 'strip column ' + sm);
    const reach = new Set(modes.concat(sm));
    SESS_KNOB_MODES.forEach((m, i) => { if (m.eq) reach.add(i); });
    assert(SESS_KNOB_MODES.every((m, i) => reach.has(i)), 'a mixer mode the map cannot reach');
    const fx = P.SESS_PAD_MAP.fx.buses;
    assert(fx[0] === 'master' && fx[1] === null && fx[2] === 'sendA' && fx[3] === 'sendB', 'fx column ' + fx);
    assert(SESS_KNOB_MODES[modes[2]].key === 'send_a' || /SEND A/.test(SESS_KNOB_MODES[modes[2]].label), 'row 3 is not Send A');
    /* The gap column is Session's CTRL column (2026-11-22): MACROS on top, a
     * bank pad — the columns are all distinct, and no mixer mode is MACROS. */
    const ct = P.SESS_PAD_MAP.ctrl;
    assert(ct && ct.col === 2 && ct.names.join() === 'MACROS', 'ctrl column ' + JSON.stringify(ct));
    assert(new Set([0, P.SESS_PAD_MAP.strip.col, ct.col, P.SESS_PAD_MAP.fx.col]).size === 4, 'two groups share a column');
    assert(!SESS_KNOB_MODES.some((m) => /MACRO/i.test(m.label || '') || m.key === 'macros'), 'MACROS must not be a mixer mode');
    assert(P.bankMapPadForCell(ct.col, 0) === 94, 'MACROS pad note ' + P.bankMapPadForCell(ct.col, 0));
});

step('pad <-> cell: the TOP row is 92, column 4+ is the right half', () => {
    assert(P.bankMapPadForCell(0, 0) === 92 && P.bankMapPadForCell(3, 3) === 71, 'pad numbers');
    const c = P.bankMapCellForPad(99); assert(c.col === 7 && c.row === 0, 'cell of 99');
    for (let n = 68; n <= 99; n++) { const q = P.bankMapCellForPad(n); assert(P.bankMapPadForCell(q.col, q.row) === n, 'round trip ' + n); }
});

if (failed) { console.error('test_bank_pad_map_table: FAIL'); process.exit(1); }
console.log('test_bank_pad_map_table: all passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
