# DISCO — reference statistics

**121 songs measured** (140 selected), 93 artists; sources {'lmd': 112, 'lamd': 9}; eras {'80s': 77, '90s': 7, '?': 22, 'new': 15}; era splits: {'80s': 77, 'new': 15}. Every table: `analysis/out/disco_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **101 / 121 / 137**; file BPM q1/med/q3 105 / 120 / 126; minor share **0.32**.

## Findings

Major-leaning (minor 32 %), 16th or 8th hats on almost every step (hat P ≥ .8 on every 8th), open hats rare (13 %). Bass is busier than rock (6 onsets/bar) with moving lines (repeated-note share only .33). The kick is 4otf in 43 % and '1 + 9 only' in 37 % — disco files split between the four-on-the-floor and the older backbeat kick. I–IV and I–IV–I–V vamps dominate.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.94 (0.68–1.13). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.2 | 0.07 |
| i VI VII | 0.15 | 0.06 |
| i VII | 0.1 | 0.01 |
| i VI | 0.1 | 0.04 |
| i IV | 0.1 | 0.01 |
| i iv VII V | 0.1 | 0.02 |
| i IV i iv | 0.08 | 0 |
| i IV iv IV | 0.08 | 0.01 |
| i VI VII v | 0.08 | 0.01 |
| i III | 0.08 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.2 | 0.07 |
| I IV I V | 0.16 | 0.02 |
| I IV I ii | 0.14 | 0.01 |
| I ii | 0.11 | 0.04 |
| I V I IV | 0.11 | 0.01 |
| I ii IV | 0.1 | 0.01 |
| I vi ii V | 0.09 | 0.01 |
| I ii I IV | 0.09 | 0.01 |
| I IV ii IV | 0.09 | 0.02 |
| I IV I vi | 0.09 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 1858 songs, minor share 0.28; share of songs containing the loop ≥ 2×): I IV (maj) 0.21, I IV I V (maj) 0.16, I IV V (maj) 0.15, I V I IV (maj) 0.14, I V IV V (maj) 0.13, I V IV (maj) 0.12, I V (maj) 0.11, I IV V IV (maj) 0.1. By era: 80s (846 songs, minor 0.28): I IV (maj) 0.23, I IV V (maj) 0.14, I IV I V (maj) 0.14, I V I IV (maj) 0.1; new (692 songs, minor 0.3): I V IV (maj) 0.17, I IV (maj) 0.17, I V IV V (maj) 0.17, I V I IV (maj) 0.17

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (111 songs, in 0.92 of songs)
- onsets/bar 6 (4–7.5); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.2–1.9), off-16th onset share 0.07 (0–0.23)
- length 1.67 (1.17–2) 16ths, gate (length ÷ gap to next onset) 0.76 (0.6–0.94)
- velocity mean 102 ± 7.8 (flat files 0.27); accents step 1 +1, step 9 +1, step 5 +1; weakest step 6 -2, step 12 -2
- register (MIDI, transposed to C) 36 (34–40)
- degrees (maj): 1 0.28, 5 0.2, 2 0.12, 4 0.12, 6 0.11, 3 0.06
- intervals: repeat 0.33 (0.19–0.6), step 1–2 0.17 (0.08–0.31), skip 3–4 0.07 (0.03–0.13), leap 5–7 0.14 (0.06–0.27), octave 0.02 (0–0.08), descending share of moves 0.47 (0.42–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.06, 4-bar 0.08, longer 0.83; rhythm only: 1-bar 0.2, 2-bar 0.07, 4-bar 0.07, longer 0.66

**chord** (51 songs, in 0.42 of songs)
- onsets/bar 3 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.6–3.1), off-16th onset share 0.2 (0–0.37)
- length 0.96 (0.69–1.84) 16ths, gate (length ÷ gap to next onset) 0.43 (0.33–0.69)
- velocity mean 94 ± 8.6 (flat files 0.2); accents step 1 +1, step 13 +1, step 9 +1; weakest step 4 -2, step 2 -2
- register (MIDI, transposed to C) 67 (60–72)
- degrees (maj): 1 0.2, 5 0.17, 6 0.14, 3 0.12, 2 0.1, 4 0.09
- chords: voices 2.7 (2.1–3), spread 8 st, inversion share 0.51 (0.43–0.64), changes/bar 1.52 (0.96–2.01), qualities maj 0.4, pow 0.33, min 0.16, maj7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.11, 4-bar 0.22, longer 0.63; rhythm only: 1-bar 0.29, 2-bar 0.09, 4-bar 0.21, longer 0.41

**pad** (90 songs, in 0.74 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.9 (0.2–1.9), off-16th onset share 0.06 (0–0.22)
- length 5.27 (1.71–14.98) 16ths, gate (length ÷ gap to next onset) 0.97 (0.75–1)
- velocity mean 85 ± 8.4 (flat files 0.17); accents step 11 +2, step 14 +1, step 16 +1; weakest step 2 -4, step 6 -0
- register (MIDI, transposed to C) 67 (62–72)
- degrees (maj): 1 0.19, 5 0.17, 6 0.12, 4 0.12, 3 0.12, 2 0.1
- chords: voices 2.4 (2.1–3), spread 9 st, inversion share 0.56 (0.26–0.77), changes/bar 1.29 (0.88–2), qualities pow 0.35, maj 0.33, min 0.23, min7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.16, longer 0.76; rhythm only: 1-bar 0.19, 2-bar 0.07, 4-bar 0.15, longer 0.6

**keys** (94 songs, in 0.78 of songs)
- onsets/bar 4 (2–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.5–2.9), off-16th onset share 0.14 (0–0.32)
- length 2.31 (1.18–4) 16ths, gate (length ÷ gap to next onset) 0.74 (0.48–0.99)
- velocity mean 87 ± 9.9 (flat files 0.12); accents step 1 +0, step 9 +0, step 14 +0; weakest step 10 -2, step 8 -2
- register (MIDI, transposed to C) 63 (58–67)
- degrees (maj): 1 0.22, 5 0.16, 3 0.14, 4 0.12, 6 0.12, 2 0.1
- chords: voices 3.1 (2.9–3.7), spread 9 st, inversion share 0.5 (0.3–0.72), changes/bar 1.51 (1.05–2.16), qualities maj 0.43, min 0.25, pow 0.12, min7 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.05, 4-bar 0.14, longer 0.76; rhythm only: 1-bar 0.21, 2-bar 0.04, 4-bar 0.1, longer 0.64

**guitar** (82 songs, in 0.68 of songs)
- onsets/bar 7 (4–9.8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,6,7,9,11,12,13,15
- syncopation: LHL/bar 2 (0.7–4), off-16th onset share 0.28 (0–0.47)
- length 0.98 (0.63–1.91) 16ths, gate (length ÷ gap to next onset) 0.53 (0.38–0.91)
- velocity mean 85 ± 11.5 (flat files 0.12); accents step 1 +2, step 12 +1, step 9 +1; weakest step 2 -4, step 8 -4
- register (MIDI, transposed to C) 60 (57–63)
- degrees (maj): 1 0.25, 5 0.2, 4 0.11, 3 0.11, 6 0.11, 2 0.09
- chords: voices 2.8 (2.2–3.2), spread 8 st, inversion share 0.58 (0.39–0.88), changes/bar 1.01 (0.48–2.27), qualities maj 0.41, pow 0.32, min 0.2, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.04, 4-bar 0.18, longer 0.71; rhythm only: 1-bar 0.28, 2-bar 0.05, 4-bar 0.13, longer 0.54

**lead** (102 songs, in 0.84 of songs)
- onsets/bar 4 (3.6–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.8 (1.8–3.5), off-16th onset share 0.12 (0.02–0.25)
- length 1.96 (1.35–2.12) 16ths, gate (length ÷ gap to next onset) 0.8 (0.62–0.96)
- velocity mean 101 ± 8.3 (flat files 0.23); accents step 1 +1, step 4 +1, step 9 +1; weakest step 8 -1, step 11 -1
- register (MIDI, transposed to C) 69 (67–72)
- degrees (maj): 5 0.21, 1 0.21, 2 0.13, 3 0.13, 6 0.11, 4 0.09
- intervals: repeat 0.29 (0.15–0.41), step 1–2 0.43 (0.28–0.55), skip 3–4 0.15 (0.08–0.22), leap 5–7 0.05 (0.03–0.08), octave 0 (0–0.01), descending share of moves 0.52 (0.47–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.04, 4-bar 0.04, longer 0.91; rhythm only: 1-bar 0.03, 2-bar 0.05, 4-bar 0.05, longer 0.88

**arp** (18 songs, in 0.15 of songs)
- onsets/bar 8 (7–10); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.1 (0.9–3), off-16th onset share 0.4 (0.11–0.5)
- length 0.94 (0.7–1.3) 16ths, gate (length ÷ gap to next onset) 0.67 (0.64–0.96)
- velocity mean 86 ± 6.2 (flat files 0.33); accents step 1 +2, step 6 +2, step 2 +2; weakest step 16 -7, step 3 -5
- register (MIDI, transposed to C) 67 (61–70)
- degrees (maj): 1 0.2, 5 0.14, 4 0.12, 2 0.1, 6 0.09, 3 0.08
- intervals: repeat 0.03 (0–0.12), step 1–2 0.3 (0.07–0.49), skip 3–4 0.3 (0.07–0.45), leap 5–7 0.16 (0.06–0.28), octave 0.04 (0–0.18), descending share of moves 0.49 (0.41–0.54)
- arp shape up 0.16, down 0.05, updown 0.24, random 0.54, static 0.01; spacing (16ths) {'1.0': 11, '2.0': 7}; octave span 1 (0.75–1.21)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.34, 4-bar 0.25, longer 0.4; rhythm only: 1-bar 0.62, 2-bar 0.11, 4-bar 0.07, longer 0.2

**seq** (32 songs, in 0.26 of songs)
- onsets/bar 6 (3.9–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,12,13,15
- syncopation: LHL/bar 1.6 (0.3–3), off-16th onset share 0.25 (0.07–0.39)
- length 0.97 (0.5–1.62) 16ths, gate (length ÷ gap to next onset) 0.6 (0.28–0.98)
- velocity mean 90 ± 9.4 (flat files 0.38); accents step 5 +2, step 16 +2, step 15 +1; weakest step 6 -6, step 14 -2
- register (MIDI, transposed to C) 68 (62–71)
- degrees (maj): 1 0.23, 5 0.17, 3 0.16, 2 0.12, 6 0.1, 4 0.1
- intervals: repeat 0.37 (0.14–0.69), step 1–2 0.21 (0.01–0.49), skip 3–4 0.1 (0.02–0.24), leap 5–7 0.09 (0–0.18), octave 0 (0–0.01), descending share of moves 0.49 (0.41–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.1, 4-bar 0.08, longer 0.73; rhythm only: 1-bar 0.37, 2-bar 0.07, 4-bar 0, longer 0.56

**fx** (20 songs, in 0.17 of songs)
- onsets/bar 4.5 (2–6); steps with P ≥ .5: 1,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.1 (0.3–3.1), off-16th onset share 0.11 (0–0.49)
- length 1.25 (0.9–2.05) 16ths, gate (length ÷ gap to next onset) 0.62 (0.39–0.83)
- velocity mean 105 ± 5.5 (flat files 0.3); accents step 2 +7, step 12 +6, step 6 +4; weakest step 10 -2, step 13 -2
- register (MIDI, transposed to C) 74 (72–76)
- degrees (maj): 1 0.21, 5 0.16, 2 0.15, 4 0.11, 3 0.1, 6 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.08, 4-bar 0.21, longer 0.71; rhythm only: 1-bar 0.51, 2-bar 0.01, 4-bar 0.06, longer 0.42

**drums** (117 songs with a usable kit; flat-velocity files 0.08)
- families: kick_4otf 0.43, kick_1_and_9_only 0.37, snare_backbeat_5_13 0.71, snare_halftime_9 0.03, hat_16ths 0.17, hat_8ths 0.5, hat_offbeat_only 0.01, hat_none 0.03
- kick: hits/bar 3.9 (2.9–4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13; vel 109 ± 2.8
- snare: hits/bar 2 (1.8–2.2), songs using 0.95, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 104 ± 3.6
- hat: hits/bar 7.9 (7.1–10.4), songs using 0.97, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 80 ± 11
- perc: hits/bar 3.7 (0.1–9), songs using 0.69, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,6,7,8,9,10,11,12,13,15,16; vel 80 ± 11.8
- tom: hits/bar 0 (0–0), songs using 0.06, P ≥ .5 at steps none, P ≥ .2 at none; vel 78 ± 4.7
- cymb: hits/bar 0.2 (0.1–0.4), songs using 0.29, P ≥ .5 at steps none, P ≥ .2 at none; vel 76 ± 7.4
- open-hat share of hat hits 0.13, ride share of cymbals 0.17, fill-bar share 0.08

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 77 | 101 / 120 / 133 | 0.35 | 6 (4–8) | 0.78 (0.6–0.96) | 0.43 (0.28–0.57) | 0.73 | 0.13 | 0.42 | 0.21 | i iv (0.22) |
| new | 15 | 116 / 123 / 135 | 0.4 | 4.5 (4–5.8) | 0.72 (0.48–0.84) | 0.44 (0.24–0.54) | 0.8 | 0.27 | 0.31 | 0.08 | i VI VII (0.33) |

