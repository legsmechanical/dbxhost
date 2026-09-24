# DARKSYN — reference statistics

DARKSYN has no songs of its own: it is the union of its flavours (EBM, INDUSTRIAL, DARKSYNTH); the tables below are measured on that union.

**63 songs measured** (79 selected), 36 artists; sources {'lmd': 43, 'lamd': 17, 'freemidi': 3}; eras {'90s': 7, '80s': 13, 'new': 22, '?': 21}; era splits: {'80s': 13, 'new': 22}. Every table: `analysis/out/darksyn_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **94 / 124 / 161**; file BPM q1/med/q3 100 / 120 / 135; minor share **0.62**.

## Findings

DARKSYN is measured as the union of its three flavours and is dominated by INDUSTRIAL (52 of 63 songs); EBM (8) and DARKSYNTH (3) are too thin to steer it. Signature: a legato, low (median MIDI 33), repeated-note bass on all eight 8ths (repeated-note share .62, gate 1.0), distorted-guitar-register parts (median MIDI 48), minor 62 % with a phrygian lean in 8 of 52 industrial songs, open hats at 43 % of hat hits, and among the flattest drum velocities (38 % flat files; metal 42 %).

Flavours filed under this style: **EBM** (8 songs), **INDUSTRIAL** (52 songs), **DARKSYNTH** (3 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.91 (0.49–1.14). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI VII | 0.17 | 0.04 |
| i III VII | 0.14 | 0.03 |
| i iv III VII | 0.14 | 0.01 |
| i iv VII | 0.14 | 0.03 |
| i VII VI VII | 0.11 | 0.01 |
| i VII | 0.11 | 0.03 |
| i VI iv VII | 0.08 | 0.01 |
| i iv VI VII | 0.08 | 0.01 |
| i VI VII v | 0.08 | 0.01 |
| i VII VI | 0.08 | 0.03 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V | 0.23 | 0.06 |
| I V IV V | 0.18 | 0.03 |
| I IV | 0.14 | 0.1 |
| I V I IV | 0.14 | 0.03 |
| I IV I V | 0.09 | 0.03 |
| I IV V | 0.09 | 0.02 |
| IV bVII | 0.09 | 0.01 |
| I bVII | 0.09 | 0.06 |
| I vi ii V | 0.04 | 0 |
| I IV ii V | 0.04 | 0 |

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: min)

**bass** (60 songs, in 0.95 of songs)
- onsets/bar 7 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.1–1.3), off-16th onset share 0.03 (0–0.23)
- length 2 (1.5–2) 16ths, gate (length ÷ gap to next onset) 1 (0.82–1)
- velocity mean 98 ± 6.9 (flat files 0.6); accents step 16 +1, step 4 +1, step 1 +0; weakest step 12 -1, step 3 -0
- register (MIDI, transposed to C) 33 (31–36)
- degrees (min): 1 0.45, b7 0.12, b6 0.1, b3 0.08, 4 0.07, 5 0.06
- intervals: repeat 0.62 (0.41–0.81), step 1–2 0.13 (0.05–0.23), skip 3–4 0.04 (0.02–0.11), leap 5–7 0.05 (0.01–0.13), octave 0 (0–0.05), descending share of moves 0.5 (0.42–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.12, 4-bar 0.13, longer 0.71; rhythm only: 1-bar 0.33, 2-bar 0.09, 4-bar 0.08, longer 0.5

**chord** (15 songs, in 0.24 of songs)
- onsets/bar 3 (3–4.5); steps with P ≥ .5: 1,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (1.2–3.7), off-16th onset share 0.18 (0.06–0.35)
- length 1 (0.96–2.01) 16ths, gate (length ÷ gap to next onset) 0.5 (0.33–0.83)
- velocity mean 80 ± 8.1 (flat files 0.47); accents step 16 +2, step 6 +1, step 3 +1; weakest step 2 -8, step 14 -1
- register (MIDI, transposed to C) 64 (60–67)
- degrees (min): 1 0.31, b7 0.16, 5 0.16, 2 0.09, b3 0.09, 4 0.09
- chords: voices 2.3 (2.1–2.8), spread 8 st, inversion share 0.79 (0.5–0.83), changes/bar 2.55 (1.48–2.99), qualities pow 0.54, maj 0.26, min 0.13, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.17, 4-bar 0.05, longer 0.79; rhythm only: 1-bar 0.17, 2-bar 0.08, 4-bar 0, longer 0.75

**pad** (29 songs, in 0.46 of songs)
- onsets/bar 2 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.6 (0.1–1.5), off-16th onset share 0.04 (0–0.18)
- length 7.92 (1.73–15.95) 16ths, gate (length ÷ gap to next onset) 0.99 (0.81–1)
- velocity mean 86 ± 11.9 (flat files 0.48); accents step 15 +4, step 7 +4, step 10 +4; weakest step 12 -9, step 3 -5
- register (MIDI, transposed to C) 64 (60–67)
- degrees (min): 1 0.28, b3 0.13, 5 0.13, 2 0.12, b6 0.1, 4 0.1
- chords: voices 2.8 (2–3.1), spread 8 st, inversion share 0.55 (0.33–0.74), changes/bar 0.96 (0.61–1.15), qualities pow 0.45, maj 0.26, min 0.2, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.06, 4-bar 0.04, longer 0.89; rhythm only: 1-bar 0.17, 2-bar 0.01, 4-bar 0.02, longer 0.8

**keys** (23 songs, in 0.36 of songs)
- onsets/bar 7 (3–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.9 (0.2–2.2), off-16th onset share 0.01 (0–0.32)
- length 1.29 (1–2.72) 16ths, gate (length ÷ gap to next onset) 1 (0.4–1)
- velocity mean 89 ± 9.9 (flat files 0.48); accents step 1 +4, step 5 +3, step 9 +2; weakest step 6 -10, step 4 -8
- register (MIDI, transposed to C) 64 (60–68)
- degrees (min): 1 0.27, 5 0.19, b2 0.11, 4 0.1, b3 0.09, 2 0.09
- chords: voices 2.5 (2–3), spread 8 st, inversion share 0.61 (0.32–0.91), changes/bar 1.88 (0.67–3.15), qualities pow 0.47, maj 0.32, min 0.14, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.15, 2-bar 0.12, 4-bar 0.05, longer 0.69; rhythm only: 1-bar 0.32, 2-bar 0.05, 4-bar 0.06, longer 0.57

**guitar** (46 songs, in 0.73 of songs)
- onsets/bar 8 (4.6–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.1–2.1), off-16th onset share 0.11 (0–0.31)
- length 2 (1.36–2) 16ths, gate (length ÷ gap to next onset) 1 (0.75–1)
- velocity mean 90 ± 9.4 (flat files 0.63); accents step 13 +3, step 4 +2, step 1 +2; weakest step 10 -6, step 6 -6
- register (MIDI, transposed to C) 48 (43–52)
- degrees (min): 1 0.38, 5 0.12, b3 0.11, b7 0.1, 4 0.09, b6 0.07
- chords: voices 3 (2.4–3), spread 12 st, inversion share 0 (0–0.18), changes/bar 0.95 (0.67–1.65), qualities pow 0.71, maj 0.14, min 0.12, maj7 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.09, 4-bar 0.15, longer 0.74; rhythm only: 1-bar 0.36, 2-bar 0.07, 4-bar 0.05, longer 0.51

**lead** (42 songs, in 0.67 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.1 (1.3–3), off-16th onset share 0.05 (0–0.26)
- length 2 (1.51–4) 16ths, gate (length ÷ gap to next onset) 1 (0.84–1)
- velocity mean 100 ± 8.7 (flat files 0.59); accents step 10 +19, step 16 +6, step 13 +3; weakest step 6 -23, step 2 -9
- register (MIDI, transposed to C) 65 (62–68)
- degrees (min): 1 0.24, 5 0.18, b3 0.16, 4 0.12, 2 0.12, b7 0.09
- intervals: repeat 0.35 (0.18–0.56), step 1–2 0.44 (0.19–0.54), skip 3–4 0.11 (0.05–0.21), leap 5–7 0.04 (0.01–0.08), octave 0 (0–0.01), descending share of moves 0.52 (0.47–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.1, 4-bar 0.15, longer 0.72; rhythm only: 1-bar 0.18, 2-bar 0.07, 4-bar 0.12, longer 0.63

**arp** (7 songs, in 0.11 of songs)
- onsets/bar 11 (8.5–15); steps with P ≥ .5: 1,3,4,5,6,7,9,10,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.8 (0–3.4), off-16th onset share 0.47 (0.33–0.5)
- length 0.96 (0.54–1) 16ths, gate (length ÷ gap to next onset) 0.5 (0.49–0.5)
- velocity mean 109 ± 12 (flat files 0.86); accents step 16 +12, step 10 +7, step 13 +7; weakest step 7 -35, step 5 -5
- register (MIDI, transposed to C) 62 (55–65)
- degrees (min): 1 0.24, b3 0.18, b7 0.12, 4 0.12, 5 0.11, 2 0.11
- intervals: repeat 0.19 (0.09–0.21), step 1–2 0.44 (0.27–0.49), skip 3–4 0.07 (0.02–0.17), leap 5–7 0.08 (0.05–0.14), octave 0.15 (0.01–0.35), descending share of moves 0.47 (0.46–0.55)
- arp shape up 0.05, down 0, updown 0.28, random 0.67, static 0; spacing (16ths) {'1.0': 4, '2.0': 3}; octave span 1 (0.92–1.21)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.25, 2-bar 0.35, 4-bar 0.05, longer 0.35; rhythm only: 1-bar 0.75, 2-bar 0.1, 4-bar 0.05, longer 0.1

**seq** (22 songs, in 0.35 of songs)
- onsets/bar 7.8 (3–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 1.3 (0–3.3), off-16th onset share 0.28 (0–0.48)
- length 1.85 (1–2) 16ths, gate (length ÷ gap to next onset) 1 (0.7–1)
- velocity mean 85 ± 15.6 (flat files 0.46); accents step 14 +4, step 11 +2, step 5 +2; weakest step 12 -6, step 16 -5
- register (MIDI, transposed to C) 54 (48–57)
- degrees (min): 1 0.41, b3 0.2, b2 0.09, b7 0.06, 2 0.06, 4 0.04
- intervals: repeat 0.59 (0.32–0.87), step 1–2 0.12 (0–0.38), skip 3–4 0.02 (0–0.05), leap 5–7 0.01 (0–0.06), octave 0.01 (0–0.06), descending share of moves 0.51 (0.38–0.64)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.18, 2-bar 0.17, 4-bar 0.1, longer 0.56; rhythm only: 1-bar 0.29, 2-bar 0.16, 4-bar 0.07, longer 0.48

**fx** (8 songs, in 0.13 of songs)
- onsets/bar 6.5 (4.5–8); steps with P ≥ .5: 1,3,7,11,13,15; P ≥ .3: 1,3,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.8–4.4), off-16th onset share 0 (0–0.13)
- length 1.5 (0.83–2.25) 16ths, gate (length ÷ gap to next onset) 0.83 (0.69–1)
- velocity mean 102 ± 9.6 (flat files 0.88); accents step 15 +4, step 9 +2, step 11 +2; weakest step 1 -14, step 3 -2
- register (MIDI, transposed to C) 68 (64–70)
- degrees (min): 1 0.61, b3 0.1, 2 0.1, 5 0.05, 4 0.04, b7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.43, 2-bar 0, 4-bar 0.14, longer 0.43; rhythm only: 1-bar 0.57, 2-bar 0, 4-bar 0.32, longer 0.11

**drums** (56 songs with a usable kit; flat-velocity files 0.38)
- families: kick_4otf 0.25, kick_1_and_9_only 0.27, snare_backbeat_5_13 0.64, snare_halftime_9 0.05, hat_16ths 0.05, hat_8ths 0.29, hat_offbeat_only 0, hat_none 0.16
- kick: hits/bar 3.8 (2.7–4.8), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 108 ± 6.1
- snare: hits/bar 2 (1.5–2.2), songs using 0.95, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 102 ± 9.7
- hat: hits/bar 5.7 (1.9–7.8), songs using 0.82, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 90 ± 12.5
- perc: hits/bar 0.3 (0–5.6), songs using 0.45, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 86 ± 10.6
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.4 (0.2–1.4), songs using 0.52, P ≥ .5 at steps none, P ≥ .2 at 1; vel 95 ± 9
- open-hat share of hat hits 0.43, ride share of cymbals 0.29, fill-bar share 0.08

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 13 | 91 / 120 / 166 | 0.46 | 8 (4–8) | 0.85 (0.5–0.98) | 0.35 (0.15–0.48) | 0.54 | 0.15 | 0.33 | 0.17 | i iv III VII (0.4) |
| new | 22 | 103 / 124 / 147 | 0.59 | 6 (4–8) | 0.98 (0.84–1) | 0.48 (0.33–0.56) | 0.55 | 0.09 | 0.29 | 0 | i VI VII (0.33) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### EBM (8 songs, 8 artists; sources {'lmd': 7, 'lamd': 1}; distinctness 0.58)

8 songs only (Front 242, Nitzer Ebb-era tags). Bass 8 onsets/bar, repeated-note share .77, snare backbeat 86 %. Chord sheets (129): minor 61 %, i–III–VII–VI.

Tempo p10/p50/p90 105 / 124 / 135; minor share 0.62.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| keys_onsets_per_bar | 2 | 7 | -5.00 |
| drum_flat_share | 0 | 0.38 | -0.38 |
| bass_gate | 0.67 | 1 | -0.33 |
| drum_kick_1_and_9_only | 0.57 | 0.27 | +0.30 |
| keys_presence | 0.62 | 0.36 | +0.26 |
| keys_loop_1bar_rhythm | 0.07 | 0.32 | -0.26 |
| guitar_presence | 0.5 | 0.73 | -0.23 |
| drum_snare_backbeat_5_13 | 0.86 | 0.64 | +0.21 |
| keys_register_med | 72 | 64 | +8.00 |
| drum_open_hat_share | 0.24 | 0.43 | -0.19 |
| pad_presence | 0.62 | 0.46 | +0.17 |
| chord_changes_per_bar | 1.06 | 0.91 | +0.15 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI v V | 0.5 | 0.05 |
| i VI VII v | 0.5 | 0.06 |
| i VI VII | 0.25 | 0.05 |
| i VI v VII | 0.25 | 0.04 |
| i VI III v | 0.25 | 0.02 |
| i VI VII #viio | 0.25 | 0.02 |
| #viio V VI VII | 0.25 | 0.02 |
| i VII #viio V | 0.25 | 0.02 |
| i VI #viio V | 0.25 | 0.02 |
| i III v VII | 0.25 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V IV V | 0.67 | 0.1 |
| I IV | 0.33 | 0.17 |
| I V | 0.33 | 0.08 |
| I V I IV | 0.33 | 0.07 |
| I IV I V | 0.33 | 0.1 |
| I IV V | 0.33 | 0.12 |
| I vi ii V | 0.33 | 0.01 |
| I IV ii V | 0.33 | 0.01 |
| I vi ii IV | 0.33 | 0.07 |
| I vi ii bVII | 0.33 | 0.05 |

Chord-sheet cross-check (Chordonomicon, 129 songs, minor share 0.6; share of songs containing the loop ≥ 2×): I V IV (maj) 0.09, i III VII VI (min) 0.09, i VI (min) 0.08, i III VII (min) 0.08, I IV (maj) 0.08, i VI VII (min) 0.08, i iv (min) 0.07, i VI III VII (min) 0.07. By era: new (101 songs, minor 0.63): i III VII VI (min) 0.11, i III VII (min) 0.1, i VI (min) 0.09, i VI VII (min) 0.09

**bass** (7 songs, in 0.88 of songs)
- onsets/bar 8 (6.2–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.4–1.1), off-16th onset share 0 (0–0.12)
- length 1.79 (1.33–1.92) 16ths, gate (length ÷ gap to next onset) 0.67 (0.55–0.94)
- velocity mean 104 ± 4.2 (flat files 0.29); accents step 15 +1, step 11 +0, step 5 +0; weakest step 4 -7, step 3 -0
- register (MIDI, transposed to C) 35 (32–38)
- degrees (min): 1 0.37, b7 0.18, b6 0.13, 5 0.09, b3 0.07, 4 0.05
- intervals: repeat 0.77 (0.45–0.83), step 1–2 0.1 (0.05–0.18), skip 3–4 0.05 (0.03–0.08), leap 5–7 0.04 (0.02–0.06), octave 0 (0–0), descending share of moves 0.45 (0.39–0.48)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.11, longer 0.89; rhythm only: 1-bar 0.41, 2-bar 0.06, 4-bar 0.07, longer 0.46

**chord** (3 songs, in 0.38 of songs)
- onsets/bar 4 (3.2–10); steps with P ≥ .5: 1,9,11,13,16; P ≥ .3: 1,3,5,7,9,11,13,14,16
- syncopation: LHL/bar 1 (0.9–2.9), off-16th onset share 0.37 (0.27–0.39)
- length 1 (0.74–1.68) 16ths, gate (length ÷ gap to next onset) 0.48 (0.48–0.61)
- velocity mean 108 ± 4.5 (flat files 0); accents step 16 +2, step 6 +1, step 8 +1; weakest step 2 -13, step 3 -6
- register (MIDI, transposed to C) 67 (62–71)
- degrees (min): 1 0.37, 5 0.24, b7 0.13, b6 0.06, 2 0.04, b3 0.04
- chords: voices 2.2 (2.2–2.2), spread 12 st, inversion share 0.54 (0.27–0.6), changes/bar 2.55 (1.74–3.91), qualities pow 0.85, maj 0.15
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.25, 4-bar 0.5, longer 0.25; rhythm only: 1-bar 0.75, 2-bar 0, 4-bar 0, longer 0.25

**pad** (5 songs, in 0.62 of songs)
- onsets/bar 2 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,3,9
- syncopation: LHL/bar 0.7 (0.4–2.1), off-16th onset share 0.09 (0.05–0.27)
- length 8 (2–15.95) 16ths, gate (length ÷ gap to next onset) 1 (1–1)
- velocity mean 93 ± 14.2 (flat files 0.2); accents step 2 +32, step 14 +32, step 8 +31; weakest step 1 -2, step 9 -0
- register (MIDI, transposed to C) 67 (64–72)
- degrees (min): 1 0.18, b3 0.18, 5 0.15, b7 0.11, 2 0.1, b6 0.1
- chords: voices 2.9 (2.9–3.1), spread 8 st, inversion share 0.44 (0.42–0.55), changes/bar 0.89 (0.87–1.17), qualities maj 0.48, min 0.39, sus 0.04, dim 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.06, longer 0.94; rhythm only: 1-bar 0.19, 2-bar 0.02, 4-bar 0.06, longer 0.73

**keys** (5 songs, in 0.62 of songs)
- onsets/bar 2 (2–4); steps with P ≥ .5: 1,3,5,9,13; P ≥ .3: 1,3,5,7,9,13
- syncopation: LHL/bar 1.9 (0.8–2.1), off-16th onset share 0.04 (0–0.45)
- length 1.29 (1–4.21) 16ths, gate (length ÷ gap to next onset) 0.99 (0.32–1)
- velocity mean 88 ± 9.1 (flat files 0.4); accents step 1 +5, step 13 +4, step 5 +3; weakest step 9 -13, step 7 -7
- register (MIDI, transposed to C) 72 (67–75)
- degrees (min): 1 0.45, 5 0.19, b3 0.11, 4 0.09, 2 0.07, b7 0.06
- chords: voices 2.7 (2.3–3.4), spread 8 st, inversion share 0.59 (0.45–0.68), changes/bar 1.7 (1.2–1.92), qualities maj 0.44, pow 0.22, min 0.22, sus 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.1, longer 0.9; rhythm only: 1-bar 0.07, 2-bar 0, 4-bar 0.1, longer 0.83

**guitar** (4 songs, in 0.5 of songs)
- onsets/bar 6.5 (4–8); steps with P ≥ .5: 1,3,7,9,13,15; P ≥ .3: 1,2,3,5,7,8,9,11,12,13,15
- syncopation: LHL/bar 1.8 (0.7–3.3), off-16th onset share 0.17 (0.05–0.29)
- length 1.19 (0.83–1.49) 16ths, gate (length ÷ gap to next onset) 0.39 (0.33–0.56)
- velocity mean 78 ± 9.4 (flat files 0); accents step 13 +6, step 5 +6, step 1 +3; weakest step 16 -17, step 6 -16
- register (MIDI, transposed to C) 65 (62–68)
- degrees (min): 1 0.18, b3 0.17, 5 0.17, 4 0.14, b7 0.11, b6 0.1
- chords: voices 3.3 (3.1–3.8), spread 9 st, inversion share 0.8 (0.61–0.9), changes/bar 1.17 (1–1.36), qualities maj 0.62, min 0.27, dim 0.06, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.07, 2-bar 0, 4-bar 0, longer 0.93

**lead** (6 songs, in 0.75 of songs)
- onsets/bar 3 (2.2–3.8); steps with P ≥ .5: 1,7; P ≥ .3: 1,7,9,13,15
- syncopation: LHL/bar 1.4 (1.1–2.5), off-16th onset share 0.05 (0.01–0.06)
- length 3.46 (2.2–6.78) 16ths, gate (length ÷ gap to next onset) 0.97 (0.93–0.99)
- velocity mean 112 ± 6.7 (flat files 0.33); accents step 4 +4, step 13 +3, step 9 +2; weakest step 3 -4, step 5 -3
- register (MIDI, transposed to C) 68 (65–70)
- degrees (min): 1 0.31, 5 0.15, 4 0.13, b3 0.12, b7 0.1, 2 0.09
- intervals: repeat 0.27 (0.26–0.47), step 1–2 0.35 (0.27–0.59), skip 3–4 0.06 (0.05–0.08), leap 5–7 0.09 (0.01–0.1), octave 0.01 (0–0.02), descending share of moves 0.5 (0.47–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.2, 2-bar 0, 4-bar 0.07, longer 0.73

**seq** (3 songs, in 0.38 of songs)
- onsets/bar 3 (2.5–9.5); steps with P ≥ .5: 1,10,13; P ≥ .3: 1,3,5,7,9,10,11,13,15
- syncopation: LHL/bar 2.4 (1.2–2.4), off-16th onset share 0.27 (0.14–0.38)
- length 1.28 (1.1–1.49) 16ths, gate (length ÷ gap to next onset) 0.68 (0.57–0.98)
- velocity mean 78 ± 5.3 (flat files 0); accents step 1 +6, step 5 +6, step 14 +4; weakest step 16 -13, step 12 -11
- register (MIDI, transposed to C) 51 (43–52)
- degrees (min): 3 0.18, #4 0.16, 5 0.14, b3 0.14, b7 0.13, 1 0.09
- intervals: repeat 0 (0–0.08), step 1–2 0.38 (0.19–0.49), skip 3–4 0.22 (0.11–0.36), leap 5–7 0.02 (0.01–0.13), octave 0.21 (0.1–0.39), descending share of moves 0.65 (0.45–0.67)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.5, 2-bar 0, 4-bar 0, longer 0.5; rhythm only: 1-bar 0.5, 2-bar 0, 4-bar 0, longer 0.5

**drums** (7 songs with a usable kit; flat-velocity files 0)
- families: kick_4otf 0.14, kick_1_and_9_only 0.57, snare_backbeat_5_13 0.86, snare_halftime_9 0, hat_16ths 0.14, hat_8ths 0.29, hat_offbeat_only 0, hat_none 0.14
- kick: hits/bar 3 (2.4–3.3), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13; vel 124 ± 3.5
- snare: hits/bar 2 (2–2.8), songs using 1, P ≥ .5 at steps 5,13, P ≥ .2 at 1,5,9,13; vel 95 ± 7.4
- hat: hits/bar 5.9 (4.1–7.1), songs using 0.86, P ≥ .5 at steps 1,3,5,7,9,11,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 79 ± 11.4
- perc: hits/bar 1.9 (0.9–9.9), songs using 0.71, P ≥ .5 at steps none, P ≥ .2 at 1,3,4,5,6,7,8,9,11,12,13,14,15,16; vel 78 ± 10.6
- tom: hits/bar 0 (0–0), songs using 0, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 1.2 (0.6–3.7), songs using 0.71, P ≥ .5 at steps 1, P ≥ .2 at 1,5,9,13; vel 81 ± 10.5
- open-hat share of hat hits 0.24, ride share of cymbals 0.41, fill-bar share 0.08

### INDUSTRIAL (52 songs, 26 artists; sources {'lmd': 35, 'lamd': 14, 'freemidi': 3}; distinctness 0.11)

52 songs (Nine Inch Nails, Rammstein, Ministry, KMFDM, Marilyn Manson, Rob Zombie…): industrial rock/metal more than electronic industrial. Low legato bass and guitar, phrygian lean, open hats.

Tempo p10/p50/p90 100 / 124 / 162; minor share 0.61.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI VII | 0.17 | 0.04 |
| i iv VII | 0.13 | 0.03 |
| i VII | 0.13 | 0.03 |
| i iv III VII | 0.1 | 0.01 |
| i III VII | 0.1 | 0.03 |
| i VII VI VII | 0.1 | 0.01 |
| i VI | 0.1 | 0.02 |
| i iv | 0.1 | 0.06 |
| i III iv VII | 0.07 | 0.01 |
| i iv VI | 0.07 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V | 0.21 | 0.06 |
| I IV | 0.1 | 0.09 |
| IV bVII | 0.1 | 0.01 |
| I bVII | 0.1 | 0.06 |
| I V IV V | 0.1 | 0.01 |
| I V I IV | 0.1 | 0.02 |
| #IV iii bVII | 0.05 | 0.03 |
| #IV iii | 0.05 | 0.01 |
| I #IV iii bVII | 0.05 | 0.01 |
| I bVII IV | 0.05 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 945 songs, minor share 0.51; share of songs containing the loop ≥ 2×): i VI (min) 0.08, I IV (maj) 0.06, i VII VI (min) 0.05, i VI VII (min) 0.05, I V IV (maj) 0.05, i VII VI VII (min) 0.04, I V vi IV (maj) 0.04, i III VII VI (min) 0.04. By era: 80s (145 songs, minor 0.43): I II (maj) 0.06, i III IV (min) 0.06, I bIII (maj) 0.05, I IV (maj) 0.05; new (642 songs, minor 0.56): i VI (min) 0.09, i VII VI (min) 0.07, i VI VII (min) 0.06, i VII VI VII (min) 0.06

**bass** (51 songs, in 0.98 of songs)
- onsets/bar 7 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.3 (0.1–1.3), off-16th onset share 0.01 (0–0.26)
- length 2 (1.49–2) 16ths, gate (length ÷ gap to next onset) 1 (0.88–1)
- velocity mean 96 ± 7 (flat files 0.63); accents step 4 +1, step 16 +1, step 1 +0; weakest step 7 -1, step 12 -1
- register (MIDI, transposed to C) 32 (31–36)
- degrees (min): 1 0.45, b7 0.12, b6 0.1, b3 0.08, 4 0.07, 5 0.05
- intervals: repeat 0.63 (0.41–0.81), step 1–2 0.14 (0.04–0.25), skip 3–4 0.03 (0.02–0.11), leap 5–7 0.06 (0.01–0.15), octave 0 (0–0.05), descending share of moves 0.51 (0.43–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.05, 2-bar 0.14, 4-bar 0.14, longer 0.68; rhythm only: 1-bar 0.33, 2-bar 0.1, 4-bar 0.09, longer 0.49

**chord** (10 songs, in 0.19 of songs)
- onsets/bar 3.5 (3–4.8); steps with P ≥ .5: 1,5,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 3 (1.6–3.7), off-16th onset share 0.15 (0.01–0.33)
- length 1 (0.94–1.21) 16ths, gate (length ÷ gap to next onset) 0.46 (0.21–0.59)
- velocity mean 79 ± 8.7 (flat files 0.5); accents step 6 +5, step 3 +2, step 9 +2; weakest step 4 -12, step 2 -8
- register (MIDI, transposed to C) 64 (60–68)
- degrees (min): 1 0.29, b7 0.15, 2 0.14, 5 0.13, b3 0.11, 4 0.09
- chords: voices 2.5 (2–3), spread 6 st, inversion share 0.81 (0.5–0.98), changes/bar 2.16 (1.31–2.83), qualities pow 0.43, maj 0.32, min 0.19, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.2, 4-bar 0, longer 0.8; rhythm only: 1-bar 0.14, 2-bar 0.11, 4-bar 0, longer 0.75

**pad** (22 songs, in 0.42 of songs)
- onsets/bar 1 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.5 (0–1.3), off-16th onset share 0 (0–0.09)
- length 7.96 (1.69–15.68) 16ths, gate (length ÷ gap to next onset) 0.98 (0.75–1)
- velocity mean 79 ± 11 (flat files 0.5); accents step 9 +2, step 1 +2, step 15 +1; weakest step 12 -9, step 2 -9
- register (MIDI, transposed to C) 64 (60–67)
- degrees (min): 1 0.3, 2 0.12, b6 0.12, 5 0.12, b3 0.11, 4 0.11
- chords: voices 2.1 (2–3.1), spread 8 st, inversion share 0.54 (0.09–0.91), changes/bar 0.92 (0.55–1.13), qualities pow 0.54, maj 0.23, min 0.17, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.09, 4-bar 0.04, longer 0.85; rhythm only: 1-bar 0.2, 2-bar 0, 4-bar 0.01, longer 0.79

**keys** (17 songs, in 0.33 of songs)
- onsets/bar 8 (6–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.2 (0.2–2.1), off-16th onset share 0.01 (0–0.29)
- length 1.19 (1–2) 16ths, gate (length ÷ gap to next onset) 1 (0.5–1)
- velocity mean 90 ± 10.8 (flat files 0.47); accents step 9 +5, step 5 +4, step 1 +2; weakest step 6 -18, step 4 -10
- register (MIDI, transposed to C) 64 (60–68)
- degrees (min): 1 0.2, 5 0.2, b2 0.16, 4 0.11, 2 0.09, b7 0.09
- chords: voices 2.5 (2–3), spread 8 st, inversion share 0.63 (0.32–1), changes/bar 1.94 (0.67–4.34), qualities pow 0.55, maj 0.28, min 0.12, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.14, 2-bar 0.17, 4-bar 0.03, longer 0.66; rhythm only: 1-bar 0.37, 2-bar 0.07, 4-bar 0.04, longer 0.52

**guitar** (40 songs, in 0.77 of songs)
- onsets/bar 8 (5.8–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.1–1.7), off-16th onset share 0.08 (0–0.31)
- length 2 (1.47–2) 16ths, gate (length ÷ gap to next onset) 1 (0.75–1)
- velocity mean 93 ± 10 (flat files 0.68); accents step 13 +3, step 12 +3, step 4 +2; weakest step 6 -4, step 8 -2
- register (MIDI, transposed to C) 46 (42–50)
- degrees (min): 1 0.4, 5 0.11, b3 0.1, b7 0.1, 4 0.09, b6 0.07
- chords: voices 2.9 (2.1–3), spread 12 st, inversion share 0 (0–0.07), changes/bar 0.95 (0.62–1.7), qualities pow 0.78, min 0.11, maj 0.1, maj7 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.11, 4-bar 0.17, longer 0.71; rhythm only: 1-bar 0.38, 2-bar 0.09, 4-bar 0.06, longer 0.47

**lead** (33 songs, in 0.64 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.6–3), off-16th onset share 0.02 (0–0.25)
- length 2 (1.5–4) 16ths, gate (length ÷ gap to next onset) 1 (0.83–1)
- velocity mean 100 ± 15.4 (flat files 0.61); accents step 10 +19, step 16 +6, step 5 +5; weakest step 6 -23, step 2 -9
- register (MIDI, transposed to C) 65 (62–67)
- degrees (min): 5 0.21, 1 0.19, b3 0.18, 2 0.14, 4 0.13, b7 0.08
- intervals: repeat 0.3 (0.1–0.56), step 1–2 0.44 (0.27–0.54), skip 3–4 0.13 (0.05–0.21), leap 5–7 0.03 (0–0.07), octave 0 (0–0.01), descending share of moves 0.53 (0.48–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.13, 4-bar 0.2, longer 0.63; rhythm only: 1-bar 0.19, 2-bar 0.09, 4-bar 0.14, longer 0.58

**arp** (7 songs, in 0.14 of songs)
- onsets/bar 11 (8.5–15); steps with P ≥ .5: 1,3,4,5,6,7,9,10,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.8 (0–3.4), off-16th onset share 0.47 (0.33–0.5)
- length 0.96 (0.54–1) 16ths, gate (length ÷ gap to next onset) 0.5 (0.49–0.5)
- velocity mean 109 ± 12 (flat files 0.86); accents step 16 +12, step 10 +7, step 13 +7; weakest step 7 -35, step 5 -5
- register (MIDI, transposed to C) 62 (55–65)
- degrees (min): 1 0.24, b3 0.18, b7 0.12, 4 0.12, 5 0.11, 2 0.11
- intervals: repeat 0.19 (0.09–0.21), step 1–2 0.44 (0.27–0.49), skip 3–4 0.07 (0.02–0.17), leap 5–7 0.08 (0.05–0.14), octave 0.15 (0.01–0.35), descending share of moves 0.47 (0.46–0.55)
- arp shape up 0.05, down 0, updown 0.28, random 0.67, static 0; spacing (16ths) {'1.0': 4, '2.0': 3}; octave span 1 (0.92–1.21)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.25, 2-bar 0.35, 4-bar 0.05, longer 0.35; rhythm only: 1-bar 0.75, 2-bar 0.1, 4-bar 0.05, longer 0.1

**seq** (18 songs, in 0.35 of songs)
- onsets/bar 7.8 (3.1–8); steps with P ≥ .5: 1,3,5,9,11,13,15; P ≥ .3: 1,3,5,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 1.3 (0.1–3.5), off-16th onset share 0.24 (0–0.45)
- length 2 (1.04–2.92) 16ths, gate (length ÷ gap to next onset) 1 (0.79–1)
- velocity mean 92 ± 19.1 (flat files 0.5); accents step 11 +8, step 14 +2, step 13 +1; weakest step 2 -10, step 6 -5
- register (MIDI, transposed to C) 54 (48–57)
- degrees (min): 1 0.46, b3 0.21, b2 0.09, 2 0.07, b7 0.05, 4 0.05
- intervals: repeat 0.65 (0.46–0.87), step 1–2 0.12 (0–0.32), skip 3–4 0.02 (0–0.05), leap 5–7 0.01 (0–0.06), octave 0.01 (0–0.06), descending share of moves 0.5 (0.4–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.14, 2-bar 0.21, 4-bar 0.12, longer 0.53; rhythm only: 1-bar 0.28, 2-bar 0.2, 4-bar 0.08, longer 0.44

**drums** (47 songs with a usable kit; flat-velocity files 0.4)
- families: kick_4otf 0.28, kick_1_and_9_only 0.19, snare_backbeat_5_13 0.6, snare_halftime_9 0.06, hat_16ths 0.04, hat_8ths 0.3, hat_offbeat_only 0, hat_none 0.17
- kick: hits/bar 4 (2.9–5), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 104 ± 8.3
- snare: hits/bar 2 (1.4–2.3), songs using 0.94, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 102 ± 10.1
- hat: hits/bar 5.5 (1.8–7.9), songs using 0.81, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 92 ± 13.3
- perc: hits/bar 0.1 (0–4.8), songs using 0.38, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 86 ± 12.1
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- cymb: hits/bar 0.3 (0.2–1.2), songs using 0.47, P ≥ .5 at steps none, P ≥ .2 at 1; vel 106 ± 2.9
- open-hat share of hat hits 0.43, ride share of cymbals 0.25, fill-bar share 0.07

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 18 | 102 / 124 / 152 | 0.56 | 6 (3.2–8) | 1 (0.84–1) | 0.48 (0.35–0.56) | 0.56 | 0.11 | 0.29 | 0 | i VI VII (0.3) |

### DARKSYNTH (3 songs, 2 artists; sources {'lmd': 1, 'lamd': 2}; distinctness –)

3 measured files (John Carpenter scores). Use the chord sheets only: 25 darksynth sheets, minor 64 %, i–VII–iv–VI and i–VI–VII.

Tempo p10/p50/p90 91 / 93 / 93; minor share 0.67.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI iv VII | 1 | 0.15 |
| III VI iv VII | 1 | 0.08 |
| i iv VII III | 1 | 0.08 |
| i VI VII III | 1 | 0.08 |
| i VI iv III | 1 | 0.08 |
| VI iv VII v | 1 | 0.08 |
| i iv VII v | 1 | 0.08 |
| i III VII | 1 | 0.08 |
| i iv III VII | 1 | 0.08 |
| i iv VI VII | 1 | 0.08 |

Chord-sheet cross-check (Chordonomicon, 25 songs, minor share 0.64; share of songs containing the loop ≥ 2×): i VII iv VI (min) 0.16, i VI VII (min) 0.16, I V IV (maj) 0.16, I V vi IV (maj) 0.12, I vi IV V (maj) 0.12, i VII IV VI (min) 0.12, i III VI iv (min) 0.12, i iv VI V (min) 0.12. By era: new (17 songs, minor 0.82): i VII iv VI (min) 0.23, i VII IV VI (min) 0.18, i III VI iv (min) 0.18, i iv VI V (min) 0.18

