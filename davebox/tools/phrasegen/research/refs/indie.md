# INDIE — reference statistics

**160 songs measured** (210 selected), 132 artists; sources {'lmd': 160}; eras {'new': 99, '90s': 7, '?': 39, '80s': 15}; era splits: {'80s': 15, 'new': 99}. Every table: `analysis/out/indie_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **98 / 122 / 150**; file BPM q1/med/q3 80 / 110 / 122; minor share **0.25**.

## Findings

Major-leaning (minor 25 %), kick '1 + 9 only' 59 %, 8th hats, keys held longer than rock (2.7 16ths). ALT (112 songs) is nearly identical (distinctness .28). GRUNGE (69) adds open hats (34 % vs 10 %) and drops keys/pads; SHOEGAZE (11) and DREAM POP (12) are thin: shoegaze changes chords faster (1.36/bar) with 8-to-the-bar guitars, dream pop is entirely major in these files.

Flavours filed under this style: **ALT** (112 songs), **SHOEGAZE** (11 songs), **DREAM POP** (12 songs), **GRUNGE** (69 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.92 (0.7–1.14). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VII VI VII | 0.17 | 0.03 |
| i VII | 0.17 | 0.04 |
| i III VII | 0.12 | 0.02 |
| i VI VII | 0.12 | 0.03 |
| i iv | 0.12 | 0.01 |
| i VI III VII | 0.1 | 0.03 |
| i VII VI iv | 0.1 | 0.01 |
| III VII iv | 0.07 | 0.01 |
| i VII III VI | 0.07 | 0.01 |
| VI VII | 0.07 | 0 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.25 | 0.07 |
| I IV V | 0.19 | 0.04 |
| I IV I V | 0.16 | 0.02 |
| I V IV | 0.15 | 0.03 |
| I V vi IV | 0.15 | 0.06 |
| I IV V IV | 0.14 | 0.02 |
| I vi IV V | 0.14 | 0.03 |
| I V I IV | 0.14 | 0.02 |
| I V | 0.11 | 0.02 |
| IV V vi | 0.11 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 75789 songs, minor share 0.28; share of songs containing the loop ≥ 2×): I IV (maj) 0.22, I V IV (maj) 0.14, I IV I V (maj) 0.13, I IV V IV (maj) 0.12, I IV V (maj) 0.12, I V vi IV (maj) 0.1, I V IV V (maj) 0.1, I V I IV (maj) 0.09. By era: 80s (1546 songs, minor 0.2): I IV (maj) 0.24, I IV V IV (maj) 0.14, I IV V (maj) 0.14, I V IV (maj) 0.13; new (64385 songs, minor 0.29): I IV (maj) 0.22, I V IV (maj) 0.14, I IV I V (maj) 0.12, I IV V IV (maj) 0.12

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (141 songs, in 0.88 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.1–1.6), off-16th onset share 0.02 (0–0.17)
- length 2 (1.68–3.47) 16ths, gate (length ÷ gap to next onset) 0.87 (0.77–0.96)
- velocity mean 99 ± 7.8 (flat files 0.21); accents step 1 +2, step 13 +1, step 9 +1; weakest step 16 -3, step 8 -2
- register (MIDI, transposed to C) 36 (32–38)
- degrees (maj): 1 0.26, 5 0.22, 4 0.16, 2 0.11, 6 0.1, 3 0.06
- intervals: repeat 0.47 (0.33–0.65), step 1–2 0.16 (0.09–0.27), skip 3–4 0.06 (0.03–0.09), leap 5–7 0.16 (0.07–0.27), octave 0.01 (0–0.04), descending share of moves 0.48 (0.43–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.09, longer 0.86; rhythm only: 1-bar 0.17, 2-bar 0.04, 4-bar 0.06, longer 0.73

**chord** (36 songs, in 0.23 of songs)
- onsets/bar 5 (3–8); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.4 (0.9–3.3), off-16th onset share 0.14 (0–0.39)
- length 1.4 (0.91–2.08) 16ths, gate (length ÷ gap to next onset) 0.69 (0.5–0.82)
- velocity mean 91 ± 9.3 (flat files 0.17); accents step 6 +2, step 11 +1, step 7 +1; weakest step 2 -3, step 4 -2
- register (MIDI, transposed to C) 68 (64–74)
- degrees (maj): 1 0.19, 5 0.17, 6 0.15, 2 0.12, 3 0.12, 4 0.1
- chords: voices 2 (2–2.5), spread 9 st, inversion share 0.65 (0.33–0.96), changes/bar 2.21 (1.27–3.2), qualities pow 0.56, maj 0.23, min 0.08, maj7 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.14, 4-bar 0.1, longer 0.7; rhythm only: 1-bar 0.24, 2-bar 0.12, 4-bar 0.1, longer 0.54

**pad** (110 songs, in 0.69 of songs)
- onsets/bar 1.8 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0–1), off-16th onset share 0 (0–0.1)
- length 9.73 (6.1–15.96) 16ths, gate (length ÷ gap to next onset) 0.99 (0.96–1)
- velocity mean 81 ± 9.8 (flat files 0.22); accents step 13 +2, step 12 +2, step 16 +1; weakest step 2 -2, step 6 -1
- register (MIDI, transposed to C) 64 (60–69)
- degrees (maj): 1 0.19, 5 0.18, 3 0.13, 6 0.13, 2 0.12, 4 0.11
- chords: voices 2.8 (2.3–3), spread 8 st, inversion share 0.46 (0.21–0.63), changes/bar 1.1 (0.89–1.38), qualities maj 0.51, min 0.21, pow 0.21, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.06, 4-bar 0.16, longer 0.78; rhythm only: 1-bar 0.24, 2-bar 0.06, 4-bar 0.07, longer 0.62

**keys** (123 songs, in 0.77 of songs)
- onsets/bar 5 (2–8); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.6 (0.1–1.3), off-16th onset share 0.04 (0–0.19)
- length 2.74 (1.85–5.65) 16ths, gate (length ÷ gap to next onset) 0.94 (0.73–1)
- velocity mean 88 ± 11.2 (flat files 0.18); accents step 13 +1, step 1 +1, step 9 +0; weakest step 8 -4, step 2 -3
- register (MIDI, transposed to C) 62 (57–66)
- degrees (maj): 1 0.22, 5 0.18, 2 0.12, 3 0.12, 6 0.12, 4 0.11
- chords: voices 3 (2.5–3.4), spread 9 st, inversion share 0.39 (0.26–0.6), changes/bar 1.44 (0.94–2.35), qualities maj 0.48, pow 0.2, min 0.17, min7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.13, longer 0.84; rhythm only: 1-bar 0.23, 2-bar 0.02, 4-bar 0.08, longer 0.67

**guitar** (118 songs, in 0.74 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.2 (0.3–2.3), off-16th onset share 0.08 (0–0.33)
- length 1.88 (1–2.13) 16ths, gate (length ÷ gap to next onset) 0.92 (0.58–1)
- velocity mean 85 ± 11.5 (flat files 0.16); accents step 1 +2, step 13 +1, step 9 +1; weakest step 2 -6, step 6 -5
- register (MIDI, transposed to C) 60 (55–62)
- degrees (maj): 1 0.23, 5 0.19, 3 0.14, 4 0.12, 2 0.11, 6 0.1
- chords: voices 3 (2.3–3.4), spread 8 st, inversion share 0.51 (0.22–0.65), changes/bar 1.31 (0.83–1.93), qualities maj 0.4, pow 0.39, min 0.15, min7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.14, longer 0.81; rhythm only: 1-bar 0.22, 2-bar 0.04, 4-bar 0.08, longer 0.66

**lead** (135 songs, in 0.84 of songs)
- onsets/bar 4 (4–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.9–3.4), off-16th onset share 0.1 (0.02–0.28)
- length 1.94 (1.58–2.06) 16ths, gate (length ÷ gap to next onset) 0.85 (0.73–0.98)
- velocity mean 101 ± 9.2 (flat files 0.27); accents step 1 +1, step 5 +1, step 9 +1; weakest step 2 -1, step 6 -1
- register (MIDI, transposed to C) 70 (65–72)
- degrees (maj): 1 0.21, 5 0.16, 3 0.15, 2 0.15, 6 0.12, 4 0.08
- intervals: repeat 0.26 (0.16–0.34), step 1–2 0.45 (0.37–0.56), skip 3–4 0.15 (0.1–0.2), leap 5–7 0.07 (0.03–0.11), octave 0 (0–0.01), descending share of moves 0.54 (0.5–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.03, 4-bar 0.05, longer 0.91; rhythm only: 1-bar 0.02, 2-bar 0.04, 4-bar 0.06, longer 0.88

**arp** (21 songs, in 0.13 of songs)
- onsets/bar 8 (8–11); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.2 (0–1.4), off-16th onset share 0.33 (0–0.5)
- length 1.12 (0.9–1.46) 16ths, gate (length ÷ gap to next onset) 0.92 (0.67–0.98)
- velocity mean 90 ± 6.8 (flat files 0.29); accents step 15 +1, step 8 +0, step 12 +0; weakest step 6 -1, step 2 -0
- register (MIDI, transposed to C) 69 (66–72)
- degrees (maj): 1 0.24, 5 0.17, 6 0.13, 3 0.13, 2 0.12, 4 0.09
- intervals: repeat 0.01 (0–0.12), step 1–2 0.32 (0.02–0.5), skip 3–4 0.27 (0.19–0.48), leap 5–7 0.24 (0.09–0.3), octave 0.01 (0–0.08), descending share of moves 0.45 (0.37–0.5)
- arp shape up 0.23, down 0.04, updown 0.17, random 0.55, static 0; spacing (16ths) {'2.0': 11, '1.0': 8, '1.5': 2}; octave span 0.79 (0.67–1.17)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.1, 4-bar 0.16, longer 0.68; rhythm only: 1-bar 0.58, 2-bar 0.08, 4-bar 0, longer 0.33

**seq** (20 songs, in 0.12 of songs)
- onsets/bar 7 (2.4–9.2); steps with P ≥ .5: 1,5,7,9,13; P ≥ .3: 1,3,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 1.1 (0–3.5), off-16th onset share 0.22 (0–0.49)
- length 1.5 (0.79–3.94) 16ths, gate (length ÷ gap to next onset) 0.79 (0.49–0.98)
- velocity mean 97 ± 8.6 (flat files 0.4); accents step 3 +5, step 1 +2, step 15 +2; weakest step 2 -5, step 8 -3
- register (MIDI, transposed to C) 58 (54–60)
- degrees (maj): 1 0.26, 5 0.23, 3 0.17, 2 0.1, 6 0.08, 4 0.07
- intervals: repeat 0.36 (0.14–0.55), step 1–2 0.14 (0.04–0.37), skip 3–4 0.1 (0.02–0.21), leap 5–7 0.08 (0.04–0.24), octave 0 (0–0.02), descending share of moves 0.5 (0.39–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.13, 2-bar 0.06, 4-bar 0.13, longer 0.68; rhythm only: 1-bar 0.46, 2-bar 0.06, 4-bar 0.11, longer 0.37

**fx** (17 songs, in 0.11 of songs)
- onsets/bar 4 (2–8); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 0.9 (0–2.1), off-16th onset share 0.14 (0.01–0.43)
- length 1.98 (0.71–6.25) 16ths, gate (length ÷ gap to next onset) 0.79 (0.33–0.99)
- velocity mean 88 ± 7.8 (flat files 0.12); accents step 9 +3, step 1 +1, step 5 +1; weakest step 11 -7, step 8 -4
- register (MIDI, transposed to C) 67 (64–71)
- degrees (maj): 1 0.26, 5 0.18, 6 0.13, 2 0.1, 3 0.1, 4 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.14, longer 0.81; rhythm only: 1-bar 0.14, 2-bar 0.1, 4-bar 0.1, longer 0.66

**drums** (138 songs with a usable kit; flat-velocity files 0.12)
- families: kick_4otf 0.13, kick_1_and_9_only 0.59, snare_backbeat_5_13 0.65, snare_halftime_9 0.04, hat_16ths 0.09, hat_8ths 0.46, hat_offbeat_only 0, hat_none 0.06
- kick: hits/bar 3.4 (2.8–4), songs using 0.99, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,11,15; vel 103 ± 6.7
- snare: hits/bar 2 (1.5–2.2), songs using 0.93, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 108 ± 5.5
- hat: hits/bar 7.7 (5.9–8.4), songs using 0.95, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 80 ± 10.6
- perc: hits/bar 1.2 (0–5.3), songs using 0.58, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 80 ± 13.7
- tom: hits/bar 0 (0–0), songs using 0.07, P ≥ .5 at steps none, P ≥ .2 at none; vel 76 ± 4.4
- cymb: hits/bar 0.2 (0.1–1.3), songs using 0.41, P ≥ .5 at steps none, P ≥ .2 at 1; vel 82 ± 10.4
- open-hat share of hat hits 0.1, ride share of cymbals 0.34, fill-bar share 0.08

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 15 | 98 / 120 / 152 | 0.27 | 5 (4–7) | 0.96 (0.89–1) | 0.54 (0.44–0.6) | 0.33 | 0.13 | 0 | 0.08 | i iv v (0.25) |
| new | 99 | 100 / 122 / 147 | 0.23 | 4 (3–6) | 0.85 (0.74–0.95) | 0.45 (0.37–0.57) | 0.71 | 0.13 | 0.17 | 0.08 | i III VII (0.17) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### ALT (112 songs, 83 artists; sources {'lmd': 112}; distinctness 0.28)


Tempo p10/p50/p90 94 / 124 / 160; minor share 0.32.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI VII III | 0.17 | 0.04 |
| i iv | 0.14 | 0.04 |
| i III | 0.14 | 0.04 |
| i VI VII | 0.14 | 0.03 |
| i VI | 0.11 | 0.02 |
| i VI III v | 0.11 | 0.05 |
| i iv i VI | 0.08 | 0.01 |
| i VI iv | 0.08 | 0.03 |
| i v | 0.08 | 0 |
| III VI VII | 0.08 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.32 | 0.07 |
| I V IV V | 0.22 | 0.03 |
| I V | 0.19 | 0.03 |
| I V IV | 0.18 | 0.04 |
| I IV I V | 0.16 | 0.02 |
| I IV V | 0.15 | 0.03 |
| IV V | 0.14 | 0.03 |
| I V I IV | 0.14 | 0.02 |
| I IV ii V | 0.12 | 0.01 |
| I vi IV V | 0.11 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 38501 songs, minor share 0.29; share of songs containing the loop ≥ 2×): I IV (maj) 0.21, I V IV (maj) 0.15, I IV I V (maj) 0.14, I IV V IV (maj) 0.12, I IV V (maj) 0.12, I V vi IV (maj) 0.11, I V I IV (maj) 0.1, I V IV V (maj) 0.1. By era: 80s (3805 songs, minor 0.21): I IV (maj) 0.24, I IV V IV (maj) 0.14, I IV I V (maj) 0.14, I IV V (maj) 0.14; new (27574 songs, minor 0.32): I IV (maj) 0.2, I V IV (maj) 0.15, I IV I V (maj) 0.13, I V vi IV (maj) 0.12

**bass** (103 songs, in 0.92 of songs)
- onsets/bar 5 (3–8); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.1–1.5), off-16th onset share 0.01 (0–0.2)
- length 2 (1.59–3.99) 16ths, gate (length ÷ gap to next onset) 0.92 (0.75–1)
- velocity mean 100 ± 7.6 (flat files 0.43); accents step 1 +2, step 5 +1, step 9 +1; weakest step 8 -2, step 12 -2
- register (MIDI, transposed to C) 36 (33–39)
- degrees (maj): 1 0.26, 4 0.2, 5 0.18, 6 0.1, 2 0.09, 3 0.08
- intervals: repeat 0.52 (0.27–0.76), step 1–2 0.14 (0.06–0.27), skip 3–4 0.05 (0.02–0.11), leap 5–7 0.1 (0.05–0.2), octave 0.01 (0–0.03), descending share of moves 0.49 (0.44–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.14, longer 0.81; rhythm only: 1-bar 0.28, 2-bar 0.04, 4-bar 0.06, longer 0.63

**chord** (14 songs, in 0.12 of songs)
- onsets/bar 4 (2.2–5); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (0.7–3.1), off-16th onset share 0.22 (0.04–0.43)
- length 1.57 (0.75–2.1) 16ths, gate (length ÷ gap to next onset) 0.67 (0.45–0.81)
- velocity mean 89 ± 19 (flat files 0.36); accents step 11 +10, step 9 +7, step 1 +7; weakest step 2 -9, step 10 -6
- register (MIDI, transposed to C) 66 (60–70)
- degrees (maj): 1 0.21, 2 0.13, 6 0.13, 3 0.12, 5 0.12, 4 0.11
- chords: voices 2.9 (2–3), spread 8 st, inversion share 0.6 (0.23–1), changes/bar 1.7 (1.25–1.94), qualities maj 0.46, pow 0.36, min 0.09, sus 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.07, longer 0.86; rhythm only: 1-bar 0.24, 2-bar 0.07, 4-bar 0, longer 0.69

**pad** (71 songs, in 0.63 of songs)
- onsets/bar 1 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0.1–1.3), off-16th onset share 0 (0–0.04)
- length 8.23 (3.8–16) 16ths, gate (length ÷ gap to next onset) 1 (0.85–1)
- velocity mean 83 ± 8.8 (flat files 0.35); accents step 2 +3, step 4 +2, step 12 +2; weakest step 8 -13, step 16 -3
- register (MIDI, transposed to C) 65 (60–68)
- degrees (maj): 1 0.21, 5 0.18, 3 0.13, 6 0.12, 2 0.12, 4 0.11
- chords: voices 2.8 (2.1–3), spread 8 st, inversion share 0.67 (0.44–0.82), changes/bar 0.98 (0.7–1.49), qualities maj 0.41, pow 0.4, min 0.15, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.03, 4-bar 0.2, longer 0.75; rhythm only: 1-bar 0.28, 2-bar 0.05, 4-bar 0.14, longer 0.53

**keys** (71 songs, in 0.63 of songs)
- onsets/bar 5 (2–8); steps with P ≥ .5: 1,5,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.2–2), off-16th onset share 0.02 (0–0.21)
- length 3.53 (1.96–5.88) 16ths, gate (length ÷ gap to next onset) 1 (0.92–1)
- velocity mean 85 ± 11.6 (flat files 0.37); accents step 13 +1, step 1 +1, step 9 +0; weakest step 16 -5, step 7 -1
- register (MIDI, transposed to C) 62 (57–67)
- degrees (maj): 1 0.25, 5 0.17, 3 0.12, 4 0.12, 6 0.11, 2 0.1
- chords: voices 3 (2.7–3.3), spread 9 st, inversion share 0.46 (0.18–0.74), changes/bar 1.09 (0.8–2.12), qualities maj 0.54, pow 0.23, min 0.15, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.04, 4-bar 0.15, longer 0.79; rhythm only: 1-bar 0.31, 2-bar 0.01, 4-bar 0.06, longer 0.62

**guitar** (89 songs, in 0.8 of songs)
- onsets/bar 6 (5–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.1–2.1), off-16th onset share 0.04 (0–0.31)
- length 1.96 (1–3.33) 16ths, gate (length ÷ gap to next onset) 0.97 (0.73–1)
- velocity mean 86 ± 11.9 (flat files 0.26); accents step 1 +2, step 13 +2, step 9 +1; weakest step 16 -5, step 2 -4
- register (MIDI, transposed to C) 59 (55–63)
- degrees (maj): 1 0.24, 5 0.22, 4 0.12, 3 0.11, 2 0.1, 6 0.1
- chords: voices 3 (2.3–3.4), spread 9 st, inversion share 0.43 (0.12–0.67), changes/bar 1.15 (0.53–1.99), qualities maj 0.39, pow 0.38, min 0.17, min7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.05, 4-bar 0.15, longer 0.78; rhythm only: 1-bar 0.31, 2-bar 0.04, 4-bar 0.06, longer 0.58

**lead** (90 songs, in 0.8 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.6–3.3), off-16th onset share 0.04 (0–0.22)
- length 2 (1.64–3) 16ths, gate (length ÷ gap to next onset) 0.91 (0.73–1)
- velocity mean 99 ± 9.6 (flat files 0.37); accents step 1 +1, step 9 +0, step 10 +0; weakest step 2 -1, step 6 -1
- register (MIDI, transposed to C) 67 (65–69)
- degrees (maj): 1 0.22, 5 0.19, 2 0.15, 3 0.15, 6 0.11, 4 0.09
- intervals: repeat 0.27 (0.13–0.42), step 1–2 0.46 (0.33–0.56), skip 3–4 0.13 (0.07–0.2), leap 5–7 0.07 (0.03–0.12), octave 0 (0–0), descending share of moves 0.53 (0.49–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.02, 4-bar 0.07, longer 0.88; rhythm only: 1-bar 0.09, 2-bar 0.03, 4-bar 0.05, longer 0.83

**arp** (5 songs, in 0.04 of songs)
- onsets/bar 8 (8–16); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.1 (0–0.3), off-16th onset share 0.2 (0.01–0.48)
- length 1 (1–1.38) 16ths, gate (length ÷ gap to next onset) 0.94 (0.79–1)
- velocity mean 85 ± 17.9 (flat files 0.4); accents step 2 +10, step 13 +7, step 11 +4; weakest step 6 -26, step 12 -22
- register (MIDI, transposed to C) 60 (56–63)
- degrees (maj): 5 0.41, 2 0.18, 1 0.13, 3 0.07, 4 0.07, 7 0.07
- intervals: repeat 0 (0–0.01), step 1–2 0.28 (0.05–0.49), skip 3–4 0.26 (0.04–0.42), leap 5–7 0.19 (0.01–0.32), octave 0.02 (0.01–0.05), descending share of moves 0.55 (0.55–0.73)
- arp shape up 0.27, down 0.48, updown 0.08, random 0.17, static 0; spacing (16ths) {'2.0': 3, '1.0': 2}; octave span 1 (0.92–1.25)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.12, 4-bar 0, longer 0.88; rhythm only: 1-bar 0, 2-bar 0.12, 4-bar 0, longer 0.88

**seq** (18 songs, in 0.16 of songs)
- onsets/bar 6.8 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.6 (0–2.4), off-16th onset share 0.11 (0–0.4)
- length 1.77 (1–2.5) 16ths, gate (length ÷ gap to next onset) 0.85 (0.56–1)
- velocity mean 88 ± 10.2 (flat files 0.44); accents step 6 +5, step 12 +3, step 13 +2; weakest step 2 -4, step 7 -2
- register (MIDI, transposed to C) 58 (51–65)
- degrees (maj): 1 0.25, 5 0.24, 2 0.1, 6 0.1, 3 0.09, 4 0.08
- intervals: repeat 0.44 (0.02–0.71), step 1–2 0.23 (0.05–0.39), skip 3–4 0.07 (0.05–0.12), leap 5–7 0.05 (0–0.27), octave 0 (0–0.03), descending share of moves 0.51 (0.44–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.16, 4-bar 0.09, longer 0.75; rhythm only: 1-bar 0.34, 2-bar 0.11, 4-bar 0.04, longer 0.51

**drums** (100 songs with a usable kit; flat-velocity files 0.21)
- families: kick_4otf 0.13, kick_1_and_9_only 0.47, snare_backbeat_5_13 0.65, snare_halftime_9 0.06, hat_16ths 0.07, hat_8ths 0.34, hat_offbeat_only 0.05, hat_none 0.14
- kick: hits/bar 3.4 (2.5–4.2), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13,15; vel 105 ± 5.9
- snare: hits/bar 2 (1.8–2.3), songs using 0.97, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 101 ± 5.2
- hat: hits/bar 6 (3.2–7.8), songs using 0.85, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 84 ± 11.8
- perc: hits/bar 0.3 (0–5.4), songs using 0.47, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 85 ± 12.4
- tom: hits/bar 0 (0–0), songs using 0.1, P ≥ .5 at steps none, P ≥ .2 at none; vel 77 ± 6
- cymb: hits/bar 0.5 (0.1–2.1), songs using 0.56, P ≥ .5 at steps none, P ≥ .2 at 1,5,13; vel 90 ± 7.6
- open-hat share of hat hits 0.19, ride share of cymbals 0.38, fill-bar share 0.05

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 20 | 98 / 125 / 152 | 0.15 | 5 (3–6.5) | 0.97 (0.85–0.99) | 0.38 (0.27–0.57) | 0.65 | – | 0.07 | 0.07 | III iv (0.67) |
| new | 54 | 93 / 120 / 160 | 0.35 | 5 (3–8) | 0.92 (0.81–1) | 0.47 (0.32–0.57) | 0.7 | 0.06 | 0.15 | 0.09 | i III (0.21) |

### SHOEGAZE (11 songs, 9 artists; sources {'lmd': 11}; distinctness 0.44)


Tempo p10/p50/p90 90 / 120 / 134; minor share 0.09.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| chord_changes_per_bar | 1.36 | 0.92 | +0.44 |
| lead_offbeat16_share | 0.32 | 0.1 | +0.22 |
| drum_kick_1_and_9_only | 0.78 | 0.59 | +0.18 |
| bass_iv_repeat | 0.3 | 0.47 | -0.17 |
| guitar_loop_1bar_rhythm | 0.05 | 0.22 | -0.17 |
| minor_share | 0.09 | 0.25 | -0.16 |
| bass_loop_1bar_rhythm | 0.01 | 0.17 | -0.16 |
| keys_loop_1bar_rhythm | 0.08 | 0.23 | -0.15 |
| guitar_onsets_per_bar | 8 | 6 | +2.00 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI III VII | 1 | 0.15 |
| i v iv VI | 1 | 0.15 |
| III v iv VI | 1 | 0.15 |
| i v III VII | 1 | 0.14 |
| III VII iv VI | 1 | 0.14 |
| i v iv VII | 1 | 0.12 |
| i v VI VII | 1 | 0.05 |
| i VII III v | 1 | 0.03 |
| i VII VI v | 1 | 0.03 |
| i VII VI | 1 | 0.05 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.6 | 0.2 |
| I IV I V | 0.3 | 0.03 |
| I IV V IV | 0.3 | 0.03 |
| I IV V | 0.3 | 0.09 |
| I bVII IV | 0.2 | 0.1 |
| I IV I bVII | 0.2 | 0.01 |
| I IV vi IV | 0.2 | 0.05 |
| I ii vi IV | 0.2 | 0.02 |
| I bVII vi IV | 0.1 | 0.01 |
| I bVII I IV | 0.1 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 1732 songs, minor share 0.26; share of songs containing the loop ≥ 2×): I IV (maj) 0.23, I IV V IV (maj) 0.11, I V IV (maj) 0.11, I IV V (maj) 0.1, I IV I V (maj) 0.09, I V IV V (maj) 0.08, IV V (maj) 0.07, I V I IV (maj) 0.06. By era: 80s (424 songs, minor 0.22): I IV (maj) 0.28, I IV V IV (maj) 0.13, I IV V (maj) 0.13, I V IV (maj) 0.1; new (990 songs, minor 0.27): I IV (maj) 0.2, I V IV (maj) 0.11, I IV V IV (maj) 0.1, I IV V (maj) 0.09

**bass** (10 songs, in 0.91 of songs)
- onsets/bar 3.5 (3–4); steps with P ≥ .5: 1,9; P ≥ .3: 1,7,9,15
- syncopation: LHL/bar 0.6 (0.3–0.7), off-16th onset share 0.02 (0–0.11)
- length 2.17 (1.98–4.1) 16ths, gate (length ÷ gap to next onset) 0.86 (0.79–0.9)
- velocity mean 104 ± 9.2 (flat files 0.3); accents step 11 +4, step 2 +3, step 8 +3; weakest step 4 -24, step 6 -18
- register (MIDI, transposed to C) 36 (31–36)
- degrees (maj): 1 0.36, 4 0.2, 5 0.18, 3 0.06, 2 0.06, 6 0.04
- intervals: repeat 0.3 (0.27–0.41), step 1–2 0.23 (0.17–0.33), skip 3–4 0.07 (0.03–0.12), leap 5–7 0.26 (0.12–0.34), octave 0.01 (0.01–0.13), descending share of moves 0.5 (0.41–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.09, longer 0.84; rhythm only: 1-bar 0.01, 2-bar 0.07, 4-bar 0.14, longer 0.79

**chord** (3 songs, in 0.27 of songs)
- onsets/bar 3 (2.5–9.5); steps with P ≥ .5: 1,3,5,9,11,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.5 (0.3–1.2), off-16th onset share 0.06 (0.04–0.28)
- length 1.99 (1.5–2.11) 16ths, gate (length ÷ gap to next onset) 1 (0.78–1)
- velocity mean 81 ± 16.5 (flat files 0.33); accents step 15 +17, step 1 +16, step 9 +16; weakest step 2 -19, step 4 -19
- register (MIDI, transposed to C) 55 (52–60)
- degrees (maj): 7 0.36, 1 0.16, 5 0.14, 6 0.08, 3 0.06, 4 0.06
- chords: voices 2.3 (2.1–2.6), spread 12 st, inversion share 0.42 (0.29–0.55), changes/bar 0.91 (0.46–2.03), qualities sus 0.44, maj 0.43, min 0.1, pow 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**pad** (6 songs, in 0.55 of songs)
- onsets/bar 2 (1.2–2.8); steps with P ≥ .5: 1,9; P ≥ .3: 1,9
- syncopation: LHL/bar 0.2 (0.1–0.6), off-16th onset share 0.08 (0.01–0.15)
- length 8.09 (7.98–11.79) 16ths, gate (length ÷ gap to next onset) 0.99 (0.88–1.01)
- velocity mean 65 ± 14.3 (flat files 0.17); accents step 7 +10, step 13 +7, step 14 +6; weakest step 8 -6, step 16 -4
- register (MIDI, transposed to C) 64 (58–68)
- degrees (maj): 1 0.23, 3 0.16, 5 0.16, 4 0.11, 6 0.1, 2 0.08
- chords: voices 2.9 (2.5–3.1), spread 12 st, inversion share 0.28 (0.26–0.29), changes/bar 1.35 (1.07–1.38), qualities maj 0.61, pow 0.19, min 0.12, maj7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0, longer 0.97; rhythm only: 1-bar 0.28, 2-bar 0, 4-bar 0, longer 0.72

**keys** (8 songs, in 0.73 of songs)
- onsets/bar 3.5 (2–4.5); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0.7–1.5), off-16th onset share 0.12 (0.03–0.23)
- length 4.14 (2.23–5.92) 16ths, gate (length ÷ gap to next onset) 0.97 (0.92–0.98)
- velocity mean 91 ± 14.7 (flat files 0.12); accents step 12 +10, step 7 +7, step 2 +6; weakest step 8 -14, step 16 -4
- register (MIDI, transposed to C) 58 (56–64)
- degrees (maj): 1 0.32, 5 0.16, 4 0.13, 3 0.1, 6 0.1, 2 0.07
- chords: voices 3.1 (2.8–3.5), spread 8 st, inversion share 0.46 (0.31–0.57), changes/bar 1.79 (1.22–1.93), qualities maj 0.74, min 0.15, pow 0.09, sus 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.05, longer 0.95; rhythm only: 1-bar 0.08, 2-bar 0, 4-bar 0.05, longer 0.87

**guitar** (9 songs, in 0.82 of songs)
- onsets/bar 8 (7–9); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,8,9,11,13,15,16
- syncopation: LHL/bar 1.3 (0.4–1.5), off-16th onset share 0.21 (0.14–0.35)
- length 2.42 (2–3.2) 16ths, gate (length ÷ gap to next onset) 0.98 (0.78–1.56)
- velocity mean 79 ± 13.3 (flat files 0); accents step 2 +4, step 13 +2, step 6 +1; weakest step 16 -10, step 8 -9
- register (MIDI, transposed to C) 57 (55–62)
- degrees (maj): 1 0.28, 5 0.24, 4 0.12, 6 0.1, 3 0.07, b7 0.06
- chords: voices 2.9 (2.4–3.3), spread 9 st, inversion share 0.6 (0.38–0.69), changes/bar 1.75 (0.47–3.92), qualities maj 0.57, pow 0.25, min 0.09, sus 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.05, 2-bar 0, 4-bar 0, longer 0.95

**lead** (9 songs, in 0.82 of songs)
- onsets/bar 4 (3.5–5); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.6–3.5), off-16th onset share 0.32 (0.03–0.43)
- length 1.67 (1.48–2.27) 16ths, gate (length ÷ gap to next onset) 0.87 (0.74–0.99)
- velocity mean 100 ± 11.2 (flat files 0.11); accents step 2 +4, step 8 +3, step 5 +3; weakest step 12 -2, step 16 -2
- register (MIDI, transposed to C) 74 (72–76)
- degrees (maj): 5 0.24, 1 0.18, 3 0.15, 2 0.14, 6 0.14, 4 0.07
- intervals: repeat 0.21 (0.11–0.4), step 1–2 0.45 (0.39–0.53), skip 3–4 0.16 (0.11–0.21), leap 5–7 0.04 (0.03–0.09), octave 0 (0–0.01), descending share of moves 0.54 (0.48–0.61)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.05, longer 0.95; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.05, longer 0.95

**arp** (2 songs, in 0.18 of songs)
- onsets/bar 8 (8–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.3 (0.2–0.3), off-16th onset share 0.14 (0.07–0.21)
- length 1.61 (1.43–1.79) 16ths, gate (length ÷ gap to next onset) 1.01 (0.99–1.02)
- velocity mean 81 ± 31.1 (flat files 0.5); accents step 8 +11, step 2 +10, step 10 +10; weakest step 6 -16, step 4 -15
- register (MIDI, transposed to C) 64 (60–70)
- degrees (maj): 1 0.21, 5 0.2, 4 0.16, 6 0.14, 3 0.13, 7 0.06
- intervals: repeat 0 (0–0), step 1–2 0.13 (0.09–0.17), skip 3–4 0.21 (0.12–0.3), leap 5–7 0.48 (0.38–0.59), octave 0.03 (0.02–0.03), descending share of moves 0.57 (0.52–0.61)
- arp shape up 0.01, down 0.07, updown 0.24, random 0.68, static 0; spacing (16ths) {'2.0': 2}; octave span 1.04 (0.98–1.11)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.12, 2-bar 0, 4-bar 0, longer 0.88

**seq** (3 songs, in 0.27 of songs)
- onsets/bar 16 (9.5–16); steps with P ≥ .5: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.1 (0.1–2.1), off-16th onset share 0.5 (0.42–0.5)
- length 0.81 (0.67–0.91) 16ths, gate (length ÷ gap to next onset) 0.81 (0.48–0.91)
- velocity mean 66 ± 1.5 (flat files 0.67); accents step 1 +3, step 5 +2, step 13 +2; weakest step 10 -2, step 4 -1
- register (MIDI, transposed to C) 59 (58–60)
- degrees (maj): 1 0.5, 7 0.45, 3 0.05, b2 0, 2 0, b3 0
- intervals: repeat 0 (0–0.4), step 1–2 0 (0–0.25), skip 3–4 0 (0–0.25), leap 5–7 0 (0–0.1), octave 0 (0–0.5), descending share of moves 0.5 (0.5–0.5)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 1, 2-bar 0, 4-bar 0, longer 0; rhythm only: 1-bar 1, 2-bar 0, 4-bar 0, longer 0

**drums** (9 songs with a usable kit; flat-velocity files 0)
- families: kick_4otf 0.11, kick_1_and_9_only 0.78, snare_backbeat_5_13 0.67, snare_halftime_9 0, hat_16ths 0, hat_8ths 0.44, hat_offbeat_only 0, hat_none 0
- kick: hits/bar 3 (2.4–3.4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,11; vel 113 ± 7.2
- snare: hits/bar 2 (0.8–2.1), songs using 0.78, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 6.2
- hat: hits/bar 7.5 (6.7–10), songs using 1, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,6,7,9,11,12,13,15; vel 88 ± 17.8
- perc: hits/bar 3.1 (0–6.6), songs using 0.67, P ≥ .5 at steps 5,13, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 110 ± 10.7
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.3 (0.2–1.3), songs using 0.56, P ≥ .5 at steps none, P ≥ .2 at 1; vel 84 ± 13.6
- open-hat share of hat hits 0.13, ride share of cymbals 0.32, fill-bar share 0.12

### DREAM POP (12 songs, 9 artists; sources {'lmd': 12}; distinctness 0.39)


Tempo p10/p50/p90 95 / 129 / 145; minor share 0.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| drum_flat_share | 0.39 | 0.12 | +0.26 |
| minor_share | 0 | 0.25 | -0.25 |
| pad_loop_1bar_rhythm | 0 | 0.24 | -0.24 |
| chord_presence | 0 | 0.23 | -0.23 |
| chord_changes_per_bar | 0.71 | 0.92 | -0.21 |
| keys_gate | 0.79 | 0.94 | -0.15 |
| guitar_loop_1bar_rhythm | 0.07 | 0.22 | -0.15 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.5 | 0.21 |
| I V IV V | 0.25 | 0.04 |
| I V I IV | 0.25 | 0.03 |
| I IV I V | 0.25 | 0.03 |
| I ii IV | 0.17 | 0.14 |
| I V vi IV | 0.17 | 0.03 |
| I V | 0.17 | 0.02 |
| I ii V IV | 0.17 | 0.01 |
| IV V vi | 0.08 | 0.01 |
| IV V IV vi | 0.08 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 2004 songs, minor share 0.3; share of songs containing the loop ≥ 2×): I IV (maj) 0.21, I IV V IV (maj) 0.12, I V IV (maj) 0.11, I IV V (maj) 0.1, I IV I V (maj) 0.08, I V IV V (maj) 0.07, IV V (maj) 0.07, I V I IV (maj) 0.06. By era: 80s (363 songs, minor 0.32): I IV (maj) 0.25, I IV V IV (maj) 0.12, I IV V (maj) 0.1, I IV I V (maj) 0.1; new (1376 songs, minor 0.29): I IV (maj) 0.2, I IV V IV (maj) 0.12, I V IV (maj) 0.11, I IV V (maj) 0.1

**bass** (11 songs, in 0.92 of songs)
- onsets/bar 4 (3–4); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,7,9,13,15
- syncopation: LHL/bar 0.9 (0.1–1.9), off-16th onset share 0 (0–0.03)
- length 2.27 (1.89–3.21) 16ths, gate (length ÷ gap to next onset) 0.88 (0.73–0.94)
- velocity mean 106 ± 6.7 (flat files 0.36); accents step 1 +3, step 9 +1, step 14 +1; weakest step 10 -4, step 12 -3
- register (MIDI, transposed to C) 37 (36–41)
- degrees (maj): 1 0.26, 4 0.2, 5 0.18, 2 0.12, 3 0.08, 6 0.07
- intervals: repeat 0.52 (0.34–0.71), step 1–2 0.13 (0.09–0.29), skip 3–4 0.05 (0.01–0.09), leap 5–7 0.09 (0.04–0.12), octave 0.01 (0–0.05), descending share of moves 0.49 (0.45–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.1, 4-bar 0.14, longer 0.77; rhythm only: 1-bar 0.17, 2-bar 0.19, 4-bar 0.06, longer 0.57

**pad** (9 songs, in 0.75 of songs)
- onsets/bar 1.5 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0–2.2), off-16th onset share 0 (0–0.3)
- length 10.33 (7.88–16) 16ths, gate (length ÷ gap to next onset) 0.97 (0.94–1)
- velocity mean 93 ± 14.7 (flat files 0.22); accents step 14 +16, step 6 +16, step 16 +12; weakest step 2 -6, step 3 -4
- register (MIDI, transposed to C) 64 (57–69)
- degrees (maj): 1 0.24, 5 0.22, 4 0.15, 3 0.1, 2 0.09, 6 0.09
- chords: voices 2.7 (2.5–3), spread 9 st, inversion share 0.4 (0.23–0.51), changes/bar 0.99 (0.86–1.22), qualities maj 0.5, pow 0.31, min 0.12, sus 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.25, 4-bar 0.15, longer 0.6; rhythm only: 1-bar 0, 2-bar 0.25, 4-bar 0.17, longer 0.58

**keys** (8 songs, in 0.67 of songs)
- onsets/bar 3.5 (1.8–5); steps with P ≥ .5: 1,9; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 0.6 (0.2–0.9), off-16th onset share 0 (0–0.08)
- length 2.75 (2.1–6.72) 16ths, gate (length ÷ gap to next onset) 0.79 (0.47–0.96)
- velocity mean 93 ± 14.5 (flat files 0.25); accents step 16 +16, step 6 +13, step 12 +10; weakest step 8 -8, step 3 -6
- register (MIDI, transposed to C) 57 (55–60)
- degrees (maj): 1 0.24, 5 0.18, 3 0.13, 4 0.12, 6 0.1, 2 0.09
- chords: voices 3.1 (2.9–3.2), spread 8 st, inversion share 0.36 (0.18–0.48), changes/bar 1.71 (0.59–2.47), qualities maj 0.65, min 0.15, pow 0.09, maj7 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.16, longer 0.84; rhythm only: 1-bar 0.33, 2-bar 0.05, 4-bar 0.06, longer 0.56

**guitar** (8 songs, in 0.67 of songs)
- onsets/bar 6 (4–7); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.4–1), off-16th onset share 0.06 (0–0.14)
- length 1.93 (1.58–2.3) 16ths, gate (length ÷ gap to next onset) 0.93 (0.7–0.98)
- velocity mean 85 ± 11.2 (flat files 0.25); accents step 1 +4, step 11 +1, step 7 +1; weakest step 8 -8, step 12 -8
- register (MIDI, transposed to C) 60 (54–64)
- degrees (maj): 1 0.28, 5 0.15, 4 0.15, 6 0.11, 3 0.09, 2 0.07
- chords: voices 3.2 (2.7–3.3), spread 9 st, inversion share 0.49 (0.2–0.55), changes/bar 1.25 (0.59–2.33), qualities maj 0.55, pow 0.33, min 0.07, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.12, 4-bar 0.11, longer 0.76; rhythm only: 1-bar 0.07, 2-bar 0.18, 4-bar 0.14, longer 0.61

**lead** (10 songs, in 0.83 of songs)
- onsets/bar 4 (4–4.8); steps with P ≥ .5: 1,7,9,11; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (1–2.4), off-16th onset share 0.07 (0.02–0.12)
- length 1.68 (1.16–1.97) 16ths, gate (length ÷ gap to next onset) 0.77 (0.48–0.9)
- velocity mean 99 ± 9.6 (flat files 0.3); accents step 6 +21, step 14 +13, step 15 +3; weakest step 10 -13, step 4 -12
- register (MIDI, transposed to C) 70 (68–73)
- degrees (maj): 1 0.18, 3 0.16, 6 0.15, 2 0.12, 5 0.12, 4 0.1
- intervals: repeat 0.17 (0.01–0.36), step 1–2 0.42 (0.23–0.62), skip 3–4 0.13 (0.09–0.23), leap 5–7 0.06 (0.03–0.14), octave 0 (0–0.01), descending share of moves 0.52 (0.46–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.12, 4-bar 0.06, longer 0.81; rhythm only: 1-bar 0.08, 2-bar 0.12, 4-bar 0.06, longer 0.73

**arp** (1 songs, in 0.08 of songs)
- onsets/bar 9 (9–9); steps with P ≥ .5: 1,2,3,4,5,7,8,12,16; P ≥ .3: 1,2,3,4,5,7,8,10,11,12,14,15,16
- syncopation: LHL/bar 5.6 (5.6–5.6), off-16th onset share 0.49 (0.49–0.49)
- length 1.87 (1.87–1.87) 16ths, gate (length ÷ gap to next onset) 0.94 (0.94–0.94)
- velocity mean 114 ± 5.7 (flat files 0); accents step 4 +1, step 2 +1, step 7 +1; weakest step 13 -2, step 5 -1
- register (MIDI, transposed to C) 72 (68–74)
- degrees (maj): 1 0.18, 3 0.11, 2 0.1, 4 0.1, 5 0.1, b2 0.09
- intervals: repeat 0.35 (0.35–0.35), step 1–2 0.36 (0.36–0.36), skip 3–4 0.12 (0.12–0.12), leap 5–7 0.08 (0.08–0.08), octave 0.02 (0.02–0.02), descending share of moves 0.55 (0.55–0.55)
- arp shape up 0.05, down 0.28, updown 0.44, random 0.23, static 0; spacing (16ths) {'1.5': 1}; octave span 0.58 (0.58–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**seq** (2 songs, in 0.17 of songs)
- onsets/bar 8 (8–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0 (0–0), off-16th onset share 0 (0–0)
- length 1.44 (1.21–1.68) 16ths, gate (length ÷ gap to next onset) 0.72 (0.6–0.84)
- velocity mean 86 ± 5.8 (flat files 0); accents step 13 +2, step 5 +2, step 9 +2; weakest step 3 -2, step 7 -2
- register (MIDI, transposed to C) 66 (64–68)
- degrees (maj): 4 0.27, 3 0.26, 5 0.2, 2 0.09, 6 0.09, 1 0.08
- intervals: repeat 0.44 (0.43–0.46), step 1–2 0.2 (0.13–0.27), skip 3–4 0.29 (0.17–0.41), leap 5–7 0.04 (0.02–0.07), octave 0 (0–0), descending share of moves 0.42 (0.38–0.47)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.44, longer 0.56; rhythm only: 1-bar 1, 2-bar 0, 4-bar 0, longer 0

**drums** (13 songs with a usable kit; flat-velocity files 0.39)
- families: kick_4otf 0.15, kick_1_and_9_only 0.54, snare_backbeat_5_13 0.54, snare_halftime_9 0, hat_16ths 0.08, hat_8ths 0.31, hat_offbeat_only 0.08, hat_none 0.08
- kick: hits/bar 3.5 (3–4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,15; vel 108 ± 7
- snare: hits/bar 1.7 (1.4–2), songs using 0.92, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 110 ± 5.8
- hat: hits/bar 5.9 (5–7.3), songs using 0.92, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 82 ± 14.3
- perc: hits/bar 0.6 (0–4.3), songs using 0.61, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 87 ± 11
- tom: hits/bar 0 (0–0), songs using 0.15, P ≥ .5 at steps none, P ≥ .2 at none; vel 74 ± 21.9
- cymb: hits/bar 0.4 (0.2–0.5), songs using 0.39, P ≥ .5 at steps none, P ≥ .2 at none; vel 94 ± 6.6
- open-hat share of hat hits 0.19, ride share of cymbals 0.19, fill-bar share 0.03

### GRUNGE (69 songs, 50 artists; sources {'lmd': 69}; distinctness 0.35)


Tempo p10/p50/p90 94 / 120 / 162; minor share 0.3.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| keys_presence | 0.39 | 0.77 | -0.38 |
| pad_presence | 0.42 | 0.69 | -0.27 |
| drum_flat_share | 0.38 | 0.12 | +0.26 |
| drum_open_hat_share | 0.34 | 0.1 | +0.23 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| VI iv | 0.19 | 0.04 |
| i III VII | 0.14 | 0.03 |
| i VI | 0.1 | 0.01 |
| i VI iv VI | 0.1 | 0.01 |
| i III iv | 0.1 | 0.03 |
| i VII | 0.1 | 0.05 |
| i VII VI iv | 0.1 | 0.03 |
| III VII | 0.1 | 0.03 |
| i VI VII iv | 0.1 | 0.03 |
| i VI VII | 0.1 | 0 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.28 | 0.09 |
| I V IV | 0.2 | 0.06 |
| I V | 0.15 | 0.01 |
| I V IV V | 0.15 | 0.01 |
| I IV I V | 0.13 | 0.02 |
| I V I IV | 0.11 | 0.01 |
| I V vi IV | 0.11 | 0.05 |
| I IV V IV | 0.11 | 0.02 |
| IV V | 0.11 | 0.01 |
| I vi IV | 0.11 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 9512 songs, minor share 0.31; share of songs containing the loop ≥ 2×): I IV (maj) 0.18, I V IV (maj) 0.14, I IV V IV (maj) 0.11, I V vi IV (maj) 0.1, I IV V (maj) 0.09, I V IV V (maj) 0.09, I IV I V (maj) 0.09, I V I IV (maj) 0.07. By era: 80s (841 songs, minor 0.23): I IV (maj) 0.16, I IV V IV (maj) 0.1, I V IV (maj) 0.1, I IV V (maj) 0.09; new (6659 songs, minor 0.34): I IV (maj) 0.17, I V IV (maj) 0.14, I V vi IV (maj) 0.1, I IV V IV (maj) 0.1

**bass** (65 songs, in 0.94 of songs)
- onsets/bar 4 (4–7); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.8 (0.1–1.9), off-16th onset share 0.04 (0–0.22)
- length 2 (1.5–3.51) 16ths, gate (length ÷ gap to next onset) 0.93 (0.8–1)
- velocity mean 98 ± 9.2 (flat files 0.51); accents step 1 +2, step 12 +1, step 5 +1; weakest step 14 -4, step 2 -4
- register (MIDI, transposed to C) 36 (31–36)
- degrees (maj): 1 0.28, 5 0.2, 4 0.18, 2 0.1, 6 0.09, 3 0.07
- intervals: repeat 0.44 (0.28–0.68), step 1–2 0.19 (0.11–0.3), skip 3–4 0.07 (0.03–0.1), leap 5–7 0.15 (0.07–0.22), octave 0.01 (0–0.05), descending share of moves 0.49 (0.46–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.05, 4-bar 0.12, longer 0.79; rhythm only: 1-bar 0.19, 2-bar 0.05, 4-bar 0.07, longer 0.69

**chord** (9 songs, in 0.13 of songs)
- onsets/bar 4 (4–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15,16
- syncopation: LHL/bar 1.6 (0.3–3.1), off-16th onset share 0.03 (0–0.43)
- length 1.6 (0.69–2.22) 16ths, gate (length ÷ gap to next onset) 0.8 (0.67–1)
- velocity mean 93 ± 8.9 (flat files 0.33); accents step 10 +10, step 12 +4, step 14 +4; weakest step 4 -7, step 2 -7
- register (MIDI, transposed to C) 60 (57–66)
- degrees (maj): 1 0.19, 5 0.17, 6 0.14, 3 0.12, 4 0.11, 2 0.09
- chords: voices 2 (2–3), spread 5 st, inversion share 0.67 (0.15–0.91), changes/bar 0.82 (0.73–1.83), qualities pow 0.51, maj 0.29, min 0.19, aug 0
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.17, longer 0.83; rhythm only: 1-bar 0.39, 2-bar 0, 4-bar 0, longer 0.61

**pad** (29 songs, in 0.42 of songs)
- onsets/bar 2 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0.1–0.7), off-16th onset share 0 (0–0.06)
- length 8.06 (2.5–15.92) 16ths, gate (length ÷ gap to next onset) 0.99 (0.95–1)
- velocity mean 80 ± 11.1 (flat files 0.24); accents step 5 +6, step 7 +2, step 3 +2; weakest step 2 -14, step 16 -14
- register (MIDI, transposed to C) 64 (59–67)
- degrees (maj): 1 0.21, 5 0.17, 6 0.13, 4 0.13, 3 0.12, 2 0.09
- chords: voices 2.8 (2.2–3), spread 9 st, inversion share 0.62 (0.35–0.88), changes/bar 0.95 (0.81–1.52), qualities maj 0.39, pow 0.39, min 0.13, dim 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.07, 4-bar 0.14, longer 0.75; rhythm only: 1-bar 0.34, 2-bar 0, 4-bar 0.08, longer 0.57

**keys** (27 songs, in 0.39 of songs)
- onsets/bar 5 (2–7); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.8 (0.1–1.2), off-16th onset share 0.01 (0–0.18)
- length 3.57 (1.92–6.14) 16ths, gate (length ÷ gap to next onset) 0.94 (0.83–1)
- velocity mean 73 ± 14.1 (flat files 0.26); accents step 5 +4, step 9 +2, step 14 +1; weakest step 16 -5, step 4 -3
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 1 0.27, 5 0.19, 3 0.11, 4 0.11, 2 0.1, 6 0.1
- chords: voices 3 (2.9–3.2), spread 8 st, inversion share 0.4 (0.32–0.61), changes/bar 1.41 (1.02–1.79), qualities maj 0.51, pow 0.25, min 0.12, sus 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.09, 4-bar 0.03, longer 0.84; rhythm only: 1-bar 0.19, 2-bar 0.07, 4-bar 0, longer 0.73

**guitar** (60 songs, in 0.87 of songs)
- onsets/bar 6.2 (5–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.3–2.1), off-16th onset share 0.06 (0–0.26)
- length 2 (1.33–2.2) 16ths, gate (length ÷ gap to next onset) 0.98 (0.79–1)
- velocity mean 79 ± 11.8 (flat files 0.43); accents step 9 +4, step 1 +2, step 13 +2; weakest step 12 -7, step 6 -5
- register (MIDI, transposed to C) 56 (50–60)
- degrees (maj): 1 0.25, 5 0.19, 4 0.12, 2 0.11, 3 0.11, 6 0.11
- chords: voices 3 (2.5–3.7), spread 12 st, inversion share 0.22 (0.03–0.43), changes/bar 1.56 (0.95–2.37), qualities pow 0.47, maj 0.34, min 0.1, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.07, 4-bar 0.18, longer 0.73; rhythm only: 1-bar 0.23, 2-bar 0.09, 4-bar 0.1, longer 0.58

**lead** (60 songs, in 0.87 of songs)
- onsets/bar 5 (4–6); steps with P ≥ .5: 1,7; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.8 (1.9–3.6), off-16th onset share 0.12 (0.02–0.27)
- length 2 (1.6–2.3) 16ths, gate (length ÷ gap to next onset) 0.96 (0.8–1)
- velocity mean 98 ± 9.4 (flat files 0.53); accents step 12 +2, step 1 +1, step 9 +1; weakest step 2 -2, step 16 -2
- register (MIDI, transposed to C) 66 (63–69)
- degrees (maj): 1 0.23, 5 0.17, 3 0.16, 2 0.14, 6 0.1, 4 0.09
- intervals: repeat 0.26 (0.17–0.43), step 1–2 0.41 (0.31–0.53), skip 3–4 0.14 (0.09–0.2), leap 5–7 0.06 (0.04–0.11), octave 0 (0–0.01), descending share of moves 0.54 (0.48–0.61)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.01, 4-bar 0.06, longer 0.93; rhythm only: 1-bar 0.04, 2-bar 0.01, 4-bar 0.06, longer 0.9

**arp** (3 songs, in 0.04 of songs)
- onsets/bar 8 (7.8–8); steps with P ≥ .5: 1,5,6,7,9,12,13,15; P ≥ .3: 1,2,4,5,6,7,9,10,12,13,14,15,16
- syncopation: LHL/bar 1.8 (0.9–5.4), off-16th onset share 0.42 (0.38–0.56)
- length 0.83 (0.81–0.9) 16ths, gate (length ÷ gap to next onset) 0.79 (0.59–0.88)
- velocity mean 106 ± 3.5 (flat files 0.67); accents step 9 +2, step 2 +1, step 15 +1; weakest step 14 -5, step 7 -3
- register (MIDI, transposed to C) 69 (65–74)
- degrees (maj): 4 0.18, 1 0.18, 5 0.17, 2 0.16, 6 0.14, 3 0.08
- intervals: repeat 0.03 (0.02–0.08), step 1–2 0.43 (0.23–0.55), skip 3–4 0.32 (0.19–0.34), leap 5–7 0.21 (0.13–0.25), octave 0.01 (0–0.04), descending share of moves 0.5 (0.32–0.51)
- arp shape up 0.39, down 0.03, updown 0.1, random 0.47, static 0; spacing (16ths) {'1.5': 1, '2.0': 1, '1.0': 1}; octave span 0.79 (0.77–0.92)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.2, longer 0.8; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.2, longer 0.8

**seq** (7 songs, in 0.1 of songs)
- onsets/bar 7 (4–7.5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,6,7,9,11,12,15
- syncopation: LHL/bar 2.5 (2–3.1), off-16th onset share 0.43 (0.19–0.45)
- length 1 (0.92–1.51) 16ths, gate (length ÷ gap to next onset) 0.93 (0.75–0.98)
- velocity mean 71 ± 21.9 (flat files 0.71); accents step 5 +46, step 3 +38, step 6 +33; weakest step 14 -35, step 15 -30
- register (MIDI, transposed to C) 64 (62–64)
- degrees (maj): 2 0.26, 1 0.18, 5 0.17, 3 0.15, 4 0.09, 6 0.09
- intervals: repeat 0.3 (0.2–0.61), step 1–2 0.27 (0.13–0.49), skip 3–4 0.01 (0–0.1), leap 5–7 0.1 (0–0.27), octave 0 (0–0), descending share of moves 0.52 (0.48–0.62)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.33, 2-bar 0, 4-bar 0, longer 0.67

**drums** (60 songs with a usable kit; flat-velocity files 0.38)
- families: kick_4otf 0.07, kick_1_and_9_only 0.5, snare_backbeat_5_13 0.65, snare_halftime_9 0.07, hat_16ths 0.03, hat_8ths 0.42, hat_offbeat_only 0.02, hat_none 0.12
- kick: hits/bar 3.4 (2.5–4.1), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,3,7,9,11,15; vel 107 ± 6.5
- snare: hits/bar 2 (1.4–2.2), songs using 0.98, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 110 ± 4.2
- hat: hits/bar 5.8 (3.6–7.6), songs using 0.9, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 88 ± 10.6
- perc: hits/bar 0.7 (0–4.8), songs using 0.53, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 91 ± 11.8
- tom: hits/bar 0 (0–0), songs using 0.05, P ≥ .5 at steps none, P ≥ .2 at none; vel 105 ± 12.2
- cymb: hits/bar 0.7 (0.1–2.3), songs using 0.58, P ≥ .5 at steps none, P ≥ .2 at 1,5,9,13; vel 85 ± 8.3
- open-hat share of hat hits 0.34, ride share of cymbals 0.39, fill-bar share 0.06

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 15 | 93 / 120 / 156 | 0.33 | 4 (3–5.5) | 0.97 (0.83–1) | 0.5 (0.38–0.56) | 0.4 | 0.13 | 0 | 0 | i VI v (0.2) |
| new | 29 | 92 / 126 / 165 | 0.28 | 4 (3–6.1) | 0.93 (0.81–1) | 0.41 (0.29–0.53) | 0.59 | 0.03 | 0.04 | 0.04 | i VI VII (0.25) |

