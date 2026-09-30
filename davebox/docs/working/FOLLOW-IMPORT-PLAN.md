# Follow on Left/Right+Play, and MIDI import as a clip button with phrase-browser feel

## Context

Seq Follow sits on knob 8 of the CLIP card and the drum-lane card. It is a separate on/off per clip, and
it is never saved. Josh wants:
- Follow becomes **one global switch**, toggled by **holding Left or Right and pressing Play**.
- The track overview shows whether follow is on.
- **Import MIDI** moves out of the track menu and into the freed knob-8 slot, as a touch-and-click
  action like Crop and Legato.
- Import and the phrase browser become one unified MIDI browser: phrases are ordinary MIDI files with
  no categories. It has the phrase browser's feel (live preview while scrolling, stretch, whole-kit
  drum mapping) and keeps everything import does today.

User-facing surfaces (the "which screen, what do you press" rule):
- Follow toggle: in Track view (any clip or drum view), hold ◀ or ▶ and press Play.
- Follow indicator: the track overview (idle track view).
- Import: CLIP card or DRUM LANE card, touch K8, then click the jog. This opens the existing import
  screen, `VIEW_MIDI_IMPORT`.

## Where the work happens

- **Nothing is written in the main checkout**, because other work is in progress there. After this plan
  is approved, the first step is:
  `git worktree add .worktrees/follow-import -b follow-import device-sync`
- The planning doc goes in that worktree at `docs/…`. No private work-board ids go in it, because the
  repo is public.
- **Base: `device-sync`.** It is the easiest base, because the phrase browser's engine support exists
  only there:
  - `tN_audclip` (in-time preview that swaps on the beat)
  - `tN_lanes_import` (a multi-lane drum load as one undo step)
  - `ui_phrases.mjs` (stretch and drum mapping)

  `device-sync` is `main` (as of 09-27) plus the phrase library and the SOUND+CFG/MACROS-as-banks
  change. `main` is about 109 commits ahead of it, so step 0 is to merge `main` into the branch.
  - **Trade-off:** this work can only reach `main` together with the phrase library. The follow part
    (Phase 1) has no such dependency and could be cherry-picked to `main` on its own if wanted.
- Per the standing rules: Fable reviews this plan before implementation, and the branch is merged only
  after Josh verifies it on the device.

## Phase 1: Global follow, Left/Right+Play, overview indicator

**State.** Replace `S.clipSeqFollow[t][c]` (`davebox/ui/ui_state.mjs:277`) with:
- `S.seqFollow`: global, default on, saved as a device-wide preference. It is saved the same way
  `phrase-map.txt` is on `device-sync`.
- `S.followPaused`: temporary, never saved.
- **Effective follow** = `S.seqFollow && !S.followPaused`. The two poll-loop sites that move the page
  read this value (`ui_dsp_bridge.mjs` ~776 for drum, ~830 for melodic).
- Remove the `seqfollow` scope and its mirror into `bankParams[t][0][7]`. Those are in
  `ui_dsp_bridge.mjs` at 135, 213, 1110 and 1315. Also remove the resets in
  `ui_persistence.mjs:581` and `ui_input_cc.mjs:719/764-779/834`.

**Arrows** (`ui_input_cc.mjs:3169-3209`):
- Track whether each arrow is held (`S.leftHeld`/`S.rightHeld`), which needs a new release handler
  (`d2===0`).
- Pressing an arrow still changes page immediately.
- If the transport is running, an arrow press sets `S.followPaused = true` instead of switching the
  per-clip flag off.
- `followPaused` clears when the transport stops. This hooks into the transport-state poll.

**Play** (`ui_input_cc.mjs:2811-2872`):
- A new first branch: if either arrow is held, toggle `S.seqFollow`, clear `followPaused`, show a
  "FOLLOW ON/OFF" popup, and **do not** start or stop the transport.
- **Settled:** pages change on **press**, not release.
- ⚠ **Still open:** whether the combo undoes the page step the arrow already made. Suggestion: record
  the page before the press, and restore it when the combo fires. Ask Josh before building this part.

**Overview indicator** (`ui_render.mjs`: melodic 2509-2536, drum 2481-2508, page bar
`drawPositionBarGeom` 1352-1392):
- A small follow glyph at the right end of the page bar.
  - Solid: follow on.
  - Outline or blinking: paused by an arrow.
  - Absent: off.
