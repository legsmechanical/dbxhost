# SYNTH-POP (80s) — measured (LMD)

**118 songs measured, 71 artists**: Soft Cell, Erasure, OMD, Depeche Mode, Pet Shop Boys, Human
League, Yazoo, Ultravox, Alphaville, Spandau Ballet, Duran Duran, ABC, A-ha, Eurythmics, Communards,
Bronski Beat, Tears for Fears, Thomas Dolby… (+ "The Synthesizer", a cover act, 5 songs). Era
1978–93. Method/licences/caveats: `README.md`. Guide files compared: `../drums/synthpop.md`,
`../melodic/synthpop.md`.

## What the data says

- **Tempo:** file median 124 BPM (IQR 108–132), folded 126 (117–136). **Straight**: swing median 0,
  0 % of songs ≥ 4 ticks; 9 of 144 files had a triplet/shuffle grid and were skipped.
- **Kick:** 1 .94, 9 .84, beats 2/4 .38/.37, step 7 .29, 11 .18; even 16ths ≈ 0 (15 % of songs have
  > 10 % even-step kicks). 4otf in 32 % of songs, "1 + 9, no 5/13" in 47 %. Modal kick bars:
  `x...x...x...x...` 33 %, `x.......x.......` 14 %, `x.....x.x.......` 14 %.
- **Snare:** backbeat .79/.79 at vel 104; no ghosts. Clap = 9 % of snare-lane notes.
- **Hat:** 8ths .66–.71 on odd steps, .16–.21 on even steps. Families: 8ths 36 %, **16ths 14 %**,
  quarters (`x...x...x...x...`) modal in 7 %, off-beat only 4 %, **no hat 13 %**. Open hat = 18 % of hat
  hits, placed on the **off-8ths** 3/7/11/15 (P .15/.17/.18/.19), almost never on beats.
  Hat tiering +5.2 (weak), hat SD 9.6 — the lowest-variance hat of the targets.
- **Velocity levels:** 14 % of files flat. Distinct velocities per lane: kick ≤ 3 in 55 % of songs,
  snare ≤ 3 in 50 %, hat ≤ 3 in 37 %. Kick SD 3.9, snare 3.2.
- **Perc:** in 48 % of songs; tambourine .16, maracas .10, side-stick, cabasa; the modal perc bar is
  **16ths** (`xxxxxxxxxxxxxxxx`, 14 % of songs).
- **Toms / fills / cymbals:** toms in groove bars in 4 % of songs; fill bars median 7 %; crash on 1
  after a fill .47 (after a groove bar .12); cymbals in 22 % of groove bars, ride 26 % of cymbal hits.
- **Bass (118 songs):** 6.0 notes/bar, 99 % on 8th positions; **constant 8th pulse in 26 % of bars**
  (the most of the targets), constant 16ths in 5 %; songs where ≥ half the bars are a constant pulse
  **34 %** (8th 29 %, 16th 5 %). Note length median 1.7 steps, gate 0.83. Repeats 51 %, octave moves
  ≥ 25 % in 19 % of songs. Register 31/36/41. **Flat bass velocity in 40 % of files** (CV in a bar
  0.05). Synth-bass programs (GM 38/39) in 32 % of songs.
- **Harmony (weak):** 34 % minor. Minor songs: bIII .78, bVII .75, bVI .70, minor v .38, major V .25,
  major IV .30. Major songs: bVII .28.
- **Other parts:** pads in 72 % of songs (strings ensemble 66, synth pad 22 of 144 parts), arps in
  14 % (62 % of them 16th-grid, span 12 st/bar), synth-lead or -pad programs in 37 %.

## Data vs the guide notes

