// tools/render_fb.mjs — the 1-bit framebuffer, the host font port and the PNG
// writer, shared by every offline renderer in this directory.
//
// ⭑ ONE FRAMEBUFFER, ONE FONT PORT, ONE PNG WRITER. This was inlined in
// render_screens.mjs, which meant a second renderer had to either import that
// script (running the whole manual as a side effect) or copy 40 lines of glyph
// arithmetic. A copy of the host font port is the worst of the two: it is the
// piece that has to match js_display.c exactly, and a drifted copy would make
// two tools disagree about what the device draws with nothing to say which was
// right.
//
// ⚠ IMPORT THIS BEFORE ANY ui/*.mjs. The draw globals are installed as a side
// effect of loading this module, and ui_movy.mjs calls set_pixel/fill_rect at
// module scope through its font tables. A static import here plus dynamic
// `await import('../ui/...')` in the consumer gets the order right by
// construction.
//
// ⚠ RENDERS ARE NOT DETERMINISTIC UNLESS YOU FREEZE THE CLOCK. drawKitPageBar
// blinks its active segment off `Date.now()/375`, so the same page renders two
// different pictures depending on when you ran it — which silently turns any
// before/after PNG comparison into noise. Use `freezeClock()` (or
// `node --import` a module that pins Date.now) before rendering anything you
// intend to diff.
import { writeFileSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';

export const W = 128, H = 64;
let fb = new Uint8Array(W * H);

/** The live framebuffer. Reassigned by resetFb(), so re-read it after a reset. */
export const currentFb = () => fb;
/** Start a fresh screen. Returns the new buffer. */
export function resetFb() { fb = new Uint8Array(W * H); return fb; }

/** Pin Date.now so a page-bar blink cannot make two identical runs differ. */
export function freezeClock(atMs = 1756400000000) { Date.now = () => atMs; }

globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.clear_screen = () => { fb.fill(0); };

// ---- host text font: the "Oled 5x7 Pixel Font" the device print()/pixelPrint()
//      render (schwung generate_font.py). The device atlas trims each glyph to
//      its ink width, so print() is PROPORTIONAL: advance = glyphWidth +
//      charSpacing (blank/space advances the full 5px cell). Matches
//      js_display.c js_display_glyph(). charSpacing = 1. ----
const HFONT = JSON.parse(readFileSync(new URL('./host_font_5x7.json', import.meta.url)));  // ch -> 7 bytes, bit4=leftmost col
const CHAR_SPACING = 1, CELL_W = 5;
function _inkBounds(rows) { let mn = 5, mx = -1; for (const b of rows) for (let x = 0; x < 5; x++) if (b & (1 << (4 - x))) { if (x < mn) mn = x; if (x > mx) mx = x; } return mx < 0 ? null : { mn, mx }; }
function _drawHostChar(ch, x, y, col) {
    const rows = HFONT[ch] ?? HFONT[ch.toUpperCase?.()] ?? null;
    if (!rows) return CELL_W + CHAR_SPACING;          // unknown -> blank cell
    const b = _inkBounds(rows);
    if (!b) return CELL_W + CHAR_SPACING;             // space -> full cell
    for (let r = 0; r < 7; r++) for (let cx = b.mn; cx <= b.mx; cx++)
        if (rows[r] & (1 << (4 - cx))) globalThis.set_pixel(x + (cx - b.mn), y + r, col);
    return (b.mx - b.mn + 1) + CHAR_SPACING;
}
globalThis.print = (x, y, str, col) => { let cx = x | 0; for (const ch of String(str)) cx += _drawHostChar(ch, cx, y | 0, col ? 1 : 0); };
globalThis.text_width = (str) => { let w = 0; for (const ch of String(str)) { const rows = HFONT[ch] ?? null; const b = rows && _inkBounds(rows); w += (b ? (b.mx - b.mn + 1) : CELL_W) + CHAR_SPACING; } return w; };

// ---- PNG writer (RGBA, nearest-neighbour scaled, OLED-styled) ----
const SCALE = 4, PAD = 4, BG = [10, 12, 16], ON = [235, 235, 240], MAT = [30, 30, 34];
export function writePng(fbuf, outPath) {
    const iw = W * SCALE + 2 * PAD, ih = H * SCALE + 2 * PAD;
    const img = Buffer.alloc(iw * ih * 4);
    for (let i = 0; i < iw * ih; i++) { img[i*4]=MAT[0]; img[i*4+1]=MAT[1]; img[i*4+2]=MAT[2]; img[i*4+3]=255; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = fbuf[y * W + x] ? ON : BG;
        for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
            const p = ((PAD + y*SCALE + sy) * iw + PAD + x*SCALE + sx) * 4;
            img[p]=c[0]; img[p+1]=c[1]; img[p+2]=c[2]; img[p+3]=255;
        }
    }
    const crc32 = (buf) => { let c = ~0; for (let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));} return ~c>>>0; };
    const chunk = (type, data) => { const t=Buffer.from(type,'ascii'); const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const body=Buffer.concat([t,data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len,body,crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(iw,0); ihdr.writeUInt32BE(ih,4); ihdr[8]=8; ihdr[9]=6;
    const raw = Buffer.alloc(ih * (1 + iw*4));
    for (let y=0;y<ih;y++){ raw[y*(1+iw*4)]=0; img.copy(raw, y*(1+iw*4)+1, y*iw*4, (y+1)*iw*4); }
    const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]);
    writeFileSync(outPath, png);
}
