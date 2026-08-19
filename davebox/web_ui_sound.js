/* dAVEBOx remote UI — the Sound view.
 *
 * One screen for "what does the selected track SOUND like": the signal path of
 * whatever that track plays, left to right, ending in its mixer strip.
 *
 *   plays a Schwung instrument  →  MIDI FX · INSTRUMENT · FX 1..4 · AUDIO
 *   plays a Move instrument     →  "Move N — edit on device" · FX 1..4 · AUDIO
 *   sends MIDI out              →  nothing to edit here
 *
 * The instrument card is the module's OWN web panel when it ships one (an
 * iframe running its own connection, exactly as the manager pops it out);
 * otherwise the generated editor from web_ui_params.js, built from the
 * module's declared hierarchy + chain_params.
 *
 * Wire plumbing (comments/keys only — never user-facing copy):
 *   R.requestComponent(slot, component)  → hierarchy + chain_params + values
 *   R.onComponentData(cb)                → {type, slot, component, data}
 *   R.onParamChange(cb)                  → (params, slot); keys "<component>:<param>"
 *   R.setParamAt(slot, "<component>:<param>", value)
 * Chain components live at the track's own position; a Move instrument's insert
 * blocks are self-addressing components ("move_fx:<bus>:fx1") on position 0.
 *
 * This page is not slot-subscribed, so device→browser echo for these params is
 * not guaranteed: every (re)entry to the view and every change of the selected
 * track's identity re-requests each component from scratch. Edits are applied
 * optimistically and mirrored locally.
 *
 * ⚠ UI LANGUAGE: user-visible copy never says "chain", "slot" or "bus" — it
 * says the instrument's name, "Move N", or "MIDI". */

/* role labels for a track's own signal path (order = signal order) */
const SND_CHAIN_COMPONENTS = [
  { comp: "midi_fx1", role: "MIDI FX" },
  { comp: "synth", role: "INSTRUMENT" },
  { comp: "fx1", role: "FX 1" },
  { comp: "fx2", role: "FX 2" },
  { comp: "fx3", role: "FX 3" },
  { comp: "fx4", role: "FX 4" }
];
const SND_MOVE_FX = ["fx1", "fx2", "fx3", "fx4"];
const SND_EMPTY_AFTER = 2500;   /* ms with no reply → treat the position as empty */

let soundVisible = false;
let soundSig = "";              /* identity of what's on screen; a change rebuilds */
/* per-track scroll memory: returning to a track restores where you were in
 * its stack. Keyed by the track the pane was SHOWING when the scroll happened. */
const sndScroll = {};
let sndScrollTrack = -1;
document.getElementById("sound").addEventListener("scroll", () => {
  if (soundVisible && sndScrollTrack >= 0) {
    sndScroll[sndScrollTrack] = document.getElementById("sound").scrollTop;
  }
}, { passive: true });
const sndComps = {};            /* "<slot>|<component>" -> card state */
/* live device→browser sync: while the view shows a position, listen to its
 * notify-ring fan-out (listen-only — no seed; the cards request their own
 * metadata). A hardware knob turn then streams into the generated editors
 * through the onParamChange handler below. */
let sndListened = -1;
function sndListen(slot) {
  if (slot === sndListened) return;
  if (sndListened >= 0 && typeof R.unlistenSlot === "function") R.unlistenSlot(sndListened);
  sndListened = slot;
  if (slot >= 0 && typeof R.listenSlot === "function") R.listenSlot(slot);
}

