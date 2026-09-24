# Drum research — sources and licence audit

All pages accessed **2026-09-23**. `[Kn]` numbers are used by the genre files in this folder; `[Sn]`
refer to `../SOURCES.md` (S5 Linn swing, S7 NI 7 patterns, S9 Attack raw DnB, S12 Funk, S13 Disco,
S16 Amen, S17 Hein Amen, S18 EDMProd DnB, S21 Studio Brootle DnB, S24 MusicRadar disco hats).

⚠ **How the web sources were read.** Pages were fetched with a tool that passes the page through a
summarising model. Quotes in the genre files are verbatim *as returned by that tool*; they were not
compared character-by-character with the raw HTML. "(snippet)" = seen only in a search-engine
summary, the page itself was not read — weaker evidence. Attack Magazine "Beat Dissected" grids are
images; only their prose was readable, so step positions from Attack are what the prose states.

## Derived measurements (ours, reproducible)

All from the **Groove MIDI Dataset** (GMD, CC BY 4.0 [S1][S2]), downloaded to
`../../cache/groove/` (gitignored). Run from `davebox/tools/phrasegen/cache/`.

| id | what | how |
|---|---|---|
| **DK1** | Per-category (kick 36 · snare 38/40 · cross-stick 37 · toms 43/45/47/48/50/58 · crash 49/52/55/57 · ride 51/53/59 · hat 22/26/42/44/46) per-16th-slot onset P, mean velocity, ghost share (vel ≤ 45), mean timing deviation (ticks @ 96 PPQN), hits/bar, top 1-bar patterns, kick LHL; bars split into **GROOVE** and **FILL** bars. FILL BAR = tom onsets whose tom pattern differs from both neighbouring bars (a repeated tom pattern is a tom *groove*), or loud snare (vel > 60) on ≥ 3 of steps 9–16 other than 13. | `analysis/gmd_drum_stats.py <family> beat --bars all|groove|fill --json …`; outputs in `analysis/out/<name>_beat_<mode>.{txt,json}`; compact view `analysis/out/summary.txt`. Families: rock = `=rock,rock/indie,rock/groove8` (195 files, 5,473 bars, 9 drummers); punk = `punk` (7/278, **1 drummer**); funk = `funk` (53/2,471); hiphop = `hiphop` (34/869); popsoul = `pop,soul` (43/938); pop = `pop` (15/318); disco = `=dance/disco` (5/434, 2 drummers); breakbeat = `=dance/breakbeat` (2/117, 1 drummer, 170 BPM). |
| **DK2** | P(fill bar) by position in a 4- and 8-bar phrase counted from each file's first bar; fill-run lengths. | `analysis/gmd_fill_phrase.py <family>` → `analysis/out/fill_phrase.txt`. |
| **DK3** | Tom **ostinato** bars (≥ 4 tom onsets, pattern repeated in an adjacent bar) across all GMD styles. | `analysis/gmd_tom_grooves.py` → `analysis/out/tom_grooves.txt`. ⚠ one file (drummer2/session1/2_rock_102) supplies 296 of 818 bars. |
| **DK4** | INGEST candidate ranking: files ≥ 8 bars sorted by the share of bars equal to the file's modal 1-bar pattern, per lane. | `analysis/gmd_ingest_candidates.py out/<name>_beat_all.json` → `analysis/out/ingest_candidates.txt`. |

