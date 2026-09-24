# Sources and licence audit

All pages accessed **2026-09-23**. `[Sn]` numbers are used by `house.md`, `funk.md`, `dnb.md`,
`basics.md` and `verify.md`. "(snippet)" = claim seen only in a search-engine summary, the page
itself was not read; treat it as weaker evidence.

## Derived measurements (our own analysis, reproducible)

| id | what | how |
|---|---|---|
| **D1** | Per-16th-slot onset probability, mean velocity, microtiming and swing of hi-hats/kick/snare in the Groove MIDI Dataset [S1], by style (`funk` 53 beat files / 2,478 bars; `rock` 204/6,521; `hiphop` 34/871; `soul` 28/620; `dance` 7/552). Hats = notes 42, 22, 44 (closed/pedal, GMD mapping) and 46, 26 (open). | `analysis/gmd_slot_stats.py <style>`, `analysis/gmd_swing.py <style>` run in a folder holding the unzipped `groove/` from [S2]. Onsets quantised to nearest 16th from bar 0; deviation reported in ticks at 96 PPQN (24 ticks = one 16th). Swing per file = mean deviation of even 16ths minus mean deviation of odd 16ths; swing % = (24+d)/48. |
| **D2** | House (and Soca, as contrast) bass-line statistics from the 50+50 transcriptions in [S4]: onset probability per 16th slot, note lengths, interval of each note from an estimated tonic, register, consecutive-interval distribution, LHL syncopation. | `analysis/dbd_house_stats.py "House Dataset"`, `analysis/lhl.py`. **Caveats:** transcriptions are already quantised to 16 steps/bar; tonic = pitch class with the longest total duration (an estimate); the drum "kick" and "hat" columns are *frequency-band onsets* (40–70 Hz, 10–15 kHz), not instruments, so bass energy leaks into the "kick" band and kick transients into the "hat" band — the drum columns are only indicative. |
| **D3** | Longuet-Higgins & Lee (LHL) syncopation per bar, metrical weights for a 16-step 4/4 bar `[0,-4,-3,-4,-2,-4,-3,-4,-1,-4,-3,-4,-2,-4,-3,-4]`; a note followed (before the next note) by a rest on a heavier position scores `W(rest)-W(note)`. | `analysis/lhl.py`. Definition after [S36]. Our implementation is simplified (cyclic bar, max over the rests in the gap). Reference values: `x...x...x...x...`=0, `x.x.x.x.x.x.x.x.`=0, `..x...x...x...x.`=7, `x..x..x...x..x..`=6. |

## Content sources