/* ---- incoming metadata + values -------------------------------------- */
if (R && typeof R.onComponentData === "function") {
  R.onComponentData(msg => {
    if (!msg || !msg.component) return;
    const c = sndComps[msg.slot + "|" + msg.component];
    if (!c) return;
    if (msg.type === "hierarchy") { c.hierarchy = msg.data || null; c.gotHierarchy = true; }
    else if (msg.type === "chain_params") { c.chainParams = msg.data || []; c.gotParams = true; }
    else return;
    sndCardBody(c);
  });
}
if (R && typeof R.onParamChange === "function") {
  R.onParamChange((params, msgSlot) => {
    for (const key in sndComps) {
      const c = sndComps[key];
      /* the second arg is the message's position; tool pushes carry 0 and
       * overtake_dsp:-prefixed keys, so match BOTH position and prefix */
      if (msgSlot !== undefined && msgSlot !== c.slot) continue;
      const pfx = c.comp + ":";
      let fresh = null;
      for (const k in params) {
        if (k.indexOf(pfx) !== 0) continue;
        const bare = k.slice(pfx.length);
        if (String(c.values[bare]) === String(params[k])) continue;
        c.values[bare] = params[k];
        (fresh || (fresh = {}))[bare] = params[k];
      }
      if (!fresh) continue;
      c.gotValues = true;
      if (c.editor) c.editor.updateValues(fresh);
      if (fresh.bypassed !== undefined) sndPaintBypass(c);
    }
  });
}

/* ---- helpers ---------------------------------------------------------- */
function sndSel() { return (M && M.sel && M.sel.t) || 0; }
function sndRoute(t) {
  const trk = (M && M.tracks && M.tracks[t]) || {};
  return trk.route === undefined ? 0 : trk.route;
}
/** What the header of a component card calls the thing loaded there. The
 * module's own hierarchy names itself (root label); the instrument also has
 * the mixer's display name. Empty positions say so. */
function sndModuleName(c) {
  if (c.comp === "synth") {
    const n = mixKV["chain:" + c.slot + ":synth_name"] || mixKV["chain:" + c.slot + ":synth_module"];
    if (n) return n;
  }
  const h = c.hierarchy;
  if (h && h.levels && h.levels.root && h.levels.root.label) return h.levels.root.label;
  if (h && h.label) return h.label;
  return "";
}
function sndIsEmpty(c) {
  const hasH = !!(c.hierarchy && c.hierarchy.levels && Object.keys(c.hierarchy.levels).length);
  const hasP = !!(c.chainParams && c.chainParams.length);
  return !hasH && !hasP && !sndModuleName(c);
}

/* ---- the view --------------------------------------------------------- */
function renderSound() {
  const wrap = document.getElementById("soundwrap");
  if (!wrap) return;
  const t = sndSel();
  const trk = (M && M.tracks && M.tracks[t]) || {};
  const sig = [t, sndRoute(t), trk.chan, mixKV["chain:" + t + ":synth_module"] || ""].join("|");
  if (sig === soundSig && wrap.childNodes.length) { sndTick(); return; }
  soundSig = sig;
  sndTeardown();
  wrap.innerHTML = "";

  sndScrollTrack = t;
  /* which position to stream: the track's own for a hosted instrument, 0 for
   * a Move instrument's insert blocks, none for MIDI-out */
  const r0 = sndRoute(t);
  sndListen(r0 === 2 ? -1 : (r0 === 1 ? 0 : t));

  const head = document.createElement("div");
  head.className = "sndhead";
  head.textContent = "T" + (t + 1) + " — " + mixInstLabel(t);
  head.title = "Back to the sequencer on this track";
  head.onclick = () => jumpTo("seq", t);
  wrap.appendChild(head);

  /* two panes: the signal path as a VERTICAL stack (top → bottom = signal
   * order), the track's audio strip as a sticky sidebar on the right */
  const row = document.createElement("div");
  row.className = "sndcards";
  wrap.appendChild(row);
  const chain = document.createElement("div");
  chain.className = "sndchain";
  row.appendChild(chain);

  const route = sndRoute(t);
  if (route === 2) {
    chain.appendChild(sndStaticCard("MIDI", "sends MIDI out — nothing to edit here"));
    return;
  }
  if (route === 1) {
    const bus = moveBusForChannel(trk.chan);
    chain.appendChild(sndStaticCard("INSTRUMENT", "Move " + bus + " — edit on device"));
    for (let i = 0; i < SND_MOVE_FX.length; i++) {
      /* a Move instrument's insert blocks are self-addressing components on
       * position 0 — the same keys the on-device editor builds */
      chain.appendChild(sndCard(0, "move_fx:" + bus + ":" + SND_MOVE_FX[i], "FX " + (i + 1)));
    }
  } else {
    for (const spec of SND_CHAIN_COMPONENTS) chain.appendChild(sndCard(t, spec.comp, spec.role));
  }
  row.appendChild(sndMixCard(t));
  /* restore where this track's stack was scrolled to last time */
  document.getElementById("sound").scrollTop = sndScroll[t] || 0;
  sndTick();
}

