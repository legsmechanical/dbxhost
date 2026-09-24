# PUNK — drums

Conventions as in `techno.md`. **Measured, with a warning:** DK1 over GMD `punk` covers 7 beat
files and 278 bars (200 groove bars, 78 fill bars), all by **ONE drummer** (drummer1) at 128–144
BPM. It shows one player's vocabulary, not the genre. It is also the strongest evidence here,
because it matches the textbook grids [K97–K100] closely. **(proposal)** = our own numbers.

## Tempo and swing

- **Tempo:**
  - GMD punk runs 128–144 BPM (DK1).
  - Guides: 142 (Rancid), 168 (Clash), 180–200 for pop-punk [K97].
  - **(proposal)** Default 150–180. A mid-tempo family at 128–145 (GMD) and a fast family at
    180–200.
- **Swing:** none. No GMD punk file had enough hats to measure it. The guides are straight.
  **(proposal)** Delay 0. "No swing" is also an anti-pattern listed in [K101].

## Three grooves (the families)

| family | kick | snare | cymbal | source |
|---|---|---|---|---|
| **backbeat 8ths** (rock-punk) | 1, 9 + doubles | 5, 13 | 8ths | GMD modal in 1 file (DK4) |
| **skank / polka** | 1, 5, 9, 13 | 3, 7, 11, 15 | every 8th, "in unison with both kick and snare" | [K100] ("sped up 2/4 rock or polka beat") |
| **D-beat** | 1, 4, 6, 9, 12, 14 | 3, 7, 11, 15 | crash doubling the kick, or 8ths in the chorus | [K99] (Wikipedia gives an ASCII grid) |

Also: "snare drum backbeats on every upbeat (or the 'and's), quick doubles played on the bass drum,
and 'sloshy' open hi-hats" [K97]. A basic punk beat puts the kick on 1, 6, 9 and 14 with the snare on
all the "and"s [K98].

## KICK — measured (GMD punk, groove bars)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | **.92** | .04 | .06 | .18 | .41 | **.50** | .14 | .27 | **.66** | .14 | .14 | **.53** | .20 | **.57** | .07 | .15 |
| vel | 68 | 38 | 47 | 50 | 43 | 43 | 52 | 48 | 61 | 43 | 57 | 52 | 35 | 48 | 32 | 43 |

- **The D-beat kick shows up directly.** 1, 6, 9, 12 and 14 are the five highest steps after
  step 5. The top pattern `x...xx..x..x.x..` is 15 % of groove bars (DK1).
- **Velocity:** the kick is quiet except on 1 and 9 (61–68). Ghost share is 46 %.
  - That is this e-kit and drummer. **(proposal)** Do not copy the ghost share. Use 1/9 at 95–115
    and the "quick doubles" at 75–95.
- LHL median 4 (IQR 2–5).

## SNARE — measured

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P | .24⚠ | .03 | **.58** | .12 | **.56** | .05 | **.58** | .12 | .23⚠ | .02 | **.56** | .21 | **.47** | .04 | **.58** | .10 |
| vel | 13⚠ | 11 | **115** | 33 | 87 | 16 | **118** | 24 | 12⚠ | 80 | **114** | 24 | 100 | 37 | **117** | 39 |

- **Off-beat snare family:** the off-8ths (3/7/11/15) carry P .56–.58 at velocity 114–118, the
  loudest hits in the kit.
  - That is Drumeo's "every snare drum backbeat as an accented stroke or a rim shot" on the "and"s
    [K97], and the D-beat/skank snare [K99][K100].
  - The backbeat family (5/13) coexists at 87–100.
  - Top patterns: `....x.......x...` 22 %, `..x...x...x...x.` 13 % (DK1).
- ⚠ **Artefact:** hits on steps 1 and 9 average velocity 12–13 and are 100 % "ghosts". They
  coincide with the kick and are almost certainly **e-kit crosstalk** (a kick-pedal vibration
  triggering the snare pad). **Discard them.** Steps 4/8/12/16 at vel 24–39 may be the same
  artefact or real drags. **(proposal)** Treat them as rare ghosts, ≤ 10 %.
- **Velocity (proposal):** accented off-beat snares 110–127, backbeat snares 100–120. **No ghost
  tier.** Ghost-note snares are "NOT punk" [K101].

## HAT

- **Measured:**
  - Hat in 49 % of groove bars, ride in 30 %.
  - When the hat plays it is 8ths (`x.x.x.x.x.x.x.x.` = 29 % of groove bars) or quarters.
  - Off-8ths are louder (87–96) than beats (67–73) (DK1). That fits the "sloshy" open hat on the
    "and"s [K97].
- **(proposal)**
  - Off-8ths long-gated (16–24 ticks), vel 95–115.
  - On-beats short, vel 65–80.
  - Never 16ths.

## TOM — measured FILL bars (78)

| step | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P(tom) | .36 | .03 | .14 | .00 | **.53** | .01 | .21 | .05 | .49 | .15 | .17 | .10 | **.59** | .21 | .28 | .17 |
| vel | 88 | 78 | 96 | – | 104 | 105 | 103 | 80 | 89 | 109 | 94 | 108 | 112 | 121 | 106 | 86 |

- **Punk toms are on-the-beat:** quarter-note floor-tom figures (`x...x...x...x...` and its
  variants), vel 100–120. They are not 16th runs.
- The GMD fill *files* (51 punk fill files) end with toms at 13–16 at vel 111–125.
- **Placement:**
  - P(fill | 1st bar of a 4-bar phrase) = .56. This drummer marks the downbeat of a phrase with the
    fill; DK2 shows it as the bar-%4 = 0 peak.
  - **(proposal)** Use either a tom-on-quarters bar as a section-start bar, or a 13–16 tom/snare run
    at the end of bar 2.
- Fills are "simple and powerful for punk" [K101].
- **Length (proposal):** 24–48 ticks.

## PERC

None in GMD. No punk source mentions percussion. **(proposal)** Empty. A tambourine is NOT punk.

## CYMB

- **Crash doubling the D-beat kick,** or crash 8ths in the chorus [K99]. "Bashing the crash cymbal
  on all the quarter note counts" [K98].
- **Measured:** crash in 7 % of groove bars, mostly on step 1 (vel 88). Ride as 8ths (`x.x.x.x.x.x.x.x.`
  12 %) or quarters (11 %), flat velocity 64–74 (DK1).
- **(proposal)**
  - Crash-quarters (1/5/9/13) as a chorus variant, vel 100–120, gate 48.
  - Crash on step 1 after a fill.

## 2-bar variations

- **(proposal)** Bar 2 either:
  - swaps backbeat to off-beat snare (the family switch mid-phrase is a punk move in GMD file
    `35_punk_128`, modal `..x...x...x...x.`);
  - adds a kick double on 12/14;
  - or ends with a quarter-note tom figure or 13–16 snare run.

## NOT punk

- Ghost-note snares or swung hats [K101].
- 16th hats. Four-on-the-floor with off-beat open hats and claps (house/disco).
- Soft dynamics: the median snare accent is < 100.
- Tempos below ~125.

## INGEST material (GMD)

- `drummer1/session2/32_punk_140` is the D-beat kick (`x...xx..x..x.x..`) with the 8th-hat family.
- `35_punk_128` is the off-beat snare family.
- `62_punk_144` is backbeat, 121 bars.
- Filter the snare lane at vel ≤ 20 to remove the crosstalk artefact before ingesting.
- The 51 punk `fill` files are fill material.
- ⚠ Single drummer throughout: pair the GMD phrases with generated ones for variety.
