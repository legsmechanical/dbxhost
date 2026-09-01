# dAVEBOx SA — DSP

Read this when starting DSP work. Covers what the module's root [`CLAUDE.md`](../CLAUDE.md) does not.

> **Provenance:** ported from the frozen Legacy repo on 2026-08-14 and re-verified against this
> tree (file sizes, include order, the setparam split, the state version and the log path were all
> re-measured, not copied). The subtree merge carried the code but not this file.

## Files

`seq8.c` (~7430 lines) is the single translation unit — it `#include`s ten sibling `.c` files at
fixed positions. There are no extern declarations between them and **none compile standalone**.

| file | ~lines | contents |
|---|---|---|
| `seq8_state.c` | 1275 | state persistence: JSON parse helpers, serialize, load/migration |
| `seq8_looper.c` | 488 | global MIDI looper (`looper_mark_active`/`silence_active`, `perf_apply`, `looper_tick`/`stop`) |
| `seq8_tonality.c` | 143 | effective key/scale, transpose remap LUT, `scale_transpose`/`note_abs_degree` |
| `seq8_pfx.c` | 346 | pfx-chain note gen + scheduling + playback-direction helpers |
| `seq8_drum.c` | 367 | drum per-lane play-effects engine (`drum_pfx_*`, `drum_lane_note_off_imm`) |
| `seq8_arp.c` | 374 | SEQ ARP engine (`arp_*`) |
| `seq8_bake.c` | 1270 | Print/Bake: offline pfx-chain apply, conductor bake offset, melodic/drum bakes |
| `seq8_convert.c` | 306 | track-type conversion (melodic ↔ drum ↔ conduct) |
| `seq8_set_param.c` | 1248 | `sp_ctx_t` + the dispatcher shell; branch bodies live in `dsp/setparam/` |
| `seq8_render.c` | 1146 | `render_block` (audio-callback driver) + master-clock seam helpers |
| `seq8_param_auto.c` | ~330 | per-parameter automation: store ops, evaluation, its own project file |

⚠ `seq8_param_auto.h` is the one **header** in this family: the instance struct embeds the
automation pool, so the types must be visible before it while the functions need the instance
type. It is included up with the constants, the `.c` down with the cold-path includes.

⚠ **`pfx_*` symbols live in BOTH places** — the pfx runtime (`pfx_send`/`emit`/`note_on`/`off`) and
the event queue (`pfx_q_insert`/`fire`, swing) stay in the core. Likewise **TRACK ARP (`tarp_*`)
stays in the core** while SEQ ARP moved out; they are interleaved.

**What remains IN `seq8.c`:** lifecycle (`create`/`destroy_instance`), `on_midi` +
`drum_pad_event`, `get_param` + `seq8_remote_snapshot`, undo/redo, the pfx runtime + event queue,
TRACK ARP + drum-repeat + live-note dispatch, live-merge (`merge_place`/`finalize`), the
playback-geometry cluster, clip primitives, constants/structs, and `g_api`.

**Include order and position matter** (declaration visibility). Gate for structural edits: the
preprocessed TU must be byte-identical before and after —

```sh
clang -E -P -std=c11 -Idsp -Itests/harness tests/test_smoke.c
```

Each `#include` site carries a **LOAD-BEARING SPACING** comment: the blank-line layout there is
part of the byte-identity gate. **Do not tidy it.** `seq8_render.c` must remain the LAST include
before `g_api` (which references `render_block`), and any further `set_param` split must stay
inside the convert→render include window.

## `dsp/setparam/` — 13 file-scope handlers

`set_param()`'s branch runs live in 13 files under `dsp/setparam/`: 4 `sp_globals_*` and 9
`sp_track_*`, each a `static int sp_<domain>(sp_ctx_t *cx)` included at file scope just before
`set_param` and dispatched with `if (sp_<domain>(&cx)) return;`. The conversion is **complete** —
none is a raw mid-function segment any more.

`set_param`'s body is now: null-guard → build `cx` → 4 globals dispatches → the `tN_` block (guard,
assign `tidx`/`tr`/`sub` onto `cx`, 9 `tN_` dispatches).

**Rules a maintainer MUST know:**

- **Never compile, lint, or format any setparam file standalone** — they are part of the `seq8.c`
  single TU, not translation units.
- **Handler contract:** return 1 = key consumed (the dispatcher returns), 0 = fall through. Build
  the ctx with **designated initializers only**.
