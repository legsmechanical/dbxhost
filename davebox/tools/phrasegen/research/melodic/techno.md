# TECHNO — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon.
**(proposal)** = ours. ⚠ Several of the most concrete step-level numbers come from tutorial vendors
(myloops.net [S164][S167]); Attack Magazine and Wikipedia are the stronger sources. D5 has only 58
techno songs (chord sheets) — indicative only.

## Tempo, mode

- **120–150 BPM** [S160]; minimal 125–130 [S161]; dub techno 110–125 [S162] (Attack's Basic
  Channel-style example runs 145 [S163]); melodic techno 120–124 [S164]. Default 128–134.
- "Typical harmonic practices … are often ignored in favor of repetitive sequences" [S160]; "vocals and
  melodies are uncommon" [S160]; minimal = "rhythm and repetition instead of melody" [S161].
- Minor: "Major triads are a bit too happy for techno, so you'll mainly want to use the minor ones"
  [S173]; "Most Detroit techno is Minor chords" (forum [S170]); Aeolian "the default. Dark", Dorian
  "slightly hopeful" (melodic techno [S164]). No source ties classic Detroit to Dorian — **don't claim it**.
- D5 (58 songs): in minor-proxy songs the major IV appears in only **12 %** (lowest of all genres; rock
  42 %) while bVII (81 %) and bVI (75 %) are common ⇒ **Aeolian, not Dorian**, for chord-sheet techno.
- Storage: `min`; Phrygian b2 only for acid/darker riffs (proposal).

## BASS

- Rolling: "Leaving the first 16th-note of every beat empty is important to prevent clashing with the
  kick" [S165]; "relied on the G note, programming it in almost every 16th note, with some other notes
  thrown in" [S165]; register "within the C2 octave range" [S165].
