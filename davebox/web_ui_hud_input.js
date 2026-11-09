/* dAVEBOx remote UI — the Screen view's HANDS: a click does what a hand on the
 * Move does (Josh, 2026-11-09: "can we make the screen view interactive to the
 * extent possible? mainly thinking about turning knobs, pressing pads on pad
 * map screen - switch tracks by clikcing indicators, etc.").
 *
 * ⭑ THE PAGE SENDS THE HARDWARE GESTURE, never an edit. A knob drag is the
 * encoder's detents with its touch held; a pad is its note; a track tile is
 * Shift + the jog turned by the distance to it; a list row is the jog turned
 * onto it and clicked. The manager puts the packets on the remote-surface ring
 * and the shim replays them on the route a hardware press takes
 * (src/host/remote_surface.h), so the module's own input handlers run and the
 * click does exactly what the gesture does on the device — nothing here
 * re-implements a screen, and nothing can drift from it.
 *
 * What is live is marked in the layouts' markup, not decided here:
 *   data-in="knob"  data-k=0..7 [data-click: touch + jog click opens it]
 *   data-in="pad"   data-note=68..99      (bank map pads, Session clip cells)
 *   data-in="step"  data-note=16..31
 *   data-in="track" data-t=0..7           (track rows, tiles, pips, headers)
 *   data-in="row"   data-path=<doc path of the selection> data-row=<index>
 *   data-in="btn"   data-cc=<button CC>   (a press and a release)
 * The control bar under the screen holds the buttons the screen has no picture
 * of: Shift (a tap latches it), Back, Menu, the jog, the arrows, transport,
 * Copy / Delete / Undo / Mute. A button held half a second stays held until
 * it is tapped again, so a mouse can make a two-handed gesture.
 *
 * Releases are owed: every press is released on pointer up, on a cancelled
 * pointer, when the window loses focus, and — by the manager — when the page's
 * socket closes. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const view = document.getElementById('screenview'), fit = document.getElementById('hudfit');
  if (!view || !fit) return;
  const CC = { jog: 14, click: 3, shift: 49, menu: 50, back: 51, capture: 52, down: 54, up: 55, undo: 56,
               loop: 58, copy: 60, left: 62, right: 63, play: 85, rec: 86, mute: 88, del: 119 };
  const KNOB_CC = 71, DETENT_PX = { mouse: 5, pen: 6, touch: 7 }, WHEEL_PX = 28, KNOB_IDLE_MS = 400, LOCK_MS = 500;
  const PAD_VEL = 100;

  const cc = (n, v) => [0xB0, n, v];
  const on = (n, v) => [0x90, n, v == null ? 127 : v];
  const off = (n) => [0x80, n, 0];
  /* a relative encoder value: 1..63 turns right, 65..127 left (decodeDelta) */
  const rel = (n) => (n > 0 ? Math.min(63, n) : 128 - Math.min(63, -n));
  H.surfaceRel = rel;   /* tests */

  function send(pkts) {
    if (!pkts || !pkts.length) return;
    const R0 = window.schwungRemote;
    if (R0 && typeof R0.surface === 'function') R0.surface(pkts);
  }
  H.surfaceSend = send;

  /* ── Shift: a latch on the bar (and the keyboard's Shift while held) ── */
  let shift = false;
  function setShift(v) {
    v = !!v;
    if (v === shift) return;
    shift = v;
    send([cc(CC.shift, v ? 127 : 0)]);
    syncBar();
  }
  H.surfaceShift = () => shift;

  /* ── a selection driven to a target: the jog turned onto it, then clicked ──
   * The distance comes from the document; whether it ARRIVED comes from the
   * next ones, since a list may skip a heading row or clamp. Clicked only once
   * the device's own selection is the target; stopped when a turn moves
   * nothing (the jog does something else here), and after four rounds. */
  const getPath = (doc, path) => { let o = doc; for (const p of String(path).split('.')) o = o == null ? o : o[p]; return typeof o === 'number' ? o : null; };
  let driving = 0;
  function driveTo(path, target, after) {
    const id = ++driving;
    let rounds = 0;
    const round = () => {
      if (id !== driving) return;
      const s = getPath(H.doc, path);
      if (s == null) return;
      if (s === target) { send(after || [cc(CC.click, 127), cc(CC.click, 0)]); return; }
      if (++rounds > 4) return;
      const d = target - s, n = Math.min(32, Math.abs(d)), pk = [];
      for (let i = 0; i < n; i++) pk.push(cc(CC.jog, d > 0 ? 1 : 127));
      send(pk);
      const seq0 = H.doc && H.doc.seq, t0 = Date.now();
      const wait = () => {
        if (id !== driving) return;
        const now = getPath(H.doc, path);
        const fresh = H.doc && H.doc.seq !== seq0;
        if (fresh && now !== s) { round(); return; }
        if (Date.now() - t0 > 600) { if (now !== s) round(); return; }   /* moved nothing: stop */
        setTimeout(wait, 25);
      };
      setTimeout(wait, 25);
    };
    round();
  }
  H.surfaceDriveTo = driveTo;

  function selectTrack(t) {
    const cur = H.doc && H.doc.where ? H.doc.where.track | 0 : -1;
    if (cur < 0 || t === cur) return;
    /* Shift + jog moves the active track by the jog's distance, clamped at 1
     * and 8 (ui_input_cc.mjs) — one turn of the whole distance */
    const turn = [cc(CC.jog, rel(t - cur))];
    send(shift ? turn : [cc(CC.shift, 127)].concat(turn, [cc(CC.shift, 0)]));
  }
  H.surfaceSelectTrack = selectTrack;

  /* ── pointers on the stage ── */
  const live = new Map();          /* pointerId -> gesture */
  let flushQ = null;               /* knob detents waiting for the next frame */
  function queueTurn(k, n) {
    if (!flushQ) { flushQ = new Map(); requestAnimationFrame(flush); }
    flushQ.set(k, (flushQ.get(k) || 0) + n);
  }
  function flush() {
    const q = flushQ; flushQ = null;
    if (!q) return;
    const pk = [];
    q.forEach((n, k) => { while (n) { const s = Math.max(-63, Math.min(63, n)); pk.push(cc(KNOB_CC + k, rel(s))); n -= s; } });
    send(pk);
  }

  function begin(e) {
    const el = e.target && e.target.closest ? e.target.closest('[data-in]') : null;
    if (!el || !fit.contains(el)) return;
    e.preventDefault();
    try { fit.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
    const ds = el.dataset, g = { kind: ds.in, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, acc: 0, moved: false,
                                 px: DETENT_PX[e.pointerType] || DETENT_PX.mouse };
    if (g.kind === 'knob') {
      g.k = +ds.k | 0; g.click = ds.click === '1';
      knobHold(g.k, true);
    } else if (g.kind === 'pad' || g.kind === 'step') {
      g.note = +ds.note | 0;
      send([on(g.note, g.kind === 'pad' ? PAD_VEL : 127)]);
    } else if (g.kind === 'btn') {
      g.cc = +ds.cc | 0;
      send([cc(g.cc, 127)]);
    } else if (g.kind === 'track') g.t = +ds.t | 0;
    else if (g.kind === 'row') { g.path = ds.path; g.row = +ds.row | 0; }
    live.set(e.pointerId, g);
  }
  function move(e) {
    const g = live.get(e.pointerId);
    if (!g) return;
    if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > 4) g.moved = true;
    if (g.kind !== 'knob') return;
    /* up or right turns it right */
    g.acc += (e.clientX - g.x) - (e.clientY - g.y);
    g.x = e.clientX; g.y = e.clientY;
    const n = (g.acc / g.px) | 0;
    if (n) { g.acc -= n * g.px; queueTurn(g.k, n); }
  }
  function end(e, cancelled) {
    const g = live.get(e.pointerId);
    if (!g) return;
    live.delete(e.pointerId);
    if (g.kind === 'knob') {
      flush();
      if (!cancelled && !g.moved && g.click) send([cc(CC.click, 127), cc(CC.click, 0)]);
      knobHold(g.k, false);
    } else if (g.kind === 'pad' || g.kind === 'step') send([off(g.note)]);
    else if (g.kind === 'btn') send([cc(g.cc, 0)]);
    else if (cancelled || g.moved) return;
    else if (g.kind === 'track') selectTrack(g.t);
    else if (g.kind === 'row') driveTo(g.path, g.row);
  }
  fit.addEventListener('pointerdown', begin);
  fit.addEventListener('pointermove', move);
  fit.addEventListener('pointerup', (e) => end(e, false));
  fit.addEventListener('pointercancel', (e) => end(e, true));
  /* a touch screen's own long-press menu and the editor's text selection */
  fit.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('[data-in]')) e.preventDefault(); });

  /* a knob's touch is held while ANY hand is on it — a drag, or the wheel */
  const knobHands = new Array(8).fill(0);
  function knobHold(k, down) {
    const was = knobHands[k];
    knobHands[k] = Math.max(0, was + (down ? 1 : -1));
    if (!was && knobHands[k]) send([on(k)]);
    else if (was && !knobHands[k]) send([off(k)]);
  }

  /* ── the wheel: over a knob it turns that knob (touched while it turns);
   * anywhere else on the screen it is the jog ── */
  const wheel = { k: -1, acc: 0, t: 0, jog: 0 };
  function wheelRelease() { if (wheel.k >= 0) { flush(); knobHold(wheel.k, false); wheel.k = -1; } }
  fit.addEventListener('wheel', (e) => {
    if (!H.doc) return;
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * WHEEL_PX : e.deltaMode === 2 ? e.deltaY * WHEEL_PX * 8 : e.deltaY;
    const el = e.target.closest ? e.target.closest('[data-in="knob"]') : null;
    if (el && fit.contains(el)) {
      const k = +el.dataset.k | 0;
      if (wheel.k !== k) { wheelRelease(); wheel.k = k; wheel.acc = 0; knobHold(k, true); }
      wheel.acc -= px;
      const n = (wheel.acc / WHEEL_PX) | 0;
      if (n) { wheel.acc -= n * WHEEL_PX; queueTurn(k, n); }
      clearTimeout(wheel.t);
      wheel.t = setTimeout(wheelRelease, KNOB_IDLE_MS);
      return;
    }
    wheelRelease();
    wheel.jog += px;
    const n = (wheel.jog / WHEEL_PX) | 0;
    if (n) { wheel.jog -= n * WHEEL_PX; send([cc(CC.jog, rel(Math.max(-63, Math.min(63, n))))]); }
  }, { passive: false });

  /* ── letting go of everything (focus lost, the view closed) ── */
  function releaseAll() {
    flush();
    live.forEach((g, id) => end({ pointerId: id }, true));
    wheelRelease();
    held.forEach((b) => releaseBtn(b));
    if (keyShift) { keyShift = false; if (!barShift) setShift(false); }
  }
  H.surfaceReleaseAll = releaseAll;
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  /* ── the control bar ── */
  const BAR = [
    ['shift', 'Shift', CC.shift], null,
    ['back', 'Back', CC.back], ['menu', 'Menu', CC.menu], null,
    ['jl', '◀', 'jog-'], ['jc', 'Jog', 'jog'], ['jr', '▶', 'jog+'], null,
    ['left', '‹', CC.left], ['right', '›', CC.right], ['up', '▲', CC.up], ['down', '▼', CC.down], null,
    ['play', 'Play', CC.play], ['rec', 'Rec', CC.rec], ['loop', 'Loop', CC.loop], null,
    ['copy', 'Copy', CC.copy], ['del', 'Delete', CC.del], ['undo', 'Undo', CC.undo], ['mute', 'Mute', CC.mute],
  ];
  const bar = document.createElement('div');
  bar.className = 'hud-ctl';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Move buttons');
  const btns = {};
  BAR.forEach((b) => {
    if (!b) { const s = document.createElement('span'); s.className = 'gap'; bar.appendChild(s); return; }
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'hud-cb'; el.textContent = b[1]; el.dataset.key = b[0];
    el.title = b[0] === 'shift' ? 'Shift (tap to latch)' : b[1] + ' (hold half a second to keep it held)';
    btns[b[0]] = { el, code: b[2], key: b[0], down: false, locked: false, t: 0 };
    bar.appendChild(el);
  });
  view.appendChild(bar);
  const held = new Set();
  function pressBtn(b) {
    if (b.code === 'jog-' || b.code === 'jog+') { send([cc(CC.jog, b.code === 'jog+' ? 1 : 127)]); return; }
    const n = b.code === 'jog' ? CC.click : b.code;
    b.down = true; held.add(b); send([cc(n, 127)]); syncBar();
  }
  function releaseBtn(b) {
    if (!b.down) return;
    const n = b.code === 'jog' ? CC.click : b.code;
    b.down = false; b.locked = false; held.delete(b); send([cc(n, 0)]); syncBar();
  }
  let barShift = false;
  bar.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.hud-cb'); if (!el) return;
    e.preventDefault();
    const b = btns[el.dataset.key];
    if (b.key === 'shift') { barShift = !barShift; setShift(barShift || keyShift); return; }
    if (b.locked) { releaseBtn(b); b.skipUp = true; return; }
    b.t = Date.now(); b.skipUp = false;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    pressBtn(b);
  });
  const barUp = (e, cancelled) => {
    const el = e.target.closest && e.target.closest('.hud-cb'); if (!el) return;
    const b = btns[el.dataset.key];
    if (!b || b.key === 'shift' || b.skipUp || !b.down) return;
    if (!cancelled && Date.now() - b.t >= LOCK_MS) { b.locked = true; syncBar(); return; }
    releaseBtn(b);
  };
  bar.addEventListener('pointerup', (e) => barUp(e, false));
  bar.addEventListener('pointercancel', (e) => barUp(e, true));
  bar.addEventListener('contextmenu', (e) => e.preventDefault());
  function syncBar() {
    Object.values(btns).forEach((b) => {
      const lit = b.key === 'shift' ? shift : b.down;
      b.el.classList.toggle('on', !!lit);
      b.el.classList.toggle('lock', !!b.locked);
    });
  }
  H.surfaceBar = bar;   /* tests */

  /* ── the keyboard, while the Screen view is shown and live: the arrows are
   * the jog, Enter clicks it, Backspace / Esc are Back, Space is Play, and
   * Shift is Shift while it is held ── */
  let keyShift = false;
  const isLive = () => H.shown && H.shown() && !(typeof R !== 'undefined' && R && R._mock);
  window.addEventListener('keydown', (e) => {
    if (!isLive() || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    let pk = null;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': pk = [cc(CC.jog, 1)]; break;
      case 'ArrowLeft': case 'ArrowUp': pk = [cc(CC.jog, 127)]; break;
      case 'Enter': if (!e.repeat) pk = [cc(CC.click, 127), cc(CC.click, 0)]; break;
      case 'Backspace': case 'Escape': if (!e.repeat) pk = [cc(CC.back, 127), cc(CC.back, 0)]; break;
      case ' ': if (!e.repeat) pk = [cc(CC.play, 127), cc(CC.play, 0)]; break;
      case 'Shift': if (!keyShift) { keyShift = true; setShift(true); } e.stopPropagation(); return;
      default: return;
    }
    e.preventDefault(); e.stopPropagation();
    send(pk);
  }, true);
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && keyShift) { keyShift = false; setShift(barShift); }
  }, true);

  /* the bar's height is taken from the stage's room (web_ui_hud_source.js) */
  H.ctlHeight = () => (bar.offsetParent ? bar.offsetHeight : 0);
});
