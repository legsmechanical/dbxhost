# MELODIC BASICS — conventions + genre-less "bread and butter" archetypes

`[Sn]` = `melodic/SOURCES.md` (S1–S42 = parent `../SOURCES.md`). `D4` ComMU, `D5` Chordonomicon, `D6`
McGill Billboard = our measurements (scripts in `melodic/analysis/`). **(proposal)** = ours. Bass
archetypes are in `../basics.md` (B1–B7) and are not repeated.

## Conventions (all melodic genre files)

- **Grid**: 16 steps/bar, step 1 = downbeat, 1/5/9/13 beats, 3/7/11/15 8th off-beats, even steps 16th
  off-beats. 96 PPQN → 16th = 24 ticks. A 2-bar cell is written `bar1 | bar2`; `same` = repeat bar 1.
- **Cell symbols**: `x` onset, `=` the previous note/chord still held, `.` rest, `g` ghost (low-velocity,
  short), `m` muted stroke (chord at vel 20–40, 3–5 ticks). Degrees under a cell are listed in onset
  order; `…` = continue the pattern.
- **Degrees** are relative to the phrase tonic: `R 2 b3 3 4 #4 5 b6 6 b7 7`, `8` = octave, `'` = one octave
  up, `''` two up, `↓` one down. Chords: roman numerals relative to the **major** scale (bIII, bVI, bVII are
  the Aeolian chords), lowercase = minor, `{…}` = the chord's degrees. Quotes from minor-key sources that
  write VI/III/VII mean bVI/bIII/bVII.
- **Storage** (`lib/phrase.mjs`: `deg` 0–6 in mode `maj`/`min`, `oct`, `acc`):

| want | mode | how |
|---|---|---|
| Ionian (major) | `maj` | as is |
| Mixolydian | `maj` | b7 = deg 6, acc −1 |
| Aeolian (natural minor) | `min` | as is |
| Dorian | `min` | 6 = deg 5, acc +1 |
| Phrygian | `min` | b2 = deg 1, acc −1 |
| harmonic minor | `min` | 7 = deg 6, acc +1 |
| minor/major pentatonic | `min` / `maj` | subset {0,2,3,4,6} / {0,1,2,4,5} |
| borrowed bIII / bVI / bVII in a major phrase | `maj` | deg 2 / 5 / 6, acc −1 |

- **Anchors** (`ANCHOR` in `lib/phrase.mjs`): bass 36, chord/arp/pad 60, lead 72; MIDI ranges in the genre
  files translate to `oct` offsets from these.
- **Parallel ("chord-memory") chords** deliberately leave the scale: store every voice as degree + `acc`
  relative to the phrase tonic, never re-snapped to the scale.

## Measured archetype data

### D4 — ComMU role statistics (11,144 composed MIDI samples, 4/4 non-triplet; cinematic/new-age; all in C major or A minor; **REFERENCE ONLY**, CC BY-NC-SA)

| role (samples, bars) | notes/bar median | P(onset) beats 1/5/9/13 | P 8th off (3/7/11/15) | P 16th off (mean) | median length (steps) | median MIDI (p10–p90) | notes per onset | vel median |
|---|---|---|---|---|---|---|---|---|
| main_melody (2301, 16,785) | 4.6 | .85/.35/.59/.49 | .17/.33/.17/.29 | .05 | 2.1 | 76 (65–88) | 1.55* | 64 |
| sub_melody (1798, 11,988) | 2.0 | .74/.19/.44/.28 | .04/.08/.06/.09 | .01 | 4.0 | 72 (57–86) | 1.38* | 58 |
| riff (961, 6,576) | 13.1 | .91/.83/.87/.86 | .79/.81/.75/.76 | .47 | 1.0 | 74 (57–86) | 1.24 | 86 |
| accompaniment (1902, 13,068) | 9.0 | .98/.76/.78/.70 | .67/.68/.51/.50 | .16 | 2.0 | 60 (48–71) | 1.66 | 66 |
| pad (1635, 10,673) | 4.0 | .89/.03/.22/.04 | ≤ .02 | ≤ .02 | 16.0 | 62 (48–79) | 2.84 | 57 |
| bass (389, 2,700) | 1.4 | .84/.06/.23/.15 | ≤ .08 | ≤ .04 | 6.1 | 43 (33–55) | 1.26 | 82 |

