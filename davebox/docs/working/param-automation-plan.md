# Param Automation (Front 3) — implementation plan (rev 2, post-advisor)

Companion to `param-automation-spec.md` (RULED). Rev 1 was advisor-reviewed 2026-09-02:
verdict REDESIGN on the store (§0.1) and transport (§0.2); record seam (§0.3), MIDI Out
(§0.4) and the phase skeleton upheld. This rev incorporates all findings.

## 0. Architecture

### 0.1 The store (DSP, per track × clip) — REDESIGNED

- **⭑RULED (Josh, 2026-09-02): automation lives in its OWN FILE**,
  `Sets/<uuid>/dAVEBOx/<prefix>-auto.json`, DSP-written by the same non-RT deferred-save
  machinery as the main state. Why: the main state's ceiling is the TRANSPORT, not the
  serializer — under SA `host_module_get_param('state_full')` routes through
  `shadow_get_param`, value field `SHADOW_PARAM_VALUE_LEN` = 65536 (shadow_ui.js:4339;
  ⚠ `char buf[16384]` at schwung_host.c:1462 is the LEGACY menu-host binding, a decoy) — and
  **P0b measurement (2026-09-02) showed a heavy-but-ordinary project already spends 62.5 KB of
  that 65.5 KB.** There was never a budget to ration. (That measurement also found and fixed a
  live silent-truncation data-loss bug — `43892d66`.) A second file keeps the storage model
  intact ([[schwung-state-colocation-model]]): one dir per project, copy still a copytree,
  delete still one rmtree.
  ⚠ It obeys every rule the main state does: **crash-atomic write** (temp + fsync + rename,
  [[schwung-atomic-write-inode-is-the-only-pin]]), never written from the audio thread, and
  **loaded/cleared in lockstep with the project** (state_load, Clear Session sentinel, uuid
  mismatch, awaiting_select). The failure to design against is a stale auto file beside a fresh
  project: the file carries the project uuid + a serial, and a mismatch DISCARDS it rather than
  applying stale automation.
  ⭑ Freed by this: no transport-forced global cap and no "AUTOMATION FULL" popup in v1 (keep a
  generous sanity cap against runaway growth); points are bounded by resident memory, not wire.
- **Preallocated point-block pool at create_instance** — fixed block list, hand out blocks,
  NEVER malloc/realloc on the SPI thread (set_param runs at FIFO 90; the sp_globals_edit
  callocs are an accepted legacy tradeoff, not a license). rev 1's "at_auto_t
  allocate-on-demand precedent" was false — both old structs are fixed resident arrays.
- **Interned target strings**: one per-instance table; entries reference by index (a param
  automated in 16 clips stores its key once). Target grammar unchanged: `"<slot>:<comp>:<key>"`
  / `"bus:<n>:<field>"` / `"cc:<n>"` / `"at"`; DSP interprets only `cc:`/`at`.
