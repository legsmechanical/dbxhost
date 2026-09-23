# ITALO DISCO (incl. Hi-NRG lineage) — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon
(273 songs tagged italo disco / italo dance / hi-nrg — indicative). **(proposal)** = ours. Bass is well
sourced; pad/arp/stab rhythm are not. **Owner priority genre.**

## Tempo, mode

- Italo "often anchoring around 118-122" (snippet [S238]); NI tutorial 120 [S352]; Attack tutorial 115
  [S353]; Hi-NRG neighbour 120–140 [S136]. Default 116–124.
- "Synthesizer and arpeggiator-infused disco" [S143]; "catchy melodies, vocoders, overdubs" [S143];
  Moroder's I Feel Love is the template: "repetitive synthesizer loops with a continuous four-on-the-floor
  bass drum and an off-beat hi-hat" [S138].
- Scale: Attack's generator uses **harmonic minor** [S353] (proposal: keep it as an option, natural minor
  default); NI chords E–D–C–D in an E-minor kit (bVI–bVII feel; as written I–bVII–bVI–bVII) [S352].
- **Measured (D5)**: 31 % minor-proxy; **minor songs contain bVII in 86 % (highest of all genres)**, bVI 71 %,
  major V 40 % (harmonic-minor V present — cf. [S353]); root motion up a 2nd **21 %** (bVI→bVII→i stepwise),
  up a 4th 22 %; 35 % of sections use exactly 4 chords.
- Storage: `min`; harmonic-minor 7 = deg6 acc+1 when requested.

## BASS (the defining part)

- "Short, staccato notes, often on sixteenth or eighth notes"; "repeating 4-8-note patterns that play for
  the whole track"; "tonic-tonic-octave-tonic with small variations at the transitions"; bass "moves up and
  down between two octaves of the same note" in "most of the genre's classic tracks"; ADSR "fast attack
  and fast decay" [S360] (vendor blog).
- "Default sixteenth notes (16n) which is a typical disco bassline rhythm"; a new root "once per bar"
  (each set of 16 notes); octave randomisation ~50 %; light swing (20 % in that tool) [S353].
- Hi-NRG "staccato, sequenced … octave basslines", "particularly 16th notes", "octave-jumping basslines"
  [S136]; disco gallop 8th + 16th [S137]; I Feel Love 8ths doubled by a 1/16 delay [S138][S142].
- **Register (proposal)**: MIDI 28–52 (low R and R+12). **Gate**: 25–45 % (fast decay). **Velocity**: flat
  95–110, octave-up notes may be −5 to −10 (proposal).

```
IB1 T-T-O-T 16ths         xxxxxxxxxxxxxxxx   R R 8 R  R R 8 R  R R 8 R  R R 8 R            [S360]
IB2 two-octave bounce     xxxxxxxxxxxxxxxx   R 8 R 8 …                                      [S360][S136]
IB3 gallop (8th + 16th)   x.xxx.xxx.xxx.xx   R 8 8 | R 8 8 …                                [S137][S136]
IB4 root per bar, 2 bars  xxxxxxxxxxxxxxxx | xxxxxxxxxxxxxxxx   i: R R 8 R … | bVI: R R 8 R … (new root once per bar) [S353][S360]
IB5 transition variation  xxxxxxxxxxxxxxxx | xxxxxxxxxxxx.xxx   bar 2 steps 13–16: 5 b6 b7 → (walk into the next section) [S360]
IB6 Moroder 8th+echo      x.x.x.x.x.x.x.x.   R 5 b7 8 …, echo at +1 step vel −25           [S138][S142]
```
Loop: 4–8-note cell [S360] ⇒ the 16-step bar is a 4-note cell ×4 (IB1) or an 8-note cell ×2.

## CHORD

- NI: four chords E D C D, velocity **70** [S352]; nothing else on stab rhythm.
- **(proposal)**: 1 chord per bar (IB4 pace), off-beat 8th stabs or held 2-beat chords, triads (occasional
  add9), MIDI 57–76, vel 65–85 (NI's 70), gate 30–60 %.

```
IC1 off-beat stabs       ..x...x...x...x. | ..x...x...x...x.   bVI | bVII        (proposal, [S352])
IC2 half-bar held        x=======x======= | x=======x=======   i bVII | bVI bVII (NI-style loop) [S352][D5]
```

## ARP

- Italo = "arpeggiator-infused" [S143]; I Feel Love flicker = 8ths doubled by delay [S138]; nothing on rate
  or direction specific to Italo.
- **(proposal)**: 16ths, up or up-down, 1–2 octaves over a minor triad, gate 30–50 %, flat velocity,
  chord follows the bass root (once per bar).

```
IA1 up 16ths        xxxxxxxxxxxxxxxx   R b3 5 8 repeated                 (proposal, [S143])
IA2 up-down 2 oct   xxxxxxxxxxxxxxxx   R b3 5 8 b3' 5' 8' 5' b3' 8 5 b3 … (proposal)
```

## LEAD

- "Catchy melodies, vocoders" [S143]; NI lead hook around A4, counter-melody up to D5 (MIDI ~69–74)
  [S352]; Eurobeat offshoot: "very complex melodies" and the "sabi" riff [S361].
- **(proposal)**: catchy 1–2-bar hook, 5–8 notes/bar, 8th/16th grid, stepwise + 3rds, range ≤ 10 st,
  MIDI 67–84, flat vel.

```
IL1 8th hook           x.x.x.xxx.x.x...   5 b3 4 5 b6 5 4 b3        (proposal)
IL2 answer bar         x.x.x.xxx.x.x... | x.x.x.x.x=======   (IL1) | 5 b3 4 2 R   (proposal)
```

## PAD

- **Nothing citable.** **(proposal)** string pad 1 chord per bar, triad + octave, width 12–19 st, vel 55–75.

## NOT Italo

- Long legato bass notes, root-only 8th pedals without octaves (the octave jump is the marker [S360][S136]).
- Swing > 55 % (Italo sequencer grooves are near-straight; [S353] uses only light swing).
- Jazz extended chords; guitar-led comping; busy chromatic leads.
