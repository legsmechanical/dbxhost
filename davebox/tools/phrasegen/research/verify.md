# Verification statistics

Measured over **a batch of generated phrases per (category, genre)** — recommend ≥ 200 bars — unless
marked *per phrase*. Grid: 16 steps/bar, step 1 = downbeat; "beats" = 1/5/9/13, "off-8ths" =
3/7/11/15, "16ths" = even steps. Ticks at 96 PPQN (24 per 16th). LHL = syncopation per bar (D3,
`analysis/lhl.py`). Swing delay = mean onset tick of even-16th hits minus that of odd-step hits,
measured *before* any global humanise offset.

**Confidence:** **M** = target derived from a measured corpus (D1 = GMD, D2 = house bass
transcriptions); **G** = from producer guides/pedagogy (rules, not distributions); **P** = our
proposal. DnB has no M targets — none could be measured.

Profile similarity = Pearson correlation between the generated per-slot onset-probability vector
(16 values) and the reference vector given in the genre file.

## HOUSE

| # | statistic | target | basis |
|---|---|---|---|
| H-hat-1 | P(hat) on each of 3/7/11/15 | ≥ 0.95 | G [S7][S10][S13] |
| H-hat-2 | mean velocity off-8ths − mean velocity beats (bars with both) | ≥ +10 | G [S30] (snippet), P for size |
| H-hat-3 | even-16th swing delay | 0–5 ticks (50–60 %); ≤ 6 hard cap | G [S8][S5] |
| H-hat-4 | P(hat) on 16th off-beats (mean of even steps) | 0.05–0.35 for non-"full-16ths" variants | M-indicative (D2 band data 0.13–0.30) |
| H-bass-1 | profile similarity to D2 house bass vector (for the "corpus-typical" family) | r ≥ 0.7 | M (D2) |
| H-bass-2 | share of bass onsets on 16th off-beats | ≤ 0.30 (corpus 0.21) | M (D2) |
| H-bass-3 | share of notes whose pitch class = root | 0.35–0.65 (corpus 0.45); off-beat-root idiom may be 1.0 | M (D2) |
| H-bass-4 | median note length | 1–2 steps (24–48 ticks); ≥ 75 % of notes ≤ 2 steps (corpus 75 %) | M (D2) |
| H-bass-5 | pitch range | 90 % of notes in MIDI 28–45 | M (D2 p10–p90 = 28–43) |
| H-bass-6 | every bar: onset on step 1 **or** onsets on all of 3/7/11/15 | 100 % of bars | M (D2 step-1 P = 0.93) + G [S22][S23] |
| H-bass-7 | LHL per bar (corpus-typical family only; off-beat idiom scores 7 by construction) | median ≤ 3 | M (D2 median 1, IQR 0–3) |

## FUNK

