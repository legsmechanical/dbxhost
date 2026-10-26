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
| `tN_tarp_octaves` | set/get | -4..-1, +1..+4 | 0 skipped. |
| `tN_tarp_gate` | set/get | 1–200 | Gate percent. |
| `tN_tarp_steps_mode` | set/get | 0/1/2 | Off/Mute/Skip. |
| `tN_tarp_latch` | set/get | 0/1 | Latch. Turning off calls tarp_silence. |
| `tN_tarp_step_vel` | set | `"S L"` | Set step S (0..7) to level L (0..4). |
| `tN_tarp_sv` | get | 8 space-sep ints | step_vel[0..7] for batch read. |

**Scene resample** (`seq8_resample.c`; the host's module take, `move_host_ext_v1_t.capture_start`): `resample_scene "C bars warmup tail |path"` (set; from a STOPPED transport only — launches row C, starts the transport with no count-in, arms the take one render after the first tick plays, records `bars` (+ `tail`) bars to the absolute `path`; with `warmup` 1 the take starts one pass in; every clip stops at the end of the pass; the metronome is silent while pending/recording; a transport stop cancels) · `resample_clip "T C bars warmup tail src |path"` (set; track T's clip C ALONE — no other track plays; `src` 0 Wet = the mix, 1 Dry = the resolved destination's chain slot via `capture_start_src`; refused for a track with no instrument / external MIDI, Dry off a chain, a muted or soloed-out track) · `resample_bars_tT_cC` (get; that clip's length in whole bars, lined up with the bar; a drum clip's lanes' LCM; 0 = no notes) · after any take, the next transport stop puts back each track's clip and armed state from before it; a project load cancels a take · `resample_clear` (set; terminal state → idle) · `resample_err` (get; 1 playing, 2 following Move's clock, 3 no host take, 4 another merge/print/count-in/take, 5 bad args, 6 the sampler refused, 7 no instrument / Dry off a chain, 8 muted) · `resample_bars_C` (get; row C's natural length in bars — where every non-empty clip lines up, past 32 bars the longest clip rounded up, 0 = empty). State, frames captured and take frames are `state_snapshot` fields 65–67 (state: 0 idle, 1 armed, 2 starting, 3 recording, 4 done, 5 cancelled, 6 failed).

**Audio tracks** (`seq8_audio.c`, `setparam/sp_track_audio.c`; the host's `slot_audio_feed`): an Audio track is a drum track (`pad_mode` 1) with `tN_au_on` 1 — its lane hits (every drum path, via `drum_pfx_emit`) play slices of the clip's sample into the track's own slot instead of MIDI. Set: `tN_au_on "0|1"` (needs a drum track; on resets lane notes to 36+L; off drops every clip's sample) · `tN_au_pick "C|<abs path>"` (copied into `<state dir>/samples/` by the loader thread — same name and size reused, else `~2` — then loaded; a Loop pick sets the clip to the sample's length in whole bars) · `tN_au_clear "C"` · `tN_au_set_<field> "C v"` (mode 0 Loop / 1 Slice, slices 1–32 (Even), jump 2–32, start / end permille, pitch ±24, gain −40..+12, bars) · `tN_au_slice_<field> "C L v"` (pos frames → Manual, nudge ms, len %, pitch, gain, rev, play 0 One / 1 Gate / 2 Loop, atk, dec ms) · `tN_au_chop "C"` (one hit per slice; one undo) · `tN_au_jump "K"` / `tN_au_jump_off "K"` (Loop: jump the playing loop; stopped, audition while held) · `tN_au_lazy "C 1|0"`, `tN_au_lazy_tap` (Lazy chop). Get: `tN_au_on`, `tN_au_info_C` ("state err mode method n jump rstart rend pitch gain frames rate ch|name"; state 0 none, 1 loading, 2 ready, 3 failed; err 1 open, 2 format, 3 too long, 4 memory, 5 copy), `tN_au_sl_C_L`, `tN_au_starts_C` (permille), `tN_au_peaks_C` (128 × min/max hex), `tN_au_pos` ("on rel abs lane"), `tN_au_lazy`, `tN_au_dir` (the samples folder), `au_used` (every name a clip holds). Saved sparse: `t%d_au`, `t%dc%d_au` "mode method n jump rstart rend pitch gain|name", `t%dc%ds%d_au`. WAV and AIFF/AIFC, 8/16/24/32-bit and float; Slice ≤ 4 min, Loop ≤ 10 min (loaded whole).
