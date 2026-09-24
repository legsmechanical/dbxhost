# Melodic sources and licence audit

All pages accessed **2026-09-23**. `[S1]`–`[S42]` are in the parent `../SOURCES.md` (cited here: S5, S7,
S9–S13, S29, S30). "(snippet)" = seen only in a search-engine summary, page not read — weaker evidence.
"READ" pages were fetched through a summarising fetch tool, so quotes are close but should be re-checked
against the page before being reused verbatim; the two de Clercq/Temperley PDFs and the Temperley papers
were text-extracted (exact). The session's web-search budget ran out part-way through, so later genres
(new wave, post-punk, Italo, EBM, synthwave) lean on Wikipedia and directly-fetched tutorial URLs.
Vendor/tutorial blogs (myloops.net, vibebox.studio, discomagic.ru, futureproof, unison, orpheus,
emastered, songen, PML) give the most concrete step numbers and carry the least authority.

## Derived measurements (ours, reproducible — scripts in `melodic/analysis/`)

| id | what | how / caveats |
|---|---|---|
| **D4** | ComMU per-track-role shape: notes/bar, onset probability per 16th, note length, register, voices per onset, voicing width, top-voice intervals, 2-bar range, chord-tone share on beats vs 16th off-beats, degree distribution, harmonic rhythm (from the chord annotation, one chord per 8th). 11,144 samples; 4/4 "standard" (non-triplet) only. | `analysis/commu_role_stats.py <dir>` with `commu_meta.csv` + `commu_midi.tar` from [S401]. Every sample is in C major or A minor, so pitch class vs tonic = degree. Genres are only `cinematic` / `newage` (median 80 BPM) — use as generic **role shape**, not dance rhythm. Melody tracks are often octave-doubled (width 12); stats use the top voice. Chord-tone test uses triad/7th spellings of the annotation. **Licence: REFERENCE ONLY.** |
| **D5** | Chordonomicon chord-sheet vocabulary per genre: chord-quality share, mode lean, chord roots vs a tonic proxy, "songs containing bVII/bVI/bIII/V/IV", root motion, distinct chords per section. 17 genre groups (Spotify tags / main genre; group definitions in the script). | `analysis/chordonomicon_genre_stats.py chordonomicon_v2.csv` from [S402]. **Caveats:** crowd-sourced guitar chord sheets (no timing, no voicing, transcription quality unknown; electronic genres especially thin — techno 58, electro 53, DnB 89, breaks 91 songs); **tonic proxy = the song's most frequent chord**, which can be the relative major of a minor song, so "major/minor-proxy" shares are biased toward major; a song can be in several groups. Robust uses: quality shares (m7/power/dom7), "contains a bVII" style presence tests, root-motion distribution. **Licence: REFERENCE ONLY.** |
| **D6** | McGill Billboard harmonic rhythm: chord onsets per 4/4 bar, beat position of changes, distinct chords per 2-bar window, chord qualities, chord roots vs the annotated tonic. 831 songs / 82,037 bars. | `analysis/billboard_harmonic_rhythm.py <dir>` over `salami_chords.txt` from [S403]. Bars with 1, 2 or 4 chord tokens only (3-token bars and N/X bars skipped); `.` = chord held on that beat. Pop/rock/soul 1958–91, no genre labels → used for BASICS and ROCK. |

## Content sources