| id | source | URL | used for |
|---|---|---|---|
| S1 | Magenta, *Groove MIDI Dataset* page | https://magenta.tensorflow.org/datasets/groove | GMD description; licence |
| S2 | GMD MIDI-only archive (contains `LICENSE`, `info.csv`) | https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0-midionly.zip | D1 input; licence file |
| S3 | Magenta, *Expanded Groove MIDI Dataset* page | https://magenta.tensorflow.org/datasets/e-gmd | licence |
| S4 | Haki, *drum_bassline_dataset* (GitHub) | https://github.com/behzadhaki/drum_bassline_dataset | D2 input; licence |
| S5 | Attack Magazine, "Roger Linn on swing, groove & the magic of the MPC's timing" | https://www.attackmagazine.com/features/interview/roger-linn-swing-groove-magic-mpc-timing/ | swing definition (even 16ths delayed; 50 % straight, 54 % "loosen", 66 % triplet, useful 50–~70 %) |
| S6 | Attack Magazine, "DAW & drum machine swing" | https://www.attackmagazine.com/technique/passing-notes/daw-drum-machine-swing/ | 50 % = straight in Logic/MPC; FL/Cubase 0 % = 50 %, FL 100 % = 66.6 % |
| S7 | Native Instruments blog, "7 drum patterns every producer should know" | https://blog.native-instruments.com/drum-patterns/ | funk, house, DnB grids (tempo 100 / house / 174) |
| S8 | Attack Magazine, "Drum programming: stripped deep house" | https://www.attackmagazine.com/technique/beat-dissected/deep-house-stripped-workout-beat-dissected/ | 120–125 BPM, swing 50–60, open off-beat hat + closed shuffle hats |
| S9 | Attack Magazine, "Drum programming: raw drum & bass" | https://www.attackmagazine.com/technique/beat-dissected/raw-drum-bass/ | 168–178 BPM, swing 50–60 %, kick 1+11, snare 5+13, swung quieter 16th ghost hats, 8th ride |
| S10 | Wikipedia, *House music* | https://en.wikipedia.org/wiki/House_music | 115–130 BPM, four-on-the-floor, off-beat hats, bass register most important |
| S11 | Wikipedia, *Drum and bass* | https://en.wikipedia.org/wiki/Drum_and_bass | 160–180 BPM, Amen break, sub-bass, Reese |
| S12 | Wikipedia, *Funk* | https://en.wikipedia.org/wiki/Funk | "on the one", syncopated 8ths → 16th syncopation, octave leaps, ghost notes, Dorian/Mixolydian, vamps, 16th hats "sometimes with a degree of swing", slower tempos |
| S13 | Wikipedia, *Disco* | https://en.wikipedia.org/wiki/Disco | broken-octave bass; 8th/16th hats with open hat on the off-beat |
| S14 | Wikipedia, *Shuffle rhythm* (swing time) | https://en.wikipedia.org/wiki/Shuffle_rhythm | long–short pairs, 2:1 and 3:1 ratios |
| S15 | Wikipedia, *Swing (jazz performance style)* | https://en.wikipedia.org/wiki/Swing_(jazz_performance_style) | swing ratio 1:1–3:1, narrower at fast tempos |
| S16 | Wikipedia, *Amen break* | https://en.wikipedia.org/wiki/Amen_break | four bars; bar 3 delayed snare; bar 4 syncopated, early crash |
| S17 | Ethan Hein, "Building the Amen break" (2023) | https://www.ethanhein.com/wp/2023/building-the-amen-break/ | ride on 8ths; open hat replaces ride on "and of 3" in last bar; microtiming off-grid |
| S18 | EDMProd, "How to make drum & bass: the complete guide" | https://www.edmprod.com/how-to-make-drum-and-bass/ | 170–180 (mostly 174–175) BPM; "shuffle" = 16ths after the first snare; sub range; D#1–G#1; E/F/F# minor; long Reese notes |
| S19 | Futureproof Music School, "Drum & bass production guide for Ableton Live" | https://futureproofmusicschool.com/blog/how-to-make-drum-and-bass-in-ableton-live | 170 (160–180) BPM; sub = root notes or 2–3-note moves; 16th/32nd hats; MPC 62 % swing example; sidechain to kick; F/A/E/G minor |
| S20 | Beatportal, "Step-by-step guide to producing drum and bass like Sub Focus…" | https://www.beatportal.com/articles/818379-step-by-step-guide-to-producing-drum-and-bass-like-sub-focus-a-m-c-and-delta-heavy | 174 BPM; kick 1 and "and of 3"; snare 2 and 4 |
| S21 | Studio Brootle, "Drum and bass drum patterns" | https://www.studiobrootle.com/drum-and-bass-drum-patterns/ | 170–175 (160–180) BPM; ghost snares; velocity variation on hats; late snare variation; doubled hats at bar end |
| S22 | MusicRadar, "Beat programming: get your kick and bass working together" | https://www.musicradar.com/how-to/beat-programming-drums-bass-rhythm-section | bass follows kick (unison ↔ weave); off-beat bass between kicks in 4/4 dance styles |
| S23 | The Producer School, "Master modern tech house bass lines" | https://theproducerschool.com/blogs/featured-blogs/master-modern-tech-house-bass-lines-complete-tutorial-guide | off-beat bass; octave variation; driving 16ths at low velocity; legato octave glides |
| S24 | MusicRadar, "How to program authentic live disco hi-hats" | https://www.musicradar.com/how-to/how-to-program-authentic-live-disco-hi-hats | accents; even 16ths "a bit later" (tiny, not audible swing); pedal/open alternation = disco off-beat hat |
| S25 | TalkingBass, "How to build a funky bass line" | https://www.talkingbass.net/how-to-build-a-funky-bass-line/ | start from the kick; dominant-7 arpeggio; short notes; ghost notes in front; turnaround to the 5th; octave displacement; restraint |
| S26 | TalkingBass, "How to play funky ghost note basslines" | https://www.talkingbass.net/bass-technique-ghost-notes/ | ghost notes before a note; add propulsion without changing the groove body |
| S27 | TalkingBass, "Creating basslines 1 – bass drum patterns & pedalling" | https://www.talkingbass.net/creating-basslines-1-bass-drum-patterns-pedalling/ | pedalling repeated roots; doubling the kick; legato vs staccato, most playing "just before the next" note |
| S28 | Dance Midi Samples, "How to make an acid house bassline" (snippet) | https://www.dancemidisamples.com/how-to-make-a-tb303-style-acid-house-bassline-pattern/ | off-beat principle: kick on the beat, bass answers between; drop off-beats an octave |
| S29 | MusicTech, "How to create a Chicago-style 303 acid house bassline" (snippet) | https://musictech.com/guides/essential-guide/how-to-create-a-chicago-style-acid-house-bassline/ | 16-step 303 lines, slides, accents, octave jumps |
| S30 | Production Expert / Padwolf house hat guidance (snippet) | https://www.production-expert.com/production-expert-1/6-killer-hi-hat-programmingnbsptipsnbspfor-musicnbspproducers , https://padwolf.app/learn/how-to-make-house-beats/ | 16th hats need velocity variation; "accent the offbeats while keeping the downbeats quieter"; deep house: swung 16th closed hats |
| S31 | BAP Studio, "Liquid drum and bass drum beat" (snippet) | https://bap.studio/grooves/liquid-dnb/ | liquid: 174 BPM, two-step, brushed ghost snares, hat "ticking the offbeats" |
| S32 | Pickup Music, "Funk learning pathway" (snippet) | https://www.pickupmusic.com/bass/bass-classes/funk-learning-pathway | anticipating the one; constant 16ths (Rocco Prestia); octaves |
| S33 | Colin Raffel, *The Lakh MIDI Dataset v0.1* | https://colinraffel.com/projects/lmd/ | licence audit |
| S34 | Patchbanks WaivOps *EDM-HSE* (GitHub + Zenodo JSON) | https://github.com/patchbanks/WaivOps-EDM-HSE , https://zenodo.org/records/13769544 | licence audit |
| S35 | Patchbanks WaivOps *EDM-TR8* | https://github.com/patchbanks/WaivOps-EDM-TR8 | licence audit |
| S36 | Fitch & Rosenfeld (2007), "Perception and production of syncopated rhythms", *Music Perception* 25(1) | https://web.uvic.ca/~aschloss/course_mat/MUS%20511/ARTICLES%20AND%20REFS%20FOR%20320/FitchRosenfeld20071.pdf | LHL syncopation measure (D3) |
| S37 | TapTamDrum dataset site | https://taptamdrum.github.io/ | licence audit |
| S38 | Fraunhofer IDMT, *IDMT-SMT-Bass-Single-Track* | https://www.idmt.fraunhofer.de/en/publications/datasets/bass_lines.html | licence audit |
| S39 | gvellut, *dmp_midi* (MIDI of the "200/260 Drum Machine Patterns" books) | https://github.com/gvellut/dmp_midi | licence audit |
| S40 | Selekt Audio, free MIDI | https://selektaudio.com/free-midi (also `/free-midi/drums`, `/free-midi/bass`) | licence audit |
| S42 | Avid, "How to design a Reese bass" (snippet) | https://www.avid.com/resource-center/how-to-make-a-reese-bass | Reese: detuned saws, legato mode, glide |
| S41 | asigalov61, *Tegridy MIDI Dataset* | https://github.com/asigalov61/Tegridy-MIDI-Dataset | licence audit |

