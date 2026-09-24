# HARDCORE — reference statistics

**38 songs measured** (52 selected), 25 artists; sources {'lamd': 12, 'lmd': 25, 'freemidi': 1}; eras {'?': 21, 'new': 14, '90s': 1, '80s': 2}; era splits: {'new': 14}. Every table: `analysis/out/hardcore_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **112 / 148 / 172**; file BPM q1/med/q3 128 / 148 / 156; minor share **0.5**.

## Findings

Tempo p50 148 (file BPM q1–q3 128–156), the fastest measured style, and the flattest kick velocity (SD 1.1). Kick 4otf 48 %, arps in 34 % of songs (the highest arp presence), short keys stabs (gate .5). Mostly happy hardcore / hardstyle / Scooter-era rave; no gabber-tempo files survived.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.8 (0.47–0.94). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI | 0.18 | 0.02 |
| VI VII | 0.18 | 0.03 |
| i III VI | 0.12 | 0.02 |
| i iv | 0.12 | 0.03 |
| i VI VII VI | 0.12 | 0.01 |
| i VII | 0.12 | 0.08 |
| i III | 0.12 | 0.08 |
| i III i VI | 0.12 | 0.01 |
| i VI III iv | 0.06 | 0.01 |
| i VI III VII | 0.06 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.39 | 0.15 |
| I IV I V | 0.17 | 0.04 |
| I V I IV | 0.17 | 0.03 |
| I V | 0.17 | 0.12 |
| I vi IV | 0.11 | 0.02 |
| I V vi | 0.11 | 0.03 |
| I V vi IV | 0.11 | 0.04 |
| I IV V IV | 0.11 | 0.01 |
| I vi V ii | 0.11 | 0.05 |
| IV v ii v | 0.06 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 120 songs, minor share 0.36; share of songs containing the loop ≥ 2×): I IV (maj) 0.18, I IV I V (maj) 0.14, I V I IV (maj) 0.12, I V IV (maj) 0.1, i VI VII (min) 0.1, I V vi IV (maj) 0.09, I IV V (maj) 0.07, I V (maj) 0.07. By era: new (74 songs, minor 0.41): I IV (maj) 0.16, i VI VII (min) 0.12, I V IV (maj) 0.11, I IV I V (maj) 0.11

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (32 songs, in 0.84 of songs)
- onsets/bar 4.5 (4–8); steps with P ≥ .5: 1,3,7,11,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (0.5–6.6), off-16th onset share 0.09 (0–0.24)
- length 1.9 (1.15–1.98) 16ths, gate (length ÷ gap to next onset) 0.57 (0.5–0.84)
- velocity mean 100 ± 9.1 (flat files 0.72); accents step 1 +3, step 11 +2, step 7 +2; weakest step 4 -5, step 12 -5
- register (MIDI, transposed to C) 36 (34–39)
- degrees (min): 1 0.42, b7 0.16, b3 0.13, b6 0.09, 4 0.08, 5 0.05
- intervals: repeat 0.64 (0.37–0.82), step 1–2 0.08 (0.03–0.2), skip 3–4 0.03 (0–0.07), leap 5–7 0.02 (0–0.06), octave 0 (0–0.05), descending share of moves 0.5 (0.45–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.06, 4-bar 0.31, longer 0.58; rhythm only: 1-bar 0.44, 2-bar 0.12, 4-bar 0.06, longer 0.39

**chord** (11 songs, in 0.29 of songs)
- onsets/bar 6.5 (5–7); steps with P ≥ .5: 1,3,5,8,9,11,13,15; P ≥ .3: 1,3,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 3.5 (2–4.8), off-16th onset share 0.29 (0.11–0.42)
- length 1.46 (0.92–1.97) 16ths, gate (length ÷ gap to next onset) 0.62 (0.47–0.75)
- velocity mean 72 ± 24.5 (flat files 0.55); accents step 13 +17, step 9 +14, step 3 +11; weakest step 8 -24, step 14 -19
- register (MIDI, transposed to C) 64 (60–74)
- degrees (min): 1 0.35, b7 0.14, 4 0.12, 2 0.1, b3 0.09, b6 0.09
- chords: voices 3 (2–3), spread 10 st, inversion share 0.8 (0.29–0.93), changes/bar 1.56 (0.8–2.47), qualities pow 0.71, min 0.14, sus 0.12, maj 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.2, 4-bar 0.27, longer 0.53; rhythm only: 1-bar 0.26, 2-bar 0.3, 4-bar 0.12, longer 0.33

**pad** (25 songs, in 0.66 of songs)
- onsets/bar 2 (1–5); steps with P ≥ .5: 1; P ≥ .3: 1,5,9
- syncopation: LHL/bar 0.9 (0–1.4), off-16th onset share 0 (0–0.2)
- length 7.89 (1.04–15.98) 16ths, gate (length ÷ gap to next onset) 0.98 (0.72–1)
- velocity mean 82 ± 11.6 (flat files 0.44); accents step 8 +4, step 7 +2, step 5 +1; weakest step 10 -7, step 6 -2
- register (MIDI, transposed to C) 67 (65–74)
- degrees (min): 1 0.27, 5 0.2, b3 0.19, 4 0.09, 2 0.08, b7 0.08
- chords: voices 2.7 (2–3.5), spread 12 st, inversion share 0.4 (0–0.77), changes/bar 0.96 (0.71–1.93), qualities pow 0.42, maj 0.28, min 0.26, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.22, longer 0.71; rhythm only: 1-bar 0.24, 2-bar 0.1, 4-bar 0.17, longer 0.49

**keys** (27 songs, in 0.71 of songs)
- onsets/bar 6 (4.5–8); steps with P ≥ .5: 1,3,5,7,11,13,15; P ≥ .3: 1,3,5,7,8,9,11,13,15
- syncopation: LHL/bar 2.2 (0.8–4), off-16th onset share 0.2 (0.06–0.4)
- length 1 (0.72–1.98) 16ths, gate (length ÷ gap to next onset) 0.5 (0.47–0.86)
- velocity mean 83 ± 13.8 (flat files 0.52); accents step 13 +7, step 15 +2, step 5 +2; weakest step 2 -15, step 14 -14
- register (MIDI, transposed to C) 64 (60–69)
- degrees (min): 1 0.35, b3 0.15, 5 0.12, b7 0.12, 2 0.09, 4 0.09
- chords: voices 2.6 (2–3), spread 8 st, inversion share 0.26 (0–0.65), changes/bar 1.49 (0.95–2.07), qualities maj 0.39, pow 0.38, min 0.2, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.09, 4-bar 0.05, longer 0.78; rhythm only: 1-bar 0.39, 2-bar 0.09, 4-bar 0.01, longer 0.51

**guitar** (12 songs, in 0.32 of songs)
- onsets/bar 6 (4–10.1); steps with P ≥ .5: 1,3,5,9,13,15; P ≥ .3: 1,3,5,6,7,8,9,11,12,13,14,15
- syncopation: LHL/bar 2.8 (1.5–3.8), off-16th onset share 0.29 (0.19–0.44)
- length 0.85 (0.67–2.69) 16ths, gate (length ÷ gap to next onset) 0.36 (0.3–0.88)
- velocity mean 98 ± 14.2 (flat files 0.25); accents step 5 +10, step 13 +4, step 1 +3; weakest step 12 -17, step 14 -15
- register (MIDI, transposed to C) 60 (55–64)
- degrees (min): b3 0.23, 5 0.21, 1 0.2, b7 0.19, 4 0.07, b6 0.04
- chords: voices 2.7 (2.6–3), spread 7 st, inversion share 0.99 (0.62–1), changes/bar 1.56 (0.58–1.85), qualities maj 0.37, min 0.28, pow 0.25, aug 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.23, longer 0.77; rhythm only: 1-bar 0.03, 2-bar 0.1, 4-bar 0.26, longer 0.62

**lead** (26 songs, in 0.68 of songs)
- onsets/bar 5 (4–6); steps with P ≥ .5: 1,5,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (1.1–3), off-16th onset share 0.06 (0–0.33)
- length 1.96 (1.27–2.41) 16ths, gate (length ÷ gap to next onset) 0.76 (0.57–0.98)
- velocity mean 89 ± 10.3 (flat files 0.31); accents step 9 +4, step 3 +2, step 12 +1; weakest step 2 -5, step 6 -5
- register (MIDI, transposed to C) 65 (64–68)
- degrees (min): 1 0.37, b3 0.19, 5 0.16, 4 0.09, b6 0.07, 2 0.06
- intervals: repeat 0.25 (0.05–0.42), step 1–2 0.23 (0.06–0.48), skip 3–4 0.07 (0–0.26), leap 5–7 0.07 (0.01–0.21), octave 0 (0–0.04), descending share of moves 0.55 (0.5–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0, 4-bar 0.25, longer 0.69; rhythm only: 1-bar 0.22, 2-bar 0.17, 4-bar 0.09, longer 0.52

**arp** (13 songs, in 0.34 of songs)
- onsets/bar 8 (6.5–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 1 (0.1–3.2), off-16th onset share 0.26 (0–0.36)
- length 1.54 (1–1.96) 16ths, gate (length ÷ gap to next onset) 0.98 (0.87–0.98)
- velocity mean 94 ± 15.4 (flat files 0.54); accents step 1 +4, step 9 +3, step 15 +2; weakest step 14 -6, step 2 -5
- register (MIDI, transposed to C) 72 (69–74)
- degrees (min): 1 0.27, 5 0.17, b3 0.16, b7 0.1, b6 0.1, 2 0.08
- intervals: repeat 0.02 (0–0.09), step 1–2 0.06 (0.01–0.38), skip 3–4 0.29 (0.22–0.4), leap 5–7 0.19 (0.14–0.33), octave 0.03 (0–0.13), descending share of moves 0.43 (0.33–0.49)
- arp shape up 0.16, down 0.06, updown 0.23, random 0.54, static 0.01; spacing (16ths) {'2.0': 8, '1.0': 3, '1.5': 1, '2.5': 1}; octave span 0.83 (0.67–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.02, 4-bar 0.29, longer 0.63; rhythm only: 1-bar 0.36, 2-bar 0.08, 4-bar 0.02, longer 0.54

**seq** (11 songs, in 0.29 of songs)
- onsets/bar 8 (6–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,13,14,15
- syncopation: LHL/bar 2 (0.4–3.3), off-16th onset share 0.37 (0.16–0.5)
- length 0.67 (0.5–1.81) 16ths, gate (length ÷ gap to next onset) 0.5 (0.41–0.71)
- velocity mean 63 ± 9.7 (flat files 0.64); accents step 1 +5, step 5 +5, step 13 +5; weakest step 2 -16, step 16 -4
- register (MIDI, transposed to C) 64 (60–69)
- degrees (min): 1 0.61, 5 0.18, b3 0.09, 4 0.07, 2 0.01, b7 0.01
- intervals: repeat 0.44 (0.23–0.89), step 1–2 0.05 (0.02–0.44), skip 3–4 0.04 (0.03–0.09), leap 5–7 0.05 (0.03–0.1), octave 0 (0–0.01), descending share of moves 0.44 (0.4–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.1, 2-bar 0, 4-bar 0.16, longer 0.74; rhythm only: 1-bar 0.46, 2-bar 0, 4-bar 0.04, longer 0.5

**fx** (6 songs, in 0.16 of songs)
- onsets/bar 3.5 (2–5); steps with P ≥ .5: 1,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.6 (1.5–1.9), off-16th onset share 0 (0–0.05)
- length 2.01 (1.02–3.47) 16ths, gate (length ÷ gap to next onset) 0.73 (0.58–0.91)
- velocity mean 78 ± 7 (flat files 0.33); accents step 9 +1, step 1 +1, step 11 +0; weakest step 10 -67, step 2 -63
- register (MIDI, transposed to C) 68 (62–71)
- degrees (min): b3 0.54, 1 0.17, 5 0.12, 2 0.1, b7 0.04, 4 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.25, 4-bar 0.2, longer 0.55; rhythm only: 1-bar 0, 2-bar 0.25, 4-bar 0.2, longer 0.55

**drums** (29 songs with a usable kit; flat-velocity files 0.17)
- families: kick_4otf 0.48, kick_1_and_9_only 0.14, snare_backbeat_5_13 0.66, snare_halftime_9 0.1, hat_16ths 0.17, hat_8ths 0.17, hat_offbeat_only 0.03, hat_none 0.03
- kick: hits/bar 3.8 (3.1–4), songs using 0.97, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,5,9,13; vel 111 ± 1.1
- snare: hits/bar 2 (1.8–2.5), songs using 0.93, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 86 ± 8.4
- hat: hits/bar 8 (4–11.7), songs using 0.97, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 85 ± 5.8
- perc: hits/bar 3.6 (0–10.3), songs using 0.66, P ≥ .5 at steps none, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 59 ± 14.7
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.1 (0–0.4), songs using 0.34, P ≥ .5 at steps none, P ≥ .2 at none; vel 75 ± 0
- open-hat share of hat hits 0.18, ride share of cymbals 0.09, fill-bar share 0.05

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 14 | 124 / 148 / 167 | 0.64 | 4 (3.8–5.2) | 0.69 (0.48–0.89) | 0.34 (0.1–0.4) | 0.57 | 0.29 | 0.4 | 0.2 | i VI (0.25) |

