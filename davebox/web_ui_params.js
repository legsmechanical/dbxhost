/* dAVEBOx remote UI — the generated parameter editor (window.chainParams).
 *
 * A self-contained, transport-agnostic renderer for a module's declared UI:
 * a `hierarchy` (levels of params / nav links / preset browsers) plus
 * `chain_params` metadata (key, name, type, min, max, step, options, unit,
 * display_format) and a flat bag of current values. It knows nothing about
 * WebSockets, slots, tabs or the page around it — every write leaves through
 * the caller's onSet(paramKey, value).
 *
 * EXTRACTED from schwung-manager/static/remote-ui.js (the manager's Remote UI
 * page) so the two stay visually and behaviourally the same instrument: the
 * knob geometry/drag law, the value formatting (which itself mirrors the
 * device's shadow_ui.js overlay), the preset browser, the breadcrumb and the
 * nav-stack reconciliation are that code with its global/WS/tab coupling
 * removed. Adaptations are noted inline.
 *
 * Public API (one global, one entry point):
 *   const ed = window.chainParams.mount(el, {
 *     hierarchy, chainParams, values, onSet(paramKey, value), title });
 *   ed.updateValues(values);   // merge fresh values, patch the DOM in place
 *   ed.destroy();              // drop listeners + empty the element
 *
 * `values` is keyed by BARE param key ("cutoff") and, tolerantly, by the
 * prefixed form the wire uses ("fx1:cutoff") — the caller may pass either.
 * onSet always receives the BARE key; the caller owns the prefix.
 *
 * ⚠ UI language: nothing here prints "chain", "slot" or "bus" — labels come
 * from the module's own metadata, and the fallbacks are the raw param keys. */

