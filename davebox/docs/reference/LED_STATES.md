# LED states — the map

What every LED on the surface means in dAVEBOx, what Move's own firmware does with the same
LEDs, and what the hardware can do that we do not yet use. This is the sheet to define and
refine LED states against. Read against the code it names; the code wins when they differ.

Supersedes `LED_COLOR_REFERENCE.md` (2026-08-08), which pre-dates the bank map, the picker, the
automation lanes, the Pad Mode layouts and the hardware animations.

Written 2026-10-24 from `ui_leds.mjs`, `ui_tick.mjs` (the button block), `ui_scene.mjs`,
`ui_knob_leds.mjs`, `ui_constants.mjs`, `src/shared/constants.mjs`, `src/shared/input_filter.mjs`,
and a MIDI_OUT capture of Move native on the device (stock Schwung's test stream, same day).

---

## 1. The hardware's vocabulary

Every LED is addressed by one MIDI message on cable 0: **pads and steps by note-on** (pads 68–99,
steps 16–31), **buttons, step icons and knob rings by CC** (icons 16–31, clip buttons 40–43,
transport 85/86/118, knob rings 71–78, master 79, and the rest). The data byte is a palette index
for an RGB LED and a brightness for a white one.

### 1.1 The status channel is the animation

The low nibble of the status byte picks the animation, as on Push 2 (Ableton's published Push 2
MIDI interface, "LED animation"). Nothing in the host rewrites it: the LED queue keys a packet by
its note or CC and sends the status it was given, so a JS writer passes the channel and the whole
path carries it (`setLED(note, colour, force, anim)` / `setButtonLED(cc, colour, force, anim)` in
`src/shared/input_filter.mjs`; `LED_*` in `ui_constants.mjs`).

| channel | kind | pace |
|---|---|---|
| 0 | set at once (also stops a running animation) | — |
| 1 · 2 · 3 · 4 · 5 | **fade** from the colour the LED shows to the new one, then stop | 24th · 16th · 8th · quarter · half note |
| 6 · 7 · 8 · 9 · 10 | **pulse** between the colour it shows and the new one, repeating | same five |
| 11 · 12 · 13 · 14 · 15 | **blink** between the two, repeating | same five |

The pace is in **MIDI clock**: the controller advances every animation by a 24th of a beat per
`0xF8` it receives on cable 0, resets the phase on Start / Continue, keeps the last tempo after
Stop, and runs at 120 BPM if it has never seen a Start. Move's firmware feeds it (`FA`, `F8` ×24
per beat, `FC`) while its transport runs. In a dAVEBOx session Move's transport is stopped, so
**dAVEBOx sends the clock itself** from the sequencer's position (`ui_led_clock.mjs`; not while
dAVEBOx follows Move's clock, when Move's own is on the wire). Device-measured 2026-10-24: Start,
149 clocks in 1057 frames ≈ 121.5 BPM at a 120 BPM project, Stop.

