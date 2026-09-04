/* ui_fonts_pp.mjs — the param-pages faces, ported into davebox's UI layer.
 *
 * Three glyph tables and their blitters, TRANSCRIBED from schwung's
 * src/shared/param_pages/{font4x5,font_big_num,font_tamzen6x12}.mjs. Those are
 * in turn from schwung-movy (MIT, (c) 2026 megadake —
 * https://github.com/DimaDake/schwung-movy) except font4x5, which is schwung's
 * own SCH-50 `metric-matched` redraw.
 *
 * ⚠ PROVENANCE, STATED RATHER THAN ASSUMED (carried from the source): movy
 * generated the BIG-NUMBER table by rasterising an OTF it does not vendor, so
 * the underlying typeface is identified only as "Nokia". The bitmap table is
 * MIT via movy; the face it came from is not verified here. Josh accepted this
 * exposure explicitly on 2026-08-29 — recorded because a derived asset should
 * say what it is, and because an earlier pass of this campaign declined the
 * face on exactly this ground.
 *
 * ⭑ WHY A SEPARATE FILE RATHER THAN MORE OF ui_movy.mjs. ui_movy already
 * carries five faces inline and is the natural home, but these three add ~600
 * lines of pure data to a file that is read for its DRAWING. The constraint
 * that matters is unchanged and is preserved here: no device-absolute imports,
 * no state, no host globals at module scope — so ui_movy stays loadable
 * standalone in node for the previewer and both offline renderers, which is the
 * whole reason UI_LANGUAGE Rule 0 said "no imports" in the first place. See §0.
 *
 * ⚠ ADAPTED FROM THE INJECTED-CTX CONTRACT. Upstream's blitters take a `ctx`
 * and call ctx.fillRect; davebox draws through the bare host globals. The glyph
 * format is untouched: [advance, yOff, w, h, ...rowBits] with bit0 = leftmost
 * pixel, so a table can still be diffed against its source line for line.
 *
 * ⚠ EVERY ADVANCE CARRIES ITS 1px INTER-GLYPH GAP, so a measured string is one
 * pixel narrower than the sum of its advances. Do not "fix" the -1 in the
 * width functions; it is why the last glyph does not trail a blank column.
 */

const CHARS4 = " !\"'()+,-./:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ%<>=?*#&_\\^[]";

/* Row bit values, 4-wide: col0=1 col1=2 col2=4 col3=8
 *   ....=0  #...=1  .#..=2  ##..=3  ..#.=4  #.#.=5  .##.=6  ###.=7
 *   ...#=8  #..#=9  .#.#=10 ##.#=11 ..##=12 #.##=13 .###=14 ####=15
 * 5-wide adds col4=16. */
