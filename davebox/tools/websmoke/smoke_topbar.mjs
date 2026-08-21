/* Smoke for the 2026-08-20 top-bar de-crowding:
 *   - the four H/V zoom buttons are GONE (the drag strips and Ctrl+wheel
 *     already did that job); fit survives, because it was the only
 *     user-reachable route to zoomReset
 *   - fit + Snap live on the canvas, inside #rollview
 *   - the top bar is measurably lighter, and still holds what it should
 *   - the site links are VISIBLE in the offline preview (inert), so the
 *     preview stops lying about the one thing it is used to judge
 * Run through ./run.sh (see README). */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from './ctxstub.mjs';

const html = await (await fetch('http://localhost:8199/web_ui.html')).text();
const dom = new JSDOM(html, {
  url: 'http://localhost:8199/web_ui.html', runScripts: 'dangerously',
  resources: 'usable', pretendToBeVisual: true, beforeParse(w) { installCanvasStub(w); }
});
const { window } = dom;
for (let i = 0; i < 100 && typeof window.chainParams !== "object"; i++) await new Promise(r => setTimeout(r, 100));
await new Promise(r => setTimeout(r, 1200));

/* harness guard — see smoke_sound_banks.mjs for why this is not a test */
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

/* ---- the redundant zoom buttons are gone ---- */
for (const id of ["zxin", "zxout", "zyin", "zyout"]) {
  ok("removed_" + id, !d.getElementById(id));
}
/* ...but the gesture that replaces them is still wired */
ok("zoomStripsPresent", !!d.getElementById("zstripH") && !!d.getElementById("zstripV"));

/* ---- fit survives, and has BOTH routes ---- */
const fit = d.getElementById("zrst");
ok("fitSurvives", !!fit);
ok("fitOnCanvas", !!fit && !!fit.closest("#rollview"), fit && (fit.closest("#rollview") ? "" : "not in #rollview"));
ok("fitHasHandler", !!fit && typeof fit.onclick === "function");
ok("stripDblClickFits",
  typeof d.getElementById("zstripH").ondblclick === "function" &&
  typeof d.getElementById("zstripV").ondblclick === "function");

/* ---- Snap moved with it and is still the one the code reads ---- */
const snap = d.getElementById("snap");
ok("snapOnCanvas", !!snap && !!snap.closest("#rollview"));
ok("snapStillReadable", window.eval('typeof snapTicks === "function" && !isNaN(snapTicks())'));
ok("snapOverlayExists", !!d.getElementById("rollzoom"));

/* ---- the top bar is lighter, and kept what it should ---- */
const top = d.getElementById("top");
const topControls = top.querySelectorAll("button, select, input, a").length;
ok("topBarLighter", topControls <= 20, topControls);
ok("topKeepsViews", !!top.querySelector("#viewSeq") && !!top.querySelector("#viewSound"));
ok("topKeepsTransport", !!top.querySelector("#xport"));
ok("topKeepsTools", !!top.querySelector("#toolDraw") && !!top.querySelector("#hUndo"));
ok("zoomLeftTopBar", !top.querySelector("#zrst") && !top.querySelector("#snap"));

/* ---- the site ribbon: identity + cross-page nav, above the toolbar ---- */
const site = d.getElementById("site");
ok("siteRibbonExists", !!site);
ok("ribbonAboveToolbar", !!site && !!top && (site.compareDocumentPosition(top) & 4) !== 0);
ok("brandInRibbonNotToolbar", !!site.querySelector(".sitebrand") && !top.querySelector(".brand"));
const sl = site && site.querySelector(".sitelinks");
ok("siteLinksInRibbon", !!sl);
ok("siteLinksLeftToolbar", !top.querySelector(".sitelinks"));
ok("siteLinksVisibleInPreview", !!sl && sl.style.display !== "none", sl && sl.style.display);
ok("siteLinksInert", !!sl && sl.classList.contains("inert"));
const anchors = sl ? [...sl.querySelectorAll("a")] : [];
/* the SET and ORDER must match the manager's base.html nav — that is the whole
 * point of the ribbon; a drift here is the inconsistency it exists to remove */
ok("siteLinkLabels", anchors.map(a => a.textContent.trim()).join("|") === "Mirror|Files|Help|Config|System",
  JSON.stringify(anchors.map(a => a.textContent.trim())));
ok("inertLinksCannotNavigate", anchors.length === 5 && anchors.every(a => !a.getAttribute("href")));

