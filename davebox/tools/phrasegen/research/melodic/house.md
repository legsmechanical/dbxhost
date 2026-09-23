# HOUSE — melodic (chord / arp / lead / pad)

Conventions: `melodic/basics.md` § Conventions. BASS is in `../house.md` (measured, D2). `[Sn]` =
`melodic/SOURCES.md`; `D5` = Chordonomicon. **(proposal)** = ours.

## Tempo, mode, harmony

- **115–130 BPM** [S10]; deep house 110–125 [S156]; Chicago "Move Your Body" 122 [S157]; tech house
  130 in NI's walkthrough [S155]. Default 120–126.
- **Deep house**: "one of the trademark characteristics of deep house is its use of jazz-influenced
  minor and major 7 chords" [S145]; "minor 7th and minor 9th chords" for house/garage [S146]; Kerri
  Chandler-style loops are often **two chords** with "stabs keep the energy going" [S147]; "Rain uses
  a 2-5 pattern", voicings with "sevenths, ninths, 13ths and even #11ths" [S148].
- **Main-room/Aeolian**: the VI chord "so often provides the anticipation and 'lifting' feel" [S152].
- **Measured (D5, 561 songs tagged house/deep/tech/acid/chicago):** the chord-sheet corpus is dominated
  by vocal/pop house: m7 only **4 %**, maj7+ 2 % (disco 13 % / 6 %); 34 % minor-proxy songs; in minor
  songs bVII (15 %), bVI (14 %), bIII (12 %) are the commonest non-tonic roots; 44 % of sections use
  exactly 4 distinct chords. ⇒ two house families: **deep/jazzy** (7th/9th stabs, 1–2 chords, guide
  sources) and **main-room/vocal** (triads, 4-chord Aeolian loops, D5).
- Storage: `min` (Aeolian; Dorian 6 via acc+1 for deep-house m7 → IV7 moves).

## CHORD (piano / organ / chord-memory stabs)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| stab | rare | some | **often** | some | rare | some | **often** | some | rare | some | **often** | some | rare | some | **often** | often (push) |

- "Stabs are quite syncopated, emphasizing the offbeats" [S148]; synth chords "accentuate quarter notes
  that are off the beat rather than the downbeats on which the kick sounds" [S140]; leave out "the first
  and fourth downbeats" occupied by drum hits [S149]; "the stab on the last 16th-note of the loop leads
  us back to the first chord early" [S148] and the last stab of each bar "goes back … early … to create
  anticipation" [S147] → **step 16 push** into the next chord.
- **Length**: mostly short with some sustained hits as "call-and-response" [S149]; rave stabs "zero
  attack, full sustain and a short release tail" [S111]. **(proposal)** short = 10–20 ticks, long =
  36–72 ticks, ≤ 1 long per bar.
- **Voicing**: close — "keeps the notes closer together, helping the loop 'flow'" [S145]; keep "the 7th
  from each chord" [S145]; "third inversion seventh chords" and "omitting the root notes" (bass has
  roots) [S147]; replace the 5th with 11/13 [S147]. Chord-memory: "each chord played shares the same
  voicing" (parallel), which "almost always contain[s] key changes" [S150]. **(proposal)** 3–4 notes,
  width 7–12 st, MIDI 58–77.
- **Velocity (proposal)**: off-beat 8ths 95–115, 16th pushes 85–100, sustained answers 75–90.
- Korg M1 piano/organ presets in 90s house [S151]; Chicago piano with "minor chords" [S157].

