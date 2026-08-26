# Sound mode — spec

Editing a track's sound from inside davebox's track view: instruments, effects,
and their parameters, using the canvaskit UI. Phase 2 of the module-hosting work
(phase 1 = the `davebox-lab` rig, see [MODULE_HOSTING.md](MODULE_HOSTING.md)).

Status: **built and shipping** (`ui/ui_sound.mjs`), including the session FX
buses and, since P8a 1b, the Move flavour. The "specced, not built" banner this
line replaced had been stale for months. Decisions below are settled unless
marked open.

## The gesture

**Shift + Note/Session** in track view = "edit this track's sound". Where it
goes depends on the track's route:

| Track route | Destination |
|---|---|
| Schwung (`trackRoute[t] === 0`) | sound mode — block picker, then bank pages |
| Move (`=== 1`) | sound mode, **Move flavour** — the track's Move instrument bus |
| Ext | nothing to edit; the `NO SOUND TO EDIT` popup |

One gesture, one meaning, one destination — sound mode — with the **route
picking the flavour** (P8a 1b). Move's own editor is one jog-click further in
(the SYNTH row) and stays directly reachable as `Edit Synth…` in the track menu.

⭑ **Titles across the whole tree are `(n) NAME`** since 2026-08-15 — the round-
bracket track marker the top level uses, then the screen. The previous
`TRACK n - NAME` measured 160px against `drawKitHeader`'s real 124px limit and
had been clipping on the device ("TRACK 5 - SOUND C"). See `UI_LANGUAGE.md`
§5.0 for which chassis a screen takes and §2 for why the brackets are round.

⭑ Until 1b, the Move route jumped straight into `enterMoveNativeCoRun(t)`, and it
did so on the Shift **release** — co-run makes the shim forward Shift to Move
firmware, so a still-held Shift leaked. Sound mode forwards nothing, so both
routes now fire on the press and that deferral is gone.

### The Move flavour

A track routed to Move plays one of Move's own instruments, and 1a made that
instrument's audio come back through the matching **Move FX bus** unconditionally
— so the track has a sound to edit; it just isn't a Schwung chain. Sound mode
renders it with the same bus machinery the session FX use (`S.bus`, kind
`move`), addressed by the `move_fx:<1-based bus>:` key namespace, where **bus
number = the track's Move INSTRUMENT** — its channel, which is what the `Instr`
row (`Move 1`-`Move 4`) sets.
⚠ It is NOT the track index. 1a made it so while a track's Move instrument was
an unsurfaced channel setting; `TRACK_OWNS_ITS_INSTRUMENT.md` surfaced it, so
track 6 can play `Move 2` and must then edit BUS 2. Reading the track index here
opened a different instrument's inserts with no error anywhere — pinned now by
`tests/test_move_bus_flavour.sh`.

```
SYNTH (MOVE N)  →  FX 1  →  FX 2  →  FX 3  →  FX 4  →  Volume / Send A / Send B
```

- **SYNTH** is not a module row — Move owns that voice, so there is nothing to
  browse. Jog-click hands over to Move's editor (co-run). Sound mode raises a
  request flag the tick consumes; importing `ui_corun` from `ui_sound` would
  close an import cycle.
  **Menu brings you back here** (P8a 1d): the entry origin is recorded at entry
  (`S.moveCoRunOrigin`) because sound mode is exited on the way in, so nothing on
  the return path could infer it. Entering instead from the track menu's
  `Edit Synth…` records a `track` origin and closing lands on track view, which
  is where it came from.
  ⚠ **Back cannot be the exit — Move owns it**, because it needs Back to walk its
  own menus, and the peer UI's depth is not observable from the framework (the
  host says as much in `docs/CORUN.md`: for `CORUN_TARGET_MOVE_NATIVE` the tool
  owns its exit gesture, "typically Menu"). Step 3 remains the second exit and
  lands on track view — it is a step-grid affordance, not a return.
  Menu **blinks** during co-run so it reads as the way out; it used to be held
  dark, from when it did nothing.
- **FX 1–4** are the bus's four inserts. ⚠ A bus insert's `:module` takes a **DSP
  path**; a chain component's takes a **module id**. Loading a bus by id answers
  error 7 and the row stays empty.
- **Volume / Send A / Send B** are the host's real strip levels
  (`shadow_move_fx_strip[]`) — volume is a 0..4 gain, the sends are 0..1. They
  sit in the block list rather than behind a `[SLOT SETTINGS]` screen because
  they are the only slot-ish settings a Move bus has: transpose is a chain
  concept and is omitted (receive/forward channel and MPE were chain concepts
  too, and no longer exist anywhere — see the slot-settings note below).