| guide claim | where | measured | verdict |
|---|---|---|---|
| Tempo 112–128 (default) | drums, melodic | folded median 126 (IQR 117–136) | **confirmed** |
| Swing: straight default; "Linn swing" 58–64 % in ≤ 25 % | drums Sp-swing-1 | 0 % of measured songs ≥ 4 ticks; 6 % of files skipped as triplet-grid | straight **confirmed**; a Linn-swing family is not visible (≤ 5 %) |
| Kick weights: A boom-thwack 1/9 40 %, B 4otf 35 %, C syncopated 25 % | drums (proposal) | 1+9 47 %, 4otf 32 %; off-beat kicks on 7 (.29) and 11 (.18) | **confirmed** (close to the proposed weights) |
| Kick on bar-2 step 16 | drums | step 16 P .02 | rare |
| "Blue Monday" 16th kick run | drums | even-step kicks ≤ .05 | a quote-level idiom, not a family |
| Snare on 5/13 every groove bar | drums Sp-snr-1 | .79/.79; backbeat songs 72 % | **confirmed** (not 100 %) |
| Clap layer "often" | drums | clap = 9 % of snare-lane notes (Italo 17 %, EBM 19 %) | **weaker than the guide** |
| No ghosts | drums | median ghost share 0 | **confirmed** |
| Velocity two- or three-level, never a continuous spread (≤ 3 distinct) | drums Sp-vel-1 | ≤ 3 distinct: kick 55 %, snare 50 %, hat 37 % of songs | **partly** — kick/snare yes for half the songs; hats carry a median 8 distinct levels |
| Hat weights 16ths 45 %, 8ths 35 %, quarters 20 % | drums (proposal) | 16ths 14 %, 8ths 36 %, quarters ~7 %, none 13 % | **16ths over-weighted** (transcriptions often reduce 16th hats to 8ths — see README caveat 1 — but even so, 8ths lead) |
| Open hat once per bar on 15, or on 7 + 15 | drums | open-hat P .15–.19 on all four off-8ths, 15 highest | **confirmed** (off-8th placement) |
| Tom lane empty in groove bars; fills ≤ 30 % | drums Sp-tom-1 | toms in groove bars in 4 % of songs; fill bars 7 % | **confirmed** |
| Cabasa / shaker 16ths | drums | perc lane 48 %; modal perc bar = 16ths in 14 % of songs | **supported** |
| Bass: flat velocity (CV ≤ 0.05) | melodic SP-1 | 40 % of files flat; CV in a bar median 0.05 | **confirmed** |
| Bass: constant 16th/8th grid in ≥ 90 % | melodic SP-2 | 34 % of songs are mostly a constant pulse (8th 29 %, 16th 5 %) | **contradicted** — the sequenced pulse is the biggest single family but a third of songs, and 8ths beat 16ths ~6:1 |
| Bass octave family: octave share ≥ 40 % | melodic SP-3 | ≥ 25 % octaves in 19 % of songs; median .01 | an octave family of ~1 in 5 songs; not the default |
| Bass staccato, gate 40–60 % | melodic | gate median 0.83; ½–1-step notes 26 %, 1–2 steps 43 % | **contradicted** — bass is legato-ish in these files |
| Register MIDI 28–52 | melodic | 31/36/41 | **confirmed** |
| Minor songs use bVI or bVII or minor v (≥ 60 %) | melodic SP-6 | bVII .75, bVI .70, v .38 | **confirmed** |
| Major songs contain bVII 56 % (D5 highest) | melodic | 28 % (rock 36 %) | **not reproduced** (weak method; D5 stays the source) |
| Arps 1/8 or 1/16 up, 1–2 octaves | melodic | arps in 14 % of songs; 62 % 16th-grid, 10 % 8th-grid; span 12 st/bar | arps are a **minority part**; when present, 16ths and about an octave |
| Strings / polysynth pad bed | melodic | pads 72 % of songs (the most of the targets after Italo) | **confirmed** |

## Full tables (generated by `analysis/lmd_report.py`; copy of `analysis/out/synthpop_tables.md`)

**Corpus:** 144 songs selected, **118 measured** (71 artists); skipped {'fewgroove': 3, 'triplet': 9, 'nodrums': 3, 'phase': 6, 'error': 2, 'meter': 2, 'offgrid': 1}. Drums FLAT (≤ 2 distinct velocities): 14% of measured songs (102 songs carry velocity stats).
**Tempo (file tempo map):** median 124 BPM, IQR 108–132; folded into 90–180: median 126, IQR 117–136.
**Swing (even-16th hat delay, ticks @ 96 PPQN):** median 0.0, IQR 0.0–0.0; songs ≥ 4 ticks: 0%. Files with a triplet/shuffle grid were skipped (9).
**Fills:** median fill-bar share 0.07; P(crash on 1 | after fill) 0.47, | after groove 0.12. Kit (kick+snare+hat) bar-to-bar repeat: median 0.70.

**Drum families (share of songs):** kick 4otf 32%; kick 1+9 (no 5/13) 47%; kick even-16th share>.1 15%; snare backbeat 5+13 72%; snare half-time 9 2%; hat 16ths (>=12/bar) 14%; hat 8ths (6-9/bar) 36%; hat off-beat only (3/7/11/15, <=5/bar) 4%; hat none/rare (<1/bar) 13%; toms in groove (>=.25 bars) 4%; perc lane (>=.5 bars) 48%

**Kick even-16th share (median song):** 0.00. **Hat tiering** (beat-hat vel − off-8th-hat vel, dynamic songs): median 5.2, IQR 0.0…15.9 (n=71). **Snare ghost share** (vel ≤ 45 off the backbeat, dynamic songs): median 0.00; songs with > 10 % ghosts: 0.03.
**Distinct velocities per lane** (all songs using the lane): kick ≤ 2 in 48% (≤ 3 in 55%); snare ≤ 2 in 41% (≤ 3 50%); hat ≤ 2 in 34% (≤ 3 37%).