const G4 = [
    [3, 0, 0, 5],                       /* ' ' — advance only */
    [2, 0, 1, 5, 1, 1, 1, 0, 1],        /* ! */
    [4, 0, 3, 5, 5, 5, 0, 0, 0],        /* " */
    [2, 0, 1, 5, 1, 1, 0, 0, 0],        /* ' */
    [3, 0, 2, 5, 2, 1, 1, 1, 2],        /* ( */
    [3, 0, 2, 5, 1, 2, 2, 2, 1],        /* ) */
    [4, 0, 3, 5, 0, 2, 7, 2, 0],        /* + */
    [3, 0, 2, 5, 0, 0, 0, 2, 1],        /* , */
    [4, 0, 3, 5, 0, 0, 7, 0, 0],        /* - */
    [2, 0, 1, 5, 0, 0, 0, 0, 1],        /* . */
    [5, 0, 4, 5, 8, 8, 6, 1, 1],        /* / */
    [2, 0, 1, 5, 0, 1, 0, 1, 0],        /* : */

    [5, 0, 4, 5, 6, 9, 9, 9, 6],        /* 0 */
    [4, 0, 3, 5, 2, 3, 2, 2, 7],        /* 1 */
    [5, 0, 4, 5, 7, 8, 6, 1, 15],       /* 2 */
    [5, 0, 4, 5, 7, 8, 6, 8, 7],        /* 3 */
    [5, 0, 4, 5, 9, 9, 15, 8, 8],       /* 4 */
    [5, 0, 4, 5, 15, 1, 7, 8, 7],       /* 5 */
    [5, 0, 4, 5, 14, 1, 7, 9, 6],       /* 6 */
    [5, 0, 4, 5, 15, 8, 4, 2, 1],       /* 7 */
    [5, 0, 4, 5, 6, 9, 6, 9, 6],        /* 8 */
    [5, 0, 4, 5, 6, 9, 14, 8, 7],       /* 9 */

    [5, 0, 4, 5, 6, 9, 15, 9, 9],       /* A  (Elektron) */
    [5, 0, 4, 5, 7, 9, 7, 9, 7],        /* B */
    [5, 0, 4, 5, 14, 1, 1, 1, 14],      /* C */
    [5, 0, 4, 5, 7, 9, 9, 9, 7],        /* D  (Elektron) */
    [5, 0, 4, 5, 15, 1, 7, 1, 15],      /* E  (Elektron) */
    [5, 0, 4, 5, 15, 1, 7, 1, 1],       /* F */
    [5, 0, 4, 5, 14, 1, 13, 9, 14],     /* G4 */
    [5, 0, 4, 5, 9, 9, 15, 9, 9],       /* H */
    [2, 0, 1, 5, 1, 1, 1, 1, 1],        /* I  (Elektron) */
    [5, 0, 4, 5, 12, 8, 8, 9, 6],       /* J */
    [5, 0, 4, 5, 9, 5, 3, 5, 9],        /* K */
    [5, 0, 4, 5, 1, 1, 1, 1, 15],       /* L  (Elektron) */
    [6, 0, 5, 5, 17, 27, 21, 17, 17],   /* M  (Elektron) */
    [5, 0, 4, 5, 9, 11, 13, 9, 9],      /* N */
    [5, 0, 4, 5, 6, 9, 9, 9, 6],        /* O */
    [5, 0, 4, 5, 7, 9, 7, 1, 1],        /* P  (Elektron) */
    [5, 0, 4, 5, 6, 9, 9, 5, 10],       /* Q */
    [5, 0, 4, 5, 7, 9, 7, 5, 9],        /* R */
    [5, 0, 4, 5, 14, 1, 6, 8, 7],       /* S */
    [4, 0, 3, 5, 7, 2, 2, 2, 2],        /* T  (Elektron) */
    [5, 0, 4, 5, 9, 9, 9, 9, 6],        /* U  (Elektron) */
    [6, 0, 5, 5, 17, 17, 17, 10, 4],    /* V */
    [6, 0, 5, 5, 17, 17, 21, 21, 10],   /* W */
    [5, 0, 4, 5, 9, 9, 6, 9, 9],        /* X */
    [4, 0, 3, 5, 5, 5, 2, 2, 2],        /* Y */
    [5, 0, 4, 5, 15, 8, 6, 1, 15],      /* Z */

    [5, 0, 4, 5, 9, 8, 6, 1, 9],        /* % */
    [4, 0, 3, 5, 4, 2, 1, 2, 4],        /* < */
    [4, 0, 3, 5, 1, 2, 4, 2, 1],        /* > */
    [4, 0, 3, 5, 0, 7, 0, 7, 0],        /* = */
    [5, 0, 4, 5, 7, 8, 6, 0, 2],        /* ? */
    [4, 0, 3, 5, 5, 2, 5, 0, 0],        /* * */
    [5, 0, 4, 5, 10, 15, 10, 15, 10],   /* # */
    [5, 0, 4, 5, 6, 9, 6, 5, 10],       /* & */
    [5, 0, 4, 5, 0, 0, 0, 0, 15],       /* _ */
    [5, 0, 4, 5, 1, 1, 6, 8, 8],        /* \ */
    [4, 0, 3, 5, 2, 5, 0, 0, 0],        /* ^ */
    /* Square brackets — davebox's own addition (2026-09-05): the bank header
     * carries the instrument abbreviation as "T3[OB]". Upstream font4x5 has
     * only parentheses; these are the same 2px-wide idiom, squared off. */
    [3, 0, 2, 5, 3, 1, 1, 1, 3],        /* [ */
    [3, 0, 2, 5, 3, 2, 2, 2, 3],        /* ] */
];

const FALLBACK_ADV4 = 5;

function glyph4(ch) {
    const i = CHARS4.indexOf(ch);
    return i >= 0 ? G4[i] : null;
}


export const FONT4_HEIGHT = 5;

export function fontWidth4x5(str) {
    let w = 0;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
        const g = glyph4(s[i]);
        w += g ? g[0] : FALLBACK_ADV4;
    }
    return w > 0 ? w - 1 : 0;
}

