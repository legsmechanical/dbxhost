/* Smoke for the 2026-11-03 touch / small-screen pass (tablet, phone in landscape).
 * jsdom has no layout and no media queries, so the CSS half was checked in a real
 * browser at 1024x768, 767x1024, 844x390 and 667x375; this pins the JS half:
 *   - the app renders at all: web_ui_seq.js rendered the grid with escMix during its
 *     own load while escMix lived in web_ui_mix.js (loaded later), so the first
 *     render threw and the poll loop never started (the preview showed no clip)
 *   - an unchanged session grid is NOT rebuilt on every push: rebuilding replaced
 *     the cells under a finger mid-tap and closed an open clip menu
 *   - the touch routes for mouse/keyboard-only actions: "Edit without launching"
 *     (Alt/Shift-click), "Select all" (⌘A)
 *   - the inspector drawer toggle + scrim, and the site links cloned into ⚙
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = el => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

/* ---- the app rendered: a model, a grid, notes ---- */
ok("modelLoaded", window.eval("!!M"));
ok("gridRendered", d.querySelectorAll("#grid .sclip").length >= 8, d.querySelectorAll("#grid .sclip").length);
ok("escapeInFirstScript", window.eval('typeof escMix === "function"') &&
  !/function escMix/.test(await (await fetch('http://localhost:8199/web_ui_mix.js')).text()));

/* ---- an unchanged grid survives the polls (the mock is playing: pushes keep coming) ---- */
ok("mockIsPlaying", window.eval("!!(M.play && M.play.on)"));
const cell0 = d.querySelector("#grid .sclip");
await sleep(1500);
ok("gridNotRebuiltWhenUnchanged", cell0 === d.querySelector("#grid .sclip") && cell0.isConnected);
/* ...but a real change still rebuilds it */
window.eval("M.tracks[2].has[5]=!M.tracks[2].has[5]; renderSession();");
ok("gridRebuiltOnChange", cell0 !== d.querySelector("#grid .sclip"));
window.eval("M.tracks[2].has[5]=!M.tracks[2].has[5]; renderSession();");

/* ---- the clip menu stays open across pushes ---- */
const menuBtn = d.querySelectorAll("#grid .sclip-menu")[0];   /* T1 A */
click(menuBtn);
ok("clipMenuOpens", !!d.querySelector(".clipmenu"));
await sleep(1200);
ok("clipMenuSurvivesPolls", !!d.querySelector(".clipmenu"));

/* ---- "Edit without launching": selects, sends no launch ---- */
window.eval(`window.__sent=[]; (function(){ const f=R.setParam.bind(R);
  R.setParam=function(k,v){ window.__sent.push(k+"="+v); return f(k,v); }; })();`);
const view = d.getElementById("cmView");
ok("editWithoutLaunchingItem", !!view);
if (view) {
  click(view);
  const sent = window.eval("window.__sent.slice()");
  ok("editWithoutLaunchingSelects", sent.some(k => /t0_c0_ruisel=/.test(k)), JSON.stringify(sent));
  ok("editWithoutLaunchingDoesNotLaunch", !sent.some(k => /launch/i.test(k)), JSON.stringify(sent));
  ok("menuClosedAfterPick", !d.querySelector(".clipmenu"));
}
/* the same click on the cell itself DOES launch — the control for the check above */
window.eval("window.__sent=[]");
click(d.querySelectorAll("#grid .sclip")[1]);
ok("cellClickStillLaunches", window.eval("window.__sent.some(k=>/launch/i.test(k))"),
  JSON.stringify(window.eval("window.__sent.slice()")));
await sleep(900);

/* ---- Select all, as a button ---- */
window.eval('selectClip(1,0)');
await sleep(900);
window.eval('setTool("select"); selSet.clear(); selNote=null; renderNoteEdit();');
const all = d.getElementById("meAll");
ok("selectAllButton", !!all);
if (all) {
  click(all);
  const n = window.eval("M.notes.length"), s = window.eval("selSet.size");
  ok("selectAllSelectsEvery", n > 0 && s === n, s + "/" + n);
  ok("selectAllStaysInMultiEdit", !!d.getElementById("meAll") && !!d.getElementById("meDel"));
}

/* ---- inspector drawer: toggle + scrim ---- */
const st = d.getElementById("sideToggle"), scrim = d.getElementById("sidescrim");
ok("drawerControlsExist", !!st && !!scrim);
click(st);
ok("drawerOpens", d.body.classList.contains("side-open") && st.classList.contains("on"));
click(scrim);
ok("scrimCloses", !d.body.classList.contains("side-open") && !st.classList.contains("on"));
click(st);
d.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
ok("escapeCloses", !d.body.classList.contains("side-open"));

/* ---- site links cloned into the ⚙ popover; the ribbon is still the one source ---- */
const ps = d.querySelector("#globalpop .popsite");
const ribbon = [...d.querySelectorAll("#site .sitelinks a")].map(a => a.textContent.trim());
ok("popoverHasSiteLinks", !!ps && [...ps.querySelectorAll("a")].map(a => a.textContent.trim()).join("|") === ribbon.join("|"),
  ps ? ps.textContent.replace(/\s+/g, " ") : "none");
ok("ribbonUntouched", ribbon.length === 6 && d.querySelectorAll("#site .sitelinks").length === 1);

console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? "FAILED: " + fails.join(", ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
