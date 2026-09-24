# GARAGE — reference statistics

**36 songs measured** (41 selected), 18 artists; sources {'lmd': 26, 'freemidi': 6, 'lamd': 4}; eras {'?': 13, 'new': 21, '90s': 1, '80s': 1}; era splits: {'new': 21}. Every table: `analysis/out/garage_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **95 / 130 / 160**; file BPM q1/med/q3 94 / 120 / 134; minor share **0.44**.

## Findings

The only dance style whose snare sits on 5+13 in fewer than half the songs (48 %) with a half-time 9 in 13 %; kick P .30 at step 7 and .25 at 8 (the skippy 2-step kick). Open hats rare (6 %). 36 songs; mostly vocal UK garage (Craig David, Artful Dodger, Daniel Bedingfield, The Streets) — few instrumental speed-garage files.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 1.06 (0.73–1.35). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI | 0.25 | 0.11 |
| i iv | 0.25 | 0.09 |
| i VI i III | 0.12 | 0.01 |
| i III i VI | 0.12 | 0.01 |
| i VII iv | 0.12 | 0.01 |
| i III i III+ | 0.06 | 0.01 |
| i III+ i III | 0.06 | 0.01 |
| VI iv | 0.06 | 0.02 |
| i VII i iv | 0.06 | 0.01 |
| i VII VI | 0.06 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.3 | 0.11 |
| I IV V | 0.25 | 0.03 |
| I IV I V | 0.2 | 0.02 |
| IV V | 0.2 | 0.04 |
| I V IV | 0.15 | 0.05 |
| I IV V IV | 0.15 | 0.02 |
| I V | 0.15 | 0.07 |
| I IV I vi | 0.1 | 0.01 |
| I vi V IV | 0.1 | 0.01 |
| I vi I IV | 0.1 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 58 songs, minor share 0.57; share of songs containing the loop ≥ 2×): I IV (maj) 0.12, I IV V IV (maj) 0.12, i VII VI (min) 0.1, I IV I V (maj) 0.1, I vi IV V (maj) 0.07, I V IV V (maj) 0.07, I V vi V (maj) 0.07, i VI III VI (min) 0.07. By era: new (37 songs, minor 0.59): I IV (maj) 0.16, i VII VI (min) 0.11, I IV I V (maj) 0.11, I IV V IV (maj) 0.11

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (31 songs, in 0.86 of songs)
- onsets/bar 3 (2–5.5); steps with P ≥ .5: 1,9,15; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 1 (0.2–1.8), off-16th onset share 0.12 (0–0.25)
- length 1.96 (1.51–2.53) 16ths, gate (length ÷ gap to next onset) 0.83 (0.51–0.99)
- velocity mean 102 ± 6.6 (flat files 0.32); accents step 12 +4, step 1 +1, step 15 +0; weakest step 6 -4, step 16 -3
- register (MIDI, transposed to C) 36 (31–36)
- degrees (maj): 1 0.25, 5 0.2, 4 0.16, 2 0.14, 6 0.11, 3 0.06
- intervals: repeat 0.37 (0.29–0.53), step 1–2 0.22 (0.08–0.33), skip 3–4 0.04 (0–0.1), leap 5–7 0.13 (0.06–0.28), octave 0 (0–0.04), descending share of moves 0.49 (0.4–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.12, 2-bar 0.1, 4-bar 0.21, longer 0.56; rhythm only: 1-bar 0.27, 2-bar 0.11, 4-bar 0.17, longer 0.45

**chord** (12 songs, in 0.33 of songs)
- onsets/bar 4.5 (4–6); steps with P ≥ .5: 1,3,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.4 (2–3.1), off-16th onset share 0.02 (0–0.17)
- length 1.05 (0.98–1.68) 16ths, gate (length ÷ gap to next onset) 0.62 (0.25–0.94)
- velocity mean 97 ± 13.6 (flat files 0.33); accents step 12 +6, step 4 +4, step 1 +4; weakest step 8 -8, step 11 -5
- register (MIDI, transposed to C) 66 (63–69)
- degrees (maj): 5 0.21, 1 0.18, 3 0.15, 6 0.11, 4 0.1, 2 0.09
- chords: voices 2.1 (2–2.4), spread 4 st, inversion share 0.85 (0.49–1), changes/bar 1.37 (0.69–1.77), qualities pow 0.6, maj 0.29, min 0.06, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.17, 4-bar 0, longer 0.83; rhythm only: 1-bar 0.33, 2-bar 0, 4-bar 0.02, longer 0.65

**pad** (25 songs, in 0.69 of songs)
- onsets/bar 2 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 1 (0.4–1.8), off-16th onset share 0 (0–0.15)
- length 4.67 (2.63–15.08) 16ths, gate (length ÷ gap to next onset) 0.94 (0.81–0.99)
- velocity mean 95 ± 9.6 (flat files 0.24); accents step 4 +9, step 12 +6, step 6 +6; weakest step 10 -14, step 1 -1
- register (MIDI, transposed to C) 63 (60–67)
- degrees (maj): 5 0.2, 1 0.18, 3 0.17, 2 0.13, 4 0.12, 6 0.11
- chords: voices 2.9 (2.2–3.2), spread 8 st, inversion share 0.5 (0.33–0.67), changes/bar 1.25 (0.95–2.06), qualities maj 0.4, pow 0.35, min 0.2, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.23, longer 0.7; rhythm only: 1-bar 0.21, 2-bar 0.1, 4-bar 0.12, longer 0.58

**keys** (24 songs, in 0.67 of songs)
- onsets/bar 2 (1–4.5); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 0.8 (0–1.7), off-16th onset share 0 (0–0.16)
- length 3.48 (1.6–13.82) 16ths, gate (length ÷ gap to next onset) 0.94 (0.66–0.98)
- velocity mean 85 ± 9.4 (flat files 0.33); accents step 13 +2, step 2 +1, step 3 +1; weakest step 10 -6, step 12 -5
- register (MIDI, transposed to C) 61 (57–65)
- degrees (maj): 1 0.22, 5 0.19, 4 0.15, 3 0.14, 6 0.12, 2 0.1
- chords: voices 3.1 (2.8–3.5), spread 9 st, inversion share 0.5 (0.39–0.7), changes/bar 1.49 (0.96–2.29), qualities maj 0.45, min 0.23, min7 0.12, pow 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.17, 4-bar 0.18, longer 0.65; rhythm only: 1-bar 0.14, 2-bar 0.16, 4-bar 0.1, longer 0.6

**guitar** (26 songs, in 0.72 of songs)
- onsets/bar 6 (4–8.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (0.8–3.2), off-16th onset share 0.17 (0.01–0.36)
- length 1.98 (0.86–2.64) 16ths, gate (length ÷ gap to next onset) 0.97 (0.59–1.04)
- velocity mean 86 ± 10.3 (flat files 0.19); accents step 1 +3, step 7 +1, step 3 +0; weakest step 16 -7, step 2 -3
- register (MIDI, transposed to C) 59 (54–62)
- degrees (maj): 1 0.24, 5 0.19, 2 0.15, 4 0.15, 6 0.11, 3 0.09
- chords: voices 3 (2.2–3.7), spread 8 st, inversion share 0.4 (0.14–0.66), changes/bar 1.31 (0.84–2.08), qualities pow 0.42, maj 0.3, min 0.13, sus 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.22, longer 0.71; rhythm only: 1-bar 0.3, 2-bar 0.09, 4-bar 0.1, longer 0.51

**lead** (24 songs, in 0.67 of songs)
- onsets/bar 5 (3–6); steps with P ≥ .5: 1,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (1.7–2.8), off-16th onset share 0.13 (0.05–0.22)
- length 1.99 (1.29–2.48) 16ths, gate (length ÷ gap to next onset) 0.91 (0.62–0.99)
- velocity mean 103 ± 10.7 (flat files 0.33); accents step 13 +2, step 15 +1, step 5 +1; weakest step 10 -4, step 8 -2
- register (MIDI, transposed to C) 64 (61–67)
- degrees (maj): 1 0.2, 5 0.18, 2 0.14, 3 0.14, 6 0.12, 4 0.1
- intervals: repeat 0.21 (0.15–0.29), step 1–2 0.43 (0.37–0.53), skip 3–4 0.21 (0.17–0.29), leap 5–7 0.08 (0.04–0.11), octave 0 (0–0.01), descending share of moves 0.5 (0.46–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.12, longer 0.87; rhythm only: 1-bar 0.02, 2-bar 0.02, 4-bar 0.1, longer 0.87

**arp** (5 songs, in 0.14 of songs)
- onsets/bar 16 (14–16); steps with P ≥ .5: 1,2,3,4,5,7,8,9,10,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.4 (0.2–1.3), off-16th onset share 0.5 (0.45–0.5)
- length 0.96 (0.71–1) 16ths, gate (length ÷ gap to next onset) 1 (0.55–1.04)
- velocity mean 62 ± 10.9 (flat files 0.6); accents step 9 +4, step 11 +4, step 13 +4; weakest step 6 -9, step 8 -7
- register (MIDI, transposed to C) 62 (58–67)
- degrees (maj): 1 0.2, 3 0.2, 5 0.18, 7 0.13, 2 0.12, 6 0.1
- intervals: repeat 0 (0–0), step 1–2 0.04 (0.04–0.07), skip 3–4 0.28 (0.07–0.5), leap 5–7 0.35 (0.25–0.45), octave 0.06 (0.01–0.17), descending share of moves 0.39 (0.34–0.5)
- arp shape up 0.24, down 0, updown 0.1, random 0.66, static 0; spacing (16ths) {'1.0': 4, '2.0': 1}; octave span 1 (1–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.25, 4-bar 0.08, longer 0.67; rhythm only: 1-bar 0.46, 2-bar 0.25, 4-bar 0, longer 0.29

**seq** (14 songs, in 0.39 of songs)
- onsets/bar 7 (3.5–7); steps with P ≥ .5: 1,5,7,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (1–3.2), off-16th onset share 0.09 (0–0.25)
- length 1.38 (1.04–1.98) 16ths, gate (length ÷ gap to next onset) 0.7 (0.5–0.84)
- velocity mean 102 ± 11.4 (flat files 0.36); accents step 13 +3, step 5 +3, step 1 +2; weakest step 2 -8, step 14 -8
- register (MIDI, transposed to C) 61 (58–64)
- degrees (maj): 1 0.2, 5 0.2, 2 0.2, 3 0.12, 6 0.11, 4 0.1
- intervals: repeat 0.33 (0.28–0.72), step 1–2 0.43 (0.05–0.44), skip 3–4 0.13 (0.06–0.17), leap 5–7 0.07 (0.02–0.1), octave 0 (0–0), descending share of moves 0.47 (0.44–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0, 4-bar 0.14, longer 0.77; rhythm only: 1-bar 0.21, 2-bar 0.13, 4-bar 0.04, longer 0.62

**fx** (2 songs, in 0.06 of songs)
- onsets/bar 3.8 (3.6–3.9); steps with P ≥ .5: 1,11; P ≥ .3: 1,5,7,11,15
- syncopation: LHL/bar 3 (2.5–3.5), off-16th onset share 0.21 (0.11–0.32)
- length 0.88 (0.72–1.03) 16ths, gate (length ÷ gap to next onset) 0.66 (0.4–0.91)
- velocity mean 85 ± 8.3 (flat files 0); accents step 13 +14, step 5 +4, step 7 +3; weakest step 3 -9, step 15 -6
- register (MIDI, transposed to C) 67 (66–68)
- degrees (maj): 1 0.39, 2 0.34, 5 0.1, 6 0.08, 3 0.07, 4 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**drums** (31 songs with a usable kit; flat-velocity files 0.13)
- families: kick_4otf 0.1, kick_1_and_9_only 0.35, snare_backbeat_5_13 0.48, snare_halftime_9 0.13, hat_16ths 0.1, hat_8ths 0.35, hat_offbeat_only 0, hat_none 0.07
- kick: hits/bar 3.6 (2.2–4.2), songs using 0.97, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,8,9,11,13; vel 100 ± 6.8
- snare: hits/bar 1.9 (1.1–2), songs using 0.87, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 4.2
- hat: hits/bar 7.7 (3.9–8.9), songs using 0.94, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 74 ± 13.6
- perc: hits/bar 3.6 (0.1–9.7), songs using 0.71, P ≥ .5 at steps 13, P ≥ .2 at 1,3,4,5,7,8,9,10,11,12,13,14,15,16; vel 82 ± 10.9
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.2 (0.1–0.4), songs using 0.26, P ≥ .5 at steps none, P ≥ .2 at none; vel 90 ± 9.1
- open-hat share of hat hits 0.06, ride share of cymbals 0.14, fill-bar share 0.02

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 21 | 92 / 126 / 162 | 0.43 | 3.5 (1.8–6) | 0.83 (0.42–1) | 0.43 (0.38–0.54) | 0.67 | 0.14 | 0.11 | 0.06 | i VI (0.33) |

