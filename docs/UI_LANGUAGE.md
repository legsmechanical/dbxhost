# UI Language

The normative spec for the 128×64 1-bit display and the pad/button LEDs.

This is **adapted from what exists**, not invented. Every number here was read out of
`davebox/ui/ui_movy.mjs`, `davebox/ui/ui_cells.mjs`, `davebox/ui/ui_constants.mjs`, or
`src/shared/menu_layout.mjs` — the canvaskit v27 chassis davebox already runs. Where the code
disagrees with itself, this document says which side is normative and marks the other as a
**deviation** to be retired, rather than pretending the language is already uniform.

**Why now:** presentation is being centralized so that visual polish is a single late pass rather
than a rework of every screen. A spec that describes reality is what makes that possible; a spec
that describes an aspiration would just be a third idiom.

## 0. The rule that makes the rest cheap

**New and rebuilt screens compose from shared primitives. They do not call `set_pixel` /
`fill_rect` / `print` directly.**

`ui_movy.mjs` is the reference model: pure drawing, no imports, no state access, callers pass
precomputed cell descriptors — which is why it also loads standalone in node for the off-device
previewer (`davebox/tools/preview_movy.mjs`) and the screen/widget renderers
(`tools/render_screens.mjs`, `tools/render_widgets.mjs`, sharing `tools/render_fb.mjs`).

⚠⚠ **AN OFFLINE RENDER IS NOT REPRODUCIBLE UNLESS YOU FREEZE THE CLOCK.** `drawKitPageBar` blinks
its active segment off `Date.now()/375`, so the same page renders two different pictures depending
on when you ran it — and a before/after PNG diff taken without pinning it is pure noise. It has
already reported eight manual screens as "changed" by a style port that changed none of them. Use
`freezeClock()` from `render_fb.mjs`. Anything built to that shape can be restyled once
and change everywhere. Anything that draws directly has to be found and edited by hand.

Screens absorbed from the host get rebuilt against these primitives from day one. Structurally
on-language beats visually finished — the styling pass comes later and reaches all of them.

## 1. Canvas

- **128 × 64, 1-bit.** `1` = lit (white), `0` = unlit (black). No grey, no alpha.
- **Drawing surface**: the host globals `clear_screen()`, `print(x,y,text,color)`,
  `text_width(text)`, `set_pixel(x,y,v)`, `fill_rect(x,y,w,h,v)`, `draw_rect`, `draw_line`.
  The object form (`display.fillRect`, …) is an alias; **prefer the bare globals** — that is what
  the whole tree uses, and mixing the two buys nothing.
- **There is no XOR primitive.** "Flashing" is time-gating which of two solid states is drawn this
  frame (`ui_movy.mjs` blinks the active page segment off `Date.now()/375`, ≈1.3 Hz). Do not
  reach for an inversion trick that does not exist.
- **Inverse video is the only compositing idiom**: `fill_rect(...,1)` then print in `0`. It is the
  selection grammar, the touch feedback, and the button-pressed state — see §6.

⚠ `ui_movy.mjs` re-implements `rectOutline()` from four `fill_rect` calls rather than calling the
host's `draw_rect`, and `plotLine()` rather than `draw_line`, so 1-bit geometry stays exact.
**Normative: keep using the movy helpers** inside movy-family screens. This is deliberate, not an
oversight.

## 2. Fonts

Caps-only is the default assumption. Three of the five fonts have no real lowercase.

| Font | Print / measure | Metrics | Use |
|---|---|---|---|
| **Header** | `hdrPrint` / `hdrWidth` / `fitHdr` | 6×6 monospace, caps + digits | Header bar, overlay rows, section picker |
| **Label** | `mvPrint` / `mvWidth` | 5px tall, proportional, −1px tracking | Cell label strips |
| **Micro** | `pf3Print` / `pf3Width` | 5×3, force-uppercased | Enum squares — where words must fit a 20px box |
| **Big numeric** | `bigPrint` / `bigWidth` / `bigFit` | `MV_BIG_H = 11` cap height, `BIG_GAP = 1`, condensed variant | Frameless numeric read-outs (`valsq`) |
| **MCUFONT 5×5** | `pixelPrint` / `pixelPrintC` | 5×5 on a 6×6 grid | Dialog chrome in `ui_dialogs.mjs` |
| **Host built-in** | `print` / `text_width` | nominally 5×7; `LIST_LINE_HEIGHT = 9` | The shared menu list |

