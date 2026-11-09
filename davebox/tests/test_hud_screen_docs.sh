#!/usr/bin/env bash
# THE SCREEN VIEW SEES EVERY SCREEN. The manual renderer boots the real UI and
# drives the real gestures to every screen the manual shows; with HUD_OUT it
# also plays a connected browser, so each screen publishes the description the
# Screen view redraws. This holds that walk to:
#   - every screen published a document, none with screen id "unknown"
#     (a dispatcher branch drawn without hudScreen) -- the renderer itself
#     reports these as PROBLEMs and exits non-zero;
#   - the document says what the OLED says, on screens of each family;
#   - THE KNOBS, ALWAYS (Josh, 2026-11-08): a Track / Session view screen
#     carries the knob page the OLED is not showing, and a knob touch keeps
#     the overview — while the OLED itself draws exactly what it drew before
#     (the walk WITHOUT a viewer must give byte-identical frames: describing
#     the hidden page is done with the display muted).
set -u
cd "$(dirname "$0")/.." || exit 2
command -v node >/dev/null 2>&1 || { echo "FAIL: node not found (test_hud_screen_docs)"; exit 1; }
T=$(mktemp -d "${TMPDIR:-/tmp}/hud_docs.XXXXXX"); trap 'rm -rf "$T"' EXIT
if ! HUD_OUT="$T/hud" node --import ./tools/audit_loader.mjs tools/render_manual_screens.mjs "$T/png" > "$T/log" 2>&1; then
    grep -E "PROBLEM|SKIPPED" "$T/log" | head -20
    echo "FAIL: test_hud_screen_docs (the walk reported problems)"; exit 1
fi
# the same walk with nobody watching: no frame recorded, no hidden page
# described. Its OLED frames must be the watched walk's, byte for byte.
if ! node --import ./tools/audit_loader.mjs tools/render_manual_screens.mjs "$T/png0" > "$T/log0" 2>&1; then
    echo "FAIL: test_hud_screen_docs (the unwatched walk failed)"; exit 1
fi
n=0; diff=0
for f in "$T"/png0/*.png; do n=$((n+1)); cmp -s "$f" "$T/png/$(basename "$f")" || { diff=$((diff+1)); echo "  differs: $(basename "$f")"; }; done
if [ "$n" -lt 100 ] || [ "$diff" -ne 0 ]; then
    echo "FAIL: test_hud_screen_docs (watching changed the OLED: $diff of $n frames differ)"; exit 1
fi
echo "  ok   — a viewer changes nothing on the OLED ($n frames identical with and without one)"
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
ok('a knob touched on Track view: the big screen keeps the overview', k.where.screen === 'track.overview' && !!k.body.tracks, k.where.screen);
ok('...and carries the bank page the OLED shows: eight cells, full names, the touched one', k.knobs && k.knobs.screen === 'track.bank' && k.knobs.knobs.length === 8 &&
   k.knobs.knobs[0].name === 'Octave Shift' && k.knobs.touched === 0, JSON.stringify(k.knobs && { s: k.knobs.screen, t: k.knobs.touched, c0: k.knobs.knobs[0] }));
ok('...the touched knob named as on the OLED', k.knobs.header && k.knobs.header.touchedName === 'Octave Shift', JSON.stringify(k.knobs.header));
ok('...and the bank table adds the range', k.knobs.meta && k.knobs.meta[0] && k.knobs.meta[0].min === -4 && k.knobs.meta[0].max === 4, JSON.stringify(k.knobs.meta && k.knobs.meta[0]));
/* every knob page that peeks over the overview folds under it, Sound view's
 * cards (the MIX bank, MACROS) and the Pad Mode bank as much as a clip bank */
const fold = (slug, scr, touched) => { const f = doc(slug);
  ok('a touch on ' + slug + ' keeps the overview: the ' + scr + ' page goes under it', f.where.screen === 'track.overview' && !!f.body.tracks && f.knobs &&
     f.knobs.screen === scr && f.knobs.knobs.length === 8 && (touched == null || f.knobs.touched === touched), f.where.screen + ' ' + JSON.stringify(f.knobs && { s: f.knobs.screen, t: f.knobs.touched })); };
