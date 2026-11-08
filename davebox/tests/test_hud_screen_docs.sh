#!/usr/bin/env bash
# THE SCREEN VIEW SEES EVERY SCREEN. The manual renderer boots the real UI and
# drives the real gestures to every screen the manual shows; with HUD_OUT it
# also plays a connected browser, so each screen publishes the description the
# Screen view redraws. This holds that walk to:
#   - every screen published a document, none with screen id "unknown"
#     (a dispatcher branch drawn without hudScreen) -- the renderer itself
#     reports these as PROBLEMs and exits non-zero;
#   - the document says what the OLED says, on screens of each family.
set -u
cd "$(dirname "$0")/.." || exit 2
command -v node >/dev/null 2>&1 || { echo "FAIL: node not found (test_hud_screen_docs)"; exit 1; }
T=$(mktemp -d "${TMPDIR:-/tmp}/hud_docs.XXXXXX"); trap 'rm -rf "$T"' EXIT
if ! HUD_OUT="$T/hud" node --import ./tools/audit_loader.mjs tools/render_manual_screens.mjs "$T/png" > "$T/log" 2>&1; then
    grep -E "PROBLEM|SKIPPED" "$T/log" | head -20
    echo "FAIL: test_hud_screen_docs (the walk reported problems)"; exit 1
fi
HUD="$T/hud" node - <<'JS'
const fs = require('fs'), dir = process.env.HUD;
const idx = JSON.parse(fs.readFileSync(dir + '/index.json', 'utf8'));
const doc = (s) => JSON.parse(fs.readFileSync(dir + '/' + s + '.json', 'utf8'));
let bad = 0;
const ok = (n, c, why) => { console.log((c ? '  ok   — ' : '  FAIL — ') + n + (c ? '' : '  ' + (why || ''))); if (!c) bad = 1; };
ok('the walk covers the manual (' + idx.length + ' screens)', idx.length >= 100, idx.length);
ok('no screen is unnamed', idx.every((i) => i.screen && i.screen !== 'unknown'), JSON.stringify(idx.filter((i) => !i.screen || i.screen === 'unknown')));
let big = 0; for (const i of idx) big = Math.max(big, fs.statSync(dir + '/' + i.slug + '.json').size);
ok('every document fits the page with room (largest ' + big + ' B < 12000)', big < 12000);
const k = doc('bank-knob-touched');
ok('a bank page: the screen, eight cells, full names', k.where.screen === 'track.bank' && k.body.knobs.length === 8 &&
   k.body.knobs[0].name === 'Octave Shift', JSON.stringify(k.body.knobs[0]));
ok('...the touched knob names the header, like the OLED', k.body.header && k.body.header.touchedName === 'Octave Shift', JSON.stringify(k.body.header));
ok('...and the bank table adds the range', k.knobMeta && k.knobMeta[0] && k.knobMeta[0].min === -4 && k.knobMeta[0].max === 4, JSON.stringify(k.knobMeta && k.knobMeta[0]));
const q = doc('quit-confirm');
ok('a confirm: title, lines, buttons, the selection', q.body.header.text === 'QUIT dAVEBOx?' && q.body.prompt.buttons.join() === 'No,Yes' &&
   q.body.prompt.lines.length === 2, JSON.stringify(q.body));
const m = doc('menu-project-settings');
ok('a menu: its rows with values and the selection', m.body.list && m.body.list.rows[0].label === 'BPM' && m.body.list.rows[0].value === '120', JSON.stringify(m.body.list && m.body.list.rows[0]));
const x = doc('session-mixer-pan');
ok('the session mixer: eight pan knobs', x.where.screen === 'session.mixer' && x.body.knobs.every((c) => c && c.kind === 'arcbip'), JSON.stringify(x.body.knobs[0]));
const rb = doc('record-blocked');
ok('a dialog drawn with its own button row reports the buttons (Rec unavailable)', rb.body.prompt && (rb.body.prompt.buttons || []).join() === 'OK,Bake Now', JSON.stringify(rb.body.prompt));
const nu = doc('notice-undo');
ok('a notice card is described, over the screen it interrupts (Undo)', nu.overlayLayer && nu.overlayLayer.notice && nu.overlayLayer.notice.lines[0] === 'UNDO' && nu.body.tracks, JSON.stringify(nu.overlayLayer));
const so = doc('session-overview');
ok('the session overview carries the knob mode, its eight values and the clips in brief', so.ovw && so.ovw.cells.length === 8 && so.ovw.thumbs.length === 8 && typeof so.ovw.rowOff === 'number' && so.ovw.mode, JSON.stringify(so.ovw).slice(0, 200));
const td = doc('track-drum');
ok('a drum track says which lane it is on', td.where.padMode === 'drum' && td.where.lane >= 0, JSON.stringify(td.where));
console.log(bad ? 'FAIL: test_hud_screen_docs' : 'PASS: test_hud_screen_docs');
process.exit(bad);
JS
