/* loadpage.mjs — load web_ui.html into jsdom DETERMINISTICALLY (2026-09-05).
 *
 * jsdom fetching the six web_ui_*.js scripts itself dropped whole script loads
 * intermittently on node 25 ("Could not load script … web_ui_core.js", then
 * "R is not defined" downstream) — often on EVERY attempt, which run.sh reported
 * as a harness flake. So the page's scripts are fetched here with retries and
 * INLINED before jsdom parses: nothing loads over the network inside jsdom.
 * The /static/schwung-remote-api.js tag is dropped — its absence is what makes
 * web_ui_core.js install the mock shim (`if (!window.schwungRemote)`). */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from './ctxstub.mjs';
const BASE = 'http://127.0.0.1:8199/';
async function text(url) {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.text(); } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('could not fetch ' + url);
}
export async function loadPage() {
  let html = await text(BASE + 'web_ui.html');
  html = html.replace(/<script src="\/static\/schwung-remote-api\.js"><\/script>\s*/, '');
  const tags = [...html.matchAll(/<script src="(web_ui_[a-z]+\.js)"><\/script>/g)].map(m => m[1]);
  for (const f of tags) {
    const js = await text(BASE + f);
    /* a FUNCTION replacement: the source is full of `$&`-style sequences a
     * string replacement would expand — that corrupted web_ui_core.js once. */
    const inline = '<script>' + js.replace(/<\/script>/g, '<\\/script>') + '</script>';
    html = html.replace(`<script src="${f}"></script>`, () => inline);
  }
  const dom = new JSDOM(html, { url: BASE + 'web_ui.html', runScripts: 'dangerously',
    pretendToBeVisual: true, beforeParse(w) { installCanvasStub(w); } });
  const { window } = dom;
  for (let i = 0; i < 100 && !(window.schwungRemote && typeof window.chainParams === 'object'); i++)
    await new Promise(r => setTimeout(r, 100));
  if (!window.schwungRemote) throw new Error('mock shim never installed');
  await new Promise(r => setTimeout(r, 1200));
  return dom;
}
