# HIPHOP — drums (boom bap focus; trap as a flagged sub-family)

Conventions as in `techno.md`. **Measured:** DK1 over GMD `hiphop` (34 files, 869 bars,
5 drummers), split into 759 GROOVE and 110 FILL bars. ⚠ GMD hip-hop is **drummers playing hip-hop
grooves on a kit**, not MPC programming. The measured swing is therefore far lower than the MPC
guides give. Both are reported below. **(proposal)** = our own numbers.

## Tempo and swing

- **Tempo:**
  - GMD hiphop median **91 BPM**, range 67–140 (DK1).
  - Boom bap "anywhere in the 80–105bpm range", sweet spot 94 [K71]; NI example 93 [K72].
  - **Default 88–96.**
- **Swing:**
  - Guides:
    - "Anywhere between 57% and 64%" [K71].
    - Split by lane: kick/snare "MPC 3000 8ths 57" and hats "MPC 3000 16th 74" [K73].
    - A "classic MPC swing" of 58 % [K74] (lower authority).
    - The SP-1200 double-time trick at 71 % (snippet) [K81].
  - GMD measured: hat swing median 0.5 ticks, and only 1 of 20 files ≥ 58 % (DK1). Live kit hip-hop
    is nearly straight.
  - **(proposal)** Two families:
    - **MPC:** even-16th delay 4–8 ticks on the hats; kick/snare 8th-swing 57 % = off-8th +7 ticks.
    - **Live:** 0–2 ticks.
- **Dilla feel:** "multiple rhythmic feels simultaneously … some ahead of or behind the grid"
  [K76].
  - On "Get Dis Money" the backbeat claps are early and the hats late.
  - **(proposal)** A per-lane offset mode: snare −3…−6 ticks, hats +3…+8, kick 0. It is a feel
    parameter, not a grid.

## KICK — GMD hiphop groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | **.80** | .03 | **.42** | .31 | .04 | .19 | .37 | .34 | **.45** | .23 | **.40** | .09 | .16 | .19 | .21 | .29 |
| vel | 82 | 41 | 74 | 54 | 61 | 50 | 60 | 42 | 79 | 44 | 71 | 57 | 68 | 59 | 64 | 39 |
| gh | .06 | .55 | .02 | .26 | .10 | .12 | .20 | .71 | .03 | .57 | .18 | .35 | .11 | .33 | .16 | .74 |

- **Guides:**
  - "The first and the third being the kick drum" = steps 1/9 [K75].
  - NI: steps 1, 7, 11, with step 3 added (vel 85) in the variation bar [K72].
  - Steps 1 and 11 [K74].
  - **Ghost kicks** "fall just before a main kick (or snare)" and are quieter [K71].
- **Measured:**
  - 1 dominant; 3, 9, 11 and 7 common. The kick stays off 5 (P .04).
  - Even-step kicks are ghost-heavy: 8 = 71 %, 16 = 74 % ghosts. Those are the pickups into the
    next beat and bar [K71].
  - Median 5 kicks per bar. LHL median 3 (IQR 1–5).
  - Top groove patterns: `x.xx.xx.......x.` (9 %) and `x.......x.x.....` (8 %) (DK1).
- **Velocity (proposal):** 1/3/9/11 at 95–115; ghost pickups 35–55. SP-1200 practice: "instead of
  BA-BOOM on double kicks use ba-BOOM" (snippet) [K81], meaning the first of a pair is softer.

## SNARE — groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | .06 | .10 | .04 | .05 | **.81** | .08 | .10 | .22 | .16 | .19 | .06 | .11 | **.65** | .18 | .17 | .14 |
| vel | 61 | 36 | 37 | 25 | **121** | 31 | 35 | 43 | 77 | 39 | 53 | 31 | **121** | 49 | 99 | 49 |

- **Backbeat:** steps 5/13 [K72][K75]. Measured P .81/.65 at **vel 121**, the hardest backbeat of
  any GMD style.
  - Ghosts are 37 % of hits, mainly on 8, 10 and 14 (DK1).
  - Guide: ghost snares "at 50–60% velocity on the 16th notes before beats 2 and 4" (snippet) =
    steps 4/12.
  - GMD's ghosts are on 8/10/14 instead. **(proposal)** Allow both.
  - Step 15 at vel 99 is a loud pickup, the same shape as funk.
- **Clap:** "nudged … a few milliseconds" late [K73]. It is opposite to Dilla's early clap [K76];
  the choice is per family.
- **Velocity bands:** "full velocity on accented beats, 60–70% … 30–40% on ghost notes" [K74].
  **(proposal)** Backbeat 110–127, ghosts 30–50.
