# SYNTHPOP (80s synth-pop) — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon
(**1,975** songs tagged `synthpop` — skewed to 80s acts, chord sheets). **(proposal)** = ours. Covers the
80s era (Depeche Mode, Human League, Yazoo, Eurythmics, OMD, New Order, Soft Cell); modern revival is
`synthwave.md`; neighbours `newwave.md`, `italo.md`, `ebm.md`.

## Tempo, mode, harmony

- No genre-level tempo source; song tempos: "Sweet Dreams" 126 [S222], "Enjoy the Silence" 114 [S223],
  "Don't You Want Me" 118 [S224], "Blue Monday" ~128–130 (snippet [S233]), "Just Can't Get Enough"
  127–128 (snippet [S234]); Hi-NRG neighbour 120–140 [S136]. Default 112–128.
- "Primary use of synthesizers, drum machines and sequencers"; grooves "woven together from simple
  repeated riffs often with no harmonic 'progression'" [S225]; early monophonic synths [S225]; kicks/snares
  "peppered throughout rhythms on the offbeats" [S226].
- Progressions (minor-key numerals, VI = bVI): "Sweet Dreams" i–VI–v [S222]; "Enjoy the Silence" chorus
  i–III–v–VII–i [S223]; "Don't You Want Me" i–VI6, pre-chorus i–v–VI–iv–VIIsus4 [S224]; tutorial
  I–V–bVII–IV [S228]; "Enola Gay" the '50s progression I–vi–IV–V "all the way through" [S357].
- **Measured (D5)**: 27 % minor-proxy; minor songs: bVII 71 %, bVI 71 %, **minor v common** (Vm 8 % of
  chords) vs major V in 34 %; **major songs contain bVII 56 % — the highest of all genres measured**
  (rock 43 %); IV major in 51 % of minor songs (Dorian colour); root motion evenly split up-4th 20 %,
  up-5th 19 %, up-2nd 18 %.
- Storage: `min` (Aeolian, minor v natural); `maj` + b7 for the bVII family.

## BASS (sequenced synth bass)

- "Program a sequence of sixteenth notes, all with the same length and velocity" [S228]; "notes from
  alternate octaves … similar to New Order's Blue Monday" [S226]; "hit the same note in different octaves
  to get that hi-energy sound" [S227]; "the bouncy octave bass used eighth-notes" [S226]; Hi-NRG "staccato,
  sequenced … octave basslines", "particularly 16th notes" [S136]; SH-101 bass in "Sweet Dreams" [S356];
  Blue Monday: an accidental "extra rest" kept in the sequence [S229].
- **Velocity: flat** (sequencer) [S228]. **Length**: equal, staccato — gate 40–60 % (proposal).
  **Register (proposal)**: MIDI 28–52 (octave jumps reach +12).

```
SB1 flat 16th root         xxxxxxxxxxxxxxxx   R ×16, equal length/velocity             [S228]
SB2 16th octave            xxxxxxxxxxxxxxxx   R 8 R 8 … (alternate octaves)             [S226][S227]
SB3 bouncy 8th octave      x.x.x.x.x.x.x.x.   R 8 R 8 …                                  [S226]
SB4 16th with a rest       xxxxxx.xxxxxxxxx   R R 8 R R 8 . R … (one displaced gap)     [S229]
SB5 chord-follow 2 bars    xxxxxxxxxxxxxxxx | xxxxxxxxxxxxxxxx   i (R/8) | bVI (1–8) v (9–16)  [S222][S228]
SB6 riff bass (i–VI–v)     x.xx.xx.x.xx.xx. | same   R R b3 R 5 R R b3 R 5 … over i, then bVI  (proposal)
```

## CHORD (stabs, orchestral hits, sustained strings)

- Synths "imitate … orchestras and horns" [S225] → orchestral/horn stabs; extend triads with "the seventh
  and ninth" [S228]; DX7 "bright digital pianos and bells" [S227].
