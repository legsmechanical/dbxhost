# Drum verification statistics

This table is measured over **a batch of generated phrases per (genre, category)**, of at least 200
bars, unless a row is marked *per phrase*.

**Conventions:**
- The grid, ticks, LHL and swing delay are as in `../verify.md`.
- "Beats" = 1/5/9/13; "off-8ths" = 3/7/11/15; "16ths" = even steps.
- "Groove bars" excludes phrases or bars tagged as fills, rolls or breakdowns.
- Velocity targets assume a 1–127 scale.
- **Profile similarity** = the Pearson r between the generated per-step onset P vector and the
  reference vector in the genre file.

**Confidence of each target:**
- **M** = measured from GMD (DK1–DK3, `SOURCES.md`).
- **G** = a guide rule.
- **P** = our proposal.

Genres with no M rows could not be measured.

Hats for house, funk and DnB are already in `../verify.md` and are not repeated.

## ROCK (M: GMD rock, 3,900 groove bars)

| # | statistic | target | basis |
|---|---|---|---|
| R-kick-1 | kick profile similarity, groove bars | r ≥ 0.75 against the rock.md P row | M |
| R-kick-2 | P(kick on 1) ≥ P(kick on 9) ≥ P(any even step) | holds (GMD .65 ≥ .45 ≥ ≤ .22) | M |
| R-kick-3 | kick LHL per bar | median 1–3 (GMD 2, IQR 1–5) | M |
| R-snr-1 | P(snare on 5) and P(snare on 13), non-half-time phrases | ≥ 0.9 each (a loop has no GMD improvisation; GMD .72/.74) | M, P for the level |
| R-snr-2 | ghost share (vel ≤ 45) of snare hits | 0.10–0.35 (GMD 0.28); backbeat hits ghost ≤ 5 % | M |
| R-tom-1 | tom hits in groove bars | 0; in fill bars ≥ 60 % of tom onsets on steps 9–16 (GMD 61 %) | M |
| R-cym-1 | P(crash on step 1 \| previous bar was a fill) vs \| groove | ≥ 0.3 vs ≤ 0.1 (GMD .31 / .10) | M + G [K95] |

## PUNK (M, but one drummer: GMD punk, 200 groove bars)

| # | statistic | target | basis |
|---|---|---|---|
| P-snr-1 | snare family: either ≥ 0.9 of bars have 5 and 13, or ≥ 0.9 have 3/7/11/15 | 100 % of phrases belong to one family | M (DK1) + G [K97][K99][K100] |
| P-snr-2 | snare ghost share (vel ≤ 45) | ≤ 0.10 (no ghost tier) | G [K101], P |
| P-snr-3 | mean snare velocity on its main steps | ≥ 105 (GMD off-8th snare 114–118) | M |
| P-kick-1 | D-beat phrases: kick steps ⊆ {1,4,6,9,12,14} and include 1, 6, 9, 14 | exact | G [K99] (M: those steps lead in DK1) |
| P-hat-1 | no 16th hats; off-8th hat vel − beat hat vel | ≥ +10 (GMD +20) | M |

## FUNK — kick/snare/tom (M: GMD funk, 2,002 groove bars; hats in `../verify.md`)

| # | statistic | target | basis |
|---|---|---|---|
| Fk-kick-1 | kick profile similarity | r ≥ 0.75 | M |
| Fk-kick-2 | P(kick on 5) and P(kick on 13) | ≤ 0.10 each (GMD .07 / .04) | M |
| Fk-snr-1 | snare ghost share (vel ≤ 45) | 0.35–0.60 (GMD 0.49) | M |
| Fk-snr-2 | P(snare) on even steps 8, 10, 16 | each ≥ 0.3 (GMD .51/.46/.47) | M |
| Fk-snr-3 | mean backbeat velocity − mean ghost velocity | ≥ 50 (GMD 114 vs ~40) | M |

## HIPHOP (M: GMD hip-hop, 759 groove bars; G for the swing family)

| # | statistic | target | basis |
|---|---|---|---|
| H-kick-1 | kick profile similarity | r ≥ 0.7 | M |
| H-kick-2 | P(kick on 5) | ≤ 0.08 (GMD .04) | M |
| H-kick-3 | even-step kicks: share with vel ≤ 55 | ≥ 0.5 (ghost pickups; GMD 8 = 71 %, 16 = 74 %) | M |
| H-snr-1 | backbeat velocity | mean ≥ 110 (GMD 121) | M |
| H-hat-1 | even-16th swing delay, MPC-tagged phrases / live-tagged phrases | 4–8 ticks / 0–2 ticks | G [K71][K73] / M (GMD median 0.5) |

## DISCO (M, small: GMD disco, 354 groove bars, 2 drummers)