/* ---- the clip badge is gone, and nothing still writes to it ---- */
ok("clipBadgeGone", !d.getElementById("clipname"));
/* renderChrome() is the function that used to write it — re-running it must not
 * throw on the missing element (a stale getElementById(...).textContent would) */
const chromeRes = window.eval('(function(){try{renderChrome();return true}catch(e){return "throw: "+e.message}})()');
ok("noClipBadgeCrash", chromeRes === true, chromeRes);

/* ---- BPM is not squeezed: every toolbar child holds its width ---- */
const bpm = d.getElementById("bpmIn");
ok("bpmPresent", !!bpm);
const shrinkOf = el => window.getComputedStyle(el).flexShrink;
const kids = [...top.children].filter(e => !e.classList.contains("spacer"));
ok("toolbarChildrenDoNotShrink", kids.every(e => shrinkOf(e) === "0"),
  JSON.stringify(kids.map(e => (e.id || e.className) + ":" + shrinkOf(e))));
ok("spacerStillFlexes", shrinkOf(d.querySelector("#top .spacer")) !== "0" ||
  window.getComputedStyle(d.querySelector("#top .spacer")).flexGrow === "1");

/* ---- the session grid is six rows tall, then scrolls ---- */
const sess = d.getElementById("session");
const gridCss = window.getComputedStyle(sess);
ok("sessionScrolls", gridCss.overflow === "auto" || gridCss.overflowY === "auto", gridCss.overflow);
ok("sessionNotViewportFraction", !/vh/.test(sess.style.maxHeight || "") &&
  !/30vh/.test([...d.styleSheets[0].cssRules].map(r => r.cssText).join("")), "30vh still present");
const rules = [...d.styleSheets[0].cssRules].map(r => r.cssText).join("\n");
/* ⚠ jsdom FOLDS calc() — the source says calc(22px + 6 * (17px + 3px) + 14px)
 * and the rule reads back as calc(156px). Assert the ARITHMETIC, which is the
 * thing that matters (header + six whole rows + padding) and is also a stronger
 * check than matching the source text. */
const HEADER = 22, ROW = 17, GAP = 3, PAD = 14, ROWS = 6;
const want = HEADER + ROWS * (ROW + GAP) + PAD;
const got = (rules.match(/#session[^}]*max-height:\s*calc\((\d+(?:\.\d+)?)px\)/) || [])[1];
ok("sixRowHeightIsDerived", Number(got) === want, got + "px, want " + want + "px");
ok("gridRowsFixed", /#grid[^}]*grid-auto-rows:\s*17px/.test(rules) &&
  /#grid[^}]*grid-template-rows:\s*22px/.test(rules));

/* ---- both zoom strips zoom on a DOWN drag ----
 * The vertical strip is an 18px-wide column; reading horizontal movement there
 * was the wrong gesture. Drive real pointer events and assert the direction. */
function dragStrip(el, dx, dy) {
  const mk = (t, x, y) => { const e = new window.Event(t, { bubbles: true }); e.pointerId = 1;
    e.clientX = x; e.clientY = y; return e; };
  el.dispatchEvent(mk("pointerdown", 100, 100));
  el.dispatchEvent(mk("pointermove", 100 + dx, 100 + dy));
  el.dispatchEvent(mk("pointerup", 100 + dx, 100 + dy));
}
const rowh = () => window.eval("ROWH");
const pxt = () => window.eval("PXPERTICK");

const v0 = rowh();
dragStrip(d.getElementById("zstripV"), 0, 60);        /* straight DOWN */
const vDown = rowh();
ok("vZoomsOnDownDrag", vDown > v0, v0 + " -> " + vDown);
dragStrip(d.getElementById("zstripV"), 0, -60);       /* straight UP */
ok("vUnzoomsOnUpDrag", rowh() < vDown, vDown + " -> " + rowh());
/* and a purely SIDEWAYS drag must now do nothing on it */
const vSide = rowh();
dragStrip(d.getElementById("zstripV"), 80, 0);
ok("vIgnoresSidewaysDrag", rowh() === vSide, vSide + " -> " + rowh());

const h0 = pxt();
dragStrip(d.getElementById("zstripH"), 0, 60);
ok("hStillZoomsOnDownDrag", pxt() > h0, h0 + " -> " + pxt());

console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? "FAILED: " + fails.join(", ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
