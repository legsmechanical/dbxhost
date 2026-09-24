# DRUM & BASS (DNB)

Conventions as in `house.md` (16 steps/bar at the full tempo, 96 PPQN, 24 ticks per 16th,
**(proposal)** = ours). ⚠ **Lowest-confidence genre here**: no ingestible or even reference symbolic
DnB corpus was found, so everything is from producer guides and the Amen-break transcription — no
measured distributions. Treat the targets in `verify.md` for DnB as rules, not statistics.

## Tempo and swing

- **160–180 BPM** [S11]; "between 170-180bpm, with the majority falling at 174-175bpm" [S18];
  174 [S7][S20]; 168–178 [S9]; 170 [S19]. Default 172–176.
- Swing **50–60 %** [S9]; "MPC 16 Swing 62%" as an example [S19]; NI: "lightly swung 16th note hats"
  [S7] → even-16th delay **0–6 ticks**, typically 2–4. The 8th grid stays straight.
- Some guides count DnB in half-time (85–90) [S19]; **(proposal)** the generator works at full tempo.

## HATS

### Grid (the two-step frame: kick 1 + 11, snare 5 + 13 [S7][S9][S20])

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 8th hat / ride | **always** | – | **always** | – | **always** | – | **always** | – | **always** | – | **always** | – | **always** | – | **always** | – |
| 16th ghost hat | – | rare | – | rare | – | often² | – | **often¹** | – | **often¹** | – | sometimes | – | often² | – | often³ |

- "Closed hats on eighth notes" [S7]; 8th-note ride [S9]; Amen ride on 8ths "all the way through"
  [S17]; liquid: a hat "ticking the offbeats" (3/7/11/15 only) is the sparse variant [S31 snippet].
- ¹ "lightly swung 16th note hats on the eighth and tenth 16th notes" [S7].
- ² The DnB "shuffle": "a series of 1/16 notes after the first snare of each bar" (steps 6–8) built
  from hats, percussion or ghost snares [S18].
- ³ "16th-measure ghost notes at the end of the beat are swung back slightly and play at a lower
  volume" [S9]; "doubled hi-hats at bar end" as a variation [S21].
- Faster subdivisions (16ths, 32nds) add energy [S18][S19]. **(proposal)** 32nds only as a 2–4-note
  roll at a phrase end.

### Open hat

Amen: "the ride on the 'and' of three is replaced with an open hi-hat" in the last bar [S17] →
**step 11 of the last bar of the phrase**. **(proposal)** ≤ 1 open hat per 2 bars, on an off-beat
(3/7/11/15), preferably at the phrase end; long gate (≥ 24 ticks), high velocity.

### Velocity

NI: 8ths at 86, swung 16ths at 76 [S7]; ghost 16ths "at a lower volume" [S9]; velocity variation for
an organic feel [S21]. **(proposal)** 8ths 80–100 with snare-position hats (5, 13) not louder than
the rest; 16th ghosts 45–75; bar-end ghosts 40–60.

### 2-bar variations

Bar 2 carries the change: add the step-16 ghost pair, a short 32nd roll 15–16, or the open hat on
11; "a late snare" / "doubled hi-hats at bar end" [S21]; keep the 8th skeleton unbroken.

## BASS

### Rules

- Sub bass is "just root notes or simple 2–3 note movements" [S19]; Reese basses are "longer,
  drawn-out bass notes with subtle movement over time" [S18]; legato + glide are part of the Reese
  sound [S42 snippet].
- **Register**: sub "centered at 40-80Hz" [S19]; "sweet spot … between D#1 and G#1" [S18] = 39–52 Hz
  = **MIDI 27–32** (C4=60 convention). Sub content "75–100 Hz downwards" [S18]. Mid/Reese layers
  can sit an octave above (MIDI ~36–48), **(proposal)**.
- **Key**: minor — "E Minor, F Minor and F# Minor" [S18]; "F minor, A minor, E minor, G minor" [S19].
  Degrees: R dominant; b3, 4, 5, b6, b7 (natural minor) **(proposal)**; no major 3rd.
- **Relation to the kick**: sub/mid sidechained to duck on the kick [S19][S22]; the bass either
  lands with the kick or weaves around it [S22]. With kicks on 1 and 11, the bass re-attacks on 1
  and/or 11 and sustains through the snare.
- **Density**: low — the drums carry the speed; the bass moves at a half-time feel (unattributed
  search snippet; consistent with [S19]'s 85–90 half-time counting). **(proposal)** 1–4 onsets per bar, median note length ≥ 4 steps.

### Canonical cells (constructed from the rules; not transcriptions)

```
D1 sub pedal on two-step   x.........x.....     R (L=10)          R (L=6)                 [S19][S7]
D2 Reese two-bar sustain   x............... | x.......x.......   R (L=16) | b6 (L=8) b7 (L=8), legato/glide  [S18]
D3 2–3-note sub move       x.........x..x..     R (L=10)          b7 (L=3) R (L=3)        [S19]
D4 kick-unison + tail      x.........x.x...     R (L=10)          R (L=2) b3 (L=4)        [S22]
```
Two-bar form: bar 1 establishes the root; bar 2 moves to b6/b7/4 or back (2–3 notes total) [S19].
**(proposal)** Octave "jump-up"-style stab lines and busy neuro riffs are out of scope for the
first sample; add only with a source.

## NOT DnB (generator must avoid)

- Four-on-the-floor kick implication in the bass (hits on 1/5/9/13 every bar) — that is house.
- Tempo outside 160–180, or a hat lane with no 8th skeleton.
- Busy 16th bass with many pitches (the drums, not the bass, carry the speed) [S19].
- Major-key lines or major 3rds; register above ~MIDI 48 for the sub role.
- Heavy triplet swing (> ~62 %) on the hats [S9][S19].
- Pure unison of bass with every hat/snare subdivision; constant open hats.
