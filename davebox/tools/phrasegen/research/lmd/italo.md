# ITALO DISCO (+ Hi-NRG, Euro-disco) — measured (LMD)

**103 songs measured, 71 artists** — a **mixed lineage**: Italo proper (Gazebo, Ryan Paris, Den Harrow,
Righeira, Spagna, Sandra, Baltimora, Giuni Russo, Matia Bazar, Moroder), Hi-NRG (Miquel Brown,
Sinitta, Lonnie Gordon, Mel & Kim, Company B) and Euro-disco (Modern Talking, Blue System,
Baccara, Ottawan, Amanda Lear). 94 % of the evidence is the Echo Nest artist term ("italian disco",
"hi nrg", "euro disco"), so whole catalogues — ballads included — came in. Treat this as "the
Italo/Hi-NRG artist pool", not a set of dance-floor records. Method/licences/caveats: `README.md`.
Guide files compared: `../drums/italo.md`, `../melodic/italo.md`.

## What the data says

- **Tempo:** file median 120 BPM (IQR 104–130), folded 123 (114–132). Straight: 4 % of songs ≥ 4 ticks;
  9 of 135 files triplet-grid.
- **Kick:** 1 .93, 9 .84, **beats 2/4 .42/.43** (the most of the 80s targets, below EBM .60 and house
  .71); step 7 .24. 4otf in **37 %** of songs, 1+9 rock kick in 38 %. Modal kick bar `x...x...x...x...`
  in 38 % of songs.
- **Snare:** backbeat .79/.82 at vel 104 — backbeat songs 76 % (the most of the targets). **Clap = 17 %
  of snare-lane notes** (new wave 10 %, synth-pop 9 %).
- **Hat:** the **most 16th-like hat** of the targets — odd steps .76–.83, even steps .22–.27; 16th-hat
  songs 18 %, 8ths 48 %, no hat only 5 %. **Open hat is the rarest of any genre measured: 7 % of hat
  hits** (open-hat P .10/.11/.11/.18 on 3/7/11/15). Hat tiering +7.6.
- **Perc:** the **most-used perc lane** (68 % of songs use it in ≥ 25 % of bars): tambourine .20,
  maracas .10, slap, side-stick; modal perc bar 16ths in 16 % of songs.
- **Velocity:** only 7 % of files flat (the fewest); kick SD 4.0, snare 5.0, hat 11.2.
- **Fills / toms / cymbals:** fill bars 6 %; toms in groove bars 4 %; crash on 1 after a fill .56;
  cymbals in 21 % of groove bars. Kit bar-to-bar repeat median **0.50** (the lowest of the targets —
  more bar-to-bar variation, mostly in hats and perc).
- **Bass (102 songs):** 6.2 notes/bar, 96 % on 8th positions; **constant 16ths in 3 % of bars**,
  constant 8ths 20 %; songs mostly a constant pulse 23 % (16th 3 %, 8th 20 %). Octave moves ≥ 25 % in
  **20 %** of songs (IQR of octave share 0–.15, the widest of the targets). Leaps 21 %, repeats 35 %
  (the least repetitive bass of the targets). 1.9 pitch classes per bar. Length median 1.7 steps,
  gate 0.79. Flat bass 26 %. Synth-bass programs 29 of 102.
- **Harmony (weak):** 39 % minor. Minor songs: bVI .69, iv .64, bVII .64, bIII .64, **minor v .51**,
  major V .33, bII .18. Major songs: the most "pop" vocabulary — vi .79, ii .61, iii .45.
- **Other parts:** pads in 74 % of songs (the most of the targets; synth-pad programs 32 of 141),
  **arps in 20 %** (the most of the targets; 16th-grid 27 %, 8th-grid 15 %), synth-pad programs in 43 %.

## Data vs the guide notes

