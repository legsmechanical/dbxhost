# dAVEBOx SA — implementation plan for the skeleton spec

> Produced 2026-08-04 by a planning pass over both repos, from
> [`DBSA_SPEC_SKELETON.md`](DBSA_SPEC_SKELETON.md) (Josh's verbatim spec).
> **Investigation + plan only — nothing here has been implemented.**
> Bullet numbers B1–B15 follow the skeleton's order.
>
> ⚠ Claims are cited `file:line` against `schwung-davebox` `c34c07e` /
> `dbxhost` `56829e03`. Re-verify line numbers before acting on them.

`host` = `dbxhost`, `davebox` = `schwung-davebox`.

---

## The four findings that change the shape of the work

1. **B3 (per-Move-track buses) largely EXISTS.** Josh's "they may already exist" is correct:
   `MOVE_FX_SLOTS 4` / `shadow_move_fx_slots[4][4]` + `move_fx_strip_t {volume, send_a, send_b}`
   (`host/src/host/shadow_chain_mgmt.h:24-25, 131-141`), 4 insert FX then strip volume applied
   **after** the FX loop (`host/src/schwung_shim.c:2303-2334`) — i.e. the "POST insert effects
   level" semantics are already what's implemented. What's missing is that **davebox never exposes
   them** (`FX_BUSES` in `davebox/ui/ui_sound.mjs:99-107` is master + sends only; zero `move_fx`
   hits in `davebox/ui`).

2. **4→8 chains is NOT the foundation — "Move > Schwung always on" is.** The entire Move-FX branch
   lives inside the `rebuild_from_la` path (`host/src/schwung_shim.c:2285-2334`), so it is dead code
   unless Link Audio rebuild is active. B13 therefore gates B3 and B4. Meanwhile B3/B4/B6/B13 and
   the whole boot-experience group work fine at today's 4 chains.

3. **The autosave gap (B6) has a precise and bad shape.** Periodic autosave exists (~10 s,
   `host/src/shadow/shadow_ui.js:293, 492, 15842-15846`) but is gated `!isOvertakeActive`
   (`:15845`) — and under SA, **davebox is a permanently-active overtake**. So for a whole SA
   session, host settings persist only at explicit flush points. A crash or hard reboot loses
   everything since entry.

4. **B4's removal was anticipated in the code.** `SLOT_LEVEL_KEY = 'synth_volume'`
   (`davebox/ui/ui_engine.mjs:60-79`) carries the comment *"Flip this one string to go back to the
   fader."* Once Move tracks are on their own bus, `slot:volume` becomes correct and the extra level
   is redundant — exactly Josh's reasoning. ⚠ But see Risk 5: saved non-unity `slot_synth_volumes`
   become invisible gain if the row simply disappears.

---

## Per-bullet findings

### B1 — "davebox controls the entire UI/UX"
Umbrella / acceptance criterion for B5, B11–B15, not a work item. Already close: SA boots straight
into davebox (`host/standalone/scripts/launch.sh:61-64`) and the Tools menu shows one entry.
Not davebox-owned today: the schwung splash, boot LEDs, the shadow-UI surfaces behind Shift+Vol
combos, and set selection.

### B2 — Expand chains 4 → 8
`SHADOW_CHAIN_INSTANCES 4` / `SHADOW_UI_SLOTS 4` (`host/src/host/shadow_constants.h:77-78`),
93 usages across 10 C files. Fixed-at-4 beyond the constant:

- **SHM contract** — per-slot arrays in `shadow_ui_state_t` (`host/src/host/shadow_chain_mgmt.c:611-613`);
  `selected_slot` documented "(0-3)". Size change = shim↔shadow_ui contract break (both ship
  together, but a partial deploy would corrupt).
- **Shim audio buffers** — `shadow_slot_deferred[SHADOW_CHAIN_INSTANCES][256]`
  (`host/src/schwung_shim.c:464-469`); static, cheap to grow.
- **Hardcoded 4s in JS** — `for (let i = 0; i < 4; i++)` at `host/src/shadow/shadow_ui.js:6672, 11804, 13712`,
  plus a slot editor assuming Track buttons 1–4. **The hardware has only 4 track buttons**, so slots
  5–8 have no shadow-UI gesture → **Q2**.
- **Persistence** — `shadow_chain_config.json` is parsed with a **4096-byte cap**
  (`host/src/host/shadow_chain_mgmt.c`, `size > 4096` guard); 8 slots will likely exceed it.
- **Free win** — `shadow_chain_slots[i].channel = shadow_chain_parse_channel(1 + i)`
  (`:440`) already gives 8 slots receive channels 1–8, which is B7 almost verbatim.
- **davebox side** — `schSlotsForTrack(t)` (`davebox/ui/ui_corun.mjs:97`) matches by receive channel
  and extends naturally. The slot count **must** be added to `host_build_info()`
  (`host/src/shadow/shadow_ui.c:2109-2127`) with a `SCHWUNG_BUILD_INFO_CONTRACT` bump — a count is
  exactly the class of fact `typeof` cannot probe.

**CPU: unknown, and the instrumentation already exists.** Budget ~900 µs post-transfer
(`host/docs/REALTIME_SAFETY.md:20`), slots render **serially**. Per-slot timers
`spi_slot_render_max/synth_max/fx_max` (`host/src/schwung_shim.c:1751-1753`, published at :8046).
Idle-gate skips render when silent (`:656`, `:1803`), so empty slots cost ~nothing; the risk case is
8 simultaneously-sounding heavy synths. **Do not commit to 8 without the measurement** (P0.1).
No one-way door: old 4-slot configs load unchanged, slots 5–8 just have no saved state.

### B3 — 4 Move-track buses, 4 FX slots + POST insert level
Exists host-side (see finding 1). Param namespace `move_fx:<1-4>:fxN:` / `:volume` / `:send_a` /
`:send_b` (`host/src/shadow/shadow_ui.js:990, 6908-6910`); persistence
`move_fx_<slot>_<block>.json` + `move_fx_meta.json` (`:6849-6926`). Routing gate: a Move track feeds
its bus only when `slot:move_to_slot == 0` ("peel off"), and **the default is 1** — ride the synth
slot (`:1576`, `:4166`).

Work: (a) add the 4 Move buses to davebox's `FX_BUSES` — ⚠ `move_fx:` is a **param-prefix
namespace**, so gate on a new `host_build_info()` field, never `typeof`; (b) volume knob →
`move_fx:N:volume` (level laws centralized in `davebox/ui/ui_engine.mjs:79-110`; note strip volume
is 0..4 vs send return 0..1); (c) default `move_to_slot` to 0 under SA. Not algorithmically hard —
the risk is semantic (**Q8**).

### B4 — volume knob → slot volume; remove the auto-added level
Shipped recently — not greenfield. `SLOT_LEVEL_KEY` and its rationale at
`davebox/ui/ui_engine.mjs:60-79`; the host's injected "Module Level" row was fixed `c88d6976` and
**ear-verified by Josh 08-04** (`_worklogs/OUTSTANDING.md:228-236`); persisted as
`slot_synth_volumes`. Once B3 lands the spec's logic holds. Work: flip `SLOT_LEVEL_KEY` →
`'volume'`, adjust `SLOT_LEVEL_MAX` (fader 0..4 vs synth level 2), and retire the host row —
**migration choice required, Q5**. Removal must not regress the non-davebox shadow-UI path.

### B5 — remove all tools but davebox from the menu
The tools dir is **one directory feeding both hosts** (`/data/UserData/dbx-host/modules` → stock
`modules/`; `host/src/shadow/shadow_ui_tools.mjs:52` hardcodes the stock path). So per-module
`hidden: true` cannot be the lever — it would hide tools from stock too, and third-party tools won't
carry it. Work: a generic config key (e.g. `tools_menu_allowlist` / `exclusive_tool_id`) read by
`scanForToolModules`, default absent = unchanged, written into the dbx tree by the SA installer.
Config-driven keeps host code module-name-free.

### B6 — auto-save host "set" settings
See finding 3. Chain config (`shadow_chain_config.json` — volumes, channels, sends, `move_to_slot`)
saves only at events (`host/src/shadow/shadow_ui.js:3229, 3276, 3694, 15132, 15475`), never
periodically. Work, generic and host-side: dirty-driven save marked on any slot/bus/strip
`shadow_set_param` write, debounced, **run from shadow_ui's JS tick** — a SCHED_OTHER process, so
**no realtime-safety issue arises**; the SPI thread is never involved. Risks: flash write
amplification (debounce on gesture-end, not per knob delta), and the existing "state query timed
out" guard (`:4515`) must keep protecting against saving shim defaults over good files.
⚠ Find out *why* the overtake gate exists before removing it — likely the ~2.6 ms-per-param
round-trip cost measured 07-31; stagger rather than remove.

### B7 — chains 1–8 always receive on channels 1–8
Defaults already do this (`host/src/host/shadow_chain_mgmt.c:440`), but users can change receive
channel per slot, and **patches can override channels** (`shadow_apply_patch_channels`, `:178-202`)
— omit that path and a loaded patch silently re-wires a chain. "Always" reads as hard-force +
hide the rows, which **kills the documented MPE recipe** (Receive=All) → **Q6**.

### B8 + B9 + B10 — set-file rewrite on load / restore on exit; set selection
Building blocks all exist; none of the feature does.

- Sets at `/data/UserData/UserLibrary/Sets/<UUID>/<Name>/Song.abl`
  (`host/src/host/shadow_set_pages.c:338`). The exact fields wanted are known — per-track
  `midiInputMode` (`[N]` = 0-based listen channel) and `midiOutputEndpoint` — and **davebox already
  parses and builds Song.abl for export** (`davebox/ui/ui_export.mjs:93-99, 378-379`), so a
  field-level rewriter is largely written.
- Set identification: shim polls `Settings.json` `currentSongIndex`, matches via the
  `user.song-index` xattr (`host/src/host/shadow_set_pages.c:474-560`).
- **"Set pages" is real and shipped** (`:820-976`): dbus `saveSongIfDirty`, stash whole `Sets/` UUID
  dirs by `rename()` with xattr save/restore and a recovery manifest, rewrite `currentSongIndex`,
  restart Move. `SET_PAGES_TOTAL 8`. This is the precedent for "dbsa has its own sets."
- **Timing is friendly:** Move restarts on both SA entry and exit anyway, so the rewrite fits in
  `launch.sh` before `MoveOriginal` and the restore in the lines after it exits — no extra reload.

**⚠ The spec contains two different designs — Josh must pick (Q4).**
**(A) Rewrite-in-place** (skeleton L16): record the current set's routing, patch, restore on exit.
**(B) SA-owned set library** (L14, set-pages style): never touch user sets — but then B9 ("how do
users select the set") becomes a full davebox set browser, and the current "pick your set before
launching SA" affordance dies.

**Data-loss analysis for (A) — the most dangerous item in the spec:**
1. **Never restore a whole-file backup on exit.** Move saves the set during the session; restoring
   pre-session bytes would erase the user's musical work. Restore must **re-patch only the two
   routing fields** in the *current* file.
2. **Crash / hard reboot → restore never runs**, so stock Move boots with SA routing. Fix: persist a
   `routing_restore_pending.json` (original values + set UUID + hash) and restore opportunistically
   at next launch/exit/heal. This is the **same hazard as the already-open stale `standalone_active`
   item** (`_worklogs/OUTSTANDING.md:99-107`) — solve both with one rule: *liveness from `/dev/shm`,
   intent from `/data`.*
3. If the user edits routing mid-session, blind restore reverts a deliberate change — compare before
   restoring, or accept and document.
4. `Song.abl` can exceed 1 MB. Parse-patch-rewrite just the track objects, atomically
   (`tmp` + `rename`), preserving Move's JSON exactly elsewhere — a serializer diff Move rejects
   makes the set **unloadable**. Keep a per-session forensic backup (not for restore).
5. Firmware schema drift is unknown: validate expected fields before patching, abort to
   "launch without rewrite" on surprise.

Layer: a small script/C helper invoked from `launch.sh` (runs as ableton, files under `/data` — no
privilege problem). Not the shim (realtime), not shadow_ui (not running at that moment).

### B11 — splash replacement + "Schwung base: x.x.x", persists until davebox loads
Schwung splash at `host/src/shadow/shadow_ui.js:507-575`, ends after `SPLASH_TOTAL_TICKS` **or any
button press** (`:16351-16353`). davebox's randomized splash is module-side
(`davebox/ui/ui_splash.mjs`; drawn `ui_render.mjs:787-830`, with precedent for text over artwork —
the HOST TOO OLD notice at `:814`). Work, generic: config-driven splash override (a directory of
packed 128×64 bitmaps) + footer template, and **hold the splash while a `boot_tool.json` launch is
pending** rather than fixed ticks. SA installer ships davebox's frames into that config dir — no
module named in host code. ⚠ "Schwung base" implies the *upstream* tag, which needs a build-time
stamp of the rebase base → **Q9**.

### B12 — suppress LEDs / loading animation before davebox loads
Nothing suppresses Move's boot LED paint today; overtake clears LEDs only at module entry, leaving
several seconds of Move-native pads. Work, shim-level and generic: while a boot-tool launch is
pending (the shim already knows — it raises `open_tool_cmd` from `boot_tool.json`), filter cable-0
LED traffic the way `overtake_suppress_sysex` already does. An extension of an existing mechanism,
not a new one. ⚠ ~64-packet/frame LED buffer limit applies to any animation. Cosmetic failure modes
only — lowest risk item in the spec.

### B13 — bake in settings, remove from menu
"Move > schwung" = `link_audio_routing`, "Schwung > link" = `link_audio_publish`, both rows at
`host/src/shadow/shadow_ui.js:1073-1074`; flags parse from `config/features.json`
(`host/src/schwung_shim.c:928-1100`; ⚠ `link_audio_enabled` **defaults false** at :980-990, so
"always on" changes an effective default). Work: a generic pinned/forced-settings map the SA
installer writes; shadow_ui hides pinned rows.

⚠ Forcing Move→Schwung ON means `rebuild_from_la` runs whenever LA delivers, permanently engaging
latency comp and its known artifacts. It degrades safely (starve → native path that frame,
`host/src/schwung_shim.c:2270-2278`) but it is a **behavioral commitment**, not just a toggle.

**"Move co-run, track buttons" — RESOLVED 08-04, and it is NOT a settings item.** Josh: co-run is how
davebox cedes parts of the device to Move native so users can play the Move instruments. Today the
**track buttons (CC 40-43, left of the pad grid) are ceded to Move**; he wants **davebox to KEEP
them**, reverting to the function and lighting they have outside co-run in track view. This belongs
with the input-ownership work (B15), not with the baked-in settings.

⭑ **Good news: the mechanism already exists and this is davebox-side only — no host change.** The
host splits **LED** ownership from **input** ownership, and davebox already uses that split: it
**keeps TRACK for LEDs** (`DAVEBOX_CORUN_LED_KEEP_MASK`, painting the buttons as a paired-track
indicator) while deliberately **ceding the presses** — `davebox/ui/ui_corun.mjs:44-50`. The change is
to add `CORUN_GRP_TRACK` to the **input** keep mask (`DAVEBOX_CORUN_KEEP_MASK`, `:33`).

⚠⚠ **Terminology trap — CC 40-43 are CLIP buttons in davebox, not track buttons** (Josh, 08-04,
correcting me twice). *"Side buttons — switch clips on the active track"* (`davebox/MANUAL-SA.md:213,
337`), and davebox has **no dedicated track buttons at all** (`:235`). `ui_corun.mjs:38` already calls
them "the side clip buttons". The host constant `CORUN_GRP_TRACK_BUTTONS` describes what **Move** does
with them once ceded — that name is what made the wrong reading tempting.

**So the ask is small and self-contained:** in co-run the side buttons resume davebox's track-view
behaviour — **selecting clips**, with clip LED semantics (off = empty, dim = holds notes, solid =
current; `MANUAL-SA.md:1386`) and the modifier gestures Copy + side / Delete + side / Shift+Delete +
side (`:345-347`). davebox already owns their LEDs; this adds the input.

✅ **Move-instrument selection is unaffected — it was never these buttons' job.** davebox already
flips Move to the instrument the active davebox track routes to: `enterMoveNativeCoRun(t)` injects a
cable-0 tap via `move_midi_inject_to_move`, handling Move's reversed CC mapping
(`ui_corun.mjs:213-245`).
⚠ Carry into implementation: that injection **needs its ~12-tick defer**
(`S.pendingMoveCoRunInject = 12`) or Move's repaint lands before co-run's LED passthrough is live and
is stripped.

### B14 — "Suspend to Move" button; remove hold-Back
Hold-Back suspend is davebox-side: `checkBackHold()` (`davebox/ui/ui_tick.mjs:302`) firing the
self-managed suspend at `:1817-1827`. The global menu already carries Quit
(`davebox/ui/ui_menu.mjs:303-318`). Work: davebox-only — add a Suspend action calling the same path,
disable `checkBackHold`. ⚠ Decide what plain Back then does at home (`ui_tick.mjs:1451` is
entangled) → **Q10**. Watch the co-run back-ownership matrix (`CORUN_F_OWN_BACK`).

### B15 — document host-claimed inputs
Documentation task, concrete source list: Shift+Vol combos and long-press table (host `CLAUDE.md`
Shadow Mode → Shortcuts), Mute combos (slot mute/solo/bypass), Shift+Sample / Shift+Capture,
set-pages Shift+Vol+Left/Right, CC 79 (`vol_block`), edit-CC claim (`edit_cc_block`), `pad_block`,
co-run group routing (`CORUN_GRP_*`). Deliverable: a table mapping each claim →
**keep / cede-to-davebox / retire-under-SA**, which then feeds B5 and B13.
⭑ **Do this early — it is the cheap survey that de-risks "davebox controls everything."**

---

## Dependency-ordered plan

```
Phase 0 — measure & decide (nothing ships)
  P0.1  CPU: 4 heavy synths → read spi_slot_synth_max, extrapolate ×2 vs 900µs   [gates B2]
  P0.2  B15 input-claims survey (doc)                                            [feeds B5/B13/B14]
  P0.3  Josh answers Q1–Q10

Phase 1 — the routing/audio model, at today's 4 chains (first shippable increment)
  1a  B13: pin Move->Schwung + Schwung->Link on (config-driven)                  [unblocks 1b]
  1b  B3: move_to_slot default 0; davebox exposes move_fx buses;
          volume knob -> move_fx:N:volume                                        [needs 1a + contract bump]
  1c  B4: SLOT_LEVEL_KEY -> 'volume'; retire Module Level per Q5                 [needs 1b]
  1d  B8/B10: Song.abl rewrite in launch.sh + field-restore on exit +
          crash-pending marker (fix stale standalone_active in the same pass)    [independent; highest care]
  1e  B6: dirty-driven autosave during overtake                                  [independent]

  Exit criteria: load any set, launch dAVEBOx, get correct wiring with zero
  manual setup, work, exit — and the set is byte-honest again.

Phase 2 — capacity
  2a  B2: 4->8 (constants, SHM arrays, 4096-byte config cap, JS loops,
          host_build_info slot count + contract bump, davebox 8-slot awareness)  [gated by P0.1]
  2b  B7: fixed channels per Q6                                                  [needs 2a]

Phase 3 — boot experience & UI ownership
  3a  B11 splash override + version footer + persist-until-loaded
  3b  B12 boot LED suppression / loading animation
  3c  B5 tools-menu allowlist
  3d  B14 Suspend-to-Move + remove hold-Back
  3e  B9 set-selection UX (only if Q4 = design B; otherwise a doc note)
```

**Why Phase 1 first:** it delivers the conceptual promise — Move instruments on their own path, one
coherent level model, sets that wire themselves — at today's capacity, entirely on measured existing
mechanisms. Phase 2 is the only item with unresolved feasibility.

---

## Risk register (worst first)

1. **Song.abl rewrite corrupts or reverts user sets** (B8/B10). Whole-file restore destroys session
   work; a malformed patch makes the set unloadable. → field-level patch, atomic rename, schema
   validation with abort-to-no-rewrite, pending-restore marker, forensic backup.
2. **8 chains overruns the ~900 µs serial budget** → device-wide dropouts, worst with Move→Schwung
   forced on (the rebuild path adds work in the same window). → measure first; idle gates help but
   don't bound the worst case.
3. **Crash/hard-reboot leaves persistent intent markers** (routing-restore, and the already-open
   stale `standalone_active`) → stock misbehaves afterwards. → liveness from `/dev/shm`, intent from
   `/data`, one shared recovery pass.
4. **Baking Move→Schwung ON commits all Move audio to the LA round-trip** — latency-comp artifacts,
   sidecar starvation fallbacks, CPU. Needs a soak test, not just a toggle.
5. **B4 migration:** persisted `slot_synth_volumes ≠ 1.0` become invisible, uneditable gain once the
   row is gone; session loudness changes. → Q5.
6. **SHM contract skew during the 4→8 deploy** → corrupt UI state. → size both halves from the
   shared macro; the one-command install already ships pairs.
7. **Autosave write amplification / saving defaults over good state** (B6). → debounce on quiet,
   keep the existing timeout-skip guard.
8. **Rebase-delta growth** — every host change adds to the fork's 84-ahead delta. → keep each change
   config-driven and generic.
9. **Fixed channels kill the MPE recipe** (Receive=All) — small user set, silent regression. → Q6.

---

## Open questions for Josh

Each is phrased so a one-line answer unblocks it.

| # | Question | Blocks |
|---|---|---|
| ~~**Q1**~~ | ✅ **ANSWERED 08-04.** Co-run = how davebox cedes parts of the device to Move native so users can play the Move instruments. Today the **track buttons (CC 40-43) are ceded**; Josh wants **davebox to KEEP them**, reverting to the function + lighting they have outside co-run in track view. ⭑ Not a settings item — it belongs with B14/B15, not B13. See revised B13. | B13→B15 |
| **Q2** | With 8 chains, do slots 5–8 need any shadow-UI/hardware access (there are only 4 track buttons), or is davebox their only UI? | B2 |
| ~~**Q3**~~ | ✅ **ANSWERED 08-04: "capacity, budget shared."** Ship 8 slots and document that heavy synths share the ~900 µs budget; 8 simultaneous heavy synths need not be guaranteed. The P0.1 measurement is now for *documenting headroom*, not for gating the expansion. | ~~B2~~ |
| ~~**Q4**~~ | ⚠ **RE-ANSWERED 08-06: DESIGN B** — SA has its own set library, separate from native; native sets never rewritten (the 08-04 "C1" answer was superseded in a later unrecorded session; recorded 08-06). C1's confirmation/archive/restore machinery dissolves; B9 (set-selection UX inside davebox) becomes real work. See the superseded banner in [`DBSA_SET_MODEL.md`](DBSA_SET_MODEL.md). | B8/B9/B10 |
| **Q5** | When Module Level goes away, what happens to saved non-unity `slot_synth_volumes` — reset to unity, fold into slot volume once, or keep the gain and just stop surfacing it? | B4 |
| **Q6** | "Chains always receive 1-8": hard-force and remove the rows (killing the Receive=All MPE recipe), or force defaults but leave the setting reachable? | B7 |
| **Q7** | Confirm the Move-bus level stays post-insert-FX (current code is post). | B3 |
| **Q8** | May Phase 1 change the default `move_to_slot` to 0 for existing SA sessions (Move audio leaves the synth slots' FX/sends), or does that need a migration prompt? | B3 |
| **Q9** | "Schwung base: x.x.x" — the fork's own version, or the upstream tag it's rebased on (the latter needs a build-time stamp)? | B11 |
| **Q10** | After hold-Back is removed, what does a plain Back tap do at davebox's home screen — nothing, or also suspend? | B14 |

---

## Critical files

| File | Why |
|---|---|
| `host/src/schwung_shim.c` | mix paths, `rebuild_from_la`, Move FX bus, feature flags, boot |
| `host/src/host/shadow_constants.h`, `shadow_chain_mgmt.h` | slot counts, SHM structs, contract version |
| `host/src/shadow/shadow_ui.js` | autosave, settings rows, persistence, splash, 4-slot loops |
| `host/standalone/scripts/launch.sh` | set rewrite/restore insertion points |
| `davebox/ui/ui_sound.mjs`, `ui_engine.mjs` | `FX_BUSES`, `SLOT_LEVEL_KEY`, volume-knob mapping |