- **(proposal)** stab rhythm: off-beat 8ths or a syncopated 3-hit figure; 1 chord per bar (or per half bar
  in the '50s/i–VI–v loops); voicing 3–4 notes MIDI 57–76; stab L 8–20 ticks, vel 95–115.

```
SC1 orchestral hit      x.........x.....   i (stab, L=12 ticks), second hit on 11     (proposal, [S225])
SC2 off-beat stabs      ..x...x...x...x.   i add9                                      (proposal)
SC3 i–VI–v loop         x=======x======= | x=======x=======   i VI | v v   (half bar each, loop 2 bars) [S222]
SC4 '50s loop           x=======x======= | x=======x=======   I vi | IV V (half bar each)   [S357]
```

## ARP

- Juno-60 "onboard arpeggiators" [S226]; "a slower value like 1/8 … more melodic"; octave range pushes
  higher [S230]; "a simple, ascending four-note arpeggio based on notes within each chord" [S228]; ARP
  2600 built-in sequencer (snippet [S232]).
- **(proposal)**: 1/8 or 1/16, up, 1–2 octaves, 4 chord tones, gate 40–60 %, flat velocity.

```
SA1 4-note up 16ths    xxxxxxxxxxxxxxxx   R b3 5 8 repeated (i)                   [S228]
SA2 melodic 8ths       x.x.x.x.x.x.x.x.   R 5 8 b3' 8 5 R 5  (2 octaves)          [S230]
SA3 chord-follow       xxxxxxxxxxxxxxxx | same   i R b3 5 8 | bVI 3 5 8 3' (of bVI)  [S228][S222]
```

## LEAD (riff / hook)

- "Riff-driven" [S358]; "distinctive lead synthesizer hook" with no vocal chorus [S357]; "droning
  electronics with little change in inflection" (early) [S225]; "thin, treble-dominant" [S225].
- Melody stats (Hooktheory, READ): "Sweet Dreams" 100 % diatonic, **85 % chord tones**, verse range C4–F4
  (5 st) [S222]; "Don't You Want Me" range E3–G5, 100 % diatonic, **81 % chord tones**, stepwise [S224];
  "Enjoy the Silence" 94 % diatonic, **63 % chord tones** [S223].
- Pedal-note lead: "hold down one long note and play shorter notes higher up … the pitch reverts" [S228];
  a line "played … a half‑beat out of time" kept as a hook [S359].
- **(proposal)**: 1-bar riff repeated, 4–8 notes, diatonic, ≥ 75 % chord tones on beats, range ≤ 9 st,
  MIDI 72–88, flat velocity, 8th/16th grid.

```
SL1 pedal-note riff     x.xx.xx.x.xx.xx.   R' b3' R' 4' R' 5' R' 4' R' b3'  (R' = pedal, short uppers) [S228]
SL2 4-note hook         x...x...x...x=== | x...x...x=======   5 b3 4 5 | b3 4 R          (proposal, [S222] narrow range)
SL3 half-beat shifted   ..x...x...x...x.   same riff as SL2 bar 1 displaced by 2 steps      [S359]
```

## PAD (strings / polysynth)

- OB-X "sustained string sounds" [S356]; "orchestral swells and the long horn sound" [S355]; late-80s
  "thick, and compressed production" [S225].
- **(proposal)**: 1 chord per bar (or held 2 bars on one-chord riffs), 3–4 notes, width 12–19 st, vel
  60–80, add9/7 extensions [S228].

```
SP1 string bed           x=============== | x===============   i | bVI            [S356][S222]
SP2 held one-chord       x=============== | ================   i(add9)            [S225] (no progression)
```

## NOT synthpop

- Guitar-led textures, swung 16ths, bluesy bends (synth-pop chose "deliberate artificiality" over
  American blues sources [S225]); jazz extended chords as defaults (D5 m7 3 %).
- Humanised velocity on sequenced bass (flat [S228]); legato bass.
- Busy chromatic leads; wide-range leads (> 12 st per 2 bars).
