# HIPHOP — reference statistics

**111 songs measured** (140 selected), 84 artists; sources {'lmd': 111}; eras {'90s': 22, '?': 46, '80s': 8, 'new': 35}; era splits: {'new': 35}. Every table: `analysis/out/hiphop_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **90 / 109 / 152**; file BPM q1/med/q3 90 / 99 / 120; minor share **0.56**.

## Findings

Tempo p50 109 folded (file BPM median 99), minor 56 %. Bass is sparse (4.5 onsets/bar, P ≥ .5 only on 1, 7, 9) and the kick carries the syncopation (step 11 P .31, step 8 .17). Loops are two-chord (i–iv 27 % of minor songs; I–IV 33 % of major). Hats are 8ths (37 %) or 16ths (17 %).

Flavours filed under this style: **TRAP** (21 songs), **LOFI** (4 songs), **BOOM BAP** (27 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.97 (0.68–1.26). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.27 | 0.13 |
| i VI VII | 0.11 | 0.03 |
| i iv v iv | 0.07 | 0.02 |
| i v | 0.07 | 0.02 |
| i VI i VII | 0.05 | 0 |
| VI v iv VII | 0.05 | 0.01 |
| i VII i iv | 0.05 | 0 |
| III iv v | 0.05 | 0.01 |
| III v iv v | 0.05 | 0 |
| III VI | 0.05 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.33 | 0.09 |
| I IV I V | 0.22 | 0.03 |
| I V I IV | 0.2 | 0.03 |
| I V IV | 0.18 | 0.05 |
| I V vi IV | 0.14 | 0.06 |
| I V IV V | 0.14 | 0.01 |
| I V | 0.14 | 0.03 |
| I IV V IV | 0.12 | 0.02 |
| I vi IV V | 0.12 | 0.04 |
| I IV V | 0.12 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 14534 songs, minor share 0.48; share of songs containing the loop ≥ 2×): I IV (maj) 0.09, I V vi IV (maj) 0.09, I V IV (maj) 0.06, i VI VII (min) 0.06, I IV V (maj) 0.06, I IV I V (maj) 0.05, i VI (min) 0.05, i iv (min) 0.05. By era: 80s (145 songs, minor 0.34): I IV (maj) 0.12, I V IV V (maj) 0.07, I IV V (maj) 0.07, I IV V IV (maj) 0.06; new (11368 songs, minor 0.51): I V vi IV (maj) 0.08, I IV (maj) 0.08, i VI VII (min) 0.06, i iv (min) 0.05

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (103 songs, in 0.93 of songs)
- onsets/bar 4.5 (3–6.2); steps with P ≥ .5: 1,7,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.2–2), off-16th onset share 0.08 (0–0.28)
- length 1.92 (1.25–3.32) 16ths, gate (length ÷ gap to next onset) 0.82 (0.56–0.98)
- velocity mean 98 ± 8.6 (flat files 0.32); accents step 1 +3, step 9 +1, step 5 +0; weakest step 2 -12, step 10 -8
- register (MIDI, transposed to C) 34 (31–36)
- degrees (min): 1 0.29, 5 0.14, 4 0.12, b6 0.12, b3 0.12, b7 0.1
- intervals: repeat 0.4 (0.21–0.59), step 1–2 0.19 (0.06–0.36), skip 3–4 0.05 (0–0.14), leap 5–7 0.14 (0.05–0.23), octave 0 (0–0.05), descending share of moves 0.49 (0.39–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.12, 4-bar 0.15, longer 0.67; rhythm only: 1-bar 0.21, 2-bar 0.13, 4-bar 0.13, longer 0.53

**chord** (22 songs, in 0.2 of songs)
- onsets/bar 4.5 (3–5.9); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1.2 (0.5–1.9), off-16th onset share 0.11 (0–0.31)
- length 0.98 (0.8–1.98) 16ths, gate (length ÷ gap to next onset) 0.49 (0.43–0.65)
- velocity mean 92 ± 9.2 (flat files 0.14); accents step 9 +2, step 11 +2, step 2 +1; weakest step 8 -6, step 14 -5
- register (MIDI, transposed to C) 66 (60–72)
- degrees (min): 1 0.32, b7 0.16, 5 0.12, b6 0.09, 4 0.08, b3 0.08
- chords: voices 2 (2–2.9), spread 9 st, inversion share 0.4 (0–0.69), changes/bar 1.63 (0.88–2.69), qualities maj 0.45, pow 0.35, min 0.13, sus 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.19, 4-bar 0.04, longer 0.7; rhythm only: 1-bar 0.28, 2-bar 0.13, 4-bar 0.03, longer 0.56

**pad** (63 songs, in 0.57 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0–2), off-16th onset share 0 (0–0.09)
- length 8.07 (2.04–15.96) 16ths, gate (length ÷ gap to next onset) 0.99 (0.83–1)
- velocity mean 88 ± 8.2 (flat files 0.24); accents step 4 +1, step 7 +1, step 13 +1; weakest step 8 -2, step 12 -1
- register (MIDI, transposed to C) 63 (58–67)
- degrees (min): 1 0.26, 5 0.18, b3 0.14, b7 0.1, 4 0.09, b6 0.09
- chords: voices 2.6 (2–3), spread 8 st, inversion share 0.45 (0.05–0.75), changes/bar 1.1 (0.85–1.71), qualities pow 0.4, maj 0.31, min 0.19, sus 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.13, 4-bar 0.17, longer 0.7; rhythm only: 1-bar 0.34, 2-bar 0.05, 4-bar 0.08, longer 0.53

**keys** (73 songs, in 0.66 of songs)
- onsets/bar 4 (2–6); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.7–2), off-16th onset share 0.11 (0–0.29)
- length 2.05 (1.33–4.58) 16ths, gate (length ÷ gap to next onset) 0.91 (0.64–0.99)
- velocity mean 94 ± 10.1 (flat files 0.32); accents step 12 +3, step 1 +2, step 14 +1; weakest step 3 -2, step 4 -2
- register (MIDI, transposed to C) 62 (58–65)
- degrees (min): 1 0.25, 5 0.18, b3 0.15, 4 0.09, 2 0.09, b7 0.08
- chords: voices 3 (2.3–3.4), spread 9 st, inversion share 0.4 (0.26–0.73), changes/bar 1.48 (1.01–2.11), qualities maj 0.39, pow 0.24, min 0.19, min7 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.12, 4-bar 0.08, longer 0.72; rhythm only: 1-bar 0.19, 2-bar 0.12, 4-bar 0.1, longer 0.59

**guitar** (69 songs, in 0.62 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.7 (1–2.7), off-16th onset share 0.21 (0–0.4)
- length 1.33 (0.83–2.3) 16ths, gate (length ÷ gap to next onset) 0.75 (0.5–1)
- velocity mean 83 ± 11.1 (flat files 0.19); accents step 1 +2, step 7 +1, step 13 +1; weakest step 8 -4, step 2 -3
- register (MIDI, transposed to C) 60 (55–63)
- degrees (min): 1 0.26, 5 0.16, b3 0.15, 4 0.12, b7 0.09, 2 0.07
- chords: voices 2.9 (2–3.1), spread 8 st, inversion share 0.6 (0.2–0.84), changes/bar 1.11 (0.45–2.26), qualities pow 0.4, maj 0.33, min 0.17, min7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.03, 4-bar 0.17, longer 0.74; rhythm only: 1-bar 0.23, 2-bar 0.03, 4-bar 0.09, longer 0.65

**lead** (88 songs, in 0.79 of songs)
- onsets/bar 5 (3–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.7 (1.6–3.5), off-16th onset share 0.15 (0.02–0.37)
- length 1.71 (1.3–2) 16ths, gate (length ÷ gap to next onset) 0.76 (0.63–0.94)
- velocity mean 102 ± 8.4 (flat files 0.27); accents step 1 +2, step 9 +1, step 5 +1; weakest step 7 -1, step 11 -1
- register (MIDI, transposed to C) 65 (62–68)
- degrees (min): 1 0.23, b3 0.19, 5 0.17, 2 0.11, 4 0.1, b7 0.09
- intervals: repeat 0.21 (0.08–0.34), step 1–2 0.43 (0.37–0.57), skip 3–4 0.14 (0.09–0.25), leap 5–7 0.06 (0.03–0.11), octave 0 (0–0.01), descending share of moves 0.53 (0.49–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.1, 4-bar 0.07, longer 0.82; rhythm only: 1-bar 0.06, 2-bar 0.1, 4-bar 0.08, longer 0.77

**arp** (18 songs, in 0.16 of songs)
- onsets/bar 8 (7–10); steps with P ≥ .5: 1,3,5,7,8,9,11,12,13,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.3 (1.2–4.1), off-16th onset share 0.38 (0.24–0.5)
- length 1 (0.94–1.81) 16ths, gate (length ÷ gap to next onset) 0.94 (0.62–0.99)
- velocity mean 99 ± 11.9 (flat files 0.33); accents step 13 +2, step 5 +2, step 1 +1; weakest step 2 -2, step 10 -2
- register (MIDI, transposed to C) 68 (65–70)
- degrees (min): 1 0.2, b3 0.19, 5 0.18, 4 0.11, b7 0.09, 2 0.08
- intervals: repeat 0.08 (0.04–0.17), step 1–2 0.35 (0.24–0.42), skip 3–4 0.24 (0.15–0.28), leap 5–7 0.21 (0.17–0.26), octave 0 (0–0.02), descending share of moves 0.5 (0.43–0.52)
- arp shape up 0.09, down 0.1, updown 0.14, random 0.66, static 0.01; spacing (16ths) {'2.0': 7, '1.0': 6, '1.75': 3, '1.5': 2}; octave span 0.83 (0.63–0.99)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.2, longer 0.8; rhythm only: 1-bar 0.31, 2-bar 0, 4-bar 0.04, longer 0.64

**seq** (26 songs, in 0.23 of songs)
- onsets/bar 6 (5–7.4); steps with P ≥ .5: 1,3,7,9; P ≥ .3: 1,3,4,5,7,9,11,12,13,15
- syncopation: LHL/bar 2 (1.7–3), off-16th onset share 0.32 (0.09–0.46)
- length 1.01 (0.71–1.96) 16ths, gate (length ÷ gap to next onset) 0.63 (0.52–0.81)
- velocity mean 94 ± 10.6 (flat files 0.23); accents step 1 +3, step 8 +1, step 15 +1; weakest step 2 -4, step 6 -2
- register (MIDI, transposed to C) 60 (56–61)
- degrees (min): 1 0.27, b3 0.15, 5 0.14, b6 0.11, 4 0.08, b7 0.07
- intervals: repeat 0.42 (0.2–0.68), step 1–2 0.21 (0.08–0.37), skip 3–4 0.15 (0.03–0.22), leap 5–7 0.08 (0.01–0.11), octave 0 (0–0.01), descending share of moves 0.5 (0.44–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.17, 4-bar 0.06, longer 0.75; rhythm only: 1-bar 0.25, 2-bar 0.05, 4-bar 0.07, longer 0.63

**fx** (17 songs, in 0.15 of songs)
- onsets/bar 5 (3–7); steps with P ≥ .5: 1,3,5,7,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.6–2), off-16th onset share 0.09 (0–0.21)
- length 1.9 (1.28–2.17) 16ths, gate (length ÷ gap to next onset) 0.93 (0.6–0.99)
- velocity mean 87 ± 10.1 (flat files 0.18); accents step 14 +11, step 12 +5, step 8 +3; weakest step 10 -6, step 16 -3
- register (MIDI, transposed to C) 74 (70–77)
- degrees (min): 1 0.42, 5 0.2, b3 0.12, 2 0.07, b6 0.07, b7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.29, longer 0.71; rhythm only: 1-bar 0.24, 2-bar 0, 4-bar 0.19, longer 0.57

**drums** (105 songs with a usable kit; flat-velocity files 0.17)
- families: kick_4otf 0.15, kick_1_and_9_only 0.47, snare_backbeat_5_13 0.69, snare_halftime_9 0.02, hat_16ths 0.17, hat_8ths 0.37, hat_offbeat_only 0.01, hat_none 0.12
- kick: hits/bar 3.6 (2.8–4.1), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13; vel 110 ± 6.3
- snare: hits/bar 1.9 (1.5–2.1), songs using 0.89, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 104 ± 5.1
- hat: hits/bar 7.7 (4.9–10), songs using 0.9, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 82 ± 10.6
- perc: hits/bar 2 (0–7.8), songs using 0.64, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,7,8,9,11,12,13,15,16; vel 76 ± 9.4
- tom: hits/bar 0 (0–0), songs using 0.02, P ≥ .5 at steps none, P ≥ .2 at none; vel 90 ± 6.5
- cymb: hits/bar 0.1 (0–0.3), songs using 0.28, P ≥ .5 at steps none, P ≥ .2 at none; vel 82 ± 7.4
- open-hat share of hat hits 0.12, ride share of cymbals 0.3, fill-bar share 0.02

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 35 | 90 / 109 / 151 | 0.54 | 4.5 (3–8) | 0.85 (0.5–0.99) | 0.4 (0.24–0.59) | 0.63 | 0.2 | 0.21 | 0.23 | i iv (0.28) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### TRAP (21 songs, 20 artists; sources {'lmd': 21}; distinctness 0.53)


Tempo p10/p50/p90 89 / 135 / 162; minor share 0.52.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| tempo_p50 | 135 | 109 | +26.00 |
| pad_len16 | 13.16 | 8.07 | +5.09 |
| drum_hat_hits_per_bar | 4 | 7.7 | -3.70 |
| drum_snare_backbeat_5_13 | 0.47 | 0.69 | -0.22 |
| pad_loop_1bar_rhythm | 0.14 | 0.34 | -0.20 |
| guitar_loop_1bar_rhythm | 0.04 | 0.23 | -0.19 |
| keys_loop_1bar_rhythm | 0.02 | 0.19 | -0.17 |
| keys_len16 | 4.2 | 2.05 | +2.15 |
| drum_snare_halftime_9 | 0.18 | 0.02 | +0.16 |
| chord_presence | 0.05 | 0.2 | -0.15 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI | 0.2 | 0.02 |
| i VII VI | 0.2 | 0 |
| i iv VII III | 0.2 | 0.02 |
| i iv VII | 0.2 | 0.04 |
| i III VII iv | 0.2 | 0.01 |
| i v i ii | 0.1 | 0.05 |
| i ii i v | 0.1 | 0.05 |
| i ii v | 0.1 | 0 |
| i VI VII III | 0.1 | 0.02 |
| III VII VI VII | 0.1 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| IV V iii vi | 0.33 | 0.09 |
| I vi IV V | 0.33 | 0.02 |
| IV V vi | 0.22 | 0.02 |
| IV V vi iii | 0.22 | 0.02 |
| I V IV V | 0.22 | 0.02 |
| I V vi IV | 0.22 | 0.05 |
| I vi IV | 0.22 | 0.01 |
| I V I IV | 0.22 | 0.02 |
| IV iv | 0.11 | 0.02 |
| #IV #iv #ivo bII | 0.11 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 1931 songs, minor share 0.51; share of songs containing the loop ≥ 2×): I IV (maj) 0.09, I V vi IV (maj) 0.08, i iv (min) 0.07, i VI (min) 0.07, i VI VII (min) 0.06, I V IV (maj) 0.06, I IV I V (maj) 0.05, I IV V (maj) 0.05. By era: new (1449 songs, minor 0.57): i iv (min) 0.09, i VI (min) 0.08, I IV (maj) 0.07, I V vi IV (maj) 0.07

**bass** (17 songs, in 0.81 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,15; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.2–1.4), off-16th onset share 0.01 (0–0.06)
- length 2 (1.68–3.46) 16ths, gate (length ÷ gap to next onset) 0.84 (0.71–0.94)
- velocity mean 105 ± 10.8 (flat files 0.23); accents step 1 +4, step 5 +2, step 8 +2; weakest step 16 -13, step 14 -7
- register (MIDI, transposed to C) 36 (32–36)
- degrees (min): 1 0.38, b7 0.19, b6 0.11, 5 0.09, 4 0.08, b3 0.06
- intervals: repeat 0.45 (0.27–0.73), step 1–2 0.31 (0.09–0.36), skip 3–4 0.08 (0.03–0.12), leap 5–7 0.09 (0.03–0.22), octave 0 (0–0.02), descending share of moves 0.45 (0.35–0.5)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.07, 4-bar 0.15, longer 0.77; rhythm only: 1-bar 0.08, 2-bar 0.08, 4-bar 0.14, longer 0.7

**chord** (1 songs, in 0.05 of songs)
- onsets/bar 15 (15–15); steps with P ≥ .5: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15
- syncopation: LHL/bar 0 (0–0), off-16th onset share 0.46 (0.46–0.46)
- length 0.5 (0.5–0.5) 16ths, gate (length ÷ gap to next onset) 0.5 (0.5–0.5)
- velocity mean 94 ± 17.4 (flat files 0); accents step 1 +10, step 9 +8, step 5 +8; weakest step 12 -11, step 10 -10
- register (MIDI, transposed to C) 67 (65–71)
- chords: voices 2.3 (2.3–2.3), spread 4 st, inversion share 0.7 (0.7–0.7), changes/bar 7.88 (7.88–7.88), qualities pow 0.7, min 0.3
- repetition in 8-bar windows (pitch+rhythm): 1-bar –, 2-bar –, 4-bar –, longer –; rhythm only: 1-bar –, 2-bar –, 4-bar –, longer –

**pad** (14 songs, in 0.67 of songs)
- onsets/bar 1 (1–2.8); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0.1–2), off-16th onset share 0.1 (0–0.21)
- length 13.16 (1.87–15.99) 16ths, gate (length ÷ gap to next onset) 0.93 (0.57–1)
- velocity mean 88 ± 10.3 (flat files 0.21); accents step 6 +8, step 3 +6, step 5 +5; weakest step 14 -5, step 10 -3
- register (MIDI, transposed to C) 67 (62–74)
- degrees (min): 1 0.2, b3 0.19, b7 0.14, 4 0.12, 5 0.12, b6 0.1
- chords: voices 2.8 (2–3), spread 12 st, inversion share 0.29 (0.19–0.47), changes/bar 1.07 (0.81–1.34), qualities maj 0.4, pow 0.31, min 0.22, dim 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.29, longer 0.71; rhythm only: 1-bar 0.14, 2-bar 0.07, 4-bar 0.44, longer 0.35

**keys** (15 songs, in 0.71 of songs)
- onsets/bar 3 (2–5); steps with P ≥ .5: 1; P ≥ .3: 1,7,9,13,15
- syncopation: LHL/bar 0.9 (0.3–3), off-16th onset share 0.04 (0–0.25)
- length 4.2 (1.27–7.82) 16ths, gate (length ÷ gap to next onset) 0.91 (0.69–0.98)
- velocity mean 88 ± 11.7 (flat files 0.27); accents step 3 +9, step 8 +2, step 6 +2; weakest step 10 -19, step 16 -7
- register (MIDI, transposed to C) 62 (60–65)
- degrees (min): 1 0.23, b3 0.21, 5 0.13, b7 0.12, 4 0.12, b6 0.08
- chords: voices 3 (2.9–3.3), spread 9 st, inversion share 0.52 (0.31–0.7), changes/bar 1.45 (1.13–2), qualities maj 0.45, min 0.29, min7 0.11, pow 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.08, 4-bar 0.1, longer 0.82; rhythm only: 1-bar 0.02, 2-bar 0.13, 4-bar 0.18, longer 0.67

**guitar** (12 songs, in 0.57 of songs)
- onsets/bar 7 (5.8–8); steps with P ≥ .5: 1,3,5,7,9,13,15; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0.6–2.7), off-16th onset share 0.21 (0.02–0.47)
- length 1.68 (1.02–2.67) 16ths, gate (length ÷ gap to next onset) 0.88 (0.73–1.04)
- velocity mean 91 ± 13.6 (flat files 0.08); accents step 1 +5, step 9 +5, step 7 +3; weakest step 2 -18, step 16 -16
- register (MIDI, transposed to C) 57 (54–60)
- degrees (min): 1 0.28, b3 0.16, b7 0.16, b6 0.12, 4 0.1, 5 0.1
- chords: voices 2.8 (2.3–3), spread 8 st, inversion share 0.36 (0.26–0.61), changes/bar 1.8 (0.83–2.3), qualities pow 0.4, maj 0.31, min 0.16, maj7 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.11, 4-bar 0.18, longer 0.7; rhythm only: 1-bar 0.04, 2-bar 0.14, 4-bar 0.17, longer 0.65

**lead** (16 songs, in 0.76 of songs)
- onsets/bar 4 (3–8); steps with P ≥ .5: 1,7,11,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.8–2.9), off-16th onset share 0.1 (0.02–0.17)
- length 1.96 (1.45–2.38) 16ths, gate (length ÷ gap to next onset) 0.86 (0.61–0.98)
- velocity mean 104 ± 12.2 (flat files 0.31); accents step 1 +4, step 9 +4, step 13 +2; weakest step 10 -6, step 14 -3
- register (MIDI, transposed to C) 67 (63–71)
- degrees (min): b3 0.24, 1 0.18, 4 0.14, 2 0.14, 5 0.12, b6 0.08
- intervals: repeat 0.19 (0.03–0.33), step 1–2 0.42 (0.34–0.52), skip 3–4 0.12 (0.05–0.26), leap 5–7 0.08 (0.03–0.14), octave 0 (0–0.04), descending share of moves 0.51 (0.44–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.04, 4-bar 0.03, longer 0.94; rhythm only: 1-bar 0.08, 2-bar 0.04, 4-bar 0.03, longer 0.86

**arp** (3 songs, in 0.14 of songs)
- onsets/bar 8 (8–9.2); steps with P ≥ .5: 3,5,7,9,11,12,13,15; P ≥ .3: 1,3,4,5,6,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 4.5 (2.7–4.8), off-16th onset share 0.4 (0.28–0.45)
- length 0.69 (0.59–1.11) 16ths, gate (length ÷ gap to next onset) 0.5 (0.39–0.75)
- velocity mean 106 ± 14.1 (flat files 0); accents step 13 +7, step 16 +7, step 7 +6; weakest step 2 -13, step 6 -12
- register (MIDI, transposed to C) 48 (48–51)
- degrees (min): b3 0.37, 1 0.33, b7 0.17, 4 0.07, 5 0.05, 6 0.01
- intervals: repeat 0.06 (0.03–0.15), step 1–2 0.32 (0.27–0.35), skip 3–4 0.19 (0.13–0.25), leap 5–7 0.2 (0.2–0.32), octave 0 (0–0.01), descending share of moves 0.5 (0.49–0.53)
- arp shape up 0.01, down 0, updown 0.11, random 0.88, static 0; spacing (16ths) {'1.0': 2, '2.0': 1}; octave span 0.67 (0.67–0.67)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.33, 2-bar 0, 4-bar 0, longer 0.67

**seq** (7 songs, in 0.33 of songs)
- onsets/bar 7 (5.5–9); steps with P ≥ .5: 1,3,4,5,6,8,11,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,13,14,15
- syncopation: LHL/bar 2 (0.8–4.7), off-16th onset share 0.45 (0.33–0.48)
- length 0.83 (0.61–1.31) 16ths, gate (length ÷ gap to next onset) 0.6 (0.46–0.72)
- velocity mean 96 ± 11.6 (flat files 0.43); accents step 2 +15, step 3 +6, step 9 +5; weakest step 7 -11, step 10 -6
- register (MIDI, transposed to C) 62 (60–64)
- degrees (min): 1 0.34, 2 0.28, b3 0.19, 5 0.11, 4 0.06, b6 0.03
- intervals: repeat 0.13 (0.04–0.39), step 1–2 0.38 (0.07–0.58), skip 3–4 0.09 (0.02–0.26), leap 5–7 0.14 (0.13–0.21), octave 0 (0–0.09), descending share of moves 0.43 (0.33–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.54, longer 0.46; rhythm only: 1-bar 0.26, 2-bar 0, 4-bar 0.3, longer 0.43

**drums** (17 songs with a usable kit; flat-velocity files 0.23)
- families: kick_4otf 0.12, kick_1_and_9_only 0.35, snare_backbeat_5_13 0.47, snare_halftime_9 0.18, hat_16ths 0.18, hat_8ths 0.23, hat_offbeat_only 0, hat_none 0.23
- kick: hits/bar 3.3 (2.6–4.1), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,11,13,15; vel 100 ± 8.4
- snare: hits/bar 1.6 (1.1–2), songs using 0.94, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 105 ± 5.5
- hat: hits/bar 4 (2.1–7.1), songs using 0.77, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,3,5,7,9,11,12,13,15; vel 82 ± 8.8
- perc: hits/bar 5.2 (0–6.1), songs using 0.65, P ≥ .5 at steps 5, P ≥ .2 at 1,3,4,5,6,7,9,11,12,13,14,15; vel 96 ± 14.6
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.2 (0–0.8), songs using 0.41, P ≥ .5 at steps none, P ≥ .2 at 1; vel 83 ± 11.5
- open-hat share of hat hits 0.05, ride share of cymbals 0.35, fill-bar share 0.08

### LOFI (4 songs, 4 artists; sources {'lmd': 4}; distinctness –)


Tempo p10/p50/p90 113 / 125 / 163; minor share 0.25.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VII IV III | 1 | 0.74 |
| i VII | 1 | 0.13 |
| i VII IV VII | 1 | 0.05 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V vi IV | 0.67 | 0.4 |
| I ivo | 0.33 | 0.29 |
| I ivo IV | 0.33 | 0.02 |
| I IV vi IV | 0.33 | 0.03 |
| IV vi V vi | 0.33 | 0.02 |
| IV vi | 0.33 | 0.02 |
| I vi IV | 0.33 | 0.04 |
| IV V IV vi | 0.33 | 0.01 |
| IV ii V vi | 0.33 | 0.05 |
| IV ii vi | 0.33 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 4394 songs, minor share 0.21; share of songs containing the loop ≥ 2×): I IV (maj) 0.24, I V IV (maj) 0.15, I IV V (maj) 0.13, I IV V IV (maj) 0.13, I IV I V (maj) 0.12, I V I IV (maj) 0.1, I V IV V (maj) 0.09, I V vi IV (maj) 0.07. By era: 80s (479 songs, minor 0.14): I IV (maj) 0.28, I V IV (maj) 0.18, I IV I V (maj) 0.18, I IV V (maj) 0.15; new (2997 songs, minor 0.23): I IV (maj) 0.23, I V IV (maj) 0.14, I IV V IV (maj) 0.12, I IV V (maj) 0.12

### BOOM BAP (27 songs, 20 artists; sources {'lmd': 27}; distinctness 0.63)


Tempo p10/p50/p90 88 / 96 / 149; minor share 0.78.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| pad_gate | 0.48 | 0.99 | -0.51 |
| pad_len16 | 1.58 | 8.07 | -6.49 |
| keys_gate | 0.64 | 0.91 | -0.27 |
| lead_loop_1bar_rhythm | 0.3 | 0.06 | +0.24 |
| bass_offbeat16_share | 0.31 | 0.08 | +0.23 |
| pad_loop_1bar_rhythm | 0.12 | 0.34 | -0.22 |
| keys_loop_1bar_rhythm | 0.41 | 0.19 | +0.22 |
| minor_share | 0.78 | 0.56 | +0.22 |
| tempo_p50 | 96 | 109 | -13.00 |
| bass_presence | 0.74 | 0.93 | -0.19 |
| drum_flat_share | 0.36 | 0.17 | +0.19 |
| lead_gate | 0.94 | 0.76 | +0.18 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.31 | 0.18 |
| i iv v iv | 0.12 | 0.03 |
| i VII | 0.12 | 0.01 |
| i iv i v | 0.06 | 0 |
| i v i iv | 0.06 | 0 |
| i III | 0.06 | 0.06 |
| i iv VI iv | 0.06 | 0.02 |
| i iv i VI | 0.06 | 0.01 |
| i VI iv | 0.06 | 0.01 |
| i VI iv VI | 0.06 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.5 | 0.39 |
| I V | 0.33 | 0.23 |
| I V v | 0.17 | 0.07 |

Chord-sheet cross-check (Chordonomicon, 221 songs, minor share 0.41; share of songs containing the loop ≥ 2×): I IV (maj) 0.13, I V IV (maj) 0.1, I IV I V (maj) 0.1, I IV V (maj) 0.08, I V I IV (maj) 0.06, I IV V IV (maj) 0.06, I V IV V (maj) 0.06, i iv (min) 0.06. By era: 80s (30 songs, minor 0.27): I IV (maj) 0.2, I V I IV (maj) 0.07, I IV I V (maj) 0.07, I vi IV V (maj) 0.07; new (97 songs, minor 0.53): i iv (min) 0.09, I IV (maj) 0.07, I V IV (maj) 0.06, i VI (min) 0.06

**bass** (20 songs, in 0.74 of songs)
- onsets/bar 4.8 (3.4–7); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,8,9,11,13,15
- syncopation: LHL/bar 1.7 (0.5–2.4), off-16th onset share 0.31 (0.13–0.41)
- length 1.31 (0.95–1.79) 16ths, gate (length ÷ gap to next onset) 0.68 (0.67–0.94)
- velocity mean 90 ± 6.8 (flat files 0.55); accents step 2 +32, step 1 +4, step 8 +1; weakest step 14 -7, step 16 -4
- register (MIDI, transposed to C) 32 (31–36)
- degrees (min): 1 0.43, 5 0.15, b7 0.14, b3 0.09, 4 0.08, b6 0.07
- intervals: repeat 0.34 (0.08–0.43), step 1–2 0.21 (0.07–0.4), skip 3–4 0.09 (0–0.17), leap 5–7 0.11 (0–0.3), octave 0 (0–0.03), descending share of moves 0.49 (0.38–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.12, 2-bar 0.29, 4-bar 0.19, longer 0.4; rhythm only: 1-bar 0.19, 2-bar 0.32, 4-bar 0.17, longer 0.32

**chord** (8 songs, in 0.3 of songs)
- onsets/bar 4 (1.8–5); steps with P ≥ .5: 1; P ≥ .3: 1,4,5,7,11,13
- syncopation: LHL/bar 2.5 (1.4–3.3), off-16th onset share 0.24 (0.16–0.41)
- length 1.71 (1.07–2.02) 16ths, gate (length ÷ gap to next onset) 0.39 (0.18–0.55)
- velocity mean 94 ± 9.2 (flat files 0.62); accents step 3 +29, step 7 +7, step 1 +5; weakest step 13 -26, step 14 -17
- register (MIDI, transposed to C) 55 (54–59)
- degrees (min): 1 0.35, b6 0.15, b3 0.15, 4 0.11, b7 0.1, 5 0.08
- chords: voices 2 (2–2.1), spread 12 st, inversion share 0 (0–0), changes/bar 0.98 (0.46–1.3), qualities min7 0.62, maj7 0.25, aug 0.12
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.38, 4-bar 0.12, longer 0.42; rhythm only: 1-bar 0.38, 2-bar 0.25, 4-bar 0.12, longer 0.25

**pad** (13 songs, in 0.48 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9,13
- syncopation: LHL/bar 0.8 (0–1.9), off-16th onset share 0.17 (0–0.27)
- length 1.58 (0.96–3.67) 16ths, gate (length ÷ gap to next onset) 0.48 (0.24–0.67)
- velocity mean 91 ± 19 (flat files 0.31); accents step 13 +4, step 7 +4, step 14 +4; weakest step 10 -7, step 12 -7
- register (MIDI, transposed to C) 67 (60–73)
- degrees (min): 1 0.33, b3 0.17, 5 0.13, 4 0.09, b6 0.08, 2 0.08
- chords: voices 2.4 (2.1–3), spread 12 st, inversion share 0 (0–0.77), changes/bar 0.88 (0.7–2.54), qualities pow 0.54, min 0.33, maj 0.11, dim 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.12, 4-bar 0.25, longer 0.62; rhythm only: 1-bar 0.12, 2-bar 0.19, 4-bar 0.19, longer 0.5

**keys** (14 songs, in 0.52 of songs)
- onsets/bar 3 (1.2–4); steps with P ≥ .5: 1; P ≥ .3: 1,7,9,11,15
- syncopation: LHL/bar 2.4 (0.8–3), off-16th onset share 0.18 (0–0.25)
- length 1.8 (1.3–3.71) 16ths, gate (length ÷ gap to next onset) 0.64 (0.5–0.87)
- velocity mean 91 ± 8.5 (flat files 0.36); accents step 14 +4, step 1 +3, step 5 +3; weakest step 10 -11, step 16 -11
- register (MIDI, transposed to C) 62 (58–64)
- degrees (min): 1 0.37, b3 0.16, 5 0.14, b7 0.11, 4 0.07, 2 0.07
- chords: voices 2.6 (2–3.4), spread 11 st, inversion share 0.63 (0.36–0.95), changes/bar 0.67 (0.23–2.54), qualities pow 0.45, min 0.27, maj 0.1, min7 0.1
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.1, 2-bar 0.11, 4-bar 0.11, longer 0.68; rhythm only: 1-bar 0.41, 2-bar 0.03, 4-bar 0.08, longer 0.47

**guitar** (14 songs, in 0.52 of songs)
- onsets/bar 7.5 (6.2–9.5); steps with P ≥ .5: 1,3,4,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,6,7,8,9,11,12,13,15
- syncopation: LHL/bar 2.4 (1.3–3.2), off-16th onset share 0.31 (0.07–0.45)
- length 1 (0.74–1.64) 16ths, gate (length ÷ gap to next onset) 0.73 (0.5–0.99)
- velocity mean 76 ± 12.4 (flat files 0.5); accents step 16 +4, step 6 +1, step 11 +1; weakest step 10 -3, step 14 -3
- register (MIDI, transposed to C) 60 (56–62)
- degrees (min): 1 0.38, b7 0.17, b3 0.1, 5 0.09, 2 0.07, b6 0.05
- chords: voices 2.2 (2–3), spread 7 st, inversion share 0.96 (0.55–0.96), changes/bar 1 (0.71–4.1), qualities maj 0.46, pow 0.29, min 0.17, sus 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.11, 2-bar 0.08, 4-bar 0.25, longer 0.56; rhythm only: 1-bar 0.28, 2-bar 0.17, 4-bar 0.17, longer 0.39

**lead** (17 songs, in 0.63 of songs)
- onsets/bar 4 (4–5); steps with P ≥ .5: 1,3,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.3 (0.7–3.8), off-16th onset share 0.09 (0–0.25)
- length 1.96 (1–2.18) 16ths, gate (length ÷ gap to next onset) 0.94 (0.5–0.98)
- velocity mean 84 ± 8.3 (flat files 0.47); accents step 10 +23, step 2 +12, step 12 +5; weakest step 4 -19, step 14 -18
- register (MIDI, transposed to C) 72 (65–74)
- degrees (min): 5 0.27, 1 0.2, b3 0.15, 4 0.12, b7 0.1, b6 0.08
- intervals: repeat 0.3 (0.04–0.44), step 1–2 0.41 (0.3–0.49), skip 3–4 0.14 (0.05–0.26), leap 5–7 0.06 (0.03–0.13), octave 0 (0–0.01), descending share of moves 0.52 (0.49–0.61)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.38, 4-bar 0.15, longer 0.4; rhythm only: 1-bar 0.3, 2-bar 0.25, 4-bar 0.15, longer 0.3

**arp** (5 songs, in 0.18 of songs)
- onsets/bar 7 (7–7); steps with P ≥ .5: 3,5,9,11,13,15; P ≥ .3: 1,3,4,5,6,7,9,10,11,12,13,15
- syncopation: LHL/bar 3 (2.7–4), off-16th onset share 0.22 (0–0.43)
- length 0.96 (0.96–1) 16ths, gate (length ÷ gap to next onset) 0.48 (0.48–0.58)
- velocity mean 88 ± 10.8 (flat files 0.6); accents step 16 +7, step 6 +7, step 7 +3; weakest step 9 -12, step 1 -6
- register (MIDI, transposed to C) 74 (71–75)
- degrees (min): 5 0.21, b3 0.2, 1 0.19, 4 0.19, b7 0.1, 2 0.08
- intervals: repeat 0.08 (0.06–0.34), step 1–2 0.14 (0.08–0.4), skip 3–4 0.23 (0–0.25), leap 5–7 0.28 (0.12–0.44), octave 0 (0–0), descending share of moves 0.54 (0.49–0.55)
- arp shape up 0.06, down 0.25, updown 0.22, random 0.48, static 0; spacing (16ths) {'1.5': 2, '2.0': 2, '1.25': 1}; octave span 0.62 (0.58–0.67)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.25, 2-bar 0.25, 4-bar 0.19, longer 0.31; rhythm only: 1-bar 0.9, 2-bar 0, 4-bar 0, longer 0.1

**seq** (6 songs, in 0.22 of songs)
- onsets/bar 8 (6.9–8); steps with P ≥ .5: 1,3,5,7,9,11,15; P ≥ .3: 1,3,4,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 3.4 (0.5–5.7), off-16th onset share 0.37 (0.15–0.45)
- length 1.4 (1.07–1.63) 16ths, gate (length ÷ gap to next onset) 0.75 (0.67–0.91)
- velocity mean 88 ± 5.7 (flat files 0.5); accents step 9 +5, step 1 +5, step 4 +5; weakest step 10 -13, step 12 -5
- register (MIDI, transposed to C) 50 (50–54)
- degrees (min): 1 0.38, b6 0.2, 5 0.17, 4 0.07, b3 0.06, 7 0.06
- intervals: repeat 0.36 (0.28–0.42), step 1–2 0.21 (0.19–0.4), skip 3–4 0.12 (0.05–0.16), leap 5–7 0.08 (0.03–0.11), octave 0 (0–0.01), descending share of moves 0.49 (0.33–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.46, 2-bar 0, 4-bar 0, longer 0.54; rhythm only: 1-bar 0.46, 2-bar 0, 4-bar 0.25, longer 0.29

**drums** (28 songs with a usable kit; flat-velocity files 0.36)
- families: kick_4otf 0.07, kick_1_and_9_only 0.5, snare_backbeat_5_13 0.82, snare_halftime_9 0, hat_16ths 0.07, hat_8ths 0.25, hat_offbeat_only 0, hat_none 0.18
- kick: hits/bar 3.2 (3–4.6), songs using 1, P ≥ .5 at steps 1,9,11, P ≥ .2 at 1,3,8,9,11,16; vel 114 ± 2.4
- snare: hits/bar 2 (1.9–2.2), songs using 0.93, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 6.5
- hat: hits/bar 5.3 (4–8), songs using 0.82, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 90 ± 5
- perc: hits/bar 3.6 (0.1–7.1), songs using 0.68, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,8,9,10,11,12,13,15; vel 81 ± 9.3
- tom: hits/bar 0 (0–0), songs using 0.14, P ≥ .5 at steps none, P ≥ .2 at none; vel 54 ± 19.2
- cymb: hits/bar 0 (0–0.2), songs using 0.18, P ≥ .5 at steps none, P ≥ .2 at none; vel 114 ± 4
- open-hat share of hat hits 0.09, ride share of cymbals 0.4, fill-bar share 0