A write of the SAME colour on channels 1–15 restarts the animation; the plain colour on channel 0
stops a pulse or blink. The cache in `input_filter.mjs` knows this: a fade is remembered as the
colour it ends on (the painter's next plain frame is a repeat, so the fade is not cut), a pulse or
blink as running (the plain colour IS sent, because it stops it).

✅ **Push 2's table IS Move's table, channel for channel** — confirmed by eye 2026-10-24 with the
atlas (§5) under a 30 BPM LED clock: 1–5 ease once from the old colour to the new and stay (pad 5
about four seconds at 30 BPM), 6–10 pulse smoothly, 11–15 snap. At a normal tempo the fast pulses
read as blinks and the fast blinks as pulses, so judge them under a slow clock. Move's firmware
writes a playing clip on channel 9 and a queued clip on channel 14 (§2); a released pad also goes
out on channel 9 but visibly does not animate (the colour is already there, so there is nothing to
pulse between).

📌 **Move's own smooth blink = pulse at a quarter note, channel 9, at song tempo** — a half-second
breathe at 120 BPM, which is what Josh picked out of the atlas as "the Move look".

📌 **Pads never animate.** dAVEBOx's playing-surface pads change colour at once on note on and note
off, as Move's do, and that stays. The animations are for the states §4 blinks in software today,
so a dAVEBOx blink is as smooth as Move's. **The step-button icons (CC 16–31) never animate
either** (Josh, 2026-10-25): they are hints and status lights, written plain on channel 0, and any
change to how they are repainted keeps them that way.

### 1.2 The RGB SysEx, for the LEDs the palette cannot name

`F0 00 21 1D 01 01 3B <ch<<4> <idx> rl rh gl gh bl bh F7` — a direct RGB for one LED, each
colour an 8-bit value split 7-bit low / high. `<ch>` is the namespace of `<idx>`: `0` a NOTE
(pads, steps), `1` a CC (buttons, rings). Latest write wins between a palette write and an RGB
write to the same LED. Move paints the **knob rings** (71–79, r=g=b: a white brightness) and the
**clip buttons** (40–43, the track colours) this way, never pads or steps. dAVEBOx uses the
palette for everything and two scratch palette entries (`setPaletteEntryRGB` + reapply `…05 F7`):
index 60 = (32,32,32) for Loop's ambient (Loop renders palette colours brighter than its
neighbours), and the CC PARAM bank's per-knob brightness entries (`CC_SCRATCH_PALETTE_BASE` 51–58).

### 1.3 The palette

