/* dAVEBOx remote UI — the Screen view's HANDS (Josh, 2026-11-09: "can we
 * make the screen view interactive to the extent possible? mainly thinking
 * about turning knobs, pressing pads on pad map screen - switch tracks by
 * clikcing indicators, etc."; narrowed 2026-11-10: "touch controls were really
 * just about switching tracks and turning knobs").
 *
 * ⭑ THE PAGE SENDS THE HARDWARE GESTURE, never an edit. A knob drag is the
 * encoder's detents with its touch held; a pad is its note; a track is Shift +
 * the jog turned by the distance to it. The manager puts the packets on the
 * remote-surface ring and the shim replays them on the route a hardware press
 * takes (src/host/remote_surface.h), so the module's own input handlers run —
 * nothing here re-implements a screen.
 *
 * What is live is marked in the layouts' markup, not decided here:
 *   data-in="knob"  data-k=0..7           (knob cells, bars columns, mixer dials)
 *   data-in="track" data-t=0..7           (track rows, tiles, pips, headers)
 *   data-in="pad"   data-note=68..99      (the bank map's pads)
 * Nothing else is: list rows, dialog buttons, keys and the transport are
 * pictures (Josh, 2026-11-10: "just get rid of tapping rows").
 * Releases are owed: every press is released on pointer up, on a cancelled
 * pointer, when the window loses focus, and — by the manager — when the page's
 * socket closes. */
(window.HUDQ = window.HUDQ || []).push((H) => {
  const view = document.getElementById('screenview'), fit = document.getElementById('hudfit');
  if (!view || !fit) return;
  const CC = { jog: 14, shift: 49 };
  const KNOB_CC = 71, DETENT_PX = { mouse: 5, pen: 6, touch: 7 }, WHEEL_PX = 28, KNOB_IDLE_MS = 400;
  const PAD_VEL = 100;

  const cc = (n, v) => [0xB0, n, v];
  const on = (n, v) => [0x90, n, v == null ? 127 : v];
  const off = (n) => [0x80, n, 0];
  /* a relative encoder value: 1..63 turns right, 65..127 left (decodeDelta) */
  const rel = (n) => (n > 0 ? Math.min(63, n) : 128 - Math.min(63, -n));
  H.surfaceRel = rel;   /* tests */

  /* ⚠ PACED. A hand never presses and lets go inside one frame, and the
   * module reads a gesture that does as nothing: on the device, Shift + jog
   * sent as one burst left the track where it was, and a jog press + release
   * in one burst opened nothing — each worked with 10 ms between packets
   * (measured 2026-11-09). So a press or a release is kept PACE_MS from the
   * packet before it and the one after it; a run of detents (encoders, the
   * jog) still goes out together, as a spun knob's do. */
  const PACE_MS = 30;
  const isTurn = (p) => p[0] === 0xB0 && (p[1] === CC.jog || (p[1] >= KNOB_CC && p[1] < KNOB_CC + 8));
  const queue = [];
  let lastAt = -1e9, lastHold = false, pumpT = 0;
  function raw(pkts) {
    const R0 = window.schwungRemote;
    if (R0 && typeof R0.surface === 'function') R0.surface(pkts);
  }
  function pump() {
    pumpT = 0;
    while (queue.length) {
      const hold = !isTurn(queue[0]), since = Date.now() - lastAt;
      if ((hold || lastHold) && since < PACE_MS) { pumpT = setTimeout(pump, PACE_MS - since); return; }
      const run = [queue.shift()];
      if (!hold) while (queue.length && isTurn(queue[0])) run.push(queue.shift());
      raw(run);
      lastAt = Date.now(); lastHold = hold;
    }
  }
  function send(pkts) {
    if (!pkts || !pkts.length) return;
    queue.push(...pkts);
    if (!pumpT) pump();
  }
  H.surfaceSend = send;
  H.surfacePaceMs = PACE_MS;   /* tests */
  H.surfaceIdle = () => !pumpT && !queue.length;   /* tests */

  /* the track last asked for, until the screen shows it: the document that
   * says where the device is arrives a frame or more after the turn, so a
   * second click measured from it counted the first move again (a double
   * click on a pip went past it) */
  const AIM_MS = 1500;
  let aim = null;
  function selectTrack(t) {
    /* co-run: Move owns Shift and the jog, so on the hardware Shift + jog goes
     * to Move and our track stays put. A browser press reaches only us, so it
     * would switch our track behind Move's screen — nothing a hand can do.
     * The track buttons stand down there (device, 2026-11-10). */
    if (H.doc && H.doc.where && H.doc.where.screen === 'co-run') return;
    const shown = H.doc && H.doc.where ? H.doc.where.track | 0 : -1;
    if (shown < 0) return;
    if (aim && (shown === aim.t || Date.now() - aim.at > AIM_MS)) aim = null;
    const cur = aim ? aim.t : shown;
    if (t === cur) return;
    /* Shift + jog moves the active track by the jog's distance, clamped at 1
     * and 8 (ui_input_cc.mjs) — one turn of the whole distance */
    const turn = [cc(CC.jog, rel(t - cur))];
    send([cc(CC.shift, 127)].concat(turn, [cc(CC.shift, 0)]));
    aim = { t, at: Date.now() };
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
    /* the main button only: a right click is the browser's menu, a middle
     * click its scroll — neither presses a pad (a touch and a pen tip are 0) */
    if (e.button) return;
    const el = e.target && e.target.closest ? e.target.closest('[data-in]') : null;
    if (!el || !fit.contains(el)) return;
    e.preventDefault();
    try { fit.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
    const ds = el.dataset, g = { kind: ds.in, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, acc: 0, moved: false,
                                 px: DETENT_PX[e.pointerType] || DETENT_PX.mouse };
    if (g.kind === 'knob') {
      g.k = +ds.k | 0;
      knobHold(g.k, true);
    } else if (g.kind === 'pad') {
      g.note = +ds.note | 0;
      send([on(g.note, PAD_VEL)]);
    } else if (g.kind === 'track') g.t = +ds.t | 0;
    else return;
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
      knobHold(g.k, false);
    } else if (g.kind === 'pad') send([off(g.note)]);
    else if (cancelled || g.moved) return;
    else if (g.kind === 'track') selectTrack(g.t);
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
   * anywhere else it scrolls nothing and sends nothing ── */
  const wheel = { k: -1, acc: 0, t: 0 };
  function wheelRelease() { if (wheel.k >= 0) { flush(); knobHold(wheel.k, false); wheel.k = -1; } }
  fit.addEventListener('wheel', (e) => {
    if (!H.doc) return;
    const el = e.target.closest ? e.target.closest('[data-in="knob"]') : null;
    if (!el || !fit.contains(el)) { wheelRelease(); return; }
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * WHEEL_PX : e.deltaMode === 2 ? e.deltaY * WHEEL_PX * 8 : e.deltaY;
    const k = +el.dataset.k | 0;
    if (wheel.k !== k) { wheelRelease(); wheel.k = k; wheel.acc = 0; knobHold(k, true); }
    wheel.acc -= px;
    const n = (wheel.acc / WHEEL_PX) | 0;
    if (n) { wheel.acc -= n * WHEEL_PX; queueTurn(k, n); }
    clearTimeout(wheel.t);
    wheel.t = setTimeout(wheelRelease, KNOB_IDLE_MS);
  }, { passive: false });

  /* ── letting go of everything (focus lost, the view closed) ── */
  function releaseAll() {
    flush();
    live.forEach((g, id) => end({ pointerId: id }, true));
    wheelRelease();
  }
  H.surfaceReleaseAll = releaseAll;
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

});