### Drums — onset probability (P) and mean velocity per 16th step, groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KICK P | .94 | .00 | .07 | .04 | .38 | .01 | .29 | .05 | .84 | .01 | .18 | .04 | .37 | .02 | .16 | .02 |
| kick vel | 110 | 93 | 89 | 95 | 114 | 103 | 97 | 90 | 110 | 101 | 103 | 92 | 114 | 100 | 96 | 88 |
| SNARE P | .08 | .01 | .04 | .02 | .79 | .01 | .05 | .04 | .10 | .01 | .07 | .03 | .79 | .01 | .09 | .04 |
| snare vel | 91 | 19 | 88 | 79 | 104 | 65 | 92 | 69 | 95 | 21 | 93 | 71 | 104 | 72 | 98 | 74 |
| HAT P | .70 | .16 | .69 | .20 | .70 | .17 | .67 | .21 | .71 | .17 | .69 | .21 | .69 | .18 | .66 | .18 |
| hat vel | 86 | 74 | 78 | 77 | 84 | 71 | 80 | 75 | 85 | 71 | 79 | 75 | 84 | 74 | 80 | 78 |
| TOM P | .02 | .00 | .02 | .00 | .03 | .00 | .02 | .01 | .02 | .00 | .02 | .00 | .03 | .00 | .02 | .01 |
| tom vel | 72 | 94 | 73 | 127 | 84 | 94 | 82 | 104 | 92 | 99 | 72 | 89 | 80 | 29 | 82 | 48 |
| PERC P | .33 | .14 | .33 | .19 | .39 | .16 | .34 | .23 | .34 | .19 | .37 | .20 | .38 | .18 | .36 | .23 |
| perc vel | 79 | 54 | 72 | 59 | 82 | 59 | 72 | 65 | 78 | 58 | 74 | 63 | 85 | 61 | 75 | 69 |
| CYMB P | .16 | .00 | .05 | .00 | .10 | .00 | .06 | .01 | .07 | .00 | .06 | .00 | .09 | .00 | .07 | .01 |
| cymb vel | 93 | – | 80 | 127 | 86 | 127 | 81 | 87 | 85 | – | 86 | 127 | 90 | 127 | 87 | 75 |
| open-hat P | .07 | .00 | .15 | .02 | .04 | .00 | .17 | .02 | .03 | .00 | .18 | .03 | .05 | .01 | .19 | .02 |

| lane | songs using (≥ 25 % bars) | hits/bar (median song) | vel median | vel SD (median song) | distinct vels (median) | commonest notes (share) | commonest modal bar (share of songs) |
|---|---|---|---|---|---|---|---|
| kick | 98% | 3.4 | 110 | 3.9 | 4 | kick 0.54, kick2 0.44 | `x...x...x...x...` 0.33, `x.......x.......` 0.14, `x.....x.x.......` 0.14 |
| snare | 94% | 2.0 | 104 | 3.2 | 5 | snare 0.62, e-snare 0.27, clap 0.09 | `....x.......x...` 0.75, `x...x...x...x...` 0.03, `x.......x.......` 0.02 |
| hat | 88% | 7.5 | 79 | 9.6 | 8 | closed hat 0.63, open hat 0.17, pedal hat 0.12 | `x.x.x.x.x.x.x.x.` 0.34, `xxxxxxxxxxxxxxxx` 0.13, `x...x...x...x...` 0.07 |
| tom | 4% | 0.0 | 87 | 7.8 | 10 | lo-floor tom 0.15, low tom 0.13, hi-floor tom 0.12, lo-mid tom 0.09 | `x.x.x.x.x.x.x.x.` 0.02, `x.x...xxx.x...xx` 0.01, `....x.......x...` 0.01 |
| perc | 57% | 2.0 | 76 | 11.5 | 10 | tambourine 0.16, maracas 0.10, side-stick 0.06, cabasa 0.05 | `xxxxxxxxxxxxxxxx` 0.14, `x.x.x.x.x.x.x.x.` 0.05, `....x.......x...` 0.05 |
| cymb | 32% | 0.2 | 87 | 7.2 | 7 | crash 0.41, ride 0.13, crash2 0.12, splash 0.07 | `x.x.x.x.x.x.x.x.` 0.05, `....x.......x...` 0.02, `x...x...x...x...` 0.02 |

Open-hat share of hat hits: 0.18. Ride share of cymbal hits: 0.26.

### Bass (118 songs; source {'program': 109, 'lowest': 9})

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BASS P | .94 | .10 | .48 | .15 | .60 | .08 | .71 | .17 | .76 | .11 | .55 | .11 | .63 | .09 | .62 | .12 |

