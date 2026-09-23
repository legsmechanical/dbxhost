# ELECTRO — melodic (Detroit/Miami electro, 808 electro-funk, Drexciya)

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon.
**(proposal)** = ours. ⚠ **Low confidence**: electro sources describe sound and character far more than
notes; there is no step-level bass or lead source, and D5 has only 53 songs tagged `electro` (Spotify's
tag also catches electro-pop acts — indicative only). Several concrete lines are from vibebox.studio
tutorials [S178]–[S182] (vendor blog).

## Tempo, rhythm context

- **110–130 BPM**, sweet spot 118–126 [S178]; Cybotron "Clear" recreation 125 [S183]; Miami bass
  130–135 [S181] / 125–140 [S180]. Default 120–128.
- Drums are "electronic emulations of breakbeats with a syncopated kick drum" [S177]; kicks "sparse and
  syncopated", snare "on steps 5 and 13" [S178]; Miami hats with "short, 16th-note rests … jerky"
  [S181]. ⇒ bass and riffs lock to a **syncopated, non-four-on-the-floor** kick.
- Mode: minor; Drexciya "thick minor sound" [S185]; "melancholic yet futuristic melodies" [S182].
  D5 (53 songs): 45 % minor-proxy (with EBM, the most minor-leaning electronic tag measured).

## BASS

- "Programmed bass lines, sequenced or arpeggiated synthetic riffs" [S177]; "classic electro basslines
  often use just 3-5 notes. The groove comes from the rhythm" [S178]; bass and kick "like one
  instrument" [S178]; "silence is as impactful as sound" [S178]; electro-funk lines "simple, repetitive,
  and highly rhythmic … lock in tightly with the 808 kick" [S179]; long-decay 808 kick "tuned to specific
  keys to create melodic basslines" [S180][S181]; Cybotron: "often arpeggiated foundations" [S182].
- Glide: snippet only [S178] → **(proposal)** ≤ 1 glide per bar.
- **Register (proposal)**: MIDI 28–45; 808-kick-bass on the root (and b7/5 an octave-register down).
- **No source gives step positions** — **(proposal)** derive from the syncopated kick: onsets on the
  kick steps plus 16th pickups before them, rests on the snare steps 5/13.

```
EB1 kick-locked syncopation   x.....x...x..x..   R R b7 R  (kick-shaped: 1, 7, 11, 14)      (proposal from [S178][S179])
EB2 3–5-note funk riff        x..x..x.x.....x.   R b3 R 5 b7, L=1–2, rests on 5/13         [S178][S179]
EB3 arpeggiated foundation    x.x.x.xxx.x.x.xx   R 5 8 5 R b3 5 … 16th pickups              [S182]
EB4 808 root + octave drop    x=====....x=====   R (long, 808 decay) … b7 (long)            [S180]
```

## CHORD

- Thin: Drexciya-style filter stab "at the end of every 2 bars" [S185]; minor chord for "that thick minor
  sound" [S185]; Cybotron "synth stabs, plucky arpeggios" [S183].
- **(proposal)** 1 stab event per 1–2 bars, minor triad/m7, L ≤ 1 step, MIDI 55–72.

```
EC1 end-of-phrase stab   ................ | ............x...   i7 once, bar 2 step 13 (end of 2 bars) [S185]
EC2 off-beat stab pair   ......x.......x.   i triad short                                  (proposal)
```

## ARP

- "Sequenced or arpeggiated synthetic riffs" [S177]; "plucky arpeggios" [S183]; Drexciya "hard 16ths with
  plucky sounds and short envelopes" (snippet [S185]).
- **(proposal)** 16ths, 1 octave, minor triad + b7, gate 20–40 %, flat velocity; 1 chord per 2 bars.

```
EA1 hard 16th pluck   xxxxxxxxxxxxxxxx   R b3 5 b7 repeated (gate 25 %)    [S177][S185]
EA2 gapped sequence   xx.xx.xx.xx.xx.x   R 5 . 8 b7 . 5 R …                 (proposal, [S181] "16th-note rests")
```

## LEAD

- Vocoder is "a common element" [S177]; Kraftwerk/YMO lineage, "icy synthesizer lines"; Planet Rock used
  the "Trans-Europe Express" melody [S184]. No source for range/scale/motif length.
- **(proposal)** short robotic motif: 3–5 notes, 1–2 bars, stepwise + octave, straight 8ths/16ths, flat
  velocity, MIDI 67–84, minor/Phrygian colour.

```
EL1 icy 8th motif      x.x.x.x.x.x.x.x.   R b3 5 b3 R b3 5 8          (proposal from [S184])
EL2 answer motif       x...x...x.x.x...   5 4 b3 2 R (stepwise descent) (proposal)
```

## PAD

- Drexciya "moving the wavetable" + echo/reverb "underwater feel" [S185]; otherwise secondary.
- **(proposal)** minor chord held 2 bars, width 12–19 st, vel 50–65; optional.

## NOT electro

- Four-on-the-floor bass implication (hits on all of 1/5/9/13) — that is house/techno.
- Many-note melodic bass lines (> 5 pitches per bar) [S178]; no rests in the bass [S178].
- Major-key bright pads as the main element; swung 16ths > 58 % (proposal).