| # | statistic | target | basis |
|---|---|---|---|
| F-hat-1 | profile similarity to GMD funk hat vector (funk.md) | r ≥ 0.8 | M (D1) |
| F-hat-2 | share of hat onsets on 16th off-beats | 0.15–0.35 (GMD 0.25) | M (D1) |
| F-hat-3 | mean vel of 16th off-beats ÷ mean vel of beats | 0.45–0.70 (GMD 0.55); beats 2+4 (steps 5, 13) ≥ beat 1 | M (D1) |
| F-hat-4 | even-16th swing delay per phrase | bimodal: straight family 0–2 ticks, swung family 4–10 ticks; ≈ 70 % below 58 % / 30 % at or above across the batch (GMD funk: 21 of 29 files < 58 %, 8 ≥ 58 %) | M (D1) |
| F-hat-5 | open-hat (long-gate) hits | ≤ 1 per bar on average; ≥ 50 % of them on steps 11/13/15 (GMD: 11 dominant) | M (D1) |
| F-bass-1 | P(onset on step 1, or on the previous bar's step 16 as anticipation) | ≥ 0.9 | G [S12][S32] |
| F-bass-2 | LHL per bar | median 3–7 (GMD funk kick median 4, IQR 2–6; rock 2) | M-proxy (D1 kick) — the bass locks to the kick [S25] |
| F-bass-3 | ghost notes (vel ≤ 45) as share of all notes | 0.10–0.35; each ghost directly precedes (≤ 1 step) a non-ghost note | G [S25][S26], P for range |
| F-bass-4 | median gate of non-ghost notes ÷ gap to next note | ≤ 0.6 (short, "cut off") | G [S25], P for number |
| F-bass-5 | pitch classes | ≥ 85 % in {1, b3, 3, 4, 5, 6, b7} relative to root; major 7th only as a chromatic passing tone; ≥ 40 % of phrases contain an octave leap | G [S12][S25] |

## DNB

| # | statistic | target | basis |
|---|---|---|---|
| D-hat-1 | P(hat) on each odd step (8th skeleton), non-sparse variants | ≥ 0.9; sparse "liquid tick" variant: 3/7/11/15 ≥ 0.9 | G [S7][S9][S17][S31] |
| D-hat-2 | where the 16th ghosts fall | ≥ 60 % of even-step hits on {6, 8, 10, 14, 16} | G [S7][S18][S9] |
| D-hat-3 | mean vel of 16th ghosts ÷ mean vel of 8ths | 0.5–0.9 (NI example 76/86 = 0.88) | G [S7][S9] |
| D-hat-4 | even-16th swing delay | 0–6 ticks (50–62 %) | G [S9][S19] |
| D-hat-5 | open-hat (long-gate) hits | ≤ 0.5 per bar, on off-8ths, preferring the phrase's last bar | G [S17], P |
| D-bass-1 | onsets per bar | 1–4 (median ≤ 3) | G [S19] ("root notes or simple 2–3 note movements"), P |
| D-bass-2 | median note length | ≥ 4 steps (96 ticks) | G [S18] (long Reese notes), P |
| D-bass-3 | onsets on kick steps (1, 11) as share of all onsets | ≥ 0.5 | G [S22] with S7/S9 two-step kick, P |
| D-bass-4 | pitch range / key | 90 % of notes in MIDI 26–40 for sub phrases; no major 3rd | G [S18][S19] |
| D-bass-5 | four-on-the-floor leak | no bar with onsets on all of 1/5/9/13 | G (anti-pattern) |

## BASICS (exactness checks, *per phrase*)

| # | statistic | target | basis |
|---|---|---|---|
| B-1 | onset set equals the archetype grid (basics.md) | exact match in every bar | P (definition) |
| B-2 | timing | straight: all onsets within ±2 ticks of grid; 16th-swing: even steps +2…+8, odd ±2; 8th shuffle: off-8th at +16 (2:1) to +24 (3:1) ticks | G [S5][S14], P for jitter |
| B-3 | velocity tiering | mean(beats) ≥ mean(off-8ths) ≥ mean(16ths) for straight/16th archetypes; reversed off-8th > beat only for off-beat/open archetypes | M (D1: holds in GMD funk/rock/hiphop/soul; GMD `dance` reverses it — off-8ths louder — matching the off-beat archetypes), G [S13] |
| B-4 | bass pitch set | root only / root+octave / root+5th as named | P (definition) |
| B-5 | monophony | no overlapping notes; gate ≤ gap to next onset | P |

## Cross-genre discrimination test (recommended)

A generated batch is "genre-correct" only if it also *fails* the other genres' key tests: e.g. HOUSE
hats must fail F-hat-3's ghost-tier ratio when full-16ths are not requested, FUNK bass must fail
H-bass-7 (LHL ≤ 3), DnB bass must fail H-bass-4 (length ≤ 2 steps). Run each genre's batch through
every genre's table and require the diagonal to pass and ≥ 2 key tests per off-diagonal to fail —
this catches a generator that produces one generic pattern with a genre label.
