# LMD measurements — new wave, post-punk, synth-pop, Italo, EBM (and why not synthwave)

The guide-based genre files in `../drums/` and `../melodic/` had **no measured data** for these genres
(GMD has no such labels). This folder measures them from the **Lakh MIDI Dataset**. Every number here
comes from `analysis/*.py`; nothing is hand-entered.

| file | what |
|---|---|
| `newwave.md`, `postpunk.md`, `synthpop.md`, `italo.md`, `ebm.md` | per-genre tables + "data vs guide" |
| `synthwave.md` | why there is no synthwave measurement, and what stands in for it |
| `ingest_candidates.md` | single-lane drum loops with real velocity dynamics (drums only) |
| `analysis/out/summary.md` | the cross-genre comparison tables (targets + controls) |
| `analysis/out/<genre>_tables.md`, `<genre>_stats.json` | full tables for every genre incl. controls |
| `analysis/out/selection.json`, `selection_report.txt` | which songs were used, by what evidence |
| `analysis/out/ingest_candidates.json` | every ingest candidate with raw first-pass velocities + note numbers |

## Sources and licences

| source | used for | licence / terms |
|---|---|---|
| **LMD-matched** (Raffel 2016), 45,129 MIDI files matched to 31,034 MSD tracks, + `match_scores.json` | the MIDI data | **CC BY 4.0** on the dataset. Cite: colinraffel.com/projects/lmd and C. Raffel, *Learning-Based Methods for Comparing Sequences, with Applications to Audio-to-MIDI Alignment and Matching*, PhD thesis, Columbia, 2016. ⚠ The files are hobbyist **transcriptions of commercial songs**: MELODIC content is **reference/statistics only**; single-lane DRUM loops may be carried over (owner ruling). |
| **`lmd_matched_h5`** (MSD per-track metadata for the matched tracks) | artist/title/year, Echo Nest `artist_terms` (+weights), MusicBrainz `artist_mbtags` | Million Song Dataset metadata: free for research ("MSD is a freely-available collection"); the Echo Nest terms are artist-level. Used only to SELECT songs, never shipped. |
| **MSD Last.fm dataset** (`lastfm_tags.db`, 2011) | track-level genre tags | **"Research only, strictly non-commercial"** (millionsongdataset.com/lastfm). Used only to SELECT songs; no tag data is shipped or needed at runtime. If that is a concern, re-run `lmd_select.py` with Last.fm evidence disabled — about a quarter of the target songs (155 of 606) came from it. |

Downloads live outside the repo in `/Users/josh/phrasegen-cache/lmd/` (lmd_matched 1.4 GB, h5 6.6 GB,
lastfm_tags.db 0.6 GB, plus a venv with `pretty_midi`, `h5py`, `numpy`).

## Pipeline (reproduce)

```sh
C=/Users/josh/phrasegen-cache/lmd; PY=$C/venv/bin/python; cd analysis
$PY lmd_meta.py $C $C/meta.json                                   # metadata table (~1 min)
$PY lmd_select.py $C/meta.json out/selection.json out/selection_report.txt
$PY -W ignore lmd_measure.py out/selection.json $C/lmd_matched $C/songs.jsonl   # ~4 min
$PY lmd_report.py $C/songs.jsonl out
$PY lmd_ingest.py $C/songs.jsonl out/ingest_candidates.json ../ingest_candidates.md 8
```

## Selection (`lmd_select.py`)

- **Evidence:** a Last.fm TRACK tag ≥ 20 (of 100), or an Echo Nest ARTIST term among the artist's top 4
  with weight ≥ 0.7 that is **corroborated** by a related word in the artist's MusicBrainz tags or the
  track's Last.fm tags (or is the artist's #1/#2 term at ≥ 0.85). Controls house/techno use Last.fm only.
