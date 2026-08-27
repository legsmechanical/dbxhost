/* tests/js/test_module_row_qual.mjs — a module row names the MODULE, and the
 * slot comes back ONLY where a name repeats.
 *
 * Josh, 2026-08-27: the picker's rows used to read "<slot>: <module>"
 * ("Synth: Noisemaker"), which is what made the screen read as something other
 * than "pick the module", which is all it does. The rows now carry the module
 * name alone.
 *
 * ⚠⚠ THE FAILURE THIS FILE EXISTS FOR: the slot prefix was accidentally
 * carrying DISAMBIGUATION. `knobTargetList()` probes fx1..fx4 independently and
 * nothing stops the same module being loaded in two of them, so dropping the
 * prefix gives two rows both saying "RRVerb-10" with nothing to tell them
 * apart. The qualifier must come back for exactly those rows and no others —
 * and it is a `qual` (movy small, beside the name) rather than a `value`,
 * because a door already spends its right edge on the chevron.
 *
 * Two observables, deliberately:
 *   - the ROWS, from the real list builder, pin the DECISION (which rows get a
 *     qualifier). A render cannot tell "RRVerb-10 FX1" apart from a module
 *     actually named that.
 *   - a real drawKitList pins that the qualifier is DRAWN and that the label's
 *     truncation accounts for it. The decision being right is worth nothing if
 *     the glyphs never land, or land on top of the value.
 */

import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    /* ⚠⚠ An async fn returns a promise this runner never awaits: the body would
     * not run, nothing would throw, and the step would report ok. */
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* ---- host surface ----
 *
 * The fixture is the collision itself: RRVerb-10 in BOTH fx1 and fx2, with a
 * unique module either side of it so "qualify everything" fails too. */
const PARAMS = {
    'synth:module': 'noisemaker',   'synth:name': 'Noisemaker',
    'fx1:module': 'rrverb10',       'fx1:name': 'RRVerb-10',
    'fx2:module': 'rrverb10',       'fx2:name': 'RRVerb-10',
    'fx3:module': 'ottx',           'fx3:name': 'OTTx',
    'midi_fx1:module': 'notetwist', 'midi_fx1:name': 'NoteTwist',
};
globalThis.shadow_get_param = (slot, key) => PARAMS[key] || '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};

/* Drawing surface. mvPrint emits set_pixel per glyph pixel and never reaches
 * the host `print` stub, so the qualifier is measured as ink in a band — the
 * same method the mixer and HUD tests settled on. */
let px = [], fills = [];
globalThis.set_pixel = (x, y) => { px.push({ x, y }); };
globalThis.fill_rect = (x, y, w, h, v) => { fills.push({ x, y, w, h, v }); };
globalThis.draw_rect = () => {};
globalThis.clear_screen = () => { px = []; fills = []; };
globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};

/* ⚠⚠ THE REAL 5x7 ATLAS. The label is measured with text_width and drawn with
 * print, and the whole point of the availW arithmetic is that the two agree —
 * a fixed-width stub would size for one metric and draw in another, and every
 * assertion below would compare two unrelated numbers.
 * ⚠ Imported, not read at a relative path: esbuild bundles this test to CJS in
 * /tmp, where import.meta.url resolves nowhere. */
import HFONT from '../../tools/host_font_5x7.json';
const CHAR_SPACING = 1, CELL_W = 5;
function inkBounds(rows) {
    let mn = 5, mx = -1;
    for (const b of rows) for (let x = 0; x < 5; x++) if (b & (1 << (4 - x))) { if (x < mn) mn = x; if (x > mx) mx = x; }
    return mx < 0 ? null : { mn, mx };
}
const glyph = (ch) => HFONT[ch] ?? HFONT[ch.toUpperCase?.()] ?? null;
globalThis.print = (x, y, t, col) => {
    let cx = x;
    for (const ch of String(t)) {
        const rows = glyph(ch), b = rows ? inkBounds(rows) : null;
        if (b) for (let r = 0; r < 7; r++) for (let c = b.mn; c <= b.mx; c++)
            if (rows[r] & (1 << (4 - c))) globalThis.set_pixel(cx + (c - b.mn), y + r, col);
        cx += b ? (b.mx - b.mn + 1) + CHAR_SPACING : CELL_W + CHAR_SPACING;
    }
};
/* ⚠ The DEVICE adds charSpacing after EVERY glyph including the last
 * (js_display_text_width, src/host/js_display.c) — no trailing subtraction.
 * tools/render_screens.mjs matches this; test_list_overlay_width.mjs does not
 * and is 1px generous. */
