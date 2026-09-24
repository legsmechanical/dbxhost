# ROCK — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon
(**67,187** songs with main genre `rock` — the largest measured set); `D6` = McGill Billboard (pop/rock
1958–91). **(proposal)** = ours. Rock has the best published corpus statistics of any genre here
(de Clercq & Temperley [S204][S211]) — use them as targets.

## Tempo, rhythm, mode

- **110–140 BPM**; classic 110–130, hard 120–140, garage 130–160 [S201]. Default 116–132.
- "Repetitive snare drum back beat on beats two and four"; "simple syncopated rhythms in a 4/4 meter"
  [S203].
- **Harmony (corpus, [S204], 100 songs):** root shares I .328, IV .226, V .163, **bVII .081**, VI .072,
  bVI .040, II .036, bIII .026, III .019 — "these five roots account for 87 per cent"; "the high incidence
  of bVII, which is quite rare in common-practice music"; the chord before I is most often **IV**, then V,
  then bVII; top trigrams into I: IV–V–I 352, V–IV–I 292, **bVII–IV–I 146**, VI–IV–I 126, **bVII–bVI–I 103**;
  bVII/bIII/bVI correlate as a group; **75.8 % major, 23.4 % minor chords; 94.1 % root position**; power
  chords common [S204].
- **Measured (D5)**: 81 % major-proxy songs; chord tokens maj 66 %, min 20 %, power 3 %, dom7 3 %, m7 2 %;
  **43 % of major songs contain a bVII major chord**; minor songs: bVII 76 %, bVI 67 %, major V 42 %;
  root motion up a 5th 23 %, up a 4th 22 %, up a 2nd 15 %, down a 2nd 13 %; sections most often use 4
  distinct chords (27 %).
- **Mixolydian**: "a classic Mixolydian chord progression is I-♭VII-IV-V" [S210] → storage `maj` with
  b7 = deg6 acc−1.
- **Harmonic rhythm (D6, 82,037 pop/rock bars, CC0)**: chord onsets per bar — 0 (held over) 26 %, **1:
  51 %**, 2: 20 %, 3+: 3 %; changes fall on beat 1 71 %, beat 3 22 %, beat 4 5 %, beat 2 2 %.

## BASS

- "8th note Pedal bass line … the most common bass style in rock" [S202]; "all eighth notes each bar,
  except for the last one, sticking to the root" [S205]; "upbeat, dotted quarter style groove" with "roots
  and fifth intervals" [S205]; "more staccato, a tighter bass groove" [S205]; root–5th "the most supportive"
  (snippet [S207]); rock'n'roll straight 8ths on the chord root (snippet [S206]).
- **Register (proposal)**: MIDI 28–48 (bass guitar E1 up). **Length**: 8ths at 80–95 % gate (pedal), or
  staccato 40–50 %. **Velocity (proposal)**: beats 95–110, off-8ths 85–100.

```
RB1 8th root pedal          x.x.x.x.x.x.x.x.   R ×8 (L=2)                                        [S202]
RB2 pedal + last-beat move  x.x.x.x.x.x.x.x.   R R R R R R 5 b7→ (last beat leads to the next root) [S205]
RB3 dotted-quarter R–5      x.....x.....x...   R 5 R (dotted quarters)                           [S205]
RB4 chord-follow 2-bar      x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   I pedal | bVII pedal (4 steps) IV pedal [S204][S210]
RB5 staccato 8ths           x.x.x.x.x.x.x.x.   R R 8 R R R 8 R, gate 40 %                         [S205]
```

## CHORD (power chords, palm-muted 8ths, open strumming)

- Power chord = root + 5th (+ octave), voicing "1-5-1'" on the low strings; full chords go "messy" under
  distortion [S208]; palm muting gives "'chugging' … 'crunch'" [S209].
- **Rhythm (proposal from [S208][S209][S202])**: 8th chugs (muted, short) with accents/open hits on beat 1
  and on pushes (step 8 / step 16 anticipation of the next chord).

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chord (8th chug) | always | – | often | – | often | – | often | some (push) | often | – | often | – | often | – | often | some (push) |

