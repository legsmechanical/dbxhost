/* dAVEBOx remote UI — the two ribbons (Tier 3 of the seamless-views ladder).
 *
 * MINI-MIXER RIBBON (sequencer view, docked under the session grid): eight
 * slim cells — track color + number, a horizontal level bar (0..2x, unity
 * notch), audio M/S micro-buttons. Dragging the bar trims the level through
 * the SAME wire keys and echo-window discipline as the Mixer's strips
 * (mixSet/mixDragKey/mixQuiet); most mixing gestures are one-knob trims, and
 * this removes the view jump for exactly those. Clicking the track number
 * selects the track; clicking anywhere else in the cell opens the full Mixer
 * on it (through jumpTo, like every cross-view door). Collapsible; the state
 * persists. Cells show the syncing treatment until their values arrive.
 *
 * CLIP RIBBON (Mixer and Sound views, one row up top): per track a colored
 * chip with the session grid's OWN playing/queued truth (trk.pl && trk.ac /
 * trk.qc — never re-derived), click = launch that track's playing-or-first
 * clip via the grid's launchClip path. Performance never requires leaving
 * the mixer.
 *
 * Loads AFTER web_ui_mix.js (uses jumpTo/mixSet/mixSeeded/MIX_MODES) and
 * BEFORE web_ui_sound.js (whose boot-tail view restore calls setView, which
 * calls into here — everything must be parsed by then).
 * ⚠ UI language: instrument names / "Move N" / "MIDI" — never chain/slot/bus. */

let ribOpen = true;
try { ribOpen = localStorage.getItem("dbx_ribbon") !== "0"; } catch (e) { /* ignore */ }
let ribStructSig = "";
let ribDragging = null;   /* wire key being bar-dragged (mirrors mixDragKey) */

function ribVisible() { return curView === "seq" && ribOpen; }

/* ---- mini-mixer ribbon ------------------------------------------------- */
function renderMiniRibbon() {
  const host = document.getElementById("ribcells");
  if (!host || !M) return;
  if (ribVisible()) ensureMixSub();   /* the ribbon is a mixer-data consumer */
  const sig = JSON.stringify([ribOpen, M.sel && M.sel.t,
    Array.from({ length: 8 }, (_, t) => mixPrefixFor(t))]);
  if (sig !== ribStructSig) { ribStructSig = sig; buildRibbonCells(host); }
  updateRibbonCells(host);
}
function buildRibbonCells(host) {
  host.innerHTML = "";
  for (let t = 0; t < 8; t++) {
    const prefix = mixPrefixFor(t);
    const tc = trackColor(t);
    const cell = document.createElement("div");
    cell.className = "ribcell" + (M.sel && M.sel.t === t ? " sel" : "") + (prefix ? "" : " ext");
    cell.dataset.t = t;
    cell.title = prefix ? "Open the Mixer on this track" : "sends MIDI out — no audio to mix";

    const num = document.createElement("span");
    num.className = "ribnum";
    num.style.color = tc;
    num.textContent = "T" + (t + 1);
    num.title = "Select this track (all views follow)";
    num.onclick = (e) => { e.stopPropagation();
      selectClip(t, (M && M.sel && M.sel.c) || 0); };
    cell.appendChild(num);

    if (prefix) {
      const bar = document.createElement("div");
      bar.className = "ribbar";
      bar.dataset.k = prefix + "volume";
      const fill = document.createElement("div");
      fill.className = "ribfill";
      fill.style.background = tc;
      bar.appendChild(fill);
      const notch = document.createElement("div");
      notch.className = "ribnotch";
      bar.appendChild(notch);
      wireRibbonDrag(bar);
      cell.appendChild(bar);

      const ms = document.createElement("span");
      ms.className = "ribms";
      const mb = document.createElement("button"); mb.className = "mute"; mb.textContent = "M";
      mb.title = "Audio mute";
      mb.onclick = (e) => { e.stopPropagation();
        mixSet(prefix + "muted", mixNum(prefix + "muted", 0) >= 1 ? 0 : 1); renderMiniRibbon(); };
      const sb = document.createElement("button"); sb.className = "solo"; sb.textContent = "S";
      sb.title = "Audio solo";
      sb.onclick = (e) => { e.stopPropagation();
        mixSet(prefix + "soloed", mixNum(prefix + "soloed", 0) >= 1 ? 0 : 1); renderMiniRibbon(); };
      ms.appendChild(mb); ms.appendChild(sb);
      cell.appendChild(ms);
    }

    cell.onclick = () => { if (prefix) jumpTo("mix", t); };
    host.appendChild(cell);
  }
}
function wireRibbonDrag(bar) {
  const key = bar.dataset.k;
  let lastSend = 0;
  const apply = (e) => {
    const r = bar.getBoundingClientRect();
    const v = Math.max(0, Math.min(2, (e.clientX - r.left) / Math.max(1, r.width) * 2));
    bar.querySelector(".ribfill").style.width = (v / 2 * 100) + "%";
    const t = now();
    if (t - lastSend >= 50) { lastSend = t; mixSet(key, Math.round(v * 10000) / 10000); }
    return v;
  };
  bar.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault();
    ribDragging = key; mixDragKey = key;
    bar.setPointerCapture(e.pointerId);
    apply(e);
  });
  bar.addEventListener("pointermove", (e) => { if (ribDragging === key) apply(e); });
  const end = (e) => {
    if (ribDragging !== key) return;
    const v = apply(e);
    mixSet(key, Math.round(v * 10000) / 10000);   /* settle write, unthrottled */
    ribDragging = null; mixDragKey = null; mixQuiet[key] = now();
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", () => { ribDragging = null; mixDragKey = null; });
  /* double-click resets to unity, like the Mixer's fader */
  bar.addEventListener("dblclick", () => { mixSet(key, 1); renderMiniRibbon(); });
}
function updateRibbonCells(host) {
  host.querySelectorAll(".ribcell").forEach(cell => {
    const t = +cell.dataset.t;
    const prefix = mixPrefixFor(t);
    cell.classList.toggle("sel", !!(M && M.sel && M.sel.t === t));
    if (!prefix) return;
    const wait = !mixSeeded(prefix);
    cell.classList.toggle("wait", wait);
    const bar = cell.querySelector(".ribbar");
    if (bar && bar.dataset.k !== ribDragging) {
      const v = mixNum(prefix + "volume", 1);
      bar.querySelector(".ribfill").style.width = (Math.max(0, Math.min(2, v)) / 2 * 100) + "%";
      bar.title = wait ? "syncing…" : ("LEVEL " + MIX_MODES[0].fmt(v) + " — drag to trim, double-click for 1.00x");
    }
    const ms = cell.querySelector(".ribms");
    if (ms) {
      ms.querySelector(".mute").classList.toggle("on", mixNum(prefix + "muted", 0) >= 1);
      ms.querySelector(".solo").classList.toggle("on", mixNum(prefix + "soloed", 0) >= 1);
    }
  });
}

