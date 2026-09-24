# POST-PUNK / GOTH (incl. darkwave, coldwave) — melodic

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon
(**1,969** songs tagged post-punk / uk post-punk / american post-punk / gothic rock / dark wave /
deathrock / ethereal wave). **(proposal)** = ours. ⚠ Sources are Wikipedia song/band pages and one
bass blog; song tempos are songbpm.com automatic estimates. No step-level or velocity source exists —
cells are constructed from the descriptions. **Owner priority genre.**

## Tempo, feel, mode

- Song tempos (songbpm, automatic): "A Forest" 163 (half-time 82) [S300], "Love Will Tear Us Apart" 163
  [S301], "Transmission" 156 [S302], "Disorder" 175 (half 88) [S303], "Spellbound" 149 [S304]. ⇒ **150–175
  counted in 8ths** = driving 8th pulse; on a 16-step grid use **130–160 BPM with 8th drive**, or treat as
  half-time 75–88 with 16ths (proposal).
- Darkwave: "relatively slower tempos, lower pitches, and more minor keys" than new wave [S310]; "largely
  based on minor key tonality" [S310]; coldwave "militant rhythm sections", "minimalist approach"
  [S334].
- Drums: goth beats "hypnotically dirgelike or tom-tom heavy and 'tribal'", drum machines "downplaying
  the rhythm's backbeat" [S312]; motorik 4/4 adopted by Joy Division [S332]; Budgie "mostly toms"
  [S333]; "Bela Lugosi's Dead" in "a bossa nova style" [S321].
- Harmony: "minor chords, reverb, dark arrangements, and melancholic melodies" [S312]; drones "used by the
  Velvet Underground" [S312]; post-punk dropped "three-chord progressions and Chuck Berry-based guitar
  riffs" [S311]; "A Forest": A minor, **Am–C–F–Dm = i–bIII–bVI–iv** [S324]; "Disintegration": "slow,
  'droning' guitar progressions" [S325]. Major-key contrast exists ("Just Like Heaven" A major, A–E–Bm–D
  [S326]).
- **Measured (D5)**: only 21 % minor-proxy (chord sheets of the whole post-punk tag, incl. jangly/major
  acts — **the minor lean described by [S310][S312] is not visible at chord-sheet level**; generator
  should still default minor for the goth/darkwave family, major allowed for "post-punk pop");
  **sections with only 2 distinct chords 19 %** (rock 10 %) and 1 chord 4 % ⇒ **vamps/drones**; power
  chords 4 %; minor songs: bVII 66 %, bVI 64 %, major IV 40 %.
