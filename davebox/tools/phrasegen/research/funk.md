# FUNK

Conventions as in `house.md` (16 steps/bar, 96 PPQN, 24 ticks per 16th, **(proposal)** = ours).
Funk is the one genre with an ingestible, genre-labelled, human-played corpus: GMD `funk` beats
(53 files, 2,478 bars, 10 drummers) [S1][S2] → D1.

## Tempo and swing

- GMD funk: median **100 BPM**, range 80–138 (D1); NI funk example 100 BPM [S7]; funk uses "slower
  tempos … to create space for further rhythmic subdivision" [S12]. Default 92–108.
- 16th hats "sometimes with a degree of swing feel" [S12]. D1 measured per file: median swing
  **51.9 %** (even-16th delay 0.9 ticks, IQR 0.2–4.1), but **8 of 29** files ≥ 58 % (≥ 4 ticks), max
  ~12 ticks. Two families: **straight** (0–2 ticks) and **swung-16th** (4–10 ticks, 58–71 %).
- All hats sit early relative to the click in GMD (−0.4 to −2.7 ticks, D1) — a player habit;
  **(proposal)** ignore the global offset, keep only the even-16th delay.

## HATS

### Grid — GMD funk, P(hat onset per bar) (D1, closed+open)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P(any hat) | .79 | .21 | .70 | .32 | .85 | .21 | .76 | .35 | .81 | .23 | .73 | .28 | .85 | .21 | .66 | .21 |
| P(open) | .06 | .00 | .09 | .03 | .04 | .02 | .04 | .03 | .04 | .01 | **.25** | .04 | .12 | .02 | .13 | .04 |
| mean vel (all hats) | 69 | 36 | 63 | 36 | **85** | 40 | 59 | 47 | 68 | 39 | 76 | 40 | **75** | 42 | 70 | 48 |

- Reading: 8ths **always/often** (P 0.66–0.85), 16th off-beats **sometimes** (0.21–0.35; strongest 8
  and 4 and 12, i.e. the "a" before a beat). Median 8 hats/bar (IQR 5–11); 50 % of bars contain at
  least one 16th off-beat hat; 57 % contain an open hat (D1).
- NI funk: closed pedal hats "slightly after 1.2.4 and 1.3.2" = steps **8 and 10**, swung [S7].
  "Two-handed sixteenth notes on the hi-hats" is the busy variant [S12].
- **Open hat**: most often on **step 11** (the "and" of 3), then 13/15 (D1); ≤ 1 per bar typical.

### Velocity shape (D1)

Three tiers: beats 2 and 4 (steps 5, 13 — the backbeat) loudest 75–85; other 8ths 59–76; 16th
off-beats **36–48** (ghost level, ratio ≈ 0.55 of the beat mean). Beat 1 (69) is *not* the loudest
hat — the "one" is carried by kick and bass, not the hat.

### Note length

GMD gate times are e-kit artefacts (not usable). **(proposal)** closed 4–8 ticks; open hat 20–40
ticks and cut by the next hit (single lane), at velocity ≥ 80.

### 2-bar variations

Bar 2: add open hat on 11 or 15 (D1), add 16th pickups on 8/16, or thin the bar-2 last beat to
make room for a fill; keep bar 1 as the stable figure (fills are "few and economical … in the
pocket" [S12]).

## BASS

No ingestible funk bass corpus exists (see licence audit). Rules below are from pedagogy [S25][S26]
[S27], the Funk article [S12], and the GMD funk **kick** profile as the rhythm to lock to (D1).

### The kick it locks to (GMD funk, D1)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P(kick) | **.82** | .03 | .30 | .44 | .09 | .22 | .10 | .35 | .33 | .14 | **.48** | .21 | .08 | .15 | .13 | .08 |

Kick LHL syncopation median 4 per bar (IQR 2–6) vs rock 2 (1–4) (D3): funk low end is twice as
syncopated as rock. NI funk kick: 1st, 2nd, 6th 8ths = steps 1, 3, 11 [S7].

### Rules

- **The one**: "On the one!" moved the accent to the downbeat [S12] → bass hits step 1 (strongly),
  or anticipates it on the previous bar's step 16 [S32 snippet].
- **Rhythm first, lock to the kick** [S25][S27]; 16th syncopation [S12].
- **Notes**: dominant-7 arpeggio R–3–5–b7 [S25]; Dorian or Mixolydian colour, one- or two-chord vamps
  (e.g. m7 ↔ related dom7) [S12]; octave leaps [S12][S25]; chromatic walk-ups into a target
  [S32 snippet]; turnaround ending on the 5th [S25].
- **Length**: short — "notes aren't held for their full duration as cutting them off short gives the
  line its funky feel" [S25]. **(proposal)** main notes 12–20 ticks (½–¾ step), 8th notes ≤ 36 ticks.
- **Ghost notes**: muted percussive notes [S12] placed "in front of" (just before) a real note
  [S25][S26]; they add propulsion without changing the body [S26]. **(proposal)** velocity 25–45,
  length 4–8 ticks, pitch = the following note (or root).
- **Restraint**: don't overload with variations [S25].
- **Register (proposal, not sourced)**: 4-string bass E1 (MIDI 28) to ~C3 (48); octave pops up to ~G3.

### Canonical cells (constructed from the rules above, not transcriptions; `g` = ghost)

```
F1 kick-locked dom7      x..x...x..x.....     R  3  5  b7                     L=½ step  [S25][D1]
F2 octave pops           x..gx..x..x..g.x     R  (g) 8  R  b7 (g) 8           [S12][S26]
F3 one + space           x.........x.x..x     R           b7 8  5 (turnaround) [S12][S25]
F4 16th syncopation      x..x..x...xx.x..     R  R  b7   5 5 R  (m7 vamp, b3 allowed) [S12]
F5 constant 16ths        xgxgxgxgxgxgxgxg     R g R g b7 g 8 g ... (vel 80 / 30)  [S32 snippet]
F6 bar-2 chromatic walk  ............xxxx     5  #5  6  b7  → R on next 1   [S32 snippet][S25]
```
Two-bar form: bar 1 = cell, bar 2 = same first 8–12 steps + a turnaround (F6, or end on the 5th
[S25]) or an anticipation of the next one on step 16.

## NOT funk (generator must avoid)

- Nothing on step 1 in the bass (losing "the one") or an evenly-weighted 8th pedal with no 16ths.
- Long legato notes; no rests (funk lines are short, spacious).
- Hats with equal velocity on every 16th (no ghost tier), or triplet swing on 8ths (that's shuffle).
- Hats accenting beat 1 hardest while 2 and 4 are soft (D1 shows the reverse).
- Major-scale / Ionian melodic lines with the major 7th as a chord tone (funk implies b7) [S12].
- Constant fills / every bar different [S12][S25].
