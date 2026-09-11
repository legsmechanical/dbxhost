/* tests/js/test_instr_lists.mjs — the module-LIST filter on the picker a user
 * actually chooses an instrument in.
 *
 * ⚠⚠ THIS TEST EXISTS BECAUSE THE FEATURE WAS BUILT ON TWO WRONG SCREENS FIRST.
 * #378 went onto the HOST's chain editor (invisible: a dAVEBOx session never
 * opens it), then onto dAVEBOx's FX-block browser (openBrowse) -- which is a
 * real dAVEBOx screen, just not the one you pick a synth in. Josh photographed
 * `T5 > INSTRUMENT` showing None / Move 1 / Move 2 and no filter row, which is
 * openInstrPicker, a different function entirely.
 *
 * So this drives the REAL gesture -- Shift+Note to the sound menu, Shift+click
 * to open the Instrument picker -- and asserts what is ON SCREEN. Source pins
 * and mutation scores cannot answer "is this the screen the user opens"; only
 * opening it can. Everything green on an unreachable surface is exactly how
 * this cost a day.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
let paList = '';
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? paList : '');
/* A MUTABLE engine. The stock rig answers `synth:module` with a fixed name,
 * which would make "the module loaded" true before the pick — the control this
 * test needs most. Here a slot holds what was actually loaded into it. */
const loaded = {};                       /* `${slot}:${comp}` -> module id */
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k !== 'string') return '';
    const m = k.match(/^(.*):module$/);
    return m ? (loaded[slot + ':' + m[1]] || '') : '';
};
globalThis.shadow_set_param = (slot, k, v) => {
    if (typeof k !== 'string') return;
    const m = k.match(/^(.*):module$/);
    if (m) loaded[slot + ':' + m[1]] = String(v);
};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
/* ⭐ A REAL FRAMEBUFFER. This rig used to throw every pixel away, which is how
 * the first cut of the Shift hint -- corner brackets drawn white on a
 * white-filled selected row -- passed its tests, shipped and deployed while
 * drawing nothing at all. A rendering change needs a rig that can see ink.
 * → [[test-the-path-not-the-function]] */
const FB = new Uint8Array(128 * 64);
const _px = (x, y, c) => {
    x |= 0; y |= 0;
    if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0;
};
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = (x, y, str) => {
    /* Enough of a glyph to be COUNTABLE: one lit pixel per character cell. The
     * band assertion is about ink arriving, not about letterforms. */
    for (let i = 0; i < String(str).length; i++) _px((x | 0) + i * 6, (y | 0) + 3, 1);
};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = (x, y, w, h, c) => {
    for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c);
};
globalThis.draw_rect = (x, y, w, h, c) => {
    for (let i = 0; i < (w | 0); i++) { _px((x | 0) + i, y | 0, c); _px((x | 0) + i, (y | 0) + (h | 0) - 1, c); }
    for (let j = 0; j < (h | 0); j++) { _px(x | 0, (y | 0) + j, c); _px((x | 0) + (w | 0) - 1, (y | 0) + j, c); }
};
globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = _px;
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;
/* A synth pick now asks the host to seed that module's declared `default_fx` /
 * `default_buses` (applyModulePick -> host_seed_module_defaults). Recorded
 * rather than ignored: this rig drives the real pick gesture, so it is the
 * cheapest place to prove davebox REACHES the seeding at all — which it did
 * not until 2026-09-08, when default_fx was found never to have fired here. */