export function fontPrint4x5(x, y, str, color) {
    let cx = x;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
        const g = glyph4(s[i]);
        if (!g) { cx += FALLBACK_ADV4; continue; }
        const yOff = g[1], w = g[2], h = g[3];
        for (let row = 0; row < h; row++) {
            const bits = g[4 + row];
            if (!bits) continue;
            let col = 0;
            while (col < w) {
                if (bits & (1 << col)) {
                    const start = col;
                    while (col < w && (bits & (1 << col))) col++;
                    fill_rect(cx + start, y + yOff + row, col - start, 1, color);
                } else col++;
            }
        }
        cx += g[0];
    }
}

/* Trim until it fits, MEASURED. Never assume N glyphs are N*advance wide: this
 * face is proportional (I is 1px, W is 5). */
export function fit4x5(text, maxWidth) {
    let t = String(text == null ? '' : text);
    while (t.length > 1 && fontWidth4x5(t) > maxWidth) t = t.slice(0, -1);
    return fontWidth4x5(t) > maxWidth ? '' : t;
}

const CHARSBN = '0123456789+-';
const GBN = [
    [10, 0, 9, 11, 62, 127, 99, 99, 99, 99, 99, 99, 99, 127, 62],  /* 0 */
    [9, 0, 8, 11, 48, 56, 60, 60, 48, 48, 48, 48, 48, 48, 48],  /* 1 */
    [10, 0, 9, 11, 62, 127, 99, 96, 112, 56, 28, 14, 7, 127, 127],  /* 2 */
    [10, 0, 9, 11, 62, 127, 99, 96, 60, 124, 96, 96, 99, 127, 62],  /* 3 */
    [10, 0, 9, 11, 48, 56, 60, 54, 55, 51, 127, 127, 48, 48, 48],  /* 4 */
    [10, 0, 9, 11, 63, 63, 3, 3, 63, 127, 96, 96, 99, 127, 62],  /* 5 */
    [10, 0, 9, 11, 62, 127, 3, 63, 127, 99, 99, 99, 99, 127, 62],  /* 6 */
    [10, 0, 9, 11, 127, 127, 48, 48, 24, 24, 12, 12, 12, 12, 12],  /* 7 */
    [10, 0, 9, 11, 62, 127, 99, 99, 62, 127, 99, 99, 99, 127, 62],  /* 8 */
    [10, 0, 9, 11, 62, 127, 99, 99, 99, 127, 126, 96, 99, 127, 62],  /* 9 */
    [9, 3, 8, 6, 12, 12, 63, 63, 12, 12],  /* + */
    [8, 5, 7, 2, 31, 31],  /* - */
];


function glyphBN(ch) { const i = CHARSBN.indexOf(ch); return i >= 0 ? GBN[i] : null; }

export const BIGNUM_H = 11;

export function fontWidthBigNum(str) {
    let w = 0; const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) { const g = glyphBN(s[i]); w += g ? g[0] : 0; }
    return w > 0 ? w - 1 : 0;
}

export function fontPrintBigNum(x, y, str, color) {
    let cx = x; const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
        const g = glyphBN(s[i]);
        if (!g) continue;
        const yOff = g[1], w = g[2], h = g[3];
        for (let row = 0; row < h; row++) {
            const bits = g[4 + row];
            if (!bits) continue;
            let col = 0;
            while (col < w) {
                if (bits & (1 << col)) {
                    const start = col;
                    while (col < w && (bits & (1 << col))) col++;
                    fill_rect(cx + start, y + yOff + row, col - start, 1, color);
                } else col++;
            }
        }
        cx += g[0];
    }
}

/* ⚠⚠ TWELVE GLYPHS ONLY — the digits, `+` and `-`, which is everything
 * upstream's big-number cell can emit. davebox's `valsq` is wider than that: it
 * draws note names ("E 3"), percentages, "--" and arbitrary enum text. So a
 * caller MUST ask this before choosing the face, and fall back to davebox's own
 * big font for anything else. Drawing a missing glyph as nothing would silently
 * turn "C1 36" into "1 36". */
export function bigNumCanDraw(str) {
    const s = String(str == null ? '' : str);
    if (!s.length) return false;
    for (const ch of s) if (glyphBN(ch) === null) return false;
    return true;
}