/** A card with no controls — a role heading and a line of prose. */
function sndStaticCard(role, line) {
  const el = document.createElement("div");
  el.className = "sndcard sndcard-static";
  el.innerHTML = '<div class="sndcard-h"><span class="sndrole">' + escMix(role) + "</span></div>" +
    '<div class="sndcard-b"><div class="sndnote">' + escMix(line) + "</div></div>";
  return el;
}

/** A component card: header (role + what's loaded there + bypass) and a body
 * that becomes the module's own panel, the generated editor, or "empty". */
function sndCard(slot, comp, role) {
  const key = slot + "|" + comp;
  const c = sndComps[key] = {
    slot, comp, role, hierarchy: null, chainParams: null, values: {},
    gotHierarchy: false, gotParams: false, gotValues: false, editor: null,
    el: null, body: null, timer: 0
  };
  const el = document.createElement("div");
  el.className = "sndcard";
  el.dataset.comp = comp;
  const h = document.createElement("div");
  h.className = "sndcard-h";
  h.innerHTML = '<span class="sndrole">' + escMix(role) + '</span><span class="sndmod"></span>';
  if (comp !== "synth") {
    /* bypass is a plain wire toggle — it exists whether or not the module
     * publishes metadata for it, so it never depends on chain_params */
    const bp = document.createElement("button");
    bp.className = "sndbypass";
    bp.textContent = "bypass";
    bp.title = "Take this effect out of the sound";
    bp.onclick = () => {
      const on = parseFloat(c.values.bypassed) >= 1;
      c.values.bypassed = on ? "0" : "1";
      sndSet(c, "bypassed", on ? 0 : 1);
      sndPaintBypass(c);
    };
    h.appendChild(bp);
  }
  el.appendChild(h);
  const body = document.createElement("div");
  body.className = "sndcard-b";
  body.innerHTML = '<div class="sndnote dim">loading…</div>';
  el.appendChild(body);
  c.el = el; c.body = body;

  R.requestComponent(slot, comp);
  c.timer = setTimeout(() => { c.timer = 0; sndCardBody(c); }, SND_EMPTY_AFTER);
  sndCardBody(c);
  return el;
}

function sndSet(c, param, value) {
  R.setParamAt(c.slot, c.comp + ":" + param, String(value));
}
function sndPaintBypass(c) {
  if (!c.el) return;
  const bp = c.el.querySelector(".sndbypass");
  if (bp) bp.classList.toggle("on", parseFloat(c.values.bypassed) >= 1);
}

/** (Re)build a card's body from whatever has arrived so far. */
function sndCardBody(c) {
  if (!c.body) return;
  const name = sndModuleName(c);
  const modEl = c.el.querySelector(".sndmod");
  if (modEl) modEl.textContent = name;
  sndPaintBypass(c);

  const waiting = !c.gotHierarchy && !c.gotParams && c.timer;
  if (waiting) return;                       /* still the "loading…" placeholder */
  const empty = sndIsEmpty(c);
  const bp = c.el.querySelector(".sndbypass");
  if (bp) bp.style.display = empty ? "none" : "";   /* nothing here to take out */
  if (empty) {
    if (c.editor) { c.editor.destroy(); c.editor = null; }
    if (c.rendered !== "empty") {
      c.rendered = "empty";
      c.body.innerHTML = '<div class="sndnote dim">empty</div>';
    }
    return;
  }
  if (c.timer) { clearTimeout(c.timer); c.timer = 0; }

  /* The instrument may ship its own web panel; ask once, then either embed it
   * or fall back to the generated editor. */
  if (c.comp === "synth" && c.rendered === undefined) {
    c.rendered = "pending-panel";
    const id = mixKV["chain:" + c.slot + ":synth_module"] || "";
    const done = d => {
      if (c.rendered !== "pending-panel") return;
      c.rendered = undefined;
      if (d && d.url) sndMountPanel(c, d.url);
      else sndMountEditor(c);
    };
    if (!id) { done(null); return; }
    /* Asking is best-effort: a preview with no server behind it 404s (the JSON
     * parse throws) and an environment without fetch at all throws on the call
     * itself — both mean "no panel", and both must land on the generated
     * editor rather than an empty card. */
    Promise.resolve()
      .then(() => fetch("/api/module-panel/" + encodeURIComponent(id)))
      .then(r => r.json())
      .catch(() => ({}))
      .then(done);
    return;
  }
  if (c.rendered === "pending-panel") return;
  if (c.rendered === "panel") return;
  sndMountEditor(c);
}