globalThis.__seedCalls = [];
globalThis.host_seed_module_defaults = (slot, id) => { globalThis.__seedCalls.push([slot | 0, String(id)]); return [0, 0]; };

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const A = await import('../../ui/ui_automation.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const render = await import('../../ui/ui_render.mjs');
const { MV_FOOTER_H, MV_FOOTER_Y } = await import('../../ui/ui_movy.mjs');

/* Draw one frame and count the ink in the BOX FOOT -- where the hint band
 * lives. The box runs from topY 2 to y 62, so its foot is the last
 * MV_FOOTER_H rows of that. */
/* The stacked box at depth 1: x 10..117 (stackTopX(1)=10, STACK_W=108). These
 * are its INTERIOR columns, clear of the outline on either side. */
const BOX_IN_X0 = 13, BOX_IN_X1 = 114;

function inkInBandForTest() {
    globalThis.clear_screen();
    render.drawUI();
    /* The band sits just inside the box's bottom outline. Taken from the
     * picker's own geometry, never a copied constant. */
    /* ⭑ The band is on MV_FOOTER_Y, the app's standard bottom row — OUTSIDE
     * the box, where every other hint pill in the app lives. */
    let n = 0;
    for (let y = MV_FOOTER_Y; y < 64; y++)
        for (let x = 0; x < 128; x++) if (FB[y * 128 + x]) n++;
    return n;
}

/* Ink in the LAST list row's band and in the band region must not both be the
 * box fill: this proves the two do not meet. */
function inkInRowsForTest() {
    globalThis.clear_screen();
    render.drawUI();
    const g = snd.INSTR_PICKER_GEOM;
    const rowsTop = g.topY + 6 - 1;
    const rowsBottom = rowsTop + g.rows * 10;
    let n = 0;
    for (let y = rowsTop; y < rowsBottom; y++) for (let x = 0; x < 128; x++) if (FB[y * 128 + x]) n++;
    return { n, rowsBottom, bandTop: g.bottomY - 1 - MV_FOOTER_H };
}
const { MoveNoteSession } = await import('../../ui/ui_constants.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
const _te = await import('/data/UserData/schwung/shared/text_entry.mjs');
const textEntryActive = () => _te.isTextEntryActive();

/* Every module write, tagged with the callback it was made from — the ordering
 * is half of what this test is for. */
const writes = [];
let ctxTag = 'init';
globalThis.host_module_set_param = (k, v) => { writes.push([ctxTag, String(k), String(v)]); };
globalThis.host_module_set_params = (blob) => {
    const str = String(blob); let p = 0;
    const nl0 = str.indexOf('\n'); const count = parseInt(str.slice(0, nl0), 10); p = nl0 + 1;
    const rec = () => { const nl = str.indexOf('\n', p); const n = parseInt(str.slice(p, nl), 10);
                        const v = str.slice(nl + 1, nl + 1 + n); p = nl + 1 + n; return v; };
    for (let i = 0; i + 1 < count; i += 2) { const k = rec(), v = rec(); writes.push([ctxTag + ':BULK', k, v]); }
    return true;
};

function ticks(n) {
    for (let i = 0; i < n; i++) {
        S.tickCount++; S.clockMs += 11;
        ctxTag = 'tick#' + S.tickCount; tickmod._tickImpl(); ctxTag = 'between';
    }
}
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
const cc = (d1, d2) => {
    const prev = ctxTag; ctxTag = 'cc(' + d1 + ',' + d2 + ')';
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    ctxTag = prev;
};

/* Two generators, so a filter can hide one and keep the other. */
snd.soundSetGeneratorScanForTest(() => [{ id: 'nusaw', name: 'NuSaw' }, { id: 'obxd', name: 'OB-Xd' }]);

/* A real lists file, in memory: the model writes through host_write_file and
 * reads back through host_read_file, so the round trip is genuine. */
let listsFile = null;
globalThis.host_read_file = (p) => (String(p).indexOf('module_lists.json') >= 0 ? listsFile : '');
globalThis.host_write_file = (p, body) => {
    if (String(p).indexOf('module_lists.json') >= 0) { listsFile = String(body); return true; }
    return true;
};

/* Open the Instrument picker the way a user does. */
function openInstr() {
    cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
    ticks(6);
    const st = snd.soundPickStateForTest();
    if (st.kinds[st.row] !== 'trackto')
        throw new Error('the menu did not land on Instrument: row kind ' + st.kinds[st.row]);
    cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0);
    ticks(4);
    const p = snd.soundEnumPickForTest();
    if (!p) throw new Error('Shift+click did not open the Instrument picker');
    return p;
}
function closeInstr() { cc(9, 127); cc(9, 0); ticks(2); }
/* Between steps: a keyboard left up swallows the jog, so every later step
 * would fail on "the jog never reached" and blame the picker. */
function resetUi() {
    if (_te.isTextEntryActive()) _te.closeTextEntry();
    for (let i = 0; i < 4 && snd.soundEnumPickForTest(); i++) { cc(9, 127); cc(9, 0); ticks(1); }
    ticks(2);
}
function jogTo(want) {
    let guard = 0;
    while (snd.soundEnumPickForTest().sel !== want && guard++ <= 80)
        cc(14, snd.soundEnumPickForTest().sel < want ? 1 : 127);
    if (snd.soundEnumPickForTest().sel !== want) throw new Error('the jog never reached row ' + want);
}

step('setup: a MOVE track, as it is out of the box', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 1; S.trackChannel[0] = 1;
    ticks(8);
});