(function () {
  "use strict";

  /* ---- geometry / formatting (remote-ui.js, verbatim law) ---- */
  var KNOB_SIZE = 54, KNOB_RADIUS = 21;
  var ARC_START_DEG = 225, ARC_SWEEP_DEG = 270;
  var SEND_INTERVAL = 50;          /* ms — drag write throttle */
  var KNOB_ANIM_DURATION = 80;     /* ms — incoming-value ease */

  function degToRad(d) { return d * Math.PI / 180; }
  function polarToXY(cx, cy, r, deg) {
    var rad = degToRad(deg - 90);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function describeArc(cx, cy, r, startDeg, sweepDeg) {
    var start = polarToXY(cx, cy, r, startDeg);
    var end = polarToXY(cx, cy, r, startDeg + sweepDeg);
    var largeArc = sweepDeg > 180 ? 1 : 0;
    return "M " + start.x + " " + start.y +
      " A " + r + " " + r + " 0 " + largeArc + " 1 " + end.x + " " + end.y;
  }
  function valueToNorm(val, meta) {
    var min = (meta && meta.min !== undefined) ? meta.min : 0;
    var max = (meta && meta.max !== undefined) ? meta.max : 1;
    if (max === min) return 0;
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
  }
  function normToAngle(t) { return ARC_START_DEG + t * ARC_SWEEP_DEG; }
  function clampValue(val, meta) {
    if (meta.min !== undefined && val < meta.min) val = meta.min;
    if (meta.max !== undefined && val > meta.max) val = meta.max;
    return val;
  }

  /** printf-style display_format — matches the device's applyDisplayFormat(). */
  function applyDisplayFormat(fmt, num, meta) {
    if (!fmt) return null;
    var match = String(fmt).match(/^%?\.?(\d+)(f|%)$/);
    if (!match) return null;
    var decimals = parseInt(match[1], 10);
    var displayVal = num;
    if (meta && meta.unit === "%" && typeof meta.max === "number" && meta.max <= 1) {
      displayVal = num * 100.0;
    }
    if (match[2] === "%") return (num * 100).toFixed(decimals) + "%";
    var formatted = displayVal.toFixed(decimals);
    if (meta && meta.unit) return formatted + (meta.unit === "%" ? "%" : " " + meta.unit);
    return formatted;
  }

  /** Format a value for display — the device overlay's rules. */
  function formatValue(val, meta) {
    if (val === undefined || val === null) return "-";
    if (meta && (meta.type === "enum" || meta.type === "bool")) {
      if (meta.option_labels) {
        var lbl = meta.option_labels[String(val)];
        if (lbl !== undefined) return String(lbl);
      }
      if (meta.options) {
        var idx = parseInt(val, 10);
        if (idx >= 0 && idx < meta.options.length) return meta.options[idx];
      }
      return String(val);
    }
    if (meta && meta.type === "int") {
      var rounded = Math.round(parseFloat(val));
      if (isNaN(rounded)) return String(val);
      if (meta.unit) return rounded + (meta.unit === "%" ? "%" : " " + meta.unit);
      return String(rounded);
    }
    var num = parseFloat(val);
    if (isNaN(num)) return String(val);
    if (meta && meta.display_format) {
      var f = applyDisplayFormat(meta.display_format, num, meta);
      if (f !== null) return f;
    }
    var min = (meta && typeof meta.min === "number") ? meta.min : 0;
    var max = (meta && typeof meta.max === "number") ? meta.max : 1;
    if (min === 0 && max >= 1 && max <= 4) return Math.round(num * 100) + "%";
    var result = num.toFixed(2);
    if (meta && meta.unit) return result + (meta.unit === "%" ? "%" : " " + meta.unit);
    return result;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---- hierarchy helpers (remote-ui.js: hierarchyStructureKey /
   *      reconcileNavStack / resolveCompLevel, de-globalised) ---- */

  /** Fingerprint the navigation STRUCTURE only (level names + param/child ids +
   * knob mappings + list/select keys), so a re-broadcast that only carries new
   * VALUES doesn't force a rebuild and collapse the open submenu. */
  function hierarchyStructureKey(data) {
    if (!data || !data.levels) return "";
    var names = Object.keys(data.levels).sort(), parts = [];
    for (var i = 0; i < names.length; i++) {
      var ln = names[i], lvl = data.levels[ln] || {}, ids = [];
      if (Array.isArray(lvl.params)) {
        for (var j = 0; j < lvl.params.length; j++) {
          var p = lvl.params[j];
          if (typeof p === "string") ids.push(p);
          else if (p && p.key) ids.push("k:" + p.key);
          else if (p && p.level) ids.push("L:" + p.level);
        }
      }
      if (Array.isArray(lvl.knobs)) ids.push("kb:" + lvl.knobs.join(","));
      var selFields = ["list_param", "count_param", "items_param", "select_param"];
      for (var s = 0; s < selFields.length; s++) {
        if (lvl[selFields[s]]) ids.push(selFields[s] + ":" + lvl[selFields[s]]);
      }
      parts.push(ln + "{" + ids.join("|") + "}");
    }
    return parts.join(";");
  }

  /** Keep the open submenu across a re-broadcast when every level it points at
   * still exists; otherwise fall back to the root. */
  function reconcileNavStack(navStack, newData) {
    var levels = newData && newData.levels;
    if (!levels || !Array.isArray(navStack) || navStack.length === 0) return ["root"];
    for (var i = 0; i < navStack.length; i++) if (!levels[navStack[i]]) return ["root"];
    return navStack;
  }

  /* ---- the editor ---- */

  function mount(el, opts) {
    opts = opts || {};
    var st = {
      el: el,
      hierarchy: opts.hierarchy || null,
      meta: opts.chainParams || [],
      values: Object.assign({}, opts.values || {}),
      onSet: typeof opts.onSet === "function" ? opts.onSet : function () {},
      title: opts.title || "",
      navStack: ["root"],
      structKey: "",
      drag: null,           /* active knob drag */
      throttle: null,       /* drag write throttle handle */
      anims: {},            /* key -> running knob animation */
      lastAnimAt: {},
      destroyed: false
    };
    st.structKey = hierarchyStructureKey(st.hierarchy);

    /* ---- value + metadata access ---- */
    function findMeta(key) {
      for (var i = 0; i < st.meta.length; i++) if (st.meta[i].key === key) return st.meta[i];
      return null;
    }
    function getVal(key) {
      if (st.values[key] !== undefined) return st.values[key];
      /* tolerate prefixed keys ("fx1:cutoff") from callers that keep the wire form */
      for (var k in st.values) {
        if (k.length > key.length && k.slice(-(key.length + 1)) === ":" + key) return st.values[k];
      }
      return undefined;
    }
    function setLocal(key, v) { st.values[key] = String(v); }

    /* ---- level resolution ---- */
    function currentLevel() {
      if (!st.hierarchy || !st.hierarchy.levels) return null;
      return st.hierarchy.levels[st.navStack[st.navStack.length - 1]] || null;
    }
    /** A level whose only content is "children" auto-navigates into them. */
    function resolveLevel() {
      if (!st.hierarchy || !st.hierarchy.levels) return;
      var depth = 10;
      while (depth-- > 0) {
        var lvl = st.hierarchy.levels[st.navStack[st.navStack.length - 1]];
        if (!lvl || !lvl.children) break;
        if (!st.hierarchy.levels[lvl.children]) break;
        st.navStack.push(lvl.children);
      }
    }

    /* ---- knob ---- */
    function knobSVG(meta, value) {
      var cx = KNOB_SIZE / 2, cy = KNOB_SIZE / 2;
      var numVal = parseFloat(value);
      if (isNaN(numVal)) numVal = meta ? (meta.min || 0) : 0;
      var t = valueToNorm(numVal, meta);
      var ind = polarToXY(cx, cy, KNOB_RADIUS - 4, normToAngle(t));
      var bg = describeArc(cx, cy, KNOB_RADIUS, ARC_START_DEG, ARC_SWEEP_DEG);
      var sweep = t * ARC_SWEEP_DEG;
      var svg = '<svg class="cpk-knob-svg" data-raw-value="' + numVal + '" width="' + KNOB_SIZE +
        '" height="' + KNOB_SIZE + '" viewBox="0 0 ' + KNOB_SIZE + " " + KNOB_SIZE + '">';
      svg += '<path d="' + bg + '" fill="none" stroke="#2c3444" stroke-width="4" stroke-linecap="round"/>';
      if (sweep > 1) {
        svg += '<path class="cpk-knob-arc" d="' + describeArc(cx, cy, KNOB_RADIUS, ARC_START_DEG, sweep) +
          '" fill="none" stroke="#39d0c8" stroke-width="4" stroke-linecap="round"/>';
      }
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="2.5" fill="#6d7a8c"/>';
      svg += '<line class="cpk-knob-ind" x1="' + cx + '" y1="' + cy + '" x2="' + ind.x + '" y2="' + ind.y +
        '" stroke="#39d0c8" stroke-width="2" stroke-linecap="round"/>';
      svg += "</svg>";
      return svg;
    }
    /** In-place SVG update (no DOM rebuild) — remote-ui's updateKnobSVGInPlace. */
    function knobSVGInPlace(svgEl, value, meta) {
      var cx = KNOB_SIZE / 2, cy = KNOB_SIZE / 2;
      var numVal = parseFloat(value);
      if (isNaN(numVal)) numVal = meta ? (meta.min || 0) : 0;
      svgEl.setAttribute("data-raw-value", numVal);
      var t = valueToNorm(numVal, meta);
      var ind = polarToXY(cx, cy, KNOB_RADIUS - 4, normToAngle(t));
      var arc = svgEl.querySelector(".cpk-knob-arc");
      var sweep = t * ARC_SWEEP_DEG;
      if (sweep > 1) {
        var d = describeArc(cx, cy, KNOB_RADIUS, ARC_START_DEG, sweep);
        if (arc) arc.setAttribute("d", d);
        else {
          arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
          arc.setAttribute("class", "cpk-knob-arc");
          arc.setAttribute("fill", "none");
          arc.setAttribute("stroke", "#39d0c8");
          arc.setAttribute("stroke-width", "4");
          arc.setAttribute("stroke-linecap", "round");
          arc.setAttribute("d", d);
          var bgArc = svgEl.querySelector("path");
          if (bgArc && bgArc.nextSibling) svgEl.insertBefore(arc, bgArc.nextSibling);
          else svgEl.appendChild(arc);
        }
      } else if (arc) arc.removeAttribute("d");
      var line = svgEl.querySelector(".cpk-knob-ind");
      if (line) { line.setAttribute("x2", ind.x); line.setAttribute("y2", ind.y); }
    }

    function knobEls(key) {
      var c = st.el.querySelector('[data-cpk-knob="' + cssq(key) + '"]');
      if (!c) return null;
      return { c: c, svg: c.querySelector(".cpk-knob-svg"), val: c.querySelector(".cpk-knob-value") };
    }
    function knobDirect(key, value) {
      var e = knobEls(key); if (!e) return;
      var meta = findMeta(key);
      if (e.svg) knobSVGInPlace(e.svg, value, meta);
      if (e.val) e.val.textContent = formatValue(value, meta);
    }
    /** Incoming (not user-driven) change: ease it, unless updates are streaming
     * fast (< 100ms apart — a hardware knob being turned) or the step is tiny. */
    function knobAnimated(key, target) {
      var e = knobEls(key); if (!e || !e.svg) { knobDirect(key, target); return; }
      var meta = findMeta(key);
      if (!meta) { knobDirect(key, target); return; }
      var t = perfNow(), last = st.lastAnimAt[key] || 0;
      st.lastAnimAt[key] = t;
      if (t - last < 100) { cancelAnim(key); knobDirect(key, target); return; }
      var cur = parseFloat(e.svg.getAttribute("data-raw-value") || "0");
      if (isNaN(cur)) cur = meta.min || 0;
      var tgt = parseFloat(target);
      if (isNaN(tgt)) tgt = meta.min || 0;
      var range = (meta.max === undefined ? 1 : meta.max) - (meta.min === undefined ? 0 : meta.min);
      if (range > 0 && Math.abs(tgt - cur) / range < 0.005) { knobDirect(key, target); return; }
      cancelAnim(key);
      var anim = { from: cur, to: tgt, start: perfNow(), raf: 0 };
      st.anims[key] = anim;
      (function step() {
        if (st.destroyed) return;
        var p = Math.min(1, (perfNow() - anim.start) / KNOB_ANIM_DURATION);
        var v = anim.from + (anim.to - anim.from) * (1 - Math.pow(1 - p, 3));
        knobSVGInPlace(e.svg, v, meta);
        if (e.val) e.val.textContent = formatValue(v, meta);
        if (p < 1) anim.raf = requestAnimationFrame(step);
        else delete st.anims[key];
      })();
    }
    function cancelAnim(key) {
      if (st.anims[key]) { cancelAnimationFrame(st.anims[key].raf); delete st.anims[key]; }
    }

    function send(key, v) { st.onSet(key, v); }

    function renderKnob(key, meta) {
      var value = getVal(key);
      var fallback = meta ? (meta.min || 0) : 0;
      var v = value !== undefined ? value : fallback;
      var c = document.createElement("div");
      c.className = "cpk-knob";
      c.setAttribute("data-cpk-knob", key);
      c.innerHTML = knobSVG(meta, v) +
        '<div class="cpk-knob-label">' + escapeHtml((meta && meta.name) || key) + "</div>" +
        '<div class="cpk-knob-value">' + escapeHtml(formatValue(v, meta)) + "</div>";
      if (!meta) c.classList.add("cpk-nometa");

      function onDown(e) {
        e.preventDefault();
        var num = parseFloat(getVal(key));
        if (isNaN(num)) num = fallback;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        var dmin = 0, dmax = 1, dstep = 0.01;
        if (meta) {
          dmin = meta.min !== undefined ? meta.min : 0;
          if (meta.type === "enum" && meta.options) { dmax = meta.options.length - 1; dstep = 1; }
          else { dmax = meta.max !== undefined ? meta.max : 1; dstep = meta.step || (meta.type === "int" ? 1 : 0.01); }
        }
        st.drag = { key: key, startY: clientY, startValue: num, min: dmin, max: dmax,
                    step: dstep, type: meta ? meta.type : "float" };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onUp);
      }
      c.addEventListener("mousedown", onDown);
      c.addEventListener("touchstart", onDown, { passive: false });
      return c;
    }

    function onMove(e) {
      var d = st.drag; if (!d) return;
      if (e.preventDefault) e.preventDefault();
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var range = d.max - d.min;
      var v = d.startValue + (d.startY - clientY) * (range / 150);
      if (d.step > 0) v = Math.round(v / d.step) * d.step;
      v = clampValue(v, d);
      if (d.type === "int" || d.type === "enum") v = Math.round(v);
      setLocal(d.key, v);
      cancelAnim(d.key);
      knobDirect(d.key, v);
      if (!st.throttle) {
        st.throttle = setTimeout(function () { st.throttle = null; }, SEND_INTERVAL);
        send(d.key, v);
      }
    }
    function onUp() {
      var d = st.drag; if (!d) return;
      send(d.key, parseFloat(getVal(d.key)));
      st.drag = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    }

    /* ---- preset browser (prev / name / next) ---- */
    function renderPresetBrowser(level) {
      if (!level.list_param || !level.count_param) return null;
      var count = parseInt(getVal(level.count_param), 10) || 0;
      var current = parseInt(getVal(level.list_param), 10) || 0;
      var nameVal = level.name_param ? getVal(level.name_param) : null;
      var box = document.createElement("div");
      box.className = "cpk-presets";
      var prev = document.createElement("button");
      prev.className = "cpk-presetnav"; prev.textContent = "\u25C0";
      prev.disabled = current <= 0;
      prev.onclick = function () {
        if (current > 0) { setLocal(level.list_param, current - 1); send(level.list_param, current - 1); render(); }
      };
      var name = document.createElement("span");
      name.className = "cpk-presetname";
      name.textContent = (count ? (current + 1) + "/" + count + "  " : "") + (nameVal || ("Preset " + current));
      var next = document.createElement("button");
      next.className = "cpk-presetnav"; next.textContent = "\u25B6";
      next.disabled = count > 0 && current >= count - 1;
      next.onclick = function () {
        if (count === 0 || current < count - 1) {
          setLocal(level.list_param, current + 1); send(level.list_param, current + 1); render();
        }
      };
      box.appendChild(prev); box.appendChild(name); box.appendChild(next);
      return box;
    }

    /* ---- one param row (nav link, enum, float/int, or the visible
     *      no-metadata fallback) ---- */
    function renderParamItem(entry) {
      var key = null, label = null, navLevel = null;
      if (typeof entry === "string") key = entry;
      else if (entry && entry.level) { navLevel = entry.level; label = entry.label || entry.level; }
      else if (entry && entry.key) { key = entry.key; label = entry.label; }

      if (navLevel) {
        var nav = document.createElement("div");
        nav.className = "cpk-row cpk-nav";
        nav.innerHTML = '<span class="cpk-label">' + escapeHtml(label) + "</span>" +
          '<span class="cpk-arrow">\u203A</span>';
        nav.onclick = function () { st.navStack.push(navLevel); render(); };
        return nav;
      }
      if (!key) return null;

      var meta = findMeta(key);
      var value = getVal(key);
      if (!label && meta) label = meta.name;
      if (!label) label = key;

      var row = document.createElement("div");
      row.className = "cpk-row";
      row.setAttribute("data-cpk-row", key);
      var lab = document.createElement("span");
      lab.className = "cpk-label";
      lab.textContent = label;
      row.appendChild(lab);

      var ctl = document.createElement("div");
      ctl.className = "cpk-ctl";

      if (!meta) {
        /* ⚠ Degrade VISIBLY. A param the module declares in its UI but omits
         * from its metadata used to render as a dead text span (or nothing) —
         * indistinguishable from a param that doesn't exist. Show the raw key
         * and an editable text field, flagged, so the gap is obvious AND the
         * value is still reachable. */
        row.classList.add("cpk-nometa");
        lab.textContent = key;
        var warn = document.createElement("span");
        warn.className = "cpk-warn";
        warn.textContent = "no metadata";
        warn.title = "This module declares the parameter but publishes no range/type for it";
        ctl.appendChild(warn);
        var txt = document.createElement("input");
        txt.type = "text";
        txt.className = "cpk-text";
        txt.setAttribute("data-cpk-input", key);
        txt.value = value !== undefined ? String(value) : "";
        txt.onchange = function () { setLocal(key, txt.value); send(key, txt.value); };
        ctl.appendChild(txt);
      } else if ((meta.type === "enum" || meta.type === "bool") && meta.options) {
        var sel = document.createElement("select");
        sel.className = "cpk-select";
        sel.setAttribute("data-cpk-input", key);
        for (var i = 0; i < meta.options.length; i++) {
          var o = document.createElement("option");
          o.value = String(i); o.textContent = meta.options[i];
          if (String(i) === String(value)) o.selected = true;
          sel.appendChild(o);
        }
        sel.onchange = function () { setLocal(key, sel.value); send(key, parseInt(sel.value, 10)); };
        ctl.appendChild(sel);
      } else if (meta.type === "bool") {
        /* boolean without options: a plain on/off toggle */
        var tg = document.createElement("button");
        tg.className = "cpk-toggle";
        tg.setAttribute("data-cpk-input", key);
        var on = parseFloat(value) >= 1;
        tg.textContent = on ? "on" : "off";
        tg.classList.toggle("on", on);
        tg.onclick = function () {
          on = !on; setLocal(key, on ? 1 : 0); send(key, on ? 1 : 0);
          tg.textContent = on ? "on" : "off"; tg.classList.toggle("on", on);
        };
        ctl.appendChild(tg);
      } else if (meta.type === "float" || meta.type === "int") {
        var sld = document.createElement("input");
        sld.type = "range";
        sld.className = "cpk-slider";
        sld.setAttribute("data-cpk-input", key);
        sld.min = meta.min !== undefined ? meta.min : 0;
        sld.max = meta.max !== undefined ? meta.max : (meta.type === "int" ? 127 : 1);
        sld.step = meta.step || (meta.type === "int" ? 1 : 0.01);
        sld.value = value !== undefined ? value : sld.min;
        var vd = document.createElement("span");
        vd.className = "cpk-val";
        vd.setAttribute("data-cpk-value", key);
        vd.textContent = formatValue(value !== undefined ? value : sld.min, meta);
        sld.oninput = function () {
          var v = meta.type === "int" ? parseInt(sld.value, 10) : parseFloat(sld.value);
          setLocal(key, v);
          vd.textContent = formatValue(v, meta);
          if (!st.throttle) {
            st.throttle = setTimeout(function () { st.throttle = null; }, SEND_INTERVAL);
            send(key, v);
          }
        };
        sld.onchange = function () {
          var v = meta.type === "int" ? parseInt(sld.value, 10) : parseFloat(sld.value);
          setLocal(key, v); send(key, v);
        };
        ctl.appendChild(sld);
        ctl.appendChild(vd);
      } else {
        var span = document.createElement("span");
        span.className = "cpk-val";
        span.setAttribute("data-cpk-value", key);
        span.textContent = value !== undefined ? String(value) : "?";
        ctl.appendChild(span);
      }

      row.appendChild(ctl);
      return row;
    }

    /* ---- breadcrumb ---- */
    function renderBreadcrumb(into) {
      into.innerHTML = "";
      if (!st.hierarchy || !st.hierarchy.levels) return;
      var back = document.createElement("button");
      back.className = "cpk-back";
      back.textContent = "\u2039 back";
      back.onclick = function () { st.navStack.pop(); if (!st.navStack.length) st.navStack = ["root"]; render(); };
      into.appendChild(back);
      for (var i = 0; i < st.navStack.length; i++) {
        if (i > 0) {
          var sep = document.createElement("span");
          sep.className = "cpk-crumbsep"; sep.textContent = "\u203A";
          into.appendChild(sep);
        }
        var lvl = st.hierarchy.levels[st.navStack[i]] || {};
        var label = lvl.label || st.navStack[i];
        if (i < st.navStack.length - 1) {
          var a = document.createElement("a");
          a.className = "cpk-crumb"; a.textContent = label;
          a.onclick = (function (idx) {
            return function () { st.navStack = st.navStack.slice(0, idx + 1); render(); };
          })(i);
          into.appendChild(a);
        } else {
          var cur = document.createElement("span");
          cur.className = "cpk-crumb cpk-crumb-cur"; cur.textContent = label;
          into.appendChild(cur);
        }
      }
    }

    /* ---- full render of the current level ---- */
    function render() {
      if (st.destroyed) return;
      st.el.innerHTML = "";
      st.el.classList.add("cpk");
      if (st.title) {
        var h = document.createElement("div");
        h.className = "cpk-title";
        h.textContent = st.title;
        st.el.appendChild(h);
      }
      if (!st.hierarchy || !st.hierarchy.levels) {
        var none = document.createElement("div");
        none.className = "cpk-empty";
        none.textContent = "no parameters";
        st.el.appendChild(none);
        return;
      }
      st.navStack = reconcileNavStack(st.navStack, st.hierarchy);
      resolveLevel();
      if (st.navStack.length > 1) {
        var bc = document.createElement("div");
        bc.className = "cpk-breadcrumb";
        renderBreadcrumb(bc);
        st.el.appendChild(bc);
      }
      var level = currentLevel();
      if (!level) {
        var nl = document.createElement("div");
        nl.className = "cpk-empty";
        nl.textContent = "no parameters";
        st.el.appendChild(nl);
        return;
      }

      /* preset browser: this level's, else the nearest ancestor that has one
       * (modules that hang their preset picker off an auto-navigated parent) */
      var presetLevel = null;
      if (level.list_param && level.count_param) presetLevel = level;
      else {
        for (var pi = 0; pi < st.navStack.length; pi++) {
          var anc = st.hierarchy.levels[st.navStack[pi]];
          if (anc && anc.list_param && anc.count_param) { presetLevel = anc; break; }
        }
      }
      if (presetLevel) {
        var pb = renderPresetBrowser(presetLevel);
        if (pb) st.el.appendChild(pb);
      }

      var knobs = level.knobs || [];
      if (knobs.length) {
        var kr = document.createElement("div");
        kr.className = "cpk-knobs";
        for (var i = 0; i < knobs.length && i < 8; i++) {
          kr.appendChild(renderKnob(knobs[i], findMeta(knobs[i])));
        }
        st.el.appendChild(kr);
      }

      var params = level.params || [];
      if (params.length) {
        var list = document.createElement("div");
        list.className = "cpk-list";
        for (var j = 0; j < params.length; j++) {
          var item = renderParamItem(params[j]);
          if (item) list.appendChild(item);
        }
        st.el.appendChild(list);
      }

      if (!knobs.length && !params.length && !presetLevel) {
        var e = document.createElement("div");
        e.className = "cpk-empty";
        e.textContent = "no parameters here";
        st.el.appendChild(e);
      }
    }

    /* ---- public: merge fresh values, patch in place ---- */
    function updateValues(values, hierarchy, chainParams) {
      if (st.destroyed) return;
      var structural = false;
      if (hierarchy !== undefined && hierarchy !== null) {
        var key = hierarchyStructureKey(hierarchy);
        if (key !== st.structKey) { st.structKey = key; structural = true; }
        st.hierarchy = hierarchy;
      }
      if (chainParams !== undefined && chainParams !== null) {
        if (JSON.stringify(chainParams) !== JSON.stringify(st.meta)) structural = true;
        st.meta = chainParams;
      }
      var changed = [];
      for (var k in (values || {})) {
        var bare = k.indexOf(":") >= 0 ? k.slice(k.lastIndexOf(":") + 1) : k;
        if (String(st.values[bare]) !== String(values[k])) changed.push(bare);
        st.values[bare] = values[k];
      }
      if (structural) { render(); return; }
      for (var i = 0; i < changed.length; i++) {
        var key2 = changed[i];
        if (st.drag && st.drag.key === key2) continue;
        var v = st.values[key2];
        if (knobEls(key2)) knobAnimated(key2, parseFloat(v));
        var row = st.el.querySelector('[data-cpk-row="' + cssq(key2) + '"]');
        if (row) {
          var input = row.querySelector('[data-cpk-input="' + cssq(key2) + '"]');
          if (input) {
            if (input.tagName === "SELECT" || input.type === "text") input.value = String(v);
            else if (input.type === "range") input.value = v;
          }
          var vd = row.querySelector('[data-cpk-value="' + cssq(key2) + '"]');
          if (vd) vd.textContent = formatValue(v, findMeta(key2));
        }
        /* a preset index/name change re-labels the browser */
        var lvl = currentLevel();
        if (lvl && (key2 === lvl.list_param || key2 === lvl.count_param || key2 === lvl.name_param)) render();
      }
    }

    function destroy() {
      st.destroyed = true;
      for (var k in st.anims) cancelAnimationFrame(st.anims[k].raf);
      st.anims = {};
      if (st.throttle) { clearTimeout(st.throttle); st.throttle = null; }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      st.drag = null;
      try { st.el.innerHTML = ""; } catch (e) { /* detached */ }
    }

    render();
    return { updateValues: updateValues, destroy: destroy, el: el };
  }

  function cssq(s) { return String(s).replace(/["\\]/g, "\\$&"); }
  function perfNow() {
    return (window.performance && performance.now) ? performance.now() : +new Date();
  }

  window.chainParams = {
    mount: mount,
    /* exported for reuse / tests — the formatting law is shared with the device */
    formatValue: formatValue,
    hierarchyStructureKey: hierarchyStructureKey
  };
})();
