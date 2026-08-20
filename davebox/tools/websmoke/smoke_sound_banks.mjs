/* Smoke for the 2026-08-20 Sound-view rework:
 *   1. the chain column is no longer capped at 620px
 *   2. only ONE row of chips on Sound (the clip ribbon left)
 *   3. the editor switch reads "Custom UI" / "Generic"
 *   4. open-in-tab lives in the card HEADER
 *   5. levels are COLLAPSIBLE BANKS — siblings stay visible, no breadcrumb
 * Run with the preview server up (see README). */
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

/* ⚠⚠ HARNESS GUARD, not a test. jsdom's loader intermittently DROPS a whole
 * script (README: the undici/keep-alive class), and the drop cascades — a
 * missing web_ui_core.js means `R is not defined` in every later file, no view
 * ever renders, and the assertions below then report zero chips as if the code
 * were broken. That reads as a real, intermittent failure and sends you hunting
 * a bug that is not there. So: prove every half of the app actually loaded, and
 * exit 2 (distinct from a real failure) so the runner retries.
 * Top-level `const`/`let` are NOT window properties — they live in the script's
 * global lexical scope, hence window.eval rather than a property check. */
const loaded = {
  core: window.eval('typeof R !== "undefined"'),
  mix: window.eval('typeof MIX_MODES !== "undefined"'),
  seq: window.eval('typeof DELAY_TIME_LAB !== "undefined"'),
  ribbon: typeof window.placeClipRibbon === "function",
  sound: typeof window.renderSound === "function",
  params: typeof window.chainParams === "object"
};
const missing = Object.keys(loaded).filter(k => !loaded[k]);
if (missing.length) {
  console.log("HARNESS: script drop — " + missing.join(", ") + " never loaded (retry)");
  process.exit(2);
}

const d = window.document;
const out = {}, fails = [];
const ok = (name, cond, extra) => { out[name] = cond ? "PASS" : ("FAIL " + (extra === undefined ? "" : extra)); if (!cond) fails.push(name); };

window.location.hash = '#sound';
await new Promise(r => setTimeout(r, 900));

/* ---- 2. one chip row on Sound ---- */
const rib = d.getElementById('clipribbon');
ok("clipRibbonHiddenOnSound", rib && rib.style.display === "none", rib && rib.style.display);
ok("clipRibbonNotInSound", !d.querySelector('#sound #clipribbon'));
ok("trackChipsPresent", d.querySelectorAll('.sndchip').length === 8, d.querySelectorAll('.sndchip').length);

/* the ribbon must come BACK on the mixer — the row was moved, not deleted */
window.location.hash = '#mix';
await new Promise(r => setTimeout(r, 700));
ok("clipRibbonOnMixer", !!d.querySelector('#mixer #clipribbon') &&
  d.getElementById('clipribbon').style.display !== "none");
ok("clipChipsRender", d.querySelectorAll('.clipchip').length === 8, d.querySelectorAll('.clipchip').length);
window.location.hash = '#sound';
await new Promise(r => setTimeout(r, 900));

/* ---- 1. width cap gone ---- */
const chainCss = [...d.styleSheets[0].cssRules].map(r => r.cssText).join("\n");
ok("noChainWidthCap", /\.sndchain\s*\{[^}]*\}/.test(chainCss) &&
  !/\.sndchain\s*\{[^}]*max-width/.test(chainCss));
ok("panelIs60vh", /\.sndpanel\s*\{[^}]*height:\s*60vh/.test(chainCss));

/* ---- 3 + 4. the header switch and open-in-tab ----
 * The mock has no instrument that ships a panel (/api/module-panel 404s in the
 * preview), so the header controls never appear on their own. Drive them
 * directly: give a real synth card a panelUrl and re-render its header.
 * ⚠ First switch to a track that PLAYS A SCHWUNG INSTRUMENT — the mock selects
 * T2, which is Move-routed, and a Move-routed track has no instrument card at
 * all (its editing happens on the device). Asserting on the default selection
 * finds no synth card and reads as a broken header. */
