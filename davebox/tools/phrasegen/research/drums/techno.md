# TECHNO — drums

Conventions as in `../house.md`: 16 steps per bar, step 1 = downbeat, 1/5/9/13 = beats, 3/7/11/15 =
8th off-beats, even steps = 16th off-beats, 96 PPQN (24 ticks per 16th). `[Kn]` = source in
`SOURCES.md` (this folder); `[Sn]` = source in `../SOURCES.md`. **(proposal)** = our number, not a
source's. ⚠ **No open techno corpus exists** (GMD has no techno style; see `SOURCES.md`), so everything
here comes from producer guides. Nothing below is measured. Treat the `verify.md` targets as rules.

## Tempo and swing

- Range 120–150 BPM, "a repetitive four on the floor beat" [K1]. The per-substyle guides give:
  - Detroit / Jeff Mills 909 roll: 137 [K10][K11]
  - Berlin: "around 120bpm is a good starting point" [K9]
  - Thumping: 130–135 [K2]
  - Grinding analogue: 125–132 [K3]
  - Dark rumble: 128–135 [K5]
  - Minimal: 125–130 [K6]
  - Dub techno: 145 as one example [K7]
  - 90s hard: 147 [K8]
  - Modern hard techno: 145–160, "most peak-time … 150 to 155" [K12]

  **Default (proposal):** 128–134, with a hard sub-family at 145–155.
- **Swing is a substyle switch, not a constant:**
  - Straight or nearly straight: Berlin is "very grid-based and not much focused on swing" [K9]; dub 0 % [K7]; dark rumble 50–54 % [K5]; 90s hard 50 % [K8].
  - Moderate: 50–60 % [K2]; 50–65 % [K3].
  - Heavy, for minimal: 55–70 % for a "jacking feel" [K6].

  **(proposal)** Even-16th delay 0–3 ticks by default, 4–8 ticks for the minimal family only.
  The delay mapping is `../basics.md`.

## KICK

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main kick | **always** | – | – | ghost² | **always** | – | – | – | **always** | – | – | ghost² | **always** | – | rare¹ | rare¹ |

- Kick on steps 1, 5, 9 and 13 [K1][K14][K15]. The four beats never drop out inside a groove phrase.
  In a breakdown the whole kit drops out (trance does the same [K21]).
- ¹ Phrase-end extra kicks: "a simple 4-bar KICK loop … adding an extra kick or two at the end of
  the cycle" [K9]; "hits between beats 4-1 every few bars" [K15].
  **(proposal)** Put them on step 15 or 16 of the last bar of a 4-bar phrase, in ≤ 1 bar per 4.
- ² Ghost kicks: "ghost kick in before each beats two and four … pendulum effect" = steps 4 and 12
  at low velocity [K4]. Also "two ghost hits in the second bar", shifted off the grid [K3].
- **Velocity:**
  - Main kicks are flat, at full level. A drum machine has one accent level.
  - Ghosts **(proposal)** 30–50.
  - **(proposal)** Main 110–127, with ±3 jitter at most. A techno kick lane with ghost-like
    variation on the beats is wrong.
- **Length:** the kick is a 909 [K16].
  - Main kick **(proposal)** 12–24 ticks, the trigger only.
  - "Rumble" styles add a second long kick, sidechained to the main one [K5][K12].
    **(proposal)** Model that as a separate lane, not as a long gate here.

## SNARE / CLAP / RIM

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clap (default family) | – | – | – | – | **often** | – | – | – | – | – | – | – | **often** | – | – | ghost¹ |
| "thumping" family | – | some | some | – | – | some | some | – | – | some | some | – | – | some | some | – |

- **Default:** clap or snare on steps 5 and 13 [K9][K6][K8][K14]. A rim can copy the clap pattern
  [K8].
- ¹ "Ghost snare hits immediately before each new bar" = step 16 at low velocity [K6].
- **Anti-default family:** "snare hits on off beats and 16ths rather than on the two and four",
  with small velocity variation [K2]. Claps can also move around a 2-bar sequence with lower-velocity
  ghosts [K4].
  **(proposal)** Keep this to ≤ 30 % of techno clap phrases. It is what separates techno from house
  claps.
- **Minimal:** "super low-velocity percussion (rimshots … filtered claps) between main beats" [K17].
  Hood: "Adding an offbeat, altering the velocity minimally … are enough" [K18].
- **Velocity (proposal):**
  - Backbeat claps 100–120.
  - Ghosts and off-grid hits 35–60.
  - The moving-clap family 60–100 with ±10.
