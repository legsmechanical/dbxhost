# REGGAE — reference statistics

**90 songs measured** (124 selected), 63 artists; sources {'lmd': 76, 'lamd': 14}; eras {'80s': 20, 'new': 31, '?': 37, '90s': 2}; era splits: {'80s': 20, 'new': 31}. Every table: `analysis/out/reggae_tables.md`; every song: `songs.csv`.

Tempo (file BPM folded into 85–180) p10/p50/p90: **92 / 124 / 160**; file BPM q1/med/q3 81 / 100 / 121; minor share **0.31**.

## Findings

Guitar/keys skank: guitar P ≥ .5 on 3, 7, 11, 15 (the off-8ths), keys on 7, 11, 15. The snare backbeat is weak (5+13 in only 40 % of songs; one-drop and rockers files mix). Major-leaning (minor 31 %). Flavours: DANCEHALL (44 songs, shorter keys/lead gates, off-16th leads), SKA (54, the most major style: minor 17 %, snare backbeat back to 66 %, 8th hats), DUB (14, thin).

Flavours filed under this style: **DUB** (14 songs), **DANCEHALL** (44 songs), **SKA** (54 songs) — see "Flavours" below.

## Progressions (roman numerals, rotation-folded loop families)

Chord changes per bar 1.03 (0.83–1.44). Minor keys use natural-minor numerals (III VI VII = b3 b6 b7); power/sus chords are named as the mode's diatonic triad. "songs" = share of that mode's songs whose chord windows contain the loop at least twice.

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i iv | 0.22 | 0.04 |
| i VI VII | 0.15 | 0.08 |
| i iv i VII | 0.15 | 0.01 |
| i VII VI VII | 0.11 | 0.01 |
| i VI i VII | 0.11 | 0.02 |
| i VII v VI | 0.11 | 0.01 |
| i VI VII III | 0.11 | 0.02 |
| i iv i VI | 0.11 | 0.01 |
| i v | 0.07 | 0.03 |
| i V | 0.07 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV I V | 0.31 | 0.04 |
| I IV | 0.28 | 0.11 |
| I IV V | 0.25 | 0.05 |
| I V IV | 0.16 | 0.03 |
| I V I IV | 0.15 | 0.02 |
| I IV V IV | 0.15 | 0.02 |
| I V vi IV | 0.12 | 0.04 |
| I V IV V | 0.12 | 0.02 |
| I vi IV V | 0.12 | 0.03 |
| I V | 0.1 | 0.03 |

Chord-sheet cross-check (Chordonomicon, 6359 songs, minor share 0.37; share of songs containing the loop ≥ 2×): I IV (maj) 0.13, I IV V (maj) 0.09, I V vi IV (maj) 0.09, I V IV (maj) 0.08, I IV I V (maj) 0.08, I IV V IV (maj) 0.07, I V IV V (maj) 0.07, I V I IV (maj) 0.06. By era: 80s (474 songs, minor 0.3): I IV (maj) 0.23, I IV V (maj) 0.15, I IV I V (maj) 0.14, I ii (maj) 0.1; new (4781 songs, minor 0.4): I IV (maj) 0.11, I V vi IV (maj) 0.09, I IV V (maj) 0.08, I V IV (maj) 0.08

## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: maj)