- **Muted / Soloed** are the bus's own, and are toggle rows: jog-click flips
  them, because a 0/1 value has nothing to scrub. Two rules, and they differ on
  purpose:
  - **Mute is per-family.** A bus and the chain slot at the same index are
    alternative occupants of one mixer position, never a shared signal path, so
    muting the slot leaves the bus sounding and vice versa.
  - **Solo is one group across both.** Soloing a bus silences every chain slot
    and every other bus, and a chain slot's solo silences the buses — a solo
    that left half the mixer playing would not be a solo. Only one thing is
    ever soloed, whichever family it is in.
  Both are **per project**, saved in the set's `move_fx_meta.json` beside the
  levels and flushed on the same cadence (project switch, session exit, overtake
  entry) — a mute is not written to disk the instant you set it.
- The master **volume knob is CLAIMED**, as it is for a chain, and moves the bus
  strip's Volume — in sound mode plain Volume always means "the level of the
  thing on this screen". ⚠ Releasing it instead (the first cut) was wrong twice:
  Move took the knob back and covered the screen with its native master overlay,
  AND sound mode still consumed the CC, writing the turn into chain slot 0's
  module level — a different track's sound. **Releasing the host claim is not the
  same as declining to consume the CC**; they are two independent gates, and the
  CC 79 branch bails on `soundIsGlobal()`, which excludes Move buses.
- Back leaves sound mode outright — a Move bus's one door is the track it belongs
  to, not the session FX list.

Switching the active track **follows across flavours**: Schwung ⇄ Move retargets,
only an Ext-routed track closes the screen.

**This retires co-run entry on Shift+Step3.** Two doors to the same room is
harder to hold in your head than one.

**The global menu is unaffected** — it already lives on Shift+Step2
(`_doShiftStepCommon`, idx 1). The *duplicate* opener on Shift+Note/Session
(`ui_input_cc.mjs`, inside the `MoveNoteSession` block) is what gets removed to
free the gesture. Nothing moves, nothing is relearned.

> **Superseded in part, 2026-08-26.** Shift+Note/Session opens again — but not as
> the duplicate door this retired. It is now a TOGGLE: it still closes whatever is
> open (which is what made it the one-press way out from any depth, and that comes
> first), and when nothing is open it goes one level PAST this screen, straight
> into the focused track's GENERATOR editor. The bank walk remains the only way to
> the screen itself, so the "two doors to the same room" rule above still holds —
> what changed is that there is now a shortcut to a leaf. The destination follows
> the track's route: Schwung → generator editor, Move → co-run, MIDI → declines
> and says why.

That button already carries LED state (`ui_tick.mjs`), so it can indicate
sound mode without using the screen.

## Structure

Entering sound mode opens a **block picker** for the track's slot — the chain,
not just the synth:

```
MIDI FX  →  SYNTH  →  FX 1  →  FX 2  →  FX 3  →  FX 4
```

Pick a block, edit its banks. Back steps out: block editor → block picker →
clip mode. No dead ends.

An **empty block is the add-an-effect flow**: selecting it opens the module
browser so you can load a reverb into FX 2. This is how effects get added at
all, so it is not optional polish.

Below the blocks (track context only) sit **three** door rows. ⚠ This section
described **two** — `[SLOT SETTINGS]` and `[SLOT PRESETS]` — until 2026-08-15;
that had been stale since the 08-13 dissolution and the P7 absorb, in five
separate ways. Corrected against the tree:

- **Sound Control** — `Knobs`, `LFO 1`, `LFO 2`. ⚠ These are **davebox's OWN
  editors**, absorbed in P7; they were host overlay services in P5 and this
  section went on saying so. ⚠ And the slot's **levels are NOT here** — Volume,
  Send A/B, Mute and Solo sit inline on the track's own screen since 08-13,
  built from the same row kind a Move FX bus uses.
  ⚠ **Routing is not here either.** `Recv Ch`, `Fwd Ch` and the derived **MPE**
  toggle were deleted with `TRACK_OWNS_ITS_INSTRUMENT.md` — where a track's
  notes go is answered by its Instrument selector, and davebox dispatches by
  addressed slot rather than by channel match, so those rows never affected
  anything it did.
- **Config** — `Mode`, `Layout`, `Transpose`, `Vel In`, `Looper`: the track's
  own settings, as opposed to its sound's.
