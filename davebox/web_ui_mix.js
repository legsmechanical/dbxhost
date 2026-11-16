/* dAVEBOx remote UI — the Mixer view (phase D of the remote-UI arc).
 *
 * Eight strips in track order, each showing the mixer position the track OWNS:
 * its instrument, level fader, pan, sends, the channel strip (EQ + comp, with
 * the comp's gain reduction) and AUDIO mute/solo. Values ride the
 * manager's mixer wire namespace (chain:<track>:<key> / move_fx:<bus>:<key> —
 * see schwung-manager/mixerkeys.go); which family a track addresses is derived
 * here from the snapshot's route/chan, mirroring ui/ui_engine.mjs exactly.
 *
 * ⚠ UI language: user-facing copy names the track's INSTRUMENT (module name,
 * "Move N", "MIDI") — never "chain", "slot" or "bus"; those stay in wire keys
 * and comments. ⚠ TWO mutes, never conflated: the session grid's M/S stops the
 * SEQUENCER; the strip's pair mutes AUDIO, and is labelled so. */

/* moveBusForChannel + mixKV live in web_ui_core.js since 2026-08-19: the
 * sequencer's track headers read both at LOAD time, and a later classic
 * script's const/let are in the temporal dead zone until it runs. */
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

/* THE CHANNEL STRIP (src/host/mix_strip.h; the device's ui/ui_strip.mjs
 * STRIP_SPECS): the 3-band EQ with its swept mid, then the one-knob comp, on
 * every position. Same keys, ranges, detent steps, defaults and readouts as the
 * device — tests/js/test_web_strip.mjs holds this table to STRIP_SPECS. The
 * mid's frequency is a 0..1 position, 125 Hz x 64^p. */
const STRIP_MODES = [
  { key: "eq_low",      label: "EQ LOW",   min: -15, max: 15, def: 0,   step: 0.5,   detent: 0,
    fmt: v => { const r = Math.round(v * 10) / 10; return r === 0 ? "0dB" : (r > 0 ? "+" : "") + r.toFixed(1) + "dB"; } },
  { key: "eq_mid",      label: "EQ MID",   min: -15, max: 15, def: 0,   step: 0.5,   detent: 0,
    fmt: v => { const r = Math.round(v * 10) / 10; return r === 0 ? "0dB" : (r > 0 ? "+" : "") + r.toFixed(1) + "dB"; } },
  { key: "eq_mid_freq", label: "EQ FREQ",  min: 0,   max: 1,  def: 0.5, step: 0.005,
    fmt: v => { const f = 125 * Math.pow(64, Math.max(0, Math.min(1, v)));
                return f < 999.5 ? Math.round(f) + "Hz" : (f / 1000).toFixed(2) + "k"; } },
  { key: "eq_high",     label: "EQ HIGH",  min: -15, max: 15, def: 0,   step: 0.5,   detent: 0,
    fmt: v => { const r = Math.round(v * 10) / 10; return r === 0 ? "0dB" : (r > 0 ? "+" : "") + r.toFixed(1) + "dB"; } },
  { key: "comp",        label: "COMPRESS", min: 0,   max: 1,  def: 0,   step: 0.01,
    fmt: v => (v > 0 ? Math.max(1, Math.round(v * 100)) + "%" : "OFF") },
];
/* gain reduction a full meter stands for — the device's STRIP_GR_ARC_DB */
const STRIP_GR_FULL_DB = 12;
const MIX_ALL_MODES = MIX_MODES.concat(STRIP_MODES);
/* the mode a wire key ("chain:3:eq_mid") belongs to — by its last segment, so
 * eq_mid never matches eq_mid_freq */
function mixModeFor(key) {
  const k = String(key || "").slice(String(key || "").lastIndexOf(":") + 1);
  return MIX_ALL_MODES.find(m => m.key === k) || null;
}
/* a slider's value on its mode's grid, with the gains' centre detent */
function mixSnap(mode, v) {
  if (mode.key === "pan" && Math.abs(v - 0.5) < 0.02) return 0.5;
  if (mode.detent !== undefined && Math.abs(v - mode.detent) < mode.step * 0.8) return mode.detent;
  return v;
}

