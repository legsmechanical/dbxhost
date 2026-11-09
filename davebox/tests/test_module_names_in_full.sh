#!/usr/bin/env bash
# A MODULE IS NAMED IN FULL WHEREVER IT IS NAMED (Josh, 2026-11-09: "anywhere
# we use module names, we should use the full module name (shortened to fit
# whatever space there is for it if necessary)"). Holds:
#   - the bank header's [instrument] is the module's declared name (NuSaw,
#     not its two-letter mark NS / NU), on the walk's real screens;
#   - the Sound menu's rows name the instrument and the insert (NUSAW, FREEVERB);
#   - the editor's header names the module;
#   - fitHeaderRight shortens the name to the room the bank name leaves, never
#     ending on a dash, keeping two letters at least, and leaves a route mark
#     (MV1, no brackets) alone.
set -u
cd "$(dirname "$0")/.." || exit 2
command -v node >/dev/null 2>&1 || { echo "FAIL: node not found (test_module_names_in_full)"; exit 1; }
T=$(mktemp -d "${TMPDIR:-/tmp}/modnames.XXXXXX"); trap 'rm -rf "$T"' EXIT
if ! HUD_OUT="$T/hud" node --import ./tools/audit_loader.mjs tools/render_manual_screens.mjs "$T/png" > "$T/log" 2>&1; then
    grep -E "PROBLEM|SKIPPED" "$T/log" | head -20
    echo "FAIL: test_module_names_in_full (the manual walk did not complete)"; exit 1
fi
HUD="$T/hud" node --import ./tools/audit_loader.mjs --input-type=module - <<'JS'
import fs from 'node:fs';
const { fitHeaderRight } = await import('./ui/ui_movy.mjs');
const { fontWidth4x5 } = await import('./ui/ui_fonts_pp.mjs');
const dir = process.env.HUD;
const doc = (s) => JSON.parse(fs.readFileSync(dir + '/' + s + '.json', 'utf8'));
let bad = 0;
const ok = (n, c, why) => { console.log((c ? '  ok   — ' : '  FAIL — ') + n + (c ? '' : '  ' + (why || ''))); if (!c) bad = 1; };
const hr = (d) => (d.body && d.body.header && d.body.header.right) || '';
ok('the bank header names the instrument in full (T5[NuSaw])', hr(doc('bank-automation')) === 'T5[NuSaw]', hr(doc('bank-automation')));
ok('...on the MACROS card too', hr(doc('macros-card')) === '[NuSaw]', hr(doc('macros-card')));
const rows = (doc('config-card').body.list || {}).rows || [];
const val = (l) => (rows.find((r) => r.label === l) || {}).value;
ok('the Sound menu names the instrument (NUSAW >)', val('Instmt/Dest') === 'NUSAW >', val('Instmt/Dest'));
ok('...and the insert (FREEVERB)', val('FX 1') === 'FREEVERB', val('FX 1'));
const be = doc('block-editor-playing');
ok('the module editor\'s header names the module', /NUSAW/i.test(JSON.stringify(be.body && be.body.header)), JSON.stringify(be.body && be.body.header));
ok('a long name is shortened to the room left', fitHeaderRight('T5[SURGE XT SYNTH]', 40) === 'T5[SURGE]', fitHeaderRight('T5[SURGE XT SYNTH]', 40));
ok('...a name that fits is left whole', fitHeaderRight('T5[NUSAW]', 200) === 'T5[NUSAW]');
ok('...a cut never ends on a dash', fitHeaderRight('T5[OB-XD]', fontWidth4x5('T5[OB-]')) === 'T5[OB]', fitHeaderRight('T5[OB-XD]', fontWidth4x5('T5[OB-]')));
ok('...two letters at least, however little room', fitHeaderRight('T5[NUSAW]', 0) === 'T5[NU]', fitHeaderRight('T5[NUSAW]', 0));
ok('...and a route mark without a name is left alone', fitHeaderRight('MV1', 3) === 'MV1');
console.log(bad ? 'FAIL: test_module_names_in_full' : 'PASS: test_module_names_in_full');
process.exit(bad);
JS
