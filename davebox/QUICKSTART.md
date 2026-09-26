# dAVEBOx Quick Start

A hands-on walkthrough that takes you from a new project to a looping pattern with
effects, scenes, and a taste of Performance Mode — in about fifteen minutes.

Work through the lessons in order. Each one builds on the last. When you want the
full detail on anything you meet here, the [**dAVEBOx SA Manual**](MANUAL-SA.md) is
the complete reference — this guide links into it as you go.

> **What is dAVEBOx?** An 8-track MIDI sequencer for the Ableton Move, running on
> [Schwung](https://github.com/charlesvestal/schwung). It makes no sound of its own
> — every note it plays is sent to Move's built-in instruments, to Schwung's effect
> chains, or out to an external synth over USB.

*(Running dAVEBOx as an ordinary tool inside official Schwung? That is dAVEBOx
Legacy — see [`MANUAL.md`](MANUAL.md) instead.)*

---

## Before you start: open a project

**There is nothing to set up.** Every dAVEBOx project is created ready to play:
tracks 1–4 play Move's four instruments — a random drum kit, a bass and two
polyphonic sounds, like a new Move set — and tracks 5–8 each have a Schwung chain
of their own. The one thing Move needs is **Link** turned on in its System
Settings; dAVEBOx warns you if it is off.

1. Open Schwung's tool menu (**Shift + Step 13** — the star) and choose
   **dAVEBOx**. The screen goes dark for a few seconds while Move restarts; that
   pause is the startup, and nothing has gone wrong.
2. You land on the **project picker**. dAVEBOx keeps its own projects, separate
   from your Move sets — one pad per project. Nothing is open yet.
3. **Hold Shift and tap an empty pad.** That creates a new project and opens it in
   one press. (Later, to carry on where you left off, just click the jog wheel: the
   project you last had open is already selected.)

You can come back to the picker at any time with **Shift + Step 1**. More in the
manual's [Projects](MANUAL-SA.md#projects--davebox-has-its-own-workspace) section.

---

## A two-minute tour

dAVEBOx has **two views**, and you switch between them with the **Note/Session**
button:

- **Session View** (where you start) — a grid of clips. Each column is a track,
  each row is a *scene*. This is where you launch and arrange clips.
- **Track View** — the detailed editor for one clip at a time: pads play notes,
  the 16 step buttons hold its pattern.

A few things worth knowing before the first lesson:

- **There are no track buttons.** To change the active track, hold **Shift** and
  turn the **jog wheel**, or in Track View hold **Shift** and tap a pad in the
  **bottom row** (pads 1–8 = tracks 1–8).
- **The jog wheel** (the clickable encoder on the left) cycles through *parameter
  banks* in Track View — this is how you reach the effects and clip settings.
- **Note/Session is the way home.** From any menu, bank or picker, one press
  brings you back to the view you were in.
- **Two menus:** **Shift + Step 2** opens **Project Settings** (tempo, key, scale,
  saving and leaving). **Shift + Note/Session** in Track View opens the active
  track's **TRACK CONFIG** menu (its instrument, effects and settings).

That's enough to begin.

---

## Lesson 1 — Your first drum beat

Track 1 of a new project is already a drum track, playing a Move drum kit.

1. Tap **Note/Session** to switch into **Track View**, on track 1.

The pad grid is split. The **left 4×4 pads are drum lanes** — one drum sound
each. The right 4×4 sets the velocity of the hits you place; you can ignore it for
now.

2. Tap a few of the left pads. You'll hear each lane's sound, and the last one you
   tap becomes the *selected* lane.
3. With a lane selected, tap **step buttons 1–16** (the row below the pads) to
   place hits. Try steps 1, 5, 9, and 13 for a steady pulse.
4. Select a different lane pad and place a different rhythm — a snare on 5 and 13,
   a hat on every step.
5. Press **Play**. Your beat loops.

Each lane is its own little sequencer, so you can even give them different
lengths later for polyrhythms. Full detail lives in the manual's
[Drum Clips](MANUAL-SA.md#7-drum-clips) chapter.

---

## Lesson 2 — Add a melodic part

Now let's play some notes on another track.

1. Hold **Shift** and tap the **3rd pad in the bottom row** — you're now on track
   3, one of Move's polyphonic sounds.
2. The pads now play **pitched notes**, snapped to the project's key and scale.
   Tap around to hear them. **+ / −** shifts the octave.
3. To sequence a note, **hold a pad and tap a step button** — that step gets the
   held note.
4. For a chord, **hold two or three pads and tap a step** (up to eight notes per
   step).
5. Press **Play** if it isn't already running. Track 3 plays alongside your drums.

A new project starts in a random key and scale. To change them, open **Project
Settings** (**Shift + Step 2**), choose **Key** or **Scale** and turn the jog — the
pads rearrange, and while playing you *hear* a live preview. Click to commit; if
your clips hold notes, it asks whether to move them too. See
[Key & Scale](MANUAL-SA.md#172-key--scale) in the manual.

---

## Lesson 3 — Shape the sound with effects

Every clip carries its own effects, reached through the parameter banks.

1. Make sure you're on your melodic track (track 3) in Track View.
2. **Turn the jog wheel** to cycle the banks. Watch the screen header and stop on
   **DELAY**.
3. Turn **K3** (*REPTS*) up to **3** — each note now echoes three times.
4. Turn **K5** (*PITFB*) to **+5** — the echoes climb in pitch as they repeat.

These settings belong to *this clip only*. Effects are non-destructive: they
transform playback without changing your written notes, so returning a knob to its
default undoes it cleanly. Explore the other banks (NOTE FX, HARMONY, SEQ ARP) the
same way — turn the jog, turn the knobs. The
[Effects](MANUAL-SA.md#10-effects) chapter covers every one.

---

## Lesson 4 — Launch clips and build a scene

So far you've been editing one clip per track. Each track holds **16 clips**, and
a row of clips across all tracks is a **scene**.

1. Tap **Note/Session** to return to **Session View**. Columns are tracks 1–8; the
   top row of pads is row 1, where the clips you've made so far live.
2. **Hold Shift and tap the empty pad in track 3's column, row 2.** Track 3
   switches to that empty clip (and goes quiet), and it opens in Track View. Make a
   different melodic pattern, then tap **Note/Session** to come back.
3. **Tap track 3's row-1 clip** to launch it again, then its row-2 clip — track 3
   swaps patterns while the drums keep going. Launching one clip only replaces
   what was playing *on that track*.
4. To switch a whole row at once, tap a **scene launcher** (the buttons left of
   the grid, top one = row 1) or a **step button** (step 1 = row 1, step 2 =
   row 2…). Launch row 2: the drums stop, because their row-2 cell is empty.
   Launch row 1 and everything comes back.

Launching a *single* clip changes only its track. Launching a *scene* switches
every track at once — an empty cell in that row silences its track. More in
[Arranging](MANUAL-SA.md#12-arranging) and [Scenes](MANUAL-SA.md#122-scenes).

---

## Lesson 5 — A taste of Performance Mode

Performance Mode grabs a short loop of whatever's playing and lets you mangle it
live with a grid of effects.

1. In **Session View**, with your pattern playing, **tap the Loop button**. The
   pad grid turns into a mod grid and stays that way (tap Loop again to leave; or
   *hold* Loop to use it only while held).
2. The bottom row's pads 1–5 are capture lengths, from 1/32 up to 1/2 bar. **Hold
   one** and the music loops that slice for as long as you hold it; let go and it
   plays on as written.
3. The three rows above are mods: **magenta** = pitch tricks, **yellow** =
   volume/gate, **blue** = wild. **Tap a pad** to switch its mod on (tap again to
   switch it off), then hold a length pad — the mods work on the captured loop.
4. The **step buttons are presets** — tap one of slots 1–8 to recall a
   ready-made combination (try slot 1, "Float"), hold a length pad to hear it, and
   tap the step again to turn it off.

Performance Mode is deep — capture lengths, latching, and 16 preset slots are all
covered in [Performance Mode](MANUAL-SA.md#13-performance-mode).

---

## Lesson 6 — Save your work

dAVEBOx saves as you go — whenever you stop the transport, a moment after your
last edit while stopped, and whenever you leave. There is no save button to press.

- **Shift + Back** saves and leaves dAVEBOx, handing the Move back to official
  Schwung. It asks first — turn the jog to **Yes** and click.
- **Project Settings → Quit** does the same.
- **Project Settings → Suspend session** parks dAVEBOx instead: it keeps playing
  in the background while you use Move.
- A reboot always returns you to official Schwung.

For named backups you can return to, use **Save state** in Project Settings — it
keeps up to 16 timestamped snapshots per project. See
[Snapshots](MANUAL-SA.md#173-snapshots).

---

## Where to go next

You now know enough to make complete patterns. When you're ready for more:

- **Choosing sounds** — give tracks 5–8 a Schwung instrument, add effects, and
  set levels from each track's TRACK CONFIG menu:
  [Sound & Track Config](MANUAL-SA.md#14-sound--track-config).
- **Editing notes precisely** — hold a step and turn the jog right for its note
  settings (length, velocity, nudge, probability, ratchets):
  [Editing notes](MANUAL-SA.md#63-editing-notes).
- **Longer clips and loops** — clips can run up to 256 steps; hold **Loop** in
  Track View to set the loop window: [Clip length & the loop](MANUAL-SA.md#66-clip-length--the-loop).
- **Recording live** — press **Record** to capture pad playing into a clip:
  [Recording](MANUAL-SA.md#64-recording).
- **Automation** — record knob moves that play back with the clip:
  [Automation](MANUAL-SA.md#11-automation).
- **The Conductor** — a track that transposes all the others in real time:
  [The Conductor](MANUAL-SA.md#8-the-conductor).
- **Exporting to Ableton Live** — **Project Settings → Export to Ableton** renders
  the whole project to an `.ablbundle`: [Export to Live](MANUAL-SA.md#163-export-to-live).

And whenever you need a quick reminder of a control, the manual's
[Quick Reference](MANUAL-SA.md#19-quick-reference) lists every gesture on one screen.

Have fun.