**Measure, never estimate.** Every font ships a paired `*Width()` that walks the glyph table and
sums real advances. `text.length * charWidth` is wrong for four of the six and will silently
overflow the cell.

⚠ **The limit is often smaller than the screen.** `drawKitHeader` fits to `SCREEN_W - 4` = **124px**,
not 128. A title measuring 125px loses its last character with nothing to say so. (Measured
2026-08-13: `TRACK [5] SETTINGS` = 125px; an earlier `MOVE 2 - TRACK CONTROL` = 153px and never fit
at all.)

### 2.1 Coverage differs BETWEEN fonts — probe before using a character

"Caps-only" is the default assumption, not a guarantee, and the exceptions are per-font. Established
by probing the glyph tables (2026-08-13), not by reading comments:

| | Header (`hdrPrint`) | Label (`mvPrint`) |
|---|---|---|
| true lowercase glyphs | **`d`, `t`** | **`y`** |
| square brackets `[` `]` | **ABSENT** — advance, draw nothing | present |
| punctuation with ink | `! # % ( ) + , - . / : < > ?` | wider |

Two consequences, both seen on hardware:

- **Mixed-case text renders with a few odd letters.** Every other lowercase letter already maps to
  its capital, so only these show — and the result reads as a typo, not a style. `Track to` drew as
  "TRACK tO", `Generator` as "GENERAtOR", `Poly` as "POLy".
  ⇒ `drawKitList` and `drawKitHeader` **uppercase before measuring or printing**. That is a **visual
  no-op for every other character**, so it can only ever correct these glyphs and no caller has to
  remember. Prefer this to uppercasing at each call site.
- **A missing glyph is silent.** `[` and `]` in a header advance the cursor and draw nothing, so
  `TRACK [5] SETTINGS` came out as `TRACK 5  SETTINGS` with a hole. Use `( )` in the header; the
  label font has square brackets, which is why the row edit indicator `[VALUE]` is unaffected.

**How to probe:** count `fill_rect`/`set_pixel` calls while printing a single character — zero means
the glyph is blank. A throwaway `tests/js/test_zz*.mjs` importing `ui_movy.mjs` does it in seconds,
and a screengrab confirms it on the device.

**Truncation** is hard-clip from the end, no ellipsis:
`fitHdr(t, maxW)` drops trailing characters until `hdrWidth(t) <= maxW`. The big font instead
**degrades tier by tier** — normal spacing → condensed → give up and fall back to the label font
(`bigFit`) — because a clipped number is a *wrong* number, while a clipped word is still readable.
The one true `…` in the tree is `truncLabel()` in `ui_dialogs.mjs`; treat that as dialog-local.

⚠ The header font is caps-only **except** for two hand-carved lowercase glyphs, `d` and `t`
(`ui_movy.mjs:60-67`). They exist so musical suffixes read correctly: a capital `D` stripped of its
diagonal reads as `0`, which turns `1/64d` into `1/640`. Do not "tidy" them away.

## 3. The cell grid

The parameter-page chassis: **4 columns × 2 rows = 8 cells**, one per hardware knob (CC 71–78).

```
hdr  0-7   (text at y=1)      MV_HDR_H = 8
blank 8
bar   9    page indicator     MV_BAR_Y = 9
gap  10-13
w0   14-29 widgets row 0      MV_ROW0_Y = 14
lbl0 30-36 labels row 0       MV_LBL0_Y = 30, MV_LBL_H = 7
gap  37-40
w1   41-56 widgets row 1      MV_ROW1_Y = 41
lbl1 57-63 labels row 1       MV_LBL1_Y = 57
```

- `MV_CELL_W = 32` → 4 × 32 = 128, **no horizontal gutter**. Columns butt together.
- Widget box `MV_KW = 20` × `MV_KH = 16`, centred in the cell.
- Cell *k*: `col = k % 4`, `rowY = k < 4 ? MV_ROW0_Y : MV_ROW1_Y`. Cells 0–3 top, 4–7 bottom.
- Overlays share one footprint: `MV_ZOOM_X = 32, MV_ZOOM_Y = 14, MV_ZOOM_W = 64, MV_ZOOM_H = 48`
  — a centred 64×48 box starting exactly at the widget-row top, so the value zoom and the picker
  list read as one control rather than two different panels.

These metrics are pixel-identical to canvaskit v27's documented vertical map. **Do not re-derive
them per screen**; import the constants.