- Storage: `min` (Aeolian; no documented Dorian/Phrygian habit — don't invent one).

## BASS — the lead instrument

- Post-punk bassists took "a melodic role", "freeing guitarists to experiment with atmosphere" [S311];
  goth "high-pitched basslines that often usurped the melodic role" [S312]; Hook plays "melodies on the
  high strings with a signature heavy chorus effect" [S313]; "the only time it sounded decent was when you
  played high up on the D and the G strings" [S314]; "repeating melodies"; refuses to "just follow the
  root note" [S314]; Joy Division: "Hook's bass carried the melody, … guitar left gaps" [S316]; "She's
  Lost Control": bass "played high up on the neck" [S317]; past the 9th fret (snippet [S315]).
- Gallup (Cure): "eighth notes, strategic octave jumps, and melodic anchors on chord tones", "melody first,
  root notes second", repetition "like obsession" [S318] (blog); "Primary" = two basses, no guitars [S320];
  Bauhaus "dub-influenced bass", "three-note bass line" [S321][S322]; Sisters "pulsating bass" [S323] =
  the 8th root-pedal family.
- **Register**: D/G strings above fret 9 ≈ **MIDI 47–67** [S314][S315] (proposal conversion) — i.e. at or
  above the bass anchor (36) by +1 octave. The pedal family sits low (MIDI 28–45).
- **Length (proposal)**: melodic family legato-ish 8ths (gate 80–95 %); pedal family 70–85 %.
  **Velocity (proposal)**: flat-ish 90–105 (picked), accent beat 1.

```
PB1 high melodic 8ths      x.x.x.x.x.x.x.x.   R' b3' 5' 4' b3' R' b7 R'  (oct +1, stepwise, 1-bar repeat) [S313][S316][S318]
PB2 8ths + octave jumps    x.x.x.x.x.x.x.x.   R R' b7 5 R R' b3' R'                          [S318]
PB3 3-note dub figure      x=====..x.x=====   R … b7 b3' (repeated, space between)            [S322][S321]
PB4 root pedal (Sisters)   x.x.x.x.x.x.x.x.   R ×8, low register                              [S323]
PB5 2-bar melodic answer   x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.x.   bar 1 as PB1 | same first 6, ends 4' 5' → [S314][S318]
PB6 chord-tone line (A Forest-style changes) x.x.x.x.x.x.x.x. | same   i: R' b3' 5' b3' | bIII: 3 5 R … (chord tones of i–bIII) [S324][S318]
```

## CHORD (sparse guitar / drone voicings)

- "Guitar left gaps rather than filling up" [S316]; open-string drones: "partial barre chords and leaving
  the top E and B strings open" [S322]; Smith "preferred single notes for simplicity" [S329].
- **(proposal)**: few attacks (1–4 per bar), long ring (≥ 1 beat), voicings = triad + **a fixed drone note
  held across chord changes** (common tone, e.g. 5 or R' on top), MIDI 52–76, width 12–19 st, vel 70–95.

```
PC1 ringing drone chord    x=============== | x===============   i {R 5 R' b3'} | bVI with the same top R' (drone) [S322][S312]
PC2 gap-leaving stabs      x=====.....x==== | ................   i … i  (bar 2 empty = "gaps")       [S316]
PC3 i–bIII–bVI–iv (A Forest) x=======x======= | x=======x=======   i bIII | bVI iv (half bar each)   [S324]
PC4 two-chord drone vamp   x=======x======= | same   i ↔ bVII, top voice held                        [D5][S325]
```

## ARP (chorused / flanged arpeggiated guitar)

- McGeoch's "inventive arpeggios, string harmonics, the uses of flanger and an occasional disregard for
  conventional scales" [S327]; "Spellbound": "picky thing … very un-rock'n'roll" [S328]; "A Forest": seven
  flangers [S324]; "dark, spare, minimalistic melodies" [S329].
- No note-level source. **(proposal)**: 8ths (or 16ths at the half-time reading), chord tones + an open
  drone string (R' or 5' repeated as every other note), 1.5 octaves, gate 70–100 % (ring), one chord per
  bar; add9/sus2 colour allowed (open strings).

```
PA1 drone-string arp     x.x.x.x.x.x.x.x.   R 5 R' 5 b3' 5 R' 5   (5 = drone, alternate)     (proposal, [S327][S322])
PA2 picked 16ths         xxxxxxxxxxxxxxxx   R' 5 b3' 5 2' 5 b3' 5 …  (sus2/add9 colour)          (proposal, [S328])
PA3 2-bar chord follow   x.x.x.x.x.x.x.x. | same   i then bVI, drone note (R'/5) constant          [S324]
```

## LEAD

- "A Forest" solo "avoids string bends and moving in a pentatonic manner" [S324]; "central hook … a
  descending guitar riff" ("Just Like Heaven") [S326]; lead lines "buried in the mix" [S325]; "slow,
  gloomy guitar line" [S325]; the bass often IS the lead (above) → a LEAD phrase should be sparse and sit
  above the bass register.
- **(proposal)**: 3–6 notes per 2 bars, mostly descending stepwise, long notes (≥ 2 steps), no bends /
  chromatic slides, diatonic Aeolian (not pentatonic-blues), MIDI 67–84.

```
PL1 descending hook      x===x===x===x=== | x===============   R' b7 b6 5 | b3 (held)       [S326][S324]
PL2 sparse gloomy line   x=======....x=== | x=======........   5 … b6 | 5                   [S325]
```

## PAD (Solina strings / organ swells)

- "Atmosphere" used a "Solina String Ensemble" [S330]; the Cure's "string sound from the Solina" [S319];
  "Disintegration" "very lush, very orchestral", "layers of keyboard texture" [S325]; "grandiose
  minor-mode organ swells" [S331]; synths for "foreboding, sorrowful, often epic soundscapes" [S312].
- **(proposal)**: 1 chord per bar or per 2 bars; minor triads (no jazz extensions), octave-doubled,
  width 12–24 st, vel 55–80; common-tone voice leading (drone top note).

```
PP1 Solina minor bed     x=============== | x===============   i | bVI (top voice common tone)   [S330][S312]
PP2 organ swell 2 bars   x=============== | ================   i (held, swell = rising vel not available → long gate) [S331]
```

## NOT post-punk / goth

- Root-only bass under a melodic family ("Why don't you just … " [S314]); Chuck Berry riffs and three-chord
  I–IV–V rock'n'roll [S311].
- Bluesy bends, pentatonic-blues solos [S324]; major-7/9 jazz colour; busy 16th funk syncopation.
- Dense guitar comping that fills every 8th with changing chords ("gaps" [S316]); bright major-key pads
  in the goth/darkwave family [S310][S312].
