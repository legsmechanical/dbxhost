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

  /* overview — the Track / Session home screen: the info row (key and scale,
   * a held chord, the right-hand label), the eight tracks as tiles in their
   * colours with their clip and state, and the clip's position bar */
  H.layout('overview', (d) => !!(d.body && d.body.tracks), (doc, b) => {
    const inf = b.info || {};
    let html = '<div class="hud-ovw">';
    html += '<div class="hud-ovw-info"><span class="k' + (inf.underline ? ' u' : '') + '">' + esc(inf.left || '') + '</span>' +
      (inf.held ? '<span class="held">' + esc(inf.held) + '</span>' : '') +
      (inf.tag ? '<span class="tag">' + esc(inf.tag) + '</span>' : '') +
      (inf.right ? '<span class="r">' + (inf.follow ? '<span class="fol">▶|</span>' : '') + (inf.arrows ? '‹ ' : '') + esc(inf.right) + (inf.arrows ? ' ›' : '') + '</span>' : '') + '</div>';
    html += '<div class="hud-ovw-tracks">' + b.tracks.map((r, t) => {
      const col = trackColor(t);
      const st = r.muted ? ' mute' : r.playing ? ' play' : r.queued ? ' q' : r.has ? '' : ' empty';
      return '<div class="hud-tile' + st + (r.active ? ' cur' : '') + '" style="--c:' + col + '">' +
        '<span class="n">' + (t + 1) + '</span><span class="c">' + esc(r.clip) + '</span>' +
        (r.soloed ? '<span class="b s">S</span>' : r.muted ? '<span class="b m">M</span>' : '') + '</div>';
    }).join('') + '</div>';
    if (b.position) html += positionBar(b.position);
    return html + '</div>';
  });
  function positionBar(p) {
    let segs = '';
    for (let i = 0; i < p.pages; i++)
      segs += '<span class="seg' + (i === p.view ? ' view' : '') + (i === p.play ? ' play' : '') + '">' +
        (i === p.play && p.step >= 0 ? '<i style="left:' + (((p.step % 16) + 0.5) / 16 * 100).toFixed(1) + '%"></i>' : '') + '</span>';
    return '<div class="hud-pos">' + (p.left ? '<span class="more">‹</span>' : '') + '<div class="segs">' + segs + '</div>' +
      (p.right ? '<span class="more">›</span>' : '') + '<span class="len">' + p.len + ' steps</span></div>';
  }

  /* picture — a screen whose content IS a picture (the Daves): the device's
   * own frame, drawn crisp at full size in the accent colour, with its caption.
   * The frame is the live OLED one from the same stream (or, offline, the one
   * recorded with the fixture). */
  H.layout('picture', (d) => !!(d.body && d.body.picture), (doc, b) => {
    const p = b.picture;
    return '<div class="hud-pic"><canvas class="hud-oled" width="128" height="64" data-oled="1"></canvas>' +
      (p.caption ? '<div class="cap">' + esc(p.caption) + '</div>' : '') + (p.sub ? '<div class="sub">' + esc(p.sub) + '</div>' : '') + '</div>';
  });

  /* perf — performance mode: the engaged mods as big pills (a just-tapped one
   * alone, large), the Hold / Sync / Latch chips and the rate under them */
  H.layout('perf', (d) => !!(d.body && d.body.mods), (doc, b) => {
    const m = b.mods;
    let html = '<div class="hud-perf">';
    if (m.popup) html += '<div class="pop">' + esc(m.popup) + '</div>';
    else if (!m.names.length) html += '<div class="none">No mods engaged<br><span>Tap a pad to engage one</span></div>';
    else html += '<div class="mods">' + m.names.map((n, i) => '<span class="mod" style="--c:' + H.knobColor(i) + '">' + esc(n) + '</span>').join('') + '</div>';
    if (b.chips) html += chips(b.chips);
    return html + '</div>';
  });

  /* message — loading, exiting: a big line and a small one */
  H.layout('message', (d) => !!(d.body && d.body.message), (doc, b) => {
    const m = b.message;
    return '<div class="hud-bigv">' + (m.big ? '<div class="n" style="font-size:' + (m.big.length > 12 ? 48 : 72) + 'px">' + esc(m.wordmark ? m.big : sentence(m.big)) + '</div>' : '') +
      m.lines.map((l) => '<div class="u">' + esc(sentence(l)) + '</div>').join('') + '</div>';
  });

  /* bars — the per-step graphs (arp step pitch / velocity, repeat velocity /
   * nudge): eight columns over the eight knobs, the touched one lit */
  H.layout('bars', (d) => !!(d.body && d.body.bars), (doc, b) => {
    const g = b.bars, span = (g.max - g.min) || 1, bip = g.min < 0;
    let html = '<div class="hud-bars' + (bip ? ' bip' : '') + '">';
    for (let k = 0; k < 8; k++) {
      const v = g.values[k] | 0, off = k >= g.len, col = H.knobColor(k);
      const frac = Math.max(0, Math.min(1, (v - (bip ? 0 : g.min)) / (bip ? span / 2 : span)));
      const thru = g.mode === 'vel' && v > 127;
      const label = off ? '' : g.mode === 'vel' ? (v === 0 ? 'Off' : thru ? 'Thru' : String(v)) : (v > 0 ? '+' : '') + v;
      const h = Math.round(Math.abs(bip ? v / (span / 2) : frac) * 100);
      html += '<div class="col' + (k === g.touched ? ' tch' : '') + (off ? ' off' : '') + '">' +
        '<div class="well">' + (off ? '' : '<i class="' + (bip ? (v >= 0 ? 'up' : 'dn') : '') + (thru ? ' thru' : '') + '" style="' + (thru ? '' : 'height:' + Math.max(v === 0 ? 0 : 3, bip ? h / 2 : h) + '%;') + 'background:' + col + '"></i>') + '</div>' +
        '<div class="v"' + (k === g.touched ? ' style="color:' + col + '"' : '') + '>' + esc(label) + '</div><div class="l">' + (k + 1) + '</div></div>';
    }
    return html + '</div>';
  });

  /* kit — a page of knobs: one row of 8, with any span pictures above (the
   * knobs then shrink to sit under them) */
  H.layout('kit', (d) => !!(d.body && d.body.knobs), (doc, b) => {
    const viz = H.vizRow(doc) + noteBoxRow(b), under = !!viz;
    let html = viz + '<div class="hud-knobs">';
    for (let k = 0; k < 8; k++) html += H.cell(b.knobs[k], k, doc, { under });
    html += '</div>';
    if (b.chips) html += chips(b.chips);
    return html;
  });

  /* a held step's note (or a drum lane's pad), over knobs 1–2 as on the OLED */
  function noteBoxRow(b) {
    if (!b.noteBox) return '';
    const n = b.noteBox;
    return '<div class="hud-vrow"><div class="hud-viz hud-note' + (n.hi ? ' hi' : '') + '" style="grid-column:1 / span 2">' +
      '<span class="nm">' + esc(n.name) + '</span>' + (n.sub ? '<span class="sb">' + esc(n.sub) + '</span>' : '') + '</div></div>';
  }

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
    const side = (t, cls) => t ? '<span class="' + cls + '">' + esc(t) + '</span>' : '';
    return '<div class="hud-bigv"><div class="row">' + side(g.prev, 'pv') + '<span class="n">' + esc(g.text) + '</span>' + side(g.next, 'nx') + '</div>' +
      (g.unit ? '<div class="u">' + esc(g.unit) + '</div>' : '') +
      (typeof g.frac === 'number' ? '<div class="bar"><i style="width:' + Math.round(g.frac * 100) + '%"></i></div>' : '') +
      (b.stepStrip ? stepStrip(b.stepStrip) : '') + '</div>';
  });
  /* a clip's steps as a strip, bars numbered (the captured take behind a tempo choice) */
  function stepStrip(st) {
    const len = Math.max(1, st.len), bars = Math.max(1, Math.round(len / 16));
    let cells = '';
    for (let s = 0; s < len; s++) cells += '<i class="' + (st.on.charAt(s) === '1' ? 'on' : '') + (s % 16 === 0 ? ' sb' : s % 4 === 0 ? ' sq' : '') + '"></i>';
    let nums = ''; for (let b = 0; b < bars; b++) nums += '<span>' + (b + 1) + '</span>';
    return '<div class="hud-strip" style="--n:' + len + '">' + cells + '</div><div class="hud-stripn">' + nums + '</div>';
  }
  /* card — a popup card's title + value (hudCard) */
  H.layout('card', (d) => !!(d.body && d.body.card), (doc, b) =>
    '<div class="hud-bigv"><div class="u">' + esc(b.card.title) + '</div><div class="n" style="font-size:64px">' + esc(b.card.value) + '</div></div>');

  /* chips — a row of on/off chips (when a screen draws only those) */
  H.layout('chips', (d) => !!(d.body && d.body.chips), (doc, b) => chips(b.chips));
  function chips(list) {
    return '<div class="hud-chips">' + list.map((c) => '<span class="hud-chip' + (c.on ? ' on' : '') + '">' + esc(c.label) + '</span>').join('') + '</div>';
  }
});