fold('sound-card', 'sound.prompt', 0);
fold('midi-track-card', 'sound.prompt', 0);
fold('macros-card', 'sound.macros');
fold('bank-chord', 'track.padmode');
ok('...and names its bank as the heading does, for the strip to keep on a touch', doc('sound-card').where.bankName === 'MIX' && doc('bank-drumlane').where.bankName === 'DRUM LANE', doc('sound-card').where.bankName + ' / ' + doc('bank-drumlane').where.bankName);
/* the knob strip's second pass (Josh, 2026-11-09) */
const cr = doc('bank-crop-touched');
ok('a touched button knob carries its page\'s click hint (CLK CROP)', cr.knobs && cr.knobs.touched === 5 && (cr.knobs.hints || []).some((h) => h[0] === 'CLK' && h[1] === 'CROP'), JSON.stringify(cr.knobs && cr.knobs.hints));
const mu = doc('macros-unassigned-touched');
ok('...an unassigned macro\'s too (CLK ASSIGN)', mu.knobs && (mu.knobs.hints || []).some((h) => h[0] === 'CLK' && h[1] === 'ASSIGN'), JSON.stringify(mu.knobs && mu.knobs.hints));
const ta = doc('track-audio');
ok('an Audio track\'s overview carries its bank\'s knobs', ta.where.screen === 'track.audio-overview' && ta.knobs && ta.knobs.knobs.length === 8, ta.where.screen);
const bw = doc('bank-overview-walk');
const instCell = (bw.pads && bw.pads.cells || []).find((c) => c && !c.module && /^inst$/i.test(c.label));
const instSlot = (bw.pads && bw.pads.cells || []).find((c) => c && c.module && /^instrument$/i.test(c.label));
ok('the bank map\'s INST pad names the instrument, as its Instrument slot does', !!instCell && !!instCell.sub && !!instSlot && instCell.sub === instSlot.sub, JSON.stringify(instCell) + ' / ' + JSON.stringify(instSlot));
/* waveforms: the playhead, and SAMPLE / SLICES' knobs (Josh, 2026-11-09) */
const tap = doc('track-audio-playing');
ok('an Audio track\'s overview waveform says where the playhead is', tap.body.wave && typeof tap.body.wave.play === 'number' && Math.abs(tap.body.wave.play - 0.175) < 0.01, JSON.stringify(tap.body.wave && tap.body.wave.play));
const sl1 = doc('sample-loop'), lab = (d) => ((d.body.knobs || []).map((c) => c && c.label)).join(',');
ok('SAMPLE page 1 describes every knob it answers (Start Zoom Len Gain Pitch Detune Tempo Revrs)', sl1.where.screen === 'audio-wave-editor' && lab(sl1) === 'Start,Zoom,Len,Gain,Pitch,Detune,Tempo,Revrs' && !!sl1.body.wave, lab(sl1));
const sl2 = doc('sample-loop-p2');
ok('...page 2 keeps the waveform for the Screen view', !!(sl2.body.wave && sl2.body.wave.amp) && /^Sync/.test(lab(sl2)), lab(sl2));
const sc = doc('slices-slicer');
ok('SLICES describes the slice\'s Start / End and its sound knobs', /^Start,Zoom,End,/.test(lab(sc)) && !!sc.body.wave, lab(sc));
const ov = doc('track-melodic-playing');
ok('a Track overview carries its bank\'s knobs with nothing touched (the OLED hides them)', ov.where.screen === 'track.overview' && ov.knobs && ov.knobs.knobs.length === 8 &&
   ov.knobs.touched === -1 && ov.knobs.knobs.filter(Boolean).length === 8, JSON.stringify(ov.knobs && ov.knobs.knobs.map((c) => c && c.label)));
const dr = doc('bank-overview-drum');
ok('...a drum track\'s too', dr.where.screen === 'track.drum-overview' && dr.knobs && dr.knobs.knobs.length === 8, dr.where.screen);
const si = doc('bank-step-idle');
ok('a page with no knobs on it (STEP, nothing held) is left as the OLED draws it', si.where.screen === 'track.step' && !si.knobs, si.where.screen);
const q = doc('quit-confirm');
ok('a confirm: title, lines, buttons, the selection', q.body.header.text === 'QUIT dAVEBOx?' && q.body.prompt.buttons.join() === 'No,Yes' &&
   q.body.prompt.lines.length === 2, JSON.stringify(q.body));
const m = doc('menu-project-settings');
ok('a menu: its rows with values and the selection', m.body.list && m.body.list.rows[0].label === 'BPM' && m.body.list.rows[0].value === '120', JSON.stringify(m.body.list && m.body.list.rows[0]));
const x = doc('session-mixer-pan');
ok('the session mixer page: the big screen keeps the session overview, the eight pan knobs under it', x.where.screen === 'session.overview' && x.ovw && x.knobs &&
   x.knobs.screen === 'session.mixer' && x.knobs.knobs.every((c) => c && c.kind === 'arcbip'), x.where.screen + ' ' + JSON.stringify(x.knobs && x.knobs.knobs[0]));