/** The module's own panel, in its own connection (it takes the position from
 * the query string, exactly as the manager's pop-out does). */
function sndMountPanel(c, url) {
  c.rendered = "panel";
  c.body.innerHTML = "";
  const full = url + (url.indexOf("?") >= 0 ? "&" : "?") + "schwungStandalone=1&slot=" + c.slot;
  const frame = document.createElement("iframe");
  frame.className = "sndpanel";
  frame.src = full;
  frame.width = "520";
  frame.height = "420";
  c.body.appendChild(frame);
  const a = document.createElement("a");
  a.className = "sndopen";
  a.href = full;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "open in tab ↗";
  c.body.appendChild(a);
}

function sndMountEditor(c) {
  if (c.editor) { c.editor.updateValues(c.values, c.hierarchy, c.chainParams); return; }
  c.rendered = "editor";
  c.body.innerHTML = "";
  c.editor = window.chainParams.mount(c.body, {
    hierarchy: c.hierarchy,
    chainParams: c.chainParams || [],
    values: c.values,
    onSet: (param, value) => { c.values[param] = String(value); sndSet(c, param, value); }
  });
}

/* ---- the track's mixer strip, at the right edge ----------------------- */
function sndMixCard(t) {
  const el = document.createElement("div");
  el.className = "sndcard sndcard-mix";
  el.innerHTML = '<div class="sndcard-h"><span class="sndrole">AUDIO</span></div>';
  const body = document.createElement("div");
  body.className = "sndcard-b";
  el.appendChild(body);

  const prefix = mixPrefixFor(t);
  if (!prefix) {
    body.innerHTML = '<div class="sndnote dim">no audio to mix here</div>';
    return el;
  }
  const strip = document.createElement("div");
  strip.className = "strip";
  strip.dataset.t = t;
  body.appendChild(strip);

  /* level fader */
  const fwrap = document.createElement("div"); fwrap.className = "fader";
  fwrap.appendChild(sndRange(prefix + "volume", MIX_MODES[0], true));
  strip.appendChild(fwrap);
  const val = document.createElement("div");
  val.className = "val linky"; val.dataset.k = prefix + "volume";
  val.title = "Open the mixer";
  val.onclick = () => {
    jumpTo("mix", t);
    /* pulse the matching strip so the eye lands on it */
    setTimeout(() => {
      const s = document.querySelector('#mixer .strip[data-t="' + t + '"]');
      if (s) { s.classList.remove("pulse"); void s.offsetWidth; s.classList.add("pulse"); }
    }, 60);
  };
  strip.appendChild(val);

  /* pan + sends */
  for (let m = 1; m < MIX_MODES.length; m++) {
    const mode = MIX_MODES[m];
    const ctl = document.createElement("div"); ctl.className = "ctl";
    const lab = document.createElement("label");
    lab.innerHTML = mode.label + ' <span class="val" data-k="' + prefix + mode.key + '"></span>';
    ctl.appendChild(lab);
    ctl.appendChild(sndRange(prefix + mode.key, mode, false));
    strip.appendChild(ctl);
  }

  /* audio mute / solo — the session grid's M/S stops the sequencer instead */
  const ms = document.createElement("div"); ms.className = "ms";
  const mb = document.createElement("button"); mb.className = "mute"; mb.textContent = "M";
  mb.title = "Audio mute — silences this track's audio (the session grid M stops the sequencer)";
  mb.onclick = () => { mixSet(prefix + "muted", mixNum(prefix + "muted", 0) >= 1 ? 0 : 1); sndTick(); };
  const sb = document.createElement("button"); sb.className = "solo"; sb.textContent = "S";
  sb.title = "Audio solo";
  sb.onclick = () => { mixSet(prefix + "soloed", mixNum(prefix + "soloed", 0) >= 1 ? 0 : 1); sndTick(); };
  ms.appendChild(mb); ms.appendChild(sb); strip.appendChild(ms);
  const msl = document.createElement("div"); msl.className = "mslabel"; msl.textContent = "AUDIO";
  strip.appendChild(msl);
  return el;
}
function sndRange(key, mode, vertical) {
  const inp = document.createElement("input");
  inp.type = "range";
  inp.min = mode.min; inp.max = mode.max; inp.step = (mode.max - mode.min) / 255;
  inp.dataset.k = key;
  if (vertical) inp.title = "Level — 1.00x is unity";
  inp.addEventListener("pointerdown", () => { mixDragKey = key; });
  inp.addEventListener("input", () => {
    let v = parseFloat(inp.value);
    if (mode.key === "pan" && Math.abs(v - 0.5) < 0.02) { v = 0.5; inp.value = "0.5"; }
    mixSet(key, round4(v));
    const el = document.querySelector('#sound .val[data-k="' + cssq(key) + '"]');
    if (el) el.textContent = mode.fmt(v);
  });
  inp.addEventListener("pointerup", () => { mixDragKey = null; mixQuiet[key] = now(); });
  inp.addEventListener("dblclick", () => { inp.value = String(mode.def); mixSet(key, mode.def); sndTick(); });
  return inp;
}