step('the Instrument picker opens with a List row FIRST', () => {
    const p = openInstr();
    if (p.options[0] !== 'List: All')
        throw new Error('row 0 is ' + JSON.stringify(p.options[0]) + ', want "List: All" — '
                        + JSON.stringify(p.options.slice(0, 5)));
});

step('the cursor does NOT open on the List row', () => {
    const p = snd.soundEnumPickForTest();
    if (p.sel === 0) throw new Error('the cursor rests on the filter row — one click would change the filter instead of choosing');
});

step('both generators are offered under All', () => {
    const o = snd.soundEnumPickForTest().options;
    if (o.indexOf('NuSaw') < 0 || o.indexOf('OB-Xd') < 0)
        throw new Error('a generator is missing: ' + JSON.stringify(o));
});

/* ── the Shift+click door, ANNOUNCED (Josh, 2026-09-10) ──────────────────
 * "shift+click hint on module picker to get to favorites, etc." The mark is a
 * HINT PILL band inside the box foot, on the cursor row only, and only when
 * that row is a module.
 *
 * ⚠⚠ THESE ASSERT THE HINTS THE RENDERER IS HANDED, *AND* THAT PIXELS LAND IN
 * THE BAND. The first cut of this feature asserted a decorated row OBJECT and
 * passed while drawing literally nothing (corner brackets, white on a
 * white-filled selected row) -- it shipped and deployed before the device said
 * otherwise. A test that cannot tell "drawn" from "decided" is not a test of a
 * rendering change. → [[test-the-path-not-the-function]]
 */
step('⭐⭐ the cursor row on a MODULE offers the SHFT hint', () => {
    const o = snd.soundEnumPickForTest().options;
    jogTo(o.indexOf('NuSaw'));
    const h = snd.soundEnumPickHintsForTest();
    if (!h || !h.length) throw new Error('⭑ no hint offered on a generator row');
    const flat = JSON.stringify(h).toUpperCase();
    if (flat.indexOf('SHFT') < 0 || flat.indexOf('LISTS') < 0)
        throw new Error('the hint does not name the gesture or its destination: ' + JSON.stringify(h));
});

step('⚠ CONTROL: rows Shift does NOTHING on offer no hint — the List row', () => {
    jogTo(0);
    const h = snd.soundEnumPickHintsForTest();
    if (h && h.length)
        throw new Error('⭑ the List row promises a shift-click gesture it does not offer: '
                        + JSON.stringify(h));
});

step('⭐⭐ the rows END before the band BEGINS — no overlap (Josh: "overlay overlaps with the pill")', () => {
    const o = snd.soundEnumPickForTest().options;
    jogTo(o.indexOf('NuSaw'));
    const r = inkInRowsForTest();
    if (r.rowsBottom > MV_FOOTER_Y)
        throw new Error('⭑ the last row runs to y=' + r.rowsBottom + ' and the hint band starts at y='
            + MV_FOOTER_Y + ' — they overlap');
});

/* ⚠⚠ THERE IS DELIBERATELY NO "the row count is pinned" CASE HERE, and the
 * absence is the finding. Three observables were tried and every one was
 * incapable of failing:
 *   1. compare `rowsBottom` before/after — computed from the code's own
 *      exported constant, so identical both times;
 *   2. ink in the band region — the box's OUTLINE runs down both edges through
 *      it, ~17px, on a screen drawing nothing else;
 *   3. the lowest lit pixel — the picker floats over a DIMMED BACKDROP that
 *      covers all 64 rows, so the answer is always y=63.
 * Each passed its own mutant. → [[a-check-that-cries-wolf-is-worse-than-none]],
 * [[led-and-render-observables-lie]]
 *
 * `visible` IS pinned in ui_sound (INSTR_ROWS) and the reason is written there;
 * it is insurance against a future bottomY that would let drawKitList derive a
 * 5th row. What GUARDS it is the overlap case above, which fails correctly when
 * the geometry is wrong — that is the shape of the bug Josh actually reported.
 */

