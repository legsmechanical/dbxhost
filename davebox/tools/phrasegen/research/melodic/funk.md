# FUNK — melodic

Conventions: see `melodic/basics.md` § Conventions (16 steps/bar, 96 PPQN, 24 ticks per 16th; cell
grids use `x` onset, `=` held, `.` rest; degrees relative to the phrase tonic; storage mode `min`/`maj`
+ `acc`). `[Sn]` = `melodic/SOURCES.md` (S1–S42 are the drum/bass `SOURCES.md`); `D5` = Chordonomicon
measurement. **(proposal)** = our number. BASS is in `../funk.md` (not repeated).

## Tempo, mode, harmony

- **90–110 BPM** [S130]; "114 bpm is the funkiest tempo" with a second cluster ~94 [S159]; slower and
  more syncopated than disco [S12]. GMD funk median 100 (D1). Default 96–108.
- **Mode**: Dorian or Mixolydian colour, one- or two-chord vamps [S12]; "Most funk songs are mostly
  built on one chord" [S130]; progressions "often static" [S131]. Storage: **min + 6 as deg5 acc+1**
  (Dorian) or **maj + b7 as deg6 acc−1** (Mixolydian).
- **Chord colour**: "minor seventh chords are more common than minor triads" [S12]; E9/E7/E7#9 [S130];
  G9 ↔ G13 ↔ G7#9 swaps on one held vamp [S131].
- **Measured (D5, 857 songs tagged funk/p funk, chord sheets, no timing):** m7 = **15 %** of chord
  tokens (rock 2 %, punk 0 %), dom7 7 %, maj7+ 6 %, plain triads 63 %; commonest root motion **up a
  4th (26 %)**; 46 % of minor-proxy songs use a major IV (Dorian marker; rock 42 %, techno 12 %).

## CHORD (guitar chank / Clavinet)

### Rhythm (1 bar)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chord hit | often | some | often | some | – | often | some | often | some | often | often | some | – | often | some | often |
| muted "scratch" stroke | fill every 16th not hit (optional family) ||||||||||||||||

- Short "stabs" mixed with 16ths, "including with percussive ghost notes" [S12]; strokes alternate
  "tones with strumming on muted strings" → "scratch rhythms" [S131]; accents moved across the weak 16ths
  "'e', '&', and 'a'" [S132]; every 16th gets a stroke, most muted (snippet [S132]).
- Steps 5 and 13 left open **(proposal)**: the backbeat carries the snare; guitar/clav hits cluster on
  16th off-beats (Superstition-type clav: a "b7 … coming a sixteenth note early" [S133]).
- **Length**: very short — clav "very quick decay" (snippet [S129]); chank = pressed then "quickly
  released" [S12]. **(proposal)** gate 6–12 ticks; muted strokes 3–5 ticks.
- **Velocity (proposal)**: real hits 85–110, accented 16th off-beat hits highest; muted strokes 20–40.
- **Voicing**: 3–4 notes, rootless allowed (bass has the root) **(proposal)**; upper-structure
  degrees b3 5 b7 9 (m9) or 3 b7 9 13 (dom13). **Register (proposal)**: MIDI 55–74 (guitar middle
  strings), top voice ≤ 76.

### Canonical cells (constructed)

```
FC1 one-chord 16th chank   ..x..x.x.xx..x.x   i9 {b3 5 b7 9} all hits, L=8 ticks            [S12][S132]
FC2 chank + scratch        x.xmmxmxxmmxmxmx    hits (x) i7, m = muted stroke vel 25, L=4 ticks  [S131][S132]
FC3 two-chord Dorian vamp  x..x..x...x..x..  bar 1 i7 {R b3 5 b7}; bar 2 IV7 {4 6 R b3} (6 = min deg5 acc+1) [S12][S134]
FC4 dom9 vamp (Mixolyd.)   ..x...x.x..x..x.  I9 {3 b7 9 13}; bar 2 same with 13→9 top-note swap  [S130][S131]
FC5 stab + early push      x.........x....x   step 16 anticipates bar 2 beat 1 (held across the bar line), i7   [S133]
FC6 parallel whole-step    x..x...x..x..x.. | x..x...x..x..x..   i7 | ii7 (same shape up a tone over held bass) [S134]
```
2-bar: bar 2 repeats bar 1 with one extra 16th stab or the top-note swap; or the vamp's second chord
(FC3). Chord change **only** at bar line or on the step-16 anticipation (proposal, [S12] static vamps).

## ARP

**No idiomatic funk arpeggio** (researcher found none; repeated figures are clav/guitar/bass riffs).
**(proposal)** Do not generate FUNK×ARP; if forced, reuse the clav riff (LEAD FL3) at 16ths, R-b3-4-5
(minor pentatonic) span ≤ 1 octave, gate 30–40 %.

## LEAD (horn stabs / riffs, synth lead)

- Horns "rhythmic and syncopated", "offbeat phrases" [S12]; "staccato, machine-gun-like burst of six
  repeated notes" [S134]; "long-short" phrasing — equal lengths and "the feel evaporates" [S134];
  voiced as "harmonies underneath a top line" [S134]; Superstition = "two-bar clavinet riff on the
  E-flat minor pentatonic scale" [S133]; Minimoog lead/bass lineage (Worrell's "Flash Light") [S241].
- **Pitch**: minor pentatonic (R b3 4 5 b7) + b5/3 as blues passing notes **(proposal, from [S133]
  pentatonic + [S12] Dorian/Mixolydian)**; horn phrases ≤ 1 octave per 2 bars (proposal).
- **Rhythm density (proposal)**: 4–9 notes per bar; ≥ 50 % of onsets on 16th/8th off-beats.
- **Register**: lead anchor 72; trumpet-like top MIDI 67–84 (proposal).

```
FL1 machine-gun burst       xxxxxx.....x=...   6× R (L=1, vel 100 flat) then 5 long on 12 (L=2)   [S134]
FL2 long-short pair         ..x==..x......x.   b7 (L=3, vel 95) R (L=1, vel 110) … b3 (L=1)       [S134]
FL3 pentatonic 2-bar riff   x..x..x...x..x.x | x..x..x....x...x   R b3 4 5 b7 5 b3 | R b3 4 b3 R(16 = anticipation) [S133]
FL4 horn stab answers       .....x.x.....x..   5+b7 dyad stabs on 16th off-beats 6/8/14 (never on 5/13) (proposal)
```

## PAD

**No idiomatic pad** — only the "Hammond B-3 organ is used in funk" [S12]. **(proposal)** organ-style
sustained i7 (or I7) held the full 2 bars (static vamp [S12][S131]), 4 notes, width ≤ 12 st, vel 60–75,
re-strike allowed on step 16 of bar 2 (anticipation).

## NOT funk (melodic)

- Major-7 tonic colour or Ionian resolution (funk implies b7) [S12]; chord changes every 2 beats.
- Long sustained chord stabs on every downbeat; no 16th off-beat hits; equal-length horn notes [S134].
- Hits on the snare backbeat (5, 13) as the loudest chord events (proposal).
- Arpeggiator-style continuous up/down patterns; dense key changes; wide pad voicings > 2 octaves.
