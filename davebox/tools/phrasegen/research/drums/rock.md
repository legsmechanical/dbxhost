# ROCK — drums

Conventions as in `techno.md`. **Measured.** DK1 over GMD rock (`=rock,rock/indie,rock/groove8`:
195 files, 5,473 bars, 9 drummers). The tables below are **GROOVE bars** (3,900) unless marked
**FILL bars** (1,573). Definitions and caveats are in `SOURCES.md`. Guides [K94–K96][S7] supply the
rules the numbers are read against. "vel" = mean MIDI velocity at that step; "gh" = share of hits at
vel ≤ 45. **(proposal)** marks our own numbers, not a source's or a measurement's.

## Tempo and swing

- **Tempo:** GMD rock median **105 BPM**, range 50–180 (DK1). The NI rock example is at 80 [S7].
  **(proposal)** Default 100–130; a slow family at 70–90.
- **Swing:** hat swing per file median 0.5 ticks (IQR −0.5 to 3.4); 13 of 60 files ≥ 58 %
  (DK1). Rock is **straight**. **(proposal)** Even-16th delay 0–2; the shuffle family (GMD
  `rock/shuffle`) is excluded here.

## KICK

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P (groove) | **.65** | .04 | .27 | .21 | .30 | .02 | .23 | .22 | **.45** | .06 | **.42** | .14 | .22 | .06 | .26 | .17 |
| vel | 81 | 42 | 73 | 54 | 78 | 50 | 65 | 55 | 83 | 54 | 69 | 64 | 77 | 66 | 66 | 54 |
| gh | .13 | .57 | .16 | .40 | .04 | .41 | .22 | .39 | .08 | .50 | .23 | .24 | .05 | .35 | .24 | .34 |

- **Guide rule:** "kicks on the first and third beats" = steps 1 + 9. The variation adds "another
  kick" on the 16th after the second kick = step 10 at velocity 76 [S7].
- **Measured:**
  - Steps 1 and 9 lead. Step 11 (the "and" of 3) is almost as common as 9 (.42).
  - Off-8ths (3/7/15) run .23–.27. 16th off-beats are rare (≤ .22) and a third to half of them are
    ghosts.
  - Median 4 kicks per bar. LHL median 2 (IQR 1–5), against funk's 4 (D3, `../funk.md`).
  - Top groove patterns: `x...x...x...x...` (6 %) and `..x.x..x..x.x..x` (7 %, one drummer's
    driving 8ths). The distribution is broad, so a generator should sample from the per-step table,
    not from a few templates.
- **Velocity:** beats 77–83; off-8ths 65–73; 16ths 42–66 (DK1).
  - **(proposal)** Beats 85–110, off-8ths 70–90, 16th pickups 45–65. Rescale GMD's e-kit range
    ×1.1 around 64 if a punchier kit is wanted.
- **Length (proposal):** 12–24 ticks. A kick is a trigger.

## SNARE

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P (groove) | .06 | .12 | .07 | .04 | **.72** | .08 | .07 | .14 | .11 | .15 | .16 | .07 | **.74** | .09 | .09 | .17 |
| vel | 54 | 40 | 48 | 50 | **112** | 47 | 71 | 49 | 80 | 49 | 61 | 60 | **112** | 48 | 74 | 48 |
| gh | .49 | .68 | .60 | .61 | .03 | .58 | .41 | .66 | .32 | .63 | .26 | .54 | .02 | .66 | .37 | .62 |

- **Backbeat:** the snare plays "on beats two and four … the backbeats" [K94] = steps 5/13.
  - Measured P .72/.74. `....x.......x...` is 40 % of all groove bars (DK1).
  - Backbeat velocity is 112 and ghosts there are ≤ 3 %.
- **Ghosts:** 28 % of snare hits are ghosts. Everything off the backbeat is 40–70 % ghost, mostly
  on 2, 8, 10, 16 (DK1). The ghost rate is **lower than funk's 49 %**.
- **Half-time:** "the backbeat can also be moved to beat three" [K94] = step 9 (P .11 in GMD rock
  groove bars). **(proposal)** A named half-time family, ≤ 15 % of phrases.
- **Timing:** snare dev −1.5 to +1.3 ticks (DK1). No systematic laid-back backbeat.
  **(proposal)** Jitter ±2 ticks.
- **Length (proposal):** 12–24 ticks.
- **Cross-stick:** only 6 % of groove bars use it, mostly on 5/13 at vel ~76 (DK1). **(proposal)** A
  "verse" variant replaces the backbeat, vel 70–85.

## HAT (new for rock)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P (groove) | .58 | .18 | .43 | .21 | .53 | .19 | .52 | .21 | .52 | .22 | .46 | .20 | .60 | .18 | .40 | .20 |
| vel | 80 | 44 | 69 | 67 | 88 | 54 | 73 | 63 | 80 | 59 | 72 | 68 | 85 | 59 | 76 | 64 |

