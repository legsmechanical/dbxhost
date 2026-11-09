/* dAVEBOx remote UI — the Screen view as its OWN WINDOW, so it reads as an app
 * beside the Move rather than a page inside a browser.
 *
 *   In the editor  a Pop out button opens the screen alone (?screen=1) in a
 *                  window of its own, sized to the screen; the editor stays as
 *                  it was.
 *   As a window    (?screen=1) the stage fills the window (web_ui_hud_source.js
 *                  rescale), and full screen is one gesture away: the button,
 *                  F, or a double-click; Esc leaves (the browser's own). The
 *                  controls show while the pointer moves and fade after a
 *                  moment, and the pointer hides with them, so nothing but the
 *                  screen is left on it.
 *   Installed      the page names itself an app (web_ui_screen.json, the Apple
 *                  tags, through web_ui_app.js): Chrome's "Install page as
 *                  app", Safari's "Add to Dock", or an iPad's "Add to Home
 *                  Screen" open it straight into the screen in a window with
 *                  no browser around it.
 *
 * Only the window mode adds the app tags, so installing from the editor is not
 * offered as the screen. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const view = document.getElementById('screenview');
  if (!view) return;
  const IDLE_MS = 2200;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const fsOk = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  function toggleFull() {
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const el = document.documentElement;
    const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    if (p && p.catch) p.catch(() => { /* refused (no gesture) — nothing to undo */ });
  }
  /* the screen alone in a window sized to the screen (web_ui_app.js) */
  function popOut() {
    const w = Math.max(800, view.getBoundingClientRect().width);
    window.dbxApp.popOut('screen', 'davebox-screen', w, w / 2 + 28);
  }

  const bar = document.createElement('div');
  bar.className = 'hud-appbar';
  view.appendChild(bar);
  function button(label, title, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hud-appbtn'; b.textContent = label; b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    bar.appendChild(b);
    return b;
  }

  if (!H.appWindow) {
    button('Pop out', 'Open the screen in its own window', popOut);
    return;
  }

  /* ---- the window ---- */
  /* the app tags (web_ui_app.js). The screen runs under the status bar (it is
   * dark too) rather than below a reserved black band, so that one is SET even
   * where the page declares it; its content keeps clear of it (rescale). */
  window.dbxApp.declareApp({ title: 'dAVEBOx Screen', short: 'dAVEBOx Screen', manifest: 'web_ui_screen.json', icon: 'web_ui_screen',
                             theme: '#08090b', statusBar: 'black-translucent', forceStatusBar: true });

  const fsBtn = fsOk() ? button('Full screen', 'Full screen (F)', toggleFull) : null;
  function syncFs() { if (fsBtn) fsBtn.textContent = fsEl() ? 'Exit full screen' : 'Full screen'; document.body.classList.toggle('hud-full', !!fsEl()); H.rescale && H.rescale(); }
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);

  let idleT = 0;
  function wake() {
    document.body.classList.remove('hud-idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => document.body.classList.add('hud-idle'), IDLE_MS);
  }
  ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { passive: true, capture: true }));
  wake();
  view.addEventListener('dblclick', (e) => { if (fsOk() && !e.target.closest('.hud-appbar')) toggleFull(); });
  /* The window is a display: the editor behind it is hidden but still listens
   * (Delete, undo, arrows act on its clip), so no key reaches it from here.
   * Captured on the window, ahead of the editor's own document listeners. F is
   * the window's one key; Esc still leaves full screen (the browser's). */
  window.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if ((e.key === 'f' || e.key === 'F') && fsOk()) { e.preventDefault(); toggleFull(); }
  }, true);
});