- The page bar is on both melodic and drum overviews, and it is the thing follow drives.

## Phase 2: Import MIDI moves to knob 8

- `BANKS[0].knobs[7]` (`ui_constants.mjs:465`) becomes an action entry: `'Imprt' / 'Import MIDI'`,
  `'->'`, `opens: true`. Add an `IMPORT_KNOB = 7` beside `CROP_KNOB`/`LGTO_KNOB` (:101-105).
- Drum-lane cell (`ui_render.mjs:2190`): replace it with an action cell built like Crop's (2180-2184),
  using `triggerPhase('import', …)`.
- Remove the drum knob-8 follow handler (`ui_input_cc.mjs:4566-4577`).
- Add a touch-K8-and-click-jog branch beside the Crop/Legato branches (`ui_input_cc.mjs:273-300`). It:
  - checks `miOffered(track)`
  - calls `miOpen(track)`
  - enters the import view directly. On `device-sync`, check how `VIEW_MIDI_IMPORT` is reached now
    that SOUND+CFG is a bank.
  - makes Back from the file root return to the clip or drum card, not a menu.
- Add a "CLK IMPORT" hint (`ui_render.mjs:602-605`).
- ALL LANES keeps Repeat Sync on its knob 8.
- Remove the `midiimport` rows from the track menu. These are the four `ui_sound.mjs` sites around
  3278, 3305, 3316 and 3366. A track with no instrument then shows only its instrument row.

## Phase 3: One unified MIDI browser that replaces the phrase browser (discuss first)

**Direction (Josh, 2026-09-29):** Import MIDI and the phrase browser become **one feature**. Phrases
are loaded like any other MIDI file: no categories, no styles. The phrase browser's *feel* carries
over (live preview while scrolling, stretch, whole-kit drum mapping), and so do all of import's
functions. Nothing is built until we have agreed what the screen looks like and which functions it
has.

**Discussion agenda:**
1. **Entry points.** Only the K8 button on the CLIP and DRUM LANE cards? Or does the PHRASE bank (first
   in SEQ on this branch) remain as a second door, or go away?
2. **Where the built-in phrases live.** A shipped folder of `.mid` files the browser opens on by
   default (styles become subfolders), and the user's own files beside them?
3. **Key following.** Melodic phrases are stored as scale degrees today, so they follow the project
   key. A MIDI file has fixed pitches. Options: accept fixed pitches; add a Transpose/Key knob; or
   fold notes into the project scale.
4. **Screen shape.** The file list and a live part/phrase view on one screen, like the phrase browser:
   jog to scroll with instant preview, knobs for options, click to load. What happens to import's
   separate stages (parts, options, confirm)?
5. **Knob set.** A merged set from Start bar, Bars, Grid and To (import), and Time/stretch, Octave and
   Voice (phrase). Which eight, and in what order?
6. **Drums.** Whole-kit mapping using the Phrase Map (GM/Move) setting, plus hold-a-sound/tap-a-lane
   reassign. Does single-lane loading still exist?
7. **Preview.** In time while playing (`tN_audclip`), free-running while stopped (`tN_audition`); no
   more stopping the transport on open. Cost of previewing each file while scrolling (read + parse up
   to 256 KB); measure it on the Move.
8. **What is deleted.** The phrase pack reader, the category/style model, the PHRASE bank, and the
   pack prewarm, once the unified browser covers them.

**Reusable machinery, already on this branch:**
- `ui_phrases.mjs`: `timing`, `scaleNote`, `drumVoices`, `defaultAssign`, `drumLaneNotes`
- `ui_phrase_browser.mjs`: the preview loop (`stageKey`, `previewTick`, `freeTick`) and `pbPadTap`
- the SMF parser `ui_midifile.mjs`
- DSP keys `audclip`, `audition`, `lanes_import` and `import`; no DSP changes expected

## Tests and verification

- **Gesture tests, not just checks that the code is wired:**
  - A new test that holds ◀ and presses Play, and asserts: follow toggles, the transport does not
    start, the popup shows, and the overview glyph is drawn.
  - One that presses ▶ while playing and asserts follow is paused; then stops the transport and
    asserts it is restored.
