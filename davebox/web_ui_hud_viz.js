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

  const NAMES = { env: 'ENVELOPE', filt: 'FILTER', eq: 'EQ', samp: 'SAMPLE' };
  /* The picture row for a page's spans: each spans its knobs' columns. */
  H.vizRow = function (doc) {
    const b = doc.body || {}, sp = b.spans;
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
