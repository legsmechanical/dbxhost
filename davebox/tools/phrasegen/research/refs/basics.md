# BASICS (genre-less: every measured song) — reference statistics

**3963 songs measured** (5195 selected), 2814 artists; sources {'lmd': 3633, 'lamd': 272, 'freemidi': 58}; eras {'new': 1447, '80s': 1205, '90s': 373, '?': 938}. Every table: `analysis/out/basics_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **96 / 125 / 156**; file BPM q1/med/q3 93 / 118 / 130; minor share **0.38**.

## Findings

Every measured song pooled (3,963 songs, 2,814 artists): the genre-less prior. Bass 5 onsets/bar on 1, 7, 9, 13, 15 with a legato gate (.86); lead 4 onsets/bar, step motion 43 %, repeated notes 25 %; pads one chord per bar; kick 1 + 9 in 45 %, 4otf 22 %; snare backbeat 59 %; 8th hats 38 %. Minor 38 %. Loops: I–IV (25 % of major songs), i–iv (15 % of minor).

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.94 (0.69–1.24). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.15 | 0.05 |
| i VI VII | 0.1 | 0.04 |
| i VII | 0.1 | 0.02 |
| i VI | 0.09 | 0.03 |
| i VII VI VII | 0.07 | 0.01 |
| i III | 0.06 | 0.02 |
| i v | 0.06 | 0.02 |
| i VII VI | 0.05 | 0.01 |
| i III VII | 0.04 | 0.01 |
| i VI VII v | 0.04 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.25 | 0.07 |
| I IV I V | 0.17 | 0.02 |
| I IV V | 0.16 | 0.04 |
| I V | 0.15 | 0.03 |
| I V I IV | 0.15 | 0.02 |
| I V IV | 0.13 | 0.03 |
| I V IV V | 0.12 | 0.02 |
| I IV V IV | 0.11 | 0.01 |
| I V vi IV | 0.1 | 0.03 |
| I vi IV V | 0.1 | 0.02 |

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (3688 songs, in 0.93 of songs)
- onsets/bar 5 (4–7); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.1–1.9), off-16th onset share 0.04 (0–0.25)
- length 1.97 (1.37–3) 16ths, gate (length ÷ gap to next onset) 0.86 (0.67–0.98)
- velocity mean 100 ± 8.1 (flat files 0.35); accents step 1 +2, step 9 +1, step 5 +0; weakest step 16 -3, step 14 -2
- register (MIDI, transposed to C) 36 (33–38)
- degrees (maj): 1 0.27, 5 0.21, 4 0.15, 2 0.1, 6 0.1, 3 0.07
- intervals: repeat 0.42 (0.23–0.66), step 1–2 0.17 (0.07–0.28), skip 3–4 0.06 (0.02–0.12), leap 5–7 0.13 (0.05–0.26), octave 0.01 (0–0.06), descending share of moves 0.49 (0.44–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.06, 4-bar 0.12, longer 0.79; rhythm only: 1-bar 0.23, 2-bar 0.05, 4-bar 0.07, longer 0.65

**chord** (1080 songs, in 0.27 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.1 (1–3.3), off-16th onset share 0.17 (0–0.37)
- length 1.13 (0.72–2) 16ths, gate (length ÷ gap to next onset) 0.53 (0.38–0.81)
- velocity mean 92 ± 10.6 (flat files 0.24); accents step 1 +1, step 9 +1, step 13 +1; weakest step 2 -2, step 10 -1
- register (MIDI, transposed to C) 67 (62–72)
- degrees (maj): 1 0.21, 5 0.19, 3 0.13, 6 0.11, 2 0.11, 4 0.1
- chords: voices 2.2 (2–2.9), spread 8 st, inversion share 0.6 (0.26–0.92), changes/bar 1.61 (0.92–2.47), qualities pow 0.48, maj 0.31, min 0.14, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.08, 4-bar 0.13, longer 0.76; rhythm only: 1-bar 0.21, 2-bar 0.09, 4-bar 0.1, longer 0.59

**pad** (2444 songs, in 0.62 of songs)
- onsets/bar 2 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.4 (0–1.6), off-16th onset share 0 (0–0.12)
- length 8 (2.67–15.92) 16ths, gate (length ÷ gap to next onset) 0.99 (0.88–1)
- velocity mean 82 ± 9.7 (flat files 0.28); accents step 14 +1, step 13 +1, step 12 +1; weakest step 2 -1, step 6 -0
- register (MIDI, transposed to C) 64 (60–69)
- degrees (maj): 1 0.2, 5 0.18, 3 0.13, 6 0.12, 4 0.12, 2 0.11
- chords: voices 2.8 (2.1–3), spread 8 st, inversion share 0.5 (0.24–0.74), changes/bar 1.09 (0.84–1.62), qualities maj 0.41, pow 0.31, min 0.21, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.05, 4-bar 0.16, longer 0.79; rhythm only: 1-bar 0.22, 2-bar 0.06, 4-bar 0.09, longer 0.63

**keys** (2599 songs, in 0.66 of songs)
- onsets/bar 4 (2–7); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0.2–2.4), off-16th onset share 0.07 (0–0.27)
- length 2.25 (1.21–4.53) 16ths, gate (length ÷ gap to next onset) 0.92 (0.56–1)
- velocity mean 87 ± 11 (flat files 0.26); accents step 13 +1, step 1 +1, step 5 +0; weakest step 16 -2, step 2 -2
- register (MIDI, transposed to C) 63 (59–67)
- degrees (maj): 1 0.22, 5 0.18, 3 0.12, 4 0.11, 6 0.11, 2 0.11
- chords: voices 3 (2.5–3.3), spread 8 st, inversion share 0.5 (0.28–0.69), changes/bar 1.49 (0.98–2.22), qualities maj 0.45, pow 0.22, min 0.2, min7 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.05, 4-bar 0.11, longer 0.81; rhythm only: 1-bar 0.2, 2-bar 0.05, 4-bar 0.07, longer 0.68

**guitar** (2869 songs, in 0.72 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.4–2.9), off-16th onset share 0.1 (0–0.36)
- length 1.83 (0.97–2.15) 16ths, gate (length ÷ gap to next onset) 0.9 (0.5–1)
- velocity mean 85 ± 11.3 (flat files 0.25); accents step 1 +2, step 13 +1, step 5 +1; weakest step 2 -3, step 10 -2
- register (MIDI, transposed to C) 60 (55–63)
- degrees (maj): 1 0.24, 5 0.2, 3 0.12, 4 0.11, 2 0.11, 6 0.11
- chords: voices 2.9 (2.2–3.1), spread 8 st, inversion share 0.47 (0.13–0.71), changes/bar 1.17 (0.65–1.98), qualities pow 0.42, maj 0.36, min 0.14, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.05, 4-bar 0.12, longer 0.8; rhythm only: 1-bar 0.26, 2-bar 0.05, 4-bar 0.07, longer 0.62

**lead** (3177 songs, in 0.8 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.4 (1.5–3.2), off-16th onset share 0.09 (0.01–0.28)
- length 1.97 (1.48–2.35) 16ths, gate (length ÷ gap to next onset) 0.86 (0.68–0.99)
- velocity mean 100 ± 8.9 (flat files 0.33); accents step 1 +1, step 9 +1, step 5 +0; weakest step 2 -1, step 16 -1
- register (MIDI, transposed to C) 67 (65–72)
- degrees (maj): 1 0.21, 5 0.17, 3 0.15, 2 0.14, 6 0.11, 4 0.1
- intervals: repeat 0.25 (0.12–0.39), step 1–2 0.43 (0.3–0.54), skip 3–4 0.14 (0.08–0.22), leap 5–7 0.07 (0.03–0.12), octave 0 (0–0.01), descending share of moves 0.53 (0.49–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.03, 4-bar 0.07, longer 0.89; rhythm only: 1-bar 0.07, 2-bar 0.04, 4-bar 0.06, longer 0.83

**arp** (479 songs, in 0.12 of songs)
- onsets/bar 8 (7–11); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 1.7 (0.2–3.4), off-16th onset share 0.38 (0.14–0.5)
- length 1 (0.8–1.55) 16ths, gate (length ÷ gap to next onset) 0.84 (0.53–0.98)
- velocity mean 93 ± 9.9 (flat files 0.35); accents step 1 +2, step 9 +1, step 13 +1; weakest step 2 -1, step 16 -1
- register (MIDI, transposed to C) 68 (64–72)
- degrees (maj): 1 0.2, 5 0.19, 2 0.13, 3 0.12, 4 0.1, 6 0.1
- intervals: repeat 0.05 (0–0.15), step 1–2 0.26 (0.09–0.44), skip 3–4 0.23 (0.12–0.35), leap 5–7 0.19 (0.1–0.32), octave 0.01 (0–0.08), descending share of moves 0.49 (0.43–0.54)
- arp shape up 0.14, down 0.09, updown 0.19, random 0.56, static 0.01; spacing (16ths) {'2.0': 221, '1.0': 211, '1.5': 24, '1.25': 7, '1.75': 6}; octave span 0.83 (0.67–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.1, 4-bar 0.15, longer 0.68; rhythm only: 1-bar 0.41, 2-bar 0.06, 4-bar 0.06, longer 0.48

**seq** (935 songs, in 0.24 of songs)
- onsets/bar 7 (4–9); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 1.9 (0.3–3.5), off-16th onset share 0.28 (0–0.46)
- length 1.03 (0.79–1.98) 16ths, gate (length ÷ gap to next onset) 0.73 (0.5–0.98)
- velocity mean 92 ± 9.4 (flat files 0.36); accents step 1 +2, step 5 +1, step 13 +1; weakest step 2 -1, step 10 -1
- register (MIDI, transposed to C) 60 (58–63)
- degrees (maj): 1 0.26, 5 0.19, 4 0.11, 2 0.11, 3 0.11, 6 0.1
- intervals: repeat 0.36 (0.11–0.64), step 1–2 0.21 (0.03–0.42), skip 3–4 0.08 (0–0.18), leap 5–7 0.06 (0.01–0.16), octave 0 (0–0.02), descending share of moves 0.5 (0.45–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.08, 4-bar 0.15, longer 0.68; rhythm only: 1-bar 0.36, 2-bar 0.06, 4-bar 0.06, longer 0.52

**fx** (422 songs, in 0.11 of songs)
- onsets/bar 4 (2–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.3–2.9), off-16th onset share 0.02 (0–0.31)
- length 1.98 (0.98–4) 16ths, gate (length ÷ gap to next onset) 0.85 (0.5–1)
- velocity mean 86 ± 9.2 (flat files 0.34); accents step 1 +1, step 9 +0, step 12 +0; weakest step 16 -2, step 8 -1
- register (MIDI, transposed to C) 71 (67–74)
- degrees (maj): 1 0.22, 5 0.17, 2 0.13, 3 0.12, 6 0.1, 4 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.06, 4-bar 0.2, longer 0.68; rhythm only: 1-bar 0.31, 2-bar 0.07, 4-bar 0.11, longer 0.51

**drums** (3637 songs with a usable kit; flat-velocity files 0.17)
- families: kick_4otf 0.22, kick_1_and_9_only 0.45, snare_backbeat_5_13 0.59, snare_halftime_9 0.04, hat_16ths 0.1, hat_8ths 0.38, hat_offbeat_only 0.02, hat_none 0.1
- kick: hits/bar 3.5 (2.7–4), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13,15; vel 107 ± 5.6
- snare: hits/bar 2 (1.4–2.2), songs using 0.9, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 103 ± 5
- hat: hits/bar 7.2 (3.9–8), songs using 0.9, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 80 ± 11.1
- perc: hits/bar 1.7 (0–7.5), songs using 0.59, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,15; vel 79 ± 12.2
- tom: hits/bar 0 (0–0), songs using 0.05, P ≥ .5 at steps none, P ≥ .2 at none; vel 83 ± 5
- cymb: hits/bar 0.2 (0.1–1.2), songs using 0.44, P ≥ .5 at steps none, P ≥ .2 at 1; vel 84 ± 9.4
- open-hat share of hat hits 0.18, ride share of cymbals 0.32, fill-bar share 0.07

