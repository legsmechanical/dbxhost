# DNB — reference statistics

**10 songs measured** (10 selected), 7 artists; sources {'lmd': 10}; eras {'?': 3, 'new': 7}. Every table: `analysis/out/dnb_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **90 / 119 / 167**; file BPM q1/med/q3 90 / 114 / 128; minor share **0.7**.

## Findings

⚠ **Failed positive control.** Only 10 songs measured, and their file tempos (p50 114, p90 128) are not drum-and-bass tempos: most are half-time transcriptions or mislabelled tracks; only 2 files sit at 170–174 BPM. Use `research/drums/dnb.md` (GMD-measured) for drums, and this file only for the chord-sheet loops (89 sheets: i–VII–VI 15 %).

Flavours filed under this style: **JUNGLE** (1 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.44 (0.39–1.01). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i v VI III | 0.29 | 0.07 |
| i v | 0.14 | 0.14 |
| i v III | 0.14 | 0.08 |
| i v VI | 0.14 | 0 |
| i VII | 0.14 | 0.03 |
| i VII VI VII | 0.14 | 0.03 |
| i VII VI | 0.14 | 0.05 |
| i VII i VI | 0.14 | 0.03 |
| i VII #IV | 0.14 | 0.1 |
| i io i VII | 0.14 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV V ii | 0.5 | 0.15 |
| I IV vi ii | 0.5 | 0.2 |
| I ii V ii | 0.5 | 0.05 |
| IV V ii V | 0.5 | 0.04 |
| V ii | 0.5 | 0.04 |
| I ii vi ii | 0.5 | 0.02 |
| I iii VI | 0.5 | 0.22 |
| I IV V IV | 0.5 | 0.08 |
| I iii V IV | 0.5 | 0.03 |
| I iii VI IV | 0.5 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 89 songs, minor share 0.55; share of songs containing the loop ≥ 2×): i VII VI (min) 0.15, I V IV V (maj) 0.12, I IV V (maj) 0.1, I IV (maj) 0.1, I IV V IV (maj) 0.09, I V vi IV (maj) 0.08, I IV I V (maj) 0.08, i VI VII (min) 0.07. By era: new (59 songs, minor 0.61): i VII VI (min) 0.17, i VI VII (min) 0.09, I V IV V (maj) 0.09, i III VI VII (min) 0.07

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (10 songs, in 1 of songs)
- onsets/bar 6.5 (4.1–7.8); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,3,4,5,7,9,11,12,13,15
- syncopation: LHL/bar 0.8 (0.1–1.6), off-16th onset share 0.19 (0–0.43)
- length 1.54 (1–3.48) 16ths, gate (length ÷ gap to next onset) 0.99 (0.69–1)
- velocity mean 104 ± 9.1 (flat files 0.4); accents step 13 +6, step 6 +5, step 1 +4; weakest step 10 -6, step 16 -5
- register (MIDI, transposed to C) 36 (36–40)
- degrees (min): 1 0.51, 5 0.14, b7 0.1, b3 0.08, b6 0.07, 4 0.07
- intervals: repeat 0.72 (0.4–0.93), step 1–2 0.13 (0.02–0.21), skip 3–4 0.02 (0.01–0.06), leap 5–7 0.06 (0–0.19), octave 0 (0–0.01), descending share of moves 0.49 (0.48–0.5)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.1, 2-bar 0.02, 4-bar 0.23, longer 0.65; rhythm only: 1-bar 0.4, 2-bar 0.01, 4-bar 0.07, longer 0.52

**chord** (5 songs, in 0.5 of songs)
- onsets/bar 4 (3–4); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,13,15
- syncopation: LHL/bar 1.4 (1.1–2.5), off-16th onset share 0.05 (0.03–0.26)
- length 2 (2–2) 16ths, gate (length ÷ gap to next onset) 0.95 (0.46–0.99)
- velocity mean 92 ± 9.1 (flat files 0.2); accents step 1 +5, step 3 +2, step 4 +1; weakest step 14 -11, step 8 -4
- register (MIDI, transposed to C) 63 (60–67)
- degrees (min): 1 0.17, 5 0.16, 4 0.15, b3 0.14, b7 0.13, b6 0.11
- chords: voices 2 (2–3), spread 8 st, inversion share 0 (0–0.11), changes/bar 1.92 (1.8–2.11), qualities pow 0.74, maj 0.11, min 0.1, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.04, longer 0.96; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.04, longer 0.96

**pad** (7 songs, in 0.7 of songs)
- onsets/bar 2 (1.5–3.5); steps with P ≥ .5: 1; P ≥ .3: 1,15
- syncopation: LHL/bar 0.9 (0–2.5), off-16th onset share 0 (0–0)
- length 8 (1.98–10.5) 16ths, gate (length ÷ gap to next onset) 0.85 (0.57–0.99)
- velocity mean 73 ± 8.8 (flat files 0.43); accents step 14 +7, step 10 +5, step 2 +4; weakest step 9 -5, step 11 -4
- register (MIDI, transposed to C) 62 (58–67)
- degrees (min): 1 0.2, 5 0.2, b3 0.17, b7 0.15, 2 0.12, b6 0.08
- chords: voices 2.9 (2.2–3), spread 7 st, inversion share 0.04 (0–0.24), changes/bar 0.97 (0.6–1.29), qualities pow 0.5, min 0.33, maj 0.15, dim 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.33, longer 0.67; rhythm only: 1-bar 0.5, 2-bar 0, 4-bar 0.5, longer 0

**keys** (3 songs, in 0.3 of songs)
- onsets/bar 8 (4.5–8.5); steps with P ≥ .5: 1,3,5,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0 (0–1.9), off-16th onset share 0 (0–0.22)
- length 2 (1.4–15.6) 16ths, gate (length ÷ gap to next onset) 0.91 (0.66–0.96)
- velocity mean 77 ± 11.1 (flat files 0.33); accents step 15 +5, step 1 +2, step 9 +1; weakest step 3 -4, step 11 -3
- register (MIDI, transposed to C) 59 (55–62)
- degrees (min): b7 0.22, 1 0.21, b3 0.2, 4 0.17, 5 0.12, 2 0.05
- chords: voices 3 (3–3), spread 9 st, inversion share 0.66 (0.33–0.7), changes/bar 1.53 (1.19–2.23), qualities maj 0.5, pow 0.33, min 0.17
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.5, 4-bar 0, longer 0.5; rhythm only: 1-bar 0, 2-bar 0.75, 4-bar 0, longer 0.25

**guitar** (7 songs, in 0.7 of songs)
- onsets/bar 7 (5–8.5); steps with P ≥ .5: 1,3,5,7,9,11,15; P ≥ .3: 1,3,5,7,9,11,12,13,15
- syncopation: LHL/bar 1.5 (1.1–2.8), off-16th onset share 0.12 (0–0.39)
- length 1.29 (0.95–1.95) 16ths, gate (length ÷ gap to next onset) 0.87 (0.71–1)
- velocity mean 89 ± 11.7 (flat files 0.43); accents step 14 +9, step 5 +7, step 13 +6; weakest step 8 -11, step 16 -11
- register (MIDI, transposed to C) 59 (53–63)
- degrees (min): 1 0.28, 5 0.27, b3 0.12, b6 0.09, b7 0.09, 2 0.04
- chords: voices 3 (3–3.1), spread 10 st, inversion share 0.17 (0.02–0.32), changes/bar 1.37 (1.01–2.27), qualities pow 0.39, maj 0.33, min 0.28
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.02, 4-bar 0.3, longer 0.63; rhythm only: 1-bar 0.28, 2-bar 0.18, 4-bar 0.1, longer 0.45

**lead** (9 songs, in 0.9 of songs)
- onsets/bar 3 (3–4); steps with P ≥ .5: none; P ≥ .3: 1,3,5,7,9,13,15
- syncopation: LHL/bar 2.8 (2.2–4), off-16th onset share 0.05 (0–0.31)
- length 2 (1.6–3) 16ths, gate (length ÷ gap to next onset) 1 (0.86–1)
- velocity mean 101 ± 10.3 (flat files 0.33); accents step 4 +8, step 5 +2, step 12 +1; weakest step 8 -4, step 6 -3
- register (MIDI, transposed to C) 67 (62–68)
- degrees (min): 2 0.2, 5 0.19, 1 0.18, b3 0.16, 4 0.1, b7 0.07
- intervals: repeat 0.3 (0.03–0.36), step 1–2 0.37 (0.3–0.47), skip 3–4 0.14 (0.13–0.21), leap 5–7 0.03 (0.03–0.1), octave 0 (0–0.01), descending share of moves 0.54 (0.47–0.63)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.2, 4-bar 0.05, longer 0.75; rhythm only: 1-bar 0, 2-bar 0.2, 4-bar 0.05, longer 0.75

**seq** (1 songs, in 0.1 of songs)
- onsets/bar 8 (8–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.5–0.5), off-16th onset share 0 (0–0)
- length 2 (2–2) 16ths, gate (length ÷ gap to next onset) 1 (1–1)
- velocity mean 76 ± 19.3 (flat files 0); accents step 13 +2, step 9 +1, step 5 +1; weakest step 7 -2, step 3 -1
- register (MIDI, transposed to C) 34 (31–36)
- degrees (min): 1 0.3, 4 0.19, b7 0.18, 5 0.13, b3 0.08, 2 0.05
- intervals: repeat 0.78 (0.78–0.78), step 1–2 0.1 (0.1–0.1), skip 3–4 0.03 (0.03–0.03), leap 5–7 0.08 (0.08–0.08), octave 0.01 (0.01–0.01), descending share of moves 0.43 (0.43–0.43)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.13, longer 0.87; rhythm only: 1-bar 0.27, 2-bar 0, 4-bar 0.2, longer 0.53

**fx** (3 songs, in 0.3 of songs)
- onsets/bar 4 (4–8); steps with P ≥ .5: 3,7,11,15; P ≥ .3: 2,3,4,6,7,8,10,11,12,14,15,16
- syncopation: LHL/bar 7 (5–8.3), off-16th onset share 0.44 (0.22–0.54)
- length 0.38 (0.3–0.69) 16ths, gate (length ÷ gap to next onset) 0.25 (0.23–0.29)
- velocity mean 88 ± 11 (flat files 0); accents step 13 +16, step 12 +13, step 1 +8; weakest step 9 -33, step 5 -19
- register (MIDI, transposed to C) 70 (67–72)
- degrees (min): 1 0.24, 5 0.21, b3 0.17, b7 0.13, 4 0.09, 2 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.5, 2-bar 0, 4-bar 0, longer 0.5

**drums** (9 songs with a usable kit; flat-velocity files 0.11)
- families: kick_4otf 0.22, kick_1_and_9_only 0.56, snare_backbeat_5_13 0.56, snare_halftime_9 0, hat_16ths 0.11, hat_8ths 0.33, hat_offbeat_only 0, hat_none 0.22
- kick: hits/bar 4 (3.8–4.3), songs using 0.89, P ≥ .5 at steps 1,9, P ≥ .2 at 1,4,5,9,11,12,13; vel 102 ± 7
- snare: hits/bar 2 (1.8–2.6), songs using 0.89, P ≥ .5 at steps 5,13, P ≥ .2 at 5,7,13,15; vel 109 ± 3.6
- hat: hits/bar 7.7 (4.2–8), songs using 0.78, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 91 ± 4.3
- perc: hits/bar 0.9 (0–1.4), songs using 0.22, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,10,11,12,13,15; vel 52 ± 13.2
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0 (0–0.7), songs using 0.44, P ≥ .5 at steps none, P ≥ .2 at none; vel 77 ± 20.2
- open-hat share of hat hits 0.1, ride share of cymbals 0.13, fill-bar share 0

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### JUNGLE (1 songs, 1 artists; sources {'lmd': 1}; distinctness –)


Tempo p10/p50/p90 135 / 135 / 135; minor share 1.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i vii iv | 1 | 0.63 |
| i iv vii iv | 1 | 0.24 |
| i vii i iv | 1 | 0.04 |
| i vii | 1 | 0.03 |
| i vii iv vii | 1 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 24 songs, minor share 0.5; share of songs containing the loop ≥ 2×): I IV V (maj) 0.21, I IV I V (maj) 0.21, I vi IV V (maj) 0.21, I V IV V (maj) 0.17, I IV (maj) 0.17, I V I IV (maj) 0.12, I V IV (maj) 0.12, I IV V IV (maj) 0.12