**bass** (85 songs, in 0.94 of songs)
- onsets/bar 5 (4–7); steps with P ≥ .5: 1,7,9,13; P ≥ .3: 1,5,7,9,11,13,15
- syncopation: LHL/bar 1.1 (0.1–2.1), off-16th onset share 0.14 (0–0.3)
- length 1.96 (1.18–2.83) 16ths, gate (length ÷ gap to next onset) 0.79 (0.65–0.97)
- velocity mean 97 ± 8.4 (flat files 0.29); accents step 1 +1, step 9 +1, step 5 +1; weakest step 16 -6, step 14 -5
- register (MIDI, transposed to C) 36 (35–41)
- degrees (maj): 1 0.29, 5 0.21, 4 0.14, 6 0.11, 2 0.09, 3 0.07
- intervals: repeat 0.39 (0.18–0.53), step 1–2 0.23 (0.09–0.36), skip 3–4 0.08 (0.03–0.15), leap 5–7 0.16 (0.08–0.25), octave 0.01 (0–0.07), descending share of moves 0.48 (0.43–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.13, 4-bar 0.09, longer 0.77; rhythm only: 1-bar 0.22, 2-bar 0.08, 4-bar 0.07, longer 0.63

**chord** (26 songs, in 0.29 of songs)
- onsets/bar 4 (3–6); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.8 (1.8–3.8), off-16th onset share 0.21 (0.01–0.44)
- length 1.04 (0.61–1.99) 16ths, gate (length ÷ gap to next onset) 0.55 (0.43–0.79)
- velocity mean 85 ± 9.8 (flat files 0.15); accents step 1 +1, step 2 +0, step 12 +0; weakest step 10 -2, step 6 -1
- register (MIDI, transposed to C) 67 (64–72)
- degrees (maj): 1 0.25, 5 0.2, 3 0.14, 4 0.12, 6 0.09, 2 0.09
- chords: voices 2 (2–2.8), spread 5 st, inversion share 0.91 (0.56–0.97), changes/bar 1.4 (1–2.67), qualities pow 0.58, maj 0.28, min 0.12, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.09, 4-bar 0.12, longer 0.79; rhythm only: 1-bar 0.05, 2-bar 0.12, 4-bar 0.12, longer 0.71

**pad** (59 songs, in 0.66 of songs)
- onsets/bar 2 (1–3); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.5 (0.1–1.6), off-16th onset share 0.03 (0–0.16)
- length 7.53 (3.35–8.37) 16ths, gate (length ÷ gap to next onset) 0.97 (0.83–1)
- velocity mean 80 ± 9.8 (flat files 0.29); accents step 14 +8, step 12 +4, step 3 +4; weakest step 4 -1, step 10 -1
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 1 0.21, 5 0.17, 3 0.13, 4 0.12, 6 0.12, 2 0.1
- chords: voices 2.7 (2.2–3), spread 8 st, inversion share 0.62 (0.27–0.72), changes/bar 1.42 (0.93–1.8), qualities maj 0.52, pow 0.26, min 0.18, min7 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.03, 4-bar 0.15, longer 0.82; rhythm only: 1-bar 0.08, 2-bar 0.09, 4-bar 0.09, longer 0.74

**keys** (68 songs, in 0.76 of songs)
- onsets/bar 4.5 (3–7.6); steps with P ≥ .5: 1,7,11,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.8 (0.7–5.1), off-16th onset share 0.16 (0–0.39)
- length 2 (0.68–3.77) 16ths, gate (length ÷ gap to next onset) 0.83 (0.36–0.99)
- velocity mean 79 ± 10.8 (flat files 0.22); accents step 5 +1, step 13 +1, step 15 +1; weakest step 16 -5, step 2 -4
- register (MIDI, transposed to C) 64 (60–67)
- degrees (maj): 1 0.22, 5 0.18, 3 0.16, 6 0.12, 2 0.1, 4 0.1
- chords: voices 3 (2.9–3.1), spread 8 st, inversion share 0.5 (0.25–0.72), changes/bar 1.61 (0.96–2.29), qualities maj 0.55, min 0.26, pow 0.11, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.02, 2-bar 0.06, 4-bar 0.1, longer 0.82; rhythm only: 1-bar 0.3, 2-bar 0.02, 4-bar 0.04, longer 0.64

**guitar** (72 songs, in 0.8 of songs)
- onsets/bar 4 (4–7); steps with P ≥ .5: 1,3,7,11,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.9 (1.1–4.9), off-16th onset share 0.05 (0–0.33)
- length 1.21 (0.72–2.74) 16ths, gate (length ÷ gap to next onset) 0.68 (0.23–0.95)
- velocity mean 85 ± 9.1 (flat files 0.21); accents step 13 +1, step 5 +0, step 1 +0; weakest step 2 -8, step 6 -5
- register (MIDI, transposed to C) 62 (59–66)
- degrees (maj): 1 0.23, 5 0.19, 3 0.16, 6 0.12, 4 0.11, 2 0.09
- chords: voices 3 (2.4–3), spread 8 st, inversion share 0.55 (0.27–0.86), changes/bar 1.04 (0.55–1.53), qualities maj 0.52, pow 0.21, min 0.2, sus 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.07, 2-bar 0.12, 4-bar 0.08, longer 0.74; rhythm only: 1-bar 0.41, 2-bar 0.03, 4-bar 0.04, longer 0.51

**lead** (71 songs, in 0.79 of songs)
- onsets/bar 4 (3–5.2); steps with P ≥ .5: 1; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.6 (2–3.5), off-16th onset share 0.13 (0.04–0.32)
- length 1.96 (1.42–2.17) 16ths, gate (length ÷ gap to next onset) 0.87 (0.74–0.98)
- velocity mean 100 ± 9.6 (flat files 0.35); accents step 1 +2, step 9 +1, step 13 +1; weakest step 6 -2, step 10 -2
- register (MIDI, transposed to C) 69 (67–74)
- degrees (maj): 1 0.21, 3 0.17, 5 0.16, 2 0.14, 6 0.14, 4 0.08
- intervals: repeat 0.23 (0.14–0.35), step 1–2 0.48 (0.37–0.57), skip 3–4 0.16 (0.09–0.21), leap 5–7 0.06 (0.03–0.1), octave 0 (0–0), descending share of moves 0.54 (0.5–0.61)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.04, 4-bar 0.09, longer 0.85; rhythm only: 1-bar 0.04, 2-bar 0.05, 4-bar 0.07, longer 0.85

**arp** (8 songs, in 0.09 of songs)
- onsets/bar 7.5 (7–11.2); steps with P ≥ .5: 1,3,4,5,7,9,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,9,10,11,12,13,14,15
- syncopation: LHL/bar 1.5 (0–2), off-16th onset share 0.36 (0.27–0.38)
- length 1 (0.87–1.92) 16ths, gate (length ÷ gap to next onset) 0.91 (0.79–1.03)
- velocity mean 89 ± 9.8 (flat files 0.38); accents step 6 +4, step 13 +4, step 1 +3; weakest step 10 -8, step 12 -6
- register (MIDI, transposed to C) 63 (60–66)
- degrees (maj): 2 0.17, 5 0.17, 1 0.16, 3 0.14, 6 0.12, 4 0.11
- intervals: repeat 0.02 (0.02–0.07), step 1–2 0.39 (0.11–0.67), skip 3–4 0.16 (0.1–0.28), leap 5–7 0.15 (0.1–0.25), octave 0 (0–0.05), descending share of moves 0.5 (0.43–0.53)
- arp shape up 0.12, down 0.1, updown 0.1, random 0.68, static 0; spacing (16ths) {'1.0': 3, '2.0': 2, '1.75': 2, '1.5': 1}; octave span 0.67 (0.61–0.87)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0, 4-bar 0.1, longer 0.87; rhythm only: 1-bar 0.38, 2-bar 0, 4-bar 0.02, longer 0.6

**seq** (23 songs, in 0.26 of songs)
- onsets/bar 6 (4.5–7.8); steps with P ≥ .5: 1,3,7,9; P ≥ .3: 1,2,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (0.7–3.9), off-16th onset share 0.33 (0–0.45)
- length 1.48 (0.73–2) 16ths, gate (length ÷ gap to next onset) 0.8 (0.56–1)
- velocity mean 84 ± 8.8 (flat files 0.48); accents step 1 +3, step 5 +1, step 13 +1; weakest step 12 -3, step 10 -3
- register (MIDI, transposed to C) 62 (60–65)
- degrees (maj): 1 0.27, 5 0.21, 3 0.14, 6 0.12, 2 0.11, 4 0.09
- intervals: repeat 0.43 (0.21–0.62), step 1–2 0.3 (0.13–0.45), skip 3–4 0.07 (0.03–0.17), leap 5–7 0.06 (0.03–0.12), octave 0 (0–0), descending share of moves 0.52 (0.48–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.09, 2-bar 0.11, 4-bar 0.07, longer 0.74; rhythm only: 1-bar 0.28, 2-bar 0.07, 4-bar 0.06, longer 0.59

**fx** (8 songs, in 0.09 of songs)
- onsets/bar 3 (2.8–4.1); steps with P ≥ .5: 1,15; P ≥ .3: 1,3,7,9,11,15
- syncopation: LHL/bar 1.4 (0.9–3.3), off-16th onset share 0.11 (0–0.33)
- length 2.15 (0.76–4.74) 16ths, gate (length ÷ gap to next onset) 0.86 (0.61–0.96)
- velocity mean 85 ± 8.7 (flat files 0); accents step 14 +4, step 5 +1, step 15 +1; weakest step 16 -5, step 8 -3
- register (MIDI, transposed to C) 70 (66–74)
- degrees (maj): 1 0.23, 5 0.17, 2 0.15, 6 0.15, 3 0.1, 4 0.09
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.38, 2-bar 0, 4-bar 0, longer 0.62

**drums** (85 songs with a usable kit; flat-velocity files 0.13)
- families: kick_4otf 0.2, kick_1_and_9_only 0.46, snare_backbeat_5_13 0.4, snare_halftime_9 0.06, hat_16ths 0.17, hat_8ths 0.4, hat_offbeat_only 0.02, hat_none 0.08
- kick: hits/bar 3 (2.1–3.9), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13; vel 107 ± 4
- snare: hits/bar 1.7 (0.5–2), songs using 0.73, P ≥ .5 at steps 5, P ≥ .2 at 5,13; vel 107 ± 5.4
- hat: hits/bar 7.9 (5.6–10), songs using 0.92, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 79 ± 13.2
- perc: hits/bar 4.9 (0.8–10.2), songs using 0.79, P ≥ .5 at steps 5,13, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 74 ± 14.2
- tom: hits/bar 0 (0–0), songs using 0.04, P ≥ .5 at steps none, P ≥ .2 at none; vel 50 ± 19.2
- cymb: hits/bar 0.1 (0–0.4), songs using 0.26, P ≥ .5 at steps none, P ≥ .2 at none; vel 79 ± 10.8
- open-hat share of hat hits 0.08, ride share of cymbals 0.23, fill-bar share 0.05

## Era split (≤ 1995 vs ≥ 2000)

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 20 | 94 / 120 / 146 | 0.45 | 8 (5.2–8.8) | 0.73 (0.63–0.84) | 0.52 (0.36–0.56) | 0.65 | 0.1 | 0.44 | 0.25 | i VI VII (0.38) |
| new | 31 | 100 / 136 / 163 | 0.19 | 4 (4–5.5) | 0.86 (0.73–0.97) | 0.5 (0.43–0.61) | 0.84 | 0.13 | 0.23 | 0.1 | i VI i VII (0.33) |

## Flavours

Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = mean scaled |delta|, capped at 3 per metric). A part's shape metrics are compared only when ≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON `flavours.<name>.targets`.

### DUB (14 songs, 13 artists; sources {'lmd': 14}; distinctness 0.68)


Tempo p10/p50/p90 107 / 142 / 159; minor share 0.29.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| keys_loop_1bar_rhythm | 0 | 0.3 | -0.30 |
| guitar_offbeat16_share | 0.35 | 0.05 | +0.30 |
| pad_presence | 0.36 | 0.66 | -0.30 |
| lead_presence | 0.5 | 0.79 | -0.29 |
| tempo_p50 | 142 | 124 | +18.00 |
| pad_len16 | 4 | 7.53 | -3.53 |
| guitar_gate | 0.94 | 0.68 | +0.26 |
| seq_presence | 0 | 0.26 | -0.26 |
| pad_loop_1bar_rhythm | 0.33 | 0.08 | +0.25 |
| drum_kick_4otf | 0.44 | 0.2 | +0.24 |
| pad_register_med | 55 | 64 | -9.00 |
| drum_flat_share | 0.33 | 0.13 | +0.20 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VI III v | 0.67 | 0.14 |
| I iv VII v | 0.33 | 0.17 |
| i VII | 0.33 | 0.09 |
| i v I VII | 0.33 | 0.02 |
| i v I iv | 0.33 | 0.03 |
| i VI bII | 0.33 | 0.07 |
| i VI i v | 0.33 | 0.03 |
| i VI i iv | 0.33 | 0.03 |
| i VI bII v | 0.33 | 0.03 |
| i iv III VI | 0.33 | 0.02 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.44 | 0.32 |
| I IV I bVII | 0.22 | 0.03 |
| I IV V | 0.22 | 0.01 |
| IV bVII | 0.11 | 0.06 |
| I IV bVII IV | 0.11 | 0.01 |
| I bVII IV | 0.11 | 0.01 |
| I bVII IV bVII | 0.11 | 0.01 |
| I V IV V | 0.11 | 0.01 |
| I V vi V | 0.11 | 0.01 |
| I V | 0.11 | 0.02 |

Chord-sheet cross-check (Chordonomicon, 6350 songs, minor share 0.37; share of songs containing the loop ≥ 2×): I IV (maj) 0.13, I IV V (maj) 0.09, I V vi IV (maj) 0.09, I V IV (maj) 0.08, I IV I V (maj) 0.07, I IV V IV (maj) 0.07, I V IV V (maj) 0.07, I V I IV (maj) 0.06. By era: 80s (483 songs, minor 0.3): I IV (maj) 0.23, I IV V (maj) 0.15, I IV I V (maj) 0.14, I ii (maj) 0.1; new (4755 songs, minor 0.4): I IV (maj) 0.11, I V vi IV (maj) 0.09, I IV V (maj) 0.08, I V IV (maj) 0.08

**bass** (11 songs, in 0.79 of songs)
- onsets/bar 6 (5–7.5); steps with P ≥ .5: 1,3,5,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.4 (0.2–1.1), off-16th onset share 0.04 (0–0.23)
- length 1.84 (1.23–2.22) 16ths, gate (length ÷ gap to next onset) 0.82 (0.66–0.95)
- velocity mean 97 ± 9.5 (flat files 0.55); accents step 8 +4, step 14 +4, step 2 +3; weakest step 6 -2, step 15 -2
- register (MIDI, transposed to C) 36 (34–38)
- degrees (maj): 1 0.35, 5 0.2, 4 0.15, 3 0.1, 6 0.07, 2 0.05
- intervals: repeat 0.54 (0.44–0.77), step 1–2 0.13 (0.03–0.15), skip 3–4 0.06 (0.02–0.08), leap 5–7 0.09 (0.07–0.12), octave 0 (0–0.04), descending share of moves 0.5 (0.47–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.07, 4-bar 0.06, longer 0.81; rhythm only: 1-bar 0.32, 2-bar 0, 4-bar 0.06, longer 0.63

**chord** (2 songs, in 0.14 of songs)
- onsets/bar 5 (4–6); steps with P ≥ .5: 1,9; P ≥ .3: 1,5,9,11,13,15
- syncopation: LHL/bar 1.8 (1.2–2.4), off-16th onset share 0.2 (0.1–0.3)
- length 2.04 (1.37–2.71) 16ths, gate (length ÷ gap to next onset) 0.59 (0.47–0.72)
- velocity mean 77 ± 9.7 (flat files 0.5); accents step 11 +9, step 15 +3, step 5 +2; weakest step 13 -8, step 1 -2
- register (MIDI, transposed to C) 65 (63–68)
- degrees (maj): 5 0.42, 1 0.28, 3 0.14, 6 0.06, 2 0.04, 4 0.02
- chords: voices 2.4 (2.2–2.7), spread 6 st, inversion share 0.99 (0.99–1), changes/bar 0.39 (0.3–0.48), qualities maj 0.5, pow 0.5
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**pad** (5 songs, in 0.36 of songs)
- onsets/bar 1 (1–5); steps with P ≥ .5: 1; P ≥ .3: 1,11
- syncopation: LHL/bar 0.7 (0–1.6), off-16th onset share 0 (0–0.18)
- length 4 (3–16) 16ths, gate (length ÷ gap to next onset) 0.99 (0.5–1)
- velocity mean 94 ± 17.2 (flat files 0.4); accents step 14 +20, step 12 +13, step 4 +11; weakest step 8 -9, step 7 -8
- register (MIDI, transposed to C) 55 (53–63)
- degrees (maj): 1 0.19, 5 0.18, 3 0.15, 6 0.14, 4 0.1, 7 0.09
- chords: voices 3.1 (3–3.3), spread 7 st, inversion share 0.59 (0.45–0.65), changes/bar 0.98 (0.93–1.88), qualities min 0.47, maj 0.37, pow 0.12, min7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.33, 2-bar 0, 4-bar 0, longer 0.67

**keys** (9 songs, in 0.64 of songs)
- onsets/bar 5 (4–6); steps with P ≥ .5: 1,7,9; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 1.3 (0.4–3.5), off-16th onset share 0.06 (0.02–0.2)
- length 2 (1.8–3.42) 16ths, gate (length ÷ gap to next onset) 0.93 (0.67–1)
- velocity mean 91 ± 10.8 (flat files 0.56); accents step 5 +1, step 7 +1, step 15 +1; weakest step 16 -16, step 10 -4
- register (MIDI, transposed to C) 60 (55–63)
- degrees (maj): 1 0.25, 5 0.21, 3 0.2, 6 0.12, 4 0.09, 2 0.06
- chords: voices 3 (3–3.1), spread 7 st, inversion share 0.42 (0.29–0.53), changes/bar 1.57 (0.91–2), qualities maj 0.58, min 0.31, pow 0.03, min7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.11, longer 0.89; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0.13, longer 0.87

**guitar** (12 songs, in 0.86 of songs)
- onsets/bar 6.5 (3.9–8.5); steps with P ≥ .5: 1,3,5,9,11,13,15; P ≥ .3: 1,2,3,4,5,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 2.1 (0.7–3.2), off-16th onset share 0.35 (0.15–0.48)
- length 1.58 (1.13–1.97) 16ths, gate (length ÷ gap to next onset) 0.94 (0.89–1)
- velocity mean 91 ± 7.3 (flat files 0.67); accents step 5 +4, step 1 +3, step 3 +3; weakest step 16 -10, step 15 -6
- register (MIDI, transposed to C) 62 (60–66)
- degrees (maj): 1 0.3, 3 0.17, 5 0.15, 6 0.11, 4 0.11, 2 0.07
- chords: voices 2.8 (2.4–3), spread 7 st, inversion share 0.33 (0.25–0.77), changes/bar 0.58 (0.49–1.9), qualities maj 0.56, pow 0.3, min 0.13, dim 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.2, 4-bar 0.1, longer 0.69; rhythm only: 1-bar 0.3, 2-bar 0, 4-bar 0.1, longer 0.6

**lead** (7 songs, in 0.5 of songs)
- onsets/bar 3 (2–4); steps with P ≥ .5: 1,9; P ≥ .3: 1,5,9
- syncopation: LHL/bar 1.6 (0.5–2.2), off-16th onset share 0.05 (0.01–0.19)
- length 3.5 (1.52–4.39) 16ths, gate (length ÷ gap to next onset) 0.92 (0.71–0.96)
- velocity mean 81 ± 8.9 (flat files 0.57); accents step 5 +2, step 15 +2, step 3 +1; weakest step 6 -8, step 8 -8
- register (MIDI, transposed to C) 69 (65–73)
- degrees (maj): 5 0.22, 1 0.2, 3 0.17, 2 0.13, 6 0.12, 4 0.11
- intervals: repeat 0.17 (0.09–0.28), step 1–2 0.5 (0.41–0.58), skip 3–4 0.15 (0.1–0.18), leap 5–7 0.16 (0.09–0.31), octave 0 (0–0), descending share of moves 0.5 (0.46–0.52)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**arp** (3 songs, in 0.21 of songs)
- onsets/bar 15 (11.2–15.2); steps with P ≥ .5: 1,2,3,4,5,6,7,8,9,10,11,12,14,15,16; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 1.1 (1.1–1.8), off-16th onset share 0.48 (0.41–0.51)
- length 0.98 (0.82–0.99) 16ths, gate (length ÷ gap to next onset) 0.98 (0.82–0.99)
- velocity mean – ± – (flat files 1); accents ; weakest 
- register (MIDI, transposed to C) 63 (60–67)
- degrees (maj): 1 0.2, 5 0.18, b3 0.15, 3 0.13, 7 0.1, 2 0.09
- intervals: repeat 0 (0–0.07), step 1–2 0.12 (0.07–0.43), skip 3–4 0.35 (0.24–0.59), leap 5–7 0.14 (0.11–0.24), octave 0.02 (0.01–0.04), descending share of moves 0.5 (0.48–0.51)
- arp shape up 0, down 0.01, updown 0.22, random 0.76, static 0; spacing (16ths) {'1.0': 3}; octave span 0.62 (0.6–0.81)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.33, 4-bar 0.11, longer 0.56; rhythm only: 1-bar 0.17, 2-bar 0.33, 4-bar 0.11, longer 0.39

**drums** (9 songs with a usable kit; flat-velocity files 0.33)
- families: kick_4otf 0.44, kick_1_and_9_only 0.44, snare_backbeat_5_13 0.44, snare_halftime_9 0.11, hat_16ths 0.11, hat_8ths 0.44, hat_offbeat_only 0.11, hat_none 0
- kick: hits/bar 4 (3.7–5.1), songs using 1, P ≥ .5 at steps 1,5,9,13, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 109 ± 13.1
- snare: hits/bar 1.9 (1.6–2.5), songs using 0.78, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 112 ± 25.3
- hat: hits/bar 7.3 (4.8–7.8), songs using 1, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,2,3,5,7,9,11,13,15; vel 85 ± 24.5
- perc: hits/bar 3.6 (0–7), songs using 0.56, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 78 ± 18.5
- tom: hits/bar 0 (0–0), songs using 0.11, P ≥ .5 at steps none, P ≥ .2 at none; vel 104 ± 17.9
- cymb: hits/bar 0.1 (0–0.3), songs using 0.11, P ≥ .5 at steps none, P ≥ .2 at none; vel – ± –
- open-hat share of hat hits 0.26, ride share of cymbals 0.2, fill-bar share 0.07

### DANCEHALL (44 songs, 37 artists; sources {'lmd': 44}; distinctness 0.43)


Tempo p10/p50/p90 90 / 118 / 155; minor share 0.43.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| keys_gate | 0.49 | 0.83 | -0.34 |
| lead_gate | 0.67 | 0.87 | -0.20 |
| guitar_offbeat16_share | 0.23 | 0.05 | +0.18 |
| guitar_presence | 0.64 | 0.8 | -0.16 |
| lead_offbeat16_share | 0.29 | 0.13 | +0.16 |
| pad_presence | 0.5 | 0.66 | -0.16 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i VII | 0.31 | 0.04 |
| i VII VI VII | 0.23 | 0.07 |
| i VII i VI | 0.23 | 0.01 |
| i VI VII | 0.23 | 0.01 |
| i iv | 0.15 | 0.06 |
| i iv i v | 0.15 | 0.01 |
| i VI v | 0.15 | 0.01 |
| i v | 0.15 | 0.03 |
| i v i VII | 0.15 | 0.01 |
| i VII VI | 0.15 | 0.04 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV | 0.22 | 0.07 |
| I IV I V | 0.17 | 0.03 |
| I V I IV | 0.17 | 0.05 |
| I V | 0.17 | 0.05 |
| I IV V | 0.17 | 0.02 |
| I vi | 0.13 | 0.02 |
| I V vi IV | 0.13 | 0.04 |
| I IV I vi | 0.13 | 0.01 |
| I IV V IV | 0.13 | 0.06 |
| I V vi V | 0.13 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 425 songs, minor share 0.39; share of songs containing the loop ≥ 2×): I V vi IV (maj) 0.15, I V IV (maj) 0.09, i VI VII (min) 0.06, I IV (maj) 0.06, I IV V (maj) 0.06, I V IV V (maj) 0.05, I IV V IV (maj) 0.05, I V I IV (maj) 0.05. By era: 80s (14 songs, minor 0.21): I V IV (maj) 0.36, I V IV V (maj) 0.21, I V IV vi (maj) 0.21, IV V IV vi (maj) 0.21; new (336 songs, minor 0.43): I V vi IV (maj) 0.15, i VI VII (min) 0.08, I V IV (maj) 0.06, i iv (min) 0.04

**bass** (41 songs, in 0.93 of songs)
- onsets/bar 6 (4–7); steps with P ≥ .5: 1,7,9; P ≥ .3: 1,4,5,7,9,11,13,15
- syncopation: LHL/bar 1.7 (0.2–3.3), off-16th onset share 0.24 (0.07–0.33)
- length 1.57 (1.04–2.25) 16ths, gate (length ÷ gap to next onset) 0.67 (0.5–0.9)
- velocity mean 101 ± 7.2 (flat files 0.37); accents step 8 +2, step 1 +2, step 7 +1; weakest step 16 -7, step 10 -4
- register (MIDI, transposed to C) 36 (34–38)
- degrees (maj): 1 0.29, 5 0.23, 4 0.14, 2 0.12, 6 0.1, 3 0.05
- intervals: repeat 0.47 (0.32–0.59), step 1–2 0.16 (0.08–0.3), skip 3–4 0.06 (0.02–0.12), leap 5–7 0.08 (0.03–0.2), octave 0 (0–0.07), descending share of moves 0.46 (0.42–0.51)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.01, 2-bar 0.11, 4-bar 0.16, longer 0.72; rhythm only: 1-bar 0.14, 2-bar 0.11, 4-bar 0.11, longer 0.64

**chord** (10 songs, in 0.23 of songs)
- onsets/bar 6 (4.5–7.4); steps with P ≥ .5: 3,5,7,11,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.8 (1.9–4.3), off-16th onset share 0.11 (0–0.37)
- length 0.79 (0.48–0.9) 16ths, gate (length ÷ gap to next onset) 0.35 (0.25–0.49)
- velocity mean 88 ± 10.9 (flat files 0.2); accents step 9 +2, step 1 +2, step 6 +1; weakest step 14 -5, step 2 -4
- register (MIDI, transposed to C) 64 (60–70)
- degrees (maj): 5 0.23, 1 0.2, 3 0.16, 6 0.12, 4 0.11, 2 0.1
- chords: voices 2.9 (2.3–3), spread 7 st, inversion share 0.58 (0.25–0.9), changes/bar 1.06 (0.4–1.73), qualities pow 0.47, maj 0.39, min 0.13, min7 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.2, 4-bar 0.2, longer 0.6; rhythm only: 1-bar 0.13, 2-bar 0.42, 4-bar 0.03, longer 0.42

**pad** (22 songs, in 0.5 of songs)
- onsets/bar 2 (1–3.9); steps with P ≥ .5: 1; P ≥ .3: 1,9
- syncopation: LHL/bar 0.9 (0.1–1.9), off-16th onset share 0.02 (0–0.25)
- length 7.94 (1.73–14.13) 16ths, gate (length ÷ gap to next onset) 0.98 (0.58–1)
- velocity mean 76 ± 9.1 (flat files 0.32); accents step 10 +7, step 5 +6, step 8 +5; weakest step 2 -10, step 16 -8
- register (MIDI, transposed to C) 64 (60–68)
- degrees (maj): 1 0.18, 5 0.17, 4 0.15, 6 0.13, 2 0.13, 3 0.11
- chords: voices 2.8 (2.5–3), spread 8 st, inversion share 0.63 (0.37–0.83), changes/bar 1.1 (0.91–1.38), qualities maj 0.45, pow 0.3, min 0.19, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.11, 4-bar 0.18, longer 0.71; rhythm only: 1-bar 0.2, 2-bar 0.13, 4-bar 0.07, longer 0.6

**keys** (30 songs, in 0.68 of songs)
- onsets/bar 6 (4–9.5); steps with P ≥ .5: 1,3,7,11,13,15; P ≥ .3: 1,3,4,5,7,9,11,12,13,15
- syncopation: LHL/bar 3 (0.4–5.2), off-16th onset share 0.26 (0.02–0.46)
- length 1 (0.51–2.17) 16ths, gate (length ÷ gap to next onset) 0.49 (0.27–0.88)
- velocity mean 78 ± 10.6 (flat files 0.23); accents step 1 +3, step 13 +3, step 7 +2; weakest step 16 -5, step 4 -3
- register (MIDI, transposed to C) 65 (60–67)
- degrees (maj): 1 0.22, 5 0.19, 3 0.14, 2 0.12, 4 0.11, 6 0.1
- chords: voices 3 (2.7–3.2), spread 8 st, inversion share 0.66 (0.45–0.79), changes/bar 1.49 (0.8–2.4), qualities maj 0.46, min 0.32, pow 0.1, min7 0.07
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.06, 2-bar 0.05, 4-bar 0.2, longer 0.69; rhythm only: 1-bar 0.35, 2-bar 0.09, 4-bar 0.07, longer 0.49

**guitar** (28 songs, in 0.64 of songs)
- onsets/bar 4.5 (3–7); steps with P ≥ .5: 1,5,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.2 (0.3–3.6), off-16th onset share 0.23 (0–0.44)
- length 0.99 (0.62–1.83) 16ths, gate (length ÷ gap to next onset) 0.59 (0.3–0.84)
- velocity mean 85 ± 10.7 (flat files 0.14); accents step 1 +2, step 15 +1, step 9 +1; weakest step 2 -5, step 16 -3
- register (MIDI, transposed to C) 60 (58–66)
- degrees (maj): 1 0.26, 5 0.19, 3 0.13, 2 0.12, 6 0.11, 4 0.1
- chords: voices 2.8 (2–3), spread 7 st, inversion share 0.61 (0.11–0.83), changes/bar 0.75 (0.2–1.71), qualities maj 0.41, pow 0.32, min 0.23, sus 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.16, 4-bar 0.12, longer 0.73; rhythm only: 1-bar 0.33, 2-bar 0.07, 4-bar 0.11, longer 0.5

**lead** (33 songs, in 0.75 of songs)
- onsets/bar 5 (4–6); steps with P ≥ .5: 1,7; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 3.5 (2.4–4.1), off-16th onset share 0.29 (0.1–0.47)
- length 1.61 (0.96–1.96) 16ths, gate (length ÷ gap to next onset) 0.67 (0.49–0.88)
- velocity mean 108 ± 8.3 (flat files 0.33); accents step 1 +2, step 9 +1, step 5 +1; weakest step 2 -2, step 16 -0
- register (MIDI, transposed to C) 69 (65–72)
- degrees (maj): 1 0.23, 5 0.19, 3 0.16, 2 0.12, 4 0.12, 6 0.11
- intervals: repeat 0.31 (0.13–0.63), step 1–2 0.36 (0.15–0.48), skip 3–4 0.09 (0.02–0.18), leap 5–7 0.06 (0.02–0.13), octave 0 (0–0.01), descending share of moves 0.55 (0.5–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.08, 2-bar 0.1, 4-bar 0.03, longer 0.78; rhythm only: 1-bar 0.17, 2-bar 0.12, 4-bar 0.02, longer 0.7

**arp** (3 songs, in 0.07 of songs)
- onsets/bar 7 (6.5–11); steps with P ≥ .5: 1,3,4,5,7,8,10,11,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,15
- syncopation: LHL/bar 3 (1.6–3), off-16th onset share 0.46 (0.36–0.47)
- length 0.67 (0.66–0.8) 16ths, gate (length ÷ gap to next onset) 0.65 (0.48–0.79)
- velocity mean 105 ± 11 (flat files 0.33); accents step 9 +11, step 15 +9, step 12 +7; weakest step 14 -12, step 8 -8
- register (MIDI, transposed to C) 76 (72–81)
- degrees (maj): 1 0.23, 5 0.21, 4 0.13, 2 0.13, 3 0.12, 7 0.11
- intervals: repeat 0.07 (0.04–0.1), step 1–2 0.23 (0.17–0.34), skip 3–4 0.34 (0.28–0.4), leap 5–7 0.32 (0.22–0.33), octave 0.02 (0.02–0.03), descending share of moves 0.56 (0.51–0.57)
- arp shape up 0.08, down 0, updown 0.13, random 0.79, static 0; spacing (16ths) {'1.0': 2, '2.0': 1}; octave span 0.67 (0.67–0.83)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0.5, 2-bar 0, 4-bar 0, longer 0.5

**seq** (16 songs, in 0.36 of songs)
- onsets/bar 6.5 (4.8–8); steps with P ≥ .5: 3,5,7,9,11,13,15; P ≥ .3: 1,3,5,7,9,11,12,13,14,15
- syncopation: LHL/bar 3 (1.6–4.2), off-16th onset share 0.27 (0.18–0.39)
- length 0.94 (0.49–1.87) 16ths, gate (length ÷ gap to next onset) 0.71 (0.49–0.94)
- velocity mean 95 ± 8.8 (flat files 0.25); accents step 5 +2, step 6 +1, step 15 +1; weakest step 16 -1, step 14 -1
- register (MIDI, transposed to C) 62 (60–64)
- degrees (maj): 1 0.27, 5 0.23, 2 0.19, 3 0.14, 4 0.07, 6 0.05
- intervals: repeat 0.41 (0.34–0.66), step 1–2 0.26 (0.05–0.41), skip 3–4 0.12 (0.03–0.19), leap 5–7 0.03 (0.02–0.09), octave 0 (0–0), descending share of moves 0.52 (0.49–0.53)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.12, 2-bar 0, 4-bar 0.09, longer 0.78; rhythm only: 1-bar 0.21, 2-bar 0.08, 4-bar 0.1, longer 0.6

**drums** (40 songs with a usable kit; flat-velocity files 0.12)
- families: kick_4otf 0.2, kick_1_and_9_only 0.38, snare_backbeat_5_13 0.53, snare_halftime_9 0.05, hat_16ths 0.12, hat_8ths 0.38, hat_offbeat_only 0.03, hat_none 0.12
- kick: hits/bar 3.4 (3–4), songs using 1, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13; vel 114 ± 3.4
- snare: hits/bar 2 (1.2–2.1), songs using 0.88, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 105 ± 2.2
- hat: hits/bar 7.6 (4.1–9.2), songs using 0.88, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,4,5,6,7,9,10,11,12,13,14,15; vel 80 ± 10.7
- perc: hits/bar 4.2 (0–10.2), songs using 0.65, P ≥ .5 at steps none, P ≥ .2 at 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16; vel 85 ± 11.6
- tom: hits/bar 0 (0–0), songs using 0.03, P ≥ .5 at steps none, P ≥ .2 at none; vel 33 ± 4
- cymb: hits/bar 0.1 (0–0.3), songs using 0.25, P ≥ .5 at steps none, P ≥ .2 at none; vel 81 ± 7.3
- open-hat share of hat hits 0.16, ride share of cymbals 0.18, fill-bar share 0.09

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| new | 19 | 89 / 122 / 154 | 0.47 | 6 (3.5–8) | 0.7 (0.56–0.9) | 0.2 (0.07–0.4) | 0.47 | 0.05 | 0.27 | 0.07 | i VI VII (0.5) |

### SKA (54 songs, 30 artists; sources {'lamd': 8, 'lmd': 46}; distinctness 0.35)


Tempo p10/p50/p90 98 / 133 / 156; minor share 0.17.

| distinctive metric | flavour | parent | delta |
|---|---|---|---|
| pad_presence | 0.37 | 0.66 | -0.29 |
| drum_snare_backbeat_5_13 | 0.66 | 0.4 | +0.26 |
| guitar_gate | 0.48 | 0.68 | -0.20 |
| drum_hat_8ths | 0.57 | 0.4 | +0.17 |
| keys_loop_1bar_rhythm | 0.14 | 0.3 | -0.16 |
| guitar_onsets_per_bar | 6 | 4 | +2.00 |

| min loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| i IV VII VI | 0.22 | 0.03 |
| III IV VII VI | 0.22 | 0.03 |
| i VII VI III | 0.22 | 0.03 |
| i iio ii III | 0.22 | 0.03 |
| i iv v V | 0.22 | 0.02 |
| i #VII+ iv v | 0.11 | 0.05 |
| #VII+ iv v V | 0.11 | 0.01 |
| i #VII+ v V | 0.11 | 0.01 |
| i #VII+ iv V | 0.11 | 0.01 |
| i iv III II | 0.11 | 0.01 |

| maj loop (measured MIDI) | songs | 4-gram share |
|---|---|---|
| I IV V | 0.22 | 0.07 |
| I IV | 0.18 | 0.04 |
| I V IV V | 0.18 | 0.01 |
| I V | 0.18 | 0.02 |
| I IV V IV | 0.13 | 0.03 |
| I vi IV V | 0.13 | 0.03 |
| I vi | 0.09 | 0.03 |
| I V ii V | 0.09 | 0.01 |
| I V vi IV | 0.09 | 0.01 |
| I IV vi V | 0.09 | 0.01 |

Chord-sheet cross-check (Chordonomicon, 7271 songs, minor share 0.24; share of songs containing the loop ≥ 2×): I IV (maj) 0.18, I V IV (maj) 0.18, I V IV V (maj) 0.17, I IV V (maj) 0.17, I V vi IV (maj) 0.15, I IV I V (maj) 0.14, I IV V IV (maj) 0.14, I V I IV (maj) 0.13. By era: 80s (824 songs, minor 0.22): I IV (maj) 0.18, I V IV (maj) 0.15, I V I IV (maj) 0.14, I IV I V (maj) 0.14; new (4706 songs, minor 0.27): I V IV (maj) 0.19, I V vi IV (maj) 0.18, I V IV V (maj) 0.18, I IV (maj) 0.18

**bass** (51 songs, in 0.94 of songs)
- onsets/bar 6 (4–8); steps with P ≥ .5: 1,5,7,9,13,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.3 (0–1.4), off-16th onset share 0 (0–0.18)
- length 1.97 (1.57–2.56) 16ths, gate (length ÷ gap to next onset) 0.82 (0.75–0.98)
- velocity mean 97 ± 6.7 (flat files 0.33); accents step 1 +2, step 6 +1, step 9 +1; weakest step 2 -4, step 14 -4
- register (MIDI, transposed to C) 36 (35–41)
- degrees (maj): 1 0.28, 5 0.19, 4 0.14, 6 0.11, 2 0.1, 3 0.08
- intervals: repeat 0.36 (0.17–0.54), step 1–2 0.2 (0.11–0.26), skip 3–4 0.08 (0.03–0.18), leap 5–7 0.16 (0.08–0.31), octave 0 (0–0.03), descending share of moves 0.49 (0.43–0.55)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.03, 2-bar 0.05, 4-bar 0.05, longer 0.86; rhythm only: 1-bar 0.24, 2-bar 0.02, 4-bar 0.06, longer 0.68

**chord** (20 songs, in 0.37 of songs)
- onsets/bar 4.2 (3–5); steps with P ≥ .5: 1,7,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2 (1.1–3.3), off-16th onset share 0.03 (0–0.19)
- length 2 (1.45–3.13) 16ths, gate (length ÷ gap to next onset) 0.94 (0.5–1)
- velocity mean 92 ± 8.9 (flat files 0.3); accents step 16 +15, step 14 +10, step 10 +7; weakest step 6 -8, step 12 -7
- register (MIDI, transposed to C) 68 (64–72)
- degrees (maj): 1 0.19, 5 0.17, 3 0.13, 4 0.12, 2 0.1, 6 0.09
- chords: voices 2 (2–2.7), spread 8 st, inversion share 0.77 (0.59–0.99), changes/bar 1.79 (1.1–2.67), qualities pow 0.5, maj 0.44, min 0.03, dim 0.01
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.1, longer 0.91; rhythm only: 1-bar 0.2, 2-bar 0.04, 4-bar 0.01, longer 0.74

**pad** (20 songs, in 0.37 of songs)
- onsets/bar 2 (1–4); steps with P ≥ .5: 1; P ≥ .3: 1,5,9,13
- syncopation: LHL/bar 0.1 (0–1.5), off-16th onset share 0 (0–0.07)
- length 7.96 (2.2–15.18) 16ths, gate (length ÷ gap to next onset) 0.99 (0.86–1)
- velocity mean 81 ± 8.4 (flat files 0.25); accents step 11 +7, step 7 +3, step 12 +3; weakest step 4 -19, step 2 -9
- register (MIDI, transposed to C) 63 (59–67)
- degrees (maj): 1 0.2, 5 0.14, 3 0.13, 4 0.12, 6 0.12, 2 0.12
- chords: voices 2.6 (2–3), spread 8 st, inversion share 0.6 (0.39–0.85), changes/bar 0.99 (0.79–1.89), qualities maj 0.45, pow 0.3, min 0.18, min7 0.03
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0.12, 4-bar 0.1, longer 0.79; rhythm only: 1-bar 0.07, 2-bar 0.12, 4-bar 0.15, longer 0.67

**keys** (34 songs, in 0.63 of songs)
- onsets/bar 4.5 (3–6.8); steps with P ≥ .5: 1,7; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 0.7 (0.1–2.5), off-16th onset share 0.07 (0–0.18)
- length 1.98 (1.18–3.94) 16ths, gate (length ÷ gap to next onset) 0.85 (0.6–0.99)
- velocity mean 87 ± 10.2 (flat files 0.18); accents step 16 +4, step 2 +3, step 10 +2; weakest step 8 -2, step 4 -1
- register (MIDI, transposed to C) 64 (60–69)
- degrees (maj): 1 0.21, 5 0.16, 6 0.14, 3 0.14, 4 0.12, 2 0.11
- chords: voices 2.9 (2.2–3.2), spread 8 st, inversion share 0.5 (0.38–0.74), changes/bar 1.48 (1.05–2.69), qualities maj 0.55, pow 0.19, min 0.16, maj7 0.05
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.05, 4-bar 0.06, longer 0.85; rhythm only: 1-bar 0.14, 2-bar 0.01, 4-bar 0.09, longer 0.75

**guitar** (47 songs, in 0.87 of songs)
- onsets/bar 6 (4–7.8); steps with P ≥ .5: 1,3,7,11,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 3.2 (0.7–6), off-16th onset share 0.02 (0–0.22)
- length 1 (0.78–1.95) 16ths, gate (length ÷ gap to next onset) 0.48 (0.23–0.96)
- velocity mean 82 ± 10.8 (flat files 0.3); accents step 1 +0, step 13 +0, step 3 +0; weakest step 2 -13, step 10 -4
- register (MIDI, transposed to C) 60 (58–65)
- degrees (maj): 1 0.23, 5 0.2, 6 0.13, 3 0.13, 4 0.12, 2 0.09
- chords: voices 3 (2.9–3.1), spread 8 st, inversion share 0.49 (0.17–0.7), changes/bar 1.12 (0.66–1.83), qualities maj 0.5, pow 0.28, min 0.18, maj7 0.02
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0.04, 2-bar 0.06, 4-bar 0.08, longer 0.83; rhythm only: 1-bar 0.37, 2-bar 0.03, 4-bar 0.02, longer 0.58

**lead** (48 songs, in 0.89 of songs)
- onsets/bar 4 (3–5); steps with P ≥ .5: 1,9,15; P ≥ .3: 1,3,5,7,9,11,13,15
- syncopation: LHL/bar 2.5 (1.4–3), off-16th onset share 0.11 (0–0.24)
- length 2 (1.41–2.9) 16ths, gate (length ÷ gap to next onset) 0.88 (0.75–0.99)
- velocity mean 105 ± 7.8 (flat files 0.38); accents step 10 +3, step 9 +2, step 14 +1; weakest step 3 -1, step 13 -1
- register (MIDI, transposed to C) 72 (67–73)
- degrees (maj): 1 0.19, 5 0.17, 3 0.15, 2 0.13, 4 0.11, 6 0.1
- intervals: repeat 0.27 (0.16–0.47), step 1–2 0.42 (0.32–0.53), skip 3–4 0.12 (0.09–0.23), leap 5–7 0.07 (0.02–0.1), octave 0 (0–0), descending share of moves 0.54 (0.5–0.57)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.04, longer 0.96; rhythm only: 1-bar 0, 2-bar 0.01, 4-bar 0.04, longer 0.95

**arp** (3 songs, in 0.06 of songs)
- onsets/bar 10 (8.5–11); steps with P ≥ .5: 1,2,3,4,5,6,7,8,9,10,11,12,13,15; P ≥ .3: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16
- syncopation: LHL/bar 2 (1.7–4.4), off-16th onset share 0.5 (0.32–0.57)
- length 1 (0.89–1) 16ths, gate (length ÷ gap to next onset) 0.52 (0.51–0.76)
- velocity mean 88 ± 7.5 (flat files 0.33); accents step 16 +8, step 4 +6, step 2 +5; weakest step 7 -7, step 15 -5
- register (MIDI, transposed to C) 72 (62–76)
- degrees (maj): 1 0.15, 5 0.15, 3 0.12, 4 0.12, 2 0.1, 7 0.08
- intervals: repeat 0.11 (0.1–0.14), step 1–2 0.16 (0.13–0.47), skip 3–4 0.07 (0.04–0.33), leap 5–7 0.08 (0.06–0.35), octave 0 (0–0), descending share of moves 0.49 (0.49–0.52)
- arp shape up 0.15, down 0.14, updown 0.3, random 0.4, static 0.01; spacing (16ths) {'1.0': 2, '2.0': 1}; octave span 0.67 (0.67–1.04)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0, longer 1; rhythm only: 1-bar 0, 2-bar 0, 4-bar 0, longer 1

**seq** (14 songs, in 0.26 of songs)
- onsets/bar 7 (4.9–7.4); steps with P ≥ .5: 1,3,7,11,15; P ≥ .3: 1,3,4,5,7,9,11,13,15
- syncopation: LHL/bar 2.7 (1.8–6), off-16th onset share 0.13 (0.01–0.41)
- length 1.23 (0.98–1.59) 16ths, gate (length ÷ gap to next onset) 0.66 (0.5–0.77)
- velocity mean 97 ± 9.9 (flat files 0.21); accents step 8 +3, step 7 +2, step 4 +2; weakest step 16 -4, step 10 -3
- register (MIDI, transposed to C) 66 (61–71)
- degrees (maj): 1 0.23, 5 0.22, 3 0.12, 6 0.11, 4 0.1, 2 0.08
- intervals: repeat 0.43 (0.28–0.5), step 1–2 0.34 (0.23–0.49), skip 3–4 0.13 (0.05–0.16), leap 5–7 0.05 (0.04–0.06), octave 0 (0–0.01), descending share of moves 0.51 (0.5–0.58)
- repetition in 8-bar windows (pitch+rhythm): 1-bar 0, 2-bar 0, 4-bar 0.03, longer 0.97; rhythm only: 1-bar 0.16, 2-bar 0, 4-bar 0.03, longer 0.81

**drums** (53 songs with a usable kit; flat-velocity files 0.24)
- families: kick_4otf 0.23, kick_1_and_9_only 0.51, snare_backbeat_5_13 0.66, snare_halftime_9 0.04, hat_16ths 0.07, hat_8ths 0.57, hat_offbeat_only 0.04, hat_none 0.04
- kick: hits/bar 3.3 (2.3–4), songs using 0.96, P ≥ .5 at steps 1,9, P ≥ .2 at 1,5,7,9,13,15; vel 109 ± 2.6
- snare: hits/bar 2 (1.8–2.3), songs using 0.94, P ≥ .5 at steps 5,13, P ≥ .2 at 5,13; vel 100 ± 3.6
- hat: hits/bar 7.6 (6–8), songs using 0.94, P ≥ .5 at steps 1,3,5,7,9,11,13,15, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 82 ± 11.2
- perc: hits/bar 1.1 (0–7.2), songs using 0.55, P ≥ .5 at steps none, P ≥ .2 at 1,3,5,7,9,11,13,15; vel 87 ± 12.4
- tom: hits/bar 0 (0–0), songs using 0.06, P ≥ .5 at steps none, P ≥ .2 at none; vel 96 ± 5.3
- cymb: hits/bar 0.2 (0.1–0.6), songs using 0.45, P ≥ .5 at steps none, P ≥ .2 at 1; vel 83 ± 6.5
- open-hat share of hat hits 0.21, ride share of cymbals 0.25, fill-bar share 0.04

| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80s | 19 | 106 / 140 / 152 | 0.26 | 6 (4–8) | 0.96 (0.81–1) | 0.36 (0.24–0.52) | 0.26 | 0.05 | 0.28 | 0.11 | i IV VII VI (0.4) |
| new | 15 | 96 / 126 / 148 | 0.07 | 6 (4.2–8) | 0.76 (0.54–0.82) | 0.43 (0.33–0.5) | 0.6 | 0.13 | 0.38 | 0.12 | – (–) |

