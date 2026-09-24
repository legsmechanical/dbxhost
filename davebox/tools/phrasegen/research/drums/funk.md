# FUNK — drums (kick, snare, tom, perc, cymbal)

Hats, tempo and swing are in `../funk.md` (D1). This file adds the other lanes.
**Measured:** DK1 over GMD `funk` (53 files, 2,471 bars, 4 drummers): 2,002 GROOVE bars and 469
FILL bars. "vel" = mean MIDI velocity at that step; "gh" = share of hits at vel ≤ 45.
**(proposal)** = our own numbers.

## KICK — GMD funk, groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | **.85** | .03 | .29 | **.43** | .07 | .23 | .07 | .35 | .32 | .14 | **.52** | .23 | .04 | .15 | .09 | .08 |
| vel | 76 | 33 | 61 | 50 | 62 | 62 | 45 | 53 | 65 | 49 | 67 | 46 | 75 | 49 | 53 | 31 |
| gh | .17 | .72 | .35 | .31 | .23 | .11 | .57 | .43 | .18 | .54 | .33 | .43 | .14 | .43 | .40 | .80 |

- **Shape:**
  - Step 1 is near-certain (the one [S12]).
  - The kick avoids the backbeat steps 5/13 (P .07/.04), so the snare owns them.
  - It favours 4 (the "a" of 1), 11 (the "and" of 3), 8, 3 and 9.
  - That matches the NI funk kick on the 1st, 2nd and 6th 8ths = steps 1, 3, 11 [S7], and the Funky
    Drummer kick "on the 1, and '&' then '&' and 'e'" [K103].
  - Median 4 kicks per bar. LHL median 4 (IQR 2–6) (DK1).
- **Velocity:** 31 % ghosts overall.
  - The one is loud (76). Syncopated 16ths vary widely.
  - "The first two hits louder than the rest" (Funky Drummer) [K66].
  - **(proposal)** Step 1 at 95–115, other kicks 60–95. Ghost kicks (≤ 45) on 16ths just before a
    snare or kick.

## SNARE — groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | .15 | .34 | .11 | .03 | **.72** | .30 | .19 | **.51** | .18 | **.46** | .13 | .14 | **.68** | .26 | .30 | **.47** |
| vel | 29 | 38 | 37 | 49 | **114** | 42 | 54 | 53 | 50 | 45 | 41 | 60 | **113** | 42 | 85 | 43 |
| gh | .92 | .78 | .80 | .65 | .02 | .79 | .67 | .52 | .69 | .66 | .74 | .57 | .02 | .79 | .36 | .73 |

- **Backbeat plus ghosts.**
  - The backbeat is at 114 with only 2 % ghosts. Nearly **half of all snare hits are ghosts**
    (49 %).
  - Ghost density peaks on the 16th off-beats 8, 10 and 16 (P .46–.51) and on 2/6/14 (~.3).
  - Median 5 snare hits per bar (DK1).
  - Wikipedia: ghosts are played "very softly between the 'main' notes … off the beat on the
    sixteenth notes" [K102]. NI has ghost snares at velocity 75 [S7], louder than GMD's.
- **Step 15 at vel 85** is a loud pickup into beat 4, a secondary accent.
  - Funky Drummer: "the hardest ghost is on the 'a' of beat 3" (snippet, [K103] context) = step 12.
    GMD shows step 12 at vel 60, the loudest of the even-step ghosts.
  - Funky Drummer programming: backbeat 127, ghosts 90–110 [K66]. That is a *sample-break* level;
    the live GMD ghosts are ~40.
  - **(proposal)** Ghosts at 25–50, one "hard ghost" per bar at 55–75 on 12 or 15.
- **Displaced backbeat:** "the snare drum backbeats aren't always played on beats two and four"
  [K104]. Measured `....x.......x...` is only 17 % of groove bars.
- **Timing:** ghosts sit early (−3 to −8 ticks on 1/3/7/9/11) while the backbeat is −1 (DK1).
  **(proposal)** Ghosts −2…−4 ticks, backbeat 0.

## TOM — FILL bars (469)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | .04 | .05 | .10 | .05 | .09 | .06 | .09 | .08 | .13 | .10 | .14 | .10 | **.22** | .13 | **.22** | .08 |
| vel | 110 | 97 | 119 | 102 | 114 | 104 | 96 | 101 | 112 | 88 | 112 | 100 | 115 | 104 | 104 | 93 |

- Toms appear in only 47 % of funk fill bars. The rest are **snare fills**: fill-bar snare P is
  ≥ .47 on 9–16 at vel 78–107, with the top shape `....xxxxxx.x.x.x`.
- Funk fills are "few and economical" [S12]. GMD funk fills make up 19 % of bars, peaking in the
  4th bar of a phrase (.30) (DK2).
- **(proposal)**
  - Fill bar = a snare 16th run on 9–16 (vel 80 → 110).
  - Or a 2–4-hit tom figure on 13–16 (vel 100–120).
  - Fills go only in bar 2 of a 2-bar phrase, in ≤ 25 % of phrases.

## PERC

- GMD has no percussion. No funk-specific cowbell source was found (the gap is noted in
  `SOURCES.md`).
- The funk-related guidance comes from disco and Latin sources:
  - Tambourine in 16ths, accented on beats [K51].
  - Conga tumbao [K52].
- **(proposal)** A cowbell or tambourine lane on 8ths or quarters, vel 70–100, flagged low
  confidence.

## CYMB

- **Crash:**
  - P(crash on 1) = .25 after a fill versus .04 after a groove bar (DK1).
  - Crashes are rare (12 % of groove bars).
  - ⚠ Many are low-velocity mid-bar hits (vel 10–60), which are likely e-kit edge triggers. Use
    step-1 crashes only.
- **Ride:** used in 20 % of groove bars, as 8ths accented on 5/13 (102/95) with the off-8ths at
  66–78. It is the ride alternative to the 16th hat (the eval `funk-groove1` files).

## 2-bar variations and NOT funk

See `../funk.md` "NOT funk". For these lanes, also avoid:

- A kick on 5/13 under the backbeat (P ≤ .07 in GMD).
- No ghost tier at all on the snare.
- A four-on-the-floor kick.
- Busy tom fills every other bar.

## INGEST material (GMD)

- **Clean loops:** `eval_session/*_funk-groove2_105` (kick `x..x...x.xx.....` 88–100 % modal,
  snare backbeat 100 %). These are the same groove played by several drummers, which makes them the
  best velocity-variation source.
- **More loops:** `drummer8/session1/6_funk_80` (kick `x.x......xx..x..`, 56 bars).
- **Ride:** `eval_session/*_funk-groove1_138` (ride 8ths).
- **Fills:** 107 funk fill files (plus `neworleans/funk`, `funk/purdieshuffle`).
