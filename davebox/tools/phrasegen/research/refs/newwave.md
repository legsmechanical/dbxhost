# NEW WAVE — reference statistics

**172 songs measured** (210 selected), 130 artists; sources {'lmd': 155, 'lamd': 17}; eras {'80s': 108, 'new': 31, '?': 23, '90s': 10}; era splits: {'80s': 108, 'new': 31}. Every table: `analysis/out/newwave_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **98 / 126 / 160**; file BPM q1/med/q3 100 / 120 / 135; minor share **0.28**.

## Findings

Bass 5 onsets/bar in 8ths, a backbeat + 8ths groove (kick 1 + 9 in 50 %, 4otf 25 %; 2000s revival 4otf 41 %). Minor 28 %, mixolydian 17 %. Minor loops i–VII, i–VI–VII, i–iv. Flavours: POST PUNK (92 songs: legato 8th bass, gate 1.0, fewer keys/pads, flatter files), GOTH (22: minor 50 %, sustained keys, legato bass), DARKWAVE (36: minor 56 %, bass repeated-note .63), SYNTHWAVE (12: minor 67 %, few guitars, i–VI–VII in sheets).

Flavours filed under this style: **POST PUNK** (92 songs), **GOTH** (22 songs), **DARKWAVE** (36 songs), **SYNTHWAVE** (12 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.89 (0.62–1.18). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.19 | 0.03 |
| i VII | 0.17 | 0.05 |
| i VI VII | 0.17 | 0.03 |
| i VI | 0.11 | 0.05 |
| i VII VI VII | 0.11 | 0.03 |
| i iv VII | 0.09 | 0.02 |
| i VII iv VII | 0.09 | 0.01 |
| VI VII iv | 0.09 | 0.01 |
| i IV | 0.09 | 0.02 |
| i VI VII VI | 0.09 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.25 | 0.06 |
| I IV I V | 0.17 | 0.03 |
| I IV V | 0.16 | 0.06 |
| I V IV | 0.15 | 0.05 |
| I V | 0.14 | 0.04 |
| I V IV V | 0.14 | 0.02 |
| I IV V IV | 0.12 | 0.01 |
| IV V | 0.12 | 0.03 |
| I vi IV V | 0.11 | 0.03 |
| I V I IV | 0.11 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 9263 songs, minor share 0.29; share of songs containing the loop ≥ 2×): I IV (maj) 0.2, I IV V (maj) 0.14, I IV V IV (maj) 0.13, I IV I V (maj) 0.13, I V IV (maj) 0.12, I V IV V (maj) 0.11, I V I IV (maj) 0.09, I vi IV V (maj) 0.08. By era: 80s (4487 songs, minor 0.28): I IV (maj) 0.21, I IV V (maj) 0.14, I IV V IV (maj) 0.13, I IV I V (maj) 0.12; new (3052 songs, minor 0.3): I IV (maj) 0.19, I IV I V (maj) 0.13, I V IV (maj) 0.13, I IV V (maj) 0.13

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (168 songs, in 0.98 of songs)
- onsets/bar 5 (4–8); steps with P ≥ .5: 1,5,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.4 (0.1–1.5), off-16th onset share 0.01 (0–0.19)
- length 1.94 (1.33–2.64) 16ths, gate (length ÷ gap to next onset) 0.81 (0.65–0.96)
- velocity mean 98 ± 8.1 (flat files 0.3); accents step 1 +2, step 9 +1, step 5 +0; weakest step 6 -6, step 14 -4
- register (MIDI, transposed to C) 36 (33–38)
- degrees (maj): 1 0.28, 5 0.22, 4 0.15, 2 0.1, 6 0.09, 3 0.06
- intervals: repeat 0.46 (0.25–0.74), step 1–2 0.14 (0.08–0.26), skip 3–4 0.05 (0.02–0.11), leap 5–7 0.13 (0.05–0.23), octave 0.01 (0–0.06), descending share of moves 0.49 (0.43–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.06, 4-bar 0.14, longer 0.8; rhythm only: 1-bar 0.25, 2-bar 0.05, 4-bar 0.07, longer 0.63

**chord** (41 songs, in 0.24 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,5; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (0.8–3.1), off-16th onset share 0.21 (0–0.36)
- length 0.92 (0.61–2) 16ths, gate (length ÷ gap to next onset) 0.5 (0.34–0.67)
- velocity mean 85 ± 13.8 (flat files 0.27); accents step 16 +2, step 12 +2, step 14 +2; weakest step 2 -8, step 6 -6
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 1 0.23, 5 0.22, 4 0.12, 3 0.12, 2 0.1, 6 0.08
- chords: voices 2.3 (2–2.8), spread 7 st, inversion share 0.75 (0.4–0.99), changes/bar 1.33 (0.98–1.97), qualities pow 0.57, maj 0.32, min 0.09, maj7 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.08, 4-bar 0.19, longer 0.71; rhythm only: 1-bar 0.11, 2-bar 0.13, 4-bar 0.12, longer 0.64

**pad** (107 songs, in 0.62 of songs)
- onsets/bar 1 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0–1.3), off-16th onset share 0.01 (0–0.12)
- length 8 (3.75–15.91) 16ths, gate (length ÷ gap to next onset) 0.98 (0.91–1)
- velocity mean 83 ± 10.4 (flat files 0.25); accents step 4 +4, step 10 +4, step 14 +2; weakest step 2 -1, step 7 -0
- register (MIDI, transposed to C) 64 (60–68)
- degrees (maj): 1 0.22, 5 0.16, 2 0.13, 3 0.13, 4 0.11, 6 0.1
- chords: voices 2.6 (2.1–3.1), spread 8 st, inversion share 0.49 (0.2–0.75), changes/bar 0.99 (0.84–1.39), qualities maj 0.44, pow 0.34, min 0.16, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.2, longer 0.77; rhythm only: 1-bar 0.23, 2-bar 0.03, 4-bar 0.09, longer 0.65

**keys** (110 songs, in 0.64 of songs)
- onsets/bar 4 (2.2–7); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.1–2.2), off-16th onset share 0.06 (0–0.26)
- length 2.13 (1.01–4.09) 16ths, gate (length ÷ gap to next onset) 0.93 (0.57–1)
- velocity mean 84 ± 12.7 (flat files 0.26); accents step 13 +2, step 1 +1, step 9 +1; weakest step 2 -4, step 12 -2
- register (MIDI, transposed to C) 64 (60–68)
- degrees (maj): 1 0.24, 5 0.18, 4 0.11, 3 0.11, 2 0.1, 6 0.1
- chords: voices 3 (2.5–3.2), spread 8 st, inversion share 0.51 (0.33–0.69), changes/bar 1.41 (1.02–2.19), qualities maj 0.49, pow 0.26, min 0.15, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.06, 4-bar 0.14, longer 0.78; rhythm only: 1-bar 0.22, 2-bar 0.07, 4-bar 0.09, longer 0.62

**guitar** (142 songs, in 0.83 of songs)
- onsets/bar 7 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.1–2.4), off-16th onset share 0.02 (0–0.3)
- length 1.68 (0.88–2) 16ths, gate (length ÷ gap to next onset) 0.81 (0.42–1)
- velocity mean 82 ± 12.1 (flat files 0.25); accents step 1 +3, step 13 +2, step 5 +2; weakest step 6 -6, step 2 -4
- register (MIDI, transposed to C) 57 (53–60)
- degrees (maj): 1 0.27, 5 0.21, 4 0.11, 2 0.11, 3 0.1, 6 0.09
- chords: voices 2.8 (2.1–3), spread 8 st, inversion share 0.48 (0.07–0.77), changes/bar 0.89 (0.43–1.65), qualities pow 0.46, maj 0.33, min 0.15, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.04, 4-bar 0.17, longer 0.75; rhythm only: 1-bar 0.33, 2-bar 0.04, 4-bar 0.06, longer 0.56

**lead** (145 songs, in 0.84 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.5–3), off-16th onset share 0.05 (0–0.23)
- length 1.96 (1.5–2.45) 16ths, gate (length ÷ gap to next onset) 0.83 (0.67–0.97)
- velocity mean 103 ± 8.8 (flat files 0.3); accents step 9 +1, step 1 +1, step 6 +1; weakest step 2 -2, step 4 -1
- register (MIDI, transposed to C) 69 (67–72)
- degrees (maj): 1 0.21, 5 0.18, 3 0.14, 2 0.12, 6 0.1, 4 0.09
- intervals: repeat 0.24 (0.13–0.41), step 1–2 0.41 (0.28–0.52), skip 3–4 0.15 (0.08–0.2), leap 5–7 0.08 (0.03–0.11), octave 0 (0–0.01), descending share of moves 0.55 (0.49–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.03, 4-bar 0.06, longer 0.89; rhythm only: 1-bar 0.08, 2-bar 0.03, 4-bar 0.05, longer 0.85

**arp** (18 songs, in 0.1 of songs)
- onsets/bar 7.8 (7–8.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,11,13,15
- syncopation: LHL/bar 2.9 (1.6–4), off-16th onset share 0.3 (0.16–0.47)
- length 0.98 (0.78–1.04) 16ths, gate (length ÷ gap to next onset) 0.68 (0.5–0.96)
- velocity mean 92 ± 13.2 (flat files 0.22); accents step 9 +3, step 1 +2, step 15 +1; weakest step 16 -4, step 8 -2
- register (MIDI, transposed to C) 72 (66–75)
- degrees (maj): 1 0.25, 5 0.23, 2 0.12, 4 0.1, 3 0.08, 7 0.06
- intervals: repeat 0.11 (0.06–0.3), step 1–2 0.22 (0.06–0.44), skip 3–4 0.23 (0.14–0.33), leap 5–7 0.24 (0.11–0.33), octave 0 (0–0.03), descending share of moves 0.5 (0.47–0.55)
- arp shape up 0.1, down 0.09, updown 0.13, random 0.66, static 0.03; spacing (16ths) {'2.0': 9, '1.0': 6, '1.25': 1, '1.5': 1}; octave span 0.71 (0.58–0.92)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.29, 4-bar 0.15, longer 0.56; rhythm only: 1-bar 0.37, 2-bar 0.12, 4-bar 0.05, longer 0.47

**seq** (38 songs, in 0.22 of songs)
- onsets/bar 6 (3–10); steps with P ≥ .5: 1,7; P ≥ .3: 1,3,4,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 2 (0.8–3.2), off-16th onset share 0.33 (0.06–0.47)
- length 0.96 (0.57–2) 16ths, gate (length ÷ gap to next onset) 0.66 (0.48–0.96)
- velocity mean 87 ± 10.8 (flat files 0.32); accents step 1 +3, step 13 +1, step 5 +1; weakest step 10 -2, step 2 -0
- register (MIDI, transposed to C) 62 (60–64)
- degrees (maj): 1 0.3, 5 0.22, 4 0.14, 6 0.11, 2 0.08, 3 0.07
- intervals: repeat 0.47 (0.16–0.71), step 1–2 0.17 (0.05–0.34), skip 3–4 0.1 (0.04–0.17), leap 5–7 0.07 (0.01–0.17), octave 0 (0–0.01), descending share of moves 0.5 (0.4–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.06, 4-bar 0.2, longer 0.72; rhythm only: 1-bar 0.27, 2-bar 0.07, 4-bar 0.03, longer 0.63

**fx** (17 songs, in 0.1 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1,13; P ≥ .3: 1,7,9,11,13
- syncopation: LHL/bar 0.8 (0.5–1.8), off-16th onset share 0 (0–0.21)
- length 4.37 (0.93–9) 16ths, gate (length ÷ gap to next onset) 0.9 (0.67–1)
- velocity mean 81 ± 10.7 (flat files 0.35); accents step 16 +6, step 15 +6, step 3 +3; weakest step 8 -10, step 4 -4
- register (MIDI, transposed to C) 72 (71–75)
- degrees (maj): 1 0.24, 5 0.17, 2 0.14, 6 0.1, 4 0.09, 3 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.17, 4-bar 0, longer 0.83; rhythm only: 1-bar 0.26, 2-bar 0.03, 4-bar 0, longer 0.72

**drums** (155 songs with a usable kit; flat-velocity files 0.15)
- families: kick_4otf 0.24, kick_1_and_9_only 0.5, snare_backbeat_5_13 0.6, snare_halftime_9 0.03, hat_16ths 0.1, hat_8ths 0.44, hat_offbeat_only 0, hat_none 0.1
- kick: hits/bar 3.7 (2.7–4), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13; vel 107 ± 5
- snare: hits/bar 2 (1.4–2.1), songs using 0.9, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 108 ± 3.9
- hat: hits/bar 7.5 (4.3–8), songs using 0.89, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 77 ± 12.3
- perc: hits/bar 0.5 (0–4.7), songs using 0.48, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 78 ± 12.2
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel 58 ± 11.5
- cymb: hits/bar 0.3 (0.1–0.8), songs using 0.44, P ≥ .5 at steps none, P ≥ .2 at 1; vel 82 ± 8.2
- open-hat share of hat hits 0.11, ride share of cymbals 0.29, fill-bar share 0.06

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 108 | 98 / 125 / 160 | 0.29 | 5 (4–8) | 0.81 (0.62–0.95) | 0.43 (0.3–0.52) | 0.62 | 0.08 | 0.24 | 0.09 | i iv (0.26) |
| new | 31 | 99 / 125 / 146 | 0.26 | 4 (4–6.5) | 0.77 (0.56–0.96) | 0.34 (0.26–0.48) | 0.65 | 0.16 | 0.41 | 0.1 | i VI VII VI (0.29) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### POST PUNK (92 songs, 33 artists; sources {'lmd': 56, 'lamd': 10, 'freemidi': 26}; distinctness 0.42)

The flat-velocity, legato version of new wave: bass gate 1.0 on steady 8ths, guitar 8 onsets/bar gate 1.0, pads/keys rarer, 41 % flat files. Minor loops i–III, i–III–VI–VII, i–VI–VII.

Tempo p10/p50/p90 105 / 132 / 160; minor share 0.37.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| pad_len16 | 13.23 | 8 | +5.23 |
| drum_flat_share | 0.41 | 0.15 | +0.26 |
| keys_presence | 0.42 | 0.64 | -0.22 |
| pad_presence | 0.41 | 0.62 | -0.21 |
| bass_gate | 1 | 0.81 | +0.19 |
| guitar_gate | 1 | 0.81 | +0.19 |
| drum_hat_8ths | 0.28 | 0.44 | -0.16 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i III | 0.21 | 0.05 |
| i III VI VII | 0.15 | 0.02 |
| i VI VII | 0.15 | 0.03 |
| i iv III VII | 0.15 | 0.05 |
| i III iv | 0.15 | 0.02 |
| i VI | 0.12 | 0.03 |
| i VI iv | 0.12 | 0.04 |
| i VII | 0.12 | 0.03 |
| i iv | 0.12 | 0.02 |
| VI iv | 0.09 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.23 | 0.1 |
| I IV V | 0.14 | 0.04 |
| I V | 0.14 | 0.04 |
| I IV V IV | 0.12 | 0.02 |
| I IV I V | 0.12 | 0.02 |
| I V I IV | 0.12 | 0.02 |
| IV V | 0.1 | 0.02 |
| I V IV | 0.1 | 0.03 |
| I V IV V | 0.1 | 0.01 |
| IV V vi V | 0.09 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 3559 songs, minor share 0.32; share of songs containing the loop ≥ 2×): I IV (maj) 0.17, I IV V IV (maj) 0.1, I V IV (maj) 0.09, I IV V (maj) 0.09, I IV I V (maj) 0.07, I V IV V (maj) 0.06, IV V (maj) 0.06, I V I IV (maj) 0.05. By era: 80s (1241 songs, minor 0.3): I IV (maj) 0.18, I IV V IV (maj) 0.1, I IV V (maj) 0.1, I IV I V (maj) 0.08; new (1732 songs, minor 0.34): I IV (maj) 0.17, I IV V IV (maj) 0.1, I V IV (maj) 0.09, I IV V (maj) 0.08

**bass** (87 songs, in 0.95 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.4 (0–1.3), off-16th onset share 0 (0–0.03)
- length 2 (1.85–2) 16ths, gate (length ÷ gap to next onset) 1 (0.87–1)
- velocity mean 97 ± 8.1 (flat files 0.6); accents step 4 +2, step 1 +2, step 5 +1; weakest step 2 -14, step 6 -10
- register (MIDI, transposed to C) 36 (35–38)
- degrees (maj): 1 0.3, 5 0.19, 4 0.17, 2 0.11, 6 0.08, 3 0.07
- intervals: repeat 0.5 (0.26–0.76), step 1–2 0.12 (0.07–0.23), skip 3–4 0.05 (0.02–0.11), leap 5–7 0.08 (0.03–0.21), octave 0.01 (0–0.05), descending share of moves 0.5 (0.46–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.04, 4-bar 0.25, longer 0.67; rhythm only: 1-bar 0.31, 2-bar 0.07, 4-bar 0.11, longer 0.51

**chord** (12 songs, in 0.13 of songs)
- onsets/bar 5.8 (2.8–6.5); steps with P ≥ .5: 9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.4–3), off-16th onset share 0.02 (0–0.23)
- length 1.73 (0.94–2.25) 16ths, gate (length ÷ gap to next onset) 0.74 (0.51–0.98)
- velocity mean 99 ± 11.6 (flat files 0.25); accents step 1 +4, step 7 +4, step 11 +2; weakest step 6 -17, step 10 -14
- register (MIDI, transposed to C) 64 (62–68)
- degrees (maj): 3 0.23, 1 0.15, 2 0.14, 5 0.14, 6 0.1, 4 0.07
- chords: voices 2.2 (2–2.4), spread 4 st, inversion share 0.05 (0–0.87), changes/bar 1.22 (0.77–2.15), qualities pow 0.72, maj 0.19, min 0.05, dim 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.22, 4-bar 0.13, longer 0.64; rhythm only: 1-bar 0.22, 2-bar 0.13, 4-bar 0.17, longer 0.48

**pad** (38 songs, in 0.41 of songs)
- onsets/bar 1 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1
- syncopation: LHL/bar 0.3 (0–1.7), off-16th onset share 0 (0–0.08)
- length 13.23 (3.11–16) 16ths, gate (length ÷ gap to next onset) 1 (0.97–1)
- velocity mean 89 ± 9.4 (flat files 0.5); accents step 2 +16, step 6 +8, step 10 +5; weakest step 11 -3, step 3 -3
- register (MIDI, transposed to C) 60 (58–64)
- degrees (maj): 1 0.18, 5 0.16, 3 0.13, 2 0.12, 6 0.12, 4 0.11
- chords: voices 2.7 (2–3), spread 12 st, inversion share 0.34 (0.2–0.73), changes/bar 1.05 (0.87–1.44), qualities maj 0.46, pow 0.28, min 0.17, sus 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.06, 4-bar 0.25, longer 0.69; rhythm only: 1-bar 0.24, 2-bar 0.06, 4-bar 0.17, longer 0.53

**keys** (39 songs, in 0.42 of songs)
- onsets/bar 4 (2–5.5); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.1–2.4), off-16th onset share 0 (0–0.06)
- length 3 (2–5.74) 16ths, gate (length ÷ gap to next onset) 0.97 (0.74–1)
- velocity mean 93 ± 9.8 (flat files 0.31); accents step 10 +3, step 6 +2, step 3 +2; weakest step 12 -4, step 16 -4
- register (MIDI, transposed to C) 65 (62–71)
- degrees (maj): 1 0.19, 5 0.15, 2 0.14, 3 0.14, 4 0.11, 6 0.11
- chords: voices 2.5 (2–3), spread 8 st, inversion share 0.4 (0.05–0.73), changes/bar 1.34 (0.92–2.64), qualities pow 0.38, maj 0.33, min 0.23, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0.02, 4-bar 0.21, longer 0.68; rhythm only: 1-bar 0.24, 2-bar 0.1, 4-bar 0.13, longer 0.54

**guitar** (83 songs, in 0.9 of songs)
- onsets/bar 8 (6–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.1–2.1), off-16th onset share 0.04 (0–0.29)
- length 1.98 (1.05–2) 16ths, gate (length ÷ gap to next onset) 1 (0.88–1)
- velocity mean 92 ± 10.2 (flat files 0.51); accents step 1 +2, step 4 +0, step 7 +0; weakest step 16 -1, step 6 -1
- register (MIDI, transposed to C) 58 (53–62)
- degrees (maj): 1 0.32, 5 0.19, 2 0.12, 4 0.11, 3 0.1, 6 0.08
- chords: voices 3 (2.4–3.7), spread 12 st, inversion share 0.31 (0–0.57), changes/bar 1.21 (0.64–1.8), qualities pow 0.55, maj 0.26, min 0.13, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.03, 4-bar 0.28, longer 0.62; rhythm only: 1-bar 0.39, 2-bar 0.08, 4-bar 0.14, longer 0.4

**lead** (65 songs, in 0.71 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.2–3.1), off-16th onset share 0.03 (0–0.16)
- length 2.35 (1.97–3.97) 16ths, gate (length ÷ gap to next onset) 0.97 (0.77–1)
- velocity mean 95 ± 10.7 (flat files 0.45); accents step 13 +1, step 1 +1, step 9 +0; weakest step 4 -3, step 2 -3
- register (MIDI, transposed to C) 65 (63–67)
- degrees (maj): 1 0.2, 3 0.19, 5 0.18, 2 0.12, 6 0.11, 4 0.09
- intervals: repeat 0.33 (0.16–0.46), step 1–2 0.42 (0.3–0.53), skip 3–4 0.13 (0.07–0.19), leap 5–7 0.05 (0.01–0.1), octave 0 (0–0), descending share of moves 0.53 (0.48–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.08, longer 0.86; rhythm only: 1-bar 0.07, 2-bar 0.07, 4-bar 0.04, longer 0.82

**arp** (9 songs, in 0.1 of songs)
- onsets/bar 8 (7–9); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,8,9,10,11,12,13,14,15
- syncopation: LHL/bar 1.8 (1.3–3.5), off-16th onset share 0.23 (0.18–0.46)
- length 1.27 (1–1.96) 16ths, gate (length ÷ gap to next onset) 1 (0.95–1)
- velocity mean 88 ± 13.6 (flat files 0.56); accents step 5 +6, step 12 +6, step 1 +4; weakest step 2 -5, step 10 -4
- register (MIDI, transposed to C) 68 (65–74)
- degrees (maj): 1 0.22, 3 0.14, 5 0.14, 2 0.13, 4 0.12, 6 0.11
- intervals: repeat 0 (0–0.05), step 1–2 0.38 (0.22–0.51), skip 3–4 0.32 (0.2–0.45), leap 5–7 0.14 (0.06–0.27), octave 0.01 (0–0.02), descending share of moves 0.5 (0.47–0.56)
- arp shape up 0.05, down 0.08, updown 0.24, random 0.63, static 0; spacing (16ths) {'2.0': 5, '1.0': 3, '1.5': 1}; octave span 0.75 (0.58–0.79)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.14, 4-bar 0.14, longer 0.71; rhythm only: 1-bar 0.16, 2-bar 0.14, 4-bar 0.14, longer 0.55

**seq** (13 songs, in 0.14 of songs)
- onsets/bar 8 (4–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,7,9,10,11,12,13,15
- syncopation: LHL/bar 0.6 (0.1–2), off-16th onset share 0.03 (0–0.4)
- length 1 (0.93–2) 16ths, gate (length ÷ gap to next onset) 0.67 (0.49–1)
- velocity mean 101 ± 6.3 (flat files 0.54); accents step 3 +2, step 11 +1, step 15 +1; weakest step 6 -31, step 14 -31
- register (MIDI, transposed to C) 53 (48–55)
- degrees (maj): 1 0.24, 5 0.23, 6 0.18, 4 0.15, 2 0.1, 3 0.05
- intervals: repeat 0.44 (0.22–0.71), step 1–2 0.18 (0.03–0.35), skip 3–4 0 (0–0.05), leap 5–7 0.07 (0.03–0.2), octave 0 (0–0.05), descending share of moves 0.5 (0.5–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.15, 2-bar 0.01, 4-bar 0.29, longer 0.54; rhythm only: 1-bar 0.39, 2-bar 0.01, 4-bar 0.1, longer 0.5

**drums** (87 songs with a usable kit; flat-velocity files 0.41)
- families: kick_4otf 0.18, kick_1_and_9_only 0.4, snare_backbeat_5_13 0.63, snare_halftime_9 0.05, hat_16ths 0.06, hat_8ths 0.28, hat_offbeat_only 0.02, hat_none 0.1
- kick: hits/bar 3.8 (3–4.3), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13,15; vel 103 ± 4
- snare: hits/bar 2 (1.9–2.2), songs using 0.93, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 108 ± 5.4
- hat: hits/bar 5.8 (3.5–7.6), songs using 0.9, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 86 ± 9.4
- perc: hits/bar 0 (0–3.7), songs using 0.38, P ≥ .5 at steps none, P ≥ .2 at 1,5,9,11,13; vel 71 ± 11.2
- tom: hits/bar 0 (0–0), songs using 0.1, P ≥ .5 at steps none, P ≥ .2 at none; vel 79 ± 3.4
- cymb: hits/bar 0.3 (0.1–1.1), songs using 0.53, P ≥ .5 at steps none, P ≥ .2 at 1; vel 86 ± 12.4
- open-hat share of hat hits 0.16, ride share of cymbals 0.23, fill-bar share 0.08

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 39 | 103 / 128 / 155 | 0.33 | 5.5 (4–7) | 0.94 (0.79–1) | 0.41 (0.33–0.47) | 0.59 | 0.15 | 0.28 | 0.11 | i III i VI (0.23) |
| new | 50 | 106 / 138 / 162 | 0.4 | 7 (4.2–8) | 1 (0.98–1) | 0.36 (0.23–0.56) | 0.28 | 0.06 | 0.12 | 0.02 | i III (0.25) |

### GOTH (22 songs, 16 artists; sources {'lmd': 9, 'freemidi': 6, 'lamd': 7}; distinctness 0.61)

Small (22 songs: Sisters of Mercy, The Cult, Bauhaus, Siouxsie, The Mission, Christian Death, Love and Rockets…). Minor 50 % vs parent 28 %, keys as long held notes (14.5 16ths) rather than comping, bass legato 8ths. Chord sheets (375): I–IV, i–VI, i–VII–VI–VII.

Tempo p10/p50/p90 101 / 127 / 145; minor share 0.5.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| keys_len16 | 14.53 | 2.13 | +12.40 |
| pad_presence | 0.27 | 0.62 | -0.35 |
| keys_offbeat16_share | 0.38 | 0.06 | +0.32 |
| drum_flat_share | 0.43 | 0.15 | +0.28 |
| keys_presence | 0.41 | 0.64 | -0.23 |
| keys_onsets_per_bar | 1 | 4 | -3.00 |
| minor_share | 0.5 | 0.28 | +0.22 |
| guitar_loop_1bar_rhythm | 0.11 | 0.33 | -0.22 |
| bass_gate | 0.98 | 0.81 | +0.17 |
| lead_gate | 1 | 0.83 | +0.17 |
| guitar_gate | 0.98 | 0.81 | +0.17 |
| bass_onsets_per_bar | 7.2 | 5 | +2.20 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.36 | 0.26 |
| i iv v iv | 0.18 | 0.01 |
| i VII | 0.09 | 0.01 |
| i VII i III | 0.09 | 0.01 |
| i III VII | 0.09 | 0.01 |
| i III VII III | 0.09 | 0.1 |
| III VII | 0.09 | 0.01 |
| i III VII VI | 0.09 | 0.01 |
| i VII VI | 0.09 | 0.01 |
| i VII i VI | 0.09 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V bVII IV | 0.3 | 0.12 |
| I bIII IV | 0.2 | 0.05 |
| I IV V IV | 0.2 | 0.01 |
| I V IV | 0.2 | 0.07 |
| I IV bVII IV | 0.2 | 0.01 |
| I ii IV | 0.2 | 0.03 |
| I bIII V IV | 0.1 | 0.02 |
| I bIII IV V | 0.1 | 0.02 |
| IV V IV bIII | 0.1 | 0.01 |
| I bIII bVII IV | 0.1 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 375 songs, minor share 0.45; share of songs containing the loop ≥ 2×): I IV (maj) 0.12, i VI (min) 0.08, I vi (maj) 0.06, i VI VII (min) 0.06, i VII VI VII (min) 0.06, IV V (maj) 0.05, I V vi IV (maj) 0.05, I IV V IV (maj) 0.05. By era: 80s (132 songs, minor 0.51): I IV (maj) 0.11, i VI (min) 0.09, IV V (maj) 0.06, I bVII (maj) 0.05; new (198 songs, minor 0.44): I IV (maj) 0.12, I vi (maj) 0.09, i VI VII (min) 0.08, i VI (min) 0.08

**bass** (20 songs, in 0.91 of songs)
- onsets/bar 7.2 (5.1–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.1–1.3), off-16th onset share 0 (0–0.02)
- length 1.98 (1.81–2) 16ths, gate (length ÷ gap to next onset) 0.98 (0.85–1)
- velocity mean 94 ± 10.3 (flat files 0.55); accents step 14 +8, step 10 +4, step 1 +2; weakest step 12 -18, step 16 -3
- register (MIDI, transposed to C) 39 (36–41)
- degrees (min): 1 0.39, 4 0.14, b3 0.14, 5 0.11, b7 0.08, b6 0.07
- intervals: repeat 0.59 (0.47–0.8), step 1–2 0.15 (0.08–0.19), skip 3–4 0.07 (0.02–0.13), leap 5–7 0.07 (0.05–0.14), octave 0 (0–0.01), descending share of moves 0.48 (0.44–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.04, 4-bar 0.21, longer 0.67; rhythm only: 1-bar 0.3, 2-bar 0.02, 4-bar 0.09, longer 0.59

**chord** (3 songs, in 0.14 of songs)
- onsets/bar 3 (3–5.5); steps with P ≥ .5: 11,13,15; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (1.5–2.7), off-16th onset share 0 (0–0)
- length 1.25 (1–1.62) 16ths, gate (length ÷ gap to next onset) 0.62 (0.43–0.81)
- velocity mean 76 ± 14.7 (flat files 0.67); accents step 15 +6, step 11 +5, step 3 +2; weakest step 9 -4, step 1 -3
- register (MIDI, transposed to C) 66 (60–72)
- degrees (min): 1 1, b2 0, 2 0, b3 0, 3 0, 4 0
- chords: voices 2 (2–2), spread 7 st, inversion share 0.42 (0.23–0.62), changes/bar 0.07 (0.04–1.04), qualities pow 1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0, 4-bar 0, longer 0.92; rhythm only: 1-bar 0.08, 2-bar 0, 4-bar 0, longer 0.92

**pad** (6 songs, in 0.27 of songs)
- onsets/bar 3.5 (1.2–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,9,11,13,15
- syncopation: LHL/bar 1.5 (0.8–2.5), off-16th onset share 0.11 (0.01–0.28)
- length 4.64 (1.11–13.94) 16ths, gate (length ÷ gap to next onset) 0.86 (0.56–0.99)
- velocity mean 80 ± 10.3 (flat files 0.5); accents step 11 +3, step 3 +3, step 7 +2; weakest step 6 -9, step 4 -8
- register (MIDI, transposed to C) 66 (60–70)
- degrees (min): 1 0.5, 4 0.25, 5 0.25, b2 0, 2 0, b3 0
- chords: voices 2 (2–2.1), spread 7 st, inversion share 0.92 (0.75–0.96), changes/bar 1.56 (0.9–2.24), qualities pow 0.6, maj 0.31, min 0.08, sus 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0, 4-bar 0.17, longer 0.8; rhythm only: 1-bar 0.37, 2-bar 0, 4-bar 0.06, longer 0.58

**keys** (9 songs, in 0.41 of songs)
- onsets/bar 1 (1–5); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0.1–4), off-16th onset share 0.38 (0.01–0.59)
- length 14.53 (1–15.15) 16ths, gate (length ÷ gap to next onset) 0.99 (0.86–1)
- velocity mean 96 ± 16 (flat files 0.56); accents step 9 +11, step 12 +10, step 14 +7; weakest step 3 -16, step 2 -15
- register (MIDI, transposed to C) 64 (60–66)
- degrees (min): 1 0.47, b3 0.2, 4 0.16, b6 0.11, 5 0.03, b7 0.03
- chords: voices 2.7 (2.3–3.7), spread 8 st, inversion share 0.22 (0.15–0.23), changes/bar 1.4 (1.19–1.48), qualities pow 0.52, maj 0.31, min 0.06, min7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.06, longer 0.94; rhythm only: 1-bar 0.17, 2-bar 0.06, 4-bar 0.04, longer 0.73

**guitar** (18 songs, in 0.82 of songs)
- onsets/bar 5 (4–6.8); steps with P ≥ .5: 1,3,5,7,9,11,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.8 (1–2.8), off-16th onset share 0.02 (0–0.13)
- length 2 (1.97–2) 16ths, gate (length ÷ gap to next onset) 0.98 (0.88–1)
- velocity mean 88 ± 12.7 (flat files 0.44); accents step 13 +3, step 15 +2, step 9 +1; weakest step 14 -12, step 2 -11
- register (MIDI, transposed to C) 58 (55–63)
- degrees (min): 1 0.19, b3 0.19, 5 0.15, b7 0.13, 2 0.12, b6 0.09
- chords: voices 2.9 (2–3), spread 12 st, inversion share 0.09 (0–0.84), changes/bar 1.06 (0.55–1.81), qualities pow 0.67, maj 0.27, min 0.06, sus 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.07, 4-bar 0.23, longer 0.66; rhythm only: 1-bar 0.11, 2-bar 0.13, 4-bar 0.18, longer 0.58

**lead** (15 songs, in 0.68 of songs)
- onsets/bar 4 (3–5.5); steps with P ≥ .5: 1,3,5,11; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.7 (0.9–3), off-16th onset share 0.03 (0–0.16)
- length 2 (1.4–2) 16ths, gate (length ÷ gap to next onset) 1 (0.68–1)
- velocity mean 110 ± 6.7 (flat files 0.67); accents step 4 +2, step 14 +2, step 6 +1; weakest step 10 -4, step 16 -2
- register (MIDI, transposed to C) 63 (60–67)
- degrees (min): 1 0.32, b3 0.18, 5 0.15, 4 0.09, 2 0.07, b2 0.06
- intervals: repeat 0.39 (0.19–0.46), step 1–2 0.36 (0.23–0.46), skip 3–4 0.18 (0.06–0.24), leap 5–7 0.08 (0.02–0.11), octave 0 (0–0.06), descending share of moves 0.55 (0.5–0.61)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0, 4-bar 0.03, longer 0.88; rhythm only: 1-bar 0.09, 2-bar 0, 4-bar 0.03, longer 0.88

**arp** (2 songs, in 0.09 of songs)
- onsets/bar 16 (16–16); steps with P ≥ .5: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.2 (0.1–0.3), off-16th onset share 0.5 (0.5–0.5)
- length 1 (1–1) 16ths, gate (length ÷ gap to next onset) 1 (1–1)
- velocity mean – ± – (flat files 1); accents ; weakest 
- register (MIDI, transposed to C) 54 (50–57)
- degrees (min): 1 0.56, 4 0.17, 5 0.17, b7 0.1, b2 0, 2 0
- intervals: repeat 0 (0–0), step 1–2 0.21 (0.12–0.31), skip 3–4 0.08 (0.05–0.11), leap 5–7 0.42 (0.31–0.53), octave 0.12 (0.1–0.13), descending share of moves 0.48 (0.48–0.48)
- arp shape up 0, down 0, updown 0, random 1, static 0; spacing (16ths) {'1.0': 2}; octave span 1.21 (1.1–1.31)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.5, 2-bar 0, 4-bar 0, longer 0.5

**seq** (3 songs, in 0.14 of songs)
- onsets/bar 6 (3.5–6); steps with P ≥ .5: 1,11; P ≥ .3: 1,5,9,11,15
- syncopation: LHL/bar 1.3 (0.7–2.5), off-16th onset share 0 (0–0.25)
- length 2 (1.5–9) 16ths, gate (length ÷ gap to next onset) 1 (0.97–1)
- velocity mean 110 ± 18.3 (flat files 0.33); accents step 4 +19, step 8 +19, step 12 +19; weakest step 9 -20, step 1 -18
- register (MIDI, transposed to C) 63 (59–70)
- degrees (min): b7 0.29, 1 0.25, 5 0.25, b3 0.1, b6 0.08, 6 0.02
- intervals: repeat 0.32 (0.2–0.45), step 1–2 0.21 (0.11–0.32), skip 3–4 0.28 (0.14–0.42), leap 5–7 0.12 (0.06–0.18), octave 0.06 (0.03–0.09), descending share of moves 0.44 (0.39–0.5)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 1, 2-bar 0, 4-bar 0, longer 0

**drums** (23 songs with a usable kit; flat-velocity files 0.43)
- families: kick_4otf 0.17, kick_1_and_9_only 0.56, snare_backbeat_5_13 0.52, snare_halftime_9 0.04, hat_16ths 0.09, hat_8ths 0.35, hat_offbeat_only 0.09, hat_none 0.13
- kick: hits/bar 2.4 (2–3.4), songs using 0.91, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,9,13; vel 114 ± 5.2
- snare: hits/bar 1.9 (1.6–2.1), songs using 0.91, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 108 ± 9.9
- hat: hits/bar 6.8 (1.7–8), songs using 0.87, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 85 ± 4.8
- perc: hits/bar 0 (0–4.4), songs using 0.43, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 70 ± 12.4
- tom: hits/bar 0 (0–0), songs using 0.13, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.2 (0.1–1.7), songs using 0.43, P ≥ .5 at steps none, P ≥ .2 at 1; vel 74 ± 11.9
- open-hat share of hat hits 0.23, ride share of cymbals 0.24, fill-bar share 0.08

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 17 | 100 / 127 / 142 | 0.65 | 7.8 (5.9–8) | 1 (0.94–1) | 0.3 (0.19–0.4) | 0.12 | 0.06 | 0.18 | 0.12 | i iv (0.36) |

### DARKWAVE (36 songs, 22 artists; sources {'lmd': 25, 'lamd': 11}; distinctness 0.39)

36 songs, but label noise is high (French pop — Mylène Farmer, Indochine — and German gothic acts dominate the tag evidence). Minor 56 %, bass repeated-note share .63 on 8ths, keys busier. Chord sheets (517): i–VI–VII 8.5 %.

Tempo p10/p50/p90 100 / 122 / 145; minor share 0.56.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| minor_share | 0.56 | 0.28 | +0.28 |
| drum_flat_share | 0.4 | 0.15 | +0.24 |
| bass_iv_repeat | 0.63 | 0.46 | +0.17 |
| guitar_gate | 0.97 | 0.81 | +0.16 |
| guitar_presence | 0.67 | 0.83 | -0.16 |
| lead_gate | 0.98 | 0.83 | +0.15 |
| keys_onsets_per_bar | 6 | 4 | +2.00 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.15 | 0.05 |
| III iv | 0.15 | 0.03 |
| i III VI iv | 0.15 | 0.01 |
| i VII | 0.15 | 0.05 |
| i iv i V | 0.1 | 0.01 |
| i iv VII | 0.1 | 0.01 |
| i VI VII | 0.1 | 0.02 |
| i VI VII V | 0.1 | 0.04 |
| i v IV III | 0.05 | 0.01 |
| III IV v IV | 0.05 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V IV | 0.19 | 0.04 |
| I IV | 0.19 | 0.06 |
| I V bVII IV | 0.19 | 0.04 |
| I vi IV | 0.12 | 0.02 |
| I IV V | 0.12 | 0.06 |
| I V vi V | 0.12 | 0.01 |
| I vi ii IV | 0.06 | 0.02 |
| I ii IV vi | 0.06 | 0.01 |
| I ii IV | 0.06 | 0.01 |
| I ii V vi | 0.06 | 0 |

Chord-sheet cross-check (Chordonomicon, 517 songs, minor share 0.53; share of songs containing the loop ≥ 2×): I IV (maj) 0.12, i VI VII (min) 0.09, I IV V (maj) 0.08, i VI (min) 0.07, I IV V IV (maj) 0.06, I V IV (maj) 0.06, i iv (min) 0.06, i VII VI VII (min) 0.06. By era: 80s (112 songs, minor 0.6): I IV (maj) 0.11, i VI (min) 0.09, I ii (maj) 0.06, i VII VI VII (min) 0.06; new (307 songs, minor 0.54): I IV (maj) 0.11, i VI VII (min) 0.09, I IV V (maj) 0.09, I IV I V (maj) 0.07

**bass** (30 songs, in 0.83 of songs)
- onsets/bar 6 (4–7.5); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.4 (0.2–1.9), off-16th onset share 0.02 (0–0.18)
- length 1.98 (1.64–2.16) 16ths, gate (length ÷ gap to next onset) 0.94 (0.66–1)
- velocity mean 99 ± 10.4 (flat files 0.43); accents step 6 +3, step 12 +2, step 14 +2; weakest step 16 -11, step 8 -6
- register (MIDI, transposed to C) 36 (34–38)
- degrees (min): 1 0.27, 4 0.14, 5 0.12, b7 0.12, b6 0.11, b3 0.1
- intervals: repeat 0.63 (0.28–0.8), step 1–2 0.12 (0.04–0.19), skip 3–4 0.06 (0.03–0.15), leap 5–7 0.08 (0.05–0.15), octave 0 (0–0.05), descending share of moves 0.48 (0.45–0.5)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.24, longer 0.68; rhythm only: 1-bar 0.35, 2-bar 0.06, 4-bar 0.08, longer 0.51

**chord** (6 songs, in 0.17 of songs)
- onsets/bar 6 (4.2–8.5); steps with P ≥ .5: 1,7,9,11,13; P ≥ .3: 1,3,4,5,6,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.9–3), off-16th onset share 0.26 (0.12–0.32)
- length 0.9 (0.8–1.28) 16ths, gate (length ÷ gap to next onset) 0.62 (0.47–0.71)
- velocity mean 89 ± 14.4 (flat files 0); accents step 16 +9, step 9 +4, step 6 +4; weakest step 2 -13, step 12 -11
- register (MIDI, transposed to C) 68 (63–72)
- degrees (min): 1 0.26, 5 0.12, b7 0.12, b3 0.11, 4 0.11, b6 0.06
- chords: voices 2.2 (2–2.6), spread 10 st, inversion share 0.43 (0.39–0.72), changes/bar 2.27 (2.18–2.7), qualities pow 0.61, min 0.29, dim 0.05, sus 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.19, longer 0.77; rhythm only: 1-bar 0.19, 2-bar 0.12, 4-bar 0, longer 0.69

**pad** (26 songs, in 0.72 of songs)
- onsets/bar 2 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0–0.5), off-16th onset share 0.01 (0–0.1)
- length 8 (5.77–15.98) 16ths, gate (length ÷ gap to next onset) 1 (0.98–1)
- velocity mean 81 ± 8.9 (flat files 0.42); accents step 11 +3, step 15 +1, step 3 +1; weakest step 10 -21, step 2 -16
- register (MIDI, transposed to C) 64 (58–68)
- degrees (min): 1 0.19, 5 0.17, b3 0.14, b7 0.11, 4 0.1, b6 0.1
- chords: voices 2.7 (2.2–3), spread 8 st, inversion share 0.42 (0.2–0.66), changes/bar 0.99 (0.75–1.55), qualities maj 0.38, pow 0.33, min 0.25, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.28, longer 0.67; rhythm only: 1-bar 0.36, 2-bar 0.01, 4-bar 0.1, longer 0.53

**keys** (26 songs, in 0.72 of songs)
- onsets/bar 6 (3.2–7.8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.1–2), off-16th onset share 0.07 (0–0.21)
- length 2.29 (1.8–4) 16ths, gate (length ÷ gap to next onset) 0.96 (0.66–1)
- velocity mean 95 ± 13.4 (flat files 0.5); accents step 6 +8, step 14 +2, step 5 +2; weakest step 16 -4, step 12 -4
- register (MIDI, transposed to C) 63 (60–70)
- degrees (min): 5 0.18, 1 0.17, b3 0.15, 4 0.11, b7 0.09, 2 0.08
- chords: voices 3 (2.6–3.1), spread 9 st, inversion share 0.47 (0.16–0.64), changes/bar 1.33 (0.96–1.92), qualities maj 0.5, min 0.22, pow 0.21, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.08, 4-bar 0.26, longer 0.66; rhythm only: 1-bar 0.31, 2-bar 0.03, 4-bar 0.15, longer 0.51

**guitar** (24 songs, in 0.67 of songs)
- onsets/bar 7 (5–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0.2–3), off-16th onset share 0.14 (0–0.39)
- length 1.97 (0.68–2) 16ths, gate (length ÷ gap to next onset) 0.97 (0.49–1)
- velocity mean 88 ± 11.9 (flat files 0.46); accents step 5 +5, step 4 +4, step 1 +4; weakest step 6 -6, step 14 -5
- register (MIDI, transposed to C) 60 (56–67)
- degrees (min): 5 0.28, 1 0.21, 4 0.13, b3 0.11, b7 0.08, b6 0.07
- chords: voices 2.9 (2.3–3), spread 8 st, inversion share 0.3 (0.14–0.55), changes/bar 0.94 (0.52–1.7), qualities pow 0.58, maj 0.28, min 0.11, sus 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0, 4-bar 0.2, longer 0.75; rhythm only: 1-bar 0.38, 2-bar 0.04, 4-bar 0.09, longer 0.49

**lead** (30 songs, in 0.83 of songs)
- onsets/bar 4 (4–6); steps with P ≥ .5: 1,7,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (0.7–3.3), off-16th onset share 0.04 (0–0.21)
- length 2 (1.55–2.36) 16ths, gate (length ÷ gap to next onset) 0.98 (0.73–1)
- velocity mean 96 ± 10.1 (flat files 0.5); accents step 1 +2, step 10 +1, step 11 +1; weakest step 6 -6, step 12 -5
- register (MIDI, transposed to C) 68 (63–70)
- degrees (min): 5 0.17, 1 0.15, 4 0.15, b3 0.14, b7 0.1, b6 0.09
- intervals: repeat 0.27 (0.09–0.39), step 1–2 0.43 (0.19–0.48), skip 3–4 0.14 (0.06–0.24), leap 5–7 0.1 (0.06–0.16), octave 0.01 (0–0.02), descending share of moves 0.5 (0.46–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.01, 4-bar 0.14, longer 0.85; rhythm only: 1-bar 0.11, 2-bar 0.03, 4-bar 0.09, longer 0.78

**arp** (6 songs, in 0.17 of songs)
- onsets/bar 6 (5.6–6.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,6,7,9,11,12,13,15,16
- syncopation: LHL/bar 2 (0.6–4.9), off-16th onset share 0.28 (0.16–0.4)
- length 0.94 (0.73–1.11) 16ths, gate (length ÷ gap to next onset) 0.66 (0.47–0.95)
- velocity mean 100 ± 3.6 (flat files 0.17); accents step 13 +6, step 1 +3, step 5 +3; weakest step 2 -15, step 14 -12
- register (MIDI, transposed to C) 66 (62–70)
- degrees (min): 1 0.25, 5 0.19, 4 0.14, b3 0.12, b6 0.09, 2 0.06
- intervals: repeat 0.15 (0.05–0.32), step 1–2 0.26 (0.23–0.5), skip 3–4 0.12 (0.1–0.2), leap 5–7 0.14 (0.11–0.19), octave 0.01 (0–0.03), descending share of moves 0.44 (0.42–0.46)
- arp shape up 0.23, down 0.04, updown 0.38, random 0.33, static 0.02; spacing (16ths) {'2.0': 4, '2.5': 1, '1.0': 1}; octave span 0.67 (0.52–0.75)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.12, 2-bar 0, 4-bar 0.31, longer 0.56

**seq** (6 songs, in 0.17 of songs)
- onsets/bar 10 (6.5–12); steps with P ≥ .5: 1,3,4,5,8,9,13,15,16; P ≥ .3: 1,2,3,4,5,7,8,9,11,12,13,15,16
- syncopation: LHL/bar 0.7 (0.1–3), off-16th onset share 0.33 (0.33–0.37)
- length 0.93 (0.74–1.45) 16ths, gate (length ÷ gap to next onset) 0.79 (0.66–0.97)
- velocity mean 83 ± 11.6 (flat files 0.17); accents step 13 +4, step 1 +3, step 3 +2; weakest step 6 -10, step 14 -8
- register (MIDI, transposed to C) 74 (71–77)
- degrees (min): 5 0.17, 1 0.13, 7 0.11, b6 0.1, #4 0.09, b7 0.09
- intervals: repeat 0.33 (0.13–0.75), step 1–2 0.23 (0.05–0.54), skip 3–4 0.13 (0.06–0.16), leap 5–7 0.02 (0.01–0.07), octave 0 (0–0), descending share of moves 0.42 (0.36–0.5)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.25, longer 0.75; rhythm only: 1-bar 0.33, 2-bar 0, 4-bar 0, longer 0.67

**drums** (25 songs with a usable kit; flat-velocity files 0.4)
- families: kick_4otf 0.16, kick_1_and_9_only 0.64, snare_backbeat_5_13 0.56, snare_halftime_9 0, hat_16ths 0.16, hat_8ths 0.32, hat_offbeat_only 0, hat_none 0.16
- kick: hits/bar 3.2 (2.9–4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13; vel 106 ± 2.3
- snare: hits/bar 1.9 (1.7–2.2), songs using 0.88, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 105 ± 2.8
- hat: hits/bar 7.5 (2.3–8.2), songs using 0.8, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,6,7,8,9,10,11,12,13,15,16; vel 93 ± 6.5
- perc: hits/bar 0.2 (0–5.1), songs using 0.4, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 71 ± 15.7
- tom: hits/bar 0 (0–0), songs using 0.08, P ≥ .5 at steps none, P ≥ .2 at none; vel 88 ± 9.8
- cymb: hits/bar 0.2 (0–1.7), songs using 0.48, P ≥ .5 at steps none, P ≥ .2 at 1; vel 92 ± 9.2
- open-hat share of hat hits 0.12, ride share of cymbals 0.37, fill-bar share 0.06

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 13 | 103 / 124 / 157 | 0.69 | 5 (4–6) | 0.79 (0.48–0.98) | 0.42 (0.27–0.45) | 0.77 | 0.31 | 0.2 | 0.2 | i VII (0.22) |
| new | 16 | 92 / 121 / 131 | 0.38 | 6 (4–8) | 0.94 (0.82–1) | 0.42 (0.05–0.49) | 0.62 | 0.12 | 0.22 | 0.11 | i III VI iv (0.33) |

### SYNTHWAVE (12 songs, 7 artists; sources {'lmd': 4, 'lamd': 8}; distinctness 0.58)

⚠ 12 songs, mostly 80s film/TV synth (Faltermeyer, Jan Hammer) plus Chromatics/The Weeknd — modern synthwave is essentially absent from every MIDI source used. Minor 67 %, few guitars. Use the chord sheets for harmony: 111 synthwave sheets, i–VI–VII in 14 %, i–VII–VI–VII 12 %.

Tempo p10/p50/p90 92 / 120 / 156; minor share 0.67.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| minor_share | 0.67 | 0.28 | +0.39 |
| guitar_presence | 0.5 | 0.83 | -0.33 |
| guitar_loop_1bar_rhythm | 0.02 | 0.33 | -0.31 |
| pad_len16 | 11.97 | 8 | +3.97 |
| keys_offbeat16_share | 0.35 | 0.06 | +0.29 |
| drum_hat_8ths | 0.17 | 0.44 | -0.27 |
| lead_iv_step_1_2 | 0.21 | 0.41 | -0.20 |
| keys_gate | 0.75 | 0.93 | -0.18 |
| bass_iv_repeat | 0.29 | 0.46 | -0.17 |
| drum_hat_hits_per_bar | 5.3 | 7.5 | -2.20 |
| chord_presence | 0.08 | 0.24 | -0.15 |
| lead_loop_1bar_rhythm | 0.23 | 0.08 | +0.15 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i v VI iv | 0.29 | 0.03 |
| i iv | 0.14 | 0.14 |
| i VII VI VII | 0.14 | 0.11 |
| i VII | 0.14 | 0.02 |
| i VI v VII | 0.14 | 0.09 |
| i III | 0.14 | 0.02 |
| i VI v I | 0.14 | 0.01 |
| I VI VII | 0.14 | 0.01 |
| i VI VII I | 0.14 | 0.01 |
| i v i iv | 0.14 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.67 | 0.24 |
| IV bVII i bIII | 0.33 | 0.04 |
| I bVII bIII IV | 0.33 | 0.04 |
| IV bIII | 0.33 | 0.04 |
| bIII bVII i | 0.33 | 0.03 |
| I i bIII bVII | 0.33 | 0.03 |
| I ii bIII bVII | 0.33 | 0.03 |
| I ii bIII IV | 0.33 | 0.03 |
| IV bVII ii bIII | 0.33 | 0.03 |
| I bIII IV bVII | 0.33 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 111 songs, minor share 0.47; share of songs containing the loop ≥ 2×): i VI VII (min) 0.14, i VII VI VII (min) 0.12, I V vi IV (maj) 0.1, I IV I V (maj) 0.08, I IV (maj) 0.08, i VII i VI (min) 0.08, I IV V (maj) 0.07, I V IV (maj) 0.07. By era: new (74 songs, minor 0.55): i VI VII (min) 0.19, i VII VI VII (min) 0.14, I V vi IV (maj) 0.1, i VII i VI (min) 0.1

**bass** (12 songs, in 1 of songs)
- onsets/bar 5.5 (2.5–6.2); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.6 (0.1–1.6), off-16th onset share 0 (0–0.23)
- length 1.92 (1.2–4.25) 16ths, gate (length ÷ gap to next onset) 0.96 (0.55–1)
- velocity mean 86 ± 5.2 (flat files 0.42); accents step 3 +3, step 1 +2, step 11 +2; weakest step 12 -24, step 14 -9
- register (MIDI, transposed to C) 36 (34–38)
- degrees (min): 1 0.32, b7 0.19, b3 0.12, b6 0.09, 5 0.09, 4 0.08
- intervals: repeat 0.29 (0.13–0.55), step 1–2 0.23 (0.06–0.42), skip 3–4 0.05 (0.01–0.15), leap 5–7 0.08 (0.03–0.2), octave 0.02 (0–0.09), descending share of moves 0.48 (0.47–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.04, 4-bar 0.14, longer 0.79; rhythm only: 1-bar 0.32, 2-bar 0.04, 4-bar 0.04, longer 0.59

**chord** (1 songs, in 0.08 of songs)
- onsets/bar 8 (8–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.1 (0.1–0.1), off-16th onset share 0 (0–0)
- length 2 (2–2) 16ths, gate (length ÷ gap to next onset) 1 (1–1)
- velocity mean 127 ± 1.4 (flat files 0); accents step 7 +0, step 9 +0, step 13 +0; weakest step 1 -0, step 3 -0
- register (MIDI, transposed to C) 60 (54–67)
- degrees (min): 1 0.19, 5 0.14, 6 0.12, 2 0.1, b7 0.1, 7 0.09
- chords: voices 3 (3–3), spread 24 st, inversion share 0 (0–0), changes/bar 6.92 (6.92–6.92), qualities dim 0.67, sus 0.33
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.6, 2-bar 0, 4-bar 0, longer 0.4

**pad** (7 songs, in 0.58 of songs)
- onsets/bar 1 (1–3.2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.5 (0.1–2.2), off-16th onset share 0 (0–0.1)
- length 11.97 (6.46–15.98) 16ths, gate (length ÷ gap to next onset) 1 (0.98–1)
- velocity mean 67 ± 8.8 (flat files 0.14); accents step 8 +9, step 7 +4, step 5 +4; weakest step 10 -9, step 11 -8
- register (MIDI, transposed to C) 62 (58–72)
- degrees (min): 1 0.21, 5 0.2, 4 0.14, b3 0.11, b6 0.11, b7 0.1
- chords: voices 2.9 (2.9–3.2), spread 19 st, inversion share 0.11 (0.07–0.26), changes/bar 1.16 (0.83–1.6), qualities maj 0.4, min 0.31, pow 0.24, min7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.07, longer 0.93; rhythm only: 1-bar 0.11, 2-bar 0, 4-bar 0, longer 0.89

**keys** (9 songs, in 0.75 of songs)
- onsets/bar 3 (2–4); steps with P ≥ .5: 1,11; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.4–2.5), off-16th onset share 0.35 (0–0.41)
- length 2.5 (0.48–4) 16ths, gate (length ÷ gap to next onset) 0.75 (0.24–1)
- velocity mean 77 ± 11.9 (flat files 0.11); accents step 13 +5, step 1 +2, step 15 +2; weakest step 10 -13, step 2 -11
- register (MIDI, transposed to C) 59 (53–63)
- degrees (min): 1 0.17, b3 0.16, 4 0.15, b7 0.12, 5 0.11, b6 0.09
- chords: voices 3 (2.4–3), spread 8 st, inversion share 0.64 (0.32–0.75), changes/bar 1.06 (0.73–1.28), qualities pow 0.56, maj 0.23, min 0.14, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0, 4-bar 0.17, longer 0.82; rhythm only: 1-bar 0.28, 2-bar 0.08, 4-bar 0, longer 0.64

**guitar** (6 songs, in 0.5 of songs)
- onsets/bar 5 (4–6); steps with P ≥ .5: 1,5,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1–3.1), off-16th onset share 0.16 (0.06–0.24)
- length 1.63 (1.02–1.96) 16ths, gate (length ÷ gap to next onset) 0.95 (0.47–0.97)
- velocity mean 89 ± 11.1 (flat files 0.33); accents step 9 +5, step 3 +4, step 2 +2; weakest step 12 -12, step 6 -10
- register (MIDI, transposed to C) 58 (55–61)
- degrees (min): 1 0.15, 5 0.15, b3 0.14, b7 0.12, 2 0.1, 4 0.09
- chords: voices 3 (2.9–3.1), spread 10 st, inversion share 0.4 (0.2–0.65), changes/bar 1.21 (0.93–1.33), qualities maj 0.44, pow 0.41, sus 0.05, dim 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0, 4-bar 0, longer 0.98; rhythm only: 1-bar 0.02, 2-bar 0.11, 4-bar 0, longer 0.87

**lead** (9 songs, in 0.75 of songs)
- onsets/bar 5 (4–6); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (0.3–2.7), off-16th onset share 0.02 (0–0.2)
- length 2 (1.6–2.25) 16ths, gate (length ÷ gap to next onset) 0.8 (0.67–0.98)
- velocity mean 89 ± 5.2 (flat files 0.33); accents step 2 +19, step 10 +17, step 8 +16; weakest step 12 -19, step 4 -15
- register (MIDI, transposed to C) 67 (65–69)
- degrees (min): 5 0.21, b7 0.16, 1 0.15, 4 0.15, b3 0.15, b6 0.13
- intervals: repeat 0.32 (0.06–0.57), step 1–2 0.21 (0.15–0.62), skip 3–4 0.08 (0.02–0.19), leap 5–7 0.12 (0.03–0.14), octave 0 (0–0), descending share of moves 0.51 (0.48–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.19, longer 0.81; rhythm only: 1-bar 0.23, 2-bar 0.11, 4-bar 0, longer 0.66

**arp** (1 songs, in 0.08 of songs)
- onsets/bar 7 (7–7); steps with P ≥ .5: 1,5,8,10,11,13,15; P ≥ .3: 1,3,4,5,7,8,10,11,13,15
- syncopation: LHL/bar 3.1 (3.1–3.1), off-16th onset share 0.3 (0.3–0.3)
- length 1.6 (1.6–1.6) 16ths, gate (length ÷ gap to next onset) 0.8 (0.8–0.8)
- velocity mean 110 ± 6.8 (flat files 0); accents step 5 +3, step 2 +2, step 10 +2; weakest step 4 -4, step 6 -3
- register (MIDI, transposed to C) 63 (60–67)
- degrees (min): 1 0.28, b7 0.2, b3 0.18, 5 0.18, 4 0.1, 2 0.03
- intervals: repeat 0.09 (0.09–0.09), step 1–2 0.3 (0.3–0.3), skip 3–4 0.22 (0.22–0.22), leap 5–7 0.35 (0.35–0.35), octave 0.03 (0.03–0.03), descending share of moves 0.59 (0.59–0.59)
- arp shape up 0, down 0, updown 0.2, random 0.8, static 0; spacing (16ths) {'2.0': 1}; octave span 0.58 (0.58–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**seq** (4 songs, in 0.33 of songs)
- onsets/bar 8 (6.8–10.8); steps with P ≥ .5: 1,3,5,7,9,11,12,14,15; P ≥ .3: 1,3,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 3 (2.1–3.7), off-16th onset share 0.32 (0.24–0.37)
- length 0.97 (0.82–1) 16ths, gate (length ÷ gap to next onset) 0.48 (0.45–0.62)
- velocity mean 58 ± 12.6 (flat files 0.5); accents step 1 +8, step 15 +2, step 16 +1; weakest step 11 -2, step 5 -2
- register (MIDI, transposed to C) 58 (56–61)
- degrees (min): 1 0.33, 5 0.32, 4 0.12, b7 0.09, b3 0.07, 2 0.03
- intervals: repeat 0.52 (0.36–0.74), step 1–2 0.07 (0–0.17), skip 3–4 0.07 (0–0.14), leap 5–7 0.1 (0.04–0.29), octave 0.01 (0–0.01), descending share of moves 0.54 (0.52–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.56, longer 0.45; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.56, longer 0.45

**drums** (12 songs with a usable kit; flat-velocity files 0.25)
- families: kick_4otf 0.25, kick_1_and_9_only 0.58, snare_backbeat_5_13 0.5, snare_halftime_9 0, hat_16ths 0.17, hat_8ths 0.17, hat_offbeat_only 0, hat_none 0.17
- kick: hits/bar 3.4 (2.6–4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13; vel 105 ± 4.1
- snare: hits/bar 1.8 (1–2), songs using 0.92, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 120 ± 3.3
- hat: hits/bar 5.3 (3.1–7.8), songs using 0.83, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,15,16; vel 87 ± 10.3
- perc: hits/bar 2.4 (0.2–15.8), songs using 0.67, P ≥ .5 at steps 5,13, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 73 ± 9.6
- tom: hits/bar 0 (0–0), songs using 0.08, P ≥ .5 at steps none, P ≥ .2 at none; vel 127 ± 0.3
- cymb: hits/bar 0.1 (0–1.3), songs using 0.33, P ≥ .5 at steps none, P ≥ .2 at 1; vel 106 ± 16.2
- open-hat share of hat hits 0.05, ride share of cymbals 0.33, fill-bar share 0.03