`src/shared/constants.mjs` is the table (upstream Schwung v1.0.0's measurement, 128 entries):
`0` off · `120` White · `122` OffWhite #CCCCCC · `118` LightGrey #595959 · `123` DarkGrey3
#404040 · `124` DarkGrey #141414 · `1` BrightRed · `127` Red (primary) · `126` Green (primary) ·
`125` Blue (primary) · `8` BrightYellow · `7` VividYellow · `29` Mustard · `3` BrightOrange ·
`16` Azure · `17` RoyalBlue · `25` BrightPink · `23` NeonPink · `26` LightMagenta · `14`
Cyan-Teal · dims at 65–116 (two per hue, "dim" and "dark"), pastels 36–64. Move's own repaint of
a Note-view grid used `10`, `84`, `123`, `122`, `25`, `19`, `18`; a pressed pad `126`, released
`122`.

Track colours (`TRACK_COLORS` / `TRACK_DIM_COLORS`, `ui_constants.mjs`): Red/66, Blue/DarkBlue,
BrightGreen/DarkOlive, Green/86, BrightPink/DeepWine, RoyalBlue/96, Mustard/70, DeepGreen/86.

---

## 2. What Move native does (measured 2026-10-24, stock Schwung, Move owns the surface)

| moment | what Move wrote |
|---|---|
| pad pressed (Note view) | `note_on ch0 pad 126` at the press |
| pad released | `note_on ch0 pad 122`, then `note_on ch9 pad <track colour>` — start colour on 0, target on the animation channel (the Push 2 two-step) |
| another pad pressed while one is lit | first pad straight to its colour on ch0, the new one 126 |
| clip queued (Session view, playing) | `ch0 pad 126` then **`ch14` pad 122** (blink @ quarter) |
| clip launched at the quantum | `ch0 pad 102` then **`ch9` pad 122** (pulse @ quarter); its scene button likewise |
| clip no longer playing | `note_off ch9 pad` — off, on the animation channel |
| Play | CC 85: 122 at the press, 124 after ~15 frames, 126 once running (ch0 only) |
| Stop | CC 85 122 then 124 |
| transport | `FA` at Play, `F8` ×24/beat, `FC` at Stop — on cable 0, for the LED controller |
| Note ↔ Session view | ~90 packets in ~5 frames: steps 16–31 note-off / 124, every pad, knob rings by RGB SysEx (grey ramps), then a `…08 7F 7F F7` SysEx |
| track button tap | CC 40–43 by RGB SysEx (track colours), the grid repainted on ch0 |
| Shift held | icons 16–31 CC 127/0 for the shortcuts, steps 19/27/28/30/31 note-off; released: 124 |
| Record (stopped) | no LED write at the press (it starts the transport; the LED followed Play's) |

So Move uses the hardware for every motion: no software blink anywhere in these captures. Its
"one shot" for a hit pad and its "playing" pulse are the same channel.

---

## 3. dAVEBOx — the state map

Legend: **colour** · *motion* (sw = software, repainted from `S.clockMs` or the transport flash
flags every tick; hw = the hardware animation of §1.1). Where a rule names a bank it is the
active track's bank. Everything is in `ui_leds.mjs` unless a file is named.

### 3.1 Pads 68–99, Track View, melodic track (`updateTrackLEDs`)

| state | colour | motion |
|---|---|---|
| root of the key | track colour | — |
| other in-scale pad | DarkGrey | — |
| chromatic layout, out of scale | off | — |
| Piano layout | root track colour · in-scale LightGrey · out LightGrey→DarkGrey | — |
| split zone B | the two colours swapped (root DarkGrey, rest track colour) | — |
| sounding (played, sequenced, a held step's note, an ARP IN latch) | White | — |
| stops sounding | its resting colour, at once | — (never animated; see §1) |
| Chord layout | slots / modifiers / strum rows by kind — `chordPadColor`: tonic Cyan, subdominant Mustard, dominant BrightPink; sounding White | — |
| Custom layout | empty chord pad off, stored Cyan, held White — `customPadColor` | — |
| out of range / unmapped | off | — |
| transpose preview | colours against the candidate key | — |
| MIDI browser (`miPadColors`) | the browser's own colours where it owns a pad | — |

### 3.2 Pads, Track View, drum track

Left 4×4 = lanes, right 4×4 = velocity zones (or the repeat editors).

| state | colour | motion |
|---|---|---|
| lane sounding | White | — |
| lane just hit (`drumLaneFlashTick`, 2×POLL_INTERVAL ticks) | track colour (DarkGrey if muted) | sw one-shot |
| lane muted / soloed-out | off | — |
| selected lane, with hits / empty | White / DarkGrey | — |
| other lane with hits | track colour (dim while playing) | — |
| other lane empty | dim track colour | — |
| DRUM LANE bank (0) look | selected lane keeps the track colour (dim if empty), the rest LightGrey (hits) / DarkGrey | — |
| copy source lane | White ↔ off | sw 220 ms |
| Rpt1 latched lane / Rpt2 latched or held lane | Cyan | — |
| velocity zone selected (or the held step's) | White | — |
| other zones | DarkGrey (dim track colour on bank 0) | — |
| Rpt1 editor: rate pad held / others | White / DarkGrey; gate mask on = track colour, off, past length DarkGrey | — |
| Rpt2 editor: selected rate / others | Cyan / PurpleBlue; gate mask as Rpt1 | — |

### 3.3 Pads, Session View (`updateSessionLEDs`, rows = scenes from `S.sceneRow`)

| clip state | colour | motion |
|---|---|---|
| empty, not the active clip / active | off / DarkGrey | — |
| has content, idle | dim track colour | — |
| playing | dim → track colour | **hw pulse @ quarter (ch 9)** — Move's own playing-clip write (2026-10-24) |
| playing, stop pending at page end | dim ↔ off | sw, sixteenth |
| queued, transport running | dim → track colour | **hw blink @ eighth (ch 13)** — Move writes a quarter (ch 14); an eighth so it reads apart from the quarter pulse (Josh, 2026-10-24) |
| queued, transport stopped | solid track colour | — |
| will relaunch | track colour | — |
| copy source (clip / row / drum clip) | White ↔ off | sw 220 ms |
| merge / capture placement target (track's empty clips) | LightGrey ↔ off | sw 220 ms |
| track beyond NUM_TRACKS | off | — |
| Tap Tempo open | all DarkGrey; a tap flashes DarkBlue for `TAP_TEMPO_FLASH_MS` | sw one-shot |

### 3.4 Pads, overlays that own the whole grid

| surface | rule |
|---|---|
| **Bank map** (`paintBankMapPads`, jog held) | left 4×4 by column: Cyan, Violet, VividYellow, BrightOrange; CONFIG / MIX / INST pads the track colour; the bank you are on White; a bank the track lacks off; right 4×4 modules: instrument track colour, MIDI FX Cyan, audio FX BrightOrange; the pad waiting for the jog's release White. Session map: VOLUME VividYellow, PAN Cyan, SEND A/B Violet, the active mode White, FX buses BrightOrange |
| **Project picker** (`paintProjectPickerLEDs`) | project in its own colour (`PROJECT_COLORS`, default Blue); the loaded one solid White; **the cursor pulses off → its colour, and the cursor on the loaded one pulses colour → White — hw pulse @ quarter (ch 9), 2026-10-24**; delete-confirm Red ↔ DeepRed; copy source Cyan ↔ DarkGrey; broken DeepRed (↔ off under the cursor); create target White ↔ off; colour-pick preview candidate ↔ off — those sw 400 ms period; steps + icons off; buttons: Copy/Delete 16, Note/Session 16 and Back White if a project is loaded, else off |
| **Arp Steps editor** (SEQ ARP 4 / TRACK ARP 5, `stepIntervalMode`) | column = step (loop length 1–8), rows = velocity level: top lit row track colour, below dim, rest off |
| **Performance Mode** (`updatePerfModeLEDs`) | R0 rate pads White active / DarkGrey; Hold 73 Red / DeepRed; Sync 74 Green / DeepGreen; Latch 75 track-3 bright / dim; R1 pitch mods White / DeepMagenta; R2 vel-gate White / Mustard; R3 wild White / DarkBlue; steps 16–31: recalled slot White, stored PurpleBlue, empty LightGrey |
| **Snapshot layer** (Capture held, `devSnapLedFor`) | filled Cyan, white White, dim DarkGrey, empty off — on the steps |
| **Project load** | everything dark from the press until the handover |

### 3.5 Step buttons 16–31 (`updateStepLEDs`)

| state | colour | motion |
|---|---|---|
| outside the loop window | DarkGrey | — |
| active step | track colour | — |
| playhead (playing) | White | — |
| empty step, beat marker on every 4th (if enabled) | dim track colour | — |
| empty step otherwise | off | — |
| held step's gate span | 56 (the "tail" index) | — |
| held lock's extend range | BrightOrange (`EXTEND_LED`) | — |
| Dur knob touched on a held step | full steps White, partial DarkGrey | — |
| step-record cursor | White ↔ the step's state | sw 110 ms |
| step-record tie tail | 56 | — |
| copy source step | White ↔ off | sw 220 ms |
| automation lane selected (`paintAutoLane`) | the lane's values as the gradient `AUTO_GRAD` (DeepBrownYellow → Mustard → BrightOrange → Tan → 67 → Red); a point blinks off; outside the cycle DarkGrey; playhead White; held step White; values unread: points White ↔ off | sw 200 on / 100 off |
| automation lane's locks, on the grid (`paintAutoBankLit`) | White over the step | sw 200/100 |
| Shift held (no other modifier) | shortcut steps LightGrey, rest off | — |
| Loop held — pages view | page with notes track colour ↔ off, empty page track colour, outside off, held start page White | sw: sixteenth when playing, 220 ms stopped |
| **save flash** (`stepSaveFlashOn`) | Green ↔ off, the whole row | sw 106 ms phases, 425 ms — two blinks |
| MIDI browser | all DarkGrey | — |
| bank map (track) | Steps 1–8 = tracks in their colour, the active one colour ↔ White; 9–16 off | sw 300/150 |
| Session View (`updateSceneMapLEDs`, ui_scene) | scene with content White (playing: White ↔ off, eighth); the active scene `LED_STEP_CURSOR` 127 (↔ off while playing); empty off; Mute held = snapshot slots VividYellow / DarkGrey | sw transport eighth |

### 3.6 Step icons CC 16–31 (`updateTrackLEDs`)

Shift held: the shortcut icons LightGrey (1, 5–7, 9 shared; 8, 10, 11 (not drum), 15, 16 in
Track View). Shift up: STATUS — icon 6 while the metronome sounds, 10 with fixed velocity, 11
with the track arp on. Re-sent with force every POLL_INTERVAL (Move writes these through).

### 3.7 Clip / scene buttons CC 40–43

Track View: playing clip track ↔ dim (eighth); focused and will-relaunch while playing track ↔
dim (sw 900 ms); focused track colour; empty DarkGrey; other content dim. Session View: a press
flashes White for `SCENE_BTN_FLASH_MS`. Copy source White ↔ off (220 ms). Co-run: dark (Move
paints them, by RGB SysEx).

### 3.8 Transport and function buttons (`ui_tick.mjs`, the button block)

| button | rule |
|---|---|
**Since 2026-10-24 every blinking button state is a hardware animation** (Josh: *"do the 1/4 pulse on
… any function buttons that blink"*): a state that holds **pulses @ quarter (ch 9)** between off and
the button's colour; Rec's two "about to happen at the bar" flashes are the **eighth blink (ch 13)**
so urgency still reads as urgency. Each is written once per state change (`setButtonLEDAnim`), and the
Shift hints are decided inside each button's rule rather than painted over it, so nothing restarts.

| button | rule |
|---|---|
| Play 85 | Green playing / off |
| Rec 86 | armed Red; stop scheduled or page pending **Red, hw blink @ 8th**; merge notice **Red, hw blink @ 8th**; merge armed Red, capturing Green; step record White; co-run off (forced); Shift held while merge idle and not armed **Red, hw pulse** |
| Sample 118 | DarkGrey (bake, always available) |
| Back 51 | White where a tap acts (`backTapWouldAct`), else off; off in co-run |
| Loop 58 | locked Perf Mode / latched Loop view / drum repeat latched: **White, hw pulse**; ARP IN latched: track colour on each fired note (sw, note-synced); perf latch mode VividYellow; else scratch 60 (dim) |
| Capture 52 | armed **White, hw pulse**, else DarkGrey |
| Mute 88 | muted 124; soloed **124, hw pulse**; else 16 |
| Shift 49, Note/Session 50, Undo 56, Delete 119, Copy 60, Up/Down 55/54, Left/Right 63/62 | 16 ("available"); Left/Right off in Session View; Note/Session White with the global menu open, **16 hw pulse with Tap Tempo open**, 16 forced in Move co-run |
| Shift held | Note/Session, Undo, Copy, Loop (Session) / Mute (Track) **16, hw pulse** |

### 3.9 Knob rings CC 71–78 (`ui_knob_leds.mjs` + `updateTrackLEDs`)

Param banks: the ring rides the value — knobs 1–4 a white ramp, 5–8 amber; a bound knob never
dark (the floor says "this turns something"); 0 = nothing bound. Active automation on the knob's
target blinks it off every 440 ms (sw); Mute / Delete held shows the state: active Red, muted
White, none off. Session View: the track's colour, soloed colour ↔ off (220 ms), muted off, an
active strip lane blinks (440 ms). Conduct banks: track colours (the ring is an address). Drum
RPT GROOVE (5): White where the step is dirty. Perf lock: track colour where the looper is on.
Sound mode's own pages: Red active / White muted / off (`ui_sound.mjs`).

---

## 4. Motions in use, and what they could become

Every motion dAVEBOx shows today is painted in software: a colour recomputed each tick from
`S.clockMs` or a transport flag, re-sent when it changes. Periods in use: **75, 106, 110, 150/300,
200/100, 220, 400, 440, 900 ms**, plus the transport's **eighth / sixteenth** flags and `flashAtRate(48)`.
Each costs a packet per LED per toggle and is phase-free (two blinking things are never in step
unless they share a divisor). The hardware offers, per LED, one packet: fade / pulse / blink at a
24th, 16th, 8th, quarter or half note of dAVEBOx's tempo, all in phase with each other and with
the music since the clock is the sequencer's.

Candidates, by how directly they map (decide per state; Josh 2026-10-24: *"do 1 and 2"* — the two Session View clip states; the rest stay software until he says):

| today | hardware equivalent | note |
|---|---|---|
| ✅ playing clip pad (Session View) | **pulse @ quarter** (ch 9) between dim and bright | BUILT 2026-10-24 — Move's own write. Track View's playing-clip blink and the clip buttons are still software |
| ✅ queued clip pad (Session View), transport running | **blink @ eighth** (ch 13) | BUILT 2026-10-24 — Move writes a quarter; a quarter blink beside a quarter pulse was hard to tell apart on the device |
| ✅ project picker cursor (own colour ↔ off, 400 ms) | **pulse @ quarter** (ch 9) off → colour; on the loaded project colour → White | BUILT 2026-10-24 |
| ✅ every blinking function button (Loop latched, Capture armed, Mute soloed, Tap Tempo exit, the Shift hints, Rec's Shift hint) | **pulse @ quarter** (ch 9) off → colour | BUILT 2026-10-24 |
| ✅ Rec stop-scheduled / page-pending (75 ms) and merge notice (110 ms) | **blink @ 8th** (ch 13) off → Red | BUILT 2026-10-24 — kept faster than the pulses so it still reads as urgent |
| copy source, 220 ms | blink @ 8th (ch 13) at 120 BPM ≈ 250 ms | becomes tempo-relative |
| automation point / lock blink, 200/100 | blink @ 8th | loses the 2:1 duty; is that a feature? |
| save flash, two blinks | two writes: blink @ 8th, then the plain colour after 425 ms | or leave as is |
| Rec pending, 75 ms | blink @ 24th (ch 11) ≈ 83 ms | |
| Loop latched, `flashAtRate(48)` | blink @ half (ch 15) | already transport-synced |
| knob ring automation, 440 ms | blink @ quarter (ch 14) | |
| bank-map active track 300/150 | blink @ 8th | loses 2:1 duty |
| scene button press flash, Tap Tempo tap | **fade** from White to the resting colour (ch 1–3) | one packet, no timer |
| drum lane hit flash | fade @ 16th from the track colour | one packet, no `drumLaneFlashTick` |
| playhead step | fade the trailing step back (ch 1) for a comet tail | Move's steps repaint plain |
| track switch / view switch repaint | every changed pad as a fade @ 16th | a crossfade of the whole grid for the cost of the same packets |

Two constraints to keep in mind. A hardware blink's duty is 50 % and its phase is the song's, so
a state that relies on a 2:1 on/off (the automation point) or on being out of step with another
blink reads differently. And the cache rule (§1.1): a painter that keeps re-sending the same
(colour, channel) is fine — it is a repeat — but one that alternates two colours on an animation
channel restarts the animation every tick.

---

## 5. The channel atlas (one look, for the table in §1.1)

`davebox/tools/led_atlas_device.py` (copy it to the Move, run it there) writes, in a live session, White on channel 0
then BrightRed on channel k+1 to pad 68+k for k = 0..14, and the same two colours on channel 0 to
pad 83. One look names, per pad, whether it faded once, pulses or blinks, and roughly how fast —
and pad 83 is the control that must simply snap. Bottom row left→right = channels 1–8, second row
= 9–15, pad 83 = channel 0. If the result disagrees with §1.1, change the constants in
`ui_constants.mjs` (`LED_FADE_*` / `LED_PULSE_*` / `LED_BLINK_*`) and this file; nothing else.
