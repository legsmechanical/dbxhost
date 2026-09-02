# Param Automation (Front 3) — implementation plan (rev 2, post-advisor)

Companion to `param-automation-spec.md` (RULED). Rev 1 was advisor-reviewed 2026-09-02:
verdict REDESIGN on the store (§0.1) and transport (§0.2); record seam (§0.3), MIDI Out
(§0.4) and the phase skeleton upheld. This rev incorporates all findings.

## 0. Architecture

### 0.1 The store (DSP, per track × clip) — REDESIGNED

- **⭑RULED (Josh, 2026-09-02, revised the same day): automation is a SECTION of the ONE
  project state file** (`"pa"`), not a sidecar. The first ruling was a separate
  `<prefix>-auto.json`, taken because the state blob's ceiling is the shadow parameter
  TRANSPORT (`SHADOW_PARAM_VALUE_LEN` = 65536) and P0b measured a heavy project already
  spending 62.5 KB of it. Josh's question — *"is there no way to route them differently and
  unify after the fact?"* — is the better answer: **fix the leg instead of routing around it.**
  `get_param` now serves `state_chunk_<n>` and JS reassembles, so the ceiling is per chunk, for
  notes as much as automation. Shipped `e63ab099`.
  ⭑ What this buys beyond tidiness: ONE lifecycle. A second file would have to be kept in
  lockstep across create / copy / delete / clear / load — five chances for a project's notes and
  its automation to disagree about which project they belong to. It also removed the ceiling for
  notes alone, which was already close enough to bite ([[schwung-state-transport-64k-ceiling]]).
  ⚠ Snapshot-once is the load-bearing rule: chunk 0 serializes and later chunks are served from
  that buffer, or an edit mid-fetch splices two versions of a project together. Pinned by
  mutation.
  ⭑ No migration and no version bump: the section is absent when a project has no automation,
  which is exactly what every project written before this looks like.
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
  drop-NEWEST + sticky flag (drop-oldest would have the producer writing the consumer's
  index — review 09-02); ONE producer, so a transport stop from the SPI thread REQUESTS the
  release and the audio thread performs it; no logging [[schwung-davebox-rt-logging-footgun]].
- **Drain via ONE global get**: a module-defined global GET key (`pa_pending`) is fine —
  the silent-drop trap is set_param-only (state_full proves the get path). rev 1's per-track
  `tN_pa_pending` = 8 × 2.9 ms/tick — over the tick period on its own.
- **Push via the bulk param API** ✅ (2026-09-02, after the per-parameter version stalled the
  playhead on device): `shadow_set_params(slot, "chain:", blob)` — a host extension, generic,
  documented in docs/API.md — lands each pair where `shadow_set_param` would, in ONE ordered
  blocking round-trip per slot. The drain is one bulk GET carrying the flags; the module
  writes (rest/checkpoint/lock/live/release) are one bulk SET, live values coalesced per
  tick. ⚠ The one-per-tick `pendingDefaultSetParams` queue must never carry automation: a
  recording is dozens of edits a second. The fire-and-forget path is BANNED for automation:
  a stomped write diffs as sent and never re-sends
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

**P3 — Write paths.** ✅ SHIPPED 2026-09-02 (chain-editor knobs): `io.onParamEdit` /
`io.onParamTouch` host hooks (docs/PARAM_PAGES.md) bound in ui_sound.mjs; ui_automation.mjs
owns the grammar (held step = lock via `pa_set2`; playing = `pa_live`, the DSP's own
recording/playing flags decide record vs override; release = `pa_live_end` → resume); rest
from the edit BEFORE the first; one `undo_checkpoint` per gesture; touch wins on the push
side; ownership enforced in the store (`pa_owner_conflict` → popup on the next poll, because
get_param is banned in the MIDI handler). The audio thread is now a store WRITER (the latch)
— a CAS writer lock (`pa_lock`/`pa_trylock`) excludes it from the SPI thread; it never spins.
⏳ OWED: **multi-step hold** — S.heldStep is a scalar and a second pad press while held is
already gate-drag (step-record grammar); locking several steps at once needs a ruling on that
collision before the hold state becomes a set. Bus levels and the MIDI Out device write
paths come with P4/P5.

