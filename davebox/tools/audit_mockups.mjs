// tools/audit_mockups.mjs — PROPOSED versions of the screens that fail the
// cohesion audit, drawn with the same kit primitives the approved screens use.
//
// These are mockups, not the implementation: they call drawKitHeader /
// drawKitList directly with hand-written row sets, so a proposal can be seen
// before any screen is rewritten. Because they go through the REAL primitives,
// what you see is exactly what the rewrite would produce — the fonts, the
// metrics, the truncation and the scrollbar are the shipping ones, not a
// designer's approximation.
//
//   node tools/audit_mockups.mjs [outdir]
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';

const W = 128, H = 64;
const SCALE = 4, PAD = 8;
const ON = [235, 238, 245], BG = [14, 16, 22], MAT = [30, 33, 42];

let fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => {
    x |= 0; y |= 0;
    if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0;
};
globalThis.fill_rect = (x, y, w, h, v) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v);
};
globalThis.clear_screen = () => { fb.fill(0); };

const kit = await import('../ui/ui_movy.mjs');
const shots = [];
function shoot(slug) { shots.push({ slug, fb: fb.slice() }); }

/* Every proposed screen is the same three calls the approved top level makes.
 * That IS the proposal — there is no new component here. */
function screen(slug, title, rows, sel) {
    globalThis.clear_screen();
    kit.drawKitHeader(title, false);
    kit.drawKitList(rows, sel, {});
    shoot(slug);
}

/* ── A. Track-settings submenus: the top level's own chassis ──
 * hdr:true on every structural row (header font, as the top level), the
 * (n) track marker instead of the over-wide "TRACK n - " prefix, and the
 * divider grammar for grouping. */
/* ⚠ NO dividers here, deliberately. A divider occupies a whole ROW, so on a
 * 3-to-5 row submenu it buys grouping nobody needed and pushes the list into
 * scrolling — the first cut of this mockup turned a fully-visible 5-row Config
 * into a scrolling 6. Grouping earns its row on the ~15-row top level, not
 * here. Same chassis, applied with judgement rather than uniformly. */
screen('after-sound-control', '(5) SOUND CONTROL', [
    { label: 'Knobs', hdr: true, chevron: true },
    { label: 'LFO 1', hdr: true, chevron: true },
    { label: 'LFO 2', hdr: true, chevron: true },
], 0);

screen('after-config', '(5) CONFIG', [
    { label: 'Mode', hdr: true, value: 'Keys' },
    { label: 'Layout', hdr: true, value: 'Scale' },
    { label: 'Transpose', hdr: true, value: '0 st' },
    { label: 'Vel In', hdr: true, value: 'Live' },
    { label: 'Looper', hdr: true, value: 'On' },
], 0);

/* The knob editor, which the assignment card now points at. */
screen('after-knobs', '(5) KNOBS', [
    { label: 'Knob 1', hdr: true, value: 'Cutoff' },
    { label: 'Knob 2', hdr: true, value: 'Room Size' },
    { label: 'Knob 3', hdr: true, value: '-' },
    { label: 'Knob 4', hdr: true, value: '-' },
    { label: 'Knob 5', hdr: true, value: 'Shape' },
], 1);

/* ── B. Global settings on the kit chassis ──
 * Same header bar, same rows, same right-aligned values, same chevrons for
 * doors, same scrollbar. No "> " prefix: inverse video is the kit's selection
 * grammar and the prefix is what indents every host row by two characters. */
screen('after-global', 'GLOBAL', [
    { label: 'BPM', hdr: true, value: '120' },
    { label: 'Key', hdr: true, value: 'C' },
    { label: 'Scale', hdr: true, value: 'Minor' },
    { label: 'Clock Follow', hdr: true, value: 'Off' },
    { label: 'Clock Out', hdr: true, value: 'On' },
    { divider: true },
    { label: 'Projects', hdr: true, chevron: true },
    { label: 'Host Settings', hdr: true, chevron: true },
], 2);

/* Editing a value: the kit's [brackets], the same grammar as every other
 * editable row in the app. */
