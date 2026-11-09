/* dAVEBOx remote UI — the Screen view's AUTOMATION screen and the lane strip a
 * hold or a jump shows over a parameter's page (Josh, 2026-11-09: "for
 * automation, i want you to think hard about how automation works, what the
 * screen shows in each mode/view and how organization and context could be
 * added while retaining the info on the oled").
 *
 * Everything the OLED's list says stays — each lane's name, its cycle (or OFF,
 * EMPTY, PADS), the cursor, + Add lane / Clear all, the hints — in the OLED's
 * ORDER, so the jog moves through it as it moves through the OLED's (Josh:
 * "doesn't lane grouping break scrolling on the oled?"). Added around it:
 *   - a heading over each run of lanes from one place, named in full (the
 *     OLED's list is sorted by a label that starts with that place, so a run
 *     is a run there too);
 *   - each lane's curve over its own cycle, and its playhead — every lane at
 *     its own Rate and Loop, so lanes that run against each other are seen to;
 *   - the selected lane large: its whole curve, the value range in its own
 *     units, its points, the step page the buttons show (outlined), the step
 *     buttons as they are lit, the value now, and its settings.
 * The device sends a lane's position a few times a second; between reports
 * each playhead glides at its lane's own speed. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const esc = H.esc;
  const W = 900;
  const col = (doc) => (typeof trackColor === 'function' && doc.where) ? trackColor(doc.where.track | 0) : H.cfg.palette[0];

  /* a shape (0..1 a sample, -1 none) as a path across W × h */
  function shapePath(v, h, stepped, pad) {
    pad = pad == null ? 3 : pad;
    const n = v.length;
    let d = '', pen = false;
    for (let i = 0; i < n; i++) {
      const x = v[i];
      if (!(x >= 0)) { pen = false; continue; }
      const px = stepped ? i / n * W : (i + 0.5) / n * W, py = h - pad - x * (h - 2 * pad);
      d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
      if (stepped) d += 'L' + ((i + 1) / n * W).toFixed(1) + ' ' + py.toFixed(1) + ' ';
      pen = true;
    }
    return d.trim();
  }
  /* a playhead that glides: its position when the document came, and its speed */
  const ph = (pos, spd, h, color, w) => pos >= 0
    ? '<line class="hud-lane-ph" data-pos="' + pos + '" data-spd="' + (spd || 0) + '" x1="' + (pos * W).toFixed(1) + '" y1="0" x2="' + (pos * W).toFixed(1) +
      '" y2="' + h + '" stroke="' + color + '" stroke-width="' + (w || 2) + '" vector-effect="non-scaling-stroke"/>' : '';

  function sparkline(r, color, h) {
    let svg = '<svg class="hud-lane-sp" viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none">';
    if (r.kind !== 'entry') return svg + '</svg>';
    if (r.shape && r.shape.some((x) => x >= 0))
      svg += '<path d="' + shapePath(r.shape, h, r.stepped) + '" fill="none" stroke="' + (r.active ? color : '#5a606b') + '" stroke-width="2" vector-effect="non-scaling-stroke"' +
             (r.active ? '' : ' stroke-dasharray="5 4"') + '/>';
    else svg += '<line x1="0" y1="' + (h / 2) + '" x2="' + W + '" y2="' + (h / 2) + '" stroke="#3a3f48" stroke-width="1.5" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"/>';
    if (r.active) svg += ph(r.pos, r.spd, h, 'var(--h-play)', 1.5);
    return svg + '</svg>';
  }

  /* the list, in the OLED's order: a heading where the place changes */
  /* in the lane menu a row is the jog turned onto it and clicked
   * (web_ui_hud_input.js); out of it the jog does not walk the lanes */
  const rowIn = (L, i) => (L.menu && L.sel >= 0 ? ' data-in="row" data-path="body.lanes.sel" data-row="' + i + '"' : '');
  function laneList(doc, L, listRows, wide) {
    const rows = L.rows || [], color = col(doc), sel = L.menu ? L.sel : -1;
    /* the OLED's list rows past the lanes: + Add lane, Clear all (menu only) */
    const extra = (listRows || []).slice(rows.length).map((x) => ({ kind: 'action', label: x.label }));
    const all = rows.concat(extra);
    const max = wide ? 9 : 8;
    let a = 0;
    if (all.length > max) a = Math.max(0, Math.min(all.length - max, (sel < 0 ? 0 : sel) - Math.floor(max / 2)));
    const b = Math.min(all.length, a + max);
    let html = '<div class="hud-lanes' + (wide ? ' wide' : '') + '">', lastKey = null;
    for (let i = a; i < b; i++) {
      const r = all[i];
      if (r.kind === 'action') {
        html += '<div class="hud-lane act' + (i === sel ? ' sel' : '') + '"' + (i === sel ? ' style="--lc:' + color + '"' : '') + rowIn(L, i) + '><span class="nm">' + esc(r.label) + '</span></div>';
        lastKey = null; continue;
      }
      if (r.key !== lastKey || i === a) html += '<div class="hud-lane-g">' + esc(r.group || r.key || '') + '</div>';
      lastKey = r.key;
      const off = r.kind === 'entry' && !r.active;
      html += '<div class="hud-lane' + (i === sel ? ' sel' : '') + (off ? ' off' : '') + '"' + (i === sel ? ' style="--lc:' + color + '"' : '') + rowIn(L, i) + '>' +
        '<span class="nm" title="' + esc(r.label) + '">' + esc(r.param || r.label) + '</span>' + sparkline(r, color, wide ? 34 : 24) +
        '<span class="v">' + esc(r.value || '') + '</span></div>';
    }
    if (!all.length) html += '<div class="hud-lane-empty">No automation</div>';
    if (all.length > max) {
      const top = a / all.length, hh = (b - a) / all.length;
      html += '<div class="hud-scroll"><i style="top:' + (top * 100).toFixed(1) + '%;height:' + (hh * 100).toFixed(1) + '%"></i></div>';
    }
    return html + '</div>';
  }

  /* the selected lane, large */
  function laneDetail(doc, L) {
    const D = L.detail, r = (L.rows || [])[D.idx];
    if (!r) return '';
    const color = col(doc), h = 170;
    let svg = '<svg class="hud-lane-big" viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none">';
    /* the page the step buttons show */
    if (D.to > D.from) svg += '<rect x="' + (D.from * W).toFixed(1) + '" y="0" width="' + ((D.to - D.from) * W).toFixed(1) + '" height="' + h + '" fill="' + color + '" opacity=".1"/>';
    /* steps: faint, beats firmer, pages firmest */
    const n = Math.max(1, D.steps | 0);
    if (n <= 128) for (let s = 1; s < n; s++) {
      const x = (s / n * W).toFixed(1), pg = s % 16 === 0, bt = s % 4 === 0;
      svg += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + h + '" stroke="#fff" stroke-opacity="' + (pg ? .22 : bt ? .09 : .035) + '" vector-effect="non-scaling-stroke"/>';
    }
    if (D.to > D.from) svg += '<rect x="' + (D.from * W).toFixed(1) + '" y="1" width="' + ((D.to - D.from) * W).toFixed(1) + '" height="' + (h - 2) + '" fill="none" stroke="' + color + '" stroke-opacity=".7" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
    if (D.held >= 0 && D.to > D.from) {
      const hx = D.from + (D.to - D.from) * D.held / 16;
      svg += '<rect x="' + (hx * W).toFixed(1) + '" y="0" width="' + ((D.to - D.from) / 16 * W).toFixed(1) + '" height="' + h + '" fill="#fff" opacity=".12"/>';
    }
    const sh = r.shape;
    if (sh && sh.some((x) => x >= 0)) {
      svg += '<path d="' + shapePath(sh, h, r.stepped, 8) + '" fill="none" stroke="' + (r.active ? color : '#6a707b') + '" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"' + (r.active ? '' : ' stroke-dasharray="7 5"') + '/>';
      /* the points, on the curve */
      for (const f of (D.points || [])) {
        const v = sh[Math.min(sh.length - 1, Math.max(0, Math.round(f * sh.length)))];
        if (!(v >= 0)) continue;
        /* a zero-length round-capped line: a dot the graph's stretch cannot squash */
        const px = (f * W).toFixed(1), py = (h - 8 - v * (h - 16)).toFixed(1);
        svg += '<line class="hud-lane-pt" x1="' + px + '" y1="' + py + '" x2="' + px + '" y2="' + py + '" stroke="' + color + '" stroke-width="9" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      }
    } else svg += '<text x="' + (W / 2) + '" y="' + (h / 2) + '" fill="#5a606b" font-size="20" text-anchor="middle">' + (r.count ? '' : 'Empty — record or lock a step to write it') + '</text>';
    svg += ph(r.active ? r.pos : -1, r.spd, h, 'var(--h-play)', 2);
    svg += '</svg>';
    /* the step buttons, as lit: the page's values, the held step */
    let strip = '';
    if (Array.isArray(D.vals)) {
      strip = '<div class="hud-lane-steps">';
      for (let s = 0; s < 16; s++) {
        const v = D.vals[s];
        strip += '<i data-in="step" data-note="' + (16 + s) + '" class="' + (s === D.held ? 'held' : '') + (v >= 0 ? '' : ' none') + '" style="' + (v >= 0 ? 'background:' + color + ';opacity:' + (0.18 + 0.82 * v).toFixed(2) : '') + '"></i>';
      }
      strip += '</div>';
    }
    const chips = (D.settings || []).map((s) => '<span class="hud-chip">' + esc(s[0]) + ' <b>' + esc(s[1]) + '</b></span>').join('');
    return '<div class="hud-lane-detail" style="--lc:' + color + '">' +
      '<div class="t"><span class="g">' + esc(r.group || '') + '</span><span class="p">' + esc(r.param || r.label) + '</span>' +
      (!r.active ? '<span class="mute">Muted</span>' : '') +
      (D.now != null ? '<span class="now">' + esc(D.now) + '</span>' : '') + '</div>' +
      '<div class="graph"><div class="ax"><span>' + esc(D.max != null ? D.max : '') + '</span><span>' + esc(D.min != null ? D.min : '') + '</span></div>' + svg + '</div>' +
      strip +
      '<div class="foot">' + (D.pages > 1 ? '<span class="pg">Page ' + ((D.page | 0) + 1) + ' of ' + D.pages + '</span>' : '') + chips + '</div></div>';
  }

  H.layout('lanes', (d) => !!(d.body && d.body.lanes), (doc, b) => {
    const L = b.lanes;
    const list = b.list && b.list.rows ? b.list.rows : null;
    const detail = L.detail && L.menu ? laneDetail(doc, L) : '';
    armLaneGlide();
    return '<div class="hud-lanesv' + (detail ? '' : ' solo') + '">' + laneList(doc, L, list, !detail) + detail + '</div>';
  });

  /* ── a hold / a jump: the lane's page over the parameter's page ── */
  H.laneStrip = function (doc, cv) {
    const color = col(doc), h = 74;
    let svg = '<svg class="hud-lane-strip-g" viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none">';
    for (let s = 1; s < 16; s++) svg += '<line x1="' + (s / 16 * W) + '" y1="0" x2="' + (s / 16 * W) + '" y2="' + h + '" stroke="#fff" stroke-opacity="' + (s % 4 ? .04 : .12) + '" vector-effect="non-scaling-stroke"/>';
    if (cv.held >= 0) svg += '<rect x="' + (cv.held * W).toFixed(1) + '" y="0" width="' + (W / 16).toFixed(1) + '" height="' + h + '" fill="#fff" opacity=".14"/>';
    const v = cv.values || [];
    if (v.some((x) => x >= 0)) svg += '<path d="' + shapePath(v, h, cv.stepped, 6) + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
    if (cv.play >= 0) svg += '<line x1="' + (cv.play * W).toFixed(1) + '" y1="0" x2="' + (cv.play * W).toFixed(1) + '" y2="' + h + '" stroke="var(--h-play)" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    svg += '</svg>';
    let pages = '';
    if ((cv.pages | 0) > 1) { pages = '<span class="pgs">'; for (let p = 0; p < cv.pages; p++) pages += '<i class="' + (p === cv.page ? 'on' : '') + '"></i>'; pages += '</span>'; }
    return '<div class="hud-lane-strip" style="--lc:' + color + '"><div class="t"><span class="g">Automation</span><span class="g">' + esc(cv.group || '') + '</span>' +
      '<span class="p">' + esc(cv.param || cv.name || '') + '</span>' +
      (cv.step ? '<span class="st">Step ' + cv.step + (cv.write ? ' · ' + esc(cv.write) : '') + '</span>' : '') +
      (cv.heldText != null ? '<span class="now">' + esc(cv.heldText) + '</span>' : '') + pages + '</div>' + svg + '</div>';
  };

  /* ── the glide: every lane playhead from where it was reported, at its speed ── */
  let seqSeen = null, seqT = 0, raf = 0;
  function docTime() {
    const d = H.doc, s = d && d.seq;
    if (s !== seqSeen) { seqSeen = s; seqT = (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
    return seqT;
  }
  function glide() {
    raf = 0;
    if (typeof document === 'undefined') return;
    const lines = document.querySelectorAll('line.hud-lane-ph');
    if (!lines.length) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = Math.min(1.0, Math.max(0, (now - docTime()) / 1000));   /* a stalled stream stops rather than runs on */
    let moving = false;
    lines.forEach((ln) => {
      const p = +ln.getAttribute('data-pos'), s = +ln.getAttribute('data-spd');
      if (!(p >= 0) || !(s > 0)) return;
      const x = H.laneGlideX(p, s, dt).toFixed(1);
      ln.setAttribute('x1', x); ln.setAttribute('x2', x);
      moving = true;
    });
    if (moving && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(glide);
  }
  function armLaneGlide() {
    docTime();
    if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(glide);
  }
  /* where a playhead reported at `pos` (0..1 of its window), moving `spd`
   * windows a second, is `dtSec` later — wrapping at its loop's end; the
   * glide's one formula, and what the tests drive */
  H.laneGlideX = function (pos, spd, dtSec) { return ((pos + spd * Math.min(1, dtSec)) % 1) * W; };

});
