# RNB — reference statistics

**101 songs measured** (144 selected), 75 artists; sources {'lmd': 101}; eras {'80s': 16, 'new': 35, '90s': 17, '?': 33}; era splits: {'80s': 16, 'new': 35}. Every table: `analysis/out/rnb_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **91 / 120 / 152**; file BPM q1/med/q3 82 / 100 / 120; minor share **0.34**.

## Findings

Major-leaning (minor 34 %), bass on 1, 7, 9 with long notes, keys held (2.4 16ths), and the 8th hat (52 % of songs). Loops I–IV, I–IV–I–V, I–vi–IV–V. The SOUL flavour (98 songs) is almost indistinguishable in these files (distinctness .22: only guitar density differs).

Flavours filed under this style: **SOUL** (98 songs), **NEO SOUL** (23 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.95 (0.69–1.39). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.25 | 0.09 |
| i v | 0.16 | 0.05 |
| i VII | 0.12 | 0.03 |
| i iv v | 0.12 | 0.01 |
| i VI | 0.12 | 0.03 |
| i v i VII | 0.09 | 0.01 |
| i III VII | 0.09 | 0.01 |
| i VI III VII | 0.09 | 0.03 |
| i VI VII | 0.09 | 0.04 |
| i VII VI VII | 0.09 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.28 | 0.07 |
| I IV I V | 0.16 | 0.02 |
| I IV V | 0.15 | 0.03 |
| I V | 0.12 | 0.02 |
| I vi IV V | 0.12 | 0.03 |
| I IV V IV | 0.12 | 0.01 |
| I V IV V | 0.1 | 0.01 |
| I vi ii V | 0.1 | 0.03 |
| I vi IV | 0.1 | 0.02 |
| I V I IV | 0.09 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 5549 songs, minor share 0.45; share of songs containing the loop ≥ 2×): I IV (maj) 0.11, I IV V (maj) 0.07, I V vi IV (maj) 0.07, I IV I V (maj) 0.05, I V IV (maj) 0.05, I IV V IV (maj) 0.05, i iv (min) 0.05, i VI VII (min) 0.05. By era: 80s (190 songs, minor 0.37): I IV (maj) 0.14, I IV V (maj) 0.12, I IV I ii (maj) 0.07, I IV V IV (maj) 0.06; new (4305 songs, minor 0.47): I IV (maj) 0.09, I V vi IV (maj) 0.06, i iv (min) 0.05, i VI VII (min) 0.05

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (95 songs, in 0.94 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,7,9; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.8 (0.3–1.9), off-16th onset share 0.06 (0–0.24)
- length 1.96 (1.54–3.62) 16ths, gate (length ÷ gap to next onset) 0.9 (0.68–0.97)
- velocity mean 102 ± 8.2 (flat files 0.26); accents step 1 +1, step 9 +1, step 5 +0; weakest step 10 -3, step 12 -2
- register (MIDI, transposed to C) 36 (32–39)
- degrees (maj): 1 0.25, 5 0.2, 4 0.13, 6 0.13, 2 0.1, 3 0.08
- intervals: repeat 0.38 (0.19–0.56), step 1–2 0.2 (0.1–0.29), skip 3–4 0.07 (0.03–0.13), leap 5–7 0.2 (0.09–0.3), octave 0.03 (0–0.07), descending share of moves 0.49 (0.41–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.08, 4-bar 0.09, longer 0.82; rhythm only: 1-bar 0.15, 2-bar 0.05, 4-bar 0.07, longer 0.73

**chord** (26 songs, in 0.26 of songs)
- onsets/bar 4 (3–6.5); steps with P ≥ .5: none; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.1 (1.3–3.8), off-16th onset share 0.14 (0–0.35)
- length 1.61 (0.82–2.5) 16ths, gate (length ÷ gap to next onset) 0.6 (0.48–0.89)
- velocity mean 87 ± 10.5 (flat files 0.19); accents step 16 +6, step 14 +2, step 2 +2; weakest step 8 -2, step 4 -2
- register (MIDI, transposed to C) 67 (61–72)
- degrees (maj): 1 0.22, 5 0.2, 3 0.14, 2 0.13, 4 0.1, 6 0.1
- chords: voices 2.5 (2–3), spread 8 st, inversion share 0.63 (0.32–1), changes/bar 1.84 (1.07–2.56), qualities pow 0.41, maj 0.34, min 0.16, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.02, 4-bar 0.11, longer 0.87; rhythm only: 1-bar 0.12, 2-bar 0.14, 4-bar 0.07, longer 0.67

**pad** (74 songs, in 0.73 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9,13
- syncopation: LHL/bar 0.7 (0.2–2.3), off-16th onset share 0.03 (0–0.18)
- length 7.53 (1.98–13.71) 16ths, gate (length ÷ gap to next onset) 0.97 (0.79–1)
- velocity mean 84 ± 11.6 (flat files 0.19); accents step 14 +3, step 10 +2, step 11 +2; weakest step 2 -6, step 4 -1
- register (MIDI, transposed to C) 65 (62–72)
- degrees (maj): 1 0.21, 5 0.17, 3 0.14, 6 0.13, 2 0.12, 4 0.11
- chords: voices 2.5 (2.2–3), spread 8 st, inversion share 0.47 (0.23–0.77), changes/bar 1.29 (0.89–1.62), qualities maj 0.38, pow 0.35, min 0.17, min7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.17, longer 0.83; rhythm only: 1-bar 0.12, 2-bar 0.04, 4-bar 0.11, longer 0.73

**keys** (77 songs, in 0.76 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0.2–2.2), off-16th onset share 0.03 (0–0.27)
- length 2.42 (1.5–4.4) 16ths, gate (length ÷ gap to next onset) 0.89 (0.58–0.99)
- velocity mean 87 ± 11.1 (flat files 0.29); accents step 10 +3, step 14 +1, step 1 +1; weakest step 2 -7, step 8 -4
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 1 0.21, 5 0.2, 3 0.13, 6 0.12, 2 0.11, 4 0.1
- chords: voices 3 (2.6–3.4), spread 8 st, inversion share 0.5 (0.35–0.71), changes/bar 1.65 (1.25–2.22), qualities maj 0.42, pow 0.21, min 0.19, min7 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.12, longer 0.83; rhythm only: 1-bar 0.15, 2-bar 0.08, 4-bar 0.06, longer 0.71

**guitar** (74 songs, in 0.73 of songs)
- onsets/bar 7 (5–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.6 (0.3–2.9), off-16th onset share 0.17 (0–0.37)
- length 1.52 (0.96–1.96) 16ths, gate (length ÷ gap to next onset) 0.81 (0.49–0.94)
- velocity mean 81 ± 12 (flat files 0.15); accents step 1 +3, step 5 +2, step 13 +1; weakest step 6 -6, step 16 -4
- register (MIDI, transposed to C) 60 (57–64)
- degrees (maj): 1 0.26, 5 0.2, 3 0.12, 6 0.12, 2 0.1, 4 0.1
- chords: voices 2.8 (2–3), spread 9 st, inversion share 0.49 (0.2–0.67), changes/bar 0.92 (0.32–1.77), qualities pow 0.44, maj 0.33, min 0.17, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.1, 4-bar 0.08, longer 0.81; rhythm only: 1-bar 0.2, 2-bar 0.12, 4-bar 0.08, longer 0.6

**lead** (80 songs, in 0.79 of songs)
- onsets/bar 4.5 (3–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.8–3.5), off-16th onset share 0.11 (0.01–0.29)
- length 1.94 (1.58–2.25) 16ths, gate (length ÷ gap to next onset) 0.8 (0.65–0.94)
- velocity mean 98 ± 10.6 (flat files 0.28); accents step 9 +1, step 12 +1, step 5 +1; weakest step 10 -3, step 8 -1
- register (MIDI, transposed to C) 70 (66–72)
- degrees (maj): 1 0.22, 3 0.17, 5 0.16, 2 0.13, 6 0.13, 4 0.09
- intervals: repeat 0.28 (0.14–0.39), step 1–2 0.41 (0.26–0.53), skip 3–4 0.16 (0.09–0.2), leap 5–7 0.07 (0.04–0.11), octave 0 (0–0.01), descending share of moves 0.53 (0.49–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.04, 4-bar 0.04, longer 0.91; rhythm only: 1-bar 0.06, 2-bar 0.02, 4-bar 0.04, longer 0.89

**arp** (9 songs, in 0.09 of songs)
- onsets/bar 11 (8–16); steps with P ≥ .5: 1,2,3,4,5,6,7,8,9,10,11,12,13,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.5 (0.1–2.1), off-16th onset share 0.43 (0.36–0.5)
- length 0.83 (0.67–0.93) 16ths, gate (length ÷ gap to next onset) 0.73 (0.67–0.87)
- velocity mean 104 ± 9.1 (flat files 0.33); accents step 16 +4, step 5 +3, step 1 +3; weakest step 8 -5, step 4 -4
- register (MIDI, transposed to C) 66 (64–70)
- degrees (maj): 5 0.2, 1 0.18, 3 0.14, 6 0.14, 2 0.09, 7 0.08
- intervals: repeat 0.08 (0–0.18), step 1–2 0.2 (0.12–0.27), skip 3–4 0.27 (0.19–0.31), leap 5–7 0.2 (0.09–0.23), octave 0.01 (0–0.05), descending share of moves 0.48 (0.3–0.53)
- arp shape up 0.29, down 0.1, updown 0.07, random 0.54, static 0; spacing (16ths) {'1.0': 6, '2.0': 3}; octave span 0.83 (0.71–1.17)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.33, 4-bar 0.1, longer 0.57; rhythm only: 1-bar 0.58, 2-bar 0, 4-bar 0, longer 0.42

**seq** (27 songs, in 0.27 of songs)
- onsets/bar 7 (4.8–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,5,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.2 (0.4–3.3), off-16th onset share 0.35 (0.05–0.46)
- length 1.02 (0.73–1.8) 16ths, gate (length ÷ gap to next onset) 0.73 (0.44–0.96)
- velocity mean 92 ± 9.8 (flat files 0.18); accents step 5 +2, step 13 +2, step 15 +2; weakest step 8 -4, step 4 -4
- register (MIDI, transposed to C) 63 (60–67)
- degrees (maj): 1 0.34, 6 0.14, 5 0.13, 2 0.11, 3 0.11, 7 0.06
- intervals: repeat 0.39 (0.11–0.68), step 1–2 0.18 (0–0.32), skip 3–4 0.09 (0–0.2), leap 5–7 0.04 (0–0.09), octave 0 (0–0.02), descending share of moves 0.49 (0.39–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.1, 4-bar 0.04, longer 0.81; rhythm only: 1-bar 0.31, 2-bar 0.1, 4-bar 0.01, longer 0.59

**fx** (10 songs, in 0.1 of songs)
- onsets/bar 3 (2–4.8); steps with P ≥ .5: none; P ≥ .3: 1,5,9,13,15
- syncopation: LHL/bar 2.3 (1.1–2.6), off-16th onset share 0 (0–0.08)
- length 2.46 (2–5.18) 16ths, gate (length ÷ gap to next onset) 0.83 (0.53–0.96)
- velocity mean 96 ± 9.2 (flat files 0.3); accents step 11 +10, step 4 +1, step 10 +1; weakest step 2 -4, step 5 -3
- register (MIDI, transposed to C) 76 (72–80)
- degrees (maj): 1 0.23, 5 0.17, 2 0.15, 6 0.14, 3 0.13, 4 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0, 4-bar 0.07, longer 0.86; rhythm only: 1-bar 0.07, 2-bar 0, 4-bar 0.14, longer 0.79

**drums** (95 songs with a usable kit; flat-velocity files 0.1)
- families: kick_4otf 0.1, kick_1_and_9_only 0.55, snare_backbeat_5_13 0.58, snare_halftime_9 0.04, hat_16ths 0.06, hat_8ths 0.52, hat_offbeat_only 0.01, hat_none 0.06
- kick: hits/bar 3.2 (2.6–3.9), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,11,15; vel 106 ± 7.2
- snare: hits/bar 1.9 (1.3–2), songs using 0.91, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 103 ± 4.4
- hat: hits/bar 7.4 (5.3–8), songs using 0.93, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 78 ± 10
- perc: hits/bar 2.2 (0.2–8), songs using 0.68, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,15,16; vel 77 ± 11.4
- tom: hits/bar 0 (0–0), songs using 0.06, P ≥ .5 at steps none, P ≥ .2 at none; vel 80 ± 1.6
- cymb: hits/bar 0.2 (0–0.8), songs using 0.34, P ≥ .5 at steps none, P ≥ .2 at 1; vel 84 ± 10.3
- open-hat share of hat hits 0.09, ride share of cymbals 0.36, fill-bar share 0.04

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 16 | 89 / 117 / 148 | 0.25 | 4 (2.8–4.6) | 0.79 (0.56–0.94) | 0.52 (0.42–0.54) | 0.88 | 0.06 | 0 | 0 | i VI #iii (0.25) |
| new | 35 | 91 / 119 / 160 | 0.43 | 5 (4–7.8) | 0.76 (0.64–0.91) | 0.4 (0.21–0.5) | 0.74 | 0.11 | 0.12 | 0.09 | i iv (0.27) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### SOUL (98 songs, 78 artists; sources {'lmd': 98}; distinctness 0.22)


Tempo p10/p50/p90 97 / 120 / 152; minor share 0.29.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| guitar_onsets_per_bar | 5 | 7 | -2.00 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.14 | 0.07 |
| i VI | 0.11 | 0.03 |
| i VI V | 0.11 | 0.01 |
| i VII VI VII | 0.11 | 0.05 |
| i V VI VII | 0.11 | 0.01 |
| i V | 0.11 | 0.03 |
| i iv VII III | 0.07 | 0.01 |
| i IV | 0.07 | 0.01 |
| i VI III VII | 0.07 | 0.03 |
| i VI III VI | 0.07 | 0 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.25 | 0.09 |
| I IV I V | 0.22 | 0.02 |
| I vi IV V | 0.16 | 0.05 |
| I IV V IV | 0.14 | 0.02 |
| I IV V | 0.14 | 0.03 |
| I V I IV | 0.13 | 0.02 |
| I V IV | 0.12 | 0.03 |
| I V IV V | 0.1 | 0.01 |
| I vi IV ii | 0.09 | 0.01 |
| I iii IV V | 0.09 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 5749 songs, minor share 0.31; share of songs containing the loop ≥ 2×): I IV (maj) 0.22, I IV I V (maj) 0.16, I V I IV (maj) 0.11, I IV V IV (maj) 0.1, I IV V (maj) 0.1, I V IV (maj) 0.1, I V IV V (maj) 0.06, I vi IV V (maj) 0.06. By era: 80s (1772 songs, minor 0.23): I IV (maj) 0.3, I IV I V (maj) 0.23, I V I IV (maj) 0.16, I IV V IV (maj) 0.13; new (2958 songs, minor 0.38): I IV (maj) 0.17, I IV I V (maj) 0.11, I IV V (maj) 0.08, I IV V IV (maj) 0.08

**bass** (94 songs, in 0.96 of songs)
- onsets/bar 5 (3–6); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0.3–2), off-16th onset share 0.03 (0–0.16)
- length 1.98 (1.73–3.46) 16ths, gate (length ÷ gap to next onset) 0.87 (0.75–0.95)
- velocity mean 99 ± 8.8 (flat files 0.17); accents step 1 +2, step 5 +1, step 9 +0; weakest step 2 -6, step 6 -5
- register (MIDI, transposed to C) 36 (33–38)
- degrees (maj): 1 0.25, 5 0.2, 4 0.14, 6 0.12, 2 0.1, 3 0.08
- intervals: repeat 0.35 (0.23–0.52), step 1–2 0.2 (0.13–0.32), skip 3–4 0.06 (0.03–0.13), leap 5–7 0.19 (0.08–0.3), octave 0.02 (0–0.06), descending share of moves 0.49 (0.44–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.04, 4-bar 0.07, longer 0.88; rhythm only: 1-bar 0.1, 2-bar 0.05, 4-bar 0.06, longer 0.79

**chord** (35 songs, in 0.36 of songs)
- onsets/bar 3 (2–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1–2.7), off-16th onset share 0.07 (0–0.17)
- length 1.96 (1.2–2.55) 16ths, gate (length ÷ gap to next onset) 0.69 (0.44–0.8)
- velocity mean 100 ± 8.3 (flat files 0.17); accents step 4 +2, step 12 +2, step 1 +1; weakest step 6 -6, step 10 -2
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 1 0.21, 5 0.19, 3 0.14, 2 0.11, 6 0.1, 4 0.08
- chords: voices 2.2 (2–2.7), spread 8 st, inversion share 0.74 (0.5–1), changes/bar 1.6 (0.8–1.99), qualities pow 0.48, maj 0.31, min 0.15, dim 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.05, 4-bar 0.2, longer 0.75; rhythm only: 1-bar 0.12, 2-bar 0.11, 4-bar 0.17, longer 0.6

**pad** (65 songs, in 0.66 of songs)
- onsets/bar 2 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.8 (0.1–1.5), off-16th onset share 0.01 (0–0.07)
- length 7.83 (3.54–12.35) 16ths, gate (length ÷ gap to next onset) 0.98 (0.89–1)
- velocity mean 84 ± 9.9 (flat files 0.14); accents step 12 +5, step 10 +4, step 11 +1; weakest step 2 -5, step 4 -1
- register (MIDI, transposed to C) 64 (60–69)
- degrees (maj): 1 0.24, 5 0.16, 3 0.13, 6 0.12, 4 0.11, 2 0.11
- chords: voices 2.6 (2.1–3), spread 9 st, inversion share 0.55 (0.36–0.67), changes/bar 1.2 (0.86–1.67), qualities maj 0.4, pow 0.34, min 0.18, min7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.04, 4-bar 0.15, longer 0.78; rhythm only: 1-bar 0.15, 2-bar 0.09, 4-bar 0.07, longer 0.69

**keys** (87 songs, in 0.89 of songs)
- onsets/bar 4 (3–6.5); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0.3–1.9), off-16th onset share 0.02 (0–0.2)
- length 2.85 (1.61–4) 16ths, gate (length ÷ gap to next onset) 0.85 (0.61–1)
- velocity mean 85 ± 11.6 (flat files 0.15); accents step 4 +1, step 1 +1, step 13 +1; weakest step 2 -8, step 10 -5
- register (MIDI, transposed to C) 60 (57–65)
- degrees (maj): 1 0.21, 5 0.17, 3 0.12, 4 0.12, 6 0.12, 2 0.1
- chords: voices 3.1 (2.9–3.5), spread 9 st, inversion share 0.57 (0.32–0.69), changes/bar 1.52 (1.21–2.02), qualities maj 0.5, min 0.2, pow 0.15, min7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.04, 4-bar 0.06, longer 0.88; rhythm only: 1-bar 0.1, 2-bar 0.03, 4-bar 0.05, longer 0.82

**guitar** (71 songs, in 0.72 of songs)
- onsets/bar 5 (3–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (1.1–3), off-16th onset share 0.08 (0–0.29)
- length 1.79 (0.92–2) 16ths, gate (length ÷ gap to next onset) 0.83 (0.44–1)
- velocity mean 78 ± 11.4 (flat files 0.09); accents step 1 +2, step 13 +1, step 5 +0; weakest step 10 -4, step 16 -2
- register (MIDI, transposed to C) 59 (55–63)
- degrees (maj): 1 0.21, 5 0.18, 6 0.14, 3 0.13, 4 0.12, 2 0.1
- chords: voices 3 (2.3–3.2), spread 8 st, inversion share 0.57 (0.42–0.75), changes/bar 1.29 (0.74–2.24), qualities maj 0.47, pow 0.26, min 0.18, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.05, 4-bar 0.1, longer 0.82; rhythm only: 1-bar 0.24, 2-bar 0.02, 4-bar 0.08, longer 0.66

**lead** (85 songs, in 0.87 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.8–3), off-16th onset share 0.12 (0.02–0.24)
- length 1.94 (1.47–2) 16ths, gate (length ÷ gap to next onset) 0.88 (0.76–0.98)
- velocity mean 104 ± 9.2 (flat files 0.23); accents step 1 +1, step 9 +1, step 5 +0; weakest step 2 -4, step 14 -2
- register (MIDI, transposed to C) 67 (64–71)
- degrees (maj): 1 0.21, 5 0.17, 3 0.15, 2 0.14, 6 0.13, 4 0.07
- intervals: repeat 0.2 (0.11–0.31), step 1–2 0.47 (0.37–0.54), skip 3–4 0.2 (0.14–0.26), leap 5–7 0.08 (0.04–0.12), octave 0 (0–0.02), descending share of moves 0.53 (0.48–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.01, 4-bar 0.06, longer 0.93; rhythm only: 1-bar 0.01, 2-bar 0.01, 4-bar 0.08, longer 0.91

**arp** (8 songs, in 0.08 of songs)
- onsets/bar 8 (6.8–10.8); steps with P ≥ .5: 1,3,4,5,6,7,8,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.6 (0–3.6), off-16th onset share 0.44 (0.35–0.5)
- length 0.92 (0.52–1.55) 16ths, gate (length ÷ gap to next onset) 0.52 (0.46–0.78)
- velocity mean 98 ± 11.9 (flat files 0.12); accents step 13 +4, step 11 +2, step 8 +2; weakest step 4 -4, step 2 -3
- register (MIDI, transposed to C) 62 (58–66)
- degrees (maj): 5 0.21, 6 0.17, 2 0.14, 1 0.11, 4 0.09, 3 0.08
- intervals: repeat 0.12 (0.06–0.28), step 1–2 0.29 (0.17–0.41), skip 3–4 0.2 (0.1–0.25), leap 5–7 0.15 (0.07–0.23), octave 0.06 (0.01–0.13), descending share of moves 0.5 (0.46–0.51)
- arp shape up 0.17, down 0.08, updown 0.22, random 0.53, static 0; spacing (16ths) {'2.0': 4, '1.0': 2, '3.0': 1, '1.5': 1}; octave span 0.94 (0.83–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.17, 2-bar 0, 4-bar 0.17, longer 0.67; rhythm only: 1-bar 0.17, 2-bar 0, 4-bar 0.17, longer 0.67

**seq** (25 songs, in 0.26 of songs)
- onsets/bar 6 (3–8); steps with P ≥ .5: 1,7; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.8 (1.2–4), off-16th onset share 0.12 (0.04–0.44)
- length 1.77 (1–1.98) 16ths, gate (length ÷ gap to next onset) 0.83 (0.59–0.92)
- velocity mean 89 ± 9.1 (flat files 0.24); accents step 14 +3, step 12 +3, step 8 +2; weakest step 4 -5, step 6 -5
- register (MIDI, transposed to C) 56 (55–60)
- degrees (maj): 1 0.27, 5 0.18, 3 0.15, 4 0.14, 2 0.08, 6 0.06
- intervals: repeat 0.29 (0.11–0.49), step 1–2 0.29 (0.17–0.54), skip 3–4 0.13 (0.08–0.2), leap 5–7 0.09 (0.03–0.12), octave 0 (0–0.01), descending share of moves 0.49 (0.4–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.11, 2-bar 0.06, 4-bar 0.11, longer 0.73; rhythm only: 1-bar 0.32, 2-bar 0, 4-bar 0.06, longer 0.62

**drums** (94 songs with a usable kit; flat-velocity files 0.07)
- families: kick_4otf 0.12, kick_1_and_9_only 0.58, snare_backbeat_5_13 0.64, snare_halftime_9 0.05, hat_16ths 0.09, hat_8ths 0.52, hat_offbeat_only 0.01, hat_none 0.07
- kick: hits/bar 3.6 (3–4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,11,15; vel 98 ± 9.1
- snare: hits/bar 2 (1.6–2.2), songs using 0.94, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 102 ± 5.7
- hat: hits/bar 7.4 (4.8–8.1), songs using 0.92, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 74 ± 14.7
- perc: hits/bar 1.9 (0–6), songs using 0.67, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 94 ± 10.1
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel 88 ± 8.9
- cymb: hits/bar 0.2 (0–0.5), songs using 0.38, P ≥ .5 at steps none, P ≥ .2 at 1; vel 82 ± 10.2
- open-hat share of hat hits 0.07, ride share of cymbals 0.43, fill-bar share 0.08

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 65 | 97 / 120 / 152 | 0.23 | 5 (4–6) | 0.88 (0.76–0.95) | 0.49 (0.39–0.54) | 0.68 | 0.05 | 0.11 | 0.1 | i iv VII III (0.13) |
| new | 20 | 96 / 119 / 158 | 0.35 | 3.5 (3–4.2) | 0.93 (0.77–0.98) | 0.47 (0.32–0.53) | 0.7 | 0.1 | 0.1 | 0.05 | i VI (0.43) |

### NEO SOUL (23 songs, 13 artists; sources {'lmd': 23}; distinctness 0.27)


Tempo p10/p50/p90 93 / 123 / 151; minor share 0.3.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| drum_hat_8ths | 0.29 | 0.52 | -0.23 |
| keys_len16 | 4.84 | 2.42 | +2.42 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.29 | 0.06 |
| i VI v V | 0.29 | 0.02 |
| #IV iv III VI | 0.14 | 0.07 |
| i V #iii V | 0.14 | 0.02 |
| i V II V | 0.14 | 0.01 |
| i V #iii I | 0.14 | 0.01 |
| #vi V I V | 0.14 | 0.01 |
| #vi vii I V | 0.14 | 0.01 |
| #vi vii bII V | 0.14 | 0.01 |
| #vi vii bII III | 0.14 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I iii | 0.12 | 0.01 |
| I iii I ii | 0.12 | 0.01 |
| I ii IV | 0.12 | 0.03 |
| I IV ii IV | 0.12 | 0.02 |
| I IV I V | 0.12 | 0.02 |
| I vi IV V | 0.12 | 0.03 |
| I V IV | 0.12 | 0.05 |
| I vi I IV | 0.12 | 0.01 |
| I vi IV vi | 0.12 | 0.01 |
| I bVII ii IV | 0.06 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 1096 songs, minor share 0.4; share of songs containing the loop ≥ 2×): I IV (maj) 0.15, I IV I V (maj) 0.09, I IV V IV (maj) 0.08, I IV V (maj) 0.07, I V IV (maj) 0.07, i iv (min) 0.06, I V I IV (maj) 0.05, I V vi IV (maj) 0.05. By era: 80s (146 songs, minor 0.2): I IV (maj) 0.28, I IV I V (maj) 0.25, I IV V (maj) 0.16, I V I IV (maj) 0.14; new (759 songs, minor 0.45): I IV (maj) 0.11, i iv (min) 0.07, I V IV (maj) 0.06, I IV I V (maj) 0.06

**bass** (21 songs, in 0.91 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0.1–2.8), off-16th onset share 0.06 (0–0.39)
- length 1.95 (1.23–2.94) 16ths, gate (length ÷ gap to next onset) 0.85 (0.62–0.91)
- velocity mean 105 ± 9.8 (flat files 0.29); accents step 1 +2, step 13 +1, step 8 +1; weakest step 16 -5, step 2 -3
- register (MIDI, transposed to C) 36 (34–41)
- degrees (maj): 1 0.2, 5 0.18, 4 0.14, 2 0.14, 6 0.11, 3 0.1
- intervals: repeat 0.38 (0.28–0.49), step 1–2 0.21 (0.17–0.29), skip 3–4 0.07 (0.03–0.13), leap 5–7 0.12 (0.09–0.32), octave 0.02 (0–0.06), descending share of moves 0.44 (0.42–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.01, 4-bar 0.17, longer 0.83; rhythm only: 1-bar 0.09, 2-bar 0, 4-bar 0.13, longer 0.77

**chord** (5 songs, in 0.22 of songs)
- onsets/bar 2.5 (2–4); steps with P ≥ .5: none; P ≥ .3: 1,5,9,15
- syncopation: LHL/bar 2.8 (2–4.3), off-16th onset share 0.44 (0–0.52)
- length 1.63 (0.67–1.93) 16ths, gate (length ÷ gap to next onset) 0.34 (0.33–0.54)
- velocity mean 93 ± 14 (flat files 0); accents step 12 +13, step 11 +6, step 10 +5; weakest step 6 -6, step 4 -6
- register (MIDI, transposed to C) 63 (60–69)
- degrees (maj): 5 0.36, 4 0.31, 1 0.17, 2 0.17, b2 0, b3 0
- chords: voices 2.4 (2–3), spread 10 st, inversion share 0.6 (0.41–0.8), changes/bar 1.47 (0–2.75), qualities min 0.42, pow 0.26, maj 0.16, sus 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.5, longer 0.5; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.5, longer 0.5

**pad** (16 songs, in 0.7 of songs)
- onsets/bar 2.5 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,15
- syncopation: LHL/bar 1.6 (0.3–3.1), off-16th onset share 0.05 (0.02–0.28)
- length 7.2 (2–10.14) 16ths, gate (length ÷ gap to next onset) 0.97 (0.71–1)
- velocity mean 91 ± 8.8 (flat files 0.25); accents step 4 +3, step 12 +2, step 13 +2; weakest step 14 -7, step 16 -4
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 5 0.2, 1 0.17, 4 0.14, 6 0.13, 3 0.12, 2 0.09
- chords: voices 2.6 (2.1–3.2), spread 8 st, inversion share 0.6 (0.34–0.69), changes/bar 1.11 (0.8–1.82), qualities pow 0.39, maj 0.32, min 0.15, min7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.18, longer 0.82; rhythm only: 1-bar 0.17, 2-bar 0, 4-bar 0.2, longer 0.62

**keys** (17 songs, in 0.74 of songs)
- onsets/bar 3 (2–4); steps with P ≥ .5: 1; P ≥ .3: 1,7,9,13,15
- syncopation: LHL/bar 1.8 (0.2–2.9), off-16th onset share 0.03 (0–0.25)
- length 4.84 (3.71–7.87) 16ths, gate (length ÷ gap to next onset) 0.98 (0.92–1)
- velocity mean 88 ± 11.6 (flat files 0.18); accents step 16 +6, step 8 +4, step 13 +3; weakest step 3 -3, step 14 -2
- register (MIDI, transposed to C) 62 (57–67)
- degrees (maj): 1 0.21, 5 0.17, 6 0.16, 4 0.12, 2 0.1, 3 0.09
- chords: voices 3.2 (3–3.8), spread 9 st, inversion share 0.6 (0.5–0.72), changes/bar 1.32 (1.14–1.65), qualities maj 0.39, min 0.24, min7 0.13, pow 0.11
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.27, longer 0.73; rhythm only: 1-bar 0.09, 2-bar 0, 4-bar 0.26, longer 0.65

**guitar** (18 songs, in 0.78 of songs)
- onsets/bar 6 (5–7.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.7 (0.9–2.9), off-16th onset share 0.18 (0.07–0.34)
- length 1.6 (0.89–2.62) 16ths, gate (length ÷ gap to next onset) 0.85 (0.48–1)
- velocity mean 73 ± 12 (flat files 0.22); accents step 13 +3, step 15 +2, step 1 +2; weakest step 2 -4, step 4 -4
- register (MIDI, transposed to C) 58 (52–62)
- degrees (maj): 1 0.25, 3 0.14, 2 0.13, 4 0.12, 5 0.11, 6 0.1
- chords: voices 2.9 (2.2–3.6), spread 9 st, inversion share 0.46 (0.28–0.6), changes/bar 0.99 (0.3–2.05), qualities maj 0.34, min 0.22, pow 0.21, maj7 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0, 4-bar 0.07, longer 0.84; rhythm only: 1-bar 0.14, 2-bar 0, 4-bar 0.05, longer 0.82

**lead** (17 songs, in 0.74 of songs)
- onsets/bar 6 (4–6); steps with P ≥ .5: 7,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 3 (2.1–3.8), off-16th onset share 0.22 (0.08–0.37)
- length 1.94 (1.43–2) 16ths, gate (length ÷ gap to next onset) 0.86 (0.76–0.95)
- velocity mean 90 ± 7.9 (flat files 0.23); accents step 15 +1, step 16 +1, step 7 +1; weakest step 6 -2, step 8 -2
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 1 0.2, 3 0.16, 5 0.14, 2 0.14, 6 0.1, 4 0.1
- intervals: repeat 0.18 (0.13–0.23), step 1–2 0.47 (0.35–0.52), skip 3–4 0.2 (0.13–0.29), leap 5–7 0.07 (0.04–0.1), octave 0.01 (0–0.02), descending share of moves 0.56 (0.48–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0, 4-bar 0.03, longer 0.92; rhythm only: 1-bar 0.05, 2-bar 0, 4-bar 0.06, longer 0.89

**arp** (2 songs, in 0.09 of songs)
- onsets/bar 8.5 (8.2–8.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,8,9,10,11,13,15
- syncopation: LHL/bar 1.8 (1.3–2.3), off-16th onset share 0.1 (0.05–0.16)
- length 1.45 (1.18–1.73) 16ths, gate (length ÷ gap to next onset) 0.73 (0.59–0.86)
- velocity mean 96 ± 14.6 (flat files 0.5); accents step 11 +1, step 13 +1, step 15 +1; weakest step 9 -2, step 3 -1
- register (MIDI, transposed to C) 46 (44–52)
- degrees (maj): 5 0.41, 1 0.26, 4 0.17, 2 0.16, b2 0, b3 0
- intervals: repeat 0.28 (0.23–0.33), step 1–2 0.15 (0.12–0.18), skip 3–4 0.13 (0.07–0.2), leap 5–7 0.21 (0.15–0.27), octave 0.16 (0.14–0.18), descending share of moves 0.56 (0.54–0.57)
- arp shape up 0.01, down 0.06, updown 0.68, random 0.25, static 0; spacing (16ths) {'2.0': 2}; octave span 1.35 (1.03–1.68)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.44, longer 0.56; rhythm only: 1-bar 0.08, 2-bar 0, 4-bar 0.44, longer 0.47

**seq** (5 songs, in 0.22 of songs)
- onsets/bar 6 (3–7); steps with P ≥ .5: 1,3,13; P ≥ .3: 1,3,4,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.6–4), off-16th onset share 0.19 (0.04–0.3)
- length 2 (0.76–2) 16ths, gate (length ÷ gap to next onset) 1 (0.48–1)
- velocity mean 102 ± 8.8 (flat files 0.4); accents step 10 +9, step 4 +6, step 1 +2; weakest step 2 -6, step 11 -5
- register (MIDI, transposed to C) 57 (55–60)
- degrees (maj): 1 0.24, 5 0.21, 6 0.13, 4 0.12, 2 0.11, 3 0.07
- intervals: repeat 0.27 (0.06–0.32), step 1–2 0.29 (0.08–0.35), skip 3–4 0.23 (0.22–0.24), leap 5–7 0.15 (0.1–0.28), octave 0 (0–0), descending share of moves 0.52 (0.51–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.03, longer 0.97; rhythm only: 1-bar 0.05, 2-bar 0, 4-bar 0.06, longer 0.89

**drums** (21 songs with a usable kit; flat-velocity files 0.14)
- families: kick_4otf 0.14, kick_1_and_9_only 0.52, snare_backbeat_5_13 0.57, snare_halftime_9 0.05, hat_16ths 0.14, hat_8ths 0.29, hat_offbeat_only 0.05, hat_none 0.1
- kick: hits/bar 3.2 (2.6–4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,9,15; vel 106 ± 8.3
- snare: hits/bar 2 (1.6–2), songs using 0.95, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 92 ± 7.2
- hat: hits/bar 7 (3–8), songs using 0.91, P ≥ .5 at steps 3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,6,7,8,9,10,11,13,14,15,16; vel 68 ± 13.4
- perc: hits/bar 5.3 (0.9–9), songs using 0.76, P ≥ .5 at steps 5,13, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 74 ± 9.7
- tom: hits/bar 0 (0–0), songs using 0.05, P ≥ .5 at steps none, P ≥ .2 at none; vel 44 ± 18.5
- cymb: hits/bar 0.2 (0–0.3), songs using 0.29, P ≥ .5 at steps none, P ≥ .2 at none; vel 78 ± 16.8
- open-hat share of hat hits 0.11, ride share of cymbals 0.17, fill-bar share 0

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 17 | 92 / 125 / 149 | 0.35 | 4 (3–5) | 0.86 (0.71–0.93) | 0.42 (0.21–0.48) | 0.65 | 0.12 | 0.2 | 0.07 | i iv (0.33) |