| # | statistic | target | basis |
|---|---|---|---|
| Di-kick-1 | P(kick) on 1 and 9 | ≥ 0.95 (GMD .98/.99) | M |
| Di-kick-2 | share of phrases that are four-on-the-floor vs the syncopated 1-4-9-12-14 family | 50–80 % four-on-the-floor | M (39 % vs 30 % of GMD bars) + G [K47] |
| Di-snr-1 | P(snare on 5 and 13) | ≥ 0.9 | M (.88/.91) + G [K49] |
| Di-hat-1 | hats per bar | median ≥ 10 in 16th families (GMD 14); off-8th vel ≥ beat vel + 10 | M |
| Di-hat-2 | even-16th swing delay | 1–5 ticks (GMD IQR 2.3–4.1) | M |
| Di-tom-1 | fills: in bar 2 (or bar 4) only, tom onsets on 11–16 | ≥ 70 % of tom onsets on 11–16 (GMD 77 %) | M (DK1 fill bars) |

## HOUSE — kick/clap/tom/perc (G)

| # | statistic | target | basis |
|---|---|---|---|
| Ho-kick-1 | every groove bar has kicks on all of 1/5/9/13 | 100 % | G [K82][S10] |
| Ho-clap-1 | clap on 5 and 13 in every groove bar; clap gate | 100 %; median ≤ 24 ticks | G [K83][K85] |
| Ho-tom-1 | tom phrases repeat bar-to-bar (ostinato), not a descending run | ≥ 80 % of tom phrases have bar 2 = bar 1 | G [K86][K87] |
| Ho-perc-1 | shaker 16ths: mean vel of off-8ths − mean vel of even steps | ≥ +15 | G [K82][K85], P |
| Ho-cym-1 | crash only on step 1 of bar 1 | 100 % of crash hits | G [K87] |

## DNB — kick/snare (G; GMD breakbeat check M-weak)

| # | statistic | target | basis |
|---|---|---|---|
| Dn-kick-1 | kick on 1 in every bar; second kick on 11 (or 8 for the neuro family) | ≥ 0.9 | G [S7][K90][K91] |
| Dn-kick-2 | P(kick on 5 or 13) | ≤ 0.05 | G + M-weak (GMD breakbeat .02/.01) |
| Dn-snr-1 | main snare vel 110–127; ghost snare vel 15–45 | ≥ 90 % of hits in the two bands | G [K92] |
| Dn-snr-2 | ghost positions | ≥ 60 % of ghosts on 4, 6, 7, 8, 12, 14, 16 | G [K92][S18] |

## BREAKS (G + M-weak)

| # | statistic | target | basis |
|---|---|---|---|
| Br-snr-1 | phrases where beat-4 snare moves 13 → 15 in some bar | 20–50 % | G [K69][S16] |
| Br-snr-2 | snare velocity tiers: ≥ 3 distinct bands (main, "half", ghost) | per phrase | G [K69][K66] |
| Br-kick-1 | no four-on-the-floor bar | 100 % | G |
| Br-time-1 | per-hit timing jitter SD | 1.5–4 ticks (not grid-straight) | G [S17][K66], P |

## TECHNO (G)

| # | statistic | target | basis |
|---|---|---|---|
| T-kick-1 | kicks on all of 1/5/9/13 in every groove bar; velocity SD on beats | 100 %; ≤ 4 | G [K1][K14], P |
| T-kick-2 | extra kicks (non-beat, vel > 60) | ≤ 1 per 4 bars, on 15/16 | G [K9][K15] |
| T-hat-1 | P(hat) on 3/7/11/15 in off-beat families | ≥ 0.95 | G [K10][K7] |
| T-snr-1 | share of clap phrases without 5/13 (the "thumping" family) | 10–30 % | G [K2], P |
| T-swing-1 | even-16th delay | ≤ 3 ticks except the minimal family (4–8) | G [K9][K6] |

## TRANCE (G)

| # | statistic | target | basis |
|---|---|---|---|
| Tr-kick-1 | kick only on 1/5/9/13 (psy: exactly those) | 100 % of non-breakdown bars | G [K21][K29] |
| Tr-clap-1 | clap on 5 and 13 | ≥ 0.95 | G [K23][K31] |
| Tr-roll-1 | roll phrases: velocity monotonic non-decreasing over the phrase; density non-decreasing bar to bar | per phrase | G [K30][K25] |
| Tr-swing-1 | swing delay | 0 ticks (±1 jitter) | G [K27][K28] |

## ELECTRO (G)

| # | statistic | target | basis |
|---|---|---|---|
| E-kick-1 | bars with kicks on all of 1/5/9/13 | ≤ 15 % | G [K35] ("Clear" family [K32] excepted) |
| E-kick-2 | P(kick on 5 or 13) | ≤ 0.05 | G [K34] |
| E-vel-1 | distinct velocity values per lane per phrase | ≤ 2 | G [K34] |
| E-hat-1 | 16th hat phrases: rests per bar | 2–5 | G [K34][K33], P |
| E-swing-1 | swing delay | 0 | G [K32][K33] |

