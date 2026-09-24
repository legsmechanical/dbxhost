# Reference statistics from real song MIDI — every public style and its flavours

**Statistics only.** Nothing in this folder is a note sequence: no per-song note list, melody, riff or
pattern that could reproduce a song. Per-song rows (`songs.csv`) carry artist, title and *derived*
facts (key, mode, tempo, which parts exist). Everything else is an aggregate over songs: step-occupancy
probabilities, quartiles, histograms, shares, and roman-numeral loop families. The one exception kept
from `research/lmd` is the *share of songs* whose modal drum-lane bar is a given 16-step onset string
(single-lane drum patterns, owner ruling), reported only as a cross-song share.

| file | what |
|---|---|
| `<style>.md` | one per public style: findings, progressions, **generator targets** per part, era split, and a **Flavours** section (per-flavour deltas, loops and targets) |
| `stats/<style>.json` | machine-readable targets keyed by part (+ `flavours` block, `eras_split`, `harmony.chord_sheets`) |
| `songs.csv`, `songs.json` | every measured song: style, flavour, artist, title, era, source, tonic, mode (incl. modal lean), key confidence, BPM, tempo map, time signature, parts found |
| `analysis/out/<group>_tables.md` | the full tables for every group (styles *and* flavours) and the song list per group |
| `analysis/out/summary.md`, `counts.json`, `chord_sheet_loops.json` | cross-group summary, song counts, chord-sheet loop families |
| `analysis/*.py`, `analysis/prose.json` | the pipeline (runnable against the cache) and the hand-written findings the write-up splices in |

## Taxonomy (owner, 2026-09-23)

Public styles: HOUSE TECHNO TRANCE ELECTRO DARKSYN DISCO FUNK DNB BREAKS HIPHOP RNB GARAGE ACID REGGAE
AMBIENT HARDCORE ROCK INDIE METAL PUNK NEW WAVE ITALO POP LATIN JAZZ COUNTRY, plus genre-less BASICS.
Flavours are measured as their own group and filed under a parent (`refs_genres.FLAVOUR_OF`):

NEW WAVE ← post punk, goth, darkwave, synthwave · DARKSYN ← EBM, industrial, darksynth (DARKSYN has no
songs of its own; its stats are the union of the three) · POP ← synthpop, kpop, jpop, city pop, hyperpop
· RNB ← soul, neo soul · INDIE ← alt, shoegaze, dream pop, grunge · REGGAE ← dub, dancehall, ska ·
LATIN ← reggaeton, salsa, bossa, cumbia · JAZZ ← swing, bebop, jazz funk · COUNTRY ← folk, bluegrass ·
HIPHOP ← trap, lofi, boom bap · DNB ← jungle · ROCK ← blues.

A parent's own statistics exclude its flavours' songs. Each flavour appears in the parent JSON as
`flavours.<name>` = `{songs, sources, distinctive[], deltas{metric:{flavour,parent,delta}},
step_onset_prob_delta{part:[16]}, progression_ngrams, chord_sheets, distinctness, targets}` where
`targets` is the flavour's full target block (same shape as the parent's), so a generator can give the
flavour a large share of the parent and still hit the flavour's own numbers. Flavours with < 5 measured
songs carry no deltas (only chord-sheet data).

## Song counts (measured = passed the grid tests)

| style | measured songs | artists | sources | flavours (measured songs) |
|---|---|---|---|---|
| house | 119 | 96 | lmd 96, lamd 23 | — |
| techno | 98 | 83 | lmd 94, lamd 4 | — |
| trance | 127 | 101 | lmd 113, lamd 14 | — |
| electro | 68 | 54 | lmd 61, lamd 7 | — |
| darksyn | 63 | 36 | lmd 43, lamd 17, freemidi 3 | ebm (8), industrial (52), darksynth (3) |
| disco | 121 | 93 | lmd 112, lamd 9 | — |
| funk | 111 | 86 | lmd 96, lamd 15 | — |
| dnb | 10 | 7 | lmd 10 | jungle (1) |
| breaks | 52 | 33 | freemidi 14, lmd 25, lamd 13 | — |
| hiphop | 111 | 84 | lmd 111 | trap (21), lofi (4), boombap (27) |
| rnb | 101 | 75 | lmd 101 | soul (98), neosoul (23) |
| garage | 36 | 18 | lmd 26, freemidi 6, lamd 4 | — |
| acid | 13 | 9 | lmd 11, freemidi 2 | — |
| reggae | 90 | 63 | lmd 76, lamd 14 | dub (14), dancehall (44), ska (54) |
| ambient | 61 | 49 | lmd 53, lamd 8 | — |
| hardcore | 38 | 25 | lamd 12, lmd 25, freemidi 1 | — |
| rock | 162 | 118 | lmd 162 | blues (89) |
| indie | 160 | 132 | lmd 160 | alt (112), shoegaze (11), dreampop (12), grunge (69) |
| metal | 169 | 124 | lmd 169 | — |
| punk | 161 | 105 | lmd 126, lamd 35 | — |
| newwave | 172 | 130 | lmd 155, lamd 17 | postpunk (92), goth (22), darkwave (36), synthwave (12) |
| italo | 110 | 86 | lmd 87, lamd 23 | — |
| pop | 141 | 106 | lmd 141 | synthpop (149), kpop (0), jpop (5), citypop (0), hyperpop (0) |
| latin | 145 | 104 | lmd 145 | reggaeton (21), salsa (58), bossa (54), cumbia (4) |
| jazz | 130 | 98 | lmd 130 | swing (37), bebop (3), jazzfunk (16) |
| country | 150 | 115 | lmd 150 | folk (102), bluegrass (54) |
| basics | 3963 | 2814 | all | — |

