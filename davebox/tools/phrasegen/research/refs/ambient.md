# AMBIENT — reference statistics

**61 songs measured** (84 selected), 49 artists; sources {'lmd': 53, 'lamd': 8}; eras {'80s': 17, 'new': 24, '?': 14, '90s': 6}; era splits: {'80s': 17, 'new': 24}. Every table: `analysis/out/ambient_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **90 / 120 / 151**; file BPM q1/med/q3 86 / 114 / 122; minor share **0.33**.

## Findings

The weakest genre label: the set is mostly new-age/instrumental synth (Jarre, Enya, Vangelis, Yanni, Oldfield) plus downtempo. Keep it as a harmony/pad reference: pads 67 %, arps 20 % (dense 16ths, up/down), I–IV and I–V–vi–IV.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.83 (0.56–1.17). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI VII | 0.2 | 0.05 |
| i VII | 0.2 | 0.05 |
| i III | 0.15 | 0.03 |
| i iv | 0.15 | 0.02 |
| i VI VII v | 0.15 | 0.03 |
| i VI | 0.1 | 0.01 |
| i VII iv | 0.1 | 0.01 |
| i VII VI | 0.1 | 0.05 |
| i III IV | 0.1 | 0.01 |
| i VII IV | 0.1 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.27 | 0.08 |
| I IV V | 0.17 | 0.05 |
| I V vi IV | 0.17 | 0.08 |
| I IV V IV | 0.17 | 0.02 |
| I V IV | 0.15 | 0.04 |
| I V vi V | 0.15 | 0.01 |
| I V I IV | 0.15 | 0.02 |
| I V IV V | 0.12 | 0.03 |
| I vi IV | 0.1 | 0.02 |
| I V | 0.1 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 1389 songs, minor share 0.29; share of songs containing the loop ≥ 2×): I IV (maj) 0.23, I V IV (maj) 0.16, I V vi IV (maj) 0.16, I IV V (maj) 0.15, I IV I V (maj) 0.15, I IV V IV (maj) 0.14, I V I IV (maj) 0.12, I vi V IV (maj) 0.12. By era: 80s (61 songs, minor 0.21): I IV (maj) 0.28, I IV I V (maj) 0.2, I V IV (maj) 0.16, I IV V IV (maj) 0.15; new (928 songs, minor 0.33): I IV (maj) 0.21, I V vi IV (maj) 0.16, I IV V (maj) 0.15, I V IV (maj) 0.15

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (52 songs, in 0.85 of songs)
- onsets/bar 5 (3.4–8); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.6 (0.1–2), off-16th onset share 0.18 (0–0.34)
- length 1.94 (1.17–3.54) 16ths, gate (length ÷ gap to next onset) 0.91 (0.77–1)
- velocity mean 102 ± 8.5 (flat files 0.21); accents step 1 +1, step 13 +1, step 9 +1; weakest step 2 -8, step 14 -6
- register (MIDI, transposed to C) 36 (32–38)
- degrees (maj): 1 0.24, 5 0.24, 4 0.17, 6 0.1, 2 0.08, 3 0.06
- intervals: repeat 0.47 (0.34–0.7), step 1–2 0.12 (0.07–0.23), skip 3–4 0.03 (0.01–0.07), leap 5–7 0.1 (0.03–0.26), octave 0.01 (0–0.04), descending share of moves 0.51 (0.47–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.05, 4-bar 0.09, longer 0.84; rhythm only: 1-bar 0.22, 2-bar 0.02, 4-bar 0.03, longer 0.73

**chord** (14 songs, in 0.23 of songs)
- onsets/bar 4 (2.2–6.9); steps with P ≥ .5: 1,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.4 (0.9–3.1), off-16th onset share 0.16 (0–0.36)
- length 1.06 (0.47–1.99) 16ths, gate (length ÷ gap to next onset) 0.45 (0.26–0.78)
- velocity mean 74 ± 14.8 (flat files 0.29); accents step 13 +8, step 9 +4, step 15 +3; weakest step 2 -15, step 12 -12
- register (MIDI, transposed to C) 68 (60–72)
- degrees (maj): 1 0.25, 5 0.23, 6 0.21, 3 0.09, 4 0.07, 7 0.05
- chords: voices 2.6 (2–2.9), spread 8 st, inversion share 0.7 (0.49–1), changes/bar 0.97 (0.5–1.89), qualities pow 0.52, maj 0.39, min 0.04, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0, longer 0.97; rhythm only: 1-bar 0.13, 2-bar 0, 4-bar 0, longer 0.87

**pad** (41 songs, in 0.67 of songs)
- onsets/bar 2 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.2 (0–1.4), off-16th onset share 0 (0–0.04)
- length 8.42 (2.97–15.98) 16ths, gate (length ÷ gap to next onset) 1 (0.98–1)
- velocity mean 76 ± 9.4 (flat files 0.2); accents step 3 +4, step 13 +2, step 15 +2; weakest step 8 -2, step 2 -1
- register (MIDI, transposed to C) 62 (57–67)
- degrees (maj): 5 0.2, 1 0.19, 3 0.12, 4 0.12, 6 0.11, 2 0.11
- chords: voices 2.9 (2.3–3.1), spread 9 st, inversion share 0.56 (0.21–0.75), changes/bar 0.99 (0.74–1.4), qualities maj 0.44, pow 0.26, min 0.23, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0, 4-bar 0.13, longer 0.85; rhythm only: 1-bar 0.34, 2-bar 0.07, 4-bar 0.02, longer 0.57

**keys** (40 songs, in 0.66 of songs)
- onsets/bar 4 (2.8–7); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.2–2.1), off-16th onset share 0.05 (0–0.27)
- length 3.6 (2–5.43) 16ths, gate (length ÷ gap to next onset) 0.97 (0.83–1)
- velocity mean 91 ± 9.7 (flat files 0.28); accents step 10 +2, step 1 +1, step 13 +1; weakest step 8 -3, step 3 -2
- register (MIDI, transposed to C) 60 (56–64)
- degrees (maj): 1 0.23, 5 0.23, 3 0.12, 4 0.12, 6 0.11, 2 0.08
- chords: voices 2.8 (2.4–3.2), spread 8 st, inversion share 0.34 (0.25–0.6), changes/bar 1.44 (0.81–1.89), qualities maj 0.49, pow 0.26, min 0.18, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.03, 4-bar 0.16, longer 0.79; rhythm only: 1-bar 0.22, 2-bar 0.01, 4-bar 0.05, longer 0.72

**guitar** (36 songs, in 0.59 of songs)
- onsets/bar 7 (4.8–9.2); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.2–2.2), off-16th onset share 0.25 (0.02–0.42)
- length 1.99 (1–2.98) 16ths, gate (length ÷ gap to next onset) 0.97 (0.91–1)
- velocity mean 83 ± 11.5 (flat files 0.06); accents step 1 +3, step 13 +1, step 4 +1; weakest step 8 -4, step 10 -2
- register (MIDI, transposed to C) 60 (55–62)
- degrees (maj): 1 0.24, 5 0.2, 3 0.13, 6 0.1, 4 0.1, 2 0.09
- chords: voices 2.7 (2.1–3.2), spread 8 st, inversion share 0.46 (0.12–0.72), changes/bar 0.96 (0.65–1.32), qualities pow 0.39, maj 0.35, min 0.12, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.06, 4-bar 0.17, longer 0.7; rhythm only: 1-bar 0.32, 2-bar 0.06, 4-bar 0.08, longer 0.55

**lead** (54 songs, in 0.89 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (1.2–3.7), off-16th onset share 0.15 (0.01–0.38)
- length 2 (1.73–2.55) 16ths, gate (length ÷ gap to next onset) 0.94 (0.74–1)
- velocity mean 100 ± 9.6 (flat files 0.22); accents step 13 +1, step 1 +1, step 12 +0; weakest step 16 -3, step 2 -2
- register (MIDI, transposed to C) 70 (65–74)
- degrees (maj): 1 0.21, 5 0.16, 3 0.15, 2 0.15, 4 0.11, 6 0.09
- intervals: repeat 0.21 (0.03–0.35), step 1–2 0.48 (0.36–0.55), skip 3–4 0.15 (0.1–0.23), leap 5–7 0.09 (0.05–0.15), octave 0 (0–0.01), descending share of moves 0.52 (0.45–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.03, 4-bar 0.06, longer 0.88; rhythm only: 1-bar 0.06, 2-bar 0.07, 4-bar 0.05, longer 0.82

**arp** (12 songs, in 0.2 of songs)
- onsets/bar 10.5 (8–11.2); steps with P ≥ .5: 1,3,4,5,7,8,9,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 3.2 (0.2–4), off-16th onset share 0.45 (0.37–0.47)
- length 0.99 (0.88–1.73) 16ths, gate (length ÷ gap to next onset) 0.9 (0.52–1)
- velocity mean 97 ± 11.2 (flat files 0.5); accents step 16 +3, step 8 +2, step 6 +1; weakest step 14 -4, step 9 -1
- register (MIDI, transposed to C) 67 (64–70)
- degrees (maj): 5 0.25, 1 0.16, 6 0.14, 4 0.1, 2 0.1, 3 0.1
- intervals: repeat 0.05 (0–0.17), step 1–2 0.13 (0.08–0.36), skip 3–4 0.27 (0.13–0.4), leap 5–7 0.27 (0.13–0.38), octave 0.02 (0.02–0.14), descending share of moves 0.5 (0.43–0.55)
- arp shape up 0.15, down 0.04, updown 0.12, random 0.68, static 0.01; spacing (16ths) {'1.0': 7, '2.0': 4, '1.5': 1}; octave span 0.83 (0.58–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0, 4-bar 0, longer 0.91; rhythm only: 1-bar 0.42, 2-bar 0.1, 4-bar 0.01, longer 0.47

**seq** (16 songs, in 0.26 of songs)
- onsets/bar 8 (5.8–12); steps with P ≥ .5: 1,3,4,6,7,8,9,11,12,13,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 3 (0.4–4.7), off-16th onset share 0.5 (0.42–0.55)
- length 1 (0.73–1.15) 16ths, gate (length ÷ gap to next onset) 0.75 (0.58–1)
- velocity mean 86 ± 8.4 (flat files 0.38); accents step 9 +2, step 1 +1, step 14 +1; weakest step 8 -1, step 16 -0
- register (MIDI, transposed to C) 63 (60–64)
- degrees (maj): 1 0.27, 5 0.2, 2 0.14, 4 0.11, 3 0.07, 6 0.07
- intervals: repeat 0.65 (0.5–0.84), step 1–2 0.15 (0.06–0.24), skip 3–4 0.03 (0.02–0.07), leap 5–7 0.03 (0.01–0.1), octave 0 (0–0), descending share of moves 0.5 (0.45–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.09, 4-bar 0.01, longer 0.9; rhythm only: 1-bar 0.45, 2-bar 0, 4-bar 0.02, longer 0.53

**fx** (7 songs, in 0.12 of songs)
- onsets/bar 3 (2–7.5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.9–1.4), off-16th onset share 0 (0–0.35)
- length 1.92 (0.51–5) 16ths, gate (length ÷ gap to next onset) 0.96 (0.41–1)
- velocity mean 79 ± 7.5 (flat files 0.14); accents step 16 +9, step 4 +8, step 14 +6; weakest step 7 -3, step 9 -3
- register (MIDI, transposed to C) 71 (67–75)
- degrees (maj): 1 0.23, 5 0.19, 4 0.17, 6 0.16, 3 0.12, 2 0.12
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.33, longer 0.67; rhythm only: 1-bar 0.12, 2-bar 0, 4-bar 0.25, longer 0.62

**drums** (48 songs with a usable kit; flat-velocity files 0.1)
- families: kick_4otf 0.19, kick_1_and_9_only 0.54, snare_backbeat_5_13 0.6, snare_halftime_9 0.02, hat_16ths 0.17, hat_8ths 0.42, hat_offbeat_only 0, hat_none 0.12
- kick: hits/bar 3.7 (2.8–4), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13; vel 101 ± 5.9
- snare: hits/bar 2 (1.3–2.6), songs using 0.92, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 96 ± 6.7
- hat: hits/bar 7.4 (4.6–9.3), songs using 0.88, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 74 ± 10.8
- perc: hits/bar 1 (0–9.3), songs using 0.48, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,15,16; vel 64 ± 8.3
- tom: hits/bar 0 (0–0), songs using 0.02, P ≥ .5 at steps none, P ≥ .2 at none; vel 102 ± 12.5
- cymb: hits/bar 0.3 (0.1–1.7), songs using 0.52, P ≥ .5 at steps none, P ≥ .2 at 1,5; vel 72 ± 10.4
- open-hat share of hat hits 0.19, ride share of cymbals 0.29, fill-bar share 0.07

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 17 | 86 / 120 / 134 | 0.29 | 5 (4–8) | 0.93 (0.66–1) | 0.54 (0.4–0.66) | 0.77 | 0.18 | 0.31 | 0.23 | i III (0.2) |
| new | 24 | 91 / 120 / 160 | 0.33 | 4 (3–9) | 0.89 (0.82–0.96) | 0.43 (0.37–0.49) | 0.62 | 0.08 | 0.16 | 0.1 | i VI VII (0.38) |

