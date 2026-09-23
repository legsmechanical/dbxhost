# Melodic verification statistics

Measured over **a batch of generated phrases per (genre, category)** — recommend ≥ 200 phrases — unless
marked *per phrase*. Grid/degree conventions: `melodic/basics.md`. Drum/bass-only checks for HOUSE, FUNK,
DNB bass are in `../verify.md` and are not repeated.

**Basis:** **M** = target derived from a measured corpus (D4 ComMU role shape, D5 Chordonomicon chord
vocabulary, D6 Billboard harmonic rhythm, or a published corpus: [S204][S211] rock, [S267] melody
intervals); **G** = from guides/pedagogy (rules, not distributions); **P** = our proposal. Most dance-genre
targets are **G/P** — no open note-level corpus exists for them.

## Shared definitions

- **chords/2 bars** = distinct chord roots+qualities in the phrase (a chord = ≥ 2 simultaneous onsets, or
  the root implied by the phrase's harmony tag for monophonic lines).
- **change position** = step of each chord change (1 = bar line).
- **width** = top − bottom MIDI note of a simultaneous onset.
- **top-voice move** = |semitone change| of the highest voice between consecutive chords.
- **CT-beat** = share of lead/arp onsets on steps 1/5/9/13 whose pitch class is in the phrase's current
  chord (the chord tag stored with the phrase).
- **step / leap share** = share of consecutive lead intervals of 1–2 st / ≥ 5 st.
- **2-bar range** = max − min MIDI of a monophonic line.
- **gate ratio** = note length ÷ gap to the next onset of that voice.
- **scale fit** = share of notes whose `acc` = 0 in the declared storage mode (after applying the genre's
  declared modal alterations, e.g. Dorian 6).
- **velocity CV** = stdev/mean of velocities in a phrase.

## Cross-genre (every melodic phrase, *per phrase*)

| # | statistic | target | basis |
|---|---|---|---|
| X-1 | notes inside the category's register (genre file) | ≥ 95 % | P |
| X-2 | monophonic categories (bass, lead, arp) have no overlaps except tagged glides (overlap ≤ 12 ticks) | 100 % | P |
| X-3 | a "2-bar" phrase's bar 2 shares ≥ 50 % of bar 1's onsets (repetition with variation) | ≥ 90 % of phrases | M (D4: loops; [S213] riff = repeated) / G |
| X-4 | parallel-chord phrases keep an identical interval shape across chords | 100 % | G [S150][S168] |
| X-5 | a phrase tagged non-idiomatic ("no idiomatic X" in the genre file) is not generated for that genre | 0 phrases | G |

## Generic archetypes (BASICS)

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| B-C1 | chord | chord changes land on step 1 or 9 | ≥ 90 % of changes (D6: beats 1+3 = 93 %) | M (D6) |
| B-C2 | chord | chords/2 bars | 1–2 in ≥ 70 % of phrases (D6: 1 = 32 %, 2 = 41 %) | M (D6) |
| B-C3 | chord | top-voice move per change | median ≤ 2 st | G [S262], M (D4 pad: 63 % ≤ 2 st) |
| B-A1 | arp | onset grid | exactly the named rate (every 16th / every 8th) | P (definition) |
| B-A2 | arp | order | matches the named mode's cycle (U&D exclusive = no repeated endpoint; inclusive = repeated) | G [S250][S255] |
| B-A3 | arp | span | = octave-range setting ×12 (+ chord span) | G [S250][S254] |
| B-L1 | lead | step share / leap share | ≥ 0.45 / ≤ 0.25 (D4 main_melody .48 / .23) | M (D4) |
| B-L2 | lead | CT-beat | ≥ 0.75 (D4 .83) | M (D4) |
| B-L3 | lead | 2-bar range | 4–12 st (D4 p10–p90) | M (D4) |
| B-L4 | lead | after a leap ≥ 5 st, next interval reverses direction | ≥ 55 % | G [S269][S267] |
| B-P1 | pad | onsets only on steps 1/9 (restrike on change) | ≥ 95 % (D4 pad: 1 = .89, 9 = .22, others ≤ .04) | M (D4) |
| B-P2 | pad | width | median 12–20 st (D4 16) | M (D4) |
| B-P3 | pad | notes ≥ 8 steps long | ≥ 85 % (D4 88 %) | M (D4) |

## ROCK

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| R-1 | bass | onsets on every 8th in pedal families | ≥ 7 of 8 per bar | G [S202][S205] |
| R-2 | bass | pitch set | ≥ 85 % R/5/8 (+ passing on the last beat) | G [S205][S207] |
| R-3 | chord | chord-root distribution over the batch | I .25–.40, IV .15–.30, V .10–.22, bVII .04–.12 | M [S204] (.328/.226/.163/.081) |
| R-4 | chord | root position | ≥ 90 % of chords | M [S204] 94.1 % |
| R-5 | chord | major ÷ minor chords | ≥ 2.5 (corpus 75.8/23.4) | M [S204], D5 |
| R-6 | chord | power-chord share in "distorted" families | 100 %; elsewhere triads | G [S208] |
| R-7 | lead | degree ranking | R most frequent, 5 second; b7 > 7 | M [S211] |
| R-8 | lead | ≥ 80 % of notes in the pentatonic union {1 2 b3 3 4 5 6 b7} | M [S211] |
| R-9 | pad | chord changes on step 1 or 9 only | 100 % | M (D6) |

## PUNK

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| P-1 | bass | onsets on all 8 eighths, root only | ≥ 90 % of bars | G [S217][S236] |
| P-2 | bass/chord | 16th off-beat onsets | ≤ 5 % of onsets (no syncopation) | G [S217] |
| P-3 | chord | chord vocabulary | power or major/minor triads only; 0 % 7th/9th chords | M (D5 m7 ≈ 0) + G [S217][S219] |
| P-4 | chord | velocity CV within a bar | ≤ 0.10 (flat downstrokes) except PC5 accent family | G [S215], P |
| P-5 | lead | scale fit (major) / CT-beat | ≥ 0.98 / ≥ 0.65 | G [S216] (100 % diatonic, 69 % chord tones) |
| P-6 | arp/pad | phrases generated | 0 | G [S217] |

## FUNK

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| F-M1 | chord | chord quality | ≥ 80 % contain a b7 (m7/9/dom7/13) | G [S12][S130], M (D5 m7+dom7 = 22 % vs rock 5 %) |
| F-M2 | chord | chords/2 bars | 1–2 | G [S12][S130][S131] |
| F-M3 | chord | onsets on 16th off-beats (even steps) | ≥ 35 % of chord onsets | G [S132][S12] |
| F-M4 | chord | chord gate | median ≤ 12 ticks | G [S12][S129], P |
| F-M5 | chord | onsets on steps 5/13 | ≤ 10 % of chord onsets | P |
| F-M6 | lead | ≥ 85 % of notes in minor pentatonic + {3, b5, 6} | G [S133][S12] |
| F-M7 | lead | long-short pairs: consecutive notes with length ratio ≥ 2 | ≥ 1 per bar in horn families | G [S134] |

## DISCO

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| DI-1 | bass | octave share of consecutive intervals | ≥ 40 % in octave families | G [S13][S137] |
| DI-2 | bass | DB2 family: onsets = beats + both 16ths after each 8th off-beat | exact | G [S137] |
| DI-3 | chord | 7th chords | ≥ 60 % (D5 m7+maj7+dom7 = 25 % of sheet chords; guides say 7ths) | G [S13][S139], M (D5) |
| DI-4 | chord | width ≤ 12 st and top-voice move ≤ 2 st | ≥ 90 % | G [S139] |
| DI-5 | chord | onsets adjacent to an 8th off-beat (steps 3,4,7,8,11,12,15,16) | ≥ 70 % | G [S140][S135] |
| DI-6 | arp | constant 16ths or 8ths+echo, flat vel (CV ≤ 0.1) | 100 % | G [S138][S142] |
| DI-7 | pad | chords/2 bars | 1–2 | G [S144] |

## HOUSE (melodic)

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| HO-1 | chord | stab onsets on steps 1/5/9/13 | ≤ 15 % | G [S140][S148][S149] |
| HO-2 | chord | a stab on step 16 (push) | ≥ 40 % of Chandler/deep phrases | G [S147][S148] |
| HO-3 | chord | deep family: every chord contains its 7th | 100 % | G [S145] |
| HO-4 | chord | deep family width | 7–12 st | G [S145][S147] |
| HO-5 | chord | chords/2 bars | 1–2 (deep) / 2–4 (main-room) | G [S147], M (D5 4-chord sections 44 %) |
| HO-6 | lead | acid family: ≤ 3 distinct pitch classes; octave jumps 5–25 % of intervals | G [S154][S29] |
| HO-7 | lead | acid accents (vel ≥ 110) on off-8ths | ≥ 60 % of accents | G [S154] |

## TECHNO

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| T-1 | bass | rolling family: onsets on steps 1/5/9/13 | 0 | G [S165] |
| T-2 | bass | root share | 0.6–0.8 (off-beat family) | G [S167] 70 % |
| T-3 | chord | minor chord share | ≥ 85 % | G [S173][S170], M (D5 IV-major 12 %) |
| T-4 | chord | stab length | ≤ 1 step in stab families | G [S168] |
| T-5 | chord/pad | chords/2 bars | 1 (melodic) / ≤ 2 (peak) | G [S164] |
| T-6 | lead | notes per 2 bars | 2–4 | G [S164] |
| T-7 | arp | 303 family: 1-octave range + ±12 jumps; ≤ 4 pitch classes | G [S171][S172] |

## ELECTRO

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| E-1 | bass | distinct pitches per bar | 2–5 | G [S178] |
| E-2 | bass | bars with onsets on all of 1/5/9/13 | 0 % | G [S177][S178] |
| E-3 | bass | rests: ≥ 4 empty steps per bar | ≥ 90 % of bars | G [S178] |
| E-4 | arp | gate ratio | ≤ 0.4 (pluck) | G [S185], P |
| E-5 | chord | chord events per 2 bars | ≤ 4 | G [S185], P |

## TRANCE

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| TR-1 | bass | rolling: onsets = the 12 non-kick 16ths, none on 1/5/9/13 | exact | G [S188][S190] |
| TR-2 | bass | velocity on "&" steps (3/7/11/15) − others | −8 … −12 | G [S188] |
| TR-3 | chord/pad | chords/2 bars | 1 in ≥ 80 % | G [S192] |
| TR-4 | chord | chord voicing inside MIDI 57–72; add9/sus2 present | ≥ 90 % / ≥ 50 % | G [S192] |
| TR-5 | arp | 16th rate, 2-octave span, gate 30–80 % | ≥ 90 % | G [S195] |
| TR-6 | lead | distinct pitches per 2 bars | 3–6 | G [S196][S198] |
| TR-7 | lead | one note ≥ 1.5× the median length (peak) | ≥ 80 % of anthem phrases | G [S197] |
| TR-8 | all | major V chord (min deg6 acc+1 as a chord tone) | ≤ 20 % of phrases | M (D5 20 %) |

## DNB (melodic)

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| N-1 | chord | chords/bar | ≤ 1 (change only on step 1) | G [S102] |
| N-2 | chord | extended chords (7/9) | ≥ 80 % | G [S102] |
| N-3 | chord | width | 7–14 st (block) | G snippet [S244], P |
| N-4 | lead | onsets per 2 bars | 3–6 | P |
| N-5 | arp | phrases generated as "dnb" | 0 (use basics) | G (none sourced) |

## BREAKS

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| K-1 | bass | bars with onsets on all of 1/5/9/13 | 0 % | P |
| K-2 | bass | acid family: accents + ≥ 1 slide pair per bar | ≥ 90 % | G [S107][S29] |
| K-3 | chord | parallel stabs keep one shape | 100 % | G [S111] |
| K-4 | chord | stab gate | 6–18 ticks | G [S111] "short release", P |

## HIPHOP

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| HH-1 | bass | 808 family: onsets coincide with the paired kick phrase | ≥ 85 % | G [S123] |
| HH-2 | bass | 808 root share | ≥ 60 %; non-roots in the last 4 steps of the phrase ≥ 50 % of non-roots | G [S123][S116] |
| HH-3 | bass | 808 register | MIDI 23–39 | G snippet [S247] |
| HH-4 | chord | lo-fi: chords/bar ≤ 1; every chord has 7th or 9th | ≥ 95 % / ≥ 90 % | G [S119][S120] |
| HH-5 | all | boom-bap/lo-fi swing: even-16th delay 2–8 ticks (54–66 %) | ≥ 90 % | G [S114][S5] |
| HH-6 | lead | trap: scale fit in natural/harmonic minor or Phrygian | ≥ 95 % | G [S124] |
| HH-7 | lead | bar 2 ≠ bar 1 but shares ≥ 50 % onsets (A/B) | ≥ 80 % | G [S124][S125] |

## SYNTHPOP (80s)

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| SP-1 | bass | velocity CV | ≤ 0.05 (flat) | G [S228] |
| SP-2 | bass | constant grid (all 16ths or all 8ths) with ≤ 1 gap | ≥ 90 % | G [S228][S226][S229] |
| SP-3 | bass | octave-family: octave share of intervals | ≥ 40 % | G [S226][S227] |
| SP-4 | lead | scale fit / CT-beat | ≥ 0.95 / ≥ 0.75 | G [S222][S224] (100 % diatonic; 81–85 % CT) |
| SP-5 | lead | 2-bar range | ≤ 12 st | G [S222], P |
| SP-6 | chord | minor-key phrases using bVI or bVII or minor v | ≥ 60 % | M (D5: bVI/bVII 71 %) + G [S222][S223][S224] |

## NEW WAVE

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| NW-1 | chord | major-key phrases containing bVII, bIII or bVI | ≥ 40 % | M (D5: bVII 51 %, bIII 25 %) |
| NW-2 | chord | stab gate | ≤ 16 ticks in "choppy" families | G [S221], P |
| NW-3 | chord | stop-start: ≥ 1 empty half-bar in 2 bars | ≥ 30 % of choppy phrases | G [S221], P |
| NW-4 | bass | 8th-grid onsets | ≥ 90 % of onsets on odd steps | G [S336][S335], P |
| NW-5 | arp | random-order family is identical on every playback (seeded) | 100 % | G [S342] |

## POST-PUNK / GOTH

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| PP-1 | bass | melodic family: median MIDI | 47–60 (high on the neck) | G [S313][S314][S315] |
| PP-2 | bass | melodic family: root share | ≤ 0.45 (not root-following) | G [S314][S318] |
| PP-3 | bass | melodic family: 8th grid | ≥ 85 % of onsets on odd steps | G [S318] |
| PP-4 | chord | chord onsets per bar | ≤ 4 | G [S316] "gaps" |
| PP-5 | chord/pad | a common tone held in the top voice across the change | ≥ 70 % | G [S322], P |
| PP-6 | chord/pad | chord vocabulary | triads/sus/add9; 0 % maj7/m7/9-13 jazz colour | G [S312], M (D5 m7 2 %) |
| PP-7 | lead | descending-interval share | ≥ 55 %; no chromatic (acc ≠ 0) notes | G [S326][S324] |

## ITALO DISCO

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| IT-1 | bass | constant 16th (or 8th+16th gallop) grid | ≥ 90 % | G [S360][S353][S136] |
| IT-2 | bass | octave share of consecutive intervals | 25–60 % | G [S360][S136] |
| IT-3 | bass | pitch classes per bar | 1–2 (root ± octave), except transition bars | G [S360][S353] |
| IT-4 | bass | gate ratio | ≤ 0.45 | G [S360] "fast decay" |
| IT-5 | chord | chord velocity | 60–85 | G [S352] (70) |
| IT-6 | all | minor-key phrases using bVII | ≥ 50 % | M (D5 86 %) |

## EBM

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| EB-1 | bass | onsets per bar | ≥ 12 of 16 | G [S364][S365] |
| EB-2 | bass | velocity CV | 0.08–0.25 (varied but patterned, not flat, not random) | G [S365][S354], P |
| EB-3 | bass | distinct pitch classes per bar | 2–4 | G [S362], P |
| EB-4 | bass | gate ratio | ≤ 0.5 | G [S364] |
| EB-5 | chord/pad/arp/lead | phrases generated | 0 by default | G [S362][S363] |

## SYNTHWAVE

| # | cat | statistic | target | basis |
|---|---|---|---|---|
| SW-1 | chord/pad | 2-bar harmony drawn from i/bVI/bIII/bVII | ≥ 80 % | G [S366][S367], M (D5 bVI 80 %, bVII 83 %) |
| SW-2 | chord/pad | major V chord | ≤ 10 % | M (D5 29 % of songs) , P |
| SW-3 | pad | notes ≥ 8 steps; width 14–24 st | ≥ 90 % | G [S366], P |
| SW-4 | arp | 16th or 8th constant grid, ≥ 1.5-octave span | ≥ 90 % | G [S366][S351] |
| SW-5 | bass | notes in MIDI 35–55 | ≥ 90 % | G [S366] |

## Cross-genre discrimination (recommended)

As in `../verify.md`: run every genre's batch through every genre's table; the diagonal must pass and each
off-diagonal must fail ≥ 2 key checks. Pairs most at risk of collapsing into one generic pattern — test them
explicitly: **ITALO ↔ SYNTHWAVE ↔ SYNTHPOP** octave bass (separate them on tempo, IT-3 pitch count, SW-5
register, SP-1 flat velocity vs EB-2 patterned velocity); **POST-PUNK ↔ NEW WAVE** (PP-1/PP-2 high non-root
bass vs NW-4 8th pedal; PP-6 vs NW-1 modal mixture); **TECHNO ↔ TRANCE** (T-5 1 chord vs TR-4 add9 voicing;
T-1 vs TR-1 bass grids); **DISCO ↔ FUNK** (DI-5 off-beat-adjacent vs F-M3 16th off-beats; DI-1 octaves).
