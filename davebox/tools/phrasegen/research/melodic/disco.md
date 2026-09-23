# DISCO — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md` (S1–S42 in the parent
`SOURCES.md`); `D5` = Chordonomicon. **(proposal)** = ours. Nothing here is measured from note data —
no open disco MIDI exists; D5 is chord-sheet vocabulary only.

## Tempo, mode, harmony

- **110–130 BPM** [S135]; "most disco anthems sit at 115-125 BPM", Eurodisco 120–130, Italo 118–122
  (snippet [S238]); Hi-NRG 120–140 [S136]. Default 116–124.
- Four-on-the-floor + "open hissing hi-hat on the off-beat" [S13] (drums in the parent research).
- Harmony: "major and minor seven chords, which are found more often in jazz than pop" [S13]; "minor
  and major triads and 7s" [S139]; "extended chords—major and minor sevenths, ninths, elevenths" [S135].
  Strings "often in dorian or mixolydian" (forum snippet [S158]).
- **Measured (D5, 1,068 songs tagged disco):** m7 **13 %** of chord tokens, maj7+ 6 %, dom7 6 % (rock:
  2 %, 1 %, 3 %); root motion up a 4th **29 %** (highest of all genres measured); a major IV appears in
  **54 %** of minor-proxy songs (Dorian IV; rock 42 %).
- Storage: `min` with Dorian 6 (deg5 acc+1) for minor grooves; `maj` for major-7 grooves.

## BASS

- "Syncopated basslines (with heavy use of broken octaves, that is, octaves with the notes sounded one
  after the other)" [S13]; the disco move is to "double the second note in an octave pattern … an
  eighth note followed by a sixteenth" [S137], added "to the second half of each beat" [S137].
- Hi-NRG: "staccato, sequenced synthesizer sound of octave basslines" [S136]; I Feel Love: 8th-note
  line "doubled by a delay effect" [S138] at 1/16 [S142] → a 16th pulse.
- **Register**: root MIDI 28–40, upper octave ≤ 52 **(proposal, same as parent basics B3)**.
- **Length**: short, octave-up notes shortest — gate 40–60 % **(proposal)**.
- **Velocity (proposal)**: low note 95–110, high note 80–95 (the pop is lighter), doubled 16th 70–85.

```
DB1 broken octaves 8ths     x.x.x.x.x.x.x.x.   R 8 R 8 R 8 R 8 (L=1)                         [S13]
DB2 8th + 16th double       x.xxx.xxx.xxx.xx   R 8 8 | R 8 8 … (low 8th, then octave 16th pair)  [S137]
DB3 chord-following octaves x.x.x.x.x.x.x.x. | same   bar 1 i (R/8), bar 2 IV (4/4+8) — Dorian move  [S13][D5]
DB4 Moroder 16th pulse      xxxxxxxxxxxxxxxx   R R 8 R  b7 R 8 R … flat vel, L=½ step (delay-doubled 8ths) [S138][S142]
DB5 syncopated octave walk  x.x.x.xx.xx.x.x.   R 8 R 8 5 b7 8 R 8 5 (step 8/11 = 16th pushes) (proposal from [S13] "syncopated")
```
2-bar: bar 2 follows the vamp's second chord (i7 → IV7 or ii7 → V7) or ends with a scale walk-up
(5 6 b7 → R) on steps 13–16 (proposal).

## CHORD (rhythm guitar "chuck", piano, string stabs)

- "Chicken-scratch" guitar [S13]; Nile Rodgers plays guitar "[the role of] the ride cymbal" with the
  hand "on the bridge, so it's a muted sound" [S141]: a continuous muted 16th stream with chord hits
  inside; voicings "limited to three strings at most", minor and major 7ths (snippet [S141]).
- Piano/keys "either side of the off beat" → syncopation leaving the snare room [S140]; disco accents
  "sixteenth notes that aren't normally stressed" [S135].
- **Inversions, narrow range**: top notes form "a tighter, closer progression" than root position;
  voicings in "a smaller frequency range" [S139]. Root-position chords feel "loose, disjointed" [S139].

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| keys/guitar chord hit (proposal from [S140][S135]) | some | – | often | often | – | – | often | often | some | – | often | often | – | – | often | often |
| muted guitar stream [S141] | every 16th, vel 20–35, 3–4 ticks ||||||||||||||||

