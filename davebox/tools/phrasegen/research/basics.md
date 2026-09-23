# BASICS (genre-less "bread and butter")

Conventions as in `house.md` (16 steps/bar, 96 PPQN: 16th = 24 ticks, 8th = 48). These are
pattern *archetypes*; they must be exact (a "straight 8ths" phrase that isn't straight 8ths is a bug),
with only velocity/micro-timing humanised. **(proposal)** = ours.

## Timing primitives

- **16th swing** (Linn/MPC): delay the even 16ths; 50 % straight, 54 % loosens without audible swing,
  66 % = triplet, useful 50–~70 % [S5]; FL/Cubase 0 % = 50 %, FL 100 % = 66.6 % [S6].
  Delay = 48·s/100 − 24 ticks → 54 % ≈ 2, 58 % ≈ 4, 62 % ≈ 6, 66.7 % = 8.
- **8th shuffle**: long–short 8th pairs, ratio 2:1 (triplet) up to 3:1 (dotted 8th + 16th) [S14];
  ratios narrow at fast tempos [S15]. At 96 PPQN the off-beat 8th moves from tick 48 to **64**
  (2:1, delay 16) or **72** (3:1, delay 24) within each beat. **(proposal)** default 2:1; at > 140 BPM
  cap at ~1.6:1 (delay ~11) per [S15].
- **Humanise, not swing**: moving even 16ths "a bit later … a very small amount, not noticeable
  swing" [S24]; human hats in GMD sit 0.4–2.7 ticks early on average and vary per slot (D1).
  **(proposal)** ±2 ticks jitter max for "basic" phrases.

## HATS — archetypes (1 bar; `x` hit)

| name | grid | velocity shape (MIDI) |
|---|---|---|
| straight 8ths | `x.x.x.x.x.x.x.x.` | beats 75–90, off-beats 60–75 (GMD rock: beats 77–84, off-8ths 69–73, D1) |
| straight 16ths | `xxxxxxxxxxxxxxxx` | beats 80–95, off-8ths 60–75, 16ths 35–55 (GMD funk tiering, D1); flat velocities sound mechanical [S30] |
| quarters | `x...x...x...x...` | 80–95, flat ±6 |
| off-beat 8ths | `..x...x...x...x.` | 90–110 flat; long gate for "open" feel (disco/house trope [S13][S7]) |
| 8ths + off-beat open | `x.x.x.x.x.x.x.x.`, off-beats long-gated | beats 60–75, off-beats 95–115 [S13][S24] |
| shuffle 8ths | 8 hits/bar, off-beats at tick 64 of each beat | long note 80–95, short note 55–70 [S14] |
| swung 16ths | `xxxxxxxxxxxxxxxx`, even steps delayed 4–8 ticks | as straight 16ths |
| 16th "gallop" pickups | `x.xxx.xxx.xxx.xx` | pickups (the pair before each beat) 45–65 **(proposal)** |

**2-bar variation (proposal):** bar 2 identical except the last beat (open-gate on 15, or 16th pair
15–16); archetypes should otherwise stay literal.

## BASS — archetypes (1 bar; degrees under hits; L = length in steps)

```
B1 root 8ths (pedal)        x.x.x.x.x.x.x.x.   all R, L=1.5–2 (legato-ish)      [S27]
B2 root quarters            x...x...x...x...   all R, L=3–4                     [S27]
B3 octave 8ths              x.x.x.x.x.x.x.x.   R 8 R 8 R 8 R 8, L=1             [S13]
B4 root–fifth (two-feel)    x.......x.......   R  5, L=6–8                      (convention; no source fetched)
B5 kick-doubled             follows the kick lane step-for-step, all R          [S27][S22]
B6 off-beat 8ths            ..x...x...x...x.   all R, L=1                        [S22]
B7 shuffle root             8th-shuffle grid (off-beat at tick 64), R 8 or R R   [S14]
```

- **Length**: "Rhythm isn't just about note placement, it also includes note length"; legato vs
  staccato, most real playing ends "just before the next" note [S27] → **(proposal)** default gate
  = 85–90 % of the gap to the next note for B1/B2, 40–50 % for B3/B6.
- **Register (proposal)**: root around MIDI 28–40 (E1–E2); octave notes ≤ 52.
- **Pitch set**: root only for B1/B2/B5/B6; root+octave for B3; root+5th for B4. Anything else is
  not a "basic" phrase.

## NOT a basic (anti-patterns)

- Any deviation from the archetype grid (missing/extra hits) — variation belongs to the genre sets.
- Swing applied to "straight" names, or straight timing on "shuffle" names.
- Random velocity without the beat > off-beat > 16th tiering (D1: present in GMD funk, rock,
  hiphop and soul; only GMD `dance` reverses beat vs off-beat, as the off-beat archetypes do).
- Pitches outside the archetype's set; notes overlapping the next note (monophonic lane).
