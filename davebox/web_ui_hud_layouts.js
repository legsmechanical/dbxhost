/* dAVEBOx remote UI — the Screen view's layouts: the body of the screen, one per
 * screen FAMILY, chosen by the first whose match(doc) is true (registration
 * order — prompts first, since a dialog can sit over a page that also drew).
 * Each gets (doc, body) and returns HTML. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const esc = H.esc;

  /* prompt — every confirm, notice and question: title, lines, buttons */
  H.layout('prompt', (d) => !!(d.body && d.body.prompt), (doc, b) => {
    const p = b.prompt, title = p.title || (b.header && b.header.text) || '';
    const lines = (p.lines || []).map((l) => sentence(l));
    const btns = (p.buttons || []).map((t, i) => '<div class="hud-btn' + (i === p.sel ? ' sel' : '') + '">' + esc(t) + '</div>').join('');
    return '<div class="hud-prompt"><div class="q">' + esc(sentence(title)) + '</div>' +
      (lines.length ? '<div class="s">' + lines.map(esc).join('<br>') + '</div>' : '') +
      (btns ? '<div class="hud-btns">' + btns + '</div>' : '') + '</div>';
  });
  /* The OLED's 4x5 face has no lowercase, so dialogs arrive in CAPS. Shown
   * as sentences; a word that was mixed-case (dAVEBOx) is kept. */
  const ACRONYMS = /^(MIDI|BPM|FX|USB|LFO|EQ|ADSR|CC|OK|DSP|UI|WAV|AIFF|ARP|DLY|NFX)\d*$/;
  function sentence(s) {
    s = String(s || '');
    /* word by word: an ALL-CAPS word is lowered, a mixed-case one (the
     * wordmark, a module's own name) is kept; then each sentence starts
     * with a capital */
    const words = s.split(/(\s+)/).map((w) => /[A-Z]/.test(w) && w === w.toUpperCase() && w.length > 1 &&
      !ACRONYMS.test(w.replace(/[^A-Z0-9]/g, '')) ? w.toLowerCase() : w);
    return words.join('').replace(/(^|[.!?]\s+)([a-z])/g, (m, a, c) => a + c.toUpperCase());
  }
  H.sentence = sentence;

  /* kit — a page of knobs: one row of 8, with any span pictures above (the
   * knobs then shrink to sit under them) */
  H.layout('kit', (d) => !!(d.body && d.body.knobs), (doc, b) => {
    const viz = H.vizRow(doc), under = !!viz;
    let html = viz + '<div class="hud-knobs">';
    for (let k = 0; k < 8; k++) html += H.cell(b.knobs[k], k, doc, { under });
    html += '</div>';
    if (b.chips) html += chips(b.chips);
    return html;
  });

  /* list — menus, pickers, browsers: more rows than the OLED, the selection,
   * a scroll position */
  H.layout('list', (d) => !!(d.body && d.body.list), (doc, b) => {
    const L = b.list, rows = L.rows || [], n = H.cfg.listRows;
    const selIn = Math.max(0, (L.sel | 0) - (L.first | 0));
    let start = Math.max(0, Math.min(rows.length - n, selIn - Math.floor(n / 2)));
    let html = '<div class="hud-list">';
    for (let i = start; i < Math.min(rows.length, start + n); i++) {
      const r = rows[i] || {};
      if (!r.label && r.value == null) { html += '<div class="hud-row gap"></div>'; continue; }
      const sel = i === selIn && L.sel >= 0;
      html += '<div class="hud-row' + (sel ? ' sel' : '') + (r.hdr ? ' hdr' : '') + (r.editing ? ' edit' : '') + '">' +
        (r.mark ? '<span class="q" style="margin:0 8px 0 0">' + esc(r.mark) + '</span>' : '') +
        '<span class="lab">' + esc(r.label) + '</span>' + (r.qual ? '<span class="q">' + esc(r.qual) + '</span>' : '') +
        (r.value != null ? '<span class="val">' + esc(r.value) + '</span>' : r.chevron ? '<span class="val">›</span>' : '') + '</div>';
    }
    const total = L.total || rows.length;
    if (total > n) {
      const top = ((L.first | 0) + start) / total, h = Math.min(1, n / total);
      html += '<div class="hud-scroll"><i style="top:' + (top * 100).toFixed(1) + '%;height:' + (h * 100).toFixed(1) + '%"></i></div>';
    }
    return html + '</div>';
  });

  /* big — a single value the device shows large (tempo, a level card) */
  H.layout('big', (d) => !!(d.body && d.body.big), (doc, b) => {
    const g = b.big;
    return '<div class="hud-bigv"><div class="n">' + esc(g.text) + '</div>' + (g.unit ? '<div class="u">' + esc(g.unit) + '</div>' : '') +
      (typeof g.frac === 'number' ? '<div class="bar"><i style="width:' + Math.round(g.frac * 100) + '%"></i></div>' : '') + '</div>';
  });

  /* card — a popup card's title + value (hudCard) */
  H.layout('card', (d) => !!(d.body && d.body.card), (doc, b) =>
    '<div class="hud-bigv"><div class="u">' + esc(b.card.title) + '</div><div class="n" style="font-size:64px">' + esc(b.card.value) + '</div></div>');

  /* chips — a row of on/off chips (when a screen draws only those) */
  H.layout('chips', (d) => !!(d.body && d.body.chips), (doc, b) => chips(b.chips));
  function chips(list) {
    return '<div class="hud-chips">' + list.map((c) => '<span class="hud-chip' + (c.on ? ' on' : '') + '">' + esc(c.label) + '</span>').join('') + '</div>';
  }
});
