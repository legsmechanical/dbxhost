# ITALO — reference statistics

**110 songs measured** (140 selected), 86 artists; sources {'lmd': 87, 'lamd': 23}; eras {'80s': 54, 'new': 27, '90s': 9, '?': 20}; era splits: {'80s': 54, 'new': 27}. Every table: `analysis/out/italo_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **104 / 121 / 146**; file BPM q1/med/q3 110 / 120 / 127; minor share **0.43**.

## Findings

8th-pulse bass on every 8th (8 onsets/bar), 16th hats in 27 % of songs (hat P ≥ .77 on every 8th, .31–.40 on the 16ths), kick 4otf 51 %, snare backbeat 75 % (80s: 89 %). Arps in 19 % of songs, dense and 1-bar-looped (76 % of windows). Loops i–iv, i–VI–VII, i–VII.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.94 (0.75–1.23). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.17 | 0.08 |
| i VI VII | 0.15 | 0.04 |
| i VII | 0.13 | 0.03 |
| i VII i VI | 0.11 | 0.01 |
| i iv V | 0.11 | 0.03 |
| i v VI VII | 0.09 | 0.01 |
| i iv VII V | 0.09 | 0.01 |
| i v | 0.07 | 0.01 |
| i VI VII v | 0.07 | 0.01 |
| i V | 0.07 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV V | 0.16 | 0.04 |
| I IV | 0.14 | 0.02 |
| I IV I V | 0.14 | 0.01 |
| I V I IV | 0.13 | 0.01 |
| I V IV V | 0.13 | 0.03 |
| I V vi IV | 0.11 | 0.03 |
| I IV V IV | 0.1 | 0.02 |
| I V | 0.1 | 0.03 |
| I V I vi | 0.08 | 0.01 |
| I V IV | 0.08 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 282 songs, minor share 0.42; share of songs containing the loop ≥ 2×): I IV (maj) 0.12, i VI VII (min) 0.12, I IV V (maj) 0.12, I vi IV V (maj) 0.09, I V IV (maj) 0.09, I IV I V (maj) 0.09, I V vi IV (maj) 0.08, I V IV V (maj) 0.08. By era: 80s (127 songs, minor 0.44): I IV (maj) 0.15, I IV I V (maj) 0.12, i VII (min) 0.11, I IV V (maj) 0.11; new (101 songs, minor 0.44): i VI VII (min) 0.16, I V vi IV (maj) 0.14, I IV V (maj) 0.11, I V IV (maj) 0.09

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (108 songs, in 0.98 of songs)
- onsets/bar 8 (4.4–9); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.4 (0–2.3), off-16th onset share 0.13 (0–0.33)
- length 1.48 (0.96–2) 16ths, gate (length ÷ gap to next onset) 0.81 (0.5–0.96)
- velocity mean 103 ± 7.5 (flat files 0.29); accents step 1 +1, step 13 +1, step 9 +1; weakest step 6 -3, step 16 -2
- register (MIDI, transposed to C) 36 (34–41)
- degrees (maj): 1 0.24, 5 0.19, 4 0.13, 2 0.12, 6 0.11, 3 0.08
- intervals: repeat 0.38 (0.2–0.69), step 1–2 0.1 (0.02–0.22), skip 3–4 0.05 (0.01–0.11), leap 5–7 0.07 (0.03–0.22), octave 0 (0–0.2), descending share of moves 0.5 (0.45–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.06, 4-bar 0.14, longer 0.77; rhythm only: 1-bar 0.42, 2-bar 0.04, 4-bar 0.06, longer 0.48

**chord** (54 songs, in 0.49 of songs)
- onsets/bar 5 (4–6.8); steps with P ≥ .5: 1,3,5,7,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.2–3.9), off-16th onset share 0.23 (0–0.37)
- length 0.99 (0.62–1.79) 16ths, gate (length ÷ gap to next onset) 0.47 (0.27–0.71)
- velocity mean 96 ± 11.6 (flat files 0.24); accents step 1 +1, step 6 +1, step 4 +1; weakest step 11 -2, step 10 -2
- register (MIDI, transposed to C) 68 (64–72)
- degrees (maj): 1 0.23, 5 0.16, 2 0.14, 3 0.12, 4 0.11, 6 0.1
- chords: voices 2.3 (2–3), spread 8 st, inversion share 0.55 (0.22–0.76), changes/bar 1.7 (0.79–2.33), qualities pow 0.44, maj 0.26, min 0.22, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.03, 4-bar 0.11, longer 0.83; rhythm only: 1-bar 0.29, 2-bar 0.06, 4-bar 0.14, longer 0.51

**pad** (94 songs, in 0.85 of songs)
- onsets/bar 1 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.4 (0–1.4), off-16th onset share 0.01 (0–0.14)
- length 8 (3.25–15.98) 16ths, gate (length ÷ gap to next onset) 0.99 (0.88–1)
- velocity mean 85 ± 10.7 (flat files 0.22); accents step 12 +2, step 11 +2, step 13 +1; weakest step 14 -6, step 2 -5
- register (MIDI, transposed to C) 64 (60–68)
- degrees (maj): 1 0.18, 5 0.18, 3 0.13, 2 0.12, 4 0.12, 6 0.11
- chords: voices 2.9 (2.4–3.1), spread 8 st, inversion share 0.5 (0.25–0.8), changes/bar 1.12 (0.88–1.81), qualities maj 0.38, min 0.29, pow 0.27, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.03, 4-bar 0.16, longer 0.79; rhythm only: 1-bar 0.25, 2-bar 0.05, 4-bar 0.12, longer 0.58

**keys** (77 songs, in 0.7 of songs)
- onsets/bar 4 (2–5.5); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0.3–2.8), off-16th onset share 0.08 (0–0.29)
- length 2.97 (1.04–6.17) 16ths, gate (length ÷ gap to next onset) 0.88 (0.48–0.99)
- velocity mean 92 ± 9.2 (flat files 0.22); accents step 5 +2, step 9 +1, step 13 +1; weakest step 2 -6, step 8 -5
- register (MIDI, transposed to C) 65 (60–68)
- degrees (maj): 1 0.18, 5 0.18, 2 0.14, 3 0.13, 4 0.11, 6 0.11
- chords: voices 3 (2.5–3.3), spread 8 st, inversion share 0.58 (0.36–0.76), changes/bar 1.46 (0.98–2), qualities maj 0.39, min 0.27, pow 0.21, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.01, 4-bar 0.14, longer 0.81; rhythm only: 1-bar 0.25, 2-bar 0, 4-bar 0.11, longer 0.64

**guitar** (71 songs, in 0.65 of songs)
- onsets/bar 7 (5–8.5); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,9,11,12,13,15
- syncopation: LHL/bar 2 (1–4.1), off-16th onset share 0.25 (0.02–0.42)
- length 1.44 (0.7–2.1) 16ths, gate (length ÷ gap to next onset) 0.69 (0.43–0.97)
- velocity mean 92 ± 11.4 (flat files 0.13); accents step 5 +2, step 1 +2, step 13 +2; weakest step 6 -4, step 2 -3
- register (MIDI, transposed to C) 60 (57–64)
- degrees (maj): 1 0.25, 5 0.18, 2 0.12, 3 0.11, 4 0.11, 6 0.1
- chords: voices 3 (2.2–3), spread 8 st, inversion share 0.55 (0.32–0.69), changes/bar 1.16 (0.61–1.7), qualities maj 0.39, pow 0.34, min 0.21, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.01, 4-bar 0.12, longer 0.86; rhythm only: 1-bar 0.25, 2-bar 0.04, 4-bar 0.05, longer 0.66

**lead** (94 songs, in 0.85 of songs)
- onsets/bar 4 (3.1–5); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (1.4–3), off-16th onset share 0.08 (0.01–0.25)
- length 1.75 (1.05–2.12) 16ths, gate (length ÷ gap to next onset) 0.76 (0.55–0.94)
- velocity mean 102 ± 10.4 (flat files 0.23); accents step 1 +2, step 9 +1, step 13 +1; weakest step 14 -4, step 10 -4
- register (MIDI, transposed to C) 70 (65–74)
- degrees (maj): 1 0.19, 5 0.16, 2 0.14, 3 0.12, 6 0.11, 4 0.1
- intervals: repeat 0.24 (0.16–0.39), step 1–2 0.44 (0.28–0.54), skip 3–4 0.14 (0.09–0.22), leap 5–7 0.07 (0.03–0.12), octave 0 (0–0.01), descending share of moves 0.51 (0.46–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.09, longer 0.9; rhythm only: 1-bar 0.07, 2-bar 0.02, 4-bar 0.1, longer 0.81

**arp** (21 songs, in 0.19 of songs)
- onsets/bar 10 (8–15); steps with P ≥ .5: 1,3,4,5,7,8,9,10,11,12,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.1 (0–2.9), off-16th onset share 0.47 (0.27–0.5)
- length 0.97 (0.83–1.56) 16ths, gate (length ÷ gap to next onset) 0.83 (0.53–0.98)
- velocity mean 100 ± 10.2 (flat files 0.33); accents step 1 +1, step 15 +1, step 3 +1; weakest step 16 -3, step 2 -2
- register (MIDI, transposed to C) 69 (65–72)
- degrees (maj): 1 0.21, 5 0.2, 2 0.15, 3 0.12, 6 0.11, 4 0.1
- intervals: repeat 0.01 (0–0.19), step 1–2 0.19 (0.06–0.32), skip 3–4 0.25 (0.07–0.45), leap 5–7 0.28 (0.13–0.36), octave 0.01 (0–0.07), descending share of moves 0.48 (0.43–0.5)
- arp shape up 0.06, down 0.03, updown 0.19, random 0.72, static 0.01; spacing (16ths) {'1.0': 11, '2.0': 9, '1.5': 1}; octave span 0.88 (0.67–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.11, 4-bar 0.22, longer 0.61; rhythm only: 1-bar 0.76, 2-bar 0, 4-bar 0.06, longer 0.18

**seq** (40 songs, in 0.36 of songs)
- onsets/bar 7 (5–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,7,8,9,10,11,12,13,15,16
- syncopation: LHL/bar 2.4 (1.2–4.5), off-16th onset share 0.35 (0.2–0.5)
- length 0.95 (0.63–1.42) 16ths, gate (length ÷ gap to next onset) 0.57 (0.47–0.94)
- velocity mean 98 ± 8.3 (flat files 0.28); accents step 1 +2, step 5 +2, step 6 +2; weakest step 2 -3, step 10 -2
- register (MIDI, transposed to C) 62 (58–66)
- degrees (maj): 1 0.23, 4 0.17, 5 0.16, 2 0.11, 3 0.11, 6 0.09
- intervals: repeat 0.36 (0.15–0.54), step 1–2 0.21 (0.05–0.41), skip 3–4 0.05 (0–0.18), leap 5–7 0.03 (0.01–0.11), octave 0 (0–0.06), descending share of moves 0.5 (0.45–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.08, 4-bar 0.14, longer 0.76; rhythm only: 1-bar 0.45, 2-bar 0, 4-bar 0.12, longer 0.43

**fx** (22 songs, in 0.2 of songs)
- onsets/bar 4 (2.6–6.8); steps with P ≥ .5: 1,7; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.2–2.9), off-16th onset share 0.03 (0–0.27)
- length 1.79 (0.92–2.31) 16ths, gate (length ÷ gap to next onset) 0.77 (0.4–0.92)
- velocity mean 93 ± 7.8 (flat files 0.18); accents step 1 +2, step 5 +0, step 9 +0; weakest step 6 -4, step 3 -3
- register (MIDI, transposed to C) 72 (68–77)
- degrees (maj): 1 0.21, 5 0.16, 6 0.12, 3 0.12, 2 0.11, 7 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.33, 4-bar 0.04, longer 0.62; rhythm only: 1-bar 0.42, 2-bar 0.33, 4-bar 0, longer 0.25

**drums** (107 songs with a usable kit; flat-velocity files 0.05)
- families: kick_4otf 0.51, kick_1_and_9_only 0.27, snare_backbeat_5_13 0.75, snare_halftime_9 0.01, hat_16ths 0.27, hat_8ths 0.35, hat_offbeat_only 0.03, hat_none 0.05
- kick: hits/bar 3.9 (3–4), songs using 0.99, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,5,9,13; vel 110 ± 4
- snare: hits/bar 2 (1.8–2.2), songs using 0.95, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 103 ± 4.8
- hat: hits/bar 8.4 (6.9–12.1), songs using 0.95, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 77 ± 12.6
- perc: hits/bar 4 (0.4–8.4), songs using 0.72, P ≥ .5 at steps none, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 75 ± 12.8
- tom: hits/bar 0 (0–0), songs using 0.05, P ≥ .5 at steps none, P ≥ .2 at none; vel 100 ± 5.1
- cymb: hits/bar 0.2 (0–0.3), songs using 0.31, P ≥ .5 at steps none, P ≥ .2 at none; vel 76 ± 10.4
- open-hat share of hat hits 0.12, ride share of cymbals 0.18, fill-bar share 0.08

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 54 | 104 / 120 / 133 | 0.48 | 8 (6–11) | 0.73 (0.46–0.91) | 0.46 (0.32–0.56) | 0.89 | 0.2 | 0.53 | 0.28 | i iv (0.2) |
| new | 27 | 105 / 126 / 152 | 0.44 | 6 (4–8) | 0.82 (0.61–0.97) | 0.36 (0.27–0.48) | 0.81 | 0.15 | 0.52 | 0.24 | i iv (0.17) |

