/* dAVEBOx remote UI — the Screen view: dAVEBOx's screen, redrawn in colour.
 *
 * The device describes the screen it is drawing (davebox/ui/hud/, published
 * through host_ui_publish → display_server `event: ui`); this view redraws that
 * description on a 2:1 stage. It is an ALTERNATIVE to the OLED, not a panel
 * beside it: every screen is drawn.
 *
 * ⭑ MODULAR BY CONSTRUCTION. Every visible element is a small renderer that
 * registers itself here; the screen is assembled from lists in
 * web_ui_hud_config.js. Add an element = register it + name it in the config;
 * change one = edit its renderer; remove one = take it out of the list.
 * No renderer knows about another. The files:
 *   web_ui_hud_core.js     this: the namespace, the registries, the render loop
 *   web_ui_hud_config.js   THE place to tweak: lists, order, palette, sizes, timing
 *   web_ui_hud_theme.js    the stylesheet (tokens + one block per element)
 *   web_ui_hud_source.js   where documents come from (live stream / offline fixtures)
 *   web_ui_hud_regions.js  status strip, header, hints — the frame of the screen
 *   web_ui_hud_layouts.js  the body per screen family: kit, list, prompt, big, card, text
 *   web_ui_hud_widgets.js  one renderer per knob-cell kind (arc, enumsq, …)
 *   web_ui_hud_adorn.js    the small extras ON a cell (default dot, range bar, …)
 *   web_ui_hud_items.js    the status strip's items (track, clip, pips, transport)
 *   web_ui_hud_viz.js      pictures spanning cells (envelope, filter, …)
 *
 * A renderer is a pure function writing HTML for its own piece. One that throws
 * is replaced by an empty box for that frame and logged once — one bad element
 * never blanks the screen. Registries are resolved at render time, so the
 * files load in ANY order: each file queues its registration on window.HUDQ,
 * and this one runs the queue (and every later push) once the namespace
 * exists. */
