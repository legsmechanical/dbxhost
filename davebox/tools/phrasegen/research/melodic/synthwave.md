# SYNTHWAVE (outrun / retrowave, modern 80s revival) — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon
(117 songs tagged synthwave / darksynth — indicative). **(proposal)** = ours. ⚠ The octave-bass rhythm
is supported only by search snippets and by its Hi-NRG/Italo ancestry; the rest is tutorial blogs
(futureproof [S366], EDMProd [S351], unison [S367], orpheus [S368], emastered [S369]) + Wikipedia [S350].
**Owner priority genre.**

## Tempo, mode, harmony

- "Common tempos are between 80 and 118 BPM, while more upbeat tracks may be between 128 and 140 BPM"
  [S350]; "80 BPM all the way up to 140" [S351]. Defaults: 100–118 (mid), 128–140 (outrun drive).
- "Primarily an instrumental genre" [S350]; "8th-note or 16th-note closed hi-hat pattern" [S366];
  gated reverb [S351].
- Progressions: **"i-VI-III-VII (e.g., Am-F-C-G) or i-VII-VI-VII (e.g., Am-G-F-G)"**; "major 7th or minor
  9th chords to add sophistication" [S366]; i–III–VI–VII, I–V–vi–IV, vi–IV–I–V [S367]; "I-VI-IV-V" (likely
  I–vi–IV–V), "fewer chords in verses than choruses" [S368]; EDMProd example D D A G / D D G Em [S351];
  minor keys "darker, moodier" [S369].
- **Measured (D5)**: minor songs contain **bVI 80 % and bVII 83 %** (bVI highest of all genres), major V only
  29 %; **root motion up a whole step is the commonest (19 %)** — the only genre where step motion leads
  (bVI→bVII→i); major songs: bVII 49 %, bVI only 5 %.
- Storage: `min` (Aeolian); maj7/m9 colour allowed.

## BASS

- "Melodic and rhythmic at the same time … complements the chord progression rather than simply holding
  root notes"; register "approximately 60-200Hz" [S366] ≈ **MIDI 35–55**; follows "the root note of each
  chord" with "variations" [S351]; mirrors the chord roots "one or two octaves below" (snippet [S366]);
  "combinations of eighth notes … a nice one-bar loop" (snippet [S367]).
- The **8th/16th octave "outrun" bass**: no direct source (snippets only) — ancestry = Hi-NRG/Italo
  "octave-jumping basslines" [S136][S360]. Mark octave cells **(proposal, lineage)**.
- **Gate (proposal)**: 40–60 % (pluck); **velocity**: flat 95–105.

```
WB1 8th octave drive      x.x.x.x.x.x.x.x.   R 8 R 8 R 8 R 8                     (proposal, lineage [S136][S360])
WB2 16th octave drive     xxxxxxxxxxxxxxxx   R R 8 R  R R 8 R …                   (proposal, lineage [S360])
WB3 chord-root follow     x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   i (R 8) | bVI (R 8) → one chord per bar [S351][S366]
WB4 melodic 8th loop      x.x.xx.x.x.x.xx.   R 8 b7 8 R 5 b3 R 8 (complements, not just roots) [S366]
WB5 i–VI–III–VII in 2 bars x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   i bVI | bIII bVII (half bar each, R/8) [S366][D5]
```

## CHORD

- **(proposal)** synthwave "chords" are usually held pads (below) or a gated/8th pulse: 8th re-attacks on
  the chord (the 8th/16th hat grid [S366]), 3–4 notes (maj7/m9 [S366]), MIDI 55–76, vel 80–100.

```
WC1 8th pulse chord      x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   i(m9) | bVI(maj7)                [S366]
WC2 i–VII–VI–VII         x=======x======= | x=======x=======   i bVII | bVI bVII               [S366]
```

## ARP

- "A synth arpeggio running 16th or 8th notes is a signature synthwave texture" [S366]; "each note of a
  chord separately", plucky filtered sounds that "sit back in the mix" [S351]; "ornately repetitive synth
  patterns, hypnotic chimes" [S350]; 16ths or 8th-note triplets (snippet [S231]).
- **(proposal)**: 16ths (default) or 8ths, up or up-down, 2 octaves, 4 chord tones incl. the 7th/9th,
  gate 30–50 %, flat vel 85–100, chord follows WB (1 per bar).

```
WA1 16th up 2 octaves   xxxxxxxxxxxxxxxx   R b3 5 b7 8 b3' 5' b7' … (m7)       [S366][S351]
WA2 8th chimes          x.x.x.x.x.x.x.x.   R' 5' 9' 5' R' 5' b3'' 5'            [S350][S366]
WA3 chord-follow        xxxxxxxxxxxxxxxx | xxxxxxxxxxxxxxxx   i: R b3 5 8 | bVI: R 3 5 8 (of bVI)  [S366]
```

## LEAD (sawtooth lead)

- Leads "repetitive, yet catchy"; solos with "Glide" for a "live performance" feel [S351]; "shorter
  reverbs for leads" [S369].
- **(proposal)**: 1-bar motif + answer, 4–8 notes/bar, long final notes, stepwise + 4th/5th, glide between
  adjacent notes (overlap 6–12 ticks), MIDI 67–88.

```
WL1 catchy saw motif   x..x..x.x=======   R' b7 5 b3' (held)              (proposal, [S351])
WL2 answer + glide     x..x..x.x======= | x..x..x.x.x=====   same | … b7 R' 5 (glide into 5) (proposal)
```

## PAD

- "A slow attack of 300-500ms and a moderate to long release" [S366]; "reverb is the lifeblood" [S369];
  pedal tone "a sustained tone, typically in the bass" [S368].
- **(proposal)**: 1 chord per bar (following the i–VI–III–VII loop, [S366]) or per 2 bars in verses
  ("fewer chords in verses" [S368]); 4–5 notes (m9/maj7), width 14–24 st, vel 55–75.

```
WP1 lush bar-per-chord  x=============== | x===============   i(m9) | bVI(maj7)      [S366]
WP2 pedal-tone verse    x=============== | ================   i(m9) held, bass pedal R [S368]
```

## NOT synthwave

- Functional major V → i as the default cadence (D5 29 %); jazz ii–V loops.
- Swing; acoustic/guitar-comping textures as the main element; fast chord changes (> 2 per bar).
- Short, dry pads (slow attack + long release [S366]).
