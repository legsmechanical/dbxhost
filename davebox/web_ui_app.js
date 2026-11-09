/* dAVEBOx remote UI — the editor and the Screen view as WINDOWS of their own,
 * each installable as its own app, so neither has to live inside a browser tab.
 *
 *   ?app=1     the editor (Sequencer / Mixer / Sound / Screen) alone: no site
 *              ribbon, the views and the toolbar only. It lays itself out to
 *              whatever size the window is (the layout is responsive), and
 *              opens on the view in the address (#seq, #mix ...) or the last one.
 *   ?screen=1  the Screen view alone (web_ui_hud_app.js does the rest there).
 *
 * Each names itself an app in its window (its own manifest, id and icon), so
 * Chrome's "Install page as app" / "Create shortcut → Open as window", Safari's
 * "Add to Dock" or an iPad's "Add to Home Screen" open it straight into that
 * window — two apps, side by side. A plain page declares neither, so it is
 * never offered for install as one of them by accident.
 *
 * The editor's toolbar has Pop out (the editor in its own window); the Screen
 * view has its own (web_ui_hud_app.js). Shared here: window.dbxApp. */
(function () {
  const q = new URLSearchParams(location.search);
  const mode = q.has('screen') ? 'screen' : q.has('app') ? 'editor' : null;
  const head = document.head;

  /* added only where the page has none — a page that already declares itself
   * (the touch layout's own Apple tags) keeps its values, never a second,
   * conflicting copy; `force` sets the value even then */
  function tag(name, attrs, force) {
    const key = attrs.name ? '[name="' + attrs.name + '"]' : '[rel="' + attrs.rel + '"]';
    const had = head.querySelector(name + key);
    if (had) { if (force) for (const k in attrs) had.setAttribute(k, attrs[k]); return had; }
    const e = document.createElement(name); for (const k in attrs) e.setAttribute(k, attrs[k]); head.appendChild(e);
    return e;
  }
  /* this page as one of the windows (the manager's carried query keeps the tool
   * selection; the editor keeps the view it is on) */
  function windowUrl(which) {
    const p = new URLSearchParams(location.search); p.delete('screen'); p.delete('app'); p.set(which, '1');
    return location.pathname + '?' + p.toString() + (which === 'app' ? location.hash : '');
  }
  function popOut(which, name, w, h) {
    const win = window.open(windowUrl(which), name, 'popup=yes,width=' + Math.round(w) + ',height=' + Math.round(h));
    if (win) { try { win.focus(); } catch (e) { /* ignore */ } }
    return win;
  }
  /* the app tags: manifest, title, icons; statusBar is what an iPhone / iPad
   * home-screen app draws behind its status bar */
  function declareApp(o) {
    document.title = o.title;
    tag('link', { rel: 'manifest', href: o.manifest });
    tag('meta', { name: 'theme-color', content: o.theme });
    tag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    tag('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    tag('meta', { name: 'apple-mobile-web-app-status-bar-style', content: o.statusBar }, !!o.forceStatusBar);
    tag('meta', { name: 'apple-mobile-web-app-title', content: o.short }, true);
    tag('link', { rel: 'apple-touch-icon', href: o.icon + '-180.png' });
    tag('link', { rel: 'icon', type: 'image/png', href: o.icon + '-192.png' });
  }
  /* The display's safe area (a phone's camera cutout, home bar, corners), read
   * from env() through a probe. */
  let probe = null;
  function safeArea() {
    if (!probe) {
      probe = document.createElement('div');
      probe.dataset.hudSafeArea = '1';
      probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(probe);
    }
    const c = getComputedStyle(probe), px = (v) => parseFloat(v) || 0;
    return { t: px(c.paddingTop), r: px(c.paddingRight), b: px(c.paddingBottom), l: px(c.paddingLeft) };
  }
  /* A phone on its side reports the SAME inset on both sides, but the cutout is
   * on one: the top of the phone, which is on the left when it is turned
   * counter-clockwise (angle 90) and on the right at 270. That side keeps the
   * whole inset; the other only clears the rounded corner. Unknown → both. */
  const CORNER = 16;
  function safeSides(a) {
    const ang = screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle
      : typeof window.orientation === 'number' ? (window.orientation + 360) % 360 : -1;
    if (a.l > 0 && a.r > 0 && Math.abs(a.l - a.r) < 1) {
      if (ang === 90) return { l: a.l, r: Math.min(a.r, CORNER) };
      if (ang === 270) return { l: Math.min(a.l, CORNER), r: a.r };
    }
    return { l: a.l, r: a.r };
  }
  window.dbxApp = { mode, tag, popOut, declareApp, windowUrl, safeArea, safeSides };

  if (mode === 'editor') {
    document.body.classList.add('app-window');
    /* an opaque status bar: the toolbar sits at the top and must not run under it */
    declareApp({ title: 'dAVEBOx', short: 'dAVEBOx', manifest: 'web_ui_editor.json', icon: 'web_ui_editor',
                 theme: '#101216', statusBar: 'black' });
    /* the page clears the cutout only on its side (the touch layout pads both) */
    const fitSides = () => { const sd = safeSides(safeArea()), st = document.documentElement.style;
      st.setProperty('--app-safe-l', sd.l + 'px'); st.setProperty('--app-safe-r', sd.r + 'px'); };
    fitSides();
    window.addEventListener('resize', fitSides);
    window.addEventListener('orientationchange', () => setTimeout(fitSides, 50));
    if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => setTimeout(fitSides, 50));
  }
  /* Pop out: the editor, at the size of the window it is in now */
  const pop = document.getElementById('popEditor');
  if (pop) pop.addEventListener('click', () => popOut('app', 'davebox-editor',
    Math.max(900, window.innerWidth), Math.max(560, window.innerHeight)));
})();
