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
  function frame(win, rows, rowH, labelW) {
    const sx = (W - labelW) / win.len;
    let g = '';
    for (let s = 0; s <= win.len; s += 4) g += '<line x1="' + (labelW + s * sx).toFixed(1) + '" y1="0" x2="' + (labelW + s * sx).toFixed(1) + '" y2="' + HH + '" stroke="' + (s % 16 === 0 ? '#2a2f37' : '#191c22') + '" stroke-width="1"/>';
    /* the page the step buttons show, outlined; the playing page tinted */
    if (win.play >= 0 && win.play !== win.view) g += '<rect x="' + (labelW + win.play * 16 * sx).toFixed(1) + '" y="0" width="' + (Math.min(16, win.len - win.play * 16) * sx).toFixed(1) + '" height="' + HH + '" fill="#ffcf4d" opacity=".05"/>';
    g += '<rect x="' + (labelW + win.view * 16 * sx + 1).toFixed(1) + '" y="1" width="' + (Math.min(16, win.len - win.view * 16) * sx - 2).toFixed(1) + '" height="' + (HH - 2) + '" rx="6" fill="#4da3ff" fill-opacity=".05" stroke="#4da3ff" stroke-width="2"/>';
    return { g, sx };
  }
  function playhead(win, sx, labelW) {
    if (!(win.step >= 0)) return '';
    const x = labelW + (win.step + 0.5) * sx;
    return '<line x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="' + HH + '" stroke="#ffcf4d" stroke-width="2.5"/>';
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
    const showAll = rows <= 16;
    let g = '';
    for (let p = hi, r = 0; p >= lo; p--, r++) {
      const pc = ((p % 12) + 12) % 12, inScale = !m.scaleMask || m.scaleMask[pc], root = pc === key;
      g += '<rect x="' + labelW + '" y="' + (r * rowH).toFixed(1) + '" width="' + (W - labelW) + '" height="' + rowH.toFixed(1) + '" fill="' + (root ? '#17202b' : inScale ? '#111419' : '#0b0d10') + '"/>';
      if (showAll || root || pc === 0) g += '<text x="' + (labelW - 6) + '" y="' + (r * rowH + rowH / 2 + 4).toFixed(1) + '" text-anchor="end" font-size="' + Math.min(12, rowH + 2).toFixed(0) + '" font-weight="700" fill="' + (root ? '#f2f3f5' : '#4a4f59') + '">' + nn(p) + '</text>';
    }
    const f = frame(win, rows, rowH, labelW);
    g += f.g;
    for (const n of notes) {
      const s = n.tick / tps - win.ls, r = hi - n.pitch;
      const x = labelW + Math.max(0, s) * f.sx, w = Math.max(3, Math.min(win.len - Math.max(0, s), n.gate / tps) * f.sx - 2);
      g += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (r * rowH + 1.5).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(2, rowH - 3).toFixed(1) + '" rx="3" fill="' + col + '" opacity="' + (0.45 + 0.55 * Math.min(1, (n.vel || 100) / 127)).toFixed(2) + '"/>';
    }
    g += playhead(win, f.sx, labelW);
    return '<svg class="hud-o-roll" viewBox="0 0 ' + W + ' ' + HH + '" preserveAspectRatio="none">' + g + '</svg>';
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
    list.forEach((L, r) => {
      const dl = (m.dlanes && m.dlanes[L]) || {}, on = L === act;
      g += '<rect x="' + labelW + '" y="' + (r * rowH).toFixed(1) + '" width="' + (W - labelW) + '" height="' + rowH.toFixed(1) + '" fill="' + (on ? '#17202b' : r % 2 ? '#0e1014' : '#111318') + '"' + (dl.mute ? ' opacity=".4"' : '') + '/>';
      if (on) g += '<rect x="' + (labelW - 4) + '" y="' + (r * rowH + 2).toFixed(1) + '" width="3" height="' + (rowH - 4).toFixed(1) + '" fill="' + col + '"/>';
      g += '<text x="' + (labelW - 9) + '" y="' + (r * rowH + rowH / 2 + 4).toFixed(1) + '" text-anchor="end" font-size="' + Math.min(12, rowH).toFixed(0) + '" font-weight="700" fill="' + (on ? '#f2f3f5' : '#6a707b') + '">' + (dl.note != null ? nn(dl.note) : 'L' + (L + 1)) + (dl.solo ? ' S' : '') + '</text>';
      const tpsL = dl.tps || (m.laneInfo && m.laneInfo.tps) || 24, lsL = dl.ls != null ? dl.ls : win.ls;
      for (const hit of (m.dnotes[L] || [])) {
        const s = hit.tick / tpsL - lsL;
        if (s < 0 || s >= win.len) continue;
        g += '<rect x="' + (labelW + s * f.sx + 1).toFixed(1) + '" y="' + (r * rowH + 2).toFixed(1) + '" width="' + Math.max(3, f.sx - 2).toFixed(1) + '" height="' + Math.max(2, rowH - 4).toFixed(1) + '" rx="3" fill="' + col + '" opacity="' + ((dl.mute ? 0.3 : 0.45 + 0.55 * Math.min(1, (hit.vel || 100) / 127))).toFixed(2) + '"/>';
      }
    });
    return '<svg class="hud-o-roll" viewBox="0 0 ' + W + ' ' + HH + '" preserveAspectRatio="none">' + f.g + g + playhead(win, f.sx, labelW) + '</svg>';
  }

  H.ovwTrack = function (doc, b) {
    const m = model(), w = doc.where || {};
    const drum = w.screen === 'track.drum-overview', audio = w.screen === 'track.audio-overview';
    const synced = m && m.sel && m.tracks && (H.reviewAnyModel || (m.sel.t === (w.track | 0) && m.sel.c === (w.clip | 0) && m.tracks[w.track | 0]));
    const win = windowOf(b, synced ? m : null, drum);
    let main;
    if (audio && b.wave) main = '<div class="hud-o-wave">' + H.waveSvg(b.wave, 260) + '</div>';
    else if (!synced) main = '<div class="hud-o-wait">Reading the clip…</div>';
    else main = drum ? drumRoll(doc, b, m, win) : melodicRoll(doc, b, m, win);
    const steps = '<span class="st">' + win.len + ' steps</span>';
    return '<div class="hud-o-track">' + infoLine(b, (audio ? '' : pageLabel(win)) + steps) +
      '<div class="hud-o-main"><div class="hud-o-rollbox">' + main + '</div>' + trackList(doc, b, m) + '</div></div>';
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
    let h = '<div class="hud-o-sess">';
    h += '<div class="hud-o-info"><span class="tabs">' + modes.map((n, i) => '<span class="tab' + (i === mi ? ' on' : '') + '">' + esc(H.sentence ? H.sentence(n) : n) + '</span>').join('') + '</span>' +
      '<span class="r">pads: rows ' + LETTERS[rowOff] + '–' + LETTERS[Math.min(15, rowOff + 3)] + '</span></div>';
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
       * dials under their tracks' cards */
      h += '<div class="hud-o-mix"><span class="ml"></span>';
      o.cells.forEach((c, t) => {
        const val = c && c.kind !== 'blank' ? c.text : '';
        const n = c && typeof c.norm === 'number' ? c.norm : c && typeof c.signed === 'number' ? (c.signed + 1) / 2 : null;
        h += '<div class="mx"><div class="w">' + (n == null ? '' : H.dial(t, n, c.kind === 'arcbip', false, null, trackColor(t))) + '</div><span>' + esc(val) + '</span></div>';
      });
      h += '</div>';
    }
    return h + '</div>';
  };
});
