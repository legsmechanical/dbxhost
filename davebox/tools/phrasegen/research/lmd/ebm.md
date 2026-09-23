# EBM / electro-industrial — measured (LMD)

**37 songs measured, 31 artists** — ⚠ **below the 50-song target, and the wrong era.** LMD-matched has
**no Front 242, Nitzer Ebb, DAF, Die Krupps, Skinny Puppy, Front Line Assembly or KMFDM.** What it has
is 1990s–2000s **futurepop / electro-industrial / dark electro**: SITD, Frozen Plasma, Assemblage 23,
Covenant, Icon of Coil, Project Pitchfork, In Strict Confidence, Rotersand, Seabound, God Module, plus
My Life With the Thrill Kill Kult, Revolting Cocks, Pigface, Test Dept. So this measures EBM's
*descendants*, which are closer to synth-pop/trance than to 1980s body music. Error bars ± ~10–15
points. Method/licences/caveats: `README.md`. Guide files compared: `../drums/ebm.md`,
`../melodic/ebm.md`.

## What the data says

- **Tempo:** file median 130 BPM (IQR 124–138), folded 132 (128–139). Straight (0 % ≥ 4 ticks).
- **Kick:** 4otf in **60 %** of songs (beats 2/4 P .62/.62, modal bar `x...x...x...x...` in 65 %);
  rock 1+9 kick 22 %. **Kick velocity is flat:** SD 0.3, median 2 distinct values, ≤ 2 distinct in
  72 % of songs (rock 42 %).
- **Snare:** 5/13 .69/.71 (backbeat songs 57 %); **snare on step 1 at .15** (the most of any genre —
  a snare/clap layered on the downbeat); half-time 0 %. Clap 20 % of snare-lane notes.
- **Hat:** 8ths .68–.78 on odd steps. **Open hat on the off-beats: P .35/.34/.36/.43 on 3/7/11/15,
  24 % of hat hits** — the 4otf + open-off-beat-hat grid. Hat tiering 0 (no beat/off-beat accent),
  hat ≤ 3 distinct velocities in 58 % of songs.
