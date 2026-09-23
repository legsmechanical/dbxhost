# HIP-HOP — melodic (boom bap, trap, lo-fi, G-funk)

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md` (S1–S42 parent);
`D5` = Chordonomicon (11,142 songs with main genre `rap` — large, but chord sheets of vocal songs; no
timing). **(proposal)** = ours. Four sub-families differ more than most genres — treat them as
separate generator families.

## Tempo, swing, mode

- Boom bap **~90–95** (NI example 93 [S113]); trap "around 70 (140)", range 50–88 (100–176) [S115],
  "140-160bpm but feel far slower" [S116]; lo-fi 60–90 [S117] / 70–100 [S118] / 70–80 [S119]; G-funk
  90–100 [S121]. Defaults: boom bap 90, lo-fi 80, G-funk 94, trap 140 (half-time feel).
- **Swing**: MPC swing is the hip-hop feel — "Swing MPC 3000 8ths 57" in Attack's boom-bap example
  [S114]; boom bap keeps "precision on the 'on' beats" and offsets the off-beats [S128]; 54–58 %
  typical (snippet [S246]); Linn definitions [S5]. GMD `hiphop` drums (D1) are in the parent research.
  **(proposal)** melodic parts inherit the drum phrase's swing (54–60 % boom bap/lo-fi; trap straight).
- **Mode**: trap "minor, harmonic minor, and phrygian" [S124]; lo-fi jazz ii–V–I, I–vi–ii–V, I–vi–IV–V
  "with 7th chord extensions" [S119]; G-funk m7/maj7 colour (weak snippet).
- **Measured (D5)**: **41 %** minor-proxy songs (rock 19 %, punk 14 %) — the most minor-leaning large
  corpus; in minor songs the commonest non-tonic roots are **bVI (13 %)**, bVII (12 %), bIII (10 %),
  **minor v (9 %)**; the major V appears in only 22 % of minor songs (rock 42 %) ⇒ **Aeolian**, not
  harmonic minor, at the chord level; 39 % of sections use exactly 4 distinct chords (loops).

## BASS

- Boom bap: "a bass sequence that plays the root, seventh and fifth for a jazzy feel" [S113]; sine bass
  or doubling the sample [S114]; "incredibly wide range of samples: jazz, soul" [S122].
- 808: "single-pitched kick drum layer or … pitch-bent melodically driving bassline" [S122]; trap 808
  "played melodically up and down the scale", later "pitch bends, glides" [S122]; drill 808 "short,
  staccato, and rhythmically locked to the drums" [S122]; "the red bass notes play each time the kick
  hits" [S123]; "most times … the root of the chord" [S123]; glide by overlapping notes [S123]; "hits
  firmly on the root" and is "transposed at phrase endings" [S116].
- 808 register: "30-80 Hz, with F1 (43.65 Hz)" (snippet [S247]) ⇒ **MIDI 23–39**, F1 = 29.
- G-funk: "Minimoog and ARP Odyssey … melodic, funky, and highly syncopated" [S122]; "deep bass" [S121].

```
HB1 boom-bap R–b7–5      x......x..x.....   R (L=6) b7 (L=3) 5 (L=5), swung 57 %               [S113][S114]
HB2 808 on the kick      x.....x...x..x..   R R R R (each long, cut by the next), vel 110        [S123]
HB3 808 phrase-end move  x.....x...x..x.. | x.....x...x.x.x.   R R R R | R R R b6 b7 (glide into b6, b7) [S116][S123]
HB4 drill staccato       x..x..x...x.x...   R R b3 R b2 (L=1–2)                                 [S122]
HB5 G-funk syncopated    x..x.x....x..x.x   R 5 b7 R 4 5 (L=1–2, 16th pushes)                   [S122][S121]
```
808 note length (proposal): sustain to the next onset (≥ 90 % gap), glides = the earlier note's gate
overlaps the next by 6–12 ticks (tag as legato).

## CHORD

- Lo-fi: "Hold each chord for a bar or two" [S119]; "spread voicings … across two octaves" [S119];
  "chords over about 4 bars … shorter loops" [S118]; extensions "make your chords sound more lush",
  e.g. "Amin11–D7–Fmaj7–Cmaj7" [S120]; NI "VI – i – V7" [S117].
- Boom bap: keys one-shot sequenced "to play at the start of every bar"; tracks "based around a two-bar
  sample" [S113].
- **(proposal)** lo-fi: 1 chord per bar, 4–5 notes, width 14–24 st, vel 50–75 (humanised ±10), onsets
  late by 0–6 ticks ("janky" [S117]); boom bap: 1 stab per bar on step 1 (+ optional step 11 repeat).

```
HC1 lo-fi bar-per-chord   x=============== | x===============   ii9 {R b3 5 b7 9} spread | V13 (or I-vi) [S119][S120]
HC2 lo-fi late push       x===========..x= | ================   imin11 | held, re-attack on 15 of bar 1  (proposal, [S117])
HC3 boom-bap keys stab    x=====.......... | x=====....x.....   i9 | i9 + echo stab on 11          [S113]
HC4 trap drone chord      x=============== | ================   i (or harmonic-minor V) held pad-like  [S115]
```

## ARP

- Trap: the idiomatic "arp" is the hi-hat; arpeggiators at "quarter-notes or eighth notes", "shifting to
  triplets or dotted notes at the end of every bar" [S116]. None found for boom bap / lo-fi / G-funk.
- **(proposal)** trap arp: 8ths, minor triad, 1 octave, last beat as 8th-triplets (store as ticks 0/32/64
  within the beat), bell/pluck register MIDI 72–91.

```
HA1 trap 8th arp + triplet end   x.x.x.x.x.x.x.x.  (last beat 3 notes at 32-tick spacing)   R b3 5 b3 … b3 5 8 [S116]
```

## LEAD

- Trap: minor / harmonic minor / Phrygian; "the 6th, 2nd and 4th scale steps generate the most tension",
  5th pairs with the 1st [S124]; "simple A/B structure", question/answer [S124]; "split your loop into four
  slots … a conversation" [S125]; counter-melody "a few notes an octave above the lead, playing half as
  often" [S125]; "quantized-to-death melodies read as stiff" [S125]; mono glide leads [S116]; "monophonic
  drones", orchestral strings/brass [S115].
- G-funk: "high-pitched portamento saw wave synthesizer lead" [S121]; mono legato, detuned saws [S126].
- Lo-fi: "cloying piano or guitar melodies" [S127].
- **(proposal)** 2-bar lead = A (bar 1) + B (bar 2) answer; 4–8 notes per bar for bell melodies, 2–4 for
  G-funk whistle; range ≤ 10 st; register MIDI 72–91 (bells), 79–96 (whistle).

```
HL1 trap A/B bell       x..x..x.x..x.... | x..x..x.x.......   R b3 5 b6 5 | R b3 5 7(harm. minor)  [S124][S125]
HL2 Phrygian hook       x.x...x.x.x..... | x.x...x.........   R b2 R b3 b2 | R b2 R               [S124]
HL3 G-funk whistle      x=====....x===== | x===============   5' (glide) b7' | R''  (legato, portamento) [S121][S126]
HL4 lo-fi piano motif   ..x.x...x=...... | ..x.x...x=====..   b3 4 5 | b3 4 b3  (swung, vel 50–70)  [S127][S117]
```

## PAD

- Lo-fi: no pad tradition; atmosphere from keys + reverb [S117]. G-funk: "multi-layered and melodic
  synthesizers" [S121]. Trap: orchestral strings / drones [S115].
- **(proposal)** trap/G-funk pad: 1 chord per 2 bars, 3–4 notes, width 12–19 st, vel 45–65; lo-fi → use
  CHORD HC1 instead of a pad.

## NOT hip-hop

- Four-on-the-floor bass/stab patterns (hits on all of 1/5/9/13).
- Straight rigid melodic timing in boom bap / lo-fi (they swing [S114][S128]); triplet swing on the trap
  lead (trap swing lives in hats) (proposal).
- 808 notes that do not follow the kick in the 808 family [S123]; bright major pop loops as the trap
  default [S124]; fast chord changes (> 1 per bar) in lo-fi [S119].