| guide claim | where | measured | verdict |
|---|---|---|---|
| Tempo default 116–128; Hi-NRG 128–136 | drums, melodic | folded median 123 (IQR 114–132) | **confirmed** |
| No swing (sequenced) | drums It-swing-1 | 4 % ≥ 4 ticks | **confirmed** |
| Kick exactly 1/5/9/13 in 100 % of bars | drums It-kick-1 | 4otf in 37 % of songs; beats 2/4 P .42/.43 | **contradicted for this corpus** — the artist pool splits ~evenly between 4otf (37 %) and the 1+9 rock kick (38 %); keep 4otf as the lead family but not the only one |
| Clap on 5/13 ≥ 0.95 (Hi-NRG: "heavy use of the clap") | drums It-clap-1 | backbeat .79/.82; clap is 17 % of snare-lane notes | backbeat **confirmed**; clap as the voice is **a minority** (though twice the new-wave rate) |
| **Open off-beat hat** on 3/7/11/15 in ≥ 95 % of hat phrases | drums It-hat-1 | open hat 7 % of hat hits — the rarest of any genre; closed 8ths (48 %) or 16ths (18 %) | **contradicted** — Italo transcriptions use CLOSED 8ths/16ths; the open off-beat hat is a disco/house/EBM trait here (open share: house .25, EBM .24) |
| Hat-sparse family ≤ 20 % | drums | no-hat songs 5 % | **confirmed** (rarer) |
| Tambourine on every 16th (Eurodisco) | drums | perc lane in 68 % of songs, tambourine top; modal 16th perc bar in 16 % | **supported** |
| Near-identical bars (sequenced repetition) | drums | kit bar-repeat median 0.50 (lowest of the targets) | **contradicted** — more bar-to-bar variation than new wave (0.70) or EBM (0.75) |
| Bass: constant 16th (or gallop) grid in ≥ 90 % | melodic IT-1 | constant 16ths in 3 % of bars; 8ths 20 %; mostly-constant songs 23 % | **contradicted** — the 16th octave bass is not the norm in these files |
| Bass octave share 25–60 % | melodic IT-2 | ≥ 25 % octaves in 20 % of songs (median .01) | a real **octave family (~1 in 5)**, the joint-highest with synth-pop and EBM, but not the default |
| 1–2 pitch classes per bar | melodic IT-3 | 1.9 (IQR 1.3–2.7) | **confirmed** |
| Gate ≤ 0.45 (fast decay) | melodic IT-4 | gate 0.79; ≤ 1-step notes 34 % | **contradicted** (legato-ish in transcriptions) |
| Minor songs use bVII ≥ 50 % | melodic IT-6 | .64 | **confirmed** |
| Harmonic-minor V as an option | melodic | major V in 33 % of minor songs; minor v in 51 % | **supported** (both occur) |
| "Arpeggiator-infused" | melodic | arps in 20 % of songs (highest of the targets) | **supported** as a signature-but-minority part |

## Full tables (generated by `analysis/lmd_report.py`; copy of `analysis/out/italo_tables.md`)

**Corpus:** 135 songs selected, **103 measured** (71 artists); skipped {'triplet': 9, 'meter': 8, 'tempo': 2, 'offgrid': 3, 'nodrums': 5, 'fewgroove': 3, 'phase': 1, 'error': 1}. Drums FLAT (≤ 2 distinct velocities): 7% of measured songs (96 songs carry velocity stats).
**Tempo (file tempo map):** median 120 BPM, IQR 104–130; folded into 90–180: median 123, IQR 114–132.
**Swing (even-16th hat delay, ticks @ 96 PPQN):** median 0.0, IQR 0.0–0.0; songs ≥ 4 ticks: 4%. Files with a triplet/shuffle grid were skipped (9).
**Fills:** median fill-bar share 0.06; P(crash on 1 | after fill) 0.56, | after groove 0.12. Kit (kick+snare+hat) bar-to-bar repeat: median 0.50.

**Drum families (share of songs):** kick 4otf 37%; kick 1+9 (no 5/13) 38%; kick even-16th share>.1 18%; snare backbeat 5+13 76%; snare half-time 9 1%; hat 16ths (>=12/bar) 18%; hat 8ths (6-9/bar) 48%; hat off-beat only (3/7/11/15, <=5/bar) 4%; hat none/rare (<1/bar) 5%; toms in groove (>=.25 bars) 4%; perc lane (>=.5 bars) 59%

**Kick even-16th share (median song):** 0.00. **Hat tiering** (beat-hat vel − off-8th-hat vel, dynamic songs): median 7.6, IQR -0.0…19.8 (n=83). **Snare ghost share** (vel ≤ 45 off the backbeat, dynamic songs): median 0.00; songs with > 10 % ghosts: 0.03.
**Distinct velocities per lane** (all songs using the lane): kick ≤ 2 in 46% (≤ 3 in 52%); snare ≤ 2 in 28% (≤ 3 38%); hat ≤ 2 in 22% (≤ 3 23%).