- **Perc:** in 57 % of songs; tambourine .23, maracas .14, cabasa .09; modal perc bar 16ths (19 %).
  (GM has no "metal hit"; the guide's metallic lane cannot be measured from GM files.)
- **Toms / fills / cymbals:** toms in groove bars 3 %; fill bars 8 %; crash on 1 after a fill .56;
  cymbals in 25 % of groove bars. **Kit bar-to-bar repeat 0.75 — the highest of all genres.**
- **Bass (36 songs):** 5.9 notes/bar, 100 % on 8th positions (IQR 67–100 %); constant 16ths in 3 % of
  songs, constant 8ths 25 %. **Repeated notes 69 %** (the most of any genre: one-note pedal lines),
  **1.4 pitch classes per bar** (the fewest), root = 43 % of notes in minor songs. Shortest notes of the
  targets: 13 % of notes ≤ ½ step, gate 0.64. Octave moves ≥ 25 % in 22 % of songs. Flat bass 44 %;
  CV in a bar 0.04.
- **Harmony (weak):** **57 % minor — the most minor target** (rock 25 %). Minor songs: bVI .77, bVII
  .77, iv .65, bIII .47, minor v .41, major V .35.
- **Other parts:** synth-lead programs in **54 %** of songs (the most of any genre; techno 53 %), pads 65 %, chord
  parts 81 %, arps 16 % (8th-grid 38 %, 16th-grid 25 %).

## Data vs the guide notes

| guide claim | where | measured | verdict |
|---|---|---|---|
| Tempo 126; default 118–132 | drums, melodic | folded median 132 (IQR 128–139) | **a little faster** (futurepop); 124–138 fits this corpus |
| No swing | drums | 0 % ≥ 4 ticks | **confirmed** |
| Incessant quarter-note kick; 4otf in ≥ 75 % of phrases | drums Eb-kick-1 | 4otf 60 %, rock 1+9 22 % | **confirmed as the lead family**, below the 75 % target |
| Kick velocity flat 115–127 | drums | kick SD 0.3, median vel 121, ≤ 2 distinct in 72 % | **confirmed** — the flattest kick of any genre |
| ≤ 2 distinct velocities per lane | drums Eb-vel-1 | kick 72 %, snare 50 %, hat 42 % (≤ 3: 58 %) | **kick yes; snare/hat only about half** |
| Backbeat snare "often"; half-time family ≤ 20 % | drums | backbeat songs 57 %; half-time 0 %; snare on 1 at .15 | backbeat **confirmed**; half-time **not seen**; add a downbeat snare/clap layer |
| Hats closed 8ths / off-beat 8ths, short; sometimes absent | drums | 8ths .68–.78; open hat on off-beats .34–.43; no-hat 11 % | 8ths **confirmed**; this corpus **uses OPEN off-beat hats** |
| NOT EBM: "open disco hats with house shuffle" | drums | open off-beat hats in a third of bars (no shuffle) | **contradicted for modern EBM** — the open off-beat hat is present; the shuffle is not |
| Metal-hit perc lane 1–4 hits/bar | drums Eb-perc-1 | not measurable in GM; generic perc in 57 % of songs | unmeasured |
| Tom lane empty | drums | toms in groove bars 3 % | **confirmed** |
| ≤ 2 events differ between bars | drums | kit bar-repeat 0.75 (highest of all genres) | **confirmed** |
| Bass: all 16ths on, ≥ 12 onsets per bar | melodic EB-1 | 5.9 notes/bar; constant 16ths in 3 % of songs | **contradicted** — the sequenced line in these files is 8ths or less |
| Bass velocity NOT flat, patterned (CV 0.08–0.25) | melodic EB-2 | flat in 44 % of files; CV 0.04 | **contradicted** (in transcriptions; the patterned-accent claim comes from producer forums) |
| Bass 2–4 pitch classes per bar | melodic EB-3 | 1.4 (IQR 1.0–1.75); repeats 69 % | **contradicted** — 1–2 pcs; a pedal line |
| Bass gate ≤ 0.5 (short) | melodic EB-4 | 0.64; shortest of the targets | **close** — shortest measured, not quite ≤ 0.5 |
| Most minor-leaning tag (D5 45 %) | melodic | 57 % minor | **confirmed** |
| Chords/pads/arps/leads not idiomatic (generate 0 by default) | melodic EB-5 | pads 65 %, chords 81 %, synth-lead programs 54 % of songs | **contradicted for modern EBM** (futurepop is a melodic genre); for classic 1980s EBM this corpus says nothing |

## Full tables (generated by `analysis/lmd_report.py`; copy of `analysis/out/ebm_tables.md`)

**Corpus:** 43 songs selected, **37 measured** (31 artists); skipped {'meter': 1, 'triplet': 2, 'offgrid': 1, 'nodrums': 2}. Drums FLAT (≤ 2 distinct velocities): 16% of measured songs (31 songs carry velocity stats).
**Tempo (file tempo map):** median 130 BPM, IQR 124–138; folded into 90–180: median 132, IQR 128–139.
**Swing (even-16th hat delay, ticks @ 96 PPQN):** median 0.0, IQR 0.0–0.0; songs ≥ 4 ticks: 0%. Files with a triplet/shuffle grid were skipped (2).
**Fills:** median fill-bar share 0.08; P(crash on 1 | after fill) 0.56, | after groove 0.15. Kit (kick+snare+hat) bar-to-bar repeat: median 0.75.

**Drum families (share of songs):** kick 4otf 60%; kick 1+9 (no 5/13) 22%; kick even-16th share>.1 11%; snare backbeat 5+13 57%; snare half-time 9 0%; hat 16ths (>=12/bar) 11%; hat 8ths (6-9/bar) 46%; hat off-beat only (3/7/11/15, <=5/bar) 3%; hat none/rare (<1/bar) 11%; toms in groove (>=.25 bars) 3%; perc lane (>=.5 bars) 57%

**Kick even-16th share (median song):** 0.00. **Hat tiering** (beat-hat vel − off-8th-hat vel, dynamic songs): median 0.0, IQR -9.9…15.6 (n=24). **Snare ghost share** (vel ≤ 45 off the backbeat, dynamic songs): median 0.00; songs with > 10 % ghosts: 0.00.
**Distinct velocities per lane** (all songs using the lane): kick ≤ 2 in 72% (≤ 3 in 78%); snare ≤ 2 in 50% (≤ 3 53%); hat ≤ 2 in 42% (≤ 3 58%).

### Drums — onset probability (P) and mean velocity per 16th step, groove bars

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KICK P | .90 | .00 | .03 | .04 | .62 | .00 | .17 | .02 | .83 | .00 | .11 | .01 | .62 | .01 | .09 | .01 |
| kick vel | 116 | – | 126 | 118 | 115 | – | 111 | 101 | 115 | – | 111 | 125 | 114 | 126 | 119 | 82 |
| SNARE P | .15 | .01 | .04 | .03 | .69 | .00 | .06 | .02 | .12 | .02 | .03 | .03 | .71 | .00 | .09 | .04 |
| snare vel | 92 | 64 | 83 | 87 | 102 | – | 82 | 95 | 96 | 74 | 78 | 83 | 104 | – | 80 | 95 |
| HAT P | .71 | .13 | .74 | .18 | .73 | .17 | .74 | .16 | .74 | .14 | .78 | .15 | .68 | .13 | .78 | .21 |
| hat vel | 84 | 68 | 83 | 79 | 84 | 71 | 85 | 77 | 84 | 74 | 85 | 76 | 85 | 72 | 85 | 76 |
| TOM P | .00 | .00 | .00 | .00 | .03 | .00 | .00 | .00 | .00 | .00 | .00 | .00 | .03 | .00 | .00 | .00 |
| tom vel | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – |
| PERC P | .43 | .23 | .37 | .31 | .45 | .19 | .42 | .30 | .42 | .23 | .37 | .29 | .47 | .23 | .40 | .28 |
| perc vel | 76 | 68 | 70 | 69 | 83 | 59 | 75 | 68 | 77 | 67 | 74 | 72 | 81 | 62 | 78 | 65 |
| CYMB P | .20 | .00 | .03 | .00 | .06 | .00 | .03 | .00 | .06 | .00 | .03 | .00 | .07 | .00 | .03 | .00 |
| cymb vel | 91 | – | 74 | – | 80 | – | 87 | – | 79 | – | 86 | – | 75 | – | 86 | – |
| open-hat P | .03 | .00 | .35 | .00 | .02 | .01 | .34 | .01 | .03 | .00 | .36 | .00 | .02 | .00 | .43 | .02 |

| lane | songs using (≥ 25 % bars) | hits/bar (median song) | vel median | vel SD (median song) | distinct vels (median) | commonest notes (share) | commonest modal bar (share of songs) |
|---|---|---|---|---|---|---|---|
| kick | 97% | 3.9 | 121 | 0.3 | 2 | kick 0.62, kick2 0.35 | `x...x...x...x...` 0.65, `x.......x.......` 0.08, `x.....x.x.......` 0.08 |
| snare | 92% | 2 | 100 | 3.5 | 4 | snare 0.49, e-snare 0.26, clap 0.20 | `....x.......x...` 0.57, `x...x...x...x...` 0.05, `....x.....x...x.` 0.03 |
| hat | 89% | 7.6 | 81 | 10.4 | 4 | closed hat 0.55, open hat 0.21, pedal hat 0.16 | `x.x.x.x.x.x.x.x.` 0.49, `..x...x...x...x.` 0.05, `x.xxx.xxx.xxx.xx` 0.05 |
| tom | 3% | 0 | 104 | – | – | low tom 0.13, lo-floor tom 0.13, hi-floor tom 0.09, lo-mid tom 0.08 | `....x.......x...` 0.03 |
| perc | 62% | 3.6 | 77 | 9.8 | 4 | tambourine 0.23, maracas 0.14, cabasa 0.09, slap 0.04 | `xxxxxxxxxxxxxxxx` 0.19, `x.x.x.x.x.x.x.x.` 0.05, `xxxxx.xxxxxxx.xx` 0.05 |
| cymb | 32% | 0.2 | 87 | 9.5 | 2 | crash 0.54, crash2 0.17, ride2 0.09, splash 0.08 | `x.x.x.x.x.x.x.x.` 0.03, `x...............` 0.03, `..x...x...x...x.` 0.03 |

Open-hat share of hat hits: 0.24. Ride share of cymbal hits: 0.16.

### Bass (36 songs; source {'program': 30, 'lowest': 6})

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BASS P | .80 | .08 | .55 | .25 | .51 | .07 | .70 | .18 | .65 | .10 | .59 | .19 | .66 | .08 | .66 | .22 |

- notes/bar 5.9 (IQR 4.0–7.9); share of onsets on 8th positions 1.00 (IQR 0.67–1.00)
- **sequencer-ness:** bars that are a constant 16th pulse 4%, constant 8th pulse 24%; songs where ≥ half the bass bars are a constant 8th/16th pulse 28% (16th 3%, 8th 25%)
- note length (16ths) median 1.79 (IQR 1.18–2.04); gate ratio (length ÷ gap to next onset) 0.64 (IQR 0.50–0.96); length histogram ≤½ / ½–1 / 1–2 / 2–4 / 4–8 / > 8 steps: 0.13 / 0.18 / 0.42 / 0.19 / 0.04 / 0.03
- register (MIDI) p10/median/p90 of the median song: 31 / 36 / 40
- intervals between consecutive notes: repeat 0.69 (IQR 0.29–0.91), step 1–2 st 0.04 (IQR 0.00–0.16), leap 3–11 st 0.07 (IQR 0.02–0.19), **octave 0.00 (IQR 0.00–0.06)**; songs with ≥ 25 % octave moves 22%
- pitch classes per bar 1.38 (IQR 1.00–1.75); flat-velocity bass 44%; velocity CV within a bar (non-flat) 0.04 (IQR 0.01–0.10)
- programs: 33 (14), 38 (8), 87 (3), 39 (3), 32 (2), 34 (2)
- scale degrees of bass notes, maj songs (n=16): 1 0.34, 5 0.18, 4 0.15, 2 0.12, 6 0.11, b7 0.04, 3 0.03
- scale degrees of bass notes, min songs (n=20): 1 0.43, b7 0.18, b6 0.11, 4 0.07, 5 0.07, b3 0.04, 2 0.04

### Key and harmony (estimated; minor share 57%)

- **maj songs (n=16)** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes power chords and sus): IV 0.94, V 0.81, vi 0.44, ii 0.38, iii 0.38, bVII 0.19, bIII 0.06, bVI 0.12
  - commonest labels: IV 0.81, I 0.81, I5 0.69, V5 0.62, V 0.62, IV5 0.56, vi 0.44, Isus2 0.25, Isus4 0.25, VI5 0.25, ii7 0.25, ii 0.25
  - half-bar chord qualities: maj 0.55, min 0.19, 5 0.17, m7 0.04, sus2 0.02, sus4 0.02, add9 0.01, maj7 0.01; chord change per half-bar (median) 0.51
