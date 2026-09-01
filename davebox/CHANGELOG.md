# Changelog

All notable changes to dAVEBOx are documented here.
- **Three more Daves join the pool.** Welcome, GILMOUR, DAVID NO, and the
  rare DAVIE JAMES DIO — 34 to collect.
- **Dave Box: the card view.** Each Dave now shows his name in big caps with
  his number and rarity beneath — and the portrait slowly pans up and down
  behind the label, so the whole image gets its moment.
- **The Dave Box.** Every launch deals you one random Dave as the splash —
  some are rarer than others — and every Dave you've ever been dealt lives in
  a jog-driven album under Settings > Dave Box, each with his permanent
  number. Collect all 31.

Format follows [Keep a Changelog](https://keepachangelog.com). Add entries to
`[Unreleased]` as user-facing changes land; `scripts/cut_release.sh` finalizes
the section into a versioned heading at release time.

## [Unreleased]
### Features (pending)
- **Step recording.** Shift+Record with the transport stopped opens SH-101
  style step entry on melodic tracks: pads write the blinking white cursor
  step (chords too — hold several pads), `>` rests or, with pads held, ties
  the note longer; `<` steps back and erases what you just entered. Back,
  Play, or Shift+Record again leaves. One undo takes back the whole take.
- **Live Merge moved to Shift+Sample.** Shift+Record now belongs to step
  recording; the merge flow is unchanged from the notice onward. The
  Quantized Sampler moved with it: hold Shift and touch the volume knob,
  then press Sample.
- **A new splash pool — 31 Daves.** The launch artwork rotates through a fully
  recurated set; every launch greets you with a different Dave.
### Features
- **The bank walk is direct.** Inside the bank view the jog steps straight
  through the banks — no picker list, no waiting to commit. The latch border
  is gone (a held bank view is just how banks work now), and the sound
  editor's menu is left with Back, landing on its card.
- **Session view speaks the same click language.** A jog click opens the
  mixer page and keeps it on screen; the jog then walks Volume, Pan, the two
  sends, and — at the end of the walk — **SESSION FX**, a click-to-enter door
  to Master and the Sends, just like SOUND + CONFIG on a track. Back walks it
  all the way out. The jog is quiet on both overviews until you click in, and
  the jog-touch flash is retired.
- **Click the jog to open a bank, Back to leave.** From the track overview,
  a jog click now opens the bank display and keeps it on screen; Back returns
  to the overview. Touching the jog no longer flashes the bank up, and
  Shift+click is retired — one gesture in, one gesture out.
- **Menus open as overlays over the screen you came from.** A submenu — Sound
  Control, Config, Knobs, the LFO, Session FX, Slot Presets, the module browser
  — now floats in a box with the screen behind it dimmed, and a breadcrumb along
  the top names where you are: `T3 > Snd > Knobs > K1`. Opening one from another
  stacks them, each a step to the right, so you can see how deep you have gone
  and back out one level at a time.
- **Long lists open a picker instead of scrolling one value at a time.** Any
  setting with more than two choices — Instrument, Mode, the LFO's Shape, and
  Key, Scale and MIDI Channel in the global menu — now opens the list and lets
  you choose from it. Two-value settings still toggle in place, and continuous
  values (levels, times, cutoffs) are still adjusted by turning. Backing out of
  a picker leaves the setting as it was.
- **SOUND + CONFIG is a door on the bank walk, not the screen itself.** Jogging
  onto it offers "click to enter"; the click opens the menu, and turning the jog
  carries on through the banks as it does anywhere else. The knobs still control
  the track's assignments while you are on it. Once open, the menu stays up
  until you leave it — it no longer disappears when you stop touching the jog.
- **Shift + Note/Session goes somewhere, rather than toggling.** A tap opens the
  track's Sound + Config menu from wherever you are — including out of a menu
  several levels deep, in one press. Holding it goes straight to the track's
  instrument instead, and leaving the instrument returns you to whatever you
  pressed from.
- **Knob assignments read shorter, so they stop being cut off.** A knob's target
  now shows as `Syn>cutoff` / `FX1>mix` rather than `synth: cutoff`, and the rows
  are `K1`–`K8` rather than `Knob 1`–`Knob 8`. The old pair was long enough that
  the row label was being trimmed to fit it, and the longest assignments were
  truncated outright. The LFO title and target row use the same form.
- **Picking a knob's target names the module, not the slot.** The list used to
  read `Synth: Noisemaker`; it now reads `Noisemaker`, with a `>` showing that
  the row opens that module's parameters. When the same module is loaded in two
  FX slots, the slot appears beside the name so the two rows can be told apart —
  and only then. The LFO target list works the same way.
- **Shift + Volume adjusts the active track's volume — everywhere.** Track
  View, Session View, and the sound editor all share one rule now: the Volume
  knob alone is always Move's master output (including in the sound editor,
  which used to take it over for the on-screen level), and holding Shift makes
  it the active track's level. The level is saved when Shift is released. A
  MIDI-routed track sends standard MIDI volume (CC 7) on its channel.

- **The track overview header no longer repeats the track number.** The track
  row on that screen already shows which track is active; bank cards keep the
  `Tr<n>` prefix, since they can hold the screen with no track row in sight.

### Fixes
- **A count-in take stops at the bar again.** Recording armed from stopped
  keeps the wait-for-the-page-edge stop; the instant punch out now applies
  only when recording was punched in during playback.
- **Record is a punch during playback.** Pressing Record while the transport
  runs starts recording the moment you press — no more waiting for the next
  bar — and pressing it again stops it just as immediately. Recording from
  stopped keeps its count-in, and an empty clip still sizes itself in whole
  pages.
- **The module editor's header names the module, not the preset.** The
  breadcrumb reads `S1 > NUSAW` again instead of the loaded patch name.
- **Touching a knob in the module editor highlights its parameter again.** The
  header names the param the moment your finger rests on the knob, before any
  turn — the pre-1.0 behaviour, restored.
- **Sequencing controls actually work while editing a Move synth.** During
  Move co-run, Play, Record, Sample and Loop were silently going to Move
  instead of the sequencer (a stale constant), and Shift belonged to Move
  too. Now the sequencer keeps pads, steps, transport and its Shift gestures
  under Move's editor; Move keeps its screen, the eight knobs, the jog, Back,
  the track row, Mute, and Copy/Delete for drum-rack editing.
- **Double-and-fill can no longer half-work.** With a loop window set on a
  long clip, Shift + Step 15 could say "LOOP DOUBLED" on screen while the
  engine refused the doubling — leaving the display and the playing loop
  disagreeing about the length. Both sides now agree: when it doesn't fit,
  it says CLIP FULL and changes nothing.
- **Knobs in the sound editor no longer snap back.** Turning a parameter —
  in the editor's own pages or a module's hosted canvas — could occasionally
  lose the change under the hood while the knob briefly showed it, and the
  display would then jump back (first documented on the Junologue Chorus).
  Every change is now read back and re-sent until the engine confirms it.

### Features
- **Settings values stop at the ends of their lists.** In the Settings menu and
  the track screens (Config rows, the Instrument picker), scrolling a value no
  longer loops around from the last option to the first — overshooting a scroll
  can't land you on the opposite extreme any more.
- **The project screen is fully its own surface.** While it's open, only its
  controls do anything: pads pick projects (they no longer also play the loaded
  instrument), the jog navigates, Back closes, and hold-Delete / hold-Copy work
  the project gestures. Everything else — the menu, transport, knobs, steps,
  track buttons — is ignored until you leave, so nothing can poke the loaded
  project from behind the screen.