step('⭐⭐ the box keeps its BOTTOM BORDER — the band clear must not eat it', () => {
    /* Josh, from the device: "there's no bottom border but plenty of space for
     * one." The band clear ran from MV_FOOTER_Y - 3 = y54 and the box's bottom
     * outline is at y55, so it erased the border one line after drawing it.
     * ⚠ Counted across the box's INTERIOR columns: a horizontal outline is a
     * near-solid run there, and the left/right edges would mask a missing one
     * if the whole width were counted. */
    const o = snd.soundEnumPickForTest().options;
    jogTo(o.indexOf('NuSaw'));                       /* a row that DRAWS the band */
    globalThis.clear_screen();
    render.drawUI();
    const y = snd.INSTR_PICKER_GEOM.bottomY - 1;
    let lit = 0;
    for (let x = BOX_IN_X0; x <= BOX_IN_X1; x++) if (FB[y * 128 + x]) lit++;
    const span = BOX_IN_X1 - BOX_IN_X0 + 1;
    if (lit < span - 2)
        throw new Error('⭑ the box has no bottom border: only ' + lit + '/' + span
            + ' px lit at y=' + y + ' — the hint band\'s clear ate it');
});

step('⭐⭐ …and the band actually DRAWS — pills on a CLEARED strip, not stipple', () => {
    /* ⚠⚠ THE OBSERVABLE IS THE SHAPE OF THE INK, NOT ITS AMOUNT. The picker
     * floats over a stippled backdrop, so the bottom row is ~35% lit before
     * anything of ours draws there. Our band CLEARS the strip and then prints
     * pills, so a module row has LESS ink than a row with no band -- but more
     * than none. Both bounds matter:
     *   · equal to the stipple  -> the band never drew (nothing cleared)
     *   · zero                  -> it cleared and printed nothing
     * Either is the bug this case exists for. */
    const o = snd.soundEnumPickForTest().options;
    jogTo(o.indexOf('NuSaw'));
    const withHint = inkInBandForTest();
    jogTo(0);                                        /* the List row: no band */
    const stipple = inkInBandForTest();
    if (withHint === 0)
        throw new Error('⭑ the strip was cleared and NO PILLS were printed on it');
    if (!(withHint < stipple))
        throw new Error('⭑ THE BAND NEVER DREW: ' + withHint + ' px on a module row vs '
            + stipple + ' of backdrop stipple on the List row — ours would have cleared it first.');
});

step('shift+click a generator opens the Lists menu FOR IT, by name', () => {
    const o = snd.soundEnumPickForTest().options;
    jogTo(o.indexOf('NuSaw'));
    cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0);
    ticks(2);
    const m = snd.soundEnumPickForTest();
    if (!m) throw new Error('shift+click did not open the Lists menu');
    if (!m.options.some(x => typeof x === 'string' && x.indexOf('NuSaw') >= 0))
        throw new Error('the menu does not name the generator that was shift-clicked: '
                        + JSON.stringify(m.options));
});

step('Add files it, and the picker comes back with it MARKED', () => {
    const m = snd.soundEnumPickForTest();
    jogTo(m.options.findIndex(x => typeof x === 'string' && x.indexOf('Add NuSaw') >= 0));
    cc(3, 127); cc(3, 0); ticks(2);
    const st = JSON.parse(listsFile);
    const fav = st.lists.find(l => l.name === 'Favorites');
    if (!fav || fav.modules.indexOf('nusaw') < 0)
        throw new Error('nusaw is not in Favorites: ' + listsFile);
    const o = snd.soundEnumPickForTest().options;
    if (o.indexOf('\u00b7NuSaw') < 0)
        throw new Error('no member mark after filing: '
                        + JSON.stringify(o.filter(x => typeof x === 'string' && x.indexOf('NuSaw') >= 0)));
});

step('clicking the List row opens the LISTS menu — filters and management', () => {
    resetUi();
    openInstr();
    jogTo(0);
    cc(3, 127); cc(3, 0);
    ticks(2);
    const p = snd.soundEnumPickForTest();
    if (!p) throw new Error('the picker closed instead of opening the menu');
    const flat = p.options.map(o => (typeof o === 'string' ? o : '<div>'));
    /* The thing Josh could not find: a visible way to CREATE a list. */
    if (!flat.some(x => x.indexOf('New List') >= 0))
        throw new Error('no way to CREATE a list: ' + JSON.stringify(flat));
    if (!flat.some(x => x.indexOf('All') >= 0) || !flat.some(x => x.indexOf('Favorites') >= 0))
        throw new Error('the lists themselves are not offered: ' + JSON.stringify(flat));
    /* And NO module rows: nothing was shift-clicked, so there is no module in
     * play. Offering "Add <something>" here is what named the wrong generator
     * before, since reaching this row means jogging up THROUGH the others. */
    if (flat.some(x => x.indexOf('Add ') === 0 || x.indexOf('Remove ') === 0))
        throw new Error('the List row menu names a module it cannot know: ' + JSON.stringify(flat));
    if (flat[0] === '<div>')
        throw new Error('a divider leads the menu — a rule under nothing');
});

