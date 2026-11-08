/* Smoke for the Screen view as its own window (web_ui_hud_app.js): ?screen=1
 * fills the window, names itself an app, goes full screen on F / the button /
 * a double-click, and keeps every key from the editor hidden behind it.
 * Run through ./run.sh smoke_hud_app.mjs (see README). */
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
  url: 'http://localhost:8199/web_ui.html?screen=1&tool=1', runScripts: 'dangerously',
  resources: { interceptors: [fromDisk] }, pretendToBeVisual: true, beforeParse(w) {
    installCanvasStub(w);
    /* jsdom has no full screen: a counter stands in, present from the start as in a browser */
    w.Element.prototype.requestFullscreen = function () { w.__fs = (w.__fs || 0) + 1; return Promise.resolve(); };
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
if (!window.HUD || typeof window.hudShow !== 'function') { console.log('HARNESS: script drop'); process.exit(2); }
const d = window.document, H = window.HUD;
const out = {}, fails = [];
const ok = (n, c, x) => { out[n] = c ? 'PASS' : ('FAIL ' + (x === undefined ? '' : x)); if (!c) fails.push(n); };

/* the window: the screen alone, the stage filling the window's shape */
ok('the screen alone: editor hidden, Screen view open', d.body.classList.contains('screen-only') && d.getElementById('screenview').classList.contains('on') && H.appWindow === true);
const view = d.getElementById('screenview'), fit = d.getElementById('hudfit');
const size = (w, h) => { Object.defineProperty(view, 'clientWidth', { value: w, configurable: true }); Object.defineProperty(view, 'clientHeight', { value: h, configurable: true }); H.rescale(); return parseInt(fit.style.getPropertyValue('--stage-h'), 10); };
ok('the stage takes the window\'s shape: 16:10 → 600 tall', size(1440, 900) === 600, size(1440, 900));
ok('...4:3 (an iPad) → 720', size(1024, 768) === 720, size(1024, 768));
ok('...and stops at its limits (21:9 → 410), letterboxed beyond', size(2560, 1080) === 410 && size(800, 1200) === 720);
ok('...scaled to fill, with no margin', /scale\(1\.5000\)/.test((size(1440, 900), fit.style.transform)), fit.style.transform);
/* installable: the app tags, only in this mode */
const mani = d.querySelector('link[rel="manifest"]');
ok('it names itself an app: manifest, Apple tags, its title', !!mani && mani.getAttribute('href') === 'web_ui_app.json' &&
   !!d.querySelector('meta[name="apple-mobile-web-app-capable"][content="yes"]') && !!d.querySelector('link[rel="apple-touch-icon"]') && d.title === 'dAVEBOx');
const m = JSON.parse(readFileSync(new URL('./web_ui_app.json', ROOT), 'utf8'));
ok('...the manifest opens straight into the screen, standalone, with its icons on disk', m.start_url === '/?screen=1' && m.display === 'standalone' &&
   m.icons.length >= 2 && m.icons.every((i) => existsSync(new URL('./' + i.src, ROOT))) && existsSync(new URL('./web_ui_icon-180.png', ROOT)));
/* full screen: F, the button, a double-click */
const key = (k, extra) => { const e = new window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})); d.body.dispatchEvent(e); return e; };
key('f');
ok('F asks for full screen', window.__fs === 1, window.__fs);
view.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
ok('...so does a double-click on the screen', window.__fs === 2, window.__fs);
const btn = [...d.querySelectorAll('.hud-appbtn')].find((b) => /full screen/i.test(b.textContent));
if (btn) btn.click();
ok('...and the Full screen button', !!btn && window.__fs === 3, window.__fs);
ok('no Pop out in the window itself', ![...d.querySelectorAll('.hud-appbtn')].some((b) => /pop out/i.test(b.textContent)));
/* the hidden editor hears no key from here */
let editorHeard = 0;
d.addEventListener('keydown', () => { editorHeard++; });
key('Delete'); key('z', { metaKey: true }); key('ArrowLeft');
ok('the editor behind the window hears no key (Delete, undo, arrows)', editorHeard === 0, editorHeard);
/* the controls get out of the way */
ok('the controls hide when idle, and come back on a move', (() => {
  d.body.classList.add('hud-idle'); window.dispatchEvent(new window.MouseEvent('mousemove'));
  return !d.body.classList.contains('hud-idle'); })());

console.log(JSON.stringify(out, null, 1));
if (fails.length) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
console.log('ALL PASS');
process.exit(0);
