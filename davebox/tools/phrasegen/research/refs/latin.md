# LATIN — reference statistics

**145 songs measured** (210 selected), 104 artists; sources {'lmd': 145}; eras {'new': 51, '?': 44, '80s': 29, '90s': 21}; era splits: {'80s': 29, 'new': 51}. Every table: `analysis/out/latin_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **96 / 126 / 160**; file BPM q1/med/q3 82 / 104 / 128; minor share **0.37**.

## Findings

Latin pop/rock dominates the parent (145 songs); the salsa/bossa flavours are closer to it than expected because the files are mostly pop arrangements. Bass on 1, 7, 9, 15 (the anticipated 'and-of-2' + 4), snare backbeat weak (50 %), leads more syncopated than pop (off-16th .19). BOSSA (54): snare 5/13 only 42 % (cross-stick), bass on 1, 9, 13, 15. REGGAETON (21): the dembow snare shows as steps 7 and 15 (P .21) beside 5/13, no 16th hats.

Flavours filed under this style: **REGGAETON** (21 songs), **SALSA** (58 songs), **BOSSA** (54 songs), **CUMBIA** (4 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 1 (0.77–1.3). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.2 | 0.04 |
| i VII | 0.13 | 0.02 |
| i V | 0.13 | 0.05 |
| i VII VI V | 0.11 | 0.03 |
| i iv VII III | 0.11 | 0.04 |
| i VII VI | 0.09 | 0.03 |
| i iv V | 0.09 | 0.02 |
| i VII VI VII | 0.09 | 0.01 |
| i VI VII III | 0.07 | 0.02 |
| i v | 0.07 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.18 | 0.05 |
| I IV V | 0.18 | 0.03 |
| I V | 0.15 | 0.04 |
| I V IV | 0.15 | 0.03 |
| I IV I V | 0.15 | 0.03 |
| I V IV V | 0.15 | 0.01 |
| I vi ii V | 0.15 | 0.03 |
| I vi IV V | 0.14 | 0.03 |
| I IV V IV | 0.13 | 0.02 |
| I V I IV | 0.13 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 12779 songs, minor share 0.32; share of songs containing the loop ≥ 2×): I IV (maj) 0.14, I IV V (maj) 0.13, I V vi IV (maj) 0.13, I V IV V (maj) 0.11, I V IV (maj) 0.11, I vi IV V (maj) 0.1, I IV V IV (maj) 0.09, I IV I V (maj) 0.09. By era: 80s (1459 songs, minor 0.28): I IV (maj) 0.17, I IV V (maj) 0.15, I IV I V (maj) 0.11, I V IV V (maj) 0.11; new (8200 songs, minor 0.34): I V vi IV (maj) 0.14, I IV (maj) 0.13, I IV V (maj) 0.12, I V IV (maj) 0.11

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (138 songs, in 0.95 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 1 (0.2–1.9), off-16th onset share 0.06 (0.01–0.27)
- length 2 (1.6–3.54) 16ths, gate (length ÷ gap to next onset) 0.86 (0.72–0.96)
- velocity mean 102 ± 8.3 (flat files 0.22); accents step 1 +2, step 9 +1, step 5 +0; weakest step 8 -4, step 10 -3
- register (MIDI, transposed to C) 36 (31–38)
- degrees (maj): 1 0.24, 5 0.2, 4 0.15, 6 0.11, 2 0.1, 3 0.08
- intervals: repeat 0.35 (0.23–0.52), step 1–2 0.18 (0.1–0.28), skip 3–4 0.07 (0.03–0.13), leap 5–7 0.2 (0.1–0.34), octave 0.02 (0–0.07), descending share of moves 0.49 (0.44–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.07, longer 0.89; rhythm only: 1-bar 0.15, 2-bar 0.03, 4-bar 0.06, longer 0.76

**chord** (51 songs, in 0.35 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.5–4.2), off-16th onset share 0.23 (0.06–0.43)
- length 0.98 (0.79–1.92) 16ths, gate (length ÷ gap to next onset) 0.5 (0.34–0.72)
- velocity mean 93 ± 11.8 (flat files 0.18); accents step 1 +2, step 10 +1, step 15 +1; weakest step 4 -2, step 2 -1
- register (MIDI, transposed to C) 69 (64–72)
- degrees (maj): 5 0.18, 1 0.16, 4 0.13, 3 0.12, 6 0.11, 2 0.09
- chords: voices 2.3 (2–2.7), spread 8 st, inversion share 0.56 (0.19–0.93), changes/bar 1.9 (1.01–3.07), qualities pow 0.51, maj 0.23, min 0.17, dim 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.06, 4-bar 0.04, longer 0.85; rhythm only: 1-bar 0.22, 2-bar 0.06, 4-bar 0, longer 0.72

**pad** (109 songs, in 0.75 of songs)
- onsets/bar 1 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.4 (0.1–1.5), off-16th onset share 0.01 (0–0.12)
- length 8.04 (4.67–15.83) 16ths, gate (length ÷ gap to next onset) 0.99 (0.94–1)
- velocity mean 79 ± 9.2 (flat files 0.25); accents step 14 +4, step 12 +2, step 11 +2; weakest step 1 -0, step 3 -0
- register (MIDI, transposed to C) 63 (60–67)
- degrees (maj): 1 0.18, 5 0.18, 6 0.13, 3 0.13, 4 0.11, 2 0.1
- chords: voices 2.7 (2.1–3), spread 8 st, inversion share 0.47 (0.29–0.72), changes/bar 1.08 (0.85–1.46), qualities maj 0.37, pow 0.32, min 0.2, min7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.02, 4-bar 0.12, longer 0.85; rhythm only: 1-bar 0.2, 2-bar 0.04, 4-bar 0.06, longer 0.7

**keys** (104 songs, in 0.72 of songs)
- onsets/bar 4 (2–7); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.4 (0.3–3), off-16th onset share 0.06 (0.01–0.32)
- length 2.52 (1.75–5.85) 16ths, gate (length ÷ gap to next onset) 0.89 (0.57–1)
- velocity mean 88 ± 11.4 (flat files 0.12); accents step 2 +2, step 1 +1, step 13 +1; weakest step 16 -2, step 10 -1
- register (MIDI, transposed to C) 63 (58–67)
- degrees (maj): 1 0.21, 5 0.19, 4 0.13, 3 0.12, 6 0.11, 2 0.1
- chords: voices 3 (2.6–3.3), spread 9 st, inversion share 0.51 (0.31–0.65), changes/bar 1.6 (1.06–2.47), qualities maj 0.4, pow 0.23, min 0.2, min7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.02, 4-bar 0.08, longer 0.89; rhythm only: 1-bar 0.12, 2-bar 0.01, 4-bar 0.07, longer 0.8

**guitar** (125 songs, in 0.86 of songs)
- onsets/bar 7 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 2 (0.6–4.5), off-16th onset share 0.11 (0.01–0.44)
- length 1.71 (0.97–2.33) 16ths, gate (length ÷ gap to next onset) 0.86 (0.45–1)
- velocity mean 81 ± 11 (flat files 0.13); accents step 1 +2, step 13 +1, step 12 +1; weakest step 2 -3, step 10 -2
- register (MIDI, transposed to C) 60 (55–64)
- degrees (maj): 1 0.23, 5 0.19, 3 0.12, 6 0.11, 2 0.1, 4 0.1
- chords: voices 3 (2.2–3.2), spread 8 st, inversion share 0.58 (0.39–0.76), changes/bar 1.14 (0.59–1.97), qualities maj 0.43, pow 0.25, min 0.2, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.11, longer 0.84; rhythm only: 1-bar 0.26, 2-bar 0.03, 4-bar 0.06, longer 0.65

**lead** (120 songs, in 0.83 of songs)
- onsets/bar 4 (3.4–5.5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.9 (1.9–3.6), off-16th onset share 0.19 (0.05–0.36)
- length 1.89 (1.32–2.4) 16ths, gate (length ÷ gap to next onset) 0.87 (0.67–0.99)
- velocity mean 104 ± 9.1 (flat files 0.23); accents step 1 +1, step 12 +1, step 10 +1; weakest step 16 -1, step 2 -1
- register (MIDI, transposed to C) 68 (65–72)
- degrees (maj): 1 0.2, 5 0.17, 3 0.15, 2 0.13, 6 0.11, 4 0.1
- intervals: repeat 0.23 (0.1–0.38), step 1–2 0.49 (0.33–0.59), skip 3–4 0.14 (0.08–0.19), leap 5–7 0.06 (0.03–0.1), octave 0 (0–0.01), descending share of moves 0.54 (0.47–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.01, 4-bar 0.04, longer 0.93; rhythm only: 1-bar 0.07, 2-bar 0.01, 4-bar 0.05, longer 0.87

**arp** (17 songs, in 0.12 of songs)
- onsets/bar 7 (6–9); steps with P ≥ .5: 1,3,4,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,6,7,8,9,11,12,13,14,15,16
- syncopation: LHL/bar 3 (0.8–3.8), off-16th onset share 0.36 (0.28–0.47)
- length 1 (0.87–1.75) 16ths, gate (length ÷ gap to next onset) 0.89 (0.75–1)
- velocity mean 86 ± 9.1 (flat files 0.35); accents step 1 +4, step 9 +1, step 5 +1; weakest step 10 -2, step 16 -1
- register (MIDI, transposed to C) 71 (64–72)
- degrees (maj): 5 0.2, 1 0.2, 6 0.14, 3 0.12, 2 0.11, 4 0.07
- intervals: repeat 0.06 (0–0.13), step 1–2 0.28 (0.13–0.58), skip 3–4 0.2 (0.17–0.27), leap 5–7 0.14 (0.1–0.23), octave 0.02 (0–0.11), descending share of moves 0.47 (0.4–0.49)
- arp shape up 0.19, down 0.05, updown 0.28, random 0.48, static 0; spacing (16ths) {'1.0': 8, '2.0': 6, '1.5': 2, '3.0': 1}; octave span 0.83 (0.67–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0, 4-bar 0, longer 0.91; rhythm only: 1-bar 0.09, 2-bar 0.06, 4-bar 0, longer 0.85

**seq** (36 songs, in 0.25 of songs)
- onsets/bar 7 (4.8–10.2); steps with P ≥ .5: 1,3,5,9,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.9 (0.5–4.4), off-16th onset share 0.46 (0.15–0.54)
- length 1 (0.81–1.55) 16ths, gate (length ÷ gap to next onset) 0.8 (0.52–0.96)
- velocity mean 97 ± 10.3 (flat files 0.28); accents step 13 +1, step 15 +1, step 8 +0; weakest step 6 -1, step 4 -0
- register (MIDI, transposed to C) 70 (67–72)
- degrees (maj): 1 0.3, 5 0.14, 2 0.13, 4 0.11, 3 0.11, 6 0.07
- intervals: repeat 0.26 (0.14–0.51), step 1–2 0.3 (0.15–0.45), skip 3–4 0.07 (0–0.14), leap 5–7 0.06 (0.01–0.17), octave 0 (0–0.11), descending share of moves 0.5 (0.46–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.14, 4-bar 0.1, longer 0.73; rhythm only: 1-bar 0.31, 2-bar 0.04, 4-bar 0.04, longer 0.62

**fx** (19 songs, in 0.13 of songs)
- onsets/bar 3 (1.5–4); steps with P ≥ .5: 1,9; P ≥ .3: 1,7,9
- syncopation: LHL/bar 1 (0.4–2), off-16th onset share 0.03 (0–0.27)
- length 3.96 (1.44–7.59) 16ths, gate (length ÷ gap to next onset) 0.92 (0.76–0.99)
- velocity mean 86 ± 12.4 (flat files 0.21); accents step 13 +4, step 10 +2, step 12 +2; weakest step 14 -16, step 16 -13
- register (MIDI, transposed to C) 74 (70–77)
- degrees (maj): 1 0.19, 2 0.18, 5 0.16, 3 0.14, 4 0.12, 7 0.11
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.05, longer 0.95; rhythm only: 1-bar 0.17, 2-bar 0, 4-bar 0.14, longer 0.7

**drums** (140 songs with a usable kit; flat-velocity files 0.09)
- families: kick_4otf 0.21, kick_1_and_9_only 0.43, snare_backbeat_5_13 0.5, snare_halftime_9 0.02, hat_16ths 0.16, hat_8ths 0.31, hat_offbeat_only 0.01, hat_none 0.13
- kick: hits/bar 3.2 (2.6–4), songs using 0.96, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13,15; vel 109 ± 6.3
- snare: hits/bar 1.9 (1–2.2), songs using 0.85, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 104 ± 5.2
- hat: hits/bar 6.4 (3.5–8), songs using 0.88, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,8,9,11,13,15; vel 80 ± 11.2
- perc: hits/bar 6.8 (1.2–11.8), songs using 0.79, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 80 ± 16.5
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel 91 ± 2.6
- cymb: hits/bar 0.2 (0.1–1), songs using 0.45, P ≥ .5 at steps none, P ≥ .2 at 1; vel 83 ± 10.1
- open-hat share of hat hits 0.13, ride share of cymbals 0.34, fill-bar share 0.07

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 29 | 88 / 122 / 160 | 0.38 | 4 (3.5–6) | 0.85 (0.75–0.97) | 0.56 (0.46–0.65) | 0.79 | 0.03 | 0.21 | 0.32 | i iv (0.36) |
| new | 51 | 95 / 130 / 161 | 0.47 | 4 (3–6) | 0.86 (0.73–0.95) | 0.41 (0.31–0.51) | 0.78 | 0.12 | 0.21 | 0.12 | i iv VII III (0.17) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### REGGAETON (21 songs, 14 artists; sources {'lmd': 21}; distinctness 0.4)


Tempo p10/p50/p90 97 / 120 / 144; minor share 0.33.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| pad_len16 | 2.91 | 8.04 | -5.13 |
| pad_presence | 0.57 | 0.75 | -0.18 |
| chord_offbeat16_share | 0.05 | 0.23 | -0.18 |
| drum_hat_16ths | 0 | 0.16 | -0.16 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv VII | 0.29 | 0.03 |
| i iv | 0.29 | 0.04 |
| i VI v VI | 0.29 | 0.03 |
| i iv i v | 0.29 | 0.01 |
| i iv i V | 0.29 | 0.03 |
| i v | 0.29 | 0.02 |
| III VI iv VII | 0.14 | 0.03 |
| III VI iv V | 0.14 | 0.01 |
| i VI iv V | 0.14 | 0.01 |
| i I iv V | 0.14 | 0.03 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.43 | 0.09 |
| I IV I V | 0.29 | 0.06 |
| I V I IV | 0.29 | 0.04 |
| I V IV | 0.21 | 0.07 |
| I V ii V | 0.21 | 0.02 |
| I ii V IV | 0.14 | 0.01 |
| I IV vi V | 0.14 | 0.01 |
| I IV I v | 0.14 | 0.01 |
| I v ii IV | 0.14 | 0.04 |
| I v ii | 0.14 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 1293 songs, minor share 0.42; share of songs containing the loop ≥ 2×): I V vi IV (maj) 0.14, I vi IV V (maj) 0.1, I V IV V (maj) 0.08, I IV V (maj) 0.07, I IV (maj) 0.07, I V vi V (maj) 0.07, I V IV (maj) 0.07, i VI VII (min) 0.06. By era: new (1057 songs, minor 0.45): I V vi IV (maj) 0.15, I vi IV V (maj) 0.09, I V IV V (maj) 0.08, I IV V (maj) 0.07

**bass** (21 songs, in 1 of songs)
- onsets/bar 4 (4–5); steps with P ≥ .5: 1,7,9; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.2 (0.1–1.4), off-16th onset share 0.03 (0–0.15)
- length 2.09 (1.78–2.75) 16ths, gate (length ÷ gap to next onset) 0.81 (0.67–0.93)
- velocity mean 102 ± 6.8 (flat files 0.14); accents step 6 +2, step 14 +2, step 3 +1; weakest step 2 -15, step 12 -2
- register (MIDI, transposed to C) 38 (36–41)
- degrees (maj): 1 0.29, 5 0.21, 4 0.17, 2 0.12, 6 0.06, 3 0.06
- intervals: repeat 0.26 (0.13–0.39), step 1–2 0.18 (0.1–0.31), skip 3–4 0.07 (0.03–0.17), leap 5–7 0.27 (0.11–0.43), octave 0.01 (0–0.07), descending share of moves 0.46 (0.42–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.06, longer 0.9; rhythm only: 1-bar 0.07, 2-bar 0.03, 4-bar 0.1, longer 0.81

**chord** (7 songs, in 0.33 of songs)
- onsets/bar 4 (4–6); steps with P ≥ .5: 1,3,5,7,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 3 (1.6–3.2), off-16th onset share 0.05 (0.02–0.32)
- length 1.2 (0.78–1.71) 16ths, gate (length ÷ gap to next onset) 0.6 (0.39–0.64)
- velocity mean 89 ± 9.8 (flat files 0.14); accents step 10 +5, step 16 +4, step 1 +0; weakest step 2 -6, step 4 -6
- register (MIDI, transposed to C) 67 (64–74)
- degrees (maj): 1 0.19, 3 0.16, 5 0.15, 2 0.13, 4 0.12, 6 0.1
- chords: voices 2.9 (2.3–3.1), spread 12 st, inversion share 0.69 (0.53–0.72), changes/bar 2.63 (1.6–3.03), qualities maj 0.33, pow 0.29, min 0.19, dim 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.2, 2-bar 0, 4-bar 0, longer 0.8

**pad** (12 songs, in 0.57 of songs)
- onsets/bar 2 (1.8–4.2); steps with P ≥ .5: 1; P ≥ .3: 1,9,13,15
- syncopation: LHL/bar 0.9 (0–3), off-16th onset share 0.01 (0–0.13)
- length 2.91 (1.62–9.95) 16ths, gate (length ÷ gap to next onset) 0.95 (0.79–0.99)
- velocity mean 88 ± 8.9 (flat files 0.08); accents step 11 +2, step 13 +2, step 15 +0; weakest step 14 -10, step 8 -1
- register (MIDI, transposed to C) 68 (64–72)
- degrees (maj): 1 0.18, 6 0.18, 5 0.18, 4 0.11, 2 0.11, 3 0.1
- chords: voices 2.5 (2–3.1), spread 8 st, inversion share 0.34 (0.14–0.55), changes/bar 1.62 (0.93–2.63), qualities maj 0.39, pow 0.32, min 0.24, dim 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.1, longer 0.87; rhythm only: 1-bar 0.28, 2-bar 0.03, 4-bar 0.11, longer 0.58

**keys** (14 songs, in 0.67 of songs)
- onsets/bar 4 (2.5–5); steps with P ≥ .5: 1,7; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.5–2.6), off-16th onset share 0.03 (0–0.16)
- length 2 (1.44–5.17) 16ths, gate (length ÷ gap to next onset) 0.8 (0.47–0.93)
- velocity mean 97 ± 9.5 (flat files 0.21); accents step 9 +3, step 14 +3, step 5 +3; weakest step 2 -8, step 4 -6
- register (MIDI, transposed to C) 66 (60–70)
- degrees (maj): 1 0.25, 5 0.16, 6 0.14, 4 0.13, 3 0.11, 2 0.09
- chords: voices 3.2 (3–3.5), spread 12 st, inversion share 0.49 (0.47–0.67), changes/bar 1.51 (1.17–2.9), qualities maj 0.6, min 0.26, pow 0.07, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.1, longer 0.87; rhythm only: 1-bar 0.2, 2-bar 0, 4-bar 0.04, longer 0.76

**guitar** (16 songs, in 0.76 of songs)
- onsets/bar 8 (5–9); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,8,9,11,13,15
- syncopation: LHL/bar 1.9 (0.9–3.1), off-16th onset share 0.13 (0.03–0.39)
- length 1.27 (0.97–1.94) 16ths, gate (length ÷ gap to next onset) 0.84 (0.51–0.97)
- velocity mean 86 ± 11.2 (flat files 0.12); accents step 13 +3, step 1 +3, step 9 +2; weakest step 6 -6, step 7 -5
- register (MIDI, transposed to C) 62 (60–66)
- degrees (maj): 1 0.22, 5 0.18, 4 0.13, 3 0.12, 2 0.12, 6 0.1
- chords: voices 2.8 (2.2–3), spread 8 st, inversion share 0.69 (0.55–0.78), changes/bar 1.16 (0.49–2.35), qualities maj 0.41, pow 0.29, min 0.25, maj7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.06, longer 0.87; rhythm only: 1-bar 0.14, 2-bar 0.06, 4-bar 0.05, longer 0.76

**lead** (20 songs, in 0.95 of songs)
- onsets/bar 5 (3–6); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.9–3.5), off-16th onset share 0.05 (0.01–0.27)
- length 1.85 (1.32–2.12) 16ths, gate (length ÷ gap to next onset) 0.84 (0.67–0.9)
- velocity mean 90 ± 9.4 (flat files 0.3); accents step 16 +4, step 1 +1, step 8 +1; weakest step 6 -41, step 2 -24
- register (MIDI, transposed to C) 72 (67–72)
- degrees (maj): 5 0.2, 6 0.16, 1 0.16, 2 0.12, 3 0.11, 4 0.11
- intervals: repeat 0.28 (0.22–0.36), step 1–2 0.41 (0.31–0.49), skip 3–4 0.18 (0.08–0.28), leap 5–7 0.09 (0.05–0.12), octave 0 (0–0.01), descending share of moves 0.55 (0.51–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.06, 4-bar 0.15, longer 0.79; rhythm only: 1-bar 0.06, 2-bar 0.07, 4-bar 0.09, longer 0.78

**arp** (2 songs, in 0.1 of songs)
- onsets/bar 11 (9–13); steps with P ≥ .5: 1,6,7,8,9,10,11,12,14,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,14,15,16
- syncopation: LHL/bar 2.5 (2–3.1), off-16th onset share 0.5 (0.48–0.51)
- length 0.75 (0.75–0.75) 16ths, gate (length ÷ gap to next onset) 0.7 (0.68–0.72)
- velocity mean 97 ± 11.5 (flat files 0.5); accents step 15 +4, step 10 +3, step 7 +2; weakest step 14 -10, step 9 -5
- register (MIDI, transposed to C) 76 (72–79)
- degrees (maj): 1 0.32, 3 0.21, 5 0.2, 2 0.15, 6 0.1, 4 0.02
- intervals: repeat 0.04 (0.02–0.06), step 1–2 0.2 (0.1–0.3), skip 3–4 0.32 (0.32–0.33), leap 5–7 0.27 (0.21–0.34), octave 0.05 (0.04–0.06), descending share of moves 0.42 (0.38–0.46)
- arp shape up 0.12, down 0.25, updown 0, random 0.62, static 0; spacing (16ths) {'1.25': 1, '1.0': 1}; octave span 1.29 (1.15–1.44)
- repetition in 8-bar windows (pitch+rhythm): 1-bar –, 2-bar –, 4-bar –, longer –; rhythm only: 1-bar –, 2-bar –, 4-bar –, longer –

**seq** (5 songs, in 0.24 of songs)
- onsets/bar 7 (4–8); steps with P ≥ .5: 1,5,7,9,13,15; P ≥ .3: 1,3,4,5,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 1.6 (0.7–2), off-16th onset share 0.16 (0.08–0.41)
- length 1.33 (1–1.72) 16ths, gate (length ÷ gap to next onset) 0.85 (0.38–0.87)
- velocity mean 82 ± 11 (flat files 0.8); accents step 1 +2, step 9 -4; weakest step 9 -4, step 1 +2
- register (MIDI, transposed to C) 74 (72–75)
- degrees (maj): 1 0.23, 5 0.21, 2 0.17, 4 0.17, b7 0.07, b2 0.05
- intervals: repeat 0.34 (0.11–0.52), step 1–2 0.33 (0.21–0.37), skip 3–4 0.21 (0.15–0.21), leap 5–7 0.14 (0.07–0.15), octave 0 (0–0), descending share of moves 0.49 (0.47–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.17, longer 0.83; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.17, longer 0.83

**drums** (20 songs with a usable kit; flat-velocity files 0.05)
- families: kick_4otf 0.35, kick_1_and_9_only 0.55, snare_backbeat_5_13 0.5, snare_halftime_9 0, hat_16ths 0, hat_8ths 0.45, hat_offbeat_only 0.05, hat_none 0.05
- kick: hits/bar 3.7 (3–4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,3,5,9,11,13; vel 115 ± 5.9
- snare: hits/bar 2 (1.3–2.7), songs using 0.8, P ≥ .5 at steps 5,13, P ≥ .2 at 5,7,13,15; vel 95 ± 3.5
- hat: hits/bar 7.3 (5.1–8.1), songs using 0.9, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 80 ± 10.8
- perc: hits/bar 7.8 (1.9–13.8), songs using 0.85, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 85 ± 14.5
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.3 (0.1–1.1), songs using 0.35, P ≥ .5 at steps none, P ≥ .2 at 1; vel 75 ± 5.2
- open-hat share of hat hits 0.14, ride share of cymbals 0.45, fill-bar share 0.1

### SALSA (58 songs, 45 artists; sources {'lmd': 58}; distinctness 0.29)


Tempo p10/p50/p90 91 / 120 / 157; minor share 0.4.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| pad_len16 | 4 | 8.04 | -4.04 |
| chord_gate | 0.75 | 0.5 | +0.25 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i V | 0.3 | 0.08 |
| i iv VII V | 0.17 | 0.02 |
| i iv VII III | 0.17 | 0.02 |
| i V i v | 0.17 | 0.02 |
| III VI iv VII | 0.13 | 0.01 |
| i VI iv V | 0.13 | 0.01 |
| i V v | 0.13 | 0.02 |
| i v i V | 0.13 | 0.01 |
| i iv | 0.13 | 0.04 |
| i iv v V | 0.13 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.37 | 0.11 |
| I V IV V | 0.17 | 0.02 |
| I IV ii IV | 0.14 | 0.02 |
| I IV I V | 0.14 | 0.02 |
| I IV V | 0.11 | 0.04 |
| I V vi IV | 0.11 | 0.06 |
| I V vi V | 0.11 | 0.01 |
| I IV V IV | 0.11 | 0.02 |
| I V I IV | 0.11 | 0.01 |
| I V | 0.11 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 403 songs, minor share 0.32; share of songs containing the loop ≥ 2×): I IV V (maj) 0.17, I IV (maj) 0.13, I vi IV V (maj) 0.12, I V IV V (maj) 0.11, i iv V (min) 0.09, I IV V IV (maj) 0.09, I IV I V (maj) 0.09, I V I IV (maj) 0.08. By era: 80s (89 songs, minor 0.37): i iv V (min) 0.2, I IV V (maj) 0.18, i V (min) 0.12, i VII VI V (min) 0.11; new (173 songs, minor 0.3): I IV V (maj) 0.17, I IV (maj) 0.14, I vi IV V (maj) 0.11, I V IV V (maj) 0.1

**bass** (54 songs, in 0.93 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 0.9 (0.1–2.2), off-16th onset share 0.04 (0–0.23)
- length 2.33 (1.89–3.9) 16ths, gate (length ÷ gap to next onset) 0.89 (0.75–0.97)
- velocity mean 102 ± 8 (flat files 0.17); accents step 1 +2, step 7 +0, step 5 +0; weakest step 6 -4, step 16 -3
- register (MIDI, transposed to C) 36 (34–40)
- degrees (maj): 1 0.25, 5 0.19, 4 0.17, 2 0.11, 6 0.09, 3 0.07
- intervals: repeat 0.33 (0.16–0.5), step 1–2 0.18 (0.07–0.28), skip 3–4 0.06 (0.03–0.12), leap 5–7 0.24 (0.15–0.4), octave 0.01 (0–0.06), descending share of moves 0.49 (0.46–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.02, 4-bar 0.08, longer 0.89; rhythm only: 1-bar 0.23, 2-bar 0.03, 4-bar 0.02, longer 0.72

**chord** (19 songs, in 0.33 of songs)
- onsets/bar 5 (3.8–6.2); steps with P ≥ .5: 1,7,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.4 (1.9–3.6), off-16th onset share 0.17 (0.04–0.41)
- length 1.31 (0.93–2) 16ths, gate (length ÷ gap to next onset) 0.75 (0.58–0.93)
- velocity mean 87 ± 15 (flat files 0.21); accents step 13 +5, step 8 +4, step 6 +3; weakest step 2 -3, step 5 -2
- register (MIDI, transposed to C) 70 (65–76)
- degrees (maj): 1 0.22, 5 0.14, 4 0.14, 6 0.12, 2 0.1, 3 0.1
- chords: voices 2.3 (2–2.7), spread 9 st, inversion share 0.54 (0.23–0.85), changes/bar 2.16 (1.12–3.28), qualities pow 0.53, maj 0.35, min 0.09, sus 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.14, longer 0.86; rhythm only: 1-bar 0.08, 2-bar 0.08, 4-bar 0.09, longer 0.76

**pad** (39 songs, in 0.67 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9,13
- syncopation: LHL/bar 0.9 (0.2–2), off-16th onset share 0.05 (0–0.18)
- length 4 (1.98–15.78) 16ths, gate (length ÷ gap to next onset) 0.99 (0.9–1)
- velocity mean 86 ± 10.8 (flat files 0.23); accents step 12 +5, step 4 +4, step 11 +3; weakest step 16 -4, step 10 -4
- register (MIDI, transposed to C) 65 (61–70)
- degrees (maj): 1 0.18, 3 0.15, 5 0.15, 4 0.13, 2 0.12, 6 0.12
- chords: voices 2.7 (2.1–3), spread 9 st, inversion share 0.54 (0.28–0.78), changes/bar 1.38 (0.92–2.05), qualities maj 0.47, pow 0.26, min 0.21, dim 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.01, 4-bar 0.06, longer 0.93; rhythm only: 1-bar 0.14, 2-bar 0.05, 4-bar 0.05, longer 0.76

**keys** (44 songs, in 0.76 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.7 (0.8–3), off-16th onset share 0.1 (0.01–0.33)
- length 2.77 (1.95–5.78) 16ths, gate (length ÷ gap to next onset) 0.98 (0.79–1)
- velocity mean 91 ± 12.5 (flat files 0.16); accents step 4 +2, step 1 +1, step 13 +0; weakest step 2 -6, step 10 -4
- register (MIDI, transposed to C) 63 (60–67)
- degrees (maj): 1 0.2, 5 0.18, 4 0.13, 3 0.12, 6 0.11, 2 0.1
- chords: voices 2.8 (2.4–3.4), spread 9 st, inversion share 0.55 (0.35–0.65), changes/bar 1.77 (1.04–2.46), qualities maj 0.48, min 0.2, pow 0.19, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.13, longer 0.82; rhythm only: 1-bar 0.15, 2-bar 0.02, 4-bar 0.08, longer 0.76

**guitar** (42 songs, in 0.72 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,3,5,7,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.4–3.6), off-16th onset share 0.18 (0.02–0.39)
- length 1.82 (0.96–2.61) 16ths, gate (length ÷ gap to next onset) 0.93 (0.54–1)
- velocity mean 79 ± 11.6 (flat files 0.1); accents step 1 +3, step 9 +3, step 13 +1; weakest step 2 -4, step 12 -2
- register (MIDI, transposed to C) 63 (57–67)
- degrees (maj): 1 0.24, 5 0.18, 3 0.13, 4 0.11, 2 0.1, 6 0.1
- chords: voices 2.7 (2.2–3), spread 8 st, inversion share 0.55 (0.23–0.74), changes/bar 0.99 (0.63–1.52), qualities maj 0.38, pow 0.33, min 0.23, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.07, longer 0.9; rhythm only: 1-bar 0.27, 2-bar 0.03, 4-bar 0.01, longer 0.7

**lead** (47 songs, in 0.81 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (1.8–3.5), off-16th onset share 0.16 (0.04–0.37)
- length 1.88 (1.19–2) 16ths, gate (length ÷ gap to next onset) 0.85 (0.73–0.98)
- velocity mean 107 ± 9.4 (flat files 0.26); accents step 1 +3, step 9 +2, step 7 +1; weakest step 2 -3, step 4 -2
- register (MIDI, transposed to C) 68 (65–72)
- degrees (maj): 1 0.24, 5 0.16, 3 0.13, 2 0.13, 6 0.11, 4 0.1
- intervals: repeat 0.22 (0.12–0.33), step 1–2 0.37 (0.29–0.53), skip 3–4 0.16 (0.1–0.22), leap 5–7 0.08 (0.03–0.17), octave 0 (0–0.02), descending share of moves 0.53 (0.49–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.04, longer 0.96; rhythm only: 1-bar 0.06, 2-bar 0, 4-bar 0.02, longer 0.92

**arp** (9 songs, in 0.15 of songs)
- onsets/bar 7 (7–7.5); steps with P ≥ .5: 3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 2.8 (2.4–4.5), off-16th onset share 0.36 (0.04–0.43)
- length 1.08 (0.97–1.67) 16ths, gate (length ÷ gap to next onset) 0.84 (0.75–0.98)
- velocity mean 98 ± 7.2 (flat files 0.33); accents step 10 +6, step 12 +3, step 4 +3; weakest step 11 -1, step 8 -0
- register (MIDI, transposed to C) 69 (67–72)
- degrees (maj): 1 0.21, 2 0.2, 5 0.14, 3 0.12, 4 0.1, 6 0.08
- intervals: repeat 0.17 (0.02–0.35), step 1–2 0.29 (0.18–0.4), skip 3–4 0.21 (0.09–0.25), leap 5–7 0.17 (0.1–0.25), octave 0 (0–0.01), descending share of moves 0.51 (0.43–0.54)
- arp shape up 0.21, down 0.08, updown 0.34, random 0.37, static 0; spacing (16ths) {'2.0': 5, '1.0': 4}; octave span 0.67 (0.62–0.75)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.08, longer 0.92; rhythm only: 1-bar 0.21, 2-bar 0, 4-bar 0, longer 0.79

**seq** (13 songs, in 0.22 of songs)
- onsets/bar 7 (6–9); steps with P ≥ .5: 1,3,5,7,9,13,15; P ≥ .3: 1,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.4 (0.5–4.3), off-16th onset share 0.43 (0.22–0.51)
- length 0.93 (0.79–1.34) 16ths, gate (length ÷ gap to next onset) 0.62 (0.54–0.87)
- velocity mean 91 ± 13.1 (flat files 0.08); accents step 9 +7, step 5 +3, step 13 +2; weakest step 10 -8, step 8 -5
- register (MIDI, transposed to C) 72 (65–75)
- degrees (maj): 2 0.26, 4 0.18, 1 0.13, 6 0.13, 3 0.11, 5 0.07
- intervals: repeat 0.4 (0.23–0.53), step 1–2 0.34 (0.07–0.46), skip 3–4 0.06 (0–0.14), leap 5–7 0.04 (0.01–0.06), octave 0 (0–0.3), descending share of moves 0.5 (0.46–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0, 4-bar 0.08, longer 0.9; rhythm only: 1-bar 0.26, 2-bar 0, 4-bar 0.01, longer 0.73

**drums** (49 songs with a usable kit; flat-velocity files 0.1)
- families: kick_4otf 0.18, kick_1_and_9_only 0.47, snare_backbeat_5_13 0.41, snare_halftime_9 0.04, hat_16ths 0.08, hat_8ths 0.35, hat_offbeat_only 0, hat_none 0.16
- kick: hits/bar 3 (2.1–3.9), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13; vel 107 ± 5.4
- snare: hits/bar 1.4 (0.6–2.1), songs using 0.76, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 108 ± 6
- hat: hits/bar 7.5 (4.1–8.3), songs using 0.84, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 78 ± 10.6
- perc: hits/bar 3.9 (1–8.8), songs using 0.8, P ≥ .5 at steps 5,13, P ≥ .2 at 1,2,3,4,5,7,8,9,10,11,12,13,14,15,16; vel 80 ± 16.8
- tom: hits/bar 0 (0–0), songs using 0.12, P ≥ .5 at steps none, P ≥ .2 at none; vel 77 ± 4.5
- cymb: hits/bar 0.2 (0.1–0.5), songs using 0.41, P ≥ .5 at steps none, P ≥ .2 at 1; vel 87 ± 12
- open-hat share of hat hits 0.17, ride share of cymbals 0.33, fill-bar share 0.08

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 22 | 90 / 124 / 145 | 0.46 | 4 (3–6) | 0.86 (0.75–0.9) | 0.42 (0.26–0.57) | 0.73 | 0.09 | 0.26 | 0.1 | i V (0.3) |

### BOSSA (54 songs, 43 artists; sources {'lmd': 54}; distinctness 0.3)


Tempo p10/p50/p90 96 / 122 / 156; minor share 0.33.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| chord_loop_1bar_rhythm | 0 | 0.22 | -0.22 |
| guitar_onsets_per_bar | 5 | 7 | -2.00 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VII VI VII | 0.11 | 0.02 |
| i III II iv | 0.11 | 0.03 |
| i iv V | 0.11 | 0.03 |
| i VI VII | 0.06 | 0.05 |
| i VII | 0.06 | 0 |
| i VII i VI | 0.06 | 0 |
| i iv VI iv | 0.06 | 0 |
| VI VII iv | 0.06 | 0.01 |
| VII v iv v | 0.06 | 0.01 |
| i VII iv | 0.06 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.23 | 0.05 |
| I ii IV V | 0.18 | 0.02 |
| I IV V | 0.18 | 0.02 |
| IV V | 0.15 | 0.03 |
| I IV I V | 0.12 | 0.01 |
| I vi ii V | 0.12 | 0.03 |
| I V IV | 0.09 | 0.03 |
| IV V vi | 0.09 | 0.02 |
| I V IV V | 0.09 | 0.04 |
| I V | 0.09 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 1151 songs, minor share 0.31; share of songs containing the loop ≥ 2×): I IV (maj) 0.17, I IV V (maj) 0.11, I IV I V (maj) 0.1, I IV V IV (maj) 0.07, I IV ii V (maj) 0.07, I V IV (maj) 0.06, I V IV V (maj) 0.06, I V I IV (maj) 0.06. By era: 80s (369 songs, minor 0.25): I IV (maj) 0.18, I IV V (maj) 0.13, I IV I V (maj) 0.11, I IV ii V (maj) 0.07; new (527 songs, minor 0.36): I IV (maj) 0.17, I IV V (maj) 0.1, I IV I V (maj) 0.08, I IV V IV (maj) 0.07

**bass** (50 songs, in 0.93 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1,9,13,15; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 0.3 (0.1–1), off-16th onset share 0.02 (0–0.24)
- length 2.37 (1.7–3.99) 16ths, gate (length ÷ gap to next onset) 0.87 (0.74–0.93)
- velocity mean 95 ± 7.7 (flat files 0.24); accents step 2 +3, step 3 +2, step 1 +2; weakest step 16 -2, step 14 -2
- register (MIDI, transposed to C) 34 (31–38)
- degrees (maj): 1 0.24, 5 0.21, 4 0.16, 2 0.11, 6 0.09, 3 0.07
- intervals: repeat 0.25 (0.14–0.46), step 1–2 0.2 (0.15–0.31), skip 3–4 0.06 (0.03–0.1), leap 5–7 0.26 (0.17–0.42), octave 0.03 (0.01–0.09), descending share of moves 0.48 (0.45–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.04, longer 0.9; rhythm only: 1-bar 0.06, 2-bar 0.05, 4-bar 0.06, longer 0.82

**chord** (18 songs, in 0.33 of songs)
- onsets/bar 4.5 (2.6–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,7,9,11,13,15
- syncopation: LHL/bar 2.8 (1.7–3.8), off-16th onset share 0.25 (0.05–0.36)
- length 1.04 (0.78–1.54) 16ths, gate (length ÷ gap to next onset) 0.64 (0.35–0.81)
- velocity mean 90 ± 9.2 (flat files 0.17); accents step 6 +2, step 9 +2, step 2 +1; weakest step 14 -2, step 3 -2
- register (MIDI, transposed to C) 65 (62–70)
- degrees (maj): 1 0.17, 3 0.17, 5 0.16, 2 0.13, 4 0.12, 6 0.08
- chords: voices 2.4 (2.1–3.4), spread 7 st, inversion share 0.68 (0.42–0.86), changes/bar 1.75 (1.39–2.48), qualities pow 0.37, maj 0.3, min 0.15, maj7 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0.08, 4-bar 0.08, longer 0.85

**pad** (39 songs, in 0.72 of songs)
- onsets/bar 1 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.2 (0–1.5), off-16th onset share 0 (0–0.12)
- length 8 (6.08–15.98) 16ths, gate (length ÷ gap to next onset) 1 (0.92–1)
- velocity mean 77 ± 9.2 (flat files 0.31); accents step 14 +4, step 15 +4, step 4 +2; weakest step 2 -4, step 16 -1
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 1 0.2, 5 0.15, 3 0.13, 2 0.13, 4 0.12, 6 0.11
- chords: voices 2.9 (2.2–3), spread 8 st, inversion share 0.4 (0.17–0.74), changes/bar 1 (0.82–1.5), qualities maj 0.41, pow 0.26, min 0.17, maj7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.01, 4-bar 0.05, longer 0.94; rhythm only: 1-bar 0.2, 2-bar 0.03, 4-bar 0.03, longer 0.74

**keys** (43 songs, in 0.8 of songs)
- onsets/bar 4 (2–5.5); steps with P ≥ .5: 1,9; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.2–2.4), off-16th onset share 0.04 (0.01–0.26)
- length 3.29 (1.2–6) 16ths, gate (length ÷ gap to next onset) 0.81 (0.44–0.99)
- velocity mean 85 ± 9.6 (flat files 0.26); accents step 9 +1, step 13 +1, step 11 +0; weakest step 6 -2, step 8 -2
- register (MIDI, transposed to C) 62 (57–67)
- degrees (maj): 1 0.19, 5 0.17, 2 0.12, 6 0.11, 3 0.11, 4 0.11
- chords: voices 3.4 (3–3.7), spread 9 st, inversion share 0.55 (0.35–0.7), changes/bar 1.48 (1.08–2), qualities maj 0.42, min 0.22, min7 0.12, pow 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.04, longer 0.93; rhythm only: 1-bar 0.12, 2-bar 0.06, 4-bar 0.03, longer 0.79

**guitar** (46 songs, in 0.85 of songs)
- onsets/bar 5 (4–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.1 (0.7–3.3), off-16th onset share 0.09 (0–0.37)
- length 1.9 (0.98–2.42) 16ths, gate (length ÷ gap to next onset) 0.8 (0.45–1)
- velocity mean 76 ± 10.6 (flat files 0.13); accents step 5 +2, step 13 +1, step 1 +1; weakest step 4 -4, step 14 -2
- register (MIDI, transposed to C) 60 (55–64)
- degrees (maj): 1 0.18, 5 0.18, 6 0.13, 3 0.13, 4 0.12, 2 0.1
- chords: voices 3 (2.5–3.3), spread 9 st, inversion share 0.58 (0.36–0.73), changes/bar 1.48 (0.98–2.01), qualities maj 0.38, pow 0.24, min 0.19, maj7 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.01, 4-bar 0.06, longer 0.93; rhythm only: 1-bar 0.2, 2-bar 0.03, 4-bar 0.04, longer 0.74

**lead** (42 songs, in 0.78 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.4 (1.3–3.1), off-16th onset share 0.14 (0.05–0.28)
- length 2.01 (1.92–2.61) 16ths, gate (length ÷ gap to next onset) 0.93 (0.74–0.99)
- velocity mean 101 ± 6.9 (flat files 0.19); accents step 1 +1, step 2 +1, step 5 +0; weakest step 8 -2, step 6 -2
- register (MIDI, transposed to C) 66 (64–69)
- degrees (maj): 1 0.19, 5 0.17, 2 0.15, 3 0.13, 6 0.11, 4 0.1
- intervals: repeat 0.18 (0.09–0.27), step 1–2 0.48 (0.39–0.56), skip 3–4 0.19 (0.12–0.26), leap 5–7 0.07 (0.04–0.12), octave 0 (0–0), descending share of moves 0.54 (0.46–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0, 4-bar 0.01, longer 0.96; rhythm only: 1-bar 0.07, 2-bar 0.01, 4-bar 0.03, longer 0.9

**arp** (6 songs, in 0.11 of songs)
- onsets/bar 7.5 (5.9–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,9,10,11,13,15,16
- syncopation: LHL/bar 1.9 (0.8–3.1), off-16th onset share 0.31 (0.14–0.48)
- length 1.19 (0.9–1.65) 16ths, gate (length ÷ gap to next onset) 0.9 (0.78–0.95)
- velocity mean 92 ± 11.8 (flat files 0); accents step 7 +4, step 11 +3, step 15 +2; weakest step 12 -4, step 10 -3
- register (MIDI, transposed to C) 68 (64–72)
- degrees (maj): 5 0.17, 2 0.14, 1 0.14, 3 0.14, 4 0.09, 6 0.08
- intervals: repeat 0.1 (0.03–0.13), step 1–2 0.54 (0.49–0.6), skip 3–4 0.17 (0.17–0.24), leap 5–7 0.09 (0.07–0.11), octave 0.01 (0–0.02), descending share of moves 0.54 (0.47–0.6)
- arp shape up 0.14, down 0.22, updown 0.21, random 0.42, static 0.01; spacing (16ths) {'1.0': 3, '2.0': 3}; octave span 0.83 (0.77–0.9)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.15, 2-bar 0, 4-bar 0, longer 0.85

**seq** (7 songs, in 0.13 of songs)
- onsets/bar 7 (5.2–8); steps with P ≥ .5: 1,7,12,15; P ≥ .3: 1,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 3.1 (1.5–4.2), off-16th onset share 0.5 (0.3–0.51)
- length 0.83 (0.6–1.83) 16ths, gate (length ÷ gap to next onset) 0.71 (0.47–0.87)
- velocity mean 97 ± 10.6 (flat files 0.14); accents step 1 +6, step 9 +4, step 6 +2; weakest step 13 -4, step 12 -3
- register (MIDI, transposed to C) 74 (72–75)
- degrees (maj): 1 0.5, 4 0.14, b7 0.08, b2 0.08, 2 0.05, 3 0.05
- intervals: repeat 0.28 (0.08–0.48), step 1–2 0.38 (0.25–0.7), skip 3–4 0.12 (0.09–0.16), leap 5–7 0.06 (0.01–0.08), octave 0 (0–0.02), descending share of moves 0.45 (0.45–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.2, 2-bar 0, 4-bar 0.2, longer 0.6; rhythm only: 1-bar 0.4, 2-bar 0, 4-bar 0, longer 0.6

**drums** (51 songs with a usable kit; flat-velocity files 0.06)
- families: kick_4otf 0.12, kick_1_and_9_only 0.57, snare_backbeat_5_13 0.35, snare_halftime_9 0.1, hat_16ths 0.08, hat_8ths 0.45, hat_offbeat_only 0.02, hat_none 0.02
- kick: hits/bar 3.1 (2–4), songs using 0.96, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,15; vel 99 ± 7.7
- snare: hits/bar 1.1 (0.1–2.2), songs using 0.65, P ≥ .5 at steps none, P ≥ .2 at 5,13; vel 98 ± 6.9
- hat: hits/bar 7.5 (4.5–8), songs using 0.96, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 74 ± 11.7
- perc: hits/bar 6.6 (2–9), songs using 0.8, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,7,8,9,10,11,12,13,14,15,16; vel 82 ± 13.7
- tom: hits/bar 0 (0–0), songs using 0.12, P ≥ .5 at steps none, P ≥ .2 at none; vel 92 ± 3.1
- cymb: hits/bar 0.2 (0.1–0.6), songs using 0.37, P ≥ .5 at steps none, P ≥ .2 at 1; vel 78 ± 8.1
- open-hat share of hat hits 0.1, ride share of cymbals 0.39, fill-bar share 0.07

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 15 | 102 / 124 / 150 | 0.67 | 4 (3–5.5) | 0.79 (0.74–0.92) | 0.52 (0.43–0.76) | 0.67 | 0.2 | 0.13 | 0.07 | i VI VII (0.1) |
| new | 16 | 94 / 120 / 149 | 0.25 | 4 (3–5) | 0.87 (0.73–0.92) | 0.47 (0.39–0.55) | 0.75 | – | 0.07 | 0 | i III II iv (0.25) |

### CUMBIA (4 songs, 3 artists; sources {'lmd': 4}; distinctness –)


Tempo p10/p50/p90 88 / 96 / 148; minor share 0.

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V | 0.5 | 0.28 |
| I ii V iii | 0.25 | 0.06 |
| I ii V | 0.25 | 0.03 |
| I vi V iii | 0.25 | 0.03 |
| I IV V iii | 0.25 | 0.02 |
| I vi VI iii | 0.25 | 0.01 |
| I vi VI ii | 0.25 | 0.01 |
| V vi VI ii | 0.25 | 0.01 |
| V iii VI ii | 0.25 | 0.01 |
| IV V iii vi | 0.25 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 2019 songs, minor share 0.39; share of songs containing the loop ≥ 2×): I vi IV V (maj) 0.12, I IV (maj) 0.1, I IV V (maj) 0.1, I V IV V (maj) 0.09, I V vi IV (maj) 0.07, i iv VII III (min) 0.07, I ii (maj) 0.06, i iv V (min) 0.06. By era: 80s (139 songs, minor 0.35): I IV (maj) 0.18, I V (maj) 0.09, I IV V (maj) 0.09, i V (min) 0.09; new (1368 songs, minor 0.41): I vi IV V (maj) 0.11, I IV (maj) 0.09, I V IV V (maj) 0.09, I IV V (maj) 0.09

