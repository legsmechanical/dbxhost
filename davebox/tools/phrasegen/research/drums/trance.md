# TRANCE — drums

Conventions as in `techno.md`. ⚠ **Guide-based only, nothing measured:** there is no open trance
corpus. **(proposal)** marks our own numbers, not a source's.

## Tempo and swing

- **Tempo by substyle:**
  - Genre range 120–150 BPM [K21]; 130–150 [K22]; "classic uplifting trance sits around 138–140"
    [K23]; 138 standard, 136–140 [K25].
  - One lower-authority guide gives progressive 128–134, uplifting 138–142, tech 140–145,
    psy 143–150 and hard 148–160 [K24].
  - Psytrance 125–150, dark psy from ~150 [K26].
  - **Default: 138–140. Psy family: 143–148.**
- **No swing.** Trance is tightly quantised, in contrast to "loose" house [K27]. Tech trance is
  "heavily quantised" [K28].
  - **(proposal)** Even-16th delay 0 ticks; humanise ≤ ±1 tick.

## KICK

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kick | **always** | – | – | – | **always** | – | – | – | **always** | – | – | – | **always** | – | – | – |

- A "kick drum is usually placed on every downbeat" [K21].
- **Psytrance:** the kick must stay on 1/5/9/13 alone. The rolling bass occupies the other twelve
  16ths ("2, 3, 4, 6, 7, 8, 10 … 16") [K29], so any extra kick collides with the bass.
- **Breakdowns:** "a soft breakdown disposing of beats and percussion entirely" [K21]. A breakdown
  phrase is an **empty** kick lane. That is a legitimate trance phrase, not a bug.
- **Velocity:** flat **(proposal 115–127)**, no ghosts.
- **Length:**
  - Psy kick is "a short pitch-swept sine that decays over roughly 150–250 ms" [K29]. At 145 BPM a
    16th is ~103 ms, so the kick is ~1.5–2.4 16ths long → **(proposal)** gate 24–36 ticks at most,
    and never overlapping step+2.
  - Uplifting trance kicks can be longer **(proposal 24–48)**.

## SNARE / CLAP

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clap | – | – | – | – | **always** | – | – | – | – | – | – | – | **always** | – | – | pickup¹ |

- **Placement:** clap or snare on 2 and 4 [K23][K31] = steps 5/13.
- ¹ **Pickup:** the clap has "a quick, triplet flair at the end" [K22].
  - **(proposal)** On a 16-step lane, approximate it with a low-velocity hit on step 16 (or 15+16)
    in bar 2 only.
- **Length:**
  - Claps have a "long tail which leverages the pumping effect" [K27]; reverb tail 0.5–1.5 s [K24]
    (a reverb, not a gate).
  - NI instead says "cut the sample short" [K22].
  - **(proposal)** Clap gate 24–48 ticks. The tail belongs to the FX, not the note.
- **Snare rolls (the trance build-up), a separate phrase type:**
  - A roll is "a quick succession of snare drum hits that build in velocity, frequency, and volume"
    [K21].
  - It "halves its note value every couple of bars (1/8s → 1/16s → 1/32s)" [K25].
  - It is 8 bars of constant 16ths with velocity rising from 16 to max [K30], placed in the "final
    4 bars before drops" [K24].
  - **(proposal)** Encode it as a 4- or 8-bar phrase:
    - bars 1–2: 8ths (odd steps);
    - bars 3–4: 16ths;
    - optional last bar: 16ths plus ratchet ×2.
    - Velocity is a linear ramp 20 → 127 across the phrase. Gate 6–12 ticks.

## HAT (new for trance)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| open off-beat | – | – | **always** | – | – | – | **always** | – | – | – | **always** | – | – | – | **always** | – |
| closed 16ths (later sections) | often | often | – | often | often | often | – | often | often | often | – | often | often | often | – | often |

- **Open off-beat hat:** "a regular open hi-hat is often placed on the upbeat" [K21]; "open
  hi-hats on the off-beats (same rhythm as the bass)" [K23]; it works with the sidechain pump
  [K27].
- **Closed 16ths:** "closed hi-hats running sixteenth notes for energy" [K23].
  - They sit "at least 12 dB below the kick" and enter later in the arrangement [K25].
  - In builds they alternate soft and loud [K24].
- **Psy variant (one tutorial, exact):**
  - Closed hat on every step, with velocities 53/38/78/38 % per beat.
  - Open hat on steps 2,3 · 6,7 · 10,11 · 14,15 [K31].
  - **(proposal)** Treat this as one psy family. Most sources put the open hat on 3/7/11/15 only.
- **Velocity:** **(proposal)**
  - Open off-beats 95–115.
  - Closed 16ths at MIDI ≈ 40/30/60/30 per beat, from K31's percentages × 0.78.
- **Length:** open **(proposal)** 16–22 ticks; closed 3–6.

## TOM

No trance source uses toms in the groove. The genre is kick/clap/hat plus percussion loops, and
"rarely any low-end percussion" in uplifting trance [K27].

- **(proposal)** TOM lane: empty in grooves.
- The only allowed tom phrase is a 1-bar build fill of 16ths on steps 9–16, velocity ramp 60 → 110,
  flagged low confidence.

## PERC

- **Uplifting trance:** "short percussion sounds" and a more broken modern style [K27].
- **Bongos, congas, shakers:** on off-beats [K24] (lower authority). Shakers, rides or a percussion
  loop [K23].
- **Tech trance:** "filtered, dirty or slightly distorted hi-hat sounds and claps" [K28].
- **(proposal)** Perc phrase:
  - shaker 16ths with accents on the off-8ths (vel 80 / 45);
  - or a 2–4-hit off-beat loop (steps 3, 8, 11, 14) at vel 60–90, gate 6–12.
  - No perc on beats.

## CYMB

- **Crash / reverse cymbal on phrase downbeats:** every 16 bars "a reverse cymbal, a downlifter,
  an impact on the downbeat" [K25]; reverse cymbals for movement [K22].
  - **(proposal)** Crash only on step 1 of bar 1 of an 8- or 16-bar phrase, velocity 100–120,
    gate 96+.
- **Ride with the open hat:** "strong ride cymbal coupled with an open hi-hat" (snippet) →
  **(proposal)** ride on 3/7/11/15 at 60–80 as an alternative to the open hat.
- **Arrangement rule:** "Change something small every 8 bars, something bigger every 16" [K25] →
  2-bar phrases stay near-identical.

## 2-bar variations

- Clap pickup on step 16 of bar 2 [K22].
- Open-hat to ride swap.
- Otherwise identical bars [K25].
- Longer forms are the roll phrase and the empty breakdown phrase.

## NOT trance

- Any swing. Any kick outside 1/5/9/13 (it collides with the psy bass [K29]).
- Low toms or congas in the groove [K27].
- Ghost-note snares. A kick that "dominates" the bass [K21].
