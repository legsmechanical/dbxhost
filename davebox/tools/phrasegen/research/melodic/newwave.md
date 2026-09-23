# NEW WAVE — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon
(**7,306** songs tagged new wave / new wave pop — second-largest set). **(proposal)** = ours. Sources are
mostly Wikipedia song pages; tempos are songbpm.com automatic estimates. Two strands: **punk-leaning**
(Devo, The Cars, Talking Heads) and **disco/dance-leaning** (Blondie "Heart of Glass", Duran Duran).
**Owner priority genre.** Synth-led 80s acts: see `synthpop.md`.

## Tempo, feel, mode

- "Heart of Glass" 115 [S305], "Once in a Lifetime" 117 [S306], "Just What I Needed" 127 [S307], "Rio"
  141 [S308], "Whip It" 158 [S309] ⇒ dance strand 115–127, punk strand 140–160. Default 124–136.
- "Choppy rhythm guitars with angular riffs and fast tempos"; "stop-start song structures … jerky rhythms";
  influences "power pop," "funk," and "reggae" [S221]; "an attempt to reconcile the energy … of punk with
  traditional forms of pop songwriting" [S221]; "Whip It" motorik 4/4 [S339]; "Once in a Lifetime": the
  third beat heard as the first — "two centers of gravity" [S343].
- Harmony: "Whip It" in E major, verses D–A–E7sus4 (**bVII–IV–I**, sus), choruses C–G–D (**bVI–bIII–bVII**)
  [S339]; Remain in Light "using only one chord", "counter-melodies over pedal points" [S340]; "Atomic"
  in E natural minor [S341].
- **Measured (D5)**: 80 % major-proxy; **major songs containing bVII 51 %, bIII 25 %, bVI 17 %** (rock
  43 / 20 / 13) ⇒ Mixolydian + modal mixture is the new-wave harmonic fingerprint; sus 2 %, power 2 %,
  m7 3 %; sections with 2 distinct chords 12 %, 6+ 24 %; minor songs: major IV 48 % (Dorian colour).
- Storage: `maj` + b7 (deg6 acc−1) and borrowed bIII/bVI (deg2/deg5 acc−1); `min` for the minor strand.

## BASS

- "Psycho Killer": "one of the most memorable, driving basslines" [S335]; "chugging eighth-note guitars
  marching along" ("Just What I Needed" — the shared 8th pulse) [S336]; "Cars": Minimoog "augmenting the
  song's recognisable bass riff", song "originat[ed] in the bass riff" [S337]; John Taylor came to bass via
  "the funky rhythms of Chic" / Bernard Edwards [S338] → disco octave bass in the Duran strand; "Whip It"
  riff "alternates between a five-note ascension and a three-note descension" on synth, guitar and bass
  [S339].
- **(proposal)**: punk strand = 8th root pedal with a riff turn; dance strand = disco octaves (see
  `disco.md` DB1/DB2); register MIDI 28–50; gate 50–80 %; vel 95–110 flat.

```
NB1 driving 8th pedal       x.x.x.x.x.x.x.x.   R ×6, then 5 b7 (turn)                            [S336][S335]
NB2 5-up / 3-down riff      x.x.x.x.x.x.x.x.   R 2 3 4 5 | 4 3 2  (ascend 5, descend 3)          [S339]
NB3 synth-doubled bass riff x..x..x.x..x..x.   R R 5 b7 8 5 (repeating 1-bar riff)             [S337]
NB4 Chic-style octaves      x.xxx.xxx.xxx.xx   R 8 8 … (disco DB2)                                [S338][S137]
NB5 one-chord pedal-point   x.x.x.x.x.x.x.x. | same   R pedal both bars (Remain in Light-style)  [S340]
```

## CHORD (choppy guitar / keys)

- "Choppy rhythm guitars", "twitchy, agitated feel" [S221]; reggae/funk influence [S221] (→ off-beat
  stabs; no new-wave-specific skank quote found); sus chords ("E7sus4" [S339]).
- **(proposal)**: short 8th or off-beat stabs (L 8–16 ticks), stop-start gaps (a beat or half-bar of
  rest), 3-note triads/sus4, MIDI 55–76, vel 95–115.

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| choppy stab (proposal) | often | – | **often** | – | some | – | **often** | – | often | – | **often** | – | – (stop) | – | often | some |

```
NC1 choppy 8th downstrokes   x.x.x.x.x.x.x.x.   I triad, L=10 ticks, flat vel                  [S221][S336]
NC2 off-beat skank           ..x...x...x...x.   I (reggae-influenced)                          [S221]
NC3 stop-start               x.x.x.x.........   I … rest half bar (jerky)                       [S221]
NC4 bVII–IV–Isus             x=======x======= | x=======x=======   bVII IV | I7sus4 I   (Whip It shape) [S339]
NC5 bVI–bIII–bVII chorus     x=======x======= | x===============   bVI bIII | bVII              [S339]
```

## ARP

- "Rio": "the arpeggiator on a Roland Jupiter-4 set to random while playing a Cmaj7 chord" [S342];
  "Once in a Lifetime": a "bubbly" synthesizer arpeggio [S343]; SH-5 / Minimoog on "Heart of Glass" [S344].
- **(proposal)**: 16ths, **random order** over a maj7 (the Rio idiom; generate a fixed random order per
  phrase, not per playback), 2 octaves, gate 30–50 %, flat vel.

```
NA1 random maj7 16ths    xxxxxxxxxxxxxxxx   random order of {R 3 5 7} over 2 octaves (seeded, fixed)   [S342]
NA2 bubbly 16ths         xxxxxxxxxxxxxxxx   R 5 R' 5 3 5 R' 5 (one chord, pedal-point)                 [S343][S340]
```

## LEAD

- "Icy synth lines" duelling with guitar; "a prominent keyboard riff" [S336]; "Whip It" chorus "two
  synthesizer notes that are a half step apart" [S339] → semitone motif; "thin, treble-dominant,
  synthesized melodies" [S225]; counter-melodies over pedal points [S340].
- **(proposal)**: short repeated riff (2–6 notes/bar), 8th grid, semitone or 5th/octave motion, MIDI
  72–91, flat vel.

```
NL1 semitone hook        x.x.x.x.x.x.x.x.   R' 7 R' 7 R' 7 R' 7   (7 = maj deg6, half step below) [S339]
NL2 icy keyboard riff    x..x..x.x..x..x.   5' 3' R' 3' 5' R''                                 [S336]
NL3 counter-line on pedal x=======x======= | x=======x=======   3' 2' | R' 2'   (over one-chord pedal) [S340]
```

## PAD

- "Cars": "Polymoog keyboard, providing austere synthetic string lines over the bass riff", Polymoogs
  "folded on top of each other in hypnotic harmonies" [S337]; 80s "thick, compressed" production [S225].
- **(proposal)**: 1 chord per bar or held 2 bars over the riff, triad + octave, width 12–19 st, vel 60–80.

```
NP1 austere string line  x=============== | x===============   I (top R') | bVII (top R' held)   [S337]
```

## NOT new wave

- Blues phrasing, bends, long solos (synth-pop/new wave drew on European, not blues sources [S225]).
- Swing, jazz extended chords (D5 m7 3 %); lush slow pads as the main element in the punk strand.
- Smooth legato comping without stops (the style is "choppy", "jerky" [S221]).
