/* dAVEBOx remote UI — the Screen view's status-strip items, one renderer each.
 * Order and presence: HUD.cfg.statusItems.
 *
 * Where the selection is comes from the DEVICE document (`where`); what each
 * track is doing comes from the editor's own model (M, from the rui snapshot —
 * the same data the session grid draws), so the strip costs the device
 * nothing extra. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const esc = H.esc;
  const LETTERS = 'ABCDEFGHIJKLMNOP';
  const model = () => (typeof M !== 'undefined' ? M : null);

  /* track — its number in its colour, what it plays */
  H.item('track', (doc) => {
    const t = doc.where ? doc.where.track | 0 : 0, m = model();
    const trk = m && m.tracks && m.tracks[t];
    const inst = trk ? trackInstName(trk, t) : null;
    return '<span class="hud-it-track"><i style="background:' + trackColor(t) + '">' + (t + 1) + '</i>' +
      'Track ' + (t + 1) + (inst ? ' <span>· ' + esc(inst) + '</span>' : '') + '</span>';
  });

  /* clip — letter, playing / queued, length */
  H.item('clip', (doc) => {
    const t = doc.where ? doc.where.track | 0 : 0, c = doc.where ? doc.where.clip | 0 : 0, m = model();
    const trk = m && m.tracks && m.tracks[t];
    const playing = trk && trk.pl && trk.ac === c, queued = trk && trk.qc === c;
    let len = '';
    if (m && m.sel && m.sel.t === t && m.sel.c === c && m.clip && m.clip.len) {
      const bars = m.clip.len / 16;
      len = ' ' + (bars >= 1 && bars === Math.floor(bars) ? bars + (bars === 1 ? ' bar' : ' bars') : m.clip.len + ' steps');
    }
    return '<span class="hud-it-clip">Clip <b>' + LETTERS[c] + '</b>' +
      (playing ? ' <span class="pl">▶</span>' : queued ? ' <span class="pl">◇</span>' : '') + esc(len) + '</span>';
  });

  /* pips — the 8 tracks: filled = playing, outline = stopped, blink = queued,
   * faint = muted, underline = the selected one */
  H.item('pips', (doc) => {
    const m = model(), cur = doc.where ? doc.where.track | 0 : -1;
    const tracks = (m && m.tracks) || [];
    let html = '<span class="hud-it-pips">';
    for (let t = 0; t < 8; t++) {
      const trk = tracks[t] || {};
      const st = trk.mute ? 'mute' : trk.qc >= 0 && trk.qc !== undefined && trk.qc !== trk.ac ? 'q' : trk.pl ? '' : 'off';
      html += '<span class="hud-pip ' + st + (t === cur ? ' cur' : '') + '" data-in="track" data-t="' + t + '" style="--c:' + trackColor(t) + ';background:' + trackColor(t) + '">' + (t + 1) + '</span>';
    }
    return html + '</span>';
  });

  /* transport — ▶/■ bar.beat · BPM, from the editor's synced clock */
  H.item('transport', () => {
    const m = model();
    if (!m || !m.play) return '';
    const on = !!m.play.on, bpm = Math.round(m.play.bpm || 0);
    let pos = '';
    if (on && typeof m.play.tick === 'number') {
      const beats = Math.floor(m.play.tick / 96);
      pos = ' ' + (Math.floor(beats / 4) + 1) + '.' + ((beats % 4) + 1);
    }
    return '<span class="hud-it-transport" data-in="btn" data-cc="85"><b>' + (on ? '▶' : '■') + '</b>' + esc(pos) + ' · ' + bpm + '</span>';
  });
});
