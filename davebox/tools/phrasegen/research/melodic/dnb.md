# DRUM & BASS — melodic (chord / arp / lead / pad)

Conventions: `melodic/basics.md` § Conventions. BASS is in `../dnb.md`. `[Sn]` = `melodic/SOURCES.md`;
`D5` = Chordonomicon (89 songs — indicative). **(proposal)** = ours. ⚠ Low confidence outside liquid
chords: no note-level lead/arp source exists for DnB.

## Tempo, mode

- **160–180 BPM** [S11]; liquid "165-175BPM, but the most common one is 174BPM" [S101]; jump-up 174–178
  (snippet [S242]). Default 172–175. Melodic parts often feel **half-time** (chord per bar = 2 beats at
  87) — the 16-step grid still runs at full tempo.
- "Most Liquid is written in a minor key, with F Minor being the most common" [S101]; "jazz, soul and
  sometimes blues" influence [S103].
- D5: 37 % minor-proxy (highest after EBM/electro/hip-hop); major V in only 18 % of minor songs.

## CHORD (liquid Rhodes / keys)

- "Extended chords - such as major sevenths and minor ninths" [S102]; example progression "Am9, Cmaj7,
  Em7, Am9, Cmaj7sus4/F, E" [S102]; "Insert a new chord on the downbeat of each bar" [S102]; "Am9 and
  Cmaj7 are basically the same chord … with a different bass note" [S102]; ends on "E major instead of
  the expected Em7" (major V as a turnaround) [S102]; "incidental chords that just slightly alter the top
  notes" [S102]; Rhodes 7th/9th voicings "the hallmark" (snippet [S243]); "block chords rather than
  spread out" (forum snippet [S244]).
- ⇒ **1 chord per bar**, 4–5 notes, close voicing (width 7–14 st), MIDI 55–74 (proposal); within the bar
  1–3 re-attacks at half-time positions (1, 7/8, 11) that echo the two-step kick (proposal from
  [S7][S9] kick 1 + 11).
- Velocity (proposal): 70–95, soft (keys under a loud break).

```
NC1 bar-per-chord Rhodes   x=========x===== | x=========x=====   i9 {b3 5 b7 9} | bIIImaj7 {3 5 7 9 of bIII} [S102]
NC2 two-step echo          x=====..x.x===== | same   i9 → re-attack on 9/11 (kick 11)                 (proposal, [S102][S7])
NC3 top-note motion        x=======x======= | x=======x=======   same chord, top voice 9 → b3' → 9 → 5 [S102]
NC4 turnaround major V     x=============== | x=======x=======   i9 | v7 → V major (its 3rd = leading tone 7 = min deg6 acc+1) [S102]
```

## ARP

**Not an established DnB idiom** (no source). **(proposal)** skip, or use a generic 16th arp at gate
30 % from `basics.md` over a liquid m9 — mark such phrases genre "basics".

## LEAD

- Neuro "riffs" are mid-bass sound design (detuned oscillators, portamento), not melodic leads [S105];
  liquid uses "smooth synth lines" [S103]; no note-level rules found.
- **(proposal)** liquid lead: 3–6 notes per 2 bars, long (≥ 4 steps) notes on half-time positions,
  minor pentatonic + 9 (R 2 b3 4 5 b7), MIDI 67–86, legato with glide.

```
NL1 half-time lead     x=======..x===== | x===============   5 … b7 | R' (held)         (proposal)
NL2 pentatonic answer  ....x===x===x=== | x=======........   b3 4 5 | b3               (proposal)
```

## PAD

- "Atmospheric pads and samples" [S11]; InsideInfo layers pads "some playing high notes and some taking
  care of the lower, warmer sounds" [S104]; "leave enough space between chord changes" (snippet [S245]).
- **(proposal)**: 1 chord per bar (following NC), or 1 per 2 bars; 4–6 notes, width 19–31 st (low + high
  layers per [S104]), vel 50–70.

```
NP1 layered m9       x=============== | x===============   i9 low {R 5 b7} + high {9 b3'} | bVImaj7  [S104][S102]
```

## NOT DnB (melodic)

- Chords changing more than once per bar at 174 (proposal: harmonic rhythm is half-time).
- Major-key bright triads as the default (liquid is minor [S101]); root-position wide triads [S244].
- Busy 16th arps/leads that compete with the break (proposal); four-on-the-floor chord stabs.