/* The channel strip's controls under `prefix`, appended to `strip`: a small
 * EQ heading, a rule before the comp, a slider per control (made by `mk`, the view's own range
 * maker), and the comp's gain-reduction meter under its slider. Shared by the
 * Mixer view and the Sound view's strip card. */
function mixStripCtls(strip, prefix, mk) {
  const head = document.createElement("div"); head.className = "sect"; head.textContent = "EQ";
  strip.appendChild(head);
  for (const mode of STRIP_MODES) {
    if (mode.key === "comp") {               /* a rule, unlabelled: its own label says COMPRESS */
      const h2 = document.createElement("div"); h2.className = "sect";
      strip.appendChild(h2);
    }
    const ctl = document.createElement("div"); ctl.className = "ctl";
    const lab = document.createElement("label");
    lab.innerHTML = mode.label.replace(/^EQ /, "") + ' <span class="val" data-k="' + prefix + mode.key + '"></span>';
    ctl.appendChild(lab);
    ctl.appendChild(mk(prefix + mode.key, mode, false));
    if (mode.key === "comp") {
      const gr = document.createElement("div"); gr.className = "gr"; gr.dataset.k = prefix + "comp_gr";
      gr.title = "Gain reduction — how far the compressor is pulling the level down now";
      gr.innerHTML = "<i></i>";
      ctl.appendChild(gr);
    }
    strip.appendChild(ctl);
  }
}
/* the meters under `root` follow comp_gr (and hide while the comp is off) */
function mixGrUpdate(root) {
  root.querySelectorAll(".gr").forEach(gr => {
    const key = gr.dataset.k, prefix = key.slice(0, key.length - "comp_gr".length);
    const on = mixNum(prefix + "comp", 0) > 0;
    const db = on ? Math.min(0, mixNum(key, 0)) : 0;
    gr.classList.toggle("off", !on);
    gr.firstChild.style.width = Math.round(Math.min(1, -db / STRIP_GR_FULL_DB) * 100) + "%";
    gr.title = on ? "Gain reduction " + db.toFixed(1) + " dB" : "Compressor off";
  });
}

let mixSubscribed = false;
let mixVisible = false;
let mixStructSig = "";         /* rebuild strips only when the shape changes */
let mixDragKey = null;         /* wire key being dragged — never clobber it */
let mixQuiet = {};             /* wire key -> ts of our last write (echo window) */

/* Incoming mixer keys (seed + live pushes) ride the same onParamChange stream
 * as everything else; they are OURS, not rui_* — applyParams ignores them. */