const schwungTrack = window.eval('M.tracks.findIndex(function(t){return (t.route||0)===0;})');
ok("mockHasSchwungTrack", schwungTrack >= 0, schwungTrack);
if (schwungTrack >= 0) {
  d.querySelectorAll('.sndchip')[schwungTrack].dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 900));
}
const synthKey = window.eval('Object.keys(sndComps).find(function(k){return /\\|synth$/.test(k);}) || ""');
ok("synthCardExists", !!synthKey, synthKey);
if (synthKey) {
  window.eval('(function(){var c = sndComps[' + JSON.stringify(synthKey) + '];' +
    'c.panelUrl = "/api/remote-ui/module-assets/obxd/web_ui.html";' +
    'c.rendered = "panel"; sndPanelHeader(c, "obxd");})()');
  await new Promise(r => setTimeout(r, 60));
  const hdr = d.querySelector('#sound .sndcard[data-comp="synth"] .sndcard-h');
  ok("uiSwitchInHeader", !!(hdr && hdr.querySelector('.snduigroup')));
  const btns = hdr ? [...hdr.querySelectorAll('.snduibtn')].map(b => b.textContent) : [];
  ok("switchLabels", btns.join("|") === "Custom UI|Generic", JSON.stringify(btns));
  const active = hdr && hdr.querySelector('.snduibtn.active');
  ok("activeIsCustomUI", !!active && active.textContent === "Custom UI", active && active.textContent);
  /* the link must be in the HEADER, not under a 60vh iframe in the body */
  ok("openInTabInHeader", !!(hdr && hdr.querySelector('.sndopen')));
  ok("openInTabNotInBody",
    !d.querySelector('#sound .sndcard[data-comp="synth"] .sndcard-b .sndopen'));
  const href = hdr && hdr.querySelector('.sndopen') && hdr.querySelector('.sndopen').getAttribute('href');
  ok("openInTabCarriesSlot", !!href && /schwungStandalone=1&slot=\d+/.test(href), href);
  /* clicking Generic switches and re-marks the active segment */
  const gen = hdr && [...hdr.querySelectorAll('.snduibtn')].find(b => b.textContent === "Generic");
  if (gen) {
    gen.dispatchEvent(new window.Event('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 80));
    const hdr2 = d.querySelector('#sound .sndcard[data-comp="synth"] .sndcard-h');
    const act2 = hdr2 && hdr2.querySelector('.snduibtn.active');
    ok("switchToGenericSticks", !!act2 && act2.textContent === "Generic", act2 && act2.textContent);
    ok("switchLeavesLinkInHeader", !!(hdr2 && hdr2.querySelector('.sndopen')));
  }
}

/* ---- 5. collapsible banks, no breadcrumb ---- */
/* mount an editor directly: the mock has no module with a deep hierarchy, so
 * drive window.chainParams with a synthetic one — this is the unit under test */
const host = d.createElement('div');
d.body.appendChild(host);
const sets = [];
const ed = window.chainParams.mount(host, {
  hierarchy: {
    levels: {
      root: { label: "ROOT", knobs: ["cutoff"], params: ["cutoff",
        { level: "osc", label: "Oscillator" }, { level: "flt", label: "Filter" }] },
      osc: { label: "Oscillator", params: ["wave", "detune"] },
      flt: { label: "Filter", params: ["reso"] }
    }
  },
  chainParams: [
    { key: "cutoff", name: "Cutoff", type: "float", min: 0, max: 1, step: 0.01 },
    { key: "wave", name: "Wave", type: "int", min: 0, max: 3 },
    { key: "detune", name: "Detune", type: "float", min: 0, max: 1 },
    { key: "reso", name: "Reso", type: "float", min: 0, max: 1 }
  ],
  values: { cutoff: "0.5", wave: "1", detune: "0.2", reso: "0.3" },
  onSet: (k, v) => sets.push([k, v])
});

const banks = host.querySelectorAll('.cpk-bank');
ok("twoBanks", banks.length === 2, banks.length);
ok("noBreadcrumb", !host.querySelector('.cpk-breadcrumb') && !host.querySelector('.cpk-back'));
ok("rootContentVisible", !!host.querySelector('.cpk-knobs') &&
  !!host.querySelector('[data-cpk-row="cutoff"]'));
/* default: FIRST bank open, the rest closed */
ok("firstBankOpen", banks[0].classList.contains("open"));
ok("secondBankClosed", !banks[1].classList.contains("open"));
ok("openBankShowsParams", !!banks[0].querySelector('[data-cpk-row="wave"]'));

/* the whole point: opening a second bank must NOT close the first */
banks[1].querySelector('.cpk-bankhead').dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 60));
ok("bothBanksOpenTogether",
  banks[0].classList.contains("open") && banks[1].classList.contains("open"));
ok("siblingStillRendered", !!banks[0].querySelector('[data-cpk-row="wave"]') &&
  !!banks[1].querySelector('[data-cpk-row="reso"]'));

/* collapse is a real toggle */
banks[0].querySelector('.cpk-bankhead').dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 60));
ok("collapseHidesBody", !banks[0].classList.contains("open") &&
  banks[0].querySelector('.cpk-bankbody').style.display === "none");

/* a value arriving from the device must patch a row inside an OPEN bank */
ed.updateValues({ reso: "0.77" });
await new Promise(r => setTimeout(r, 60));
const resoVal = banks[1].querySelector('[data-cpk-value="reso"]');
ok("bankRowFollowsDevice", resoVal && resoVal.textContent !== "" && /77|0\.77/.test(resoVal.textContent),
  resoVal && resoVal.textContent);

/* a key rendered in TWO places must update in both (the flattening hazard) */
const host2 = d.createElement('div'); d.body.appendChild(host2);
const ed2 = window.chainParams.mount(host2, {
  hierarchy: { levels: {
    root: { knobs: ["cutoff"], params: ["cutoff", { level: "dup", label: "Dup" }] },
    dup: { params: ["cutoff"] } } },
  chainParams: [{ key: "cutoff", name: "Cutoff", type: "float", min: 0, max: 1, step: 0.01 }],
  values: { cutoff: "0.10" }, onSet: () => {}
});
ed2.updateValues({ cutoff: "0.90" });
await new Promise(r => setTimeout(r, 60));
const dupVals = [...host2.querySelectorAll('[data-cpk-value="cutoff"]')].map(e => e.textContent);
ok("duplicateKeyUpdatesEverywhere", dupVals.length >= 2 && new Set(dupVals).size === 1, JSON.stringify(dupVals));

console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? "FAILED: " + fails.join(", ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
