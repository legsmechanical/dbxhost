/* dAVEBOx remote UI — the Screen view's regions: the frame around every screen.
 * Each is one registered renderer (see web_ui_hud_core.js); the order is
 * HUD.cfg.regions. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const esc = H.esc;

  /* status — one slim line on every screen: HUD.cfg.statusItems, left to right */
  H.region('status', (doc) =>
    '<div class="hud-status">' + H.cfg.statusItems.map((name) => name === 'spacer'
      ? '<span class="hud-spacer"></span>'
      : H.safe('item:' + name, H.items.get(name), doc)).join('') + '</div>');

  /* header — the OLED's header, unabbreviated. A touched knob names it (as on the
   * device); its range or default goes right. Module pages show their tabs. */
  H.region('header', (doc) => {
    const b = doc.body || {}, h = b.header || {};
    const tk = b.knobs && b.touched >= 0 ? b.touched : -1;
    const meta = tk >= 0 && doc.knobMeta ? doc.knobMeta[tk] : null;
    let title = h.text || '', right = h.right || '', cls = 't';
    let style = '';
    if (h.touchedName) {
      title = h.touchedName; cls += ' touch';
      if (tk >= 0) style = ' style="color:' + H.knobColor(tk) + '"';
      if (meta && typeof meta.min === 'number') right = rangeText(meta, b.knobs[tk]);
    }
    if (b.prompt && !h.touchedName) return '';            /* a dialog carries its own title */
    let tabs = '';
    if (b.page && b.page.count > 1 && Array.isArray(b.page.groups) && b.page.groups.length) {
      tabs = '<span class="tabs">' + b.page.groups.map((g, i) =>
        '<span class="tab' + (i === b.page.idx ? ' on' : '') + '">' + esc(g && (g.label || g.name || g) || '') + '</span>').join('') + '</span>';
    }
    if (b.page && b.page.count > 1 && !right) right = (b.page.idx + 1) + ' / ' + b.page.count;
    if (b.list && b.list.total > 1 && !right) right = (b.list.sel + 1) + ' / ' + b.list.total;
    return '<div class="hud-header"><span class="' + cls + '"' + style + '>' + esc(title) + '</span>' + tabs +
      (right ? '<span class="r">' + esc(right) + '</span>' : '') + '</div>';
  });
  function rangeText(meta, cell) {
    const fmt = (v) => (v > 0 && meta.min < 0 ? '+' : '') + v;
    return fmt(meta.min) + ' – ' + fmt(meta.max) + (cell && /%$/.test(cell.text || '') ? ' %' : '');
  }

  /* context — the per-mode band (HUD.cfg.contextBands): nothing when the
   * screen sends no context */
  H.region('context', (doc) => {
    if (!doc.context) return '';
    const parts = H.cfg.contextBands.map((n) => H.safe('band:' + n, H.bands.get(n), doc.context, doc)).filter(Boolean);
    return parts.length ? '<div class="hud-context">' + parts.join('') + '</div>' : '';
  });

  /* hints — the device's footer pairs as key chips; the right side carries one fact */
  H.region('hints', (doc) => {
    const b = doc.body || {}, hints = (b.prompt ? null : b.hints) || [];
    const words = hints.map((p) => '<span class="hint"><kbd>' + esc(cap(p[0])) + '</kbd>' + esc(String(p[1] || '').toLowerCase()) + '</span>').join('');
    const fact = H.safe('fact', factFor, doc);
    return '<div class="hud-hints">' + words + (fact ? '<span class="ctx">' + esc(fact) + '</span>' : '') + '</div>';
  });
  const cap = (s) => { s = String(s || ''); const w = H.cfg.hintWords && H.cfg.hintWords[s.toUpperCase()];
    return w || s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
  /* One fact for the hint line's right side: the touched knob's scope, else how
   * many knobs on this page are set. */
  function factFor(doc) {
    const b = doc.body || {}, m = doc.knobMeta;
    if (!m || !b.knobs) return '';
    const tk = b.touched;
    if (tk >= 0 && m[tk]) return m[tk].scope === 'track' ? 'applies to every clip on T' + ((doc.where.track | 0) + 1)
                              : m[tk].scope === 'clip' ? 'this clip only' : '';
    const set = m.filter((x) => x && x.isDefault === false).length;
    return set ? set + ' set on this page' : '';
  }

  /* overlay — what the device drew over the screen (bank picker, volume card,
   * notices): the same layouts, inside a card. */
  H.region('overlay', (doc) => {
    const o = doc.overlayLayer || {};
    const sub = Object.assign({}, doc, { body: o, knobMeta: null });
    let lay = null;
    for (const l of H.layouts) { try { if (l.match(sub)) { lay = l; break; } } catch (e) { /* skip */ } }
    const title = o.header && (o.header.text || o.header.touchedName);
    return '<div class="hud-ovl"><div class="card">' + (title ? '<div class="t">' + esc(title) + '</div>' : '') +
      (lay ? H.safe('overlay:' + lay.name, lay.fn, sub, o) : '') + '</div></div>';
  });

  /* band: banks — the track's banks as its bank map groups them, the current one lit */
  H.band('banks', (ctx) => {
    if (!ctx.banks || !ctx.banks.length) return '';
    return '<div class="hud-banks">' + ctx.banks.map((g) => '<span class="grp">' + (H.cfg.bankGroupLabels ? '<span class="gl">' + esc(g.label || '') + '</span>' : '') +
      g.items.map((it) => '<span class="bk' + (it.cur ? ' cur' : '') + '">' + esc(H.sentence ? H.sentence(it.name) : it.name) + '</span>').join('') + '</span>').join('') + '</div>';
  });

  /* band: steps — the visible page of the clip: steps with notes, the playing
   * one, the held one, beats marked; the page out of how many */
  H.band('steps', (ctx) => {
    const st = ctx.steps; if (!st) return '';
    let cells = '';
    for (let i = 0; i < 16; i++) {
      const c = st.on.charAt(i);
      cells += '<i class="' + (c === '1' ? 'on' : c === '-' ? 'out' : '') + (i % 4 === 0 ? ' bt' : '') + (i === st.play ? ' pl' : '') + (i === st.held ? ' hd' : '') + '"></i>';
    }
    let dots = '';
    if (st.pages > 1) for (let p = 0; p < st.pages; p++) dots += '<b class="' + (p === st.page ? 'on' : '') + '"></b>';
    return '<div class="hud-steps"><div class="cells">' + cells + '</div>' + (dots ? '<div class="pg">' + dots + '</div>' : '') + '</div>';
  });
});
