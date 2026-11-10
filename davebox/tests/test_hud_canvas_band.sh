#!/usr/bin/env bash
# A PAGE A MODULE DRAWS ITSELF (a `type: "canvas"`, `as_page` param: Bouba-Kiki's
# Shape, MonkSynth's Face) is described to the Screen view as the band of the OLED
# it draws in, beside the page's knobs: nothing but the module's pixels says what
# it shows, so the Screen view draws that band of the live frame over the knobs.
set -u
cd "$(dirname "$0")/.." || exit 2
command -v node >/dev/null 2>&1 || { echo "FAIL: node not found (test_hud_canvas_band)"; exit 1; }
node --input-type=module - <<'JS' || exit 1
import { describeLayer } from './ui/hud/contrib/layer.mjs';
import fs from 'fs';
let bad = 0;
const ok = (n, c, why) => { console.log((c ? '  ok   — ' : '  FAIL — ') + n + (c ? '' : '  ' + (why || ''))); if (!c) bad = 1; };
const cells = Array.from({ length: 8 }, (_, k) => ({ label: 'K' + k, text: '0' }));
const d = describeLayer([['KitHeaderParamPages', { left: 'BOUBA-KIKI', right: 'Shape' }], ['CanvasBand', { x: 0, y: 12, w: 128, h: 40 }], ['KitCells', { cells, touched: -1 }]]);
ok('the band is kept, with the page', d && JSON.stringify(d.canvasBand) === '{"x":0,"y":12,"w":128,"h":40}', JSON.stringify(d && d.canvasBand));
ok('...and the knobs stay the page\'s main content', d && d.primary === 'knobs' && d.knobs.length === 8, d && d.primary);
const e = describeLayer([['CanvasBand', { x: 0, y: 12, w: 0, h: 40 }]]);
ok('an empty band is no band', !e || !e.canvasBand, JSON.stringify(e));
const f = describeLayer([['CanvasBand', { x: 0, y: 0, w: 400, h: 400 }]]);
ok('a band never exceeds the OLED', f && f.canvasBand.w === 128 && f.canvasBand.h === 64, JSON.stringify(f && f.canvasBand));
/* the tap sits where a module draws its page, and only there */
const src = fs.readFileSync('./ui/ui_sound.mjs', 'utf8');
const m = src.match(/drawCanvasPage: \(drawCtx, band, canvas, payload\) => \{[\s\S]*?\n        \},/);
ok('ui_sound\'s drawCanvasPage records its band when the module draws', !!m && /if \(fn\) \{ kitHudTap\('CanvasBand', band\); fn\(drawCtx, band, payload\); \}/.test(m[0]), m ? m[0].slice(-200) : 'drawCanvasPage not found');
process.exit(bad);
JS
echo "PASS: a module-drawn page reaches the Screen view as its band"