- **Voicing**: power {R 5 8} for distorted families; open triads {R 3 5 (8)} root position (94 %
  [S204]). **Register**: MIDI 40–64 (E2–E4) → chord anchor 60, oct −1 (proposal).
- **Length (proposal)**: palm-muted chug 10–16 ticks; open accents 40–90 ticks (let ring).
- **Velocity (proposal)**: muted 70–85, accented open hits 100–120.

```
RC1 power 8th chug          x.x.x.x.x.x.x.x.   I5 ×8, muted, accent 1 & 9                        [S208][S209]
RC2 I–bVII–IV mixolydian    x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   I5 | bVII5 (1–8) IV5 (9–16)       [S210][S204]
RC3 bVII–bVI–I (Aeolian)    x=====x.x=====x. | x===============   bVII bVII(7) bVI(9) I(15, held over) | I   [S204]
RC4 IV–I plagal push        x.x.x.x.x.x.x..x | x===============   IV5 … push on 16 | I5 held          [S204]
RC5 open strum 8ths         x.xxx.x.x.xxx.x.   I triad {R 3 5 8} root position                    (proposal, [S204])
```

## ARP

- **No citable idiomatic rock arpeggio** (researcher found only the "Every Breath You Take" lick without
  detail). **(proposal)** clean-guitar 8th arpeggio: R 5 8 3' (or b3') … at 8ths, 1.5 octaves, gate
  90 % (let ring), one chord per bar. Low confidence — consider omitting ROCK×ARP.

## LEAD (riffs / hooks)

- "A riff is a short, repeated motif" [S213]; melodies from "Dorian and Mixolydian, as well as the major
  and minor scales" [S203].
- **Corpus [S211] (200 rock melodies):** "the most frequent scale-degree is 1, followed by 5"; "b7 is more
  common than 7" in melodies; commonest scale = major (24 songs), then the **"pentatonic union"
  1-2-b3-3-4-5-6-b7**; pure Mixolydian/Dorian/Aeolian "quite rare". Minor pentatonic R b3 4 5 b7 [S212].
- Rock melody non-chord tones often **don't** resolve by step ("melodic-harmonic divorce"), mostly in
  pentatonic verses [S252].
- **(proposal)**: riff = 1-bar motif repeated with a changed ending in bar 2; 4–8 notes/bar; b3 over a
  major chord allowed (pentatonic union); range ≤ 12 st; register MIDI 64–88 (lead anchor 72); 8th-note
  grid with some 16th pickups.

```
RL1 minor-pent riff       x.x.xx..x.x.x...   R b3 4 5 b3 R b7↓            (b7↓ = oct −1)    [S212][S213]
RL2 pentatonic union hook x..x..x.x.......   5 6 R' b3'(over I)                              [S211]
RL3 riff + changed ending x.x.xx..x.x.x... | x.x.xx..x.x.x.x.   same | … ends 4 5 (turnaround) [S213]
RL4 descending answer     x.x.x.x.x=====..   R' b7 5 4 b3 (held)                             (proposal, [S253] descending common)
```

## PAD (organ / keys)

- "Keyboards such as the piano, the Hammond organ, and the synthesizer" [S203]; Hammond plays "both chords
  and lead lines", through overdriven amps [S214]. No source on change rate.
- **(proposal)**: organ pad follows D6 harmonic rhythm — 1 chord per bar (or 2 per bar, change on beat
  3), root-position triads + octave, width 12–19 st, vel 70–90.

```
RP1 organ one-per-bar   x=============== | x===============   I | IV                 [S214][D6]
RP2 half-bar change     x=======x======= | x===============   I bVII | IV            [S204][D6]
```

## NOT rock

- Extended jazz chords (m9, maj9, 13) as defaults (D5: m7 2 %, maj7 1 %); inverted voicings as default
  ([S204] 94 % root position).
- V→I as the only cadence (IV→I 1,162 vs V→I 788 transitions in [S204]); no bVII anywhere.
- Swung 16ths; four-on-the-floor off-beat bass; 16th-note arps as the main texture (proposal).
- Leads made of chromatic runs or with no repetition (riffs repeat [S213]).