- **Length (proposal):** 16–36 ticks. A sampled snare rings.

## HAT (new for hip-hop)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P (groove) | .74 | .30 | .79 | .26 | .86 | .40 | .88 | .26 | .86 | .41 | .88 | .24 | .75 | .36 | .77 | .23 |
| vel | 85 | 43 | 65 | 44 | 96 | 47 | 69 | 42 | 84 | 49 | 76 | 45 | 93 | 50 | 78 | 59 |

- **Measured:**
  - 8ths are almost always present (.74–.88).
  - The "e" 16ths (6/10/14, P .36–.41) are more common than the "a" 16ths (4/8/12/16, P .23–.26).
    The resulting `xxx.xxx.xxx.xxx.` gallop is the #2 pattern (10 %).
  - Beats 2/4 (steps 5/13) are the loudest hats (96/93) (DK1).
- **Guides:**
  - NI: closed 8ths at 100, plus a swung 16th hat before beat 3 (step 8) at 85 [K72].
  - Attack: 16ths, with "a cowbell on beat one of bar two and an open hi-hat on beat four of bar
    two" [K73]. That is a ready-made 2-bar variation: open hat on step 13 of bar 2.
- **Velocity (proposal):** 8ths 70–100 with beats louder; 16ths 35–55.

## TOM — FILL bars (110)

- Tom P rises toward the bar end: 13 = .25, 14 = .27, **15 = .45**, 16 = .35, all at vel 96–119.
- Top fill shapes: `.............xx.`, `...............x`, `..............xx` (DK1).
- Fills make up 13 % of bars, peaking in bar 4 of a phrase (.23) and bar 8 (.25) (DK2).
- **(proposal)**
  - Hip-hop tom lanes are mostly empty.
  - Fill variant = 1–3 tom hits on 14–16 of bar 2, vel 95–120.
- Boom-bap production often has no fills at all. **(proposal)** ≤ 15 % of phrases.

## PERC

- **Cowbell:** on "beat one of bar two" [K73] = bar-2 step 1.
- **Tambourine:** on sextuplets in the "drunk" style [K77]. These cannot be represented on a
  16-step lane. **(proposal)** Omit them, or use a straight 16th tambourine at a low weight.
- **(proposal)** Perc lane:
  - 0–2 hits per 2 bars (cowbell on bar-2 step 1, or a shaker on 8ths at vel 50–70).
  - Rim clicks on 8/16 as snare-ghost substitutes, vel 50–70.

## CYMB

- **Crash:** P(crash on 1) = .30 after a fill versus .08 after a groove bar. Crash in 18 % of groove
  bars, mostly on step 1 (DK1).
- **Ride:** rare (13 %).
- **Trap family:** "the ubiquitous 808 crash cymbal marks the downbeat of each four-bar section"
  [K79].
- **(proposal)** Crash only on step 1 of bar 1, in a quarter of phrases.

## Trap (sub-family, flagged)

- **Tempo:** "around 140–160bpm but feel far slower". The snare falls "on each bar's third beat"
  (step 9) at the half-time feel [K79].
- **Hats:** they shift to "triplets or dotted notes at the end of every bar or so" [K79]. Rolls go
  down to /64 [K80], which **needs ratchets** that a 16-step lane without ratchet support cannot
  hold.
- **808 kick:** decay lengthens the note [K37] → **(proposal)** gate 48–192 ticks.
- **(proposal)** Straight timing (delay 0). Do not mix trap and boom-bap traits in one phrase.

## 2-bar variations

- Bar 2 adds a kick on step 3 [K72].
- A cowbell or open hat in bar 2 [K73].
- A snare pickup on 15/16.
- **(proposal)** Otherwise identical. Boom-bap loops repeat exactly, and GMD's bar-repeat rate is
  higher here than in rock.

## NOT hip-hop (boom bap)

- Four-on-the-floor kick. A kick on step 5.
- Straight 50 % swing *in the MPC family* [K71][K73], or conversely swing in trap.
- Trap snare-on-9 plus hat rolls inside a boom-bap phrase.
- Equal velocities. Constant fills.

## INGEST material (GMD)

- `drummer8/session1/3_hiphop_90`, `4_hiphop_90` (kick `x.xx.xx.......x.`, hat gallop
  `xxx.xxx.xxx.xxx.`, snare backbeat 84–87 % modal).
- `drummer8/session2/9_hiphop_86` (76 bars, backbeat).
- `drummer7/session1/39_hiphop_100`.
- `eval_session/*_hiphop-groove6_*`.
- 61 hiphop fill files.
- ⚠ These are live grooves. Apply the MPC swing family on top if the phrase is tagged MPC.