## Licence audit — import wholesale (redistribute inside dAVEBOx) vs reference only

Rule applied: only an explicit open licence that grants redistribution (CC0, CC-BY, public domain,
MIT/Apache-style) **covering the pattern content itself** qualifies. "Royalty-free" / "free to use in
your music" is not redistribution permission. A permissive licence on a *repository* does not cover
content the repository author did not own (transcriptions of books or commercial records).

| collection | licence as found (verbatim, 2026-09-23) | content provenance | class |
|---|---|---|---|
| **Groove MIDI Dataset (GMD)** [S1][S2] | Page: "The dataset is made available by Google LLC under a Creative Commons Attribution 4.0 International (CC BY 4.0) License". `LICENSE` in the zip: "This work is licensed under the Creative Commons Attribution 4.0 International License." | Recorded for the dataset by 10 drummers (mostly hired professionals) on an e-kit; original playing, not transcriptions | **INGEST OK** with attribution. Suggested credit: *"Contains drum patterns derived from the Groove MIDI Dataset by Google LLC (Magenta), CC BY 4.0, https://magenta.tensorflow.org/datasets/groove — modified (quantised/excerpted)."* Note: drums only, **no bass**; no house/DnB styles (its "dance" style is 7 files and not four-on-the-floor, see D1). Hats must be extracted from full kits. |
| **Expanded GMD (E-GMD)** [S3] | "The dataset is made available by Google LLC under a Creative Commons Attribution 4.0 International (CC BY 4.0) License." | Same 1,059 unique GMD sequences re-rendered through 43 kits (444.5 h). No new patterns. | **INGEST OK** with attribution (same text), but adds nothing over GMD for symbolic patterns. |
| **behzadhaki/drum_bassline_dataset** [S4] | **No licence.** GitHub API `license: null`; README has no licence or permission text. | Loops/basslines from commercial House and Soca releases (folders named by Discogs release id) | **REFERENCE ONLY.** No-licence = all rights reserved, and the underlying recordings are third-party commercial works. Used here only for aggregate statistics (D2), never ingested. |
| **Selekt Audio free MIDI** [S40] | Could not read the page itself (HTTP 429 on every attempt, WebFetch and curl). Search summaries of the pages: patterns are "licensed under public domain, CC0, or CC-BY — royalty-free … free for commercial use under each sample's license", "a provenance certificate per file", and the site itself warns that royalty-free "can still restrict reselling". | Automatic audio-to-MIDI extractions from recordings the site says are CC0/PD/CC-BY | **UNCLEAR → treat as REFERENCE ONLY.** No terms page was verifiable; per-file licences vary; whether Selekt's *extraction* inherits the source licence or carries Selekt's own terms is not stated in anything we could read. Re-check with a per-file certificate and a site ToS before any ingest. |
| **Lakh MIDI Dataset** [S33] | "The Lakh MIDI Dataset is distributed with a CC-BY 4.0 license" — but also "attributing each of the MIDI files in the dataset to a particular author is not feasible." | Scraped web MIDI of commercial songs | **REFERENCE ONLY.** CC-BY on the compilation cannot license third-party song arrangements. |
| **WaivOps EDM-HSE** [S34] | "The EDM-HSE Dataset is licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)." | Algorithmically generated house loops, **audio only**; the JSON labels contain only the *set of pitches* and tempo (checked: e.g. `{"pitch":[36,38,39,40,42],"tempo":130}`), no onset times | Licence would be **INGEST OK**, but there is **no symbolic pattern to ingest** — rhythms would have to be transcribed from audio. Not useful as-is. |
| **WaivOps EDM-TR8** [S35] | "The EDM-TR8 dataset is licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)." | 808 audio loops, 95–130 BPM; README mentions a MIDI dataset used for training but does not ship one | Same: licence OK, no MIDI published. **Not applicable.** |
| **TapTamDrum** [S37] | Site repo is MIT (GitHub API); no licence statement for the *data* on the site. | "Dualized" drum patterns; source patterns not stated on the site | **UNCLEAR.** |
| **IDMT-SMT-Bass-Single-Track** [S38] | "The dataset is provided for evaluation purpose under the Creative Commons licence CC BY-NC-ND 4.0" | 17 bass recordings + annotations | **REFERENCE ONLY** (NC and ND forbid a shipped product). |
| **dmp_midi** (200/260 Drum Machine Patterns) [S39] | Repo licence: MIT | Transcriptions of R.-P. Bardet's books (Hal Leonard, in print) | **REFERENCE ONLY.** MIT covers the repo author's code, not Hal Leonard's book content. |
| **Tegridy MIDI Dataset** [S41] | Repo: Apache-2.0 (GitHub API); search summaries also say CC BY-NC-SA for the collection | Scraped MIDI of songs | **REFERENCE ONLY.** |

**Bottom line.** The only collection we could verify as genuinely ingestible is **GMD (and its
E-GMD re-render), CC BY 4.0**, and it is drums only (useful for FUNK and BASICS hats; nothing for
house/DnB hats, nothing for bass). No openly licensed *bass-line* MIDI collection with provenance we
could trust turned up. So the phrase library should be **generated**, with GMD as an optional
attributed source for funk/basic hat phrases and the other material used only as statistics.
