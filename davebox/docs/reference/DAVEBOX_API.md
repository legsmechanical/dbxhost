# dAVEBOx API Reference

DSP parameter keys, C structs, recording architecture, and algorithm details.
Read this when writing DSP calls or modifying DSP/pfx code.

## Parameter Bank Reference

Banks via **Shift + top-row pad** (92–99). Same bank again → TRACK (0).

| Bank | Pad | K1 | K2 | K3 | K4 | K5 | K6 | K7 | K8 |
|------|-----|----|----|----|----|----|----|----|----|
| 0 TRACK | 92 | Ch (stub) | Rte | Mode | — | — | — | — | Lpr |
| 1 CLIP (melodic) | 93 | Stch (sens=16, lock) | Shft (sens=8) | Ndg (sens=8) | Res (sens=16) | Len (sens=4) | — | — | SqFl |
| 1 DRUM SEQ (drum) | 93 | Stch (sens=16, lock) | Shft (sens=8) | Ndg (sens=8) | Res (sens=16) | Len (sens=4) | Qnt (0–100) | LnN | SqFl |
| 2 NOTE FX | 94 | Oct (sens=6) | Ofs (sens=4) | Gate (sens=2) | Vel | Qnt (0–100) | — | — | — |
| 3 HARMZ | 95 | Unis (sens=4) | Oct (sens=4) | Hrm1 (sens=4) | Hrm2 (sens=4) | — | — | — | — |
| 4 MIDI DLY | 96 | Dly | Lvl | Rep (max=16) | Vfb | Pfb | Gfb | Clk | Rnd |
| 5 SEQ ARP | 97 | Styl (0=Off..9=RnO) | Rate | Oct (-4..+4 skip 0) | Gate | Stps | Rtrg | — | — |
| 6 TRACK ARP | 98 | On (0/1) | Styl (1..9) | Rate (0..9) | Oct (-4..+4 skip 0) | Gate (1..200%) | Stps (0..2) | — | Ltch (0/1) |

## DSP Parameter Keys

All `tN_` keys: N = 0..7. All writes save state unless noted.

