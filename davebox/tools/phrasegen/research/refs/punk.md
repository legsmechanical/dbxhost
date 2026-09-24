# PUNK — reference statistics

**161 songs measured** (210 selected), 105 artists; sources {'lmd': 126, 'lamd': 35}; eras {'new': 72, '90s': 9, '80s': 32, '?': 48}; era splits: {'80s': 32, 'new': 72}. Every table: `analysis/out/punk_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **95 / 136 / 166**; file BPM q1/med/q3 97 / 126 / 150; minor share **0.34**.

## Findings

Tempo p50 136 folded (file BPM q3 150), bass 8ths on every 8th with repeated-note share .68 (the root-note pump), guitar 8 onsets/bar, open hats 35 %, 37 % flat files. Majority major (minor 34 %); the minor songs carry the **i–VI–III–VII** loop (15 %). 80s originals are 53 % minor (32 songs) vs 33 % for the 2000s pop-punk-heavy set.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.97 (0.74–1.31). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i III | 0.17 | 0.03 |
| i VI III VII | 0.15 | 0.04 |
| i VI VII | 0.13 | 0.04 |
| i III VII iv | 0.13 | 0.03 |
| i iv | 0.11 | 0.03 |
| i VI III iv | 0.11 | 0.01 |
| i VII iv VII | 0.11 | 0.01 |
| i III iv | 0.09 | 0.02 |
| i III VII | 0.09 | 0.03 |
| i III VII III | 0.09 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.27 | 0.07 |
| I IV V | 0.2 | 0.06 |
| I IV I V | 0.19 | 0.02 |
| I V IV | 0.15 | 0.05 |
| I vi IV V | 0.14 | 0.04 |
| I V IV V | 0.12 | 0.03 |
| I V I IV | 0.12 | 0.02 |
| I V vi IV | 0.11 | 0.02 |
| I IV V IV | 0.1 | 0.01 |
| I vi IV | 0.1 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 29987 songs, minor share 0.25; share of songs containing the loop ≥ 2×): I IV (maj) 0.19, I V IV (maj) 0.18, I IV V (maj) 0.15, I IV I V (maj) 0.15, I IV V IV (maj) 0.14, I V IV V (maj) 0.14, I V vi IV (maj) 0.14, I V I IV (maj) 0.12. By era: 80s (3329 songs, minor 0.17): I IV (maj) 0.24, I IV I V (maj) 0.18, I IV V IV (maj) 0.16, I IV V (maj) 0.16; new (21597 songs, minor 0.28): I V IV (maj) 0.18, I IV (maj) 0.18, I V vi IV (maj) 0.16, I IV V (maj) 0.15

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (150 songs, in 0.93 of songs)
- onsets/bar 6.2 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.6 (0.1–1.4), off-16th onset share 0.01 (0–0.17)
- length 1.98 (1.6–2) 16ths, gate (length ÷ gap to next onset) 0.98 (0.83–1)
- velocity mean 102 ± 8.7 (flat files 0.53); accents step 1 +2, step 9 +1, step 5 +1; weakest step 16 -5, step 10 -4
- register (MIDI, transposed to C) 34 (31–36)
- degrees (maj): 1 0.29, 5 0.2, 4 0.2, 6 0.1, 2 0.08, 3 0.06
- intervals: repeat 0.68 (0.39–0.81), step 1–2 0.11 (0.05–0.2), skip 3–4 0.04 (0.02–0.08), leap 5–7 0.08 (0.04–0.17), octave 0 (0–0.03), descending share of moves 0.49 (0.43–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.05, 4-bar 0.13, longer 0.82; rhythm only: 1-bar 0.23, 2-bar 0.06, 4-bar 0.07, longer 0.65

**chord** (24 songs, in 0.15 of songs)
- onsets/bar 4 (3–6.5); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.8–2.8), off-16th onset share 0.03 (0–0.13)
- length 1.48 (0.82–2.23) 16ths, gate (length ÷ gap to next onset) 0.53 (0.35–0.75)
- velocity mean 97 ± 12.8 (flat files 0.46); accents step 4 +8, step 9 +2, step 5 +1; weakest step 10 -18, step 6 -7
- register (MIDI, transposed to C) 66 (62–72)
- degrees (maj): 1 0.27, 5 0.14, 2 0.12, 3 0.11, 4 0.1, 7 0.06
- chords: voices 2 (2–2.7), spread 7 st, inversion share 0.49 (0.26–0.99), changes/bar 1.52 (0.98–2.49), qualities pow 0.58, maj 0.25, min 0.14, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.1, longer 0.9; rhythm only: 1-bar 0.15, 2-bar 0.07, 4-bar 0.02, longer 0.76

**pad** (60 songs, in 0.37 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9,13
- syncopation: LHL/bar 0.5 (0.1–1.5), off-16th onset share 0 (0–0.05)
- length 5.96 (2.07–15.51) 16ths, gate (length ÷ gap to next onset) 0.99 (0.78–1)
- velocity mean 81 ± 9.9 (flat files 0.25); accents step 16 +2, step 14 +2, step 13 +2; weakest step 10 -9, step 6 -6
- register (MIDI, transposed to C) 65 (60–69)
- degrees (maj): 1 0.18, 3 0.17, 5 0.16, 6 0.11, 4 0.1, 2 0.1
- chords: voices 2.7 (2–3), spread 9 st, inversion share 0.55 (0.3–0.77), changes/bar 1.19 (0.95–1.7), qualities maj 0.43, pow 0.36, min 0.16, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.07, longer 0.9; rhythm only: 1-bar 0.18, 2-bar 0.06, 4-bar 0.08, longer 0.68

**keys** (58 songs, in 0.36 of songs)
- onsets/bar 4 (2–5); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.8 (0–2), off-16th onset share 0.01 (0–0.17)
- length 3.07 (1.92–6.17) 16ths, gate (length ÷ gap to next onset) 0.96 (0.73–1)
- velocity mean 83 ± 13.3 (flat files 0.29); accents step 13 +2, step 1 +2, step 6 +1; weakest step 2 -8, step 3 -8
- register (MIDI, transposed to C) 60 (58–66)
- degrees (maj): 1 0.24, 5 0.19, 3 0.12, 2 0.11, 6 0.11, 4 0.1
- chords: voices 3 (2.6–3.2), spread 8 st, inversion share 0.47 (0.26–0.62), changes/bar 1.32 (0.96–1.86), qualities maj 0.47, pow 0.22, min 0.2, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.03, 4-bar 0.1, longer 0.83; rhythm only: 1-bar 0.21, 2-bar 0.03, 4-bar 0.05, longer 0.71

**guitar** (145 songs, in 0.9 of songs)
- onsets/bar 8 (6–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.8 (0.1–1.7), off-16th onset share 0.04 (0–0.28)
- length 1.98 (1.3–2) 16ths, gate (length ÷ gap to next onset) 0.99 (0.92–1)
- velocity mean 80 ± 11.5 (flat files 0.44); accents step 1 +3, step 13 +1, step 5 +1; weakest step 16 -3, step 11 -3
- register (MIDI, transposed to C) 55 (48–59)
- degrees (maj): 1 0.26, 5 0.23, 4 0.13, 2 0.11, 6 0.1, 3 0.09
- chords: voices 3 (2.5–3), spread 12 st, inversion share 0.06 (0–0.44), changes/bar 1.48 (0.94–2.29), qualities pow 0.69, maj 0.22, min 0.05, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.05, 4-bar 0.1, longer 0.83; rhythm only: 1-bar 0.22, 2-bar 0.06, 4-bar 0.05, longer 0.67

**lead** (128 songs, in 0.8 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.1 (1.3–2.9), off-16th onset share 0.03 (0–0.14)
- length 2 (1.82–2.59) 16ths, gate (length ÷ gap to next onset) 0.98 (0.8–1)
- velocity mean 100 ± 7.6 (flat files 0.51); accents step 12 +2, step 1 +1, step 13 +1; weakest step 16 -2, step 10 -2
- register (MIDI, transposed to C) 66 (62–68)
- degrees (maj): 1 0.21, 5 0.17, 3 0.16, 2 0.14, 4 0.11, 6 0.1
- intervals: repeat 0.34 (0.2–0.46), step 1–2 0.4 (0.29–0.52), skip 3–4 0.11 (0.07–0.19), leap 5–7 0.05 (0.03–0.1), octave 0 (0–0.01), descending share of moves 0.54 (0.5–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.05, longer 0.92; rhythm only: 1-bar 0.05, 2-bar 0.04, 4-bar 0.05, longer 0.86

**arp** (9 songs, in 0.06 of songs)
- onsets/bar 8.5 (8–10); steps with P ≥ .5: 1,3,5,7,9,11,12,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 1.1 (0.7–3.5), off-16th onset share 0.36 (0.28–0.54)
- length 1 (0.85–2) 16ths, gate (length ÷ gap to next onset) 0.92 (0.77–1)
- velocity mean 89 ± 11.4 (flat files 0.44); accents step 16 +5, step 1 +2, step 9 +2; weakest step 4 -3, step 6 -2
- register (MIDI, transposed to C) 75 (72–77)
- degrees (maj): 1 0.18, 3 0.17, 5 0.11, 2 0.11, 4 0.1, 6 0.08
- intervals: repeat 0.06 (0–0.12), step 1–2 0.38 (0.17–0.43), skip 3–4 0.29 (0.15–0.41), leap 5–7 0.15 (0.09–0.32), octave 0.01 (0–0.04), descending share of moves 0.49 (0.43–0.61)
- arp shape up 0.11, down 0.14, updown 0.31, random 0.44, static 0; spacing (16ths) {'1.0': 6, '2.0': 3}; octave span 0.67 (0.67–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.1, 4-bar 0.07, longer 0.84; rhythm only: 1-bar 0.37, 2-bar 0.1, 4-bar 0, longer 0.54

**seq** (26 songs, in 0.16 of songs)
- onsets/bar 7.2 (5–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.9 (0.2–2.6), off-16th onset share 0.13 (0–0.36)
- length 1.12 (0.95–2) 16ths, gate (length ÷ gap to next onset) 0.85 (0.49–1)
- velocity mean 87 ± 8.3 (flat files 0.42); accents step 1 +2, step 9 +2, step 2 +1; weakest step 10 -3, step 12 -2
- register (MIDI, transposed to C) 59 (57–60)
- degrees (maj): 1 0.23, 5 0.19, 3 0.11, 4 0.1, 6 0.08, b3 0.06
- intervals: repeat 0.32 (0.1–0.52), step 1–2 0.21 (0–0.34), skip 3–4 0.09 (0.03–0.24), leap 5–7 0.1 (0.02–0.25), octave 0 (0–0.03), descending share of moves 0.49 (0.43–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.17, 4-bar 0.11, longer 0.71; rhythm only: 1-bar 0.29, 2-bar 0.07, 4-bar 0.06, longer 0.58

**fx** (5 songs, in 0.03 of songs)
- onsets/bar 4 (1.5–6); steps with P ≥ .5: 1; P ≥ .3: 1,9,13,15
- syncopation: LHL/bar 1.5 (1–2), off-16th onset share 0 (0–0.01)
- length 2.19 (1.79–2.95) 16ths, gate (length ÷ gap to next onset) 0.72 (0.54–0.82)
- velocity mean 75 ± 5.9 (flat files 0.2); accents step 11 +4, step 7 +2, step 1 +2; weakest step 16 -11, step 5 -3
- register (MIDI, transposed to C) 69 (64–74)
- degrees (maj): 1 0.24, 3 0.21, 2 0.16, 5 0.14, 6 0.09, 7 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.33, 2-bar 0.33, 4-bar 0.08, longer 0.25; rhythm only: 1-bar 0.58, 2-bar 0.33, 4-bar 0.08, longer 0

**drums** (155 songs with a usable kit; flat-velocity files 0.37)
- families: kick_4otf 0.12, kick_1_and_9_only 0.5, snare_backbeat_5_13 0.6, snare_halftime_9 0.03, hat_16ths 0.03, hat_8ths 0.43, hat_offbeat_only 0.01, hat_none 0.09
- kick: hits/bar 3.7 (2.9–4.4), songs using 0.96, P ≥ .5 at steps 1,9, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 103 ± 6.7
- snare: hits/bar 2 (1.8–2.6), songs using 0.98, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 104 ± 5.1
- hat: hits/bar 6 (3–7.6), songs using 0.89, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 81 ± 10.8
- perc: hits/bar 0 (0–2.2), songs using 0.33, P ≥ .5 at steps none, P ≥ .2 at 5,13; vel 72 ± 13.5
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel 84 ± 7.5
- cymb: hits/bar 0.9 (0.3–2.8), songs using 0.71, P ≥ .5 at steps none, P ≥ .2 at 1,5,9,13; vel 92 ± 9.4
- open-hat share of hat hits 0.35, ride share of cymbals 0.32, fill-bar share 0.1

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 32 | 96 / 137 / 173 | 0.53 | 7 (6–8) | 0.98 (0.79–1) | 0.39 (0.32–0.5) | 0.16 | 0.06 | 0.1 | 0.03 | i iv (0.23) |
| new | 72 | 96 / 132 / 160 | 0.33 | 6.5 (4–8) | 0.98 (0.85–1) | 0.41 (0.29–0.53) | 0.5 | 0.08 | 0.13 | 0.03 | i III (0.29) |

