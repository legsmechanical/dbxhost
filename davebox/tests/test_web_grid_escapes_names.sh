#!/usr/bin/env bash
# The remote UI's session grid escapes instrument names.
#
# A track header shows the instrument's own name ("5 - OB-Xd"), which comes
# from the module and went into innerHTML and a title="" attribute unescaped: a
# name with `<` or `"` broke the grid or ran as markup. This runs the REAL
# header expressions from web_ui_seq.js with the REAL escMix from
# web_ui_mix.js against a hostile name.
set -u
cd "$(dirname "$0")/.." || exit 2
command -v node >/dev/null 2>&1 || { echo "FAIL: node not found (test_web_grid_escapes_names)" >&2; exit 1; }
out="$(node - <<'JS'
const fs = require('fs');
const seq = fs.readFileSync('web_ui_seq.js', 'utf8');
const mix = fs.readFileSync('web_ui_mix.js', 'utf8');
const esc = mix.match(/^function escMix\(s\) \{.*\}$/m);
const lbl = seq.match(/^\s*const lbl=\(instShort!=null\).*$/m);
const ttl = seq.match(/^\s*const ttl=\(instShort!=null\).*$/m);
if (!esc || !lbl || !ttl) { console.log('NOT FOUND: the header expressions moved — update this test'); process.exit(0); }
const run = new Function('instShort', 't', 'trk', esc[0] + '\n' + lbl[0] + '\n' + ttl[0] + '\nreturn lbl + "\\n" + ttl;');
const hostile = run('<img src=x onerror=1>"x', 4, { pm: 0 });
const plain = run('OB-Xd', 4, { pm: 0 });
if (/[<>"]/.test(hostile)) console.log('UNESCAPED: ' + hostile);
else if (plain !== '5 - OB-Xd\nTrack 5 → OB-Xd') console.log('PLAIN NAME CHANGED: ' + plain);
else console.log('OK');
JS
)"
if [ "$out" = "OK" ]; then echo "PASS: web grid escapes instrument names"; else echo "FAIL: $out" >&2; exit 1; fi
