/* dAVEBOx remote UI — the Mixer view (phase D of the remote-UI arc).
 *
 * Eight strips in track order, each showing the mixer position the track OWNS:
 * its instrument, level fader, pan, sends and AUDIO mute/solo. Values ride the
 * manager's mixer wire namespace (chain:<track>:<key> / move_fx:<bus>:<key> —
 * see schwung-manager/mixerkeys.go); which family a track addresses is derived
 * here from the snapshot's route/chan, mirroring ui/ui_engine.mjs exactly.
 *
 * ⚠ UI language: user-facing copy names the track's INSTRUMENT (module name,
 * "Move N", "MIDI") — never "chain", "slot" or "bus"; those stay in wire keys
 * and comments. ⚠ TWO mutes, never conflated: the session grid's M/S stops the
 * SEQUENCER; the strip's pair mutes AUDIO, and is labelled so. */

/* ---- addressing (mirrors ui/ui_engine.mjs — pinned by
 * tests/host/test_web_mixer_bus_law.sh) ----
 * A Move-routed track's bus is WHICH MOVE INSTRUMENT it plays — its CHANNEL
 * (the Instrument row's "Move 1..4") — never the track index: track 6 playing
 * Move 2 addresses bus 2. Clamped, not wrapped. */
var MIX_MOVE_BUSES = 4;
function moveBusForChannel(ch) {
  const n = ch | 0;
  return n < 1 ? 1 : (n > MIX_MOVE_BUSES ? MIX_MOVE_BUSES : n);
}

/* The strip laws, from ui_engine.mjs's SESS_KNOB_MODES: one table so a control
 * cannot pick up another's range or format. Level ceiling is the UI contract
 * (2x), not the host's permissive 4x wire clamp. */
const MIX_MODES = [
  { key: "volume", label: "LEVEL",  min: 0, max: 2, def: 1,
    fmt: v => v.toFixed(2) + "x" },
  { key: "pan",    label: "PAN",    min: 0, max: 1, def: 0.5,
    fmt: v => { const pct = Math.round((v - 0.5) * 200);
                return pct === 0 ? "C" : pct < 0 ? Math.abs(pct) + "L" : pct + "R"; } },
  { key: "send_a", label: "SEND A", min: 0, max: 1, def: 0,
    fmt: v => Math.round(v * 100) + "%" },
  { key: "send_b", label: "SEND B", min: 0, max: 1, def: 0,
    fmt: v => Math.round(v * 100) + "%" },
];

const mixKV = {};              /* wire key -> value (numbers as strings) */
let mixSubscribed = false;
let mixVisible = false;
let mixStructSig = "";         /* rebuild strips only when the shape changes */
let mixDragKey = null;         /* wire key being dragged — never clobber it */
let mixQuiet = {};             /* wire key -> ts of our last write (echo window) */

/* Incoming mixer keys (seed + live pushes) ride the same onParamChange stream
 * as everything else; they are OURS, not rui_* — applyParams ignores them. */
if (R && typeof R.onParamChange === "function") {
  R.onParamChange(params => {
    let touched = false;
    for (const k in params) {
      if (k.indexOf("chain:") === 0 || k.indexOf("move_fx:") === 0) {
        /* our own recent write echoes back through the notify ring — keep the
         * optimistic value while the pointer is (or just was) on the control */
        if (k === mixDragKey) continue;
        if (mixQuiet[k] && now() - mixQuiet[k] < 400) continue;
        mixKV[k] = params[k]; touched = true;
      }
    }
    if (touched && mixVisible) renderMixer();
  });
}

/* ---- per-track position: which wire prefix does track t address? ---- */
function mixPrefixFor(t) {
  const trk = (M && M.tracks && M.tracks[t]) || {};
  const route = trk.route === undefined ? 0 : trk.route;
  if (route === 1) return "move_fx:" + moveBusForChannel(trk.chan) + ":";
  if (route === 2) return null;                 /* MIDI out — no audio here */
  return "chain:" + t + ":";
}
function mixInstLabel(t) {
  const trk = (M && M.tracks && M.tracks[t]) || {};
  const route = trk.route === undefined ? 0 : trk.route;
  if (route === 1) return "Move " + moveBusForChannel(trk.chan);
  if (route === 2) return "MIDI";
  const name = mixKV["chain:" + t + ":synth_name"] || mixKV["chain:" + t + ":synth_module"];
  return name || "no instrument";
}
function mixNum(key, def) {
  const v = parseFloat(mixKV[key]);
  return Number.isFinite(v) ? v : def;
}
function mixSet(key, val) {
  mixKV[key] = String(val);
  mixQuiet[key] = now();
  R.setParam(key, String(val));
}