screen('after-global-edit', 'GLOBAL', [
    { label: 'BPM', hdr: true, value: '120' },
    { label: 'Key', hdr: true, value: 'C' },
    { label: 'Scale', hdr: true, value: 'Minor', editing: true },
    { label: 'Clock Follow', hdr: true, value: 'Off' },
    { label: 'Clock Out', hdr: true, value: 'On' },
    { divider: true },
    { label: 'Projects', hdr: true, chevron: true },
    { label: 'Host Settings', hdr: true, chevron: true },
], 2);

/* ── C. Project management ──
 * ⚠ PAD-DRIVEN, and staying that way (Josh, 2026-08-15): Move native selects
 * and manages sets by pad, so that is the muscle memory to match. No list, no
 * copy/delete legend (Move-native gestures the user already knows), and no
 * "Now:" indicator.
 *
 * ⭑ ONE SCREEN, showing whichever project is SELECTED — which on launch is the
 * prior one, already pulsing on its pad. That collapses the old root/menu split
 * and removes what looked like a fresh-launch special case: the rule is simply
 * "is this project loaded", and on launch the answer is no, so the ordinary
 * screen is correct with no branch. */

/* Rows shared by both states. Load is a real action; (CURRENT) is not. */
const PROJ_ROWS = [
    { label: 'Rename', hdr: true, chevron: true },
    { label: 'Colour', hdr: true, value: 'Blue' },
];

/* C1 — the selected project is NOT loaded (incl. every fresh launch): the
 * ordinary screen, Load first and selected. */
screen('after-project-menu', 'SKETCHBOOK', [
    { label: 'Load', hdr: true }, ...PROJ_ROWS,
], 0);

/* C2 — the selected project IS the loaded one. Load is replaced by a centred,
 * NON-SELECTABLE (CURRENT) line: there is no action to offer, and centring plus
 * un-selectability is how a 1-bit display says "status, not control" — it has
 * no dim state to grey a row with (UI_LANGUAGE §6).
 *
 * ⚠ It keeps a full row's height so Rename and Colour stay where they are in
 * the other state; the menu must not reflow under your thumb. The cursor starts
 * on Rename because it is the first thing that can be pressed.
 *
 * ⭑ Needs one small addition to drawKitList — a centred non-selectable row —
 * which is the right place for it: dividers already prove the pattern, and any
 * screen wanting a status line gets it for free. */
globalThis.clear_screen();
kit.drawKitHeader('LIVE SET A', false);
(() => {
    const t = '(CURRENT)';
    kit.hdrPrint(Math.round((128 - kit.hdrWidth(t)) / 2), 11, t, 1);
})();
kit.drawKitList([{ label: 'Rename', hdr: true, chevron: true },
                 { label: 'Colour', hdr: true, value: 'Red' }], 0, { topY: 21 });
shoot('after-project-menu-current');

/* C3 — nothing selected, because the prior project no longer exists. The
 * header drops to the generic title and the screen carries one centred hint
 * until a pad is tapped. drawKitList's own emptyMsg already centres
 * horizontally; this sits it on the body's true vertical centre. */
globalThis.clear_screen();
kit.drawKitHeader('PROJECTS', false);
(() => {
    const t = 'SELECT PROJECT';
    kit.hdrPrint(Math.round((128 - kit.hdrWidth(t)) / 2), 34, t, 1);
})();
shoot('after-projects-empty');

/* C4 — the colour picker becomes a list of the colours, not a `< NAME >` text
 * row, so its selection grammar is the one the rest of the app uses. */
screen('after-project-colour', 'SKETCHBOOK COLOUR', [
    { label: 'Red', hdr: true },
    { label: 'Blue', hdr: true },
    { label: 'Green', hdr: true },
    { label: 'Mustard', hdr: true },
    { label: 'Pink', hdr: true },
], 1);

/* ── output ── */
function writePng(fbuf, outPath) {
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
    writeFileSync(outPath, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
        chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]));
}

const outDir = process.argv[2] || '/tmp/davebox-audit';
mkdirSync(outDir, { recursive: true });
for (const s of shots) {
    writePng(s.fb, outDir + '/' + s.slug + '.png');
    console.log(s.slug);
}
console.log(shots.length + ' mockups -> ' + outDir);
