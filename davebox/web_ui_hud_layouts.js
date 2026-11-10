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
    /* the track and session overviews have their own big-screen designs
     * (web_ui_hud_overview.js); what is left here is the OLED's own layout,
     * for any other screen that draws the track tiles */
    if (H.ovwTrack && H.isTrackOverview(doc)) return H.ovwTrack(doc, b);
    if (H.ovwSession && H.isSessionOverview(doc)) return H.ovwSession(doc, b);
    const inf = b.info || {};
    let html = '<div class="hud-ovw">';
    html += '<div class="hud-ovw-info"><span class="k' + (inf.underline ? ' u' : '') + '">' + esc(inf.left || '') + '</span>' +
      (inf.held ? '<span class="held">' + esc(inf.held) + '</span>' : '') +
      (inf.tag ? '<span class="tag">' + esc(inf.tag) + '</span>' : '') +
      (inf.right ? '<span class="r">' + (inf.follow ? '<span class="fol">▶|</span>' : '') + (inf.arrows ? '‹ ' : '') + esc(inf.right) + (inf.arrows ? ' ›' : '') + '</span>' : '') + '</div>';
    html += '<div class="hud-ovw-tracks">' + b.tracks.map((r, t) => {
      const col = trackColor(t);
      const st = r.muted ? ' mute' : r.playing ? ' play' : r.queued ? ' q' : r.has ? '' : ' empty';
      return '<div class="hud-tile' + st + (r.active ? ' cur' : '') + '" data-in="track" data-t="' + t + '" style="--c:' + col + '">' +
        '<span class="n">' + (t + 1) + '</span><span class="c">' + esc(r.clip) + '</span>' +
        (r.soloed ? '<span class="b s">S</span>' : r.muted ? '<span class="b m">M</span>' : '') + '</div>';
    }).join('') + '</div>';
    if (b.wave) html += '<div class="hud-wavebox sm">' + H.waveSvg(b.wave, 60) + '</div>';
    else if (b.position) html += positionBar(b.position);
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

  /* picture — a screen whose content IS a picture (the Daves, a module's own
   * canvas, Move's own screen in co-run): the device's frame, drawn crisp in
   * the accent colour, with its caption. The frame is the live OLED one from
   * the same stream (or, offline, the one recorded with the fixture).
   * `knobs`: eight plain knobs under a smaller picture, unlabeled — the
   * screen names none of them. 'live' (a module's canvas takes every knob
   * message) turns and touches like any knob; 'shown' (Move's own screen: a
   * browser press cannot reach Move) is drawn for consistency and takes none.
   * Move's screen is drawn in its track's colour (Josh, 2026-11-10: "can we
   * make the co-run mirror screens match track color?"). */
  H.layout('picture', (d) => !!(d.body && d.body.picture), (doc, b) => {
    const p = b.picture;
    let knobs = '';
    if (p.knobs) {
      const touched = doc.touch && typeof doc.touch.knob === 'number' ? doc.touch.knob : -1;
      const kdoc = { where: doc.where, body: { touched }, knobMeta: null };
      for (let k = 0; k < 8; k++) knobs += H.cell({ kind: 'plain', label: '', text: '' }, k, kdoc, {});
      if (p.knobs !== 'live') knobs = knobs.replace(/ data-in="knob" data-k="\d+"/g, '');
      knobs = '<div class="hud-knobs hud-wknobs hud-plainknobs' + (p.knobs !== 'live' ? ' inert' : '') + '">' + knobs + '</div>';
    }
    /* the colour of the track whose Move instrument it is (p.track), not of
     * the track in focus — they can differ */
    const pt = typeof p.track === 'number' ? p.track : (doc.where ? doc.where.track | 0 : 0);
    const col = p.kind === 'move' && typeof trackColor === 'function' ? ' data-col="' + esc(trackColor(pt)) + '"' : '';
    return '<div class="hud-pic' + (knobs ? ' kn' : '') + '"><canvas class="hud-oled" width="128" height="64" data-oled="1"' + col + '></canvas>' +
      (p.caption ? '<div class="cap">' + esc(p.caption) + '</div>' : '') + (p.sub ? '<div class="sub">' + esc(p.sub) + '</div>' : '') + '</div>' + knobs;
  });

  /* wave — a sample editor: the readouts (Start · what the knob in hand does ·
   * End, lit while touched) over the waveform, full width */
  /* ...and every knob the page answers under it (SAMPLE / SLICES: what the
   * OLED shows only while one is touched — Josh, 2026-11-09) */
  H.layout('wave', (d) => !!(d.body && d.body.wave && (!d.body.knobs || (d.where && d.where.screen === 'audio-wave-editor'))), (doc, b) => {
    const ro = (pos) => (b.readouts || []).filter((r) => r.pos === pos).map((r) =>
      '<span class="ro' + (r.on ? ' on' : '') + '">' + esc(sentence(r.text)) + '</span>').join('');
    let knobs = '';
    if (b.knobs && b.knobs.some((c) => c && c.kind !== 'blank')) {
      const kdoc = { where: doc.where, body: { touched: b.touched, knobs: b.knobs }, knobMeta: null };
      for (let k = 0; k < 8; k++) knobs += H.cell(b.knobs[k], k, kdoc, {});
      knobs = '<div class="hud-knobs hud-wknobs">' + knobs + '</div>';
    }
    return '<div class="hud-ro"><span class="l">' + ro('left') + '</span><span class="m">' + ro('mid') + '</span><span class="r">' + ro('right') + '</span></div>' +
      '<div class="hud-wavebox ' + (knobs ? 'mid' : 'big') + '">' + H.waveSvg(b.wave, knobs ? 170 : 230) + '</div>' + knobs;
  });

  /* keyboard — text entry: the text so far, large, with a cursor; the key grid
   * and the special keys, the selected one lit */
  H.layout('keyboard', (d) => !!(d.body && d.body.keyboard), (doc, b) => {
    const k = b.keyboard, n = (k.chars || []).length;
    const key = (t, i, wide) => '<span class="key' + (i === k.selected ? ' sel' : '') + (wide ? ' w' : '') + '">' + esc(t) + '</span>';
    return '<div class="hud-kbd">' + (k.title ? '<div class="t">' + esc(k.title) + '</div>' : '') +
      '<div class="buf">' + esc(k.buffer) + '<i></i></div>' +
      '<div class="keys">' + (k.chars || []).map((c, i) => key(c, i)).join('') + '</div>' +
      '<div class="spec">' + (k.specials || []).map((t, j) => key(t, n + j, true)).join('') + '</div></div>';
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
      html += '<div class="col' + (k === g.touched ? ' tch' : '') + (off ? ' off' : '') + '" data-in="knob" data-k="' + k + '">' +
        '<div class="well">' + (off ? '' : '<i class="' + (bip ? (v >= 0 ? 'up' : 'dn') : '') + (thru ? ' thru' : '') + '" style="' + (thru ? '' : 'height:' + Math.max(v === 0 ? 0 : 3, bip ? h / 2 : h) + '%;') + 'background:' + col + '"></i>') + '</div>' +
        '<div class="v"' + (k === g.touched ? ' style="color:' + col + '"' : '') + '>' + esc(label) + '</div><div class="l">' + (k + 1) + '</div></div>';
    }
    return html + '</div>';
  });

  /* kit — a page of knobs: one row of 8, with any span pictures above (the
   * knobs then shrink to sit under them) */
  /* ...or, on a page a module draws itself (its `canvasBand`), that band of the
   * live OLED, crisp — the module's own picture, which nothing else describes —
   * in place of the pictures the page's parameters would get */
  const bandRow = (cb) => { const s = Math.min(4, 168 / cb.h);
    return '<div class="hud-bandbox"><canvas class="hud-band" data-band="' + [cb.x, cb.y, cb.w, cb.h].join(',') + '" width="' + cb.w * 4 + '" height="' + cb.h * 4 +
      '" style="width:' + Math.round(cb.w * s) + 'px;height:' + Math.round(cb.h * s) + 'px"></canvas></div>'; };
  /* band — a page the module draws itself with no knobs under it (MonkSynth's
   * Face: its own preset browser): that band of the live OLED, large */
  H.layout('band', (d) => !!(d.body && d.body.canvasBand && !d.body.knobs), (doc, b) => {
    const cb = b.canvasBand, s = Math.min(6, 330 / cb.h, 1100 / cb.w);
    return '<div class="hud-bandbox big"><canvas class="hud-band" data-band="' + [cb.x, cb.y, cb.w, cb.h].join(',') + '" width="' + cb.w * 6 + '" height="' + cb.h * 6 +
      '" style="width:' + Math.round(cb.w * s) + 'px;height:' + Math.round(cb.h * s) + 'px"></canvas></div>';
  });
  H.layout('kit', (d) => !!(d.body && d.body.knobs), (doc, b) => {
    const viz = b.canvasBand ? bandRow(b.canvasBand)
      : (b.wave ? '<div class="hud-wavebox">' + H.waveSvg(b.wave, 150) + '</div>' : '') + H.vizRow(doc) + noteBoxRow(b), under = !!viz;
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
    /* a picture under the list (an LFO, a lane's curve) takes rows from it */
    const L = b.list, rows = L.rows || [];
    const graph = !!(b.lfo || b.curve);
    /* not the OLED's five rows: a column fills the screen, and a long list
     * flows into a second column, so most menus are seen whole */
    /* in a pop-up card: one column, a card's height */
    const cols = graph || doc.inPopup ? 1 : Math.max(1, H.cfg.listColumns | 0);
    const per = graph ? Math.min(5, H.cfg.listRows) : doc.inPopup ? Math.min(8, H.cfg.listRows) : H.cfg.listRows;
    /* a gap row (a blank separator, or a divider rule) costs what it is drawn at — 13+3 px of a row's 31+3 (the column's gap) — so a column
     * holds more of a grouped menu */
    const isGap = (r) => !r || r.divider || (!r.label && r.value == null && r.note == null);
    const cost = (i) => isGap(rows[i]) ? 16 / 34 : 1;
    let all = 0; for (let i = 0; i < rows.length; i++) all += cost(i);
    const useCols = all > per ? Math.min(cols, Math.ceil(all / per)) : 1;
    const budget = per * useCols;
    const selIn = Math.max(0, (L.sel | 0) - (L.first | 0));
    /* the window: grow around the selection until the budget is spent */
    let start = Math.min(selIn, rows.length - 1), end = start + 1, used = rows.length ? cost(start) : 0;
    while (true) {
      const canDown = end < rows.length && used + cost(end) <= budget, canUp = start > 0 && used + cost(start - 1) <= budget;
      if (!canDown && !canUp) break;
      if (canDown && (end - selIn <= selIn - start || !canUp)) used += cost(end++); else used += cost(--start);
    }
    /* a window never opens or closes on a rule */
    while (end - start > 1 && isGap(rows[end - 1])) end--;
    while (end - start > 1 && isGap(rows[start])) start++;
    const n = end - start;
    let html = '<div class="hud-list' + (useCols > 1 ? ' cols' : '') + '" style="--per:' + per + '">';
    for (let i = start; i < end; i++) {
      const r = rows[i] || {};
      if (isGap(r)) { html += '<div class="hud-row gap' + (r.divider ? ' div' : '') + '"></div>'; continue; }
      const sel = i === selIn && L.sel >= 0;
      if (r.note != null) { html += '<div class="hud-row note">' + esc(r.note) + '</div>'; continue; }
      html += '<div class="hud-row' + (sel ? ' sel' : '') + (r.hdr ? ' hdr' : '') + (r.editing ? ' edit' : '') + '">' +
        (r.mark ? '<span class="q" style="margin:0 8px 0 0">' + esc(r.mark) + '</span>' : '') +
        '<span class="lab">' + esc(r.label) + '</span>' + (r.qual ? '<span class="q">' + esc(r.qual) + '</span>' : '') +
        (r.value != null ? '<span class="val">' + esc(r.value) + '</span>' : r.chevron ? '<span class="val">›</span>' : '') + '</div>';
    }
    if (b.lfo) html += '<div class="hud-wavebox sm" style="height:110px;margin-top:10px">' + H.lfoSvg(b.lfo) + '</div>';
    if (b.curve) html += '<div class="hud-wavebox sm" style="height:110px;margin-top:10px">' + H.curveSvg(b.curve, 110) + '</div>';
    const total = L.total || rows.length;
    if (total > n && useCols === 1) {
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

  /* The pads' LED palette (index -> RGB), from src/shared/constants.mjs's
   * table — device truth, not a tweak (smoke_hud pins it to that table). */
  H.ledPalette = ['000000','ff4032','800400','c93c00','ac1f00','8c5018','491804','fadc3b','ffc516','b6ff0e','79ff18','34c216','4f8a04','62ff55','297d53','269e72','31adff','3663fc','1a34ff','1c0ce6','153999','3937ff','5722ff','972bff','852178','ff1032','ff2bd4','a63421','995628','876700','90821f','4a8700','007f12','1853b2','624bad','733a67','f8bcaf','ff9b76','ffbf5f','d9af71','fff480','bfba69','bccc88','aeff99','7cdd9f','89b47d','80f3ff','7acefc','68a1d3','858fc2','bbaaf2','cdbbe4','ef8bb0','859d8c','6b756e','84909b','6a7075','88859d','6c6a75','9d859c','746a74','9c9d85','74756a','9d8484','756a6a','661914','210806','460300','280000','5d1700','200d00','470c00','1c0800','3b2b14','1c130a','250e05','0d0602','645817','201c07','664e08','211902','486605','172101','306609','0f2103','144d08','061902','1f3701','0a1100','276622','0c210b','143e29','081910','004d36','00180e','134566','061621','152764','070c20','0a1466','030621','0b045c','03011d','0a1c4c','040b1e','161666','070721','220d66','0b0421','3c1166','130521','350d30','11040f','660614','210206','661154','21051b','000000','595959','1a1a1a','ffffff','595959','cccccc','404040','141414','0000ff','00ff00','ff0000'];
  const ledHex = (i) => '#' + (H.ledPalette[i | 0] || '000000');

  /* bank map — THE PADS while the jog is held: all 32 in the colours they are
   * lit (doc.pads, from the device's own painter), bottom row last as on the
   * Move; the left 4x4's banks under their column heads, the right 4x4's
   * module slots with the module loaded in each. Two pads that belong
   * together (joins: a drum track's DRUM LANE over ALL LANES) touch, square
   * where they meet — one box with two halves, as the OLED draws them — each
   * keeping its own name and colour. Without doc.pads (an older
   * document), the left 4x4 from the bank map alone. */
  H.layout('bankmap', (d) => !!(d.body && d.body.bankMap), (doc, b) => {
    const m = b.bankMap, P = doc.pads;
    const cells = P ? P.cells : new Array(32).fill(null);
    const colors = P ? P.colors : new Array(32).fill(0);
    if (!P) (m.cols || []).forEach((c, ci) => c && (c.cells || []).forEach((name, r) => { if (name) { cells[(3 - r) * 8 + ci] = { label: name }; colors[(3 - r) * 8 + ci] = (m.cur && m.cur.c === ci && m.cur.r === r) ? 120 : 118; } }));
    const joins = (P ? P.joins : m.joins) || [];
    const jcls = {};
    joins.forEach((j) => { for (let r = j.r0; r <= j.r1; r++) jcls[(3 - r) * 8 + j.c] = (r > j.r0 ? ' jb' : '') + (r < j.r1 ? ' jt' : ''); });
    const heads = (P && P.heads) || (m.cols || []).map((c) => (c && c.label) || '');
    let html = '<div class="hud-pads">';
    for (let ci = 0; ci < 8; ci++) html += '<div class="ph" style="grid-column:' + (ci + 1) + '">' + esc(ci < 4 ? (heads[ci] || '') : ci === 6 && (!P || P.kind !== 'session') ? 'Modules' : '') + '</div>';
    for (let r = 0; r < 4; r++) for (let ci = 0; ci < 8; ci++) {
      const i = (3 - r) * 8 + ci;
      const c = cells[i], v = colors[i] | 0, lit = v !== 0, white = v === 120 || v === 122;
      const hex = ledHex(v);
      const st = 'grid-column:' + (ci + 1) + ';grid-row:' + (r + 2) + ';' +
        (lit ? (white ? 'background:#f4f6f8;border-color:#fff;color:#0b0d10' : 'background:' + hex + '38;border-color:' + hex + ';box-shadow:inset 0 0 0 1px ' + hex + '55') : '');
      html += '<div class="pad' + (lit ? ' lit' : '') + (white ? ' cur' : '') + (c && c.module ? ' mod' : '') + (jcls[i] || '') + '" data-in="pad" data-note="' + (68 + i) + '" style="' + st + '">' +
        (c ? '<span class="pl">' + esc(sentence(c.label)) + '</span>' + (c.sub ? '<span class="ps">' + esc(c.sub) + '</span>' : '') : '') + '</div>';
    }
    return html + '</div>';
  });

  /* notice — the OLED's notice card (saved, undone, a refusal, low battery):
   * its lines centred, the first as the title, a highlighted line in the
   * accent — drawn over the screen, which stays visible behind it */
  H.layout('notice', (d) => !!(d.body && d.body.notice), (doc, b) => {
    const n = b.notice, lines = n.lines || [];
    return '<div class="hud-notice">' + lines.map((l, i) => '<div class="' + (i === 0 ? 't' : 'l') + (i === n.highlight ? ' hi' : '') + '">' +
      esc(i === 0 ? l : sentence(l)) + '</div>').join('') + '</div>';
  });

  /* curve — a lane's shape alone (the lane-focus page drawn over a bank page) */
  H.layout('curve', (d) => !!(d.body && d.body.curve), (doc, b) =>
    (b.curve.name ? '<div class="hud-ro"><span class="l"><span class="ro on">' + esc(b.curve.name) + '</span></span></div>' : '') +
    '<div class="hud-wavebox big" style="height:200px">' + H.curveSvg(b.curve, 200) + '</div>');

  /* chips — a row of on/off chips (when a screen draws only those) */
  H.layout('chips', (d) => !!(d.body && d.body.chips), (doc, b) => chips(b.chips));
  function chips(list) {
    return '<div class="hud-chips">' + list.map((c) => '<span class="hud-chip' + (c.on ? ' on' : '') + '">' + esc(c.label) + '</span>').join('') + '</div>';
  }
});
