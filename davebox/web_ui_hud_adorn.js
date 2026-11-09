/* dAVEBOx remote UI — the Screen view's adornments: the small extras drawn ON a
 * knob cell, never beside it. Order and presence: HUD.cfg.adornments. Each gets
 * (cell, k, doc) and returns HTML or ''. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const esc = H.esc;
  const meta = (doc, k) => (doc.knobMeta && doc.knobMeta[k]) || null;
  const touched = (doc, k) => doc.body && doc.body.touched === k;

  /* setDot — a dot beside the name: this knob is not at its default */
  H.adorn('setDot', (c, k, doc) => { const m = meta(doc, k);
    return m && m.isDefault === false ? '<span class="hud-a-dot" style="background:' + H.knobColor(k) + '"></span>' : ''; });

  /* auto — the parameter is automated in this clip (the device's AUTO mark) */
  H.adorn('auto', (c) => c.auto === 'auto' ? '<span class="hud-a-auto">AUTO</span>'
                       : c.auto === 'auto-off' ? '<span class="hud-a-auto" style="opacity:.5">AUTO OFF</span>' : '');

  /* stepLock — a held step locks this knob */
  H.adorn('stepLock', (c) => c.stepLock ? '<span class="hud-a-lock">STEP LOCK</span>' : '');

  /* enumNeighbours — under a touched option knob, the choices either side */
  H.adorn('enumNeighbours', (c, k, doc) => {
    if (!touched(doc, k) || !Array.isArray(c.options) || c.options.length < 2 || c.sel < 0) return '';
    const n = H.cfg.enumNeighbours, out = [];
    for (let i = Math.max(0, c.sel - n); i <= Math.min(c.options.length - 1, c.sel + n); i++)
      out.push(i === c.sel ? '<b>' + esc(c.options[i]) + '</b>' : esc(c.options[i]));
    return '<span class="hud-a-opts">' + out.join(' · ') + '</span>';
  });

  /* rangeBar — under a touched number knob, a bar with the default marked */
  H.adorn('rangeBar', (c, k, doc) => {
    const m = meta(doc, k);
    if (!touched(doc, k) || !m || typeof m.min !== 'number' || m.max === m.min || Array.isArray(c.options)) return '';
    const frac = typeof c.norm === 'number' ? c.norm : typeof c.signed === 'number' ? (c.signed + 1) / 2 : null;
    if (frac == null) return '';
    const def = typeof m.def === 'number' ? (m.def - m.min) / (m.max - m.min) : null;
    return '<span class="hud-a-range"><i style="width:' + Math.round(frac * 100) + '%;background:' + H.knobColor(k) + '"></i>' +
      (def != null && def >= 0 && def <= 1 ? '<u style="left:' + (def * 100).toFixed(1) + '%"></u>' : '') + '</span>';
  });
});