## SYNTHPOP (G)

| # | statistic | target | basis |
|---|---|---|---|
| Sp-vel-1 | distinct velocity values per lane per phrase | ≤ 3 | G [K57][K56], P |
| Sp-snr-1 | snare on 5/13 in every groove bar; snare gate | 100 %; 36–60 ticks (≈ 0.5 s at 110–125 BPM) | G [K54][K60] |
| Sp-tom-1 | tom onsets only in fill bars | 100 % | G [K62] |
| Sp-swing-1 | swing delay | 0–1 ticks, or 4–7 in the "Linn swing" family (≤ 25 % of phrases) | G [K54][K151][S5] |

## NEW WAVE (G + M-proxy GMD pop)

| # | statistic | target | basis |
|---|---|---|---|
| Nw-kick-1 | share of kick onsets on even steps | ≤ 0.10 (GMD pop ≤ 0.03 per step) | M-proxy |
| Nw-hat-1 | 8th families: mean beat hat vel − mean off-8th hat vel | ≥ +25 (GMD pop ≈ +55) | M-proxy |
| Nw-snr-1 | snare ghost share | ≤ 0.30 (GMD pop 0.28) | M-proxy |
| Nw-perc-1 | tambourine hits coincide with snare steps and sit 1–3 ticks early | ≥ 80 % | G [K129] |
| Nw-swing-1 | swing delay | 0 | G [K129][K133] |

## POST-PUNK / GOTH (G, low)

| # | statistic | target | basis |
|---|---|---|---|
| Pp-tom-1 | tribal phrases: tom lane active in every bar; bar 2 = bar 1 except ≤ 1 hit | ≥ 90 % | G [K135][K136][K137], P |
| Pp-cym-1 | bars with any crash or ride | ≤ 1 in 8; 0 in the tribal family | G [K135][K142] |
| Pp-snr-1 | tribal family: backbeat accent (snare vel on 5/13 above kick vel) | absent in ≥ 50 % of tribal phrases | G [K137] |
| Pp-rep-1 | motorik: bar 2 identical to bar 1 in all lanes | ≥ 80 % of phrases | G [K142] |

## ITALO (G)

| # | statistic | target | basis |
|---|---|---|---|
| It-kick-1 | kick exactly 1/5/9/13 | 100 % of bars | G [K153][K157] |
| It-hat-1 | open hat on 3/7/11/15, gate ≤ 16 ticks | ≥ 0.95 of hat phrases, except the hat-sparse family (≤ 20 %) | G [K153][K155][K157] |
| It-clap-1 | clap on 5 and 13 | ≥ 0.95 | G [K157][K155] |
| It-swing-1 | swing delay | 0 | G [K157] |

## EBM (G, low)

| # | statistic | target | basis |
|---|---|---|---|
| Eb-kick-1 | kicks on all of 1/5/9/13 | ≥ 75 % of phrases (the rock-backbeat family is the rest) | G [K159][K162] |
| Eb-vel-1 | distinct velocity values per lane | ≤ 2 | G [K160], P |
| Eb-perc-1 | metal-perc hits per bar | 1–4, bar-to-bar differences ≤ 2 | G [K159][K161], P |

## SYNTHWAVE (G)

| # | statistic | target | basis |
|---|---|---|---|
| Sw-kick-1 | phrases where the kick is exactly 1+9 (plus optional 7 and bar-2 step 16) or exactly 1/5/9/13 | 100 % | G [K55][K121][K119] |
| Sw-hat-1 | 16th hat families: P(hat on 5) and P(hat on 13) | ≤ 0.05 | G [K119][K123] |
| Sw-vel-1 | hat velocity SD within a phrase | ≤ 6 | G [K117] |
| Sw-snr-1 | snare gate | 40–96 ticks and ≤ the gap to the next snare | G [K125][K60] |
| Sw-tom-1 | tom fills: only in bar 2, on steps 9–16, followed by a crash on the next step 1 in ≥ 50 % of cases | per phrase | G [K119][K123] |

## Cross-genre discrimination test (recommended)

This extends `../verify.md`. Run every genre's generated batch through every genre's table. The
diagonal must pass, and each off-diagonal genre must fail at least 2 key tests. Useful pairs:

- **Rock / new wave / punk:** kick even-step share, hat tiering, off-beat snare.
- **Techno / trance / Italo:** swing, clap family, hat gate.
- **Electro / synthwave:** kick four-on-the-floor share, velocity levels.
- **Funk / hip-hop / breaks:** ghost share, kick on 5.
- **Post-punk / new wave:** crash density, tom ostinato.
