# JAZZ — reference statistics

**130 songs measured** (210 selected), 98 artists; sources {'lmd': 130}; eras {'new': 42, '80s': 41, '?': 39, '90s': 8}; era splits: {'80s': 41, 'new': 42}. Every table: `analysis/out/jazz_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **94 / 120 / 156**; file BPM q1/med/q3 81 / 105 / 124; minor share **0.29**.

## Findings

⚠ Swung files are removed by the grid test (the grid is straight 16ths), so this is straight-8th/latin/fusion jazz more than swing. Ride-led (56 % of cymbal hits), snare backbeat weak (38 %), bass notes long (3.1 16ths; walking lines fall out as off-grid). Major/mixolydian (minor 29 %), about one chord change per bar. SWING (37 survivors): hat mostly absent (31 % no hat), ride 67 %, kick 1 + 9 only.

Flavours filed under this style: **SWING** (37 songs), **BEBOP** (3 songs), **JAZZ FUNK** (16 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 1.02 (0.84–1.34). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.13 | 0.02 |
| i v | 0.08 | 0.03 |
| III VI III v | 0.08 | 0.01 |
| i VI III VII | 0.08 | 0.03 |
| i VI vii VI | 0.05 | 0.01 |
| i iv V | 0.05 | 0.01 |
| III VI iv VII | 0.05 | 0.01 |
| i iv VII VI | 0.05 | 0.01 |
| i VI v III | 0.05 | 0.01 |
| i IV i iv | 0.05 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V | 0.18 | 0.05 |
| I IV | 0.17 | 0.05 |
| I IV I V | 0.16 | 0.02 |
| I V I IV | 0.12 | 0.02 |
| I IV I vi | 0.12 | 0.02 |
| I V IV | 0.1 | 0.02 |
| I V vi IV | 0.09 | 0.01 |
| I IV ii V | 0.09 | 0.02 |
| I IV V IV | 0.08 | 0.01 |
| I vi I IV | 0.08 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 4500 songs, minor share 0.29; share of songs containing the loop ≥ 2×): I IV (maj) 0.2, I IV I V (maj) 0.16, I IV V (maj) 0.12, I V I IV (maj) 0.12, I IV V IV (maj) 0.09, I IV ii V (maj) 0.08, I V IV (maj) 0.08, I V (maj) 0.08. By era: 80s (1341 songs, minor 0.23): I IV (maj) 0.24, I IV I V (maj) 0.2, I V I IV (maj) 0.13, I IV V (maj) 0.12; new (1958 songs, minor 0.36): I IV (maj) 0.17, I IV I V (maj) 0.12, I IV V (maj) 0.1, I V I IV (maj) 0.09

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (119 songs, in 0.92 of songs)
- onsets/bar 4 (3–4.5); steps with P ≥ .5: 1,9; P ≥ .3: 1,7,9,13,15
- syncopation: LHL/bar 0.6 (0.1–1.5), off-16th onset share 0.02 (0–0.15)
- length 3.12 (1.96–4) 16ths, gate (length ÷ gap to next onset) 0.9 (0.8–0.98)
- velocity mean 95 ± 8.8 (flat files 0.21); accents step 1 +2, step 5 +1, step 9 +0; weakest step 10 -8, step 14 -5
- register (MIDI, transposed to C) 36 (34–41)
- degrees (maj): 1 0.23, 5 0.22, 4 0.15, 2 0.1, 6 0.1, 3 0.07
- intervals: repeat 0.25 (0.15–0.38), step 1–2 0.23 (0.14–0.37), skip 3–4 0.08 (0.04–0.14), leap 5–7 0.27 (0.16–0.35), octave 0.03 (0–0.09), descending share of moves 0.48 (0.43–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.03, 4-bar 0.04, longer 0.9; rhythm only: 1-bar 0.11, 2-bar 0.03, 4-bar 0.03, longer 0.83

**chord** (36 songs, in 0.28 of songs)
- onsets/bar 4 (3–5.2); steps with P ≥ .5: 1,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (1–2.6), off-16th onset share 0.15 (0–0.43)
- length 1.46 (0.78–2.05) 16ths, gate (length ÷ gap to next onset) 0.69 (0.48–0.87)
- velocity mean 93 ± 8.6 (flat files 0.28); accents step 2 +2, step 11 +1, step 4 +1; weakest step 10 -3, step 7 -0
- register (MIDI, transposed to C) 64 (60–71)
- degrees (maj): 5 0.22, 1 0.15, 3 0.14, 6 0.12, 2 0.11, 7 0.08
- chords: voices 2.1 (2–2.6), spread 7 st, inversion share 0.75 (0.56–1), changes/bar 2.03 (1.28–2.37), qualities pow 0.6, maj 0.17, min 0.1, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.15, 4-bar 0.11, longer 0.73; rhythm only: 1-bar 0.08, 2-bar 0.11, 4-bar 0.12, longer 0.69

**pad** (79 songs, in 0.61 of songs)
- onsets/bar 2 (1.5–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.7 (0.2–1.5), off-16th onset share 0.08 (0–0.2)
- length 7.83 (2.5–11.11) 16ths, gate (length ÷ gap to next onset) 0.99 (0.92–1)
- velocity mean 68 ± 9.6 (flat files 0.14); accents step 4 +4, step 13 +2, step 7 +1; weakest step 6 -5, step 10 -4
- register (MIDI, transposed to C) 65 (60–69)
- degrees (maj): 1 0.2, 5 0.17, 3 0.12, 6 0.12, 4 0.11, 2 0.11
- chords: voices 2.8 (2.1–3.1), spread 8 st, inversion share 0.5 (0.27–0.67), changes/bar 1.26 (0.9–1.69), qualities pow 0.35, maj 0.32, min 0.18, min7 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.05, longer 0.95; rhythm only: 1-bar 0.1, 2-bar 0.02, 4-bar 0.04, longer 0.84

**keys** (101 songs, in 0.78 of songs)
- onsets/bar 5 (3–7); steps with P ≥ .5: 1,5,7,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.4 (0.6–2.4), off-16th onset share 0.12 (0.01–0.24)
- length 2.33 (1.7–4) 16ths, gate (length ÷ gap to next onset) 0.93 (0.67–1)
- velocity mean 87 ± 11.4 (flat files 0.27); accents step 1 +1, step 15 +0, step 5 +0; weakest step 10 -4, step 2 -2
- register (MIDI, transposed to C) 62 (56–67)
- degrees (maj): 1 0.21, 5 0.17, 3 0.12, 6 0.12, 4 0.1, 2 0.1
- chords: voices 2.9 (2.6–3.3), spread 9 st, inversion share 0.54 (0.39–0.71), changes/bar 1.89 (1.29–2.42), qualities maj 0.37, pow 0.23, min 0.2, min7 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.04, longer 0.96; rhythm only: 1-bar 0.09, 2-bar 0.02, 4-bar 0.03, longer 0.86

**guitar** (79 songs, in 0.61 of songs)
- onsets/bar 5 (3–7.5); steps with P ≥ .5: 1,5,7,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.8 (1.1–2.9), off-16th onset share 0.07 (0.01–0.32)
- length 1.92 (1–2.34) 16ths, gate (length ÷ gap to next onset) 0.8 (0.5–1)
- velocity mean 79 ± 11.2 (flat files 0.18); accents step 5 +2, step 9 +2, step 8 +1; weakest step 10 -2, step 6 -2
- register (MIDI, transposed to C) 60 (55–64)
- degrees (maj): 1 0.22, 5 0.18, 3 0.12, 2 0.12, 6 0.11, 4 0.1
- chords: voices 2.6 (2–3), spread 8 st, inversion share 0.52 (0.28–0.69), changes/bar 1.03 (0.56–1.63), qualities pow 0.42, maj 0.33, min 0.15, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.02, 4-bar 0.04, longer 0.86; rhythm only: 1-bar 0.26, 2-bar 0.02, 4-bar 0.03, longer 0.69

**lead** (101 songs, in 0.78 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 2.3 (1.3–3.1), off-16th onset share 0.11 (0.03–0.31)
- length 1.96 (1.45–2.75) 16ths, gate (length ÷ gap to next onset) 0.92 (0.75–0.99)
- velocity mean 100 ± 9 (flat files 0.27); accents step 10 +1, step 5 +1, step 6 +0; weakest step 8 -0, step 4 -0
- register (MIDI, transposed to C) 67 (63–70)
- degrees (maj): 1 0.2, 5 0.17, 3 0.13, 2 0.12, 6 0.11, 4 0.11
- intervals: repeat 0.13 (0.07–0.21), step 1–2 0.47 (0.4–0.59), skip 3–4 0.19 (0.12–0.26), leap 5–7 0.09 (0.05–0.13), octave 0 (0–0.02), descending share of moves 0.52 (0.47–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0, 4-bar 0.02, longer 0.96; rhythm only: 1-bar 0.04, 2-bar 0.01, 4-bar 0.05, longer 0.9

**arp** (20 songs, in 0.15 of songs)
- onsets/bar 7.8 (6–9); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.6 (1.7–3.8), off-16th onset share 0.39 (0.29–0.49)
- length 1.08 (0.89–1.31) 16ths, gate (length ÷ gap to next onset) 0.84 (0.67–0.97)
- velocity mean 95 ± 10.4 (flat files 0.15); accents step 9 +2, step 3 +1, step 5 +1; weakest step 16 -4, step 2 -2
- register (MIDI, transposed to C) 72 (66–76)
- degrees (maj): 1 0.2, 3 0.16, 2 0.15, 5 0.15, 6 0.09, 4 0.08
- intervals: repeat 0.08 (0.02–0.11), step 1–2 0.41 (0.28–0.48), skip 3–4 0.25 (0.16–0.3), leap 5–7 0.13 (0.1–0.23), octave 0.02 (0.01–0.05), descending share of moves 0.51 (0.47–0.54)
- arp shape up 0.2, down 0.19, updown 0.26, random 0.35, static 0.01; spacing (16ths) {'2.0': 9, '1.0': 7, '1.25': 2, '2.75': 1, '1.5': 1}; octave span 1 (0.7–1.17)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.01, 4-bar 0, longer 0.98; rhythm only: 1-bar 0.03, 2-bar 0.01, 4-bar 0.01, longer 0.95

**seq** (22 songs, in 0.17 of songs)
- onsets/bar 3.5 (2–9.8); steps with P ≥ .5: 1,7,9; P ≥ .3: 1,3,5,7,8,9,11,12,13,14,15
- syncopation: LHL/bar 1.8 (0.8–3.2), off-16th onset share 0.15 (0.03–0.46)
- length 1.79 (0.98–2.82) 16ths, gate (length ÷ gap to next onset) 0.79 (0.65–0.99)
- velocity mean 89 ± 7.8 (flat files 0.32); accents step 11 +2, step 13 +1, step 1 +1; weakest step 10 -7, step 2 -3
- register (MIDI, transposed to C) 52 (49–54)
- degrees (maj): 1 0.33, 4 0.17, 2 0.12, 5 0.11, 6 0.08, 3 0.07
- intervals: repeat 0.11 (0.04–0.38), step 1–2 0.4 (0.27–0.61), skip 3–4 0.12 (0–0.26), leap 5–7 0.06 (0–0.14), octave 0 (0–0.01), descending share of moves 0.54 (0.5–0.61)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0, 4-bar 0.1, longer 0.82; rhythm only: 1-bar 0.18, 2-bar 0, 4-bar 0.11, longer 0.71

**fx** (9 songs, in 0.07 of songs)
- onsets/bar 3 (2–5.5); steps with P ≥ .5: 1; P ≥ .3: 1,3,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.5–4.5), off-16th onset share 0 (0–0.03)
- length 2 (0.79–4) 16ths, gate (length ÷ gap to next onset) 0.75 (0.18–1)
- velocity mean 83 ± 9.9 (flat files 0.11); accents step 14 +15, step 12 +11, step 10 +4; weakest step 2 -10, step 4 -10
- register (MIDI, transposed to C) 62 (60–64)
- degrees (maj): 1 0.3, 5 0.19, 2 0.09, 3 0.09, 4 0.09, b7 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.17, 2-bar 0.06, 4-bar 0.33, longer 0.44; rhythm only: 1-bar 0.24, 2-bar 0.17, 4-bar 0.33, longer 0.26

**drums** (106 songs with a usable kit; flat-velocity files 0.11)
- families: kick_4otf 0.05, kick_1_and_9_only 0.43, snare_backbeat_5_13 0.38, snare_halftime_9 0.09, hat_16ths 0.05, hat_8ths 0.33, hat_offbeat_only 0, hat_none 0.12
- kick: hits/bar 2.8 (2–3.9), songs using 0.92, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,15; vel 96 ± 6.5
- snare: hits/bar 1.4 (0.6–2.1), songs using 0.79, P ≥ .5 at steps 13, P ≥ .2 at 5,13; vel 99 ± 7.6
- hat: hits/bar 5.4 (2–7.9), songs using 0.9, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 80 ± 11.8
- perc: hits/bar 2 (0.2–7.7), songs using 0.66, P ≥ .5 at steps 13, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 79 ± 13.5
- tom: hits/bar 0 (0–0), songs using 0.03, P ≥ .5 at steps none, P ≥ .2 at none; vel 90 ± 9.5
- cymb: hits/bar 0.3 (0.1–2.8), songs using 0.48, P ≥ .5 at steps none, P ≥ .2 at 1,5,9,13; vel 81 ± 9.4
- open-hat share of hat hits 0.13, ride share of cymbals 0.56, fill-bar share 0.08

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 41 | 94 / 122 / 152 | 0.37 | 4 (2–4) | 0.91 (0.76–0.99) | 0.47 (0.41–0.55) | 0.71 | 0.17 | 0.03 | 0.03 | i v (0.13) |
| new | 42 | 95 / 120 / 146 | 0.26 | 4 (3–5) | 0.89 (0.78–0.98) | 0.59 (0.4–0.67) | 0.55 | 0.14 | 0.08 | 0.05 | i VI vii VI (0.09) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### SWING (37 songs, 31 artists; sources {'lmd': 37}; distinctness 0.39)


Tempo p10/p50/p90 109 / 135 / 165; minor share 0.22.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| drum_hat_hits_per_bar | 1.9 | 5.4 | -3.50 |
| tempo_p50 | 135 | 120 | +15.00 |
| chord_presence | 0.49 | 0.28 | +0.21 |
| drum_hat_8ths | 0.13 | 0.33 | -0.20 |
| lead_presence | 0.97 | 0.78 | +0.20 |
| drum_hat_none | 0.31 | 0.12 | +0.19 |
| seq_presence | 0.32 | 0.17 | +0.15 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv VII III | 0.25 | 0.03 |
| #vi II V II | 0.12 | 0.04 |
| III VI III vii | 0.12 | 0.04 |
| #vi II V I | 0.12 | 0.01 |
| III VI bII vii | 0.12 | 0.01 |
| i III VI | 0.12 | 0.03 |
| i iv | 0.12 | 0.01 |
| i iv III iv | 0.12 | 0.01 |
| i iv III | 0.12 | 0.01 |
| i III iv III | 0.12 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV I V | 0.31 | 0.06 |
| I IV | 0.31 | 0.07 |
| I V I IV | 0.28 | 0.05 |
| I vi IV V | 0.17 | 0.06 |
| I IV V IV | 0.14 | 0.02 |
| I IV V | 0.1 | 0.03 |
| I vi IV | 0.1 | 0.02 |
| I IV bVII IV | 0.1 | 0.03 |
| I V | 0.1 | 0.03 |
| I V IV V | 0.07 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 2234 songs, minor share 0.13; share of songs containing the loop ≥ 2×): I IV I V (maj) 0.43, I V I IV (maj) 0.37, I IV (maj) 0.35, I IV V (maj) 0.26, I V (maj) 0.23, I IV II V (maj) 0.18, I IV bVII IV (maj) 0.13, I IV V IV (maj) 0.12. By era: 80s (754 songs, minor 0.12): I IV I V (maj) 0.41, I IV (maj) 0.36, I V I IV (maj) 0.34, I IV V (maj) 0.26; new (814 songs, minor 0.17): I IV I V (maj) 0.43, I V I IV (maj) 0.38, I IV (maj) 0.35, I IV V (maj) 0.23

**bass** (34 songs, in 0.92 of songs)
- onsets/bar 4 (2.2–4); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,5,9,13
- syncopation: LHL/bar 0.1 (0–0.3), off-16th onset share 0.02 (0–0.12)
- length 3.79 (2.35–4.1) 16ths, gate (length ÷ gap to next onset) 0.86 (0.73–0.96)
- velocity mean 85 ± 7.8 (flat files 0.06); accents step 1 +1, step 9 +0, step 5 +0; weakest step 2 -49, step 10 -33
- register (MIDI, transposed to C) 40 (36–43)
- degrees (maj): 1 0.24, 5 0.22, 4 0.12, 2 0.11, 6 0.1, 3 0.09
- intervals: repeat 0.24 (0.08–0.37), step 1–2 0.24 (0.17–0.32), skip 3–4 0.08 (0.04–0.13), leap 5–7 0.31 (0.19–0.39), octave 0.02 (0–0.06), descending share of moves 0.5 (0.45–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.02, longer 0.98; rhythm only: 1-bar 0.15, 2-bar 0, 4-bar 0.01, longer 0.83

**chord** (18 songs, in 0.49 of songs)
- onsets/bar 3 (2–4); steps with P ≥ .5: 1; P ≥ .3: 1,5,9,13
- syncopation: LHL/bar 1.2 (0.5–2.5), off-16th onset share 0.11 (0.03–0.25)
- length 2.11 (1.47–2.79) 16ths, gate (length ÷ gap to next onset) 0.76 (0.53–0.86)
- velocity mean 85 ± 9.6 (flat files 0); accents step 10 +3, step 16 +2, step 14 +1; weakest step 2 -2, step 8 -2
- register (MIDI, transposed to C) 68 (63–74)
- degrees (maj): 5 0.18, 1 0.17, 3 0.13, 6 0.12, 4 0.11, 2 0.09
- chords: voices 2.3 (2.2–2.6), spread 8 st, inversion share 0.75 (0.65–0.81), changes/bar 1.59 (1.19–2.41), qualities pow 0.46, maj 0.25, min 0.1, min7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.1, longer 0.9; rhythm only: 1-bar 0.09, 2-bar 0.02, 4-bar 0.02, longer 0.87

**pad** (21 songs, in 0.57 of songs)
- onsets/bar 1.5 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0.1–0.9), off-16th onset share 0.1 (0–0.15)
- length 8 (2.94–15.28) 16ths, gate (length ÷ gap to next onset) 0.98 (0.94–1)
- velocity mean 69 ± 12.1 (flat files 0.1); accents step 14 +12, step 7 +8, step 10 +8; weakest step 2 -1, step 4 -1
- register (MIDI, transposed to C) 69 (62–75)
- degrees (maj): 1 0.19, 5 0.15, 4 0.13, 6 0.12, 3 0.12, 2 0.1
- chords: voices 2.7 (2.3–2.9), spread 8 st, inversion share 0.58 (0.51–0.69), changes/bar 1.25 (1–1.77), qualities pow 0.33, maj 0.32, min 0.18, maj7 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.09, longer 0.91; rhythm only: 1-bar 0.15, 2-bar 0, 4-bar 0, longer 0.84

**keys** (24 songs, in 0.65 of songs)
- onsets/bar 4 (2–5.1); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,5,9,13
- syncopation: LHL/bar 0.8 (0.2–2.6), off-16th onset share 0.18 (0–0.34)
- length 3 (2.15–4) 16ths, gate (length ÷ gap to next onset) 0.94 (0.74–1)
- velocity mean 74 ± 9.8 (flat files 0.08); accents step 16 +5, step 2 +4, step 8 +4; weakest step 14 -2, step 1 -2
- register (MIDI, transposed to C) 64 (60–70)
- degrees (maj): 1 0.2, 5 0.2, 3 0.14, 4 0.11, 6 0.11, 2 0.09
- chords: voices 3 (2.6–3.5), spread 9 st, inversion share 0.6 (0.5–0.74), changes/bar 1.35 (0.96–2.29), qualities maj 0.4, pow 0.25, min 0.12, maj7 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.01, longer 0.98; rhythm only: 1-bar 0.16, 2-bar 0.03, 4-bar 0.01, longer 0.81

**guitar** (25 songs, in 0.68 of songs)
- onsets/bar 5 (4–7); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,5,7,9,13
- syncopation: LHL/bar 0.9 (0.2–2.1), off-16th onset share 0.13 (0.02–0.33)
- length 2.4 (1.03–3.83) 16ths, gate (length ÷ gap to next onset) 0.82 (0.47–1)
- velocity mean 80 ± 10.9 (flat files 0.08); accents step 6 +8, step 10 +6, step 2 +4; weakest step 9 -1, step 15 -1
- register (MIDI, transposed to C) 60 (57–65)
- degrees (maj): 1 0.25, 5 0.22, 3 0.14, 4 0.11, 6 0.09, 2 0.09
- chords: voices 3 (2.6–3.4), spread 8 st, inversion share 0.59 (0.51–0.72), changes/bar 1.65 (0.83–1.83), qualities maj 0.39, pow 0.24, min 0.14, dim 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.07, longer 0.93; rhythm only: 1-bar 0.16, 2-bar 0, 4-bar 0.05, longer 0.8

**lead** (36 songs, in 0.97 of songs)
- onsets/bar 3.2 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,5,9,13
- syncopation: LHL/bar 2 (1.1–2.9), off-16th onset share 0.21 (0.05–0.38)
- length 2.51 (1.36–3.26) 16ths, gate (length ÷ gap to next onset) 0.85 (0.76–0.96)
- velocity mean 96 ± 8.4 (flat files 0.11); accents step 1 +2, step 14 +1, step 5 +1; weakest step 8 -2, step 4 -1
- register (MIDI, transposed to C) 71 (67–74)
- degrees (maj): 1 0.19, 3 0.16, 5 0.14, 2 0.13, 6 0.13, 4 0.09
- intervals: repeat 0.12 (0.08–0.24), step 1–2 0.5 (0.37–0.58), skip 3–4 0.2 (0.15–0.25), leap 5–7 0.11 (0.07–0.14), octave 0 (0–0.01), descending share of moves 0.54 (0.48–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0.03, 4-bar 0.01, longer 0.95

**arp** (1 songs, in 0.03 of songs)
- onsets/bar 7.5 (7.5–7.5); steps with P ≥ .5: 1,4,5,8,9,13,14,16; P ≥ .3: 1,4,5,8,9,10,12,13,14,16
- syncopation: LHL/bar 2.4 (2.4–2.4), off-16th onset share 0.56 (0.56–0.56)
- length 1.13 (1.13–1.13) 16ths, gate (length ÷ gap to next onset) 0.92 (0.92–0.92)
- velocity mean 94 ± 13.9 (flat files 0); accents step 9 +8, step 1 +6, step 4 +1; weakest step 10 -7, step 14 -7
- register (MIDI, transposed to C) 74 (71–77)
- degrees (maj): 5 0.25, 2 0.21, 3 0.12, 1 0.09, 6 0.09, 7 0.09
- intervals: repeat 0 (0–0), step 1–2 0.76 (0.76–0.76), skip 3–4 0.12 (0.12–0.12), leap 5–7 0 (0–0), octave 0.06 (0.06–0.06), descending share of moves 0.59 (0.59–0.59)
- arp shape up 0, down 0, updown 0.5, random 0.5, static 0; spacing (16ths) {'2.5': 1}; octave span 1 (1–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar –, 2-bar –, 4-bar –, longer –; rhythm only: 1-bar –, 2-bar –, 4-bar –, longer –

**seq** (12 songs, in 0.32 of songs)
- onsets/bar 4 (3.5–4.6); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,5,9,13,15
- syncopation: LHL/bar 1.5 (1–2.3), off-16th onset share 0.24 (0.05–0.4)
- length 1.92 (1.5–3.83) 16ths, gate (length ÷ gap to next onset) 0.95 (0.76–1.01)
- velocity mean 82 ± 8.8 (flat files 0.17); accents step 10 +2, step 1 +2, step 15 +2; weakest step 2 -7, step 7 -2
- register (MIDI, transposed to C) 48 (45–51)
- degrees (maj): 5 0.27, 1 0.25, 3 0.12, 6 0.09, 4 0.08, 2 0.07
- intervals: repeat 0.12 (0.01–0.24), step 1–2 0.43 (0.23–0.53), skip 3–4 0.19 (0.07–0.27), leap 5–7 0.18 (0.11–0.27), octave 0 (0–0), descending share of moves 0.54 (0.46–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.16, longer 0.84; rhythm only: 1-bar 0.05, 2-bar 0.11, 4-bar 0.11, longer 0.73

**drums** (45 songs with a usable kit; flat-velocity files 0.02)
- families: kick_4otf 0.04, kick_1_and_9_only 0.33, snare_backbeat_5_13 0.4, snare_halftime_9 0.07, hat_16ths 0.02, hat_8ths 0.13, hat_offbeat_only 0, hat_none 0.31
- kick: hits/bar 2 (1.3–2.4), songs using 0.84, P ≥ .5 at steps 1, P ≥ .2 at 1,9; vel 84 ± 9.6
- snare: hits/bar 1.9 (1–2.5), songs using 0.91, P ≥ .5 at steps 5,13, P ≥ .2 at 1,5,9,13; vel 79 ± 14.3
- hat: hits/bar 1.9 (0.2–4.4), songs using 0.69, P ≥ .5 at steps 5,13, P ≥ .2 at 1,5,9,13; vel 76 ± 11
- perc: hits/bar 0.2 (0–1.8), songs using 0.47, P ≥ .5 at steps none, P ≥ .2 at 5,13; vel 79 ± 9
- tom: hits/bar 0 (0–0), songs using 0.02, P ≥ .5 at steps none, P ≥ .2 at none; vel 91 ± 5.5
- cymb: hits/bar 2.2 (0.2–5.1), songs using 0.62, P ≥ .5 at steps 1, P ≥ .2 at 1,5,8,9,13,16; vel 76 ± 11.1
- open-hat share of hat hits 0.14, ride share of cymbals 0.67, fill-bar share 0.07

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 17 | 101 / 130 / 168 | 0.12 | 3 (2–4) | 0.86 (0.73–0.97) | 0.55 (0.49–0.6) | 0.71 | 0.06 | 0 | 0 | – (–) |

### BEBOP (3 songs, 3 artists; sources {'lmd': 3}; distinctness –)


Tempo p10/p50/p90 108 / 140 / 163; minor share 0.

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| II V v V | 0.5 | 0.08 |
| I bvio ivo v | 0.5 | 0.08 |
| ii v ivo vi | 0.5 | 0.12 |

Chord-sheet cross-check (Chordonomicon, 116 songs, minor share 0.24; share of songs containing the loop ≥ 2×): I IV (maj) 0.17, I IV I V (maj) 0.12, I V I IV (maj) 0.1, I IV V IV (maj) 0.09, I IV V (maj) 0.09, I V IV (maj) 0.09, I IV bVII IV (maj) 0.08, I vi V IV (maj) 0.07. By era: 80s (37 songs, minor 0.14): I IV (maj) 0.19, I IV ii V (maj) 0.14, I IV bVII IV (maj) 0.11, I IV II V (maj) 0.11; new (12 songs, minor 0.25): I IV V (maj) 0.08, i VI vi v (min) 0.08, #ivo VI vi v (min) 0.08, i vi v #ivo (min) 0.08

### JAZZ FUNK (16 songs, 15 artists; sources {'lmd': 16}; distinctness 0.51)


Tempo p10/p50/p90 99 / 116 / 145; minor share 0.38.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| drum_snare_backbeat_5_13 | 0.69 | 0.38 | +0.31 |
| guitar_presence | 0.88 | 0.61 | +0.27 |
| keys_gate | 0.69 | 0.93 | -0.24 |
| guitar_offbeat16_share | 0.3 | 0.07 | +0.23 |
| drum_kick_4otf | 0.25 | 0.05 | +0.20 |
| keys_loop_1bar_rhythm | 0.27 | 0.09 | +0.17 |
| pad_presence | 0.44 | 0.61 | -0.17 |
| lead_presence | 0.94 | 0.78 | +0.16 |
| bass_offbeat16_share | 0.18 | 0.02 | +0.16 |
| bass_loop_1bar_rhythm | 0.26 | 0.11 | +0.15 |
| pad_loop_1bar_rhythm | 0.25 | 0.1 | +0.15 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI iv v | 0.4 | 0.07 |
| i III | 0.4 | 0.04 |
| i VI III V | 0.2 | 0.06 |
| i iv v | 0.2 | 0.05 |
| i III V v | 0.2 | 0.01 |
| i VI V v | 0.2 | 0.01 |
| i VI III v | 0.2 | 0.01 |
| III bII VI VII | 0.2 | 0.01 |
| i iv V | 0.2 | 0.1 |
| i VII III VI | 0.2 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I ii | 0.3 | 0.13 |
| I V IV | 0.2 | 0.11 |
| I ii V | 0.2 | 0.07 |
| I IV iii ii | 0.1 | 0.03 |
| IV iii ii vi | 0.1 | 0.01 |
| I iii vi V | 0.1 | 0.01 |
| I ii vi V | 0.1 | 0.01 |
| I ii IV V | 0.1 | 0.01 |
| I ii IV III | 0.1 | 0.01 |
| III vi ii IV | 0.1 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 317 songs, minor share 0.38; share of songs containing the loop ≥ 2×): I IV (maj) 0.17, I IV I V (maj) 0.1, I V I IV (maj) 0.1, I IV V IV (maj) 0.09, I V IV V (maj) 0.07, I IV V (maj) 0.06, I V (maj) 0.06, I V IV (maj) 0.06. By era: 80s (91 songs, minor 0.41): I IV (maj) 0.17, I V IV V (maj) 0.08, I IV V (maj) 0.08, I IV V IV (maj) 0.08; new (39 songs, minor 0.44): I IV I V (maj) 0.13, I V I IV (maj) 0.1, VI v iv v (min) 0.08, I vi II V (maj) 0.08

**bass** (16 songs, in 1 of songs)
- onsets/bar 5 (3.8–6.2); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.3–2.2), off-16th onset share 0.18 (0.02–0.3)
- length 1.42 (1–3.08) 16ths, gate (length ÷ gap to next onset) 0.76 (0.59–0.8)
- velocity mean 95 ± 9.9 (flat files 0.31); accents step 4 +3, step 12 +3, step 1 +2; weakest step 2 -23, step 6 -4
- register (MIDI, transposed to C) 36 (32–40)
- degrees (maj): 1 0.31, 5 0.17, 4 0.15, 2 0.1, 6 0.1, 3 0.05
- intervals: repeat 0.27 (0.2–0.47), step 1–2 0.18 (0.12–0.32), skip 3–4 0.07 (0.05–0.12), leap 5–7 0.24 (0.18–0.29), octave 0.02 (0–0.04), descending share of moves 0.45 (0.38–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.21, longer 0.76; rhythm only: 1-bar 0.26, 2-bar 0.02, 4-bar 0.07, longer 0.64

**chord** (3 songs, in 0.19 of songs)
- onsets/bar 3 (2–3); steps with P ≥ .5: none; P ≥ .3: 1,15,16
- syncopation: LHL/bar 3 (2.1–3.4), off-16th onset share 0.37 (0.26–0.42)
- length 0.67 (0.55–1.47) 16ths, gate (length ÷ gap to next onset) 0.42 (0.32–0.57)
- velocity mean 102 ± 13.9 (flat files 0); accents step 14 +14, step 15 +8, step 12 +8; weakest step 2 -28, step 3 -13
- register (MIDI, transposed to C) 64 (60–69)
- degrees (maj): 4 0.22, 6 0.16, 1 0.14, 3 0.14, 5 0.14, 7 0.11
- chords: voices 2.5 (2.4–2.8), spread 7 st, inversion share 0.32 (0.28–0.35), changes/bar 1.62 (1.17–2.65), qualities maj 0.7, pow 0.19, min 0.06, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar –, 2-bar –, 4-bar –, longer –; rhythm only: 1-bar –, 2-bar –, 4-bar –, longer –

**pad** (7 songs, in 0.44 of songs)
- onsets/bar 1.5 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.7 (0–1.5), off-16th onset share 0.08 (0–0.09)
- length 7.2 (4.5–13.99) 16ths, gate (length ÷ gap to next onset) 0.99 (0.74–1.01)
- velocity mean 71 ± 11.9 (flat files 0.14); accents step 16 +21, step 12 +21, step 14 +13; weakest step 8 -10, step 5 -10
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 5 0.2, 6 0.18, 1 0.17, 3 0.15, 4 0.14, 2 0.09
- chords: voices 2.7 (2.5–2.9), spread 7 st, inversion share 0.58 (0.22–0.67), changes/bar 0.97 (0.9–1.24), qualities maj 0.34, min 0.28, pow 0.22, sus 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.25, 4-bar 0, longer 0.75; rhythm only: 1-bar 0.25, 2-bar 0, 4-bar 0, longer 0.75

**keys** (13 songs, in 0.81 of songs)
- onsets/bar 5 (2–8); steps with P ≥ .5: 1; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 1.7 (1–2), off-16th onset share 0.22 (0–0.41)
- length 1 (0.63–2.33) 16ths, gate (length ÷ gap to next onset) 0.69 (0.36–0.75)
- velocity mean 84 ± 10.8 (flat files 0.15); accents step 13 +5, step 16 +4, step 5 +2; weakest step 4 -5, step 2 -5
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 1 0.17, b6 0.14, 5 0.14, 3 0.13, 4 0.11, 6 0.1
- chords: voices 3.2 (3–3.8), spread 8 st, inversion share 0.48 (0.3–0.71), changes/bar 1.39 (0.78–2.06), qualities maj 0.47, min 0.22, pow 0.11, maj7 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0, 4-bar 0.05, longer 0.87; rhythm only: 1-bar 0.27, 2-bar 0, 4-bar 0.01, longer 0.73

**guitar** (14 songs, in 0.88 of songs)
- onsets/bar 6 (5–7.8); steps with P ≥ .5: 1,5,7,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15,16
- syncopation: LHL/bar 3.1 (1.3–4.9), off-16th onset share 0.3 (0.01–0.47)
- length 1.22 (0.77–2.08) 16ths, gate (length ÷ gap to next onset) 0.67 (0.51–0.95)
- velocity mean 91 ± 13.6 (flat files 0.21); accents step 13 +5, step 14 +5, step 5 +3; weakest step 2 -10, step 16 -8
- register (MIDI, transposed to C) 60 (55–62)
- degrees (maj): 1 0.21, 5 0.2, 3 0.13, 2 0.12, 6 0.11, 4 0.11
- chords: voices 3.3 (2–3.6), spread 9 st, inversion share 0.57 (0.28–0.59), changes/bar 1.39 (0.89–2.47), qualities maj 0.43, pow 0.24, min 0.22, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.1, longer 0.85; rhythm only: 1-bar 0.34, 2-bar 0.03, 4-bar 0.01, longer 0.63

**lead** (15 songs, in 0.94 of songs)
- onsets/bar 4 (3.8–5); steps with P ≥ .5: 1,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.8–3.1), off-16th onset share 0.24 (0.1–0.33)
- length 1.83 (1.04–2.12) 16ths, gate (length ÷ gap to next onset) 0.79 (0.59–0.95)
- velocity mean 90 ± 8.3 (flat files 0.27); accents step 15 +2, step 13 +1, step 7 +1; weakest step 6 -6, step 2 -5
- register (MIDI, transposed to C) 67 (63–69)
- degrees (maj): 1 0.21, 5 0.16, 3 0.15, 2 0.13, 6 0.1, b6 0.09
- intervals: repeat 0.15 (0.09–0.31), step 1–2 0.47 (0.35–0.57), skip 3–4 0.14 (0.1–0.25), leap 5–7 0.06 (0.04–0.13), octave 0 (0–0), descending share of moves 0.53 (0.5–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.07, 2-bar 0.1, 4-bar 0, longer 0.83

**arp** (2 songs, in 0.12 of songs)
- onsets/bar 6.5 (6.2–6.8); steps with P ≥ .5: 1,7,8,9; P ≥ .3: 1,3,5,6,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 3.6 (3–4.3), off-16th onset share 0.42 (0.37–0.47)
- length 0.91 (0.84–0.97) 16ths, gate (length ÷ gap to next onset) 0.58 (0.56–0.6)
- velocity mean 112 ± 10.9 (flat files 0); accents step 12 +5, step 9 +4, step 10 +4; weakest step 2 -11, step 14 -7
- register (MIDI, transposed to C) 70 (66–73)
- degrees (maj): 3 0.23, 1 0.18, 5 0.16, 2 0.14, 6 0.11, 4 0.07
- intervals: repeat 0.09 (0.07–0.1), step 1–2 0.49 (0.47–0.52), skip 3–4 0.28 (0.22–0.33), leap 5–7 0.11 (0.09–0.12), octave 0.01 (0–0.01), descending share of moves 0.48 (0.48–0.49)
- arp shape up 0.04, down 0.05, updown 0.45, random 0.47, static 0; spacing (16ths) {'1.0': 1, '2.0': 1}; octave span 0.62 (0.56–0.69)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**seq** (2 songs, in 0.12 of songs)
- onsets/bar 7 (4.5–9.5); steps with P ≥ .5: 1,13; P ≥ .3: 1,3,5,7,9,11,12,13,14,15
- syncopation: LHL/bar 0.8 (0.4–1.1), off-16th onset share 0.22 (0.11–0.32)
- length 4.28 (2.58–5.97) 16ths, gate (length ÷ gap to next onset) 0.92 (0.89–0.94)
- velocity mean 97 ± 12.6 (flat files 0); accents step 9 +18, step 3 +9, step 11 +9; weakest step 4 -14, step 8 -10
- register (MIDI, transposed to C) 62 (62–66)
- degrees (maj): 1 0.38, 3 0.25, 6 0.17, 5 0.08, 2 0.07, 4 0.02
- intervals: repeat 0.24 (0.12–0.35), step 1–2 0.13 (0.09–0.17), skip 3–4 0.13 (0.12–0.14), leap 5–7 0.27 (0.21–0.34), octave 0.04 (0.03–0.06), descending share of moves 0.52 (0.49–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.29, 4-bar 0, longer 0.71; rhythm only: 1-bar 0.29, 2-bar 0, 4-bar 0, longer 0.71

**drums** (16 songs with a usable kit; flat-velocity files 0.06)
- families: kick_4otf 0.25, kick_1_and_9_only 0.31, snare_backbeat_5_13 0.69, snare_halftime_9 0.06, hat_16ths 0.12, hat_8ths 0.38, hat_offbeat_only 0.06, hat_none 0.06
- kick: hits/bar 3.5 (3.1–3.9), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,8,9,11,13; vel 102 ± 3.3
- snare: hits/bar 2.1 (2–2.4), songs using 0.94, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 104 ± 4
- hat: hits/bar 7 (5.5–8.9), songs using 0.94, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,15,16; vel 74 ± 12.6
- perc: hits/bar 2 (0.3–9.9), songs using 0.62, P ≥ .5 at steps 13, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 72 ± 9.2
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.2 (0.1–1.1), songs using 0.31, P ≥ .5 at steps none, P ≥ .2 at none; vel 90 ± 6
- open-hat share of hat hits 0.13, ride share of cymbals 0.34, fill-bar share 0.04

