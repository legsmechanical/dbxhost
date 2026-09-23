# EBM (Electronic Body Music) — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon
(127 songs tagged ebm / electro-industrial / aggrotech — indicative). **(proposal)** = ours. **Owner
priority genre.** EBM is a **one-line genre**: the sequenced bass is the melody; chords, pads and arps are
not idiomatic (sourced absence, below).

## Tempo, rhythm, mode

- Studio Brootle tutorial 126 BPM [S354]; Wikipedia gives no BPM [S363]. Default 120–130 (proposal).
- "Typical EBM rhythms rely on the 4/4 disco beat or rock-oriented backbeats … and some minor syncopation"
  [S363]; DAF drums "fairly simple and relatively unsyncopated" [S362]; "minimal structures" [S363].
- **Measured (D5)**: **45 % minor-proxy — the most minor-leaning tag measured** (tied with electro);
  chord tokens maj 62 %, **min 35 %**, m7 ≈ 0, power 1 %; minor songs: bVII 77 %, bVI 70 %, iv 54 %;
  root motion up a 5th 23 %, **up a minor 3rd 10 %** (i→bIII; rock 6 %).
- Storage: `min` (Aeolian); `acc` chromatic neighbours allowed (DAF: sequence notes "set slightly out of
  tune" [S362] → a b2/#4 colour, proposal).

## BASS (the sequence)

- "Typically only a single sequencer-driven line would be used for a song, the sequence functioning both
  as melodic accompaniment and as a bassline"; "the relentlessly robotic (the 16-step sequences)"; MS-20 /
  Odyssey "driven by a Korg SQ-10 analog sequencer" [S362]; "sequenced repetitive basslines" [S363].
- "All 1/16th notes on, so it's like a step sequencer with all notes on"; notes "punchy, percussive and
  short" [S364]; "16th notes between the kicks really" (forum [S365]); rarely rests (snippet [S365]).
- **Velocity is NOT flat**: "adjusting the velocities for the feel/groove/timing" [S365]; "some variation
  in the velocities … not every note sounds the same" [S354].
- Octave layer "+12 to make the same bassline … an octave higher" (a doubling, not jumps) [S354].
- **Register (proposal)**: MIDI 28–48 (+12 doubling to 60). **Gate**: 25–50 % (short). **Velocity
  (proposal)**: 75–115 with a repeating accent shape (e.g. strong on 1 and on 16th off-beats before
  beats), not random.

```
EB1 all-16ths root        xxxxxxxxxxxxxxxx   R ×16, vel shape 110/80/95/80 per beat          [S364][S354]
EB2 between the kicks     .xxx.xxx.xxx.xxx   R R b3 | R R 5 | R R b3 | R R b7 (kick owns 1/5/9/13) [S365]
EB3 16-step motif         xxxxxxxxxxxxxxxx   R R b3 R R 4 R b3 R R 5 R R 4 R b3 (2–4 pitches)   [S362]
EB4 16ths + octave double xxxxxxxxxxxxxxxx   EB3 plus the same line +12 (second voice)         [S354]
EB5 2-bar motif           xxxxxxxxxxxxxxxx | xxxxxxxxxxxxxxxx   bar 1 R-pedal motif | bar 2 same shape on bIII or iv (proposal, [D5] i→bIII)
```

## CHORD / PAD / ARP

- **Not idiomatic.** "Minimal structures", "programmed drum beats, repetitive basslines, and clear or
  slightly distorted vocals" [S363]; a "single sequencer-driven line" [S362]. Any EBM chord/pad/arp phrase
  would be library-invented.
- **(proposal)** if the UI must offer them: CHORD = one minor-triad stab per bar on step 1 or 3, L ≤ 1
  step, vel 110 ("command"-like); PAD = omit; ARP = reuse EB3 one octave up (it *is* the arp).

## LEAD

- Vocals lead ("command-like shouts") [S363]; no synth-lead idiom found. **(proposal)** omit, or a
  2-note shout-like motif: R' and b7 (or b2') on beats, 1-bar repeat, L 2–4 steps.

```
EL1 shout motif    x...x.......x...   R' R' b7       (proposal)
```

## NOT EBM

- Swing; lush chords/pads; melodic busy leads; major-key brightness (D5 most-minor tag).
- Rests in the bass sequence as the main idea (it "rarely rests" [S365]); long legato bass notes [S364].
- Completely flat, identical velocities on every step [S365][S354]; a "clean normal sound" was the thing
  DAF avoided [S362] (sound design, noted for the synth patch).
