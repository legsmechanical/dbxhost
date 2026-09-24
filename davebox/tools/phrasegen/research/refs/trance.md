# TRANCE — reference statistics

**127 songs measured** (140 selected), 101 artists; sources {'lmd': 113, 'lamd': 14}; eras {'new': 70, '90s': 18, '80s': 3, '?': 36}; era splits: {'new': 70}. Every table: `analysis/out/trance_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **120 / 133 / 140**; file BPM q1/med/q3 125 / 132 / 138; minor share **0.67**.

## Findings

Positive control passes: tempo p50 **133 BPM** (p10–p90 120–140), minor 67 %. Bass is a constant 8th pulse (P ≥ .5 on all eight 8ths, repeated-note share .69 — the rolling pedal bass), pads are near-universal (76 %) and held for a bar or more. The chord-sheet data make the minor loop explicit: i–VI–VII and i–VII–VI–VII lead (16 % / 15 % of 638 sheets); in the MIDI the major I–V–vi–IV leads major songs (28 %).

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.73 (0.48–0.99). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI VII | 0.11 | 0.05 |
| i iv | 0.1 | 0.04 |
| i v | 0.1 | 0.03 |
| i VII | 0.1 | 0.02 |
| i VI | 0.09 | 0.05 |
| i VII VI | 0.06 | 0.04 |
| i VI VII v | 0.06 | 0.03 |
| i iv i VII | 0.06 | 0.01 |
| i VII VI VII | 0.05 | 0.01 |
| VI iv v | 0.05 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V vi IV | 0.28 | 0.17 |
| I V IV | 0.17 | 0.04 |
| I vi V IV | 0.1 | 0.02 |
| I IV V IV | 0.1 | 0.01 |
| I IV | 0.1 | 0.05 |
| I V vi V | 0.1 | 0.01 |
| I IV V | 0.1 | 0.02 |
| I V | 0.07 | 0.05 |
| I V I IV | 0.07 | 0.01 |
| I V IV V | 0.07 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 638 songs, minor share 0.56; share of songs containing the loop ≥ 2×): i VI VII (min) 0.16, i VII VI VII (min) 0.15, i VII VI (min) 0.12, I V vi IV (maj) 0.1, I V IV (maj) 0.09, i III VI VII (min) 0.09, i VI III VII (min) 0.09, i VI (min) 0.09. By era: new (490 songs, minor 0.63): i VI VII (min) 0.2, i VII VI VII (min) 0.17, i VII VI (min) 0.14, i III VI VII (min) 0.11

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (116 songs, in 0.91 of songs)
- onsets/bar 8 (5–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 1.2 (0–3.7), off-16th onset share 0.2 (0–0.4)
- length 1.4 (0.97–2) 16ths, gate (length ÷ gap to next onset) 0.68 (0.48–0.98)
- velocity mean 105 ± 8.3 (flat files 0.56); accents step 6 +1, step 9 +0, step 2 +0; weakest step 16 -2, step 14 -1
- register (MIDI, transposed to C) 36 (34–38)
- degrees (min): 1 0.42, b6 0.13, b7 0.13, 5 0.1, b3 0.08, 4 0.08
- intervals: repeat 0.69 (0.28–0.88), step 1–2 0.05 (0.01–0.15), skip 3–4 0.03 (0–0.06), leap 5–7 0.03 (0.01–0.07), octave 0 (0–0.05), descending share of moves 0.5 (0.47–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.11, 2-bar 0.04, 4-bar 0.28, longer 0.57; rhythm only: 1-bar 0.6, 2-bar 0.05, 4-bar 0.06, longer 0.28

**chord** (39 songs, in 0.31 of songs)
- onsets/bar 5 (4–8); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,3,4,5,7,9,11,12,13,15
- syncopation: LHL/bar 2.8 (1.2–4), off-16th onset share 0.26 (0.13–0.36)
- length 1 (0.52–1.39) 16ths, gate (length ÷ gap to next onset) 0.48 (0.33–0.66)
- velocity mean 94 ± 10.4 (flat files 0.33); accents step 11 +3, step 9 +2, step 15 +2; weakest step 6 -7, step 2 -4
- register (MIDI, transposed to C) 65 (60–69)
- degrees (min): 1 0.25, b3 0.2, 5 0.14, 4 0.1, b7 0.09, b6 0.09
- chords: voices 2 (2–2.7), spread 7 st, inversion share 0.6 (0.16–1), changes/bar 1.39 (0.58–2.33), qualities pow 0.63, maj 0.26, min 0.07, sus 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.13, 4-bar 0.2, longer 0.65; rhythm only: 1-bar 0.22, 2-bar 0.24, 4-bar 0.17, longer 0.37

**pad** (97 songs, in 0.76 of songs)
- onsets/bar 1 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1
- syncopation: LHL/bar 0.1 (0–1.8), off-16th onset share 0 (0–0.16)
- length 14.91 (3.21–16) 16ths, gate (length ÷ gap to next onset) 1 (0.94–1)
- velocity mean 82 ± 10.4 (flat files 0.47); accents step 5 +2, step 2 +2, step 4 +1; weakest step 10 -18, step 6 -6
- register (MIDI, transposed to C) 63 (60–68)
- degrees (min): 1 0.23, 5 0.18, b3 0.17, b7 0.12, 2 0.09, b6 0.09
- chords: voices 2.9 (2.1–3.1), spread 9 st, inversion share 0.33 (0.12–0.68), changes/bar 0.96 (0.65–1.12), qualities maj 0.4, min 0.32, pow 0.22, maj7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.06, 4-bar 0.31, longer 0.62; rhythm only: 1-bar 0.41, 2-bar 0.08, 4-bar 0.08, longer 0.43

**keys** (67 songs, in 0.53 of songs)
- onsets/bar 5 (3–8); steps with P ≥ .5: 1,3,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (0.4–4.2), off-16th onset share 0.2 (0.01–0.38)
- length 1.85 (1–3.93) 16ths, gate (length ÷ gap to next onset) 0.77 (0.47–0.99)
- velocity mean 90 ± 8.6 (flat files 0.46); accents step 14 +1, step 5 +0, step 12 +0; weakest step 3 -0, step 6 -0
- register (MIDI, transposed to C) 63 (60–67)
- degrees (min): 1 0.22, 5 0.2, b3 0.17, b7 0.12, 2 0.11, b6 0.08
- chords: voices 2.9 (2–3), spread 8 st, inversion share 0.5 (0.12–0.68), changes/bar 1.43 (0.87–2.06), qualities pow 0.35, maj 0.34, min 0.24, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.11, 4-bar 0.27, longer 0.58; rhythm only: 1-bar 0.38, 2-bar 0.11, 4-bar 0.14, longer 0.36

**guitar** (64 songs, in 0.5 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,12,13,15
- syncopation: LHL/bar 2 (1–3.4), off-16th onset share 0.25 (0–0.4)
- length 1.39 (0.97–2) 16ths, gate (length ÷ gap to next onset) 0.95 (0.5–1)
- velocity mean 90 ± 10.8 (flat files 0.41); accents step 1 +2, step 9 +2, step 5 +1; weakest step 6 -3, step 4 -2
- register (MIDI, transposed to C) 60 (55–62)
- degrees (min): 1 0.27, b3 0.17, b7 0.15, 5 0.15, 2 0.11, 4 0.07
- chords: voices 2.7 (2–3), spread 8 st, inversion share 0.5 (0.1–0.85), changes/bar 1.04 (0.45–1.47), qualities pow 0.42, maj 0.31, min 0.23, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0.09, 4-bar 0.2, longer 0.62; rhythm only: 1-bar 0.33, 2-bar 0.12, 4-bar 0.1, longer 0.45

**lead** (107 songs, in 0.84 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.1–3.1), off-16th onset share 0.11 (0.01–0.3)
- length 1.96 (1.12–2.27) 16ths, gate (length ÷ gap to next onset) 0.79 (0.56–0.99)
- velocity mean 98 ± 11.7 (flat files 0.35); accents step 1 +1, step 9 +1, step 7 +1; weakest step 6 -3, step 2 -3
- register (MIDI, transposed to C) 67 (65–72)
- degrees (min): 1 0.22, 5 0.21, b3 0.17, 4 0.11, 2 0.11, b7 0.1
- intervals: repeat 0.25 (0.06–0.42), step 1–2 0.32 (0.19–0.51), skip 3–4 0.12 (0.05–0.21), leap 5–7 0.08 (0.03–0.17), octave 0 (0–0.01), descending share of moves 0.51 (0.47–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.01, 4-bar 0.12, longer 0.83; rhythm only: 1-bar 0.21, 2-bar 0.05, 4-bar 0.1, longer 0.63

**arp** (20 songs, in 0.16 of songs)
- onsets/bar 10 (6.8–16); steps with P ≥ .5: 1,3,4,5,7,8,9,10,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2 (0–3.1), off-16th onset share 0.43 (0.31–0.5)
- length 0.96 (0.79–1.02) 16ths, gate (length ÷ gap to next onset) 0.79 (0.55–0.97)
- velocity mean 96 ± 9.4 (flat files 0.5); accents step 3 +3, step 5 +2, step 9 +2; weakest step 10 -6, step 8 -3
- register (MIDI, transposed to C) 72 (68–74)
- degrees (min): 1 0.29, 5 0.18, b3 0.17, 2 0.1, b7 0.08, 4 0.08
- intervals: repeat 0.09 (0–0.16), step 1–2 0.24 (0.11–0.33), skip 3–4 0.23 (0.08–0.44), leap 5–7 0.15 (0.11–0.34), octave 0 (0–0.04), descending share of moves 0.54 (0.49–0.59)
- arp shape up 0.07, down 0.27, updown 0.07, random 0.58, static 0.01; spacing (16ths) {'1.0': 11, '2.0': 7, '3.0': 2}; octave span 0.67 (0.58–0.83)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0, 4-bar 0.23, longer 0.68; rhythm only: 1-bar 0.6, 2-bar 0, 4-bar 0, longer 0.4

**seq** (48 songs, in 0.38 of songs)
- onsets/bar 8 (6–12); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 1.3 (0–3.1), off-16th onset share 0.26 (0.01–0.44)
- length 0.86 (0.56–1.46) 16ths, gate (length ÷ gap to next onset) 0.53 (0.45–0.74)
- velocity mean 91 ± 13.9 (flat files 0.35); accents step 1 +1, step 7 +0, step 6 +0; weakest step 16 -1, step 4 -0
- register (MIDI, transposed to C) 59 (58–63)
- degrees (min): 1 0.29, 5 0.16, b3 0.14, b7 0.11, b6 0.11, 4 0.08
- intervals: repeat 0.45 (0.23–0.8), step 1–2 0.06 (0.01–0.26), skip 3–4 0.04 (0–0.12), leap 5–7 0.03 (0.01–0.15), octave 0 (0–0.02), descending share of moves 0.5 (0.38–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.16, 2-bar 0.02, 4-bar 0.26, longer 0.56; rhythm only: 1-bar 0.63, 2-bar 0.02, 4-bar 0.06, longer 0.29

**fx** (27 songs, in 0.21 of songs)
- onsets/bar 4 (1.5–8); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,4,5,7,9,11,12,13,15
- syncopation: LHL/bar 1.8 (0.2–4), off-16th onset share 0.14 (0–0.43)
- length 1.3 (0.99–9.29) 16ths, gate (length ÷ gap to next onset) 0.65 (0.37–0.98)
- velocity mean 85 ± 11.7 (flat files 0.41); accents step 12 +3, step 9 +2, step 4 +2; weakest step 10 -6, step 16 -4
- register (MIDI, transposed to C) 69 (67–74)
- degrees (min): 1 0.21, 5 0.19, b7 0.13, b3 0.12, b6 0.1, 4 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.1, 2-bar 0, 4-bar 0.34, longer 0.56; rhythm only: 1-bar 0.49, 2-bar 0.03, 4-bar 0.14, longer 0.34

**drums** (109 songs with a usable kit; flat-velocity files 0.18)
- families: kick_4otf 0.62, kick_1_and_9_only 0.14, snare_backbeat_5_13 0.65, snare_halftime_9 0, hat_16ths 0.17, hat_8ths 0.28, hat_offbeat_only 0.04, hat_none 0.08
- kick: hits/bar 3.9 (3.6–4), songs using 0.98, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,5,9,13; vel 121 ± 2.8
- snare: hits/bar 1.9 (1.5–2.1), songs using 0.93, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 99 ± 3.8
- hat: hits/bar 7.4 (5.2–10.3), songs using 0.92, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 87 ± 7.8
- perc: hits/bar 1.7 (0–7.9), songs using 0.55, P ≥ .5 at steps none, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 77 ± 12.4
- tom: hits/bar 0 (0–0), songs using 0.03, P ≥ .5 at steps none, P ≥ .2 at none; vel 52 ± 4.3
- cymb: hits/bar 0.2 (0–0.5), songs using 0.32, P ≥ .5 at steps none, P ≥ .2 at 1; vel 91 ± 11.3
- open-hat share of hat hits 0.3, ride share of cymbals 0.14, fill-bar share 0.06

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 70 | 114 / 132 / 140 | 0.67 | 8 (5–10) | 0.76 (0.5–0.98) | 0.33 (0.24–0.48) | 0.73 | 0.16 | 0.54 | 0.15 | i VI VII (0.14) |

