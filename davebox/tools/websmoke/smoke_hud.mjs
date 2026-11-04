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
ok('a menu: far more rows than the OLED, in two columns, the selection lit', el.querySelectorAll('.hud-row:not(.gap)').length >= 15 &&
   !!el.querySelector('.hud-list.cols') && !!el.querySelector('.hud-row.sel'), el.querySelectorAll('.hud-row:not(.gap)').length);
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
