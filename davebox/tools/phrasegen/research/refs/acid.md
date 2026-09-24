# ACID — reference statistics

**13 songs measured** (16 selected), 9 artists; sources {'lmd': 11, 'freemidi': 2}; eras {'80s': 9, '90s': 2, 'new': 1, '?': 1}. Every table: `analysis/out/acid_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **112 / 127 / 146**; file BPM q1/med/q3 123 / 127 / 131; minor share **0.54**.

## Findings

Thin (13 songs) but coherent: kick 4otf 73 %, and the bass is the densest measured (**10 onsets/bar**, off-16th share .33, 1-bar rhythm loops) — the 303 line. Pads, where present, hold a whole bar and loop every bar (82 % of windows).

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.8 (0.47–0.98). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.5 | 0.07 |
| i iv VI | 0.33 | 0.1 |
| i v IV | 0.17 | 0.1 |
| i III v IV | 0.17 | 0.01 |
| i III IV | 0.17 | 0.01 |
| i v III IV | 0.17 | 0.01 |
| i iv i IV | 0.17 | 0 |
| i iv i v | 0.17 | 0 |
| i v IV iv | 0.17 | 0 |
| i III VII | 0.17 | 0.06 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I II IV V | 0.33 | 0.3 |
| I vi ii V | 0.17 | 0.03 |
| I V I IV | 0.17 | 0.02 |
| I IV | 0.17 | 0.01 |
| I IV I ii | 0.17 | 0.01 |
| I ii V | 0.17 | 0.01 |
| I vi ii bVII | 0.17 | 0.03 |
| I bVII v IV | 0.17 | 0.01 |
| I V v IV | 0.17 | 0.01 |
| I vi ii IV | 0.17 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 26 songs, minor share 0.27; share of songs containing the loop ≥ 2×): I vi IV V (maj) 0.15, I IV vi V (maj) 0.12, I vi V (maj) 0.12, I II IV V (maj) 0.12, I V IV V (maj) 0.12, I IV (maj) 0.12, IV vi V vi (maj) 0.08, II IV V IV (maj) 0.08. By era: new (13 songs, minor 0.23): I vi IV V (maj) 0.23, IV vi V vi (maj) 0.15, I IV vi V (maj) 0.15, I II IV V (maj) 0.15

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (13 songs, in 1 of songs)
- onsets/bar 10 (7–12); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.2 (0.1–4.6), off-16th onset share 0.33 (0–0.5)
- length 1 (0.75–1.8) 16ths, gate (length ÷ gap to next onset) 0.75 (0.48–0.89)
- velocity mean 111 ± 4.3 (flat files 0.46); accents step 1 +1, step 12 +0, step 15 +0; weakest step 9 -0, step 13 -0
- register (MIDI, transposed to C) 36 (36–36)
- degrees (min): 1 0.54, 5 0.15, 4 0.09, 2 0.07, b7 0.07, b6 0.04
- intervals: repeat 0.26 (0.08–0.65), step 1–2 0.12 (0.04–0.25), skip 3–4 0.04 (0–0.19), leap 5–7 0.16 (0.06–0.23), octave 0.02 (0–0.13), descending share of moves 0.48 (0.45–0.49)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.24, 2-bar 0.08, 4-bar 0.16, longer 0.52; rhythm only: 1-bar 0.36, 2-bar 0.08, 4-bar 0.12, longer 0.43

**chord** (3 songs, in 0.23 of songs)
- onsets/bar 5 (3.5–7.5); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,2,3,5,7,9,10,12,13,14,15
- syncopation: LHL/bar 2.4 (1.8–2.7), off-16th onset share 0.24 (0.12–0.33)
- length 0.56 (0.49–1.26) 16ths, gate (length ÷ gap to next onset) 0.42 (0.24–0.56)
- velocity mean 97 ± 17.4 (flat files 0); accents step 13 +11, step 12 +10, step 11 +9; weakest step 4 -13, step 3 -12
- register (MIDI, transposed to C) 60 (55–62)
- degrees (min): 1 0.43, 5 0.25, b7 0.1, b3 0.08, b6 0.04, 4 0.03
- chords: voices 2 (2–2.4), spread 8 st, inversion share 0.61 (0.49–0.74), changes/bar 1.77 (0.95–2.39), qualities pow 0.5, min 0.47, maj 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.28, 2-bar 0.18, 4-bar 0.08, longer 0.45; rhythm only: 1-bar 0.59, 2-bar 0, 4-bar 0.08, longer 0.32

**pad** (8 songs, in 0.61 of songs)
- onsets/bar 1 (1–1.1); steps with P ≥ .5: 1; P ≥ .3: 1
- syncopation: LHL/bar 0.2 (0–0.7), off-16th onset share 0 (0–0.15)
- length 15.94 (13.93–16.05) 16ths, gate (length ÷ gap to next onset) 0.99 (0.99–1.02)
- velocity mean 81 ± 7.2 (flat files 0.38); accents step 3 +5, step 8 +5, step 10 +2; weakest step 4 -1, step 14 -1
- register (MIDI, transposed to C) 60 (56–66)
- degrees (min): 1 0.23, 5 0.22, b3 0.14, 2 0.13, b7 0.1, 4 0.06
- chords: voices 3 (2.7–3.5), spread 9 st, inversion share 0.74 (0.13–0.84), changes/bar 0.99 (0.73–1.16), qualities maj7 0.29, maj 0.27, pow 0.22, min 0.2
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.17, 4-bar 0.65, longer 0.18; rhythm only: 1-bar 0.82, 2-bar 0, 4-bar 0.17, longer 0.01

**keys** (9 songs, in 0.69 of songs)
- onsets/bar 5 (5–8); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,2,3,4,5,6,7,9,11,12,13,15
- syncopation: LHL/bar 1.7 (1.1–3), off-16th onset share 0.29 (0.2–0.37)
- length 1 (0.68–3.37) 16ths, gate (length ÷ gap to next onset) 0.81 (0.5–0.99)
- velocity mean 88 ± 10.5 (flat files 0.22); accents step 14 +3, step 13 +3, step 9 +2; weakest step 6 -10, step 4 -8
- register (MIDI, transposed to C) 58 (55–63)
- degrees (min): b7 0.27, 1 0.25, 5 0.2, b3 0.1, 2 0.07, 4 0.07
- chords: voices 3 (3–3.1), spread 9 st, inversion share 0.49 (0.34–0.69), changes/bar 1.79 (0.79–3.78), qualities maj 0.33, min 0.27, dim 0.14, pow 0.12
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.3, 2-bar 0, 4-bar 0, longer 0.7; rhythm only: 1-bar 0.55, 2-bar 0, 4-bar 0.02, longer 0.43

**guitar** (8 songs, in 0.61 of songs)
- onsets/bar 6 (4–10); steps with P ≥ .5: 1,3,7,9,11,13,15; P ≥ .3: 1,3,4,5,6,7,9,10,11,13,15
- syncopation: LHL/bar 1.7 (0.1–4.4), off-16th onset share 0.26 (0.03–0.41)
- length 1 (0.85–1.22) 16ths, gate (length ÷ gap to next onset) 0.71 (0.3–0.99)
- velocity mean 103 ± 12.1 (flat files 0.38); accents step 16 +13, step 6 +6, step 14 +6; weakest step 2 -11, step 5 -7
- register (MIDI, transposed to C) 63 (60–66)
- degrees (min): 1 0.29, 5 0.18, 4 0.14, b3 0.13, b7 0.12, 6 0.06
- chords: voices 2.9 (2.5–3.1), spread 8 st, inversion share 0.17 (0.07–0.37), changes/bar 0.92 (0.61–1.33), qualities pow 0.44, maj 0.25, min 0.23, sus 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.2, 2-bar 0, 4-bar 0.04, longer 0.76; rhythm only: 1-bar 0.43, 2-bar 0, 4-bar 0.03, longer 0.54

**lead** (6 songs, in 0.46 of songs)
- onsets/bar 4.5 (4–5); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (2.2–3.9), off-16th onset share 0.18 (0.11–0.21)
- length 2.24 (1.65–3.57) 16ths, gate (length ÷ gap to next onset) 0.93 (0.69–0.99)
- velocity mean 111 ± 5.3 (flat files 0.17); accents step 2 +23, step 10 +21, step 7 +3; weakest step 6 -14, step 16 -12
- register (MIDI, transposed to C) 73 (69–76)
- degrees (min): 1 0.34, 5 0.22, b3 0.17, 4 0.11, b6 0.08, 2 0.04
- intervals: repeat 0.42 (0.26–0.47), step 1–2 0.17 (0.14–0.23), skip 3–4 0.17 (0.09–0.42), leap 5–7 0.07 (0.05–0.12), octave 0.03 (0.01–0.12), descending share of moves 0.51 (0.47–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.13, longer 0.87; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.22, longer 0.78

**arp** (3 songs, in 0.23 of songs)
- onsets/bar 9 (9–10); steps with P ≥ .5: 1,3,4,5,6,7,8,9,11,12,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,15,16
- syncopation: LHL/bar 2.2 (2.1–3), off-16th onset share 0.32 (0.32–0.43)
- length 0.5 (0.5–0.71) 16ths, gate (length ÷ gap to next onset) 0.5 (0.5–0.71)
- velocity mean 98 ± 15 (flat files 0.33); accents step 13 +14, step 1 +10, step 11 +9; weakest step 10 -38, step 16 -23
- register (MIDI, transposed to C) 76 (62–77)
- degrees (min): 1 0.32, b7 0.25, b3 0.21, 5 0.1, 4 0.08, 6 0.03
- intervals: repeat 0.47 (0.24–0.47), step 1–2 0.25 (0.2–0.25), skip 3–4 0.02 (0.02–0.05), leap 5–7 0 (0–0.04), octave 0.25 (0.25–0.4), descending share of moves 0.51 (0.51–0.52)
- arp shape up 0, down 0.14, updown 0.12, random 0.75, static 0; spacing (16ths) {'1.0': 2, '1.25': 1}; octave span 0.33 (0.33–0.96)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.61, 2-bar 0, 4-bar 0, longer 0.39; rhythm only: 1-bar 0.61, 2-bar 0, 4-bar 0, longer 0.39

**seq** (6 songs, in 0.46 of songs)
- onsets/bar 4.5 (2.2–6); steps with P ≥ .5: 1,3,7,9; P ≥ .3: 1,3,5,7,9,11,15
- syncopation: LHL/bar 2 (1.5–3.2), off-16th onset share 0.05 (0–0.28)
- length 0.98 (0.83–1.75) 16ths, gate (length ÷ gap to next onset) 0.54 (0.37–0.74)
- velocity mean 78 ± 5.1 (flat files 0.5); accents step 5 +3, step 8 +3, step 4 +3; weakest step 6 -1, step 10 -0
- register (MIDI, transposed to C) 50 (49–50)
- degrees (min): 1 0.61, 5 0.15, b7 0.09, 2 0.08, 4 0.03, b3 0.03
- intervals: repeat 0.84 (0.19–0.98), step 1–2 0.13 (0–0.35), skip 3–4 0 (0–0.03), leap 5–7 0.03 (0–0.07), octave 0 (0–0), descending share of moves 0.6 (0.52–0.69)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.29, 2-bar 0.05, 4-bar 0.5, longer 0.15; rhythm only: 1-bar 0.5, 2-bar 0.05, 4-bar 0.4, longer 0.05

**fx** (5 songs, in 0.39 of songs)
- onsets/bar 6 (1.5–6); steps with P ≥ .5: 1,9,11; P ≥ .3: 1,5,9,11,13,15
- syncopation: LHL/bar 0.2 (0.2–0.6), off-16th onset share 0 (0–0.07)
- length 1 (1–9.98) 16ths, gate (length ÷ gap to next onset) 0.5 (0.3–0.5)
- velocity mean 95 ± 9.1 (flat files 0.2); accents step 10 +19, step 6 +15, step 12 +15; weakest step 2 -12, step 15 -10
- register (MIDI, transposed to C) 60 (58–63)
- degrees (min): 1 0.38, 5 0.3, b3 0.17, b7 0.11, 2 0.05, b2 0
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 1, longer 0; rhythm only: 1-bar 0, 2-bar 0.25, 4-bar 0.75, longer 0

**drums** (11 songs with a usable kit; flat-velocity files 0.27)
- families: kick_4otf 0.73, kick_1_and_9_only 0.18, snare_backbeat_5_13 0.73, snare_halftime_9 0, hat_16ths 0.18, hat_8ths 0.46, hat_offbeat_only 0, hat_none 0
- kick: hits/bar 4 (3.9–5.3), songs using 1, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,5,9,11,13; vel 122 ± 2.3
- snare: hits/bar 1.9 (1.9–2.1), songs using 0.91, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 109 ± 4.2
- hat: hits/bar 7.9 (6.7–8.1), songs using 1, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,5,6,7,9,10,11,13,14,15; vel 88 ± 4.5
- perc: hits/bar 6.6 (1.1–9.5), songs using 0.73, P ≥ .5 at steps 5,13, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,15,16; vel 60 ± 4.5
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.1 (0–1.2), songs using 0.27, P ≥ .5 at steps none, P ≥ .2 at 1; vel 62 ± 10.3
- open-hat share of hat hits 0.34, ride share of cymbals 0.32, fill-bar share 0

