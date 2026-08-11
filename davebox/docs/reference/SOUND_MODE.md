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
number = track number** with no setting anywhere.

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
  they are the only slot-ish settings a Move bus has: receive/forward channel,
  transpose and MPE are chain concepts and are omitted. **Mute/solo are absent**
  — the strip does not participate in either yet (open Stage 1a remainder), and a
  row that reads nothing is worse than no row.
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

Below the blocks (track context only) sit two rows (P5):

- **[SLOT SETTINGS]** — the slot's own params (volume, sends, routing), the
  derived **MPE** toggle (atomic recv=All + fwd=Thru + `synth:mpe_enabled`
  with restore-on-off), and the **Knobs… / LFO 1… / LFO 2…** rows that open
  the host editors as overlay services on top of sound mode.
- **[SLOT PRESETS]** (last row) — whole-chain patches over the host's global
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

`schSlotForTrack(t)` — a direct read of the track's addressed slot
(`S.trackSlot[t]`, DSP `tN_slot`; P5 slot-addressed dispatch). The old
receive-channel matching — its "All"-channel layering and its "no matching
slot" failure mode — is gone; every Schwung-routed track always resolves.
The slot is set per track in the track menu (Slot A–D) or the remote UI's
track gear.

## Knob feel

Sound mode uses **canvaskit's three sensitivity classes** (continuous 2 /
pick 6 / deliberate 12), NOT davebox's run-length acceleration. That is what
makes an unknown synth feel calibrated — verified on device during phase 1.

Two different knob behaviours in one view, chosen by mode. Deliberate, not
accidental.

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