- **min songs (n=17)** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes power chords and sus): bVII 0.77, bVI 0.77, bIII 0.47, iv 0.65, IV (maj/7, Dorian) 0.29, v (minor) 0.41, V (maj/7, harmonic) 0.35, bII 0.00
  - commonest labels: i 0.94, iv 0.65, bVI 0.65, bVII 0.65, I5 0.47, v 0.41, bIII 0.35, IV 0.29, V 0.29, bIII5 0.23, IV5 0.23, bVI5 0.23
  - half-bar chord qualities: min 0.41, maj 0.31, 5 0.15, add9 0.02, sus4 0.02, sus2 0.02, m7 0.02, dim 0.02; chord change per half-bar (median) 0.56

### Other parts (role by polyphony / rhythm heuristic, see README)

| role | parts | songs with | families | onsets/bar | poly | note len (16ths) | gate | register p10/med/p90 | pcs/bar | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| chord | 73 | 81% | piano 16, ensemble 16, guitar 13 | 4.1 | 2.17 | 1.5 | 0.53 | 60/66/72 | 3.2 | qualities maj 0.40, min 0.29, 5 0.26, sus4 0.02, m7 0.02 |
| pad | 45 | 65% | ensemble 22, synthpad 9, guitar 5 | 1.1 | 2.73 | 15.9 | 1.00 | 58/63/70 | 3 | qualities maj 0.55, min 0.31, 5 0.10, sus4 0.02, dim 0.01 |
| arp | 8 | 16% | guitar 5, brass 1, piano 1 | 10.7 | 1.03 | 0.7 | 0.46 | 52/58/70 | 3.5 | 16th-grid 25%, 8th-grid 38%, span/bar 9 st |
| lead | 114 | 89% | ensemble 22, synthlead 20, piano 16 | 4.2 | 1.00 | 2.0 | 0.87 | 64/71/76 | 2.3 | repeat 0.31, step 1–2 0.30, 3rds 0.12, 4/5th 0.14, oct 0.11; descending 0.51 |
| other | 37 | 65% | ensemble 9, synthlead 7, guitar 5 | 5.1 | 1 | 1.2 | 0.59 | 43/49/53 | 1.5 |  |

Instrument-family presence (share of songs): ensemble 70%, bass:other 68%, piano 60%, synthlead 54%, brass 49%, guitar 46%, synthpad 35%, bass:synth 30%, organ 22%, reed 19%, strings 19%, bass 16%, pipe 14%, chromperc 14%