const CHARSTZ = ' !\"\'()+,-./:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ%<>=?*#&_\\^';
const GTZ = [
    [6, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0],  /*   */
    [6, 0, 3, 7, 4, 4, 4, 4, 4, 0, 4],  /* ! */
    [6, 0, 4, 7, 10, 10, 10, 0, 0, 0, 0],  /* " */
    [6, 0, 3, 7, 4, 4, 4, 0, 0, 0, 0],  /* ' */
    [6, 0, 4, 7, 12, 2, 2, 2, 2, 2, 12],  /* ( */
    [6, 0, 4, 7, 6, 8, 8, 8, 8, 8, 6],  /* ) */
    [6, 0, 5, 7, 0, 4, 4, 31, 4, 4, 0],  /* + */
    [6, 0, 3, 7, 0, 0, 0, 6, 6, 4, 2],  /* , */
    [6, 0, 5, 7, 0, 0, 0, 31, 0, 0, 0],  /* - */
    [6, 0, 3, 7, 0, 0, 0, 0, 0, 6, 6],  /* . */
    [6, 0, 5, 7, 16, 16, 8, 4, 2, 1, 1],  /* / */
    [6, 0, 3, 7, 0, 6, 6, 0, 0, 6, 6],  /* : */
    [6, 0, 5, 7, 14, 17, 25, 21, 19, 17, 14],  /* 0 */
    [6, 0, 5, 7, 4, 6, 5, 4, 4, 4, 31],  /* 1 */
    [6, 0, 5, 7, 14, 17, 16, 8, 4, 2, 31],  /* 2 */
    [6, 0, 5, 7, 31, 16, 8, 12, 16, 17, 14],  /* 3 */
    [6, 0, 5, 7, 8, 12, 10, 9, 31, 8, 8],  /* 4 */
    [6, 0, 5, 7, 31, 1, 15, 16, 16, 17, 14],  /* 5 */
    [6, 0, 5, 7, 12, 2, 1, 15, 17, 17, 14],  /* 6 */
    [6, 0, 5, 7, 31, 16, 8, 8, 4, 4, 4],  /* 7 */
    [6, 0, 5, 7, 14, 17, 17, 14, 17, 17, 14],  /* 8 */
    [6, 0, 5, 7, 14, 17, 17, 30, 16, 8, 6],  /* 9 */
    [6, 0, 5, 7, 4, 10, 17, 17, 31, 17, 17],  /* A */
    [6, 0, 5, 7, 15, 17, 17, 15, 17, 17, 15],  /* B */
    [6, 0, 5, 7, 28, 2, 1, 1, 1, 2, 28],  /* C */
    [6, 0, 5, 7, 15, 17, 17, 17, 17, 9, 7],  /* D */
    [6, 0, 5, 7, 31, 1, 1, 15, 1, 1, 31],  /* E */
    [6, 0, 5, 7, 31, 1, 1, 15, 1, 1, 1],  /* F */
    [6, 0, 5, 7, 28, 2, 1, 25, 17, 18, 28],  /* G */
    [6, 0, 5, 7, 17, 17, 17, 31, 17, 17, 17],  /* H */
    [6, 0, 4, 7, 14, 4, 4, 4, 4, 4, 14],  /* I */
    [6, 0, 5, 7, 16, 16, 16, 16, 17, 17, 14],  /* J */
    [6, 0, 5, 7, 17, 9, 5, 3, 5, 9, 17],  /* K */
    [6, 0, 5, 7, 1, 1, 1, 1, 1, 1, 31],  /* L */
    [6, 0, 5, 7, 17, 27, 21, 21, 17, 17, 17],  /* M */
    [6, 0, 5, 7, 17, 19, 21, 25, 17, 17, 17],  /* N */
    [6, 0, 5, 7, 14, 17, 17, 17, 17, 17, 14],  /* O */
    [6, 0, 5, 7, 15, 17, 17, 15, 1, 1, 1],  /* P */
    [6, 0, 5, 7, 14, 17, 17, 17, 21, 25, 14],  /* Q */
    [6, 0, 5, 7, 15, 17, 17, 15, 5, 9, 17],  /* R */
    [6, 0, 5, 7, 30, 1, 1, 14, 16, 16, 15],  /* S */
    [6, 0, 5, 7, 31, 4, 4, 4, 4, 4, 4],  /* T */
    [6, 0, 5, 7, 17, 17, 17, 17, 17, 17, 14],  /* U */
    [6, 0, 5, 7, 17, 17, 17, 10, 10, 4, 4],  /* V */
    [6, 0, 5, 7, 17, 17, 17, 21, 21, 21, 27],  /* W */
    [6, 0, 5, 7, 17, 17, 10, 4, 10, 17, 17],  /* X */
    [6, 0, 5, 7, 17, 17, 10, 4, 4, 4, 4],  /* Y */
    [6, 0, 5, 7, 31, 8, 4, 4, 2, 2, 31],  /* Z */
    [6, 0, 5, 7, 19, 11, 8, 4, 2, 26, 25],  /* % */
    [6, 0, 5, 7, 16, 8, 4, 2, 4, 8, 16],  /* < */
    [6, 0, 4, 7, 1, 2, 4, 8, 4, 2, 1],  /* > */
    [6, 0, 5, 7, 0, 0, 31, 0, 31, 0, 0],  /* = */
    [6, 0, 5, 7, 14, 17, 16, 8, 4, 0, 4],  /* ? */
    [6, 0, 5, 7, 0, 4, 21, 14, 21, 4, 0],  /* * */
    [6, 0, 5, 7, 10, 10, 31, 10, 31, 10, 10],  /* # */
    [6, 0, 5, 7, 6, 9, 5, 2, 21, 9, 22],  /* & */
    [6, 0, 6, 7, 0, 0, 0, 0, 0, 0, 63],  /* _ */
    [6, 0, 5, 7, 1, 1, 2, 4, 8, 16, 16],  /* \\ */
    [6, 0, 5, 7, 4, 10, 17, 0, 0, 0, 0],  /* ^ */
];
const FALLBACK_ADV = 6;