/* ---- render ---- */
function mixModeGlyph(trk) {
  if (trk.pm === 1) return "DRUM";
  if (trk.pm === 2) return "COND";
  return "NOTES";
}
function renderMixer() {
  const host = document.getElementById("mixstrips");
  if (!host) return;
  const anySolo = (() => {
    for (let t = 0; t < 8; t++) {
      const p = mixPrefixFor(t);
      if (p && mixNum(p + "soloed", 0) >= 1) return true;
    }
    return false;
  })();
  const sig = JSON.stringify([anySolo, (M && M.sel && M.sel.t) || 0,
    Array.from({ length: 8 }, (_, t) => mixPrefixFor(t) + "|" + mixInstLabel(t))]);
  if (sig !== mixStructSig) { mixStructSig = sig; host.innerHTML = ""; buildStrips(host, anySolo); }
  updateStrips(host);
}
function buildStrips(host, anySolo) {
  for (let t = 0; t < 8; t++) {
    const trk = (M && M.tracks && M.tracks[t]) || {};
    const prefix = mixPrefixFor(t);
    const el = document.createElement("div");
    el.className = "strip" + (M && M.sel && M.sel.t === t ? " sel" : "") + (prefix ? "" : " ext");
    el.dataset.t = t;

    const head = document.createElement("div");
    head.className = "thead";
    head.title = "Select this track (all views follow)";
    head.innerHTML = '<span class="tnum">T' + (t + 1) + "</span>" +
      '<span class="inst">' + escMix(mixInstLabel(t)) + "</span>" +
      '<span class="mode">' + mixModeGlyph(trk) + "</span>";
    head.onclick = () => {
      const c = (M && M.sel && M.sel.c) || 0;
      R.setParam(P + "t" + t + "_c" + c + "_ruisel", "");
      afterEdit(); pullSoon();
    };
    el.appendChild(head);

    if (!prefix) {
      const note = document.createElement("div");
      note.className = "ext-note";
      note.textContent = "sends MIDI out — no audio to mix here";
      el.appendChild(note);
      host.appendChild(el);
      continue;
    }

    /* level fader */
    const fwrap = document.createElement("div"); fwrap.className = "fader";
    const fader = mkRange(prefix + "volume", MIX_MODES[0], true);
    fwrap.appendChild(fader); el.appendChild(fwrap);
    const val = document.createElement("div"); val.className = "val"; val.dataset.k = prefix + "volume";
    el.appendChild(val);

    /* pan + sends */
    for (let m = 1; m < MIX_MODES.length; m++) {
      const mode = MIX_MODES[m];
      const ctl = document.createElement("div"); ctl.className = "ctl";
      const lab = document.createElement("label");
      lab.innerHTML = mode.label + ' <span class="val" data-k="' + prefix + mode.key + '"></span>';
      ctl.appendChild(lab);
      ctl.appendChild(mkRange(prefix + mode.key, mode, false));
      el.appendChild(ctl);
    }

    /* audio mute / solo — labelled: the sequencer M/S lives on the session grid */
    const ms = document.createElement("div"); ms.className = "ms";
    const mb = document.createElement("button"); mb.className = "mute"; mb.textContent = "M";
    mb.title = "Audio mute — silences this position's audio (the session grid M stops the sequencer)";
    mb.onclick = () => mixSet(prefix + "muted", mixNum(prefix + "muted", 0) >= 1 ? 0 : 1);
    const sb = document.createElement("button"); sb.className = "solo"; sb.textContent = "S";
    sb.title = "Audio solo — one group across every position";
    sb.onclick = () => mixSet(prefix + "soloed", mixNum(prefix + "soloed", 0) >= 1 ? 0 : 1);
    ms.appendChild(mb); ms.appendChild(sb); el.appendChild(ms);
    const msl = document.createElement("div"); msl.className = "mslabel"; msl.textContent = "AUDIO";
    el.appendChild(msl);

    if (anySolo && mixNum(prefix + "soloed", 0) < 1) el.classList.add("dim");
    host.appendChild(el);
  }
}
function mkRange(key, mode, vertical) {
  const inp = document.createElement("input");
  inp.type = "range";
  inp.min = mode.min; inp.max = mode.max; inp.step = (mode.max - mode.min) / 255;
  inp.dataset.k = key;
  if (vertical) inp.title = "Level — 1.00x is unity";
  inp.addEventListener("pointerdown", () => { mixDragKey = key; });
  inp.addEventListener("input", () => {
    let v = parseFloat(inp.value);
    /* pan sticky centre, matching the device feel (snapZone 0.02) */
    if (mode.key === "pan" && Math.abs(v - 0.5) < 0.02) { v = 0.5; inp.value = "0.5"; }
    mixSet(key, round4(v));
    const val = document.querySelector('#mixer .val[data-k="' + cssq(key) + '"]');
    if (val) val.textContent = mode.fmt(v);
  });
  inp.addEventListener("pointerup", () => { mixDragKey = null; mixQuiet[key] = now(); });
  /* double-click resets to the mode's default (unity / centre / dry) */
  inp.addEventListener("dblclick", () => { inp.value = String(mode.def); mixSet(key, mode.def);
    updateStrips(document.getElementById("mixstrips")); });
  return inp;
}
function updateStrips(host) {
  if (!host) return;
  host.querySelectorAll("input[type=range]").forEach(inp => {
    const key = inp.dataset.k;
    if (key === mixDragKey) return;
    const mode = MIX_MODES.find(m => key.endsWith(":" + m.key));
    if (!mode) return;
    inp.value = String(mixNum(key, mode.def));
  });
  host.querySelectorAll(".val").forEach(el => {
    const key = el.dataset.k;
    const mode = MIX_MODES.find(m => key.endsWith(":" + m.key));
    if (mode) el.textContent = mode.fmt(mixNum(key, mode.def));
  });
  host.querySelectorAll(".ms").forEach(ms => {
    const t = +ms.closest(".strip").dataset.t;
    const prefix = mixPrefixFor(t);
    if (!prefix) return;
    ms.querySelector(".mute").classList.toggle("on", mixNum(prefix + "muted", 0) >= 1);
    ms.querySelector(".solo").classList.toggle("on", mixNum(prefix + "soloed", 0) >= 1);
  });
}
function escMix(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function cssq(s) { return s.replace(/["\\]/g, "\\$&"); }
function round4(v) { return Math.round(v * 10000) / 10000; }

/* ---- view switching. The header stays; the playhead keeps running. ---- */
function setView(view) {
  mixVisible = view === "mix";
  document.getElementById("session").style.display = mixVisible ? "none" : "";
  document.getElementById("main").style.display = mixVisible ? "none" : "";
  document.getElementById("mixer").style.display = mixVisible ? "block" : "";
  document.getElementById("viewSeq").classList.toggle("on", !mixVisible);
  document.getElementById("viewMix").classList.toggle("on", mixVisible);
  if (mixVisible) {
    if (!mixSubscribed && typeof R.subscribeMixer === "function") {
      mixSubscribed = true; R.subscribeMixer();
    }
    mixStructSig = ""; renderMixer();
  }
  try { localStorage.setItem("dbx_view", view); } catch (e) { /* ignore */ }
}
document.getElementById("viewSeq").onclick = () => setView("seq");
document.getElementById("viewMix").onclick = () => setView("mix");

/* strips follow the model (selection, routing, instrument) at snapshot cadence;
 * a light interval covers M changes without hooking applyParams */
setInterval(() => { if (mixVisible) renderMixer(); }, 300);

/* restore the last view (sequencer stays the landing default) */
try { if (localStorage.getItem("dbx_view") === "mix") setView("mix"); } catch (e) { /* ignore */ }
