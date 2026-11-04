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

  /* scale the 960×480 stage to the space, whole, centred */
  function rescale() {
    if (!shown) return;
    const w = view.clientWidth, h = view.clientHeight;
    const s = Math.max(0.1, Math.min(w / H.cfg.stage.w, h / H.cfg.stage.h) * 0.98);
    fit.style.transform = 'translate(-50%,-50%) scale(' + s.toFixed(4) + ')';
    fit.style.transformOrigin = '50% 50%';
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(rescale).observe(view);
  window.addEventListener('resize', rescale);

  function startLive() {
    if (es) return;
    es = new EventSource('/stream-auto?v=2');
    es.addEventListener('ui', (e) => { try { H.setDoc(JSON.parse(e.data)); } catch (err) { /* a bad document is skipped */ } });
    es.addEventListener('uistate', (e) => { try { H.setAlive(!!JSON.parse(e.data).alive); } catch (err) { /* skip */ } });
    /* the OLED frame (the stream's default event): kept for picture screens */
    es.onmessage = (e) => { try { const f = JSON.parse(e.data);
      if (f && f.data && f.width === 128) { const bin = atob(f.data), b = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); H.setOled(b, 'pages'); } } catch (err) { /* skip */ } };
  }
  function stopLive() { if (es) { es.close(); es = null; } }

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
    if (fixtures.length) showFixture(fxIdx);
  }
  function showFixture(i) {
    fxIdx = i; if (picker) picker.value = String(i);
    const d = fixtures[i].doc;
    if (d.oled && d.oled.data) { const bin = atob(d.oled.data), b = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k); H.oled = { bytes: b, fmt: d.oled.fmt }; }
    H.doc = null; H.setDoc(d); H.setAlive(true);
  }
  H.showFixture = (i) => showFixture(i);   /* smokes */

  /* setView (web_ui_mix.js) calls this when the Screen view opens or closes */
  window.hudShow = function (on) {
    shown = !!on;
    view.classList.toggle('on', shown);
    if (!shown) { stopLive(); return; }
    rescale();
    if (typeof R !== 'undefined' && R && R._mock) startFixtures(); else startLive();
    H.paint();
  };
  /* the editor's model changes (track states, transport) repaint the status strip */
  setInterval(() => { if (shown) H.paint(); }, 250);

  /* standalone: ?screen=1 — the screen alone */
  try {
    if (new URLSearchParams(location.search).has('screen')) document.body.classList.add('screen-only');
  } catch (e) { /* ignore */ }
});
