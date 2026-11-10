/* Smoke for the Screen view (web_ui_hud_*.js): every recorded screen — a REAL
 * document per manual screen (hud_fixtures/, make_hud_fixtures.sh) — renders,
 * no renderer throws, and each family draws what it should.
 * Run through ./run.sh (see README). */
import jsdomPkg from 'jsdom';
const { JSDOM, requestInterceptor } = jsdomPkg;
import { existsSync } from 'node:fs';

/* Scripts come off the DISK, not over HTTP: with the Screen view's ten files
 * the page loads seventeen scripts, and jsdom over local HTTP dropped some on
 * nearly every run (README: "retry on the DROP"). The files are the same ones
 * the server would send; /static/schwung-remote-api.js stays absent (404), so
 * the page runs on its mock shim exactly as in the preview. */
const ROOT = new URL('../../', import.meta.url);
const fromDisk = requestInterceptor((request) => {
  const u = new URL(request.url);
  if (u.host !== 'localhost:8199') return undefined;
  /* the manager's module-assets route, from the test fixtures (as preview_server.py does) */
  const p = u.pathname.startsWith('/api/remote-ui/module-assets/') ? '/tests/fixtures/' + u.pathname.slice('/api/remote-ui/module-assets/'.length) : u.pathname;
  const f = new URL('.' + p, ROOT);
  if (!existsSync(f)) return new Response('', { status: 404 });
  const type = u.pathname.endsWith('.json') ? 'application/json' : 'application/javascript';
  return new Response(readFileSync(f), { headers: { 'Content-Type': type } });
});

import { installCanvasStub } from './ctxstub.mjs';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./web_ui.html', ROOT), 'utf8');
const warns = [];
const dom = new JSDOM(html, {
  url: 'http://localhost:8199/web_ui.html#screen', runScripts: 'dangerously',
  resources: { interceptors: [fromDisk] }, pretendToBeVisual: true, beforeParse(w) {
    installCanvasStub(w);
    w.EventSource = class { addEventListener() {} close() {} };   /* the live stream is not under test */
    /* jsdom has no fetch: the page's own requests go to the same disk mapping */
    w.fetch = async (url) => {
      const u = new URL(url, 'http://localhost:8199/web_ui.html');
      const p = u.pathname.startsWith('/api/remote-ui/module-assets/') ? '/tests/fixtures/' + u.pathname.slice('/api/remote-ui/module-assets/'.length) : u.pathname;
      const f = new URL('.' + p, ROOT);
      if (!existsSync(f)) return { ok: false, status: 404, text: async () => '', json: async () => null };
      const body = readFileSync(f, 'utf8');
      return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
    };
    const cw = w.console.warn.bind(w.console);
    w.console.warn = (...a) => { warns.push(a.map(String).join(' ')); cw(...a); };
  }
});
const { window } = dom;
for (let i = 0; i < 100 && typeof window.chainParams !== "object"; i++) await new Promise(r => setTimeout(r, 100));
await new Promise(r => setTimeout(r, 1500));
const loaded = { core: window.eval('typeof R !== "undefined"'), hud: !!window.HUD && typeof window.HUD.showFixture === 'function',
                 sound: typeof window.renderSound === "function" };
const missing = Object.keys(loaded).filter(k => !loaded[k]);
if (missing.length) { console.log("HARNESS: script drop — " + missing.join(", ")); process.exit(2); }

const d = window.document, H = window.HUD;
const out = {}, fails = [];
const ok = (n, c, x) => { out[n] = c ? "PASS" : ("FAIL " + (x === undefined ? "" : x)); if (!c) fails.push(n); };
const idx = JSON.parse(readFileSync(new URL('./hud_fixtures/index.json', import.meta.url), 'utf8'));
ok('the Screen view is on', d.getElementById('screenview').classList.contains('on'));
ok('fixtures loaded', idx.length >= 100, idx.length);

const render = (slug) => { const i = idx.findIndex((x) => x.slug === slug);
  H.doc = null; H.setDoc(JSON.parse(readFileSync(new URL('./hud_fixtures/' + slug + '.json', import.meta.url), 'utf8'))); H.render();
  return d.querySelector('#hudfit .hud-screen'); };

let empty = [];
for (const f of idx) {
  const el = render(f.slug);
  const body = el && el.querySelector('.hud-body');
  if (!el || !body) { empty.push(f.slug + ':noscreen'); continue; }
  if (!el.querySelector('.hud-status')) empty.push(f.slug + ':nostatus');
}
ok('every recorded screen renders a screen with a status strip', !empty.length, empty.slice(0, 8).join(' '));
ok('no renderer threw on any of them', !warns.some((w) => /screen view: .* failed/.test(w)), warns.filter((w) => /failed/.test(w)).slice(0, 3).join(' | '));

/* a kit page with a knob touched (editor views draw these; on Track view the
 * touch now stays on the overview, below) — built from the recorded touch */
const kt = JSON.parse(readFileSync(new URL('./hud_fixtures/bank-knob-touched.json', import.meta.url), 'utf8'));
const kitDoc = { v: 1, where: Object.assign({}, kt.where, { screen: 'track.bank' }), touch: kt.touch,
                 body: { header: Object.assign({ text: 'NOTE FX' }, kt.knobs.header), knobs: kt.knobs.knobs, touched: kt.knobs.touched }, knobMeta: kt.knobs.meta };
H.doc = null; H.setDoc(kitDoc); H.render();
let el = d.querySelector('#hudfit .hud-screen');
ok('a bank page: one row of eight cells', el.querySelectorAll('.hud-knobs .hud-kn').length === 8);
ok('...the touched knob names the header', /Octave Shift/.test(el.querySelector('.hud-header').textContent));
ok('...its range on the right', /−?-?4\s*–\s*\+4/.test(el.querySelector('.hud-header .r') ? el.querySelector('.hud-header .r').textContent : ''), el.querySelector('.hud-header').textContent);
ok('...its neighbouring options under it', !!el.querySelector('.hud-kn.tch .hud-a-opts'));
ok('...the touched knob LIT in its colour, the others not dimmed (Josh: "better to highlight active knobs than dim inactive ones")',
   !!el.querySelector('.hud-kn.tch[style*="--kc"]') && !el.querySelector('.hud-kn.dim') && el.querySelectorAll('.hud-kn.tch').length === 1);
el = render('quit-confirm');
ok('a confirm: the question as a sentence, two buttons, one selected', /Quit dAVEBOx\?/.test(el.querySelector('.hud-prompt .q').textContent) &&
   el.querySelectorAll('.hud-btn').length === 2 && el.querySelectorAll('.hud-btn.sel').length === 1, el.querySelector('.hud-prompt') && el.querySelector('.hud-prompt').textContent);
el = render('menu-project-settings');
ok('a menu: one column, more than the OLED\'s rows, the selection lit, a scroll position', el.querySelectorAll('.hud-row:not(.gap)').length >= 7 &&
   !el.querySelector('.hud-list.cols') && !!el.querySelector('.hud-row.sel') && !!el.querySelector('.hud-scroll'), el.querySelectorAll('.hud-row:not(.gap)').length);
ok('...its dividers drawn as rules, never at the window\'s edge', el.querySelectorAll('.hud-row.div').length >= 2 &&
   !el.querySelector('.hud-list > .hud-row:first-child.div') && !el.querySelector('.hud-list > .hud-row.div + .hud-scroll'));