- **Voicing (proposal)**: 3 notes (upper structure: b3 5 b7 / 3 5 7 / b7 9 b3), MIDI 60–79, width ≤ 9 st,
  inversion chosen so the top voice moves ≤ 2 st per change [S139]. **Length**: 8–20 ticks (stab).
  **Velocity**: 90–110 on off-beat hits.

```
DC1 off-beat either side     ..xx..xx..xx..xx   i7 {b3 5 b7} (3 notes) L=12 ticks              [S140]
DC2 Rodgers chuck            mmxmmxmxmxmxmmxm   i9 {b7 9 b3}; x = chord hit, m = muted 16th vel 25, L=4 ticks [S141]
DC3 two-chord minor vamp     ..x...x...x..xx. | same   bar 1 i7, bar 2 IV7 (Dorian), top voice common tone [S13][D5]
DC4 major-7 lift             x.......x..x..x.   Imaj7 {3 5 7} → IVmaj7 {3 5 7 of IV} half-bar change [S139]
DC5 string stab pair         ..x...x.........   i7 two short stabs, then rest (answer bar 2 on 11/15) (snippet [S158])
```

## ARP

- The Moroder sequence is the disco arp: "repetitive synthesizer loops with a continuous
  four-on-the-floor bass drum and an off-beat hi-hat" [S138]; Italo/space disco = "synthesizer and
  arpeggiator-infused disco" [S143]; the backing "composed … before the melody", key C major [S138].
- **(proposal)**: 16ths, 1–2 octaves, chord tones + octave, gate 40–60 %, flat velocity 90–100 with
  every 4th note +10; the chord changes at most once per bar.

```
DA1 root–octave–fifth 16ths   xxxxxxxxxxxxxxxx   R 8 5 8 repeated; bar 2 over IV            [S138][S142]
DA2 8ths + 1/16 echo          x.x.x.x.x.x.x.x.   R 5 8 5 …, echo notes at +1 step vel −25   [S142]
DA3 up-down chord arp         xxxxxxxxxxxxxxxx   R b3 5 b7 8 b7 5 b3 (i7), 1 octave+          (proposal)
```

## LEAD (string runs, hooks)

- Strings and horns "playing linear phrases, in unison" [S13]; "fast ascending violins run is another
  staple" and octave runs [S144]; violins "in octaves and sixths (and to a lesser degree, thirds)"
  (forum snippet [S158]).
- **(proposal)**: a hook = 2–4-note motif repeated; a run = 4–8 consecutive scale steps in 16ths leading
  into beat 1 of the next bar; range ≤ 1 octave per bar, register MIDI 72–91.

```
DL1 ascending run into bar 2  ........xxxxxxxx   scale run 5 6 b7 8 2' b3' 4' 5' (16ths), lands on R' at bar 2 step 1 [S144]
DL2 octave hook               x.x...x.x.....x.   R' R'' b7' R'' … (octave-doubled line)       [S144][S158]
DL3 stab-and-hold             x=====..x.x.x===   5 (hold) … b7 R' 5 (hold)                     (proposal)
```

## PAD (strings)

- "High strings melody voiced in octaves, featuring long notes and minimal melodic movement"; chords
  "at the rate of one per bar" in the pop example [S144].
- **(proposal)**: 1 chord per bar (or per 2 bars on a one-chord vamp), 3–4 notes, width 12–19 st
  (octave-doubled top line), vel 60–80, top voice moves ≤ 2 st.

```
DP1 held vamp        x=============== | x===============   i7 (bar 1) → IV7 or i7 again (bar 2)   [S144]
DP2 octave top line  x=======x======= | …                 top voice R'/R'' then b7'/b7'' half-bar moves (proposal)
```

## NOT disco

- Root-position block chords spread wide [S139]; chord hits on the snare's backbeat only.
- Swing or shuffle (disco is straight 16ths, parent research).
- Minor triads without 7ths as the default colour (D5: disco m7 share 6× rock's).
- Bass without octaves / with long sustained notes on the kick.
- Leads built from wide random leaps; pads that change chord every beat.
