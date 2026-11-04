/* dAVEBOx remote UI — the Screen view's knob-cell widgets: one renderer per cell
 * KIND the device draws (ui_movy.mjs's cell descriptor), so a page reads the
 * same as on the OLED, only clearer. Each gets (cell, k, ctx) — k = knob
 * position (its colour), ctx = { touched, under } — and returns HTML.
 * A kind with no renderer draws as 'valsq' (the value, large). */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const esc = H.esc;

  /* the dial: an arc from 7:30 to 4:30, filled to the value (or from the
   * centre, bipolar), a dot at the value. `ghost` = a faint second arc (a held
   * step's lock over the track's value). */
  function dial(k, norm, bipolar, big, ghost) {
    const a0 = 135, sw = 270, r = 38, c = 46, w = big ? 9 : 7, col = H.knobColor(k);
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

  H.widget('arc',    (c, k, x) => dial(k, c.norm, false, x.touched, c.ghost));
  H.widget('arcbip', (c, k, x) => dial(k, typeof c.signed === 'number' ? (c.signed + 1) / 2 : 0.5, true, x.touched, c.ghost));
  H.widget('frac',   (c, k, x) => dial(k, c.norm, false, x.touched, c.ghost));
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

  /* One knob cell: widget + value + name + adornments. */
  H.cell = function (c, k, doc, opt) {
    const b = doc.body || {}, touched = b.touched;
    if (!c || c.kind === 'blank') return '<div class="hud-kn blank"><div class="w">' + dial(k, 0) + '</div><div class="v">&nbsp;</div><div class="l"></div><div class="sub"></div></div>';
    const isT = touched === k, dim = touched >= 0 && !isT;
    const ctx = { touched: isT, under: !!(opt && opt.under) };
    const kind = H.widgets.get(c.kind) ? c.kind : 'valsq';
    const showVal = !(kind === 'valsq' || kind === 'enumsq');
    const adorn = H.cfg.adornments.map((a) => H.safe('adorn:' + a, H.adorns.get(a), c, k, doc)).filter(Boolean);
    const dot = adorn.length && adorn[0].indexOf('hud-a-dot') >= 0 ? adorn.shift() : '';
    return '<div class="hud-kn' + (isT ? ' tch' : '') + (dim ? ' dim' : '') + (c.lock ? ' lock' : '') + (ctx.under ? ' under' : '') + '">' +
      '<div class="w">' + H.safe('widget:' + kind, H.widgets.get(kind), c, k, ctx) + '</div>' +
      (showVal ? '<div class="v"' + (isT ? ' style="color:' + H.knobColor(k) + '"' : '') + '>' + esc(c.text) + '</div>' : '') +
      '<div class="l">' + dot + esc(c.name && c.name.length <= 16 ? c.name : (c.label || c.name || '')) + '</div>' +
      '<div class="sub">' + adorn.join('') + '</div></div>';
  };
});
