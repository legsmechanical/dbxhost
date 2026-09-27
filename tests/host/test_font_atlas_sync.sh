#!/usr/bin/env bash
# tests/host/test_font_atlas_sync.sh — the host's bitmap font and dAVEBOx's
# off-device copy of it hold the SAME glyphs, bit for bit.
#
# scripts/generate_font.py is the one source of the device font; the renders
# and tests draw from davebox/tools/host_font_5x7.json. A glyph in one and not
# the other draws off-device and vanishes on the Move (a missing glyph prints
# nothing and only advances), which is how a favorites mark went unseen.
set -u
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 required"; exit 1; }
python3 - <<'PY'
import ast, json, sys
src = open('scripts/generate_font.py', encoding='utf-8').read()
tree = ast.parse(src)
font = None
for node in tree.body:
    if isinstance(node, ast.Assign) and any(getattr(t, 'id', None) == 'FONT' for t in node.targets):
        font = ast.literal_eval(node.value)
if not font:
    print('  FAIL — no FONT dict in scripts/generate_font.py'); print('FAIL: test_font_atlas_sync.sh'); sys.exit(1)
atlas = json.load(open('davebox/tools/host_font_5x7.json', encoding='utf-8'))
bits = lambda rows: [int(r.replace('#', '1').replace('.', '0'), 2) for r in rows]
bad = 0
for k in sorted(set(font) | set(atlas)):
    if k not in atlas: print('  FAIL — %r is in the font but not the atlas' % k); bad = 1
    elif k not in font: print('  FAIL — %r is in the atlas but not the font' % k); bad = 1
    elif bits(font[k]) != atlas[k]: print('  FAIL — %r differs' % k); bad = 1
for need in ('★', '·'):
    if need not in font: print('  FAIL — the UI draws %r and the font has none' % need); bad = 1
if not bad: print('  ok   — %d glyphs, identical in both' % len(font))
print(('FAIL' if bad else 'PASS') + ': test_font_atlas_sync.sh'); sys.exit(bad)
PY