### Widgets

Descriptor kinds, and what each draws (`drawCellWidget` dispatch):

| Kind | Shape | For |
|---|---|---|
| `arc` / `arcbip` | Arc knob, r7 — bipolar variant fills from centre | Continuous values |
| `hbar` | Two-state bar | Toggles |
| `vbar` | Vertical bar, bottom-up | Mix / level feel (`fader` cells) |
| `enumsq` | Framed micro-font square | Named enums whose words won't fit the big font |
| `valsq` | Frameless big numeric | Counts, octaves, note read-outs |
| `frac` | Stacked fraction | Musical lengths (`1/16t`) |
| `dirsq` | Direction arrows | Playback direction |
| `wavesq` | One-cycle waveform box | Wave-select cells |
| `xbox` | Framed diagonal cross | "Nothing routed here" |
| `action` | One-shot square | Triggers |
| 🟠 `pill` | Switch pill — ON fills the track and knocks the slug out | **MOCKUP, unadopted** (§3.2) |
| 🟠 `faderail` | Dashed rails + framed dithered column + head | **MOCKUP, unadopted** (§3.2) |

Spans override cells where a shape carries more meaning than eight separate knobs. All four are
**DECLARED by the caller, never detected** — `drawKitCells(cells, touchedIdx, env, filt, eq, samp)`:

| Span | Draws | Declared as |
|---|---|---|
| `env` | ADSR / AD / AR / ASR, geometry derived from the span so a 2-cell AD and a 4-cell ADSR both read correctly | `{ start, count, roles }` |
| `filt` | LP/HP/BP/notch/peak/AP response across two cells | `{ start, cutoffNorm, resoNorm, mode, steep, fill }` |
| `eq` | Two shelves + a bell summed about a dotted 0 dB line | `{ start, count, low, mid, high, fill }` |
| `samp` | Mirrored sample body, playhead, loop brackets, spray fences, base mark | `{ start, count, peaks, pos, basePos, spray, loopStart, loopEnd }` |

⚠ **No auto-detection, ever.** Upstream's viz resolver is engine-side and metadata-corroborated;
davebox has no equivalent metadata, so a renderer that sniffed param names would restyle a page as
a side effect of *renaming a knob*. A bank that wants a graphic says so.

### 3.1 Ghost fill — one treatment, three graphs

The filter response, the EQ curve and the sample body are pictures of the maths. They are allowed
to differ in **shape** and must not differ in **treatment**, so there is exactly one
`fillCurveMass()` and they all call it: a CHECKER (50%) mass between the curve and its zero line,
drawn **before** the stroke (the stroke is solid, the fill is not — reverse them and the lattice
punches through the line). The curve becomes an *area*, which is the reading a musician wants —
how much of the note is loud, how much of the spectrum passes — rather than a boundary to integrate
by eye. Upstream's widget catalog ran this against seven alternatives and it won all four of its
sets; the hairline it replaced ranked 7th–10th.

- **Unipolar** graphs (filter) fill to the FLOOR; **bipolar** ones (EQ) fill to the CENTRE, so a cut
  fills downward. Filling to the floor on a bipolar graph detaches the shape from its own ink.
- **Opt-in on the filter** (`filt.fill`), because that curve already ships on davebox bank pages and
  turning it on by default would restyle a live screen nobody asked to change.
- ⚠ **No notched corners here**, though they are the house idiom for every box. A box's corners are
  a design decision; the corners of a filled curve are DATA — the left edge of a passband, the floor
  a release lands on — and rounding them off misrepresents the parameter.
- ACCEPTED COST: at a high sustain the mass covers most of a 13-row band, and twelve rows of checker
  at true size reads as grey rather than texture. The page gets heavier.

### 3.2 The modulation dot, the `~`, and what is still a mockup

**Modulation dot** (`drawModDot`, cell field `modNorm`): the pointer keeps showing the BASE you
dialled in; a separate five-pixel plus rides the LIVE value. Two values on one knob is the point —
with the pointer chasing an LFO you lose sight of what you set, and turning the knob edits the base,
not what you were watching.

- ⚠ **Drawn even when it coincides with the pointer.** The mark's absence must mean "nothing is
  modulating this", never "the source happens to be at the base right now".
- ⚠ **A five-pixel plus, not a 2×2 block.** An even-sized mark cannot be centred on a pixel, so at
  the cardinal angles it rounds a whole pixel off the track it is meant to be showing. A 3×3 is a
  blob on an r7 knob; one bare pixel is too faint beside a 1px ring and a pointer.