step('Favorites shows its member COUNT', () => {
    const flat = snd.soundEnumPickForTest().options.map(o => (typeof o === 'string' ? o : '<div>'));
    if (!flat.some(x => /Favorites\s+\(1\)/.test(x)))
        throw new Error('Favorites does not show its count: ' + JSON.stringify(flat));
});

step('choosing Favorites from the menu FILTERS the picker', () => {
    const p = snd.soundEnumPickForTest();
    const want = p.options.findIndex(o => typeof o === 'string' && o.indexOf('Favorites') >= 0);
    jogTo(want);
    cc(3, 127); cc(3, 0);
    ticks(2);
    const q = snd.soundEnumPickForTest();
    if (!q) throw new Error('the picker closed instead of filtering');
    if (q.options[0] !== 'List: Favorites')
        throw new Error('row 0 is ' + JSON.stringify(q.options[0]) + ', want "List: Favorites"');
    if (q.options.some(x => typeof x === 'string' && x.indexOf('OB-Xd') >= 0))
        throw new Error('OB-Xd is not in Favorites but survived the filter');
    if (!q.options.some(x => typeof x === 'string' && x.indexOf('NuSaw') >= 0))
        throw new Error('NuSaw IS in Favorites but was filtered out');
});

step('⭑ under a LIST, only that list shows — no Move, MIDI or None', () => {
    const o = snd.soundEnumPickForTest().options.filter(x => typeof x === 'string');
    for (const gone of ['None', 'Move 1', 'Move 4']) {
        if (o.indexOf(gone) >= 0)
            throw new Error(gone + ' survived the filter — twenty-odd non-module rows are exactly the jog a filter removes: '
                            + JSON.stringify(o));
    }
    if (o.some(x => /MIDI Ch/.test(x)))
        throw new Error('MIDI channels survived the filter: ' + JSON.stringify(o));
    /* Still reachable: All is one click away. */
    if (o[0] !== 'List: Favorites') throw new Error('the List row is gone: ' + JSON.stringify(o));
});

step('⭑ ...and All brings them straight back', () => {
    jogTo(0); cc(3, 127); cc(3, 0); ticks(2);        /* Lists menu */
    const m = snd.soundEnumPickForTest();
    jogTo(m.options.findIndex(x => typeof x === 'string' && x.indexOf('All') >= 0));
    cc(3, 127); cc(3, 0); ticks(2);
    const o = snd.soundEnumPickForTest().options.filter(x => typeof x === 'string');
    for (const back of ['None', 'Move 1']) {
        if (o.indexOf(back) < 0)
            throw new Error(back + ' did not come back under All: ' + JSON.stringify(o.slice(0, 8)));
    }
});

step('⭑ the overlay does NOT nest — stack depth is stable across the menu', () => {
    /* From a FRESH picker. Measuring mid-session is worthless: the depth walk
     * is guard-capped, so by the time earlier steps have been through the menu
     * a broken build has already saturated and reads stable. That is exactly
     * how the first version of this pin passed with the fix reverted. */
    resetUi();
    openInstr();
    const d0 = snd.soundStackDepth();
    for (let i = 0; i < 3; i++) {
        jogTo(0); cc(3, 127); cc(3, 0); ticks(2);    /* into the Lists menu */
        const m = snd.soundEnumPickForTest();
        jogTo(m.options.findIndex(x => typeof x === 'string' && x.indexOf('All') >= 0));
        cc(3, 127); cc(3, 0); ticks(2);              /* back out to the picker */
    }
    const d1 = snd.soundStackDepth();
    if (d1 !== d0)
        throw new Error('the pop-up gained ' + (d1 - d0) + ' layer(s) over three trips — '
                        + 'reopening the picker made it its own parent (depth ' + d0 + ' -> ' + d1 + ')');
});

step('⭑ New List opens the keyboard — the way you CREATE a list', () => {
    jogTo(0);
    cc(3, 127); cc(3, 0); ticks(2);          /* open the Lists menu */
    const m = snd.soundEnumPickForTest();
    const ni = m.options.findIndex(o => typeof o === 'string' && o.indexOf('New List') >= 0);
    if (ni < 0) throw new Error('New List is not on the menu');
    jogTo(ni);
    cc(3, 127); cc(3, 0); ticks(2);
    if (!textEntryActive())
        throw new Error('New List did not open the keyboard — there is still no way to create a list');
});

