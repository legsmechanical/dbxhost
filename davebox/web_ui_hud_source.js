/* dAVEBOx remote UI — the Screen view's document source, and its place in the
 * editor (the Screen view switcher entry, the standalone page).
 *
 * LIVE: one EventSource on the manager's /stream-auto?v=2 — `ui` carries each
 * new document the moment the device draws a changed frame (display_server's
 * 8 ms fast path), `uistate` says whether the device UI is publishing. Opened
 * only while the Screen view is on screen; the device does no work at all
 * while nobody watches.
 * OFFLINE PREVIEW (the mock shim): the recorded documents in
 * tools/websmoke/hud_fixtures/ — real documents from the real UI, one per
 * manual screen (make_hud_fixtures.sh) — with a picker to step through them.
 *
 * Standalone: ?screen=1 shows the screen and nothing else (a tablet beside the
 * Move, added to the home screen). */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const view = document.getElementById('screenview'), fit = document.getElementById('hudfit');
  let es = null, shown = false, fixtures = null, fxIdx = 0, picker = null;
  H.mount(fit);

  /* scale the 960-wide stage to the space, whole, centred. Inside the editor it
   * is the 2:1 card. As an app window (?screen=1) it FILLS the window instead:
   * the stage keeps its width and takes the window's shape (within
   * cfg.stage.minH..maxH, letterboxed only beyond those), so no band of page
   * shows around it — the screen is the window. */
  function rescale() {
    if (!shown) return;
    const w = view.clientWidth, h = view.clientHeight, sw = H.cfg.stage.w;
    let sh = H.cfg.stage.h;
    if (H.appWindow && w > 0 && h > 0) sh = Math.round(Math.max(H.cfg.stage.minH, Math.min(H.cfg.stage.maxH, sw * h / w)));
    fit.style.setProperty('--stage-h', sh + 'px');
    const s = Math.max(0.1, Math.min(w / sw, h / sh) * (H.appWindow ? 1 : 0.98));
    fit.style.transform = 'translate(-50%,-50%) scale(' + s.toFixed(4) + ')';
    fit.style.transformOrigin = '50% 50%';
    /* the stage covers the display edge to edge; its content stays clear of the
     * safe area, in stage units */
    if (H.appWindow) {
      const a = window.dbxApp.safeArea(), sd = window.dbxApp.safeSides(a);   /* web_ui_app.js */
      fit.style.setProperty('--safe-l', (sd.l / s).toFixed(1) + 'px');
      fit.style.setProperty('--safe-r', (sd.r / s).toFixed(1) + 'px');
      fit.style.setProperty('--safe-b', (a.b / s).toFixed(1) + 'px');
      fit.style.setProperty('--safe-t', (a.t / s).toFixed(1) + 'px');   /* an iPad keeps its status bar on its side */
    }
  }
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => setTimeout(rescale, 50));
  window.addEventListener('orientationchange', () => setTimeout(rescale, 50));
  H.rescale = rescale;
  H.shown = () => shown;
  if (typeof ResizeObserver === 'function') new ResizeObserver(rescale).observe(view);
  window.addEventListener('resize', rescale);

  function startLive() {
    if (es) return;
    es = new EventSource('/stream-auto?v=2');
    es.addEventListener('ui', (e) => { try { const d = JSON.parse(e.data); H.setDoc(d); follow(d); } catch (err) { /* a bad document is skipped */ } });
    es.addEventListener('uistate', (e) => { try { H.setAlive(!!JSON.parse(e.data).alive); } catch (err) { /* skip */ } });
    /* the OLED frame (the stream's default event): kept for picture screens */
    es.onmessage = (e) => { try { const f = JSON.parse(e.data);
      if (f && f.data && f.width === 128) { const bin = atob(f.data), b = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); H.setOled(b, 'pages'); } } catch (err) { /* skip */ } };
  }
  function stopLive() { if (es) { es.close(); es = null; } }

  /* FOLLOW: while a track overview is on screen, point the editor's selection
   * (which clip the rui snapshot carries) at the device's track / clip / drum
   * lane, so the overview's piano roll draws the clip the device is on from
   * data the editor already receives. Only while the Screen view is shown —
   * it changes what the Sequencer view has selected — and at most every
   * 400 ms, since a selection takes a snapshot round trip to land. */
  let followAt = 0;
  function follow(d) {
    if (!shown || !d || !d.where || !H.isTrackOverview || !H.isTrackOverview(d)) return;
    const m = typeof M !== 'undefined' ? M : null, w = d.where, now = Date.now();
    if (now - followAt < 400 || typeof selectClip !== 'function') return;
    if (!m || !m.sel || m.sel.t !== (w.track | 0) || m.sel.c !== (w.clip | 0)) { followAt = now; selectClip(w.track | 0, w.clip | 0); return; }
    if ((w.lane | 0) >= 0 && m.sel.lane !== (w.lane | 0) && typeof selectLane === 'function' && m.dlanes && m.dlanes.length) { followAt = now; selectLane(w.lane | 0); }
  }
  H.follow = follow;   /* smokes, and the offline preview */

  /* the offline preview's fixture player */
  async function startFixtures() {
    if (!fixtures) {
      try {
        const base = 'tools/websmoke/hud_fixtures/';
        const idx = await (await fetch(base + 'index.json')).json();
        fixtures = await Promise.all(idx.map(async (i) => ({ slug: i.slug, title: i.title, doc: await (await fetch(base + i.slug + '.json')).json() })));
      } catch (e) { fixtures = []; }
      if (!picker && fixtures.length) {
        picker = document.createElement('select');
        picker.id = 'hudpick';
        picker.title = 'Preview: a recorded screen (arrow keys step)';
        picker.style.cssText = 'position:absolute;left:10px;top:10px;z-index:5;max-width:320px;font-size:12px';
        picker.innerHTML = fixtures.map((f, i) => '<option value="' + i + '">' + H.esc(f.title) + '</option>').join('');
        picker.onchange = () => showFixture(+picker.value);
        view.appendChild(picker);
        document.addEventListener('keydown', (e) => {
          if (!shown || !fixtures.length || document.activeElement === picker) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') showFixture((fxIdx + 1) % fixtures.length);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') showFixture((fxIdx + fixtures.length - 1) % fixtures.length);
        });
      }
    }
    /* ?fx=<slug> opens that recorded screen (a screenshot, a link to one) */
    try { const want = new URLSearchParams(location.search).get('fx');
      const k = want ? fixtures.findIndex((f) => f.slug === want) : -1; if (k >= 0) fxIdx = k; } catch (e) { /* ignore */ }
    if (fixtures.length) showFixture(fxIdx);
  }
  function showFixture(i) {
    fxIdx = i; if (picker) picker.value = String(i);
    const d = fixtures[i].doc;
    if (d.oled && d.oled.data) { const bin = atob(d.oled.data), b = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k); H.oled = { bytes: b, fmt: d.oled.fmt }; }
    H.doc = null; H.setDoc(d); H.setAlive(true); follow(d);
  }
  H.showFixture = (i) => showFixture(i);   /* smokes */

  /* REVIEW SHEET (?review=1, offline preview): every recorded screen drawn as
   * the Screen view draws it, beside the OLED frame it came from, on one page —
   * so a screen that is wired but looks wrong, or that has drifted from the
   * OLED, shows at a glance (the smokes check structure, not looks). Each
   * screen is rendered into a scratch stage and kept as a copy; canvases are
   * kept as images. The overviews' roll draws the preview's pretend clip. */
  async function review() {
    await startFixtures();
    if (!fixtures || !fixtures.length) return;
    H.reviewAnyModel = true;
    document.body.classList.add('hud-review'); document.documentElement.classList.add('hud-review');
    const page = document.createElement('div'); page.id = 'hudreview';
    page.innerHTML = '<h1>Screen view — review sheet</h1><p>' + fixtures.length + ' recorded screens (tools/websmoke/hud_fixtures), each as the Screen view draws it, beside its OLED frame. Overviews draw the preview’s pretend clip, not the recorded one.</p>';
    const grid = document.createElement('div'); grid.className = 'rv-grid'; page.appendChild(grid);
    const scratch = document.createElement('div'); scratch.className = 'rv-scratch'; page.appendChild(scratch);
    document.body.appendChild(page);
    H.mount(scratch);
    const PER = 30, pg = Math.max(0, (+new URLSearchParams(location.search).get('page') || 1) - 1), pages = Math.ceil(fixtures.length / PER);
    page.querySelector('p').textContent += ' Page ' + (pg + 1) + ' of ' + pages + ' (&page=N).';
    fixtures.slice(pg * PER, pg * PER + PER).forEach((f) => {
      const d = f.doc;
      H.oled = null;
      if (d.oled && d.oled.data) { const bin = atob(d.oled.data), b = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k); H.oled = { bytes: b, fmt: d.oled.fmt }; }
      H.doc = null; H.setDoc(d); H.setAlive(true); H.render();
      const src = scratch.firstElementChild; if (!src) return;
      const copy = src.cloneNode(true);
      copy.classList.remove('hud-fade');
      const sc = src.querySelectorAll('canvas'), cc = copy.querySelectorAll('canvas');
      cc.forEach((cv, i) => { try { const img = document.createElement('img'); img.src = sc[i].toDataURL(); img.style.cssText = cv.getAttribute('style') || ''; img.className = cv.className; img.width = sc[i].width; img.height = sc[i].height; cv.replaceWith(img); } catch (e) { /* keep the canvas */ } });
      const card = document.createElement('div'); card.className = 'rv-card';
      const ol = document.createElement('canvas'); ol.width = 384; ol.height = 192; ol.className = 'rv-oled';
      if (H.oled) H.drawOledCrop(ol, 0, 0, 128, 64);
      const shot = document.createElement('div'); shot.className = 'rv-shot'; shot.appendChild(copy);
      card.innerHTML = '<div class="rv-t"><b>' + H.esc(f.title) + '</b><span>' + H.esc(f.slug) + ' · ' + H.esc((d.where && d.where.screen) || '') + '</span></div>';
      const row = document.createElement('div'); row.className = 'rv-row'; row.appendChild(shot); row.appendChild(ol);
      card.appendChild(row); grid.appendChild(card);
    });
    scratch.remove();
    document.title = 'Screen view review';
    document.body.dataset.review = 'done';
  }
  /* waits for the offline preview's mock connection (the review is offline only) */
  try { if (new URLSearchParams(location.search).has('review')) { let n = 0; const go = () => {
    if (typeof R !== 'undefined' && R && R._mock && typeof M !== 'undefined' && M) review(); else if (++n < 100) setTimeout(go, 200); }; setTimeout(go, 200); } } catch (e) { /* ignore */ }

  /* setView (web_ui_mix.js) calls this when the Screen view opens or closes */
  window.hudShow = function (on) {
    shown = !!on;
    view.classList.toggle('on', shown);
    if (!shown) { stopLive(); if (H.surfaceReleaseAll) H.surfaceReleaseAll(); return; }
    rescale();
    if (typeof R !== 'undefined' && R && R._mock) startFixtures(); else startLive();
    /* the tracks' instrument NAMES (OB-Xd, not "Synth") come with the mixer
     * seed, which only the Mixer view asked for (web_ui_mix.js) */
    if (typeof ensureMixSub === 'function') ensureMixSub();
    H.paint();
  };
  /* the editor's model changes (track states, transport) repaint the status strip */
  setInterval(() => { if (shown) H.paint(); }, 250);

  /* standalone: ?screen=1 — the screen alone, as its own window (web_ui_hud_app.js) */
  try {
    if (new URLSearchParams(location.search).has('screen')) { document.body.classList.add('screen-only'); H.appWindow = true; }
  } catch (e) { /* ignore */ }
});
