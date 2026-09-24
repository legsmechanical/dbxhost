# HOUSE

Sources: see `SOURCES.md` (`[Sn]` = web source, `D1`/`D2`/`D3` = our measurements). Grid: 16 steps
per bar, step 1 = downbeat, steps 1/5/9/13 = beats, 3/7/11/15 = 8th off-beats ("and"), even steps =
16th off-beats. 96 PPQN → one 16th = 24 ticks. **(proposal)** marks our numbers, not a source's.

## Tempo and swing

- Tempo **115–130 BPM** [S10]; deep house 120–125 [S8]; algorithmic house corpus 120–130 [S34].
  Default 122–126.
- Swing **50–60 %** on 16ths [S8] → even-16th delay **0–5 ticks** (swing % s → delay = 48·s/100 − 24:
  54 % ≈ 2, 58 % ≈ 4, 60 % ≈ 5). Linn: 54 % "loosens" without sounding swung [S5]. Deep-house 16th
  hats are the swung case (snippet [S30]). 8th off-beats (3/7/11/15) are **not** moved by 16th swing.

## HATS

### Grid (1 bar)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| off-beat (open or closed) | – | – | **always** | – | – | – | **always** | – | – | – | **always** | – | – | – | **always** | – |
| closed on the beat | often | – | | – | often | – | | – | often | – | | – | often | – | | – |
| 16th fill | – | some | – | some | – | some | – | often¹ | – | some | – | some | – | some | – | some |

- The off-beat hat is the genre marker: "off-beat hi-hats" [S10]; "open hats on the eighth notes
  between the beats for that classic house trope" + "closed hats on eighth notes" [S7]; inherited from
  disco's "open hissing hi-hat on the off-beat" [S13]; "standard open hi-hat off-beat pattern with a
  closed hi-hat adding some shuffle … on the 8th and 16th divisions" [S8].
- ¹ "a swung 16th note hat before the third beat" = step 8 [S7].
- Full 16ths are a valid variant (deep house, swung) (snippet [S30]); they need strong velocity
  shaping to not sound mechanical [S30].
- Indicative corpus check (D2, 50 house records, 10–15 kHz band onsets, contaminated by kick
  transients): P ≈ 0.80–0.91 on every 8th step, 0.13–0.30 on 16th off-beats (highest at 10: 0.30).
  So real house tops have hats on (almost) every 8th plus sparse 16ths.

### Velocity (MIDI 1–127)

- "Accent the offbeats while keeping the downbeats quieter" (snippet [S30]); NI example uses closed
  8ths at 86 [S7]. **(proposal)** off-beat 95–115; closed on-beat 55–80; 16th fills 35–60 with
  ±8 random; never accent the on-beat above the off-beat.

### Note length / open vs closed (single-lane limitation)

A one-pitch lane cannot switch samples. **(proposal)** model the off-beat *open* hat as a long gate
(16–22 ticks, i.e. ends before the next 16th-beat hit so a choke-style voice cuts it) at high
velocity, and closed hats as short gates (4–8 ticks). If the target voice ignores gate, open/closed
is lost — flag this as a known limitation in the UI text.

### 2-bar variations (idiomatic moves)

- Bar 2 adds a step-16 pickup and/or step-8 16th [S7]; a 16th run 13–16 at rising velocity at a
  phrase end; drop the on-beat closed hats in one bar to leave off-beats only; switch to swung full
  16ths for the second bar (deep-house lift) [S8][S30].

## BASS

### Measured corpus profile (D2: 50 house records, 94 bars, 600 notes)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P(onset) | .93 | .12 | .36 | .24 | .65 | .15 | .50 | .20 | .74 | .18 | .49 | .20 | .78 | .18 | .56 | .10 |

- Onsets: ~49 % on beats, ~30 % on 8th off-beats, ~21 % on 16th off-beats. LHL syncopation per bar
  median 1 (IQR 0–3) (D3) — house bass is only mildly syncopated.
- **Pitch** (relative to estimated tonic): root 45 %, b7 10 %, 4 7 %, b3 6 %, 5 6 %, b6 6 %, 2 5 %,
  3 4 %, b2 4 %; consecutive intervals: repeat 26 %, ±2 st 20 %, ±1 st 10 %, ±3/±4 9 % each, octave
  4 % (20 % of tracks contain at least one octave leap). Minor/modal, root-heavy (D2).
- **Length**: mostly 2 steps (8th) — 1 step 25 %, 2 steps 50 %, 3 steps 15 %, 4 steps 8 % (D2).
- **Register**: median MIDI 34 (A#1 ≈ 58 Hz), p10 28 (E1), p90 43 (G2) (D2); TPS keeps off-beat bass
  "around E and G" [S23]. Wikipedia: "the lower-pitched bass register is most important" [S10].

### Relation to the kick

Kick is four-on-the-floor on 1/5/9/13 [S10]. Two idioms: (a) **off-beat bass** "between kick drum
hits" [S22][S23][S28 snippet]; (b) root **on the one plus off-beats**, the dominant shape in the
corpus (step 1 = 0.93). Sustained bass is ducked by kick sidechain [S22][S23], so long notes are
acceptable only as "pumping" notes.

### Canonical cells (tuning targets; degrees under hits; `x` hit, `.` rest; L = length in steps)

```
H1 off-beat root          ..x...x...x...x.        R   R   R   R          L=1–2  [S22][S23]
H2 off-beat octave        ..x...x...x...x.        R   8   R   8          L=1–2  [S23][S28]
H3 corpus-typical         x...x.x.x.x.x.x.        R   R b7 R R  R  4      L=2 (b7/4 at L=1)  [D2]
H4 driving 16ths          xxxxxxxxxxxxxxxx        all R, vel 60–80 flat  L=1    [S23]
H5 broken octaves (disco) x.x.x.x.x.x.x.x.        R 8 R 8 R 8 R 8        L=1    [S13]
H6 acid-style 16-step     x.xx.x.xx..x.xx.        R R 8 R b3 R 8 b7 R    L=1, slides on 2–3 notes, accents 3–4 notes [S29 snippet]
```
2-bar variation: bar 2 changes only the last beat (steps 13–16: e.g. b7→8, or a b3–4 pickup into
the next 1), keeping the first 12 steps identical (corpus loops are 1–4 bars, D2).

## NOT house (generator must avoid)

- Hats missing from 3/7/11/15, or accented on the beat louder than the off-beats.
- Triplet or near-triplet swing (> ~62 %, > 6 ticks) — outside the 50–60 % range [S8].
- Backbeat-rock hat (even 8ths with downbeat accents) *and* no off-beat emphasis.
- Bass: busy chromatic lines, wide leaps every note (octave ≤ ~5 % of intervals in D2), high register
  (> ~C3/48), long legato notes that sit on every kick without the off-beat idiom, heavy 16th
  syncopation (LHL > ~5 per bar in most bars).
