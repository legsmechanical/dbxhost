# POP — reference statistics

**141 songs measured** (168 selected), 106 artists; sources {'lmd': 141}; eras {'80s': 30, 'new': 65, '?': 29, '90s': 17}; era splits: {'80s': 30, 'new': 65}. Every table: `analysis/out/pop_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **95 / 127 / 154**; file BPM q1/med/q3 92 / 117 / 131; minor share **0.34**.

## Findings

Pop's own set (141 songs, synthpop measured separately) is major 66 %, pads 79 %, chords changing ~1/bar; I–IV, I–vi–IV–V, I–V–IV. SYNTHPOP (149) differs by held pads (12 16ths vs 8), slower chord changes (0.8/bar) and 1-bar bass rhythm loops (37 % vs 22 %). KPOP, CITY POP and HYPERPOP have no measurable MIDI in these sources (chord sheets only); JPOP has 5 songs from one artist.

Flavours filed under this style: **SYNTHPOP** (149 songs), **KPOP** (0 songs), **JPOP** (5 songs), **CITY POP** (0 songs), **HYPERPOP** (0 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.97 (0.78–1.32). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI VII | 0.17 | 0.11 |
| i iv VI VII | 0.13 | 0.01 |
| i VI VII v | 0.13 | 0.04 |
| i iv VII | 0.11 | 0.01 |
| i VI VII VI | 0.11 | 0.01 |
| VI VII | 0.09 | 0.01 |
| i VII VI VII | 0.09 | 0.01 |
| i VI III VII | 0.09 | 0.01 |
| i VI iv | 0.09 | 0.01 |
| i iv VII III | 0.09 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.21 | 0.05 |
| I vi IV V | 0.17 | 0.03 |
| I V IV | 0.17 | 0.03 |
| I V vi IV | 0.14 | 0.03 |
| I IV V | 0.13 | 0.03 |
| I V IV V | 0.13 | 0.03 |
| I V I IV | 0.12 | 0.01 |
| I IV V IV | 0.1 | 0.01 |
| I IV I V | 0.1 | 0.01 |
| I V ii IV | 0.09 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 135965 songs, minor share 0.3; share of songs containing the loop ≥ 2×): I IV (maj) 0.2, I IV I V (maj) 0.14, I IV V (maj) 0.14, I V IV (maj) 0.13, I V I IV (maj) 0.12, I V vi IV (maj) 0.11, I IV V IV (maj) 0.11, I V IV V (maj) 0.11. By era: 80s (17295 songs, minor 0.2): I IV (maj) 0.29, I IV I V (maj) 0.25, I IV V (maj) 0.22, I V I IV (maj) 0.2; new (92786 songs, minor 0.33): I IV (maj) 0.17, I V IV (maj) 0.13, I V vi IV (maj) 0.13, I IV V (maj) 0.12

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (138 songs, in 0.98 of songs)
- onsets/bar 5 (4–7); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.6 (0.1–1.9), off-16th onset share 0.08 (0–0.29)
- length 1.89 (1.17–3) 16ths, gate (length ÷ gap to next onset) 0.83 (0.65–0.97)
- velocity mean 100 ± 7.7 (flat files 0.33); accents step 1 +1, step 9 +1, step 13 +1; weakest step 2 -6, step 14 -3
- register (MIDI, transposed to C) 36 (33–39)
- degrees (maj): 1 0.24, 5 0.2, 4 0.17, 2 0.12, 6 0.1, 3 0.08
- intervals: repeat 0.44 (0.29–0.69), step 1–2 0.15 (0.07–0.24), skip 3–4 0.05 (0.02–0.11), leap 5–7 0.13 (0.05–0.21), octave 0.01 (0–0.07), descending share of moves 0.5 (0.45–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.03, 4-bar 0.11, longer 0.85; rhythm only: 1-bar 0.21, 2-bar 0.03, 4-bar 0.04, longer 0.71

**chord** (48 songs, in 0.34 of songs)
- onsets/bar 4.8 (3–8); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1–3.6), off-16th onset share 0.23 (0.01–0.43)
- length 0.99 (0.57–2) 16ths, gate (length ÷ gap to next onset) 0.49 (0.33–0.78)
- velocity mean 98 ± 9.6 (flat files 0.23); accents step 8 +3, step 5 +1, step 12 +0; weakest step 2 -4, step 10 -1
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 1 0.25, 5 0.17, 3 0.12, 2 0.12, 6 0.11, 4 0.1
- chords: voices 2.3 (2–3), spread 8 st, inversion share 0.49 (0.27–0.73), changes/bar 1.35 (0.9–2.85), qualities maj 0.48, pow 0.27, min 0.17, min7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.01, 4-bar 0.13, longer 0.82; rhythm only: 1-bar 0.36, 2-bar 0.01, 4-bar 0.07, longer 0.55

**pad** (112 songs, in 0.79 of songs)
- onsets/bar 2 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.5 (0–1.8), off-16th onset share 0 (0–0.11)
- length 7.96 (2.84–15.9) 16ths, gate (length ÷ gap to next onset) 0.99 (0.9–1)
- velocity mean 83 ± 9.1 (flat files 0.21); accents step 13 +2, step 15 +2, step 5 +1; weakest step 2 -3, step 6 -3
- register (MIDI, transposed to C) 65 (60–69)
- degrees (maj): 1 0.2, 5 0.18, 6 0.13, 4 0.13, 3 0.12, 2 0.11
- chords: voices 2.9 (2.3–3.2), spread 9 st, inversion share 0.49 (0.23–0.67), changes/bar 1.29 (0.91–1.81), qualities maj 0.47, pow 0.23, min 0.2, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.02, 4-bar 0.18, longer 0.8; rhythm only: 1-bar 0.19, 2-bar 0.05, 4-bar 0.12, longer 0.64

**keys** (108 songs, in 0.77 of songs)
- onsets/bar 5 (3–8); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.2–2.4), off-16th onset share 0.05 (0–0.24)
- length 2.05 (1–4.58) 16ths, gate (length ÷ gap to next onset) 0.92 (0.55–1)
- velocity mean 85 ± 11.5 (flat files 0.31); accents step 13 +2, step 10 +2, step 1 +1; weakest step 2 -7, step 16 -3
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 1 0.2, 5 0.17, 6 0.13, 4 0.12, 3 0.12, 2 0.12
- chords: voices 3 (2.6–3.1), spread 8 st, inversion share 0.48 (0.31–0.68), changes/bar 1.44 (0.93–2.04), qualities maj 0.48, min 0.24, pow 0.19, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.05, 4-bar 0.09, longer 0.85; rhythm only: 1-bar 0.22, 2-bar 0.04, 4-bar 0.07, longer 0.66

**guitar** (97 songs, in 0.69 of songs)
- onsets/bar 6 (5–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.9 (0.3–3), off-16th onset share 0.14 (0–0.33)
- length 1.95 (0.97–3.33) 16ths, gate (length ÷ gap to next onset) 0.91 (0.53–1)
- velocity mean 85 ± 10.4 (flat files 0.19); accents step 1 +3, step 9 +1, step 13 +1; weakest step 16 -4, step 10 -2
- register (MIDI, transposed to C) 60 (57–65)
- degrees (maj): 1 0.22, 5 0.17, 6 0.12, 3 0.12, 4 0.12, 2 0.12
- chords: voices 2.9 (2.5–3.2), spread 8 st, inversion share 0.54 (0.32–0.71), changes/bar 1.24 (0.75–1.97), qualities maj 0.45, pow 0.25, min 0.22, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.03, 4-bar 0.08, longer 0.86; rhythm only: 1-bar 0.21, 2-bar 0.05, 4-bar 0.07, longer 0.67

**lead** (125 songs, in 0.89 of songs)
- onsets/bar 5 (4–5.5); steps with P ≥ .5: 1,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.5–3.4), off-16th onset share 0.05 (0.01–0.21)
- length 1.96 (1.62–2.18) 16ths, gate (length ÷ gap to next onset) 0.84 (0.68–0.96)
- velocity mean 100 ± 8.6 (flat files 0.38); accents step 9 +1, step 5 +1, step 13 +1; weakest step 2 -2, step 8 -2
- register (MIDI, transposed to C) 69 (66–72)
- degrees (maj): 1 0.2, 5 0.17, 2 0.16, 3 0.15, 6 0.12, 4 0.11
- intervals: repeat 0.26 (0.18–0.38), step 1–2 0.45 (0.36–0.54), skip 3–4 0.14 (0.09–0.22), leap 5–7 0.06 (0.04–0.11), octave 0 (0–0), descending share of moves 0.54 (0.5–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.01, 4-bar 0.03, longer 0.95; rhythm only: 1-bar 0.04, 2-bar 0.02, 4-bar 0.04, longer 0.9

**arp** (27 songs, in 0.19 of songs)
- onsets/bar 8 (8–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.5 (0.3–3.9), off-16th onset share 0.33 (0–0.5)
- length 0.98 (0.77–1.31) 16ths, gate (length ÷ gap to next onset) 0.79 (0.5–0.94)
- velocity mean 87 ± 12.6 (flat files 0.22); accents step 1 +4, step 5 +3, step 11 +0; weakest step 3 -2, step 12 -1
- register (MIDI, transposed to C) 69 (65–74)
- degrees (maj): 1 0.17, 5 0.17, 2 0.17, 4 0.15, 6 0.11, 3 0.11
- intervals: repeat 0.02 (0–0.11), step 1–2 0.25 (0.1–0.49), skip 3–4 0.2 (0.1–0.33), leap 5–7 0.27 (0.11–0.35), octave 0.02 (0–0.1), descending share of moves 0.5 (0.45–0.55)
- arp shape up 0.17, down 0.11, updown 0.17, random 0.54, static 0.01; spacing (16ths) {'2.0': 15, '1.0': 12}; octave span 0.75 (0.62–1.08)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.17, 4-bar 0.16, longer 0.67; rhythm only: 1-bar 0.47, 2-bar 0.06, 4-bar 0.05, longer 0.42

**seq** (40 songs, in 0.28 of songs)
- onsets/bar 7 (4–9.2); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 1.4 (0.1–3.8), off-16th onset share 0.23 (0.03–0.43)
- length 1 (0.67–2) 16ths, gate (length ÷ gap to next onset) 0.65 (0.43–0.99)
- velocity mean 90 ± 12.4 (flat files 0.38); accents step 3 +1, step 5 +1, step 1 +1; weakest step 10 -4, step 2 -2
- register (MIDI, transposed to C) 60 (58–64)
- degrees (maj): 1 0.23, 5 0.16, 3 0.13, 2 0.12, 6 0.11, 4 0.1
- intervals: repeat 0.4 (0.05–0.67), step 1–2 0.12 (0.01–0.31), skip 3–4 0.04 (0–0.12), leap 5–7 0.07 (0.01–0.22), octave 0 (0–0.07), descending share of moves 0.5 (0.45–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.09, 4-bar 0.21, longer 0.7; rhythm only: 1-bar 0.43, 2-bar 0.04, 4-bar 0, longer 0.53

**fx** (21 songs, in 0.15 of songs)
- onsets/bar 3.5 (2–5); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 2 (0.4–2.8), off-16th onset share 0 (0–0.31)
- length 1.98 (1.19–7.9) 16ths, gate (length ÷ gap to next onset) 0.67 (0.5–0.95)
- velocity mean 103 ± 8.2 (flat files 0.38); accents step 12 +8, step 9 +3, step 5 +2; weakest step 6 -12, step 2 -8
- register (MIDI, transposed to C) 74 (71–77)
- degrees (maj): 1 0.28, 5 0.17, 2 0.14, 3 0.11, 4 0.1, 6 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0, 4-bar 0.15, longer 0.77; rhythm only: 1-bar 0.23, 2-bar 0, 4-bar 0.08, longer 0.69

**drums** (132 songs with a usable kit; flat-velocity files 0.13)
- families: kick_4otf 0.25, kick_1_and_9_only 0.47, snare_backbeat_5_13 0.58, snare_halftime_9 0.06, hat_16ths 0.15, hat_8ths 0.36, hat_offbeat_only 0.01, hat_none 0.1
- kick: hits/bar 3.6 (2.8–4), songs using 0.97, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13,15; vel 110 ± 5.9
- snare: hits/bar 2 (1.2–2.2), songs using 0.94, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 106 ± 5.8
- hat: hits/bar 7.6 (4.4–9.2), songs using 0.91, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,7,8,9,10,11,12,13,15,16; vel 77 ± 12.7
- perc: hits/bar 5.6 (0.5–11.6), songs using 0.72, P ≥ .5 at steps 5,13, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 71 ± 15
- tom: hits/bar 0 (0–0), songs using 0.05, P ≥ .5 at steps none, P ≥ .2 at none; vel 88 ± 3
- cymb: hits/bar 0.3 (0.1–1.5), songs using 0.47, P ≥ .5 at steps none, P ≥ .2 at 1; vel 82 ± 7
- open-hat share of hat hits 0.18, ride share of cymbals 0.3, fill-bar share 0.07

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 30 | 94 / 129 / 141 | 0.37 | 5 (4–8) | 0.87 (0.75–0.98) | 0.46 (0.35–0.52) | 0.83 | 0.2 | 0.43 | 0.14 | i VI VII (0.36) |
| new | 65 | 99 / 129 / 158 | 0.31 | 5 (4–6) | 0.82 (0.57–0.93) | 0.46 (0.34–0.55) | 0.79 | 0.26 | 0.18 | 0.13 | i iv VI VII (0.21) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### SYNTHPOP (149 songs, 109 artists; sources {'lmd': 136, 'lamd': 13}; distinctness 0.33)


Tempo p10/p50/p90 100 / 124 / 144; minor share 0.42.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| pad_len16 | 12 | 7.96 | +4.04 |
| chord_changes_per_bar | 0.8 | 0.97 | -0.17 |
| bass_loop_1bar_rhythm | 0.36 | 0.21 | +0.15 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.21 | 0.08 |
| i iv i VI | 0.09 | 0 |
| i III VII | 0.07 | 0.01 |
| i VII VI VII | 0.07 | 0.02 |
| i VII i iv | 0.07 | 0.01 |
| i iv III VII | 0.07 | 0.01 |
| i VI | 0.07 | 0.01 |
| i III | 0.07 | 0.03 |
| i iv VI iv | 0.07 | 0 |
| i VI iv | 0.07 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.26 | 0.09 |
| I V | 0.15 | 0.03 |
| I vi IV | 0.12 | 0.03 |
| I V IV V | 0.11 | 0.01 |
| I V IV | 0.1 | 0.03 |
| I IV V IV | 0.1 | 0.01 |
| I vi IV V | 0.1 | 0.04 |
| I IV V | 0.1 | 0.01 |
| IV V vi | 0.08 | 0.02 |
| I IV vi IV | 0.07 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 5740 songs, minor share 0.42; share of songs containing the loop ≥ 2×): I IV (maj) 0.13, I V IV (maj) 0.09, I IV V (maj) 0.07, I IV V IV (maj) 0.07, i VI VII (min) 0.07, I V vi IV (maj) 0.07, I V IV V (maj) 0.06, I IV I V (maj) 0.06. By era: 80s (1251 songs, minor 0.35): I IV (maj) 0.17, I IV V IV (maj) 0.11, I IV V (maj) 0.11, I V IV (maj) 0.09; new (3883 songs, minor 0.45): I IV (maj) 0.11, I V IV (maj) 0.09, i VI VII (min) 0.07, I V vi IV (maj) 0.07

**bass** (137 songs, in 0.92 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0–2), off-16th onset share 0.02 (0–0.27)
- length 1.9 (1.25–2.33) 16ths, gate (length ÷ gap to next onset) 0.84 (0.6–0.97)
- velocity mean 102 ± 8 (flat files 0.43); accents step 1 +2, step 9 +1, step 13 +0; weakest step 6 -6, step 16 -2
- register (MIDI, transposed to C) 36 (34–41)
- degrees (maj): 1 0.29, 5 0.19, 4 0.16, 6 0.12, 2 0.11, 3 0.06
- intervals: repeat 0.43 (0.14–0.71), step 1–2 0.1 (0.03–0.25), skip 3–4 0.04 (0.01–0.11), leap 5–7 0.07 (0.03–0.18), octave 0.02 (0–0.22), descending share of moves 0.5 (0.45–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.07, 4-bar 0.19, longer 0.72; rhythm only: 1-bar 0.36, 2-bar 0.06, 4-bar 0.07, longer 0.51

**chord** (54 songs, in 0.36 of songs)
- onsets/bar 4.2 (3–7.9); steps with P ≥ .5: 1,7,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.8 (0.8–3), off-16th onset share 0.1 (0–0.37)
- length 1.12 (0.71–1.92) 16ths, gate (length ÷ gap to next onset) 0.51 (0.35–0.79)
- velocity mean 92 ± 9 (flat files 0.24); accents step 7 +1, step 9 +1, step 13 +1; weakest step 6 -5, step 14 -5
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 1 0.26, 5 0.2, 3 0.14, 6 0.1, 2 0.09, 4 0.09
- chords: voices 2.3 (2–2.9), spread 8 st, inversion share 0.59 (0.25–0.85), changes/bar 1.53 (0.95–2.17), qualities maj 0.39, pow 0.38, min 0.17, min7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.14, 4-bar 0.25, longer 0.59; rhythm only: 1-bar 0.3, 2-bar 0.12, 4-bar 0.18, longer 0.4

**pad** (107 songs, in 0.72 of songs)
- onsets/bar 1 (1–2.8); steps with P ≥ .5: 1; P ≥ .3: 1
- syncopation: LHL/bar 0.3 (0–1.4), off-16th onset share 0 (0–0.04)
- length 12 (3.79–15.98) 16ths, gate (length ÷ gap to next onset) 0.99 (0.85–1)
- velocity mean 85 ± 8.1 (flat files 0.41); accents step 12 +3, step 8 +2, step 3 +1; weakest step 2 -4, step 16 -2
- register (MIDI, transposed to C) 65 (60–69)
- degrees (maj): 1 0.2, 5 0.17, 3 0.14, 6 0.12, 4 0.12, 2 0.11
- chords: voices 2.8 (2.2–3.1), spread 9 st, inversion share 0.54 (0.12–0.71), changes/bar 0.98 (0.75–1.35), qualities maj 0.44, pow 0.25, min 0.23, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.04, 4-bar 0.2, longer 0.74; rhythm only: 1-bar 0.29, 2-bar 0.06, 4-bar 0.08, longer 0.58

**keys** (98 songs, in 0.66 of songs)
- onsets/bar 4 (2–7); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.8 (0.1–2.2), off-16th onset share 0.01 (0–0.23)
- length 2.29 (1.31–5.04) 16ths, gate (length ÷ gap to next onset) 0.88 (0.5–1)
- velocity mean 92 ± 9.6 (flat files 0.31); accents step 13 +1, step 5 +0, step 10 +0; weakest step 6 -3, step 12 -2
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 1 0.24, 5 0.18, 6 0.14, 2 0.12, 3 0.12, 4 0.1
- chords: voices 3 (2.3–3.1), spread 8 st, inversion share 0.5 (0.26–0.67), changes/bar 1.22 (0.87–1.92), qualities maj 0.46, pow 0.26, min 0.19, min7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.05, 4-bar 0.11, longer 0.82; rhythm only: 1-bar 0.24, 2-bar 0.02, 4-bar 0.05, longer 0.69

**guitar** (83 songs, in 0.56 of songs)
- onsets/bar 5 (3.2–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.8 (0.9–2.9), off-16th onset share 0.09 (0–0.38)
- length 1.29 (0.92–2.12) 16ths, gate (length ÷ gap to next onset) 0.83 (0.46–1)
- velocity mean 91 ± 11 (flat files 0.27); accents step 13 +1, step 7 +1, step 11 +0; weakest step 2 -6, step 4 -3
- register (MIDI, transposed to C) 60 (55–65)
- degrees (maj): 1 0.24, 5 0.19, 6 0.13, 3 0.12, 4 0.11, 2 0.1
- chords: voices 2.7 (2.1–3), spread 8 st, inversion share 0.45 (0.08–0.78), changes/bar 0.96 (0.53–1.58), qualities pow 0.52, maj 0.25, min 0.14, maj7 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.07, 4-bar 0.14, longer 0.78; rhythm only: 1-bar 0.27, 2-bar 0.05, 4-bar 0.11, longer 0.57

**lead** (121 songs, in 0.81 of songs)
- onsets/bar 4 (4–5); steps with P ≥ .5: 1,5,7,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.9–3.2), off-16th onset share 0.07 (0.01–0.24)
- length 1.96 (1.62–2.21) 16ths, gate (length ÷ gap to next onset) 0.84 (0.71–0.98)
- velocity mean 104 ± 8.8 (flat files 0.39); accents step 1 +1, step 9 +0, step 5 +0; weakest step 16 -3, step 2 -2
- register (MIDI, transposed to C) 68 (64–72)
- degrees (maj): 1 0.22, 5 0.16, 3 0.14, 2 0.14, 6 0.13, 4 0.09
- intervals: repeat 0.29 (0.15–0.39), step 1–2 0.4 (0.29–0.51), skip 3–4 0.15 (0.09–0.22), leap 5–7 0.08 (0.04–0.13), octave 0 (0–0.01), descending share of moves 0.53 (0.49–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.05, 4-bar 0.07, longer 0.85; rhythm only: 1-bar 0.1, 2-bar 0.04, 4-bar 0.06, longer 0.81

**arp** (21 songs, in 0.14 of songs)
- onsets/bar 8 (8–16); steps with P ≥ .5: 1,3,4,5,6,7,8,9,10,11,12,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.9 (0–3.1), off-16th onset share 0.44 (0–0.5)
- length 0.68 (0.5–1.04) 16ths, gate (length ÷ gap to next onset) 0.5 (0.4–0.88)
- velocity mean 88 ± 8.8 (flat files 0.19); accents step 1 +2, step 6 +1, step 7 +1; weakest step 12 -2, step 16 -1
- register (MIDI, transposed to C) 67 (65–74)
- degrees (maj): 1 0.23, 5 0.23, 2 0.11, 6 0.11, 4 0.11, 3 0.1
- intervals: repeat 0.04 (0–0.24), step 1–2 0.13 (0.06–0.3), skip 3–4 0.25 (0.12–0.48), leap 5–7 0.23 (0.12–0.32), octave 0.01 (0–0.11), descending share of moves 0.49 (0.37–0.54)
- arp shape up 0.16, down 0.07, updown 0.12, random 0.63, static 0.01; spacing (16ths) {'2.0': 11, '1.0': 10}; octave span 0.83 (0.75–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.14, 2-bar 0.3, 4-bar 0.04, longer 0.52; rhythm only: 1-bar 0.57, 2-bar 0.09, 4-bar 0, longer 0.34

**seq** (51 songs, in 0.34 of songs)
- onsets/bar 7 (4.5–10.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,15,16
- syncopation: LHL/bar 2 (0.3–3.6), off-16th onset share 0.33 (0–0.5)
- length 1 (0.76–2) 16ths, gate (length ÷ gap to next onset) 0.75 (0.49–0.97)
- velocity mean 87 ± 8.1 (flat files 0.39); accents step 1 +2, step 5 +2, step 9 +2; weakest step 3 -2, step 4 -2
- register (MIDI, transposed to C) 60 (58–63)
- degrees (maj): 1 0.27, 5 0.24, 2 0.12, 4 0.1, 6 0.1, 3 0.07
- intervals: repeat 0.34 (0.05–0.78), step 1–2 0.1 (0.01–0.3), skip 3–4 0.09 (0–0.21), leap 5–7 0.09 (0.01–0.29), octave 0 (0–0.03), descending share of moves 0.5 (0.47–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.14, 2-bar 0.1, 4-bar 0.21, longer 0.55; rhythm only: 1-bar 0.49, 2-bar 0.12, 4-bar 0.11, longer 0.28

**drums** (140 songs with a usable kit; flat-velocity files 0.19)
- families: kick_4otf 0.39, kick_1_and_9_only 0.36, snare_backbeat_5_13 0.67, snare_halftime_9 0.01, hat_16ths 0.11, hat_8ths 0.29, hat_offbeat_only 0.07, hat_none 0.14
- kick: hits/bar 3.9 (3–4), songs using 0.99, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13; vel 109 ± 4.2
- snare: hits/bar 2 (1.7–2.3), songs using 0.91, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 4
- hat: hits/bar 7.2 (3.2–8.5), songs using 0.86, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,15,16; vel 80 ± 6.6
- perc: hits/bar 3.3 (0–7.9), songs using 0.64, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,15,16; vel 73 ± 10.2
- tom: hits/bar 0 (0–0), songs using 0.07, P ≥ .5 at steps none, P ≥ .2 at none; vel 83 ± 3.9
- cymb: hits/bar 0.2 (0–0.6), songs using 0.37, P ≥ .5 at steps none, P ≥ .2 at none; vel 87 ± 6.4
- open-hat share of hat hits 0.2, ride share of cymbals 0.29, fill-bar share 0.06

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 62 | 101 / 125 / 144 | 0.45 | 6 (4–8) | 0.8 (0.52–0.94) | 0.36 (0.22–0.47) | 0.82 | 0.14 | 0.39 | 0.12 | i iv (0.36) |
| new | 65 | 105 / 124 / 144 | 0.4 | 6 (4–8) | 0.9 (0.74–0.98) | 0.44 (0.33–0.52) | 0.61 | 0.11 | 0.45 | 0.14 | i iv (0.12) |

### KPOP (0 songs, 0 artists; sources {}; distinctness –)


_No measurable songs in the sources (see README, weak spots)._

Chord-sheet cross-check (Chordonomicon, 4326 songs, minor share 0.33; share of songs containing the loop ≥ 2×): I IV (maj) 0.21, I V vi IV (maj) 0.16, I V IV (maj) 0.16, I IV I V (maj) 0.15, I IV V (maj) 0.12, I IV V IV (maj) 0.12, I vi V IV (maj) 0.11, I V I IV (maj) 0.1. By era: new (3775 songs, minor 0.33): I IV (maj) 0.21, I V vi IV (maj) 0.17, I V IV (maj) 0.16, I IV I V (maj) 0.15

### JPOP (5 songs, 1 artists; sources {'lmd': 5}; distinctness 0.92)


Tempo p10/p50/p90 96 / 134 / 160; minor share 0.8.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| keys_presence | 0.2 | 0.77 | -0.57 |
| chord_changes_per_bar | 0.49 | 0.97 | -0.48 |
| minor_share | 0.8 | 0.34 | +0.46 |
| guitar_register_med | 44 | 60 | -16.00 |
| bass_iv_repeat | 0.79 | 0.44 | +0.35 |
| drum_open_hat_share | 0.5 | 0.18 | +0.33 |
| guitar_presence | 1 | 0.69 | +0.31 |
| seq_presence | 0 | 0.28 | -0.28 |
| lead_register_med | 58 | 69 | -11.00 |
| drum_kick_4otf | 0 | 0.25 | -0.25 |
| bass_onsets_per_bar | 8 | 5 | +3.00 |
| arp_presence | 0.4 | 0.19 | +0.21 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI VII | 0.5 | 0.1 |
| i III VI | 0.5 | 0.09 |
| i bII | 0.25 | 0.05 |
| i bII i VII | 0.25 | 0.04 |
| i VII i bII | 0.25 | 0.03 |
| i VII | 0.25 | 0.01 |
| i VI VII bII | 0.25 | 0.01 |
| i I v I | 0.25 | 0.01 |
| i VI | 0.25 | 0.12 |
| i v VI VII | 0.25 | 0.07 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 1 | 0.34 |
| IV vi ii vi | 1 | 0.29 |
| I IV I V | 1 | 0.08 |
| I V I IV | 1 | 0.08 |
| I V | 1 | 0.05 |
| I V vi V | 1 | 0.1 |
| IV V vi V | 1 | 0.05 |

Chord-sheet cross-check (Chordonomicon, 2089 songs, minor share 0.39; share of songs containing the loop ≥ 2×): I IV V (maj) 0.21, I V IV V (maj) 0.17, I vi IV V (maj) 0.16, I V vi IV (maj) 0.14, i VI VII (min) 0.14, I V vi V (maj) 0.12, i VII VI VII (min) 0.12, I IV V IV (maj) 0.11. By era: 80s (38 songs, minor 0.32): I vi ii V (maj) 0.26, I V IV V (maj) 0.21, I IV (maj) 0.18, I IV V (maj) 0.18; new (1005 songs, minor 0.41): I IV V (maj) 0.19, i VI VII (min) 0.15, I V IV V (maj) 0.15, I V vi IV (maj) 0.14

### CITY POP (0 songs, 0 artists; sources {}; distinctness –)


_No measurable songs in the sources (see README, weak spots)._

Chord-sheet cross-check (Chordonomicon, 304 songs, minor share 0.31; share of songs containing the loop ≥ 2×): I IV V (maj) 0.14, I IV (maj) 0.14, I vi ii V (maj) 0.14, I IV ii V (maj) 0.11, I vi IV V (maj) 0.09, I IV I V (maj) 0.09, i iv VII III (min) 0.08, I V I IV (maj) 0.08. By era: 80s (70 songs, minor 0.31): I IV V (maj) 0.21, I vi ii V (maj) 0.17, I IV ii V (maj) 0.14, I IV (maj) 0.14; new (154 songs, minor 0.31): I IV (maj) 0.13, I vi ii V (maj) 0.12, I IV V (maj) 0.12, I IV ii V (maj) 0.1

### HYPERPOP (0 songs, 0 artists; sources {}; distinctness –)


_No measurable songs in the sources (see README, weak spots)._

Chord-sheet cross-check (Chordonomicon, 329 songs, minor share 0.46; share of songs containing the loop ≥ 2×): I IV (maj) 0.1, I V vi IV (maj) 0.08, i VI VII (min) 0.07, i VII VI (min) 0.06, I IV V (maj) 0.06, I V IV (maj) 0.06, I vi IV V (maj) 0.06, i VI (min) 0.06. By era: new (271 songs, minor 0.49): I IV (maj) 0.08, i VI VII (min) 0.07, i VII VI (min) 0.07, I V vi IV (maj) 0.07