**P4 — Gestures + display.** ✅ SHIPPED 2026-09-02 (`e1993d32`), chain editor: Mute+touch
deactivate/reactivate (rest at once via the entry's `release` byte, staged by the audio
thread); Delete+touch clear (entry RETIRED, keeps its rest); hold-Mute paints the rings
(unlit/red/white) via `paramPagesFullKeyAt` + `paramPagesRepaintKnobs` (new binding exports);
Delete+step clears locks on every bank; touched float + jog-click toggles Smooth (popup); the
circle rides the tri-state `io.isModulated` ("auto"/"auto-off") in the movy renderer — NOT
`decorations`, which the movy renderer never had. JS keeps a per-(track,clip,target) cache
from one `pa_list` read. ⏳ Not in P4: the bank-6 overview (P6), bus-level gestures (their
knobs are davebox's own, not the editor's).

**⏸ HOLD (Josh, 2026-09-02 evening): nothing below builds until the automation UI is designed
as one thing — the rulings so far are in the spec §2 (two new banks MACROS → AUTOMATION after
SOUND + CONFIG; Smooth in the AUTOMATION menu only; no MIDI Out device on a Move track; the
assignment layer moves to MACROS; "a hold never creates a note"; the save rule).**

Proposed build order once lifted (drafted for Josh's review, 2026-09-02 night):
1. **Measure + budget** — an idle trace is done (poll folded, `bf9f3f40`); the playback and
   recording traces need Josh at the device. Gate: `js.tick` p95 under ~20 ms.
2. ✅ **BUILT 2026-09-02** — **SOUND + CONFIG bank knobs** (K1 Volume / K2 Pan / K3 Send A / K4 Send B / K5 Module
   Level on a chain slot) — kit bank page fed into the automation owner; the gateway click
   unchanged. Circles on the kit cells; hold-Mute paint.
3. ✅ **BUILT 2026-09-02** — **MACROS bank** (`BANK_MACROS = 13`, sound mode's SECOND bank
   identity: `isSoundBank()`, `soundSetBank()`, `VIEW_MACROS`; the walk between SOUND + CONFIG
   and MACROS is a screen switch inside one open mode). Built on the KIT BANK PAGE like its
   neighbour, with `makeCell` widgets and the travel law — the "host-composed param-page"
   feature was NOT needed and stays unbuilt. The store is davebox-owned and typed
   (`GS.trackMacros`, sidecar `mac`; kinds `chain` / `level`, a `bank` kind reserved for
   Josh's davebox-bank-knob idea); the chain's knob_N store migrates once. The travel-law pins
   are RE-PINNED in `tests/js/test_macros_bank.mjs` (range step, int floor, enum 4/step,
   reversal reset, zero reads per sweep, magnitude kept). Shift+touch quick-assign; Levels as a
   target; Sound Control → Knobs and the knob HUD retired. ⏳ MIDI targets wait for P5.
   ✅ 2026-09-03 (Josh's pass): chain-store MIRROR + patch-load merge; macros work AT REST
   (`soundOpen` vs `soundActive`); Module Level off the S+C card; `Tr<n> - ` on the new cards;
   BANK-KNOB targets by Josh's numbered list. ⏳ FUTURE (Josh): multi-target macros with
   per-target min/max ranges.
4. **AUTOMATION bank** (replaces bank 6): the list card, the menu (delete, mute, smooth, loop
   length/resolution, clear clip; AT lanes as rows), Delete+jog-click shortcut, undo per
   action; the Smooth click leaves the module editor; "hold a step, see the locks".
5. ✅ **BUILT 2026-09-02** (`099ae47b` promote, `19be8fe0` hold-never-creates, `ac30c22a` STEP bank, `798ff3dc` reveal, + hints/undo/manual) — **The held step, one law (⭑RULED 2026-09-02 midday, spec §3)**: a hold creates nothing (a
   pad press while held does); the step editor becomes the STEP bank (`--` with no step held);
   a held step redirects the on-screen knobs to that step everywhere; hold + JOG right reveals
   the STEP bank, jog left returns, two positions, no cycling; step edit is never the default. ⚠ Pulled FORWARD to
   build next (Josh, midday): it is what makes an empty-step p-lock a pure automation point.
6. **P5 MIDI Out device** (Schwung + MIDI routes only), then **P7 bake/export**, then **P8**.

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