- **Slot Presets** (last row) — whole-chain patches over the host's global
  `patches/` store, through the `host_patch_*` API (see host `docs/API.md`)
  so the serializer and index space stay the host's own. `[Save]`
  overwrites the slot's current patch (confirmed), `[Save as…]` names via
  the shared keyboard, click loads, Shift+click deletes (confirmed —
  deleting the file never silences the live chain). "Presets" in the UI,
  patches in the store — same files the host chain editor sees.

⚠ This fork runs **4** audio-FX blocks where upstream has 2. Any block logic
must cover fx3/fx4 — the fork has known sites that only handle fx1/fx2.

## Navigation

- **Jog** walks banks. **Shift** raises the section picker for coarse jumps.
- **Pads are NOT used for bank select.** They stay with the sequencer, so you
  can keep playing and step-editing while dialling the sound. This is better
  than clip mode's current behaviour and is deliberate.

## Slot resolution

`schSlotForTrack(t)` returns **`slotIndex(t)`** — a track owns its instrument,
so the chain it plays IS its own index. There is nothing to resolve, nothing
stored that could disagree, and no way to express an ambiguous assignment.
`slotIndex` survives only as a BOUND (it clamps if a build's slot count is ever
below its track count), never as a resolution step.

History, because both retired mechanisms left traces in older comments:
- **Receive-channel matching** — its "All"-channel layering and its "no matching
  slot" failure mode — died with P5's slot-addressed dispatch.
- **`tN_slot` / `S.trackSlot`** — a per-track CHOICE, set in the track menu as
  `Slot A–D` — was retired on 2026-08-11 with `552a11d9`
  (`docs/working/TRACK_OWNS_ITS_INSTRUMENT.md`). It is no longer settable,
  persisted, or mirrored in JS. A stored `t%d_sl` in an old project is ignored,
  which IS that spec's migration.

## Knob feel

Sound mode uses **canvaskit's three sensitivity classes** (continuous 2 /
pick 6 / deliberate 12), NOT davebox's run-length acceleration. That is what
makes an unknown synth feel calibrated — verified on device during phase 1.

Two different knob behaviours in one view, chosen by mode. Deliberate, not
accidental.

### Outside a block editor the knobs are the SLOT's assignments — and say so

On every non-EDIT screen the eight knobs forward to the chain DSP as relative
CCs, driving whatever `knob_N_target`/`knob_N_param` says (`soundOnCC`, the
CC 71-78 branch). Until 2026-08-14 nothing on screen named that mapping.

- **Touch** raises a `hudCard` naming the block and the param's display name, on
  two lines, or `UNASSIGNED`. **Turn** adds the value in the card header.
  Lifetime is `S.touchedIdx` — the physical touch plus tick's existing decay,
  never a second timer. ⭑ The value is *seeded* on touch (the step law needs a
  base to add to) but stays hidden until the knob MOVES — touch orients, turn
  reveals.
- **Shift + touch** opens that knob's assign flow directly (`openKnobEditor`
  then `S.knobIdx` then `openKnobTargets` — in that order; the editor resets the
  cursor). It runs the full eight-knob read first so committing lands on a KNOBS
  list with no unread rows rendering as `(None)`.

⚠⚠ **The card's gate is the SAME predicate as the turn-forwarding branch** —
non-EDIT view, `!S.bus && S.slot >= 0`, minus the assign screens themselves.
A bus forwards no knob, so there is nothing there to name; if the two ever
disagree the card describes a control the knob is not driving.

#### The turn law is movy's, applied in JS on an absolute value

These knobs used to forward to the chain DSP as **relative CCs** and let
`chain_midi.c` decide. That cost both resolution and feel, three ways:

1. **The hardware delta magnitude was dropped.** The shadow framework hands
   davebox an *accumulated* detent count; one tick per event went out
   regardless, so a fast turn moved LESS than a slow one.
2. **Sending N ticks instead is worse.** The DSP accelerates on the elapsed time
   *between* events, and N events in one batch are stamped together — every one
   at maximum acceleration.
3. **Its base step is the param's declared step**, so a param declaring 0.5 over
   0..1 has two positions.

So the value is owned here and written absolutely, under **range
normalisation**: the per-detent step is a fraction of the param's own range.

