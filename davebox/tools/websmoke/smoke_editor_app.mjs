/* Smoke for the editor as its own window (web_ui_app.js): ?app=1 drops the
 * site ribbon, opens on the view in its address, names itself the editor app
 * (separate from the screen's), and keeps every editor key working.
 * Run through ./run.sh smoke_editor_app.mjs (see README). */
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
  url: 'http://localhost:8199/web_ui.html?app=1&tool=1#mix', runScripts: 'dangerously',
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
if (!window.dbxApp || typeof window.setView !== 'function' || typeof window.renderSound !== 'function') { console.log('HARNESS: script drop'); process.exit(2); }
const d = window.document;
const out = {}, fails = [];
const ok = (n, c, x) => { out[n] = c ? 'PASS' : ('FAIL ' + (x === undefined ? '' : x)); if (!c) fails.push(n); };
const shown = (id) => { const e = d.getElementById(id); return !!e && window.getComputedStyle(e).display !== 'none'; };

ok('the editor as its own window: the toolbar, no site ribbon, no Pop out of itself', d.body.classList.contains('app-window') && window.dbxApp.mode === 'editor' &&
   shown('top') && !shown('site') && !shown('popEditor'));
ok('...it opens on the view in its address (#mix)', d.body.dataset.view === 'mix', d.body.dataset.view);
const mani = d.querySelector('link[rel="manifest"]');
ok('it names itself the editor app: its manifest, title, icon, an opaque status bar over its toolbar', !!mani && mani.getAttribute('href') === 'web_ui_editor.json' &&
   d.title === 'dAVEBOx' && d.querySelector('link[rel="apple-touch-icon"]').getAttribute('href') === 'web_ui_editor-180.png' &&
   d.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content') === 'black' && d.querySelectorAll('link[rel="manifest"]').length === 1);
const me = JSON.parse(readFileSync(new URL('./web_ui_editor.json', ROOT), 'utf8')), ms = JSON.parse(readFileSync(new URL('./web_ui_screen.json', ROOT), 'utf8'));
ok('...a separate app from the screen\'s (own id and start), opening straight into the editor, its icons on disk',
   me.start_url === '/?app=1' && me.id !== ms.id && me.start_url !== ms.start_url && me.display === 'standalone' &&
   me.icons.every((i) => existsSync(new URL('./' + i.src, ROOT))) && existsSync(new URL('./web_ui_editor-180.png', ROOT)));
/* it is the editor: its keys still work (the screen window blocks them; this must not) */
window.setView('seq');
const sel = d.getElementById('toolSel'), draw = d.getElementById('toolDraw');
d.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'v', bubbles: true }));
const vOn = sel.classList.contains('on');
d.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true }));
ok('...and it is the whole editor: its keys reach it (V select, B draw)', vOn && draw.classList.contains('on'));
/* the Screen view inside it still pops out on its own */
window.setView('screen');
const pop = [...d.querySelectorAll('#screenview .hud-appbtn')].find((b) => /pop out/i.test(b.textContent));
const opened = []; window.open = (u, n, f) => { opened.push([u, n]); return null; };
if (pop) pop.click();
ok('...its Screen view still pops out into the screen window', !!pop && opened.length === 1 && new URL(opened[0][0], 'http://x/').searchParams.get('screen') === '1' &&
   !new URL(opened[0][0], 'http://x/').searchParams.has('app') && opened[0][1] === 'davebox-screen', JSON.stringify(opened));

console.log(JSON.stringify(out, null, 1));
if (fails.length) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
console.log('ALL PASS');
process.exit(0);
