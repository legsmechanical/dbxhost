# DISCO — drums

Conventions as in `techno.md`. **Measured, small:** DK1 over GMD `dance/disco` (5 files, 434 bars,
2 drummers, 120–137 BPM; 354 groove bars, 80 fill bars). The guides [K43–K53][S13][S24] carry the
rest. **(proposal)** = our own numbers, not a source's or a measurement's.

## Tempo and swing

- **Tempo:**
  - Earl Young: "Everything that I cut is at 120 speed … so that the disc jockeys could mix" [K43].
  - Loose disco 110–118 [K44]; nu-disco 110–120 [K45]; live hats 115–125 [K46].
  - GMD disco 120–137 (DK1).
  - **Default 116–124.**
- **Swing:**
  - Loose disco is at 50 %, and the feel comes from small offsets [K44]. Nu-disco uses 50–60 %,
    "don't go overboard" [K45].
  - Even 16ths sit "a bit later … not noticeable swing" [S24].
  - GMD disco hat swing median 3.2 ticks (IQR 2.3–4.1) (DK1): a small, real 16th lilt.
  - **(proposal)** Delay 2–4 ticks.

## KICK — GMD disco groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | **.98** | .02 | .03 | .42 | .55 | .01 | .03 | .10 | **.99** | .00 | .02 | .44 | .55 | .40 | .05 | .07 |
| vel | 99 | 9 | 39 | 70 | 91 | 7 | 37 | 51 | 89 | 58 | 42 | 66 | 89 | 66 | 40 | 53 |

- **Guides:**
  - "A steady four-on-the-floor beat set by a bass drum" [S13]; a kick "on every quarter-note"
    [K47].
  - Extra kick "at the end … the last offbeat of the bar" = step 15 [K48].
  - Nu-disco kick on 1 and 9 only [K45], a non-70s variant.
- **Measured, two families:**
  - Four-on-the-floor `x...x...x...x...` (39 % of groove bars).
  - A **syncopated disco-funk kick** `x..x....x..x.x..` (30 %): 1, 4, 9, 12, 14. It drops 5/13 and
    adds the "a"s.
  - Steps 1 and 9 are near-certain in both (.98/.99).
  - **(proposal)** Weight 65 % four-on-the-floor, 35 % syncopated.
- **Velocity:** beats 89–99; syncopated 16ths 66–70; ghost share 6 %. A *loud, even* kick (DK1).

## SNARE / CLAP

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | .02 | .16 | .05 | .03 | **.88** | .12 | .03 | .23 | .03 | .19 | .08 | .04 | **.91** | .17 | .09 | .25 |
| vel | 31 | 21 | 27 | 28 | **117** | 23 | 57 | 38 | 28 | 47 | 39 | 55 | **116** | 34 | 63 | 33 |

- **Backbeat:** "The snare drum must play a consistent backbeat on beats 2 and 4". Avoid flams
  between kick and snare on 2/4 [K49].
  - It is programmed "slightly late for a lazy feel" [K47].
  - Measured: the backbeat is 62 % of groove bars exactly `....x.......x...`, the most regular of
    any GMD style (DK1).
- **Ghosts:** 37 % of hits are ghosts, at even steps (16/8/10/14) and vel 21–47. "Ghost notes can
  be added" [K49]; they are optional texture.
- **Turnaround:** a "ghost hit before the final snare that creates the double-snare turnaround – a
  classic disco drumming touch" [K44] → bar 2, step 12 (or 11) as a ghost before 13.
- **Clap layers** are "slightly offset from each other" [K45]. **(proposal)** Clap lane on 5/13,
  +2…+6 ticks behind the snare, gate 24–36.

## HAT (new for disco; the defining lane)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P (groove) | .79 | .64 | **.84** | .67 | .49 | .65 | **.84** | .71 | .85 | .67 | **.85** | .71 | .53 | .65 | **.83** | .71 |
| vel | 77 | 55 | **89** | 72 | 60 | 57 | 76 | 87 | 74 | 55 | **93** | 70 | 61 | 64 | 82 | 80 |

