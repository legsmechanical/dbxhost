/* dAVEBOx remote UI — the Screen view's settings. THE one place to tweak it.
 *
 * Every renderer reads its settings from here; nothing is hard-coded in one.
 * Lists are ORDER: the screen draws them top to bottom / left to right.
 * Take a name out of a list to hide that element; reorder to move it. */
(window.HUDQ = window.HUDQ || []).push((H) => { H.cfg = {
  /* The screen, top to bottom. 'body' is the per-screen layout. */
  regions: ['status', 'header', 'body', 'hints'],

  /* The status strip, left to right ('spacer' pushes the rest right). */
  statusItems: ['track', 'clip', 'spacer', 'pips', 'transport'],

  /* Extras drawn ON a knob cell, in this order under its name. */
  adornments: ['setDot', 'auto', 'stepLock', 'enumNeighbours'],   /* no range bar: the dial says where it sits (Josh, 2026-11-09: "we don't need the param range thing") */

  /* One colour per knob POSITION (K1..K8), the same on every page. */
  palette: ['#4da3ff', '#3fd28b', '#ffb340', '#ff6b6b', '#b38cff', '#38d4e0', '#ffd84d', '#ff8fc7'],

  /* The stage: a 2:1 screen (the OLED's own aspect), scaled to fit. */
  /* As an app window the stage takes the window's shape between these heights
   * (960 wide): 21:9 at the short end, 4:3 (an iPad on its side) at the tall. */
  stage: { w: 960, h: 480, minH: 410, maxH: 720 },

  /* Lists fill the screen in one column (the OLED shows ~5): 9 rows of 34 px fit the 324 px body; a blank
   * separator or divider costs about half a row. */
  listRows: 9,
  listColumns: 1,

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