### Drums — onset probability (P) and mean velocity per 16th step, groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KICK P | .93 | .01 | .02 | .04 | .42 | .01 | .24 | .10 | .84 | .02 | .10 | .07 | .43 | .02 | .13 | .02 |
| kick vel | 112 | 123 | 108 | 87 | 113 | 107 | 100 | 89 | 111 | 90 | 112 | 101 | 113 | 98 | 98 | 84 |
| SNARE P | .05 | .02 | .04 | .03 | .79 | .02 | .06 | .04 | .07 | .03 | .06 | .02 | .82 | .02 | .06 | .04 |
| snare vel | 91 | 76 | 85 | 81 | 104 | 89 | 78 | 71 | 90 | 76 | 89 | 80 | 104 | 74 | 87 | 84 |
| HAT P | .76 | .23 | .83 | .26 | .81 | .22 | .83 | .27 | .80 | .23 | .83 | .25 | .80 | .23 | .82 | .27 |
| hat vel | 85 | 64 | 77 | 68 | 86 | 61 | 78 | 68 | 85 | 61 | 78 | 71 | 87 | 64 | 79 | 72 |
| TOM P | .00 | .00 | .00 | .00 | .02 | .00 | .00 | .00 | .00 | .00 | .00 | .00 | .02 | .00 | .01 | .00 |
| tom vel | – | – | – | – | 89 | – | – | – | – | – | – | 78 | 95 | – | 103 | – |
| PERC P | .36 | .19 | .42 | .25 | .44 | .19 | .43 | .25 | .34 | .22 | .41 | .29 | .46 | .19 | .44 | .24 |
| perc vel | 73 | 54 | 71 | 62 | 83 | 57 | 70 | 64 | 74 | 64 | 71 | 66 | 85 | 62 | 73 | 62 |
| CYMB P | .16 | .00 | .05 | .00 | .06 | .00 | .05 | .01 | .06 | .01 | .04 | .01 | .07 | .00 | .05 | .01 |
| cymb vel | 87 | – | 90 | – | 91 | – | 92 | – | 87 | 84 | 90 | – | 88 | – | 84 | 86 |
| open-hat P | .01 | .00 | .10 | .01 | .00 | .00 | .11 | .00 | .01 | .00 | .11 | .00 | .02 | .00 | .18 | .03 |

| lane | songs using (≥ 25 % bars) | hits/bar (median song) | vel median | vel SD (median song) | distinct vels (median) | commonest notes (share) | commonest modal bar (share of songs) |
|---|---|---|---|---|---|---|---|
| kick | 99% | 3.4 | 112 | 4.0 | 4 | kick 0.50, kick2 0.49 | `x...x...x...x...` 0.38, `x.......x.......` 0.17, `x.....x.x.......` 0.16 |
| snare | 97% | 2 | 104 | 5.0 | 5 | snare 0.54, e-snare 0.26, clap 0.17 | `....x.......x...` 0.77, `............x...` 0.02, `........x.......` 0.02 |
| hat | 95% | 7.8 | 80 | 11.2 | 11 | closed hat 0.81, pedal hat 0.08, open hat 0.07 | `x.x.x.x.x.x.x.x.` 0.48, `xxxxxxxxxxxxxxxx` 0.18, `x.xxx.xxx.xxx.xx` 0.06 |
| tom | 4% | 0 | 100 | 3.5 | 4 | low tom 0.15, hi-floor tom 0.12, hi-mid tom 0.10, lo-mid tom 0.09 | `....x.......x...` 0.02, `..............x.` 0.01 |
| perc | 68% | 4.2 | 75 | 12.9 | 10 | tambourine 0.20, maracas 0.10, slap 0.07, side-stick 0.07 | `xxxxxxxxxxxxxxxx` 0.16, `x.x.x.x.x.x.x.x.` 0.08, `..x...x...x...x.` 0.03 |
| cymb | 33% | 0.2 | 83 | 8.0 | 6 | crash 0.39, crash2 0.17, ride 0.10, splash 0.09 | `x.x.x.x.x.x.x.x.` 0.02, `x.x.x.xx.x.xx.x.` 0.01, `x...x...x...x...` 0.01 |

Open-hat share of hat hits: 0.07. Ride share of cymbal hits: 0.17.

### Bass (102 songs; source {'program': 93, 'lowest': 9})

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BASS P | .88 | .10 | .49 | .24 | .60 | .12 | .71 | .25 | .72 | .12 | .55 | .20 | .66 | .13 | .68 | .18 |