- **Measured:**
  - The hat is used in 87 % of groove bars. When absent, the ride carries the time (ride used in
    38 %, mostly `x.x.x.x.x.x.x.x.`).
  - Top shapes: quarters `x...x...x...x...` (10 %), 8ths (8 %), off-beat 8ths (5 %) (DK1).
  - Velocity is beat > off-8th > 16th, with 5/13 loudest (the hand hits with the backbeat).
    Tiering as in `../basics.md` B-3.
- **Grunge / hard-rock chorus:** "play quarter notes" on the crash [K94]. See CYMB.

## TOM

- Fills are "one bar, half bar, and one beat" long [K94]. They signal "the end of a phrase … the
  time-keeping pattern is resumed immediately after the fill" [K96].
- **FILL bars (DK1):**

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P(tom) | .23 | .09 | .18 | .09 | .15 | .05 | .19 | .17 | .25 | .15 | .25 | .13 | **.29** | .19 | **.35** | .24 |
| vel | 80 | 75 | 73 | 79 | 100 | 89 | 85 | 75 | 95 | 99 | 94 | 94 | 108 | 96 | 94 | 84 |

  - Toms concentrate in the **last beat or half-bar** (13–16) and are loud: median 91, ghost share
    7 %.
  - Top fill shapes are 16th pairs on 15–16, a single hit on 1 or 15, or nothing: 15 % of fill bars
    are snare-only fills.
- **Where fills fall (DK2):**
  - P(fill bar) by position in a 4-bar phrase is .29/.26/.24/**.36**; in an 8-bar phrase it is
    highest at bar 8 (.38).
  - GMD rock is fill-heavy because the players improvise (29 % of bars).
  - **(proposal)** For a 2-bar phrase library: the fill variant = bar 2 carries a tom/snare fill on
    steps 9–16 or 13–16. Plain phrases have no fill.
- **Tom ostinato** is a separate rock idiom (DK3, drummer-specific): `x......xx......x` is the
  "floor-tom groove" in one long file. **(proposal)** Low weight.
- **Length (proposal):** 16–36 ticks (toms ring).

## PERC

GMD has no percussion instruments. The rock sources do not discuss percussion. **(proposal)**
Tambourine on 5/13 or on 8ths (vel 70–90) is a common pop-rock layer, unsourced here; mark it low
confidence.

## CYMB

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P(crash) groove | **.17** | .02 | .01 | .02 | .07 | .00 | .03 | .00 | .05 | .00 | .04 | .01 | .06 | .01 | .06 | .00 |
| P(ride) groove | .31 | .11 | .21 | .07 | .30 | .03 | .29 | .07 | .33 | .11 | .23 | .11 | .28 | .04 | .29 | .04 |
| ride vel | 85 | 65 | 53 | 60 | 94 | 52 | 68 | 54 | 76 | 67 | 72 | 60 | 90 | 60 | 71 | 57 |

- **Crash:** "the crash cymbal frequently follows a fill, replacing the first note of the next
  measure and accompanying the bass drum" [K95].
  - Measured P(crash on step 1) is **.31 after a fill bar** versus **.10 after a groove bar** (DK1).
  - Crash velocity is ~97 on step 1.
  - Crash-quarters on 1/5/9/13 are a chorus idiom [K94] (1.2 % of groove bars, DK1).
- **Ride:** an 8th pattern, accented on 5/13 (94/90) over the off-8ths (68–72) (DK1).
- **Length (proposal):** crash 96–192 ticks; ride 24–48.

## 2-bar variations

- **(proposal)**
  - Bar 1 is the groove.
  - Bar 2 either repeats it (the GMD all-bar repeat rate is only 0.32 for the kick, a live-drummer
    artefact; loops should repeat), adds a kick on 10/11/16, or carries a fill on 13–16.
  - A crash goes on step 1 of the phrase after a fill.

## NOT rock

- A snare backbeat absent from 5/13 in most bars (except the half-time family).
- Funk-level ghost density (> ~40 % of snare hits, DK1 funk 49 %) or kick LHL > 5 in most bars.
- Four-on-the-floor kick with off-beat open hats (house/disco).
- Swing > 58 %.
- Constant fills. Crashes mid-bar without a preceding fill.

## INGEST material (GMD, CC BY 4.0)

DK4 ranks candidates; `analysis/out/ingest_candidates.txt` has the full list.

- **Kick loops:** `drummer3/session1/24_rock_120`, `35_rock_120` (`x...x...x...x...`, 95–100 % modal).
- **Snare loops:** `drummer8/session2/22_rock_96` (80 bars, backbeat 94 % modal), `drummer7/session3/1_rock_60`.
- **Ride:** `drummer3/session1/11_rock_120`, `12_rock_120`.
- **Fills:** the GMD `fill` files (130 rock fill files, ~1 bar each) are self-contained tom/snare
  fills. They are the best INGEST source for the fill-bar TOM and SNARE lanes. Quantise and keep the
  velocities.
- **Eval grooves:** the `eval_session/*_rock-groove8_*` files are a fixed groove played by several
  drummers. They are clean 16-bar loops, and the multiple drummers give ideal velocity variants of
  one pattern.
