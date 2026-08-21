/* Smoke for the 2026-08-21 relayout fix.
 *
 * The bug: layout() sizes the roll canvas from #rollview's measured height, and
 * the mini-mixer ribbon + session grid fill in AFTER the boot relayout. They
 * shrink #rollview under a canvas that keeps its taller pixel size, and because
 * #rollview is overflow:hidden the clipped part is exactly the bottom STEPBAND —
 * the step-edit row disappears "behind" the VELOCITY header as the page loads.
 * Window `resize` does not fire for a sibling growing inside the same column.
 *
 * ⚠ jsdom has no layout engine and no ResizeObserver, so this STUBS the observer
 * before the page scripts run, captures what the app observes, and drives the
 * callback by hand with a changed measurement. That tests the wiring — that the
 * app watches the right box and re-lays-out when it changes — which is the part
 * that was missing. It cannot test real pixel clipping; only a browser can. */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from './ctxstub.mjs';

const html = await (await fetch('http://localhost:8199/web_ui.html')).text();
const dom = new JSDOM(html, {
  url: 'http://localhost:8199/web_ui.html', runScripts: 'dangerously',
  resources: 'usable', pretendToBeVisual: true,
  beforeParse(w) {
    installCanvasStub(w);
    w.__ro = [];
    w.ResizeObserver = class {
      constructor(cb) { this.cb = cb; this.targets = []; w.__ro.push(this); }
      observe(el) { this.targets.push(el); }
      disconnect() {}
    };
  }
});
const { window } = dom;
for (let i = 0; i < 100 && typeof window.chainParams !== "object"; i++) await new Promise(r => setTimeout(r, 100));
await new Promise(r => setTimeout(r, 1200));

const loaded = {
  core: window.eval('typeof R !== "undefined"'),
  seq: window.eval('typeof DELAY_TIME_LAB !== "undefined"')
};
const missing = Object.keys(loaded).filter(k => !loaded[k]);
if (missing.length) {
  console.log("HARNESS: script drop — " + missing.join(", ") + " never loaded (retry)");
  process.exit(2);
}

const d = window.document;
const out = {}, fails = [];
const ok = (n, c, x) => { out[n] = c ? "PASS" : ("FAIL " + (x === undefined ? "" : x)); if (!c) fails.push(n); };

const view = d.getElementById("rollview");
const observers = window.__ro || [];
ok("observerInstalled", observers.length >= 1, observers.length);
const watching = observers.find(o => o.targets.includes(view));
ok("observesTheRollBox", !!watching,
  JSON.stringify(observers.map(o => o.targets.map(t => t.id))));

/* Drive it: give the box a real measurement, fire the callback, and assert the
 * canvas was resized to match — that is layout() having re-run. */
const cv = d.getElementById("rollcanvas");
if (watching) {
  const setBox = (w, h) => {
    Object.defineProperty(view, "clientWidth", { value: w, configurable: true });
    Object.defineProperty(view, "clientHeight", { value: h, configurable: true });
  };
  setBox(900, 500);
  watching.cb([{ target: view }]);
  const h1 = cv.style.height;
  ok("layoutRanOnFirstChange", h1 === "500px", h1);

  /* the ribbon appearing = the box getting SHORTER; the canvas must follow it
   * down, which is the whole bug */
  setBox(900, 420);
  watching.cb([{ target: view }]);
  ok("canvasFollowsTheBoxDown", cv.style.height === "420px", cv.style.height);

  /* ⚠ The size guard must make a SAME-SIZE callback do no work at all — layout()
   * writes inside the observed element, so an unguarded handler can feed itself
   * in a real browser. Assert the guard's observable effect (no re-layout), not
   * a re-entry count: jsdom has no real ResizeObserver, so nothing can re-enter
   * here and a counting assertion passes with the guard DELETED. It did, first
   * time round. [[schwung-mutation-survivor-means-two-owners]] */
  cv.style.height = "";
  watching.cb([{ target: view }]);          /* same 900x420 as the call above */
  ok("sameSizeDoesNoWork", cv.style.height === "",
    "re-laid out on an unchanged box: " + cv.style.height);
  /* ...and a real change still gets through afterwards */
  setBox(900, 380);
  watching.cb([{ target: view }]);
  ok("changeStillGetsThrough", cv.style.height === "380px", cv.style.height);
}

console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? "FAILED: " + fails.join(", ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