| Key | Dir | Format | Notes |
|-----|-----|--------|-------|
| `tN_beat_stretch` | set | `"1"` or `"-1"` | Expand/compress the active clip's loop window; refused when `2*length > 256`, and (both ways) while `loop_start != 0` — see *Loop at step 1*. |
| `tN_beat_stretch_factor` | get | `"1x"`, `"x2"`, `"/2"`, … | |
| `tN_beat_stretch_blocked` | get | `"0"` or `"1"` | 1 if last compress blocked. |
| `tN_clock_shift` | set | `"1"` or `"-1"` | Rotate the steps of the loop window right/left; steps outside it are untouched. Refused while `loop_start != 0`. |
| `tN_nudge` | set | `"1"`, `"-1"`, `"0"` | ±1 tick on every note in the loop window (refused while `loop_start != 0`); `"0"` resets the `nudge_pos` counter (always runs). |
| `tN_lgto_apply` | set | any | Legato on the active clip; undoable. Refused while `loop_start != 0`. |
| `tN_clip_resolution_zoom` | set | `"0"`–`"5"` | Resolution keeping every note's time (the length rescales). Refused while `loop_start != 0`. |
| `tN_crop` | set | any | **Crop**: the active clip's loop window becomes the whole clip — its steps move to step 0, everything outside `[loop_start, loop_start+length)` is removed (steps, notes, trig conditions), `loop_start` = 0, the length stays. Linked automation that follows the clip moves with the notes (points outside the window are removed); lanes on their own Loop/Rate and unlinked lanes are untouched. One undo unit. Nothing to crop (loop at 0, nothing past the end) = no-op, no undo snapshot. |
| `tN_lanes_off_grid` | get | integer string | Drum track: how many lanes of the active clip have `loop_start != 0` (ALL LANES transforms are refused while > 0). `"0"` on a melodic track. |
| `tN_clock_shift_pos` | get | integer string | |
| `tN_clip_length` | set/get | `"1"`..`"256"` | Active clip length. |
| `tN_clip_resolution` | set | `"0"`–`"5"` | tps index into TPS_VALUES. Proportional rescale. No-op while recording. |
| `tN_cC_tps` | get | integer string | ticks_per_step for clip C. |
| `tN_stop_at_end` | set | any | Arm page-stop. |
| `tN_deactivate` | set | any | Clear clip_playing, will_relaunch, queued_clip, pending_page_stop, record_armed. |
| `tN_cC_step_S_notes` | get | space-sep MIDI notes or `""` | |
| `tN_cC_step_S_toggle` | set | `"note [vel]"` | Toggle note; sets step_vel on first note. |
| `tN_cC_step_S_clear` | set | any | Atomic zero + deactivate; resets vel/gate/nudge. |
| `tN_cC_step_S_add` | set | `"pitch [offset [vel]]"` | Add-only overdub. Defers save while recording. |
| `tN_cC_step_S_vel` | set/get | `"0"`–`"127"` | No-op if step empty. |
| `tN_cC_step_S_gate` | set/get | `"1"`–`"6144"` | No-op if step empty. |
| `tN_cC_step_S_nudge` | set/get | `"-23"`–`"23"` | Moves all notes as unit. No-op if step empty. |
| `tN_cC_step_S_reassign` | set | dest step index | Move/merge. Empty=move; occupied=merge (dst pitch wins; active src activates inactive dst). Clears src. |
| `tN_cC_step_S_copy_to` | set | dest step index | Copy notes/vel/gate/offsets to dest; overwrites. |
| `tN_cC_step_S_pitch` | set | signed delta | Shift all notes N semitones. No-op if step empty. |
| `tN_cC_step_S_set_notes` | set | space-sep MIDI notes | Replace all notes. No-op if step empty. |
| `tN_cC_clear` | set | any | Atomic wipe all steps + deactivate. |
| `tN_cC_clear_keep` | set | any | Wipe all steps; preserves clip_playing/will_relaunch. Silences in-flight notes. |
| `tN_cC_hard_reset` | set | any | `clip_init` (length=16, tps=24, all cleared). Undo snapshot, silence, pfx_sync. |
| `tN_cC_import` | set | `"<flags> <res_idx> <len>\|a tick pitch vel gate;…"` | Import MIDI: one undo unit. Sets clip C's tps (`TPS_VALUES[res_idx]`), length (1–256) and loop start 0; flags bit0 = replace (wipe notes first). Clears a melodic clip's aftertouch automation (the UI sends `tN_pa_clear C` straight after for parameter automation; both inside the undo unit). Notes via `clip_note_apply_op` (512 cap, ticks clamped). Drum track: each note lands on the lane of clip C whose `midi_note` matches, any clip (not only the active one); unmatched dropped. Refused while recording. Clears the capture buffer. |
| `tN_lL_import` | set | `"<flags> <res_idx> <len>\|a tick vel gate;…"` | One drum lane of the active clip (no UI caller since the MIDI browser loads several lanes at once; kept), one undo unit (whole drum clip). Sets that lane's tps/length only; hits take the lane's `midi_note`; flags bit0 = replace. Ends any preview on the track first (undo holds the original). In phase with the master clock while playing. Refused while recording. |
| `tN_lanes_import` | set | `"<flags> <res_idx> <len>\|L7;a tick vel gate;…;L9;a …"` | The MIDI browser's drum load: several drum lanes of the active clip as ONE undo unit; only the named lanes change (each gets the grid/length given); flags bit0 = replace each named lane. Otherwise as `tN_lL_import`. Drum tracks only. |
| `tN_audclip` | set | `"<res_idx> <len> <lane>\|…"` or `"off"` | The MIDI browser's in-time preview, swapped in on the next beat (at once while stopped). lane `-1`: the track's current clip, `a tick pitch vel gate;…`; lane `L`: one drum lane, `a tick vel gate;…`; lane `-2`: several drum lanes (≤ 8), `L7;a …;L9;a …`. A re-staging's dropped lanes are restored on the same beat; `off` restores all. Never saved (a save writes the originals), never undone, refused while recording; a project load drops it. |
| `tN_cC_lane_notes` | get | 32 space-sep ints | Drum: the pitch each lane of clip C plays (any clip; `tN_lL_lane_note` sees only the active one). |
| `tN_audition` | set | `"[clip C] on p v … off p … alloff"` | Import MIDI's preview: sounds through the track's play effects and route like a pad, but never reaches Retrospective Capture or the TRACK ARP, is silent while armed/recording, and `alloff` releases only pitches this key started. Drum: the lane for the pitch in clip C (default the active clip), else nothing; a release goes to the lane its start used. |
| `tN_recording` | set/get | `"0"` or `"1"` | 1=overdub (defers save); 0=disarm+flush. |
| `tN_pfx_reset` | set | any | Atomically reset NOTE FX + HARMZ + MIDI DLY. |
| `tN_pfx_snapshot` | get | 31 space-sep ints | [0-16]=NOTE FX K0-K4 / HARMZ K0-K3 / MIDI DLY K0-K7; [17-22]=SEQ ARP style/rate/oct/gate/steps/retrigger; [23-30]=step_vel[0..7]. |
| `tN_seq_arp_style` | set | 0–9 | Off/Up/Down/UpDown/DownUp/Converge/Diverge/PlayOrder/Random/RandOther. Off silences + clears held. |
| `tN_seq_arp_rate` | set | 0–9 | 1/32..1-bar. |
| `tN_seq_arp_octaves` | set | -4..-1, +1..+4 | 0 skipped; positive=ascend, negative=descend. |
| `tN_seq_arp_gate` | set | 1..200% | |
| `tN_seq_arp_steps_mode` | set | 0/1/2 | Off/Mute/Skip. |
| `tN_seq_arp_retrigger` | set | 0/1 | Default 1. |
| `tN_tarp_on` | set/get | 0/1 | Enable/disable TRACK ARP for track N. Turning off calls tarp_silence. |
| `tN_tarp_style` | set/get | 1–9 | Pattern: Up/Dn/U-D/D-U/Cnv/Div/Ord/Rnd/RnO. Never 0 (On/Off handled by tarp_on). |
| `tN_tarp_rate` | set/get | 0–9 | 1/32..1-bar (same table as SEQ ARP). |
| `tN_tarp_octaves` | set/get | -4..-1, +1..+4 (Audio: -15..+15) | 0 skipped. On an Audio track it is Step: each repeat moves one slice (`oct_step` 1), not an octave. |
| `tN_tarp_gate` | set/get | 1–200 | Gate percent. |
| `tN_tarp_steps_mode` | set/get | 0/1/2 | Off/Mute/Skip. |
| `tN_tarp_latch` | set/get | 0/1 | Latch. Turning off calls tarp_silence. |
| `tN_tarp_step_vel` | set | `"S L"` | Set step S (0..7) to level L (0..4). |
| `tN_tarp_sv` | get | 8 space-sep ints | step_vel[0..7] for batch read. |