- **Length (proposal):** clap 24–48 ticks.

## HAT (new for techno)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| off-beat (open) | – | – | **always** | – | – | – | **always** | – | – | – | **always** | – | – | – | **always** | – |
| closed 16ths (variant) | some | often | – | often | some | often | – | often | some | often | – | often | some | often | – | often |

- **Off-beat open hat:** "offbeat open hi-hat notes between each kick" [K10]; the same in dub
  techno [K7] and 90s hard [K8].
- **Closed 16ths:** the second layer, "velocity set to no more than 70%" [K5]; humanised 16ths
  without choke [K2].
- **Anti-house detail.** One guide programs "open hat on second and fourth quarter beats with reduced
  velocity (~50%)" [K4]. It is a legitimate techno variant, rare **(proposal ≤ 10 %)**.
- **Velocity:**
  - The general rule puts off-beat strokes below on-beat strokes [K19]. For techno's *open*
    off-beat hat the off-beat is the main voice, so **(proposal)** open off-beats 90–110 and closed
    16ths 40–75.
  - "Varying the length of the hi hats" is itself a groove device [K11].
- **Length:**
  - Open hat decay is automated "shorter on first hit, longer on second" [K5].
  - **(proposal)** Open gate 12–22 ticks, alternating short and long per 2 beats. Closed 3–8 ticks.
- **Polymeter:** hat loops of "3 or 5 sixteen notes" [K11]. **(proposal)** Allowed as a lane loop
  length of 3/5/6/7 steps, but only for the closed-hat or perc layer, never for the kick.

## TOM

- Techno uses toms as **ostinato percussion, not fills**:
  - A bit-crushed 808 tom "on the final off beat of each bar" = step 15 [K2].
  - "Toms which sound fairly similar" in a rolling 16th pattern [K4].
  - A 909 mid/low tom "rumble", including a "delayed mid tom for groove" [K11].
- **(proposal)** Grid: 1–4 hits per bar on off-beats (3/7/11/15) or even 16ths, repeated every bar.
  Velocity 60–95. Gate 12–24 ticks.
- Rock-style descending fills are **not** techno.

## PERC

Classic techno percussion:

- **Rim:** a tuned 909 rim "emphasised the beginning of each bar, leaving space" [K2].
- **16th-offbeat perc:** a four-hit loop "exactly on offbeat 16th notes" (even steps) [K7].
- **Shaker:** "Simple shaker on the offbeat", with every second hit lower [K5].
- **Step-3 hit:** a perc on "the off beat at the start of each bar" = step 3 [K3].
- **Congas/bongos:** a "5/4 CONGA percussion loop" drifting against the bar [K9]. Bongos and
  "call-and-answer perc interplay" [K13].

**(proposal)** Perc phrases are 1–6 hits per bar on off-beats or even steps. Velocity alternates
loud/soft (90/60). Gate 6–18 ticks. The polymetric loop length 3/5/6/7 is allowed. A perc hit on
step 1 is rare except for the rim-accent idiom [K2].

## CYMB

- **Ride:**
  - "Same pattern as the kick drum" [K2].
  - Or duplicate the open-hat off-beats onto the ride at −6 dB [K10] → **(proposal)** velocity 60–80.
  - Or an 8th ride "with a shorter, quieter note on every second hit" [K5].
- **Crash:** a crash with "short release" as an arrangement marker [K20].
  - **(proposal)** Crash only on step 1 of the first bar of an 8- or 16-bar phrase, and never inside
    a 2-bar loop more than once.
- **Length (proposal):** ride gate 12–24 ticks; crash 48–96.

## 2-bar variations and fills

- **Techno "fills" are subtractive or additive micro-changes, not drum-kit fills** [K18][K9]:
  - an extra kick on 15 or 16;
  - a ghost clap on 16;
  - a clap moved in bar 2 [K4];
  - an open-hat decay change [K5].
- **(proposal)** Bar 2 differs from bar 1 in ≤ 2 events per lane.

## NOT techno

- **Kick:**
  - Syncopated or broken kicks inside the groove: the four beats must stay.
  - Swing above ~62 % outside the minimal family [K9][K7].
- **Velocity and density:**
  - Busy humanised ghost velocities on the kick.
  - Melodic tom fills, or any snare roll longer than 1 beat. Rolls are trance and build-up
    language [K30].
  - "Quantity of sounds" over precision [K18]: ≥ 4 simultaneous busy perc layers.