\* melody doubling at the octave (voicing width median 12) — the top voice is the line.

| role | top-voice |interval|: repeat / 1–2 st / 3–4 st / ≥ 5 st | 2-bar range median (p10–p90) | top voice = chord tone on beats / on 16th off-beats | pad/acc voicing width median (p10–p90) |
|---|---|---|---|---|
| main_melody | .07 / **.48** / .23 / .23 | **8 st** (4–12) | **.83** / .60 | – |
| sub_melody | .05 / .40 / .26 / .30 | 6 (1–11) | .89 / .77 | – |
| riff (arp-like) | .10 / .13 / **.33** / **.44** | 12 (5–17) | .94 / .88 | – |
| accompaniment | .16 / .09 / .24 / .52 | 14 (3–24) | .95 / .92 | 12 (4–24) |
| pad | **.26** / .37 / .17 / .21 | 2 (0–8) | .97 / .94 | **16 (8–28)** |

- Degree distribution (main_melody, major): R .21, 5 .16, 3 .16, 2 .14, 6 .11, 4 .10, 7 .10 — chromatic
  < 2 %; minor: b3 .20, 5 .18, R .17, 2 .12, 4 .11, b7 .10, b6 .06, 7 (harmonic minor) .02.
- Up/down balance of melody intervals 47/47 %; leaps ≥ 5 st are up 53 % of the time.
- Harmonic rhythm inside ComMU: median 1.75 changes per 2 bars (≈ one chord per bar); chord changes on the
  downbeat 74 %, on beat 3 22 % (melody samples; pad samples 86 % / 13 %).
- Pad onset at step 1 in 89 % of bars, re-attack on beat 3 in 22 %; 88 % of pad notes ≥ 8 steps.

⚠ ComMU is cinematic/new-age, 80 BPM median — use it for **role shape** (how a pad differs from a riff),
not for dance-genre rhythm.

### D6 — McGill Billboard harmonic rhythm (831 songs, 82,037 4/4 bars, US charts 1958–91; CC0)

- Chord **onsets per bar**: 0 (held over) 25.9 %, **1: 51.3 %**, 2: 19.6 %, 3: 2.6 %, 4: 0.5 %.
- Where changes fall: **beat 1 71 %**, beat 3 22 %, beat 4 4.7 %, beat 2 2.4 %.
- **Distinct chords per 2-bar window**: 1: 32 %, **2: 41 %**, 3: 18 %, 4: 8 %, ≥ 5: 2 %.
- Chord vocabulary (by change): maj 56 %, min 12 %, min7 8 %, 7 8 %, sus4 3.5 %, maj7 3 %, power ("5")
  2 %; roots vs annotated tonic: I 24 %, IV 18 %, V 16 %, **bVII 6.5 %**, i 5.6 %, vi 4.8 %, ii 4.5 %,
  bVI 3.8 % — agrees with the rock corpus [S204] (I .33, IV .23, V .16, bVII .08).
- Published: five chord types = 85.7 % of Billboard chords (snippet [S260]).

## CHORD — archetypes

- Voicing: close position "the most compact"; open wider; "a drop-2 voicing lowers the second voice by an
  octave" [S261]. Voice leading: "avoid leaps and retain common tones", lines "primarily conjunct"; much
  pop treats chords "as blocks" [S262]. Rock: 94.1 % root position [S204].
- Comping: "a chord on every beat" (traditional) and the **Charleston** "commonly used in comping" [S263] =
  first two strokes of the tresillo [S264] → **steps 1 and 7** (our derivation). Half-time: "only beats one
  and three … played solidly" [S265].
