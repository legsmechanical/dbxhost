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

let el = render('bank-knob-touched');
ok('a bank page: one row of eight cells', el.querySelectorAll('.hud-knobs .hud-kn').length === 8);
ok('...the touched knob names the header', /Octave Shift/.test(el.querySelector('.hud-header').textContent));
ok('...its range on the right', /−?-?4\s*–\s*\+4/.test(el.querySelector('.hud-header .r') ? el.querySelector('.hud-header .r').textContent : ''), el.querySelector('.hud-header').textContent);
ok('...its neighbouring options under it', !!el.querySelector('.hud-kn.tch .hud-a-opts'));
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
  ok('track overview: the clip as a piano roll — its notes, the viewed page outlined, the playhead, the eight tracks', notes === 3 &&
     !!e.querySelector('.hud-o-roll rect[stroke="#4da3ff"]') && !!e.querySelector('.hud-o-roll line[stroke="#ffcf4d"]') && e.querySelectorAll('.hud-o-tl .row').length === 8 &&
     !!e.querySelector('.hud-o-info .k.u'), notes + ' notes');
  const drm = fx('track-drum');
  setM({ sel: { t: drm.where.track, c: drm.where.clip, lane: drm.where.lane }, clip: { len: 16, tps: 24, ls: 0 }, laneInfo: { len: 16, tps: 24, ls: 0 }, glob: { key: 0 }, scaleMask: null, notes: [], tracks: tr,
         dnotes: { 0: [{ tick: 0, vel: 100 }, { tick: 96, vel: 100 }], 3: [{ tick: 48, vel: 90 }] }, dlanes: Array.from({ length: 32 }, (_, i) => ({ note: 36 + i, tps: 24, ls: 0, len: 16 })) });
  e = draw(drm);
  ok('...on a drum track, its lanes as rows, hits in them, the device\'s lane marked', !!e && e.querySelectorAll('.hud-o-roll rect[rx="3"]').length === 3 &&
     /C1/.test(e.querySelector('.hud-o-roll').textContent) && /D#1/.test(e.querySelector('.hud-o-roll').textContent));
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
  e = draw(fx('session-muted'));
  ok('...a muted track as the device says', !!e && !!e.querySelector('.hud-o-grid .th.mute'));
  setM(saveM);
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
ok('the session mixer: eight bipolar dials', el.querySelectorAll('.hud-knobs .hud-w-svg').length === 8);

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

console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? "FAILED: " + fails.join(", ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
