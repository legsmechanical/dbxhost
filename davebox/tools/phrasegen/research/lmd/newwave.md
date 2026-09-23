# NEW WAVE — measured (LMD)

**178 songs measured, 123 artists** (Police, Cars, Devo, Blondie, Talking Heads, Simple Minds, Tears
for Fears, Culture Club, OMD, New Order, B-52's, Thomas Dolby…). "New wave" here = tagged new wave and
*not* tagged post-punk / synth-pop / Italo / EBM (those win by precedence). Method, licences and caveats:
`README.md`. Guide files compared: `../drums/newwave.md`, `../melodic/newwave.md`.

## What the data says

- **Tempo:** median 123 BPM in the file (IQR 109–137); folded median 128. Straight: hat swing median
  0 ticks, 3 % of songs ≥ 4 ticks; 14 of 229 files were triplet/shuffle-grid and skipped.
- **Kick:** step 1 .94, step 9 .85; the rest is **8th-note only** (every even step ≤ .05; median song
  has 0 % even-16th kicks). 4-on-the-floor in 22 % of songs, "1 + 9, no 5/13" rock kick in 53 %.
  Beats 2/4 (steps 5/13) at .32/.33 sit between rock (.13) and disco (.37).
- **Snare:** backbeat 5/13 at .71/.72, vel 107; ghosts essentially absent (median ghost share 0,
  2 % of songs > 10 %). Half-time (snare on 9 only) in 3 % of songs. Clap = 10 % of snare-lane notes.
- **Hat:** straight 8ths at .71–.76 on every odd step, .10–.17 on even steps; 16th-hat songs 9 %,
  8th-hat songs 47 %, no-hat songs 8 %. **Accent tiering is weak**: beat-hat minus off-8th velocity,
  median +6.4 (IQR 0…+19) vs rock +12.6. Open hat 14 % of hat hits, favouring step 15 (.14).
- **Perc:** 46 % of songs carry a perc lane; it leans to the backbeat (P .37/.38 on 5/13 vs .26–.27
  elsewhere) — side-stick and **tambourine** lead (15 % of perc notes each), then cabasa, maracas.
- **Toms / cymbals:** toms in groove bars in 4 % of songs. Crash on 1 after a fill .55, after a
  groove bar .16; ride = 26 % of cymbal hits.
- **Kit repetition:** kick+snare+hat bar identical to the next bar in a median 70 % of groove bars.
- **Velocity:** 15 % of files flat. In the rest, kick SD 4.5, snare 4.3, hat 11.2 — hats carry most of
  the dynamics.
- **Bass (176 songs):** 5.0 notes/bar; **100 % of onsets on 8th positions** (median song; IQR .82–1.00);
  note length median 1.9 steps (legato-ish, gate 0.78). Constant 8th pulse in 18 % of songs, constant
  16ths in none. Repeated notes 44 %, octave moves rare (7 % of songs ≥ 25 %). Register p10/50/p90
  31/36/41. Degrees (major songs): 1 .27, 5 .21, 4 .18, 6 .10, 2 .09; minor songs: 1 .34, 4 .14, b7 .13, b3 .11, b6 .10.
- **Harmony (weak measurement):** 70 % major. Major songs using bVII 35 % (rock control 36 %,
  disco 33 %); bIII 15 %, bVI 11 %. Minor songs: bIII .76, bVI .74, bVII .65 (rock .60/.72/.65).
- **Other parts:** chord parts in 87 % of songs (guitar 186, piano 101 of 436), power-chord windows 36 %
  of chord-part qualities; pads 56 %; **arps only 12 %** of songs; synth-lead programs in 28 %.

## Data vs the guide notes

| guide claim | where | measured | verdict |
|---|---|---|---|
| Tempo 110–125, default 120–140; dance strand 115–127, punk strand 140–160 | drums, melodic | file median 123 (IQR 109–137), folded 128 | **confirmed** (the default 120–140 is right; 140–160 is the upper quartile, not a strand of its own) |
| No swing | drums Nw-swing-1 | median 0 ticks; 3 % ≥ 4 | **confirmed** |
| Kick almost purely 8th-note (even steps ≤ .03) | drums (GMD pop proxy) | even steps ≤ .05; median song 0 % even kicks | **confirmed** |
| Weights: 8th-rock 50 %, motorik 4otf 30 %, disco-rock 20 % | drums (proposal) | 1+9 rock kick 53 %, 4otf 22 % (disco-rock is inside that 22 %) | **roughly confirmed** — 4otf a little lower |
| Displaced downbeat (kick accent on 9) | drums | P(9) .85 < P(1) .93; no evidence of a 9-accent family | not supported (keep low weight) |
| Backbeat 5/13 at 111–113; half-time snare on 9 in 19 % of bars | drums (GMD pop) | 5/13 at .71/.72, vel 107; half-time songs **3 %** | backbeat **confirmed**; half-time **much rarer** than GMD pop → lower it |
| Few ghosts (≤ 0.30 of snare hits) | Nw-snr-1 | median 0, 2 % of songs > 10 % | **confirmed** (even fewer) |
| Hats: driving 8ths with a very steep down-up accent (+55; target ≥ +25) | drums, Nw-hat-1 | 8ths confirmed (.71–.76); **tier +6.4** (IQR 0…+19) | 8ths **confirmed**; the **steep tiering is a GMD live-drummer trait, not visible here** — Nw-hat-1 ≥ +25 would fail most of these songs. Suggest ≥ +5 or drop. |
| 16ths with velocity variation as a hat family | drums | 9 % of songs 16th hats | minor family (≤ 10 %) |
| Tambourine reinforcing the snare on 5/13 | drums, Nw-perc-1 | perc lane in 46 %; perc P peaks on 5/13; tambourine is a top perc voice | **supported** (timing lead of 1–3 ticks not measurable from quantised files) |
| Crash on 1 after a fill (GMD .49) | drums | .55 after fill, .16 after groove | **confirmed** |
| Tom fill on 13–16 in ≤ 25 % of phrases | drums | fill bars median 6 % of bars | consistent |
| Bass: 8th pedal; ≥ 90 % of onsets on odd steps | melodic NW-4 | median 100 % (IQR 82–100 %) | **confirmed** |
| Bass NB1 "driving 8th root pedal" as the main cell | melodic | constant 8th pulse in 18 % of songs; 5.0 notes/bar; repeats 44 % | pedal exists but is **a minority**; the typical bar is 4–7 notes on 8th positions with rests |
| Bass NB4 Chic-style octaves (Duran strand) | melodic | octave moves ≥ 25 % in 7 % of songs | **rare** — keep NB4 as a low-weight cell |
| Bass vel 95–110 flat | melodic | bass flat in 30 % of files; CV within a bar 0.04 | **confirmed** (near-flat) |
| Register MIDI 28–50 | melodic | p10/50/p90 31/36/41 | **confirmed** (narrower: 30–42 covers most) |
| Major songs containing bVII 51 % (D5) — Mixolydian fingerprint | melodic NW-1 | 35 %; rock control 36 % | **not reproduced** — in LMD new wave uses bVII no more than rock. D5 (chord sheets) remains the better source; the NW-1 target (≥ 40 %) is not contradicted by a strong measurement. |
| Random-order maj7 arp (Rio) / bubbly 16th arps | melodic | arp parts in 12 % of songs | arps are **uncommon** in new wave — keep NA1/NA2 low weight |
| Choppy stabs L 8–16 ticks | melodic NW-2 | chord-part median length 1.7 steps ≈ 41 ticks (24 ticks = one 16th) | **longer than the guide** — most chord parts are 8th-length or held; choppy is a sub-family |

## Full tables (generated by `analysis/lmd_report.py`; copy of `analysis/out/newwave_tables.md`)

**Corpus:** 229 songs selected, **178 measured** (123 artists); skipped {'nodrums': 13, 'fewgroove': 2, 'meter': 14, 'offgrid': 2, 'triplet': 14, 'tempo': 2, 'error': 2, 'phase': 2}. Drums FLAT (≤ 2 distinct velocities): 15% of measured songs (152 songs carry velocity stats).
**Tempo (file tempo map):** median 123 BPM, IQR 109–137; folded into 90–180: median 128, IQR 115–144.
**Swing (even-16th hat delay, ticks @ 96 PPQN):** median -0.0, IQR 0.0–-0.0; songs ≥ 4 ticks: 3%. Files with a triplet/shuffle grid were skipped (14).
**Fills:** median fill-bar share 0.06; P(crash on 1 | after fill) 0.55, | after groove 0.16. Kit (kick+snare+hat) bar-to-bar repeat: median 0.70.

**Drum families (share of songs):** kick 4otf 22%; kick 1+9 (no 5/13) 53%; kick even-16th share>.1 13%; snare backbeat 5+13 62%; snare half-time 9 3%; hat 16ths (>=12/bar) 9%; hat 8ths (6-9/bar) 47%; hat off-beat only (3/7/11/15, <=5/bar) 2%; hat none/rare (<1/bar) 8%; toms in groove (>=.25 bars) 4%; perc lane (>=.5 bars) 46%

**Kick even-16th share (median song):** 0.00. **Hat tiering** (beat-hat vel − off-8th-hat vel, dynamic songs): median 6.4, IQR 0.0…19.4 (n=116). **Snare ghost share** (vel ≤ 45 off the backbeat, dynamic songs): median 0.00; songs with > 10 % ghosts: 0.02.
**Distinct velocities per lane** (all songs using the lane): kick ≤ 2 in 44% (≤ 3 in 50%); snare ≤ 2 in 37% (≤ 3 46%); hat ≤ 2 in 26% (≤ 3 31%).

### Drums — onset probability (P) and mean velocity per 16th step, groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KICK P | .94 | .01 | .11 | .03 | .32 | .01 | .29 | .06 | .85 | .02 | .18 | .04 | .33 | .02 | .19 | .03 |
| kick vel | 110 | 96 | 101 | 101 | 112 | 98 | 100 | 96 | 109 | 113 | 99 | 102 | 111 | 95 | 94 | 105 |
| SNARE P | .04 | .00 | .03 | .01 | .71 | .01 | .06 | .03 | .05 | .01 | .05 | .01 | .71 | .01 | .07 | .02 |
| snare vel | 91 | 81 | 104 | 73 | 105 | 65 | 97 | 64 | 90 | 66 | 99 | 75 | 105 | 62 | 98 | 83 |
| HAT P | .72 | .10 | .71 | .17 | .76 | .11 | .72 | .16 | .75 | .11 | .71 | .17 | .75 | .12 | .71 | .16 |
| hat vel | 86 | 65 | 79 | 71 | 87 | 61 | 79 | 74 | 85 | 67 | 80 | 72 | 87 | 62 | 80 | 73 |
| TOM P | .01 | .00 | .01 | .00 | .02 | .00 | .02 | .00 | .01 | .00 | .01 | .00 | .03 | .00 | .02 | .00 |
| tom vel | 71 | 48 | 65 | 102 | 77 | 35 | 85 | 29 | 70 | 30 | 66 | 100 | 85 | 50 | 87 | 43 |
| PERC P | .26 | .10 | .26 | .15 | .37 | .12 | .26 | .15 | .26 | .11 | .27 | .15 | .38 | .12 | .27 | .17 |
| perc vel | 82 | 53 | 76 | 56 | 93 | 59 | 78 | 64 | 81 | 64 | 77 | 64 | 93 | 60 | 76 | 62 |
| CYMB P | .21 | .01 | .04 | .01 | .09 | .01 | .05 | .01 | .09 | .00 | .05 | .01 | .10 | .01 | .06 | .00 |
| cymb vel | 89 | 79 | 78 | 66 | 94 | 51 | 80 | 70 | 91 | 64 | 75 | 58 | 93 | 49 | 79 | 52 |
| open-hat P | .05 | .00 | .08 | .01 | .07 | .00 | .09 | .01 | .06 | .00 | .10 | .01 | .07 | .00 | .14 | .02 |

| lane | songs using (≥ 25 % bars) | hits/bar (median song) | vel median | vel SD (median song) | distinct vels (median) | commonest notes (share) | commonest modal bar (share of songs) |
|---|---|---|---|---|---|---|---|
| kick | 99% | 3.5 | 112 | 4.5 | 5 | kick 0.50, kick2 0.50 | `x...x...x...x...` 0.24, `x.......x.......` 0.22, `x.....x.x.......` 0.13 |
| snare | 89% | 2.0 | 108 | 4.3 | 5 | snare 0.53, e-snare 0.34, clap 0.10 | `....x.......x...` 0.68, `........x.......` 0.02, `....x..x....x...` 0.02 |
| hat | 92% | 7.6 | 81 | 11.2 | 12 | closed hat 0.73, open hat 0.13, pedal hat 0.08 | `x.x.x.x.x.x.x.x.` 0.51, `xxxxxxxxxxxxxxxx` 0.09, `x...x...x...x...` 0.05 |
| tom | 4% | 0.0 | 82 | 8.1 | 8 | hi-floor tom 0.17, low tom 0.16, lo-floor tom 0.14, lo-mid tom 0.12 | `x.x.x.x.x.x.x.x.` 0.01, `..............x.` 0.01, `x.x.....x.x.....` 0.01 |
| perc | 50% | 0.6 | 81 | 13.0 | 12 | side-stick 0.15, tambourine 0.15, cabasa 0.07, maracas 0.06 | `....x.......x...` 0.11, `xxxxxxxxxxxxxxxx` 0.10, `x.x.x.x.x.x.x.x.` 0.06 |
| cymb | 40% | 0.2 | 88 | 10.1 | 11 | crash 0.46, ride 0.14, crash2 0.13, ride2 0.05 | `x...x...x...x...` 0.02, `x...............` 0.02, `x.x.x.x.x.x.x.x.` 0.01 |

Open-hat share of hat hits: 0.14. Ride share of cymbal hits: 0.26.

### Bass (176 songs; source {'program': 165, 'lowest': 11})

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BASS P | .93 | .04 | .39 | .11 | .53 | .06 | .66 | .13 | .75 | .07 | .45 | .13 | .58 | .07 | .59 | .09 |

- notes/bar 5.0 (IQR 3.9–7.3); share of onsets on 8th positions 1.00 (IQR 0.82–1.00)
- **sequencer-ness:** bars that are a constant 16th pulse 0%, constant 8th pulse 18%; songs where ≥ half the bass bars are a constant 8th/16th pulse 18% (16th 0%, 8th 18%)
- note length (16ths) median 1.88 (IQR 1.25–2.23); gate ratio (length ÷ gap to next onset) 0.78 (IQR 0.61–0.92); length histogram ≤½ / ½–1 / 1–2 / 2–4 / 4–8 / > 8 steps: 0.04 / 0.19 / 0.44 / 0.19 / 0.12 / 0.03
- register (MIDI) p10/median/p90 of the median song: 31 / 36 / 41
- intervals between consecutive notes: repeat 0.44 (IQR 0.21–0.74), step 1–2 st 0.15 (IQR 0.07–0.26), leap 3–11 st 0.26 (IQR 0.11–0.40), **octave 0.00 (IQR 0.00–0.03)**; songs with ≥ 25 % octave moves 7%
- pitch classes per bar 1.99 (IQR 1.42–2.50); flat-velocity bass 30%; velocity CV within a bar (non-flat) 0.04 (IQR 0.02–0.07)
- programs: 33 (94), 35 (26), 34 (15), 39 (9), 32 (8), 38 (8)
- scale degrees of bass notes, maj songs (n=123): 1 0.27, 5 0.21, 4 0.18, 6 0.10, 2 0.09, 3 0.06, b7 0.03
- scale degrees of bass notes, min songs (n=53): 1 0.34, 4 0.14, b7 0.13, b3 0.11, b6 0.10, 5 0.10, 2 0.03

### Key and harmony (estimated; minor share 30%)

- **maj songs (n=124)** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes power chords and sus): IV 0.93, V 0.88, vi 0.54, ii 0.39, iii 0.27, bVII 0.35, bIII 0.15, bVI 0.11
  - commonest labels: I 0.90, IV 0.77, V 0.73, I5 0.60, IV5 0.54, V5 0.49, vi 0.48, ii 0.34, bVII 0.27, iii 0.23, II5 0.18, vi7 0.18
  - half-bar chord qualities: maj 0.51, 5 0.26, min 0.13, m7 0.03, sus4 0.02, sus2 0.02, add9 0.02, maj7 0.01; chord change per half-bar (median) 0.57