- Progressions (Hooktheory [S257], songs): I–V–vi–IV 1,385; V/6–vi 932; bVII–I 580; I–vi–IV–V 542; IV–bIV–I
  503; vi–V–IV–V 377; I–V–IV–V 376; I–IV–vi–V 350. Of songs with I, IV, vi: "55% are followed by 'V'"
  (snippet [S259]). Rock trigrams into I: IV–V–I, V–IV–I, bVII–IV–I [S204].

```
CB1 whole-bar block      x=============== | x===============   I | IV  (root position, 3–4 notes)     [S262][D6]
CB2 half-bar             x=======x======= | x=======x=======   I V | vi IV                              [S257][D6]
CB3 quarter pulse        x...x...x...x... | same   I (one chord per bar), L=3 steps                    [S263]
CB4 8th pulse            x.x.x.x.x.x.x.x. | same   I | IV, L=1.5 steps                                  (proposal)
CB5 Charleston           x.....x......... | x.....x.........   I | IV (L=2 each)                        [S263][S264]
CB6 off-beat 8ths        ..x...x...x...x. | same   I (L=1)                                              (proposal, dance)
CB7 anticipated change   x===========..x= | ================   I … IV pushed to step 15/16 of bar 1     (proposal, [D6] beat-4 changes 4.7 %)
```
**(proposal)** defaults: 3–4 voices, width 7–16 st (D4 accompaniment median 12), top voice moves ≤ 2 st
per change (common tones [S262]), change on the bar line (71 % [D6]) or beat 3 (22 %).

## ARP — archetypes

- Modes: Jupiter-8 **UP, DOWN, U&D** ("the last note of UP is the first note of DOWN" = endpoints not
  repeated), **RND**; **RANGE 1–4** octaves [S250]; Juno-60 Up / Up&Down / Down, range 1/2/3 (snippet
  [S251]); Logic Up&Down with endpoints **repeated**, Outside-in, Random, As Played, range 1–4 (snippet
  [S255]); Ableton Up, Down, Converge, Diverge, Play Order, Chord Trigger, Random / Random Other / Random
  Once; **Gate = % of the rate, > 100 % overlaps (legato)**; Steps + Distance for octaves [S254];
  Wikipedia: "speed, range and mode" [S256].
- D4 `riff` role (the closest arp-like role): 13 notes/bar, 59 % of notes 1 step long, onset on every 8th
  75–91 % and every 16th off-beat ~47 %, top-voice intervals mostly 3–5 st (thirds/fourths = broken
  chords), chord tone on beats 94 %.
- **(proposal)** rates 1/16 (default), 1/8, 1/16T (store as 32-tick spacing); gate 50 % default; flat
  velocity with a +10 accent on each beat's first note; one chord per bar.

```
AB1 up 1 oct 16ths          xxxxxxxxxxxxxxxx   R 3 5 R' (triad + octave), repeat          [S250]
AB2 down                    xxxxxxxxxxxxxxxx   R' 5 3 R                                    [S250]
AB3 up/down exclusive       xxxxxxxxxxxxxxxx   R 3 5 R' 5 3 | R 3 …  (6-note cycle)       [S250]
AB4 up/down inclusive       xxxxxxxxxxxxxxxx   R 3 5 R' R' 5 3 R  (8-note cycle)           [S255]
AB5 up 2 octaves            xxxxxxxxxxxxxxxx   R 3 5 R' 3' 5' R'' 5' …                     [S250][S254]
AB6 random (seeded, fixed)  xxxxxxxxxxxxxxxx   fixed random order of the chord tones       [S250][S254]
AB7 converge / outside-in   xxxxxxxxxxxxxxxx   R R' 3 5 | …                                 [S254][S255]
AB8 8ths                    x.x.x.x.x.x.x.x.   R 3 5 R' …                                   (proposal)
AB9 chord trigger 16ths     xxxxxxxxxxxxxxxx   whole chord re-struck each step, gate 30 % [S254]
```

## LEAD — archetypes and melody statistics