- Update `davebox/tests/js/test_midi_import_gesture.mjs`:
  - Open import by touching K8 and clicking the jog, from both the CLIP and DRUM LANE cards.
  - The track-menu row is gone, so update the row checks in `test_midi_track_config.mjs`,
    `test_config_rows_inline.mjs` and `test_track_switch_follows_editor*.mjs`.
- Phase 3 adds tests for scrolling the preview (one send per change), stretch, drum mapping, and a
  whole-kit load as one undo step.
- Run `davebox/tests/run.sh` in the worktree **and** in a checkout before merging, and name any
  skips.
- On the device, only after Josh gives the go-ahead to deploy: `standalone/scripts/install-sa.sh
  --davebox-only`, then use the pytest-schwung harness (`snapshot_display`, `tap`) to confirm the
  overview glyph, the K8 cell, and that the import screen opens. Then a device-pass checklist page for
  Josh.

## Review notes (Fable, 2026-09-29): corrections to Phases 1–2

- **Stop edge.** Clear `followPaused` at the one transport-stop edge in `ui_dsp_bridge.mjs`, where the
  `_wasPlaying` → `!S.playing` check already triggers `saveNowOnce`. Every stop path passes through that
  point: Play, Delete+Play, an external clock, and import's own stop. Shift+Play and Loop+Play restart
  without a stop edge, so it has to be decided whether a restart clears the pause.
- **Held arrows.** The real risk is a swallowed *release*, not the handler. Sound mode's editors and the
  phrase browser swallow arrow CCs in `ui.js` before `_onCCMsg`, which would leave the flag stuck so the
  next Play toggles follow. Fix: track both edges above those gates, or let arrow releases fall through
  as Shift and Play already do. Also clear the flags on suspend, beside `deleteHeld`/`loopHeld` in
  `ui_tick.mjs`.
- **Play combo.** It must be the first branch in the Play handler, before `stepRecExit()` and the
  Delete/Mute/Loop/Shift chain, and it returns without sending anything to the transport. Gate it off in
  session view.
- **Preference storage.** Store the setting in `ui_prefs.mjs`, the same way `bankViewMapOn` is stored
  (`seq-follow.txt`, absent means on).
- **Sites the plan missed.**
  - the melodic Delete+click reset, including its JS undo and redo patches (keep InQ, drop Seq Follow)
  - the generic knob path, which must `return` for the new action key as it does for Crop and Legato
  - tests `test_clear_takes_automation.mjs` and `test_phrase_browser_gesture.mjs`
  - `test_instr_none.mjs`, which pins the source text of the NONE-route rows
  - the manual line that says the arrows turn Seq Follow off
- **Glyph placement.** The AUTOMATION card also calls `drawPositionBarGeom`, so draw the glyph in the
  melodic and drum position-bar callers, not inside the geom.
- **Hosting the import screen.** Host it the way the phrase browser is hosted, *outside* sound mode:
  an `miActive()` block in `ui.js`, plus `miTick`/`miRender` in the tick and the overlay slot. Back at
  the file root then just closes it, and the card is underneath. Routing it through sound mode would
  need view-stack work and would inherit the editor rule for track switching.