globalThis.text_width = (t) => {
    let w = 0;
    for (const ch of String(t)) {
        const rows = glyph(ch), b = rows ? inkBounds(rows) : null;
        w += (b ? (b.mx - b.mn + 1) : CELL_W) + CHAR_SPACING;
    }
    return w;
};

for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const snd = await import('../../ui/ui_sound.mjs');
const kit = await import('../../ui/ui_movy.mjs');

/* ---- 1. the DECISION: which rows carry a qualifier ---- */

const rows = () => snd.soundKnobTargetsForTest();
const byName = (n) => rows().filter((r) => r.name === n);

step('⭑ a module row is the module NAME — no "<slot>: " prefix', () => {
    const r = rows().find((x) => x.id === 'synth');
    if (!r) throw new Error('no synth row at all — the probe fixture is not reaching the list');
    if (r.name !== 'Noisemaker')
        throw new Error(`synth row is "${r.name}", expected the bare module name "Noisemaker"`);
});

step('⭑⭑ a name in TWO fx slots gets the slot back, on BOTH rows', () => {
    const dup = byName('RRVerb-10');
    if (dup.length !== 2)
        throw new Error(`fixture broken: expected RRVerb-10 in two slots, got ${dup.length}`);
    for (const r of dup)
        if (!r.qual) throw new Error(`a duplicated row has no qual — "${r.name}" in ${r.id} is ` +
                                     'indistinguishable from its twin');
    if (dup[0].qual === dup[1].qual)
        throw new Error(`both duplicates qualify as "${dup[0].qual}" — the qualifier does not ` +
                        'distinguish them, which is the entire job');
});

step('⚠ CONTROL: a UNIQUE name is NOT qualified', () => {
    /* Without this the step above passes on an implementation that qualifies
     * everything — which would just be the old "<slot>: <module>" with extra
     * steps, and is exactly what Josh asked to remove. */
    for (const n of ['Noisemaker', 'OTTx', 'NoteTwist']) {
        const r = byName(n)[0];
        if (!r) throw new Error(`fixture broken: no row named ${n}`);
        if (r.qual) throw new Error(`"${n}" is loaded once but carries qual "${r.qual}"`);
    }
});

step('⭑ (None) is not a module and never qualifies', () => {
    const none = rows().find((r) => !r.id);
    if (!none) throw new Error('the (None) row is gone — clearing an assignment is unreachable');
    if (none.qual) throw new Error('(None) carries a qualifier');
});

step('⭑ the LFO target list follows the same rule', () => {
    /* Same shape, and it has TWO midi_fx slots, so it can collide in two
     * families rather than one. */
    const comps = snd.soundLfoCompsForTest();
    const dup = comps.filter((c) => c.name === 'RRVerb-10');
    if (dup.length !== 2) throw new Error(`expected two RRVerb-10 rows, got ${dup.length}`);
    if (!dup[0].qual || !dup[1].qual || dup[0].qual === dup[1].qual)
        throw new Error('the LFO list does not distinguish its duplicates');
    const uniq = comps.find((c) => c.name === 'Noisemaker');
    if (uniq && uniq.qual) throw new Error('a unique LFO target was qualified');
});

/* ---- 2. the DRAW: the qualifier lands, and the label makes room ---- */

const ROW_H = 10, TOP_Y = 11;
/* One row's band, x-restricted so the value/chevron column cannot leak in. */
const inkIn = (row, x0, x1) => {
    const y0 = TOP_Y + row * ROW_H, y1 = y0 + ROW_H - 1;
    const hit = px.filter((p) => p.y >= y0 && p.y <= y1 && p.x >= x0 && p.x <= x1);
    if (!hit.length) return null;
    return { lo: Math.min(...hit.map((p) => p.x)), hi: Math.max(...hit.map((p) => p.x)) };
};

step('⭑⭑ a qual draws AFTER the label, not in the value column', () => {
    clear_screen();
    kit.drawKitList([{ label: 'RRVerb-10', qual: 'FX1', chevron: true }], 0, {});
    const labelW = globalThis.text_width('RRVerb-10');
    /* The label starts at x=3; anything past it in that band is the qualifier. */
    const after = inkIn(0, 3 + labelW + 1, 3 + labelW + 40);
    if (!after) throw new Error('nothing drawn after the label — the qual never reached the screen');
});