```
HC1 off-beat 8th stabs        ..x...x...x...x.   i7 rootless {b3 5 b7 9}, L=14 ticks            [S140][S145]
HC2 Chandler two-chord        ..x..x.x..x..x.x | ..x..x.x..x..x.x   bar 1 i9, bar 2 iv9; step-16 stab = next chord [S147][S148]
HC3 ii–V deep loop            x.....x...x....x   ii9 (3rd-inversion 7th on top) → V13 at step 11, push on 16 [S148]
HC4 chord-memory parallel     ..x..x....x..x..   same m7 shape on R, then b7, then b6 roots (parallel)  [S150][S111]
HC5 call-and-response         ..x..x=====...x.   short, long (L=6 steps), short — one sustained per bar  [S149]
HC6 main-room Aeolian         x=======x======= | x=======x=======   i – bVI | bIII – bVII triads, half-bar each (proposal from [S152][D5])
```
2-bar: bar 2 = same rhythm on the second chord; or bar 2 changes only steps 13–16 (anticipation stab
on 16); "adding a different chord in the eighth bar" is a longer-form trick [S149] (out of scope for
2 bars → use as a variation flag).

## ARP

**Under-sourced** (no house-specific arp source reached). Nearest idioms: the Moroder 16th sequence
(disco ARP) and the 303 line (LEAD below). **(proposal)** 16ths, 1 octave, chord tones of a m7
{R b3 5 b7}, gate 30–50 %, off-beat 8ths +10 velocity (house accents off-beats, parent hats [S30]).

```
HA1 m7 up 16ths      xxxxxxxxxxxxxxxx   R b3 5 b7 repeated, accent 3/7/11/15          (proposal)
HA2 off-beat plucks  ..x...x...x...x.   b3 5 b7 9 rising per beat (rootless)           (proposal, [S140] off-beat)
```

## LEAD (acid 303 line, vocal-chop riff, organ riff)

- Acid: "raising the filter resonance and lowering the cutoff … along with programming the 303's
  accent, slide, and octave parameters" [S153]; "slides and accents help make the bassline wiggle and
  pop" [S29]; "reduce the length of the pattern from 16 to an odd number like 15 or 13" [S29]; "straight
  16th notes, sticking mostly to one or two pitches … jump the octave on a handful of steps" [S154];
  "put accents on the off-beats rather than on the kick" [S154]; "classics run one bar, two at most"
  [S154].
- Tech house line on steps **1, 5, 9, 12, 15** in G minor [S155]; vocal chops as "rhythmic stabs …
  on the offbeats" (snippet [S155]).
- **Register (proposal)**: acid lead one octave above bass anchor (MIDI 48–67); riff lead 60–79.

```
HL1 acid 16ths, 2 pitches     xx.xxx.xxx.xx.xx   R R 8 R R b3 R R 8 R R b7 (8 = octave up); accents on 3/7/11/15, slides on 2–3 pairs [S154][S29]
HL2 odd-length acid (13)      13-step loop over 16: x.xx.xx.x.xxx then restart   R b3 R 8 R b7 R R 5   [S29]
HL3 tech-house riff           x...x...x..x..x.   R 5 b7 b3 R                      [S155]
HL4 vocal-chop off-beats      ..x...x...xx..x.   5 5 b7 R 5 (short, 12 ticks)     (snippet [S155])
```
HL2 note: a 13-step loop inside a 2-bar phrase = steps 1–13, 14–26 (bar 2 step 10 onwards shifts) →
store the literal 32 steps.

## PAD

- Deep house: "soft keyboard sounds (pads)", "lush chords of 1980s jazz-funk" [S156]; pads sustain
  "in contrast to" frequent root stabs [S147].
- **(proposal)**: 1 chord per bar or per 2 bars (1–2 chord loops [S147]), m9/maj9 4 notes, width 12–17
  st, vel 55–75, change on bar line (or step-16 anticipation, matching stabs).

```
HP1 one-chord bed       x=============== | x===============   i9 held, restrike bar 2 (proposal)
HP2 two-chord           x=============== | x===============   i9 → iv9 (or ii9 → V13)   [S147][S148]
```

## NOT house (melodic)

- Stabs on the kick positions 1/5/9/13 as the main pattern [S149][S140]; root-position wide chords.
- Chord changes every beat; 5+ chords per 2 bars.
- Swing > 60 % on stabs (house is straight or lightly swung, parent research).
- Busy, wide-leaping leads; triplet arps; rock power chords.
