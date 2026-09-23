# TRANCE — melodic (uplifting, progressive, psy)

Conventions: `melodic/basics.md` § Conventions. `[Sn]` = `melodic/SOURCES.md`; `D5` = Chordonomicon.
**(proposal)** = ours. ⚠ The most concrete step/velocity numbers are from tutorial vendors (myloops.net
[S188][S190][S192][S195][S198][S200], tranceproducer [S196], readyformasterclass [S197], TPS [S189]);
Wikipedia [S186][S187][S191] backs the genre-level claims. D5: 233 songs (chord sheets).

## Tempo, mode, harmony

- **120–150 BPM** [S186]; uplifting 135–140 [S187] / 138–140 [S188]; psytrance 125–150 [S191] (worked
  example 145 [S190]); progressive — no cited range (example 132 [S198]). Default uplifting 138,
  progressive 130, psy 145.
- "Rapid arpeggios and minor keys are common features of trance, the latter being almost universal"
  [S186]; uplifting progressions "usually rest on a major chord" [S187] (i.e. the minor-key loop's
  major chords VI/III/VII).
- Progression: **i–VI–III–VII** "descending root motion, resolves back to the tonic every 8 bars"; "two
  bars per chord—an 8-bar loop"; "new producers change chord every bar" (anti) [S192]; "add the 9th … the
  defining harmonic colour" [S192]; sus2 → minor [S192]; i–VII–VI–VII and VI–VII–i (snippet [S192]);
  major lists vi–IV–I–V, I–V–vi–IV [S193]; breakdown i–iv–VII–III [S200].
- **Measured (D5)**: minor-proxy songs use bVII in **77 %**, bVI in 70 %, and the major V in only **20 %**
  (rock 42 %) ⇒ Aeolian, not harmonic minor, for chord-level trance; root motion up a 5th (= down a 4th,
  27 %) is the commonest — consistent with the descending i–VI–III–VII chain.
- Psy: Phrygian "one of the most used scales", harmonic minor for leads, natural minor for breakdowns
  [S199]; minor-2nd moves in leads (snippet [S199]).
- Storage: `min`; Phrygian b2 = deg1 acc−1; harmonic-minor 7 = deg6 acc+1 (psy leads only).

## BASS

- Rolling: "kick on every quarter, bass on every 16th between the kicks" → steps 2-3-4, 6-7-8, 10-11-12,
  14-15-16 [S188]; "every note is a 16th, cut short … can't overlap the next kick" [S188]; "pitch tracks
  the chord root" [S188]; variation = "a walk-up, a leading tone, or a jump to the fifth" [S188];
  "drop the velocity on the '&' of each beat by 8–12" [S188].
- Family: off-beat "donk" (3/7/11/15), double off-beat (pairs), rolling (every 16th), octave-jump 8ths,
  syncopated [S189]. Psy KBBB: kick 1/5/9/13, bass on the other 12 steps, length "half to three-quarters
  of a 16th", root "F1–A1" [S190]; "pounds constantly" [S191].
- **Register**: F1–A1 = MIDI 29–33 roots (psy) [S190]; uplifting roots MIDI 33–45 (proposal).

```
RB1 rolling KBBB           .xxx.xxx.xxx.xxx   R on all; vel 100/88/100 per beat (& = −10); L=16 ticks      [S188][S190]
RB2 off-beat donk          ..x...x...x...x.   R (all), L=1                                              [S189]
RB3 octave-jump 8ths       x.x.x.x.x.x.x.x.   R 8 R 8 …                                                 [S189]
RB4 rolling + walk-up      .xxx.xxx.xxx.xxx   R R R | R R R | R R R | R 2 b3 (→ next chord root)        [S188]
RB5 2-bar chord follow     .xxx.xxx.xxx.xxx | same   bar 1 i, bar 2 bVI (two bars per chord → often SAME root both bars) [S188][S192]
```

## CHORD (supersaw / gated chords)

- Voicing "between roughly A3 and C5; keep the top voice almost stationary across inversions" [S192] =
  **MIDI 57–72**; 9ths; sus2→min [S192]. Supersaw 7 voices [S192]. Gate: "a gate sequencer which
  quickly adds a rhythm to a pad or lead" [S194], chopping "whole, un-broken chords" (snippet [S194]).
- **Chord rate in a 2-bar phrase: 1 chord** (2 bars per chord) [S192]; a 2-bar phrase may hold one
  chord, or cover half of an i–VI move only when the caller asks for "fast" (proposal).
- **Velocity (proposal)**: gated 16ths 90–110 with the 8ths +10.

