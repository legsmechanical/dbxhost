/* dAVEBOx remote UI — the Screen view's knob-cell widgets: one renderer per cell
 * KIND the device draws (ui_movy.mjs's cell descriptor), so a page reads the
 * same as on the OLED, only clearer. Each gets (cell, k, ctx) — k = knob
 * position (its colour), ctx = { touched, under } — and returns HTML.
 * A kind with no renderer draws as 'valsq' (the value, large). */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const esc = H.esc;

  /* the dial: an arc from 7:30 to 4:30, filled to the value (or from the
   * centre, bipolar), a dot at the value. `ghost` = a faint second arc (a held
   * step's lock over the track's value); `color` overrides the knob's colour
   * (the session overview's dials wear their TRACK's). */
  function dial(k, norm, bipolar, big, ghost, color) {
    const a0 = 135, sw = 270, r = 38, c = 46, w = big ? 9 : 7, col = color || H.knobColor(k);
    const P = (a) => [c + r * Math.cos(a * Math.PI / 180), c + r * Math.sin(a * Math.PI / 180)];
    const arc = (s, e, stroke, op) => {
      if (e - s < 0.5) return '';
      const [x0, y0] = P(s), [x1, y1] = P(e);
      return '<path d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + (e - s > 180 ? 1 : 0) + ' 1 ' +
        x1.toFixed(1) + ' ' + y1.toFixed(1) + '" stroke="' + stroke + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"' + (op ? ' opacity="' + op + '"' : '') + '/>';
    };
    const n = Math.max(0, Math.min(1, norm || 0)), v = a0 + sw * n, m = a0 + sw / 2;
    const s = bipolar ? Math.min(m, v) : a0, e = bipolar ? Math.max(m, v) : v;
    const [dx, dy] = P(v);
    return '<svg class="hud-w-svg" viewBox="0 0 92 92">' + arc(a0, a0 + sw, '#1d2026') +
      (ghost != null ? arc(a0, a0 + sw * Math.max(0, Math.min(1, ghost)), '#ffffff', 0.13) : '') +
      arc(s, e, col) + '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="' + (big ? 6 : 4.5) + '" fill="' + col + '"/></svg>';
  }
  H.dial = dial;

  /* Where the knob sits: its fill, else — a list of options with no fill of
   * its own (Resolution, Input Quantize) — the chosen option's place in the
   * list, so the dial turns as the value does. */
  const normOf = (c) => typeof c.norm === 'number' ? c.norm
    : (Array.isArray(c.options) && c.options.length > 1 && c.sel >= 0) ? c.sel / (c.options.length - 1) : 0;
  H.normOf = normOf;
  H.widget('arc',    (c, k, x) => dial(k, normOf(c), false, x.touched, c.ghost));
  H.widget('arcbip', (c, k, x) => dial(k, typeof c.signed === 'number' ? (c.signed + 1) / 2 : 0.5, true, x.touched, c.ghost));
  H.widget('frac',   (c, k, x) => dial(k, normOf(c), false, x.touched, c.ghost));
  /* a named enum: its word, framed, in the knob's colour when touched */
  H.widget('enumsq', (c, k, x) => '<div class="hud-w-sq" style="' + (x.touched ? 'border-color:' + H.knobColor(k) + ';color:' + H.knobColor(k) : '') + '">' + esc(c.sq || c.text) + '</div>');
  /* a number / note read-out: big, frameless */
  H.widget('valsq',  (c, k, x) => '<div class="hud-w-big" style="' + (x.touched ? 'color:' + H.knobColor(k) : '') + '">' + esc(c.sq || c.text) + '</div>');
  /* a two-state switch whose states are off/on */
  H.widget('pill',   (c, k) => { const on = !/^(off|no|0|--)$/i.test(String(c.text || '').trim());
    return '<div class="hud-w-pill' + (on ? ' on' : '') + '"' + (on ? ' style="background:' + H.knobColor(k) + '55"' : '') + '><i' + (on ? ' style="background:' + H.knobColor(k) + '"' : '') + '></i></div>'; });
  /* a two-state pair of words: a bar */
  H.widget('hbar',   (c, k) => '<div class="hud-w-hbar"><i style="width:' + Math.round((c.norm || 0) * 100) + '%;background:' + H.knobColor(k) + '"></i></div>');
  /* the fader column */
  H.widget('vbar',   (c, k) => '<div class="hud-w-vbar"><i style="height:' + Math.round((c.norm || 0) * 100) + '%;background:' + H.knobColor(k) + '"></i></div>');
  /* a value you cannot turn (a file, a path): a broken box with its head */
  H.widget('opaque', (c) => '<div class="hud-w-opaque">' + esc(c.text || '—') + '</div>');
  H.widget('blank',  () => '');
  /* a knob that is a BUTTON (touch + click does it: Apply Legato, Crop, Import
   * MIDI): a push button, drawn — not the OLED's "->", which reads as a value */
  H.widget('action', (c, k, x) => {
    const col = H.knobColor(k);
    return '<svg class="hud-w-svg hud-w-btn" viewBox="0 0 92 92"><circle cx="46" cy="46" r="34" fill="none" stroke="' + (x.touched ? col : '#2a2f37') + '" stroke-width="5"/>' +
      '<circle cx="46" cy="46" r="21" fill="' + col + '" opacity="' + (x.touched ? 1 : 0.75) + '"/>' +
      '<circle cx="46" cy="46" r="21" fill="none" stroke="#0b0d10" stroke-opacity=".35" stroke-width="3"/></svg>';
  });

  /* The name under a cell: the full name when it fits a column, else the
   * device's short label; an all-caps name reads as a sentence. */
  function cellName(c) {
    const n = c.name && c.name.length <= 13 ? c.name : (c.label || c.name || '');
    return H.sentence ? H.sentence(n) : n;
  }

  /* One knob cell: widget + value + name + adornments. */
  H.cell = function (c, k, doc, opt) {
    const b = doc.body || {}, touched = b.touched;
    if (!c || c.kind === 'blank') return '<div class="hud-kn blank"><div class="w">' + dial(k, 0) + '</div><div class="v">&nbsp;</div><div class="l"></div><div class="sub"></div></div>';
    /* the touched knob is LIT (its colour, a raised card); the others stay as
     * they are — Josh, 2026-11-08: "better to highlight active knobs than dim
     * inactive ones" */
    const isT = touched === k;
    const ctx = { touched: isT, under: !!(opt && opt.under) };
    const kind = H.widgets.get(c.kind) ? c.kind : 'valsq';
    const showVal = !(kind === 'valsq' || kind === 'enumsq' || kind === 'action');
    const adorn = H.cfg.adornments.map((a) => H.safe('adorn:' + a, H.adorns.get(a), c, k, doc)).filter(Boolean);
    const dot = adorn.length && adorn[0].indexOf('hud-a-dot') >= 0 ? adorn.shift() : '';
    /* `opens`: touch + click does something here — the OLED's corner
     * brackets, drawn as the browser's own corners (.hud-kn.opens) */
    /* the knob itself: a drag turns it, a press touches it, and a click on
     * one that opens (or a button knob) is touch + jog click (web_ui_hud_input.js) */
    const hand = ' data-in="knob" data-k="' + k + '"' + (c.opens || c.kind === 'action' ? ' data-click="1"' : '');
    return '<div class="hud-kn' + (isT ? ' tch' : '') + (c.lock ? ' lock' : '') + (ctx.under ? ' under' : '') + (c.opens ? ' opens' : '') + '"' + hand + (isT ? ' style="--kc:' + H.knobColor(k) + '"' : '') + '>' +
      '<div class="w">' + H.safe('widget:' + kind, H.widgets.get(kind), c, k, ctx) + '</div>' +
      (showVal ? '<div class="v"' + (isT ? ' style="color:' + H.knobColor(k) + '"' : '') + '>' + esc(c.text) + '</div>' : '') +
      '<div class="l">' + dot + esc(cellName(c)) + '</div>' +
      '<div class="sub">' + adorn.join('') + '</div></div>';
  };
});