- **Open item (Fable's recommendation: do not restore the page).** While playing, re-enabling follow
  snaps the page to the playhead on the next poll anyway. While stopped, the page the user stepped to is
  where they are looking. Restoring "the page before the press" would need a saved page and a check that
  nothing else moved it, which is a comparison that fails open. Awaiting Josh.

## Phase 3 decisions (Josh, 2026-09-29)

- **Entry:** knob 8 on the CLIP / DRUM LANE card is the ONLY way in. The PHRASE bank goes away.
- **No shipped MIDI.** Users supply their own files and browse to a folder. After a folder is chosen,
  the browser **re-opens in that folder**, and the jog **steps through the MIDI files in it**
  (previewing each one) until the user changes folders.
- **Multi-part files act like a folder:** click into one to list its parts, and each part previews as
  you scroll, exactly as a single-part file does.
- **Knobs, in order:** K1 Start · K2 Bars · K3 Grid · K4 To · K5 Stretch · K6 Octave · K7 Semi
  (semitone transpose) · K8 Scale (on/off).
- **Scale:** Off plays the pitches as written. On folds each note into the project's scale. **Octave
  and Semi apply BEFORE the fold**, so they set which of the file's notes lands on the scale's root.
  (Detecting a file's own key/scale automatically is for a later version.)
- **Drums:** whole-kit mapping (Phrase Map GM/Move) plus hold-a-sound/tap-a-lane. There is no
  single-lane load.
- **Deleted with it:** the phrase pack reader, categories and styles, the PHRASE bank, and the pack
  prewarm.

## Phase 3 FINAL DESIGN (approved by Josh 2026-09-29 from mockups rev 10)

Mockups: `davebox/tools/mockup_midi_browser.mjs` (the real kit). Everything below supersedes the
decisions list above where they differ.

**Entry / exit.** K8 on the CLIP / DRUM LANE card (touch + click) is the only door. Back steps out
of a multi-part file; otherwise Back closes. The PHRASE bank, the phrase pack reader, its
categories/styles and prewarm are removed. No MIDI files ship.

**Folders.** The first open ever shows the user data folder (folders only), as a big-font list.
After a folder is chosen it is remembered (device-wide) and the browser opens straight into it.
Folder changes happen in the jog list: `..` goes up, a folder (`NAME/`) goes in.

**The page** (one per playable item: a single-part file, or a part inside a multi-part file):
- Header: the item's name (no track number), `n/N` right-aligned. While the current clip has
  notes, the right side reads `REPLACES`; other warnings (`N CUT`, `N OVER`) take that slot too.
- K1 Start · K2 Bars · K3 Grid · K4 Stretch (/8 … x8) as the bank page's top row.
- One LANE under them: every note of the part on one row, length as width; brackets mark the
  Start..Start+Bars window, notes outside it dotted; a playhead while previewing.
- K5 Oct · K6 Semi · K7 Scale as small two-line cells (label over value) under their knobs; K8 free.
  Touching one inverts its cell and names it + its value in the header.
- Drum track: K5 Map (Off / GM / Move), K6–K8 empty; right-hand pads = the file's sounds, hold one
  for the sounds panel, tap a lane to move it (the phrase browser's placement, unchanged).
- Footer: `JOG FILE · CLK LOAD · SHFT MUTE` (drum: `RTPAD SOUND · SHFT MUTE`). Shift held → `CLK MUTE`.
  Muted → `SHFT HEAR` and the lane's notes blink. No BACK hint. Mute state is remembered.

**The jog list** (small font, over the page): turning the jog raises it; it drops half a second
after the jog stops, unless the highlighted row is a folder or multi-part file (nothing to hear),
in which case it stays up. Rows: `..`, `FOLDER/`, `FILE` with `nBr`, multi-part `FILE>` with
`n PT`. Its header names the folder (`BASS LINES/`), or the file (`FUNK SONG >`) inside one.

**Multi-part files behave like folders:** click goes in; the parts are laid out and play exactly
like files; `..` / Back comes out. A part that is all channel 10 reads `DRM`.

**Preview:** as you land on a playable item. In time via `tN_audclip` while the transport plays,
free-running via `tN_audition` while stopped. Opening NO LONGER stops the transport.

**Loading:** always into the CURRENT clip, replacing it — no To knob, no confirm. One undo step.
Melodic `tN_cC_import`; drum whole-kit `tN_lanes_import`. Clip automation cleared as today.

**Pitch:** Oct and Semi transpose first; then Scale ON folds each note into the project scale
(Scale OFF = as written). Drums: none of these.

**Kept from import:** SMF parsing (formats 0/1/2, RMI, SMPTE), size/part/note limits and their
warnings, Grid, Start, Bars, drum destination-pad planning, the one-write-then-verify commit.

### Build decisions after the design review (2026-09-29)

- The global Phrase Map setting goes (Josh). K5 Map on the drum page is remembered device-wide
  (`midi-map.txt`, absent = GM).
- A drum load replaces ONLY the lanes a sound is assigned to (Josh: "drum clips should only replace
  the lanes that hits are assigned to"); the other lanes keep their notes. `REPLACES` shows when an
  assigned lane already has notes. A melodic load replaces the clip.
- The top-level list shows MIDI files as well as folders (the web manager uploads there).
- Click with the jog list up LOADS a playable row (the approved footer says CLK LOAD).
- Parse on rest (~120 ms), cache recent parses; at most 8 drum sounds (the engine's in-time preview
  cap); fold ties go UP (as `xpose_snap`); Oct ±3, Semi ±11.
- Build order: pure helpers → page + current-clip load → jog list/folders/prefs → preview →
  pitch/stretch → drums → delete the phrase library → device pass.

## Device pass 1 feedback (Josh, 2026-09-30) — the next round

⭐ **It LOOKS right; it does not FEEL right** (Josh): keep the visuals, rebuild the
interaction. **The browser must feel like the rest of dAVEBOx** — navigation, UI, browse and selection
paradigms familiar in the context of the platform, not a separate system bolted on. The redesign
is built from dAVEBOx's existing conventions (survey pending) and mocked up for approval first.

Behaviour:
- A file or part needs a **click** to become the main screen (landing only previews).
- **Nothing is committed to a clip without a confirmation.** Back out of the main screen with a
  file selected asks: commit the MIDI to the clip, or cancel.
- Reopening lands on the **main screen** (the last selected file), not the list.
- Folder memory is **per track**, not global.
- Exit always returns to the screen the browser was entered from (CLIP / DRUM LANE card).
- Global gestures stay available inside the browser (e.g. hold Shift to set the loop).
- Switching files resets **Start → 1, Grid → 1/16, Stretch → x1**; Bars starts at the file's length.
- **Bars never exceeds the file's length** (from Start), and Bars and Grid stay linked by the
  clip's step limit (as the old import did).
- Param editing works like the regular track banks: touch highlights the param; a picker appears
  only on TURN (and Grid may not need one).
- A file's BPM shows on the last (unused) cell.
- Knob rings are dark on knobs with no param.

Bugs:
- The playhead is not shown while the transport runs (in-time preview).
- The list's counts flicker in large folders and show file sizes instead of bars: the background
  count-filler shares the 8-file parse cache, so in an 82-file folder it evicts and re-reads
  forever. Counts need their own store.
- `READING...` is drawn over the list's last row.
- Back sometimes returns to the list, sometimes to the clip bank.

### Round 2 decisions (Josh, 2026-09-30, from the round-2 mockups)
- Loop inside the browser: dropped ("you're right, ignore that").
- Back on the leave dialog = No = leave without loading (dAVEBOx's rule).
- Per-track memory: in memory only, a convenience for this session (a drums folder on a drum track, a
  melodic one on a piano track). Not saved with the project or the device. midi-place.txt goes.
- Step buttons blocked inside the browser, lit dim white to say so.

## HANDOFF — state at 2026-09-30 (before a session compaction)

**Branch / worktree:** `follow-import` in `.worktrees/follow-import` (off `device-sync`, `main` merged
in; `main` had not moved at the last check). The main checkout is NOT touched (other work there).

**Done and device-verified:** Phase 1 (global Seq Follow, Left/Right+Play, overview glyph) and
Phase 2 (Import MIDI on K8) — `device-sync` was fast-forwarded to include them. The MIDI browser
(Phase 3, round 2: card / list / confirm layers, dAVEBOx's knobs and dialogs, per-track memory,
blocked steps, Res knob, BPM on K8) — Josh: "all good" on the device, except the knob rings.

**Committed, NOT yet deployed/verified:** the knob-ring fix (K1/K2/K5/K6 were dark: plain value
cells need `ringNorm`). Deploy: `./standalone/scripts/install-sa.sh --force` from the worktree
(Josh runs it; the permission check blocks the agent). After Josh confirms the rings,
fast-forward `device-sync` to `follow-import`.

**Next request (in progress, nothing written yet):** the browser LIST layer's look —
- keep the boxed frame (NOT full screen — Josh withdrew that);
- names in the regular (larger, mixed-case host) font, bar counts / indicators in the movy font;
- long names scroll so the whole name can be read (a marquee on the selected row; the shared
  host has `src/shared/text_scroll.mjs` `createTextScroller`, used by `menu_layout.mjs`).
⚠ OPEN: Josh's last words were "keep the frame like you have now with the smaller font" — confirm
whether names stay in the small font or move to the regular font inside the frame.

**Tools:** `davebox/tools/preview_midi_import.mjs` renders the real screens (incl. an 82-file
folder); `tools/mockup_midi_browser2.mjs` the approved round-2 mockups. Gesture test:
`davebox/tests/js/test_midi_import_gesture.mjs` (35 steps). Device checklists (db-backed):
pass 1 https://claude.ai/artifact/WrsQ9ULrhNPKo8MoZiKw1o, pass 2
https://claude.ai/artifact/XweaKXeVMakrC6JbeNaU9C (unused — Josh said "all good").