- **The project screen wears the dAVEBOx wordmark.** It's the first thing you
  see after loading, so its header now always reads "dAVEBOx" — with the real
  lowercase letters — on every project screen: the picker, a project's menu,
  the colour list, and the copy/delete/rename prompts. Each screen's title
  moved into the body.
- **The sound editor is now a bank.** Turning the jog right past a track's last
  parameter bank lands on **SOUND + CONFIG** — the same screen Shift + Note/Session
  opens, with the instrument, effects, sound control and config. Keep turning to
  move down its rows; turn left past the top row to return to the bank you came
  from. Click and Back work as before. Instruments and effects can now be edited
  without leaving the track's banks. (Conductor tracks keep their own five banks.)
  On SOUND + CONFIG the sequencer underneath behaves exactly as on a standard
  bank, whichever bank you scrolled in from: pads wear their normal track
  colors and play notes, steps show and edit notes — the AUTOMATION bank's
  special pad, step and screen behavior applies only while you are actually
  on AUTOMATION. Its top level also keeps the banks' display rhythm: release the
  jog and the screen falls back to the track overview, touch it to bring the
  screen back — sound mode stays active underneath, and deeper screens (a block
  editor, presets, config) stay up on their own.
- **One header across the whole browser interface.** A slim ribbon at the very
  top carries the dAVEBOx name and the links to Mirror, Files, Help, Config and
  System — the same set, in the same order, on the editor and on every one of
  those pages, so moving between them feels like one app instead of a jump to a
  different site. The links left the editor's crowded toolbar to get there.
- **The clip grid shows six rows and gives the rest to the piano roll.** It used
  to take up to a third of the window height whatever was in it; the roll now
  gets that space back, and the remaining scenes scroll.
- **The header's clip badge is gone.** The session grid already highlights the
  selected clip and the piano roll *is* that clip, so it was saying a third time
  what two things on screen already showed.

### Fixes
- **You can tell the loaded project from the selected one again.** On the project
  pads both were flashing white, which made them impossible to distinguish. The
  loaded project now sits steady white and never blinks; the pad you have
  selected pulses in its own colour. When they are the same project, that pad
  pulses white against its colour.
- **Launching from stock's Tools menu no longer pauses a few seconds.** The
  launcher was waiting up to four seconds on a save request the returning host
  didn't answer; it now checks first and skips instantly when there's nothing
  listening, so the launch is quick every time.
- **Launching from stock's Tools menu answers the first click.** It always
  did launch on the first click, but for about nine seconds nothing changed
  on screen and stock's menu stayed live, so it felt like it needed three.
  The launcher now asks stock's UI to save and exit first, puts the splash up
  as soon as it has gone (about half a second), and only then asks Move to
  save the song. It also no longer waits five seconds for a stock UI process
  that had already exited.
- **A white project can no longer be mistaken for the loaded one.** White is
  reserved for "this is the open project" in the picker's pad grammar, so a
  project that had picked white as its own colour sat there looking current
  even when it wasn't. White is off the palette now, and any project that had
  it falls back to blue. New projects also get a round-robin default colour
  by pad position instead of all starting blue.
- **The automation lane opens when you click a CC button.** It was opening but
  drawing nothing — the lane's canvas could end up with no size at all, so you
  got an empty strip that looked exactly like a button that did nothing.
- **The step-edit row no longer disappears as the page loads.** The level ribbon
  and the session grid fill in after the piano roll has already sized itself, and
  the roll did not re-measure — so its bottom row, the step editor, got clipped
  out of sight behind the VELOCITY header. The roll now follows its own box
  whatever changes it.
- **The Snap/fit control no longer covers the step row.** It was floating over
  the right-hand end of the step-edit band at the bottom of the piano roll,
  hiding those cells and swallowing clicks on them.
- **The BPM box no longer clips its own number.** Everything in the toolbar was
  allowed to be squeezed when the bar got full, and the number input was the
  first thing to lose width.
- **A calmer top bar, and zoom where you're looking.** The four H/V zoom buttons
  are gone — the drag strips along the top and left edges of the piano roll, and
  Ctrl+wheel, already did the same job. **Fit** and **Snap** moved onto the roll
  itself, bottom-right, fading in as you point at it. Double-clicking either
  zoom strip now fits too.
- **Vertical zoom is an up/down drag.** It read left/right movement on a strip
  eighteen pixels wide, which left nowhere to drag. Both strips now work the
  same way: drag down to zoom in, up to zoom out.
- **Sound editing got wider and simpler.** An instrument's own editor now fills
  the page instead of a 620-pixel column — obxd and Osirus both need about 980
  pixels and were being clipped. Its card header now carries a **Custom UI /
  Generic** switch (clearer than the old "panel / controls") and the **open in
  tab** link, which used to sit below the editor where you had to scroll past
  the whole thing to reach it.
- **Generic controls are collapsible banks.** Opening one group of parameters no
  longer replaces the card and leaves a breadcrumb as the only way back: every
  group is a section you expand or collapse, as many at once as you like, with
  the others still on screen.
- **One row of chips on the Sound page.** The clip chips no longer ride above
  the track chips there — two rows of eight colored chips doing different jobs
  read as one confused control. Clip launching stays on the Mixer and the
  sequencer; the Sound page keeps the track chips.
- **The Help page now holds the manual.** It was an empty shell; it now carries
  the full dAVEBOx manual and the quick start, split into one page per chapter
  with a topic index and working cross-references. It reads off the device
  itself, so it works with no internet connection — and it is generated from
  the manual at install time, so it can never fall behind the build you are
  running.
- **Instruments' own editors now actually appear.** An instrument that ships
  its own panel (like OB-Xd) shows it on the Sound page — a timing bug decided
  "no panel" before the instrument's identity had loaded, so hardware always
  got the generated controls. A small panel/controls button on the instrument
  card lets you pick either, and it remembers your choice per instrument.
- **Track chips on the Sound page.** Eight colored track buttons above the
  signal path switch which track you're sound-editing without leaving the
  view.
- **Ribbon and header gestures do what they look like.** In the browser
  editor, dragging a level bar on the mini-mixer ribbon no longer throws you
  into the Mixer on release — the track number is the Mixer link now. Clicking
  a track header opens that track's Sound view (it used to mute the track);
  sequencer mute/solo moved into the track's gear menu, and the header badges
  still show their state. A conductor track now says "Conductor" wherever
  instruments are named — its instrument setting never did anything.
- **The browser editor is now the whole page.** Opening `http://move.local:7700`
  lands directly in the dAVEBOx editor — no more Schwung tabs, module store, or
  "Connecting to the Move…" hang. While no session is running, the page says so
  and opens the editor automatically when one starts. A live view of the Move's
  screen is at Mirror, and Files / Help / Config / System keep their pages.
- **The browser editor keeps up.** Updates from the device now arrive as small
  changes instead of the whole project every time, and the connection is
  compressed — editing over WiFi stays responsive during playback.