(function () {
  const reg = (kind) => { const m = new Map(); return { set: (k, v) => m.set(k, v), get: (k) => m.get(k), all: () => m }; };
  const HUD = window.HUD = {
    regions: reg('region'), layouts: [], widgets: reg('widget'), adorns: reg('adorn'),
    items: reg('item'), viz: reg('viz'),
    doc: null,            /* the latest document */
    alive: true,          /* the device UI is publishing */
    cfg: null,            /* web_ui_hud_config.js */
    region(name, fn) { this.regions.set(name, fn); },
    bands: new Map(),
    band(name, fn) { this.bands.set(name, fn); },
    layout(name, match, fn) { this.layouts.push({ name, match, fn }); },
    widget(kind, fn) { this.widgets.set(kind, fn); },
    adorn(name, fn) { this.adorns.set(name, fn); },
    item(name, fn) { this.items.set(name, fn); },
    vizKind(kind, fn) { this.viz.set(kind, fn); },
  };
  const failed = new Set();
  /* Run one renderer; a throw becomes an empty string (and one log line). */
  HUD.safe = function (key, fn, ...args) {
    if (typeof fn !== 'function') return '';
    try { const out = fn(...args); return out == null ? '' : String(out); }
    catch (e) { if (!failed.has(key)) { failed.add(key); console.warn('screen view: ' + key + ' failed', e); } return ''; }
  };
  HUD.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* The colour of knob position k (0..7) — stable on every page. */
  HUD.knobColor = (k) => (HUD.cfg.palette[k % HUD.cfg.palette.length]);

  /* ── the render loop: one paint per animation frame, only when something changed ── */
  let pending = false, stage = null, lastScreen = null;
  HUD.mount = function (el) { stage = el; HUD.paint(); };
  HUD.paint = function () {
    if (pending || !stage) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  };
  HUD.setDoc = function (doc) {
    if (!doc || (HUD.doc && typeof doc.seq === 'number' && typeof HUD.doc.seq === 'number' && doc.seq < HUD.doc.seq && doc.seq > 1)) return;
    HUD.doc = doc; HUD.paint();
  };
  HUD.setAlive = function (alive) { HUD.alive = !!alive; HUD.paint(); };

  /* The device says which part of a screen is its main content (`primary`:
   * what it drew last); that family's layout is tried first. */
  const PRIMARY = { knobs: 'kit', tracks: 'overview', list: 'list', prompt: 'prompt', bars: 'bars', message: 'message',
                    picture: 'picture', big: 'big', card: 'card', mods: 'perf', wave: 'wave', keyboard: 'keyboard', bankmap: 'bankmap' };
  function layoutFor(doc) {
    const want = doc.body && PRIMARY[doc.body.primary];
    if (want) for (const l of HUD.layouts) { if (l.name === want) { try { if (l.match(doc)) return l; } catch (e) { /* skip */ } } }
    for (const l of HUD.layouts) { try { if (l.match(doc)) return l; } catch (e) { /* a bad matcher never wins */ } }
    return null;
  }
  function render() {
    if (!stage || !HUD.cfg) return;
    const doc = HUD.doc;
    if (!doc) { stage.innerHTML = '<div class="hud-screen hud-wait"><div class="hud-waitmsg">Waiting for dAVEBOx…</div></div>'; return; }
    const lay = layoutFor(doc);
    const regions = HUD.cfg.regions.map((r) => r === 'body'
      ? '<div class="hud-body hud-l-' + (lay ? lay.name : 'none') + '">' + (lay ? HUD.safe('layout:' + lay.name, lay.fn, doc, doc.body || {}) : '') + '</div>'
      : HUD.safe('region:' + r, HUD.regions.get(r), doc)).join('');
    const ov = doc.overlayLayer ? HUD.safe('overlay', HUD.regions.get('overlay'), doc) : '';
    /* the cross-fade plays on a SCREEN change only — never on a value change */
    const sid = (doc.where && doc.where.screen) || '';
    const fade = sid !== lastScreen; lastScreen = sid;
    stage.innerHTML = '<div class="hud-screen' + (fade ? ' hud-fade' : '') + (HUD.alive ? '' : ' hud-stale') + '" data-screen="' + HUD.esc(sid) + '" style="--fade:' + HUD.cfg.motion.screenFadeMs + 'ms">' +
      regions + ov + (HUD.alive ? '' : '<div class="hud-stalemsg">dAVEBOx is not running</div>') + '</div>';
    drawOled();
    if (HUD.drawCustomWidgets) HUD.safe('customWidgets', HUD.drawCustomWidgets, stage, doc);
  }
  HUD.render = render;   /* tests */

  /* The OLED's own frame, for layouts that draw the device's pixels (a
   * picture screen, a module's own widget). `frame` = 1024 bytes in either the
   * stream's page format (SSD1306: byte = 8 vertical pixels) or 'rows'
   * (row-major, MSB = leftmost) as the offline fixtures carry it. */
  HUD.oled = null;
  HUD.setOled = function (bytes, fmt) { HUD.oled = { bytes, fmt: fmt || 'pages' }; drawOled(); };
  function oledPixel(o, x, y) {
    return o.fmt === 'rows' ? (o.bytes[(y * 128 + x) >> 3] >> (7 - (x & 7))) & 1
                            : (o.bytes[(y >> 3) * 128 + x] >> (y & 7)) & 1;
  }
  function drawOled() {
    if (!stage || !HUD.oled) return;
    stage.querySelectorAll('canvas[data-oled]').forEach((cv) => {
      const g = cv.getContext && cv.getContext('2d'); if (!g || !g.createImageData) return;
      const img = g.createImageData(128, 64), acc = [77, 163, 255];
      if (!img || !img.data) return;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
        const on = oledPixel(HUD.oled, x, y), i = (y * 128 + x) * 4;
        img.data[i] = on ? acc[0] : 8; img.data[i + 1] = on ? acc[1] : 9; img.data[i + 2] = on ? acc[2] : 11; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
  }
  HUD.drawOled = drawOled;
  /* one region of the OLED frame into a canvas, crisp, in the accent colour */
  HUD.drawOledCrop = function (cv, x0, y0, w, h) {
    if (!HUD.oled) return;
    const g = cv.getContext && cv.getContext('2d'); if (!g) return;
    const sx = cv.width / w, sy = cv.height / h;
    g.fillStyle = '#0f1114'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = HUD.cfg.palette[0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if (oledPixel(HUD.oled, x0 + x, y0 + y)) g.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.ceil(sx), Math.ceil(sy));
  };

  /* Run what the other files queued before this one loaded, then run each
   * later registration as it arrives. Settings (web_ui_hud_config.js) first,
   * whatever order the files came in, since renderers read them. */
  const queued = window.HUDQ || [];
  const run = (fn) => { try { fn(HUD); } catch (e) { console.warn('screen view: a registration failed', e); } };
  const cfgFirst = queued.filter((fn) => /H\.cfg = /.test(String(fn)));
  cfgFirst.concat(queued.filter((fn) => cfgFirst.indexOf(fn) < 0)).forEach(run);
  window.HUDQ = { push: run };
})();