| id | source | URL | used for |
|---|---|---|---|
| S101 | EDMProd, "How to make liquid drum and bass" | https://www.edmprod.com/how-to-make-liquid-drum-and-bass/ | 165–175 (174) BPM; F minor most common |
| S102 | MusicRadar, "How to create uplifting liquid DnB chords" | https://www.musicradar.com/how-to/how-to-create-uplifting-liquid-dnb-chords | maj7/m9; Am9–Cmaj7–Em7…; chord per bar; major V ending |
| S103 | Wikipedia, *Liquid drum and bass* | https://en.wikipedia.org/wiki/Liquid_drum_and_bass | jazz/soul influence; smooth synth lines |
| S104 | MusicRadar, "InsideInfo … atmospheric DnB pad" | https://www.musicradar.com/tuition/tech/insideinfo-shows-you-how-to-create-an-atmospheric-dnb-pad-601144 | layered high/low pads |
| S105 | MusicRadar, "Tyke deconstructs a DnB bassline" | https://www.musicradar.com/tuition/tech/tyke-deconstructs-a-dnb-bassline-601204 | jump-up riff = detuned oscillators + portamento |
| S106 | Wikipedia, *Breakbeat* | https://en.wikipedia.org/wiki/Breakbeat | 110–175 BPM; 303 filter; prog breaks leads/pads; electro breaks vocoders |
| S107 | Wikipedia, *Big beat* | https://en.wikipedia.org/wiki/Big_beat | 100–140; distorted synth bass; 303 lines |
| S108 | Wikipedia, *Nu skool breaks* | https://en.wikipedia.org/wiki/Nu_skool_breaks | 125–140; dominant bass line |
| S109 | Attack Magazine, "Bicep-style breakbeats" | https://www.attackmagazine.com/technique/beat-dissected/bicep-style-breakbeats/ | 128 BPM, no swing, four-note bass |
| S110 | LANDR, "Reese bass" | https://blog.landr.com/reese-bass/ | glide ~200 ms, octave-below osc |
| S111 | MusicRadar, "Rave chord stab" | https://www.musicradar.com/how-to/rave-chord-stab | parallel m7 shape; zero attack, short release |
| S112 | Attack Magazine, "Mixing breakbeats" (snippet) | https://www.attackmagazine.com/technique/tutorials/mixing-breakbeats/ | "ravey synths, stabs, glittery arps" |
| S113 | Native Instruments, "What is boom bap" | https://blog.native-instruments.com/what-is-boom-bap/ | 93 BPM; bass R–b7–5; keys stab per bar; two-bar sample |
| S114 | Attack Magazine, "90s boom bap hip hop" | https://www.attackmagazine.com/technique/beat-dissected/90s-boom-bap-hip-hop/ | "Swing MPC 3000 8ths 57"; sine bass |
| S115 | Wikipedia, *Trap music* | https://en.wikipedia.org/wiki/Trap_music | 70 (140) BPM; drones; orchestral textures |
| S116 | MusicRadar, "10 tricks every trap producer should know" | https://www.musicradar.com/tuition/tech/10-tricks-every-trap-producer-should-know-638684 | 140–160; 808 root + phrase-end moves; glide leads; arp triplets |
| S117 | Native Instruments, "Lo-fi hip hop beats" | https://blog.native-instruments.com/lo-fi-hip-hop-beats/ | 60–90 BPM; VI–i–V7; "janky" timing |
| S118 | EDMProd, "Lofi hip hop" | https://www.edmprod.com/lofi-hip-hop/ | 70–100; ~4-bar chord loops |
| S119 | Flat.io, "Lofi chord progressions" | https://blog.flat.io/lofi-chord-progressions/ | hold chord 1–2 bars; spread voicings; ii–V–I etc.; 70–80 BPM |
| S120 | LANDR, "Lofi chord progressions" | https://blog.landr.com/lofi-chord-progressions/ | extensions; Amin11–D7–Fmaj7–Cmaj7 |
| S121 | Wikipedia, *G-funk* | https://en.wikipedia.org/wiki/G-funk | 90–100; portamento saw lead; deep bass |
| S122 | RouteNote, "Hip-hop basslines: a complete guide" | https://create.routenote.com/blog/hip-hop-basslines-a-complete-guide/ | boom-bap samples; 808 roles; drill staccato; G-funk Minimoog |
| S123 | Production Music Live, "Trap beat guide: 808 patterns" | https://www.productionmusiclive.com/blogs/news/trap-beat-guide-bass-essential-tips-for-making-808-patterns | 808 on the kick; root; glides |
| S124 | Production Music Live, "Trap melodies: 3 essential scales" | https://www.productionmusiclive.com/blogs/news/trap-beat-guide-melodies-3-essential-scales-for-making-melodies | minor/harmonic minor/Phrygian; A/B form |
| S125 | Songen, "How to make trap melodies" | https://songen.app/blog/how-to-make-trap-melodies/ | four-slot conversation; counter-melody; not over-quantised |
| S126 | Syntorial, "Dr. Dre Nuthin' but a G Thang lead" | https://www.syntorial.com/preset-recipe/dr-dre-nuthin-but-a-g-thang-lead/ | mono legato whistle lead |
| S127 | Wikipedia, *Lo-fi hip hop* | https://en.wikipedia.org/wiki/Lo-fi_hip_hop | "cloying piano or guitar melodies" |
| S128 | Wikipedia, *Boom bap* | https://en.wikipedia.org/wiki/Boom_bap | swing: on-beats precise, off-beats offset |
| S129 | Jazz Piano Blog, "Improve your clavinet playing" (snippet) | https://jazzpianoblog.com/improve-your-clavinet-playing-part-1/ | clav quick decay |
| S130 | Splice, "Genre focus: funk" | https://splice.com/blog/genre-focus-series-funk-with-splice-sounds/ | 90–110 BPM; one-chord songs; E9/E7#9 |
| S131 | guitar-chord.org, "Funk" | https://www.guitar-chord.org/articles/funk.html | static progressions; 9/13/7#9 swaps; scratch rhythm |
| S132 | Pickup Music, "Funk guitar for beginners" | https://www.pickupmusic.com/blog/funk-guitar-for-beginners | accents on e/&/a; (snippet) every 16th stroked, most muted |
| S133 | Ethan Hein, "Musical simples: Superstition" | https://www.ethanhein.com/wp/2015/musical-simples-superstition/ | 2-bar clav riff, minor pentatonic; 16th anticipation |
| S134 | Sound On Sound, "Top brass part 3" | https://www.soundonsound.com/techniques/top-brass-part-3 | machine-gun repeats; long-short; m7 up a tone |
| S135 | Splice, "How to make disco music" | https://splice.com/blog/how-to-make-disco-music/ | 110–130 BPM; unstressed 16ths; 7ths/9ths/11ths |
| S136 | Wikipedia, *Hi-NRG* | https://en.wikipedia.org/wiki/Hi-NRG | 120–140; staccato sequenced octave bass, 16ths |
| S137 | TalkingBass, "Disco bass octaves" | https://www.talkingbass.net/disco-bass-octaves/ | 8th + 16th octave gallop |
| S138 | Wikipedia, *I Feel Love* | https://en.wikipedia.org/wiki/I_Feel_Love | synth loops + 4/4 + off-beat hat; delay-doubled bass; C major |
| S139 | Attack Magazine, "Lessons from disco chords" | https://www.attackmagazine.com/technique/passing-notes/lessons-from-disco-chords/ | triads/7s; inversions; narrow range |
| S140 | Attack Magazine, "Syncopation" | https://www.attackmagazine.com/technique/passing-notes/syncopation/ | chords either side of the off-beat; off-beat quarter stabs |
| S141 | Premier Guitar, "Nile Rodgers: the emperor of chuck" | https://www.premierguitar.com/artists/nile-rodgers-the-emperor-of-chuck | guitar as ride cymbal, muted; (snippet) ≤ 3 strings, m7/maj7 |
| S142 | MusicRadar, "Giorgio Moroder-style bassline" | https://www.musicradar.com/tuition/tech/how-to-make-a-giorgio-moroder-style-bassline-209902 | 1/16 delay |
| S143 | Wikipedia, *Italo disco* | https://en.wikipedia.org/wiki/Italo_disco | synth/arpeggiator disco; melodies, vocoders |
| S144 | Sound On Sound, "Arranging strings part 4" | https://www.soundonsound.com/techniques/arranging-strings-part-4 | ascending runs; octave lines; one chord per bar |
| S145 | Attack Magazine, "Deep house chords" | https://www.attackmagazine.com/technique/passing-notes/passing-notes-deep-house-chords/ | m7/maj7; close voicing; keep the 7th |
| S146 | Attack Magazine, "Old school house chords" | https://www.attackmagazine.com/technique/synth-secrets/old-school-house-chords/ | m7/m9 |
| S147 | Attack Magazine, "Kerri Chandler chords" | https://www.attackmagazine.com/technique/passing-notes/kerri-chandler-chords/ | two-chord loops; 3rd-inversion 7ths; rootless; early last stab |
| S148 | Attack Magazine, "Kerri Chandler chords part 2" | https://www.attackmagazine.com/technique/passing-notes/kerri-chandler-chords-part2/ | off-beat stabs; step-16 push; ii–V; 9/13/#11 |
| S149 | Attack Magazine, "Levelling up your chord stabs" | https://www.attackmagazine.com/technique/passing-notes/levelling-up-your-chord-stabs/ | avoid kick downbeats; short/long call-response |
| S150 | Attack Magazine, "Parallel chords" | https://www.attackmagazine.com/technique/passing-notes/parallel-chords/ | same voicing; leaves the key |
| S151 | Wikipedia, *Korg M1* | https://en.wikipedia.org/wiki/Korg_M1 | piano/organ presets in 90s house |
| S152 | Attack Magazine, "Main-room house chord progressions" | https://www.attackmagazine.com/technique/passing-notes/main-room-house-chord-progressions/ | VI "lifting" chord |
| S153 | Wikipedia, *Acid house* | https://en.wikipedia.org/wiki/Acid_house | 303 resonance, accent, slide, octave |
| S154 | Mono Sounds, "Acid bass (Serum)" | https://monosounds.studio/acid-bass-serum-2/ | 16ths on 1–2 pitches; octave jumps; off-beat accents; 1–2 bar loops |
| S155 | Native Instruments, "Tech house" | https://blog.native-instruments.com/tech-house/ | 130 BPM; line on steps 1/5/9/12/15; (snippet) vocal chops |
| S156 | Wikipedia, *Deep house* | https://en.wikipedia.org/wiki/Deep_house | 110–125; pads; jazz-funk chords |
| S157 | Wikipedia, *Move Your Body* | https://en.wikipedia.org/wiki/Move_Your_Body_(Marshall_Jefferson_song) | 122 BPM; house piano, minor chords |
| S158 | VI-Control forum, "Funk/disco strings" (snippet, forum, page 403) | https://vi-control.net/community/threads/what-are-the-idioms-and-techniques-behind-funk-disco-strings.150009/ | stabby strings, Dorian/Mixolydian; octaves and sixths |
| S159 | Ali Jamieson, "What is the funkiest tempo?" | https://alijamieson.co.uk/2018/09/12/what-is-the-funkiest-tempo/ | 114 BPM; cluster ~94 |
| S160 | Wikipedia, *Techno* | https://en.wikipedia.org/wiki/Techno | 120–150; repetition over harmony; melodies uncommon |
| S161 | Wikipedia, *Minimal techno* | https://en.wikipedia.org/wiki/Minimal_techno | 125–130; rhythm over melody |
| S162 | Wikipedia, *Dub techno* | https://en.wikipedia.org/wiki/Dub_techno | 110–125; sparse changes; repetitive bass |
| S163 | Attack Magazine, "Basic Channel-style dub techno" | https://www.attackmagazine.com/technique/beat-dissected/basic-channel-style-dub-techno/ | 145 BPM example; i/iv sub; 1/8-dotted delay |
| S164 | myloops, "Melodic techno chords and melodies" | https://www.myloops.net/how-to-create-melodic-techno-chords-and-melodies | 120–124; stabs on 7/15; chord rates; triad voicing; modes; loops; lead density |
| S165 | Attack Magazine, "Warehouse rolling techno bass" | https://www.attackmagazine.com/technique/tutorials/warehouse-rolling-techno-bass/ | kick 16th empty; root on most 16ths; C2 octave |
| S166 | Attack Magazine, "Low end theory: eight bassline styles" | https://www.attackmagazine.com/technique/tutorials/low-end-theory-exploring-eight-common-bassline-styles/ | off-beat bass between kicks |
| S167 | myloops, "Melodic techno bassline" | https://www.myloops.net/how-to-make-a-melodic-techno-bassline | off-beats 3/7/11/15; 70 % root; velocities; lengths; skip |
| S168 | Attack Magazine, "Theory of techno: parallel chord stabs" | https://www.attackmagazine.com/technique/tutorials/the-theory-of-techno-parallel-chord-stabs/ | same shape; 16th stabs; off-downbeat; 7ths/9ths |
| S169 | Attack Magazine, "Dub techno synth chords" | https://www.attackmagazine.com/technique/synth-secrets/dub-techno-synth-chords/ | dotted-8th delay settings; nudged timing |
| S170 | Ableton forum, Detroit techno chords (forum) | https://forum.ableton.com/viewtopic.php?t=178757 | minor chords; min7 + sub root; one-chord sampler |
| S171 | MusicRadar, "Producer's guide to the TB-303" | https://www.musicradar.com/news/producers-guide-to-the-roland-tb-303-and-clones | 16 steps; accent, slide, octave, tie; simplicity |
| S172 | tinyloops, "TB-303 quick results" | https://www.tinyloops.com/tb303/quick_results.html | step = note/tie/rest; one-octave range + up/down |
| S173 | Attack Magazine, "Theory of techno: pads part 1" | https://www.attackmagazine.com/technique/tutorials/the-theory-of-techno-pads-part-1/ | minor triads; octave doubling |
| S174 | vibebox.studio, "Getting started: techno" | https://vibebox.studio/en/learn/techno/getting-started-techno | 120–145; stabs; dark pads |
| S175 | Wikipedia, *Detroit techno* | https://en.wikipedia.org/wiki/Detroit_techno | synthetic string arrangements |
| S176 | Wikipedia, *Strings of Life* | https://en.wikipedia.org/wiki/Strings_of_Life | string/piano breakdown |
| S177 | Wikipedia, *Electro (music)* | https://en.wikipedia.org/wiki/Electro_(music) | programmed bass, arpeggiated riffs; syncopated kick; vocoder; Kraftwerk/YMO |
| S178 | vibebox.studio, "Getting started: electro" | https://vibebox.studio/en/learn/electro/getting-started-electro | 110–130; 3–5-note basslines; rests; kick-bass unity |
| S179 | vibebox.studio, "Electro-funk" | https://vibebox.studio/en/learn/electro/electro-funk | simple repetitive bass locked to 808 |
| S180 | vibebox.studio, "Miami bass" | https://vibebox.studio/en/learn/electro/miami-bass | 125–140; tuned 808 kick as bass |
| S181 | Attack Magazine, "Miami bass" | https://www.attackmagazine.com/technique/beat-dissected/miami-bass/ | 130–135; 16th rests; long 808 |
| S182 | vibebox.studio, "Cybotron" | https://vibebox.studio/en/learn/electro/cybotron | arpeggiated bass; melancholic melodies |
| S183 | Attack Magazine, "Electro beat inspired by Cybotron's Clear" | https://www.attackmagazine.com/technique/beat-dissected/how-to-make-an-electro-beat-inspired-by-cybotrons-clear/ | 125 BPM; stabs, plucky arps |
| S184 | Wikipedia, *Planet Rock (song)* | https://en.wikipedia.org/wiki/Planet_Rock_(song) | Kraftwerk melody; funk + bass |
| S185 | Studio Brootle, "Drexciya electro beat tutorial" | https://www.studiobrootle.com/drexciya-electro-beat-tutorial/ | end-of-2-bar stab; minor chord; (snippet) hard 16th plucks |
| S186 | Wikipedia, *Trance music* | https://en.wikipedia.org/wiki/Trance_music | 120–150; arps + minor keys; central hook; breakdown |
| S187 | Wikipedia, *Uplifting trance* | https://en.wikipedia.org/wiki/Uplifting_trance | 135–140; rests on a major chord; washes |
| S188 | myloops, "Uplifting trance bassline" | https://www.myloops.net/how-to-make-an-uplifting-trance-bassline | 138–140; rolling 16ths; velocities; variation |
| S189 | The Producer School, "5 essential bass patterns (hard house/trance)" | https://theproducerschool.com/blogs/featured-blogs/5-essential-bass-patterns-that-define-hard-house-and-trance-music | donk, double off-beat, rolling, octave, syncopated |
| S190 | myloops, "Psytrance rolling bassline" | https://www.myloops.net/how-to-make-a-psytrance-rolling-bassline | KBBB grid; length; F1–A1 |
| S191 | Wikipedia, *Psychedelic trance* | https://en.wikipedia.org/wiki/Psychedelic_trance | 125–150; constant bass; 8-bar changes |
| S192 | myloops, "Uplifting trance chord progressions" | https://www.myloops.net/how-to-write-uplifting-trance-chord-progressions | i–VI–III–VII; 2 bars/chord; add9; A3–C5 voicing; sus2 |
| S193 | Unison, "Trance chord progressions" | https://unison.audio/trance-chord-progressions/ | major-key lists (weak) |
| S194 | Kilohearts, "Trance Gate" | https://kilohearts.com/products/trance_gate | gate sequencer on pads/leads |
| S195 | myloops, "Trance arpeggios and rhythmic sequences" | https://www.myloops.net/programming-trance-arpeggios-and-rhythmic-sequences | Up/16th/2 oct; gate bands; velocity; note order; worked example |
| S196 | tranceproducer.co.uk, "Trance melodies and arps" | https://tranceproducer.co.uk/blogs/news/how-to-write-trance-melodies-and-arps-from-scratch | 4–6 notes; stepwise; peak; gaps |
| S197 | readyformasterclass, "The 4-note motif behind every memorable trance lead" | https://readyformasterclass.com/the-4-note-motif-behind-every-memorable-trance-lead/ | motif + changed resolution; peak length; m3→5 climb |
| S198 | myloops, "Progressive trance melodies and plucks" | https://www.myloops.net/how-to-create-progressive-trance-melodies-and-plucks | ≤ 5 pitches; 1.5–2 oct; holes in 16ths; call/response |
| S199 | Outerverse, "Scales and modes in psytrance" | https://outerverse.fm/blogs/tutorials/understanding-scales-modes-in-psytrance | Phrygian; harmonic minor; (snippet) minor 2nds |
| S200 | myloops, "Emotional uplifting trance breakdown" | https://www.myloops.net/how-to-create-an-emotional-uplifting-trance-breakdown | 32-bar breakdown; pad envelope; layers; i–iv–VII–III |
| S201 | bpmcalc, "Rock BPM" | https://bpmcalc.com/genres/rock/ | rock 110–140 (sub-styles); punk 150–180 |
| S202 | TalkingBass, "Must-know rock bass line" | https://www.talkingbass.net/must-know-rock-bass-line/ | 8th pedal = most common rock bass |
| S203 | Wikipedia, *Rock music* | https://en.wikipedia.org/wiki/Rock_music | backbeat; modes; keyboards |
| S204 | de Clercq & Temperley (2011), "A corpus analysis of rock harmony", *Popular Music* 30(1) | http://rockcorpus.midside.com/2011_paper/declercq_temperley_2011.pdf (also https://davidtemperley.com/wp-content/uploads/2015/11/declercq-temperley-pm11.pdf) | root shares, trigrams, transitions, 75.8 % major, 94.1 % root position |
| S205 | TrueFire, "5 rock bass grooves you must know" | https://blog.truefire.com/guitar-lessons/5-rock-bass-grooves-must-know/ | 8ths on root; dotted-quarter R–5; staccato |
| S206 | Dummies, "Rock'n'roll grooves on bass" (snippet) | https://www.dummies.com/article/academics-the-arts/music/instruments/bass-guitar/how-to-play-rock-n-roll-style-grooves-on-the-bass-guitar-154683/ | straight 8ths on chord roots |
| S207 | StudyBass, "Roots and fifths" (snippet) | https://www.studybass.com/lessons/common-bass-patterns/roots-and-fifths/ | root–5th most supportive |
| S208 | Wikipedia, *Power chord* | https://en.wikipedia.org/wiki/Power_chord | root + 5th (+8); 1-5-1'; distortion |
| S209 | Wikipedia, *Palm mute* | https://en.wikipedia.org/wiki/Palm_mute | chug; accented-then-muted (Basket Case) |
| S210 | Wikipedia, *Mixolydian mode* | https://en.wikipedia.org/wiki/Mixolydian_mode | I–bVII–IV–V |
| S211 | Temperley & de Clercq (2013), "Statistical analysis of harmony and melody in rock music", *JNMR* 42(3) | https://www.midside.com/publications/temperley_declercq_2013.pdf | melody degrees 1 then 5; b7 > 7; pentatonic union; modes rare |
| S212 | Wikipedia, *Pentatonic scale* | https://en.wikipedia.org/wiki/Pentatonic_scale | minor pentatonic 1 b3 4 5 b7; blues/rock |
| S213 | Wikipedia, *Riff* | https://en.wikipedia.org/wiki/Riff | short repeated motif |
| S214 | Wikipedia, *Hammond organ* | https://en.wikipedia.org/wiki/Hammond_organ | chords and leads; overdriven |
| S215 | Wikipedia, *Downpicking* | https://en.wikipedia.org/wiki/Downpicking | Ramones 180–200; fast 8th downstrokes |
| S216 | Hooktheory TheoryTab, "Basket Case" | https://www.hooktheory.com/theorytab/view/green-day/basket-case | 170 BPM; no-3rd progressions; melody Eb3–F4, 100 % diatonic, 69 % chord tones |
| S217 | Wikipedia, *Punk rock* | https://en.wikipedia.org/wiki/Punk_rock | instrumentation; little syncopation; buzzsaw power/barre chords; forced rhythm; no solos |
| S218 | Premier Guitar, "How to jam out like the Ramones" | https://www.premierguitar.com/lessons/how-to-jam-out-like-the-ramones | quarter + 8ths; full barre chords; I–IV–V |
| S219 | guitar-chord.org, "Punk" | https://www.guitar-chord.org/articles/punk.html | power chord most used; I–IV–V; (snippet) quarter + muted 8ths |
| S220 | Wikipedia, *I–V–vi–IV progression* | https://en.wikipedia.org/wiki/I%E2%80%93V%E2%80%93vi%E2%80%93IV_progression | "pop-punk progression" |
| S221 | Wikipedia, *New wave music* | https://en.wikipedia.org/wiki/New_wave_music | choppy guitars, angular riffs, fast tempos, stop-start, influences |
| S222 | Hooktheory TheoryTab, "Sweet Dreams" | https://www.hooktheory.com/theorytab/view/eurythmics/sweet-dreams---are-made-of-this | 126 BPM; i–VI–v; melody stats |
| S223 | Hooktheory TheoryTab, "Enjoy the Silence" | https://www.hooktheory.com/theorytab/view/depeche-mode/enjoy-the-silence | 114 BPM; progressions; melody stats |
| S224 | Hooktheory TheoryTab, "Don't You Want Me" | https://www.hooktheory.com/theorytab/view/the-human-league/dont-you-want-me | 118 BPM; progressions; melody range/stats |
| S225 | Wikipedia, *Synth-pop* | https://en.wikipedia.org/wiki/Synth-pop | synths/sequencers; riffs without progression; monophonic; orchestral imitation; artificiality |
| S226 | MusicRadar, "10 steps to producing perfect 80s pop" | https://www.musicradar.com/tuition/tech/10-steps-to-producing-perfect-80s-pop-604018 | alternate-octave bass; 8th octave bass; Juno arps; off-beat drums |
| S227 | MusicRadar, "6 ways to recreate the sound of 80s synth-pop" | https://www.musicradar.com/how-to/6-ways-to-recreate-the-sound-of-80s-synth-pop | octave bass; DX7 |
| S228 | MusicRadar, "How to make an 80s-style synth track in your DAW" | https://www.musicradar.com/how-to/how-to-make-an-80s-style-synth-track-in-your-daw | flat 16th bass; 4-note arp; I–V–bVII–IV; pedal-note lead; 7th/9th pads |
| S229 | Wikipedia, *Blue Monday (New Order song)* | https://en.wikipedia.org/wiki/Blue_Monday_(New_Order_song) | sequenced Moog Source; accidental rest |
| S230 | MusicRadar, "Use arpeggiators to create 80s-style synth melodies" | https://www.musicradar.com/how-to/use-arpeggiators-to-create-80s-style-synth-melodies | 1/8 more melodic; octave range |
| S231 | Baby Audio, "How to make synthwave" (snippet) | https://babyaud.io/blog/how-to-make-synthwave | arps in 16ths / 8th triplets |
| S232 | GForce, "Making synthpop with the Oberheim SEM" (snippet) | https://www.gforcesoftware.com/blog/making-synthpop-with-gforces-oberheim-sem/ | ARP 2600 sequencer (Depeche Mode) |
| S233 | songbpm, "Blue Monday" (snippet) | https://songbpm.com/@new-order/blue-monday | ~128–130 BPM |
| S234 | Tunebat, "Just Can't Get Enough" (snippet) | https://tunebat.com/Info/Just-Can-t-Get-Enough-Depeche-Mode/0qi4b1l0eT3jpzeNHeFXDT | 127–128 BPM |
| S235 | muzcafe, "Punk bass lines" (snippet, low authority) | https://muzcafe.net/punk-bass-lines-the-raw-rhythms-that-defined-1970s-aggression | no slap/syncopation/extended chords; 160–220 |
| S236 | bassroad, "Straight eighths rock with a pick" (snippet) | https://bassroad.net/straight-eighths-rock-with-a-pick/ | down-picked 8th roots |
| S237 | OtoTheory, "Pop I–V–vi–IV axis" (snippet) | https://www.ototheory.com/progressions/pop-i-v-vi-iv-axis | pop punk 140–170 |
| S238 | bpmcalc, "Disco BPM" (snippet) | https://bpmcalc.com/genres/disco/ | disco 115–125; Eurodisco 120–130; Italo 118–122 |
| S239 | Attack Magazine search result for "dub techno chords" (snippet; exact URL not confirmed) | https://www.attackmagazine.com/ | m7 "great starting point"; off-beat 16th rhythms |
| S241 | Wikipedia, *Bernie Worrell* | https://en.wikipedia.org/wiki/Bernie_Worrell | Minimoog bass on "Flash Light" |
| S242 | Jump-up tempo 174–178 (snippet; source unclear, likely note.com/soundwitches or dropzonebcn) | – | jump-up tempo |
| S243 | beatkey.app, "How to make liquid DnB" (snippet) | https://beatkey.app/how-to-make-liquid-dnb-music | Rhodes 7th/9th hallmark |
| S244 | dogsonacid forum (snippet, forum) | https://www.dogsonacid.com/ | block chords, not spread |
| S245 | ghostsyndicate.audio (snippet; exact URL not confirmed) | https://ghostsyndicate.audio/ | space between chord changes |
| S246 | padwolf.app (snippet; exact URL not confirmed) | https://padwolf.app/ | MPC swing 54–58 % for hip-hop |
| S247 | Songen, "808 bass guide" (snippet) | https://songen.app/blog/808-bass-guide | 808 30–80 Hz, F1 |
| S250 | Roland, *JUPITER-8 PLUG-OUT owner's manual* | https://www.rolandcloud.com/getmedia/3d552dc5-46ca-415b-b121-a6c2474e28a4/JUPITER-8-Manual-E.pdf?ext=.pdf | arp modes UP/DOWN/U&D/RND; RANGE 1–4 |
| S251 | Roland, *Juno-60 technical specifications* (snippet; page 403) | https://support.roland.com/hc/en-us/articles/201955179-Juno-60-Technical-Specifications | Up/Up&Down/Down; range 1–3 |
| S252 | Temperley (2007), "The melodic-harmonic 'divorce' in rock", *Popular Music* 26(2) | https://davidtemperley.com/wp-content/uploads/2015/11/temperley-pm07.pdf | non-chord tones not resolving by step in pentatonic verses |
| S253 | Wikipedia, *Melodic motion* | https://en.wikipedia.org/wiki/Melodic_motion | undulating/descending melodies more common |
| S254 | Ableton, *Live 12 manual — MIDI effect reference (Arpeggiator)* | https://www.ableton.com/en/manual/live-midi-effect-reference/ | styles; gate % of rate, > 100 % legato; steps/distance |
| S255 | Apple, *Logic Pro — Arpeggiator note order* (snippet; JS page) | https://support.apple.com/guide/logicpro/note-order-parameters-overview-lgce129c3fbe/mac | Up&Down with repeated endpoints; outside-in; range 1–4 |
| S256 | Wikipedia, *Arpeggiator* | https://en.wikipedia.org/wiki/Arpeggiator | speed, range, mode |
| S257 | Hooktheory, "Popular chord progressions" | https://www.hooktheory.com/theorytab/popular-chord-progressions | ranked progressions with song counts |
| S259 | Hooktheory Trends (snippet) | https://www.hooktheory.com/trends | I–IV–vi → V 55 % |
| S260 | Empirical Musicology Review, McGill Billboard article (snippet) | https://emusicology.org/article/id/4539/ | 739 songs; five chord types 85.7 % |
| S261 | Wikipedia, *Voicing (music)* | https://en.wikipedia.org/wiki/Voicing_(music) | close/open; drop-2 |
| S262 | Wikipedia, *Voice leading* | https://en.wikipedia.org/wiki/Voice_leading | avoid leaps, keep common tones; block chords in pop |
| S263 | Wikipedia, *Comping (jazz)* | https://en.wikipedia.org/wiki/Comping_(jazz) | Charleston; chord on every beat |
| S264 | Wikipedia, *Tresillo (rhythm)* | https://en.wikipedia.org/wiki/Tresillo_(rhythm) | Charleston = first two tresillo strokes |
| S265 | Wikipedia, *Glossary of jazz and popular music* | https://en.wikipedia.org/wiki/Glossary_of_jazz_and_popular_music | pad definition; half-time |
| S266 | Wikipedia, *Harmonic rhythm* | https://en.wikipedia.org/wiki/Harmonic_rhythm | one change per measure; downbeat placement |
| S267 | Temperley (2014), "Probabilistic models of melodic interval", *Music Perception* 32(1) | https://davidtemperley.com/wp-content/uploads/2015/11/temperley-mp14.pdf | interval sizes; step inertia 43.1 % vs 18.3 %; steps descend, skips ascend |
| S268 | Vos & Troost (1989), "Ascending and descending melodic intervals" (snippet; JSTOR) | https://www.jstor.org/stable/40285439 | interval peak at 2 st |
| S269 | Pearce, review of Huron *Sweet Anticipation* | https://www.marcus-pearce.com/assets/papers/huron06-review.pdf | proximity; regression; post-skip reversal |
| S270 | Open Music Theory, "Embellishing tones" | https://openmusictheory.github.io/embellishingTones.html | accented vs unaccented non-chord tones |
| S271 | Wikipedia, *Nonchord tone* | https://en.wikipedia.org/wiki/Nonchord_tone | strong vs weak beat distinction |
| S300 | songbpm, "A Forest" (automatic estimate) | https://songbpm.com/@the-cure/a-forest | 163 (82 half-time) |
| S301 | songbpm, "Love Will Tear Us Apart" | https://songbpm.com/@joy-division/love-will-tear-us-apart | 163 |
| S302 | songbpm, "Transmission" | https://songbpm.com/@joy-division/transmission | 156 |
| S303 | songbpm, "Disorder" | https://songbpm.com/@joy-division/disorder | 175 (88) |
| S304 | songbpm, "Spellbound" | https://songbpm.com/@siouxsie-and-the-banshees/spellbound | 149 |
| S305 | songbpm, "Heart of Glass" | https://songbpm.com/@blondie/heart-of-glass | 115 |
| S306 | songbpm, "Once in a Lifetime" | https://songbpm.com/@talking-heads/once-in-a-lifetime | 117 |
| S307 | songbpm, "Just What I Needed" | https://songbpm.com/@the-cars/just-what-i-needed | 127 |
| S308 | songbpm, "Rio" | https://songbpm.com/@duran-duran/rio | 141 |
| S309 | songbpm, "Whip It" | https://songbpm.com/@devo/whip-it | 158 |
| S310 | Wikipedia, *Darkwave* | https://en.wikipedia.org/wiki/Darkwave | slower, lower, more minor than new wave |
| S311 | Wikipedia, *Post-punk* | https://en.wikipedia.org/wiki/Post-punk | melodic bass role; dropped three-chord/Chuck Berry |
| S312 | Wikipedia, *Gothic rock* | https://en.wikipedia.org/wiki/Gothic_rock | high melodic bass; minor chords; drones; tribal/dirge drums; synth soundscapes |
| S313 | Wikipedia, *Peter Hook* | https://en.wikipedia.org/wiki/Peter_Hook | melodies on high strings, chorus |
| S314 | Yahoo Entertainment, "Peter Hook invented an unheard approach…" | https://www.yahoo.com/entertainment/articles/peter-hook-invented-unheard-approach-080000741.html | high on D/G strings; repeating melodies; refuses root-following |
| S315 | ourpastimes (snippet) | https://ourpastimes.com/ | hands past the 9th fret |
| S316 | Wikipedia, *Joy Division* | https://en.wikipedia.org/wiki/Joy_Division | bass carried the melody; guitar left gaps |
| S317 | Wikipedia, *She's Lost Control* | https://en.wikipedia.org/wiki/She%27s_Lost_Control | bass high on the neck |
| S318 | Know Your Instrument, "Simon Gallup classic Cure bass" (blog) | https://www.knowyourinstrument.com/simon-gallup-classic-cure-bass/ | 8ths, octave jumps, chord-tone anchors |
| S319 | Wikipedia, *The Cure* | https://en.wikipedia.org/wiki/The_Cure | melodic bass; Solina strings |
| S320 | Wikipedia, *Primary (song)* | https://en.wikipedia.org/wiki/Primary_(song) | two basses, no guitars |
| S321 | Wikipedia, *Bauhaus (band)* | https://en.wikipedia.org/wiki/Bauhaus_(band) | dub bass; bossa-nova drums |
| S322 | Wikipedia, *Bela Lugosi's Dead* | https://en.wikipedia.org/wiki/Bela_Lugosi%27s_Dead | three-note bass; open-string drone chords |
| S323 | Wikipedia, *The Sisters of Mercy* | https://en.wikipedia.org/wiki/The_Sisters_of_Mercy | pulsating bass, drum machine |
| S324 | Wikipedia, *A Forest* | https://en.wikipedia.org/wiki/A_Forest | A minor; Am–C–F–Dm; flangers; no bends |
| S325 | Wikipedia, *Disintegration (The Cure album)* | https://en.wikipedia.org/wiki/Disintegration_(The_Cure_album) | droning progressions; lush keyboards; gloomy lead |
| S326 | Wikipedia, *Just Like Heaven* | https://en.wikipedia.org/wiki/Just_Like_Heaven_(The_Cure_song) | A major; descending riff hook |
| S327 | Wikipedia, *John McGeoch* | https://en.wikipedia.org/wiki/John_McGeoch | arpeggios, harmonics, flanger |
| S328 | Wikipedia, *Spellbound (Siouxsie and the Banshees song)* | https://en.wikipedia.org/wiki/Spellbound_(Siouxsie_and_the_Banshees_song) | "picky" guitar |
| S329 | Wikipedia, *Seventeen Seconds* | https://en.wikipedia.org/wiki/Seventeen_Seconds | single notes; spare melodies |
| S330 | Wikipedia, *Atmosphere (Joy Division song)* | https://en.wikipedia.org/wiki/Atmosphere_(Joy_Division_song) | Solina String Ensemble |
| S331 | Wikipedia, *Pornography (album)* | https://en.wikipedia.org/wiki/Pornography_(album) | minor-mode organ swells |
| S332 | Wikipedia, *Motorik* | https://en.wikipedia.org/wiki/Motorik | motorik 4/4 in post-punk |
| S333 | Wikipedia, *Siouxsie and the Banshees* | https://en.wikipedia.org/wiki/Siouxsie_and_the_Banshees | tom-based drums |
| S334 | Wikipedia, *Cold wave (music)* | https://en.wikipedia.org/wiki/Cold_wave_(music) | militant rhythm, minimalism |
| S335 | Wikipedia, *Psycho Killer* | https://en.wikipedia.org/wiki/Psycho_Killer | driving bassline |
| S336 | Wikipedia, *Just What I Needed* | https://en.wikipedia.org/wiki/Just_What_I_Needed | chugging 8ths; icy synth lines; keyboard riff |
| S337 | Wikipedia, *Cars (song)* | https://en.wikipedia.org/wiki/Cars_(song) | bass riff + Minimoog; Polymoog string lines |
| S338 | Wikipedia, *John Taylor (bass guitarist)* | https://en.wikipedia.org/wiki/John_Taylor_(bass_guitarist) | Chic / Bernard Edwards influence |
| S339 | Wikipedia, *Whip It (Devo song)* | https://en.wikipedia.org/wiki/Whip_It_(Devo_song) | E major; D–A–E7sus4 / C–G–D; 5-up 3-down riff; semitone synth motif; motorik |
| S340 | Wikipedia, *Remain in Light* | https://en.wikipedia.org/wiki/Remain_in_Light | one chord; counter-melodies over pedal points |
| S341 | Wikipedia, *Atomic (song)* | https://en.wikipedia.org/wiki/Atomic_(song) | E natural minor (uncited there); new wave/disco |
| S342 | Wikipedia, *Rio (Duran Duran song)* | https://en.wikipedia.org/wiki/Rio_(Duran_Duran_song) | Jupiter-4 random arp over Cmaj7 |
| S343 | Wikipedia, *Once in a Lifetime* | https://en.wikipedia.org/wiki/Once_in_a_Lifetime_(Talking_Heads_song) | bubbly arp; displaced downbeat |
| S344 | Wikipedia, *Heart of Glass (song)* | https://en.wikipedia.org/wiki/Heart_of_Glass_(song) | CR-78, SH-5, Minimoog |
| S350 | Wikipedia, *Synthwave* | https://en.wikipedia.org/wiki/Synthwave | 80–118 / 128–140; instrumental; repetitive patterns, chimes |
| S351 | EDMProd, "How to make synthwave" | https://www.edmprod.com/how-to-make-synthwave/ | 80–140; roots + variation; arps; leads with glide; gated reverb |
| S352 | Native Instruments, "Italo disco" | https://blog.native-instruments.com/italo-disco/ | 120 BPM; chords E–D–C–D at vel 70; lead register |
| S353 | Attack Magazine, "Make an Italo bassline with Chance Engine" | https://www.attackmagazine.com/technique/tutorials/make-an-italo-bassline-with-chance-engine/ | 115 BPM; 16ths; harmonic minor; root per bar; octave random; light swing |
| S354 | Studio Brootle, "EBM bassline tutorial (Ableton)" | https://www.studiobrootle.com/ebm-bassline-tutorial-ableton/ | 126 BPM; velocity variation; +12 doubling |
| S355 | Sound On Sound, "Classic tracks: Soft Cell 'Tainted Love'" | https://www.soundonsound.com/techniques/classic-tracks-soft-cell-tainted-love | orchestral swells, long horn |
| S356 | Wikipedia, *Sweet Dreams (Are Made of This) (song)* | https://en.wikipedia.org/wiki/Sweet_Dreams_(Are_Made_of_This)_(song) | SH-101 bass; OB-X strings |
| S357 | Wikipedia, *Enola Gay (song)* | https://en.wikipedia.org/wiki/Enola_Gay_(song) | same four chords ('50s progression); synth hook, no vocal chorus |
| S358 | Wikipedia, *Just Can't Get Enough* | https://en.wikipedia.org/wiki/Just_Can%27t_Get_Enough_(Depeche_Mode_song) | riff-driven |
| S359 | Sound On Sound, "Classic tracks: Human League 'Don't You Want Me'" | https://www.soundonsound.com/techniques/classic-tracks-human-league-dont-you-want-me | line half a beat out of time kept |
| S360 | discomagic.ru, "The secret of the signature bassline" (vendor blog) | https://discomagic.ru/en/blog/the-secret-of-the-signature-bassline | short staccato 16ths/8ths; 4–8-note loops; T-T-O-T; octave bounce; fast decay |
| S361 | Wikipedia, *Eurobeat* | https://en.wikipedia.org/wiki/Eurobeat | complex melodies; "sabi" riff |
| S362 | Wikipedia, *Deutsch Amerikanische Freundschaft* | https://en.wikipedia.org/wiki/Deutsch_Amerikanische_Freundschaft | single sequencer line as bass + melody; 16-step sequences; SQ-10; detuned notes |
| S363 | Wikipedia, *Electronic body music* | https://en.wikipedia.org/wiki/Electronic_body_music | sequenced repetitive basslines; minimal; 4/4 or backbeat; shouted vocals |
| S364 | Studio Brootle, "EBM techno bass in Ableton" | https://www.studiobrootle.com/ebm-techno-bass-in-ableton-with-free-rack/ | all 16ths on; short percussive notes |
| S365 | KVR forum, EBM bass thread (forum) | https://www.kvraudio.com/forum/viewtopic.php?t=512367 | 16ths between kicks; velocities for groove; (snippet) rarely rests |
| S366 | Futureproof Music School, "Dive into synthwave" | https://futureproofmusicschool.com/blog/dive-into-synthwave-create-your-own-sound-today | bass role/register; i–VI–III–VII; maj7/m9; 16th/8th arps; pad envelope; hat grid |
| S367 | Unison, "Synthwave chord progressions" | https://unison.audio/synthwave-chord-progressions/ | i–III–VI–VII, I–V–vi–IV, vi–IV–I–V |
| S368 | Orpheus Audio Academy, "Synthwave chords" | https://www.orpheusaudioacademy.com/synthwave-chords/ | I–VI–IV–V; fewer chords in verses; pedal tone |
| S369 | eMastered, "Synthwave chord progressions" | https://emastered.com/blog/synthwave-chord-progressions | minor keys; reverb; short lead reverb (numeral list garbled — not used) |