- **Connection pill.** The editor's header now shows the link state at a
  glance: Live, Reconnecting, or "dAVEBOx not running" (the session was left
  while the page stayed open). Press ` to open a diagnostics readout.
- **A Mixer view in the browser.** The editor gained a view switcher —
  Sequencer, Mixer, Sound — sharing one selected track. The Mixer shows all 8
  tracks as strips: what each one plays (the instrument's name, "Move 2",
  "MIDI"), a level fader with unity at 1.00x (double-click resets), pan with a
  sticky centre, both sends, and audio mute/solo. Turn a knob on the Move and
  the strip follows; drag a fader in the browser and the audio changes — and
  the change is saved with the project.
- **Each view shows only its own tools.** The sequencer's draw/select/erase
  tools, zoom, snap and undo buttons now leave the header in the Mixer and
  Sound views instead of sitting there doing nothing.
- **Track headers name the instrument.** The sequencer's track headers now
  read "5 - OB-Xd" or "1 - Move 3" instead of routing shorthand, and a
  dead track-settings row that no longer did anything is gone.
- **The Sound view follows the hardware.** Turn a knob on the Move while its
  track's Sound page is open in the browser and the control moves with it.
- **The Mixer says when it's still syncing.** Strips show "…" and disable
  their controls until real values arrive, instead of briefly showing
  defaults that look like data.
- **A level ribbon lives under the session grid.** Eight slim cells — one per
  track, in its color — each with a level bar (notch at 1.00x), audio
  mute/solo, and the track number. Drag a bar to trim a level without leaving
  the sequencer; double-click for unity; click the cell to open the full
  Mixer on that track. Collapsible from its left edge, and it remembers.
- **Clips stay launchable from the Mixer and Sound views.** A row of clip
  chips (track colors, ▶ on the playing one, a dashed ring while queued)
  sits above both views — click a chip to launch that track's playing or
  first clip, so performing never requires jumping back to the sequencer.
- **The views connect through the music, not just the switcher.** In the
  browser editor, clicking an instrument name in the Mixer opens that track's
  Sound view; double-clicking a track header in the sequencer does the same
  (its gear menu also gained Open in Mixer / Sound); the Sound page's title
  takes you back to the sequencer, and its level readout opens the Mixer with
  that track's strip highlighted. View switches crossfade, each track's Sound
  page remembers where you scrolled it, and the address bar tracks the view —
  so the browser back button steps between views and a phone can bookmark the
  Mixer directly.
- **A Sound view in the browser.** The selected track's instrument and effects,
  laid out the way the signal flows, each editable with real knobs and preset
  browsing. An instrument that ships its own editor page (like OB-Xd) appears
  as that editor; everything else gets controls generated from what the
  instrument declares. The track's audio strip sits at the right edge, same as
  on the device's own track screen.
- **The menus all look like the same app now.** Several screens had drifted onto
  different layouts — the Settings menu used a different typeface for its title
  and its rows, the project screens drew their own list that didn't match any
  other, and the sub-screens under a track's settings were set in a lighter font
  than the screen they opened from. They now share one look: the same header
  bar, the same rows, the same highlight, the same scrollbar. **Along the way
  three pieces of text that ran off the right-hand edge of the display are
  fixed**, including a track sub-screen whose title read "TRACK 5 - SOUND C".
- **The project screens are one screen.** Opening Projects now shows the
  project that's selected — its name, and Load / Rename / Color — instead of a
  page of instructions. Tapping any pad switches to that project's screen, which
  is how it already worked; there's just nothing in the way now. On the project
  you already have open, Load is replaced by a **(Current)** marker and a
  **Resume** item that puts the picker away and drops you back in. If the
  project you had last is gone, the screen simply says **Select project** until
  you pick one. **Rename** and **Color** both open a screen, so both show a
  `>` — Color no longer shows its value on the menu itself. Copy and delete are unchanged — hold the button and tap, the same as
  Move's own sets.
- **The sound editor's knobs now say what they do.** Outside a block's own
  parameter pages the eight knobs drive the slot's knob assignments, and until
  now nothing on screen told you which was which — you turned one and listened.
  **Touch a knob** and a card names the block and parameter it drives
  (`SYNTH` / `CUTOFF`), or says `UNASSIGNED`; **turn it** and the card shows the
  value live. **Shift + touch** goes straight to assigning that knob, instead of
  walking down to Sound Control → Knobs… and finding its row.
- **Those knobs now turn at full resolution, and every one feels the same.**
  They used to hand the turn to the effect chain, which sized each step by
  whatever the module declared — so a parameter declaring a coarse step had only
  a handful of usable positions, a wide-range one crawled, and turning fast
  moved *less* than turning slowly. Now every knob sweeps its whole range in
  the same gesture whatever the units, fast turns move proportionally, and a
  change of direction takes effect immediately. A continuous parameter takes the
  same full turn as a fader in the session mixer, so knobs feel the same
  everywhere in dAVEBOx; whole-number parameters keep their own steps (an
  eight-voice count is two clicks a voice), and picking from a list takes four
  clicks so a brush can't change it.
- **The whole session reads as dAVEBOx now.** Launching dAVEBOx SA opens on
  the dAVEBOx artwork (with a small "Schwung base: x.x.x" note so you can
  always see which Schwung it's built on). The artwork lives there and only
  there: from the moment you pick a project until the sequencer is ready,
  the screen simply says **LOADING** and the set's name — one continuous
  message, no second splash anywhere.
- **dAVEBOx SA now has its own project workspace — your Move sets are never
  touched.** Launching a session sets your Move sets aside untouched and brings
  dAVEBOx's own projects in; leaving (or simply rebooting, even after a power
  cut) puts everything back exactly as it was. The first launch creates
  Project 1 for you, already wired the way dAVEBOx needs — every
  project is born from the same correctly-wired template, so channel setup is
  nothing you ever think about. Samples, presets, patches and modules stay
  shared with official Schwung; only the sets/projects are separate worlds.
- **Projects live on the pads, inside dAVEBOx.** Open the picker any time
  with **Settings menu → Projects...** or **Shift + Step 1**: one pad per
  project (blue; the open one pulses), tap to open (~2 seconds), tap an
  empty pad for a new correctly-wired project, hold Copy to duplicate onto
  an empty pad, hold Delete and tap twice to remove. A fresh launch opens
  ON the picker, and Move's own set screens never appear anywhere.
- **A fresh session waits for you to choose — nothing loads until you pick.**
  dAVEBOx used to open your last project and put the picker on top of it; now
  it comes up with the picker and an empty, silent sequencer, and the project
  only loads once you select it. Tap the pulsing pad (or **click the jog
  wheel**) to carry on with the one you had open, or tap any other to open
  that instead. Back does nothing while you're choosing — there's nothing
  behind the picker — and Shift + Back still leaves dAVEBOx.
- **dAVEBOx now shows only the effects the host it's running on actually has.**
  On the dAVEBOx host you get four insert FX per chain plus both Send buses; on
  official Schwung, which has two inserts and no sends, those extra rows are
  hidden instead of appearing and quietly doing nothing when you turn a knob.
- **In a standalone session, Quit hands the device back to stock Schwung.** When
  dAVEBOx has been launched as its own session — it *is* the session, rather than a
  tool you opened from the menu — Quit saves your work and returns the device to the
  official Schwung install, which is what Back already does there. Opening dAVEBOx the
  ordinary way is unchanged: Quit still simply unloads it.
- **Edit a track's sound without leaving dAVEBOx — `Shift + Note/Session`.** One
  gesture, and where it lands follows the track's route: Schwung tracks open a
  new sound editor over the track's whole chain (MIDI FX, synth, FX 1-4), Move
  tracks hand off to Move's own editor as before. Jog picks a block and turns
  the pages, the knobs edit, `Shift` + jog jumps between sections, and picking an
  empty block opens the module list — which is how you add an effect. The pads
  and step buttons stay with the sequencer throughout, so you can keep playing
  while you dial. `Back` steps out a level at a time.

- **The sound editor follows the drum pad you hit.** With a drum module in the
  chain (DR32), playing a pad brings that drum's parameters up on screen — no
  jogging through 32 pages to find the one you just heard. Only a pad you
  physically press counts: a running pattern, or drums arriving over MIDI, never
  drag the editor around. Modules that don't offer per-drum editing are
  unaffected.
- **Presets in the sound editor.** Click the jog inside a module to reach its
  presets. Where a module has both, you pick the source first: **User Presets**
  (the ones you've saved, shared with Schwung's own preset browser) or the
  **module's own built-in presets**. Both are numbered, scrollable lists.
- **Module Menu.** The same jog-click picker now has a **Module Menu** row: the
  module's own parameter menu, opening straight on its top level. The knob
  pages only show parameters a module maps to the eight knobs, so this is how
  you reach everything else. Jog scrolls, click steps into a sub-menu or starts
  editing the highlighted value, Back steps out.
- **File and text parameters work from the menu.** Modules that load a sample
  or a kit (DR32, Breakbeat) open the standard file browser; text parameters
  open the on-screen keyboard. Anything dAVEBOx has no editor for says so and
  shows its value rather than hiding the row.
- **Presets audition as you scroll**, so you hear one before committing. Click
  loads it and takes you back to the sound pages; **Back** puts the sound you
  came in with back instead. **[Save current…]** names a patch on the
  on-screen keyboard and never overwrites — a repeated name gets a number.
  **Shift + click** a preset to delete it, which asks first.
- **`Shift` + click on the block picker swaps a block's module.** Plain click
  opens it for editing.

- **Modules with their own canvas UI now lay out the sound pages.** OB-Xd,
  Noisemaker, DR32, String Machine, Palette and others ship a designed layout —
  which knobs belong together, what order the banks go in, the abbreviations
  that fit. dAVEBOx now uses that layout where a module has one, instead of
  inferring its own, so those modules look and navigate the way their author
  intended. Everything else is unchanged.

### Fixes
- **Loading a project no longer lands you on the session mixer page.** Clicking
  the jog to load meant your finger was on the jog while the project loaded,
  and the load could swallow the moment you let go — so the session opened with
  the mixer page pinned, as if the jog were still being touched. Finishing a
  load now clears any touch it may have swallowed.

### Performance / UX
- **The Settings menu is now `Shift + Step 2`.** It was on both that and
  `Shift + Note/Session`; the latter is the sound editor now. Everything in the
  menu is unchanged.
- **`Shift + Step 3` no longer opens the instrument editor** — `Shift +
  Note/Session` is the one way in.
- **In Session View the eight knobs set each track's Schwung level** — knob 1 is
  track 1, and so on. A track layered across several chain slots moves all of
  them together; a track that isn't Schwung-routed does nothing. Levels are
  saved once you stop turning.
- **Fixed: turning a knob in Session View used to edit the focused track's
  parameters** — invisibly, since the session grid doesn't show them.
- **The Volume knob sets the chain slot's level while you're in sound mode.**
  Plain Volume, no modifier — Move's master volume is left alone until you
  leave. A read-out shows the level over whatever page you're on, and it's
  saved when you let go of the knob. *Requires the patched Schwung host; on an
  unpatched one Move's master moves too.*
- **Note/Session leaves sound mode from anywhere.** Back still steps out one
  level at a time; Note/Session drops you straight back to the sequencer no
  matter how deep you are — the same button that opened it.
- **Sound mode follows the track you switch to**, keeping the block you were
  on — so switching tracks mid-edit compares two sounds instead of dropping you
  back to the sequencer. Tracks that aren't Schwung-routed close it, since
  there's no sound there to edit.

## [1.0-beta.8] — 2026-07-21
### Performance / UX
- Additional movy-inspired UI improvements.

## [1.0-beta.7] — 2026-07-20
### Features
- **Big pop-up read-outs when you turn a parameter knob.** Turning any knob — on the track pages or in the step editor — opens a large, centred view of just that parameter: a zoomed arc/value, or a scrolling picker for choice params, so you can read what you're changing at a glance. It appears on turn (a bare touch still just highlights the name) and holds until you release.
- **Redesigned track-view parameter pages.** Graphical widgets per knob (arc and centre-tick knobs, toggle bars, option/value squares) under a chunky pixel-font header — an on-screen canvas UI whose look and font are adapted from [movy](https://github.com/DimaDake/schwung-movy) by DimaDake. The step editors match.
- **Capture — retrospective recording, like Move's own Capture button.** dAVEBOx always listens; tap Capture to keep what you just played. From a stopped empty session it estimates the tempo, sizes the clip to whole bars and plays it back; with the transport running it overdubs into the focused clip. Melodic and drum.
- **Live Merge now confirms before it starts, with a 1-bar count-in.** Shift + Record raises a notice first (so an accidental press can't wipe a take), then counts in and captures a clean take — single-track in Track View, all 8 in Session View.
- **Clearer button roles.** Capture captures, Sample bakes, Shift + Record runs Live Merge.
- **The Back button now navigates instead of just leaving.** A tap backs out one level at a time; hold Back (or the menu item) to suspend. (Needs a current Schwung host; on older hosts a tap suspends as before.)
- **One consistent feel for every knob.** Three response classes — continuous (±1 always dialable), option-pickers, and deliberate (toggles/actions) — replacing ~20 hand-tuned speeds.
- **Absolute step velocities in the arp and Repeat Groove step editors,** with a "Thru" default that passes your playing dynamics through and a Shift fine-adjust page.
- **Widget cues and bank renames.** Action knobs show "turn-either-way" chevrons, Playback Direction shows real arrows, stepped ranges show a position dot-strip; ARP IN → LIVE ARP and AUTO → AUTOMATION, with consistent headers.

### Fixes
- **Your patterns on other Set Pages are safe now.** If you use Schwung's Set
  Pages, sets on the pages you aren't currently on were treated as deleted, and
  opening dAVEBOx erased their patterns, clip settings and snapshots for good.
  dAVEBOx now recognises a set parked on another page as still there. If you use
  Set Pages, update before opening dAVEBOx again.
- **dAVEBOx tells you when it needs a newer host.** If you run a dAVEBOx build
  that expects host features an older dAVEBOx host doesn't have, the splash now
  says so instead of quietly dropping the extra effect slots and send buses.
- **The browser editor no longer shows bogus effect values on a drum track.** The
  FX panel was displaying numbers read from the wrong place — they weren't the
  lane's settings, and editing them wrote the wrong values back. It now shows
  nothing there rather than something incorrect. Melodic tracks are unaffected.
  Per-lane drum FX in the browser is a separate feature, still to come.
Lots of stability and correctness work, including: crash fixes around drum-clip copy/cut/undo, perf-mods over an empty loop, and placing a Live Merge onto an empty drum clip; stuck-note fixes (track switch, count-in, transport restart, two-pad co-run); external-MIDI recording restored on Move/Schwung/External routes plus count-in capture; Ableton (.ablbundle) export repaired; a bake-vs-live-playback parity audit; a consistency pass over every dialog and pop-up (button order, casing, "Back cancels"); NOTE FX pitch-random mode now persists; live-recording into an empty clip no longer freezes; saved performance presets survive reloads; and many smaller refinements. Full detail in the repo changelog and the technical changelog.

## [1.0-beta.6] — 2026-06-25
### Features
- **The AUTO bank is now fully functional on drum tracks.** Step LEDs show the automation gradient and a moving playhead, the per-knob automation graph rescales as you change loop lengths, and the pads stay playable while you edit — gray, with the active lane in your track colour and any lane that's sounding lit dimly, while the right 4×4 block stays dark (the pads play their drum sounds and no longer select lanes on this bank). Per-lane loop length (hold Loop + step buttons **or** the jog wheel), Shift + Step 15 double-and-fill, and the rest of the per-lane loop tools all target the automation lane, exactly like melodic tracks.
- **Inserting an automation point starts from the value already at that step.** Hold a step that has no point of its own and turn a knob to add one: it now starts from the line's current (interpolated) value instead of jumping to 0, and you can turn up **or** down on that first move to place the point above or below — so new points land on the existing curve and the automation stays smooth. Works on melodic and drum tracks.
- **Automation graph shows a live playhead.** The automation graph on the AUTO bank — both the resting overview and the knob-touched param view — now draws a moving cursor showing where playback is within the lane's loop, so you can see the curve and the playhead together. Melodic and drum.

## [1.0-beta.5] — 2026-06-24
### Features
- **Mute is handed to Move/Schwung during co-run.** While co-running Move's native instruments and drum pads (Shift+Step 3 / Track Config), pressing **Mute** now mutes the *Move* instrument or drum pad you're working with, instead of being captured by dAVEBOx. While editing a Schwung chain, **Mute is the chain's bypass modifier** — Mute + jog-click bypasses the focused slot component — so dAVEBOx no longer steals it for its own track mute/solo there (in the FX picker it cedes to Move, like normal co-run). Outside co-run, Mute keeps its dAVEBOx track mute/solo behavior. (Requires Schwung with the Mute co-run group; older Schwung simply leaves Mute with dAVEBOx as before.)
- **Bank position strip in the Track View header.** The header now shows a compact "you are here in the bank chain" strip on the right — the active bank is a tall block, the others short stubs — so you can see how many banks exist and where you are as you turn the jog (like Move's Device View). It appears on both the resting track overview and every parameter-bank overview, where it replaces the old `Tr#` track-number indicator, and supersedes the old inconsistent `>>` hints. Ported from [Overture](https://github.com/m-dwyer/overture).
- **CC automation on drum tracks.** The AUTO bank is now fully active on drum tracks — record, play back, step-edit, and set resting values for CC and aftertouch lanes the same way you would on a melodic track. Per-lane loops and the automation graph work identically.
- **Clock Out — make dAVEBOx the clock master for external gear.** New **Settings → Clock Out** toggle (default **Off**). Turn it **On** while free-running and dAVEBOx sends MIDI clock and start/stop out the USB-A port, so external synths and drum machines lock to dAVEBOx's tempo and transport. When **Clock Follow = Move**, Clock Out is automatically suppressed (Move's own MIDI Clock Out handles external sync) and the row shows **—**, while your On/Off preference is remembered.
- **Live arp & delay keep their groove while following Move.** With **Clock Follow = Move**, holding pads to arpeggiate or using tempo-synced delay while the transport is stopped now keeps running at Move's tempo instead of freezing — and dAVEBOx now reads its tempo from Move's clock automatically, so the BPM display matches Move without setting it by hand. (Pressing stop still stops dAVEBOx's sequencer, as before.)
- **Clock Follow — lock dAVEBOx to Move's transport.** New **Settings → Clock Follow** toggle (default **Off** = unchanged free-running behavior). Set it to **Move** and dAVEBOx follows Move's MIDI clock and tempo instead of its own — BPM shows **Move** and Tap Tempo is disabled — so the two stay phase-locked. dAVEBOx's **Play** now starts/stops *Move's* transport (and dAVEBOx follows it), so a single Play press launches both from the same downbeat; arming **Record** while stopped starts Move and counts a one-bar lead-in on its clock before recording. If Move's clock stops, dAVEBOx stops with it.
- **Save state asks first.** Choosing Save state from the Global Menu now shows a confirmation (with your current snapshot count) before it saves, so an accidental click can't overwrite your work.

### Fixes
- **Fixed a crash when clearing a clip with a drum track in the set.** With a drum track present, clearing a clip (or making almost any edit afterward) could crash the Move. Empty drum clip slots are now skipped when saving the set's state instead of being read as if they held data.
- **ALL LANES edits all wait for the confirmation now.** The ALL LANES drum bank asks you to confirm before it changes all 32 lanes — but only the knobs used to wait for that; the Loop button (loop length and loop window), double-and-fill (Shift+Step 15), and quantize (Shift+Step 16) could edit every lane before you'd confirmed. Now all of them wait, the "Edits will affect all lanes. Proceed?" screen appears the moment you open the bank, the gated Shift+Step shortcut buttons stay unlit until you confirm, and holding Loop no longer slips into the length view — so nothing implies an edit took effect early.
- **Track mode menu shows Conduct, not Cond.** The abbreviated label in Track Config → Mode has been expanded to the full word.
- **Switching tracks with Shift + jog stays on the track overview.** Holding Shift and turning the jog to change tracks no longer flips the screen to the active parameter bank — the OLED keeps showing the track overview as you move. (Holding Shift on the NOTE FX bank also no longer pops a preview; that was a leftover from a removed feature.)
- **Clips you've left off stay off.** A clip that has notes but isn't playing no longer springs to life on its own — scrolling between tracks, or pressing Play, only auto-starts a track's focused clip if that clip is empty. And Shift + clip pad in Session View now *opens* a notes-clip in Track View for editing without turning it on (while stopped); empty clips, or any clip while the transport is running, still launch. To turn a clip on, tap its clip pad in Session View or its clip side button in Track View.
- **Metronome mode reads the same everywhere.** The Track-View status indicator now shows the same names as the menu and the Shift+Step 6 popup — Cnt-In / Play / Always — instead of the older Count / Rec / Rec/Ply.
- **Knob lights no longer flash a dead Shift gesture.** Holding Shift in Track View used to blink certain knob lights, implying a Shift+turn function — but those moved to jog-click long ago, so the flash promised something that did nothing. Removed. (Alt-params are still reachable via jog-click, shown by the down-arrow in the header.)
- **Automation now records after a count-in.** Arming Record from a stopped transport (which plays a 1-bar count-in first) and then turning an automation knob now captures the move. Previously the first knob turn right after the count-in was dropped on lanes that had no automation yet.
- **Drum tracks show the right pattern after switching with Shift + jog.** Switching to a drum track by holding Shift and turning the jog wheel now refreshes that track's lane steps, drum note names, and clip dots — matching Shift + bottom-row-pad. Previously they could show stale data if the track had changed while it wasn't selected.
- **Chromatic pad layout is remembered.** A track set to Chromatic (Shift + Step 8) now stays Chromatic after you suspend, exit, or reload the set — it was silently reverting to In-Key before.
- **Copying a drum lane carries its repeat cycle length.** Copy or cut a drum lane and its Note Repeat gate cycle length now comes along (and a cut source resets to the default 8) — previously the destination kept its own old cycle length against the copied gate pattern.
- **Drum pads play once in Move co-run.** While editing Move's drum sounds in co-run, tapping a drum pad now plays a single hit at the velocity you played — it was double-triggering and ignoring velocity before — and still selects that drum on Move for editing.

### Documentation
- **Manual: co-run gets its own chapter (§15).** Sound Sources & Co-Run Editing is now a dedicated chapter covering entry (Shift+Step 3 / Track Config), controls, exit (Step 3 blinks as the affordance), and Edit Synth/Slot specifics. Previously this was scattered across Track Config footnotes. "Forthcoming" labels removed — co-run works on Schwung 0.9.18+. "Patched Schwung" language updated to version-specific where known (Sch lanes → 0.9.17+).
- **Manual: Clock Follow and Clock Out documented (§16.6).** Clock Follow explains the Move-native integration in detail — the "dAVEBOx is the sequencer, Move provides clock/tempo/voices" model, practical setup steps, and the clear-Move-clips requirement. Clock Out is covered as its own subsection (dAVEBOx as clock master to external gear). Both require Schwung 0.9.16 or later for the audio-rate clock path.
- **New Quick Start guide + reorganized manual.** Added a separate `QUICKSTART.md` that walks new users from setup to a looping pattern with effects, scenes, and Performance Mode in six short lessons. The manual is reorganized into six clearly-signposted parts (Foundations · The Two Views · Building Patterns · Parameter Banks · Performance & Output · Reference) so each topic lives in one place — Conductor tracks now have their own chapter, and all the parameter banks are grouped together. Also corrected against the device: Track Config's Type is Keys/Drums/Cond (with a Layout entry), the Global Menu is listed in on-device order, and the obsolete "Save" menu action is replaced with the actual auto-save / Quit / Save-state behavior.
- **Manual corrections.** Fixed several spots where the manual didn't match the device: Performance-Mode capture length is set with the R0 pads (1/32–1/2 bar; there is no 1-bar or triplet capture), drum lane bank A/B switches with Up/Down (modes cycle with Shift+Step 8), the AUTO playhead step shows white, Shift+jog switches tracks in both views, and the step-edit K2 label reads "Note".

## [1.0b4] — 2026-06-07
### Features
- **Key/Scale changes transpose your clips.** Editing the global Key or Scale now moves all melodic clips with it, with a live preview as you turn the knob and a "Transpose clips?" confirm before it commits. Drum tracks are untouched.
- **Co-run surface polish.** Cleaner pad and step-button visuals in both co-run modes, with Step 3 as a consistent blinking exit and the routed slot/track highlighted on the side buttons.
- **Co-run auto-opens the instrument the track plays.** Entering Schwung co-run jumps straight to the chain slot that receives the track's channel — no more "which slot?" picker.
- **Per-lane automation loops.** Each automation lane can have its own loop length, playback speed, and step granularity, cycling independently from the clip. Set it up with Hold Loop on the AUTO bank.
- **Auto bank visual mode.** The AUTO bank now has a distinct look — a warm step-LED gradient, grayscale pads, and an OLED automation graph with a moving playhead.
- **Transport stop returns to resting values.** Stopping playback sends each automation lane's resting value so parameters don't get stuck.
- **Conductor tracks — real-time, non-destructive transposition.** A new track type (Track Config → Type → Cond) that transposes every playing melodic clip in real time from the note the Conductor plays — sequence a progression and all responding tracks follow it in key. Your written notes never change; the shift is live and reversible. One Conductor per session, with per-track responder, octave, and timing controls.
- **Scene bake can apply the Conductor.** Baking a scene with an active Conductor adds an "Apply Conductor?" step that can fold the live transposition permanently into each responding clip.
- **Ableton export can apply the Conductor.** Exporting with an active Conductor adds an "Apply Conductor?" step that folds the transposition into the exported clips, without touching your live session.

## [1.0b3] — 2026-05-30
### Features
- **Schwung chain knob automation (Sch lanes).** AUTO bank lanes can now target Schwung chain knob assignments (CC 102-109 absolute knob control). In ASSIGN mode, scroll left past AT to reach Sch1–Sch8 — each maps to a chain slot knob mapping. Recording, playback, resting values, step-edit, and delete all work identically to CC lanes. Routed via DSP `pfx_send` on the internal MIDI path — same-buffer delivery, no JS overhead. Requires Schwung 0.9.17.

### Fixes
- **Pads silent on Schwung v0.9.16.** The DSP inbound pad capability sentinel (merged upstream in v0.9.16) caused dAVEBOx to disable the JS live-note path, but the DSP on_midi path could fail to produce sound on stock Schwung. Fixed by moving the dispatch gate from JS to DSP — the JS path now always queues live notes as a fallback, and the DSP suppresses duplicates only when confirmed active.

## [1.0b2] — 2026-05-30
### Performance / UX
- **Lazy drum clip allocation.** Drum clips are now allocated per-track on drum mode entry instead of inline in every track. Default (1 drum track): ~7.5MB vs 60MB previously. No cap, no behavioral change.

### Fixes
- **Empty drum→melodic track conversion now reliably flips pad mode.** Previously, converting an empty drum track to melodic left DSP in drum mode (pads showed melodic layout but right half acted as velocity zones). Fixed by adding a get_param flush barrier for the empty-track path.
- **`delete_held` flag now shares padmap self-heal.** Moved from a separate `t0_delete_held` set_param (vulnerable to onMidiMessage coalescing) into the padmap payload's 35th token, giving it the same tick-based reconciliation as `pad_dispatch_muted`.
- **Incompatible state files prompt before erasing.** When loading a set saved by an older dAVEBOx version, a confirm dialog asks before wiping. "No" exits the module with the file preserved.

## [1.0b] — 2026-05-29
### Features
- **Per-clip / per-lane playback direction (Dir knob on CLIP and DRUM LANE banks).** Four modes: Forward, Backward, Pingpong-forward, Pingpong-backward. Mix directions across drum lanes freely. Bake and Ableton export honor direction — output is a forward-playing clip with notes rearranged to match directional playback.
- **Audio-reverse playback style (alt-mode on Dir knob).** Flip between Step (default) and Audio — in Audio mode, notes play "tape-reversed" during reverse motion. Pingpong + Audio gives fugue-machine-style one-forward + one-reversed cycle per note.
- **NOTE FX Len knob (K5) — non-destructive fixed length.** Per-clip (melodic) or per-lane (drum) fixed pre-gate length. Values: -- (passthrough), .25, .50, .75, 1, 2, 4, 8, 16 steps. Applied at playback, bake, and export.
- **Lgto (Legato) one-shot action on CLIP K8 / DRUM LANE K8.** Destructive rewrite: each note's gate extends to the next note's start. Undoable.
- **HARMONY bank: Hrm3 added, Unison removed.** Three harmony intervals (Hrm1/Hrm2/Hrm3) at ±24 semitones each. Scale-aware when Scale Aware is on.
- **Per-step trig conditions: Iter, Prob (was "Random"), and Ratchet.** Hold a step for the overlay. Iter gates steps on loop-cycle predicates (1/2 through 8/8). Prob rolls per-note at fire time (0–100%). Ratchet retriggers x2–x4 within one step. Applied across live playback, bake, and export.
- **Bank alt-params toggle with jog-click instead of Shift.** Sticky toggle with a flashing arrow icon. Works on CLIP, DELAY, AUTOMATION, DRUM LANE, REPEAT GROOVE, ALL LANES. AUTOMATION alt = ASSIGN mode.
- **CC automation latch overwrite recording.** Turn a knob to engage — continuously overwrites the lane along the playhead. Keeps writing even after you stop turning. Per-loop decimation keeps lanes clean.
- **Melodic pad pressure → aftertouch (Track Config → AftTch).** Off / Poly / Channel modes. Recorded into clips and plays back as interpolated automation.
- **AUTOMATION bank (renamed from CC PARAM).** Per-clip resting values with opt-in "—" floor, 1024-point cap, AT/CC type per knob, step LED gradient, knob-ring status colors, knob acceleration.
- **Clear Automation is undoable.** Undo also restores automation lost during clip clear/copy/cut/bake/row operations.
- **Save states (snapshots).** Up to 16 timestamped snapshots per set via Global Menu. Save, load (with confirm), and overwrite at cap.
- **Export to Ableton Live (.ablbundle).** Full 8-track × 16-scene export with baked clip notes, drum polymeter flatten, route-aware instruments, self-contained samples, multi-cycle bake for randomized/delayed clips, and progress display.
- **Track type conversion carries notes (Track Config → Mode).** Drums↔Keys translates sequenced notes. Empty tracks convert instantly.
- **Co-run improvements.** Edit Slot knobs drive chain params. Edit Synth reliable track landing + clean LED handoff. Co-run exit is Menu; Back navigates within the editor. Drum pad hold works for Move's per-drum editor. Side clip buttons lit solid white in Edit Synth.
- **Move-native knob spin stutters less in Edit Synth.** Shim coalesces CC detents per audio frame.
- **ARP IN bank reset (Delete+jog on ARP IN bank).** Resets all TARP params in one gesture.
- **Arp Steps overlay.** Jog-click on SEQ ARP or ARP IN for persistent step-interval editing (±24 scale degrees per step) + step-vel level editor. Loop+pad sets pattern loop length (1–8). Note/Session exits overlay. Pads suppressed during overlay.
- **Sub-bar launch quant preserves playhead phase.** 1/16, 1/8, 1/4, 1/2 phase-align into the new clip instead of resetting to step 0.
- **CLIP, DRUM LANE, and ALL LANES knob banks rearranged.** Consistent layout across banks. ALL LANES gains K1=Res (all 32 lanes) and K7=Dir (all lanes).
- **Melodic and drum NOTE FX banks rearranged.** Drum NOTE FX now hosts the per-lane MIDI-note editor (K1+K2).
- **Recording blocked in non-Forward direction.** Shows popup; bake first to freeze direction, then record.
- **Copy/cut carries Dir and RvSt to destination.**
- **Loop button blinks at ARP IN rate while track is latched.**
- **Delay Retrig knob (DELAY K7).** New note-on drains in-flight echoes (default ON). Clock Feedback moves to Shift+K1.
- **Shift+side row in Session View queues bar-quantized scene launch.**
- **Hold empty melodic step → auto-activates with lastPlayedNote and opens step edit.**
- **Tap Loop alone (drum track) unlatches all repeats on that track.**

### Fixes
- **Clear Session fully resets all state.** Global settings, mute/solo, snapshots, CC assigns, VelIn, JS state, TARP, channel, pad octave, route, looper all reset to factory defaults.
- **Global params persist on change.** Key, scale, BPM, metronome, etc. save immediately instead of only on suspend.
- **Pad drop self-heal.** Periodic readback detects and corrects stale pad_note_map entries within ~50ms.
- **No stuck notes when changing playback direction during playback.**
- **Fixed Move synth voice corruption after stopping legato playback.** No longer sends CC 123 for ROUTE_MOVE.
- **Bank param resets also reset Dir, RvSt, SqFl.**
- **Session view playing clips blink in sync with pad LEDs.**
- **Step length adjust: pressing end-of-span step now shrinks the note.**
- **OLED param display dismisses immediately on jog release.**
- **NOTE FX Len=.25 no longer plays at double length.**
- **First cycle after clip clear is no longer silent.**
- **Recording-suppressor flags cleared on every clip launch.**
- **REC arm no longer blocked by RvSt=Audio when Dir=Fwd.**
- **Dir display no longer flickers on bank jog onto CLIP.**
- **Capture+drum pad no longer cuts the playing note.**
- **PP/Bwd bake uses rounded step indexing matching live playback.**
- **SEQ ARP / ARP IN Retrig=On no longer stutters on rapid chord changes.**
- **Arp Steps Off removed; Skip renamed Step.**
- **Poly aftertouch works expressively under SEQ ARP and ARP IN.** DSP replays pressure onto every arp voice; fans AT across all sounding pitches.
- **Bank reset also resets SEQ ARP step params in JS mirror.**
- **HARMZ no longer drops notes during chords.** Output pitches are reference-counted per track.
- **Arp Steps overlay no longer fires on drum tracks.**
- **Drum step edit overlay uses 4-column layout matching melodic.**
- **SEQ ARP / ARP IN Arp Gate defaults to 100% (was 50%).**
- **Random mode selector moved to jog-click alt param (K8).**
- **All Lanes bank requires jog-click confirmation on entry.**
- **Step edit length knob refined with breakpoints and grid-snap.**
- **Zombie clips after clear are fixed.** Two independent bugs (stale state_full cache + set_param coalescing) resolved.
- **Pads no longer go silent after modifier toggle.** Self-heal reads back pad_dispatch_muted every 5 ticks.
- **Drum vel-zone pad release sends note-off.**
- **Lowest pad octave no longer ghost-lights three pads.**
- **Perf Mode loop pads no longer leave hanging notes.**
- **Clear Session no longer leaves track 1's pads stale.**
- **Clip/drum-lane copy and cut preserve loop_start.**
- **Selecting a clip with loop_start>0 lands on the correct page.**
- **Clip Clear preserves clip structure (only wipes notes).** Drum clear likewise.
- **Drum lane Reset also resets per-lane Rpt groove.**
- **Focused clip plays by default on transport start.** Also on track switch and after clip clear.
- **Press-Record during playback arms at next bar boundary (adaptive clips).**
- **Per-track active param bank persists across track switches and reload.**
- **Length and loop-window changes re-anchor playhead phase.**
- **Loop Double works on clips with loop_start>0.**
- **Drum lane Delete+pad does notes-only clear (preserves structure).**
- **Drum repeats fire through track mute when pad is held.**
- **Shift+pad no longer triggers Rpt1/Rpt2 latch on prior track.**
- **Record-arming during play no longer drifts TARP timing.**
- **Rpt1+Rpt2 rates persist across reload.**
- **Input Quantize is per-track and snaps to actual rate value.** Melodic tracks gain per-track InQ on CLIP K6.
- **Transport Stop unlatches TARP and Rpt1/Rpt2 across all tracks.**
- **TARP latch survives track/route/channel changes.**
- **Modal pad-interception fixed.** Pads no longer leak into synth during dialogs and modifiers on patched Schwung.
- **VelIn applies to live pad monitoring on patched Schwung.** TARP output also respects VelIn.
- **Velocity zone presses audible again on patched Schwung.**
- **Recording into clips with non-zero loop start lands inside the window.**
- **ARP IN first note after count-in records on step 0.**
- **Delete+Play clears every latch across all tracks regardless of transport state.**
- **Per-track octave shift persists per-set.**
- **Stuck live notes when touching Arp Steps knob mid-hold fixed.**
- **SEQ ARP Steps Mode takes effect on first turn.**
- **Clear Session resets drum tracks back to Keys (except track 1).**
- **Drum→Keys Mode flip actually takes effect on DSP.**
- **Mute silences TARP/Rpt1/Rpt2 emission while keeping latch alive.**
- **Co-run exit reclaims LEDs and clears modifiers.**
- **Bank reset / param reset actually reaches DSP.** All reset sites routed through deferred drain.
- **Coalescing remediation across copy/cut/clear/snapshot/scene/merge gestures.**
- **Various display fixes:** active drum lane shows empty correctly, triplet ARP rate labels visible, CC PARAM OLED values clear after automation clear, bank reset routing fixed for drum CC PARAM, note-duration step LEDs match played length, track overview header drops Tr# indicator, AUTOMATION bank auto-dismisses, Shift hint overlay drops on compound modifier, drum-lane step copy flashes source.
- **Hot-path debug probes gated behind compile flag.** Prevents RT thread throttle from forced file writes.
- **Volume knob (CC 79) no longer stutters playback.** Dropped at top of MIDI handler.
- **Shift+Step3 co-run shortcut is Track View only.**
- **Side clip button focuses clip on press, not at legato boundary.**
- **Save/Quit/Shift+Back no longer drops DSP save under coalescing.**
- **Drum lane Cut gesture (Copy+Shift+lane+lane) now works.**
- **Hanging notes during fast or polyphonic live play fixed.** Same-tick off+on pairs drain in arrival order.
- **No more stuck notes when changing octave while holding a note.**

### Performance / UX
- **Pad input rewired to audio thread on patched Schwung.** Better chord cohesion and lower input latency.
- **ROUTE_EXTERNAL latency jitter ~7.6× tighter on patched Schwung.** Stddev 10.25ms → 1.35ms.
- **Count-in capture window tightened to last 1/8 note.**
- **ARP IN plays through count-in.** ARP IN with Sync=Off captures during count-in pre-roll.
- **Drum repeats during count-in + Repeat Sync toggle + true sub-step recording.**
- **Co-run drum pads invert into track colors.** Selected lane = track color, others = white.
- **Shift+bottom-row pads: active track is solid bright, others blink dim.**
- **New splash art pool.** 7 new frames added, 2 dropped.
- **Nudge knob folded onto Shift+K2 (Shft).**
- **Loop and Capture buttons have visible dim grey ambient.**
- **Shift+jog in Session View steps the active track.**
- **Various knob speed improvements:** NoteFX Gate 4×, Quantize 2×, melodic step-edit pitch, CC bank acceleration.
- **Step-entry velocity rule unified** across drum and melodic tracks.
- **Track-bank OLED returns to overview faster (~1s instead of ~4s).**
- **Recording CC automation no longer fights the knob.**
- **Drum repeats respond to pad pressure.**
- **Held CC step shows recorded value, not live knob value.**
- **Drum Shift+Delete+Jog popup reads "LANE PARAMS RESET".**
- **Alt-mode label "RvSt" renamed to "Rvrs".**
- **Perf View knob LEDs show looper state.** Touch toggles looper.
- **Sample tap in Session View is no-op (was incorrectly opening bake dialog).**

### Documentation
- **Full revision and reorganization of MANUAL.md.** Six parts, consolidated chapters, standardized terminology, verified all claims against source.

## [0.4.0] — 2026-05-15
### Fixes
- **Input Quantize / Step Grid Misalignment:** Drum recording now uses midpoint-rounding step windows; Input Quantize correctly rounds to the nearest step boundary across all live recording paths.

## [0.3.7] — 2026-05-14
### Fixes
- **Chord-press monitoring now plays every note.** Simultaneous pad presses no longer drop notes due to set_param coalescing. Live notes batch into a single payload per tick.
- **Drum chord recording lands in one DSP buffer.** Batched into single payload per tick instead of one entry per tick.
- **Drum recording inline-monitors via DSP.** Eliminates duplicate set_param collision on armed-track chord recordings.

## [0.3.6] — 2026-05-14
### Documentation
- **MANUAL.md crash disclaimers softened for Schwung v0.9.13.** External MIDI routing no longer crashes on current Schwung.

### Fixes
- **Drum clip switches keep polyrhythmic lanes in phase.** All launch sites anchor each lane's playhead to its expected position based on elapsed time.

### Features
- **Loop window set via Loop+step range gesture.** Hold Loop + hold a page step + tap another to set loop window. Non-destructive — notes outside window preserved.

### Performance / UX
- **ARP IN latch visual feedback.** Latched pad LEDs stay lit white; Arp chip inverts on OLED.
- **Loop clears latched ARP IN notes without dropping Ltch.**
- **Re-press a latched note to drop it (accumulate mode).**

## [0.3.5] — 2026-05-13
### Features
- **Shift+Step 3 — Edit Synth / Edit Slot shortcut.** One-press co-run entry for the active track's route type.
- **Swing applies to ARP IN, SEQ ARP, and drum repeats with transport stopped.** Live one-shot taps always bypass swing.

### Performance / UX
- **Note/Session button LED blinks during co-run** to advertise exit gesture.

### Fixes
- **Drum step + pad LEDs refresh when switching clips from Session View while stopped.**
- **Drum Rpt1/Rpt2 recording captures sub-step fires.** Multiple hits per step with InQ Off now recorded.
- **Hanging notes during ARP IN chord-changing with swing resolved.** Echoes and deferred offs get per-event swing scheduling.

## [0.3.0] — 2026-05-12
### Features
- **Euclidean rhythm knob (DRUM LANE K4).** Per-lane Bjorklund hit-count placer that diffs against existing hits.
- **Capture + scene-row button** snapshots current performance into a scene row.
- **Edit Slot... co-run** — hands OLED + jog to Schwung's chain editor (capability-gated to patched Schwung).
- **Edit Synth... co-run** — hands OLED + jog to Move's native device editor (capability-gated to patched Schwung).

### Performance / UX
- **Perf View knob LEDs show looper state; touch toggles looper.**
- **Unified step-entry velocity rule** across drum and melodic tracks.
- **Nudge knob folded onto Shift+K2.** Frees a knob slot on CLIP/DRUM LANE/ALL LANES.
- **Loop and Capture buttons have visible ambient lighting.**
- **Shift+jog in Session View steps active track.**
- **Various knob speed improvements** (Gate 4×, Quantize 2×, step-edit pitch).

### Fixes
- **Shift hint overlay drops on compound modifier press.**
- **Drum-lane step copy flashes source step.**
- **Hanging notes during fast polyphonic live play fixed.**
- **Step-entry velocity consistency** — tapping a step writes fixed vel 100 instead of inheriting stale pad velocity.
- **Shift+Step menu shortcuts target by label** instead of hardcoded indices.
- **MIDI DLY Lvl defaults to 127 on all drum lanes** (was 0 on tracks 1–7).
- **Panic sweeps all 16 MIDI channels on every active route.**

### Persistence
- UI sidecar v=4→v=6: adds per-track Euclidean counts, drumVelZoneArmed, and Schwung-slot assignment.

## [0.2.0] — 2026-05-11
### Features
- Loop+Play restarts playback from the visible page
- Perf Mode preset mods are individually toggleable; Latch is purely a mode switch
- Perf Mode OLED redesigned with active mod list and footer chips
- Top-row Perf pad LEDs are static (no flashing)

### Fixes
- Removed rec-arm count-in OLED takeover
- Melodic live-recording note-off step-array mirror uses correct rounding

### Performance / UX
- Action popup duration halved (~520ms)
- Step hold-to-save duration shortened (~750ms)

### Documentation
- MANUAL.md rewritten as comprehensive user guide
- Performance Mode appendix updated

## [0.1.0] — 2026-05-11

Initial public release.

### Features
- 8 tracks (melodic + drum), 16 clips per track, up to 256 steps per clip
- Per-clip effects chain: TARP, NOTE FX, HARMZ, MIDI DLY, SEQ ARP
- Bake — render the effects chain back into note data (multi-loop, wrap mode)
- Live recording with count-in pre-roll
- 32-lane drum tracks with per-lane loop length, effects, and note repeat
- Scale-aware everything: pitch random, harmonizer, delay, manual transposition
- Performance Mode: 24 mods × 16 snapshot slots, hold/lock/latch interaction
- 8 CC automation lanes per track, per-clip at 1/32 resolution
- Mute/solo with 16 snapshot slots
- Copy/paste for notes, steps, clips, and scenes
- Per-track MIDI channel and routing (Move · Schwung · External)
- Suspend/resume — background playback while browsing Move's native UI
- Set state inheritance — duplicate a Move set, inherit dAVEBOx state by name

### Known limitations
- External MIDI input into Move-routed tracks crashes Move
- Suspending while a Move-routed drum track is playing can crash Move
- Volume knob briefly interrupts MIDI output
- Powering Move off from within dAVEBOx causes a brief hang
