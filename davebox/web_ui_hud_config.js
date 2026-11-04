/* dAVEBOx remote UI — the Screen view's settings. THE one place to tweak it.
 *
 * Every renderer reads its settings from here; nothing is hard-coded in one.
 * Lists are ORDER: the screen draws them top to bottom / left to right.
 * Take a name out of a list to hide that element; reorder to move it. */
(window.HUDQ = window.HUDQ || []).push((H) => { H.cfg = {
  /* The screen, top to bottom. 'body' is the per-screen layout. */
  regions: ['status', 'header', 'context', 'body', 'hints'],

  /* The status strip, left to right ('spacer' pushes the rest right). */
  statusItems: ['track', 'clip', 'spacer', 'pips', 'transport'],

  /* The context band under the header: per-mode pieces, in this order. Each
   * draws only where its data is (Track View sends banks and steps). */
  contextBands: ['banks', 'steps'],
  /* the bank band's column names (IN / CTRL / SEQ / FX) — off keeps it on one line */
  bankGroupLabels: false,

  /* Extras drawn ON a knob cell, in this order under its name. */
  adornments: ['setDot', 'auto', 'stepLock', 'enumNeighbours', 'rangeBar'],

  /* One colour per knob POSITION (K1..K8), the same on every page. */
  palette: ['#4da3ff', '#3fd28b', '#ffb340', '#ff6b6b', '#b38cff', '#38d4e0', '#ffd84d', '#ff8fc7'],

  /* The stage: a 2:1 screen (the OLED's own aspect), scaled to fit. */
  stage: { w: 960, h: 480 },

  /* Lists fill the screen: this many rows a column, and a long list flows
   * into a second column (the OLED shows ~5). */
  listRows: 9,
  listColumns: 2,

  /* The device's hint keys, spelled out (anything not listed: capitalised). */
  hintWords: { HLD: 'Hold', TCH: 'Touch', SHFT: 'Shift', CLK: 'Click', JOG: 'Jog', KNB: 'Knob', STEP: 'Step',
               BACK: 'Back', REC: 'Rec', DEL: 'Delete', SEL: 'Select', PAD: 'Pad', PADS: 'Pads', LOOP: 'Loop',
               COPY: 'Copy', MUTE: 'Mute', TRK: 'Track', BNK: 'Bank', PG: 'Page', TURN: 'Turn' },

  /* Option words either side of the current one, under a touched enum knob. */
  enumNeighbours: 1,

  /* Motion: screens cross-fade; VALUES NEVER ANIMATE (a turned knob must read
   * its new value the frame it arrives — Josh: "as responsive as possible"). */
  motion: { screenFadeMs: 110 },

  /* A document older than this with no `uistate` alive = show the stale state. */
  staleMs: 3000,
}; });
