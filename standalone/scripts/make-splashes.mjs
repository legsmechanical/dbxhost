/* standalone/scripts/make-splashes.mjs — generate the two boot splash payloads.
 *
 * A dAVEBOx session shows two screens before the module is up:
 *
 *   1. the INSTANT one, painted into the stock display by quiesce-stock.sh and
 *      then frozen — this is artwork, and it ROTATES: a different frame each
 *      launch (Josh, 2026-08-24). Emitted as splash-N.hex, one per frame.
 *   2. the host's own boot splash, drawn by shadow_ui while the module loads —
 *      this is now TEXT: the wordmark, dAVEBOx's own version under it, then the
 *      Schwung base version. Emitted pre-rendered as splash2.hex.
 *
 * ⭑ Why screen 2 is rendered HERE rather than drawn at runtime: the fonts Josh
 * named live in the module (davebox/ui/ui_movy.mjs), and the host half has only
 * its single 6px `print`. Porting two glyph tables across the seam would be a
 * second copy to keep in step forever; rendering with the REAL fonts at build
 * time is one script and cannot drift. The versions are build-time facts anyway
 * — splash_caption.txt was already generated the same way. A version bump in
 * standalone/module/module.json or src/host/version.txt therefore means running
 * this again (tests/host/test_splash_assets.sh fails until you do).
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT  = process.argv[2] || join(REPO, 'build');
const VERSION = readFileSync(join(REPO, 'src', 'host', 'version.txt'), 'utf8').trim();
/* dAVEBOx's own version: the one a release bumps and the bug report carries.
 * Testers could find only the base version on the device. */
const SA_VERSION = JSON.parse(readFileSync(join(REPO, 'standalone', 'module', 'module.json'), 'utf8')).version;

const W = 128, H = 64;

/* ui_movy draws through a global set_pixel, so give it one over a bitmap. */
const bitmap = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, c) => {
    x |= 0; y |= 0;
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    bitmap[y * W + x] = c ? 1 : 0;
};

const movy   = await import(join(REPO, 'davebox', 'ui', 'ui_movy.mjs'));
const splash = await import(join(REPO, 'davebox', 'ui', 'ui_splash.mjs'));

/* row-major, MSB-first, 16 bytes/row — the splash.hex contract */
function toHex(px) {
    const bytes = new Uint8Array((W >> 3) * H);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (px[y * W + x]) bytes[y * 16 + (x >> 3)] |= 1 << (7 - (x & 7));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---- screen 2: the text screen ---------------------------------------- */
bitmap.fill(0);
const WORD = 'dAVEBOx';          /* verbatim — the font carries real d/x glyphs,
                                  * and uppercasing it would destroy the mark */
const CAP  = 'Schwung base ' + VERSION;
/* The wordmark keeps its baseline (the farewell screen shares it), dAVEBOx's
 * version sits right under it, and the base version below with a clear gap, so
 * the two numbers cannot be read as one. */
const centre = (s, w) => Math.max(0, Math.round((W - w(s)) / 2));
movy.hdrPrint(centre(WORD, movy.hdrWidth), 26, WORD, 1);
movy.mvPrint(centre(SA_VERSION, movy.mvWidth), 38, SA_VERSION, 1);
movy.mvPrint(centre(CAP, movy.mvWidth), 52, CAP, 1);
writeFileSync(join(OUT, 'splash2.hex'), toHex(bitmap) + '\n');

/* ---- screen 1: every artwork frame ------------------------------------ */
/* SPLASH_FRAMES are already decoded bit arrays in the host's own row-major
 * layout, so they pass straight through — this is a re-emit, not a re-render. */
let n = 0;
for (const frame of splash.SPLASH_FRAMES) {
    const hex = Array.from(frame, (b) => b.toString(16).padStart(2, '0')).join('');
    writeFileSync(join(OUT, `splash-${n}.hex`), hex + '\n');
    n++;
}
/* Frame 0 stays as splash.hex too: it is what an older launcher on the device
 * still reads, and one file costs nothing. */
writeFileSync(join(OUT, 'splash.hex'),
              readFileSync(join(OUT, 'splash-0.hex'), 'utf8'));

/* The POOL MANIFEST — what the launch-side pickers (pick-splash.py, and
 * ensureCustomSplash in shadow_ui.js) read to do a WEIGHTED pick and record
 * the dealt Dave's permanent number into the collection file. One row per
 * frame, index-aligned with splash-N.hex: index, dave_num, weight, name. */
writeFileSync(join(OUT, 'splash-pool.tsv'),
    splash.DAVES.map((d, i) => `${i}\t${d.n}\t${d.w}\t${d.name}`).join('\n') + '\n');
console.log(`splashes: ${n} artwork frames + splash2.hex + splash-pool.tsv (${SA_VERSION} · ${CAP})`);
