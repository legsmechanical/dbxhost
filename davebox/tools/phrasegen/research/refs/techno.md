# TECHNO — reference statistics

**98 songs measured** (121 selected), 83 artists; sources {'lmd': 94, 'lamd': 4}; eras {'80s': 9, 'new': 54, '?': 25, '90s': 10}; era splits: {'new': 54}. Every table: `analysis/out/techno_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **102 / 127 / 152**; file BPM q1/med/q3 115 / 126 / 132; minor share **0.55**.

## Findings

Same skeleton as house with less harmony: minor 55 %, chord changes 0.88/bar, and an off-8th bass with repeated-note share .48. 4otf is only 48 % in these files — hobbyist techno transcriptions often drop kicks in breakdown bars that still count as groove bars. The `seq` part (a dense repeated riff, 8 onsets/bar, 1-bar rhythm loop in 52 % of windows) is present in 42 % of songs, the highest seq share of any style.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.88 (0.6–1.09). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.2 | 0.03 |
| i v | 0.13 | 0.08 |
| i VII | 0.13 | 0.03 |
| i VI VII | 0.13 | 0.03 |
| i VI | 0.11 | 0.07 |
| i VII VI | 0.09 | 0.03 |
| i VII VI VII | 0.09 | 0.02 |
| i VI VII III | 0.09 | 0.02 |
| i iv i VII | 0.07 | 0 |
| i v i III | 0.07 | 0 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV I V | 0.32 | 0.04 |
| I IV | 0.29 | 0.1 |
| I V I IV | 0.2 | 0.03 |
| I V vi IV | 0.15 | 0.02 |
| I V | 0.1 | 0.04 |
| I ii V | 0.1 | 0.03 |
| I IV vi | 0.1 | 0.03 |
| I ii | 0.07 | 0.01 |
| I IV V | 0.07 | 0.03 |
| I ii IV V | 0.07 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 383 songs, minor share 0.39; share of songs containing the loop ≥ 2×): I IV (maj) 0.13, I IV V (maj) 0.11, I IV I V (maj) 0.1, I V vi IV (maj) 0.1, I vi IV V (maj) 0.1, I V IV (maj) 0.09, i VI VII (min) 0.09, I V IV V (maj) 0.08. By era: 80s (44 songs, minor 0.43): i iv (min) 0.16, I IV (maj) 0.11, i iv i VI (min) 0.09, I V bVI bVII (maj) 0.04; new (173 songs, minor 0.5): i VI VII (min) 0.14, I V vi IV (maj) 0.12, i VI VII VI (min) 0.08, I IV (maj) 0.08

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (83 songs, in 0.85 of songs)
- onsets/bar 6 (5–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,9,11,12,13,15
- syncopation: LHL/bar 1.8 (0.2–3.6), off-16th onset share 0.2 (0–0.41)
- length 1.21 (0.94–2) 16ths, gate (length ÷ gap to next onset) 0.67 (0.47–0.82)
- velocity mean 101 ± 8.1 (flat files 0.46); accents step 1 +1, step 2 +1, step 5 +0; weakest step 6 -2, step 16 -2
- register (MIDI, transposed to C) 36 (32–36)
- degrees (min): 1 0.43, b7 0.12, 4 0.11, b6 0.11, b3 0.09, 5 0.09
- intervals: repeat 0.48 (0.28–0.74), step 1–2 0.16 (0.06–0.25), skip 3–4 0.04 (0–0.13), leap 5–7 0.07 (0.02–0.17), octave 0 (0–0.04), descending share of moves 0.49 (0.43–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.12, 4-bar 0.2, longer 0.61; rhythm only: 1-bar 0.43, 2-bar 0.07, 4-bar 0.09, longer 0.4

**chord** (33 songs, in 0.34 of songs)
- onsets/bar 4 (3–8); steps with P ≥ .5: 1,7,9,11,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.9–3), off-16th onset share 0.05 (0–0.29)
- length 1.56 (0.97–2) 16ths, gate (length ÷ gap to next onset) 0.52 (0.36–0.79)
- velocity mean 103 ± 13 (flat files 0.3); accents step 16 +4, step 10 +3, step 12 +2; weakest step 4 -6, step 6 -4
- register (MIDI, transposed to C) 63 (58–67)
- degrees (min): 1 0.41, 5 0.15, 4 0.13, b3 0.13, b7 0.07, b6 0.06
- chords: voices 2.3 (2–2.9), spread 9 st, inversion share 0.24 (0.01–0.74), changes/bar 1.74 (0.58–2.14), qualities pow 0.5, min 0.22, maj 0.21, sus 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.14, 4-bar 0.08, longer 0.72; rhythm only: 1-bar 0.4, 2-bar 0.07, 4-bar 0.08, longer 0.45

**pad** (51 songs, in 0.52 of songs)
- onsets/bar 1 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1
- syncopation: LHL/bar 0.3 (0–1.9), off-16th onset share 0 (0–0.19)
- length 15.67 (4.83–16.66) 16ths, gate (length ÷ gap to next onset) 1 (0.95–1)
- velocity mean 75 ± 8.7 (flat files 0.29); accents step 15 +4, step 13 +2, step 11 +2; weakest step 8 -8, step 10 -7
- register (MIDI, transposed to C) 67 (62–72)
- degrees (min): 1 0.26, 5 0.17, 4 0.13, b3 0.13, b7 0.12, b6 0.09
- chords: voices 3 (2.2–3.3), spread 9 st, inversion share 0.49 (0.21–0.76), changes/bar 0.93 (0.76–1.26), qualities maj 0.47, min 0.27, pow 0.21, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.11, 4-bar 0.28, longer 0.61; rhythm only: 1-bar 0.29, 2-bar 0.2, 4-bar 0.08, longer 0.43

**keys** (59 songs, in 0.6 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,12,13,15
- syncopation: LHL/bar 1.9 (0.6–2.8), off-16th onset share 0.19 (0–0.35)
- length 1.29 (0.79–2.08) 16ths, gate (length ÷ gap to next onset) 0.73 (0.45–0.98)
- velocity mean 86 ± 11.3 (flat files 0.41); accents step 5 +2, step 1 +1, step 13 +1; weakest step 14 -4, step 16 -4
- register (MIDI, transposed to C) 62 (57–65)
- degrees (min): 1 0.26, 5 0.17, b3 0.15, b7 0.1, b6 0.09, 4 0.09
- chords: voices 3 (2.4–3.1), spread 9 st, inversion share 0.46 (0.05–0.77), changes/bar 1.74 (1.22–2.42), qualities maj 0.41, min 0.28, pow 0.22, aug 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.14, 4-bar 0.22, longer 0.59; rhythm only: 1-bar 0.3, 2-bar 0.1, 4-bar 0.12, longer 0.47

**guitar** (49 songs, in 0.5 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,3,5,7,15; P ≥ .3: 1,3,5,7,9,11,12,13,15
- syncopation: LHL/bar 2.4 (1.1–4.5), off-16th onset share 0.26 (0.04–0.4)
- length 1 (0.69–2) 16ths, gate (length ÷ gap to next onset) 0.54 (0.29–0.98)
- velocity mean 91 ± 10.9 (flat files 0.35); accents step 1 +4, step 7 +1, step 13 +1; weakest step 16 -6, step 2 -4
- register (MIDI, transposed to C) 55 (51–60)
- degrees (min): 1 0.32, 5 0.16, b3 0.14, b7 0.11, 4 0.1, b6 0.08
- chords: voices 2.5 (2–3), spread 7 st, inversion share 0.35 (0.01–0.64), changes/bar 0.97 (0.62–1.44), qualities pow 0.54, maj 0.23, min 0.11, sus 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.08, 4-bar 0.25, longer 0.65; rhythm only: 1-bar 0.17, 2-bar 0.12, 4-bar 0.17, longer 0.54

**lead** (80 songs, in 0.82 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.3–3), off-16th onset share 0.09 (0–0.24)
- length 1.93 (1.04–2.2) 16ths, gate (length ÷ gap to next onset) 0.8 (0.56–0.97)
- velocity mean 99 ± 9.7 (flat files 0.36); accents step 4 +1, step 5 +1, step 1 +1; weakest step 2 -3, step 14 -1
- register (MIDI, transposed to C) 66 (63–67)
- degrees (min): 1 0.28, b3 0.15, 4 0.15, 5 0.15, b7 0.09, 2 0.08
- intervals: repeat 0.28 (0.1–0.47), step 1–2 0.39 (0.24–0.54), skip 3–4 0.12 (0.05–0.19), leap 5–7 0.07 (0.01–0.14), octave 0 (0–0.01), descending share of moves 0.53 (0.49–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0.03, 4-bar 0.09, longer 0.8; rhythm only: 1-bar 0.14, 2-bar 0.02, 4-bar 0.09, longer 0.75

**arp** (14 songs, in 0.14 of songs)
- onsets/bar 8 (7–9.6); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,9,11,13,15
- syncopation: LHL/bar 1.8 (0.4–2.3), off-16th onset share 0.19 (0.06–0.44)
- length 1.12 (0.97–1.97) 16ths, gate (length ÷ gap to next onset) 0.92 (0.6–1)
- velocity mean 94 ± 12.3 (flat files 0.57); accents step 9 +7, step 8 +5, step 1 +5; weakest step 16 -6, step 15 -3
- register (MIDI, transposed to C) 64 (61–68)
- degrees (min): 1 0.25, 5 0.18, b3 0.14, 4 0.13, b7 0.12, b6 0.1
- intervals: repeat 0.04 (0.01–0.09), step 1–2 0.36 (0.18–0.44), skip 3–4 0.14 (0.08–0.29), leap 5–7 0.2 (0.08–0.36), octave 0.03 (0–0.08), descending share of moves 0.46 (0.4–0.51)
- arp shape up 0.25, down 0.08, updown 0.14, random 0.52, static 0.01; spacing (16ths) {'2.0': 10, '1.0': 3, '1.5': 1}; octave span 0.71 (0.6–0.9)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.22, 2-bar 0.09, 4-bar 0.39, longer 0.29; rhythm only: 1-bar 0.22, 2-bar 0.18, 4-bar 0.3, longer 0.29

**seq** (41 songs, in 0.42 of songs)
- onsets/bar 8 (6–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,6,7,8,9,11,12,13,15
- syncopation: LHL/bar 2 (0–3.3), off-16th onset share 0.3 (0–0.39)
- length 1 (0.63–1.79) 16ths, gate (length ÷ gap to next onset) 0.61 (0.44–0.93)
- velocity mean 91 ± 7.3 (flat files 0.51); accents step 1 +3, step 5 +1, step 9 +1; weakest step 2 -1, step 14 -1
- register (MIDI, transposed to C) 60 (60–63)
- degrees (min): 1 0.34, 5 0.16, b3 0.12, 4 0.1, b7 0.09, b6 0.08
- intervals: repeat 0.64 (0.39–0.93), step 1–2 0.1 (0–0.27), skip 3–4 0.04 (0–0.11), leap 5–7 0.03 (0–0.09), octave 0 (0–0.01), descending share of moves 0.51 (0.44–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.17, 2-bar 0.11, 4-bar 0.14, longer 0.57; rhythm only: 1-bar 0.52, 2-bar 0.04, 4-bar 0.04, longer 0.39

**fx** (12 songs, in 0.12 of songs)
- onsets/bar 4 (3.8–6.2); steps with P ≥ .5: 3,5,7,11,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.5–3.4), off-16th onset share 0.02 (0–0.08)
- length 1.97 (0.98–4) 16ths, gate (length ÷ gap to next onset) 0.99 (0.48–1)
- velocity mean 97 ± 8.6 (flat files 0.42); accents step 6 +5, step 8 +4, step 13 +4; weakest step 4 -5, step 9 -4
- register (MIDI, transposed to C) 68 (64–70)
- degrees (min): 1 0.28, b3 0.23, 5 0.12, b7 0.12, b6 0.09, 4 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.17, 4-bar 0.17, longer 0.67; rhythm only: 1-bar 0.21, 2-bar 0.17, 4-bar 0, longer 0.62

**drums** (95 songs with a usable kit; flat-velocity files 0.13)
- families: kick_4otf 0.48, kick_1_and_9_only 0.2, snare_backbeat_5_13 0.62, snare_halftime_9 0.04, hat_16ths 0.14, hat_8ths 0.37, hat_offbeat_only 0.03, hat_none 0.06
- kick: hits/bar 4 (3.6–4.1), songs using 1, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,5,9,11,13; vel 116 ± 1.6
- snare: hits/bar 2 (1.6–2.3), songs using 0.94, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 4.4
- hat: hits/bar 7.7 (4.2–9.2), songs using 0.95, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 80 ± 9.2
- perc: hits/bar 3.4 (0–11.8), songs using 0.64, P ≥ .5 at steps none, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 74 ± 14.5
- tom: hits/bar 0 (0–0), songs using 0.06, P ≥ .5 at steps none, P ≥ .2 at none; vel 68 ± 2.6
- cymb: hits/bar 0.1 (0–0.5), songs using 0.29, P ≥ .5 at steps none, P ≥ .2 at none; vel 82 ± 7.4
- open-hat share of hat hits 0.25, ride share of cymbals 0.2, fill-bar share 0.07

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 54 | 104 / 127 / 136 | 0.56 | 6 (5–8) | 0.72 (0.48–0.82) | 0.34 (0.12–0.52) | 0.48 | 0.17 | 0.44 | 0.12 | i iv (0.19) |

