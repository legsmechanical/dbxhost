# BREAKS — reference statistics

**52 songs measured** (63 selected), 33 artists; sources {'freemidi': 14, 'lmd': 25, 'lamd': 13}; eras {'?': 33, 'new': 12, '80s': 4, '90s': 3}; era splits: {'new': 12}. Every table: `analysis/out/breaks_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **106 / 128 / 158**; file BPM q1/med/q3 116 / 127 / 135; minor share **0.61**.

## Findings

Kick is neither 4otf nor backbeat (25 % / 23 %): the breakbeat kick spreads over steps 1, 3, 11 (P .85/.25/.50) with the snare on 5+13. 16th hats in 23 % of songs, the highest outside italo. Arps appear in 15 % of songs and run 16ths (P ≥ .5 on every step).

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.8 (0.4–1.1). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.19 | 0.05 |
| i VI | 0.12 | 0.05 |
| i III iv | 0.12 | 0.02 |
| i VII IV | 0.12 | 0.02 |
| i iv VI iv | 0.08 | 0.01 |
| i VI i iv | 0.08 | 0 |
| i v | 0.08 | 0.01 |
| i III | 0.08 | 0.04 |
| i VII iv | 0.08 | 0.03 |
| III iv v | 0.08 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V IV V | 0.19 | 0.02 |
| I bVII IV | 0.19 | 0.08 |
| I V | 0.12 | 0.04 |
| I V IV | 0.12 | 0.01 |
| I V vi IV | 0.12 | 0.01 |
| I IV | 0.12 | 0.06 |
| I bVI | 0.12 | 0.03 |
| I IV ii V | 0.06 | 0.02 |
| I V IV ii | 0.06 | 0.01 |
| IV ii V | 0.06 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 83 songs, minor share 0.45; share of songs containing the loop ≥ 2×): I IV (maj) 0.16, I ii (maj) 0.08, I IV V (maj) 0.07, I IV V IV (maj) 0.07, I V IV (maj) 0.07, I IV I V (maj) 0.07, I IV I bVII (maj) 0.07, i VII VI VII (min) 0.07. By era: new (53 songs, minor 0.49): I IV (maj) 0.15, i VII VI VII (min) 0.11, I ii (maj) 0.09, I IV V (maj) 0.07

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (47 songs, in 0.9 of songs)
- onsets/bar 7 (5–8.2); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,8,9,11,13,15
- syncopation: LHL/bar 1.5 (0.8–3.6), off-16th onset share 0.23 (0–0.4)
- length 1.6 (0.96–2) 16ths, gate (length ÷ gap to next onset) 0.8 (0.5–1)
- velocity mean 98 ± 10.5 (flat files 0.57); accents step 1 +2, step 9 +1, step 5 +1; weakest step 12 -4, step 14 -4
- register (MIDI, transposed to C) 34 (31–36)
- degrees (min): 1 0.48, b7 0.11, b3 0.1, 4 0.08, 5 0.07, b6 0.06
- intervals: repeat 0.5 (0.36–0.84), step 1–2 0.2 (0.05–0.29), skip 3–4 0.04 (0–0.1), leap 5–7 0.02 (0–0.06), octave 0 (0–0.02), descending share of moves 0.49 (0.42–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.17, 2-bar 0.13, 4-bar 0.24, longer 0.45; rhythm only: 1-bar 0.38, 2-bar 0.16, 4-bar 0.13, longer 0.33

**chord** (15 songs, in 0.29 of songs)
- onsets/bar 7 (5–10); steps with P ≥ .5: 1,3,5,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,15,16
- syncopation: LHL/bar 1.4 (0.2–2.7), off-16th onset share 0.33 (0.26–0.44)
- length 0.96 (0.58–1.85) 16ths, gate (length ÷ gap to next onset) 0.5 (0.4–0.93)
- velocity mean 92 ± 16 (flat files 0.4); accents step 15 +2, step 1 +0, step 14 +0; weakest step 4 -10, step 16 -6
- register (MIDI, transposed to C) 63 (60–67)
- degrees (min): 1 0.43, b3 0.13, 5 0.12, b7 0.07, 4 0.07, 2 0.07
- chords: voices 2 (2–2.2), spread 12 st, inversion share 0.13 (0–0.53), changes/bar 1.63 (0.85–2.02), qualities pow 0.67, maj 0.14, min 0.1, sus 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.15, 2-bar 0, 4-bar 0.23, longer 0.61; rhythm only: 1-bar 0.35, 2-bar 0.07, 4-bar 0.13, longer 0.45

**pad** (25 songs, in 0.48 of songs)
- onsets/bar 2 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1
- syncopation: LHL/bar 0.3 (0–1), off-16th onset share 0 (0–0)
- length 11.67 (3.88–16) 16ths, gate (length ÷ gap to next onset) 1 (0.9–1)
- velocity mean 92 ± 9.3 (flat files 0.52); accents step 6 +4, step 2 +4, step 12 +4; weakest step 16 -12, step 8 -7
- register (MIDI, transposed to C) 64 (57–71)
- degrees (min): 1 0.23, b3 0.2, 5 0.16, b7 0.14, 4 0.09, b6 0.08
- chords: voices 2.2 (2–3), spread 8 st, inversion share 0.78 (0.43–1), changes/bar 1 (0.57–1.96), qualities pow 0.49, maj 0.25, min 0.24, min7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.04, 4-bar 0.32, longer 0.56; rhythm only: 1-bar 0.36, 2-bar 0.12, 4-bar 0.08, longer 0.45

**keys** (23 songs, in 0.44 of songs)
- onsets/bar 6 (3.5–8.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.6 (0–1.5), off-16th onset share 0.1 (0–0.3)
- length 2 (1.49–2.4) 16ths, gate (length ÷ gap to next onset) 0.93 (0.69–1)
- velocity mean 88 ± 7.2 (flat files 0.3); accents step 2 +1, step 15 +0, step 1 +0; weakest step 3 -2, step 7 -1
- register (MIDI, transposed to C) 60 (55–65)
- degrees (min): 1 0.3, 5 0.14, b3 0.13, b7 0.1, 2 0.09, 4 0.07
- chords: voices 3 (2–3.4), spread 8 st, inversion share 0.5 (0.02–0.69), changes/bar 1.45 (0.82–2.72), qualities pow 0.4, maj 0.32, min 0.2, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0.37, 4-bar 0.17, longer 0.37; rhythm only: 1-bar 0.4, 2-bar 0.26, 4-bar 0.03, longer 0.31

**guitar** (26 songs, in 0.5 of songs)
- onsets/bar 7 (4–8); steps with P ≥ .5: 1,3,5,9,11,13,15; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0–3), off-16th onset share 0.18 (0–0.49)
- length 1.67 (0.86–3.65) 16ths, gate (length ÷ gap to next onset) 0.9 (0.5–0.99)
- velocity mean 94 ± 15.3 (flat files 0.5); accents step 6 +2, step 12 +2, step 5 +1; weakest step 2 -8, step 8 -1
- register (MIDI, transposed to C) 55 (48–60)
- degrees (min): 1 0.43, b3 0.18, 5 0.16, b7 0.07, 4 0.06, b6 0.04
- chords: voices 3 (2–3.5), spread 12 st, inversion share 0.23 (0–0.5), changes/bar 1.16 (0.67–2.41), qualities pow 0.6, maj 0.24, min 0.11, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.18, 2-bar 0.22, 4-bar 0.12, longer 0.47; rhythm only: 1-bar 0.41, 2-bar 0.21, 4-bar 0.11, longer 0.27

**lead** (34 songs, in 0.65 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.7–3), off-16th onset share 0.13 (0–0.33)
- length 1.81 (1.04–2.21) 16ths, gate (length ÷ gap to next onset) 0.9 (0.51–0.99)
- velocity mean 94 ± 10.2 (flat files 0.41); accents step 9 +2, step 15 +1, step 1 +0; weakest step 2 -6, step 16 -6
- register (MIDI, transposed to C) 68 (62–72)
- degrees (min): 1 0.33, b3 0.12, b6 0.11, 2 0.09, 5 0.09, 4 0.07
- intervals: repeat 0.31 (0.07–0.43), step 1–2 0.24 (0–0.42), skip 3–4 0.11 (0–0.19), leap 5–7 0.06 (0.02–0.19), octave 0 (0–0.02), descending share of moves 0.51 (0.47–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.23, 4-bar 0.14, longer 0.59; rhythm only: 1-bar 0.2, 2-bar 0.22, 4-bar 0.11, longer 0.48

**arp** (8 songs, in 0.15 of songs)
- onsets/bar 10.5 (7.8–16); steps with P ≥ .5: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 1.2 (0–2.6), off-16th onset share 0.47 (0.4–0.5)
- length 0.97 (0.8–1.12) 16ths, gate (length ÷ gap to next onset) 0.79 (0.5–0.97)
- velocity mean 99 ± 11.2 (flat files 0.5); accents step 13 +3, step 1 +2, step 2 +2; weakest step 8 -4, step 16 -2
- register (MIDI, transposed to C) 72 (68–76)
- degrees (min): 1 0.33, b3 0.18, b7 0.17, 5 0.17, 4 0.1, b6 0.02
- intervals: repeat 0.15 (0.05–0.25), step 1–2 0.18 (0.02–0.24), skip 3–4 0.15 (0.05–0.32), leap 5–7 0.2 (0.16–0.38), octave 0.08 (0.01–0.28), descending share of moves 0.35 (0.35–0.41)
- arp shape up 0.12, down 0.06, updown 0.03, random 0.78, static 0.01; spacing (16ths) {'1.0': 6, '2.0': 2}; octave span 0.88 (0.65–1.06)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.2, 2-bar 0.07, 4-bar 0.28, longer 0.44; rhythm only: 1-bar 0.6, 2-bar 0.07, 4-bar 0.05, longer 0.28

**seq** (16 songs, in 0.31 of songs)
- onsets/bar 4.5 (3–8.1); steps with P ≥ .5: 1,9,11,15; P ≥ .3: 1,3,5,7,9,11,13,14,15
- syncopation: LHL/bar 1 (0–2.6), off-16th onset share 0.13 (0–0.33)
- length 1.78 (0.99–1.96) 16ths, gate (length ÷ gap to next onset) 0.75 (0.64–0.94)
- velocity mean 96 ± 6.9 (flat files 0.69); accents step 5 +2, step 4 +2, step 9 +0; weakest step 2 -4, step 6 -4
- register (MIDI, transposed to C) 38 (36–42)
- degrees (min): 1 0.62, b3 0.16, 2 0.06, b7 0.05, 7 0.04, 5 0.04
- intervals: repeat 0.38 (0.02–0.72), step 1–2 0.13 (0.05–0.34), skip 3–4 0.05 (0–0.18), leap 5–7 0.04 (0–0.21), octave 0 (0–0.03), descending share of moves 0.51 (0.49–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.4, 2-bar 0.17, 4-bar 0.08, longer 0.34; rhythm only: 1-bar 0.53, 2-bar 0.14, 4-bar 0.08, longer 0.26

**fx** (4 songs, in 0.08 of songs)
- onsets/bar 6 (4.1–7); steps with P ≥ .5: 1,3,5,7,11,13,15; P ≥ .3: 1,3,5,7,8,10,11,13,15
- syncopation: LHL/bar 3.1 (2.4–4), off-16th onset share 0.19 (0.08–0.32)
- length 1.98 (1.68–2.94) 16ths, gate (length ÷ gap to next onset) 0.97 (0.82–0.98)
- velocity mean 93 ± 9.5 (flat files 0.75); accents step 15 +7, step 14 +6, step 1 +6; weakest step 10 -12, step 7 -5
- register (MIDI, transposed to C) 64 (64–68)
- degrees (min): 1 0.58, b3 0.1, 5 0.08, b7 0.06, 4 0.05, b2 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.4, longer 0.6; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.4, longer 0.6

**drums** (48 songs with a usable kit; flat-velocity files 0.12)
- families: kick_4otf 0.25, kick_1_and_9_only 0.23, snare_backbeat_5_13 0.65, snare_halftime_9 0, hat_16ths 0.23, hat_8ths 0.25, hat_offbeat_only 0.04, hat_none 0.19
- kick: hits/bar 4 (3–4.5), songs using 0.96, P ≥ .5 at steps 1,9, P ≥ .2 at 1,3,5,9,11,13; vel 115 ± 5.2
- snare: hits/bar 2 (1.8–2.7), songs using 0.98, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 5.7
- hat: hits/bar 6.8 (4.4–11.6), songs using 0.83, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 96 ± 9.9
- perc: hits/bar 2.6 (0–8), songs using 0.56, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,14,15,16; vel 83 ± 8.5
- tom: hits/bar 0 (0–0), songs using 0.12, P ≥ .5 at steps none, P ≥ .2 at none; vel 100 ± 0.3
- cymb: hits/bar 0.3 (0–1.5), songs using 0.52, P ≥ .5 at steps none, P ≥ .2 at 1; vel 100 ± 7.2
- open-hat share of hat hits 0.26, ride share of cymbals 0.22, fill-bar share 0.03

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 12 | 120 / 130 / 140 | 0.42 | 5.5 (4–6.8) | 0.56 (0.4–0.88) | 0.25 (0–0.38) | 0.42 | 0.08 | 0.6 | 0.2 | i III (0.5) |