- notes/bar 6.0 (IQR 4.0–7.8); share of onsets on 8th positions 0.99 (IQR 0.82–1.00)
- **sequencer-ness:** bars that are a constant 16th pulse 5%, constant 8th pulse 26%; songs where ≥ half the bass bars are a constant 8th/16th pulse 34% (16th 5%, 8th 29%)
- note length (16ths) median 1.71 (IQR 1.19–2.00); gate ratio (length ÷ gap to next onset) 0.83 (IQR 0.60–0.95); length histogram ≤½ / ½–1 / 1–2 / 2–4 / 4–8 / > 8 steps: 0.03 / 0.26 / 0.43 / 0.16 / 0.09 / 0.03
- register (MIDI) p10/median/p90 of the median song: 31 / 36 / 41
- intervals between consecutive notes: repeat 0.51 (IQR 0.19–0.77), step 1–2 st 0.11 (IQR 0.03–0.25), leap 3–11 st 0.13 (IQR 0.06–0.28), **octave 0.01 (IQR 0.00–0.08)**; songs with ≥ 25 % octave moves 19%
- pitch classes per bar 1.71 (IQR 1.22–2.32); flat-velocity bass 40%; velocity CV within a bar (non-flat) 0.05 (IQR 0.03–0.07)
- programs: 33 (31), 38 (19), 39 (19), 35 (19), 34 (7), 32 (7)
- scale degrees of bass notes, maj songs (n=78): 1 0.28, 5 0.19, 4 0.17, 2 0.12, 6 0.11, 3 0.06, b7 0.03
- scale degrees of bass notes, min songs (n=40): 1 0.31, b7 0.15, b6 0.13, b3 0.12, 5 0.12, 4 0.11, 2 0.03

### Key and harmony (estimated; minor share 34%)

- **maj songs (n=78)** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes power chords and sus): IV 0.94, V 0.86, vi 0.59, ii 0.50, iii 0.31, bVII 0.28, bIII 0.18, bVI 0.14
  - commonest labels: I 0.91, IV 0.81, I5 0.69, V 0.68, vi 0.56, V5 0.53, IV5 0.44, ii 0.37, ii7 0.27, iii 0.24, II5 0.22, vi7 0.22
  - half-bar chord qualities: maj 0.50, 5 0.21, min 0.14, m7 0.05, sus2 0.03, sus4 0.02, add9 0.02, maj7 0.02; chord change per half-bar (median) 0.51
- **min songs (n=40)** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes power chords and sus): bVII 0.75, bVI 0.70, bIII 0.78, iv 0.42, IV (maj/7, Dorian) 0.30, v (minor) 0.38, V (maj/7, harmonic) 0.25, bII 0.12
  - commonest labels: i 0.85, I5 0.68, bVI 0.65, bIII 0.62, bVII 0.57, iv 0.42, IV5 0.42, bVII5 0.38, V5 0.38, v 0.33, bVI5 0.28, IV 0.25
  - half-bar chord qualities: maj 0.36, min 0.32, 5 0.20, m7 0.04, sus2 0.02, maj7 0.01, add9 0.01, sus4 0.01; chord change per half-bar (median) 0.50

### Other parts (role by polyphony / rhythm heuristic, see README)

| role | parts | songs with | families | onsets/bar | poly | note len (16ths) | gate | register p10/med/p90 | pcs/bar | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| chord | 269 | 86% | piano 65, guitar 54, ensemble 43 | 4 | 2.12 | 1.7 | 0.67 | 59/66/72 | 3.2 | qualities maj 0.48, 5 0.29, min 0.15, m7 0.03, sus4 0.01 |
| pad | 144 | 72% | ensemble 66, synthpad 22, piano 20 | 1.2 | 2.42 | 15.8 | 0.99 | 58/64/70 | 2.7 | qualities maj 0.46, min 0.21, 5 0.21, m7 0.06, sus2 0.02 |
| arp | 21 | 14% | guitar 8, piano 4, chromperc 2 | 11 | 1 | 1.0 | 0.58 | 55/64/72 | 4 | 16th-grid 62%, 8th-grid 10%, span/bar 12 st |
| lead | 362 | 95% | guitar 59, ensemble 54, reed 36 | 3.9 | 1.00 | 2.0 | 0.87 | 64/69/74 | 2.5 | repeat 0.30, step 1–2 0.32, 3rds 0.17, 4/5th 0.14, oct 0.06; descending 0.52 |
| other | 105 | 58% | piano 17, bass 17, guitar 16 | 4.3 | 1 | 1.9 | 0.88 | 45/50/57 | 2 |  |

Instrument-family presence (share of songs): ensemble 80%, piano 70%, bass:other 68%, guitar 59%, brass 39%, synthlead 37%, synthpad 37%, bass:synth 32%, reed 30%, organ 23%, chromperc 22%, bass 20%, synthfx 18%, pipe 18%
