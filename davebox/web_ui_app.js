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
  window.dbxApp = { mode, tag, popOut, declareApp, windowUrl };

  if (mode === 'editor') {
    document.body.classList.add('app-window');
    /* an opaque status bar: the toolbar sits at the top and must not run under it */
    declareApp({ title: 'dAVEBOx', short: 'dAVEBOx', manifest: 'web_ui_editor.json', icon: 'web_ui_editor',
                 theme: '#101216', statusBar: 'black' });
  }
  /* Pop out: the editor, at the size of the window it is in now */
  const pop = document.getElementById('popEditor');
  if (pop) pop.addEventListener('click', () => popOut('app', 'davebox-editor',
    Math.max(900, window.innerWidth), Math.max(560, window.innerHeight)));
})();
