# COUNTRY — reference statistics

**150 songs measured** (210 selected), 115 artists; sources {'lmd': 150}; eras {'80s': 68, 'new': 47, '90s': 13, '?': 22}; era splits: {'80s': 68, 'new': 47}. Every table: `analysis/out/country_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **96 / 122 / 160**; file BPM q1/med/q3 84 / 106 / 122; minor share **0.04**.

## Findings

The most major style measured (minor **4 %**; chord sheets 11 %). Kick '1 + 9 only' in 77 % (80s 87 %), snare backbeat weaker than rock (50 %), long bass notes (3.5 16ths) on 1 and 9 — the root–fifth two-beat. I–V–I–IV, I–IV–V and I–IV–I–V each appear in 29–35 % of major songs. FOLK (102) is the same with 24 % minor; BLUEGRASS (54) likewise, with I–IV–V in 40 %.

Flavours filed under this style: **FOLK** (102 songs), **BLUEGRASS** (54 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.84 (0.56–1.03). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI i VII | 0.5 | 0.07 |
| i VII i VI | 0.33 | 0.05 |
| i III VII iv | 0.17 | 0.07 |
| i VII IV | 0.17 | 0.05 |
| i III VII IV | 0.17 | 0.01 |
| III VII IV iv | 0.17 | 0.01 |
| i VII IV iv | 0.17 | 0.01 |
| i III IV iv | 0.17 | 0.01 |
| i VII i IV | 0.17 | 0 |
| III v iv VII | 0.17 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I V I IV | 0.35 | 0.06 |
| I IV V | 0.32 | 0.09 |
| I IV I V | 0.28 | 0.06 |
| I V | 0.28 | 0.05 |
| I IV | 0.24 | 0.04 |
| I V IV V | 0.17 | 0.02 |
| I V vi IV | 0.17 | 0.05 |
| I IV V IV | 0.15 | 0.02 |
| I IV ii V | 0.15 | 0.02 |
| I V IV | 0.14 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 44972 songs, minor share 0.11; share of songs containing the loop ≥ 2×): I IV I V (maj) 0.39, I IV (maj) 0.38, I V I IV (maj) 0.31, I IV V (maj) 0.27, I V IV (maj) 0.24, I IV V IV (maj) 0.23, I V IV V (maj) 0.17, I V (maj) 0.17. By era: 80s (10781 songs, minor 0.07): I IV I V (maj) 0.47, I IV (maj) 0.44, I V I IV (maj) 0.39, I IV V (maj) 0.33; new (24664 songs, minor 0.13): I IV (maj) 0.36, I IV I V (maj) 0.34, I V I IV (maj) 0.27, I V IV (maj) 0.26

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (147 songs, in 0.98 of songs)
- onsets/bar 4 (3–4); steps with P ≥ .5: 1,9; P ≥ .3: 1,7,9,13,15
- syncopation: LHL/bar 0.1 (0–0.6), off-16th onset share 0 (0–0.08)
- length 3.5 (1.98–4.65) 16ths, gate (length ÷ gap to next onset) 0.9 (0.76–0.98)
- velocity mean 101 ± 7.5 (flat files 0.16); accents step 1 +1, step 2 +1, step 4 +1; weakest step 8 -5, step 10 -4
- register (MIDI, transposed to C) 36 (32–40)
- degrees (maj): 1 0.29, 5 0.24, 4 0.16, 2 0.11, 6 0.09, 3 0.05
- intervals: repeat 0.38 (0.18–0.53), step 1–2 0.18 (0.09–0.27), skip 3–4 0.05 (0.02–0.09), leap 5–7 0.26 (0.13–0.42), octave 0.01 (0–0.04), descending share of moves 0.49 (0.44–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.01, 4-bar 0.03, longer 0.95; rhythm only: 1-bar 0.1, 2-bar 0.03, 4-bar 0.02, longer 0.85

**chord** (29 songs, in 0.19 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1.5 (0.9–2.4), off-16th onset share 0.1 (0.02–0.24)
- length 1.08 (0.71–2.27) 16ths, gate (length ÷ gap to next onset) 0.6 (0.37–0.95)
- velocity mean 86 ± 12 (flat files 0.07); accents step 13 +3, step 15 +3, step 9 +1; weakest step 10 -11, step 2 -9
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 1 0.2, 5 0.18, 3 0.14, 6 0.13, 2 0.12, 4 0.1
- chords: voices 2.2 (2–2.7), spread 5 st, inversion share 0.67 (0.42–0.97), changes/bar 1.25 (0.53–1.65), qualities pow 0.51, maj 0.34, min 0.07, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.07, longer 0.93; rhythm only: 1-bar 0.13, 2-bar 0, 4-bar 0.11, longer 0.76

**pad** (99 songs, in 0.66 of songs)
- onsets/bar 1 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.4 (0–1.1), off-16th onset share 0.03 (0–0.12)
- length 8.79 (4.25–15.89) 16ths, gate (length ÷ gap to next onset) 0.99 (0.96–1)
- velocity mean 76 ± 9.5 (flat files 0.18); accents step 13 +2, step 11 +1, step 8 +1; weakest step 10 -4, step 4 -2
- register (MIDI, transposed to C) 65 (60–69)
- degrees (maj): 1 0.19, 5 0.17, 3 0.15, 6 0.13, 4 0.12, 2 0.11
- chords: voices 2.5 (2.2–2.9), spread 8 st, inversion share 0.6 (0.29–0.77), changes/bar 1.1 (0.82–1.52), qualities maj 0.5, pow 0.33, min 0.12, dim 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.08, longer 0.9; rhythm only: 1-bar 0.14, 2-bar 0.05, 4-bar 0.06, longer 0.76

**keys** (108 songs, in 0.72 of songs)
- onsets/bar 4 (2–6.2); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.2–1.7), off-16th onset share 0.06 (0.01–0.2)
- length 3.88 (2.08–6.02) 16ths, gate (length ÷ gap to next onset) 0.98 (0.81–1.01)
- velocity mean 87 ± 11.4 (flat files 0.13); accents step 5 +1, step 13 +1, step 1 +0; weakest step 10 -5, step 6 -5
- register (MIDI, transposed to C) 62 (58–67)
- degrees (maj): 1 0.22, 5 0.2, 3 0.13, 2 0.11, 4 0.11, 6 0.11
- chords: voices 3 (2.7–3.3), spread 8 st, inversion share 0.5 (0.32–0.65), changes/bar 1.37 (0.98–1.92), qualities maj 0.56, pow 0.2, min 0.12, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.01, 4-bar 0.03, longer 0.94; rhythm only: 1-bar 0.1, 2-bar 0.03, 4-bar 0.03, longer 0.85

**guitar** (128 songs, in 0.85 of songs)
- onsets/bar 7 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.1–2.3), off-16th onset share 0.04 (0–0.27)
- length 2 (1.19–3.32) 16ths, gate (length ÷ gap to next onset) 0.94 (0.58–1)
- velocity mean 85 ± 11 (flat files 0.11); accents step 1 +3, step 5 +2, step 13 +2; weakest step 3 -4, step 2 -3
- register (MIDI, transposed to C) 60 (55–63)
- degrees (maj): 1 0.24, 5 0.21, 3 0.13, 2 0.11, 4 0.11, 6 0.1
- chords: voices 3 (2.5–3.2), spread 9 st, inversion share 0.54 (0.3–0.73), changes/bar 1.23 (0.82–1.92), qualities maj 0.55, pow 0.28, min 0.1, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.07, longer 0.92; rhythm only: 1-bar 0.32, 2-bar 0.02, 4-bar 0.03, longer 0.63

**lead** (122 songs, in 0.81 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.4 (1.4–3.2), off-16th onset share 0.09 (0.01–0.25)
- length 2 (1.6–2.56) 16ths, gate (length ÷ gap to next onset) 0.9 (0.77–0.98)
- velocity mean 100 ± 7.5 (flat files 0.23); accents step 1 +1, step 9 +1, step 12 +1; weakest step 6 -2, step 10 -2
- register (MIDI, transposed to C) 67 (64–69)
- degrees (maj): 1 0.21, 3 0.17, 5 0.16, 2 0.13, 6 0.12, 4 0.1
- intervals: repeat 0.27 (0.16–0.39), step 1–2 0.42 (0.3–0.56), skip 3–4 0.15 (0.1–0.21), leap 5–7 0.07 (0.04–0.11), octave 0 (0–0.01), descending share of moves 0.55 (0.51–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.03, longer 0.97; rhythm only: 1-bar 0.01, 2-bar 0.02, 4-bar 0.05, longer 0.93

**arp** (16 songs, in 0.11 of songs)
- onsets/bar 8 (7–14.2); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 1.2 (0.1–2.8), off-16th onset share 0.36 (0–0.5)
- length 1.44 (0.9–1.9) 16ths, gate (length ÷ gap to next onset) 0.93 (0.8–0.98)
- velocity mean 90 ± 7.7 (flat files 0.38); accents step 1 +2, step 13 +1, step 7 +0; weakest step 12 -1, step 8 -1
- register (MIDI, transposed to C) 67 (63–72)
- degrees (maj): 1 0.21, 5 0.2, 2 0.15, 3 0.14, 6 0.11, 7 0.1
- intervals: repeat 0.05 (0–0.13), step 1–2 0.35 (0.12–0.49), skip 3–4 0.3 (0.2–0.34), leap 5–7 0.25 (0.16–0.3), octave 0 (0–0.02), descending share of moves 0.5 (0.47–0.52)
- arp shape up 0.1, down 0.1, updown 0.24, random 0.56, static 0; spacing (16ths) {'2.0': 8, '1.0': 8}; octave span 0.79 (0.67–1.08)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.1, longer 0.9; rhythm only: 1-bar 0.45, 2-bar 0, 4-bar 0, longer 0.55

**seq** (21 songs, in 0.14 of songs)
- onsets/bar 6 (4–7); steps with P ≥ .5: 1,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (0.6–3.4), off-16th onset share 0.25 (0–0.4)
- length 1.42 (1.07–2.67) 16ths, gate (length ÷ gap to next onset) 0.9 (0.77–0.98)
- velocity mean 97 ± 10.6 (flat files 0.19); accents step 9 +3, step 1 +2, step 5 +2; weakest step 8 -4, step 2 -4
- register (MIDI, transposed to C) 60 (60–67)
- degrees (maj): 1 0.28, 5 0.19, 6 0.14, 2 0.12, 3 0.11, 4 0.09
- intervals: repeat 0.17 (0–0.28), step 1–2 0.37 (0.13–0.54), skip 3–4 0.11 (0.05–0.28), leap 5–7 0.11 (0.04–0.25), octave 0 (0–0.04), descending share of moves 0.54 (0.49–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.04, longer 0.96; rhythm only: 1-bar 0.04, 2-bar 0.11, 4-bar 0, longer 0.84

**fx** (16 songs, in 0.11 of songs)
- onsets/bar 3 (2.9–6.2); steps with P ≥ .5: 1,5,13; P ≥ .3: 1,3,5,7,9,13
- syncopation: LHL/bar 0.9 (0.4–2), off-16th onset share 0.05 (0–0.1)
- length 2 (1.52–3.4) 16ths, gate (length ÷ gap to next onset) 0.94 (0.78–0.99)
- velocity mean 81 ± 8.6 (flat files 0.25); accents step 2 +15, step 4 +7, step 14 +2; weakest step 16 -8, step 8 -3
- register (MIDI, transposed to C) 66 (62–70)
- degrees (maj): 1 0.22, 5 0.18, 3 0.15, 4 0.13, 2 0.11, 6 0.11
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.08, longer 0.92; rhythm only: 1-bar 0.3, 2-bar 0.02, 4-bar 0.02, longer 0.66

**drums** (137 songs with a usable kit; flat-velocity files 0.09)
- families: kick_4otf 0.09, kick_1_and_9_only 0.77, snare_backbeat_5_13 0.5, snare_halftime_9 0.01, hat_16ths 0.06, hat_8ths 0.49, hat_offbeat_only 0.03, hat_none 0.05
- kick: hits/bar 3 (2.4–3.3), songs using 0.99, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9; vel 103 ± 6.5
- snare: hits/bar 1.8 (1–2), songs using 0.85, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 4.4
- hat: hits/bar 7.5 (4.1–7.9), songs using 0.95, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 76 ± 13.2
- perc: hits/bar 1.2 (0–2.7), songs using 0.64, P ≥ .5 at steps none, P ≥ .2 at 5,13; vel 86 ± 6.2
- tom: hits/bar 0 (0–0), songs using 0.02, P ≥ .5 at steps none, P ≥ .2 at none; vel 90 ± 4.9
- cymb: hits/bar 0.3 (0.1–2.5), songs using 0.47, P ≥ .5 at steps none, P ≥ .2 at 1; vel 81 ± 10.3
- open-hat share of hat hits 0.07, ride share of cymbals 0.46, fill-bar share 0.09

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 68 | 95 / 122 / 160 | 0.03 | 3 (2–4) | 0.87 (0.75–0.98) | 0.4 (0.31–0.56) | 0.65 | 0.13 | 0.07 | 0.03 | i VI i III (0.5) |
| new | 47 | 101 / 120 / 154 | 0.02 | 4 (3–4.8) | 0.92 (0.82–0.98) | 0.44 (0.33–0.56) | 0.66 | 0.11 | 0.05 | 0.05 | III v iv VII (1) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### FOLK (102 songs, 73 artists; sources {'lmd': 102}; distinctness 0.23)


Tempo p10/p50/p90 96 / 126 / 157; minor share 0.23.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| minor_share | 0.23 | 0.04 | +0.20 |
| drum_kick_1_and_9_only | 0.59 | 0.77 | -0.17 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VII VI VII | 0.17 | 0.03 |
| i VI VII | 0.13 | 0.02 |
| i VII | 0.13 | 0.03 |
| i VII iv VII | 0.13 | 0.01 |
| i iv | 0.13 | 0.02 |
| i VI | 0.09 | 0.01 |
| i IV VI | 0.09 | 0.01 |
| i VI III v | 0.09 | 0.01 |
| i VII VI v | 0.09 | 0.03 |
| i III iv VI | 0.09 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.26 | 0.07 |
| I V I IV | 0.25 | 0.03 |
| I V IV | 0.2 | 0.06 |
| I IV I V | 0.18 | 0.03 |
| I V | 0.18 | 0.03 |
| I IV V | 0.18 | 0.04 |
| I V vi IV | 0.17 | 0.02 |
| I V IV V | 0.16 | 0.02 |
| I vi IV V | 0.14 | 0.03 |
| I IV V IV | 0.14 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 41467 songs, minor share 0.22; share of songs containing the loop ≥ 2×): I IV (maj) 0.31, I IV I V (maj) 0.26, I V I IV (maj) 0.2, I IV V (maj) 0.2, I V IV (maj) 0.18, I IV V IV (maj) 0.17, I V IV V (maj) 0.13, I V (maj) 0.12. By era: 80s (9985 songs, minor 0.17): I IV (maj) 0.35, I IV I V (maj) 0.3, I V I IV (maj) 0.23, I IV V (maj) 0.22; new (24004 songs, minor 0.25): I IV (maj) 0.29, I IV I V (maj) 0.23, I V IV (maj) 0.18, I V I IV (maj) 0.18

**bass** (92 songs, in 0.9 of songs)
- onsets/bar 4 (2.8–4.2); steps with P ≥ .5: 1,9; P ≥ .3: 1,7,9,13,15
- syncopation: LHL/bar 0.2 (0–1), off-16th onset share 0.01 (0–0.22)
- length 2.94 (1.77–4.23) 16ths, gate (length ÷ gap to next onset) 0.89 (0.75–0.98)
- velocity mean 102 ± 9 (flat files 0.25); accents step 1 +2, step 5 +2, step 9 +1; weakest step 16 -7, step 10 -5
- register (MIDI, transposed to C) 36 (32–38)
- degrees (maj): 1 0.27, 5 0.24, 4 0.17, 2 0.09, 6 0.09, 3 0.05
- intervals: repeat 0.37 (0.14–0.54), step 1–2 0.2 (0.11–0.29), skip 3–4 0.05 (0.03–0.1), leap 5–7 0.22 (0.09–0.32), octave 0.02 (0–0.05), descending share of moves 0.49 (0.44–0.54)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.01, 4-bar 0.06, longer 0.92; rhythm only: 1-bar 0.13, 2-bar 0.02, 4-bar 0.04, longer 0.82

**chord** (19 songs, in 0.19 of songs)
- onsets/bar 5 (3–7.5); steps with P ≥ .5: 1,5,7; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (0.5–3.4), off-16th onset share 0.21 (0.03–0.35)
- length 0.94 (0.61–1.97) 16ths, gate (length ÷ gap to next onset) 0.5 (0.33–0.78)
- velocity mean 90 ± 10.8 (flat files 0.16); accents step 12 +2, step 13 +2, step 5 +2; weakest step 16 -4, step 10 -3
- register (MIDI, transposed to C) 62 (59–65)
- degrees (maj): 1 0.19, 5 0.19, 4 0.15, 3 0.14, 6 0.13, 2 0.08
- chords: voices 2.2 (2–2.9), spread 8 st, inversion share 0.66 (0.25–0.93), changes/bar 1.53 (0.82–2.02), qualities pow 0.44, maj 0.43, min 0.11, min7 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.02, 4-bar 0.09, longer 0.84; rhythm only: 1-bar 0.13, 2-bar 0.08, 4-bar 0.09, longer 0.7

**pad** (64 songs, in 0.63 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.3 (0–1.2), off-16th onset share 0.02 (0–0.11)
- length 7.93 (2.77–15.73) 16ths, gate (length ÷ gap to next onset) 0.98 (0.84–1)
- velocity mean 82 ± 8.9 (flat files 0.2); accents step 12 +4, step 4 +2, step 2 +1; weakest step 6 -5, step 16 -4
- register (MIDI, transposed to C) 64 (60–68)
- degrees (maj): 1 0.2, 5 0.19, 3 0.14, 4 0.12, 2 0.12, 6 0.11
- chords: voices 2.9 (2.3–3), spread 8 st, inversion share 0.48 (0.24–0.73), changes/bar 1.21 (0.9–1.56), qualities maj 0.48, pow 0.28, min 0.16, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.02, 4-bar 0.12, longer 0.86; rhythm only: 1-bar 0.13, 2-bar 0.01, 4-bar 0.08, longer 0.78

**keys** (70 songs, in 0.69 of songs)
- onsets/bar 4.5 (2.1–6); steps with P ≥ .5: 1,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.8 (0.2–2.3), off-16th onset share 0.05 (0–0.23)
- length 2.38 (1.92–5.94) 16ths, gate (length ÷ gap to next onset) 0.98 (0.89–1)
- velocity mean 87 ± 10.9 (flat files 0.23); accents step 12 +1, step 1 +1, step 10 +1; weakest step 16 -6, step 8 -3
- register (MIDI, transposed to C) 61 (58–66)
- degrees (maj): 1 0.23, 5 0.22, 3 0.12, 2 0.12, 4 0.11, 6 0.1
- chords: voices 2.9 (2.5–3.2), spread 8 st, inversion share 0.43 (0.26–0.68), changes/bar 1.56 (1–2.33), qualities maj 0.52, pow 0.25, min 0.13, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.02, 4-bar 0.04, longer 0.92; rhythm only: 1-bar 0.15, 2-bar 0.02, 4-bar 0.04, longer 0.78

**guitar** (80 songs, in 0.78 of songs)
- onsets/bar 7 (4.4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.2–2.1), off-16th onset share 0.06 (0–0.33)
- length 1.96 (1–2.9) 16ths, gate (length ÷ gap to next onset) 0.95 (0.68–1)
- velocity mean 83 ± 11.6 (flat files 0.19); accents step 1 +4, step 13 +2, step 5 +2; weakest step 10 -6, step 2 -5
- register (MIDI, transposed to C) 60 (55–64)
- degrees (maj): 1 0.26, 5 0.19, 3 0.12, 2 0.12, 4 0.11, 6 0.1
- chords: voices 3 (2.3–3.5), spread 9 st, inversion share 0.55 (0.41–0.7), changes/bar 1.54 (0.91–2.51), qualities maj 0.5, pow 0.35, min 0.1, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.03, 4-bar 0.09, longer 0.88; rhythm only: 1-bar 0.22, 2-bar 0.04, 4-bar 0.08, longer 0.66

**lead** (80 songs, in 0.78 of songs)
- onsets/bar 4 (3.4–5); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.1–3.1), off-16th onset share 0.08 (0.01–0.3)
- length 1.99 (1.75–3.17) 16ths, gate (length ÷ gap to next onset) 0.92 (0.79–0.99)
- velocity mean 99 ± 8.1 (flat files 0.28); accents step 9 +1, step 5 +1, step 1 +0; weakest step 16 -2, step 14 -2
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 1 0.21, 5 0.19, 3 0.16, 2 0.13, 4 0.11, 6 0.11
- intervals: repeat 0.25 (0.12–0.39), step 1–2 0.43 (0.33–0.54), skip 3–4 0.15 (0.09–0.22), leap 5–7 0.07 (0.03–0.12), octave 0 (0–0.01), descending share of moves 0.55 (0.49–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0, 4-bar 0.02, longer 0.95; rhythm only: 1-bar 0.06, 2-bar 0, 4-bar 0.02, longer 0.92

**arp** (10 songs, in 0.1 of songs)
- onsets/bar 8 (6.2–10); steps with P ≥ .5: 1,3,5,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,13,14,15
- syncopation: LHL/bar 1.9 (0.8–2.8), off-16th onset share 0.37 (0.1–0.46)
- length 1.21 (0.96–1.91) 16ths, gate (length ÷ gap to next onset) 0.97 (0.92–0.99)
- velocity mean 100 ± 7.9 (flat files 0.2); accents step 6 +5, step 1 +3, step 10 +2; weakest step 16 -2, step 2 -2
- register (MIDI, transposed to C) 70 (66–72)
- degrees (maj): 1 0.24, 5 0.23, 3 0.14, 7 0.14, 6 0.12, 4 0.06
- intervals: repeat 0.01 (0–0.05), step 1–2 0.26 (0.02–0.54), skip 3–4 0.27 (0.09–0.44), leap 5–7 0.29 (0.13–0.39), octave 0.01 (0–0.06), descending share of moves 0.52 (0.41–0.54)
- arp shape up 0.14, down 0.05, updown 0.35, random 0.45, static 0.01; spacing (16ths) {'1.0': 5, '2.0': 5}; octave span 0.88 (0.6–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.2, longer 0.8; rhythm only: 1-bar 0.4, 2-bar 0, 4-bar 0.2, longer 0.4

**seq** (26 songs, in 0.26 of songs)
- onsets/bar 6.2 (3.1–8.9); steps with P ≥ .5: 1,9,11,13,15; P ≥ .3: 1,3,4,5,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 1.1 (0.3–3.1), off-16th onset share 0.38 (0.19–0.48)
- length 1 (0.84–1.54) 16ths, gate (length ÷ gap to next onset) 0.81 (0.55–0.93)
- velocity mean 93 ± 10.9 (flat files 0.19); accents step 1 +4, step 14 +1, step 13 +1; weakest step 6 -4, step 10 -2
- register (MIDI, transposed to C) 62 (58–68)
- degrees (maj): 1 0.24, 5 0.17, 3 0.16, 4 0.14, 2 0.1, 6 0.1
- intervals: repeat 0.12 (0–0.47), step 1–2 0.34 (0–0.49), skip 3–4 0.09 (0.03–0.14), leap 5–7 0.07 (0.04–0.26), octave 0 (0–0.03), descending share of moves 0.5 (0.46–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.06, 4-bar 0.14, longer 0.74; rhythm only: 1-bar 0.27, 2-bar 0.06, 4-bar 0, longer 0.67

**drums** (86 songs with a usable kit; flat-velocity files 0.14)
- families: kick_4otf 0.1, kick_1_and_9_only 0.59, snare_backbeat_5_13 0.38, snare_halftime_9 0.07, hat_16ths 0.07, hat_8ths 0.49, hat_offbeat_only 0, hat_none 0.09
- kick: hits/bar 3 (2–3.7), songs using 0.99, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9; vel 102 ± 6.9
- snare: hits/bar 1.4 (0.8–2), songs using 0.84, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 102 ± 4.6
- hat: hits/bar 7.1 (4.1–7.9), songs using 0.92, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 75 ± 10.8
- perc: hits/bar 1 (0–2.7), songs using 0.55, P ≥ .5 at steps none, P ≥ .2 at 5,9,11,13,15; vel 85 ± 12.2
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel 50 ± 10.9
- cymb: hits/bar 0.3 (0.1–1.2), songs using 0.44, P ≥ .5 at steps none, P ≥ .2 at 1; vel 85 ± 9
- open-hat share of hat hits 0.12, ride share of cymbals 0.34, fill-bar share 0.1

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 42 | 98 / 129 / 154 | 0.19 | 4 (2.8–4) | 0.93 (0.75–0.99) | 0.37 (0.22–0.46) | 0.59 | 0.05 | 0.03 | 0.08 | i v VI III (0.29) |
| new | 37 | 106 / 124 / 158 | 0.32 | 4 (2–4) | 0.88 (0.8–0.95) | 0.46 (0.37–0.56) | 0.7 | 0.16 | 0.09 | 0.09 | i VI VII (0.25) |

### BLUEGRASS (54 songs, 39 artists; sources {'lmd': 54}; distinctness 0.23)


Tempo p10/p50/p90 95 / 127 / 154; minor share 0.17.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| drum_kick_1_and_9_only | 0.58 | 0.77 | -0.19 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i III IV | 0.11 | 0.04 |
| i III IV VI | 0.11 | 0.01 |
| i IV VI VII | 0.11 | 0.01 |
| i III VI VII | 0.11 | 0.01 |
| III IV VI VII | 0.11 | 0.01 |
| i III VII IV | 0.11 | 0.02 |
| i III IV VII | 0.11 | 0.01 |
| i III VII | 0.11 | 0 |
| i III v VI | 0.11 | 0.06 |
| IV v | 0.11 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV V | 0.4 | 0.12 |
| I V | 0.31 | 0.05 |
| I IV I V | 0.29 | 0.04 |
| I IV | 0.27 | 0.04 |
| I V I IV | 0.24 | 0.04 |
| I V IV V | 0.22 | 0.03 |
| I V IV | 0.18 | 0.03 |
| I vi IV V | 0.13 | 0.02 |
| I IV V IV | 0.11 | 0.02 |
| I iii IV V | 0.11 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 3489 songs, minor share 0.1; share of songs containing the loop ≥ 2×): I IV I V (maj) 0.46, I IV (maj) 0.4, I V I IV (maj) 0.39, I IV V (maj) 0.26, I V IV (maj) 0.22, I V (maj) 0.21, I IV V IV (maj) 0.21, I V IV V (maj) 0.16. By era: 80s (353 songs, minor 0.04): I IV I V (maj) 0.55, I V I IV (maj) 0.45, I IV (maj) 0.45, I IV V (maj) 0.31; new (2344 songs, minor 0.11): I IV I V (maj) 0.44, I IV (maj) 0.4, I V I IV (maj) 0.38, I IV V (maj) 0.26

**bass** (52 songs, in 0.96 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1,9; P ≥ .3: 1,5,7,9,13,15
- syncopation: LHL/bar 0.2 (0–1), off-16th onset share 0.02 (0–0.14)
- length 2.72 (1.98–4.24) 16ths, gate (length ÷ gap to next onset) 0.92 (0.81–0.99)
- velocity mean 90 ± 7.3 (flat files 0.33); accents step 2 +3, step 1 +1, step 7 +0; weakest step 14 -7, step 4 -3
- register (MIDI, transposed to C) 38 (36–41)
- degrees (maj): 1 0.26, 5 0.24, 4 0.16, 2 0.11, 6 0.09, 3 0.07
- intervals: repeat 0.33 (0.22–0.48), step 1–2 0.19 (0.12–0.3), skip 3–4 0.04 (0.02–0.09), leap 5–7 0.22 (0.14–0.42), octave 0.01 (0–0.04), descending share of moves 0.5 (0.45–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.02, longer 0.98; rhythm only: 1-bar 0.08, 2-bar 0.03, 4-bar 0.04, longer 0.85

**chord** (13 songs, in 0.24 of songs)
- onsets/bar 7 (5–8); steps with P ≥ .5: 1,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.9 (0.5–2.5), off-16th onset share 0.28 (0.19–0.47)
- length 0.84 (0.6–1.05) 16ths, gate (length ÷ gap to next onset) 0.44 (0.3–0.9)
- velocity mean 82 ± 11.9 (flat files 0.15); accents step 4 +4, step 6 +4, step 5 +2; weakest step 2 -2, step 7 -2
- register (MIDI, transposed to C) 67 (65–70)
- degrees (maj): 1 0.2, 5 0.15, 3 0.14, 2 0.13, 4 0.12, 6 0.1
- chords: voices 2.3 (2.1–2.7), spread 5 st, inversion share 0.67 (0.44–0.79), changes/bar 1.5 (1.08–2.07), qualities pow 0.45, maj 0.4, min 0.14, sus 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.03, longer 0.97

**pad** (32 songs, in 0.59 of songs)
- onsets/bar 2 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.2 (0.1–0.7), off-16th onset share 0.02 (0–0.06)
- length 8.43 (7.95–15.54) 16ths, gate (length ÷ gap to next onset) 1 (0.99–1)
- velocity mean 77 ± 11.6 (flat files 0.31); accents step 14 +8, step 4 +4, step 11 +3; weakest step 6 -15, step 2 -4
- register (MIDI, transposed to C) 66 (60–70)
- degrees (maj): 1 0.19, 5 0.17, 3 0.13, 6 0.12, 2 0.12, 4 0.12
- chords: voices 2.8 (2.2–3.1), spread 8 st, inversion share 0.43 (0.26–0.68), changes/bar 1.17 (0.99–1.41), qualities maj 0.5, pow 0.26, min 0.14, dim 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.01, longer 0.99; rhythm only: 1-bar 0.13, 2-bar 0.03, 4-bar 0.04, longer 0.8

**keys** (41 songs, in 0.76 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.6 (0.1–1.4), off-16th onset share 0.06 (0.01–0.21)
- length 3.65 (1.6–6.23) 16ths, gate (length ÷ gap to next onset) 0.97 (0.75–1.02)
- velocity mean 82 ± 10.3 (flat files 0.27); accents step 12 +2, step 9 +1, step 4 +0; weakest step 6 -6, step 16 -6
- register (MIDI, transposed to C) 62 (58–66)
- degrees (maj): 5 0.21, 1 0.2, 3 0.12, 2 0.12, 4 0.11, 6 0.11
- chords: voices 3 (2.8–3.4), spread 9 st, inversion share 0.55 (0.33–0.68), changes/bar 1.62 (0.93–2.17), qualities maj 0.55, pow 0.2, min 0.17, maj7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.01, longer 0.99; rhythm only: 1-bar 0.17, 2-bar 0, 4-bar 0.01, longer 0.82

**guitar** (46 songs, in 0.85 of songs)
- onsets/bar 6.5 (4.2–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1 (0.2–1.9), off-16th onset share 0.05 (0–0.28)
- length 2.03 (1.31–3.37) 16ths, gate (length ÷ gap to next onset) 0.97 (0.7–1.2)
- velocity mean 83 ± 12.3 (flat files 0.24); accents step 1 +2, step 5 +0, step 9 +0; weakest step 10 -6, step 2 -6
- register (MIDI, transposed to C) 60 (56–65)
- degrees (maj): 1 0.22, 5 0.2, 2 0.13, 3 0.11, 4 0.11, 6 0.11
- chords: voices 2.9 (2.3–3.2), spread 8 st, inversion share 0.52 (0.24–0.7), changes/bar 0.95 (0.6–1.98), qualities maj 0.44, pow 0.37, min 0.14, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0, 4-bar 0, longer 0.99; rhythm only: 1-bar 0.27, 2-bar 0, 4-bar 0.02, longer 0.72

**lead** (42 songs, in 0.78 of songs)
- onsets/bar 4 (4–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.4 (1.6–3.1), off-16th onset share 0.19 (0.04–0.33)
- length 1.93 (1.6–2.68) 16ths, gate (length ÷ gap to next onset) 0.87 (0.75–0.98)
- velocity mean 99 ± 9.1 (flat files 0.38); accents step 7 +2, step 13 +1, step 11 +0; weakest step 2 -2, step 12 -2
- register (MIDI, transposed to C) 72 (68–74)
- degrees (maj): 5 0.18, 1 0.17, 3 0.16, 2 0.13, 6 0.13, 4 0.1
- intervals: repeat 0.25 (0.16–0.35), step 1–2 0.49 (0.37–0.6), skip 3–4 0.13 (0.08–0.19), leap 5–7 0.07 (0.05–0.09), octave 0 (0–0.01), descending share of moves 0.55 (0.51–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.01, longer 0.99

**arp** (4 songs, in 0.07 of songs)
- onsets/bar 13.8 (10.4–16); steps with P ≥ .5: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 0.7 (0.2–1.8), off-16th onset share 0.47 (0.46–0.48)
- length 0.88 (0.68–1.1) 16ths, gate (length ÷ gap to next onset) 0.82 (0.6–1.05)
- velocity mean 86 ± 7.5 (flat files 0); accents step 1 +1, step 9 +1, step 13 +1; weakest step 3 -3, step 8 -2
- register (MIDI, transposed to C) 70 (64–72)
- degrees (maj): 1 0.3, 2 0.17, 5 0.17, 3 0.12, 4 0.1, 6 0.1
- intervals: repeat 0.02 (0–0.04), step 1–2 0.17 (0.03–0.32), skip 3–4 0.32 (0.24–0.38), leap 5–7 0.22 (0.18–0.36), octave 0.06 (0.04–0.11), descending share of moves 0.45 (0.41–0.48)
- arp shape up 0.09, down 0.12, updown 0.05, random 0.73, static 0; spacing (16ths) {'1.0': 3, '1.25': 1}; octave span 1 (1–1.1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**seq** (5 songs, in 0.09 of songs)
- onsets/bar 5.5 (5–7); steps with P ≥ .5: 1,9,15; P ≥ .3: 1,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.3 (2.2–3.2), off-16th onset share 0.35 (0.04–0.43)
- length 1.1 (0.98–1.33) 16ths, gate (length ÷ gap to next onset) 0.69 (0.67–0.83)
- velocity mean 83 ± 8.9 (flat files 0.4); accents step 13 +4, step 5 +3, step 3 +2; weakest step 8 -3, step 6 -3
- register (MIDI, transposed to C) 64 (60–65)
- degrees (maj): 5 0.31, 1 0.21, 3 0.14, 2 0.1, 4 0.09, 6 0.09
- intervals: repeat 0.25 (0.18–0.37), step 1–2 0.32 (0.21–0.36), skip 3–4 0.06 (0–0.07), leap 5–7 0.06 (0.03–0.5), octave 0.01 (0–0.03), descending share of moves 0.53 (0.48–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**drums** (45 songs with a usable kit; flat-velocity files 0.13)
- families: kick_4otf 0.11, kick_1_and_9_only 0.58, snare_backbeat_5_13 0.36, snare_halftime_9 0.02, hat_16ths 0.11, hat_8ths 0.49, hat_offbeat_only 0, hat_none 0.09
- kick: hits/bar 3 (2.1–3.5), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9; vel 104 ± 5.8
- snare: hits/bar 1.6 (0.7–2), songs using 0.87, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 106 ± 3.3
- hat: hits/bar 6.9 (3.8–8), songs using 0.89, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 79 ± 11.4
- perc: hits/bar 1.9 (0.5–3.3), songs using 0.71, P ≥ .5 at steps none, P ≥ .2 at 5,7,11,13; vel 97 ± 8.3
- tom: hits/bar 0 (0–0), songs using 0.02, P ≥ .5 at steps none, P ≥ .2 at none; vel 67 ± 15.6
- cymb: hits/bar 0.3 (0.1–1.1), songs using 0.4, P ≥ .5 at steps none, P ≥ .2 at none; vel 85 ± 10.6
- open-hat share of hat hits 0.12, ride share of cymbals 0.49, fill-bar share 0.06

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 23 | 94 / 124 / 153 | 0.17 | 4 (3–4.8) | 0.93 (0.79–1) | 0.5 (0.39–0.59) | 0.61 | 0.04 | 0.12 | 0.12 | i III v VI (0.25) |