/* the bank pad map: the PADS, in the colours the device lights them (doc.pads, its own painter) */
{
  const doc = JSON.parse(readFileSync(new URL('./hud_fixtures/bank-overview-walk.json', import.meta.url), 'utf8'));
  const P = doc.pads || {};
  ok('the bank map document carries all 32 pads, colours and names', Array.isArray(P.colors) && P.colors.length === 32 && Array.isArray(P.cells) && P.cells.length === 32 &&
     P.cells.some((c) => c && c.module && c.sub) && P.colors.includes(120), JSON.stringify(P).slice(0, 120));
  const em = render('bank-overview-walk');
  const pads = em ? [...em.querySelectorAll('.hud-pads .pad')] : [];
  const lit = pads.filter((p) => p.classList.contains('lit'));
  ok('...drawn as a grid of 32 pads, lit in their LED colours, the current one White, module pads with their module',
     pads.length === 32 && lit.length === P.colors.filter((v) => v).length && lit.every((p) => /background/.test(p.getAttribute('style') || '')) &&
     pads.filter((p) => p.classList.contains('cur')).length === 1 && !!em.querySelector('.hud-pads .pad.mod .ps') &&
     window.getComputedStyle(em.querySelector('.hud-pads')).display === 'grid', pads.length + ' pads, ' + lit.length + ' lit');
  const instPad = pads.find((p) => !p.classList.contains('mod') && /^inst$/i.test(((p.querySelector('.pl') || {}).textContent || '').trim()));
  ok('...the left 4x4\'s Inst pad names the instrument too, as the Instrument slot does', !!instPad && /\S/.test((instPad.querySelector('.ps') || {}).textContent || ''),
     instPad ? instPad.textContent : 'no Inst pad');
  const dm = render('bank-overview-drum');
  const jt = dm && dm.querySelector('.hud-pads .pad.jt'), jb = dm && dm.querySelector('.hud-pads .pad.jb');
  ok('...two pads that belong together touch as one box, each keeping its own name (Drum lane over All lanes)',
     !!jt && !!jb && dm.querySelectorAll('.hud-pads .pad').length === 32 && /drum lane/i.test(jt.textContent) && /all lanes/i.test(jb.textContent),
     (jt ? jt.textContent : '-') + ' / ' + (jb ? jb.textContent : '-'));
  /* the palette is the device's: every entry of constants.mjs's table */
  const tbl = readFileSync(new URL('../../../src/shared/constants.mjs', import.meta.url), 'utf8');
  const blk = tbl.slice(tbl.indexOf('RGB COLOR PALETTE'), tbl.indexOf('*/', tbl.indexOf('RGB COLOR PALETTE')));
  const want = {};
  for (const m of blk.matchAll(/(\d+)\s*:\s*#([0-9A-Fa-f]{6})/g)) want[+m[1]] = m[2].toLowerCase();
  for (const m of blk.matchAll(/(?:dim|dark)\s+(\d+)\s+#([0-9A-Fa-f]{6})/g)) want[+m[1]] = m[2].toLowerCase();
  const bad = Object.keys(want).filter((i) => H.ledPalette[i] !== want[i]);
  ok('the pad palette is constants.mjs\'s, all 128', Object.keys(want).length === 128 && H.ledPalette.length === 128 && !bad.length, bad.slice(0, 5).join(','));
}
/* the hints: a footer bar, its words at full size — the editor page's own .hint
 * (11px, faint) once shrank them, unseen, by sharing the class name */
{
  const em = render('bank-clip'), bar = em && em.querySelector('.hud-hints'), w = bar && bar.querySelector('.hud-hint');
  const cs = w ? window.getComputedStyle(w) : null;
  ok('the hints are a footer bar, words at full size and capitalised', !!bar && !!w && !em.querySelector('.hud-hints .hint') && cs.fontSize === '20px' && /^[A-Z]/.test(w.querySelector('.w').textContent) &&
     window.getComputedStyle(bar).borderTopStyle === 'solid', cs ? cs.fontSize : 'no hint');
}
/* the OVERVIEWS (web_ui_hud_overview.js): a track's clip as a roll from the
 * editor's model once it follows the device; the session as a clip grid with
 * the device's knob values */
{
  const saveM = window.eval('M');
  const fx = (slug) => JSON.parse(readFileSync(new URL('./hud_fixtures/' + slug + '.json', import.meta.url), 'utf8'));
  const tr = Array.from({ length: 8 }, (_, t) => ({ pm: t === 1 ? 1 : 0, ac: 0, qc: -1, pl: 1, has: Array.from({ length: 16 }, (_, c) => c < 3), mute: 0, solo: 0 }));
  const setM = (m) => { window.__M = m; window.eval('M = window.__M'); };
  const draw = (doc) => { H.doc = null; H.setDoc(doc); H.render(); return d.querySelector('#hudfit .hud-screen'); };
  const mel = fx('track-melodic-playing');
  setM({ sel: { t: mel.where.track, c: mel.where.clip, lane: -1 }, clip: { len: 32, tps: 24, ls: 0 }, glob: { key: 9, scaleAware: true }, scaleMask: [1,0,1,1,0,1,0,1,1,0,1,0].map(Boolean),
         notes: [{ tick: 0, pitch: 57, vel: 100, gate: 24 }, { tick: 96, pitch: 60, vel: 80, gate: 48 }, { tick: 400, pitch: 64, vel: 127, gate: 24 }], tracks: tr, dnotes: {}, dlanes: [] });
  let e = draw(mel);
  const notes = e ? e.querySelectorAll('.hud-o-roll rect[rx="3"]').length : 0;
  ok('track overview: the clip as a piano roll — its notes, the viewed page outlined, the playhead', notes === 3 &&
     !!e.querySelector('.hud-o-roll rect[stroke="#4da3ff"]') && !!e.querySelector('.hud-o-roll line[stroke="#ffcf4d"]') &&
     !!e.querySelector('.hud-o-info .k.u'), notes + ' notes');
  /* THE KNOBS, ALWAYS (Josh, 2026-11-08): the bank's eight knobs as a strip
   * under the roll, which gives up the track list (the status pips have it) */
  ok('...the bank\'s eight knobs under it, always, in place of the track list', e.querySelectorAll('.hud-o-knobs .hud-kn').length === 8 &&
     /CLIP/i.test(e.querySelector('.hud-o-kh').textContent) && !e.querySelector('.hud-o-tl') && !e.querySelector('.hud-o-knobs .hud-kn.tch'),
     e.querySelectorAll('.hud-o-knobs .hud-kn').length + ' cells');
  ok('...the row names an HTML column (readable, not squashed with the roll)', !!e.querySelector('.hud-o-rollbox .hud-o-keys span') && !e.querySelector('.hud-o-roll text'));
  /* a knob touched on Track view: the screen stays the overview, the knob lit */
  {
    const touchedDoc = fx('bank-knob-touched');
    const e2 = draw(Object.assign({}, touchedDoc, { where: Object.assign({}, touchedDoc.where, { track: mel.where.track, clip: mel.where.clip }) }));
    const lit = e2.querySelectorAll('.hud-o-knobs .hud-kn.tch');
    ok('a knob touched on Track view keeps the overview: the roll stays, the touched knob lit, named, no range readout, none dimmed',
       touchedDoc.where.screen === 'track.overview' && !!e2.querySelector('.hud-o-roll') && lit.length === 1 && lit[0] === e2.querySelectorAll('.hud-o-knobs .hud-kn')[touchedDoc.knobs.touched] &&
       /Octave Shift/.test(e2.querySelector('.hud-o-kh').textContent) && !/–/.test(e2.querySelector('.hud-o-kh').textContent) && !e2.querySelector('.hud-a-range') && !e2.querySelector('.hud-kn.dim'),
       touchedDoc.where.screen + ' / ' + (e2.querySelector('.hud-o-kh') || {}).textContent);
    ok('...and the strip keeps its bank\'s name over the touched knob\'s', /NOTE FX bank/i.test(e2.querySelector('.hud-o-kh .bk').textContent),
       (e2.querySelector('.hud-o-kh .bk') || {}).textContent);
    /* the MIX bank's page is Sound view's card: a touch there stays put too */
    const mixDoc = fx('sound-card');
    const e3 = draw(Object.assign({}, mixDoc, { where: Object.assign({}, mixDoc.where, { track: mel.where.track, clip: mel.where.clip }) }));
    ok('a touch on the MIX bank keeps the overview the same way: MIX named, Volume lit',
       mixDoc.where.screen === 'track.overview' && !!e3.querySelector('.hud-o-roll') && /MIX bank/i.test(e3.querySelector('.hud-o-kh .bk').textContent) &&
       /Volume/.test(e3.querySelector('.hud-o-kh b').textContent) && e3.querySelectorAll('.hud-o-knobs .hud-kn.tch').length === 1,
       mixDoc.where.screen + ' / ' + (e3.querySelector('.hud-o-kh') || {}).textContent);
    /* Josh, 2026-11-09 — the knob strip's second pass */
    const at = (doc) => Object.assign({}, doc, { where: Object.assign({}, doc.where, { track: mel.where.track, clip: mel.where.clip }) });
    const cropDoc = fx('bank-crop-touched'), e4 = draw(at(cropDoc));
    const hint0 = e4.querySelector('.hud-hints .hud-hint');
    ok('a touched button knob: the footer says what a click does first (Click Crop)', !!hint0 && /click/i.test(hint0.textContent) && /crop/i.test(hint0.textContent),
       (e4.querySelector('.hud-hints') || {}).textContent);
    const cells4 = e4.querySelectorAll('.hud-o-knobs .hud-kn');
    ok('...a button knob is drawn as a button, not as "->"', !!cells4[5].querySelector('.hud-w-btn') && !/->/.test(e4.querySelector('.hud-o-knobs').textContent),
       e4.querySelector('.hud-o-knobs').textContent);
    ok('...and a knob a click does something on wears corner marks', cells4[5].classList.contains('opens') && !cells4[1].classList.contains('opens'),
       [...cells4].map((c) => c.className).join(' | '));
    const kc = new Set([0, 3, 7].map((k) => H.knobColor(k)));
    ok('every knob of a Track view page wears its track\'s colour, one colour', kc.size === 1 && [...kc][0] === window.eval('trackColor(' + (mel.where.track | 0) + ')'), [...kc].join());
    const ses = draw(fx('session-mixer-pan'));
    ok('...while Session view\'s eight (eight tracks) keep their own', new Set([0, 3, 7].map((k) => H.knobColor(k))).size === 3);
    ok('a list knob with no fill turns to its option (1/16 of six: a fifth of the way)', Math.abs(H.normOf({ options: ['a', 'b', 'c', 'd', 'e', 'f'], sel: 1 }) - 0.2) < 1e-9 &&
       H.normOf({ norm: 0.7, options: ['a', 'b'], sel: 0 }) === 0.7);
    const mu = draw(at(fx('macros-unassigned-touched')));
    ok('an unassigned macro touched: the footer says a click assigns it', /assign/i.test((mu.querySelector('.hud-hints .hud-hint') || {}).textContent || ''),
       (mu.querySelector('.hud-hints') || {}).textContent);
    const au = draw(at(fx('track-audio')));
    ok('an Audio track keeps the overview, its bank\'s knobs under it', !!au.querySelector('.hud-o-track') && au.querySelectorAll('.hud-o-knobs .hud-kn').length === 8,
       (au.querySelector('.hud-body') || {}).className);
    /* Audio / Slicer waveforms (Josh, 2026-11-09) */
    const ap = draw(at(fx('track-audio-playing')));
    const aph = ap.querySelector('.hud-o-wave line.hud-w-ph');
    ok('an Audio track\'s overview waveform carries the playhead', !!aph && Math.abs(+aph.getAttribute('data-dev') - 0.175) < 0.01, aph ? aph.outerHTML.slice(0, 120) : 'none');
    const sp = draw(fx('sample-loop'));
    const spCells = [...sp.querySelectorAll('.hud-wknobs .hud-kn')].map((c) => (c.querySelector('.l') || {}).textContent || '');
    ok('SAMPLE shows every knob under its waveform: Start, Zoom, Length, Gain, Pitch, Detune, Tempo, Reverse',
       !!sp.querySelector('.hud-wavebox svg.hud-wave') && spCells.length === 8 && /start/i.test(spCells[0]) && /zoom/i.test(spCells[1]) && /length/i.test(spCells[2]) && /rev/i.test(spCells[7]),
       spCells.join(','));
    ok('...and the playhead on it', !!sp.querySelector('.hud-wavebox line.hud-w-ph'));
    const sp2 = draw(fx('sample-loop-p2'));
    ok('SAMPLE page 2 keeps the waveform over its knobs', !!sp2.querySelector('.hud-wavebox svg.hud-wave rect') && /sync/i.test((sp2.querySelector('.hud-wknobs .hud-kn .l') || {}).textContent || ''),
       (sp2.querySelector('.hud-body') || {}).className);
    const sl = draw(fx('slices-slicer'));
    const slCells = [...sl.querySelectorAll('.hud-wknobs .hud-kn')].map((c) => (c.querySelector('.l') || {}).textContent || '');
    ok('SLICES shows the slice\'s Start and End and its own sound under the waveform', slCells.length === 8 && /start/i.test(slCells[0]) && /end/i.test(slCells[2]) && !!sl.querySelector('.hud-wavebox svg.hud-wave'),
       slCells.join(','));
    /* pop-ups stay pop-ups (Josh, 2026-11-09): a card over the page, the page still drawn */
    const vp = draw(at(fx('bank-value-popup')));
    const vpRows = [...vp.querySelectorAll('.hud-ovl .card.c-list .hud-row')].map((r) => r.textContent);
    ok('an enum knob\'s picker is a card over the overview, titled by its knob', !!vp.querySelector('.hud-o-track') && vpRows.slice(0, 3).join() === 'Off,Up,Down' &&
       /style/i.test((vp.querySelector('.hud-ovl .card .t') || {}).textContent || '') && /Down/.test((vp.querySelector('.hud-ovl .hud-row.sel') || {}).textContent || ''),
       vpRows.join(',') + ' / ' + ((vp.querySelector('.hud-ovl .card .t') || {}).textContent));
    const ipk = draw(fx('instrument-picker'));
    ok('...a Sound menu picker over the menu, one column', !!ipk.querySelector('.hud-body.hud-l-list .hud-row') && !!ipk.querySelector('.hud-ovl .card.c-list') &&
       !ipk.querySelector('.hud-ovl .hud-list.cols') && /Instmt/.test((ipk.querySelector('.hud-body') || {}).textContent || ''),
       (ipk.querySelector('.hud-body') || {}).className);
    ok('...its note rows drawn as notes, not gaps', [...ipk.querySelectorAll('.hud-ovl .hud-row.note')].some((r) => /^Move 1 - T\d$/.test(r.textContent)));
    const lcd = draw(fx('sound-level-card'));
    ok('...a level card over the menu', !!lcd.querySelector('.hud-body.hud-l-list') && /LEVEL/.test((lcd.querySelector('.hud-ovl .card.c-big') || {}).textContent || ''),
       (lcd.querySelector('.hud-body') || {}).className);
    /* AUTOMATION (Josh, 2026-11-09) */
    const la = draw(fx('automation-lanes'));
    const laRows = [...la.querySelectorAll('.hud-lanes .hud-lane')].map((r) => (r.querySelector('.nm') || {}).textContent);
    const laHeads = [...la.querySelectorAll('.hud-lanes .hud-lane-g')].map((g) => g.textContent);
    ok('AUTOMATION: every lane in the OLED\'s order, headed by where it lives', laRows.join() === 'Mix,Volume,Cutoff,Resonance,Aftertouch' &&
       laHeads.join('|') === 'Freeverb · FX 1|Levels|NuSaw|Pads', laRows.join() + ' / ' + laHeads.join('|'));
    ok('...each with its curve and the OLED\'s value, a muted one dimmed and dashed', la.querySelectorAll('.hud-lane svg path').length === 4 &&
       la.querySelector('.hud-lane.off path[stroke-dasharray]') && /OFF/.test(la.querySelector('.hud-lane.off .v').textContent));
    const laPh = [...la.querySelectorAll('line.hud-lane-ph')];
    ok('...and a playhead on every playing lane, each at its own speed', laPh.length === 3 && laPh.map((l) => +l.getAttribute('data-spd')).sort((x, y) => x - y).join() === '0.5,1,4',
       laPh.map((l) => l.getAttribute('data-spd')).join());
    ok('...which glides from where it was reported (wrapping at the loop end)', Math.abs(H.laneGlideX(0.9, 4, 0.05) - 0.1 * 900) < 0.5 && Math.abs(H.laneGlideX(0.25, 0.5, 0.5) - 0.5 * 900) < 0.5);
    const ld = draw(fx('automation-lane-detail'));
    ok('a lane selected: the list beside it, the lane large — its points, the step buttons, its settings, its value now',
       !!ld.querySelector('.hud-lane.sel') && /Cutoff/.test(ld.querySelector('.hud-lane.sel').textContent) &&
       !!ld.querySelector('.hud-lane-detail svg.hud-lane-big path') && ld.querySelectorAll('.hud-lane-detail .hud-lane-pt').length === 4 &&
       ld.querySelectorAll('.hud-lane-steps i').length === 16 && ld.querySelectorAll('.hud-lane-detail .hud-chip').length === 5 &&
       /\d+%/.test((ld.querySelector('.hud-lane-detail .now') || {}).textContent || '') && /100%/.test((ld.querySelector('.hud-lane-detail .ax') || {}).textContent || ''),
       (ld.querySelector('.hud-body') || {}).className);
    ok('...+ Add lane and Clear all kept, as on the OLED', /Add lane/.test(ld.textContent) && /Clear all/.test(ld.textContent));
    const lo = draw(fx('automation-lane-ops'));
    ok('a lane\'s ops: a card beside the lanes, named for its lane, the lane still drawn', !!lo.querySelector('.hud-ovl.left .card') &&
       /NuSaw · Cutoff/.test((lo.querySelector('.hud-ovl .card .t') || {}).textContent || '') && !!lo.querySelector('.hud-body .hud-lane-detail') &&
       !lo.querySelector('.hud-ovl .hud-wavebox'), (lo.querySelector('.hud-ovl .card .t') || {}).textContent);
    const lh = draw(at(fx('automation-hold-jump')));
    ok('holding a lane\'s step: the parameter\'s page stays, the lane\'s page above it, the held value in its units — no card',
       !!lh.querySelector('.hud-body .hud-lane-strip') && !lh.querySelector('.hud-ovl') && !!lh.querySelector('.hud-o-track') &&
       /Volume/.test(lh.querySelector('.hud-lane-strip').textContent) && /\+10\.1/.test(lh.querySelector('.hud-lane-strip .now').textContent),
       (lh.querySelector('.hud-lane-strip') || {}).textContent);
    const bea = draw(fx('block-editor-automated'));
    const autoMarks = [...bea.querySelectorAll('.hud-a-auto')].map((x) => x.textContent);
    ok('a module editor\'s automated knobs are marked: AUTO, and AUTO OFF for a muted lane', autoMarks.indexOf('AUTO') >= 0 && autoMarks.indexOf('AUTO OFF') >= 0, autoMarks.join());
    /* no strip (a bank whose knobs do nothing here): the track list stays */
    const bare = JSON.parse(JSON.stringify(mel)); delete bare.knobs;
    ok('...and with no knob page, the eight tracks as before', draw(bare).querySelectorAll('.hud-o-tl .row').length === 8);
  }
  /* the playhead GLIDES between the device's reports (a few a second): from
   * the editor's clock, not step by step (Josh, 2026-11-08: "playhead in
   * screen mode on clip overview is really choppy") */
  {
    const line = e.querySelector('.hud-o-roll line.hud-o-ph');
    window.eval('phPlaying = true; phBpm = 120; phTgtDev = 0; phTgtTick = 200; phTgtT = now(); phEst = 200; phEstT = now();');
    const gx = H.glideX(line), x0 = +line.getAttribute('data-x0'), sx = +line.getAttribute('data-sx');
    const want = x0 + (window.eval('phTickNow()') / 24) * sx;
    ok('...its playhead glides from the editor\'s clock: between steps, not on one', gx != null && Math.abs(gx - want) < sx * 0.2 && Math.abs(((gx - x0) / sx) % 1 - 0.5) > 0.05,
       gx + ' vs ' + want);
    /* a frame later the line has moved on by itself (time passing, simulated:
     * the clock's anchors pushed 100 ms into the past), the roll not redrawn */
    e = draw(mel);
    const ln = e.querySelector('.hud-o-roll line.hud-o-ph'), a1 = +ln.getAttribute('x1');
    window.eval('phTgtT -= 100; phEstT -= 100;');
    const moved = H.glideOnce(), a2 = +ln.getAttribute('x1');
    ok('...and moves by itself between reports, the roll not redrawn', moved && a2 > a1 && e.querySelector('.hud-o-roll line.hud-o-ph') === ln, a1 + ' → ' + a2);
    ok('...a repaint draws it where it is now, not back on the step', Math.abs(a1 - (x0 + (200 / 24) * sx)) < sx * 0.3, a1);
    window.eval('phPlaying = false;');
    ok('...stopped, it stays where the device says', H.glideX(line) === null);
  }
  const drm = fx('track-drum');
  setM({ sel: { t: drm.where.track, c: drm.where.clip, lane: drm.where.lane }, clip: { len: 16, tps: 24, ls: 0 }, laneInfo: { len: 16, tps: 24, ls: 0 }, glob: { key: 0 }, scaleMask: null, notes: [], tracks: tr,
         dnotes: { 0: [{ tick: 0, vel: 100 }, { tick: 96, vel: 100 }], 3: [{ tick: 48, vel: 90 }] }, dlanes: Array.from({ length: 32 }, (_, i) => ({ note: 36 + i, tps: 24, ls: 0, len: 16 })) });
  e = draw(drm);
  ok('...on a drum track, its lanes as rows, hits in them, the device\'s lane marked', !!e && e.querySelectorAll('.hud-o-roll rect[rx="3"]').length === 3 &&
     !!e.querySelector('.hud-o-keys span.hi') && /C1|D#1/.test(e.querySelector('.hud-o-keys').textContent), (e && e.querySelector('.hud-o-keys') || {}).textContent);
  setM({ sel: { t: (mel.where.track + 1) % 8, c: 0, lane: -1 }, clip: { len: 16, tps: 24, ls: 0 }, notes: [], tracks: tr, dnotes: {}, dlanes: [] });
  e = draw(mel);
  ok('...and says it is reading the clip while the editor is on another one, never drawing the wrong clip', !!e && !!e.querySelector('.hud-o-wait') && !e.querySelector('.hud-o-roll'));
  /* follow: the Screen view points the editor at the device's track / clip */
  const calls = []; const saveSel = window.eval('selectClip');
  window.__spy = (t, c) => calls.push(t + ':' + c); window.eval('selectClip = window.__spy');
  window.hudShow(true); H.follow(mel); window.hudShow(false);
  window.__restore = saveSel; window.eval('selectClip = window.__restore');
  ok('...the Screen view makes the editor follow the device\'s track and clip', calls.length === 1 && calls[0] === mel.where.track + ':' + mel.where.clip, calls.join(','));
  setM({ sel: { t: 0, c: 0, lane: -1 }, clip: { len: 16, tps: 24, ls: 0 }, notes: [], tracks: tr, dnotes: {}, dlanes: [] });
  const ses = fx('session-overview');
  e = draw(ses);
  const cards = e ? e.querySelectorAll('.hud-o-grid .cc').length : 0;
  ok('session overview: the clip grid (the pads\' rows lit), clip thumbnails, the knob mode\'s eight values', cards >= 32 && cards % 8 === 0 &&
     e.querySelectorAll('.hud-o-grid .rl.on').length === 4 && e.querySelectorAll('.hud-o-grid .cc.has').length > 0 && !!e.querySelector('.hud-o-grid .th16') &&
     e.querySelectorAll('.hud-o-mix .mx').length === 8 && !!e.querySelector('.hud-o-info .tab.on'), cards + ' cards');
  /* the grid's clip states come from the device (what the pads light), not the
   * editor's snapshot: a clip queued while stopped, an Audio clip */
  const sesQ = JSON.parse(JSON.stringify(ses)); sesQ.ovw.rowOff = 0;
  sesQ.ovw.clips = Array.from({ length: 8 }, (_, t) => ({ has: t === 3 || t === 4 ? 1 : 0, ac: 0, pl: t === 4 ? 1 : 0, q: t === 3 ? 0 : -1, rl: t === 0 ? 1 : 0 }));
  e = draw(sesQ);
  const rowA = e ? [...e.querySelectorAll('.hud-o-grid .cc')].slice(0, 8) : [];
  ok('...its clips as the device lights them: one queued while stopped, one playing, none the device lacks, an empty one never waiting', rowA.length === 8 &&
     rowA[3].matches('.has.q') && rowA[4].matches('.has.pl') && !rowA[0].matches('.has, .q, .pl') && e.querySelectorAll('.hud-o-grid .cc.has').length === 2,
     rowA.map((c) => c.className).join('|'));
  e = draw(fx('session-muted'));
  ok('...a muted track as the device says', !!e && !!e.querySelector('.hud-o-grid .th.mute'));
  /* a knob touched on Session view: the overview stays (the OLED switches to
   * its mixer page), the touched track's dial lit and named */
  {
    const st = fx('session-mixer-touched'), k = st.knobs.touched;
    e = draw(st);
    const mx = e.querySelectorAll('.hud-o-mix .mx');
    ok('a knob touched on Session view keeps the overview: its dial lit, named in words, none dimmed',
       st.where.screen === 'session.overview' && !!e.querySelector('.hud-o-grid') && mx.length === 8 && mx[k].matches('.tch') &&
       e.querySelectorAll('.hud-o-mix .mx.tch').length === 1 && new RegExp('^T' + (k + 1) + ' ').test((e.querySelector('.hud-o-info .kt') || {}).textContent || ''),
       st.where.screen + ' k=' + k + ' ' + ((e.querySelector('.hud-o-info .r') || {}).textContent || ''));
  }
  setM(saveM);
}
/* the editor's Screen view pops out into a window of its own (web_ui_hud_app.js) */
{
  const pop = [...d.querySelectorAll('#screenview .hud-appbtn')].find((b) => /pop out/i.test(b.textContent));
  const opened = []; const saveOpen = window.open;
  window.open = (url, name, feat) => { opened.push([url, name, feat]); return null; };
  if (pop) pop.click();
  window.open = saveOpen;
  const u = opened[0] ? new URL(opened[0][0], 'http://localhost:8199/') : null;
  ok('the editor\'s Screen view has Pop out: the screen alone in a window of its own', !!pop && opened.length === 1 && u.searchParams.get('screen') === '1' &&
     opened[0][1] === 'davebox-screen' && /popup/.test(opened[0][2]), JSON.stringify(opened));
  ok('...and the editor itself does not offer to install as the screen', !d.querySelector('link[rel="manifest"]'));
}
/* the editor pops out into a window of its own (web_ui_app.js) */
{
  const opened = []; const saveOpen = window.open;
  window.open = (url, name, feat) => { opened.push([url, name, feat]); return null; };
  const shownEl = (id) => window.getComputedStyle(d.getElementById(id)).display !== 'none';
  d.getElementById('popEditor').click();
  window.open = saveOpen;
  const u = opened[0] ? new URL(opened[0][0], 'http://localhost:8199/') : null;
  ok('the editor has Pop out: the editor alone (?app=1, its view kept) in a window of its own', opened.length === 1 && u.searchParams.get('app') === '1' &&
     !u.searchParams.has('screen') && u.hash === window.location.hash && opened[0][1] === 'davebox-editor' && /popup/.test(opened[0][2]), JSON.stringify(opened));
  ok('...and the page in the browser keeps its site ribbon and the button', shownEl('site') && shownEl('popEditor') && !d.body.classList.contains('app-window'));
}
/* notices and dialog buttons: drawn straight to the OLED once, now described */
{
  const fx = (slug) => JSON.parse(readFileSync(new URL('./hud_fixtures/' + slug + '.json', import.meta.url), 'utf8'));
  let e = render('notice-undo');
  ok('a notice card is drawn over the screen (Undo)', !!e && !!e.querySelector('.hud-ovl .hud-notice') && /undo/i.test(e.querySelector('.hud-notice').textContent));
  e = render('record-blocked');
  ok('a dialog\'s own buttons (Rec unavailable: OK / Bake now)', !!e && e.querySelectorAll('.hud-btn').length === 2 && /bake/i.test(e.textContent));
  e = render('capture-place');
  ok('a prompt keeps its hints in the footer (Captured take: Back exit)', !!e && /exit/i.test((e.querySelector('.hud-hints') || {}).textContent || ''));
}
el = render('session-mixer-pan');
ok('the session mixer (a turn, nothing touched): the session overview with its eight dials', !!el.querySelector('.hud-o-grid') && el.querySelectorAll('.hud-o-mix .mx').length === 8);

/* a module's own widgets: its canvas.js is fetched and its drawers run, none throws */
{
  const k = (key, name, kind, extra) => Object.assign({ kind, key, label: name, name, text: '' }, extra);
  H.doc = null;
  H.setDoc({ v: 1, seq: 99999, where: { screen: 'sound.params', track: 0, clip: 0, bank: 0 }, body: { primary: 'knobs', module: 'widget-test',
    header: { text: 'WIDGET TEST' }, touched: -1,
    knobs: [k('mode', 'Mode', 'enumsq', { raw: 1, options: ['Low', 'Mid', 'High'], sel: 1 }), k('level', 'Level', 'arc', { raw: 0.6, norm: 0.6 }), null, null, null, null, null, null],
    viz: [{ kind: 'custom:wtmode', roles: { value: 'mode' }, keys: ['mode'], slotStart: 0, slotSpan: 1 },
          { kind: 'custom:wtmeter', roles: { value: 'level' }, keys: ['level'], slotStart: 1, slotSpan: 1 }] } });
  H.render();
  for (let i = 0; i < 40 && H.customWidgetState('widget-test') === 'loading'; i++) await new Promise((r) => setTimeout(r, 50));
  H.render();
  ok('a module\'s canvas.js loads and its widgets draw', H.customWidgetState('widget-test') === 'ok' &&
     d.querySelectorAll('#hudfit canvas.hud-cw').length === 2, H.customWidgetState('widget-test'));
  ok('...without a drawer throwing', !warns.some((w) => /drawer threw/.test(w)), warns.filter((w) => /threw/.test(w)).join(' | '));
}

/* THE HANDS (web_ui_hud_input.js): a click sends the Move's own gesture —
 * exactly these packets, in this order — through the transport's surface()
 * (recorded by the mock shim). */
{
  const log = window.schwungRemote.surfaceLog;
  const fit = d.getElementById('hudfit');
  const ptr = (el, type, x, y, id, ptype, button) => {
    const e = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: button || 0 });
    Object.defineProperty(e, 'pointerId', { value: id || 1 }); Object.defineProperty(e, 'pointerType', { value: ptype || 'mouse' });
    el.dispatchEvent(e);
  };
  const tap = (el, id) => { ptr(el, 'pointerdown', 10, 10, id); ptr(el, 'pointerup', 10, 10, id); };
  const hex = (a) => a.map((p) => p.map((x) => x.toString(16).padStart(2, '0')).join(' ')).join(' | ');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const live = (sel) => fit.querySelector(sel);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  /* gestures are PACED (a press and its release never share a frame): let the queue drain */
  const settle = async () => { for (let i = 0; i < 200 && !H.surfaceIdle(); i++) await wait(5); };
  ok('the transport can carry gestures (mock surface())', typeof window.schwungRemote.surface === 'function');
  ok('...and no button bar under the screen (Josh: "we don\'t need the buttons")', !d.querySelector('#screenview .hud-ctl'));

  /* a knob: touched, turned by the drag (up = right, 5 px a detent), let go */
  render('bank-clip');
  let k = live('[data-in="knob"][data-k="2"]');
  ok('a knob page\'s knobs are live', fit.querySelectorAll('[data-in="knob"]').length >= 6);
  log.length = 0;
  ptr(k, 'pointerdown', 100, 100); ptr(fit, 'pointermove', 100, 80); ptr(fit, 'pointerup', 100, 80);
  await settle();
  ok('a knob dragged up 20 px: touch, four detents right, release', same(log, [[0x90, 2, 127], [0xB0, 73, 4], [0x80, 2, 0]]), hex(log));
  log.length = 0;
  ptr(live('[data-in="knob"][data-k="0"]'), 'pointerdown', 100, 100); ptr(fit, 'pointermove', 100, 110); ptr(fit, 'pointerup', 100, 110);
  await settle();
  ok('...dragged down 10 px: two detents left (126)', same(log, [[0x90, 0, 127], [0xB0, 71, 126], [0x80, 0, 0]]), hex(log));
  log.length = 0;
  ptr(live('[data-in="knob"][data-k="5"]'), 'pointerdown', 100, 100);
  render('bank-clip');   /* a frame arrives mid-drag: the stage is redrawn */
  ptr(fit, 'pointermove', 125, 100); ptr(fit, 'pointerup', 125, 100);
  await settle();
  ok('...a drag survives the screen redrawing under it (right 25 px = 5 detents)', same(log, [[0x90, 5, 127], [0xB0, 76, 5], [0x80, 5, 0]]), hex(log));
  /* Move's own screen in co-run (Josh, 2026-11-10: "maybe we just show the
   * mirrored move oled in the frame?" · "can we make the co-run mirror screens
   * match track color? and we should still show the knobs, just not labeled"):
   * the live frame in the track's colour, eight unlabeled knobs that take no
   * press — a browser press reaches this UI and the module, never Move */
  const pic = (body, screen, t) => { H.doc = null; H.setDoc({ v: 1, seq: 99990 + (t | 0), where: { screen, view: 'track', track: t | 0, clip: 0, bank: 0 }, body, touch: { knob: -1 } }); H.render(); };
  pic({ picture: { kind: 'move', knobs: 'shown' } }, 'co-run', 2);
  const mirror = fit.querySelector('canvas.hud-oled[data-oled]');
  ok('co-run: the Screen view draws the mirrored OLED', !!mirror, fit.innerHTML.slice(0, 160));
  ok('...in the track\'s colour (track 3 = ' + window.eval('trackColor(2)') + ')', mirror && mirror.dataset.col === window.eval('trackColor(2)'), mirror && mirror.dataset.col);
  /* ...and the drawer paints it in that colour (a recording context: the stub draws nothing) */
  const paint = (cv) => { cv.__ctx = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData(img) { cv.__img = img; } };
    const fr = new Uint8Array(1024); fr[0] = 1; H.setOled(fr, 'pages'); const px = cv.__img && cv.__img.data; return px ? [px[0], px[1], px[2], px[4], px[5], px[6]] : null; };
  const lit = paint(mirror);
  ok('...the mirror\'s lit pixels are drawn in it (#FFE000), the rest dark', lit && lit.slice(0, 3).join() === '255,224,0' && lit.slice(3).join() === '8,9,11', lit && lit.join());
  ok('...over eight unlabeled knobs', fit.querySelectorAll('.hud-knobs .hud-kn').length === 8 &&
     [...fit.querySelectorAll('.hud-knobs .hud-kn .l')].every((e) => !e.textContent.trim()) && !/\d/.test(fit.querySelector('.hud-knobs').textContent), fit.querySelector('.hud-knobs') && fit.querySelector('.hud-knobs').textContent);
  ok('...that take no press (Move cannot be reached from here)', fit.querySelectorAll('.hud-knobs [data-in], .hud-pic [data-in]').length === 0 &&
     ![...fit.querySelectorAll('[data-in]')].some((e) => e.dataset.in === 'knob'), [...fit.querySelectorAll('[data-in]')].map((e) => e.dataset.in).join(','));
  log.length = 0; ptr(fit.querySelector('.hud-knobs .hud-kn'), 'pointerdown', 100, 100); ptr(fit, 'pointermove', 100, 80); ptr(fit, 'pointerup', 100, 80); await settle();
  ok('...a drag on one sends nothing', log.length === 0, hex(log));
  /* the track buttons too: on the hardware Shift + jog goes to Move in co-run,
   * so a click here would switch our track behind Move's screen (device) */
  log.length = 0; const coPip = fit.querySelector('[data-in="track"][data-t="5"]');
  if (coPip) { ptr(coPip, 'pointerdown', 10, 10); ptr(coPip, 'pointerup', 10, 10); } await settle();
  ok('...and a track button sends nothing', !!coPip && log.length === 0, coPip ? hex(log) : 'no track button on the page');
  /* the colour is the co-run track's, not the focused one's */
  pic({ picture: { kind: 'move', knobs: 'shown', track: 0 } }, 'co-run', 2);
  ok('...coloured by the co-run track (1, red) when the focus is elsewhere (3)', fit.querySelector('canvas.hud-oled').dataset.col === window.eval('trackColor(0)'), fit.querySelector('canvas.hud-oled').dataset.col);
  /* a module's own canvas: its picture in the accent, and the same knobs, live */
  pic({ picture: { kind: 'module', caption: 'BeatBank', knobs: 'live' } }, 'sound.canvas-edit', 2);
  ok('a module canvas: its picture and caption, in the track\'s colour', !!fit.querySelector('canvas.hud-oled[data-oled]') &&
     fit.querySelector('canvas.hud-oled').dataset.col === window.eval('trackColor(2)') && /BeatBank/.test(fit.textContent), fit.querySelector('canvas.hud-oled') && fit.querySelector('canvas.hud-oled').dataset.col);
  ok('...with eight live knobs under it', fit.querySelectorAll('[data-in="knob"]').length === 8 &&
     [...fit.querySelectorAll('[data-in="knob"]')].every((e, i) => +e.dataset.k === i), fit.querySelectorAll('[data-in="knob"]').length);
  log.length = 0;
  ptr(live('[data-in="knob"][data-k="3"]'), 'pointerdown', 100, 100); ptr(fit, 'pointermove', 100, 90); ptr(fit, 'pointerup', 100, 90);
  await settle();
  ok('...a canvas knob turns: touch, two detents right, release', same(log, [[0x90, 3, 127], [0xB0, 74, 2], [0x80, 3, 0]]), hex(log));
  /* a page a module draws itself (Bouba-Kiki's Shape: type canvas, as_page):
   * its band of the live OLED over the page's knobs, which keep their names */
  const kn = (l) => ({ kind: 'arc', label: l, name: l, text: '0', norm: 0 });
  H.doc = null; H.setDoc({ v: 1, seq: 99980, where: { screen: 'sound.params', view: 'track', track: 1, clip: 0, bank: 0 }, touch: { knob: -1 },
    body: { primary: 'knobs', module: 'bouba-kiki', header: { text: 'BOUBA-KIKI', right: 'Shape' }, canvasBand: { x: 0, y: 12, w: 128, h: 40 },
            knobs: ['Morph', 'Bulge', 'Pinch', 'Spikes', 'Tilt', 'Wobble', 'Attack', 'Release'].map(kn),
            spans: { env: { start: 6, span: 2 } }, viz: [{ kind: 'envelope', roles: { attack: 'attack', release: 'release' }, keys: ['attack', 'release'], slotStart: 6, slotSpan: 2 }] } });
  H.render();
  const band = fit.querySelector('canvas.hud-band[data-band]');
  ok('a module-drawn page: its band of the OLED over the knobs', !!band && band.dataset.band === '0,12,128,40', band && band.dataset.band);
  ok('...the knobs keep their names and stay live', fit.querySelectorAll('[data-in="knob"]').length === 8 && /Morph/.test(fit.textContent) && /Release/.test(fit.textContent));
  ok('...and the band stands in for the parameters\' pictures (no envelope)', !fit.querySelector('.hud-viz, .hud-vizrow, [data-kind="envelope"]') && !/ENVELOPE/i.test(fit.textContent), fit.innerHTML.slice(0, 120));
  { const calls = []; let fs = ''; band.__ctx = { set fillStyle(v) { fs = v; }, fillRect: (x, y, w, h) => calls.push([x, y, fs]) };
    const fr = new Uint8Array(1024); fr[(20 >> 3) * 128 + 64] |= 1 << (20 & 7);   /* pixel (64,20): inside the band, at band row 8 */
    H.setOled(fr, 'pages');
    ok('...drawn from the live frame: the lit pixel lands at its place in the band', calls.length === 2 && calls[1][0] === 64 * 4 && calls[1][1] === 8 * 4, JSON.stringify(calls));
    ok('...in the track\'s colour (track 2 = ' + window.eval('trackColor(1)') + ')', calls.length === 2 && calls[1][2] === window.eval('trackColor(1)'), JSON.stringify(calls)); }
  /* a list page the module draws itself (MonkSynth's Face, its preset browser):
   * the band, large, and not the one-row list the controller holds behind it */
  H.doc = null; H.setDoc({ v: 1, seq: 99970, where: { screen: 'sound.params', view: 'track', track: 1, clip: 0, bank: 0 }, touch: { knob: -1 },
    body: { primary: 'band', module: 'monksynth', header: { text: 'MONKSYNTH', right: 'Face' }, page: { idx: 0, count: 6 }, canvasBand: { x: 4, y: 9, w: 120, h: 45 } } });
  H.render();
  const fb = fit.querySelector('canvas.hud-band[data-band]');
  ok('a module-drawn preset browser (Face): its band, large', !!fb && fb.dataset.band === '4,9,120,45' && parseInt(fb.style.width, 10) >= 600, fb && (fb.dataset.band + ' ' + fb.style.width));
  ok('...in the track\'s colour', fb && fb.dataset.col === window.eval('trackColor(1)'), fb && fb.dataset.col);
  /* ...even described the old way (a list as its main content, with the band) */
  H.doc = null; H.setDoc({ v: 1, seq: 99971, where: { screen: 'sound.params', view: 'track', track: 1, clip: 0, bank: 0 }, touch: { knob: -1 },
    body: { primary: 'list', list: { kind: 'list', total: 1, sel: -1, first: 0, rows: [{ label: 'Monk', value: '1 of 12' }] }, header: { text: 'MONKSYNTH', right: 'Face' }, canvasBand: { x: 4, y: 9, w: 120, h: 45 } } });
  H.render();
  ok('...a list page that carries a band is drawn as the band', !!fit.querySelector('canvas.hud-band[data-band]') && !/1 of 12/.test(fit.textContent), fit.innerHTML.slice(0, 160));
  ok('...and no list or knobs in its place', !fit.querySelector('.hud-list, .hud-rows, [data-in="knob"]') && !/Monk/.test(fit.querySelector('.hud-screen') ? fit.querySelector('.hud-screen').textContent.replace(/MONKSYNTH/, '') : ''), fit.innerHTML.slice(0, 160));
  /* a Dave: the picture alone, as before */
  pic({ picture: { kind: 'dave', caption: 'Dave' } }, 'dave-box', 2);
  ok('a picture without knobs is unchanged: no knob row, accent colour', !fit.querySelector('.hud-knobs') && !fit.querySelector('canvas.hud-oled').dataset.col);
  const davePx = paint(fit.querySelector('canvas.hud-oled'));
  ok('...drawn in the accent, as before', davePx && davePx.slice(0, 3).join() === '77,163,255', davePx && davePx.join());
  /* a knob that opens on the device (corner brackets): a click here is only a
   * touch — opening it is the Move's job, not the browser's */
  render('bank-crop-touched');
  const ck = [...fit.querySelectorAll('[data-in="knob"]')].find((e) => e.classList.contains('opens')) || live('[data-in="knob"]');
  log.length = 0; const kk = +ck.dataset.k; tap(ck);
  await settle();
  ok('a knob clicked is only touched and let go — never a jog click', same(log, [[0x90, kk, 127], [0x80, kk, 0]]), hex(log));
  ok('...no knob is marked for a click', !fit.querySelector('[data-click]'));

  /* the bank map's pads are pads */
  render('bank-overview-walk');
  const pads = fit.querySelectorAll('.hud-pads [data-in="pad"]');
  ok('the bank map\'s 32 pads are live', pads.length === 32, pads.length);
  const bl = [...pads].find((p) => p.style.gridRow === '5' && p.style.gridColumn === '1'), tr = [...pads].find((p) => p.style.gridRow === '2' && p.style.gridColumn === '8');
  ok('...bottom-left is note 68, top-right 99', bl && tr && bl.dataset.note === '68' && tr.dataset.note === '99', bl && bl.dataset.note + ' ' + (tr && tr.dataset.note));
  log.length = 0; ptr(bl, 'pointerdown', 0, 0, 7, 'touch'); ptr(fit, 'pointerup', 0, 0, 7, 'touch');
  await settle();
  ok('...a pad pressed and let go: its note on (100) and off', same(log, [[0x90, 68, 100], [0x80, 68, 0]]), hex(log));
  log.length = 0;
  for (const b of [2, 1]) { const pz = fit.querySelectorAll('.hud-pads [data-in="pad"]')[5]; ptr(pz, 'pointerdown', 0, 0, 20 + b, 'mouse', b); ptr(fit, 'pointerup', 0, 0, 20 + b, 'mouse', b); }
  await settle();
  ok('...a right or middle click presses no pad', log.length === 0, hex(log));
  log.length = 0;
  /* fresh: the stage redraws while a test waits, and an old node is no longer on it */
  const pads2 = fit.querySelectorAll('.hud-pads [data-in="pad"]'), p3 = +pads2[3].dataset.note, p12 = +pads2[12].dataset.note;
  ptr(pads2[3], 'pointerdown', 0, 0, 11, 'touch'); ptr(pads2[12], 'pointerdown', 0, 0, 12, 'touch');
  ptr(fit, 'pointerup', 0, 0, 12, 'touch'); ptr(fit, 'pointerup', 0, 0, 11, 'touch');
  await settle();
  ok('...two fingers, two pads, each released by its own finger',
     same(log, [[0x90, p3, 100], [0x90, p12, 100], [0x80, p12, 0], [0x80, p3, 0]]), hex(log));

  /* a track is Shift + the jog turned by the distance to it */
  render('bank-overview-walk');
  const cur = H.doc.where.track | 0, to = (cur + 3) % 8, dist = to - cur;
  log.length = 0; tap(live('.hud-pip[data-in="track"][data-t="' + to + '"]'));
  await settle();
  ok('a track pip: Shift, the jog by the distance, Shift up', same(log, [[0xB0, 49, 127], [0xB0, 14, dist > 0 ? dist : 128 + dist], [0xB0, 49, 0]]), hex(log));
  log.length = 0; tap(live('.hud-pip[data-in="track"][data-t="' + to + '"]'));
  await settle();
  ok('...clicked again before the screen shows it (a double click): nothing more — it does not go past', log.length === 0, hex(log));
  log.length = 0; tap(live('.hud-pip[data-in="track"][data-t="' + cur + '"]'));
  await settle();
  ok('...and the old track, still before the screen moves: back by the same distance, not from where the screen says',
     same(log, [[0xB0, 49, 127], [0xB0, 14, -dist > 0 ? -dist : 128 - dist], [0xB0, 49, 0]]), hex(log));
  log.length = 0; tap(live('.hud-pip[data-in="track"][data-t="' + cur + '"]'));
  await settle();
  ok('...the active track sends nothing', log.length === 0, hex(log));
  render('track-melodic-playing');
  ok('...a track overview\'s track rows are tracks too', fit.querySelectorAll('.hud-o-tl [data-in="track"]').length === 8 || !fit.querySelector('.hud-o-tl'),
     fit.querySelectorAll('.hud-o-tl [data-in="track"]').length);

  /* ...paced: each press and release a frame apart */
  {
    render('bank-overview-walk');
    const c2 = H.doc.where.track | 0;
    tap(live('.hud-pip[data-in="track"][data-t="' + ((c2 + 1) % 8) + '"]'));
    await settle();
    const at = window.schwungRemote.surfaceAt.slice(-3), gaps = at.slice(1).map((x, i) => x - at[i]);
    ok('...Shift, the turn and Shift up a frame apart (paced, >= ' + H.surfacePaceMs + ' ms)', gaps.length === 2 && gaps.every((g) => g >= H.surfacePaceMs - 2), gaps.join(','));
  }

  /* Session view: a header is its track, a mixer dial a knob; the clip cells
   * are a picture */
  render('session-overview');
  ok('Session: the track headers are tracks', fit.querySelectorAll('.hud-o-grid .th[data-in="track"]').length === 8);
  ok('...the clip cells are not live', !fit.querySelector('.hud-o-grid .cc[data-in]'));

  /* everything else is a picture (Josh, 2026-11-10: "just get rid of tapping
   * rows" — "touch controls were really just about switching tracks and
   * turning knobs"): nothing in it is live, and a click on it sends nothing */
  const inert = async (name, sel, what) => {
    render(name);
    const els = [...fit.querySelectorAll(sel)];
    const liveIn = els.filter((e) => e.closest('[data-in]'));
    log.length = 0; if (els[0]) tap(els[els.length > 1 ? 1 : 0]);
    await settle();
    ok(what + ': drawn, not live, and a click sends nothing', els.length > 0 && !liveIn.length && log.length === 0, els.length + ' drawn, ' + liveIn.length + ' live, sent ' + hex(log));
  };
  await inert('menu-clock', '.hud-list .hud-row', 'a list\'s rows');
  await inert('block-editor-my-presets', '.hud-list .hud-row', 'a module\'s list page (My Presets)');
  await inert('bank-value-popup', '.hud-ovl .hud-row', 'a pop-up card\'s rows');
  await inert('record-blocked', '.hud-btn', 'a dialog\'s buttons');
  await inert('automation-menu', '.hud-lane', 'the lane menu\'s rows');
  await inert('automation-lane-detail', '.hud-lane-steps i', 'the lane\'s step strip');
  await inert('bank-overview-walk', '.hud-it-transport', 'the status strip\'s transport');

  /* nothing is left held: focus lost mid-press lets go */
  render('bank-overview-walk');
  log.length = 0;
  ptr(fit.querySelector('.hud-pads [data-in="pad"]'), 'pointerdown', 0, 0, 31, 'touch');
  render('bank-clip');
  ptr(live('[data-in="knob"][data-k="4"]'), 'pointerdown', 0, 0, 32, 'mouse');
  window.dispatchEvent(new window.Event('blur'));
  await settle();
  const offs = log.filter((p) => p[0] === 0x80).map((p) => p[1]).sort((a, b) => a - b).join(',');
  ok('focus lost mid-press: the pad and the knob\'s touch are let go', /^4,\d+$/.test(offs) && +offs.split(',')[1] >= 68, hex(log));
  /* the wheel over a knob turns it (touched while it turns); elsewhere it sends nothing */
  render('bank-clip');
  log.length = 0;
  const wh = (el, dy) => el.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: dy, deltaMode: 0 }));
  wh(live('[data-in="knob"][data-k="1"]'), -56);
  await wait(30);
  await settle();
  ok('the wheel over a knob: touched, turned', log[0] && same(log[0], [0x90, 1, 127]) && log.some((p) => p[0] === 0xB0 && p[1] === 72 && p[2] === 2), hex(log));
  await wait(500);
  await settle();
  ok('...and let go when the wheel stops', same(log[log.length - 1], [0x80, 1, 0]), hex(log));
  log.length = 0; wh(fit.querySelector('.hud-status') || fit, 28);
  await settle();
  ok('the wheel elsewhere sends nothing', log.length === 0, hex(log));
}

console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? "FAILED: " + fails.join(", ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