3,963 songs in total (LMD 3,633 · LAMD 272 · freemidi 58). Era splits (≤ 1995 vs ≥ 2000) are reported
wherever both halves have ≥ 12 songs (e.g. new wave 108/31, rock 100/23, punk 32/72, metal 36/71).

## Sources and terms

| source | used for | licence / terms |
|---|---|---|
| **Lakh MIDI Dataset, LMD-matched** (Raffel 2016) + MSD metadata (`lmd_matched_h5`) + MSD Last.fm tags — the download and metadata table built for `research/lmd` (`~/phrasegen-cache/lmd`) | 92 % of the songs; genre selection by tags and curated artist lists | LMD **CC BY 4.0** (cite colinraffel.com/projects/lmd). The files are hobbyist transcriptions of commercial songs: statistics only. MSD metadata: free for research. **Last.fm tags: research-only, non-commercial** — used only to *select* songs; no tag data is published here. |
| **Los Angeles MIDI Dataset v4.0** (Hugging Face `projectlosangeles/Los-Angeles-MIDI-Dataset`, 9.2 GB zip, retrieved 2026-09-23) | songs outside LMD-matched, matched to the curated artist lists through the files' own text events (title / copyright / track name) | **CC BY-NC-SA 4.0**. Statistics only. File names are hashes, so titles are not recorded (`songs.csv` leaves them blank); the raw text events stay in the cache because they can hold transcribers' names and e-mails. |
| **freemidi.org** (artist pages → download pages, retrieved 2026-09-23) | thin groups only (goth, post-punk, industrial/EBM, breaks, garage, acid, hardcore) | robots.txt: `User-agent: * / Allow: /`. Fetched at ≤ 1 request / 2.5 s (the site answered HTTP 429 at ~1/s) with a 60 s back-off; manifest with URL + date per file in the cache. The first N songs of each artist page (alphabetical), not a curated "best known" pick. |
| **Chordonomicon v2** (Hugging Face `ailsntua/Chordonomicon`, 264 MB CSV) — already reference source D5 of `research/melodic` | a second, much larger source for the **roman-numeral loop families** (chord sheets, no timing) — `harmony.chord_sheets` in every JSON | **CC BY-NC 4.0 → reference only**: aggregates only. |
| skipped | bitmidi.com (robots.txt disallows `/uploads/`, where the MIDI files are served); hooktheory.com (robots.txt disallows AI crawlers by name); onlinesequencer.net (MIDI export under the disallowed `/app/`); musescore (login-gated) | — |

Nothing downloaded lives in the repo: caches are in `~/phrasegen-cache/refs` (LAMD zip, extracted
LAMD matches, freemidi files + `manifest.jsonl`, Chordonomicon CSV, candidate lists, `selection.json`,
per-song `songs.jsonl`) and `~/phrasegen-cache/lmd` (LMD and its metadata).

## Pipeline (reproduce)

```sh
C=~/phrasegen-cache/refs; PY=~/phrasegen-cache/lmd/venv/bin/python; cd analysis
$PY refs_select_lmd.py ~/phrasegen-cache/lmd/meta.json $C/cand_lmd.json      # LMD by tags + artist lists
$PY refs_lamd_scan.py $C/lamd/LAMD-4.0.zip $C/lamd_matches.jsonl              # ~1.5 min over 404,714 files
$PY refs_freemidi.py search $C/freemidi && $PY refs_freemidi.py fetch $C/freemidi   # slow by design
$PY refs_build_selection.py $C                                                 # merge, de-dup, cap -> selection.json
$PY -W ignore refs_measure.py $C/selection.json $C/songs.jsonl 5               # ~5 min, 5 workers
$PY refs_chordonomicon.py $C/chordonomicon/chordonomicon_v2.csv $C/chordonomicon_stats.json   # ~4 min
$PY refs_report.py $C/songs.jsonl .. $C/chordonomicon_stats.json                # stats/, analysis/out/, songs.csv
$PY refs_writeup.py ..                                                         # <style>.md (+ prose.json)
```