⭑ movy's `MIN_STEP_RANGE_FRAC` (1% of range) and canvaskit's *255 positions
across the range, N detents each* are the **same law at different
resolutions** — worth stating plainly, because carrying both vocabularies is
what let two knob feels onto one device. `KNOB_TRAVEL` expresses it in
canvaskit's terms, which the block editor and the session mixer already use.

**Travel is a PER-TYPE dial** (Josh, 2026-08-14: *"knob travel end to end is too
fast"* — the first cut was movy's UNSCALED 100 detents; movy's own knobs are 200,
its `ARC_DELTA_SCALE` having gone unported). `positions` = values a full sweep
crosses; `sens` = detents per position; sweep = the product.

| type | positions | sens | sweep | note |
|---|---|---|---|---|
| float | 255 | 2 | **510 detents** | the session mixer's exact feel |
| int | 255 | 2 | varies | declared step is a **FLOOR** (1..8 → 14 detents) |
| enum | options | 4 | options x 4 | exempt from normalisation |

Direction reversal **resets** the accumulator rather than unwinding it.

⚠ The detents→steps conversion happens in the **tick, not the MIDI handler**:
only the tick knows the cell and therefore the sens, so converting at the
handler applies sens 1 to every detent arriving before the metadata lands — the
first flick of a turn, silently at the wrong law. The handler accumulates raw
detents and owns the reversal reset (that one is about the physical gesture).

⚠ The DSP's `knob_mappings[].current_value` accumulator is consequently unused.
Nothing reads it under SA (`knob_N_value` has no caller in this tree) and it is
re-seeded from the live plugin on every state restore — a path whose comment
already anticipates this. **If a relative-CC writer for these knobs ever comes
back, the two accumulators will disagree and the knob will jump.**

⚠ **Every read is a ~2.9 ms round trip**, so they run one per tick in dependency
order: the assignment (cached per knob per slot in `S.knobAsn`, `null` = unread
and distinct from read-and-unassigned), the target's `chain_params` (cached per
slot in `S.knobMeta`), then the value. All dropped wholesale on a retarget.
**A sweep costs ZERO reads** — the value is owned, so it is arithmetic, and the
writes coalesce to one per tick. ⚠⚠ Only a TOUCH re-seeds the value; a turn must
not, or a mid-sweep read overwrites the optimistic value with one lagging the
queued write and the knob stutters backwards under the hand.

Pinned by `tests/js/test_sound_knob_hud.mjs` (20 assertions, each
mutation-verified).

## State

- `S.trackSoundMode[t]` — per track, alongside `trackActiveBank[t]`.
- **Bank memory must be per-mode.** Clip banks are 0-7; sound banks can reach 49
  (minijv). Sharing one field lands you on a nonsense page when you switch.
- Persist in the UI sidecar as a **new key with a default** — a migration, not a
  state-version bump. Bumping the version shows users a data-loss dialog.

## Timing — the constraint that bites

`shadow_get_param` / `shadow_set_param` are **synchronous SHM round-trips**. The
lab rig calls them straight from its MIDI handler because it has no timing
obligations. **davebox is a sequencer and must not.**

- **Knob edits deferred to `tick()`** — the `pendingRepeatLane` pattern.
- **Polling budgeted**: on bank change and on touch, then idle slowly. Do not
  copy the rig's fixed cadence; davebox's tick is already busy.

Get this wrong and the symptom is sequencer jitter, not a visibly broken editor
— which makes it expensive to trace.

## Volume

**Shift + Volume** sets the track's slot level. Plain Volume stays Move master.

Needs **two host changes** (generalizable, → `upstream-pr/davebox-hosting`):

1. **Conditional master-knob claim.** The shim unconditionally passes CC 79 to
   Move during overtake (`schwung_shim.c`, `CC_MASTER_KNOB`, `filter = 0`) so the
   volume overlay works. It has no idea Shift is held, so without this Move
   would *also* apply the turn and both levels move.
2. **Persist `slot:volume`.** The 07-24 investigation found the set updates
   runtime state and the UI but never calls `shadow_save_state()`. Re-verify
   when implementing.

Note an existing second writer: holding a physical Track button and turning
Volume makes the host mirror Move's track gain into the same-index slot. One-way
and only while held, but it writes the same value — make sure they don't fight.

## Out of scope

- **Move-routed tracks**, beyond the co-run gesture above. Those instruments are
  outside host control; there is nothing to edit.
- Bank icons (no inferable source — see the canvaskit audit).
- Per-module override files. Deferred; movy's `loader.ts` is the pattern when we
  return to it.

## Open

- Nothing blocking. Ready to build.
