# METAL — reference statistics

**169 songs measured** (210 selected), 124 artists; sources {'lmd': 169}; eras {'new': 71, '80s': 36, '?': 28, '90s': 34}; era splits: {'80s': 36, 'new': 71}. Every table: `analysis/out/metal_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **98 / 130 / 160**; file BPM q1/med/q3 97 / 120 / 140; minor share **0.61**.

## Findings

Minor 62 % with a phrygian lean (12 of 169 songs; industrial 8 of 52). Bass is legato 8ths locked to the guitar (P ≥ .5 on every 8th except 3, gate 1.0), guitar register MIDI 53. Kick spreads over all 16ths (even-step P .10–.17 — double-kick runs), open hat/crash wash 46 % of hat hits, 42 % flat-velocity files. Minor loops i–VI–VII, i–VI, i–iv; chord sheets confirm i–VI–VII as the top metal loop (12 % of 16k sheets).

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.87 (0.61–1.16). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI VII | 0.14 | 0.03 |
| i VI | 0.14 | 0.04 |
| i iv | 0.13 | 0.03 |
| i VII | 0.12 | 0.03 |
| i III | 0.11 | 0.03 |
| i VII VI VII | 0.11 | 0.02 |
| i v | 0.08 | 0.02 |
| i VI III VII | 0.07 | 0.01 |
| i VII VI v | 0.07 | 0.02 |
| i v VI VII | 0.07 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.23 | 0.05 |
| I V | 0.2 | 0.04 |
| I IV V | 0.2 | 0.04 |
| I IV V IV | 0.16 | 0.01 |
| I IV I V | 0.14 | 0.01 |
| I V IV | 0.14 | 0.01 |
| I V IV V | 0.14 | 0.03 |
| I V vi V | 0.12 | 0.01 |
| IV V vi | 0.12 | 0.02 |
| I vi IV V | 0.11 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 16129 songs, minor share 0.43; share of songs containing the loop ≥ 2×): i VI VII (min) 0.12, I IV (maj) 0.11, I V IV (maj) 0.11, i VII VI VII (min) 0.1, I V vi IV (maj) 0.09, I IV V IV (maj) 0.08, i VI III VII (min) 0.07, I V IV V (maj) 0.07. By era: 80s (3426 songs, minor 0.33): I IV (maj) 0.16, I V IV (maj) 0.14, I IV V IV (maj) 0.13, i VI VII (min) 0.11; new (9906 songs, minor 0.49): i VI VII (min) 0.13, i VII VI VII (min) 0.11, I V vi IV (maj) 0.09, I V IV (maj) 0.09

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (163 songs, in 0.96 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.2–1.4), off-16th onset share 0.1 (0–0.28)
- length 2 (1.33–2) 16ths, gate (length ÷ gap to next onset) 1 (0.84–1)
- velocity mean 102 ± 8.1 (flat files 0.61); accents step 9 +2, step 1 +1, step 13 +1; weakest step 16 -3, step 6 -2
- register (MIDI, transposed to C) 34 (31–36)
- degrees (min): 1 0.37, b6 0.11, 5 0.1, b7 0.1, b3 0.1, 4 0.09
- intervals: repeat 0.59 (0.38–0.76), step 1–2 0.14 (0.08–0.27), skip 3–4 0.04 (0.02–0.09), leap 5–7 0.08 (0.04–0.13), octave 0.01 (0–0.04), descending share of moves 0.5 (0.45–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.04, 4-bar 0.12, longer 0.83; rhythm only: 1-bar 0.21, 2-bar 0.05, 4-bar 0.08, longer 0.66

**chord** (31 songs, in 0.18 of songs)
- onsets/bar 4 (3–7); steps with P ≥ .5: 1,7,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.4 (0.4–2.9), off-16th onset share 0.25 (0–0.39)
- length 1.82 (0.68–2) 16ths, gate (length ÷ gap to next onset) 0.67 (0.46–0.99)
- velocity mean 99 ± 11.3 (flat files 0.45); accents step 9 +3, step 15 +1, step 1 +1; weakest step 8 -4, step 14 -3
- register (MIDI, transposed to C) 67 (62–72)
- degrees (min): 1 0.2, 5 0.15, b3 0.14, 4 0.12, b7 0.11, 2 0.08
- chords: voices 2.2 (2–2.9), spread 9 st, inversion share 0.5 (0.29–0.85), changes/bar 1.82 (1.41–2.71), qualities pow 0.58, maj 0.22, min 0.1, sus 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.11, longer 0.82; rhythm only: 1-bar 0.16, 2-bar 0.08, 4-bar 0.1, longer 0.66

**pad** (78 songs, in 0.46 of songs)
- onsets/bar 2 (1–3.4); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.4 (0–1.2), off-16th onset share 0 (0–0.08)
- length 7.92 (2–15.9) 16ths, gate (length ÷ gap to next onset) 1 (0.91–1)
- velocity mean 86 ± 10.6 (flat files 0.44); accents step 12 +4, step 13 +3, step 14 +3; weakest step 3 -2, step 5 -0
- register (MIDI, transposed to C) 63 (60–69)
- degrees (min): 1 0.21, 5 0.19, b3 0.14, 4 0.11, b7 0.1, b6 0.09
- chords: voices 2.9 (2.2–3.1), spread 12 st, inversion share 0.48 (0.17–0.7), changes/bar 1.34 (0.95–1.94), qualities pow 0.4, maj 0.29, min 0.21, sus 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.17, longer 0.76; rhythm only: 1-bar 0.17, 2-bar 0.12, 4-bar 0.15, longer 0.57

**keys** (66 songs, in 0.39 of songs)
- onsets/bar 4 (3–8); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.2–1.7), off-16th onset share 0.08 (0–0.25)
- length 2.29 (1.86–4.6) 16ths, gate (length ÷ gap to next onset) 0.99 (0.86–1)
- velocity mean 95 ± 10.9 (flat files 0.42); accents step 13 +1, step 12 +1, step 5 +0; weakest step 6 -9, step 8 -5
- register (MIDI, transposed to C) 62 (58–67)
- degrees (min): 1 0.24, 5 0.2, b3 0.15, 4 0.1, b7 0.1, 2 0.08
- chords: voices 2.8 (2.2–3.3), spread 10 st, inversion share 0.42 (0.22–0.64), changes/bar 1.53 (0.95–2.4), qualities pow 0.38, maj 0.35, min 0.16, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.01, 4-bar 0.09, longer 0.88; rhythm only: 1-bar 0.15, 2-bar 0.03, 4-bar 0.08, longer 0.73

**guitar** (145 songs, in 0.86 of songs)
- onsets/bar 7 (5–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.3–1.9), off-16th onset share 0.15 (0–0.31)
- length 2 (1–2) 16ths, gate (length ÷ gap to next onset) 1 (0.95–1)
- velocity mean 94 ± 9.9 (flat files 0.56); accents step 1 +2, step 9 +2, step 13 +1; weakest step 8 -3, step 3 -3
- register (MIDI, transposed to C) 53 (48–57)
- degrees (min): 1 0.29, 5 0.17, b3 0.12, 4 0.1, b7 0.1, b6 0.08
- chords: voices 2.5 (2.1–3), spread 7 st, inversion share 0.08 (0–0.39), changes/bar 1.25 (0.69–2.1), qualities pow 0.75, maj 0.15, min 0.05, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.05, 4-bar 0.13, longer 0.79; rhythm only: 1-bar 0.18, 2-bar 0.06, 4-bar 0.11, longer 0.66

**lead** (108 songs, in 0.64 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.1 (1.2–2.8), off-16th onset share 0.07 (0–0.27)
- length 2 (1.77–3.21) 16ths, gate (length ÷ gap to next onset) 1 (0.84–1)
- velocity mean 100 ± 7.8 (flat files 0.58); accents step 1 +1, step 5 +1, step 2 +0; weakest step 10 -3, step 14 -2
- register (MIDI, transposed to C) 68 (65–72)
- degrees (min): 1 0.23, 5 0.17, b3 0.17, 4 0.12, b7 0.11, 2 0.1
- intervals: repeat 0.22 (0.08–0.35), step 1–2 0.45 (0.3–0.56), skip 3–4 0.14 (0.07–0.22), leap 5–7 0.07 (0.03–0.13), octave 0 (0–0.01), descending share of moves 0.54 (0.48–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.02, 4-bar 0.07, longer 0.9; rhythm only: 1-bar 0.07, 2-bar 0.01, 4-bar 0.08, longer 0.84

**arp** (18 songs, in 0.11 of songs)
- onsets/bar 9 (8–13.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.7 (0.2–1.5), off-16th onset share 0.39 (0.06–0.49)
- length 1 (0.96–1.9) 16ths, gate (length ÷ gap to next onset) 0.97 (0.85–1)
- velocity mean 90 ± 10.5 (flat files 0.44); accents step 10 +2, step 2 +1, step 16 +1; weakest step 4 -4, step 3 -1
- register (MIDI, transposed to C) 65 (64–72)
- degrees (min): 1 0.2, 5 0.15, b3 0.14, 2 0.12, 4 0.1, b7 0.1
- intervals: repeat 0 (0–0.1), step 1–2 0.25 (0.11–0.36), skip 3–4 0.12 (0.07–0.25), leap 5–7 0.24 (0.11–0.46), octave 0.01 (0–0.11), descending share of moves 0.49 (0.45–0.51)
- arp shape up 0.14, down 0.05, updown 0.25, random 0.56, static 0; spacing (16ths) {'1.0': 10, '2.0': 8}; octave span 0.83 (0.68–1.21)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0, 4-bar 0.12, longer 0.86; rhythm only: 1-bar 0.34, 2-bar 0.04, 4-bar 0.08, longer 0.54

**seq** (26 songs, in 0.15 of songs)
- onsets/bar 8 (4.2–12); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.8 (0–2.2), off-16th onset share 0.21 (0–0.47)
- length 1.33 (0.92–2.95) 16ths, gate (length ÷ gap to next onset) 0.97 (0.54–1)
- velocity mean 94 ± 10.2 (flat files 0.61); accents step 4 +4, step 15 +1, step 5 +1; weakest step 14 -8, step 2 -6
- register (MIDI, transposed to C) 61 (58–64)
- degrees (min): 1 0.22, b3 0.15, 2 0.13, 5 0.11, 4 0.1, b6 0.09
- intervals: repeat 0.29 (0–0.5), step 1–2 0.26 (0.06–0.41), skip 3–4 0.09 (0–0.23), leap 5–7 0.12 (0.07–0.33), octave 0 (0–0.02), descending share of moves 0.49 (0.45–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0, 4-bar 0.26, longer 0.69; rhythm only: 1-bar 0.35, 2-bar 0.01, 4-bar 0.07, longer 0.57

**fx** (16 songs, in 0.1 of songs)
- onsets/bar 4.2 (2–7.2); steps with P ≥ .5: 1; P ≥ .3: 1,3,4,5,7,9,11,13
- syncopation: LHL/bar 2.1 (1.3–3.4), off-16th onset share 0.12 (0–0.43)
- length 2.17 (0.98–7.92) 16ths, gate (length ÷ gap to next onset) 0.99 (0.8–1)
- velocity mean 87 ± 10.5 (flat files 0.44); accents step 14 +6, step 4 +4, step 2 +3; weakest step 11 -2, step 9 -2
- register (MIDI, transposed to C) 70 (67–74)
- degrees (min): 1 0.23, 2 0.16, b3 0.15, 4 0.14, b7 0.12, 5 0.11
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.3, longer 0.7; rhythm only: 1-bar 0, 2-bar 0.23, 4-bar 0.07, longer 0.7

**drums** (145 songs with a usable kit; flat-velocity files 0.42)
- families: kick_4otf 0.06, kick_1_and_9_only 0.46, snare_backbeat_5_13 0.51, snare_halftime_9 0.04, hat_16ths 0.02, hat_8ths 0.25, hat_offbeat_only 0.01, hat_none 0.1
- kick: hits/bar 3.8 (3–5.2), songs using 0.97, P ≥ .5 at steps 1,9, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 102 ± 5.2
- snare: hits/bar 2 (1.7–2.2), songs using 0.95, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 102 ± 3.1
- hat: hits/bar 4.3 (2.7–7.1), songs using 0.89, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 84 ± 12.1
- perc: hits/bar 0 (0–0.8), songs using 0.26, P ≥ .5 at steps none, P ≥ .2 at none; vel 83 ± 11.6
- tom: hits/bar 0 (0–0), songs using 0.06, P ≥ .5 at steps none, P ≥ .2 at none; vel 85 ± 13
- cymb: hits/bar 0.8 (0.2–2), songs using 0.72, P ≥ .5 at steps none, P ≥ .2 at 1; vel 94 ± 8.1
- open-hat share of hat hits 0.46, ride share of cymbals 0.25, fill-bar share 0.1

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 36 | 118 / 137 / 160 | 0.47 | 6 (4.6–8) | 0.99 (0.92–1) | 0.36 (0.21–0.44) | 0.39 | 0.06 | 0 | 0 | i iv (0.18) |
| new | 71 | 95 / 126 / 160 | 0.68 | 6 (4–8) | 1 (0.88–1) | 0.51 (0.41–0.59) | 0.51 | 0.15 | 0.08 | 0.05 | i VI (0.19) |