**Measurement caveats (apply to every DK table).**
- Onsets are quantised to the nearest 16th from tick 0. GMD files start on a bar line (checked: the
  loud-snare backbeat dominates 5/13 in 187 of 195 rock-family files and all soul/disco files); the
  exceptions are named in the genre files (punk's off-beat snare is real, not misalignment).
- GMD beat files are **improvised performances** of 8 s – several minutes; drummers vary and fill far
  more than a loop would. Use **GROOVE-bar** tables for the steady phrase and **FILL-bar** tables for
  bar-4/bar-8 variations; never the "all" table as a loop.
- Velocities are e-kit (Roland TD-11) velocities; 127 is common (p90 = 127 for most lanes) because
  hard hits clip. Ghost threshold 45 is ours.
- "vel" on a slot with P < ~0.05 is from few hits — read it only where P is meaningful.
- Timing deviation (`dev`) is per slot; GMD players sit 1–4 ticks early on most lanes (all lanes, all
  styles). **(proposal)** ignore the global offset; keep only relative per-slot offsets.

## Content sources

### Techno
| id | source | URL |
|---|---|---|
| K1 | Wikipedia, *Techno* | https://en.wikipedia.org/wiki/Techno |
| K2 | Attack, "Thumping Techno" (Beat Dissected) | https://www.attackmagazine.com/technique/beat-dissected/thumping-techno/ |
| K3 | Attack, "Grinding Analogue Techno" | https://www.attackmagazine.com/technique/beat-dissected/grinding-analogue-techno/ |
| K4 | Attack, "Rolling Techno" | https://www.attackmagazine.com/technique/beat-dissected/rolling-techno/ |
| K5 | Attack, "Dark Techno Rumble" | https://www.attackmagazine.com/technique/beat-dissected/dark-techno-rumble/ |
| K6 | Attack, "Sub-Zero Minimal Techno" | https://www.attackmagazine.com/technique/beat-dissected/sub-zero-minimal-techno/ |
| K7 | Attack, "Basic Channel-Style Dub Techno" | https://www.attackmagazine.com/technique/beat-dissected/basic-channel-style-dub-techno/ |
| K8 | Attack, "Dana Montana Inspired Techno" | https://www.attackmagazine.com/technique/beat-dissected/dana-montana-inspired-techno/ |
| K9 | MusicRadar, "Beat building: how to make a Berlin techno beat" | https://www.musicradar.com/news/beat-building-how-to-make-berlin-techno-beat |
| K10 | MusicRadar, "How to program Jeff Mills-style rolling TR-909 drums" | https://www.musicradar.com/how-to/program-jeff-mills-style-909-drums-1 |
| K11 | Studio Brootle, "Techno drum patterns and programming tips" | https://www.studiobrootle.com/techno-drum-patterns-and-drum-programming-tips/ |
| K12 | Futureproof, "How to make hard techno" | https://futureproofmusicschool.com/blog/making-hard-techno-a-path-to-unique-sound-design |
| K13 | MusicRadar, "How to program 6 different four-to-the-floor grooves" | https://www.musicradar.com/how-to/how-to-program-6-different-four-to-the-floor-grooves |
| K14 | Ethan Hein, "Drum machine programming" | https://www.ethanhein.com/wp/2010/drum-machine-programming/ |
| K15 | MusicRadar, "How to program 5 classic electronic music kick drum patterns" | https://www.musicradar.com/how-to/how-to-program-5-classic-electronic-music-kick-drum-patterns |
| K16 | Wikipedia, *Roland TR-909* | https://en.wikipedia.org/wiki/Roland_TR-909 |
| K17 | Samplesound, "Creative drum programming in minimal techno" | https://www.samplesoundmusic.com/blogs/news/creative-drum-programming-in-minimal-techno-beyond-the-4x4 |
| K18 | gearnews, "Robert Hood and the discipline of the TR-909" | https://www.gearnews.com/techno-legend-robert-hood-gear-synths/ |
| K19 | MusicRadar, "How to program realistic-sounding hi-hat parts" | https://www.musicradar.com/tuition/tech/how-to-program-realistic-sounding-hi-hat-parts-630716 |
| K20 | Aulart, "Create a 909 dark techno pattern" | https://www.aulart.com/blog/create-a-909-dark-techno-pattern-2/ |

### Trance
| id | source | URL |
|---|---|---|
| K21 | Wikipedia, *Trance music* | https://en.wikipedia.org/wiki/Trance_music |
| K22 | Native Instruments, "What is trance music?" | https://blog.native-instruments.com/trance-music/ |
| K23 | Born To Produce, "How to make trance music" | https://www.borntoproduce.com/blogs/blog/how-to-make-trance-music |
| K24 | Beatkey, "How to make trance music" (lower authority) | https://beatkey.app/how-to-make-trance-music |
| K25 | Myloops, "Uplifting trance arrangement" | https://www.myloops.net/how-to-arrange-an-uplifting-trance-track-from-start-to-finish |
| K26 | Wikipedia, *Psychedelic trance* | https://en.wikipedia.org/wiki/Psychedelic_trance |
| K27 | EDMProd, "Drum patterns: the ultimate guide" | https://www.edmprod.com/drums-guide/ |
| K28 | Wikipedia, *Tech trance* | https://en.wikipedia.org/wiki/Tech_trance |
| K29 | Myloops, "Psytrance rolling bassline that locks with the kick" | https://www.myloops.net/how-to-make-a-psytrance-rolling-bassline |
| K30 | MusicRadar, "How to create the ultimate snare roll build-up" | https://www.musicradar.com/how-to/how-to-create-the-ultimate-snare-roll-build-up |
| K31 | HowToMakeElectronicMusic, "Driving psytrance beat & bassline in FL Studio" | https://howtomakeelectronicmusic.com/how-to-make-driving-psytrance-beat-and-bassline-in-fl-studio/ |

### Electro
| id | source | URL |
|---|---|---|
| K32 | Attack, "Electro beat inspired by Cybotron's 'Clear'" | https://www.attackmagazine.com/technique/beat-dissected/how-to-make-an-electro-beat-inspired-by-cybotrons-clear/ |
| K33 | Attack, "Beat Dissected: Miami Bass" | https://www.attackmagazine.com/technique/beat-dissected/miami-bass/ |
| K34 | MusicRadar, "How to program a classic electro drum track" | https://www.musicradar.com/how-to/how-to-program-a-classic-electro-drum-track |
| K35 | Vibebox, "Your first electro track: programming the 808" (lower authority) | https://vibebox.studio/en/learn/electro/getting-started-electro |
| K36 | Wikipedia, *Electro (music)* | https://en.wikipedia.org/wiki/Electro_(music) |
| K37 | Wikipedia, *Roland TR-808* | https://en.wikipedia.org/wiki/Roland_TR-808 |
| K38 | Studio Brootle, "Electro drum patterns" | https://www.studiobrootle.com/electro-drum-patterns/ |
| K39 | Studio Brootle, "Drexciya electro beat tutorial" | https://www.studiobrootle.com/drexciya-electro-beat-tutorial/ |
| K40 | Magnetic, "Program your 808" (Rob Ricketts posters; images only) | https://magneticmag.com/2012/03/program-your-808-a-visual-representation-of-some-of-the-most-notable-drum-sequences-in-edm-history/ |

### Disco
| id | source | URL |
|---|---|---|
| K43 | Coda, "Earl Young made the beat every dance floor runs on" | https://codamusic.me/articles/earl-young-mfsb-four-on-the-floor |
| K44 | Attack, "Loose Disco" | https://www.attackmagazine.com/technique/beat-dissected/loose-disco/ |
| K45 | Attack, "Nu-Disco Live Groove" | https://www.attackmagazine.com/technique/beat-dissected/nu-disco-live-groove/ |
| K46 | Attack, "Live Hi-Hats" | https://www.attackmagazine.com/technique/beat-dissected/live-hi-hats/ |
| K47 | MusicRadar, "How to program a typical disco drum beat" | https://www.musicradar.com/how-to/how-to-program-a-typical-disco-drum-beat |
| K48 | Drumhelper, "10 disco drum beats and drum patterns" | https://drumhelper.com/learning-drums/disco-drum-beats-and-patterns/ |
| K49 | DRUM! Magazine, "Lesson: four-on-the-floor disco" | https://drummagazine.com/lesson-four-on-the-floor-disco/ |
| K50 | Wikipedia, *Earl Young (drummer)* | https://en.wikipedia.org/wiki/Earl_Young_(drummer) |
| K51 | MusicRadar, "How to program authentic shaker patterns" | https://www.musicradar.com/tuition/tech/how-to-program-authentic-shaker-patterns-638625 |
| K52 | MusicRadar, "How to program a basic Latin rhythm with congas and bongos" | https://www.musicradar.com/tuition/tech/how-to-program-a-basic-latin-rhythm-with-congas-and-bongos-634917 |
| K53 | Attack, "Programming a nu-disco beat" | https://www.attackmagazine.com/technique/beat-dissected/programming-a-nu-disco-beat/ |

### Synth-pop / 80s machines
| id | source | URL |
|---|---|---|
| K54 | Attack, "Early 80s Groove" | https://www.attackmagazine.com/technique/beat-dissected/early-80s-groove/ |
| K55 | Attack, "Synthwave Drums" | https://www.attackmagazine.com/technique/beat-dissected/synthwave-drums/ |
| K56 | Wikipedia, *Synth-pop* | https://en.wikipedia.org/wiki/Synth-pop |
| K57 | Sound On Sound, "Classic tracks: Depeche Mode 'People Are People'" | https://www.soundonsound.com/techniques/classic-tracks-depeche-mode-people-are-people |
| K58 | Wikipedia, *Blue Monday (New Order song)* | https://en.wikipedia.org/wiki/Blue_Monday_(New_Order_song) |
| K59 | MusicRadar, "10 steps to producing perfect '80s pop" | https://www.musicradar.com/tuition/tech/10-steps-to-producing-perfect-80s-pop-604018 |
| K60 | Wikipedia, *Gated reverb* | https://en.wikipedia.org/wiki/Gated_reverb |
| K61 | Wikipedia, *Simmons (electronic drum company)* | https://en.wikipedia.org/wiki/Simmons_(electronic_drum_company) |
| K62 | Sound On Sound, "Classic tracks: Human League 'Don't You Want Me'" | https://www.soundonsound.com/techniques/classic-tracks-human-league-dont-you-want-me |

### Breaks
| id | source | URL |
|---|---|---|
| K63 | Wikipedia, *Breakbeat* | https://en.wikipedia.org/wiki/Breakbeat |
| K64 | Wikipedia, *Big beat* | https://en.wikipedia.org/wiki/Big_beat |
| K65 | Wikipedia, *Nu skool breaks* | https://en.wikipedia.org/wiki/Nu_skool_breaks |
| K66 | MusicRadar, "How to program a Funky Drummer-style MIDI break" | https://www.musicradar.com/how-to/how-to-program-a-funky-drummer-style-midi-break-in-your-daw |
| K67 | Wikipedia, *Think (break)* | https://en.wikipedia.org/wiki/Think_break |
| K68 | Wikipedia, *Apache (instrumental)* | https://en.wikipedia.org/wiki/Apache_(instrumental) |
| K69 | MusicRadar, "How to program an Amen-style break" | https://www.musicradar.com/tuition/tech/how-to-program-an-amen-style-break-637374 |
| K70 | Native Instruments, "How to make breakbeat music" | https://blog.native-instruments.com/how-to-make-breakbeat-music/ |

### Hip-hop
| id | source | URL |
|---|---|---|
| K71 | RouteNote, "How to make 90s hip-hop boom bap drums" | https://create.routenote.com/blog/how-to-make-90s-hip-hop-boom-bap-drums/ |
| K72 | Native Instruments, "What is boom bap?" | https://blog.native-instruments.com/what-is-boom-bap/ |
| K73 | Attack, "90s Boom Bap Hip Hop" | https://www.attackmagazine.com/technique/beat-dissected/90s-boom-bap-hip-hop/ |
| K74 | Audeobox, "MPC drum programming" (lower authority, possibly generated) | https://www.audeobox.com/learn/mpc-software/mpc-drum-programming/ |
| K75 | Wikipedia, *Boom bap* | https://en.wikipedia.org/wiki/Boom_bap |
| K76 | Ethan Hein, "Dilla time" | https://www.ethanhein.com/wp/2022/dilla-time/ |
| K77 | Attack, "Drunk Drummer-style grooves" | https://www.attackmagazine.com/technique/beat-dissected/drunk-drummer-style-grooves/ |
| K78 | Wikipedia, *E-mu SP-1200* | https://en.wikipedia.org/wiki/E-mu_SP-1200 |
| K79 | MusicRadar, "10 tricks every trap producer should know" | https://www.musicradar.com/tuition/tech/10-tricks-every-trap-producer-should-know-638684 |
| K80 | MusicRadar, "Mixed-resolution trap-style hi-hat patterns" | https://www.musicradar.com/how-to/how-to-program-mixed-resolution-trap-style-hi-hat-patterns |
| K81 | Gearspace, "SP1200 swing tips" (snippet) | (search summary only) |

### House, DnB, rock, punk, funk (kit categories)
| id | source | URL |
|---|---|---|
| K82 | Amped Studio, "House drum patterns: step-by-step" | https://ampedstudio.com/blog/how-tomake-a-house-beat/ |
| K83 | Attack, "Simple Jackin' House" | https://www.attackmagazine.com/technique/beat-dissected/simple-jackin-house/ |
| K84 | Attack, "Lone inspired percussion driven drums" | https://www.attackmagazine.com/technique/beat-dissected/lone-inspired-percussion-driven-drums/ |
| K85 | Attack, "Deep Tech House" | https://www.attackmagazine.com/technique/beat-dissected/deep-tech-house/ |
| K86 | Attack, "Rolling Deep House" | https://www.attackmagazine.com/technique/beat-dissected/rolling-deep-house/ |
| K87 | Your Creative Academy, "House music production: cymbals and percussion" | https://yourcreativeacademy.blogspot.com/2016/05/house-music-production-cymbals-and.html |
| K88 | Attack, "Realistic Bongos" | https://www.attackmagazine.com/technique/beat-dissected/realistic-bongos/ |
| K89 | Quadrophone, "How to make a house beat" | https://quadrophone.com/drums/how-to-make-a-house-beat/ |
| K90 | Matt Chapman Audio, "Drum n bass drum patterns" | https://www.mattchapmanaudio.com/blog/drum-n-bass-drum-pattern |
| K91 | MusicRadar, "How to program 6 different jungle and 6 DnB grooves" | https://www.musicradar.com/how-to/program-6-different-jungle-6-dnb-grooves |
| K92 | dnb.college, "Ghost note placement (beginner)" | https://www.dnb.college/lessons/ghost-note-placement-beginner-drums |
| K93 | Attack, "Incessant drum & bass" | https://www.attackmagazine.com/technique/beat-dissected/incessant-drum-bass-beat/ |
| K94 | Drumeo, "A drummer's guide to rock" | https://www.drumeo.com/beat/a-drummers-guide-to-rock/ |
| K95 | Wikipedia, *Crash cymbal* | https://en.wikipedia.org/wiki/Crash_cymbal |
| K96 | Wikipedia, *Fill (music)* | https://en.wikipedia.org/wiki/Drum_fill |
| K97 | Drumeo, "A drummer's guide to punk" | https://www.drumeo.com/beat/a-drummers-guide-to-punk/ |
| K98 | Drumhelper, "10 punk drum beats and rhythms" | https://drumhelper.com/learning-drums/punk-drum-beats-and-rhythms/ |
| K99 | Wikipedia, *D-beat* | https://en.wikipedia.org/wiki/D-beat |
| K100 | Wikipedia, *Blast beat* (skank-beat section) | https://en.wikipedia.org/wiki/Blast_beat |
| K101 | Oracle Sound, "Drum programming for punk and hardcore" | https://www.oraclesound.com/blogs/news/drum-programming-techniques-for-punk-and-hardcore-music |
| K102 | Wikipedia, *Ghost note* | https://en.wikipedia.org/wiki/Ghost_note |
| K103 | Roland, "Behind the beat: 'Funky Drummer'" | https://articles.roland.com/behind-the-beat-funky-drummer-by-james-brown/ |
| K104 | Drumeo, "A drummer's guide to funk" | https://www.drumeo.com/beat/a-drummers-guide-to-funk/ |

### Synthwave
| id | source | URL |
|---|---|---|
| K116 | Wikipedia, *Synthwave* | https://en.wikipedia.org/wiki/Synthwave |
| K117 | Mode Audio, "5 production essentials of retro & synthwave" | https://modeaudio.com/magazine/synthwave-5-production-essentials |
| K118 | Melodigging, "Darksynth" (lower authority) | https://www.melodigging.com/genre/darksynth |
| K119 | Native Instruments, "What is synthwave music?" | https://blog.native-instruments.com/synthwave/ |
| K120 | Wikipedia, *Chillwave* | https://en.wikipedia.org/wiki/Chillwave |
| K121 | UJAM, "How to make synthwave drum patterns" | https://www.ujam.com/tutorials/how-to-synthwave-drum-patterns/ |
| K122 | Orpheus Audio Academy, "How to make synthwave and 80s drum patterns" | https://www.orpheusaudioacademy.com/synthwavedrums/ |
| K123 | eMastered, "How to make synthwave" | https://emastered.com/blog/how-to-make-synthwave |
| K124 | EDMProd, "How to make synthwave" (paraphrased by the fetch) | https://www.edmprod.com/how-to-make-synthwave/ |
| K125 | Synthwave Pro, "Synthwave drums reverb tutorial" | https://synthwavepro.com/synthwave-drums-reverb-tutorial/ |
| K126 | MusicTech, "Authentic vintage drum gated reverb for synthwave" | https://musictech.com/tutorials/tips/how-to-create-authentic-vintage-drum-gated-reverb-for-synthwave-chillwave-music-styles/ |
| K127 | Futureproof, "Dive into synthwave" | https://futureproofmusicschool.com/blog/dive-into-synthwave-create-your-own-sound-today |
| K128 | LANDR, "Drum programming: 17 essential electronic drum patterns" | https://blog.landr.com/drum-programming/ |

### New wave, post-punk / goth, 80s machines, Italo, EBM
| id | source | URL |
|---|---|---|
| K129 | Attack, "New Wave Drums" | https://www.attackmagazine.com/technique/beat-dissected/new-wave-drums/ |
| K130 | Wikipedia, *Heart of Glass (song)* | https://en.wikipedia.org/wiki/Heart_of_Glass_(song) |
| K131 | Wikipedia, *New wave music* | https://en.wikipedia.org/wiki/New_wave_music |
| K132 | Wikipedia, *Whip It (Devo song)* | https://en.wikipedia.org/wiki/Whip_It_(Devo_song) |
| K133 | Wikipedia, *Alan Myers (drummer)* | https://en.wikipedia.org/wiki/Alan_Myers_(drummer) |
| K134 | Wikipedia, *Once in a Lifetime (Talking Heads song)* | https://en.wikipedia.org/wiki/Once_in_a_Lifetime_(Talking_Heads_song) |
| K135 | Wikipedia, *Siouxsie and the Banshees* | https://en.wikipedia.org/wiki/Siouxsie_and_the_Banshees |
| K136 | Wikipedia, *Budgie (musician)* | https://en.wikipedia.org/wiki/Budgie_(musician) |
| K137 | Wikipedia, *Gothic rock* | https://en.wikipedia.org/wiki/Gothic_rock |
| K138 | Wikipedia, *Bauhaus (band)* | https://en.wikipedia.org/wiki/Bauhaus_(band) |
| K139 | Wikipedia, *Bela Lugosi's Dead* | https://en.wikipedia.org/wiki/Bela_Lugosi%27s_Dead |
| K140 | Wikipedia, *Stephen Morris (musician)* | https://en.wikipedia.org/wiki/Stephen_Morris_(musician) |
| K141 | Wikipedia, *She's Lost Control* | https://en.wikipedia.org/wiki/She%27s_Lost_Control |
| K142 | Wikipedia, *Motorik* | https://en.wikipedia.org/wiki/Motorik |
| K143 | Wikipedia, *A Forest* | https://en.wikipedia.org/wiki/A_Forest |
| K144 | Wikipedia, *Doktor Avalanche* | https://en.wikipedia.org/wiki/Doktor_Avalanche |
| K145 | Wikipedia, *Post-punk* | https://en.wikipedia.org/wiki/Post-punk |
| K146 | Abundant Audio, "New Order – 'Blue Monday': a case study" | https://abhigginson.wordpress.com/2017/08/21/new-order-blue-monday-a-case-study/ |
| K147 | Beat Lab Academy, "Deconstruction: Blue Monday" (snippet; page refused connection) | https://beatlabacademy.com/deconstruction-blue-monday/ |
| K148 | MusicRadar, making of "Blue Monday" (intro after Moroder's "Our Love") | https://www.musicradar.com/artists/singles-albums/walk-on-press-a-button-leave-the-gear-to-play-a-song-all-on-its-own-while-we-piss-off-back-to-the-booze-in-the-dressing-room-and-chortle-to-ourselves-the-mistakes-and-judicious-choices-that-made-new-orders-blue-monday |
| K149 | Wikipedia, *Oberheim DMX* | https://en.wikipedia.org/wiki/Oberheim_DMX |
| K150 | Wikipedia, *Linn LM-1* | https://en.wikipedia.org/wiki/Linn_LM-1 |
| K151 | Attack, "Linn LM-1 Beat" | https://www.attackmagazine.com/technique/beat-dissected/linn-lm1-beat/ |
| K152 | Wikipedia, *Just Can't Get Enough (Depeche Mode song)* | https://en.wikipedia.org/wiki/Just_Can%27t_Get_Enough_(Depeche_Mode_song) |
| K153 | Wikipedia, *I Feel Love* | https://en.wikipedia.org/wiki/I_Feel_Love |
| K154 | Sound On Sound, "Classic tracks: Donna Summer 'I Feel Love'" | https://www.soundonsound.com/techniques/classic-tracks-donna-summer-feel-love |
| K155 | Wikipedia, *Hi-NRG* | https://en.wikipedia.org/wiki/Hi-NRG |
| K156 | Attack, "Make an Italo bassline with Chance Engine" | https://www.attackmagazine.com/technique/tutorials/make-an-italo-bassline-with-chance-engine/ |
| K157 | Attack, "High-octane Eurodisco inspired by Captain Hollywood Project" | https://www.attackmagazine.com/technique/beat-dissected/high-octane-eurodisco-inspired-by-captain-hollywood-project/ |
| K158 | Wikipedia, *Italo disco* | https://en.wikipedia.org/wiki/Italo_disco |
| K159 | Wikipedia, *Electronic body music* | https://en.wikipedia.org/wiki/Electronic_body_music |
| K160 | Wikipedia, *Deutsch Amerikanische Freundschaft* | https://en.wikipedia.org/wiki/Deutsch_Amerikanische_Freundschaft |
| K161 | Wikipedia, *Die Krupps* | https://en.wikipedia.org/wiki/Die_Krupps |
| K162 | Studio Brootle, "EBM bassline tutorial (Nitzer Ebb / Phase Fatale)" | https://www.studiobrootle.com/ebm-bassline-tutorial-ableton/ |
| K163 | Beatkey, "How to make industrial music" (snippet, lower authority) | https://beatkey.app/how-to-make-industrial-music |

Not reachable (so nothing is claimed from them): SOS "Blue Monday" (410), Gearspace (403), Reverb
(403), Wikipedia "Headhunter"/"Join in the Chant"/"Der Mussolini"/"Don't You Want Me" (404/timeout).

## Licence audit — new findings (2026-09-23)

Same rule as `../SOURCES.md`: only an explicit open licence covering the **pattern content** counts.
Earlier findings there (GMD/E-GMD INGEST OK; Lakh, dmp_midi, Tegridy, drum_bassline_dataset REFERENCE
ONLY; Selekt, TapTamDrum UNCLEAR) are unchanged and not repeated.

| id | collection | licence as found (verbatim, as returned by the fetch tool) | content / provenance | class |
|---|---|---|---|---|
| K41 | **mpump** (gdamdam) — techno/trance/psy/electro/dub-techno patterns as JSON | repo licence **AGPL-3.0** (GitHub) | Hand-made patterns in a web app | **REFERENCE ONLY** — AGPL is copyleft; shipping the data would impose AGPL terms on the product. https://github.com/gdamdam/mpump |
| K42 | arXiv 1804.09808 electro/techno/IDM pattern set (1,782 patterns) | none seen (snippet only) | Unknown | **UNCLEAR** — not verified. https://arxiv.org/abs/1804.09808 |
| K105 | **Slakh2100** | "Creative Commons Attribution 4.0 International" | Synthesised from Lakh MIDI (scraped transcriptions of commercial songs) | **REFERENCE ONLY** — CC BY on the render cannot license the song arrangements. https://zenodo.org/records/4599666 |
| K106 | **STAR Drums** | "BSD 3-Clause … for code" + "Various Creative Commons licenses for the audio files"; some source tracks "do not permit direct distribution" | Auto-transcribed drums of MUSDB18 songs | **REFERENCE ONLY / UNCLEAR.** https://zenodo.org/records/15690078 |
| K107 | **ENST-Drums** | use under "THE TERMS OF THE USER LICENCE", research purposes | Original performances, 3 drummers (audio + annotations) | **REFERENCE ONLY.** https://adasp.telecom-paris.fr/resources/2009-11-25-enst-drums/ |
| K108 | **MDB Drums** | "Creative Commons Attribution-NonCommercial-ShareAlike 4.0" | Annotations of MedleyDB songs | **REFERENCE ONLY** (NC). https://github.com/CarlSouthall/MDBDrums |
| K109 | **IDMT-SMT-Drums** | "provided for evaluation purpose under the Creative Commons licence CC BY-NC-ND 4.0" | Original loops | **REFERENCE ONLY** (NC, ND). https://www.idmt.fraunhofer.de/en/publications/datasets/drums.html |
| K110 | **Groove2Groove** | "Creative Commons Attribution Non Commercial 4.0 International" | Band-in-a-Box renders of commercial BiaB styles | **REFERENCE ONLY.** https://zenodo.org/records/3958000 |
| K111 | **AAM (Artificial Audio Multitracks)** | "Creative Commons Attribution 4.0 International"; "the midis used for generation are also available" | Algorithmic compositions; origin of the drum patterns **not stated** (paper not reachable) | **UNCLEAR — best non-GMD lead.** If the drum patterns are generated by the authors, INGEST OK with attribution. Check the paper before use. https://zenodo.org/records/5794629 |
| K112 | **Lo-Fi Drums Dataset** (patchbanks) | "Creative Commons Attribution 4.0 International (CC BY 4.0)" | Audio only, generated "from a customized database of MIDI patterns" (MIDI not shipped) | Licence OK, **no symbolic data** → not applicable. https://github.com/patchbanks/Lo-Fi-Drums-Dataset |
| K113 | **Hydrogen pattern library** | program GPL-2.0+; patterns said to be "CC-BY-SA" (maintainer discussion) | Encoded from Bardet's *260 Drum Machine Patterns* (commercial book) | **REFERENCE ONLY** — the licensor does not own the book content; SA terms too. https://github.com/hydrogen-music/hydrogen/discussions/2028 |
| K114 | **CC0-midis** (m-malandro) | CC0 ("unconditionally waives, abandons, and surrenders all … Copyright") | Contents undocumented | **UNCLEAR** until inspected — CC0 would be INGEST OK if the files are the author's own and contain drum patterns. https://github.com/m-malandro/CC0-midis |
| K115 | **drum-toolkit** (caedmon5) | no licence file | 44 two-bar GM patterns (rock, funk, reggae, latin, jazz) | **REFERENCE ONLY** (no licence = all rights reserved). https://github.com/caedmon5/drum-toolkit |
| — | LANDR MIDI pack (synthwave pattern), Studio Brootle MIDI downloads | no licence stated | Hand-made | **REFERENCE ONLY.** |

**Bottom line (unchanged, sharpened).** GMD/E-GMD remains the only verified ingestible drum-pattern
source. It covers rock, punk (1 drummer), funk, hip-hop, pop/soul, disco (5 files) and a 2-file
170-BPM breakbeat — **none of the electronic or 80s genres**. Those must be *generated* from the rules
in this folder. Two leads worth a follow-up: **AAM** (CC BY 4.0, MIDI included, drum provenance
unknown) and **CC0-midis** (CC0, contents unknown).

### GMD INGEST guide per category (with attribution per `../SOURCES.md`)

| category | best GMD material | notes |
|---|---|---|
| KICK | rock `eval_session/*rock-groove8*`, `drummer3/session1/24,35_rock_120`; funk `eval_session/*funk-groove2_105`; hip-hop `drummer8/session1/3,4_hiphop_90`; disco `drummer1/session1/101_dance-disco_120`; punk `drummer1/session2/32_punk_140` (D-beat) | eval-session files = one groove × several drummers → velocity variants of one pattern |
| SNARE | rock `drummer8/session2/22_rock_96`; hip-hop `drummer8/session2/9_hiphop_86`; funk eval grooves (ghost-rich); disco `26/27_dance-disco_137` | punk: drop vel ≤ 20 hits (kick crosstalk) |
| TOM / fills | the 647 GMD `fill` files (rock 130, funk 107, hiphop 61, punk 51, pop/soul 47) + DK1 fill bars | fill files are ~1 bar and self-contained |
| CYMB | ride 8ths: `drummer3/session1/11,12_rock_120`, `eval_session/*funk-groove1_138`; crash: step-1 hits after fill bars | ignore low-velocity mid-bar crash hits (edge-trigger artefacts) |
| PERC | **none** — GMD has no percussion instruments (cross-stick 37 only) | generate |
| HAT | see `../SOURCES.md` D1; new: disco `26/27_dance-disco_137` (16ths minus backbeat), hip-hop gallop `3,4_hiphop_90`, pop 8ths `eval_session/*pop-groove7_138` | |

Full ranked lists: `analysis/out/ingest_candidates.txt` (DK4).

