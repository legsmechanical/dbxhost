/* Smoke for the automation lane opening from a CC chip (2026-08-21).
 *
 * Josh: "automation buttons don't seem to be opening the automation view when
 * you click on them."
 *
 * The click ITSELF was fine — ccSel is set, #autoctl and #autowrap are shown.
 * What was broken is that the lane could open BLANK: layout() sized the auto
 * canvas only `if (aw.clientHeight > 0)`, with no fallback, so one measurement
 * of 0 left it at 0x0 forever and drawAuto() painted into nothing. Its velocity
 * sibling always fell back (`vw.clientHeight || 56`); automation was the odd one
 * out. A blank lane is indistinguishable from a dead button.
 *
 * ⭑ jsdom reports clientHeight 0 for everything, which makes it the perfect
 * harness for exactly this bug: the OLD code skips sizing entirely here, the new
 * code falls back. Run through ./run.sh. */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from './ctxstub.mjs';

const html = await (await fetch('http://localhost:8199/web_ui.html')).text();
const dom = new JSDOM(html, {
  url: 'http://localhost:8199/web_ui.html', runScripts: 'dangerously',
  resources: 'usable', pretendToBeVisual: true, beforeParse(w) { installCanvasStub(w); }
});
const { window } = dom;
for (let i = 0; i < 100 && typeof window.chainParams !== "object"; i++) await new Promise(r => setTimeout(r, 100));
await new Promise(r => setTimeout(r, 1400));

const loaded = {
  core: window.eval('typeof R !== "undefined"'),
  mix: window.eval('typeof MIX_MODES !== "undefined"'),
  seq: window.eval('typeof DELAY_TIME_LAB !== "undefined"'),
  sound: typeof window.renderSound === "function"
};
const missing = Object.keys(loaded).filter(k => !loaded[k]);
if (missing.length) {
  console.log("HARNESS: script drop — " + missing.join(", ") + " never loaded (retry)");
  process.exit(2);
}

const d = window.document;
const out = {}, fails = [];
const ok = (n, c, x) => { out[n] = c ? "PASS" : ("FAIL " + (x === undefined ? "" : x)); if (!c) fails.push(n); };
const click = el => el.dispatchEvent(new window.Event("click", { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

/* open the AUTOMATION band */
const hdr = d.getElementById("autohdr");
ok("autoHeaderExists", !!hdr);
if (window.eval("autoOpen") !== true) { click(hdr); await wait(300); }
ok("bandOpens", window.eval("autoOpen") === true);

const chips = d.querySelectorAll(".ccslot");
ok("chipsRendered", chips.length === 8, chips.length);
ok("chipsAreWired", chips.length > 0 && typeof chips[0].onclick === "function");

/* before the click: no lane focused, so no lane shown */
ok("laneHiddenBeforeClick", d.getElementById("autowrap").style.display === "none",
  d.getElementById("autowrap").style.display);

/* click a chip — the lane must open AND be drawable */
click(chips[0]);
await wait(500);
ok("chipSelectsLane", window.eval("ccSel") === 0, window.eval("ccSel"));
ok("laneShown", d.getElementById("autowrap").style.display === "block",
  d.getElementById("autowrap").style.display);
ok("laneControlsShown", d.getElementById("autoctl").style.display === "flex",
  d.getElementById("autoctl").style.display);
/* ⚠ re-query: focusCc() re-renders the picker, so the element clicked above is
 * now DETACHED. (Its handler still fires when dispatched on it, which is why the
 * later assertions pass with stale references — but its className is frozen at
 * whatever it was, so reading it here checks nothing.) */
const liveChips = () => d.querySelectorAll(".ccslot");
ok("chipMarkedSelected", liveChips()[0].className.includes("sel"), liveChips()[0].className);

/* ⭑ THE REGRESSION THAT MATTERED: the canvas must have a real size, or the lane
 * opens blank and reads as a dead button. */
const ac = d.getElementById("autocanvas");
/* ⚠ NOT `ac.width > 0`: a <canvas> defaults to 300x150, so that passes with the
 * bug fully present — it did, first time round. Assert the size layout() would
 * actually have written (the 72px lane, times DPR), which only a real sizing
 * pass produces. */
const dpr = window.devicePixelRatio || 1;
ok("autoCanvasSized", ac.height === Math.round(72 * dpr),
  ac.width + "x" + ac.height + " (dpr " + dpr + ")");
ok("autoCanvasStyled", ac.style.height === "72px", ac.style.height);

/* clicking the same chip again is a toggle — it closes */
click(chips[0]);
await wait(400);
ok("chipTogglesOff", window.eval("ccSel") === -1 &&
  d.getElementById("autowrap").style.display === "none",
  window.eval("ccSel") + " / " + d.getElementById("autowrap").style.display);

/* and a different chip focuses that lane */
click(chips[2]);
await wait(400);
ok("otherChipSelects", window.eval("ccSel") === 2 &&
  d.getElementById("autowrap").style.display === "block", window.eval("ccSel"));

console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? "FAILED: " + fails.join(", ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
