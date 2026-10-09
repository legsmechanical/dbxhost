// tools/render_launcher_screens.mjs — the Tools-menu launcher's three screens,
// pre-rendered with dAVEBOx's OWN dialog code.
//
//   cd davebox && node --import ./tools/audit_loader.mjs tools/render_launcher_screens.mjs [--write] [--png <dir>]
//
// The launcher (standalone/module/ui.js) runs inside STOCK Schwung, which has
// one 6px font and none of dAVEBOx's faces, so asking there in stock's overlay
// read as a different app from the one it opens. Its screens are drawn HERE
// instead, by the same chassis every dAVEBOx confirm uses (drawKitMarkHeader,
// the 4x5 body face, the shared Yes/No row), and shipped as bitmaps the
// launcher blits — the same trade the boot splash makes (make-splashes.mjs).
//
// Prints the frames as JSON. --write rewrites the block between LAUNCH-FRAMES
// markers in standalone/module/ui.js; tests/host/test_launcher_confirm.sh
// regenerates and compares, so the bitmaps cannot go stale against the fonts.
import { W, H, resetFb, currentFb, writePng } from './render_fb.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.draw_rect = (x, y, w, h, v) => {
    globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v);
};

const movy   = await import('../ui/ui_movy.mjs');
const pp     = await import('../ui/ui_fonts_pp.mjs');
const layout = await import('/data/UserData/schwung/shared/menu_layout.mjs');

/* The confirm family's body: centred, uppercased, in the 4x5 face — the same
 * arithmetic as ui_dialogs.mjs dlgLines (kept in step by eye; three lines of
 * layout, and the test compares the result, not this code). */
function body(lines, bottom) {
    const pitch = 10, bot = bottom == null ? 44 : bottom;
    const top = 7 + Math.floor((bot - 7 - (lines.length * pitch - (pitch - 5))) / 2);
    lines.forEach((raw, i) => {
        const t = pp.fit4x5(String(raw).toUpperCase(), 124);
        pp.fontPrint4x5(Math.floor((W - pp.fontWidth4x5(t)) / 2), top + i * pitch, t, 1);
    });
}
function confirm(selYes) {
    resetFb();
    movy.drawKitMarkHeader('LOAD dAVEBOx?');     /* the wordmark lives in the header: the body face has no lowercase */
    body(['Move will restart.', 'Proceed?']);
    layout.drawDialogYesNoRow(selYes);
    return currentFb().slice();
}
function starting() {
    resetFb();
    const name = 'dAVEBOx', verb = 'Restarting Move...';     /* same layout as the boot and exit screens */
    movy.hdrPrint(Math.max(0, Math.round((W - movy.hdrWidth(name)) / 2)), 26, name, 1);
    movy.mvPrint(Math.max(0, Math.round((W - movy.mvWidth(verb)) / 2)), 40, verb, 1);
    return currentFb().slice();
}
/* row-major, 8 px per byte, MSB = leftmost — the splash.hex contract */
function toHex(px) {
    const bytes = new Uint8Array((W >> 3) * H);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (px[y * W + x]) bytes[y * 16 + (x >> 3)] |= 1 << (7 - (x & 7));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const frames = { yes: confirm(true), no: confirm(false), starting: starting() };
const hex = Object.fromEntries(Object.entries(frames).map(([k, v]) => [k, toHex(v)]));

const args = process.argv.slice(2);
const pngAt = args.indexOf('--png');
if (pngAt >= 0) {
    const dir = args[pngAt + 1];
    mkdirSync(dir, { recursive: true });
    for (const [k, v] of Object.entries(frames)) writePng(v, join(dir, 'launcher-' + k + '.png'));
}
const block = '/* LAUNCH-FRAMES-BEGIN (generated: davebox/tools/render_launcher_screens.mjs --write) */\n' +
    'const FRAMES = {\n' +
    Object.entries(hex).map(([k, v]) => `    ${k}:\n        '${v}',`).join('\n') + '\n};\n' +
    '/* LAUNCH-FRAMES-END */';
if (args.includes('--write')) {
    const ui = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'standalone', 'module', 'ui.js');
    const src = readFileSync(ui, 'utf8');
    const a = src.indexOf('/* LAUNCH-FRAMES-BEGIN'), b = src.indexOf('/* LAUNCH-FRAMES-END */');
    if (a < 0 || b < 0) { console.error('no LAUNCH-FRAMES markers in ' + ui); process.exit(1); }
    writeFileSync(ui, src.slice(0, a) + block + src.slice(b + '/* LAUNCH-FRAMES-END */'.length));
}
console.log(JSON.stringify(hex));
