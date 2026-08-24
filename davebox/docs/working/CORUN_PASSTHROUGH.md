# Co-run pass-through — sequencing stays live under Move's editor

**Status: SPEC, not built.** Drafted 2026-08-24 from Josh's nice-to-have
(2026-08-23): *"Allow sequencing UI elements through in Move co-run just like
Schwung tracks. Hold only what co-run needs to navigate Move instrument
params."* Decisions marked ⚖ need Josh's ruling before code.

## Why this is small

The ownership machinery already exists and already does most of this. Co-run
is a keep-mask over twelve control groups (`../CORUN.md`,
`shadow_constants.h`), davebox declares its split in ONE place
(`ui/ui_corun.mjs` — `DAVEBOX_CORUN_KEEP_MASK`), and the host derives the
routing, LED split and teardown from it. Today's move-native mask already
KEEPS `PADS | STEPS | TRANSPORT | MENU` — pads play, steps edit, Play/Rec
run, Menu exits. The gap between today and the ask is which of the *ceded*
groups actually earn their cede.

## The principle

Move's editor needs exactly what it takes to **see and turn Move's own
parameters**: the screen, the eight knobs, the jog, its page navigation, and
its track selector. Everything else is sequencing surface and belongs to
davebox — the same pass-through contract sound mode already lives by
("the sequencer stays operable underneath").

## Per-group ruling

| Group | Today | Spec | Why |
|---|---|---|---|
| OLED | cede | **cede** | The whole point of co-run — Move's editor pages. |
| KNOBS (71-78) + TOUCH | cede | **cede** | Move's macro knobs edit the instrument. |
| JOG (14/3) + MAIN TOUCH | cede | **cede** | Move's param/preset navigation. |
| TRACK (40-43) | cede (input) | **cede** | Switches the Move track being edited. LED split stays: davebox paints the paired-track indicator, presses cede. |
| BACK | cede (routing grp) | **cede** | Move's page-out. Menu remains the canonical exit (existing opt-out bit). |
| MASTER (79) | cede | **cede** — with one carve-out | Plain volume is Move-native everywhere anyway. ⚖ Shift+Volume (track volume, 2026-08-24) inside co-run: to honour "all modes" it needs SHIFT kept *and* CC 79 intercepted while Shift is down. Ship without it first; add if the SHIFT ruling below lands on "keep". |
| PADS | keep | **keep** (unchanged) | Melodic pads already play the sequencer. Drum: see the padmap note below. |
| STEPS | keep | **keep** (unchanged) | Step editing under a synth editor is the headline feature. |
| TRANSPORT | keep | **keep** (unchanged) | Play/Rec. |
| MENU | keep | **keep** (unchanged) | The exit. |
| LOOP (58) | cede (not in any kept group) | **keep** ⚖ | It's a sequencing control (perf mode / length gestures). Verify which group carries CC 58 — if TRANSPORT already covers it, nothing to do; if not, it needs a bit. |
| SHIFT (49) | cede | ⚖ **contested — Josh's call** | Move's editor uses Shift for fine knob adjust; davebox uses it for step shortcuts, track switch, and now Shift+Volume. Options: (a) cede (today — Move fine-adjust works, davebox shift gestures dead in co-run); (b) keep (davebox gestures + Shift+Volume work, Move fine-adjust dies); (c) keep + re-inject to Move alongside (both see it; risk: Move reacting to Shift+pad combos it half-sees). Recommendation: **(b)** — fine-adjust is the smaller loss and consistency wins — but this is a feel call. |
| MUTE (88) | cede (deliberate, #8) | ⚖ **contested** | Ceded so Move drum-pad mutes work. Keeping it restores davebox mute gestures. Recommendation: leave ceded — the drum-mute use case was fought for. |
| DELETE / COPY / other modifiers | cede (unclassified) | **keep** ⚖ | Step-clear (Delete+step) and copy gestures are sequencing. Same contest shape as Shift if Move's editor uses them; believed unused there. |

## Known traps to carry into implementation

- **Drum padmap under co-run**: `enterMoveNativeCoRun` re-pushes the padmap
  with left-column lane pads at 0xFF — Move sounds and selects those pads via
  injects, the DSP must not double-hit. Any pass-through change must keep
  that split exactly; it is sound-routing, not input ownership.
- **Modifier release CCs**: today, releases pressed inside Move never reach
  davebox, and `cleanupAfterMoveNativeCoRun` clears held-flags defensively.
  Keeping SHIFT/DELETE/COPY *removes* that blindness for those keys — the
  defensive clear stays for whatever remains ceded.
- **LED arbitration**: every newly-kept group may need a matching
  `led_keep_mask` decision — the TRACK group precedent shows input and LEDs
  can split. Expect Move repaint fights on any group where the LED side is
  left with Move (the reason `skip_led_clear` exists).
- **Popups are invisible**: davebox keeps STEPS but the OLED is Move's, so
  action popups (LOOP DOUBLED, CLIP FULL, TRACK n VOLUME) don't render in
  co-run. Acceptable for v1; note in the manual. (A future option: a brief
  OLED reclaim window for popups — NOT in this spec.)
- **The FX-picker overlay mask** (`DAVEBOX_PICKER_KEEP_MASK`) layers on top;
  re-derive it after any base-mask change so the overlay still owns jog/knobs
  while it is up.

## Implementation shape (one commit, after the ⚖ rulings)

1. Adjust `DAVEBOX_CORUN_KEEP_MASK` (+ LOOP/DELETE/COPY bits as ruled;
   SHIFT per ruling) and `DAVEBOX_CORUN_LED_KEEP_MASK` to match.
2. If SHIFT is kept: route Shift+Volume in co-run (the ui.js gate already
   passes Shift+79 when `shiftHeld` is tracked — verify the tracking sees
   CC 49 during co-run once kept).
3. Verify the shim's group classification covers CC 58 / 119 / 60
   (`shadow_constants.h`) — add bits only if genuinely unclassified.
4. Tests: dispatch-level JS tests (step toggle, Delete+step clear, transport,
   Shift gesture per ruling — all while `S.moveCoRunTrack >= 0`), plus the
   existing co-run smoke on device. Mutations on the mask bits.
5. Manual §co-run: one paragraph — what stays live, what belongs to Move.

## Out of scope

Bidirectional Shift mirroring (option c), popup OLED reclaim, and any change
to the chain-editor (Schwung) co-run flavour — it already behaves.