- notes/bar 6.2 (IQR 4.1–7.9); share of onsets on 8th positions 0.96 (IQR 0.69–1.00)
- **sequencer-ness:** bars that are a constant 16th pulse 3%, constant 8th pulse 20%; songs where ≥ half the bass bars are a constant 8th/16th pulse 23% (16th 3%, 8th 20%)
- note length (16ths) median 1.74 (IQR 1.00–2.20); gate ratio (length ÷ gap to next onset) 0.79 (IQR 0.56–0.92); length histogram ≤½ / ½–1 / 1–2 / 2–4 / 4–8 / > 8 steps: 0.07 / 0.27 / 0.39 / 0.16 / 0.09 / 0.03
- register (MIDI) p10/median/p90 of the median song: 31 / 36 / 42
- intervals between consecutive notes: repeat 0.35 (IQR 0.13–0.70), step 1–2 st 0.11 (IQR 0.03–0.27), leap 3–11 st 0.21 (IQR 0.07–0.41), **octave 0.01 (IQR 0.00–0.15)**; songs with ≥ 25 % octave moves 20%
- pitch classes per bar 1.89 (IQR 1.32–2.67); flat-velocity bass 26%; velocity CV within a bar (non-flat) 0.06 (IQR 0.03–0.08)
- programs: 33 (36), 38 (17), 35 (13), 39 (12), 34 (7), 0 (6)
- scale degrees of bass notes, maj songs (n=63): 1 0.28, 5 0.19, 4 0.13, 6 0.12, 2 0.10, 3 0.07, b7 0.04
- scale degrees of bass notes, min songs (n=39): 1 0.29, 4 0.15, 5 0.14, b7 0.13, b3 0.11, b6 0.11, 2 0.03

### Key and harmony (estimated; minor share 39%)

- **maj songs (n=62)** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes power chords and sus): IV 0.85, V 0.87, vi 0.79, ii 0.61, iii 0.45, bVII 0.34, bIII 0.13, bVI 0.10
  - commonest labels: I 0.95, IV 0.76, vi 0.73, V 0.71, I5 0.63, ii 0.58, V5 0.43, iii 0.43, bVII 0.31, ii7 0.29, VI5 0.27, IV5 0.26
  - half-bar chord qualities: maj 0.49, min 0.22, 5 0.17, m7 0.04, add9 0.02, sus4 0.01, 7 0.01, maj7 0.01; chord change per half-bar (median) 0.52
- **min songs (n=39)** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes power chords and sus): bVII 0.64, bVI 0.69, bIII 0.64, iv 0.64, IV (maj/7, Dorian) 0.23, v (minor) 0.51, V (maj/7, harmonic) 0.33, bII 0.18
  - commonest labels: i 0.87, bVI 0.64, bIII 0.61, iv 0.59, I5 0.59, bVII 0.49, v 0.39, i7 0.33, V 0.31, IV5 0.31, iv7 0.26, IV 0.23
  - half-bar chord qualities: min 0.38, maj 0.32, 5 0.12, m7 0.08, sus2 0.03, maj7 0.02, sus4 0.01, add9 0.01; chord change per half-bar (median) 0.59

### Other parts (role by polyphony / rhythm heuristic, see README)

| role | parts | songs with | families | onsets/bar | poly | note len (16ths) | gate | register p10/med/p90 | pcs/bar | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| chord | 239 | 83% | piano 64, guitar 59, ensemble 43 | 4.3 | 2.11 | 1.5 | 0.62 | 59/65/72 | 3.3 | qualities maj 0.39, 5 0.28, min 0.25, m7 0.02, dim 0.02 |
| pad | 141 | 74% | ensemble 63, synthpad 32, piano 20 | 1.4 | 2.71 | 15.3 | 0.99 | 57/63/69 | 3.0 | qualities maj 0.51, min 0.27, 5 0.11, m7 0.04, sus4 0.02 |
| arp | 26 | 20% | guitar 5, piano 5, synthpad 3 | 8.9 | 1.00 | 1.0 | 0.88 | 56/64/70 | 4.4 | 16th-grid 27%, 8th-grid 15%, span/bar 10 st |
| lead | 301 | 94% | guitar 50, ensemble 42, piano 40 | 4.5 | 1 | 1.8 | 0.82 | 63/69/74 | 2.6 | repeat 0.32, step 1–2 0.32, 3rds 0.15, 4/5th 0.11, oct 0.05; descending 0.53 |
| other | 95 | 50% | bass 22, guitar 22, synthlead 11 | 4.5 | 1.01 | 1.7 | 0.78 | 43/50/59 | 2.0 |  |

Instrument-family presence (share of songs): ensemble 79%, piano 73%, bass:other 71%, guitar 65%, synthpad 43%, brass 36%, synthlead 32%, bass:synth 28%, reed 25%, bass 23%, pipe 22%, organ 16%, synthfx 16%, chromperc 15%