- **Points `{tick:u16, val:u12-range}`** (max clip tick = 256×24 = 6144 fits u16; knob
  resolution is ~100 steps — 14-bit was over-spec'd), compact delta serialization, not
  `tick:val;` ASCII per point.
- **Rest value IS stored per (clip, target)** — captured at first automation write. Playback
  writes real slot params, which persist in slot state; without a rest there is nothing to
  restore. Re-asserted on transport stop (seq8_set_param.c:383 precedent), on deactivate
  (Mute+knob), and on clear (Delete+knob). Spec §1's "knob position is the resting value"
  is the AUTHORING model; this is its storage.
- Per entry: `active`, `smooth`, and sparse future fields `loop_len`/`loop_offset`/
  `resolution` (default 0 = follow clip; Josh's polymetric recall, UI-only later).
- **Owner-per-target arbitration**: first track to automate a target owns it; the UI refuses
  (with a popup naming the owner) a second track's attempt. Prevents two tracks fighting over
  one param every tick and wasting the write budget.
- **Copy/cut/paste carry the payload**: clip_copy/row_copy/clip_cut/row_cut/drum_* in
  sp_globals_edit.c (:19,:64,:158,:215,:314,:366) must move/copy the clip's entries + points
  (pool-aware), not just the undo snapshot.
- **Undo**: block-list snapshot of a clip's entries (pool blocks are the unit), NOT a fixed
  memcpy — rev 1's parallel-array approach would double the ~1.3 MB undo footprint.
  One-checkpoint-per-recording-session via the tN_cC_undo_checkpoint pattern
  (ui_record.mjs:285).

### 0.2 Emission & transport — REDESIGNED

Split by target kind (upheld): `cc:`/`at` emit sample-accurately DSP-side (cc_emit path,
seq8.c:5673); chain/bus params are evaluated DSP-side and PUSHED by JS. The transport:

- **Evaluator** in render_block's tick loop (seq8_render.c:936-1023 hook, inside
  `while (seq8_tick_due)` — ~192 Hz at 120 BPM), stepped or linear per entry.
  **Diff on the WIRE STRING, not the normalized value** — an enum under a ramp must not stage
  a change while its wire value is unchanged. (JS computes wire; the DSP diffs on quantized
  val at declared-step granularity, JS re-checks wire equality before pushing.)
- **Staged-change ring**: preallocated SPSC, producer = audio thread, consumer = SPI-thread
  get_param; `__atomic` release/acquire head/tail (shadow_ui.c:966-971 pattern); overflow =
  drop-oldest + sticky flag; no logging [[schwung-davebox-rt-logging-footgun]].
- **Drain via ONE global get**: a module-defined global GET key (`pa_pending`) is fine —
  the silent-drop trap is set_param-only (state_full proves the get path). rev 1's per-track
  `tN_pa_pending` = 8 × 2.9 ms/tick — over the tick period on its own.
- **Push via the bulk param API, extended**: `shadow_set_params` (shadow_ui.c:981-990,
  shim src/schwung_shim.c:4154) is one blocking ORDERED round-trip — no stomp window — but
  `shim_handle_param_bulk` currently ignores the slot arg and routes only to the overtake DSP.
  **Host change (generic, opt-in, docs in same commit): route bulk entries by slot to chain
  slots.** Until it lands, `shadow_set_param_timeout` (force-blocking) + explicit per-tick
  write budget (≤3 writes/tick, round-robin by staleness). The fire-and-forget path is
  BANNED for automation: a stomped write diffs as sent and never re-sends
  [[schwung-shadow-set-param-fire-and-forget-loss]].
- **Touch wins**: pushes are suppressed for a target under an active knob touch (override-
  resume requires it; also prevents the co-run editor's readback fighting the knob).
- Smooth's honest resolution: ≤94 Hz staircase on modules that don't smooth internally
  (the chain smoother is inert [[chain-param-smoother-is-inert]]); document it, and disable
  Smooth for targets whose declared step makes interpolation meaningless.

### 0.3 The record seam (upheld, two fixes)

- Host hook `io.onParamEdit(fullKey, wire, norm)` on the param-pages controller — fired at
  the **value-change site** in onKnobTurn (where value/wire are computed), NOT at the
  throttled setParam call (SETPARAM_THROTTLE_MS=20 would staircase a fast sweep). Generic,
  opt-in, default-off, documented in docs/MODULES.md.
- Override-resume hooks exist: onKnobTouch (page_controller.mjs:2998) is a real
  touch/release event; davebox has S.knobTouched / S.knobLocked.
- davebox binds the hook in sound-mode co-run; all decisions in ONE owner `ui_automation.mjs`.
- **Multi-step hold is its own work item**: S.heldStep is a scalar (ui_state.mjs:364) and the
  second concurrent press routes to tap-toggle/gate-drag (ui_input_pads.mjs:1315) — reworking
  hold state to a set is P3 line one.
- Move-synth rows are doors, never automatable (spec §2); bus-level writes go through the
  same budgeted blocking path (they are outside verify-and-rewrite today).

### 0.4 MIDI Out pseudo-device (upheld — unchanged from rev 1)

8 CC + AT; rows per route flavour (Schwung after FX blocks ui_sound.mjs:2109-2133; Move after
bus rows :2085-2107; EXT replaces the :2119 short-circuit); page on the davebox kit; config
page for assignment; keys `tN_pa_cc_assign`; live turns send immediately, playback DSP-side.

## 1. Phases

**P0 — spikes + measurement.** (b) ✅ DONE 2026-09-02 — the finding retired the rationing
design and produced a separate shipped FIX (`43892d66`). (a) OWED, needs device: throwaway
`setDecorations` call + a knob-LED paint, proving the two unproven seams before building on
them (and clear decorations on page change — nothing resets `s.decorations` today; first
caller owns it). (c) OWED, needs device: rate-check blocking writes per tick.

**P1 — DSP store + keys + state.** Pool, interned targets, rests, entries;
`sp_track_paramauto.c` — **returns 1 on `pa_` prefix match even for unknown sub-ops**
(sp_track_misc's pfx_set catch-all would swallow them; note: sp_track_ccauto has this latent
bug today — dies in P8; fix the dsp/CLAUDE.md sentence claiming otherwise). Keys: `tN_pa_set`,
`tN_pa_set2`, `tN_pa_clear_key`, `tN_pa_clear_step`, `tN_pa_clear`, `tN_pa_active`,
`tN_pa_smooth`, `tN_pa_cc_assign` (all tN_ — no new globals on the SET side). GETs: global
`pa_pending`, `tN_pa_list`, points readers via bulk. The auto file carries its OWN version, so
the main state's v36 does NOT bump: a project without an auto file simply has no automation —
that is the no-migration story, for free; copy/cut payload; undo block
snapshots. C tests: roundtrip, undo, pool exhaustion, budget, clear, copy-carry.

**P2 — Playback.** Evaluator + ring + global drain + budgeted blocking push; **host bulk
slot-routing extension** (generic, own commit, docs); cc:/at emission + rest re-assert on
stop; clip-switch re-anchor (seq8_render.c:662-772); touch-wins suppression. Device rate
measurement gates the budget number.

**P3 — Write paths.** Held-step SET rework; ui_automation.mjs; onParamEdit hook + binding;
record gate (S.recordArmed && S.playing); p-locks incl. multi-step; override-resume;
one-undo-session; owner arbitration UI.

**P4 — Gestures + display.** Mute+knob deactivate (restores rest); hold-Mute LED paint
(replaces ui_leds.mjs:867 branch); Delete+knob clear (restores rest, verified write);
Delete+step clears all locks at step; circles via decorations (shared grid) + `locked` cell
field through drawKitBankPage (ui_movy.mjs:2971); Smooth toggle (knob-touch + jog-click +
popup).

**P5 — MIDI Out device** (§0.4).

**P6 — Bank 6 → read-only overview.** Replace the latched screen (gate ui_render.mjs:1836,
block :1822-1955; non-latched fallthrough is :2189); readback rides the bulk GET (never
per-param 2.9 ms reads).

**P7 — Bake & export (SEPARATE paths — Josh 2026-09-02).** BAKE: full inclusion — entries
survive with length-pinning (seq8_bake.c:735-748), all target kinds. EXPORT (→ Live, MIDI):
cc:/at entries render into the non-destructive renderers (:258-459, :939); chain-param
entries omitted (no MIDI representation).

**P8 — Deletion sweep.** Per the inventory (worklog 2026-09-02): + `ui_export.mjs`,
`ui_input_cc.mjs`, `ui.js` (rev-1 list was short). Capture re-pointed at the new writer;
AT + drum lanes preserved; rui_cc/web_ui_seq band editor **dropped from v1 explicitly**
(spec §5.3 permits; re-point is a follow-up front); MANUAL-SA §11 rewrite; REMOTE_UI.md;
CHANGELOG Removed.

## 2. Standing risks
- Write budget vs. dense multi-param automation: the budget + staleness round-robin degrades
  gracefully (params update late, never lost); manual documents "control-rate".
- The auto file is a SECOND file in a model built on one: every project lifecycle path
  (create / copy / delete / clear / load / uuid-mismatch) must handle it or automation leaks
  between projects. Enumerate and test each in P1.
- The seams proven in P0 before anything is built on them.