/** Cheap per-frame refresh: strip values + card headings follow the model. */
function sndTick() {
  const root = document.getElementById("sound");
  if (!root) return;
  const head = root.querySelector(".sndhead");
  if (head) {
    const t = sndSel();
    head.textContent = "T" + (t + 1) + " — " + mixInstLabel(t);
  }
  /* scoped to the strip card: the generated editors also hold sliders and
   * value readouts, and they are NOT mixer wire keys */
  root.querySelectorAll(".sndcard-mix input[type=range]").forEach(inp => {
    const key = inp.dataset.k;
    if (!key || key === mixDragKey) return;
    const mode = MIX_MODES.find(m => key.endsWith(":" + m.key));
    if (mode) inp.value = String(mixNum(key, mode.def));
  });
  root.querySelectorAll(".sndcard-mix .val").forEach(el => {
    const key = el.dataset.k;
    if (!key) return;
    const mode = MIX_MODES.find(m => key.endsWith(":" + m.key));
    if (mode) el.textContent = mode.fmt(mixNum(key, mode.def));
  });
  root.querySelectorAll(".sndcard-mix .ms").forEach(ms => {
    const prefix = mixPrefixFor(+ms.closest(".strip").dataset.t);
    if (!prefix) return;
    ms.querySelector(".mute").classList.toggle("on", mixNum(prefix + "muted", 0) >= 1);
    ms.querySelector(".solo").classList.toggle("on", mixNum(prefix + "soloed", 0) >= 1);
  });
  /* module names arrive with the mixer seed, after the cards are built */
  for (const k in sndComps) {
    const c = sndComps[k];
    const el = c.el && c.el.querySelector(".sndmod");
    if (el) el.textContent = sndModuleName(c);
  }
}

function sndTeardown() {
  for (const k in sndComps) {
    const c = sndComps[k];
    if (c.timer) clearTimeout(c.timer);
    if (c.editor) c.editor.destroy();
    delete sndComps[k];
  }
}

/* follow the selection / routing at snapshot cadence, like the mixer does */
setInterval(() => { if (soundVisible) renderSound(); }, 300);

document.getElementById("viewSound").onclick = () => setView("sound");

/* Restore the last view — a #hash in the URL wins (bookmark / back-forward /
 * a phone home-screen shortcut straight into a view), localStorage otherwise.
 * This lives in the LAST view script so every view's render function exists
 * by the time setView runs. */
try {
  const h = (location.hash || "").slice(1);
  const v = (h === "seq" || h === "mix" || h === "sound") ? h : localStorage.getItem("dbx_view");
  if (v === "mix" || v === "sound") setView(v);
} catch (e) { /* ignore */ }