### Data sources (licence audit below)

| id | source | URL |
|---|---|---|
| S401 | ComMU (POZAlabs), `dataset/commu_meta.csv` + `commu_midi.tar`; README licence section | https://github.com/POZAlabs/ComMU-code |
| S402 | Chordonomicon v2 (Hugging Face `ailsntua/Chordonomicon`, `chordonomicon_v2.csv`, 264 MB); GitHub repo | https://huggingface.co/datasets/ailsntua/Chordonomicon , https://github.com/spyroskantarelis/chordonomicon |
| S403 | McGill Billboard 2.0 `salami_chords` annotations (`billboard-2.0-salami_chords.tar.xz`); licence text as quoted in the mirdata loader | https://www.dropbox.com/s/2lvny9ves8kns4o/billboard-2.0-salami_chords.tar.xz?dl=1 , https://github.com/mir-dataset-loaders/mirdata/blob/master/mirdata/datasets/billboard.py |
| S404 | AAM — Artificial Audio Multitracks (Zenodo 5794629) | https://zenodo.org/records/5794629 |
| S405 | ldrolez, *free-midi-chords* | https://github.com/ldrolez/free-midi-chords |
| S406 | POP909 dataset | https://github.com/music-x-lab/POP909-Dataset |
| S407 | BiMMuDa (Billboard Melodic Music Dataset) | https://github.com/madelinehamilton/BiMMuDa |
| S408 | Groove2Groove (Cífka et al.) | https://github.com/cifkao/groove2groove |

