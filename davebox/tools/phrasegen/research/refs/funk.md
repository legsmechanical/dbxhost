# FUNK — reference statistics

**111 songs measured** (140 selected), 86 artists; sources {'lmd': 96, 'lamd': 15}; eras {'80s': 42, 'new': 26, '?': 38, '90s': 5}; era splits: {'80s': 42, 'new': 26}. Every table: `analysis/out/funk_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **99 / 120 / 150**; file BPM q1/med/q3 98 / 113 / 124; minor share **0.47**.

## Findings

Minor/mixolydian vamps: 20 of 111 songs lean mixolydian, 9 dorian; minor loops are two-chord (i–VII, i–III). Bass is the least repetitive of all styles (repeated-note share .29, step share .23) and lands on 1, 7, 9, 13, 15. Guitar is the most syncopated part (off-16th share .29). Hat velocity SD 14 is among the largest measured (soul 15) — the ghosted hat.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 1.06 (0.79–1.33). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VII | 0.14 | 0.05 |
| i III | 0.12 | 0.06 |
| i III VII | 0.1 | 0.03 |
| i v | 0.1 | 0.02 |
| i VI | 0.06 | 0.01 |
| III VI | 0.06 | 0.01 |
| i IV | 0.06 | 0.01 |
| i iv VII III | 0.06 | 0.01 |
| III VI iv VII | 0.06 | 0.01 |
| i VI iv v | 0.06 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.27 | 0.09 |
| I V IV V | 0.12 | 0.01 |
| I IV V | 0.11 | 0.04 |
| I IV V IV | 0.11 | 0.02 |
| I V IV | 0.09 | 0.01 |
| I IV I ii | 0.09 | 0.01 |
| I V | 0.09 | 0.01 |
| I IV ii IV | 0.07 | 0.01 |
| I IV I V | 0.07 | 0.01 |
| I ii | 0.07 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 2806 songs, minor share 0.36; share of songs containing the loop ≥ 2×): I IV (maj) 0.16, I IV I V (maj) 0.09, I IV V IV (maj) 0.08, I V IV (maj) 0.07, I IV V (maj) 0.07, I V IV V (maj) 0.06, I V I IV (maj) 0.06, I vi IV V (maj) 0.04. By era: 80s (891 songs, minor 0.3): I IV (maj) 0.2, I IV I V (maj) 0.09, I IV V IV (maj) 0.08, I IV V (maj) 0.07; new (1193 songs, minor 0.43): I IV (maj) 0.11, I IV I V (maj) 0.07, I V IV (maj) 0.06, I IV V IV (maj) 0.06

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (106 songs, in 0.95 of songs)
- onsets/bar 5 (4–7); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.2–2.1), off-16th onset share 0.13 (0.01–0.27)
- length 1.75 (1.02–2.45) 16ths, gate (length ÷ gap to next onset) 0.8 (0.61–0.92)
- velocity mean 102 ± 9.3 (flat files 0.27); accents step 1 +2, step 9 +1, step 5 +1; weakest step 10 -7, step 14 -5
- register (MIDI, transposed to C) 36 (34–41)
- degrees (maj): 1 0.28, 5 0.19, 4 0.14, 2 0.11, 6 0.1, 3 0.06
- intervals: repeat 0.29 (0.19–0.45), step 1–2 0.23 (0.13–0.33), skip 3–4 0.09 (0.03–0.15), leap 5–7 0.15 (0.07–0.28), octave 0.03 (0–0.09), descending share of moves 0.47 (0.42–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.14, 4-bar 0.09, longer 0.76; rhythm only: 1-bar 0.18, 2-bar 0.1, 4-bar 0.06, longer 0.66

**chord** (48 songs, in 0.43 of songs)
- onsets/bar 3.5 (2.4–5); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (1.5–3), off-16th onset share 0.2 (0.07–0.34)
- length 1 (0.75–1.7) 16ths, gate (length ÷ gap to next onset) 0.5 (0.43–0.76)
- velocity mean 95 ± 11.2 (flat files 0.12); accents step 1 +2, step 9 +2, step 6 +1; weakest step 2 -4, step 4 -4
- register (MIDI, transposed to C) 69 (65–74)
- degrees (maj): 1 0.27, 5 0.15, 2 0.12, 3 0.11, 6 0.1, 4 0.09
- chords: voices 2.3 (2–3), spread 8 st, inversion share 0.65 (0.21–0.81), changes/bar 1.45 (0.97–2.21), qualities pow 0.4, min 0.24, maj 0.2, maj7 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.17, longer 0.79; rhythm only: 1-bar 0.03, 2-bar 0.17, 4-bar 0.14, longer 0.67

**pad** (57 songs, in 0.51 of songs)
- onsets/bar 2 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.7 (0.1–1.9), off-16th onset share 0.06 (0–0.23)
- length 7.68 (2.07–11.7) 16ths, gate (length ÷ gap to next onset) 0.96 (0.69–1)
- velocity mean 77 ± 11.3 (flat files 0.26); accents step 2 +4, step 12 +3, step 15 +1; weakest step 16 -4, step 10 -4
- register (MIDI, transposed to C) 65 (62–71)
- degrees (maj): 1 0.22, 5 0.16, 3 0.14, 4 0.12, 2 0.12, 6 0.11
- chords: voices 2.8 (2.1–3.1), spread 8 st, inversion share 0.55 (0.4–0.72), changes/bar 1.13 (0.81–1.64), qualities maj 0.34, pow 0.32, min 0.21, min7 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.12, 4-bar 0.16, longer 0.7; rhythm only: 1-bar 0.23, 2-bar 0.09, 4-bar 0.12, longer 0.56

**keys** (86 songs, in 0.78 of songs)
- onsets/bar 4 (2–7); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (1–3), off-16th onset share 0.14 (0.02–0.34)
- length 1.98 (1–3.79) 16ths, gate (length ÷ gap to next onset) 0.73 (0.5–0.98)
- velocity mean 87 ± 11.8 (flat files 0.17); accents step 14 +1, step 13 +1, step 8 +1; weakest step 4 -2, step 16 -2
- register (MIDI, transposed to C) 64 (60–68)
- degrees (maj): 1 0.22, 5 0.16, 3 0.13, 6 0.11, 2 0.11, 4 0.11
- chords: voices 3.2 (3–3.6), spread 9 st, inversion share 0.6 (0.29–0.74), changes/bar 1.76 (1.06–2.34), qualities maj 0.42, min 0.22, pow 0.13, maj7 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.12, 4-bar 0.11, longer 0.78; rhythm only: 1-bar 0.13, 2-bar 0.09, 4-bar 0.1, longer 0.68

**guitar** (80 songs, in 0.72 of songs)
- onsets/bar 6 (4–9.2); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,8,9,11,12,13,14,15
- syncopation: LHL/bar 2.5 (1.3–3.2), off-16th onset share 0.29 (0.04–0.45)
- length 1 (0.68–1.99) 16ths, gate (length ÷ gap to next onset) 0.67 (0.4–0.93)
- velocity mean 86 ± 12.5 (flat files 0.15); accents step 13 +4, step 1 +2, step 9 +1; weakest step 2 -9, step 6 -6
- register (MIDI, transposed to C) 60 (58–64)
- degrees (maj): 1 0.28, 5 0.2, 2 0.1, 3 0.1, 6 0.1, 4 0.09
- chords: voices 2.8 (2–3.1), spread 8 st, inversion share 0.73 (0.51–0.97), changes/bar 1.53 (0.82–2.53), qualities pow 0.38, maj 0.29, min 0.16, sus 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.08, 4-bar 0.11, longer 0.74; rhythm only: 1-bar 0.2, 2-bar 0.11, 4-bar 0.05, longer 0.65

**lead** (84 songs, in 0.76 of songs)
- onsets/bar 4 (3.8–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.5–3.6), off-16th onset share 0.16 (0.03–0.35)
- length 1.67 (1.2–2) 16ths, gate (length ÷ gap to next onset) 0.8 (0.57–1)
- velocity mean 96 ± 9.8 (flat files 0.26); accents step 1 +2, step 9 +1, step 13 +1; weakest step 2 -1, step 14 -1
- register (MIDI, transposed to C) 67 (63–72)
- degrees (maj): 1 0.23, 2 0.15, 5 0.15, 3 0.13, 6 0.12, 4 0.07
- intervals: repeat 0.22 (0.1–0.37), step 1–2 0.41 (0.28–0.52), skip 3–4 0.16 (0.08–0.25), leap 5–7 0.07 (0.03–0.11), octave 0 (0–0.02), descending share of moves 0.53 (0.48–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.07, 4-bar 0.12, longer 0.79; rhythm only: 1-bar 0.09, 2-bar 0.06, 4-bar 0.1, longer 0.75

**arp** (10 songs, in 0.09 of songs)
- onsets/bar 8 (7–8.5); steps with P ≥ .5: 1,3,5,7,9,11,15; P ≥ .3: 1,3,5,7,9,11,12,13,14,15
- syncopation: LHL/bar 3.8 (2.4–4.3), off-16th onset share 0.42 (0.09–0.44)
- length 0.93 (0.81–1.02) 16ths, gate (length ÷ gap to next onset) 0.78 (0.56–0.82)
- velocity mean 90 ± 8.3 (flat files 0.4); accents step 9 +3, step 15 +2, step 1 +1; weakest step 12 -3, step 8 -2
- register (MIDI, transposed to C) 65 (61–68)
- degrees (maj): 1 0.26, 5 0.2, 4 0.11, 2 0.11, 3 0.1, 6 0.07
- intervals: repeat 0.08 (0.04–0.36), step 1–2 0.33 (0.15–0.56), skip 3–4 0.21 (0.12–0.28), leap 5–7 0.06 (0.04–0.14), octave 0.01 (0–0.02), descending share of moves 0.5 (0.46–0.52)
- arp shape up 0.17, down 0.09, updown 0.28, random 0.46, static 0.01; spacing (16ths) {'2.0': 5, '1.0': 3, '1.5': 1, '1.75': 1}; octave span 0.75 (0.67–0.78)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.25, longer 0.71; rhythm only: 1-bar 0.25, 2-bar 0.04, 4-bar 0.25, longer 0.46

**seq** (25 songs, in 0.23 of songs)
- onsets/bar 5 (3–6); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.8 (0.9–3.8), off-16th onset share 0.26 (0.12–0.34)
- length 1.6 (0.91–2.33) 16ths, gate (length ÷ gap to next onset) 0.68 (0.6–0.96)
- velocity mean 97 ± 11.5 (flat files 0.28); accents step 13 +2, step 2 +1, step 12 +1; weakest step 6 -6, step 10 -3
- register (MIDI, transposed to C) 51 (48–55)
- degrees (maj): 1 0.22, 5 0.17, 4 0.16, 2 0.15, 3 0.12, 6 0.11
- intervals: repeat 0.23 (0.1–0.45), step 1–2 0.33 (0.08–0.5), skip 3–4 0.05 (0–0.16), leap 5–7 0.09 (0.04–0.23), octave 0 (0–0.01), descending share of moves 0.49 (0.45–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.14, 4-bar 0.1, longer 0.69; rhythm only: 1-bar 0.16, 2-bar 0.09, 4-bar 0.1, longer 0.66

**fx** (6 songs, in 0.05 of songs)
- onsets/bar 2.5 (1.2–6.8); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.2–1), off-16th onset share 0 (0–0.05)
- length 1.54 (0.83–9.44) 16ths, gate (length ÷ gap to next onset) 0.57 (0.23–0.94)
- velocity mean 79 ± 14.4 (flat files 0.5); accents step 6 +9, step 5 +3, step 9 +3; weakest step 15 -3, step 7 -2
- register (MIDI, transposed to C) 66 (60–70)
- degrees (maj): 1 0.66, 5 0.1, 6 0.07, 2 0.06, 4 0.06, 3 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.2, 2-bar 0.2, 4-bar 0.17, longer 0.42; rhythm only: 1-bar 0.6, 2-bar 0, 4-bar 0, longer 0.4

**drums** (108 songs with a usable kit; flat-velocity files 0.14)
- families: kick_4otf 0.14, kick_1_and_9_only 0.44, snare_backbeat_5_13 0.64, snare_halftime_9 0.01, hat_16ths 0.07, hat_8ths 0.43, hat_offbeat_only 0, hat_none 0.14
- kick: hits/bar 3.6 (2.8–4.1), songs using 0.99, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13,15; vel 104 ± 6.9
- snare: hits/bar 2 (1.5–2.2), songs using 0.91, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 104 ± 6.7
- hat: hits/bar 7.1 (4.2–8), songs using 0.86, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 85 ± 14.2
- perc: hits/bar 2.6 (0–7.7), songs using 0.62, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,7,8,9,10,11,12,13,15,16; vel 75 ± 17.4
- tom: hits/bar 0 (0–0), songs using 0.03, P ≥ .5 at steps none, P ≥ .2 at none; vel 57 ± 0.5
- cymb: hits/bar 0.2 (0.1–0.9), songs using 0.41, P ≥ .5 at steps none, P ≥ .2 at 1; vel 76 ± 13.6
- open-hat share of hat hits 0.13, ride share of cymbals 0.35, fill-bar share 0.08

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 42 | 102 / 120 / 143 | 0.43 | 5 (4–6) | 0.81 (0.61–0.92) | 0.39 (0.28–0.5) | 0.52 | 0.05 | 0.09 | 0.07 | i III (0.22) |
| new | 26 | 98 / 120 / 160 | 0.5 | 5.5 (4–8) | 0.87 (0.57–0.99) | 0.46 (0.17–0.52) | 0.58 | 0.19 | 0.08 | 0.04 | i VI III VI (0.15) |