- **min songs (n=54)** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes power chords and sus): bVII 0.65, bVI 0.74, bIII 0.76, iv 0.48, IV (maj/7, Dorian) 0.24, v (minor) 0.33, V (maj/7, harmonic) 0.17, bII 0.22
  - commonest labels: i 0.85, I5 0.74, bIII 0.59, bVI 0.57, IV5 0.48, iv 0.44, bVII 0.44, i7 0.37, bIII5 0.33, bVI5 0.33, v 0.30, bVII5 0.28
  - half-bar chord qualities: min 0.34, 5 0.27, maj 0.27, m7 0.06, maj7 0.02, sus4 0.01, add9 0.01, sus2 0.01; chord change per half-bar (median) 0.53

### Other parts (role by polyphony / rhythm heuristic, see README)

| role | parts | songs with | families | onsets/bar | poly | note len (16ths) | gate | register p10/med/p90 | pcs/bar | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| chord | 436 | 87% | guitar 186, piano 101, brass 33 | 4.5 | 2.19 | 1.7 | 0.75 | 57/64/69 | 3.5 | qualities maj 0.41, 5 0.36, min 0.18, m7 0.02, sus4 0.01 |
| pad | 172 | 56% | ensemble 76, synthpad 25, piano 23 | 1.3 | 2.56 | 15.2 | 0.99 | 58/64/72 | 3.0 | qualities maj 0.55, min 0.22, 5 0.11, m7 0.06, sus4 0.02 |
| arp | 28 | 12% | guitar 4, synthlead 4, ethnic 3 | 9.2 | 1.00 | 0.8 | 0.54 | 62/65/73 | 4.0 | 16th-grid 36%, 8th-grid 11%, span/bar 8 st |
| lead | 435 | 89% | guitar 97, ensemble 56, piano 49 | 4.1 | 1 | 2.0 | 0.87 | 63/69/74 | 2.4 | repeat 0.34, step 1–2 0.32, 3rds 0.16, 4/5th 0.13, oct 0.02; descending 0.52 |
| other | 150 | 52% | guitar 55, bass 25, ensemble 19 | 4.5 | 1.04 | 2.0 | 0.81 | 45/50/57 | 2.1 |  |

Instrument-family presence (share of songs): bass:other 89%, guitar 80%, piano 61%, ensemble 59%, brass 32%, organ 29%, synthlead 28%, synthpad 24%, reed 21%, chromperc 18%, bass 16%, pipe 16%, synthfx 13%, bass:synth 10%