- **Measured:**
  - **Full 16ths with the backbeat hats dropped.** `xxxx.xxxxxxx.xxx` is the top pattern (35 %);
    full 16ths 15 % (DK1).
  - That matches "drop the 16ths that coincide with snare hits" [K47].
  - "Double-handed 16th-note hi-hats are the hallmark of the genre" [K47].
  - The off-8ths 3/11 are loudest (89/93), where the open hat goes.
- **Open off-beat hat:** "the essential offbeat open hi-hats" replace closed hats on 3/7/11/15.
  They are "kept short and choked or left longer" [K47]. "Opening the hi-hat on the upbeats" [K49];
  open hats on the off-beat [S13].
  - Earl Young's loud hats are historical [S13][K50].
- **Choke:** "it cuts off as the next closed hat sample falls" [K44]. One hat sample per step
  [K46].
- **Single-lane encoding (proposal):**
  - Off-8ths at vel 95–115 with gate 16–22 ticks (the "open").
  - Other 16ths at 50–75 with gate 4–8.
  - Beats at 60–80.
  - Leave out 5/13 in half of the phrases.

## TOM

- "Keep any fills short and tight" [K47]. Nu-disco has a 3-tom fill in bar 4, descending [K53].
- **FILL bars (DK1):**
  - Tom P .42 on step 13 and .12–.25 on 11–16, all at vel 107–119.
  - `............x...`, `...........xx...` and `............xxxx` lead.
  - Fill bars are 18 % of all bars, **peaking at bar 4 of 4 (.43) and bar 8 (.42)** (DK2): the
    clearest phrase-end structure in GMD.
- **(proposal)** Bar-2 (or bar-4) fill on 12–16, 1–4 hits descending (gate 24–36, vel 100–120).

## PERC

- **Tambourine:** "constant 16th-note shakes, with on-beat accents, every other one of which
  strikes the rim, and lower velocity notes in between" [K51].
  - **(proposal)** 16ths; vel beats 100 (1/9: 110 for the "rim" accent), off-8ths 70, 16ths 45.
    Gate 6–10.
- **Shaker:** "a full-velocity note on every eighth-note, then insert lower-velocity notes between".
  A variant removes steps 2/6/10/14 [K51].
- **Congas:** tumbao of 16 strokes with open strokes and slaps. "Leaving spaces in the groove"
  [K52].
  - **(proposal)** Single-pitch conga lane: open tones on steps 7-8 and 15-16 (the tumbao's open
    pair) at vel 100, soft heel/tip strokes elsewhere at 40–60.
  - ⚠ The pitch of the open tone is lost on one lane.
- **Bongo martillo:** 8 strokes per bar, in the order slap, fingers, open, thumb [K52]. **(proposal)**
  8ths with accents on 1/5/9/13 (slap) and 7/15 (open).
- **Cowbell:** "sparse accents — every 2 or 4 bars on an offbeat" (snippet). Nu-disco pairs it with
  a pitched-up bongo [K45].

## CYMB

- No disco-specific ride/crash guidance was found. The hat carries the time.
- **Measured:** crash on step 1 in 6 % of groove bars (vel 103); after a fill 24 %. Ride rare (11 %,
  8ths accented on the off-beats 105–109).
- **(proposal)** Crash on step 1 of a phrase following a fill. Ride off-8ths as an alternative to
  the open hat.

## 2-bar variations

- Double-snare turnaround ghost [K44].
- Extra kick on step 15 [K48].
- A single open hat per phrase as a motif [K44].
- Bar-2 short tom fill.

## NOT disco

- Kick syncopation beyond the measured disco-funk family or the step-15 pickup.
- Swing > ~60 % [K45]. Kick/snare flams on 2/4 [K49].
- A hat lane without off-beat emphasis.
- Long or frequent fills.
- Tom grooves.

## INGEST material (GMD)

- `drummer1/session1/101_dance-disco_120` (104 bars, four-on-the-floor kick 88 % modal).
- `drummer8/session2/26_dance-disco_137` and `27_dance-disco_137` (snare backbeat, hat
  `xxxx.xxxxxxx.xxx`, syncopated kick).
- `drummer1/session3/6_`, `7_dance-disco_120`.
- ⚠ Only 2 drummers. There are no disco fill files; take fill bars from these files (DK1 fill
  bars).