- ⚠ **Inside the ring, never on it** — one pixel of clearance at every angle, or the dot reads as
  lumps growing out of the rim and merges with the ring at the shoulders.
- A span graphic COVERS its cells, so the dot cannot reach them; `samp` carries the same information
  as its own **base mark** (a coarse 2-on-2-off dash, told apart from the solid cursor and the fine
  spray dither by its rhythm), and `faderail` as two stubs outside the rails.

**Label third state** (`modulated`): a trailing `~` on the label strip. It rides the NAME, not the
value — the widget is already showing the value moving; what the strip has to add is *why*. ⚠ Not
drawn on the touched cell, where the strip is answering "what number is this".

**Both are descriptor fields, and davebox sets neither today**, so every shipping cell renders
identically. A bank that gains a modulation source needs a *value*, not a widget.

🟠 **Unadopted mockups.** `pill` and `faderail` are drawn only by `tools/render_widgets.mjs`;
nothing in `ui_cells.mjs` emits them. They are here to be judged as renders and **deleted if the
answer is no** — do not quietly wire one in. The pill's argument is that the TRACK carries the state
(ON fills it and knocks the slug out) so the two states differ by most of the widget's area; the
fader's is that its interior lattice re-phases on a sub-row remainder, so a detent too small to move
the bar still moves the texture — measured upstream at 44 distinct pictures per 127 steps against
the plain bar's 12.

## 4. Header and page bar

- **Resting header** (`drawKitHeader`): filled white bar, **black** text, left-aligned at (2,1),
  ALL CAPS. The `invert` flag gives the secondary-bank variant (white-on-black). ⚠ These colours
  are inverted relative to canvaskit v27 — davebox's flavour, Josh's call. Normative here.
- **Touched header** (`drawKitTouchedHeader`): the bar drops out and the **full param name**
  renders centred in white, with a 1px rule at `MV_BAR_Y`. The state flip *is* the touch feedback.
  The label strip below simultaneously swaps from name to **value** — movy's signature swap.
  No page bar in this state.
- **Page bar** (`drawKitPageBar`, row 9, resting only): one segment per bank, 1px dividers, widths
  evenly divided with the rounding remainder spread across the leading segments. The active
  segment blinks solid ↔ dotted.
- **Status glyph**: a down-chevron top-right (`drawKitAltArrow`) means "this bank has alt params".
  It may itself blink. This is the whole glyph vocabulary — resist adding more.

**HUD card** (P7): `hudCard(title, value)` in `ui_movy.mjs` is the reusable value-HUD frame —
near-full-width card, header-font title left / value right over a rule, returns the body rect for
the caller to fill (waveform, meter, custom read-out). New value-HUD work composes on it.
`drawKitValueOverlay` (the turn-to-reveal zoom) keeps its own zoom-box lifecycle; it predates the
card and stays.

**Host header matches (P7).** The host's `drawMenuHeader` draws the same filled-bar/black-text
treatment, so host-native screens (Tools, Global Settings, Master FX, pickers) read as the same
app. Its bar's bottom edge replaced the old separate rule line.

## 5. Lists, pickers, dialogs

### 5.0 ⭑⭑ WHICH CHASSIS — the rule, and why it exists

Two list chassis are documented below and both are legitimate, which for months
left no answer to *which one do I reach for*. The answer was therefore whichever
file a screen happened to be written in: `ui_sound.mjs` was 37 kit calls and 0
host, `ui_dialogs.mjs` was 0 kit and 31 host. Nobody chose that.

**The rule, normative as of 2026-08-15:**

> **A screen that lists the app's own structure renders on the KIT**
> (`drawKitHeader` + `drawKitList`). **The host chassis is for DIALOGS** — a
> header, some prose, and a button row.

Corollaries, each of which was a real screen before the cohesion pass:

- **⚠ SUPERSEDED 2026-08-27 — the ROW FONT is no longer a per-row choice.**
  The menu type rule (Josh: *"Header is always HDRfont. Listings under header are
  always schwung stock. params, anything else to the right are always movy
  small."*) made the stock font `drawKitList`'s DEFAULT for every label, so
  `hdr: true` **no longer selects a label font at all** — it steers only the
  centred `note` rows. The two PICKERS opt out by name (`hostLabels: false`),
  which is the only path that still reaches the header-font branch.
  *(What this bullet used to say: `hdr: true` gives a row the header font, use it
  for the app's own rows and leave it off for names out of data. That advice
  became a no-op the day the default changed; it is kept here because a row that
  still passes `hdr: true` is not wrong, merely inert.)*
- **A confirm or an info screen stays a dialog.** It already shares the filled-bar
  header and the one button family (§5), so it reads as the same app. Converting
  it to a list is churn that looks like progress.
- **Do not hand-roll a list.** Every hand-rolled one in this tree drifted: its
  own row height, its own inset highlight, its own scroll glyphs, and a guessed
  truncation. All are gone; do not add the next one.
- **Do not invent a selection idiom.** Inverse video is it. A `< NAME >` value
  row and a `[x]` checkbox both existed here; the second actively collided with
  §6, where square brackets mean *being edited*.
- **A row that opens something shows a chevron; a row that holds a value shows
  the value.** `chevron` and `value` are mutually exclusive by construction, so
  the right-hand column always answers exactly one question. A row that opens an
  overlay AND has a value to show (an enum param, a knob's assignment) keeps the
  value — the chevron is for doors with nothing else to say.
- **⭑ QUALIFY ON COLLISION ONLY** (Josh, 2026-08-27). A list of things named by
  DATA shows the bare name; a qualifier is added to a row **only when another row
  in the same list carries the same name**, and it is a `qual` (movy small, beside
  the name), never folded into the name itself. The knob/LFO target lists read
  `Synth: Noisemaker` for months, which made them read as something other than
  "pick the module" — but the prefix was silently doing disambiguation work,
  because the same module can be loaded in two FX slots. Count the names; qualify
  the duplicates; leave the rest alone.


- **Menu list** — `drawMenuList` (`src/shared/menu_layout.mjs`). Host font, `LIST_TOP_Y = 15`,
  `LIST_LINE_HEIGHT = 9`, labels at `LIST_LABEL_X = 4`, values right-aligned from
  `LIST_VALUE_X = 92`. Selected row is inverse video with a `"> "` prefix (unselected: two
  spaces). Edit mode wraps the value in `[brackets]` and shifts it left to compensate. Long
  selected labels marquee. Scroll arrows top/bottom.
- **Picker overlay** — `drawKitEnumOverlay` → `drawKitListOverlay`. Inverse-video selection,
  right-edge scrollbar track + thumb when the list overflows. The same component serves named
  enums *and* short numeric ranges: a `count`/`oct` cell synthesizes an option list so browsing
  feels identical.
  ⚠ **It is no longer a fixed 64×48 box** (changed 2026-08-25/27): the box **auto-sizes its width
  to its longest label** and only ever GROWS from the zoom footprint, so a short enum still shares
  its outline with the value zoom while `SOUND + CONFIG` is not cut to `SOUND +`. `maxW` caps it,
  `tall` grows it downward for the selection overlays. Rows are the **stock** font by default;
  `hdrFont` is the BANK picker alone, which previews bank names and so must match the header font
  it is about to land on.
  ⚠ **5 rows is the ceiling** for a tall box and the gain is all at the bottom: a 6th needs a top
  edge at y ≤ 6, inside the header band.
- **Section picker** — `drawKitSectionPicker`, full-screen, one row per section, same selection
  and scrollbar grammar.
- **Scrollbar** — right-edge rail + a solid 2px thumb, **no arrows**. The rail is the extent of the
  list and the thumb is where you are in it; an arrow says "there is more" a second time and reflows
  the row it sits on as it appears and disappears. 🟠 A **dotted** rail (`drawKitList` opt
  `dottedRail`) is mocked and **off by default**: drawing both rail and thumb solid makes the thumb
  a thicker piece of the same object, so the eye has to measure widths to read a position — but
  flipping the default changes every list in the app at once, so it waits on a look at the render.
  ⚠ A list that fits draws no rail at all; the flag is inert there.
- **Dialogs** — buttons are **No left, Yes right**; selected is filled with black label,
  unselected is outlined with white label; `Back` = No, `Jog` = Yes.
- **Text entry** — the kit does not draw a keyboard and neither should we. Open the host's
  (`src/shared/text_entry.mjs`).

✅ **One dialog implementation (P7).** The normative button primitive lives in
`src/shared/menu_layout.mjs` (`drawDialogButton` / `drawDialogYesNoRow` / `drawDialogOkButton`);
`ui_dialogs.mjs` delegates to it, `drawConfirmModal` renders the side-by-side row, and the
message/confirm overlays use the shared button. New dialogs route through these — never hand-draw
a button.

- **Shared movy list** — `drawKitList` (`ui_movy.mjs`, P7). The one full-screen list body for
  movy-chassis screens: label font, one row height (10px default), windowed scroll with the
  right-edge scrollbar, inverse-video selection, optional right-aligned value / `>` chevron /
  header-font rows, and the same `[brackets]` edit grammar as `drawMenuList`. All of sound
  mode's lists and the knob/LFO editors render through it — and, since 2026-08-15, Global
  settings, the project screens, the snapshot picker and the clear-automation menu.
  Row kinds beyond a plain label:
  | key | draws |
  |---|---|
  | `hdr: true` | the row in the HEADER font (see §5.0) |
  | `value` | right-aligned, always the label font |
  | `qual: '…'` | a small qualifier drawn just AFTER the label, in the movy font, subtracted from the label's own width. For a disambiguator that belongs to the NAME rather than to the right-hand column — a module row is `NAME  fx1  >`, so the right edge is already spent on the chevron. ⚠ Use it only where the qualifier carries information (see §5.0's *qualify on collision only*) |
  | `chevron: true` | a `>` in the value position — a door |
  | `editing: true` | wraps the value in `[brackets]`. ⚠ Only if the caller is not already bracketing it: `formatItemValue` does, and both together render `[[MINOR]]` |
  | `divider: true` | a rule on its own row. ⚠ Costs a whole row — worth it on a ~15-row screen, not on a 3-row one |
  | `note: '…'` | a **centred, non-selectable status line** at full row height. 1-bit has no dim, so "information, not a control" is said by centring and by the cursor stepping over it (§6). Full height because these REPLACE an action row and a shorter one would reflow the menu under the user's thumb |
  ⚠ `sel < 0` means **nothing on this screen is selectable** — a prompt whose only
  inputs are a pad or Back. Without it the clamp highlights row 0, which reads as
  a selection on a screen that has none.
  ⚠ Callers must make `divider` and `note` rows unselectable themselves; the list
  draws them but does not own the cursor.

## 6. Selection, focus, editing, disabled

| State | Rendering |
|---|---|
| Selected (list / overlay row) | Inverse video: `fill_rect(…,1)` + text in `0` |
| Selected (list, additionally) | `"> "` prefix; unselected rows get `"  "` |
| Touched (grid cell) | Label strip inverts **and** swaps name → value; header shows full name |
| Editing (list row) | Value wrapped in `[brackets]` |
| Selected (dialog button) | Filled box, black label; unselected = outlined box, white label |
| **Disabled** | **No visual state.** 1-bit has no dim. Render the *value* as `-` (`fmtNA()`) |

That last row is normative and worth stating plainly: on this display "greyed out" is not
available, so unavailability is communicated in the value, not the styling.

## 7. LED grammar

Track identity is the organizing axis; everything else is a modifier on it.

```js
TRACK_COLORS     = [Red, Blue, BrightGreen, Green, BrightPink, RoyalBlue, Mustard, DeepGreen]
TRACK_DIM_COLORS = [66,  DarkBlue, DarkOlive, 86,   DeepWine,   96,        70,      86]
LED_OFF = 0            LED_STEP_ACTIVE = 36        LED_STEP_CURSOR = 127
CC_SCRATCH_PALETTE_BASE = 51   /* 51-58: per-knob value brightness */
OOB_SCRATCH_PALETTE     = 50   /* 50% white — out-of-bounds steps  */
BEAT_MARKER_PALETTE     = 49   /* 10% white — beat markers         */
CC_GRADIENT_BASE        = 59   /* 59-61, 3 levels                  */
CC_GRADIENT_SCALARS     = [0.30, 0.60, 1.0]
```

| Meaning | Colour |
|---|---|
| Track identity, active | `TRACK_COLORS[t]` |
| Track identity, idle | `TRACK_DIM_COLORS[t]` |
| Playhead on a step | `TRACK_COLORS[t]` solid |
| Queued / will-relaunch / pending stop | Blink `TRACK_COLORS[t]` ↔ `TRACK_DIM_COLORS[t]` |
| Selected / sounding / active thing | `White` |
| Muted | `DarkGrey`, no flash |
| Armed for record | `Red`, or red-intensity scratch `(v,0,0)` |
| Playing with a live CC value | Green-intensity scratch `(0,v,0)` |
| **Copy source** | Blink `White` ↔ `LED_OFF`, 24-tick — identical for steps, drum lanes, clips |

⚠ **Only three white brightness levels are usable** (`CC_GRADIENT_SCALARS` = 0.30 / 0.60 / 1.0).
The LEDs cannot resolve a finer ramp; a smooth gradient will read as noise.

### 7.1 Knob indicator rings (CC 71–78)

`ui_knob_leds.mjs` — pure, no state, no sends; `ui_leds.mjs` keeps the caching and the writes. On a
param bank the rings ride the VALUE:

| | |
|---|---|
| Knobs 1–4 | white ramp — `DarkGrey2 · DarkGrey3 · LightGrey · OffWhite · White` |
| Knobs 5–8 | amber ramp — `DarkBrown · BurntSienna · Tan · BrightOrange` |
| Unbound / unread | **colour 0**, and nothing else |

- **The grid draws 8 params as two rows of four; the hardware is one row of eight.** Nothing on the
  device says which encoder drives which drawn cell — the hue does.
- ⚠ **The floor is not zero.** A bound knob stays lit however low its value, because the row identity
  has to survive a parameter sitting at its minimum. Colour 0 is RESERVED for "nothing is bound
  here": a dark ring is a ring that will do nothing if you turn it, and lighting an unread key at
  the bottom of its ramp is a confident lie about where the value sits.
- ⚠⚠ **The ramps are ordered by LUMINANCE, which is not the same as by name.** Upstream's first cut
  picked amber constants by what they were called and got `#250E05 → #876700 → #491804 → #C93C00` —
  the third step is DARKER than the second, so a sweep went dim, bright, dark, bright. Reported from
  the device as "the LEDs work but the curve is off". A ramp is ONE hue's dark → dim → full; verify
  a change against the hex in `constants.mjs`, never against the name.
- ⚠ **The step thresholds are derived from the ramp, not written beside it.** Hard-coded thirds
  against a 3-entry ramp silently left the last entries of a longer one unreachable.
- ⚠ **CC 71–78 and nothing else.** The same CC carries encoder rotation IN and the ring colour OUT.
  Notes 0–9 are the capacitive touch sensors, input only.
- There is **no "restore on leaving the bank"** to write: the LED pass recomputes all eight rings
  every frame from whatever bank is active, so leaving a param bank repaints them by construction.
  The shim-side `shadow_restore_knob_leds` edge is for the other direction — handing the surface
  back to Move — and davebox owns the surface for its whole lifetime.

*(This replaced a binary white-if-changed-from-default rule, which lit a freshly-opened bank at zero
knobs and could never say where anything sat.)*

Batch LED writes: `LEDS_PER_FRAME = 8`. The output buffer holds ~64 packets and more than ~60 in
one frame overflows.

## 8. Input grammar

CC 3 jog click · CC 14 jog turn · CC 49 shift · CC 50 menu · CC 51 back · CC 71–78 knobs ·
notes 0–9 knob capacitive touch · pads notes 68–99.

**Touch orients, turn reveals, release commits.** A bare orienting touch must NOT open the picker
overlay — only an actual turn does. This is the canonical grammar for every knob-driven overlay.

🟠 **The PEEK is the offered variant, and it is off.** Upstream's knob grid raises an enum's option
list on the turn and decays it after `MV_ENUM_PEEK_MS` (700ms) because it has no touch sensor to
release. davebox does, so its list already stays up exactly as long as the finger does, and adopting
the decay would *remove* a display that works — what it buys instead is uncovering the three
neighbouring cells while you keep turning. `enumPeekExpired(turnedAtMs, nowMs)` is pure (the timer
lives in the caller, this file reads no clock) and `drawKitBankPage`'s `peekExpired` consumes it;
no davebox caller passes either. ⚠ A never-turned knob has NOT expired — `Number(null)` is 0, which
against any real clock is long past, and a caller that had not yet recorded a turn would suppress
the list for ever.

**Three response classes**, by how much travel a change should cost (values identical to
canvaskit's, defined in `davebox/ui/ui_discover.mjs`):

| Class | Kinds | Detents/step |
|---|---|---|
| Continuous | `uni` `bip` `fader` | 2 |
| Pick | `enumc` (>2 opts), `len`, `dir`, `oct`, `count` | 6 |
| Deliberate | `tog`, `enumc` (2 opts), `action` | 12 |

Rule of thumb for a new cell: **≤16 discrete values is pick, not continuous.**

**Discrete kinds clamp, never wrap** (`clampValue`). Wrapping turns an overshoot into a jump
across the entire range, which feels like a malfunction.

### Traps

- ⚠ **Every button delivers two edges** — down (`d2 === 127`) then up (`d2 === 0`). A hold gesture
  needs the up edge to know it ended. Handle Back centrally, before any press-based catch-all, or
  it double-fires (cancel on press *and* tap on release).
- ⚠ **The host steals jog-click (CC 3) and Back (CC 51)** to close a canvas. Opt out via
  `CONFIG.claims.jogClick` when drill-down navigation is needed.
- ⚠ **Undo (56) / Copy (60) / Delete (119) must be claimed** (`claims.editCcs`). Forgetting the
  declaration is the worst failure available: the gesture silently does nothing *and* the button
  still reaches Move, so a Copy or Delete acts on the user's real set behind the screen. Nothing
  errors, on device or at build time.
- ⚠ **Shift is CC 49, but is not forwarded in chain-edit** — poll `shadow_get_shift_held()`; CC 49
  remains the off-device fallback.
- ⚠ **Never derive a pad index from `note - 68`.** Pad rows run bottom-to-top:
  68–75 · 76–83 · 84–91 · 92–99.

## 9. Where the code stands

Honest status, so nobody mistakes the spec for the state of the tree.

| Surface | Shape |
|---|---|
| `ui_movy.mjs` + `ui_cells.mjs` | ✅ The reference. Pure, centralized, previewable off-device |
| `src/shared/menu_layout*.mjs` | ✅ Centralized; owns the one dialog-button family (P7) |
| `ui_dialogs.mjs` | ✅ Delegates buttons to `menu_layout`; every LIST on the kit since 2026-08-15 (Global settings, project screens, snapshot picker, clear-automation). Confirms and info screens stay on the dialog chassis by §5.0 |
| `ui_render.mjs` | ✅ Grid/header chrome all movy-composed; the remaining direct drawing is the signature sequencer visuals (session overview, track rows, position bars, perf mode) — deliberately bespoke, ruled out of the polish pass |
| `ui_sound.mjs` | ✅ All lists on `drawKitList`; confirms on the shared button row (P7) |
| `ui_knob_leds.mjs` | ✅ The knob-ring rule, pure and testable — §7.1. First slice off the 🟡 below |
| `ui_leds.mjs` / `ui_scene.mjs` | 🟡 Direct LED writes; the knob rings now delegate, the rest is still shared constants and no shared helpers |

**Two font systems are in simultaneous use** — the movy fonts and the host's built-in `print()` —
because the movy grid and the dialog body are genuinely different jobs. That is tolerable and now
visually reconciled: both share the filled-bar header and the dialog buttons, and §5.0 says which
one a new screen takes. ⭑ The mcufont 5×5 is no longer used for any header; Global settings was
its last such caller and moved to `drawKitHeader` on 2026-08-15.

**Upstream param-pages parity (2026-08-29, PIXELS ON / BEHAVIOUR OFF):** the modulation dot, the
label `~`, the ghost fill, the EQ curve, the sample track, the knob-ring ramp and the enum-peek
timer are ported (§3.1, §3.2, §5, §7.1, §8); the switch pill, the fader column and the dotted
scrollbar rail are 🟠 mocked and unadopted. **No knob feel, no gesture latch and no input path was
touched** — `ui_discover.mjs` is untouched and every new look is opt-in through a descriptor field
or a viz flag, so every existing screen renders pixel-identical. `tools/render_widgets.mjs` renders
a before/after pair for each. Not ported: upstream's header/footer identity, its big-number face
(font licence unverified — davebox keeps its 13pt), its page planner and its viz DETECTOR.

**Canvaskit parity (P7):** `drawVBar` (a `fader` cell renders as the vertical bar, no longer
falling through to `arc`), `hudCard`, and live waveform rendering (`shapeSample`, `drawWaveBox`,
`drawLfoWave` — the LFO editor's preview strip) are all ported. The ADSR span widgets were
already present.

## Related

`docs/API.md` (display and LED calls) · `docs/MODULES.md` (`ui_hierarchy`, canvas contract) ·
`davebox/docs/reference/LED_COLOR_REFERENCE.md` (the full per-screen LED tables) ·
`schwung-canvaskit/README.md` (the kit this language descends from).