step('⚠ CONTROL: with no qual, that same band is EMPTY', () => {
    /* Proves the band above is reading the QUALIFIER and not, say, the row's
     * selection fill or the chevron bleeding left. A probe that cannot show a
     * negative cannot be trusted on the positive. */
    clear_screen();
    kit.drawKitList([{ label: 'RRVerb-10', chevron: true }], 0, {});
    const labelW = globalThis.text_width('RRVerb-10');
    const after = inkIn(0, 3 + labelW + 1, 3 + labelW + 40);
    if (after) throw new Error(`ink at x=${after.lo}..${after.hi} with no qual set — the band is ` +
                               'measuring something else');
});

step('⭑⭑ the LABEL truncates to make room for the qual', () => {
    /* The whole reason `qual` is subtracted from availW: without it a long name
     * runs under its own qualifier and both become unreadable. Observable is
     * the label's ink END, which must move LEFT when a qual is added. */
    const LONG = 'Echidna FX Suite';
    clear_screen();
    kit.drawKitList([{ label: LONG, value: 'SOMETHING LONGISH' }], -1, {});
    const bare = inkIn(0, 3, 127);
    clear_screen();
    kit.drawKitList([{ label: LONG, qual: 'FX4', value: 'SOMETHING LONGISH' }], -1, {});
    const withQual = inkIn(0, 3, 127);
    if (!bare || !withQual) throw new Error('a row drew no ink at all');
    if (!(withQual.hi <= bare.hi))
        throw new Error(`adding a qual did not shorten the row's ink (${bare.hi} -> ${withQual.hi})` +
                        ' — availW is not accounting for it, so the two will overlap');
});

step('⭑⭑ the target renderers PASS the chevron and the qual', () => {
    /* ⚠⚠ THE CALL SITE, not the mechanism. Everything above pins that
     * drawKitList can draw a chevron and a qual — and all of it stayed green
     * against a mutation that made renderKnobTarget pass `chevron: false`,
     * because no assertion here ever reaches the renderer. A door with no
     * chevron is a silent loss: the row still works, it just stops saying it
     * opens anything. [[pin-the-call-site-not-just-the-chain]]
     *
     * Source-pinned because driving these renderers needs a live slot with
     * loaded components and a view walked to the picker, and what is under test
     * is two arguments at two call sites.
     * ⚠ Bounded by the call's own closing paren — never a character count. */
    const src = readFileSync('ui/ui_sound.mjs', 'utf8');
    for (const [fn, marker] of [['renderKnobTarget', 'S.knobTargets.map'],
                                ['renderLfoTarget', 'S.lfoComps.map']]) {
        const at = src.indexOf('function ' + fn);
        if (at < 0) throw new Error(`${fn} is gone — re-anchor this pin`);
        const call = src.indexOf(marker, at);
        if (call < 0) throw new Error(`${fn} no longer maps its rows through ${marker}`);
        const end = src.indexOf('}))', call);
        if (end < 0) throw new Error(`cannot find the end of ${fn}'s row map`);
        const body = src.slice(call, end);
        if (!/chevron:/.test(body))
            throw new Error(`${fn} no longer sets a chevron — its doors stop saying they open`);
        if (/chevron:\s*false/.test(body))
            throw new Error(`${fn} hard-codes chevron: false`);
        if (!/qual:/.test(body))
            throw new Error(`${fn} no longer forwards qual — duplicates become indistinguishable ` +
                            'on screen even though the list computed the qualifier');
    }
});

step('⚠ the source still subtracts the qual from availW', () => {
    /* Source-pinned because the overlap it prevents is a PIXEL relationship
     * that only shows on a label long enough to collide — a fixture that drifts
     * shorter would make the step above vacuous while staying green.
     * ⚠ Bound to the assignment, not to a character count. */
    const src = readFileSync('ui/ui_movy.mjs', 'utf8');
    /* ⚠⚠ Re-anchored 2026-08-27, TWICE. The label inset became `labelX` when the
     * list gained box bounds, so the original literal broke; anchoring on
     * `const availW = ` alone then found the WRONG ONE — drawKitListOverlay has
     * an availW of its own and is defined FIRST in the file, so the pin read a
     * different function's arithmetic and failed correct code. Scope to
     * drawKitList before searching. [[source-pins-window-must-be-structural]] */
    const fn = src.indexOf('export function drawKitList(');
    if (fn < 0) throw new Error('drawKitList moved — re-anchor this pin');
    const i = src.indexOf('const availW = ', fn);
    if (i < 0) throw new Error('the availW assignment moved — re-anchor this pin');
    const line = src.slice(i, src.indexOf('\n', i));
    if (!/-\s*qw/.test(line))
        throw new Error(`availW no longer subtracts the qual width: "${line.trim()}"`);
});

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed);
}

main();
