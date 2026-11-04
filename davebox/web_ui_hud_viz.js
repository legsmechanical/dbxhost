/* dAVEBOx remote UI — the Screen view's pictures that span cells: an envelope
 * over its attack/decay/sustain/release knobs, a filter curve over cutoff and
 * resonance, an EQ, a sample. The device declares each span (drawKitCells'
 * env/filt/eq/samp — "every span is declared, none is detected"); the picture
 * is drawn from the spanned cells' own values. One renderer per kind,
 * (cells, span, k0) → SVG inside a 0..W × 0..118 box. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const n = (c) => !c ? 0 : typeof c.norm === 'number' ? c.norm : typeof c.signed === 'number' ? (c.signed + 1) / 2 : 0.5;
  const path = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');

  H.vizKind('env', (cells, sp, k0, W) => {
    const cs = cells.slice(sp.start, sp.start + (sp.count || 4)), col = H.knobColor(k0);
    const y0 = 104, top = 26, seg = (W - 36) / 4;
    /* A D S R: times as widths, sustain as a level; a 3-knob envelope drops S */
    const has4 = cs.length >= 4;
    const a = n(cs[0]) * seg, d = n(cs[1]) * seg, s = has4 ? n(cs[2]) : 0, r = n(cs[has4 ? 3 : 2]) * seg;
    const sy = top + (y0 - top) * (1 - s), hold = has4 ? seg * 0.8 : 0;
    const pts = [[18, y0], [18 + a, top], [18 + a + d, has4 ? sy : y0]];
    if (has4) pts.push([18 + a + d + hold, sy]);
    pts.push([pts[pts.length - 1][0] + r, y0]);
    return '<path d="' + path(pts) + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + y0 + ' Z" fill="' + col + '" opacity=".14"/>' +
      '<path d="' + path(pts) + '" stroke="' + col + '" stroke-width="3" fill="none" stroke-linejoin="round"/>' +
      pts.slice(1, -1).map((p, i) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5" fill="' + H.knobColor(k0 + i + 1) + '"/>').join('');
  });

  H.vizKind('filt', (cells, sp, k0, W) => {
    const fc = n(cells[sp.start]), q = n(cells[sp.start + 1]), col = H.knobColor(k0), pts = [];
    for (let x = 0; x <= W; x += 4) {
      const f = x / W, bump = Math.exp(-Math.pow((f - fc) / 0.05, 2)) * 34 * q;
      const roll = f < fc ? 0 : (f - fc) * 260;
      pts.push([x, Math.min(118, 62 - bump + roll)]);
    }
    return '<path d="' + path(pts) + ' L' + W + ' 118 L0 118 Z" fill="' + col + '" opacity=".14"/>' +
      '<path d="' + path(pts) + '" stroke="' + col + '" stroke-width="3" fill="none"/>' +
      '<line x1="' + (fc * W).toFixed(1) + '" y1="0" x2="' + (fc * W).toFixed(1) + '" y2="118" stroke="#fff" opacity=".12"/>';
  });

  H.vizKind('eq', (cells, sp, k0, W) => {
    const cs = cells.slice(sp.start, sp.start + (sp.count || 2)), col = H.knobColor(k0), pts = [];
    for (let x = 0; x <= W; x += 4) {
      let g = 0;
      cs.forEach((c, i) => { const centre = (i + 0.5) / cs.length, v = (n(c) - 0.5) * 2;
        g += v * Math.exp(-Math.pow((x / W - centre) / (0.6 / cs.length), 2)); });
      pts.push([x, 59 - g * 40]);
    }
    return '<line x1="0" y1="59" x2="' + W + '" y2="59" stroke="#fff" opacity=".1"/>' +
      '<path d="' + path(pts) + '" stroke="' + col + '" stroke-width="3" fill="none"/>';
  });

  H.vizKind('samp', (cells, sp, k0, W) => {
    /* start / length markers over a placeholder wave (the device's peaks are
     * not sent yet: spec §5.1) */
    const s = n(cells[sp.start]), l = n(cells[sp.start + 1]), col = H.knobColor(k0);
    let wave = '';
    for (let x = 4; x < W - 4; x += 4) { const h = 10 + 30 * Math.abs(Math.sin(x * 0.07) * Math.cos(x * 0.013)); wave += '<rect x="' + x + '" y="' + (59 - h) + '" width="2" height="' + (2 * h) + '" fill="#2a2f37"/>'; }
    const x0 = s * W, x1 = Math.min(W, x0 + l * (W - x0));
    return wave + '<rect x="' + x0.toFixed(1) + '" y="8" width="' + Math.max(2, x1 - x0).toFixed(1) + '" height="102" fill="' + col + '" opacity=".16"/>' +
      '<line x1="' + x0.toFixed(1) + '" y1="8" x2="' + x0.toFixed(1) + '" y2="110" stroke="' + col + '" stroke-width="3"/>';
  });

  /* ── the module editor's widget groups (the library's resolved viz: a kind
   * and a role → parameter key map). Each draws from its roles' cells, in role
   * order, over the slots the group spans. A role a module did not declare is
   * simply absent; the picture draws with what is there. ── */
  const cellFor = (cells, key) => cells.find((c) => c && c.key === key) || null;
  const roleCells = (cells, g, order) => order.map((r) => g.roles[r] ? cellFor(cells, g.roles[r]) : null);
  const MOD = {
    envelope: (cells, g, k0, W) => {
      /* attack / hold / decay / sustain / release — times as widths, sustain as a level */
      const [A, Hd, D, Sv, R] = roleCells(cells, g, ['attack', 'hold', 'decay', 'sustain', 'release']);
      const y0 = 104, top = 26, seg = (W - 36) / 4, col = H.knobColor(k0);
      const pts = [[18, y0]]; let x = 18;
      x += (A ? n(A) : 0.2) * seg; pts.push([x, top]);
      if (Hd) { x += n(Hd) * seg * 0.6; pts.push([x, top]); }
      const sy = Sv ? top + (y0 - top) * (1 - n(Sv)) : (D ? y0 : top);
      if (D) { x += n(D) * seg; pts.push([x, sy]); }
      if (Sv) { x += seg * 0.8; pts.push([x, sy]); }
      x += (R ? n(R) : 0.3) * seg; pts.push([x, y0]);
      /* fill the span: scale the time axis so the shape uses the width it was given */
      const k = (W - 36) / Math.max(1, x - 18); pts.forEach((p) => { p[0] = 18 + (p[0] - 18) * Math.min(k, 6); });
      return '<path d="' + path(pts) + ' Z" fill="' + col + '" opacity=".14"/><path d="' + path(pts) + '" stroke="' + col + '" stroke-width="3" fill="none" stroke-linejoin="round"/>';
    },
    filter: (cells, g, k0, W) => {
      const [C, Q] = roleCells(cells, g, ['cutoff', 'resonance']);
      return H.viz.get('filt')([C, Q], { start: 0 }, k0, W);
    },
    eq: (cells, g, k0, W) => H.viz.get('eq')(roleCells(cells, g, ['low', 'mid', 'high']).filter(Boolean), { start: 0, count: 3 }, k0, W),
    lfo: (cells, g, k0, W) => {
      const [Sh, Rt, Dp] = roleCells(cells, g, ['shape', 'rate', 'depth']);
      const cyc = 1 + Math.round((Rt ? n(Rt) : 0.4) * 5), amp = 14 + 40 * (Dp ? n(Dp) : 0.7), col = H.knobColor(k0);
      return '<path d="' + path(wavePts(shapeName(Sh), cyc, amp, W)) + '" stroke="' + col + '" stroke-width="3" fill="none"/>';
    },
    waveform: (cells, g, k0, W) => {
      const c = cellFor(cells, g.roles.value || Object.values(g.roles)[0]);
      return '<path d="' + path(wavePts(shapeName(c), 2, 40, W)) + '" stroke="' + H.knobColor(k0) + '" stroke-width="3" fill="none"/>';
    },
    fader: (cells, g, k0, W) => {
      const c = cellFor(cells, g.roles.value || Object.values(g.roles)[0]), v = n(c), col = H.knobColor(k0);
      const x = W / 2 - 9;
      return '<rect x="' + x + '" y="10" width="18" height="98" rx="9" fill="#1d2026"/><rect x="' + x + '" y="' + (10 + 98 * (1 - v)).toFixed(1) +
        '" width="18" height="' + (98 * v).toFixed(1) + '" rx="9" fill="' + col + '"/>';
    },
    switch: (cells, g, k0, W) => {
      const c = cellFor(cells, g.roles.value || Object.values(g.roles)[0]), on = n(c) >= 0.5, col = H.knobColor(k0);
      return '<rect x="' + (W / 2 - 34) + '" y="44" width="68" height="32" rx="16" fill="' + (on ? col : '#1d2026') + '"/><circle cx="' +
        (on ? W / 2 + 18 : W / 2 - 18) + '" cy="60" r="12" fill="' + (on ? '#0b0c0e' : '#5a606c') + '"/>';
    },
    sample: (cells, g, k0, W) => H.viz.get('samp')(roleCells(cells, g, ['start', 'length']), { start: 0 }, k0, W),
  };
  /* the shape a waveform / LFO cell names: its option text */
  function shapeName(c) { return String((c && (c.text || '')) || 'sine').toLowerCase(); }
  function wavePts(name, cycles, amp, W) {
    const pts = [], mid = 59;
    for (let x = 6; x <= W - 6; x += 3) {
      const ph = ((x - 6) / (W - 12)) * cycles % 1;
      const y = /saw/.test(name) ? 1 - 2 * ph : /squ|pulse/.test(name) ? (ph < 0.5 ? 1 : -1)
              : /tri/.test(name) ? 1 - 4 * Math.abs(ph - 0.5) : /noise|rand|s&h|sample/.test(name) ? Math.sin(x * 12.9898) * 0.9
              : Math.sin(ph * Math.PI * 2);
      pts.push([x, mid - y * amp / 2]);
    }
    return pts;
  }
  const MODNAMES = { envelope: 'ENVELOPE', filter: 'FILTER', eq: 'EQ', lfo: 'LFO', waveform: 'WAVE', fader: 'LEVEL', switch: '', sample: 'SAMPLE' };

  const NAMES = { env: 'ENVELOPE', filt: 'FILTER', eq: 'EQ', samp: 'SAMPLE' };
  /* The picture row for a page's spans: each spans its knobs' columns. */
  H.vizRow = function (doc) {
    const b = doc.body || {}, sp = b.spans;
    if (Array.isArray(b.viz) && b.viz.length && b.knobs) {
      let html = '<div class="hud-vrow">';
      for (const g of b.viz) {
        const fn = MOD[g.kind] || (/^custom:/.test(g.kind) ? null : null);
        const cnt = Math.max(1, g.slotSpan | 0), W = cnt * 110;
        const tag = MODNAMES[g.kind] !== undefined ? MODNAMES[g.kind] : String(g.kind).replace(/^custom:/, '').toUpperCase();
        html += '<div class="hud-viz" style="grid-column:' + ((g.slotStart | 0) + 1) + ' / span ' + cnt + '"><span class="tag">' + H.esc(tag) + '</span>' +
          (fn ? '<svg viewBox="0 0 ' + W + ' 118" preserveAspectRatio="none">' + H.safe('viz:' + g.kind, fn, b.knobs, g, g.slotStart | 0, W) + '</svg>'
              : '<canvas class="hud-oled" data-oled="1" data-crop="' + (g.slotStart | 0) + ',' + cnt + '" width="128" height="64" style="width:100%;height:100%"></canvas>') + '</div>';
      }
      return html + '</div>';
    }
    if (!sp || !b.knobs) return '';
    let html = '<div class="hud-vrow">';
    for (const kind of Object.keys(sp)) {
      const s = sp[kind], cnt = s.count || (kind === 'env' ? 4 : 2), fn = H.viz.get(kind);
      if (!fn) continue;
      const W = cnt * 110;
      html += '<div class="hud-viz" style="grid-column:' + (s.start + 1) + ' / span ' + cnt + '"><span class="tag">' + NAMES[kind] + '</span>' +
        '<svg viewBox="0 0 ' + W + ' 118" preserveAspectRatio="none">' + H.safe('viz:' + kind, fn, b.knobs, s, s.start, W) + '</svg></div>';
    }
    return html + '</div>';
  };
});