function glyphTZ(ch) { const i = CHARSTZ.indexOf(ch); return i >= 0 ? GTZ[i] : null; }


export const TAMZEN_H = 7;

export function fontWidthTamzen(str) {
    let w = 0; const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) { const g = glyphTZ(s[i]); w += g ? g[0] : 0; }
    return w > 0 ? w - 1 : 0;
}

export function fontPrintTamzen(x, y, str, color) {
    let cx = x; const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
        const g = glyphTZ(s[i]);
        if (!g) continue;
        const yOff = g[1], w = g[2], h = g[3];
        for (let row = 0; row < h; row++) {
            const bits = g[4 + row];
            if (!bits) continue;
            let col = 0;
            while (col < w) {
                if (bits & (1 << col)) {
                    const start = col;
                    while (col < w && (bits & (1 << col))) col++;
                    fill_rect(cx + start, y + yOff + row, col - start, 1, color);
                } else col++;
            }
        }
        cx += g[0];
    }
}

/* ---- the enum square's line rule --------------------------------------
 *
 * Ported from font5x3.mjs enumSquareLines. Only the RULE is ported: davebox
 * already has its own 5x3 face (pf3Print), and the square draws in the 4x5 one
 * anyway, so the source's glyph table is not carried.
 *
 * ⭑⭑ IT ASKS "DOES THIS NEED TO BREAK AT ALL" FIRST, before any rule about
 * where a break lands. Running the placement rules unconditionally is how POLY
 * became POL/Y and I+II became I+/II — both fit whole, and neither reads as
 * itself once split. This is also what retires davebox's old blind 4/4 slice,
 * under which AUDIO rendered as AUDI/O.
 *
 * ⚠ `_` always separates. `-` separates only BETWEEN two word characters:
 * "low-cut" is two words, but "+-1" is one value meaning plus-or-minus one, and
 * splitting it drops the minus entirely.
 * ⚠ A `+` INSIDE a word is a break opportunity and the `+` itself must stay
 * visible — "I+II" blind-sliced to "I+I"/"I" is not a bad split, it is a
 * DIFFERENT VALUE on screen, indistinguishable from mode "I". A LEADING or
 * TRAILING `+` is not a break ("+1", "Comb+" are single tokens).
 * ⚠ The final 3+3 slice is a PIXEL budget wearing a character count — movy drew
 * this square in a 3px face where three characters and the interior were the
 * same number. This renderer uses the proportional 4x5 face and the two came
 * apart, which is exactly why `fits` is asked first.
 */
export function enumSquareLines(value, fits) {
    const num = String(value == null ? '' : value).trim();
    if (/^[+-]?\d+$/.test(num)) return [num, ''];

    const parts = String(value).toUpperCase()
        .replace(/_/g, ' ')
        .replace(/([A-Z0-9])-([A-Z0-9])/g, '$1 $2')
        .trim().split(/\s+/);

    const flat = parts.join(' ');
    if (typeof fits === 'function' && fits(flat)) return [flat, ''];

    if (parts.length >= 2) return [parts[0].substring(0, 3), parts[1].substring(0, 3)];
    const w = parts[0] || '';

    const plus = w.indexOf('+');
    if (plus > 0 && plus < w.length - 1) {
        const left = w.substring(0, plus + 1);
        const right = w.substring(plus + 1);
        return left.length <= 3
            ? [left, right.substring(0, 3)]
            : [w.substring(0, 3), ('+' + right).substring(0, 3)];
    }
    return [w.substring(0, 3), w.substring(3, 6)];
}
