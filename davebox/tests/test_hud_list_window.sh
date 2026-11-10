#!/usr/bin/env bash
# A LONG LIST IS SENT AS A WINDOW. The Screen view's document goes through a
# 16 KB page on the host (src/host/ui_publish_shm.h UI_PUBLISH_MAX), and a
# document over it is refused — the Screen view then stays on the last screen
# it got. A module's preset list can run to hundreds of names; the module
# editor's list page sent all of them in every frame. This holds the list
# description to a window around the selection, with its offset and length.
set -u
cd "$(dirname "$0")/.." || exit 2
command -v node >/dev/null 2>&1 || { echo "FAIL: node not found (test_hud_list_window)"; exit 1; }
node --input-type=module - <<'JS'
import { listOut } from './ui/hud/contrib/layer.mjs';
import fs from 'fs';
let bad = 0;
const ok = (n, c, why) => { console.log((c ? '  ok   — ' : '  FAIL — ') + n + (c ? '' : '  ' + (why || ''))); if (!c) bad = 1; };
const names = Array.from({ length: 1000 }, (_, i) => ({ label: 'Factory Preset Number ' + (i + 1), value: i === 700 ? '*' : undefined }));

const L = listOut(names, 600, 'list');
ok('1000 presets, the 601st selected: a window, not the list', L.rows.length <= 48 && L.total === 1000, L.rows.length + ' rows, total ' + L.total);
ok('...the selected row is in the window, where first says', L.rows[600 - L.first] && L.rows[600 - L.first].label === 'Factory Preset Number 601', JSON.stringify(L.rows[600 - L.first]));
ok('...sel stays the absolute index', L.sel === 600);
const doc = JSON.stringify({ seq: 1, where: { screen: 'sound.params' }, body: { list: L, header: { text: 'Presets' } } });
const max = +((fs.readFileSync('../src/host/ui_publish_shm.h', 'utf8').match(/UI_PUBLISH_MAX\s+(\d+)/) || [])[1]);
ok('...and the document fits the host\'s page (' + doc.length + ' of ' + max + ' bytes)', max > 0 && doc.length < max / 2, doc.length + ' / ' + max);

const I = listOut(names, -1, 'list');
ok('inert (nothing selected): the window starts at the top, as the whole list did', I.first === 0 && I.sel === -1 && I.rows[0].label === 'Factory Preset Number 1');
const E = listOut(names, 999, 'list');
ok('the last preset selected: it is in the window', E.rows[999 - E.first] && E.rows[999 - E.first].label === 'Factory Preset Number 1000', E.first + ' ' + E.rows.length);
const S = listOut(names.slice(0, 2), 1, 'list');
ok('a short list is sent whole', S.rows.length === 2 && S.first === 0 && S.total === 2);
const C = listOut(names, 690, 'list');
ok('a row\'s value (the loaded preset\'s mark) rides along', C.rows[700 - C.first] && C.rows[700 - C.first].value === '*');

const src = fs.readFileSync('./ui/hud/contrib/params.mjs', 'utf8');
ok('the module editor\'s list page uses the window', /body\.list\s*=\s*listOut\(/.test(src) && !/body\.list\s*=\s*\{\s*rows/.test(src));
process.exit(bad);
JS
rc=$?
[ $rc -eq 0 ] && echo "PASS: test_hud_list_window" || echo "FAIL: test_hud_list_window"
exit $rc