- **Era filter** on the song year (or the artist's median year when missing): new wave 1976–92,
  post-punk 1977–95, synth-pop 1978–93, Italo 1977–92, EBM 1980–2011.
- **One genre per song**, precedence synthwave > EBM > Italo > post-punk > synth-pop > new wave >
  controls — so "new wave" means *new wave not tagged anything more specific*.
- **Manual screen** (the `SCREEN` dict): artists whose tag evidence is plainly wrong were removed —
  Echo Nest name collisions and off-genre acts (Italian cantautori tagged "italian disco", country and
  60s acts, gothic metal in post-punk, 2000s pop in synth-pop, 90s Eurodance in Italo, ABBA/Queen cover
  acts tagged darkwave). Unknown artists
  were **kept**, so each set still carries some noise.
- **De-dup:** one MIDI per MSD track (best match score), the same MIDI matched to several tracks kept
  once, and (artist, core title) kept once. Match score ≥ 0.5. ≤ 5 songs per artist per genre.

| genre | selected | measured | artists | main evidence | note |
|---|---|---|---|---|---|
| new wave | 229 | 178 | 123 | Echo Nest 179 / Last.fm 50 | broad: Police, Cars, Devo, Blondie, Talking Heads, Simple Minds, Tears for Fears… |
| post-punk / goth | 55 | 44 | 32 | Last.fm 37 / Echo Nest 18 | ⚠ **below 50**, thin: Cure, Sisters of Mercy, New Order, Psychedelic Furs, Echo & the Bunnymen, Smiths + minor goth acts. **No Joy Division, Siouxsie, Bauhaus, Killing Joke in LMD-matched.** |
| synth-pop | 144 | 118 | 71 | Echo Nest 103 / Last.fm 41 | Soft Cell, Erasure, OMD, Depeche Mode, Pet Shop Boys, Human League, Yazoo, Ultravox, Alphaville… |
| Italo / Hi-NRG / Euro-disco | 135 | 103 | 71 | Echo Nest 127 / Last.fm 8 | mixed lineage: Italo proper (Gazebo, Ryan Paris, Den Harrow, Righeira, Spagna, Moroder) + Hi-NRG (Miquel Brown, Sinitta, Lonnie Gordon) + Euro-disco (Modern Talking, Baccara, Ottawan) |
| EBM / electro-industrial | 43 | 37 | 31 | Echo Nest 24 / Last.fm 19 | ⚠ **below 50, and MODERN**: futurepop / electro-industrial (SITD, Frozen Plasma, Assemblage 23, Covenant, Icon of Coil, Project Pitchfork). **No Front 242, Nitzer Ebb, DAF, Skinny Puppy, FLA, KMFDM in LMD-matched.** Classic 80s EBM is unmeasured. |
| synthwave | 0 | 0 | 0 | — | LMD's audio side (MSD) ends in 2011; no Kavinsky, College, Perturbator etc. See `synthwave.md`. |
| controls: rock / disco / house / techno | 400 / 477 / 248 / 163 | 291 / 367 / 202 / 136 | 222 / 244 / 176 / 121 | rock = strongest Last.fm tags | used for cross-genre discrimination |

Skip reasons (all genres): no drum part, < 50 % of bars in 4/4, a triplet/shuffle grid (drum onsets
off the straight 16th grid by ⅓), drums off-grid (unquantised with no matching tempo map), bar phase
off by a beat, < 8 groove bars, unreadable file.

## Measurement (`lmd_measure.py`)

- **Grid:** pretty_midi beat + downbeat times (tempo map and meter map). Each beat split into four
  16ths; an onset goes to the nearest 16th. Only bars of exactly four beats under 4/4 are used.
- **Groove vs fill** as in the GMD scripts (DK1): a FILL bar has a tom pattern that differs from both
  neighbours, or ≥ 3 snare hits on 9–16 (other than 13) in a bar that is not the song's modal snare
  bar. A GROOVE bar has kick or snare and is not a fill. All groove bars are the "steady section"
  (drum-less intros and breakdowns fall out by themselves).
- **Drum categories:** KICK 35/36 · SNARE 38/40 + CLAP 39 · HAT 42/44 closed/pedal + 46 open · TOM
  41/43/45/47/48/50 · CYMB crash 49/52/55/57 + ride 51/53/59 · PERC everything else (side-stick 37,
  tambourine 54, cowbell 56, 60–82). Per bar, one onset per (category, step) — the loudest.
- **Song-weighted:** each song's groove-bar mean first, then the mean over songs. Velocity numbers use
  only songs whose drums are **not flat** (> 2 distinct velocities); the flat share is reported.
- **Bass:** the GM 32–39 part with the most groove notes; else the lowest-median, mostly monophonic
  part below MIDI 55. Monophonic reduction = lowest note per onset. "Constant pulse" bar = onsets on
  exactly all 16 steps, or exactly the 8 odd steps. Octave share = consecutive notes ≤ 4 steps apart
  that move exactly 12 semitones.
- **Key:** Krumhansl–Kessler correlation on the duration-weighted pitch-class histogram of all pitched
  parts. Scale degrees and chord numerals are relative to it. ⚠ Relative-major/minor confusions are
  common with this method; treat major/minor shares as ±10 points.
- **Harmony:** half-bar windows over all pitched parts; pitch classes with ≥ 15 % of the window's
  weight; matched to triad/7th/sus/power templates. A song "uses" a chord if it labels ≥ 2 half-bars.
- **Roles** (every non-bass pitched part with ≥ 16 groove notes): ARP = monophonic, ≥ 7 onsets/bar,
  median length ≤ 1.6 steps, ≥ 3 pitch classes and ≥ 7 semitones span per bar; PAD = polyphony ≥ 1.5
  and median length ≥ 6 steps; CHORD = polyphony ≥ 1.5; LEAD = monophonic, median pitch ≥ 55.
  ⚠ **LEAD includes the vocal melody** — transcriptions put it on a GM instrument.

## Caveats that apply to every table

1. **These are transcriptions, not the records.** Hobbyist GM files simplify drums (a 16th-hat record
   is often transcribed as 8ths), move synth parts onto whatever GM patch was handy, and set velocities
   by hand or not at all. The data measures *how these songs are commonly transcribed*, which is close
   to — but not the same as — how they were programmed.
2. **Velocity is the transcriber's.** 7–26 % of files per genre are flat; in the rest, per-lane
   velocity SD is small (median 0.5–5 for kick and snare). A "dynamics" claim here is about the files.
3. **Label noise.** Tags are artist-level for 33–94 % of songs per genre; a band's whole catalogue inherits its
   genre, and unknown artists were kept. Small sets (post-punk 44, EBM 37) have wide error bars:
   ± ~10 points on any share.
4. **Tempo:** files are sometimes written at half or double time; tables give the file tempo and a
   tempo folded into 90–180.
5. **Harmony is the weakest measurement** (key estimation + half-bar windows): it separates genres
   much less than the drum and bass statistics do. Chordonomicon (D5) remains the better chord source.

## Cross-genre summary (targets + controls; from `analysis/out/summary.md`)

| genre | selected | measured | artists | flat drums | median BPM (folded) | 4otf kick | backbeat 5+13 | 16th hats | bass seq ≥ 50 % | bass oct ≥ 25 % | minor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| newwave | 229 | 178 | 123 | 15% | 128 | 22% | 62% | 9% | 18% | 7% | 30% |
| postpunk | 55 | 44 | 32 | 30% | 132 | 14% | 66% | 9% | 19% | 9% | 36% |
| synthpop | 144 | 118 | 71 | 14% | 126 | 32% | 72% | 14% | 34% | 19% | 34% |
| italo | 135 | 103 | 71 | 7% | 123 | 37% | 76% | 18% | 23% | 20% | 39% |
| ebm | 43 | 37 | 31 | 16% | 132 | 60% | 57% | 11% | 28% | 22% | 57% |
| rock | 400 | 291 | 222 | 21% | 130 | 5% | 63% | 6% | 14% | 3% | 25% |
| disco | 477 | 367 | 244 | 8% | 122 | 29% | 64% | 17% | 9% | 10% | 34% |
| house | 248 | 202 | 176 | 15% | 128 | 62% | 62% | 17% | 18% | 20% | 56% |
| techno | 163 | 136 | 121 | 15% | 130 | 65% | 65% | 12% | 18% | 21% | 60% |

| genre | kick P 5/13 | kick P 7/11 | hat hits/bar | open-hat share | hat tier (beat−off8) | clap share of snare notes | perc lane | ride share | bass notes/bar | bass len (16ths) | bass gate | bass median MIDI | bass repeat share | arp songs | synth-family songs | drum-lane vel SD kick/snare/hat |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| newwave | .32/.33 | .29/.18 | 7.6 | 0.14 | 6.4 | 0.10 | 46% | 0.26 | 5.0 | 1.88 | 0.78 | 36 | 0.44 | 12% | 28% | 4.5/4.3/11.2 |
| postpunk | .20/.17 | .42/.21 | 7.0 | 0.12 | 9.1 | 0.07 | 55% | 0.25 | 4.8 | 2.00 | 0.89 | 37 | 0.47 | 7% | 34% | 5.1/4.8/15.6 |
| synthpop | .38/.37 | .29/.18 | 7.5 | 0.18 | 5.2 | 0.09 | 48% | 0.26 | 6.0 | 1.71 | 0.83 | 36 | 0.51 | 14% | 37% | 3.9/3.2/9.6 |
| italo | .42/.43 | .24/.10 | 7.8 | 0.07 | 7.6 | 0.17 | 59% | 0.17 | 6.2 | 1.74 | 0.79 | 36 | 0.35 | 20% | 43% | 4.0/5.0/11.2 |
| ebm | .62/.62 | .17/.11 | 7.6 | 0.24 | 0.0 | 0.20 | 57% | 0.16 | 5.9 | 1.79 | 0.64 | 36 | 0.69 | 16% | 54% | 0.3/3.5/10.4 |
| rock | .13/.12 | .33/.34 | 6.5 | 0.20 | 12.6 | 0.05 | 38% | 0.41 | 4.7 | 2.00 | 0.88 | 36 | 0.42 | 8% | 19% | 6.4/5.7/12.3 |
| disco | .37/.38 | .23/.15 | 7.8 | 0.15 | 7.8 | 0.13 | 56% | 0.28 | 5.0 | 1.87 | 0.81 | 36 | 0.31 | 11% | 28% | 5.5/4.8/11.3 |
| house | .71/.71 | .11/.11 | 7.7 | 0.25 | 0.0 | 0.22 | 57% | 0.20 | 5.9 | 1.60 | 0.67 | 36 | 0.49 | 18% | 46% | 1.7/4.4/11.2 |
| techno | .75/.73 | .11/.15 | 7.3 | 0.29 | 0.0 | 0.28 | 58% | 0.20 | 6.8 | 1.26 | 0.67 | 36 | 0.49 | 17% | 53% | 1.9/4.8/7.2 |

**What separates the genres** (the measured features that move the most across rows; the drum and bass
statistics discriminate far better than harmony):

- **Kick on beats 2/4 (steps 5/13):** rock .13 → post-punk .20 → new wave .33 → synth-pop .38 →
  Italo .43 → EBM .62 → house/techno .71–.75. Step 7 (the `x.....x.x` pickup) runs the other way:
  post-punk .42, rock .33, new wave .29 … EBM .17, house .11.
- **Open-hat share:** Italo .07 (lowest of all) · post-punk .12 · new wave .14 · synth-pop .18 · rock
  .20 · EBM .24 · house .25 · techno .29. EBM/house/techno put the open hat on the off-beats.
- **Hat accent tiering** (beat − off-8th velocity): rock +12.6, post-punk +9, the 80s pop genres +5…+8,
  EBM/house/techno 0.
- **Kick velocity SD:** rock 6.4, disco 5.5, post-punk 5.1, new wave/synth-pop/Italo 3.9–4.5, house/techno ~2, EBM 0.3.
- **Bass repeated-note share:** Italo .35 and disco .31 (moving lines) vs EBM .69 (pedal).
- **No-hat songs:** post-punk 20 %, synth-pop 13 %, EBM 11 %, new wave 8 %, Italo 5 %.

**What does NOT separate them:** tempo (all targets fold to 123–132), swing (≈ 0 everywhere after the
triplet-grid files are skipped), ghost notes (≈ 0 everywhere — transcriptions have none), bass register
(median MIDI 36–37 everywhere) and the constant-pulse bass (18–34 % of songs in the targets, rock 14 %,
disco 9 % — present everywhere, a majority nowhere).

## Headline corrections to the guide notes

Detailed per-genre tables are in each genre file; the biggest disagreements:

1. **Italo does not use the open off-beat hat** in these files (7 % of hat hits, the least of any
   genre); it uses closed 8ths/16ths. Italo 4otf is 37 %, not 100 %.
2. **The sequenced 16th bass is rare everywhere** (constant-16th bars ≤ 5 % in every genre). Where a
   constant pulse exists it is 8ths (synth-pop 29 % of songs). IT-1, SP-2 and EB-1 (≥ 90 % constant
   grid / ≥ 12 onsets per bar) fail on real transcriptions.
3. **Octave bass is a ~20 % family** in synth-pop, Italo and EBM (7–9 % in new wave/post-punk), not the
   default anywhere (IT-2, SP-3).
4. **Bass is legato-ish** (gate 0.64–0.89) in every genre, not staccato (IT-4, SP gate 40–60 %).
5. **Post-punk bass is not high** (median MIDI 37; PP-1's 47–60 fails > 90 % of songs), its backbeat is
   not downplayed, and cymbals are ~1 bar in 4, not ≤ 1 in 8.
6. **New-wave hat tiering is weak** (+6), so Nw-hat-1 (≥ +25, from GMD live drummers) is too strict.
7. **Modern EBM (futurepop) is melodic** (pads 65 %, synth leads 54 %) and has open off-beat hats; its
   kick is the flattest of any genre (as the guide says).

Confirmed across the board: straight timing, no ghosts, kick almost never on even 16ths, backbeat
snare on 5/13, crash on 1 after a fill (~.5), toms nearly absent from groove bars, bVI/bVII common in
minor-key songs.

## Ingest candidates (drums only)

`ingest_candidates.md` lists single-lane loops (one drum category per phrase) with **real velocity
dynamics** — 417 after de-duplication: new wave 150, synth-pop 107, Italo 101, post-punk 35, EBM 24;
most are `accented` (same accent shape every pass). Hats and perc (tambourine/shaker 8ths and 16ths
with accent shapes) dominate; kick and snare loops with real dynamics are fewer because most
transcriptions keep those two lanes near-flat. The owner's ruling covers single-lane drum patterns
(timing + dynamics); nothing melodic is listed.
