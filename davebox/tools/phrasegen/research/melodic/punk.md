# PUNK — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon
(**16,060** songs, main genre `punk`, incl. pop punk). **(proposal)** = ours.

## Tempo, rhythm, mode

- **150–180 BPM** [S201]; Ramones "usually around 180 to 200 bpm" [S215]; "Basket Case" 170 [S216];
  pop punk 140–170 (snippet [S237]). Default 160–180.
- "Syncopation is much less common" than in other rock; 4/4 verse-chorus [S217]; "stripped down to one or
  two guitars, bass, drums and vocals" [S217].
- **Measured (D5)**: 86 % major-proxy (most major of all genres); chord tokens maj 72 %, min 19 %,
  **power 6 %** (highest), dom7 1 %, m7 0.4 %; 33 % of sections use exactly 4 distinct chords; major
  songs contain bVII 41 %; minor songs bVII 77 %, bVI 73 %.
- Storage: `maj` (I–IV–V, I–V–vi–IV); `min` for the minority of Aeolian songs.

## BASS

- "Relentless, repetitive 'forced rhythm'" [S217]; "down-picked eighth notes on the root note of each
  chord" (snippet [S236]); no slap, syncopation or extended chords (snippet [S235], low authority).
- **(proposal)** root 8ths, every 8th hit, flat velocity 100–115 (downstrokes = even accents), gate
  70–85 %, register MIDI 28–45; chord changes on beat 1 or beat 3 only.

```
PB1 root 8ths          x.x.x.x.x.x.x.x.   R ×8                                [S217][S236]
PB2 root 8ths, 2 chords x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   I | IV (1–8) V (9–16) [S218][S219]
PB3 root 16ths (fast)  xxxxxxxxxxxxxxxx   R ×16 (hardcore)                    (proposal)
```

## CHORD

- "Highly distorted power chords or barre chords … 'buzzsaw drone'" [S217]; "the most used chord type in
  punk rock is probably the power chord" [S219]; Johnny Ramone's "extremely fast eighth-note downstroke
  picking" [S215]; "each measure starts with a quarter-note followed by a string of eighth-notes" and
  full barre chords too [S218]; I–IV–V [S218][S219]; pop punk = I–V–vi–IV ("pop-punk progression" [S220]);
  "Basket Case" verse I–V–vi–iii–IV, chorus IV–V–I, all no-3rd [S216]; power chords "accented then muted"
  [S209]; quarter + three beats of palm-muted 8ths (snippet [S219]).
- **Voicing**: {R 5 8} (power) or root-position barre triad; MIDI 40–64. **Velocity (proposal)**: flat
  105–120 (downstrokes), muted 8ths 85–100. **Length**: open quarter L=4 steps, 8ths L=2 (buzzsaw is
  near-legato), muted 8ths 10–14 ticks.

```
PC1 downstroke 8ths         x.x.x.x.x.x.x.x.   I5 ×8, flat vel                          [S215]
PC2 quarter + 8ths          x===x.x.x.x.x.x.   I5 quarter then 8ths                      [S218]
PC3 I–IV–V in 2 bars        x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   I5 | IV5 (1–8) V5 (9–16)  [S218][S219]
PC4 pop-punk I–V–vi–IV      x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   I5 V5 | vi5 IV5 (half-bar each) [S220]
PC5 accent-then-mute        x===x.x.x.x.x.x.   open accent (vel 120, L=4) then muted 8ths vel 85   [S209][S219]
```

## ARP / PAD

**No idiomatic punk arp or pad** — instrumentation is guitars/bass/drums/vocals [S217]. **(proposal)**
Do not generate PUNK×ARP or PUNK×PAD (new wave, not punk, adds keyboards [S221]).

## LEAD

- "Complicated guitar solos were considered self-indulgent, although basic guitar breaks were common"
  [S217]; "Basket Case" melody "Eb3 – F4" (**14 semitones**), "100 % diatonic", **69 % chord tones**
  [S216].
- **(proposal)**: vocal-like hook, 8ths/quarters, 4–8 notes per bar, diatonic major, ≥ 65 % chord tones on
  beats, range ≤ 14 st, MIDI 64–84; or a "guitar break" = the chord's root/5th in 8ths an octave up.

```
PL1 diatonic hook      x.x.x.x.x===....   3 3 2 R 2 (held)          (proposal, [S216])
PL2 octave break       x.x.x.x.x.x.x.x.   R' R' 5 5 R' R' 5 R'     (proposal)
```

## NOT punk

- Syncopated 16th grooves, swing, extended chords (m7/maj7/9ths) [S217][S235]; D5 m7 share ≈ 0.
- Long solos, chromatic runs [S217]; arps and pads.
- Tempos below ~140; chord changes on weak 16ths.