const xt = doc('session-mixer-touched');
ok('...a knob touched and turned there names which', xt.knobs && xt.knobs.touched === 2 && xt.where.screen === 'session.overview', JSON.stringify(xt.knobs && xt.knobs.touched));
const xo = doc('session-mixer-touch-only');
ok('...and a touch alone, on the fader page, names which (as the OLED marks its strip)', xo.knobs && xo.knobs.touched === 4 && xo.where.screen === 'session.overview' &&
   xo.knobs.knobs[4] && xo.knobs.knobs[4].kind === 'vbar', JSON.stringify(xo.knobs && { t: xo.knobs.touched, k: xo.knobs.knobs[4] }));
const rb = doc('record-blocked');
ok('a dialog drawn with its own button row reports the buttons (Rec unavailable)', rb.body.prompt && (rb.body.prompt.buttons || []).join() === 'OK,Bake Now', JSON.stringify(rb.body.prompt));
const nu = doc('notice-undo');
ok('a notice card is described, over the screen it interrupts (Undo)', nu.overlayLayer && nu.overlayLayer.notice && nu.overlayLayer.notice.lines[0] === 'UNDO' && nu.body.tracks, JSON.stringify(nu.overlayLayer));
/* POP-UPS stay pop-ups (Josh, 2026-11-09: "if something presents as a pop-up or
 * overlay on the oled, it should generally present as such on the virtual
 * screen"): the page under them is still the screen, the pop-up is described apart */
const vp = doc('bank-value-popup'), vpp = vp.knobs && vp.knobs.popup;
ok('an enum knob\'s picker is described over the page it opened from (SEQ ARP Style)', vp.body.tracks && vpp && vpp.list &&
   vpp.list.rows.slice(0, 3).map((r) => r.label).join() === 'Off,Up,Down' && vpp.list.sel === 2, JSON.stringify(vpp));
const ip = doc('instrument-picker');
ok('...a Sound menu picker over the menu it floats on, not in its place', ip.body.list && ip.body.list.rows.some((r) => r.label === 'Instmt/Dest') &&
   ip.body.popup && ip.body.popup.list && ip.body.popup.list.rows[0].label === 'List: All', JSON.stringify(ip.body.popup && ip.body.popup.list.rows.slice(0, 2)));
ok('...and its NOTE rows keep their text (a Move instrument another track plays)', (ip.body.popup.list.rows || []).some((r) => /^Move 1 - T\d$/.test(r.note || '')),
   JSON.stringify(ip.body.popup.list.rows.slice(2, 5)));
const lc = doc('sound-level-card');
ok('...a level card over the menu (Shift + Volume in TRACK CONFIG)', lc.body.list && lc.body.primary === 'list' && lc.body.popup && lc.body.popup.big &&
   /LEVEL/.test(lc.body.popup.big.text), JSON.stringify(lc.body.popup));
const bp = doc('bank-picker');
ok('...the bank picker as a list over the overview', bp.body.tracks && bp.overlayLayer && bp.overlayLayer.list && bp.overlayLayer.list.rows[2].label === 'LIVE ARP' &&
   bp.overlayLayer.list.sel === 2, JSON.stringify(bp.overlayLayer && bp.overlayLayer.list && bp.overlayLayer.list.rows.slice(0, 3)));
const tc = doc('track-config');
ok('...and a screen with no pop-up has none', !tc.body.popup && tc.body.primary === 'list', JSON.stringify(tc.body.popup));
const so = doc('session-overview');
ok('the session overview carries the knob mode, its eight values and the clips in brief', so.ovw && so.ovw.cells.length === 8 && so.ovw.thumbs.length === 8 && typeof so.ovw.rowOff === 'number' && so.ovw.mode, JSON.stringify(so.ovw).slice(0, 200));
/* the grid's clip states: the same facts the overview's track row reports, from the same state */
const cl = so.ovw.clips || [], tr = so.body.tracks || [];
ok('...and every clip\'s state as the pads light it, agreeing with the track row', cl.length === 8 && tr.length === 8 &&
   cl.every((c, t) => typeof c.has === 'number' && !!((c.has >> c.ac) & 1) === tr[t].has && !!(c.pl && ((c.has >> c.ac) & 1)) === tr[t].playing &&
     !!((c.q >= 0 || c.rl) && ((c.has >> c.ac) & 1)) === tr[t].queued) &&
   cl.some((c) => c.has), JSON.stringify(cl) + ' vs ' + JSON.stringify(tr.map((r) => [r.clip, r.has, r.playing])));
const td = doc('track-drum');
ok('a drum track says which lane it is on', td.where.padMode === 'drum' && td.where.lane >= 0, JSON.stringify(td.where));
console.log(bad ? 'FAIL: test_hud_screen_docs' : 'PASS: test_hud_screen_docs');
process.exit(bad);
JS