if (R && typeof R.onParamChange === "function") {
  R.onParamChange(params => {
    let touched = false, namesFresh = false;
    for (const k in params) {
      if (k.indexOf("chain:") === 0 || k.indexOf("move_fx:") === 0) {
        /* our own recent write echoes back through the notify ring — keep the
         * optimistic value while the pointer is (or just was) on the control */
        if (k === mixDragKey) continue;
        if (mixQuiet[k] && now() - mixQuiet[k] < 400) continue;
        /* instrument names feed the sequencer's track headers too — when one
         * FIRST arrives, repaint the session grid or "Synth" sticks until the
         * next model change */
        if (k.endsWith(":synth_name") && mixKV[k] !== params[k]) namesFresh = true;
        mixKV[k] = params[k]; touched = true;
      }
    }
    if (touched && mixVisible) renderMixer();
    /* the Sound view's strip card too, so its gain-reduction meter moves at the
     * feed's rate rather than its 300 ms refresh (web_ui_sound.js — a later
     * script, but this only runs from events, after every script parsed) */
    if (touched && soundVisible) sndTick();
    if (namesFresh && M) renderSession();
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
  if (trk.pm === 2) return "Conductor";   /* drives responders; instrument row is inert */
  if (trk.pm === PM_AUDIO) return "Audio";   /* plays its clips' samples, no instrument */
  if (trk.pm === PM_SLICER) return "Slicer"; /* plays its one sample's chops */
  const route = trk.route === undefined ? 0 : trk.route;
  if (route === 1) return "Move " + moveBusForChannel(trk.chan);
  if (route === 2) return "MIDI";
  const name = mixKV["chain:" + t + ":synth_name"] || mixKV["chain:" + t + ":synth_module"];
  if (name) return name;
  /* The mixer seed trails the Sound view's cards by many seconds on a busy
   * param channel (each is a queue of one-by-one reads): take the instrument
   * card's name (the manager sends the manifest name with its metadata), and
   * say nothing rather than a false "no instrument" until one or the other
   * has spoken. */
  const card = typeof sndComps === "object" ? sndComps[t + "|synth"] : null;
  if (card && card.moduleName) return card.moduleName;
  if ((card && card.knownEmpty) || mixSeeded("chain:" + t + ":")) return "no instrument";
  return "…";
}
/* a strip is UNSYNCED until any of its keys has arrived (seed or push) —
 * rendering the defaults before that would show plausible but FALSE values
 * (1.00x on a track someone mixed to 0.6 reads as data, not placeholder) */
function mixSeeded(prefix) {
  for (const mode of MIX_MODES) if (mixKV[prefix + mode.key] !== undefined) return true;
  return mixKV[prefix + "muted"] !== undefined || mixKV[prefix + "soloed"] !== undefined;
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
  if (trk.pm === PM_AUDIO) return "AUDIO";
  if (trk.pm === PM_SLICER) return "SLICER";
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
    /* track color, matching the session grid: a thin cap + the track number.
     * Kept subtle so the SELECTED ring still reads instantly. */
    const tc = trackColor(t);
    el.style.borderTop = "3px solid " + tc;

    const head = document.createElement("div");
    head.className = "thead";
    head.title = "Select this track (all views follow)";
    head.innerHTML = '<span class="tnum" style="color:' + tc + '">T' + (t + 1) + "</span>" +
      '<span class="inst">' + escMix(mixInstLabel(t)) + "</span>" +
      '<span class="mode">' + mixModeGlyph(trk) + "</span>";
    head.onclick = () => {
      const c = (M && M.sel && M.sel.c) || 0;
      R.setParam(P + "t" + t + "_c" + c + "_ruisel", "");
      afterEdit(); pullSoon();
    };
    /* the instrument badge is a door: click it to edit that instrument */
    const instEl = head.querySelector(".inst");
    instEl.title = "Edit this instrument (Sound view)";
    instEl.onclick = (e) => { e.stopPropagation(); jumpTo("sound", t); };
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

    /* the channel strip: EQ, then COMP with its gain-reduction meter */
    mixStripCtls(el, prefix, mkRange);

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
  inp.min = mode.min; inp.max = mode.max; inp.step = mode.step || (mode.max - mode.min) / 255;
  inp.dataset.k = key;
  if (vertical) inp.title = "Level — 1.00x is unity";
  inp.addEventListener("pointerdown", () => { mixDragKey = key; });
  inp.addEventListener("input", () => {
    let v = parseFloat(inp.value);
    /* pan's sticky centre (snapZone 0.02) and the gains' 0 dB detent,
     * matching the device feel */
    const sv = mixSnap(mode, v);
    if (sv !== v) { v = sv; inp.value = String(v); }
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
  host.querySelectorAll(".strip").forEach(el => {
    const t = +el.dataset.t;
    const prefix = mixPrefixFor(t);
    el.classList.toggle("wait", !!prefix && !mixSeeded(prefix));
  });
  host.querySelectorAll("input[type=range]").forEach(inp => {
    const key = inp.dataset.k;
    if (key === mixDragKey) return;
    const mode = mixModeFor(key);
    if (!mode) return;
    inp.value = String(mixNum(key, mode.def));
  });
  host.querySelectorAll(".val").forEach(el => {
    const key = el.dataset.k;
    if (el.closest(".strip").classList.contains("wait")) { el.textContent = "…"; return; }
    const mode = mixModeFor(key);
    if (mode) el.textContent = mode.fmt(mixNum(key, mode.def));
  });
  mixGrUpdate(host);
  host.querySelectorAll(".ms").forEach(ms => {
    const t = +ms.closest(".strip").dataset.t;
    const prefix = mixPrefixFor(t);
    if (!prefix) return;
    ms.querySelector(".mute").classList.toggle("on", mixNum(prefix + "muted", 0) >= 1);
    ms.querySelector(".solo").classList.toggle("on", mixNum(prefix + "soloed", 0) >= 1);
  });
}
function cssq(s) { return s.replace(/["\\]/g, "\\$&"); }
function round4(v) { return Math.round(v * 10000) / 10000; }

/* ---- view switching. The header stays; the playhead keeps running.
 * Three views share it: the sequencer (the session grid + the clip editor),
 * the mixer, and the sound view (web_ui_sound.js). Each view owns one
 * container and one header button; this only shows/hides and hands over. ---- */
let curView = "seq";

/* jumpTo(view, t): EVERY cross-view affordance routes through here — the
 * track is selected on the DEVICE first (selectClip writes the _ruisel key;
 * device-side selection stays the single source of truth, the optimistic
 * M.sel update is just the immediate highlight), then the view switches. */
function ensureMixSub() {
  if (!mixSubscribed && typeof R.subscribeMixer === "function") {
    mixSubscribed = true;
    R.subscribeMixer();
  }
}

function jumpTo(view, t) {
  if (M && M.sel && typeof t === "number" && t !== M.sel.t) {
    selectClip(t, M.sel.c || 0);
  }
  setView(view);
}

function setView(view, fromHash) {
  if (view !== "mix" && view !== "sound" && view !== "screen") view = "seq";
  const seqOn = view === "seq", soundOn = view === "sound", screenOn = view === "screen";
  const changed = view !== curView;
  curView = view;
  mixVisible = view === "mix";
  soundVisible = soundOn;
  document.getElementById("session").style.display = seqOn ? "" : "none";
  document.getElementById("miniribbon").style.display = seqOn ? "" : "none";
  document.getElementById("main").style.display = seqOn ? "" : "none";
  document.getElementById("mixer").style.display = mixVisible ? "block" : "none";
  document.getElementById("sound").style.display = soundOn ? "block" : "none";
  document.body.dataset.view = view;   /* hides .seqonly chrome outside the sequencer */
  document.getElementById("viewSeq").classList.toggle("on", seqOn);
  document.getElementById("viewMix").classList.toggle("on", mixVisible);
  document.getElementById("viewSound").classList.toggle("on", soundOn);
  document.getElementById("viewScreen").classList.toggle("on", screenOn);
  hudShow(screenOn);                           /* web_ui_hud_source.js, parsed before any event fires */
  /* both non-sequencer views read the mixer wire namespace (the sound view for
   * the track's strip and its instrument's name); the sequencer's mini-mixer
   * ribbon subscribes through the same gate when it is on screen */
  if (mixVisible || soundOn) ensureMixSub();
  if (mixVisible) { mixStructSig = ""; renderMixer(); }
  placeClipRibbon(view);                       /* web_ui_ribbon.js, parsed before any event fires */
  if (seqOn) renderMiniRibbon();
  if (soundOn) { soundSig = ""; renderSound(); }
  /* stop the device stream when the view closes (defined in web_ui_sound.js —
   * later in load order, but setView only ever runs from events after parse) */
  else sndListen(-1);
  /* brief crossfade on the pane(s) coming in — only on a real change, so the
   * hashchange echo of our own hash write never replays it */
  if (changed) {
    const panes = seqOn ? ["session", "main"] : [mixVisible ? "mixer" : screenOn ? "screenview" : "sound"];
    for (const id of panes) {
      const el = document.getElementById(id);
      el.classList.remove("viewfade"); void el.offsetWidth; el.classList.add("viewfade");
    }
  }
  try { localStorage.setItem("dbx_view", view); } catch (e) { /* ignore */ }
  /* the address bar mirrors the view: back/forward walk view history, and a
   * bookmark (or a phone home-screen shortcut) opens straight into a view */
  if (!fromHash && location.hash !== "#" + view) {
    try { location.hash = view; } catch (e) { /* ignore */ }
  }
}
window.addEventListener("hashchange", () => {
  const v = (location.hash || "").slice(1);
  if (v === "seq" || v === "mix" || v === "sound" || v === "screen") setView(v, true);
});
document.getElementById("viewSeq").onclick = () => setView("seq");
document.getElementById("viewMix").onclick = () => setView("mix");
document.getElementById("viewScreen").onclick = () => setView("screen");

/* strips follow the model (selection, routing, instrument) at snapshot cadence;
 * a light interval covers M changes without hooking applyParams */
setInterval(() => { if (mixVisible) renderMixer(); }, 300);

/* The last-view restore lives at the bottom of web_ui_sound.js — the LAST view
 * script — so every view's render function exists before setView first runs. */