step('⭑ the membership OVERLAY files one module into SEVERAL lists', () => {
    resetUi();
    /* Two lists to tick, so "several" is a real claim. */
    listsFile = JSON.stringify({ version: 1, lists: [
        { name: 'Favorites', modules: [] }, { name: 'Live', modules: [] } ] });
    snd.soundListsResetForTest();
    let p = openInstr();
    jogTo(p.options.findIndex(o => typeof o === 'string' && o.indexOf('OB-Xd') >= 0));
    /* Shift+click the generator: the menu is then scoped to THAT module, with
     * nothing to infer from where the cursor has been. */
    cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0); ticks(2);
    const m = snd.soundEnumPickForTest();
    const mi = m.options.findIndex(o => typeof o === 'string' && o.indexOf('Lists for') >= 0);
    if (mi < 0) throw new Error('no membership row: ' + JSON.stringify(m.options));
    jogTo(mi);
    cc(3, 127); cc(3, 0); ticks(2);                       /* the overlay */
    let ov = snd.soundEnumPickForTest();
    if (!ov.options.some(o => typeof o === 'string' && o.indexOf('[ ] Favorites') >= 0))
        throw new Error('the overlay is not checkboxes: ' + JSON.stringify(ov.options));
    /* Tick BOTH, without leaving the overlay — the whole point of it. */
    jogTo(0); cc(3, 127); cc(3, 0); ticks(1);
    jogTo(1); cc(3, 127); cc(3, 0); ticks(1);
    const st = JSON.parse(listsFile);
    for (const n of ['Favorites', 'Live']) {
        const l = st.lists.find(x => x.name === n);
        if (!l || l.modules.indexOf('obxd') < 0)
            throw new Error('obxd is not in ' + n + ' — the overlay only filed one: ' + listsFile);
    }
    ov = snd.soundEnumPickForTest();
    if (!ov || ov.options.every(o => typeof o !== 'string' || o.indexOf('[x]') < 0))
        throw new Error('the overlay closed, or shows no tick, after a toggle');
});

step('⭑ Delete ASKS first, and defaults to No', () => {
    resetUi();
    snd.soundListsSetFilterForTest('Live');
    let p = openInstr();
    jogTo(0); cc(3, 127); cc(3, 0); ticks(2);             /* Lists menu */
    const m = snd.soundEnumPickForTest();
    const di = m.options.findIndex(o => typeof o === 'string' && o.indexOf('Delete') >= 0);
    if (di < 0) throw new Error('no Delete row while filtered to Live: ' + JSON.stringify(m.options));
    jogTo(di);
    cc(3, 127); cc(3, 0); ticks(2);
    const c = snd.soundEnumPickForTest();
    if (!c || c.options.indexOf('No') < 0 || c.options.indexOf('Yes') < 0)
        throw new Error('Delete did not ask: ' + JSON.stringify(c && c.options));
    if (c.sel !== c.options.indexOf('No'))
        throw new Error('the confirm defaults to Yes — one stray click destroys a curated list');
    /* Answer No: the list must survive. */
    cc(3, 127); cc(3, 0); ticks(2);
    const st = JSON.parse(listsFile);
    if (!st.lists.some(l => l.name === 'Live'))
        throw new Error('answering No deleted the list anyway');
});

step('⭑ a DUPLICATE name is refused, and the keyboard comes back', () => {
    resetUi();
    let p = openInstr();
    jogTo(0); cc(3, 127); cc(3, 0); ticks(2);
    const m = snd.soundEnumPickForTest();
    jogTo(m.options.findIndex(o => typeof o === 'string' && o.indexOf('New List') >= 0));
    cc(3, 127); cc(3, 0); ticks(2);
    if (!textEntryActive()) throw new Error('New List did not open the keyboard');
    /* Confirm a name that already exists, through the REAL onConfirm and the
     * real unconditional close that follows it. */
    snd.soundListsConfirmNameForTest('Live');
    ticks(4);
    if (!textEntryActive())
        throw new Error('a duplicate name was swallowed silently — the keyboard did not come back');
    const st = JSON.parse(listsFile);
    if (st.lists.filter(l => l.name === 'Live').length !== 1)
        throw new Error('the duplicate was created anyway');
});

closeInstr();
if (failed) process.exit(1);
console.log('PASS: module lists filter the Instrument picker');
}
main();