- Off-beat: "Bass notes are placed between each kick drum" with "medium length … sharp attack" [S166];
  steps 3/7/11/15 "each roughly a 16th long" [S167]; ~**70 % root**, rest 5th and b7 ("properly dark and
  modal") [S167]; velocity "alternate 100 and 85 across the offbeats … ghost notes to 60" [S167];
  length short (32nd) / medium (16th, default) / long (8th+) [S167]; "drop one offbeat entirely … the
  bar before a chord change" [S167].
- Dub techno: sub on root and 4th (i/iv), sidechained [S163]; "deep, repetitive basslines" [S162].
- **Register**: C2 octave (MIDI 36–47) [S165]; sub roots 28–40 (proposal).

```
TB1 rolling (no beat 16ths)  .xxx.xxx.xxx.xxx   R on all, one b7 and one 5 per bar, L=1, vel 90/75 alternating [S165]
TB2 off-beat 16th            ..x...x...x...x.   R R 5 R (vel 100/85/100/85), L=1              [S166][S167]
TB3 off-beat + ghost         ..xg..x...xg..x.   R (g R vel 60) R R (g) R                      [S167]
TB4 skip before change       ..x...x.......x. | ..x...x...x...x.   bar 1 drops step 11; bar 2 on iv  [S167]
TB5 dub sub                  x=======x======= | x=======x=======   R | 4 (i → iv) long, sidechained  [S163]
```

## CHORD (dub stabs, Detroit chords, parallel stabs)

- Parallel stabs: "all chords need to have the same shape (inversions)"; "each last only one
  16th-note"; "emphasize hits that don't occur on downbeats"; "add 7ths and 9ths" [S168].
- Dub: minor 7th is "a great starting point" (snippet [S239]); 1/8-dotted delay ~20 % feedback [S163]
  [S169]; "nudge some of the notes around … looser feel" [S169]; "sparse chord progressions and subtle
  changes" [S162].
- Detroit: min7 + sub root recipe "0, 3, 7, 10, −24"; sampled one-chord played up and down the keys
  (= parallel) (forum [S170]).
- Melodic techno stab "on the 'and' of 2 and the 'and' of 4" = steps **7 and 15** [S164]; "peak-time
  techno might change chord every bar; melodic techno holds each chord for 2 or 4 bars" [S164]; voicing
  "three notes — root, third and fifth" [S164].
- **Register (proposal)**: stab MIDI 55–72, width 7–10 st (closed m7). **Velocity (proposal)**: 90–110,
  flat (delay supplies the dynamics).

```
TC1 dub m7 off-16ths      ...x..x....x..x.   i7 {R b3 5 b7} L=1 step (delay implied)           [S168][S169]
TC2 melodic-techno pair   ......x.......x.   i triad on 7 and 15, L=2                          [S164]
TC3 parallel one-shape    ..x..x...x..x...   m7 shape on R, R, b7, b6 roots (parallel — leaves the scale) [S168][S170]
TC4 one chord 2 bars      x=..x..x..x..x.. | same   i9 short stabs, same chord both bars          [S164][S162]
TC5 peak-time change      ..x..x..x..x..x. | ..x..x..x..x..x.   bar 1 i, bar 2 bVI (or bVII)       [S164][D5]
```
⚠ TC3 / parallel chords produce out-of-scale notes by design: store them as `acc` offsets on the
degree-mapped root, not as a scale-snapped chord.

## ARP (sequences / 303 lines)

- "303 Patterns are 16 steps in length by default"; accents raise "volume and filter envelope depth";
  slides; octave up/down; ties; "a simple, repetitive pattern livened up with one or two flourishes"
  [S171]; each step = note-on / tie / rest, one-octave pitch range plus up/down flags [S172];
  accents on off-beats (snippet [S171]).
- **(proposal)** gate 25–50 % (ties = 100 %+), 1 octave + occasional ±12, flat vel 90 with accents 115.

```
TA1 303 minor line    x.xxx.x.xx.x.xx.   R R b3 R 8 b7 R 5 R b3  (accents on 3/7/15, slides 4→5 and 14→15) [S171][S172]
TA2 one-note + octave xxxxxxxxxxxxxxxx   R R 8 R R R 8 R … accents on off-8ths                          [S171]
TA3 Phrygian riff     x..x..x.x..x..x.   R b2 R b3 b2 R  (b2 = min deg1 acc−1)                        (proposal)
```

## LEAD

- Leads are rare [S160][S161]; stabs, "industrial hits, or filtered vocal snippets" do the melodic work
  [S174]; melodic-techno lead = "4 to 8 notes across 4 bars, with long held tones and audible gaps"
  [S164] ⇒ within 2 bars **2–4 notes**.
- No source for a named "1-bar riff" idiom. **(proposal)** a lead phrase = 2–4 notes / 2 bars, each
  ≥ 4 steps, stepwise or 5th/octave moves, MIDI 67–84.

```
TL1 sparse melodic-techno   x=======....x=== | ........x=======   5 … b7 | … b3 (held)   [S164]
TL2 stab-as-lead            ......x.......x.   b7+R' dyad on 7/15 (same as TC2 rhythm)    [S164][S174]
```

## PAD

- Minor triads, thickened by "adding different octaves of the notes they already contain" [S173];
  "slow attack and release, sitting in the background" [S174]; Detroit "rich synthetic string
  arrangements" [S175][S176]; melodic techno 2–4 bars per chord, loops i–VI, i–VII–VI, i–iv–VII,
  i–VI–III–VII [S164].
- **(proposal)**: within a 2-bar phrase **1 chord** (or 2 for peak-time), 3–5 notes incl. octave
  doublings, width 12–24 st, vel 50–70.

```
TP1 held minor + octave   x=============== | ================   i {R b3 5 R'} held 2 bars   [S173]
TP2 two-chord             x=============== | x===============   i → bVI                     [S164]
```

## NOT techno

- Major-key triads as the harmonic default [S173]; functional V→i cadences; 4-chord changes per bar.
- Busy melodic leads; long legato solos; swing > 58 % (proposal).
- Bass on the kick's 16th (step 1/5/9/13) in the rolling family [S165]; wide bass leaps.
- Chord stabs with changing voicing shape in the parallel family [S168].
