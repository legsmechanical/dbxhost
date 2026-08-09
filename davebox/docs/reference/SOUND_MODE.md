# Sound mode — spec

Editing a track's sound from inside davebox's track view: instruments, effects,
and their parameters, using the canvaskit UI. Phase 2 of the module-hosting work
(phase 1 = the `davebox-lab` rig, see [MODULE_HOSTING.md](MODULE_HOSTING.md)).

Status: **specced, not built.** Decisions below are settled unless marked open.

## The gesture

**Shift + Note/Session** in track view = "edit this track's sound". Where it
goes depends on the track's route:

| Track route | Destination |
|---|---|
| Schwung (`trackRoute[t] === 0`) | sound mode — block picker, then bank pages |
| Move | `enterMoveNativeCoRun(t)` — Move's own editor, already implemented |

One gesture, one meaning, two destinations. Both co-run entry points already
exist (`enterSchwungCoRun` / `enterMoveNativeCoRun`); only sound mode is new.

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