## Licence audit — melodic data (checked 2026-09-23)

Same rule as `../SOURCES.md`: only an explicit open licence granting redistribution **of the content**
qualifies; a permissive licence on a repository does not cover third-party songs it transcribes.

| collection | licence as found (verbatim) | content provenance | class |
|---|---|---|---|
| **ComMU** [S401] | README: "ComMU dataset is released under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0). It is provided primarily for research purposes and is prohibited to be used for commercial purposes." (Repo code: MIT per GitHub API.) | 11,144 samples "written and created by professional composers" for the dataset; role/genre/chord metadata | **REFERENCE ONLY** (NC + SA incompatible with shipping). Used for aggregate statistics D4 only. |
| **Chordonomicon** [S402] | Hugging Face card: `license: cc-by-nc-4.0`. (GitHub repo: Apache-2.0 per API — covers code.) | 666k+ crowd-sourced chord sheets of commercial songs (Ultimate Guitar-type), Spotify genre tags | **REFERENCE ONLY** (NC; third-party songs). Aggregates only (D5). |
| **McGill Billboard** [S403] | mirdata `LICENSE_INFO`: "This data is released under a Creative Commons 0 license, effectively dedicating it to the public domain." (DDMAL project page returned 404 — licence read from the loader that quotes it.) | Expert chord/structure annotations of 890 US chart songs 1958–91 | Licence **INGEST OK (CC0)** for the annotations. **(proposal)** still use only aggregates (D6) — a shipped per-song progression would carry a named commercial song's harmony; not needed. Re-verify the licence at the primary page before any ingest. |
| **AAM** [S404] | Zenodo metadata: `cc-by-4.0` ("3,000 artificial music audio tracks … generated by algorithmic composition … The midis used for generation are also available") | Algorithmic compositions; per-instrument MIDI (bass, chords, melody, drums); instruments are orchestral/world (violin, erhu, sitar, piano…); keys maj/min; no genre labels | **INGEST OK** (CC BY 4.0, attribution) — **new finding**. Low stylistic value for these genres (genre-less, 60–180 BPM, generic rules); inspected, not measured. Credit if used: *"Contains MIDI derived from AAM: Artificial Audio Multitracks Dataset (Ostermann et al.), CC BY 4.0, https://zenodo.org/records/5794629 — modified."* |
| **free-midi-chords** [S405] | README: "All the MIDI files are licensed under the MIT license, and you can them use in any musical project freely"; `LICENSE`: MIT, © 2019 Ludovic Drolez | Programmatically generated chord progressions (via chords2midi) in all 12 keys, grouped Major/Minor/Modal, plus pop/pop2/soul/hiphop2 rhythm variants | **INGEST OK** (MIT, keep the notice) — **new finding**. Block-chord progressions (not genre-idiomatic phrases); useful as a progression table for CHORD/PAD, not as ready phrases. Not measured. |
| **POP909** [S406] | Repo: MIT (GitHub API); README has no data-licence statement | Piano arrangements of 909 commercial Chinese pop songs | **REFERENCE ONLY** (MIT covers the repo, not third-party songs). Not measured. |
| **BiMMuDa** [S407] | No licence (GitHub API `license: null`) | Transcribed top-5 Billboard melodies 1950–2022 | **REFERENCE ONLY**. Not measured (would give pop-melody stats; D4 used instead). |
| **Groove2Groove** [S408] | Code BSD-3-Clause (GitHub API); the data README describes downloading a synthetic Band-in-a-Box-generated set — no data licence statement found | Accompaniment generated from Band-in-a-Box styles (proprietary style library) | **UNCLEAR → REFERENCE ONLY**. Not measured. |
| **Hooktheory TheoryTab** [S216][S222]–[S224][S257] | Proprietary site | Crowd transcriptions of commercial songs | **REFERENCE ONLY** (read for per-song tempo/range/chord-tone figures). |
| Lakh / GMD / others | see `../SOURCES.md` | | unchanged |

**Bottom line (melodic).** Two genuinely open melodic sources exist — **AAM (CC BY 4.0)** and
**free-midi-chords (MIT)** — but neither is genre-idiomatic: AAM is genre-less algorithmic music and
free-midi-chords is block-chord progressions. The Billboard annotations are CC0 but describe commercial
songs. No open, genre-labelled bass/chord/arp/lead/pad **phrase** corpus was found for any of the 17
genres, so the melodic library should be **generated from these rules**, with D4/D5/D6 as statistical
targets and free-midi-chords optionally as an attributed progression source.