**Scene resample** (`seq8_resample.c`; the host's module take, `move_host_ext_v1_t.capture_start`): `resample_scene "C bars warmup tail |path"` (set; from a STOPPED transport only — launches row C, starts the transport with no count-in, arms the take one render after the first tick plays, records `bars` (+ `tail`) bars to the absolute `path`; with `warmup` 1 the take starts one pass in; every clip stops at the end of the pass; the metronome is silent while pending/recording; a transport stop cancels) · `resample_clip "T C bars warmup tail src |path"` (set; track T's clip C ALONE — no other track plays; `src` 0 Wet = the mix, 1 Dry = the resolved destination's chain slot via `capture_start_src`; refused for a track with no instrument / external MIDI, Dry off a chain, a muted or soloed-out track) · `resample_bars_tT_cC` (get; that clip's length in whole bars, lined up with the bar; a drum clip's lanes' LCM; 0 = no notes) · after any take, the next transport stop puts back each track's clip and armed state from before it; a project load cancels a take · `resample_clear` (set; terminal state → idle) · `resample_err` (get; 1 playing, 2 following Move's clock, 3 no host take, 4 another merge/print/count-in/take, 5 bad args, 6 the sampler refused, 7 no instrument / Dry off a chain, 8 muted) · `resample_bars_C` (get; row C's natural length in bars — where every non-empty clip lines up, past 32 bars the longest clip rounded up, 0 = empty). State, frames captured and take frames are `state_snapshot` fields 65–67 (state: 0 idle, 1 armed, 2 starting, 3 recording, 4 done, 5 cancelled, 6 failed).

**Audio** (`seq8_audio.c`, `setparam/sp_track_audio.c`; the host's `slot_audio_feed`): `pad_mode` 3 (`PAD_MODE_AUDIO`), reached by `tN_convert_to_audio` (clears every clip's notes, pfx, automation, TARP; the clips become fresh Audio clips) and left by `tN_convert_to_melodic` / `_to_drum` / `_to_conduct` (clears every clip's notes, lets the samples go). Melodic clips whose notes are slices: pitch `AU_NOTE_BASE` (0) + slice, up to `AU_MAX_SLICES` 128 (the UI maps external note 36 to slice 0); they leave at `pfx_emit` for the sample engine, never as MIDI, and no pitch transform reaches them (`pad_mode_pitched()`). A played slice ignores velocity; a DELAY echo (`PFX_EV_ECHO`) is dropped (DELAY left Audio tracks). A slice starts on its tick's frame within the block (`au_tick_off`, from `seq8_tick_frame`), and the voice it cuts fades from that frame (`rel_wait`); a ONE slice that starts within `AU_JOIN` frames of where the sounding ONE voice of the same sample, rate, direction and level has reached (no attack or decay) carries that voice on — no cut, no fade — so chops in order play the sample straight through. A step holds one slice (`_step_S_toggle` replaces; recording takes the step); a Loop clip records nothing. Set: `tN_au_pick "C|<abs path>"` (copied into `<state dir>/samples/` by the loader thread — same name and size reused, else `~2` — then loaded; a Loop pick sets the clip to the sample's length in whole bars) · `tN_au_clear "C"` · `tN_au_set_<field> "C v"` (mode 0 Loop / 1 Slice — Slice on a clip with no steps lays the chops on them in order, as `tN_au_chop`; even 0 Off / 2–32 — an override over the hand set, which stays; a new clip has 16; start / end in sample frames (end 0 = the sample's end), pitch ±24, detune ±50 cents, gain −40..+12, bars, revrs 0/1, nudge ±500 ms, tempo 0 Free / 1 Sync (`au_sync_block`: a Loop clip's slices in order on the clock, each on its frame; pins as a Slice clip's); `jump` / `jmpq` are retired: no key sets them, they are only kept in the file) · `tN_au_slice_<field> "C L v"` (start / end frames of a HAND-SET slice, refused while Even is on — end 0 = HOME, the next slice's start; pitch, detune, gain, rev, play 0 One / 1 Gate / 2 Loop, atk, dec ms — the sound fields belong to the slice NUMBER, shared with Even) · `tN_au_all_<field> "C v"` (one sound field on every slice) · `tN_au_mark_add "C F"` (splits the hand-set slice at frame F; later slices and their steps move up one) · `tN_au_mark_del "C L"` (L ≥ 1 merges into L−1; steps follow) · `tN_au_manual "C"` (hand set = one slice, Start..End; Even Off) · `tN_au_layout "0|1"` (PAD MODE Layout, 4 Rows / 16 Pads; get the same key; saved `t%d_aul`) · `tN_au_chop "C"` (one step per slice at k, each on the step its start rounds to; one undo) · `tN_au_wipe "C"` · `tN_au_lazy "C 1|0"` (1 arms — the hand set is put aside, nothing plays; 0 = Back: ends a running chop, or restores an armed one), `tN_au_lazy_tap` (the first plays Start..End with slice 1 at Start; each later one marks the playhead), `tN_au_lazy_keep "1|0"` (after it ended: keep, or the old hand set back). `clip_copy` / `clip_cut` / `row_copy` / `row_cut` carry a clip's sample and settings and refuse an Audio ↔ non-Audio paste; `_clear` / `_hard_reset` drop the sample. Get: `tN_au_on` (the track is Audio), `tN_au_info_C` ("state err mode even hand jump rstart rend pitch gain frames rate ch revrs nudge jmpq n detune tempo reach|name"; frames, rend the real end; n = the slices that play; reach = how far into Start..End a Free Loop gets before its clip wraps, at the tempo, pitch and Nudge (End − Start when all of it plays); state 0 none, 1 loading, 2 ready, 3 failed; err 1 open, 2 format, 3 too long, 4 memory, 5 copy), `tN_au_sl_C_L` ("a b pinned pitch gain rev play atk dec detune"), `tN_au_all_C` ("pitch gain rev atk dec play detune", `x` where slices differ), `tN_au_marks_C` ("a b" frame pairs as they play), `tN_au_peaks_C` (128 × min/max hex), `tN_au_wave_C_A_B` (frames A..B as 128 columns, from a per-256-frame summary), `tN_au_pos` ("on frame slice"), `tN_au_lazy` ("state n frame"; 1 armed, 2 running, 3 ended), `tN_au_dir` (the samples folder), `au_used` (every name a clip holds), `tN_au_stream` (any N: "samples chunks reads underruns" — streamed samples held, chunks in memory, chunks read ever, frames a voice found no chunk for). Saved sparse: `t%dc%d_au2` "mode even hand jump rstart rend pitch gain revrs nudge jmpq detune tempo|name" (frames), `t%dc%ds%d_au2` "start end pitch gain rev play atk dec detune" (detune last: an older file reads 0 cents); an older `t%dc%d_au` (permille Start / End) is read once, its Start / End applied when the sample loads; the track is Audio by `t%d_pm` 3. WAV and AIFF/AIFC, 8/16/24/32-bit and float; Slice ≤ 4 min, Loop ≤ 30 min. **Streaming**: a file over 60 s (`au_stream_sec`), in either mode, keeps its waveform summary and pinned chunks only (`AU_CHUNK` 8192 frames; a Loop clip pins 2 chunks either side of each of the 33 points k/32 of Start..End (where a Remix grid will land), plus ½ s at the start and end for Nudge; a Slice clip — or a Loop clip on Tempo Sync — pins 2 chunks from each slice's start and 2 to its end for the first 32 slices, 1 each past them, and Start); a streamer thread (`au_stream_service`) reads 1.5 s ahead of each voice from `au_watch` (its last slot is spare), and pins from `au_clipw` (range, mode, slices), both published by `au_render` every block; a chunk is let go after 250 unwanted passes and freed two blocks later (`au_block`). A missing chunk plays silence (fades out/in over 64 frames) while the voice keeps time.

**Perf Mode**: `perf_mods` (set, uint32 bitmask 24 bits; JS ORs toggled+held+recalled, sends on every change; see `PERF_MOD_*` in seq8.c and `PERF_MOD_PAD_MAP` in ui.js). `looper_retrigger "ticks"` (atomic stop+arm at new rate).

**Other keys**: `clip_copy "srcT srcC dstT dstC"` · `clip_cut "srcT srcC dstT dstC"` (copy+hard-reset src, `undo_begin_clip_pair`) · `row_copy "srcRow dstRow"` · `row_cut "srcRow dstRow"` (`undo_begin_row_pair`) · `tN_active_clip` · `tN_current_step` · `tN_current_clip_tick` (get: `current_step*TPS+tick_in_step`) · `tN_queued_clip` · `tN_cC_steps` (get: 256-char '0'/'1'/'2') · `tN_cC_length` · `tN_cC_step_S` (set '0'/'1'=deactivate/activate) · `tN_launch_clip` · `launch_scene` · `transport` ("play"/"stop"/"panic"/"deactivate_all") · `playing` · `state_snapshot` · `tN_route` · `tN_pad_mode` · `tN_pad_octave` · `key` · `scale` · `scale_aware` · `bpm` · `launch_quant` · `input_vel` · `inp_quant` · `midi_in_channel` (0=All, 1–16).

**The groove** (one for the project; `groove_t` in `seq8.c`): `groove_kind` (0 Off, 1 Swing 1/16, 2 Swing 1/8, 3 the loaded table — accepted only once a table is loaded) · `groove_amt` 0–100 · `groove_timing` / `groove_quantize` / `groove_random` / `groove_velocity` 0–100 (a table's own amounts; Quantize is stored and not applied) · get-only `groove_name`, `groove_table` (`"base n o0 v0 o1 v1 …"`: slot length in ticks, slot count, then per slot an offset in 1/16 ticks, + late / − early, and a velocity, 0 = none). A table is sent in pieces, each under its own key: `groove_begin "base n timing quantize random velocity name"` → `groove_slots_<i> "o v o v …"` (from slot i; eight a piece keeps a write far under 256 bytes) → `groove_commit "1"` (the choice) or `"a"` (a TRIAL: the groove before it is kept) → `groove_keep` (the trial is the choice) / `groove_revert` (the groove before the trial comes back). `swing_amt` / `swing_res` remain as a second view of kinds 1 and 2. Per track: `tN_groove_amt` / `tN_groove_timing` / `tN_groove_velocity` / `tN_groove_random` — the track's own value for that amount, −1 = follow the global one (default), 0–100 = its own (amount 0 plays straight); get `tN_groove_ovr` returns all four as `"a t v r"`. `tN_groove_on` remains as a switch over the amount (0 → amount 0, 1 → follow). In the engine each track plays through `tgroove[t]`, the global groove with its amounts written in, and `grt[t]` holds what follows from it.

## `tN_digest` — the whole track's readback in one request

**Read this before adding a get_param to a project-load path.**

A param request is a single-slot mailbox served once per SPI frame, so **every
`get_param` costs a full audio frame (~2.9 ms measured)** no matter how trivial it is. The cost of
a readback is the NUMBER of requests, not the work behind them. Re-reading a project after a load
once took ~1,468 of them: a **4.3 s tick** with the UI frozen and input dead.

`tN_digest` returns a whole track's readback as one value — one line per field:

```
t3_active_clip=1
t3_pad_octave=3
t3_c0_steps=0100100000...
t3_c0_length=16
...
```

The key in each line is the **full key**, so a caller looks up exactly the string it would
otherwise have asked for. The JS side resolves through `dspGet()` in `ui/ui_dsp_get.mjs`, which
reads from a prefetched map and **falls back to a live `host_module_get_param` for anything the
digest does not carry**.

Three properties worth preserving if you touch it:

- **It calls the existing getters** (`get_param` recursively), it does not re-derive values. A
  digest with its own copy of the logic is a second source of truth, and the drift shows up as a
  project that loads *subtly wrong* — the worst failure available to a batching optimisation,
  because nothing looks broken.
- **The fallback is what makes the key list safe to maintain separately.** If this list and the
  UI's readers drift, the missing key costs one frame, never a wrong value. Adding a reader without
  adding its key is a slowdown, not a bug.
- **The prefetched map is scoped to the sync** (`try/finally` in `syncClipsFromDsp`). Left
  standing, it would answer for a project that is no longer loaded.

RT note: the digest is serialised **inside the SPI callback**, so it uses stack buffers only,
bounds-checks every append, and truncates at a line boundary. Adding many keys adds work to that
frame — check `param.serve` against the 900 µs budget (`touch otlp_trace_on`) if you grow it much.

Pinned by `tests/test_track_digest.c` (every line byte-identical to the individual read) and
`tests/js/test_track_digest_sync.mjs` (the round trips actually collapse, the mirrors land, the map
is released).

## Per-parameter automation keys (`tN_pa_*`)

Front 3's automation store — `dsp/seq8_param_auto.{h,c}`, handler
`dsp/setparam/sp_track_paramauto.c`. An entry is a **(track, clip, target)** triple; there are no
lanes and no fixed knob count.

**The target** is an opaque string owned by JS: `"<slot>:<comp>:<key>"` for a chain parameter,
`"bus:<n>:<field>"` for a bus level, `"cc:<n>"` / `"at"` for the MIDI Out device. The DSP
interprets only the `cc:`/`at` forms — the ones it can emit itself.
⚠ **Charset is enforced**: `A-Z a-z 0-9 : _ . -` only, and under `PA_TARGET_LEN` (40). A target
carrying `"` or `}` would truncate its JSON object in the state file and take the parse of *every*
entry with it, so it is refused at the door rather than escaped later. A **space ends the target**
(the key format is space-separated), it does not invalidate it.

**Values are 14-bit normalized** (0..16383). JS owns the mapping to and from a parameter's real
wire units — only JS has the `chain_params` metadata that defines them.

**The envelope model (pav:2).** A lane is one envelope of points that glide linearly into each
other; a hard edge is a **jump pair** — two points on one tick, the first the value just before it,
the second the value from it on (at most two per tick). A *stepped* target (a choice, or a whole
number with two values) never glides. Every lane gets a **start point** at its window start with its
first point, carrying the parameter's **resting value** (`pa_knob`, per target: where the parameter
sits on Stop and in clips without a lane). Wrap: Carry glides from the last point into the start
across the loop end; Reset holds the last value, then jumps. Editing is per whole step: a step owns
the single point or the second of a pair on its first tick, everything inside it, and the first of
a pair on the tick after it.

| set key | value | meaning |
|---|---|---|
| `tN_pa_set` | `"<clip> <target> <tick> <val>"` | write one point (step record, pad aftertouch); a lane's first point brings its start point |
| `tN_pa_hold_write` | `"<clip> <target> <fromStep> <toStep> <tps> <val\|-1> <type> <rebase>"` | every write a held step makes. `type` 1 PUNCH: `<val>` flat across the steps, a jump pair in from the envelope and one back out to it; 0 POINT: one point (a second on the span's last tick over several steps). `<toStep>` below `<fromStep>` wraps round the lane's window. `-1` = the value the held step plays. Computed from the hold's BASE (the lane before its first write; `rebase` 0 takes it, 1 builds on it), so turns, type flips and stretch presses are one op. Refused whole when it would not fit |
| `tN_pa_rest` | `"<clip> <target> <val>"` | seeds the parameter's resting value (the knob before a gesture first automated it); ignored once one exists |
| `tN_pa_rest_move` | `"<clip> <target> <val>"` | the knob turned by hand: moves the resting value, unless the track's playing clip automates the parameter. `tN_pa_live` does the same while playing and not recording |
| `tN_pa_clear_key` | `"<clip> <target>"` | Delete + knob: all of one parameter's automation in the clip |
| `tN_pa_add` | `"<clip> <target>"` | The AUTOMATION list's + Add lane: an EMPTY lane (`PA_FLAG_KEEP`, on), listed and saved before anything is written. A lane already there is left as it is; a target another track owns is refused (`pa_owner_conflict`); a drum lane takes the active pad's cycle |
| `tN_pa_clear_step` | `"<clip> <from> <to>"` | Delete + step: every parameter's points that step owns; a lone edge left on the envelope's line is swept away |
| `tN_pa_clear` | `"<clip>"` | the whole clip's automation |
| `tN_pa_active` | `"<clip> <target> <0\|1>"` | Mute + knob: deactivate **without** deleting |
| `tN_pa_wrap` | `"<clip> <target> <0\|1>"` | Wrap: 0 Carry, 1 Reset (a new lane's default) |
| `tN_pa_loop` | `"<clip> <target> <len> <off> <res>"` | per-parameter loop window + resolution. **Inert in v1** — nothing writes it; it exists so restoring polymetric automation later is UI work, not a storage change |
| `tN_pa_live` | `"<target> <val>"` | a knob under a hand moved to `<val>` (the track's ACTIVE clip). **The DSP decides what that means** from its own flags: Record on + transport running = written along the playhead one cell (half a step) at a time, overwriting, until release (the envelope glides between the cells); otherwise an **override** — playback leaves the target alone. Either way playback never pushes a live target (touch wins) |
| `tN_pa_hold` | `"<target>"` | a hand is dialling a LOCK on this target: playback leaves it alone until `pa_live_end`, and nothing is recorded whatever Record says |
| `tN_pa_live_end` | `"<target>"` | the hand is off: the target returns to playback, which **re-asserts** its value (override-resume) |

**Ownership.** One target, one track: the first track to automate a target owns it until its
automation is gone from every clip. `pa_set`/`pa_hold_write`/`pa_live` from another track are
**refused** and reported through `pa_owner_conflict`. (The UI cannot ask first — a knob edit
runs in the MIDI handler, where `get_param` is banned — so the refusal IS the check, and the
popup follows on the next poll.)

| get key | returns |
|---|---|
| `pa_list` | one line per entry: `"<track> <clip> <flags> <count> <target>"` — the whole project in ONE read, because a per-entry read costs an SPI frame each |
| `pa_dirty` | automation changed since the last save |
| `pa_store_full` | a write (or a load) was refused for want of room; **reading clears it** |
| `pa_owner <target>` | the track that owns `<target>` (has automation on it in any clip), or `-1` |
| `pa_owner_conflict` | a write was refused because another track owns the target: that track + 1, or 0; **reading clears it** |

Flags: `1` active, `4` Link: Off, `8` Wrap: Reset, `32` cleared and kept. `2` and `16` (Smooth, Mode: Punch) are pav:1 only — reserved, read by the conversion.

⚠⚠ **The handler consumes every `pa_` sub-op, known or not.** `sp_track_misc` is dispatched after
it and ends in an unconditional `pfx_set` + remote-UI rev bump, so falling through would not ignore
an unknown key.

**Persistence** is the `"pa"` section of the project's one state file (`"pav"` its version, now 2),
sparse — absent when a project has no automation, which is why this needed no state version bump —
and beside it `"pk":[{"k":target,"v":val},…]`, the resting values. A **pav:1** section (Smooth / Punch
flags, a resting value per lane in `"r"`) is converted on load to sound the same (`pa_migrate_v1`)
and saves as pav:2; the active clip's lane's `"r"` becomes the parameter's resting value. ⚠ A build
from before pav:2 skips the section, so such a project opens there without automation.
Automation travels with its clip through `clip_copy`/`clip_cut`/`row_copy`/`row_cut` and is covered
by undo. ⚠ A clip with more than `PA_UNDO_ENTRIES` (16) automated parameters cannot be captured in
an undo slot; automation is then restored for **no** clip in that operation rather than some.

**Limits** (all reported through `pa_store_full`, never silent): `PA_MAX_ENTRIES` 160 automated
(track, clip, target) triples · `PA_ENTRY_POINTS` 512 points per entry · `PA_MAX_TARGETS` 64
distinct parameters project-wide.

## Drum Lane Keys

All operate on active clip's lane L of track N.

`tN_lL_lane_note` (get/set midi_note) · `tN_lL_clip_length` (set) · `tN_lL_crop` (Crop this lane — see `tN_crop`; touches no automation; one drum-clip undo unit) · `tN_lL_steps` (get: 256-char '0'/'1'/'2'; **active-clip-implicit** — defer JS read 2 ticks after clip switch; step-centric, reads `steps[s]`/`step_note_count[s]` directly) · `tN_lL_note_count` · `tN_lL_length` · `tN_lL_current_step` · `tN_lL_step_S_toggle "vel"` · `tN_lL_step_S_clear` · `tN_lL_step_S_vel` · `tN_lL_step_S_gate` · `tN_lL_step_S_nudge` · `tN_lL_step_S_reassign` (move/merge to dest step) · `tN_lL_copy_to "dstLane"` (copy all step data; preserves dst midi_note; undo snapshots full drum clip) · `tN_lL_cut_to "dstLane"` (copy_to + `clip_init` src + silence src; preserves both midi_notes; undo snapshots full clip) · `tN_lL_mute "0|1"` · `tN_lL_solo "0|1"` · `tN_drum_mute_all_clear` · `tN_drum_lane_mute` (get: uint32 bitmask) · `tN_drum_lane_solo` (get: uint32 bitmask) · `tN_cC_drum_has_content` (get: '1' if any lane has notes) · `tN_drum_active_lanes` (get: bitmask, bit L set if lane has hit at current step) · `tN_drum_lanes_qnt "0–100"` (set quantize on all 32 lanes atomically).

**ALL LANES** (`tN_all_lanes_*`): `tN_all_lanes_crop` crops every lane in its own window (one undo unit; automation lanes without their own cycle move with the drum window — the longest lane's — read before the crop; cycled lanes are untouched). `tN_all_lanes_clock_shift`, `tN_all_lanes_nudge` (±1) and `tN_all_lanes_beat_stretch` are refused on EVERY lane while any lane's `loop_start != 0` (`all_lanes_stretch_result` is left alone); `tN_all_lanes_nudge "0"` still resets the counters.

**Loop at step 1**: every clip transform — Clock Shift, Nudge (±1), Beat Stretch (both ways), Legato and Resolution Zoom, melodic (`tN_*`), per lane (`tN_lL_*`) and ALL LANES — needs `loop_start == 0`. Otherwise the DSP ignores the key silently; the device UI sends nothing and shows *LOOP STARTS AFTER STEP 1 / CROP FIRST*. Plain Resolution (`clip_resolution`, which keeps steps) is not affected.

**Global drum clip**: `drum_clip_copy "srcT srcC dstT dstC"` (all 32 lanes; preserves dst midi_notes; undo snapshots dst only) · `drum_clip_cut "srcT srcC dstT dstC"` (copy + silence + `clip_init` each src lane; restores src midi_notes).

**Drum nudge reassign**: fire `_reassign` when `|stepEditNudge| > tps/2` (strictly; `>= tpsMid+1` for negative to avoid offset=+tps/2 which `note_step()` maps wrong).

## DSP Structs

```c
typedef struct {
    uint32_t tick;               /* absolute clip tick 0..clip_len*TPS-1 */
    uint16_t gate;
    uint8_t  pitch, vel, active;
    uint8_t  suppress_until_wrap; /* recording only; skip until clip wraps */
    uint8_t  step_muted;          /* inactive step; suppressed from MIDI out */
} note_t;

typedef struct {
    uint8_t  steps[SEQ_STEPS];               /* 0=off/1=on */
    uint8_t  step_notes[SEQ_STEPS][8];
    uint8_t  step_note_count[SEQ_STEPS];
    uint8_t  step_vel[SEQ_STEPS];
    uint16_t step_gate[SEQ_STEPS];
    int16_t  note_tick_offset[SEQ_STEPS][8]; /* per-note ±23 ticks */
    uint16_t length;
    uint8_t  active;
    uint16_t clock_shift_pos;
    int8_t   stretch_exp;        /* 0=1x, ±1=×2/÷2 */
    uint16_t ticks_per_step;     /* TPS_VALUES[0..5]={12,24,48,96,192,384}; default 24 */
    clip_pfx_params_t pfx_params;
    note_t   notes[512];
    uint16_t note_count;         /* active+tombstoned; never decremented */
    uint8_t  occ_cache[32];      /* 256-bit occupancy bitmap */
    uint8_t  occ_dirty;
} clip_t;

typedef struct {
    clip_t  clip;
    uint8_t midi_note;           /* DRUM_BASE_NOTE + lane_index */
} drum_lane_t;

typedef struct { drum_lane_t lanes[DRUM_LANES]; } drum_clip_t;

typedef struct {
    clip_t    clips[NUM_CLIPS];
    uint8_t   active_clip;
    int8_t    queued_clip;
    uint16_t  current_step;
    uint32_t  tick_in_step;
    play_fx_t pfx;
    uint8_t   recording, clip_playing, will_relaunch, pending_page_stop, record_armed, stretch_blocked;
    struct { uint8_t pitch; uint32_t tick_at_on; } rec_pending[10];
    struct { uint8_t pitch; uint16_t ticks_remaining; } play_pending[32];
    uint32_t  current_clip_tick; /* current_step*ticks_per_step + tick_in_step */
    uint8_t   pad_mode;          /* 0=MELODIC_SCALE, 1=DRUM */
    drum_clip_t drum_clips[NUM_CLIPS];
    uint16_t  drum_current_step[DRUM_LANES];
    uint32_t  drum_tick_in_step[DRUM_LANES];
} seq8_track_t;

typedef struct {
    seq8_track_t tracks[NUM_TRACKS];
    uint8_t  playing;
    uint32_t global_tick;           /* bar boundary = % 16 == 0 */
    uint32_t master_tick_in_step;   /* 24-tick master clock; drives global_tick + launch-quant */
    uint8_t  scale_aware, input_vel, inp_quant, midi_in_channel, pad_key, pad_scale, launch_quant;
    uint8_t  mute[NUM_TRACKS], solo[NUM_TRACKS];
    uint8_t  metro_on;              /* 0=Off,1=Count,2=On,3=Rec+Ply; default 1 */
    uint8_t  metro_vol;             /* 0–100; default 80 */
    uint32_t metro_beat_count;      /* JS polls for change → playMetronomeClick() */
    uint32_t perf_mods_active;
    uint32_t looper_cycle;          /* increments each LOOPING wrap */
    uint8_t  looper_sync;           /* 1=wait for clock boundary (default) */
    uint8_t  looper_pending_silence;
    uint8_t  perf_emitted_pitch[NUM_TRACKS][128]; /* raw→emitted pitch, 0xFF=not sounding */
    struct { uint8_t raw_pitch, emitted_pitch, track; uint16_t fire_at; } perf_staccato_notes[16];
    uint8_t  perf_staccato_count;
    uint8_t  drum_undo_valid, drum_undo_track, drum_undo_clip;
    uint8_t  drum_redo_valid, drum_redo_track, drum_redo_clip;
    uint32_t snap_drum_eff_mute[16][NUM_TRACKS];
    drum_rec_snap_lane_t drum_undo_lanes[DRUM_LANES]; /* step-data-only; ~237 KB/slot */
    drum_rec_snap_lane_t drum_redo_lanes[DRUM_LANES];
    /* + snapshots[16], instance_nonce, state_path, ext_queue */
} seq8_instance_t;
```

**Hybrid model**: Step arrays = edit surface; notes[] = playback surface. All set_param handlers write step arrays then call `clip_migrate_to_notes` (one-way rebuild; never modify notes[] directly). `clip_build_steps_from_notes` runs only at state load. `active`=tombstone flag; `step_muted`=MIDI suppression for inactive steps; `suppress_until_wrap`=recording only.

**Render logic** (per tick):
1. `tick_in_step==0`: bar-boundary launch (`queued_clip>=0 && !pending_page_stop && global_tick % QUANT_STEPS[launch_quant]==0`). Page-stop (`pending_page_stop && global_tick%16==0`).
2. Gate countdown: decrement `play_pending[].ticks_remaining`; `pfx_note_off` at 0.
3. Note-on: `clip_playing && !effective_mute` → scan `notes[]` for `effective_note_tick(n)==current_clip_tick`. Skip `step_muted` and `suppress_until_wrap`.

**state_snapshot** (52 values): `playing cs0..7 ac0..7 qc0..7 count_in cp0..7 wr0..7 ps0..7 flash_eighth flash_sixteenth`.

## Recording Architecture

JS sends pitch+vel on pad press; DSP timestamps at arrival (`tick_in_step+current_step`). Note-off: `tN_record_note_off "pitch"`; DSP computes gate with loop-wrap. 10-slot `rec_pending[]`. Input Quantize snaps to step boundary. Disarm: `finalize_pending_notes`. Accuracy ≤2.9ms.

**Gate capture**: `record_note_off` and `finalize_pending_notes` scan notes[] by `pitch+tick+active` only — do **not** require `suppress_until_wrap`. `clip_migrate_to_notes` rebuilds all notes with `suppress_until_wrap=0`; requiring that flag would lose the gate when any step op runs mid-hold.

**Drum live undo**: at arm time, `undo_begin_drum_clip()` snapshots all 32 lanes into `drum_undo_lanes[]`. `drum_undo_valid` and `undo_valid` are mutually exclusive. JS undo dispatches `undo_restore`/`redo_restore` regardless; DSP checks `drum_undo_valid` first.

### Notes generated by the instrument's MIDI effect (`slot_fx_note`)

Not a parameter key: an exported entry the host calls,
`move_plugin_slot_midi_v1(instance, slot, msg, len)` (`dsp/seq8.c`), once per
message, on the audio thread, **after** `render_block`. It carries the notes a
slot's MIDI effect generated (clock-driven or tick output) for every slot whose
chain key `midi_fx_to_host` is 1 — the "Notes to Seq" row on the effect's Module
page (`ui/ui_sound.mjs`). Host side: `../docs/MODULES.md` → "Where a MIDI FX's
output goes".

| situation | what happens |
|---|---|
| owner track recording, or in the last eighth of its count-in | written into the clip (melodic: `clip_insert_note` + step mirror; drum: the lane whose `midi_note` matches, **empty steps only**) |
| owner track not recording, and it is the active track | `capture_note_only` (Capture keeps it) |
| owner track not recording, not active | dropped — one capture ring serves the whole engine |
| no track owns the slot (`route != schwung`) | dropped |

- Owner = the track whose `pfx.route` is Schwung and whose `pfx.slot` is that slot.
- **Never emitted** — no `live_note_on` / `pfx_note_on`: the note already sounded.
- Melodic dedupe: a pitch already on the step (`note_step`) is not inserted again,
  so a generator looping over several laps of a take records each note once.
- Length: the note-off closes the note through its own table, `fx_pending[16]`
  (never `rec_pending`, which a pad release closes by pitch). Open at disarm →
  the default `GATE_TICKS`.
- Per-track Input Quantize applies; VelIn, LIVE ARP and the pad mute do not.
- Stamped with the clip position at the hand-off: at most one audio block
  (2.9 ms) after the note sounded.
- Tests: `tests/test_slot_fx_notes.c`.


## SEQ ARP Details

Intercepts note-on/off in `pfx_send` when `arp.style!=0 && !arp_emitting` → `arp_add_note`/`arp_remove_note`. Emits via `pfx_send` with `arp_emitting=1` (bypasses further processing). `arp_tick` runs per 96-PPQN master tick from `render_block` (also free-runs when transport stopped).

**Retrigger** (default On): cycle position + step column reset to 0 on new note entry (via `pending_retrigger` drained in `arp_tick`) and at clip loop wrap (`ns2==0` in `render_block`). Off: `master_anchor` stays 0, pattern free-runs on master clock.

**First-note clock sync**: empty→non-empty sets `pending_first_note=1`; first emission waits until `((arp_master_tick−master_anchor) % rate)==0`.

**Steps**: 8-entry level array (0=step off, 1–4=vel tiers; level 1=vel 10, level 4=incoming vel; intermediate lerp). Mute=rest but advance cycle; Skip=no fire, no advance. Column = `((arp_master_tick−master_anchor)/rate) & 7`.

**Gate** = `rate * gate_pct / 100`, clamped `[1, rate-1]` so note-off fires before next note-on.

`arp_silence(inst,tr)`: drops held + silences sounding; called from `silence_track_notes_v2`, Off-transition, `pfx_seq_arp_reset`, `pfx_reset`.

## Performance Effect Mode — Mod List

`perf_mods` bitmask bits 0–23. Drum tracks bypass all pitch mods (R1).

**R1 pitch** (bits 0–7): 0=Oct↑ (±12st/cycle alt) · 1=Oct↓ · 2=Sc↑ (ascending scale degrees, 4 cycles) · 3=Sc↓ · 4=5th (5th/10th/15th ascending) · 5=Tritone · 6=Drift (±1 scale deg/cycle accumulates) · 7=Storm (random ±6 scale deg/event)

**R2 vel/gate** (bits 8–15): 8=Decrsc (vel×(1−0.15×cycle)) · 9=Swell (16-cycle triangle) · 10=Cresc (vel×(1+0.15×cycle)) · 11=Pulse (even=full/odd=quiet) · 12=Sidechain (each note 15% quieter) · 13=Staccato (gate=cap/8) · 14=Legato (gate=cap−1) · 15=RampGate (gate ramps across notes)

**R3 wild** (bits 16–23): 16=½time (suppress odd cycles) · 17=3Skip (suppress every 3rd) · 18=Phantom (ghost −12st) · 19=Sparse (~50% suppress) · 20=Glitch (±2 scale deg random) · 21=Stagger (note N+N scale deg) · 22=Shuffle (randomise pitch order/cycle) · 23=Backwards (reverse pitch order)

`perf_apply()` runs in `pfx_send` for every looper-emitted event. Note-offs look up `perf_emitted_pitch[tr][raw]`. `looper_cycle` drives cycle-based animation. Staccato/Legato/RampGate use `perf_staccato_notes[16]` queue.