/* ---- clip ribbon -------------------------------------------------------- */
/* Reparented into whichever panel view is showing — one element, one truth. */
function placeClipRibbon(view) {
  const rib = document.getElementById("clipribbon");
  if (!rib) return;
  if (view === "mix") {
    const mixer = document.getElementById("mixer");
    if (rib.parentNode !== mixer) mixer.insertBefore(rib, mixer.firstChild);
    rib.style.display = "";
  } else if (view === "sound") {
    const sound = document.getElementById("sound");
    if (rib.parentNode !== sound) sound.insertBefore(rib, sound.firstChild);
    rib.style.display = "";
  } else {
    rib.style.display = "none";
  }
  if (view !== "seq") renderClipRibbon();
}
function renderClipRibbon() {
  const rib = document.getElementById("clipribbon");
  if (!rib || !M) return;
  let html = "";
  M.tracks.forEach((trk, t) => {
    const col = trackColor(t);
    const hasAny = trk.has && trk.has.some(Boolean);
    const playing = !!trk.pl;
    const queued = trk.qc >= 0;
    /* the same truth the session grid paints: pl+ac = playing, qc = queued */
    const cls = "clipchip" + (playing ? " playing" : "") + (queued ? " queued" : "") +
      (hasAny ? "" : " emptych");
    const label = playing ? "▶" : queued ? "…" : hasAny ? "" : "·";
    const target = playing || queued ? (queued ? trk.qc : trk.ac)
      : (trk.has ? trk.has.findIndex(Boolean) : -1);
    const ttl = playing ? "playing — click to relaunch" :
      queued ? "queued" : hasAny ? "launch this track's first clip" : "no clips";
    html += `<span class="${cls}" data-t="${t}" data-c="${target}" title="T${t + 1}: ${ttl}"` +
      ` style="background:${hasAny ? col : hexA(col, 0.14)}">${label}</span>`;
  });
  rib.innerHTML = html;
  rib.querySelectorAll(".clipchip").forEach(chip => {
    chip.onclick = () => {
      const c = +chip.dataset.c;
      if (c >= 0) { launchClip(+chip.dataset.t, c); pullSoon(); }
    };
  });
}

/* ---- wiring -------------------------------------------------------------- */
document.getElementById("ribToggle").onclick = () => {
  ribOpen = !ribOpen;
  try { localStorage.setItem("dbx_ribbon", ribOpen ? "1" : "0"); } catch (e) { /* ignore */ }
  document.getElementById("ribcells").style.display = ribOpen ? "" : "none";
  document.getElementById("ribToggle").textContent = ribOpen ? "▾" : "▸";
  ribStructSig = "";
  renderMiniRibbon();
};
document.getElementById("ribcells").style.display = ribOpen ? "" : "none";
document.getElementById("ribToggle").textContent = ribOpen ? "▾" : "▸";

/* mixer-namespace pushes repaint whichever ribbon is on screen */
if (R && typeof R.onParamChange === "function") {
  R.onParamChange(params => {
    for (const k in params) {
      if (k.indexOf("chain:") === 0 || k.indexOf("move_fx:") === 0) {
        if (ribVisible()) renderMiniRibbon();
        return;
      }
    }
  });
}
/* model changes (selection, routing, playing/queued) at a light cadence */
setInterval(() => {
  if (ribVisible()) renderMiniRibbon();
  else if (curView !== "seq") renderClipRibbon();
}, 350);