- Intervals: "larger intervals are generally less frequent than smaller ones"; "whole steps … more than twice
  as common as half steps"; **step inertia** — "43.1% of steps are followed by a same-direction step, but only
  18.3% by a different-direction step"; "steps are more likely to be descending and skips are more likely to
  be ascending" [S267]; interval frequency "peaked at 2 semitones" (snippet [S268]); "successive pitches …
  tend to be proximal"; regression to the middle of the range after extremes; listeners expect "post-skip
  reversal" [S269]; "undulating and descending melodies are far more common than ascending" [S253].
- Chord tones on strong beats: non-chord tones are "elaborations of the chord-tones" that "resolve by step"
  [S252]; accented vs unaccented; "unaccented is more common" for neighbours [S270][S271]. **D4 measured:
  83 % of melody beat-onsets are chord tones, 60 % of 16th-off-beat onsets.** Rock loosens this (pentatonic
  "divorce" [S252]).
- Rock melody degrees: 1 then 5 most frequent; b7 > 7; pentatonic union common [S211]. D4: R/5/3 top three.
- D4 main_melody: 4.6 notes/bar, 48 % steps / 23 % 3rds / 23 % leaps ≥ 4th, **2-bar range median 8 st
  (p10 4, p90 12)**, onset on step 1 in 85 % of bars.
- **(proposal)** lead defaults: 3–8 notes/bar; ≥ 45 % steps; ≤ 25 % leaps ≥ 5 st, each followed by a
  direction change 60 %+ of the time; ≥ 75 % chord tones on beats; 2-bar range 5–12 st; bar 2 = bar 1
  repeated with a changed ending (call/response) or a varied answer.

```
LB1 call + changed ending    x.x.x...x.x.x=== | x.x.x...x.x.x===   R 2 3 5 3 2 | R 2 3 5 3 R          (proposal, [S197] generalised)
LB2 arch                     x.x.x.x.x===.... | x.x.x.x.x=======   3 4 5 6 5 | 4 3 2 3 R                ([S267][S253] proposal)
LB3 pentatonic riff          x..x..x.x....... | same                R b3 4 5 (minor pent.)               [S212]
LB4 long-short hook          x==x..x=====.... | x==x..x=========   5 6 R' | 5 6 5                        (proposal)
LB5 question/answer on 5→R   x...x...x=====.. | x...x...x=======   R 3 5 | 4 2 R                         ([S124] A/B, generalised)
```

## PAD — archetypes

- "A sustained background synthesizer sound … (it typically has a slow attack)" [S265]; harmonic rhythm
  "the rate at which the chords change"; one change per measure is the steady case, "strong rhythmic
  placement … (especially downbeat)" [S266].
- D4 pad: onset step 1 89 %, beat 3 22 %; median length 16 steps; 2.84 notes per onset (4 most common);
  **width median 16 st (p10 8, p90 28)**; top voice repeats 26 % / moves ≤ 2 st 37 % (common-tone
  voice leading); chord tone on beats 97 %.
- **(proposal)** 1 chord per bar or per 2 bars; 3–5 voices; width 12–24 st; top voice ≤ 2 st per change;
  vel 50–75 flat; restrike only at chord changes.

```
PB1 one chord, 2 bars    x=============== | ================   I (held)            [S265][D4]
PB2 one per bar          x=============== | x===============   I | IV              [S266][D4]
PB3 half-bar move        x=======x======= | x===============   I vi | IV          [D6][D4]
PB4 common-tone pad      x=============== | x===============   i {R 5 R' b3'} | bVI {… R' b3' kept}  [S262]
```

## NOT a basic (anti-patterns)

- Arp orders that are not one of the named modes (a "random" arp must be fixed per phrase).
- Chord voicings > 3 octaves or with ≥ 3 voices below MIDI 48 (mud) (proposal).
- Pads with onsets off the bar line/beat 3 or notes shorter than 1 beat.
- Leads with > 35 % leaps, or with no repetition across 2 bars (D4 / [S267]).
