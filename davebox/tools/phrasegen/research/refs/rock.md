# ROCK — reference statistics

**162 songs measured** (210 selected), 118 artists; sources {'lmd': 162}; eras {'80s': 100, 'new': 23, '?': 29, '90s': 10}; era splits: {'80s': 100, 'new': 23}. Every table: `analysis/out/rock_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **96 / 122 / 155**; file BPM q1/med/q3 93 / 116 / 130; minor share **0.24**.

## Findings

Positive control passes: kick '1 + 9 only' in **67 %**, 4otf 4.5 %, snare backbeat 67 %, 8th hats, ride 48 % of cymbal hits. Bass 4 onsets/bar on 1, 7, 9, 15 with legato gates (.83). Major 56 % + mixolydian 20 % (minor only 24 %; the 2000s+ subset is 4 % minor). I–IV, I–V–I–IV, I–IV–V dominate MIDI and sheets alike. The BLUES flavour (89) differs mainly by chord-part presence.

Flavours filed under this style: **BLUES** (89 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 0.96 (0.68–1.21). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i III | 0.16 | 0.06 |
| i iv VII iv | 0.13 | 0.01 |
| i IV | 0.13 | 0.04 |
| i VII VI | 0.13 | 0.05 |
| i v iv | 0.1 | 0.04 |
| i III VII | 0.1 | 0.03 |
| i iv | 0.08 | 0.01 |
| i iv v | 0.08 | 0.02 |
| i VI iv | 0.08 | 0.02 |
| i VII iv | 0.08 | 0.03 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.33 | 0.07 |
| I V I IV | 0.22 | 0.04 |
| I IV I V | 0.21 | 0.04 |
| I V | 0.2 | 0.04 |
| I IV V | 0.19 | 0.04 |
| I V IV | 0.15 | 0.03 |
| I IV V IV | 0.13 | 0.01 |
| I V IV V | 0.12 | 0.02 |
| I bVII IV | 0.1 | 0.03 |
| I IV I bVII | 0.09 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 133820 songs, minor share 0.26; share of songs containing the loop ≥ 2×): I IV (maj) 0.24, I IV I V (maj) 0.18, I IV V (maj) 0.16, I V IV (maj) 0.15, I IV V IV (maj) 0.14, I V I IV (maj) 0.14, I V IV V (maj) 0.11, I V vi IV (maj) 0.1. By era: 80s (30372 songs, minor 0.2): I IV (maj) 0.3, I IV I V (maj) 0.24, I IV V (maj) 0.19, I V I IV (maj) 0.18; new (77870 songs, minor 0.3): I IV (maj) 0.21, I V IV (maj) 0.15, I IV I V (maj) 0.15, I IV V (maj) 0.13

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (158 songs, in 0.97 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1,7,9,15; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.2–1.5), off-16th onset share 0.02 (0–0.09)
- length 1.97 (1.65–3.48) 16ths, gate (length ÷ gap to next onset) 0.83 (0.74–0.95)
- velocity mean 102 ± 8.9 (flat files 0.25); accents step 1 +2, step 13 +1, step 5 +1; weakest step 16 -4, step 6 -4
- register (MIDI, transposed to C) 36 (33–38)
- degrees (maj): 1 0.3, 5 0.21, 4 0.14, 2 0.1, 6 0.09, 3 0.06
- intervals: repeat 0.41 (0.28–0.59), step 1–2 0.2 (0.12–0.29), skip 3–4 0.07 (0.03–0.13), leap 5–7 0.17 (0.08–0.29), octave 0.01 (0–0.05), descending share of moves 0.49 (0.44–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.03, 4-bar 0.07, longer 0.89; rhythm only: 1-bar 0.13, 2-bar 0.03, 4-bar 0.06, longer 0.79

**chord** (36 songs, in 0.22 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.1 (0.9–3), off-16th onset share 0.13 (0.01–0.32)
- length 1.68 (0.94–2.1) 16ths, gate (length ÷ gap to next onset) 0.76 (0.53–0.93)
- velocity mean 87 ± 11 (flat files 0.25); accents step 1 +2, step 13 +1, step 6 +1; weakest step 10 -3, step 11 -1
- register (MIDI, transposed to C) 68 (63–72)
- degrees (maj): 1 0.19, 3 0.17, 5 0.16, 2 0.12, 6 0.1, 4 0.09
- chords: voices 2.1 (2–2.8), spread 7 st, inversion share 0.58 (0.37–0.83), changes/bar 1.59 (1.12–2.18), qualities pow 0.55, maj 0.34, min 0.07, sus 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.11, 4-bar 0.11, longer 0.73; rhythm only: 1-bar 0.16, 2-bar 0.11, 4-bar 0.02, longer 0.7

**pad** (104 songs, in 0.64 of songs)
- onsets/bar 1 (1–2); steps with P ≥ .5: 1; P ≥ .3: 1
- syncopation: LHL/bar 0.5 (0–1.6), off-16th onset share 0 (0–0.09)
- length 8.03 (3.42–15.92) 16ths, gate (length ÷ gap to next onset) 0.98 (0.93–1)
- velocity mean 83 ± 9.8 (flat files 0.2); accents step 10 +4, step 7 +2, step 8 +2; weakest step 2 -10, step 6 -5
- register (MIDI, transposed to C) 64 (60–68)
- degrees (maj): 1 0.21, 5 0.18, 3 0.14, 4 0.12, 6 0.12, 2 0.1
- chords: voices 2.7 (2.2–3), spread 8 st, inversion share 0.56 (0.31–0.8), changes/bar 1.08 (0.85–1.53), qualities maj 0.46, pow 0.26, min 0.21, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.07, 4-bar 0.09, longer 0.84; rhythm only: 1-bar 0.23, 2-bar 0.04, 4-bar 0.04, longer 0.69

**keys** (122 songs, in 0.75 of songs)
- onsets/bar 4 (2.1–7); steps with P ≥ .5: 1,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0.4–1.9), off-16th onset share 0.05 (0–0.14)
- length 2.4 (1.64–4) 16ths, gate (length ÷ gap to next onset) 0.9 (0.71–0.99)
- velocity mean 88 ± 11.2 (flat files 0.2); accents step 8 +2, step 14 +2, step 4 +1; weakest step 16 -2, step 10 -1
- register (MIDI, transposed to C) 64 (60–69)
- degrees (maj): 1 0.22, 5 0.18, 3 0.12, 2 0.11, 4 0.11, 6 0.1
- chords: voices 3 (2.6–3.2), spread 8 st, inversion share 0.5 (0.34–0.69), changes/bar 1.58 (1–2.32), qualities maj 0.47, pow 0.26, min 0.16, min7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.06, 4-bar 0.1, longer 0.84; rhythm only: 1-bar 0.17, 2-bar 0.04, 4-bar 0.04, longer 0.74

**guitar** (136 songs, in 0.84 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0.3–2.3), off-16th onset share 0.07 (0–0.28)
- length 1.87 (1.21–2.44) 16ths, gate (length ÷ gap to next onset) 0.88 (0.59–0.98)
- velocity mean 86 ± 11.9 (flat files 0.17); accents step 1 +3, step 13 +1, step 5 +1; weakest step 16 -3, step 2 -2
- register (MIDI, transposed to C) 60 (55–63)
- degrees (maj): 1 0.24, 5 0.21, 3 0.11, 4 0.11, 6 0.11, 2 0.1
- chords: voices 2.9 (2.2–3.2), spread 8 st, inversion share 0.51 (0.31–0.69), changes/bar 1.52 (0.88–2.13), qualities pow 0.42, maj 0.38, min 0.11, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.03, 4-bar 0.09, longer 0.87; rhythm only: 1-bar 0.19, 2-bar 0.02, 4-bar 0.05, longer 0.74

**lead** (145 songs, in 0.9 of songs)
- onsets/bar 4 (3.5–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (1.5–2.8), off-16th onset share 0.06 (0.01–0.17)
- length 1.93 (1.6–2.17) 16ths, gate (length ÷ gap to next onset) 0.88 (0.73–0.98)
- velocity mean 103 ± 8.6 (flat files 0.28); accents step 1 +1, step 5 +1, step 9 +1; weakest step 2 -2, step 6 -1
- register (MIDI, transposed to C) 69 (67–72)
- degrees (maj): 1 0.22, 5 0.17, 3 0.14, 2 0.13, 6 0.12, 4 0.1
- intervals: repeat 0.27 (0.15–0.39), step 1–2 0.45 (0.3–0.57), skip 3–4 0.15 (0.09–0.21), leap 5–7 0.07 (0.04–0.1), octave 0 (0–0.01), descending share of moves 0.55 (0.51–0.59)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.02, 4-bar 0.04, longer 0.93; rhythm only: 1-bar 0.04, 2-bar 0.03, 4-bar 0.05, longer 0.88

**arp** (8 songs, in 0.05 of songs)
- onsets/bar 8 (6.9–9.9); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,10,11,13,14,15
- syncopation: LHL/bar 1.1 (0–2.6), off-16th onset share 0.25 (0–0.46)
- length 1.31 (1–1.54) 16ths, gate (length ÷ gap to next onset) 0.77 (0.71–0.97)
- velocity mean 106 ± 14 (flat files 0.12); accents step 9 +5, step 1 +5, step 5 +4; weakest step 16 -4, step 8 -3
- register (MIDI, transposed to C) 65 (62–68)
- degrees (maj): 6 0.19, 1 0.18, 5 0.17, 3 0.13, 2 0.1, 4 0.06
- intervals: repeat 0.04 (0.01–0.14), step 1–2 0.46 (0.38–0.52), skip 3–4 0.23 (0.16–0.25), leap 5–7 0.15 (0.07–0.2), octave 0.03 (0.02–0.09), descending share of moves 0.51 (0.39–0.59)
- arp shape up 0.23, down 0.2, updown 0.23, random 0.34, static 0; spacing (16ths) {'2.0': 3, '1.0': 3, '2.5': 1, '1.5': 1}; octave span 0.85 (0.82–1.31)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**seq** (24 songs, in 0.15 of songs)
- onsets/bar 5.5 (3–8); steps with P ≥ .5: 1,7,11,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0.2–4.5), off-16th onset share 0.03 (0–0.45)
- length 1.36 (0.84–2.08) 16ths, gate (length ÷ gap to next onset) 0.67 (0.5–0.82)
- velocity mean 102 ± 7.6 (flat files 0.33); accents step 16 +5, step 1 +3, step 9 +1; weakest step 2 -7, step 8 -1
- register (MIDI, transposed to C) 58 (56–64)
- degrees (maj): 1 0.22, 5 0.21, 4 0.17, 2 0.12, 3 0.1, 6 0.09
- intervals: repeat 0.33 (0.13–0.53), step 1–2 0.23 (0.12–0.47), skip 3–4 0.07 (0–0.2), leap 5–7 0.07 (0.03–0.16), octave 0 (0–0.02), descending share of moves 0.51 (0.49–0.56)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.12, 4-bar 0.11, longer 0.74; rhythm only: 1-bar 0.28, 2-bar 0.08, 4-bar 0.07, longer 0.57

**fx** (8 songs, in 0.05 of songs)
- onsets/bar 3 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,9,11,13,15
- syncopation: LHL/bar 1 (0.8–1.3), off-16th onset share 0 (0–0)
- length 2.38 (1.75–4.97) 16ths, gate (length ÷ gap to next onset) 0.95 (0.61–0.99)
- velocity mean 89 ± 7.7 (flat files 0.38); accents step 7 +5, step 15 +3, step 3 +2; weakest step 11 -4, step 5 -1
- register (MIDI, transposed to C) 67 (62–70)
- degrees (maj): 5 0.21, 1 0.19, 4 0.13, 3 0.1, 7 0.1, 2 0.08
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.25, 2-bar 0.25, 4-bar 0, longer 0.5

**drums** (155 songs with a usable kit; flat-velocity files 0.09)
- families: kick_4otf 0.04, kick_1_and_9_only 0.67, snare_backbeat_5_13 0.67, snare_halftime_9 0.01, hat_16ths 0.04, hat_8ths 0.39, hat_offbeat_only 0.01, hat_none 0.14
- kick: hits/bar 3.2 (2.7–3.9), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,11,15; vel 103 ± 7.6
- snare: hits/bar 2 (1.5–2.2), songs using 0.93, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 104 ± 5.6
- hat: hits/bar 6 (2.7–7.8), songs using 0.86, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 80 ± 11.6
- perc: hits/bar 0.6 (0–5.3), songs using 0.49, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 73 ± 13.9
- tom: hits/bar 0 (0–0), songs using 0.01, P ≥ .5 at steps none, P ≥ .2 at none; vel 53 ± 14
- cymb: hits/bar 0.6 (0.2–2.6), songs using 0.59, P ≥ .5 at steps none, P ≥ .2 at 1,5,9,13; vel 85 ± 9.6
- open-hat share of hat hits 0.13, ride share of cymbals 0.48, fill-bar share 0.09

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 100 | 100 / 125 / 159 | 0.27 | 4 (3–5) | 0.82 (0.75–0.97) | 0.44 (0.31–0.55) | 0.6 | 0.06 | 0.04 | 0.01 | i III (0.19) |
| new | 23 | 95 / 122 / 150 | 0.04 | 4 (4–5.8) | 0.87 (0.69–0.97) | 0.47 (0.28–0.62) | 0.78 | – | 0.04 | 0.09 | i III VII (1) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### BLUES (89 songs, 66 artists; sources {'lmd': 89}; distinctness 0.2)


Tempo p10/p50/p90 94 / 120 / 150; minor share 0.32.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| chord_presence | 0.39 | 0.22 | +0.17 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.21 | 0.04 |
| i III VII | 0.14 | 0.01 |
| i III VI V | 0.11 | 0 |
| i III VII VI | 0.11 | 0 |
| i VI iv III | 0.11 | 0.02 |
| i VI III VII | 0.11 | 0.03 |
| i VI VII | 0.07 | 0.03 |
| i iv VII III | 0.07 | 0.03 |
| i VII VI VII | 0.07 | 0.02 |
| III v VI iv | 0.07 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV V | 0.28 | 0.06 |
| I IV | 0.23 | 0.06 |
| I V I IV | 0.22 | 0.04 |
| I V | 0.22 | 0.03 |
| I V IV V | 0.15 | 0.03 |
| I IV I V | 0.15 | 0.04 |
| I V vi IV | 0.13 | 0.05 |
| I IV V IV | 0.12 | 0.02 |
| I vi | 0.12 | 0.02 |
| I iii IV V | 0.1 | 0.04 |

Chord-sheet cross-check (Chordonomicon, 9955 songs, minor share 0.21; share of songs containing the loop ≥ 2×): I IV (maj) 0.32, I IV I V (maj) 0.28, I V IV (maj) 0.2, I V I IV (maj) 0.19, I IV V IV (maj) 0.18, I IV V (maj) 0.14, I V (maj) 0.1, I V IV V (maj) 0.09. By era: 80s (3688 songs, minor 0.18): I IV (maj) 0.35, I IV I V (maj) 0.31, I V I IV (maj) 0.21, I V IV (maj) 0.21; new (4460 songs, minor 0.25): I IV (maj) 0.29, I IV I V (maj) 0.24, I V IV (maj) 0.19, I V I IV (maj) 0.17

**bass** (86 songs, in 0.97 of songs)
- onsets/bar 4 (4–6); steps with P ≥ .5: 1,7,9,13,15; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 0.5 (0.1–1.2), off-16th onset share 0.02 (0–0.16)
- length 1.97 (1.68–2.92) 16ths, gate (length ÷ gap to next onset) 0.85 (0.73–0.96)
- velocity mean 103 ± 7.8 (flat files 0.22); accents step 1 +2, step 13 +1, step 9 +0; weakest step 10 -4, step 6 -3
- register (MIDI, transposed to C) 36 (34–40)
- degrees (maj): 1 0.25, 5 0.22, 4 0.14, 2 0.1, 6 0.1, 3 0.07
- intervals: repeat 0.4 (0.22–0.54), step 1–2 0.22 (0.14–0.3), skip 3–4 0.07 (0.03–0.14), leap 5–7 0.14 (0.09–0.28), octave 0.02 (0–0.05), descending share of moves 0.48 (0.41–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.06, 4-bar 0.07, longer 0.86; rhythm only: 1-bar 0.15, 2-bar 0.06, 4-bar 0.05, longer 0.74

**chord** (35 songs, in 0.39 of songs)
- onsets/bar 4 (2–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (0.9–2.5), off-16th onset share 0.07 (0.01–0.31)
- length 1.5 (0.96–2.15) 16ths, gate (length ÷ gap to next onset) 0.68 (0.5–0.83)
- velocity mean 91 ± 9.9 (flat files 0.14); accents step 8 +3, step 5 +1, step 13 +1; weakest step 2 -4, step 12 -3
- register (MIDI, transposed to C) 69 (65–74)
- degrees (maj): 5 0.2, 1 0.19, 6 0.13, 2 0.13, 3 0.1, 4 0.1
- chords: voices 2.5 (2–3), spread 7 st, inversion share 0.56 (0.3–0.82), changes/bar 1.15 (0.65–1.96), qualities pow 0.4, maj 0.32, min 0.15, dim 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.01, 4-bar 0.08, longer 0.89; rhythm only: 1-bar 0.25, 2-bar 0.04, 4-bar 0.08, longer 0.63

**pad** (46 songs, in 0.52 of songs)
- onsets/bar 2 (1–3.4); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.7 (0.1–2), off-16th onset share 0.04 (0–0.2)
- length 7.56 (1.96–15.96) 16ths, gate (length ÷ gap to next onset) 0.99 (0.9–1)
- velocity mean 82 ± 9.8 (flat files 0.15); accents step 16 +4, step 6 +4, step 14 +4; weakest step 2 -2, step 8 -1
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 5 0.2, 1 0.18, 6 0.13, 3 0.12, 4 0.1, 2 0.09
- chords: voices 2.6 (2–3.1), spread 8 st, inversion share 0.63 (0.46–0.75), changes/bar 1.27 (0.84–1.66), qualities maj 0.44, pow 0.32, min 0.19, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.02, 4-bar 0.14, longer 0.84; rhythm only: 1-bar 0.19, 2-bar 0.06, 4-bar 0.06, longer 0.7

**keys** (67 songs, in 0.75 of songs)
- onsets/bar 5 (2–6.5); steps with P ≥ .5: 1,5,9,13; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.9 (0.3–1.7), off-16th onset share 0.06 (0–0.18)
- length 1.97 (0.98–4.17) 16ths, gate (length ÷ gap to next onset) 0.8 (0.48–0.97)
- velocity mean 84 ± 10.8 (flat files 0.15); accents step 12 +1, step 13 +1, step 4 +1; weakest step 10 -3, step 2 -2
- register (MIDI, transposed to C) 64 (60–68)
- degrees (maj): 1 0.21, 5 0.18, 3 0.12, 4 0.11, 6 0.11, 2 0.1
- chords: voices 3 (2.5–3.3), spread 8 st, inversion share 0.5 (0.3–0.69), changes/bar 1.54 (0.86–1.98), qualities maj 0.47, pow 0.23, min 0.18, maj7 0.06
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.08, 4-bar 0.05, longer 0.86; rhythm only: 1-bar 0.14, 2-bar 0.07, 4-bar 0.04, longer 0.75

**guitar** (76 songs, in 0.85 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0.2–2.7), off-16th onset share 0.06 (0–0.32)
- length 1.83 (0.95–2.35) 16ths, gate (length ÷ gap to next onset) 0.84 (0.48–1)
- velocity mean 86 ± 10.4 (flat files 0.13); accents step 1 +2, step 13 +1, step 5 +1; weakest step 10 -6, step 16 -4
- register (MIDI, transposed to C) 60 (55–64)
- degrees (maj): 1 0.23, 5 0.2, 2 0.11, 4 0.11, 3 0.1, 6 0.1
- chords: voices 2.8 (2.1–3.1), spread 8 st, inversion share 0.49 (0.18–0.69), changes/bar 1.33 (0.51–2.28), qualities pow 0.41, maj 0.38, min 0.12, maj7 0.04
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.04, 4-bar 0.04, longer 0.91; rhythm only: 1-bar 0.26, 2-bar 0.02, 4-bar 0.04, longer 0.68

**lead** (71 songs, in 0.8 of songs)
- onsets/bar 4 (3.8–5); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.4 (1.4–3.1), off-16th onset share 0.09 (0.01–0.28)
- length 1.98 (1.6–2.5) 16ths, gate (length ÷ gap to next onset) 0.83 (0.74–0.98)
- velocity mean 101 ± 10 (flat files 0.25); accents step 2 +1, step 1 +1, step 9 +1; weakest step 4 -2, step 12 -1
- register (MIDI, transposed to C) 67 (65–72)
- degrees (maj): 1 0.18, 5 0.17, 3 0.14, 2 0.14, 6 0.12, 4 0.1
- intervals: repeat 0.25 (0.16–0.36), step 1–2 0.45 (0.26–0.54), skip 3–4 0.17 (0.1–0.25), leap 5–7 0.07 (0.03–0.1), octave 0 (0–0.01), descending share of moves 0.54 (0.49–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.06, longer 0.94; rhythm only: 1-bar 0.08, 2-bar 0, 4-bar 0.04, longer 0.87

**arp** (13 songs, in 0.15 of songs)
- onsets/bar 7 (7–8); steps with P ≥ .5: 1,3,5,7,9,11,13,15; P ≥ .3: 1,3,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2.1 (0.8–3), off-16th onset share 0.31 (0.13–0.49)
- length 1.03 (0.93–1.44) 16ths, gate (length ÷ gap to next onset) 0.79 (0.63–0.94)
- velocity mean 102 ± 10.5 (flat files 0.31); accents step 1 +6, step 13 +3, step 5 +3; weakest step 16 -2, step 6 -2
- register (MIDI, transposed to C) 65 (62–67)
- degrees (maj): 5 0.26, 1 0.18, 3 0.13, 6 0.12, 2 0.11, 4 0.11
- intervals: repeat 0.09 (0–0.19), step 1–2 0.25 (0.04–0.43), skip 3–4 0.29 (0.18–0.35), leap 5–7 0.23 (0.16–0.28), octave 0.01 (0–0.04), descending share of moves 0.49 (0.42–0.51)
- arp shape up 0.18, down 0.11, updown 0.13, random 0.56, static 0.01; spacing (16ths) {'2.0': 8, '1.0': 5}; octave span 0.83 (0.58–1)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.23, 2-bar 0, 4-bar 0, longer 0.77; rhythm only: 1-bar 0.46, 2-bar 0, 4-bar 0, longer 0.54

**seq** (19 songs, in 0.21 of songs)
- onsets/bar 4 (1–6); steps with P ≥ .5: 1; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0.2–2.7), off-16th onset share 0.03 (0–0.28)
- length 1.97 (1.48–4.77) 16ths, gate (length ÷ gap to next onset) 0.9 (0.71–0.99)
- velocity mean 100 ± 9.1 (flat files 0.21); accents step 14 +4, step 4 +2, step 5 +2; weakest step 3 -2, step 6 -1
- register (MIDI, transposed to C) 52 (48–55)
- degrees (maj): 1 0.27, 5 0.22, 4 0.17, b7 0.07, 2 0.07, 6 0.07
- intervals: repeat 0.21 (0–0.26), step 1–2 0.35 (0.15–0.49), skip 3–4 0.11 (0–0.21), leap 5–7 0.12 (0.06–0.25), octave 0 (0–0.01), descending share of moves 0.55 (0.43–0.6)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.11, 2-bar 0.1, 4-bar 0.03, longer 0.75; rhythm only: 1-bar 0.23, 2-bar 0.07, 4-bar 0.01, longer 0.68

**drums** (88 songs with a usable kit; flat-velocity files 0.09)
- families: kick_4otf 0.12, kick_1_and_9_only 0.61, snare_backbeat_5_13 0.62, snare_halftime_9 0.06, hat_16ths 0.06, hat_8ths 0.4, hat_offbeat_only 0, hat_none 0.12
- kick: hits/bar 3.2 (2.5–3.9), songs using 0.98, P ≥ .5 at steps 1,9, P ≥ .2 at 1,7,9,11,15; vel 106 ± 5.8
- snare: hits/bar 2 (1.7–2.3), songs using 0.92, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 111 ± 4.9
- hat: hits/bar 6.6 (3.7–7.8), songs using 0.88, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 85 ± 10.8
- perc: hits/bar 0.4 (0–4), songs using 0.47, P ≥ .5 at steps none, P ≥ .2 at 1,5,9,13; vel 85 ± 10.2
- tom: hits/bar 0 (0–0), songs using 0.03, P ≥ .5 at steps none, P ≥ .2 at none; vel 99 ± 3.3
- cymb: hits/bar 0.4 (0.1–1.6), songs using 0.51, P ≥ .5 at steps none, P ≥ .2 at 1; vel 92 ± 8.2
- open-hat share of hat hits 0.16, ride share of cymbals 0.4, fill-bar share 0.07

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 39 | 94 / 120 / 145 | 0.28 | 5 (4–6.4) | 0.89 (0.78–0.96) | 0.41 (0.26–0.52) | 0.41 | 0.1 | 0.07 | 0.05 | i iv (0.27) |
| new | 18 | 99 / 129 / 151 | 0.33 | 4.5 (3.2–8) | 0.86 (0.65–0.92) | 0.38 (0.26–0.57) | 0.61 | 0.17 | 0.11 | 0.06 | i iv (0.33) |