```
RC1 gated 16th chord     xxxxxxxxxxxxxxxx | same   i(add9) {R 2 b3 5}, gate 50 %            [S194][S192]
RC2 trance-gate pattern  xx.xx.x.xx.xx.x. | same   i(add9), gate 60 %                        (proposal, [S194])
RC3 sus2 → minor         x=============== | x===============   isus2 {R 2 5} → i {R b3 5}, top voice fixed [S192]
RC4 off-beat supersaw    ..x...x...x...x. | same   VI(add9) short stabs                      (proposal)
```

## ARP

- "Start with Up, 1/16, 2 octaves" [S195]; gate "30–45 %: tech-trance/prog stabs; 45–60 %: classic
  pluck; 60–80 %: modern uplifting; 85–100 %: rolling/legato lead" [S195]; velocity "100 / 80 / 100 / 90
  across the 16ths, with the pattern accents pushed to 110–120" [S195]; order "Root, 5th, octave, 5th";
  worked example A3 E4 G4 E4 A3 C5 E5 C5 then "bar 2 keeps the rhythm but moves under an F major chord"
  [S195]; rhythmic alternatives dotted 8ths, 3-3-2, silence [S195]; filter-envelope "plink" [S196].
- Register: example spans A3–E5 = MIDI 57–76 [S195].

```
RA1 R-5-8-5 up 16ths      xxxxxxxxxxxxxxxx | same   R 5 8 5 …; bar 2 under bVI; vel 100/80/100/90   [S195]
RA2 worked-example shape  xxxxxxxxxxxxxxxx   R 5 b7 5 R b3' 5' b3' (×2)                          [S195]
RA3 3-3-2 arp             x..x..x.x..x..x.   R 5 8 | R 5 b3'  (3+3+2 grouping per half bar)          [S195]
RA4 dotted-8th            x..x..x..x..x..x   R 5 8 b3' 8 5  (6 per bar, rolls over)              [S195]
RA5 2-octave up           xxxxxxxxxxxxxxxx   R b3 5 8 b3' 5' 8' 5' …                            [S195]
```

## LEAD (anthem hook, prog pluck, psy lead)

- "Built on surprisingly few notes — often 4 to 6"; "stepwise motion with occasional leaps"; peak note
  "once or twice per 8-bar phrase"; "leave gaps" [S196]; 4-bar phrase = motif + "the SAME 4-note motif
  played again, with … the resolution note … changed" [S197]; peak note ≥ 1.5× longer; contour "anchor,
  climb, peak, resolution"; "the minor 3rd to perfect 5th climb" [S197].
- Progressive: ≤ 5 distinct pitches per 8 bars; "1.5–2 octave range"; plucks "on the 16th grid … identity
  … in which 16ths you leave out"; "two bars of pluck grooving, two bars of lead answering" [S198].
- "One central 'hook'" through the track [S186]; psy leads change "every eight bars" [S191].
- ⇒ a 2-bar lead = **one half of the call/response** (proposal): 3–6 notes, one held peak.

```
RL1 anthem call (bar 1–2)     x.x.x.x=x===.... | x.x.x.x=========   R b3 5 b3 5(held) | R b3 5 b7(peak, held 9 steps) [S197][S196]
RL2 anthem answer             x.x.x.x=x===.... | x.x.x.x=====....   R b3 5 b3 5(held) | R b3 5 R(resolution changed) [S197]
RL3 prog pluck (gaps)         x.xx.x.xx.x..x.x   R b3 R 5 b3 R 5 b7 5  (16th grid with holes)                  [S198]
RL4 psy Phrygian lead         xxxxxxxxxxxxxxxx   R b2 R b3 R b2 R 5 … (b2 = acc−1), harmonic-minor 7 allowed  [S199]
```
Register (proposal): MIDI 69–88; "1.5–2 octave range" is over 8 bars [S198] ⇒ ≤ 12 st per 2 bars.

## PAD

- Breakdown pads: "slow attack (half a second to a second), long release"; three layers "sub-anchor,
  chord body, air shimmer"; breakdown progression i–iv–VII–III [S200]; two bars per chord gives "the pad
  time to swell" [S200]; wash effects as "background fill" [S187]; breakdowns drop the beat [S186].
- **(proposal)**: 1 chord per 2 bars, 4–6 notes (add9, octave doubles), width 19–31 st, vel 55–75.

```
RP1 add9 swell       x=============== | ================   i(add9) {R 5 b3' 2'' } wide   [S200][S192]
RP2 sus2→min         x=============== | x===============   isus2 → i                      [S192]
```

## NOT trance

- Chord change every bar in uplifting/prog [S192]; functional major V (D5: 20 %).
- Heavy filter LFOs / pitch-mod on the rolling bass (that is psy vs uplifting) [S188]; bass on the kick
  steps in KBBB [S190].
- Leads with > 6 pitches per 2 bars or wide random leaps [S196][S198]; no rests [S196].
- Swing on 16ths (trance is straight — proposal).
