# ELECTRO — reference statistics

**68 songs measured** (84 selected), 54 artists; sources {'lmd': 61, 'lamd': 7}; eras {'90s': 3, '80s': 17, 'new': 41, '?': 7}; era splits: {'80s': 17, 'new': 41}. Every table: `analysis/out/electro_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **100 / 126 / 147**; file BPM q1/med/q3 117 / 124 / 132; minor share **0.53**.

## Findings

Kick 4otf only 33 % (80s electro 6 %, modern 45 %): the electro kick is syncopated (kick P .29 at step 7, .19 at 11). Bass off-8ths as in house. Hat off-beat-only pattern shows up in 12 % of songs, more than any other style. The 80s subset (17 songs) is minor 65 %.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.99 (0.75–1.19). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.21 | 0.05 |
| i VI | 0.21 | 0.04 |
| i VI VII | 0.18 | 0.09 |
| i VI VII v | 0.18 | 0.07 |
| i VI v | 0.15 | 0.01 |
| i VII VI VII | 0.12 | 0.01 |
| VI VII | 0.09 | 0.01 |
| i VII | 0.09 | 0.02 |
| i VII III V | 0.09 | 0.01 |
| III iv | 0.06 | 0.04 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.33 | 0.12 |
| I IV I V | 0.23 | 0.04 |
| I IV V | 0.17 | 0.05 |
| I V I IV | 0.17 | 0.03 |
| I V | 0.13 | 0.05 |
| I IV V IV | 0.13 | 0.02 |
| I ii | 0.1 | 0.04 |
| I V IV | 0.1 | 0.02 |
| I V vi IV | 0.07 | 0.01 |
| I v IV | 0.07 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 1337 songs, minor share 0.44; share of songs containing the loop ≥ 2×): I IV (maj) 0.1, I V vi IV (maj) 0.09, I V IV (maj) 0.08, i VI VII (min) 0.07, I IV V (maj) 0.07, I V IV V (maj) 0.06, I IV V IV (maj) 0.06, I IV I V (maj) 0.06. By era: 80s (78 songs, minor 0.26): I IV (maj) 0.18, I IV V IV (maj) 0.13, I IV V (maj) 0.13, I V IV V (maj) 0.13; new (1018 songs, minor 0.49): I V vi IV (maj) 0.09, i VI VII (min) 0.08, I IV (maj) 0.08, I V IV (maj) 0.06

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (58 songs, in 0.85 of songs)
- onsets/bar 5.2 (4–8); steps with P ≥ .5: 1,5,7,9,13,15; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.1–2.9), off-16th onset share 0.2 (0–0.33)
- length 1.83 (1–2) 16ths, gate (length ÷ gap to next onset) 0.78 (0.51–0.97)
- velocity mean 109 ± 7.4 (flat files 0.5); accents step 1 +2, step 9 +2, step 11 +0; weakest step 16 -3, step 2 -3
- register (MIDI, transposed to C) 36 (32–39)
- degrees (min): 1 0.35, b6 0.15, 5 0.14, b7 0.13, 4 0.1, b3 0.09
- intervals: repeat 0.48 (0.28–0.78), step 1–2 0.11 (0.04–0.24), skip 3–4 0.05 (0.01–0.12), leap 5–7 0.08 (0.03–0.19), octave 0.01 (0–0.06), descending share of moves 0.5 (0.44–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.08, 4-bar 0.2, longer 0.68; rhythm only: 1-bar 0.37, 2-bar 0.04, 4-bar 0.09, longer 0.5

**chord** (21 songs, in 0.31 of songs)
- onsets/bar 4 (3–8); steps with P ≥ .5: 1,3,5,11,15; P ≥ .3: 1,3,5,6,7,9,11,12,13,14,15,16
- syncopation: LHL/bar 2 (0.5–4.1), off-16th onset share 0.34 (0–0.45)
- length 0.9 (0.56–1.55) 16ths, gate (length ÷ gap to next onset) 0.5 (0.39–0.77)
- velocity mean 94 ± 10.2 (flat files 0.24); accents step 1 +2, step 8 +0, step 2 +0; weakest step 14 -2, step 10 -1
- register (MIDI, transposed to C) 64 (60–67)
- degrees (min): 1 0.28, 5 0.19, b3 0.14, b7 0.11, 4 0.1, b6 0.07
- chords: voices 2.5 (2–3), spread 8 st, inversion share 0.49 (0.31–0.68), changes/bar 1.62 (0.97–2.12), qualities maj 0.4, pow 0.32, min 0.19, sus 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.11, 2-bar 0.06, 4-bar 0.29, longer 0.54; rhythm only: 1-bar 0.25, 2-bar 0.06, 4-bar 0.29, longer 0.4

**pad** (40 songs, in 0.59 of songs)
- onsets/bar 1 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.1 (0–1.1), off-16th onset share 0 (0–0.02)
- length 7.9 (1.99–15.92) 16ths, gate (length ÷ gap to next onset) 0.96 (0.74–1)
- velocity mean 90 ± 9.9 (flat files 0.42); accents step 2 +8, step 4 +6, step 16 +5; weakest step 6 -9, step 10 -8
- register (MIDI, transposed to C) 63 (59–67)
- degrees (min): 1 0.28, b3 0.16, 5 0.13, b7 0.12, 4 0.11, b6 0.09
- chords: voices 3 (2–3.1), spread 8 st, inversion share 0.48 (0.11–0.6), changes/bar 1.1 (0.88–1.75), qualities pow 0.38, maj 0.38, min 0.18, maj7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.06, 4-bar 0.24, longer 0.66; rhythm only: 1-bar 0.28, 2-bar 0.15, 4-bar 0.09, longer 0.47

**keys** (42 songs, in 0.62 of songs)
- onsets/bar 4.8 (3–8); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.6 (0.6–3.1), off-16th onset share 0.1 (0–0.36)
- length 1.98 (0.96–4) 16ths, gate (length ÷ gap to next onset) 0.76 (0.52–0.98)
- velocity mean 85 ± 10.2 (flat files 0.31); accents step 14 +4, step 9 +3, step 5 +2; weakest step 16 -5, step 6 -4
- register (MIDI, transposed to C) 62 (58–65)
- degrees (min): 1 0.21, b3 0.16, 5 0.16, 4 0.13, b7 0.1, b6 0.08
- chords: voices 3 (2.8–3.5), spread 8 st, inversion share 0.5 (0.3–0.64), changes/bar 1.3 (1.02–1.8), qualities maj 0.47, min 0.21, pow 0.21, maj7 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.21, longer 0.75; rhythm only: 1-bar 0.21, 2-bar 0.02, 4-bar 0.12, longer 0.64

**guitar** (31 songs, in 0.46 of songs)
- onsets/bar 5 (4–8); steps with P ≥ .5: 1,5,7,9,11,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.4 (0.3–2.8), off-16th onset share 0.08 (0–0.41)
- length 1.96 (0.89–3.44) 16ths, gate (length ÷ gap to next onset) 0.88 (0.5–1)
- velocity mean 97 ± 9.2 (flat files 0.26); accents step 14 +5, step 4 +2, step 2 +1; weakest step 6 -5, step 8 -3
- register (MIDI, transposed to C) 59 (53–62)
- degrees (min): 1 0.3, b3 0.15, 5 0.13, b7 0.13, 4 0.09, 7 0.06
- chords: voices 3 (2.3–3), spread 8 st, inversion share 0.41 (0.02–0.7), changes/bar 1.08 (0.71–1.5), qualities pow 0.5, maj 0.31, min 0.17, min7 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.18, longer 0.79; rhythm only: 1-bar 0.19, 2-bar 0.06, 4-bar 0.07, longer 0.68

**lead** (49 songs, in 0.72 of songs)
- onsets/bar 4.5 (4–5); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (0.8–3), off-16th onset share 0.12 (0–0.28)
- length 1.77 (1–2.33) 16ths, gate (length ÷ gap to next onset) 0.75 (0.57–0.9)
- velocity mean 105 ± 7.5 (flat files 0.29); accents step 1 +2, step 9 +2, step 13 +1; weakest step 16 -5, step 14 -3
- register (MIDI, transposed to C) 68 (65–72)
- degrees (min): 5 0.24, 1 0.21, b3 0.17, 4 0.12, b7 0.11, b6 0.08
- intervals: repeat 0.34 (0.13–0.47), step 1–2 0.38 (0.2–0.5), skip 3–4 0.14 (0.05–0.19), leap 5–7 0.07 (0.03–0.12), octave 0 (0–0.01), descending share of moves 0.52 (0.47–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.18, longer 0.75; rhythm only: 1-bar 0.24, 2-bar 0.07, 4-bar 0.08, longer 0.6

**arp** (9 songs, in 0.13 of songs)
- onsets/bar 8.5 (8–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,5,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 3 (1.1–3.9), off-16th onset share 0.23 (0.22–0.36)
- length 0.96 (0.75–1.06) 16ths, gate (length ÷ gap to next onset) 0.54 (0.49–0.96)
- velocity mean 114 ± 8.9 (flat files 0.44); accents step 1 +3, step 13 +2, step 15 +2; weakest step 2 -9, step 4 -6
- register (MIDI, transposed to C) 67 (64–72)
- degrees (min): 1 0.32, b3 0.18, 5 0.14, b6 0.11, b7 0.09, 4 0.08
- intervals: repeat 0.01 (0–0.02), step 1–2 0.26 (0.21–0.39), skip 3–4 0.2 (0.09–0.3), leap 5–7 0.19 (0.15–0.22), octave 0 (0–0.12), descending share of moves 0.51 (0.5–0.55)
- arp shape up 0.09, down 0.02, updown 0.13, random 0.74, static 0.01; spacing (16ths) {'2.0': 6, '1.0': 2, '1.5': 1}; octave span 0.71 (0.58–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.34, 4-bar 0.52, longer 0.14; rhythm only: 1-bar 0.48, 2-bar 0.12, 4-bar 0.25, longer 0.14

**seq** (24 songs, in 0.35 of songs)
- onsets/bar 8 (6.8–10.5); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 1.5 (0–3.5), off-16th onset share 0.32 (0–0.48)
- length 1 (0.74–1.55) 16ths, gate (length ÷ gap to next onset) 0.6 (0.47–0.99)
- velocity mean 91 ± 7.2 (flat files 0.38); accents step 1 +2, step 8 +1, step 13 +1; weakest step 4 -2, step 16 -2
- register (MIDI, transposed to C) 59 (54–62)
- degrees (min): 1 0.41, 5 0.13, b7 0.12, b3 0.1, b6 0.1, 4 0.08
- intervals: repeat 0.34 (0.1–0.64), step 1–2 0.07 (0.01–0.42), skip 3–4 0.02 (0–0.11), leap 5–7 0.03 (0–0.18), octave 0 (0–0.18), descending share of moves 0.49 (0.47–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.26, 4-bar 0.18, longer 0.52; rhythm only: 1-bar 0.53, 2-bar 0.22, 4-bar 0.02, longer 0.24

**fx** (13 songs, in 0.19 of songs)
- onsets/bar 5 (4–8); steps with P ≥ .5: 1,7,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (1.7–3.5), off-16th onset share 0 (0–0.18)
- length 2 (1.48–2.37) 16ths, gate (length ÷ gap to next onset) 0.75 (0.66–0.98)
- velocity mean 90 ± 8.9 (flat files 0.39); accents step 4 +20, step 16 +2, step 7 +2; weakest step 2 -25, step 14 -24
- register (MIDI, transposed to C) 69 (67–70)
- degrees (min): b3 0.32, 1 0.18, 5 0.14, 2 0.12, 4 0.12, b7 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.21, 4-bar 0.15, longer 0.64; rhythm only: 1-bar 0.44, 2-bar 0.02, 4-bar 0, longer 0.54

**drums** (66 songs with a usable kit; flat-velocity files 0.24)
- families: kick_4otf 0.33, kick_1_and_9_only 0.38, snare_backbeat_5_13 0.67, snare_halftime_9 0.04, hat_16ths 0.11, hat_8ths 0.38, hat_offbeat_only 0.12, hat_none 0.12
- kick: hits/bar 3.8 (3–4), songs using 0.97, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13; vel 120 ± 3.4
- snare: hits/bar 2 (1.7–2.3), songs using 0.85, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 3.5
- hat: hits/bar 7.3 (3.9–8.4), songs using 0.85, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 82 ± 9.5
- perc: hits/bar 2 (0–8.4), songs using 0.62, P ≥ .5 at steps none, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,15,16; vel 82 ± 10
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel 62 ± 8.3
- cymb: hits/bar 0.2 (0–0.5), songs using 0.33, P ≥ .5 at steps none, P ≥ .2 at none; vel 75 ± 11.2
- open-hat share of hat hits 0.23, ride share of cymbals 0.2, fill-bar share 0.04

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 17 | 98 / 120 / 165 | 0.65 | 5 (4–11.2) | 0.67 (0.48–0.94) | 0.29 (0.11–0.58) | 0.71 | 0.12 | 0.06 | 0.12 | i VI (0.36) |
| new | 41 | 102 / 129 / 144 | 0.51 | 6 (4.1–8) | 0.74 (0.49–0.96) | 0.38 (0.2–0.5) | 0.54 | 0.15 | 0.45 | 0.1 | i iv (0.22) |

