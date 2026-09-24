# HOUSE — reference statistics

**119 songs measured** (140 selected), 96 artists; sources {'lmd': 96, 'lamd': 23}; eras {'80s': 17, 'new': 55, '90s': 10, '?': 37}; era splits: {'80s': 17, 'new': 55}. Every table: `analysis/out/house_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **109 / 126 / 138**; file BPM q1/med/q3 120 / 125 / 130; minor share **0.57**.

## Findings

Positive control passes: the kick is four-on-the-floor in **63 %** of songs (rock 4.5 %), the snare/clap sits on 5+13, and the bass sits on the 8ths (P ≥ .5 on 1, 5, 7, 9, 11, 13, 15 — every 8th but step 3, so the off-8ths 7/11/15 are as likely as the beats) with a 1-bar rhythm loop in 44 % of 8-bar windows. Minor keys lead (57 %); the minor loops are two- and three-chord (i–VI, i–VI–VII, i–iv). Pads are present in 63 % of songs as one held chord per bar. Velocity is flat on the kick (SD 1.6) and lives on the hats (SD 9).

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.94 (0.66–1.25). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI | 0.18 | 0.06 |
| i VI VII | 0.18 | 0.08 |
| i iv | 0.16 | 0.05 |
| i VII VI VII | 0.13 | 0.02 |
| i iv VI VII | 0.12 | 0.01 |
| i v | 0.1 | 0.01 |
| i III VI VII | 0.1 | 0.03 |
| i VII VI | 0.08 | 0.03 |
| i VI iv | 0.08 | 0.05 |
| i v VI VII | 0.07 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.22 | 0.03 |
| I V | 0.15 | 0.01 |
| I ii V | 0.11 | 0.04 |
| I IV I V | 0.11 | 0.01 |
| I V I IV | 0.11 | 0.01 |
| I V vi IV | 0.09 | 0.02 |
| I V IV V | 0.09 | 0.01 |
| I ii I V | 0.07 | 0.01 |
| I V IV | 0.07 | 0.04 |
| I vi IV V | 0.07 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 1765 songs, minor share 0.45; share of songs containing the loop ≥ 2×): I V vi IV (maj) 0.12, I IV (maj) 0.1, I V IV (maj) 0.09, i VI VII (min) 0.08, I IV I V (maj) 0.07, I IV V (maj) 0.07, I V I IV (maj) 0.07, I V IV V (maj) 0.07. By era: 80s (54 songs, minor 0.37): i iv (min) 0.13, I IV V (maj) 0.11, I IV (maj) 0.09, I V I IV (maj) 0.07; new (1207 songs, minor 0.51): I V vi IV (maj) 0.11, i VI VII (min) 0.09, i VII VI (min) 0.07, i VII VI VII (min) 0.07

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (106 songs, in 0.89 of songs)
- onsets/bar 6 (5–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.1–3.6), off-16th onset share 0.17 (0–0.4)
- length 1.69 (0.97–2) 16ths, gate (length ÷ gap to next onset) 0.73 (0.5–0.96)
- velocity mean 103 ± 6.9 (flat files 0.56); accents step 6 +1, step 1 +1, step 7 +1; weakest step 14 -5, step 16 -3
- register (MIDI, transposed to C) 36 (33–38)
- degrees (min): 1 0.39, b6 0.12, b7 0.12, 5 0.12, 4 0.11, b3 0.1
- intervals: repeat 0.43 (0.14–0.76), step 1–2 0.11 (0.02–0.24), skip 3–4 0.04 (0–0.09), leap 5–7 0.06 (0.01–0.17), octave 0.01 (0–0.18), descending share of moves 0.49 (0.44–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.12, 4-bar 0.25, longer 0.57; rhythm only: 1-bar 0.44, 2-bar 0.07, 4-bar 0.12, longer 0.37

**chord** (34 songs, in 0.29 of songs)
- onsets/bar 5 (4–7); steps with P ≥ .5: 1,3,7,11,15; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 2.7 (1.6–4.4), off-16th onset share 0.23 (0.04–0.37)
- length 0.95 (0.68–2) 16ths, gate (length ÷ gap to next onset) 0.5 (0.33–0.78)
- velocity mean 96 ± 7.8 (flat files 0.32); accents step 4 +2, step 13 +1, step 15 +1; weakest step 2 -11, step 14 -3
- register (MIDI, transposed to C) 70 (64–74)
- degrees (min): 1 0.28, b3 0.17, 5 0.13, b7 0.13, 4 0.08, 2 0.07
- chords: voices 2.2 (2–3), spread 8 st, inversion share 0.76 (0.4–0.95), changes/bar 1.84 (1.4–2.56), qualities pow 0.46, maj 0.29, min 0.2, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.2, 4-bar 0.12, longer 0.68; rhythm only: 1-bar 0.43, 2-bar 0.1, 4-bar 0.1, longer 0.38

**pad** (75 songs, in 0.63 of songs)
- onsets/bar 1.5 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.2 (0–1.3), off-16th onset share 0 (0–0.1)
- length 8 (2.16–15.78) 16ths, gate (length ÷ gap to next onset) 0.99 (0.9–1)
- velocity mean 82 ± 7.8 (flat files 0.4); accents step 5 +1, step 11 +1, step 13 +0; weakest step 16 -6, step 14 -5
- register (MIDI, transposed to C) 63 (60–67)
- degrees (min): 1 0.23, b3 0.18, 5 0.17, b7 0.12, 4 0.1, b6 0.08
- chords: voices 2.9 (2.2–3), spread 8 st, inversion share 0.44 (0.01–0.62), changes/bar 1.06 (0.83–1.57), qualities maj 0.35, min 0.34, pow 0.24, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.06, 4-bar 0.26, longer 0.64; rhythm only: 1-bar 0.3, 2-bar 0.13, 4-bar 0.09, longer 0.47

**keys** (79 songs, in 0.66 of songs)
- onsets/bar 5 (2.5–8); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.8 (0.1–3.4), off-16th onset share 0.2 (0–0.37)
- length 1.73 (0.96–3.23) 16ths, gate (length ÷ gap to next onset) 0.75 (0.48–0.99)
- velocity mean 88 ± 10.9 (flat files 0.49); accents step 13 +2, step 5 +2, step 15 +1; weakest step 12 -2, step 16 -1
- register (MIDI, transposed to C) 62 (58–67)
- degrees (min): 1 0.29, 5 0.17, b3 0.14, b7 0.1, b6 0.09, 4 0.09
- chords: voices 3 (2.2–3.5), spread 8 st, inversion share 0.37 (0.03–0.57), changes/bar 1.49 (0.99–2.9), qualities maj 0.31, pow 0.28, min 0.27, min7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.11, 4-bar 0.21, longer 0.61; rhythm only: 1-bar 0.41, 2-bar 0.12, 4-bar 0.12, longer 0.35

**guitar** (61 songs, in 0.51 of songs)
- onsets/bar 5 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (0.2–4), off-16th onset share 0.25 (0–0.41)
- length 1 (0.79–2) 16ths, gate (length ÷ gap to next onset) 0.67 (0.35–0.97)
- velocity mean 83 ± 10.4 (flat files 0.33); accents step 5 +3, step 13 +1, step 9 +1; weakest step 6 -6, step 2 -4
- register (MIDI, transposed to C) 60 (56–63)
- degrees (min): 1 0.3, 5 0.17, b3 0.15, 4 0.09, b7 0.08, b6 0.06
- chords: voices 3 (2–3.2), spread 10 st, inversion share 0.4 (0.1–0.71), changes/bar 1.04 (0.56–1.63), qualities pow 0.35, maj 0.31, min 0.26, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.11, 2-bar 0.13, 4-bar 0.15, longer 0.61; rhythm only: 1-bar 0.34, 2-bar 0.13, 4-bar 0.1, longer 0.43

**lead** (99 songs, in 0.83 of songs)
- onsets/bar 4 (4–5); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.7–3.6), off-16th onset share 0.11 (0–0.25)
- length 1.92 (1.29–2.16) 16ths, gate (length ÷ gap to next onset) 0.75 (0.52–0.96)
- velocity mean 103 ± 7.8 (flat files 0.38); accents step 1 +1, step 9 +0, step 13 +0; weakest step 8 -1, step 16 -1
- register (MIDI, transposed to C) 70 (65–72)
- degrees (min): 1 0.29, 5 0.17, b3 0.16, 4 0.12, b7 0.12, 2 0.06
- intervals: repeat 0.25 (0.16–0.37), step 1–2 0.42 (0.24–0.51), skip 3–4 0.15 (0.09–0.24), leap 5–7 0.08 (0.03–0.14), octave 0 (0–0), descending share of moves 0.55 (0.5–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.05, 4-bar 0.16, longer 0.76; rhythm only: 1-bar 0.14, 2-bar 0.07, 4-bar 0.15, longer 0.63

**arp** (21 songs, in 0.18 of songs)
- onsets/bar 8 (8–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,8,9,10,11,13,14,15,16
- syncopation: LHL/bar 0.1 (0–1.7), off-16th onset share 0.25 (0–0.36)
- length 1 (0.92–1.5) 16ths, gate (length ÷ gap to next onset) 0.92 (0.5–0.98)
- velocity mean 94 ± 9.2 (flat files 0.33); accents step 1 +1, step 7 +1, step 9 +1; weakest step 3 -2, step 12 -1
- register (MIDI, transposed to C) 70 (63–72)
- degrees (min): 1 0.26, 5 0.18, b7 0.17, b3 0.14, 4 0.08, 2 0.08
- intervals: repeat 0.04 (0–0.11), step 1–2 0.14 (0.06–0.44), skip 3–4 0.17 (0.12–0.29), leap 5–7 0.2 (0.13–0.3), octave 0.02 (0–0.11), descending share of moves 0.5 (0.45–0.53)
- arp shape up 0.12, down 0.02, updown 0.22, random 0.65, static 0; spacing (16ths) {'2.0': 13, '1.0': 6, '1.5': 2}; octave span 0.75 (0.58–1.17)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.18, 2-bar 0.18, 4-bar 0.2, longer 0.45; rhythm only: 1-bar 0.62, 2-bar 0.06, 4-bar 0.03, longer 0.29

**seq** (39 songs, in 0.33 of songs)
- onsets/bar 7 (4.5–8.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,9,11,12,13,15,16
- syncopation: LHL/bar 0.9 (0–3), off-16th onset share 0.26 (0.01–0.5)
- length 1.07 (0.77–1.98) 16ths, gate (length ÷ gap to next onset) 0.71 (0.5–0.98)
- velocity mean 97 ± 6.7 (flat files 0.51); accents step 13 +1, step 10 +1, step 1 +0; weakest step 14 -5, step 2 -2
- register (MIDI, transposed to C) 63 (60–65)
- degrees (min): 1 0.41, b3 0.17, 5 0.11, 4 0.09, b7 0.08, b6 0.06
- intervals: repeat 0.38 (0–0.78), step 1–2 0.13 (0–0.32), skip 3–4 0.03 (0–0.19), leap 5–7 0.05 (0–0.11), octave 0 (0–0.05), descending share of moves 0.5 (0.44–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.11, 2-bar 0.14, 4-bar 0.36, longer 0.39; rhythm only: 1-bar 0.53, 2-bar 0.11, 4-bar 0.09, longer 0.28

**fx** (16 songs, in 0.13 of songs)
- onsets/bar 4.5 (1.9–5.9); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0–4.1), off-16th onset share 0.25 (0–0.4)
- length 2 (0.99–3.47) 16ths, gate (length ÷ gap to next onset) 0.97 (0.57–1)
- velocity mean 84 ± 7.1 (flat files 0.75); accents step 9 +6, step 7 +4, step 11 +2; weakest step 14 -11, step 12 -8
- register (MIDI, transposed to C) 68 (66–72)
- degrees (min): 1 0.27, 5 0.17, b3 0.16, 4 0.11, 2 0.09, b7 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.12, 4-bar 0.14, longer 0.73; rhythm only: 1-bar 0.4, 2-bar 0.1, 4-bar 0, longer 0.5

**drums** (105 songs with a usable kit; flat-velocity files 0.17)
- families: kick_4otf 0.63, kick_1_and_9_only 0.13, snare_backbeat_5_13 0.68, snare_halftime_9 0.02, hat_16ths 0.13, hat_8ths 0.39, hat_offbeat_only 0.02, hat_none 0.1
- kick: hits/bar 3.9 (3.7–4), songs using 0.99, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,5,9,13; vel 116 ± 1.6
- snare: hits/bar 2 (1.6–2.2), songs using 0.89, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 3.4
- hat: hits/bar 7.7 (6–9.7), songs using 0.91, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 78 ± 9
- perc: hits/bar 6 (0–11.3), songs using 0.63, P ≥ .5 at steps none, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 78 ± 9.9
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.2 (0–0.5), songs using 0.35, P ≥ .5 at steps none, P ≥ .2 at none; vel 82 ± 4.8
- open-hat share of hat hits 0.27, ride share of cymbals 0.23, fill-bar share 0.01

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 17 | 115 / 126 / 153 | 0.53 | 5 (5–7) | 0.73 (0.42–0.93) | 0.3 (0.24–0.43) | 0.71 | 0.29 | 0.5 | 0.14 | i VI VII (0.33) |
| new | 55 | 107 / 126 / 135 | 0.62 | 6 (4–8) | 0.66 (0.48–0.91) | 0.37 (0.21–0.5) | 0.6 | 0.18 | 0.55 | 0.1 | i VII VI VII (0.17) |

