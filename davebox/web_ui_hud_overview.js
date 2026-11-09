/* dAVEBOx remote UI — the Screen view's two OVERVIEWS, redesigned for the
 * big screen rather than enlarged from the OLED (Josh, 2026-11-07: "track
 * overview screens are pretty useless" — he picked these from mockups).
 *
 *   TRACK (track.overview / track.drum-overview / track.audio-overview):
 *     the active clip as a piano roll — or its drum lanes, or its waveform —
 *     over the loop window, the viewed page outlined and the playing page
 *     tinted with the playhead; beside it the eight tracks. Everything the
 *     OLED overview says is here too: key / scale (underlined when scale-aware),
 *     the held chord, the lane's MUTED / SOLOED tag, follow, velocity input,
 *     each track's clip, playing / queued / muted / soloed / empty.
 *   SESSION (session.overview): the clip grid as cards — the four rows on
 *     the pads bright, the rest dim — each with its pattern in brief, and the
 *     current knob mode's eight values along the bottom.
 *
 * THE KNOBS, ALWAYS (Josh, 2026-11-08: "if knobs do something in the current
 * view mode we should always see them" · "it can all happen on the same
 * screen"): the device describes the knob page the OLED is not showing
 * (doc.knobs, ui_render.mjs hudDescribeKnobs), and a knob touch keeps the
 * overview up. TRACK: the bank's eight knobs as a strip under the roll (the
 * roll gives up the height; the eight tracks are the status strip's pips
 * then), the touched one LIT — its colour, a raised card — and named above
 * the strip with its options; nothing is dimmed ("better to highlight active
 * knobs than dim inactive ones"). SESSION: its eight dials, the touched one
 * lit and named in words.
 *
 * The notes come from the editor's own model (M, the rui snapshot): while a
 * track overview is up, the Screen view points the editor at the device's
 * track / clip / lane (follow, in web_ui_hud_source.js), so the roll costs the
 * device nothing. The session grid's states are M's too; the knob values and
 * the clips' thumbnails come from the device (doc.ovw). Without a model that
 * matches the device's selection the roll says so instead of guessing. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const esc = H.esc, LETTERS = 'ABCDEFGHIJKLMNOP';
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const nn = (p) => NOTE[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 2);
  const model = () => (typeof M !== 'undefined' ? M : null);
  const trackName = (m, t) => { try { const trk = m && m.tracks && m.tracks[t]; return (trk && typeof trackInstName === 'function' && trackInstName(trk, t)) || ('Track ' + (t + 1)); } catch (e) { return 'Track ' + (t + 1); } };

  H.isTrackOverview = (doc) => /^track\.(overview|drum-overview|audio-overview)$/.test((doc.where && doc.where.screen) || '');
  H.isSessionOverview = (doc) => ((doc.where && doc.where.screen) || '') === 'session.overview';

  /* ---------- the info line (both overviews) ---------- */
  function infoLine(b, extra) {
    const inf = b.info || {};
    return '<div class="hud-o-info"><span class="k' + (inf.underline ? ' u' : '') + '">' + esc(inf.left || '') + '</span>' +
      (inf.held ? '<span class="held">' + esc(inf.held) + '</span>' : '') +
      (inf.tag ? '<span class="tag">' + esc(inf.tag) + '</span>' : '') +
      '<span class="r">' + (extra || '') + (inf.right ? (inf.follow ? '<span class="fol" title="step follow">▶|</span>' : '') +
        (inf.arrows ? '‹ ' : '') + esc(inf.right) + (inf.arrows ? ' ›' : '') : '') + '</span></div>';
  }

  /* ---------- TRACK ---------- */
  /* the eight tracks, a compact list (the OLED overview's tiles, with names) */
  function trackList(doc, b, m) {
    let h = '<div class="hud-o-tl">';
    (b.tracks || []).forEach((r, t) => {
      const st = r.playing ? '<i class="dot pl"></i>' : r.queued ? '<i class="dot q"></i>' : '<i class="dot"></i>';
      h += '<div class="row' + (r.active ? ' cur' : '') + (r.muted ? ' mute' : '') + '" style="--c:' + trackColor(t) + '">' +
        '<span class="n">' + (t + 1) + '</span><span class="nm">' + esc(trackName(m, t)) + '</span>' +
        (r.soloed ? '<span class="b s">S</span>' : r.muted ? '<span class="b m">M</span>' : '') +
        '<span class="cl' + (r.has ? '' : ' empty') + '">' + esc(r.clip) + '</span>' + st + '</div>';
    });
    return h + '</div>';
  }

  /* the window the device's position bar describes, in steps */
  function windowOf(b, m, drum) {
    const p = b.position || { pages: 1, view: 0, play: -1, step: -1, len: 16 };
    let ls = 0;
    if (m) ls = drum ? (m.laneInfo ? m.laneInfo.ls | 0 : 0) : (m.clip ? m.clip.ls | 0 : 0);
    return { ls, len: Math.max(1, p.len | 0), pages: Math.max(1, p.pages | 0), view: p.view | 0, play: p.play, step: p.step };
  }

  const W = 640, HH = 300;   /* the roll's drawing box (svg units) */
  /* The roll is drawn stretched to its box, so text inside it would squash
   * with it: the row names are an HTML column over its left edge instead, at
   * a readable size. Short rows (the knob strip takes the height) keep only
   * the names that fit — the key's root first, then the C's — spaced so none
   * overlap. The box's height is read from the last paint (repaints follow
   * every report and the status strip's 250 ms, so a resize settles at once). */
  let rollBoxH = 200;
  function noteRollBoxH() {
    const box = typeof document !== 'undefined' && document.querySelector('#screenview .hud-o-rollbox');
    if (box && box.clientHeight > 0) rollBoxH = box.clientHeight;
  }
  const LABEL_PX = 14;
  function sparseRows(rows, prio) {
    const rowPx = rollBoxH / Math.max(1, rows);
    if (rowPx >= LABEL_PX) return null;                 /* every row fits */
    const gap = Math.ceil(LABEL_PX / rowPx), keep = [];
    for (const r of prio) if (keep.every((k) => Math.abs(k - r) >= gap)) keep.push(r);
    return new Set(keep);
  }
  function rowLabels(labels, rows, labelW) {
    return '<div class="hud-o-keys" style="width:' + (labelW / W * 100).toFixed(2) + '%">' + labels.map((l) =>
      '<span class="' + (l.hi ? 'hi' : '') + '" style="top:' + ((l.r + 0.5) / rows * 100).toFixed(2) + '%">' + esc(l.text) + '</span>').join('') + '</div>';
  }
  function frame(win, rows, rowH, labelW) {
    const sx = (W - labelW) / win.len;
    let g = '';
    for (let s = 0; s <= win.len; s += 4) g += '<line x1="' + (labelW + s * sx).toFixed(1) + '" y1="0" x2="' + (labelW + s * sx).toFixed(1) + '" y2="' + HH + '" stroke="' + (s % 16 === 0 ? '#2a2f37' : '#191c22') + '" stroke-width="1"/>';
    /* the page the step buttons show, outlined; the playing page tinted */
    if (win.play >= 0 && win.play !== win.view) g += '<rect x="' + (labelW + win.play * 16 * sx).toFixed(1) + '" y="0" width="' + (Math.min(16, win.len - win.play * 16) * sx).toFixed(1) + '" height="' + HH + '" fill="#ffcf4d" opacity=".05"/>';
    g += '<rect x="' + (labelW + win.view * 16 * sx + 1).toFixed(1) + '" y="1" width="' + (Math.min(16, win.len - win.view * 16) * sx - 2).toFixed(1) + '" height="' + (HH - 2) + '" rx="6" fill="#4da3ff" fill-opacity=".05" stroke="#4da3ff" stroke-width="2"/>';
    return { g, sx };
  }
  /* The playhead. Drawn first where the device's step says (it reports a
   * few times a second, so on its own the line jumps a step or more at a
   * time); then, while the transport runs, glideRoll moves just this line
   * every frame from the editor's own glided clock (phTickNow, web_ui_core.js
   * — the sequencer grid's line), which knows the tempo and corrects to each
   * report. The roll itself is never redrawn for it. */
  function playhead(win, sx, labelW) {
    /* a repaint (every report, and the status strip's 250 ms) draws the line
     * where it is NOW, so the glide never flicks back to the last step */
    const gx = H.reviewAnyModel ? null : glidedX(labelW, sx, win.ls, win.len);
    const x = gx != null ? gx : win.step >= 0 ? labelW + (win.step + 0.5) * sx : -10;
    return '<line class="hud-o-ph" data-x0="' + labelW + '" data-sx="' + sx.toFixed(4) + '" data-ls="' + win.ls + '" data-len="' + win.len + '"' +
      ' x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="' + HH + '" stroke="#ffcf4d" stroke-width="2.5"' + (gx != null || win.step >= 0 ? '' : ' visibility="hidden"') + '/>';
  }
  function glidedX(x0, sx, ls, len) {
    if (typeof phTickNow !== 'function' || typeof gridTps !== 'function') return null;
    const tick = phTickNow();
    if (!Number.isFinite(tick)) return null;
    const tps = gridTps();
    if (!(tps > 0)) return null;
    const step = tick / tps - ls;
    return step >= 0 && step < len ? x0 + step * sx : null;
  }
  /* the glided position of a roll's line, in its svg units; null = keep the
   * device's step (stopped, no clock yet, or the editor follows another clip) */
  H.glideX = (line) => glidedX(+line.getAttribute('data-x0') || 0, +line.getAttribute('data-sx') || 0,
                               +line.getAttribute('data-ls') || 0, +line.getAttribute('data-len') || 0);
  /* one frame's move of the live roll's line; false = no roll to move */
  H.glideOnce = function () {
    const line = glideSynced && document.querySelector('#screenview svg.hud-o-roll line.hud-o-ph');
    if (!line || !line.isConnected) return false;
    const x = H.glideX(line);
    if (x != null) {
      line.setAttribute('x1', x.toFixed(1)); line.setAttribute('x2', x.toFixed(1));
      line.removeAttribute('visibility');
    }
    return true;
  };
  let glideRAF = 0, glideSynced = false;
  function glideRoll() {
    glideRAF = 0;
    if (H.glideOnce()) glideRAF = requestAnimationFrame(glideRoll);
  }
  /* (re)armed on every draw of a synced roll; stops by itself when the roll goes */
  function armGlide(synced) {
    glideSynced = !!synced;
    if (glideSynced && !glideRAF && typeof requestAnimationFrame === 'function') glideRAF = requestAnimationFrame(glideRoll);
  }
  function pageLabel(win) {
    return '<span class="pg">page ' + (win.view + 1) + ' / ' + win.pages + (win.play >= 0 && win.play !== win.view ? ' · playing ' + (win.play + 1) : '') + '</span>';
  }

  function melodicRoll(doc, b, m, win) {
    const col = trackColor(doc.where.track | 0), tps = (m.clip && m.clip.tps) || 24;
    const notes = (m.notes || []).filter((n) => { const s = n.tick / tps - win.ls; return s + n.gate / tps > 0 && s < win.len; });
    let lo = 48, hi = 72;
    if (notes.length) { lo = Math.min(...notes.map((n) => n.pitch)); hi = Math.max(...notes.map((n) => n.pitch)); }
    if (hi - lo < 11) { const mid = Math.round((lo + hi) / 2); lo = mid - 6; hi = mid + 6; }
    lo -= 1; hi += 1;
    const rows = hi - lo + 1, rowH = HH / rows, labelW = 34, key = m.glob ? m.glob.key | 0 : 0;
    let g = '';
    const roots = [], cs = [], rest = [];
    for (let p = hi, r = 0; p >= lo; p--, r++) {
      const pc = ((p % 12) + 12) % 12, inScale = !m.scaleMask || m.scaleMask[pc], root = pc === key;
      g += '<rect x="' + labelW + '" y="' + (r * rowH).toFixed(1) + '" width="' + (W - labelW) + '" height="' + rowH.toFixed(1) + '" fill="' + (root ? '#17202b' : inScale ? '#111419' : '#0b0d10') + '"/>';
      (root ? roots : pc === 0 ? cs : rest).push(r);
    }
    /* every row's name when the rows are tall enough (as before, up to 16
     * rows); else the root and the C's that fit */
    const fit = sparseRows(rows, roots.concat(cs));
    const labels = [];
    for (let p = hi, r = 0; p >= lo; p--, r++) {
      const pc = ((p % 12) + 12) % 12, root = pc === key;
      const show = fit ? fit.has(r) : (rows <= 16 || root || pc === 0);
      if (show) labels.push({ r, text: nn(p), hi: root });
    }
    const f = frame(win, rows, rowH, labelW);
    g += f.g;
    for (const n of notes) {
      const s = n.tick / tps - win.ls, r = hi - n.pitch;
      const x = labelW + Math.max(0, s) * f.sx, w = Math.max(3, Math.min(win.len - Math.max(0, s), n.gate / tps) * f.sx - 2);
      g += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (r * rowH + 1.5).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(2, rowH - 3).toFixed(1) + '" rx="3" fill="' + col + '" opacity="' + (0.45 + 0.55 * Math.min(1, (n.vel || 100) / 127)).toFixed(2) + '"/>';
    }
    g += playhead(win, f.sx, labelW);
    return '<svg class="hud-o-roll" viewBox="0 0 ' + W + ' ' + HH + '" preserveAspectRatio="none">' + g + '</svg>' + rowLabels(labels, rows, labelW);
  }

  function drumRoll(doc, b, m, win) {
    const col = trackColor(doc.where.track | 0), act = doc.where.lane | 0;
    const lanes = new Set(Object.keys(m.dnotes || {}).map(Number).filter((L) => (m.dnotes[L] || []).length));
    lanes.add(act);
    let list = [...lanes].sort((a, b2) => b2 - a);
    if (list.length > 12) { const i = list.indexOf(act); list = list.slice(Math.max(0, Math.min(i - 6, list.length - 12)), Math.max(0, Math.min(i - 6, list.length - 12)) + 12); }
    const rows = Math.max(4, list.length), rowH = HH / rows, labelW = 46;
    const f = frame(win, rows, rowH, labelW);
    let g = '';
    const fit = sparseRows(rows, [list.indexOf(act)].concat(list.map((_, r) => r)));
    const labels = [];
    list.forEach((L, r) => {
      const dl = (m.dlanes && m.dlanes[L]) || {}, on = L === act;
      g += '<rect x="' + labelW + '" y="' + (r * rowH).toFixed(1) + '" width="' + (W - labelW) + '" height="' + rowH.toFixed(1) + '" fill="' + (on ? '#17202b' : r % 2 ? '#0e1014' : '#111318') + '"' + (dl.mute ? ' opacity=".4"' : '') + '/>';
      if (on) g += '<rect x="' + (labelW - 4) + '" y="' + (r * rowH + 2).toFixed(1) + '" width="3" height="' + (rowH - 4).toFixed(1) + '" fill="' + col + '"/>';
      if (!fit || fit.has(r)) labels.push({ r, text: (dl.note != null ? nn(dl.note) : 'L' + (L + 1)) + (dl.solo ? ' S' : ''), hi: on });
      const tpsL = dl.tps || (m.laneInfo && m.laneInfo.tps) || 24, lsL = dl.ls != null ? dl.ls : win.ls;
      for (const hit of (m.dnotes[L] || [])) {
        const s = hit.tick / tpsL - lsL;
        if (s < 0 || s >= win.len) continue;
        g += '<rect x="' + (labelW + s * f.sx + 1).toFixed(1) + '" y="' + (r * rowH + 2).toFixed(1) + '" width="' + Math.max(3, f.sx - 2).toFixed(1) + '" height="' + Math.max(2, rowH - 4).toFixed(1) + '" rx="3" fill="' + col + '" opacity="' + ((dl.mute ? 0.3 : 0.45 + 0.55 * Math.min(1, (hit.vel || 100) / 127))).toFixed(2) + '"/>';
      }
    });
    return '<svg class="hud-o-roll" viewBox="0 0 ' + W + ' ' + HH + '" preserveAspectRatio="none">' + f.g + g + playhead(win, f.sx, labelW) + '</svg>' + rowLabels(labels, rows, labelW);
  }

  /* the knob strip: the bank's eight knobs under the roll, the touched one
   * lit and named above them with its options (or its value) */
  function knobStrip(doc) {
    const kn = doc.knobs;
    if (!kn || !kn.knobs) return '';
    const t = kn.touched >= 0 && kn.touched < 8 ? kn.touched : -1, c = t >= 0 ? kn.knobs[t] : null;
    /* a touch names its knob in the header's place; the strip keeps the bank's
     * name (where.bankName) so nothing above the knobs changes on a touch */
    const bank = (kn.header && kn.header.text) || (doc.where && doc.where.bankName) || '';
    let head = '<div class="hud-o-kh"><span class="bk">' + esc(bank) + (bank ? ' bank' : 'knobs') + '</span>';
    const meta = kn.meta && t >= 0 ? kn.meta[t] : null;
    if (c) {
      head += '<b>' + esc((meta && meta.full) || c.name || c.label || '') + '</b>';
      if (meta && typeof meta.min === 'number' && typeof meta.max === 'number')
        head += '<span class="rng">' + esc((meta.min > 0 ? '+' : '') + meta.min + ' – ' + (meta.max > 0 ? '+' : '') + meta.max) + '</span>';
      if (c.options && c.options.length > 1)
        head += '<span class="opts">' + c.options.map((o, i) => '<span' + (i === c.sel ? ' class="on"' : '') + '>' + esc(o) + '</span>').join('') + '</span>';
      else if (c.text) head += '<span class="val">' + esc(c.text) + '</span>';
    }
    head += '</div>';
    /* the cells read their adornments (the "set" dot) from the bank table's
     * annotation, as on a drawn bank page */
    const kdoc = { where: doc.where, body: { touched: t, knobs: kn.knobs }, knobMeta: kn.meta || null };
    let cells = '';
    for (let k = 0; k < 8; k++) cells += H.cell(kn.knobs[k], k, kdoc, {});
    return '<div class="hud-o-knobs">' + head + '<div class="hud-knobs">' + cells + '</div></div>';
  }

  H.ovwTrack = function (doc, b) {
    noteRollBoxH();
    const m = model(), w = doc.where || {};
    const drum = w.screen === 'track.drum-overview', audio = w.screen === 'track.audio-overview';
    const synced = m && m.sel && m.tracks && (H.reviewAnyModel || (m.sel.t === (w.track | 0) && m.sel.c === (w.clip | 0) && m.tracks[w.track | 0]));
    const win = windowOf(b, synced ? m : null, drum);
    let main;
    if (audio && b.wave) main = '<div class="hud-o-wave">' + H.waveSvg(b.wave, 260) + '</div>';
    else if (!synced) main = '<div class="hud-o-wait">Reading the clip…</div>';
    else main = drum ? drumRoll(doc, b, m, win) : melodicRoll(doc, b, m, win);
    /* the line glides only on the one live roll (the review sheet draws many) */
    armGlide(synced && !(audio && b.wave) && !H.reviewAnyModel);
    const steps = '<span class="st">' + win.len + ' steps</span>';
    const strip = knobStrip(doc);
    return '<div class="hud-o-track' + (strip ? ' knobs' : '') + '">' + infoLine(b, (audio ? '' : pageLabel(win)) + steps) +
      '<div class="hud-o-main"><div class="hud-o-rollbox">' + main + '</div>' + (strip ? '' : trackList(doc, b, m)) + '</div>' + strip + '</div>';
  };

  /* ---------- SESSION ---------- */
  H.ovwSession = function (doc, b) {
    const m = model(), o = doc.ovw || {}, rowOff = o.rowOff | 0;
    const tracks = (m && m.tracks) || [];
    /* a track's mute / solo as the DEVICE says (its document), the clips'
     * states from the editor's model, which has every clip */
    const dt = (t) => (b.tracks && b.tracks[t]) || {};
    const rTo = Math.min(16, Math.max(rowOff + 4, 6)), rFrom = Math.max(0, Math.min(rowOff, rTo - 6));
    const modes = o.modes || [], mi = o.modeIdx | 0;
    const kn = doc.knobs, touched = kn && kn.screen === 'session.mixer' && kn.touched >= 0 ? kn.touched : -1;
    const tc = touched >= 0 && o.cells ? o.cells[touched] : null;
    /* the track's NUMBER first: several tracks can share an instrument name */
    const right = tc ? '<b class="kt" style="--kc:' + trackColor(touched) + '">T' + (touched + 1) + ' ' + esc(trackName(m, touched)) + ' · ' + esc(H.sentence ? H.sentence(o.mode || '') : (o.mode || '')) + ' ' + esc(tc.text || '') + '</b>'
      : 'pads: rows ' + LETTERS[rowOff] + '–' + LETTERS[Math.min(15, rowOff + 3)];
    let h = '<div class="hud-o-sess">';
    h += '<div class="hud-o-info"><span class="tabs">' + modes.map((n, i) => '<span class="tab' + (i === mi ? ' on' : '') + '">' + esc(H.sentence ? H.sentence(n) : n) + '</span>').join('') + '</span>' +
      '<span class="r">' + right + '</span></div>';
    h += '<div class="hud-o-grid" style="grid-template-rows:auto repeat(' + (rTo - rFrom) + ',minmax(0,1fr))"><span></span>';
    for (let t = 0; t < 8; t++) h += '<div class="th' + (dt(t).muted ? ' mute' : '') + '" style="--c:' + trackColor(t) + '"><i>' + (t + 1) + '</i><span>' + esc(trackName(m, t)) + '</span>' + (dt(t).soloed ? '<b class="s">S</b>' : dt(t).muted ? '<b class="m">M</b>' : '') + '</div>';
    for (let r = rFrom; r < rTo; r++) {
      const onPads = r >= rowOff && r < rowOff + 4;
      h += '<span class="rl' + (onPads ? ' on' : '') + '">' + LETTERS[r] + '</span>';
      for (let t = 0; t < 8; t++) {
        /* the device's own clip states when it sent them (what the pads show);
         * the editor's snapshot only as a fallback */
        const dc = o.clips && o.clips[t], trk = tracks[t] || {};
        const has = dc ? !!((dc.has >> r) & 1) : trk.has && trk.has[r];
        /* an empty clip neither plays nor waits, whatever the track's flags say:
         * its pad stays dark (ui_leds.mjs), and so does its card */
        const pl = !!has && (dc ? !!(dc.pl && dc.ac === r) : !!(trk.pl && trk.ac === r));
        const q = !!has && !pl && (dc ? dc.q === r || !!(dc.rl && dc.ac === r) : trk.qc === r);
        const bits = o.thumbs && o.thumbs[t] ? o.thumbs[t][r] | 0 : -1;
        let thumb = '';
        if (has && bits >= 0) { thumb = '<span class="th16">'; for (let i = 0; i < 16; i++) thumb += '<i' + ((bits >> i) & 1 ? ' class="on"' : '') + '></i>'; thumb += '</span>'; }
        h += '<div class="cc' + (onPads ? '' : ' off') + (has ? ' has' : '') + (pl ? ' pl' : '') + (q ? ' q' : '') + (dt(t).muted ? ' mute' : '') + '" style="--c:' + trackColor(t) + '">' +
          (has ? '<span class="l">' + (pl ? '▶ ' : q ? '◇ ' : '') + LETTERS[r] + '</span>' + thumb : '') + '</div>';
      }
    }
    h += '</div>';
    if (o.cells && o.cells.length) {
      /* the mode is named by the lit tab above; the first column only keeps the
       * dials under their tracks' cards. A touched knob's dial is LIT, and the
       * tabs line names it (the OLED switches to its mixer page; this stays). */
      h += '<div class="hud-o-mix"><span class="ml"></span>';
      o.cells.forEach((c, t) => {
        const val = c && c.kind !== 'blank' ? c.text : '';
        const n = c && typeof c.norm === 'number' ? c.norm : c && typeof c.signed === 'number' ? (c.signed + 1) / 2 : null;
        h += '<div class="mx' + (t === touched ? ' tch' : '') + '" style="--kc:' + trackColor(t) + '"><div class="w">' + (n == null ? '' : H.dial(t, n, c.kind === 'arcbip', false, null, trackColor(t))) + '</div><span>' + esc(val) + '</span></div>';
      });
      h += '</div>';
    }
    return h + '</div>';
  };
});