- ⚠ **Guarded-block + downstream catch-all → CONSUME the whole block.** When a group is a
  self-guarded block (e.g. `sp_track_drum`'s `if (sub[0]=='l' && digit)`) **and** a later handler
  has a catch-all (`sp_track_misc`'s unconditional `pfx_set`), the handler must `return 1` on
  guard-match even for an unknown sub-op — `return 0` only when the guard itself fails. Otherwise
  an unknown `tN_lL_*` key falls through and the catch-all mis-handles it.
  ⚠⚠ **CORRECTION (2026-09-02): this file used to end that rule with "`sp_track_config` and
  `sp_track_ccauto` return 0 on no-match precisely because they have no catch-all downstream."
  That is FALSE, and it is the kind of false that reads as reassurance.** Both are dispatched
  *before* `sp_track_misc` (`seq8_set_param.c` ~1195 vs ~1246), so the catch-all IS downstream of
  them and an unknown `tN_cc_*` key is mis-handled as a play-effects parameter rather than
  ignored. Latent today (nothing sends such a key) and it dies with the lane system in Front 3's
  P8 — but **a new prefixed handler must consume its whole prefix**: `sp_track_paramauto` returns
  1 for any `pa_` sub-op, known or not, and `test_param_auto.c` pins that a stray `pa_` key
  changes no pfx parameter.
- **Where a new key goes:** new global keys → the matching `sp_globals_*` file (they sit before the
  `tN_` guard); new `tN_` keys → the matching `sp_track_*` file, and **always before**
  `sp_track_misc.c`'s `pfx_set` catch-all tail, which returns unconditionally and would silently
  swallow anything placed after it.
  ⚠ The root gotcha still applies — the host silently drops NEW
  *global* `set_param` keys, so prefer `tN_`-prefixed ones.
- **Asymmetric braces:** `sp_track_config.c` OPENS the `tN_` block and declares `tidx`/`sub`/`tr`;
  `sp_track_misc.c` CLOSES both the block and `set_param` (the final two braces live in-segment).
  Every other file is brace-balanced.
- **Comment hazard:** never let `*` followed by `/` appear inside a header comment (a wrapped
  `tarp_*/track...` key list once terminated the comment and leaked raw text into the TU).
- **Crash symbolication offset:** because of the `#line 1` directives, diagnostics and DWARF report
  **body-relative** lines. True physical line = reported line + the physical line number of that
  file's `#line 1`. Applies to the addr2line / shim-crash workflow
  ([[schwung-shim-crash-symbolize]]).
- Gate per structural edit: TU byte-identity (above) **plus** `tests/run.sh` green. Comment-only
  edits still must pass — comments affect `-E -P` line layout.

Design history: `schwung-davebox/docs/superpowers/plans/_archive/2026-07-06-refactor-phase4-setparam.md`.
⚠ **`docs/superpowers/` does not exist in this tree** — it was gitignored, so the subtree merge did
not carry it. Every plan/spec referenced from davebox docs lives only in the frozen Legacy repo,
and the file above sits under `plans/_archive/`, not `plans/`.
API reference: `docs/reference/DAVEBOX_API.md`.

## Build

```sh
./scripts/build_sound.sh                          # SA: Docker cross-compile (aarch64)
nm -D dist/davebox-sound/dsp.so | grep GLIBC      # must be ≤ 2.35
```

GLIBC ≤ 2.35 required. No complex static initializers.

## Logging

**Use `seq8_ilog(inst, msg)`** — writes via `inst->log_fp`.

**Never `fprintf(stderr, ...)`** — that goes to MoveOriginal's uncaptured stderr and will not
appear in the log. ⚠ **Never log from the audio thread at all** — per-event `fopen`/`fflush`/
`fclose` on the RT SPI thread violates the RT-logging ban
([[schwung-davebox-rt-logging-footgun]]). If you need RT diagnostics, use a preallocated in-memory
ring drained off-thread.

⚠⚠ **The log path is in the STOCK tree, not the DBX tree.** `SEQ8_LOG_PATH` (`seq8.c:107`) is
`"/data/UserData/schwung/" SEQ8_STATE_PREFIX ".log"`, so an SA build writes
**`/data/UserData/schwung/seq8sa.log`** — while the *host's* unified log under SA lives at
`/data/UserData/dbx-host/debug.log`. Two trees, and the obvious guess is wrong in both directions.

```sh
ssh ableton@move.local "tail -f /data/UserData/schwung/seq8sa.log"   # SA (prefix seq8sa)
ssh ableton@move.local "tail -f /data/UserData/schwung/seq8.log"     # Legacy build
```

⭑ Same family as the metronome bug fixed on 2026-08-14, where a hardcoded Legacy module path made
the click silently never load. See [[schwung-two-install-trees-same-filenames]].

## Drum clip allocation

`drum_clip_t *drum_clips[16]` — pointers, NULL while a track is melodic. Allocated by
`drum_clips_alloc(inst, tr)` on state load (if `t%d_pm=1`), on the first `tN_lL_*` lane write, and
on `tN_pad_mode` / `tN_convert_to_drum` *if* they reach the DSP. Freed by `drum_clips_free(tr)` on
state reload or `destroy_instance`. All 32 lanes always exist inside an allocated clip.

⚠ **Critical platform constraint:** the host silently drops `tN_pad_mode` and `tN_convert_to_drum`
— they never reach the DSP handler. **The `tN_lL_*` dispatch is the reliable allocation trigger**:
on the first lane write, if `pad_mode != DRUM`, set it and allocate. Safe because JS only sends
`tN_lL_*` for drum-mode tracks.

Every `pad_mode == PAD_MODE_DRUM` check in `render_block` must **also** guard
`&& tr->drum_clips[tr->active_clip]`, to cover the window between pad_mode being set and the clips
being allocated.

## MIDI routing

- `midi_send_internal` → the Schwung chain. Safe from the render path.
- `midi_send_external` → USB-A. ⚠ **Never call from the render/tick path — deadlock.**

Slot-addressed dispatch: `midi_send_internal_slot` targets a chain slot directly (SHM midi-dsp
frame byte 3 = slot tag, 0 = legacy channel match).

## State format

**v=36 only.** `v≠36` → a user confirm dialog ("Incompatible State") before erase; "No" exits the
module with the file preserved. The Clear Session sentinel (`{"v":0}`) is silently wiped, no dialog.
**Backward compatibility is a concern** — prefer migrating old fields in `seq8_load_state` over
bumping.

Note format: `tick:pitch:vel:gate;`

Per-clip / per-drum-lane loop window: `t%dc%d_ls` (melodic), `t%dc%dl%d_ls` (drum) — sparse, omitted
when `loop_start == 0`. Playback wraps inside `[loop_start, loop_start+length)`; pattern data
outside the window is preserved.

Key prefixes:
- SEQ ARP — `_arst` / `_arrt` / `_aroc` / `_argt` / `_arsm` / `_artg`
- TRACK ARP — `t%d_taon` / `tast` / `tart` / `taoc` / `tagt` / `tasm` / `talc` / `tasv%d`
- VelIn — `t%d_tvo` (sparse, missing = 0 = Live)
- Note Repeat gate — `t%dl%drg` (sparse, default 255); vel scale `t%dl%dvs%d`; nudge `t%dl%dnd%d`
- Drum lane mute/solo — `t%ddlm` / `t%ddls`
- Swing — `_swa` (0–100) / `_swr` (0 = 1/16, 1 = 1/8), sparse, default 0

`state_load` calls `drum_track_init` + `drum_repeat_init_defaults` before applying saved values.

⭑ Paths come from the co-located storage model — `Sets/<uuid>/dAVEBOx/<prefix>-state.json` via
`SEQ8_SET_STATE_FMT`, with `SEQ8_STATE_PATH_FALLBACK` for the no-set case.
[[schwung-state-colocation-model]]

## Step-write invariant

Any code writing `cl->step_notes[]` / `cl->step_note_count[]` / `cl->steps[]` from an absolute clip
tick **must** compute `sidx` via `note_step(abs_tick, cl->length, tps)` — **not** `abs_tick / tps`.
The `_steps` `get_param` reader and `clip_build_steps_from_notes` both **round**
(`(tick + tps/2) / tps`), so a truncating writer causes LED-vs-hold step divergence for sub-step
(InQ Off) notes. `note_tick_offset[sidx][i]` is signed `int16_t` and may be negative when a note
rounds up into the next step.

Paths indexing by `drum_current_step[lane]` (`drum_record_note_on`, `drum_repeat_tick`,
`drum_repeat2_tick`) do **not** need `note_step()` — they are already at a step index.

## Deferred save

Handlers set `inst->state_dirty = 1` — **no file I/O on the audio thread.**

JS `pollDSP()` calls `get_param("state_full")` every `POLL_INTERVAL` ticks. When dirty, the DSP
serializes via `fmemopen` into `inst->state_buf[65536]` and JS writes it with `host_write_file`
(~2 ms). Overflow (>63 KB) falls back to a synchronous write with a log warning.

The suspend path (`set_param("save")`) calls `seq8_save_state` synchronously — the host may kill JS
before an async write completes.

Handlers that never called `seq8_save_state` (bpm, key, scale, pfx bank knobs) only save on suspend.