`refs_genres.py` holds every selection decision: tag terms, curated artist lists (with era tags),
`PRIMARY` (one genre per multi-listed artist), `EXCL`/`SCREEN` (tag collisions removed by hand —
gothic metal out of goth, 60s garage rock out of UK garage, industrial rock out of EBM…),
`PRECEDENCE` (flavours claim a song before their parents), caps (≤ 5 songs per artist, ≤ 8 for thin
groups; 60–150 songs per group, taken round-robin across artists).

## Method

- **Selection.** LMD: a curated artist name (strength 1), a Last.fm track tag ≥ 20, or an Echo Nest
  top-4 artist term ≥ .7 that is corroborated by the artist's MusicBrainz tags or the track's Last.fm
  tags (broad song styles may skip corroboration when the term is the artist's #1/#2 at ≥ .85); tag
  evidence is era-windowed. LAMD: the artist name must stand in a short title/credit line among the
  first 16 text events; short or common names (≤ 6 letters or a word like *Desire*, *Culture*,
  *Koto*) must *be* the line or the artist half of "artist – title"; game-music rips are dropped;
  names that still collided were blocked (`BLOCK`). Duplicates: same file md5 across sources, then
  (artist, title).
- **Grid.** `research/lmd/analysis/lmd_measure.Grid`: pretty_midi beats + downbeats, only bars of
  exactly four beats in 4/4; onsets snapped to the 16th grid. Skipped: < 50 % 4/4 bars, tempo
  outside 60–200, or pitched onsets off the straight grid (median |dev| > .15 of a 16th, or ≥ 25 %
  near triplet positions) — **so swung and shuffled songs are excluded** (see weak spots).
- **Drums**: `lmd_measure.measure()` unchanged (groove vs fill bars, kick/snare/hat/tom/perc/cymb,
  per-step probabilities, velocities, families). Its drum-lane loops are discarded.
- **Parts** (`refs_measure.classify`): track name first (bass, arp, seq, vocal/melody/lead, pad/
  strings/choir, guitar, piano/organ/keys, fx), then GM program, then behaviour (monophonic + ≥ 6
  onsets/bar + short notes → **seq**, and **arp** if it also spans ≥ 7 semitones over ≥ 3 pitch
  classes per bar; polyphonic + notes ≥ 6 16ths → **pad**, else **chord**). Piano/organ that plays a
  monophonic line above MIDI 58 is a **lead** — in hobbyist files that is usually the **vocal
  melody**, so "lead" statistics are largely *sung-melody* statistics. One bass per song (GM bass
  program, else the lowest mostly-monophonic part below MIDI 50).
- **Key.** Krumhansl–Kessler on the duration-weighted pitch-class histogram of the harmonic parts
  (lead excluded); the relative major/minor is then decided by where the bass sits on downbeats. The
  modal lean in `songs.csv` (dorian/phrygian/mixolydian/lydian) = the mode-defining degree outweighs
  the plain one ≥ 1.5× and holds ≥ 4 % of the pitch mass. Key-signature events were checked where
  present and not the C-major default (see each `_tables.md` header).
- **Transposition.** Every degree is semitones above the tonic, i.e. the song in C major / C minor;
  registers are reported after the smaller transposition (−6…+5).
- **Per part**: onsets per active bar, per-step onset probability, Longuet-Higgins–Lee syncopation,
  off-16th share, note length (16ths) and gate (length ÷ gap to the next onset), velocity mean/SD and
  per-step accent (non-flat files only), degree shares by mode, melodic intervals (lowest voice for
  bass, top voice otherwise), register quartiles, chord voicing (voices, spread, inversion share,
  changes per bar, qualities), arp shape (up/down/up-down/random per bar, spacing, octave span), and
  **repetition**: in aligned 8-bar windows where the part plays every bar, is it a 1-, 2- or 4-bar
  loop, or longer — once on pitches+rhythm, once on rhythm only.
- **Progressions.** Half-bar chord windows from bass + chord/pad/keys/guitar/arp/seq (pitch classes
  with ≥ 15 % of the window), mode-relative numerals (minor: III VI VII = b3 b6 b7), power/sus chords
  named as the diatonic triad, repeats collapsed, 4-grams folded into **rotation families** (a 4-gram
  whose ends meet is a 3-chord loop, a-b-a-b a 2-chord loop). Reported as the share of songs whose
  windows contain the loop ≥ 2×. The same folding is applied to Chordonomicon chord sheets.
- **Aggregation is song-weighted**: per-song statistic first, then quartiles / means across songs.
  Generator targets are the median with the inter-quartile range as the tolerance.
- **Flavour deltas**: every metric of `refs_report.profile()` for flavour and parent; "distinctive" =
  |delta| ≥ 1 unit (10 BPM, 6 semitones, 2 onsets/hits or 0.15 of a share); part-shape metrics only
  when ≥ 5 songs and ≥ 30 % of both groups have that part.

## Sanity checks — known positives before trusting a negative

| check | expected | measured | verdict |
|---|---|---|---|
| house kick four-on-the-floor | high | **63 %** of songs (rock 4.5 %, country 9 %) | ✅ |
| trance tempo | ~130–140 | p50 **133** (p10–p90 120–140) | ✅ |
| acid bass density | 16th 303 line | **10 onsets/bar**, the densest bass measured | ✅ |
| rock kick | 1 + 3 backbeat kick | '1 + 9 only' **67 %**, 4otf 4.5 % | ✅ |
| country mode | major | minor **4 %** (chord sheets 11 %) | ✅ |
| reggae / ska guitar skank | off-beats | guitar P ≥ .5 on steps 3, 7, 11, 15 in both | ✅ |
| synthwave minor share | high | **67 %** (12 files); 111 synthwave chord sheets: i–VI–VII 14 %, i–VII–VI–VII 12 % | ✅ (thin) |
| i–VI–III–VII family in the dark/guitar styles | common | punk minor songs 15 %, post-punk i–III–VI–VII 15 %, alt 17 %; goth sheets i–VI 8 %, metal sheets i–VI–VII 12 % | ✅ |
| swing ride | ride-led, no hat | ride 67 % of cymbal hits, no hat in 31 % | ✅ |
| **dnb tempo** | ~170 | file BPM p50 **114**; only 2 of 10 files at 170–174 | ❌ **failed** — the dnb MIDI set is not usable (half-time and mislabelled files). Use `research/drums/dnb.md`. |

## Weak spots — read before using a number

1. **Transcriptions, not records.** Hobbyist GM files simplify drums, put synth parts on whatever
   patch was handy, and set velocities by hand or not at all (flat-velocity files: 5–42 % per style).
   "Lead" is mostly the sung melody.
2. **Missing modern electronic material.** Modern synthwave, darksynth, darkwave/coldwave revival,
   classic EBM, drum & bass/jungle, gabber, k-pop, city pop and hyperpop are essentially **absent**
   from every MIDI source used (LMD's audio side ends in 2011; LAMD/freemidi carry almost none). Those
   flavours are thin (0–12 songs) and their MIDI numbers are anecdotal; for their harmony rely on the
   chord-sheet loops. Synthwave's 12 files are mostly 80s film/TV synth (Faltermeyer, Jan Hammer);
   DARKSYN is 52/63 industrial rock/metal (NIN, Rammstein, Ministry, KMFDM).
3. **Swing is filtered out.** The straight-16th grid test drops triplet/shuffle files, so JAZZ and
   SWING describe the straight-feel survivors (swing: 37 of 76 selected), and blues/shuffle rock is
   under-represented.
4. **Label noise.** Tag evidence is artist-level for most songs; unknown artists were kept; LAMD
   matches are ~10–20 % mislabelled on inspection (covers, same-name artists). Darkwave is dominated
   by French pop (Mylène Farmer, Indochine) and German gothic acts; AMBIENT is mostly new-age /
   instrumental synth; GARAGE is mostly vocal UK garage; SOUL ≈ RNB and ALT ≈ INDIE in these files
   (distinctness ≈ .2–.3).
5. **Part detection is heuristic.** Arp vs seq vs lead is decided by behaviour; a guitar part named
   "Lead" is a guitar; piano doubling the vocal becomes lead. Presence shares are therefore ±10 points.
6. **Key/mode.** KK + bass disambiguation still confuses relative keys in some songs; treat
   major/minor shares as ±10 points and the modal leans (esp. phrygian) as leans, not labels.
7. **Repetition shares are strict.** "1-bar loop" requires eight identical bars (pitches and steps); a
   bass that repeats its rhythm but follows chord roots scores as rhythm-loop, not pitch-loop — use
   both columns.
8. **Tempo.** Files are sometimes written at half or double time; the tables give file BPM and a
   tempo folded into 85–180 (so a 170 dnb file written at 85 stays 85 and a 70-BPM ballad becomes 140).

## Relation to existing research

`research/lmd` measured drums/bass/roles for new wave, post-punk, synth-pop, Italo, EBM + controls;
this folder re-uses its data, grid and drum code, extends the selection to every public style,
measures every melodic part, and adds progressions, repetition and flavour deltas. Where the two
overlap the drum numbers agree within the stated noise (e.g. house 4otf .62 there, .63 here).
